import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Container, LanguageSwitcher } from "@commerce-os/ui";
import { getDictionary } from "@commerce-os/i18n";
import { getRequestLocale, getStorefrontDict } from "../lib/i18n";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getStorefrontDict();
  return {
    title: t.meta.title,
    description: t.meta.description,
  };
}

/**
 * Tema hazir genel vitrin cercevesi.
 *
 * `data-theme` per-store temalama icin yer tutucu bir kancadir. Cok kiracili
 * mağaza cozumlemesi (ornegin demo.localhost / ozel domain / slug -> mağaza)
 * HENUZ uygulanmadi; bu uygulama su an tek bir demo mağaza render eder.
 *
 * Aktif arayuz dili cookie'den cozulur (`getRequestLocale`); header'daki
 * LanguageSwitcher TR/EN gecisini saglar ve `data-theme`/shell yapisini bozmaz.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getRequestLocale();
  const dict = getDictionary(locale);
  const t = dict.storefront;
  const s = t.shell;

  return (
    <html lang={locale} data-theme="default">
      <body>
        <div className="flex min-h-screen flex-col bg-white">
          <div className="bg-slate-900 py-2 text-center text-xs font-medium text-slate-100">
            {s.announcement}
          </div>
          <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
            <Container className="flex h-16 items-center justify-between">
              <Link href="/" className="text-lg font-semibold tracking-tightish text-slate-900">
                {s.brand}
              </Link>
              <nav
                className="flex items-center gap-7 text-sm font-medium text-slate-600"
                aria-label="Birincil"
              >
                <Link href="/products" className="transition-colors hover:text-slate-900">
                  {s.navProducts}
                </Link>
                <Link
                  href="/cart"
                  className="inline-flex items-center gap-1.5 transition-colors hover:text-slate-900"
                >
                  {s.navCart}
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-100 px-1.5 text-xs font-semibold text-slate-500">
                    {t.cartCount}
                  </span>
                </Link>
                <LanguageSwitcher value={locale} labels={dict.common.language} />
              </nav>
            </Container>
          </header>

          <main className="flex-1">{children}</main>

          <footer className="mt-16 border-t border-slate-200 bg-slate-50">
            <Container className="grid grid-cols-2 gap-8 py-12 sm:grid-cols-4">
              <div className="col-span-2 sm:col-span-1">
                <p className="text-sm font-semibold tracking-tightish text-slate-900">{s.brand}</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{s.footerTagline}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {s.footerShopHeading}
                </p>
                <ul className="mt-3 space-y-2 text-sm text-slate-500">
                  <li>
                    <Link href="/products" className="hover:text-slate-900">
                      {s.footerAllProducts}
                    </Link>
                  </li>
                  <li>
                    <Link href="/cart" className="hover:text-slate-900">
                      {s.footerCart}
                    </Link>
                  </li>
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {s.footerHelpHeading}
                </p>
                <ul className="mt-3 space-y-2 text-sm text-slate-500">
                  <li>{s.footerHelpShipping}</li>
                  <li>{s.footerHelpReturns}</li>
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {s.footerCompanyHeading}
                </p>
                <ul className="mt-3 space-y-2 text-sm text-slate-500">
                  <li>{s.footerCompanyAbout}</li>
                  <li>{s.footerCompanyContact}</li>
                </ul>
              </div>
            </Container>
            <div className="border-t border-slate-200">
              <Container className="flex flex-col gap-1 py-5 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
                <span>{s.footerCopyright}</span>
                <span>{s.footerPoweredBy}</span>
              </Container>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
