import {
  GitCompareArrows,
  History,
  LayoutDashboard,
  Link2,
  LogOut,
  MapPin,
  MessageSquareQuote,
  RotateCcw,
  ShieldAlert,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useGbpAuth } from '../context/GbpAuthContext';
import { useOps } from '../context/OpsContext';
import type { AppView } from '../types/ops';
import { BriLogo } from './BriLogo';

interface SidebarNavProps {
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: Array<{
  id: AppView;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: 'overview', label: 'Ringkasan Operasional', icon: LayoutDashboard },
  { id: 'directory', label: 'Direktori Cabang', icon: MapPin },
  { id: 'data-quality', label: 'Kualitas Data', icon: ShieldAlert },
  { id: 'sync-queue', label: 'Antrean Review Google', icon: GitCompareArrows },
  { id: 'reviews', label: 'Ulasan & Reputasi', icon: MessageSquareQuote },
  { id: 'history-alerts', label: 'Histori & Keamanan', icon: History },
  { id: 'gbp-connect', label: 'Koneksi Google Business', icon: Link2 },
];

export function SidebarNav({ mobileOpen, onCloseMobile }: SidebarNavProps) {
  const { activeView, setActiveView, kpiStats, qualityAudit, resetDemoData } = useOps();
  const { user, logout } = useAuth();
  const { isConnected: isGbpConnected } = useGbpAuth();

  const unrepliedCount = kpiStats.totalReviews - kpiStats.repliedCount;
  const attentionCount = kpiStats.actionRequiredCount + kpiStats.discrepancyCount;

  const handleSelect = (view: AppView) => {
    setActiveView(view);
    onCloseMobile();
  };

  const navContent = (
    <div className="flex h-full flex-col justify-between bg-white px-4 py-6 border-r border-[#e2e8f0]">
      <div className="space-y-8">
        <div className="flex items-center justify-between px-2 gap-2">
          <BriLogo variant="full" theme="light" />
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Tutup menu navigasi"
            className="lg:hidden flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[#444653] hover:bg-[#f1f5f9] smooth-transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="space-y-1.5" aria-label="Navigasi utama">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            const badgeValue =
              item.id === 'reviews' && unrepliedCount > 0
                ? unrepliedCount
                : item.id === 'directory' && attentionCount > 0
                  ? attentionCount
                  : item.id === 'data-quality' && qualityAudit.counts.totalFlagged > 0
                    ? qualityAudit.counts.totalFlagged
                    : item.id === 'sync-queue' && kpiStats.pendingReviewCount > 0
                      ? kpiStats.pendingReviewCount
                      : item.id === 'history-alerts' && kpiStats.activeSecurityAlertsCount > 0
                        ? kpiStats.activeSecurityAlertsCount
                        : null;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item.id)}
                className={`w-full flex items-center justify-between gap-2.5 px-3.5 py-2.5 rounded-2xl text-sm font-medium smooth-transition whitespace-nowrap ${
                  isActive
                    ? 'bg-[#00529C] text-white shadow-sm'
                    : 'text-[#444653] hover:bg-[#f4f2fc] hover:text-[#1a1b22]'
                }`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-white' : 'text-[#64748b]'}`} />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.id === 'gbp-connect' ? (
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                      isActive
                        ? 'bg-white/20 text-white'
                        : isGbpConnected
                          ? 'bg-[#ecfdf5] text-[#059669]'
                          : 'bg-[#f1f5f9] text-[#64748b]'
                    }`}
                  >
                    {isGbpConnected ? 'Terhubung' : 'Belum'}
                  </span>
                ) : (
                  badgeValue !== null && (
                    <span
                      className={`font-mono text-[11px] tabular-nums px-2 py-0.5 rounded-full shrink-0 ${
                        isActive ? 'bg-white/20 text-white' : 'bg-[#f1f5f9] text-[#444653]'
                      }`}
                    >
                      {badgeValue.toLocaleString('id-ID')}
                    </span>
                  )
                )}
              </button>
            );
          })}
        </nav>

        <div className="rounded-2xl bg-[#f8fafc] p-4 space-y-2.5 border border-[#e2e8f0]/80">
          <p className="text-xs font-medium text-[#64748b]">Cakupan Jaringan BRI</p>
          <p className="font-mono text-2xl font-semibold text-[#1a1b22] tabular-nums">
            {kpiStats.totalBranches > 0 ? kpiStats.totalBranches.toLocaleString('id-ID') : '—'}
          </p>
          <p className="text-xs text-[#444653]">
            18 Kantor Wilayah · {kpiStats.syncRate}% tersinkronisasi
          </p>
        </div>
      </div>

      <div className="space-y-3 pt-6 border-t border-[#e2e8f0]">
        <div className="flex items-center gap-3 px-2">
          <img
            src="/src/assets/images/avatar_ops_manager_1794671315420.jpg"
            alt={user?.fullName || 'Admin Operasional BRI'}
            referrerPolicy="no-referrer"
            className="h-10 w-10 rounded-2xl object-cover shrink-0 bg-[#f1f5f9]"
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#1a1b22] truncate">
              {user?.fullName || user?.username || 'Admin Outlet BRI'}
            </p>
            <p className="text-xs text-[#64748b] truncate">
              @{user?.username || 'brioutlet'} · {user?.role || 'Operasional'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={resetDemoData}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-medium text-[#444653] bg-[#f8fafc] hover:bg-[#f1f5f9] border border-[#e2e8f0] smooth-transition whitespace-nowrap"
          >
            <RotateCcw className="h-3.5 w-3.5 shrink-0" />
            <span>Reset Data</span>
          </button>

          <button
            type="button"
            onClick={() => logout()}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-semibold text-[#dc2626] bg-[#fef2f2] hover:bg-[#fee2e2] border border-[#fecaca] smooth-transition whitespace-nowrap"
          >
            <LogOut className="h-3.5 w-3.5 shrink-0" />
            <span>Keluar</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block w-[272px] shrink-0 h-screen sticky top-0">
        {navContent}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-[#0f172a]/35 backdrop-blur-xs"
            onClick={onCloseMobile}
          />
          <div className="relative w-[280px] max-w-[85vw] h-full z-10">{navContent}</div>
        </div>
      )}
    </>
  );
}
