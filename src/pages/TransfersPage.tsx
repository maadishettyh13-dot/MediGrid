import { useState, type FormEvent } from 'react';
import { ArrowRight, ArrowRightLeft } from 'lucide-react';
import { BedType, DashboardSnapshot, EmergencyPriority, User } from '../types/medilink';
import { StatusIndicator } from '../components/StatusBadge';

interface TransfersPageProps {
  snapshot: DashboardSnapshot;
  user: User;
  onRefresh: () => void;
}

export function TransfersPage({ snapshot, user, onRefresh }: TransfersPageProps) {
  const admittedPatients = snapshot.patients.filter((p) => p.status === 'ADMITTED' && p.hospital_id);

  const [patientId, setPatientId] = useState(admittedPatients[0]?.id || '');
  const [toHospitalId, setToHospitalId] = useState(snapshot.hospitals[0]?.id || 'HOSP-01');
  const [requiredBedType, setRequiredBedType] = useState<BedType>('ICU');
  const [priority, setPriority] = useState<EmergencyPriority>('HIGH');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const selectedPatient = admittedPatients.find((p) => p.id === patientId) || admittedPatients[0];
  const fromHospitalId = selectedPatient?.hospital_id || user.hospital_id || 'HOSP-07';

  const handleCreateTransfer = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) {
      setFeedback({ type: 'err', text: 'Select an admitted patient to initiate transfer.' });
      return;
    }

    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: selectedPatient.id,
          fromHospitalId,
          toHospitalId,
          requiredBedType,
          priority,
          reason,
          actor: user.name,
        }),
      });
      const data = (await res.json()) as { error?: string; transfer?: { id: string } };
      if (!res.ok) {
        setFeedback({ type: 'err', text: data.error || 'Could not create transfer request.' });
        return;
      }
      setFeedback({
        type: 'ok',
        text: `Transfer ${data.transfer?.id} dispatched to receiving hospital via transfer_saga_queue.`,
      });
      setReason('');
      onRefresh();
    } finally {
      setSubmitting(false);
    }
  };

  const handleSagaAction = async (
    transferId: string,
    action: 'accept' | 'transit' | 'complete' | 'reject' | 'cancel'
  ) => {
    setBusyId(transferId);
    setFeedback(null);
    try {
      const res = await fetch(`/api/transfers/${transferId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actor: user.name,
          reason: action === 'reject' ? 'Receiving unit capacity declined' : 'Cancelled by coordinator',
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setFeedback({ type: 'err', text: data.error || `Failed to execute ${action}.` });
        return;
      }
      setFeedback({
        type: 'ok',
        text:
          action === 'reject' || action === 'cancel'
            ? `Transfer ${transferId} ${action}ed. Saga compensating rollback released reserved bed.`
            : `Transfer ${transferId} updated (${action}).`,
      });
      onRefresh();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
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

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <form
          onSubmit={handleCreateTransfer}
          className="xl:col-span-4 bg-[#FFFEFA] border border-[#E7DED2] rounded-xl p-6 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-[#E7DED2] pb-3">
            <div>
              <h2 className="text-base font-bold text-[#702C3B]">Create Transfer Request</h2>
              <p className="text-xs text-[#77716D] mt-0.5">Saga-coordinated inter-hospital handoff</p>
            </div>
            <ArrowRightLeft className="w-4 h-4 text-[#945563]" aria-hidden="true" />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#302B2B] mb-1">Admitted Patient</label>
            <select
              value={selectedPatient?.id || ''}
              onChange={(e) => setPatientId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#FFFDF8] border border-[#E7DED2] text-xs focus:outline-none focus:border-[#702C3B]"
            >
              {admittedPatients.length === 0 ? (
                <option value="">No admitted patients available</option>
              ) : (
                admittedPatients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.hospital_id} · {p.bed_id || p.bed_type})
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#302B2B] mb-1">Receiving Hospital</label>
            <select
              value={toHospitalId}
              onChange={(e) => setToHospitalId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#FFFDF8] border border-[#E7DED2] text-xs focus:outline-none focus:border-[#702C3B]"
            >
              {snapshot.hospitals
                .filter((h) => h.id !== fromHospitalId)
                .map((h) => {
                  const avail = h.beds.find((b) => b.bed_type === requiredBedType)?.available_beds ?? 0;
                  return (
                    <option key={h.id} value={h.id}>
                      {h.name} ({avail} {requiredBedType} free)
                    </option>
                  );
                })}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#302B2B] mb-1">Required Bed</label>
              <select
                value={requiredBedType}
                onChange={(e) => setRequiredBedType(e.target.value as BedType)}
                className="w-full px-3 py-2 rounded-lg bg-[#FFFDF8] border border-[#E7DED2] text-xs focus:outline-none focus:border-[#702C3B]"
              >
                <option value="ICU">ICU</option>
                <option value="VENTILATOR">Ventilator</option>
                <option value="GENERAL">General</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#302B2B] mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as EmergencyPriority)}
                className="w-full px-3 py-2 rounded-lg bg-[#FFFDF8] border border-[#E7DED2] text-xs focus:outline-none focus:border-[#702C3B]"
              >
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="NORMAL">Normal</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#302B2B] mb-1">Clinical Reason</label>
            <textarea
              required
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Escalation to specialized Cardiac ICU"
              className="w-full px-3 py-2 rounded-lg bg-[#FFFDF8] border border-[#E7DED2] text-xs focus:outline-none focus:border-[#702C3B]"
            />
          </div>

          <button
            type="submit"
            disabled={submitting || !selectedPatient}
            className="w-full py-2.5 px-4 rounded-lg bg-[#702C3B] hover:bg-[#5B222F] text-[#FFFDF8] text-xs font-semibold transition-colors disabled:opacity-50"
          >
            {submitting ? 'Dispatching Saga...' : 'Initiate Transfer Request'}
          </button>
        </form>

        <div className="xl:col-span-8 bg-[#FFFEFA] border border-[#E7DED2] rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#E7DED2] flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#702C3B]">Transfer History & Saga Workflows</h2>
            <span className="text-xs text-[#77716D] tabular-nums">{snapshot.transfers.length} transfers</span>
          </div>

          <div className="divide-y divide-[#E7DED2]">
            {snapshot.transfers.map((trf) => (
              <div key={trf.id} className="p-5 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-[#302B2B]">{trf.patient_name}</span>
                      <span className="font-mono text-xs text-[#77716D]">{trf.id}</span>
                      <StatusIndicator variant={trf.status} />
                      <StatusIndicator variant={trf.priority} />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-[#302B2B]">
                      <span className="font-medium">{trf.from_hospital_name}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-[#702C3B]" aria-hidden="true" />
                      <span className="font-medium text-[#702C3B]">{trf.to_hospital_name}</span>
                      <span className="text-[#77716D]">· {trf.required_bed_type}</span>
                    </div>
                    <p className="text-xs text-[#77716D] mt-1">{trf.reason}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {(trf.status === 'REQUESTED' || trf.status === 'PENDING') && (
                      <>
                        <button
                          type="button"
                          disabled={busyId === trf.id}
                          onClick={() => handleSagaAction(trf.id, 'accept')}
                          className="px-3 py-1.5 rounded-lg bg-[#702C3B] hover:bg-[#5B222F] text-[#FFFDF8] text-xs font-medium whitespace-nowrap"
                        >
                          Accept & Reserve Bed
                        </button>
                        <button
                          type="button"
                          disabled={busyId === trf.id}
                          onClick={() => handleSagaAction(trf.id, 'reject')}
                          className="px-3 py-1.5 rounded-lg border border-[#DEC4C8] bg-[#F1E4E5] text-[#702C3B] text-xs font-medium whitespace-nowrap"
                        >
                          Reject
                        </button>
                      </>
                    )}

                    {trf.status === 'ACCEPTED' && (
                      <>
                        <button
                          type="button"
                          disabled={busyId === trf.id}
                          onClick={() => handleSagaAction(trf.id, 'transit')}
                          className="px-3 py-1.5 rounded-lg bg-[#702C3B] hover:bg-[#5B222F] text-[#FFFDF8] text-xs font-medium whitespace-nowrap"
                        >
                          Mark In Transit
                        </button>
                        <button
                          type="button"
                          disabled={busyId === trf.id}
                          onClick={() => handleSagaAction(trf.id, 'cancel')}
                          className="px-3 py-1.5 rounded-lg border border-[#DEC4C8] bg-[#F1E4E5] text-[#702C3B] text-xs font-medium whitespace-nowrap"
                        >
                          Cancel & Compensate
                        </button>
                      </>
                    )}

                    {trf.status === 'IN_TRANSIT' && (
                      <>
                        <button
                          type="button"
                          disabled={busyId === trf.id}
                          onClick={() => handleSagaAction(trf.id, 'complete')}
                          className="px-3 py-1.5 rounded-lg bg-[#702C3B] hover:bg-[#5B222F] text-[#FFFDF8] text-xs font-medium whitespace-nowrap"
                        >
                          Complete Transfer
                        </button>
                        <button
                          type="button"
                          disabled={busyId === trf.id}
                          onClick={() => handleSagaAction(trf.id, 'cancel')}
                          className="px-3 py-1.5 rounded-lg border border-[#DEC4C8] bg-[#F1E4E5] text-[#702C3B] text-xs font-medium whitespace-nowrap"
                        >
                          Abort & Release Bed
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="pt-2.5 border-t border-[#E7DED2] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#77716D]">
                  <span className="font-mono">
                    Saga Step: <strong className="text-[#302B2B]">{trf.saga_step}</strong>
                    {trf.bed_id ? ` · Bed ${trf.bed_id}` : ''}
                    {trf.reservation_id ? ` · Hold ${trf.reservation_id}` : ''}
                  </span>
                  <span className="font-mono tabular-nums">
                    Created {new Date(trf.created_at).toLocaleTimeString()} · Updated {new Date(trf.updated_at).toLocaleTimeString()}
                  </span>
                </div>
                {trf.compensation_note && (
                  <div className="px-3 py-2 rounded-lg bg-[#F1E4E5] border border-[#DEC4C8] text-xs text-[#702C3B]">
                    {trf.compensation_note}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
