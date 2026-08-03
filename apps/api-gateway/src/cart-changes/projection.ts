/**
 * TODO-168 (ADR-267) — Cart Change Awareness projeksiyon köprüsü (SAF).
 *
 * Sunucu-otoriter `PublicCart` satırlarını change-engine girdisine çevirir, değişiklikleri hesaplar
 * ve cart projeksiyonuna işler (line.change + cart.changes + özet bayraklar). Kimlik-agnostik: aynı
 * fonksiyon hem anonim (snapshot cookie'den) hem authenticated (snapshot DB'den) yolda kullanılır —
 * tek fark `snapshotByVariant` ile `acked` kümesinin nereden doldurulduğudur. DB/HTTP YOK.
 */
import type {
  PublicCart,
  PublicCartChange,
  PublicCartLine,
  PublicCartLineChange,
  PublicCartLineSnapshot,
} from "@commerce-os/contracts";
import {
  type CartChange,
  type CartChangeLineInput,
  type CartLineProjection,
  type CartLineSnapshot,
  computeCartChanges,
} from "./change-engine.js";

/** UNAVAILABLE satır = satılabilir değil (buildPublicCartLine erken-döner, fiyat 0 taşır). */
export function orderableFromLine(line: PublicCartLine): boolean {
  return line.status !== "UNAVAILABLE";
}

/** Bir satırın GÜNCEL projeksiyonu (change-engine girdisi). */
export function currentProjectionFromLine(line: PublicCartLine): CartLineProjection {
  const orderable = orderableFromLine(line);
  return {
    unitPriceMinor: line.unitPriceMinor,
    listPriceMinor: line.compareAtMinor,
    discountedUnitPriceMinor: line.discountedUnitPriceMinor,
    currency: line.currency,
    inStock: orderable ? line.inStock : false,
    orderable,
    quantityAdjusted: line.status === "QUANTITY_ADJUSTED",
    requestedQuantity: line.quantity,
    availableQuantity: line.availableQuantity,
  };
}

/** Bir satırın add-time REFERANS snapshot'ı (baseline yazımı + karşılaştırma için). */
export function snapshotFromLine(line: PublicCartLine): CartLineSnapshot {
  const orderable = orderableFromLine(line);
  return {
    unitPriceMinor: line.unitPriceMinor,
    listPriceMinor: line.compareAtMinor,
    discountedUnitPriceMinor: line.discountedUnitPriceMinor,
    currency: line.currency,
    inStock: orderable ? line.inStock : false,
    orderable,
  };
}

/** CartChange → satır-seviyesi işaret (variantId düşülür). */
function toLineChange(change: CartChange): PublicCartLineChange {
  return {
    changeType: change.changeType,
    severity: change.severity,
    requiresAction: change.requiresAction,
    blocking: change.blocking,
    oldValueMinor: change.oldValueMinor,
    newValueMinor: change.newValueMinor,
    currency: change.currency,
    fingerprint: change.fingerprint,
    acknowledged: change.acknowledged,
  };
}

export interface AttachChangesResult {
  cart: PublicCart;
  /** Snapshot'ı OLMAYAN satırların güncel referans değerleri (baseline yazımı için). */
  baselines: PublicCartLineSnapshot[];
}

/**
 * Değişiklikleri hesaplayıp cart projeksiyonuna işler. `snapshotByVariant`'ta karşılığı olmayan
 * satırlar için baseline üretilir (çağıran taraf DB'ye/cookie'ye yazar — "ilk güvenilir resolve =
 * baseline"). Değişiklik hesabı SAF/yan-etkisiz; baseline yazımı çağıranın sorumluluğu.
 */
export function attachChangesToCart(
  cart: PublicCart,
  ctx: { storeId: string; cartId: string },
  snapshotByVariant: ReadonlyMap<string, CartLineSnapshot>,
  ackedFingerprints: ReadonlySet<string>,
): AttachChangesResult {
  const inputs: CartChangeLineInput[] = cart.lines.map((line) => ({
    storeId: ctx.storeId,
    cartId: ctx.cartId,
    variantId: line.variantId,
    snapshot: snapshotByVariant.get(line.variantId) ?? null,
    current: currentProjectionFromLine(line),
  }));
  const result = computeCartChanges(inputs, ackedFingerprints);
  const byVariant = new Map<string, CartChange>(result.changes.map((c) => [c.variantId, c]));

  const lines = cart.lines.map((line) => {
    const change = byVariant.get(line.variantId);
    return { ...line, change: change ? toLineChange(change) : null };
  });

  const baselines: PublicCartLineSnapshot[] = cart.lines
    .filter((line) => !snapshotByVariant.has(line.variantId))
    .map((line) => ({ variantId: line.variantId, ...snapshotFromLine(line) }));

  const changes: PublicCartChange[] = result.changes.map((c) => ({ variantId: c.variantId, ...toLineChange(c) }));

  return {
    cart: {
      ...cart,
      lines,
      changes,
      unacknowledgedChangeCount: result.unacknowledgedChangeCount,
      hasBlockingChanges: result.hasBlockingChanges,
      hasWarnings: result.hasWarnings,
      requiresAcknowledgement: result.requiresAcknowledgement,
    },
    baselines,
  };
}

/** DB CartLine snapshot kolonlarından `CartLineSnapshot` (hepsi doluysa; addedAt yoksa null). */
export function snapshotFromDbLine(row: {
  addedUnitPriceMinor: number | null;
  addedListPriceMinor: number | null;
  addedDiscountedUnitPriceMinor: number | null;
  addedCurrency: string | null;
  addedInStock: boolean | null;
  addedOrderable: boolean | null;
  addedAt: Date | null;
}): CartLineSnapshot | null {
  if (row.addedAt == null || row.addedUnitPriceMinor == null || row.addedCurrency == null) return null;
  return {
    unitPriceMinor: row.addedUnitPriceMinor,
    listPriceMinor: row.addedListPriceMinor,
    discountedUnitPriceMinor: row.addedDiscountedUnitPriceMinor,
    currency: row.addedCurrency,
    inStock: row.addedInStock ?? true,
    orderable: row.addedOrderable ?? true,
  };
}
