import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Container } from "@commerce-os/ui";
import "./globals.css";

export const metadata: Metadata = {
  title: "Demo Store · commerce-os",
  description: "Demo storefront running on the commerce-os platform.",
};

/**
 * Theme-ready public shell.
 *
 * `data-theme` is a placeholder hook for per-store theming. Multi-tenant store
 * resolution (e.g. demo.localhost / custom domain / slug -> store) is NOT
 * implemented yet; this app currently renders a single demo store.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="default">
      <body>
        <div className="flex min-h-screen flex-col">
          <header className="border-b border-slate-200">
            <Container className="flex h-16 items-center justify-between">
              <Link href="/" className="text-lg font-semibold tracking-tight text-slate-900">
                Demo Store
              </Link>
              <nav className="flex items-center gap-6 text-sm text-slate-600" aria-label="Primary">
                <Link href="/products" className="hover:text-slate-900">
                  Products
                </Link>
                <Link href="/cart" className="hover:text-slate-900">
                  Cart
                </Link>
              </nav>
            </Container>
          </header>

          <main className="flex-1">{children}</main>

          <footer className="border-t border-slate-200 py-8">
            <Container className="text-sm text-slate-400">
              Powered by commerce-os · storefront foundation
            </Container>
          </footer>
        </div>
      </body>
    </html>
  );
}
