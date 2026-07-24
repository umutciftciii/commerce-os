/**
 * TODO-160 (ADR-102) — Influencer tracking BFF (sunucu-yalnız).
 *
 * `/t/[token]` route handler'ından çağrılır. Gerçek TARAYICININ user-agent /
 * referer / IP bilgisini gateway'e FORWARD eder (aksi halde gateway yalnız node
 * fetch UA'sını görür → bot tespiti/analitik yanlış olurdu). Gateway click'i
 * kaydeder ve imzalı grant + güvenli hedef döner. `postPublic` custom header
 * desteklemediği için burada doğrudan fetch kullanılır (yine auth YOK).
 */
import { gatewayBaseUrl } from "./gateway";

// Gateway track yanıtı (storefront contracts'a bağlanmaz; şekil sabit — bkz. ADR-102).
interface TrackClickResponse {
  data: { grant: string | null; targetPath: string; cookieMaxAgeSeconds: number };
}

export interface TrackForward {
  userAgent: string | null;
  referer: string | null;
  ip: string | null;
  visitorId: string;
}

export interface TrackResult {
  grant: string | null;
  targetPath: string;
  cookieMaxAgeSeconds: number;
}

export async function postTrackClick(
  storeSlug: string,
  token: string,
  fwd: TrackForward,
): Promise<TrackResult | null> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-visitor-id": fwd.visitorId,
  };
  // Gerçek tarayıcı bağlamını forward et (bot tespiti + KVKK-hash için gateway'de).
  if (fwd.userAgent) headers["user-agent"] = fwd.userAgent;
  if (fwd.referer) headers["referer"] = fwd.referer;
  if (fwd.ip) headers["x-forwarded-for"] = fwd.ip;

  try {
    const response = await fetch(
      `${gatewayBaseUrl()}/public/stores/${encodeURIComponent(storeSlug)}/track/${encodeURIComponent(token)}`,
      { method: "POST", headers, body: "{}", cache: "no-store" },
    );
    if (!response.ok) return null; // 404/429 vb. → storefront güvenli fallback yapar
    const body = (await response.json()) as TrackClickResponse;
    return {
      grant: body.data.grant,
      targetPath: body.data.targetPath,
      cookieMaxAgeSeconds: body.data.cookieMaxAgeSeconds,
    };
  } catch {
    // Gateway erişilemezse yine güvenli fallback (redirect ana sayfaya).
    return null;
  }
}
