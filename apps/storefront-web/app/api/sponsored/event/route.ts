/**
 * TODO-161 (ADR-118) — Sponsorlu event PROXY route handler (impression/click/cart).
 *
 * Vitrin client bileşenleri BURAYA fetch eder — gateway'e DOĞRUDAN değil (gateway URL'i
 * sunucu-yalnız kalır). Gerçek kullanıcının user-agent'ı + first-party visitor id + IP
 * gateway'e HEADER olarak iletilir (bot tespiti + KVKK visitor hash gateway'de; ham değer
 * saklanmaz). Token GATEWAY-imzalıdır → istemci campaign/product BELİRLEYEMEZ. Best-effort:
 * hata durumunda 200 (ölçüm ucu; UX'i etkilemez).
 */
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { gatewayBaseUrl } from "../../../../lib/server/gateway";
import { demoStoreSlug } from "../../../../lib/server/env";

export const dynamic = "force-dynamic";

const VISITOR_COOKIE = "commerce_os_vid";
const EVENT_TYPES = new Set(["IMPRESSION", "CLICK", "CART"]);

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ recorded: false }, { status: 200 });
  }
  const type = (body as { type?: unknown }).type;
  const token = (body as { token?: unknown }).token;
  const source = (body as { source?: unknown }).source;
  if (typeof type !== "string" || !EVENT_TYPES.has(type) || typeof token !== "string" || token.length === 0) {
    return NextResponse.json({ recorded: false }, { status: 200 });
  }

  // First-party visitor id (opak; KVKK: gateway HMAC ile hash'ler, ham saklamaz). Yoksa üret.
  const cookieHeader = request.headers.get("cookie") ?? "";
  const existingVid = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${VISITOR_COOKIE}=`))
    ?.slice(VISITOR_COOKIE.length + 1);
  const visitorId = existingVid && existingVid.length > 0 ? existingVid : randomUUID();

  const userAgent = request.headers.get("user-agent") ?? "";
  const forwardedFor = request.headers.get("x-forwarded-for") ?? "";

  let recorded = false;
  try {
    const res = await fetch(
      `${gatewayBaseUrl()}/public/stores/${encodeURIComponent(demoStoreSlug())}/sponsored/events`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": userAgent,
          "x-visitor-id": visitorId,
          ...(forwardedFor ? { "x-forwarded-for": forwardedFor } : {}),
        },
        body: JSON.stringify({ type, token, source: typeof source === "string" ? source : null }),
        cache: "no-store",
      },
    );
    if (res.ok) {
      const json = (await res.json().catch(() => null)) as { data?: { recorded?: boolean } } | null;
      recorded = Boolean(json?.data?.recorded);
    }
  } catch {
    // best-effort: ölçüm hatası UX'i etkilemez.
  }

  const response = NextResponse.json({ recorded }, { status: 200 });
  if (!existingVid) {
    response.cookies.set(VISITOR_COOKIE, visitorId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365, // 1 yıl (opak; PII değil)
    });
  }
  return response;
}
