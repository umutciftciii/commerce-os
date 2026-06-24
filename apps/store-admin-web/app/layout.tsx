import type { Metadata } from "next";
import type { ReactNode } from "react";
import { LocaleProvider } from "@commerce-os/ui";
import { getRequestLocale, getStoreAdminDict } from "../lib/i18n";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const store = await getStoreAdminDict();
  return {
    title: store.meta.title,
    description: store.meta.description,
  };
}

/**
 * Kök layout document iskeletini, global stilleri ve aktif dili sağlar. Locale
 * cookie'den çözülür; `LocaleProvider` istemci ağacına (login dahil) taşır.
 * Oturum açmış mağaza kabuğu `app/(app)/layout.tsx` içinde; login kabuk dışıdır.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getRequestLocale();
  return (
    <html lang={locale}>
      <body>
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
