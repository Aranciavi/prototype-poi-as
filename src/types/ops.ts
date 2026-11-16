export type SyncStatus =
  | 'synced'
  | 'discrepancy'
  | 'action_required'
  | 'processing'
  | 'pending_review';

export type BranchTier = 'RO' | 'KC' | 'KCP' | 'KK' | 'UNIT' | 'SSB' | 'TERAS' | 'LAINNYA';

export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface DailyHoursEntry {
  open: boolean;
  hours: string;
}

export type WeeklyHoursSchedule = Record<DayKey, DailyHoursEntry>;

export interface SyncDiscrepancy {
  field: 'operatingHours' | 'phone' | 'address' | 'name' | 'coordinates' | 'website';
  fieldLabel: string;
  masterValue: string;
  gbpValue: string;
  reason: string;
  gbpLat?: number;
  gbpLng?: number;
}

export interface BranchLocation {
  id: string;
  code: string;
  name: string;
  tier: BranchTier;
  tierLabel: string;
  region: string;
  regionShort: string;
  address: string;
  village?: string;
  district?: string;
  cityCode?: string;
  city: string;
  province: string;
  postalCode: string;
  phone: string;
  website?: string;
  operatingHours: string;
  saturdayHours: string;
  sundayHours?: string;
  weeklyHours?: WeeklyHoursSchedule;
  lat: number;
  lng: number;
  gbpLat?: number;
  gbpLng?: number;
  syncStatus: SyncStatus;
  lastSyncedAt: string;
  rating: number;
  reviewCount: number;
  discrepancies: SyncDiscrepancy[];
  googlePlaceId?: string;
  googleMapsUri?: string;
  gbpLocationName?: string;
  existingPoi?: string;
  mapsNotFound?: boolean;
}

export interface BranchOverride {
  syncStatus?: SyncStatus;
  tier?: BranchTier;
  tierLabel?: string;
  code?: string;
  operatingHours?: string;
  saturdayHours?: string;
  sundayHours?: string;
  weeklyHours?: WeeklyHoursSchedule;
  phone?: string;
  address?: string;
  name?: string;
  postalCode?: string;
  city?: string;
  province?: string;
  website?: string;
  lat?: number;
  lng?: number;
  gbpLat?: number;
  gbpLng?: number;
  lastSyncedAt?: string;
  discrepancies?: SyncDiscrepancy[];
  googlePlaceId?: string;
  googleMapsUri?: string;
  gbpLocationName?: string;
  existingPoi?: string;
  mapsNotFound?: boolean;
}

export interface GooglePlaceReviewItem {
  id: string;
  authorName: string;
  authorUri?: string;
  authorPhotoUri?: string;
  rating: number;
  text: string;
  relativeTime: string;
  publishTime?: string;
  googleMapsUri?: string;
}

export interface GooglePlaceLiveInfo {
  placeId: string;
  displayName: string;
  formattedAddress: string;
  nationalPhoneNumber?: string;
  weekdayDescriptions?: string[];
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  lat?: number;
  lng?: number;
  reviews: GooglePlaceReviewItem[];
  fetchedAt: string;
}

export interface GoogleSyncChange {
  field: 'name' | 'operatingHours' | 'saturdayHours' | 'weeklyHours' | 'phone' | 'address' | 'website' | 'coordinates';
  fieldLabel: string;
  previousValue: string;
  newValue: string;
}

export type GoogleSyncJobStatus = 'pending_review' | 'approved_live';

export interface GoogleSyncJob {
  id: string;
  branchId: string;
  branchCode: string;
  branchName: string;
  regionShort: string;
  submittedBy: string;
  submittedAt: string;
  approvedAt?: string;
  lastCheckedAt?: string;
  verificationNote?: string;
  status: GoogleSyncJobStatus;
  googlePlaceId?: string;
  googleMapsUri?: string;
  gbpLocationName?: string;
  deliveryChannel?: 'gbp_api_live' | 'review_queue';
  changes: GoogleSyncChange[];
  note: string;
}

export type ChangeHistorySource =
  | 'master_edit'
  | 'batch_mark_fix'
  | 'quality_fix'
  | 'bulk_import'
  | 'gbp_push'
  | 'google_auto_verify'
  | 'security_restore';

export interface ChangeHistoryDiff {
  fieldLabel: string;
  previousValue: string;
  newValue: string;
}

export interface ChangeHistoryEvent {
  id: string;
  timestamp: string;
  branchId: string;
  branchCode: string;
  branchName: string;
  regionShort: string;
  actor: string;
  source: ChangeHistorySource;
  summary: string;
  changes: ChangeHistoryDiff[];
}

export type SecurityAlertType =
  | 'takeover_attempt'
  | 'unauthorized_edit'
  | 'suspicious_contact'
  | 'unknown_account';

export type SecurityAlertSeverity = 'critical' | 'high' | 'medium';
export type SecurityAlertStatus = 'active' | 'mitigated' | 'dismissed';

export interface ListingSecurityAlert {
  id: string;
  detectedAt: string;
  branchId: string;
  branchCode: string;
  branchName: string;
  regionShort: string;
  alertType: SecurityAlertType;
  severity: SecurityAlertSeverity;
  suspectActor: string;
  fieldChanged: string;
  attemptedValue: string;
  masterValue: string;
  description: string;
  status: SecurityAlertStatus;
  resolvedBy?: string;
  resolvedAt?: string;
}

export interface BatchMarkFixPayload {
  branchIds: string[];
  applyPhone?: boolean;
  phone?: string;
  applyWebsite?: boolean;
  website?: string;
  applyWeeklyHours?: boolean;
  weeklyHours?: WeeklyHoursSchedule;
  applyTier?: boolean;
  tierRaw?: BranchTier;
  applyPostalCode?: boolean;
  postalCode?: string;
  submitToGoogleReview?: boolean;
}

export type ReviewSentiment = 'Positif' | 'Netral' | 'Perlu Perhatian';
export type ReplyStatus = 'unreplied' | 'replied';

export interface CustomerReview {
  id: string;
  branchId: string;
  branchCode: string;
  branchName: string;
  regionShort: string;
  authorName: string;
  authorUri?: string;
  rating: number;
  comment: string;
  createdAt: string;
  publishTime?: string;
  sentiment: ReviewSentiment;
  replyStatus: ReplyStatus;
  replyText?: string;
  repliedAt?: string;
  source?: 'google_maps' | 'gbp_api' | 'internal';
  googleMapsUri?: string;
  gbpReviewName?: string;
}

export interface ReviewSuggestion {
  tone: 'empatik' | 'prosedural' | 'apresiatif';
  label: string;
  text: string;
}

export interface SyncHistoryPoint {
  day: string;
  syncRate: number;
  resolvedDiscrepancies: number;
  incomingReviews: number;
  repliedReviews: number;
}

export type AppView =
  | 'overview'
  | 'directory'
  | 'data-quality'
  | 'sync-queue'
  | 'reviews'
  | 'history-alerts'
  | 'gbp-connect';

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  variant: 'success' | 'info' | 'warning' | 'error';
}

export interface AuthUser {
  username: string;
  email: string;
  fullName: string;
  role: string;
  verified: boolean;
}

export interface GbpAccount {
  name: string;
  accountName: string;
  type?: string;
  verificationState?: string;
}

export interface GbpLocationSummary {
  name: string;
  title: string;
  storeCode?: string;
  primaryPhone?: string;
  addressLines?: string[];
  locality?: string;
  postalCode?: string;
  websiteUri?: string;
  mapsUri?: string;
  openInfoStatus?: string;
}

export type DataQualityIssueCategory =
  | 'missing_hours'
  | 'invalid_phone'
  | 'invalid_website'
  | 'incomplete_address'
  | 'invalid_coordinates'
  | 'gbp_mismatch';

export interface DataQualityAuditItem {
  branchId: string;
  branchCode: string;
  branchName: string;
  regionShort: string;
  city: string;
  issues: Array<{
    category: DataQualityIssueCategory;
    label: string;
    detail: string;
    suggestedFix?: string;
  }>;
}

export interface BulkImportRowInput {
  region: string;
  name: string;
  code: string;
  tierRaw: string;
  lat: number;
  lng: number;
  address: string;
  village?: string;
  district?: string;
  cityCode?: string;
  city: string;
  province: string;
  postalCode: string;
  phone: string;
  website?: string;
  operatingHours: string;
  saturdayHours: string;
  sundayHours?: string;
  weeklyHours?: WeeklyHoursSchedule;
  existingPoi?: string;
}
