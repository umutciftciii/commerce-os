import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Builder Preview Token (TODO-164A · ADR-228)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * DURUMSUZ (stateless) imzalı token: storeId + themeId + exp taşır. Store-admin
 * builder iframe'i storefront'a bu token'ı geçirir; storefront gateway'in public
 * preview projection'ını çeker. İzolasyon garantileri:
 *   - Token STORE + THEME scoped → başka store'un draft'ı açılamaz.
 *   - Kısa ömürlü (varsayılan 10 dk) → sızsa bile hızla geçersiz.
 *   - HMAC (SESSION_SECRET) imzalı → istemci uyduramaz.
 *   - DB'ye yazılmaz (durumsuz); production tema cache'inden AYRI (yazmaz).
 *
 * Biçim: `base64url(payloadJson).base64url(hmac)`. Sabit-zaman doğrulama.
 */

export const THEME_PREVIEW_TOKEN_TTL_SECONDS = 10 * 60;

export interface PreviewTokenPayload {
  storeId: string;
  themeId: string;
  /** Epoch saniye. */
  exp: number;
}

function sign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function createPreviewToken(
  storeId: string,
  themeId: string,
  secret: string,
  ttlSeconds: number = THEME_PREVIEW_TOKEN_TTL_SECONDS,
  nowMs: number = Date.now(),
): { token: string; expiresAt: Date } {
  const exp = Math.floor(nowMs / 1000) + ttlSeconds;
  const payload: PreviewTokenPayload = { storeId, themeId, exp };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = sign(body, secret);
  return { token: `${body}.${sig}`, expiresAt: new Date(exp * 1000) };
}

/** Token'ı doğrular (imza + TTL). Geçersiz/süresi dolmuş → null. */
export function verifyPreviewToken(
  token: string | null | undefined,
  secret: string,
  nowMs: number = Date.now(),
): PreviewTokenPayload | null {
  if (!token || typeof token !== "string") return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expectedSig = sign(body, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let payload: PreviewTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as PreviewTokenPayload;
  } catch {
    return null;
  }
  if (
    !payload ||
    typeof payload.storeId !== "string" ||
    typeof payload.themeId !== "string" ||
    typeof payload.exp !== "number"
  ) {
    return null;
  }
  if (payload.exp * 1000 <= nowMs) return null;
  return payload;
}
