import type { CustomerOrderShipment } from "@commerce-os/api-client";

/**
 * TODO-117 — Müşteri-facing kargo takip saf yardımcıları (sunucu+istemci ortak).
 *
 * Veri gateway'de zaten store+customer scoped + allowlist döner (yalnız kendi
 * siparişinin shipment'ı, secret/iç alan yok). Burada YALNIZ müşteri-facing
 * sunum mantığı vardır: durum→ton, stepper adım index'i, sorun/iptal kontrolü.
 * Etiketler i18n sözlüğünden gelir (dürüst, mevcut enum'a birebir).
 *
 * ADR-045 KORUNUR: "Kargoya verildi" otomatik üretilmez (ORDER_CREATED fiziksel
 * teslim değildir → hazırlık adımıdır); event konumu KESİN varış değil →
 * "işlem noktası" olarak gösterilir.
 */

export type ShipmentStatus = CustomerOrderShipment["status"];
export type ShipmentEventType = CustomerOrderShipment["events"][number]["eventType"];

export type ShipmentTone = "neutral" | "success" | "warning" | "info" | "danger";

export const SHIPMENT_STATUS_TONE: Record<ShipmentStatus, ShipmentTone> = {
  DRAFT: "neutral",
  ORDER_CREATED: "info",
  LABEL_PENDING: "warning",
  LABEL_CREATED: "info",
  IN_TRANSIT: "info",
  OUT_FOR_DELIVERY: "info",
  DELIVERED: "success",
  DELIVERY_FAILED: "danger",
  RETURNED: "warning",
  CANCELLED: "neutral",
  FAILED: "danger",
};

/** Müşteri-facing stepper adımı sayısı (Hazırlık → Yolda → Dağıtımda → Teslim). */
export const SHIPMENT_STEP_COUNT = 4;

/**
 * status → ulaşılan adım index (0..3). -1 => adım dışı (iptal/başarısız).
 * Hazırlık (0) = sipariş kaydı/barkod; Yolda (1); Dağıtımda (2); Teslim (3).
 */
export function shipmentStepIndex(status: ShipmentStatus): number {
  switch (status) {
    case "DRAFT":
    case "ORDER_CREATED":
    case "LABEL_PENDING":
    case "LABEL_CREATED":
      return 0;
    case "IN_TRANSIT":
      return 1;
    case "OUT_FOR_DELIVERY":
    case "DELIVERY_FAILED":
      return 2;
    case "DELIVERED":
      return 3;
    case "RETURNED":
    case "CANCELLED":
    case "FAILED":
    default:
      return -1;
  }
}

/** Teslim sürecinde takip gerektiren (nihai olmayan) sorun durumu. */
export function isProblemShipmentStatus(status: ShipmentStatus): boolean {
  return status === "DELIVERY_FAILED" || status === "RETURNED" || status === "FAILED";
}

/** İptal edilmiş gönderi kaydı (stepper gizlenir, nötr bilgi gösterilir). */
export function isCancelledShipmentStatus(status: ShipmentStatus): boolean {
  return status === "CANCELLED";
}

/**
 * TODO-127 — Hazırlık aşaması: gönderi oluşturuldu, henüz kargo firmasınca alınmadı
 * (ORDER_CREATED "kargoya verildi"/yolda DEĞİL, ADR-045). Bu aşamada müşteriye
 * "Kargonun alımı bekleniyor." bilgisi gösterilir; yolda/teslim durumlarında gösterilmez.
 */
export function isAwaitingPickupShipmentStatus(status: ShipmentStatus): boolean {
  return status === "ORDER_CREATED" || status === "LABEL_PENDING" || status === "LABEL_CREATED";
}

/** Sağlayıcı adı baş harf(ler)i — logo yok/bozuksa fallback rozet metni. */
export function providerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toLocaleUpperCase("tr");
  return (parts[0][0] + parts[1][0]).toLocaleUpperCase("tr");
}

/** TODO-125 — Logo URL dolu/geçerli mi (boş string/null değil) → logo göster, yoksa initials. */
export function hasProviderLogo(logoUrl: string | null | undefined): boolean {
  return typeof logoUrl === "string" && logoUrl.trim().length > 0;
}
