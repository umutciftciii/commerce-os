/**
 * TODO-174B.2 — Order Experience Recovery için paylaşılan i18n etiket modülü.
 *
 * TEK KURAL: Ham enum ASLA UI'a çıkmaz. Liste + detay sayfaları buradan besnenir (çift tanım yok).
 * Bilinen tüm enum değerleri map'te; bilinmeyen (ileride eklenen) değer defansif olarak okunur biçime
 * çevrilir, ham SNAKE_CASE gösterilmez.
 */

export type Tone = "neutral" | "success" | "warning" | "info" | "danger";

const pick = (v: [string, string] | undefined, tr: boolean, fallback: string): string =>
  v ? (tr ? v[0] : v[1]) : fallback;

/** SNAKE_CASE / kebab → "Okunur Biçim" (bilinmeyen kod defansif fallback'i). */
function humanize(code: string): string {
  return code
    .toLowerCase()
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const STATUS: Record<string, [string, string]> = {
  OPEN: ["Açık", "Open"],
  ASSIGNED: ["Atandı", "Assigned"],
  CONTACT_ATTEMPTED: ["İletişim denendi", "Contact attempted"],
  CUSTOMER_REACHED: ["Müşteriye ulaşıldı", "Customer reached"],
  ACTION_REQUIRED: ["Aksiyon gerekli", "Action required"],
  RESOLVED: ["Çözüldü", "Resolved"],
  CLOSED: ["Kapatıldı", "Closed"],
  UNREACHABLE: ["Ulaşılamadı", "Unreachable"],
  NO_ACTION_REQUIRED: ["Aksiyon gerekmez", "No action"],
};

const STATUS_TONE: Record<string, Tone> = {
  OPEN: "warning",
  ASSIGNED: "info",
  CONTACT_ATTEMPTED: "info",
  CUSTOMER_REACHED: "info",
  ACTION_REQUIRED: "warning",
  RESOLVED: "success",
  CLOSED: "neutral",
  UNREACHABLE: "danger",
  NO_ACTION_REQUIRED: "neutral",
};

/** Aktif olmayan (sonuçlanmış) case statüleri — SLA "Tamamlandı" için. */
const TERMINAL_STATUSES = new Set(["RESOLVED", "CLOSED", "UNREACHABLE", "NO_ACTION_REQUIRED"]);

const PRIORITY: Record<string, [string, string]> = {
  HIGH: ["Yüksek", "High"],
  MEDIUM: ["Orta", "Medium"],
  LOW: ["Düşük", "Low"],
};

const ACTIVITY_TYPE: Record<string, [string, string]> = {
  ASSIGNED: ["Atandı", "Assigned"],
  CONTACT_CALL: ["Telefonla arandı", "Called"],
  CONTACT_EMAIL: ["E-posta gönderildi", "Emailed"],
  UNREACHABLE: ["Müşteriye ulaşılamadı", "Unreachable"],
  ISSUE_HEARD: ["Sorun dinlendi", "Issue heard"],
  ACTION_REQUIRED: ["Aksiyon gerekli", "Action required"],
  GOODWILL_CREDIT: ["Alışveriş bakiyesi tanımlandı", "Shopping credit granted"],
  RESOLVED: ["Çözüldü", "Resolved"],
  CLOSED: ["Kapatıldı", "Closed"],
  NOTE: ["Dahili not", "Internal note"],
};

const OUTCOME: Record<string, [string, string]> = {
  ISSUE_RESOLVED: ["Sorun çözüldü", "Issue resolved"],
  APOLOGY_ACCEPTED: ["Özür kabul edildi", "Apology accepted"],
  REFUND_QUESTION: ["İade sorusu", "Refund question"],
  DELIVERY_COMPLAINT: ["Teslimat şikâyeti", "Delivery complaint"],
  PRICE_COMPLAINT: ["Fiyat şikâyeti", "Price complaint"],
  PRODUCT_EXPECTATION_MISMATCH: ["Ürün beklentisi uyuşmadı", "Product expectation mismatch"],
  CUSTOMER_UNREACHABLE: ["Müşteriye ulaşılamadı", "Customer unreachable"],
  CUSTOMER_DECLINED: ["Müşteri reddetti", "Customer declined"],
  OTHER: ["Diğer", "Other"],
};

const RESOLUTION: Record<string, [string, string]> = {
  GOODWILL_CREDIT: ["Alışveriş bakiyesi", "Shopping credit"],
  APOLOGY: ["Özür", "Apology"],
  REFUND_FOLLOWUP: ["İade takibi", "Refund follow-up"],
  NO_ACTION: ["Aksiyon yok", "No action"],
  OTHER: ["Diğer", "Other"],
};

// OrderCancellationReason (schema/contracts) taksonomisi — ham enum UI'a çıkmaz.
const CANCEL_REASON: Record<string, [string, string]> = {
  WRONG_PRODUCT: ["Yanlış ürün", "Wrong product"],
  WRONG_VARIANT_SIZE_COLOR: ["Yanlış beden/renk", "Wrong variant"],
  WRONG_QUANTITY: ["Yanlış adet", "Wrong quantity"],
  DUPLICATE_ORDER: ["Yinelenen sipariş", "Duplicate order"],
  ACCIDENTAL_ORDER: ["Yanlışlıkla sipariş", "Accidental order"],
  FOUND_CHEAPER_ELSEWHERE: ["Daha ucuzunu buldu", "Found cheaper elsewhere"],
  COUPON_DISCOUNT_NOT_AS_EXPECTED: ["İndirim beklendiği gibi değil", "Discount not as expected"],
  TOTAL_PRICE_TOO_HIGH: ["Toplam fiyat yüksek", "Total price too high"],
  DELIVERY_ESTIMATE_TOO_LONG: ["Teslimat süresi uzun", "Delivery estimate too long"],
  SHIPPING_FEE_TOO_HIGH: ["Kargo ücreti yüksek", "Shipping fee too high"],
  WILL_NOT_ARRIVE_IN_TIME: ["Zamanında gelmeyecek", "Won't arrive in time"],
  WRONG_PAYMENT_METHOD: ["Yanlış ödeme yöntemi", "Wrong payment method"],
  INSTALLMENT_OR_PAYMENT_OPTION_UNSUITABLE: ["Ödeme seçeneği uygun değil", "Payment option unsuitable"],
  PAYMENT_CONCERN: ["Ödeme kaygısı", "Payment concern"],
  NO_LONGER_NEEDED: ["Artık gerekmiyor", "No longer needed"],
  CHANGED_MIND: ["Fikir değişikliği", "Changed mind"],
  PREFER_DIFFERENT_PRODUCT: ["Farklı ürün tercihi", "Prefer different product"],
  OTHER: ["Diğer", "Other"],
};

/** Filtre dropdown'u için tüm recovery status değerleri (map ile tek kaynak). */
export const recoveryStatusKeys: string[] = Object.keys(STATUS_TONE);

const ORDER_STATUS: Record<string, [string, string]> = {
  DRAFT: ["Taslak", "Draft"],
  PLACED: ["Oluşturuldu", "Placed"],
  CONFIRMED: ["Onaylandı", "Confirmed"],
  CANCELLED: ["İptal edildi", "Cancelled"],
  FULFILLED: ["Tamamlandı", "Fulfilled"],
};

const PAYMENT_STATUS: Record<string, [string, string]> = {
  UNPAID: ["Ödenmedi", "Unpaid"],
  PAYMENT_PENDING: ["Ödeme bekleniyor", "Payment pending"],
  AUTHORIZED: ["Provizyon alındı", "Authorized"],
  PAID: ["Ödendi", "Paid"],
  PARTIALLY_REFUNDED: ["Kısmen iade edildi", "Partially refunded"],
  REFUNDED: ["İade edildi", "Refunded"],
  PAYMENT_FAILED: ["Ödeme başarısız", "Payment failed"],
  CANCELLED: ["İptal edildi", "Cancelled"],
};

export const orderStatusLabel = (status: string, tr: boolean): string =>
  pick(ORDER_STATUS[status], tr, humanize(status));
export const paymentStatusLabel = (status: string, tr: boolean): string =>
  pick(PAYMENT_STATUS[status], tr, humanize(status));

export const recoveryStatusLabel = (status: string, tr: boolean): string =>
  pick(STATUS[status], tr, humanize(status));
export const recoveryStatusTone = (status: string): Tone => STATUS_TONE[status] ?? "neutral";
export const priorityLabel = (priority: string, tr: boolean): string =>
  pick(PRIORITY[priority], tr, humanize(priority));
export const activityTypeLabel = (type: string, tr: boolean): string =>
  pick(ACTIVITY_TYPE[type], tr, humanize(type));
export const outcomeLabel = (outcome: string, tr: boolean): string =>
  pick(OUTCOME[outcome], tr, humanize(outcome));
export const resolutionLabel = (resolution: string, tr: boolean): string =>
  pick(RESOLUTION[resolution], tr, humanize(resolution));
export const cancelReasonLabel = (code: string | null | undefined, tr: boolean): string =>
  code ? pick(CANCEL_REASON[code], tr, humanize(code)) : "—";

export type SlaStateKind = "INSIDE" | "DUE_TODAY" | "OVERDUE" | "DONE";
export interface SlaStateResult {
  state: SlaStateKind;
  label: string;
  tone: Tone;
}

/** Aynı takvim gününde mi (yerel). */
function isSameDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

/**
 * SLA durumu: terminal → Tamamlandı; overdue → Gecikti; aynı gün → Bugün bitiyor; diğer → SLA içinde.
 * List + detail tutarlı tek kaynak.
 */
export function slaState(
  recovery: { status: string; dueAt: string; overdue: boolean },
  nowMs: number,
  tr = true,
): SlaStateResult {
  if (TERMINAL_STATUSES.has(recovery.status)) {
    return { state: "DONE", label: tr ? "Tamamlandı" : "Completed", tone: "success" };
  }
  if (recovery.overdue) {
    return { state: "OVERDUE", label: tr ? "Gecikti" : "Overdue", tone: "danger" };
  }
  const dueMs = new Date(recovery.dueAt).getTime();
  if (isSameDay(dueMs, nowMs)) {
    return { state: "DUE_TODAY", label: tr ? "Bugün bitiyor" : "Due today", tone: "warning" };
  }
  return { state: "INSIDE", label: tr ? "SLA içinde" : "Within SLA", tone: "neutral" };
}
