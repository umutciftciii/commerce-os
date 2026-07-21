import Link from "next/link";
import { cn } from "@commerce-os/ui";
import type { StorefrontHomeFeaturedCategory } from "../../lib/catalog-types";
import { categorySlugFromHref } from "../../lib/seo/routes";

/**
 * TODO-158C (ADR-088) — Kategori navigasyon şeridi (yatay, kaydırılabilir pill nav).
 *
 * PLP'de başlığın altında kategoriler arası hızlı geçiş sağlar (search iş mantığına
 * DOKUNMAZ; yalnız `/products?category=slug` linkleri). Kaynak: admin FEATURED_CATEGORIES
 * (bkz. lib/server/navigation.ts). Aktif kategori vurgulanır (ink pill); "Tümü" başa gelir.
 * Kategori yoksa render EDİLMEZ. Tamamen token-tabanlı.
 */
export function CategoryChips({
  categories,
  activeCategory,
  allLabel,
}: {
  categories: StorefrontHomeFeaturedCategory[];
  /** Aktif kategori slug'ı (state.category); null → "Tümü" aktif. */
  activeCategory: string | null;
  allLabel: string;
}) {
  if (categories.length === 0) return null;

  const chip = (active: boolean) =>
    cn(
      "inline-flex shrink-0 items-center rounded-full border px-3.5 py-1.5 text-xs font-medium uppercase tracking-wideish transition-colors",
      active
        ? "border-ink bg-ink text-surface"
        : "border-line-strong text-ink-muted hover:border-ink hover:text-ink",
    );

  return (
    <nav aria-label={allLabel} className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <ul className="flex items-center gap-2">
        <li>
          <Link href="/products" className={chip(activeCategory === null)}>
            {allLabel}
          </Link>
        </li>
        {categories.map((category) => {
          const slug = categorySlugFromHref(category.href);
          const active = slug !== null && slug === activeCategory;
          return (
            <li key={category.key}>
              <Link href={category.href} className={chip(active)}>
                {category.title}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
