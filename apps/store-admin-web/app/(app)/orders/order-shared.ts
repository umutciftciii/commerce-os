import type {
  Order,
  OrderFulfillmentDisplay,
  ReturnStatusValue,
  ReturnResolutionTypeValue,
  ReturnReasonValue,
  AdminReturnItem,
  OrderRefundStatusValue,
  RefundOriginValue,
} from "@commerce-os/api-client";

export type Tone = "neutral" | "success" | "warning" | "info" | "danger";
export type OrderStatus = Order["status"];
export type PaymentStatus = Order["paymentStatus"];
export type FulfillmentStatus = Order["fulfillmentStatus"];
export type ReservationStatus = Order["reservations"][number]["status"];

export const ORDER_STATUS_TONES: Record<OrderStatus, Tone> = {
  DRAFT: "neutral",
  PLACED: "info",
  CONFIRMED: "success",
  CANCELLED: "danger",
  FULFILLED: "success",
};

export const PAYMENT_STATUS_TONES: Record<PaymentStatus, Tone> = {
  UNPAID: "warning",
  // TODO-159F — genişletilmiş ödeme durum makinesi.
  PAYMENT_PENDING: "info",
  AUTHORIZED: "info",
  PAID: "success",
  PARTIALLY_REFUNDED: "warning",
  REFUNDED: "neutral",
  PAYMENT_FAILED: "danger",
  CANCELLED: "danger",
};

export const FULFILLMENT_STATUS_TONES: Record<FulfillmentStatus, Tone> = {
  UNFULFILLED: "neutral",
  PARTIAL: "warning",
  FULFILLED: "success",
  CANCELLED: "danger",
};

// TODO-135 — Kargo hazırlık durumundan türetilen GÖSTERİM rozeti tonları. Rozet
// metni `getOrderFulfillmentDisplay` sonucuna göre i18n `fulfillmentDisplayLabels`
// üzerinden çözülür (Order.fulfillmentStatus MUTATE EDİLMEZ).
export const FULFILLMENT_DISPLAY_TONES: Record<OrderFulfillmentDisplay, Tone> = {
  NOT_SHIPPED: "neutral",
  AWAITING_PICKUP: "info",
  PACKED: "info",
  IN_TRANSIT: "info",
  OUT_FOR_DELIVERY: "info",
  DELIVERED: "success",
  FULFILLED: "success",
  PARTIAL: "warning",
  CANCELLED: "danger",
};

export const RESERVATION_STATUS_TONES: Record<ReservationStatus, Tone> = {
  ACTIVE: "info",
  RELEASED: "neutral",
  CONSUMED: "success",
  // H-3 (ADR-189) — TTL süpürücü tarafından bırakılan rezervasyon.
  EXPIRED: "warning",
};

// Yasam dongusu kurallari (backend nihai otorite; UI yalniz uygun aksiyonu gosterir).
export function canPlace(order: Order): boolean {
  return order.status === "DRAFT";
}
export function canCancel(order: Order): boolean {
  return order.status === "PLACED" || order.status === "CONFIRMED";
}

/* ── TODO-169 (ADR-269) — İade yönetimi ortak sözlükleri ───────────────────────────
 * Ton yalnız GÖSTERGE'dir; tek başına sinyal değildir (metin etiketi her zaman görünür).
 * Etiketler paylaşılan @commerce-os/i18n'e dokunmadan yerel TR/EN (store-nav precedent).
 */
export type ReturnStatus = ReturnStatusValue;
export type ReturnResolutionType = ReturnResolutionTypeValue;
export type ReturnReason = ReturnReasonValue;
export type ReturnConditionStatus = NonNullable<AdminReturnItem["conditionStatus"]>;
export type ReturnInspectionResult = NonNullable<AdminReturnItem["inspectionResult"]>;
export type ReturnRestockDecision = NonNullable<AdminReturnItem["restockDecision"]>;

export const RETURN_STATUS_TONES: Record<ReturnStatus, Tone> = {
  REQUESTED: "info",
  UNDER_REVIEW: "info",
  PARTIALLY_APPROVED: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  AWAITING_SHIPMENT: "warning",
  RETURN_SHIPPED: "info",
  RECEIVED: "info",
  INSPECTION_REQUIRED: "warning",
  INSPECTED: "info",
  REFUND_PENDING: "warning",
  REPLACEMENT_PENDING: "warning",
  COMPLETED: "success",
  CANCELLED_BY_CUSTOMER: "neutral",
  EXPIRED: "neutral",
  CLOSED: "neutral",
};

export const RETURN_RESOLUTION_TONES: Record<ReturnResolutionType, Tone> = {
  REFUND_TO_ORIGINAL_PAYMENT: "info",
  REPLACEMENT: "success",
};

// Neden tonu: kusur/hasar/yanlış ürün → danger (dikkat); geri kalan nötr/uyarı. Yalnız gösterge.
export const RETURN_REASON_TONES: Record<ReturnReason, Tone> = {
  NO_LONGER_NEEDED: "neutral",
  ORDERED_BY_MISTAKE: "neutral",
  BETTER_PRICE_AVAILABLE: "neutral",
  NOT_AS_DESCRIBED: "warning",
  WRONG_ITEM_RECEIVED: "danger",
  DEFECTIVE_OR_NOT_WORKING: "danger",
  DAMAGED_PRODUCT: "danger",
  DAMAGED_PACKAGING: "warning",
  MISSING_PARTS_OR_ACCESSORIES: "warning",
  QUALITY_NOT_EXPECTED: "warning",
  SIZE_OR_FIT_ISSUE: "neutral",
  DELIVERY_TOO_LATE: "warning",
  UNAUTHORIZED_PURCHASE: "danger",
  OTHER: "neutral",
};

type Bi = { tr: string; en: string };
function pick(locale: string, label: Bi): string {
  return locale === "tr" ? label.tr : label.en;
}

const RETURN_STATUS_LABELS: Record<ReturnStatus, Bi> = {
  REQUESTED: { tr: "Talep edildi", en: "Requested" },
  UNDER_REVIEW: { tr: "İncelemede", en: "Under review" },
  PARTIALLY_APPROVED: { tr: "Kısmen onaylandı", en: "Partially approved" },
  APPROVED: { tr: "Onaylandı", en: "Approved" },
  REJECTED: { tr: "Reddedildi", en: "Rejected" },
  AWAITING_SHIPMENT: { tr: "Gönderim bekleniyor", en: "Awaiting shipment" },
  RETURN_SHIPPED: { tr: "Kargoya verildi", en: "Return shipped" },
  RECEIVED: { tr: "Teslim alındı", en: "Received" },
  INSPECTION_REQUIRED: { tr: "İnceleme gerekli", en: "Inspection required" },
  INSPECTED: { tr: "İncelendi", en: "Inspected" },
  REFUND_PENDING: { tr: "İade bekliyor", en: "Refund pending" },
  REPLACEMENT_PENDING: { tr: "Değişim bekliyor", en: "Replacement pending" },
  COMPLETED: { tr: "Tamamlandı", en: "Completed" },
  CANCELLED_BY_CUSTOMER: { tr: "Müşteri iptal etti", en: "Cancelled by customer" },
  EXPIRED: { tr: "Süresi doldu", en: "Expired" },
  CLOSED: { tr: "Kapatıldı", en: "Closed" },
};

const RETURN_RESOLUTION_LABELS: Record<ReturnResolutionType, Bi> = {
  REFUND_TO_ORIGINAL_PAYMENT: { tr: "Orijinal ödemeye iade", en: "Refund to original payment" },
  REPLACEMENT: { tr: "Değişim", en: "Replacement" },
};

const RETURN_REASON_LABELS: Record<ReturnReason, Bi> = {
  NO_LONGER_NEEDED: { tr: "Artık ihtiyaç yok", en: "No longer needed" },
  ORDERED_BY_MISTAKE: { tr: "Yanlışlıkla sipariş", en: "Ordered by mistake" },
  BETTER_PRICE_AVAILABLE: { tr: "Daha iyi fiyat bulundu", en: "Better price available" },
  NOT_AS_DESCRIBED: { tr: "Açıklamaya uymuyor", en: "Not as described" },
  WRONG_ITEM_RECEIVED: { tr: "Yanlış ürün geldi", en: "Wrong item received" },
  DEFECTIVE_OR_NOT_WORKING: { tr: "Kusurlu / çalışmıyor", en: "Defective or not working" },
  DAMAGED_PRODUCT: { tr: "Hasarlı ürün", en: "Damaged product" },
  DAMAGED_PACKAGING: { tr: "Hasarlı ambalaj", en: "Damaged packaging" },
  MISSING_PARTS_OR_ACCESSORIES: { tr: "Eksik parça / aksesuar", en: "Missing parts or accessories" },
  QUALITY_NOT_EXPECTED: { tr: "Beklenen kalitede değil", en: "Quality not expected" },
  SIZE_OR_FIT_ISSUE: { tr: "Beden / uyum sorunu", en: "Size or fit issue" },
  DELIVERY_TOO_LATE: { tr: "Teslimat çok geç", en: "Delivery too late" },
  UNAUTHORIZED_PURCHASE: { tr: "Yetkisiz satın alma", en: "Unauthorized purchase" },
  OTHER: { tr: "Diğer", en: "Other" },
};

const RETURN_CONDITION_LABELS: Record<ReturnConditionStatus, Bi> = {
  NEW_UNOPENED: { tr: "Yeni / açılmamış", en: "New / unopened" },
  OPENED_UNUSED: { tr: "Açılmış / kullanılmamış", en: "Opened / unused" },
  USED: { tr: "Kullanılmış", en: "Used" },
  DAMAGED: { tr: "Hasarlı", en: "Damaged" },
};

const RETURN_INSPECTION_LABELS: Record<ReturnInspectionResult, Bi> = {
  PASSED: { tr: "Geçti", en: "Passed" },
  FAILED: { tr: "Kaldı", en: "Failed" },
  PARTIAL: { tr: "Kısmi", en: "Partial" },
};

const RETURN_RESTOCK_LABELS: Record<ReturnRestockDecision, Bi> = {
  RESTOCK_AS_SELLABLE: { tr: "Satılabilir stoğa al", en: "Restock as sellable" },
  RESTOCK_AS_DAMAGED: { tr: "Hasarlı stoğa al", en: "Restock as damaged" },
  DO_NOT_RESTOCK: { tr: "Stoğa alma", en: "Do not restock" },
  RETURN_TO_VENDOR: { tr: "Tedarikçiye iade", en: "Return to vendor" },
  DISPOSE: { tr: "İmha et", en: "Dispose" },
};

export const RETURN_STATUS_VALUES = Object.keys(RETURN_STATUS_LABELS) as ReturnStatus[];
export const RETURN_RESOLUTION_VALUES = Object.keys(RETURN_RESOLUTION_LABELS) as ReturnResolutionType[];
export const RETURN_REASON_VALUES = Object.keys(RETURN_REASON_LABELS) as ReturnReason[];
export const RETURN_CONDITION_VALUES = Object.keys(RETURN_CONDITION_LABELS) as ReturnConditionStatus[];
export const RETURN_INSPECTION_VALUES = Object.keys(RETURN_INSPECTION_LABELS) as ReturnInspectionResult[];
export const RETURN_RESTOCK_VALUES = Object.keys(RETURN_RESTOCK_LABELS) as ReturnRestockDecision[];

/* ── TODO-174 (ADR-275/278) — İptal taksonomisi ortak sözlükleri ────────────────────
 * Sipariş iptal provenance'ı (kaynak + kategori + neden) store-admin görünürlüğü.
 * Tipler `Order` alanlarından türetilir (api-client sınırı korunur; contracts'a doğrudan
 * bağlanılmaz — ReturnConditionStatus deseniyle aynı). Etiketler yerel TR/EN.
 */
export type OrderCancellationSource = NonNullable<Order["cancelSource"]>;
export type OrderCancellationReasonCategory = NonNullable<Order["cancelReasonCategory"]>;
export type OrderCancellationReason = NonNullable<Order["cancelReasonCode"]>;

const CANCELLATION_SOURCE_LABELS: Record<OrderCancellationSource, Bi> = {
  CUSTOMER: { tr: "Müşteri", en: "Customer" },
  ADMIN: { tr: "Yönetici", en: "Admin" },
  SYSTEM: { tr: "Sistem", en: "System" },
};

const CANCELLATION_REASON_CATEGORY_LABELS: Record<OrderCancellationReasonCategory, Bi> = {
  ORDER_MISTAKE: { tr: "Sipariş hatası", en: "Order mistake" },
  PRICE_PROMOTION: { tr: "Fiyat & promosyon", en: "Price & promotion" },
  DELIVERY: { tr: "Teslimat", en: "Delivery" },
  PAYMENT: { tr: "Ödeme", en: "Payment" },
  PRODUCT_DECISION: { tr: "Ürün kararı", en: "Product decision" },
  OTHER: { tr: "Diğer", en: "Other" },
};

const CANCELLATION_REASON_LABELS: Record<OrderCancellationReason, Bi> = {
  WRONG_PRODUCT: { tr: "Yanlış ürün", en: "Wrong product" },
  WRONG_VARIANT_SIZE_COLOR: { tr: "Yanlış varyant (beden/renk)", en: "Wrong variant (size/color)" },
  WRONG_QUANTITY: { tr: "Yanlış adet", en: "Wrong quantity" },
  DUPLICATE_ORDER: { tr: "Mükerrer sipariş", en: "Duplicate order" },
  ACCIDENTAL_ORDER: { tr: "Yanlışlıkla sipariş", en: "Accidental order" },
  FOUND_CHEAPER_ELSEWHERE: { tr: "Başka yerde daha ucuz bulundu", en: "Found cheaper elsewhere" },
  COUPON_DISCOUNT_NOT_AS_EXPECTED: {
    tr: "Kupon / indirim beklendiği gibi değil",
    en: "Coupon / discount not as expected",
  },
  TOTAL_PRICE_TOO_HIGH: { tr: "Toplam fiyat çok yüksek", en: "Total price too high" },
  DELIVERY_ESTIMATE_TOO_LONG: { tr: "Teslimat süresi çok uzun", en: "Delivery estimate too long" },
  SHIPPING_FEE_TOO_HIGH: { tr: "Kargo ücreti çok yüksek", en: "Shipping fee too high" },
  WILL_NOT_ARRIVE_IN_TIME: { tr: "Zamanında gelmeyecek", en: "Won't arrive in time" },
  WRONG_PAYMENT_METHOD: { tr: "Yanlış ödeme yöntemi", en: "Wrong payment method" },
  INSTALLMENT_OR_PAYMENT_OPTION_UNSUITABLE: {
    tr: "Taksit / ödeme seçeneği uygun değil",
    en: "Installment or payment option unsuitable",
  },
  PAYMENT_CONCERN: { tr: "Ödeme endişesi", en: "Payment concern" },
  NO_LONGER_NEEDED: { tr: "Artık ihtiyaç yok", en: "No longer needed" },
  CHANGED_MIND: { tr: "Fikir değişti", en: "Changed mind" },
  PREFER_DIFFERENT_PRODUCT: { tr: "Farklı ürün tercih ediliyor", en: "Prefer a different product" },
  OTHER: { tr: "Diğer", en: "Other" },
};

export const CANCELLATION_SOURCE_VALUES = Object.keys(
  CANCELLATION_SOURCE_LABELS,
) as OrderCancellationSource[];
export const CANCELLATION_REASON_CATEGORY_VALUES = Object.keys(
  CANCELLATION_REASON_CATEGORY_LABELS,
) as OrderCancellationReasonCategory[];
export const CANCELLATION_REASON_VALUES = Object.keys(
  CANCELLATION_REASON_LABELS,
) as OrderCancellationReason[];

export const cancellationSourceLabel = (value: OrderCancellationSource, locale: string) =>
  pick(locale, CANCELLATION_SOURCE_LABELS[value]);
export const cancellationReasonCategoryLabel = (
  value: OrderCancellationReasonCategory,
  locale: string,
) => pick(locale, CANCELLATION_REASON_CATEGORY_LABELS[value]);
export const cancellationReasonLabel = (value: OrderCancellationReason, locale: string) =>
  pick(locale, CANCELLATION_REASON_LABELS[value]);

/* ── TODO-174A — Refund menşei (birleşik İadeler listesi) + refund durumu etiketleri ──────── */
const REFUND_SOURCE_LABELS: Record<RefundOriginValue, Bi> = {
  RETURN_REQUEST: { tr: "İade talebi", en: "Return request" },
  ORDER_CANCELLATION: { tr: "Sipariş iptali", en: "Order cancellation" },
};
export const REFUND_SOURCE_TONES: Record<RefundOriginValue, Tone> = {
  RETURN_REQUEST: "info",
  ORDER_CANCELLATION: "warning",
};
export const refundSourceLabel = (value: RefundOriginValue, locale: string) =>
  pick(locale, REFUND_SOURCE_LABELS[value]);

const REFUND_STATUS_LABELS: Record<OrderRefundStatusValue, Bi> = {
  PENDING: { tr: "Beklemede", en: "Pending" },
  PROCESSING: { tr: "İşleniyor", en: "Processing" },
  SUCCEEDED: { tr: "Tamamlandı", en: "Succeeded" },
  FAILED: { tr: "Başarısız", en: "Failed" },
  CANCELLED: { tr: "İptal edildi", en: "Cancelled" },
};
export const REFUND_STATUS_TONES: Record<OrderRefundStatusValue, Tone> = {
  PENDING: "warning",
  PROCESSING: "info",
  SUCCEEDED: "success",
  FAILED: "danger",
  CANCELLED: "neutral",
};
export const refundStatusLabel = (value: OrderRefundStatusValue, locale: string) =>
  pick(locale, REFUND_STATUS_LABELS[value]);

export const returnStatusLabel = (status: ReturnStatus, locale: string) =>
  pick(locale, RETURN_STATUS_LABELS[status]);
export const returnResolutionLabel = (value: ReturnResolutionType, locale: string) =>
  pick(locale, RETURN_RESOLUTION_LABELS[value]);
export const returnReasonLabel = (value: ReturnReason, locale: string) =>
  pick(locale, RETURN_REASON_LABELS[value]);
export const returnConditionLabel = (value: ReturnConditionStatus, locale: string) =>
  pick(locale, RETURN_CONDITION_LABELS[value]);
export const returnInspectionLabel = (value: ReturnInspectionResult, locale: string) =>
  pick(locale, RETURN_INSPECTION_LABELS[value]);
export const returnRestockLabel = (value: ReturnRestockDecision, locale: string) =>
  pick(locale, RETURN_RESTOCK_LABELS[value]);

/*
 * İade durumundan hangi ADMIN aksiyonlarının geçerli olduğunu türeten SAF yardımcılar.
 * Gateway state-machine'i (returns/status-map.ts) nihai otoritedir ve illegal geçişi
 * fail-closed (409/403) reddeder; bunlar YALNIZ uygun butonu göstermek içindir.
 *
 * TD-FR-7 Faz 1 / Task 5 — akış sadeleştirme: aradaki "yalnız ilerlet" aksiyonları
 * (incelemeye al / gönderim bekleniyor / kapat) kaldırıldı; UI SADECE gerçek admin
 * KARARLARINI gösterir, backend'in zaten otomatik yaptığı geçişleri değil.
 *   REQUESTED/UNDER_REVIEW → onayla / kısmi onayla / reddet (incelemeye almak için ayrı
 *     bir aksiyon YOK — REQUESTED'te doğrudan karar verilir)
 *   APPROVED/PARTIALLY_APPROVED → (AWAITING_SHIPMENT'a geçiş approve onCommit'inde otomatik;
 *     admin aksiyonu YOK)
 *   RETURN_SHIPPED → teslim alındı (RECEIVED)
 *   RECEIVED/INSPECTION_REQUIRED → inceleme = karar merkezi: kabul → "İadeyi yap" (REPLACEMENT
 *     çözümünde etiket "İncelemeyi kaydet") / red → "Reddet" (INSPECTED ara adımından REJECTED;
 *     mevcut reject akışı reuse edilir). inspect-decision endpoint'i YALNIZ
 *     REFUND_TO_ORIGINAL_PAYMENT çözümünde kabul edilen adet varsa refund'ı AYNI aksiyonda
 *     otomatik başlatır (backend `advanceInspectedToRefundPending` resolutionType kontrolü
 *     yapar); REPLACEMENT çözümünde aynı çağrı yalnız inceleme kararını kaydeder.
 *   INSPECTED → refund pending / replacement pending / reddet (fallback butonlar):
 *     - REPLACEMENT çözümünde bu NORMAL/TEK yoldur — "İncelemeyi kaydet" INSPECTED'de bırakır,
 *       admin buradan "Değişim sürecine al" ile devam eder (inspect-decision REPLACEMENT'ı
 *       otomatik ilerletmez).
 *     - REFUND_TO_ORIGINAL_PAYMENT çözümünde normal akış artık inspect-decision ile tek adımda
 *       REFUND_PENDING'e ilerler; bu fallback yalnız ara-adım hatası (reject'in ikinci adımı
 *       başarısız olup INSPECTED'de kalması) veya eski kayıt senaryosu için.
 *   REFUND_PENDING/REPLACEMENT_PENDING/COMPLETED → (Kapat YOK — "no silent close"; ADR-272
 *     ile backend zaten 409 REFUND_UNSETTLED döner. Kapanış yalnız COMPLETED üzerinden, para
 *     iadesi otoritesi refund-panel'dedir.)
 * (Müşteri iptali ve süre-doldu admin'e KAPALI; bu yüzden buton yok.)
 */
export const canApproveReturn = (s: ReturnStatus) => s === "REQUESTED" || s === "UNDER_REVIEW";
export const canRejectReturn = (s: ReturnStatus) =>
  s === "REQUESTED" || s === "UNDER_REVIEW" || s === "INSPECTED";
export const canReceiveReturn = (s: ReturnStatus) => s === "RETURN_SHIPPED";
export const canInspectReturn = (s: ReturnStatus) =>
  s === "RECEIVED" || s === "INSPECTION_REQUIRED";
export const canRefundPending = (s: ReturnStatus) => s === "INSPECTED";
export const canReplacementPending = (s: ReturnStatus) => s === "INSPECTED";
