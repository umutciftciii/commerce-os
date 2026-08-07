import Link from "next/link";
import { format, formatDate } from "@commerce-os/i18n";
import type { Locale, StorefrontDictionary } from "@commerce-os/i18n";
import type {
  CustomerOrderSummary,
  CustomerReview,
  ReviewEligibleOrderLine,
} from "@commerce-os/api-client";
import { formatMinor } from "../../../lib/money";
import {
  ORDERS_TABS,
  applyOrderFilters,
  canCancelOrder,
  canRequestReturn,
  isReorderable,
  type OrdersTab,
} from "../../../lib/orders";
import { resolveOrderReview } from "../../../lib/orders-review";
import {
  resolveReturnWindowLabel,
  resolveReturnActivityLabel,
  resolveReturnCtaHref,
} from "../../../lib/returns-summary";
import { OrderStatusBadges } from "../order-badges";
import { OrderActions } from "../order-actions";
import { Button, EmptyState, Field, Heading, Input, ProductMediaFrame, Text } from "../../ui";

type OrdersDict = StorefrontDictionary["account"]["orders"];

const TAB_LABEL: Record<OrdersTab, (t: OrdersDict) => string> = {
  all: (t) => t.tabs.all,
  "buy-again": (t) => t.tabs.buyAgain,
  "not-shipped": (t) => t.tabs.notShipped,
};

function tabHref(tab: OrdersTab, query: string): string {
  const params = new URLSearchParams({ section: "orders", tab });
  if (query) params.set("q", query);
  return `/account?${params.toString()}`;
}

/**
 * TODO-079 — Hesabım > Siparişlerim. Üst sekmeler (Siparişler / Tekrar Satın Al /
 * Henüz Kargoya Verilmedi) + tüm siparişlerde arama, hepsi URL query ile korunur
 * (?section=orders&tab=…&q=…). Filtre/arama saf fonksiyonlarla yapılır; veri
 * gateway'de zaten yalnız kendi siparişleri olarak döner.
 */
export function OrdersSection({
  t,
  orders,
  locale,
  tab,
  query,
  reviewsT,
  eligible = [],
  reviews = [],
}: {
  t: StorefrontDictionary["account"];
  orders: CustomerOrderSummary[];
  locale: Locale;
  tab: OrdersTab;
  query: string;
  reviewsT: StorefrontDictionary["reviews"];
  // TODO-159E hotfix — Sunucu-otoriter yorum uygunluğu (eligible) + mevcut yorumlar.
  eligible?: ReviewEligibleOrderLine[];
  reviews?: CustomerReview[];
}) {
  const o = t.orders;
  const filtered = applyOrderFilters(orders, { tab, query });

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Heading as="h1">{o.title}</Heading>
        <Text>{o.subtitle}</Text>
      </header>

      <nav className="flex flex-wrap gap-2 border-b border-line pb-3">
        {ORDERS_TABS.map((value) => {
          const active = value === tab;
          return (
            <Link
              key={value}
              href={tabHref(value, query)}
              className={
                active
                  ? "rounded-none bg-ink px-3 py-1.5 text-sm font-medium text-surface"
                  : "rounded-none px-3 py-1.5 text-sm font-medium text-ink-muted hover:bg-surface-muted"
              }
            >
              {TAB_LABEL[value](o)}
            </Link>
          );
        })}
      </nav>

      <form action="/account" method="get" className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="section" value="orders" />
        <input type="hidden" name="tab" value={tab} />
        <Field label={o.search.label} htmlFor="orders-q" className="flex-1 min-w-[200px]">
          <Input
            id="orders-q"
            type="search"
            name="q"
            defaultValue={query}
            placeholder={o.search.placeholder}
          />
        </Field>
        <Button type="submit" variant="primary">
          {o.search.submit}
        </Button>
      </form>

      {filtered.length === 0 ? (
        <EmptyState title={o.title} description={query ? o.searchEmpty : o.empty} />
      ) : (
        <ul className="space-y-3">
          {filtered.map((order) => (
            <OrderCard
              key={order.orderNumber}
              o={o}
              cancellationsT={t.cancellations}
              order={order}
              locale={locale}
              reviewsT={reviewsT}
              eligible={eligible}
              reviews={reviews}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function OrderCard({
  o,
  cancellationsT,
  order,
  locale,
  reviewsT,
  eligible,
  reviews,
}: {
  o: OrdersDict;
  cancellationsT: StorefrontDictionary["account"]["cancellations"];
  order: CustomerOrderSummary;
  locale: Locale;
  reviewsT: StorefrontDictionary["reviews"];
  eligible: ReviewEligibleOrderLine[];
  reviews: CustomerReview[];
}) {
  return (
    <li className="border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-ink">
            {o.orderNumber}: {order.orderNumber}
          </p>
          <p className="text-xs text-ink-muted">
            {formatDate(order.createdAt, locale)} ·{" "}
            {format(o.items, { count: order.itemCount })}
          </p>
        </div>
        <p className="text-right text-sm font-semibold text-ink">
          {formatMinor(order.totalMinor, order.currency)}
        </p>
      </div>

      <div className="mt-3">
        <OrderStatusBadges
          t={o}
          status={order.status}
          paymentStatus={order.paymentStatus}
          fulfillmentStatus={order.fulfillmentStatus}
          shipmentStatus={order.shipmentStatus}
        />
      </div>

      <ReturnSummaryBadge o={o} order={order} locale={locale} />

      <ul className="mt-3 space-y-2">
        {order.lines.map((line) => (
          <li key={line.variantId} className="flex items-center gap-3">
            {/* TD-173 — Ortak ürün medya çerçevesi (line-thumbnail). */}
            <ProductMediaFrame
              variant="line-thumbnail"
              handle={line.productSlug}
              title={line.title}
              imageUrl={line.imageUrl}
              className="h-10 w-10 shrink-0 rounded-md border border-line"
            />
            <span className="min-w-0 text-sm text-ink-muted">
              {line.title}
              {line.variantTitle ? (
                <span className="text-ink-subtle"> · {line.variantTitle}</span>
              ) : null}
              <span className="text-ink-subtle"> ×{line.quantity}</span>
            </span>
          </li>
        ))}
      </ul>

      <OrderActions
        orderNumber={order.orderNumber}
        t={o}
        reorderable={isReorderable(order)}
        canReturn={canRequestReturn(order)}
        canCancel={canCancelOrder(order)}
        cancelSummary={order.cancellationSummary}
        cancelT={cancellationsT}
        review={resolveOrderReview(order, eligible, reviews)}
        reviewsT={reviewsT}
      />
    </li>
  );
}

/**
 * TODO-169 (blocker #1/#5) — Sipariş kartında İADE özeti: (1) iade penceresi etiketi (teslim-türetilmiş),
 * (2) aktif iade durumu rozeti + "İade durumunu görüntüle" linki. Teslimat rozetini DEĞİŞTİRMEZ (ayrı
 * satır). Tüm türetme server `returnSummary` projeksiyonundan; metin i18n'den (format).
 */
function ReturnSummaryBadge({
  o,
  order,
  locale,
}: {
  o: OrdersDict;
  order: CustomerOrderSummary;
  locale: Locale;
}) {
  const summary = order.returnSummary ?? null;
  const window = resolveReturnWindowLabel(summary);
  const activity = resolveReturnActivityLabel(summary);
  if (!window && !activity) return null;
  const rb = o.returnBadge;

  const windowText =
    window?.kind === "eligible"
      ? format(rb.window.eligible, { date: formatDate(window.endsAt, locale) })
      : window?.kind === "endingSoon"
        ? format(rb.window.endingSoon, { count: window.remainingDays })
        : window?.kind === "expired"
          ? rb.window.expired
          : null;

  return (
    <div className="mt-2 space-y-1">
      {windowText ? (
        <p
          className={
            window?.kind === "expired"
              ? "text-xs text-ink-subtle"
              : window?.kind === "endingSoon"
                ? "text-xs font-medium text-accent-ink"
                : "text-xs text-ink-muted"
          }
        >
          {windowText}
        </p>
      ) : null}
      {activity ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-ink-subtle bg-surface-muted px-2.5 py-0.5 text-xs font-medium text-ink">
            {format(rb.status[activity.status], { count: activity.count })}
          </span>
          <Link
            href={resolveReturnCtaHref(order.orderNumber, summary)}
            className="text-xs font-medium text-ink underline decoration-line underline-offset-2 hover:decoration-ink"
          >
            {rb.viewStatus}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
