/**
 * TODO-161A.2 (ADR-128) — Sponsored kampanya AKTİVASYON guard'ı (admin yazma katmanı).
 *
 * `registerSponsoredAdminRoutes` içindeki ticari uygunluk kapısını HTTP seviyesinde doğrular:
 * SPONSORED kampanya ACTIVE'e alınmadan ÖNCE anlaşma zorunludur ve `resolveCampaignEligibility`
 * uygun (reason=null) demedikçe kampanya PAUSED kalır (updateCampaign status:ACTIVE ÇAĞRILMAZ).
 * INTERNAL_PROMOTION guard'dan MUAFTIR ve doğrudan ACTIVE oluşturulur.
 *
 * `SponsoredData` ve `commercial` köprüsü hafif in-memory double ile enjekte edilir; böylece
 * yalnız route mantığı (guard sırası + status yazımı) izole test edilir.
 */
import Fastify, { type FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";
import type { AppConfig } from "@commerce-os/config";
import { registerSponsoredAdminRoutes, type SponsoredCommercialBridge } from "../src/sponsored/routes.js";
import type {
  SponsoredCampaignDetail,
  SponsoredCampaignRecord,
  SponsoredData,
} from "../src/sponsored/data.js";
import type { CommercialIneligibilityReason } from "../src/sponsorship/billing-core.js";

const STORE = "store_a";

function campaignRecord(over: Partial<SponsoredCampaignRecord> = {}): SponsoredCampaignRecord {
  return {
    id: "camp_1",
    storeId: STORE,
    name: "Yaz Kampanyası",
    status: "PAUSED",
    placement: "SEARCH_RESULTS",
    startsAt: null,
    endsAt: null,
    priority: 0,
    maxSlots: 3,
    targetCategoryId: null,
    timezone: "Europe/Istanbul",
    commercialMode: "INTERNAL_PROMOTION",
    createdAt: new Date("2026-07-01T00:00:00Z"),
    updatedAt: new Date("2026-07-01T00:00:00Z"),
    ...over,
  };
}

function campaignDetail(over: Partial<SponsoredCampaignDetail> = {}): SponsoredCampaignDetail {
  return {
    ...campaignRecord(over),
    targetCategoryLabel: null,
    productCount: 0,
    keywordCount: 0,
    products: [],
    keywords: [],
    ...over,
  };
}

/** İzlenen çağrıları biriktirmek için mutable kayıt. */
interface Recorder {
  createStatuses: (string | undefined)[];
  updateCalls: Array<{ id: string; status?: string }>;
  linkCalls: number;
  eligibilityCalls: number;
}

interface DoubleOptions {
  /** commercial.resolveCampaignEligibility davranışı. */
  eligibility?: { exempt: boolean; reason: CommercialIneligibilityReason | null };
  /** Oluşturulan kaydın nihai commercialMode'u (createCampaign döndürür). */
  createdMode?: "INTERNAL_PROMOTION" | "SPONSORED";
  /** PATCH akışı için mevcut kayıt. */
  existing?: SponsoredCampaignRecord | null;
}

function createDeps(rec: Recorder, opts: DoubleOptions = {}) {
  const eligibility = opts.eligibility ?? { exempt: true, reason: null };
  const createdMode = opts.createdMode ?? "SPONSORED";

  const data = {
    createCampaign: async (_s: string, input: { status?: string; commercialMode?: string }) => {
      rec.createStatuses.push(input.status);
      return campaignRecord({ commercialMode: (input.commercialMode as "INTERNAL_PROMOTION" | "SPONSORED") ?? createdMode, status: (input.status as SponsoredCampaignRecord["status"]) ?? "ACTIVE" });
    },
    updateCampaign: async (_s: string, id: string, input: { status?: string }) => {
      rec.updateCalls.push({ id, status: input.status });
      return campaignRecord({ commercialMode: createdMode, status: (input.status as SponsoredCampaignRecord["status"]) ?? "PAUSED" });
    },
    getCampaign: async () => opts.existing ?? campaignRecord(),
    getCampaignDetail: async () => campaignDetail({ commercialMode: createdMode, status: "ACTIVE" }),
  } as unknown as SponsoredData;

  const commercial: SponsoredCommercialBridge = {
    resolveCampaignEligibility: async () => {
      rec.eligibilityCalls += 1;
      return eligibility;
    },
    linkCampaign: async () => {
      rec.linkCalls += 1;
      return {}; // başarılı link (string olmayan)
    },
  };

  return {
    config: {} as unknown as AppConfig,
    data,
    requireStoreAdmin: async () => ({ actorUserId: "u1" }),
    recordAudit: async () => undefined,
    commercial,
  };
}

function buildApp(rec: Recorder, opts: DoubleOptions = {}): FastifyInstance {
  const app = Fastify();
  registerSponsoredAdminRoutes(app, createDeps(rec, opts));
  return app;
}

function newRecorder(): Recorder {
  return { createStatuses: [], updateCalls: [], linkCalls: 0, eligibilityCalls: 0 };
}

describe("sponsored activation guard — POST create", () => {
  it("SPONSORED + ACTIVE + agreementId YOK → 409 AGREEMENT_REQUIRED (kampanya oluşturulmaz)", async () => {
    const rec = newRecorder();
    const app = buildApp(rec);
    const res = await app.inject({
      method: "POST",
      url: `/stores/${STORE}/sponsored-campaigns`,
      payload: { name: "K", placement: "SEARCH_RESULTS", status: "ACTIVE", commercialMode: "SPONSORED" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("AGREEMENT_REQUIRED");
    // Guard, createCampaign'den ÖNCE reddeder.
    expect(rec.createStatuses).toHaveLength(0);
  });

  it("SPONSORED + agreementId + reason=AGREEMENT_NOT_ACTIVE → 409, PAUSED kalır (ACTIVE yazılmaz)", async () => {
    const rec = newRecorder();
    const app = buildApp(rec, { eligibility: { exempt: false, reason: "AGREEMENT_NOT_ACTIVE" } });
    const res = await app.inject({
      method: "POST",
      url: `/stores/${STORE}/sponsored-campaigns`,
      payload: { name: "K", placement: "SEARCH_RESULTS", status: "ACTIVE", commercialMode: "SPONSORED", agreementId: "ag_1" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("AGREEMENT_NOT_ACTIVE");
    // Kampanya PAUSED oluşturuldu + bağlandı ama aktive EDİLMEDİ.
    expect(rec.createStatuses).toEqual(["PAUSED"]);
    expect(rec.linkCalls).toBe(1);
    expect(rec.updateCalls.some((c) => c.status === "ACTIVE")).toBe(false);
  });

  it("SPONSORED + agreementId + eligible (reason=null) → link + ACTIVE aktivasyon, 201", async () => {
    const rec = newRecorder();
    const app = buildApp(rec, { eligibility: { exempt: false, reason: null }, createdMode: "SPONSORED" });
    const res = await app.inject({
      method: "POST",
      url: `/stores/${STORE}/sponsored-campaigns`,
      payload: { name: "K", placement: "SEARCH_RESULTS", status: "ACTIVE", commercialMode: "SPONSORED", agreementId: "ag_1" },
    });
    expect(res.statusCode).toBe(201);
    expect(rec.createStatuses).toEqual(["PAUSED"]);
    expect(rec.linkCalls).toBe(1);
    // Guard geçti → status ACTIVE ayrıca yazıldı.
    expect(rec.updateCalls.some((c) => c.status === "ACTIVE")).toBe(true);
  });

  it("INTERNAL_PROMOTION + ACTIVE → guard MUAF, doğrudan ACTIVE, 201", async () => {
    const rec = newRecorder();
    const app = buildApp(rec, { createdMode: "INTERNAL_PROMOTION" });
    const res = await app.inject({
      method: "POST",
      url: `/stores/${STORE}/sponsored-campaigns`,
      payload: { name: "K", placement: "SEARCH_RESULTS", status: "ACTIVE", commercialMode: "INTERNAL_PROMOTION" },
    });
    expect(res.statusCode).toBe(201);
    // Doğrudan ACTIVE oluşturuldu; guard ve link akışı devreye girmedi.
    expect(rec.createStatuses).toEqual(["ACTIVE"]);
    expect(rec.linkCalls).toBe(0);
    expect(rec.eligibilityCalls).toBe(0);
  });
});

describe("sponsored activation guard — PATCH activate", () => {
  it("mevcut SPONSORED kampanya ACTIVE'e alınırken reason!=null → 409, ACTIVE yazılmaz", async () => {
    const rec = newRecorder();
    const existing = campaignRecord({ commercialMode: "SPONSORED", status: "PAUSED" });
    const app = buildApp(rec, {
      existing,
      createdMode: "SPONSORED",
      eligibility: { exempt: false, reason: "OVERDUE_CHARGE" },
    });
    const res = await app.inject({
      method: "PATCH",
      url: `/stores/${STORE}/sponsored-campaigns/camp_1`,
      payload: { status: "ACTIVE" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("AGREEMENT_OVERDUE");
    // İlk updateCampaign guard nedeniyle status YAZMAZ; ayrıca ACTIVE ikinci yazım da olmaz.
    expect(rec.updateCalls.some((c) => c.status === "ACTIVE")).toBe(false);
  });
});
