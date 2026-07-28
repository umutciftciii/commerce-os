"use client";

/**
 * Kampanya detay dashboard (ADR-174 B seviyesi). Yalnız SEÇİLİ kampanyanın verisi:
 * KPI özeti + link bazlı tablo + UTM kırılımı + son atıflı siparişler. Influencer
 * toplamı ile KARIŞMAZ (server campaignId scope'u). Para minor; oran 0..1 → yüzde.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Alert, Badge, SkeletonRows, useLocale } from "../../../../../../components/ui";
import type { CampaignAnalyticsResponse } from "@commerce-os/api-client";
import { storeApi } from "../../../../../../lib/client/api";
import { messageForError } from "../../../../../../lib/client/messages";
import { formatDate } from "../../../../../../lib/client/format";
import { DetailHero, SurfaceCard } from "../../../../../components/premium";
import { AttributionMetrics, formatMoneyMinor, formatRate, type AttributionLabels } from "../../../attribution";
import { AnalyticsChart, type ChartLabels } from "../../../analytics-chart";
import { DateRangePicker, type DateRangeValue, type RangeLabels } from "../../../date-range-picker";

type Locale = "tr" | "en";
type Tone = "neutral" | "success" | "warning" | "info" | "danger";

const CAMPAIGN_TONES: Record<string, Tone> = {
  DRAFT: "info",
  ACTIVE: "success",
  PAUSED: "warning",
  ENDED: "neutral",
  CANCELLED: "danger",
  ARCHIVED: "neutral",
};
const LINK_TONES: Record<string, Tone> = { ACTIVE: "success", PAUSED: "warning", REVOKED: "danger", INACTIVE: "neutral" };

const L = {
  tr: {
    back: "Influencer detayı",
    eyebrow: "Kampanya analizi",
    loadError: "Kampanya analizi yüklenemedi.",
    metricsTitle: "Kampanya özeti",
    metricsDescription: "Yalnız bu kampanyanın performansı.",
    timeSeriesTitle: "Günlük analytics",
    linkFilterAll: "Tüm linkler",
    window: "Atıf penceresi (gün)",
    chart: { clicks: "Tıklama", uniqueVisitors: "Tekil", orders: "Sipariş", revenue: "Net ciro", empty: "Bu aralıkta veri yok." } satisfies ChartLabels,
    range: { last7: "7 gün", last30: "30 gün", last90: "90 gün", custom: "Özel", from: "Başlangıç", to: "Bitiş", apply: "Uygula" } satisfies RangeLabels,
    linksTitle: "Link bazlı performans",
    linksEmpty: "Bu kampanyada link yok.",
    utmTitle: "UTM kırılımı",
    utmEmpty: "UTM verisi yok.",
    ordersTitle: "Son atıflı siparişler",
    ordersEmpty: "Atıflı sipariş yok.",
    statusLabels: { DRAFT: "Taslak", ACTIVE: "Aktif", PAUSED: "Duraklatıldı", ENDED: "Sona erdi", CANCELLED: "İptal edildi", ARCHIVED: "Arşivlendi" } as Record<string, string>,
    linkStatusLabels: { ACTIVE: "Aktif", PAUSED: "Duraklatıldı", REVOKED: "İptal edildi", INACTIVE: "Pasif" } as Record<string, string>,
    colTarget: "Hedef",
    colClicks: "Tıklama",
    colVisitors: "Tekil",
    colOrders: "Sipariş",
    colConversion: "Dönüşüm",
    colRevenue: "Net ciro",
    colOrder: "Sipariş",
    colDate: "Tarih",
    colSource: "Source",
    colMedium: "Medium",
    colCampaign: "Campaign",
    colLabel: "Etiket",
    multiCurrency: "Çok para birimli — her biri ayrı gösterilir.",
    openLink: "Link analizi",
    metrics: {
      totalClicks: "Toplam tıklama",
      uniqueVisitors: "Tekil ziyaretçi",
      attributedOrders: "Atıflı sipariş",
      conversionRate: "Dönüşüm oranı",
      grossRevenue: "Brüt ciro",
      netRevenue: "Net ciro",
    } satisfies AttributionLabels,
  },
  en: {
    back: "Influencer detail",
    eyebrow: "Campaign analytics",
    loadError: "Could not load campaign analytics.",
    metricsTitle: "Campaign summary",
    metricsDescription: "Performance for this campaign only.",
    timeSeriesTitle: "Daily analytics",
    linkFilterAll: "All links",
    window: "Attribution window (days)",
    chart: { clicks: "Clicks", uniqueVisitors: "Unique", orders: "Orders", revenue: "Net revenue", empty: "No data in this range." } satisfies ChartLabels,
    range: { last7: "7 days", last30: "30 days", last90: "90 days", custom: "Custom", from: "From", to: "To", apply: "Apply" } satisfies RangeLabels,
    linksTitle: "Per-link performance",
    linksEmpty: "No links in this campaign.",
    utmTitle: "UTM breakdown",
    utmEmpty: "No UTM data.",
    ordersTitle: "Recent attributed orders",
    ordersEmpty: "No attributed orders.",
    statusLabels: { DRAFT: "Draft", ACTIVE: "Active", PAUSED: "Paused", ENDED: "Ended", CANCELLED: "Cancelled", ARCHIVED: "Archived" } as Record<string, string>,
    linkStatusLabels: { ACTIVE: "Active", PAUSED: "Paused", REVOKED: "Revoked", INACTIVE: "Inactive" } as Record<string, string>,
    colTarget: "Target",
    colClicks: "Clicks",
    colVisitors: "Unique",
    colOrders: "Orders",
    colConversion: "Conversion",
    colRevenue: "Net revenue",
    colOrder: "Order",
    colDate: "Date",
    colSource: "Source",
    colMedium: "Medium",
    colCampaign: "Campaign",
    colLabel: "Label",
    multiCurrency: "Multiple currencies — shown separately.",
    openLink: "Link analytics",
    metrics: {
      totalClicks: "Total clicks",
      uniqueVisitors: "Unique visitors",
      attributedOrders: "Attributed orders",
      conversionRate: "Conversion rate",
      grossRevenue: "Gross revenue",
      netRevenue: "Net revenue",
    } satisfies AttributionLabels,
  },
} satisfies Record<Locale, unknown>;

export default function CampaignAnalyticsPage() {
  const params = useParams<{ id: string; campaignId: string }>();
  const influencerId = params.id;
  const campaignId = params.campaignId;
  const locale = useLocale() as Locale;
  const t = L[locale] ?? L.tr;

  const [data, setData] = useState<CampaignAnalyticsResponse["data"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<DateRangeValue>({});
  // Yalnız günlük seriyi daraltan link filtresi (özet/link/UTM tablosu etkilenmez).
  const [linkFilter, setLinkFilter] = useState<string>("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const query: Record<string, string> = {};
      if (range.dateFrom) query.dateFrom = range.dateFrom;
      if (range.dateTo) query.dateTo = range.dateTo;
      if (linkFilter) query.trackingLinkId = linkFilter;
      const result = await storeApi.getCampaignAnalytics(campaignId, query);
      setData(result.data);
    } catch (cause) {
      setError(messageForError(cause, locale));
    }
  }, [campaignId, locale, range, linkFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <Alert tone="error">{error}</Alert>;
  if (!data) return <SkeletonRows rows={6} />;

  const c = data.campaign;
  const money = (minor: number, currency: string) => formatMoneyMinor(minor, currency, locale);
  const num = (v: number) => v.toLocaleString(locale === "tr" ? "tr-TR" : "en-US");

  return (
    <div className="space-y-5">
      <DetailHero
        backHref={`/influencers/${influencerId}`}
        backLabel={t.back}
        eyebrow={t.eyebrow}
        title={c.campaignName}
        subtitle={
          <span className="text-white/60">
            {c.influencerName} · {t.window}: {c.attributionWindowDays}
            {c.startsAt ? ` · ${formatDate(c.startsAt)}` : ""}
            {c.endsAt ? ` → ${formatDate(c.endsAt)}` : ""}
          </span>
        }
        badges={<Badge tone={CAMPAIGN_TONES[c.status] ?? "neutral"}>{t.statusLabels[c.status] ?? c.status}</Badge>}
      />

      <SurfaceCard title={t.metricsTitle} description={t.metricsDescription}>
        <AttributionMetrics summary={data.summary} labels={t.metrics} locale={locale} />
        {data.summary.hasMultipleCurrencies ? (
          <p className="mt-3 text-xs text-amber-300/80">
            {t.multiCurrency}{" "}
            {data.summary.revenues.map((r) => money(r.netRevenueMinor, r.currency)).join(" · ")}
          </p>
        ) : null}
      </SurfaceCard>

      <SurfaceCard title={t.timeSeriesTitle}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <DateRangePicker labels={t.range} onChange={setRange} />
          {data.links.length > 0 ? (
            <select
              value={linkFilter}
              onChange={(e) => setLinkFilter(e.target.value)}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/80"
              aria-label={t.linkFilterAll}
            >
              <option value="">{t.linkFilterAll}</option>
              {data.links.map((l) => (
                <option key={l.trackingLinkId} value={l.trackingLinkId}>
                  {l.customLabel || l.targetPath}
                </option>
              ))}
            </select>
          ) : null}
        </div>
        <AnalyticsChart daily={data.daily} locale={locale} labels={t.chart} />
      </SurfaceCard>

      <SurfaceCard title={t.linksTitle}>
        {data.links.length === 0 ? (
          <p className="text-sm text-white/50">{t.linksEmpty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-white/40">
                  <th className="py-2 pr-3">{t.colTarget}</th>
                  <th className="py-2 pr-3 text-right">{t.colClicks}</th>
                  <th className="py-2 pr-3 text-right">{t.colVisitors}</th>
                  <th className="py-2 pr-3 text-right">{t.colOrders}</th>
                  <th className="py-2 pr-3 text-right">{t.colConversion}</th>
                  <th className="py-2 pr-3 text-right">{t.colRevenue}</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {data.links.map((l) => (
                  <tr key={l.trackingLinkId} className="border-t border-white/[0.05]">
                    <td className="py-2 pr-3">
                      <span className="font-mono text-white/85">{l.targetPath}</span>
                      <span className="ml-2">
                        <Badge tone={LINK_TONES[l.status] ?? "neutral"}>{t.linkStatusLabels[l.status] ?? l.status}</Badge>
                      </span>
                      {l.utmSource || l.utmMedium || l.utmCampaign ? (
                        <p className="mt-0.5 text-[11px] text-white/40">
                          {[l.utmSource, l.utmMedium, l.utmCampaign, l.utmContent, l.utmTerm].filter(Boolean).join(" / ")}
                        </p>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-white/75">{num(l.clicks)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-white/75">{num(l.uniqueVisitors)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-white/75">{num(l.attributedOrders)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-white/75">{formatRate(l.conversionRate, locale)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-white/85">
                      {l.hasMultipleCurrencies
                        ? l.revenues.map((r) => money(r.netRevenueMinor, r.currency)).join(" · ")
                        : money(l.netRevenueMinor, l.currency)}
                    </td>
                    <td className="py-2 text-right">
                      <Link
                        href={`/influencers/${influencerId}/campaigns/${campaignId}/links/${l.trackingLinkId}`}
                        className="text-xs text-brand-300 hover:underline"
                      >
                        {t.openLink}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SurfaceCard>

      <SurfaceCard title={t.utmTitle}>
        {data.utm.length === 0 ? (
          <p className="text-sm text-white/50">{t.utmEmpty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-white/40">
                  <th className="py-2 pr-3">{t.colSource}</th>
                  <th className="py-2 pr-3">{t.colMedium}</th>
                  <th className="py-2 pr-3">{t.colCampaign}</th>
                  <th className="py-2 pr-3">{t.colLabel}</th>
                  <th className="py-2 pr-3 text-right">{t.colClicks}</th>
                  <th className="py-2 pr-3 text-right">{t.colVisitors}</th>
                  <th className="py-2 pr-3 text-right">{t.colOrders}</th>
                  <th className="py-2 pr-3 text-right">{t.colConversion}</th>
                  <th className="py-2 text-right">{t.colRevenue}</th>
                </tr>
              </thead>
              <tbody>
                {data.utm.map((u, i) => (
                  <tr key={i} className="border-t border-white/[0.05]">
                    <td className="py-2 pr-3 text-white/75">{u.utmSource ?? "—"}</td>
                    <td className="py-2 pr-3 text-white/75">{u.utmMedium ?? "—"}</td>
                    <td className="py-2 pr-3 text-white/75">{u.utmCampaign ?? "—"}</td>
                    <td className="py-2 pr-3 text-white/75">{u.customLabel ?? "—"}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-white/75">{num(u.clicks)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-white/75">{num(u.uniqueVisitors)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-white/75">{num(u.attributedOrders)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-white/75">{formatRate(u.conversionRate, locale)}</td>
                    <td className="py-2 text-right tabular-nums text-white/85">
                      {u.revenues.length === 0
                        ? "—"
                        : u.revenues.map((r) => money(r.netRevenueMinor, r.currency)).join(" · ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SurfaceCard>

      <SurfaceCard title={t.ordersTitle}>
        {data.recentOrders.length === 0 ? (
          <p className="text-sm text-white/50">{t.ordersEmpty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-white/40">
                  <th className="py-2 pr-3">{t.colOrder}</th>
                  <th className="py-2 pr-3">{t.colDate}</th>
                  <th className="py-2 text-right">{t.colRevenue}</th>
                </tr>
              </thead>
              <tbody>
                {data.recentOrders.map((o) => (
                  <tr key={o.orderNumber} className="border-t border-white/[0.05]">
                    <td className="py-2 pr-3 font-mono text-white/85">{o.orderNumber}</td>
                    <td className="py-2 pr-3 text-white/60">{formatDate(o.attributedAt)}</td>
                    <td className="py-2 text-right tabular-nums text-white/85">{money(o.netRevenueMinor, o.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SurfaceCard>
    </div>
  );
}
