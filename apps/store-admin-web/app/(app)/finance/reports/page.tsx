"use client";

/**
 * ADR-268 — Financial Reporting Foundation · Finans > Raporlar.
 *
 * Salt-okunur finansal raporlar (özet + ürün/kategori/marka + ödeme + indirim).
 * Filtre durumu URL'de korunur (§9). Tüm hesap SUNUCU-tarafıdır; bu ekran yalnız
 * sunar. Para minor-unit; formatMinor ile currency'e göre biçimlenir. İade tutarı
 * altyapısı olmadığından refundAmountsSupported=false iken dürüst mesaj gösterilir.
 */
import { Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  CancellationReportResponse,
  CreditReportDto,
  FinanceBreakdownsResponse,
  FinanceDiscountReportResponse,
  FinancePaymentReportResponse,
  FinanceSummaryResponse,
} from "@commerce-os/contracts";
import { PaymentIcon } from "../../../../components/icons";
import { storeApi, type FinanceReportParams } from "../../../../lib/client/api";
import {
  cancellationReasonCategoryLabel,
  cancellationReasonLabel,
  cancellationSourceLabel,
  CANCELLATION_REASON_CATEGORY_VALUES,
  CANCELLATION_REASON_VALUES,
  type OrderCancellationReason,
  type OrderCancellationReasonCategory,
  type OrderCancellationSource,
} from "../../orders/order-shared";
import { messageForError } from "../../../../lib/client/messages";
import { formatMinor } from "../../../../lib/client/format";
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  PageHeader,
  Select,
  Spinner,
} from "../../../../components/ui";
import { SurfaceCard } from "../../../components/premium";

type Tab = "ozet" | "urun" | "kategori" | "odeme" | "indirim" | "iptal" | "bakiye";

const TABS: { key: Tab; label: string }[] = [
  { key: "ozet", label: "Satış Özeti" },
  { key: "urun", label: "Ürün Performansı" },
  { key: "kategori", label: "Kategori & Marka" },
  { key: "odeme", label: "Ödeme Raporu" },
  { key: "indirim", label: "İndirim Raporu" },
  { key: "iptal", label: "İptal Raporu" },
  // TD-174B-2 — Alışveriş bakiyesi (store credit) finansal raporu.
  { key: "bakiye", label: "Alışveriş Bakiyesi" },
];

// TODO-174 (ADR-275) — İptal raporu filtre seçenekleri (Store Admin yalnız görüntüler).
const CANCEL_REASON_CATEGORY_OPTIONS = [
  { value: "", label: "Tüm kategoriler" },
  ...CANCELLATION_REASON_CATEGORY_VALUES.map((c) => ({
    value: c,
    label: cancellationReasonCategoryLabel(c, "tr"),
  })),
];
const CANCEL_REASON_OPTIONS = [
  { value: "", label: "Tüm nedenler" },
  ...CANCELLATION_REASON_VALUES.map((r) => ({ value: r, label: cancellationReasonLabel(r, "tr") })),
];
const CANCEL_PAYMENT_METHOD_OPTIONS = [
  { value: "", label: "Tüm ödeme yöntemleri" },
  { value: "CARD", label: "Kart" },
  { value: "BANK_TRANSFER", label: "Havale / EFT" },
  { value: "CASH_ON_DELIVERY", label: "Kapıda ödeme" },
  { value: "PAYMENT_LINK", label: "Ödeme linki" },
];

const cancelCategoryLabel = (c: OrderCancellationReasonCategory | null) =>
  c ? cancellationReasonCategoryLabel(c, "tr") : "Bilinmiyor";
const cancelReasonText = (r: OrderCancellationReason | null) =>
  r ? cancellationReasonLabel(r, "tr") : "Bilinmiyor";
const cancelSourceText = (s: OrderCancellationSource | null) =>
  s ? cancellationSourceLabel(s, "tr") : "Bilinmiyor";

const PERIOD_OPTIONS = [
  { value: "today", label: "Bugün" },
  { value: "yesterday", label: "Dün" },
  { value: "last7", label: "Son 7 gün" },
  { value: "last30", label: "Son 30 gün" },
  { value: "thisMonth", label: "Bu ay" },
  { value: "lastMonth", label: "Geçen ay" },
  { value: "thisYear", label: "Bu yıl" },
  { value: "custom", label: "Özel aralık" },
];

/** Karşılaştırma etiketi — renk-tek-başına değil; yön ikonu + işaret + %; sıfır-payda güvenli. */
function DeltaTag({ deltaMinor, deltaPct }: { deltaMinor: number; deltaPct: number | null }) {
  const up = deltaMinor > 0;
  const down = deltaMinor < 0;
  const tone: "success" | "warning" | "neutral" = up ? "success" : down ? "warning" : "neutral";
  const arrow = up ? "▲" : down ? "▼" : "■";
  const pct = deltaPct === null ? "yeni" : `${deltaPct > 0 ? "+" : ""}${deltaPct.toFixed(1)}%`;
  return (
    <Badge tone={tone} dot={false}>
      <span aria-hidden>{arrow}</span> {pct}
    </Badge>
  );
}

function money(minor: number | null | undefined, currency: string): string {
  if (minor === null || minor === undefined) return "—";
  return formatMinor(minor, currency);
}

/** Bağımsız (kütüphanesiz) günlük gelir çubuk grafiği + erişilebilir metin özeti (§17). */
function DailyBarChart({ daily, currency }: { daily: FinanceSummaryResponse["data"]["daily"]; currency: string }) {
  const max = Math.max(1, ...daily.map((d) => d.totalRevenueMinor));
  const totalRevenue = daily.reduce((a, d) => a + d.totalRevenueMinor, 0);
  const peak = daily.reduce((best, d) => (d.totalRevenueMinor > best.totalRevenueMinor ? d : best), daily[0]);
  return (
    <div>
      <p className="sr-only">
        {daily.length} günlük toplam gelir grafiği. Toplam {money(totalRevenue, currency)}.
        {peak ? ` En yüksek gün ${peak.date}: ${money(peak.totalRevenueMinor, currency)}.` : ""}
      </p>
      <div className="flex h-40 items-end gap-1 overflow-x-auto" role="img" aria-hidden>
        {daily.map((d) => (
          <div
            key={d.date}
            className="min-w-[6px] flex-1 rounded-t bg-indigo-400/70 transition-colors hover:bg-indigo-300"
            style={{ height: `${Math.max(2, (d.totalRevenueMinor / max) * 100)}%` }}
            title={`${d.date} · ${money(d.totalRevenueMinor, currency)} · ${d.orderCount} sipariş`}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-white/30">
        <span>{daily[0]?.date ?? ""}</span>
        <span>{daily[daily.length - 1]?.date ?? ""}</span>
      </div>
    </div>
  );
}

function Th({ children, right }: { children: ReactNode; right?: boolean }) {
  return (
    <th className={`px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-white/35 ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}
function Td({ children, right }: { children: ReactNode; right?: boolean }) {
  return <td className={`px-3 py-2 text-[13px] text-white/80 ${right ? "text-right tabular-nums" : ""}`}>{children}</td>;
}

function ReportsInner() {
  const router = useRouter();
  const params = useSearchParams();

  const tab = (params.get("tab") as Tab) || "ozet";
  const period = params.get("period") || "last30";
  const currencyParam = params.get("currency") || undefined;
  const dateFrom = params.get("dateFrom") || undefined;
  const dateTo = params.get("dateTo") || undefined;

  const query: FinanceReportParams = useMemo(
    () => ({
      period,
      currency: currencyParam,
      dateFrom: period === "custom" ? dateFrom : undefined,
      dateTo: period === "custom" ? dateTo : undefined,
      status: params.get("status") || undefined,
      paymentStatus: params.get("paymentStatus") || undefined,
      productId: params.get("productId") || undefined,
      categoryId: params.get("categoryId") || undefined,
      brandId: params.get("brandId") || undefined,
      campaignId: params.get("campaignId") || undefined,
      paymentMethod: params.get("paymentMethod") || undefined,
      // TODO-174 (ADR-275) — İptal raporu taksonomi/boyut filtreleri.
      reasonCategory: params.get("reasonCategory") || undefined,
      reasonCode: params.get("reasonCode") || undefined,
      shippingProvider: params.get("shippingProvider") || undefined,
    }),
    [period, currencyParam, dateFrom, dateTo, params],
  );

  const [summary, setSummary] = useState<FinanceSummaryResponse["data"] | null>(null);
  const [breakdowns, setBreakdowns] = useState<FinanceBreakdownsResponse["data"] | null>(null);
  const [payments, setPayments] = useState<FinancePaymentReportResponse["data"] | null>(null);
  const [discounts, setDiscounts] = useState<FinanceDiscountReportResponse["data"] | null>(null);
  const [cancellations, setCancellations] = useState<CancellationReportResponse["data"] | null>(null);
  const [creditReport, setCreditReport] = useState<CreditReportDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const setParam = useCallback(
    (updates: Record<string, string | undefined>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined || value === "") next.delete(key);
        else next.set(key, value);
      }
      router.replace(`?${next.toString()}`);
    },
    [params, router],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const sum = await storeApi.getFinanceSummary(query);
        if (!active) return;
        setSummary(sum.data);
        if (tab === "urun" || tab === "kategori") {
          const b = await storeApi.getFinanceBreakdowns({ ...query, currency: sum.data.currency });
          if (active) setBreakdowns(b.data);
        } else if (tab === "odeme") {
          const p = await storeApi.getFinancePayments({ ...query, currency: sum.data.currency });
          if (active) setPayments(p.data);
        } else if (tab === "indirim") {
          const d = await storeApi.getFinanceDiscounts({ ...query, currency: sum.data.currency });
          if (active) setDiscounts(d.data);
        } else if (tab === "iptal") {
          const cx = await storeApi.getCancellationReport({ ...query, currency: sum.data.currency });
          if (active) setCancellations(cx.data);
        } else if (tab === "bakiye") {
          // Store credit para birimi satış para biriminden bağımsız; backend çözer (currency zorlamıyoruz).
          const cr = await storeApi.getCreditReport(query);
          if (active) setCreditReport(cr);
        }
      } catch (err) {
        if (active) setError(messageForError(err));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [query, tab]);

  const currency = summary?.currency ?? currencyParam ?? "TRY";

  const download = useCallback(async (fn: () => Promise<string>, filename: string) => {
    try {
      const csv = await fn();
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      /* indirme hatası sessiz — kullanıcı tekrar deneyebilir */
    }
  }, []);

  const exportForTab = useCallback(() => {
    const q = { ...query, currency };
    if (tab === "urun") return download(() => storeApi.exportFinanceProducts(q), "urun-performansi.csv");
    if (tab === "odeme") return download(() => storeApi.exportFinancePayments(q), "odeme-raporu.csv");
    if (tab === "indirim") return download(() => storeApi.exportFinanceDiscounts(q), "indirim-raporu.csv");
    if (tab === "kategori") return download(() => storeApi.exportFinanceProducts(q), "kategori-marka.csv");
    return download(() => storeApi.exportFinanceSummary(q), "satis-ozeti.csv");
  }, [tab, query, currency, download]);

  const currencyOptions = useMemo(() => {
    const list = summary?.availableCurrencies ?? [];
    if (list.length === 0) return [{ value: currency, label: currency }];
    return list.map((c) => ({ value: c, label: c }));
  }, [summary, currency]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Finans"
        title="Raporlar"
        description="Sipariş kayıtlarından türetilen finansal özet, ürün, ödeme ve indirim raporları. Tüm tutarlar sipariş anındaki kayıtlardır."
        actions={
          // İptal + Alışveriş Bakiyesi raporlarının CSV dışa aktarımı yoktur (yalnız görüntüleme).
          tab === "iptal" || tab === "bakiye" ? null : (
            <Button variant="secondary" onClick={exportForTab}>
              CSV indir
            </Button>
          )
        }
      />

      {/* Filtreler (URL'de korunur) */}
      <SurfaceCard>
        <div className="flex flex-wrap items-end gap-3 p-4">
          <div className="w-40">
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-white/35">Dönem</label>
            <Select
              aria-label="Dönem"
              value={period}
              options={PERIOD_OPTIONS}
              onChange={(e) => setParam({ period: e.target.value, dateFrom: undefined, dateTo: undefined })}
            />
          </div>
          {period === "custom" ? (
            <>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-white/35">Başlangıç</label>
                <input
                  type="date"
                  aria-label="Başlangıç tarihi"
                  value={dateFrom ?? ""}
                  onChange={(e) => setParam({ dateFrom: e.target.value || undefined })}
                  className="h-10 rounded-lg border border-white/10 bg-white/5 px-3 text-[13px] text-white/90 [color-scheme:dark]"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-white/35">Bitiş</label>
                <input
                  type="date"
                  aria-label="Bitiş tarihi"
                  value={dateTo ?? ""}
                  onChange={(e) => setParam({ dateTo: e.target.value || undefined })}
                  className="h-10 rounded-lg border border-white/10 bg-white/5 px-3 text-[13px] text-white/90 [color-scheme:dark]"
                />
              </div>
            </>
          ) : null}
          <div className="w-28">
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-white/35">Para birimi</label>
            <Select
              aria-label="Para birimi"
              value={currency}
              options={currencyOptions}
              onChange={(e) => setParam({ currency: e.target.value })}
            />
          </div>
          {/* TODO-174 (ADR-275) — İptal raporu ek filtreleri (yalnız İptal sekmesinde). */}
          {tab === "iptal" ? (
            <>
              <div className="w-44">
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-white/35">Neden kategorisi</label>
                <Select
                  aria-label="Neden kategorisi"
                  value={params.get("reasonCategory") ?? ""}
                  options={CANCEL_REASON_CATEGORY_OPTIONS}
                  onChange={(e) => setParam({ reasonCategory: e.target.value || undefined })}
                />
              </div>
              <div className="w-52">
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-white/35">Neden</label>
                <Select
                  aria-label="Neden"
                  value={params.get("reasonCode") ?? ""}
                  options={CANCEL_REASON_OPTIONS}
                  onChange={(e) => setParam({ reasonCode: e.target.value || undefined })}
                />
              </div>
              <div className="w-44">
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-white/35">Ödeme yöntemi</label>
                <Select
                  aria-label="Ödeme yöntemi"
                  value={params.get("paymentMethod") ?? ""}
                  options={CANCEL_PAYMENT_METHOD_OPTIONS}
                  onChange={(e) => setParam({ paymentMethod: e.target.value || undefined })}
                />
              </div>
              <div className="w-44">
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-white/35">Kargo sağlayıcı</label>
                <Select
                  aria-label="Kargo sağlayıcı"
                  value={params.get("shippingProvider") ?? ""}
                  options={[
                    { value: "", label: "Tüm sağlayıcılar" },
                    ...(cancellations?.shippingMethodBreakdown ?? []).map((r) => ({
                      value: r.key,
                      label: r.label,
                    })),
                  ]}
                  onChange={(e) => setParam({ shippingProvider: e.target.value || undefined })}
                />
              </div>
            </>
          ) : null}
          {summary ? (
            <p className="ml-auto text-xs text-white/30">
              {summary.range.from} → {summary.range.to} · {summary.range.timezone}
            </p>
          ) : null}
        </div>
      </SurfaceCard>

      {/* Sekmeler */}
      <div role="tablist" aria-label="Rapor sekmeleri" className="flex flex-wrap gap-1 border-b border-white/10">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setParam({ tab: t.key })}
            className={`rounded-t-lg px-4 py-2 text-[13px] font-medium transition-colors ${
              tab === t.key ? "bg-white/10 text-white" : "text-white/50 hover:text-white/80"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error ? <Alert tone="error" title="Rapor yüklenemedi">{error}</Alert> : null}
      {loading && !summary ? (
        <div className="flex justify-center py-16">
          <Spinner label="Rapor hesaplanıyor…" />
        </div>
      ) : null}

      {summary ? (
        <>
          {tab === "ozet" ? <OverviewTab data={summary} currency={currency} /> : null}
          {tab === "urun" ? <ProductTab data={breakdowns} currency={currency} loading={loading} /> : null}
          {tab === "kategori" ? <CategoryBrandTab data={breakdowns} currency={currency} loading={loading} /> : null}
          {tab === "odeme" ? <PaymentTab data={payments} currency={currency} loading={loading} /> : null}
          {tab === "indirim" ? <DiscountTab data={discounts} currency={currency} loading={loading} /> : null}
          {tab === "iptal" ? <CancellationTab data={cancellations} currency={currency} loading={loading} /> : null}
          {tab === "bakiye" ? <StoreCreditTab data={creditReport} loading={loading} /> : null}
        </>
      ) : null}
    </div>
  );
}

/**
 * TD-174B-2 — Alışveriş bakiyesi (store credit) finansal raporu sekmesi. Kaynak =
 * append-only kredi defteri (ADR-281). `Ödenmemiş bakiye (yükümlülük)` NOKTA-ANLIK
 * (canlı lot Σ remaining, expiresAt>now); diğer tutarlar dönem-içi hareket toplamı.
 * Tek para birimi (mixed-currency toplamı yok). Ham enum GÖSTERİLMEZ.
 */
function StoreCreditTab({ data, loading }: { data: CreditReportDto | null; loading: boolean }) {
  if (!data) {
    return loading ? (
      <div className="flex justify-center p-10">
        <Spinner />
      </div>
    ) : (
      <EmptyState title="Veri yok" description="Seçili dönemde alışveriş bakiyesi hareketi bulunmuyor." />
    );
  }
  const c = data.currency;
  return (
    <div className="space-y-5">
      <SurfaceCard>
        <div className="p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="text-sm font-semibold text-white/80">Ödenmemiş bakiye yükümlülüğü</h3>
            <span className="text-xs text-white/40">
              {data.range.dateFrom} — {data.range.dateTo}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Kpi
              label="Ödenmemiş bakiye (canlı)"
              value={formatMinor(Number(data.outstandingLiabilityMinor), c)}
              hint="Şu an geçerli (süresi dolmamış) lot toplamı"
            />
            <Kpi label="Bakiyeli müşteri" value={String(data.customersWithBalance)} hint={`${data.activeLotCount} aktif lot`} />
            <Kpi label="Verilen (goodwill)" value={formatMinor(Number(data.issuedMinor), c)} hint="Dönem içi tanımlanan" />
          </div>
        </div>
      </SurfaceCard>

      <SurfaceCard>
        <div className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-white/80">Dönem içi hareketler</h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Kpi label="Harcanan" value={formatMinor(Number(data.spentMinor), c)} hint="Siparişlerde kullanılan" />
            <Kpi label="Geri yüklenen" value={formatMinor(Number(data.restoredMinor), c)} hint="İptal/iade ile iade edilen" />
            <Kpi label="Süresi dolan" value={formatMinor(Number(data.expiredMinor), c)} hint="Kullanılmadan sona eren" />
            <Kpi label="Recovery goodwill" value={formatMinor(Number(data.goodwillIssuedMinor), c)} hint="Geri kazanım kaynaklı" />
            <Kpi label="Manuel düzeltme (net)" value={formatMinor(Number(data.adjustmentsNetMinor), c)} hint="Alacak − borç" />
          </div>
        </div>
      </SurfaceCard>
    </div>
  );
}

function Kpi({ label, value, hint, delta, tip }: { label: string; value: string; hint?: string; delta?: ReactNode; tip?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4" title={tip}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-white/35">{label}</p>
        {delta}
      </div>
      <p className="mt-2 text-2xl font-extrabold tracking-tight text-white/95">{value}</p>
      {hint ? <p className="mt-1 text-xs text-white/30">{hint}</p> : null}
    </div>
  );
}

function OverviewTab({ data, currency }: { data: FinanceSummaryResponse["data"]; currency: string }) {
  const s = data.summary;
  const c = data.comparison;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpi label="Toplam gelir" value={money(s.totalRevenueMinor, currency)} tip="Net ürün satışı + kargo geliri − kargo iadesi. KDV dahil (ayrı gösterilir)." delta={<DeltaTag {...c.totalRevenue} />} />
        <Kpi label="Net ürün satışı" value={money(s.netProductSalesMinor, currency)} tip="Brüt satış − indirim − ürün iadesi." delta={<DeltaTag {...c.netProductSales} />} />
        <Kpi label="Brüt satış" value={money(s.grossSalesMinor, currency)} tip="Sipariş ara toplamları (indirim öncesi)." delta={<DeltaTag {...c.grossSales} />} />
        <Kpi label="İndirim" value={money(s.discountsMinor, currency)} tip="Satır + sipariş seviyesi indirim toplamı." delta={<DeltaTag {...c.discounts} />} />
        <Kpi label="Kargo geliri" value={money(s.shippingRevenueMinor, currency)} tip="Sipariş kargo tutarları." />
        <Kpi label="KDV" value={money(s.taxMinor, currency)} tip="Fiyata dahil KDV (satır snapshot'ından). Gelire ikinci kez eklenmez." />
        <Kpi label="Sipariş" value={String(s.orderCount)} tip="Geçerli satış siparişleri (PLACED/CONFIRMED/FULFILLED)." delta={<DeltaTag {...c.orders} />} />
        <Kpi label="Ödenen sipariş" value={String(s.paidOrderCount)} tip="paymentStatus PAID/AUTHORIZED." />
        <Kpi label="Ortalama sepet" value={money(s.averageOrderValueMinor, currency)} tip="Toplam gelir / sipariş sayısı." delta={<DeltaTag {...c.averageOrderValue} />} />
        <Kpi label="Satılan adet" value={String(s.unitsSold)} tip="Sipariş satırı adet toplamı." delta={<DeltaTag {...c.unitsSold} />} />
      </div>

      {/* İptal / iade / kârlılık — dürüst durum */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="İptal sipariş" value={String(s.cancelledOrderCount)} tip="Satışa dahil değildir." />
        <Kpi label="İadeli sipariş (adet)" value={String(s.refundedOrderCount)} hint={data.refundAmountsSupported ? undefined : "İade tutarı altyapısı henüz yok"} tip="paymentStatus REFUNDED/PARTIALLY_REFUNDED. İade tutarı (yalnız SUCCEEDED) Toplam gelir ve Net ürün satışına zaten yansımıştır; burada ayrıca satır olarak gösterilmez." />
        <Kpi label="Brüt kâr" value={money(s.grossProfitMinor, currency)} hint={s.grossProfitMinor === null ? `Maliyet verisi: ${s.costCoveredOrderCount}/${s.orderCount} sipariş` : "Vergisiz net − maliyet"} tip="Yalnız tüm siparişlerde maliyet snapshot'ı varsa hesaplanır." />
        <Kpi label="Net kâr" value={money(s.netProfitMinor, currency)} hint={s.netProfitMinor === null ? "Kapsam yetersiz" : "Brüt kâr − indirim"} tip="Kârlılık kapsam-kapılıdır (ADR-268 §8)." />
      </div>

      <SurfaceCard>
        <div className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white/80">Günlük gelir</h3>
            <span className="text-[11px] text-white/30">{currency}</span>
          </div>
          {data.daily.length > 0 ? (
            <DailyBarChart daily={data.daily} currency={currency} />
          ) : (
            <EmptyState title="Veri yok" description="Seçili dönemde satış bulunmuyor." icon={<PaymentIcon />} />
          )}
        </div>
      </SurfaceCard>

      {/* Günlük tablo (mutabakat: toplam = günlük toplamı) */}
      <SurfaceCard>
        <div className="overflow-x-auto p-2">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <Th>Gün</Th>
                <Th right>Brüt</Th>
                <Th right>İndirim</Th>
                <Th right>Net</Th>
                <Th right>Kargo</Th>
                <Th right>Toplam gelir</Th>
                <Th right>Sipariş</Th>
                <Th right>Adet</Th>
              </tr>
            </thead>
            <tbody>
              {data.daily.map((d) => (
                <tr key={d.date} className="border-b border-white/[0.04]">
                  <Td>{d.date}</Td>
                  <Td right>{money(d.grossSalesMinor, currency)}</Td>
                  <Td right>{money(d.discountsMinor, currency)}</Td>
                  <Td right>{money(d.netProductSalesMinor, currency)}</Td>
                  <Td right>{money(d.shippingRevenueMinor, currency)}</Td>
                  <Td right>{money(d.totalRevenueMinor, currency)}</Td>
                  <Td right>{d.orderCount}</Td>
                  <Td right>{d.unitsSold}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SurfaceCard>
    </div>
  );
}

function TableCard({ children, loading }: { children: ReactNode; loading: boolean }) {
  return (
    <SurfaceCard>
      <div className="relative overflow-x-auto p-2">
        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner label="Yükleniyor…" />
          </div>
        ) : (
          children
        )}
      </div>
    </SurfaceCard>
  );
}

function ProductTab({ data, currency, loading }: { data: FinanceBreakdownsResponse["data"] | null; currency: string; loading: boolean }) {
  return (
    <TableCard loading={loading}>
      {data && data.byProduct.length > 0 ? (
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10">
              <Th>Ürün</Th>
              <Th>SKU</Th>
              <Th right>Adet</Th>
              <Th right>Brüt satış</Th>
              <Th right>İndirim</Th>
              <Th right>Net</Th>
              <Th right>Maliyet</Th>
              <Th right>Kâr</Th>
            </tr>
          </thead>
          <tbody>
            {data.byProduct.map((r) => {
              const profitable = r.coveredUnits === r.units && r.units > 0;
              const profit = profitable ? r.netMinor - r.costMinor : null;
              return (
                <tr key={r.productId} className="border-b border-white/[0.04]">
                  <Td>{r.title}</Td>
                  <Td>{r.sku}</Td>
                  <Td right>{r.units}</Td>
                  <Td right>{money(r.grossMinor, currency)}</Td>
                  <Td right>{money(r.discountMinor, currency)}</Td>
                  <Td right>{money(r.netMinor, currency)}</Td>
                  <Td right>{profitable ? money(r.costMinor, currency) : "—"}</Td>
                  <Td right>{profit === null ? "—" : money(profit, currency)}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <EmptyState title="Veri yok" description="Seçili dönemde ürün satışı yok." icon={<PaymentIcon />} />
      )}
    </TableCard>
  );
}

function DimensionTable({ title, rows, currency }: { title: string; rows: FinanceBreakdownsResponse["data"]["byCategory"]; currency: string }) {
  return (
    <SurfaceCard>
      <div className="p-3">
        <h3 className="mb-2 px-1 text-sm font-semibold text-white/80">{title}</h3>
        <div className="overflow-x-auto">
          {rows.length > 0 ? (
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <Th>{title}</Th>
                  <Th right>Adet</Th>
                  <Th right>Brüt satış</Th>
                  <Th right>Sipariş</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-b border-white/[0.04]">
                    <Td>{r.label}</Td>
                    <Td right>{r.units}</Td>
                    <Td right>{money(r.grossMinor, currency)}</Td>
                    <Td right>{r.orderCount}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="px-1 py-6 text-sm text-white/40">Veri yok.</p>
          )}
        </div>
      </div>
    </SurfaceCard>
  );
}

function CategoryBrandTab({ data, currency, loading }: { data: FinanceBreakdownsResponse["data"] | null; currency: string; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner label="Yükleniyor…" />
      </div>
    );
  }
  if (!data) return null;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <DimensionTable title="Kategori" rows={data.byCategory} currency={currency} />
      <DimensionTable title="Marka" rows={data.byBrand} currency={currency} />
    </div>
  );
}

function PaymentTab({ data, currency, loading }: { data: FinancePaymentReportResponse["data"] | null; currency: string; loading: boolean }) {
  return (
    <TableCard loading={loading}>
      {data && data.rows.length > 0 ? (
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10">
              <Th>Sağlayıcı</Th>
              <Th>Yöntem</Th>
              <Th right>Tahsil edilen</Th>
              <Th right>Başarılı</Th>
              <Th right>Başarısız</Th>
              <Th right>İade</Th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r, i) => (
              <tr key={`${r.provider}-${r.method}-${i}`} className="border-b border-white/[0.04]">
                <Td>{r.provider}</Td>
                <Td>{r.method}</Td>
                <Td right>{money(r.collectedMinor, currency)}</Td>
                <Td right>{r.paidCount}</Td>
                <Td right>{r.failedCount}</Td>
                <Td right>{r.refundedCount}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <EmptyState title="Veri yok" description="Seçili dönemde tahsilat kaydı yok." icon={<PaymentIcon />} />
      )}
    </TableCard>
  );
}

function DiscountTab({ data, currency, loading }: { data: FinanceDiscountReportResponse["data"] | null; currency: string; loading: boolean }) {
  return (
    <TableCard loading={loading}>
      {data && data.rows.length > 0 ? (
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10">
              <Th>Kampanya / Kupon</Th>
              <Th>Kod</Th>
              <Th right>Kullanım</Th>
              <Th right>İndirim</Th>
              <Th right>Sipariş brüt</Th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r, i) => (
              <tr key={`${r.campaignId ?? r.couponId ?? i}`} className="border-b border-white/[0.04]">
                <Td>{r.label || "—"}</Td>
                <Td>{r.code ?? "—"}</Td>
                <Td right>{r.usageCount}</Td>
                <Td right>{money(r.discountMinor, currency)}</Td>
                <Td right>{money(r.ordersGrossMinor, currency)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <EmptyState title="Veri yok" description="Seçili dönemde indirim kullanımı yok." icon={<PaymentIcon />} />
      )}
    </TableCard>
  );
}

/** Sağa-hizalı ölçüt yüzdesi (0 ondalık bölünürse tam sayı; aksi halde 1 ondalık). */
function pct(value: number): string {
  return `${value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)}%`;
}

/**
 * TODO-174 (ADR-275) — İptal raporu paneli (Store Admin; YALNIZ görüntüleme, taksonomi
 * CRUD YOK). Sunucu-türevi: KPI + neden kategorisi/neden dağılımı + trend + ödeme/kargo
 * kırılımı + kaynak dağılımı + en çok iptal edilen ürünler. Para minor-unit; her currency ayrı.
 */
function CancellationTab({
  data,
  currency,
  loading,
}: {
  data: CancellationReportResponse["data"] | null;
  currency: string;
  loading: boolean;
}) {
  if (loading && !data) {
    return (
      <div className="flex justify-center py-10">
        <Spinner label="İptal raporu hesaplanıyor…" />
      </div>
    );
  }
  if (!data) return null;
  if (data.totals.cancellationCount === 0) {
    return (
      <SurfaceCard>
        <div className="p-2">
          <EmptyState
            title="İptal yok"
            description="Seçili dönem ve filtrelerde iptal edilen sipariş bulunmuyor."
            icon={<PaymentIcon />}
          />
        </div>
      </SurfaceCard>
    );
  }
  const t = data.totals;
  return (
    <div className="space-y-5">
      {/* KPI tile'ları */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpi label="İptal sayısı" value={String(t.cancellationCount)} tip="Seçili dönemde iptal edilen sipariş adedi." />
        <Kpi label="İptal oranı" value={pct(t.cancellationRatePct)} hint={`${t.cancellationCount}/${t.ordersInRangeCount} sipariş`} tip="İptal sayısı / dönemdeki toplam sipariş." />
        <Kpi label="İptal edilen ciro" value={money(t.cancelledRevenueMinor, currency)} tip="İptal edilen siparişlerin toplam tutarı (sipariş anı snapshot)." />
        <Kpi label="İade edilen ciro" value={money(t.refundedRevenueMinor, currency)} tip="İptal edilen siparişlerde gerçekleşen iade toplamı." />
        <Kpi label="Teslimat kaynaklı oran" value={pct(t.deliveryRelatedRatePct)} hint={`${t.deliveryRelatedCount} iptal`} tip="Teslimat kategorisindeki iptallerin toplam iptallere oranı." />
      </div>

      {/* Neden kategorisi dağılımı */}
      <SurfaceCard>
        <div className="p-3">
          <h3 className="mb-2 px-1 text-sm font-semibold text-white/80">Neden kategorisi dağılımı</h3>
          <div className="overflow-x-auto">
            {data.reasonCategoryDistribution.length > 0 ? (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <Th>Kategori</Th>
                    <Th right>Adet</Th>
                    <Th right>Ciro</Th>
                    <Th right>Pay</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.reasonCategoryDistribution.map((r, i) => (
                    <tr key={`${r.category ?? "unknown"}-${i}`} className="border-b border-white/[0.04]">
                      <Td>{cancelCategoryLabel(r.category)}</Td>
                      <Td right>{r.count}</Td>
                      <Td right>{money(r.revenueMinor, currency)}</Td>
                      <Td right>{pct(r.sharePct)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="px-1 py-6 text-sm text-white/40">Veri yok.</p>
            )}
          </div>
        </div>
      </SurfaceCard>

      {/* Neden dağılımı */}
      <SurfaceCard>
        <div className="p-3">
          <h3 className="mb-2 px-1 text-sm font-semibold text-white/80">Neden dağılımı</h3>
          <div className="overflow-x-auto">
            {data.reasonDistribution.length > 0 ? (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <Th>Neden</Th>
                    <Th>Kategori</Th>
                    <Th right>Adet</Th>
                    <Th right>Ciro</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.reasonDistribution.map((r, i) => (
                    <tr key={`${r.code ?? "unknown"}-${i}`} className="border-b border-white/[0.04]">
                      <Td>{cancelReasonText(r.code)}</Td>
                      <Td>{cancelCategoryLabel(r.category)}</Td>
                      <Td right>{r.count}</Td>
                      <Td right>{money(r.revenueMinor, currency)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="px-1 py-6 text-sm text-white/40">Veri yok.</p>
            )}
          </div>
        </div>
      </SurfaceCard>

      {/* Günlük trend */}
      <SurfaceCard>
        <div className="p-3">
          <h3 className="mb-2 px-1 text-sm font-semibold text-white/80">Günlük iptal trendi</h3>
          <div className="overflow-x-auto">
            {data.trend.length > 0 ? (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <Th>Gün</Th>
                    <Th right>İptal</Th>
                    <Th right>Ciro</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.trend.map((r) => (
                    <tr key={r.date} className="border-b border-white/[0.04]">
                      <Td>{r.date}</Td>
                      <Td right>{r.count}</Td>
                      <Td right>{money(r.revenueMinor, currency)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="px-1 py-6 text-sm text-white/40">Veri yok.</p>
            )}
          </div>
        </div>
      </SurfaceCard>

      {/* Ödeme + kargo kırılımı */}
      <div className="grid gap-4 lg:grid-cols-2">
        <DimensionBreakdownCard title="Ödeme yöntemi kırılımı" rows={data.paymentMethodBreakdown} currency={currency} />
        <DimensionBreakdownCard title="Kargo yöntemi kırılımı" rows={data.shippingMethodBreakdown} currency={currency} />
      </div>

      {/* Kaynak dağılımı + en çok iptal edilen ürünler */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SurfaceCard>
          <div className="p-3">
            <h3 className="mb-2 px-1 text-sm font-semibold text-white/80">Kaynak dağılımı</h3>
            <div className="overflow-x-auto">
              {data.sourceBreakdown.length > 0 ? (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/10">
                      <Th>Kaynak</Th>
                      <Th right>Adet</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sourceBreakdown.map((r, i) => (
                      <tr key={`${r.source ?? "unknown"}-${i}`} className="border-b border-white/[0.04]">
                        <Td>{cancelSourceText(r.source)}</Td>
                        <Td right>{r.count}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="px-1 py-6 text-sm text-white/40">Veri yok.</p>
              )}
            </div>
          </div>
        </SurfaceCard>

        <SurfaceCard>
          <div className="p-3">
            <h3 className="mb-2 px-1 text-sm font-semibold text-white/80">En çok iptal edilen ürünler</h3>
            <div className="overflow-x-auto">
              {data.topProducts.length > 0 ? (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/10">
                      <Th>Ürün</Th>
                      <Th right>İptal</Th>
                      <Th right>Adet</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topProducts.map((r) => (
                      <tr key={r.productId} className="border-b border-white/[0.04]">
                        <Td>{r.title}</Td>
                        <Td right>{r.count}</Td>
                        <Td right>{r.quantity}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="px-1 py-6 text-sm text-white/40">Veri yok.</p>
              )}
            </div>
          </div>
        </SurfaceCard>
      </div>
    </div>
  );
}

/** İptal raporu boyut (ödeme/kargo) kırılım kartı — key/label/count/revenue. */
function DimensionBreakdownCard({
  title,
  rows,
  currency,
}: {
  title: string;
  rows: CancellationReportResponse["data"]["paymentMethodBreakdown"];
  currency: string;
}) {
  return (
    <SurfaceCard>
      <div className="p-3">
        <h3 className="mb-2 px-1 text-sm font-semibold text-white/80">{title}</h3>
        <div className="overflow-x-auto">
          {rows.length > 0 ? (
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <Th>{title}</Th>
                  <Th right>Adet</Th>
                  <Th right>Ciro</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-b border-white/[0.04]">
                    <Td>{r.label}</Td>
                    <Td right>{r.count}</Td>
                    <Td right>{money(r.revenueMinor, currency)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="px-1 py-6 text-sm text-white/40">Veri yok.</p>
          )}
        </div>
      </div>
    </SurfaceCard>
  );
}

export default function FinanceReportsPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-16"><Spinner label="Yükleniyor…" /></div>}>
      <ReportsInner />
    </Suspense>
  );
}
