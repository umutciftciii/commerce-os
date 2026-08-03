/**
 * TODO-168 (ADR-267) — Cart Change Awareness SAF çekirdeği (DB/HTTP/cookie YOK; kimlik-agnostik).
 *
 * Bir sepet satırının add-time REFERANS snapshot'ı ile GÜNCEL sunucu-otoriter projeksiyonunu
 * karşılaştırıp deterministik değişiklik listesi üretir. Aynı motor hem anonim (cookie meta) hem
 * authenticated (DB CartLine snapshot + CartChangeAck) yolunda kullanılır — TEK fark snapshot ile
 * acknowledged-fingerprint kümesinin NEREDEN geldiğidir; motor, fingerprint formülü, dedupe ve
 * severity çıktısı ikisinde de AYNIDIR (ADR-267 §B.2).
 *
 * Kurallar (ADR-267 §5–§6):
 *  - Deterministik; `now` enjekte edilmez (zaman-bağımsız). Aynı state → aynı fingerprint (idempotent).
 *  - Para karşılaştırması yalnız minor-unit. Currency mismatch fiyat/indirim değişimi ÜRETMEZ
 *    (yalnız yeniden-baseline; FX asla ürün fiyatı değişimi olarak gösterilmez).
 *  - Satır başına TEK birincil değişiklik (severity önceliğiyle): availability > stock > quantity >
 *    discount-presence > base-price. Böylece bir kampanya toggle'ı aynı anda hem PRICE_* hem
 *    DISCOUNT_* olarak çift-sayılmaz.
 *  - Fingerprint = hash(storeId, cartId, variantId, changeType, oldValue, newValue, currency) →
 *    store-scoped (cross-store izolasyon); yeni fiyat değişikliği YENİ fingerprint → eski ack geçersiz.
 *  - Snapshot yoksa (legacy/ilk-resolve): değişiklik ÜRETİLMEZ (sahte geçmiş yok — baseline dışarıda kurulur).
 */
import { createHash } from "node:crypto";

export const CART_CHANGE_TYPES = [
  "PRICE_DECREASED",
  "PRICE_INCREASED",
  "DISCOUNT_STARTED",
  "DISCOUNT_ENDED",
  "VARIANT_OUT_OF_STOCK",
  "VARIANT_BACK_IN_STOCK",
  "PRODUCT_UNAVAILABLE",
  "PRODUCT_AVAILABLE_AGAIN",
  "QUANTITY_ADJUSTED",
] as const;
export type CartChangeType = (typeof CART_CHANGE_TYPES)[number];

export type CartChangeSeverity = "INFO" | "WARN" | "BLOCKING";

const SEVERITY_BY_TYPE: Record<CartChangeType, CartChangeSeverity> = {
  PRICE_DECREASED: "INFO",
  PRICE_INCREASED: "WARN",
  DISCOUNT_STARTED: "INFO",
  DISCOUNT_ENDED: "WARN",
  VARIANT_OUT_OF_STOCK: "BLOCKING",
  VARIANT_BACK_IN_STOCK: "INFO",
  PRODUCT_UNAVAILABLE: "BLOCKING",
  PRODUCT_AVAILABLE_AGAIN: "INFO",
  QUANTITY_ADJUSTED: "BLOCKING",
};

/** Severity sıralama ağırlığı (çıktı listesi en önemli önce). */
const SEVERITY_ORDER: Record<CartChangeSeverity, number> = { BLOCKING: 0, WARN: 1, INFO: 2 };

export function severityOf(changeType: CartChangeType): CartChangeSeverity {
  return SEVERITY_BY_TYPE[changeType];
}
export function isAllowedChangeType(value: string): value is CartChangeType {
  return (CART_CHANGE_TYPES as readonly string[]).includes(value);
}

/**
 * Bir satırın add-time REFERANS değerleri (snapshot). Para minor-unit; availability türetilmiş
 * boolean'lar. `discountedUnitPriceMinor` yalnız o an aktif bir kampanya varsa dolu (< unit).
 */
export interface CartLineSnapshot {
  unitPriceMinor: number;
  listPriceMinor: number | null; // compareAt
  discountedUnitPriceMinor: number | null;
  currency: string;
  inStock: boolean;
  orderable: boolean;
}

/** Bir satırın GÜNCEL sunucu-otoriter projeksiyonu (assemblePublicCart çıktısından türetilir). */
export interface CartLineProjection {
  unitPriceMinor: number;
  listPriceMinor: number | null;
  discountedUnitPriceMinor: number | null;
  currency: string;
  inStock: boolean;
  orderable: boolean;
  /** line.status === "QUANTITY_ADJUSTED" (istenen adet mevcut stoğa göre KISALTILDI). */
  quantityAdjusted: boolean;
  /** QUANTITY_ADJUSTED fingerprint'i için: istenen vs mevcut adet (yoksa 0). */
  requestedQuantity: number;
  availableQuantity: number;
}

export interface CartChangeLineInput {
  storeId: string;
  /** Anon: cookie'de üretilmiş cartId; Auth: Cart.id. */
  cartId: string;
  variantId: string;
  /** Baseline yoksa null → değişiklik üretilmez (baseline bu resolve'da dışarıda kurulur). */
  snapshot: CartLineSnapshot | null;
  current: CartLineProjection;
}

export interface CartChange {
  variantId: string;
  changeType: CartChangeType;
  severity: CartChangeSeverity;
  /** WARN → checkout ack'e kadar 409 CART_CHANGED (INFO/BLOCKING için false). */
  requiresAction: boolean;
  /** BLOCKING → ack yetmez; satır düzeltilmeli (mevcut CART_NOT_READY). */
  blocking: boolean;
  oldValueMinor: number | null;
  newValueMinor: number | null;
  currency: string | null;
  fingerprint: string;
  acknowledged: boolean;
}

export interface ComputeCartChangesResult {
  /** Severity'e göre sıralı (BLOCKING → WARN → INFO); aynı severity'de girdi sırası korunur. */
  changes: CartChange[];
  unacknowledgedChangeCount: number;
  hasBlockingChanges: boolean;
  hasWarnings: boolean;
  /** Ack bekleyen (henüz onaylanmamış) en az bir WARN var mı → checkout WARN gate. */
  requiresAcknowledgement: boolean;
}

export interface FingerprintInput {
  storeId: string;
  cartId: string;
  variantId: string;
  changeType: CartChangeType;
  oldValueMinor: number | null;
  newValueMinor: number | null;
  currency: string | null;
}

/**
 * Deterministik, store-scoped fingerprint. Aynı (mağaza, sepet, varyant, tip, eski, yeni, para)
 * → aynı hash; farklı yeni değer → farklı hash (eski ack geçersiz). Cross-store çakışma yok.
 */
export function fingerprintFor(input: FingerprintInput): string {
  const raw = [
    input.storeId,
    input.cartId,
    input.variantId,
    input.changeType,
    input.oldValueMinor ?? "",
    input.newValueMinor ?? "",
    input.currency ?? "",
  ].join("");
  return createHash("sha256").update(raw).digest("hex").slice(0, 40);
}

/** Bir snapshot/projeksiyonda o an aktif indirim var mı (discounted < unit). */
function hasActiveDiscount(unitPriceMinor: number, discountedUnitPriceMinor: number | null): boolean {
  return discountedUnitPriceMinor != null && discountedUnitPriceMinor < unitPriceMinor;
}

interface RawChange {
  changeType: CartChangeType;
  oldValueMinor: number | null;
  newValueMinor: number | null;
  currency: string | null;
}

/**
 * Satır başına TEK birincil değişikliği severity önceliğiyle seçer (ADR-267 §5). Snapshot null →
 * null (baseline yok). Currency mismatch → yalnız availability/stock/quantity; fiyat/indirim bastırılır.
 */
function detectLineChange(snapshot: CartLineSnapshot | null, current: CartLineProjection): RawChange | null {
  if (!snapshot) return null;

  // 1) Ürün satılabilirliği (orderable) — en yüksek öncelik.
  if (snapshot.orderable && !current.orderable) {
    return { changeType: "PRODUCT_UNAVAILABLE", oldValueMinor: 1, newValueMinor: 0, currency: null };
  }
  if (!snapshot.orderable && current.orderable) {
    return { changeType: "PRODUCT_AVAILABLE_AGAIN", oldValueMinor: 0, newValueMinor: 1, currency: null };
  }
  // Her ikisi de satılabilir değil → değişiklik yok (fiyat/stok anlamsız).
  if (!current.orderable) return null;

  // 2) Stok (yalnız satılabilirken anlamlı).
  if (snapshot.inStock && !current.inStock) {
    return { changeType: "VARIANT_OUT_OF_STOCK", oldValueMinor: 1, newValueMinor: 0, currency: null };
  }
  if (!snapshot.inStock && current.inStock) {
    return { changeType: "VARIANT_BACK_IN_STOCK", oldValueMinor: 0, newValueMinor: 1, currency: null };
  }

  // 3) Sistem-kısaltılmış adet (kullanıcının bilinçli değişikliği DEĞİL — line.status türevi).
  if (current.quantityAdjusted) {
    return {
      changeType: "QUANTITY_ADJUSTED",
      oldValueMinor: current.requestedQuantity,
      newValueMinor: current.availableQuantity,
      currency: null,
    };
  }

  // Currency mismatch: fiyat/indirim hareketini bastır (FX ürün fiyatı değişimi değildir).
  if (snapshot.currency !== current.currency) return null;

  // 4) İndirim varlığı değişimi (base fiyat sabitken kampanya toggle'ı) — PRICE_* ile çift-saymaz.
  const snapDiscount = hasActiveDiscount(snapshot.unitPriceMinor, snapshot.discountedUnitPriceMinor);
  const curDiscount = hasActiveDiscount(current.unitPriceMinor, current.discountedUnitPriceMinor);
  if (!snapDiscount && curDiscount) {
    return {
      changeType: "DISCOUNT_STARTED",
      oldValueMinor: snapshot.unitPriceMinor,
      newValueMinor: current.discountedUnitPriceMinor,
      currency: current.currency,
    };
  }
  if (snapDiscount && !curDiscount) {
    return {
      changeType: "DISCOUNT_ENDED",
      oldValueMinor: snapshot.discountedUnitPriceMinor,
      newValueMinor: current.unitPriceMinor,
      currency: current.currency,
    };
  }

  // 5) Base birim fiyat farkı.
  if (current.unitPriceMinor < snapshot.unitPriceMinor) {
    return {
      changeType: "PRICE_DECREASED",
      oldValueMinor: snapshot.unitPriceMinor,
      newValueMinor: current.unitPriceMinor,
      currency: current.currency,
    };
  }
  if (current.unitPriceMinor > snapshot.unitPriceMinor) {
    return {
      changeType: "PRICE_INCREASED",
      oldValueMinor: snapshot.unitPriceMinor,
      newValueMinor: current.unitPriceMinor,
      currency: current.currency,
    };
  }

  return null;
}

/**
 * Kimlik-agnostik değişiklik hesabı. Girdi: satır snapshot+projeksiyon listesi + acknowledged
 * fingerprint kümesi. Çıktı: severity-sıralı değişiklikler + cart-seviyesi bayraklar. SAF: yan etki yok,
 * yazma yok — aynı state defalarca çağrılsa da aynı sonucu üretir (dedupe fingerprint idempotency'sinden).
 */
export function computeCartChanges(
  lines: readonly CartChangeLineInput[],
  ackedFingerprints: ReadonlySet<string>,
): ComputeCartChangesResult {
  const changes: CartChange[] = [];
  const seen = new Set<string>(); // aynı fingerprint iki kez listelenmez (deterministik dedupe)

  for (const line of lines) {
    const raw = detectLineChange(line.snapshot, line.current);
    if (!raw) continue;
    const severity = SEVERITY_BY_TYPE[raw.changeType];
    const fingerprint = fingerprintFor({
      storeId: line.storeId,
      cartId: line.cartId,
      variantId: line.variantId,
      changeType: raw.changeType,
      oldValueMinor: raw.oldValueMinor,
      newValueMinor: raw.newValueMinor,
      currency: raw.currency,
    });
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    const acknowledged = ackedFingerprints.has(fingerprint);
    changes.push({
      variantId: line.variantId,
      changeType: raw.changeType,
      severity,
      requiresAction: severity === "WARN",
      blocking: severity === "BLOCKING",
      oldValueMinor: raw.oldValueMinor,
      newValueMinor: raw.newValueMinor,
      currency: raw.currency,
      fingerprint,
      acknowledged,
    });
  }

  changes.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  const hasBlockingChanges = changes.some((c) => c.severity === "BLOCKING");
  const hasWarnings = changes.some((c) => c.severity === "WARN");
  const requiresAcknowledgement = changes.some((c) => c.severity === "WARN" && !c.acknowledged);
  const unacknowledgedChangeCount = changes.filter((c) => !c.acknowledged).length;

  return { changes, unacknowledgedChangeCount, hasBlockingChanges, hasWarnings, requiresAcknowledgement };
}

/** Checkout WARN gate: ack bekleyen (onaylanmamış) en az bir WARN değişiklik var mı. */
export function hasUnacknowledgedWarnings(result: ComputeCartChangesResult): boolean {
  return result.requiresAcknowledgement;
}
