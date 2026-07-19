/**
 * TODO-155 (ADR-079) — Faz 2C-8B · Public Search & Facet UÇLARI.
 *
 * `GET /public/stores/:storeSlug/search` — kullanıcı auth YOK; store `:storeSlug` ile çözülür.
 * Arama/facet/pagination YALNIZ search read-model'den gelir (SearchProvider.search); Product/EAV
 * tabloları source-of-truth gibi yeniden JOIN EDİLMEZ (ADR-079 kilidi). Kategori adı + kapak görseli
 * SADECE dönen SAYFA için bounded HİDRASYON'dur (arama mantığı değil; mevcut PLP deseniyle simetrik,
 * N+1 yok). Yanıt publicSearchResponseSchema ALLOWLIST'inden geçer (internal alan sızmaz).
 *
 * Hata eşleme: SearchError.code → CATEGORY_NOT_FOUND=404, aksi=400. Parser hataları 400. Beklenmeyen
 * hata global handler'a düşer (500; SQL/internal mesaj sızmaz).
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { publicSearchResponseSchema } from "@commerce-os/contracts";
import { SearchError, type SearchQuery, type SearchResult } from "@commerce-os/search-service";
import { parseSearchQuery } from "./query-parser.js";

export interface PublicSearchRoutesDeps {
  /** Store slug → aktif store (yoksa null → 404). */
  resolvePublicStore: (slug: string) => Promise<{ id: string } | null>;
  /** Read-model arama (SearchProvider.search). */
  search: (storeId: string, query: SearchQuery) => Promise<SearchResult>;
  /** Sayfadaki kategori id'leri → görünen ad (bounded; display-only). */
  resolveCategoryNames: (storeId: string, categoryIds: string[]) => Promise<Map<string, string>>;
  /**
   * TODO-155.1 — IÇ storageKey → public medya URL'i (resolveMediaUrl + MEDIA_PUBLIC_BASE_URL). Kart görselleri
   * artık read-model listing snapshot'ından gelir (ProductImage sorgusu YOK); yalnız url runtime'da türetilir.
   * storageKey DTO'ya ASLA yazılmaz — bu fonksiyon tek çıkış noktasıdır.
   */
  toPublicMediaUrl: (storageKey: string) => string;
}

const searchParam = z.object({ storeSlug: z.string().min(1).max(120) });

function errorBody(code: string, message: string) {
  return { error: { code, message } };
}

export function registerPublicSearchRoutes(app: FastifyInstance, deps: PublicSearchRoutesDeps) {
  app.get("/public/stores/:storeSlug/search", async (request, reply) => {
    const params = searchParam.parse(request.params);

    // 1) Query parse + doğrulama (kontratlı hata → 400).
    const parsed = parseSearchQuery(request.query);
    if (!parsed.ok) {
      return reply.code(400).send(errorBody(parsed.code, parsed.message));
    }
    const query = parsed.value;

    // 2) Store çöz (yoksa 404).
    const store = await deps.resolvePublicStore(params.storeSlug);
    if (!store) {
      return reply.code(404).send(errorBody("STORE_NOT_FOUND", "Store not found."));
    }

    // 3) Read-model araması (kontrollü hataları eşle; SQL mesajı sızmaz).
    let result: SearchResult;
    try {
      result = await deps.search(store.id, query);
    } catch (error) {
      if (error instanceof SearchError) {
        const status = error.code === "CATEGORY_NOT_FOUND" ? 404 : 400;
        return reply.code(status).send(errorBody(error.code, error.message));
      }
      throw error; // beklenmeyen → global handler (500).
    }

    // 4) Sayfa hidrasyonu (bounded; display-only): YALNIZ kategori adları. Kart görselleri/ticari alanlar
    // read-model listing snapshot'ından gelir (ProductImage/Variant/Promotion join'i YOK — ADR-079 kilidi).
    const categoryIds = [
      ...new Set(
        result.items
          .map((item) => item.primaryCategoryId)
          .filter((id): id is string => id !== null),
      ),
    ];
    const categoryNames =
      categoryIds.length > 0
        ? await deps.resolveCategoryNames(store.id, categoryIds)
        : new Map<string, string>();

    // IÇ listing görselini → public ALLOWLIST görseli (url türetilir; storageKey/mediaId SIZMAZ).
    const toPublicImage = (
      img: { storageKey: string; altText: string | null } | null,
      position: number,
    ) => (img ? { url: deps.toPublicMediaUrl(img.storageKey), altText: img.altText, position, variantOptionId: null } : null);

    const products = result.items.map((item) => {
      const listing = item.listing;
      return {
        id: item.productId,
        slug: item.slug,
        title: item.title,
        brand: item.brand,
        categoryLabel: item.primaryCategoryId
          ? categoryNames.get(item.primaryCategoryId) ?? null
          : null,
        minPriceMinor: item.minPriceMinor,
        maxPriceMinor: item.maxPriceMinor,
        currency: item.currency,
        availability: item.availability,
        inStock: item.inStock,
        image: toPublicImage(listing?.primaryImage ?? null, 0),
        // TODO-155.1 — Listing projection (read-model snapshot; ikinci hydration turu YOK).
        compareAtMinor: item.compareAtMinor,
        discountPercent: item.discountPercent,
        omnibusPreviousPriceMinor: item.omnibusPreviousPriceMinor,
        secondaryImage: toPublicImage(listing?.secondaryImage ?? null, 1),
        swatches: (listing?.swatches ?? []).map((swatch) => ({
          optionId: swatch.optionId,
          label: swatch.label,
          colorHex: swatch.colorHex,
          imageUrl: swatch.image ? deps.toPublicMediaUrl(swatch.image.storageKey) : null,
          isDefault: swatch.isDefault,
        })),
        swatchTotalCount: listing?.swatchTotalCount ?? 0,
      };
    });

    // 5) ALLOWLIST projeksiyonu (internal alan sızmaz).
    return publicSearchResponseSchema.parse({
      query: query.q ?? null,
      category: query.categorySlug ?? null,
      sort: result.sort,
      appliedFilters: {
        minPrice: query.minPrice ?? null,
        maxPrice: query.maxPrice ?? null,
        inStock: query.inStock ?? false,
        attributes: query.filters.map((f) => ({
          code: f.code,
          values: f.values ?? [],
          min: f.min ?? null,
          max: f.max ?? null,
          bool: null,
        })),
      },
      pagination: result.pagination,
      facets: result.facets,
      products,
    });
  });
}
