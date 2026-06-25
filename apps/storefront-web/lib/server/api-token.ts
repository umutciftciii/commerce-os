import { createApiClient } from "@commerce-os/api-client";
import { storefrontPlatformCredentials } from "./env";

// Savunma amacli koruma: bu modul yalnizca sunucuda calismalidir. Bir tarayici
// ortaminda (window tanimli) yuklenirse erken ve net sekilde patlar; boylece
// token mantigi yanlislikla client bundle'a tasinmaz.
if (typeof window !== "undefined") {
  throw new Error("api-token: server-only module imported in a browser context.");
}

/**
 * Sunucu-tarafi katalog token yoneticisi (F3A).
 *
 * Gateway'de public katalog ucu olmadigindan vitrin, platform-admin kimligiyle
 * sunucuda oturum acar ve bearer token'i SUNUCU BELLEGINDE onbellekler. Token:
 *  - hicbir zaman cookie'ye yazilmaz (public vitrin platform admin session
 *    cookie'si KULLANMAZ),
 *  - hicbir zaman istemciye/log'a/HTML'e serialize edilmez,
 *  - yalnizca sunucu bilesenleri ve sunucu yardimcilari tarafindan okunur.
 *
 * `server-only` importu, bu modulun yanlislikla bir client bundle'a girmesini
 * derleme zamaninda hata haline getirir. Gecici cozumdur; kalici cozum
 * gateway'de public-read katalog ucudur (bkz. docs/TECHNICAL_DEBT.md).
 */

interface CachedToken {
  token: string;
  expiresAt: number;
}

// Token onbellegi sona ermeden bu kadar once yenilenir (clock-skew tamponu).
const EXPIRY_SKEW_MS = 60_000;

let cached: CachedToken | null = null;
let inFlight: Promise<string> | null = null;

function isFresh(entry: CachedToken | null, now: number): entry is CachedToken {
  return entry !== null && entry.expiresAt - EXPIRY_SKEW_MS > now;
}

async function login(): Promise<string> {
  const { email, password } = storefrontPlatformCredentials();
  const result = await createApiClient().auth.platformLogin({ email, password });
  cached = { token: result.token, expiresAt: new Date(result.expiresAt).getTime() };
  return result.token;
}

/**
 * Gecerli bir sunucu token'i doner; onbellek bos/suresinin dolmasina yakinsa
 * yeniden oturum acar. Es zamanli cagrilar tek bir login'i paylasir.
 */
export async function getCatalogToken(): Promise<string> {
  const now = Date.now();
  if (isFresh(cached, now)) {
    return cached.token;
  }
  if (!inFlight) {
    inFlight = login().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

/** 401/oturum gecersizliginde onbellegi temizler; sonraki cagri yeniden login eder. */
export function invalidateCatalogToken(): void {
  cached = null;
}

/** Test izolasyonu icin tum onbellek/durumu sifirlar. */
export function resetCatalogTokenForTests(): void {
  cached = null;
  inFlight = null;
}
