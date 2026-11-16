import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Tag, X } from 'lucide-react';
import { useOps } from '../context/OpsContext';
import type { BranchTier, WeeklyHoursSchedule } from '../types/ops';
import { ensureWeeklyHours, WeeklyHoursChecklist } from './WeeklyHoursChecklist';

interface BatchMarkEditModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const TIER_CHOICES: Array<{ id: BranchTier; label: string }> = [
  { id: 'KC', label: 'KC — Kantor Cabang' },
  { id: 'KCP', label: 'KCP — Kantor Cabang Pembantu' },
  { id: 'KK', label: 'KK — Kantor Kas' },
  { id: 'UNIT', label: 'UNIT — BRI Unit' },
  { id: 'SSB', label: 'SSB — Sentra Layanan' },
  { id: 'TERAS', label: 'TERAS — Teras BRI' },
  { id: 'RO', label: 'RO — Regional Office' },
];

export function BatchMarkEditModal({ isOpen, onClose }: BatchMarkEditModalProps) {
  const {
    branches,
    markedBranchIds,
    toggleBranchMarked,
    clearMarkedBranches,
    executeBatchMarkFix,
  } = useOps();

  const [applyPhone, setApplyPhone] = useState(true);
  const [phone, setPhone] = useState('1500017');
  const [applyWebsite, setApplyWebsite] = useState(false);
  const [website, setWebsite] = useState('https://bri.co.id');
  const [applyHours, setApplyHours] = useState(false);
  const [weeklyHours, setWeeklyHours] = useState<WeeklyHoursSchedule>(() => ensureWeeklyHours(null));
  const [applyTier, setApplyTier] = useState(false);
  const [tierRaw, setTierRaw] = useState<BranchTier>('KC');
  const [applyPostal, setApplyPostal] = useState(false);
  const [postalCode, setPostalCode] = useState('');
  const [submitToGoogle, setSubmitToGoogle] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setErrorMsg(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const markedBranches = branches.filter((b) => markedBranchIds.includes(b.id));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (markedBranches.length === 0) return;
    if (!applyPhone && !applyWebsite && !applyHours && !applyTier && !applyPostal) {
      setErrorMsg('Pilih minimal satu kolom data yang ingin disesuaikan secara bersamaan.');
      return;
    }

    setErrorMsg(null);
    setIsSubmitting(true);
    try {
      await executeBatchMarkFix({
        branchIds: markedBranches.map((b) => b.id),
        applyPhone,
        phone,
        applyWebsite,
        website,
        applyWeeklyHours: applyHours,
        weeklyHours,
        applyTier,
        tierRaw,
        applyPostalCode: applyPostal,
        postalCode,
        submitToGoogleReview: submitToGoogle,
      });
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menerapkan perbaikan serentak.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div
        onClick={() => !isSubmitting && onClose()}
        className="fixed inset-0 bg-[#0f172a]/40 backdrop-blur-xs"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Perbaiki Lokasi Ditandai Bersamaan dalam 1 Klik"
        className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white border border-[#e2e8f0] shadow-[0_25px_40px_-8px_rgba(15,23,42,0.16)]"
      >
        <div className="px-6 py-4 border-b border-[#e2e8f0] flex items-center justify-between gap-3 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-2xl bg-[#eff6ff] text-[#00529C] flex items-center justify-center shrink-0">
              <Tag className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-display text-base font-bold text-[#1a1b22]">
                Perbaikan Serentak Lokasi Ditandai ({markedBranches.length} Unit)
              </h3>
              <p className="text-xs text-[#64748b] truncate">
                Ubah data beberapa unit kerja sekaligus dan sinkronkan langsung dalam 1 klik.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            aria-label="Tutup modal perbaikan serentak"
            className="h-9 w-9 rounded-xl text-[#64748b] hover:bg-[#f1f5f9] flex items-center justify-center"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Marked branches summary list */}
          <div className="rounded-2xl bg-[#f8fafc] border border-[#e2e8f0] p-3.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[#1a1b22]">
                Daftar Titik Lokasi yang Ditandai ({markedBranches.length})
              </span>
              {markedBranches.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    clearMarkedBranches();
                    onClose();
                  }}
                  className="text-[11px] font-semibold text-[#dc2626] hover:underline"
                >
                  Hapus Semua Tanda
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
              {markedBranches.map((b) => (
                <span
                  key={b.id}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-[#cbd5e1] px-2.5 py-1 text-[11px] text-[#1a1b22]"
                >
                  <span className="font-mono font-semibold text-[#00529C]">{b.code}</span>
                  <span className="truncate max-w-[160px]">{b.name}</span>
                  <button
                    type="button"
                    onClick={() => toggleBranchMarked(b.id)}
                    aria-label={`Hapus tanda ${b.name}`}
                    className="text-[#64748b] hover:text-[#dc2626]"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          {errorMsg && (
            <div className="rounded-2xl bg-[#fef2f2] border border-[#fecaca] px-4 py-3 text-xs font-medium text-[#991b1b]">
              {errorMsg}
            </div>
          )}

          {/* Field toggles */}
          <div className="space-y-3">
            {/* Phone */}
            <div className="rounded-2xl border border-[#e2e8f0] p-4 space-y-2.5">
              <label className="flex items-center justify-between gap-3 cursor-pointer">
                <span className="flex items-center gap-2.5 text-xs font-semibold text-[#1a1b22]">
                  <input
                    type="checkbox"
                    checked={applyPhone}
                    onChange={(e) => setApplyPhone(e.target.checked)}
                    className="h-4 w-4 rounded border-[#cbd5e1] text-[#00529C]"
                  />
                  <span>Sesuaikan Nomor Telepon Layanan (Contoh: 1500017)</span>
                </span>
              </label>
              {applyPhone && (
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="1500017"
                  className="w-full h-10 px-3 rounded-xl bg-[#f8fafc] border border-[#cbd5e1] font-mono text-xs text-[#1a1b22] focus:outline-none focus:bg-white focus:border-[#00529C]"
                />
              )}
            </div>

            {/* Website */}
            <div className="rounded-2xl border border-[#e2e8f0] p-4 space-y-2.5">
              <label className="flex items-center gap-2.5 cursor-pointer text-xs font-semibold text-[#1a1b22]">
                <input
                  type="checkbox"
                  checked={applyWebsite}
                  onChange={(e) => setApplyWebsite(e.target.checked)}
                  className="h-4 w-4 rounded border-[#cbd5e1] text-[#00529C]"
                />
                <span>Sesuaikan Website Resmi BRI</span>
              </label>
              {applyWebsite && (
                <input
                  type="text"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://bri.co.id"
                  className="w-full h-10 px-3 rounded-xl bg-[#f8fafc] border border-[#cbd5e1] font-mono text-xs text-[#1a1b22] focus:outline-none focus:bg-white focus:border-[#00529C]"
                />
              )}
            </div>

            {/* Tier Upgrade */}
            <div className="rounded-2xl border border-[#e2e8f0] p-4 space-y-2.5">
              <label className="flex items-center gap-2.5 cursor-pointer text-xs font-semibold text-[#1a1b22]">
                <input
                  type="checkbox"
                  checked={applyTier}
                  onChange={(e) => setApplyTier(e.target.checked)}
                  className="h-4 w-4 rounded border-[#cbd5e1] text-[#00529C]"
                />
                <span>Perbarui Status / Jenis UKO (Contoh: KCP → KC)</span>
              </label>
              {applyTier && (
                <select
                  value={tierRaw}
                  onChange={(e) => setTierRaw(e.target.value as BranchTier)}
                  className="w-full h-10 px-3 rounded-xl bg-[#f8fafc] border border-[#cbd5e1] text-xs font-medium text-[#1a1b22] focus:outline-none focus:bg-white focus:border-[#00529C]"
                >
                  {TIER_CHOICES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Postal code */}
            <div className="rounded-2xl border border-[#e2e8f0] p-4 space-y-2.5">
              <label className="flex items-center gap-2.5 cursor-pointer text-xs font-semibold text-[#1a1b22]">
                <input
                  type="checkbox"
                  checked={applyPostal}
                  onChange={(e) => setApplyPostal(e.target.checked)}
                  className="h-4 w-4 rounded border-[#cbd5e1] text-[#00529C]"
                />
                <span>Perbarui Kode Pos</span>
              </label>
              {applyPostal && (
                <input
                  type="text"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  placeholder="Contoh: 10210"
                  className="w-full h-10 px-3 rounded-xl bg-[#f8fafc] border border-[#cbd5e1] font-mono text-xs text-[#1a1b22] focus:outline-none focus:bg-white focus:border-[#00529C]"
                />
              )}
            </div>

            {/* Weekly Hours */}
            <div className="rounded-2xl border border-[#e2e8f0] p-4 space-y-3">
              <label className="flex items-center gap-2.5 cursor-pointer text-xs font-semibold text-[#1a1b22]">
                <input
                  type="checkbox"
                  checked={applyHours}
                  onChange={(e) => setApplyHours(e.target.checked)}
                  className="h-4 w-4 rounded border-[#cbd5e1] text-[#00529C]"
                />
                <span>Standardisasi Jam Operasional (Senin–Minggu)</span>
              </label>
              {applyHours && (
                <WeeklyHoursChecklist value={weeklyHours} onChange={setWeeklyHours} compact />
              )}
            </div>
          </div>

          <label className="flex items-center gap-2.5 text-xs text-[#1a1b22] cursor-pointer">
            <input
              type="checkbox"
              checked={submitToGoogle}
              onChange={(e) => setSubmitToGoogle(e.target.checked)}
              className="h-4 w-4 rounded border-[#cbd5e1] text-[#00529C]"
            />
            <span>Langsung kirim seluruh perubahan ke antrean sinkronisasi Google Maps</span>
          </label>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#e2e8f0]">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="h-10 px-4 rounded-2xl bg-white border border-[#cbd5e1] hover:bg-[#f1f5f9] text-xs font-medium text-[#1a1b22]"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting || markedBranches.length === 0}
              className="h-10 px-5 rounded-2xl bg-[#00529C] hover:bg-[#004080] text-white text-xs font-semibold inline-flex items-center gap-2 disabled:opacity-60 whitespace-nowrap"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Menyimpan &amp; Menyinkronkan...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Terapkan ke {markedBranches.length} Lokasi &amp; Sinkronkan (1 Klik)</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
