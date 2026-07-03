import type { ShipmentStatus } from "@prisma/client";

/**
 * TODO-129 — Saglayici durum → ic ShipmentStatus esleme + sync yardimcilari.
 *
 * routes.ts'ten TASINDI (davranis DEGISMEDI): zamanlanmis sync worker'i (sync-service.ts)
 * ile route'lar ayni saf yardimcilari dongusel import olmadan paylasir. routes.ts geriye
 * donuk uyumluluk icin re-export eder (webhook-routes + mevcut testler oradan okur).
 */

// F3C.6 — trackshipment KUMULATIF hareket listesi doner; ayni hareketin tekrar sync'te
// yeniden TRACKING_UPDATED yazilmamasi icin dogal anahtar. occurredAt parse edilmis Date
// uzerinden (ms) kurulur ki ham format farklari (dd-MM vs yyyy-MM-dd) ayni ani ayni saysın.
export function shipmentTrackingEventKey(e: {
  statusText: string | null;
  location: string | null;
  occurredAt: Date | null;
}): string {
  return `${e.statusText ?? ""}|${e.location ?? ""}|${e.occurredAt ? e.occurredAt.getTime() : ""}`;
}

// F3C.6 — Saglayici tarih parser'i. OpenAPI formatlarina gore (dd-MM-yyyy HH:mm:ss
// eventDateTime/deliveryDateTime, dd.MM.yyyy jwtExpireDate, yyyy-MM-dd eventDateTime2,
// dd-MM-yyyy salt-tarih estimatedDeliveryDate). gun-once (dd?MM?yyyy) kalibi Date.parse'tan
// ONCE denenir: aksi halde JS "05-02-2019"u ABD MM-DD sayip YANLIS tarihe cevirir.
// Saat kismi opsiyoneldir. Cozulemeyen deger null'a duser (event kaydi kaybolmaz).
export function parseProviderDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = value.match(/^(\d{2})[./-](\d{2})[./-](\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const [, dd, mm, yyyy, hh, mi, ss] = m;
    const d = new Date(
      Number(yyyy),
      Number(mm) - 1,
      Number(dd),
      Number(hh ?? "0"),
      Number(mi ?? "0"),
      Number(ss ?? "0"),
    );
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const iso = Date.parse(value);
  return Number.isNaN(iso) ? null : new Date(iso);
}

// F3C.3 (ADR-045) — DHL statusCode (0-7) → ic ShipmentStatus eslemesi (DHL yanitiyla
// netlestirildi). 3 ("teslim birimine ulasti") IN_TRANSIT alt-durumudur (ham kod
// shipmentStatusCode'da, ham metin statusText'te saklanir). 5/7 FINAL; 6 (teslim
// edilemedi) FINAL DEGIL → takip gerektirir.
// F3C.6: OpenAPI'deki 8 (Destek_Gerekiyor) BILEREK eslenmemistir — ic durumda karsiligi
// yok; bilinmeyen kod gibi mevcut durum korunur (ilerletilmez), ham kod/metin event'te kalir.
const DHL_STATUS_TO_SHIPMENT: Record<number, ShipmentStatus> = {
  0: "ORDER_CREATED",
  1: "LABEL_CREATED",
  2: "IN_TRANSIT",
  3: "IN_TRANSIT",
  4: "OUT_FOR_DELIVERY",
  5: "DELIVERED",
  6: "DELIVERY_FAILED",
  7: "RETURNED",
};

// Durum siralamasi (regresyon koruması). Eski/yanlis sync 0/1 kodu, lokal olarak
// ilerlemis durumu (or. LABEL_CREATED) GERI cekmemeli. Final durumlar en yuksek rank.
const SHIPMENT_STATUS_RANK: Record<ShipmentStatus, number> = {
  DRAFT: 0,
  ORDER_CREATED: 1,
  LABEL_PENDING: 1,
  LABEL_CREATED: 2,
  IN_TRANSIT: 3,
  OUT_FOR_DELIVERY: 4,
  DELIVERY_FAILED: 4,
  DELIVERED: 5,
  RETURNED: 5,
  CANCELLED: 5,
  FAILED: 5,
};

export const TERMINAL_SHIPMENT_STATUSES: ShipmentStatus[] = [
  "DELIVERED",
  "RETURNED",
  "CANCELLED",
  "FAILED",
];

// TODO-100 — toplu sync'e giren durumlar: terminal olmayan + saglayicida karsiligi
// olan gonderiler. DRAFT haric (henuz provider order'i yok → sync anlamsiz).
export const SYNCABLE_SHIPMENT_STATUSES: ShipmentStatus[] = [
  "ORDER_CREATED",
  "LABEL_PENDING",
  "LABEL_CREATED",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERY_FAILED",
];

// getshipmentstatus durum → ic ShipmentStatus. Bilinmeyen/null kodda mevcut durum korunur;
// terminal durumdan geri donulmez; ileri olmayan koda regres edilmez.
export function mapProviderStatusToShipmentStatus(
  status: { statusCode: number | null; isDelivered: boolean },
  current: ShipmentStatus,
): ShipmentStatus {
  if (TERMINAL_SHIPMENT_STATUSES.includes(current)) return current;
  if (status.isDelivered) return "DELIVERED";
  if (status.statusCode == null) return current;
  const mapped = DHL_STATUS_TO_SHIPMENT[status.statusCode];
  if (!mapped) return current;
  // Final hedefe (DELIVERED/RETURNED) her zaman gec; aksi halde geri gitme.
  if (TERMINAL_SHIPMENT_STATUSES.includes(mapped)) return mapped;
  return SHIPMENT_STATUS_RANK[mapped] >= SHIPMENT_STATUS_RANK[current] ? mapped : current;
}
