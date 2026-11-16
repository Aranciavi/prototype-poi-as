import { useDeferredValue, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  ArrowUpDown,
  Clock,
  History,
  Link2,
  MapPin,
  MapPinOff,
  Search,
  ShieldAlert,
  ShieldCheck,
  Star,
  Tag,
  Wrench,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useGbpAuth } from '../context/GbpAuthContext';
import { useOps } from '../context/OpsContext';
import { SYNC_HISTORY_7D } from '../data/initialReviews';
import { StatusBadge } from './StatusBadge';

interface OverviewDashboardProps {
  onNavigateToRegion: (regionShort: string) => void;
}

export function OverviewDashboard({ onNavigateToRegion }: OverviewDashboardProps) {
  const {
    branches,
    isLoadingBranches,
    loadError,
    retryLoadBranches,
    kpiStats,
    qualityAudit,
    changeHistory,
    securityAlerts,
    markedBranchIds,
    toggleBranchMarked,
    setActiveView,
    setSelectedBranchId,
    setDirectoryFilterPreset,
    openBulkSync,
  } = useOps();
  const { user } = useAuth();
  const { isConnected: isGbpConnected, gbpUser, gbpLocations } = useGbpAuth();

  const [hoveredDayIndex, setHoveredDayIndex] = useState<number | null>(SYNC_HISTORY_7D.length - 1);
  const [ratingSearch, setRatingSearch] = useState('');
  const deferredRatingSearch = useDeferredValue(ratingSearch.trim().toLowerCase());
  const [ratingSort, setRatingSort] = useState<'lowest' | 'highest'>('lowest');
  const [priorityTab, setPriorityTab] = useState<'missing_maps' | 'needs_sync'>('missing_maps');

  const markedSet = useMemo(() => new Set(markedBranchIds), [markedBranchIds]);

  const ratingStats = useMemo(() => {
    let high = 0;
    let mid = 0;
    let low = 0;
    for (const b of branches) {
      if (b.rating >= 4.5) high++;
      else if (b.rating >= 4.0) mid++;
      else low++;
    }
    return { high, mid, low };
  }, [branches]);

  const ratingRows = useMemo(() => {
    const filtered = deferredRatingSearch
      ? branches.filter((b) => {
          const hay = `${b.code} ${b.name} ${b.city} ${b.regionShort}`.toLowerCase();
          return hay.includes(deferredRatingSearch);
        })
      : branches;

    return [...filtered]
      .sort((a, b) => {
        if (a.rating !== b.rating) {
          return ratingSort === 'lowest' ? a.rating - b.rating : b.rating - a.rating;
        }
        return b.reviewCount - a.reviewCount;
      })
      .slice(0, 8);
  }, [branches, deferredRatingSearch, ratingSort]);

  const missingOnMapsRows = useMemo(
    () =>
      branches
        .filter((b) => !(Boolean(b.googlePlaceId || b.gbpLocationName || b.existingPoi) && !b.mapsNotFound))
        .slice(0, 6),
    [branches]
  );

  const needsSyncRows = useMemo(
    () =>
      branches
        .filter((b) => b.syncStatus === 'action_required' || b.syncStatus === 'discrepancy')
        .sort((a, b) => {
          if (a.syncStatus === b.syncStatus) return b.reviewCount - a.reviewCount;
          return a.syncStatus === 'action_required' ? -1 : 1;
        })
        .slice(0, 6),
    [branches]
  );

  const regionStats = useMemo(() => {
    const regionMap = new Map<string, { total: number; synced: number; pending: number }>();
    for (const b of branches) {
      const entry = regionMap.get(b.regionShort) ?? { total: 0, synced: 0, pending: 0 };
      entry.total++;
      if (b.syncStatus === 'synced') entry.synced++;
      else if (b.syncStatus === 'discrepancy' || b.syncStatus === 'action_required') {
        entry.pending++;
      }
      regionMap.set(b.regionShort, entry);
    }

    return Array.from(regionMap.entries())
      .map(([regionShort, val]) => ({
        regionShort,
        ...val,
        rate: val.total > 0 ? Math.round((val.synced / val.total) * 100) : 0,
      }))
      .sort((a, b) => b.pending - a.pending)
      .slice(0, 6);
  }, [branches]);

  if (loadError) {
    return (
      <div className="rounded-3xl bg-white border border-[#fecaca] p-8 text-center space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#fef2f2] text-[#dc2626]">
          <AlertCircle className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <h2 className="font-display text-lg font-bold text-[#1a1b22]">
            Gagal Memuat Data Jaringan
          </h2>
          <p className="text-sm text-[#444653] max-w-md mx-auto">{loadError}</p>
        </div>
        <button
          type="button"
          onClick={retryLoadBranches}
          className="h-11 px-5 rounded-2xl bg-[#00529C] text-white text-sm font-semibold hover:bg-[#004080] smooth-transition"
        >
          Muat Ulang Data
        </button>
      </div>
    );
  }

  if (isLoadingBranches) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[0, 1, 2, 3, 4, 5].map((idx) => (
            <div key={idx} className="h-36 rounded-3xl bg-white border border-[#e2e8f0]" />
          ))}
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-7 h-80 rounded-3xl bg-white border border-[#e2e8f0]" />
          <div className="xl:col-span-5 h-80 rounded-3xl bg-white border border-[#e2e8f0]" />
        </div>
      </div>
    );
  }

  const activePoint =
    hoveredDayIndex !== null
      ? SYNC_HISTORY_7D[hoveredDayIndex]
      : SYNC_HISTORY_7D[SYNC_HISTORY_7D.length - 1];

  const chartWidth = 620;
  const chartHeight = 185;
  const padX = 28;
  const padY = 20;
  const minRate = 70;
  const maxRate = 90;

  const points = SYNC_HISTORY_7D.map((d, i) => {
    const x = padX + (i / (SYNC_HISTORY_7D.length - 1)) * (chartWidth - padX * 2);
    const y =
      chartHeight -
      padY -
      ((d.syncRate - minRate) / (maxRate - minRate)) * (chartHeight - padY * 2);
    return { x, y, ...d };
  });

  const polylineStr = points.map((p) => `${p.x},${p.y}`).join(' ');
  const areaStr = `${points[0].x},${chartHeight - padY} ${polylineStr} ${points[points.length - 1].x},${chartHeight - padY}`;

  const activeAlerts = securityAlerts.filter((a) => a.status === 'active');

  return (
    <div className="space-y-6">
      {/* Executive Greeting & Live Security Strip */}
      <section className="rounded-3xl bg-white border border-[#e2e8f0] p-6 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.05)] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-mono text-[#00529C] font-semibold">
            SENTRA LOKASI &amp; REPUTASI BANK BRI · MASTER DATA → GOOGLE MAPS
          </p>
          <h2 className="font-display text-xl sm:text-2xl font-bold text-[#1a1b22] text-balance">
            Selamat Datang, {user?.fullName || user?.username || 'Tim Operasional BRI'}
          </h2>
          <p className="text-xs sm:text-sm text-[#444653]">
            Ringkasan kondisi seluruh{' '}
            <span className="font-mono font-semibold text-[#1a1b22] tabular-nums">
              {kpiStats.totalBranches.toLocaleString('id-ID')}
            </span>{' '}
            unit kerja BRI di 18 Kantor Wilayah beserta status Google Maps &amp; proteksi listing.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {markedBranchIds.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setDirectoryFilterPreset('marked');
                setActiveView('directory');
              }}
              className="h-10 px-4 rounded-2xl bg-[#eff6ff] border border-[#bfdbfe] text-xs font-semibold text-[#00529C] inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Tag className="h-3.5 w-3.5" />
              <span>{markedBranchIds.length} Ditandai Ubah</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setActiveView('gbp-connect')}
            className={`h-10 px-4 rounded-2xl border text-xs font-semibold inline-flex items-center gap-1.5 smooth-transition whitespace-nowrap ${
              isGbpConnected
                ? 'bg-[#ecfdf5] border-[#a7f3d0] text-[#059669]'
                : 'bg-white border-[#cbd5e1] text-[#1a1b22] hover:bg-[#f1f5f9]'
            }`}
          >
            <Link2 className="h-3.5 w-3.5" />
            <span>
              {isGbpConnected
                ? `GBP Terhubung (${gbpLocations.length})`
                : 'Hubungkan Akun GBP'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveView('data-quality')}
            className="h-10 px-4 rounded-2xl bg-[#00529C] hover:bg-[#004080] text-white text-xs font-semibold inline-flex items-center gap-1.5 smooth-transition whitespace-nowrap"
          >
            <Wrench className="h-3.5 w-3.5" />
            <span>Perbaiki Data Massal</span>
          </button>
        </div>
      </section>

      {/* Active Security Takeover Alert Strip */}
      {kpiStats.activeSecurityAlertsCount > 0 && (
        <section
          aria-label="Alert Keamanan Listing Aktif"
          className="rounded-3xl bg-[#fef2f2] border border-[#fecaca] px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="h-10 w-10 rounded-2xl bg-[#dc2626] text-white flex items-center justify-center shrink-0">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div className="space-y-0.5 min-w-0">
              <p className="font-display text-sm font-bold text-[#991b1b]">
                Terdeteksi {kpiStats.activeSecurityAlertsCount} Alert Upaya Pengambilalihan /
                Perubahan Info Tidak Dikenal
              </p>
              <p className="text-xs text-[#7f1d1d] truncate">
                {activeAlerts[0]
                  ? `${activeAlerts[0].branchCode} · ${activeAlerts[0].branchName} — ${activeAlerts[0].fieldChanged} oleh ${activeAlerts[0].suspectActor}`
                  : 'Segera tinjau dan pulihkan ke Master Data BRI.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveView('history-alerts')}
            className="h-10 px-4 rounded-2xl bg-[#dc2626] hover:bg-[#b91c1c] text-white text-xs font-semibold inline-flex items-center gap-1.5 smooth-transition whitespace-nowrap shrink-0"
          >
            <span>Tinjau &amp; Pulihkan Listing</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </section>
      )}

      {/* 6 Fresh Scannable Operational Summary Cards */}
      <section
        aria-label="Ringkasan 6 Metrik Operasional Utama"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"
      >
        {/* 1. Total Unit Kerja */}
        <button
          type="button"
          onClick={() => {
            setDirectoryFilterPreset('ALL');
            setActiveView('directory');
          }}
          className="text-left rounded-3xl bg-white border border-[#e2e8f0] hover:border-[#00529C]/40 p-6 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.05)] flex flex-col justify-between gap-4 smooth-transition"
        >
          <div className="flex items-start justify-between gap-3 w-full">
            <div className="space-y-1">
              <p className="text-xs font-medium text-[#64748b]">Total Unit Kerja Master BRI</p>
              <p className="font-mono text-3xl font-bold text-[#1a1b22] tabular-nums">
                {kpiStats.totalBranches.toLocaleString('id-ID')}
              </p>
            </div>
            <div className="h-11 w-11 rounded-2xl bg-[#eff6ff] text-[#00529C] flex items-center justify-center shrink-0">
              <MapPin className="h-5 w-5" />
            </div>
          </div>
          <div className="space-y-2 w-full">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#444653]">
                {kpiStats.syncedCount.toLocaleString('id-ID')} tersinkronisasi
              </span>
              <span className="font-mono font-semibold text-[#059669] tabular-nums">
                {kpiStats.syncRate}%
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-[#f1f5f9] overflow-hidden">
              <div
                className="h-full rounded-full bg-[#00529C]"
                style={{ width: `${Math.min(100, kpiStats.syncRate)}%` }}
              />
            </div>
          </div>
        </button>

        {/* 2. Data Perlu Perbaikan */}
        <button
          type="button"
          onClick={() => setActiveView('data-quality')}
          className="text-left rounded-3xl bg-white border border-[#e2e8f0] hover:border-[#d97706]/50 p-6 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.05)] flex flex-col justify-between gap-4 smooth-transition"
        >
          <div className="flex items-start justify-between gap-3 w-full">
            <div className="space-y-1">
              <p className="text-xs font-medium text-[#64748b]">Data Perlu Dilakukan Perbaikan</p>
              <p className="font-mono text-3xl font-bold text-[#d97706] tabular-nums">
                {qualityAudit.counts.totalFlagged.toLocaleString('id-ID')}
              </p>
            </div>
            <div className="h-11 w-11 rounded-2xl bg-[#fffbeb] text-[#d97706] flex items-center justify-center shrink-0">
              <Wrench className="h-5 w-5" />
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 text-xs text-[#444653] w-full">
            <span className="truncate">
              {qualityAudit.counts.invalidPhone} telp · {qualityAudit.counts.missingHours} jam ·{' '}
              {qualityAudit.counts.invalidCoordinates} titik
            </span>
            <span className="font-semibold text-[#00529C] shrink-0">Perbaiki →</span>
          </div>
        </button>

        {/* 3. Belum Terdapat di Google Maps */}
        <button
          type="button"
          onClick={() => {
            setDirectoryFilterPreset('missing_maps');
            setActiveView('directory');
          }}
          className="text-left rounded-3xl bg-white border border-[#e2e8f0] hover:border-[#00529C]/40 p-6 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.05)] flex flex-col justify-between gap-4 smooth-transition"
        >
          <div className="flex items-start justify-between gap-3 w-full">
            <div className="space-y-1">
              <p className="text-xs font-medium text-[#64748b]">Belum Terdapat di Google Maps</p>
              <p className="font-mono text-3xl font-bold text-[#1a1b22] tabular-nums">
                {kpiStats.missingOnMapsCount.toLocaleString('id-ID')}
              </p>
            </div>
            <div className="h-11 w-11 rounded-2xl bg-[#f1f5f9] text-[#475569] flex items-center justify-center shrink-0">
              <MapPinOff className="h-5 w-5" />
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 text-xs text-[#444653] w-full">
            <span className="tabular-nums">
              {kpiStats.registeredOnMapsCount.toLocaleString('id-ID')} unit sudah memiliki POI Maps
            </span>
            <span className="font-semibold text-[#00529C] shrink-0">Lihat Daftar →</span>
          </div>
        </button>

        {/* 4. Data Menunggu Sinkronisasi */}
        <button
          type="button"
          onClick={() =>
            kpiStats.pendingReviewCount > 0 ? setActiveView('sync-queue') : openBulkSync()
          }
          className="text-left rounded-3xl bg-white border border-[#e2e8f0] hover:border-[#00529C]/40 p-6 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.05)] flex flex-col justify-between gap-4 smooth-transition"
        >
          <div className="flex items-start justify-between gap-3 w-full">
            <div className="space-y-1">
              <p className="text-xs font-medium text-[#64748b]">Data Menunggu Sinkronisasi</p>
              <p className="font-mono text-3xl font-bold text-[#00529C] tabular-nums">
                {kpiStats.waitingSyncCount.toLocaleString('id-ID')}
              </p>
            </div>
            <div className="h-11 w-11 rounded-2xl bg-[#eff6ff] text-[#00529C] flex items-center justify-center shrink-0">
              <Clock className="h-5 w-5" />
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 text-xs text-[#444653] w-full">
            <span className="tabular-nums">
              {(kpiStats.actionRequiredCount + kpiStats.discrepancyCount).toLocaleString('id-ID')}{' '}
              selisih · {kpiStats.pendingReviewCount.toLocaleString('id-ID')} antrean Google
            </span>
            <span className="font-semibold text-[#00529C] shrink-0">Pantau →</span>
          </div>
        </button>

        {/* 5. Rata-rata Rating & Ulasan */}
        <button
          type="button"
          onClick={() => setActiveView('reviews')}
          className="text-left rounded-3xl bg-white border border-[#e2e8f0] hover:border-[#059669]/40 p-6 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.05)] flex flex-col justify-between gap-4 smooth-transition"
        >
          <div className="flex items-start justify-between gap-3 w-full">
            <div className="space-y-1">
              <p className="text-xs font-medium text-[#64748b]">Rata-rata Rating &amp; Ulasan</p>
              <div className="flex items-baseline gap-1.5">
                <p className="font-mono text-3xl font-bold text-[#1a1b22] tabular-nums">
                  {kpiStats.avgRating.toFixed(2)}
                </p>
                <span className="text-xs text-[#64748b] font-mono">/ 5.00</span>
              </div>
            </div>
            <div className="h-11 w-11 rounded-2xl bg-[#ecfdf5] text-[#059669] flex items-center justify-center shrink-0">
              <Star className="h-5 w-5 fill-[#059669]/20" />
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 text-xs text-[#444653] w-full">
            <span className="tabular-nums">
              {kpiStats.repliedCount}/{kpiStats.totalReviews} ulasan dibalas ({kpiStats.resolutionRate}
              %)
            </span>
            <span className="font-semibold text-[#059669] shrink-0">Kotak Masuk →</span>
          </div>
        </button>

        {/* 6. Keamanan Listing & Histori */}
        <button
          type="button"
          onClick={() => setActiveView('history-alerts')}
          className="text-left rounded-3xl bg-white border border-[#e2e8f0] hover:border-[#dc2626]/40 p-6 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.05)] flex flex-col justify-between gap-4 smooth-transition"
        >
          <div className="flex items-start justify-between gap-3 w-full">
            <div className="space-y-1">
              <p className="text-xs font-medium text-[#64748b]">Keamanan Listing &amp; Histori</p>
              <p
                className={`font-mono text-3xl font-bold tabular-nums ${
                  kpiStats.activeSecurityAlertsCount > 0 ? 'text-[#dc2626]' : 'text-[#059669]'
                }`}
              >
                {kpiStats.activeSecurityAlertsCount.toLocaleString('id-ID')}{' '}
                <span className="text-sm font-sans font-semibold text-[#64748b]">Alert Aktif</span>
              </p>
            </div>
            <div
              className={`h-11 w-11 rounded-2xl flex items-center justify-center shrink-0 ${
                kpiStats.activeSecurityAlertsCount > 0
                  ? 'bg-[#fef2f2] text-[#dc2626]'
                  : 'bg-[#ecfdf5] text-[#059669]'
              }`}
            >
              {kpiStats.activeSecurityAlertsCount > 0 ? (
                <ShieldAlert className="h-5 w-5" />
              ) : (
                <ShieldCheck className="h-5 w-5" />
              )}
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 text-xs text-[#444653] w-full">
            <span className="tabular-nums">
              {changeHistory.length.toLocaleString('id-ID')} histori perubahan tercatat
            </span>
            <span className="font-semibold text-[#00529C] shrink-0">Audit Log →</span>
          </div>
        </button>
      </section>

      {/* Interactive Panel: Rating Tiap Lokasi Unit Kerja */}
      <section
        aria-label="Rating Tiap Lokasi Unit Kerja"
        className="rounded-3xl bg-white border border-[#e2e8f0] shadow-[0_4px_20px_-2px_rgba(15,23,42,0.05)] overflow-hidden"
      >
        <div className="p-6 border-b border-[#e2e8f0] flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-display text-lg font-bold text-[#1a1b22]">
              Rating Tiap Lokasi Unit Kerja BRI
            </h2>
            <p className="text-xs text-[#64748b] tabular-nums">
              Distribusi skor unit kerja:{' '}
              <span className="font-semibold text-[#059669]">
                {ratingStats.high.toLocaleString('id-ID')} unit ≥ 4.5 ★
              </span>
              <span className="mx-1.5">·</span>
              <span className="font-semibold text-[#00529C]">
                {ratingStats.mid.toLocaleString('id-ID')} unit 4.0–4.4 ★
              </span>
              <span className="mx-1.5">·</span>
              <span className="font-semibold text-[#d97706]">
                {ratingStats.low.toLocaleString('id-ID')} unit &lt; 4.0 ★
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative min-w-[230px] flex-1 sm:flex-initial">
              <Search className="h-3.5 w-3.5 text-[#64748b] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={ratingSearch}
                onChange={(e) => setRatingSearch(e.target.value)}
                placeholder="Cari cabang, kode, atau kota..."
                aria-label="Cari rating lokasi unit kerja"
                className="w-full h-9 pl-9 pr-3 rounded-xl bg-[#f8fafc] border border-[#cbd5e1] text-xs text-[#1a1b22] placeholder:text-[#94a3b8] focus:outline-none focus:bg-white focus:border-[#00529C]"
              />
            </div>

            <button
              type="button"
              onClick={() =>
                setRatingSort((prev) => (prev === 'lowest' ? 'highest' : 'lowest'))
              }
              className="h-9 px-3.5 rounded-xl bg-white border border-[#cbd5e1] hover:bg-[#f1f5f9] text-xs font-semibold text-[#1a1b22] inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <ArrowUpDown className="h-3.5 w-3.5 text-[#00529C]" />
              <span>
                {ratingSort === 'lowest' ? 'Urutkan: Rating Terendah' : 'Urutkan: Rating Tertinggi'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveView('reviews')}
              className="h-9 px-3.5 rounded-xl bg-[#eff6ff] hover:bg-[#dbeafe] text-xs font-semibold text-[#00529C] inline-flex items-center gap-1 whitespace-nowrap"
            >
              <span>Kelola Ulasan</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#f8fafc] border-b border-[#e2e8f0] text-[11px] font-semibold text-[#475569]">
                <th className="py-3 px-6">Kode</th>
                <th className="py-3 px-4">Nama Unit Kerja · Kanwil</th>
                <th className="py-3 px-4">Rating</th>
                <th className="py-3 px-4">Ulasan</th>
                <th className="py-3 px-4">Kehadiran Maps</th>
                <th className="py-3 px-6 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e2e8f0] text-sm">
              {ratingRows.map((branch) => {
                const isOnMaps =
                  Boolean(branch.googlePlaceId || branch.gbpLocationName || branch.existingPoi) &&
                  !branch.mapsNotFound;
                return (
                  <tr key={branch.id} className="h-12 hover:bg-[#f8fafc] smooth-transition">
                    <td className="py-2.5 px-6 font-mono text-xs text-[#444653] tabular-nums whitespace-nowrap">
                      {branch.code}
                    </td>
                    <td className="py-2.5 px-4">
                      <p className="font-semibold text-[#1a1b22] text-xs truncate max-w-xs">
                        {branch.name}
                      </p>
                      <p className="text-[11px] text-[#64748b] truncate">
                        {branch.tier} · {branch.city} · {branch.regionShort}
                      </p>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-xs font-semibold tabular-nums whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 ${
                          branch.rating >= 4.5
                            ? 'text-[#059669]'
                            : branch.rating >= 4.0
                              ? 'text-[#00529C]'
                              : 'text-[#d97706]'
                        }`}
                      >
                        <Star className="h-3.5 w-3.5 fill-current" />
                        <span>{branch.rating.toFixed(1)}</span>
                      </span>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-xs text-[#444653] tabular-nums whitespace-nowrap">
                      {branch.reviewCount.toLocaleString('id-ID')}
                    </td>
                    <td className="py-2.5 px-4 text-xs whitespace-nowrap">
                      <span
                        className={`font-semibold ${
                          isOnMaps ? 'text-[#059669]' : 'text-[#64748b]'
                        }`}
                      >
                        {isOnMaps ? 'Terdaftar POI Maps' : 'Belum di Maps'}
                      </span>
                    </td>
                    <td className="py-2.5 px-6 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedBranchId(branch.id);
                            setDirectoryFilterPreset('ALL');
                            setActiveView('directory');
                          }}
                          className="h-8 px-3 rounded-xl border border-[#cbd5e1] bg-white hover:bg-[#f1f5f9] text-xs font-medium text-[#1a1b22]"
                        >
                          Inspeksi
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveView('reviews')}
                          className="h-8 px-3 rounded-xl bg-[#eff6ff] hover:bg-[#dbeafe] text-xs font-semibold text-[#00529C]"
                        >
                          Ulasan
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Telemetry Chart & Regional Health */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-7 rounded-3xl bg-white border border-[#e2e8f0] p-6 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.05)] flex flex-col justify-between gap-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <h2 className="font-display text-lg font-semibold text-[#1a1b22] text-balance">
                Tren Kepatuhan Sinkronisasi 7 Hari Terakhir
              </h2>
              <p className="text-xs text-[#64748b]">
                Persentase keselarasan Master Bank BRI terhadap Profil Google Maps
              </p>
            </div>
            {activePoint && (
              <div className="rounded-2xl bg-[#f8fafc] border border-[#e2e8f0] px-4 py-2 text-right">
                <p className="text-[11px] text-[#64748b]">{activePoint.day} 2026</p>
                <p className="font-mono text-sm font-semibold text-[#00529C] tabular-nums">
                  {activePoint.syncRate}% · {activePoint.resolvedDiscrepancies} selisih diselesaikan
                </p>
              </div>
            )}
          </div>

          <div className="w-full overflow-hidden">
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              className="w-full h-44 overflow-visible"
              role="img"
              aria-label="Grafik tren sinkronisasi 7 hari terakhir"
            >
              <defs>
                <linearGradient id="syncAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00529C" stopOpacity="0.18" />
                  <stop offset="100%" stopColor="#00529C" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {[75, 80, 85].map((tick) => {
                const y =
                  chartHeight -
                  padY -
                  ((tick - minRate) / (maxRate - minRate)) * (chartHeight - padY * 2);
                return (
                  <g key={tick}>
                    <line
                      x1={padX}
                      x2={chartWidth - padX}
                      y1={y}
                      y2={y}
                      stroke="#e2e8f0"
                      strokeDasharray="4 4"
                    />
                    <text x={4} y={y + 4} className="fill-[#64748b] font-mono text-[10px]">
                      {tick}%
                    </text>
                  </g>
                );
              })}

              <polygon points={areaStr} fill="url(#syncAreaGrad)" />
              <polyline
                fill="none"
                stroke="#00529C"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={polylineStr}
              />

              {points.map((pt, idx) => {
                const isActive = hoveredDayIndex === idx;
                return (
                  <g
                    key={pt.day}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredDayIndex(idx)}
                  >
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={isActive ? 7 : 4.5}
                      fill={isActive ? '#00529C' : '#ffffff'}
                      stroke="#00529C"
                      strokeWidth="2.5"
                    />
                    <text
                      x={pt.x}
                      y={chartHeight - 2}
                      textAnchor="middle"
                      className={`font-mono text-[10px] ${
                        isActive ? 'fill-[#00529C] font-semibold' : 'fill-[#64748b]'
                      }`}
                    >
                      {pt.day}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Regional Office Health List */}
        <div className="xl:col-span-5 rounded-3xl bg-white border border-[#e2e8f0] p-6 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.05)] flex flex-col justify-between gap-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-[#1a1b22]">
                Distribusi Prioritas Wilayah
              </h2>
              <p className="text-xs text-[#64748b]">
                Kantor wilayah dengan antrean sinkronisasi tertinggi
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setDirectoryFilterPreset('ALL');
                setActiveView('directory');
              }}
              className="text-xs font-semibold text-[#00529C] hover:underline inline-flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              <span>Lihat Peta</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="divide-y divide-[#e2e8f0]">
            {regionStats.map((reg) => (
              <button
                key={reg.regionShort}
                type="button"
                onClick={() => onNavigateToRegion(reg.regionShort)}
                className="w-full text-left py-2.5 hover:bg-[#f8fafc] px-2 -mx-2 rounded-xl smooth-transition"
              >
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <span className="text-sm font-semibold text-[#1a1b22] truncate">
                    {reg.regionShort}
                  </span>
                  <span className="font-mono text-xs text-[#444653] tabular-nums shrink-0">
                    {reg.pending.toLocaleString('id-ID')} selisih · {reg.total.toLocaleString('id-ID')}{' '}
                    unit
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-[#e2e8f0] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#0284c7]"
                    style={{ width: `${reg.rate}%` }}
                  />
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Summary Row: Missing on Maps / Priority Queue & Recent History */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left: Missing on Maps & Pending Alignment */}
        <section className="xl:col-span-7 rounded-3xl bg-white border border-[#e2e8f0] shadow-[0_4px_20px_-2px_rgba(15,23,42,0.05)] overflow-hidden">
          <div className="p-6 border-b border-[#e2e8f0] flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-[#1a1b22]">
                Unit Belum di Google Maps &amp; Antrean Perbaikan
              </h2>
              <p className="text-xs text-[#64748b]">
                Tandai beberapa lokasi sekaligus untuk perbaikan &amp; sinkronisasi serentak 1-klik
              </p>
            </div>
            <div className="inline-flex items-center gap-1 p-1 rounded-2xl bg-[#f1f5f9]">
              <button
                type="button"
                onClick={() => setPriorityTab('missing_maps')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold smooth-transition ${
                  priorityTab === 'missing_maps'
                    ? 'bg-white text-[#1a1b22] shadow-xs'
                    : 'text-[#444653] hover:text-[#1a1b22]'
                }`}
              >
                Belum di Maps ({kpiStats.missingOnMapsCount.toLocaleString('id-ID')})
              </button>
              <button
                type="button"
                onClick={() => setPriorityTab('needs_sync')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold smooth-transition ${
                  priorityTab === 'needs_sync'
                    ? 'bg-white text-[#1a1b22] shadow-xs'
                    : 'text-[#444653] hover:text-[#1a1b22]'
                }`}
              >
                Perlu Penyelarasan (
                {(kpiStats.actionRequiredCount + kpiStats.discrepancyCount).toLocaleString('id-ID')}
                )
              </button>
            </div>
          </div>

          <div className="divide-y divide-[#e2e8f0]">
            {(priorityTab === 'missing_maps' ? missingOnMapsRows : needsSyncRows).map((branch) => {
              const isMarked = markedSet.has(branch.id);
              return (
                <div
                  key={branch.id}
                  className="px-6 py-3.5 hover:bg-[#f8fafc] smooth-transition flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-mono text-[#64748b] tabular-nums">
                      {branch.code} · {branch.tier} · {branch.regionShort}
                    </p>
                    <p className="text-sm font-semibold text-[#1a1b22] truncate">{branch.name}</p>
                    <p className="text-xs text-[#64748b] truncate">
                      {priorityTab === 'missing_maps'
                        ? branch.address
                        : branch.discrepancies[0]?.fieldLabel || 'Penyesuaian Data Master BRI'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={branch.syncStatus} compact />
                    <button
                      type="button"
                      onClick={() => toggleBranchMarked(branch.id)}
                      className={`h-8 px-2.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1 whitespace-nowrap smooth-transition ${
                        isMarked
                          ? 'bg-[#00529C] border-[#00529C] text-white'
                          : 'bg-white border-[#cbd5e1] text-[#444653] hover:bg-[#f1f5f9]'
                      }`}
                    >
                      <Tag className="h-3 w-3" />
                      <span>{isMarked ? 'Ditandai' : 'Tandai Ubah'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedBranchId(branch.id);
                        setDirectoryFilterPreset(
                          priorityTab === 'missing_maps' ? 'missing_maps' : 'ALL'
                        );
                        setActiveView('directory');
                      }}
                      className="h-8 px-3 rounded-xl bg-[#eff6ff] hover:bg-[#dbeafe] text-xs font-semibold text-[#00529C] whitespace-nowrap"
                    >
                      Inspeksi
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Right: Recent History & Security Status */}
        <section className="xl:col-span-5 rounded-3xl bg-white border border-[#e2e8f0] shadow-[0_4px_20px_-2px_rgba(15,23,42,0.05)] flex flex-col justify-between overflow-hidden">
          <div className="p-6 border-b border-[#e2e8f0] flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-[#1a1b22]">
                Histori Perubahan Terakhir
              </h2>
              <p className="text-xs text-[#64748b]">
                Audit perubahan data &amp; status proteksi akun ({gbpUser?.email || 'Master BRI'})
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveView('history-alerts')}
              className="text-xs font-semibold text-[#00529C] hover:underline inline-flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              <span>Lihat Semua</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex-1 divide-y divide-[#e2e8f0]">
            {changeHistory.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <History className="h-7 w-7 text-[#94a3b8] mx-auto" />
                <p className="text-sm font-semibold text-[#1a1b22]">
                  Belum Ada Aktivitas Perubahan Baru
                </p>
                <p className="text-xs text-[#64748b]">
                  Setiap perbaikan 1-klik, Bulk Import naik status, atau pemulihan keamanan akan
                  tercatat otomatis di sini.
                </p>
              </div>
            ) : (
              changeHistory.slice(0, 5).map((ev) => (
                <div key={ev.id} className="px-6 py-3.5 hover:bg-[#f8fafc] smooth-transition">
                  <p className="text-[11px] font-mono text-[#64748b] tabular-nums">
                    {ev.timestamp} · Oleh {ev.actor}
                  </p>
                  <p className="text-xs font-bold text-[#1a1b22] mt-0.5 truncate">
                    {ev.branchCode} · {ev.branchName}
                  </p>
                  <p className="text-xs text-[#444653] truncate">{ev.summary}</p>
                </div>
              ))
            )}
          </div>

          <div className="px-6 py-3.5 bg-[#f8fafc] border-t border-[#e2e8f0] flex items-center justify-between gap-3 text-xs">
            <span className="text-[#444653] font-medium">
              {kpiStats.activeSecurityAlertsCount > 0
                ? `${kpiStats.activeSecurityAlertsCount} alert keamanan perlu perhatian`
                : 'Tidak ada ancaman pengambilalihan aktif'}
            </span>
            <button
              type="button"
              onClick={() => setActiveView('history-alerts')}
              className="font-semibold text-[#00529C] hover:underline whitespace-nowrap"
            >
              Buka Keamanan →
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
