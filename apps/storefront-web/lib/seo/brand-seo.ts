/**
 * TODO-165A (ADR-165A) Task 20 — Marka SEO türetme (SAF, test edilebilir). `/markalar/[slug]` metadata +
 * Brand JSON-LD için title/description türetir. `lib/seo/product-seo.ts` (PDP) ile AYNI desen: admin
 * seoTitle/seoDescription override'ı ÖNCELİKLİDİR, yoksa marka adı/açıklaması, yoksa çağıranın fallback'i.
 */
import type { StorefrontBrandDetail } from "../catalog-types";
import { truncateForMeta } from "./product-seo";

/** Meta başlık: admin seoTitle > marka adı. */
export function brandMetaTitle(brand: Pick<StorefrontBrandDetail, "seoTitle" | "name">): string {
  const seo = brand.seoTitle?.trim();
  return seo && seo.length > 0 ? seo : brand.name;
}

/** Meta açıklama: admin seoDescription > marka açıklaması > fallback; tek satır + kırpılmış. */
export function brandMetaDescription(
  brand: Pick<StorefrontBrandDetail, "seoDescription" | "description">,
  fallback: string,
): string {
  const seo = brand.seoDescription?.trim();
  if (seo && seo.length > 0) return truncateForMeta(seo);
  const desc = brand.description?.trim();
  if (desc && desc.length > 0) return truncateForMeta(desc);
  return truncateForMeta(fallback);
}
