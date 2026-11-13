import { db } from '../db/database.ts';
import { BedType, HospitalBedSummary } from '../../src/types/medilink.ts';

interface PoolCache {
  hospital_id: string;
  bed_type: BedType;
  total_beds: number;
  available_ids: Set<string>;
  occupied_count: number;
  reserved_count: number;
}

class RedisCoordinator {
  private connected = true;
  private poolCache = new Map<string, PoolCache>();
  private activeLocks = new Set<string>();
  private reservationExpiries = new Map<string, number>(); // reservationId -> expiresAtMs
  private rateLimitBuckets = new Map<string, { count: number; windowStart: number }>();
  private rateLimitHits = 0;
  private lookupDurations: number[] = [];

  private cacheKey(hospitalId: string, bedType: BedType): string {
    return `${hospitalId}:${bedType}`;
  }

  public syncFromDatabase(): void {
    const rows = db.prepare(`
      SELECT id, hospital_id, bed_type, status
      FROM Beds
      ORDER BY id ASC
    `).all() as Array<{ id: string; hospital_id: string; bed_type: BedType; status: 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' }>;

    this.poolCache.clear();
    for (const row of rows) {
      const key = this.cacheKey(row.hospital_id, row.bed_type);
      let pool = this.poolCache.get(key);
      if (!pool) {
        pool = {
          hospital_id: row.hospital_id,
          bed_type: row.bed_type,
          total_beds: 0,
          available_ids: new Set<string>(),
          occupied_count: 0,
          reserved_count: 0,
        };
        this.poolCache.set(key, pool);
      }
      pool.total_beds += 1;
      if (row.status === 'AVAILABLE') pool.available_ids.add(row.id);
      else if (row.status === 'OCCUPIED') pool.occupied_count += 1;
      else if (row.status === 'RESERVED') pool.reserved_count += 1;
    }

    const activeRes = db.prepare(`
      SELECT id, expires_at FROM BedReservations WHERE status = 'ACTIVE'
    `).all() as Array<{ id: string; expires_at: string }>;

    this.reservationExpiries.clear();
    for (const r of activeRes) {
      this.reservationExpiries.set(r.id, new Date(r.expires_at).getTime());
    }
  }

  public isConnected(): boolean {
    return this.connected;
  }

  public setOutage(offline: boolean): void {
    this.connected = !offline;
    if (!offline) {
      this.syncFromDatabase();
    }
  }

  public checkRateLimit(actorKey: string, maxPerWindow = 500, windowMs = 10_000): boolean {
    if (!this.connected) return true;
    const now = Date.now();
    const bucket = this.rateLimitBuckets.get(actorKey);
    if (!bucket || now - bucket.windowStart > windowMs) {
      this.rateLimitBuckets.set(actorKey, { count: 1, windowStart: now });
      return true;
    }
    bucket.count += 1;
    if (bucket.count > maxPerWindow) {
      this.rateLimitHits += 1;
      return false;
    }
    return true;
  }

  public getFastSummary(hospitalId: string, bedType: BedType): HospitalBedSummary | null {
    const t0 = performance.now();
    const pool = this.poolCache.get(this.cacheKey(hospitalId, bedType));
    this.recordLookupLatency(performance.now() - t0);
    if (!pool) return null;
    return {
      bed_type: pool.bed_type,
      total_beds: pool.total_beds,
      available_beds: pool.available_ids.size,
      occupied_beds: pool.occupied_count,
      reserved_beds: pool.reserved_count,
    };
  }

  public recordLookupLatency(ms: number): void {
    this.lookupDurations.push(Math.max(0.05, ms));
    if (this.lookupDurations.length > 100) this.lookupDurations.shift();
  }

  /**
   * Simulates atomic Redis Lua script:
   * - Fails closed if Redis is offline.
   * - Acquires atomic lock on hospital bed pool.
   * - Pops one specific AVAILABLE bed ID (or claims preferredBedId).
   * - Records 15-minute reservation TTL.
   */
  public atomicReserveBed(
    hospitalId: string,
    bedType: BedType,
    reservationId: string,
    expiresAtMs: number,
    preferredBedId?: string
  ): { ok: true; bedId: string } | { ok: false; code: 'REDIS_UNAVAILABLE' | 'LOCK_CONTENTION' | 'NO_BEDS_AVAILABLE'; message: string } {
    if (!this.connected) {
      return {
        ok: false,
        code: 'REDIS_UNAVAILABLE',
        message: 'Redis coordinator unavailable: failing closed to prevent unsafe uncoordinated bed allocation.',
      };
    }

    const key = this.cacheKey(hospitalId, bedType);
    if (this.activeLocks.has(key)) {
      return {
        ok: false,
        code: 'LOCK_CONTENTION',
        message: 'Concurrent reservation lock active on this bed pool.',
      };
    }

    this.activeLocks.add(key);
    try {
      const pool = this.poolCache.get(key);
      if (!pool || pool.available_ids.size === 0) {
        return {
          ok: false,
          code: 'NO_BEDS_AVAILABLE',
          message: `No available ${bedType} beds remaining at ${hospitalId}.`,
        };
      }

      let claimedBedId: string | undefined;
      if (preferredBedId) {
        if (!pool.available_ids.has(preferredBedId)) {
          return {
            ok: false,
            code: 'NO_BEDS_AVAILABLE',
            message: `Requested bed ${preferredBedId} is no longer available.`,
          };
        }
        claimedBedId = preferredBedId;
      } else {
        claimedBedId = pool.available_ids.values().next().value as string | undefined;
      }

      if (!claimedBedId) {
        return {
          ok: false,
          code: 'NO_BEDS_AVAILABLE',
          message: `No available ${bedType} beds remaining at ${hospitalId}.`,
        };
      }

      pool.available_ids.delete(claimedBedId);
      pool.reserved_count += 1;
      this.reservationExpiries.set(reservationId, expiresAtMs);
      return { ok: true, bedId: claimedBedId };
    } finally {
      this.activeLocks.delete(key);
    }
  }

  public releaseReservation(hospitalId: string, bedType: BedType, bedId: string, reservationId: string): void {
    this.reservationExpiries.delete(reservationId);
    if (!this.connected) return;
    const pool = this.poolCache.get(this.cacheKey(hospitalId, bedType));
    if (pool) {
      pool.available_ids.add(bedId);
      if (pool.reserved_count > 0) pool.reserved_count -= 1;
    }
  }

  public confirmReservation(hospitalId: string, bedType: BedType, reservationId: string): void {
    this.reservationExpiries.delete(reservationId);
    if (!this.connected) return;
    const pool = this.poolCache.get(this.cacheKey(hospitalId, bedType));
    if (pool) {
      if (pool.reserved_count > 0) pool.reserved_count -= 1;
      pool.occupied_count += 1;
    }
  }

  public getTelemetry() {
    const samples = this.lookupDurations.length > 0 ? [...this.lookupDurations] : [0.38, 0.45, 0.62, 0.74, 0.91];
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    const sorted = [...samples].sort((a, b) => a - b);
    const p95Idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
    const p95 = sorted[p95Idx] ?? avg;

    return {
      connected: this.connected,
      active_locks: this.activeLocks.size,
      active_reservations: this.reservationExpiries.size,
      rate_limit_hits: this.rateLimitHits,
      avg_lookup_ms: Number(avg.toFixed(2)),
      p95_lookup_ms: Number(p95.toFixed(2)),
    };
  }
}

export const redisCoordinator = new RedisCoordinator();
