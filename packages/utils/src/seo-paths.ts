/**
 * TODO-156D tamamlama (ADR-081/082) — Entity → kanonik URL path eşlemesi (SAF, TEK KAYNAK).
 *
 * Gateway (redirect/history YAZAR) ve storefront (redirect ÇÖZER) AYNI path şeklini üretmeli; aksi halde
 * yazılan `sourcePath` ile gelen istek eşleşmez. Bu modül o tek kaynaktır. Storefront `lib/seo/routes.ts`
 * ürün path'ini buradan türetir; gateway auto-redirect `sourcePath`/`targetPath`'i buradan üretir.
 *
 * Slug'lar `[a-z0-9-]` (slug motoru garantisi) → encodeURIComponent identity; yine de encode edilir
 * (savunma). Ürün path = path-segment (runtime redirect'te güvenle eşleşir). Kategori path = query-param
 * (`/products?category=slug`) — storefront'un mevcut kategori surface'i (ADR-080); runtime redirect'te
 * query-tabanlı eşleşme sınırı vardır (bkz. TECHNICAL_DEBT), yazım tarafı yine de tam path üretir.
 */

/** Ürün detay path'i (redirect source/target + canonical ile birebir). */
export function productUrlPath(slug: string): string {
  return `/products/${encodeURIComponent(slug)}`;
}

/** Kategori landing path'i (PLP + category query; ADR-080 kategori surface). */
export function categoryUrlPath(slug: string): string {
  return `/products?category=${encodeURIComponent(slug)}`;
}

/**
 * Marka detay path'i (storefront `/markalar/[slug]` rotası — ADR-265). Ürün path'iyle simetrik:
 * path-segment tabanlı → runtime redirect'te güvenle eşleşir (kategori gibi query-tabanlı DEĞİL).
 * Gateway marka slug değişiminde bu path'ten redirect source/target üretir; storefront aynı path'i bekler.
 */
export function brandUrlPath(slug: string): string {
  return `/markalar/${encodeURIComponent(slug)}`;
}
