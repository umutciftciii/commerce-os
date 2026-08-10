import Link from "next/link";

/**
 * TODO-177 (ADR-289) Faz D — Order-line "Ürün desteği al" CTA'sı (order detayında her satır).
 * Ana giriş noktası; bağlam (order + orderLineId) query ile guided başlangıcına taşınır.
 * Backend orderLineId+storeId+customerId'yi yeniden doğrular (client metadata güvenilmez).
 * Faz 1: yalnız satın alınmış order-line bağlamı (PDP genel destek CTA'sı YOK).
 *
 * BUG-PS-001 follow-up — Sade underline text-link göze çarpmıyordu. Hairline çerçeveli +
 * destek (lifebuoy) ikonlu kompakt bir "chip": bare-underline'dan belirgin ama order-level
 * primary/secondary butonlardan hafif (border-line hairline + kompakt + normal-case), böylece
 * satır başına tekrar etse de aksiyon hiyerarşisini ezmez. Keskin köşeler (rounded-none) +
 * ölçülü hover dolgusu editoryel vitrin diliyle tutarlıdır. `cn` twMerge olmadığından
 * (çakışan utility'ler birleşmez) treatment ButtonLink variant base'i yerine doğrudan kurulur.
 */
export function SupportLineCta({
  orderNumber,
  orderLineId,
  label,
}: {
  orderNumber: string;
  orderLineId: string;
  label: string;
}) {
  const href = `/account/support/new?order=${encodeURIComponent(orderNumber)}&line=${encodeURIComponent(orderLineId)}`;
  return (
    <Link
      href={href}
      data-testid="support-line-cta"
      className="inline-flex items-center gap-1.5 rounded-none border border-line px-2.5 py-1 text-[11px] font-medium text-ink transition-colors duration-200 ease-premium hover:border-ink hover:bg-ink hover:text-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
    >
      <SupportGlyph />
      {label}
    </Link>
  );
}

/** Lifebuoy — evrensel "destek/yardım" glifi; geometrik (halka + göbek + kollar), stroke-tabanlı
 *  (currentColor) editoryel ikon diliyle uyumlu. Yalnız görsel — aria-hidden. */
function SupportGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3.5" />
      <line x1="5.6" y1="5.6" x2="9.5" y2="9.5" />
      <line x1="14.5" y1="14.5" x2="18.4" y2="18.4" />
      <line x1="18.4" y1="5.6" x2="14.5" y2="9.5" />
      <line x1="9.5" y1="14.5" x2="5.6" y2="18.4" />
    </svg>
  );
}
