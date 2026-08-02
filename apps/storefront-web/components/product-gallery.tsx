"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@commerce-os/ui";
import { format, type StorefrontDictionary } from "@commerce-os/i18n";
import { resolveImageAlt, type GalleryImage } from "../lib/gallery";
import { ProductMediaFrame } from "./ui/product-media";

/**
 * PDP medya galerisi — TODO-165B (ADR — PDP gallery media contract).
 *
 * Amazon-tarzı kompakt düzen: DESKTOP'ta solda dikey thumbnail şeridi + sağda KONTROLLÜ
 * (max genişlik/yükseklik sınırlı) ana görsel; MOBILE/TABLET'te ana görsel üstte + altta
 * yatay kaydırmalı thumbnail. Ana görsel `ProductMediaFrame` (contain + nötr zemin + güvenli
 * iç boşluk) ile render edilir → devasa render + kırpma YOK. Zoom yalnız kullanıcı etkileşimiyle
 * (tam ekran lightbox). Thumbnail hover/click ile ana görsel değişir; ok tuşlarıyla gezinilir.
 *
 * Sunucu sayfasına gömülü küçük istemci adasıdır; SSR'da ilk seçili indeks 0 (kapak) basılır.
 * Çağıran taraf bu bileşeni yalnız `images.length > 1` iken render eder (tek görsel: ProductMedia).
 */
export function ProductGallery({
  images,
  title,
  t,
}: {
  images: GalleryImage[];
  title: string;
  t: StorefrontDictionary["detail"];
}) {
  const [selected, setSelected] = useState(0);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [shareToast, setShareToast] = useState(false);
  const count = images.length;
  const active = images[selected] ?? images[0];

  const go = useCallback(
    (index: number) => setSelected((index + count) % count),
    [count],
  );

  // Thumbnail şeridinde ok tuşlarıyla gezinme (yatay + dikey düzen için iki yön de).
  const onThumbKey = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      go(selected + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      go(selected - 1);
    }
  };

  const share = async () => {
    if (typeof window === "undefined") return;
    const url = window.location.href;
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title, url });
      } else if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        setShareToast(true);
      }
    } catch {
      /* kullanıcı iptali / desteklenmiyor — sessiz geç. */
    }
  };

  // Paylaş bildirimi kısa süre sonra kaybolur.
  useEffect(() => {
    if (!shareToast) return;
    const id = window.setTimeout(() => setShareToast(false), 2000);
    return () => window.clearTimeout(id);
  }, [shareToast]);

  // Lightbox açıkken Esc ile kapan + ok tuşlarıyla gezin.
  useEffect(() => {
    if (!zoomOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setZoomOpen(false);
      else if (event.key === "ArrowRight") go(selected + 1);
      else if (event.key === "ArrowLeft") go(selected - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomOpen, selected, go]);

  return (
    <div className="flex flex-col-reverse gap-3 lg:flex-row lg:items-start lg:gap-4">
      {/* Thumbnail: mobil/tablet altta yatay-kaydırma; desktop solda dikey-kaydırma. */}
      <div
        className="flex snap-x gap-2 overflow-x-auto pb-1 lg:max-h-[560px] lg:flex-col lg:overflow-y-auto lg:overflow-x-visible lg:pb-0 lg:pr-1"
        role="group"
        aria-label={t.galleryAlt}
        onKeyDown={onThumbKey}
      >
        {images.map((image, index) => {
          const isActive = index === selected;
          return (
            <button
              key={`${image.url}-${index}`}
              type="button"
              onClick={() => setSelected(index)}
              onMouseEnter={() => setSelected(index)}
              aria-pressed={isActive}
              aria-label={resolveImageAlt(
                image.altText,
                format(t.galleryThumbAlt, { title, n: index + 1 }),
              )}
              className={cn(
                "aspect-square h-16 w-16 flex-none snap-start overflow-hidden border bg-surface-muted transition-colors sm:h-[4.5rem] sm:w-[4.5rem]",
                isActive
                  ? "border-ink ring-1 ring-ink"
                  : "border-line hover:border-line-strong",
              )}
            >
              <img src={image.url} alt="" aria-hidden className="h-full w-full object-cover" />
            </button>
          );
        })}
      </div>

      {/* Ana görsel — kontrollü (max 520px), contain, nötr zemin, güvenli padding. */}
      <div className="min-w-0 flex-1">
        <div className="relative mx-auto w-full max-w-[520px]">
          <ProductMediaFrame
            variant="gallery-main"
            handle=""
            title={title}
            imageUrl={active.url}
            alt={resolveImageAlt(active.altText, title)}
            priority
            className="border border-line"
          >
            {/* Zoom yalnız kullanıcı etkileşimiyle: görselin üstünde tam-alan tetikleyici. */}
            <button
              type="button"
              onClick={() => setZoomOpen(true)}
              aria-label={t.galleryZoom}
              className="absolute inset-0 cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
            />
            {/* Paylaş aksiyonu (sağ üst). */}
            <button
              type="button"
              onClick={share}
              aria-label={t.galleryShare}
              className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface/90 text-ink shadow-sm backdrop-blur transition-colors hover:border-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M8.7 13.3l6.6 3.4M15.3 7.3L8.7 10.7M18 8a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM6 14.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM18 21a2.5 2.5 0 100-5 2.5 2.5 0 000 5z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            {shareToast ? (
              <span
                role="status"
                className="absolute right-3 top-14 rounded bg-ink px-2 py-1 text-[11px] text-surface"
              >
                {t.galleryShareCopied}
              </span>
            ) : null}
          </ProductMediaFrame>
        </div>
      </div>

      {/* Zoom lightbox — tam ekran, contain, tıkla/Esc ile kapanır. */}
      {zoomOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/90 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={t.galleryZoom}
          onClick={() => setZoomOpen(false)}
        >
          <button
            type="button"
            onClick={() => setZoomOpen(false)}
            aria-label={t.galleryZoomClose}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-surface/40 text-surface transition-colors hover:bg-surface/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-surface"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
          <img
            src={active.url}
            alt={resolveImageAlt(active.altText, title)}
            className="max-h-full max-w-full object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}
    </div>
  );
}
