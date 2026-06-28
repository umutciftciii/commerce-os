import Link from "next/link";
import { EmptyState } from "@commerce-os/ui";
import { format } from "@commerce-os/i18n";
import type { StorefrontDictionary } from "@commerce-os/i18n";
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
  tab,
  query,
}: {
  t: StorefrontDictionary["account"];
  orders: CustomerOrderSummary[];
  tab: OrdersTab;
  query: string;
}) {
  const o = t.orders;
  const filtered = applyOrderFilters(orders, { tab, query });

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-slate-900">{o.title}</h1>
        <p className="text-sm text-slate-500">{o.subtitle}</p>
      </header>

      <nav className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {ORDERS_TABS.map((value) => {
          const active = value === tab;
          return (
            <Link
              key={value}
              href={tabHref(value, query)}
              className={
                active
                  ? "rounded-full bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
                  : "rounded-full px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
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
        <label className="flex-1 min-w-[200px] text-sm">
          <span className="mb-1 block font-medium text-slate-700">{o.search.label}</span>
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder={o.search.placeholder}
            className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          />
        </label>
        <button
          type="submit"
          className="h-10 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white shadow-card ring-1 ring-inset ring-brand-700/30 hover:bg-brand-700"
        >
          {o.search.submit}
        </button>
      </form>

      {filtered.length === 0 ? (
        <EmptyState title={o.title} description={query ? o.searchEmpty : o.empty} />
      ) : (
        <ul className="space-y-3">
          {filtered.map((order) => (
            <OrderCard key={order.orderNumber} o={o} order={order} />
          ))}
        </ul>
      )}
    </div>
  );
}

function OrderCard({ o, order }: { o: OrdersDict; order: CustomerOrderSummary }) {
  return (
    <li className="rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-slate-900">
            {o.orderNumber}: {order.orderNumber}
          </p>
          <p className="text-xs text-slate-500">
            {new Date(order.createdAt).toLocaleDateString()} ·{" "}
            {format(o.items, { count: order.itemCount })}
          </p>
        </div>
        <p className="text-right text-sm font-semibold text-slate-900">
          {formatMinor(order.totalMinor, order.currency)}
        </p>
      </div>

      <div className="mt-3">
        <OrderStatusBadges
          t={o}
          status={order.status}
          paymentStatus={order.paymentStatus}
          fulfillmentStatus={order.fulfillmentStatus}
        />
      </div>

      <ul className="mt-3 space-y-2">
        {order.lines.map((line) => (
          <li key={line.variantId} className="flex items-center gap-3">
            <span
              aria-hidden
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs font-semibold text-slate-400"
            >
              {line.title.slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0 text-sm text-slate-700">
              {line.title}
              {line.variantTitle ? (
                <span className="text-slate-400"> · {line.variantTitle}</span>
              ) : null}
              <span className="text-slate-400"> ×{line.quantity}</span>
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
