"use client";

import { usePathname } from "next/navigation";
import { SidebarNav } from "@commerce-os/ui";

const items = [
  { href: "/", label: "Dashboard" },
  { href: "/products", label: "Products" },
  { href: "/orders", label: "Orders" },
  { href: "/inventory", label: "Inventory" },
  { href: "/customers", label: "Customers" },
  { href: "/marketplace", label: "Marketplace" },
  { href: "/theme", label: "Theme" },
  { href: "/settings", label: "Settings" },
];

export function StoreNav() {
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
