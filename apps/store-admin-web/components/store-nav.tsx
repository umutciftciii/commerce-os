"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale } from "@commerce-os/ui";
import { getDictionary } from "@commerce-os/i18n";
import {
  CampaignIcon,
  CategoryIcon,
  CustomerIcon,
  DashboardIcon,
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
  appearance: { tr: "Görünüm & Ayar", en: "Appearance & Settings" },
};

export function StoreNav({ onNavigate }: { onNavigate?: () => void } = {}) {
  const pathname = usePathname();
  const locale = useLocale();
  const t = getDictionary(locale).storeAdmin.nav;
  const g = (key: keyof typeof GROUP_LABELS) =>
    locale === "tr" ? GROUP_LABELS[key].tr : GROUP_LABELS[key].en;

  const groups = [
    {
      heading: g("catalog"),
      items: [
        { href: "/", label: t.dashboard, icon: <DashboardIcon /> },
        { href: "/products", label: t.products, icon: <ProductIcon /> },
        { href: "/categories", label: t.categories, icon: <CategoryIcon /> },
        { href: "/inventory", label: t.inventory, icon: <InventoryIcon /> },
      ],
    },
    {
      heading: g("sales"),
      items: [
        { href: "/orders", label: t.orders, icon: <OrderIcon /> },
        { href: "/customers", label: t.customers, icon: <CustomerIcon /> },
        { href: "/payment-providers", label: t.paymentProviders, icon: <PaymentIcon /> },
        { href: "/shipping/shipments", label: t.shipments, icon: <ShippingIcon /> },
        { href: "/shipping/providers", label: t.shippingProviders, icon: <ShippingIcon /> },
        { href: "/shipping/rates", label: t.shippingRates, icon: <ShippingIcon /> },
        { href: "/campaigns", label: t.campaigns, icon: <CampaignIcon /> },
        { href: "/marketplace", label: t.marketplace, icon: <MarketplaceIcon /> },
      ],
    },
    {
      heading: g("appearance"),
      items: [
        { href: "/theme", label: t.theme, icon: <ThemeIcon /> },
        { href: "/settings", label: t.settings, icon: <SettingsIcon /> },
      ],
    },
  ];

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <nav className="flex flex-col gap-0.5" aria-label="Birincil">
      {groups.map((group, gi) => (
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
