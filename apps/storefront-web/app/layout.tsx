import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getDictionary } from "@commerce-os/i18n";
import { getRequestLocale, getStorefrontDict } from "../lib/i18n";
import { getCartCount } from "../lib/server/cart-cookie";
import { getCurrentCustomer } from "../lib/server/customer";
import { SiteHeader } from "../components/site/site-header";
import { SiteFooter } from "../components/site/site-footer";
import { CampaignBar } from "../components/site/campaign-bar";
import { getCampaignSlides } from "../lib/server/campaigns";
import { fontVariables } from "../lib/fonts";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getStorefrontDict();
  return {
    title: t.meta.title,
    description: t.meta.description,
  };
}

/**
 * Tema hazir genel vitrin cercevesi (ADIM 1 redesign).
 *
 * `data-theme` per-store temalama icin yer tutucu kancadir; token'lar CSS custom
 * property olarak bu attribute uzerinden override edilebilir (bkz. globals.css).
 * Cok kiracili magaza cozumlemesi (domain/slug -> magaza + tema) FAZ 6 kapsaminda
 * olup HENUZ uygulanmadi; bu uygulama su an tek bir demo magaza render eder.
 *
 * Font degiskenleri (`--font-*-face`) `<html>` uzerine uygulanir; semantik
 * `--font-sans/serif` globals.css'te bunlara baglanir. Aktif arayuz dili
 * cookie'den cozulur; header'daki LanguageSwitcher TR/EN gecisini saglar.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getRequestLocale();
  const dict = getDictionary(locale);
  const t = dict.storefront;
  const s = t.shell;
  const cartCount = await getCartCount();
  const customer = await getCurrentCustomer();
  // Üst band kampanya slider'ı GERÇEK F4A verisiyle beslenir; slide yoksa statik
  // duyuru metnine düşer (vitrin asla kırılmaz).
  const campaignSlides = await getCampaignSlides(locale);

  return (
    <html lang={locale} data-theme="default" className={fontVariables}>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:text-surface"
        >
          {s.skipToContent}
        </a>
        <div className="flex min-h-screen flex-col">
          {campaignSlides.length > 0 ? (
            <CampaignBar slides={campaignSlides} t={s} />
          ) : (
            <div className="bg-ink py-2 text-center text-[11px] font-medium uppercase tracking-wideish text-surface">
              {s.announcement}
            </div>
          )}

          <SiteHeader
            locale={locale}
            t={t}
            languageLabels={dict.common.language}
            cartCount={cartCount}
            customer={customer}
          />

          <main id="main" className="flex-1">
            {children}
          </main>

          <SiteFooter t={t} />
        </div>
      </body>
    </html>
  );
}
