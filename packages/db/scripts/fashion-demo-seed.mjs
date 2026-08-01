/**
 * TODO-165 Fashion Vertical — ENTERPRISE-DEMO fashion seed (idempotent, additive).
 * TODO-165A (ADR-165A) — Task 28: governed Product Taxonomy rewrite.
 *
 * Kullanım (host'ta DATABASE_URL ayarlı ya da docker api-gateway içinde):
 *   node packages/db/scripts/fashion-demo-seed.mjs
 *   node packages/db/scripts/fashion-demo-seed.mjs --summary   # yalnız özet
 *
 * Güvenlik: YALNIZ enterprise-demo / edm-store scope'unda çalışır (persist guard). Tüm
 * ürettiği satırlar `fash-` prefixli ID taşır → tekrar çalıştırma FK-güvenli silinip
 * yeniden kurulur (idempotent). enterprise katalog (edm-*) ve demo-store ASLA etkilenmez.
 * FASHION_VERTICAL yalnız edm-store için ENABLED yapılır; demo-store KAPALI kalır.
 *
 * Governance model (bu rev, T27/T28, guncellenmis Task 27P): Sezon/Koleksiyon/Materyal/Kalıp
 * artık GOVERNED taksonomi tipleridir (@commerce-os/contracts/product-taxonomy
 * TAXONOMY_TYPE_REGISTRY — runtime `ensureStoreTaxonomyDefaults` ile AYNI OTORİTE). Kanonik
 * değerler PLATFORM-scope bir AttributeDefinition (fashion.season/collection/material/fit)
 * altında edm-store'a ÖZEL store-scoped AttributeOption + 1:1 ProductTaxonomyValue olarak
 * yazılır (ASLA global/storeId=null option'a bağlanmaz — ADR-255). Bu PLATFORM tanımları
 * ARTIK migration ile provizyonlanır (packages/db/prisma/migrations/
 * 20260802120000_provision_platform_fashion_attribute_definitions) — bu script kendi
 * find-or-create hack'ini (eski `plat-fashion-attr-*` id'leri) TAŞIMAZ, yalnız BULUR; migration
 * uygulanmamışsa (defId yok) açıkça ve gürültülü şekilde patlar (bkz. `ensureGovernedTaxonomy`).
 * Renk/Beden/Cinsiyet/Beden Sistemi governed DEĞİLDİR — STORE-scope AttributeDefinition olarak
 * eskisi gibi kalır. Ürünler enterprise Brand havuzuna (T27) brandId ile bağlanır; legacy
 * `brand` string dual-write.
 *
 * Not: search read-model (ProductSearchDocument/ProductFacetValue) bu script'te YAZILMAZ;
 * seed sonrası `search:backfill --store edm-store` (db:backfill-enterprise) çalıştırılmalıdır
 * — reindex brandId/brandSlug/brandName VE fashion facet alanlarını kapsar.
 */

import { PrismaClient } from "@prisma/client";
import { TAXONOMY_TYPE_REGISTRY } from "@commerce-os/contracts/product-taxonomy";
import { slugify } from "./enterprise/catalog.mjs";
import { ID as ENTERPRISE_ID } from "./enterprise/constants.mjs";

const STORE_ID = "edm-store";
const STORE_SLUG = "enterprise-demo";
const CURRENCY = "TRY";
const prisma = new PrismaClient();

const summaryOnly = process.argv.includes("--summary");

// ── Governed taksonomi (Task 28) ────────────────────────────────────────────
// Yalnız bu 4 tip demo ürünlerinde fiilen kullanılır (Sezon/Koleksiyon/Materyal/Kalıp).
// Kanonik değerler TAXONOMY_TYPE_REGISTRY'den (tek otorite) gelir; COLLECTION'ın kataloğu
// sabit olmadığından (bkz. contracts yorum) demo-özel iki ekstra değer üstüne eklenir.
const GOVERNED_TYPES = ["SEASON", "COLLECTION", "MATERIAL", "FIT"];
const GOVERNED_EXTRAS = {
  SEASON: [],
  COLLECTION: [
    { name: "2026 İlkbahar", slug: "2026-ss" },
    { name: "2026 Kış", slug: "2026-fw" },
  ],
  MATERIAL: [],
  FIT: [],
};

/**
 * Task 27P — `fashion.*` kodu için PLATFORM (scope=PLATFORM, storeId=null)
 * AttributeDefinition id'sini BULUR (find-ONLY — artık create ETMEZ). Bu satırlar
 * packages/db/prisma/migrations/20260802120000_provision_platform_fashion_attribute_definitions
 * tarafından provizyonlanır (TEK OTORİTE — bkz. o migration'ın başlığı); seed'in kendi
 * find-or-create hack'i (eski `plat-fashion-attr-*` id'leri) KALDIRILDI. Migration
 * uygulanmamış bir ortamda (defId bulunamazsa) açıkça ve gürültülü şekilde patlar —
 * sessizce STORE-scope bir tanım yaratıp governance'i bypass etmek YERİNE.
 */
async function findPlatformAttributeDefinition(code) {
  const existing = await prisma.attributeDefinition.findFirst({ where: { code, scope: "PLATFORM", storeId: null }, select: { id: true } });
  if (!existing) {
    throw new Error(
      `fashion-demo-seed: PLATFORM AttributeDefinition not found for governed code "${code}" ` +
        `(scope=PLATFORM, storeId=NULL). Apply migration ` +
        `20260802120000_provision_platform_fashion_attribute_definitions before running this seed.`,
    );
  }
  return existing.id;
}

/**
 * Governed taksonomi tiplerini (SEASON/COLLECTION/MATERIAL/FIT) edm-store için store-scoped
 * AttributeOption + 1:1 ProductTaxonomyValue olarak yazar (taxonomy-service.ts
 * `createValueWithOption` ile AYNI şekil — bu script gerçek servisi çağırmaz çünkü DB-doğrudan
 * seed'dir, ama alan alan birebir aynı sözleşmeyi üretir). Döner: { platformDefIdByType,
 * governedOptionBySlug, created }.
 */
async function ensureGovernedTaxonomy() {
  const platformDefIdByType = {};
  const governedOptionBySlug = {};
  let created = 0;

  for (const type of GOVERNED_TYPES) {
    const def = TAXONOMY_TYPE_REGISTRY[type];
    const defId = await findPlatformAttributeDefinition(def.definitionCode);
    platformDefIdByType[type] = defId;
    governedOptionBySlug[type] = {};

    const values = [...def.canonical, ...(GOVERNED_EXTRAS[type] ?? [])];
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      const optionId = `fash-opt-tax-${type.toLowerCase()}-${v.slug}`;
      const taxonomyId = `fash-tax-${type.toLowerCase()}-${v.slug}`;
      await prisma.attributeOption.create({
        data: {
          id: optionId,
          attributeDefinitionId: defId,
          storeId: STORE_ID,
          value: v.slug,
          label: v.name,
          sortOrder: i,
          status: "ACTIVE",
        },
      });
      await prisma.productTaxonomyValue.create({
        data: {
          id: taxonomyId,
          storeId: STORE_ID,
          type,
          name: v.name,
          slug: v.slug,
          status: "ACTIVE",
          displayOrder: i,
          metadata: {},
          attributeOptionId: optionId,
        },
      });
      governedOptionBySlug[type][v.slug] = optionId;
      created += 1;
    }
  }

  return { platformDefIdByType, governedOptionBySlug, created };
}

// ── Kanonik veri (governed OLMAYAN: Renk/Beden/Cinsiyet/Beden Sistemi) ──────
const COLORS = [
  { id: "fash-opt-color-siyah", value: "black", label: "Siyah", hex: "#111111", family: "black" },
  { id: "fash-opt-color-beyaz", value: "white", label: "Beyaz", hex: "#FFFFFF", family: "white" },
  { id: "fash-opt-color-kirmizi", value: "red", label: "Kırmızı", hex: "#D32F2F", family: "red" },
  { id: "fash-opt-color-mavi", value: "blue", label: "Mavi", hex: "#1976D2", family: "blue" },
  { id: "fash-opt-color-yesil", value: "green", label: "Yeşil", hex: "#388E3C", family: "green" },
  { id: "fash-opt-color-lacivert", value: "navy", label: "Lacivert", hex: "#1A237E", family: "navy" },
];
const CLOTHING_SIZES = [
  { id: "fash-opt-size-xs", value: "XS", label: "XS", order: 0 },
  { id: "fash-opt-size-s", value: "S", label: "S", order: 1 },
  { id: "fash-opt-size-m", value: "M", label: "M", order: 2 },
  { id: "fash-opt-size-l", value: "L", label: "L", order: 3 },
  { id: "fash-opt-size-xl", value: "XL", label: "XL", order: 4 },
];
const SHOE_SIZES = [
  { id: "fash-opt-size-39", value: "39", label: "39", order: 5 },
  { id: "fash-opt-size-40", value: "40", label: "40", order: 6 },
  { id: "fash-opt-size-41", value: "41", label: "41", order: 7 },
  { id: "fash-opt-size-42", value: "42", label: "42", order: 8 },
  { id: "fash-opt-size-43", value: "43", label: "43", order: 9 },
  { id: "fash-opt-size-44", value: "44", label: "44", order: 10 },
];
const ALL_SIZES = [...CLOTHING_SIZES, ...SHOE_SIZES];

const GENDERS = [
  { id: "fash-opt-gender-women", value: "women", label: "Kadın" },
  { id: "fash-opt-gender-men", value: "men", label: "Erkek" },
  { id: "fash-opt-gender-unisex", value: "unisex", label: "Unisex" },
];
const SIZE_SYSTEMS = [
  { id: "fash-opt-ss-intl", value: "INTERNATIONAL", label: "Uluslararası (XXS–4XL)" },
  { id: "fash-opt-ss-shoeu", value: "SHOES_EU", label: "Ayakkabı (Avrupa)" },
];

// Attribute tanımları (STORE scope, edm-store) — YALNIZ governed OLMAYAN tipler.
// Sezon/Koleksiyon/Materyal/Kalıp artık `ensureGovernedTaxonomy()` ile PLATFORM scope'ta.
const ATTRS = [
  { id: "fash-attr-color", code: "fashion.color", name: "Renk", dataType: "COLOR", options: COLORS.map((c) => ({ id: c.id, value: c.value, label: c.label, colorHex: c.hex })) },
  { id: "fash-attr-size", code: "fashion.size", name: "Beden", dataType: "SELECT", options: ALL_SIZES.map((s) => ({ id: s.id, value: s.value, label: s.label, sortOrder: s.order })) },
  { id: "fash-attr-gender", code: "fashion.gender", name: "Cinsiyet", dataType: "SELECT", options: GENDERS },
  { id: "fash-attr-sizesystem", code: "fashion.size_system", name: "Beden Sistemi", dataType: "SELECT", options: SIZE_SYSTEMS },
];

const CATEGORIES = [
  { id: "fash-cat-women", name: "Kadın Giyim", slug: "moda-kadin-giyim", sort: 0 },
  { id: "fash-cat-men", name: "Erkek Giyim", slug: "moda-erkek-giyim", sort: 1 },
  { id: "fash-cat-shoes", name: "Ayakkabı", slug: "moda-ayakkabi", sort: 2 },
];

const MEDIA_POOL = ["edm-media-fashion", "edm-media-sports", "edm-media-personalcare", "edm-media-home", "edm-media-tech", "edm-media-books"];

// 12 ürün: 5 kadın, 4 erkek, 3 ayakkabı. `fit`/`material` artık GOVERNED slug referansı
// (registry canonical slug'ları — id DEĞİL, çözüm ensureGovernedTaxonomy() sonrası yapılır).
// `brand` — enterprise Brand havuzundan (T27) gerçek bir marka adı; brandId runtime'da
// `ENTERPRISE_ID.brand(slugify(brand))` ile deterministik çözülür (enterprise-seed ÖNCE
// çalışmış olmalı — aynı `assertScope()` bağımlılığı gibi).
const PRODUCTS = [
  { cat: "fash-cat-women", title: "Kadın Basic Tişört", brand: "Koton", gender: "women", ss: "INTERNATIONAL", colors: 3, price: 24900, fit: "regular", material: ["cotton", "elastane"] },
  { cat: "fash-cat-women", title: "Kadın Oversize Sweatshirt", brand: "LC Waikiki", gender: "women", ss: "INTERNATIONAL", colors: 3, price: 44900, fit: "oversize", material: ["cotton", "polyester"] },
  { cat: "fash-cat-women", title: "Kadın Slim Fit Jean", brand: "Mavi", gender: "women", ss: "INTERNATIONAL", colors: 2, price: 59900, fit: "slim", material: ["denim", "elastane"] },
  { cat: "fash-cat-women", title: "Kadın Yün Kazak", brand: "Defacto", gender: "women", ss: "INTERNATIONAL", colors: 3, price: 64900, fit: "regular", material: ["wool"] },
  { cat: "fash-cat-women", title: "Kadın Midi Elbise", brand: "Trendix", gender: "women", ss: "INTERNATIONAL", colors: 2, price: 74900, fit: "regular", material: ["polyester"] },
  { cat: "fash-cat-men", title: "Erkek Basic Tişört", brand: "LC Waikiki", gender: "men", ss: "INTERNATIONAL", colors: 3, price: 27900, fit: "regular", material: ["cotton"] },
  { cat: "fash-cat-men", title: "Erkek Oversize Hoodie", brand: "Koton", gender: "men", ss: "INTERNATIONAL", colors: 3, price: 49900, fit: "oversize", material: ["cotton", "polyester"] },
  { cat: "fash-cat-men", title: "Erkek Slim Gömlek", brand: "Defacto", gender: "men", ss: "INTERNATIONAL", colors: 2, price: 45900, fit: "slim", material: ["cotton"] },
  { cat: "fash-cat-men", title: "Erkek Deri Ceket", brand: "Mavi", gender: "men", ss: "INTERNATIONAL", colors: 2, price: 129900, fit: "regular", material: ["leather"] },
  { cat: "fash-cat-shoes", title: "Kadın Spor Ayakkabı", brand: "Nike", gender: "women", ss: "SHOES_EU", colors: 3, price: 89900, fit: "regular", material: ["leather"], shoe: true },
  { cat: "fash-cat-shoes", title: "Erkek Sneaker", brand: "Adidas", gender: "men", ss: "SHOES_EU", colors: 3, price: 94900, fit: "regular", material: ["leather"], shoe: true },
  { cat: "fash-cat-shoes", title: "Unisex Koşu Ayakkabısı", brand: "Puma", gender: "unisex", ss: "SHOES_EU", colors: 2, price: 109900, fit: "regular", material: ["polyester"], shoe: true },
];

function productSlug(s, i) {
  return (
    s
      .toLowerCase()
      .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") + `-fash-${i}`
  );
}

async function assertScope() {
  const store = await prisma.store.findFirst({ where: { id: STORE_ID, slug: STORE_SLUG }, select: { id: true } });
  if (!store) throw new Error(`Refusing: store ${STORE_ID}/${STORE_SLUG} not found (fashion seed is enterprise-demo only).`);
}

async function wipe() {
  const p = { startsWith: "fash-" };
  await prisma.productVariantOptionValue.deleteMany({ where: { storeId: STORE_ID, id: p } });
  await prisma.inventoryItem.deleteMany({ where: { id: p } });
  await prisma.productImage.deleteMany({ where: { storeId: STORE_ID, id: p } });
  await prisma.productAttributeValueOption.deleteMany({ where: { storeId: STORE_ID, id: p } });
  await prisma.productAttributeValue.deleteMany({ where: { storeId: STORE_ID, id: p } });
  await prisma.productVariantOptionSelection.deleteMany({ where: { id: p } });
  await prisma.productVariantAttribute.deleteMany({ where: { storeId: STORE_ID, id: p } });
  await prisma.productVariant.deleteMany({ where: { storeId: STORE_ID, id: p } });
  await prisma.productCategoryAssignment.deleteMany({ where: { storeId: STORE_ID, productId: p } });
  await prisma.product.deleteMany({ where: { storeId: STORE_ID, id: p } });
  await prisma.sizeChartAssignment.deleteMany({ where: { storeId: STORE_ID, id: p } });
  await prisma.sizeChartRevision.deleteMany({ where: { storeId: STORE_ID, id: p } });
  await prisma.sizeChart.deleteMany({ where: { storeId: STORE_ID, id: p } });
  await prisma.categoryAttribute.deleteMany({ where: { storeId: STORE_ID, id: p } });
  // TODO-165A (T28) — governed taksonomi: ProductTaxonomyValue önce (açık, cascade'e güvenmez);
  // AttributeOption Cascade zaten silinince taşırdı ama netlik için ayrı satır bırakılır.
  await prisma.productTaxonomyValue.deleteMany({ where: { storeId: STORE_ID, id: p } });
  await prisma.attributeOption.deleteMany({ where: { id: p } });
  await prisma.attributeDefinition.deleteMany({ where: { id: p } });
  await prisma.productCategory.deleteMany({ where: { storeId: STORE_ID, id: p } });
}

async function seed() {
  const counts = {};

  // 0) Governed taksonomi (Task 28) — Sezon/Koleksiyon/Materyal/Kalıp, store-scoped.
  const { platformDefIdByType, governedOptionBySlug, created: governedCreated } = await ensureGovernedTaxonomy();
  counts.governedTaxonomyValues = governedCreated;

  // 1) Attribute tanımları + opsiyonları (governed OLMAYAN)
  for (const a of ATTRS) {
    await prisma.attributeDefinition.create({
      data: { id: a.id, scope: "STORE", storeId: STORE_ID, code: a.code, name: a.name, dataType: a.dataType, status: "ACTIVE" },
    });
    for (let i = 0; i < a.options.length; i++) {
      const o = a.options[i];
      await prisma.attributeOption.create({
        data: {
          id: o.id,
          attributeDefinitionId: a.id,
          storeId: STORE_ID,
          value: o.value,
          label: o.label,
          colorHex: o.colorHex ?? null,
          sortOrder: o.sortOrder ?? i,
          status: "ACTIVE",
        },
      });
    }
  }
  counts.attributes = ATTRS.length + GOVERNED_TYPES.length;

  // 2) Kategoriler + CategoryAttribute (governed tipler PLATFORM defId'ye bağlanır)
  const CATEGORY_ATTRS = [
    { key: "color", attr: "fash-attr-color", variantDefining: true, filterable: true, displayOrder: 0 },
    { key: "size", attr: "fash-attr-size", variantDefining: true, filterable: true, displayOrder: 1 },
    { key: "gender", attr: "fash-attr-gender", variantDefining: false, filterable: true, displayOrder: 2 },
    { key: "season", attr: platformDefIdByType.SEASON, variantDefining: false, filterable: true, displayOrder: 3 },
    { key: "collection", attr: platformDefIdByType.COLLECTION, variantDefining: false, filterable: true, displayOrder: 4 },
    { key: "material", attr: platformDefIdByType.MATERIAL, variantDefining: false, filterable: true, displayOrder: 5 },
    { key: "fit", attr: platformDefIdByType.FIT, variantDefining: false, filterable: true, displayOrder: 6 },
    { key: "sizesystem", attr: "fash-attr-sizesystem", variantDefining: false, filterable: false, displayOrder: 7 },
  ];
  for (const c of CATEGORIES) {
    await prisma.productCategory.create({
      data: { id: c.id, storeId: STORE_ID, name: c.name, slug: c.slug, sortOrder: c.sort, status: "ACTIVE" },
    });
    for (const ca of CATEGORY_ATTRS) {
      await prisma.categoryAttribute.create({
        data: {
          id: `fash-catattr-${c.id.replace("fash-cat-", "")}-${ca.key}`,
          storeId: STORE_ID,
          categoryId: c.id,
          attributeDefinitionId: ca.attr,
          required: false,
          filterable: ca.filterable,
          searchable: false,
          comparable: false,
          variantDefining: ca.variantDefining,
          visibleOnProductPage: true,
          visibleOnListing: false,
          displayOrder: ca.displayOrder,
        },
      });
    }
  }
  counts.categories = CATEGORIES.length;

  // 3) Ürünler + varyantlar
  let variantCount = 0;
  let oosCount = 0;
  for (let pi = 0; pi < PRODUCTS.length; pi++) {
    const p = PRODUCTS[pi];
    const productId = `fash-prod-${pi + 1}`;
    const colors = COLORS.slice(0, p.colors);
    const sizes = p.shoe ? SHOE_SIZES.slice(0, 5) : CLOTHING_SIZES; // ayakkabı 5 beden, giyim 5 beden
    const brandId = ENTERPRISE_ID.brand(slugify(p.brand));
    await prisma.product.create({
      data: {
        id: productId,
        storeId: STORE_ID,
        title: p.title,
        slug: productSlug(p.title, pi + 1),
        description: `${p.title} — moda koleksiyonu. Konforlu kesim, kaliteli kumaş.`,
        status: "ACTIVE",
        type: "PHYSICAL",
        purchasable: true,
        minOrderQuantity: 1,
        primaryCategoryId: p.cat,
        mediaDefiningAttributeId: "fash-attr-color",
        // TODO-165A (T27/T28) — governed Brand (enterprise seed'in Brand havuzundan); legacy
        // `brand` string dual-write = brand.name (enterprise-seed önce çalışmış olmalı).
        brand: p.brand,
        brandId,
      },
    });
    await prisma.productCategoryAssignment.create({ data: { productId, categoryId: p.cat, storeId: STORE_ID } });

    // Ürün-seviyesi attribute değerleri
    // gender (governed değil)
    const genderOpt = GENDERS.find((g) => g.value === p.gender);
    await prisma.productAttributeValue.create({ data: { id: `fash-pav-${productId}-gender`, storeId: STORE_ID, productId, attributeDefinitionId: "fash-attr-gender", optionId: genderOpt.id } });
    // fit (governed → PLATFORM def + store-scoped taxonomy option)
    await prisma.productAttributeValue.create({ data: { id: `fash-pav-${productId}-fit`, storeId: STORE_ID, productId, attributeDefinitionId: platformDefIdByType.FIT, optionId: governedOptionBySlug.FIT[p.fit] } });
    // season (governed) — ayakkabılar hep İlkbahar/Yaz (ss), diğerleri sırayla ss/fw.
    const seasonSlug = p.shoe ? "ss" : pi % 2 === 0 ? "ss" : "fw";
    await prisma.productAttributeValue.create({ data: { id: `fash-pav-${productId}-season`, storeId: STORE_ID, productId, attributeDefinitionId: platformDefIdByType.SEASON, optionId: governedOptionBySlug.SEASON[seasonSlug] } });
    // collection (governed, demo-özel ekstra değerler)
    const collectionSlug = pi % 2 === 0 ? "2026-ss" : "2026-fw";
    await prisma.productAttributeValue.create({ data: { id: `fash-pav-${productId}-coll`, storeId: STORE_ID, productId, attributeDefinitionId: platformDefIdByType.COLLECTION, optionId: governedOptionBySlug.COLLECTION[collectionSlug] } });
    // size_system (governed değil)
    const ssOpt = SIZE_SYSTEMS.find((s) => s.value === p.ss);
    await prisma.productAttributeValue.create({ data: { id: `fash-pav-${productId}-ss`, storeId: STORE_ID, productId, attributeDefinitionId: "fash-attr-sizesystem", optionId: ssOpt.id } });
    // material (governed, MULTI_SELECT → parent + optionLinks)
    const pavMat = await prisma.productAttributeValue.create({ data: { id: `fash-pav-${productId}-mat`, storeId: STORE_ID, productId, attributeDefinitionId: platformDefIdByType.MATERIAL } });
    for (const matSlug of p.material) {
      await prisma.productAttributeValueOption.create({ data: { id: `fash-pavo-${productId}-${matSlug}`, storeId: STORE_ID, productAttributeValueId: pavMat.id, optionId: governedOptionBySlug.MATERIAL[matSlug] } });
    }

    // Variant axes (color pos0, size pos1) — governed değil.
    await prisma.productVariantAttribute.create({ data: { id: `fash-pva-${productId}-color`, storeId: STORE_ID, productId, attributeDefinitionId: "fash-attr-color", position: 0 } });
    await prisma.productVariantAttribute.create({ data: { id: `fash-pva-${productId}-size`, storeId: STORE_ID, productId, attributeDefinitionId: "fash-attr-size", position: 1 } });
    for (const c of colors) {
      await prisma.productVariantOptionSelection.create({ data: { id: `fash-pvos-${productId}-c-${c.id.replace("fash-opt-color-", "")}`, storeId: STORE_ID, productVariantAttributeId: `fash-pva-${productId}-color`, optionId: c.id, position: 0 } });
    }
    for (const s of sizes) {
      await prisma.productVariantOptionSelection.create({ data: { id: `fash-pvos-${productId}-s-${s.id.replace("fash-opt-size-", "")}`, storeId: STORE_ID, productVariantAttributeId: `fash-pva-${productId}-size`, optionId: s.id, position: 0 } });
    }

    // Görseller: renk başına bir görsel (variant media engine); ilk = kapak (pos0)
    for (let ci = 0; ci < colors.length; ci++) {
      const c = colors[ci];
      await prisma.productImage.create({
        data: {
          id: `fash-img-${productId}-${c.id.replace("fash-opt-color-", "")}`,
          storeId: STORE_ID,
          productId,
          mediaId: MEDIA_POOL[ci % MEDIA_POOL.length],
          position: ci,
          attributeDefinitionId: "fash-attr-color",
          optionId: c.id,
        },
      });
    }

    // Varyantlar: color × size
    const slugBase = productSlug(p.title, pi + 1).replace(/-fash-\d+$/, "").toUpperCase().replace(/-/g, "").slice(0, 8);
    let combo = 0;
    for (const c of colors) {
      for (const s of sizes) {
        combo++;
        const variantId = `fash-var-${productId}-${c.id.replace("fash-opt-color-", "")}-${s.value}`;
        // combinationKey: segmentler attributeDefinitionId'ye göre sıralı (engine ile aynı).
        const segColor = `fash-attr-color:${c.id}`;
        const segSize = `fash-attr-size:${s.id}`;
        const combinationKey = `v1|${[segColor, segSize].sort().join("|")}`;
        await prisma.productVariant.create({
          data: {
            id: variantId,
            productId,
            storeId: STORE_ID,
            title: `${c.label} / ${s.label}`,
            sku: `${slugBase}-${c.value.toUpperCase().slice(0, 3)}-${s.value}`,
            priceMinor: p.price,
            currency: CURRENCY,
            status: "ACTIVE",
            vatRateBps: 2000,
            combinationKey,
            generationSource: "ATTRIBUTE_COMBINATION",
            skuSource: "AUTO",
          },
        });
        await prisma.productVariantOptionValue.create({ data: { id: `fash-pvov-${variantId}-c`, storeId: STORE_ID, variantId, attributeDefinitionId: "fash-attr-color", optionId: c.id } });
        await prisma.productVariantOptionValue.create({ data: { id: `fash-pvov-${variantId}-s`, storeId: STORE_ID, variantId, attributeDefinitionId: "fash-attr-size", optionId: s.id } });
        // Stok: bazı kombinasyonlar tükenmiş (deterministik). XS ve 39 bedenleri sık tükenir.
        const isOOS = (s.value === "XS" && c.value !== "black") || (s.value === "39") || (combo % 7 === 0);
        const onHand = isOOS ? 0 : 5 + ((combo * 3) % 20);
        if (isOOS) oosCount++;
        await prisma.inventoryItem.create({ data: { id: `fash-inv-${variantId}`, storeId: STORE_ID, variantId, quantityOnHand: onHand, quantityReserved: 0, lowStockThreshold: 3 } });
        variantCount++;
      }
    }
  }
  counts.products = PRODUCTS.length;
  counts.variants = variantCount;
  counts.outOfStockVariants = oosCount;

  // 4) Size chart (Kadın Giyim, INTERNATIONAL, PUBLISHED + revision + kategori ataması)
  const columns = [
    { key: "chest", label: "Göğüs", unit: "cm" },
    { key: "waist", label: "Bel", unit: "cm" },
    { key: "hip", label: "Basen", unit: "cm" },
  ];
  const rows = [
    { size: "XS", cells: { chest: 82, waist: 62, hip: 88 } },
    { size: "S", cells: { chest: 86, waist: 66, hip: 92 } },
    { size: "M", cells: { chest: 90, waist: 70, hip: 96 } },
    { size: "L", cells: { chest: 96, waist: 76, hip: 102 } },
    { size: "XL", cells: { chest: 102, waist: 82, hip: 108 } },
  ];
  await prisma.sizeChart.create({
    data: {
      id: "fash-sc-women",
      storeId: STORE_ID,
      name: "Kadın Üst Beden Tablosu",
      sizeSystemKey: "INTERNATIONAL",
      measurementUnit: "CM",
      gender: "women",
      status: "PUBLISHED",
      publishedRevisionId: "fash-scr-women-1",
      draftColumns: columns,
      draftRows: rows,
    },
  });
  await prisma.sizeChartRevision.create({
    data: { id: "fash-scr-women-1", storeId: STORE_ID, sizeChartId: "fash-sc-women", revision: 1, columns, rows, locale: "tr" },
  });
  await prisma.sizeChartAssignment.create({
    data: { id: "fash-sca-women", storeId: STORE_ID, sizeChartId: "fash-sc-women", scope: "CATEGORY", categoryId: "fash-cat-women" },
  });
  counts.sizeCharts = 1;

  // 5) FASHION_VERTICAL capability ENABLED (edm-store)
  await prisma.storeModule.upsert({
    where: { storeId_moduleKey: { storeId: STORE_ID, moduleKey: "FASHION_VERTICAL" } },
    update: { state: "ENABLED", source: "fashion-demo-seed" },
    create: { storeId: STORE_ID, moduleKey: "FASHION_VERTICAL", state: "ENABLED", source: "fashion-demo-seed" },
  });
  counts.capability = "FASHION_VERTICAL=ENABLED";

  return counts;
}

async function main() {
  await assertScope();
  if (summaryOnly) {
    console.log(JSON.stringify({ store: STORE_SLUG, products: PRODUCTS.length, categories: CATEGORIES.length, attributes: ATTRS.length + GOVERNED_TYPES.length, governedTypes: GOVERNED_TYPES }, null, 2));
    return;
  }
  await wipe();
  const counts = await seed();
  console.log("[fashion-demo-seed] DONE", JSON.stringify(counts, null, 2));
}

main()
  .catch((e) => {
    console.error("[fashion-demo-seed] FAILED:", e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
