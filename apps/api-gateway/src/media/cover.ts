/**
 * ADR-065 — Ürün kapak URL'i haritası (paylaşılan, tek allowlist noktası).
 *
 * Faz 3/Dilim 6a sepet/onay kapak haritası ile Dilim 6b hesap-siparişleri satır
 * thumbnail'i AYNI mantığı paylaşır: TEK batched `listProductImages(coverOnly=true)`
 * çağrısıyla (N+1 YOK) her ürünün en düşük position kapağını alır; `storageKey`'i
 * `resolveMediaUrl` ile public URL'e çevirir (MEDIA_PUBLIC_BASE_URL boş ise
 * `/media/<key>` göreli, doluysa CDN kökü).
 *
 * ALLOWLIST: dönüş yalnız `Map<productId, url>` (türetilmiş URL) taşır — mediaId/
 * storageKey DIŞARI SIZMAZ. Kapaksız ürün haritada YER ALMAZ (çağıran `?? null`
 * ile yer tutucuya düşer). `listProductImages` DI ile geçer; server.ts kendi
 * `dataAccess`'ini, customers modülü enjekte edilen fonksiyonu verir (Prisma
 * bağımlılığı customers'a sızmaz, test'te spy ile N+1 kanıtı kolay).
 */
import { resolveMediaUrl } from "./url.js";

export type ListProductImagesFn = (
  storeId: string,
  productIds: string[],
  coverOnly: boolean,
) => Promise<Map<string, Array<{ storageKey: string }>>>;

export async function buildProductCoverUrlMap(
  listProductImages: ListProductImagesFn,
  mediaBaseUrl: string | undefined,
  storeId: string,
  productIds: string[],
): Promise<Map<string, string>> {
  const urlByProductId = new Map<string, string>();
  const unique = [...new Set(productIds)];
  if (unique.length === 0) return urlByProductId;
  const coverMap = await listProductImages(storeId, unique, true);
  for (const [productId, records] of coverMap) {
    const cover = records[0];
    if (cover) {
      urlByProductId.set(productId, resolveMediaUrl(mediaBaseUrl, cover.storageKey));
    }
  }
  return urlByProductId;
}

// ── BUG-CART-003 (BUG 1) — Varyant-farkinda sepet kapagi ──────────────────────────────
// Sepet satiri thumbnail'i SECILI VARYANTIN efektif medyasindan cozulur (Variant Media
// Engine / galleryImagesForVariant ile TUTARLI). Onceki hali productId ile (en dusuk
// position) cozup renk eksenini yok sayiyordu → yanlis renk gorseli. Bu mantik sepet
// icin AYRI bir algoritma DEGIL; ayni oncelik: (1) secili renk option'ina etiketli
// gorsel, (2) urun birincil kapagi (erken fallback YOK).

/** Kapak secimi icin gereken minimal gorsel alanlari (position ASC sirali gelmeli). */
export interface CoverImageRecord {
  storageKey: string;
  position: number;
  optionId: string | null;
}

/** Tum gorselleri (coverOnly=false dahil) position+optionId ile donduren batched sorgu. */
export type ListProductImagesRichFn = (
  storeId: string,
  productIds: string[],
  coverOnly: boolean,
) => Promise<Map<string, CoverImageRecord[]>>;

/** variantId -> media-ekseni (Renk) cozulmus option id (Faz 2C-7 / ADR-078). */
export type ResolveVariantMediaOptionsFn = (
  storeId: string,
  productId: string,
  attributeDefinitionId: string,
) => Promise<Map<string, string>>;

/** Bir sepet satiri icin varyant-cozumu girdisi (index'ten turetilir). */
export interface CartCoverVariantEntry {
  variantId: string;
  productId: string;
  mediaDefiningAttributeId: string | null;
}

/**
 * Bir varyant icin EFEKTIF kapak gorselini secer. `images` position ASC sirali olmali.
 * Oncelik: (1) media ekseni + secili renk option'ina etiketli gorsel (en dusuk position),
 * (2) urun birincil kapagi (images[0]). Media ekseni yoksa dogrudan urun kapagi.
 */
export function pickVariantCoverImage<T extends CoverImageRecord>(
  images: T[],
  mediaDefiningAttributeId: string | null,
  selectedMediaOptionId: string | null,
): T | null {
  if (images.length === 0) return null;
  // Media ekseni + secili renk → o renge etiketli EN DUSUK position gorseli tercih et.
  if (mediaDefiningAttributeId && selectedMediaOptionId) {
    const colorSpecific = images.find((image) => image.optionId === selectedMediaOptionId);
    if (colorSpecific) return colorSpecific;
  }
  // Fallback: urun birincil kapagi (en dusuk position). Erken fallback YOK — yalniz
  // renge etiketli gorsel bulunamazsa buraya duser.
  return images[0];
}

/**
 * Sepet satirlari icin variantId -> turetilmis kapak URL'i haritasi. TEK batched
 * listProductImages(coverOnly=false) + media-eksenli urunler icin variant-option cozumu.
 * Kapaksiz satir haritada yer almaz (cagiran ?? null ile yer tutucuya duser).
 */
export async function buildCartVariantCoverUrlMap(
  listProductImages: ListProductImagesRichFn,
  resolveVariantMediaOptions: ResolveVariantMediaOptionsFn,
  mediaBaseUrl: string | undefined,
  storeId: string,
  entries: CartCoverVariantEntry[],
): Promise<Map<string, string>> {
  const urlByVariantId = new Map<string, string>();
  if (entries.length === 0) return urlByVariantId;
  const productIds = [...new Set(entries.map((entry) => entry.productId))];
  // Renk eslemesi icin TUM gorseller gerekir (coverOnly=false) — position ASC gelir.
  const imagesByProduct = await listProductImages(storeId, productIds, false);
  // Media ekseni olan urunler icin variant -> option cozumu (urun basina tek batched sorgu).
  const axisByProduct = new Map<string, string>();
  for (const entry of entries) {
    if (entry.mediaDefiningAttributeId) axisByProduct.set(entry.productId, entry.mediaDefiningAttributeId);
  }
  const mediaOptionByVariant = new Map<string, string>();
  await Promise.all(
    [...axisByProduct.entries()].map(async ([productId, attributeDefinitionId]) => {
      const resolved = await resolveVariantMediaOptions(storeId, productId, attributeDefinitionId);
      for (const [variantId, optionId] of resolved) mediaOptionByVariant.set(variantId, optionId);
    }),
  );
  for (const entry of entries) {
    const images = imagesByProduct.get(entry.productId) ?? [];
    const selectedMediaOptionId = entry.mediaDefiningAttributeId
      ? mediaOptionByVariant.get(entry.variantId) ?? null
      : null;
    const cover = pickVariantCoverImage(images, entry.mediaDefiningAttributeId, selectedMediaOptionId);
    if (cover) urlByVariantId.set(entry.variantId, resolveMediaUrl(mediaBaseUrl, cover.storageKey));
  }
  return urlByVariantId;
}
