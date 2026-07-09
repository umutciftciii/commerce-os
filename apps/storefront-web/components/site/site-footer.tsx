import Link from "next/link";
import type { StorefrontDictionary } from "@commerce-os/i18n";
import { Container, Eyebrow, Heading, Muted, Text } from "../ui";
import { NewsletterForm } from "./newsletter-form";

/**
 * Ortak vitrin footer'i (ADIM 1). Ust: bülten bandi (MOCK — bkz. todo.md). Alt:
 * disiplinli sütun grid'i + telif. Hairline ayraclar, sade tipografi.
 */
export function SiteFooter({ t }: { t: StorefrontDictionary }) {
  const s = t.shell;
  const n = t.newsletter;

  return (
    <footer className="mt-24 border-t border-line bg-surface">
      {/* Bülten bandi (MOCK) */}
      <div className="border-b border-line">
        <Container className="grid gap-8 py-14 lg:grid-cols-2 lg:items-center lg:gap-16">
          <div className="space-y-3">
            <Eyebrow>{n.eyebrow}</Eyebrow>
            <Heading as="p" className="max-w-md">
              {n.title}
            </Heading>
            <Text className="max-w-md">{n.description}</Text>
          </div>
          <div className="space-y-3 lg:justify-self-end">
            <NewsletterForm t={n} />
            <Muted className="max-w-md">{n.disclaimer}</Muted>
          </div>
        </Container>
      </div>

      {/* Sütunlar */}
      <Container className="grid grid-cols-2 gap-8 py-14 sm:grid-cols-4">
        <div className="col-span-2 sm:col-span-1">
          <p className="font-serif text-lg font-normal tracking-tightish text-ink">{s.brand}</p>
          <Text className="mt-3 max-w-xs">{s.footerTagline}</Text>
        </div>
        <FooterColumn heading={s.footerShopHeading}>
          <FooterLink href="/products">{s.footerAllProducts}</FooterLink>
          <FooterLink href="/cart">{s.footerCart}</FooterLink>
        </FooterColumn>
        <FooterColumn heading={s.footerHelpHeading}>
          <FooterStatic>{s.footerHelpShipping}</FooterStatic>
          <FooterStatic>{s.footerHelpReturns}</FooterStatic>
        </FooterColumn>
        <FooterColumn heading={s.footerCompanyHeading}>
          <FooterStatic>{s.footerCompanyAbout}</FooterStatic>
          <FooterStatic>{s.footerCompanyContact}</FooterStatic>
        </FooterColumn>
      </Container>

      {/* Alt bar */}
      <div className="border-t border-line">
        <Container className="flex flex-col gap-1 py-6 text-xs text-ink-subtle sm:flex-row sm:items-center sm:justify-between">
          <span>{s.footerCopyright}</span>
          <span>{s.footerPoweredBy}</span>
        </Container>
      </div>
    </footer>
  );
}

function FooterColumn({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-luxe text-ink-subtle">{heading}</p>
      <ul className="mt-4 space-y-2.5">{children}</ul>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="text-sm text-ink-muted transition-colors hover:text-ink">
        {children}
      </Link>
    </li>
  );
}

function FooterStatic({ children }: { children: React.ReactNode }) {
  return <li className="text-sm text-ink-muted">{children}</li>;
}
