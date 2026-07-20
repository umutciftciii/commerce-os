/**
 * Enterprise Demo Dataset — SAF özet/dağılım hesaplayıcı (DB'siz).
 * Hem dry-run çıktısında hem final raporda kullanılır. Kampanya "active/upcoming/ended"
 * sınıflaması startsAt/endsAt + status'tan türetilir (read-time deseniyle simetrik).
 */

import { DATE_ANCHORS } from "./constants.mjs";

function classifyCampaign(c) {
  if (c.status === "ARCHIVED" || c.status === "PAUSED" || c.status === "DRAFT") return "inactive";
  // Sınıflamada mutlak ankor tarihlerini referans al (determinizm).
  const ref = new Date("2026-07-20T00:00:00.000Z").getTime();
  if (c.startsAt && ref < c.startsAt.getTime()) return "upcoming";
  if (c.endsAt && ref > c.endsAt.getTime()) return "ended";
  return "active";
}

export function summarize(ds) {
  const bal = ds.inventoryBalances.filter((b) => b.warehouseId.endsWith("default"));
  const buckets = { inStock: 0, low: 0, out: 0, high: 0 };
  for (const b of bal) {
    if (b.onHand === 0) buckets.out += 1;
    else if (b.onHand >= 200) buckets.high += 1;
    else if (b.onHand <= b.reorderPoint) buckets.low += 1;
    else buckets.inStock += 1;
  }
  const total = bal.length || 1;

  const variantsByProduct = new Map();
  for (const v of ds.variants) variantsByProduct.set(v.productId, (variantsByProduct.get(v.productId) ?? 0) + 1);
  const singleVariant = [...variantsByProduct.values()].filter((n) => n === 1).length;
  const multiVariant = [...variantsByProduct.values()].filter((n) => n > 1).length;

  const productStatus = tally(ds.products.map((p) => p.status));
  const variantStatus = tally(ds.variants.map((v) => v.status));
  const brandsUsed = new Set(ds.products.map((p) => p.brand));
  const newProducts = ds.products.filter((p) => p.createdAt >= DATE_ANCHORS.newProductSince).length;
  const withImage = new Set(ds.productImages.map((i) => i.productId)).size;

  const campWindow = tally(ds.campaigns.map(classifyCampaign));
  const campType = tally(ds.campaigns.map((c) => c.type));
  const campDiscount = tally(ds.campaigns.map((c) => c.discountType));

  const prices = ds.variants.map((v) => v.priceMinor);
  const priceViolations =
    ds.variants.filter(
      (v) => v.priceMinor <= 0 || (v.costMinor !== null && v.costMinor > v.priceMinor) ||
        (v.compareAtMinor !== null && v.compareAtMinor <= v.priceMinor),
    ).length;

  return {
    categories: { total: ds.categories.length, leaves: ds.categories.filter((c) => isLeaf(ds, c.id)).length },
    brandsUsed: brandsUsed.size,
    products: { total: ds.products.length, byStatus: productStatus, new: newProducts, withImage, withoutImage: ds.products.length - withImage, singleVariant, multiVariant },
    variants: { total: ds.variants.length, byStatus: variantStatus, avgPerProduct: round2(ds.variants.length / ds.products.length) },
    attributes: { definitions: ds.attributes.definitions.length, options: ds.attributes.options.length, categoryLinks: ds.attributes.categoryLinks.length },
    inventory: {
      totalBalancesDefault: bal.length,
      inStockPct: pct(buckets.inStock, total), lowPct: pct(buckets.low, total), outPct: pct(buckets.out, total), highPct: pct(buckets.high, total),
      buckets,
    },
    campaigns: { total: ds.campaigns.length, byWindow: campWindow, byType: campType, byDiscount: campDiscount, coupons: ds.coupons.length, productScopes: ds.campaignProducts.length, categoryScopes: ds.campaignCategories.length },
    priceRangeMinor: { min: Math.min(...prices), max: Math.max(...prices) },
    priceViolations,
    warehouses: ds.warehouses.length,
    media: ds.media.length,
  };
}

function isLeaf(ds, id) {
  return !ds.categories.some((c) => c.parentId === id);
}
function tally(arr) {
  const m = {};
  for (const x of arr) m[x] = (m[x] ?? 0) + 1;
  return m;
}
function pct(n, total) { return Math.round((n / total) * 1000) / 10; }
function round2(n) { return Math.round(n * 100) / 100; }
