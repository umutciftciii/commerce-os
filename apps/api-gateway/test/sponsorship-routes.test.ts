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
  AdvanceRow,
  AllocationRow,
  CampaignCommercialSummary,
  ChargeRow,
  EligibleAgreementRow,
  PaymentError,
  PaymentRow,
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

// ── TODO-161A.2 (ADR-128/129) — yeni uç satır fabrikaları ────────────────────────
function paymentRow(over: Partial<PaymentRow> = {}): PaymentRow {
  return {
    id: "pay_1",
    agreementId: "ag_1",
    agreementNumber: "SZL-2026-00001",
    sponsorCompanyName: "Acme A.Ş.",
    chargeId: null,
    chargeNumber: null,
    amountMinor: 30_000,
    currency: "TRY",
    method: "BANK_TRANSFER",
    providerReference: null,
    manualReference: null,
    paidAt: new Date("2026-07-02T00:00:00Z"),
    notes: null,
    isReversal: false,
    reversalOfPaymentId: null,
    reversalReason: null,
    reversed: false,
    createdAt: new Date("2026-07-02T00:00:00Z"),
    ...over,
  };
}

function advanceRow(over: Partial<AdvanceRow> = {}): AdvanceRow {
  return {
    id: "pay_1",
    agreementId: "ag_1",
    agreementNumber: "SZL-2026-00001",
    sponsorCompanyName: "Acme A.Ş.",
    amountMinor: 30_000,
    allocatedMinor: 0,
    availableMinor: 30_000,
    currency: "TRY",
    method: "BANK_TRANSFER",
    paidAt: new Date("2026-07-02T00:00:00Z"),
    notes: null,
    createdAt: new Date("2026-07-02T00:00:00Z"),
    ...over,
  };
}

function allocationRow(over: Partial<AllocationRow> = {}): AllocationRow {
  return {
    id: "alloc_1",
    agreementId: "ag_1",
    advancePaymentId: "pay_1",
    chargeId: "ch_1",
    chargeNumber: "TAH-2026-00001",
    amountMinor: 30_000,
    currency: "TRY",
    createdAt: new Date("2026-07-03T00:00:00Z"),
    ...over,
  };
}

function eligibleAgreementRow(over: Partial<EligibleAgreementRow> = {}): EligibleAgreementRow {
  return {
    id: "ag_1",
    agreementNumber: "SZL-2026-00001",
    title: "2026 Yaz Anlaşması",
    status: "ACTIVE",
    currency: "TRY",
    pricingModel: "FIXED_FEE",
    startsAt: new Date("2026-07-01T00:00:00Z"),
    endsAt: new Date("2026-08-01T00:00:00Z"),
    agreedAmountMinor: 75_000,
    budgetLimitMinor: null,
    allocatedToCampaignsMinor: 0,
    availableAllocationMinor: 75_000,
    outstandingMinor: 0,
    commerciallyEligible: true,
    ineligibilityReason: null,
    ...over,
  };
}

function campaignSummaryRow(over: Partial<CampaignCommercialSummary> = {}): CampaignCommercialSummary {
  return {
    campaignId: "camp_1",
    campaignName: "Yaz Kampanyası",
    commercialMode: "SPONSORED",
    agreement: {
      id: "ag_1",
      agreementNumber: "SZL-2026-00001",
      title: "2026 Yaz Anlaşması",
      status: "ACTIVE",
      sponsorAccountId: "sp_1",
      sponsorCompanyName: "Acme A.Ş.",
      pricingModel: "FIXED_FEE",
      currency: "TRY",
      startsAt: new Date("2026-07-01T00:00:00Z"),
      endsAt: new Date("2026-08-01T00:00:00Z"),
      agreedAmountMinor: 75_000,
      allocationAmountMinor: 75_000,
      commerciallyEligible: true,
      ineligibilityReason: null,
    },
    currency: "TRY",
    chargedMinor: 75_000,
    paidMinor: 30_000,
    outstandingMinor: 45_000,
    overdueMinor: 0,
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
    // TODO-161A.2 (ADR-128/129) — birleşik ticari akış uçları.
    listEligibleAgreements: async () => [eligibleAgreementRow()],
    getCampaignCommercialSummary: async () => campaignSummaryRow(),
    createFixedFeeCharge: async () => chargeRow(),
    createAdvance: async () => paymentRow(),
    allocateAdvance: async () => allocationRow(),
    listAvailableAdvances: async () => [advanceRow()],
    listOpenCharges: async () => [chargeRow()],
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

// ══════════ TODO-161A.2 (ADR-128/129) — Birleşik ticari akış uçları ══════════
describe("sponsorship routes — eligible agreements & commercial summary", () => {
  it("GET eligible-agreements → 200 + data listesi", async () => {
    const app = buildApp(createDouble());
    const res = await app.inject({
      method: "GET",
      url: `/stores/${STORE_A}/sponsors/sp_1/eligible-agreements`,
      headers: auth(STORE_A),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
    expect(res.json().data[0].id).toBe("ag_1");
  });

  it("GET commercial-summary → 200 (kampanya bulundu)", async () => {
    const app = buildApp(createDouble());
    const res = await app.inject({
      method: "GET",
      url: `/stores/${STORE_A}/sponsored-campaigns/camp_1/commercial-summary`,
      headers: auth(STORE_A),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.campaignId).toBe("camp_1");
    expect(res.json().data.agreement.id).toBe("ag_1");
  });

  it("GET commercial-summary → 404 (kampanya yok)", async () => {
    const app = buildApp(createDouble({ getCampaignCommercialSummary: async () => null }));
    const res = await app.inject({
      method: "GET",
      url: `/stores/${STORE_A}/sponsored-campaigns/nope/commercial-summary`,
      headers: auth(STORE_A),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("NOT_FOUND");
  });
});

describe("sponsorship routes — fixed-fee charge", () => {
  it("başarılı doğrudan tahakkuk → 201", async () => {
    const app = buildApp(createDouble({ createFixedFeeCharge: async () => chargeRow() }));
    const res = await app.inject({
      method: "POST",
      url: `/stores/${STORE_A}/sponsorship-agreements/ag_1/fixed-fee-charge`,
      headers: auth(STORE_A),
      payload: { amountMinor: 75_000 },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.id).toBe("ch_1");
  });

  it("FIXED_FEE olmayan anlaşma → 409 NOT_FIXED_FEE", async () => {
    const app = buildApp(createDouble({ createFixedFeeCharge: async () => "NOT_FIXED_FEE" }));
    const res = await app.inject({
      method: "POST",
      url: `/stores/${STORE_A}/sponsorship-agreements/ag_1/fixed-fee-charge`,
      headers: auth(STORE_A),
      payload: {},
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("NOT_FIXED_FEE");
  });

  it("sözleşme tutarını aşan tahakkuk → 409 AGREEMENT_ALLOCATION_EXCEEDED", async () => {
    const app = buildApp(createDouble({ createFixedFeeCharge: async () => "AGREEMENT_ALLOCATION_EXCEEDED" }));
    const res = await app.inject({
      method: "POST",
      url: `/stores/${STORE_A}/sponsorship-agreements/ag_1/fixed-fee-charge`,
      headers: auth(STORE_A),
      payload: { amountMinor: 999_999_00 },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("AGREEMENT_ALLOCATION_EXCEEDED");
  });
});

describe("sponsorship routes — advances", () => {
  it("avans kaydı → 201", async () => {
    const app = buildApp(createDouble({ createAdvance: async () => paymentRow() }));
    const res = await app.inject({
      method: "POST",
      url: `/stores/${STORE_A}/sponsorship-agreements/ag_1/advances`,
      headers: auth(STORE_A),
      payload: { amountMinor: 30_000, currency: "TRY", method: "BANK_TRANSFER" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.id).toBe("pay_1");
    expect(res.json().data.chargeId).toBeNull();
  });

  it("para birimi uyuşmazlığı → 400 CURRENCY_MISMATCH", async () => {
    const app = buildApp(createDouble({ createAdvance: async () => "CURRENCY_MISMATCH" }));
    const res = await app.inject({
      method: "POST",
      url: `/stores/${STORE_A}/sponsorship-agreements/ag_1/advances`,
      headers: auth(STORE_A),
      payload: { amountMinor: 30_000, currency: "USD", method: "BANK_TRANSFER" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("CURRENCY_MISMATCH");
  });

  it("GET sponsorship-advances → 200 + kullanılabilir avanslar", async () => {
    const app = buildApp(createDouble());
    const res = await app.inject({ method: "GET", url: `/stores/${STORE_A}/sponsorship-advances`, headers: auth(STORE_A) });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
    expect(res.json().data[0].availableMinor).toBe(30_000);
  });
});

describe("sponsorship routes — open charges & advance allocation", () => {
  it("GET sponsorship-open-charges → 200", async () => {
    const app = buildApp(createDouble());
    const res = await app.inject({ method: "GET", url: `/stores/${STORE_A}/sponsorship-open-charges`, headers: auth(STORE_A) });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
  });

  it("mahsup başarılı → 201", async () => {
    const app = buildApp(createDouble({ allocateAdvance: async () => allocationRow() }));
    const res = await app.inject({
      method: "POST",
      url: `/stores/${STORE_A}/sponsorship-advance-allocations`,
      headers: auth(STORE_A),
      payload: { advancePaymentId: "pay_1", chargeId: "ch_1", amountMinor: 30_000 },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.id).toBe("alloc_1");
  });

  it("avans bakiyesini aşan mahsup → 400 ADVANCE_BALANCE_EXCEEDED", async () => {
    const app = buildApp(createDouble({ allocateAdvance: async () => "ADVANCE_BALANCE_EXCEEDED" }));
    const res = await app.inject({
      method: "POST",
      url: `/stores/${STORE_A}/sponsorship-advance-allocations`,
      headers: auth(STORE_A),
      payload: { advancePaymentId: "pay_1", chargeId: "ch_1", amountMinor: 99_999_00 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("ADVANCE_BALANCE_EXCEEDED");
  });

  it("tahakkuk kalanını aşan mahsup → 400 OVERPAYMENT", async () => {
    const app = buildApp(createDouble({ allocateAdvance: async () => "OVERPAYMENT" }));
    const res = await app.inject({
      method: "POST",
      url: `/stores/${STORE_A}/sponsorship-advance-allocations`,
      headers: auth(STORE_A),
      payload: { advancePaymentId: "pay_1", chargeId: "ch_1", amountMinor: 99_999_00 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("OVERPAYMENT");
  });

  it("iyimser kilit ihlali → 409 BALANCE_CHANGED", async () => {
    const app = buildApp(createDouble({ allocateAdvance: async () => "BALANCE_CHANGED" }));
    const res = await app.inject({
      method: "POST",
      url: `/stores/${STORE_A}/sponsorship-advance-allocations`,
      headers: auth(STORE_A),
      payload: { advancePaymentId: "pay_1", chargeId: "ch_1", amountMinor: 30_000, expectedRemainingMinor: 45_000 },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("BALANCE_CHANGED");
  });
});
