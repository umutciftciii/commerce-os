import type { StorefrontDictionary } from "@commerce-os/i18n";
import { ButtonLink, Container, Eyebrow, Heading, Text } from "../../ui";

/**
 * TODO-158C (ADR-088) — Editoryel / promosyon sunum blokları (presentational; token-tabanlı).
 *
 * Bunlar YÖNETİLEN home section tipi DEĞİLDİR (ADR-086 polimorfik model destekler ama bu faz
 * yeni section tipi eklemez — bkz. TD-089). Yapılandırılmamış mağaza fallback'inde ve gelecekte
 * managed CampaignBlock/Editorial section'ları için hazır sunum katmanı olarak kullanılır.
 */

/**
 * Güven şeridi ("Storefront - Home" tasarımı): teslimat / iade / ödeme / değişim.
 * 4 kolon (mobilde 2); her öğe kendi ikonuyla (i18n sırası index'e karşılık gelir —
 * bkz. valueProps yorumu). İkon aksan (accent) tonunda; site trust-strip dili.
 */
export function ValueProps({ dict }: { dict: StorefrontDictionary }) {
  const items = dict.home.valueProps;
  if (!items || items.length === 0) return null;
  return (
    <section className="border-y border-line bg-surface-muted py-8">
      <Container>
        <ul className="grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4">
          {items.map((item, index) => (
            <li key={item.title} className="flex items-center gap-3">
              <span aria-hidden className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-accent">
                <ValuePropIcon index={index} />
              </span>
              <div className="min-w-0">
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

/**
 * Güven şeridi ikonları — valueProps sırasına göre (0 teslimat · 1 iade · 2 ödeme · 3 değişim).
 * Tanımlı index dışında nötr onay ikonuna düşer (i18n listesi genişlerse kırılmaz).
 */
function ValuePropIcon({ index }: { index: number }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (index) {
    case 0: // Hızlı teslimat — kamyon
      return (
        <svg {...common}>
          <path d="M3 6.5h11v9H3zM14 9.5h4l3 3v3h-7z" />
          <circle cx="7" cy="17.5" r="1.6" />
          <circle cx="17.5" cy="17.5" r="1.6" />
        </svg>
      );
    case 2: // Güvenli ödeme — kart
      return (
        <svg {...common}>
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <path d="M3 10h18" />
        </svg>
      );
    case 3: // Kolay değişim — yenile
      return (
        <svg {...common}>
          <path d="M20 12a8 8 0 1 1-2.34-5.66" />
          <path d="M20 4v5h-5" />
        </svg>
      );
    default: // İade / diğer — onay
      return (
        <svg {...common}>
          <path d="M4 12l5 5L20 6" />
        </svg>
      );
  }
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
