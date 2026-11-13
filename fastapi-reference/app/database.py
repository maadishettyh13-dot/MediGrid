import os
import asyncpg

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://medigrid:medigrid_dev_password@postgres:5432/medigrid",
)

pool: asyncpg.Pool | None = None


async def init_db_pool() -> asyncpg.Pool:
    global pool
    if pool is None:
        pool = await asyncpg.create_pool(DATABASE_URL, min_size=5, max_size=25)
    return pool


async def close_db_pool() -> None:
    global pool
    if pool is not None:
        await pool.close()
        pool = None


SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS hospitals (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    address TEXT NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    phone TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('OPERATIONAL', 'SURGE', 'OFFLINE')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS beds (
    id TEXT PRIMARY KEY,
    hospital_id TEXT NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    bed_type TEXT NOT NULL CHECK (bed_type IN ('ICU', 'VENTILATOR', 'GENERAL')),
    status TEXT NOT NULL CHECK (status IN ('AVAILABLE', 'OCCUPIED', 'RESERVED')),
    patient_id TEXT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bed_reservations (
    id TEXT PRIMARY KEY,
    hospital_id TEXT NOT NULL REFERENCES hospitals(id),
    bed_id TEXT NOT NULL REFERENCES beds(id),
    bed_type TEXT NOT NULL CHECK (bed_type IN ('ICU', 'VENTILATOR', 'GENERAL')),
    patient_id TEXT NOT NULL,
    ambulance_id TEXT NULL,
    priority TEXT NOT NULL CHECK (priority IN ('CRITICAL', 'HIGH', 'NORMAL')),
    status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'CONFIRMED', 'EXPIRED', 'CANCELLED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    confirmed_at TIMESTAMPTZ NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_bed_reservation
    ON bed_reservations(bed_id) WHERE status = 'ACTIVE';

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_patient_reservation
    ON bed_reservations(patient_id) WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS outbox_events (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    queue_name TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 1,
    payload JSONB NOT NULL,
    published BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at TIMESTAMPTZ NULL
);

CREATE TABLE IF NOT EXISTS processed_events (
    event_id TEXT NOT NULL,
    consumer_name TEXT NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (event_id, consumer_name)
);
"""
