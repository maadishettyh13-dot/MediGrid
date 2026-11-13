import { v4 as uuidv4 } from 'uuid';
import { BrokerEvent } from '../../src/types/medilink.ts';
import { db } from '../db/database.ts';
import { rabbitmqBroker } from '../infrastructure/rabbitmqBroker.ts';
import { websocketHub } from '../services/websocketHub.ts';

const CONSUMER_NAME = 'audit_consumer';

export async function handleAuditEvent(event: BrokerEvent): Promise<void> {
  if (!rabbitmqBroker.markEventProcessed(event.id, CONSUMER_NAME)) {
    return;
  }

  const p = event.payload;
  const actor = typeof p.actor === 'string' ? p.actor : 'System Coordinator';
  const hospitalId = event.hospital_id ?? (typeof p.hospital_id === 'string' ? p.hospital_id : null);
  const patientId = event.patient_id ?? (typeof p.patient_id === 'string' ? p.patient_id : null);
  const bedId = event.bed_id ?? (typeof p.bed_id === 'string' ? p.bed_id : null);
  const summary = typeof p.summary === 'string' ? p.summary : `Processed ${event.event_type}`;

  const createdAt = new Date().toISOString();
  const auditId = `AUD-${uuidv4().slice(0, 8)}`;

  db.prepare(`
    INSERT INTO AuditLogs (id, event_id, event_type, actor, hospital_id, patient_id, bed_id, summary, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(auditId, event.id, event.event_type, actor, hospitalId, patientId, bedId, summary, JSON.stringify(p), createdAt);

  websocketHub.broadcast('ACTIVITY_EVENT', {
    id: auditId,
    event_id: event.id,
    event_type: event.event_type,
    actor,
    hospital_id: hospitalId,
    patient_id: patientId,
    bed_id: bedId,
    summary,
    created_at: createdAt,
  });
}
