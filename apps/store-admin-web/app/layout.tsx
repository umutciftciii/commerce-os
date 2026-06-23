import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell, Badge, Topbar } from "@commerce-os/ui";
import { StoreNav } from "../components/store-nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "commerce-os · Store Admin",
  description: "Store management panel for merchants running on commerce-os.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppShell
          brand={{ name: "Demo Store", subtitle: "Store Admin" }}
          nav={<StoreNav />}
          topbar={
            <Topbar title="Store dashboard">
              <Badge tone="info">Foundation</Badge>
              <span className="text-sm text-slate-500">owner@demo-store</span>
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
