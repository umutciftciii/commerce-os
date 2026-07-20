import { Suspense } from "react";
import Link from "next/link";
import type { LanguageSwitcherLabels } from "@commerce-os/ui";
import type { Locale, StorefrontDictionary } from "@commerce-os/i18n";
import type { CustomerAccount } from "@commerce-os/api-client";
import type { StorefrontHomeFeaturedCategory } from "../../lib/catalog-types";
import { Container } from "../ui";
import { AccountMenu } from "../account/account-menu";
import { MobileMenu } from "./mobile-menu";
import { CategoryMenu } from "./category-menu";
import { HeaderSearch, HeaderSearchFallback } from "./header-search";
import { MobileSearch } from "./mobile-search";
import { LangToggle } from "./lang-toggle";
import { StickyHeader } from "./sticky-header";

/**
 * Ortak vitrin header'i (TODO-158C yeniden tasarım). Premium/minimal editoryel dil:
 * ortalanmış serif kelime-işareti, hairline alt çizgi, ölçülü accent.
 *
 * TODO-158C eklenenleri:
 *  - Sticky KONDENS: scroll'da yumuşak gölge (StickyHeader).
 *  - Kategori MEGA MENÜ (desktop ≥ lg) + mobil kategori akordeonu (FEATURED_CATEGORIES).
 *  - Aksiyon ikonları accent hover + daha net dokunma alanları; sepet rozeti accent.
 * Mevcut FONKSIYON korunur: sepet sayacı, hesap menüsü, dil, autocomplete arama.
 * Wishlist hâlâ MOCK (hesap bölümüne yönlendirir).
 */
export function SiteHeader({
  locale,
  t,
  languageLabels,
  cartCount,
  customer,
  storeName = null,
  logoUrl = null,
  categories = [],
}: {
  locale: Locale;
  t: StorefrontDictionary;
  languageLabels: LanguageSwitcherLabels;
  cartCount: number;
  customer: CustomerAccount | null;
  storeName?: string | null;
  logoUrl?: string | null;
  // TODO-158C — Header kategori mega-menü kaynağı (admin FEATURED_CATEGORIES; public).
  categories?: StorefrontHomeFeaturedCategory[];
}) {
  const s = t.shell;
  const navLinks = [{ href: "/products", label: s.navProducts }];
  const brandLabel = storeName ?? s.brand;

  return (
    <StickyHeader>
      <Container className="flex h-16 items-center gap-4">
        {/* Sol: mobil menu + desktop nav (kategori mega menü + ürünler) */}
        <div className="flex flex-1 items-center gap-6">
          <MobileMenu
            links={navLinks}
            categories={categories}
            categoriesLabel={s.navCategories}
            openLabel={s.menuOpen}
            closeLabel={s.menuClose}
          />
          <nav
            className="hidden items-center gap-7 lg:flex"
            aria-label="Birincil"
          >
            <CategoryMenu
              categories={categories}
              label={s.navCategories}
              allLabel={s.navAllCategories}
              allHref="/products"
            />
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-xs font-medium uppercase tracking-wideish text-ink-muted transition-colors hover:text-ink"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        {/* Orta: marka logosu (varsa) ya da serif kelime-isareti fallback */}
        <Link href="/" aria-label={brandLabel} className="inline-flex items-center">
          {logoUrl ? (
            <img src={logoUrl} alt={brandLabel} className="h-8 w-auto object-contain sm:h-9" />
          ) : (
            <span className="font-serif text-xl font-normal tracking-tightish text-ink sm:text-2xl">
              {brandLabel}
            </span>
          )}
        </Link>

        {/* Sag: arama + hesap + favoriler + sepet + dil */}
        <div className="flex flex-1 items-center justify-end gap-3 sm:gap-4">
          {/* TODO-156E — Enterprise autocomplete combobox (desktop/tablet). Mobilde MobileSearch drawer'ı. */}
          <Suspense fallback={<HeaderSearchFallback placeholder={s.searchPlaceholder} submitLabel={s.searchSubmit} />}>
            <HeaderSearch t={t} className="hidden md:block" />
          </Suspense>
          <MobileSearch t={t} />

          <div className="hidden text-xs font-medium uppercase tracking-wideish text-ink-muted sm:block">
            <AccountMenu customer={customer} t={t.account} />
          </div>

          {/* MOCK: Favoriler — kart üstünden kaydetme yok; ikon mevcut hesap bölümüne gider, bkz. todo.md. */}
          <Link
            href="/account?section=favorites"
            aria-label={s.wishlist}
            title={s.wishlistSoon}
            className="hidden text-ink transition-colors hover:text-accent sm:inline-flex"
          >
            <HeartIcon />
          </Link>

          <Link
            href="/cart"
            aria-label={s.navCart}
            className="relative inline-flex text-ink transition-colors hover:text-accent"
          >
            <BagIcon />
            {cartCount > 0 ? (
              <span className="absolute -right-2 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-contrast">
                {cartCount}
              </span>
            ) : null}
          </Link>

          <div className="hidden lg:block">
            <LangToggle value={locale} labels={languageLabels} />
          </div>
        </div>
      </Container>
    </StickyHeader>
  );
}

function HeartIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M10 16.5S3 12.5 3 7.75A3.25 3.25 0 0 1 10 5.6a3.25 3.25 0 0 1 7 2.15C17 12.5 10 16.5 10 16.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BagIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M5.5 6.5h9l.8 10H4.7l.8-10Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M7.5 6.5a2.5 2.5 0 0 1 5 0" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
