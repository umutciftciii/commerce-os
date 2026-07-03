/**
 * F3C.5 (TODO-121) — Provider-agnostic shipment UI sözlüğü. Shipment list/detail ve
 * order özet kartı bu modülü paylaşır. KRİTİK kurallar:
 *  - "Kargoya verildi" OTOMATİK durum olarak üretilmez (ORDER_CREATED fiziksel teslim değil).
 *  - Event/timeline konumu KESİN varış/teslimat şubesi DEĞİL → "İşlem noktası" (ADR-045).
 *  - Aksiyon/durum metinleri GENERIC'tir; DHL/sağlayıcıya özel sözcük geçmez.
 */
import type { ShipmentStatusValue, ShipmentEventType } from "@commerce-os/api-client";

export type Locale = "tr" | "en";

type StatusTone = "neutral" | "info" | "warning" | "success" | "danger" | "brand";

/** Generic, provider-agnostic durum etiketleri. */
export const SHIPMENT_STATUS_LABEL: Record<Locale, Record<ShipmentStatusValue, string>> = {
  tr: {
    DRAFT: "Taslak",
    ORDER_CREATED: "Kargonun Alınması Bekleniyor",
    LABEL_PENDING: "Barkod bekleniyor",
    LABEL_CREATED: "Kargo İçin Paketlendi",
    IN_TRANSIT: "Yolda",
    OUT_FOR_DELIVERY: "Dağıtımda",
    DELIVERED: "Teslim edildi",
    DELIVERY_FAILED: "Teslim edilemedi",
    RETURNED: "İade sürecinde",
    CANCELLED: "İptal edildi",
    FAILED: "Başarısız",
  },
  en: {
    DRAFT: "Draft",
    ORDER_CREATED: "Awaiting carrier pickup",
    LABEL_PENDING: "Awaiting label",
    LABEL_CREATED: "Packed for carrier",
    IN_TRANSIT: "In transit",
    OUT_FOR_DELIVERY: "Out for delivery",
    DELIVERED: "Delivered",
    DELIVERY_FAILED: "Delivery failed",
    RETURNED: "Returning",
    CANCELLED: "Cancelled",
    FAILED: "Failed",
  },
};

/** Durum açıklaması — "Kargoya verildi" otomatik kullanılmaz (ORDER_CREATED fiziksel teslim değil). */
export const SHIPMENT_STATUS_DESC: Record<Locale, Record<ShipmentStatusValue, string>> = {
  tr: {
    DRAFT: "Taslak gönderi.",
    ORDER_CREATED: "Kargonun alımı bekleniyor. Kargo firmasında kayıt açıldı.",
    LABEL_PENDING: "Barkod henüz tam üretilemedi; tekrar denenebilir.",
    LABEL_CREATED: "Barkod/etiket oluşturuldu, paket hazırlandı.",
    IN_TRANSIT: "Gönderi taşıma sürecinde.",
    OUT_FOR_DELIVERY: "Gönderi teslimat aşamasına yönlendirildi.",
    DELIVERED: "Gönderi teslim edildi.",
    DELIVERY_FAILED: "Teslim edilemedi; takip gerektirir (nihai değil).",
    RETURNED: "Göndericiye/iade sürecine döndü.",
    CANCELLED: "Gönderi kaydı iptal edildi.",
    FAILED: "İşlem başarısız.",
  },
  en: {
    DRAFT: "Draft shipment.",
    ORDER_CREATED: "Waiting for carrier pickup. The carrier shipment record was created.",
    LABEL_PENDING: "Label not fully created yet; can be retried.",
    LABEL_CREATED: "Label created, parcel prepared.",
    IN_TRANSIT: "Shipment is in transit.",
    OUT_FOR_DELIVERY: "Shipment moved to the delivery stage.",
    DELIVERED: "Shipment delivered.",
    DELIVERY_FAILED: "Delivery failed; needs follow-up (not final).",
    RETURNED: "Returned to sender / return process.",
    CANCELLED: "Shipment record cancelled.",
    FAILED: "Operation failed.",
  },
};

export const SHIPMENT_STATUS_TONE: Record<ShipmentStatusValue, StatusTone> = {
  DRAFT: "neutral",
  ORDER_CREATED: "brand",
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

/** Provider-safe stepper adımları (5). "Kargoya verildi" otomatik adım DEĞİLDİR. */
export const SHIPMENT_STEPS: Record<Locale, string[]> = {
  tr: ["Gönderi Kaydı", "Barkod Hazırlandı", "Taşıma Sürecinde", "Teslimat Aşamasında", "Tamamlandı"],
  en: ["Registered", "Label Ready", "In Transit", "Delivery Stage", "Completed"],
};

/** status → ulaşılan adım index (0-4). -1 => adım dışı (DRAFT / CANCELLED / FAILED). */
export function shipmentStepIndex(status: ShipmentStatusValue): number {
  switch (status) {
    case "ORDER_CREATED":
    case "LABEL_PENDING":
      return 0;
    case "LABEL_CREATED":
      return 1;
    case "IN_TRANSIT":
      return 2;
    case "OUT_FOR_DELIVERY":
    case "DELIVERY_FAILED":
    case "RETURNED":
      return 3;
    case "DELIVERED":
      return 4;
    default:
      return -1;
  }
}

export function isProblemStatus(status: ShipmentStatusValue): boolean {
  return status === "DELIVERY_FAILED" || status === "RETURNED" || status === "FAILED";
}

/**
 * TODO-127 — Hazırlık aşaması: gönderi kaydı açıldı ama henüz kargo firmasınca alınmadı
 * (createOrder başarısı = "Gönderi oluşturuldu", fiziksel "kargoya verildi" DEĞİL).
 * Bu aşamada özet kartı "Kargonun alımı bekleniyor." yardımcı metnini gösterir.
 */
export function isAwaitingPickupStatus(status: ShipmentStatusValue): boolean {
  return status === "ORDER_CREATED" || status === "LABEL_PENDING" || status === "LABEL_CREATED";
}

/** Timeline event etiketleri (generic). */
export const SHIPMENT_EVENT_LABEL: Record<Locale, Record<ShipmentEventType, string>> = {
  tr: {
    CREATED: "Oluşturuldu",
    ORDER_CREATED: "Gönderi oluşturuldu",
    BARCODE_CREATED: "Barkod oluşturuldu",
    BARCODE_PENDING: "Barkod bekleniyor",
    BARCODE_FAILED: "Barkod oluşturulamadı",
    STATUS_CHANGED: "Durum güncellendi",
    TRACKING_UPDATED: "Takip güncellendi",
    MANUAL_TRACKING: "Takip no elle girildi",
    CANCELLED: "İptal edildi",
    WEBHOOK_RECEIVED: "Sağlayıcı bildirimi",
  },
  en: {
    CREATED: "Created",
    ORDER_CREATED: "Shipment created",
    BARCODE_CREATED: "Label created",
    BARCODE_PENDING: "Label pending",
    BARCODE_FAILED: "Label failed",
    STATUS_CHANGED: "Status updated",
    TRACKING_UPDATED: "Tracking updated",
    MANUAL_TRACKING: "Tracking entered manually",
    CANCELLED: "Cancelled",
    WEBHOOK_RECEIVED: "Provider notification",
  },
};

/** KPI kart etiketleri (sade MVP). */
export const SHIPMENT_KPI_LABEL: Record<Locale, { prepared: string; awaitingLabel: string; inTransit: string; delivered: string; problem: string }> = {
  tr: { prepared: "Hazırlanan", awaitingLabel: "Barkod bekleyen", inTransit: "Transferde", delivered: "Teslim edilen", problem: "Sorunlu" },
  en: { prepared: "Prepared", awaitingLabel: "Awaiting label", inTransit: "In transit", delivered: "Delivered", problem: "Problem" },
};

/**
 * Aksiyon yetkisi kapalıysa gösterilecek gerekçe (generic i18n kod → metin). Gateway
 * `disabledReason` kodlarını UI burada lokalize eder; DHL/sağlayıcıya özel metin yoktur.
 */
export const SHIPMENT_ACTION_DISABLED_REASON: Record<Locale, Record<string, string>> = {
  tr: {
    PROVIDER_ACTIONS_DISABLED:
      "Sağlayıcı operasyonu güvenlik kilidiyle kapalı. Bu işlem için sandbox HTTP ve ilgili işlem izni açılmalı. Bu güvenlik kilidi canlı/test ayrımından bağımsızdır; dış sağlayıcıya istek atmayı engeller.",
    SHIPMENT_INACTIVE: "Gönderi iptal/başarısız durumda; işlem yapılamaz.",
  },
  en: {
    PROVIDER_ACTIONS_DISABLED:
      "Provider operation is closed by a security lock. Sandbox HTTP and the relevant operation permission must be enabled. This security lock is independent of the live/test distinction; it blocks outbound provider calls.",
    SHIPMENT_INACTIVE: "Shipment is cancelled/failed; no action possible.",
  },
};

/** Provider tip → kısa görünen ad (config logosu/adı yoksa fallback). */
export const PROVIDER_TYPE_LABEL: Record<string, string> = {
  MOCK: "MOCK",
  GELIVER: "Geliver",
  DHL_ECOMMERCE: "DHL eCommerce",
};
