import asyncio
import json
import os
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from . import database
from .redis_coordinator import RedisCoordinator
from .rabbitmq_broker import RabbitMQBroker

INSTANCE_ID = os.getenv("INSTANCE_ID", "medigrid-api-1")
redis_coord = RedisCoordinator()
broker = RabbitMQBroker()


async def reservation_expiry_worker() -> None:
    """Reclaim expired 15-minute reservations within 5 seconds of expiry."""
    while True:
        try:
            pool = await database.init_db_pool()
            async with pool.acquire() as conn:
                async with conn.transaction():
                    expired_rows = await conn.fetch(
                        """
                        UPDATE bed_reservations
                        SET status = 'EXPIRED'
                        WHERE status = 'ACTIVE' AND expires_at <= NOW()
                        RETURNING id, hospital_id, bed_id, bed_type, patient_id
                        """
                    )
                    for row in expired_rows:
                        await conn.execute(
                            "UPDATE beds SET status = 'AVAILABLE', patient_id = NULL, updated_at = NOW() WHERE id = $1",
                            row["bed_id"],
                        )
                        await redis_coord.release_bed_atomic(row["hospital_id"], row["bed_type"], row["bed_id"])
                        await broker.publish_event(
                            event_id=f"EVT-{uuid.uuid4().hex[:8]}",
                            event_type="ReservationExpired",
                            priority=5,
                            payload=dict(row),
                        )
        except Exception:
            pass
        await asyncio.sleep(1.0)


@asynccontextmanager
async def lifespan(app: FastAPI):
    pool = await database.init_db_pool()
    async with pool.acquire() as conn:
        await conn.execute(database.SCHEMA_SQL)
    await broker.connect()
    expiry_task = asyncio.create_task(reservation_expiry_worker())
    try:
        yield
    finally:
        expiry_task.cancel()
        await broker.close()
        await database.close_db_pool()


app = FastAPI(title="MediGrid API", version="1.0.0", lifespan=lifespan)


class ReserveRequest(BaseModel):
    hospital_id: str
    bed_type: str
    patient_id: str
    ambulance_id: str | None = None
    priority: str = "CRITICAL"


@app.get("/health")
async def health():
    redis_ok = await redis_coord.ping()
    return {"status": "ok" if redis_ok else "degraded", "instance_id": INSTANCE_ID, "redis": redis_ok}


@app.post("/api/reservations")
async def reserve_bed(req: ReserveRequest):
    if not await redis_coord.ping():
        raise HTTPException(status_code=503, detail="Redis coordinator offline; failing closed")

    reservation_id = f"RES-{uuid.uuid4().hex[:8]}"
    bed_id = await redis_coord.reserve_bed_atomic(req.hospital_id, req.bed_type, reservation_id, ttl_seconds=900)
    if not bed_id:
        raise HTTPException(status_code=409, detail="No available beds of requested category")

    expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)
    pool = await database.init_db_pool()
    try:
        async with pool.acquire() as conn:
            async with conn.transaction():
                updated = await conn.execute(
                    "UPDATE beds SET status = 'RESERVED', patient_id = $1, updated_at = NOW() WHERE id = $2 AND status = 'AVAILABLE'",
                    req.patient_id,
                    bed_id,
                )
                if updated != "UPDATE 1":
                    raise HTTPException(status_code=409, detail="Bed contention conflict")

                await conn.execute(
                    """
                    INSERT INTO bed_reservations
                    (id, hospital_id, bed_id, bed_type, patient_id, ambulance_id, priority, status, expires_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', $8)
                    """,
                    reservation_id,
                    req.hospital_id,
                    bed_id,
                    req.bed_type,
                    req.patient_id,
                    req.ambulance_id,
                    req.priority,
                    expires_at,
                )

                priority_score = 10 if req.priority == "CRITICAL" else 5 if req.priority == "HIGH" else 1
                event_id = f"EVT-{uuid.uuid4().hex[:8]}"
                await conn.execute(
                    """
                    INSERT INTO outbox_events (id, event_type, queue_name, priority, payload)
                    VALUES ($1, 'BedReserved', 'medigrid.emergency.events', $2, $3::jsonb)
                    """,
                    event_id,
                    priority_score,
                    json.dumps({"reservation_id": reservation_id, "hospital_id": req.hospital_id, "bed_id": bed_id}),
                )
        await broker.publish_event(event_id, "BedReserved", priority_score, {"reservation_id": reservation_id, "bed_id": bed_id})
        return {"reservation_id": reservation_id, "bed_id": bed_id, "expires_at": expires_at.isoformat(), "instance_id": INSTANCE_ID}
    except Exception:
        await redis_coord.release_bed_atomic(req.hospital_id, req.bed_type, bed_id)
        raise
