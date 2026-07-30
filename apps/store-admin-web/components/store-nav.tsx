"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useLocale } from "@commerce-os/ui";
import { getDictionary } from "@commerce-os/i18n";
import { storeApi } from "../lib/client/api";
import {
  AttributeIcon,
  CampaignIcon,
  CategoryIcon,
  CustomerIcon,
  InfluencerIcon,
  ReviewIcon,
  DashboardIcon,
  HomeIcon,
  InventoryIcon,
  MarketplaceIcon,
  OrderIcon,
  PaymentIcon,
  ProductIcon,
  SettingsIcon,
  ShippingIcon,
  ThemeIcon,
} from "./icons";

/**
 * Koyu glassmorphism kenar menüsü. Rotalar ve aktif-durum mantığı önceki
 * sürümle birebir aynı; yalnızca görünüm (gruplama + koyu tema) değişti.
 * Hiçbir veri çağrısı yapılmaz.
 */

// Grup başlıkları i18n paketinde tanımlı olmadığından (paylaşılan paket; ona
// dokunmuyoruz) yalnızca görünüm amaçlı, locale farkındalıklı yerel etiketler.
const GROUP_LABELS: Record<string, { tr: string; en: string }> = {
  catalog: { tr: "Katalog", en: "Catalogue" },
  sales: { tr: "Satış", en: "Sales" },
  sponsorship: { tr: "Sponsorluk", en: "Sponsorship" },
  appearance: { tr: "Görünüm & Ayar", en: "Appearance & Settings" },
  system: { tr: "Sistem", en: "System" },
};

// TODO-161A.1 — Ticari otomasyon operasyon ekranı etiketi (yerel; paylaşılan i18n'e dokunulmaz).
const SYSTEM_LABELS: Record<string, { tr: string; en: string }> = {
  operations: { tr: "Operasyon", en: "Operations" },
};

// TODO-161A — Sponsorluk ekranı etiketleri (paylaşılan i18n paketine dokunmadan; yerel).
const SPONSORSHIP_LABELS: Record<string, { tr: string; en: string }> = {
  sponsors: { tr: "Sponsorlar", en: "Sponsors" },
  agreements: { tr: "Anlaşmalar", en: "Agreements" },
  campaigns: { tr: "Sponsorlu Kampanyalar", en: "Sponsored Campaigns" },
  settlements: { tr: "Mutabakatlar", en: "Settlements" },
  payments: { tr: "Tahakkuk & Tahsilat", en: "Billing & Collections" },
};

// TODO-163 (ADR-208…ADR-210) — Nav item → modül anahtarı eşlemesi. Eşleşen modül effective
// KAPALIysa item gizlenir. Eşlemesi olmayan item'lar (dashboard, ayarlar, modül yönetimi)
// her zaman gösterilir (çekirdek/yönetim). Effective durum SUNUCUDA türetilir; burada yalnız
// gizleme yapılır (güvenlik enforcement gateway'de).
const HREF_MODULE: Record<string, string> = {
  "/inventory": "inventory",
  "/customers": "customers",
  "/reviews": "reviews",
  "/payment-providers": "payments",
  "/shipping/shipments": "shipping",
  "/shipping/providers": "shipping",
  "/shipping/rates": "shipping",
  "/campaigns": "campaigns",
  "/influencers": "influencers",
  "/influencer-campaigns": "influencers",
  "/marketplace": "marketplace",
  "/sponsors": "sponsorship",
  "/sponsorship-agreements": "sponsorship",
  "/sponsored-products": "sponsorship",
  "/sponsorship-settlements": "sponsorship",
  "/sponsorship-payments": "sponsorship",
  "/home": "home_experience",
  "/hero": "home_experience",
  "/theme": "theme",
  "/operations": "operations",
};

export function StoreNav({ onNavigate }: { onNavigate?: () => void } = {}) {
  const pathname = usePathname();
  const locale = useLocale();
  const t = getDictionary(locale).storeAdmin.nav;

  // TODO-163 — Effective KAPALI modüllerin anahtar kümesi (nav gizleme). Yüklenene kadar boş
  // (tüm item'lar görünür → flash yok); güvenlik enforcement gateway'de.
  const [disabledModules, setDisabledModules] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    let active = true;
    storeApi
      .listModules()
      .then((res) => {
        if (!active) return;
        const off = new Set(
          res.data.modules.filter((m) => !m.effectiveEnabled).map((m) => m.key),
        );
        setDisabledModules(off);
      })
      .catch(() => {
        // Sessizce yok say: nav gizleme opsiyonel iyileştirmedir, enforcement gateway'de.
      });
    return () => {
      active = false;
    };
  }, []);
  const g = (key: keyof typeof GROUP_LABELS) =>
    locale === "tr" ? GROUP_LABELS[key].tr : GROUP_LABELS[key].en;
  const s = (key: keyof typeof SPONSORSHIP_LABELS) =>
    locale === "tr" ? SPONSORSHIP_LABELS[key].tr : SPONSORSHIP_LABELS[key].en;
  const sys = (key: keyof typeof SYSTEM_LABELS) =>
    locale === "tr" ? SYSTEM_LABELS[key].tr : SYSTEM_LABELS[key].en;

  const groups = [
    {
      heading: g("catalog"),
      items: [
        { href: "/", label: t.dashboard, icon: <DashboardIcon /> },
        { href: "/products", label: t.products, icon: <ProductIcon /> },
        { href: "/categories", label: t.categories, icon: <CategoryIcon /> },
        { href: "/attributes", label: t.attributes, icon: <AttributeIcon /> },
        { href: "/inventory", label: t.inventory, icon: <InventoryIcon /> },
      ],
    },
    {
      heading: g("sales"),
      items: [
        { href: "/orders", label: t.orders, icon: <OrderIcon /> },
        { href: "/customers", label: t.customers, icon: <CustomerIcon /> },
        { href: "/reviews", label: t.reviews, icon: <ReviewIcon /> },
        { href: "/payment-providers", label: t.paymentProviders, icon: <PaymentIcon /> },
        { href: "/shipping/shipments", label: t.shipments, icon: <ShippingIcon /> },
        { href: "/shipping/providers", label: t.shippingProviders, icon: <ShippingIcon /> },
        { href: "/shipping/rates", label: t.shippingRates, icon: <ShippingIcon /> },
        { href: "/campaigns", label: t.campaigns, icon: <CampaignIcon /> },
        { href: "/influencers", label: t.influencers, icon: <InfluencerIcon /> },
        {
          href: "/influencer-campaigns",
          label: t.influencerCampaigns,
          icon: <CampaignIcon />,
        },
        { href: "/marketplace", label: t.marketplace, icon: <MarketplaceIcon /> },
      ],
    },
    {
      heading: g("sponsorship"),
      items: [
        { href: "/sponsors", label: s("sponsors"), icon: <CustomerIcon /> },
        { href: "/sponsorship-agreements", label: s("agreements"), icon: <CampaignIcon /> },
        { href: "/sponsored-products", label: s("campaigns"), icon: <MarketplaceIcon /> },
        { href: "/sponsorship-settlements", label: s("settlements"), icon: <PaymentIcon /> },
        { href: "/sponsorship-payments", label: s("payments"), icon: <PaymentIcon /> },
      ],
    },
    {
      heading: g("appearance"),
      items: [
        { href: "/home", label: t.homeExperience, icon: <HomeIcon /> },
        { href: "/hero", label: t.hero, icon: <HomeIcon /> },
        { href: "/theme", label: t.theme, icon: <ThemeIcon /> },
        { href: "/settings", label: t.settings, icon: <SettingsIcon /> },
        { href: "/modules", label: locale === "tr" ? "Modüller" : "Modules", icon: <SettingsIcon /> },
      ],
    },
    {
      heading: g("system"),
      items: [
        { href: "/operations", label: sys("operations"), icon: <DashboardIcon /> },
      ],
    },
  ];

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  // TODO-163 — Effective KAPALI modüle eşleşen item'ları gizle; tüm item'ları gizlenen
  // grupları da at (boş başlık/ayraç kalmasın).
  const visibleGroups = groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        const moduleKey = HREF_MODULE[item.href];
        return !moduleKey || !disabledModules.has(moduleKey);
      }),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <nav className="flex flex-col gap-0.5" aria-label="Birincil">
      {visibleGroups.map((group, gi) => (
        <div key={group.heading}>
          {gi > 0 ? <div className="mx-2 my-1.5 h-px bg-white/[0.06]" /> : null}
          <p className="px-3 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/20">
            {group.heading}
          </p>
          {group.items.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={[
                  "flex items-center gap-2.5 rounded-[10px] px-[11px] py-2 text-[13px] leading-tight transition-colors",
                  "[&>svg]:h-[15px] [&>svg]:w-[15px] [&>span>svg]:h-[15px] [&>span>svg]:w-[15px]",
                  active
                    ? "border border-indigo-500/[0.28] bg-indigo-500/[0.18] font-semibold text-white/95"
                    : "border border-transparent font-normal text-white/50 hover:bg-white/[0.04] hover:text-white/80",
                ].join(" ")}
              >
                <span className="flex h-[15px] w-[15px] shrink-0 items-center justify-center">
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
