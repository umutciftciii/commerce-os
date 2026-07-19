/**
 * TODO-156E (ADR-084) — Storefront autocomplete BFF (sunucu-yalnız).
 *
 * `GET /public/stores/:slug/autocomplete` public ucunu (AUTH YOK, `no-store`) çağırır; yanıtı
 * `publicAutocompleteResponseSchema` ALLOWLIST'iyle DOĞRULAR (parse hatası → kontrollü error). Bu modül
 * NEXT_PUBLIC değildir → client bundle'a girmez; gateway URL'i yalnız sunucuda çözülür (tarayıcı gateway'e
 * DOĞRUDAN gitmez — mevcut `/media` dışı desenle simetrik). Route handler (`app/api/autocomplete`) bunu proxy'ler.
 */
import type { PublicAutocompleteResponse } from "@commerce-os/api-client";
import { publicAutocompleteResponseSchema } from "@commerce-os/api-client";
import { demoStoreSlug } from "./env";
import { getPublic } from "./gateway";

export type AutocompleteFailure = "no-store" | "bad-request" | "error";

export type AutocompleteResult =
  | { ok: true; data: PublicAutocompleteResponse }
  | { ok: false; reason: AutocompleteFailure };

export async function getStorefrontAutocomplete(q: string, limit?: number): Promise<AutocompleteResult> {
  const params = new URLSearchParams({ q });
  if (limit && Number.isFinite(limit)) params.set("limit", String(Math.floor(limit)));
  const path = `/public/stores/${encodeURIComponent(demoStoreSlug())}/autocomplete?${params.toString()}`;

  let outcome;
  try {
    outcome = await getPublic<unknown>(path);
  } catch {
    return { ok: false, reason: "error" };
  }

  if (!outcome.ok) {
    if (outcome.status === 404) return { ok: false, reason: "no-store" };
    if (outcome.status === 400) return { ok: false, reason: "bad-request" };
    return { ok: false, reason: "error" };
  }

  const parsed = publicAutocompleteResponseSchema.safeParse(outcome.data);
  if (!parsed.success) return { ok: false, reason: "error" };
  return { ok: true, data: parsed.data };
}
