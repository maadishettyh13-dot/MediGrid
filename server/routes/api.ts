import { Router } from 'express';
import { db } from '../db/database.ts';
import { seedDatabaseIfEmpty } from '../db/seed.ts';
import { instanceManager } from '../infrastructure/instanceManager.ts';
import { rabbitmqBroker } from '../infrastructure/rabbitmqBroker.ts';
import { redisCoordinator } from '../infrastructure/redisCoordinator.ts';
import {
  addHospitalBeds,
  admitWalkInPatient,
  confirmReservationAdmission,
  createEmergencyRequest,
  dischargeByBedOrPatient,
  expireReservationById,
  getHospitalIndividualBeds,
  getSnapshot,
  reserveBedAtomically,
  searchNearbyHospitals,
} from '../services/emergencyService.ts';
import {
  acceptTransfer,
  compensateRejectOrCancelTransfer,
  completeTransfer,
  createTransferRequest,
  markTransferInTransit,
} from '../services/transferService.ts';
import { runSimulationScenario } from '../services/simulationService.ts';
import { websocketHub } from '../services/websocketHub.ts';
import { BedType, EmergencyPriority, User } from '../../src/types/medilink.ts';

export const apiRouter = Router();

apiRouter.use((_req, res, next) => {
  const inst = instanceManager.routeRequest();
  res.setHeader('X-MediGrid-Instance', inst.id);
  next();
});

apiRouter.post('/auth/login', (req, res) => {
  const { email, password, role } = req.body as { email?: string; password?: string; role?: string };

  let user: (User & { password_hash?: string }) | undefined;
  if (email) {
    user = db.prepare(`SELECT * FROM Users WHERE LOWER(email) = LOWER(?)`).get(email) as User & { password_hash?: string };
  } else if (role) {
    user = db.prepare(`SELECT * FROM Users WHERE role = ? LIMIT 1`).get(role) as User & { password_hash?: string };
  }

  if (!user) {
    res.status(401).json({ error: 'Invalid credentials or user role not found.' });
    return;
  }

  if (password && user.password_hash && password !== user.password_hash) {
    res.status(401).json({ error: 'Incorrect password. Demo accounts use "demo123".' });
    return;
  }

  const safeUser: User = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    hospital_id: user.hospital_id,
    ambulance_id: user.ambulance_id,
  };

  res.json({ user: safeUser });
});

apiRouter.get('/snapshot', (_req, res) => {
  res.json(getSnapshot());
});

apiRouter.get('/hospitals/:id/beds', (req, res) => {
  const beds = getHospitalIndividualBeds(req.params.id);
  res.json({ beds });
});

apiRouter.post('/hospitals/:id/beds/add', (req, res) => {
  const { bedType, count, actor } = req.body as { bedType: BedType; count: number; actor?: string };
  const result = addHospitalBeds({
    hospitalId: req.params.id,
    bedType,
    count: Number(count || 1),
    actor: actor || 'Hospital Staff',
  });
  if (!result.ok) {
    res.status(400).json({ error: result.message });
    return;
  }
  res.json({ ok: true, added: result.added, beds: getHospitalIndividualBeds(req.params.id), snapshot: getSnapshot() });
});

apiRouter.get('/hospitals/search', (req, res) => {
  const lat = Number(req.query.lat ?? 17.4239);
  const lng = Number(req.query.lng ?? 78.4738);
  const bedType = (req.query.bedType as BedType) || 'ICU';
  const priority = (req.query.priority as EmergencyPriority) || 'CRITICAL';

  const result = searchNearbyHospitals({
    latitude: Number.isFinite(lat) ? lat : 17.4239,
    longitude: Number.isFinite(lng) ? lng : 78.4738,
    bedType,
    priority,
    actor: String(req.query.actor || 'dispatcher'),
  });

  if (!result.ok) {
    res.status(result.status).json({ error: result.message, code: result.code });
    return;
  }

  res.json({ hospitals: result.hospitals });
});

apiRouter.post('/requests', (req, res) => {
  const body = req.body as {
    patientId?: string;
    patientName: string;
    age?: number;
    condition: string;
    priority: EmergencyPriority;
    requiredBedType: BedType;
    ambulanceId: string;
    latitude: number;
    longitude: number;
    locationLabel: string;
    actor?: string;
  };

  if (!body.patientName || !body.condition || !body.ambulanceId) {
    res.status(400).json({ error: 'Patient identifier, condition, and ambulance unit are required.' });
    return;
  }

  const created = createEmergencyRequest({
    ...body,
    actor: body.actor || 'Ambulance Dispatcher',
  });
  res.status(201).json({ request: created, snapshot: getSnapshot() });
});

apiRouter.post('/reservations', (req, res) => {
  const body = req.body as {
    hospitalId: string;
    bedType: BedType;
    preferredBedId?: string;
    patientId: string;
    ambulanceId?: string | null;
    requestId?: string | null;
    priority: EmergencyPriority;
    actor?: string;
  };

  if (!body.hospitalId || !body.bedType || !body.patientId) {
    res.status(400).json({ error: 'hospitalId, bedType, and patientId are required.' });
    return;
  }

  const result = reserveBedAtomically({
    hospitalId: body.hospitalId,
    bedType: body.bedType,
    preferredBedId: body.preferredBedId,
    patientId: body.patientId,
    ambulanceId: body.ambulanceId,
    requestId: body.requestId,
    priority: body.priority || 'HIGH',
    actor: body.actor || 'Dispatcher',
  });

  if (!result.ok) {
    res.status(result.status).json({ error: result.message, code: result.code });
    return;
  }

  res.status(201).json({ reservation: result.reservation, snapshot: getSnapshot() });
});

apiRouter.post('/reservations/:id/confirm', (req, res) => {
  const { actor } = req.body as { actor?: string };
  const result = confirmReservationAdmission({
    reservationId: req.params.id,
    actor: actor || 'Hospital Staff',
  });

  if (!result.ok) {
    res.status(result.status).json({ error: result.message, code: result.code });
    return;
  }
  res.json({ ok: true, message: result.message, snapshot: getSnapshot() });
});

apiRouter.post('/reservations/:id/expire-now', (req, res) => {
  const expired = expireReservationById(req.params.id);
  if (!expired) {
    res.status(404).json({ error: 'Active reservation not found.' });
    return;
  }
  res.json({ ok: true, snapshot: getSnapshot() });
});

apiRouter.post('/hospitals/:id/admit', (req, res) => {
  const body = req.body as {
    bedType: BedType;
    preferredBedId?: string;
    patientName: string;
    age?: number;
    condition: string;
    priority: EmergencyPriority;
    actor?: string;
  };

  if (!body.patientName || !body.condition || !body.bedType) {
    res.status(400).json({ error: 'Patient name, condition, and bed type are required.' });
    return;
  }

  const result = admitWalkInPatient({
    hospitalId: req.params.id,
    bedType: body.bedType,
    preferredBedId: body.preferredBedId,
    patientName: body.patientName,
    age: Number(body.age || 48),
    condition: body.condition,
    priority: body.priority || 'HIGH',
    actor: body.actor || 'Hospital Staff',
  });

  if (!result.ok) {
    res.status(409).json({ error: result.message });
    return;
  }
  res.status(201).json({
    patient: result.patient,
    bedId: result.bedId,
    beds: getHospitalIndividualBeds(req.params.id),
    snapshot: getSnapshot(),
  });
});

apiRouter.post('/patients/:id/discharge', (req, res) => {
  const { actor } = req.body as { actor?: string };
  const result = dischargeByBedOrPatient({ patientId: req.params.id, actor: actor || 'Hospital Staff' });
  if (!result.ok) {
    res.status(409).json({ error: result.message });
    return;
  }
  res.json({ ok: true, message: result.message, snapshot: getSnapshot() });
});

apiRouter.post('/beds/:bedId/discharge', (req, res) => {
  const { actor } = req.body as { actor?: string };
  const result = dischargeByBedOrPatient({ bedId: req.params.bedId, actor: actor || 'Hospital Staff' });
  if (!result.ok) {
    res.status(409).json({ error: result.message });
    return;
  }
  res.json({ ok: true, message: result.message, snapshot: getSnapshot() });
});

apiRouter.post('/transfers', (req, res) => {
  const body = req.body as {
    patientId: string;
    fromHospitalId: string;
    toHospitalId: string;
    requiredBedType: BedType;
    priority: EmergencyPriority;
    reason: string;
    actor?: string;
  };

  if (!body.patientId || !body.fromHospitalId || !body.toHospitalId || !body.reason) {
    res.status(400).json({ error: 'Patient, origin hospital, receiving hospital, and clinical reason are required.' });
    return;
  }

  const result = createTransferRequest({
    ...body,
    actor: body.actor || 'Transfer Coordinator',
  });

  if (!result.ok) {
    res.status(409).json({ error: result.message });
    return;
  }
  res.status(201).json({ transfer: result.transfer, snapshot: getSnapshot() });
});

apiRouter.post('/transfers/:id/accept', (req, res) => {
  const { actor } = req.body as { actor?: string };
  const result = acceptTransfer(req.params.id, actor || 'Receiving Hospital Staff');
  if (!result.ok) {
    res.status(409).json({ error: result.message });
    return;
  }
  res.json({ ok: true, snapshot: getSnapshot() });
});

apiRouter.post('/transfers/:id/transit', (req, res) => {
  const { actor } = req.body as { actor?: string };
  const result = markTransferInTransit(req.params.id, actor || 'Ambulance Crew');
  if (!result.ok) {
    res.status(409).json({ error: result.message });
    return;
  }
  res.json({ ok: true, snapshot: getSnapshot() });
});

apiRouter.post('/transfers/:id/complete', (req, res) => {
  const { actor } = req.body as { actor?: string };
  const result = completeTransfer(req.params.id, actor || 'Receiving Hospital Staff');
  if (!result.ok) {
    res.status(409).json({ error: result.message });
    return;
  }
  res.json({ ok: true, snapshot: getSnapshot() });
});

apiRouter.post('/transfers/:id/reject', (req, res) => {
  const { reason, actor } = req.body as { reason?: string; actor?: string };
  const result = compensateRejectOrCancelTransfer({
    transferId: req.params.id,
    targetStatus: 'REJECTED',
    reason,
    actor: actor || 'Receiving Hospital Staff',
  });
  if (!result.ok) {
    res.status(409).json({ error: result.message });
    return;
  }
  res.json({ ok: true, snapshot: getSnapshot() });
});

apiRouter.post('/transfers/:id/cancel', (req, res) => {
  const { reason, actor } = req.body as { reason?: string; actor?: string };
  const result = compensateRejectOrCancelTransfer({
    transferId: req.params.id,
    targetStatus: 'CANCELLED',
    reason,
    actor: actor || 'Transfer Coordinator',
  });
  if (!result.ok) {
    res.status(409).json({ error: result.message });
    return;
  }
  res.json({ ok: true, snapshot: getSnapshot() });
});

apiRouter.get('/monitoring/events', (_req, res) => {
  res.json({
    dlq: rabbitmqBroker.getDeadLetterEvents(50),
    recent: rabbitmqBroker.getRecentEvents(40),
  });
});

apiRouter.post('/monitoring/dlq/:id/replay', (req, res) => {
  const result = rabbitmqBroker.replayDeadLetterEvent(req.params.id);
  if (!result.ok) {
    res.status(400).json({ error: result.message });
    return;
  }
  websocketHub.broadcast('SNAPSHOT_UPDATED', { trigger: 'DLQ_REPLAY', event_id: req.params.id });
  res.json({ ok: true, message: result.message, snapshot: getSnapshot() });
});

apiRouter.post('/monitoring/dlq/inject-poison', async (_req, res) => {
  const id = rabbitmqBroker.publishDurableToDisk({
    eventType: 'PoisonClinicalPayload',
    queueName: 'notification_queue',
    priority: 5,
    maxRetries: 1,
    payload: {
      title: 'Malformed Clinical Event',
      message: 'Routed to Dead-Letter Queue after exhausting retries.',
      forceDeadLetter: true,
    },
  });
  for (let i = 0; i < 3; i++) {
    db.prepare(`UPDATE Events SET next_retry_at = NULL WHERE id = ?`).run(id);
    await rabbitmqBroker.drainQueues(10);
  }
  websocketHub.broadcast('SNAPSHOT_UPDATED', { trigger: 'DLQ_INJECTED' });
  res.json({ ok: true, eventId: id, snapshot: getSnapshot() });
});

apiRouter.post('/monitoring/controls/redis', (req, res) => {
  const { connected } = req.body as { connected: boolean };
  redisCoordinator.setOutage(!connected);
  websocketHub.broadcast('METRICS_UPDATED', { redis: connected });
  res.json({ ok: true, snapshot: getSnapshot() });
});

apiRouter.post('/monitoring/controls/rabbitmq', (req, res) => {
  const { connected } = req.body as { connected: boolean };
  rabbitmqBroker.setConnected(Boolean(connected));
  websocketHub.broadcast('METRICS_UPDATED', { rabbitmq: connected });
  res.json({ ok: true, snapshot: getSnapshot() });
});

apiRouter.post('/monitoring/controls/pause-consumer', (req, res) => {
  const { paused } = req.body as { paused: boolean };
  rabbitmqBroker.setConsumerPaused(Boolean(paused));
  websocketHub.broadcast('METRICS_UPDATED', { paused });
  res.json({ ok: true, snapshot: getSnapshot() });
});

apiRouter.post('/monitoring/controls/fail-consumer', (req, res) => {
  const { fail } = req.body as { fail: boolean };
  rabbitmqBroker.setFailConsumerMode(Boolean(fail));
  websocketHub.broadcast('METRICS_UPDATED', { failConsumer: fail });
  res.json({ ok: true, snapshot: getSnapshot() });
});

apiRouter.post('/monitoring/controls/instance', (req, res) => {
  const { instanceId, status } = req.body as { instanceId: string; status: 'ACTIVE' | 'STOPPED' };
  const result = instanceManager.setInstanceStatus(instanceId, status);
  if (!result.ok) {
    res.status(409).json({ error: result.message });
    return;
  }
  websocketHub.broadcast('METRICS_UPDATED', { instanceId, status });
  res.json({ ok: true, message: result.message, snapshot: getSnapshot() });
});

apiRouter.post('/simulations/run', async (req, res) => {
  const { scenario } = req.body as { scenario: string };
  if (!scenario) {
    res.status(400).json({ error: 'Simulation scenario is required.' });
    return;
  }
  const result = await runSimulationScenario(scenario);
  res.json({ result, snapshot: getSnapshot() });
});

apiRouter.post('/simulations/reset', (_req, res) => {
  db.exec(`
    DELETE FROM AuditLogs;
    DELETE FROM OutboxEvents;
    DELETE FROM ProcessedEvents;
    DELETE FROM Events;
    DELETE FROM TransferRequests;
    DELETE FROM BedReservations;
    DELETE FROM EmergencyRequests;
    DELETE FROM Ambulances;
    DELETE FROM Patients;
    DELETE FROM Beds;
    DELETE FROM Hospitals;
    DELETE FROM Users;
  `);
  seedDatabaseIfEmpty();
  redisCoordinator.setOutage(false);
  redisCoordinator.syncFromDatabase();
  rabbitmqBroker.setFailConsumerMode(false);
  rabbitmqBroker.setConsumerPaused(false);
  rabbitmqBroker.setConnected(true);
  instanceManager.setInstanceStatus('instance-alpha', 'ACTIVE');
  instanceManager.setInstanceStatus('instance-beta', 'ACTIVE');
  websocketHub.broadcast('SNAPSHOT_UPDATED', { trigger: 'SYSTEM_RESET' });
  res.json({ ok: true, snapshot: getSnapshot() });
});
