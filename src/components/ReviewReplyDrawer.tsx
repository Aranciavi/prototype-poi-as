import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, Send, Sparkles, Star, X } from 'lucide-react';
import { useGbpAuth } from '../context/GbpAuthContext';
import { useOps } from '../context/OpsContext';
import { buildLocalSuggestions, tryBackendJson } from '../services/localEngine';
import type { ReviewSuggestion } from '../types/ops';

export function ReviewReplyDrawer() {
  const { reviews, activeReviewId, setActiveReviewId, submitReviewReply } = useOps();
  const { isConnected: isGbpConnected, gbpAccessToken } = useGbpAuth();

  const activeReview = reviews.find((r) => r.id === activeReviewId) ?? null;

  const [replyDraft, setReplyDraft] = useState('');
  const [suggestions, setSuggestions] = useState<ReviewSuggestion[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [confirmingPublish, setConfirmingPublish] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const generateSuggestions = useCallback(async () => {
    if (!activeReview) return;
    setIsGenerating(true);
    setAiError(null);
    try {
      const result = await tryBackendJson<{
        suggestions?: ReviewSuggestion[];
        error?: string;
      }>('/api/reviews/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchName: activeReview.branchName,
          branchCode: activeReview.branchCode,
          authorName: activeReview.authorName,
          rating: activeReview.rating,
          comment: activeReview.comment,
        }),
      });

      if (result.available && result.ok && Array.isArray(result.data?.suggestions)) {
        setSuggestions(result.data.suggestions);
        return;
      }

      // Fallback client-side suggestions (for Vercel static site or when Gemini API key is not configured)
      setSuggestions(
        buildLocalSuggestions({
          branchName: activeReview.branchName,
          authorName: activeReview.authorName,
          rating: activeReview.rating,
          comment: activeReview.comment,
        })
      );
    } catch {
      setSuggestions(
        buildLocalSuggestions({
          branchName: activeReview.branchName,
          authorName: activeReview.authorName,
          rating: activeReview.rating,
          comment: activeReview.comment,
        })
      );
    } finally {
      setIsGenerating(false);
    }
  }, [activeReview]);

  useEffect(() => {
    setConfirmingPublish(false);
    setIsSending(false);
    if (!activeReview) {
      setReplyDraft('');
      setSuggestions([]);
      setAiError(null);
      return;
    }

    setReplyDraft(activeReview.replyText ?? '');
    setSuggestions([]);
    setAiError(null);

    if (activeReview.replyStatus === 'unreplied') {
      generateSuggestions();
    }
  }, [activeReview?.id]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeReview || !replyDraft.trim()) return;
    setConfirmingPublish(true);
  };

  const handleConfirmPublish = async () => {
    if (!activeReview || !replyDraft.trim()) return;
    setIsSending(true);
    try {
      await submitReviewReply(
        activeReview.id,
        replyDraft,
        isGbpConnected ? gbpAccessToken : null
      );
      setConfirmingPublish(false);
      setActiveReviewId(null);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <AnimatePresence>
      {activeReview && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => !isSending && setActiveReviewId(null)}
            className="fixed inset-0 bg-[#0f172a]/35 backdrop-blur-xs"
          />

          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="Laci Balasan Ulasan Nasabah"
            initial={{ x: '100%', opacity: 0.6 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0.6 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 w-full max-w-xl bg-white h-full rounded-l-3xl border-l border-[#e2e8f0] shadow-[0_25px_40px_-8px_rgba(15,23,42,0.14)] flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="px-6 py-5 border-b border-[#e2e8f0] flex items-start justify-between gap-4">
              <div className="space-y-1 min-w-0">
                <p className="font-mono text-xs text-[#64748b] tabular-nums">
                  {activeReview.branchCode} · {activeReview.regionShort} · {activeReview.createdAt}
                </p>
                <h2 className="font-display text-lg font-bold text-[#1a1b22] truncate">
                  {activeReview.branchName}
                </h2>
              </div>
              <button
                type="button"
                disabled={isSending}
                onClick={() => setActiveReviewId(null)}
                aria-label="Tutup laci balasan"
                className="h-9 w-9 rounded-xl text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#1a1b22] flex items-center justify-center smooth-transition shrink-0"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Customer Review Box */}
              <div className="rounded-2xl bg-[#f8fafc] border border-[#e2e8f0] p-5 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-sm text-[#1a1b22]">
                    {activeReview.authorName}
                  </span>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Star
                        key={i}
                        className={`h-4 w-4 ${
                          i <= activeReview.rating
                            ? 'text-[#d97706] fill-[#d97706]'
                            : 'text-[#cbd5e1]'
                        }`}
                      />
                    ))}
                  </div>
                </div>
                <p className="text-sm text-[#1a1b22] leading-relaxed">
                  “{activeReview.comment}”
                </p>
              </div>

              {/* Existing Reply Banner if replied */}
              {activeReview.replyStatus === 'replied' && activeReview.replyText && (
                <div className="rounded-2xl bg-[#ecfdf5]/70 border border-[#a7f3d0] p-4 space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs text-[#059669] font-semibold">
                    <span className="inline-flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4" />
                      Sudah Dibalas Resmi
                    </span>
                    <span className="font-mono">{activeReview.repliedAt}</span>
                  </div>
                  <p className="text-sm text-[#1a1b22] leading-relaxed">
                    {activeReview.replyText}
                  </p>
                </div>
              )}

              {/* Saran Jawaban Cepat (Gemini API) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-[#1e40af]" />
                    <h3 className="font-display text-sm font-semibold text-[#1a1b22]">
                      Saran Jawaban Cepat
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={generateSuggestions}
                    disabled={isGenerating}
                    className="h-8 px-3 rounded-xl bg-[#eff6ff] hover:bg-[#dbeafe] text-xs font-semibold text-[#1e40af] inline-flex items-center gap-1.5 smooth-transition disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
                    <span>{isGenerating ? 'Menyusun...' : 'Buat Ulang Saran'}</span>
                  </button>
                </div>

                {isGenerating && (
                  <div className="space-y-2.5 animate-pulse">
                    {[0, 1, 2].map((idx) => (
                      <div
                        key={idx}
                        className="h-20 rounded-2xl bg-[#f4f2fc] border border-[#e2e8f0]"
                      />
                    ))}
                  </div>
                )}

                {!isGenerating && aiError && (
                  <div className="rounded-2xl bg-[#fef2f2] border border-[#fecaca] p-4 flex items-start gap-3">
                    <AlertCircle className="h-4 w-4 text-[#dc2626] shrink-0 mt-0.5" />
                    <div className="space-y-1.5 text-xs">
                      <p className="font-semibold text-[#991b1b]">{aiError}</p>
                      <p className="text-[#444653]">
                        Anda tetap dapat mengetik balasan manual di kolom editor di bawah atau mencoba ulang.
                      </p>
                    </div>
                  </div>
                )}

                {!isGenerating && suggestions.length > 0 && (
                  <div className="space-y-2.5">
                    {suggestions.map((sug) => (
                      <button
                        key={sug.tone + sug.label}
                        type="button"
                        onClick={() => setReplyDraft(sug.text)}
                        className="w-full text-left rounded-2xl bg-[#f8fafc] hover:bg-[#eff6ff] border border-[#e2e8f0] hover:border-[#2563eb] p-4 space-y-1.5 smooth-transition"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-[#1e40af]">
                            {sug.label}
                          </span>
                          <span className="text-[11px] text-[#64748b]">Klik untuk gunakan</span>
                        </div>
                        <p className="text-xs text-[#1a1b22] leading-relaxed">{sug.text}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Editor Balasan */}
              <form id="reply-editor-form" onSubmit={handleSubmit} className="space-y-2">
                <label className="block text-xs font-semibold text-[#444653]">
                  Draf Balasan ke Google Business Profile
                </label>
                <textarea
                  rows={5}
                  value={replyDraft}
                  onChange={(e) => {
                    setReplyDraft(e.target.value);
                    setConfirmingPublish(false);
                  }}
                  placeholder="Tulis balasan resmi yang sopan dan solutif dalam Bahasa Indonesia..."
                  className="w-full p-4 rounded-2xl bg-white border border-[#cbd5e1] text-sm text-[#1a1b22] placeholder:text-[#94a3b8] focus:outline-none focus:border-[#2563eb] focus:ring-4 focus:ring-[#2563eb]/15 smooth-transition resize-none"
                />
              </form>

              {/* Explicit Confirmation Panel before Publishing Reply */}
              {confirmingPublish && (
                <div className="rounded-2xl bg-[#fffbeb] border border-[#fde68a] p-4 space-y-2 text-xs">
                  <p className="font-semibold text-[#92400e]">
                    Konfirmasi Publikasi Balasan ke Google Business Profile
                  </p>
                  <p className="text-[#444653]">
                    {activeReview.gbpReviewName && isGbpConnected
                      ? `Balasan ini akan langsung dipublikasikan ke Google Business Profile atas nama unit ${activeReview.branchName} untuk ulasan ${activeReview.authorName}.`
                      : `Balasan akan disimpan sebagai tanggapan resmi unit ${activeReview.branchName} pada portal terpusat.`}
                  </p>
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="px-6 py-4 bg-[#f8fafc] border-t border-[#e2e8f0] flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={isSending}
                onClick={() => {
                  if (confirmingPublish) {
                    setConfirmingPublish(false);
                  } else {
                    setActiveReviewId(null);
                  }
                }}
                className="h-11 px-5 rounded-2xl bg-white border border-[#cbd5e1] hover:bg-[#f1f5f9] text-sm font-medium text-[#1a1b22] smooth-transition"
              >
                Batal
              </button>

              {!confirmingPublish ? (
                <button
                  type="submit"
                  form="reply-editor-form"
                  disabled={!replyDraft.trim()}
                  className="h-11 px-5 rounded-2xl bg-[#00529C] hover:bg-[#004080] disabled:opacity-45 text-white text-sm font-semibold inline-flex items-center gap-2 smooth-transition"
                >
                  <Send className="h-4 w-4" />
                  <span>
                    {activeReview.replyStatus === 'replied' ? 'Perbarui Balasan' : 'Kirim Balasan'}
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isSending}
                  onClick={handleConfirmPublish}
                  className="h-11 px-5 rounded-2xl bg-[#059669] hover:bg-[#047857] disabled:opacity-60 text-white text-sm font-semibold inline-flex items-center gap-2 smooth-transition"
                >
                  {isSending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Mengirim...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Konfirmasi Publikasi</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
