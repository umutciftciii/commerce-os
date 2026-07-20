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
import { getStoreInfo, getStoreTheme } from "../lib/server/site";
import { fontVariables } from "../lib/fonts";
import { metadataBase, siteOrigin, absoluteUrl } from "../lib/seo/site-url";
import { searchActionTemplate } from "../lib/seo/routes";
import { buildOrganizationJsonLd, buildWebSiteJsonLd } from "../lib/seo/json-ld";
import { JsonLd } from "../components/seo/json-ld";
import "./globals.css";

// ADR-065 (Faz 3/Site Kabuğu) — Sekme basligi + favicon store marka bilgisinden
// (admin StoreSettings). storeName varsa baslik onu kullanir; favicon URL'i varsa
// <head>'e islenir. Marka bilgisi yoksa i18n meta fallback + override'siz favicon
// (mevcut davranis). getStoreInfo React cache()'li → RootLayout ile tek fetch.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getStorefrontDict();
  const storeInfo = await getStoreInfo();
  const siteName = storeInfo?.storeName ?? t.meta.title;
  return {
    // TODO-156D (ADR-080) — Mutlak URL otoritesi. Canonical/OG göreli path'leri buradan mutlaklanır.
    metadataBase: metadataBase(),
    // Başlık şablonu: alt sayfalar `title` verince "{title} · {mağaza}"; vermezse default.
    title: { default: siteName, template: `%s · ${siteName}` },
    description: t.meta.description,
    ...(storeInfo?.faviconUrl ? { icons: { icon: storeInfo.faviconUrl } } : {}),
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
  // ADR-065 (Faz 3/Site Kabuğu) — Header logo/kelime-işareti store marka
  // bilgisinden; logo yoksa serif kelime-işareti fallback (SiteHeader içinde).
  const storeInfo = await getStoreInfo();
  // TODO-158B (ADR-087) — Enterprise Theme Engine: yayınlanmış temanın çözülmüş
  // CSS'i (custom property override). null → globals.css varsayılanları geçerli.
  const theme = await getStoreTheme();

  // TODO-156D (ADR-083) — Site-geneli JSON-LD: Organization (marka) + WebSite (SearchAction).
  // Her sayfada bir kez head/body'ye gömülür; marka adı store bilgisinden, yoksa i18n fallback.
  const siteName = storeInfo?.storeName ?? t.meta.title;
  const organizationLd = buildOrganizationJsonLd({
    name: siteName,
    url: siteOrigin(),
    logoUrl: storeInfo?.logoUrl ? absoluteUrl(storeInfo.logoUrl) : null,
  });
  const webSiteLd = buildWebSiteJsonLd({
    name: siteName,
    url: siteOrigin(),
    searchUrlTemplate: absoluteUrl(searchActionTemplate()),
  });

  return (
    <html
      lang={locale}
      data-theme="default"
      className={fontVariables}
      style={theme?.colorScheme ? { colorScheme: theme.colorScheme } : undefined}
    >
      <body>
        {/* TODO-158B (ADR-087) — Yayınlanmış tema CSS'i: :root[data-theme] override
            bloğu (globals.css'i özgüllükte geçer). Mevcut token-tabanlı bileşenler
            otomatik yeniden temalanır. Tema yoksa hiçbir şey enjekte edilmez. */}
        {theme?.css ? (
          <style id="commerce-os-theme" dangerouslySetInnerHTML={{ __html: theme.css }} />
        ) : null}
        <JsonLd data={organizationLd} />
        <JsonLd data={webSiteLd} />
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
            storeName={storeInfo?.storeName ?? null}
            logoUrl={storeInfo?.logoUrl ?? null}
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
