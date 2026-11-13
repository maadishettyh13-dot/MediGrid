import { useState } from 'react';
import { CheckCircle2, FlaskConical, Play, RotateCcw, XCircle } from 'lucide-react';
import { SimulationResult } from '../types/medilink';

interface StressTestingPageProps {
  onRefresh: () => void;
}

const SCENARIOS: Array<{
  id: string;
  title: string;
  description: string;
  tag: string;
}> = [
  {
    id: 'last_bed_race',
    title: 'Test 1: Multiple Ambulances, One Bed',
    description: 'Creates 1 available ICU bed (BED-03-ICU-001) and fires 20 simultaneous ambulance requests; strictly 1 succeeds.',
    tag: 'Atomic Locking',
  },
  {
    id: 'priority_over_backlog',
    title: 'Test 2: Critical Priority (10,000 Backlog)',
    description: 'Enqueues 10,000 routine messages (priority 1), then submits 1 CRITICAL emergency request (priority 10) and verifies it pops first.',
    tag: 'Priority Queue',
  },
  {
    id: 'duplicate_event',
    title: 'Test 3: Duplicate Admission Event',
    description: 'Delivers the same PatientAdmitted event ID 5 times and verifies ProcessedEvents records strictly 1 admission.',
    tag: 'Idempotency',
  },
  {
    id: 'out_of_order_events',
    title: 'Test 4: Out-of-Order Patient Events',
    description: 'Applies patient sequence #5 (ADMITTED) and sends delayed sequence #2, verifying older events cannot overwrite newer state.',
    tag: 'Sequence Guard',
  },
  {
    id: 'consumer_failure',
    title: 'Test 5: Consumer Stop & Recovery',
    description: 'Pauses message consumers, publishes durable events, restarts consumers, and confirms pending events drain and ACK.',
    tag: 'Consumer Recovery',
  },
  {
    id: 'rabbitmq_restart',
    title: 'Test 6: RabbitMQ Restart & Durable Queue',
    description: 'Disconnects broker after persisting durable events, reconnects, and confirms recovery without losing accepted messages.',
    tag: 'Broker Durability',
  },
  {
    id: 'redis_outage',
    title: 'Test 7: Redis Failure (Fail-Closed)',
    description: 'Disconnects Redis and verifies unsafe bed reservations are rejected cleanly until Redis recovers.',
    tag: 'Fail-Closed',
  },
  {
    id: 'instance_failover',
    title: 'Test 8: Application Instance Failure',
    description: 'Stops API Node Beta while sending live requests and confirms API Node Alpha serves 100% of traffic.',
    tag: 'High Availability',
  },
  {
    id: 'reservation_expiry',
    title: 'Test 9: Reservation Expiry (<5s Worker)',
    description: 'Creates an unconfirmed reservation and verifies the background expiry worker releases the bed within 5 seconds of expiry.',
    tag: 'TTL Expiry',
  },
];

export function StressTestingPage({ onRefresh }: StressTestingPageProps) {
  const [runningId, setRunningId] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [results, setResults] = useState<SimulationResult[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const runScenario = async (scenarioId: string) => {
    setRunningId(scenarioId);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/simulations/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario: scenarioId }),
      });
      const data = (await res.json()) as { result?: SimulationResult; error?: string };
      if (data.result) {
        setResults((prev) => [data.result!, ...prev].slice(0, 12));
        onRefresh();
      } else if (data.error) {
        setStatusMessage(data.error);
      }
    } finally {
      setRunningId(null);
    }
  };

  const resetDemoData = async () => {
    setResetting(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/simulations/reset', { method: 'POST' });
      if (res.ok) {
        setStatusMessage('Restored clean baseline 42-hospital, 4,284-bed synthetic demonstration dataset.');
        onRefresh();
      }
    } finally {
      setResetting(false);
    }
  };

  const latest = results[0] || null;

  return (
    <div className="space-y-6">
      <div className="bg-[#FFFEFA] border border-[#E7DED2] rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-[#702C3B]">MediGrid Simulation Centre (Live Backend Execution)</h2>
          <p className="text-xs text-[#77716D] mt-1">
            Each test executes real atomic locks, database transactions, Outbox/RabbitMQ queues, and failover routing—never hardcoded responses.
          </p>
        </div>

        <button
          type="button"
          disabled={resetting}
          onClick={resetDemoData}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[#DEC4C8] bg-[#F1E4E5] text-[#702C3B] text-xs font-semibold hover:bg-[#E7D0D3] transition-colors whitespace-nowrap"
        >
          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{resetting ? 'Restoring Baseline...' : 'Reset Demo Dataset'}</span>
        </button>
      </div>

      {statusMessage && (
        <div className="px-4 py-3 rounded-xl bg-[#EAF4EE] border border-[#CBE2D4] text-xs font-medium text-[#1E6B45]">
          {statusMessage}
        </div>
      )}

      {/* Latest Test Output Card */}
      {latest && (
        <div className="bg-[#FFFEFA] border border-[#DEC4C8] rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E7DED2] pb-3">
            <div className="flex items-center gap-2.5">
              {latest.passed ? (
                <CheckCircle2 className="w-5 h-5 text-[#1E6B45]" aria-hidden="true" />
              ) : (
                <XCircle className="w-5 h-5 text-[#702C3B]" aria-hidden="true" />
              )}
              <div>
                <h3 className="text-sm font-bold text-[#302B2B]">{latest.title}</h3>
                <p className="text-xs text-[#77716D]">
                  Result: <strong className={latest.passed ? 'text-[#1E6B45]' : 'text-[#702C3B]'}>{latest.passed ? 'PASSED' : 'FAILED'}</strong> · Duration {latest.duration_ms}ms · Requests: {latest.total_requests.toLocaleString()}
                </p>
              </div>
            </div>
            <span className="font-mono text-xs text-[#77716D] tabular-nums">
              {new Date(latest.timestamp).toLocaleTimeString()}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-[#F8F3E9] border border-[#E7DED2]">
              <div className="font-semibold text-[#702C3B] mb-1">Expected Result</div>
              <div className="text-[#302B2B]">{latest.expected_result}</div>
            </div>
            <div className="p-3 rounded-lg bg-[#F8F3E9] border border-[#E7DED2]">
              <div className="font-semibold text-[#702C3B] mb-1">Actual Result</div>
              <div className="text-[#302B2B]">{latest.actual_result}</div>
            </div>
          </div>

          <p className="text-xs text-[#302B2B] leading-relaxed">{latest.summary}</p>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 pt-1">
            {[
              ['Requests', latest.total_requests.toLocaleString()],
              ['Reserved', latest.successful_reservations],
              ['Rejected', latest.rejected_reservations],
              ['Duplicates Stopped', latest.duplicate_requests_prevented],
              ['Events Processed', latest.events_processed],
              ['Failed Events', latest.failed_events],
              ['Retried', latest.retried_events],
              ['Dead-Lettered', latest.dead_lettered_events],
            ].map(([k, v]) => (
              <div key={String(k)} className="p-2.5 rounded-lg bg-[#FFFDF8] border border-[#E7DED2]">
                <div className="text-[11px] text-[#77716D]">{k}</div>
                <div className="text-base font-bold font-mono tabular-nums text-[#702C3B] mt-0.5">{v}</div>
              </div>
            ))}
          </div>

          {latest.event_logs && latest.event_logs.length > 0 && (
            <div className="pt-2 border-t border-[#E7DED2] space-y-1">
              <div className="text-xs font-semibold text-[#702C3B]">Relevant Event Logs</div>
              {latest.event_logs.map((log, i) => (
                <div key={i} className="text-xs font-mono text-[#77716D]">
                  {log}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 9 Challenge Scenario Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {SCENARIOS.map((sc) => {
          const isRunning = runningId === sc.id;
          return (
            <div
              key={sc.id}
              className="bg-[#FFFEFA] border border-[#E7DED2] rounded-xl p-5 flex flex-col justify-between gap-4"
            >
              <div>
                <div className="flex items-center justify-between gap-2 text-xs text-[#945563] font-medium mb-1.5">
                  <span>{sc.tag}</span>
                  <FlaskConical className="w-3.5 h-3.5" aria-hidden="true" />
                </div>
                <h3 className="text-sm font-bold text-[#302B2B] leading-snug">{sc.title}</h3>
                <p className="text-xs text-[#77716D] mt-2 leading-relaxed">{sc.description}</p>
              </div>

              <button
                type="button"
                disabled={runningId !== null}
                onClick={() => runScenario(sc.id)}
                className="w-full py-2 px-3.5 rounded-lg bg-[#702C3B] hover:bg-[#5B222F] text-[#FFFDF8] text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-55"
              >
                <Play className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{isRunning ? 'Running Live Test...' : 'Run Challenge Test'}</span>
              </button>
            </div>
          );
        })}
      </div>

      {results.length > 1 && (
        <div className="bg-[#FFFEFA] border border-[#E7DED2] rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#E7DED2]">
            <h3 className="text-sm font-bold text-[#702C3B]">Session Test Ledger</h3>
          </div>
          <div className="divide-y divide-[#E7DED2]">
            {results.slice(1).map((r, i) => (
              <div key={i} className="px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  {r.passed ? (
                    <CheckCircle2 className="w-4 h-4 text-[#1E6B45]" />
                  ) : (
                    <XCircle className="w-4 h-4 text-[#702C3B]" />
                  )}
                  <span className="font-semibold text-[#302B2B]">{r.title}</span>
                </div>
                <span className="font-mono tabular-nums text-[#77716D]">
                  {r.passed ? 'PASSED' : 'FAILED'} · {r.duration_ms}ms · {r.total_requests.toLocaleString()} reqs
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
