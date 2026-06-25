import {
  ApiError,
  createApiClient,
  type Product,
  type ProductCategory,
  type ProductVariant,
} from "@commerce-os/api-client";
import type {
  StorefrontPrice,
  StorefrontProductDetail,
  StorefrontProductSummary,
  StorefrontVariantView,
} from "../catalog-types";
import { deriveProductCommerceView } from "../sales-model";
import { formatLowest, formatMinor, formatPriceRange } from "../money";
import { demoStoreSlug } from "./env";
import { getCatalogToken, invalidateCatalogToken } from "./api-token";

/**
 * Vitrin katalog cozumleyici (F3A). Sunucu-tarafi token ile gateway'in
 * platform-admin korumali katalog uclarini cagirir; ham urun/varyant/stok
 * verisini saf vitrin gorunum modellerine (catalog-types) cevirir. Token bu
 * katmandan disari (istemciye) cikmaz. Yalnizca ACTIVE urun/varyantlar
 * gosterilir; vitrin yalnizca okuma yapar.
 */

export type CatalogFailure = "no-store" | "error";

export type CatalogResult<T> = { ok: true; data: T } | { ok: false; reason: CatalogFailure };

export interface StoreContext {
  id: string;
  name: string;
  slug: string;
}

/**
 * Token ile bir api cagrisi yapar; 401 (oturum gecersiz) durumunda token'i
 * tazeleyip bir kez daha dener. Token argumana enjekte edilir, donen veriye
 * dahil edilmez.
 */
async function withToken<T>(fn: (token: string) => Promise<T>): Promise<T> {
  const token = await getCatalogToken();
  try {
    return await fn(token);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      invalidateCatalogToken();
      const fresh = await getCatalogToken();
      return fn(fresh);
    }
    throw error;
  }
}

/** Demo/hedef mağazayi slug ile (yoksa listenin ilki) sunucu-tarafinda cozer. */
export async function resolveStoreContext(): Promise<StoreContext | null> {
  const slug = demoStoreSlug();
  const result = await withToken((token) => createApiClient().admin.stores.list(token));
  const stores = result.data.filter((store) => store.status === "ACTIVE");
  if (stores.length === 0) return null;
  const preferred = stores.find((store) => store.slug === slug) ?? stores[0];
  return { id: preferred.id, name: preferred.name, slug: preferred.slug };
}

function activeVariantPrices(variants: ProductVariant[]) {
  return variants
    .filter((variant) => variant.status === "ACTIVE")
    .map((variant) => ({ priceMinor: variant.priceMinor, currency: variant.currency }));
}

function buildPrice(product: Product, variants: ProductVariant[]): StorefrontPrice {
  const commerce = deriveProductCommerceView(product);
  const active = variants.filter((variant) => variant.status === "ACTIVE");
  const prices = activeVariantPrices(variants);

  let amountLabel: string | null = null;
  if (commerce.priceMode === "amount") amountLabel = formatPriceRange(prices);
  else if (commerce.priceMode === "startingFrom") amountLabel = formatLowest(prices);

  // Indirim: en dusuk fiyatli varyantta gecerli bir compareAt varsa goster.
  let compareAtLabel: string | null = null;
  if (commerce.priceMode === "amount" && active.length > 0) {
    const cheapest = active.reduce((min, v) => (v.priceMinor < min.priceMinor ? v : min), active[0]);
    if (cheapest.compareAtMinor !== null && cheapest.compareAtMinor > cheapest.priceMinor) {
      compareAtLabel = formatMinor(cheapest.compareAtMinor, cheapest.currency);
    }
  }

  return { mode: commerce.priceMode, amountLabel, compareAtLabel };
}

function categoryLabel(product: Product, categories: Map<string, ProductCategory>): string | null {
  const first = product.categoryIds.find((id) => categories.has(id));
  return first ? (categories.get(first)?.name ?? null) : null;
}

function buildSummary(
  product: Product,
  variants: ProductVariant[],
  categories: Map<string, ProductCategory>,
): StorefrontProductSummary {
  const price = buildPrice(product, variants);
  return {
    handle: product.slug,
    title: product.title,
    brand: product.brand ?? product.vendor ?? null,
    categoryLabel: categoryLabel(product, categories),
    price,
    commerce: deriveProductCommerceView(product),
    badgeKind: price.compareAtLabel ? "discount" : null,
  };
}

async function loadCategories(storeId: string): Promise<Map<string, ProductCategory>> {
  const result = await withToken((token) =>
    createApiClient().admin.categories.list(storeId, token),
  );
  return new Map(result.data.map((category) => [category.id, category]));
}

async function loadActiveProducts(storeId: string): Promise<Product[]> {
  const result = await withToken((token) => createApiClient().admin.products.list(storeId, token));
  return result.data.filter((product) => product.status === "ACTIVE");
}

async function loadVariants(storeId: string, productId: string): Promise<ProductVariant[]> {
  const result = await withToken((token) =>
    createApiClient().admin.products.variants.list(storeId, productId, token),
  );
  return result.data;
}

async function loadInventoryMap(storeId: string): Promise<Map<string, number>> {
  const result = await withToken((token) => createApiClient().admin.inventory.list(storeId, token));
  return new Map(result.data.map((item) => [item.variantId, item.quantityAvailable]));
}

/** Bir urun kumesini varyantlariyla ozet gorunume cevirir (fiyatli kartlar). */
async function summarize(
  storeId: string,
  products: Product[],
  categories: Map<string, ProductCategory>,
): Promise<StorefrontProductSummary[]> {
  return Promise.all(
    products.map(async (product) =>
      buildSummary(product, await loadVariants(storeId, product.id), categories),
    ),
  );
}

/** Vitrin liste sayfasi: tum ACTIVE urunlerin ozet gorunumu. */
export async function getStorefrontListing(): Promise<CatalogResult<StorefrontProductSummary[]>> {
  try {
    const store = await resolveStoreContext();
    if (!store) return { ok: false, reason: "no-store" };
    const [products, categories] = await Promise.all([
      loadActiveProducts(store.id),
      loadCategories(store.id),
    ]);
    return { ok: true, data: await summarize(store.id, products, categories) };
  } catch {
    return { ok: false, reason: "error" };
  }
}

/** Ana sayfa one cikan urunler (ilk N ACTIVE urun). */
export async function getFeaturedProducts(
  limit: number,
): Promise<CatalogResult<StorefrontProductSummary[]>> {
  const listing = await getStorefrontListing();
  if (!listing.ok) return listing;
  return { ok: true, data: listing.data.slice(0, limit) };
}

function buildVariantViews(
  variants: ProductVariant[],
  priceVisible: boolean,
  inventory: Map<string, number>,
): StorefrontVariantView[] {
  return variants
    .filter((variant) => variant.status === "ACTIVE")
    .map((variant) => {
      const available = inventory.has(variant.id) ? inventory.get(variant.id)! : null;
      return {
        id: variant.id,
        title: variant.title,
        sku: variant.sku,
        priceLabel: priceVisible ? formatMinor(variant.priceMinor, variant.currency) : null,
        compareAtLabel:
          priceVisible && variant.compareAtMinor !== null && variant.compareAtMinor > variant.priceMinor
            ? formatMinor(variant.compareAtMinor, variant.currency)
            : null,
        available,
        // Stok bilinmiyorsa (null) urunu yanlislikla tukenmis gostermeyiz.
        inStock: available === null ? true : available > 0,
      };
    });
}

/** Urun detayi: slug ile cozulur; varyant/stok/benzer urunlerle zenginlestirilir. */
export async function getStorefrontProductByHandle(
  handle: string,
): Promise<CatalogResult<StorefrontProductDetail | null>> {
  try {
    const store = await resolveStoreContext();
    if (!store) return { ok: false, reason: "no-store" };
    const [products, categories, inventory] = await Promise.all([
      loadActiveProducts(store.id),
      loadCategories(store.id),
      loadInventoryMap(store.id),
    ]);
    const product = products.find((item) => item.slug === handle);
    if (!product) return { ok: true, data: null };

    const variants = await loadVariants(store.id, product.id);
    const summary = buildSummary(product, variants, categories);
    const priceVisible = summary.commerce.priceMode === "amount" || summary.commerce.priceMode === "startingFrom";
    const variantViews = buildVariantViews(variants, priceVisible, inventory);
    const related = await summarize(
      store.id,
      products.filter((item) => item.id !== product.id).slice(0, 4),
      categories,
    );

    const detail: StorefrontProductDetail = {
      ...summary,
      description: product.description ?? null,
      sku: variantViews[0]?.sku ?? null,
      variants: variantViews,
      callToActionLabel: product.callToActionLabel ?? null,
      whatsappMessageTemplate: product.whatsappMessageTemplate ?? null,
      inquiryFormTitle: product.inquiryFormTitle ?? null,
      appointmentNote: product.appointmentNote ?? null,
      related,
    };
    return { ok: true, data: detail };
  } catch {
    return { ok: false, reason: "error" };
  }
}
