import type { StorefrontProductDetail } from "./catalog-types";

/**
 * PDP galerisi (Faz 3/Dilim 2) icin SAF yardimcilar. Sunucu/istemci ayrimindan
 * bagimsiz; hem `ProductGallery` bileseni hem de testler bunlari kullanir. Boylece
 * "serit gosterilsin mi" ve alt-metin turetme mantigi bilesen icinde gizlenmez.
 */

/** Detay galerisindeki tek bir gorsel (public DTO allowlist'i). */
export type GalleryImage = StorefrontProductDetail["images"][number];

/**
 * Thumbnail seridi yalnizca birden fazla gorsel varken anlamlidir. Tek/sifir
 * gorselde serit hic render EDILMEZ (mevcut tek-gorsel davranisi korunur).
 */
export function shouldShowThumbnailStrip(images: readonly GalleryImage[]): boolean {
  return images.length > 1;
}

/**
 * Bir gorselin `alt`/`aria-label` metnini turetir: yoneticinin girdigi `altText`
 * (bosluk temizlenmis, bos degilse) tercih edilir; yoksa cagiranin verdigi
 * (urun basligindan turetilmis) yedek metne duser. Erisilebilirlik icin asla bos
 * string dondurmez.
 */
export function resolveImageAlt(altText: string | null, fallback: string): string {
  const trimmed = altText?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

/**
 * PDP hover-zoom için transform-origin'i (yüzde) hesaplar — GERÇEK render edilmiş
 * görsel sınırlarını (object-contain letterbox'ı) dikkate alarak. İşaretçi konumu
 * görsel içeriğinin DIŞINDAysa (beyaz boşluk) en yakın görsel kenarına KELEPÇELENİR;
 * böylece boşluk üzerinde zoom yapılmaz. Saf ve DOM'suz → birim test edilebilir.
 *
 * @param px,py       İşaretçi konumu (frame'e göre px; 0..frameW, 0..frameH).
 * @param frameW,frameH  Zoom katmanı (frame içerik kutusu) boyutu px.
 * @param naturalW,naturalH  Görselin doğal boyutu.
 * @returns transform-origin yüzdeleri (frame kutusuna göre 0..100).
 */
export function containZoomOrigin(
  px: number,
  py: number,
  frameW: number,
  frameH: number,
  naturalW: number,
  naturalH: number,
): { x: number; y: number } {
  if (frameW <= 0 || frameH <= 0 || naturalW <= 0 || naturalH <= 0) {
    return { x: 50, y: 50 };
  }
  const frameAspect = frameW / frameH;
  const imgAspect = naturalW / naturalH;
  // object-contain: görsel, en-boy oranını koruyarak frame içine yerleşir; kalan alan
  // letterbox (üst-alt ya da sol-sağ). Render edilen görsel kutusunu (imgW/H, offX/Y) bul.
  let imgW: number;
  let imgH: number;
  let offX: number;
  let offY: number;
  if (imgAspect > frameAspect) {
    imgW = frameW;
    imgH = frameW / imgAspect;
    offX = 0;
    offY = (frameH - imgH) / 2;
  } else {
    imgH = frameH;
    imgW = frameH * imgAspect;
    offY = 0;
    offX = (frameW - imgW) / 2;
  }
  // İşaretçiyi görsel içerik kutusuna kelepçele (letterbox'a taşma → en yakın kenar).
  const cx = Math.max(offX, Math.min(offX + imgW, px));
  const cy = Math.max(offY, Math.min(offY + imgH, py));
  return { x: (cx / frameW) * 100, y: (cy / frameH) * 100 };
}
