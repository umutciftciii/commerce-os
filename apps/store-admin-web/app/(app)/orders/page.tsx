"use client";

import { Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Alert,
  Badge,
  Button,
  Input,
  Modal,
  PageHeader,
  Select,
  SkeletonRows,
  useLocale,
} from "../../../components/ui";
import {
  DataGrid,
  DataGridPagination,
  type DataGridColumn,
} from "../../../components/data-grid";
import { format, getDictionary } from "@commerce-os/i18n";
import type {
  AdminListPagination,
  InventoryItem,
  Order,
  OrderCreateRequest,
  OrderFulfillmentDisplay,
  OrderListQuery,
} from "@commerce-os/api-client";
import { ADMIN_LIST_PAGE_SIZE_OPTIONS } from "@commerce-os/api-client";
import { getOrderFulfillmentDisplay } from "@commerce-os/api-client";
import { OrderIcon } from "../../../components/icons";
import { orderListQueryString, storeApi } from "../../../lib/client/api";
import { messageForError } from "../../../lib/client/messages";
import { formatDate, formatMinor } from "../../../lib/client/format";
import { MetricGrid, MetricTile, SurfaceCard } from "../../components/premium";
import {
  canCancel,
  canPlace,
  FULFILLMENT_DISPLAY_TONES,
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
  | { status: "ready"; orders: Order[]; pagination: AdminListPagination };

// Detay = `/orders/[id]` (modal degil). Liste yalniz hizli aksiyonlari barindirir.
const DETAIL_LINK_CLASS =
  "inline-flex h-8 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white/90";

// Filtre değer kümeleri tek kaynaktan (ton sözlükleri) türetilir; enum'la senkron kalır.
const ORDER_STATUS_VALUES = Object.keys(ORDER_STATUS_TONES) as OrderStatus[];
const PAYMENT_STATUS_VALUES = Object.keys(PAYMENT_STATUS_TONES) as PaymentStatus[];
const FULFILLMENT_STATUS_VALUES = Object.keys(FULFILLMENT_STATUS_TONES) as FulfillmentStatus[];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// URL'den okunan ham filtre formu (controlled input state'i). Boş string = filtre yok.
type OrderFilters = {
  search: string;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  dateFrom: string;
  dateTo: string;
};

/**
 * TODO-159A (ADR-089) — Sayfalama + sıralama URL durumu. Sipariş ekranının zengin
 * filtre paneli (tarih aralığı + üç durum) KORUNUR; ortaklaştırılan kısım sunucu
 * sözleşmesi, sayfalama çubuğu ve sıralama allowlist'idir.
 */
type OrderView = { page: number; pageSize: number; sortBy: string; sortOrder: "asc" | "desc" };

const ORDER_SORT_VALUES = ["createdAt", "placedAt", "total"];
const DEFAULT_ORDER_VIEW: OrderView = {
  page: 1,
  pageSize: 25,
  sortBy: "createdAt",
  sortOrder: "desc",
};

function readView(params: { get(name: string): string | null }): OrderView {
  const rawPageSize = Number.parseInt(params.get("pageSize") ?? "", 10);
  const pageSize = (ADMIN_LIST_PAGE_SIZE_OPTIONS as readonly number[]).includes(rawPageSize)
    ? rawPageSize
    : DEFAULT_ORDER_VIEW.pageSize;
  const rawPage = Number.parseInt(params.get("page") ?? "", 10);
  const sortBy = params.get("sortBy");
  const sortOrder = params.get("sortOrder");
  return {
    page: Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1,
    pageSize,
    sortBy: sortBy && ORDER_SORT_VALUES.includes(sortBy) ? sortBy : DEFAULT_ORDER_VIEW.sortBy,
    sortOrder: sortOrder === "asc" ? "asc" : "desc",
  };
}

const EMPTY_FILTERS: OrderFilters = {
  search: "",
  status: "",
  paymentStatus: "",
  fulfillmentStatus: "",
  dateFrom: "",
  dateTo: "",
};

function readFilters(params: { get(name: string): string | null }): OrderFilters {
  return {
    search: params.get("search")?.trim() ?? "",
    status: params.get("status") ?? "",
    paymentStatus: params.get("paymentStatus") ?? "",
    fulfillmentStatus: params.get("fulfillmentStatus") ?? "",
    dateFrom: params.get("dateFrom") ?? "",
    dateTo: params.get("dateTo") ?? "",
  };
}

// Ham formu yalnız geçerli değerleri taşıyan tipli query'ye çevirir (garbage atılır).
function toQuery(f: OrderFilters, view?: OrderView): OrderListQuery {
  const q: OrderListQuery = {};
  if (view) {
    // Varsayılanlar URL'e yazılmaz (temiz link) ama isteğe HER ZAMAN eklenir.
    if (view.page > 1) q.page = view.page;
    if (view.pageSize !== DEFAULT_ORDER_VIEW.pageSize) q.pageSize = view.pageSize;
    if (view.sortBy !== DEFAULT_ORDER_VIEW.sortBy) q.sortBy = view.sortBy as OrderListQuery["sortBy"];
    if (view.sortOrder !== DEFAULT_ORDER_VIEW.sortOrder) q.sortOrder = view.sortOrder;
  }
  if (f.search) q.search = f.search;
  if ((ORDER_STATUS_VALUES as string[]).includes(f.status)) q.status = f.status as OrderStatus;
  if ((PAYMENT_STATUS_VALUES as string[]).includes(f.paymentStatus)) {
    q.paymentStatus = f.paymentStatus as PaymentStatus;
  }
  if ((FULFILLMENT_STATUS_VALUES as string[]).includes(f.fulfillmentStatus)) {
    q.fulfillmentStatus = f.fulfillmentStatus as FulfillmentStatus;
  }
  if (DATE_RE.test(f.dateFrom)) q.dateFrom = f.dateFrom;
  if (DATE_RE.test(f.dateTo)) q.dateTo = f.dateTo;
  return q;
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<SkeletonRows rows={4} />}>
      <OrdersView />
    </Suspense>
  );
}

function OrdersView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = useLocale();
  const dict = getDictionary(locale);
  const t = dict.storeAdmin.orders;
  const c = dict.common;
  const g = dict.storeAdmin.dataGrid;
  const statusLabels = t.statusLabels as Record<OrderStatus, string>;
  const paymentLabels = t.paymentLabels as Record<PaymentStatus, string>;
  const fulfillmentLabels = t.fulfillmentLabels as Record<FulfillmentStatus, string>;
  // TODO-135 — Kargo hazırlık durumunu yansıtan GÖSTERİM etiketleri (rozet metni).
  const fulfillmentDisplayLabels = t.fulfillmentDisplayLabels as Record<
    OrderFulfillmentDisplay,
    string
  >;

  // URL = filtre + sayfa + sıralamanın tek doğruluk kaynağı; sayfa yenilense de korunur.
  const appliedFilters = useMemo(() => readFilters(searchParams), [searchParams]);
  const view = useMemo(() => readView(searchParams), [searchParams]);
  const query = useMemo(() => toQuery(appliedFilters, view), [appliedFilters, view]);
  // Etkin filtre sayısı YALNIZ daraltan alanları sayar (sayfa/sıralama hariç).
  const activeCount = Object.keys(toQuery(appliedFilters)).length;

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // Filtre bar form state'i; harici navigasyonda (URL değişimi) URL'ye senkronlanır.
  const [form, setForm] = useState<OrderFilters>(appliedFilters);
  // Satir bazli aksiyon yuklemesi (cift tiklama / kilit gostergesi).
  const [acting, setActing] = useState<{ id: string; type: "place" | "cancel" } | null>(null);

  useEffect(() => {
    setForm(appliedFilters);
  }, [appliedFilters]);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const orders = await storeApi.listOrders(query);
      setState({ status: "ready", orders: orders.data, pagination: orders.pagination });
    } catch (error) {
      setState({ status: "error", message: messageForError(error, locale) });
    }
  }, [locale, query]);

  useEffect(() => {
    void load();
  }, [load]);

  const applyFilters = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      // Filtre değişimi sayfayı 1'e döndürür (page taşınmaz); sıralama/sayfa boyutu korunur.
      router.replace(
        `/orders${orderListQueryString(toQuery(form, { ...view, page: 1 }))}`,
      );
    },
    [form, router, view],
  );

  const clearFilters = useCallback(() => {
    setForm(EMPTY_FILTERS);
    router.replace(`/orders${orderListQueryString(toQuery(EMPTY_FILTERS, { ...view, page: 1 }))}`);
  }, [router, view]);

  /** Sayfa/sayfa-boyutu/sıralama değişimi: filtreler korunur. */
  const updateView = useCallback(
    (patch: Partial<OrderView>) => {
      const next: OrderView = { ...view, ...patch };
      // Sıralama veya sayfa boyutu değişince sayfa 1'e döner.
      if (patch.sortBy !== undefined || patch.sortOrder !== undefined || patch.pageSize !== undefined) {
        next.page = 1;
      }
      router.replace(`/orders${orderListQueryString(toQuery(appliedFilters, next))}`);
    },
    [appliedFilters, router, view],
  );

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

  const columns: DataGridColumn<Order>[] = [
    {
      // Kolon kimliği = sunucu `sortBy` değeri. Sipariş no ALLOWLIST'te olmadığı için
      // bu kolon kayıt tarihine göre sıralar (hücrede zaten tarih gösterilir).
      key: "createdAt",
      sortable: true,
      header: t.table.number,
      className: "whitespace-nowrap",
      cell: (order) => (
        <div className="min-w-0">
          <p className="font-mono text-sm font-medium tracking-tight text-white/90">
            {order.orderNumber}
          </p>
          <p className="text-xs text-white/30">
            {order.placedAt ? formatDate(order.placedAt) : formatDate(order.createdAt)}
          </p>
        </div>
      ),
    },
    {
      key: "customer",
      header: t.table.customer,
      className: "max-w-[16rem]",
      cell: (order) => (
        <span className="block truncate text-white/60" title={order.customerEmail}>
          {order.customerEmail}
        </span>
      ),
    },
    {
      key: "total",
      sortable: true,
      header: t.table.total,
      className: "whitespace-nowrap",
      cell: (order) => (
        <span className="font-medium tabular-nums text-white/90">
          {formatMinor(order.totalAmount, order.currency)}
        </span>
      ),
    },
    {
      key: "status",
      header: t.table.status,
      className: "whitespace-nowrap",
      cell: (order) => (
        <Badge tone={ORDER_STATUS_TONES[order.status]}>{statusLabels[order.status]}</Badge>
      ),
    },
    {
      key: "payment",
      header: t.table.payment,
      className: "whitespace-nowrap",
      cell: (order) => (
        <Badge tone={PAYMENT_STATUS_TONES[order.paymentStatus]}>
          {paymentLabels[order.paymentStatus]}
        </Badge>
      ),
    },
    {
      key: "fulfillment",
      header: t.table.fulfillment,
      className: "whitespace-nowrap",
      cell: (order) => {
        // TODO-135 — Kargo kaydı varsa rozet hazırlık durumunu yansıtır (ör.
        // ORDER_CREATED → "Gönderi oluşturuldu"); yoksa "Gönderilmedi".
        const display = getOrderFulfillmentDisplay(
          order.fulfillmentStatus,
          order.shipmentStatus ?? null,
        );
        return (
          <Badge tone={FULFILLMENT_DISPLAY_TONES[display]}>
            {fulfillmentDisplayLabels[display]}
          </Badge>
        );
      },
    },
    {
      key: "lines",
      header: t.table.lines,
      className: "whitespace-nowrap",
      cell: (order) => (
        <span className="text-white/45">
          {format(t.lineCountLabel, { count: order.lines.length })}
        </span>
      ),
    },
    {
      key: "actions",
      header: t.table.actions,
      align: "right",
      className: "whitespace-nowrap",
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
                className="text-emerald-300 underline"
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
                className="text-red-300 underline"
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

      {/*
        TODO-159A — "Toplam" sunucudan gelen filtrelenmiş kayıt sayısıdır; taslak /
        işlemde / iptal / ciro sayıları GÖRÜNEN SAYFADAN hesaplanır (hızlı okuma).
        Mağaza-geneli kesin toplam için sayfalama çubuğundaki kayıt sayısı esastır.
      */}
      {state.status === "ready" && orders.length > 0 ? (
        <div className="mb-5">
          <MetricGrid columns={5}>
            <MetricTile
              label={t.summary.total}
              value={state.pagination.totalItems}
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

      <div className="mb-5">
        <SurfaceCard
          title={t.filters.title}
          description={
            activeCount > 0 ? format(t.filters.activeSummary, { count: activeCount }) : undefined
          }
        >
          <form onSubmit={applyFilters} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Input
                id="orders-filter-search"
                label={t.filters.searchLabel}
                placeholder={t.filters.searchPlaceholder}
                value={form.search}
                onChange={(event) => setForm((prev) => ({ ...prev, search: event.target.value }))}
              />
              <Select
                id="orders-filter-status"
                label={t.filters.statusLabel}
                value={form.status}
                onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
                options={[
                  { value: "", label: t.filters.all },
                  ...ORDER_STATUS_VALUES.map((value) => ({ value, label: statusLabels[value] })),
                ]}
              />
              <Select
                id="orders-filter-payment"
                label={t.filters.paymentLabel}
                value={form.paymentStatus}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, paymentStatus: event.target.value }))
                }
                options={[
                  { value: "", label: t.filters.all },
                  ...PAYMENT_STATUS_VALUES.map((value) => ({ value, label: paymentLabels[value] })),
                ]}
              />
              <Select
                id="orders-filter-fulfillment"
                label={t.filters.fulfillmentLabel}
                value={form.fulfillmentStatus}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, fulfillmentStatus: event.target.value }))
                }
                options={[
                  { value: "", label: t.filters.all },
                  ...FULFILLMENT_STATUS_VALUES.map((value) => ({
                    value,
                    label: fulfillmentLabels[value],
                  })),
                ]}
              />
              <Input
                id="orders-filter-date-from"
                type="date"
                label={t.filters.dateFromLabel}
                value={form.dateFrom}
                max={form.dateTo || undefined}
                onChange={(event) => setForm((prev) => ({ ...prev, dateFrom: event.target.value }))}
              />
              <Input
                id="orders-filter-date-to"
                type="date"
                label={t.filters.dateToLabel}
                value={form.dateTo}
                min={form.dateFrom || undefined}
                onChange={(event) => setForm((prev) => ({ ...prev, dateTo: event.target.value }))}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={clearFilters}
                disabled={activeCount === 0}
              >
                {t.filters.clear}
              </Button>
              <Button type="submit">{t.filters.apply}</Button>
            </div>
          </form>
        </SurfaceCard>
      </div>

      <SurfaceCard
        title={t.cardTitle}
        description={
          state.status === "ready"
            ? format(t.countLabel, { count: state.pagination.totalItems })
            : t.cardDescription
        }
        icon={<OrderIcon />}
      >
        <DataGrid
          columns={columns}
          rows={orders}
          rowKey={(order) => order.id}
          status={state.status}
          errorMessage={state.status === "error" ? state.message : undefined}
          onRetry={() => void load()}
          filtered={activeCount > 0}
          caption={t.cardTitle}
          sortBy={view.sortBy}
          sortOrder={view.sortOrder}
          onSortChange={(sortBy, sortOrder) => updateView({ sortBy, sortOrder })}
          emptyIcon={<OrderIcon />}
          emptyAction={
            <Button size="sm" onClick={() => setCreating(true)}>
              {t.emptyAction}
            </Button>
          }
          labels={{
            loading: g.loading,
            errorTitle: t.loadError,
            retry: c.actions.retry,
            emptyTitle: t.emptyTitle,
            emptyDescription: t.emptyDescription,
            // Filtreliyken sipariş ekranının kendi (daha bağlamlı) metni kullanılır.
            emptyFilteredTitle: t.filters.emptyTitle,
            emptyFilteredDescription: t.filters.emptyDescription,
            selectRow: g.selectRow,
            selectAll: g.selectAll,
          }}
        />

        {state.status === "ready" ? (
          <DataGridPagination
            labels={{
              rangeLabel: g.rangeLabel,
              rangeEmpty: g.rangeEmpty,
              previousPage: g.previousPage,
              nextPage: g.nextPage,
              pageSizeLabel: g.pageSizeLabel,
              goToPage: g.goToPage,
              pageOf: g.pageOf,
            }}
            page={state.pagination.page}
            pageSize={state.pagination.pageSize}
            totalItems={state.pagination.totalItems}
            totalPages={state.pagination.totalPages}
            onPageChange={(page) => updateView({ page })}
            onPageSizeChange={(pageSize) => updateView({ pageSize })}
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

        <div className="space-y-3 border-t border-white/[0.07] pt-4">
          <div>
            <h3 className="text-sm font-semibold text-white/90">{f.linesTitle}</h3>
            <p className="mt-0.5 text-xs text-white/30">{f.linesHint}</p>
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
