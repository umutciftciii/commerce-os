import type {
  CustomerOrderSummary,
  CustomerReview,
  ProductReviewStatus,
  ReviewEligibleOrderLine,
} from "@commerce-os/api-client";

/**
 * TODO-159E hotfix — Sipariş yüzeyi (Hesabım > Siparişlerim + sipariş detayı) için
 * "Ürün yorumu yaz" aksiyonunun durumunu türeten SAF resolver (yan etkisiz, test
 * edilebilir).
 *
 * Uygunluk kararı İSTEMCİDE YENİDEN HESAPLANMAZ: gateway'in `/reviews` ucundan gelen
 * `eligible` (yoruma uygun sipariş kalemleri, orderLineId taşır) ve `reviews` (mevcut
 * yorumlar, durumlarıyla) listeleri authority'dir. Burada yalnız bu iki liste ilgili
 * siparişe eşlenir → istemci hangi butonu/durumu göstereceğini bilir. Yorum oluşturma
 * her zaman sunucudan gelen `orderLineId` ile yapılır; sunucu ayrıca sahiplik + uygunluk
 * + duplicate korumasını tekrar zorlar (POST /reviews → 403/409).
 */

/** Yoruma uygun (henüz yorumlanmamış, teslim+ödenmiş) sipariş kalemi. */
export interface ReviewableItem {
  kind: "reviewable";
  orderLineId: string;
  productId: string;
  productTitle: string;
  productSlug: string;
  productImageUrl: string | null;
  variantLabel: string | null;
}

/** Bu sipariş kapsamında zaten yorumlanmış ürün (durumuyla). */
export interface ReviewedItem {
  kind: "reviewed";
  reviewId: string;
  status: ProductReviewStatus;
  editable: boolean;
  productTitle: string;
  productSlug: string;
  productImageUrl: string | null;
  variantLabel: string | null;
}

export type OrderReviewReason =
  | "none"
  | "not-delivered"
  | "cancelled"
  | "unpaid";

export interface OrderReviewState {
  /** CTA gösterilsin mi (uygun değilse bile açıklayıcı disabled durumla). */
  visible: boolean;
  /** En az bir kalem şu an yorumlanabilir mi (form açılabilir). */
  actionable: boolean;
  /** Uygun olmayan durumda neden (disabled açıklaması için). */
  reason: OrderReviewReason;
  reviewable: ReviewableItem[];
  reviewed: ReviewedItem[];
}

type OrderShape = Pick<
  CustomerOrderSummary,
  "orderNumber" | "status" | "paymentStatus" | "fulfillmentStatus" | "lines"
>;

/** Yorum yalnız teslim edilmiş (FULFILLED) siparişte oluşabilir. */
function isDelivered(order: OrderShape): boolean {
  return order.fulfillmentStatus === "FULFILLED";
}

/**
 * Bir siparişin yorum aksiyonu durumunu türetir.
 *
 * - `reviewable`: gateway'in bu siparişe ait uygun kalemleri (orderLineId ile).
 * - `reviewed`: bu siparişin ürünlerine ait mevcut yorumlar. productSlug ile eşlenir
 *   (slug ↔ productId 1:1). Yalnız sipariş TESLİM EDİLMİŞSE gösterilir — böylece aynı
 *   ürünü içeren başka bir siparişin yorumu, henüz teslim edilmemiş bu siparişe SIZMAZ.
 *   Uygun (reviewable) olan kalemler burada tekrar listelenmez.
 */
export function resolveOrderReview(
  order: OrderShape,
  eligible: readonly ReviewEligibleOrderLine[],
  reviews: readonly CustomerReview[],
): OrderReviewState {
  const reviewable: ReviewableItem[] = eligible
    .filter((entry) => entry.orderNumber === order.orderNumber)
    .map((entry) => ({
      kind: "reviewable",
      orderLineId: entry.orderLineId,
      productId: entry.productId,
      productTitle: entry.productTitle,
      productSlug: entry.productSlug,
      productImageUrl: entry.productImageUrl,
      variantLabel: entry.variantLabel,
    }));

  const delivered = isDelivered(order);
  const orderSlugs = new Set(order.lines.map((line) => line.productSlug));
  const reviewableSlugs = new Set(reviewable.map((item) => item.productSlug));

  const reviewed: ReviewedItem[] = delivered
    ? reviews
        .filter(
          (review) =>
            orderSlugs.has(review.productSlug) && !reviewableSlugs.has(review.productSlug),
        )
        .map((review) => ({
          kind: "reviewed",
          reviewId: review.id,
          status: review.status,
          editable: review.editable,
          productTitle: review.productTitle,
          productSlug: review.productSlug,
          productImageUrl: review.productImageUrl,
          variantLabel: review.variantLabel,
        }))
    : [];

  const actionable = reviewable.length > 0;
  const visible = actionable || reviewed.length > 0;

  let reason: OrderReviewReason = "none";
  if (!actionable) {
    if (order.status === "CANCELLED" || order.paymentStatus === "REFUNDED") {
      reason = "cancelled";
    } else if (order.paymentStatus === "UNPAID" || order.paymentStatus === "AUTHORIZED") {
      reason = "unpaid";
    } else if (!delivered) {
      reason = "not-delivered";
    }
  }

  return { visible, actionable, reason, reviewable, reviewed };
}
