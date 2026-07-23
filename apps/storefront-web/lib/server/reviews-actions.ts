"use server";

/**
 * TODO-159E (ADR-094) — Yorum/puanlama mutasyon Server Action'ları.
 *
 * Tümü oturum gerektirir (`x-customer-session`). Uygunluk + ownership + duplicate
 * koruması + rate-limit GATEWAY'de zorlanır; burada yalnız istek iletilir ve tipli
 * sonuç döndürülür. Oturum yoksa çağıran login'e yönlendirir.
 */
import type {
  CustomerReview,
  CustomerReviewMutationResponse,
  ReviewHelpfulResponse,
} from "@commerce-os/api-client";
import { sendCustomer } from "./gateway";
import { customerBasePath } from "./customer";
import { readCustomerToken } from "./customer-cookie";

export type ReviewMutationResult =
  | { ok: true; review: CustomerReview }
  | { ok: false; code: string };

export type HelpfulResult =
  | { ok: true; helpful: boolean; helpfulCount: number }
  | { ok: false; code: string };

/** Yeni yorum oluşturur (sunucu uygunluğu doğrular). PENDING moderasyona düşer. */
export async function createReviewAction(input: {
  orderLineId: string;
  rating: number;
  title?: string | null;
  body: string;
}): Promise<ReviewMutationResult> {
  const token = await readCustomerToken();
  if (!token) return { ok: false, code: "CUSTOMER_UNAUTHORIZED" };
  const result = await sendCustomer<CustomerReviewMutationResponse>(
    "POST",
    `${customerBasePath()}/reviews`,
    token,
    {
      orderLineId: input.orderLineId,
      rating: input.rating,
      title: input.title ?? null,
      body: input.body,
    },
  );
  if (!result.ok) return { ok: false, code: result.code ?? "REVIEW_CREATE_FAILED" };
  return { ok: true, review: result.data.data };
}

/** Kendi yorumunu düzenler; onaylıysa tekrar PENDING moderasyona döner. */
export async function updateReviewAction(input: {
  reviewId: string;
  rating: number;
  title?: string | null;
  body: string;
}): Promise<ReviewMutationResult> {
  const token = await readCustomerToken();
  if (!token) return { ok: false, code: "CUSTOMER_UNAUTHORIZED" };
  const result = await sendCustomer<CustomerReviewMutationResponse>(
    "PATCH",
    `${customerBasePath()}/reviews/${encodeURIComponent(input.reviewId)}`,
    token,
    { rating: input.rating, title: input.title ?? null, body: input.body },
  );
  if (!result.ok) return { ok: false, code: result.code ?? "REVIEW_UPDATE_FAILED" };
  return { ok: true, review: result.data.data };
}

/** APPROVED yoruma faydalı oyu (toggle). `helpful` verilirse idempotent (çift-tık güvenli). */
export async function toggleReviewHelpfulAction(
  reviewId: string,
  helpful?: boolean,
): Promise<HelpfulResult> {
  const token = await readCustomerToken();
  if (!token) return { ok: false, code: "CUSTOMER_UNAUTHORIZED" };
  const result = await sendCustomer<ReviewHelpfulResponse>(
    "POST",
    `${customerBasePath()}/reviews/${encodeURIComponent(reviewId)}/helpful`,
    token,
    { helpful },
  );
  if (!result.ok) return { ok: false, code: result.code ?? "REVIEW_HELPFUL_FAILED" };
  return { ok: true, helpful: result.data.data.helpful, helpfulCount: result.data.data.helpfulCount };
}
