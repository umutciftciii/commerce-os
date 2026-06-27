import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * F3B.2 — Public payment access token.
 *
 * Checkout sonrasi ödeme test sayfasi yalnizca orderId ile acilamaz. Kisa omurlu
 * bir token uretilir; PLAIN token sadece checkout response'unda doner, DB'ye
 * yalnizca HMAC hash'i (`accessTokenHash`) + TTL (`accessTokenExpiresAt`) yazilir.
 * Public state/submit uclari token'i dogrulamadan bilgi donmez/islem yapmaz.
 */

export const PAYMENT_ACCESS_TOKEN_TTL_SECONDS = 30 * 60;

export interface PaymentAccessToken {
  /** Yalnizca checkout response'unda doner; DB'ye yazilmaz. */
  token: string;
  /** DB'ye yazilan HMAC hash. */
  tokenHash: string;
  expiresAt: Date;
}

function hash(token: string, secret: string): string {
  return createHmac("sha256", secret).update(token).digest("hex");
}

export function createPaymentAccessToken(
  secret: string,
  ttlSeconds: number = PAYMENT_ACCESS_TOKEN_TTL_SECONDS,
  now: Date = new Date(),
): PaymentAccessToken {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    tokenHash: hash(token, secret),
    expiresAt: new Date(now.getTime() + ttlSeconds * 1000),
  };
}

export function hashPaymentAccessToken(token: string, secret: string): string {
  return hash(token, secret);
}

/** Sabit zamanli hash karsilastirmasi + TTL kontrolu. */
export function verifyPaymentAccessToken(
  presentedToken: string | null | undefined,
  stored: { accessTokenHash: string | null; accessTokenExpiresAt: Date | null },
  secret: string,
  now: Date = new Date(),
): boolean {
  if (!presentedToken || !stored.accessTokenHash || !stored.accessTokenExpiresAt) {
    return false;
  }
  if (stored.accessTokenExpiresAt.getTime() <= now.getTime()) {
    return false;
  }
  const expected = Buffer.from(stored.accessTokenHash, "hex");
  const actual = Buffer.from(hash(presentedToken, secret), "hex");
  if (expected.length !== actual.length) {
    return false;
  }
  return timingSafeEqual(expected, actual);
}
