/**
 * Yıldız göstergesi (DS). Nötr `--ink` ile çizilir (aksan taşımaz). Sunucu-güvenli
 * (hook yok). Home kartı, PLP quick-view ve PDP başlığı AYNI bileşeni paylaşır;
 * puan verisi MOCK'tur (bkz. `lib/mock-rating.ts` + todo.md).
 */
export function Stars({ rating, ariaLabel }: { rating: number; ariaLabel: string }) {
  const full = Math.round(rating);
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={ariaLabel}>
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path
            d="M6 1l1.5 3 3.3.3-2.5 2.2.8 3.2L6 8.2 2.9 9.9l.8-3.2L1.2 4.4l3.3-.3L6 1z"
            fill={i < full ? "var(--ink)" : "none"}
            stroke="var(--ink)"
            strokeWidth="0.8"
            strokeLinejoin="round"
          />
        </svg>
      ))}
    </span>
  );
}
