import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database.ts';
import { redisCoordinator } from '../infrastructure/redisCoordinator.ts';
import { rabbitmqBroker } from '../infrastructure/rabbitmqBroker.ts';
import { instanceManager } from '../infrastructure/instanceManager.ts';
import { websocketHub } from './websocketHub.ts';
import {
  Ambulance,
  AuditLog,
  BedRecord,
  BedReservation,
  BedType,
  DashboardSnapshot,
  EmergencyPriority,
  EmergencyRequest,
  Hospital,
  HospitalBedSummary,
  Patient,
  TransferRequest,
} from '../../src/types/medilink.ts';

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(2));
}

function priorityScore(p: EmergencyPriority): number {
  if (p === 'CRITICAL') return 10;
  if (p === 'HIGH') return 5;
  return 1;
}

function insertOutbox(params: {
  eventId?: string;
  eventType: string;
  queueName: 'bed_tracking_queue' | 'notification_queue' | 'audit_queue' | 'transfer_saga_queue';
  priority: number;
  patientId?: string | null;
  hospitalId?: string | null;
  bedId?: string | null;
  sequenceNumber?: number | null;
  payload: Record<string, unknown>;
}): string {
  const id = params.eventId || uuidv4();
  db.prepare(`
    INSERT INTO OutboxEvents (id, event_type, queue_name, priority, patient_id, hospital_id, bed_id, sequence_number, payload, published, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
  `).run(
    id,
    params.eventType,
    params.queueName,
    params.priority,
    params.patientId ?? null,
    params.hospitalId ?? null,
    params.bedId ?? null,
    params.sequenceNumber ?? null,
    JSON.stringify(params.payload),
    new Date().toISOString()
  );
  return id;
}

export function getHospitalsWithBeds(): Hospital[] {
  const hospitals = db.prepare(`SELECT * FROM Hospitals ORDER BY id ASC`).all() as Array<
    Omit<Hospital, 'beds' | 'total_capacity' | 'available_total' | 'occupied_total' | 'reserved_total'>
  >;

  const aggRows = db.prepare(`
    SELECT
      hospital_id,
      bed_type,
      COUNT(*) as total_beds,
      SUM(CASE WHEN status = 'AVAILABLE' THEN 1 ELSE 0 END) as available_beds,
      SUM(CASE WHEN status = 'OCCUPIED' THEN 1 ELSE 0 END) as occupied_beds,
      SUM(CASE WHEN status = 'RESERVED' THEN 1 ELSE 0 END) as reserved_beds
    FROM Beds
    GROUP BY hospital_id, bed_type
  `).all() as Array<HospitalBedSummary & { hospital_id: string }>;

  const aggMap = new Map<string, HospitalBedSummary[]>();
  for (const r of aggRows) {
    const arr = aggMap.get(r.hospital_id) ?? [];
    arr.push({
      bed_type: r.bed_type,
      total_beds: r.total_beds,
      available_beds: r.available_beds,
      occupied_beds: r.occupied_beds,
      reserved_beds: r.reserved_beds,
    });
    aggMap.set(r.hospital_id, arr);
  }

  return hospitals.map((h) => {
    const beds = aggMap.get(h.id) ?? [];
    const total_capacity = beds.reduce((s, b) => s + b.total_beds, 0);
    const available_total = beds.reduce((s, b) => s + b.available_beds, 0);
    const occupied_total = beds.reduce((s, b) => s + b.occupied_beds, 0);
    const reserved_total = beds.reduce((s, b) => s + b.reserved_beds, 0);
    return {
      ...h,
      beds,
      total_capacity,
      available_total,
      occupied_total,
      reserved_total,
    };
  });
}

export function getHospitalIndividualBeds(hospitalId: string): BedRecord[] {
  return db.prepare(`
    SELECT b.*, p.name as patient_name
    FROM Beds b
    LEFT JOIN Patients p ON p.id = b.patient_id
    WHERE b.hospital_id = ?
    ORDER BY b.bed_type ASC, b.id ASC
  `).all(hospitalId) as BedRecord[];
}

export function getSnapshot(): DashboardSnapshot {
  const hospitals = getHospitalsWithBeds();
  const ambulances = db.prepare(`SELECT * FROM Ambulances ORDER BY call_sign ASC`).all() as Ambulance[];
  const reservations = db.prepare(`
    SELECT r.*, h.name as hospital_name, p.name as patient_name, a.call_sign as ambulance_call_sign
    FROM BedReservations r
    LEFT JOIN Hospitals h ON h.id = r.hospital_id
    LEFT JOIN Patients p ON p.id = r.patient_id
    LEFT JOIN Ambulances a ON a.id = r.ambulance_id
    ORDER BY r.created_at DESC
    LIMIT 100
  `).all() as BedReservation[];

  const requests = db.prepare(`
    SELECT er.*, a.call_sign as ambulance_call_sign, h.name as assigned_hospital_name
    FROM EmergencyRequests er
    LEFT JOIN Ambulances a ON a.id = er.ambulance_id
    LEFT JOIN Hospitals h ON h.id = er.assigned_hospital_id
    ORDER BY
      CASE er.priority WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 ELSE 3 END,
      er.created_at DESC
    LIMIT 100
  `).all() as EmergencyRequest[];

  const transfers = db.prepare(`
    SELECT t.*, fh.name as from_hospital_name, th.name as to_hospital_name
    FROM TransferRequests t
    JOIN Hospitals fh ON fh.id = t.from_hospital_id
    JOIN Hospitals th ON th.id = t.to_hospital_id
    ORDER BY t.created_at DESC
    LIMIT 60
  `).all() as TransferRequest[];

  const patients = db.prepare(`SELECT * FROM Patients ORDER BY updated_at DESC LIMIT 120`).all() as Patient[];

  const rawLogs = db.prepare(`
    SELECT al.*, h.name as hospital_name
    FROM AuditLogs al
    LEFT JOIN Hospitals h ON h.id = al.hospital_id
    ORDER BY al.created_at DESC
    LIMIT 60
  `).all() as Array<Omit<AuditLog, 'metadata'> & { metadata: string }>;

  const auditLogs: AuditLog[] = rawLogs.map((l) => ({
    ...l,
    metadata: JSON.parse(l.metadata || '{}'),
  }));

  let total_beds = 0;
  let available_beds = 0;
  let occupied_beds = 0;
  let reserved_beds = 0;
  let icu_available = 0;
  let ventilator_available = 0;
  let general_available = 0;

  for (const h of hospitals) {
    total_beds += h.total_capacity;
    available_beds += h.available_total;
    occupied_beds += h.occupied_total;
    reserved_beds += h.reserved_total;
    for (const b of h.beds) {
      if (b.bed_type === 'ICU') icu_available += b.available_beds;
      if (b.bed_type === 'VENTILATOR') ventilator_available += b.available_beds;
      if (b.bed_type === 'GENERAL') general_available += b.available_beds;
    }
  }

  const rmq = rabbitmqBroker.getTelemetry();
  const redis = redisCoordinator.getTelemetry();

  return {
    hospitals,
    ambulances,
    reservations,
    requests,
    transfers,
    patients,
    auditLogs,
    metrics: {
      redis,
      rabbitmq: {
        connected: rmq.connected,
        consumer_paused: rmq.consumer_paused,
        events_per_sec: rmq.events_per_sec,
        total_published: rmq.total_published,
        total_acked: rmq.total_acked,
        queue_depths: rmq.queue_depths,
        pending_messages: rmq.pending_messages,
        consumer_lag_ms: rmq.consumer_lag_ms,
        consumer_failures: rmq.consumer_failures,
        retry_count: rmq.retry_count,
        dlq_count: rmq.dlq_count,
        outbox_pending: rmq.outbox_pending,
        duplicate_events_prevented: rmq.duplicate_events_prevented,
        out_of_order_blocked: rmq.out_of_order_blocked,
        fail_consumer_mode: rmq.fail_consumer_mode,
      },
      instances: instanceManager.getInstances(),
      ws_clients: websocketHub.getClientCount(),
      throughput_history: rmq.throughput_history,
    },
    activeInstance: instanceManager.getActiveInstanceLabel(),
    networkTotals: {
      total_hospitals: hospitals.length,
      total_beds,
      available_beds,
      occupied_beds,
      reserved_beds,
      icu_available,
      ventilator_available,
      general_available,
    },
  };
}

export function searchNearbyHospitals(params: {
  latitude: number;
  longitude: number;
  bedType: BedType;
  priority: EmergencyPriority;
  actor?: string;
}): { ok: true; hospitals: Hospital[] } | { ok: false; code: string; message: string; status: number } {
  if (!redisCoordinator.checkRateLimit(`search:${params.actor || 'dispatcher'}`, 200, 10_000)) {
    return {
      ok: false,
      code: 'RATE_LIMITED',
      message: 'Rate limit exceeded for bed search requests. Wait a few seconds and retry.',
      status: 429,
    };
  }

  const t0 = performance.now();
  const hospitals = getHospitalsWithBeds();
  const suitable: Hospital[] = [];

  for (const h of hospitals) {
    if (h.status === 'OFFLINE') continue;

    const cached = redisCoordinator.isConnected()
      ? redisCoordinator.getFastSummary(h.id, params.bedType)
      : null;
    const dbBed = h.beds.find((b) => b.bed_type === params.bedType);
    const availableCount = cached ? cached.available_beds : (dbBed?.available_beds ?? 0);

    // Never show a hospital as available if its last suitable bed has already been reserved
    if (availableCount <= 0) continue;

    const dist = haversineKm(params.latitude, params.longitude, h.latitude, h.longitude);
    const score = Number((availableCount * 2.0 - dist * 2.2 + (h.status === 'OPERATIONAL' ? 5 : 0)).toFixed(2));
    suitable.push({
      ...h,
      distance_km: dist,
      suitability_score: score,
    });
  }

  suitable.sort((a, b) => (a.distance_km ?? 999) - (b.distance_km ?? 999));
  redisCoordinator.recordLookupLatency(performance.now() - t0);
  return { ok: true, hospitals: suitable };
}

export function createEmergencyRequest(input: {
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
  actor: string;
}): EmergencyRequest {
  const nowIso = new Date().toISOString();
  const patientId = input.patientId?.trim() || `PAT-${uuidv4().slice(0, 6).toUpperCase()}`;
  const reqId = `REQ-${uuidv4().slice(0, 6).toUpperCase()}`;
  const pScore = priorityScore(input.priority);

  const tx = db.transaction(() => {
    const existingPatient = db.prepare(`SELECT id FROM Patients WHERE id = ?`).get(patientId);
    if (!existingPatient) {
      db.prepare(`
        INSERT INTO Patients (id, mrn, name, age, condition, priority, status, hospital_id, bed_id, bed_type, last_sequence_number, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'IN_AMBULANCE', NULL, NULL, ?, 1, ?)
      `).run(
        patientId,
        `MRN-${Math.floor(10000 + Math.random() * 89999)}`,
        input.patientName,
        input.age ?? 45,
        input.condition,
        input.priority,
        input.requiredBedType,
        nowIso
      );
    }

    db.prepare(`
      INSERT INTO EmergencyRequests (id, patient_id, patient_name, condition, priority, required_bed_type, ambulance_id, latitude, longitude, location_label, status, assigned_hospital_id, reservation_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', NULL, NULL, ?, ?)
    `).run(
      reqId,
      patientId,
      input.patientName,
      input.condition,
      input.priority,
      input.requiredBedType,
      input.ambulanceId,
      input.latitude,
      input.longitude,
      input.locationLabel,
      nowIso,
      nowIso
    );

    db.prepare(`
      UPDATE Ambulances
      SET status = 'DISPATCHED', assigned_request_id = ?, latitude = ?, longitude = ?, updated_at = ?
      WHERE id = ?
    `).run(reqId, input.latitude, input.longitude, nowIso, input.ambulanceId);

    insertOutbox({
      eventType: 'AmbulanceDispatched',
      queueName: 'audit_queue',
      priority: pScore,
      patientId,
      sequenceNumber: 1,
      payload: {
        actor: input.actor,
        patient_id: patientId,
        request_id: reqId,
        summary: `Registered ${input.priority} emergency request for ${input.patientName} (${input.requiredBedType}) at ${input.locationLabel}`,
      },
    });

    insertOutbox({
      eventType: 'EmergencyRequestCreated',
      queueName: 'notification_queue',
      priority: pScore,
      patientId,
      payload: {
        title: `${input.priority} Emergency Request`,
        message: `${input.patientName} requires ${input.requiredBedType} bed near ${input.locationLabel}`,
      },
    });
  });

  tx();
  rabbitmqBroker.flushOutboxToBroker();
  websocketHub.broadcast('SNAPSHOT_UPDATED', { trigger: 'EMERGENCY_REQUEST_CREATED', request_id: reqId });

  return db.prepare(`SELECT * FROM EmergencyRequests WHERE id = ?`).get(reqId) as EmergencyRequest;
}

/**
 * Atomic Bed Reservation across Redis + PostgreSQL/SQLite + Transactional Outbox
 */
export function reserveBedAtomically(input: {
  hospitalId: string;
  bedType: BedType;
  patientId: string;
  preferredBedId?: string;
  ambulanceId?: string | null;
  requestId?: string | null;
  transferId?: string | null;
  priority: EmergencyPriority;
  actor: string;
  ttlMs?: number;
}): { ok: true; reservation: BedReservation } | { ok: false; code: string; message: string; status: number } {
  if (!redisCoordinator.checkRateLimit(`reserve:${input.actor}`, 500, 10_000)) {
    return { ok: false, code: 'RATE_LIMITED', message: 'Rate limit exceeded for reservation requests.', status: 429 };
  }

  const reservationId = `RES-${uuidv4().slice(0, 6).toUpperCase()}`;
  const nowMs = Date.now();
  const ttlMs = input.ttlMs ?? 15 * 60_000;
  const createdIso = new Date(nowMs).toISOString();
  const expiresIso = new Date(nowMs + ttlMs).toISOString();

  // Step 1: Atomic Redis claim of a specific Bed ID (fails closed if Redis offline)
  const redisRes = redisCoordinator.atomicReserveBed(
    input.hospitalId,
    input.bedType,
    reservationId,
    nowMs + ttlMs,
    input.preferredBedId
  );
  if (!redisRes.ok) {
    return {
      ok: false,
      code: redisRes.code,
      message: redisRes.message,
      status: redisRes.code === 'REDIS_UNAVAILABLE' ? 503 : 409,
    };
  }

  const claimedBedId = redisRes.bedId;
  const pScore = priorityScore(input.priority);

  // Step 2: Authoritative DB transaction + Transactional Outbox
  try {
    const dbTx = db.transaction(() => {
      const updated = db.prepare(`
        UPDATE Beds
        SET status = 'RESERVED', patient_id = ?, updated_at = ?
        WHERE id = ? AND hospital_id = ? AND bed_type = ? AND status = 'AVAILABLE'
      `).run(input.patientId, createdIso, claimedBedId, input.hospitalId, input.bedType);

      if (updated.changes === 0) {
        throw new Error('NO_BEDS_AVAILABLE_IN_DB');
      }

      db.prepare(`
        INSERT INTO BedReservations (id, hospital_id, bed_id, bed_type, patient_id, ambulance_id, request_id, transfer_id, priority, status, created_at, expires_at, confirmed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, NULL)
      `).run(
        reservationId,
        input.hospitalId,
        claimedBedId,
        input.bedType,
        input.patientId,
        input.ambulanceId ?? null,
        input.requestId ?? null,
        input.transferId ?? null,
        input.priority,
        createdIso,
        expiresIso
      );

      const patRow = db.prepare(`SELECT last_sequence_number, name FROM Patients WHERE id = ?`).get(input.patientId) as
        | { last_sequence_number: number; name: string }
        | undefined;
      const nextSeq = (patRow?.last_sequence_number ?? 0) + 1;

      db.prepare(`
        UPDATE Patients
        SET status = 'RESERVED', hospital_id = ?, bed_id = ?, bed_type = ?, last_sequence_number = ?, updated_at = ?
        WHERE id = ?
      `).run(input.hospitalId, claimedBedId, input.bedType, nextSeq, createdIso, input.patientId);

      if (input.requestId) {
        db.prepare(`
          UPDATE EmergencyRequests
          SET status = 'RESERVED', assigned_hospital_id = ?, reservation_id = ?, updated_at = ?
          WHERE id = ?
        `).run(input.hospitalId, reservationId, createdIso, input.requestId);
      }

      if (input.ambulanceId) {
        db.prepare(`
          UPDATE Ambulances
          SET status = 'EN_ROUTE', target_hospital_id = ?, updated_at = ?
          WHERE id = ?
        `).run(input.hospitalId, createdIso, input.ambulanceId);
      }

      const hospRow = db.prepare(`SELECT name FROM Hospitals WHERE id = ?`).get(input.hospitalId) as { name: string } | undefined;

      insertOutbox({
        eventType: 'BedReserved',
        queueName: 'bed_tracking_queue',
        priority: pScore,
        patientId: input.patientId,
        hospitalId: input.hospitalId,
        bedId: claimedBedId,
        sequenceNumber: nextSeq,
        payload: { hospital_id: input.hospitalId, bed_id: claimedBedId, bed_type: input.bedType, reservation_id: reservationId },
      });

      insertOutbox({
        eventType: 'BedReserved',
        queueName: 'notification_queue',
        priority: pScore,
        patientId: input.patientId,
        hospitalId: input.hospitalId,
        bedId: claimedBedId,
        sequenceNumber: nextSeq,
        payload: {
          hospital_id: input.hospitalId,
          title: `Incoming ${input.priority} Reservation`,
          message: `Bed ${claimedBedId} (${input.bedType}) reserved at ${hospRow?.name ?? input.hospitalId} for ${patRow?.name ?? input.patientId}.`,
        },
      });

      insertOutbox({
        eventType: 'BedReserved',
        queueName: 'audit_queue',
        priority: pScore,
        patientId: input.patientId,
        hospitalId: input.hospitalId,
        bedId: claimedBedId,
        sequenceNumber: nextSeq,
        payload: {
          actor: input.actor,
          hospital_id: input.hospitalId,
          patient_id: input.patientId,
          bed_id: claimedBedId,
          summary: `Reserved ${claimedBedId} (${input.bedType}) at ${hospRow?.name ?? input.hospitalId} for ${patRow?.name ?? input.patientId} (${input.priority})`,
        },
      });
    });

    dbTx();
  } catch (err) {
    redisCoordinator.releaseReservation(input.hospitalId, input.bedType, claimedBedId, reservationId);
    const msg = err instanceof Error ? err.message : 'Database reservation constraint rejected.';
    return {
      ok: false,
      code: msg.includes('UNIQUE') ? 'DUPLICATE_RESERVATION' : 'RESERVATION_CONFLICT',
      message: msg.includes('UNIQUE')
        ? 'Bed or patient already holds an active reservation.'
        : 'Bed could not be reserved due to concurrent allocation.',
      status: 409,
    };
  }

  rabbitmqBroker.flushOutboxToBroker();
  websocketHub.broadcast('SNAPSHOT_UPDATED', { trigger: 'BED_RESERVED', reservation_id: reservationId });

  const reservation = db.prepare(`
    SELECT r.*, h.name as hospital_name, p.name as patient_name
    FROM BedReservations r
    LEFT JOIN Hospitals h ON h.id = r.hospital_id
    LEFT JOIN Patients p ON p.id = r.patient_id
    WHERE r.id = ?
  `).get(reservationId) as BedReservation;

  return { ok: true, reservation };
}

export function confirmReservationAdmission(input: {
  reservationId: string;
  actor: string;
  eventId?: string;
  sequenceNumber?: number;
}): { ok: true; message: string } | { ok: false; code: string; message: string; status: number } {
  const eventId = input.eventId || uuidv4();
  if (rabbitmqBroker.isEventProcessed(eventId, 'admission_command')) {
    rabbitmqBroker.recordDuplicatePrevented();
    return { ok: false, code: 'DUPLICATE_EVENT', message: 'Duplicate admission event ignored idempotently.', status: 409 };
  }

  const res = db.prepare(`SELECT * FROM BedReservations WHERE id = ?`).get(input.reservationId) as BedReservation | undefined;
  if (!res) {
    return { ok: false, code: 'NOT_FOUND', message: 'Reservation not found.', status: 404 };
  }
  if (res.status === 'EXPIRED' || new Date(res.expires_at).getTime() <= Date.now()) {
    if (res.status === 'ACTIVE') expireReservationById(res.id);
    return { ok: false, code: 'RESERVATION_EXPIRED', message: 'Reservation has expired and cannot be confirmed.', status: 409 };
  }
  if (res.status !== 'ACTIVE') {
    return { ok: false, code: 'INVALID_STATE', message: `Reservation is already ${res.status}.`, status: 409 };
  }

  const patient = db.prepare(`SELECT * FROM Patients WHERE id = ?`).get(res.patient_id) as Patient | undefined;
  if (patient && typeof input.sequenceNumber === 'number' && input.sequenceNumber <= patient.last_sequence_number) {
    rabbitmqBroker.recordOutOfOrderBlocked();
    return {
      ok: false,
      code: 'OUT_OF_ORDER_EVENT',
      message: `Ignored stale event sequence ${input.sequenceNumber} (current sequence is ${patient.last_sequence_number}).`,
      status: 409,
    };
  }

  const nowIso = new Date().toISOString();
  const nextSeq = typeof input.sequenceNumber === 'number' ? input.sequenceNumber : (patient?.last_sequence_number ?? 0) + 1;
  const hospital = db.prepare(`SELECT name FROM Hospitals WHERE id = ?`).get(res.hospital_id) as { name: string } | undefined;

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE BedReservations SET status = 'CONFIRMED', confirmed_at = ? WHERE id = ? AND status = 'ACTIVE'
    `).run(nowIso, res.id);

    db.prepare(`
      UPDATE Beds SET status = 'OCCUPIED', patient_id = ?, updated_at = ? WHERE id = ?
    `).run(res.patient_id, nowIso, res.bed_id);

    db.prepare(`
      UPDATE Patients
      SET status = 'ADMITTED', hospital_id = ?, bed_id = ?, bed_type = ?, last_sequence_number = ?, updated_at = ?
      WHERE id = ?
    `).run(res.hospital_id, res.bed_id, res.bed_type, nextSeq, nowIso, res.patient_id);

    if (res.request_id) {
      db.prepare(`UPDATE EmergencyRequests SET status = 'ADMITTED', updated_at = ? WHERE id = ?`).run(nowIso, res.request_id);
    }

    if (res.ambulance_id) {
      db.prepare(`
        UPDATE Ambulances SET status = 'AVAILABLE', assigned_request_id = NULL, target_hospital_id = NULL, updated_at = ? WHERE id = ?
      `).run(nowIso, res.ambulance_id);
    }

    insertOutbox({
      eventId,
      eventType: 'PatientAdmitted',
      queueName: 'bed_tracking_queue',
      priority: priorityScore(res.priority),
      patientId: res.patient_id,
      hospitalId: res.hospital_id,
      bedId: res.bed_id,
      sequenceNumber: nextSeq,
      payload: { hospital_id: res.hospital_id, bed_id: res.bed_id, bed_type: res.bed_type, patient_id: res.patient_id },
    });

    insertOutbox({
      eventType: 'PatientAdmitted',
      queueName: 'audit_queue',
      priority: priorityScore(res.priority),
      patientId: res.patient_id,
      hospitalId: res.hospital_id,
      bedId: res.bed_id,
      sequenceNumber: nextSeq,
      payload: {
        actor: input.actor,
        hospital_id: res.hospital_id,
        patient_id: res.patient_id,
        bed_id: res.bed_id,
        summary: `Admitted ${patient?.name ?? res.patient_id} into ${res.bed_id} (${res.bed_type}) at ${hospital?.name ?? res.hospital_id}`,
      },
    });
  });

  tx();
  rabbitmqBroker.markEventProcessed(eventId, 'admission_command');
  redisCoordinator.confirmReservation(res.hospital_id, res.bed_type, res.id);
  rabbitmqBroker.flushOutboxToBroker();

  websocketHub.broadcast('SNAPSHOT_UPDATED', { trigger: 'BED_ADMITTED', reservation_id: res.id });
  return { ok: true, message: `Patient admitted into ${res.bed_id} and bed marked occupied.` };
}

export function admitWalkInPatient(input: {
  hospitalId: string;
  bedType: BedType;
  preferredBedId?: string;
  patientName: string;
  age: number;
  condition: string;
  priority: EmergencyPriority;
  actor: string;
}): { ok: true; patient: Patient; bedId: string } | { ok: false; message: string } {
  const nowIso = new Date().toISOString();
  const patientId = `PAT-${uuidv4().slice(0, 6).toUpperCase()}`;
  const hospital = db.prepare(`SELECT name FROM Hospitals WHERE id = ?`).get(input.hospitalId) as { name: string } | undefined;

  let chosenBedId = input.preferredBedId;

  try {
    const tx = db.transaction(() => {
      if (!chosenBedId) {
        const freeBed = db.prepare(`
          SELECT id FROM Beds WHERE hospital_id = ? AND bed_type = ? AND status = 'AVAILABLE' ORDER BY id ASC LIMIT 1
        `).get(input.hospitalId, input.bedType) as { id: string } | undefined;
        if (!freeBed) throw new Error(`No available ${input.bedType} beds at this hospital.`);
        chosenBedId = freeBed.id;
      }

      const upd = db.prepare(`
        UPDATE Beds SET status = 'OCCUPIED', patient_id = ?, updated_at = ?
        WHERE id = ? AND hospital_id = ? AND status = 'AVAILABLE'
      `).run(patientId, nowIso, chosenBedId, input.hospitalId);

      if (upd.changes === 0) {
        throw new Error(`Bed ${chosenBedId} is no longer available.`);
      }

      db.prepare(`
        INSERT INTO Patients (id, mrn, name, age, condition, priority, status, hospital_id, bed_id, bed_type, last_sequence_number, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'ADMITTED', ?, ?, ?, 1, ?)
      `).run(
        patientId,
        `MRN-${Math.floor(10000 + Math.random() * 89999)}`,
        input.patientName,
        input.age,
        input.condition,
        input.priority,
        input.hospitalId,
        chosenBedId,
        input.bedType,
        nowIso
      );

      insertOutbox({
        eventType: 'PatientAdmitted',
        queueName: 'bed_tracking_queue',
        priority: priorityScore(input.priority),
        patientId,
        hospitalId: input.hospitalId,
        bedId: chosenBedId,
        sequenceNumber: 1,
        payload: { hospital_id: input.hospitalId, bed_id: chosenBedId, bed_type: input.bedType, patient_id: patientId },
      });

      insertOutbox({
        eventType: 'PatientAdmitted',
        queueName: 'audit_queue',
        priority: priorityScore(input.priority),
        patientId,
        hospitalId: input.hospitalId,
        bedId: chosenBedId,
        sequenceNumber: 1,
        payload: {
          actor: input.actor,
          hospital_id: input.hospitalId,
          patient_id: patientId,
          bed_id: chosenBedId,
          summary: `Admitted ${input.patientName} directly to ${chosenBedId} (${input.bedType}) at ${hospital?.name ?? input.hospitalId}`,
        },
      });
    });
    tx();
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Unable to admit patient.' };
  }

  redisCoordinator.syncFromDatabase();
  rabbitmqBroker.flushOutboxToBroker();
  websocketHub.broadcast('SNAPSHOT_UPDATED', { trigger: 'WALKIN_ADMITTED', patient_id: patientId });
  return {
    ok: true,
    patient: db.prepare(`SELECT * FROM Patients WHERE id = ?`).get(patientId) as Patient,
    bedId: chosenBedId!,
  };
}

export function dischargeByBedOrPatient(input: {
  patientId?: string;
  bedId?: string;
  actor: string;
}): { ok: true; message: string } | { ok: false; message: string } {
  let bed: BedRecord | undefined;
  if (input.bedId) {
    bed = db.prepare(`SELECT * FROM Beds WHERE id = ?`).get(input.bedId) as BedRecord | undefined;
  } else if (input.patientId) {
    bed = db.prepare(`SELECT * FROM Beds WHERE patient_id = ? AND status = 'OCCUPIED'`).get(input.patientId) as BedRecord | undefined;
  }

  if (!bed || bed.status !== 'OCCUPIED') {
    return { ok: false, message: 'No occupied bed record found for discharge.' };
  }

  const nowIso = new Date().toISOString();
  const patient = bed.patient_id
    ? (db.prepare(`SELECT * FROM Patients WHERE id = ?`).get(bed.patient_id) as Patient | undefined)
    : undefined;
  const hospital = db.prepare(`SELECT name FROM Hospitals WHERE id = ?`).get(bed.hospital_id) as { name: string } | undefined;

  const tx = db.transaction(() => {
    db.prepare(`UPDATE Beds SET status = 'AVAILABLE', patient_id = NULL, updated_at = ? WHERE id = ?`).run(nowIso, bed!.id);

    if (patient) {
      db.prepare(`
        UPDATE Patients SET status = 'DISCHARGED', bed_id = NULL, last_sequence_number = last_sequence_number + 1, updated_at = ?
        WHERE id = ?
      `).run(nowIso, patient.id);
    }

    insertOutbox({
      eventType: 'PatientDischarged',
      queueName: 'bed_tracking_queue',
      priority: 5,
      patientId: patient?.id ?? null,
      hospitalId: bed!.hospital_id,
      bedId: bed!.id,
      sequenceNumber: (patient?.last_sequence_number ?? 0) + 1,
      payload: { hospital_id: bed!.hospital_id, bed_id: bed!.id, bed_type: bed!.bed_type, patient_id: patient?.id ?? null },
    });

    insertOutbox({
      eventType: 'PatientDischarged',
      queueName: 'audit_queue',
      priority: 5,
      patientId: patient?.id ?? null,
      hospitalId: bed!.hospital_id,
      bedId: bed!.id,
      payload: {
        actor: input.actor,
        hospital_id: bed!.hospital_id,
        patient_id: patient?.id ?? null,
        bed_id: bed!.id,
        summary: `Discharged ${patient?.name ?? 'occupant'} from ${bed!.id} (${bed!.bed_type}) at ${hospital?.name ?? bed!.hospital_id}`,
      },
    });
  });
  tx();

  redisCoordinator.syncFromDatabase();
  rabbitmqBroker.flushOutboxToBroker();
  websocketHub.broadcast('SNAPSHOT_UPDATED', { trigger: 'PATIENT_DISCHARGED', bed_id: bed.id });
  return { ok: true, message: `Discharged ${bed.id} and returned bed to AVAILABLE pool.` };
}

export function addHospitalBeds(input: {
  hospitalId: string;
  bedType: BedType;
  count: number;
  actor: string;
}): { ok: true; added: number } | { ok: false; message: string } {
  if (input.count < 1 || input.count > 25) {
    return { ok: false, message: 'Add between 1 and 25 beds at a time.' };
  }
  const existingCount = (db.prepare(`
    SELECT COUNT(*) as c FROM Beds WHERE hospital_id = ? AND bed_type = ?
  `).get(input.hospitalId, input.bedType) as { c: number }).c;

  const numPart = input.hospitalId.replace('HOSP-', '');
  const typeTag = input.bedType === 'ICU' ? 'ICU' : input.bedType === 'VENTILATOR' ? 'VENT' : 'GEN';
  const nowIso = new Date().toISOString();

  const insert = db.prepare(`
    INSERT INTO Beds (id, hospital_id, bed_type, status, patient_id, updated_at)
    VALUES (?, ?, ?, 'AVAILABLE', NULL, ?)
  `);

  const tx = db.transaction(() => {
    for (let i = 1; i <= input.count; i++) {
      const seq = String(existingCount + i).padStart(3, '0');
      const bedId = `BED-${numPart}-${typeTag}-${seq}`;
      insert.run(bedId, input.hospitalId, input.bedType, nowIso);
    }

    insertOutbox({
      eventType: 'BedCapacityAdded',
      queueName: 'audit_queue',
      priority: 1,
      hospitalId: input.hospitalId,
      payload: {
        actor: input.actor,
        hospital_id: input.hospitalId,
        summary: `Added ${input.count} new ${input.bedType} bed(s) to ${input.hospitalId}`,
      },
    });
  });

  tx();
  redisCoordinator.syncFromDatabase();
  rabbitmqBroker.flushOutboxToBroker();
  websocketHub.broadcast('SNAPSHOT_UPDATED', { trigger: 'CAPACITY_UPDATED', hospital_id: input.hospitalId });
  return { ok: true, added: input.count };
}

export function expireReservationById(reservationId: string): boolean {
  const res = db.prepare(`SELECT * FROM BedReservations WHERE id = ? AND status = 'ACTIVE'`).get(reservationId) as BedReservation | undefined;
  if (!res) return false;

  const nowIso = new Date().toISOString();
  const hospital = db.prepare(`SELECT name FROM Hospitals WHERE id = ?`).get(res.hospital_id) as { name: string } | undefined;

  const tx = db.transaction(() => {
    const upd = db.prepare(`UPDATE BedReservations SET status = 'EXPIRED' WHERE id = ? AND status = 'ACTIVE'`).run(reservationId);
    if (upd.changes === 0) return;

    db.prepare(`
      UPDATE Beds SET status = 'AVAILABLE', patient_id = NULL, updated_at = ? WHERE id = ?
    `).run(nowIso, res.bed_id);

    if (res.request_id) {
      db.prepare(`
        UPDATE EmergencyRequests
        SET status = 'OPEN', assigned_hospital_id = NULL, reservation_id = NULL, updated_at = ?
        WHERE id = ? AND status = 'RESERVED'
      `).run(nowIso, res.request_id);
    }

    if (res.ambulance_id) {
      db.prepare(`
        UPDATE Ambulances SET status = 'DISPATCHED', target_hospital_id = NULL, updated_at = ? WHERE id = ?
      `).run(nowIso, res.ambulance_id);
    }

    db.prepare(`
      UPDATE Patients
      SET status = CASE WHEN status = 'RESERVED' THEN 'IN_AMBULANCE' ELSE status END,
          hospital_id = CASE WHEN status = 'RESERVED' THEN NULL ELSE hospital_id END,
          bed_id = CASE WHEN status = 'RESERVED' THEN NULL ELSE bed_id END,
          updated_at = ?
      WHERE id = ?
    `).run(nowIso, res.patient_id);

    insertOutbox({
      eventType: 'ReservationExpired',
      queueName: 'bed_tracking_queue',
      priority: 5,
      patientId: res.patient_id,
      hospitalId: res.hospital_id,
      bedId: res.bed_id,
      payload: { hospital_id: res.hospital_id, bed_id: res.bed_id, bed_type: res.bed_type, reservation_id: res.id },
    });

    insertOutbox({
      eventType: 'ReservationExpired',
      queueName: 'audit_queue',
      priority: 5,
      patientId: res.patient_id,
      hospitalId: res.hospital_id,
      bedId: res.bed_id,
      payload: {
        actor: 'TTL Expiry Worker',
        hospital_id: res.hospital_id,
        patient_id: res.patient_id,
        bed_id: res.bed_id,
        summary: `Reservation ${res.id} (${res.bed_id}) at ${hospital?.name ?? res.hospital_id} expired and bed was released`,
      },
    });
  });

  tx();
  redisCoordinator.releaseReservation(res.hospital_id, res.bed_type, res.bed_id, res.id);
  rabbitmqBroker.flushOutboxToBroker();
  websocketHub.broadcast('SNAPSHOT_UPDATED', { trigger: 'RESERVATION_EXPIRED', reservation_id: res.id });
  return true;
}

export function runReservationExpirySweep(): number {
  const nowIso = new Date().toISOString();
  const expired = db.prepare(`
    SELECT id FROM BedReservations WHERE status = 'ACTIVE' AND expires_at <= ?
  `).all(nowIso) as Array<{ id: string }>;

  let count = 0;
  for (const row of expired) {
    if (expireReservationById(row.id)) count += 1;
  }
  return count;
}
