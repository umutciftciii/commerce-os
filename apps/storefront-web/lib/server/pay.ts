import type { PublicPayResolveResponse, PublicPayResultResponse } from "@commerce-os/api-client";
import { getPublic, postPublic, type FetchOutcome } from "./gateway";

/**
 * TODO-159F — Müşteri ödeme sayfası (/pay/:token) gateway erişimi.
 *
 * Token OPAQUE'tir; sipariş ID'si taşımaz. Gateway token'ı hash + TTL + store/order
 * eşleşmesiyle doğrular. Secret/credential ASLA gelmez; yalnız ALLOWLIST alanlar.
 */
export async function resolvePayToken(
  token: string,
): Promise<FetchOutcome<PublicPayResolveResponse>> {
  return getPublic<PublicPayResolveResponse>(`/public/pay/${encodeURIComponent(token)}`);
}

export interface StartPayPayload {
  scenario?: string;
  card?: { number: string; expMonth: number; expYear: number; cvc: string };
  threeDsAction?: "success" | "fail";
}

export async function startPay(
  token: string,
  payload: StartPayPayload,
): Promise<FetchOutcome<PublicPayResultResponse>> {
  return postPublic<PublicPayResultResponse>(`/public/pay/${encodeURIComponent(token)}`, {
    ...(payload.scenario ? { scenario: payload.scenario } : {}),
    ...(payload.card ? { card: payload.card } : {}),
    ...(payload.threeDsAction ? { threeDsAction: payload.threeDsAction } : {}),
  });
}
