import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import type {
  AppView,
  BatchMarkFixPayload,
  BranchLocation,
  BulkImportRowInput,
  ChangeHistoryEvent,
  CustomerReview,
  DataQualityAuditItem,
  GooglePlaceLiveInfo,
  GoogleSyncJob,
  ListingSecurityAlert,
  SyncStatus,
  ToastMessage,
  WeeklyHoursSchedule,
} from '../types/ops';
import {
  calculateDistanceMeters,
  formatDistanceId,
  isValidIndonesianCoords,
} from '../components/CoordinateComparisonMap';

export interface QualityFixPayload {
  branchId: string;
  operatingHours?: string;
  saturdayHours?: string;
  sundayHours?: string;
  weeklyHours?: WeeklyHoursSchedule;
  phone?: string;
  website?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  lat?: number;
  lng?: number;
}

interface OpsContextValue {
  activeView: AppView;
  setActiveView: (view: AppView) => void;
  branches: BranchLocation[];
  isLoadingBranches: boolean;
  loadError: string | null;
  retryLoadBranches: () => void;
  regions: string[];
  selectedBranchId: string | null;
  setSelectedBranchId: (id: string | null) => void;
  selectedBranch: BranchLocation | null;
  checkedBranchIds: string[];
  toggleBranchChecked: (id: string) => void;
  setCheckedBranchIds: (ids: string[]) => void;
  markedBranchIds: string[];
  toggleBranchMarked: (id: string) => void;
  markManyBranches: (ids: string[]) => void;
  unmarkManyBranches: (ids: string[]) => void;
  clearMarkedBranches: () => void;
  executeBatchMarkFix: (payload: BatchMarkFixPayload) => Promise<number>;
  directoryFilterPreset: 'ALL' | 'missing_maps' | 'marked' | SyncStatus;
  setDirectoryFilterPreset: (preset: 'ALL' | 'missing_maps' | 'marked' | SyncStatus) => void;
  changeHistory: ChangeHistoryEvent[];
  securityAlerts: ListingSecurityAlert[];
  isScanningSecurity: boolean;
  refreshHistoryAlerts: () => Promise<void>;
  resolveSecurityAlert: (alertId: string, action: 'mitigate' | 'dismiss') => Promise<void>;
  scanListingSecurity: (gbpAccountEmail?: string) => Promise<number>;
  isBulkSyncOpen: boolean;
  openBulkSync: (targetIds?: string[]) => void;
  closeBulkSync: () => void;
  bulkSyncTargetIds: string[];
  syncSingleBranch: (
    branchId: string,
    updates?: Partial<
      Pick<
        BranchLocation,
        | 'operatingHours'
        | 'saturdayHours'
        | 'sundayHours'
        | 'weeklyHours'
        | 'phone'
        | 'website'
        | 'address'
        | 'name'
        | 'lat'
        | 'lng'
        | 'googlePlaceId'
        | 'googleMapsUri'
      >
    >
  ) => Promise<void>;
  executeBulkSync: (targetIds: string[], gbpAccessToken?: string | null) => Promise<void>;
  pushBranchToGbpLive: (
    branchId: string,
    locationName: string,
    gbpAccessToken: string
  ) => Promise<boolean>;
  linkBranchGbp: (branchId: string, gbpLocationName: string, mapsUri?: string) => Promise<void>;
  bulkImportMasterCsv: (
    rows: BulkImportRowInput[],
    submitToGoogleReview: boolean,
    updateOnly?: boolean
  ) => Promise<{
    updatedCount: number;
    upgradedCount: number;
    addedCount: number;
    skippedCount: number;
    createdJobsCount: number;
  }>;
  downloadMasterCsv: (opts?: {
    region?: string;
    tier?: string;
    status?: string;
    search?: string;
    templateOnly?: boolean;
  }) => void;
  applyQualityFixes: (
    fixes: QualityFixPayload[],
    submitToGoogleReview: boolean
  ) => Promise<number>;
  qualityAudit: {
    items: DataQualityAuditItem[];
    counts: {
      totalFlagged: number;
      missingHours: number;
      invalidPhone: number;
      invalidWebsite: number;
      incompleteAddress: number;
      invalidCoordinates: number;
      gbpMismatch: number;
    };
  };
  syncJobs: GoogleSyncJob[];
  isVerifyingSyncJobs: boolean;
  verifyPendingSyncJobs: (
    gbpAccessToken?: string | null,
    jobId?: string
  ) => Promise<{ verifiedCount: number; checkedCount: number }>;
  livePlacesCache: Record<string, GooglePlaceLiveInfo | null>;
  loadingPlaceIds: Record<string, boolean>;
  placeErrors: Record<string, string>;
  fetchLiveGooglePlace: (branch: BranchLocation, force?: boolean) => Promise<GooglePlaceLiveInfo | null>;
  importGoogleReviewsToInbox: (branch: BranchLocation, place: GooglePlaceLiveInfo) => Promise<number>;
  syncBatchGoogleReviews: (opts?: {
    regionShort?: string;
    tier?: string;
    limit?: number;
    onlyUncrawled?: boolean;
  }) => Promise<{ importedCount: number; scannedNow: number; totalScannedBranches: number }>;
  syncGbpReviewsCentralized: (
    accountName: string,
    locationName: string,
    branchId: string,
    gbpAccessToken: string
  ) => Promise<number>;
  syncAllGbpReviews: (
    accountName: string,
    locations: Array<{ name: string; title?: string; storeCode?: string }>,
    gbpAccessToken: string
  ) => Promise<number>;
  scannedReviewBranchIds: string[];
  reviewsAutoSyncing: boolean;
  refreshReviews: () => Promise<void>;
  reviews: CustomerReview[];
  activeReviewId: string | null;
  setActiveReviewId: (id: string | null) => void;
  submitReviewReply: (
    reviewId: string,
    replyText: string,
    gbpAccessToken?: string | null
  ) => Promise<void>;
  globalSearch: string;
  setGlobalSearch: (q: string) => void;
  resetDemoData: () => Promise<void>;
  toasts: ToastMessage[];
  pushToast: (toast: Omit<ToastMessage, 'id'>) => void;
  dismissToast: (id: string) => void;
  mapsApiKey: string;
  kpiStats: {
    totalBranches: number;
    syncedCount: number;
    discrepancyCount: number;
    actionRequiredCount: number;
    pendingReviewCount: number;
    processingCount: number;
    missingOnMapsCount: number;
    registeredOnMapsCount: number;
    waitingSyncCount: number;
    activeSecurityAlertsCount: number;
    syncRate: number;
    avgRating: number;
    totalReviews: number;
    repliedCount: number;
    resolutionRate: number;
  };
}

const OpsContext = createContext<OpsContextValue | null>(null);

interface ParsedHourRange {
  open: boolean;
  startMin?: number;
  endMin?: number;
}

function parseHoursEntry(raw: string): ParsedHourRange | null {
  const clean = (raw || '').trim();
  if (!clean) return null;
  if (/^(tutup|closed)$/i.test(clean)) {
    return { open: false };
  }
  const m = clean.match(
    /(\d{1,2})[:.](\d{2})(?:\s*(?:AM|PM|WIB|WITA|WIT))?\s*(?:-|–|—|s\.?\s*d\.?|s\/d|sd|to)\s*(\d{1,2})[:.](\d{2})(?:\s*(AM|PM))?/i
  );
  if (!m) {
    // Also handle "8:00 AM – 3:00 PM" where first period has AM/PM
    const amPmMatch = clean.match(
      /(\d{1,2})[:.](\d{2})\s*(AM|PM)\s*(?:-|–|—|to)\s*(\d{1,2})[:.](\d{2})\s*(AM|PM)/i
    );
    if (!amPmMatch) return null;
    const to24 = (h: number, ap: string) => {
      const upper = ap.toUpperCase();
      if (upper === 'PM' && h < 12) return h + 12;
      if (upper === 'AM' && h === 12) return 0;
      return h;
    };
    const sh = to24(Number(amPmMatch[1]), amPmMatch[3]);
    const eh = to24(Number(amPmMatch[4]), amPmMatch[6]);
    return {
      open: true,
      startMin: sh * 60 + Number(amPmMatch[2]),
      endMin: eh * 60 + Number(amPmMatch[5]),
    };
  }
  const sh = Number(m[1]);
  const sm = Number(m[2]);
  const eh = Number(m[3]);
  const em = Number(m[4]);
  if (sh > 23 || eh > 24 || sm > 59 || em > 59) return null;
  return { open: true, startMin: sh * 60 + sm, endMin: eh * 60 + em };
}

function isValidHoursString(raw?: string): boolean {
  if (!raw || !raw.trim()) return false;
  if (/^(tutup|closed)$/i.test(raw.trim())) return true;
  return parseHoursEntry(raw) !== null;
}

function compareGoogleHoursWithMaster(
  branch: BranchLocation,
  weekdayDescriptions?: string[]
): { aligned: boolean; masterSummary: string; googleSummary: string; mismatchedDays: string[] } | null {
  if (!Array.isArray(weekdayDescriptions) || weekdayDescriptions.length === 0) return null;

  const dayMap: Array<{ key: keyof WeeklyHoursSchedule; label: string; aliases: string[] }> = [
    { key: 'mon', label: 'Senin', aliases: ['senin', 'monday'] },
    { key: 'tue', label: 'Selasa', aliases: ['selasa', 'tuesday'] },
    { key: 'wed', label: 'Rabu', aliases: ['rabu', 'wednesday'] },
    { key: 'thu', label: 'Kamis', aliases: ['kamis', 'thursday'] },
    { key: 'fri', label: 'Jumat', aliases: ['jumat', "jum'at", 'friday'] },
    { key: 'sat', label: 'Sabtu', aliases: ['sabtu', 'saturday'] },
    { key: 'sun', label: 'Minggu', aliases: ['minggu', 'sunday'] },
  ];

  const mismatchedDays: string[] = [];
  const masterParts: string[] = [];
  const googleParts: string[] = [];

  for (const day of dayMap) {
    const descLine = weekdayDescriptions.find((line) => {
      const lower = line.toLowerCase();
      return day.aliases.some((alias) => lower.startsWith(`${alias}:`) || lower.startsWith(`${alias} `));
    });
    if (!descLine) continue;

    const googleVal = descLine.split(/:\s*/).slice(1).join(':').trim();
    const googleParsed = parseHoursEntry(googleVal);

    const masterEntry = branch.weeklyHours?.[day.key];
    const masterVal = masterEntry
      ? masterEntry.open
        ? masterEntry.hours
        : 'Tutup'
      : day.key === 'sat'
        ? branch.saturdayHours || 'Tutup'
        : day.key === 'sun'
          ? branch.sundayHours || 'Tutup'
          : branch.operatingHours || '08:00 - 15:00 WIB';
    const masterParsed = parseHoursEntry(masterVal);

    if (!googleParsed || !masterParsed) continue;

    if (
      googleParsed.open !== masterParsed.open ||
      (googleParsed.open &&
        masterParsed.open &&
        (googleParsed.startMin !== masterParsed.startMin ||
          googleParsed.endMin !== masterParsed.endMin))
    ) {
      mismatchedDays.push(day.label);
      masterParts.push(`${day.label.slice(0, 3)}: ${masterVal}`);
      googleParts.push(`${day.label.slice(0, 3)}: ${googleVal}`);
    }
  }

  return {
    aligned: mismatchedDays.length === 0,
    masterSummary: masterParts.join(' · ') || branch.operatingHours,
    googleSummary: googleParts.join(' · ') || weekdayDescriptions.slice(0, 2).join(' · '),
    mismatchedDays,
  };
}

function normalizeBranchLabel(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\b(bank rakyat indonesia|pt|bank|bri|kantor cabang pembantu|kantor cabang|kantor kas|kacab|kcp|kc|unit|kk|teras|ssb|ro|regional office)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function buildLiveGoogleDiscrepancies(
  branch: BranchLocation,
  place: GooglePlaceLiveInfo
): BranchLocation['discrepancies'] {
  const checkedLiveFields = new Set<string>();
  const liveDiffs: BranchLocation['discrepancies'] = [];

  // 1. Compare unit name (e.g. Master "KC Gunung Sitoli" vs Google Maps "BRI KACAB NIAS")
  if (place.displayName) {
    checkedLiveFields.add('name');
    const masterCore = normalizeBranchLabel(branch.name);
    const liveCore = normalizeBranchLabel(place.displayName);
    if (
      masterCore &&
      liveCore &&
      !liveCore.includes(masterCore) &&
      !masterCore.includes(liveCore)
    ) {
      liveDiffs.push({
        field: 'name',
        fieldLabel: 'Nama Unit Kerja (Google Maps Live)',
        masterValue: branch.name,
        gbpValue: place.displayName,
        reason: 'Nama pada Google Maps Live berbeda dari Master Data BRI (Google Maps Live)',
      });
    }
  }

  // 2. Compare normalized phone digits (1500017 == 1 500 017)
  if (place.nationalPhoneNumber) {
    checkedLiveFields.add('phone');
    const masterDigits = (branch.phone || '').replace(/[^\d]/g, '');
    const liveDigits = place.nationalPhoneNumber.replace(/[^\d]/g, '');
    if (
      masterDigits &&
      liveDigits &&
      masterDigits !== liveDigits &&
      !liveDigits.endsWith(masterDigits) &&
      !masterDigits.endsWith(liveDigits)
    ) {
      liveDiffs.push({
        field: 'phone',
        fieldLabel: 'Nomor Telepon (Google Maps Live)',
        masterValue: branch.phone,
        gbpValue: place.nationalPhoneNumber,
        reason: 'Nomor telepon Google Maps Live berbeda dari Master Data BRI (Google Maps Live)',
      });
    }
  }

  // 3. Compare live Google Maps operating hours day-by-day against Master BRI
  const hoursCmp = compareGoogleHoursWithMaster(branch, place.weekdayDescriptions);
  if (hoursCmp) {
    checkedLiveFields.add('operatingHours');
    if (!hoursCmp.aligned) {
      liveDiffs.push({
        field: 'operatingHours',
        fieldLabel: `Jam Operasional (${hoursCmp.mismatchedDays.join(', ')})`,
        masterValue: hoursCmp.masterSummary,
        gbpValue: hoursCmp.googleSummary,
        reason: `Jadwal hari ${hoursCmp.mismatchedDays.join(', ')} di Google Maps Live berbeda dari Master BRI (Google Maps Live)`,
      });
    }
  }

  // 4. Compare coordinates distance (> 50 meter threshold)
  if (
    typeof place.lat === 'number' &&
    typeof place.lng === 'number' &&
    isValidIndonesianCoords(place.lat, place.lng)
  ) {
    checkedLiveFields.add('coordinates');
    if (!isValidIndonesianCoords(branch.lat, branch.lng)) {
      liveDiffs.push({
        field: 'coordinates',
        fieldLabel: 'Titik Koordinat Lokasi (Google Maps Live)',
        masterValue: `${branch.lat}, ${branch.lng}`,
        gbpValue: `${place.lat.toFixed(6)}, ${place.lng.toFixed(6)}`,
        reason: 'Koordinat Master belum valid dibanding titik Google Maps Live (Google Maps Live)',
        gbpLat: place.lat,
        gbpLng: place.lng,
      });
    } else {
      const dist = calculateDistanceMeters(branch.lat, branch.lng, place.lat, place.lng);
      if (dist > 50) {
        liveDiffs.push({
          field: 'coordinates',
          fieldLabel: 'Jarak Titik Lokasi (Google Maps Live)',
          masterValue: `${branch.lat.toFixed(5)}, ${branch.lng.toFixed(5)}`,
          gbpValue: `${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}`,
          reason: `Selisih jarak lokasi sebesar ${formatDistanceId(dist)} terhadap Google Maps Live (Google Maps Live)`,
          gbpLat: place.lat,
          gbpLng: place.lng,
        });
      }
    }
  }

  // Only keep unverified/non-live discrepancies for fields NOT already checked live against Google Maps
  const existingUnchecked = branch.discrepancies.filter(
    (d) => !d.reason.includes('(Google Maps Live)') && !checkedLiveFields.has(d.field)
  );
  const merged = [...liveDiffs];
  for (const d of existingUnchecked) {
    if (!merged.some((m) => m.field === d.field)) {
      merged.push(d);
    }
  }
  return merged;
}

export function OpsProvider({
  children,
  mapsApiKey,
}: {
  children: React.ReactNode;
  mapsApiKey: string;
}) {
  const { token } = useAuth();
  const [activeView, setActiveView] = useState<AppView>('overview');
  const [branches, setBranches] = useState<BranchLocation[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [processingIds, setProcessingIds] = useState<Record<string, boolean>>({});
  const [syncJobs, setSyncJobs] = useState<GoogleSyncJob[]>([]);
  const [isVerifyingSyncJobs, setIsVerifyingSyncJobs] = useState(false);
  const [reviews, setReviews] = useState<CustomerReview[]>([]);
  const [scannedReviewBranchIds, setScannedReviewBranchIds] = useState<string[]>([]);
  const [reviewsAutoSyncing, setReviewsAutoSyncing] = useState(false);

  const [livePlacesCache, setLivePlacesCache] = useState<Record<string, GooglePlaceLiveInfo | null>>({});
  const [loadingPlaceIds, setLoadingPlaceIds] = useState<Record<string, boolean>>({});
  const [placeErrors, setPlaceErrors] = useState<Record<string, string>>({});

  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [checkedBranchIds, setCheckedBranchIds] = useState<string[]>([]);
  const [markedBranchIds, setMarkedBranchIds] = useState<string[]>([]);
  const [directoryFilterPreset, setDirectoryFilterPreset] = useState<
    'ALL' | 'missing_maps' | 'marked' | SyncStatus
  >('ALL');
  const [changeHistory, setChangeHistory] = useState<ChangeHistoryEvent[]>([]);
  const [securityAlerts, setSecurityAlerts] = useState<ListingSecurityAlert[]>([]);
  const [isScanningSecurity, setIsScanningSecurity] = useState(false);

  const [isBulkSyncOpen, setIsBulkSyncOpen] = useState(false);
  const [bulkSyncTargetIds, setBulkSyncTargetIds] = useState<string[]>([]);
  const [activeReviewId, setActiveReviewId] = useState<string | null>(null);
  const [globalSearch, setGlobalSearch] = useState('');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback(
    (toast: Omit<ToastMessage, 'id'>) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-3), { ...toast, id }]);
      window.setTimeout(() => {
        dismissToast(id);
      }, 4200);
    },
    [dismissToast]
  );

  const authHeaders = useMemo(() => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  }, [token]);

  const fetchAllData = useCallback(async () => {
    setIsLoadingBranches(true);
    setLoadError(null);
    try {
      const [branchesRes, jobsRes, reviewsRes, histRes] = await Promise.all([
        fetch('/api/branches'),
        fetch('/api/sync-jobs'),
        fetch('/api/reviews'),
        fetch('/api/history-alerts'),
      ]);

      if (!branchesRes.ok) {
        throw new Error(`Gagal memuat data lokasi (${branchesRes.status})`);
      }

      const branchData = (await branchesRes.json()) as { branches: BranchLocation[] };
      const list = Array.isArray(branchData.branches) ? branchData.branches : [];
      setBranches(list);
      setSelectedBranchId((prev) => prev ?? (list[0]?.id || null));

      if (jobsRes.ok) {
        const jobData = (await jobsRes.json()) as { jobs: GoogleSyncJob[] };
        setSyncJobs(Array.isArray(jobData.jobs) ? jobData.jobs : []);
      }

      if (reviewsRes.ok) {
        const revData = (await reviewsRes.json()) as {
          reviews: CustomerReview[];
          scannedBranchIds?: string[];
          autoSyncInProgress?: boolean;
        };
        setReviews(Array.isArray(revData.reviews) ? revData.reviews : []);
        if (Array.isArray(revData.scannedBranchIds)) {
          setScannedReviewBranchIds(revData.scannedBranchIds);
        }
        setReviewsAutoSyncing(Boolean(revData.autoSyncInProgress));
      }

      if (histRes.ok) {
        const histData = (await histRes.json()) as {
          changeHistory?: ChangeHistoryEvent[];
          securityAlerts?: ListingSecurityAlert[];
        };
        if (Array.isArray(histData.changeHistory)) setChangeHistory(histData.changeHistory);
        if (Array.isArray(histData.securityAlerts)) setSecurityAlerts(histData.securityAlerts);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Gagal memuat data cabang.');
    } finally {
      setIsLoadingBranches(false);
    }
  }, []);

  const refreshHistoryAlerts = useCallback(async () => {
    try {
      const res = await fetch('/api/history-alerts');
      if (!res.ok) return;
      const data = (await res.json()) as {
        changeHistory?: ChangeHistoryEvent[];
        securityAlerts?: ListingSecurityAlert[];
      };
      if (Array.isArray(data.changeHistory)) setChangeHistory(data.changeHistory);
      if (Array.isArray(data.securityAlerts)) setSecurityAlerts(data.securityAlerts);
    } catch {
      // Ignore silent refresh error
    }
  }, []);

  const refreshReviews = useCallback(async () => {
    try {
      const res = await fetch('/api/reviews');
      if (!res.ok) return;
      const revData = (await res.json()) as {
        reviews: CustomerReview[];
        scannedBranchIds?: string[];
        autoSyncInProgress?: boolean;
      };
      if (Array.isArray(revData.reviews)) {
        setReviews(revData.reviews);
      }
      if (Array.isArray(revData.scannedBranchIds)) {
        setScannedReviewBranchIds(revData.scannedBranchIds);
      }
      setReviewsAutoSyncing(Boolean(revData.autoSyncInProgress));
    } catch {
      // Ignore silent background review refresh failure
    }
  }, []);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const displayBranches = useMemo(() => {
    if (Object.keys(processingIds).length === 0) return branches;
    return branches.map((b) =>
      processingIds[b.id] ? { ...b, syncStatus: 'processing' as const } : b
    );
  }, [branches, processingIds]);

  const regions = useMemo(() => {
    const set = new Set<string>();
    for (const b of branches) {
      set.add(b.regionShort);
    }
    return Array.from(set);
  }, [branches]);

  const selectedBranch = useMemo(
    () => displayBranches.find((b) => b.id === selectedBranchId) ?? null,
    [displayBranches, selectedBranchId]
  );

  const toggleBranchChecked = useCallback((id: string) => {
    setCheckedBranchIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }, []);

  const toggleBranchMarked = useCallback((id: string) => {
    setMarkedBranchIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }, []);

  const markManyBranches = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    setMarkedBranchIds((prev) => Array.from(new Set([...prev, ...ids])));
  }, []);

  const unmarkManyBranches = useCallback((ids: string[]) => {
    const removeSet = new Set(ids);
    setMarkedBranchIds((prev) => prev.filter((id) => !removeSet.has(id)));
  }, []);

  const clearMarkedBranches = useCallback(() => {
    setMarkedBranchIds([]);
  }, []);

  const openBulkSync = useCallback((targetIds?: string[]) => {
    setBulkSyncTargetIds(targetIds && targetIds.length > 0 ? targetIds : []);
    setIsBulkSyncOpen(true);
  }, []);

  const closeBulkSync = useCallback(() => {
    setIsBulkSyncOpen(false);
    setBulkSyncTargetIds([]);
  }, []);

  const syncSingleBranch = useCallback(
    async (
      branchId: string,
      updates?: Partial<
        Pick<
          BranchLocation,
          | 'operatingHours'
          | 'saturdayHours'
          | 'sundayHours'
          | 'weeklyHours'
          | 'phone'
          | 'website'
          | 'address'
          | 'name'
          | 'lat'
          | 'lng'
          | 'googlePlaceId'
          | 'googleMapsUri'
        >
      >
    ) => {
      setProcessingIds((prev) => ({ ...prev, [branchId]: true }));
      try {
        const res = await fetch(`/api/branches/${encodeURIComponent(branchId)}`, {
          method: 'PATCH',
          headers: authHeaders,
          body: JSON.stringify({
            ...updates,
            submitToGoogleReview: true,
          }),
        });

        const data = (await res.json()) as {
          branch?: BranchLocation;
          syncJob?: GoogleSyncJob | null;
          historyEvent?: ChangeHistoryEvent;
          error?: string;
        };

        if (!res.ok || !data.branch) {
          throw new Error(data.error || 'Gagal menyimpan perubahan Master Data.');
        }

        const updated = data.branch;
        setBranches((prev) => prev.map((b) => (b.id === branchId ? updated : b)));
        if (data.syncJob) {
          setSyncJobs((prev) => [data.syncJob!, ...prev]);
        }
        if (data.historyEvent) {
          setChangeHistory((prev) => [data.historyEvent!, ...prev]);
        }

        pushToast({
          title: 'Dikonfirmasi & diajukan ke Google Maps',
          description: `Perubahan Master Data ${updated.name} menunggu verifikasi otomatis Google Maps.`,
          variant: 'success',
        });
      } catch (err) {
        pushToast({
          title: 'Gagal memperbarui cabang',
          description: err instanceof Error ? err.message : 'Terjadi kesalahan saat sinkronisasi.',
          variant: 'error',
        });
      } finally {
        setProcessingIds((prev) => {
          const next = { ...prev };
          delete next[branchId];
          return next;
        });
      }
    },
    [authHeaders, pushToast]
  );

  const pushBranchToGbpLive = useCallback(
    async (branchId: string, locationName: string, gbpAccessToken: string): Promise<boolean> => {
      setProcessingIds((prev) => ({ ...prev, [branchId]: true }));
      try {
        const res = await fetch('/api/gbp/push-location', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${gbpAccessToken}`,
          },
          body: JSON.stringify({ branchId, locationName }),
        });

        const data = (await res.json()) as {
          ok?: boolean;
          branch?: BranchLocation;
          syncJob?: GoogleSyncJob;
          error?: string;
        };

        if (!res.ok || !data.branch) {
          throw new Error(data.error || 'Gagal mendorong pembaruan ke Google Business Profile.');
        }

        setBranches((prev) => prev.map((b) => (b.id === branchId ? data.branch! : b)));
        if (data.syncJob) {
          setSyncJobs((prev) => [data.syncJob!, ...prev]);
        }

        pushToast({
          title: 'Master Data dikirim ke Google Business Profile',
          description: `${data.branch.name} telah disesuaikan di Google Business Profile.`,
          variant: 'success',
        });
        return true;
      } catch (err) {
        pushToast({
          title: 'Sinkronisasi GBP API gagal',
          description: err instanceof Error ? err.message : 'Periksa koneksi akun GBP.',
          variant: 'error',
        });
        return false;
      } finally {
        setProcessingIds((prev) => {
          const next = { ...prev };
          delete next[branchId];
          return next;
        });
      }
    },
    [pushToast]
  );

  const linkBranchGbp = useCallback(
    async (branchId: string, gbpLocationName: string, mapsUri?: string) => {
      try {
        const res = await fetch('/api/gbp/link', {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ branchId, gbpLocationName, mapsUri }),
        });
        const data = (await res.json()) as { ok?: boolean; branch?: BranchLocation; error?: string };
        if (!res.ok || !data.branch) {
          throw new Error(data.error || 'Gagal menautkan lokasi GBP.');
        }
        setBranches((prev) => prev.map((b) => (b.id === branchId ? data.branch! : b)));
        pushToast({
          title: 'Lokasi GBP berhasil ditautkan',
          description: `${data.branch.name} terhubung ke profil Google Business Profile.`,
          variant: 'success',
        });
      } catch (err) {
        pushToast({
          title: 'Gagal menautkan GBP',
          description: err instanceof Error ? err.message : 'Terjadi kesalahan.',
          variant: 'error',
        });
      }
    },
    [authHeaders, pushToast]
  );

  const executeBulkSync = useCallback(
    async (targetIds: string[], gbpAccessToken?: string | null) => {
      if (targetIds.length === 0) return;

      const procMap: Record<string, boolean> = {};
      for (const id of targetIds) procMap[id] = true;
      setProcessingIds((prev) => ({ ...prev, ...procMap }));

      try {
        const linkedBranches = gbpAccessToken
          ? branches.filter((b) => targetIds.includes(b.id) && Boolean(b.gbpLocationName))
          : [];
        const queueIds = targetIds.filter(
          (id) => !linkedBranches.some((lb) => lb.id === id)
        );

        let liveSuccessCount = 0;
        for (const lb of linkedBranches) {
          const res = await fetch('/api/gbp/push-location', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${gbpAccessToken}`,
            },
            body: JSON.stringify({ branchId: lb.id, locationName: lb.gbpLocationName }),
          });
          if (res.ok) {
            const data = (await res.json()) as { branch?: BranchLocation; syncJob?: GoogleSyncJob };
            if (data.branch) {
              setBranches((prev) => prev.map((b) => (b.id === lb.id ? data.branch! : b)));
            }
            if (data.syncJob) {
              setSyncJobs((prev) => [data.syncJob!, ...prev]);
            }
            liveSuccessCount++;
          } else {
            queueIds.push(lb.id);
          }
        }

        if (queueIds.length > 0) {
          const res = await fetch('/api/branches/bulk-sync', {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({ targetIds: queueIds }),
          });

          const data = (await res.json()) as {
            updatedBranches?: BranchLocation[];
            createdJobs?: GoogleSyncJob[];
            historyEvents?: ChangeHistoryEvent[];
            error?: string;
          };

          if (!res.ok || !data.updatedBranches) {
            throw new Error(data.error || 'Gagal menjalankan sinkronisasi massal Master → GBP.');
          }

          const updatedMap: Record<string, BranchLocation> = {};
          for (const b of data.updatedBranches) {
            updatedMap[b.id] = b;
          }

          setBranches((prev) => prev.map((b) => updatedMap[b.id] ?? b));
          if (Array.isArray(data.createdJobs) && data.createdJobs.length > 0) {
            setSyncJobs((prev) => [...data.createdJobs!, ...prev]);
          }
          if (Array.isArray(data.historyEvents) && data.historyEvents.length > 0) {
            setChangeHistory((prev) => [...data.historyEvents!, ...prev]);
          }
        }

        setCheckedBranchIds((prev) => prev.filter((id) => !targetIds.includes(id)));
        pushToast({
          title: `${targetIds.length} lokasi disinkronkan dari Master Data BRI`,
          description:
            liveSuccessCount > 0
              ? `${liveSuccessCount} dikirim langsung ke GBP API · ${queueIds.length} masuk antrean review Google.`
              : 'Data Google Maps / GBP diajukan untuk menyesuaikan Master Data BRI.',
          variant: 'success',
        });
      } catch (err) {
        pushToast({
          title: 'Sinkronisasi massal gagal',
          description: err instanceof Error ? err.message : 'Terjadi kesalahan pada server.',
          variant: 'error',
        });
      } finally {
        setProcessingIds((prev) => {
          const next = { ...prev };
          for (const id of targetIds) delete next[id];
          return next;
        });
      }
    },
    [authHeaders, branches, pushToast]
  );

  const executeBatchMarkFix = useCallback(
    async (payload: BatchMarkFixPayload): Promise<number> => {
      if (payload.branchIds.length === 0) return 0;
      const res = await fetch('/api/branches/batch-edit-sync', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        updatedBranches?: BranchLocation[];
        createdJobs?: GoogleSyncJob[];
        historyEvents?: ChangeHistoryEvent[];
        error?: string;
      };
      if (!res.ok || !Array.isArray(data.updatedBranches)) {
        throw new Error(data.error || 'Gagal menerapkan perbaikan serentak.');
      }

      const updatedMap: Record<string, BranchLocation> = {};
      for (const b of data.updatedBranches) {
        updatedMap[b.id] = b;
      }
      setBranches((prev) => prev.map((b) => updatedMap[b.id] ?? b));
      if (Array.isArray(data.createdJobs) && data.createdJobs.length > 0) {
        setSyncJobs((prev) => [...data.createdJobs!, ...prev]);
      }
      if (Array.isArray(data.historyEvents) && data.historyEvents.length > 0) {
        setChangeHistory((prev) => [...data.historyEvents!, ...prev]);
      }

      const updatedSet = new Set(payload.branchIds);
      setMarkedBranchIds((prev) => prev.filter((id) => !updatedSet.has(id)));

      pushToast({
        title: `${data.updatedBranches.length} lokasi diperbaiki & disinkronkan dalam 1 klik`,
        description:
          payload.submitToGoogleReview !== false
            ? 'Master Data diperbarui bersamaan dan langsung diajukan ke Google Maps.'
            : 'Perubahan Master Data berhasil diterapkan serentak.',
        variant: 'success',
      });

      return data.updatedBranches.length;
    },
    [authHeaders, pushToast]
  );

  const bulkImportMasterCsv = useCallback(
    async (rows: BulkImportRowInput[], submitToGoogleReview: boolean, updateOnly = false) => {
      const res = await fetch('/api/branches/bulk-import', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ rows, submitToGoogleReview, updateOnly }),
      });
      const data = (await res.json()) as {
        updatedCount?: number;
        upgradedCount?: number;
        addedCount?: number;
        skippedCount?: number;
        createdJobsCount?: number;
        branches?: BranchLocation[];
        createdJobs?: GoogleSyncJob[];
        historyEvents?: ChangeHistoryEvent[];
        error?: string;
      };
      if (!res.ok || !Array.isArray(data.branches)) {
        throw new Error(data.error || 'Gagal mengimpor data CSV Master BRI.');
      }

      setBranches(data.branches);
      if (Array.isArray(data.createdJobs) && data.createdJobs.length > 0) {
        setSyncJobs((prev) => [...data.createdJobs!, ...prev]);
      }
      if (Array.isArray(data.historyEvents) && data.historyEvents.length > 0) {
        setChangeHistory((prev) => [...data.historyEvents!, ...prev]);
      }

      const updatedCount = data.updatedCount ?? 0;
      const upgradedCount = data.upgradedCount ?? 0;
      const addedCount = data.addedCount ?? 0;
      const skippedCount = data.skippedCount ?? 0;
      const createdJobsCount = data.createdJobsCount ?? 0;

      pushToast({
        title: `Bulk Import Master Data selesai`,
        description:
          upgradedCount > 0
            ? `${updatedCount} lokasi diperbarui (${upgradedCount} naik status UKO), ${addedCount} titik baru (${createdJobsCount} antrean Google).`
            : `${updatedCount} cabang diperbarui, ${addedCount} cabang baru ditambahkan (${createdJobsCount} antrean sinkron GBP).`,
        variant: 'success',
      });

      return { updatedCount, upgradedCount, addedCount, skippedCount, createdJobsCount };
    },
    [authHeaders, pushToast]
  );

  const downloadMasterCsv = useCallback(
    (opts?: {
      region?: string;
      tier?: string;
      status?: string;
      search?: string;
      templateOnly?: boolean;
    }) => {
      const params = new URLSearchParams();
      if (opts?.region) params.set('region', opts.region);
      if (opts?.tier) params.set('tier', opts.tier);
      if (opts?.status) params.set('status', opts.status);
      if (opts?.search) params.set('search', opts.search);
      if (opts?.templateOnly) params.set('templateOnly', '1');

      const link = document.createElement('a');
      link.href = `/api/branches/export?${params.toString()}`;
      link.download = opts?.templateOnly
        ? 'template_master_lokasi_bri.csv'
        : 'master_lokasi_bri_export.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      pushToast({
        title: opts?.templateOnly ? 'Template CSV diunduh' : 'Master Data CSV dieksport',
        description: 'Format 24 kolom sesuai standar template_lokasi_bri.',
        variant: 'info',
      });
    },
    [pushToast]
  );

  const applyQualityFixes = useCallback(
    async (fixes: QualityFixPayload[], submitToGoogleReview: boolean): Promise<number> => {
      if (fixes.length === 0) return 0;
      const res = await fetch('/api/branches/quality-fix', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ fixes, submitToGoogleReview }),
      });
      const data = (await res.json()) as {
        updatedBranches?: BranchLocation[];
        createdJobs?: GoogleSyncJob[];
        error?: string;
      };
      if (!res.ok || !Array.isArray(data.updatedBranches)) {
        throw new Error(data.error || 'Gagal menerapkan perbaikan kualitas data.');
      }

      const updatedMap: Record<string, BranchLocation> = {};
      for (const b of data.updatedBranches) {
        updatedMap[b.id] = b;
      }
      setBranches((prev) => prev.map((b) => updatedMap[b.id] ?? b));
      if (Array.isArray(data.createdJobs) && data.createdJobs.length > 0) {
        setSyncJobs((prev) => [...data.createdJobs!, ...prev]);
      }
      void refreshHistoryAlerts();

      pushToast({
        title: `${data.updatedBranches.length} unit kerja dikonfirmasi & disinkronkan`,
        description: submitToGoogleReview
          ? 'Master Data BRI diperbarui dan diteruskan untuk penyesuaian Google Maps.'
          : 'Master Data BRI berhasil distandardisasi.',
        variant: 'success',
      });
      return data.updatedBranches.length;
    },
    [authHeaders, pushToast, refreshHistoryAlerts]
  );

  const verifyPendingSyncJobs = useCallback(
    async (
      gbpAccessToken?: string | null,
      jobId?: string
    ): Promise<{ verifiedCount: number; checkedCount: number }> => {
      setIsVerifyingSyncJobs(true);
      try {
        const res = await fetch('/api/sync-jobs/verify-google', {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            jobId: jobId || undefined,
            gbpAccessToken: gbpAccessToken || undefined,
          }),
        });
        const data = (await res.json()) as {
          jobs?: GoogleSyncJob[];
          verifiedCount?: number;
          checkedCount?: number;
          error?: string;
        };
        if (!res.ok || !Array.isArray(data.jobs)) {
          throw new Error(data.error || 'Gagal memverifikasi status Google Maps.');
        }

        const updatedJobs = data.jobs;
        setSyncJobs(updatedJobs);

        const verifiedCount = data.verifiedCount ?? 0;
        const checkedCount = data.checkedCount ?? 0;

        if (verifiedCount > 0) {
          const approvedBranchIds = new Set(
            updatedJobs.filter((j) => j.status === 'approved_live').map((j) => j.branchId)
          );
          setBranches((prev) =>
            prev.map((b) =>
              approvedBranchIds.has(b.id) && b.syncStatus === 'pending_review'
                ? {
                    ...b,
                    syncStatus: 'synced',
                    discrepancies: [],
                    lastSyncedAt: 'Terverifikasi Google',
                  }
                : b
            )
          );
          pushToast({
            title: `${verifiedCount} unit kerja otomatis terkonfirmasi Live`,
            description: 'Data Google Maps telah selaras dengan pembaruan Master Data BRI.',
            variant: 'success',
          });
        } else if (checkedCount > 0 && jobId) {
          pushToast({
            title: 'Pemeriksaan Live Google Maps selesai',
            description: 'Profil publik Google Maps masih menunggu pembaruan dari Google.',
            variant: 'info',
          });
        }

        return { verifiedCount, checkedCount };
      } catch (err) {
        pushToast({
          title: 'Gagal memeriksa status Google Maps',
          description: err instanceof Error ? err.message : 'Terjadi kesalahan saat verifikasi.',
          variant: 'error',
        });
        return { verifiedCount: 0, checkedCount: 0 };
      } finally {
        setIsVerifyingSyncJobs(false);
      }
    },
    [authHeaders, pushToast]
  );

  const fetchLiveGooglePlace = useCallback(
    async (branch: BranchLocation, force = false): Promise<GooglePlaceLiveInfo | null> => {
      if (!force && branch.id in livePlacesCache) {
        return livePlacesCache[branch.id];
      }

      setLoadingPlaceIds((prev) => ({ ...prev, [branch.id]: true }));
      setPlaceErrors((prev) => {
        const next = { ...prev };
        delete next[branch.id];
        return next;
      });

      const query = `BRI ${branch.name} ${branch.city}`.trim();

      try {
        const res = await fetch('/api/maps/places/lookup', {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            branchId: branch.id,
            query,
            lat: branch.lat,
            lng: branch.lng,
          }),
        });

        if (res.status === 429) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
          throw new Error('Kuota Google Maps Places API tercapai.');
        }

        const data = (await res.json()) as {
          configured?: boolean;
          autoSyncedCount?: number;
          place?: GooglePlaceLiveInfo | null;
          error?: string;
          quotaExceeded?: boolean;
        };

        if (data.quotaExceeded) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
          throw new Error('Kuota Google Maps Places API tercapai.');
        }

        if (data.configured && res.ok) {
          const place = data.place ?? null;
          setLivePlacesCache((prev) => ({ ...prev, [branch.id]: place }));
          if (place) {
            setBranches((prev) =>
              prev.map((b) => {
                if (b.id !== branch.id) return b;
                const nextDiscrepancies = buildLiveGoogleDiscrepancies(b, place);
                const nextStatus =
                  nextDiscrepancies.length > 0 && b.syncStatus === 'synced'
                    ? 'discrepancy'
                    : nextDiscrepancies.length === 0 && b.syncStatus === 'discrepancy'
                      ? 'synced'
                      : b.syncStatus;
                return {
                  ...b,
                  googlePlaceId: place.placeId || b.googlePlaceId,
                  googleMapsUri: place.googleMapsUri || b.googleMapsUri,
                  gbpLat: typeof place.lat === 'number' ? place.lat : b.gbpLat,
                  gbpLng: typeof place.lng === 'number' ? place.lng : b.gbpLng,
                  rating: typeof place.rating === 'number' ? place.rating : b.rating,
                  reviewCount:
                    typeof place.userRatingCount === 'number'
                      ? place.userRatingCount
                      : b.reviewCount,
                  discrepancies: nextDiscrepancies,
                  syncStatus: nextStatus,
                };
              })
            );
            if ((data.autoSyncedCount ?? 0) > 0) {
              void refreshReviews();
            }
          }
          return place;
        }

        interface JsPlaceReview {
          authorAttribution?: {
            displayName?: string;
            uri?: string;
            photoURI?: string;
          };
          rating?: number;
          text?: string;
          relativePublishTimeDescription?: string;
          publishTime?: Date;
          googleMapsURI?: string;
        }
        interface JsPlaceResult {
          id: string;
          displayName?: string;
          formattedAddress?: string;
          nationalPhoneNumber?: string;
          regularOpeningHours?: { weekdayDescriptions?: string[] };
          rating?: number;
          userRatingCount?: number;
          reviews?: JsPlaceReview[];
          googleMapsURI?: string;
          location?: { lat: () => number; lng: () => number };
        }
        interface JsPlacesLibrary {
          Place: {
            searchByText: (req: {
              textQuery: string;
              fields: string[];
              locationBias?: { center: { lat: number; lng: number }; radius: number };
              language?: string;
              region?: string;
              maxResultCount?: number;
            }) => Promise<{ places?: JsPlaceResult[] }>;
          };
        }
        const gMaps = (
          window as unknown as {
            google?: {
              maps?: {
                importLibrary?: (lib: string) => Promise<unknown>;
              };
            };
          }
        ).google;
        if (gMaps?.maps?.importLibrary) {
          const placesLib = (await gMaps.maps.importLibrary('places')) as JsPlacesLibrary;
          const { places } = await placesLib.Place.searchByText({
            textQuery: query,
            fields: [
              'id',
              'displayName',
              'formattedAddress',
              'nationalPhoneNumber',
              'regularOpeningHours',
              'rating',
              'userRatingCount',
              'reviews',
              'googleMapsURI',
              'location',
            ],
            locationBias: {
              center: {
                lat: isValidIndonesianCoords(branch.lat, branch.lng) ? branch.lat : -6.2,
                lng: isValidIndonesianCoords(branch.lat, branch.lng) ? branch.lng : 106.8,
              },
              radius: 10000,
            },
            language: 'id',
            region: 'ID',
            maxResultCount: 3,
          });

          const first = places?.[0];
          if (!first) {
            setLivePlacesCache((prev) => ({ ...prev, [branch.id]: null }));
            return null;
          }

          const mappedReviews = (first.reviews ?? []).map((rev: JsPlaceReview, idx: number) => ({
            id: `GMP-${first.id}-${idx}-${rev.publishTime?.toISOString() || idx}`,
            authorName: rev.authorAttribution?.displayName || 'Pengguna Google Maps',
            authorUri: rev.authorAttribution?.uri || undefined,
            authorPhotoUri: rev.authorAttribution?.photoURI || undefined,
            rating: typeof rev.rating === 'number' ? rev.rating : 5,
            text: rev.text || '(Ulasan tanpa teks)',
            relativeTime: rev.relativePublishTimeDescription || 'Dari Google Maps',
            publishTime: rev.publishTime?.toISOString(),
            googleMapsUri: rev.googleMapsURI || first.googleMapsURI || undefined,
          }));

          const livePlace: GooglePlaceLiveInfo = {
            placeId: first.id,
            displayName: first.displayName || query,
            formattedAddress: first.formattedAddress || '',
            nationalPhoneNumber: first.nationalPhoneNumber || undefined,
            weekdayDescriptions: first.regularOpeningHours?.weekdayDescriptions ?? [],
            rating: typeof first.rating === 'number' ? first.rating : undefined,
            userRatingCount:
              typeof first.userRatingCount === 'number' ? first.userRatingCount : undefined,
            googleMapsUri: first.googleMapsURI || undefined,
            lat: first.location?.lat(),
            lng: first.location?.lng(),
            reviews: mappedReviews,
            fetchedAt:
              new Date().toLocaleTimeString('id-ID', {
                hour: '2-digit',
                minute: '2-digit',
              }) + ' WIB',
          };

          setLivePlacesCache((prev) => ({ ...prev, [branch.id]: livePlace }));
          setBranches((prev) =>
            prev.map((b) => {
              if (b.id !== branch.id) return b;
              const nextDiscrepancies = buildLiveGoogleDiscrepancies(b, livePlace);
              const nextStatus =
                nextDiscrepancies.length > 0 && b.syncStatus === 'synced'
                  ? 'discrepancy'
                  : nextDiscrepancies.length === 0 && b.syncStatus === 'discrepancy'
                    ? 'synced'
                    : b.syncStatus;
              return {
                ...b,
                googlePlaceId: livePlace.placeId,
                googleMapsUri: livePlace.googleMapsUri,
                gbpLat: typeof livePlace.lat === 'number' ? livePlace.lat : b.gbpLat,
                gbpLng: typeof livePlace.lng === 'number' ? livePlace.lng : b.gbpLng,
                rating: typeof livePlace.rating === 'number' ? livePlace.rating : b.rating,
                reviewCount:
                  typeof livePlace.userRatingCount === 'number'
                    ? livePlace.userRatingCount
                    : b.reviewCount,
                discrepancies: nextDiscrepancies,
                syncStatus: nextStatus,
              };
            })
          );
          return livePlace;
        }

        throw new Error(data.error || 'Layanan Google Maps Places belum siap.');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Gagal mengambil data dari Google Maps.';
        if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('Quota')) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        setPlaceErrors((prev) => ({ ...prev, [branch.id]: msg }));
        return null;
      } finally {
        setLoadingPlaceIds((prev) => {
          const next = { ...prev };
          delete next[branch.id];
          return next;
        });
      }
    },
    [authHeaders, livePlacesCache]
  );

  const importGoogleReviewsToInbox = useCallback(
    async (branch: BranchLocation, place: GooglePlaceLiveInfo): Promise<number> => {
      if (!place.reviews || place.reviews.length === 0) {
        pushToast({
          title: 'Tidak ada ulasan publik baru',
          description: `${place.displayName} belum mengembalikan ulasan teks dari Google Maps.`,
          variant: 'info',
        });
        return 0;
      }

      const res = await fetch('/api/reviews/import-google', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          branchId: branch.id,
          branchCode: branch.code,
          branchName: branch.name,
          regionShort: branch.regionShort,
          reviews: place.reviews,
        }),
      });

      const data = (await res.json()) as {
        reviews?: CustomerReview[];
        importedCount?: number;
        scannedBranchIds?: string[];
        error?: string;
      };

      if (!res.ok || !Array.isArray(data.reviews)) {
        throw new Error(data.error || 'Gagal menyimpan ulasan Google Maps.');
      }

      setReviews(data.reviews);
      if (Array.isArray(data.scannedBranchIds)) {
        setScannedReviewBranchIds(data.scannedBranchIds);
      }
      const count = data.importedCount ?? place.reviews.length;
      pushToast({
        title: `${count} ulasan Google Maps disinkronkan`,
        description: `Ulasan nasabah untuk ${branch.name} siap dibalas di Kotak Masuk Terpusat.`,
        variant: 'success',
      });
      return count;
    },
    [authHeaders, pushToast]
  );

  const syncBatchGoogleReviews = useCallback(
    async (opts?: {
      regionShort?: string;
      tier?: string;
      limit?: number;
      onlyUncrawled?: boolean;
    }): Promise<{ importedCount: number; scannedNow: number; totalScannedBranches: number }> => {
      const res = await fetch('/api/reviews/sync-batch', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(opts ?? {}),
      });
      const data = (await res.json()) as {
        reviews?: CustomerReview[];
        importedCount?: number;
        scannedNow?: number;
        totalScannedBranches?: number;
        updatedBranches?: BranchLocation[];
        error?: string;
      };
      if (!res.ok || !Array.isArray(data.reviews)) {
        throw new Error(data.error || 'Gagal menarik ulasan Google Maps secara massal.');
      }
      setReviews(data.reviews);
      if (Array.isArray(data.updatedBranches) && data.updatedBranches.length > 0) {
        const upMap = new Map(data.updatedBranches.map((b) => [b.id, b]));
        setBranches((prev) => prev.map((b) => upMap.get(b.id) ?? b));
      }
      // Refresh scanned branch list by syncing state length from server
      const revMeta = await fetch('/api/reviews');
      if (revMeta.ok) {
        const metaJson = (await revMeta.json()) as { scannedBranchIds?: string[] };
        if (Array.isArray(metaJson.scannedBranchIds)) {
          setScannedReviewBranchIds(metaJson.scannedBranchIds);
        }
      }

      const importedCount = data.importedCount ?? 0;
      const scannedNow = data.scannedNow ?? 0;
      const totalScannedBranches = data.totalScannedBranches ?? scannedReviewBranchIds.length;

      pushToast({
        title: `${importedCount} ulasan Google Maps dari ${scannedNow} unit ditarik`,
        description: `Cakupan pemindaian mencapai ${totalScannedBranches.toLocaleString('id-ID')} titik lokasi BRI.`,
        variant: 'success',
      });

      return { importedCount, scannedNow, totalScannedBranches };
    },
    [authHeaders, pushToast, scannedReviewBranchIds.length]
  );

  const syncGbpReviewsCentralized = useCallback(
    async (
      accountName: string,
      locationName: string,
      branchId: string,
      gbpAccessToken: string
    ): Promise<number> => {
      const res = await fetch('/api/gbp/reviews/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${gbpAccessToken}`,
        },
        body: JSON.stringify({ accountName, locationName, branchId }),
      });

      const data = (await res.json()) as {
        reviews?: CustomerReview[];
        importedCount?: number;
        error?: string;
      };
      if (!res.ok || !Array.isArray(data.reviews)) {
        throw new Error(data.error || 'Gagal menarik ulasan dari Google Business Profile API.');
      }
      setReviews(data.reviews);
      const count = data.importedCount ?? 0;
      pushToast({
        title: `${count} ulasan GBP disinkronkan`,
        description: 'Seluruh halaman ulasan Google Business Profile masuk ke kotak balas terpusat.',
        variant: 'success',
      });
      return count;
    },
    [pushToast]
  );

  const syncAllGbpReviews = useCallback(
    async (
      accountName: string,
      locations: Array<{ name: string; title?: string; storeCode?: string }>,
      gbpAccessToken: string
    ): Promise<number> => {
      const res = await fetch('/api/gbp/reviews/sync-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${gbpAccessToken}`,
        },
        body: JSON.stringify({ accountName, locations }),
      });

      const data = (await res.json()) as {
        reviews?: CustomerReview[];
        importedCount?: number;
        locationsSynced?: number;
        error?: string;
      };
      if (!res.ok || !Array.isArray(data.reviews)) {
        throw new Error(data.error || 'Gagal menarik seluruh ulasan dari akun GBP.');
      }
      setReviews(data.reviews);
      const count = data.importedCount ?? 0;
      pushToast({
        title: `${count} ulasan GBP dari ${data.locationsSynced ?? locations.length} lokasi disinkronkan`,
        description: 'Seluruh riwayat ulasan nasabah di akun Google Business siap difilter & dibalas.',
        variant: 'success',
      });
      return count;
    },
    [pushToast]
  );

  const submitReviewReply = useCallback(
    async (reviewId: string, replyText: string, gbpAccessToken?: string | null) => {
      const trimmed = replyText.trim();
      if (!trimmed) return;
      try {
        const res = await fetch(`/api/reviews/${encodeURIComponent(reviewId)}/reply`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            replyText: trimmed,
            gbpAccessToken: gbpAccessToken || undefined,
          }),
        });
        const data = (await res.json()) as {
          review?: CustomerReview;
          publishedToGbp?: boolean;
          error?: string;
        };
        if (!res.ok || !data.review) {
          throw new Error(data.error || 'Gagal menyimpan balasan.');
        }

        const saved = data.review;
        setReviews((prev) => prev.map((rev) => (rev.id === reviewId ? saved : rev)));
        pushToast({
          title: data.publishedToGbp
            ? 'Balasan dipublikasikan ke Google Business Profile'
            : 'Balasan ulasan tersimpan di portal',
          description: 'Status ulasan diperbarui menjadi Sudah Dibalas.',
          variant: 'success',
        });
      } catch (err) {
        pushToast({
          title: 'Gagal mengirim balasan',
          description: err instanceof Error ? err.message : 'Terjadi kesalahan.',
          variant: 'error',
        });
      }
    },
    [authHeaders, pushToast]
  );

  const resolveSecurityAlert = useCallback(
    async (alertId: string, action: 'mitigate' | 'dismiss') => {
      try {
        const res = await fetch(`/api/security/alerts/${encodeURIComponent(alertId)}/resolve`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ action }),
        });
        const data = (await res.json()) as {
          alert?: ListingSecurityAlert;
          branch?: BranchLocation;
          syncJob?: GoogleSyncJob | null;
          historyEvent?: ChangeHistoryEvent | null;
          error?: string;
        };
        if (!res.ok || !data.alert) {
          throw new Error(data.error || 'Gagal memproses alert keamanan.');
        }

        setSecurityAlerts((prev) =>
          prev.map((a) => (a.id === alertId ? data.alert! : a))
        );
        if (data.branch) {
          setBranches((prev) => prev.map((b) => (b.id === data.branch!.id ? data.branch! : b)));
        }
        if (data.syncJob) {
          setSyncJobs((prev) => [data.syncJob!, ...prev]);
        }
        if (data.historyEvent) {
          setChangeHistory((prev) => [data.historyEvent!, ...prev]);
        }

        pushToast({
          title:
            action === 'mitigate'
              ? 'Listing dipulihkan ke Master Data BRI'
              : 'Alert keamanan ditandai terverifikasi',
          description:
            action === 'mitigate'
              ? 'Perubahan tidak sah dibatalkan dan Master Data BRI diajukan ke Google Maps.'
              : 'Alert dicatat sebagai aman pada log audit operasional.',
          variant: action === 'mitigate' ? 'success' : 'info',
        });
      } catch (err) {
        pushToast({
          title: 'Gagal memproses alert keamanan',
          description: err instanceof Error ? err.message : 'Terjadi kesalahan pada server.',
          variant: 'error',
        });
      }
    },
    [authHeaders, pushToast]
  );

  const scanListingSecurity = useCallback(
    async (gbpAccountEmail?: string): Promise<number> => {
      setIsScanningSecurity(true);
      try {
        const res = await fetch('/api/security/scan', {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ gbpAccountEmail }),
        });
        const data = (await res.json()) as {
          securityAlerts?: ListingSecurityAlert[];
          newAlertsCount?: number;
        };
        if (res.ok && Array.isArray(data.securityAlerts)) {
          setSecurityAlerts(data.securityAlerts);
          const count = data.newAlertsCount ?? 0;
          pushToast({
            title:
              count > 0
                ? `${count} potensi perubahan tidak sah baru terdeteksi`
                : 'Pemindaian keamanan listing selesai',
            description:
              count > 0
                ? 'Segera pulihkan ke Master BRI agar informasi nasabah tetap aman.'
                : 'Tidak ditemukan tambahan anomali pengambilalihan akun pada pemindaian ini.',
            variant: count > 0 ? 'warning' : 'success',
          });
          return count;
        }
        return 0;
      } finally {
        setIsScanningSecurity(false);
      }
    },
    [authHeaders, pushToast]
  );

  const resetDemoData = useCallback(async () => {
    try {
      await fetch('/api/ops/reset', { method: 'POST', headers: authHeaders });
      setProcessingIds({});
      setCheckedBranchIds([]);
      setMarkedBranchIds([]);
      setLivePlacesCache({});
      await fetchAllData();
      pushToast({
        title: 'Data operasional dipulihkan',
        description: 'Master Data BRI, antrean sinkronisasi, dan ulasan kembali ke kondisi awal.',
        variant: 'info',
      });
    } catch {
      pushToast({
        title: 'Gagal memulihkan data',
        description: 'Tidak dapat menghubungi server.',
        variant: 'error',
      });
    }
  }, [authHeaders, fetchAllData, pushToast]);

  // Real-time Master Data Quality Audit across all branches
  const qualityAudit = useMemo(() => {
    const items: DataQualityAuditItem[] = [];
    let missingHours = 0;
    let invalidPhone = 0;
    let invalidWebsite = 0;
    let incompleteAddress = 0;
    let invalidCoordinates = 0;
    let gbpMismatch = 0;

    for (const b of displayBranches) {
      const issues: DataQualityAuditItem['issues'] = [];

      // 1. Operating Hours check (weekday & weeklyHours per day)
      const wh = b.weeklyHours;
      let hoursIssueDetail = '';
      if (wh) {
        const openEntries = Object.entries(wh).filter(([, entry]) => entry.open);
        if (openEntries.length === 0) {
          hoursIssueDetail = 'Semua hari (Sen–Min) bertanda Tutup';
        } else {
          const invalidDay = openEntries.find(([, entry]) => !isValidHoursString(entry.hours));
          if (invalidDay) {
            hoursIssueDetail = `Format jam tidak standar: "${invalidDay[1].hours || '-'}"`;
          }
        }
      } else if (!b.operatingHours || !isValidHoursString(b.operatingHours)) {
        hoursIssueDetail = `Tercatat "${b.operatingHours || '-'}" (seharusnya HH:MM - HH:MM WIB)`;
      }

      if (hoursIssueDetail) {
        missingHours++;
        issues.push({
          category: 'missing_hours',
          label: 'Format Jam Operasional',
          detail: hoursIssueDetail,
          suggestedFix: '08:00 - 15:00 WIB',
        });
      }

      // 2. Phone quality check: BRI standard is 1500017; detect missing/non-1500017 or GBP mismatch
      const cleanPhone = (b.phone || '').replace(/[^\d]/g, '');
      const phoneDisc = b.discrepancies.find((d) => d.field === 'phone');

      if (!cleanPhone || cleanPhone !== '1500017') {
        invalidPhone++;
        issues.push({
          category: 'invalid_phone',
          label: 'Nomor Telepon Bukan 1500017',
          detail: cleanPhone
            ? `Tercatat "${b.phone}" (standar call center BRI: 1500017)`
            : 'Nomor telepon kosong pada Master Data BRI',
          suggestedFix: '1500017',
        });
      } else if (phoneDisc) {
        invalidPhone++;
        issues.push({
          category: 'invalid_phone',
          label: 'Selisih Nomor Telepon Google Maps',
          detail: `Master "${b.phone}" ≠ Google Maps "${phoneDisc.gbpValue}"`,
          suggestedFix: '1500017',
        });
      }

      // 3. Website quality check: verify bri.co.id (empty, non-bri.co.id, or GBP mismatch)
      const webVal = (b.website || '').trim();
      const webDisc = b.discrepancies.find((d) => d.field === 'website');
      const webMatchesBri =
        /^https:\/\/(www\.)?bri\.co\.id(\/.*)?$/i.test(webVal);

      if (!webVal || !webMatchesBri) {
        invalidWebsite++;
        issues.push({
          category: 'invalid_website',
          label: !webVal ? 'Website Masih Kosong' : 'Website Belum Sesuai bri.co.id',
          detail: webVal
            ? `Tercatat "${webVal}" (seharusnya https://bri.co.id)`
            : 'Kolom website masih kosong pada Master Data BRI',
          suggestedFix: 'https://bri.co.id',
        });
      } else if (webDisc) {
        invalidWebsite++;
        issues.push({
          category: 'invalid_website',
          label: 'Selisih Tautan Website Google Maps',
          detail: `Master "${webVal}" ≠ Google "${webDisc.gbpValue}"`,
          suggestedFix: 'https://bri.co.id',
        });
      }

      // 4. Address & Postal code check (strictly address/postal recommendation)
      const addrDisc = b.discrepancies.find((d) => d.field === 'address');
      if (!b.postalCode || b.postalCode.trim().length < 5 || b.address.trim().length < 10 || addrDisc) {
        incompleteAddress++;
        issues.push({
          category: 'incomplete_address',
          label: 'Alamat / Kode Pos Belum Lengkap',
          detail: addrDisc
            ? addrDisc.reason
            : !b.postalCode
              ? 'Kode pos masih kosong pada Master Data'
              : 'Detail jalan/kelurahan terlalu singkat',
          suggestedFix: !b.postalCode || b.postalCode.trim().length < 5
            ? 'Lengkapi kode pos 5 digit & detail alamat'
            : b.address,
        });
      }

      // 5. Coordinate accuracy & discrepancy check (strictly coordinate recommendation)
      const coordValid = isValidIndonesianCoords(b.lat, b.lng);
      const coordDisc = b.discrepancies.find((d) => d.field === 'coordinates');
      const lowPrecision =
        coordValid && (Math.abs(b.lat % 1) < 0.0001 || Math.abs(b.lng % 1) < 0.0001);
      const hasGbpCoordOffset =
        coordValid &&
        typeof b.gbpLat === 'number' &&
        typeof b.gbpLng === 'number' &&
        isValidIndonesianCoords(b.gbpLat, b.gbpLng) &&
        calculateDistanceMeters(b.lat, b.lng, b.gbpLat, b.gbpLng) > 15;

      if (!coordValid) {
        invalidCoordinates++;
        issues.push({
          category: 'invalid_coordinates',
          label: 'Koordinat Master Kosong / Tidak Valid',
          detail: `Lat/Lng (${b.lat}, ${b.lng}) berada di luar cakupan wilayah Indonesia`,
          suggestedFix: 'Ambil titik Lat/Lng valid dari Peta Google Maps',
        });
      } else if (lowPrecision) {
        invalidCoordinates++;
        issues.push({
          category: 'invalid_coordinates',
          label: 'Presisi Koordinat Terlalu Rendah',
          detail: `Koordinat (${b.lat}, ${b.lng}) kehilangan presisi desimal`,
          suggestedFix: 'Kalibrasi titik koordinat akurat di Peta',
        });
      } else if (coordDisc || hasGbpCoordOffset) {
        invalidCoordinates++;
        const refLat = b.gbpLat ?? coordDisc?.gbpLat;
        const refLng = b.gbpLng ?? coordDisc?.gbpLng;
        const distLabel =
          typeof refLat === 'number' && typeof refLng === 'number'
            ? formatDistanceId(calculateDistanceMeters(b.lat, b.lng, refLat, refLng))
            : 'perlu cek peta';
        issues.push({
          category: 'invalid_coordinates',
          label: 'Ketidaktepatan Titik Koordinat Maps',
          detail: `Selisih posisi Master BRI vs Google Maps sebesar ${distLabel}`,
          suggestedFix: `Sesuaikan ke (${b.lat.toFixed(5)}, ${b.lng.toFixed(5)})`,
        });
      }

      // 6. Overall GBP / Google Maps Mismatch
      if (b.syncStatus === 'discrepancy' || b.syncStatus === 'action_required') {
        gbpMismatch++;
        const primaryDisc = b.discrepancies[0];
        issues.push({
          category: 'gbp_mismatch',
          label: 'Google Maps Berbeda dari Master BRI',
          detail: primaryDisc?.reason || 'Listing publik Google Maps belum sesuai Master BRI',
          suggestedFix: primaryDisc
            ? `${primaryDisc.fieldLabel}: ${primaryDisc.masterValue}`
            : b.operatingHours,
        });
      }

      if (issues.length > 0) {
        items.push({
          branchId: b.id,
          branchCode: b.code,
          branchName: b.name,
          regionShort: b.regionShort,
          city: b.city,
          issues,
        });
      }
    }

    return {
      items,
      counts: {
        totalFlagged: items.length,
        missingHours,
        invalidPhone,
        invalidWebsite,
        incompleteAddress,
        invalidCoordinates,
        gbpMismatch,
      },
    };
  }, [displayBranches]);

  const kpiStats = useMemo(() => {
    const totalBranches = displayBranches.length;
    let syncedCount = 0;
    let discrepancyCount = 0;
    let actionRequiredCount = 0;
    let pendingReviewCount = 0;
    let processingCount = 0;
    let missingOnMapsCount = 0;
    let registeredOnMapsCount = 0;
    let ratingSum = 0;

    for (const b of displayBranches) {
      ratingSum += b.rating;
      if (b.syncStatus === 'synced') syncedCount++;
      else if (b.syncStatus === 'discrepancy') discrepancyCount++;
      else if (b.syncStatus === 'action_required') actionRequiredCount++;
      else if (b.syncStatus === 'pending_review') pendingReviewCount++;
      else if (b.syncStatus === 'processing') processingCount++;

      const isRegisteredOnMaps =
        Boolean(b.googlePlaceId || b.gbpLocationName || b.existingPoi) && !b.mapsNotFound;
      if (isRegisteredOnMaps) registeredOnMapsCount++;
      else missingOnMapsCount++;
    }

    const syncRate = totalBranches > 0 ? Number(((syncedCount / totalBranches) * 100).toFixed(1)) : 0;
    const avgRating = totalBranches > 0 ? Number((ratingSum / totalBranches).toFixed(2)) : 0;
    const totalReviews = reviews.length;
    const repliedCount = reviews.filter((r) => r.replyStatus === 'replied').length;
    const resolutionRate = totalReviews > 0 ? Math.round((repliedCount / totalReviews) * 100) : 0;
    const waitingSyncCount = discrepancyCount + actionRequiredCount + pendingReviewCount;
    const activeSecurityAlertsCount = securityAlerts.filter((a) => a.status === 'active').length;

    return {
      totalBranches,
      syncedCount,
      discrepancyCount,
      actionRequiredCount,
      pendingReviewCount,
      processingCount,
      missingOnMapsCount,
      registeredOnMapsCount,
      waitingSyncCount,
      activeSecurityAlertsCount,
      syncRate,
      avgRating,
      totalReviews,
      repliedCount,
      resolutionRate,
    };
  }, [displayBranches, reviews, securityAlerts]);

  return (
    <OpsContext.Provider
      value={{
        activeView,
        setActiveView,
        branches: displayBranches,
        isLoadingBranches,
        loadError,
        retryLoadBranches: fetchAllData,
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
        unmarkManyBranches,
        clearMarkedBranches,
        executeBatchMarkFix,
        directoryFilterPreset,
        setDirectoryFilterPreset,
        changeHistory,
        securityAlerts,
        isScanningSecurity,
        refreshHistoryAlerts,
        resolveSecurityAlert,
        scanListingSecurity,
        isBulkSyncOpen,
        openBulkSync,
        closeBulkSync,
        bulkSyncTargetIds,
        syncSingleBranch,
        executeBulkSync,
        pushBranchToGbpLive,
        linkBranchGbp,
        bulkImportMasterCsv,
        downloadMasterCsv,
        applyQualityFixes,
        qualityAudit,
        syncJobs,
        isVerifyingSyncJobs,
        verifyPendingSyncJobs,
        livePlacesCache,
        loadingPlaceIds,
        placeErrors,
        fetchLiveGooglePlace,
        importGoogleReviewsToInbox,
        syncBatchGoogleReviews,
        syncGbpReviewsCentralized,
        syncAllGbpReviews,
        scannedReviewBranchIds,
        reviewsAutoSyncing,
        refreshReviews,
        reviews,
        activeReviewId,
        setActiveReviewId,
        submitReviewReply,
        globalSearch,
        setGlobalSearch,
        resetDemoData,
        toasts,
        pushToast,
        dismissToast,
        mapsApiKey,
        kpiStats,
      }}
    >
      {children}
    </OpsContext.Provider>
  );
}

export function useOps() {
  const ctx = useContext(OpsContext);
  if (!ctx) throw new Error('useOps must be used inside OpsProvider');
  return ctx;
}
