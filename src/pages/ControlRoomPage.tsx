import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Ambulance as AmbulanceIcon,
  ArrowRightLeft,
  BedDouble,
  Building2,
  CheckCircle2,
  Clock,
  Layers,
} from 'lucide-react';
import { BedType, DashboardSnapshot } from '../types/medilink';
import { MetricCard } from '../components/MetricCard';
import { CityMap } from '../components/CityMap';
import { StatusIndicator } from '../components/StatusBadge';

interface ControlRoomPageProps {
  snapshot: DashboardSnapshot;
  onInspectHospital: (hospitalId: string) => void;
}

export function ControlRoomPage({ snapshot, onInspectHospital }: ControlRoomPageProps) {
  const [bedFilter, setBedFilter] = useState<'ALL' | BedType>('ALL');
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [onlyCritical, setOnlyCritical] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const operationalSummary = useMemo(() => {
    const activeAmbulances = snapshot.ambulances.filter((a) => a.status !== 'OFFLINE').length;
    const criticalRequests = snapshot.requests.filter(
      (r) => (r.status === 'OPEN' || r.status === 'RESERVED') && r.priority === 'CRITICAL'
    ).length;
    const activeTransfers = snapshot.transfers.filter((t) =>
      ['REQUESTED', 'PENDING', 'ACCEPTED', 'IN_TRANSIT'].includes(t.status)
    ).length;

    return {
      activeAmbulances,
      criticalRequests,
      activeTransfers,
    };
  }, [snapshot]);

  const filteredHospitals = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return snapshot.hospitals.filter((h) => {
      if (q && !h.name.toLowerCase().includes(q) && !h.id.toLowerCase().includes(q) && !h.address.toLowerCase().includes(q)) {
        return false;
      }
      const icu = h.beds.find((b) => b.bed_type === 'ICU')?.available_beds ?? 0;
      const vent = h.beds.find((b) => b.bed_type === 'VENTILATOR')?.available_beds ?? 0;
      const gen = h.beds.find((b) => b.bed_type === 'GENERAL')?.available_beds ?? 0;

      if (onlyAvailable) {
        if (h.status === 'OFFLINE') return false;
        if (bedFilter === 'ICU' && icu <= 0) return false;
        if (bedFilter === 'VENTILATOR' && vent <= 0) return false;
        if (bedFilter === 'GENERAL' && gen <= 0) return false;
        if (bedFilter === 'ALL' && icu + vent + gen <= 0) return false;
      }
      return true;
    });
  }, [snapshot.hospitals, bedFilter, onlyAvailable, searchTerm]);

  const filteredRequests = useMemo(() => {
    return snapshot.requests.filter((r) => {
      if (onlyCritical && r.priority !== 'CRITICAL') return false;
      if (bedFilter !== 'ALL' && r.required_bed_type !== bedFilter) return false;
      return true;
    });
  }, [snapshot.requests, onlyCritical, bedFilter]);

  const { networkTotals } = snapshot;

  return (
    <div className="space-y-6">
      {/* 8 Required Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3.5">
        <MetricCard label="Total Hospitals" value={networkTotals.total_hospitals} sublabel="Metro grid" icon={Building2} />
        <MetricCard label="Total Beds" value={networkTotals.total_beds.toLocaleString()} sublabel="Unique bed IDs" icon={Layers} />
        <MetricCard label="Available Beds" value={networkTotals.available_beds.toLocaleString()} sublabel={`ICU: ${networkTotals.icu_available}`} icon={CheckCircle2} emphasize />
        <MetricCard label="Occupied Beds" value={networkTotals.occupied_beds.toLocaleString()} sublabel="Inpatient care" icon={BedDouble} />
        <MetricCard label="Reserved Beds" value={networkTotals.reserved_beds} sublabel="15-min holds" icon={Clock} />
        <MetricCard label="Active Ambulances" value={operationalSummary.activeAmbulances} sublabel={`${snapshot.ambulances.length} total fleet`} icon={AmbulanceIcon} />
        <MetricCard label="Critical Requests" value={operationalSummary.criticalRequests} sublabel="Priority 10" icon={AlertTriangle} emphasize />
        <MetricCard label="Active Transfers" value={operationalSummary.activeTransfers} sublabel="Saga workflows" icon={ArrowRightLeft} />
      </div>

      {/* Filter Bar */}
      <div className="bg-[#FFFEFA] border border-[#E7DED2] rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 bg-[#F8F3E9] p-1 rounded-lg border border-[#E7DED2]">
          {(['ALL', 'ICU', 'VENTILATOR', 'GENERAL'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setBedFilter(tab)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                bedFilter === tab
                  ? 'bg-[#702C3B] text-[#FFFDF8]'
                  : 'text-[#302B2B] hover:bg-[#EAE1D3]'
              }`}
            >
              {tab === 'ALL' ? 'All Bed Categories' : tab === 'VENTILATOR' ? 'Ventilator' : tab === 'GENERAL' ? 'General' : 'ICU'}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filter hospital name or ID..."
            className="px-3 py-1.5 rounded-lg bg-[#FFFDF8] border border-[#E7DED2] text-xs text-[#302B2B] focus:outline-none focus:border-[#702C3B]"
          />
          <button
            type="button"
            aria-pressed={onlyAvailable}
            onClick={() => setOnlyAvailable((v) => !v)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
              onlyAvailable
                ? 'bg-[#702C3B] border-[#702C3B] text-[#FFFDF8]'
                : 'bg-[#FFFDF8] border-[#E7DED2] text-[#302B2B] hover:bg-[#F8F3E9]'
            }`}
          >
            Available Hospitals Only
          </button>
          <button
            type="button"
            onClick={() => setOnlyCritical((v) => !v)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
              onlyCritical
                ? 'bg-[#702C3B] border-[#702C3B] text-[#FFFDF8]'
                : 'bg-[#FFFDF8] border-[#E7DED2] text-[#302B2B] hover:bg-[#F8F3E9]'
            }`}
          >
            Critical Requests Only
          </button>
        </div>
      </div>

      {/* Map & Activity Split */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-8 space-y-5">
          <CityMap
            hospitals={filteredHospitals}
            ambulances={snapshot.ambulances}
            bedFilter={bedFilter}
            onlyAvailable={onlyAvailable}
            onSelectHospital={onInspectHospital}
          />

          {/* 42-Hospital Live Inventory Table */}
          <div className="bg-[#FFFEFA] border border-[#E7DED2] rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#E7DED2] flex items-center justify-between">
              <h2 className="text-sm font-bold text-[#702C3B]">Hospital Network Bed Inventory (Synthetic Demo Data)</h2>
              <span className="text-xs text-[#77716D] tabular-nums">{filteredHospitals.length} of {snapshot.hospitals.length} hospitals</span>
            </div>
            <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-[#F8F3E9] border-b border-[#E7DED2] text-xs font-semibold text-[#702C3B]">
                    <th className="py-2.5 px-4">Hospital & ID</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4 text-right">ICU Avail</th>
                    <th className="py-2.5 px-4 text-right">Vent Avail</th>
                    <th className="py-2.5 px-4 text-right">General Avail</th>
                    <th className="py-2.5 px-4 text-right">Total</th>
                    <th className="py-2.5 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E7DED2] text-xs">
                  {filteredHospitals.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 px-4 text-center text-xs text-[#77716D]">
                        No hospitals match the active availability and search filters.
                      </td>
                    </tr>
                  ) : (
                    filteredHospitals.map((h, idx) => {
                      const icu = h.beds.find((b) => b.bed_type === 'ICU');
                      const vent = h.beds.find((b) => b.bed_type === 'VENTILATOR');
                      const gen = h.beds.find((b) => b.bed_type === 'GENERAL');
                      return (
                        <tr key={h.id} className={idx % 2 === 1 ? 'bg-[#FFFDF8]' : 'bg-[#FFFEFA]'}>
                          <td className="py-2.5 px-4">
                            <div className="font-semibold text-[#302B2B]">{h.name}</div>
                            <div className="text-[#77716D] mt-0.5 font-mono">{h.id} · {h.address}</div>
                          </td>
                          <td className="py-2.5 px-4">
                            <StatusIndicator variant={h.status} />
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                            <span className={icu && icu.available_beds === 0 ? 'text-[#702C3B] font-bold' : 'font-semibold'}>
                              {icu?.available_beds ?? 0}
                            </span>
                            <span className="text-[#77716D]">/{icu?.total_beds ?? 0}</span>
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                            <span className="font-semibold">{vent?.available_beds ?? 0}</span>
                            <span className="text-[#77716D]">/{vent?.total_beds ?? 0}</span>
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                            <span className="font-semibold">{gen?.available_beds ?? 0}</span>
                            <span className="text-[#77716D]">/{gen?.total_beds ?? 0}</span>
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums text-[#77716D]">
                            {h.total_capacity}
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => onInspectHospital(h.id)}
                              className="px-2.5 py-1 rounded border border-[#DEC4C8] bg-[#F1E4E5] text-[#702C3B] font-medium hover:bg-[#E8D2D5] transition-colors whitespace-nowrap"
                            >
                              Manage
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column: Emergency Requests & Recent Activity */}
        <div className="xl:col-span-4 space-y-6">
          <div className="bg-[#FFFEFA] border border-[#E7DED2] rounded-xl overflow-hidden">
            <div className="px-4 py-3.5 border-b border-[#E7DED2] flex items-center justify-between">
              <h2 className="text-sm font-bold text-[#702C3B]">Emergency Requests Queue</h2>
              <span className="text-xs text-[#77716D] tabular-nums">{filteredRequests.length} records</span>
            </div>
            <div className="divide-y divide-[#E7DED2] max-h-[280px] overflow-y-auto">
              {filteredRequests.length === 0 ? (
                <div className="p-6 text-center text-xs text-[#77716D]">
                  No emergency requests match the active filters.
                </div>
              ) : (
                filteredRequests.map((req) => (
                  <div key={req.id} className="p-3.5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-[#302B2B] truncate">{req.patient_name}</span>
                      <StatusIndicator variant={req.priority} />
                    </div>
                    <p className="text-xs text-[#77716D]">{req.condition}</p>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="text-[#302B2B] font-mono">
                        {req.ambulance_call_sign || req.ambulance_id} · {req.required_bed_type}
                      </span>
                      <StatusIndicator variant={req.status} />
                    </div>
                    {req.assigned_hospital_name && (
                      <div className="text-xs text-[#702C3B] font-medium">
                        Assigned: {req.assigned_hospital_name}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-[#FFFEFA] border border-[#E7DED2] rounded-xl overflow-hidden">
            <div className="px-4 py-3.5 border-b border-[#E7DED2] flex items-center justify-between">
              <h2 className="text-sm font-bold text-[#702C3B]">Recent Network Activity</h2>
              <span className="text-xs text-[#77716D]">RabbitMQ Audit Feed</span>
            </div>
            <div className="divide-y divide-[#E7DED2] max-h-[410px] overflow-y-auto">
              {snapshot.auditLogs.slice(0, 25).map((log) => (
                <div key={log.id} className="p-3.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-[#702C3B]">{log.event_type}</span>
                    <span className="font-mono text-[#77716D] tabular-nums">
                      {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-xs text-[#302B2B] mt-1 leading-relaxed">{log.summary}</p>
                  <div className="text-[11px] text-[#77716D] mt-1">
                    {log.hospital_name ? `${log.hospital_name} · ` : ''}{log.actor}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
