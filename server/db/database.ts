import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'medigrid.db');

export const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

export function initializeSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS Users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('CONTROL_ROOM', 'HOSPITAL_STAFF', 'AMBULANCE_DISPATCHER')),
      hospital_id TEXT NULL,
      ambulance_id TEXT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS Hospitals (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      address TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      phone TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('OPERATIONAL', 'SURGE', 'OFFLINE')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Individual beds table: every physical bed has a unique ID (4,000+ rows)
    CREATE TABLE IF NOT EXISTS Beds (
      id TEXT PRIMARY KEY,
      hospital_id TEXT NOT NULL,
      bed_type TEXT NOT NULL CHECK (bed_type IN ('ICU', 'VENTILATOR', 'GENERAL')),
      status TEXT NOT NULL CHECK (status IN ('AVAILABLE', 'OCCUPIED', 'RESERVED')),
      patient_id TEXT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (hospital_id) REFERENCES Hospitals(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS Patients (
      id TEXT PRIMARY KEY,
      mrn TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      age INTEGER NOT NULL,
      condition TEXT NOT NULL,
      priority TEXT NOT NULL CHECK (priority IN ('CRITICAL', 'HIGH', 'NORMAL')),
      status TEXT NOT NULL CHECK (status IN ('IN_AMBULANCE', 'RESERVED', 'ADMITTED', 'IN_TRANSFER', 'DISCHARGED')),
      hospital_id TEXT NULL,
      bed_id TEXT NULL,
      bed_type TEXT NULL CHECK (bed_type IN ('ICU', 'VENTILATOR', 'GENERAL') OR bed_type IS NULL),
      last_sequence_number INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (hospital_id) REFERENCES Hospitals(id)
    );

    CREATE TABLE IF NOT EXISTS Ambulances (
      id TEXT PRIMARY KEY,
      call_sign TEXT NOT NULL UNIQUE,
      crew_lead TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('AVAILABLE', 'DISPATCHED', 'EN_ROUTE', 'AT_HOSPITAL', 'OFFLINE')),
      assigned_request_id TEXT NULL,
      target_hospital_id TEXT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS EmergencyRequests (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      patient_name TEXT NOT NULL,
      condition TEXT NOT NULL,
      priority TEXT NOT NULL CHECK (priority IN ('CRITICAL', 'HIGH', 'NORMAL')),
      required_bed_type TEXT NOT NULL CHECK (required_bed_type IN ('ICU', 'VENTILATOR', 'GENERAL')),
      ambulance_id TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      location_label TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('OPEN', 'RESERVED', 'ADMITTED', 'TRANSFERRED', 'CANCELLED')),
      assigned_hospital_id TEXT NULL,
      reservation_id TEXT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (patient_id) REFERENCES Patients(id),
      FOREIGN KEY (ambulance_id) REFERENCES Ambulances(id)
    );

    CREATE TABLE IF NOT EXISTS BedReservations (
      id TEXT PRIMARY KEY,
      hospital_id TEXT NOT NULL,
      bed_id TEXT NOT NULL,
      bed_type TEXT NOT NULL CHECK (bed_type IN ('ICU', 'VENTILATOR', 'GENERAL')),
      patient_id TEXT NOT NULL,
      ambulance_id TEXT NULL,
      request_id TEXT NULL,
      transfer_id TEXT NULL,
      priority TEXT NOT NULL CHECK (priority IN ('CRITICAL', 'HIGH', 'NORMAL')),
      status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'CONFIRMED', 'EXPIRED', 'CANCELLED')),
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      confirmed_at TEXT NULL,
      FOREIGN KEY (hospital_id) REFERENCES Hospitals(id),
      FOREIGN KEY (bed_id) REFERENCES Beds(id),
      FOREIGN KEY (patient_id) REFERENCES Patients(id)
    );

    -- Enforce at DB level that neither a bed nor a patient can have two ACTIVE reservations simultaneously
    CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_bed_reservation
      ON BedReservations(bed_id) WHERE status = 'ACTIVE';

    CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_patient_reservation
      ON BedReservations(patient_id) WHERE status = 'ACTIVE';

    CREATE TABLE IF NOT EXISTS TransferRequests (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      patient_name TEXT NOT NULL,
      patient_condition TEXT NOT NULL,
      from_hospital_id TEXT NOT NULL,
      to_hospital_id TEXT NOT NULL,
      required_bed_type TEXT NOT NULL CHECK (required_bed_type IN ('ICU', 'VENTILATOR', 'GENERAL')),
      priority TEXT NOT NULL CHECK (priority IN ('CRITICAL', 'HIGH', 'NORMAL')),
      reason TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('REQUESTED', 'PENDING', 'ACCEPTED', 'REJECTED', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED', 'EXPIRED')),
      reservation_id TEXT NULL,
      bed_id TEXT NULL,
      saga_step TEXT NOT NULL,
      compensation_note TEXT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (patient_id) REFERENCES Patients(id),
      FOREIGN KEY (from_hospital_id) REFERENCES Hospitals(id),
      FOREIGN KEY (to_hospital_id) REFERENCES Hospitals(id)
    );

    CREATE TABLE IF NOT EXISTS Events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      queue_name TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 1,
      patient_id TEXT NULL,
      hospital_id TEXT NULL,
      bed_id TEXT NULL,
      sequence_number INTEGER NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('PENDING', 'PROCESSING', 'ACKED', 'RETRYING', 'DEAD_LETTERED')),
      retry_count INTEGER NOT NULL DEFAULT 0,
      max_retries INTEGER NOT NULL DEFAULT 3,
      next_retry_at TEXT NULL,
      error_message TEXT NULL,
      created_at TEXT NOT NULL,
      processed_at TEXT NULL
    );

    CREATE TABLE IF NOT EXISTS ProcessedEvents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL,
      consumer_name TEXT NOT NULL,
      processed_at TEXT NOT NULL,
      UNIQUE (event_id, consumer_name)
    );

    CREATE TABLE IF NOT EXISTS OutboxEvents (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      queue_name TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 1,
      patient_id TEXT NULL,
      hospital_id TEXT NULL,
      bed_id TEXT NULL,
      sequence_number INTEGER NULL,
      payload TEXT NOT NULL,
      published INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      published_at TEXT NULL
    );

    CREATE TABLE IF NOT EXISTS AuditLogs (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      actor TEXT NOT NULL,
      hospital_id TEXT NULL,
      patient_id TEXT NULL,
      bed_id TEXT NULL,
      summary TEXT NOT NULL,
      metadata TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_beds_hospital_type_status ON Beds(hospital_id, bed_type, status);
    CREATE INDEX IF NOT EXISTS idx_events_status_priority ON Events(status, priority DESC, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_outbox_unpublished ON OutboxEvents(published, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON AuditLogs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_reservations_status_expiry ON BedReservations(status, expires_at);
  `);
}
