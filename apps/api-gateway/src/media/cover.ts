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
