import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownUp,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Layers,
  Link2,
  Loader2,
  MessageSquare,
  RefreshCw,
  Search,
  Star,
  ThumbsDown,
  ThumbsUp,
  X,
} from 'lucide-react';
import { useGbpAuth } from '../context/GbpAuthContext';
import { useOps } from '../context/OpsContext';
import type { ReplyStatus } from '../types/ops';

type ReviewSubTab = 'inbox' | 'branch_ratings';
type StarFilter = 'ALL' | 5 | 4 | 3 | 2 | 1;
type RatingBucketFilter = 'ALL' | 'GOOD' | 'MID' | 'LOW';

const INBOX_PAGE_SIZE = 25;
const RATING_PAGE_SIZE = 20;

export function ReviewsInbox() {
  const {
    branches,
    regions,
    setSelectedBranchId,
    reviews,
    scannedReviewBranchIds,
    reviewsAutoSyncing,
    refreshReviews,
    activeReviewId,
    setActiveReviewId,
    kpiStats,
    fetchLiveGooglePlace,
    syncAllGbpReviews,
    setActiveView,
    pushToast,
  } = useOps();
  const {
    isConnected: isGbpConnected,
    gbpAccessToken,
    selectedAccountName,
    gbpLocations,
  } = useGbpAuth();

  const [activeSubTab, setActiveSubTab] = useState<ReviewSubTab>('inbox');

  // Review list filters (Region, Location, Reply Status, Star 5 -> 1, Source, Search)
  const [replyFilter, setReplyFilter] = useState<'ALL' | ReplyStatus>('ALL');
  const [starFilter, setStarFilter] = useState<StarFilter>('ALL');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | 'gbp_api' | 'google_maps' | 'internal'>(
    'ALL'
  );
  const [regionFilter, setRegionFilter] = useState<string>('ALL');
  const [locationFilter, setLocationFilter] = useState<string>('ALL');
  const [reviewSearch, setReviewSearch] = useState('');
  const deferredReviewSearch = useDeferredValue(reviewSearch.trim().toLowerCase());
  const [inboxPage, setInboxPage] = useState(1);

  // Branch Rating Ranking tab state
  const [ratingBucket, setRatingBucket] = useState<RatingBucketFilter>('ALL');
  const [ratingRegionFilter, setRatingRegionFilter] = useState<string>('ALL');
  const [ratingSortDir, setRatingSortDir] = useState<'desc' | 'asc'>('asc');
  const [ratingSearch, setRatingSearch] = useState('');
  const deferredRatingSearch = useDeferredValue(ratingSearch.trim().toLowerCase());
  const [ratingPage, setRatingPage] = useState(1);
  const [loadingBranchId, setLoadingBranchId] = useState<string | null>(null);

  const [isSyncingAllGbp, setIsSyncingAllGbp] = useState(false);

  // Automatically refresh inbox while server background ingestion is completing
  useEffect(() => {
    void refreshReviews();
  }, [refreshReviews]);

  useEffect(() => {
    if (!reviewsAutoSyncing) return;
    const timer = window.setInterval(() => {
      void refreshReviews();
    }, 2500);
    return () => window.clearInterval(timer);
  }, [reviewsAutoSyncing, refreshReviews]);

  // Coverage stats across all locations & Regional Offices
  const coverageStats = useMemo(() => {
    const locMap = new Map<
      string,
      { branchId: string; branchCode: string; branchName: string; regionShort: string; count: number }
    >();
    const regionSet = new Set<string>();

    for (const rev of reviews) {
      regionSet.add(rev.regionShort);
      const existing = locMap.get(rev.branchId);
      if (existing) {
        existing.count++;
      } else {
        locMap.set(rev.branchId, {
          branchId: rev.branchId,
          branchCode: rev.branchCode,
          branchName: rev.branchName,
          regionShort: rev.regionShort,
          count: 1,
        });
      }
    }

    const locationOptions = Array.from(locMap.values()).sort((a, b) =>
      a.branchName.localeCompare(b.branchName, 'id')
    );

    return {
      uniqueBranchesWithReviews: locMap.size,
      uniqueRegionsCovered: regionSet.size,
      totalScannedUnits: Math.max(scannedReviewBranchIds.length, locMap.size),
      locationOptions,
    };
  }, [reviews, scannedReviewBranchIds]);

  const locationOptionsForRegion = useMemo(() => {
    if (regionFilter === 'ALL') return coverageStats.locationOptions;
    return coverageStats.locationOptions.filter((l) => l.regionShort === regionFilter);
  }, [coverageStats.locationOptions, regionFilter]);

  const handleOpenBranchReviews = async (branch: (typeof branches)[number]) => {
    setLoadingBranchId(branch.id);
    try {
      const hasReviewsAlready = reviews.some((r) => r.branchId === branch.id);
      if (!hasReviewsAlready) {
        await fetchLiveGooglePlace(branch, true);
        await refreshReviews();
      }
      setRegionFilter('ALL');
      setLocationFilter(branch.id);
      setInboxPage(1);
      setActiveSubTab('inbox');
    } catch {
      setRegionFilter('ALL');
      setLocationFilter(branch.id);
      setActiveSubTab('inbox');
    } finally {
      setLoadingBranchId(null);
    }
  };

  const handleSyncAllGbpLocations = async () => {
    if (!isGbpConnected || !gbpAccessToken || !selectedAccountName || gbpLocations.length === 0) {
      return;
    }
    setIsSyncingAllGbp(true);
    try {
      await syncAllGbpReviews(selectedAccountName, gbpLocations, gbpAccessToken);
      setInboxPage(1);
      setActiveSubTab('inbox');
    } catch (err) {
      pushToast({
        title: 'Gagal menyinkronkan seluruh lokasi GBP',
        description: err instanceof Error ? err.message : 'Terjadi kesalahan pada GBP API.',
        variant: 'error',
      });
    } finally {
      setIsSyncingAllGbp(false);
    }
  };

  // Star count stats for 5..1 filter (respecting active location/region filter!)
  const baseScopedReviews = useMemo(() => {
    return reviews.filter((rev) => {
      if (regionFilter !== 'ALL' && rev.regionShort !== regionFilter) return false;
      if (locationFilter !== 'ALL' && rev.branchId !== locationFilter) return false;
      return true;
    });
  }, [reviews, regionFilter, locationFilter]);

  const starCounts = useMemo(() => {
    const counts: Record<5 | 4 | 3 | 2 | 1, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    for (const rev of baseScopedReviews) {
      const rounded = Math.min(5, Math.max(1, Math.round(rev.rating))) as 5 | 4 | 3 | 2 | 1;
      counts[rounded]++;
    }
    return counts;
  }, [baseScopedReviews]);

  const filteredReviews = useMemo(() => {
    const list = baseScopedReviews.filter((rev) => {
      if (replyFilter !== 'ALL' && rev.replyStatus !== replyFilter) return false;
      if (starFilter !== 'ALL' && Math.round(rev.rating) !== starFilter) return false;
      if (sourceFilter === 'gbp_api' && rev.source !== 'gbp_api') return false;
      if (sourceFilter === 'google_maps' && rev.source !== 'google_maps') return false;
      if (sourceFilter === 'internal' && (rev.source === 'google_maps' || rev.source === 'gbp_api'))
        return false;
      if (deferredReviewSearch) {
        const hay = `${rev.branchCode} ${rev.branchName} ${rev.regionShort} ${rev.authorName} ${rev.comment}`.toLowerCase();
        if (!hay.includes(deferredReviewSearch)) return false;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      if (a.publishTime && b.publishTime) {
        return new Date(b.publishTime).getTime() - new Date(a.publishTime).getTime();
      }
      if (a.publishTime) return -1;
      if (b.publishTime) return 1;
      return 0;
    });
  }, [baseScopedReviews, replyFilter, starFilter, sourceFilter, deferredReviewSearch]);

  const totalInboxPages = Math.max(1, Math.ceil(filteredReviews.length / INBOX_PAGE_SIZE));
  const safeInboxPage = Math.min(inboxPage, totalInboxPages);
  const inboxPageRows = useMemo(() => {
    const start = (safeInboxPage - 1) * INBOX_PAGE_SIZE;
    return filteredReviews.slice(start, start + INBOX_PAGE_SIZE);
  }, [filteredReviews, safeInboxPage]);

  // Branch Rating distribution & list (Good vs Low)
  const ratingSummary = useMemo(() => {
    let goodCount = 0; // >= 4.5
    let midCount = 0; // 4.0 - 4.4
    let lowCount = 0; // < 4.0
    for (const b of branches) {
      if (b.rating >= 4.5) goodCount++;
      else if (b.rating >= 4.0) midCount++;
      else lowCount++;
    }
    return { goodCount, midCount, lowCount };
  }, [branches]);

  const filteredRatingBranches = useMemo(() => {
    const list = branches.filter((b) => {
      if (ratingBucket === 'GOOD' && b.rating < 4.5) return false;
      if (ratingBucket === 'MID' && (b.rating < 4.0 || b.rating >= 4.5)) return false;
      if (ratingBucket === 'LOW' && b.rating >= 4.0) return false;
      if (ratingRegionFilter !== 'ALL' && b.regionShort !== ratingRegionFilter) return false;
      if (deferredRatingSearch) {
        const hay = `${b.code} ${b.name} ${b.city} ${b.regionShort}`.toLowerCase();
        if (!hay.includes(deferredRatingSearch)) return false;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      if (ratingSortDir === 'asc') {
        return a.rating - b.rating || b.reviewCount - a.reviewCount;
      }
      return b.rating - a.rating || b.reviewCount - a.reviewCount;
    });
  }, [branches, ratingBucket, ratingRegionFilter, deferredRatingSearch, ratingSortDir]);

  const totalRatingPages = Math.max(1, Math.ceil(filteredRatingBranches.length / RATING_PAGE_SIZE));
  const safeRatingPage = Math.min(ratingPage, totalRatingPages);
  const ratingPageRows = useMemo(() => {
    const start = (safeRatingPage - 1) * RATING_PAGE_SIZE;
    return filteredRatingBranches.slice(start, start + RATING_PAGE_SIZE);
  }, [filteredRatingBranches, safeRatingPage]);

  return (
    <div className="space-y-6">
      {/* Header Metrics Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-3xl bg-white border border-[#e2e8f0] p-5 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.05)]">
          <p className="text-xs font-medium text-[#64748b]">Total Ulasan Google Maps</p>
          <p className="font-mono text-2xl font-bold text-[#00529C] tabular-nums mt-1">
            {reviews.length.toLocaleString('id-ID')}
          </p>
          <p className="text-xs text-[#444653] mt-1">
            Otomatis dari{' '}
            <span className="font-semibold">
              {coverageStats.uniqueBranchesWithReviews.toLocaleString('id-ID')} lokasi
            </span>{' '}
            di <span className="font-semibold">{coverageStats.uniqueRegionsCovered} Kanwil</span>
          </p>
        </div>

        <div className="rounded-3xl bg-white border border-[#e2e8f0] p-5 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.05)]">
          <p className="text-xs font-medium text-[#64748b]">Menunggu Balasan</p>
          <p className="font-mono text-2xl font-bold text-[#d97706] tabular-nums mt-1">
            {(kpiStats.totalReviews - kpiStats.repliedCount).toLocaleString('id-ID')}
          </p>
          <p className="text-xs text-[#444653] mt-1">
            {kpiStats.repliedCount.toLocaleString('id-ID')} dibalas ({kpiStats.resolutionRate}% penyelesaian)
          </p>
        </div>

        <div className="rounded-3xl bg-white border border-[#e2e8f0] p-5 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.05)]">
          <p className="text-xs font-medium text-[#64748b]">Unit Kerja Rating Bagus (≥ 4.5 ★)</p>
          <p className="font-mono text-2xl font-bold text-[#059669] tabular-nums mt-1">
            {ratingSummary.goodCount.toLocaleString('id-ID')}
          </p>
          <p className="text-xs text-[#444653] mt-1">
            Rata-rata nasional: {kpiStats.avgRating.toFixed(2)} ★
          </p>
        </div>

        <div className="rounded-3xl bg-white border border-[#e2e8f0] p-5 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.05)]">
          <p className="text-xs font-medium text-[#64748b]">Unit Kerja Rating Rendah (&lt; 4.0 ★)</p>
          <p className="font-mono text-2xl font-bold text-[#dc2626] tabular-nums mt-1">
            {ratingSummary.lowCount.toLocaleString('id-ID')}
          </p>
          <button
            type="button"
            onClick={() => {
              setActiveSubTab('branch_ratings');
              setRatingBucket('LOW');
              setRatingSortDir('asc');
              setRatingPage(1);
            }}
            className="text-xs font-semibold text-[#00529C] hover:underline mt-1 inline-block"
          >
            Lihat daftar prioritas evaluasi →
          </button>
        </div>
      </section>

      {/* Sub-view Switcher & Automatic Sync Status */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-white border border-[#e2e8f0] shadow-xs">
          <button
            type="button"
            onClick={() => setActiveSubTab('inbox')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold smooth-transition inline-flex items-center gap-2 ${
              activeSubTab === 'inbox'
                ? 'bg-[#00529C] text-white'
                : 'text-[#444653] hover:text-[#1a1b22] hover:bg-[#f1f5f9]'
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span>Kotak Masuk Ulasan ({reviews.length.toLocaleString('id-ID')})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('branch_ratings')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold smooth-transition inline-flex items-center gap-2 ${
              activeSubTab === 'branch_ratings'
                ? 'bg-[#00529C] text-white'
                : 'text-[#444653] hover:text-[#1a1b22] hover:bg-[#f1f5f9]'
            }`}
          >
            <Star className="h-3.5 w-3.5" />
            <span>Peringkat Rating Unit Kerja (Bagus vs Rendah)</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {reviewsAutoSyncing && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#00529C] bg-[#eff6ff] border border-[#bfdbfe] px-3 py-1.5 rounded-2xl">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Memuat ulasan Google Maps terbaru...</span>
            </span>
          )}

          {!isGbpConnected ? (
            <button
              type="button"
              onClick={() => setActiveView('gbp-connect')}
              className="h-10 px-4 rounded-2xl bg-white border border-[#cbd5e1] hover:bg-[#f1f5f9] text-xs font-semibold text-[#00529C] inline-flex items-center gap-2 smooth-transition whitespace-nowrap"
            >
              <Link2 className="h-3.5 w-3.5" />
              <span>Hubungkan GBP untuk 100% Riwayat &amp; Balas Langsung</span>
            </button>
          ) : (
            gbpLocations.length > 0 && (
              <button
                type="button"
                disabled={isSyncingAllGbp}
                onClick={handleSyncAllGbpLocations}
                className="h-10 px-4 rounded-2xl bg-[#059669] hover:bg-[#047857] text-white text-xs font-semibold inline-flex items-center gap-2 smooth-transition whitespace-nowrap disabled:opacity-55"
              >
                {isSyncingAllGbp ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Menyelaraskan GBP...</span>
                  </>
                ) : (
                  <>
                    <Layers className="h-3.5 w-3.5" />
                    <span>Segarkan Seluruh {gbpLocations.length} Lokasi GBP</span>
                  </>
                )}
              </button>
            )
          )}
        </div>
      </div>

      {activeSubTab === 'inbox' ? (
        <section className="rounded-3xl bg-white border border-[#e2e8f0] shadow-[0_4px_20px_-2px_rgba(15,23,42,0.05)] overflow-hidden">
          <div className="p-5 border-b border-[#e2e8f0] space-y-3">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="h-4 w-4 text-[#64748b] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={reviewSearch}
                  onChange={(e) => {
                    setReviewSearch(e.target.value);
                    setInboxPage(1);
                  }}
                  placeholder="Cari ulasan menurut cabang, kode, pengirim, atau komentar..."
                  aria-label="Cari ulasan di kotak masuk"
                  className="w-full h-10 pl-10 pr-4 rounded-2xl bg-[#f8fafc] border border-[#cbd5e1] text-xs text-[#1a1b22] placeholder:text-[#94a3b8] focus:outline-none focus:bg-white focus:border-[#00529C] focus:ring-4 focus:ring-[#00529C]/15"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Filter Per Wilayah */}
                <select
                  value={regionFilter}
                  onChange={(e) => {
                    setRegionFilter(e.target.value);
                    setLocationFilter('ALL');
                    setInboxPage(1);
                  }}
                  aria-label="Filter Regional Office ulasan"
                  className="h-10 px-3.5 rounded-2xl bg-[#f8fafc] border border-[#cbd5e1] text-xs font-medium text-[#1a1b22] focus:outline-none focus:border-[#00529C]"
                >
                  <option value="ALL">Semua Kanwil ({coverageStats.uniqueRegionsCovered} RO)</option>
                  {regions.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>

                {/* Filter Per Lokasi Unit Kerja */}
                <select
                  value={locationFilter}
                  onChange={(e) => {
                    setLocationFilter(e.target.value);
                    setInboxPage(1);
                  }}
                  aria-label="Filter per lokasi unit kerja"
                  className="h-10 px-3.5 rounded-2xl bg-[#f8fafc] border border-[#cbd5e1] text-xs font-medium text-[#1a1b22] max-w-[280px] focus:outline-none focus:border-[#00529C]"
                >
                  <option value="ALL">
                    Semua Lokasi ({locationOptionsForRegion.length} unit · {baseScopedReviews.length} ulasan)
                  </option>
                  {locationOptionsForRegion.map((loc) => (
                    <option key={loc.branchId} value={loc.branchId}>
                      {loc.branchName} ({loc.branchCode}) · {loc.count} ulasan
                    </option>
                  ))}
                </select>

                {locationFilter !== 'ALL' && (
                  <button
                    type="button"
                    onClick={() => {
                      setLocationFilter('ALL');
                      setInboxPage(1);
                    }}
                    className="h-10 px-3 rounded-2xl bg-[#eff6ff] hover:bg-[#dbeafe] text-xs font-semibold text-[#00529C] inline-flex items-center gap-1 whitespace-nowrap"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>Reset Lokasi</span>
                  </button>
                )}

                <select
                  value={sourceFilter}
                  onChange={(e) => {
                    setSourceFilter(
                      e.target.value as 'ALL' | 'gbp_api' | 'google_maps' | 'internal'
                    );
                    setInboxPage(1);
                  }}
                  aria-label="Filter sumber ulasan"
                  className="h-10 px-3.5 rounded-2xl bg-[#f8fafc] border border-[#cbd5e1] text-xs font-medium text-[#1a1b22] focus:outline-none focus:border-[#00529C]"
                >
                  <option value="ALL">Semua Sumber</option>
                  <option value="gbp_api">Google Business Profile</option>
                  <option value="google_maps">Google Maps (Live)</option>
                  <option value="internal">Log Pemantauan Awal</option>
                </select>
              </div>
            </div>

            {/* Filter Bintang 5 sampai 1 & Reply status */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap items-center gap-1 p-1 rounded-2xl bg-[#f1f5f9]">
                  {(
                    [
                      { id: 'ALL', label: 'Semua' },
                      { id: 'unreplied', label: 'Belum Dibalas' },
                      { id: 'replied', label: 'Sudah Dibalas' },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setReplyFilter(tab.id);
                        setInboxPage(1);
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium smooth-transition whitespace-nowrap ${
                        replyFilter === tab.id
                          ? 'bg-white text-[#1a1b22] shadow-xs'
                          : 'text-[#444653] hover:text-[#1a1b22]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Star filter 5 down to 1 */}
                <div className="flex flex-wrap items-center gap-1 p-1 rounded-2xl bg-[#f1f5f9]">
                  <button
                    type="button"
                    onClick={() => {
                      setStarFilter('ALL');
                      setInboxPage(1);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium smooth-transition whitespace-nowrap ${
                      starFilter === 'ALL'
                        ? 'bg-white text-[#1a1b22] shadow-xs'
                        : 'text-[#444653] hover:text-[#1a1b22]'
                    }`}
                  >
                    Semua Bintang
                  </button>
                  {([5, 4, 3, 2, 1] as const).map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => {
                        setStarFilter(star);
                        setInboxPage(1);
                      }}
                      className={`px-2.5 py-1.5 rounded-xl text-xs font-medium smooth-transition whitespace-nowrap inline-flex items-center gap-1 font-mono tabular-nums ${
                        starFilter === star
                          ? 'bg-white text-[#1a1b22] shadow-xs'
                          : 'text-[#444653] hover:text-[#1a1b22]'
                      }`}
                    >
                      <Star className="h-3 w-3 text-[#d97706] fill-[#d97706]" />
                      <span>{star}</span>
                      <span className="text-[10px] text-[#64748b]">({starCounts[star]})</span>
                    </button>
                  ))}
                </div>
              </div>

              <p className="text-xs text-[#64748b] font-mono tabular-nums">
                Menampilkan {filteredReviews.length.toLocaleString('id-ID')} dari{' '}
                {reviews.length.toLocaleString('id-ID')} ulasan
              </p>
            </div>
          </div>

          {inboxPageRows.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <MessageSquare className="h-8 w-8 text-[#94a3b8] mx-auto" />
              <p className="font-display text-base font-semibold text-[#1a1b22]">
                Tidak ada ulasan pada filter ini
              </p>
              <p className="text-sm text-[#64748b]">
                Ubah filter lokasi, bintang, wilayah, atau status balasan untuk melihat daftar ulasan lainnya.
              </p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-[#e2e8f0]">
                {inboxPageRows.map((rev) => {
                  const isSelected = rev.id === activeReviewId;
                  const isReplied = rev.replyStatus === 'replied';

                  return (
                    <div
                      key={rev.id}
                      onClick={() => setActiveReviewId(rev.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setActiveReviewId(rev.id);
                        }
                      }}
                      className={`w-full text-left p-5 sm:p-6 hover:bg-[#f8fafc] smooth-transition flex flex-col sm:flex-row sm:items-start justify-between gap-4 cursor-pointer ${
                        isSelected ? 'bg-[#eff6ff]/60' : ''
                      }`}
                    >
                      <div className="space-y-2 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-[#64748b]">
                          {rev.authorUri ? (
                            <a
                              href={rev.authorUri}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="font-semibold text-[#1a1b22] text-sm hover:text-[#00529C] hover:underline"
                            >
                              {rev.authorName}
                            </a>
                          ) : (
                            <span className="font-semibold text-[#1a1b22] text-sm">
                              {rev.authorName}
                            </span>
                          )}
                          <span aria-hidden="true">·</span>
                          <span className="font-mono text-[#64748b]">{rev.branchCode}</span>
                          <span aria-hidden="true">·</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setLocationFilter(rev.branchId);
                              setInboxPage(1);
                            }}
                            title="Filter semua ulasan dari lokasi ini"
                            className="font-semibold text-[#00529C] hover:underline"
                          >
                            {rev.branchName}
                          </button>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">{rev.regionShort}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono text-[#1a1b22] tabular-nums">
                            {rev.createdAt}
                          </span>
                          {rev.source === 'gbp_api' && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-semibold text-[#00529C]">GBP Terpusat</span>
                            </>
                          )}
                          {rev.source === 'google_maps' && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-semibold text-[#059669]">Google Maps Live</span>
                            </>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((starIdx) => (
                            <Star
                              key={starIdx}
                              className={`h-3.5 w-3.5 ${
                                starIdx <= rev.rating
                                  ? 'text-[#d97706] fill-[#d97706]'
                                  : 'text-[#cbd5e1]'
                              }`}
                            />
                          ))}
                          <span className="ml-2 text-xs font-medium text-[#444653]">
                            {rev.rating}.0 · {rev.sentiment}
                          </span>
                        </div>

                        <p className="text-sm text-[#1a1b22] leading-relaxed line-clamp-2 max-w-3xl">
                          “{rev.comment}”
                        </p>

                        {rev.googleMapsUri && (
                          <a
                            href={rev.googleMapsUri}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-[#00529C] hover:underline"
                          >
                            <span>Lihat ulasan di Google Maps</span>
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>

                      <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0">
                        {isReplied ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ecfdf5] text-[#059669] border border-[#a7f3d0] px-3 py-1 text-xs font-medium whitespace-nowrap">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Sudah Dibalas
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fffbeb] text-[#d97706] border border-[#fde68a] px-3 py-1 text-xs font-medium whitespace-nowrap">
                            <Clock className="h-3.5 w-3.5" />
                            Belum Dibalas
                          </span>
                        )}

                        <span className="text-xs font-semibold text-[#00529C]">
                          {isReplied ? 'Lihat Balasan →' : 'Balas Ulasan →'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {totalInboxPages > 1 && (
                <div className="px-5 py-3.5 bg-[#f8fafc] border-t border-[#e2e8f0] flex items-center justify-between gap-4">
                  <p className="text-xs text-[#64748b] tabular-nums">
                    Halaman <span className="font-mono font-semibold text-[#1a1b22]">{safeInboxPage}</span>{' '}
                    dari{' '}
                    <span className="font-mono font-semibold text-[#1a1b22]">
                      {totalInboxPages.toLocaleString('id-ID')}
                    </span>
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={safeInboxPage <= 1}
                      onClick={() => setInboxPage((p) => Math.max(1, p - 1))}
                      className="h-9 px-3 rounded-xl border border-[#cbd5e1] bg-white hover:bg-[#f1f5f9] disabled:opacity-45 text-xs font-medium text-[#1a1b22] inline-flex items-center gap-1"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      <span>Sebelumnya</span>
                    </button>
                    <button
                      type="button"
                      disabled={safeInboxPage >= totalInboxPages}
                      onClick={() => setInboxPage((p) => Math.min(totalInboxPages, p + 1))}
                      className="h-9 px-3 rounded-xl border border-[#cbd5e1] bg-white hover:bg-[#f1f5f9] disabled:opacity-45 text-xs font-medium text-[#1a1b22] inline-flex items-center gap-1"
                    >
                      <span>Berikutnya</span>
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      ) : (
        /* Branch Rating Ranking Tab: Good vs Low Rating across all BRI locations */
        <section className="rounded-3xl bg-white border border-[#e2e8f0] shadow-[0_4px_20px_-2px_rgba(15,23,42,0.05)] overflow-hidden">
          <div className="p-5 border-b border-[#e2e8f0] space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="h-4 w-4 text-[#64748b] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={ratingSearch}
                  onChange={(e) => {
                    setRatingSearch(e.target.value);
                    setRatingPage(1);
                  }}
                  placeholder="Cari kode cabang, nama unit BRI, atau kota..."
                  aria-label="Cari unit kerja di peringkat rating"
                  className="w-full h-10 pl-10 pr-4 rounded-2xl bg-[#f8fafc] border border-[#cbd5e1] text-xs text-[#1a1b22] placeholder:text-[#94a3b8] focus:outline-none focus:bg-white focus:border-[#00529C]"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={ratingRegionFilter}
                  onChange={(e) => {
                    setRatingRegionFilter(e.target.value);
                    setRatingPage(1);
                  }}
                  aria-label="Filter wilayah peringkat rating"
                  className="h-10 px-3.5 rounded-2xl bg-[#f8fafc] border border-[#cbd5e1] text-xs font-medium text-[#1a1b22]"
                >
                  <option value="ALL">Semua Kantor Wilayah</option>
                  {regions.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => setRatingSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                  className="h-10 px-3.5 rounded-2xl bg-[#eff6ff] hover:bg-[#dbeafe] text-xs font-semibold text-[#00529C] inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <ArrowDownUp className="h-3.5 w-3.5" />
                  <span>
                    {ratingSortDir === 'asc'
                      ? 'Urutan: Rating Terendah Dulu'
                      : 'Urutan: Rating Tertinggi Dulu'}
                  </span>
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-2xl bg-[#f1f5f9]">
                <button
                  type="button"
                  onClick={() => {
                    setRatingBucket('ALL');
                    setRatingPage(1);
                  }}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-medium smooth-transition whitespace-nowrap ${
                    ratingBucket === 'ALL'
                      ? 'bg-white text-[#1a1b22] shadow-xs'
                      : 'text-[#444653] hover:text-[#1a1b22]'
                  }`}
                >
                  Semua ({branches.length.toLocaleString('id-ID')})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRatingBucket('GOOD');
                    setRatingSortDir('desc');
                    setRatingPage(1);
                  }}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-medium smooth-transition whitespace-nowrap inline-flex items-center gap-1.5 ${
                    ratingBucket === 'GOOD'
                      ? 'bg-white text-[#059669] shadow-xs'
                      : 'text-[#444653] hover:text-[#1a1b22]'
                  }`}
                >
                  <ThumbsUp className="h-3.5 w-3.5" />
                  <span>Rating Bagus ≥ 4.5 ★ ({ratingSummary.goodCount.toLocaleString('id-ID')})</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRatingBucket('MID');
                    setRatingPage(1);
                  }}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-medium smooth-transition whitespace-nowrap ${
                    ratingBucket === 'MID'
                      ? 'bg-white text-[#00529C] shadow-xs'
                      : 'text-[#444653] hover:text-[#1a1b22]'
                  }`}
                >
                  Sedang 4.0–4.4 ★ ({ratingSummary.midCount.toLocaleString('id-ID')})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRatingBucket('LOW');
                    setRatingSortDir('asc');
                    setRatingPage(1);
                  }}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-medium smooth-transition whitespace-nowrap inline-flex items-center gap-1.5 ${
                    ratingBucket === 'LOW'
                      ? 'bg-white text-[#dc2626] shadow-xs'
                      : 'text-[#444653] hover:text-[#1a1b22]'
                  }`}
                >
                  <ThumbsDown className="h-3.5 w-3.5" />
                  <span>Rating Rendah &lt; 4.0 ★ ({ratingSummary.lowCount.toLocaleString('id-ID')})</span>
                </button>
              </div>

              <p className="text-xs text-[#64748b] font-mono tabular-nums">
                {filteredRatingBranches.length.toLocaleString('id-ID')} unit kerja
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#f8fafc] border-b border-[#e2e8f0] text-[11px] font-semibold text-[#475569]">
                  <th className="py-3 pl-5 pr-3">Kode</th>
                  <th className="py-3 px-3">Unit Kerja BRI</th>
                  <th className="py-3 px-3">Wilayah</th>
                  <th className="py-3 px-3">Rating Google</th>
                  <th className="py-3 px-3">Kategori</th>
                  <th className="py-3 pr-5 pl-3 text-right">Tindakan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e2e8f0] text-sm">
                {ratingPageRows.map((b) => {
                  const isGood = b.rating >= 4.5;
                  const isLow = b.rating < 4.0;
                  const isLoadingThis = loadingBranchId === b.id;

                  return (
                    <tr key={b.id} className="hover:bg-[#f8fafc] smooth-transition">
                      <td className="py-3 pl-5 pr-3 font-mono text-xs text-[#444653] tabular-nums whitespace-nowrap">
                        {b.code}
                      </td>
                      <td className="py-3 px-3">
                        <p className="font-semibold text-[#1a1b22] text-xs">{b.name}</p>
                        <p className="text-[11px] text-[#64748b]">
                          {b.tier} · {b.city}
                        </p>
                      </td>
                      <td className="py-3 px-3 text-xs text-[#444653] whitespace-nowrap">
                        {b.regionShort}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5 font-mono text-xs font-bold tabular-nums">
                          <Star
                            className={`h-3.5 w-3.5 ${
                              isLow
                                ? 'text-[#dc2626] fill-[#dc2626]'
                                : 'text-[#d97706] fill-[#d97706]'
                            }`}
                          />
                          <span className="text-[#1a1b22]">{b.rating.toFixed(1)}</span>
                          <span className="font-normal text-[#64748b]">
                            ({b.reviewCount.toLocaleString('id-ID')} ulasan)
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        {isGood ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#ecfdf5] text-[#059669] border border-[#a7f3d0] px-2.5 py-0.5 text-[11px] font-semibold">
                            Rating Bagus
                          </span>
                        ) : isLow ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#fef2f2] text-[#dc2626] border border-[#fecaca] px-2.5 py-0.5 text-[11px] font-semibold">
                            Rating Rendah
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#eff6ff] text-[#00529C] border border-[#bfdbfe] px-2.5 py-0.5 text-[11px] font-semibold">
                            Sedang
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-5 pl-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            disabled={isLoadingThis}
                            onClick={() => handleOpenBranchReviews(b)}
                            className="h-8 px-3 rounded-xl bg-[#eff6ff] hover:bg-[#dbeafe] text-xs font-semibold text-[#00529C] inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-55"
                          >
                            {isLoadingThis ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3 w-3" />
                            )}
                            <span>Lihat Ulasan</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedBranchId(b.id);
                              setActiveView('directory');
                            }}
                            className="h-8 px-3 rounded-xl bg-white border border-[#cbd5e1] hover:bg-[#f1f5f9] text-xs font-medium text-[#1a1b22] whitespace-nowrap"
                          >
                            Inspeksi
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="px-5 py-3.5 bg-[#f8fafc] border-t border-[#e2e8f0] flex items-center justify-between gap-4">
            <p className="text-xs text-[#64748b] tabular-nums">
              Halaman <span className="font-mono font-semibold text-[#1a1b22]">{safeRatingPage}</span> dari{' '}
              <span className="font-mono font-semibold text-[#1a1b22]">
                {totalRatingPages.toLocaleString('id-ID')}
              </span>
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={safeRatingPage <= 1}
                onClick={() => setRatingPage((p) => Math.max(1, p - 1))}
                className="h-9 px-3 rounded-xl border border-[#cbd5e1] bg-white hover:bg-[#f1f5f9] disabled:opacity-45 text-xs font-medium text-[#1a1b22] inline-flex items-center gap-1"
              >
                <ChevronLeft className="h-4 w-4" />
                <span>Sebelumnya</span>
              </button>
              <button
                type="button"
                disabled={safeRatingPage >= totalRatingPages}
                onClick={() => setRatingPage((p) => Math.min(totalRatingPages, p + 1))}
                className="h-9 px-3 rounded-xl border border-[#cbd5e1] bg-white hover:bg-[#f1f5f9] disabled:opacity-45 text-xs font-medium text-[#1a1b22] inline-flex items-center gap-1"
              >
                <span>Berikutnya</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
