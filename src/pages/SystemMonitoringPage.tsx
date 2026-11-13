import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  RefreshCw,
  RotateCcw,
  Server,
  ShieldAlert,
  WifiOff,
} from 'lucide-react';
import { BrokerEvent, DashboardSnapshot } from '../types/medilink';
import { MetricCard } from '../components/MetricCard';

interface SystemMonitoringPageProps {
  snapshot: DashboardSnapshot;
  onRefresh: () => void;
}

function SimpleLineChart({
  data,
  valueKey,
  label,
  unit,
  color,
}: {
  data: Array<{ time: string; events_per_sec: number; search_ms: number; queue_depth: number }>;
  valueKey: 'events_per_sec' | 'search_ms' | 'queue_depth';
  label: string;
  unit: string;
  color: string;
}) {
  const width = 460;
  const height = 135;
  const padX = 28;
  const padY = 16;

  const vals = data.map((d) => d[valueKey]);
  const maxVal = Math.max(1, ...vals);

  const points = data.map((d, idx) => {
    const x = padX + (idx / Math.max(1, data.length - 1)) * (width - padX * 2);
    const y = height - padY - (d[valueKey] / maxVal) * (height - padY * 2);
    return { x, y, val: d[valueKey], time: d.time };
  });

  const polyline = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const latest = data[data.length - 1]?.[valueKey] ?? 0;

  return (
    <div className="bg-[#FFFEFA] border border-[#E7DED2] rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold text-[#702C3B]">{label}</h3>
          <p className="text-xs text-[#77716D]">Live measured rolling 24s window</p>
        </div>
        <div className="text-lg font-bold font-mono tabular-nums text-[#302B2B]">
          {latest} <span className="text-xs font-normal text-[#77716D]">{unit}</span>
        </div>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-36 overflow-visible">
        {[0, 0.5, 1].map((frac) => {
          const y = height - padY - frac * (height - padY * 2);
          return (
            <line
              key={frac}
              x1={padX}
              x2={width - padX}
              y1={y}
              y2={y}
              stroke="#E7DED2"
              strokeDasharray="3 3"
              strokeWidth="1"
            />
          );
        })}
        {points.length > 1 && (
          <polyline
            fill="none"
            stroke={color}
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={polyline}
          />
        )}
        {points.map((p, idx) => (
          <circle key={idx} cx={p.x} cy={p.y} r="2.5" fill={color} />
        ))}
      </svg>

      <div className="flex justify-between text-[10px] font-mono text-[#77716D] mt-1 px-4">
        <span>{data[0]?.time || ''}</span>
        <span>{data[Math.floor(data.length / 2)]?.time || ''}</span>
        <span>{data[data.length - 1]?.time || ''}</span>
      </div>
    </div>
  );
}

export function SystemMonitoringPage({ snapshot, onRefresh }: SystemMonitoringPageProps) {
  const [dlqEvents, setDlqEvents] = useState<BrokerEvent[]>([]);
  const [recentEvents, setRecentEvents] = useState<BrokerEvent[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    const res = await fetch('/api/monitoring/events');
    if (res.ok) {
      const data = (await res.json()) as { dlq: BrokerEvent[]; recent: BrokerEvent[] };
      setDlqEvents(data.dlq || []);
      setRecentEvents(data.recent || []);
    }
  }, []);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents, snapshot.metrics.rabbitmq.total_acked, snapshot.metrics.rabbitmq.dlq_count]);

  const toggleRedis = async () => {
    setBusy('redis');
    await fetch('/api/monitoring/controls/redis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connected: !snapshot.metrics.redis.connected }),
    });
    onRefresh();
    setBusy(null);
  };

  const toggleRabbit = async () => {
    setBusy('rabbit');
    await fetch('/api/monitoring/controls/rabbitmq', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connected: !snapshot.metrics.rabbitmq.connected }),
    });
    onRefresh();
    setBusy(null);
  };

  const togglePauseConsumer = async () => {
    setBusy('pauseConsumer');
    await fetch('/api/monitoring/controls/pause-consumer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paused: !snapshot.metrics.rabbitmq.consumer_paused }),
    });
    onRefresh();
    setBusy(null);
  };

  const toggleInstance = async (id: string, currentStatus: 'ACTIVE' | 'STOPPED') => {
    setBusy(id);
    setFeedback(null);
    const nextStatus = currentStatus === 'ACTIVE' ? 'STOPPED' : 'ACTIVE';
    const res = await fetch('/api/monitoring/controls/instance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instanceId: id, status: nextStatus }),
    });
    const data = (await res.json()) as { error?: string; message?: string };
    setFeedback(data.message || data.error || null);
    onRefresh();
    setBusy(null);
  };

  const handleInjectPoison = async () => {
    setBusy('inject');
    const res = await fetch('/api/monitoring/dlq/inject-poison', { method: 'POST' });
    if (res.ok) {
      setFeedback('Published poison clinical payload -> retried -> routed to Dead-Letter Queue.');
      await loadEvents();
      onRefresh();
    }
    setBusy(null);
  };

  const handleReplay = async (eventId: string) => {
    setBusy(eventId);
    setFeedback(null);
    const res = await fetch(`/api/monitoring/dlq/${eventId}/replay`, { method: 'POST' });
    const data = (await res.json()) as { message?: string; error?: string };
    setFeedback(data.message || data.error || 'Replay triggered.');
    await loadEvents();
    onRefresh();
    setBusy(null);
  };

  const { redis, rabbitmq, instances, throughput_history } = snapshot.metrics;
  const activeInstanceCount = instances.filter((i) => i.status === 'ACTIVE').length;

  return (
    <div className="space-y-6">
      {feedback && (
        <div className="px-4 py-3 rounded-xl bg-[#F1E4E5] border border-[#DEC4C8] text-xs font-medium text-[#702C3B]">
          {feedback}
        </div>
      )}

      {/* Measured Counters Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <MetricCard label="Events / Sec" value={rabbitmq.events_per_sec} sublabel={`Acked: ${rabbitmq.total_acked}`} icon={Activity} emphasize />
        <MetricCard label="Queue Depth & Pending" value={rabbitmq.pending_messages} sublabel={`Outbox pending: ${rabbitmq.outbox_pending}`} icon={Database} />
        <MetricCard label="Consumer Lag" value={`${rabbitmq.consumer_lag_ms} ms`} sublabel={`Failures: ${rabbitmq.consumer_failures} · Retries: ${rabbitmq.retry_count}`} icon={Clock} />
        <MetricCard label="Bed-Search Latency" value={`${redis.avg_lookup_ms} ms`} sublabel={`Measured p95: ${redis.p95_lookup_ms} ms`} icon={Activity} />
        <MetricCard label="Dead-Letter & Nodes" value={`${rabbitmq.dlq_count} DLQ`} sublabel={`${activeInstanceCount}/${instances.length} active instances`} icon={ShieldAlert} emphasize={rabbitmq.dlq_count > 0} />
      </div>

      {/* Available Beds by Category Summary */}
      <div className="bg-[#FFFEFA] border border-[#E7DED2] rounded-xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
        <div>
          <span className="text-[#77716D]">ICU Available</span>
          <div className="text-lg font-bold font-mono tabular-nums text-[#702C3B] mt-0.5">
            {snapshot.networkTotals.icu_available}
          </div>
        </div>
        <div>
          <span className="text-[#77716D]">Ventilator Available</span>
          <div className="text-lg font-bold font-mono tabular-nums text-[#302B2B] mt-0.5">
            {snapshot.networkTotals.ventilator_available}
          </div>
        </div>
        <div>
          <span className="text-[#77716D]">General Available</span>
          <div className="text-lg font-bold font-mono tabular-nums text-[#1E6B45] mt-0.5">
            {snapshot.networkTotals.general_available}
          </div>
        </div>
        <div>
          <span className="text-[#77716D]">Duplicates / Stale Blocked</span>
          <div className="text-lg font-bold font-mono tabular-nums text-[#302B2B] mt-0.5">
            {rabbitmq.duplicate_events_prevented} / {rabbitmq.out_of_order_blocked}
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SimpleLineChart
          data={throughput_history}
          valueKey="events_per_sec"
          label="RabbitMQ Event Throughput"
          unit="events/s"
          color="#702C3B"
        />
        <SimpleLineChart
          data={throughput_history}
          valueKey="search_ms"
          label="Redis Bed-Search Response Time"
          unit="ms"
          color="#945563"
        />
      </div>

      {/* Independent Queue Depths & Fault Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-5 bg-[#FFFEFA] border border-[#E7DED2] rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-[#702C3B]">Independent RabbitMQ Queues</h3>
          <div className="space-y-2">
            {Object.entries(rabbitmq.queue_depths).map(([qName, depth]) => (
              <div key={qName} className="flex items-center justify-between text-xs py-2 border-b border-[#E7DED2] last:border-b-0">
                <span className="font-mono text-[#302B2B]">{qName}</span>
                <span className="font-mono tabular-nums font-semibold text-[#702C3B]">{depth} pending</span>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-7 bg-[#FFFEFA] border border-[#E7DED2] rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-[#702C3B]">Redis, RabbitMQ & Cluster Controls</h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-lg bg-[#FFFDF8] border border-[#E7DED2] flex flex-col justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-[#302B2B]">Redis Cache & Locks</div>
                <div className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium">
                  {redis.connected ? (
                    <span className="text-[#1E6B45] inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Connected
                    </span>
                  ) : (
                    <span className="text-[#702C3B] inline-flex items-center gap-1">
                      <WifiOff className="w-3.5 h-3.5" /> Offline (Fail-Closed)
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                disabled={busy === 'redis'}
                onClick={toggleRedis}
                className="px-3 py-1.5 rounded-lg border border-[#DEC4C8] bg-[#F1E4E5] text-[#702C3B] text-xs font-medium hover:bg-[#E7D0D3]"
              >
                {redis.connected ? 'Disconnect Redis' : 'Reconnect Redis'}
              </button>
            </div>

            <div className="p-3.5 rounded-lg bg-[#FFFDF8] border border-[#E7DED2] flex flex-col justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-[#302B2B]">RabbitMQ Broker</div>
                <div className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium">
                  {rabbitmq.connected ? (
                    <span className="text-[#1E6B45] inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Connected
                    </span>
                  ) : (
                    <span className="text-[#702C3B] inline-flex items-center gap-1">
                      <WifiOff className="w-3.5 h-3.5" /> Restarting / Offline
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                disabled={busy === 'rabbit'}
                onClick={toggleRabbit}
                className="px-3 py-1.5 rounded-lg border border-[#DEC4C8] bg-[#F1E4E5] text-[#702C3B] text-xs font-medium hover:bg-[#E7D0D3]"
              >
                {rabbitmq.connected ? 'Stop RabbitMQ' : 'Restart RabbitMQ'}
              </button>
            </div>

            <div className="p-3.5 rounded-lg bg-[#FFFDF8] border border-[#E7DED2] flex flex-col justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-[#302B2B]">Message Consumers</div>
                <div className="mt-1 text-xs font-medium text-[#77716D]">
                  {rabbitmq.consumer_paused ? 'Paused (Buffering in Queue)' : 'Running & ACKing'}
                </div>
              </div>
              <button
                type="button"
                disabled={busy === 'pauseConsumer'}
                onClick={togglePauseConsumer}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                  rabbitmq.consumer_paused
                    ? 'bg-[#702C3B] text-[#FFFDF8]'
                    : 'border border-[#DEC4C8] bg-[#F1E4E5] text-[#702C3B]'
                }`}
              >
                {rabbitmq.consumer_paused ? 'Resume Consumers' : 'Pause Consumers'}
              </button>
            </div>
          </div>

          <div className="pt-3 border-t border-[#E7DED2] space-y-2.5">
            <div className="text-xs font-semibold text-[#302B2B] flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-[#702C3B]" aria-hidden="true" />
              <span>Application Instances (Shared PostgreSQL, Redis & RabbitMQ)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {instances.map((inst) => (
                <div
                  key={inst.id}
                  className="p-3 rounded-lg bg-[#F8F3E9] border border-[#E7DED2] flex items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <div className="font-semibold text-[#302B2B]">{inst.name}</div>
                    <div className="font-mono text-[#77716D] mt-0.5 tabular-nums">
                      Port :{inst.virtual_port} · {inst.requests_handled} reqs · {inst.status}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={busy === inst.id}
                    onClick={() => toggleInstance(inst.id, inst.status)}
                    className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap ${
                      inst.status === 'ACTIVE'
                        ? 'border border-[#DEC4C8] bg-[#FFFEFA] text-[#702C3B] hover:bg-[#F1E4E5]'
                        : 'bg-[#702C3B] text-[#FFFDF8]'
                    }`}
                  >
                    {inst.status === 'ACTIVE' ? 'Stop Node' : 'Start Node'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Dead-Letter Queue Inspector & Replay */}
      <div className="bg-[#FFFEFA] border border-[#E7DED2] rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#E7DED2] flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-[#702C3B]">Dead-Letter Queue (DLQ) Inspector & Replay</h3>
            <p className="text-xs text-[#77716D] mt-0.5">
              Inspect failed events and replay eligible messages back to active queues
            </p>
          </div>
          <button
            type="button"
            disabled={busy === 'inject'}
            onClick={handleInjectPoison}
            className="px-3 py-1.5 rounded-lg border border-[#DEC4C8] bg-[#F1E4E5] text-[#702C3B] text-xs font-medium hover:bg-[#E7D0D3]"
          >
            Simulate Failed Message (Test DLQ)
          </button>
        </div>

        {dlqEvents.length === 0 ? (
          <div className="p-6 text-center text-xs text-[#77716D]">
            Dead-Letter Queue is currently empty. Click "Simulate Failed Message" above to generate and replay a dead-lettered event.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F8F3E9] border-b border-[#E7DED2] text-xs font-semibold text-[#702C3B]">
                  <th className="py-2.5 px-4">Event ID / Type</th>
                  <th className="py-2.5 px-4">Queue</th>
                  <th className="py-2.5 px-4">Failure Reason</th>
                  <th className="py-2.5 px-4 text-right">Retries</th>
                  <th className="py-2.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E7DED2] text-xs">
                {dlqEvents.map((ev) => (
                  <tr key={ev.id}>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-[#302B2B]">{ev.event_type}</div>
                      <div className="font-mono text-[11px] text-[#77716D]">{ev.id}</div>
                    </td>
                    <td className="py-3 px-4 font-mono">{ev.queue_name}</td>
                    <td className="py-3 px-4 text-[#702C3B]">{ev.error_message || 'Max retries exceeded'}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      {ev.retry_count} / {ev.max_retries}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        disabled={busy === ev.id}
                        onClick={() => handleReplay(ev.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#702C3B] hover:bg-[#5B222F] text-[#FFFDF8] font-medium whitespace-nowrap"
                      >
                        <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Replay Event</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent Broker Event Delivery Log */}
      <div className="bg-[#FFFEFA] border border-[#E7DED2] rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#E7DED2] flex items-center justify-between">
          <h3 className="text-sm font-bold text-[#702C3B]">Recent Broker Event Delivery Log</h3>
          <span className="text-xs text-[#77716D] tabular-nums">Latest {recentEvents.length} durable events</span>
        </div>
        <div className="overflow-x-auto max-h-[260px] overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F8F3E9] border-b border-[#E7DED2] text-xs font-semibold text-[#702C3B]">
                <th className="py-2 px-4">Event</th>
                <th className="py-2 px-4">Queue</th>
                <th className="py-2 px-4 text-right">Priority</th>
                <th className="py-2 px-4">Status</th>
                <th className="py-2 px-4 text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E7DED2] text-xs">
              {recentEvents.map((ev) => (
                <tr key={ev.id}>
                  <td className="py-2 px-4 font-medium text-[#302B2B]">{ev.event_type}</td>
                  <td className="py-2 px-4 font-mono text-[#77716D]">{ev.queue_name}</td>
                  <td className="py-2 px-4 text-right font-mono tabular-nums">{ev.priority}</td>
                  <td className="py-2 px-4 font-mono">{ev.status}</td>
                  <td className="py-2 px-4 text-right font-mono tabular-nums text-[#77716D]">
                    {new Date(ev.created_at).toLocaleTimeString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
