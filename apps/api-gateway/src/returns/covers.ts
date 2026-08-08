/**
 * TODO-169 (blocker #3) — İade kalemi ürün görseli çözümü (Storefront + Store Admin ORTAK semantiği).
 *
 * BUG-CART-005 — Artık VARYANT-FARKINDA + satın alma anı SNAPSHOT öncelikli (sipariş geçmişiyle AYNI
 * resolver: media/cover.buildOrderLineCoverUrlMap). Öncelik: (1) OrderLine.mediaStorageKey snapshot'i,
 * (2) snapshot yoksa MEVCUT efektif varyant medyası (renk ekseni), (3) ürün birincil kapağı. Anahtar =
 * OrderLine.id (aynı ürünün iki farklı rengi/kalemi FARKLI thumbnail alır — eskiden productId ile
 * çözülünce hepsi ürün-birincil rengine düşüyordu). Sorgu storeId-first scoped: cross-store medya ASLA.
 */
import { prisma } from "@commerce-os/db";
import {
  buildOrderLineCoverUrlMap,
  type OrderLineCoverEntry,
} from "../media/cover.js";

export type { OrderLineCoverEntry } from "../media/cover.js";

/** Prisma-backed ürün görseli çözümü (position asc; storageKey+optionId). */
async function listProductImagesRich(storeId: string, productIds: string[]) {
  const map = new Map<string, Array<{ storageKey: string; position: number; optionId: string | null }>>();
  if (productIds.length === 0) return map;
  const rows = await prisma.productImage.findMany({
    where: { storeId, productId: { in: productIds } },
    orderBy: [{ productId: "asc" }, { position: "asc" }],
    select: { productId: true, position: true, optionId: true, media: { select: { storageKey: true } } },
  });
  for (const row of rows) {
    const record = { storageKey: row.media.storageKey, position: row.position, optionId: row.optionId };
    const existing = map.get(row.productId);
    if (existing) existing.push(record);
    else map.set(row.productId, [record]);
  }
  return map;
}

/** Prisma-backed variant→media-option (renk) çözümü (Faz 2C-7 / ADR-078). */
async function resolveVariantMediaOptions(storeId: string, productId: string, attributeDefinitionId: string) {
  const rows = await prisma.productVariantOptionValue.findMany({
    where: { storeId, attributeDefinitionId, variant: { productId } },
    select: { variantId: true, optionId: true },
  });
  return new Map(rows.map((row) => [row.variantId, row.optionId]));
}

/**
 * OrderLine.id → türetilmiş public kapak URL'i (snapshot → efektif varyant → ürün kapağı).
 * Kapaksız satır haritada YER ALMAZ (çağıran ?? null ile placeholder'a düşer).
 */
export async function resolveReturnItemCovers(
  storeId: string,
  entries: OrderLineCoverEntry[],
  mediaBaseUrl: string | undefined,
): Promise<Map<string, string>> {
  return buildOrderLineCoverUrlMap(
    (sid, pids) => listProductImagesRich(sid, pids),
    (sid, pid, attrId) => resolveVariantMediaOptions(sid, pid, attrId),
    mediaBaseUrl,
    storeId,
    entries,
  );
}
