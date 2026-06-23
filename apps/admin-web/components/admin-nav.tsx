"use client";

import { usePathname } from "next/navigation";
import { SidebarNav } from "@commerce-os/ui";
import { getDictionary } from "@commerce-os/i18n";
import { DashboardIcon, HealthIcon, PlanIcon, SettingsIcon, StoreIcon } from "./icons";

const t = getDictionary().admin.nav;

const items = [
  { href: "/", label: t.dashboard, icon: <DashboardIcon /> },
  { href: "/stores", label: t.stores, icon: <StoreIcon /> },
  { href: "/plans", label: t.plans, icon: <PlanIcon /> },
  { href: "/system-health", label: t.systemHealth, icon: <HealthIcon /> },
  { href: "/settings", label: t.settings, icon: <SettingsIcon /> },
];

export function AdminNav() {
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
