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
import { publicSearchResponseSchema, type PublicBrandSummary } from "@commerce-os/contracts";
import { SearchError, type SearchQuery, type SearchResult, type SearchResultItem } from "@commerce-os/search-service";
import { parseSearchQuery } from "./query-parser.js";
import {
  injectSponsoredSlots,
  tokenizeQuery,
  SPONSORED_SEARCH_LEAD_ORGANIC,
  SPONSORED_SEARCH_MAX_SLOTS,
} from "../sponsored/sponsored-core.js";

/** TODO-161 — çözülmüş sponsorlu arama adayı (item + imzalı opak token). */
export interface SponsoredSearchResolved {
  item: SearchResultItem;
  sponsoredToken: string;
}

export interface PublicSearchRoutesDeps {
  /** Store slug → aktif store (yoksa null → 404). */
  resolvePublicStore: (slug: string) => Promise<{ id: string } | null>;
  /** Read-model arama (SearchProvider.search). */
  search: (storeId: string, query: SearchQuery) => Promise<SearchResult>;
  /** Sayfadaki kategori id'leri → görünen ad (bounded; display-only). */
  resolveCategoryNames: (storeId: string, categoryIds: string[]) => Promise<Map<string, string>>;
  /**
   * TODO-165A (ADR-165A) Task 11 — Sayfadaki governed marka id'leri → `brandRef` entity projeksiyonu
   * (bounded; display-only, buildPublicProduct'taki brandMap deseniyle simetrik). Read-model yalnız
   * brandId taşır (logoUrl/description YOK) — bu bounded lookup ile hidratlanır. Opsiyonel (yoksa
   * brandRef her zaman null; mevcut arama davranışı BOZULMAZ).
   */
  resolveBrandRefs?: (storeId: string, brandIds: string[]) => Promise<Map<string, PublicBrandSummary>>;
  /**
   * TODO-155.1 — IÇ storageKey → public medya URL'i (resolveMediaUrl + MEDIA_PUBLIC_BASE_URL). Kart görselleri
   * artık read-model listing snapshot'ından gelir (ProductImage sorgusu YOK); yalnız url runtime'da türetilir.
   * storageKey DTO'ya ASLA yazılmaz — bu fonksiyon tek çıkış noktasıdır.
   */
  toPublicMediaUrl: (storageKey: string) => string;
  /**
   * TODO-161 (ADR-114/115/116) — Sponsorlu aday çözümü (opsiyonel; yoksa saf organik). Organik sonuç
   * ÜRETİLDİKTEN SONRA ayrı katmanda çağrılır; organik sıralamayı/ranking'i DEĞİŞTİRMEZ. Token GATEWAY
   * imzalıdır (impression/click ölçümü). Yalnız 1. sayfada; keyword araması VEYA kategori gezinme
   * (categorySlug) tetikler — keyword'de ürün-metni relevancy, kategori gezinmede kampanya hedef-kategori
   * eşleşmesi (subtree) aranır (TD-120 kapanışı).
   */
  resolveSponsoredSearch?: (input: {
    storeId: string;
    queryTokens: string[];
    categorySlug: string | null;
    limit: number;
  }) => Promise<SponsoredSearchResolved[]>;
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

    // TODO-165A (ADR-165A) Task 11 — sayfadaki governed marka id'leri → brandRef hidrasyonu (bounded).
    // `!= null` BİLEREK hem null hem undefined'ı eler (bkz. server.ts loadPublicBrandMap deseniyle
    // simetrik — bazı fixture/legacy satırlarda brandId hiç set edilmemiş olabilir).
    const brandIds = [
      ...new Set(result.items.map((item) => item.brandId).filter((id): id is string => id != null)),
    ];
    const brandRefs =
      deps.resolveBrandRefs && brandIds.length > 0
        ? await deps.resolveBrandRefs(store.id, brandIds)
        : new Map<string, PublicBrandSummary>();

    // IÇ listing görselini → public ALLOWLIST görseli (url türetilir; storageKey/mediaId SIZMAZ).
    const toPublicImage = (
      img: { storageKey: string; altText: string | null } | null,
      position: number,
    ) => (img ? { url: deps.toPublicMediaUrl(img.storageKey), altText: img.altText, position, variantOptionId: null } : null);

    // TODO-155.1/161 — Read-model item → public kart DTO'su (organik + sponsorlu ORTAK map). sponsored
    // bayrağı + opak token yalnız sponsorlu adayda dolu; organikte false/null (ADDITIVE).
    const toPublicProduct = (item: SearchResultItem, sponsored: boolean, sponsoredToken: string | null) => {
      const listing = item.listing;
      return {
        id: item.productId,
        slug: item.slug,
        title: item.title,
        brand: item.brand,
        // TODO-165A (ADR-165A) Task 11 — governed marka ENTITY projeksiyonu (ADDITIVE; legacy `brand`
        // serbest-metin alanı YUKARIDA DEĞİŞMEDEN kalır).
        brandRef: item.brandId ? brandRefs.get(item.brandId) ?? null : null,
        categoryLabel: item.primaryCategoryId ? categoryNames.get(item.primaryCategoryId) ?? null : null,
        minPriceMinor: item.minPriceMinor,
        maxPriceMinor: item.maxPriceMinor,
        currency: item.currency,
        availability: item.availability,
        inStock: item.inStock,
        image: toPublicImage(listing?.primaryImage ?? null, 0),
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
        campaign: item.campaign,
        sponsored,
        sponsoredToken,
      };
    };

    let products = result.items.map((item) => toPublicProduct(item, false, null));

    // TODO-161 (ADR-114/115/116/117) — Sponsorlu slot enjeksiyonu. Organik sonuç YUKARIDA üretildi ve
    // BOZULMADAN kaldı (ADR-091 karar 5). Yalnız 1. sayfa; keyword araması VEYA kategori gezinme tetikler.
    // Aynı ürün organik listede varsa organik kopya DÜŞÜRÜLÜR (sponsorlu sürüm rozetle kalır) → tek gösterim
    // (ADR-117). Sponsorlu item'lar organik pagination.totalItems'a DAHİL DEĞİL (üst-katman overlay; ADR-115).
    if (deps.resolveSponsoredSearch && result.pagination.page === 1) {
      const queryTokens = tokenizeQuery(query.q ?? null);
      const categorySlug = query.categorySlug ?? null;
      if (queryTokens.length > 0 || categorySlug) {
        try {
          const sponsored = await deps.resolveSponsoredSearch({
            storeId: store.id,
            queryTokens,
            categorySlug,
            limit: SPONSORED_SEARCH_MAX_SLOTS,
          });
          if (sponsored.length > 0) {
            const sponsoredIds = new Set(sponsored.map((s) => s.item.productId));
            products = products.filter((p) => !sponsoredIds.has(p.id));
            const sponsoredProducts = sponsored.map((s) => toPublicProduct(s.item, true, s.sponsoredToken));
            products = injectSponsoredSlots(products, sponsoredProducts, {
              leadOrganic: SPONSORED_SEARCH_LEAD_ORGANIC,
              maxSlots: SPONSORED_SEARCH_MAX_SLOTS,
            });
          }
        } catch {
          // Sponsorlu enjeksiyon best-effort: hata organik sonucu BOZMAZ (ADR-114 izolasyon).
        }
      }
    }

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
