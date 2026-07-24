/**
 * TODO-161 (ADR-114/118) — "Sponsorlu" rozeti + impression izleyici (client).
 *
 * ZORUNLU açık etiket (ADR-091 karar 6): sponsorlu ürün kullanıcıya açıkça "Sponsorlu" gösterilir.
 * Rozet görünür olduğunda (viewport'a girince, IntersectionObserver) BİR KEZ IMPRESSION gönderir —
 * "impression yalnız gerçekten render edilen sponsorlu üründe" (görev §8). Token yoksa render etmez.
 */
"use client";

import { useEffect, useRef } from "react";
import { trackSponsoredEvent } from "../../lib/sponsored/track";

export function SponsoredBadge({
  token,
  label,
  source,
  className,
}: {
  token: string | null | undefined;
  label: string;
  source?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const firedRef = useRef(false);

  useEffect(() => {
    if (!token || firedRef.current) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      // Observer yoksa (eski tarayıcı/test) render'da say.
      if (token && !firedRef.current) {
        firedRef.current = true;
        trackSponsoredEvent("IMPRESSION", token, source);
      }
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !firedRef.current) {
            firedRef.current = true;
            trackSponsoredEvent("IMPRESSION", token, source);
            observer.disconnect();
          }
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [token, source]);

  if (!token) return null;
  return (
    <span
      ref={ref}
      className={
        className ??
        "inline-flex items-center rounded-sm bg-black/70 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white"
      }
    >
      {label}
    </span>
  );
}
