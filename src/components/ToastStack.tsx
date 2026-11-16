import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useOps } from '../context/OpsContext';

export function ToastStack() {
  const { toasts, dismissToast } = useOps();

  return (
    <div
      aria-live="polite"
      className="fixed bottom-5 right-5 z-60 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0"
    >
      <AnimatePresence>
        {toasts.map((toast) => {
          const Icon =
            toast.variant === 'success'
              ? CheckCircle2
              : toast.variant === 'error' || toast.variant === 'warning'
                ? AlertCircle
                : Info;
          const iconColor =
            toast.variant === 'success'
              ? 'text-[#059669]'
              : toast.variant === 'error'
                ? 'text-[#dc2626]'
                : toast.variant === 'warning'
                  ? 'text-[#d97706]'
                  : 'text-[#00529C]';

          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 14, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.97 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="pointer-events-auto rounded-2xl bg-white border border-[#e2e8f0] p-4 shadow-[0_14px_30px_-6px_rgba(15,23,42,0.14)] flex items-start gap-3"
            >
              <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${iconColor}`} />
              <div className="flex-1 min-w-0 space-y-0.5">
                <p className="text-sm font-semibold text-[#1a1b22]">{toast.title}</p>
                {toast.description && (
                  <p className="text-xs text-[#444653] leading-relaxed">{toast.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                aria-label="Tutup notifikasi"
                className="p-1 rounded-lg text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#1a1b22]"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
