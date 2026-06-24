import type { Metadata } from "next";
import type { ReactNode } from "react";
import { defaultLocale } from "@commerce-os/i18n";
import { getStoreAdminDict } from "../lib/i18n";
import "./globals.css";

const store = getStoreAdminDict();

export const metadata: Metadata = {
  title: store.meta.title,
  description: store.meta.description,
};

/**
 * Kök layout yalnızca document iskeletini ve global stilleri sağlar. Oturum açmış
 * mağaza kabuğu `app/(app)/layout.tsx` içinde; login ekranı kabuk dışıdır.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={defaultLocale}>
      <body>{children}</body>
    </html>
  );
}
