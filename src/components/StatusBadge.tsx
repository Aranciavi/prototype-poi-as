import { AlertCircle, AlertTriangle, CheckCircle2, Clock, Loader2 } from 'lucide-react';
import type { SyncStatus } from '../types/ops';

interface StatusBadgeProps {
  status: SyncStatus;
  compact?: boolean;
}

const STATUS_META: Record<
  SyncStatus,
  {
    label: string;
    classes: string;
    icon: typeof CheckCircle2;
    spin?: boolean;
  }
> = {
  synced: {
    label: 'Tersinkronisasi',
    classes: 'bg-[#ecfdf5] text-[#059669] border-[#a7f3d0]',
    icon: CheckCircle2,
  },
  discrepancy: {
    label: 'Perbedaan Data',
    classes: 'bg-[#fffbeb] text-[#d97706] border-[#fde68a]',
    icon: AlertTriangle,
  },
  action_required: {
    label: 'Perlu Tindakan',
    classes: 'bg-[#fef2f2] text-[#dc2626] border-[#fecaca]',
    icon: AlertCircle,
  },
  pending_review: {
    label: 'Menunggu Review Google',
    classes: 'bg-[#eff6ff] text-[#1e40af] border-[#bfdbfe]',
    icon: Clock,
  },
  processing: {
    label: 'Sedang Memproses',
    classes: 'bg-[#eff6ff] text-[#2563eb] border-[#bfdbfe]',
    icon: Loader2,
    spin: true,
  },
};

export function StatusBadge({ status, compact = false }: StatusBadgeProps) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium whitespace-nowrap shrink-0 ${
        compact ? 'px-2.5 py-0.5 text-[11px]' : 'px-3 py-1 text-xs'
      } ${meta.classes}`}
    >
      <Icon className={`h-3.5 w-3.5 shrink-0 ${meta.spin ? 'animate-spin' : ''}`} />
      <span>{meta.label}</span>
    </span>
  );
}
