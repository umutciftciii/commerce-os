// H-2 (ADR-181…186 / TD-133) — Sponsorship revenue-share CURRENCY AUDIT scripti (SALT-OKUMA).
//
// Finansal invariant: aynı settlement/charge/revenue-share hesabı içinde farklı `currency` değerleri
// sessizce toplanamaz. Bu script mevcut veride çoklu-para uyuşmazlıklarını tarar ve raporlar. DB'yi
// HİÇ değiştirmez. Çıktı yalnız kontrollü bilgidir (sayılar + entity ID'leri + currency kodları);
// müşteri/kişisel veri veya tam ödeme verisi RAPORLANMAZ.
//
// Kontroller:
//   AGREEMENT_CURRENCY_MISSING     — agreement.currency boş/whitespace/ISO-4217-dışı
//   ORDER_ATTR_VS_AGREEMENT        — kampanyanın attribution currency'si ≠ bağlı anlaşma currency'si
//   MULTI_CURRENCY_CAMPAIGN        — tek kampanyada birden fazla attribution currency (revenue bucket karışımı)
//   SETTLEMENT_VS_AGREEMENT        — settlement.currency ≠ agreement.currency
//   CHARGE_VS_AGREEMENT            — charge.currency ≠ agreement.currency
//   PAYMENT_VS_CHARGE              — payment.currency ≠ charge.currency
//   ALLOCATION_VS_CHARGE           — advanceAllocation.currency ≠ charge.currency
//
// Kullanım:
//   node scripts/security/scan-sponsorship-currency.mjs
//   node scripts/security/scan-sponsorship-currency.mjs --store=<storeId>
//   node scripts/security/scan-sponsorship-currency.mjs --json --limit=50
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const storeArg = args.find((a) => a.startsWith("--store="));
const limitArg = args.find((a) => a.startsWith("--limit="));
const storeId = storeArg ? storeArg.split("=")[1] : undefined;
const limit = limitArg ? Number(limitArg.split("=")[1]) : 100;
const asJson = args.includes("--json");

const norm = (c) => (c ?? "").trim().toUpperCase();
const isIso4217 = (c) => /^[A-Z]{3}$/.test(norm(c));
const where = storeId ? { storeId } : {};

const findings = [];
function add(type, storeId, ids, detail) {
  findings.push({ type, storeId, ...ids, detail });
}

async function main() {
  // 1) Agreements — currency otoritesi.
  const agreements = await prisma.sponsorshipAgreement.findMany({
    where,
    select: { id: true, storeId: true, agreementNumber: true, currency: true },
  });
  const agreementCurrency = new Map(); // id -> normalized currency
  for (const a of agreements) {
    agreementCurrency.set(a.id, norm(a.currency));
    if (!isIso4217(a.currency)) {
      add("AGREEMENT_CURRENCY_MISSING", a.storeId, { agreementId: a.id, agreementNumber: a.agreementNumber }, { currency: a.currency ?? null });
    }
  }

  // 2) Kampanya → anlaşma currency haritası (link üzerinden).
  const links = await prisma.sponsorshipAgreementCampaign.findMany({
    where,
    select: { campaignId: true, agreementId: true },
  });
  const campaignToAgreement = new Map();
  for (const l of links) campaignToAgreement.set(l.campaignId, l.agreementId);

  // 3) Attribution currency histogramı (campaignId, currency). Para TOPLANMAZ — yalnız sayım.
  const attrGroups = await prisma.orderSponsoredAttribution.groupBy({
    by: ["campaignId", "currency", "storeId"],
    where,
    _count: { _all: true },
  });
  const byCampaign = new Map(); // campaignId -> Map<currency, count>
  for (const g of attrGroups) {
    const m = byCampaign.get(g.campaignId) ?? new Map();
    m.set(norm(g.currency), (m.get(norm(g.currency)) ?? 0) + g._count._all);
    byCampaign.set(g.campaignId, m);
  }
  for (const [campaignId, hist] of byCampaign) {
    const currencies = [...hist.keys()];
    if (currencies.length > 1) {
      add("MULTI_CURRENCY_CAMPAIGN", storeId ?? "*", { campaignId }, { currencies, counts: Object.fromEntries(hist) });
    }
    const agreementId = campaignToAgreement.get(campaignId);
    if (agreementId) {
      const expected = agreementCurrency.get(agreementId);
      for (const [cur, count] of hist) {
        if (expected && cur !== expected) {
          add("ORDER_ATTR_VS_AGREEMENT", storeId ?? "*", { campaignId, agreementId }, { expected, found: cur, count });
        }
      }
    }
  }

  // 4) Settlement / Charge / Payment / Allocation zinciri.
  const settlements = await prisma.sponsorshipSettlement.findMany({ where, select: { id: true, storeId: true, agreementId: true, currency: true } });
  for (const s of settlements) {
    const expected = agreementCurrency.get(s.agreementId);
    if (expected && norm(s.currency) !== expected) {
      add("SETTLEMENT_VS_AGREEMENT", s.storeId, { settlementId: s.id, agreementId: s.agreementId }, { expected, found: norm(s.currency) });
    }
  }

  const charges = await prisma.sponsorshipCharge.findMany({ where, select: { id: true, storeId: true, agreementId: true, currency: true } });
  const chargeCurrency = new Map();
  for (const c of charges) {
    chargeCurrency.set(c.id, norm(c.currency));
    const expected = agreementCurrency.get(c.agreementId);
    if (expected && norm(c.currency) !== expected) {
      add("CHARGE_VS_AGREEMENT", c.storeId, { chargeId: c.id, agreementId: c.agreementId }, { expected, found: norm(c.currency) });
    }
  }

  const payments = await prisma.sponsorshipPayment.findMany({ where, select: { id: true, storeId: true, chargeId: true, currency: true } });
  for (const p of payments) {
    if (!p.chargeId) continue; // avans (chargeId null) — anlaşma currency'si createAdvance'te zorlanır.
    const expected = chargeCurrency.get(p.chargeId);
    if (expected && norm(p.currency) !== expected) {
      add("PAYMENT_VS_CHARGE", p.storeId, { paymentId: p.id, chargeId: p.chargeId }, { expected, found: norm(p.currency) });
    }
  }

  const allocations = await prisma.sponsorshipAdvanceAllocation.findMany({ where, select: { id: true, storeId: true, chargeId: true, currency: true } });
  for (const al of allocations) {
    const expected = chargeCurrency.get(al.chargeId);
    if (expected && norm(al.currency) !== expected) {
      add("ALLOCATION_VS_CHARGE", al.storeId, { allocationId: al.id, chargeId: al.chargeId }, { expected, found: norm(al.currency) });
    }
  }

  // Rapor.
  const byType = {};
  for (const f of findings) byType[f.type] = (byType[f.type] ?? 0) + 1;

  if (asJson) {
    console.log(JSON.stringify({ scannedStores: storeId ?? "ALL", summary: byType, findings: findings.slice(0, limit) }, null, 2));
  } else {
    console.log(`\nSponsorship currency audit — ${storeId ? `store=${storeId}` : "TÜM store'lar"}`);
    console.log("─".repeat(60));
    const total = findings.length;
    if (total === 0) {
      console.log("✓ Uyuşmazlık YOK — tüm sponsorship finansal kayıtları tek-para tutarlı.");
    } else {
      for (const [type, count] of Object.entries(byType)) console.log(`  ${type.padEnd(30)} ${count}`);
      console.log("─".repeat(60));
      console.log(`Toplam ${total} bulgu (ilk ${Math.min(limit, total)} gösteriliyor):\n`);
      for (const f of findings.slice(0, limit)) {
        console.log(`  [${f.type}] ${JSON.stringify({ ...f, type: undefined })}`);
      }
    }
    console.log("");
  }
  // Exit code: bulgu varsa 1 (CI/gate sinyali), yoksa 0.
  process.exitCode = findings.length > 0 ? 1 : 0;
}

main()
  .catch((e) => {
    console.error("scan failed:", e.message);
    process.exitCode = 2;
  })
  .finally(() => prisma.$disconnect());
