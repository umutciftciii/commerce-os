import Link from "next/link";
import type { StorefrontDictionary } from "@commerce-os/i18n";
import { Container, Eyebrow, Heading, Muted, Text } from "../ui";
import { NewsletterForm } from "./newsletter-form";

/**
 * Ortak vitrin footer'i (TODO-158C yeniden tasarım). Premium bilgi mimarisi:
 *  - Bülten bandı (MOCK).
 *  - Marka + sosyal + 4 bağlantı sütunu (Alışveriş / Yardım / Kurumsal / Yasal).
 *  - Güven + ödeme şeridi (güvenli ödeme + kabul edilen yöntemler).
 *  - Alt bar: telif + platform.
 * Tamamen token-tabanlı. Sosyal ikonlar MOCK'tur (gerçek hesap URL'i yok — store
 * settings entegrasyonu ileri faz, bkz. TECHNICAL_DEBT). Bülten de MOCK.
 */
export function SiteFooter({ t }: { t: StorefrontDictionary }) {
  const s = t.shell;
  const n = t.newsletter;

  return (
    <footer className="mt-24 border-t border-line bg-surface">
      {/* Bülten bandı (MOCK) */}
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
      <Container className="grid grid-cols-2 gap-8 py-14 sm:grid-cols-3 lg:grid-cols-6">
        <div className="col-span-2">
          <p className="font-serif text-lg font-normal tracking-tightish text-ink">{s.brand}</p>
          <Text className="mt-3 max-w-xs">{s.footerTagline}</Text>
          {/* MOCK: Sosyal — gerçek hesap URL'i yok; presentational placeholder (bkz. TECHNICAL_DEBT). */}
          <div className="mt-6">
            <p className="text-[11px] font-medium uppercase tracking-luxe text-ink-subtle">
              {s.footerFollowHeading}
            </p>
            <div className="mt-3 flex items-center gap-2">
              <SocialButton label={s.footerSocialInstagram}>
                <InstagramIcon />
              </SocialButton>
              <SocialButton label={s.footerSocialX}>
                <XIcon />
              </SocialButton>
              <SocialButton label={s.footerSocialYoutube}>
                <YoutubeIcon />
              </SocialButton>
            </div>
          </div>
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
        <FooterColumn heading={s.footerLegalHeading}>
          <FooterStatic>{s.footerLegalPrivacy}</FooterStatic>
          <FooterStatic>{s.footerLegalTerms}</FooterStatic>
          <FooterStatic>{s.footerLegalKvkk}</FooterStatic>
        </FooterColumn>
      </Container>

      {/* Güven + ödeme şeridi */}
      <div className="border-t border-line">
        <Container className="flex flex-col items-center justify-between gap-4 py-6 sm:flex-row">
          <div className="flex items-center gap-2 text-xs text-ink-muted">
            <span aria-hidden className="inline-flex text-ink">
              <LockIcon />
            </span>
            {s.footerPaymentsLabel}
          </div>
          <ul className="flex items-center gap-2" aria-label={s.footerPaymentsLabel}>
            {["Visa", "Mastercard", "Troy"].map((method) => (
              <li
                key={method}
                className="inline-flex h-7 items-center rounded-sm border border-line px-2.5 text-[10px] font-semibold uppercase tracking-wideish text-ink-muted"
              >
                {method}
              </li>
            ))}
          </ul>
        </Container>
      </div>

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

/**
 * MOCK sosyal düğmesi — gerçek hesap URL'i olmadığından gezinme YOK; presentational
 * placeholder (type=button, aria-label). Store settings sosyal alanları geldiğinde
 * `<a href>`'e drop-in yükseltilir (bkz. TECHNICAL_DEBT).
 */
function SocialButton({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-line text-ink-muted transition-colors hover:border-ink hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
    >
      {children}
    </button>
  );
}

function InstagramIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden>
      <rect x="3.5" y="3.5" width="13" height="13" rx="4" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="10" cy="10" r="3.2" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="14" cy="6" r="0.9" fill="currentColor" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M4 4l12 12M16 4L4 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function YoutubeIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden>
      <rect x="2.5" y="5" width="15" height="10" rx="3" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8.5 7.5l4 2.5-4 2.5v-5Z" fill="currentColor" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="3.5" y="7" width="9" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5.5 7V5.5a2.5 2.5 0 0 1 5 0V7" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
