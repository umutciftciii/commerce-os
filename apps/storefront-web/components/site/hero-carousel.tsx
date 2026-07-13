"use client";

import { useEffect, useState } from "react";
import type { StorefrontDictionary } from "@commerce-os/i18n";
import type { StorefrontHeroSlide } from "../../lib/catalog-types";
import { ButtonLink } from "../ui";

/**
 * ADR-065 (Faz 3/Site Kabuğu) — Ana sayfa hero carousel'i (GERÇEK PUBLISHED hero
 * slide'lari — mock DEĞİL). `campaign-bar.tsx` mekaniğinin görsel-panel uyarlaması:
 *  - otomatik geçiş (~7sn), hover/focus'ta ve `prefers-reduced-motion`'da DURUR,
 *  - ok tuşlarıyla (◀ ▶) manuel gezinme + nokta göstergeleri (yalnız çoklu slide),
 *  - tek slide statik gösterilir (kontrol yok),
 *  - boş dizide RENDER EDİLMEZ (page statik `HeroVisual` fallback'ini gösterir).
 *
 * Görsel panel, statik `HeroVisual` ile aynı yeri tutar (aspect-[4/5], `lg:block`).
 * Slide CTA'sı sayfanın standart accent butonudur (ButtonLink variant="cta") —
 * hero'ya özel farklı stil yok; tek-accent token korunur.
 */
export function HeroCarousel({
  slides,
  t,
  brandLabel,
}: {
  slides: StorefrontHeroSlide[];
  t: StorefrontDictionary["shell"];
  /** Görsel alt metni fallback'i (slide headline yoksa). */
  brandLabel: string;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = slides.length;
  const multi = count > 1;
  const active = slides[Math.min(index, count - 1)];

  useEffect(() => {
    if (!multi || paused) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % count), 7000);
    return () => window.clearInterval(id);
  }, [multi, paused, count]);

  if (count === 0) return null;

  const go = (next: number) => setIndex((next + count) % count);

  return (
    <div
      className="group relative hidden aspect-[4/5] overflow-hidden border border-line bg-gradient-to-br from-[#efece6] to-[#ded8cc] lg:block"
      role="region"
      aria-roledescription="carousel"
      aria-label={t.heroRegion}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      {/* Görsel — slide değişince swap; alt metni headline ya da marka fallback'i.
          storageKey'den türetilen göreli /media/* URL (Next rewrite ile gateway'e
          proxy'lenir); boyut sabit değil (art-directed), object-cover ile doldurulur. */}
      <img
        src={active.mediaUrl}
        alt={active.headline ?? brandLabel}
        className="absolute inset-0 h-full w-full object-cover"
      />

      {/* Metin okunabilirliği için alttan koyu gradyan (yalnız içerik varsa). */}
      {active.headline || active.subtext || (active.ctaLabel && active.ctaHref) ? (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent p-6 sm:p-8">
          <div aria-live="polite" aria-atomic="true">
            {active.headline ? (
              <p className="font-serif text-2xl font-normal tracking-tightish text-white sm:text-3xl">
                {active.headline}
              </p>
            ) : null}
            {active.subtext ? (
              <p className="mt-2 max-w-sm text-sm text-white/85">{active.subtext}</p>
            ) : null}
          </div>
          {active.ctaLabel && active.ctaHref ? (
            <ButtonLink href={active.ctaHref} variant="cta" size="md" className="mt-5">
              {active.ctaLabel}
            </ButtonLink>
          ) : null}
        </div>
      ) : null}

      {/* Oklar — yalnız çoklu slide. Görsel üstünde kontrast için yarı-saydam zemin. */}
      {multi ? (
        <>
          <button
            type="button"
            onClick={() => go(index - 1)}
            aria-label={t.heroPrev}
            className="absolute left-3 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center bg-black/30 text-white/90 backdrop-blur-sm transition-colors hover:bg-black/50 hover:text-white"
          >
            <svg width="14" height="14" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path d="M7.5 2L3.5 6l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => go(index + 1)}
            aria-label={t.heroNext}
            className="absolute right-3 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center bg-black/30 text-white/90 backdrop-blur-sm transition-colors hover:bg-black/50 hover:text-white"
          >
            <svg width="14" height="14" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path d="M4.5 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </>
      ) : null}

      {/* Noktalar — yalnız çoklu slide; görselin üst-ortasında. */}
      {multi ? (
        <div className="absolute inset-x-0 top-4 flex items-center justify-center gap-1.5">
          {slides.map((slide, i) => (
            <button
              key={slide.key}
              type="button"
              onClick={() => go(i)}
              aria-label={`${i + 1} / ${count}`}
              aria-current={i === index}
              className={[
                "h-1 rounded-none transition-all",
                i === index ? "w-5 bg-white" : "w-1.5 bg-white/50 hover:bg-white/80",
              ].join(" ")}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
