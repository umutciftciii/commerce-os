/**
 * TODO-159E (ADR-094) — Vitrin yorum/puanlama okuma katmanı (sunucu-yalnız).
 *
 * Rating summary'leri CANLI aggregate projection'ından gelir. PLP/Home/Search kartları
 * için sayfadaki ürün id'leri TEK batched çağrıyla çözülür (`/reviews/summary`; N+1 yok) —
 * mock KALDIRILDI. PDP yorum listesi + özet + müşteri uygunluğu ayrı uçlardan okunur.
 */
import {
  REVIEW_SUMMARY_MAX_IDS,
  type CustomerReviewsResponse,
  type ReviewEligibilityResponse,
  type ReviewPublicListResponse,
  type ReviewSummary,
  type ReviewSummaryBatchResponse,
  type ReviewSummaryResponse,
} from "@commerce-os/api-client";
import { demoStoreSlug } from "./env";
import { customerBasePath } from "./customer";
import { getCustomer, getPublic, postPublic } from "./gateway";
import { readCustomerToken } from "./customer-cookie";

function publicStoreBasePath(): string {
  return `/public/stores/${encodeURIComponent(demoStoreSlug())}`;
}

/**
 * Batched kart rating özeti. Sayfadaki ürün id'leri için TEK public çağrı → Map.
 * Hata halinde boş Map (kartlar "değerlendirme yok" gösterir; sayfa çalışır).
 */
export async function getRatingSummaries(
  productIds: string[],
): Promise<Map<string, ReviewSummary>> {
  const unique = [...new Set(productIds.filter((id) => id.length > 0))].slice(
    0,
    REVIEW_SUMMARY_MAX_IDS,
  );
  if (unique.length === 0) return new Map();
  try {
    const result = await postPublic<ReviewSummaryBatchResponse>(
      `${publicStoreBasePath()}/reviews/summary`,
      { productIds: unique },
    );
    if (!result.ok) return new Map();
    return new Map(result.data.data.map((summary) => [summary.productId, summary]));
  } catch {
    // Gateway erişilemez (ağ hatası) → boş Map; kartlar rating satırını gizler (sayfa çalışır).
    return new Map();
  }
}

/**
 * Kart RatingProvider'ı için plain object (client'a serileştirilebilir). Yalnız yorumu
 * olan ürünler yer alır → kart yorumu yoksa yıldız satırını gizler.
 */
export async function getCardRatings(
  productIds: string[],
): Promise<Record<string, { average: number; count: number }>> {
  const map = await getRatingSummaries(productIds);
  const out: Record<string, { average: number; count: number }> = {};
  for (const [productId, summary] of map) {
    if (summary.reviewCount > 0) {
      out[productId] = { average: summary.averageRating, count: summary.reviewCount };
    }
  }
  return out;
}

/** Tek ürün rating özeti (PDP başlığı + dağılım). Yoksa sıfır özet. */
export async function getProductReviewSummary(productId: string): Promise<ReviewSummary> {
  const zero: ReviewSummary = {
    productId,
    averageRating: 0,
    reviewCount: 0,
    ratingDistribution: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 },
  };
  try {
    const result = await getPublic<ReviewSummaryResponse>(
      `${publicStoreBasePath()}/products/${encodeURIComponent(productId)}/reviews/summary`,
    );
    return result.ok ? result.data.data : zero;
  } catch {
    return zero;
  }
}

export interface ReviewListParams {
  page?: number;
  rating?: number;
  sort?: "newest" | "oldest" | "highest" | "lowest" | "most_helpful";
}

/** PDP APPROVED yorum listesi (sayfalı + rating filtresi + sort). */
export async function getProductReviews(
  productId: string,
  params: ReviewListParams = {},
): Promise<ReviewPublicListResponse | null> {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.rating) qs.set("rating", String(params.rating));
  if (params.sort) qs.set("sort", params.sort);
  const query = qs.toString();
  try {
    const result = await getPublic<ReviewPublicListResponse>(
      `${publicStoreBasePath()}/products/${encodeURIComponent(productId)}/reviews${query ? `?${query}` : ""}`,
    );
    return result.ok ? result.data : null;
  } catch {
    return null;
  }
}

/** Giriş yapmış müşteri için PDP "yorum yaz" uygunluğu. Oturum yoksa null. */
export async function getReviewEligibility(
  productId: string,
): Promise<ReviewEligibilityResponse["data"] | null> {
  const token = await readCustomerToken();
  if (!token) return null;
  try {
    const result = await getCustomer<ReviewEligibilityResponse>(
      `${customerBasePath()}/products/${encodeURIComponent(productId)}/review-eligibility`,
      token,
    );
    return result.ok ? result.data.data : null;
  } catch {
    return null;
  }
}

/** Account "Değerlendirmelerim": kendi yorumlarım + yoruma uygun kalemler. Oturum yoksa null. */
export async function getMyReviews(): Promise<CustomerReviewsResponse["data"] | null> {
  const token = await readCustomerToken();
  if (!token) return null;
  try {
    const result = await getCustomer<CustomerReviewsResponse>(
      `${customerBasePath()}/reviews`,
      token,
    );
    return result.ok ? result.data.data : null;
  } catch {
    return null;
  }
}
