"use client";

import { useEffect, useState } from "react";
import { ButtonLink } from "../../ui";
import type { StorefrontHomeHeroSlide } from "../../../lib/catalog-types";

/**
 * TODO-158A (ADR-086) — Ana sayfa TAM GENİŞLİK hero slider'ı (yönetilebilir; mock DEĞİL).
 * Gateway'in public composed `/home` ucundan gelen HERO_SLIDER section slide'larını render eder.
 *  - Full-bleed görsel; masaüstü geniş, mobilde ayrı `mobileMediaUrl` varsa `<picture>` ile art-direction.
 *  - Otomatik geçiş (config.autoplayMs; verilmezse ~7sn); hover/focus + `prefers-reduced-motion`'da DURUR.
 *  - Ok + nokta göstergeleri yalnız çoklu slide'da. Tek slide statik.
 *  - Metin okunabilirliği için alttan koyu gradyan. CTA sayfanın accent butonu (tek-accent korunur).
 */
export function HeroSlider({
  slides,
  autoplayMs,
  labels,
}: {
  slides: StorefrontHomeHeroSlide[];
  autoplayMs: number | null;
  labels: { region: string; prev: string; next: string };
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = slides.length;
  const multi = count > 1;
  const active = slides[Math.min(index, count - 1)];
  const interval = autoplayMs && autoplayMs > 0 ? autoplayMs : 7000;

  useEffect(() => {
    if (!multi || paused) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % count), interval);
    return () => window.clearInterval(id);
  }, [multi, paused, count, interval]);

  if (count === 0) return null;

  const go = (next: number) => setIndex((next + count) % count);
  const hasText = Boolean(active.headline || active.subtext || (active.ctaLabel && active.ctaHref));

  return (
    <section
      className="group relative overflow-hidden border-b border-line bg-surface"
      role="region"
      aria-roledescription="carousel"
      aria-label={labels.region}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      {/* Görsel — art-directed: mobilde mobileMediaUrl (varsa), masaüstünde mediaUrl.
          aspect: mobil dikeyimsi (4/5), masaüstü geniş (16/7). object-cover ile doldurulur. */}
      <div className="relative aspect-[4/5] w-full sm:aspect-[16/9] lg:aspect-[16/7]">
        <picture>
          {active.mobileMediaUrl ? (
            <source media="(max-width: 639px)" srcSet={active.mobileMediaUrl} />
          ) : null}
          <img
            src={active.mediaUrl}
            alt={active.headline ?? ""}
            className="absolute inset-0 h-full w-full object-cover"
          />
        </picture>

        {hasText ? (
          <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/65 via-black/20 to-transparent">
            <div className="mx-auto w-full max-w-7xl px-4 pb-10 sm:px-6 sm:pb-14 lg:px-8 lg:pb-20">
              <div className="max-w-xl" aria-live="polite" aria-atomic="true">
                {active.headline ? (
                  <p className="font-serif text-3xl font-normal tracking-tightish text-white sm:text-4xl lg:text-5xl">
                    {active.headline}
                  </p>
                ) : null}
                {active.subtext ? (
                  <p className="mt-3 max-w-md text-sm text-white/85 sm:text-base">{active.subtext}</p>
                ) : null}
                {active.ctaLabel && active.ctaHref ? (
                  <ButtonLink href={active.ctaHref} variant="cta" size="lg" className="mt-7">
                    {active.ctaLabel}
                  </ButtonLink>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {multi ? (
          <>
            <button
              type="button"
              onClick={() => go(index - 1)}
              aria-label={labels.prev}
              className="absolute left-3 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center bg-black/30 text-white/90 backdrop-blur-sm transition-colors hover:bg-black/50 hover:text-white sm:left-5"
            >
              <svg width="16" height="16" viewBox="0 0 12 12" fill="none" aria-hidden>
                <path d="M7.5 2L3.5 6l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => go(index + 1)}
              aria-label={labels.next}
              className="absolute right-3 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center bg-black/30 text-white/90 backdrop-blur-sm transition-colors hover:bg-black/50 hover:text-white sm:right-5"
            >
              <svg width="16" height="16" viewBox="0 0 12 12" fill="none" aria-hidden>
                <path d="M4.5 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div className="absolute inset-x-0 bottom-4 flex items-center justify-center gap-1.5">
              {slides.map((slide, i) => (
                <button
                  key={slide.key}
                  type="button"
                  onClick={() => go(i)}
                  aria-label={`${i + 1} / ${count}`}
                  aria-current={i === index}
                  className={[
                    "h-1 rounded-none transition-all",
                    i === index ? "w-6 bg-white" : "w-2 bg-white/50 hover:bg-white/80",
                  ].join(" ")}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
