/**
 * TODO-160 (ADR-102) — Influencer attribution first-party cookie'leri (sunucu-yalnız).
 *
 * İki cookie:
 *  - `commerce_os_attribution`: GATEWAY-imzalı opak attribution GRANT'ini taşır. İmza
 *    gateway'de üretilir/doğrulanır (SESSION_SECRET); storefront yalnız taşıyıcıdır,
 *    imza secret'ı BURADA YOK. httpOnly (JS erişemez) + lax + prod-secure. Kurcalama
 *    → gateway imzası bozulur → checkout'ta reddedilir.
 *  - `commerce_os_vid`: opak first-party ziyaretçi kimliği (unique-visitor ölçümü için;
 *    PII DEĞİL, rastgele). Gateway'e `x-visitor-id` header'ı ile iletilir ve orada
 *    HMAC'lenir (ham saklanmaz).
 *
 * Cookie yazımı yalnız Route Handler / Server Action bağlamında çalışır (Next kuralı).
 * Grant okuma (checkout server action'ında) `cookies()` ile yapılır.
 */
import { cookies } from "next/headers";

export const ATTRIBUTION_COOKIE = "commerce_os_attribution";
export const VISITOR_COOKIE = "commerce_os_vid";

/** Ziyaretçi kimliği cookie ömrü (1 yıl). Opak; secret değil. */
export const VISITOR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Grant'i checkout server action'ında okur. Kaba biçim kontrolü (opak token). */
export async function readAttributionGrant(): Promise<string | null> {
  try {
    const store = await cookies();
    const raw = store.get(ATTRIBUTION_COOKIE)?.value;
    if (!raw) return null;
    // Opak imzalı token: base64url gövdesi + "." + imza. Kaba biçim guard'ı.
    if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(raw) || raw.length > 2048) return null;
    return raw;
  } catch {
    // Cookie okunamayan bağlamlarda (ör. test) attribution yok sayılır.
    return null;
  }
}

/** Ziyaretçi kimliğini okur (varsa). Route handler request cookie'sinden de okunabilir. */
export async function readVisitorId(): Promise<string | null> {
  try {
    const store = await cookies();
    const raw = store.get(VISITOR_COOKIE)?.value;
    return raw && /^[A-Za-z0-9_-]{8,64}$/.test(raw) ? raw : null;
  } catch {
    return null;
  }
}

/** Opak ziyaretçi kimliği üretir (rastgele; anlamlı-veri taşımaz). */
export function generateVisitorId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}
