/**
 * TODO-161B (ADR-137/138) — Recently Viewed PROXY route handler (record/list/clear).
 *
 * Vitrin client bileşenleri BURAYA fetch eder — gateway'e DOĞRUDAN değil (gateway URL sunucu-yalnız).
 * Kimlik: customer (`commerce_os_customer_session` → `x-customer-session`) VEYA guest visitor
 * (`commerce_os_vid` → `x-visitor-id`). Bot/prefetch tespiti + KVKK visitor hash gateway'de; ham değer
 * saklanmaz. Prefetch/purpose header'ları AYNEN iletilir (gateway prefetch'i eler). Best-effort.
 */
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { gatewayBaseUrl } from "../../../lib/server/gateway";
import { demoStoreSlug } from "../../../lib/server/env";
import { getWishlistStatus } from "../../../lib/server/wishlist";

/** Gateway yanıtındaki ürünlerin favori durumunu (TODO-159D wishlist) ekler (auth→gateway, guest→cookie). */
async function withSavedIds(json: unknown): Promise<{ data: unknown[]; savedIds: string[] }> {
  const data = Array.isArray((json as { data?: unknown[] })?.data) ? (json as { data: unknown[] }).data : [];
  const productIds = data
    .map((p) => (p && typeof p === "object" ? (p as { id?: unknown }).id : undefined))
    .filter((id): id is string => typeof id === "string");
  const saved = productIds.length > 0 ? await getWishlistStatus(productIds) : new Set<string>();
  return { data, savedIds: [...saved] };
}

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

/** Kimlik + prefetch header'larını gateway'e ileten ortak header seti. */
function forwardHeaders(request: Request, visitorId: string, customerToken: string | undefined, json: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    "x-visitor-id": visitorId,
    "user-agent": request.headers.get("user-agent") ?? "",
  };
  if (json) headers["content-type"] = "application/json";
  if (customerToken) headers["x-customer-session"] = customerToken;
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) headers["x-forwarded-for"] = fwd;
  // Prefetch/preload sinyalleri → gateway görüntülemeyi ELER (bot/prefetch sayılmaz).
  for (const h of ["sec-purpose", "purpose", "x-purpose", "x-moz"]) {
    const v = request.headers.get(h);
    if (v) headers[h] = v;
  }
  return headers;
}

function resolveIdentity(request: Request): { visitorId: string; isNewVisitor: boolean; customerToken: string | undefined } {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const existingVid = readCookie(cookieHeader, VISITOR_COOKIE);
  const visitorId = existingVid && existingVid.length > 0 ? existingVid : randomUUID();
  return {
    visitorId,
    isNewVisitor: !existingVid,
    customerToken: readCookie(cookieHeader, CUSTOMER_COOKIE),
  };
}

function withVisitorCookie(response: NextResponse, visitorId: string, isNewVisitor: boolean): NextResponse {
  if (isNewVisitor) {
    response.cookies.set(VISITOR_COOKIE, visitorId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365, // 1 yıl (opak; PII değil)
    });
  }
  return response;
}

const storePath = () => `/public/stores/${encodeURIComponent(demoStoreSlug())}/recently-viewed`;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ data: { recorded: false } }, { status: 200 });
  }
  const productId = (body as { productId?: unknown }).productId;
  const { visitorId, isNewVisitor, customerToken } = resolveIdentity(request);

  let recorded = false;
  try {
    const res = await fetch(`${gatewayBaseUrl()}${storePath()}`, {
      method: "POST",
      headers: forwardHeaders(request, visitorId, customerToken, true),
      body: JSON.stringify({ productId: typeof productId === "string" ? productId : "" }),
      cache: "no-store",
    });
    if (res.ok) {
      const json = (await res.json().catch(() => null)) as { data?: { recorded?: boolean } } | null;
      recorded = Boolean(json?.data?.recorded);
    }
  } catch {
    // best-effort: kayıt hatası UX'i etkilemez.
  }
  return withVisitorCookie(NextResponse.json({ data: { recorded } }, { status: 200 }), visitorId, isNewVisitor);
}

export async function GET(request: Request) {
  const { visitorId, isNewVisitor, customerToken } = resolveIdentity(request);
  const url = new URL(request.url);
  const limit = url.searchParams.get("limit");
  const query = limit ? `?limit=${encodeURIComponent(limit)}` : "";
  try {
    const res = await fetch(`${gatewayBaseUrl()}${storePath()}${query}`, {
      method: "GET",
      headers: forwardHeaders(request, visitorId, customerToken, false),
      cache: "no-store",
    });
    const json = res.ok ? await res.json().catch(() => ({ data: [] })) : { data: [] };
    const enriched = await withSavedIds(json);
    return withVisitorCookie(NextResponse.json(enriched, { status: 200 }), visitorId, isNewVisitor);
  } catch {
    return withVisitorCookie(NextResponse.json({ data: [], savedIds: [] }, { status: 200 }), visitorId, isNewVisitor);
  }
}

export async function DELETE(request: Request) {
  const { visitorId, isNewVisitor, customerToken } = resolveIdentity(request);
  try {
    const res = await fetch(`${gatewayBaseUrl()}${storePath()}`, {
      method: "DELETE",
      headers: forwardHeaders(request, visitorId, customerToken, false),
      cache: "no-store",
    });
    const json = res.ok ? await res.json().catch(() => ({ data: { cleared: 0 } })) : { data: { cleared: 0 } };
    return withVisitorCookie(NextResponse.json(json, { status: 200 }), visitorId, isNewVisitor);
  } catch {
    return withVisitorCookie(NextResponse.json({ data: { cleared: 0 } }, { status: 200 }), visitorId, isNewVisitor);
  }
}
