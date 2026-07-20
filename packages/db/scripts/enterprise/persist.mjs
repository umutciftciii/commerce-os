/**
 * Enterprise Demo Dataset — DB PERSISTANS (idempotent, store-scope'lu).
 *
 * Yalnız STORE_ID (enterprise-demo) scope'unda çalışır. Strateji: "kontrollü temizle +
 * yeniden oluştur" — mevcut enterprise-demo katalog satırları FK-güvenli sırayla silinir,
 * ardından deterministik veri toplu (createMany, chunk'lı) yazılır. Bu, tekrar çalıştırmada
 * duplicate ÜRETMEZ ve nihai duruma yakınsar. `demo-store` / üretim verisi ASLA silinmez.
 *
 * Performans: satır-satır insert YOK; child tablolar createMany + chunk. Uzun tek-transaction
 * yerine tablo-bazlı toplu yazım (connection exhaustion/timeout riskini önler).
 */

import { PrismaClient } from "@prisma/client";
import { hashPassword } from "@commerce-os/auth";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  STORE_ID, STORE_SLUG, STORE_NAME, STORE_DOMAIN, PLAN_CODE, PROTECTED_STORE_SLUGS, ID,
} from "./constants.mjs";
import { buildHomeData } from "./home.mjs";
import { buildThemeData } from "./theme.mjs";

const CHUNK = 1000;

function chunk(arr, size = CHUNK) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Store-scope guard — yanlış/korumalı store'a yazımı reddet. */
function assertScope() {
  if (STORE_SLUG !== "enterprise-demo" || PROTECTED_STORE_SLUGS.has(STORE_SLUG)) {
    throw new Error(`Guard: seed yalnız enterprise-demo scope'unda çalışır (slug=${STORE_SLUG}).`);
  }
}

/** Enterprise-demo platform altyapısı (kullanıcı/plan/store/domain/üyelik/abonelik) upsert. */
async function upsertInfra(prisma) {
  const passwordHash = await hashPassword("local-admin-password", process.env.PASSWORD_HASH_PEPPER ?? "");
  const admin = await prisma.platformUser.upsert({
    where: { email: "platform-admin@example.local" },
    update: { name: "Demo Platform Admin", passwordHash, role: "SUPER_ADMIN" },
    create: { email: "platform-admin@example.local", name: "Demo Platform Admin", passwordHash, role: "SUPER_ADMIN" },
  });
  const plan = await prisma.plan.upsert({
    where: { code: PLAN_CODE },
    update: { name: "Enterprise Demo Plan" },
    create: { code: PLAN_CODE, name: "Enterprise Demo Plan", description: "Enterprise demo dataset planı.", metadata: { seeded: "enterprise-demo" } },
  });
  await prisma.store.upsert({
    where: { slug: STORE_SLUG },
    update: { id: STORE_ID, name: STORE_NAME, status: "ACTIVE" },
    create: { id: STORE_ID, name: STORE_NAME, slug: STORE_SLUG, status: "ACTIVE", metadata: { seeded: "enterprise-demo" } },
  });
  await prisma.storeDomain.upsert({
    where: { domain: STORE_DOMAIN },
    update: { storeId: STORE_ID, type: "SYSTEM_SUBDOMAIN", status: "ACTIVE" },
    create: { storeId: STORE_ID, domain: STORE_DOMAIN, type: "SYSTEM_SUBDOMAIN", status: "ACTIVE" },
  });
  await prisma.storeUser.upsert({
    where: { userId_storeId: { userId: admin.id, storeId: STORE_ID } },
    update: { role: "OWNER", acceptedAt: new Date("2026-01-01T00:00:00.000Z") },
    create: { userId: admin.id, storeId: STORE_ID, role: "OWNER", acceptedAt: new Date("2026-01-01T00:00:00.000Z") },
  });
  await prisma.subscription.upsert({
    where: { id: `${STORE_ID}-${plan.id}` },
    update: { status: "ACTIVE", planId: plan.id, storeId: STORE_ID },
    create: { id: `${STORE_ID}-${plan.id}`, storeId: STORE_ID, planId: plan.id, status: "ACTIVE", metadata: { seeded: "enterprise-demo" } },
  });
  // Varsayılan kargo tarife planı (checkout/vitrin için; eşik altı 49,90₺, 750₺ üstü ücretsiz).
  await prisma.shippingRatePlan.upsert({
    where: { id: ID.shippingPlan() },
    update: { name: "Standart Kargo", status: "ACTIVE", isDefault: true, pricingMode: "FREE_THRESHOLD", currency: "TRY", fixedAmountMinor: 4990, freeShippingThresholdMinor: 75000 },
    create: { id: ID.shippingPlan(), storeId: STORE_ID, name: "Standart Kargo", status: "ACTIVE", isDefault: true, pricingMode: "FREE_THRESHOLD", currency: "TRY", fixedAmountMinor: 4990, freeShippingThresholdMinor: 75000, deliveryEstimate: "2-3 iş günü" },
  });
}

/** Enterprise-demo katalog satırlarını FK-güvenli sırayla temizle (YALNIZ bu store). */
async function wipeScope(prisma) {
  const where = { storeId: STORE_ID };
  // TODO-158A (ADR-086) — Home Experience: section cascade çocukları (hero/featured/showcase)
  // temizler; homePage ayrıca silinir. MediaAsset silmeden ÖNCE (hero mediaId onDelete: Restrict).
  await prisma.homeSection.deleteMany({ where });
  await prisma.homePage.deleteMany({ where });
  // TODO-158B (ADR-087) — Theme Engine: Theme cascade ile ThemeVersion'ları da temizler.
  await prisma.theme.deleteMany({ where });
  // Search read-model (backfill yeniden kuracak; yine de scope-temiz).
  await prisma.productFacetValue.deleteMany({ where });
  await prisma.productSearchDocument.deleteMany({ where });
  // Kampanyalar (cascade: coupon/scopes/redemption/customerCoupon).
  await prisma.campaign.deleteMany({ where });
  // Ürünler (cascade: variant→inventory/vov/movement, image, PAV(+options), assignment, PVA(+selection)).
  await prisma.product.deleteMany({ where });
  // Depolar (balances ürün cascade ile gitti).
  await prisma.warehouse.deleteMany({ where });
  // Kategoriler (cascade: assignment, categoryAttribute, campaignCategory).
  await prisma.productCategory.deleteMany({ where });
  // Attribute tanımları (cascade: option, categoryLink, değerler). Artık option'a referans yok → Restrict OK.
  await prisma.attributeDefinition.deleteMany({ where });
  // Medya (productImage ürün cascade ile gitti).
  await prisma.mediaAsset.deleteMany({ where });
}

async function createManyChunked(model, rows) {
  let total = 0;
  for (const part of chunk(rows)) {
    if (part.length === 0) continue;
    const res = await model.createMany({ data: part, skipDuplicates: true });
    total += res.count;
  }
  return total;
}

/** Ürün/varyant objelerinden iç (_) alanları çıkar (persist edilmez). */
const stripProduct = (p) => { const rest = { ...p }; delete rest._kind; delete rest._brand; delete rest._categoryIds; return rest; };
const stripVariant = (v) => { const rest = { ...v }; delete rest._kind; return rest; };

/** Yer tutucu SVG dosyalarını medya deposuna yaz (broken URL üretmemek için). */
async function writePlaceholders(ds) {
  const dir = process.env.MEDIA_STORAGE_DIR;
  if (!dir) return { written: 0, skipped: true };
  const palette = { tech: "#1E5FBF", fashion: "#E84393", home: "#27AE60", personalcare: "#8E44AD", sports: "#C0392B", baby: "#F1C40F", office: "#34495E" };
  let written = 0;
  for (const m of ds.media) {
    const domain = m.storageKey.split("/").pop().replace(".svg", "");
    const color = palette[domain] ?? "#888888";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800"><rect width="800" height="800" fill="${color}"/><text x="400" y="410" font-family="sans-serif" font-size="56" fill="#ffffff" text-anchor="middle">${domain}</text></svg>`;
    const full = join(dir, m.storageKey);
    await mkdir(join(dir, "enterprise-demo", "placeholder"), { recursive: true });
    await writeFile(full, svg, "utf8");
    written += 1;
  }
  return { written, skipped: false };
}

/**
 * Dataset'i store-scope'a yaz. Döner: yazılan satır sayaçları + süre.
 */
export async function persistDataset(ds, { prisma: injected } = {}) {
  assertScope();
  const prisma = injected ?? new PrismaClient();
  const owned = !injected;
  const t0 = Date.now();
  const counts = {};
  try {
    // TODO-158A (ADR-086) — Home içeriğini türet; hero media'yı ds.media'ya ekle ki
    // hem MediaAsset hem placeholder SVG'si tek yerden yazılsın (broken URL olmasın).
    const home = buildHomeData(ds);
    ds.media.push(...home.heroMedia);

    await upsertInfra(prisma);
    await wipeScope(prisma);

    counts.categories = await createManyChunked(prisma.productCategory, ds.categories);
    counts.attributeDefinitions = await createManyChunked(prisma.attributeDefinition, ds.attributes.definitions);
    counts.attributeOptions = await createManyChunked(prisma.attributeOption, ds.attributes.options);
    counts.categoryAttributes = await createManyChunked(prisma.categoryAttribute, ds.attributes.categoryLinks);

    counts.products = await createManyChunked(prisma.product, ds.products.map(stripProduct));
    counts.categoryAssignments = await createManyChunked(prisma.productCategoryAssignment, ds.categoryAssignments);
    counts.productVariantAttributes = await createManyChunked(prisma.productVariantAttribute, ds.productVariantAttributes);
    counts.productVariantOptionSelections = await createManyChunked(prisma.productVariantOptionSelection, ds.productVariantOptionSelections);
    counts.variants = await createManyChunked(prisma.productVariant, ds.variants.map(stripVariant));
    counts.variantOptionValues = await createManyChunked(prisma.productVariantOptionValue, ds.variantOptionValues);
    counts.productAttributeValues = await createManyChunked(prisma.productAttributeValue, ds.productAttributeValues);
    counts.productAttributeValueOptions = await createManyChunked(prisma.productAttributeValueOption, ds.productAttributeValueOptions);

    counts.media = await createManyChunked(prisma.mediaAsset, ds.media);
    counts.productImages = await createManyChunked(prisma.productImage, ds.productImages);

    counts.warehouses = await createManyChunked(prisma.warehouse, ds.warehouses);
    counts.inventoryItems = await createManyChunked(prisma.inventoryItem, ds.inventoryItems);
    counts.inventoryBalances = await createManyChunked(prisma.inventoryBalance, ds.inventoryBalances);

    counts.campaigns = await createManyChunked(prisma.campaign, ds.campaigns);
    counts.coupons = await createManyChunked(prisma.coupon, ds.coupons);
    counts.campaignProducts = await createManyChunked(prisma.campaignProduct, ds.campaignProducts);
    counts.campaignCategories = await createManyChunked(prisma.campaignCategory, ds.campaignCategories);

    // TODO-158A (ADR-086) — Home Experience: page → sections → tip-özel çocuklar
    // (kategori/ürün/kampanya/media zaten yazıldı → FK'ler güvenli).
    await prisma.homePage.create({ data: home.homePage });
    counts.homeSections = await createManyChunked(prisma.homeSection, home.sections);
    counts.homeHeroSlides = await createManyChunked(prisma.homeHeroSlide, home.heroSlides);
    counts.homeFeaturedCategories = await createManyChunked(prisma.homeFeaturedCategory, home.featuredCategories);
    counts.homeShowcaseProducts = await createManyChunked(prisma.homeShowcaseProduct, home.showcaseProducts);

    // TODO-158B (ADR-087) — Theme Engine: 1 yayınlanmış varsayılan + 10 preset teması.
    const themeData = buildThemeData();
    counts.themes = await createManyChunked(prisma.theme, themeData.themes);
    counts.themeVersions = await createManyChunked(prisma.themeVersion, themeData.versions);

    const placeholders = await writePlaceholders(ds);
    return { counts, placeholders, durationMs: Date.now() - t0 };
  } finally {
    if (owned) await prisma.$disconnect();
  }
}
