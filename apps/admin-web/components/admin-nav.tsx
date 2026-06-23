"use client";

import { usePathname } from "next/navigation";
import { SidebarNav } from "@commerce-os/ui";

const items = [
  { href: "/", label: "Dashboard" },
  { href: "/stores", label: "Stores" },
  { href: "/plans", label: "Plans" },
  { href: "/system-health", label: "System Health" },
  { href: "/settings", label: "Settings" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <SidebarNav
      items={items.map((item) => ({
        ...item,
        active: item.href === "/" ? pathname === "/" : pathname.startsWith(item.href),
      }))}
    />
  );
}
