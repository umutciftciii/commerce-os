import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { format, formatDate, type Locale } from "@commerce-os/i18n";
import type { CustomerOrderDetail } from "@commerce-os/api-client";
import type { CustomerRefundVisibilityItem } from "@commerce-os/contracts";
import { getRequestLocale, getStorefrontDict } from "../../../../lib/i18n";
import { formatMinor } from "../../../../lib/money";
import { getCurrentCustomer, getCustomerOrderDetail } from "../../../../lib/server/customer";
import { getMyReviews } from "../../../../lib/server/reviews";
import { listReturns } from "../../../../lib/server/returns";
import { listOrderExperience } from "../../../../lib/server/order-experience";
import {
  canCancelOrder,
  canRequestReturn,
  isReorderable,
  resolveCancelEligibility,
} from "../../../../lib/orders";
import { resolveReturnWindowLabel } from "../../../../lib/returns-summary";
import { resolveOrderReview, resolveOrderExperience } from "../../../../lib/orders-review";
import { OrderStatusBadges } from "../../../../components/account/order-badges";
import { OrderActions } from "../../../../components/account/order-actions";
import { ShipmentTracking } from "../../../../components/account/shipment-tracking";
import { ReturnsDeepLinkFocus } from "../../../../components/account/returns/returns-deep-link-focus";
import { Alert, ButtonLink, Container, Heading, ProductMediaFrame, Subheading } from "../../../../components/ui";

type ReturnsDict = Awaited<ReturnType<typeof getStorefrontDict>>["account"]["returns"];
type CancellationsDict = Awaited<ReturnType<typeof getStorefrontDict>>["account"]["cancellations"];

export const dynamic = "force-dynamic";

type OrdersDict = Awaited<ReturnType<typeof getStorefrontDict>>["account"]["orders"];

/**
 * TODO-079 — Müşteri-facing sipariş detayı (dedicated route). Oturum zorunlu;
 * yoksa /auth/login?next=... Gateway YALNIZ kendi siparişini döner (başka
 * müşteri/yok → null → notFound() → 404). Ödeme yalnız GÜVENLİ alanlarla
 * gösterilir (PAN/CVC/token YOK). Gerçek iade/destek/yorum akışı placeholder.
 */
export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const customer = await getCurrentCustomer();
  const { orderNumber } = await params;
  if (!customer) {
    redirect(`/auth/login?next=/account/orders/${encodeURIComponent(orderNumber)}`);
  }
  const dict = await getStorefrontDict();
  const t = dict.account;
  const locale = await getRequestLocale();
  // TODO-159E hotfix — Detay sayfasında da gerçek yorum aksiyonu için sunucu-otoriter
  // uygunluk + mevcut yorumlar (yeni uç YOK; account/reviews ile aynı veri).
  const [order, reviewData, allReturns, experienceList] = await Promise.all([
    getCustomerOrderDetail(orderNumber),
    getMyReviews(),
    listReturns(),
    listOrderExperience(),
  ]);
  if (!order) {
    notFound();
  }
  const o = t.orders;
  const r = t.returns;
  // TODO-174 (ADR-275/277/278) — self-servis iptal: server-otoriter uygunluk + modal sözlüğü.
  const c = t.cancellations;
  const cancelEligibility = resolveCancelEligibility(order);
  // TODO-169 (blocker #6) — bu siparişe ait iade talepleri (yalnız kendi; server-scoped liste filtreli).
  // TODO-174A — allReturns artık BİRLEŞİK (iade + iptal geri ödemesi); burada yalnız iade TALEPLERİ
  // listelenir (iptal geri ödemesi CANCELLED bloğunda gösterilir → tekrar edilmez).
  const orderReturns = allReturns.filter(
    (rr) => rr.orderNumber === order.orderNumber && rr.source === "RETURN_REQUEST",
  );
  const windowLabel = resolveReturnWindowLabel(order.returnSummary ?? null);
  const reviewState = resolveOrderReview(
    order,
    reviewData?.eligible ?? [],
    reviewData?.reviews ?? [],
  );
  // TODO-174A — iptal edilmiş + teslim-edilmemiş siparişte deneyim değerlendirme CTA durumu.
  const experienceState = resolveOrderExperience(order.orderNumber, experienceList);

  return (
    <Container className="py-12">
      <div className="mx-auto max-w-3xl space-y-6">
        <ButtonLink href="/account?section=orders" variant="link" className="text-sm">
          ← {o.detail.backToList}
        </ButtonLink>

        <header className="space-y-2">
          <Heading as="h1">
            {o.orderNumber}: {order.orderNumber}
          </Heading>
          <p className="text-sm text-ink-muted">
            {formatDate(order.createdAt, locale)} ·{" "}
            {format(o.items, { count: order.itemCount })}
          </p>
          <OrderStatusBadges
            t={o}
            status={order.status}
            paymentStatus={order.paymentStatus}
            fulfillmentStatus={order.fulfillmentStatus}
            shipmentStatus={order.shipment?.status ?? null}
          />
          {/* TODO-169 (blocker #1) — iade penceresi etiketi (teslim-türetilmiş; satın alma tarihi değil). */}
          {windowLabel ? (
            <p
              className={
                windowLabel.kind === "expired"
                  ? "text-xs text-ink-subtle"
                  : windowLabel.kind === "endingSoon"
                    ? "text-xs font-medium text-accent-ink"
                    : "text-xs text-ink-muted"
              }
            >
              {windowLabel.kind === "eligible"
                ? format(o.returnBadge.window.eligible, {
                    date: formatDate(windowLabel.endsAt, locale),
                  })
                : windowLabel.kind === "endingSoon"
                  ? format(o.returnBadge.window.endingSoon, { count: windowLabel.remainingDays })
                  : o.returnBadge.window.expired}
            </p>
          ) : null}
        </header>

        <section className="border border-line p-4">
          <Subheading as="h2" className="mb-3">{o.detail.productsTitle}</Subheading>
          <ul className="space-y-3">
            {order.lines.map((line) => (
              <li key={line.variantId} className="flex items-center gap-3">
                {/* TD-173 — Ortak ürün medya çerçevesi (line-thumbnail). */}
                <ProductMediaFrame
                  variant="line-thumbnail"
                  handle={line.productSlug}
                  title={line.title}
                  imageUrl={line.imageUrl}
                  className="h-12 w-12 shrink-0 rounded-md border border-line"
                />
                <span className="min-w-0 flex-1 text-sm text-ink-muted">
                  <Link href={`/products/${line.productSlug}`} className="hover:underline">
                    {line.title}
                  </Link>
                  {line.variantTitle ? (
                    <span className="text-ink-subtle"> · {line.variantTitle}</span>
                  ) : null}
                  <span className="block text-xs text-ink-subtle">
                    {line.sku} · ×{line.quantity}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-medium text-ink">
                  {formatMinor(line.lineTotalMinor, order.currency)}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <OrderSummary o={o} order={order} />

        <ReturnImpact o={o} order={order} />

        {orderReturns.length > 0 ? (
          <>
            <ReturnsDeepLinkFocus />
            <ReturnsSection o={o} r={r} returns={orderReturns} locale={locale} />
          </>
        ) : null}

        {order.shipment ? (
          <ShipmentTracking shipment={order.shipment} t={o.detail.tracking} locale={locale} />
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ShippingBlock o={o} order={order} />
          <PaymentBlock o={o} order={order} locale={locale} />
        </div>

        <BillingBlock o={o} order={order} />

        {/* TODO-174 — Zaten iptal edilmiş sipariş: iptal provenance + refund durumu (AYRI, otoriter). */}
        {order.status === "CANCELLED" && order.cancellationSummary ? (
          <CancelledBlock c={c} summary={order.cancellationSummary} locale={locale} />
        ) : null}

        <section className="border border-line p-4 space-y-3">
          <OrderActions
            orderNumber={order.orderNumber}
            t={o}
            reorderable={isReorderable(order)}
            canReturn={canRequestReturn(order)}
            canCancel={canCancelOrder(order)}
            cancelSummary={order.cancellationSummary}
            cancelT={c}
            review={reviewState}
            reviewsT={dict.reviews}
            experience={experienceState}
            layout="detail"
          />
          {/* Kargoya verildi → doğrudan iptal edilemez; iade akışına yönlendiren nötr mesaj (CTA yok).
              BLOCKED_DELIVERED: mevcut "İade Talebi Oluştur" akışı kapsar (burada tekrar edilmez). */}
          {cancelEligibility === "BLOCKED_IN_TRANSIT" ? (
            <Alert tone="info">{c.blockedInTransitNote}</Alert>
          ) : null}
        </section>
      </div>
    </Container>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-ink-muted">{label}</span>
      <span className={strong ? "font-semibold text-ink" : "text-ink-muted"}>{value}</span>
    </div>
  );
}

export function OrderSummary({ o, order }: { o: OrdersDict; order: CustomerOrderDetail }) {
  return (
    <section className="border border-line p-4">
      <Subheading as="h2" className="mb-3">{o.detail.summary}</Subheading>
      <div className="space-y-2">
        <Row label={o.detail.subtotal} value={formatMinor(order.subtotalMinor, order.currency)} />
        {order.discountMinor > 0 ? (
          <Row
            label={o.detail.discount}
            value={`- ${formatMinor(order.discountMinor, order.currency)}`}
          />
        ) : null}
        <Row
          label={o.detail.shipping}
          value={
            order.shippingMinor === 0
              ? o.detail.freeShipping
              : formatMinor(order.shippingMinor, order.currency)
          }
        />
        {order.taxMinor > 0 ? (
          <Row label={o.detail.tax} value={formatMinor(order.taxMinor, order.currency)} />
        ) : (
          // Inclusive-VAT (server-authoritative taxMinor=0): yanıltıcı "₺0,00" yerine
          // kullanıcı-dostu not. Client-side KDV tahmini YOK; vergi modeli değişmez.
          <p className="text-xs text-ink-muted">{o.detail.taxIncludedNote}</p>
        )}
        <div className="border-t border-line pt-2">
          <Row label={o.detail.total} value={formatMinor(order.totalMinor, order.currency)} strong />
        </div>
      </div>
    </section>
  );
}

function ShippingBlock({ o, order }: { o: OrdersDict; order: CustomerOrderDetail }) {
  const a = order.shippingAddress;
  return (
    <section className="border border-line p-4">
      <Subheading as="h2" className="mb-2">{o.detail.shippingAddress}</Subheading>
      {a ? (
        <address className="text-sm not-italic leading-relaxed text-ink-muted">
          {a.fullName}
          <br />
          {a.addressLine1}
          {a.addressLine2 ? (
            <>
              <br />
              {a.addressLine2}
            </>
          ) : null}
          <br />
          {[a.district, a.city, a.postalCode].filter(Boolean).join(", ")}
          {a.phone ? (
            <>
              <br />
              {a.phone}
            </>
          ) : null}
        </address>
      ) : (
        <p className="text-sm text-ink-subtle">—</p>
      )}
    </section>
  );
}

function PaymentBlock({
  o,
  order,
  locale,
}: {
  o: OrdersDict;
  order: CustomerOrderDetail;
  locale: Locale;
}) {
  const p = order.payment;
  return (
    <section className="border border-line p-4">
      <Subheading as="h2" className="mb-2">{o.detail.paymentInfo}</Subheading>
      {p ? (
        <div className="space-y-1.5">
          <Row label={o.detail.provider} value={p.provider} />
          {p.cardBrand || p.cardLast4 ? (
            <Row
              label={o.detail.card}
              value={`${p.cardBrand ?? ""} •••• ${p.cardLast4 ?? "----"}`.trim()}
            />
          ) : null}
          <Row
            label={o.detail.installment}
            value={
              p.installmentCount > 1
                ? format(o.detail.installmentCount, { count: p.installmentCount })
                : o.detail.singlePayment
            }
          />
          {p.transactionId ? <Row label={o.detail.transaction} value={p.transactionId} /> : null}
          {p.paidAt ? (
            <Row label={o.detail.paidAt} value={formatDate(p.paidAt, locale)} />
          ) : null}
          {p.threeDsApplied ? (
            <p className="text-xs text-ink-subtle">{o.detail.threeDs}</p>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-ink-subtle">{o.detail.noPayment}</p>
      )}
    </section>
  );
}

/**
 * TODO-169 (blocker #7) — İADE finansal etkisi. Orijinal tutar özetini (OrderSummary) DEĞİŞTİRMEZ;
 * AYRI bir blok olarak "beklenen" etkiyi gösterir. RefundIntent PENDING gerçekleşen iade DEĞİLDİR:
 * "Gerçekleşen iade —" + "Para iadesi bekleniyor / Henüz tahsilattan düşülmedi". Yalnız onaylı iade
 * niyeti (approvedRefundIntentMinor > 0) varsa render edilir.
 */
function ReturnImpact({ o, order }: { o: OrdersDict; order: CustomerOrderDetail }) {
  const s = order.returnSummary;
  if (!s || s.approvedRefundIntentMinor <= 0) return null;
  const ri = o.detail.returnImpact;
  const realized = s.completedRefundMinor > 0;
  const expectedNet = Math.max(0, order.totalMinor - s.approvedRefundIntentMinor);
  return (
    <section className="border border-line p-4">
      <Subheading as="h2" className="mb-3">{ri.title}</Subheading>
      <div className="space-y-2">
        <Row label={ri.approvedIntent} value={formatMinor(s.approvedRefundIntentMinor, order.currency)} />
        <Row
          label={ri.realizedRefund}
          value={realized ? formatMinor(s.completedRefundMinor, order.currency) : ri.notRealized}
        />
        <Row label={ri.currentCollected} value={formatMinor(order.totalMinor, order.currency)} />
        <div className="border-t border-line pt-2">
          <Row
            label={`${ri.expectedNet} (${ri.expectedTag})`}
            value={formatMinor(expectedNet, order.currency)}
            strong
          />
        </div>
        {s.hasPendingFinancialImpact ? (
          <p className="text-xs text-ink-muted">{ri.pendingNote}</p>
        ) : null}
        {!realized ? <p className="text-xs text-ink-subtle">{ri.noRefundYet}</p> : null}
      </div>
    </section>
  );
}

/**
 * TODO-169 (blocker #6) — Sipariş detayında bu siparişe ait iade talepleri (kompakt kartlar).
 * Her kart iade No + durum + çözüm + adet + tarih taşır ve iade takip ekranına linkler.
 */
function ReturnsSection({
  o,
  r,
  returns,
  locale,
}: {
  o: OrdersDict;
  r: ReturnsDict;
  // TODO-174A — birleşik satırdan yalnız RETURN_REQUEST kaynaklılar geçilir (bkz. orderReturns filtresi).
  returns: CustomerRefundVisibilityItem[];
  locale: Locale;
}) {
  return (
    <section
      id="returns"
      aria-labelledby="returns-heading"
      tabIndex={-1}
      className="scroll-mt-24 border border-line p-4 outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2"
    >
      <Subheading
        as="h2"
        id="returns-heading"
        data-returns-heading
        tabIndex={-1}
        className="mb-3 scroll-mt-24 outline-none focus:ring-2 focus:ring-ink focus:ring-offset-2"
      >
        {o.detail.returnsTitle}
      </Subheading>
      <ul className="space-y-3">
        {returns.map((rr) => (
          <li
            key={rr.reference}
            id={`return-${rr.reference}`}
            tabIndex={-1}
            className="flex scroll-mt-24 flex-wrap items-center justify-between gap-3 border border-line p-3 outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">
                {o.detail.returnRef}: {rr.reference}
              </p>
              <p className="text-xs text-ink-muted">
                {formatDate(rr.createdAt, locale)}
                {rr.itemCount !== null ? ` · ${format(r.itemCount, { count: rr.itemCount })}` : ""}
                {rr.resolutionType ? ` · ${r.resolutions[rr.resolutionType]}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {rr.returnStatus ? (
                <span className="inline-flex items-center rounded-full border border-ink-subtle bg-surface-muted px-2.5 py-0.5 text-xs font-medium text-ink">
                  {r.statuses[rr.returnStatus]}
                </span>
              ) : null}
              <Link
                href={`/account/returns/${encodeURIComponent(rr.reference)}`}
                className="text-xs font-medium text-ink underline decoration-line underline-offset-2 hover:decoration-ink"
              >
                {o.detail.viewReturn}
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * TODO-174 (ADR-275/277/278) — İptal edilmiş sipariş bloğu. İptal provenance'i (neden) +
 * refund durumunu AYRI gösterir. Refund durumu MASKELİdir ve yanıltıcı değildir: NONE
 * (ödeme yok) → refund satırı gizli. reasonCode server'dan gelir; etiket i18n'den türetilir.
 */
function CancelledBlock({
  c,
  summary,
  locale,
}: {
  c: CancellationsDict;
  summary: NonNullable<CustomerOrderDetail["cancellationSummary"]>;
  locale: Locale;
}) {
  return (
    <section className="border border-line p-4">
      <Subheading as="h2" className="mb-3">
        {c.cancelled.title}
      </Subheading>
      <div className="space-y-2">
        {summary.reasonCode ? (
          <Row label={c.cancelled.reasonLabel} value={c.reasons[summary.reasonCode]} />
        ) : null}
        {/* TODO-174A — OTHER (ve not girilmiş) durumda müşteri açıklaması AYRI satırda. */}
        {summary.reasonNote ? (
          <Row label={c.cancelled.noteLabel} value={summary.reasonNote} />
        ) : null}
        {summary.cancelledAt ? (
          <Row label={c.cancelled.cancelledAt} value={formatDate(summary.cancelledAt, locale)} />
        ) : null}
        {summary.isPaid && summary.refundStatus && summary.refundStatus !== "NONE" ? (
          <Row
            label={c.cancelled.refundStatusLabel}
            value={c.refundStatusValues[summary.refundStatus]}
          />
        ) : null}
      </div>
    </section>
  );
}

function BillingBlock({ o, order }: { o: OrdersDict; order: CustomerOrderDetail }) {
  const b = order.billing;
  if (!b) return null;
  return (
    <section className="border border-line p-4">
      <Subheading as="h2" className="mb-2">{o.detail.billing}</Subheading>
      <div className="space-y-1.5 text-sm text-ink-muted">
        <p>{b.type === "CORPORATE" ? o.detail.corporate : o.detail.individual}</p>
        {b.companyName ? <p>{b.companyName}</p> : null}
        {b.name ? <p>{b.name}</p> : null}
        {b.taxOffice ? <p>{b.taxOffice}</p> : null}
        {b.taxId ? <p className="text-ink-subtle">{b.taxId}</p> : null}
      </div>
    </section>
  );
}
