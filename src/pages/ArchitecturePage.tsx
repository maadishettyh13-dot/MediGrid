import { ArrowDown, ArrowRight, Database, Layers, Radio, Server, ShieldCheck } from 'lucide-react';

export function ArchitecturePage() {
  return (
    <div className="space-y-6">
      {/* Visual System Architecture Diagram */}
      <div className="bg-[#FFFEFA] border border-[#E7DED2] rounded-xl p-6 space-y-6">
        <div>
          <h2 className="text-base font-bold text-[#702C3B]">MediGrid Event-Driven System Architecture</h2>
          <p className="text-xs text-[#77716D] mt-1">
            Request flow from the three role dashboards through the load balancer, dual stateless API instances, persistent PostgreSQL + Outbox, Redis locks, RabbitMQ independent consumers, and real-time WebSockets.
          </p>
        </div>

        {/* Tier 1: Three Frontend Dashboards */}
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              ['Control Room Dashboard', '42-Hospital Leaflet Map, Filters & Activity'],
              ['Hospital Staff Dashboard', '4,284 Unique Bed IDs, Admit & Discharge'],
              ['Ambulance Dispatch Dashboard', 'Nearest Hospital Search & Atomic Locks'],
            ].map(([title, desc]) => (
              <div key={title} className="p-4 rounded-xl bg-[#F8F3E9] border border-[#E7DED2] text-center">
                <div className="text-xs font-bold text-[#702C3B]">{title}</div>
                <div className="text-[11px] text-[#77716D] mt-1">{desc}</div>
              </div>
            ))}
          </div>

          <div className="flex justify-center">
            <div className="inline-flex items-center gap-2 text-xs font-mono text-[#77716D]">
              <ArrowDown className="w-4 h-4 text-[#702C3B]" aria-hidden="true" />
              <span>HTTPS REST &amp; WebSocket Connections</span>
            </div>
          </div>

          {/* Tier 2: Load Balancer */}
          <div className="max-w-md mx-auto p-4 rounded-xl bg-[#F1E4E5] border border-[#DEC4C8] text-center">
            <div className="text-xs font-bold text-[#702C3B]">Reverse Proxy / Load Balancer (Nginx)</div>
            <div className="text-[11px] text-[#302B2B] mt-1">
              Health checks · Automatic failover &lt; 5s · Round-robin routing
            </div>
          </div>

          <div className="flex justify-center">
            <ArrowDown className="w-4 h-4 text-[#702C3B]" aria-hidden="true" />
          </div>

          {/* Tier 3: Two Stateless Application Instances */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto">
            {[
              ['Application Instance 1 (FastAPI / API Alpha)', 'Stateless HTTP + WebSocket Hub · Port 3001'],
              ['Application Instance 2 (FastAPI / API Beta)', 'Stateless HTTP + WebSocket Hub · Port 3002'],
            ].map(([title, desc]) => (
              <div key={title} className="p-4 rounded-xl bg-[#FFFDF8] border border-[#E7DED2] flex items-center gap-3">
                <Server className="w-5 h-5 text-[#702C3B] shrink-0" aria-hidden="true" />
                <div>
                  <div className="text-xs font-bold text-[#302B2B]">{title}</div>
                  <div className="text-[11px] text-[#77716D] mt-0.5">{desc}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-center">
            <ArrowDown className="w-4 h-4 text-[#702C3B]" aria-hidden="true" />
          </div>

          {/* Tier 4: Shared Data & Messaging Backbone */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-[#F8F3E9] border border-[#E7DED2]">
              <div className="flex items-center gap-2 text-xs font-bold text-[#702C3B]">
                <Database className="w-4 h-4" aria-hidden="true" />
                <span>PostgreSQL (Source of Truth)</span>
              </div>
              <p className="text-[11px] text-[#77716D] mt-1.5 leading-relaxed">
                12 tables (Hospitals, Beds, Patients, Reservations, Transfers, ProcessedEvents, OutboxEvents, AuditLogs) with ACID transactions and partial UNIQUE active-reservation constraints.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#F8F3E9] border border-[#E7DED2]">
              <div className="flex items-center gap-2 text-xs font-bold text-[#702C3B]">
                <Layers className="w-4 h-4" aria-hidden="true" />
                <span>Redis (Fast Cache &amp; Locks)</span>
              </div>
              <p className="text-[11px] text-[#77716D] mt-1.5 leading-relaxed">
                Sub-millisecond bed availability lookup, atomic Lua-style reservation locks, 15-minute reservation TTL tracking, and per-user rate limiting. Fails closed on outage.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#F8F3E9] border border-[#E7DED2]">
              <div className="flex items-center gap-2 text-xs font-bold text-[#702C3B]">
                <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                <span>RabbitMQ (Durable Event Broker)</span>
              </div>
              <p className="text-[11px] text-[#77716D] mt-1.5 leading-relaxed">
                Durable queues, persistent messages, publisher confirms, priority queues (CRITICAL=10 over routine=1), exponential backoff retries, and Dead-Letter Exchanges.
              </p>
            </div>
          </div>

          <div className="flex justify-center">
            <div className="inline-flex items-center gap-2 text-xs font-mono text-[#77716D]">
              <ArrowDown className="w-4 h-4 text-[#702C3B]" aria-hidden="true" />
              <span>Independent Consumer Queues &amp; WebSocket Push (&lt; 2s Dashboard Updates)</span>
            </div>
          </div>

          {/* Tier 5: 4 Independent Consumers + WebSocket Broadcast */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              ['1. Bed Tracking', 'Updates Redis & live bed projections'],
              ['2. Notifications', 'Alerts hospitals & ambulances'],
              ['3. Audit Service', 'Writes immutable AuditLogs'],
              ['4. Transfer Saga', 'Coordinates & rolls back transfers'],
              ['WebSocket Hub', 'Pushes live deltas to all browsers'],
            ].map(([title, desc], i) => (
              <div
                key={title}
                className={`p-3.5 rounded-xl border text-center ${
                  i === 4 ? 'bg-[#F1E4E5] border-[#DEC4C8]' : 'bg-[#FFFDF8] border-[#E7DED2]'
                }`}
              >
                <div className="text-xs font-bold text-[#702C3B] flex items-center justify-center gap-1.5">
                  {i === 4 && <Radio className="w-3.5 h-3.5" aria-hidden="true" />}
                  <span>{title}</span>
                </div>
                <div className="text-[11px] text-[#77716D] mt-1">{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Architecture Decision Record (ADR) */}
      <div className="bg-[#FFFEFA] border border-[#E7DED2] rounded-xl p-6 space-y-5">
        <div className="border-b border-[#E7DED2] pb-3">
          <h2 className="text-base font-bold text-[#702C3B]">Architecture Decision Record (ADR)</h2>
          <p className="text-xs text-[#77716D] mt-0.5">
            Concise engineering rationale for third-year technical defense
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs leading-relaxed">
          <div className="p-4 rounded-xl bg-[#FFFDF8] border border-[#E7DED2]">
            <h3 className="font-bold text-[#702C3B] text-sm mb-1.5">1. Why Redis is Used</h3>
            <p className="text-[#302B2B]">
              Scanning 4,000+ relational bed rows across 40+ hospitals on every ambulance dispatch can add database lock contention. Redis keeps hot availability sets in memory for sub-millisecond searches, enforces per-user rate limiting, and executes single-threaded atomic reservations with 15-minute TTLs.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[#FFFDF8] border border-[#E7DED2]">
            <h3 className="font-bold text-[#702C3B] text-sm mb-1.5">2. Why RabbitMQ is Used</h3>
            <p className="text-[#302B2B]">
              Hospital admissions, notifications, audit trails, and transfer sagas should not block the ambulance reservation HTTP response. RabbitMQ decouples producers from independent consumers using durable queues, publisher confirms, manual ACKs, priority queues, and Dead-Letter Exchanges.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[#FFFDF8] border border-[#E7DED2]">
            <h3 className="font-bold text-[#702C3B] text-sm mb-1.5">3. How Double Allocation is Prevented</h3>
            <p className="text-[#302B2B]">
              Two layers enforce mutual exclusion: (a) Redis executes an atomic lock + pop on the specific Bed ID (failing closed if Redis is unreachable), and (b) PostgreSQL executes an <span className="font-mono">UPDATE ... WHERE status = &apos;AVAILABLE&apos;</span> inside an ACID transaction guarded by a partial <span className="font-mono">UNIQUE(bed_id) WHERE status = &apos;ACTIVE&apos;</span> index.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[#FFFDF8] border border-[#E7DED2]">
            <h3 className="font-bold text-[#702C3B] text-sm mb-1.5">4. How Duplicate Events &amp; Ordering are Handled</h3>
            <p className="text-[#302B2B]">
              Because RabbitMQ provides at-least-once delivery (not magical exactly-once delivery), consumers achieve effectively-once business outcomes via a <span className="font-mono">ProcessedEvents(event_id, consumer_name)</span> unique table and per-patient <span className="font-mono">last_sequence_number</span> checks that reject stale out-of-order events.
            </p>
          </div>

          <div className="md:col-span-2 p-4 rounded-xl bg-[#F8F3E9] border border-[#E7DED2]">
            <h3 className="font-bold text-[#702C3B] text-sm mb-1.5">5. How Failed Operations are Recovered</h3>
            <p className="text-[#302B2B]">
              (a) <strong>Transactional Outbox</strong> ensures events are committed alongside DB writes and relayed once RabbitMQ reconnects. (b) Transient consumer failures retry with exponential backoff before routing to the <strong>Dead-Letter Queue</strong> for operator replay. (c) Rejected or cancelled inter-hospital transfers run <strong>Saga compensating actions</strong> to release held receiving beds. (d) Two stateless API instances behind a load balancer preserve uptime when one instance stops.
            </p>
          </div>
        </div>

        <div className="pt-3 border-t border-[#E7DED2] flex items-center gap-2 text-xs text-[#77716D]">
          <ArrowRight className="w-3.5 h-3.5 text-[#702C3B]" aria-hidden="true" />
          <span>Preview Environment Note: Runs the full Express + WebSocket + SQLite + Coordinator/Broker runtime on port 3000; see docker-compose.yml and fastapi-reference/ for multi-container PostgreSQL, Redis, RabbitMQ, and FastAPI deployment.</span>
        </div>
      </div>
    </div>
  );
}
