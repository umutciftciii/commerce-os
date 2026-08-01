import { cache } from "react";
import {
  publicBrandDetailResponseSchema,
  publicBrandListResponseSchema,
  type PublicBrandDetail,
  type PublicBrandSummary,
} from "@commerce-os/api-client";
import type { StorefrontBrandDetail, StorefrontBrandSummary } from "../catalog-types";
import { demoStoreSlug } from "./env";
import { getPublic } from "./gateway";

/**
 * TODO-165A (ADR-165A) Task 18 — Vitrin marka (Brand) BFF (sunucu-yalniz).
 *
 * Gateway'in AUTH GEREKTIRMEYEN public marka uclarini (`/public/stores/:slug/brands`,
 * `/public/stores/:slug/brands/:brandSlug`) token'siz cagirir; yaniti `publicBrandListResponseSchema` /
 * `publicBrandDetailResponseSchema` ALLOWLIST'iyle DOGRULAR (schema parse hatasi → kontrollu error).
 * `lib/server/catalog.ts` (getStorefrontListing / getStorefrontProductByHandle) ile AYNI desen: no-store,
 * hicbir platform-admin kimligi/Bearer token tasimaz.
 */

export type BrandFailure = "no-store" | "error";

export type BrandListResult =
  | { ok: true; data: StorefrontBrandSummary[] }
  | { ok: false; reason: BrandFailure };

export type BrandDetailResult =
  | { ok: true; data: StorefrontBrandDetail | null }
  | { ok: false; reason: BrandFailure };

function toBrandSummary(brand: PublicBrandSummary): StorefrontBrandSummary {
  return {
    id: brand.id,
    name: brand.name,
    slug: brand.slug,
    logoUrl: brand.logoUrl,
    description: brand.description,
  };
}

function toBrandDetail(brand: PublicBrandDetail): StorefrontBrandDetail {
  return {
    ...toBrandSummary(brand),
    coverUrl: brand.coverUrl,
    websiteUrl: brand.websiteUrl,
    seoTitle: brand.seoTitle,
    seoDescription: brand.seoDescription,
    productCount: brand.productCount,
  };
}

/** `/markalar` dizin sayfasi: ACTIVE + en az 1 gorunur urunu olan tum markalar. */
export async function getStorefrontBrands(): Promise<BrandListResult> {
  try {
    const result = await getPublic<unknown>(
      `/public/stores/${encodeURIComponent(demoStoreSlug())}/brands`,
    );
    if (!result.ok) {
      return { ok: false, reason: result.status === 404 ? "no-store" : "error" };
    }
    const parsed = publicBrandListResponseSchema.safeParse(result.data);
    if (!parsed.success) return { ok: false, reason: "error" };
    return { ok: true, data: parsed.data.data.map(toBrandSummary) };
  } catch {
    return { ok: false, reason: "error" };
  }
}

/**
 * `/markalar/[slug]` marka detayi. React `cache()` ile sarili: `generateMetadata` HEM sayfa govdesi
 * ayni (slug) ile cagirir; getPublic no-store oldugundan fetch dedup edilmez → cache tek render-pass'te
 * TEK gateway cagrisi garantiler (PDP'deki getStorefrontProductByHandle ile ayni desen).
 *
 * Bilinmeyen/arsivlenmis/cross-store marka → gateway 404 (BRAND_NOT_FOUND/STORE_NOT_FOUND) → `data: null`
 * (grasyoz; cagiran taraf `notFound()` cagirir — PDP'deki `getStorefrontProductByHandle` desenidir).
 */
export const getStorefrontBrand = cache(async function getStorefrontBrand(
  slug: string,
): Promise<BrandDetailResult> {
  try {
    const result = await getPublic<unknown>(
      `/public/stores/${encodeURIComponent(demoStoreSlug())}/brands/${encodeURIComponent(slug)}`,
    );
    if (!result.ok) {
      if (result.status === 404) return { ok: true, data: null };
      return { ok: false, reason: "error" };
    }
    const parsed = publicBrandDetailResponseSchema.safeParse(result.data);
    if (!parsed.success) return { ok: false, reason: "error" };
    return { ok: true, data: toBrandDetail(parsed.data.data) };
  } catch {
    return { ok: false, reason: "error" };
  }
});
