import { format, type StorefrontDictionary } from "@commerce-os/i18n";
import { Eyebrow, Heading, Lead } from "../ui";
import { Breadcrumb } from "../seo/breadcrumb";
import { JsonLd } from "../seo/json-ld";
import type { SearchState } from "../../lib/search/url-state";
import {
  buildCategoryBreadcrumb,
  buildProductsBreadcrumb,
  type BreadcrumbItem,
} from "../../lib/seo/breadcrumb";
import { buildBreadcrumbJsonLd } from "../../lib/seo/json-ld";
import { absoluteUrl } from "../../lib/seo/site-url";
import { categoryPath, productsPath } from "../../lib/seo/routes";

/**
 * TODO-156D (brief §12/§15/§16) — PLP/arama/kategori başlığı + breadcrumb (görünür + JSON-LD TEK KAYNAK).
 *
 * H1: arama ise "\"q\" için sonuçlar"; kategori ise kategori adı (unique H1, §12); aksi "Tüm ürünler".
 * Breadcrumb trail paylaşılan builder'dan → görünür `<Breadcrumb>` HEM `BreadcrumbList` JSON-LD aynı kaynağı
 * kullanır (çelişki/kopya yok). JSON-LD yalnız kategori/düz-PLP'de (arama sonuç sayfası noindex → yapısal veri yok).
 */
export function SearchHeading({
  state,
  categoryLabel,
  t,
}: {
  state: SearchState;
  categoryLabel?: string | null;
  t: StorefrontDictionary;
}) {
  const s = t.search;
  const isSearch = state.q !== null;
  const labels = { home: s.breadcrumbHome, products: s.breadcrumbProducts };

  // H1 + tagline (kategori-farkında).
  const categoryName = categoryLabel ?? state.category ?? "";
  const title = isSearch
    ? format(s.searchTitle, { query: state.q as string })
    : state.category
      ? categoryName
      : s.allTitle;
  const tagline = isSearch ? s.searchTagline : state.category ? s.categoryTagline : s.allTagline;

  // Breadcrumb trail (tek kaynak). Kategori → kategori landing trail; aksi düz PLP trail.
  const trail: BreadcrumbItem[] = state.category
    ? buildCategoryBreadcrumb({ labels, categoryLabel: categoryName })
    : buildProductsBreadcrumb(labels);

  // BreadcrumbList JSON-LD yalnız indexlenebilir liste sayfalarında (arama değil).
  const breadcrumbLd = !isSearch
    ? buildBreadcrumbJsonLd(
        trail,
        absoluteUrl,
        absoluteUrl(state.category ? categoryPath(state.category) : productsPath()),
      )
    : null;

  return (
    <header className="max-w-2xl">
      {breadcrumbLd ? <JsonLd data={breadcrumbLd} /> : null}
      <Breadcrumb
        items={trail}
        label={t.shell.breadcrumb}
        className="mb-4 text-[11px] uppercase tracking-wideish text-ink-subtle"
      />
      <Eyebrow>{t.listing.eyebrow}</Eyebrow>
      <Heading as="h1" className="mt-3">
        {title}
      </Heading>
      <Lead className="mt-3">{tagline}</Lead>
    </header>
  );
}
