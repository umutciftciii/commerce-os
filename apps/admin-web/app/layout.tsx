import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell, Badge, Topbar } from "@commerce-os/ui";
import { AdminNav } from "../components/admin-nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "commerce-os · Platform Admin",
  description: "Platform administration console for the commerce-os multi-tenant SaaS.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppShell
          brand={{ name: "commerce-os", subtitle: "Platform Admin" }}
          nav={<AdminNav />}
          topbar={
            <Topbar title="Platform console">
              <Badge tone="info">Foundation</Badge>
              <span className="text-sm text-slate-500">superadmin@commerce-os</span>
            </Topbar>
          }
          footer={<span>UI foundation · placeholder data</span>}
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
