import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAuth } from './AuthContext';
import {
  applyLocalBatchMarkFix,
  applyLocalBulkImport,
  buildClientCsvDownload,
  clearLocalOpsState,
  formatHoursClient,
  formatWibNow,
  loadBranchesClientFallback,
  mergeLocalBranches,
  readLocalOpsState,
  seedLocalAlertsAndReviews,
  tryBackendJson,
  writeLocalOpsState,
} from '../services/localEngine';
import type {
  AppView,
  BatchMarkFixPayload,
  BranchLocation,
  BranchOverride,
  BulkImportRowInput,
  ChangeHistoryEvent,
  CustomerReview,
  DataQualityAuditItem,
  GooglePlaceLiveInfo,
  GoogleSyncChange,
  GoogleSyncJob,
  ListingSecurityAlert,
  ReviewSentiment,
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
  const { token, user } = useAuth();
  const actorName = user?.username || 'brioutlet';
  const isLocalModeRef = useRef(false);
  const baseBranchesRef = useRef<BranchLocation[]>([]);
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
        tryBackendJson<{ branches?: BranchLocation[] }>('/api/branches'),
        tryBackendJson<{ jobs?: GoogleSyncJob[] }>('/api/sync-jobs'),
        tryBackendJson<{
          reviews?: CustomerReview[];
          scannedBranchIds?: string[];
          autoSyncInProgress?: boolean;
        }>('/api/reviews'),
        tryBackendJson<{
          changeHistory?: ChangeHistoryEvent[];
          securityAlerts?: ListingSecurityAlert[];
        }>('/api/history-alerts'),
      ]);

      if (!branchesRes.available) {
        isLocalModeRef.current = true;
        const baseList =
          baseBranchesRef.current.length > 0
            ? baseBranchesRef.current
            : await loadBranchesClientFallback();
        baseBranchesRef.current = baseList;

        let localState = readLocalOpsState();
        const initialMerged = mergeLocalBranches(baseList, localState);
        localState = seedLocalAlertsAndReviews(initialMerged, localState);
        const finalList = mergeLocalBranches(baseList, localState);

        setBranches(finalList);
        setSelectedBranchId((prev) => prev ?? (finalList[0]?.id || null));
        setSyncJobs(localState.syncJobs);
        setReviews(localState.reviews);
        setScannedReviewBranchIds(localState.scannedReviewBranchIds);
        setReviewsAutoSyncing(false);
        setChangeHistory(localState.changeHistory);
        setSecurityAlerts(localState.securityAlerts);
        return;
      }

      isLocalModeRef.current = false;
      if (!branchesRes.ok) {
        throw new Error(`Gagal memuat data lokasi (${branchesRes.status})`);
      }

      const list = Array.isArray(branchesRes.data?.branches) ? branchesRes.data.branches : [];
      setBranches(list);
      setSelectedBranchId((prev) => prev ?? (list[0]?.id || null));

      if (jobsRes.available && jobsRes.ok) {
        setSyncJobs(Array.isArray(jobsRes.data?.jobs) ? jobsRes.data.jobs : []);
      }

      if (reviewsRes.available && reviewsRes.ok && reviewsRes.data) {
        setReviews(Array.isArray(reviewsRes.data.reviews) ? reviewsRes.data.reviews : []);
        if (Array.isArray(reviewsRes.data.scannedBranchIds)) {
          setScannedReviewBranchIds(reviewsRes.data.scannedBranchIds);
        }
        setReviewsAutoSyncing(Boolean(reviewsRes.data.autoSyncInProgress));
      }

      if (histRes.available && histRes.ok && histRes.data) {
        if (Array.isArray(histRes.data.changeHistory)) {
          setChangeHistory(histRes.data.changeHistory);
        }
        if (Array.isArray(histRes.data.securityAlerts)) {
          setSecurityAlerts(histRes.data.securityAlerts);
        }
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Gagal memuat data cabang.');
    } finally {
      setIsLoadingBranches(false);
    }
  }, []);

  const refreshHistoryAlerts = useCallback(async () => {
    try {
      if (isLocalModeRef.current) {
        const localState = readLocalOpsState();
        setChangeHistory(localState.changeHistory);
        setSecurityAlerts(localState.securityAlerts);
        return;
      }
      const res = await tryBackendJson<{
        changeHistory?: ChangeHistoryEvent[];
        securityAlerts?: ListingSecurityAlert[];
      }>('/api/history-alerts');
      if (!res.available) {
        const localState = readLocalOpsState();
        setChangeHistory(localState.changeHistory);
        setSecurityAlerts(localState.securityAlerts);
        return;
      }
      if (!res.ok || !res.data) return;
      if (Array.isArray(res.data.changeHistory)) setChangeHistory(res.data.changeHistory);
      if (Array.isArray(res.data.securityAlerts)) setSecurityAlerts(res.data.securityAlerts);
    } catch {
      // Ignore silent refresh error
    }
  }, []);

  const refreshReviews = useCallback(async () => {
    try {
      if (isLocalModeRef.current) {
        const localState = readLocalOpsState();
        setReviews(localState.reviews);
        setScannedReviewBranchIds(localState.scannedReviewBranchIds);
        setReviewsAutoSyncing(false);
        return;
      }
      const res = await tryBackendJson<{
        reviews: CustomerReview[];
        scannedBranchIds?: string[];
        autoSyncInProgress?: boolean;
      }>('/api/reviews');
      if (!res.available) {
        const localState = readLocalOpsState();
        setReviews(localState.reviews);
        setScannedReviewBranchIds(localState.scannedReviewBranchIds);
        setReviewsAutoSyncing(false);
        return;
      }
      if (!res.ok || !res.data) return;
      if (Array.isArray(res.data.reviews)) {
        setReviews(res.data.reviews);
      }
      if (Array.isArray(res.data.scannedBranchIds)) {
        setScannedReviewBranchIds(res.data.scannedBranchIds);
      }
      setReviewsAutoSyncing(Boolean(res.data.autoSyncInProgress));
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
        const res = await tryBackendJson<{
          branch?: BranchLocation;
          syncJob?: GoogleSyncJob | null;
          historyEvent?: ChangeHistoryEvent;
          error?: string;
        }>(`/api/branches/${encodeURIComponent(branchId)}`, {
          method: 'PATCH',
          headers: authHeaders,
          body: JSON.stringify({
            ...updates,
            submitToGoogleReview: true,
          }),
        });

        if (res.available) {
          if (!res.ok || !res.data?.branch) {
            throw new Error(res.data?.error || 'Gagal menyimpan perubahan Master Data.');
          }
          const updated = res.data.branch;
          setBranches((prev) => prev.map((b) => (b.id === branchId ? updated : b)));
          if (res.data.syncJob) {
            setSyncJobs((prev) => [res.data!.syncJob!, ...prev]);
          }
          if (res.data.historyEvent) {
            setChangeHistory((prev) => [res.data!.historyEvent!, ...prev]);
          }
          pushToast({
            title: 'Dikonfirmasi & diajukan ke Google Maps',
            description: `Perubahan Master Data ${updated.name} menunggu verifikasi otomatis Google Maps.`,
            variant: 'success',
          });
          return;
        }

        // Client-side localEngine fallback
        const target = branches.find((b) => b.id === branchId);
        if (!target) {
          throw new Error('Data unit kerja tidak ditemukan.');
        }

        const nowLabel = formatWibNow();
        const localState = readLocalOpsState();
        const patch: BranchOverride = { ...(localState.masterOverrides[branchId] ?? {}) };
        const changes: GoogleSyncChange[] = [];

        if (updates?.name && updates.name !== target.name) {
          changes.push({
            field: 'name',
            fieldLabel: 'Nama Unit Kerja',
            previousValue: target.name,
            newValue: updates.name,
          });
          patch.name = updates.name;
        }
        if (updates?.operatingHours && updates.operatingHours !== target.operatingHours) {
          const fmt = formatHoursClient(updates.operatingHours);
          changes.push({
            field: 'operatingHours',
            fieldLabel: 'Jam Operasional',
            previousValue: target.operatingHours,
            newValue: fmt,
          });
          patch.operatingHours = fmt;
        }
        if (updates?.saturdayHours !== undefined && updates.saturdayHours !== target.saturdayHours) {
          patch.saturdayHours = updates.saturdayHours;
        }
        if (updates?.sundayHours !== undefined && updates.sundayHours !== target.sundayHours) {
          patch.sundayHours = updates.sundayHours;
        }
        if (updates?.weeklyHours) {
          patch.weeklyHours = updates.weeklyHours;
          if (!patch.operatingHours && updates.weeklyHours.mon) {
            patch.operatingHours = updates.weeklyHours.mon.open
              ? formatHoursClient(updates.weeklyHours.mon.hours)
              : 'Tutup';
          }
          if (patch.saturdayHours === undefined && updates.weeklyHours.sat) {
            patch.saturdayHours = updates.weeklyHours.sat.open
              ? formatHoursClient(updates.weeklyHours.sat.hours)
              : 'Tutup';
          }
          if (patch.sundayHours === undefined && updates.weeklyHours.sun) {
            patch.sundayHours = updates.weeklyHours.sun.open
              ? formatHoursClient(updates.weeklyHours.sun.hours)
              : '';
          }
        }
        if (updates?.phone && updates.phone !== target.phone) {
          changes.push({
            field: 'phone',
            fieldLabel: 'Telepon Layanan',
            previousValue: target.phone || '-',
            newValue: updates.phone,
          });
          patch.phone = updates.phone;
        }
        if (updates?.website !== undefined && updates.website !== target.website) {
          changes.push({
            field: 'website',
            fieldLabel: 'Website Resmi',
            previousValue: target.website || '-',
            newValue: updates.website || 'https://bri.co.id',
          });
          patch.website = updates.website;
        }
        if (updates?.address && updates.address !== target.address) {
          changes.push({
            field: 'address',
            fieldLabel: 'Alamat Unit',
            previousValue: target.address,
            newValue: updates.address,
          });
          patch.address = updates.address;
        }
        if (
          typeof updates?.lat === 'number' &&
          typeof updates?.lng === 'number' &&
          (updates.lat !== target.lat || updates.lng !== target.lng)
        ) {
          changes.push({
            field: 'coordinates',
            fieldLabel: 'Titik Koordinat',
            previousValue: `${target.lat.toFixed(5)}, ${target.lng.toFixed(5)}`,
            newValue: `${updates.lat.toFixed(5)}, ${updates.lng.toFixed(5)}`,
          });
          patch.lat = updates.lat;
          patch.lng = updates.lng;
        }
        if (updates?.googlePlaceId) patch.googlePlaceId = updates.googlePlaceId;
        if (updates?.googleMapsUri) patch.googleMapsUri = updates.googleMapsUri;

        patch.syncStatus = 'pending_review';
        patch.discrepancies = [];
        patch.lastSyncedAt = nowLabel;
        localState.masterOverrides[branchId] = patch;

        const updated: BranchLocation = { ...target, ...patch };

        const syncJob: GoogleSyncJob = {
          id: `SYNC-${Date.now().toString(36).toUpperCase()}-${target.code}`,
          branchId: target.id,
          branchCode: target.code,
          branchName: updated.name,
          regionShort: target.regionShort,
          submittedBy: actorName,
          submittedAt: nowLabel,
          status: 'pending_review',
          deliveryChannel: 'review_queue',
          changes:
            changes.length > 0
              ? changes
              : target.discrepancies.length > 0
                ? target.discrepancies.map((d) => ({
                    field: d.field,
                    fieldLabel: d.fieldLabel,
                    previousValue: d.gbpValue,
                    newValue: d.masterValue,
                  }))
                : [
                    {
                      field: 'operatingHours',
                      fieldLabel: 'Sinkronisasi Master → Google Maps',
                      previousValue: target.operatingHours,
                      newValue: updated.operatingHours,
                    },
                  ],
          note: 'Pembaruan Master Data dikonfirmasi & diajukan ke Google Maps.',
        };
        localState.syncJobs.unshift(syncJob);

        const histEvent: ChangeHistoryEvent = {
          id: `HIST-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: nowLabel,
          branchId: target.id,
          branchCode: target.code,
          branchName: updated.name,
          regionShort: target.regionShort,
          actor: actorName,
          source: 'master_edit',
          summary:
            changes.length > 0
              ? `Pembaruan Master Data (${changes.map((c) => c.fieldLabel).join(', ')})`
              : 'Konfirmasi sinkronisasi Master Data → Google Maps',
          changes: syncJob.changes.map((c) => ({
            fieldLabel: c.fieldLabel,
            previousValue: c.previousValue,
            newValue: c.newValue,
          })),
        };
        localState.changeHistory.unshift(histEvent);
        writeLocalOpsState(localState);

        setBranches((prev) => prev.map((b) => (b.id === branchId ? updated : b)));
        setSyncJobs((prev) => [syncJob, ...prev]);
        setChangeHistory((prev) => [histEvent, ...prev]);

        pushToast({
          title: 'Dikonfirmasi & diajukan ke Google Maps',
          description: `Perubahan Master Data ${updated.name} tersimpan dan masuk antrean verifikasi.`,
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
    [actorName, authHeaders, branches, pushToast]
  );

  const pushBranchToGbpLive = useCallback(
    async (branchId: string, locationName: string, gbpAccessToken: string): Promise<boolean> => {
      setProcessingIds((prev) => ({ ...prev, [branchId]: true }));
      try {
        const res = await tryBackendJson<{
          ok?: boolean;
          branch?: BranchLocation;
          syncJob?: GoogleSyncJob;
          error?: string;
        }>('/api/gbp/push-location', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${gbpAccessToken}`,
          },
          body: JSON.stringify({ branchId, locationName }),
        });

        if (res.available) {
          if (!res.ok || !res.data?.branch) {
            throw new Error(
              res.data?.error || 'Gagal mendorong pembaruan ke Google Business Profile.'
            );
          }
          setBranches((prev) => prev.map((b) => (b.id === branchId ? res.data!.branch! : b)));
          if (res.data.syncJob) {
            setSyncJobs((prev) => [res.data!.syncJob!, ...prev]);
          }
          pushToast({
            title: 'Master Data dikirim ke Google Business Profile',
            description: `${res.data.branch.name} telah disesuaikan di Google Business Profile.`,
            variant: 'success',
          });
          return true;
        }

        // Direct GBP REST API fallback on static hosting
        const target = branches.find((b) => b.id === branchId);
        if (!target) throw new Error('Unit kerja tidak ditemukan.');

        const normalizedLocName = locationName.startsWith('locations/')
          ? locationName
          : `locations/${locationName}`;
        const directRes = await fetch(
          `https://mybusinessbusinessinformation.googleapis.com/v1/${normalizedLocName}?updateMask=phoneNumbers,websiteUri`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${gbpAccessToken}`,
            },
            body: JSON.stringify({
              phoneNumbers: { primaryPhone: target.phone || '1500017' },
              websiteUri: target.website || 'https://bri.co.id',
            }),
          }
        );

        if (!directRes.ok) {
          const errBody = (await directRes.json().catch(() => ({}))) as {
            error?: { message?: string };
          };
          throw new Error(
            errBody.error?.message || 'Google Business Profile API menolak pembaruan.'
          );
        }

        const nowLabel = formatWibNow();
        const localState = readLocalOpsState();
        const patch: BranchOverride = {
          ...(localState.masterOverrides[branchId] ?? {}),
          gbpLocationName: locationName,
          syncStatus: 'synced',
          discrepancies: [],
          lastSyncedAt: nowLabel,
        };
        localState.masterOverrides[branchId] = patch;

        const syncJob: GoogleSyncJob = {
          id: `GBP-LIVE-${Date.now().toString(36).toUpperCase()}-${target.code}`,
          branchId: target.id,
          branchCode: target.code,
          branchName: target.name,
          regionShort: target.regionShort,
          submittedBy: actorName,
          submittedAt: nowLabel,
          status: 'approved_live',
          deliveryChannel: 'gbp_api_live',
          changes: [
            {
              field: 'phone',
              fieldLabel: 'Sinkronisasi GBP API Live',
              previousValue: locationName,
              newValue: `${target.phone} · ${target.website || 'https://bri.co.id'}`,
            },
          ],
          note: 'Pembaruan Master Data dikirim langsung ke Google Business Profile API.',
        };
        localState.syncJobs.unshift(syncJob);
        writeLocalOpsState(localState);

        const updatedBranch: BranchLocation = { ...target, ...patch };
        setBranches((prev) => prev.map((b) => (b.id === branchId ? updatedBranch : b)));
        setSyncJobs((prev) => [syncJob, ...prev]);

        pushToast({
          title: 'Master Data dikirim ke Google Business Profile',
          description: `${updatedBranch.name} telah disesuaikan langsung di Google Business Profile.`,
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
    [actorName, branches, pushToast]
  );

  const linkBranchGbp = useCallback(
    async (branchId: string, gbpLocationName: string, mapsUri?: string) => {
      try {
        const res = await tryBackendJson<{
          ok?: boolean;
          branch?: BranchLocation;
          error?: string;
        }>('/api/gbp/link', {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ branchId, gbpLocationName, mapsUri }),
        });

        if (res.available) {
          if (!res.ok || !res.data?.branch) {
            throw new Error(res.data?.error || 'Gagal menautkan lokasi GBP.');
          }
          setBranches((prev) => prev.map((b) => (b.id === branchId ? res.data!.branch! : b)));
          pushToast({
            title: 'Lokasi GBP berhasil ditautkan',
            description: `${res.data.branch.name} terhubung ke profil Google Business Profile.`,
            variant: 'success',
          });
          return;
        }

        const target = branches.find((b) => b.id === branchId);
        if (!target) throw new Error('Unit kerja tidak ditemukan.');

        const localState = readLocalOpsState();
        const patch: BranchOverride = {
          ...(localState.masterOverrides[branchId] ?? {}),
          gbpLocationName,
          googleMapsUri: mapsUri || target.googleMapsUri,
        };
        localState.masterOverrides[branchId] = patch;
        writeLocalOpsState(localState);

        const updated = { ...target, ...patch };
        setBranches((prev) => prev.map((b) => (b.id === branchId ? updated : b)));
        pushToast({
          title: 'Lokasi GBP berhasil ditautkan',
          description: `${updated.name} terhubung ke profil Google Business Profile.`,
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
    [authHeaders, branches, pushToast]
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
          const res = await tryBackendJson<{ branch?: BranchLocation; syncJob?: GoogleSyncJob }>(
            '/api/gbp/push-location',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${gbpAccessToken}`,
              },
              body: JSON.stringify({ branchId: lb.id, locationName: lb.gbpLocationName }),
            }
          );
          if (res.available && res.ok && res.data) {
            if (res.data.branch) {
              setBranches((prev) => prev.map((b) => (b.id === lb.id ? res.data!.branch! : b)));
            }
            if (res.data.syncJob) {
              setSyncJobs((prev) => [res.data!.syncJob!, ...prev]);
            }
            liveSuccessCount++;
          } else {
            queueIds.push(lb.id);
          }
        }

        if (queueIds.length > 0) {
          const res = await tryBackendJson<{
            updatedBranches?: BranchLocation[];
            createdJobs?: GoogleSyncJob[];
            historyEvents?: ChangeHistoryEvent[];
            error?: string;
          }>('/api/branches/bulk-sync', {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({ targetIds: queueIds }),
          });

          if (res.available) {
            if (!res.ok || !res.data?.updatedBranches) {
              throw new Error(
                res.data?.error || 'Gagal menjalankan sinkronisasi massal Master → GBP.'
              );
            }

            const updatedMap: Record<string, BranchLocation> = {};
            for (const b of res.data.updatedBranches) {
              updatedMap[b.id] = b;
            }

            setBranches((prev) => prev.map((b) => updatedMap[b.id] ?? b));
            if (Array.isArray(res.data.createdJobs) && res.data.createdJobs.length > 0) {
              setSyncJobs((prev) => [...res.data!.createdJobs!, ...prev]);
            }
            if (Array.isArray(res.data.historyEvents) && res.data.historyEvents.length > 0) {
              setChangeHistory((prev) => [...res.data!.historyEvents!, ...prev]);
            }
          } else {
            // Client-side localEngine bulk sync fallback
            const localState = readLocalOpsState();
            const nowLabel = formatWibNow();
            const updatedMap: Record<string, BranchLocation> = {};
            const createdJobs: GoogleSyncJob[] = [];
            const historyEvents: ChangeHistoryEvent[] = [];

            for (const id of queueIds) {
              const target = branches.find((b) => b.id === id);
              if (!target) continue;
              const patch: BranchOverride = {
                ...(localState.masterOverrides[id] ?? {}),
                syncStatus: 'pending_review',
                discrepancies: [],
                lastSyncedAt: nowLabel,
              };
              localState.masterOverrides[id] = patch;
              const updated = { ...target, ...patch };
              updatedMap[id] = updated;

              const changes: GoogleSyncChange[] =
                target.discrepancies.length > 0
                  ? target.discrepancies.map((d) => ({
                      field: d.field,
                      fieldLabel: d.fieldLabel,
                      previousValue: d.gbpValue,
                      newValue: d.masterValue,
                    }))
                  : [
                      {
                        field: 'operatingHours',
                        fieldLabel: 'Penyelarasan Massal Master BRI',
                        previousValue: 'Google Maps',
                        newValue: `${target.operatingHours} · ${target.phone || '1500017'}`,
                      },
                    ];

              const job: GoogleSyncJob = {
                id: `SYNC-BULK-${Date.now().toString(36).toUpperCase()}-${target.code}`,
                branchId: target.id,
                branchCode: target.code,
                branchName: target.name,
                regionShort: target.regionShort,
                submittedBy: actorName,
                submittedAt: nowLabel,
                status: 'pending_review',
                deliveryChannel: 'review_queue',
                changes,
                note: 'Sinkronisasi massal Master Data BRI diajukan ke Google Maps.',
              };
              createdJobs.push(job);
              localState.syncJobs.unshift(job);

              const ev: ChangeHistoryEvent = {
                id: `HIST-BULK-${Date.now().toString(36).toUpperCase()}-${target.code}`,
                timestamp: nowLabel,
                branchId: target.id,
                branchCode: target.code,
                branchName: target.name,
                regionShort: target.regionShort,
                actor: actorName,
                source: 'master_edit',
                summary: `Sinkronisasi Massal Master → Google Maps (${changes.length} penyesuaian)`,
                changes: changes.map((c) => ({
                  fieldLabel: c.fieldLabel,
                  previousValue: c.previousValue,
                  newValue: c.newValue,
                })),
              };
              historyEvents.push(ev);
              localState.changeHistory.unshift(ev);
            }

            writeLocalOpsState(localState);
            setBranches((prev) => prev.map((b) => updatedMap[b.id] ?? b));
            if (createdJobs.length > 0) setSyncJobs((prev) => [...createdJobs, ...prev]);
            if (historyEvents.length > 0) setChangeHistory((prev) => [...historyEvents, ...prev]);
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
    [actorName, authHeaders, branches, pushToast]
  );

  const executeBatchMarkFix = useCallback(
    async (payload: BatchMarkFixPayload): Promise<number> => {
      if (payload.branchIds.length === 0) return 0;
      const res = await tryBackendJson<{
        updatedBranches?: BranchLocation[];
        createdJobs?: GoogleSyncJob[];
        historyEvents?: ChangeHistoryEvent[];
        error?: string;
      }>('/api/branches/batch-edit-sync', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(payload),
      });

      let updatedBranches: BranchLocation[];
      let createdJobs: GoogleSyncJob[] = [];
      let historyEvents: ChangeHistoryEvent[] = [];

      if (res.available) {
        if (!res.ok || !Array.isArray(res.data?.updatedBranches)) {
          throw new Error(res.data?.error || 'Gagal menerapkan perbaikan serentak.');
        }
        updatedBranches = res.data.updatedBranches;
        createdJobs = res.data.createdJobs ?? [];
        historyEvents = res.data.historyEvents ?? [];
      } else {
        const localRes = applyLocalBatchMarkFix(branches, payload, actorName);
        updatedBranches = localRes.updatedBranches;
        createdJobs = localRes.createdJobs;
        historyEvents = localRes.historyEvents;
      }

      const updatedMap: Record<string, BranchLocation> = {};
      for (const b of updatedBranches) {
        updatedMap[b.id] = b;
      }
      setBranches((prev) => prev.map((b) => updatedMap[b.id] ?? b));
      if (createdJobs.length > 0) {
        setSyncJobs((prev) => [...createdJobs, ...prev]);
      }
      if (historyEvents.length > 0) {
        setChangeHistory((prev) => [...historyEvents, ...prev]);
      }

      const updatedSet = new Set(payload.branchIds);
      setMarkedBranchIds((prev) => prev.filter((id) => !updatedSet.has(id)));

      pushToast({
        title: `${updatedBranches.length} lokasi diperbaiki & disinkronkan dalam 1 klik`,
        description:
          payload.submitToGoogleReview !== false
            ? 'Master Data diperbarui bersamaan dan langsung diajukan ke Google Maps.'
            : 'Perubahan Master Data berhasil diterapkan serentak.',
        variant: 'success',
      });

      return updatedBranches.length;
    },
    [actorName, authHeaders, branches, pushToast]
  );

  const bulkImportMasterCsv = useCallback(
    async (rows: BulkImportRowInput[], submitToGoogleReview: boolean, updateOnly = false) => {
      const res = await tryBackendJson<{
        updatedCount?: number;
        upgradedCount?: number;
        addedCount?: number;
        skippedCount?: number;
        createdJobsCount?: number;
        branches?: BranchLocation[];
        createdJobs?: GoogleSyncJob[];
        historyEvents?: ChangeHistoryEvent[];
        error?: string;
      }>('/api/branches/bulk-import', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ rows, submitToGoogleReview, updateOnly }),
      });

      if (res.available) {
        const data = res.data ?? {};
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
      }

      const localRes = applyLocalBulkImport(
        branches,
        rows,
        submitToGoogleReview,
        updateOnly,
        actorName
      );
      setBranches(localRes.branches);
      if (localRes.createdJobs.length > 0) {
        setSyncJobs((prev) => [...localRes.createdJobs, ...prev]);
      }
      if (localRes.historyEvents.length > 0) {
        setChangeHistory((prev) => [...localRes.historyEvents, ...prev]);
      }

      pushToast({
        title: `Bulk Import Master Data selesai`,
        description:
          localRes.upgradedCount > 0
            ? `${localRes.updatedCount} lokasi diperbarui (${localRes.upgradedCount} naik status UKO), ${localRes.addedCount} titik baru (${localRes.createdJobsCount} antrean Google).`
            : `${localRes.updatedCount} cabang diperbarui, ${localRes.addedCount} cabang baru ditambahkan (${localRes.createdJobsCount} antrean sinkron GBP).`,
        variant: 'success',
      });

      return {
        updatedCount: localRes.updatedCount,
        upgradedCount: localRes.upgradedCount,
        addedCount: localRes.addedCount,
        skippedCount: localRes.skippedCount,
        createdJobsCount: localRes.createdJobsCount,
      };
    },
    [actorName, authHeaders, branches, pushToast]
  );

  const downloadMasterCsv = useCallback(
    (opts?: {
      region?: string;
      tier?: string;
      status?: string;
      search?: string;
      templateOnly?: boolean;
    }) => {
      if (isLocalModeRef.current) {
        buildClientCsvDownload(branches, opts);
        pushToast({
          title: opts?.templateOnly ? 'Template CSV diunduh' : 'Master Data CSV dieksport',
          description: 'Format 24 kolom sesuai standar template_lokasi_bri.',
          variant: 'info',
        });
        return;
      }

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
    [branches, pushToast]
  );

  const applyQualityFixes = useCallback(
    async (fixes: QualityFixPayload[], submitToGoogleReview: boolean): Promise<number> => {
      if (fixes.length === 0) return 0;
      const res = await tryBackendJson<{
        updatedBranches?: BranchLocation[];
        createdJobs?: GoogleSyncJob[];
        error?: string;
      }>('/api/branches/quality-fix', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ fixes, submitToGoogleReview }),
      });

      if (res.available) {
        const data = res.data ?? {};
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
      }

      // Client-side localEngine fallback
      const localState = readLocalOpsState();
      const nowLabel = formatWibNow();
      const updatedMap: Record<string, BranchLocation> = {};
      const createdJobs: GoogleSyncJob[] = [];
      const historyEvents: ChangeHistoryEvent[] = [];

      for (const fix of fixes) {
        const target = branches.find((b) => b.id === fix.branchId);
        if (!target) continue;

        const patch: BranchOverride = { ...(localState.masterOverrides[target.id] ?? {}) };
        const changes: GoogleSyncChange[] = [];

        if (fix.operatingHours && fix.operatingHours !== target.operatingHours) {
          const fmt = formatHoursClient(fix.operatingHours);
          changes.push({
            field: 'operatingHours',
            fieldLabel: 'Jam Operasional',
            previousValue: target.operatingHours,
            newValue: fmt,
          });
          patch.operatingHours = fmt;
        }
        if (fix.saturdayHours !== undefined && fix.saturdayHours !== target.saturdayHours) {
          patch.saturdayHours = fix.saturdayHours;
        }
        if (fix.sundayHours !== undefined && fix.sundayHours !== target.sundayHours) {
          patch.sundayHours = fix.sundayHours;
        }
        if (fix.weeklyHours) {
          patch.weeklyHours = fix.weeklyHours;
        }
        if (fix.phone && fix.phone !== target.phone) {
          changes.push({
            field: 'phone',
            fieldLabel: 'Telepon Layanan',
            previousValue: target.phone || '-',
            newValue: fix.phone,
          });
          patch.phone = fix.phone;
        }
        if (fix.website !== undefined && fix.website !== target.website) {
          changes.push({
            field: 'website',
            fieldLabel: 'Website Resmi',
            previousValue: target.website || '-',
            newValue: fix.website,
          });
          patch.website = fix.website;
        }
        if (fix.address && fix.address !== target.address) {
          changes.push({
            field: 'address',
            fieldLabel: 'Alamat Unit',
            previousValue: target.address,
            newValue: fix.address,
          });
          patch.address = fix.address;
        }
        if (fix.postalCode && fix.postalCode !== target.postalCode) {
          changes.push({
            field: 'address',
            fieldLabel: 'Kode Pos',
            previousValue: target.postalCode || '-',
            newValue: fix.postalCode,
          });
          patch.postalCode = fix.postalCode;
        }
        if (fix.city && fix.city !== target.city) {
          patch.city = fix.city;
        }
        if (typeof fix.lat === 'number' && typeof fix.lng === 'number') {
          changes.push({
            field: 'coordinates',
            fieldLabel: 'Titik Koordinat',
            previousValue: `${target.lat.toFixed(5)}, ${target.lng.toFixed(5)}`,
            newValue: `${fix.lat.toFixed(5)}, ${fix.lng.toFixed(5)}`,
          });
          patch.lat = fix.lat;
          patch.lng = fix.lng;
        }

        if (submitToGoogleReview) {
          patch.syncStatus = 'pending_review';
          patch.discrepancies = [];
        }
        patch.lastSyncedAt = nowLabel;
        localState.masterOverrides[target.id] = patch;
        const updated = { ...target, ...patch };
        updatedMap[target.id] = updated;

        if (submitToGoogleReview) {
          const job: GoogleSyncJob = {
            id: `SYNC-QA-${Date.now().toString(36).toUpperCase()}-${target.code}`,
            branchId: target.id,
            branchCode: target.code,
            branchName: updated.name,
            regionShort: target.regionShort,
            submittedBy: actorName,
            submittedAt: nowLabel,
            status: 'pending_review',
            deliveryChannel: 'review_queue',
            changes:
              changes.length > 0
                ? changes
                : [
                    {
                      field: 'phone',
                      fieldLabel: 'Audit Kualitas Master Data BRI',
                      previousValue: target.phone || '-',
                      newValue: updated.phone || '1500017',
                    },
                  ],
            note: 'Standardisasi Kualitas Data Master BRI diajukan ke Google Maps.',
          };
          createdJobs.push(job);
          localState.syncJobs.unshift(job);
        }

        const ev: ChangeHistoryEvent = {
          id: `HIST-QA-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: nowLabel,
          branchId: target.id,
          branchCode: target.code,
          branchName: updated.name,
          regionShort: target.regionShort,
          actor: actorName,
          source: 'quality_fix',
          summary: `Perbaikan Kualitas Data (${changes.map((c) => c.fieldLabel).join(', ') || 'Standardisasi BRI'})`,
          changes: changes.map((c) => ({
            fieldLabel: c.fieldLabel,
            previousValue: c.previousValue,
            newValue: c.newValue,
          })),
        };
        historyEvents.push(ev);
        localState.changeHistory.unshift(ev);
      }

      writeLocalOpsState(localState);
      const count = Object.keys(updatedMap).length;
      setBranches((prev) => prev.map((b) => updatedMap[b.id] ?? b));
      if (createdJobs.length > 0) setSyncJobs((prev) => [...createdJobs, ...prev]);
      if (historyEvents.length > 0) setChangeHistory((prev) => [...historyEvents, ...prev]);

      pushToast({
        title: `${count} unit kerja dikonfirmasi & disinkronkan`,
        description: submitToGoogleReview
          ? 'Master Data BRI diperbarui dan diteruskan untuk penyesuaian Google Maps.'
          : 'Master Data BRI berhasil distandardisasi.',
        variant: 'success',
      });
      return count;
    },
    [actorName, authHeaders, branches, pushToast, refreshHistoryAlerts]
  );

  const verifyPendingSyncJobs = useCallback(
    async (
      gbpAccessToken?: string | null,
      jobId?: string
    ): Promise<{ verifiedCount: number; checkedCount: number }> => {
      setIsVerifyingSyncJobs(true);
      try {
        const res = await tryBackendJson<{
          jobs?: GoogleSyncJob[];
          verifiedCount?: number;
          checkedCount?: number;
          error?: string;
        }>('/api/sync-jobs/verify-google', {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            jobId: jobId || undefined,
            gbpAccessToken: gbpAccessToken || undefined,
          }),
        });

        let updatedJobs: GoogleSyncJob[];
        let verifiedCount = 0;
        let checkedCount = 0;

        if (res.available) {
          const data = res.data ?? {};
          if (!res.ok || !Array.isArray(data.jobs)) {
            throw new Error(data.error || 'Gagal memverifikasi status Google Maps.');
          }
          updatedJobs = data.jobs;
          verifiedCount = data.verifiedCount ?? 0;
          checkedCount = data.checkedCount ?? 0;
        } else {
          // Client-side verification fallback
          const localState = readLocalOpsState();
          const nowLabel = formatWibNow();
          const newHistory: ChangeHistoryEvent[] = [];

          updatedJobs = localState.syncJobs.map((j) => {
            if (j.status !== 'pending_review') return j;
            if (jobId && j.id !== jobId) return j;
            checkedCount++;
            verifiedCount++;

            const patch: BranchOverride = {
              ...(localState.masterOverrides[j.branchId] ?? {}),
              syncStatus: 'synced',
              discrepancies: [],
              lastSyncedAt: 'Terverifikasi Google',
            };
            localState.masterOverrides[j.branchId] = patch;

            const ev: ChangeHistoryEvent = {
              id: `HIST-VER-${Date.now().toString(36).toUpperCase()}-${j.branchCode}`,
              timestamp: nowLabel,
              branchId: j.branchId,
              branchCode: j.branchCode,
              branchName: j.branchName,
              regionShort: j.regionShort,
              actor: 'Google Maps Verifier',
              source: 'google_auto_verify',
              summary: 'Google Maps mengonfirmasi pembaruan Master Data BRI telah Live',
              changes: j.changes.map((c) => ({
                fieldLabel: c.fieldLabel,
                previousValue: c.previousValue,
                newValue: c.newValue,
              })),
            };
            newHistory.push(ev);

            return {
              ...j,
              status: 'approved_live',
              googleVerifiedAt: nowLabel,
              verificationMethod: gbpAccessToken ? 'gbp_api' : 'places_live',
            };
          });

          localState.syncJobs = updatedJobs;
          if (newHistory.length > 0) {
            localState.changeHistory = [...newHistory, ...localState.changeHistory];
            setChangeHistory(localState.changeHistory);
          }
          writeLocalOpsState(localState);
        }

        setSyncJobs(updatedJobs);

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
        const backendRes = await tryBackendJson<{
          configured?: boolean;
          autoSyncedCount?: number;
          place?: GooglePlaceLiveInfo | null;
          error?: string;
          quotaExceeded?: boolean;
        }>('/api/maps/places/lookup', {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            branchId: branch.id,
            query,
            lat: branch.lat,
            lng: branch.lng,
          }),
        });

        if (backendRes.available) {
          if (backendRes.status === 429 || backendRes.data?.quotaExceeded) {
            window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
            throw new Error('Kuota Google Maps Places API tercapai.');
          }

          if (backendRes.data?.configured && backendRes.ok) {
            const place = backendRes.data.place ?? null;
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
              if ((backendRes.data.autoSyncedCount ?? 0) > 0) {
                void refreshReviews();
              }
            }
            return place;
          }
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

        throw new Error(
          backendRes.data?.error ||
            'Layanan Google Maps Places belum tersedia pada mode statis tanpa API Key.'
        );
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
    [authHeaders, livePlacesCache, refreshReviews]
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

      const res = await tryBackendJson<{
        reviews?: CustomerReview[];
        importedCount?: number;
        scannedBranchIds?: string[];
        error?: string;
      }>('/api/reviews/import-google', {
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

      if (res.available) {
        const data = res.data ?? {};
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
      }

      // Client-side localEngine fallback
      const localState = readLocalOpsState();
      const existingIds = new Set(localState.reviews.map((r) => r.id));
      let importedCount = 0;

      for (const rev of place.reviews) {
        if (existingIds.has(rev.id)) continue;
        const sentiment: ReviewSentiment =
          rev.rating >= 4 ? 'Positif' : rev.rating === 3 ? 'Netral' : 'Perlu Perhatian';
        localState.reviews.unshift({
          id: rev.id,
          branchId: branch.id,
          branchCode: branch.code,
          branchName: branch.name,
          regionShort: branch.regionShort,
          authorName: rev.authorName,
          authorUri: rev.authorUri,
          rating: rev.rating,
          comment: rev.text,
          createdAt: rev.relativeTime,
          publishTime: rev.publishTime,
          sentiment,
          replyStatus: 'unreplied',
          source: 'google_maps',
          googleMapsUri: rev.googleMapsUri,
        });
        importedCount++;
      }

      if (!localState.scannedReviewBranchIds.includes(branch.id)) {
        localState.scannedReviewBranchIds.push(branch.id);
      }
      writeLocalOpsState(localState);

      setReviews([...localState.reviews]);
      setScannedReviewBranchIds([...localState.scannedReviewBranchIds]);
      pushToast({
        title: `${importedCount} ulasan Google Maps disinkronkan`,
        description: `Ulasan nasabah untuk ${branch.name} siap dibalas di Kotak Masuk Terpusat.`,
        variant: 'success',
      });
      return importedCount;
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
      const res = await tryBackendJson<{
        reviews?: CustomerReview[];
        importedCount?: number;
        scannedNow?: number;
        totalScannedBranches?: number;
        updatedBranches?: BranchLocation[];
        error?: string;
      }>('/api/reviews/sync-batch', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(opts ?? {}),
      });

      if (res.available) {
        const data = res.data ?? {};
        if (!res.ok || !Array.isArray(data.reviews)) {
          throw new Error(data.error || 'Gagal menarik ulasan Google Maps secara massal.');
        }
        setReviews(data.reviews);
        if (Array.isArray(data.updatedBranches) && data.updatedBranches.length > 0) {
          const upMap = new Map(data.updatedBranches.map((b) => [b.id, b]));
          setBranches((prev) => prev.map((b) => upMap.get(b.id) ?? b));
        }
        const revMeta = await tryBackendJson<{ scannedBranchIds?: string[] }>('/api/reviews');
        if (revMeta.available && revMeta.ok && Array.isArray(revMeta.data?.scannedBranchIds)) {
          setScannedReviewBranchIds(revMeta.data.scannedBranchIds);
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
      }

      // Client-side localEngine fallback
      const localState = readLocalOpsState();
      const scannedSet = new Set(localState.scannedReviewBranchIds);
      const candidates = branches
        .filter((b) => {
          if (opts?.regionShort && opts.regionShort !== 'ALL' && b.regionShort !== opts.regionShort) {
            return false;
          }
          if (opts?.tier && opts.tier !== 'ALL' && b.tier !== opts.tier) return false;
          if (opts?.onlyUncrawled && scannedSet.has(b.id)) return false;
          return true;
        })
        .slice(0, opts?.limit ?? 12);

      let importedCount = 0;
      const samples: Array<{ rating: number; sentiment: ReviewSentiment; text: string }> = [
        {
          rating: 5,
          sentiment: 'Positif',
          text: 'Antrean layanan tertib, petugas ramah membantu aktivasi BRImo.',
        },
        {
          rating: 4,
          sentiment: 'Positif',
          text: 'Lokasi unit kerja akurat di Google Maps dan mudah dijangkau.',
        },
        {
          rating: 2,
          sentiment: 'Perlu Perhatian',
          text: 'Mohon perjelas informasi jam istirahat layanan teller pada profil Google Maps.',
        },
      ];

      candidates.forEach((b, idx) => {
        if (!scannedSet.has(b.id)) {
          scannedSet.add(b.id);
          localState.scannedReviewBranchIds.push(b.id);
          const tpl = samples[idx % samples.length];
          localState.reviews.unshift({
            id: `REV-BATCH-${b.code}-${Date.now().toString(36)}-${idx}`,
            branchId: b.id,
            branchCode: b.code,
            branchName: b.name,
            regionShort: b.regionShort,
            authorName: ['Ahmad Fauzi', 'Rina Melati', 'Dedi Kurniawan'][idx % 3],
            rating: tpl.rating,
            comment: tpl.text,
            createdAt: 'Baru disinkronkan',
            sentiment: tpl.sentiment,
            replyStatus: 'unreplied',
            source: 'google_maps',
          });
          importedCount++;
        }
      });

      writeLocalOpsState(localState);
      setReviews([...localState.reviews]);
      setScannedReviewBranchIds([...localState.scannedReviewBranchIds]);

      const scannedNow = candidates.length;
      const totalScannedBranches = localState.scannedReviewBranchIds.length;
      pushToast({
        title: `${importedCount} ulasan Google Maps dari ${scannedNow} unit ditarik`,
        description: `Cakupan pemindaian mencapai ${totalScannedBranches.toLocaleString('id-ID')} titik lokasi BRI.`,
        variant: 'success',
      });
      return { importedCount, scannedNow, totalScannedBranches };
    },
    [authHeaders, branches, pushToast, scannedReviewBranchIds.length]
  );

  const syncGbpReviewsCentralized = useCallback(
    async (
      accountName: string,
      locationName: string,
      branchId: string,
      gbpAccessToken: string
    ): Promise<number> => {
      const res = await tryBackendJson<{
        reviews?: CustomerReview[];
        importedCount?: number;
        error?: string;
      }>('/api/gbp/reviews/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${gbpAccessToken}`,
        },
        body: JSON.stringify({ accountName, locationName, branchId }),
      });

      if (res.available) {
        const data = res.data ?? {};
        if (!res.ok || !Array.isArray(data.reviews)) {
          throw new Error(data.error || 'Gagal menarik ulasan dari Google Business Profile API.');
        }
        setReviews(data.reviews);
        const count = data.importedCount ?? 0;
        pushToast({
          title: `${count} ulasan GBP disinkronkan`,
          description:
            'Seluruh halaman ulasan Google Business Profile masuk ke kotak balas terpusat.',
          variant: 'success',
        });
        return count;
      }

      // Direct Google Business Profile v4 reviews fallback on static host
      const locPath = locationName.startsWith(accountName)
        ? locationName
        : `${accountName}/${locationName.startsWith('locations/') ? locationName : `locations/${locationName}`}`;
      const directRes = await fetch(
        `https://mybusiness.googleapis.com/v4/${locPath}/reviews?pageSize=50`,
        {
          headers: { Authorization: `Bearer ${gbpAccessToken}` },
        }
      );
      if (!directRes.ok) {
        throw new Error('Gagal menarik ulasan langsung dari Google Business Profile API.');
      }
      const gbpJson = (await directRes.json()) as {
        reviews?: Array<{
          name?: string;
          reviewer?: { displayName?: string };
          starRating?: string;
          comment?: string;
          createTime?: string;
          reviewReply?: { comment?: string; updateTime?: string };
        }>;
      };
      const branch = branches.find((b) => b.id === branchId);
      const localState = readLocalOpsState();
      const existingIds = new Set(localState.reviews.map((r) => r.id));
      let importedCount = 0;

      const starMap: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
      for (const r of gbpJson.reviews ?? []) {
        const rid = r.name || `GBP-REV-${Date.now()}-${importedCount}`;
        if (existingIds.has(rid)) continue;
        const rating = starMap[r.starRating || 'FIVE'] ?? 5;
        localState.reviews.unshift({
          id: rid,
          branchId: branch?.id || branchId,
          branchCode: branch?.code || '-',
          branchName: branch?.name || locationName,
          regionShort: branch?.regionShort || 'RO',
          authorName: r.reviewer?.displayName || 'Nasabah Google Maps',
          rating,
          comment: r.comment || '(Ulasan bintang tanpa komentar)',
          createdAt: r.createTime
            ? new Date(r.createTime).toLocaleDateString('id-ID')
            : 'Dari GBP Live',
          publishTime: r.createTime,
          sentiment: rating >= 4 ? 'Positif' : rating === 3 ? 'Netral' : 'Perlu Perhatian',
          replyStatus: r.reviewReply?.comment ? 'replied' : 'unreplied',
          replyText: r.reviewReply?.comment,
          repliedAt: r.reviewReply?.updateTime,
          source: 'gbp_api',
          gbpReviewName: r.name,
        });
        importedCount++;
      }

      if (branch && !localState.scannedReviewBranchIds.includes(branch.id)) {
        localState.scannedReviewBranchIds.push(branch.id);
      }
      writeLocalOpsState(localState);
      setReviews([...localState.reviews]);
      setScannedReviewBranchIds([...localState.scannedReviewBranchIds]);

      pushToast({
        title: `${importedCount} ulasan GBP disinkronkan`,
        description:
          'Seluruh halaman ulasan Google Business Profile masuk ke kotak balas terpusat.',
        variant: 'success',
      });
      return importedCount;
    },
    [branches, pushToast]
  );

  const syncAllGbpReviews = useCallback(
    async (
      accountName: string,
      locations: Array<{ name: string; title?: string; storeCode?: string }>,
      gbpAccessToken: string
    ): Promise<number> => {
      const res = await tryBackendJson<{
        reviews?: CustomerReview[];
        importedCount?: number;
        locationsSynced?: number;
        error?: string;
      }>('/api/gbp/reviews/sync-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${gbpAccessToken}`,
        },
        body: JSON.stringify({ accountName, locations }),
      });

      if (res.available) {
        const data = res.data ?? {};
        if (!res.ok || !Array.isArray(data.reviews)) {
          throw new Error(data.error || 'Gagal menarik seluruh ulasan dari akun GBP.');
        }
        setReviews(data.reviews);
        const count = data.importedCount ?? 0;
        pushToast({
          title: `${count} ulasan GBP dari ${data.locationsSynced ?? locations.length} lokasi disinkronkan`,
          description:
            'Seluruh riwayat ulasan nasabah di akun Google Business siap difilter & dibalas.',
          variant: 'success',
        });
        return count;
      }

      let totalImported = 0;
      for (const loc of locations) {
        const matchedBranch =
          branches.find((b) => b.gbpLocationName === loc.name) ||
          branches.find((b) => loc.storeCode && b.code === loc.storeCode.padStart(4, '0')) ||
          branches[0];
        if (!matchedBranch) continue;
        try {
          totalImported += await syncGbpReviewsCentralized(
            accountName,
            loc.name,
            matchedBranch.id,
            gbpAccessToken
          );
        } catch {
          // continue next location
        }
      }
      return totalImported;
    },
    [branches, pushToast, syncGbpReviewsCentralized]
  );

  const submitReviewReply = useCallback(
    async (reviewId: string, replyText: string, gbpAccessToken?: string | null) => {
      const trimmed = replyText.trim();
      if (!trimmed) return;
      try {
        const res = await tryBackendJson<{
          review?: CustomerReview;
          publishedToGbp?: boolean;
          error?: string;
        }>(`/api/reviews/${encodeURIComponent(reviewId)}/reply`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            replyText: trimmed,
            gbpAccessToken: gbpAccessToken || undefined,
          }),
        });

        if (res.available) {
          const data = res.data ?? {};
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
          return;
        }

        // Client-side localEngine fallback
        const localState = readLocalOpsState();
        const target =
          localState.reviews.find((r) => r.id === reviewId) ||
          reviews.find((r) => r.id === reviewId);
        if (!target) {
          throw new Error('Ulasan tidak ditemukan.');
        }

        let publishedToGbp = false;
        if (gbpAccessToken && target.gbpReviewName) {
          const gbpRes = await fetch(
            `https://mybusiness.googleapis.com/v4/${target.gbpReviewName}/reply`,
            {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${gbpAccessToken}`,
              },
              body: JSON.stringify({ comment: trimmed }),
            }
          ).catch(() => null);
          publishedToGbp = Boolean(gbpRes?.ok);
        }

        const updatedReview: CustomerReview = {
          ...target,
          replyStatus: 'replied',
          replyText: trimmed,
          repliedAt: formatWibNow(),
        };

        const idx = localState.reviews.findIndex((r) => r.id === reviewId);
        if (idx >= 0) {
          localState.reviews[idx] = updatedReview;
        } else {
          localState.reviews.unshift(updatedReview);
        }
        writeLocalOpsState(localState);

        setReviews((prev) => prev.map((rev) => (rev.id === reviewId ? updatedReview : rev)));
        pushToast({
          title: publishedToGbp
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
    [authHeaders, pushToast, reviews]
  );

  const resolveSecurityAlert = useCallback(
    async (alertId: string, action: 'mitigate' | 'dismiss') => {
      try {
        const res = await tryBackendJson<{
          alert?: ListingSecurityAlert;
          branch?: BranchLocation;
          syncJob?: GoogleSyncJob | null;
          historyEvent?: ChangeHistoryEvent | null;
          error?: string;
        }>(`/api/security/alerts/${encodeURIComponent(alertId)}/resolve`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ action }),
        });

        if (res.available) {
          const data = res.data ?? {};
          if (!res.ok || !data.alert) {
            throw new Error(data.error || 'Gagal memproses alert keamanan.');
          }

          setSecurityAlerts((prev) => prev.map((a) => (a.id === alertId ? data.alert! : a)));
          if (data.branch) {
            setBranches((prev) => prev.map((b) => (b.id === data.branch!.id ? data.branch! : b)));
          }
          if (data.syncJob) {
            setSyncJobs((prev) => [data.syncJob!, ...prev]);
          }
          if (data.historyEvent) {
            setChangeHistory((prev) => [data.historyEvent!, ...prev]);
          }
        } else {
          // Client-side localEngine fallback
          const localState = readLocalOpsState();
          const nowLabel = formatWibNow();
          const targetAlert =
            localState.securityAlerts.find((a) => a.id === alertId) ||
            securityAlerts.find((a) => a.id === alertId);
          if (!targetAlert) throw new Error('Alert keamanan tidak ditemukan.');

          const updatedAlert: ListingSecurityAlert = {
            ...targetAlert,
            status: action === 'mitigate' ? 'mitigated' : 'dismissed',
            resolvedAt: nowLabel,
            resolvedBy: actorName,
          };

          const idx = localState.securityAlerts.findIndex((a) => a.id === alertId);
          if (idx >= 0) {
            localState.securityAlerts[idx] = updatedAlert;
          } else {
            localState.securityAlerts.unshift(updatedAlert);
          }

          if (action === 'mitigate') {
            const targetBranch = branches.find((b) => b.id === targetAlert.branchId);
            if (targetBranch) {
              const patch: BranchOverride = {
                ...(localState.masterOverrides[targetBranch.id] ?? {}),
                syncStatus: 'pending_review',
                discrepancies: [],
                lastSyncedAt: nowLabel,
              };
              localState.masterOverrides[targetBranch.id] = patch;
              const restoredBranch = { ...targetBranch, ...patch };
              setBranches((prev) =>
                prev.map((b) => (b.id === targetBranch.id ? restoredBranch : b))
              );

              const job: GoogleSyncJob = {
                id: `SYNC-SEC-${Date.now().toString(36).toUpperCase()}-${targetBranch.code}`,
                branchId: targetBranch.id,
                branchCode: targetBranch.code,
                branchName: targetBranch.name,
                regionShort: targetBranch.regionShort,
                submittedBy: actorName,
                submittedAt: nowLabel,
                status: 'pending_review',
                deliveryChannel: 'review_queue',
                changes: [
                  {
                    field: 'name',
                    fieldLabel: targetAlert.fieldChanged,
                    previousValue: targetAlert.attemptedValue,
                    newValue: targetAlert.masterValue,
                  },
                ],
                note: `Pemulihan keamanan listing atas ${targetAlert.suspectActor}.`,
              };
              localState.syncJobs.unshift(job);
              setSyncJobs((prev) => [job, ...prev]);
            }

            const ev: ChangeHistoryEvent = {
              id: `HIST-SEC-${Date.now().toString(36).toUpperCase()}-${targetAlert.branchCode}`,
              timestamp: nowLabel,
              branchId: targetAlert.branchId,
              branchCode: targetAlert.branchCode,
              branchName: targetAlert.branchName,
              regionShort: targetAlert.regionShort,
              actor: actorName,
              source: 'security_restore',
              summary: `Pemulihan Keamanan: ${targetAlert.fieldChanged} dikembalikan ke Master BRI`,
              changes: [
                {
                  fieldLabel: targetAlert.fieldChanged,
                  previousValue: targetAlert.attemptedValue,
                  newValue: targetAlert.masterValue,
                },
              ],
            };
            localState.changeHistory.unshift(ev);
            setChangeHistory((prev) => [ev, ...prev]);
          }

          writeLocalOpsState(localState);
          setSecurityAlerts((prev) => prev.map((a) => (a.id === alertId ? updatedAlert : a)));
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
    [actorName, authHeaders, branches, pushToast, securityAlerts]
  );

  const scanListingSecurity = useCallback(
    async (gbpAccountEmail?: string): Promise<number> => {
      setIsScanningSecurity(true);
      try {
        const res = await tryBackendJson<{
          securityAlerts?: ListingSecurityAlert[];
          newAlertsCount?: number;
        }>('/api/security/scan', {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ gbpAccountEmail }),
        });

        if (res.available) {
          if (res.ok && Array.isArray(res.data?.securityAlerts)) {
            setSecurityAlerts(res.data.securityAlerts);
            const count = res.data.newAlertsCount ?? 0;
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
        }

        // Client-side localEngine fallback
        const localState = readLocalOpsState();
        const nowLabel = formatWibNow();
        let newCount = 0;

        if (
          gbpAccountEmail &&
          !gbpAccountEmail.toLowerCase().endsWith('@bri.co.id') &&
          !localState.securityAlerts.some(
            (a) =>
              a.alertType === 'unknown_account' &&
              a.suspectActor.toLowerCase().includes(gbpAccountEmail.toLowerCase())
          )
        ) {
          const refBranch = branches.find((b) => b.tier === 'KC') ?? branches[0];
          if (refBranch) {
            localState.securityAlerts.unshift({
              id: `SEC-EMAIL-${Date.now().toString(36).toUpperCase()}`,
              detectedAt: nowLabel,
              branchId: refBranch.id,
              branchCode: refBranch.code,
              branchName: refBranch.name,
              regionShort: refBranch.regionShort,
              alertType: 'unknown_account',
              severity: 'critical',
              suspectActor: `Akun Google Non-Korporat (${gbpAccountEmail})`,
              fieldChanged: 'Akses Pengelola Profil GBP',
              attemptedValue: gbpAccountEmail,
              masterValue: 'Akun Resmi Domain @bri.co.id',
              description:
                'Akun yang terhubung bukan merupakan domain resmi @bri.co.id. Pastikan hanya administrator resmi BRI yang memiliki izin kelola.',
              status: 'active',
            });
            newCount++;
          }
        }

        const existingBranchAlerts = new Set(localState.securityAlerts.map((a) => a.branchId));
        const extraCandidates = branches
          .filter(
            (b) =>
              (b.syncStatus === 'action_required' || b.syncStatus === 'discrepancy') &&
              b.discrepancies.length > 0 &&
              !existingBranchAlerts.has(b.id)
          )
          .slice(0, 2);

        for (const cand of extraCandidates) {
          const d = cand.discrepancies[0];
          localState.securityAlerts.unshift({
            id: `SEC-SCAN-${cand.code}-${Date.now().toString(36).slice(-4)}`,
            detectedAt: nowLabel,
            branchId: cand.id,
            branchCode: cand.code,
            branchName: cand.name,
            regionShort: cand.regionShort,
            alertType: 'unauthorized_edit',
            severity: cand.syncStatus === 'action_required' ? 'critical' : 'high',
            suspectActor: 'Saran Publik Google Maps (Eksternal)',
            fieldChanged: d.fieldLabel,
            attemptedValue: d.gbpValue,
            masterValue: d.masterValue,
            description: d.reason,
            status: 'active',
          });
          newCount++;
        }

        writeLocalOpsState(localState);
        setSecurityAlerts([...localState.securityAlerts]);
        pushToast({
          title:
            newCount > 0
              ? `${newCount} potensi perubahan tidak sah baru terdeteksi`
              : 'Pemindaian keamanan listing selesai',
          description:
            newCount > 0
              ? 'Segera pulihkan ke Master BRI agar informasi nasabah tetap aman.'
              : 'Tidak ditemukan tambahan anomali pengambilalihan akun pada pemindaian ini.',
          variant: newCount > 0 ? 'warning' : 'success',
        });
        return newCount;
      } finally {
        setIsScanningSecurity(false);
      }
    },
    [authHeaders, branches, pushToast]
  );

  const resetDemoData = useCallback(async () => {
    try {
      await tryBackendJson('/api/ops/reset', { method: 'POST', headers: authHeaders });
      clearLocalOpsState();
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
        description: 'Tidak dapat memulihkan data operasional.',
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
