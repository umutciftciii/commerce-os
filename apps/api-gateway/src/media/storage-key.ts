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
  // TODO-169 (ADR-269) — İade attachment'ları (PRIVATE; public statik servis kapalı).
  RETURN_ATTACHMENT: "returns",
  // TODO-177 (ADR-289) — Destek ticket ekleri (PRIVATE). PDF için değişken uzantı + regex
  // güncellemesi Faz B'de (routes-attachment); segment burada tanımlı olmalı (Record tamlığı).
  SUPPORT_ATTACHMENT: "support",
};

/**
 * TODO-177 (ADR-289) — `ext` opsiyonel (varsayilan "webp", geriye uyumlu: mevcut 3-arg cagrilar
 * degismez). Destek PDF ekleri icin "pdf" gecilir; LocalDiskDriver regex'i webp|pdf kabul eder.
 * Uzanti allowlist'i: yalniz "webp" | "pdf" (arbitrary uzanti kabul edilmez).
 */
export function buildStorageKey(
  storeId: string,
  context: MediaContext,
  uuid: string,
  ext: "webp" | "pdf" = "webp",
): string {
  return `stores/${storeId}/${CONTEXT_SEGMENT[context]}/${uuid}.${ext}`;
}
