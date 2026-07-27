"use server";

/**
 * TODO-161B (ADR-138) — Recently Viewed merge Server Action'ı.
 *
 * Login/register sonrası misafir (visitorHash) görüntüleme geçmişini müşteriye idempotent merge eder.
 * Geçmiş SUNUCU-tarafındadır (wishlist'ten farklı: cookie'de ürün ref'i YOK); merge yalnız gateway'e
 * "bu visitor'ı bu customer'a birleştir" der. Gateway BOTH `x-customer-session` + `x-visitor-id` ister.
 * `commerce_os_vid` httpOnly cookie sunucuda okunur. Best-effort: hata UX'i etkilemez.
 */
import { cookies } from "next/headers";
import { gatewayBaseUrl } from "./gateway";
import { demoStoreSlug } from "./env";
import { readCustomerToken } from "./customer-cookie";

const VISITOR_COOKIE = "commerce_os_vid";

export async function mergeRecentlyViewedAction(): Promise<void> {
  const token = await readCustomerToken();
  if (!token) return;
  const store = await cookies();
  const visitorId = store.get(VISITOR_COOKIE)?.value;
  if (!visitorId) return; // Misafir kimliği yoksa merge no-op.

  try {
    await fetch(
      `${gatewayBaseUrl()}/public/stores/${encodeURIComponent(demoStoreSlug())}/recently-viewed/merge`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-customer-session": token,
          "x-visitor-id": visitorId,
        },
        body: JSON.stringify({}),
        cache: "no-store",
      },
    );
    // Guest satırları gateway'de merge sonrası temizlenir; visitor cookie ROTATE gerekmiyor (server-side
    // geçmiş boştur, sonraki view yeni satır açar). İdempotent: tekrar merge şişirmez.
  } catch {
    // best-effort
  }
}
