/**
 * Influencer Campaign Lifecycle & Granular Analytics (ADR-174/176) — 3-seviyeli
 * dashboard veri katmanı. SUNUCU-taraflı toplulaştırma (N+1 YOK): her seviye için
 * GROUP BY sorguları tek seferde çalışır. Para birimi başına AYRI toplam (ADR-176):
 * gelir yalnız aynı currency içinde toplanır; cross-currency sessiz toplanmaz.
 *
 * clicks/uniqueVisitors AttributionClick'ten (isBot=false); orders/revenue
 * OrderAttribution'dan. Tenant izolasyonu: her where storeId ile başlar.
 */
import { Prisma } from "@prisma/client";
import type { PrismaLike } from "./data.js";

export interface AnalyticsScope {
  dateFrom?: Date;
  dateTo?: Date;
  influencerId?: string;
  campaignId?: string;
  trackingLinkId?: string;
  /** Çoklu link scope (utm/link filtresi linkId kümesine çözülür — ADR-179). */
  trackingLinkIds?: string[];
  /** Günlük seri gün sınırı için store timezone (ADR-178). */
  timezone?: string;
  /** Yalnız günlük seriyi daraltan filtreler (campaign dashboard — özet/link/utm etkilenmez). */
  filterTrackingLinkId?: string;
  filterUtmSource?: string;
  filterUtmMedium?: string;
  filterUtmCampaign?: string;
}

export interface ScopedCurrencyRevenue {
  currency: string;
  orders: number;
  grossMinor: number;
  refundedMinor: number;
  netMinor: number;
}

export interface ScopedTotals {
  clicks: number;
  uniqueVisitors: number;
  perCurrency: ScopedCurrencyRevenue[];
}

export interface DailyCurrencyRevenue {
  currency: string;
  grossMinor: number;
  netMinor: number;
}

export interface DailyPoint {
  date: string;
  clicks: number;
  uniqueVisitors: number;
  orders: number;
  perCurrency: DailyCurrencyRevenue[];
}

export interface CampaignRowData extends ScopedTotals {
  campaignId: string;
  campaignName: string;
  influencerId: string;
  influencerName: string;
  status: string;
  startsAt: Date | null;
  endsAt: Date | null;
  attributionWindowDays: number;
  linkCount: number;
}

export interface LinkRowData extends ScopedTotals {
  trackingLinkId: string;
  campaignId: string;
  campaignName: string;
  targetType: string;
  targetPath: string;
  productTitle: string | null;
  categoryTitle: string | null;
  status: string;
  createdAt: Date;
  activatedAt: Date | null;
  pausedAt: Date | null;
  revokedAt: Date | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  customLabel: string | null;
  attributionWindowDays: number;
}

export interface UtmBreakdownRow {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  customLabel: string | null;
  clicks: number;
  uniqueVisitors: number;
  perCurrency: ScopedCurrencyRevenue[];
}

export interface RecentOrderRow {
  orderNumber: string;
  attributedAt: Date;
  targetPath: string | null;
  netMinor: number;
  currency: string;
}

export interface AggregateAnalyticsData {
  totals: ScopedTotals;
  campaignCount: number;
  activeCampaignCount: number;
  linkCount: number;
  campaigns: CampaignRowData[];
  daily: DailyPoint[];
}

export interface CampaignAnalyticsData {
  campaign: {
    campaignId: string;
    campaignName: string;
    influencerId: string;
    influencerName: string;
    status: string;
    startsAt: Date | null;
    endsAt: Date | null;
    attributionWindowDays: number;
    linkCount: number;
  } | null;
  totals: ScopedTotals;
  links: LinkRowData[];
  daily: DailyPoint[];
  utm: UtmBreakdownRow[];
  recentOrders: RecentOrderRow[];
}

export interface LinkAnalyticsData {
  link: LinkRowData | null;
  totals: ScopedTotals;
  daily: DailyPoint[];
  recentOrders: RecentOrderRow[];
  lastClickAt: Date | null;
  lastConversionAt: Date | null;
}

// ── Where builders (tenant + tarih + scope) ─────────────────────────────────
function clickWhere(storeId: string, s: AnalyticsScope): Prisma.Sql {
  const parts: Prisma.Sql[] = [Prisma.sql`c."storeId" = ${storeId}`, Prisma.sql`c."isBot" = false`];
  if (s.dateFrom) parts.push(Prisma.sql`c."createdAt" >= ${s.dateFrom}`);
  if (s.dateTo) parts.push(Prisma.sql`c."createdAt" < ${s.dateTo}`);
  if (s.campaignId) parts.push(Prisma.sql`c."campaignId" = ${s.campaignId}`);
  if (s.trackingLinkId) parts.push(Prisma.sql`c."trackingLinkId" = ${s.trackingLinkId}`);
  if (s.trackingLinkIds) parts.push(inClause(Prisma.sql`c."trackingLinkId"`, s.trackingLinkIds));
  if (s.influencerId) parts.push(Prisma.sql`cam."influencerId" = ${s.influencerId}`);
  return Prisma.join(parts, " AND ");
}

function attrWhere(storeId: string, s: AnalyticsScope): Prisma.Sql {
  const parts: Prisma.Sql[] = [Prisma.sql`a."storeId" = ${storeId}`];
  if (s.dateFrom) parts.push(Prisma.sql`a."attributedAt" >= ${s.dateFrom}`);
  if (s.dateTo) parts.push(Prisma.sql`a."attributedAt" < ${s.dateTo}`);
  if (s.campaignId) parts.push(Prisma.sql`a."campaignId" = ${s.campaignId}`);
  if (s.trackingLinkId) parts.push(Prisma.sql`a."trackingLinkId" = ${s.trackingLinkId}`);
  if (s.trackingLinkIds) parts.push(inClause(Prisma.sql`a."trackingLinkId"`, s.trackingLinkIds));
  if (s.influencerId) parts.push(Prisma.sql`a."influencerId" = ${s.influencerId}`);
  return Prisma.join(parts, " AND ");
}

/** `col IN (...)` — boş liste → hiçbir satır (FALSE). */
function inClause(col: Prisma.Sql, ids: string[]): Prisma.Sql {
  if (ids.length === 0) return Prisma.sql`FALSE`;
  return Prisma.sql`${col} IN (${Prisma.join(ids.map((v) => Prisma.sql`${v}`), ", ")})`;
}

function num(value: bigint | number | null): number {
  return value == null ? 0 : typeof value === "bigint" ? Number(value) : value;
}

/** tz-yerel gün bucket ifadesi: UTC saklanan sütunu store tz gününe çevirir (ADR-178). */
function dayBucket(col: Prisma.Sql, timezone: string): Prisma.Sql {
  return Prisma.sql`to_char(date_trunc('day', (${col} AT TIME ZONE 'UTC') AT TIME ZONE ${timezone}), 'YYYY-MM-DD')`;
}

// ── Scope toplamları (clicks + unique + per-currency gelir) ──────────────────
async function queryScopedTotals(db: PrismaLike, storeId: string, s: AnalyticsScope): Promise<ScopedTotals> {
  const cw = clickWhere(storeId, s);
  const aw = attrWhere(storeId, s);
  const [clickRow, revenueRows] = await Promise.all([
    db.$queryRaw<{ clicks: bigint; uniques: bigint }[]>(
      Prisma.sql`SELECT COUNT(*)::bigint AS clicks, COUNT(DISTINCT c."visitorIdHash")::bigint AS uniques
        FROM "AttributionClick" c JOIN "InfluencerCampaign" cam ON cam."id" = c."campaignId" WHERE ${cw}`,
    ),
    db.$queryRaw<{ currency: string; orders: bigint; gross: bigint; refunded: bigint; net: bigint }[]>(
      Prisma.sql`SELECT a."currency", COUNT(*)::bigint AS orders,
        COALESCE(SUM(a."grossRevenueMinor"),0)::bigint AS gross,
        COALESCE(SUM(a."refundedRevenueMinor"),0)::bigint AS refunded,
        COALESCE(SUM(a."netRevenueMinor"),0)::bigint AS net
        FROM "OrderAttribution" a WHERE ${aw} GROUP BY a."currency" ORDER BY net DESC`,
    ),
  ]);
  const c = clickRow[0] ?? { clicks: 0n, uniques: 0n };
  return {
    clicks: num(c.clicks),
    uniqueVisitors: num(c.uniques),
    perCurrency: revenueRows.map((r) => ({
      currency: r.currency,
      orders: num(r.orders),
      grossMinor: num(r.gross),
      refundedMinor: num(r.refunded),
      netMinor: num(r.net),
    })),
  };
}

async function queryDaily(db: PrismaLike, storeId: string, s: AnalyticsScope, dayStrings: string[]): Promise<DailyPoint[]> {
  const tz = s.timezone || "Europe/Istanbul";
  const cw = clickWhere(storeId, s);
  const aw = attrWhere(storeId, s);
  const [dailyClicks, dailyOrders] = await Promise.all([
    db.$queryRaw<{ day: string; clicks: bigint; uniques: bigint }[]>(
      Prisma.sql`SELECT ${dayBucket(Prisma.sql`c."createdAt"`, tz)} AS day,
        COUNT(*)::bigint AS clicks, COUNT(DISTINCT c."visitorIdHash")::bigint AS uniques
        FROM "AttributionClick" c JOIN "InfluencerCampaign" cam ON cam."id" = c."campaignId"
        WHERE ${cw} GROUP BY 1`,
    ),
    // Gün + currency: cross-currency SESSİZ TOPLANMAZ (ADR-176/179).
    db.$queryRaw<{ day: string; currency: string; orders: bigint; gross: bigint; net: bigint }[]>(
      Prisma.sql`SELECT ${dayBucket(Prisma.sql`a."attributedAt"`, tz)} AS day, a."currency",
        COUNT(*)::bigint AS orders, COALESCE(SUM(a."grossRevenueMinor"),0)::bigint AS gross,
        COALESCE(SUM(a."netRevenueMinor"),0)::bigint AS net
        FROM "OrderAttribution" a WHERE ${aw} GROUP BY 1, a."currency"`,
    ),
  ]);
  const clicksByDay = new Map(dailyClicks.map((d) => [d.day, d]));
  const ordersByDay = new Map<string, { orders: number; perCurrency: DailyCurrencyRevenue[] }>();
  for (const r of dailyOrders) {
    const entry = ordersByDay.get(r.day) ?? { orders: 0, perCurrency: [] };
    entry.orders += num(r.orders);
    entry.perCurrency.push({ currency: r.currency, grossMinor: num(r.gross), netMinor: num(r.net) });
    ordersByDay.set(r.day, entry);
  }
  // Zero-fill: aralıktaki HER gün (veri yoksa sıfır). dayStrings boşsa veriye düş.
  const days = dayStrings.length > 0 ? dayStrings : Array.from(new Set([...clicksByDay.keys(), ...ordersByDay.keys()])).sort();
  return days.map((day) => {
    const c = clicksByDay.get(day);
    const o = ordersByDay.get(day);
    return {
      date: day,
      clicks: c ? num(c.clicks) : 0,
      uniqueVisitors: c ? num(c.uniques) : 0,
      orders: o ? o.orders : 0,
      perCurrency: (o?.perCurrency ?? []).sort((a, b) => b.netMinor - a.netMinor),
    };
  });
}

async function queryRecentOrders(db: PrismaLike, storeId: string, s: AnalyticsScope, limit: number): Promise<RecentOrderRow[]> {
  const aw = attrWhere(storeId, s);
  const rows = await db.$queryRaw<{ orderNumber: string; attributedAt: Date; targetPath: string | null; net: bigint; currency: string }[]>(
    Prisma.sql`SELECT o."orderNumber", a."attributedAt", (a."snapshot"->>'targetPath') AS "targetPath",
      a."netRevenueMinor"::bigint AS net, a."currency"
      FROM "OrderAttribution" a JOIN "Order" o ON o."id" = a."orderId"
      WHERE ${aw} ORDER BY a."attributedAt" DESC LIMIT ${limit}`,
  );
  return rows.map((r) => ({
    orderNumber: r.orderNumber,
    attributedAt: r.attributedAt,
    targetPath: r.targetPath,
    netMinor: num(r.net),
    currency: r.currency,
  }));
}

// ── A. Influencer toplamı + kampanya satırları ──────────────────────────────
export async function getAggregateAnalyticsImpl(
  db: PrismaLike,
  storeId: string,
  influencerId: string,
  s: AnalyticsScope,
  dayStrings: string[],
): Promise<AggregateAnalyticsData> {
  const scope: AnalyticsScope = { ...s, influencerId };
  const cw = clickWhere(storeId, scope);
  const aw = attrWhere(storeId, scope);

  const [totals, daily, campaignMeta, clicksByCampaign, uniqByCampaign, revByCampaign, linkCountRow] = await Promise.all([
    queryScopedTotals(db, storeId, scope),
    queryDaily(db, storeId, scope, dayStrings),
    db.influencerCampaign.findMany({
      where: { storeId, influencerId },
      select: { id: true, name: true, status: true, startsAt: true, endsAt: true, attributionWindowDays: true, _count: { select: { trackingLinks: true } }, influencer: { select: { name: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    }),
    db.$queryRaw<{ campaignId: string; clicks: bigint }[]>(
      Prisma.sql`SELECT c."campaignId", COUNT(*)::bigint AS clicks
        FROM "AttributionClick" c JOIN "InfluencerCampaign" cam ON cam."id" = c."campaignId"
        WHERE ${cw} GROUP BY c."campaignId"`,
    ),
    db.$queryRaw<{ campaignId: string; uniques: bigint }[]>(
      Prisma.sql`SELECT c."campaignId", COUNT(DISTINCT c."visitorIdHash")::bigint AS uniques
        FROM "AttributionClick" c JOIN "InfluencerCampaign" cam ON cam."id" = c."campaignId"
        WHERE ${cw} GROUP BY c."campaignId"`,
    ),
    db.$queryRaw<{ campaignId: string; currency: string; orders: bigint; gross: bigint; refunded: bigint; net: bigint }[]>(
      Prisma.sql`SELECT a."campaignId", a."currency", COUNT(*)::bigint AS orders,
        COALESCE(SUM(a."grossRevenueMinor"),0)::bigint AS gross,
        COALESCE(SUM(a."refundedRevenueMinor"),0)::bigint AS refunded,
        COALESCE(SUM(a."netRevenueMinor"),0)::bigint AS net
        FROM "OrderAttribution" a WHERE ${aw} GROUP BY a."campaignId", a."currency"`,
    ),
    db.$queryRaw<{ count: bigint }[]>(
      Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "InfluencerTrackingLink" l
        JOIN "InfluencerCampaign" cam ON cam."id" = l."campaignId"
        WHERE l."storeId" = ${storeId} AND cam."influencerId" = ${influencerId}`,
    ),
  ]);

  const clicksMap = new Map(clicksByCampaign.map((r) => [r.campaignId, num(r.clicks)]));
  const uniqMap = new Map(uniqByCampaign.map((r) => [r.campaignId, num(r.uniques)]));
  const revMap = new Map<string, ScopedCurrencyRevenue[]>();
  for (const r of revByCampaign) {
    const arr = revMap.get(r.campaignId) ?? [];
    arr.push({ currency: r.currency, orders: num(r.orders), grossMinor: num(r.gross), refundedMinor: num(r.refunded), netMinor: num(r.net) });
    revMap.set(r.campaignId, arr);
  }

  const campaigns: CampaignRowData[] = campaignMeta.map((cm) => ({
    campaignId: cm.id,
    campaignName: cm.name,
    influencerId,
    influencerName: cm.influencer.name,
    status: cm.status,
    startsAt: cm.startsAt,
    endsAt: cm.endsAt,
    attributionWindowDays: cm.attributionWindowDays,
    linkCount: cm._count.trackingLinks,
    clicks: clicksMap.get(cm.id) ?? 0,
    uniqueVisitors: uniqMap.get(cm.id) ?? 0,
    perCurrency: (revMap.get(cm.id) ?? []).sort((a, b) => b.netMinor - a.netMinor),
  }));

  const activeCampaignCount = campaignMeta.filter((c) => c.status === "ACTIVE").length;

  return {
    totals,
    campaignCount: campaignMeta.length,
    activeCampaignCount,
    linkCount: num(linkCountRow[0]?.count ?? 0n),
    campaigns,
    daily,
  };
}

/**
 * Günlük seri link/UTM filtresini linkId kümesine çözer (ADR-179). Filtre yoksa null
 * (daralt­ma yok). UTM link'ten (immutable) eşlenir. Eşleşme yoksa boş dizi → seri sıfır.
 */
async function resolveDailyFilterLinkIds(
  db: PrismaLike,
  storeId: string,
  campaignId: string,
  s: AnalyticsScope,
): Promise<string[] | null> {
  const hasFilter = s.filterTrackingLinkId || s.filterUtmSource || s.filterUtmMedium || s.filterUtmCampaign;
  if (!hasFilter) return null;
  const rows = await db.influencerTrackingLink.findMany({
    where: {
      storeId,
      campaignId,
      ...(s.filterTrackingLinkId ? { id: s.filterTrackingLinkId } : {}),
      ...(s.filterUtmSource ? { utmSource: s.filterUtmSource } : {}),
      ...(s.filterUtmMedium ? { utmMedium: s.filterUtmMedium } : {}),
      ...(s.filterUtmCampaign ? { utmCampaign: s.filterUtmCampaign } : {}),
    },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

// ── B. Kampanya detayı + link satırları + UTM ───────────────────────────────
export async function getCampaignAnalyticsImpl(
  db: PrismaLike,
  storeId: string,
  campaignId: string,
  s: AnalyticsScope,
  dayStrings: string[],
): Promise<CampaignAnalyticsData> {
  const campaignMeta = await db.influencerCampaign.findFirst({
    where: { id: campaignId, storeId },
    select: {
      id: true, name: true, influencerId: true, status: true, startsAt: true, endsAt: true,
      attributionWindowDays: true, _count: { select: { trackingLinks: true } }, influencer: { select: { name: true } },
    },
  });
  if (!campaignMeta) {
    return { campaign: null, totals: { clicks: 0, uniqueVisitors: 0, perCurrency: [] }, links: [], daily: [], utm: [], recentOrders: [] };
  }
  // Özet/link/UTM/son sipariş: kampanya tam veri (tarih aralığında). Günlük seri AYRICA
  // link/UTM filtresiyle daraltılır (ADR-179) — filtre linkId kümesine çözülür.
  const scope: AnalyticsScope = { ...s, campaignId, filterTrackingLinkId: undefined, filterUtmSource: undefined, filterUtmMedium: undefined, filterUtmCampaign: undefined };
  const dailyLinkIds = await resolveDailyFilterLinkIds(db, storeId, campaignId, s);
  const dailyScope: AnalyticsScope = { ...scope, ...(dailyLinkIds ? { trackingLinkIds: dailyLinkIds } : {}) };
  const cw = clickWhere(storeId, scope);
  const aw = attrWhere(storeId, scope);

  const [totals, daily, recentOrders, linkMeta, clicksByLink, uniqByLink, revByLink, utmClicks, utmOrders] = await Promise.all([
    queryScopedTotals(db, storeId, scope),
    queryDaily(db, storeId, dailyScope, dayStrings),
    queryRecentOrders(db, storeId, scope, 20),
    db.influencerTrackingLink.findMany({
      where: { storeId, campaignId },
      select: {
        id: true, targetType: true, targetPath: true, status: true, createdAt: true, activatedAt: true, pausedAt: true,
        revokedAt: true, utmSource: true, utmMedium: true, utmCampaign: true, utmContent: true, utmTerm: true,
        customLabel: true, product: { select: { title: true } }, category: { select: { name: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    }),
    db.$queryRaw<{ trackingLinkId: string; clicks: bigint }[]>(
      Prisma.sql`SELECT c."trackingLinkId", COUNT(*)::bigint AS clicks FROM "AttributionClick" c WHERE ${cw} GROUP BY c."trackingLinkId"`,
    ),
    db.$queryRaw<{ trackingLinkId: string; uniques: bigint }[]>(
      Prisma.sql`SELECT c."trackingLinkId", COUNT(DISTINCT c."visitorIdHash")::bigint AS uniques FROM "AttributionClick" c WHERE ${cw} GROUP BY c."trackingLinkId"`,
    ),
    db.$queryRaw<{ trackingLinkId: string; currency: string; orders: bigint; gross: bigint; refunded: bigint; net: bigint }[]>(
      Prisma.sql`SELECT a."trackingLinkId", a."currency", COUNT(*)::bigint AS orders,
        COALESCE(SUM(a."grossRevenueMinor"),0)::bigint AS gross,
        COALESCE(SUM(a."refundedRevenueMinor"),0)::bigint AS refunded,
        COALESCE(SUM(a."netRevenueMinor"),0)::bigint AS net
        FROM "OrderAttribution" a WHERE ${aw} AND a."trackingLinkId" IS NOT NULL
        GROUP BY a."trackingLinkId", a."currency"`,
    ),
    // UTM clicks + unique (link'ten immutable UTM/customLabel'e göre grupla — ADR-175/179).
    db.$queryRaw<{ utmSource: string | null; utmMedium: string | null; utmCampaign: string | null; utmContent: string | null; utmTerm: string | null; customLabel: string | null; clicks: bigint; uniques: bigint }[]>(
      Prisma.sql`SELECT l."utmSource", l."utmMedium", l."utmCampaign", l."utmContent", l."utmTerm", l."customLabel",
        COUNT(c."id")::bigint AS clicks, COUNT(DISTINCT c."visitorIdHash")::bigint AS uniques
        FROM "AttributionClick" c JOIN "InfluencerTrackingLink" l ON l."id" = c."trackingLinkId"
        WHERE ${cw} AND l."campaignId" = ${campaignId}
        GROUP BY l."utmSource", l."utmMedium", l."utmCampaign", l."utmContent", l."utmTerm", l."customLabel"`,
    ),
    // UTM orders + gelir PARA BİRİMİ BAŞINA (cross-currency toplanmaz — ADR-176/179).
    db.$queryRaw<{ utmSource: string | null; utmMedium: string | null; utmCampaign: string | null; utmContent: string | null; utmTerm: string | null; customLabel: string | null; currency: string; orders: bigint; gross: bigint; refunded: bigint; net: bigint }[]>(
      Prisma.sql`SELECT l."utmSource", l."utmMedium", l."utmCampaign", l."utmContent", l."utmTerm", l."customLabel", a."currency",
        COUNT(*)::bigint AS orders, COALESCE(SUM(a."grossRevenueMinor"),0)::bigint AS gross,
        COALESCE(SUM(a."refundedRevenueMinor"),0)::bigint AS refunded, COALESCE(SUM(a."netRevenueMinor"),0)::bigint AS net
        FROM "OrderAttribution" a JOIN "InfluencerTrackingLink" l ON l."id" = a."trackingLinkId"
        WHERE ${aw} AND l."campaignId" = ${campaignId}
        GROUP BY l."utmSource", l."utmMedium", l."utmCampaign", l."utmContent", l."utmTerm", l."customLabel", a."currency"`,
    ),
  ]);

  const clicksMap = new Map(clicksByLink.map((r) => [r.trackingLinkId, num(r.clicks)]));
  const uniqMap = new Map(uniqByLink.map((r) => [r.trackingLinkId, num(r.uniques)]));
  const revMap = new Map<string, ScopedCurrencyRevenue[]>();
  for (const r of revByLink) {
    const arr = revMap.get(r.trackingLinkId) ?? [];
    arr.push({ currency: r.currency, orders: num(r.orders), grossMinor: num(r.gross), refundedMinor: num(r.refunded), netMinor: num(r.net) });
    revMap.set(r.trackingLinkId, arr);
  }

  const links: LinkRowData[] = linkMeta.map((lm) => ({
    trackingLinkId: lm.id,
    campaignId,
    campaignName: campaignMeta.name,
    targetType: lm.targetType,
    targetPath: lm.targetPath,
    productTitle: lm.product?.title ?? null,
    categoryTitle: lm.category?.name ?? null,
    status: lm.status,
    createdAt: lm.createdAt,
    activatedAt: lm.activatedAt,
    pausedAt: lm.pausedAt,
    revokedAt: lm.revokedAt,
    utmSource: lm.utmSource,
    utmMedium: lm.utmMedium,
    utmCampaign: lm.utmCampaign,
    utmContent: lm.utmContent,
    utmTerm: lm.utmTerm,
    customLabel: lm.customLabel,
    attributionWindowDays: campaignMeta.attributionWindowDays,
    clicks: clicksMap.get(lm.id) ?? 0,
    uniqueVisitors: uniqMap.get(lm.id) ?? 0,
    perCurrency: (revMap.get(lm.id) ?? []).sort((a, b) => b.netMinor - a.netMinor),
  }));

  // UTM kırılımı: clicks+unique ile orders+gelir(per-currency) UTM/customLabel anahtarında birleşir.
  const utmKey = (r: { utmSource: string | null; utmMedium: string | null; utmCampaign: string | null; utmContent: string | null; utmTerm: string | null; customLabel: string | null }) =>
    JSON.stringify([r.utmSource, r.utmMedium, r.utmCampaign, r.utmContent, r.utmTerm, r.customLabel]);
  const utmMap = new Map<string, UtmBreakdownRow>();
  const ensureUtm = (r: { utmSource: string | null; utmMedium: string | null; utmCampaign: string | null; utmContent: string | null; utmTerm: string | null; customLabel: string | null }): UtmBreakdownRow => {
    const key = utmKey(r);
    let row = utmMap.get(key);
    if (!row) {
      row = { utmSource: r.utmSource, utmMedium: r.utmMedium, utmCampaign: r.utmCampaign, utmContent: r.utmContent, utmTerm: r.utmTerm, customLabel: r.customLabel, clicks: 0, uniqueVisitors: 0, perCurrency: [] };
      utmMap.set(key, row);
    }
    return row;
  };
  for (const r of utmClicks) {
    const row = ensureUtm(r);
    row.clicks += num(r.clicks);
    row.uniqueVisitors += num(r.uniques);
  }
  for (const r of utmOrders) {
    const row = ensureUtm(r);
    row.perCurrency.push({ currency: r.currency, orders: num(r.orders), grossMinor: num(r.gross), refundedMinor: num(r.refunded), netMinor: num(r.net) });
  }
  const utm: UtmBreakdownRow[] = Array.from(utmMap.values())
    .map((r) => ({ ...r, perCurrency: r.perCurrency.sort((a, b) => b.netMinor - a.netMinor) }))
    .filter((r) => r.clicks > 0 || r.perCurrency.length > 0)
    .sort((a, b) => b.clicks - a.clicks);

  return {
    campaign: {
      campaignId: campaignMeta.id,
      campaignName: campaignMeta.name,
      influencerId: campaignMeta.influencerId,
      influencerName: campaignMeta.influencer.name,
      status: campaignMeta.status,
      startsAt: campaignMeta.startsAt,
      endsAt: campaignMeta.endsAt,
      attributionWindowDays: campaignMeta.attributionWindowDays,
      linkCount: campaignMeta._count.trackingLinks,
    },
    totals,
    links,
    daily,
    utm,
    recentOrders,
  };
}

// ── C. Link detayı ──────────────────────────────────────────────────────────
export async function getLinkAnalyticsImpl(
  db: PrismaLike,
  storeId: string,
  linkId: string,
  s: AnalyticsScope,
  dayStrings: string[],
): Promise<LinkAnalyticsData> {
  const linkMeta = await db.influencerTrackingLink.findFirst({
    where: { id: linkId, storeId },
    select: {
      id: true, campaignId: true, targetType: true, targetPath: true, status: true, createdAt: true, activatedAt: true,
      pausedAt: true, revokedAt: true, utmSource: true, utmMedium: true, utmCampaign: true, utmContent: true, utmTerm: true,
      customLabel: true, product: { select: { title: true } }, category: { select: { name: true } },
      campaign: { select: { name: true, attributionWindowDays: true } },
    },
  });
  if (!linkMeta) {
    return { link: null, totals: { clicks: 0, uniqueVisitors: 0, perCurrency: [] }, daily: [], recentOrders: [], lastClickAt: null, lastConversionAt: null };
  }
  const scope: AnalyticsScope = { ...s, trackingLinkId: linkId };
  const [totals, daily, recentOrders, lastClick, lastConversion] = await Promise.all([
    queryScopedTotals(db, storeId, scope),
    queryDaily(db, storeId, scope, dayStrings),
    queryRecentOrders(db, storeId, scope, 20),
    db.attributionClick.findFirst({ where: { storeId, trackingLinkId: linkId, isBot: false }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    db.orderAttribution.findFirst({ where: { storeId, trackingLinkId: linkId }, orderBy: { attributedAt: "desc" }, select: { attributedAt: true } }),
  ]);

  const link: LinkRowData = {
    trackingLinkId: linkMeta.id,
    campaignId: linkMeta.campaignId,
    campaignName: linkMeta.campaign.name,
    targetType: linkMeta.targetType,
    targetPath: linkMeta.targetPath,
    productTitle: linkMeta.product?.title ?? null,
    categoryTitle: linkMeta.category?.name ?? null,
    status: linkMeta.status,
    createdAt: linkMeta.createdAt,
    activatedAt: linkMeta.activatedAt,
    pausedAt: linkMeta.pausedAt,
    revokedAt: linkMeta.revokedAt,
    utmSource: linkMeta.utmSource,
    utmMedium: linkMeta.utmMedium,
    utmCampaign: linkMeta.utmCampaign,
    utmContent: linkMeta.utmContent,
    utmTerm: linkMeta.utmTerm,
    customLabel: linkMeta.customLabel,
    attributionWindowDays: linkMeta.campaign.attributionWindowDays,
    clicks: totals.clicks,
    uniqueVisitors: totals.uniqueVisitors,
    perCurrency: totals.perCurrency,
  };

  return {
    link,
    totals,
    daily,
    recentOrders,
    lastClickAt: lastClick?.createdAt ?? null,
    lastConversionAt: lastConversion?.attributedAt ?? null,
  };
}
