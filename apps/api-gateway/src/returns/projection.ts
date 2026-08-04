/**
 * TODO-169 (ADR-269) — Sipariş-bazında ORTAK iade özeti projeksiyonu.
 *
 * Tek server-side otorite: müşteri sipariş listesi/detayı, Store-Admin sipariş detayı ve iade takip
 * ekranı AYNI özeti kullanır (React tarafında ayrı hesap YOK). İki eksen:
 *  1. İade PENCERESİ (teslim ankoru + policy'den türetilir; iade olmasa da gösterilir) — blocker #1.
 *  2. İade AKTİVİTESİ (bu siparişin ReturnRequest'leri; durum/adet/finansal etki) — blocker #5/#6/#7.
 *
 * FINANS DÜRÜSTLÜĞÜ (ADR-268/§7): RefundIntent PENDING "gerçekleşen iade" DEĞİLDİR. approvedRefundIntent
 * (niyet) ile completedRefund (gerçekleşen; TODO-170'e kadar 0) AYRI taşınır; hasPendingFinancialImpact
 * UI'a "beklenen/provisional" ayrımını yaptırır. Gross satış ASLA düşülmez.
 */
import type { Prisma, PrismaClient, ReturnStatus, RefundIntentStatus } from "@prisma/client";
import {
  resolveDeliveryAnchor,
  computeReturnWindowEnd,
  type ShipmentEligibilityInput,
} from "./eligibility.js";

type Tx = Prisma.TransactionClient | PrismaClient;

const DAY = 24 * 60 * 60 * 1000;

/** Havuza adet geri veren (iade sayılmayan) durumlar — service ile aynı küme. */
const RELEASING_TERMINAL: ReturnStatus[] = ["REJECTED", "CANCELLED_BY_CUSTOMER", "EXPIRED"];

/** "Kapalı" (artık ilerlemeyen) durumlar — releasing + arşiv/tamamlanmış. */
const CLOSED_STATUSES: ReturnStatus[] = [...RELEASING_TERMINAL, "CLOSED", "COMPLETED"];

/** Ürünün fiziken mağazaya döndüğü (veya sonrası) durumlar — "iade edildi/işleniyor" sayımı. */
const GOODS_RECEIVED_STATUSES: ReturnStatus[] = [
  "RECEIVED",
  "INSPECTION_REQUIRED",
  "INSPECTED",
  "REFUND_PENDING",
  "REPLACEMENT_PENDING",
  "COMPLETED",
  "CLOSED",
];

/** Bir iade talebi hâlâ "aktif" mi (kapatılmadı/tamamlanmadı/iptal/red/expire değil)? */
export function isActiveReturnStatus(status: ReturnStatus): boolean {
  return !CLOSED_STATUSES.includes(status);
}

/** Sipariş-seviyesi iade penceresi durumu (delivery-derived; iade olmasa da geçerli). */
export type ReturnWindowState = "NOT_DELIVERED" | "ELIGIBLE" | "EXPIRED";

export interface ResolvedReturnWindow {
  windowEnd: Date | null;
  windowState: ReturnWindowState;
  /** Pencere bitişine kalan gün (ceil). Teslim yoksa null; süre dolduysa ≤ 0. */
  remainingDays: number | null;
}

/**
 * SAF pencere çözümü (tek otorite; eligibility + projection paylaşır). deliveryAnchor null → NOT_DELIVERED.
 */
export function resolveReturnWindow(
  deliveryAnchor: Date | null,
  returnWindowDays: number,
  now: Date,
): ResolvedReturnWindow {
  const windowEnd = computeReturnWindowEnd(deliveryAnchor, returnWindowDays);
  if (deliveryAnchor === null || windowEnd === null) {
    return { windowEnd: null, windowState: "NOT_DELIVERED", remainingDays: null };
  }
  const remainingDays = Math.ceil((windowEnd.getTime() - now.getTime()) / DAY);
  const windowState: ReturnWindowState = now.getTime() > windowEnd.getTime() ? "EXPIRED" : "ELIGIBLE";
  return { windowEnd, windowState, remainingDays };
}

export interface ReturnProjectionRequestInput {
  /** İnsan-görünür iade numarası (deep-link hedefi; store-scoped unique). */
  returnNumber: string;
  status: ReturnStatus;
  createdAt: Date;
  items: Array<{ quantity: number; approvedQuantity: number | null }>;
  refundIntent: { totalRefundMinor: number; status: RefundIntentStatus } | null;
}

export interface ReturnOrderSummaryInput {
  currency: string;
  now: Date;
  returnWindowDays: number;
  /** Teslim ankoru (max deliveredAt); teslim edilmemişse null. */
  deliveryAnchor: Date | null;
  requests: ReturnProjectionRequestInput[];
}

export interface ReturnOrderSummary {
  currency: string;
  // ── Pencere (blocker #1) ──
  deliveredAt: string | null;
  returnWindowDays: number;
  returnWindowEndsAt: string | null;
  remainingDays: number | null;
  windowState: ReturnWindowState;
  // ── Aktivite (blocker #5/#6) ──
  requestCount: number;
  activeRequestCount: number;
  /**
   * BUG-RETURN-DEEPLINK — CTA tek-otorite hedefi: tam olarak bir "odak" iade varsa onun returnNumber'ı,
   * belirsizse null. Odak = tek aktif iade; hiç aktif yoksa tek toplam iade. React'te türetme YOK.
   */
  primaryReturnNumber: string | null;
  returnedItemQuantity: number;
  pendingItemQuantity: number;
  latestStatus: ReturnStatus | null;
  // ── Finansal etki (blocker #7) ──
  approvedRefundIntentMinor: number;
  completedRefundMinor: number;
  hasPendingFinancialImpact: boolean;
}

/**
 * SAF özet üretimi (DB'ye bağımlı DEĞİL; unit-testlenebilir). Tüm türetmeler burada;
 * server-authoritative — React yeniden hesaplamaz.
 */
export function buildReturnOrderSummary(input: ReturnOrderSummaryInput): ReturnOrderSummary {
  const { windowEnd, windowState, remainingDays } = resolveReturnWindow(
    input.deliveryAnchor,
    input.returnWindowDays,
    input.now,
  );

  let activeRequestCount = 0;
  let returnedItemQuantity = 0;
  let pendingItemQuantity = 0;
  let approvedRefundIntentMinor = 0;
  let completedRefundMinor = 0;
  let latest: { status: ReturnStatus; at: number } | null = null;
  // Deep-link odak seçimi için aktif iade numaraları (sıra önemsiz; tek eleman → deep-link).
  const activeReturnNumbers: string[] = [];

  for (const r of input.requests) {
    const itemQty = r.items.reduce((a, b) => a + b.quantity, 0);
    const approvedQty = r.items.reduce((a, b) => a + (b.approvedQuantity ?? b.quantity), 0);

    if (isActiveReturnStatus(r.status)) {
      activeRequestCount += 1;
      pendingItemQuantity += itemQty;
      activeReturnNumbers.push(r.returnNumber);
    }
    if (GOODS_RECEIVED_STATUSES.includes(r.status)) {
      returnedItemQuantity += approvedQty;
    }
    if (r.refundIntent) {
      // Niyet (PENDING) vs gerçekleşen (PROCESSED). CANCELLED intent sayılmaz.
      if (r.refundIntent.status === "PENDING") {
        approvedRefundIntentMinor += r.refundIntent.totalRefundMinor;
      } else if (r.refundIntent.status === "PROCESSED") {
        completedRefundMinor += r.refundIntent.totalRefundMinor;
      }
    }
    const at = r.createdAt.getTime();
    if (latest === null || at > latest.at) {
      latest = { status: r.status, at };
    }
  }

  // Odak iade: tek aktif iade varsa o; hiç aktif yoksa ama tek toplam iade varsa o; aksi halde
  // belirsiz → null (CTA sipariş detayındaki #returns bölümüne gider, kullanıcı seçer).
  const primaryReturnNumber =
    activeReturnNumbers.length === 1
      ? activeReturnNumbers[0]
      : activeRequestCount === 0 && input.requests.length === 1
        ? input.requests[0].returnNumber
        : null;

  return {
    currency: input.currency,
    deliveredAt: input.deliveryAnchor?.toISOString() ?? null,
    returnWindowDays: input.returnWindowDays,
    returnWindowEndsAt: windowEnd?.toISOString() ?? null,
    remainingDays,
    windowState,
    requestCount: input.requests.length,
    activeRequestCount,
    primaryReturnNumber,
    returnedItemQuantity,
    pendingItemQuantity,
    latestStatus: latest?.status ?? null,
    approvedRefundIntentMinor,
    completedRefundMinor,
    // Beklenen finansal etki: onaylı niyet var ama henüz gerçekleşmemiş.
    hasPendingFinancialImpact:
      approvedRefundIntentMinor > 0 && completedRefundMinor < approvedRefundIntentMinor,
  };
}

/** Sipariş için teslim ankoru (shipment listesinden). Tekrarlı kullanım için ince sarmalayıcı. */
export function deliveryAnchorForOrder(shipments: ShipmentEligibilityInput[]): Date | null {
  return resolveDeliveryAnchor(shipments);
}

/**
 * BATCHED DB projeksiyonu (N+1 YOK). Verilen siparişler için shipment (pencere ankoru) + ReturnRequest
 * (aktivite/finansal) tek sorguda toplanır, saf `buildReturnOrderSummary`'ye beslenir. storeId-first
 * scoped (tenant izolasyonu); başka store'un iadesi/gönderisi ASLA karışmaz. Dönüş: order.id → özet.
 * Siparişte hiç shipment/iade yoksa yine bir özet döner (NOT_DELIVERED pencere + sıfır aktivite).
 */
export async function computeReturnOrderSummaries(
  db: Tx,
  storeId: string,
  orders: Array<{ id: string; currency: string }>,
  policy: { returnWindowDays: number },
  now: Date,
): Promise<Map<string, ReturnOrderSummary>> {
  const result = new Map<string, ReturnOrderSummary>();
  if (orders.length === 0) return result;
  const orderIds = orders.map((o) => o.id);

  const [shipments, requests] = await Promise.all([
    db.shipment.findMany({
      where: { storeId, orderId: { in: orderIds } },
      select: { orderId: true, status: true, deliveredAt: true, updatedAt: true },
    }),
    db.returnRequest.findMany({
      where: { storeId, orderId: { in: orderIds } },
      select: {
        orderId: true,
        returnNumber: true,
        status: true,
        createdAt: true,
        items: { select: { quantity: true, approvedQuantity: true } },
        refundIntent: { select: { totalRefundMinor: true, status: true } },
      },
    }),
  ]);

  const shipmentsByOrder = new Map<string, ShipmentEligibilityInput[]>();
  for (const s of shipments) {
    const list = shipmentsByOrder.get(s.orderId) ?? [];
    list.push({ status: s.status, deliveredAt: s.deliveredAt, updatedAt: s.updatedAt });
    shipmentsByOrder.set(s.orderId, list);
  }
  const requestsByOrder = new Map<string, ReturnProjectionRequestInput[]>();
  for (const r of requests) {
    const list = requestsByOrder.get(r.orderId) ?? [];
    list.push({
      returnNumber: r.returnNumber,
      status: r.status,
      createdAt: r.createdAt,
      items: r.items.map((it) => ({ quantity: it.quantity, approvedQuantity: it.approvedQuantity })),
      refundIntent: r.refundIntent
        ? { totalRefundMinor: r.refundIntent.totalRefundMinor, status: r.refundIntent.status }
        : null,
    });
    requestsByOrder.set(r.orderId, list);
  }

  for (const order of orders) {
    const anchor = resolveDeliveryAnchor(shipmentsByOrder.get(order.id) ?? []);
    result.set(
      order.id,
      buildReturnOrderSummary({
        currency: order.currency,
        now,
        returnWindowDays: policy.returnWindowDays,
        deliveryAnchor: anchor,
        requests: requestsByOrder.get(order.id) ?? [],
      }),
    );
  }
  return result;
}
