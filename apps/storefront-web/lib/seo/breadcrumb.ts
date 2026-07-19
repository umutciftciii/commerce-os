/**
 * TODO-156D (ADR-080/brief §15) — Breadcrumb TEK KAYNAK (SAF). UI `<Breadcrumb>` bileşeni HEM JSON-LD
 * `BreadcrumbList` builder'ı AYNI trail'i tüketir → görünür breadcrumb ile yapısal veri ASLA çelişmez,
 * kopya üretilmez. Path'ler URL governance builder'larından (routes.ts) gelir.
 */
import { homePath, productPath, productsPath, categoryPath } from "./routes";

/** Bir breadcrumb düğümü. `path === null` → geçerli sayfa (link YOK, aria-current="page"). */
export interface BreadcrumbItem {
  label: string;
  path: string | null;
}

export interface BreadcrumbLabels {
  home: string;
  products: string;
}

/** Ana sayfa + "Ürünler" ortak kökü (tüm katalog breadcrumb'ları bununla başlar). */
function root(labels: BreadcrumbLabels, productsIsCurrent: boolean): BreadcrumbItem[] {
  return [
    { label: labels.home, path: homePath() },
    { label: labels.products, path: productsIsCurrent ? null : productsPath() },
  ];
}

/** PDP trail: Ana sayfa › Ürünler › [Kategori] › Başlık (current). Kategori slug varsa linklenir. */
export function buildProductBreadcrumb(params: {
  labels: BreadcrumbLabels;
  title: string;
  categoryLabel?: string | null;
  categorySlug?: string | null;
}): BreadcrumbItem[] {
  const trail = root(params.labels, false);
  if (params.categoryLabel) {
    trail.push({
      label: params.categoryLabel,
      // Slug bilinmiyorsa link üretme (uydurma URL yok); yalnız etiket.
      path: params.categorySlug ? categoryPath(params.categorySlug) : null,
    });
  }
  trail.push({ label: params.title, path: null });
  return trail;
}

/** Kategori landing trail: Ana sayfa › Ürünler › Kategori (current). */
export function buildCategoryBreadcrumb(params: {
  labels: BreadcrumbLabels;
  categoryLabel: string;
}): BreadcrumbItem[] {
  const trail = root(params.labels, false);
  trail.push({ label: params.categoryLabel, path: null });
  return trail;
}

/** Düz PLP / arama trail: Ana sayfa › Ürünler (current). */
export function buildProductsBreadcrumb(labels: BreadcrumbLabels): BreadcrumbItem[] {
  return root(labels, true);
}

/** İç kullanım: PDP kanonik path (JSON-LD son düğüm URL'i için). */
export function productBreadcrumbLeafPath(handle: string): string {
  return productPath(handle);
}
