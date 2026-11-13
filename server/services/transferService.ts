import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database.ts';
import { rabbitmqBroker } from '../infrastructure/rabbitmqBroker.ts';
import { redisCoordinator } from '../infrastructure/redisCoordinator.ts';
import { websocketHub } from './websocketHub.ts';
import { reserveBedAtomically } from './emergencyService.ts';
import { BedType, EmergencyPriority, Patient, TransferRequest } from '../../src/types/medilink.ts';

export function createTransferRequest(input: {
  patientId: string;
  fromHospitalId: string;
  toHospitalId: string;
  requiredBedType: BedType;
  priority: EmergencyPriority;
  reason: string;
  actor: string;
}): { ok: true; transfer: TransferRequest } | { ok: false; message: string } {
  if (input.fromHospitalId === input.toHospitalId) {
    return { ok: false, message: 'Origin and receiving hospitals must be different.' };
  }

  const patient = db.prepare(`SELECT * FROM Patients WHERE id = ?`).get(input.patientId) as Patient | undefined;
  if (!patient) return { ok: false, message: 'Patient record not found.' };

  const transferId = `TRF-${uuidv4().slice(0, 6).toUpperCase()}`;
  const nowIso = new Date().toISOString();

  db.prepare(`
    INSERT INTO TransferRequests (id, patient_id, patient_name, patient_condition, from_hospital_id, to_hospital_id, required_bed_type, priority, reason, status, reservation_id, bed_id, saga_step, compensation_note, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'REQUESTED', NULL, NULL, 'SAGA_STARTED_REQUEST_CREATED', NULL, ?, ?)
  `).run(
    transferId,
    patient.id,
    patient.name,
    patient.condition,
    input.fromHospitalId,
    input.toHospitalId,
    input.requiredBedType,
    input.priority,
    input.reason,
    nowIso,
    nowIso
  );

  const toHosp = db.prepare(`SELECT name FROM Hospitals WHERE id = ?`).get(input.toHospitalId) as { name: string } | undefined;
  const fromHosp = db.prepare(`SELECT name FROM Hospitals WHERE id = ?`).get(input.fromHospitalId) as { name: string } | undefined;

  rabbitmqBroker.publishWithConfirm({
    eventType: 'TransferRequested',
    queueName: 'transfer_saga_queue',
    priority: input.priority === 'CRITICAL' ? 10 : input.priority === 'HIGH' ? 5 : 1,
    patientId: patient.id,
    hospitalId: input.toHospitalId,
    payload: { transfer_id: transferId, to_hospital_id: input.toHospitalId },
  });

  rabbitmqBroker.publishWithConfirm({
    eventType: 'TransferRequested',
    queueName: 'notification_queue',
    priority: 5,
    patientId: patient.id,
    hospitalId: input.toHospitalId,
    payload: {
      hospital_id: input.toHospitalId,
      title: 'Incoming Transfer Request',
      message: `${fromHosp?.name ?? input.fromHospitalId} requests ${input.requiredBedType} transfer for ${patient.name}.`,
    },
  });

  rabbitmqBroker.publishWithConfirm({
    eventType: 'TransferRequested',
    queueName: 'audit_queue',
    priority: 5,
    patientId: patient.id,
    hospitalId: input.toHospitalId,
    payload: {
      actor: input.actor,
      hospital_id: input.toHospitalId,
      patient_id: patient.id,
      summary: `Transfer requested for ${patient.name} from ${fromHosp?.name ?? input.fromHospitalId} to ${toHosp?.name ?? input.toHospitalId} (${input.requiredBedType})`,
    },
  });

  websocketHub.broadcast('SNAPSHOT_UPDATED', { trigger: 'TRANSFER_CREATED', transfer_id: transferId });

  const created = db.prepare(`
    SELECT t.*, fh.name as from_hospital_name, th.name as to_hospital_name
    FROM TransferRequests t
    JOIN Hospitals fh ON fh.id = t.from_hospital_id
    JOIN Hospitals th ON th.id = t.to_hospital_id
    WHERE t.id = ?
  `).get(transferId) as TransferRequest;

  return { ok: true, transfer: created };
}

export function acceptTransfer(transferId: string, actor: string): { ok: true } | { ok: false; message: string } {
  const trf = db.prepare(`SELECT * FROM TransferRequests WHERE id = ?`).get(transferId) as TransferRequest | undefined;
  if (!trf) return { ok: false, message: 'Transfer request not found.' };
  if (!['REQUESTED', 'PENDING'].includes(trf.status)) {
    return { ok: false, message: `Transfer cannot be accepted in ${trf.status} state.` };
  }

  const resAttempt = reserveBedAtomically({
    hospitalId: trf.to_hospital_id,
    bedType: trf.required_bed_type,
    patientId: trf.patient_id,
    priority: trf.priority,
    transferId: trf.id,
    actor,
  });

  if (!resAttempt.ok) {
    return { ok: false, message: `Saga reservation failed: ${resAttempt.message}` };
  }

  const nowIso = new Date().toISOString();
  db.prepare(`
    UPDATE TransferRequests
    SET status = 'ACCEPTED',
        reservation_id = ?,
        bed_id = ?,
        saga_step = 'RECEIVING_BED_RESERVED',
        updated_at = ?
    WHERE id = ?
  `).run(resAttempt.reservation.id, resAttempt.reservation.bed_id, nowIso, transferId);

  rabbitmqBroker.publishWithConfirm({
    eventType: 'TransferAccepted',
    queueName: 'audit_queue',
    priority: 5,
    patientId: trf.patient_id,
    hospitalId: trf.to_hospital_id,
    bedId: resAttempt.reservation.bed_id,
    payload: {
      actor,
      hospital_id: trf.to_hospital_id,
      patient_id: trf.patient_id,
      bed_id: resAttempt.reservation.bed_id,
      summary: `Transfer ${trf.id} accepted; reserved ${resAttempt.reservation.bed_id} (${resAttempt.reservation.id})`,
    },
  });

  websocketHub.broadcast('SNAPSHOT_UPDATED', { trigger: 'TRANSFER_ACCEPTED', transfer_id: transferId });
  return { ok: true };
}

export function markTransferInTransit(transferId: string, actor: string): { ok: true } | { ok: false; message: string } {
  const trf = db.prepare(`SELECT * FROM TransferRequests WHERE id = ?`).get(transferId) as TransferRequest | undefined;
  if (!trf || trf.status !== 'ACCEPTED') {
    return { ok: false, message: 'Transfer must be ACCEPTED before marking IN_TRANSIT.' };
  }

  const nowIso = new Date().toISOString();
  db.prepare(`
    UPDATE TransferRequests
    SET status = 'IN_TRANSIT', saga_step = 'PATIENT_IN_AMBULANCE_TRANSIT', updated_at = ?
    WHERE id = ?
  `).run(nowIso, transferId);

  db.prepare(`
    UPDATE Patients SET status = 'IN_TRANSFER', last_sequence_number = last_sequence_number + 1, updated_at = ? WHERE id = ?
  `).run(nowIso, trf.patient_id);

  rabbitmqBroker.publishWithConfirm({
    eventType: 'TransferInTransit',
    queueName: 'audit_queue',
    priority: 5,
    patientId: trf.patient_id,
    hospitalId: trf.to_hospital_id,
    payload: {
      actor,
      hospital_id: trf.to_hospital_id,
      patient_id: trf.patient_id,
      summary: `Patient ${trf.patient_name} departed origin hospital and is IN_TRANSIT`,
    },
  });

  websocketHub.broadcast('SNAPSHOT_UPDATED', { trigger: 'TRANSFER_IN_TRANSIT', transfer_id: transferId });
  return { ok: true };
}

export function completeTransfer(transferId: string, actor: string): { ok: true } | { ok: false; message: string } {
  const trf = db.prepare(`SELECT * FROM TransferRequests WHERE id = ?`).get(transferId) as TransferRequest | undefined;
  if (!trf || !['ACCEPTED', 'IN_TRANSIT'].includes(trf.status)) {
    return { ok: false, message: 'Transfer must be ACCEPTED or IN_TRANSIT to complete.' };
  }

  const nowIso = new Date().toISOString();
  const patient = db.prepare(`SELECT * FROM Patients WHERE id = ?`).get(trf.patient_id) as Patient | undefined;

  const tx = db.transaction(() => {
    if (trf.reservation_id && trf.bed_id) {
      db.prepare(`
        UPDATE BedReservations SET status = 'CONFIRMED', confirmed_at = ? WHERE id = ? AND status = 'ACTIVE'
      `).run(nowIso, trf.reservation_id);

      db.prepare(`
        UPDATE Beds SET status = 'OCCUPIED', patient_id = ?, updated_at = ? WHERE id = ?
      `).run(trf.patient_id, nowIso, trf.bed_id);
    }

    // Release origin hospital bed if patient held one there
    if (patient && patient.bed_id && patient.hospital_id === trf.from_hospital_id) {
      db.prepare(`
        UPDATE Beds SET status = 'AVAILABLE', patient_id = NULL, updated_at = ? WHERE id = ?
      `).run(nowIso, patient.bed_id);
    }

    db.prepare(`
      UPDATE Patients
      SET status = 'ADMITTED', hospital_id = ?, bed_id = ?, bed_type = ?, last_sequence_number = last_sequence_number + 1, updated_at = ?
      WHERE id = ?
    `).run(trf.to_hospital_id, trf.bed_id, trf.required_bed_type, nowIso, trf.patient_id);

    db.prepare(`
      UPDATE TransferRequests
      SET status = 'COMPLETED', saga_step = 'SAGA_COMMITTED_BED_OCCUPIED', updated_at = ?
      WHERE id = ?
    `).run(nowIso, transferId);
  });

  tx();
  if (trf.reservation_id) {
    redisCoordinator.confirmReservation(trf.to_hospital_id, trf.required_bed_type, trf.reservation_id);
  }
  redisCoordinator.syncFromDatabase();

  rabbitmqBroker.publishWithConfirm({
    eventType: 'TransferCompleted',
    queueName: 'audit_queue',
    priority: 5,
    patientId: trf.patient_id,
    hospitalId: trf.to_hospital_id,
    bedId: trf.bed_id,
    payload: {
      actor,
      hospital_id: trf.to_hospital_id,
      patient_id: trf.patient_id,
      bed_id: trf.bed_id,
      summary: `Completed transfer ${trf.id} for ${trf.patient_name}; origin bed released and ${trf.bed_id} occupied`,
    },
  });

  websocketHub.broadcast('SNAPSHOT_UPDATED', { trigger: 'TRANSFER_COMPLETED', transfer_id: transferId });
  return { ok: true };
}

export function compensateRejectOrCancelTransfer(input: {
  transferId: string;
  targetStatus: 'REJECTED' | 'CANCELLED' | 'EXPIRED';
  reason?: string;
  actor: string;
}): { ok: true } | { ok: false; message: string } {
  const trf = db.prepare(`SELECT * FROM TransferRequests WHERE id = ?`).get(input.transferId) as TransferRequest | undefined;
  if (!trf) return { ok: false, message: 'Transfer request not found.' };
  if (['COMPLETED', 'REJECTED', 'CANCELLED', 'EXPIRED'].includes(trf.status)) {
    return { ok: false, message: `Transfer is already finalized (${trf.status}).` };
  }

  const nowIso = new Date().toISOString();
  const compNote =
    trf.reservation_id && trf.bed_id
      ? `Compensating action executed: released reservation ${trf.reservation_id} (${trf.bed_id}) at receiving hospital and restored patient allocation to ${trf.from_hospital_id}.`
      : `Transfer ${input.targetStatus.toLowerCase()} before bed reservation; origin state preserved.`;

  const tx = db.transaction(() => {
    if (trf.reservation_id && trf.bed_id) {
      db.prepare(`UPDATE BedReservations SET status = 'CANCELLED' WHERE id = ? AND status = 'ACTIVE'`).run(trf.reservation_id);
      db.prepare(`UPDATE Beds SET status = 'AVAILABLE', patient_id = NULL, updated_at = ? WHERE id = ?`).run(nowIso, trf.bed_id);
    }

    db.prepare(`
      UPDATE Patients SET status = 'ADMITTED', hospital_id = ?, updated_at = ? WHERE id = ?
    `).run(trf.from_hospital_id, nowIso, trf.patient_id);

    db.prepare(`
      UPDATE TransferRequests
      SET status = ?,
          saga_step = 'COMPENSATED_RESERVATION_RELEASED',
          compensation_note = ?,
          updated_at = ?
      WHERE id = ?
    `).run(input.targetStatus, compNote, nowIso, input.transferId);
  });

  tx();
  if (trf.reservation_id && trf.bed_id) {
    redisCoordinator.releaseReservation(trf.to_hospital_id, trf.required_bed_type, trf.bed_id, trf.reservation_id);
  }
  redisCoordinator.syncFromDatabase();

  rabbitmqBroker.publishWithConfirm({
    eventType: input.targetStatus === 'REJECTED' ? 'TransferRejected' : 'TransferCancelled',
    queueName: 'audit_queue',
    priority: 5,
    patientId: trf.patient_id,
    hospitalId: trf.to_hospital_id,
    bedId: trf.bed_id,
    payload: {
      actor: input.actor,
      hospital_id: trf.to_hospital_id,
      patient_id: trf.patient_id,
      summary: `${input.targetStatus} transfer ${trf.id} (${input.reason || 'Clinical decision'}). ${compNote}`,
    },
  });

  websocketHub.broadcast('SNAPSHOT_UPDATED', { trigger: `TRANSFER_${input.targetStatus}`, transfer_id: input.transferId });
  return { ok: true };
}
