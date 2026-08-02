"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn, useFocusTrap } from "@commerce-os/ui";
import { format, type StorefrontDictionary } from "@commerce-os/i18n";
import { containZoomOrigin, resolveImageAlt, type GalleryImage } from "../lib/gallery";
import { ProductMediaFrame } from "./ui/product-media";

/**
 * PDP medya galerisi — TODO-165B + Final Polish (§2 gallery hover zoom).
 *
 * DESKTOP: solda dikey thumbnail şeridi + sağda KONTROLLÜ ana görsel. Ana görselde
 * mouse-over ile ÇERÇEVE-İÇİ zoom: işaretçi konumuna göre transform-origin ile pan;
 * görsel kendi çerçevesinde büyür (dışarı taşmaz, sağdaki ürün bilgisini KAPATMAZ);
 * mouse-leave ile sıfırlanır; thumbnail değişince zoom yeni görsele geçer; düşük
 * çözünürlüklü görselde zoom katsayısı sınırlanır (yoksa hiç büyütmez).
 *
 * MOBILE/TABLET: hover kapalı; yatay SWIPE ile görsel gezinme; "Büyüt" aksiyonuyla
 * kontrollü tam-ekran görüntüleyici. Tam ekran modal OPSİYONELDİR (zorunlu değil):
 * açık ikon + ESC + backdrop + görünür kapat + odak tuzağı.
 *
 * Sunucu sayfasına gömülü istemci adası; SSR'da ilk seçili indeks 0 (kapak).
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
  const [hoverCapable, setHoverCapable] = useState(false);
  const [zooming, setZooming] = useState(false);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });
  const [maxScale, setMaxScale] = useState(1);
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const frameRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLImageElement>(null);
  const lightboxRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
  const count = images.length;
  const active = images[selected] ?? images[0];

  const go = useCallback((index: number) => setSelected((index + count) % count), [count]);

  // Yalnız hover+ince işaretçi olan cihazlarda (desktop) zoom etkin.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const update = () => setHoverCapable(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  // Thumbnail/varyant değişince zoom durumunu sıfırla (eski zoom state kalmaz): zoom kapanır,
  // origin merkeze döner. maxScale/natural burada SIFIRLANMAZ — onImageLoad'a aittir: yeni görsel
  // src'si değişince ölçüm img'i yeniden yüklenip taze değerleri yazar. (Mount'ta reset ile onLoad
  // yarışırsa cached görselde maxScale=1'de takılırdı; bu yüzden ölçümü tek sahibe bıraktık.)
  useEffect(() => {
    setZooming(false);
    setOrigin({ x: 50, y: 50 });
  }, [selected, active?.url]);

  // Thumbnail şeridinde ok tuşlarıyla gezinme (yatay + dikey düzen).
  const onThumbKey = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      go(selected + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      go(selected - 1);
    }
  };

  // Ana görselde işaretçi konumunu transform-origin'e çevir — GERÇEK görsel sınırlarına
  // (object-contain letterbox'ı) göre kelepçelenir; beyaz boşlukta zoom yapılmaz.
  const onFrameMove = (event: React.MouseEvent) => {
    if (!hoverCapable || maxScale <= 1.05) return;
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    setOrigin(
      containZoomOrigin(
        event.clientX - rect.left,
        event.clientY - rect.top,
        rect.width,
        rect.height,
        natural.w,
        natural.h,
      ),
    );
  };

  // Görselin doğal boyutundan güvenli zoom katsayısı + letterbox boyutu türet. CACHED
  // görselde React onLoad ATEŞLENMEYEBİLİR (base ProductMediaFrame img'i aynı src'yi önce
  // yükler → ölçüm img'i cache'ten anında tamamlanır); bu yüzden `complete` durumunu da
  // kontrol ederiz (onLoad + mount/güncelleme efekti). Düşük çözünürlükte büyütme sınırlanır.
  const applyNatural = useCallback(() => {
    const img = measureRef.current;
    if (!img || !img.complete || img.naturalWidth === 0) return;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    setNatural({ w, h });
    setMaxScale(w >= 1400 ? 2.5 : w >= 1000 ? 2.1 : w >= 720 ? 1.7 : w >= 520 ? 1.3 : 1);
  }, []);

  // active.url değişince (cached olabilir) ölçümü uygula; onLoad non-cached yolu kapsar.
  useEffect(() => {
    applyNatural();
  }, [active?.url, applyNatural]);

  // Mobil: yatay swipe ile görsel gezinme.
  const onTouchStart = (event: React.TouchEvent) => {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (event: React.TouchEvent) => {
    if (touchStartX.current === null || count < 2) return;
    const delta = (event.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
    if (Math.abs(delta) > 40) go(selected + (delta < 0 ? 1 : -1));
    touchStartX.current = null;
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
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [zoomOpen, selected, go]);

  // Tam-ekran görüntüleyicide odak tuzağı (açık aksiyon → erişilebilir).
  useFocusTrap(zoomOpen, lightboxRef);

  const canZoom = hoverCapable && maxScale > 1.05;

  return (
    <div className="flex flex-col-reverse gap-3 lg:flex-row lg:items-start lg:gap-4">
      {/* Thumbnail: mobil/tablet altta yatay-kaydırma; desktop solda dikey-kaydırma.
          Tek görselde şerit gizli (tek başına thumbnail göstermeye gerek yok). */}
      {count > 1 ? (
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
                isActive ? "border-ink ring-1 ring-ink" : "border-line hover:border-line-strong",
              )}
            >
              <img src={image.url} alt="" aria-hidden className="h-full w-full object-cover" />
            </button>
          );
        })}
      </div>
      ) : null}

      {/* Ana görsel — kontrollü (max 520px), contain, çerçeve-içi hover zoom. */}
      <div className="min-w-0 flex-1">
        <div
          ref={frameRef}
          className={cn(
            "relative mx-auto w-full max-w-[520px] overflow-hidden",
            canZoom && (zooming ? "cursor-zoom-out" : "cursor-zoom-in"),
          )}
          onMouseEnter={() => canZoom && setZooming(true)}
          onMouseMove={onFrameMove}
          onMouseLeave={() => setZooming(false)}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <ProductMediaFrame
            variant="gallery-main"
            handle=""
            title={title}
            imageUrl={active.url}
            alt={resolveImageAlt(active.altText, title)}
            priority
            className="border border-line"
          >
            {/* Ölçüm için görünmez yükleyici (doğal boyut → güvenli zoom katsayısı + letterbox hesabı).
                ref + onLoad: cached görselde onLoad ateşlenmese de `complete` üzerinden ölçülür. */}
            <img
              ref={measureRef}
              src={active.url}
              alt=""
              aria-hidden
              className="hidden"
              onLoad={applyNatural}
            />

            {/* Zoom katmanı — TEK, OPAK katman: `bg-surface` ile alttaki base görseli TAMAMEN
                örter → duplicate görsel / seam / yatay parçalanma YOK. Opaklık ANINDA açılır
                (geçiş yok), yalnız ölçek animasyonludur; hover bitince base sorunsuz geri gelir. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 overflow-hidden bg-surface"
              style={{ opacity: zooming && canZoom ? 1 : 0 }}
            >
              <img
                src={active.url}
                alt=""
                className="h-full w-full object-contain transition-transform duration-200 ease-out"
                style={{
                  transformOrigin: `${origin.x}% ${origin.y}%`,
                  transform: `scale(${zooming && canZoom ? maxScale : 1})`,
                }}
              />
            </div>

            {/* Paylaş aksiyonu (sağ üst). */}
            <button
              type="button"
              onClick={share}
              aria-label={t.galleryShare}
              className="absolute right-3 top-3 z-dropdown flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface/90 text-ink shadow-sm backdrop-blur transition-colors hover:border-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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

            {/* Tam-ekran (büyüt) — OPSİYONEL kontrollü zoom aksiyonu (açık ikon). */}
            <button
              type="button"
              onClick={() => setZoomOpen(true)}
              aria-label={t.galleryZoom}
              className="absolute bottom-3 right-3 z-dropdown flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface/90 text-ink shadow-sm backdrop-blur transition-colors hover:border-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M9 4H4v5M15 4h5v5M15 20h5v-5M9 20H4v-5"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            {shareToast ? (
              <span
                role="status"
                className="absolute right-3 top-14 z-dropdown rounded bg-ink px-2 py-1 text-[11px] text-surface"
              >
                {t.galleryShareCopied}
              </span>
            ) : null}
          </ProductMediaFrame>
        </div>
      </div>

      {/* Opsiyonel tam-ekran görüntüleyici — açık ikon + ESC + backdrop + kapat + odak tuzağı. */}
      {zoomOpen ? (
        <div
          ref={lightboxRef}
          className="fixed inset-0 z-modal flex items-center justify-center bg-ink/90 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={t.galleryZoom}
          tabIndex={-1}
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
          {count > 1 ? (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  go(selected - 1);
                }}
                aria-label={t.galleryPrev ?? t.galleryZoom}
                className="absolute left-4 flex h-10 w-10 items-center justify-center rounded-full border border-surface/40 text-surface transition-colors hover:bg-surface/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-surface"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  go(selected + 1);
                }}
                aria-label={t.galleryNext ?? t.galleryZoom}
                className="absolute right-16 flex h-10 w-10 items-center justify-center rounded-full border border-surface/40 text-surface transition-colors hover:bg-surface/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-surface"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </>
          ) : null}
          <img
            src={active.url}
            alt={resolveImageAlt(active.altText, title)}
            className="max-h-full max-w-full touch-pinch-zoom object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}
    </div>
  );
}
