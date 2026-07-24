/**
 * TODO-161 (ADR-118) — Sponsorlu event istemci izleyici (client-only).
 *
 * Impression/click/cart event'lerini vitrin BFF proxy'sine (`/api/sponsored/event`) gönderir —
 * gateway'e DOĞRUDAN değil. CLICK'te ayrıca token, checkout attribution için `commerce_os_sponsored`
 * first-party cookie'sine (bounded JSON dizi) eklenir. Token GATEWAY-imzalıdır; forge edilemez
 * (gateway imzayı + ürünün siparişte var olduğunu doğrular). Best-effort: hata UX'i etkilemez.
 */
"use client";

export type SponsoredEventType = "IMPRESSION" | "CLICK" | "CART";

const SPONSORED_COOKIE = "commerce_os_sponsored";
const MAX_TOKENS = 48;
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 gün (attribution penceresiyle uyumlu)

/** Event'i best-effort gönderir (sendBeacon → fetch fallback). */
export function trackSponsoredEvent(type: SponsoredEventType, token: string, source?: string): void {
  if (!token) return;
  const payload = JSON.stringify({ type, token, source: source ?? null });
  try {
    if (type === "IMPRESSION" && typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([payload], { type: "application/json" });
      navigator.sendBeacon("/api/sponsored/event", blob);
      return;
    }
    void fetch("/api/sponsored/event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // best-effort
  }
}

/** CLICK: event gönder + token'ı attribution cookie'sine ekle (checkout için). */
export function trackSponsoredClick(token: string, source?: string): void {
  trackSponsoredEvent("CLICK", token, source);
  rememberSponsoredGrant(token);
}

/** Token'ı `commerce_os_sponsored` cookie'sine ekler (tekilleştirilmiş, bounded). */
export function rememberSponsoredGrant(token: string): void {
  if (typeof document === "undefined" || !token) return;
  try {
    const existing = readCookieTokens();
    if (existing.includes(token)) return;
    const next = [...existing, token].slice(-MAX_TOKENS);
    // SameSite=Lax + path=/; httpOnly DEĞİL (sunucu okur, ama imza forge edilemez → güvenli).
    document.cookie = `${SPONSORED_COOKIE}=${encodeURIComponent(JSON.stringify(next))}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
  } catch {
    // best-effort
  }
}

function readCookieTokens(): string[] {
  try {
    const match = document.cookie
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${SPONSORED_COOKIE}=`));
    if (!match) return [];
    const raw = decodeURIComponent(match.slice(SPONSORED_COOKIE.length + 1));
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}
