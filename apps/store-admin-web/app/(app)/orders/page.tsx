"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Alert,
  Badge,
  Button,
  DataTable,
  EmptyState,
  Input,
  Modal,
  PageHeader,
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
import { MetricGrid, MetricTile, SurfaceCard } from "../../components/premium";
import {
  canCancel,
  canPlace,
  FULFILLMENT_STATUS_TONES,
  ORDER_STATUS_TONES,
  PAYMENT_STATUS_TONES,
  type FulfillmentStatus,
  type OrderStatus,
  type PaymentStatus,
} from "./order-shared";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; orders: Order[]; total: number };

// Detay = `/orders/[id]` (modal degil). Liste yalniz hizli aksiyonlari barindirir.
const DETAIL_LINK_CLASS =
  "inline-flex h-8 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900";

export default function OrdersPage() {
  const router = useRouter();
  const locale = useLocale();
  const dict = getDictionary(locale);
  const t = dict.storeAdmin.orders;
  const c = dict.common;
  const statusLabels = t.statusLabels as Record<OrderStatus, string>;
  const paymentLabels = t.paymentLabels as Record<PaymentStatus, string>;
  const fulfillmentLabels = t.fulfillmentLabels as Record<FulfillmentStatus, string>;

  const [state, setState] = useState<LoadState>({ status: "loading" });
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

  // Operasyon ozeti canli listeden hesaplanir (yeni API cagrisi yok).
  const metrics = useMemo(() => {
    let draft = 0;
    let inProgress = 0;
    let cancelled = 0;
    let revenue = 0;
    for (const order of orders) {
      if (order.status === "DRAFT") draft += 1;
      else if (order.status === "CANCELLED") cancelled += 1;
      else {
        inProgress += 1;
        revenue += order.totalAmount;
      }
    }
    const currency = orders[0]?.currency ?? "TRY";
    return { draft, inProgress, cancelled, revenue, currency };
  }, [orders]);

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
            <Link href={`/orders/${order.id}`} className={DETAIL_LINK_CLASS}>
              {t.detailAction}
            </Link>
            {canPlace(order) ? (
              <Button size="sm" disabled={busy} onClick={() => void place(order.id)}>
                {busy && acting?.type === "place" ? t.placing : t.placeAction}
              </Button>
            ) : null}
            {canCancel(order) ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => void cancel(order.id)}
              >
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

      {state.status === "ready" && orders.length > 0 ? (
        <div className="mb-5">
          <MetricGrid columns={5}>
            <MetricTile
              label={t.summary.total}
              value={state.total}
              hint={t.summary.totalHint}
              tone="brand"
            />
            <MetricTile label={t.summary.draft} value={metrics.draft} hint={t.summary.draftHint} />
            <MetricTile
              label={t.summary.inProgress}
              value={metrics.inProgress}
              hint={t.summary.inProgressHint}
              tone="success"
            />
            <MetricTile
              label={t.summary.cancelled}
              value={metrics.cancelled}
              hint={t.summary.cancelledHint}
              tone="danger"
            />
            <MetricTile
              label={t.summary.revenue}
              value={formatMinor(metrics.revenue, metrics.currency)}
              hint={t.summary.revenueHint}
            />
          </MetricGrid>
        </div>
      ) : null}

      <SurfaceCard
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
      </SurfaceCard>

      {creating ? (
        <CreateOrder
          onClose={() => setCreating(false)}
          onCreated={(order) => {
            setCreating(false);
            // Create sonrasi: detay modal degil, dedicated detail route'una yonlendir.
            router.push(`/orders/${order.id}`);
          }}
        />
      ) : null}
    </>
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
            <div
              key={index}
              className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_6rem_auto] sm:items-end"
            >
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
