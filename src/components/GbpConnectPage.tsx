import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Link2,
  Loader2,
  LogOut,
  MapPin,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { useGbpAuth } from '../context/GbpAuthContext';
import { useOps } from '../context/OpsContext';
import type { BranchLocation, GbpLocationSummary } from '../types/ops';

export function GbpConnectPage() {
  const {
    gbpUser,
    gbpAccessToken,
    isConnected,
    isConnecting,
    isLoadingGbpData,
    gbpError,
    accounts,
    selectedAccountName,
    setSelectedAccountName,
    gbpLocations,
    connectGbp,
    disconnectGbp,
    refreshGbpAccountsAndLocations,
  } = useGbpAuth();

  const {
    branches,
    linkBranchGbp,
    pushBranchToGbpLive,
    setActiveView,
    setSelectedBranchId,
    pushToast,
  } = useOps();

  const [pickingForLocation, setPickingForLocation] = useState<GbpLocationSummary | null>(null);
  const [branchSearch, setBranchSearch] = useState('');
  const [confirmPushTarget, setConfirmPushTarget] = useState<{
    branch: BranchLocation;
    location: GbpLocationSummary;
  } | null>(null);
  const [isPushing, setIsPushing] = useState(false);

  const branchByGbpName = useMemo(() => {
    const map = new Map<string, BranchLocation>();
    for (const b of branches) {
      if (b.gbpLocationName) {
        map.set(b.gbpLocationName, b);
      }
    }
    return map;
  }, [branches]);

  const pickerResults = useMemo(() => {
    const q = branchSearch.trim().toLowerCase();
    if (!q) {
      return branches.filter((b) => b.tier === 'RO' || b.tier === 'KC').slice(0, 30);
    }
    return branches
      .filter((b) =>
        `${b.code} ${b.name} ${b.city} ${b.address}`.toLowerCase().includes(q)
      )
      .slice(0, 40);
  }, [branches, branchSearch]);

  const handleAutoMatchAll = async () => {
    if (gbpLocations.length === 0) return;
    let matchedCount = 0;

    for (const loc of gbpLocations) {
      if (branchByGbpName.has(loc.name)) continue;

      let candidate: BranchLocation | undefined;
      if (loc.storeCode) {
        const padded = loc.storeCode.trim().padStart(4, '0');
        candidate = branches.find((b) => b.code === padded);
      }
      if (!candidate && loc.title) {
        const cleanTitle = loc.title.toLowerCase().replace(/\bbri\b/g, '').trim();
        if (cleanTitle.length >= 4) {
          candidate = branches.find((b) => {
            const cleanName = b.name.toLowerCase().replace(/\bbri\b/g, '').trim();
            return cleanName === cleanTitle || cleanName.includes(cleanTitle) || cleanTitle.includes(cleanName);
          });
        }
      }

      if (candidate) {
        await linkBranchGbp(candidate.id, loc.name, loc.mapsUri);
        matchedCount++;
      }
    }

    pushToast({
      title:
        matchedCount > 0
          ? `${matchedCount} lokasi GBP berhasil ditautkan otomatis`
          : 'Tidak ada kecocokan baru ditemukan',
      description:
        matchedCount > 0
          ? 'Pencocokan berdasarkan Code Branch dan nama unit kerja Master BRI.'
          : 'Gunakan tombol Tautkan Manual untuk memilih unit kerja Master BRI secara spesifik.',
      variant: matchedCount > 0 ? 'success' : 'info',
    });
  };

  const handleConfirmPushToGbp = async () => {
    if (!confirmPushTarget || !gbpAccessToken) return;
    setIsPushing(true);
    try {
      await pushBranchToGbpLive(
        confirmPushTarget.branch.id,
        confirmPushTarget.location.name,
        gbpAccessToken
      );
      setConfirmPushTarget(null);
    } finally {
      setIsPushing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Architecture & Connection Status Header */}
      <section className="rounded-3xl bg-white border border-[#e2e8f0] p-6 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.05)]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-xl bg-[#eff6ff] border border-[#bfdbfe] px-3 py-1 text-xs font-semibold text-[#00529C]">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Autentikasi Terpisah Google Business Profile (GBP)</span>
            </div>
            <h2 className="font-display text-xl font-bold text-[#1a1b22]">
              {isConnected
                ? 'Akun Pengelola Google Business Profile Terhubung'
                : 'Hubungkan Akun Pengelola Google Business Profile'}
            </h2>
            <p className="text-sm text-[#444653] leading-relaxed">
              Halaman login ini terpisah dari login operator BRI di halaman depan. Masuk dengan akun
              Google yang mengelola profil lokasi BRI agar Master Data{' '}
              <span className="font-mono text-xs font-semibold text-[#1a1b22]">
                template_lokasi_bri
              </span>{' '}
              dapat mendorong pembaruan ke Google Maps serta menarik &amp; membalas ulasan secara
              terpusat.
            </p>
          </div>

          <div className="shrink-0 flex flex-col items-start lg:items-end gap-3">
            {!isConnected ? (
              <button
                type="button"
                disabled={isConnecting}
                onClick={connectGbp}
                className="gsi-material-button inline-flex items-center justify-center rounded-xl bg-white border border-[#747775] hover:bg-[#f8fafc] active:bg-[#f1f5f9] text-[#1f1f1f] px-4 h-11 text-sm font-medium shadow-xs smooth-transition disabled:opacity-60 cursor-pointer whitespace-nowrap"
              >
                <div className="gsi-material-button-state" />
                <div className="gsi-material-button-content-wrapper flex items-center gap-3">
                  <div className="gsi-material-button-icon w-5 h-5 shrink-0">
                    <svg
                      version="1.1"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 48 48"
                      style={{ display: 'block' }}
                    >
                      <path
                        fill="#EA4335"
                        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                      />
                      <path
                        fill="#4285F4"
                        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                      />
                      <path
                        fill="#34A853"
                        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                      />
                      <path fill="none" d="M0 0h48v48H0z" />
                    </svg>
                  </div>
                  <span className="gsi-material-button-contents font-medium">
                    {isConnecting ? 'Menghubungkan Google...' : 'Sign in with Google'}
                  </span>
                </div>
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-3 rounded-2xl bg-[#f8fafc] border border-[#e2e8f0] px-4 py-2.5">
                  {gbpUser?.photoURL ? (
                    <img
                      src={gbpUser.photoURL}
                      alt={gbpUser.displayName}
                      referrerPolicy="no-referrer"
                      className="h-9 w-9 rounded-xl object-cover"
                    />
                  ) : (
                    <div className="h-9 w-9 rounded-xl bg-[#00529C] text-white flex items-center justify-center font-bold text-sm">
                      {(gbpUser?.displayName || 'G').slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#1a1b22] truncate">
                      {gbpUser?.displayName}
                    </p>
                    <p className="text-[11px] text-[#64748b] truncate">{gbpUser?.email}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={disconnectGbp}
                  className="h-11 px-4 rounded-2xl bg-[#fef2f2] hover:bg-[#fee2e2] border border-[#fecaca] text-xs font-semibold text-[#dc2626] inline-flex items-center gap-2 smooth-transition whitespace-nowrap"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Putuskan Koneksi Google</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Source of Truth Banner */}
        <div className="mt-5 rounded-2xl bg-[#f8fafc] border border-[#e2e8f0] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-xs text-[#444653]">
            <span className="font-semibold text-[#00529C] whitespace-nowrap">
              Master Data BRI (Sumber Utama)
            </span>
            <ArrowRight className="h-4 w-4 text-[#64748b] shrink-0" />
            <span className="font-semibold text-[#059669] whitespace-nowrap">
              Google Business Profile / Google Maps (Target Penyesuaian)
            </span>
          </div>
          <p className="text-xs text-[#64748b]">
            Data Google Maps tidak pernah menimpa Master Data BRI.
          </p>
        </div>
      </section>

      {/* Error Banner if API not active or login failed */}
      {gbpError && (
        <section className="rounded-3xl bg-[#fef2f2] border border-[#fecaca] p-5 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-[#dc2626] shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <p className="font-semibold text-[#991b1b]">Informasi Koneksi Google Business Profile</p>
            <p className="text-[#444653] leading-relaxed">{gbpError}</p>
          </div>
        </section>
      )}

      {/* Connected Account & Locations Management */}
      {isConnected && (
        <section className="rounded-3xl bg-white border border-[#e2e8f0] shadow-[0_4px_20px_-2px_rgba(15,23,42,0.05)] overflow-hidden">
          <div className="p-6 border-b border-[#e2e8f0] flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="font-display text-base font-bold text-[#1a1b22]">
                Daftar Lokasi Google Business Profile ({gbpLocations.length})
              </h3>
              <p className="text-xs text-[#64748b]">
                Tautkan lokasi GBP dengan kode unit kerja Master BRI untuk dorong pembaruan &amp;
                tarik ulasan terpusat.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {accounts.length > 0 && (
                <select
                  value={selectedAccountName}
                  onChange={(e) => setSelectedAccountName(e.target.value)}
                  aria-label="Pilih Akun Google Business Profile"
                  className="h-10 px-3.5 rounded-2xl bg-[#f8fafc] border border-[#cbd5e1] text-xs font-medium text-[#1a1b22] focus:outline-none focus:border-[#00529C] focus:ring-4 focus:ring-[#00529C]/15"
                >
                  {accounts.map((acc) => (
                    <option key={acc.name} value={acc.name}>
                      {acc.accountName || acc.name}
                    </option>
                  ))}
                </select>
              )}

              <button
                type="button"
                disabled={isLoadingGbpData}
                onClick={() => refreshGbpAccountsAndLocations()}
                className="h-10 px-4 rounded-2xl bg-white border border-[#cbd5e1] hover:bg-[#f1f5f9] text-xs font-semibold text-[#1a1b22] inline-flex items-center gap-2 smooth-transition whitespace-nowrap disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoadingGbpData ? 'animate-spin' : ''}`} />
                <span>Muat Ulang Lokasi GBP</span>
              </button>

              {gbpLocations.length > 0 && (
                <button
                  type="button"
                  onClick={handleAutoMatchAll}
                  className="h-10 px-4 rounded-2xl bg-[#eff6ff] hover:bg-[#dbeafe] text-xs font-semibold text-[#00529C] inline-flex items-center gap-2 smooth-transition whitespace-nowrap"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Tautkan Otomatis (Code Branch)</span>
                </button>
              )}
            </div>
          </div>

          {isLoadingGbpData ? (
            <div className="p-12 text-center space-y-3">
              <Loader2 className="h-7 w-7 animate-spin text-[#00529C] mx-auto" />
              <p className="text-sm text-[#64748b]">
                Memuat akun dan daftar lokasi dari Google Business Profile API...
              </p>
            </div>
          ) : accounts.length === 0 ? (
            <div className="p-10 text-center space-y-3 max-w-xl mx-auto">
              <MapPin className="h-8 w-8 text-[#94a3b8] mx-auto" />
              <p className="font-display text-base font-semibold text-[#1a1b22]">
                Belum Ada Lokasi Google Business Profile pada Akun Ini
              </p>
              <p className="text-xs text-[#64748b] leading-relaxed">
                Akun Google Anda sudah terautentikasi, namun belum memiliki lokasi bisnis yang
                dikelola pada Google Business Profile. Anda tetap dapat mengelola Master Data BRI,
                perbaikan kualitas data, dan antrean sinkronisasi dari menu Direktori Cabang.
              </p>
              <div className="pt-2 flex flex-wrap items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={connectGbp}
                  className="h-10 px-4 rounded-2xl bg-[#00529C] hover:bg-[#004080] text-white text-xs font-semibold smooth-transition whitespace-nowrap"
                >
                  Ganti Akun Google Lain
                </button>
                <button
                  type="button"
                  onClick={() => setActiveView('directory')}
                  className="h-10 px-4 rounded-2xl bg-white border border-[#cbd5e1] hover:bg-[#f1f5f9] text-xs font-semibold text-[#1a1b22] smooth-transition whitespace-nowrap"
                >
                  Kelola Master Data BRI
                </button>
              </div>
            </div>
          ) : gbpLocations.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <p className="font-display text-base font-semibold text-[#1a1b22]">
                Tidak Ada Lokasi di Akun Terpilih
              </p>
              <p className="text-xs text-[#64748b]">
                Pilih akun pengelola GBP lain pada dropdown di atas atau muat ulang daftar lokasi.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#f8fafc] border-b border-[#e2e8f0] text-[11px] font-semibold text-[#475569]">
                    <th className="py-3 px-6">Profil Lokasi di Google Business</th>
                    <th className="py-3 px-4">Store Code</th>
                    <th className="py-3 px-4">Tautan Master Data BRI</th>
                    <th className="py-3 px-6 text-right">Aksi Sinkronisasi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e2e8f0] text-sm">
                  {gbpLocations.map((loc) => {
                    const linkedBranch = branchByGbpName.get(loc.name);
                    return (
                      <tr key={loc.name} className="hover:bg-[#f8fafc] smooth-transition">
                        <td className="py-3.5 px-6">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-[#1a1b22]">{loc.title}</p>
                              {loc.mapsUri && (
                                <a
                                  href={loc.mapsUri}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  aria-label={`Buka ${loc.title} di Google Maps`}
                                  className="text-[#00529C] hover:underline"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              )}
                            </div>
                            <p className="text-xs text-[#64748b]">
                              {[...(loc.addressLines ?? []), loc.locality, loc.postalCode]
                                .filter(Boolean)
                                .join(', ') || 'Alamat belum terisi di GBP'}
                            </p>
                            {loc.primaryPhone && (
                              <p className="font-mono text-[11px] text-[#444653] tabular-nums">
                                Telp GBP: {loc.primaryPhone}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-xs text-[#444653] tabular-nums whitespace-nowrap">
                          {loc.storeCode || '—'}
                        </td>
                        <td className="py-3.5 px-4">
                          {linkedBranch ? (
                            <div className="space-y-0.5">
                              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#059669]">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                <span>
                                  {linkedBranch.code} · {linkedBranch.name}
                                </span>
                              </span>
                              <p className="text-[11px] text-[#64748b]">
                                Jam Master: {linkedBranch.operatingHours} · {linkedBranch.phone}
                              </p>
                            </div>
                          ) : (
                            <span className="text-xs text-[#d97706] font-medium">
                              Belum ditautkan ke Master BRI
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-6 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setBranchSearch(loc.storeCode || loc.locality || '');
                                setPickingForLocation(loc);
                              }}
                              className="h-9 px-3.5 rounded-xl bg-white border border-[#cbd5e1] hover:bg-[#f1f5f9] text-xs font-medium text-[#1a1b22] inline-flex items-center gap-1.5 smooth-transition whitespace-nowrap"
                            >
                              <Link2 className="h-3.5 w-3.5" />
                              <span>{linkedBranch ? 'Ubah Tautan' : 'Tautkan Unit BRI'}</span>
                            </button>

                            {linkedBranch && (
                              <button
                                type="button"
                                onClick={() =>
                                  setConfirmPushTarget({ branch: linkedBranch, location: loc })
                                }
                                className="h-9 px-3.5 rounded-xl bg-[#00529C] hover:bg-[#004080] text-white text-xs font-semibold inline-flex items-center gap-1.5 smooth-transition whitespace-nowrap"
                              >
                                <Send className="h-3.5 w-3.5" />
                                <span>Dorong Master → GBP</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Link GBP Location to Master BRI Picker Modal */}
      {pickingForLocation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            onClick={() => setPickingForLocation(null)}
            className="fixed inset-0 bg-[#0f172a]/35 backdrop-blur-xs"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Tautkan Lokasi GBP ke Unit Master BRI"
            className="relative z-10 w-full max-w-xl rounded-3xl bg-white border border-[#e2e8f0] shadow-[0_25px_40px_-8px_rgba(15,23,42,0.14)] overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-[#e2e8f0] flex items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-base font-bold text-[#1a1b22]">
                  Pilih Unit Kerja Master BRI
                </h3>
                <p className="text-xs text-[#64748b]">
                  Tautkan profil GBP: <span className="font-semibold">{pickingForLocation.title}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPickingForLocation(null)}
                className="h-9 w-9 rounded-xl text-[#64748b] hover:bg-[#f1f5f9] flex items-center justify-center"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="relative">
                <Search className="h-4 w-4 text-[#64748b] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={branchSearch}
                  onChange={(e) => setBranchSearch(e.target.value)}
                  placeholder="Cari kode unit (misal 0019), nama KC/Unit, atau kota..."
                  className="w-full h-11 pl-10 pr-4 rounded-2xl bg-[#f8fafc] border border-[#cbd5e1] text-xs text-[#1a1b22] focus:outline-none focus:bg-white focus:border-[#00529C] focus:ring-4 focus:ring-[#00529C]/15"
                />
              </div>

              <div className="max-h-72 overflow-y-auto divide-y divide-[#e2e8f0] rounded-2xl border border-[#e2e8f0]">
                {pickerResults.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={async () => {
                      await linkBranchGbp(b.id, pickingForLocation.name, pickingForLocation.mapsUri);
                      setSelectedBranchId(b.id);
                      setPickingForLocation(null);
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-[#eff6ff] smooth-transition flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[#1a1b22] truncate">
                        <span className="font-mono text-[#00529C] mr-1.5">{b.code}</span>
                        {b.name}
                      </p>
                      <p className="text-[11px] text-[#64748b] truncate">
                        {b.city} · {b.operatingHours}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-[#00529C] shrink-0">Pilih</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Explicit Confirmation Modal before Mutating GBP Data */}
      {confirmPushTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            onClick={() => !isPushing && setConfirmPushTarget(null)}
            className="fixed inset-0 bg-[#0f172a]/35 backdrop-blur-xs"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Konfirmasi Pengiriman Master Data ke Google Business Profile"
            className="relative z-10 w-full max-w-lg rounded-3xl bg-white border border-[#e2e8f0] shadow-[0_25px_40px_-8px_rgba(15,23,42,0.14)] overflow-hidden"
          >
            <div className="px-6 py-5 border-b border-[#e2e8f0] space-y-1">
              <h3 className="font-display text-base font-bold text-[#1a1b22]">
                Konfirmasi Perbarui Google Business Profile
              </h3>
              <p className="text-xs text-[#64748b]">
                Data profil GBP <span className="font-semibold">{confirmPushTarget.location.title}</span>{' '}
                akan disesuaikan mengikuti Master Data BRI berikut:
              </p>
            </div>

            <div className="p-6 space-y-3 text-xs">
              <div className="rounded-2xl bg-[#f8fafc] border border-[#e2e8f0] p-4 space-y-2">
                <div>
                  <span className="text-[#64748b] block">Nama Unit Kerja (Title GBP)</span>
                  <span className="font-semibold text-[#1a1b22]">{confirmPushTarget.branch.name}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[#64748b] block">Jam Operasional (Sen–Jum)</span>
                    <span className="font-mono text-[#1a1b22]">
                      {confirmPushTarget.branch.operatingHours}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#64748b] block">Telepon Layanan</span>
                    <span className="font-mono text-[#1a1b22]">{confirmPushTarget.branch.phone}</span>
                  </div>
                </div>
                <div>
                  <span className="text-[#64748b] block">Alamat Resmi</span>
                  <span className="text-[#1a1b22]">{confirmPushTarget.branch.address}</span>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-[#f8fafc] border-t border-[#e2e8f0] flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={isPushing}
                onClick={() => setConfirmPushTarget(null)}
                className="h-10 px-4 rounded-2xl bg-white border border-[#cbd5e1] hover:bg-[#f1f5f9] text-xs font-medium text-[#1a1b22] smooth-transition"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isPushing}
                onClick={handleConfirmPushToGbp}
                className="h-10 px-5 rounded-2xl bg-[#00529C] hover:bg-[#004080] text-white text-xs font-semibold inline-flex items-center gap-2 smooth-transition disabled:opacity-60"
              >
                {isPushing ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Mengirim ke GBP...</span>
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5" />
                    <span>Konfirmasi Kirim ke GBP</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
