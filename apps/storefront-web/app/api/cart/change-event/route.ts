/**
 * TODO-168 (ADR-267) — Cart Change Awareness analytics PROXY route handler (best-effort).
 *
 * Vitrin client BURAYA fetch/sendBeacon eder — gateway'e DOĞRUDAN değil (gateway URL sunucu-yalnız).
 * Kimlik: customer (`commerce_os_customer_session` → `x-customer-session`). KVKK: cartId gateway'de
 * HMAC-hash'lenir (ham saklanmaz). `(storeId, dedupeKey)` idempotent → çift-emit 0 yeni satır. Bot/
 * prefetch header'ları AYNEN iletilir (gateway eler). Ölçüm hatası UX'i ETKİLEMEZ → her yol 200.
 */
import { NextResponse } from "next/server";
import { gatewayBaseUrl } from "../../../../lib/server/gateway";
import { demoStoreSlug } from "../../../../lib/server/env";

export const dynamic = "force-dynamic";

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
  const customerToken = readCookie(cookieHeader, CUSTOMER_COOKIE);

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": request.headers.get("user-agent") ?? "",
  };
  if (customerToken) headers["x-customer-session"] = customerToken;
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) headers["x-forwarded-for"] = fwd;
  for (const h of ["sec-purpose", "purpose", "x-purpose", "x-moz"]) {
    const v = request.headers.get(h);
    if (v) headers[h] = v;
  }

  // Allowlist gövde (client düz değere güvenilmez; gateway zod ile yeniden doğrular).
  const upstreamBody = {
    cartId: body.cartId,
    changeType: body.changeType,
    eventType: body.eventType,
    fingerprint: body.fingerprint,
    severity: body.severity ?? undefined,
    variantId: body.variantId ?? undefined,
    oldMinor: body.oldMinor ?? undefined,
    newMinor: body.newMinor ?? undefined,
    currency: body.currency ?? undefined,
    placement: body.placement ?? undefined,
  };

  let result = { recorded: false, deduped: false };
  try {
    const res = await fetch(
      `${gatewayBaseUrl()}/public/stores/${encodeURIComponent(demoStoreSlug())}/cart-change-events`,
      { method: "POST", headers, body: JSON.stringify(upstreamBody), cache: "no-store" },
    );
    if (res.ok) {
      const json = (await res.json().catch(() => null)) as { data?: { recorded?: boolean; deduped?: boolean } } | null;
      result = { recorded: Boolean(json?.data?.recorded), deduped: Boolean(json?.data?.deduped) };
    }
  } catch {
    // best-effort: ölçüm hatası UX'i etkilemez.
  }
  return NextResponse.json({ data: result }, { status: 200 });
}
