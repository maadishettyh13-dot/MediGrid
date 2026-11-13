import {
  AlertTriangle,
  ArrowRightLeft,
  BedDouble,
  CheckCircle2,
  Clock,
  Truck,
  WifiOff,
  XCircle,
} from 'lucide-react';

interface StatusBadgeProps {
  variant:
    | 'AVAILABLE'
    | 'OCCUPIED'
    | 'RESERVED'
    | 'CRITICAL'
    | 'HIGH'
    | 'NORMAL'
    | 'OFFLINE'
    | 'OPERATIONAL'
    | 'SURGE'
    | 'ACCEPTED'
    | 'REJECTED'
    | 'COMPLETED'
    | 'IN_TRANSIT'
    | 'PENDING'
    | 'PENDING_ACCEPTANCE'
    | 'REQUESTED'
    | 'CANCELLED'
    | 'EXPIRED'
    | 'CONFIRMED'
    | 'ACTIVE'
    | 'DISPATCHED'
    | 'EN_ROUTE'
    | 'AT_HOSPITAL'
    | 'ADMITTED'
    | 'DISCHARGED'
    | 'TRANSFERRED'
    | 'OPEN';
  label?: string;
}

export function StatusIndicator({ variant, label }: StatusBadgeProps) {
  switch (variant) {
    case 'AVAILABLE':
    case 'OPERATIONAL':
    case 'CONFIRMED':
    case 'COMPLETED':
    case 'TRANSFERRED':
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#EAF4EE] text-[#1E6B45] border border-[#CBE2D4] text-xs font-medium whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{label ?? (variant === 'OPERATIONAL' ? 'Operational' : variant === 'CONFIRMED' ? 'Confirmed' : variant === 'COMPLETED' ? 'Completed' : variant === 'TRANSFERRED' ? 'Transferred' : 'Available')}</span>
        </span>
      );

    case 'OCCUPIED':
    case 'ADMITTED':
    case 'DISCHARGED':
    case 'AT_HOSPITAL':
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#EFECE6] text-[#5C5652] border border-[#DDD6CA] text-xs font-medium whitespace-nowrap">
          <BedDouble className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{label ?? variant.replaceAll('_', ' ')}</span>
        </span>
      );

    case 'RESERVED':
    case 'ACTIVE':
    case 'PENDING':
    case 'PENDING_ACCEPTANCE':
    case 'REQUESTED':
    case 'ACCEPTED':
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#F1E4E5] text-[#702C3B] border border-[#DEC4C8] text-xs font-medium whitespace-nowrap">
          <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{label ?? (variant === 'ACTIVE' ? 'Reserved · Active' : variant.replaceAll('_', ' '))}</span>
        </span>
      );

    case 'CRITICAL':
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#702C3B] text-[#FFFDF8] border border-[#5A1E2B] text-xs font-semibold whitespace-nowrap">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{label ?? 'CRITICAL'}</span>
        </span>
      );

    case 'SURGE':
    case 'HIGH':
    case 'OPEN':
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#F8ECD9] text-[#854D14] border border-[#E6CEA6] text-xs font-medium whitespace-nowrap">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{label ?? variant}</span>
        </span>
      );

    case 'DISPATCHED':
    case 'EN_ROUTE':
    case 'IN_TRANSIT':
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#F1E4E5] text-[#702C3B] border border-[#DEC4C8] text-xs font-medium whitespace-nowrap">
          {variant === 'IN_TRANSIT' ? (
            <ArrowRightLeft className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <Truck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          )}
          <span>{label ?? variant.replaceAll('_', ' ')}</span>
        </span>
      );

    case 'REJECTED':
    case 'CANCELLED':
    case 'EXPIRED':
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#F3ECE6] text-[#6E6965] border border-[#DDD4CA] text-xs font-medium whitespace-nowrap">
          <XCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{label ?? variant}</span>
        </span>
      );

    case 'OFFLINE':
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#ECE8E1] text-[#6E6965] border border-[#D8D1C7] text-xs font-medium whitespace-nowrap">
          <WifiOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{label ?? 'Offline'}</span>
        </span>
      );

    case 'NORMAL':
    default:
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#F3EEE5] text-[#5C5652] border border-[#E2D9CC] text-xs font-medium whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{label ?? 'Normal'}</span>
        </span>
      );
  }
}
