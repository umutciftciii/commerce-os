import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell, Badge, Topbar, UserChip } from "@commerce-os/ui";
import { defaultLocale } from "@commerce-os/i18n";
import { AdminNav } from "../components/admin-nav";
import { getAdminDict, getCommonDict } from "../lib/i18n";
import "./globals.css";

const admin = getAdminDict();
const common = getCommonDict();

export const metadata: Metadata = {
  title: admin.meta.title,
  description: admin.meta.description,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={defaultLocale}>
      <body>
        <AppShell
          brand={{ name: admin.shell.brandName, subtitle: admin.shell.brandSubtitle }}
          nav={<AdminNav />}
          topbar={
            <Topbar title={admin.shell.topbarTitle}>
              <Badge tone="info">{common.badges.foundation}</Badge>
              <UserChip name={admin.shell.userName} role={admin.shell.userRole} />
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
