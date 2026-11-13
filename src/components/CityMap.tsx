import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { Ambulance, BedType, Hospital } from '../types/medilink';

interface CityMapProps {
  hospitals: Hospital[];
  ambulances: Ambulance[];
  bedFilter: 'ALL' | BedType;
  onlyAvailable: boolean;
  onSelectHospital?: (hospitalId: string) => void;
  heightClass?: string;
}

export function CityMap({
  hospitals,
  ambulances,
  bedFilter,
  onlyAvailable,
  onSelectHospital,
  heightClass = 'h-[460px]',
}: CityMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [17.418, 78.458],
      zoom: 11,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      className: 'medilink-map-tiles',
      maxZoom: 18,
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerGroupRef.current = group;

    return () => {
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const group = layerGroupRef.current;
    if (!group) return;
    group.clearLayers();

    for (const h of hospitals) {
      const icu = h.beds.find((b) => b.bed_type === 'ICU')?.available_beds ?? 0;
      const vent = h.beds.find((b) => b.bed_type === 'VENTILATOR')?.available_beds ?? 0;
      const gen = h.beds.find((b) => b.bed_type === 'GENERAL')?.available_beds ?? 0;

      const relevantCount =
        bedFilter === 'ICU'
          ? icu
          : bedFilter === 'VENTILATOR'
          ? vent
          : bedFilter === 'GENERAL'
          ? gen
          : icu + vent + gen;

      if (onlyAvailable && (h.status === 'OFFLINE' || relevantCount <= 0)) continue;

      const isSurgeOrLow = h.status === 'SURGE' || relevantCount === 0;
      const badgeBg = isSurgeOrLow ? '#945563' : '#702C3B';

      const iconHtml = `
        <div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);">
          <div style="background:${badgeBg};color:#FFFDF8;border:1.5px solid #FFFEFA;border-radius:6px;padding:2px 5px;font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:600;box-shadow:0 2px 8px rgba(48,43,43,0.22);white-space:nowrap;">
            ${h.code} (${relevantCount})
          </div>
          <div style="width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:5px solid ${badgeBg};"></div>
        </div>
      `;

      const icon = L.divIcon({
        html: iconHtml,
        className: '',
        iconSize: [0, 0],
      });

      const marker = L.marker([h.latitude, h.longitude], { icon });
      const popupHtml = `
        <div style="min-width:230px;font-family:'DM Sans',sans-serif;color:#302B2B;">
          <div style="font-weight:700;font-size:13px;color:#702C3B;margin-bottom:2px;">${h.name}</div>
          <div style="font-size:11px;color:#77716D;margin-bottom:8px;">ID: <strong style="color:#302B2B;">${h.id}</strong> · Status: <strong style="color:#302B2B;">${h.status}</strong></div>
          <div style="font-size:11px;color:#77716D;margin-bottom:8px;">Total Beds: <strong style="color:#302B2B;font-family:'JetBrains Mono',monospace;">${h.total_capacity}</strong></div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;text-align:center;background:#F8F3E9;border:1px solid #E7DED2;border-radius:6px;padding:6px;font-family:'JetBrains Mono',monospace;font-size:11px;">
            <div><div style="color:#77716D;font-size:10px;">ICU Avail</div><div style="font-weight:700;color:#702C3B;">${icu}</div></div>
            <div><div style="color:#77716D;font-size:10px;">Vent Avail</div><div style="font-weight:700;color:#302B2B;">${vent}</div></div>
            <div><div style="color:#77716D;font-size:10px;">Gen Avail</div><div style="font-weight:700;color:#1E6B45;">${gen}</div></div>
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml, { className: 'medilink-popup' });
      marker.on('dblclick', () => {
        if (onSelectHospital) onSelectHospital(h.id);
      });
      marker.addTo(group);
    }

    for (const amb of ambulances) {
      if (amb.status === 'OFFLINE') continue;
      const isBusy = amb.status === 'EN_ROUTE' || amb.status === 'DISPATCHED';
      const fill = isBusy ? '#702C3B' : '#1E6B45';

      const ambHtml = `
        <div style="transform:translate(-50%,-50%);display:flex;align-items:center;gap:4px;background:#FFFEFA;border:1.5px solid ${fill};border-radius:5px;padding:1.5px 5px;box-shadow:0 2px 6px rgba(48,43,43,0.16);white-space:nowrap;">
          <span style="display:inline-block;width:6px;height:6px;border-radius:2px;background:${fill};"></span>
          <span style="font-family:'JetBrains Mono',monospace;font-size:9px;font-weight:600;color:#302B2B;">${amb.call_sign}</span>
        </div>
      `;

      const ambIcon = L.divIcon({
        html: ambHtml,
        className: '',
        iconSize: [0, 0],
      });

      const ambMarker = L.marker([amb.latitude, amb.longitude], { icon: ambIcon });
      ambMarker.bindPopup(
        `<div style="font-family:'DM Sans',sans-serif;color:#302B2B;min-width:170px;">
          <div style="font-weight:700;font-size:12px;color:#702C3B;">${amb.call_sign}</div>
          <div style="font-size:11px;color:#77716D;margin-top:2px;">${amb.crew_lead}</div>
          <div style="font-size:11px;margin-top:6px;font-weight:600;">Status: ${amb.status.replaceAll('_', ' ')}</div>
        </div>`,
        { className: 'medilink-popup' }
      );
      ambMarker.addTo(group);
    }
  }, [hospitals, ambulances, bedFilter, onlyAvailable, onSelectHospital]);

  return (
    <div className="relative w-full rounded-xl overflow-hidden border border-[#E7DED2] bg-[#EFE8DA]">
      <div ref={containerRef} className={`w-full ${heightClass}`} />
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-[#FFFDF8] border-t border-[#E7DED2] text-xs text-[#77716D]">
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-[#702C3B] inline-block" />
            <span>Hospital ({hospitals.length} Synthetic Nodes)</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-[#1E6B45] inline-block" />
            <span>Ambulance Available</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm border-2 border-[#702C3B] bg-[#FFFEFA] inline-block" />
            <span>Ambulance En Route / Dispatched</span>
          </span>
        </div>
        <span className="font-mono tabular-nums">Leaflet · OpenStreetMap (Greater Hyderabad, India · Synthetic Bed Data)</span>
      </div>
    </div>
  );
}
