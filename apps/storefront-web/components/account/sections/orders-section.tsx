import Link from "next/link";
import { format, formatDate } from "@commerce-os/i18n";
import type { Locale, StorefrontDictionary } from "@commerce-os/i18n";
import type { CustomerOrderSummary } from "@commerce-os/api-client";
import { formatMinor } from "../../../lib/money";
import {
  ORDERS_TABS,
  applyOrderFilters,
  canWriteReview,
  isReorderable,
  returnEligibility,
  type OrdersTab,
} from "../../../lib/orders";
import { OrderStatusBadges } from "../order-badges";
import { OrderActions } from "../order-actions";
import { Button, EmptyState, Field, Heading, Input, ProductMedia, Text } from "../../ui";

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
}: {
  t: StorefrontDictionary["account"];
  orders: CustomerOrderSummary[];
  locale: Locale;
  tab: OrdersTab;
  query: string;
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
            <OrderCard key={order.orderNumber} o={o} order={order} locale={locale} />
          ))}
        </ul>
      )}
    </div>
  );
}

function OrderCard({
  o,
  order,
  locale,
}: {
  o: OrdersDict;
  order: CustomerOrderSummary;
  locale: Locale;
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

      <ul className="mt-3 space-y-2">
        {order.lines.map((line) => (
          <li key={line.variantId} className="flex items-center gap-3">
            {/* Dilim 6b — Ürün kapak thumbnail'i (drop-in ProductMedia; imageUrl
                yoksa deterministik yer tutucu). Dilim 6a deseni: sabit boyutlu
                wrapper + overflow-hidden, ProductMedia h-full w-full ile doldurur. */}
            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md border border-line bg-surface-muted">
              <ProductMedia handle={line.productSlug} title={line.title} imageUrl={line.imageUrl} />
            </div>
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
        returnState={returnEligibility(order)}
        canReview={canWriteReview(order)}
      />
    </li>
  );
}
