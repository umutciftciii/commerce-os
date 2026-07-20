/**
 * TODO-156E (ADR-084) — Faz 2C-8E · Public Autocomplete & Discovery UCU.
 *
 * `GET /public/stores/:storeSlug/autocomplete?q=...&limit=...` — kullanıcı auth YOK; store slug ile çözülür.
 * AYRI HAFİF yol: `SearchProvider.suggest` (facet/pagination YOK). Yalnız read-model. Yanıt küçük + hızlı
 * (bounded gruplar). Process-yerel TTL cache (Redis GEREKMEZ). Yanıt publicAutocompleteResponseSchema
 * ALLOWLIST'inden geçer (storageKey/internal alan sızmaz — kart görseli url'i tek çıkış: toPublicMediaUrl).
 *
 * Hata: parser → 400; bilinmeyen store → 404. suggest() kontrollü hata FIRLATMAZ (boş sonuç = boş gruplar);
 * beklenmeyen hata global handler'a düşer (500; SQL/internal mesaj sızmaz).
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { publicAutocompleteResponseSchema } from "@commerce-os/contracts";
import type { SuggestQuery, SuggestResult } from "@commerce-os/search-service";
import { parseAutocompleteQuery, autocompleteCacheKey } from "./autocomplete-parser.js";
import { createAutocompleteCache, type AutocompleteCache } from "./autocomplete-cache.js";

export interface PublicAutocompleteRoutesDeps {
  /** Store slug → aktif store (yoksa null → 404). */
  resolvePublicStore: (slug: string) => Promise<{ id: string } | null>;
  /** Read-model autocomplete (SearchProvider.suggest). */
  suggest: (storeId: string, query: SuggestQuery) => Promise<SuggestResult>;
  /** İÇ storageKey → public medya URL'i (kart kapak görseli; storageKey DTO'ya sızmaz). */
  toPublicMediaUrl: (storageKey: string) => string;
  /** Ürün kartı ana kategori id'leri → görünen ad (bounded; display-only; search ucuyla AYNI desen). */
  resolveCategoryNames: (storeId: string, categoryIds: string[]) => Promise<Map<string, string>>;
  /** Test/DI için cache override (varsayılan: process-yerel TTL cache). */
  cache?: AutocompleteCache;
  /** Test/DI için saat (varsayılan Date.now). */
  now?: () => number;
}

const searchParam = z.object({ storeSlug: z.string().min(1).max(120) });

function errorBody(code: string, message: string) {
  return { error: { code, message } };
}

export function registerPublicAutocompleteRoutes(app: FastifyInstance, deps: PublicAutocompleteRoutesDeps) {
  const cache = deps.cache ?? createAutocompleteCache();
  const now = deps.now ?? (() => Date.now());

  app.get("/public/stores/:storeSlug/autocomplete", async (request, reply) => {
    const params = searchParam.parse(request.params);

    // 1) Query parse (kontratlı hata → 400).
    const parsed = parseAutocompleteQuery(request.query);
    if (!parsed.ok) {
      return reply.code(400).send(errorBody(parsed.code, parsed.message));
    }
    const query = parsed.value;

    // 2) Store çöz (yoksa 404).
    const store = await deps.resolvePublicStore(params.storeSlug);
    if (!store) {
      return reply.code(404).send(errorBody("STORE_NOT_FOUND", "Store not found."));
    }

    // 3) Cache (process-yerel TTL). Anahtar store + normalize q + ürün limiti.
    const key = autocompleteCacheKey(store.id, query);
    const cached = cache.get(key, now());
    if (cached) {
      reply.header("x-autocomplete-cache", "hit");
      return cached;
    }

    // 4) Read-model önerileri.
    const result = await deps.suggest(store.id, query);

    // 4b) Ürün kartı kategori etiketleri — bounded, display-only (search ucuyla AYNI desen; ProductCategory
    // JOIN'i read-model'de değil, yalnız görünen ad çözümü). Kategori id DTO'ya sızmaz.
    const categoryIds = [
      ...new Set(result.products.map((p) => p.primaryCategoryId).filter((id): id is string => id !== null)),
    ];
    const categoryNames =
      categoryIds.length > 0
        ? await deps.resolveCategoryNames(store.id, categoryIds)
        : new Map<string, string>();

    // 5) ALLOWLIST projeksiyonu (storageKey → public url; internal alan/id sızmaz; FİYAT taşınmaz).
    const body = publicAutocompleteResponseSchema.parse({
      query: result.query,
      suggestions: result.suggestions,
      products: result.products.map((p) => ({
        id: p.productId,
        slug: p.slug,
        title: p.title,
        brand: p.brand,
        categoryLabel: p.primaryCategoryId ? categoryNames.get(p.primaryCategoryId) ?? null : null,
        availability: p.availability,
        inStock: p.inStock,
        image: p.image
          ? { url: deps.toPublicMediaUrl(p.image.storageKey), altText: p.image.altText, position: 0, variantOptionId: null }
          : null,
        hasCampaign: p.hasCampaign,
        campaignLabel: p.campaignLabel,
        isNew: p.isNew,
      })),
      categories: result.categories.map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        path: c.path,
      })),
      brands: result.brands.map((b) => ({ brand: b.brand, productCount: b.productCount })),
      total: result.total,
    });

    cache.set(key, body, now());
    reply.header("x-autocomplete-cache", "miss");
    return body;
  });
}
