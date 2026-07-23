"use server";

import type { PublicPayResultResponse } from "@commerce-os/api-client";
import { startPay } from "./pay";

export type PayActionResult =
  | { ok: true; data: PublicPayResultResponse }
  | { ok: false; code: string | null };

/**
 * TODO-159F — Müşteri ödeme sayfası "Öde" aksiyonu. Bu fazda yalnız MOCK sandbox
 * tamamlanabilir; sunucu senaryoyu (success) uygular. Gerçek provider kontrollü hata döner.
 * Nihai ödeme otoritesi webhook/sunucudur; istemci tutar/durum belirleyemez.
 */
export async function payAction(token: string, scenario: string): Promise<PayActionResult> {
  const outcome = await startPay(token, { scenario });
  if (!outcome.ok) {
    return { ok: false, code: outcome.code };
  }
  return { ok: true, data: outcome.data };
}
