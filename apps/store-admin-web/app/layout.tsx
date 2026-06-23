import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell, Badge, Topbar, UserChip } from "@commerce-os/ui";
import { defaultLocale } from "@commerce-os/i18n";
import { StoreNav } from "../components/store-nav";
import { getCommonDict, getStoreAdminDict } from "../lib/i18n";
import "./globals.css";

const store = getStoreAdminDict();
const common = getCommonDict();

export const metadata: Metadata = {
  title: store.meta.title,
  description: store.meta.description,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={defaultLocale}>
      <body>
        <AppShell
          brand={{ name: store.shell.brandName, subtitle: store.shell.brandSubtitle }}
          nav={<StoreNav />}
          topbar={
            <Topbar title={store.shell.topbarTitle}>
              <Badge tone="info">{common.badges.foundation}</Badge>
              <UserChip name={store.shell.userName} role={store.shell.userRole} />
            </Topbar>
          }
          footer={<span>{common.footer}</span>}
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
