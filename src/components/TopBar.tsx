import { Menu, RefreshCw, Search, X } from 'lucide-react';
import { useOps } from '../context/OpsContext';
import type { AppView } from '../types/ops';

interface TopBarProps {
  onOpenMobileNav: () => void;
}

const VIEW_TITLES: Record<AppView, { title: string; breadcrumb: string }> = {
  overview: {
    title: 'Ringkasan Operasional',
    breadcrumb: 'Operasional Jaringan BRI / Ringkasan',
  },
  directory: {
    title: 'Direktori Cabang',
    breadcrumb: 'Operasional Jaringan BRI / Direktori & Google Maps',
  },
  'data-quality': {
    title: 'Audit & Perbaikan Kualitas Data',
    breadcrumb: 'Operasional Jaringan BRI / Kualitas Data Master BRI',
  },
  'sync-queue': {
    title: 'Antrean Review Google',
    breadcrumb: 'Operasional Jaringan BRI / Sinkronisasi Master Data',
  },
  reviews: {
    title: 'Ulasan & Reputasi',
    breadcrumb: 'Operasional Jaringan BRI / Kotak Masuk Ulasan',
  },
  'history-alerts': {
    title: 'Histori Perubahan & Alert Keamanan',
    breadcrumb: 'Operasional Jaringan BRI / Audit Log & Proteksi Listing',
  },
  'gbp-connect': {
    title: 'Koneksi Google Business Profile',
    breadcrumb: 'Operasional Jaringan BRI / Autentikasi & Tautan GBP',
  },
};

export function TopBar({ onOpenMobileNav }: TopBarProps) {
  const {
    activeView,
    setActiveView,
    globalSearch,
    setGlobalSearch,
    openBulkSync,
    checkedBranchIds,
    kpiStats,
  } = useOps();

  const meta = VIEW_TITLES[activeView];
  const pendingConflicts = kpiStats.discrepancyCount + kpiStats.actionRequiredCount;

  const handleSearchChange = (value: string) => {
    setGlobalSearch(value);
    if (value.trim().length > 0 && activeView === 'overview') {
      setActiveView('directory');
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-[#fbf8ff]/90 backdrop-blur-md border-b border-[#e2e8f0] px-4 sm:px-8 py-4">
      <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-4 sm:gap-8">
        {/* Zone 1: Context Breadcrumb & Title */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onOpenMobileNav}
            aria-label="Buka menu navigasi"
            className="lg:hidden flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white border border-[#e2e8f0] text-[#1a1b22] hover:bg-[#f1f5f9] smooth-transition"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <p className="text-xs text-[#64748b] truncate">{meta.breadcrumb}</p>
            <h1 className="font-display text-lg sm:text-xl font-bold text-[#1a1b22] truncate">
              {meta.title}
            </h1>
          </div>
        </div>

        {/* Zone 2: Quick Global Search */}
        <div className="hidden md:flex flex-1 max-w-md items-center relative">
          <Search className="h-4 w-4 text-[#64748b] absolute left-4 pointer-events-none" />
          <input
            type="text"
            value={globalSearch}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Cari nama unit, kode cabang, atau kota..."
            aria-label="Cari nama unit, kode cabang, atau kota"
            className="w-full h-11 pl-11 pr-10 rounded-2xl bg-white border border-[#cbd5e1] text-sm text-[#1a1b22] placeholder:text-[#94a3b8] focus:outline-none focus:border-[#2563eb] focus:ring-4 focus:ring-[#2563eb]/15 smooth-transition"
          />
          {globalSearch && (
            <button
              type="button"
              onClick={() => setGlobalSearch('')}
              aria-label="Hapus pencarian"
              className="absolute right-3 p-1 rounded-full text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#1a1b22]"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Zone 3: Single Primary Action */}
        <div className="shrink-0">
          <button
            type="button"
            onClick={() => openBulkSync(checkedBranchIds)}
            className="h-11 px-5 rounded-2xl bg-[#00529C] hover:bg-[#004080] active:bg-[#003366] text-white text-sm font-semibold inline-flex items-center gap-2.5 smooth-transition whitespace-nowrap shrink-0 shadow-xs focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#00529C]/30"
          >
            <RefreshCw className="h-4 w-4 shrink-0" />
            <span>
              {checkedBranchIds.length > 0
                ? `Sinkronkan (${checkedBranchIds.length})`
                : `Sinkronisasi Massal (${pendingConflicts.toLocaleString('id-ID')})`}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
