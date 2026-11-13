import type { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  label: string;
  value: number | string;
  sublabel?: string;
  icon: LucideIcon;
  emphasize?: boolean;
}

export function MetricCard({ label, value, sublabel, icon: Icon, emphasize = false }: MetricCardProps) {
  return (
    <div className="bg-[#FFFEFA] border border-[#E7DED2] rounded-xl p-4 flex flex-col justify-between transition-colors">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium text-[#77716D] leading-snug">{label}</span>
        <span
          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
            emphasize ? 'bg-[#F1E4E5] text-[#702C3B]' : 'bg-[#F8F3E9] text-[#945563]'
          }`}
        >
          <Icon className="w-4 h-4" aria-hidden="true" />
        </span>
      </div>
      <div className="mt-3">
        <div
          className={`text-2xl font-bold tracking-tight tabular-nums font-mono ${
            emphasize ? 'text-[#702C3B]' : 'text-[#302B2B]'
          }`}
        >
          {value}
        </div>
        {sublabel && <p className="mt-1 text-xs text-[#77716D] truncate">{sublabel}</p>}
      </div>
    </div>
  );
}
