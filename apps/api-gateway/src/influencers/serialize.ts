/**
 * Granüler analytics (ADR-174/176) — data katmanı ScopedTotals → contract DTO
 * dönüşümü. Para birimi başına AYRI toplam; üst-seviye sayılar birincil (en yüksek
 * net gelirli) currency'i taşır, `revenues[]` tam dağılımı verir (sessiz cross-currency
 * toplam yok). conversionRate = orders / uniqueVisitors; AOV currency başına gross/orders.
 */
import type {
  AttributionCampaignRow,
  AttributionCurrencyRevenue,
  AttributionDailyPoint,
  AttributionKpiSummary,
  AttributionLinkRow,
  AttributionRecentOrder,
  AttributionUtmBreakdown,
  AttributionMetricBody,
  InfluencerCampaignStatus,
  TrackingLinkStatus,
  TrackingLinkTargetType,
} from "@commerce-os/contracts";
import type {
  CampaignRowData,
  DailyPoint,
  LinkRowData,
  RecentOrderRow,
  ScopedCurrencyRevenue,
  ScopedTotals,
  UtmBreakdownRow,
} from "./analytics.js";

interface DerivedRevenue {
  revenues: AttributionCurrencyRevenue[];
  primary: AttributionCurrencyRevenue | null;
  totalOrders: number;
  hasMultipleCurrencies: boolean;
}

function deriveRevenue(perCurrency: ScopedCurrencyRevenue[]): DerivedRevenue {
  const revenues: AttributionCurrencyRevenue[] = perCurrency
    .map((r) => ({
      currency: r.currency,
      attributedOrders: r.orders,
      grossRevenueMinor: r.grossMinor,
      refundedRevenueMinor: r.refundedMinor,
      netRevenueMinor: r.netMinor,
      averageOrderValueMinor: r.orders > 0 ? Math.round(r.grossMinor / r.orders) : 0,
    }))
    .sort((a, b) => b.netRevenueMinor - a.netRevenueMinor);
  return {
    revenues,
    primary: revenues[0] ?? null,
    totalOrders: revenues.reduce((sum, r) => sum + r.attributedOrders, 0),
    hasMultipleCurrencies: revenues.length > 1,
  };
}

function conversionRate(orders: number, unique: number): number {
  return unique > 0 ? orders / unique : 0;
}

export function buildKpiSummary(totals: ScopedTotals, fallbackCurrency = "TRY"): AttributionKpiSummary {
  const d = deriveRevenue(totals.perCurrency);
  return {
    totalClicks: totals.clicks,
    uniqueVisitors: totals.uniqueVisitors,
    attributedOrders: d.totalOrders,
    conversionRate: conversionRate(d.totalOrders, totals.uniqueVisitors),
    grossRevenueMinor: d.primary?.grossRevenueMinor ?? 0,
    refundedRevenueMinor: d.primary?.refundedRevenueMinor ?? 0,
    netRevenueMinor: d.primary?.netRevenueMinor ?? 0,
    averageOrderValueMinor: d.primary?.averageOrderValueMinor ?? 0,
    currency: d.primary?.currency ?? fallbackCurrency,
    revenues: d.revenues,
    hasMultipleCurrencies: d.hasMultipleCurrencies,
  };
}

export function buildMetricBody(totals: ScopedTotals, fallbackCurrency = "TRY"): AttributionMetricBody {
  const d = deriveRevenue(totals.perCurrency);
  return {
    clicks: totals.clicks,
    uniqueVisitors: totals.uniqueVisitors,
    attributedOrders: d.totalOrders,
    conversionRate: conversionRate(d.totalOrders, totals.uniqueVisitors),
    grossRevenueMinor: d.primary?.grossRevenueMinor ?? 0,
    refundedRevenueMinor: d.primary?.refundedRevenueMinor ?? 0,
    netRevenueMinor: d.primary?.netRevenueMinor ?? 0,
    averageOrderValueMinor: d.primary?.averageOrderValueMinor ?? 0,
    currency: d.primary?.currency ?? fallbackCurrency,
    revenues: d.revenues,
    hasMultipleCurrencies: d.hasMultipleCurrencies,
  };
}

export function serializeDaily(rows: DailyPoint[]): AttributionDailyPoint[] {
  return rows.map((r) => {
    const revenues = r.perCurrency
      .map((c) => ({ currency: c.currency, grossRevenueMinor: c.grossMinor, netRevenueMinor: c.netMinor }))
      .sort((a, b) => b.netRevenueMinor - a.netRevenueMinor);
    const primary = revenues[0];
    return {
      date: r.date,
      clicks: r.clicks,
      uniqueVisitors: r.uniqueVisitors,
      orders: r.orders,
      conversionRate: conversionRate(r.orders, r.uniqueVisitors),
      grossRevenueMinor: primary?.grossRevenueMinor ?? 0,
      netRevenueMinor: primary?.netRevenueMinor ?? 0,
      revenues,
    };
  });
}

export function serializeCampaignRow(r: CampaignRowData): AttributionCampaignRow {
  return {
    ...buildMetricBody({ clicks: r.clicks, uniqueVisitors: r.uniqueVisitors, perCurrency: r.perCurrency }),
    campaignId: r.campaignId,
    campaignName: r.campaignName,
    influencerId: r.influencerId,
    influencerName: r.influencerName,
    status: r.status as InfluencerCampaignStatus,
    startsAt: r.startsAt ? r.startsAt.toISOString() : null,
    endsAt: r.endsAt ? r.endsAt.toISOString() : null,
    attributionWindowDays: r.attributionWindowDays,
    linkCount: r.linkCount,
  };
}

export function serializeLinkRow(r: LinkRowData): AttributionLinkRow {
  return {
    ...buildMetricBody({ clicks: r.clicks, uniqueVisitors: r.uniqueVisitors, perCurrency: r.perCurrency }),
    trackingLinkId: r.trackingLinkId,
    campaignId: r.campaignId,
    campaignName: r.campaignName,
    targetType: r.targetType as TrackingLinkTargetType,
    targetPath: r.targetPath,
    productTitle: r.productTitle,
    categoryTitle: r.categoryTitle,
    status: r.status as TrackingLinkStatus,
    createdAt: r.createdAt.toISOString(),
    activatedAt: r.activatedAt ? r.activatedAt.toISOString() : null,
    pausedAt: r.pausedAt ? r.pausedAt.toISOString() : null,
    revokedAt: r.revokedAt ? r.revokedAt.toISOString() : null,
    utmSource: r.utmSource,
    utmMedium: r.utmMedium,
    utmCampaign: r.utmCampaign,
    utmContent: r.utmContent,
    utmTerm: r.utmTerm,
    customLabel: r.customLabel,
    attributionWindowDays: r.attributionWindowDays,
  };
}

export function serializeUtm(rows: UtmBreakdownRow[]): AttributionUtmBreakdown[] {
  return rows.map((r) => {
    const d = deriveRevenue(r.perCurrency);
    return {
      utmSource: r.utmSource,
      utmMedium: r.utmMedium,
      utmCampaign: r.utmCampaign,
      utmContent: r.utmContent,
      utmTerm: r.utmTerm,
      customLabel: r.customLabel,
      clicks: r.clicks,
      uniqueVisitors: r.uniqueVisitors,
      attributedOrders: d.totalOrders,
      conversionRate: conversionRate(d.totalOrders, r.uniqueVisitors),
      revenues: d.revenues,
      hasMultipleCurrencies: d.hasMultipleCurrencies,
    };
  });
}

export function serializeRecentOrders(rows: RecentOrderRow[]): AttributionRecentOrder[] {
  return rows.map((r) => ({
    orderNumber: r.orderNumber,
    attributedAt: r.attributedAt.toISOString(),
    targetPath: r.targetPath,
    netRevenueMinor: r.netMinor,
    currency: r.currency,
  }));
}
