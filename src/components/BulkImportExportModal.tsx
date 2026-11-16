import { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
  X,
} from 'lucide-react';
import { useOps } from '../context/OpsContext';
import type { BranchLocation, BranchTier, BulkImportRowInput } from '../types/ops';

interface BulkImportExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'import' | 'export';
  filterContext: {
    region: string;
    tier: string;
    status: string;
    search: string;
    filteredCount: number;
  };
}

interface ParsedCsvRow {
  rowIndex: number;
  status: 'upgrade' | 'update' | 'add' | 'invalid';
  reason?: string;
  matchedBranch?: {
    id: string;
    code: string;
    name: string;
    tier: BranchTier;
  };
  nextTier: BranchTier;
  data: BulkImportRowInput;
}

function normalizeTierClient(raw: string): BranchTier {
  const upper = (raw || '').toUpperCase();
  if (upper.includes('RO') || upper.includes('KANWIL') || upper.includes('REGIONAL')) return 'RO';
  if (upper.includes('KCP') || upper.includes('PEMBANTU')) return 'KCP';
  if (upper.includes('KC') || upper.includes('KANTOR CABANG')) return 'KC';
  if (upper.includes('KK') || upper.includes('KAS')) return 'KK';
  if (upper.includes('SSB')) return 'SSB';
  if (upper.includes('TERAS')) return 'TERAS';
  return 'UNIT';
}

function normalizeCoreBranchName(raw: string): string {
  return (raw || '')
    .toLowerCase()
    .replace(
      /\b(pt|bank rakyat indonesia|bank|bri|kantor cabang pembantu|kantor cabang|kantor kas|kacab|kcp|kc|kk|unit|teras|ssb|regional office|ro)\b/g,
      ' '
    )
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parseCsvMatrix(text: string): string[][] {
  const cleanText = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < cleanText.length; i++) {
    const ch = cleanText[i];
    if (inQuotes) {
      if (ch === '"') {
        if (cleanText[i + 1] === '"') {
          currentCell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentCell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if (ch === '\r') {
      if (cleanText[i + 1] === '\n') i++;
      currentRow.push(currentCell.trim());
      if (currentRow.some((cell) => cell !== '')) rows.push(currentRow);
      currentRow = [];
      currentCell = '';
    } else if (ch === '\n') {
      currentRow.push(currentCell.trim());
      if (currentRow.some((cell) => cell !== '')) rows.push(currentRow);
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += ch;
    }
  }

  if (currentCell !== '' || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((cell) => cell !== '')) rows.push(currentRow);
  }
  return rows;
}

export function BulkImportExportModal({
  isOpen,
  onClose,
  initialTab = 'export',
  filterContext,
}: BulkImportExportModalProps) {
  const { branches, downloadMasterCsv, bulkImportMasterCsv } = useOps();
  const [activeTab, setActiveTab] = useState<'import' | 'export'>(initialTab);
  const [fileName, setFileName] = useState<string>('');
  const [parsedRows, setParsedRows] = useState<ParsedCsvRow[]>([]);
  const [submitToGoogleReview, setSubmitToGoogleReview] = useState(true);
  const [updateOnly, setUpdateOnly] = useState(false);
  const [confirmingImport, setConfirmingImport] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const branchLookup = useMemo(() => {
    const byCode = new Map<string, BranchLocation[]>();
    const byPoi = new Map<string, BranchLocation>();
    const byCoreCity = new Map<string, BranchLocation>();

    for (const b of branches) {
      const list = byCode.get(b.code) ?? [];
      list.push(b);
      byCode.set(b.code, list);

      if (b.existingPoi) {
        byPoi.set(b.existingPoi.trim().toLowerCase(), b);
      }

      const core = normalizeCoreBranchName(b.name);
      if (core.length >= 4) {
        const key = `${core}::${b.city.toLowerCase()}`;
        if (!byCoreCity.has(key)) byCoreCity.set(key, b);
      }
    }

    return { byCode, byPoi, byCoreCity };
  }, [branches]);

  const summary = useMemo(() => {
    let upgradeCount = 0;
    let updateCount = 0;
    let addCount = 0;
    let skippedCount = 0;
    let invalidCount = 0;

    for (const r of parsedRows) {
      if (r.status === 'upgrade') upgradeCount++;
      else if (r.status === 'update') updateCount++;
      else if (r.status === 'add') {
        if (updateOnly) skippedCount++;
        else addCount++;
      } else {
        invalidCount++;
      }
    }
    const existingTotal = upgradeCount + updateCount;
    const validCount = existingTotal + addCount;
    return {
      upgradeCount,
      updateCount,
      existingTotal,
      addCount,
      skippedCount,
      invalidCount,
      validCount,
    };
  }, [parsedRows, updateOnly]);

  if (!isOpen) return null;

  const findMatchedBranch = (
    paddedCode: string,
    nextTier: BranchTier,
    name: string,
    city: string,
    existingPoi: string,
    lat: number,
    lng: number
  ): BranchLocation | undefined => {
    // 1. Exact code (+ tier preference) or any branch sharing Code Branch
    const codeCandidates = branchLookup.byCode.get(paddedCode);
    if (codeCandidates && codeCandidates.length > 0) {
      return codeCandidates.find((b) => b.tier === nextTier) ?? codeCandidates[0];
    }

    // 2. Eksisting POI match
    const poiClean = existingPoi.trim().toLowerCase();
    if (poiClean && branchLookup.byPoi.has(poiClean)) {
      return branchLookup.byPoi.get(poiClean);
    }

    // 3. Normalized core name + city
    const core = normalizeCoreBranchName(name);
    const cityLower = city.trim().toLowerCase();
    if (core.length >= 4) {
      const exactKey = `${core}::${cityLower}`;
      if (branchLookup.byCoreCity.has(exactKey)) {
        return branchLookup.byCoreCity.get(exactKey);
      }
      const fuzzyMatch = branches.find((b) => {
        const bCore = normalizeCoreBranchName(b.name);
        if (!bCore || bCore !== core) return false;
        if (!cityLower || cityLower === 'indonesia') return true;
        return b.city.toLowerCase().includes(cityLower) || cityLower.includes(b.city.toLowerCase());
      });
      if (fuzzyMatch) return fuzzyMatch;
    }

    // 4. Coordinate proximity (< ~60m) + city
    if (lat !== 0 && lng !== 0 && Number.isFinite(lat) && Number.isFinite(lng)) {
      return branches.find(
        (b) =>
          Math.abs(b.lat - lat) < 0.00055 &&
          Math.abs(b.lng - lng) < 0.00055 &&
          (!cityLower || b.city.toLowerCase() === cityLower)
      );
    }

    return undefined;
  };

  const handleFileChange = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    setParseError(null);
    setConfirmingImport(false);

    try {
      const text = await file.text();
      const matrix = parseCsvMatrix(text);
      if (matrix.length < 2) {
        setParseError('File CSV kosong atau tidak memiliki baris data.');
        setParsedRows([]);
        return;
      }

      const headerRow = matrix[0].map((h) => h.trim().toLowerCase());
      const findCol = (aliases: string[]) =>
        headerRow.findIndex((h) => aliases.some((a) => h === a || h.includes(a)));

      const idxRegion = findCol(['regional office', 'region']);
      const idxName = findCol(['nama kantor unit kerja', 'nama unit', 'name']);
      const idxCode = findCol(['code branch', 'kode cabang', 'code']);
      const idxTier = findCol(['status kantor / jenis uker', 'jenis uker', 'status kantor', 'tier']);
      const idxLat = findCol(['latitude', 'lat']);
      const idxLng = findCol(['longitude', 'lng', 'lon']);
      const idxAddr = findCol(['alamat', 'address']);
      const idxVillage = findCol(['nama desa/ kelurahan', 'kelurahan']);
      const idxDistrict = findCol(['nama kecamatan', 'kecamatan']);
      const idxCityCode = findCol(['kode kabupaten/ kota']);
      const idxCity = findCol(['nama kab/kota', 'kota', 'city']);
      const idxProvince = findCol(['nama provinsi', 'provinsi', 'province']);
      const idxPostal = findCol(['kode pos', 'postal']);
      const idxPhone = findCol(['phone', 'telepon']);
      const idxWebsite = findCol(['website']);
      const idxMon = findCol(['mon_hours', 'operatinghours', 'jam']);
      const idxSat = findCol(['sat_hours', 'saturdayhours']);
      const idxSun = findCol(['sun_hours', 'sundayhours']);
      const idxPoi = findCol(['eksisting poi', 'existing poi', 'poi']);

      if (idxName === -1 || idxCode === -1) {
        setParseError(
          'Kolom wajib "Nama Kantor Unit Kerja" dan "Code Branch" tidak ditemukan. Gunakan template 24 kolom standar BRI.'
        );
        setParsedRows([]);
        return;
      }

      const results: ParsedCsvRow[] = [];
      for (let i = 1; i < matrix.length; i++) {
        const cols = matrix[i];
        const name = (cols[idxName] || '').trim();
        const code = (cols[idxCode] || '').trim();
        const lat = idxLat >= 0 ? Number((cols[idxLat] || '').replace(',', '.')) : -6.2;
        const lng = idxLng >= 0 ? Number((cols[idxLng] || '').replace(',', '.')) : 106.8;
        const tierRaw = idxTier >= 0 ? cols[idxTier] || 'UNIT' : 'UNIT';
        const city = idxCity >= 0 ? cols[idxCity] || '' : '';
        const existingPoi = idxPoi >= 0 ? cols[idxPoi] || '' : '';

        const rowInput: BulkImportRowInput = {
          region: idxRegion >= 0 ? cols[idxRegion] || '' : '',
          name,
          code,
          tierRaw,
          lat: Number.isFinite(lat) ? lat : -6.2,
          lng: Number.isFinite(lng) ? lng : 106.8,
          address: idxAddr >= 0 ? cols[idxAddr] || '' : '',
          village: idxVillage >= 0 ? cols[idxVillage] || '' : '',
          district: idxDistrict >= 0 ? cols[idxDistrict] || '' : '',
          cityCode: idxCityCode >= 0 ? cols[idxCityCode] || '' : '',
          city,
          province: idxProvince >= 0 ? cols[idxProvince] || '' : '',
          postalCode: idxPostal >= 0 ? cols[idxPostal] || '' : '',
          phone: idxPhone >= 0 ? cols[idxPhone] || '' : '',
          website: idxWebsite >= 0 ? cols[idxWebsite] || '' : '',
          operatingHours: idxMon >= 0 ? cols[idxMon] || '' : '08:00-15:00',
          saturdayHours: idxSat >= 0 ? cols[idxSat] || '' : '',
          sundayHours: idxSun >= 0 ? cols[idxSun] || '' : '',
          existingPoi,
        };

        const nextTier = normalizeTierClient(tierRaw);

        if (!name || !code) {
          results.push({
            rowIndex: i + 1,
            status: 'invalid',
            reason: 'Nama Unit atau Code Branch kosong',
            nextTier,
            data: rowInput,
          });
          continue;
        }

        const padded = code.padStart(4, '0');
        const matched = findMatchedBranch(
          padded,
          nextTier,
          name,
          city,
          existingPoi,
          rowInput.lat,
          rowInput.lng
        );

        if (matched) {
          const isTierUpgrade = Boolean(tierRaw) && nextTier !== matched.tier;
          results.push({
            rowIndex: i + 1,
            status: isTierUpgrade ? 'upgrade' : 'update',
            nextTier,
            matchedBranch: {
              id: matched.id,
              code: matched.code,
              name: matched.name,
              tier: matched.tier,
            },
            data: rowInput,
          });
        } else {
          results.push({
            rowIndex: i + 1,
            status: 'add',
            nextTier,
            data: rowInput,
          });
        }
      }

      setParsedRows(results);
    } catch {
      setParseError('Gagal membaca file CSV. Pastikan file berformat UTF-8 CSV yang valid.');
      setParsedRows([]);
    }
  };

  const handleConfirmImport = async () => {
    const validRows = parsedRows.filter((r) => r.status !== 'invalid').map((r) => r.data);
    if (validRows.length === 0) return;
    setIsImporting(true);
    try {
      await bulkImportMasterCsv(validRows, submitToGoogleReview, updateOnly);
      setParsedRows([]);
      setFileName('');
      setConfirmingImport(false);
      onClose();
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Gagal memproses bulk import.');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div
        onClick={() => !isImporting && onClose()}
        className="fixed inset-0 bg-[#0f172a]/35 backdrop-blur-xs"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Bulk Import dan Eksport Master Data BRI"
        className="relative z-10 w-full max-w-3xl max-h-[90vh] rounded-3xl bg-white border border-[#e2e8f0] shadow-[0_25px_40px_-8px_rgba(15,23,42,0.14)] flex flex-col overflow-hidden"
      >
        <div className="px-6 py-5 border-b border-[#e2e8f0] flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-display text-lg font-bold text-[#1a1b22]">
              Bulk Import &amp; Eksport Master Data BRI
            </h2>
            <p className="text-xs text-[#64748b]">
              Mendukung pembaruan status UKO (mis. KCP → KC) tanpa duplikasi titik lokasi baru.
            </p>
          </div>
          <button
            type="button"
            disabled={isImporting}
            onClick={onClose}
            aria-label="Tutup modal import eksport"
            className="h-9 w-9 rounded-xl text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#1a1b22] flex items-center justify-center smooth-transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="px-6 pt-4">
          <div className="inline-flex items-center gap-1.5 p-1 rounded-2xl bg-[#f1f5f9]">
            <button
              type="button"
              onClick={() => setActiveTab('export')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold smooth-transition inline-flex items-center gap-2 ${
                activeTab === 'export'
                  ? 'bg-white text-[#1a1b22] shadow-xs'
                  : 'text-[#444653] hover:text-[#1a1b22]'
              }`}
            >
              <Download className="h-3.5 w-3.5" />
              <span>Eksport Master CSV</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('import')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold smooth-transition inline-flex items-center gap-2 ${
                activeTab === 'import'
                  ? 'bg-white text-[#1a1b22] shadow-xs'
                  : 'text-[#444653] hover:text-[#1a1b22]'
              }`}
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Bulk Import &amp; Naik Status UKO</span>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {activeTab === 'export' ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] p-5 flex flex-col justify-between gap-4">
                <div className="space-y-1.5">
                  <FileSpreadsheet className="h-6 w-6 text-[#00529C]" />
                  <h3 className="font-display text-sm font-bold text-[#1a1b22]">
                    Semua Master Data
                  </h3>
                  <p className="text-xs text-[#64748b] leading-relaxed">
                    Unduh seluruh{' '}
                    <span className="font-mono font-semibold text-[#1a1b22]">
                      {branches.length.toLocaleString('id-ID')}
                    </span>{' '}
                    unit kerja beserta hasil perbaikan kualitas data terbaru.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => downloadMasterCsv()}
                  className="h-10 px-4 rounded-xl bg-[#00529C] hover:bg-[#004080] text-white text-xs font-semibold inline-flex items-center justify-center gap-2 smooth-transition whitespace-nowrap"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Unduh Semua CSV</span>
                </button>
              </div>

              <div className="rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] p-5 flex flex-col justify-between gap-4">
                <div className="space-y-1.5">
                  <FileSpreadsheet className="h-6 w-6 text-[#0284c7]" />
                  <h3 className="font-display text-sm font-bold text-[#1a1b22]">
                    Sesuai Filter Direktori
                  </h3>
                  <p className="text-xs text-[#64748b] leading-relaxed">
                    Unduh{' '}
                    <span className="font-mono font-semibold text-[#1a1b22]">
                      {filterContext.filteredCount.toLocaleString('id-ID')}
                    </span>{' '}
                    unit kerja sesuai filter Region, Tipe Unit, dan Status aktif saat ini.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    downloadMasterCsv({
                      region: filterContext.region,
                      tier: filterContext.tier,
                      status: filterContext.status,
                      search: filterContext.search,
                    })
                  }
                  className="h-10 px-4 rounded-xl bg-white border border-[#cbd5e1] hover:bg-[#f1f5f9] text-[#1a1b22] text-xs font-semibold inline-flex items-center justify-center gap-2 smooth-transition whitespace-nowrap"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Unduh Filter Aktif</span>
                </button>
              </div>

              <div className="rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] p-5 flex flex-col justify-between gap-4">
                <div className="space-y-1.5">
                  <FileSpreadsheet className="h-6 w-6 text-[#059669]" />
                  <h3 className="font-display text-sm font-bold text-[#1a1b22]">
                    Template Contoh (5 Baris)
                  </h3>
                  <p className="text-xs text-[#64748b] leading-relaxed">
                    Unduh contoh file CSV 24 kolom untuk disunting di Excel sebelum diunggah ulang
                    lewat Bulk Import.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => downloadMasterCsv({ templateOnly: true })}
                  className="h-10 px-4 rounded-xl bg-white border border-[#cbd5e1] hover:bg-[#f1f5f9] text-[#1a1b22] text-xs font-semibold inline-flex items-center justify-center gap-2 smooth-transition whitespace-nowrap"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Unduh Template CSV</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <label className="block rounded-2xl border-2 border-dashed border-[#cbd5e1] hover:border-[#00529C] bg-[#f8fafc] p-6 text-center cursor-pointer smooth-transition">
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => handleFileChange(e.target.files?.[0])}
                  className="sr-only"
                />
                <Upload className="h-7 w-7 text-[#00529C] mx-auto mb-2" />
                <p className="text-sm font-semibold text-[#1a1b22]">
                  {fileName ? `File dipilih: ${fileName}` : 'Pilih file CSV Master Lokasi BRI (.csv)'}
                </p>
                <p className="text-xs text-[#64748b] mt-1">
                  Cocok otomatis berdasarkan Code Branch, Eksisting POI, Nama Unit + Kota, maupun
                  Koordinat agar naik status UKO (mis. KCP → KC) tidak membuat duplikat.
                </p>
              </label>

              {parseError && (
                <div className="rounded-2xl bg-[#fef2f2] border border-[#fecaca] p-4 flex items-start gap-2.5 text-xs text-[#991b1b]">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{parseError}</span>
                </div>
              )}

              {parsedRows.length > 0 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="rounded-2xl bg-[#eff6ff] border border-[#bfdbfe] p-3.5">
                      <span className="text-[#444653] block">Naik Status UKO</span>
                      <span className="font-mono text-lg font-bold text-[#00529C] tabular-nums">
                        {summary.upgradeCount}
                      </span>
                    </div>
                    <div className="rounded-2xl bg-[#f8fafc] border border-[#e2e8f0] p-3.5">
                      <span className="text-[#444653] block">Perbarui Master Ada</span>
                      <span className="font-mono text-lg font-bold text-[#1a1b22] tabular-nums">
                        {summary.updateCount}
                      </span>
                    </div>
                    <div className="rounded-2xl bg-[#ecfdf5] border border-[#a7f3d0] p-3.5">
                      <span className="text-[#444653] block">
                        {updateOnly ? 'Dilewati (Mode Perbaikan)' : 'Tambah Unit Baru'}
                      </span>
                      <span className="font-mono text-lg font-bold text-[#059669] tabular-nums">
                        {updateOnly ? summary.skippedCount : summary.addCount}
                      </span>
                    </div>
                    <div className="rounded-2xl bg-[#fffbeb] border border-[#fde68a] p-3.5">
                      <span className="text-[#444653] block">Tidak Valid</span>
                      <span className="font-mono text-lg font-bold text-[#d97706] tabular-nums">
                        {summary.invalidCount}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[#e2e8f0] overflow-x-auto max-h-56">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-[#f8fafc] border-b border-[#e2e8f0] text-[#475569] font-semibold">
                          <th className="py-2.5 px-3">Baris</th>
                          <th className="py-2.5 px-3">Code</th>
                          <th className="py-2.5 px-3">Nama Unit Kerja</th>
                          <th className="py-2.5 px-3">Tipe UKO</th>
                          <th className="py-2.5 px-3">Tindakan Sistem</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#e2e8f0]">
                        {parsedRows.slice(0, 20).map((r) => (
                          <tr key={r.rowIndex}>
                            <td className="py-2 px-3 font-mono text-[#64748b] tabular-nums">
                              #{r.rowIndex}
                            </td>
                            <td className="py-2 px-3 font-mono font-semibold text-[#1a1b22] tabular-nums">
                              {r.data.code || '—'}
                            </td>
                            <td className="py-2 px-3 text-[#1a1b22] truncate max-w-[200px]">
                              {r.data.name || '—'}
                            </td>
                            <td className="py-2 px-3 font-mono text-[#444653]">
                              {r.status === 'upgrade' && r.matchedBranch
                                ? `${r.matchedBranch.tier} → ${r.nextTier}`
                                : r.nextTier}
                            </td>
                            <td className="py-2 px-3">
                              {r.status === 'upgrade' && r.matchedBranch ? (
                                <span className="font-semibold text-[#00529C]">
                                  Naik Status ({r.matchedBranch.tier} → {r.nextTier})
                                </span>
                              ) : r.status === 'update' ? (
                                <span className="font-semibold text-[#1a1b22]">
                                  Perbarui Master Ada
                                </span>
                              ) : r.status === 'add' ? (
                                updateOnly ? (
                                  <span className="font-semibold text-[#64748b]">
                                    Dilewati (Mode Perbaikan)
                                  </span>
                                ) : (
                                  <span className="font-semibold text-[#059669]">
                                    Tambah Titik Baru
                                  </span>
                                )
                              ) : (
                                <span className="font-semibold text-[#dc2626]">{r.reason}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="space-y-2.5 pt-1">
                    <label className="flex items-center gap-2.5 text-xs text-[#1a1b22] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={updateOnly}
                        onChange={(e) => setUpdateOnly(e.target.checked)}
                        className="h-4 w-4 rounded border-[#cbd5e1] text-[#00529C]"
                      />
                      <span>
                        <span className="font-semibold">Mode Khusus Perbaikan:</span> Hanya
                        perbarui unit yang sudah ada, jangan tambah titik lokasi baru
                      </span>
                    </label>

                    <label className="flex items-center gap-2.5 text-xs text-[#1a1b22] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={submitToGoogleReview}
                        onChange={(e) => setSubmitToGoogleReview(e.target.checked)}
                        className="h-4 w-4 rounded border-[#cbd5e1] text-[#00529C]"
                      />
                      <span>
                        Otomatis ajukan perubahan Master Data ke Antrean Sinkronisasi Google Maps
                        (Master → GBP)
                      </span>
                    </label>
                  </div>

                  {confirmingImport && (
                    <div className="rounded-2xl bg-[#fffbeb] border border-[#fde68a] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <p className="text-xs text-[#92400e] font-medium">
                        Konfirmasi memperbarui {summary.existingTotal} unit ({summary.upgradeCount}{' '}
                        naik status UKO)
                        {updateOnly
                          ? ` dan melewati ${summary.skippedCount} baris baru`
                          : ` serta menambah ${summary.addCount} unit baru`}
                        ?
                      </p>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={isImporting}
                          onClick={() => setConfirmingImport(false)}
                          className="h-9 px-3 rounded-xl bg-white border border-[#cbd5e1] text-xs font-medium text-[#1a1b22]"
                        >
                          Batal
                        </button>
                        <button
                          type="button"
                          disabled={isImporting}
                          onClick={handleConfirmImport}
                          className="h-9 px-4 rounded-xl bg-[#00529C] hover:bg-[#004080] text-white text-xs font-semibold inline-flex items-center gap-1.5"
                        >
                          {isImporting ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              <span>Mengimpor...</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              <span>Ya, Terapkan Import</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-[#f8fafc] border-t border-[#e2e8f0] flex items-center justify-end gap-3">
          <button
            type="button"
            disabled={isImporting}
            onClick={onClose}
            className="h-10 px-5 rounded-2xl bg-white border border-[#cbd5e1] hover:bg-[#f1f5f9] text-xs font-medium text-[#1a1b22] smooth-transition"
          >
            Tutup
          </button>

          {activeTab === 'import' && summary.validCount > 0 && !confirmingImport && (
            <button
              type="button"
              onClick={() => setConfirmingImport(true)}
              className="h-10 px-5 rounded-2xl bg-[#00529C] hover:bg-[#004080] text-white text-xs font-semibold inline-flex items-center gap-2 smooth-transition"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Impor {summary.validCount} Baris ke Master BRI</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

