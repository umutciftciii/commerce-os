"use client";

import { useEffect, useRef, useState } from "react";
import type { StorefrontDictionary } from "@commerce-os/i18n";
import type { StorefrontCampaignSlide } from "../../lib/catalog-types";

/**
 * Vitrin ust band kampanya slider'i (GERCEK F4A verisi — mock DEGIL).
 *
 * `slides` gateway'in store-seviyesi public kampanya ucundan gelir. Tek slide
 * varsa statik gosterilir (kontrol yok). Coklu slide'da:
 *  - otomatik gecis (~6sn), hover'da ve `prefers-reduced-motion`'da DURUR,
 *  - ok tuslariyla (◀ ▶) manuel gezinme,
 *  - nokta gostergeleriyle dogrudan slayta atlama.
 *
 * Slide yoksa bu bilesen RENDER EDILMEZ; layout fallback duyuru metnini gosterir.
 */
export function CampaignBar({
  slides,
  t,
}: {
  slides: StorefrontCampaignSlide[];
  t: StorefrontDictionary["shell"];
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = slides.length;
  const multi = count > 1;
  const active = slides[Math.min(index, count - 1)];
  const liveRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!multi || paused) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % count), 6000);
    return () => window.clearInterval(id);
  }, [multi, paused, count]);

  if (count === 0) return null;

  const go = (next: number) => setIndex((next + count) % count);

  return (
    <div
      className="relative bg-ink text-surface"
      role="region"
      aria-label={t.campaignRegion}
      aria-roledescription="carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="mx-auto flex min-h-9 max-w-grid items-center justify-center gap-3 px-10 py-2">
        {multi ? (
          <button
            type="button"
            onClick={() => go(index - 1)}
            aria-label={t.campaignPrev}
            className="on-media absolute left-3 inline-flex h-6 w-6 items-center justify-center opacity-70 transition-opacity hover:opacity-100"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path d="M7.5 2L3.5 6l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : null}

        <div
          ref={liveRef}
          aria-live="polite"
          aria-atomic="true"
          className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-0.5 text-center text-[11px] font-medium uppercase tracking-wideish sm:text-xs"
        >
          <span>{active.headline}</span>
          {active.detail ? (
            <span className="on-media-muted normal-case tracking-normal">· {active.detail}</span>
          ) : null}
          {active.couponCode ? (
            <span className="border-on-media inline-flex items-center gap-1 border px-1.5 py-0.5 text-[10px] tracking-wideish">
              {t.campaignCouponPrefix}: {active.couponCode}
            </span>
          ) : null}
        </div>

        {multi ? (
          <button
            type="button"
            onClick={() => go(index + 1)}
            aria-label={t.campaignNext}
            className="on-media absolute right-3 inline-flex h-6 w-6 items-center justify-center opacity-70 transition-opacity hover:opacity-100"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path d="M4.5 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : null}
      </div>

      {multi ? (
        <div className="flex items-center justify-center gap-1.5 pb-1.5">
          {slides.map((slide, i) => (
            <button
              key={slide.key}
              type="button"
              onClick={() => go(i)}
              aria-label={`${i + 1} / ${count}`}
              aria-current={i === index}
              className={[
                "h-1 rounded-full transition-all",
                i === index ? "bg-on-media w-4" : "bg-on-media-soft w-1.5",
              ].join(" ")}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
