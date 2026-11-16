import { useDeferredValue, useMemo, useState } from 'react';
import {
  CheckCircle2,
  History,
  Loader2,
  MapPin,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { useGbpAuth } from '../context/GbpAuthContext';
import { useOps } from '../context/OpsContext';
import type { ChangeHistorySource, ListingSecurityAlert } from '../types/ops';

const SOURCE_LABELS: Record<ChangeHistorySource, string> = {
  master_edit: 'Edit Master',
  batch_mark_fix: 'Perbaikan 1-Klik',
  bulk_import: 'Bulk Import / Naik Status',
  quality_fix: 'Kualitas Data',
  gbp_push: 'Dorong GBP API',
  security_restore: 'Pemulihan Keamanan',
  google_auto_verify: 'Konfirmasi Google',
};

const SOURCE_FILTERS: Array<{ id: 'ALL' | ChangeHistorySource; label: string }> = [
  { id: 'ALL', label: 'Semua Sumber' },
  { id: 'batch_mark_fix', label: 'Perbaikan 1-Klik' },
  { id: 'bulk_import', label: 'Bulk Import / Naik Status' },
  { id: 'master_edit', label: 'Edit Master' },
  { id: 'quality_fix', label: 'Kualitas Data' },
  { id: 'gbp_push', label: 'Push GBP' },
  { id: 'security_restore', label: 'Pemulihan Keamanan' },
  { id: 'google_auto_verify', label: 'Konfirmasi Google' },
];

const ALERT_TYPE_LABELS: Record<ListingSecurityAlert['alertType'], string> = {
  takeover_attempt: 'Upaya Pengambilalihan Listing',
  unauthorized_edit: 'Perubahan Info Tidak Dikenal',
  suspicious_contact: 'Penggantian Kontak Mencurigakan',
  unknown_account: 'Akun Eksternal Tidak Dikenal',
};

export function HistorySecurityView() {
  const {
    changeHistory,
    securityAlerts,
    isScanningSecurity,
    resolveSecurityAlert,
    scanListingSecurity,
    setSelectedBranchId,
    setActiveView,
  } = useOps();
  const { gbpUser } = useGbpAuth();

  const [activeTab, setActiveTab] = useState<'alerts' | 'history'>('alerts');
  const [alertStatusFilter, setAlertStatusFilter] = useState<'active' | 'all'>('active');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | ChangeHistorySource>('ALL');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const [processingAlertId, setProcessingAlertId] = useState<string | null>(null);

  const activeAlertsCount = useMemo(
    () => securityAlerts.filter((a) => a.status === 'active').length,
    [securityAlerts]
  );
  const mitigatedCount = useMemo(
    () => securityAlerts.filter((a) => a.status === 'mitigated').length,
    [securityAlerts]
  );

  const filteredAlerts = useMemo(() => {
    return securityAlerts.filter((a) => {
      if (alertStatusFilter === 'active' && a.status !== 'active') return false;
      if (deferredSearch) {
        const hay = `${a.branchCode} ${a.branchName} ${a.regionShort} ${a.suspectActor} ${a.fieldChanged}`.toLowerCase();
        if (!hay.includes(deferredSearch)) return false;
      }
      return true;
    });
  }, [securityAlerts, alertStatusFilter, deferredSearch]);

  const filteredHistory = useMemo(() => {
    return changeHistory.filter((ev) => {
      if (sourceFilter !== 'ALL' && ev.source !== sourceFilter) return false;
      if (deferredSearch) {
        const hay = `${ev.branchCode} ${ev.branchName} ${ev.regionShort} ${ev.actor} ${ev.summary}`.toLowerCase();
        if (!hay.includes(deferredSearch)) return false;
      }
      return true;
    });
  }, [changeHistory, sourceFilter, deferredSearch]);

  const handleResolve = async (alertId: string, action: 'mitigate' | 'dismiss') => {
    setProcessingAlertId(alertId);
    try {
      await resolveSecurityAlert(alertId, action);
    } finally {
      setProcessingAlertId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="rounded-3xl bg-white border border-[#e2e8f0] p-5 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.05)] flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-[#64748b]">Alert Keamanan Aktif</p>
            <p
              className={`font-mono text-3xl font-bold tabular-nums mt-1 ${
                activeAlertsCount > 0 ? 'text-[#dc2626]' : 'text-[#059669]'
              }`}
            >
              {activeAlertsCount.toLocaleString('id-ID')}
            </p>
            <p className="text-xs text-[#444653] mt-1">
              Deteksi pengambilalihan &amp; ubahan tidak dikenal
            </p>
          </div>
          <div
            className={`h-11 w-11 rounded-2xl flex items-center justify-center shrink-0 ${
              activeAlertsCount > 0
                ? 'bg-[#fef2f2] text-[#dc2626]'
                : 'bg-[#ecfdf5] text-[#059669]'
            }`}
          >
            <ShieldAlert className="h-5 w-5" />
          </div>
        </div>

        <div className="rounded-3xl bg-white border border-[#e2e8f0] p-5 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.05)] flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-[#64748b]">Dipulihkan ke Master BRI</p>
            <p className="font-mono text-3xl font-bold text-[#059669] tabular-nums mt-1">
              {mitigatedCount.toLocaleString('id-ID')}
            </p>
            <p className="text-xs text-[#444653] mt-1">
              Listing diamankan kembali sesuai data pusat
            </p>
          </div>
          <div className="h-11 w-11 rounded-2xl bg-[#ecfdf5] text-[#059669] flex items-center justify-center shrink-0">
            <ShieldCheck className="h-5 w-5" />
          </div>
        </div>

        <div className="rounded-3xl bg-white border border-[#e2e8f0] p-5 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.05)] flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-[#64748b]">Total Log Histori Perubahan</p>
            <p className="font-mono text-3xl font-bold text-[#1a1b22] tabular-nums mt-1">
              {changeHistory.length.toLocaleString('id-ID')}
            </p>
            <p className="text-xs text-[#444653] mt-1">
              Rekam jejak seluruh perubahan Master &amp; GBP
            </p>
          </div>
          <div className="h-11 w-11 rounded-2xl bg-[#eff6ff] text-[#00529C] flex items-center justify-center shrink-0">
            <History className="h-5 w-5" />
          </div>
        </div>
      </section>

      {/* Toolbar: Tabs, Search & Security Scan */}
      <section className="rounded-3xl bg-white border border-[#e2e8f0] p-5 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.05)] space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="inline-flex items-center gap-1.5 p-1 rounded-2xl bg-[#f1f5f9] w-fit">
            <button
              type="button"
              onClick={() => setActiveTab('alerts')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold smooth-transition inline-flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'alerts'
                  ? 'bg-white text-[#1a1b22] shadow-xs'
                  : 'text-[#444653] hover:text-[#1a1b22]'
              }`}
            >
              <ShieldAlert className="h-3.5 w-3.5 text-[#dc2626]" />
              <span>Alert Pengambilalihan &amp; Anomali ({activeAlertsCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold smooth-transition inline-flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'history'
                  ? 'bg-white text-[#1a1b22] shadow-xs'
                  : 'text-[#444653] hover:text-[#1a1b22]'
              }`}
            >
              <History className="h-3.5 w-3.5 text-[#00529C]" />
              <span>Histori Perubahan Data ({changeHistory.length})</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative min-w-[260px] flex-1 sm:flex-initial">
              <Search className="h-4 w-4 text-[#64748b] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari kode unit, cabang, atau operator..."
                className="w-full h-10 pl-10 pr-4 rounded-2xl bg-[#f8fafc] border border-[#cbd5e1] text-xs text-[#1a1b22] placeholder:text-[#94a3b8] focus:outline-none focus:bg-white focus:border-[#00529C]"
              />
            </div>

            <button
              type="button"
              disabled={isScanningSecurity}
              onClick={() => scanListingSecurity(gbpUser?.email)}
              className="h-10 px-4 rounded-2xl bg-[#00529C] hover:bg-[#004080] text-white text-xs font-semibold inline-flex items-center gap-2 disabled:opacity-60 smooth-transition whitespace-nowrap shrink-0"
            >
              {isScanningSecurity ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Memindai Listing...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>Pindai Keamanan Listing</span>
                </>
              )}
            </button>
          </div>
        </div>

        {activeTab === 'alerts' ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setAlertStatusFilter('active')}
              className={`h-8 px-3.5 rounded-xl text-xs font-semibold border smooth-transition ${
                alertStatusFilter === 'active'
                  ? 'bg-[#fef2f2] border-[#fecaca] text-[#dc2626]'
                  : 'bg-white border-[#cbd5e1] text-[#444653] hover:bg-[#f1f5f9]'
              }`}
            >
              Alert Aktif ({activeAlertsCount})
            </button>
            <button
              type="button"
              onClick={() => setAlertStatusFilter('all')}
              className={`h-8 px-3.5 rounded-xl text-xs font-semibold border smooth-transition ${
                alertStatusFilter === 'all'
                  ? 'bg-[#eff6ff] border-[#bfdbfe] text-[#00529C]'
                  : 'bg-white border-[#cbd5e1] text-[#444653] hover:bg-[#f1f5f9]'
              }`}
            >
              Semua Riwayat Alert ({securityAlerts.length})
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-2xl bg-[#f1f5f9] w-fit">
            {SOURCE_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setSourceFilter(f.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium smooth-transition whitespace-nowrap ${
                  sourceFilter === f.id
                    ? 'bg-white text-[#1a1b22] shadow-xs'
                    : 'text-[#444653] hover:text-[#1a1b22]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Main Content */}
      {activeTab === 'alerts' ? (
        <section className="space-y-4">
          {filteredAlerts.length === 0 ? (
            <div className="rounded-3xl bg-white border border-[#e2e8f0] p-12 text-center space-y-2">
              <ShieldCheck className="h-9 w-9 text-[#059669] mx-auto" />
              <p className="font-display text-base font-semibold text-[#1a1b22]">
                Tidak Ada Alert Pengambilalihan Aktif
              </p>
              <p className="text-xs text-[#64748b] max-w-md mx-auto">
                Seluruh listing unit kerja BRI terpantau aman dari upaya klaim maupun perubahan info
                oleh akun yang tidak dikenal.
              </p>
            </div>
          ) : (
            filteredAlerts.map((alert) => {
              const isBusy = processingAlertId === alert.id;
              const isResolved = alert.status !== 'active';

              return (
                <article
                  key={alert.id}
                  className="rounded-3xl bg-white border border-[#e2e8f0] p-6 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.05)] space-y-4"
                >
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                    <div className="space-y-1.5 min-w-0">
                      <p className="text-xs font-mono text-[#64748b] tabular-nums">
                        <span
                          className={`font-semibold ${
                            alert.status === 'active'
                              ? alert.severity === 'critical'
                                ? 'text-[#dc2626]'
                                : 'text-[#d97706]'
                              : 'text-[#059669]'
                          }`}
                        >
                          {alert.status === 'active'
                            ? alert.severity === 'critical'
                              ? 'KRITIS'
                              : 'TINGGI'
                            : alert.status === 'mitigated'
                              ? 'DIPULIHKAN KE MASTER'
                              : 'TERVERIFIKASI AMAN'}
                        </span>
                        <span className="mx-1.5">·</span>
                        <span>{ALERT_TYPE_LABELS[alert.alertType]}</span>
                        <span className="mx-1.5">·</span>
                        <span>{alert.detectedAt}</span>
                      </p>

                      <h3 className="font-display text-base font-bold text-[#1a1b22]">
                        {alert.branchCode} · {alert.branchName}{' '}
                        <span className="font-normal text-[#64748b]">({alert.regionShort})</span>
                      </h3>

                      <p className="text-xs text-[#444653]">{alert.description}</p>
                      <p className="text-xs text-[#64748b]">
                        Sumber / Pelaku Terdeteksi:{' '}
                        <span className="font-semibold text-[#1a1b22]">{alert.suspectActor}</span>
                      </p>
                    </div>

                    {!isResolved ? (
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleResolve(alert.id, 'mitigate')}
                          className="h-9 px-4 rounded-xl bg-[#dc2626] hover:bg-[#b91c1c] text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-60 whitespace-nowrap"
                        >
                          {isBusy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RotateCcw className="h-3.5 w-3.5" />
                          )}
                          <span>Pulihkan ke Master BRI &amp; Sinkron</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedBranchId(alert.branchId);
                            setActiveView('directory');
                          }}
                          className="h-9 px-3 rounded-xl bg-white border border-[#cbd5e1] hover:bg-[#f1f5f9] text-xs font-medium text-[#1a1b22] inline-flex items-center gap-1 whitespace-nowrap"
                        >
                          <MapPin className="h-3.5 w-3.5 text-[#00529C]" />
                          <span>Inspeksi</span>
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleResolve(alert.id, 'dismiss')}
                          className="h-9 px-3 rounded-xl bg-white border border-[#cbd5e1] hover:bg-[#f1f5f9] text-xs font-medium text-[#444653] whitespace-nowrap"
                        >
                          Tandai Aman
                        </button>
                      </div>
                    ) : (
                      <div className="text-right text-xs text-[#059669] shrink-0">
                        <p className="font-semibold inline-flex items-center gap-1">
                          <CheckCircle2 className="h-4 w-4" />
                          <span>Selesai Ditangani</span>
                        </p>
                        {alert.resolvedAt && (
                          <p className="text-[11px] text-[#64748b] font-mono mt-0.5">
                            {alert.resolvedBy || 'Operator'} · {alert.resolvedAt}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-[#e2e8f0] text-xs">
                    <div className="rounded-2xl bg-[#fef2f2]/60 border border-[#fecaca]/80 p-3.5">
                      <span className="text-[11px] font-medium text-[#991b1b] block">
                        Percobaan Perubahan / Klaim Eksternal ({alert.fieldChanged})
                      </span>
                      <span className="font-mono text-[#dc2626] font-semibold break-all mt-0.5 block">
                        {alert.attemptedValue}
                      </span>
                    </div>
                    <div className="rounded-2xl bg-[#ecfdf5]/60 border border-[#a7f3d0]/80 p-3.5">
                      <span className="text-[11px] font-medium text-[#065f46] block">
                        Acuan Sah Master Data BRI
                      </span>
                      <span className="font-mono text-[#059669] font-semibold break-all mt-0.5 block">
                        {alert.masterValue}
                      </span>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </section>
      ) : (
        <section className="rounded-3xl bg-white border border-[#e2e8f0] shadow-[0_4px_20px_-2px_rgba(15,23,42,0.05)] overflow-hidden">
          {filteredHistory.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <History className="h-9 w-9 text-[#94a3b8] mx-auto" />
              <p className="font-display text-base font-semibold text-[#1a1b22]">
                Belum Ada Log Perubahan Data pada Filter Ini
              </p>
              <p className="text-xs text-[#64748b]">
                Setiap perbaikan 1-klik, Bulk Import naik status UKO, edit master, atau pemulihan
                keamanan tercatat otomatis di sini.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#e2e8f0]">
              {filteredHistory.map((ev) => (
                <div
                  key={ev.id}
                  className="p-5 hover:bg-[#f8fafc] smooth-transition flex flex-col lg:flex-row lg:items-start justify-between gap-4"
                >
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <p className="text-xs font-mono text-[#64748b] tabular-nums">
                      <span className="font-semibold text-[#00529C]">
                        {SOURCE_LABELS[ev.source] || ev.source}
                      </span>
                      <span className="mx-1.5">·</span>
                      <span>{ev.timestamp}</span>
                      <span className="mx-1.5">·</span>
                      <span>Oleh: {ev.actor}</span>
                    </p>

                    <div className="flex flex-wrap items-baseline gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedBranchId(ev.branchId);
                          setActiveView('directory');
                        }}
                        className="font-display text-sm font-bold text-[#1a1b22] hover:text-[#00529C] text-left"
                      >
                        {ev.branchCode} · {ev.branchName}
                      </button>
                      <span className="text-xs text-[#64748b]">({ev.regionShort})</span>
                    </div>

                    <p className="text-xs text-[#444653]">{ev.summary}</p>
                  </div>

                  {ev.changes.length > 0 && (
                    <div className="lg:w-[46%] space-y-1.5">
                      {ev.changes.slice(0, 4).map((chg, idx) => (
                        <div
                          key={idx}
                          className="rounded-xl bg-[#f8fafc] border border-[#e2e8f0] px-3 py-2 text-xs"
                        >
                          <span className="font-semibold text-[#1a1b22] block">
                            {chg.fieldLabel}
                          </span>
                          <p className="font-mono text-[11px] text-[#64748b] break-all mt-0.5">
                            <span className="line-through text-[#dc2626]/80">
                              {chg.previousValue || '—'}
                            </span>
                            <span className="mx-1.5 text-[#444653]">→</span>
                            <span className="text-[#059669] font-semibold">
                              {chg.newValue || '—'}
                            </span>
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
