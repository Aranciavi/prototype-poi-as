import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, CheckCircle2, Loader2, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { useGbpAuth } from '../context/GbpAuthContext';
import { useOps } from '../context/OpsContext';
import { StatusBadge } from './StatusBadge';

export function BulkSyncModal() {
  const {
    branches,
    isBulkSyncOpen,
    closeBulkSync,
    bulkSyncTargetIds,
    executeBulkSync,
  } = useOps();
  const { gbpAccessToken, isConnected } = useGbpAuth();

  const conflictBranches = useMemo(() => {
    if (bulkSyncTargetIds.length > 0) {
      return branches.filter((b) => bulkSyncTargetIds.includes(b.id));
    }
    return branches
      .filter((b) => b.syncStatus === 'action_required' || b.syncStatus === 'discrepancy')
      .slice(0, 12);
  }, [branches, bulkSyncTargetIds]);

  const [isConfirming, setIsConfirming] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isBulkSyncOpen) {
      setIsSubmitting(false);
      setIsConfirming(false);
    }
  }, [isBulkSyncOpen]);

  const targetIds = useMemo(() => conflictBranches.map((b) => b.id), [conflictBranches]);
  const linkedCount = useMemo(
    () => conflictBranches.filter((b) => Boolean(b.gbpLocationName)).length,
    [conflictBranches]
  );

  const handleConfirm = async () => {
    if (targetIds.length === 0) return;
    setIsSubmitting(true);
    try {
      await executeBulkSync(targetIds, isConnected ? gbpAccessToken : null);
      closeBulkSync();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isBulkSyncOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={() => !isSubmitting && closeBulkSync()}
            className="fixed inset-0 bg-[#0f172a]/35 backdrop-blur-xs"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Sinkronisasi Massal Master BRI ke Google Business Profile"
            initial={{ opacity: 0, scale: 0.97, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 10 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 w-full max-w-3xl max-h-[88vh] rounded-3xl bg-white border border-[#e2e8f0] shadow-[0_25px_40px_-8px_rgba(15,23,42,0.14)] flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="px-6 py-5 border-b border-[#e2e8f0] flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h2 className="font-display text-lg font-bold text-[#1a1b22]">
                  Sinkronisasi Massal: Master Data BRI → Google Business Profile
                </h2>
                <p className="text-xs text-[#64748b]">
                  Data Master BRI ({conflictBranches.length} unit kerja) akan digunakan untuk
                  memperbaiki dan menyesuaikan profil Google Maps / GBP.
                </p>
              </div>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={closeBulkSync}
                aria-label="Tutup modal sinkronisasi"
                className="h-9 w-9 rounded-xl text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#1a1b22] flex items-center justify-center smooth-transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {conflictBranches.length === 0 ? (
                <div className="py-10 text-center space-y-2">
                  <CheckCircle2 className="h-9 w-9 text-[#059669] mx-auto" />
                  <p className="font-display text-base font-semibold text-[#1a1b22]">
                    Semua Lokasi Sudah Tersinkronisasi
                  </p>
                  <p className="text-sm text-[#64748b]">
                    Tidak ada perbedaan antara Master Data BRI dan Google Business Profile saat ini.
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#eff6ff] border border-[#bfdbfe] px-4 py-3 text-xs">
                    <div className="flex items-center gap-2 text-[#00529C] font-semibold">
                      <ShieldCheck className="h-4 w-4 shrink-0" />
                      <span>
                        Arah Sinkronisasi Terkunci: Master BRI (Sumber Utama) → Google Business
                        Profile
                      </span>
                    </div>
                    <span className="font-mono text-[#1a1b22] tabular-nums">
                      {isConnected
                        ? `${linkedCount} terhubung GBP Live · ${conflictBranches.length - linkedCount} antrean review`
                        : `${conflictBranches.length} antrean review Google`}
                    </span>
                  </div>

                  <div className="space-y-4">
                    {conflictBranches.map((branch) => (
                      <div
                        key={branch.id}
                        className="rounded-2xl border border-[#e2e8f0] p-4 space-y-3 bg-white"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="font-semibold text-sm text-[#1a1b22]">{branch.name}</p>
                            <p className="font-mono text-xs text-[#64748b] tabular-nums">
                              {branch.code} · {branch.city} · {branch.regionShort}
                              {branch.gbpLocationName ? ' · Tertaut GBP API' : ''}
                            </p>
                          </div>
                          <StatusBadge status={branch.syncStatus} compact />
                        </div>

                        {branch.discrepancies.length === 0 ? (
                          <div className="rounded-xl bg-[#f8fafc] border border-[#e2e8f0] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                            <span className="text-[#444653]">
                              Master BRI: <span className="font-mono">{branch.operatingHours}</span>{' '}
                              · <span className="font-mono">{branch.phone}</span>
                            </span>
                            <span className="font-semibold text-[#00529C]">
                              Siap diselaraskan ke Google Maps
                            </span>
                          </div>
                        ) : (
                          <div className="space-y-2.5">
                            {branch.discrepancies.map((disc) => (
                              <div
                                key={disc.field}
                                className="rounded-2xl bg-[#f8fafc] border border-[#e2e8f0] p-3.5 space-y-2"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="text-xs font-semibold text-[#1a1b22]">
                                    {disc.fieldLabel}
                                  </span>
                                  <span className="text-[11px] text-[#64748b]">{disc.reason}</span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-11 gap-2 items-center">
                                  <div className="sm:col-span-5 rounded-xl p-3 bg-white border border-[#00529C]/40">
                                    <span className="text-[11px] font-semibold text-[#00529C] block">
                                      Master Data BRI (Diterapkan)
                                    </span>
                                    <span className="font-mono text-xs text-[#1a1b22] mt-0.5 block">
                                      {disc.masterValue}
                                    </span>
                                  </div>

                                  <div className="sm:col-span-1 flex justify-center">
                                    <ArrowRight className="h-4 w-4 text-[#00529C]" />
                                  </div>

                                  <div className="sm:col-span-5 rounded-xl p-3 bg-white/70 border border-[#e2e8f0]">
                                    <span className="text-[11px] font-semibold text-[#dc2626] block">
                                      Profil Google Saat Ini (Diperbaiki)
                                    </span>
                                    <span className="font-mono text-xs text-[#64748b] line-through mt-0.5 block">
                                      {disc.gbpValue}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {isConfirming && (
                    <div className="rounded-2xl bg-[#fffbeb] border border-[#fde68a] p-4 space-y-1.5 text-xs">
                      <p className="font-semibold text-[#92400e]">
                        Konfirmasi Pengiriman Perubahan Master → Google
                      </p>
                      <p className="text-[#444653]">
                        Sebanyak <span className="font-mono font-semibold">{conflictBranches.length}</span>{' '}
                        lokasi Google Business Profile / antrean verifikasi Google akan diperbarui
                        menggunakan data resmi Master BRI. Data Master BRI tidak akan berubah.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-[#f8fafc] border-t border-[#e2e8f0] flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => {
                  if (isConfirming) {
                    setIsConfirming(false);
                  } else {
                    closeBulkSync();
                  }
                }}
                className="h-11 px-5 rounded-2xl bg-white border border-[#cbd5e1] hover:bg-[#f1f5f9] text-sm font-medium text-[#1a1b22] smooth-transition"
              >
                {isConfirming ? 'Kembali' : 'Tutup'}
              </button>
              {conflictBranches.length > 0 && !isConfirming && (
                <button
                  type="button"
                  onClick={() => setIsConfirming(true)}
                  className="h-11 px-5 rounded-2xl bg-[#00529C] hover:bg-[#004080] text-white text-sm font-semibold inline-flex items-center gap-2 smooth-transition whitespace-nowrap"
                >
                  <RefreshCw className="h-4 w-4" />
                  <span>Ajukan Sinkronisasi ({conflictBranches.length} Lokasi)</span>
                </button>
              )}
              {conflictBranches.length > 0 && isConfirming && (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleConfirm}
                  className="h-11 px-5 rounded-2xl bg-[#059669] hover:bg-[#047857] text-white text-sm font-semibold inline-flex items-center gap-2 smooth-transition disabled:opacity-65 whitespace-nowrap"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Mengirim ke Google...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Konfirmasi Kirim Perubahan Master → Google</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
