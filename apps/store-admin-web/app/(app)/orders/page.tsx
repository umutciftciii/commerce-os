"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Alert,
  Badge,
  Button,
  DataTable,
  EmptyState,
  Input,
  Modal,
  PageHeader,
  SectionCard,
  Select,
  SkeletonRows,
  useLocale,
  type DataTableColumn,
} from "@commerce-os/ui";
import { format, getDictionary } from "@commerce-os/i18n";
import type { InventoryItem, Order, OrderCreateRequest } from "@commerce-os/api-client";
import { OrderIcon } from "../../../components/icons";
import { storeApi } from "../../../lib/client/api";
import { messageForError } from "../../../lib/client/messages";
import { formatDate, formatMinor } from "../../../lib/client/format";

type Tone = "neutral" | "success" | "warning" | "info" | "danger";
type OrderStatus = Order["status"];
type PaymentStatus = Order["paymentStatus"];
type FulfillmentStatus = Order["fulfillmentStatus"];
type ReservationStatus = Order["reservations"][number]["status"];

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; orders: Order[]; total: number };

const ORDER_STATUS_TONES: Record<OrderStatus, Tone> = {
  DRAFT: "neutral",
  PLACED: "info",
  CONFIRMED: "success",
  CANCELLED: "danger",
  FULFILLED: "success",
};

const PAYMENT_STATUS_TONES: Record<PaymentStatus, Tone> = {
  UNPAID: "warning",
  AUTHORIZED: "info",
  PAID: "success",
  REFUNDED: "neutral",
};

const FULFILLMENT_STATUS_TONES: Record<FulfillmentStatus, Tone> = {
  UNFULFILLED: "neutral",
  PARTIAL: "warning",
  FULFILLED: "success",
  CANCELLED: "danger",
};

const RESERVATION_STATUS_TONES: Record<ReservationStatus, Tone> = {
  ACTIVE: "info",
  RELEASED: "neutral",
  CONSUMED: "success",
};

// Yasam dongusu kurallari (backend nihai otorite; UI yalniz uygun aksiyonu gosterir).
function canPlace(order: Order): boolean {
  return order.status === "DRAFT";
}
function canCancel(order: Order): boolean {
  return order.status === "PLACED" || order.status === "CONFIRMED";
}

export default function OrdersPage() {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const t = dict.storeAdmin.orders;
  const c = dict.common;
  const statusLabels = t.statusLabels as Record<OrderStatus, string>;
  const paymentLabels = t.paymentLabels as Record<PaymentStatus, string>;
  const fulfillmentLabels = t.fulfillmentLabels as Record<FulfillmentStatus, string>;

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // Satir bazli aksiyon yuklemesi (cift tiklama / kilit gostergesi).
  const [acting, setActing] = useState<{ id: string; type: "place" | "cancel" } | null>(null);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const orders = await storeApi.listOrders();
      setState({ status: "ready", orders: orders.data, total: orders.pagination.total });
    } catch (error) {
      setState({ status: "error", message: messageForError(error, locale) });
    }
  }, [locale]);

  useEffect(() => {
    void load();
  }, [load]);

  const orders = state.status === "ready" ? state.orders : [];

  const place = useCallback(
    async (orderId: string) => {
      setActionError(null);
      setActing({ id: orderId, type: "place" });
      try {
        await storeApi.placeOrder(orderId);
        setNotice(t.placedToast);
        await load();
      } catch (error) {
        setActionError(messageForError(error, locale));
      } finally {
        setActing(null);
      }
    },
    [load, locale, t.placedToast],
  );

  const cancel = useCallback(
    async (orderId: string) => {
      setActionError(null);
      setActing({ id: orderId, type: "cancel" });
      try {
        await storeApi.cancelOrder(orderId);
        setNotice(t.cancelledToast);
        await load();
      } catch (error) {
        setActionError(messageForError(error, locale));
      } finally {
        setActing(null);
      }
    },
    [load, locale, t.cancelledToast],
  );

  const columns: DataTableColumn<Order>[] = [
    {
      header: t.table.number,
      cell: (order) => (
        <div>
          <p className="font-mono text-sm font-medium text-slate-900">{order.orderNumber}</p>
          <p className="text-xs text-slate-400">
            {order.placedAt ? formatDate(order.placedAt) : formatDate(order.createdAt)}
          </p>
        </div>
      ),
    },
    {
      header: t.table.customer,
      cell: (order) => <span className="text-slate-600">{order.customerEmail}</span>,
    },
    {
      header: t.table.total,
      cell: (order) => (
        <span className="font-medium text-slate-900">
          {formatMinor(order.totalAmount, order.currency)}
        </span>
      ),
    },
    {
      header: t.table.status,
      cell: (order) => (
        <Badge tone={ORDER_STATUS_TONES[order.status]}>{statusLabels[order.status]}</Badge>
      ),
    },
    {
      header: t.table.payment,
      cell: (order) => (
        <Badge tone={PAYMENT_STATUS_TONES[order.paymentStatus]}>
          {paymentLabels[order.paymentStatus]}
        </Badge>
      ),
    },
    {
      header: t.table.fulfillment,
      cell: (order) => (
        <Badge tone={FULFILLMENT_STATUS_TONES[order.fulfillmentStatus]}>
          {fulfillmentLabels[order.fulfillmentStatus]}
        </Badge>
      ),
    },
    {
      header: t.table.lines,
      cell: (order) => (
        <span className="text-slate-500">
          {format(t.lineCountLabel, { count: order.lines.length })}
        </span>
      ),
    },
    {
      header: t.table.actions,
      align: "right",
      cell: (order) => {
        const busy = acting?.id === order.id;
        return (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelectedId(order.id)}>
              {t.detailAction}
            </Button>
            {canPlace(order) ? (
              <Button size="sm" disabled={busy} onClick={() => void place(order.id)}>
                {busy && acting?.type === "place" ? t.placing : t.placeAction}
              </Button>
            ) : null}
            {canCancel(order) ? (
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => void cancel(order.id)}>
                {busy && acting?.type === "cancel" ? t.cancelling : t.cancelAction}
              </Button>
            ) : null}
          </div>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => void load()}>
              {c.actions.refresh}
            </Button>
            <Button onClick={() => setCreating(true)}>{t.newOrder}</Button>
          </div>
        }
      />

      {notice ? (
        <div className="mb-4">
          <Alert
            tone="success"
            action={
              <button
                type="button"
                className="text-emerald-700 underline"
                onClick={() => setNotice(null)}
              >
                {c.actions.dismiss}
              </button>
            }
          >
            {notice}
          </Alert>
        </div>
      ) : null}

      {actionError ? (
        <div className="mb-4">
          <Alert
            tone="error"
            action={
              <button
                type="button"
                className="text-red-700 underline"
                onClick={() => setActionError(null)}
              >
                {c.actions.dismiss}
              </button>
            }
          >
            {actionError}
          </Alert>
        </div>
      ) : null}

      <SectionCard
        title={t.cardTitle}
        description={
          state.status === "ready" ? format(t.countLabel, { count: state.total }) : t.cardDescription
        }
        icon={<OrderIcon />}
      >
        {state.status === "loading" ? <SkeletonRows rows={4} /> : null}

        {state.status === "error" ? (
          <Alert
            tone="error"
            title={t.loadError}
            action={
              <Button variant="secondary" size="sm" onClick={() => void load()}>
                {c.actions.retry}
              </Button>
            }
          >
            {state.message}
          </Alert>
        ) : null}

        {state.status === "ready" && orders.length === 0 ? (
          <EmptyState
            tag={t.emptyTag}
            title={t.emptyTitle}
            description={t.emptyDescription}
            icon={<OrderIcon />}
            action={
              <Button size="sm" onClick={() => setCreating(true)}>
                {t.emptyAction}
              </Button>
            }
          />
        ) : null}

        {state.status === "ready" && orders.length > 0 ? (
          <DataTable
            columns={columns}
            rows={orders}
            rowKey={(order) => order.id}
            caption={t.cardTitle}
          />
        ) : null}
      </SectionCard>

      {selectedId ? (
        <OrderDetail
          orderId={selectedId}
          onClose={() => setSelectedId(null)}
          onChanged={() => void load()}
        />
      ) : null}

      {creating ? (
        <CreateOrder
          onClose={() => setCreating(false)}
          onCreated={(order) => {
            setCreating(false);
            setNotice(t.createdToast);
            setSelectedId(order.id);
            void load();
          }}
        />
      ) : null}
    </>
  );
}

function MoneyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-700">{value}</span>
    </div>
  );
}

function OrderDetail({
  orderId,
  onClose,
  onChanged,
}: {
  orderId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const t = dict.storeAdmin.orders;
  const c = dict.common;
  const d = t.detail;
  const statusLabels = t.statusLabels as Record<OrderStatus, string>;
  const paymentLabels = t.paymentLabels as Record<PaymentStatus, string>;
  const fulfillmentLabels = t.fulfillmentLabels as Record<FulfillmentStatus, string>;
  const reservationLabels = t.reservationStatusLabels as Record<ReservationStatus, string>;

  const [state, setState] = useState<
    { status: "loading" } | { status: "error"; message: string } | { status: "ready"; order: Order }
  >({ status: "loading" });
  const [acting, setActing] = useState<null | "place" | "cancel">(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      setState({ status: "ready", order: await storeApi.getOrder(orderId) });
    } catch (error) {
      setState({ status: "error", message: messageForError(error, locale) });
    }
  }, [orderId, locale]);

  useEffect(() => {
    void load();
  }, [load]);

  const order = state.status === "ready" ? state.order : null;

  async function runAction(type: "place" | "cancel") {
    setActionError(null);
    setActing(type);
    try {
      const updated =
        type === "place" ? await storeApi.placeOrder(orderId) : await storeApi.cancelOrder(orderId);
      setState({ status: "ready", order: updated });
      onChanged();
    } catch (error) {
      setActionError(messageForError(error, locale));
    } finally {
      setActing(null);
    }
  }

  const title = order ? format(d.title, { number: order.orderNumber }) : d.title;

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      description={d.subtitle}
      closeLabel={d.closeLabel}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={acting !== null}>
            {d.closeLabel}
          </Button>
          {order && canPlace(order) ? (
            <Button disabled={acting !== null} onClick={() => void runAction("place")}>
              {acting === "place" ? t.placing : t.placeAction}
            </Button>
          ) : null}
          {order && canCancel(order) ? (
            <Button
              variant="secondary"
              disabled={acting !== null}
              onClick={() => void runAction("cancel")}
            >
              {acting === "cancel" ? t.cancelling : t.cancelAction}
            </Button>
          ) : null}
        </>
      }
    >
      {state.status === "loading" ? <SkeletonRows rows={4} /> : null}

      {state.status === "error" ? (
        <Alert
          tone="error"
          title={t.loadError}
          action={
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              {c.actions.retry}
            </Button>
          }
        >
          {state.message}
        </Alert>
      ) : null}

      {order ? (
        <div className="space-y-5">
          {actionError ? <Alert tone="error">{actionError}</Alert> : null}

          {order.status === "CANCELLED" ? <Alert tone="info">{d.cancelledNotice}</Alert> : null}
          {order.status === "FULFILLED" ? <Alert tone="info">{d.fulfilledNotice}</Alert> : null}

          <div className="flex flex-wrap gap-2">
            <Badge tone={ORDER_STATUS_TONES[order.status]}>{statusLabels[order.status]}</Badge>
            <Badge tone={PAYMENT_STATUS_TONES[order.paymentStatus]}>
              {paymentLabels[order.paymentStatus]}
            </Badge>
            <Badge tone={FULFILLMENT_STATUS_TONES[order.fulfillmentStatus]}>
              {fulfillmentLabels[order.fulfillmentStatus]}
            </Badge>
          </div>

          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">{d.customerLabel}</dt>
              <dd className="text-slate-700">{order.customerEmail}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">{d.placedAtLabel}</dt>
              <dd className="text-slate-700">
                {order.placedAt ? formatDate(order.placedAt) : d.notPlacedYet}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">{d.createdAtLabel}</dt>
              <dd className="text-slate-700">{formatDate(order.createdAt)}</dd>
            </div>
            {order.cancelledAt ? (
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-400">
                  {d.cancelledAtLabel}
                </dt>
                <dd className="text-slate-700">{formatDate(order.cancelledAt)}</dd>
              </div>
            ) : null}
            {order.cancelReason ? (
              <div className="sm:col-span-2">
                <dt className="text-xs uppercase tracking-wide text-slate-400">
                  {d.cancelReasonLabel}
                </dt>
                <dd className="text-slate-700">{order.cancelReason}</dd>
              </div>
            ) : null}
          </dl>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-900">{d.linesTitle}</h3>
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">{d.lineProduct}</th>
                    <th className="px-3 py-2 text-right font-medium">{d.lineQuantity}</th>
                    <th className="px-3 py-2 text-right font-medium">{d.lineUnitPrice}</th>
                    <th className="px-3 py-2 text-right font-medium">{d.lineTotal}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {order.lines.map((line) => (
                    <tr key={line.id}>
                      <td className="px-3 py-2">
                        <p className="font-medium text-slate-800">{line.title}</p>
                        <p className="text-xs text-slate-400">
                          {line.variantTitle} · <span className="font-mono">{line.sku}</span>
                        </p>
                      </td>
                      <td className="px-3 py-2 text-right text-slate-600">{line.quantity}</td>
                      <td className="px-3 py-2 text-right text-slate-600">
                        {formatMinor(line.unitPriceAmount, line.currency)}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-slate-800">
                        {formatMinor(line.totalAmount, line.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 px-4 py-3">
            <h3 className="mb-1 text-sm font-semibold text-slate-900">{d.summaryTitle}</h3>
            <MoneyRow label={d.subtotal} value={formatMinor(order.subtotalAmount, order.currency)} />
            <MoneyRow label={d.discount} value={formatMinor(order.discountAmount, order.currency)} />
            <MoneyRow label={d.shipping} value={formatMinor(order.shippingAmount, order.currency)} />
            <MoneyRow label={d.tax} value={formatMinor(order.taxAmount, order.currency)} />
            <div className="mt-1 flex items-center justify-between border-t border-slate-100 pt-2 text-sm">
              <span className="font-semibold text-slate-900">{d.total}</span>
              <span className="font-semibold text-slate-900">
                {formatMinor(order.totalAmount, order.currency)}
              </span>
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-900">{d.addressesTitle}</h3>
            {order.addresses.length === 0 ? (
              <p className="text-sm text-slate-400">{d.noAddresses}</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {order.addresses.map((address) => (
                  <div key={address.id} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <p className="text-xs uppercase tracking-wide text-slate-400">
                      {address.type === "SHIPPING" ? d.shippingAddress : d.billingAddress}
                    </p>
                    <p className="font-medium text-slate-700">{address.fullName}</p>
                    <p className="text-slate-500">
                      {address.addressLine1}
                      {address.addressLine2 ? `, ${address.addressLine2}` : ""}
                    </p>
                    <p className="text-slate-500">
                      {address.district ? `${address.district}, ` : ""}
                      {address.city} {address.postalCode ?? ""} · {address.countryCode}
                    </p>
                    {address.phone ? <p className="text-slate-500">{address.phone}</p> : null}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-900">{d.reservationsTitle}</h3>
            {order.reservations.length === 0 ? (
              <p className="text-sm text-slate-400">{d.noReservations}</p>
            ) : (
              <ul className="space-y-1">
                {order.reservations.map((reservation) => (
                  <li key={reservation.id} className="flex items-center gap-2 text-sm text-slate-600">
                    <Badge tone={RESERVATION_STATUS_TONES[reservation.status]}>
                      {reservationLabels[reservation.status]}
                    </Badge>
                    <span>
                      {format(d.reservationLine, {
                        quantity: reservation.quantity,
                        status: reservationLabels[reservation.status],
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-900">{d.eventsTitle}</h3>
            {order.events.length === 0 ? (
              <p className="text-sm text-slate-400">{d.noEvents}</p>
            ) : (
              <ul className="space-y-2">
                {order.events.map((event) => (
                  <li key={event.id} className="text-sm">
                    <span className="font-mono text-xs text-slate-500">{event.type}</span>
                    {event.message ? <span className="text-slate-600"> — {event.message}</span> : null}
                    <span className="ml-1 text-xs text-slate-400">{formatDate(event.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}
    </Modal>
  );
}

type DraftLine = { variantId: string; quantity: string };

function CreateOrder({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (order: Order) => void;
}) {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const t = dict.storeAdmin.orders;
  const c = dict.common;
  const f = t.form;

  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(true);
  const [customerEmail, setCustomerEmail] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([{ variantId: "", quantity: "1" }]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result = await storeApi.listInventory();
        if (active) setInventory(result.data);
      } catch (caught) {
        if (active) setError(messageForError(caught, locale));
      } finally {
        if (active) setLoadingInventory(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [locale]);

  const variantOptions = useMemo(
    () => inventory.map((item) => ({ value: item.variantId, label: `${item.sku} — ${item.title}` })),
    [inventory],
  );

  const hasVariants = variantOptions.length > 0;

  function updateLine(index: number, patch: Partial<DraftLine>) {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }
  function addLine() {
    setLines((current) => [...current, { variantId: "", quantity: "1" }]);
  }
  function removeLine(index: number) {
    setLines((current) => (current.length === 1 ? current : current.filter((_, i) => i !== index)));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const email = customerEmail.trim();
    if (email.length === 0 || !email.includes("@")) {
      setError(f.requiredEmail);
      return;
    }
    if (lines.length === 0) {
      setError(f.requiredLines);
      return;
    }
    if (lines.some((line) => line.variantId === "")) {
      setError(f.requiredVariant);
      return;
    }
    const parsedLines = lines.map((line) => ({
      variantId: line.variantId,
      quantity: Number(line.quantity),
    }));
    if (parsedLines.some((line) => !Number.isInteger(line.quantity) || line.quantity < 1)) {
      setError(f.requiredQuantity);
      return;
    }

    const payload: OrderCreateRequest = {
      customerEmail: email,
      currency: "TRY",
      lines: parsedLines,
      addresses: [],
    };

    setSaving(true);
    try {
      const order = await storeApi.createOrder(payload);
      onCreated(order);
    } catch (caught) {
      setError(messageForError(caught, locale));
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={f.title}
      description={f.subtitle}
      closeLabel={c.actions.cancel}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {c.actions.cancel}
          </Button>
          <Button type="submit" form="order-form" disabled={saving || !hasVariants}>
            {saving ? f.submitting : f.submit}
          </Button>
        </>
      }
    >
      <form id="order-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {error ? <Alert tone="error">{error}</Alert> : null}

        {loadingInventory ? <SkeletonRows rows={2} /> : null}

        {!loadingInventory && !hasVariants ? <Alert tone="info">{f.noVariants}</Alert> : null}

        <Input
          id="order-customer-email"
          type="email"
          label={f.customerEmailLabel}
          placeholder={f.customerEmailPlaceholder}
          value={customerEmail}
          onChange={(event) => setCustomerEmail(event.target.value)}
          disabled={saving}
          required
        />

        <div className="space-y-3 border-t border-slate-100 pt-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">{f.linesTitle}</h3>
            <p className="mt-0.5 text-xs text-slate-400">{f.linesHint}</p>
          </div>

          {lines.map((line, index) => (
            <div key={index} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_6rem_auto] sm:items-end">
              <Select
                id={`order-line-variant-${index}`}
                label={f.variantLabel}
                value={line.variantId}
                onChange={(event) => updateLine(index, { variantId: event.target.value })}
                disabled={saving || !hasVariants}
                options={[{ value: "", label: f.variantPlaceholder }, ...variantOptions]}
              />
              <Input
                id={`order-line-quantity-${index}`}
                type="number"
                min={1}
                label={f.quantityLabel}
                value={line.quantity}
                onChange={(event) => updateLine(index, { quantity: event.target.value })}
                disabled={saving || !hasVariants}
              />
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => removeLine(index)}
                disabled={saving || lines.length === 1}
              >
                {f.removeLine}
              </Button>
            </div>
          ))}

          <Button
            variant="secondary"
            size="sm"
            type="button"
            onClick={addLine}
            disabled={saving || !hasVariants}
          >
            {f.addLine}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
