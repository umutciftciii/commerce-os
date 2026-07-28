/**
 * Influencer Analytics DEMO FIXTURE seed (idempotent, deterministik).
 *
 * Amaç: müşteri demosu için `enterprise-demo` (edm-store) mağazasında tek bir demo
 * influencer + 3 kampanya (Instagram/TikTok/YouTube) + farklı UTM'li izleme linkleri +
 * farklı sayıda tıklama (unique < clicks) + iki kampanyadan atıflı sipariş (TRY + USD)
 * oluşturur. Currency ayrımı, günlük zaman serisi ve UTM/customLabel görünürlüğünü gösterir.
 *
 * Idempotent: her çalıştırmada kendi fixture'ını (INFDEMO- sipariş + MELEK-DEMO influencer)
 * silip yeniden kurar. Fixture DEMO SONRASI KORUNUR (silme yok). Env: DATABASE_URL,
 * SESSION_SECRET (gateway ile aynı — tokenHash için).
 *
 * Çalıştırma: SESSION_SECRET=... DATABASE_URL=... node scripts/influencer-demo-seed.mjs
 */
import { PrismaClient } from "@prisma/client";
import { createHmac, createHash } from "node:crypto";

const prisma = new PrismaClient();
const STORE_SLUG = process.env.INFLUENCER_DEMO_STORE_SLUG || "enterprise-demo";
const SECRET = process.env.SESSION_SECRET || "replace-with-local-session-secret-32-chars-min";
const INFLUENCER_CODE = "MELEK-DEMO";
const ORDER_PREFIX = "INFDEMO-";
const NOTE = "DEMO_FIXTURE — influencer analytics demo (idempotent seed).";

const hashToken = (t) => createHmac("sha256", SECRET).update(t).digest("hex");
const detToken = (key) => createHash("sha256").update(`inf-demo-token:${key}`).digest("base64url").slice(0, 32);
const visitorHash = (n) => createHmac("sha256", SECRET).update(`inf-demo-visitor:${n}`).digest("hex");
const daysAgo = (d, hour = 12) => {
  const dt = new Date();
  dt.setDate(dt.getDate() - d);
  dt.setHours(hour, 0, 0, 0);
  return dt;
};

async function main() {
  const store = await prisma.store.findFirst({ where: { slug: STORE_SLUG }, select: { id: true } });
  if (!store) throw new Error(`Store '${STORE_SLUG}' not found`);
  const storeId = store.id;

  const products = await prisma.product.findMany({
    where: { storeId, status: "ACTIVE" },
    select: { id: true, slug: true, title: true },
    orderBy: { createdAt: "asc" },
    take: 3,
  });
  if (products.length < 3) throw new Error("Need ≥3 active products in demo store");

  // ── Temizle (idempotent): demo siparişler (cascade → attribution) + demo influencer.
  await prisma.order.deleteMany({ where: { storeId, orderNumber: { startsWith: ORDER_PREFIX } } });
  await prisma.influencer.deleteMany({ where: { storeId, code: INFLUENCER_CODE } });

  // ── Influencer
  const influencer = await prisma.influencer.create({
    data: { storeId, name: "Melek İçmeli", code: INFLUENCER_CODE, email: "melek.demo@fixture.local", status: "ACTIVE", notes: NOTE },
  });

  // ── Kampanya tanımları (UTM + customLabel + hedef ürün + click/order planı)
  const specs = [
    {
      key: "A", name: "Instagram Yaz Kampanyası", product: products[0],
      utm: { utmSource: "instagram", utmMedium: "influencer", utmCampaign: "yaz-kampanyasi", utmContent: "reel-1", utmTerm: null },
      customLabel: "Instagram Reel", clicks: 24, unique: 16,
      orders: [{ currency: "TRY", gross: 45000 }, { currency: "TRY", gross: 30000 }, { currency: "TRY", gross: 60000 }],
    },
    {
      key: "B", name: "TikTok Çanta Lansmanı", product: products[1],
      utm: { utmSource: "tiktok", utmMedium: "influencer", utmCampaign: "canta-lansman", utmContent: "video-2", utmTerm: null },
      customLabel: "TikTok Ürün Videosu", clicks: 12, unique: 9,
      orders: [{ currency: "TRY", gross: 89900 }, { currency: "USD", gross: 12900 }],
    },
    {
      key: "C", name: "YouTube Teknoloji Demo", product: products[2],
      utm: { utmSource: "youtube", utmMedium: "influencer", utmCampaign: null, utmContent: null, utmTerm: "gaming" },
      customLabel: "YouTube Açıklama Linki", clicks: 6, unique: 5,
      orders: [],
    },
  ];

  const summary = [];
  for (const spec of specs) {
    const campaign = await prisma.influencerCampaign.create({
      data: { storeId, influencerId: influencer.id, name: spec.name, status: "ACTIVE", attributionWindowDays: 30, startsAt: daysAgo(20), endsAt: null },
    });
    const plainToken = detToken(`${INFLUENCER_CODE}:${spec.key}`);
    const targetPath = `/products/${spec.product.slug}`;
    const link = await prisma.influencerTrackingLink.create({
      data: {
        storeId, campaignId: campaign.id, tokenHash: hashToken(plainToken), targetType: "PRODUCT",
        targetPath, productId: spec.product.id, activatedAt: daysAgo(20),
        ...spec.utm, customLabel: spec.customLabel,
      },
    });

    // Clicks: `clicks` toplam, `unique` farklı ziyaretçi (kalan tekrar). Son 12 güne dağıt.
    const clickRows = [];
    for (let i = 0; i < spec.clicks; i += 1) {
      const v = i % spec.unique; // ilk `unique` benzersiz; sonrası tekrar → clicks>unique
      clickRows.push({
        storeId, campaignId: campaign.id, trackingLinkId: link.id,
        visitorIdHash: visitorHash(`${spec.key}-${v}`), landingPath: targetPath, isBot: false,
        createdAt: daysAgo(11 - (i % 12), 9 + (i % 8)),
      });
    }
    await prisma.attributionClick.createMany({ data: clickRows });

    // Orders + attribution (TRY/USD). Order minimal; snapshot immutable UTM/hedef taşır.
    let oi = 0;
    for (const o of spec.orders) {
      oi += 1;
      const attributedAt = daysAgo(7 - oi, 14);
      const order = await prisma.order.create({
        data: {
          storeId, orderNumber: `${ORDER_PREFIX}${spec.key}${oi}`, customerEmail: "melek.demo@fixture.local",
          currency: o.currency, status: "FULFILLED", paymentStatus: "PAID", fulfillmentStatus: "FULFILLED",
          subtotalAmount: o.gross, totalAmount: o.gross, placedAt: attributedAt,
        },
      });
      await prisma.orderAttribution.create({
        data: {
          storeId, orderId: order.id, influencerId: influencer.id, campaignId: campaign.id, trackingLinkId: link.id,
          attributionModel: "LAST_CLICK", attributedAt, grossRevenueMinor: o.gross, refundedRevenueMinor: 0,
          netRevenueMinor: o.gross, currency: o.currency,
          snapshot: {
            model: "LAST_CLICK", influencerId: influencer.id, influencerName: influencer.name, influencerCode: influencer.code,
            campaignId: campaign.id, campaignName: campaign.name, attributionWindowDays: 30, trackingLinkId: link.id,
            targetType: "PRODUCT", targetPath, ...spec.utm, productId: spec.product.id, productTitle: spec.product.title,
            categoryId: null, categoryTitle: null, clickId: null, clickedAt: attributedAt.toISOString(),
          },
        },
      });
    }

    summary.push({ campaign: spec.name, plainUrl: `/t/${plainToken}`, clicks: spec.clicks, unique: spec.unique, orders: spec.orders.length });
  }

  console.log("DEMO_FIXTURE seeded (store=%s influencer=%s):", STORE_SLUG, INFLUENCER_CODE);
  for (const s of summary) {
    console.log("  - %s | %s | clicks=%d unique=%d orders=%d", s.campaign, s.plainUrl, s.clicks, s.unique, s.orders);
  }
  console.log("Influencer id:", influencer.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
