"use client";

/**
 * TODO-160 — Atıf analitiği paylaşılan sunum yardımcıları. Influencer listesi ve
 * influencer detayı aynı KPI şeridini kullanır. Para tam sayı minor birimdedir;
 * gösterimde 100'e bölünür. conversionRate 0..1 aralığındadır; yüzdeye çevrilir.
 */

import type { AttributionKpiSummary } from "@commerce-os/api-client";
import { MetricGrid, MetricTile } from "../../components/premium";

type Locale = "tr" | "en";

/** Minor (kuruş) → yerel para birimi metni. */
export function formatMoneyMinor(minor: number, currency: string, locale: Locale): string {
  return (minor / 100).toLocaleString(locale === "tr" ? "tr-TR" : "en-US", {
    style: "currency",
    currency: currency || "TRY",
  });
}

/** 0..1 oranı → yüzde metni (1 ondalık). */
export function formatRate(rate: number, locale: Locale): string {
  return `${(rate * 100).toLocaleString(locale === "tr" ? "tr-TR" : "en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

/** ISO tarih (bugünden gün farkı) — varsayılan son N gün aralığı için. */
export function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

export function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface AttributionLabels {
  totalClicks: string;
  uniqueVisitors: string;
  attributedOrders: string;
  conversionRate: string;
  grossRevenue: string;
  netRevenue: string;
}

/** KPI özetini kompakt metrik şeridi olarak gösterir. */
export function AttributionMetrics({
  summary,
  labels,
  locale,
}: {
  summary: AttributionKpiSummary;
  labels: AttributionLabels;
  locale: Locale;
}) {
  const money = (minor: number) => formatMoneyMinor(minor, summary.currency, locale);
  return (
    <MetricGrid columns={3}>
      <MetricTile
        label={labels.totalClicks}
        value={summary.totalClicks.toLocaleString(locale === "tr" ? "tr-TR" : "en-US")}
        tone="brand"
      />
      <MetricTile
        label={labels.uniqueVisitors}
        value={summary.uniqueVisitors.toLocaleString(locale === "tr" ? "tr-TR" : "en-US")}
      />
      <MetricTile
        label={labels.attributedOrders}
        value={summary.attributedOrders.toLocaleString(locale === "tr" ? "tr-TR" : "en-US")}
        tone="success"
      />
      <MetricTile
        label={labels.conversionRate}
        value={formatRate(summary.conversionRate, locale)}
      />
      <MetricTile label={labels.grossRevenue} value={money(summary.grossRevenueMinor)} />
      <MetricTile label={labels.netRevenue} value={money(summary.netRevenueMinor)} tone="success" />
    </MetricGrid>
  );
}
