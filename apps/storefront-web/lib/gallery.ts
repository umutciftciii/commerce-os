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
