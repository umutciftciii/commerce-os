/**
 * TODO-162 (ADR-205) — Home Discovery section-analytics event PROXY route handler.
 *
 * Vitrin discovery tracker island'ı BURAYA fetch/sendBeacon eder — gateway'e DOĞRUDAN değil (gateway URL
 * sunucu-yalnız). Kimlik: customer (`commerce_os_customer_session` → `x-customer-session`) VEYA guest visitor
 * (`commerce_os_vid` → `x-visitor-id`). Per-oturum id (`x-discovery-session` header VEYA body.sessionId)
 * gateway'e iletilir (dedupe granülerliği; gateway HMAC'ler → sessionHash). Prefetch/purpose header'ları AYNEN
 * iletilir (gateway prefetch'i eler). Bot tespiti + KVKK visitor hash + section/ürün sahipliği gateway'de.
 * Best-effort → 200. Recommendation event proxy'siyle birebir simetrik (ayrı uç + ayrı gövde alanları).
 */
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { gatewayBaseUrl } from "../../../../lib/server/gateway";
import { demoStoreSlug } from "../../../../lib/server/env";

export const dynamic = "force-dynamic";

const VISITOR_COOKIE = "commerce_os_vid";
const CUSTOMER_COOKIE = "commerce_os_customer_session";

function readCookie(cookieHeader: string, name: string): string | undefined {
  return cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ data: { recorded: false, deduped: false } }, { status: 200 });
  }

  const cookieHeader = request.headers.get("cookie") ?? "";
  const existingVid = readCookie(cookieHeader, VISITOR_COOKIE);
  const visitorId = existingVid && existingVid.length > 0 ? existingVid : randomUUID();
  const customerToken = readCookie(cookieHeader, CUSTOMER_COOKIE);
  // Oturum id: header (fetch) VEYA body.sessionId (sendBeacon custom header taşıyamaz).
  const sessionId =
    request.headers.get("x-discovery-session") ??
    (typeof body.sessionId === "string" ? (body.sessionId as string) : "");

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-visitor-id": visitorId,
    "user-agent": request.headers.get("user-agent") ?? "",
  };
  if (customerToken) headers["x-customer-session"] = customerToken;
  if (sessionId) headers["x-discovery-session"] = sessionId;
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) headers["x-forwarded-for"] = fwd;
  for (const h of ["sec-purpose", "purpose", "x-purpose", "x-moz"]) {
    const v = request.headers.get(h);
    if (v) headers[h] = v;
  }

  const upstreamBody = {
    type: body.type,
    sectionId: body.sectionId,
    sectionType: body.sectionType,
    eligibilitySource: body.eligibilitySource,
    productId: body.productId ?? null,
    campaignId: body.campaignId ?? null,
    sponsoredCampaignId: body.sponsoredCampaignId ?? null,
    placement: body.placement ?? "HOME",
    dedupeKey: body.dedupeKey ?? null,
  };

  let result = { recorded: false, deduped: false };
  try {
    const res = await fetch(
      `${gatewayBaseUrl()}/public/stores/${encodeURIComponent(demoStoreSlug())}/home/discovery-events`,
      { method: "POST", headers, body: JSON.stringify(upstreamBody), cache: "no-store" },
    );
    if (res.ok) {
      const json = (await res.json().catch(() => null)) as { data?: { recorded?: boolean; deduped?: boolean } } | null;
      result = { recorded: Boolean(json?.data?.recorded), deduped: Boolean(json?.data?.deduped) };
    }
  } catch {
    // best-effort: ölçüm hatası UX'i etkilemez.
  }

  const response = NextResponse.json({ data: result }, { status: 200 });
  if (!existingVid) {
    response.cookies.set(VISITOR_COOKIE, visitorId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return response;
}
