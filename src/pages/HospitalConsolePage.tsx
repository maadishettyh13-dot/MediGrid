import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowRightLeft, BedDouble, CheckCircle2, Clock, Plus, UserPlus } from 'lucide-react';
import {
  BedRecord,
  BedType,
  DashboardSnapshot,
  EmergencyPriority,
  User,
} from '../types/medilink';
import { StatusIndicator } from '../components/StatusBadge';

interface HospitalConsolePageProps {
  snapshot: DashboardSnapshot;
  user: User;
  selectedHospitalId: string;
  onSelectHospital: (id: string) => void;
  onRefresh: () => void;
  onNavigateTransfers: () => void;
}

function CountdownTimer({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const diffSec = Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000));
  const mins = String(Math.floor(diffSec / 60)).padStart(2, '0');
  const secs = String(diffSec % 60).padStart(2, '0');

  return (
    <span className={`font-mono tabular-nums font-semibold ${diffSec < 120 ? 'text-[#702C3B]' : 'text-[#302B2B]'}`}>
      {mins}:{secs}
    </span>
  );
}

export function HospitalConsolePage({
  snapshot,
  user,
  selectedHospitalId,
  onSelectHospital,
  onRefresh,
  onNavigateTransfers,
}: HospitalConsolePageProps) {
  const hospital = useMemo(
    () => snapshot.hospitals.find((h) => h.id === selectedHospitalId) || snapshot.hospitals[0],
    [snapshot.hospitals, selectedHospitalId]
  );

  const [individualBeds, setIndividualBeds] = useState<BedRecord[]>([]);
  const [bedCategoryTab, setBedCategoryTab] = useState<'ALL' | BedType>('ICU');
  const [bedStatusFilter, setBedStatusFilter] = useState<'ALL' | 'AVAILABLE' | 'OCCUPIED' | 'RESERVED'>('ALL');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [admitName, setAdmitName] = useState('');
  const [admitAge, setAdmitAge] = useState('52');
  const [admitCondition, setAdmitCondition] = useState('');
  const [admitBedType, setAdmitBedType] = useState<BedType>('ICU');
  const [admitPriority, setAdmitPriority] = useState<EmergencyPriority>('HIGH');
  const [selectedBedIdForAdmit, setSelectedBedIdForAdmit] = useState<string>('');

  const loadBeds = useCallback(async () => {
    if (!hospital) return;
    const res = await fetch(`/api/hospitals/${hospital.id}/beds`);
    if (res.ok) {
      const data = (await res.json()) as { beds: BedRecord[] };
      setIndividualBeds(data.beds || []);
    }
  }, [hospital]);

  useEffect(() => {
    void loadBeds();
  }, [loadBeds, snapshot.networkTotals.available_beds, snapshot.networkTotals.occupied_beds, snapshot.networkTotals.reserved_beds]);

  if (!hospital) return null;

  const activeReservations = snapshot.reservations.filter(
    (r) => r.hospital_id === hospital.id && r.status === 'ACTIVE'
  );
  const incomingTransfers = snapshot.transfers.filter(
    (t) =>
      t.to_hospital_id === hospital.id &&
      ['REQUESTED', 'PENDING', 'ACCEPTED', 'IN_TRANSIT'].includes(t.status)
  );
  const hospitalLogs = snapshot.auditLogs.filter((l) => l.hospital_id === hospital.id);

  const filteredBeds = individualBeds.filter((b) => {
    if (bedCategoryTab !== 'ALL' && b.bed_type !== bedCategoryTab) return false;
    if (bedStatusFilter !== 'ALL' && b.status !== bedStatusFilter) return false;
    return true;
  });

  const handleAddBed = async (bedType: BedType) => {
    setBusyId(`add-${bedType}`);
    setFeedback(null);
    try {
      const res = await fetch(`/api/hospitals/${hospital.id}/beds/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bedType, count: 1, actor: `${user.name} (${hospital.id})` }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setFeedback({ type: 'err', text: data.error || 'Could not add bed.' });
      } else {
        setFeedback({ type: 'ok', text: `Provisioned 1 new ${bedType} bed with unique ID at ${hospital.name}.` });
        await loadBeds();
        onRefresh();
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleConfirmAdmission = async (reservationId: string) => {
    setBusyId(reservationId);
    setFeedback(null);
    try {
      const res = await fetch(`/api/reservations/${reservationId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: `${user.name} (${hospital.id})` }),
      });
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        setFeedback({ type: 'err', text: data.error || 'Could not confirm admission.' });
      } else {
        setFeedback({ type: 'ok', text: data.message || 'Patient admitted successfully.' });
        await loadBeds();
        onRefresh();
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleForceExpire = async (reservationId: string) => {
    setBusyId(`exp-${reservationId}`);
    setFeedback(null);
    try {
      const res = await fetch(`/api/reservations/${reservationId}/expire-now`, { method: 'POST' });
      if (res.ok) {
        setFeedback({ type: 'ok', text: `Reservation ${reservationId} expired and bed returned to AVAILABLE.` });
        await loadBeds();
        onRefresh();
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleDischargeBed = async (bedId: string) => {
    setBusyId(bedId);
    setFeedback(null);
    try {
      const res = await fetch(`/api/beds/${bedId}/discharge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: `${user.name} (${hospital.id})` }),
      });
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        setFeedback({ type: 'err', text: data.error || 'Discharge failed.' });
      } else {
        setFeedback({ type: 'ok', text: data.message || `Discharged ${bedId}.` });
        await loadBeds();
        onRefresh();
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleWalkInAdmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusyId('walkin');
    setFeedback(null);
    try {
      const res = await fetch(`/api/hospitals/${hospital.id}/admit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bedType: admitBedType,
          preferredBedId: selectedBedIdForAdmit || undefined,
          patientName: admitName,
          age: Number(admitAge),
          condition: admitCondition,
          priority: admitPriority,
          actor: `${user.name} (${hospital.id})`,
        }),
      });
      const data = (await res.json()) as { error?: string; bedId?: string };
      if (!res.ok) {
        setFeedback({ type: 'err', text: data.error || 'Admission failed.' });
      } else {
        setFeedback({ type: 'ok', text: `Admitted ${admitName} into ${data.bedId} (${admitBedType}).` });
        setAdmitName('');
        setAdmitCondition('');
        setSelectedBedIdForAdmit('');
        await loadBeds();
        onRefresh();
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleTransferDecision = async (transferId: string, action: 'accept' | 'reject' | 'complete') => {
    setBusyId(transferId);
    setFeedback(null);
    try {
      const res = await fetch(`/api/transfers/${transferId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: `${user.name} (${hospital.id})`, reason: 'Hospital staff capacity review' }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setFeedback({ type: 'err', text: data.error || `Transfer ${action} failed.` });
      } else {
        setFeedback({ type: 'ok', text: `Transfer ${transferId} updated (${action}).` });
        await loadBeds();
        onRefresh();
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Hospital Selector & Capacity Summary Header */}
      <div className="bg-[#FFFEFA] border border-[#E7DED2] rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-bold text-[#702C3B]">{hospital.name}</h2>
            <StatusIndicator variant={hospital.status} />
          </div>
          <p className="text-xs text-[#77716D] mt-1 font-mono">
            {hospital.id} · Capacity: {hospital.total_capacity} · Avail: {hospital.available_total} · Occ: {hospital.occupied_total} · Res: {hospital.reserved_total}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onNavigateTransfers}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#DEC4C8] bg-[#F1E4E5] text-[#702C3B] text-xs font-medium hover:bg-[#E7D0D3]"
          >
            <ArrowRightLeft className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Initiate Transfer</span>
          </button>

          <select
            aria-label="Select hospital facility"
            value={hospital.id}
            onChange={(e) => onSelectHospital(e.target.value)}
            className="px-3 py-2 rounded-lg bg-[#FFFDF8] border border-[#E7DED2] text-xs font-medium text-[#302B2B] focus:outline-none focus:border-[#702C3B]"
          >
            {snapshot.hospitals.map((h) => (
              <option key={h.id} value={h.id}>
                {h.id} · {h.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {feedback && (
        <div
          className={`px-4 py-3 rounded-xl border text-xs font-medium ${
            feedback.type === 'ok'
              ? 'bg-[#EAF4EE] border-[#CBE2D4] text-[#1E6B45]'
              : 'bg-[#F1E4E5] border-[#DEC4C8] text-[#702C3B]'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* 3 Category Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {(['ICU', 'VENTILATOR', 'GENERAL'] as BedType[]).map((bType) => {
          const bed = hospital.beds.find((b) => b.bed_type === bType);
          return (
            <div key={bType} className="bg-[#FFFEFA] border border-[#E7DED2] rounded-xl p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-[#702C3B]">{bType} Category</span>
                  <BedDouble className="w-4 h-4 text-[#945563]" aria-hidden="true" />
                </div>

                <div className="grid grid-cols-4 gap-2 mt-4 pt-4 border-t border-[#E7DED2] text-center">
                  <div>
                    <div className="text-[11px] text-[#77716D]">Total</div>
                    <div className="text-lg font-bold font-mono tabular-nums text-[#302B2B] mt-0.5">
                      {bed?.total_beds ?? 0}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-[#77716D]">Available</div>
                    <div className="text-lg font-bold font-mono tabular-nums text-[#1E6B45] mt-0.5">
                      {bed?.available_beds ?? 0}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-[#77716D]">Reserved</div>
                    <div className="text-lg font-bold font-mono tabular-nums text-[#702C3B] mt-0.5">
                      {bed?.reserved_beds ?? 0}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-[#77716D]">Occupied</div>
                    <div className="text-lg font-bold font-mono tabular-nums text-[#302B2B] mt-0.5">
                      {bed?.occupied_beds ?? 0}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-[#E7DED2] flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setBedCategoryTab(bType)}
                  className="text-xs font-medium text-[#702C3B] hover:underline"
                >
                  Filter {bType} Bed IDs
                </button>
                <button
                  type="button"
                  disabled={busyId === `add-${bType}`}
                  onClick={() => handleAddBed(bType)}
                  className="px-3 py-1 rounded-lg border border-[#DEC4C8] bg-[#F1E4E5] text-[#702C3B] text-xs font-medium hover:bg-[#E7D0D3]"
                >
                  + Add Bed ID
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Split */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-8 space-y-6">
          {/* Active Ambulance Reservations */}
          <div className="bg-[#FFFEFA] border border-[#E7DED2] rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#E7DED2] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#702C3B]" aria-hidden="true" />
                <h3 className="text-sm font-bold text-[#702C3B]">Incoming Bed Reservations (15-Min Atomic Hold)</h3>
              </div>
              <span className="text-xs text-[#77716D] tabular-nums">{activeReservations.length} active</span>
            </div>

            {activeReservations.length === 0 ? (
              <div className="p-6 text-center text-xs text-[#77716D]">
                No pending ambulance bed reservations at {hospital.name}.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#F8F3E9] border-b border-[#E7DED2] text-xs font-semibold text-[#702C3B]">
                      <th className="py-2.5 px-4">Patient</th>
                      <th className="py-2.5 px-4">Bed ID & Unit</th>
                      <th className="py-2.5 px-4">Priority</th>
                      <th className="py-2.5 px-4">Countdown</th>
                      <th className="py-2.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E7DED2] text-xs">
                    {activeReservations.map((r) => (
                      <tr key={r.id}>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-[#302B2B]">{r.patient_name || r.patient_id}</div>
                          <div className="font-mono text-[11px] text-[#77716D]">{r.id}</div>
                        </td>
                        <td className="py-3 px-4 font-mono">
                          <div className="font-semibold text-[#702C3B]">{r.bed_id}</div>
                          <div className="text-[11px] text-[#77716D]">{r.ambulance_call_sign || 'Transfer'} · {r.bed_type}</div>
                        </td>
                        <td className="py-3 px-4">
                          <StatusIndicator variant={r.priority} />
                        </td>
                        <td className="py-3 px-4">
                          <CountdownTimer expiresAt={r.expires_at} />
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              disabled={busyId === r.id}
                              onClick={() => handleConfirmAdmission(r.id)}
                              className="px-3 py-1.5 rounded-lg bg-[#702C3B] hover:bg-[#5B222F] text-[#FFFDF8] font-medium whitespace-nowrap"
                            >
                              Admit Patient
                            </button>
                            <button
                              type="button"
                              disabled={busyId === `exp-${r.id}`}
                              onClick={() => handleForceExpire(r.id)}
                              className="px-2.5 py-1.5 rounded-lg border border-[#DEC4C8] bg-[#F1E4E5] text-[#702C3B] font-medium hover:bg-[#E7D0D3] whitespace-nowrap"
                            >
                              Expire TTL
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Individual Bed Registry (Every Bed Has a Unique ID) */}
          <div className="bg-[#FFFEFA] border border-[#E7DED2] rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#E7DED2] flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-[#702C3B]">Individual Bed Registry (Unique Bed IDs)</h3>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 bg-[#F8F3E9] p-1 rounded-lg border border-[#E7DED2]">
                  {(['ICU', 'VENTILATOR', 'GENERAL', 'ALL'] as const).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setBedCategoryTab(cat)}
                      className={`px-2.5 py-1 rounded text-xs font-medium ${
                        bedCategoryTab === cat ? 'bg-[#702C3B] text-[#FFFDF8]' : 'text-[#302B2B] hover:bg-[#EAE1D3]'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                <select
                  aria-label="Filter bed status"
                  value={bedStatusFilter}
                  onChange={(e) => setBedStatusFilter(e.target.value as 'ALL' | 'AVAILABLE' | 'OCCUPIED' | 'RESERVED')}
                  className="px-2.5 py-1.5 rounded-lg bg-[#FFFDF8] border border-[#E7DED2] text-xs"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="AVAILABLE">Available</option>
                  <option value="OCCUPIED">Occupied</option>
                  <option value="RESERVED">Reserved</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto max-h-[340px] overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-[#F8F3E9] border-b border-[#E7DED2] text-xs font-semibold text-[#702C3B]">
                    <th className="py-2.5 px-4">Bed ID</th>
                    <th className="py-2.5 px-4">Category</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4">Assigned Patient</th>
                    <th className="py-2.5 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E7DED2] text-xs">
                  {filteredBeds.map((b) => (
                    <tr key={b.id}>
                      <td className="py-2.5 px-4 font-mono font-semibold text-[#302B2B]">{b.id}</td>
                      <td className="py-2.5 px-4 font-mono">{b.bed_type}</td>
                      <td className="py-2.5 px-4">
                        <StatusIndicator variant={b.status} />
                      </td>
                      <td className="py-2.5 px-4 text-[#77716D]">
                        {b.patient_name ? `${b.patient_name} (${b.patient_id})` : b.status === 'OCCUPIED' ? 'Inpatient Occupant' : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        {b.status === 'OCCUPIED' ? (
                          <button
                            type="button"
                            disabled={busyId === b.id}
                            onClick={() => handleDischargeBed(b.id)}
                            className="px-3 py-1 rounded-lg border border-[#DEC4C8] bg-[#F1E4E5] text-[#702C3B] font-medium hover:bg-[#E7D0D3] whitespace-nowrap"
                          >
                            Discharge Patient
                          </button>
                        ) : b.status === 'AVAILABLE' ? (
                          <button
                            type="button"
                            onClick={() => {
                              setAdmitBedType(b.bed_type);
                              setSelectedBedIdForAdmit(b.id);
                            }}
                            className="px-3 py-1 rounded-lg bg-[#702C3B] text-[#FFFDF8] font-medium hover:bg-[#5B222F] whitespace-nowrap"
                          >
                            Select for Admit
                          </button>
                        ) : (
                          <span className="font-mono text-[#77716D]">Held</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Incoming Transfers */}
          <div className="bg-[#FFFEFA] border border-[#E7DED2] rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#E7DED2] flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#702C3B]">Incoming Inter-Hospital Transfers</h3>
              <span className="text-xs text-[#77716D] tabular-nums">{incomingTransfers.length} active</span>
            </div>
            {incomingTransfers.length === 0 ? (
              <div className="p-6 text-center text-xs text-[#77716D]">
                No pending incoming transfer requests for {hospital.name}.
              </div>
            ) : (
              <div className="divide-y divide-[#E7DED2]">
                {incomingTransfers.map((trf) => (
                  <div key={trf.id} className="p-4 flex flex-wrap items-center justify-between gap-4 text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-[#302B2B]">{trf.patient_name}</span>
                        <StatusIndicator variant={trf.status} />
                        <StatusIndicator variant={trf.priority} />
                      </div>
                      <p className="text-[#77716D] mt-1">
                        From {trf.from_hospital_name} · Needs {trf.required_bed_type} · {trf.reason}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {(trf.status === 'REQUESTED' || trf.status === 'PENDING') && (
                        <>
                          <button
                            type="button"
                            disabled={busyId === trf.id}
                            onClick={() => handleTransferDecision(trf.id, 'accept')}
                            className="px-3 py-1.5 rounded-lg bg-[#702C3B] hover:bg-[#5B222F] text-[#FFFDF8] font-medium"
                          >
                            Accept Transfer
                          </button>
                          <button
                            type="button"
                            disabled={busyId === trf.id}
                            onClick={() => handleTransferDecision(trf.id, 'reject')}
                            className="px-3 py-1.5 rounded-lg border border-[#DEC4C8] bg-[#F1E4E5] text-[#702C3B] font-medium"
                          >
                            Reject Transfer
                          </button>
                        </>
                      )}
                      {(trf.status === 'ACCEPTED' || trf.status === 'IN_TRANSIT') && (
                        <button
                          type="button"
                          disabled={busyId === trf.id}
                          onClick={() => handleTransferDecision(trf.id, 'complete')}
                          className="px-3 py-1.5 rounded-lg bg-[#702C3B] hover:bg-[#5B222F] text-[#FFFDF8] font-medium"
                        >
                          Complete Transfer
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Admit Patient Form & Facility Logs */}
        <div className="xl:col-span-4 space-y-6">
          <form onSubmit={handleWalkInAdmit} className="bg-[#FFFEFA] border border-[#E7DED2] rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-[#702C3B]" aria-hidden="true" />
              <h3 className="text-sm font-bold text-[#702C3B]">Admit Patient to Hospital Bed</h3>
            </div>

            {selectedBedIdForAdmit && (
              <div className="px-3 py-2 rounded-lg bg-[#F1E4E5] border border-[#DEC4C8] text-xs flex items-center justify-between">
                <span className="font-mono text-[#702C3B] font-semibold">Target: {selectedBedIdForAdmit}</span>
                <button
                  type="button"
                  onClick={() => setSelectedBedIdForAdmit('')}
                  className="text-[#702C3B] underline"
                >
                  Auto-pick
                </button>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-[#302B2B] mb-1">Patient Full Name</label>
              <input
                type="text"
                required
                value={admitName}
                onChange={(e) => setAdmitName(e.target.value)}
                placeholder="e.g. Evelyn Harper"
                className="w-full px-3 py-2 rounded-lg bg-[#FFFDF8] border border-[#E7DED2] text-xs focus:outline-none focus:border-[#702C3B]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#302B2B] mb-1">Age</label>
                <input
                  type="number"
                  min={1}
                  max={115}
                  required
                  value={admitAge}
                  onChange={(e) => setAdmitAge(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#FFFDF8] border border-[#E7DED2] text-xs font-mono focus:outline-none focus:border-[#702C3B]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#302B2B] mb-1">Bed Category</label>
                <select
                  value={admitBedType}
                  onChange={(e) => {
                    setAdmitBedType(e.target.value as BedType);
                    setSelectedBedIdForAdmit('');
                  }}
                  className="w-full px-3 py-2 rounded-lg bg-[#FFFDF8] border border-[#E7DED2] text-xs focus:outline-none focus:border-[#702C3B]"
                >
                  <option value="ICU">ICU</option>
                  <option value="VENTILATOR">Ventilator</option>
                  <option value="GENERAL">General</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#302B2B] mb-1">Clinical Condition</label>
              <input
                type="text"
                required
                value={admitCondition}
                onChange={(e) => setAdmitCondition(e.target.value)}
                placeholder="e.g. Acute Pulmonary Edema"
                className="w-full px-3 py-2 rounded-lg bg-[#FFFDF8] border border-[#E7DED2] text-xs focus:outline-none focus:border-[#702C3B]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#302B2B] mb-1">Priority</label>
              <select
                value={admitPriority}
                onChange={(e) => setAdmitPriority(e.target.value as EmergencyPriority)}
                className="w-full px-3 py-2 rounded-lg bg-[#FFFDF8] border border-[#E7DED2] text-xs focus:outline-none focus:border-[#702C3B]"
              >
                <option value="CRITICAL">CRITICAL</option>
                <option value="HIGH">HIGH</option>
                <option value="NORMAL">NORMAL</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={busyId === 'walkin'}
              className="w-full py-2.5 px-4 rounded-lg bg-[#702C3B] hover:bg-[#5B222F] text-[#FFFDF8] text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Admit Patient ({admitBedType})</span>
            </button>
          </form>

          <div className="bg-[#FFFEFA] border border-[#E7DED2] rounded-xl overflow-hidden">
            <div className="px-4 py-3.5 border-b border-[#E7DED2] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#702C3B]" aria-hidden="true" />
                <h3 className="text-sm font-bold text-[#702C3B]">Facility Event Log</h3>
              </div>
              <span className="text-xs text-[#77716D] tabular-nums">{hospitalLogs.length}</span>
            </div>
            <div className="divide-y divide-[#E7DED2] max-h-[340px] overflow-y-auto">
              {hospitalLogs.length === 0 ? (
                <div className="p-5 text-center text-xs text-[#77716D]">No events recorded yet for {hospital.id}.</div>
              ) : (
                hospitalLogs.map((l) => (
                  <div key={l.id} className="p-3.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[#702C3B]">{l.event_type}</span>
                      <span className="font-mono text-[#77716D]">
                        {new Date(l.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-[#302B2B] mt-1">{l.summary}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
