import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Compass,
  ExternalLink,
  FileSpreadsheet,
  Globe,
  Link2,
  Loader2,
  MapPin,
  MessageSquarePlus,
  Phone,
  RefreshCw,
  Search,
  Send,
  Star,
  Tag,
  X,
} from 'lucide-react';
import { useGbpAuth } from '../context/GbpAuthContext';
import { useOps } from '../context/OpsContext';
import type { BranchTier, SyncStatus, WeeklyHoursSchedule } from '../types/ops';
import { BatchMarkEditModal } from './BatchMarkEditModal';
import { BulkImportExportModal } from './BulkImportExportModal';
import {
  CoordinateComparisonMap,
  calculateDistanceMeters,
  formatDistanceId,
  isValidIndonesianCoords,
} from './CoordinateComparisonMap';
import { IndonesiaBranchMap } from './IndonesiaBranchMap';
import { StatusBadge } from './StatusBadge';
import { ensureWeeklyHours, WeeklyHoursChecklist } from './WeeklyHoursChecklist';

interface DirectoryWorkspaceProps {
  initialRegionFilter?: string;
}

const PAGE_SIZE = 20;

const STATUS_TABS: Array<{
  id: 'ALL' | 'missing_maps' | 'marked' | SyncStatus;
  label: string;
}> = [
  { id: 'ALL', label: 'Semua' },
  { id: 'action_required', label: 'Perlu Tindakan' },
  { id: 'discrepancy', label: 'Perbedaan Data' },
  { id: 'pending_review', label: 'Review Google' },
  { id: 'missing_maps', label: 'Belum di Maps' },
  { id: 'marked', label: 'Ditandai Ubah' },
  { id: 'synced', label: 'Tersinkronisasi' },
];

const TIER_OPTIONS: Array<{ id: 'ALL' | BranchTier; label: string }> = [
  { id: 'ALL', label: 'Semua Tipe Unit' },
  { id: 'RO', label: 'Regional Office (RO)' },
  { id: 'KC', label: 'Kantor Cabang (KC)' },
  { id: 'KCP', label: 'Cabang Pembantu (KCP)' },
  { id: 'KK', label: 'Kantor Kas (KK)' },
  { id: 'UNIT', label: 'BRI Unit' },
  { id: 'SSB', label: 'Sentra Layanan (SSB)' },
  { id: 'TERAS', label: 'Teras BRI' },
];

export function DirectoryWorkspace({ initialRegionFilter = 'ALL' }: DirectoryWorkspaceProps) {
  const {
    branches,
    regions,
    selectedBranchId,
    setSelectedBranchId,
    selectedBranch,
    checkedBranchIds,
    toggleBranchChecked,
    setCheckedBranchIds,
    markedBranchIds,
    toggleBranchMarked,
    markManyBranches,
    clearMarkedBranches,
    executeBatchMarkFix,
    directoryFilterPreset,
    setDirectoryFilterPreset,
    syncSingleBranch,
    pushBranchToGbpLive,
    globalSearch,
    setGlobalSearch,
    openBulkSync,
    mapsApiKey,
    livePlacesCache,
    loadingPlaceIds,
    placeErrors,
    fetchLiveGooglePlace,
    importGoogleReviewsToInbox,
    setActiveView,
  } = useOps();
  const { isConnected: isGbpConnected, gbpAccessToken } = useGbpAuth();

  const [regionFilter, setRegionFilter] = useState<string>(initialRegionFilter);
  const [tierFilter, setTierFilter] = useState<'ALL' | BranchTier>('ALL');
  const [statusFilter, setStatusFilter] = useState<
    'ALL' | 'missing_maps' | 'marked' | SyncStatus
  >(directoryFilterPreset);
  const [page, setPage] = useState(1);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [isBatchMarkModalOpen, setIsBatchMarkModalOpen] = useState(false);
  const [isRunningQuickMarkFix, setIsRunningQuickMarkFix] = useState(false);
  const [showGbpPushConfirm, setShowGbpPushConfirm] = useState(false);
  const [showMasterSyncConfirm, setShowMasterSyncConfirm] = useState(false);
  const [showDistanceModal, setShowDistanceModal] = useState(false);
  const [isPushingLive, setIsPushingLive] = useState(false);

  useEffect(() => {
    setRegionFilter(initialRegionFilter);
    setPage(1);
  }, [initialRegionFilter]);

  useEffect(() => {
    setStatusFilter(directoryFilterPreset);
    setPage(1);
  }, [directoryFilterPreset]);

  const deferredSearch = useDeferredValue(globalSearch.trim().toLowerCase());
  const markedSet = useMemo(() => new Set(markedBranchIds), [markedBranchIds]);

  const filteredBranches = useMemo(() => {
    return branches.filter((b) => {
      if (regionFilter !== 'ALL' && b.regionShort !== regionFilter) return false;
      if (tierFilter !== 'ALL' && b.tier !== tierFilter) return false;
      if (statusFilter === 'missing_maps') {
        const isRegistered =
          Boolean(b.googlePlaceId || b.gbpLocationName || b.existingPoi) && !b.mapsNotFound;
        if (isRegistered) return false;
      } else if (statusFilter === 'marked') {
        if (!markedSet.has(b.id)) return false;
      } else if (statusFilter !== 'ALL' && b.syncStatus !== statusFilter) {
        return false;
      }
      if (deferredSearch) {
        const hay = `${b.name} ${b.code} ${b.city} ${b.province} ${b.address}`.toLowerCase();
        if (!hay.includes(deferredSearch)) return false;
      }
      return true;
    });
  }, [branches, regionFilter, tierFilter, statusFilter, deferredSearch, markedSet]);

  const totalPages = Math.max(1, Math.ceil(filteredBranches.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const pageRows = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredBranches.slice(start, start + PAGE_SIZE);
  }, [filteredBranches, safePage]);

  // Master Data Editor state synchronized with selectedBranch
  const [editName, setEditName] = useState('');
  const [editWeeklyHours, setEditWeeklyHours] = useState<WeeklyHoursSchedule>(() =>
    ensureWeeklyHours(null)
  );
  const [editPhone, setEditPhone] = useState('');
  const [editWebsite, setEditWebsite] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editLat, setEditLat] = useState('');
  const [editLng, setEditLng] = useState('');
  const [isImportingReviews, setIsImportingReviews] = useState(false);

  useEffect(() => {
    if (selectedBranch) {
      setEditName(selectedBranch.name);
      setEditWeeklyHours(ensureWeeklyHours(selectedBranch));
      setEditPhone(selectedBranch.phone);
      setEditWebsite(selectedBranch.website || 'https://bri.co.id');
      setEditAddress(selectedBranch.address);
      setEditLat(String(selectedBranch.lat));
      setEditLng(String(selectedBranch.lng));
      setShowGbpPushConfirm(false);
      setShowMasterSyncConfirm(false);
    }
  }, [selectedBranch?.id]);

  // Automatically populate GBP / Google Maps profile preview when selecting a branch
  useEffect(() => {
    if (selectedBranch && !(selectedBranch.id in livePlacesCache)) {
      fetchLiveGooglePlace(selectedBranch);
    }
  }, [selectedBranch?.id]);

  const livePlace = selectedBranch ? livePlacesCache[selectedBranch.id] : undefined;
  const isLoadingPlace = selectedBranch ? Boolean(loadingPlaceIds[selectedBranch.id]) : false;
  const placeError = selectedBranch ? placeErrors[selectedBranch.id] : undefined;

  const coordComparisonInfo = useMemo(() => {
    if (!selectedBranch) return null;
    const coordDisc = selectedBranch.discrepancies.find((d) => d.field === 'coordinates');
    const refLat =
      typeof livePlace?.lat === 'number'
        ? livePlace.lat
        : selectedBranch.gbpLat ?? coordDisc?.gbpLat;
    const refLng =
      typeof livePlace?.lng === 'number'
        ? livePlace.lng
        : selectedBranch.gbpLng ?? coordDisc?.gbpLng;
    const refValid =
      typeof refLat === 'number' &&
      typeof refLng === 'number' &&
      isValidIndonesianCoords(refLat, refLng);
    const masterValid = isValidIndonesianCoords(selectedBranch.lat, selectedBranch.lng);

    const distanceMeters =
      refValid && masterValid
        ? calculateDistanceMeters(selectedBranch.lat, selectedBranch.lng, refLat!, refLng!)
        : null;

    const showComparison =
      !masterValid ||
      Boolean(coordDisc) ||
      (distanceMeters !== null && distanceMeters > 15);

    return {
      showComparison,
      refLat,
      refLng,
      refValid,
      distanceMeters,
    };
  }, [selectedBranch, livePlace]);

  const handleDirectCheckDistance = (branch = selectedBranch) => {
    if (!branch) return;
    setSelectedBranchId(branch.id);
    setShowDistanceModal(true);
    fetchLiveGooglePlace(branch, true);
  };

  const allPageSelected =
    pageRows.length > 0 && pageRows.every((row) => checkedBranchIds.includes(row.id));

  const handleToggleAllPage = () => {
    if (allPageSelected) {
      const pageIds = new Set(pageRows.map((r) => r.id));
      setCheckedBranchIds(checkedBranchIds.filter((id) => !pageIds.has(id)));
    } else {
      const merged = new Set([...checkedBranchIds, ...pageRows.map((r) => r.id)]);
      setCheckedBranchIds(Array.from(merged));
    }
  };

  const handleImportBranchReviews = async () => {
    if (!selectedBranch || !livePlace) return;
    setIsImportingReviews(true);
    try {
      const count = await importGoogleReviewsToInbox(selectedBranch, livePlace);
      if (count > 0) {
        setActiveView('reviews');
      }
    } finally {
      setIsImportingReviews(false);
    }
  };

  const handleDirectGbpPush = async () => {
    if (!selectedBranch?.gbpLocationName || !gbpAccessToken) return;
    setIsPushingLive(true);
    try {
      await pushBranchToGbpLive(
        selectedBranch.id,
        selectedBranch.gbpLocationName,
        gbpAccessToken
      );
      setShowGbpPushConfirm(false);
    } finally {
      setIsPushingLive(false);
    }
  };

  const handleQuickMarkFix = async (mode: 'phone' | 'website') => {
    if (markedBranchIds.length === 0) return;
    setIsRunningQuickMarkFix(true);
    try {
      await executeBatchMarkFix({
        branchIds: markedBranchIds,
        applyPhone: mode === 'phone',
        phone: mode === 'phone' ? '1500017' : undefined,
        applyWebsite: mode === 'website',
        website: mode === 'website' ? 'https://bri.co.id' : undefined,
        submitToGoogleReview: true,
      });
    } finally {
      setIsRunningQuickMarkFix(false);
    }
  };

  const handleConfirmMasterSync = async () => {
    if (!selectedBranch) return;
    const parsedLat = Number.parseFloat(editLat.replace(',', '.'));
    const parsedLng = Number.parseFloat(editLng.replace(',', '.'));
    setShowMasterSyncConfirm(false);
    await syncSingleBranch(selectedBranch.id, {
      name: editName,
      weeklyHours: editWeeklyHours,
      operatingHours: editWeeklyHours.mon.open ? editWeeklyHours.mon.hours : 'Tutup',
      saturdayHours: editWeeklyHours.sat.open ? editWeeklyHours.sat.hours : 'Tutup',
      sundayHours: editWeeklyHours.sun.open ? editWeeklyHours.sun.hours : '',
      phone: editPhone,
      website: editWebsite,
      address: editAddress,
      lat: Number.isFinite(parsedLat) ? parsedLat : selectedBranch.lat,
      lng: Number.isFinite(parsedLng) ? parsedLng : selectedBranch.lng,
      googlePlaceId: livePlace?.placeId,
      googleMapsUri: livePlace?.googleMapsUri,
    });
  };

  return (
    <div className="space-y-6">
      {/* Filter & Segment Controls */}
      <section className="rounded-3xl bg-white border border-[#e2e8f0] p-5 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.05)] space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-5 relative">
            <Search className="h-4 w-4 text-[#64748b] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={globalSearch}
              onChange={(e) => {
                setGlobalSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Cari nama cabang, kode unit, kota, atau alamat..."
              aria-label="Filter direktori cabang"
              className="w-full h-11 pl-11 pr-4 rounded-2xl bg-[#f8fafc] border border-[#cbd5e1] text-sm text-[#1a1b22] placeholder:text-[#94a3b8] focus:outline-none focus:bg-white focus:border-[#00529C] focus:ring-4 focus:ring-[#00529C]/15 smooth-transition"
            />
          </div>

          <div className="md:col-span-4">
            <select
              value={regionFilter}
              onChange={(e) => {
                setRegionFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filter Kantor Wilayah"
              className="w-full h-11 px-4 rounded-2xl bg-[#f8fafc] border border-[#cbd5e1] text-sm text-[#1a1b22] focus:outline-none focus:bg-white focus:border-[#00529C] focus:ring-4 focus:ring-[#00529C]/15 smooth-transition"
            >
              <option value="ALL">Semua Kantor Wilayah (18 RO)</option>
              {regions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-3">
            <select
              value={tierFilter}
              onChange={(e) => {
                setTierFilter(e.target.value as 'ALL' | BranchTier);
                setPage(1);
              }}
              aria-label="Filter Tipe Unit Kerja"
              className="w-full h-11 px-4 rounded-2xl bg-[#f8fafc] border border-[#cbd5e1] text-sm text-[#1a1b22] focus:outline-none focus:bg-white focus:border-[#00529C] focus:ring-4 focus:ring-[#00529C]/15 smooth-transition"
            >
              {TIER_OPTIONS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-2xl bg-[#f1f5f9]">
            {STATUS_TABS.map((tab) => {
              const active = statusFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setStatusFilter(tab.id);
                    setDirectoryFilterPreset(tab.id);
                    setPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium smooth-transition whitespace-nowrap ${
                    active
                      ? 'bg-white text-[#1a1b22] shadow-xs'
                      : 'text-[#444653] hover:text-[#1a1b22]'
                  }`}
                >
                  {tab.id === 'marked' && markedBranchIds.length > 0
                    ? `${tab.label} (${markedBranchIds.length})`
                    : tab.label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <p className="text-xs text-[#64748b] tabular-nums">
              Menampilkan{' '}
              <span className="font-mono font-semibold text-[#1a1b22]">
                {filteredBranches.length.toLocaleString('id-ID')}
              </span>{' '}
              unit kerja BRI
              {checkedBranchIds.length > 0 && (
                <>
                  {' '}
                  ·{' '}
                  <button
                    type="button"
                    onClick={() => openBulkSync(checkedBranchIds)}
                    className="font-semibold text-[#00529C] hover:underline"
                  >
                    Sinkronkan {checkedBranchIds.length} terpilih
                  </button>
                </>
              )}
            </p>

            {pageRows.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  markManyBranches(
                    checkedBranchIds.length > 0
                      ? checkedBranchIds
                      : pageRows.map((row) => row.id)
                  )
                }
                className="h-9 px-3 rounded-xl bg-white border border-[#cbd5e1] hover:bg-[#f1f5f9] text-xs font-semibold text-[#1a1b22] inline-flex items-center gap-1.5 smooth-transition whitespace-nowrap shrink-0"
              >
                <Tag className="h-3.5 w-3.5 text-[#00529C]" />
                <span>
                  {checkedBranchIds.length > 0
                    ? `Tandai ${checkedBranchIds.length} Terpilih`
                    : 'Tandai Halaman Ini'}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsCsvModalOpen(true)}
              className="h-9 px-3.5 rounded-xl bg-white border border-[#cbd5e1] hover:bg-[#f1f5f9] text-xs font-semibold text-[#1a1b22] inline-flex items-center gap-1.5 smooth-transition whitespace-nowrap shrink-0"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-[#00529C]" />
              <span>Import / Eksport CSV</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveView('gbp-connect')}
              className="h-9 px-3.5 rounded-xl bg-[#eff6ff] hover:bg-[#dbeafe] text-xs font-semibold text-[#00529C] inline-flex items-center gap-1.5 smooth-transition whitespace-nowrap shrink-0"
            >
              <Link2 className="h-3.5 w-3.5" />
              <span>{isGbpConnected ? 'Akun GBP Terhubung' : 'Hubungkan GBP'}</span>
            </button>
          </div>
        </div>
      </section>

      {/* 1-Click Marked Batch Repair Action Bar */}
      {markedBranchIds.length > 0 && (
        <section
          aria-label="Aksi Perbaikan Serentak 1-Klik Lokasi Ditandai"
          className="rounded-3xl bg-[#eff6ff] border border-[#bfdbfe] px-5 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-[#00529C] text-white flex items-center justify-center shrink-0">
              <Tag className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-[#1a1b22] tabular-nums">
                {markedBranchIds.length.toLocaleString('id-ID')} Lokasi Ditandai untuk Diubah
              </p>
              <p className="text-xs text-[#444653]">
                Terapkan perbaikan data serentak dan sinkronkan langsung dalam 1 klik.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={isRunningQuickMarkFix}
              onClick={() => handleQuickMarkFix('phone')}
              className="h-9 px-3.5 rounded-xl bg-white border border-[#bfdbfe] hover:bg-[#dbeafe] text-xs font-semibold text-[#00529C] inline-flex items-center gap-1.5 smooth-transition disabled:opacity-50 whitespace-nowrap"
            >
              <Phone className="h-3.5 w-3.5" />
              <span>1-Klik Set Telp 1500017 &amp; Sinkron</span>
            </button>
            <button
              type="button"
              disabled={isRunningQuickMarkFix}
              onClick={() => handleQuickMarkFix('website')}
              className="h-9 px-3.5 rounded-xl bg-white border border-[#bfdbfe] hover:bg-[#dbeafe] text-xs font-semibold text-[#00529C] inline-flex items-center gap-1.5 smooth-transition disabled:opacity-50 whitespace-nowrap"
            >
              <Globe className="h-3.5 w-3.5" />
              <span>1-Klik Set Web bri.co.id &amp; Sinkron</span>
            </button>
            <button
              type="button"
              disabled={isRunningQuickMarkFix}
              onClick={() => setIsBatchMarkModalOpen(true)}
              className="h-9 px-4 rounded-xl bg-[#00529C] hover:bg-[#004080] text-white text-xs font-semibold inline-flex items-center gap-1.5 smooth-transition whitespace-nowrap"
            >
              <Tag className="h-3.5 w-3.5" />
              <span>Edit Massal &amp; Sinkron (1 Klik)</span>
            </button>
            <button
              type="button"
              onClick={clearMarkedBranches}
              className="h-9 px-3 rounded-xl bg-white border border-[#cbd5e1] hover:bg-[#f1f5f9] text-xs font-medium text-[#444653] whitespace-nowrap"
            >
              Hapus Tanda
            </button>
          </div>
        </section>
      )}

      {/* Master-Detail Split Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left: Dense Location Table */}
        <div className="xl:col-span-7 rounded-3xl bg-white border border-[#e2e8f0] shadow-[0_4px_20px_-2px_rgba(15,23,42,0.05)] overflow-hidden">
          {pageRows.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <MapPin className="h-8 w-8 text-[#94a3b8] mx-auto" />
              <div className="space-y-1">
                <p className="font-display text-base font-semibold text-[#1a1b22]">
                  Tidak ada cabang yang sesuai filter
                </p>
                <p className="text-sm text-[#64748b]">
                  Coba ubah kata kunci pencarian atau pilih status dan wilayah lain.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setGlobalSearch('');
                  setRegionFilter('ALL');
                  setTierFilter('ALL');
                  setStatusFilter('ALL');
                  setDirectoryFilterPreset('ALL');
                  setPage(1);
                }}
                className="h-10 px-4 rounded-2xl bg-[#eff6ff] text-[#00529C] text-xs font-semibold hover:bg-[#dbeafe] smooth-transition"
              >
                Atur Ulang Filter
              </button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#f8fafc] border-b border-[#e2e8f0] text-[11px] font-semibold text-[#475569]">
                      <th className="py-3 pl-5 pr-2 w-10">
                        <input
                          type="checkbox"
                          checked={allPageSelected}
                          onChange={handleToggleAllPage}
                          aria-label="Pilih semua cabang pada halaman ini"
                          className="h-4 w-4 rounded border-[#cbd5e1] text-[#00529C] focus:ring-[#2563eb]"
                        />
                      </th>
                      <th className="py-3 px-3">Kode</th>
                      <th className="py-3 px-3">Unit Kerja BRI</th>
                      <th className="py-3 px-3">Jam Layanan</th>
                      <th className="py-3 pr-5 pl-3 text-right">Status GBP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e2e8f0] text-sm">
                    {pageRows.map((b) => {
                      const isSelected = b.id === selectedBranchId;
                      const isChecked = checkedBranchIds.includes(b.id);
                      const isMarked = markedSet.has(b.id);
                      const hasCoordIssue =
                        b.syncStatus === 'action_required' ||
                        b.discrepancies.some((d) => d.field === 'coordinates') ||
                        !isValidIndonesianCoords(b.lat, b.lng);

                      return (
                        <tr
                          key={b.id}
                          onClick={() => setSelectedBranchId(b.id)}
                          className={`h-12 cursor-pointer smooth-transition ${
                            isSelected ? 'bg-[#eff6ff]/70' : 'hover:bg-[#f1f5f9]/70'
                          }`}
                        >
                          <td
                            className="py-2.5 pl-5 pr-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleBranchChecked(b.id)}
                              aria-label={`Pilih ${b.name}`}
                              className="h-4 w-4 rounded border-[#cbd5e1] text-[#00529C] focus:ring-[#2563eb]"
                            />
                          </td>
                          <td className="py-2.5 px-3 font-mono text-xs text-[#444653] tabular-nums whitespace-nowrap">
                            {b.code}
                          </td>
                          <td className="py-2.5 px-3">
                            <p className="font-semibold text-[#1a1b22] truncate max-w-[220px]">
                              {b.name}
                            </p>
                            <p className="text-xs text-[#64748b] truncate max-w-[240px]">
                              {b.tier} · {b.city}
                            </p>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-xs text-[#444653] tabular-nums whitespace-nowrap">
                            {b.operatingHours}
                          </td>
                          <td
                            className="py-2.5 pr-5 pl-3 text-right"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="inline-flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => toggleBranchMarked(b.id)}
                                title={
                                  isMarked
                                    ? 'Hapus dari daftar lokasi ditandai'
                                    : 'Tandai lokasi ini untuk diubah bersamaan'
                                }
                                className={`h-7 px-2.5 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1 whitespace-nowrap smooth-transition ${
                                  isMarked
                                    ? 'bg-[#00529C] border-[#00529C] text-white'
                                    : 'bg-white border-[#cbd5e1] text-[#444653] hover:bg-[#f1f5f9]'
                                }`}
                              >
                                <Tag className="h-3 w-3" />
                                <span>{isMarked ? 'Ditandai' : 'Tandai Ubah'}</span>
                              </button>
                              {hasCoordIssue && (
                                <button
                                  type="button"
                                  onClick={() => handleDirectCheckDistance(b)}
                                  title="Cek jarak perbedaan titik lokasi Master vs Google Maps"
                                  className="h-7 px-2.5 rounded-lg bg-[#fef2f2] border border-[#fecaca] hover:bg-[#fee2e2] text-[11px] font-semibold text-[#dc2626] inline-flex items-center gap-1 whitespace-nowrap"
                                >
                                  <Compass className="h-3 w-3" />
                                  <span>Cek Jarak</span>
                                </button>
                              )}
                              <div onClick={() => setSelectedBranchId(b.id)}>
                                <StatusBadge status={b.syncStatus} compact />
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination Footer */}
              <div className="px-5 py-3.5 bg-[#f8fafc] border-t border-[#e2e8f0] flex items-center justify-between gap-4">
                <p className="text-xs text-[#64748b] tabular-nums">
                  Halaman <span className="font-mono font-semibold text-[#1a1b22]">{safePage}</span> dari{' '}
                  <span className="font-mono font-semibold text-[#1a1b22]">
                    {totalPages.toLocaleString('id-ID')}
                  </span>
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    aria-label="Halaman sebelumnya"
                    className="h-9 px-3 rounded-xl border border-[#cbd5e1] bg-white hover:bg-[#f1f5f9] disabled:opacity-45 text-xs font-medium text-[#1a1b22] inline-flex items-center gap-1 smooth-transition"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    <span>Sebelumnya</span>
                  </button>
                  <button
                    type="button"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    aria-label="Halaman berikutnya"
                    className="h-9 px-3 rounded-xl border border-[#cbd5e1] bg-white hover:bg-[#f1f5f9] disabled:opacity-45 text-xs font-medium text-[#1a1b22] inline-flex items-center gap-1 smooth-transition"
                  >
                    <span>Berikutnya</span>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Right: Real Google Map + Branch Master & Live Google Comparison Inspector */}
        <div className="xl:col-span-5 space-y-6">
          <IndonesiaBranchMap
            branches={filteredBranches}
            selectedBranchId={selectedBranchId}
            onSelectBranch={setSelectedBranchId}
            activeRegionFilter={regionFilter}
            onSelectRegionFilter={(r) => {
              setRegionFilter(r);
              setPage(1);
            }}
            mapsApiKey={mapsApiKey}
            livePlacePoint={
              typeof livePlace?.lat === 'number' && typeof livePlace?.lng === 'number'
                ? { lat: livePlace.lat, lng: livePlace.lng, label: livePlace.displayName }
                : null
            }
          />

          {selectedBranch && (
            <section
              aria-label="Inspektur Master Data & Google Maps"
              className="rounded-3xl bg-white border border-[#e2e8f0] p-6 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.05)] space-y-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1 min-w-0">
                  <p className="text-xs text-[#64748b] font-mono tabular-nums truncate">
                    {selectedBranch.code} · {selectedBranch.tierLabel} · {selectedBranch.regionShort}
                  </p>
                  <h3 className="font-display text-lg font-bold text-[#1a1b22] text-balance">
                    {selectedBranch.name}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[#444653] pt-0.5">
                    <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                      <Star className="h-3.5 w-3.5 text-[#d97706] fill-[#d97706]" />
                      {(livePlace?.rating ?? selectedBranch.rating).toFixed(1)} (
                      {livePlace?.userRatingCount ?? selectedBranch.reviewCount} ulasan)
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>Diperbarui: {selectedBranch.lastSyncedAt}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <StatusBadge status={selectedBranch.syncStatus} />
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    <a
                      href={
                        livePlace?.googleMapsUri ||
                        selectedBranch.googleMapsUri ||
                        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                          isValidIndonesianCoords(selectedBranch.lat, selectedBranch.lng)
                            ? `${selectedBranch.lat},${selectedBranch.lng}`
                            : `BRI ${selectedBranch.name} ${selectedBranch.city}`
                        )}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="h-8 px-3 rounded-xl bg-[#eff6ff] border border-[#bfdbfe] hover:bg-[#dbeafe] text-xs font-semibold text-[#00529C] inline-flex items-center gap-1.5 smooth-transition whitespace-nowrap"
                    >
                      <span>Buka di Google Maps</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    <button
                      type="button"
                      onClick={() => toggleBranchMarked(selectedBranch.id)}
                      className={`h-8 px-3 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 smooth-transition whitespace-nowrap ${
                        markedSet.has(selectedBranch.id)
                          ? 'bg-[#00529C] border-[#00529C] text-white'
                          : 'bg-white border-[#cbd5e1] text-[#1a1b22] hover:bg-[#f1f5f9]'
                      }`}
                    >
                      <Tag className="h-3.5 w-3.5" />
                      <span>
                        {markedSet.has(selectedBranch.id)
                          ? 'Ditandai Ubah'
                          : 'Tandai untuk Diubah'}
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Direct button to measure exact coordinate discrepancy against live Google Maps */}
              {(selectedBranch.syncStatus === 'action_required' ||
                selectedBranch.syncStatus === 'discrepancy' ||
                coordComparisonInfo?.showComparison) && (
                <div className="rounded-2xl bg-[#fef2f2]/70 border border-[#fecaca] p-3.5 flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-[#dc2626]">
                      Verifikasi Jarak Titik Lokasi Master vs Google Maps
                    </p>
                    <p className="text-[11px] text-[#444653]">
                      {coordComparisonInfo?.distanceMeters !== null &&
                      coordComparisonInfo?.distanceMeters !== undefined
                        ? `Jarak selisih terukur saat ini: ${formatDistanceId(coordComparisonInfo.distanceMeters)}`
                        : 'Cek perbandingan langsung posisi Master BRI terhadap pin Google Maps'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDirectCheckDistance(selectedBranch)}
                    className="h-9 px-3.5 rounded-xl bg-[#dc2626] hover:bg-[#b91c1c] text-white text-xs font-semibold inline-flex items-center gap-1.5 smooth-transition whitespace-nowrap shrink-0"
                  >
                    <Compass className="h-3.5 w-3.5" />
                    <span>Cek Jarak Selisih Lokasi</span>
                  </button>
                </div>
              )}

              {/* Profil GBP & Google Maps Eksternal */}
              <div className="rounded-2xl bg-[#f8fafc] border border-[#e2e8f0] p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-[#00529C]" />
                    <span className="text-xs font-semibold text-[#1a1b22]">
                      Profil Google Business &amp; Tautan Peta
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={isLoadingPlace}
                    onClick={() => fetchLiveGooglePlace(selectedBranch, true)}
                    className="h-8 px-3 rounded-xl bg-white border border-[#cbd5e1] hover:bg-[#f1f5f9] text-xs font-semibold text-[#00529C] inline-flex items-center gap-1.5 smooth-transition disabled:opacity-50 whitespace-nowrap"
                  >
                    <RefreshCw className={`h-3 w-3 ${isLoadingPlace ? 'animate-spin' : ''}`} />
                    <span>{isLoadingPlace ? 'Memuat...' : 'Segarkan Profil GBP'}</span>
                  </button>
                </div>

                {isLoadingPlace && !livePlace && (
                  <div className="flex items-center gap-2 text-xs text-[#64748b] py-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[#00529C]" />
                    <span>Menyiapkan profil Google Business untuk {selectedBranch.name}...</span>
                  </div>
                )}

                {!isLoadingPlace && placeError && (
                  <p className="text-xs text-[#dc2626]">{placeError}</p>
                )}

                {livePlace && (
                  <div className="space-y-2.5 text-xs">
                    <div className="space-y-1">
                      <p className="font-semibold text-[#1a1b22]">{livePlace.displayName}</p>
                      <p className="text-[#444653]">{livePlace.formattedAddress}</p>
                      {livePlace.nationalPhoneNumber && (
                        <p className="font-mono text-[#444653] tabular-nums">
                          Telp Google: {livePlace.nationalPhoneNumber}
                        </p>
                      )}
                    </div>

                    {livePlace.weekdayDescriptions && livePlace.weekdayDescriptions.length > 0 && (
                      <div className="rounded-xl bg-white border border-[#e2e8f0] p-2.5 space-y-1">
                        <p className="text-[11px] font-semibold text-[#64748b]">
                          Jadwal Operasional Profil:
                        </p>
                        <p className="font-mono text-[11px] text-[#1a1b22]">
                          {livePlace.weekdayDescriptions.slice(0, 2).join(' · ')}
                        </p>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <a
                        href={
                          livePlace.googleMapsUri ||
                          `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                            isValidIndonesianCoords(selectedBranch.lat, selectedBranch.lng)
                              ? `${selectedBranch.lat},${selectedBranch.lng}`
                              : `BRI ${selectedBranch.name} ${selectedBranch.city}`
                          )}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-semibold text-[#00529C] hover:underline"
                      >
                        <span>Buka di Google Maps</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>

                      {livePlace.reviews.length > 0 && (
                        <button
                          type="button"
                          disabled={isImportingReviews}
                          onClick={handleImportBranchReviews}
                          className="h-8 px-3 rounded-xl bg-[#eff6ff] hover:bg-[#dbeafe] text-xs font-semibold text-[#00529C] inline-flex items-center gap-1.5 smooth-transition whitespace-nowrap disabled:opacity-50"
                        >
                          <MessageSquarePlus className="h-3.5 w-3.5" />
                          <span>
                            {isImportingReviews
                              ? 'Menyinkronkan...'
                              : `Tarik ${livePlace.reviews.length} Ulasan Riil`}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Coordinate Comparison Map & Distance Mismatch when discrepancy exists */}
              {coordComparisonInfo?.showComparison && (
                <div className="space-y-2">
                  <CoordinateComparisonMap
                    branch={selectedBranch}
                    liveLat={coordComparisonInfo.refLat}
                    liveLng={coordComparisonInfo.refLng}
                    liveLabel={livePlace?.displayName}
                    mapsApiKey={mapsApiKey}
                    heightClass="h-[220px]"
                  />
                  {coordComparisonInfo.refValid &&
                    typeof coordComparisonInfo.refLat === 'number' &&
                    typeof coordComparisonInfo.refLng === 'number' && (
                      <div className="flex items-center justify-between gap-2 px-1 text-[11px] text-[#444653]">
                        <span>
                          {coordComparisonInfo.distanceMeters !== null
                            ? `Selisih jarak: ${formatDistanceId(coordComparisonInfo.distanceMeters)}`
                            : 'Titik lokasi Google Maps tersedia'}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setEditLat(coordComparisonInfo.refLat!.toFixed(6));
                            setEditLng(coordComparisonInfo.refLng!.toFixed(6));
                          }}
                          className="font-semibold text-[#00529C] hover:underline"
                        >
                          Salin Koordinat Maps ke Editor
                        </button>
                      </div>
                    )}
                </div>
              )}

              {/* Discrepancy Comparison if present (including live Google Maps differences e.g. KC Gunung Sitoli vs BRI KACAB NIAS) */}
              {selectedBranch.discrepancies.length > 0 && (
                <div className="rounded-2xl bg-[#fffbeb]/70 border border-[#fde68a] p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-[#92400e]">
                      Perbedaan Terdeteksi (Master BRI → Perbaiki Google Maps)
                    </p>
                    <span className="text-[11px] text-[#92400e]">
                      Master BRI adalah acuan utama
                    </span>
                  </div>
                  <div className="space-y-2.5">
                    {selectedBranch.discrepancies.map((disc, idx) => (
                      <div
                        key={`${disc.field}-${idx}`}
                        className="rounded-xl bg-white/90 border border-[#fde68a]/80 p-3 space-y-1.5 text-xs"
                      >
                        <p className="font-semibold text-[#1a1b22]">{disc.fieldLabel}</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <span className="text-[11px] text-[#64748b] block">
                              Master BRI (Sumber Utama)
                            </span>
                            <span className="font-mono text-[#059669] font-medium break-all">
                              {disc.masterValue}
                            </span>
                          </div>
                          <div>
                            <span className="text-[11px] text-[#64748b] block">
                              Profil Google (Akan Disesuaikan)
                            </span>
                            <span className="font-mono text-[#dc2626] font-medium break-all">
                              {disc.gbpValue}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Pending Review Notice */}
              {selectedBranch.syncStatus === 'pending_review' && (
                <div className="rounded-2xl bg-[#eff6ff] border border-[#bfdbfe] p-4 flex items-center justify-between gap-3 text-xs">
                  <div className="space-y-0.5">
                    <p className="font-semibold text-[#00529C]">
                      Menunggu Review Google Maps
                    </p>
                    <p className="text-[#444653]">
                      Perubahan Master Data BRI dipantau otomatis terhadap Google Maps.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveView('sync-queue')}
                    className="h-8 px-3 rounded-xl bg-white border border-[#bfdbfe] text-[#00529C] font-semibold hover:bg-[#dbeafe] smooth-transition whitespace-nowrap shrink-0"
                  >
                    Lihat Antrean
                  </button>
                </div>
              )}

              {/* Direct GBP Live Push if linked */}
              {selectedBranch.gbpLocationName && (
                <div className="rounded-2xl bg-[#ecfdf5]/70 border border-[#a7f3d0] p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="space-y-0.5">
                    <p className="font-semibold text-[#059669]">
                      Tertaut ke Google Business Profile API
                    </p>
                    <p className="font-mono text-[11px] text-[#444653] truncate max-w-[260px]">
                      {selectedBranch.gbpLocationName}
                    </p>
                  </div>
                  {isGbpConnected ? (
                    <button
                      type="button"
                      onClick={() => setShowGbpPushConfirm(true)}
                      className="h-9 px-3.5 rounded-xl bg-[#059669] hover:bg-[#047857] text-white font-semibold inline-flex items-center gap-1.5 smooth-transition whitespace-nowrap shrink-0"
                    >
                      <Send className="h-3.5 w-3.5" />
                      <span>Dorong Langsung ke GBP API</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setActiveView('gbp-connect')}
                      className="h-9 px-3.5 rounded-xl bg-white border border-[#a7f3d0] text-[#059669] font-semibold hover:bg-[#ecfdf5] smooth-transition whitespace-nowrap shrink-0"
                    >
                      Login GBP untuk Dorong Live
                    </button>
                  )}
                </div>
              )}

              {/* Direct Master Data Editor */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setShowMasterSyncConfirm(true);
                }}
                className="space-y-3.5"
              >
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[#444653] inline-flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 text-[#64748b]" />
                    Nama Resmi Unit Kerja (Master BRI)
                  </span>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full h-11 px-3.5 rounded-2xl bg-[#f8fafc] border border-[#cbd5e1] text-xs font-medium text-[#1a1b22] focus:outline-none focus:bg-white focus:border-[#00529C] focus:ring-4 focus:ring-[#00529C]/15 smooth-transition"
                  />
                </label>

                <WeeklyHoursChecklist
                  value={editWeeklyHours}
                  onChange={setEditWeeklyHours}
                  compact
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-[#444653] inline-flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-[#64748b]" />
                      Telepon Layanan
                    </span>
                    <input
                      type="text"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      className="w-full h-11 px-3.5 rounded-2xl bg-[#f8fafc] border border-[#cbd5e1] font-mono text-xs text-[#1a1b22] focus:outline-none focus:bg-white focus:border-[#00529C] focus:ring-4 focus:ring-[#00529C]/15 smooth-transition"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-[#444653] inline-flex items-center gap-1.5">
                      <Globe className="h-3.5 w-3.5 text-[#64748b]" />
                      Website Resmi
                    </span>
                    <input
                      type="text"
                      value={editWebsite}
                      onChange={(e) => setEditWebsite(e.target.value)}
                      placeholder="https://bri.co.id"
                      className="w-full h-11 px-3.5 rounded-2xl bg-[#f8fafc] border border-[#cbd5e1] font-mono text-xs text-[#1a1b22] focus:outline-none focus:bg-white focus:border-[#00529C] focus:ring-4 focus:ring-[#00529C]/15 smooth-transition"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-[#444653]">Latitude (Master)</span>
                    <input
                      type="text"
                      value={editLat}
                      onChange={(e) => setEditLat(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl bg-[#f8fafc] border border-[#cbd5e1] font-mono text-xs text-[#1a1b22] focus:outline-none focus:bg-white focus:border-[#00529C]"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-[#444653]">Longitude (Master)</span>
                    <input
                      type="text"
                      value={editLng}
                      onChange={(e) => setEditLng(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl bg-[#f8fafc] border border-[#cbd5e1] font-mono text-xs text-[#1a1b22] focus:outline-none focus:bg-white focus:border-[#00529C]"
                    />
                  </label>
                </div>

                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[#444653]">
                    Alamat Resmi Unit Kerja
                  </span>
                  <textarea
                    rows={2}
                    value={editAddress}
                    onChange={(e) => setEditAddress(e.target.value)}
                    className="w-full p-3.5 rounded-2xl bg-[#f8fafc] border border-[#cbd5e1] text-xs text-[#1a1b22] focus:outline-none focus:bg-white focus:border-[#00529C] focus:ring-4 focus:ring-[#00529C]/15 smooth-transition resize-none"
                  />
                </label>

                <div className="flex flex-wrap items-center justify-end gap-3 pt-1">
                  <button
                    type="submit"
                    disabled={selectedBranch.syncStatus === 'processing'}
                    className="h-11 px-5 rounded-2xl bg-[#00529C] hover:bg-[#004080] active:bg-[#003366] text-white text-sm font-semibold inline-flex items-center gap-2 smooth-transition whitespace-nowrap shrink-0 disabled:opacity-60"
                  >
                    <RefreshCw
                      className={`h-4 w-4 ${
                        selectedBranch.syncStatus === 'processing' ? 'animate-spin' : ''
                      }`}
                    />
                    <span>
                      {selectedBranch.syncStatus === 'processing'
                        ? 'Menyinkronkan...'
                        : 'Konfirmasi & Sinkronkan ke Google Maps'}
                    </span>
                  </button>
                </div>
              </form>
            </section>
          )}
        </div>
      </div>

      {/* Direct Check Distance Modal */}
      {showDistanceModal && selectedBranch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            onClick={() => setShowDistanceModal(false)}
            className="fixed inset-0 bg-[#0f172a]/35 backdrop-blur-xs"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Cek Jarak Selisih Titik Lokasi"
            className="relative z-10 w-full max-w-2xl rounded-3xl bg-white border border-[#e2e8f0] shadow-[0_25px_40px_-8px_rgba(15,23,42,0.14)] overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-[#e2e8f0] flex items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-base font-bold text-[#1a1b22]">
                  Cek Jarak Selisih Titik Lokasi (Master BRI vs Google Maps)
                </h3>
                <p className="font-mono text-xs text-[#64748b]">
                  {selectedBranch.code} · {selectedBranch.name} ({selectedBranch.city})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDistanceModal(false)}
                className="h-9 w-9 rounded-xl text-[#64748b] hover:bg-[#f1f5f9] flex items-center justify-center"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                {isLoadingPlace ? (
                  <div className="flex items-center gap-2 text-xs text-[#00529C]">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Mengambil koordinat asli Google Maps...</span>
                  </div>
                ) : (
                  <p className="text-xs text-[#444653]">
                    {livePlace?.displayName
                      ? `Titik Google Maps terdeteksi: ${livePlace.displayName}`
                      : 'Membandingkan koordinat Master BRI dengan titik pembanding Google Maps'}
                  </p>
                )}

                <button
                  type="button"
                  disabled={isLoadingPlace}
                  onClick={() => fetchLiveGooglePlace(selectedBranch, true)}
                  className="h-8 px-3 rounded-xl bg-white border border-[#cbd5e1] hover:bg-[#f1f5f9] text-xs font-semibold text-[#00529C] inline-flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
                >
                  <RefreshCw className={`h-3 w-3 ${isLoadingPlace ? 'animate-spin' : ''}`} />
                  <span>Ukur Ulang Live Maps</span>
                </button>
              </div>

              <CoordinateComparisonMap
                branch={selectedBranch}
                liveLat={coordComparisonInfo?.refLat}
                liveLng={coordComparisonInfo?.refLng}
                liveLabel={livePlace?.displayName}
                mapsApiKey={mapsApiKey}
                heightClass="h-[300px]"
              />

              <div className="flex flex-wrap items-center justify-end gap-2.5">
                {coordComparisonInfo?.refValid &&
                  typeof coordComparisonInfo.refLat === 'number' &&
                  typeof coordComparisonInfo.refLng === 'number' && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditLat(coordComparisonInfo.refLat!.toFixed(6));
                        setEditLng(coordComparisonInfo.refLng!.toFixed(6));
                        setShowDistanceModal(false);
                      }}
                      className="h-10 px-4 rounded-2xl bg-[#eff6ff] hover:bg-[#dbeafe] text-xs font-semibold text-[#00529C]"
                    >
                      Salin Koordinat Maps ke Editor Master
                    </button>
                  )}
                <button
                  type="button"
                  onClick={() => setShowDistanceModal(false)}
                  className="h-10 px-4 rounded-2xl bg-white border border-[#cbd5e1] text-xs font-medium text-[#1a1b22]"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Master Sync to Google Maps */}
      {showMasterSyncConfirm && selectedBranch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            onClick={() => setShowMasterSyncConfirm(false)}
            className="fixed inset-0 bg-[#0f172a]/35 backdrop-blur-xs"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Konfirmasi Sinkronisasi ke Google Maps"
            className="relative z-10 w-full max-w-lg rounded-3xl bg-white border border-[#e2e8f0] shadow-[0_25px_40px_-8px_rgba(15,23,42,0.14)] overflow-hidden"
          >
            <div className="px-6 py-5 border-b border-[#e2e8f0] space-y-1">
              <h3 className="font-display text-base font-bold text-[#1a1b22]">
                Konfirmasi &amp; Sinkronkan ke Google Maps
              </h3>
              <p className="text-xs text-[#64748b]">
                Pembaruan Master Data BRI untuk <span className="font-semibold text-[#1a1b22]">{editName}</span> akan disimpan dan dikirim ke antrean verifikasi otomatis Google Maps.
              </p>
            </div>
            <div className="p-6 space-y-2.5 text-xs">
              <div className="rounded-2xl bg-[#f8fafc] border border-[#e2e8f0] p-4 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[#64748b] block">Telepon Layanan</span>
                    <span className="font-mono text-[#1a1b22]">{editPhone || '-'}</span>
                  </div>
                  <div>
                    <span className="text-[#64748b] block">Website Resmi</span>
                    <span className="font-mono text-[#1a1b22] break-all">{editWebsite || '-'}</span>
                  </div>
                </div>
                <div>
                  <span className="text-[#64748b] block">Jadwal Sen / Sab / Min</span>
                  <span className="font-mono text-[#1a1b22]">
                    Sen: {editWeeklyHours.mon.open ? editWeeklyHours.mon.hours : 'Tutup'} · Sab:{' '}
                    {editWeeklyHours.sat.open ? editWeeklyHours.sat.hours : 'Tutup'} · Min:{' '}
                    {editWeeklyHours.sun.open ? editWeeklyHours.sun.hours : 'Tutup'}
                  </span>
                </div>
                <div>
                  <span className="text-[#64748b] block">Koordinat &amp; Alamat</span>
                  <span className="font-mono text-[#1a1b22] block">
                    {editLat}, {editLng}
                  </span>
                  <span className="text-[#444653]">{editAddress}</span>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 bg-[#f8fafc] border-t border-[#e2e8f0] flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowMasterSyncConfirm(false)}
                className="h-10 px-4 rounded-2xl bg-white border border-[#cbd5e1] text-xs font-medium text-[#1a1b22]"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmMasterSync}
                className="h-10 px-5 rounded-2xl bg-[#00529C] hover:bg-[#004080] text-white text-xs font-semibold inline-flex items-center gap-2 whitespace-nowrap"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Konfirmasi &amp; Sinkronkan ke Google Maps</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Explicit Confirmation Modal for Direct GBP API Push */}
      {showGbpPushConfirm && selectedBranch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            onClick={() => !isPushingLive && setShowGbpPushConfirm(false)}
            className="fixed inset-0 bg-[#0f172a]/35 backdrop-blur-xs"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Konfirmasi Kirim Langsung ke Google Business Profile"
            className="relative z-10 w-full max-w-lg rounded-3xl bg-white border border-[#e2e8f0] shadow-[0_25px_40px_-8px_rgba(15,23,42,0.14)] overflow-hidden"
          >
            <div className="px-6 py-5 border-b border-[#e2e8f0] space-y-1">
              <h3 className="font-display text-base font-bold text-[#1a1b22]">
                Konfirmasi Pembaruan Langsung GBP API
              </h3>
              <p className="text-xs text-[#64748b]">
                Data Master BRI berikut akan langsung dikirim untuk memperbarui listing Google
                Business Profile unit kerja ini:
              </p>
            </div>
            <div className="p-6 space-y-2.5 text-xs">
              <div className="rounded-2xl bg-[#f8fafc] border border-[#e2e8f0] p-4 space-y-2">
                <div>
                  <span className="text-[#64748b] block">Nama Unit Kerja</span>
                  <span className="font-semibold text-[#1a1b22]">{selectedBranch.name}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[#64748b] block">Jam Operasional</span>
                    <span className="font-mono text-[#1a1b22]">{selectedBranch.operatingHours}</span>
                  </div>
                  <div>
                    <span className="text-[#64748b] block">Telepon</span>
                    <span className="font-mono text-[#1a1b22]">{selectedBranch.phone}</span>
                  </div>
                </div>
                <div>
                  <span className="text-[#64748b] block">Alamat Resmi</span>
                  <span className="text-[#1a1b22]">{selectedBranch.address}</span>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 bg-[#f8fafc] border-t border-[#e2e8f0] flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={isPushingLive}
                onClick={() => setShowGbpPushConfirm(false)}
                className="h-10 px-4 rounded-2xl bg-white border border-[#cbd5e1] text-xs font-medium text-[#1a1b22]"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isPushingLive}
                onClick={handleDirectGbpPush}
                className="h-10 px-5 rounded-2xl bg-[#059669] hover:bg-[#047857] text-white text-xs font-semibold inline-flex items-center gap-2 disabled:opacity-60"
              >
                {isPushingLive ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Mengirim ke GBP...</span>
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5" />
                    <span>Konfirmasi Dorong ke GBP</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <BulkImportExportModal
        isOpen={isCsvModalOpen}
        onClose={() => setIsCsvModalOpen(false)}
        initialTab="export"
        filterContext={{
          region: regionFilter,
          tier: tierFilter,
          status: statusFilter,
          search: globalSearch,
          filteredCount: filteredBranches.length,
        }}
      />

      <BatchMarkEditModal
        isOpen={isBatchMarkModalOpen}
        onClose={() => setIsBatchMarkModalOpen(false)}
      />
    </div>
  );
}
