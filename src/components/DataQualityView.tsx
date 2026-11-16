import { useDeferredValue, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Compass,
  ExternalLink,
  FileSpreadsheet,
  Globe,
  Loader2,
  Phone,
  RefreshCw,
  Search,
  Sparkles,
  Tag,
  Wrench,
  X,
} from 'lucide-react';
import { useOps, type QualityFixPayload } from '../context/OpsContext';
import type {
  BranchLocation,
  DataQualityIssueCategory,
  WeeklyHoursSchedule,
} from '../types/ops';
import { BatchMarkEditModal } from './BatchMarkEditModal';
import { BulkImportExportModal } from './BulkImportExportModal';
import {
  CoordinateComparisonMap,
  calculateDistanceMeters,
  isValidIndonesianCoords,
} from './CoordinateComparisonMap';
import { ensureWeeklyHours, WeeklyHoursChecklist } from './WeeklyHoursChecklist';

const PAGE_SIZE = 20;

const CATEGORY_TABS: Array<{ id: 'ALL' | DataQualityIssueCategory; label: string }> = [
  { id: 'ALL', label: 'Semua Temuan' },
  { id: 'gbp_mismatch', label: 'Selisih Google Maps' },
  { id: 'missing_hours', label: 'Jam Operasional' },
  { id: 'invalid_phone', label: 'Nomor Telepon' },
  { id: 'invalid_website', label: 'Website' },
  { id: 'incomplete_address', label: 'Alamat & Kode Pos' },
  { id: 'invalid_coordinates', label: 'Koordinat' },
];

export function DataQualityView() {
  const {
    branches,
    qualityAudit,
    applyQualityFixes,
    markedBranchIds,
    toggleBranchMarked,
    markManyBranches,
    clearMarkedBranches,
    executeBatchMarkFix,
    setSelectedBranchId,
    setActiveView,
    mapsApiKey,
    livePlacesCache,
    loadingPlaceIds,
    fetchLiveGooglePlace,
  } = useOps();

  const [categoryFilter, setCategoryFilter] = useState<'ALL' | DataQualityIssueCategory>('ALL');
  const [onlyMarkedFilter, setOnlyMarkedFilter] = useState(false);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [isBatchMarkModalOpen, setIsBatchMarkModalOpen] = useState(false);
  const [isQuickBatchRunning, setIsQuickBatchRunning] = useState(false);

  // Coordinate discrepancy modal state
  const [mapCompareBranch, setMapCompareBranch] = useState<BranchLocation | null>(null);

  // Batch confirmation state
  const [batchConfirmFixes, setBatchConfirmFixes] = useState<QualityFixPayload[] | null>(null);
  const [batchSubmitToGoogle, setBatchSubmitToGoogle] = useState(true);
  const [isApplyingBatch, setIsApplyingBatch] = useState(false);

  // Single-row repair modal state
  const [editingBranch, setEditingBranch] = useState<BranchLocation | null>(null);
  const [fixWeeklyHours, setFixWeeklyHours] = useState<WeeklyHoursSchedule>(() =>
    ensureWeeklyHours(null)
  );
  const [fixPhone, setFixPhone] = useState('');
  const [fixWebsite, setFixWebsite] = useState('');
  const [fixAddress, setFixAddress] = useState('');
  const [fixPostal, setFixPostal] = useState('');
  const [fixCity, setFixCity] = useState('');
  const [fixLat, setFixLat] = useState('');
  const [fixLng, setFixLng] = useState('');
  const [singleSubmitToGoogle, setSingleSubmitToGoogle] = useState(true);
  const [isSavingSingle, setIsSavingSingle] = useState(false);

  const markedSet = useMemo(() => new Set(markedBranchIds), [markedBranchIds]);

  const filteredItems = useMemo(() => {
    return qualityAudit.items.filter((item) => {
      if (onlyMarkedFilter && !markedSet.has(item.branchId)) {
        return false;
      }
      if (categoryFilter !== 'ALL' && !item.issues.some((iss) => iss.category === categoryFilter)) {
        return false;
      }
      if (deferredSearch) {
        const hay = `${item.branchCode} ${item.branchName} ${item.city} ${item.regionShort}`.toLowerCase();
        if (!hay.includes(deferredSearch)) return false;
      }
      return true;
    });
  }, [qualityAudit.items, categoryFilter, onlyMarkedFilter, markedSet, deferredSearch]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredItems.slice(start, start + PAGE_SIZE);
  }, [filteredItems, safePage]);

  const branchMap = useMemo(() => {
    const map = new Map<string, BranchLocation>();
    for (const b of branches) map.set(b.id, b);
    return map;
  }, [branches]);

  const openSingleEditor = (branchId: string) => {
    const b = branchMap.get(branchId);
    if (!b) return;
    setEditingBranch(b);
    setFixWeeklyHours(ensureWeeklyHours(b));
    setFixPhone(b.phone && b.phone !== '-' ? b.phone : '1500017');
    setFixWebsite(
      b.website && /^https:\/\/(www\.)?bri\.co\.id/i.test(b.website.trim())
        ? b.website
        : 'https://bri.co.id'
    );
    setFixAddress(b.address);
    setFixPostal(b.postalCode);
    setFixCity(b.city);
    setFixLat(String(b.lat));
    setFixLng(String(b.lng));
    setSingleSubmitToGoogle(true);
    if (!(b.id in livePlacesCache)) {
      fetchLiveGooglePlace(b);
    }
  };

  const openMapCompareModal = (branchId: string, forceLiveCheck = true) => {
    const b = branchMap.get(branchId);
    if (!b) return;
    setMapCompareBranch(b);
    if (forceLiveCheck || !(b.id in livePlacesCache)) {
      fetchLiveGooglePlace(b, forceLiveCheck);
    }
  };

  const handleSaveSingleFix = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBranch) return;
    setIsSavingSingle(true);
    const parsedLat = Number.parseFloat(fixLat.replace(',', '.'));
    const parsedLng = Number.parseFloat(fixLng.replace(',', '.'));
    try {
      await applyQualityFixes(
        [
          {
            branchId: editingBranch.id,
            weeklyHours: fixWeeklyHours,
            operatingHours: fixWeeklyHours.mon.open ? fixWeeklyHours.mon.hours : 'Tutup',
            saturdayHours: fixWeeklyHours.sat.open ? fixWeeklyHours.sat.hours : 'Tutup',
            sundayHours: fixWeeklyHours.sun.open ? fixWeeklyHours.sun.hours : '',
            phone: fixPhone,
            website: fixWebsite,
            address: fixAddress,
            postalCode: fixPostal,
            city: fixCity,
            lat: Number.isFinite(parsedLat) ? parsedLat : editingBranch.lat,
            lng: Number.isFinite(parsedLng) ? parsedLng : editingBranch.lng,
          },
        ],
        singleSubmitToGoogle
      );
      setEditingBranch(null);
    } finally {
      setIsSavingSingle(false);
    }
  };

  const prepareBatchStandardize = () => {
    const targetIds =
      selectedIds.length > 0
        ? selectedIds
        : filteredItems.slice(0, 25).map((item) => item.branchId);

    const fixes: QualityFixPayload[] = [];
    for (const id of targetIds) {
      const b = branchMap.get(id);
      if (!b) continue;
      const hoursValid =
        /(\d{1,2})[:.](\d{2})(?:\s*(?:WIB|WITA|WIT))?\s*(?:-|–|—|s\.?\s*d\.?|s\/d|sd)\s*(\d{1,2})[:.](\d{2})/i.test(
          b.operatingHours.trim()
        );
      const cleanPhone = (b.phone || '').replace(/[^\d]/g, '');
      const phoneInvalid = !cleanPhone || cleanPhone !== '1500017';
      const webMatchesBri = /^https:\/\/(www\.)?bri\.co\.id(\/.*)?$/i.test(
        (b.website || '').trim()
      );

      fixes.push({
        branchId: b.id,
        operatingHours: hoursValid ? b.operatingHours : '08:00 - 15:00 WIB',
        phone: phoneInvalid ? '1500017' : b.phone,
        website: !webMatchesBri ? 'https://bri.co.id' : b.website,
        postalCode: b.postalCode || '10210',
      });
    }
    setBatchConfirmFixes(fixes);
  };

  const handleConfirmBatchFixes = async () => {
    if (!batchConfirmFixes || batchConfirmFixes.length === 0) return;
    setIsApplyingBatch(true);
    try {
      await applyQualityFixes(batchConfirmFixes, batchSubmitToGoogle);
      setSelectedIds([]);
      setBatchConfirmFixes(null);
    } finally {
      setIsApplyingBatch(false);
    }
  };

  const handleQuickMarkAction = async (mode: 'phone' | 'website') => {
    if (markedBranchIds.length === 0) return;
    setIsQuickBatchRunning(true);
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
      setIsQuickBatchRunning(false);
    }
  };

  const handleMarkInvalidPhones = () => {
    const phoneIssueIds = filteredItems
      .filter((item) => item.issues.some((iss) => iss.category === 'invalid_phone'))
      .slice(0, 50)
      .map((item) => item.branchId);
    if (phoneIssueIds.length > 0) {
      markManyBranches(phoneIssueIds);
    } else if (pageRows.length > 0) {
      markManyBranches(pageRows.map((r) => r.branchId));
    }
  };

  const editingLivePlace = editingBranch ? livePlacesCache[editingBranch.id] : undefined;
  const editingCoordInvalidOrMismatch = useMemo(() => {
    if (!editingBranch) return false;
    if (!isValidIndonesianCoords(editingBranch.lat, editingBranch.lng)) return true;
    if (editingBranch.discrepancies.some((d) => d.field === 'coordinates')) return true;
    const refLat = editingLivePlace?.lat ?? editingBranch.gbpLat;
    const refLng = editingLivePlace?.lng ?? editingBranch.gbpLng;
    if (
      typeof refLat === 'number' &&
      typeof refLng === 'number' &&
      isValidIndonesianCoords(refLat, refLng)
    ) {
      return calculateDistanceMeters(editingBranch.lat, editingBranch.lng, refLat, refLng) > 15;
    }
    return false;
  }, [editingBranch, editingLivePlace]);

  const compareModalBranchLive = mapCompareBranch
    ? branchMap.get(mapCompareBranch.id) ?? mapCompareBranch
    : null;
  const compareModalLivePlace = compareModalBranchLive
    ? livePlacesCache[compareModalBranchLive.id]
    : undefined;
  const isCompareModalLoading = compareModalBranchLive
    ? Boolean(loadingPlaceIds[compareModalBranchLive.id])
    : false;

  return (
    <div className="space-y-6">
      {/* Audit Metrics Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <div className="rounded-3xl bg-white border border-[#e2e8f0] p-5 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.05)]">
          <p className="text-xs font-medium text-[#64748b]">Total Terindikasi</p>
          <p className="font-mono text-2xl font-bold text-[#1a1b22] tabular-nums mt-1">
            {qualityAudit.counts.totalFlagged.toLocaleString('id-ID')}
          </p>
          <p className="text-[11px] text-[#444653] mt-1">
            Dari {branches.length.toLocaleString('id-ID')} unit BRI
          </p>
        </div>

        <div className="rounded-3xl bg-white border border-[#e2e8f0] p-5 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.05)]">
          <p className="text-xs font-medium text-[#64748b]">Selisih Google Maps</p>
          <p className="font-mono text-2xl font-bold text-[#d97706] tabular-nums mt-1">
            {qualityAudit.counts.gbpMismatch.toLocaleString('id-ID')}
          </p>
          <p className="text-[11px] text-[#444653] mt-1">Listing Maps ≠ Master</p>
        </div>

        <div className="rounded-3xl bg-white border border-[#e2e8f0] p-5 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.05)]">
          <p className="text-xs font-medium text-[#64748b]">Jam Operasional</p>
          <p className="font-mono text-2xl font-bold text-[#00529C] tabular-nums mt-1">
            {qualityAudit.counts.missingHours.toLocaleString('id-ID')}
          </p>
          <p className="text-[11px] text-[#444653] mt-1">Format/jadwal belum standar</p>
        </div>

        <div className="rounded-3xl bg-white border border-[#e2e8f0] p-5 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.05)]">
          <p className="text-xs font-medium text-[#64748b]">Nomor Telepon</p>
          <p className="font-mono text-2xl font-bold text-[#dc2626] tabular-nums mt-1">
            {qualityAudit.counts.invalidPhone.toLocaleString('id-ID')}
          </p>
          <p className="text-[11px] text-[#444653] mt-1">Bukan 1500017 / selisih Maps</p>
        </div>

        <div className="rounded-3xl bg-white border border-[#e2e8f0] p-5 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.05)]">
          <p className="text-xs font-medium text-[#64748b]">Website Resmi</p>
          <p className="font-mono text-2xl font-bold text-[#00529C] tabular-nums mt-1">
            {qualityAudit.counts.invalidWebsite.toLocaleString('id-ID')}
          </p>
          <p className="text-[11px] text-[#444653] mt-1">Kosong / bukan bri.co.id</p>
        </div>

        <div className="rounded-3xl bg-white border border-[#e2e8f0] p-5 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.05)]">
          <p className="text-xs font-medium text-[#64748b]">Koordinat &amp; Alamat</p>
          <p className="font-mono text-2xl font-bold text-[#dc2626] tabular-nums mt-1">
            {qualityAudit.counts.invalidCoordinates.toLocaleString('id-ID')}
          </p>
          <p className="text-[11px] text-[#444653] mt-1">
            Titik geser · {qualityAudit.counts.incompleteAddress.toLocaleString('id-ID')} alamat
          </p>
        </div>
      </section>

      {/* Filters & Batch Repair Toolbar */}
      <section className="rounded-3xl bg-white border border-[#e2e8f0] p-5 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.05)] space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="h-4 w-4 text-[#64748b] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Cari kode cabang, nama unit, atau kota..."
              className="w-full h-11 pl-11 pr-4 rounded-2xl bg-[#f8fafc] border border-[#cbd5e1] text-sm text-[#1a1b22] placeholder:text-[#94a3b8] focus:outline-none focus:bg-white focus:border-[#00529C] focus:ring-4 focus:ring-[#00529C]/15"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {pageRows.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  markManyBranches(
                    selectedIds.length > 0
                      ? selectedIds
                      : pageRows.map((r) => r.branchId)
                  )
                }
                className="h-11 px-3.5 rounded-2xl bg-white border border-[#cbd5e1] hover:bg-[#f1f5f9] text-xs font-semibold text-[#1a1b22] inline-flex items-center gap-1.5 smooth-transition whitespace-nowrap shrink-0"
              >
                <Tag className="h-3.5 w-3.5 text-[#00529C]" />
                <span>
                  {selectedIds.length > 0
                    ? `Tandai ${selectedIds.length} Terpilih`
                    : 'Tandai Halaman Ini'}
                </span>
              </button>
            )}

            {qualityAudit.counts.invalidPhone > 0 && (
              <button
                type="button"
                onClick={handleMarkInvalidPhones}
                className="h-11 px-3.5 rounded-2xl bg-white border border-[#cbd5e1] hover:bg-[#f1f5f9] text-xs font-semibold text-[#1a1b22] inline-flex items-center gap-1.5 smooth-transition whitespace-nowrap shrink-0"
              >
                <Phone className="h-3.5 w-3.5 text-[#dc2626]" />
                <span>Tandai Telp Salah</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsCsvModalOpen(true)}
              className="h-11 px-4 rounded-2xl bg-white border border-[#cbd5e1] hover:bg-[#f1f5f9] text-xs font-semibold text-[#1a1b22] inline-flex items-center gap-2 smooth-transition whitespace-nowrap shrink-0"
            >
              <FileSpreadsheet className="h-4 w-4 text-[#00529C]" />
              <span>Import / Eksport CSV</span>
            </button>

            {filteredItems.length > 0 && (
              <button
                type="button"
                onClick={prepareBatchStandardize}
                className="h-11 px-5 rounded-2xl bg-[#00529C] hover:bg-[#004080] text-white text-xs font-semibold inline-flex items-center gap-2 smooth-transition whitespace-nowrap shrink-0"
              >
                <Sparkles className="h-4 w-4" />
                <span>
                  {selectedIds.length > 0
                    ? `Perbaiki ${selectedIds.length} Terpilih`
                    : `Standardisasi Otomatis (${Math.min(25, filteredItems.length)})`}
                </span>
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-2xl bg-[#f1f5f9] w-fit">
            {CATEGORY_TABS.map((tab) => {
              const active = categoryFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setCategoryFilter(tab.id);
                    setPage(1);
                  }}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-medium smooth-transition whitespace-nowrap ${
                    active
                      ? 'bg-white text-[#1a1b22] shadow-xs'
                      : 'text-[#444653] hover:text-[#1a1b22]'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => {
              setOnlyMarkedFilter((prev) => !prev);
              setPage(1);
            }}
            className={`h-9 px-3.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 smooth-transition whitespace-nowrap ${
              onlyMarkedFilter
                ? 'bg-[#00529C] border-[#00529C] text-white'
                : 'bg-white border-[#cbd5e1] text-[#444653] hover:bg-[#f1f5f9]'
            }`}
          >
            <Tag className="h-3.5 w-3.5" />
            <span>Hanya Ditandai ({markedBranchIds.length})</span>
          </button>
        </div>
      </section>

      {/* 1-Click Marked Batch Action Bar */}
      {markedBranchIds.length > 0 && (
        <section
          aria-label="Aksi Perbaikan Serentak Lokasi Ditandai"
          className="rounded-3xl bg-[#eff6ff] border border-[#bfdbfe] px-5 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-[#00529C] text-white flex items-center justify-center shrink-0">
              <Tag className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-[#1a1b22] tabular-nums">
                {markedBranchIds.length.toLocaleString('id-ID')} Lokasi Ditandai untuk Diperbaiki
                Bersamaan
              </p>
              <p className="text-xs text-[#444653]">
                Perbaiki nomor telepon, website, atau jadwal operasional serentak dalam 1 klik.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={isQuickBatchRunning}
              onClick={() => handleQuickMarkAction('phone')}
              className="h-9 px-3.5 rounded-xl bg-white border border-[#bfdbfe] hover:bg-[#dbeafe] text-xs font-semibold text-[#00529C] inline-flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
            >
              <Phone className="h-3.5 w-3.5" />
              <span>1-Klik Set Telp 1500017 &amp; Sinkron</span>
            </button>
            <button
              type="button"
              disabled={isQuickBatchRunning}
              onClick={() => handleQuickMarkAction('website')}
              className="h-9 px-3.5 rounded-xl bg-white border border-[#bfdbfe] hover:bg-[#dbeafe] text-xs font-semibold text-[#00529C] inline-flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
            >
              <Globe className="h-3.5 w-3.5" />
              <span>1-Klik Set Web bri.co.id &amp; Sinkron</span>
            </button>
            <button
              type="button"
              disabled={isQuickBatchRunning}
              onClick={() => setIsBatchMarkModalOpen(true)}
              className="h-9 px-4 rounded-xl bg-[#00529C] hover:bg-[#004080] text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Tag className="h-3.5 w-3.5" />
              <span>Edit Massal &amp; Sinkron (1 Klik)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                clearMarkedBranches();
                setOnlyMarkedFilter(false);
              }}
              className="h-9 px-3 rounded-xl bg-white border border-[#cbd5e1] hover:bg-[#f1f5f9] text-xs font-medium text-[#444653] whitespace-nowrap"
            >
              Hapus Tanda
            </button>
          </div>
        </section>
      )}

      {/* Audit Results Table */}
      <section className="rounded-3xl bg-white border border-[#e2e8f0] shadow-[0_4px_20px_-2px_rgba(15,23,42,0.05)] overflow-hidden">
        {pageRows.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <CheckCircle2 className="h-9 w-9 text-[#059669] mx-auto" />
            <p className="font-display text-base font-semibold text-[#1a1b22]">
              Tidak Ada Temuan Kualitas Data pada Filter Ini
            </p>
            <p className="text-xs text-[#64748b]">
              Seluruh unit kerja pada kategori ini sudah memenuhi standar Master Data BRI.
            </p>
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
                        checked={
                          pageRows.length > 0 &&
                          pageRows.every((r) => selectedIds.includes(r.branchId))
                        }
                        onChange={() => {
                          const pageIds = pageRows.map((r) => r.branchId);
                          const allChecked = pageIds.every((id) => selectedIds.includes(id));
                          if (allChecked) {
                            setSelectedIds((prev) => prev.filter((id) => !pageIds.includes(id)));
                          } else {
                            setSelectedIds((prev) => Array.from(new Set([...prev, ...pageIds])));
                          }
                        }}
                        aria-label="Pilih semua baris kualitas data"
                        className="h-4 w-4 rounded border-[#cbd5e1] text-[#00529C]"
                      />
                    </th>
                    <th className="py-3 px-3">Kode</th>
                    <th className="py-3 px-3">Unit Kerja BRI</th>
                    <th className="py-3 px-3">Temuan Kualitas Data</th>
                    <th className="py-3 px-3">Rekomendasi Perbaikan</th>
                    <th className="py-3 pr-5 pl-3 text-right">Tindakan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e2e8f0] text-sm">
                  {pageRows.map((item) => {
                    const isChecked = selectedIds.includes(item.branchId);
                    const branchObj = branchMap.get(item.branchId);
                    const shownIssues =
                      categoryFilter === 'ALL'
                        ? item.issues
                        : item.issues.filter((iss) => iss.category === categoryFilter);
                    const needsLocationCheck =
                      branchObj?.syncStatus === 'action_required' ||
                      item.issues.some(
                        (iss) =>
                          iss.category === 'invalid_coordinates' ||
                          iss.category === 'gbp_mismatch'
                      );

                    return (
                      <tr key={item.branchId} className="hover:bg-[#f8fafc] smooth-transition">
                        <td className="py-3 pl-5 pr-2">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() =>
                              setSelectedIds((prev) =>
                                prev.includes(item.branchId)
                                  ? prev.filter((id) => id !== item.branchId)
                                  : [...prev, item.branchId]
                              )
                            }
                            aria-label={`Pilih ${item.branchName}`}
                            className="h-4 w-4 rounded border-[#cbd5e1] text-[#00529C]"
                          />
                        </td>
                        <td className="py-3 px-3 font-mono text-xs text-[#444653] tabular-nums whitespace-nowrap">
                          {item.branchCode}
                        </td>
                        <td className="py-3 px-3">
                          <p className="font-semibold text-[#1a1b22] text-xs">{item.branchName}</p>
                          <p className="text-[11px] text-[#64748b]">
                            {item.city} · {item.regionShort}
                          </p>
                        </td>
                        <td className="py-3 px-3">
                          <div className="space-y-1">
                            {shownIssues.map((iss, idx) => (
                              <div key={idx} className="flex items-start gap-1.5 text-xs">
                                <AlertTriangle className="h-3.5 w-3.5 text-[#d97706] shrink-0 mt-0.5" />
                                <div>
                                  <span className="font-semibold text-[#1a1b22]">{iss.label}: </span>
                                  <span className="text-[#444653]">{iss.detail}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="space-y-1">
                            {shownIssues.map((iss, idx) => (
                              <p
                                key={idx}
                                className="font-mono text-xs text-[#059669] leading-snug"
                              >
                                {iss.suggestedFix || 'Lengkapi data di editor'}
                              </p>
                            ))}
                          </div>
                        </td>
                        <td className="py-3 pr-5 pl-3 text-right">
                          <div className="inline-flex flex-wrap justify-end items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => toggleBranchMarked(item.branchId)}
                              className={`h-8 px-2.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1 whitespace-nowrap smooth-transition ${
                                markedSet.has(item.branchId)
                                  ? 'bg-[#00529C] border-[#00529C] text-white'
                                  : 'bg-white border-[#cbd5e1] text-[#444653] hover:bg-[#f1f5f9]'
                              }`}
                            >
                              <Tag className="h-3 w-3" />
                              <span>{markedSet.has(item.branchId) ? 'Ditandai' : 'Tandai Ubah'}</span>
                            </button>
                            {needsLocationCheck && (
                              <button
                                type="button"
                                onClick={() => openMapCompareModal(item.branchId, true)}
                                className="h-8 px-3 rounded-xl bg-[#fef2f2] border border-[#fecaca] hover:bg-[#fee2e2] text-xs font-semibold text-[#dc2626] inline-flex items-center gap-1 whitespace-nowrap"
                              >
                                <Compass className="h-3 w-3" />
                                <span>Cek Jarak Selisih Lokasi</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedBranchId(item.branchId);
                                setActiveView('directory');
                              }}
                              className="h-8 px-3 rounded-xl bg-white border border-[#cbd5e1] hover:bg-[#f1f5f9] text-xs font-medium text-[#1a1b22] whitespace-nowrap"
                            >
                              Lihat Peta
                            </button>
                            <button
                              type="button"
                              onClick={() => openSingleEditor(item.branchId)}
                              className="h-8 px-3 rounded-xl bg-[#eff6ff] hover:bg-[#dbeafe] text-xs font-semibold text-[#00529C] inline-flex items-center gap-1.5 whitespace-nowrap"
                            >
                              <Wrench className="h-3 w-3" />
                              <span>Perbaiki</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="px-5 py-3.5 bg-[#f8fafc] border-t border-[#e2e8f0] flex items-center justify-between gap-4">
              <p className="text-xs text-[#64748b] tabular-nums">
                Halaman <span className="font-mono font-semibold text-[#1a1b22]">{safePage}</span> dari{' '}
                <span className="font-mono font-semibold text-[#1a1b22]">
                  {totalPages.toLocaleString('id-ID')}
                </span>{' '}
                ({filteredItems.length.toLocaleString('id-ID')} unit)
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="h-9 px-3 rounded-xl border border-[#cbd5e1] bg-white hover:bg-[#f1f5f9] disabled:opacity-45 text-xs font-medium text-[#1a1b22] inline-flex items-center gap-1"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span>Sebelumnya</span>
                </button>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="h-9 px-3 rounded-xl border border-[#cbd5e1] bg-white hover:bg-[#f1f5f9] disabled:opacity-45 text-xs font-medium text-[#1a1b22] inline-flex items-center gap-1"
                >
                  <span>Berikutnya</span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {/* Coordinate Comparison Map Modal */}
      {compareModalBranchLive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            onClick={() => setMapCompareBranch(null)}
            className="fixed inset-0 bg-[#0f172a]/35 backdrop-blur-xs"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Cek Jarak Selisih Lokasi Google Maps"
            className="relative z-10 w-full max-w-2xl rounded-3xl bg-white border border-[#e2e8f0] shadow-[0_25px_40px_-8px_rgba(15,23,42,0.14)] overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-[#e2e8f0] flex items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-base font-bold text-[#1a1b22]">
                  Cek Jarak Selisih Titik Lokasi (Master BRI vs Google Maps Live)
                </h3>
                <p className="font-mono text-xs text-[#64748b]">
                  {compareModalBranchLive.code} · {compareModalBranchLive.name} ({compareModalBranchLive.city})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMapCompareBranch(null)}
                className="h-9 w-9 rounded-xl text-[#64748b] hover:bg-[#f1f5f9] flex items-center justify-center"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                {isCompareModalLoading ? (
                  <div className="flex items-center gap-2 text-xs text-[#00529C]">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Mengambil koordinat asli dari Google Maps...</span>
                  </div>
                ) : (
                  <p className="text-xs text-[#444653]">
                    {compareModalLivePlace?.displayName
                      ? `Listing Google Maps terdeteksi: ${compareModalLivePlace.displayName}`
                      : 'Membandingkan titik Master BRI dengan titik pembanding Google Maps'}
                  </p>
                )}

                <button
                  type="button"
                  disabled={isCompareModalLoading}
                  onClick={() => fetchLiveGooglePlace(compareModalBranchLive, true)}
                  className="h-8 px-3 rounded-xl bg-white border border-[#cbd5e1] hover:bg-[#f1f5f9] text-xs font-semibold text-[#00529C] inline-flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
                >
                  <RefreshCw className={`h-3 w-3 ${isCompareModalLoading ? 'animate-spin' : ''}`} />
                  <span>Ukur Ulang dari Google Maps</span>
                </button>
              </div>

              <CoordinateComparisonMap
                branch={compareModalBranchLive}
                liveLat={compareModalLivePlace?.lat}
                liveLng={compareModalLivePlace?.lng}
                liveLabel={compareModalLivePlace?.displayName}
                mapsApiKey={mapsApiKey}
                heightClass="h-[290px]"
              />

              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    isValidIndonesianCoords(compareModalBranchLive.lat, compareModalBranchLive.lng)
                      ? `${compareModalBranchLive.lat},${compareModalBranchLive.lng}`
                      : `BRI ${compareModalBranchLive.name} ${compareModalBranchLive.city}`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-10 px-4 rounded-2xl bg-[#eff6ff] hover:bg-[#dbeafe] text-xs font-semibold text-[#00529C] inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <span>Buka di Google Maps</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setMapCompareBranch(null)}
                    className="h-10 px-4 rounded-2xl bg-white border border-[#cbd5e1] text-xs font-medium text-[#1a1b22]"
                  >
                    Tutup
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const id = compareModalBranchLive.id;
                      setMapCompareBranch(null);
                      openSingleEditor(id);
                    }}
                    className="h-10 px-5 rounded-2xl bg-[#00529C] hover:bg-[#004080] text-white text-xs font-semibold inline-flex items-center gap-2"
                  >
                    <Wrench className="h-3.5 w-3.5" />
                    <span>Perbaiki &amp; Sinkronkan Lokasi Ini</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Single Branch Quality Fix Modal */}
      {editingBranch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div
            onClick={() => !isSavingSingle && setEditingBranch(null)}
            className="fixed inset-0 bg-[#0f172a]/35 backdrop-blur-xs"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Perbaiki Kualitas Data Unit Kerja"
            className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white border border-[#e2e8f0] shadow-[0_25px_40px_-8px_rgba(15,23,42,0.14)]"
          >
            <div className="px-6 py-4 border-b border-[#e2e8f0] flex items-center justify-between sticky top-0 bg-white z-10">
              <div>
                <h3 className="font-display text-base font-bold text-[#1a1b22]">
                  Perbaiki Master Data &amp; Sinkronkan ke Google Maps
                </h3>
                <p className="font-mono text-xs text-[#64748b]">
                  {editingBranch.code} · {editingBranch.name}
                </p>
              </div>
              <button
                type="button"
                disabled={isSavingSingle}
                onClick={() => setEditingBranch(null)}
                className="h-9 w-9 rounded-xl text-[#64748b] hover:bg-[#f1f5f9] flex items-center justify-center"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSingleFix} className="p-6 space-y-4">
              {editingCoordInvalidOrMismatch && (
                <CoordinateComparisonMap
                  branch={editingBranch}
                  liveLat={editingLivePlace?.lat}
                  liveLng={editingLivePlace?.lng}
                  liveLabel={editingLivePlace?.displayName}
                  mapsApiKey={mapsApiKey}
                  heightClass="h-[210px]"
                />
              )}

              <WeeklyHoursChecklist
                value={fixWeeklyHours}
                onChange={setFixWeeklyHours}
                compact
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[#444653]">Telepon Layanan</span>
                  <input
                    type="text"
                    value={fixPhone}
                    onChange={(e) => setFixPhone(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-[#f8fafc] border border-[#cbd5e1] font-mono text-xs text-[#1a1b22]"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[#444653]">Website Resmi</span>
                  <input
                    type="text"
                    value={fixWebsite}
                    onChange={(e) => setFixWebsite(e.target.value)}
                    placeholder="https://bri.co.id"
                    className="w-full h-10 px-3 rounded-xl bg-[#f8fafc] border border-[#cbd5e1] font-mono text-xs text-[#1a1b22]"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[#444653]">Latitude</span>
                  <input
                    type="text"
                    value={fixLat}
                    onChange={(e) => setFixLat(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-[#f8fafc] border border-[#cbd5e1] font-mono text-xs text-[#1a1b22]"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[#444653]">Longitude</span>
                  <input
                    type="text"
                    value={fixLng}
                    onChange={(e) => setFixLng(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-[#f8fafc] border border-[#cbd5e1] font-mono text-xs text-[#1a1b22]"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[#444653]">Kode Pos</span>
                  <input
                    type="text"
                    value={fixPostal}
                    onChange={(e) => setFixPostal(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-[#f8fafc] border border-[#cbd5e1] font-mono text-xs text-[#1a1b22]"
                  />
                </label>
              </div>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-[#444653]">Kabupaten / Kota</span>
                <input
                  type="text"
                  value={fixCity}
                  onChange={(e) => setFixCity(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-[#f8fafc] border border-[#cbd5e1] text-xs text-[#1a1b22]"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-[#444653]">Alamat Resmi Unit Kerja</span>
                <textarea
                  rows={2}
                  value={fixAddress}
                  onChange={(e) => setFixAddress(e.target.value)}
                  className="w-full p-3 rounded-xl bg-[#f8fafc] border border-[#cbd5e1] text-xs text-[#1a1b22] resize-none"
                />
              </label>

              <label className="flex items-center gap-2.5 text-xs text-[#1a1b22] cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={singleSubmitToGoogle}
                  onChange={(e) => setSingleSubmitToGoogle(e.target.checked)}
                  className="h-4 w-4 rounded border-[#cbd5e1] text-[#00529C]"
                />
                <span>Teruskan perbaikan Master Data ke Antrean Sinkronisasi Google Maps</span>
              </label>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  disabled={isSavingSingle}
                  onClick={() => setEditingBranch(null)}
                  className="h-10 px-4 rounded-2xl bg-white border border-[#cbd5e1] text-xs font-medium text-[#1a1b22]"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingSingle}
                  className="h-10 px-5 rounded-2xl bg-[#00529C] hover:bg-[#004080] text-white text-xs font-semibold inline-flex items-center gap-2 disabled:opacity-60 whitespace-nowrap"
                >
                  {isSavingSingle ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Menyinkronkan...</span>
                    </>
                  ) : (
                    <span>Konfirmasi &amp; Sinkronkan ke Google Maps</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Batch Confirmation Modal */}
      {batchConfirmFixes && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            onClick={() => !isApplyingBatch && setBatchConfirmFixes(null)}
            className="fixed inset-0 bg-[#0f172a]/35 backdrop-blur-xs"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Konfirmasi Standardisasi Kualitas Data Massal"
            className="relative z-10 w-full max-w-lg rounded-3xl bg-white border border-[#e2e8f0] shadow-[0_25px_40px_-8px_rgba(15,23,42,0.14)] overflow-hidden"
          >
            <div className="px-6 py-5 border-b border-[#e2e8f0] space-y-1">
              <h3 className="font-display text-base font-bold text-[#1a1b22]">
                Konfirmasi &amp; Sinkronkan ke Google Maps ({batchConfirmFixes.length} Unit)
              </h3>
              <p className="text-xs text-[#64748b]">
                Menstandardisasi{' '}
                <span className="font-mono font-semibold text-[#1a1b22]">
                  {batchConfirmFixes.length}
                </span>{' '}
                unit kerja pada Master Data BRI (jam layanan, telepon 1500017, website bri.co.id,
                dan kode pos).
              </p>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <label className="flex items-center gap-2.5 text-[#1a1b22] cursor-pointer">
                <input
                  type="checkbox"
                  checked={batchSubmitToGoogle}
                  onChange={(e) => setBatchSubmitToGoogle(e.target.checked)}
                  className="h-4 w-4 rounded border-[#cbd5e1] text-[#00529C]"
                />
                <span>
                  Ajukan seluruh hasil perbaikan ke Antrean Review Google (Master → Google Maps)
                </span>
              </label>
            </div>

            <div className="px-6 py-4 bg-[#f8fafc] border-t border-[#e2e8f0] flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={isApplyingBatch}
                onClick={() => setBatchConfirmFixes(null)}
                className="h-10 px-4 rounded-2xl bg-white border border-[#cbd5e1] text-xs font-medium text-[#1a1b22]"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isApplyingBatch}
                onClick={handleConfirmBatchFixes}
                className="h-10 px-5 rounded-2xl bg-[#00529C] hover:bg-[#004080] text-white text-xs font-semibold inline-flex items-center gap-2 disabled:opacity-60 whitespace-nowrap"
              >
                {isApplyingBatch ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Menyinkronkan...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Konfirmasi &amp; Sinkronkan ({batchConfirmFixes.length})</span>
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
          region: 'ALL',
          tier: 'ALL',
          status: 'ALL',
          search: '',
          filteredCount: branches.length,
        }}
      />

      <BatchMarkEditModal
        isOpen={isBatchMarkModalOpen}
        onClose={() => setIsBatchMarkModalOpen(false)}
      />
    </div>
  );
}
