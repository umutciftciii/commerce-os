/**
 * TODO-174A (ADR-279) — Sipariş Deneyimi Değerlendirmesi servis katmanı.
 *
 * ProductReview'DAN TAMAMEN AYRIK: burası ürün puanına / ProductRatingAggregate'e / PDP-PLP
 * rating'lerine HİÇBİR ŞEKİLDE dokunmaz. Uygunluk SUNUCU-otoriter: sipariş müşteriye ait +
 * status CANCELLED + teslim EDİLMEMİŞ (OUTBOUND_TO_CUSTOMER DELIVERED shipment YOK). İptal zaten
 * carrier-handoff öncesi ile sınırlı olduğundan CANCELLED çoğu durumda teslim-edilmemişi ima eder;
 * yine de savunma-derinliği için delivered kontrolü açıkça yapılır.
 */
import { prisma } from "@commerce-os/db";

/**
 * Saf uygunluk kuralı (birim-test edilebilir): iptal edilmiş + teslim EDİLMEMİŞ sipariş uygundur.
 */
export function isOrderExperienceEligible(input: {
  status: string;
  hasDeliveredOutboundShipment: boolean;
}): boolean {
  return input.status === "CANCELLED" && !input.hasDeliveredOutboundShipment;
}

/**
 * Düz metin güvencesi (yorum): HTML etiketlerini kaldırır (reviews sanitize deseniyle aynı),
 * kontrol karakterlerini temizler, trim'ler. Depolanan içerik daima düz metin → React text render → XSS yok.
 */
export function sanitizeExperienceComment(input: string): string {
  const withoutTags = input.replace(/<\/?[a-zA-Z][^>]*>/g, "");
  let out = "";
  for (const ch of withoutTags) {
    const code = ch.codePointAt(0) ?? 0;
    const isControl = code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d;
    if (!isControl && code !== 0x7f) out += ch;
  }
  return out.trim();
}

export interface OrderExperienceEligibilityRow {
  orderNumber: string;
  submitted: boolean;
  rating: number | null;
}

/**
 * Müşterinin deneyim-değerlendirmesine uygun (iptal + teslim-edilmemiş) siparişleri + zaten
 * değerlendirilmiş olanların rating'ini döndürür. Yalnız kendi (customerId) kayıtları.
 */
export async function listOrderExperienceEligibility(
  storeId: string,
  customerId: string,
): Promise<OrderExperienceEligibilityRow[]> {
  const orders = await prisma.order.findMany({
    where: { storeId, customerId, status: "CANCELLED" },
    select: {
      orderNumber: true,
      shipments: {
        where: { direction: "OUTBOUND_TO_CUSTOMER", status: "DELIVERED" },
        select: { id: true },
        take: 1,
      },
      experienceReviews: {
        where: { customerId },
        select: { rating: true },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return orders
    .filter((o) =>
      isOrderExperienceEligible({
        status: "CANCELLED",
        hasDeliveredOutboundShipment: o.shipments.length > 0,
      }),
    )
    .map((o) => ({
      orderNumber: o.orderNumber,
      submitted: o.experienceReviews.length > 0,
      rating: o.experienceReviews[0]?.rating ?? null,
    }));
}

/**
 * orderNumber'dan uygun siparişi çözer (ownership + eligibility fail-closed). Uygun değilse null.
 */
export async function resolveOrderForExperience(
  storeId: string,
  customerId: string,
  orderNumber: string,
): Promise<{ id: string } | null> {
  const order = await prisma.order.findFirst({
    where: { storeId, customerId, orderNumber, status: "CANCELLED" },
    select: {
      id: true,
      shipments: {
        where: { direction: "OUTBOUND_TO_CUSTOMER", status: "DELIVERED" },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (!order) return null;
  if (order.shipments.length > 0) return null;
  return { id: order.id };
}

export async function findOrderExperienceReview(
  storeId: string,
  orderId: string,
  customerId: string,
) {
  return prisma.orderExperienceReview.findUnique({
    where: { storeId_orderId_customerId: { storeId, orderId, customerId } },
    select: { id: true, rating: true, comment: true, createdAt: true },
  });
}

export async function createOrderExperienceReview(input: {
  storeId: string;
  orderId: string;
  customerId: string;
  rating: number;
  comment: string | null;
}) {
  return prisma.orderExperienceReview.create({
    data: {
      storeId: input.storeId,
      orderId: input.orderId,
      customerId: input.customerId,
      rating: input.rating,
      comment: input.comment,
    },
    select: { id: true, rating: true, comment: true, createdAt: true },
  });
}
