/**
 * TODO-152 (ADR-076) — Inventory Engine · VALIDATION (SAF, blocking/warning ayrımı).
 *
 * HEDEF bakiyeyi doğrular. Blocking (apply'ı toptan reddeder): negatif alan (onHand/reserved/incoming/
 * safetyStock/reorderPoint), overflow. Warning (apply'ı ENGELLEMEZ; UI'da görünür): tükendi, negatif
 * satılabilir, yeniden-sipariş/güvenlik altında, yüksek rezerve oranı, ciddi düşüş, gelen stok yok,
 * archived/draft, yeni balance. Preview ve apply AYNI pipeline'ı kullanır. Prisma/DB/Date/random BİLMEZ.
 */

import { computeAvailability } from "./availability.js";
import { reservedRatioPct } from "./calculator.js";
import type { InventoryIssueCode, InventoryLimits, InventoryState, VariantStatus } from "./types.js";

export interface ValidationContext {
  status: VariantStatus;
  /** Bu satırda gerçek bir değişim var mı (bağlamsal LARGE_DECREASE uyarısını yalnız değişimde ver). */
  changed: boolean;
  /** Seçili depoda bu varyantın balance kaydı yok mu (apply'da oluşacak). */
  newBalance: boolean;
  limits: InventoryLimits;
}

/**
 * Hedef durumu doğrula → tüm issue kodları (blocking + warning karışık; sınıflandırma
 * BLOCKING_ISSUE_CODES ile üst katmanda). Deterministik sıra.
 */
export function validateTarget(
  current: InventoryState,
  target: InventoryState,
  ctx: ValidationContext,
): InventoryIssueCode[] {
  const issues: InventoryIssueCode[] = [];
  const { limits } = ctx;

  // ── Blocking: negatif alanlar ──
  if (target.onHand < 0) issues.push("NEGATIVE_ON_HAND");
  if (target.reserved < 0) issues.push("NEGATIVE_RESERVED");
  if (target.incoming < 0) issues.push("NEGATIVE_INCOMING");
  if (target.safetyStock < 0) issues.push("NEGATIVE_SAFETY_STOCK");
  if (target.reorderPoint < 0) issues.push("NEGATIVE_REORDER_POINT");

  // ── Blocking: overflow ──
  const overflow =
    target.onHand > limits.maxQuantity ||
    target.reserved > limits.maxQuantity ||
    target.incoming > limits.maxQuantity ||
    target.safetyStock > limits.maxQuantity ||
    target.reorderPoint > limits.maxQuantity;
  if (overflow) issues.push("OVERFLOW");

  // ── Warning: availability ilişkileri (negatif alan yoksa anlamlı) ──
  if (target.onHand >= 0 && target.reserved >= 0 && target.safetyStock >= 0) {
    const { rawAvailable, sellableAvailable } = computeAvailability(target);
    if (rawAvailable < 0) issues.push("NEGATIVE_AVAILABLE");
    if (sellableAvailable === 0) issues.push("OUT_OF_STOCK");
    if (target.reorderPoint > 0 && sellableAvailable <= target.reorderPoint) {
      issues.push("BELOW_REORDER_POINT");
    }
    if (target.safetyStock > 0 && target.onHand - target.reserved <= target.safetyStock) {
      issues.push("BELOW_SAFETY_STOCK");
    }
    const ratio = reservedRatioPct(target);
    if (ratio != null && ratio >= limits.highReservedRatioPct) issues.push("HIGH_RESERVED_RATIO");
    if (sellableAvailable === 0 && target.incoming === 0) issues.push("NO_INCOMING");
  }

  // ── Warning: bağlamsal (yalnız değişimde) ──
  if (ctx.changed && current.onHand > 0 && target.onHand < current.onHand) {
    const decreasePct = ((current.onHand - target.onHand) / current.onHand) * 100;
    if (decreasePct >= limits.largeDecreasePct) issues.push("LARGE_DECREASE");
  }

  // ── Warning: statü / yeni kayıt ──
  if (ctx.newBalance) issues.push("NEW_BALANCE");
  if (ctx.status === "ARCHIVED") issues.push("ARCHIVED_VARIANT");
  else if (ctx.status === "DRAFT") issues.push("DRAFT_VARIANT");

  return issues;
}
