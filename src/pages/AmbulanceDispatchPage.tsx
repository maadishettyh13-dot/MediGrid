import { useEffect, useState, type FormEvent } from 'react';
import { Ambulance as AmbulanceIcon, ArrowRightLeft, Clock, MapPin, Search } from 'lucide-react';
import {
  BedType,
  DashboardSnapshot,
  EmergencyPriority,
  EmergencyRequest,
  Hospital,
  User,
} from '../types/medilink';
import { StatusIndicator } from '../components/StatusBadge';

interface AmbulanceDispatchPageProps {
  snapshot: DashboardSnapshot;
  user: User;
  onRefresh: () => void;
  onNavigateTransfers: () => void;
}

const CITY_LOCATIONS = [
  { label: 'Banjara Hills / Road No. 12', lat: 17.4165, lng: 78.4310 },
  { label: 'HITEC City / Cyber Towers', lat: 17.4412, lng: 78.3820 },
  { label: 'Secunderabad / Paradise Circle', lat: 17.4395, lng: 78.4945 },
  { label: 'Panjagutta / Somajiguda Circle', lat: 17.4240, lng: 78.4580 },
  { label: 'LB Nagar / Ring Road Junction', lat: 17.3510, lng: 78.5505 },
  { label: 'Mehdipatnam / PVNR Expressway', lat: 17.3925, lng: 78.4350 },
];

function ReservationCountdown({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const sec = Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000));
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return <span className="font-mono tabular-nums font-semibold text-[#702C3B]">{m}:{s}</span>;
}

export function AmbulanceDispatchPage({
  snapshot,
  user,
  onRefresh,
  onNavigateTransfers,
}: AmbulanceDispatchPageProps) {
  const [patientId, setPatientId] = useState('');
  const [patientName, setPatientName] = useState('');
  const [condition, setCondition] = useState('');
  const [priority, setPriority] = useState<EmergencyPriority>('CRITICAL');
  const [requiredBedType, setRequiredBedType] = useState<BedType>('ICU');
  const [ambulanceId, setAmbulanceId] = useState(user.ambulance_id || snapshot.ambulances[0]?.id || 'AMB-104');
  const [selectedLocIdx, setSelectedLocIdx] = useState(0);

  const [activeRequest, setActiveRequest] = useState<EmergencyRequest | null>(
    snapshot.requests.find((r) => r.status === 'OPEN') || null
  );
  const [lastReserved, setLastReserved] = useState<{
    hospitalId: string;
    bedId: string;
    reservationId: string;
    patientName: string;
  } | null>(null);
  const [suitableHospitals, setSuitableHospitals] = useState<Hospital[]>([]);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reservingHospitalId, setReservingHospitalId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const runHospitalSearch = async (lat: number, lng: number, bedType: BedType, prio: EmergencyPriority) => {
    setSearching(true);
    try {
      const res = await fetch(
        `/api/hospitals/search?lat=${lat}&lng=${lng}&bedType=${bedType}&priority=${prio}&actor=${encodeURIComponent(user.email)}`
      );
      const data = (await res.json()) as { hospitals?: Hospital[]; error?: string };
      if (!res.ok) {
        setFeedback({ type: 'err', text: data.error || 'Hospital search failed.' });
        return;
      }
      setSuitableHospitals(data.hospitals || []);
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    const loc = CITY_LOCATIONS[selectedLocIdx];
    const searchLat = activeRequest ? activeRequest.latitude : loc.lat;
    const searchLng = activeRequest ? activeRequest.longitude : loc.lng;
    const searchBed = activeRequest ? activeRequest.required_bed_type : requiredBedType;
    const searchPrio = activeRequest ? activeRequest.priority : priority;
    void runHospitalSearch(searchLat, searchLng, searchBed, searchPrio);
  }, [requiredBedType, priority, selectedLocIdx, activeRequest?.id, snapshot.reservations.length]);

  const handleSubmitRequest = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);
    const loc = CITY_LOCATIONS[selectedLocIdx];

    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: patientId.trim() || undefined,
          patientName: patientName.trim(),
          condition: condition.trim(),
          priority,
          requiredBedType,
          ambulanceId,
          latitude: loc.lat,
          longitude: loc.lng,
          locationLabel: loc.label,
          actor: user.name,
        }),
      });
      const data = (await res.json()) as { request?: EmergencyRequest; error?: string };
      if (!res.ok || !data.request) {
        setFeedback({ type: 'err', text: data.error || 'Failed to register emergency request.' });
        return;
      }

      setActiveRequest(data.request);
      setFeedback({
        type: 'ok',
        text: `Emergency request ${data.request.id} created. Select a hospital from the distance-ranked table to reserve a ${requiredBedType} bed.`,
      });
      await runHospitalSearch(loc.lat, loc.lng, requiredBedType, priority);
      setPatientId('');
      setPatientName('');
      setCondition('');
      onRefresh();
    } finally {
      setSubmitting(false);
    }
  };

  const handleReserveBed = async (hospital: Hospital) => {
    const targetReq = activeRequest || snapshot.requests.find((r) => r.status === 'OPEN');
    if (!targetReq) {
      setFeedback({
        type: 'err',
        text: 'Register or select an OPEN emergency request on the left before reserving a bed.',
      });
      return;
    }

    setReservingHospitalId(hospital.id);
    setFeedback(null);
    try {
      const res = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hospitalId: hospital.id,
          bedType: targetReq.required_bed_type,
          patientId: targetReq.patient_id,
          ambulanceId: targetReq.ambulance_id,
          requestId: targetReq.id,
          priority: targetReq.priority,
          actor: `${user.name} (${targetReq.ambulance_id})`,
        }),
      });
      const data = (await res.json()) as { error?: string; reservation?: { id: string; bed_id: string } };
      if (!res.ok) {
        setFeedback({ type: 'err', text: data.error || 'Atomic reservation rejected.' });
        return;
      }

      const reservedBedId = data.reservation?.bed_id || '';
      const reservedId = data.reservation?.id || '';
      setLastReserved({
        hospitalId: hospital.id,
        bedId: reservedBedId,
        reservationId: reservedId,
        patientName: targetReq.patient_name,
      });

      const nextOpen = snapshot.requests.find((r) => r.status === 'OPEN' && r.id !== targetReq.id) || null;
      setActiveRequest(nextOpen);
      setFeedback({
        type: 'ok',
        text: `Reserved specific bed ${reservedBedId} at ${hospital.name} for ${targetReq.patient_name} (Reservation ${reservedId}, 15-min countdown active).${
          nextOpen ? ` Next OPEN request auto-selected: ${nextOpen.patient_name} (${nextOpen.required_bed_type}).` : ''
        }`,
      });

      const loc = CITY_LOCATIONS[selectedLocIdx];
      await runHospitalSearch(
        nextOpen ? nextOpen.latitude : loc.lat,
        nextOpen ? nextOpen.longitude : loc.lng,
        nextOpen ? nextOpen.required_bed_type : requiredBedType,
        nextOpen ? nextOpen.priority : priority
      );
      onRefresh();
    } finally {
      setReservingHospitalId(null);
    }
  };

  const openRequests = snapshot.requests.filter((r) => r.status === 'OPEN' || r.status === 'RESERVED');

  return (
    <div className="space-y-6">
      {!snapshot.metrics.redis.connected && (
        <div className="px-4 py-3 rounded-xl bg-[#F1E4E5] border border-[#702C3B] text-xs font-semibold text-[#702C3B]">
          Warning: Redis coordination is currently offline. New bed reservations are blocked (fail-closed) to prevent uncoordinated double allocation.
        </div>
      )}

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
          onSubmit={handleSubmitRequest}
          className="xl:col-span-5 bg-[#FFFEFA] border border-[#E7DED2] rounded-xl p-6 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-[#E7DED2] pb-3">
            <div>
              <h2 className="text-base font-bold text-[#702C3B]">Emergency Request Intake</h2>
              <p className="text-xs text-[#77716D] mt-0.5">Search nearest suitable hospitals across 42 facilities</p>
            </div>
            <AmbulanceIcon className="w-5 h-5 text-[#945563]" aria-hidden="true" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-medium text-[#302B2B] mb-1">Patient ID (Optional)</label>
              <input
                type="text"
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                placeholder="Auto-generated if blank"
                className="w-full px-3 py-2 rounded-lg bg-[#FFFDF8] border border-[#E7DED2] text-xs font-mono focus:outline-none focus:border-[#702C3B]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#302B2B] mb-1">Patient Name / Alias</label>
              <input
                type="text"
                required
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                placeholder="e.g. John Doe #44"
                className="w-full px-3 py-2 rounded-lg bg-[#FFFDF8] border border-[#E7DED2] text-xs focus:outline-none focus:border-[#702C3B]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#302B2B] mb-1">Patient Condition</label>
            <input
              type="text"
              required
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              placeholder="e.g. Suspected Acute Coronary Syndrome, SpO2 88%"
              className="w-full px-3 py-2 rounded-lg bg-[#FFFDF8] border border-[#E7DED2] text-xs focus:outline-none focus:border-[#702C3B]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-medium text-[#302B2B] mb-1">Emergency Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as EmergencyPriority)}
                className="w-full px-3 py-2 rounded-lg bg-[#FFFDF8] border border-[#E7DED2] text-xs font-medium focus:outline-none focus:border-[#702C3B]"
              >
                <option value="CRITICAL">Critical (Priority 10)</option>
                <option value="HIGH">High (Priority 5)</option>
                <option value="NORMAL">Normal (Priority 1)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#302B2B] mb-1">Required Bed Category</label>
              <select
                value={requiredBedType}
                onChange={(e) => setRequiredBedType(e.target.value as BedType)}
                className="w-full px-3 py-2 rounded-lg bg-[#FFFDF8] border border-[#E7DED2] text-xs font-medium focus:outline-none focus:border-[#702C3B]"
              >
                <option value="ICU">ICU</option>
                <option value="VENTILATOR">Ventilator</option>
                <option value="GENERAL">General</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-medium text-[#302B2B] mb-1">Ambulance ID</label>
              <select
                value={ambulanceId}
                onChange={(e) => setAmbulanceId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#FFFDF8] border border-[#E7DED2] text-xs font-mono focus:outline-none focus:border-[#702C3B]"
              >
                {snapshot.ambulances
                  .filter((a) => a.status !== 'OFFLINE')
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.call_sign} ({a.status})
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#302B2B] mb-1">Current Ambulance Location</label>
              <select
                value={selectedLocIdx}
                onChange={(e) => setSelectedLocIdx(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg bg-[#FFFDF8] border border-[#E7DED2] text-xs focus:outline-none focus:border-[#702C3B]"
              >
                {CITY_LOCATIONS.map((loc, idx) => (
                  <option key={loc.label} value={idx}>
                    {loc.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 px-4 rounded-lg bg-[#702C3B] hover:bg-[#5B222F] text-[#FFFDF8] text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
          >
            <Search className="w-4 h-4" aria-hidden="true" />
            <span>{submitting ? 'Searching Network...' : 'Submit Request & Find Nearest Hospitals'}</span>
          </button>
        </form>

        {/* Nearest Suitable Hospitals Ranked Table */}
        <div className="xl:col-span-7 bg-[#FFFEFA] border border-[#E7DED2] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E7DED2] flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-[#702C3B]">
                Nearest Suitable Hospitals ({activeRequest ? activeRequest.required_bed_type : requiredBedType})
              </h2>
              <p className="text-xs text-[#77716D] mt-0.5">
                {activeRequest
                  ? `Reserving for ${activeRequest.patient_name} (${activeRequest.priority})`
                  : 'Select an OPEN request below or submit intake form to reserve a bed'}
              </p>
            </div>
            <span className="text-xs font-mono text-[#77716D] tabular-nums">
              {searching ? 'Querying Redis...' : `${suitableHospitals.length} available facilities`}
            </span>
          </div>

          {suitableHospitals.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#77716D]">
              No hospitals currently have genuinely available {activeRequest ? activeRequest.required_bed_type : requiredBedType} beds.
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[430px] overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-[#F8F3E9] border-b border-[#E7DED2] text-xs font-semibold text-[#702C3B]">
                    <th className="py-2.5 px-4">Hospital</th>
                    <th className="py-2.5 px-4 text-right">Distance</th>
                    <th className="py-2.5 px-4">Bed Type</th>
                    <th className="py-2.5 px-4 text-right">Available</th>
                    <th className="py-2.5 px-4 text-right">Reserve</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E7DED2] text-xs">
                  {suitableHospitals.map((h) => {
                    const targetBedType = activeRequest ? activeRequest.required_bed_type : requiredBedType;
                    const bedSummary = h.beds.find((b) => b.bed_type === targetBedType);
                    const avail = bedSummary?.available_beds ?? 0;
                    const heldInCategory = bedSummary?.reserved_beds ?? 0;
                    const wasJustReservedHere = lastReserved?.hospitalId === h.id;

                    return (
                      <tr key={h.id} className={wasJustReservedHere ? 'bg-[#EAF4EE]/60' : 'hover:bg-[#FFFDF8]'}>
                        <td className="py-3 px-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-[#302B2B]">{h.name}</span>
                            {wasJustReservedHere && (
                              <span className="px-2 py-0.5 rounded bg-[#EAF4EE] border border-[#CBE2D4] text-[11px] font-mono font-semibold text-[#1E6B45]">
                                Reserved {lastReserved.bedId}
                              </span>
                            )}
                          </div>
                          <div className="text-[#77716D] mt-0.5 font-mono">
                            {h.id} · {h.status}
                            {heldInCategory > 0 ? ` · ${heldInCategory} ${targetBedType} held` : ''}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-[#945563]" aria-hidden="true" />
                            {h.distance_km} km
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono">{targetBedType}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-[#1E6B45]">
                          {avail}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {activeRequest ? (
                            <button
                              type="button"
                              disabled={reservingHospitalId === h.id}
                              onClick={() => handleReserveBed(h)}
                              className="px-3 py-1.5 rounded-lg bg-[#702C3B] hover:bg-[#5B222F] text-[#FFFDF8] font-semibold transition-colors disabled:opacity-45 whitespace-nowrap"
                            >
                              {reservingHospitalId === h.id ? 'Locking...' : 'Reserve Bed'}
                            </button>
                          ) : wasJustReservedHere ? (
                            <span className="inline-block px-2.5 py-1 rounded-md bg-[#EAF4EE] border border-[#CBE2D4] text-[11px] font-semibold text-[#1E6B45] whitespace-nowrap">
                              Held for {lastReserved.patientName}
                            </span>
                          ) : (
                            <span className="text-[11px] text-[#77716D] whitespace-nowrap">Select OPEN request</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Active Requests & Reservation Countdown */}
      <div className="bg-[#FFFEFA] border border-[#E7DED2] rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#E7DED2] flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-[#702C3B]">Active Ambulance Requests & Atomic Bed Reservations</h3>
          <button
            type="button"
            onClick={onNavigateTransfers}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#DEC4C8] bg-[#F1E4E5] text-[#702C3B] text-xs font-medium hover:bg-[#E7D0D3] transition-colors"
          >
            <ArrowRightLeft className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Patient Transfers</span>
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F8F3E9] border-b border-[#E7DED2] text-xs font-semibold text-[#702C3B]">
                <th className="py-2.5 px-4">Patient</th>
                <th className="py-2.5 px-4">Ambulance & Sector</th>
                <th className="py-2.5 px-4">Bed / Priority</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4">Reserved Bed & Countdown</th>
                <th className="py-2.5 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E7DED2] text-xs">
              {openRequests.map((req) => {
                const res = snapshot.reservations.find((r) => r.id === req.reservation_id && r.status === 'ACTIVE');
                const isSelected = activeRequest?.id === req.id;

                return (
                  <tr key={req.id} className={isSelected ? 'bg-[#F1E4E5]/45' : ''}>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-[#302B2B]">{req.patient_name}</div>
                      <div className="text-[#77716D] mt-0.5">{req.condition}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-mono font-medium text-[#302B2B]">{req.ambulance_call_sign || req.ambulance_id}</div>
                      <div className="text-[#77716D] mt-0.5">{req.location_label}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold">{req.required_bed_type}</span>
                        <StatusIndicator variant={req.priority} />
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <StatusIndicator variant={req.status} />
                    </td>
                    <td className="py-3 px-4">
                      {res ? (
                        <div className="space-y-0.5">
                          <div className="font-medium text-[#302B2B]">
                            {req.assigned_hospital_name} · <span className="font-mono text-[#702C3B]">{res.bed_id}</span>
                          </div>
                          <div className="inline-flex items-center gap-1.5 text-xs text-[#77716D]">
                            <Clock className="w-3.5 h-3.5 text-[#702C3B]" aria-hidden="true" />
                            <span>15m TTL:</span>
                            <ReservationCountdown expiresAt={res.expires_at} />
                          </div>
                        </div>
                      ) : (
                        <span className="text-[#77716D]">Awaiting bed reservation</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {req.status === 'OPEN' ? (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveRequest(req);
                            void runHospitalSearch(req.latitude, req.longitude, req.required_bed_type, req.priority);
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                            isSelected
                              ? 'bg-[#702C3B] text-[#FFFDF8]'
                              : 'border border-[#DEC4C8] bg-[#F1E4E5] text-[#702C3B] hover:bg-[#E7D0D3]'
                          }`}
                        >
                          {isSelected ? 'Selected' : 'Select & Search'}
                        </button>
                      ) : (
                        <span className="font-mono text-[#77716D]">Locked</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
