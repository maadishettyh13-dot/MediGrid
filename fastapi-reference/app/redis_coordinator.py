import os
import redis.asyncio as redis

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")

# Atomic Lua script: pops one available bed ID from the hospital/type set,
# creates a 15-minute (900s) reservation lock key, and fails closed if empty.
RESERVE_BED_LUA = """
local pool_key = KEYS[1]
local lock_prefix = ARGV[1]
local reservation_id = ARGV[2]
local ttl_seconds = tonumber(ARGV[3])

local bed_id = redis.call('SPOP', pool_key)
if not bed_id then
    return nil
end

local lock_key = lock_prefix .. bed_id
local acquired = redis.call('SET', lock_key, reservation_id, 'NX', 'EX', ttl_seconds)
if not acquired then
    redis.call('SADD', pool_key, bed_id)
    return nil
end

return bed_id
"""


class RedisCoordinator:
    def __init__(self) -> None:
        self.client = redis.from_url(REDIS_URL, decode_responses=True)
        self._reserve_script = self.client.register_script(RESERVE_BED_LUA)

    async def reserve_bed_atomic(
        self,
        hospital_id: str,
        bed_type: str,
        reservation_id: str,
        ttl_seconds: int = 900,
    ) -> str | None:
        pool_key = f"medigrid:beds:available:{hospital_id}:{bed_type}"
        lock_prefix = "medigrid:bed:lock:"
        bed_id = await self._reserve_script(
            keys=[pool_key],
            args=[lock_prefix, reservation_id, ttl_seconds],
        )
        return bed_id

    async def release_bed_atomic(self, hospital_id: str, bed_type: str, bed_id: str) -> None:
        pool_key = f"medigrid:beds:available:{hospital_id}:{bed_type}"
        lock_key = f"medigrid:bed:lock:{bed_id}"
        async with self.client.pipeline(transaction=True) as pipe:
            pipe.delete(lock_key)
            pipe.sadd(pool_key, bed_id)
            await pipe.execute()

    async def ping(self) -> bool:
        try:
            return bool(await self.client.ping())
        except Exception:
            return False
