"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Badge,
  DataTable,
  EmptyState,
  Input,
  PageHeader,
  Select,
  SkeletonRows,
  StatCard,
  useLocale,
  type DataTableColumn,
} from "../../../../components/ui";
import { ShippingIcon } from "../../../../components/icons";
import { ProviderLogo } from "../../../../components/provider-logo";
import type { ShipmentListItem, ShipmentListKpi, ShipmentListQuery } from "@commerce-os/api-client";
import { storeApi } from "../../../../lib/client/api";
import { messageForError } from "../../../../lib/client/messages";
import {
  SHIPMENT_KPI_LABEL,
  SHIPMENT_STATUS_LABEL,
  SHIPMENT_STATUS_TONE,
  formatDateTime,
  type Locale,
} from "../../../../lib/client/shipment-ui";

const STATUS_VALUES = [
  "ORDER_CREATED",
  "LABEL_PENDING",
  "LABEL_CREATED",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "DELIVERY_FAILED",
  "RETURNED",
  "CANCELLED",
  "FAILED",
] as const;

const PROVIDER_VALUES = ["MOCK", "GELIVER", "DHL_ECOMMERCE"] as const;

const L = {
  tr: {
    title: "Kargo Gönderileri",
    desc: "Tüm kargo işlemlerini tek ekrandan takip edin. Gönderi siparişten doğan lojistik kayıttır.",
    search: "Ara: sipariş no, takip no, müşteri",
    allStatuses: "Tüm durumlar",
    allProviders: "Tüm sağlayıcılar",
    allFlags: "Tüm gönderiler",
    flagProblem: "Sorunlu gönderiler",
    flagAwaiting: "Barkod bekleyenler",
    flagUndeliverable: "Teslim edilemeyenler",
    dateFrom: "Başlangıç",
    dateTo: "Bitiş",
    colOrder: "Sipariş No",
    colCustomer: "Müşteri",
    colProvider: "Kargo Firması",
    colTracking: "Takip No",
    colStatus: "Durum",
    colLastPoint: "Son İşlem Noktası",
    colUpdated: "Son Güncelleme",
    colCreated: "Oluşturma",
    colAction: "Detay",
    detail: "Detay",
    empty: "Henüz kargo gönderisi yok.",
    emptyHint: "Gönderiler siparişten doğar ve burada listelenir; operasyon bu ekrandan yürütülür.",
    noPoint: "—",
    noTracking: "Henüz oluşmadı",
  },
  en: {
    title: "Shipments",
    desc: "Track every shipment from one screen. A shipment is the logistics record born from an order.",
    search: "Search: order no, tracking no, customer",
    allStatuses: "All statuses",
    allProviders: "All providers",
    allFlags: "All shipments",
    flagProblem: "Problem shipments",
    flagAwaiting: "Awaiting label",
    flagUndeliverable: "Undeliverable",
    dateFrom: "From",
    dateTo: "To",
    colOrder: "Order No",
    colCustomer: "Customer",
    colProvider: "Carrier",
    colTracking: "Tracking No",
    colStatus: "Status",
    colLastPoint: "Last Operation Point",
    colUpdated: "Last Update",
    colCreated: "Created",
    colAction: "Detail",
    detail: "Detail",
    empty: "No shipments yet.",
    emptyHint: "Shipments are born from orders and listed here; operations run from this screen.",
    noPoint: "—",
    noTracking: "Not created yet",
  },
} satisfies Record<Locale, Record<string, string>>;

export default function ShipmentsPage() {
  const locale = (useLocale() as Locale) ?? "tr";
  const t = L[locale] ?? L.tr;
  const router = useRouter();

  const [rows, setRows] = useState<ShipmentListItem[] | null>(null);
  const [kpi, setKpi] = useState<ShipmentListKpi | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [provider, setProvider] = useState("");
  const [flag, setFlag] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const load = useCallback(async () => {
    setError(null);
    const query: ShipmentListQuery = {};
    if (search.trim()) query.search = search.trim();
    if (status) query.status = status as ShipmentListQuery["status"];
    if (provider) query.provider = provider as ShipmentListQuery["provider"];
    if (flag) query.flag = flag as ShipmentListQuery["flag"];
    if (dateFrom) query.dateFrom = dateFrom;
    if (dateTo) query.dateTo = dateTo;
    try {
      const res = await storeApi.listShipments(query);
      setRows(res.data);
      setKpi(res.kpi);
    } catch (err) {
      setError(messageForError(err, locale));
      setRows([]);
    }
  }, [search, status, provider, flag, dateFrom, dateTo, locale]);

  // Filtre değişiminde debounce'lu yeniden yükleme (arama yazarken aşırı istek atmasın).
  useEffect(() => {
    const handle = setTimeout(() => void load(), 250);
    return () => clearTimeout(handle);
  }, [load]);

  const statusLabel = SHIPMENT_STATUS_LABEL[locale];
  const kpiLabel = SHIPMENT_KPI_LABEL[locale];

  const columns: DataTableColumn<ShipmentListItem>[] = useMemo(
    () => [
      {
        header: t.colOrder,
        cell: (r) => <span className="font-mono text-[12px] text-white/75">{r.orderNumber}</span>,
      },
      {
        header: t.colCustomer,
        cell: (r) => <span className="text-white/70">{r.customerName ?? "—"}</span>,
      },
      {
        header: t.colProvider,
        cell: (r) => (
          <span className="flex items-center gap-2">
            <ProviderLogo
              logoUrl={r.provider.logoUrl}
              displayName={r.provider.displayName}
              logoAlt={r.provider.logoAlt}
              size={22}
            />
            <span className="text-white/70">{r.provider.displayName}</span>
          </span>
        ),
      },
      {
        header: t.colTracking,
        cell: (r) =>
          r.trackingNumber ? (
            <span className="font-mono text-[12px] text-white/55">{r.trackingNumber}</span>
          ) : (
            <span className="text-[12px] text-white/25">{t.noTracking}</span>
          ),
      },
      {
        header: t.colStatus,
        cell: (r) => <Badge tone={SHIPMENT_STATUS_TONE[r.status]}>{statusLabel[r.status]}</Badge>,
      },
      {
        header: t.colLastPoint,
        cell: (r) => <span className="text-[12px] text-white/55">{r.lastEventLocation ?? t.noPoint}</span>,
      },
      {
        header: t.colUpdated,
        cell: (r) => (
          <span className="text-[12px] text-white/45">
            {formatDateTime(r.lastSyncedAt ?? r.updatedAt, locale)}
          </span>
        ),
      },
      {
        header: t.colCreated,
        cell: (r) => <span className="text-[12px] text-white/45">{new Date(r.createdAt).toLocaleDateString(locale)}</span>,
      },
      {
        header: t.colAction,
        align: "right",
        cell: () => <span className="text-[12px] text-indigo-300/80">{t.detail} →</span>,
      },
    ],
    [t, locale, statusLabel],
  );

  return (
    <div className="space-y-6">
      <PageHeader title={t.title} description={t.desc} />

      {/* KPI kartları — sade MVP (aşırı dashboard şişirmesi yok). */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label={kpiLabel.prepared} value={kpi?.prepared ?? "—"} icon={<ShippingIcon />} />
        <StatCard label={kpiLabel.awaitingLabel} value={kpi?.awaitingLabel ?? "—"} badge={kpi && kpi.awaitingLabel > 0 ? "•" : undefined} badgeTone="warning" />
        <StatCard label={kpiLabel.inTransit} value={kpi?.inTransit ?? "—"} />
        <StatCard label={kpiLabel.delivered} value={kpi?.delivered ?? "—"} badgeTone="success" />
        <StatCard label={kpiLabel.problem} value={kpi?.problem ?? "—"} badge={kpi && kpi.problem > 0 ? "•" : undefined} badgeTone="warning" />
      </div>

      {/* Filtreler */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <div className="lg:col-span-2">
          <Input label={t.search} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t.search} />
        </div>
        <Select
          label={t.colStatus}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={[{ value: "", label: t.allStatuses }, ...STATUS_VALUES.map((s) => ({ value: s, label: statusLabel[s] }))]}
        />
        <Select
          label={t.colProvider}
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          options={[{ value: "", label: t.allProviders }, ...PROVIDER_VALUES.map((p) => ({ value: p, label: p }))]}
        />
        <Select
          label="Filtre"
          value={flag}
          onChange={(e) => setFlag(e.target.value)}
          options={[
            { value: "", label: t.allFlags },
            { value: "PROBLEM", label: t.flagProblem },
            { value: "AWAITING_LABEL", label: t.flagAwaiting },
            { value: "UNDELIVERABLE", label: t.flagUndeliverable },
          ]}
        />
        <div className="grid grid-cols-2 gap-2">
          <Input label={t.dateFrom} type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <Input label={t.dateTo} type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}

      {rows === null ? (
        <SkeletonRows rows={6} />
      ) : rows.length === 0 ? (
        <EmptyState title={t.empty} description={t.emptyHint} icon={<ShippingIcon />} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          onRowClick={(r) => router.push(`/shipping/shipments/${r.id}`)}
        />
      )}
    </div>
  );
}
