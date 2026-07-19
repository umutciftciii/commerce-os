/**
 * TODO-156E (ADR-084) — Storefront autocomplete PROXY route handler.
 *
 * Tarayıcı (client combobox) BURAYA fetch eder — gateway'e DOĞRUDAN değil. Böylece gateway URL'i sunucu-yalnız
 * kalır (mevcut BFF deseniyle simetrik; sadece `/media` rewrite var). Bu handler `getStorefrontAutocomplete`
 * BFF'ini çağırır (allowlist doğrulama + hata sınıflaması). Boş/kısa q → 400; bilinmeyen store → 502-benzeri
 * "error" (client gracefully boş gösterir). Kısa `Cache-Control` (private) — istemci cache'ini destekler.
 */
import { NextResponse } from "next/server";
import { getStorefrontAutocomplete } from "../../../lib/server/autocomplete";

export const dynamic = "force-dynamic";

/** İstemci min tetik uzunluğu (sunucu da ≥1 ister; burada 1). */
const MIN_Q = 1;
const MAX_Q = 100;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < MIN_Q || q.length > MAX_Q) {
    return NextResponse.json({ error: { code: "INVALID_AUTOCOMPLETE_QUERY" } }, { status: 400 });
  }

  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw && /^\d+$/.test(limitRaw) ? Number(limitRaw) : undefined;

  const result = await getStorefrontAutocomplete(q, limit);
  if (!result.ok) {
    // Client tarafı boş sonuç gibi ele alır (dropdown kırılmaz); durum kodu tanısaldır.
    const status = result.reason === "bad-request" ? 400 : 502;
    return NextResponse.json({ error: { code: result.reason } }, { status });
  }

  return NextResponse.json(result.data, {
    status: 200,
    headers: { "Cache-Control": "private, max-age=15" },
  });
}
