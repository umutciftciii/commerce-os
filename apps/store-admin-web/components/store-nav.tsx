"use client";

import { usePathname } from "next/navigation";
import { SidebarNav } from "@commerce-os/ui";
import { getDictionary } from "@commerce-os/i18n";
import {
  CategoryIcon,
  CustomerIcon,
  DashboardIcon,
  InventoryIcon,
  MarketplaceIcon,
  OrderIcon,
  ProductIcon,
  SettingsIcon,
  ThemeIcon,
} from "./icons";

const t = getDictionary().storeAdmin.nav;

const items = [
  { href: "/", label: t.dashboard, icon: <DashboardIcon /> },
  { href: "/products", label: t.products, icon: <ProductIcon /> },
  { href: "/categories", label: t.categories, icon: <CategoryIcon /> },
  { href: "/orders", label: t.orders, icon: <OrderIcon /> },
  { href: "/inventory", label: t.inventory, icon: <InventoryIcon /> },
  { href: "/customers", label: t.customers, icon: <CustomerIcon /> },
  { href: "/marketplace", label: t.marketplace, icon: <MarketplaceIcon /> },
  { href: "/theme", label: t.theme, icon: <ThemeIcon /> },
  { href: "/settings", label: t.settings, icon: <SettingsIcon /> },
];

export function StoreNav() {
  const pathname = usePathname();
  return (
    <SidebarNav
      heading={t.heading}
      items={items.map((item) => ({
        ...item,
        active: item.href === "/" ? pathname === "/" : pathname.startsWith(item.href),
      }))}
    />
  );
}
