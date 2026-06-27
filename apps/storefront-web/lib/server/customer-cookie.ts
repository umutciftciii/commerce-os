import { cookies } from "next/headers";

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
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 gun (gateway TTL'i ile uyumlu)

/** Oturum jetonunu okur (yoksa null). */
export async function readCustomerToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(CUSTOMER_COOKIE)?.value ?? null;
}

/** Oturum jetonunu httpOnly cookie'ye yazar (yalniz action/route handler). */
export async function writeCustomerToken(token: string): Promise<void> {
  const store = await cookies();
  store.set(CUSTOMER_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
    secure: process.env.NODE_ENV === "production",
  });
}

/** Oturum jetonunu siler (cikis veya gecersiz oturum). */
export async function clearCustomerToken(): Promise<void> {
  const store = await cookies();
  store.delete(CUSTOMER_COOKIE);
}
