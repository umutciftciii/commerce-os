/**
 * TODO-169 (blocker #3) — İade kalemi ürün görseli çözümü (Storefront + Store Admin ORTAK semantiği).
 *
 * OrderLine'da immutable media snapshot YOK (schema audit); bu nedenle görsel, AYNI store'un güncel
 * ürün kapak görselinden (ProductImage, position asc, ürün başına ilk) türetilir → yoksa null
 * (çağıran ortak placeholder'a düşer). Sorgu storeId-first scoped: cross-store medya ASLA gösterilmez.
 * Müşteri (routes-customer) ve admin (routes-admin) bu tek helper'ı paylaşır (aynı thumbnail semantiği).
 */
import { prisma } from "@commerce-os/db";
import { resolveMediaUrl } from "../media/url.js";

/** productId → türetilmiş public kapak URL'i. Kapaksız ürün haritada YER ALMAZ (çağıran ?? null). */
export async function resolveReturnItemCovers(
  storeId: string,
  productIds: string[],
  mediaBaseUrl: string | undefined,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(productIds)];
  if (unique.length === 0) return map;
  const images = await prisma.productImage.findMany({
    where: { storeId, productId: { in: unique } },
    orderBy: { position: "asc" },
    select: { productId: true, media: { select: { storageKey: true } } },
  });
  for (const img of images) {
    if (!map.has(img.productId)) {
      map.set(img.productId, resolveMediaUrl(mediaBaseUrl, img.media.storageKey));
    }
  }
  return map;
}
