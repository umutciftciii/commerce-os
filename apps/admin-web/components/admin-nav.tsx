"use client";

import { usePathname } from "next/navigation";
import { SidebarNav, useLocale } from "@commerce-os/ui";
import { getDictionary } from "@commerce-os/i18n";
import {
  DashboardIcon,
  HealthIcon,
  PlanIcon,
  QuestionSetIcon,
  StoreIcon,
  ThemeIcon,
  ThemeLibraryIcon,
} from "./icons";

export function AdminNav() {
  const pathname = usePathname();
  const t = getDictionary(useLocale()).admin.nav;

  const items = [
    { href: "/", label: t.dashboard, icon: <DashboardIcon /> },
    { href: "/stores", label: t.stores, icon: <StoreIcon /> },
    { href: "/theme-library", label: t.themeLibrary, icon: <ThemeLibraryIcon /> },
    { href: "/themes", label: t.themeManagement, icon: <ThemeIcon /> },
    { href: "/plans", label: t.plans, icon: <PlanIcon /> },
    { href: "/question-sets", label: t.questionSets, icon: <QuestionSetIcon /> },
    { href: "/system-health", label: t.systemHealth, icon: <HealthIcon /> },
    // §8 — İnert "Ayarlar" placeholder'ı (tüm alanlar disabled, gerçek işlev yok) nav'dan
    // KALDIRILDI; /settings route'u dashboard'a yönlenir (aktif feature gibi gösterilmez).
  ];

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
