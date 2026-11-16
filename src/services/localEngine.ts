import type {
  AuthUser,
  BatchMarkFixPayload,
  BranchLocation,
  BranchOverride,
  BranchTier,
  BulkImportRowInput,
  ChangeHistoryEvent,
  CustomerReview,
  DailyHoursEntry,
  GoogleSyncChange,
  GoogleSyncJob,
  ListingSecurityAlert,
  ReviewSentiment,
  ReviewSuggestion,
  SyncDiscrepancy,
  SyncStatus,
  WeeklyHoursSchedule,
} from '../types/ops';

export interface BackendResult<T> {
  available: boolean;
  ok: boolean;
  status: number;
  data?: T;
}

export async function tryBackendJson<T>(
  url: string,
  options?: RequestInit
): Promise<BackendResult<T>> {
  try {
    const res = await fetch(url, options);
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    // Static hosts like Vercel return text/html 404/SPA index on missing /api/* routes
    if (!ct.includes('application/json')) {
      return { available: false, ok: false, status: res.status };
    }
    if (res.status === 404 || res.status === 405 || res.status >= 502) {
      return { available: false, ok: false, status: res.status };
    }
    const data = (await res.json()) as T;
    return { available: true, ok: res.ok, status: res.status, data };
  } catch {
    return { available: false, ok: false, status: 0 };
  }
}

export function formatWibNow(): string {
  const now = new Date();
  const formatted = now.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${formatted} WIB`;
}

// ============================================================================
// 1. CLIENT-SIDE AUTHENTICATION (localStorage fallback for static Vercel)
// ============================================================================

const LOCAL_USERS_KEY = 'bri_ops_local_users_v1';
const LOCAL_SESSIONS_KEY = 'bri_ops_local_sessions_v1';

interface LocalStoredUser {
  username: string;
  email: string;
  fullName: string;
  role: string;
  password: string;
  verified: boolean;
  verificationCode?: string;
  verificationExpiresAt?: number;
}

interface LocalVerificationPreview {
  to: string;
  subject: string;
  code: string;
  sentAt: string;
}

function getDefaultLocalUsers(): LocalStoredUser[] {
  return [
    {
      username: 'brioutlet',
      email: 'operasional@bri.co.id',
      fullName: 'Tim Operasional Outlet BRI',
      role: 'Administrator Jaringan',
      password: '11111',
      verified: true,
    },
  ];
}

function readLocalUsers(): LocalStoredUser[] {
  try {
    const raw = window.localStorage.getItem(LOCAL_USERS_KEY);
    if (!raw) {
      const defaults = getDefaultLocalUsers();
      window.localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(defaults));
      return defaults;
    }
    const parsed = JSON.parse(raw) as LocalStoredUser[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      const defaults = getDefaultLocalUsers();
      window.localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(defaults));
      return defaults;
    }
    // Always ensure default brioutlet exists
    if (!parsed.some((u) => u.username.toLowerCase() === 'brioutlet')) {
      parsed.unshift(getDefaultLocalUsers()[0]);
      window.localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(parsed));
    }
    return parsed;
  } catch {
    return getDefaultLocalUsers();
  }
}

function writeLocalUsers(users: LocalStoredUser[]) {
  try {
    window.localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
  } catch {
    // ignore quota error
  }
}

function readLocalSessions(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(LOCAL_SESSIONS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function writeLocalSessions(sessions: Record<string, string>) {
  try {
    window.localStorage.setItem(LOCAL_SESSIONS_KEY, JSON.stringify(sessions));
  } catch {
    // ignore
  }
}

function sanitizeLocalUser(u: LocalStoredUser): AuthUser {
  return {
    username: u.username,
    email: u.email,
    fullName: u.fullName,
    role: u.role,
    verified: u.verified,
  };
}

function random6Digit(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function localGetMe(token: string): AuthUser | null {
  const sessions = readLocalSessions();
  const username = sessions[token];
  if (!username) return null;
  const users = readLocalUsers();
  const found = users.find((u) => u.username.toLowerCase() === username.toLowerCase());
  if (!found || !found.verified) return null;
  return sanitizeLocalUser(found);
}

export function localLogin(
  username: string,
  password: string
): {
  ok: boolean;
  token?: string;
  user?: AuthUser;
  error?: string;
  needsVerification?: boolean;
  email?: string;
  username?: string;
} {
  const cleanUser = (username || '').trim().toLowerCase();
  const users = readLocalUsers();
  const found = users.find((u) => u.username.toLowerCase() === cleanUser);
  if (!found || found.password !== password) {
    return { ok: false, error: 'Username atau password tidak sesuai.' };
  }
  if (!found.verified) {
    return {
      ok: false,
      error: 'Akun Anda belum menyelesaikan verifikasi email.',
      needsVerification: true,
      email: found.email,
      username: found.username,
    };
  }
  const token = `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const sessions = readLocalSessions();
  sessions[token] = found.username;
  writeLocalSessions(sessions);
  return { ok: true, token, user: sanitizeLocalUser(found) };
}

export function localRegister(payload: {
  username: string;
  email: string;
  password: string;
  fullName?: string;
}): {
  ok: boolean;
  error?: string;
  username?: string;
  email?: string;
  verificationPreview?: LocalVerificationPreview;
} {
  const cleanUsername = (payload.username || '').trim();
  const cleanEmail = (payload.email || '').trim().toLowerCase();
  const cleanPassword = payload.password || '';
  const cleanName = payload.fullName?.trim() || cleanUsername;

  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(cleanUsername)) {
    return {
      ok: false,
      error: 'Username harus 3–32 karakter (huruf, angka, titik, atau garis bawah).',
    };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return { ok: false, error: 'Format alamat email tidak valid.' };
  }
  if (cleanPassword.length < 5) {
    return { ok: false, error: 'Password minimal 5 karakter.' };
  }

  const users = readLocalUsers();
  const existingUser = users.find((u) => u.username.toLowerCase() === cleanUsername.toLowerCase());
  if (existingUser && existingUser.verified) {
    return { ok: false, error: 'Username sudah terdaftar. Gunakan username lain.' };
  }
  const existingEmail = users.find(
    (u) => u.email.toLowerCase() === cleanEmail && u.username.toLowerCase() !== cleanUsername.toLowerCase()
  );
  if (existingEmail && existingEmail.verified) {
    return { ok: false, error: 'Alamat email sudah digunakan oleh akun lain.' };
  }

  const code = random6Digit();
  const nextUser: LocalStoredUser = {
    username: cleanUsername,
    email: cleanEmail,
    fullName: cleanName,
    role: 'Operator Outlet BRI',
    password: cleanPassword,
    verified: false,
    verificationCode: code,
    verificationExpiresAt: Date.now() + 15 * 60 * 1000,
  };

  if (existingUser) {
    const idx = users.indexOf(existingUser);
    users[idx] = nextUser;
  } else {
    users.push(nextUser);
  }
  writeLocalUsers(users);

  return {
    ok: true,
    username: cleanUsername,
    email: cleanEmail,
    verificationPreview: {
      to: cleanEmail,
      subject: 'Kode Verifikasi Akun Sentra Lokasi BRI',
      code,
      sentAt: formatWibNow(),
    },
  };
}

export function localVerifyEmail(
  identifier: string,
  code: string
): { ok: boolean; token?: string; user?: AuthUser; error?: string } {
  const cleanId = (identifier || '').trim().toLowerCase();
  const cleanCode = (code || '').trim();
  const users = readLocalUsers();
  const found = users.find(
    (u) => u.username.toLowerCase() === cleanId || u.email.toLowerCase() === cleanId
  );
  if (!found) {
    return { ok: false, error: 'Akun tidak ditemukan.' };
  }
  if (found.verificationCode !== cleanCode) {
    return { ok: false, error: 'Kode verifikasi tidak sesuai. Periksa kembali 6 digit kode Anda.' };
  }
  if (found.verificationExpiresAt && Date.now() > found.verificationExpiresAt) {
    return { ok: false, error: 'Kode verifikasi sudah kedaluwarsa. Klik kirim ulang kode.' };
  }

  found.verified = true;
  delete found.verificationCode;
  delete found.verificationExpiresAt;
  writeLocalUsers(users);

  const token = `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const sessions = readLocalSessions();
  sessions[token] = found.username;
  writeLocalSessions(sessions);

  return { ok: true, token, user: sanitizeLocalUser(found) };
}

export function localResendCode(identifier: string): {
  ok: boolean;
  error?: string;
  verificationPreview?: LocalVerificationPreview;
} {
  const cleanId = (identifier || '').trim().toLowerCase();
  const users = readLocalUsers();
  const found = users.find(
    (u) => u.username.toLowerCase() === cleanId || u.email.toLowerCase() === cleanId
  );
  if (!found) {
    return { ok: false, error: 'Akun tidak ditemukan.' };
  }
  const code = random6Digit();
  found.verificationCode = code;
  found.verificationExpiresAt = Date.now() + 15 * 60 * 1000;
  writeLocalUsers(users);

  return {
    ok: true,
    verificationPreview: {
      to: found.email,
      subject: 'Kode Verifikasi Baru - Sentra Lokasi BRI',
      code,
      sentAt: formatWibNow(),
    },
  };
}

export function localLogout(token: string | null) {
  if (!token) return;
  const sessions = readLocalSessions();
  delete sessions[token];
  writeLocalSessions(sessions);
}

// ============================================================================
// 2. CLIENT-SIDE MASTER DATA, REVIEWS, ALERTS & HISTORY PERSISTENCE
// ============================================================================

const LOCAL_OPS_STATE_KEY = 'bri_ops_local_ops_state_v1';

export interface LocalOpsState {
  masterOverrides: Record<string, BranchOverride>;
  addedBranches: BranchLocation[];
  syncJobs: GoogleSyncJob[];
  reviews: CustomerReview[];
  scannedReviewBranchIds: string[];
  changeHistory: ChangeHistoryEvent[];
  securityAlerts: ListingSecurityAlert[];
}

function defaultOpsState(): LocalOpsState {
  return {
    masterOverrides: {},
    addedBranches: [],
    syncJobs: [],
    reviews: [],
    scannedReviewBranchIds: [],
    changeHistory: [],
    securityAlerts: [],
  };
}

export function readLocalOpsState(): LocalOpsState {
  try {
    const raw = window.localStorage.getItem(LOCAL_OPS_STATE_KEY);
    if (!raw) return defaultOpsState();
    const parsed = JSON.parse(raw) as Partial<LocalOpsState>;
    return {
      masterOverrides: parsed.masterOverrides ?? {},
      addedBranches: Array.isArray(parsed.addedBranches) ? parsed.addedBranches : [],
      syncJobs: Array.isArray(parsed.syncJobs) ? parsed.syncJobs : [],
      reviews: Array.isArray(parsed.reviews) ? parsed.reviews : [],
      scannedReviewBranchIds: Array.isArray(parsed.scannedReviewBranchIds)
        ? parsed.scannedReviewBranchIds
        : [],
      changeHistory: Array.isArray(parsed.changeHistory) ? parsed.changeHistory : [],
      securityAlerts: Array.isArray(parsed.securityAlerts) ? parsed.securityAlerts : [],
    };
  } catch {
    return defaultOpsState();
  }
}

export function writeLocalOpsState(state: LocalOpsState) {
  try {
    window.localStorage.setItem(LOCAL_OPS_STATE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota overflow if huge dataset overrides are saved
  }
}

export function clearLocalOpsState() {
  try {
    window.localStorage.removeItem(LOCAL_OPS_STATE_KEY);
  } catch {
    // ignore
  }
}

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function normalizeTierClient(raw: string): { tier: BranchTier; label: string } {
  const upper = (raw || '').toUpperCase().trim();
  if (upper.includes('RO') || upper.includes('KANWIL') || upper.includes('REGIONAL')) {
    return { tier: 'RO', label: 'Regional Office' };
  }
  if (upper.includes('KCP') || upper.includes('PEMBANTU')) {
    return { tier: 'KCP', label: 'Kantor Cabang Pembantu' };
  }
  if (upper.includes('KC') || upper.includes('KANTOR CABANG')) {
    return { tier: 'KC', label: 'Kantor Cabang' };
  }
  if (upper.includes('KK') || upper.includes('KAS')) {
    return { tier: 'KK', label: 'Kantor Kas' };
  }
  if (upper.includes('UNIT')) {
    return { tier: 'UNIT', label: 'BRI Unit' };
  }
  if (upper.includes('SSB')) {
    return { tier: 'SSB', label: 'Sentra Layanan' };
  }
  if (upper.includes('TERAS')) {
    return { tier: 'TERAS', label: 'Teras BRI' };
  }
  return { tier: 'LAINNYA', label: 'Titik Layanan' };
}

export function shortenRegionClient(region: string): string {
  const match = region.match(/Regional Office\s+(.+)$/i);
  if (match) return `RO ${match[1].trim()}`;
  return region;
}

export function formatHoursClient(rawHours: string): string {
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

function buildWeeklyHoursClient(
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
    return { open: fallbackOpen || Boolean(clean), hours: formatHoursClient(clean) };
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

function parseCsvLines(content: string): string[][] {
  const clean = content.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\r') {
      if (clean[i + 1] === '\n') i++;
      row.push(cell.trim());
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
      cell = '';
    } else if (ch === '\n') {
      row.push(cell.trim());
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell.trim());
    if (row.some((c) => c !== '')) rows.push(row);
  }
  return rows;
}

export function normalizeCoreBranchNameClient(raw: string): string {
  return (raw || '')
    .toLowerCase()
    .replace(
      /\b(pt|bank rakyat indonesia|bank|bri|kantor cabang pembantu|kantor cabang|kantor kas|kacab|kcp|kc|kk|unit|teras|ssb|regional office|ro)\b/g,
      ' '
    )
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export async function loadBranchesClientFallback(): Promise<BranchLocation[]> {
  try {
    const res = await fetch('/assets/aistudio/template_lokasi_bri__1__4800eb47');
    if (res.ok) {
      const text = await res.text();
      const rows = parseCsvLines(text);
      const parsed: BranchLocation[] = [];
      const seenIds = new Set<string>();

      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || r.length < 15) continue;
        const region = r[0];
        const name = r[1];
        const code = r[2] || String(i);
        if (!region.startsWith('Region ') || !name) continue;

        const parsedLat = Number.parseFloat((r[5] || '').replace(',', '.'));
        const parsedLng = Number.parseFloat((r[6] || '').replace(',', '.'));
        const lat = Number.isFinite(parsedLat) ? parsedLat : 0;
        const lng = Number.isFinite(parsedLng) ? parsedLng : 0;

        const { tier, label: tierLabel } = normalizeTierClient(r[3]);
        const address = r[7] || `${r[8] || ''} ${r[9] || ''}`.trim() || 'Alamat terverifikasi';
        const village = r[8] || '';
        const district = r[9] || '';
        const cityCode = r[10] || '';
        const city = r[11] || 'Indonesia';
        const province = r[12] || '';
        const postalCode = r[13] || '';
        const phone = (r[14] || '').trim();
        const website = (r[15] || '').trim();
        const weeklyHours = buildWeeklyHoursClient(
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
        if (seenIds.has(id)) id = `${tier}-${code.padStart(4, '0')}-${i}`;
        seenIds.add(id);

        const seed = hashSeed(`${id}:${name}`);
        const statusRoll = seed % 100;
        let syncStatus: SyncStatus = 'synced';
        const discrepancies: SyncDiscrepancy[] = [];
        let gbpLat: number | undefined;
        let gbpLng: number | undefined;

        const coordsValid =
          lat !== 0 && lng !== 0 && lat >= -11.5 && lat <= 6.5 && lng >= 94.5 && lng <= 141.5;

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

        const rating = Math.min(4.9, Number((3.9 + ((seed % 11) / 10)).toFixed(1)));
        const reviewCount = tier === 'RO' || tier === 'KC' ? 120 + (seed % 420) : 18 + (seed % 140);
        const existingPoi = (r[23] || '').trim();

        parsed.push({
          id,
          code: code.padStart(4, '0'),
          name,
          tier,
          tierLabel,
          region,
          regionShort: shortenRegionClient(region),
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

      if (parsed.length > 0) return parsed;
    }
  } catch {
    // fallback below
  }

  return [
    {
      id: 'KC-0206',
      code: '0206',
      name: 'KC Jakarta Sudirman 1',
      tier: 'KC',
      tierLabel: 'Kantor Cabang',
      region: 'Region 6 - Regional Office Jakarta 1',
      regionShort: 'RO Jakarta 1',
      address: 'Jl. Jend. Sudirman Kav. 44-46, Bendungan Hilir',
      city: 'Jakarta Pusat',
      province: 'DKI Jakarta',
      postalCode: '10210',
      phone: '1500017',
      website: 'https://bri.co.id',
      operatingHours: '08:00 - 15:00 WIB',
      saturdayHours: 'Tutup',
      lat: -6.2156,
      lng: 106.8186,
      syncStatus: 'synced',
      lastSyncedAt: 'Hari ini, 08:30 WIB',
      rating: 4.7,
      reviewCount: 342,
      discrepancies: [],
      existingPoi: 'Bank BRI KC Jakarta Sudirman 1',
    },
  ];
}

export function mergeLocalBranches(
  baseList: BranchLocation[],
  state: LocalOpsState
): BranchLocation[] {
  const combined = [...state.addedBranches, ...baseList];
  return combined.map((b) => {
    const ov = state.masterOverrides[b.id];
    return ov ? { ...b, ...ov } : b;
  });
}

export function seedLocalAlertsAndReviews(
  branches: BranchLocation[],
  state: LocalOpsState
): LocalOpsState {
  let changed = false;
  const next = { ...state };
  const now = formatWibNow();

  if (next.securityAlerts.length === 0 && branches.length > 0) {
    const candidates = branches
      .filter((b) => b.syncStatus === 'action_required' && b.discrepancies.length > 0)
      .slice(0, 8);
    const actors = [
      'Akun Publik Google Maps (Tidak Dikenal)',
      'Klaim Eksternal Belum Terverifikasi (user-ext-482@gmail.com)',
      'Saran Edit Anonim Google Maps',
      'Pengelola Eksternal Tidak Terdaftar (@bri.co.id non-aktif)',
    ];
    next.securityAlerts = candidates.map((b, idx) => {
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
    changed = true;
  }

  if (next.reviews.length === 0 && branches.length > 0) {
    const sampleBranches = branches
      .filter((b) => b.tier === 'KC' || b.tier === 'RO' || b.tier === 'KCP')
      .slice(0, 18);
    const authors = [
      'Budi Santoso',
      'Siti Rahmawati',
      'Hendra Wijaya',
      'Dewi Anggraini',
      'Rizky Pratama',
      'Nadia Putri',
      'Agus Setiawan',
      'Ratna Permata',
      'Fajar Nugroho',
      'Wulan Sari',
    ];
    const comments: Array<{ rating: number; sentiment: ReviewSentiment; text: string }> = [
      {
        rating: 5,
        sentiment: 'Positif',
        text: 'Pelayanan CS sangat ramah dan proses pembukaan rekening BRImo cepat sekali.',
      },
      {
        rating: 4,
        sentiment: 'Positif',
        text: 'Lokasi kantor mudah ditemukan sesuai Google Maps, satpam sigap membantu.',
      },
      {
        rating: 3,
        sentiment: 'Netral',
        text: 'Antrean teller di jam makan siang cukup padat, namun petugas tetap informatif.',
      },
      {
        rating: 2,
        sentiment: 'Perlu Perhatian',
        text: 'Informasi jam istirahat kas sempat berbeda dengan jadwal yang tertera di Google Maps.',
      },
      {
        rating: 5,
        sentiment: 'Positif',
        text: 'Mesin ATM dan CRM berfungsi normal 24 jam, area parkir luas dan tertib.',
      },
      {
        rating: 1,
        sentiment: 'Perlu Perhatian',
        text: 'Nomor telepon yang tertera sempat sulit dihubungi sebelum diperbarui ke 1500017.',
      },
    ];

    next.reviews = sampleBranches.map((b, idx) => {
      const tpl = comments[idx % comments.length];
      const isReplied = idx % 3 === 0;
      return {
        id: `REV-LOCAL-${b.code}-${idx}`,
        branchId: b.id,
        branchCode: b.code,
        branchName: b.name,
        regionShort: b.regionShort,
        authorName: authors[idx % authors.length],
        rating: tpl.rating,
        comment: tpl.text,
        createdAt: `${(idx % 6) + 1} hari lalu`,
        sentiment: tpl.sentiment,
        replyStatus: isReplied ? 'replied' : 'unreplied',
        replyText: isReplied
          ? `Terima kasih Bapak/Ibu ${authors[idx % authors.length]} atas ulasannya terhadap ${b.name}. Masukan Anda menjadi prioritas peningkatan layanan kami.`
          : undefined,
        repliedAt: isReplied ? 'Hari ini, 09:15 WIB' : undefined,
        source: 'google_maps',
      };
    });
    next.scannedReviewBranchIds = sampleBranches.map((b) => b.id);
    changed = true;
  }

  if (changed) {
    writeLocalOpsState(next);
  }
  return next;
}

export function buildLocalSuggestions(params: {
  branchName: string;
  authorName: string;
  rating: number;
  comment: string;
}): ReviewSuggestion[] {
  const { branchName, authorName, rating } = params;
  const nama = authorName || 'Nasabah Yth';

  if (rating <= 3) {
    return [
      {
        tone: 'empatik',
        label: 'Empatik & Permohonan Maaf',
        text: `Selamat pagi/siang Bapak/Ibu ${nama}. Kami dari ${branchName} memohon maaf atas ketidaknyamanan yang dialami. Masukan Anda telah kami terima untuk perbaikan layanan serta penyelarasan informasi operasional unit kami. Untuk bantuan cepat silakan hubungi Contact BRI 1500017.`,
      },
      {
        tone: 'prosedural',
        label: 'Prosedural & Solutif',
        text: `Terima kasih Bapak/Ibu ${nama} telah menyampaikan masukan bagi ${branchName}. Tim operasional kami segera menindaklanjuti kendala tersebut dan memastikan data jam layanan serta kontak pada Google Maps sesuai standar resmi BRI (1500017).`,
      },
      {
        tone: 'apresiatif',
        label: 'Apresiatif & Tindak Lanjut',
        text: `Halo Bapak/Ibu ${nama}, terima kasih atas umpan balik yang sangat berharga untuk ${branchName}. Kami berkomitmen menjaga kualitas pelayanan dan kenyamanan transaksi Anda bersama Bank BRI.`,
      },
    ];
  }

  return [
    {
      tone: 'apresiatif',
      label: 'Apresiatif & Hangat',
      text: `Terima kasih banyak Bapak/Ibu ${nama} atas penilaian bintang ${rating} dan kepercayaannya kepada ${branchName}. Senang dapat melayani kebutuhan transaksi Anda, sampai jumpa pada kunjungan berikutnya.`,
    },
    {
      tone: 'prosedural',
      label: 'Standar Korporat BRI',
      text: `Salam hangat Bapak/Ibu ${nama}. Kami dari ${branchName} mengucapkan terima kasih atas ulasan positif Anda. Informasi produk dan layanan BRI lainnya dapat diakses melalui BRImo atau Contact BRI 1500017.`,
    },
    {
      tone: 'empatik',
      label: 'Ramah & Komitmen Layanan',
      text: `Halo Bapak/Ibu ${nama}, apresiasi Anda menjadi semangat bagi seluruh pekerja ${branchName} untuk terus memberikan layanan yang sigap, aman, dan akurat setiap hari.`,
    },
  ];
}

export function applyLocalBatchMarkFix(
  branches: BranchLocation[],
  payload: BatchMarkFixPayload,
  actor: string
): {
  updatedBranches: BranchLocation[];
  createdJobs: GoogleSyncJob[];
  historyEvents: ChangeHistoryEvent[];
} {
  const state = readLocalOpsState();
  const nowLabel = formatWibNow();
  const updatedBranches: BranchLocation[] = [];
  const createdJobs: GoogleSyncJob[] = [];
  const historyEvents: ChangeHistoryEvent[] = [];

  for (const branchId of payload.branchIds) {
    const target = branches.find((b) => b.id === branchId);
    if (!target) continue;

    const patch: BranchOverride = { ...(state.masterOverrides[target.id] ?? {}) };
    const changes: GoogleSyncChange[] = [];

    if (payload.applyPhone && payload.phone?.trim() && payload.phone.trim() !== target.phone) {
      const val = payload.phone.trim();
      changes.push({
        field: 'phone',
        fieldLabel: 'Telepon Layanan',
        previousValue: target.phone || '-',
        newValue: val,
      });
      patch.phone = val;
    }

    if (
      payload.applyWebsite &&
      payload.website?.trim() &&
      payload.website.trim() !== (target.website || '')
    ) {
      const val = payload.website.trim();
      changes.push({
        field: 'website',
        fieldLabel: 'Website Resmi',
        previousValue: target.website || '-',
        newValue: val,
      });
      patch.website = val;
    }

    if (payload.applyWeeklyHours && payload.weeklyHours) {
      patch.weeklyHours = payload.weeklyHours;
      patch.operatingHours = payload.weeklyHours.mon.open
        ? formatHoursClient(payload.weeklyHours.mon.hours)
        : 'Tutup';
      patch.saturdayHours = payload.weeklyHours.sat.open
        ? formatHoursClient(payload.weeklyHours.sat.hours)
        : 'Tutup';
      patch.sundayHours = payload.weeklyHours.sun.open
        ? formatHoursClient(payload.weeklyHours.sun.hours)
        : '';
      changes.push({
        field: 'weeklyHours',
        fieldLabel: 'Jadwal Operasional (Sen–Min)',
        previousValue: target.operatingHours,
        newValue: `${patch.operatingHours} (Sab: ${patch.saturdayHours})`,
      });
    }

    if (payload.applyTier && payload.tierRaw) {
      const { tier, label } = normalizeTierClient(payload.tierRaw);
      if (tier !== target.tier) {
        changes.push({
          field: 'name',
          fieldLabel: 'Status / Jenis UKO',
          previousValue: `${target.tier} (${target.tierLabel})`,
          newValue: `${tier} (${label})`,
        });
        patch.tier = tier;
        patch.tierLabel = label;
      }
    }

    if (payload.applyPostalCode && payload.postalCode?.trim()) {
      const val = payload.postalCode.trim();
      if (val !== target.postalCode) {
        changes.push({
          field: 'address',
          fieldLabel: 'Kode Pos',
          previousValue: target.postalCode || '-',
          newValue: val,
        });
        patch.postalCode = val;
      }
    }

    const submitToGoogle = payload.submitToGoogleReview !== false;
    if (submitToGoogle) {
      patch.syncStatus = 'pending_review';
      patch.discrepancies = [];
    }
    patch.lastSyncedAt = nowLabel;
    state.masterOverrides[target.id] = patch;
    updatedBranches.push({ ...target, ...patch });

    if (submitToGoogle) {
      const job: GoogleSyncJob = {
        id: `SYNC-MARK-${Date.now().toString(36).toUpperCase()}-${target.code}`,
        branchId: target.id,
        branchCode: target.code,
        branchName: patch.name || target.name,
        regionShort: target.regionShort,
        submittedBy: actor,
        submittedAt: nowLabel,
        status: 'pending_review',
        deliveryChannel: 'review_queue',
        changes:
          changes.length > 0
            ? changes
            : [
                {
                  field: 'phone',
                  fieldLabel: 'Penyesuaian Serentak 1-Klik',
                  previousValue: target.phone || '-',
                  newValue: patch.phone || target.phone || '1500017',
                },
              ],
        note: 'Perbaikan lokasi ditandai secara serentak (1-Klik) diajukan ke Google Maps.',
      };
      createdJobs.push(job);
      state.syncJobs.unshift(job);
    }

    const ev: ChangeHistoryEvent = {
      id: `HIST-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: nowLabel,
      branchId: target.id,
      branchCode: target.code,
      branchName: patch.name || target.name,
      regionShort: target.regionShort,
      actor,
      source: 'batch_mark_fix',
      summary: `Perbaikan serentak 1-Klik (${changes.map((c) => c.fieldLabel).join(', ') || 'Standar Master BRI'})`,
      changes: changes.map((c) => ({
        fieldLabel: c.fieldLabel,
        previousValue: c.previousValue,
        newValue: c.newValue,
      })),
    };
    historyEvents.push(ev);
    state.changeHistory.unshift(ev);
  }

  writeLocalOpsState(state);
  return { updatedBranches, createdJobs, historyEvents };
}

export function applyLocalBulkImport(
  currentBranches: BranchLocation[],
  rows: BulkImportRowInput[],
  submitToGoogleReview: boolean,
  updateOnly: boolean,
  actor: string
): {
  updatedCount: number;
  upgradedCount: number;
  addedCount: number;
  skippedCount: number;
  createdJobsCount: number;
  branches: BranchLocation[];
  createdJobs: GoogleSyncJob[];
  historyEvents: ChangeHistoryEvent[];
} {
  const state = readLocalOpsState();
  const nowLabel = formatWibNow();
  let updatedCount = 0;
  let upgradedCount = 0;
  let addedCount = 0;
  let skippedCount = 0;
  const createdJobs: GoogleSyncJob[] = [];
  const historyEvents: ChangeHistoryEvent[] = [];

  const findExisting = (
    paddedCode: string,
    tier: BranchTier,
    name: string,
    city: string,
    existingPoi: string | undefined,
    lat: number,
    lng: number
  ): BranchLocation | undefined => {
    const byCode = currentBranches.filter((b) => b.code === paddedCode);
    if (byCode.length > 0) {
      return byCode.find((b) => b.tier === tier) ?? byCode[0];
    }
    if (existingPoi && existingPoi.trim()) {
      const poiLower = existingPoi.trim().toLowerCase();
      const byPoi = currentBranches.find(
        (b) => b.existingPoi && b.existingPoi.trim().toLowerCase() === poiLower
      );
      if (byPoi) return byPoi;
    }
    const core = normalizeCoreBranchNameClient(name);
    const cityLower = city.trim().toLowerCase();
    if (core.length >= 4) {
      const byName = currentBranches.find((b) => {
        if (normalizeCoreBranchNameClient(b.name) !== core) return false;
        if (!cityLower || cityLower === 'indonesia') return true;
        return b.city.toLowerCase().includes(cityLower) || cityLower.includes(b.city.toLowerCase());
      });
      if (byName) return byName;
    }
    if (lat !== 0 && lng !== 0 && Number.isFinite(lat) && Number.isFinite(lng)) {
      return currentBranches.find(
        (b) =>
          Math.abs(b.lat - lat) < 0.00055 &&
          Math.abs(b.lng - lng) < 0.00055 &&
          (!cityLower || b.city.toLowerCase() === cityLower)
      );
    }
    return undefined;
  };

  for (const raw of rows) {
    const name = (raw.name || '').trim();
    const code = (raw.code || '').trim();
    if (!name || !code) continue;

    const paddedCode = code.padStart(4, '0');
    const { tier, label: tierLabel } = normalizeTierClient(raw.tierRaw || 'UNIT');
    const lat = Number.isFinite(raw.lat) ? raw.lat : -6.2;
    const lng = Number.isFinite(raw.lng) ? raw.lng : 106.8;
    const city = raw.city?.trim() || 'Indonesia';
    const existing = findExisting(paddedCode, tier, name, city, raw.existingPoi, lat, lng);

    const formattedHours = formatHoursClient(raw.operatingHours || '08:00-15:00');
    const formattedSat =
      raw.saturdayHours && raw.saturdayHours.trim() && raw.saturdayHours.trim() !== 'Tutup'
        ? formatHoursClient(raw.saturdayHours)
        : 'Tutup';
    const phone = raw.phone?.trim() || '1500017';
    const address = raw.address?.trim() || 'Alamat terverifikasi';

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
          fieldLabel: 'Jam Operasional',
          previousValue: existing.operatingHours,
          newValue: formattedHours,
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

      state.masterOverrides[existing.id] = {
        ...(state.masterOverrides[existing.id] ?? {}),
        code: paddedCode,
        tier: raw.tierRaw ? tier : existing.tier,
        tierLabel: raw.tierRaw ? tierLabel : existing.tierLabel,
        name,
        operatingHours: formattedHours,
        saturdayHours: formattedSat,
        phone,
        address,
        city: city !== 'Indonesia' ? city : existing.city,
        province: raw.province?.trim() || existing.province,
        postalCode: raw.postalCode?.trim() || existing.postalCode,
        lat,
        lng,
        website: raw.website?.trim() || existing.website,
        existingPoi: raw.existingPoi?.trim() || existing.existingPoi,
        syncStatus: submitToGoogleReview ? 'pending_review' : existing.syncStatus,
        discrepancies: submitToGoogleReview ? [] : existing.discrepancies,
        lastSyncedAt: nowLabel,
      };
      updatedCount++;

      if (changes.length > 0) {
        const ev: ChangeHistoryEvent = {
          id: `HIST-IMP-${Date.now().toString(36).toUpperCase()}-${paddedCode}`,
          timestamp: nowLabel,
          branchId: existing.id,
          branchCode: paddedCode,
          branchName: name,
          regionShort: existing.regionShort,
          actor,
          source: 'bulk_import',
          summary: tierChanged
            ? `Naik Status UKO (${existing.tier} → ${tier}) via Bulk Import`
            : 'Pembaruan Master Data via Bulk Import CSV',
          changes: changes.map((c) => ({
            fieldLabel: c.fieldLabel,
            previousValue: c.previousValue,
            newValue: c.newValue,
          })),
        };
        historyEvents.push(ev);
        state.changeHistory.unshift(ev);
      }

      if (submitToGoogleReview && changes.length > 0) {
        const job: GoogleSyncJob = {
          id: `SYNC-IMP-${Date.now().toString(36).toUpperCase()}-${paddedCode}`,
          branchId: existing.id,
          branchCode: paddedCode,
          branchName: name,
          regionShort: existing.regionShort,
          submittedBy: actor,
          submittedAt: nowLabel,
          status: 'pending_review',
          deliveryChannel: 'review_queue',
          changes,
          note: tierChanged
            ? `Perubahan status UKO (${existing.tier} → ${tier}) diajukan ke Google Maps.`
            : 'Pembaruan Master Data via Bulk Import CSV diajukan ke Google Maps.',
        };
        createdJobs.push(job);
        state.syncJobs.unshift(job);
      }
    } else if (updateOnly) {
      skippedCount++;
    } else {
      const region = raw.region?.trim() || 'Region 6 - Regional Office Jakarta 1';
      const newId = `${tier}-${paddedCode}-${Date.now().toString(36).slice(-4)}`;
      const newBranch: BranchLocation = {
        id: newId,
        code: paddedCode,
        name,
        tier,
        tierLabel,
        region,
        regionShort: shortenRegionClient(region),
        address,
        village: raw.village?.trim() || '',
        district: raw.district?.trim() || '',
        cityCode: raw.cityCode?.trim() || '',
        city,
        province: raw.province?.trim() || '',
        postalCode: raw.postalCode?.trim() || '',
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
      state.addedBranches.unshift(newBranch);
      addedCount++;
      const ev: ChangeHistoryEvent = {
        id: `HIST-NEW-${Date.now().toString(36).toUpperCase()}-${paddedCode}`,
        timestamp: nowLabel,
        branchId: newId,
        branchCode: paddedCode,
        branchName: name,
        regionShort: newBranch.regionShort,
        actor,
        source: 'bulk_import',
        summary: 'Penambahan Unit Kerja Baru via Bulk Import CSV',
        changes: [
          { fieldLabel: 'Unit Kerja Baru', previousValue: '-', newValue: `${tier} · ${name}` },
          { fieldLabel: 'Alamat Resmi', previousValue: '-', newValue: address },
        ],
      };
      historyEvents.push(ev);
      state.changeHistory.unshift(ev);
    }
  }

  writeLocalOpsState(state);
  const nextBranches = mergeLocalBranches(currentBranches, state);
  return {
    updatedCount,
    upgradedCount,
    addedCount,
    skippedCount,
    createdJobsCount: createdJobs.length,
    branches: nextBranches,
    createdJobs,
    historyEvents,
  };
}

export function buildClientCsvDownload(
  branches: BranchLocation[],
  opts?: {
    region?: string;
    tier?: string;
    status?: string;
    search?: string;
    templateOnly?: boolean;
  }
) {
  const esc = (val: string | number | undefined) => {
    const s = val === undefined || val === null ? '' : String(val);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const stripWib = (h: string) =>
    !h || h === 'Tutup' ? '' : h.replace(/\s*WIB|WITA|WIT/gi, '').replace(/\s*-\s*/g, '-').trim();

  const headers = [
    'Regional Office',
    'Nama Kantor Unit Kerja',
    'Code Branch',
    'Status Kantor / Jenis Uker',
    'Keterangan',
    'Latitude',
    'Longitude',
    'Alamat',
    'Nama Desa/ Kelurahan',
    'Nama Kecamatan',
    'Kode Kabupaten/ Kota',
    'Nama Kab/Kota',
    'Nama Provinsi',
    'Kode Pos',
    'Phone',
    'Website',
    'mon_hours',
    'tue_hours',
    'wed_hours',
    'thu_hours',
    'fri_hours',
    'sat_hours',
    'sun_hours',
    'Eksisting POI',
  ];

  let list = branches;
  if (opts?.templateOnly) {
    list = branches.slice(0, 5);
  } else {
    const searchLower = (opts?.search || '').trim().toLowerCase();
    list = branches.filter((b) => {
      if (opts?.region && opts.region !== 'ALL' && b.regionShort !== opts.region) return false;
      if (opts?.tier && opts.tier !== 'ALL' && b.tier !== opts.tier) return false;
      if (opts?.status && opts.status !== 'ALL' && b.syncStatus !== opts.status) return false;
      if (searchLower) {
        const hay = `${b.name} ${b.code} ${b.city} ${b.address}`.toLowerCase();
        if (!hay.includes(searchLower)) return false;
      }
      return true;
    });
  }

  const lines = [headers.map(esc).join(',')];
  for (const b of list) {
    const mon = stripWib(b.weeklyHours?.mon.open ? b.weeklyHours.mon.hours : b.operatingHours) || '08:00-15:00';
    const sat = stripWib(b.weeklyHours?.sat.open ? b.weeklyHours.sat.hours : b.saturdayHours);
    const sun = stripWib(b.weeklyHours?.sun.open ? b.weeklyHours.sun.hours : b.sundayHours || '');
    lines.push(
      [
        b.region,
        b.name,
        b.code,
        b.tier,
        b.tierLabel,
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
        mon,
        mon,
        mon,
        mon,
        mon,
        sat,
        sun,
        b.existingPoi || '',
      ]
        .map(esc)
        .join(',')
    );
  }

  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = opts?.templateOnly
    ? 'template_master_lokasi_bri.csv'
    : 'master_lokasi_bri_export.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
