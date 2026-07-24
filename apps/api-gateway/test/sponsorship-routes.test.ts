/**
 * TODO-161A (ADR-121…127) — Sponsorship HTTP route testleri.
 *
 * Ticari matematik `sponsorship-billing-core.test.ts`'te kapsandı (59 test). Bu dosya HTTP
 * katmanını doğrular: store-admin guard + cross-store isolation · gövde doğrulaması (400) ·
 * hata → HTTP kod eşlemesi (409/400) · serialize (displayStatus OVERDUE türetimi) · CSV
 * injection guard. `SponsorshipData` yerine hafif in-memory double enjekte edilir.
 */
import Fastify, { type FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it } from "vitest";
import { registerSponsorshipAdminRoutes } from "../src/sponsorship/routes.js";
import type {
  ChargeRow,
  PaymentError,
  SponsorAccountDetailRow,
  SponsorAccountRow,
  SponsorshipData,
} from "../src/sponsorship/data.js";

const STORE_A = "store_a";
const STORE_B = "store_b";

function sponsorRow(over: Partial<SponsorAccountRow> = {}): SponsorAccountRow {
  return {
    id: "sp_1",
    companyName: "Acme A.Ş.",
    contactName: "Ada",
    email: "ada@acme.test",
    phone: null,
    status: "ACTIVE",
    agreementCount: 0,
    activeAgreementCount: 0,
    createdAt: new Date("2026-07-01T00:00:00Z"),
    updatedAt: new Date("2026-07-01T00:00:00Z"),
    ...over,
  };
}

function sponsorDetail(over: Partial<SponsorAccountDetailRow> = {}): SponsorAccountDetailRow {
  return {
    ...sponsorRow(),
    taxOffice: null,
    taxNumber: null,
    billingAddress: null,
    notes: null,
    balances: [],
    ...over,
  };
}

function chargeRow(over: Partial<ChargeRow> = {}): ChargeRow {
  return {
    id: "ch_1",
    chargeNumber: "TAH-2026-00001",
    agreementId: "ag_1",
    agreementNumber: "SZL-2026-00001",
    sponsorAccountId: "sp_1",
    sponsorCompanyName: "Acme A.Ş.",
    campaignId: null,
    campaignName: null,
    settlementId: "st_1",
    chargeType: "PERIOD",
    pricingModel: "FIXED_FEE",
    periodStart: new Date("2026-07-01T00:00:00Z"),
    periodEnd: new Date("2026-07-31T00:00:00Z"),
    quantity: 1,
    unitPriceMinor: 0,
    subtotalMinor: 100_000,
    taxRateBp: 2000,
    taxAmountMinor: 20_000,
    totalAmountMinor: 120_000,
    paidMinor: 0,
    remainingMinor: 120_000,
    currency: "TRY",
    status: "ISSUED",
    isOverdue: false,
    daysOverdue: 0,
    notes: null,
    generatedAt: new Date("2026-07-01T00:00:00Z"),
    issuedAt: new Date("2026-07-01T00:00:00Z"),
    dueAt: new Date("2026-08-01T00:00:00Z"),
    createdAt: new Date("2026-07-01T00:00:00Z"),
    ...over,
  };
}

/** İzlenen davranışları enjekte edilebilir kılan hafif double. */
function createDouble(overrides: Partial<SponsorshipData> = {}): SponsorshipData {
  const base = {
    listSponsors: async () => ({ items: [sponsorRow()], total: 1 }),
    getSponsorDetail: async (_s: string, id: string) => (id === "sp_1" ? sponsorDetail() : null),
    createSponsor: async (_s: string, input: { companyName: string }) =>
      input.companyName === "dup" ? "DUPLICATE_COMPANY" : sponsorRow({ id: "sp_new", companyName: input.companyName }),
    updateSponsor: async () => sponsorRow(),
    listAgreements: async () => ({ items: [], total: 0 }),
    getAgreementDetail: async () => null,
    createAgreement: async () => "INVALID_PRICING",
    updateAgreement: async () => null,
    linkCampaign: async () => "CAMPAIGN_WINDOW_NOT_COVERED",
    unlinkCampaign: async () => null,
    resolveCampaignEligibility: async () => ({ exempt: true, reason: null }),
    isUnpaidCampaignAllowed: async () => false,
    previewSettlement: async () => "AGREEMENT_NOT_FOUND",
    listSettlements: async () => ({ items: [], total: 0 }),
    getSettlement: async () => null,
    finalizeSettlement: async () => null,
    deleteSettlement: async () => "NOT_FOUND",
    createChargeFromSettlement: async () => "SETTLEMENT_NOT_FINALIZED",
    createRefundAdjustment: async () => null,
    issueCharge: async () => "CHARGE_NOT_FOUND",
    cancelCharge: async () => "CHARGE_NOT_FOUND",
    listCharges: async () => ({ items: [], total: 0 }),
    getCharge: async () => null,
    recordPayment: async () => "OVERPAYMENT" as PaymentError,
    reversePayment: async () => "NOT_REVERSIBLE" as PaymentError,
    listPayments: async () => ({ items: [], total: 0 }),
    getDashboard: async () => ({
      activeSponsors: 0,
      totalSponsors: 0,
      activeAgreements: 0,
      totalAgreements: 0,
      overdueChargeCount: 0,
      currencies: [],
      bySponsor: [],
      byAgreement: [],
      byCampaign: [],
      byPricingModel: [],
      byDueStatus: [],
    }),
  } as unknown as SponsorshipData;
  return { ...base, ...overrides };
}

function buildApp(data: SponsorshipData): FastifyInstance {
  const app = Fastify();
  registerSponsorshipAdminRoutes(app, {
    data,
    // Bearer admin:<storeId> → yalnız o store'a admin; eşleşmezse yetkisiz (cross-store guard).
    requireStoreAdmin: async (request, reply, storeId) => {
      const auth = (request.headers["authorization"] as string | undefined) ?? "";
      const match = /^Bearer admin:(.+)$/.exec(auth);
      if (!match || match[1] !== storeId) {
        reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "no" } });
        return null;
      }
      return { actorUserId: "admin_1" };
    },
    recordAudit: async () => undefined,
  });
  return app;
}

function auth(storeId: string) {
  return { authorization: `Bearer admin:${storeId}` };
}

describe("sponsorship routes — guard & tenant isolation", () => {
  let app: FastifyInstance;
  beforeEach(() => {
    app = buildApp(createDouble());
  });

  it("kimliksiz istek 401", async () => {
    const res = await app.inject({ method: "GET", url: `/stores/${STORE_A}/sponsors` });
    expect(res.statusCode).toBe(401);
  });

  it("cross-store token 401 (STORE_B token'ı STORE_A'ya erişemez)", async () => {
    const res = await app.inject({ method: "GET", url: `/stores/${STORE_A}/sponsors`, headers: auth(STORE_B) });
    expect(res.statusCode).toBe(401);
  });

  it("doğru store admin listeye erişir", async () => {
    const res = await app.inject({ method: "GET", url: `/stores/${STORE_A}/sponsors`, headers: auth(STORE_A) });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
  });
});

describe("sponsorship routes — validation & error mapping", () => {
  it("geçersiz sponsor gövdesi 400", async () => {
    const app = buildApp(createDouble());
    const res = await app.inject({ method: "POST", url: `/stores/${STORE_A}/sponsors`, headers: auth(STORE_A), payload: { companyName: "" } });
    expect(res.statusCode).toBe(400);
  });

  it("duplicate sponsor 409", async () => {
    const app = buildApp(createDouble());
    const res = await app.inject({
      method: "POST",
      url: `/stores/${STORE_A}/sponsors`,
      headers: auth(STORE_A),
      payload: { companyName: "dup", contactName: "X", email: "x@y.test" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("DUPLICATE_COMPANY");
  });

  it("geçersiz pricing → agreement 400 INVALID_PRICING", async () => {
    const app = buildApp(createDouble());
    const res = await app.inject({
      method: "POST",
      url: `/stores/${STORE_A}/sponsorship-agreements`,
      headers: auth(STORE_A),
      payload: {
        sponsorAccountId: "sp_1",
        title: "T",
        startsAt: "2026-07-01T00:00:00.000Z",
        endsAt: "2026-07-31T00:00:00.000Z",
        currency: "TRY",
        pricingModel: "CPC",
        // unitPriceMinor eksik → data double INVALID_PRICING döner
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("INVALID_PRICING");
  });

  it("kampanya penceresi kapsanmıyor → 400", async () => {
    const app = buildApp(createDouble());
    const res = await app.inject({
      method: "POST",
      url: `/stores/${STORE_A}/sponsorship-agreements/ag_1/campaigns`,
      headers: auth(STORE_A),
      payload: { campaignId: "camp_1" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("CAMPAIGN_WINDOW_NOT_COVERED");
  });

  it("finalized olmayan settlement charge 409", async () => {
    const app = buildApp(createDouble());
    const res = await app.inject({ method: "POST", url: `/stores/${STORE_A}/sponsorship-settlements/st_1/charge`, headers: auth(STORE_A), payload: {} });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("SETTLEMENT_NOT_FINALIZED");
  });

  it("aşırı tahsilat 400 OVERPAYMENT", async () => {
    const app = buildApp(createDouble());
    const res = await app.inject({
      method: "POST",
      url: `/stores/${STORE_A}/sponsorship-charges/ch_1/payments`,
      headers: auth(STORE_A),
      payload: { amountMinor: 999_999_00, currency: "TRY", method: "BANK_TRANSFER" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("OVERPAYMENT");
  });

  it("ters çevrilemeyen ödeme 409", async () => {
    const app = buildApp(createDouble());
    const res = await app.inject({ method: "POST", url: `/stores/${STORE_A}/sponsorship-payments/pay_1/reverse`, headers: auth(STORE_A), payload: {} });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("NOT_REVERSIBLE");
  });
});

describe("sponsorship routes — serialize & derived state", () => {
  it("vadesi geçmiş açık tahakkuk displayStatus=OVERDUE döndürür", async () => {
    // dueAt geçmiş + remaining > 0 → OVERDUE türetimi (kalıcı status ISSUED kalır).
    const overdue = chargeRow({ dueAt: new Date("2020-01-01T00:00:00Z"), remainingMinor: 120_000, status: "ISSUED" });
    const app = buildApp(createDouble({ getCharge: async () => overdue }));
    const res = await app.inject({ method: "GET", url: `/stores/${STORE_A}/sponsorship-charges/ch_1`, headers: auth(STORE_A) });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.status).toBe("ISSUED");
    expect(body.displayStatus).toBe("OVERDUE");
  });

  it("refund-adjustment etkisi yoksa data:null (yeni belge açılmaz)", async () => {
    const app = buildApp(createDouble({ createRefundAdjustment: async () => null }));
    const res = await app.inject({ method: "POST", url: `/stores/${STORE_A}/sponsorship-settlements/st_1/refund-adjustment`, headers: auth(STORE_A), payload: {} });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toBeNull();
  });
});

describe("sponsorship routes — CSV export injection guard", () => {
  it("formül-önekli sponsor adı tırnaklanır ve prefix ile kaçırılır", async () => {
    // Formül-önekli + virgüllü ad → hem `'` prefix hem quote/escape alır.
    const evil = chargeRow({ sponsorCompanyName: "=CMD(),x", chargeNumber: "TAH-2026-00009" });
    const app = buildApp(createDouble({ listCharges: async () => ({ items: [evil], total: 1 }) }));
    const res = await app.inject({ method: "GET", url: `/stores/${STORE_A}/sponsorship-charges/export`, headers: auth(STORE_A) });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.body).toContain(`"'=CMD(),x"`);
  });
});
