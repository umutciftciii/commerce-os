import type { StorefrontDictionary } from "@commerce-os/i18n";
import { ButtonLink, Container, Eyebrow, Heading, Text } from "../../ui";

/**
 * TODO-158C (ADR-088) — Editoryel / promosyon sunum blokları (presentational; token-tabanlı).
 *
 * Bunlar YÖNETİLEN home section tipi DEĞİLDİR (ADR-086 polimorfik model destekler ama bu faz
 * yeni section tipi eklemez — bkz. TD-089). Yapılandırılmamış mağaza fallback'inde ve gelecekte
 * managed CampaignBlock/Editorial section'ları için hazır sunum katmanı olarak kullanılır.
 */

/** Güven şeridi: hızlı teslimat / güvenli ödeme / kolay iade (i18n valueProps). */
export function ValueProps({ dict }: { dict: StorefrontDictionary }) {
  const items = dict.home.valueProps;
  if (!items || items.length === 0) return null;
  return (
    <section className="border-y border-line bg-surface-muted py-8">
      <Container>
        <ul className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {items.map((item) => (
            <li key={item.title} className="flex flex-col items-center text-center sm:flex-row sm:items-start sm:gap-3 sm:text-left">
              <span aria-hidden className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-full border border-line-strong text-accent sm:mb-0">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <div>
                <p className="text-sm font-medium text-ink">{item.title}</p>
                <p className="mt-0.5 text-xs text-ink-muted">{item.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

/** Editoryel promosyon bandı: eyebrow + serif başlık + gövde + CTA (i18n editorial). */
export function EditorialBanner({ dict }: { dict: StorefrontDictionary }) {
  const e = dict.home.editorial;
  if (!e) return null;
  return (
    <section className="py-14 sm:py-20 lg:py-24">
      <Container>
        <div className="overflow-hidden rounded-md border border-line bg-surface">
          <div className="grid items-center gap-8 p-8 sm:p-12 lg:grid-cols-2 lg:gap-16 lg:p-16">
            <div className="max-w-md">
              <Eyebrow>{e.eyebrow}</Eyebrow>
              <Heading className="mt-3">{e.title}</Heading>
              <Text className="mt-4">{e.body}</Text>
              <ButtonLink href="/products" variant="secondary" className="mt-7">
                {e.cta}
              </ButtonLink>
            </div>
            <div className="relative hidden aspect-[16/10] overflow-hidden rounded-md bg-surface-muted lg:block">
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="font-serif text-5xl font-normal tracking-tightish text-line-strong">
                  {dict.shell.brand}
                </span>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
