"use client";

/**
 * TODO-159D (ADR-093) — Gerçek favori (wishlist) toggle butonu (MOCK'un yerine).
 *
 * `useWishlist()` üzerinden OPTIMISTIC durum + rollback; `aria-pressed` ile erişilebilir
 * bası durumu; `aria-live` bölge ile ekran okuyucu geri bildirimi (eklendi/çıkarıldı/hata).
 * Görsel stil mevcut `control-surface` + `var(--ink)` fill ile aynı (accent CTA'ya
 * dokunulmaz). Çift-tık güvenli: pending sırasında buton devre dışıdır (idempotent).
 */
import { useState } from "react";
import { useWishlist } from "./wishlist-provider";

interface HeartLabels {
  add: string;
  remove: string;
  savedFeedback: string;
  removedFeedback: string;
  error: string;
}

export function WishlistHeartButton({
  productId,
  labels,
  className,
  size = 16,
}: {
  productId: string;
  labels: HeartLabels;
  className?: string;
  size?: number;
}) {
  const { isSaved, isPending, toggle } = useWishlist();
  const [feedback, setFeedback] = useState<string>("");
  const saved = isSaved(productId);
  const pending = isPending(productId);

  const onClick = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (pending) return; // çift-tık koruması
    const outcome = await toggle(productId);
    if (!outcome.ok) setFeedback(labels.error);
    else setFeedback(outcome.saved ? labels.savedFeedback : labels.removedFeedback);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-label={saved ? labels.remove : labels.add}
      aria-pressed={saved}
      className={
        className ??
        "control-surface absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full backdrop-blur transition-colors disabled:opacity-60"
      }
    >
      <HeartIcon filled={saved} size={size} />
      <span aria-live="polite" className="sr-only">
        {feedback}
      </span>
    </button>
  );
}

function HeartIcon({ filled, size }: { filled: boolean; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M10 16.5S3 12.5 3 7.75A3.25 3.25 0 0 1 10 5.6a3.25 3.25 0 0 1 7 2.15C17 12.5 10 16.5 10 16.5Z"
        fill={filled ? "var(--ink)" : "none"}
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}
