import type { Metadata } from "next";
import type { ReactNode } from "react";
import { defaultLocale } from "@commerce-os/i18n";
import { getAdminDict } from "../lib/i18n";
import "./globals.css";

const admin = getAdminDict();

export const metadata: Metadata = {
  title: admin.meta.title,
  description: admin.meta.description,
};

/**
 * Kök layout yalnızca document iskeletini ve global stilleri sağlar. Oturum açmış
 * yönetim kabuğu `app/(app)/layout.tsx` içinde; login ekranı kabuk dışıdır.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={defaultLocale}>
      <body>{children}</body>
    </html>
  );
}
