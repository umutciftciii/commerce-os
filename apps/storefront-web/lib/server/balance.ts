/**
 * TODO-174B (ADR-281) — Vitrin "Alışveriş Bakiyem" okuma katmanı (sunucu-yalnız). Gateway'in
 * müşteri-scoped bakiye ucunu (`GET /public/stores/:slug/customer/balance`) `x-customer-session` ile
 * çağırır. description SEMANTİK KEY'dir → UI TR/EN lokalize eder (raw enum GÖSTERİLMEZ). Tutarlar
 * kanonik minor string; UI'da major'a çevrilir.
 */
import type { CustomerCreditBalanceResponse } from "@commerce-os/api-client";
import { customerBasePath } from "./customer";
import { getCustomer } from "./gateway";
import { readCustomerToken } from "./customer-cookie";

export interface BalanceData {
  availableMinor: string;
  currency: string;
  entries: CustomerCreditBalanceResponse["entries"];
}

/** Oturum açmış müşterinin alışveriş bakiyesini döndürür. Oturum yok/geçersizse boş bakiye. */
export async function getShoppingBalance(): Promise<BalanceData> {
  const token = await readCustomerToken();
  if (!token) return { availableMinor: "0", currency: "TRY", entries: [] };
  const result = await getCustomer<CustomerCreditBalanceResponse>(`${customerBasePath()}/balance`, token);
  if (!result.ok) return { availableMinor: "0", currency: "TRY", entries: [] };
  return { availableMinor: result.data.availableMinor, currency: result.data.currency, entries: result.data.entries };
}
