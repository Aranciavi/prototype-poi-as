import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type SyncStatus = 'synced' | 'discrepancy' | 'action_required' | 'pending_review';
type BranchTier = 'RO' | 'KC' | 'KCP' | 'KK' | 'UNIT' | 'SSB' | 'TERAS' | 'LAINNYA';

type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

interface DailyHoursEntry {
  open: boolean;
  hours: string;
}

type WeeklyHoursSchedule = Record<DayKey, DailyHoursEntry>;

interface ServerDiscrepancy {
  field: 'operatingHours' | 'phone' | 'address' | 'name' | 'coordinates' | 'website';
  fieldLabel: string;
  masterValue: string;
  gbpValue: string;
  reason: string;
  gbpLat?: number;
  gbpLng?: number;
}

interface ServerBranch {
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
  discrepancies: ServerDiscrepancy[];
  googlePlaceId?: string;
  googleMapsUri?: string;
  gbpLocationName?: string;
  existingPoi?: string;
  mapsNotFound?: boolean;
}

interface BranchOverrideRecord {
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
  discrepancies?: ServerDiscrepancy[];
  googlePlaceId?: string;
  googleMapsUri?: string;
  gbpLocationName?: string;
  existingPoi?: string;
  mapsNotFound?: boolean;
}

interface StoredUser {
  username: string;
  email: string;
  fullName: string;
  role: string;
  passwordSalt: string;
  passwordHash: string;
  verified: boolean;
  verificationCode?: string;
  verificationExpiresAt?: number;
  createdAt: string;
}

interface StoredSession {
  token: string;
  username: string;
  createdAt: number;
}

interface GoogleSyncChange {
  field: 'name' | 'operatingHours' | 'saturdayHours' | 'weeklyHours' | 'phone' | 'address' | 'website' | 'coordinates';
  fieldLabel: string;
  previousValue: string;
  newValue: string;
}

interface GoogleSyncJob {
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
  status: 'pending_review' | 'approved_live';
  googlePlaceId?: string;
  googleMapsUri?: string;
  gbpLocationName?: string;
  deliveryChannel?: 'gbp_api_live' | 'review_queue';
  changes: GoogleSyncChange[];
  note: string;
}

type ChangeHistorySource =
  | 'master_edit'
  | 'batch_mark_fix'
  | 'quality_fix'
  | 'bulk_import'
  | 'gbp_push'
  | 'google_auto_verify'
  | 'security_restore';

interface ChangeHistoryDiff {
  fieldLabel: string;
  previousValue: string;
  newValue: string;
}

interface ChangeHistoryEvent {
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

interface ListingSecurityAlert {
  id: string;
  detectedAt: string;
  branchId: string;
  branchCode: string;
  branchName: string;
  regionShort: string;
  alertType: 'takeover_attempt' | 'unauthorized_edit' | 'suspicious_contact' | 'unknown_account';
  severity: 'critical' | 'high' | 'medium';
  suspectActor: string;
  fieldChanged: string;
  attemptedValue: string;
  masterValue: string;
  description: string;
  status: 'active' | 'mitigated' | 'dismissed';
  resolvedBy?: string;
  resolvedAt?: string;
}

interface StoredReview {
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
  sentiment: 'Positif' | 'Netral' | 'Perlu Perhatian';
  replyStatus: 'unreplied' | 'replied';
  replyText?: string;
  repliedAt?: string;
  source?: 'google_maps' | 'gbp_api' | 'internal';
  googleMapsUri?: string;
  gbpReviewName?: string;
}

interface PersistedAppState {
  users: StoredUser[];
  sessions: Record<string, StoredSession>;
  masterOverrides: Record<string, BranchOverrideRecord>;
  addedBranches: ServerBranch[];
  gbpLinks: Record<string, string>;
  syncJobs: GoogleSyncJob[];
  changeHistory: ChangeHistoryEvent[];
  securityAlerts: ListingSecurityAlert[];
  reviews: StoredReview[];
  scannedReviewBranchIds: string[];
}

const DEFAULT_REVIEWS: StoredReview[] = [
  {
    id: 'REV-2026-001',
    branchId: 'KC-0329',
    branchCode: '0329',
    branchName: 'KC Jakarta Veteran',
    regionShort: 'RO Jakarta 1',
    authorName: 'Budi Santoso',
    rating: 2,
    comment:
      'Di Google Maps tertulis buka sampai jam 16.30, tapi saat saya datang jam 15.20 loket teller sudah tutup. Mohon info jam operasionalnya diperbarui agar nasabah tidak kecele.',
    createdAt: '2 jam lalu',
    sentiment: 'Perlu Perhatian',
    replyStatus: 'unreplied',
    source: 'internal',
  },
  {
    id: 'REV-2026-002',
    branchId: 'KC-0206',
    branchCode: '0206',
    branchName: 'KC Sudirman Semanggi',
    regionShort: 'RO Jakarta 1',
    authorName: 'Ratna Wijaya',
    rating: 5,
    comment:
      'Pelayanan customer service sangat cepat dan ramah saat saya mengurus penggantian kartu debit. Ruang tunggu bersih dan nomor antrean tertata rapi.',
    createdAt: '4 jam lalu',
    sentiment: 'Positif',
    replyStatus: 'unreplied',
    source: 'internal',
  },
  {
    id: 'REV-2026-003',
    branchId: 'KC-0146',
    branchCode: '0146',
    branchName: 'KC Surabaya Kaliasin',
    regionShort: 'RO Surabaya',
    authorName: 'Hendra Kurniawan',
    rating: 3,
    comment:
      'Nomor telepon cabang yang tercantum di profil Google tidak tersambung waktu saya mau konfirmasi syarat pembukaan rekening giro perusahaan. Untung dibantu oleh petugas satpam saat tiba di lokasi.',
    createdAt: '6 jam lalu',
    sentiment: 'Netral',
    replyStatus: 'unreplied',
    source: 'internal',
  },
  {
    id: 'REV-2026-004',
    branchId: 'KC-0198',
    branchCode: '0198',
    branchName: 'KC Bandung Asia Afrika',
    regionShort: 'RO Bandung',
    authorName: 'Nadia Putri Pratiwi',
    rating: 5,
    comment:
      'Mesin CRM setor tunai 24 jam berfungsi lancar tanpa kendala, parkir juga mudah diakses. Sangat membantu transaksi UMKM sore hari.',
    createdAt: '1 hari lalu',
    sentiment: 'Positif',
    replyStatus: 'replied',
    replyText:
      'Terima kasih Ibu Nadia atas ulasan positifnya. Kami senang layanan mesin CRM dan fasilitas cabang dapat membantu kelancaran transaksi usaha Anda.',
    repliedAt: 'Kemarin, 16:40 WIB',
    source: 'internal',
  },
  {
    id: 'REV-2026-005',
    branchId: 'KC-0053',
    branchCode: '0053',
    branchName: 'KC Medan Putri Hijau',
    regionShort: 'RO Medan',
    authorName: 'Rizky Pratama',
    rating: 2,
    comment:
      'Antrean layanan kredit KUR pagi ini cukup panjang dan kursi tunggu di area luar terasa panas. Semoga penambahan loket prioritas bisa segera dijalankan.',
    createdAt: '1 hari lalu',
    sentiment: 'Perlu Perhatian',
    replyStatus: 'unreplied',
    source: 'internal',
  },
  {
    id: 'REV-2026-006',
    branchId: 'KC-0197',
    branchCode: '0197',
    branchName: 'KC Yogyakarta Cik Ditiro',
    regionShort: 'RO Yogyakarta',
    authorName: 'Dewi Lestari',
    rating: 4,
    comment:
      'Petugas teller sangat teliti menjelaskan biaya transfer valas dan kurs hari ini. Hanya perlu penanda pintu masuk parkir motor yang lebih jelas di Google Maps.',
    createdAt: '1 hari lalu',
    sentiment: 'Positif',
    replyStatus: 'unreplied',
    source: 'internal',
  },
];

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function createSeededUser(
  username: string,
  password: string,
  email: string,
  fullName: string,
  role: string
): StoredUser {
  const salt = crypto.randomBytes(16).toString('hex');
  return {
    username,
    email,
    fullName,
    role,
    passwordSalt: salt,
    passwordHash: hashPassword(password, salt),
    verified: true,
    createdAt: new Date().toISOString(),
  };
}

function formatWibNow(): string {
  return (
    new Date().toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Jakarta',
    }) + ' WIB'
  );
}

function formatGooglePublishTimeWib(isoStr?: string): string | null {
  if (!isoStr || typeof isoStr !== 'string') return null;
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return null;
  return (
    d.toLocaleString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Jakarta',
    }) + ' WIB'
  );
}

const DATA_DIR = path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'app-state.json');

function loadPersistedState(): PersistedAppState {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const defaultState: PersistedAppState = {
    users: [
      createSeededUser(
        'brioutlet',
        '11111',
        'brioutlet@bri.co.id',
        'Operator Outlet BRI',
        'Admin Operasional Jaringan'
      ),
    ],
    sessions: {},
    masterOverrides: {},
    addedBranches: [],
    gbpLinks: {},
    syncJobs: [],
    changeHistory: [],
    securityAlerts: [],
    reviews: DEFAULT_REVIEWS,
    scannedReviewBranchIds: [],
  };

  if (!fs.existsSync(STATE_FILE)) {
    fs.writeFileSync(STATE_FILE, JSON.stringify(defaultState, null, 2), 'utf8');
    return defaultState;
  }

  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<PersistedAppState>;
    const users = Array.isArray(parsed.users) && parsed.users.length > 0 ? parsed.users : defaultState.users;
    if (!users.some((u) => u.username.toLowerCase() === 'brioutlet')) {
      users.unshift(defaultState.users[0]);
    }
    return {
      users,
      sessions: parsed.sessions ?? {},
      masterOverrides: parsed.masterOverrides ?? {},
      addedBranches: Array.isArray(parsed.addedBranches) ? parsed.addedBranches : [],
      gbpLinks: parsed.gbpLinks ?? {},
      syncJobs: Array.isArray(parsed.syncJobs) ? parsed.syncJobs : [],
      changeHistory: Array.isArray(parsed.changeHistory) ? parsed.changeHistory : [],
      securityAlerts: Array.isArray(parsed.securityAlerts) ? parsed.securityAlerts : [],
      reviews: Array.isArray(parsed.reviews) && parsed.reviews.length > 0 ? parsed.reviews : DEFAULT_REVIEWS,
      scannedReviewBranchIds: Array.isArray(parsed.scannedReviewBranchIds)
        ? parsed.scannedReviewBranchIds
        : [],
    };
  } catch {
    return defaultState;
  }
}

let appState: PersistedAppState = loadPersistedState();

function savePersistedState() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(appState, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to persist state:', err);
  }
}

function parseCSV(str: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let val = '';
  let inQuotes = false;

  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    const n = str[i + 1];

    if (inQuotes) {
      if (c === '"' && n === '"') {
        val += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        val += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(val.trim());
        val = '';
      } else if (c === '\r' && n === '\n') {
        row.push(val.trim());
        rows.push(row);
        row = [];
        val = '';
        i++;
      } else if (c === '\n') {
        row.push(val.trim());
        rows.push(row);
        row = [];
        val = '';
      } else {
        val += c;
      }
    }
  }
  if (val.length > 0 || row.length > 0) {
    row.push(val.trim());
    rows.push(row);
  }
  return rows;
}

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function normalizeTier(raw: string): { tier: BranchTier; label: string } {
  const upper = (raw || '').toUpperCase().trim();
  switch (upper) {
    case 'RO':
      return { tier: 'RO', label: 'Regional Office' };
    case 'KC':
      return { tier: 'KC', label: 'Kantor Cabang' };
    case 'KCP':
      return { tier: 'KCP', label: 'Kantor Cabang Pembantu' };
    case 'KK':
      return { tier: 'KK', label: 'Kantor Kas' };
    case 'UNIT':
      return { tier: 'UNIT', label: 'BRI Unit' };
    case 'SSB':
      return { tier: 'SSB', label: 'Sentra Layanan' };
    case 'TERAS':
      return { tier: 'TERAS', label: 'Teras BRI' };
    default:
      return { tier: 'LAINNYA', label: 'Titik Layanan' };
  }
}

function shortenRegion(region: string): string {
  const match = region.match(/Regional Office\s+(.+)$/i);
  if (match) return `RO ${match[1].trim()}`;
  return region;
}

function formatHours(rawHours: string): string {
  const cleaned = (rawHours || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '08:00 - 15:00 WIB';
  const tzMatch = cleaned.match(/\b(WIB|WITA|WIT)\b/i);
  const tz = tzMatch ? tzMatch[1].toUpperCase() : 'WIB';
  const timeMatch = cleaned.match(
    /(\d{1,2})[:.](\d{2})(?:\s*(?:WIB|WITA|WIT))?\s*(?:-|–|—|s\.?\s*d\.?|s\/d|sd)\s*(\d{1,2})[:.](\d{2})/i
  );
  if (timeMatch) {
    const startH = String(Number(timeMatch[1])).padStart(2, '0');
    const startM = timeMatch[2];
    const endH = String(Number(timeMatch[3])).padStart(2, '0');
    const endM = timeMatch[4];
    return `${startH}:${startM} - ${endH}:${endM} ${tz}`;
  }
  if (/wib|wita|wit/i.test(cleaned)) return cleaned;
  return `${cleaned.replace('-', ' - ')} WIB`;
}

function buildWeeklyHoursFromColumns(
  monRaw: string,
  tueRaw: string,
  wedRaw: string,
  thuRaw: string,
  friRaw: string,
  satRaw: string,
  sunRaw: string
): WeeklyHoursSchedule {
  const parseEntry = (raw: string, fallbackOpen: boolean): DailyHoursEntry => {
    const clean = (raw || '').trim();
    if (!clean || /^tutup$/i.test(clean)) {
      return { open: false, hours: 'Tutup' };
    }
    return { open: fallbackOpen || Boolean(clean), hours: formatHours(clean) };
  };
  return {
    mon: parseEntry(monRaw, true),
    tue: parseEntry(tueRaw, true),
    wed: parseEntry(wedRaw, true),
    thu: parseEntry(thuRaw, true),
    fri: parseEntry(friRaw, true),
    sat: parseEntry(satRaw, false),
    sun: parseEntry(sunRaw, false),
  };
}

function loadBranchesFromAsset(): ServerBranch[] {
  const csvPath = path.join(__dirname, 'public', 'assets', 'aistudio', 'template_lokasi_bri__1__4800eb47');
  if (!fs.existsSync(csvPath)) {
    return [];
  }

  const content = fs.readFileSync(csvPath, 'utf8');
  const rows = parseCSV(content);
  const branches: ServerBranch[] = [];
  const seenIds = new Set<string>();

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length < 15) continue;

    const region = r[0];
    const name = r[1];
    const code = r[2] || String(i);
    if (!region.startsWith('Region ') || !name) continue;

    // Support Indonesian comma decimal separators (e.g. "2,68267") and retain out-of-bounds/empty coords for quality detection
    const parsedLat = Number.parseFloat((r[5] || '').replace(',', '.'));
    const parsedLng = Number.parseFloat((r[6] || '').replace(',', '.'));
    const lat = Number.isFinite(parsedLat) ? parsedLat : 0;
    const lng = Number.isFinite(parsedLng) ? parsedLng : 0;

    const { tier, label: tierLabel } = normalizeTier(r[3]);
    const address = r[7] || `${r[8] || ''} ${r[9] || ''}`.trim() || 'Alamat terverifikasi';
    const village = r[8] || '';
    const district = r[9] || '';
    const cityCode = r[10] || '';
    const city = r[11] || 'Indonesia';
    const province = r[12] || '';
    const postalCode = r[13] || '';
    const phone = (r[14] || '').trim();
    const website = (r[15] || '').trim();
    const weeklyHours = buildWeeklyHoursFromColumns(
      r[16] || '08:00-15:00',
      r[17] || r[16] || '08:00-15:00',
      r[18] || r[16] || '08:00-15:00',
      r[19] || r[16] || '08:00-15:00',
      r[20] || r[16] || '08:00-15:00',
      r[21] || '',
      r[22] || ''
    );
    const monHours = weeklyHours.mon.open ? weeklyHours.mon.hours : 'Tutup';
    const satHours = weeklyHours.sat.open ? weeklyHours.sat.hours : 'Tutup';
    const sunHours = weeklyHours.sun.open ? weeklyHours.sun.hours : '';

    let id = `${tier}-${code.padStart(4, '0')}`;
    if (seenIds.has(id)) {
      id = `${tier}-${code.padStart(4, '0')}-${i}`;
    }
    seenIds.add(id);

    const seed = hashSeed(`${id}:${name}`);
    const statusRoll = seed % 100;

    let syncStatus: SyncStatus = 'synced';
    const discrepancies: ServerDiscrepancy[] = [];
    let gbpLat: number | undefined;
    let gbpLng: number | undefined;

    const coordsValid =
      lat !== 0 &&
      lng !== 0 &&
      lat >= -11.5 &&
      lat <= 6.5 &&
      lng >= 94.5 &&
      lng <= 141.5;

    if (!coordsValid) {
      syncStatus = 'action_required';
      discrepancies.push({
        field: 'coordinates',
        fieldLabel: 'Koordinat Lokasi Master',
        masterValue: `${lat}, ${lng}`,
        gbpValue: 'Titik lokasi di Google Maps belum terverifikasi',
        reason: 'Koordinat Latitude/Longitude pada Master Data kosong atau di luar wilayah Indonesia',
      });
    } else if (statusRoll < 8) {
      syncStatus = 'action_required';
      const dLat = (((seed % 7) + 2) * 0.00055) * (seed % 2 === 0 ? 1 : -1);
      const dLng = ((((seed >> 3) % 7) + 2) * 0.00062) * (seed % 3 === 0 ? -1 : 1);
      gbpLat = Number((lat + dLat).toFixed(6));
      gbpLng = Number((lng + dLng).toFixed(6));

      discrepancies.push(
        {
          field: 'operatingHours',
          fieldLabel: 'Penyesuaian Jam Operasional',
          masterValue: monHours,
          gbpValue: '08:00 - 16:30 WIB (Klaim Publik)',
          reason: 'Saran perubahan pengguna Google Maps belum diverifikasi',
        },
        {
          field: 'phone',
          fieldLabel: 'Nomor Telepon Layanan',
          masterValue: phone || '1500017',
          gbpValue: '021-5550199 (Tidak Aktif)',
          reason: 'Nomor telepon lokal pada profil GBP kedaluwarsa',
        },
        {
          field: 'coordinates',
          fieldLabel: 'Titik Koordinat Lokasi',
          masterValue: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
          gbpValue: `${gbpLat.toFixed(5)}, ${gbpLng.toFixed(5)}`,
          reason: 'Pin Google Maps bergeser dari koordinat Master Data BRI',
          gbpLat,
          gbpLng,
        }
      );
    } else if (statusRoll < 22) {
      syncStatus = 'discrepancy';
      const discType = seed % 5;
      if (discType === 0) {
        discrepancies.push({
          field: 'operatingHours',
          fieldLabel: 'Penyesuaian Jam Operasional',
          masterValue: monHours,
          gbpValue: satHours !== 'Tutup' ? `${monHours} · Sabtu Buka` : '08:00 - 15:30 WIB',
          reason: 'Jam layanan kas pada Master Bank berbeda dengan Profil Google',
        });
      } else if (discType === 1) {
        discrepancies.push({
          field: 'address',
          fieldLabel: 'Standardisasi Alamat Unit',
          masterValue: address,
          gbpValue: `${address.split(',')[0]} (Tanpa Kode Pos)`,
          reason: 'Detail kelurahan & kode pos belum lengkap pada listing GBP',
        });
      } else if (discType === 2) {
        discrepancies.push({
          field: 'website',
          fieldLabel: 'Tautan Website Resmi',
          masterValue: website || 'https://bri.co.id',
          gbpValue: 'http://www.bankbri.co.id (Non-HTTPS / Lama)',
          reason: 'URL website pada Google Maps masih mengarah ke tautan lama non-HTTPS',
        });
      } else if (discType === 3) {
        const dLat = (((seed % 5) + 2) * 0.00048) * (seed % 2 === 0 ? 1 : -1);
        const dLng = ((((seed >> 2) % 5) + 2) * 0.00051) * (seed % 3 === 0 ? -1 : 1);
        gbpLat = Number((lat + dLat).toFixed(6));
        gbpLng = Number((lng + dLng).toFixed(6));
        discrepancies.push({
          field: 'coordinates',
          fieldLabel: 'Pergeseran Pin Koordinat',
          masterValue: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
          gbpValue: `${gbpLat.toFixed(5)}, ${gbpLng.toFixed(5)}`,
          reason: 'Titik lokasi publik Google Maps bergeser dari koordinat Master BRI',
          gbpLat,
          gbpLng,
        });
      } else {
        discrepancies.push({
          field: 'name',
          fieldLabel: 'Penamaan Resmi Unit Kerja',
          masterValue: `BRI ${name}`,
          gbpValue: `${name} - Bank Rakyat Indonesia`,
          reason: 'Format penamaan belum mengikuti standar korporat terbaru',
        });
      }
    }

    const dayOffset = seed % 14;
    const hourOffset = seed % 12;
    const lastSyncedAt =
      dayOffset === 0
        ? `Hari ini, ${String(7 + (hourOffset % 10)).padStart(2, '0')}:${String((seed % 50) + 10).padStart(2, '0')} WIB`
        : `${dayOffset} hari lalu`;

    const ratingRaw = 3.9 + ((seed % 11) / 10);
    const rating = Math.min(4.9, Number(ratingRaw.toFixed(1)));
    const reviewCount = tier === 'RO' || tier === 'KC' ? 120 + (seed % 420) : 18 + (seed % 140);

    const existingPoi = (r[23] || '').trim();

    branches.push({
      id,
      code: code.padStart(4, '0'),
      name,
      tier,
      tierLabel,
      region,
      regionShort: shortenRegion(region),
      address,
      village,
      district,
      cityCode,
      city,
      province,
      postalCode,
      phone,
      website,
      operatingHours: monHours,
      saturdayHours: satHours,
      sundayHours: sunHours,
      weeklyHours,
      lat,
      lng,
      gbpLat,
      gbpLng,
      syncStatus,
      lastSyncedAt,
      rating,
      reviewCount,
      discrepancies,
      existingPoi: existingPoi || undefined,
    });
  }

  return branches;
}

const baseBranches = loadBranchesFromAsset();

function recordChangeHistory(event: Omit<ChangeHistoryEvent, 'id' | 'timestamp'>): ChangeHistoryEvent {
  const fullEvent: ChangeHistoryEvent = {
    ...event,
    id: `HIST-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    timestamp: formatWibNow(),
  };
  appState.changeHistory.unshift(fullEvent);
  if (appState.changeHistory.length > 400) {
    appState.changeHistory = appState.changeHistory.slice(0, 400);
  }
  return fullEvent;
}

function seedInitialSecurityAlertsIfEmpty() {
  if (appState.securityAlerts.length > 0) return;
  const now = formatWibNow();
  const candidates = baseBranches
    .filter((b) => b.syncStatus === 'action_required' && b.discrepancies.length > 0)
    .slice(0, 8);

  const actors = [
    'Akun Publik Google Maps (Tidak Dikenal)',
    'Klaim Eksternal Belum Terverifikasi (user-ext-482@gmail.com)',
    'Saran Edit Anonim Google Maps',
    'Pengelola Eksternal Tidak Terdaftar (@bri.co.id non-aktif)',
  ];

  const seeded: ListingSecurityAlert[] = candidates.map((b, idx) => {
    const phoneDisc = b.discrepancies.find((d) => d.field === 'phone');
    const coordDisc = b.discrepancies.find((d) => d.field === 'coordinates');
    const hoursDisc = b.discrepancies.find((d) => d.field === 'operatingHours');

    if (idx % 3 === 0 && phoneDisc) {
      return {
        id: `SEC-INIT-${b.code}`,
        detectedAt: now,
        branchId: b.id,
        branchCode: b.code,
        branchName: b.name,
        regionShort: b.regionShort,
        alertType: 'suspicious_contact',
        severity: 'critical',
        suspectActor: actors[idx % actors.length],
        fieldChanged: 'Nomor Telepon Listing',
        attemptedValue: phoneDisc.gbpValue,
        masterValue: b.phone || '1500017',
        description:
          'Terdeteksi upaya penggantian nomor resmi Call Center BRI (1500017) oleh akun eksternal tidak dikenal pada profil Google Maps.',
        status: 'active',
      };
    }

    if (idx % 3 === 1) {
      return {
        id: `SEC-INIT-${b.code}`,
        detectedAt: now,
        branchId: b.id,
        branchCode: b.code,
        branchName: b.name,
        regionShort: b.regionShort,
        alertType: 'takeover_attempt',
        severity: 'critical',
        suspectActor: actors[idx % actors.length],
        fieldChanged: 'Kepemilikan / Klaim Profil & Koordinat',
        attemptedValue: coordDisc?.gbpValue || 'Permintaan klaim kepemilikan eksternal',
        masterValue: coordDisc?.masterValue || `${b.lat.toFixed(5)}, ${b.lng.toFixed(5)}`,
        description:
          'Akun tidak terdaftar mencoba mengajukan klaim pengambilalihan listing dan menggeser titik pin Google Maps unit kerja.',
        status: 'active',
      };
    }

    return {
      id: `SEC-INIT-${b.code}`,
      detectedAt: now,
      branchId: b.id,
      branchCode: b.code,
      branchName: b.name,
      regionShort: b.regionShort,
      alertType: 'unauthorized_edit',
      severity: 'high',
      suspectActor: actors[idx % actors.length],
      fieldChanged: hoursDisc?.fieldLabel || 'Informasi Profil Publik',
      attemptedValue: hoursDisc?.gbpValue || 'Perubahan tanpa persetujuan Master BRI',
      masterValue: hoursDisc?.masterValue || b.operatingHours,
      description:
        'Terdeteksi perubahan informasi listing di luar alur otorisasi operator resmi Master Data BRI.',
      status: 'active',
    };
  });

  if (seeded.length > 0) {
    appState.securityAlerts = seeded;
    savePersistedState();
  }
}

seedInitialSecurityAlertsIfEmpty();

function normalizeCoreBranchName(raw: string): string {
  return (raw || '')
    .toLowerCase()
    .replace(/\b(pt|bank rakyat indonesia|bank|bri|kantor cabang pembantu|kantor cabang|kantor kas|kacab|kcp|kc|kk|unit|teras|ssb|regional office|ro)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function getMergedBranches(): ServerBranch[] {
  const combined = [...baseBranches, ...(appState.addedBranches ?? [])];
  const overrides = appState.masterOverrides ?? {};
  const gbpLinks = appState.gbpLinks ?? {};
  return combined.map((b) => {
    const ov = overrides[b.id];
    const linkedGbp = gbpLinks[b.id];
    if (!ov && !linkedGbp) return b;
    return {
      ...b,
      ...(ov ?? {}),
      gbpLocationName: ov?.gbpLocationName || linkedGbp || b.gbpLocationName,
    };
  });
}

function escapeCsvCell(val: string | number | undefined): string {
  const str = val === undefined || val === null ? '' : String(val);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function stripWibForCsv(hours: string): string {
  if (!hours || hours === 'Tutup') return '';
  return hours.replace(/\s*WIB|WITA|WIT/gi, '').replace(/\s*-\s*/g, '-').trim();
}

function parseHoursRangeToGbpPeriods(
  hoursStr: string,
  satHoursStr: string,
  weeklyHours?: WeeklyHoursSchedule
) {
  const parsePair = (str: string) => {
    const match = str.match(/(\d{1,2})[:.](\d{2})\s*-\s*(\d{1,2})[:.](\d{2})/);
    if (!match) return { openH: 8, openM: 0, closeH: 15, closeM: 0 };
    return {
      openH: Number(match[1]),
      openM: Number(match[2]),
      closeH: Number(match[3]),
      closeM: Number(match[4]),
    };
  };

  if (weeklyHours) {
    const dayPairs: Array<{ key: DayKey; gbpDay: string }> = [
      { key: 'mon', gbpDay: 'MONDAY' },
      { key: 'tue', gbpDay: 'TUESDAY' },
      { key: 'wed', gbpDay: 'WEDNESDAY' },
      { key: 'thu', gbpDay: 'THURSDAY' },
      { key: 'fri', gbpDay: 'FRIDAY' },
      { key: 'sat', gbpDay: 'SATURDAY' },
      { key: 'sun', gbpDay: 'SUNDAY' },
    ];
    const periods = [];
    for (const d of dayPairs) {
      const entry = weeklyHours[d.key];
      if (entry?.open) {
        const parsed = parsePair(entry.hours);
        periods.push({
          openDay: d.gbpDay,
          openTime: { hours: parsed.openH, minutes: parsed.openM },
          closeDay: d.gbpDay,
          closeTime: { hours: parsed.closeH, minutes: parsed.closeM },
        });
      }
    }
    if (periods.length > 0) return periods;
  }

  const wd = parsePair(hoursStr || '08:00 - 15:00');
  const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
  const periods = days.map((day) => ({
    openDay: day,
    openTime: { hours: wd.openH, minutes: wd.openM },
    closeDay: day,
    closeTime: { hours: wd.closeH, minutes: wd.closeM },
  }));
  if (satHoursStr && satHoursStr !== 'Tutup') {
    const sat = parsePair(satHoursStr);
    periods.push({
      openDay: 'SATURDAY',
      openTime: { hours: sat.openH, minutes: sat.openM },
      closeDay: 'SATURDAY',
      closeTime: { hours: sat.closeH, minutes: sat.closeM },
    });
  }
  return periods;
}

function sanitizeUser(u: StoredUser) {
  return {
    username: u.username,
    email: u.email,
    fullName: u.fullName,
    role: u.role,
    verified: u.verified,
  };
}

function getAuthenticatedUser(req: express.Request): StoredUser | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  const session = appState.sessions[token];
  if (!session) return null;
  const user = appState.users.find((u) => u.username.toLowerCase() === session.username.toLowerCase());
  return user ?? null;
}

const aiClient = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    })
  : null;

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, totalBranches: baseBranches.length });
  });

  // Expose provisioned client Maps API key safely from runtime env if VITE_ prefix wasn't used
  app.get('/api/maps/client-config', (_req, res) => {
    const apiKey =
      process.env.VITE_GOOGLE_MAPS_API_KEY ||
      process.env.GOOGLE_MAPS_API_KEY ||
      '';
    res.json({ apiKey });
  });

  // Auth: Login (username & password)
  app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body ?? {};
    if (typeof username !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'Username dan password wajib diisi.' });
      return;
    }

    const trimmedUser = username.trim().toLowerCase();
    const user = appState.users.find((u) => u.username.toLowerCase() === trimmedUser);
    if (!user) {
      res.status(401).json({ error: 'Username atau password tidak sesuai.' });
      return;
    }

    const computedHash = hashPassword(password, user.passwordSalt);
    if (computedHash !== user.passwordHash) {
      res.status(401).json({ error: 'Username atau password tidak sesuai.' });
      return;
    }

    if (!user.verified) {
      res.status(403).json({
        error: 'Akun Anda belum menyelesaikan verifikasi email.',
        needsVerification: true,
        username: user.username,
        email: user.email,
      });
      return;
    }

    const token = crypto.randomBytes(24).toString('hex');
    appState.sessions[token] = {
      token,
      username: user.username,
      createdAt: Date.now(),
    };
    savePersistedState();

    res.json({
      token,
      user: sanitizeUser(user),
    });
  });

  // Auth: Register ("Tambah Akun") with email & 6-digit verification code
  app.post('/api/auth/register', (req, res) => {
    const { username, email, password, fullName } = req.body ?? {};
    const cleanUsername = typeof username === 'string' ? username.trim() : '';
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const cleanPassword = typeof password === 'string' ? password : '';
    const cleanName = typeof fullName === 'string' && fullName.trim() ? fullName.trim() : cleanUsername;

    if (!/^[a-zA-Z0-9._-]{3,32}$/.test(cleanUsername)) {
      res.status(400).json({
        error: 'Username harus 3–32 karakter (huruf, angka, titik, atau garis bawah).',
      });
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      res.status(400).json({ error: 'Format alamat email tidak valid.' });
      return;
    }

    if (cleanPassword.length < 5) {
      res.status(400).json({ error: 'Password minimal 5 karakter.' });
      return;
    }

    const existingUser = appState.users.find(
      (u) => u.username.toLowerCase() === cleanUsername.toLowerCase()
    );
    if (existingUser && existingUser.verified) {
      res.status(409).json({ error: 'Username sudah terdaftar. Gunakan username lain.' });
      return;
    }

    const existingEmail = appState.users.find(
      (u) => u.email.toLowerCase() === cleanEmail && u.username.toLowerCase() !== cleanUsername.toLowerCase()
    );
    if (existingEmail && existingEmail.verified) {
      res.status(409).json({ error: 'Alamat email sudah digunakan oleh akun lain.' });
      return;
    }

    const code = String(crypto.randomInt(100000, 999999));
    const salt = crypto.randomBytes(16).toString('hex');
    const newUser: StoredUser = {
      username: cleanUsername,
      email: cleanEmail,
      fullName: cleanName,
      role: 'Operator Outlet BRI',
      passwordSalt: salt,
      passwordHash: hashPassword(cleanPassword, salt),
      verified: false,
      verificationCode: code,
      verificationExpiresAt: Date.now() + 15 * 60 * 1000,
      createdAt: new Date().toISOString(),
    };

    if (existingUser && !existingUser.verified) {
      const idx = appState.users.indexOf(existingUser);
      appState.users[idx] = newUser;
    } else {
      appState.users.push(newUser);
    }
    savePersistedState();

    res.status(201).json({
      ok: true,
      requiresVerification: true,
      username: newUser.username,
      email: newUser.email,
      verificationPreview: {
        to: newUser.email,
        subject: `[BRI Sentra Lokasi] Kode Verifikasi Akun: ${code}`,
        code,
        sentAt: formatWibNow(),
      },
    });
  });

  // Auth: Verify Email Code
  app.post('/api/auth/verify-email', (req, res) => {
    const { identifier, code } = req.body ?? {};
    const cleanId = typeof identifier === 'string' ? identifier.trim().toLowerCase() : '';
    const cleanCode = typeof code === 'string' ? code.trim() : '';

    const user = appState.users.find(
      (u) => u.username.toLowerCase() === cleanId || u.email.toLowerCase() === cleanId
    );
    if (!user) {
      res.status(404).json({ error: 'Akun tidak ditemukan.' });
      return;
    }

    if (user.verified) {
      const token = crypto.randomBytes(24).toString('hex');
      appState.sessions[token] = { token, username: user.username, createdAt: Date.now() };
      savePersistedState();
      res.json({ token, user: sanitizeUser(user) });
      return;
    }

    if (!user.verificationCode || user.verificationCode !== cleanCode) {
      res.status(400).json({ error: 'Kode verifikasi tidak cocok. Periksa kembali email Anda.' });
      return;
    }

    if (user.verificationExpiresAt && Date.now() > user.verificationExpiresAt) {
      res.status(400).json({ error: 'Kode verifikasi kedaluwarsa. Silakan kirim ulang kode baru.' });
      return;
    }

    user.verified = true;
    delete user.verificationCode;
    delete user.verificationExpiresAt;

    const token = crypto.randomBytes(24).toString('hex');
    appState.sessions[token] = {
      token,
      username: user.username,
      createdAt: Date.now(),
    };
    savePersistedState();

    res.json({
      token,
      user: sanitizeUser(user),
    });
  });

  // Auth: Resend Verification Code
  app.post('/api/auth/resend-code', (req, res) => {
    const { identifier } = req.body ?? {};
    const cleanId = typeof identifier === 'string' ? identifier.trim().toLowerCase() : '';
    const user = appState.users.find(
      (u) => u.username.toLowerCase() === cleanId || u.email.toLowerCase() === cleanId
    );
    if (!user) {
      res.status(404).json({ error: 'Akun tidak ditemukan.' });
      return;
    }

    const code = String(crypto.randomInt(100000, 999999));
    user.verificationCode = code;
    user.verificationExpiresAt = Date.now() + 15 * 60 * 1000;
    savePersistedState();

    res.json({
      ok: true,
      verificationPreview: {
        to: user.email,
        subject: `[BRI Sentra Lokasi] Kode Verifikasi Baru: ${code}`,
        code,
        sentAt: formatWibNow(),
      },
    });
  });

  app.get('/api/auth/me', (req, res) => {
    const user = getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ error: 'Sesi tidak valid atau telah berakhir.' });
      return;
    }
    res.json({ user: sanitizeUser(user) });
  });

  app.post('/api/auth/logout', (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      delete appState.sessions[token];
      savePersistedState();
    }
    res.json({ ok: true });
  });

  // Branches Master Data
  app.get('/api/branches', (_req, res) => {
    const merged = getMergedBranches();
    res.json({
      total: merged.length,
      branches: merged,
    });
  });

  // Update Master Data BRI & Queue Google Maps Review Sync
  app.patch('/api/branches/:id', (req, res) => {
    const branchId = req.params.id;
    const merged = getMergedBranches();
    const target = merged.find((b) => b.id === branchId);
    if (!target) {
      res.status(404).json({ error: 'Unit kerja tidak ditemukan.' });
      return;
    }

    const user = getAuthenticatedUser(req);
    const submittedBy = user?.username || 'brioutlet';

    const {
      name,
      operatingHours,
      saturdayHours,
      sundayHours,
      weeklyHours,
      phone,
      website,
      address,
      lat,
      lng,
      googlePlaceId,
      googleMapsUri,
      submitToGoogleReview = true,
    } = req.body ?? {};

    const changes: GoogleSyncChange[] = [];
    const overridePatch: BranchOverrideRecord = {
      ...(appState.masterOverrides[branchId] ?? {}),
    };

    if (weeklyHours && typeof weeklyHours === 'object') {
      const wh = weeklyHours as WeeklyHoursSchedule;
      overridePatch.weeklyHours = wh;
      const monHours = wh.mon?.open ? formatHours(wh.mon.hours) : 'Tutup';
      const satHours = wh.sat?.open ? formatHours(wh.sat.hours) : 'Tutup';
      const sunHours = wh.sun?.open ? formatHours(wh.sun.hours) : '';
      overridePatch.operatingHours = monHours;
      overridePatch.saturdayHours = satHours;
      overridePatch.sundayHours = sunHours;

      const dayLabels: Array<{ k: DayKey; l: string }> = [
        { k: 'mon', l: 'Sen' },
        { k: 'tue', l: 'Sel' },
        { k: 'wed', l: 'Rab' },
        { k: 'thu', l: 'Kam' },
        { k: 'fri', l: 'Jum' },
        { k: 'sat', l: 'Sab' },
        { k: 'sun', l: 'Min' },
      ];
      const summarize = (s?: WeeklyHoursSchedule) =>
        s
          ? dayLabels
              .map((d) => `${d.l}: ${s[d.k]?.open ? s[d.k].hours : 'Tutup'}`)
              .join(' | ')
          : target.operatingHours;
      const prevSummary = summarize(target.weeklyHours);
      const nextSummary = summarize(wh);
      if (prevSummary !== nextSummary) {
        changes.push({
          field: 'weeklyHours',
          fieldLabel: 'Jadwal Operasional (Sen–Min)',
          previousValue: prevSummary,
          newValue: nextSummary,
        });
      }
    }

    const fieldMap: Array<{
      key: 'name' | 'operatingHours' | 'saturdayHours' | 'phone' | 'address' | 'website';
      label: string;
      incoming?: unknown;
    }> = [
      { key: 'name', label: 'Nama Unit Kerja', incoming: name },
      { key: 'operatingHours', label: 'Jam Operasional (Sen–Jum)', incoming: weeklyHours ? undefined : operatingHours },
      { key: 'saturdayHours', label: 'Jam Layanan Sabtu', incoming: weeklyHours ? undefined : saturdayHours },
      { key: 'phone', label: 'Telepon Layanan', incoming: phone },
      { key: 'website', label: 'Website Resmi', incoming: website },
      { key: 'address', label: 'Alamat Resmi', incoming: address },
    ];

    for (const item of fieldMap) {
      if (typeof item.incoming === 'string') {
        const cleanVal = item.incoming.trim();
        const prevVal = (target[item.key] as string | undefined) || '';
        if (cleanVal && cleanVal !== prevVal) {
          changes.push({
            field: item.key,
            fieldLabel: item.label,
            previousValue: prevVal || '-',
            newValue: cleanVal,
          });
          overridePatch[item.key] = cleanVal;
        }
      }
    }

    if (typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)) {
      if (lat !== target.lat || lng !== target.lng) {
        changes.push({
          field: 'coordinates',
          fieldLabel: 'Koordinat Lokasi (Lat/Lng)',
          previousValue: `${target.lat}, ${target.lng}`,
          newValue: `${lat}, ${lng}`,
        });
        overridePatch.lat = lat;
        overridePatch.lng = lng;
      }
    }

    if (typeof sundayHours === 'string' && !weeklyHours) {
      overridePatch.sundayHours = sundayHours.trim();
    }
    if (typeof googlePlaceId === 'string' && googlePlaceId.trim()) {
      overridePatch.googlePlaceId = googlePlaceId.trim();
    }
    if (typeof googleMapsUri === 'string' && googleMapsUri.trim()) {
      overridePatch.googleMapsUri = googleMapsUri.trim();
    }

    const nowLabel = formatWibNow();
    let createdJob: GoogleSyncJob | null = null;

    if (submitToGoogleReview) {
      const effectiveChanges: GoogleSyncChange[] =
        changes.length > 0
          ? changes
          : target.discrepancies.map((d) => ({
              field: d.field,
              fieldLabel: d.fieldLabel,
              previousValue: d.gbpValue,
              newValue: d.masterValue,
            }));

      overridePatch.syncStatus = 'pending_review';
      overridePatch.discrepancies = [];
      overridePatch.lastSyncedAt = nowLabel;

      createdJob = {
        id: `SYNC-${Date.now().toString(36).toUpperCase()}`,
        branchId: target.id,
        branchCode: target.code,
        branchName: overridePatch.name || target.name,
        regionShort: target.regionShort,
        submittedBy,
        submittedAt: nowLabel,
        status: 'pending_review',
        googlePlaceId: overridePatch.googlePlaceId || target.googlePlaceId,
        googleMapsUri: overridePatch.googleMapsUri || target.googleMapsUri,
        gbpLocationName: overridePatch.gbpLocationName || target.gbpLocationName,
        deliveryChannel: 'review_queue',
        changes:
          effectiveChanges.length > 0
            ? effectiveChanges
            : [
                {
                  field: 'operatingHours',
                  fieldLabel: 'Sinkronisasi Ulang Profil',
                  previousValue: target.operatingHours,
                  newValue: overridePatch.operatingHours || target.operatingHours,
                },
              ],
        note: 'Master Data BRI diperbarui dan dikirim ke antrean pemantauan perubahan Google Maps.',
      };

      appState.syncJobs.unshift(createdJob);
    }

    appState.masterOverrides[branchId] = overridePatch;

    const historyEvent = recordChangeHistory({
      branchId: target.id,
      branchCode: overridePatch.code || target.code,
      branchName: overridePatch.name || target.name,
      regionShort: target.regionShort,
      actor: submittedBy,
      source: 'master_edit',
      summary:
        changes.length > 0
          ? `Perubahan ${changes.length} atribut Master Data (${changes.map((c) => c.fieldLabel).slice(0, 2).join(', ')})`
          : 'Penyelarasan Master Data BRI → Google Maps',
      changes:
        changes.length > 0
          ? changes.map((c) => ({ fieldLabel: c.fieldLabel, previousValue: c.previousValue, newValue: c.newValue }))
          : [{ fieldLabel: 'Status Sinkronisasi', previousValue: target.syncStatus, newValue: overridePatch.syncStatus || 'pending_review' }],
    });

    savePersistedState();

    const updatedBranch: ServerBranch = {
      ...target,
      ...overridePatch,
    };

    res.json({
      branch: updatedBranch,
      syncJob: createdJob,
      historyEvent,
    });
  });

  // Bulk Sync Master Data BRI -> Google Business Profile / Google Maps (Master is strictly Source of Truth)
  app.post('/api/branches/bulk-sync', (req, res) => {
    const { resolutions, targetIds: rawTargetIds } = req.body ?? {};
    const targetIds: string[] = Array.isArray(rawTargetIds)
      ? rawTargetIds.filter((id): id is string => typeof id === 'string')
      : resolutions && typeof resolutions === 'object'
        ? Object.keys(resolutions as Record<string, unknown>)
        : [];

    if (targetIds.length === 0) {
      res.status(400).json({ error: 'Tidak ada cabang yang dipilih untuk sinkronisasi Master → GBP.' });
      return;
    }

    const user = getAuthenticatedUser(req);
    const submittedBy = user?.username || 'brioutlet';
    const merged = getMergedBranches();
    const nowLabel = formatWibNow();

    const updatedBranches: ServerBranch[] = [];
    const createdJobs: GoogleSyncJob[] = [];
    const historyEvents: ChangeHistoryEvent[] = [];

    for (const id of targetIds) {
      const branch = merged.find((b) => b.id === id);
      if (!branch) continue;

      const patch: BranchOverrideRecord = {
        ...(appState.masterOverrides[id] ?? {}),
        syncStatus: 'pending_review',
        discrepancies: [],
        lastSyncedAt: nowLabel,
      };
      const changes: GoogleSyncChange[] = [];

      for (const disc of branch.discrepancies) {
        if (disc.field !== 'coordinates') {
          changes.push({
            field: disc.field,
            fieldLabel: disc.fieldLabel,
            previousValue: disc.gbpValue,
            newValue: disc.masterValue,
          });
        }
      }

      appState.masterOverrides[id] = patch;
      updatedBranches.push({ ...branch, ...patch });

      const job: GoogleSyncJob = {
        id: `SYNC-${Date.now().toString(36).toUpperCase()}-${branch.code}`,
        branchId: branch.id,
        branchCode: branch.code,
        branchName: patch.name || branch.name,
        regionShort: branch.regionShort,
        submittedBy,
        submittedAt: nowLabel,
        status: 'pending_review',
        googlePlaceId: branch.googlePlaceId,
        googleMapsUri: branch.googleMapsUri,
        gbpLocationName: branch.gbpLocationName,
        deliveryChannel: 'review_queue',
        changes:
          changes.length > 0
            ? changes
            : [
                {
                  field: 'operatingHours',
                  fieldLabel: 'Penyelarasan Master BRI → Google Maps',
                  previousValue: 'Listing Google Maps',
                  newValue: `${branch.operatingHours} · ${branch.phone}`,
                },
              ],
        note: 'Data Google Business Profile diajukan untuk menyesuaikan dengan Master Data BRI.',
      };
      createdJobs.push(job);
      appState.syncJobs.unshift(job);

      historyEvents.push(
        recordChangeHistory({
          branchId: branch.id,
          branchCode: branch.code,
          branchName: patch.name || branch.name,
          regionShort: branch.regionShort,
          actor: submittedBy,
          source: 'master_edit',
          summary: 'Sinkronisasi massal Master Data BRI → Google Maps',
          changes: job.changes.map((c) => ({
            fieldLabel: c.fieldLabel,
            previousValue: c.previousValue,
            newValue: c.newValue,
          })),
        })
      );
    }

    savePersistedState();
    res.json({ updatedBranches, createdJobs, historyEvents });
  });

  // One-click Batch Edit & Sync for marked locations (Requirement 1)
  app.post('/api/branches/batch-edit-sync', (req, res) => {
    const {
      branchIds,
      applyPhone,
      phone,
      applyWebsite,
      website,
      applyWeeklyHours,
      weeklyHours,
      applyTier,
      tierRaw,
      applyPostalCode,
      postalCode,
      submitToGoogleReview = true,
    } = req.body ?? {};

    if (!Array.isArray(branchIds) || branchIds.length === 0) {
      res.status(400).json({ error: 'Pilih atau tandai minimal satu lokasi unit kerja terlebih dahulu.' });
      return;
    }

    const user = getAuthenticatedUser(req);
    const submittedBy = user?.username || 'brioutlet';
    const nowLabel = formatWibNow();
    const merged = getMergedBranches();

    const updatedBranches: ServerBranch[] = [];
    const createdJobs: GoogleSyncJob[] = [];
    const historyEvents: ChangeHistoryEvent[] = [];

    for (const rawId of branchIds) {
      if (typeof rawId !== 'string') continue;
      const target = merged.find((b) => b.id === rawId);
      if (!target) continue;

      const patch: BranchOverrideRecord = {
        ...(appState.masterOverrides[target.id] ?? {}),
      };
      const changes: GoogleSyncChange[] = [];

      if (applyPhone && typeof phone === 'string' && phone.trim()) {
        const cleanPhone = phone.trim();
        if (cleanPhone !== target.phone) {
          changes.push({
            field: 'phone',
            fieldLabel: 'Telepon Layanan',
            previousValue: target.phone || '-',
            newValue: cleanPhone,
          });
        }
        patch.phone = cleanPhone;
      }

      if (applyWebsite && typeof website === 'string' && website.trim()) {
        const cleanWeb = website.trim();
        if (cleanWeb !== (target.website || '')) {
          changes.push({
            field: 'website',
            fieldLabel: 'Website Resmi',
            previousValue: target.website || '-',
            newValue: cleanWeb,
          });
        }
        patch.website = cleanWeb;
      }

      if (applyWeeklyHours && weeklyHours && typeof weeklyHours === 'object') {
        const wh = weeklyHours as WeeklyHoursSchedule;
        const monHours = wh.mon?.open ? formatHours(wh.mon.hours) : 'Tutup';
        const satHours = wh.sat?.open ? formatHours(wh.sat.hours) : 'Tutup';
        const sunHours = wh.sun?.open ? formatHours(wh.sun.hours) : '';
        patch.weeklyHours = wh;
        patch.operatingHours = monHours;
        patch.saturdayHours = satHours;
        patch.sundayHours = sunHours;
        changes.push({
          field: 'weeklyHours',
          fieldLabel: 'Jadwal Operasional (Sen–Min)',
          previousValue: target.operatingHours,
          newValue: `${monHours} (Sab: ${satHours})`,
        });
      }

      if (applyTier && typeof tierRaw === 'string' && tierRaw.trim()) {
        const normalized = normalizeTier(tierRaw);
        if (normalized.tier !== target.tier) {
          changes.push({
            field: 'name',
            fieldLabel: 'Status / Tipe UKO',
            previousValue: `${target.tier} (${target.tierLabel})`,
            newValue: `${normalized.tier} (${normalized.label})`,
          });
          patch.tier = normalized.tier;
          patch.tierLabel = normalized.label;
        }
      }

      if (applyPostalCode && typeof postalCode === 'string' && postalCode.trim()) {
        const cleanPostal = postalCode.trim();
        if (cleanPostal !== target.postalCode) {
          changes.push({
            field: 'address',
            fieldLabel: 'Kode Pos',
            previousValue: target.postalCode || '-',
            newValue: cleanPostal,
          });
        }
        patch.postalCode = cleanPostal;
      }

      if (changes.length === 0) {
        changes.push({
          field: 'phone',
          fieldLabel: 'Penyelarasan Lokasi Ditandai',
          previousValue: target.phone || '-',
          newValue: patch.phone || target.phone || '1500017',
        });
      }

      if (submitToGoogleReview) {
        patch.syncStatus = 'pending_review';
        patch.discrepancies = [];
      }
      patch.lastSyncedAt = nowLabel;
      appState.masterOverrides[target.id] = patch;

      const updated: ServerBranch = { ...target, ...patch };
      updatedBranches.push(updated);

      if (submitToGoogleReview) {
        const job: GoogleSyncJob = {
          id: `SYNC-MRK-${Date.now().toString(36).toUpperCase()}-${target.code}`,
          branchId: target.id,
          branchCode: updated.code,
          branchName: updated.name,
          regionShort: updated.regionShort,
          submittedBy,
          submittedAt: nowLabel,
          status: 'pending_review',
          googlePlaceId: updated.googlePlaceId,
          googleMapsUri: updated.googleMapsUri,
          gbpLocationName: updated.gbpLocationName,
          deliveryChannel: 'review_queue',
          changes,
          note: 'Perbaikan serentak 1-klik dari daftar titik lokasi ditandai → Google Maps.',
        };
        createdJobs.push(job);
        appState.syncJobs.unshift(job);
      }

      historyEvents.push(
        recordChangeHistory({
          branchId: target.id,
          branchCode: updated.code,
          branchName: updated.name,
          regionShort: updated.regionShort,
          actor: submittedBy,
          source: 'batch_mark_fix',
          summary: `Perbaikan serentak 1-klik (${changes.map((c) => c.fieldLabel).join(', ')})`,
          changes: changes.map((c) => ({
            fieldLabel: c.fieldLabel,
            previousValue: c.previousValue,
            newValue: c.newValue,
          })),
        })
      );
    }

    savePersistedState();
    res.json({ updatedBranches, createdJobs, historyEvents });
  });

  // Bulk Export Master Data BRI (exact 24-column template_lokasi_bri CSV format)
  app.get('/api/branches/export', (req, res) => {
    const region = typeof req.query.region === 'string' ? req.query.region : 'ALL';
    const tier = typeof req.query.tier === 'string' ? req.query.tier : 'ALL';
    const status = typeof req.query.status === 'string' ? req.query.status : 'ALL';
    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
    const templateOnly = req.query.templateOnly === '1';

    const header = [
      'Regional Office',
      'Nama Kantor Unit Kerja',
      'Code Branch',
      'Status Kantor / Jenis Uker ',
      'Format GMaps',
      'Latitude',
      'Longitude',
      'Alamat',
      'Nama Desa/ Kelurahan',
      'Nama Kecamatan',
      'Kode Kabupaten/ Kota',
      'Nama Kab/Kota',
      'Nama Provinsi ',
      'Kode Pos',
      'phone',
      'website',
      'mon_hours',
      'tue_hours',
      'wed_hours',
      'thu_hours',
      'fri_hours',
      'sat_hours',
      'sun_hours',
      'Eksisting POI',
    ].join(',');

    let rowsToExport = getMergedBranches();
    if (!templateOnly) {
      rowsToExport = rowsToExport.filter((b) => {
        if (region !== 'ALL' && b.regionShort !== region) return false;
        if (tier !== 'ALL' && b.tier !== tier) return false;
        if (status !== 'ALL' && b.syncStatus !== status) return false;
        if (search) {
          const hay = `${b.name} ${b.code} ${b.city} ${b.province} ${b.address}`.toLowerCase();
          if (!hay.includes(search)) return false;
        }
        return true;
      });
    } else {
      rowsToExport = rowsToExport.slice(0, 5);
    }

    const lines = [header];
    for (const b of rowsToExport) {
      const wh = b.weeklyHours;
      const monH = wh ? (wh.mon.open ? stripWibForCsv(wh.mon.hours) : '') : stripWibForCsv(b.operatingHours) || '08:00-15:00';
      const tueH = wh ? (wh.tue.open ? stripWibForCsv(wh.tue.hours) : '') : monH;
      const wedH = wh ? (wh.wed.open ? stripWibForCsv(wh.wed.hours) : '') : monH;
      const thuH = wh ? (wh.thu.open ? stripWibForCsv(wh.thu.hours) : '') : monH;
      const friH = wh ? (wh.fri.open ? stripWibForCsv(wh.fri.hours) : '') : monH;
      const satH = wh ? (wh.sat.open ? stripWibForCsv(wh.sat.hours) : '') : stripWibForCsv(b.saturdayHours);
      const sunH = wh ? (wh.sun.open ? stripWibForCsv(wh.sun.hours) : '') : stripWibForCsv(b.sundayHours || '');
      lines.push(
        [
          b.region,
          b.name,
          b.code,
          b.tier,
          `${b.lat}, ${b.lng}`,
          b.lat,
          b.lng,
          b.address,
          b.village || '',
          b.district || '',
          b.cityCode || '',
          b.city,
          b.province,
          b.postalCode,
          b.phone,
          b.website || 'https://bri.co.id',
          monH,
          tueH,
          wedH,
          thuH,
          friH,
          satH,
          sunH,
          b.name,
        ]
          .map(escapeCsvCell)
          .join(',')
      );
    }

    const csvOutput = '\uFEFF' + lines.join('\r\n');
    const fileTag = templateOnly ? 'template_master_lokasi_bri.csv' : 'master_lokasi_bri_export.csv';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileTag}"`);
    res.send(csvOutput);
  });

  // Bulk Import Master Data BRI from CSV rows (supports UKO tier upgrades like KCP -> KC as updates to existing units)
  app.post('/api/branches/bulk-import', (req, res) => {
    const { rows, submitToGoogleReview = true, updateOnly = false } = req.body ?? {};
    if (!Array.isArray(rows) || rows.length === 0) {
      res.status(400).json({ error: 'Tidak ada baris data CSV yang valid untuk diimpor.' });
      return;
    }

    const user = getAuthenticatedUser(req);
    const submittedBy = user?.username || 'brioutlet';
    const nowLabel = formatWibNow();
    const merged = getMergedBranches();

    let updatedCount = 0;
    let upgradedCount = 0;
    let addedCount = 0;
    let skippedCount = 0;
    const createdJobs: GoogleSyncJob[] = [];
    const historyEvents: ChangeHistoryEvent[] = [];

    const findExistingBranchForRow = (
      paddedCode: string,
      tier: BranchTier,
      name: string,
      city: string,
      existingPoi?: string,
      lat?: number,
      lng?: number
    ): ServerBranch | undefined => {
      // 1. Exact Code Branch match (prefer same tier if duplicates share a code, else match any tier so KCP -> KC updates in place!)
      const byCodeSameTier = merged.find((b) => b.code === paddedCode && b.tier === tier);
      if (byCodeSameTier) return byCodeSameTier;

      const byCodeAnyTier = merged.find((b) => b.code === paddedCode);
      if (byCodeAnyTier) return byCodeAnyTier;

      // 2. Match by Eksisting POI label if supplied
      if (existingPoi && existingPoi.trim()) {
        const poiNorm = normalizeCoreBranchName(existingPoi);
        const byPoi = merged.find(
          (b) =>
            b.name.toLowerCase() === existingPoi.trim().toLowerCase() ||
            (poiNorm && normalizeCoreBranchName(b.name) === poiNorm)
        );
        if (byPoi) return byPoi;
      }

      // 3. Match by normalized core unit name + city (handles UKO upgrades even when Branch Code changed!)
      const coreName = normalizeCoreBranchName(name);
      const cityLower = city.trim().toLowerCase();
      if (coreName && coreName.length >= 4) {
        const byNameCity = merged.find((b) => {
          const bCore = normalizeCoreBranchName(b.name);
          if (!bCore || bCore !== coreName) return false;
          if (!cityLower || cityLower === 'indonesia') return true;
          return (
            b.city.toLowerCase().includes(cityLower) ||
            cityLower.includes(b.city.toLowerCase())
          );
        });
        if (byNameCity) return byNameCity;
      }

      // 4. Match by tight coordinate proximity (< ~60m) + similar city when upgrading tier & code simultaneously
      if (
        typeof lat === 'number' &&
        typeof lng === 'number' &&
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        lat !== 0 &&
        lng !== 0
      ) {
        const byCoord = merged.find(
          (b) =>
            Math.abs(b.lat - lat) < 0.00055 &&
            Math.abs(b.lng - lng) < 0.00055 &&
            (!cityLower || b.city.toLowerCase() === cityLower)
        );
        if (byCoord) return byCoord;
      }

      return undefined;
    };

    for (const raw of rows as Array<{
      region?: string;
      name?: string;
      code?: string;
      tierRaw?: string;
      lat?: number;
      lng?: number;
      address?: string;
      village?: string;
      district?: string;
      cityCode?: string;
      city?: string;
      province?: string;
      postalCode?: string;
      phone?: string;
      website?: string;
      operatingHours?: string;
      saturdayHours?: string;
      sundayHours?: string;
      existingPoi?: string;
    }>) {
      const name = typeof raw.name === 'string' ? raw.name.trim() : '';
      const rawCode = typeof raw.code === 'string' ? raw.code.trim() : '';
      if (!name || !rawCode) continue;

      const paddedCode = rawCode.padStart(4, '0');
      const { tier, label: tierLabel } = normalizeTier(raw.tierRaw || 'UNIT');
      const lat = typeof raw.lat === 'number' && Number.isFinite(raw.lat) ? raw.lat : -6.2;
      const lng = typeof raw.lng === 'number' && Number.isFinite(raw.lng) ? raw.lng : 106.8;
      const city = typeof raw.city === 'string' && raw.city.trim() ? raw.city.trim() : 'Indonesia';

      const existing = findExistingBranchForRow(
        paddedCode,
        tier,
        name,
        city,
        raw.existingPoi,
        lat,
        lng
      );

      const formattedHours = formatHours(raw.operatingHours || '08:00-15:00');
      const formattedSat =
        raw.saturdayHours && raw.saturdayHours.trim() && raw.saturdayHours.trim() !== 'Tutup'
          ? formatHours(raw.saturdayHours)
          : 'Tutup';
      const phone = typeof raw.phone === 'string' && raw.phone.trim() ? raw.phone.trim() : '1500017';
      const address =
        typeof raw.address === 'string' && raw.address.trim()
          ? raw.address.trim()
          : 'Alamat terverifikasi';
      const province = typeof raw.province === 'string' ? raw.province.trim() : '';
      const postalCode = typeof raw.postalCode === 'string' ? raw.postalCode.trim() : '';

      if (existing) {
        const changes: GoogleSyncChange[] = [];
        const tierChanged = Boolean(raw.tierRaw) && tier !== existing.tier;
        if (tierChanged) {
          changes.push({
            field: 'name',
            fieldLabel: 'Perubahan Status / Jenis UKO',
            previousValue: `${existing.tier} (${existing.tierLabel})`,
            newValue: `${tier} (${tierLabel})`,
          });
          upgradedCount++;
        }
        if (paddedCode !== existing.code) {
          changes.push({
            field: 'name',
            fieldLabel: 'Kode Cabang',
            previousValue: existing.code,
            newValue: paddedCode,
          });
        }
        if (name !== existing.name) {
          changes.push({
            field: 'name',
            fieldLabel: 'Nama Unit Kerja',
            previousValue: existing.name,
            newValue: name,
          });
        }
        if (formattedHours !== existing.operatingHours) {
          changes.push({
            field: 'operatingHours',
            fieldLabel: 'Jam Operasional (Sen–Jum)',
            previousValue: existing.operatingHours,
            newValue: formattedHours,
          });
        }
        if (formattedSat !== existing.saturdayHours) {
          changes.push({
            field: 'saturdayHours',
            fieldLabel: 'Jam Layanan Sabtu',
            previousValue: existing.saturdayHours,
            newValue: formattedSat,
          });
        }
        if (phone !== existing.phone) {
          changes.push({
            field: 'phone',
            fieldLabel: 'Telepon Layanan',
            previousValue: existing.phone,
            newValue: phone,
          });
        }
        if (address !== existing.address) {
          changes.push({
            field: 'address',
            fieldLabel: 'Alamat Resmi',
            previousValue: existing.address,
            newValue: address,
          });
        }

        appState.masterOverrides[existing.id] = {
          ...(appState.masterOverrides[existing.id] ?? {}),
          code: paddedCode,
          tier: raw.tierRaw ? tier : existing.tier,
          tierLabel: raw.tierRaw ? tierLabel : existing.tierLabel,
          name,
          operatingHours: formattedHours,
          saturdayHours: formattedSat,
          phone,
          address,
          city: city !== 'Indonesia' ? city : existing.city,
          province: province || existing.province,
          postalCode: postalCode || existing.postalCode,
          lat: raw.lat !== undefined ? lat : existing.lat,
          lng: raw.lng !== undefined ? lng : existing.lng,
          website: raw.website?.trim() || existing.website,
          existingPoi: raw.existingPoi?.trim() || existing.existingPoi,
          syncStatus: submitToGoogleReview ? 'pending_review' : existing.syncStatus,
          discrepancies: submitToGoogleReview ? [] : existing.discrepancies,
          lastSyncedAt: nowLabel,
        };
        updatedCount++;

        if (changes.length > 0) {
          historyEvents.push(
            recordChangeHistory({
              branchId: existing.id,
              branchCode: paddedCode,
              branchName: name,
              regionShort: existing.regionShort,
              actor: submittedBy,
              source: 'bulk_import',
              summary: tierChanged
                ? `Naik Status / Perubahan UKO (${existing.tier} → ${tier}) via Bulk Import`
                : 'Pembaruan Master Data via Bulk Import CSV',
              changes: changes.map((c) => ({
                fieldLabel: c.fieldLabel,
                previousValue: c.previousValue,
                newValue: c.newValue,
              })),
            })
          );
        }

        if (submitToGoogleReview && changes.length > 0) {
          const job: GoogleSyncJob = {
            id: `SYNC-IMP-${Date.now().toString(36).toUpperCase()}-${paddedCode}`,
            branchId: existing.id,
            branchCode: paddedCode,
            branchName: name,
            regionShort: existing.regionShort,
            submittedBy,
            submittedAt: nowLabel,
            status: 'pending_review',
            gbpLocationName: existing.gbpLocationName,
            deliveryChannel: 'review_queue',
            changes,
            note: tierChanged
              ? `Perubahan status UKO (${existing.tier} → ${tier}) via Bulk Import CSV diajukan ke Google Maps.`
              : 'Pembaruan Master Data via Bulk Import CSV diajukan untuk menyelaraskan Google Maps.',
          };
          createdJobs.push(job);
          appState.syncJobs.unshift(job);
        }
      } else if (updateOnly) {
        skippedCount++;
      } else {
        const region =
          typeof raw.region === 'string' && raw.region.trim()
            ? raw.region.trim()
            : 'Region 6 - Regional Office Jakarta 1';
        const newId = `${tier}-${paddedCode}-${Date.now().toString(36).slice(-4)}`;
        const newBranch: ServerBranch = {
          id: newId,
          code: paddedCode,
          name,
          tier,
          tierLabel,
          region,
          regionShort: shortenRegion(region),
          address,
          village: raw.village?.trim() || '',
          district: raw.district?.trim() || '',
          cityCode: raw.cityCode?.trim() || '',
          city,
          province,
          postalCode,
          phone,
          website: raw.website?.trim() || 'https://bri.co.id',
          operatingHours: formattedHours,
          saturdayHours: formattedSat,
          sundayHours: raw.sundayHours?.trim() || '',
          lat,
          lng,
          syncStatus: submitToGoogleReview ? 'pending_review' : 'synced',
          lastSyncedAt: nowLabel,
          rating: 4.5,
          reviewCount: 0,
          discrepancies: [],
          existingPoi: raw.existingPoi?.trim() || undefined,
        };
        appState.addedBranches.unshift(newBranch);
        addedCount++;

        historyEvents.push(
          recordChangeHistory({
            branchId: newId,
            branchCode: paddedCode,
            branchName: name,
            regionShort: newBranch.regionShort,
            actor: submittedBy,
            source: 'bulk_import',
            summary: 'Penambahan Unit Kerja Baru via Bulk Import CSV',
            changes: [
              { fieldLabel: 'Unit Kerja Baru', previousValue: '-', newValue: `${tier} · ${name}` },
              { fieldLabel: 'Alamat Resmi', previousValue: '-', newValue: address },
            ],
          })
        );

        if (submitToGoogleReview) {
          const job: GoogleSyncJob = {
            id: `SYNC-NEW-${Date.now().toString(36).toUpperCase()}-${paddedCode}`,
            branchId: newId,
            branchCode: paddedCode,
            branchName: name,
            regionShort: newBranch.regionShort,
            submittedBy,
            submittedAt: nowLabel,
            status: 'pending_review',
            deliveryChannel: 'review_queue',
            changes: [
              { field: 'name', fieldLabel: 'Unit Kerja Baru (Master BRI)', previousValue: 'Belum terdaftar di GBP', newValue: name },
              { field: 'address', fieldLabel: 'Alamat Resmi', previousValue: '-', newValue: address },
            ],
            note: 'Unit kerja baru dari Bulk Import CSV diajukan untuk sinkronisasi Google Business Profile.',
          };
          createdJobs.push(job);
          appState.syncJobs.unshift(job);
        }
      }
    }

    savePersistedState();
    res.json({
      updatedCount,
      upgradedCount,
      addedCount,
      skippedCount,
      createdJobsCount: createdJobs.length,
      branches: getMergedBranches(),
      createdJobs,
      historyEvents,
    });
  });

  // Batch Data Quality Standardization & Master Repair
  app.post('/api/branches/quality-fix', (req, res) => {
    const { fixes, submitToGoogleReview = true } = req.body ?? {};
    if (!Array.isArray(fixes) || fixes.length === 0) {
      res.status(400).json({ error: 'Daftar perbaikan kualitas data tidak valid.' });
      return;
    }

    const user = getAuthenticatedUser(req);
    const submittedBy = user?.username || 'brioutlet';
    const nowLabel = formatWibNow();
    const merged = getMergedBranches();

    const updatedBranches: ServerBranch[] = [];
    const createdJobs: GoogleSyncJob[] = [];

    for (const fix of fixes as Array<{
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
    }>) {
      const target = merged.find((b) => b.id === fix.branchId);
      if (!target) continue;

      const patch: BranchOverrideRecord = {
        ...(appState.masterOverrides[target.id] ?? {}),
      };
      const changes: GoogleSyncChange[] = [];

      if (fix.weeklyHours && typeof fix.weeklyHours === 'object') {
        patch.weeklyHours = fix.weeklyHours;
        patch.operatingHours = fix.weeklyHours.mon?.open ? formatHours(fix.weeklyHours.mon.hours) : 'Tutup';
        patch.saturdayHours = fix.weeklyHours.sat?.open ? formatHours(fix.weeklyHours.sat.hours) : 'Tutup';
        patch.sundayHours = fix.weeklyHours.sun?.open ? formatHours(fix.weeklyHours.sun.hours) : '';
        changes.push({
          field: 'weeklyHours',
          fieldLabel: 'Jadwal Operasional (Sen–Min)',
          previousValue: target.operatingHours,
          newValue: `${patch.operatingHours} (Sab: ${patch.saturdayHours})`,
        });
      } else {
        if (typeof fix.operatingHours === 'string' && fix.operatingHours.trim() && fix.operatingHours.trim() !== target.operatingHours) {
          const val = fix.operatingHours.trim();
          changes.push({ field: 'operatingHours', fieldLabel: 'Standardisasi Jam Operasional', previousValue: target.operatingHours, newValue: val });
          patch.operatingHours = val;
        }
        if (typeof fix.saturdayHours === 'string' && fix.saturdayHours.trim() && fix.saturdayHours.trim() !== target.saturdayHours) {
          const val = fix.saturdayHours.trim();
          changes.push({ field: 'saturdayHours', fieldLabel: 'Jam Layanan Sabtu', previousValue: target.saturdayHours, newValue: val });
          patch.saturdayHours = val;
        }
      }

      if (typeof fix.phone === 'string' && fix.phone.trim() && fix.phone.trim() !== target.phone) {
        const val = fix.phone.trim();
        changes.push({ field: 'phone', fieldLabel: 'Standardisasi Telepon', previousValue: target.phone || '-', newValue: val });
        patch.phone = val;
      }
      if (typeof fix.website === 'string' && fix.website.trim() && fix.website.trim() !== (target.website || '')) {
        const val = fix.website.trim();
        changes.push({ field: 'website', fieldLabel: 'Standardisasi Website', previousValue: target.website || '-', newValue: val });
        patch.website = val;
      }
      if (typeof fix.address === 'string' && fix.address.trim() && fix.address.trim() !== target.address) {
        const val = fix.address.trim();
        changes.push({ field: 'address', fieldLabel: 'Kelengkapan Alamat', previousValue: target.address, newValue: val });
        patch.address = val;
      }
      if (typeof fix.postalCode === 'string' && fix.postalCode.trim()) {
        patch.postalCode = fix.postalCode.trim();
      }
      if (typeof fix.city === 'string' && fix.city.trim()) {
        patch.city = fix.city.trim();
      }
      if (typeof fix.lat === 'number' && typeof fix.lng === 'number' && Number.isFinite(fix.lat) && Number.isFinite(fix.lng)) {
        if (fix.lat !== target.lat || fix.lng !== target.lng) {
          changes.push({
            field: 'coordinates',
            fieldLabel: 'Perbaikan Koordinat Lokasi',
            previousValue: `${target.lat}, ${target.lng}`,
            newValue: `${fix.lat}, ${fix.lng}`,
          });
        }
        patch.lat = fix.lat;
        patch.lng = fix.lng;
      }

      if (submitToGoogleReview) {
        patch.syncStatus = 'pending_review';
        patch.discrepancies = [];
      }
      patch.lastSyncedAt = nowLabel;
      appState.masterOverrides[target.id] = patch;
      updatedBranches.push({ ...target, ...patch });

      if (submitToGoogleReview) {
        const job: GoogleSyncJob = {
          id: `SYNC-QA-${Date.now().toString(36).toUpperCase()}-${target.code}`,
          branchId: target.id,
          branchCode: target.code,
          branchName: patch.name || target.name,
          regionShort: target.regionShort,
          submittedBy,
          submittedAt: nowLabel,
          status: 'pending_review',
          gbpLocationName: target.gbpLocationName,
          deliveryChannel: 'review_queue',
          changes:
            changes.length > 0
              ? changes
              : [
                  {
                    field: 'address',
                    fieldLabel: 'Perbaikan Kualitas Data Master BRI',
                    previousValue: 'Temuan Kualitas Data',
                    newValue: `${patch.operatingHours || target.operatingHours} · ${patch.phone || target.phone}`,
                  },
                ],
          note: 'Perbaikan kualitas data Master BRI diteruskan ke pemantauan sinkronisasi Google Maps.',
        };
        createdJobs.push(job);
        appState.syncJobs.unshift(job);
      }

      recordChangeHistory({
        branchId: target.id,
        branchCode: target.code,
        branchName: patch.name || target.name,
        regionShort: target.regionShort,
        actor: submittedBy,
        source: 'quality_fix',
        summary: `Standardisasi Kualitas Data (${changes.length > 0 ? changes.map((c) => c.fieldLabel).join(', ') : 'Kelengkapan Master'})`,
        changes:
          changes.length > 0
            ? changes.map((c) => ({ fieldLabel: c.fieldLabel, previousValue: c.previousValue, newValue: c.newValue }))
            : [{ fieldLabel: 'Kualitas Master', previousValue: 'Perlu standardisasi', newValue: `${patch.operatingHours || target.operatingHours} · ${patch.phone || target.phone}` }],
      });
    }

    savePersistedState();
    res.json({ updatedBranches, createdJobs });
  });

  // Google Business Profile (GBP) API Proxies using client Bearer OAuth Token
  app.get('/api/gbp/accounts', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Token OAuth Google Business Profile tidak tersedia.' });
      return;
    }

    try {
      const gbpRes = await fetch('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', {
        headers: { Authorization: authHeader },
      });
      const payload = (await gbpRes.json()) as {
        accounts?: Array<{
          name?: string;
          accountName?: string;
          type?: string;
          verificationState?: string;
        }>;
        error?: { message?: string; status?: string };
      };

      if (!gbpRes.ok) {
        res.status(gbpRes.status).json({
          error:
            payload.error?.message ||
            'Gagal mengakses Google Business Profile Account Management API.',
        });
        return;
      }

      res.json({ accounts: payload.accounts ?? [] });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Gagal menghubungi Google Business Profile API.',
      });
    }
  });

  app.get('/api/gbp/locations', async (req, res) => {
    const authHeader = req.headers.authorization;
    const accountName = typeof req.query.accountName === 'string' ? req.query.accountName : '';
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Token OAuth Google Business Profile tidak tersedia.' });
      return;
    }
    if (!accountName) {
      res.status(400).json({ error: 'Parameter accountName wajib diisi.' });
      return;
    }

    try {
      const readMask = 'name,title,storeCode,phoneNumbers,storefrontAddress,regularHours,websiteUri,metadata';
      const url = `https://mybusinessbusinessinformation.googleapis.com/v1/${accountName}/locations?readMask=${encodeURIComponent(
        readMask
      )}&pageSize=100`;
      const gbpRes = await fetch(url, {
        headers: { Authorization: authHeader },
      });
      const payload = (await gbpRes.json()) as {
        locations?: Array<{
          name?: string;
          title?: string;
          storeCode?: string;
          phoneNumbers?: { primaryPhone?: string };
          storefrontAddress?: {
            addressLines?: string[];
            locality?: string;
            postalCode?: string;
          };
          websiteUri?: string;
          metadata?: { mapsUri?: string };
          openInfo?: { status?: string };
        }>;
        error?: { message?: string };
      };

      if (!gbpRes.ok) {
        res.status(gbpRes.status).json({
          error:
            payload.error?.message ||
            'Gagal mengambil daftar lokasi dari Google Business Profile Business Information API.',
        });
        return;
      }

      const locations = (payload.locations ?? []).map((loc) => ({
        name: loc.name || '',
        title: loc.title || 'Lokasi GBP',
        storeCode: loc.storeCode,
        primaryPhone: loc.phoneNumbers?.primaryPhone,
        addressLines: loc.storefrontAddress?.addressLines,
        locality: loc.storefrontAddress?.locality,
        postalCode: loc.storefrontAddress?.postalCode,
        websiteUri: loc.websiteUri,
        mapsUri: loc.metadata?.mapsUri,
        openInfoStatus: loc.openInfo?.status,
      }));

      res.json({ locations });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Gagal menghubungi Google Business Profile API.',
      });
    }
  });

  app.post('/api/gbp/link', (req, res) => {
    const { branchId, gbpLocationName, mapsUri } = req.body ?? {};
    if (typeof branchId !== 'string' || typeof gbpLocationName !== 'string') {
      res.status(400).json({ error: 'branchId dan gbpLocationName wajib diisi.' });
      return;
    }

    appState.gbpLinks[branchId] = gbpLocationName;
    if (mapsUri && typeof mapsUri === 'string') {
      appState.masterOverrides[branchId] = {
        ...(appState.masterOverrides[branchId] ?? {}),
        gbpLocationName,
        googleMapsUri: mapsUri,
      };
    }
    savePersistedState();

    const updated = getMergedBranches().find((b) => b.id === branchId);
    res.json({ ok: true, branch: updated });
  });

  app.post('/api/gbp/push-location', async (req, res) => {
    const authHeader = req.headers.authorization;
    const { branchId, locationName } = req.body ?? {};
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Hubungkan akun Google Business Profile terlebih dahulu.' });
      return;
    }
    if (typeof branchId !== 'string' || typeof locationName !== 'string' || !locationName.trim()) {
      res.status(400).json({ error: 'branchId dan locationName GBP wajib disediakan.' });
      return;
    }

    const merged = getMergedBranches();
    const branch = merged.find((b) => b.id === branchId);
    if (!branch) {
      res.status(404).json({ error: 'Unit kerja Master BRI tidak ditemukan.' });
      return;
    }

    const bodyPayload = {
      title: branch.name,
      phoneNumbers: {
        primaryPhone: branch.phone,
      },
      websiteUri: branch.website || 'https://bri.co.id',
      storefrontAddress: {
        regionCode: 'ID',
        languageCode: 'id',
        postalCode: branch.postalCode || undefined,
        administrativeArea: branch.province || undefined,
        locality: branch.city || undefined,
        addressLines: [branch.address],
      },
      regularHours: {
        periods: parseHoursRangeToGbpPeriods(
          branch.operatingHours,
          branch.saturdayHours,
          branch.weeklyHours
        ),
      },
    };

    try {
      const updateMask = 'title,phoneNumbers,websiteUri,storefrontAddress,regularHours';
      const endpoint = `https://mybusinessbusinessinformation.googleapis.com/v1/${locationName}?updateMask=${encodeURIComponent(
        updateMask
      )}`;
      const gbpRes = await fetch(endpoint, {
        method: 'PATCH',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(bodyPayload),
      });
      const result = (await gbpRes.json()) as {
        metadata?: { hasPendingEdits?: boolean; mapsUri?: string };
        error?: { message?: string };
      };

      if (!gbpRes.ok) {
        res.status(gbpRes.status).json({
          error: result.error?.message || 'Gagal mendorong pembaruan Master Data ke Google Business Profile.',
        });
        return;
      }

      const nowLabel = formatWibNow();
      const hasPending = Boolean(result.metadata?.hasPendingEdits ?? true);
      appState.gbpLinks[branch.id] = locationName;
      appState.masterOverrides[branch.id] = {
        ...(appState.masterOverrides[branch.id] ?? {}),
        gbpLocationName: locationName,
        googleMapsUri: result.metadata?.mapsUri || branch.googleMapsUri,
        syncStatus: hasPending ? 'pending_review' : 'synced',
        discrepancies: [],
        lastSyncedAt: nowLabel,
      };

      const job: GoogleSyncJob = {
        id: `SYNC-GBP-${Date.now().toString(36).toUpperCase()}`,
        branchId: branch.id,
        branchCode: branch.code,
        branchName: branch.name,
        regionShort: branch.regionShort,
        submittedBy: 'Google Business Profile API',
        submittedAt: nowLabel,
        approvedAt: hasPending ? undefined : nowLabel,
        status: hasPending ? 'pending_review' : 'approved_live',
        gbpLocationName: locationName,
        googleMapsUri: result.metadata?.mapsUri || branch.googleMapsUri,
        deliveryChannel: 'gbp_api_live',
        changes: [
          { field: 'name', fieldLabel: 'Title GBP ← Master BRI', previousValue: 'Listing GBP', newValue: branch.name },
          { field: 'operatingHours', fieldLabel: 'Jam Buka GBP ← Master BRI', previousValue: 'Listing GBP', newValue: branch.operatingHours },
          { field: 'phone', fieldLabel: 'Telepon GBP ← Master BRI', previousValue: 'Listing GBP', newValue: branch.phone },
        ],
        note: hasPending
          ? 'Master Data berhasil dikirim langsung ke Google Business Profile API (menunggu verifikasi Google).'
          : 'Master Data berhasil disinkronkan langsung ke Google Business Profile API.',
      };
      appState.syncJobs.unshift(job);
      recordChangeHistory({
        branchId: branch.id,
        branchCode: branch.code,
        branchName: branch.name,
        regionShort: branch.regionShort,
        actor: 'Google Business Profile API',
        source: 'gbp_push',
        summary: 'Sinkronisasi Langsung Master BRI → Google Business Profile API',
        changes: job.changes.map((c) => ({ fieldLabel: c.fieldLabel, previousValue: c.previousValue, newValue: c.newValue })),
      });
      savePersistedState();

      res.json({
        ok: true,
        branch: { ...branch, ...appState.masterOverrides[branch.id] },
        syncJob: job,
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Gagal menghubungi Google Business Profile API.',
      });
    }
  });

  async function fetchAllGbpLocationReviews(
    fullParent: string,
    bearerAuth: string,
    targetBranch: ServerBranch | undefined
  ): Promise<StoredReview[]> {
    const ratingMap: Record<string, number> = {
      ONE: 1,
      TWO: 2,
      THREE: 3,
      FOUR: 4,
      FIVE: 5,
    };
    const collected: StoredReview[] = [];
    let pageToken: string | undefined;
    let safetyPages = 0;

    do {
      const qs = new URLSearchParams({ pageSize: '50' });
      if (pageToken) qs.set('pageToken', pageToken);
      const url = `https://mybusiness.googleapis.com/v4/${fullParent}/reviews?${qs.toString()}`;
      const gbpRes = await fetch(url, {
        headers: { Authorization: bearerAuth },
      });
      const payload = (await gbpRes.json()) as {
        reviews?: Array<{
          name?: string;
          reviewId?: string;
          reviewer?: { displayName?: string };
          starRating?: 'ONE' | 'TWO' | 'THREE' | 'FOUR' | 'FIVE';
          comment?: string;
          updateTime?: string;
          reviewReply?: { comment?: string; updateTime?: string };
        }>;
        nextPageToken?: string;
        error?: { message?: string };
      };

      if (!gbpRes.ok) {
        const err = new Error(
          payload.error?.message || 'Gagal mengambil ulasan dari Google Business Profile API.'
        ) as Error & { statusCode?: number };
        err.statusCode = gbpRes.status;
        throw err;
      }

      for (const rev of payload.reviews ?? []) {
        const revId = rev.reviewId || rev.name || `GBP-REV-${Date.now()}`;
        const rating = ratingMap[rev.starRating || 'FIVE'] ?? 5;
        const sentiment: StoredReview['sentiment'] =
          rating >= 4 ? 'Positif' : rating === 3 ? 'Netral' : 'Perlu Perhatian';
        collected.push({
          id: `GBP-${revId}`,
          branchId: targetBranch?.id || 'GBP-LINKED',
          branchCode: targetBranch?.code || '-',
          branchName: targetBranch?.name || 'Unit Terhubung GBP',
          regionShort: targetBranch?.regionShort || 'GBP',
          authorName: rev.reviewer?.displayName || 'Nasabah Google',
          rating,
          comment: rev.comment || '(Rating bintang tanpa komentar)',
          createdAt: formatGooglePublishTimeWib(rev.updateTime) || 'Dari GBP',
          publishTime: rev.updateTime,
          sentiment,
          replyStatus: rev.reviewReply?.comment ? 'replied' : 'unreplied',
          replyText: rev.reviewReply?.comment,
          repliedAt: formatGooglePublishTimeWib(rev.reviewReply?.updateTime) || undefined,
          source: 'gbp_api',
          gbpReviewName: rev.name,
        });
      }

      pageToken = payload.nextPageToken;
      safetyPages++;
    } while (pageToken && safetyPages < 40);

    return collected;
  }

  app.post('/api/gbp/reviews/sync', async (req, res) => {
    const authHeader = req.headers.authorization;
    const { accountName, locationName, branchId } = req.body ?? {};
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Token OAuth Google Business Profile tidak tersedia.' });
      return;
    }
    if (!accountName || !locationName) {
      res.status(400).json({ error: 'accountName dan locationName GBP wajib diisi.' });
      return;
    }

    const fullParent = locationName.startsWith('accounts/')
      ? locationName
      : `${accountName}/${locationName}`;

    try {
      const merged = getMergedBranches();
      const targetBranch =
        (typeof branchId === 'string' && merged.find((b) => b.id === branchId)) ||
        merged.find((b) => b.gbpLocationName === locationName) ||
        merged[0];

      const imported = await fetchAllGbpLocationReviews(fullParent, authHeader, targetBranch);

      const importedIds = new Set(imported.map((i) => i.id));
      const others = appState.reviews.filter(
        (r) => !importedIds.has(r.id) && !(r.id.startsWith('REV-2026-') && r.replyStatus === 'unreplied')
      );
      appState.reviews = [...imported, ...others];
      if (targetBranch && !appState.scannedReviewBranchIds.includes(targetBranch.id)) {
        appState.scannedReviewBranchIds.push(targetBranch.id);
      }
      savePersistedState();

      res.json({ reviews: appState.reviews, importedCount: imported.length });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 500;
      res.status(status).json({
        error: err instanceof Error ? err.message : 'Gagal menyinkronkan ulasan GBP.',
      });
    }
  });

  app.post('/api/gbp/reviews/sync-all', async (req, res) => {
    const authHeader = req.headers.authorization;
    const { accountName, locations } = req.body ?? {};
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Token OAuth Google Business Profile tidak tersedia.' });
      return;
    }
    if (!accountName || !Array.isArray(locations) || locations.length === 0) {
      res.status(400).json({ error: 'accountName dan daftar locations GBP wajib diisi.' });
      return;
    }

    try {
      const merged = getMergedBranches();
      const allImported: StoredReview[] = [];

      for (const loc of locations as Array<{ name: string; title?: string; storeCode?: string }>) {
        if (!loc?.name) continue;
        const fullParent = loc.name.startsWith('accounts/') ? loc.name : `${accountName}/${loc.name}`;
        const targetBranch =
          merged.find((b) => b.gbpLocationName === loc.name) ||
          (loc.storeCode ? merged.find((b) => b.code === loc.storeCode?.trim().padStart(4, '0')) : undefined) ||
          (loc.title
            ? merged.find((b) =>
                b.name.toLowerCase().includes(loc.title!.toLowerCase().replace(/\bbri\b/g, '').trim())
              )
            : undefined);

        try {
          const locReviews = await fetchAllGbpLocationReviews(fullParent, authHeader, targetBranch);
          allImported.push(...locReviews);
          if (targetBranch && !appState.scannedReviewBranchIds.includes(targetBranch.id)) {
            appState.scannedReviewBranchIds.push(targetBranch.id);
          }
        } catch {
          // Continue syncing remaining GBP locations if one location lacks access
        }
      }

      const importedIds = new Set(allImported.map((i) => i.id));
      const others = appState.reviews.filter(
        (r) => !importedIds.has(r.id) && !(r.id.startsWith('REV-2026-') && r.replyStatus === 'unreplied')
      );
      appState.reviews = [...allImported, ...others];
      savePersistedState();

      res.json({
        reviews: appState.reviews,
        importedCount: allImported.length,
        locationsSynced: locations.length,
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Gagal menarik seluruh ulasan GBP.',
      });
    }
  });

  // Google Sync Queue endpoints
  app.get('/api/sync-jobs', (_req, res) => {
    res.json({ jobs: appState.syncJobs });
  });

  // Automatic verification against live Google Business Profile / Google Maps Places API
  app.post('/api/sync-jobs/verify-google', async (req, res) => {
    const { jobId, gbpAccessToken } = req.body ?? {};
    const pendingJobs = appState.syncJobs.filter(
      (j) => j.status === 'pending_review' && (!jobId || j.id === jobId)
    );
    if (pendingJobs.length === 0) {
      res.json({ jobs: appState.syncJobs, verifiedCount: 0, checkedCount: 0 });
      return;
    }

    const merged = getMergedBranches();
    const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;
    const nowLabel = formatWibNow();
    let verifiedCount = 0;

    const normalizeDigits = (s: string) => s.replace(/[^\d]/g, '');

    for (const job of pendingJobs.slice(0, 15)) {
      const branch = merged.find((b) => b.id === job.branchId);
      if (!branch) continue;

      let matchedLive = false;
      let verificationDetail = `Diperiksa ${nowLabel} — Data Google Maps saat ini masih menunggu pembaruan dari Google.`;

      // 1. Check live Google Business Profile API if linked and Bearer token available
      if (job.gbpLocationName && typeof gbpAccessToken === 'string' && gbpAccessToken.trim()) {
        try {
          const readMask = 'name,title,phoneNumbers,storefrontAddress,regularHours,websiteUri,metadata';
          const gbpRes = await fetch(
            `https://mybusinessbusinessinformation.googleapis.com/v1/${job.gbpLocationName}?readMask=${encodeURIComponent(
              readMask
            )}`,
            { headers: { Authorization: `Bearer ${gbpAccessToken.trim()}` } }
          );
          if (gbpRes.ok) {
            const loc = (await gbpRes.json()) as {
              title?: string;
              phoneNumbers?: { primaryPhone?: string };
              websiteUri?: string;
              metadata?: { hasPendingEdits?: boolean; mapsUri?: string };
            };
            const pendingEdits = loc.metadata?.hasPendingEdits;
            const livePhone = normalizeDigits(loc.phoneNumbers?.primaryPhone || '');
            const masterPhone = normalizeDigits(branch.phone || '');
            const phoneMatches = !masterPhone || !livePhone || livePhone.endsWith(masterPhone.slice(-6));
            const titleMatches =
              !loc.title ||
              loc.title.toLowerCase().includes(branch.name.toLowerCase().replace(/^bri\s+/i, '').slice(0, 8));

            if (pendingEdits === false && phoneMatches && titleMatches) {
              matchedLive = true;
              verificationDetail = `Terverifikasi otomatis via Google Business Profile API (${nowLabel}): data live telah sesuai dengan Master Data BRI.`;
            } else {
              verificationDetail = `Diperiksa via GBP API (${nowLabel}): Google masih memproses antrean edit (${loc.title || branch.name}).`;
            }
          }
        } catch {
          // Fall through to Places API check
        }
      }

      // 2. Check live Google Maps Places API (New) if not yet confirmed via GBP API
      if (!matchedLive && apiKey) {
        try {
          const gmpRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': apiKey,
              'X-Goog-FieldMask':
                'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.regularOpeningHours,places.googleMapsUri',
              'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio',
            },
            body: JSON.stringify({
              textQuery: `BRI ${branch.name} ${branch.city}`.trim(),
              languageCode: 'id',
              regionCode: 'ID',
              pageSize: 1,
            }),
          });
          if (gmpRes.ok) {
            const payload = (await gmpRes.json()) as {
              places?: Array<{
                id?: string;
                displayName?: { text?: string };
                formattedAddress?: string;
                nationalPhoneNumber?: string;
                regularOpeningHours?: { weekdayDescriptions?: string[] };
                googleMapsUri?: string;
              }>;
            };
            const livePlace = payload.places?.[0];
            if (livePlace) {
              if (livePlace.googleMapsUri) job.googleMapsUri = livePlace.googleMapsUri;
              const livePhone = normalizeDigits(livePlace.nationalPhoneNumber || '');
              const masterPhone = normalizeDigits(branch.phone || '');
              const phoneAligned =
                !masterPhone ||
                (livePhone.length >= 6 &&
                  (livePhone.includes(masterPhone) || masterPhone.includes(livePhone.slice(-6))));

              const liveAddr = (livePlace.formattedAddress || '').toLowerCase();
              const cityTokens = (branch.city || '').toLowerCase().split(/\s+/).filter((t) => t.length > 3);
              const addrAligned =
                cityTokens.length === 0 || cityTokens.some((tok) => liveAddr.includes(tok));

              const hoursText = (livePlace.regularOpeningHours?.weekdayDescriptions || []).join(' ');
              const hoursMatch = branch.operatingHours.match(/(\d{1,2})[:.](\d{2}).*?(\d{1,2})[:.](\d{2})/);
              const mOpen = hoursMatch
                ? `${hoursMatch[1].padStart(2, '0')}:${hoursMatch[2]}`
                : null;
              const normalizedHoursText = hoursText.replace(/(\d{1,2})\.(\d{2})/g, '$1:$2');
              const hoursAligned =
                !mOpen ||
                !hoursText ||
                normalizedHoursText.includes(mOpen) ||
                normalizedHoursText.includes(hoursMatch![1].padStart(2, '0').replace(/^0/, '') + ':' + hoursMatch![2]);

              if (phoneAligned && addrAligned && hoursAligned) {
                matchedLive = true;
                verificationDetail = `Terverifikasi otomatis dari Google Maps (${livePlace.displayName?.text || branch.name} · ${nowLabel}): profil publik sudah selaras dengan Master Data BRI.`;
              } else {
                const diffs: string[] = [];
                if (!phoneAligned) diffs.push(`Telp Maps: ${livePlace.nationalPhoneNumber || '-'}`);
                if (!hoursAligned) diffs.push('Jam Maps belum berubah');
                if (!addrAligned) diffs.push('Alamat Maps belum sesuai');
                verificationDetail = `Diperiksa di Google Maps (${nowLabel}) — Belum berubah (${diffs.join(', ') || 'menunggu review Google'}).`;
              }
            }
          }
        } catch {
          // Keep pending status if lookup fails
        }
      }

      job.lastCheckedAt = nowLabel;
      job.verificationNote = verificationDetail;

      if (matchedLive) {
        job.status = 'approved_live';
        job.approvedAt = nowLabel;
        job.note = verificationDetail;
        appState.masterOverrides[job.branchId] = {
          ...(appState.masterOverrides[job.branchId] ?? {}),
          syncStatus: 'synced',
          discrepancies: [],
          lastSyncedAt: nowLabel,
          googleMapsUri: job.googleMapsUri,
        };
        recordChangeHistory({
          branchId: branch.id,
          branchCode: branch.code,
          branchName: branch.name,
          regionShort: branch.regionShort,
          actor: 'Sistem Verifikasi Google Maps',
          source: 'google_auto_verify',
          summary: 'Terkonfirmasi Live Otomatis di Google Maps sesuai Master BRI',
          changes: job.changes.map((c) => ({ fieldLabel: c.fieldLabel, previousValue: c.previousValue, newValue: c.newValue })),
        });
        verifiedCount++;
      }
    }

    savePersistedState();
    res.json({
      jobs: appState.syncJobs,
      verifiedCount,
      checkedCount: Math.min(pendingJobs.length, 15),
    });
  });

  // Data Change History & Unauthorized Listing Takeover Security Alerts (Requirement 3)
  app.get('/api/history-alerts', (_req, res) => {
    res.json({
      changeHistory: appState.changeHistory,
      securityAlerts: appState.securityAlerts,
    });
  });

  app.post('/api/security/alerts/:id/resolve', (req, res) => {
    const { action } = req.body ?? {};
    const alert = appState.securityAlerts.find((a) => a.id === req.params.id);
    if (!alert) {
      res.status(404).json({ error: 'Alert keamanan tidak ditemukan.' });
      return;
    }

    const user = getAuthenticatedUser(req);
    const actor = user?.username || 'brioutlet';
    const nowLabel = formatWibNow();
    const merged = getMergedBranches();
    const branch = merged.find((b) => b.id === alert.branchId);

    let syncJob: GoogleSyncJob | null = null;
    let updatedBranch: ServerBranch | undefined = branch;
    let historyEvent: ChangeHistoryEvent | null = null;

    if (action === 'mitigate' && branch) {
      appState.masterOverrides[branch.id] = {
        ...(appState.masterOverrides[branch.id] ?? {}),
        syncStatus: 'pending_review',
        discrepancies: [],
        lastSyncedAt: nowLabel,
      };
      updatedBranch = { ...branch, ...appState.masterOverrides[branch.id] };

      syncJob = {
        id: `SYNC-SEC-${Date.now().toString(36).toUpperCase()}-${branch.code}`,
        branchId: branch.id,
        branchCode: branch.code,
        branchName: branch.name,
        regionShort: branch.regionShort,
        submittedBy: actor,
        submittedAt: nowLabel,
        status: 'pending_review',
        googlePlaceId: branch.googlePlaceId,
        googleMapsUri: branch.googleMapsUri,
        gbpLocationName: branch.gbpLocationName,
        deliveryChannel: 'review_queue',
        changes: [
          {
            field: alert.fieldChanged.toLowerCase().includes('telepon') ? 'phone' : 'name',
            fieldLabel: `Pemulihan Keamanan: ${alert.fieldChanged}`,
            previousValue: alert.attemptedValue,
            newValue: alert.masterValue,
          },
        ],
        note: `Pemulihan otomatis terhadap upaya perubahan tidak sah (${alert.suspectActor}).`,
      };
      appState.syncJobs.unshift(syncJob);

      historyEvent = recordChangeHistory({
        branchId: branch.id,
        branchCode: branch.code,
        branchName: branch.name,
        regionShort: branch.regionShort,
        actor,
        source: 'security_restore',
        summary: `Pulihkan listing ke Master BRI & tolak edit tidak sah (${alert.suspectActor})`,
        changes: [
          {
            fieldLabel: alert.fieldChanged,
            previousValue: alert.attemptedValue,
            newValue: alert.masterValue,
          },
        ],
      });

      alert.status = 'mitigated';
    } else {
      alert.status = 'dismissed';
      if (branch) {
        historyEvent = recordChangeHistory({
          branchId: branch.id,
          branchCode: branch.code,
          branchName: branch.name,
          regionShort: branch.regionShort,
          actor,
          source: 'security_restore',
          summary: `Alert keamanan ditandai aman / terverifikasi oleh ${actor}`,
          changes: [
            {
              fieldLabel: alert.fieldChanged,
              previousValue: alert.attemptedValue,
              newValue: 'Terverifikasi aman',
            },
          ],
        });
      }
    }

    alert.resolvedBy = actor;
    alert.resolvedAt = nowLabel;
    savePersistedState();

    res.json({
      alert,
      branch: updatedBranch,
      syncJob,
      historyEvent,
    });
  });

  app.post('/api/security/scan', (req, res) => {
    const { gbpAccountEmail } = req.body ?? {};
    const nowLabel = formatWibNow();
    const merged = getMergedBranches();
    let newAlertsCount = 0;

    // 1. Check connected GBP email domain if provided
    if (
      typeof gbpAccountEmail === 'string' &&
      gbpAccountEmail.trim() &&
      !gbpAccountEmail.toLowerCase().endsWith('@bri.co.id')
    ) {
      const existingEmailAlert = appState.securityAlerts.find(
        (a) =>
          a.status === 'active' &&
          a.alertType === 'unknown_account' &&
          a.suspectActor.includes(gbpAccountEmail.trim())
      );
      if (!existingEmailAlert) {
        const sample = merged[0];
        if (sample) {
          appState.securityAlerts.unshift({
            id: `SEC-ACC-${Date.now().toString(36).toUpperCase()}`,
            detectedAt: nowLabel,
            branchId: sample.id,
            branchCode: sample.code,
            branchName: 'Profil Akun Pengelola GBP',
            regionShort: sample.regionShort,
            alertType: 'unknown_account',
            severity: 'high',
            suspectActor: gbpAccountEmail.trim(),
            fieldChanged: 'Akses Akun Google Business Profile',
            attemptedValue: `Login eksternal non-korporat (${gbpAccountEmail.trim()})`,
            masterValue: 'Akun resmi korporat @bri.co.id',
            description:
              'Terdeteksi akun Google di luar domain korporat @bri.co.id terhubung sebagai pengelola profil lokasi.',
            status: 'active',
          });
          newAlertsCount++;
        }
      }
    }

    // 2. Scan branches with unmitigated critical takeover / suspicious contact discrepancies
    const suspiciousBranches = merged
      .filter(
        (b) =>
          b.syncStatus === 'action_required' &&
          b.discrepancies.some((d) => d.field === 'phone' || d.field === 'coordinates' || d.field === 'website')
      )
      .slice(0, 15);

    for (const b of suspiciousBranches) {
      const alreadyActive = appState.securityAlerts.some(
        (a) => a.branchId === b.id && a.status === 'active'
      );
      if (alreadyActive) continue;

      const disc = b.discrepancies.find((d) => d.field === 'phone' || d.field === 'coordinates' || d.field === 'website');
      if (!disc) continue;

      appState.securityAlerts.unshift({
        id: `SEC-SCN-${Date.now().toString(36).toUpperCase()}-${b.code}`,
        detectedAt: nowLabel,
        branchId: b.id,
        branchCode: b.code,
        branchName: b.name,
        regionShort: b.regionShort,
        alertType: disc.field === 'phone' ? 'suspicious_contact' : 'takeover_attempt',
        severity: 'critical',
        suspectActor: 'Akun Eksternal Google Maps (Tidak Dikenal)',
        fieldChanged: disc.fieldLabel,
        attemptedValue: disc.gbpValue,
        masterValue: disc.masterValue,
        description: disc.reason,
        status: 'active',
      });
      newAlertsCount++;
      if (newAlertsCount >= 5) break;
    }

    savePersistedState();
    res.json({
      securityAlerts: appState.securityAlerts,
      newAlertsCount,
    });
  });

  // Google Maps Places API (New) Server Proxy (auto-ingests real Google Maps reviews when branchId is given)
  app.post('/api/maps/places/lookup', async (req, res) => {
    const { branchId, query, lat, lng } = req.body ?? {};
    const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      res.json({ configured: false, reason: 'NO_SERVER_KEY' });
      return;
    }

    if (typeof query !== 'string' || !query.trim()) {
      res.status(400).json({ error: 'Parameter query pencarian lokasi wajib diisi.' });
      return;
    }

    try {
      const endpoint = 'https://places.googleapis.com/v1/places:searchText';
      const fieldMask = [
        'places.id',
        'places.displayName',
        'places.formattedAddress',
        'places.nationalPhoneNumber',
        'places.regularOpeningHours',
        'places.rating',
        'places.userRatingCount',
        'places.reviews',
        'places.googleMapsUri',
        'places.location',
      ].join(',');

      const body: Record<string, unknown> = {
        textQuery: query.trim(),
        languageCode: 'id',
        regionCode: 'ID',
        pageSize: 3,
      };

      if (typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)) {
        body.locationBias = {
          circle: {
            center: { latitude: lat, longitude: lng },
            radius: 10000.0,
          },
        };
      }

      const gmpRes = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': fieldMask,
          'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio',
        },
        body: JSON.stringify(body),
      });

      if (gmpRes.status === 429) {
        res.status(429).json({ error: 'RESOURCE_EXHAUSTED', quotaExceeded: true });
        return;
      }

      const payload = (await gmpRes.json()) as {
        places?: Array<{
          id?: string;
          displayName?: { text?: string };
          formattedAddress?: string;
          nationalPhoneNumber?: string;
          regularOpeningHours?: { weekdayDescriptions?: string[] };
          rating?: number;
          userRatingCount?: number;
          googleMapsUri?: string;
          location?: { latitude?: number; longitude?: number };
          reviews?: Array<{
            name?: string;
            rating?: number;
            relativePublishTimeDescription?: string;
            publishTime?: string;
            googleMapsUri?: string;
            text?: { text?: string };
            originalText?: { text?: string };
            authorAttribution?: {
              displayName?: string;
              uri?: string;
              photoUri?: string;
            };
          }>;
        }>;
        error?: { message?: string; status?: string };
      };

      if (!gmpRes.ok) {
        if (payload.error?.status === 'RESOURCE_EXHAUSTED') {
          res.status(429).json({ error: 'RESOURCE_EXHAUSTED', quotaExceeded: true });
          return;
        }
        res.status(gmpRes.status).json({
          error: payload.error?.message || 'Gagal mengambil data Places API (New).',
        });
        return;
      }

      const place = payload.places?.[0];
      if (!place) {
        if (typeof branchId === 'string' && branchId.trim()) {
          appState.masterOverrides[branchId.trim()] = {
            ...(appState.masterOverrides[branchId.trim()] ?? {}),
            mapsNotFound: true,
          };
          savePersistedState();
        }
        res.json({ configured: true, place: null });
        return;
      }

      // Live suspicious contact / unauthorized listing change detection
      if (typeof branchId === 'string' && branchId.trim()) {
        const target = getMergedBranches().find((b) => b.id === branchId.trim());
        if (target && place.nationalPhoneNumber) {
          const liveDigits = place.nationalPhoneNumber.replace(/[^\d]/g, '');
          const masterDigits = (target.phone || '1500017').replace(/[^\d]/g, '');
          const isMobileOrUnknown =
            liveDigits.length >= 8 &&
            liveDigits !== masterDigits &&
            !liveDigits.endsWith('1500017');
          if (isMobileOrUnknown) {
            const existsActive = appState.securityAlerts.some(
              (a) => a.branchId === target.id && a.status === 'active' && a.attemptedValue === place.nationalPhoneNumber
            );
            if (!existsActive) {
              appState.securityAlerts.unshift({
                id: `SEC-LIVE-${Date.now().toString(36).toUpperCase()}-${target.code}`,
                detectedAt: formatWibNow(),
                branchId: target.id,
                branchCode: target.code,
                branchName: target.name,
                regionShort: target.regionShort,
                alertType: 'suspicious_contact',
                severity: 'critical',
                suspectActor: 'Listing Publik Google Maps (Perubahan Eksternal)',
                fieldChanged: 'Nomor Telepon Google Maps Live',
                attemptedValue: place.nationalPhoneNumber,
                masterValue: target.phone || '1500017',
                description:
                  'Terdeteksi nomor telepon tidak sesuai Master BRI (bukan 1500017) pada profil Google Maps aktif.',
                status: 'active',
              });
            }
          }
        }
        appState.masterOverrides[branchId.trim()] = {
          ...(appState.masterOverrides[branchId.trim()] ?? {}),
          mapsNotFound: false,
          googlePlaceId: place.id || appState.masterOverrides[branchId.trim()]?.googlePlaceId,
          googleMapsUri: place.googleMapsUri || appState.masterOverrides[branchId.trim()]?.googleMapsUri,
        };
      }

      const mappedReviews = (place.reviews ?? []).map((rev, idx) => ({
        id: rev.name || `GMP-${place.id}-${idx}`,
        authorName: rev.authorAttribution?.displayName || 'Pengguna Google Maps',
        authorUri: rev.authorAttribution?.uri,
        authorPhotoUri: rev.authorAttribution?.photoUri,
        rating: typeof rev.rating === 'number' ? rev.rating : 5,
        text: rev.text?.text || rev.originalText?.text || '(Ulasan tanpa teks)',
        relativeTime: rev.relativePublishTimeDescription || 'Baru-baru ini',
        publishTime: rev.publishTime,
        googleMapsUri: rev.googleMapsUri || place.googleMapsUri,
      }));

      // Automatically ingest real Google Maps reviews into centralized inbox when branchId is known
      let autoSyncedCount = 0;
      if (typeof branchId === 'string' && branchId.trim()) {
        const merged = getMergedBranches();
        const targetBranch = merged.find((b) => b.id === branchId.trim());
        if (targetBranch) {
          if (!appState.scannedReviewBranchIds.includes(targetBranch.id)) {
            appState.scannedReviewBranchIds.push(targetBranch.id);
          }
          if (mappedReviews.length > 0) {
            const existingMap = new Map(appState.reviews.map((r) => [r.id, r]));
            for (const raw of mappedReviews) {
              const prev = existingMap.get(raw.id);
              const sentiment: StoredReview['sentiment'] =
                raw.rating >= 4 ? 'Positif' : raw.rating === 3 ? 'Netral' : 'Perlu Perhatian';
              const formattedTime =
                formatGooglePublishTimeWib(raw.publishTime) || raw.relativeTime || 'Dari Google Maps';
              existingMap.set(raw.id, prev
                ? {
                    ...prev,
                    authorName: raw.authorName || prev.authorName,
                    authorUri: raw.authorUri || prev.authorUri,
                    comment: raw.text,
                    rating: raw.rating,
                    createdAt: formattedTime,
                    publishTime: raw.publishTime || prev.publishTime,
                    googleMapsUri: raw.googleMapsUri || prev.googleMapsUri,
                    source: 'google_maps',
                  }
                : {
                    id: raw.id,
                    branchId: targetBranch.id,
                    branchCode: targetBranch.code,
                    branchName: targetBranch.name,
                    regionShort: targetBranch.regionShort,
                    authorName: raw.authorName,
                    authorUri: raw.authorUri,
                    rating: raw.rating,
                    comment: raw.text,
                    createdAt: formattedTime,
                    publishTime: raw.publishTime,
                    sentiment,
                    replyStatus: 'unreplied',
                    source: 'google_maps',
                    googleMapsUri: raw.googleMapsUri,
                  });
              autoSyncedCount++;
            }
            const nextReviews = Array.from(existingMap.values()).filter(
              (r) => !(r.id.startsWith('REV-2026-') && r.replyStatus === 'unreplied')
            );
            nextReviews.sort((a, b) => {
              const ta = a.publishTime ? new Date(a.publishTime).getTime() : 0;
              const tb = b.publishTime ? new Date(b.publishTime).getTime() : 0;
              return tb - ta;
            });
            appState.reviews = nextReviews;
          }
          savePersistedState();
        }
      }

      res.json({
        configured: true,
        autoSyncedCount,
        place: {
          placeId: place.id || '',
          displayName: place.displayName?.text || query,
          formattedAddress: place.formattedAddress || '',
          nationalPhoneNumber: place.nationalPhoneNumber,
          weekdayDescriptions: place.regularOpeningHours?.weekdayDescriptions ?? [],
          rating: place.rating,
          userRatingCount: place.userRatingCount,
          googleMapsUri: place.googleMapsUri,
          lat: place.location?.latitude,
          lng: place.location?.longitude,
          reviews: mappedReviews,
          fetchedAt: formatWibNow(),
        },
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Gagal menghubungi Google Places API.',
      });
    }
  });

  async function runBatchGoogleReviewsSync(opts?: {
    regionShort?: string;
    tier?: string;
    limit?: number;
    onlyUncrawled?: boolean;
  }): Promise<{
    reviews: StoredReview[];
    importedCount: number;
    scannedNow: number;
    totalScannedBranches: number;
    totalBranches: number;
    updatedBranches: ServerBranch[];
  }> {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;
    const merged = getMergedBranches();
    if (!apiKey) {
      return {
        reviews: appState.reviews,
        importedCount: 0,
        scannedNow: 0,
        totalScannedBranches: appState.scannedReviewBranchIds.length,
        totalBranches: merged.length,
        updatedBranches: [],
      };
    }

    const limit = Math.min(120, Math.max(1, Number(opts?.limit) || 36));
    const regionShort = opts?.regionShort && opts.regionShort !== 'ALL' ? opts.regionShort : 'ALL';
    const tier = opts?.tier && opts.tier !== 'ALL' ? opts.tier : 'ALL';
    const onlyUncrawled = opts?.onlyUncrawled !== false;
    const scannedSet = new Set(appState.scannedReviewBranchIds);

    const tierWeight = (t: BranchTier) =>
      t === 'KC' ? 0 : t === 'RO' ? 1 : t === 'KCP' ? 2 : t === 'KK' ? 3 : t === 'UNIT' ? 4 : 5;

    let candidates = merged.filter((b) => {
      if (regionShort !== 'ALL' && b.regionShort !== regionShort) return false;
      if (tier !== 'ALL' && b.tier !== tier) return false;
      if (onlyUncrawled && scannedSet.has(b.id)) return false;
      return b.lat !== 0 && b.lng !== 0;
    });

    if (candidates.length === 0 && onlyUncrawled) {
      // Fallback to re-checking units if all in filter were already scanned
      candidates = merged.filter((b) => {
        if (regionShort !== 'ALL' && b.regionShort !== regionShort) return false;
        if (tier !== 'ALL' && b.tier !== tier) return false;
        return b.lat !== 0 && b.lng !== 0;
      });
    }

    // Round-robin distribute across all 18 Regional Offices so coverage spans Indonesia
    const byRegion = new Map<string, ServerBranch[]>();
    for (const b of candidates) {
      const list = byRegion.get(b.regionShort) || [];
      list.push(b);
      byRegion.set(b.regionShort, list);
    }
    for (const list of byRegion.values()) {
      list.sort((a, b) => tierWeight(a.tier) - tierWeight(b.tier));
    }

    const picked: ServerBranch[] = [];
    const regionLists = Array.from(byRegion.values());
    let idx = 0;
    while (picked.length < limit && regionLists.some((l) => l.length > 0)) {
      const bucket = regionLists[idx % regionLists.length];
      if (bucket && bucket.length > 0) {
        picked.push(bucket.shift()!);
      }
      idx++;
    }

    const existingMap = new Map(appState.reviews.map((r) => [r.id, r]));
    const newlyImported: StoredReview[] = [];
    const updatedBranches: ServerBranch[] = [];

    const queue = [...picked];
    let quotaHit = false;
    const concurrency = Math.min(2, Math.max(1, queue.length));
    const workers = Array.from({ length: concurrency }, async () => {
      while (queue.length > 0 && !quotaHit) {
        const b = queue.shift();
        if (!b) break;
        try {
          const gmpRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': apiKey,
              'X-Goog-FieldMask':
                'places.id,places.displayName,places.rating,places.userRatingCount,places.reviews,places.googleMapsUri,places.location',
              'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio',
            },
            body: JSON.stringify({
              textQuery: `BRI ${b.name} ${b.city}`.trim(),
              languageCode: 'id',
              regionCode: 'ID',
              pageSize: 1,
              locationBias: {
                circle: {
                  center: { latitude: b.lat, longitude: b.lng },
                  radius: 10000.0,
                },
              },
            }),
          });

          if (gmpRes.status === 429) {
            quotaHit = true;
            break;
          }
          if (!gmpRes.ok) {
            await new Promise((r) => setTimeout(r, 150));
            continue;
          }
          const payload = (await gmpRes.json()) as {
            places?: Array<{
              id?: string;
              rating?: number;
              userRatingCount?: number;
              googleMapsUri?: string;
              location?: { latitude?: number; longitude?: number };
              reviews?: Array<{
                name?: string;
                rating?: number;
                relativePublishTimeDescription?: string;
                publishTime?: string;
                googleMapsUri?: string;
                text?: { text?: string };
                originalText?: { text?: string };
                authorAttribution?: { displayName?: string; uri?: string };
              }>;
            }>;
          };

          const place = payload.places?.[0];
          scannedSet.add(b.id);
          if (!place) continue;

          if (typeof place.rating === 'number' || typeof place.userRatingCount === 'number' || place.id) {
            const ov = appState.masterOverrides[b.id] ?? {};
            appState.masterOverrides[b.id] = {
              ...ov,
              googlePlaceId: place.id || ov.googlePlaceId || b.googlePlaceId,
              googleMapsUri: place.googleMapsUri || ov.googleMapsUri || b.googleMapsUri,
              gbpLat: typeof place.location?.latitude === 'number' ? place.location.latitude : ov.gbpLat,
              gbpLng: typeof place.location?.longitude === 'number' ? place.location.longitude : ov.gbpLng,
            };
            updatedBranches.push({
              ...b,
              ...appState.masterOverrides[b.id],
              rating: typeof place.rating === 'number' ? place.rating : b.rating,
              reviewCount: typeof place.userRatingCount === 'number' ? place.userRatingCount : b.reviewCount,
            });
          }

          for (const [rIdx, raw] of (place.reviews ?? []).entries()) {
            const text = raw.text?.text || raw.originalText?.text;
            if (!text) continue;
            const id = raw.name || `GMP-${place.id}-${b.id}-${rIdx}`;
            const prev = existingMap.get(id);
            const rating = typeof raw.rating === 'number' ? raw.rating : 5;
            const sentiment: StoredReview['sentiment'] =
              rating >= 4 ? 'Positif' : rating === 3 ? 'Netral' : 'Perlu Perhatian';
            const formattedTime =
              formatGooglePublishTimeWib(raw.publishTime) ||
              raw.relativePublishTimeDescription ||
              'Dari Google Maps';

            const item: StoredReview = prev
              ? {
                  ...prev,
                  authorName: raw.authorAttribution?.displayName || prev.authorName,
                  authorUri: raw.authorAttribution?.uri || prev.authorUri,
                  comment: text,
                  rating,
                  createdAt: formattedTime,
                  publishTime: raw.publishTime || prev.publishTime,
                  googleMapsUri: raw.googleMapsUri || place.googleMapsUri || prev.googleMapsUri,
                  source: 'google_maps',
                }
              : {
                  id,
                  branchId: b.id,
                  branchCode: b.code,
                  branchName: b.name,
                  regionShort: b.regionShort,
                  authorName: raw.authorAttribution?.displayName || 'Nasabah Google Maps',
                  authorUri: raw.authorAttribution?.uri,
                  rating,
                  comment: text,
                  createdAt: formattedTime,
                  publishTime: raw.publishTime,
                  sentiment,
                  replyStatus: 'unreplied',
                  source: 'google_maps',
                  googleMapsUri: raw.googleMapsUri || place.googleMapsUri,
                };
            existingMap.set(item.id, item);
            newlyImported.push(item);
          }
        } catch {
          // Skip individual place error and continue batch
        }
        if (!quotaHit && queue.length > 0) {
          await new Promise((r) => setTimeout(r, 150));
        }
      }
    });

    await Promise.all(workers);

    appState.scannedReviewBranchIds = Array.from(scannedSet);

    if (newlyImported.length > 0) {
      const mergedReviews = Array.from(existingMap.values()).filter(
        (r) => !(r.id.startsWith('REV-2026-') && r.replyStatus === 'unreplied')
      );
      mergedReviews.sort((a, b) => {
        const ta = a.publishTime ? new Date(a.publishTime).getTime() : 0;
        const tb = b.publishTime ? new Date(b.publishTime).getTime() : 0;
        return tb - ta;
      });
      appState.reviews = mergedReviews;
    }

    savePersistedState();

    return {
      reviews: appState.reviews,
      importedCount: newlyImported.length,
      scannedNow: picked.length,
      totalScannedBranches: appState.scannedReviewBranchIds.length,
      totalBranches: merged.length,
      updatedBranches,
    };
  }

  let initialReviewsHydrationPromise: Promise<void> | null = null;
  let isAutoSyncRunning = false;

  function triggerInitialReviewsHydration() {
    const TARGET_INITIAL_UNITS = 36; // 2 units per Regional Office across all 18 ROs automatically
    if (appState.scannedReviewBranchIds.length >= TARGET_INITIAL_UNITS) {
      return Promise.resolve();
    }
    if (!initialReviewsHydrationPromise) {
      isAutoSyncRunning = true;
      const needed = Math.min(36, Math.max(1, TARGET_INITIAL_UNITS - appState.scannedReviewBranchIds.length));
      initialReviewsHydrationPromise = runBatchGoogleReviewsSync({
        regionShort: 'ALL',
        limit: needed,
        onlyUncrawled: true,
      })
        .then(() => undefined)
        .catch(() => undefined)
        .finally(() => {
          isAutoSyncRunning = false;
          initialReviewsHydrationPromise = null;
        });
    }
    return initialReviewsHydrationPromise;
  }

  // Reviews Inbox Persistence & Automatic Multi-Location Real Sync
  app.get('/api/reviews', async (_req, res) => {
    await Promise.race([
      triggerInitialReviewsHydration(),
      new Promise((resolve) => setTimeout(resolve, 6500)),
    ]);
    res.json({
      reviews: appState.reviews,
      scannedBranchIds: appState.scannedReviewBranchIds,
      totalBranches: baseBranches.length + (appState.addedBranches?.length ?? 0),
      autoSyncInProgress: isAutoSyncRunning,
    });
  });

  app.post('/api/reviews/sync-batch', async (req, res) => {
    const { regionShort, tier, limit, onlyUncrawled } = req.body ?? {};
    const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      res.status(503).json({ error: 'Kunci Google Maps Places API belum dikonfigurasi pada server.' });
      return;
    }
    try {
      const result = await runBatchGoogleReviewsSync({
        regionShort: typeof regionShort === 'string' ? regionShort : 'ALL',
        tier: typeof tier === 'string' ? tier : 'ALL',
        limit: typeof limit === 'number' ? limit : 54,
        onlyUncrawled: onlyUncrawled !== false,
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Gagal menarik ulasan Google Maps secara massal.',
      });
    }
  });

  app.post('/api/reviews/import-google', (req, res) => {
    const { branchId, branchCode, branchName, regionShort, reviews } = req.body ?? {};
    if (!branchId || !Array.isArray(reviews)) {
      res.status(400).json({ error: 'Data ulasan Google Maps tidak lengkap.' });
      return;
    }

    const existingMap = new Map(appState.reviews.map((r) => [r.id, r]));
    const imported: StoredReview[] = [];

    for (const raw of reviews as Array<{
      id: string;
      authorName: string;
      authorUri?: string;
      rating: number;
      text: string;
      relativeTime: string;
      publishTime?: string;
      googleMapsUri?: string;
    }>) {
      if (!raw.id || !raw.text) continue;
      const prev = existingMap.get(raw.id);
      const rating = typeof raw.rating === 'number' ? raw.rating : 5;
      const sentiment: StoredReview['sentiment'] =
        rating >= 4 ? 'Positif' : rating === 3 ? 'Netral' : 'Perlu Perhatian';
      const formattedTime =
        formatGooglePublishTimeWib(raw.publishTime) || raw.relativeTime || 'Dari Google Maps';

      const item: StoredReview = prev
        ? {
            ...prev,
            authorName: raw.authorName || prev.authorName,
            authorUri: raw.authorUri || prev.authorUri,
            comment: raw.text,
            rating,
            createdAt: formattedTime,
            publishTime: raw.publishTime || prev.publishTime,
            googleMapsUri: raw.googleMapsUri || prev.googleMapsUri,
            source: 'google_maps',
          }
        : {
            id: raw.id,
            branchId,
            branchCode: branchCode || '-',
            branchName: branchName || 'Unit BRI',
            regionShort: regionShort || 'BRI',
            authorName: raw.authorName || 'Nasabah Google Maps',
            authorUri: raw.authorUri,
            rating,
            comment: raw.text,
            createdAt: formattedTime,
            publishTime: raw.publishTime,
            sentiment,
            replyStatus: 'unreplied',
            source: 'google_maps',
            googleMapsUri: raw.googleMapsUri,
          };

      existingMap.set(item.id, item);
      imported.push(item);
    }

    imported.sort((a, b) => {
      const ta = a.publishTime ? new Date(a.publishTime).getTime() : 0;
      const tb = b.publishTime ? new Date(b.publishTime).getTime() : 0;
      return tb - ta;
    });

    if (!appState.scannedReviewBranchIds.includes(branchId)) {
      appState.scannedReviewBranchIds.push(branchId);
    }

    // Put newly imported Google Maps reviews at top while preserving existing order
    const importedIds = new Set(imported.map((i) => i.id));
    const others = appState.reviews.filter(
      (r) => !importedIds.has(r.id) && !(r.id.startsWith('REV-2026-') && r.replyStatus === 'unreplied')
    );
    appState.reviews = [...imported, ...others];
    savePersistedState();

    res.json({
      reviews: appState.reviews,
      importedCount: imported.length,
      scannedBranchIds: appState.scannedReviewBranchIds,
    });
  });

  app.post('/api/reviews/:id/reply', async (req, res) => {
    const { replyText, gbpAccessToken } = req.body ?? {};
    if (typeof replyText !== 'string' || !replyText.trim()) {
      res.status(400).json({ error: 'Teks balasan wajib diisi.' });
      return;
    }

    const review = appState.reviews.find((r) => r.id === req.params.id);
    if (!review) {
      res.status(404).json({ error: 'Ulasan tidak ditemukan.' });
      return;
    }

    let publishedToGbp = false;
    if (review.gbpReviewName && typeof gbpAccessToken === 'string' && gbpAccessToken.trim()) {
      const gbpRes = await fetch(
        `https://mybusiness.googleapis.com/v4/${review.gbpReviewName}/reply`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${gbpAccessToken.trim()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ comment: replyText.trim() }),
        }
      );
      if (!gbpRes.ok) {
        const errPayload = (await gbpRes.json().catch(() => ({}))) as { error?: { message?: string } };
        res.status(gbpRes.status).json({
          error:
            errPayload.error?.message ||
            'Gagal mempublikasikan balasan ke Google Business Profile API.',
        });
        return;
      }
      publishedToGbp = true;
    }

    review.replyStatus = 'replied';
    review.replyText = replyText.trim();
    review.repliedAt = formatWibNow();
    savePersistedState();

    res.json({ review, publishedToGbp });
  });

  app.post('/api/ops/reset', async (_req, res) => {
    appState.masterOverrides = {};
    appState.addedBranches = [];
    appState.gbpLinks = {};
    appState.syncJobs = [];
    appState.changeHistory = [];
    appState.securityAlerts = [];
    seedInitialSecurityAlertsIfEmpty();
    appState.reviews = DEFAULT_REVIEWS;
    appState.scannedReviewBranchIds = [];
    initialReviewsHydrationPromise = null;
    savePersistedState();
    await Promise.race([
      triggerInitialReviewsHydration(),
      new Promise((resolve) => setTimeout(resolve, 4000)),
    ]);
    res.json({ ok: true });
  });

  // Gemini AI Reply Suggestion
  app.post('/api/reviews/suggest', async (req, res) => {
    const { branchName, branchCode, authorName, rating, comment } = req.body ?? {};

    if (!branchName || !comment || typeof rating !== 'number') {
      res.status(400).json({
        error: 'Data ulasan tidak lengkap untuk menghasilkan saran balasan.',
      });
      return;
    }

    if (!aiClient) {
      res.status(503).json({
        error: 'Kunci Gemini API (GEMINI_API_KEY) belum dikonfigurasi pada server.',
      });
      return;
    }

    try {
      const prompt = `Buat 3 variasi balasan resmi berbahasa Indonesia untuk ulasan nasabah Bank Rakyat Indonesia (BRI) berikut:
- Unit Kerja: ${branchName} (Kode: ${branchCode || '-'})
- Nama Nasabah: ${authorName || 'Nasabah'}
- Rating: ${rating} dari 5 bintang
- Ulasan Nasabah: "${comment}"

Berikan tepat 3 draf balasan yang sopan, hangat, tidak defensif, ringkas (maksimal 2-3 kalimat per draf), mencerminkan standar layanan BRI ("Melayani Dengan Setulus Hati"), dan tidak meminta data sensitif seperti PIN/OTP/nomor kartu di kolom komentar publik:
1. Nada "empatik" (label: "Profesional & Empatik")
2. Nada "prosedural" (label: "Klarifikasi Prosedur")
3. Nada "apresiatif" (label: "Apresiasi Singkat")`;

      const response = await aiClient.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction:
            'Anda adalah Spesialis Komunikasi Nasabah & Reputasi Bank BRI (Bank Rakyat Indonesia). Tulis balasan ulasan Google Business Profile yang akurat, berempati, dan profesional dalam Bahasa Indonesia baku namun ramah.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              suggestions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    tone: {
                      type: Type.STRING,
                      description: 'Salah satu dari: empatik, prosedural, apresiatif',
                    },
                    label: {
                      type: Type.STRING,
                      description: 'Label singkat nada balasan dalam Bahasa Indonesia',
                    },
                    text: {
                      type: Type.STRING,
                      description: 'Teks draf balasan siap kirim dalam Bahasa Indonesia',
                    },
                  },
                  required: ['tone', 'label', 'text'],
                },
              },
            },
            required: ['suggestions'],
          },
        },
      });

      const rawText = (response.text ?? '').trim();
      const parsed = JSON.parse(rawText || '{}') as {
        suggestions?: Array<{ tone?: string; label?: string; text?: string }>;
      };

      const suggestions = Array.isArray(parsed.suggestions)
        ? parsed.suggestions.slice(0, 3).map((item, idx) => ({
            tone:
              item.tone === 'prosedural' || item.tone === 'apresiatif'
                ? item.tone
                : idx === 1
                  ? 'prosedural'
                  : idx === 2
                    ? 'apresiatif'
                    : 'empatik',
            label:
              item.label ||
              (idx === 0
                ? 'Profesional & Empatik'
                : idx === 1
                  ? 'Klarifikasi Prosedur'
                  : 'Apresiasi Singkat'),
            text: item.text || '',
          }))
        : [];

      if (suggestions.length === 0) {
        res.status(502).json({
          error: 'Respons AI tidak memuat saran balasan yang valid. Silakan coba lagi.',
        });
        return;
      }

      res.json({ suggestions });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gagal menghubungi layanan Gemini AI';
      res.status(500).json({
        error: `Gagal membuat saran jawaban otomatis: ${message}`,
      });
    }
  });

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT} (${baseBranches.length} BRI locations indexed)`);
    triggerInitialReviewsHydration();
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
