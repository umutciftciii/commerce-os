import type { MediaContext } from "@prisma/client";

/**
 * ADR-065 — storageKey uretimi (Faz 1). Path'te entityId YOKTUR (Adim 1/2 karari):
 * entity baglama tamamen DB iliskisiyle yapilir, dosya tasima gerekmez.
 *
 * Format: stores/{storeId}/{context-segment}/{uuid}.webp
 * (products/categories cogul, hero/branding tekil — LocalDiskDriver regex'iyle uyumlu.)
 *
 * storageKey'i DAIMA sunucu uretir; client'tan asla path/key kabul edilmez.
 */
const CONTEXT_SEGMENT: Record<MediaContext, string> = {
  PRODUCT: "products",
  CATEGORY: "categories",
  HERO: "hero",
  BRANDING: "branding",
};

export function buildStorageKey(storeId: string, context: MediaContext, uuid: string): string {
  return `stores/${storeId}/${CONTEXT_SEGMENT[context]}/${uuid}.webp`;
}
