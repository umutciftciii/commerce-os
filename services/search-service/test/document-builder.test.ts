import { describe, expect, it } from "vitest";
import { buildSearchDocument } from "../src/document-builder.js";
import type {
  SearchSourceCategoryAttribute,
  SearchSourceProduct,
  SearchSourceProductAttributeValue,
  SearchSourceVariant,
  SearchSourceVariantAttributeValue,
} from "../src/types.js";

/**
 * TODO-154 (ADR-079) — Faz 2C-8A · Deterministik document builder testleri (SAF; DB'siz).
 * Section 9 senaryolarının çekirdeği: indeksleme, min/max fiyat, stok, filterable ürün/varyant
 * attribute, dedupe, typed değerler, archived davranışı, unpublished→removed.
 */

const CATEGORY_ID = "cat_1";

function source(overrides: Partial<SearchSourceProduct> = {}): SearchSourceProduct {
  return {
    id: "prod_1",
    storeId: "store_1",
    title: "Test Ürün",
    slug: "test-urun",
    brand: "Acme",
    description: "Açıklama",
    status: "ACTIVE",
    priceVisible: true,
    primaryCategoryId: CATEGORY_ID,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-02T00:00:00Z"),
    variants: [],
    categoryAttributes: [],
    productAttributeValues: [],
    variantAttributeValues: [],
    // TODO-155.2 — variant eksen option seçimleri + kampanya kaynakları (varsayılan boş → snapshot null).
    variantOptionValues: [],
    categoryIds: [CATEGORY_ID],
    campaigns: [],
    evaluationNow: new Date("2026-07-15T12:00:00Z"),
    // TODO-155.1 — listing projection kaynakları (varsayılan: yok → swatch/görsel üretilmez).
    mediaDefiningAttributeId: null,
    images: [],
    mediaAxisOptions: [],
    ...overrides,
  };
}

function variant(o: Partial<SearchSourceVariant> = {}): SearchSourceVariant {
  return {
    id: "v1",
    status: "ACTIVE",
    priceMinor: 1000,
    compareAtMinor: null,
    currency: "TRY",
    available: 5,
    lowestRecentPriceMinor: null,
    mediaOptionId: null,
    ...o,
  };
}

function categoryAttr(o: Partial<SearchSourceCategoryAttribute>): SearchSourceCategoryAttribute {
  return {
    attributeDefinitionId: "def_1",
    filterable: true,
    searchable: false,
    variantDefining: false,
    code: "renk",
    name: "Renk",
    dataType: "SELECT",
    definitionStatus: "ACTIVE",
    ...o,
  };
}

function pav(o: Partial<SearchSourceProductAttributeValue>): SearchSourceProductAttributeValue {
  return {
    attributeDefinitionId: "def_1",
    valueText: null,
    valueInteger: null,
    valueDecimal: null,
    valueBoolean: null,
    valueDate: null,
    option: null,
    multiOptions: [],
    ...o,
  };
}

function expectDoc(result: ReturnType<typeof buildSearchDocument>) {
  if (result.removed) throw new Error("beklenmeyen removed sonucu");
  return result;
}

describe("buildSearchDocument · görünürlük", () => {
  it("ACTIVE ürünü indeksler", () => {
    const r = buildSearchDocument(source());
    expect(r.removed).toBe(false);
  });

  it("DRAFT ürünü read-model'den kaldırır (removed)", () => {
    expect(buildSearchDocument(source({ status: "DRAFT" }))).toEqual({ removed: true });
  });

  it("ARCHIVED ürünü read-model'den kaldırır (removed)", () => {
    expect(buildSearchDocument(source({ status: "ARCHIVED" }))).toEqual({ removed: true });
  });
});

describe("buildSearchDocument · fiyat projeksiyonu", () => {
  it("çoklu varyantta min/max fiyat türetir", () => {
    const r = expectDoc(
      buildSearchDocument(
        source({
          variants: [
            variant({ id: "v1", priceMinor: 3000 }),
            variant({ id: "v2", priceMinor: 1500 }),
            variant({ id: "v3", priceMinor: 2200 }),
          ],
        }),
      ),
    );
    expect(r.document.minPriceMinor).toBe(1500);
    expect(r.document.maxPriceMinor).toBe(3000);
    expect(r.document.currency).toBe("TRY");
    expect(r.document.variantCount).toBe(3);
  });

  it("priceVisible=false ise fiyat null (sızmaz)", () => {
    const r = expectDoc(
      buildSearchDocument(source({ priceVisible: false, variants: [variant({ priceMinor: 999 })] })),
    );
    expect(r.document.minPriceMinor).toBeNull();
    expect(r.document.maxPriceMinor).toBeNull();
    expect(r.document.currency).toBeNull();
  });

  it("ACTIVE varyant yoksa fiyat null", () => {
    const r = expectDoc(buildSearchDocument(source({ variants: [] })));
    expect(r.document.minPriceMinor).toBeNull();
    expect(r.document.variantCount).toBe(0);
  });

  it("DRAFT varyant fiyata/stoğa katılmaz", () => {
    const r = expectDoc(
      buildSearchDocument(
        source({ variants: [variant({ id: "v1", status: "DRAFT", priceMinor: 100, available: 9 })] }),
      ),
    );
    expect(r.document.minPriceMinor).toBeNull();
    expect(r.document.variantCount).toBe(0);
    expect(r.document.hasStock).toBe(false);
  });
});

describe("buildSearchDocument · stok projeksiyonu", () => {
  it("available>0 → IN_STOCK", () => {
    const r = expectDoc(buildSearchDocument(source({ variants: [variant({ available: 3 })] })));
    expect(r.document.hasStock).toBe(true);
    expect(r.document.availability).toBe("IN_STOCK");
  });

  it("tüm varyantlar available=0 → OUT_OF_STOCK", () => {
    const r = expectDoc(
      buildSearchDocument(source({ variants: [variant({ id: "v1", available: 0 })] })),
    );
    expect(r.document.hasStock).toBe(false);
    expect(r.document.availability).toBe("OUT_OF_STOCK");
  });

  it("available=null (envanter kaydı yok) stokta sayılır", () => {
    const r = expectDoc(
      buildSearchDocument(source({ variants: [variant({ id: "v1", available: null })] })),
    );
    expect(r.document.hasStock).toBe(true);
  });
});

describe("buildSearchDocument · facet (filterable) üretimi", () => {
  it("SELECT ürün attribute → optionId facet", () => {
    const r = expectDoc(
      buildSearchDocument(
        source({
          categoryAttributes: [categoryAttr({ dataType: "SELECT" })],
          productAttributeValues: [
            pav({ option: { id: "opt_red", value: "Kırmızı", label: "Kırmızı", status: "ACTIVE" } }),
          ],
        }),
      ),
    );
    expect(r.facets).toHaveLength(1);
    expect(r.facets[0]).toMatchObject({
      attributeDefinitionId: "def_1",
      optionId: "opt_red",
      categoryId: CATEGORY_ID,
      normalizedText: "kırmızı",
    });
  });

  it("INTEGER/DECIMAL/BOOLEAN/DATE/TEXT typed kolonlara yazar", () => {
    const date = new Date("2026-03-03T00:00:00Z");
    const r = expectDoc(
      buildSearchDocument(
        source({
          categoryAttributes: [
            categoryAttr({ attributeDefinitionId: "d_int", dataType: "INTEGER" }),
            categoryAttr({ attributeDefinitionId: "d_dec", dataType: "DECIMAL" }),
            categoryAttr({ attributeDefinitionId: "d_bool", dataType: "BOOLEAN" }),
            categoryAttr({ attributeDefinitionId: "d_date", dataType: "DATE" }),
            categoryAttr({ attributeDefinitionId: "d_txt", dataType: "TEXT" }),
          ],
          productAttributeValues: [
            pav({ attributeDefinitionId: "d_int", valueInteger: 16 }),
            pav({ attributeDefinitionId: "d_dec", valueDecimal: "12.5" }),
            pav({ attributeDefinitionId: "d_bool", valueBoolean: true }),
            pav({ attributeDefinitionId: "d_date", valueDate: date }),
            pav({ attributeDefinitionId: "d_txt", valueText: "Pamuk" }),
          ],
        }),
      ),
    );
    const byDef = Object.fromEntries(r.facets.map((f) => [f.attributeDefinitionId, f]));
    expect(byDef.d_int.valueNumber).toBe("16");
    expect(byDef.d_dec.valueNumber).toBe("12.5");
    expect(byDef.d_bool.valueBoolean).toBe(true);
    expect(byDef.d_date.valueDate).toEqual(date);
    expect(byDef.d_txt.valueText).toBe("Pamuk");
    expect(byDef.d_txt.normalizedText).toBe("pamuk");
  });

  it("MULTI_SELECT → seçenek başına ayrı satır", () => {
    const r = expectDoc(
      buildSearchDocument(
        source({
          categoryAttributes: [categoryAttr({ dataType: "MULTI_SELECT" })],
          productAttributeValues: [
            pav({
              multiOptions: [
                { id: "o1", value: "A", label: "A", status: "ACTIVE" },
                { id: "o2", value: "B", label: "B", status: "ACTIVE" },
              ],
            }),
          ],
        }),
      ),
    );
    expect(r.facets.map((f) => f.optionId).sort()).toEqual(["o1", "o2"]);
  });

  it("variantDefining attribute → varyant değerlerinden facet (çoklu varyantta aynı değer TEKİLLEŞİR)", () => {
    const vav = (o: Partial<SearchSourceVariantAttributeValue>): SearchSourceVariantAttributeValue => ({
      variantId: "v1",
      attributeDefinitionId: "def_1",
      valueText: null,
      option: null,
      ...o,
    });
    const opt = { id: "opt_s", value: "S", label: "S", status: "ACTIVE" as const };
    const r = expectDoc(
      buildSearchDocument(
        source({
          categoryAttributes: [categoryAttr({ variantDefining: true })],
          variantAttributeValues: [
            vav({ variantId: "v1", option: opt }),
            vav({ variantId: "v2", option: opt }), // aynı beden, farklı varyant → tek facet
          ],
        }),
      ),
    );
    expect(r.facets).toHaveLength(1);
    expect(r.facets[0].optionId).toBe("opt_s");
  });

  it("primaryCategory yoksa facet üretilmez", () => {
    const r = expectDoc(
      buildSearchDocument(
        source({
          primaryCategoryId: null,
          categoryAttributes: [],
          productAttributeValues: [pav({ option: { id: "o", value: "x", label: "x", status: "ACTIVE" } })],
        }),
      ),
    );
    expect(r.facets).toHaveLength(0);
  });

  it("filterable=false attribute facet üretmez", () => {
    const r = expectDoc(
      buildSearchDocument(
        source({
          categoryAttributes: [categoryAttr({ filterable: false })],
          productAttributeValues: [pav({ option: { id: "o", value: "x", label: "x", status: "ACTIVE" } })],
        }),
      ),
    );
    expect(r.facets).toHaveLength(0);
  });

  it("IMAGE/FILE facet'lenmez", () => {
    const r = expectDoc(
      buildSearchDocument(
        source({
          categoryAttributes: [categoryAttr({ dataType: "IMAGE" })],
          productAttributeValues: [pav({ valueText: "x" })],
        }),
      ),
    );
    expect(r.facets).toHaveLength(0);
  });
});

describe("buildSearchDocument · archived/inactive davranışı", () => {
  it("ARCHIVED definition facet üretmez", () => {
    const r = expectDoc(
      buildSearchDocument(
        source({
          categoryAttributes: [categoryAttr({ definitionStatus: "ARCHIVED" })],
          productAttributeValues: [pav({ option: { id: "o", value: "x", label: "x", status: "ACTIVE" } })],
        }),
      ),
    );
    expect(r.facets).toHaveLength(0);
  });

  it("ARCHIVED option facet dışı bırakılır", () => {
    const r = expectDoc(
      buildSearchDocument(
        source({
          categoryAttributes: [categoryAttr({ dataType: "SELECT" })],
          productAttributeValues: [
            pav({ option: { id: "o_old", value: "eski", label: "Eski", status: "ARCHIVED" } }),
          ],
        }),
      ),
    );
    expect(r.facets).toHaveLength(0);
  });
});

describe("buildSearchDocument · searchText", () => {
  it("title + brand + searchable attribute + açıklama içerir (normalize)", () => {
    const r = expectDoc(
      buildSearchDocument(
        source({
          title: "Kışlık MONT",
          brand: "NORTH",
          description: "Sıcak tutar",
          categoryAttributes: [categoryAttr({ searchable: true, filterable: false, dataType: "SELECT" })],
          productAttributeValues: [
            pav({ option: { id: "o", value: "kirmizi", label: "Kırmızı", status: "ACTIVE" } }),
          ],
        }),
      ),
    );
    expect(r.document.searchText).toContain("kışlık mont");
    expect(r.document.searchText).toContain("north");
    expect(r.document.searchText).toContain("kırmızı");
    expect(r.document.searchText).toContain("sıcak tutar");
  });

  it("searchable=false attribute searchText'e girmez", () => {
    const r = expectDoc(
      buildSearchDocument(
        source({
          title: "Ürün",
          brand: null,
          description: null,
          categoryAttributes: [categoryAttr({ searchable: false, filterable: true, dataType: "TEXT" })],
          productAttributeValues: [pav({ valueText: "GizliDeğer" })],
        }),
      ),
    );
    expect(r.document.searchText).not.toContain("gizlideğer");
  });
});

// ── TODO-155.2 — Variant-defining facet projection (kök boşluk düzeltmesi) ──
describe("buildSearchDocument · variantDefining facet (ProductVariantOptionValue)", () => {
  it("VariantAttributeValue BOŞ olsa da variantOptionValues'tan COLOR facet üretir", () => {
    // Demo Hoodie senaryosu: renk variantDefining+filterable; VAV yok, eksen seçimi PVOV'da.
    const r = expectDoc(
      buildSearchDocument(
        source({
          categoryAttributes: [
            categoryAttr({ attributeDefinitionId: "def_renk", dataType: "COLOR", variantDefining: true }),
          ],
          variantAttributeValues: [],
          variantOptionValues: [
            { attributeDefinitionId: "def_renk", option: { id: "opt_siyah", value: "siyah", label: "Siyah", status: "ACTIVE" } },
            { attributeDefinitionId: "def_renk", option: { id: "opt_kirmizi", value: "kirmizi", label: "Kırmızı", status: "ACTIVE" } },
          ],
        }),
      ),
    );
    expect(r.facets).toHaveLength(2);
    expect(r.facets.map((f) => f.optionId).sort()).toEqual(["opt_kirmizi", "opt_siyah"]);
    expect(r.facets.every((f) => f.attributeDefinitionId === "def_renk")).toBe(true);
  });

  it("ARCHIVED option variantOptionValues'tan facet'e GİRMEZ", () => {
    const r = expectDoc(
      buildSearchDocument(
        source({
          categoryAttributes: [categoryAttr({ attributeDefinitionId: "def_renk", dataType: "COLOR", variantDefining: true })],
          variantOptionValues: [
            { attributeDefinitionId: "def_renk", option: { id: "opt_a", value: "a", label: "A", status: "ACTIVE" } },
            { attributeDefinitionId: "def_renk", option: { id: "opt_arch", value: "arch", label: "Arch", status: "ARCHIVED" } },
          ],
        }),
      ),
    );
    expect(r.facets).toHaveLength(1);
    expect(r.facets[0].optionId).toBe("opt_a");
  });

  it("VAV + variantOptionValues AYNI option → tek satır (birleşik dedupe)", () => {
    const r = expectDoc(
      buildSearchDocument(
        source({
          categoryAttributes: [categoryAttr({ attributeDefinitionId: "def_renk", dataType: "COLOR", variantDefining: true })],
          variantAttributeValues: [
            { variantId: "v1", attributeDefinitionId: "def_renk", valueText: null, option: { id: "opt_siyah", value: "siyah", label: "Siyah", status: "ACTIVE" } },
          ],
          variantOptionValues: [
            { attributeDefinitionId: "def_renk", option: { id: "opt_siyah", value: "siyah", label: "Siyah", status: "ACTIVE" } },
          ],
        }),
      ),
    );
    expect(r.facets).toHaveLength(1);
    expect(r.facets[0].optionId).toBe("opt_siyah");
  });

  it("filterable=false variantDefining eksen → facet YOK", () => {
    const r = expectDoc(
      buildSearchDocument(
        source({
          categoryAttributes: [categoryAttr({ attributeDefinitionId: "def_renk", dataType: "COLOR", variantDefining: true, filterable: false })],
          variantOptionValues: [
            { attributeDefinitionId: "def_renk", option: { id: "opt_a", value: "a", label: "A", status: "ACTIVE" } },
          ],
        }),
      ),
    );
    expect(r.facets).toHaveLength(0);
  });
});

// ── TODO-155.2 — Kampanya rozeti snapshot'ı (PDP ile aynı değerlendirici) ──
function autoCampaign(overrides: Partial<import("@commerce-os/contracts").CampaignRecord> = {}): import("@commerce-os/contracts").CampaignRecord {
  return {
    id: "camp_1", storeId: "store_1", name: "Sepette %10", description: null,
    status: "ACTIVE", type: "AUTOMATIC_CART", discountType: "PERCENT", discountValue: 10,
    maxDiscountAmountMinor: null, minOrderAmountMinor: null,
    startsAt: new Date("2026-07-01T00:00:00Z"), endsAt: new Date("2026-07-31T00:00:00Z"),
    totalUsageLimit: null, perCustomerUsageLimit: null, usageCount: 0,
    stackable: false, priority: 0, isPublic: true,
    displayTitle: null, shortDescription: null, terms: null, badgeLabel: null,
    badgeVariant: null, cardStyle: "STANDARD", accessModel: "AUTO_VISIBLE", displayPriority: 0,
    productIds: [], categoryIds: [], coupons: [],
    createdAt: new Date("2026-07-01T00:00:00Z"), updatedAt: new Date("2026-07-01T00:00:00Z"),
    ...overrides,
  };
}

describe("buildSearchDocument · campaign snapshot", () => {
  it("aktif otomatik %10 kampanya → Sepette badge + estimatedFinal + endsAt penceresi", () => {
    const r = expectDoc(
      buildSearchDocument(
        source({
          variants: [variant({ priceMinor: 149900 })],
          campaigns: [autoCampaign()],
          evaluationNow: new Date("2026-07-15T12:00:00Z"),
        }),
      ),
    );
    expect(r.document.campaign).not.toBeNull();
    expect(r.document.campaign?.displayKind).toBe("AUTOMATIC_CART_DISCOUNT");
    expect(r.document.campaign?.discountValue).toBe(10);
    // round(149900 * 10 / 100) = 14990 → final 134910.
    expect(r.document.campaign?.estimatedFinalUnitPriceMinor).toBe(134910);
    expect(r.document.campaignEndsAt).toEqual(new Date("2026-07-31T00:00:00Z"));
  });

  it("kampanya yok → campaign null + pencere null", () => {
    const r = expectDoc(buildSearchDocument(source({ variants: [variant({ priceMinor: 100000 })], campaigns: [] })));
    expect(r.document.campaign).toBeNull();
    expect(r.document.campaignStartsAt).toBeNull();
    expect(r.document.campaignEndsAt).toBeNull();
  });

  it("değerlendirme anı pencere DIŞINDA (henüz başlamamış) → snapshot null", () => {
    const r = expectDoc(
      buildSearchDocument(
        source({
          variants: [variant({ priceMinor: 100000 })],
          campaigns: [autoCampaign({ startsAt: new Date("2026-08-01T00:00:00Z") })],
          evaluationNow: new Date("2026-07-15T12:00:00Z"),
        }),
      ),
    );
    expect(r.document.campaign).toBeNull();
  });

  it("fiyat gizli → estimatedFinal null (sahte fiyat yok) ama etiket kalır", () => {
    const r = expectDoc(
      buildSearchDocument(
        source({
          priceVisible: false,
          variants: [variant({ priceMinor: 100000 })],
          campaigns: [autoCampaign()],
        }),
      ),
    );
    // Fiyat gizli → minPriceMinor null → estimate null; ama kampanya rozeti (yüzde etiketi) yine snapshot'lanır.
    expect(r.document.campaign?.estimatedFinalUnitPriceMinor).toBeNull();
    expect(r.document.campaign?.discountValue).toBe(10);
  });
});
