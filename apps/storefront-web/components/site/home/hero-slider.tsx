"use client";

import { useEffect, useState } from "react";
import { ButtonLink, Container } from "../../ui";
import type { StorefrontHomeHeroSlide } from "../../../lib/catalog-types";

/**
 * TODO-158A (ADR-086) + TODO-158C (ADR-088) — Ana sayfa hero slider'ı (yönetilebilir; mock DEĞİL).
 * Gateway'in public composed `/home` ucundan gelen HERO_SLIDER slide'larını render eder.
 *
 * TODO-158C yeniden tasarımı:
 *  - SABİT yükseklik (`.hero-frame`: mobil ~256 / tablet ~408 / masaüstü ~528px) — eski
 *    aspect-ratio (`lg:aspect-[16/7]` → full-bleed'de ~840px) KALDIRILDI. Hero artık ekranın
 *    büyük bölümünü kaplamaz; altındaki Featured/Showcase ilk bakışta hissedilir.
 *  - CONTAINER hizalı (`max-w-grid` + kenar boşluğu); köşe `rounded-md`, yumuşak `shadow-md`.
 *  - Overlay/ok/nokta TAMAMEN token (`.scrim-media` `.on-media` `.control-media`
 *    `.control-surface`) — ham black/white YOK.
 *  - Otomatik geçiş (config.autoplayMs; ~7sn); hover/focus + `prefers-reduced-motion`'da DURUR.
 *  - Ok + nokta göstergeleri yalnız çoklu slide'da. CTA = tek accent (variant="cta").
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
      className="group/hero pt-4 sm:pt-6"
      role="region"
      aria-roledescription="carousel"
      aria-label={labels.region}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <Container>
        <div className="hero-frame relative overflow-hidden rounded-md bg-surface-muted shadow-md">
          {/* Görsel — art-directed: mobilde mobileMediaUrl (varsa), masaüstünde mediaUrl. */}
          <picture>
            {active.mobileMediaUrl ? (
              <source media="(max-width: 639px)" srcSet={active.mobileMediaUrl} />
            ) : null}
            <img
              src={active.mediaUrl}
              alt={active.headline ?? ""}
              // LCP: hero ilk görünür görseldir → eager + yüksek öncelik (CLS'siz sabit çerçeve).
              loading="eager"
              decoding="async"
              // eslint-disable-next-line @typescript-eslint/no-explicit-any -- fetchPriority React 19'da desteklenir; tip henüz dar.
              {...({ fetchPriority: "high" } as any)}
              className="absolute inset-0 h-full w-full object-cover"
            />
          </picture>

          {hasText ? (
            <div className="scrim-media absolute inset-0 flex items-end sm:items-center">
              <div className="w-full px-5 pb-8 sm:px-10 sm:pb-0 lg:px-14">
                <div className="max-w-lg" aria-live="polite" aria-atomic="true">
                  {active.headline ? (
                    <p className="on-media font-serif text-2xl font-normal leading-[1.08] tracking-tightish sm:text-4xl lg:text-5xl">
                      {active.headline}
                    </p>
                  ) : null}
                  {active.subtext ? (
                    <p className="on-media-muted mt-3 max-w-md text-sm sm:text-base">
                      {active.subtext}
                    </p>
                  ) : null}
                  {active.ctaLabel && active.ctaHref ? (
                    <ButtonLink
                      href={active.ctaHref}
                      variant="cta"
                      size="lg"
                      className="mt-6 shadow-md sm:mt-8"
                    >
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
                className="control-media absolute left-3 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full opacity-100 backdrop-blur-sm transition-all duration-200 ease-premium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-contrast sm:opacity-0 sm:focus-visible:opacity-100 sm:group-hover/hero:opacity-100 sm:left-5"
              >
                <svg width="18" height="18" viewBox="0 0 12 12" fill="none" aria-hidden>
                  <path d="M7.5 2L3.5 6l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => go(index + 1)}
                aria-label={labels.next}
                className="control-media absolute right-3 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full opacity-100 backdrop-blur-sm transition-all duration-200 ease-premium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-contrast sm:opacity-0 sm:focus-visible:opacity-100 sm:group-hover/hero:opacity-100 sm:right-5"
              >
                <svg width="18" height="18" viewBox="0 0 12 12" fill="none" aria-hidden>
                  <path d="M4.5 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <div className="absolute inset-x-0 bottom-4 flex items-center justify-center gap-2">
                {slides.map((slide, i) => (
                  <button
                    key={slide.key}
                    type="button"
                    onClick={() => go(i)}
                    aria-label={`${i + 1} / ${count}`}
                    aria-current={i === index}
                    className={[
                      "h-1.5 rounded-full transition-all duration-300 ease-premium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-contrast",
                      i === index ? "w-7 control-surface" : "w-1.5 control-media",
                    ].join(" ")}
                  />
                ))}
              </div>
            </>
          ) : null}
        </div>
      </Container>
    </section>
  );
}
