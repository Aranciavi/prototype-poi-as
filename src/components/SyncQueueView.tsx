import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  GitCompareArrows,
  Loader2,
  MapPin,
  RefreshCw,
} from 'lucide-react';
import { useGbpAuth } from '../context/GbpAuthContext';
import { useOps } from '../context/OpsContext';
import type { GoogleSyncJobStatus } from '../types/ops';

export function SyncQueueView() {
  const {
    syncJobs,
    isVerifyingSyncJobs,
    verifyPendingSyncJobs,
    setSelectedBranchId,
    setActiveView,
  } = useOps();
  const { isConnected: isGbpConnected, gbpAccessToken } = useGbpAuth();
  const [filter, setFilter] = useState<'ALL' | GoogleSyncJobStatus>('ALL');
  const [checkingJobId, setCheckingJobId] = useState<string | null>(null);
  const autoCheckedRef = useRef(false);

  const pendingCount = syncJobs.filter((j) => j.status === 'pending_review').length;
  const approvedCount = syncJobs.filter((j) => j.status === 'approved_live').length;

  useEffect(() => {
    if (autoCheckedRef.current) return;
    if (pendingCount > 0) {
      autoCheckedRef.current = true;
      verifyPendingSyncJobs(isGbpConnected ? gbpAccessToken : null);
    }
  }, [pendingCount, isGbpConnected, gbpAccessToken, verifyPendingSyncJobs]);

  const filteredJobs = useMemo(() => {
    if (filter === 'ALL') return syncJobs;
    return syncJobs.filter((j) => j.status === filter);
  }, [syncJobs, filter]);

  const handleCheckAllPending = async () => {
    await verifyPendingSyncJobs(isGbpConnected ? gbpAccessToken : null);
  };

  const handleCheckSingleJob = async (jobId: string) => {
    setCheckingJobId(jobId);
    try {
      await verifyPendingSyncJobs(isGbpConnected ? gbpAccessToken : null, jobId);
    } finally {
      setCheckingJobId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI Header Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-3xl bg-white border border-[#e2e8f0] p-5 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.05)]">
          <p className="text-xs font-medium text-[#64748b]">Menunggu Review Google</p>
          <p className="font-mono text-2xl font-bold text-[#00529C] tabular-nums mt-1">
            {pendingCount}
          </p>
          <p className="text-xs text-[#444653] mt-1">
            Dipantau otomatis terhadap pembaruan data live di Google Maps / GBP
          </p>
        </div>

        <div className="rounded-3xl bg-white border border-[#e2e8f0] p-5 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.05)]">
          <p className="text-xs font-medium text-[#64748b]">Terkonfirmasi Otomatis Live</p>
          <p className="font-mono text-2xl font-bold text-[#059669] tabular-nums mt-1">
            {approvedCount}
          </p>
          <p className="text-xs text-[#444653] mt-1">
            Otomatis berstatus Live setelah Google Maps menampilkan data sesuai Master BRI
          </p>
        </div>

        <div className="rounded-3xl bg-white border border-[#e2e8f0] p-5 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.05)]">
          <p className="text-xs font-medium text-[#64748b]">Verifikasi Otomatis Google Maps</p>
          <p className="font-display text-sm font-semibold text-[#1a1b22] mt-1">
            Konfirmasi Master → Pantau Google → Live Otomatis
          </p>
          <p className="text-xs text-[#444653] mt-1">
            Tanpa persetujuan manual — sistem mencocokkan langsung dengan Google Maps / GBP API
          </p>
        </div>
      </section>

      {/* Queue List */}
      <section className="rounded-3xl bg-white border border-[#e2e8f0] shadow-[0_4px_20px_-2px_rgba(15,23,42,0.05)] overflow-hidden">
        <div className="p-5 border-b border-[#e2e8f0] flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-2xl bg-[#f1f5f9]">
            {(
              [
                { id: 'ALL', label: 'Semua Riwayat' },
                { id: 'pending_review', label: 'Menunggu Review Google' },
                { id: 'approved_live', label: 'Terkonfirmasi Live Google' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-medium smooth-transition whitespace-nowrap ${
                  filter === tab.id
                    ? 'bg-white text-[#1a1b22] shadow-xs'
                    : 'text-[#444653] hover:text-[#1a1b22]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {pendingCount > 0 && (
              <button
                type="button"
                disabled={isVerifyingSyncJobs}
                onClick={handleCheckAllPending}
                className="h-10 px-4 rounded-2xl bg-[#00529C] hover:bg-[#004080] text-white text-xs font-semibold inline-flex items-center gap-2 smooth-transition whitespace-nowrap disabled:opacity-60"
              >
                {isVerifyingSyncJobs && !checkingJobId ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Memeriksa Google Maps...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Periksa Status Live Google Maps</span>
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={() => setActiveView('directory')}
              className="h-10 px-4 rounded-2xl bg-[#eff6ff] hover:bg-[#dbeafe] text-xs font-semibold text-[#00529C] inline-flex items-center gap-2 smooth-transition whitespace-nowrap"
            >
              <MapPin className="h-3.5 w-3.5" />
              <span>Edit Data di Direktori Cabang</span>
            </button>
          </div>
        </div>

        {filteredJobs.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <GitCompareArrows className="h-9 w-9 text-[#94a3b8] mx-auto" />
            <div className="space-y-1">
              <p className="font-display text-base font-semibold text-[#1a1b22]">
                {filter === 'approved_live'
                  ? 'Belum Ada Perubahan yang Terkonfirmasi Live di Google Maps'
                  : 'Belum Ada Pengajuan Perubahan ke Google Maps'}
              </p>
              <p className="text-sm text-[#64748b] max-w-md mx-auto">
                {filter === 'approved_live'
                  ? 'Halaman ini akan terisi otomatis saat data live Google Maps / GBP terdeteksi sudah berubah sesuai Master Data BRI.'
                  : 'Ubah data unit kerja di Direktori atau Kualitas Data lalu klik “Konfirmasi & Sinkronkan ke Google Maps”.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveView('directory')}
              className="h-10 px-5 rounded-2xl bg-[#00529C] text-white text-xs font-semibold hover:bg-[#004080] smooth-transition inline-flex items-center gap-2"
            >
              <span>Buka Direktori Cabang</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="divide-y divide-[#e2e8f0]">
            {filteredJobs.map((job) => {
              const isPending = job.status === 'pending_review';
              const isCheckingThis = checkingJobId === job.id;
              const mapsLink =
                job.googleMapsUri ||
                `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  `BRI ${job.branchName}`
                )}`;

              return (
                <div key={job.id} className="p-5 sm:p-6 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[#64748b] font-mono tabular-nums">
                        <span className="font-semibold text-[#1a1b22]">{job.id}</span>
                        <span aria-hidden="true">·</span>
                        <span>Kode {job.branchCode}</span>
                        <span aria-hidden="true">·</span>
                        <span>{job.regionShort}</span>
                        <span aria-hidden="true">·</span>
                        <span>Oleh {job.submittedBy}</span>
                        <span aria-hidden="true">·</span>
                        <span>{job.submittedAt}</span>
                      </div>
                      <h3 className="font-display text-base font-bold text-[#1a1b22]">
                        {job.branchName}
                      </h3>
                      <p className="text-xs text-[#444653]">{job.note}</p>
                      {job.verificationNote && (
                        <p className="text-xs font-medium text-[#00529C] pt-0.5">
                          {job.verificationNote}
                        </p>
                      )}
                    </div>

                    {isPending ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#eff6ff] text-[#00529C] border border-[#bfdbfe] px-3 py-1 text-xs font-semibold whitespace-nowrap shrink-0">
                        <Clock className="h-3.5 w-3.5" />
                        Menunggu Konfirmasi Google
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ecfdf5] text-[#059669] border border-[#a7f3d0] px-3 py-1 text-xs font-semibold whitespace-nowrap shrink-0">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Otomatis Live di Maps ({job.approvedAt})
                      </span>
                    )}
                  </div>

                  {/* Field Changes Diff */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {job.changes.map((chg, idx) => (
                      <div
                        key={`${job.id}-${chg.field}-${idx}`}
                        className="rounded-2xl bg-[#f8fafc] border border-[#e2e8f0] p-3.5 space-y-1.5 text-xs"
                      >
                        <p className="font-semibold text-[#1a1b22]">{chg.fieldLabel}</p>
                        <div className="flex flex-wrap items-center gap-2 font-mono">
                          <span className="text-[#64748b] line-through">{chg.previousValue}</span>
                          <span aria-hidden="true" className="text-[#64748b]">
                            →
                          </span>
                          <span className="text-[#059669] font-semibold">{chg.newValue}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Action Controls (Auto-verified, no manual approval button) */}
                  <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
                    <p className="text-[11px] font-mono text-[#64748b] tabular-nums">
                      {job.lastCheckedAt
                        ? `Terakhir dicek ke Google Maps: ${job.lastCheckedAt}`
                        : 'Siap diperiksa otomatis terhadap Google Maps / GBP'}
                    </p>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedBranchId(job.branchId);
                          setActiveView('directory');
                        }}
                        className="h-9 px-3.5 rounded-xl border border-[#cbd5e1] bg-white hover:bg-[#f8fafc] text-xs font-medium text-[#1a1b22] smooth-transition whitespace-nowrap"
                      >
                        Inspeksi Cabang
                      </button>

                      <a
                        href={mapsLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="h-9 px-3.5 rounded-xl border border-[#cbd5e1] bg-white hover:bg-[#f8fafc] text-xs font-semibold text-[#00529C] inline-flex items-center gap-1.5 smooth-transition whitespace-nowrap"
                      >
                        <span>Buka di Google Maps</span>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>

                      {isPending && (
                        <button
                          type="button"
                          disabled={isVerifyingSyncJobs}
                          onClick={() => handleCheckSingleJob(job.id)}
                          className="h-9 px-3.5 rounded-xl bg-[#eff6ff] hover:bg-[#dbeafe] text-xs font-semibold text-[#00529C] inline-flex items-center gap-1.5 smooth-transition whitespace-nowrap disabled:opacity-55"
                        >
                          {isCheckingThis ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3.5 w-3.5" />
                          )}
                          <span>Cek Status Live Sekarang</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
