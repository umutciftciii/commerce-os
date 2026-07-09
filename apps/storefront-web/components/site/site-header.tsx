import Link from "next/link";
import type { LanguageSwitcherLabels } from "@commerce-os/ui";
import type { Locale, StorefrontDictionary } from "@commerce-os/i18n";
import type { CustomerAccount } from "@commerce-os/api-client";
import { Container } from "../ui";
import { AccountMenu } from "../account/account-menu";
import { MobileMenu } from "./mobile-menu";
import { LangToggle } from "./lang-toggle";

/**
 * Ortak vitrin header'i (ADIM 1). Premium/minimal: ince hairline alt cizgi,
 * serif marka kelime-isareti, sade nav, aksansiz ikonlar.
 *
 * Mevcut FONKSIYON korunur: sepet sayaci (`cartCount`), hesap menusu
 * (`AccountMenu`), dil degistirici (`LanguageSwitcher`). Yeni eklenenler MOCK'tur
 * (arama otomatik-tamamlama yok; favoriler mevcut hesap bolumune baglanir).
 */
export function SiteHeader({
  locale,
  t,
  languageLabels,
  cartCount,
  customer,
}: {
  locale: Locale;
  t: StorefrontDictionary;
  languageLabels: LanguageSwitcherLabels;
  cartCount: number;
  customer: CustomerAccount | null;
}) {
  const s = t.shell;
  const navLinks = [{ href: "/products", label: s.navProducts }];

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface relative">
      <Container className="flex h-16 items-center gap-4">
        {/* Sol: mobil menu + desktop nav */}
        <div className="flex flex-1 items-center gap-6">
          <MobileMenu links={navLinks} openLabel={s.menuOpen} closeLabel={s.menuClose} />
          <nav
            className="hidden items-center gap-7 text-xs font-medium uppercase tracking-wideish text-ink-muted lg:flex"
            aria-label="Birincil"
          >
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href} className="transition-colors hover:text-ink">
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        {/* Orta: serif marka kelime-isareti */}
        <Link
          href="/"
          className="font-serif text-xl font-normal tracking-tightish text-ink sm:text-2xl"
        >
          {s.brand}
        </Link>

        {/* Sag: arama + hesap + favoriler + sepet + dil */}
        <div className="flex flex-1 items-center justify-end gap-4 sm:gap-5">
          {/* MOCK: Arama otomatik tamamlama yok — form yalnizca ürün listesine yönlendirir, bkz. todo.md. */}
          <form action="/products" className="hidden items-center md:flex" role="search">
            <label htmlFor="site-search" className="sr-only">
              {s.searchSubmit}
            </label>
            <input
              id="site-search"
              name="q"
              type="search"
              placeholder={s.searchPlaceholder}
              className="h-9 w-40 rounded-none border-b border-line bg-transparent px-1 text-sm text-ink placeholder:text-ink-subtle focus:border-ink focus:outline-none lg:w-52"
            />
            <button type="submit" aria-label={s.searchSubmit} className="ml-1 text-ink-muted hover:text-ink">
              <SearchIcon />
            </button>
          </form>

          <div className="hidden text-xs font-medium uppercase tracking-wideish text-ink-muted sm:block">
            <AccountMenu customer={customer} t={t.account} />
          </div>

          {/* MOCK: Favoriler — kart üstünden kaydetme yok; ikon mevcut hesap bölümüne gider, bkz. todo.md. */}
          <Link
            href="/account?section=favorites"
            aria-label={s.wishlist}
            title={s.wishlistSoon}
            className="hidden text-ink transition-opacity hover:opacity-60 sm:inline-flex"
          >
            <HeartIcon />
          </Link>

          <Link
            href="/cart"
            aria-label={s.navCart}
            className="relative inline-flex text-ink transition-opacity hover:opacity-60"
          >
            <BagIcon />
            {cartCount > 0 ? (
              <span className="absolute -right-2 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-ink px-1 text-[10px] font-semibold text-surface">
                {cartCount}
              </span>
            ) : null}
          </Link>

          <div className="hidden lg:block">
            <LangToggle value={locale} labels={languageLabels} />
          </div>
        </div>
      </Container>
    </header>
  );
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12.5 12.5L16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
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
