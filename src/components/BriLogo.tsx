interface BriLogoProps {
  variant?: 'full' | 'compact';
  theme?: 'light' | 'dark';
  className?: string;
}

export function BriLogo({ variant = 'full', theme = 'light', className = '' }: BriLogoProps) {
  if (theme === 'dark') {
    return (
      <div className={`inline-flex items-center gap-3 min-w-0 ${className}`}>
        <div className="bg-white rounded-2xl px-3.5 py-2 shadow-sm inline-flex items-center shrink-0">
          <img
            src="/assets/aistudio/BRI_2025_6750d0ed.png"
            alt="Logo Bank BRI"
            className="h-7 w-auto object-contain"
          />
        </div>
        {variant === 'full' && (
          <div className="min-w-0 leading-tight">
            <span className="block font-display text-sm font-bold text-white whitespace-nowrap">
              Sentra Lokasi
            </span>
            <p className="text-[11px] font-medium text-white/80 truncate">
              Master Data &amp; Google Maps
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`inline-flex flex-col items-start min-w-0 ${className}`}>
      <img
        src="/assets/aistudio/BRI_2025_6750d0ed.png"
        alt="Logo Bank BRI"
        className="h-7 w-auto object-contain shrink-0"
      />
      {variant === 'full' && (
        <p className="text-[11px] font-medium text-[#64748b] truncate mt-1">
          Sentra Lokasi &amp; Google Maps
        </p>
      )}
    </div>
  );
}
