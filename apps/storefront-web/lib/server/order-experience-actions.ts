"use server";

/**
 * TODO-174A (ADR-279) — Sipariş deneyimi değerlendirmesi mutasyon Server Action'ı.
 *
 * Oturum gerektirir (`x-customer-session`). Ownership + eligibility (iptal + teslim-edilmemiş) +
 * duplicate koruması GATEWAY'de zorlanır; burada yalnız istek iletilir. ProductReview/aggregate
 * akışına DOKUNMAZ.
 */
import type { OrderExperienceReviewResponse } from "@commerce-os/contracts";
import { sendCustomer } from "./gateway";
import { customerBasePath } from "./customer";
import { readCustomerToken } from "./customer-cookie";

export type OrderExperienceResult =
  | { ok: true; rating: number }
  | { ok: false; code: string };

/** Sipariş deneyimi değerlendirmesi oluşturur (sunucu uygunluğu doğrular). Sipariş başına tek. */
export async function submitOrderExperienceAction(input: {
  orderNumber: string;
  rating: number;
  comment?: string | null;
}): Promise<OrderExperienceResult> {
  const token = await readCustomerToken();
  if (!token) return { ok: false, code: "CUSTOMER_UNAUTHORIZED" };
  const result = await sendCustomer<OrderExperienceReviewResponse>(
    "POST",
    `${customerBasePath()}/orders/${encodeURIComponent(input.orderNumber)}/order-experience`,
    token,
    { rating: input.rating, comment: input.comment ?? undefined },
  );
  if (!result.ok) return { ok: false, code: result.code ?? "ORDER_EXPERIENCE_FAILED" };
  return { ok: true, rating: result.data.review.rating };
}
