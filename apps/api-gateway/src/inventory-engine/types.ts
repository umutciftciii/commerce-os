/**
 * TODO-152 (ADR-076) — Inventory Engine · TİPLER (SAF).
 *
 * Varyantların depo-bazlı stoğunu (onHand/reserved/incoming/safetyStock/reorderPoint) preview-first
 * + toplu yöneten motorun ortak sözleşmesi. Bu dosya Prisma/DB/HTTP/Date/Math.random BİLMEZ; yalnız
 * tip/enum/sabit tanımlar.
 *
 * Miktar modeli: tüm değerler NON-NEGATIVE INTEGER adet (float YOK). `available` TÜRETİLİR (persist
 * edilmez): available = onHand − reserved − safetyStock. `incoming` availability'ye DAHİL DEĞİL.
 * `reserved` SİSTEM-kontrollüdür (kullanıcı düzenlemez) → düzenlenebilir alan enum'unda YOKTUR.
 */

/** Kullanıcı-düzenlenebilir bakiye alanları (rule hedefi + direct-edit + audit alanı). reserved YOK. */
export type InventoryField = "ON_HAND" | "INCOMING" | "SAFETY_STOCK" | "REORDER_POINT";

export const INVENTORY_FIELDS: readonly InventoryField[] = [
  "ON_HAND",
  "INCOMING",
  "SAFETY_STOCK",
  "REORDER_POINT",
] as const;

/** Bir varyantın bir depodaki stok durumu (SAF). Tüm alanlar non-negative integer adet. */
export interface InventoryState {
  /** Depoda fiziksel olarak bulunan toplam stok. */
  onHand: number;
  /** Siparişler için ayrılmış (sistem-kontrollü; kullanıcı düzenlemez). */
  reserved: number;
  /** Beklenen, henüz ulaşmamış stok (satışa açık DEĞİL). */
  incoming: number;
  /** Satışa kapalı tutulan minimum stok. */
  safetyStock: number;
  /** Satılabilir stok bu seviyeye inince yeniden-tedarik uyarısı. */
  reorderPoint: number;
}

/** Stok durum kovaları (renk tek başına anlam taşımaz; bu enum kaynaktır). */
export type InventoryStockStatus =
  | "IN_STOCK"
  | "LOW_STOCK"
  | "OUT_OF_STOCK"
  | "INCOMING"
  | "NEGATIVE"
  | "NO_BALANCE";

/** Yalnız-okunur hesaplanan göstergeler (persist edilmez). */
export interface InventoryCalc {
  /** onHand − reserved − safetyStock (negatif OLABİLİR; gösterim/uyarı). */
  rawAvailable: number;
  /** max(0, rawAvailable) — satışa açık miktar. */
  sellableAvailable: number;
  /** reserved / onHand yüzdesi (onHand ≤ 0 → null). */
  reservedRatioPct: number | null;
  status: InventoryStockStatus;
}

/** Bulk operasyon türleri (structured contract — serbest metin/eval YOK). */
export type InventoryOperation = "SET_ABSOLUTE" | "INCREASE" | "DECREASE";

/**
 * Yapısal bulk rule (tek alan, tek operasyon, tek non-negative amount).
 * - SET_ABSOLUTE: alan = amount (0 dahil → "stoğu sıfırla").
 * - INCREASE: alan += amount.
 * - DECREASE: alan −= amount (sonuç < 0 → blocking NEGATIVE_*).
 */
export interface InventoryRule {
  targetField: InventoryField;
  operation: InventoryOperation;
  amount: number;
}

/** Direct-edit: bir varyanta hedef alan değerleri (verilmeyen alan = dokunma; reserved YOK). */
export interface InventoryDirectEdit {
  variantId: string;
  onHand?: number;
  incoming?: number;
  safetyStock?: number;
  reorderPoint?: number;
}

export type VariantStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";

/** Motorun her varyant için gördüğü salt-okuma girdi (servis sıralar/okur). */
export interface InventoryVariantInput {
  variantId: string;
  sku: string;
  title: string;
  status: VariantStatus;
  /** attribute code → görünür etiket (UI satırı için; motor mantığında kullanılmaz). */
  attributes: { code: string; label: string }[];
  current: InventoryState;
  /** Bu varyantın seçili depoda gerçek bir balance kaydı var mı (false → sanal 0 satır). */
  balanceExists: boolean;
}

/** Stable tanı kodları — blocking apply'ı toptan reddeder; warning etmez. */
export type InventoryIssueCode =
  // ── Blocking ──
  | "NEGATIVE_ON_HAND"
  | "NEGATIVE_RESERVED"
  | "NEGATIVE_INCOMING"
  | "NEGATIVE_SAFETY_STOCK"
  | "NEGATIVE_REORDER_POINT"
  | "OVERFLOW"
  // ── Warning ──
  | "OUT_OF_STOCK"
  | "NEGATIVE_AVAILABLE"
  | "BELOW_REORDER_POINT"
  | "BELOW_SAFETY_STOCK"
  | "HIGH_RESERVED_RATIO"
  | "LARGE_DECREASE"
  | "NO_INCOMING"
  | "ARCHIVED_VARIANT"
  | "DRAFT_VARIANT"
  | "NEW_BALANCE";

/** Blocking kod kümesi (apply'ı reddeder). Kalanlar warning (apply'ı engellemez). */
export const BLOCKING_ISSUE_CODES: ReadonlySet<InventoryIssueCode> = new Set<InventoryIssueCode>([
  "NEGATIVE_ON_HAND",
  "NEGATIVE_RESERVED",
  "NEGATIVE_INCOMING",
  "NEGATIVE_SAFETY_STOCK",
  "NEGATIVE_REORDER_POINT",
  "OVERFLOW",
]);

/** Motor sınırları (overflow tavanı + uyarı eşikleri). Postgres `Int` (2^31−1) altı. */
export interface InventoryLimits {
  /** Adet tavanı. Postgres `Int` 2^31−1 altında güvenli tavan. */
  maxQuantity: number;
  /** "Yüksek rezerve oranı" uyarı eşiği (yüzde). */
  highReservedRatioPct: number;
  /** "Ciddi stok düşüşü" uyarı eşiği (onHand yüzde, mutlak). */
  largeDecreasePct: number;
}

export const DEFAULT_INVENTORY_LIMITS: InventoryLimits = {
  maxQuantity: 1_000_000_000, // 1 milyar adet (Int32 tavanının ~%47'si — güvenli)
  highReservedRatioPct: 80,
  largeDecreasePct: 50,
};
