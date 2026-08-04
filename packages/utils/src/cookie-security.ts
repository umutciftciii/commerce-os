/**
 * S5 (post-audit hardening) — Cookie güvenlik env'lerinin ORTAK güvenli parser'ı (üç uygulama:
 * Platform Admin, Store Admin, Storefront). Amaç: `ADMIN_COOKIE_SECURE=""` gibi boş/geçersiz env'in
 * production'da yanlışlıkla `Secure=false` üretmesini ENGELLEMEK (footgun).
 *
 * Kurallar:
 *  - undefined / boş / whitespace → default (production: Secure=true, aksi: false)
 *  - "true"  → true
 *  - "false" → dev/test: false; PRODUCTION'da FAIL-FAST (throw) — insecure cookie üretilemez
 *  - geçersiz → production: fail-fast; dev/test: default (false)
 * Session cookie ile CSRF cookie AYNI policy'yi kullanır (çağıran taraf aynı resolver'ı çağırır).
 */

/** Cookie Secure bayrağını güvenli çözer (S5). Production'da insecure config fail-fast. */
export function resolveCookieSecure(
  raw: string | undefined | null,
  opts: { isProduction: boolean; envName?: string },
): boolean {
  const name = opts.envName ?? "COOKIE_SECURE";
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : undefined;

  // undefined / boş string / whitespace → default (unset gibi davran).
  if (v === undefined || v === "") return opts.isProduction;

  if (v === "true") return true;

  if (v === "false") {
    if (opts.isProduction) {
      throw new Error(
        `[cookie-security] ${name}=false reddedildi: production'da insecure cookie üretilemez. ` +
          `Env'i unset bırakın (default Secure) veya "true" yapın.`,
      );
    }
    return false;
  }

  // Geçersiz değer.
  if (opts.isProduction) {
    throw new Error(
      `[cookie-security] ${name} geçersiz değer: ${JSON.stringify(raw)}. ` +
        `production'da yalnız "true" (veya unset=default Secure) kabul edilir.`,
    );
  }
  return opts.isProduction; // dev/test: geçersiz → güvenli default (false)
}

/** SameSite güvenli parse: "strict"/"lax"; boş/geçersiz → "lax". Session + CSRF ORTAK kullanır. */
export function resolveSameSite(raw: string | undefined | null): "lax" | "strict" {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : undefined;
  return v === "strict" ? "strict" : "lax";
}
