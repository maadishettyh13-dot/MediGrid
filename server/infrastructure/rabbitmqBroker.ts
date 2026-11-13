import { db } from '../db/database.ts';
import { v4 as uuidv4 } from 'uuid';
import { BrokerEvent, QueueName } from '../../src/types/medilink.ts';

export type EventHandler = (event: BrokerEvent) => Promise<void>;

class RabbitMQBroker {
  private connected = true;
  private consumerPaused = false;
  private failConsumerMode = false;
  private handlers = new Map<QueueName, EventHandler>();
  private processing = false;
  private activeDrain: Promise<number> | null = null;
  private totalPublished = 0;
  private totalAcked = 0;
  private consumerFailures = 0;
  private retryCount = 0;
  private duplicateEventsPrevented = 0;
  private outOfOrderBlocked = 0;
  private eventsInLastSecond = 0;
  private currentEventsPerSec = 0;
  private throughputHistory: Array<{ time: string; events_per_sec: number; search_ms: number; queue_depth: number }> = [];
  private workerTimer: NodeJS.Timeout | null = null;
  private metricsTimer: NodeJS.Timeout | null = null;

  public registerConsumer(queue: QueueName, handler: EventHandler): void {
    this.handlers.set(queue, handler);
  }

  public start(getSearchLatencyMs: () => number): void {
    if (this.workerTimer) return;

    const now = Date.now();
    for (let i = 11; i >= 0; i--) {
      const t = new Date(now - i * 5000);
      this.throughputHistory.push({
        time: t.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        events_per_sec: i === 0 ? 0 : Math.floor(Math.random() * 3) + 1,
        search_ms: Number((0.4 + Math.random() * 0.6).toFixed(2)),
        queue_depth: 0,
      });
    }

    this.workerTimer = setInterval(() => {
      this.flushOutboxToBroker();
      void this.drainQueues();
    }, 100);

    this.metricsTimer = setInterval(() => {
      this.currentEventsPerSec = this.eventsInLastSecond;
      this.eventsInLastSecond = 0;
      const depths = this.getQueueDepths();
      const totalDepth = Object.values(depths).reduce((a, b) => a + b, 0);
      this.throughputHistory.push({
        time: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        events_per_sec: this.currentEventsPerSec,
        search_ms: getSearchLatencyMs(),
        queue_depth: totalDepth,
      });
      if (this.throughputHistory.length > 24) {
        this.throughputHistory.shift();
      }
    }, 1000);
  }

  public stop(): void {
    if (this.workerTimer) clearInterval(this.workerTimer);
    if (this.metricsTimer) clearInterval(this.metricsTimer);
    this.workerTimer = null;
    this.metricsTimer = null;
  }

  public isConnected(): boolean {
    return this.connected;
  }

  public setConnected(state: boolean): void {
    this.connected = state;
    if (state) {
      this.flushOutboxToBroker();
      void this.drainQueues();
    }
  }

  public setConsumerPaused(paused: boolean): void {
    this.consumerPaused = paused;
    if (!paused && this.connected) {
      void this.drainQueues(100);
    }
  }

  public isConsumerPaused(): boolean {
    return this.consumerPaused;
  }

  public setFailConsumerMode(fail: boolean): void {
    this.failConsumerMode = fail;
  }

  public getFailConsumerMode(): boolean {
    return this.failConsumerMode;
  }

  public recordDuplicatePrevented(): void {
    this.duplicateEventsPrevented += 1;
  }

  public recordOutOfOrderBlocked(): void {
    this.outOfOrderBlocked += 1;
  }

  /**
   * Transactional Outbox Relay:
   * Reads committed OutboxEvents and publishes them into durable RabbitMQ queues when broker is online.
   */
  public flushOutboxToBroker(): number {
    if (!this.connected) return 0;
    const pending = db.prepare(`
      SELECT * FROM OutboxEvents WHERE published = 0 ORDER BY priority DESC, created_at ASC LIMIT 50
    `).all() as Array<{
      id: string;
      event_type: string;
      queue_name: QueueName;
      priority: number;
      patient_id: string | null;
      hospital_id: string | null;
      bed_id: string | null;
      sequence_number: number | null;
      payload: string;
      created_at: string;
    }>;

    if (pending.length === 0) return 0;

    const nowIso = new Date().toISOString();
    const insertEvent = db.prepare(`
      INSERT OR IGNORE INTO Events (id, event_type, queue_name, priority, patient_id, hospital_id, bed_id, sequence_number, payload, status, retry_count, max_retries, next_retry_at, error_message, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 0, 3, NULL, NULL, ?)
    `);
    const markPublished = db.prepare(`UPDATE OutboxEvents SET published = 1, published_at = ? WHERE id = ?`);

    const tx = db.transaction(() => {
      for (const row of pending) {
        insertEvent.run(
          row.id,
          row.event_type,
          row.queue_name,
          row.priority,
          row.patient_id,
          row.hospital_id,
          row.bed_id,
          row.sequence_number,
          row.payload,
          row.created_at
        );
        markPublished.run(nowIso, row.id);
        this.totalPublished += 1;
      }
    });
    tx();
    return pending.length;
  }

  /**
   * Publisher Confirm pattern:
   * Persists durable message to SQLite Events table before returning confirm.
   */
  public publishWithConfirm(params: {
    eventId?: string;
    eventType: string;
    queueName: QueueName;
    priority?: number;
    patientId?: string | null;
    hospitalId?: string | null;
    bedId?: string | null;
    sequenceNumber?: number | null;
    payload: Record<string, unknown>;
    maxRetries?: number;
  }): { confirmed: boolean; eventId: string; reason?: string } {
    const eventId = params.eventId || uuidv4();
    if (!this.connected) {
      return {
        confirmed: false,
        eventId,
        reason: 'RabbitMQ broker disconnected: publisher confirm failed.',
      };
    }

    const nowIso = new Date().toISOString();
    db.prepare(`
      INSERT INTO Events (id, event_type, queue_name, priority, patient_id, hospital_id, bed_id, sequence_number, payload, status, retry_count, max_retries, next_retry_at, error_message, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 0, ?, NULL, NULL, ?)
    `).run(
      eventId,
      params.eventType,
      params.queueName,
      params.priority ?? 1,
      params.patientId ?? null,
      params.hospitalId ?? null,
      params.bedId ?? null,
      params.sequenceNumber ?? null,
      JSON.stringify(params.payload),
      params.maxRetries ?? 3,
      nowIso
    );

    this.totalPublished += 1;
    return { confirmed: true, eventId };
  }

  public publishDurableToDisk(params: {
    eventId?: string;
    eventType: string;
    queueName: QueueName;
    priority?: number;
    patientId?: string | null;
    hospitalId?: string | null;
    bedId?: string | null;
    sequenceNumber?: number | null;
    payload: Record<string, unknown>;
    maxRetries?: number;
  }): string {
    const eventId = params.eventId || uuidv4();
    const nowIso = new Date().toISOString();
    db.prepare(`
      INSERT INTO Events (id, event_type, queue_name, priority, patient_id, hospital_id, bed_id, sequence_number, payload, status, retry_count, max_retries, next_retry_at, error_message, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 0, ?, NULL, NULL, ?)
    `).run(
      eventId,
      params.eventType,
      params.queueName,
      params.priority ?? 1,
      params.patientId ?? null,
      params.hospitalId ?? null,
      params.bedId ?? null,
      params.sequenceNumber ?? null,
      JSON.stringify(params.payload),
      params.maxRetries ?? 3,
      nowIso
    );
    this.totalPublished += 1;
    return eventId;
  }

  /**
   * Batch-inserts N routine messages into the durable priority queue inside a single transaction
   * for 10,000-message priority preemption testing.
   */
  public bulkPublishRoutineBacklog(count: number, queueName: QueueName = 'bed_tracking_queue'): number {
    const nowIso = new Date().toISOString();
    const stmt = db.prepare(`
      INSERT INTO Events (id, event_type, queue_name, priority, payload, status, retry_count, max_retries, next_retry_at, error_message, created_at)
      VALUES (?, 'RoutineTelemetry', ?, 1, '{"routine":true}', 'PENDING', 0, 3, NULL, NULL, ?)
    `);

    const tx = db.transaction(() => {
      for (let i = 0; i < count; i++) {
        stmt.run(`bulk-${uuidv4()}`, queueName, nowIso);
      }
    });
    tx();
    this.totalPublished += count;
    return count;
  }

  public clearBulkRoutineTestMessages(): number {
    const res = db.prepare(`DELETE FROM Events WHERE id LIKE 'bulk-%' AND status = 'PENDING'`).run();
    return res.changes;
  }

  public async drainQueues(batchLimit = 40): Promise<number> {
    if (!this.connected || this.consumerPaused) return 0;
    if (this.activeDrain) {
      await this.activeDrain;
      if (!this.connected || this.consumerPaused) return 0;
    }
    if (this.processing) return 0;

    this.processing = true;
    let processedNow = 0;

    const runDrain = async (): Promise<number> => {
      try {
        for (let i = 0; i < batchLimit; i++) {
        if (!this.connected || this.consumerPaused) break;
        const nowIso = new Date().toISOString();
        const row = db.prepare(`
          SELECT * FROM Events
          WHERE (status = 'PENDING' OR (status = 'RETRYING' AND (next_retry_at IS NULL OR next_retry_at <= ?)))
          ORDER BY priority DESC, created_at ASC
          LIMIT 1
        `).get(nowIso) as {
          id: string;
          event_type: string;
          queue_name: QueueName;
          priority: number;
          patient_id: string | null;
          hospital_id: string | null;
          bed_id: string | null;
          sequence_number: number | null;
          payload: string;
          status: BrokerEvent['status'];
          retry_count: number;
          max_retries: number;
          next_retry_at: string | null;
          error_message: string | null;
          created_at: string;
          processed_at: string | null;
        } | undefined;

        if (!row) break;

        db.prepare(`UPDATE Events SET status = 'PROCESSING' WHERE id = ?`).run(row.id);

        const parsedPayload = JSON.parse(row.payload) as Record<string, unknown>;
        const event: BrokerEvent = {
          ...row,
          payload: parsedPayload,
          status: 'PROCESSING',
        };

        const handler = this.handlers.get(row.queue_name);
        try {
          if (!handler) {
            throw new Error(`No registered consumer for queue ${row.queue_name}`);
          }
          if (this.failConsumerMode && parsedPayload.allowSimulatedFailure !== false) {
            throw new Error('Simulated consumer outage / downstream write failure');
          }
          if (parsedPayload.forceDeadLetter === true) {
            throw new Error('Poison message: malformed clinical payload schema');
          }

          await handler(event);

          db.prepare(`
            UPDATE Events SET status = 'ACKED', processed_at = ?, error_message = NULL WHERE id = ?
          `).run(new Date().toISOString(), row.id);

          this.totalAcked += 1;
          this.eventsInLastSecond += 1;
          processedNow += 1;
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : 'Unknown consumer failure';
          const nextRetry = row.retry_count + 1;
          this.consumerFailures += 1;

          if (nextRetry > row.max_retries) {
            db.prepare(`
              UPDATE Events
              SET status = 'DEAD_LETTERED', retry_count = ?, error_message = ?, processed_at = ?
              WHERE id = ?
            `).run(nextRetry, errMsg, new Date().toISOString(), row.id);
          } else {
            this.retryCount += 1;
            const backoffMs = Math.min(4000, 350 * Math.pow(2, nextRetry - 1));
            const nextRetryIso = new Date(Date.now() + backoffMs).toISOString();
            db.prepare(`
              UPDATE Events
              SET status = 'RETRYING', retry_count = ?, next_retry_at = ?, error_message = ?
              WHERE id = ?
            `).run(nextRetry, nextRetryIso, errMsg, row.id);
          }
        }
        }
      } finally {
        this.processing = false;
        this.activeDrain = null;
      }
      return processedNow;
    };

    this.activeDrain = runDrain();
    return this.activeDrain;
  }

  public isEventProcessed(eventId: string, consumerName: string): boolean {
    const existing = db.prepare(`
      SELECT 1 FROM ProcessedEvents WHERE event_id = ? AND consumer_name = ?
    `).get(eventId, consumerName);
    return Boolean(existing);
  }

  public markEventProcessed(eventId: string, consumerName: string): boolean {
    try {
      db.prepare(`
        INSERT INTO ProcessedEvents (event_id, consumer_name, processed_at)
        VALUES (?, ?, ?)
      `).run(eventId, consumerName, new Date().toISOString());
      return true;
    } catch {
      this.duplicateEventsPrevented += 1;
      return false;
    }
  }

  public replayDeadLetterEvent(eventId: string): { ok: boolean; message: string } {
    const row = db.prepare(`SELECT * FROM Events WHERE id = ?`).get(eventId) as { id: string; status: string; payload: string } | undefined;
    if (!row) return { ok: false, message: 'Event not found.' };
    if (row.status !== 'DEAD_LETTERED') return { ok: false, message: 'Only dead-lettered events can be replayed.' };

    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(row.payload);
      delete payload.forceDeadLetter;
      payload.replayedAt = new Date().toISOString();
    } catch {
      payload = { replayedAt: new Date().toISOString() };
    }

    db.prepare(`
      UPDATE Events
      SET status = 'PENDING', retry_count = 0, next_retry_at = NULL, error_message = NULL, payload = ?
      WHERE id = ?
    `).run(JSON.stringify(payload), eventId);

    void this.drainQueues();
    return { ok: true, message: `Event ${eventId.slice(0, 8)} re-queued from Dead-Letter Queue.` };
  }

  public getDeadLetterEvents(limit = 50): BrokerEvent[] {
    const rows = db.prepare(`
      SELECT * FROM Events WHERE status = 'DEAD_LETTERED' ORDER BY created_at DESC LIMIT ?
    `).all(limit) as Array<Omit<BrokerEvent, 'payload'> & { payload: string }>;
    return rows.map((r) => ({ ...r, payload: JSON.parse(r.payload) }));
  }

  public getRecentEvents(limit = 40): BrokerEvent[] {
    const rows = db.prepare(`
      SELECT * FROM Events WHERE id NOT LIKE 'bulk-%' ORDER BY created_at DESC LIMIT ?
    `).all(limit) as Array<Omit<BrokerEvent, 'payload'> & { payload: string }>;
    return rows.map((r) => ({ ...r, payload: JSON.parse(r.payload) }));
  }

  public getQueueDepths(): Record<QueueName, number> {
    const rows = db.prepare(`
      SELECT queue_name, COUNT(*) as c
      FROM Events
      WHERE status IN ('PENDING', 'RETRYING', 'PROCESSING')
      GROUP BY queue_name
    `).all() as Array<{ queue_name: QueueName; c: number }>;

    const depths: Record<QueueName, number> = {
      bed_tracking_queue: 0,
      notification_queue: 0,
      audit_queue: 0,
      transfer_saga_queue: 0,
    };

    for (const r of rows) {
      if (r.queue_name in depths) depths[r.queue_name] = r.c;
    }
    return depths;
  }

  public getTelemetry() {
    const depths = this.getQueueDepths();
    const pendingMessages = Object.values(depths).reduce((a, b) => a + b, 0);
    const dlqCount = (db.prepare(`SELECT COUNT(*) as c FROM Events WHERE status = 'DEAD_LETTERED'`).get() as { c: number }).c;
    const outboxPending = (db.prepare(`SELECT COUNT(*) as c FROM OutboxEvents WHERE published = 0`).get() as { c: number }).c;

    const oldestPending = db.prepare(`
      SELECT created_at FROM Events WHERE status IN ('PENDING', 'RETRYING') ORDER BY created_at ASC LIMIT 1
    `).get() as { created_at: string } | undefined;

    const consumerLagMs = oldestPending
      ? Math.max(0, Date.now() - new Date(oldestPending.created_at).getTime())
      : 0;

    return {
      connected: this.connected,
      consumer_paused: this.consumerPaused,
      events_per_sec: this.currentEventsPerSec,
      total_published: this.totalPublished,
      total_acked: this.totalAcked,
      queue_depths: depths,
      pending_messages: pendingMessages,
      consumer_lag_ms: consumerLagMs,
      consumer_failures: this.consumerFailures,
      retry_count: this.retryCount,
      dlq_count: dlqCount,
      outbox_pending: outboxPending,
      duplicate_events_prevented: this.duplicateEventsPrevented,
      out_of_order_blocked: this.outOfOrderBlocked,
      fail_consumer_mode: this.failConsumerMode,
      throughput_history: [...this.throughputHistory],
    };
  }
}

export const rabbitmqBroker = new RabbitMQBroker();
