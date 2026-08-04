import { cookies } from "next/headers";
import { resolveCookieSecure } from "@commerce-os/utils";

/**
 * F3B.3 — Storefront musteri oturum cookie'si (sunucu-yalniz).
 *
 * Cookie httpOnly + (prod'da) secure'dur ve YALNIZCA opak oturum jetonunu tutar.
 * Jeton'un sha256 hash'i gateway'de CustomerSession.tokenHash olarak saklanir;
 * raw jeton DB'ye yazilmaz. Yazma/silme yalnizca Server Action / Route Handler
 * baglaminda yapilabilir (Next.js kisiti); okuma server bilesenlerinde serbesttir.
 * Jeton degeri client bundle'a girmez ve loglanmaz.
 */
const CUSTOMER_COOKIE = "commerce_os_customer_session";

// S5 — admin/store-admin ile AYNI güvenli resolver: boş/geçersiz env prod'da insecure ÜRETMEZ
// (fail-fast). Storefront customer cookie SameSite=lax (cross-site GET güvenli), httpOnly.
const COOKIE_SECURE = resolveCookieSecure(process.env.STOREFRONT_COOKIE_SECURE, {
  isProduction: process.env.NODE_ENV === "production",
  envName: "STOREFRONT_COOKIE_SECURE",
});

/** Oturum jetonunu okur (yoksa null). */
export async function readCustomerToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(CUSTOMER_COOKIE)?.value ?? null;
}

/**
 * ADR-271 — Oturum jetonunu httpOnly cookie'ye yazar (yalniz action/route handler).
 * Sabit 30g maxAge KALDIRILDI; cookie kaliciligi POLITIKADAN turer:
 *   - `rememberMe` ACIK  → KALICI cookie; `expires` = gateway'in absolute deadline'i.
 *   - `rememberMe` KAPALI → SESSION cookie (tarayici kapaninca gider).
 * Gercek gecerlilik her durumda SERVER-otoriter (idle+absolute).
 */
export async function writeCustomerToken(
  token: string,
  rememberMe: boolean,
  expiresAtIso?: string,
): Promise<void> {
  const store = await cookies();
  const expires = expiresAtIso ? new Date(expiresAtIso) : null;
  store.set(CUSTOMER_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: COOKIE_SECURE,
    ...(rememberMe && expires && !Number.isNaN(expires.getTime()) ? { expires } : {}),
  });
}

/**
 * Oturum jetonunu siler (cikis veya gecersiz oturum). S5 — set ile PARITY: aynı path/secure/
 * sameSite/httpOnly + maxAge 0 (tarayıcı gerçekten siler; yetim aynı-isim farklı-path cookie kalmaz).
 */
export async function clearCustomerToken(): Promise<void> {
  const store = await cookies();
  store.set(CUSTOMER_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: COOKIE_SECURE,
    maxAge: 0,
  });
}
