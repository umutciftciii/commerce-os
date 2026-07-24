import Fastify from "fastify";
import { z } from "zod";
import { afterEach, describe, expect, it, vi } from "vitest";

// createServer'in ZodError→400 handler'inin izole karsiligi.
function attachErrorHandler(app: ReturnType<typeof Fastify>) {
  app.setErrorHandler(async (error, _request, reply) => {
    if (error instanceof z.ZodError) {
      await reply.code(400).send({ error: { code: "VALIDATION_ERROR", message: "Validation failed." } });
      return;
    }
    throw error;
  });
}

// data.js -> @commerce-os/db (prisma). Testte gercek prisma init'ini engelle (fake data-access kullanilir).
vi.mock("@commerce-os/db", () => ({ prisma: {} }));

const { buildSkuPreviewRows, classifySkuIssues, createSkuService, skuErrorStatus } = await import(
  "../src/sku-engine/service.js"
);
const { registerSkuRoutes } = await import("../src/sku-engine/routes.js");
import type {
  SkuDataAccess,
  SkuTxContext,
  SkuVariantRow,
  SkuAuditVariantRow,
  SkuWriteInput,
} from "../src/sku-engine/data.js";

// ─────────────────────────── SAF ÇEKİRDEK ───────────────────────────

describe("TODO-160A · classifySkuIssues (saf)", () => {
  it("bos SKU → SKU_EMPTY", () => {
    expect(classifySkuIssues("", null)).toEqual(["SKU_EMPTY"]);
  });
  it("gecersiz karakter → SKU_INVALID_CHARS", () => {
    expect(classifySkuIssues("TSH BLK", null)).toContain("SKU_INVALID_CHARS");
  });
  it("cok uzun → SKU_TOO_LONG", () => {
    expect(classifySkuIssues("A".repeat(70), null)).toContain("SKU_TOO_LONG");
  });
  it("opak V-<id>-<hash> → SKU_OPAQUE (gecersiz DEGIL)", () => {
    expect(classifySkuIssues("V-prod123-1a2b3c", null)).toEqual(["SKU_OPAQUE"]);
  });
  it("barcode == sku → BARCODE_EQUALS_SKU", () => {
    expect(classifySkuIssues("TSH-BLK", "TSH-BLK")).toContain("BARCODE_EQUALS_SKU");
  });
  it("temiz SKU → sorun yok", () => {
    expect(classifySkuIssues("TSH-BLK-M", "869123")).toEqual([]);
  });
});

function variant(over: Partial<SkuVariantRow> = {}): SkuVariantRow {
  return {
    variantId: "v1",
    status: "ACTIVE",
    currentSku: "",
    barcode: null,
    skuSource: "AUTO",
    optionCodes: [],
    ...over,
  };
}

describe("TODO-160A · buildSkuPreviewRows (saf)", () => {
  it("auto varyantlar okunabilir oneri alir ({PRODUCT}-{OPTIONS})", () => {
    const r = buildSkuPreviewRows({
      productCode: "tshirt",
      variants: [variant({ variantId: "v1", optionCodes: ["BLK", "M"] })],
      existingStoreSkus: new Set(),
      force: false,
      onlyAutoSource: true,
    });
    expect(r.rows[0]!.suggestedSku).toBe("TSHIRT-BLK-M");
    expect(r.rows[0]!.changed).toBe(true);
  });

  it("in-batch + external collision → zero-pad sonek", () => {
    const r = buildSkuPreviewRows({
      productCode: "mug",
      variants: [
        variant({ variantId: "v1", optionCodes: ["WHT"] }),
        variant({ variantId: "v2", optionCodes: ["WHT"] }),
      ],
      existingStoreSkus: new Set(["MUG-WHT-003"]), // external çakışma
      force: false,
      onlyAutoSource: true,
    });
    expect(r.rows[0]!.suggestedSku).toBe("MUG-WHT");
    expect(r.rows[1]!.suggestedSku).toBe("MUG-WHT-002");
    expect(r.rows[1]!.collision).toBe(true);
  });

  it("MANUAL kaynak onlyAutoSource ile KORUNUR (protected, degismez)", () => {
    const r = buildSkuPreviewRows({
      productCode: "tshirt",
      variants: [variant({ variantId: "v1", currentSku: "CUSTOM-1", skuSource: "MANUAL", optionCodes: ["BLK"] })],
      existingStoreSkus: new Set(["CUSTOM-1"]),
      force: false,
      onlyAutoSource: true,
    });
    expect(r.rows[0]!.protected).toBe(true);
    expect(r.rows[0]!.suggestedSku).toBe("CUSTOM-1");
    expect(r.rows[0]!.changed).toBe(false);
    expect(r.counts.protectedCount).toBe(1);
  });

  it("force → MANUAL koruma kalkar (yeniden uretilir)", () => {
    const r = buildSkuPreviewRows({
      productCode: "tshirt",
      variants: [variant({ variantId: "v1", currentSku: "CUSTOM-1", skuSource: "MANUAL", optionCodes: ["BLK"] })],
      existingStoreSkus: new Set(["CUSTOM-1"]),
      force: true,
      onlyAutoSource: true,
    });
    expect(r.rows[0]!.protected).toBe(false);
    expect(r.rows[0]!.suggestedSku).toBe("TSHIRT-BLK");
  });

  it("mevcut SKU zaten hedefe esitse changed=false (idempotent)", () => {
    const r = buildSkuPreviewRows({
      productCode: "tshirt",
      variants: [variant({ variantId: "v1", currentSku: "TSHIRT-BLK", optionCodes: ["BLK"] })],
      existingStoreSkus: new Set(["TSHIRT-BLK"]),
      force: false,
      onlyAutoSource: true,
    });
    expect(r.rows[0]!.suggestedSku).toBe("TSHIRT-BLK");
    expect(r.rows[0]!.changed).toBe(false);
  });
});

// ─────────────────────────── FAKE DATA ACCESS ───────────────────────────

interface FakeVariant {
  variantId: string;
  productId: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  sku: string;
  barcode: string | null;
  skuSource: "AUTO" | "MANUAL" | "IMPORTED";
  optionCodes: string[];
}

interface AuditEntry {
  variantId: string;
  oldSku: string;
  newSku: string;
  batchId: string;
}

class FakeStore {
  product = { id: "p1", slug: "tshirt", title: "T-Shirt" };
  variants: FakeVariant[] = [];
  audits: AuditEntry[] = [];
  failWriteWithConflict = false;
}

function fakeDataAccess(store: FakeStore): SkuDataAccess {
  const toRow = (v: FakeVariant): SkuVariantRow => ({
    variantId: v.variantId,
    status: v.status,
    currentSku: v.sku,
    barcode: v.barcode,
    skuSource: v.skuSource,
    optionCodes: v.optionCodes,
  });
  const ctx: SkuTxContext = {
    lockProduct: async () => {},
    newBatchId: () => "batch-1",
    listVariantsForSku: async (_s, productId) =>
      store.variants.filter((v) => v.productId === productId).map(toRow),
    listStoreSkuValues: async () => store.variants.map((v) => v.sku),
    writeVariantSku: async (_s, _p, input: SkuWriteInput) => {
      if (store.failWriteWithConflict) {
        store.failWriteWithConflict = false;
        const e = new Error("Unique constraint failed") as Error & { code: string };
        e.code = "P2002";
        throw e;
      }
      const v = store.variants.find((x) => x.variantId === input.variantId);
      if (!v) throw new Error("not found");
      // Store-unique simulasyonu.
      if (store.variants.some((x) => x.variantId !== v.variantId && x.sku === input.newSku)) {
        const e = new Error("Unique constraint failed") as Error & { code: string };
        e.code = "P2002";
        throw e;
      }
      v.sku = input.newSku;
      v.skuSource = "AUTO";
      store.audits.push({
        variantId: input.variantId,
        oldSku: input.oldSku,
        newSku: input.newSku,
        batchId: input.batchId,
      });
    },
  };
  return {
    findProduct: async (_s, productId) =>
      productId === store.product.id ? store.product : null,
    listVariantsForSku: async (_s, productId) =>
      store.variants.filter((v) => v.productId === productId).map(toRow),
    listStoreSkuValues: async () => store.variants.map((v) => v.sku),
    findVariantIdBySku: async (_s, sku) =>
      store.variants.find((v) => v.sku === sku)?.variantId ?? null,
    listVariantsForAudit: async (): Promise<SkuAuditVariantRow[]> =>
      store.variants.map((v) => ({ ...toRow(v), productId: v.productId, productSlug: store.product.slug })),
    resolveOptionCodes: async (_s, _p, optionIds) => optionIds.map((id) => id.toUpperCase()),
    transaction: (fn) => fn(ctx),
  };
}

function addVariant(store: FakeStore, over: Partial<FakeVariant>): void {
  store.variants.push({
    variantId: `v${store.variants.length + 1}`,
    productId: "p1",
    status: "ACTIVE",
    sku: "",
    barcode: null,
    skuSource: "AUTO",
    optionCodes: [],
    ...over,
  });
}

describe("TODO-160A · SkuService.regenerate (server-authoritative + audit)", () => {
  it("yalniz degisen non-protected SKU'lari yazar + AuditLog uretir + batchId", async () => {
    const store = new FakeStore();
    addVariant(store, { variantId: "v1", sku: "OLD-1", skuSource: "AUTO", optionCodes: ["BLK"] });
    const svc = createSkuService(fakeDataAccess(store));
    const res = await svc.regenerate({ storeId: "s1", productId: "p1", actorUserId: "admin" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.result.updated).toBe(1);
    expect(res.result.batchId).toBe("batch-1");
    expect(store.variants[0]!.sku).toBe("TSHIRT-BLK");
    expect(store.audits).toHaveLength(1);
    expect(store.audits[0]).toMatchObject({ oldSku: "OLD-1", newSku: "TSHIRT-BLK" });
  });

  it("MANUAL SKU default (onlyAutoSource) KORUNUR → skipped", async () => {
    const store = new FakeStore();
    addVariant(store, { variantId: "v1", sku: "MY-CUSTOM", skuSource: "MANUAL", optionCodes: ["BLK"] });
    const svc = createSkuService(fakeDataAccess(store));
    const res = await svc.regenerate({ storeId: "s1", productId: "p1", actorUserId: "admin" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.result.updated).toBe(0);
    expect(store.variants[0]!.sku).toBe("MY-CUSTOM");
    expect(store.audits).toHaveLength(0);
  });

  it("force → MANUAL dahil yeniden uretilir", async () => {
    const store = new FakeStore();
    addVariant(store, { variantId: "v1", sku: "MY-CUSTOM", skuSource: "MANUAL", optionCodes: ["BLK"] });
    const svc = createSkuService(fakeDataAccess(store));
    const res = await svc.regenerate({ storeId: "s1", productId: "p1", actorUserId: "admin", force: true });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.result.updated).toBe(1);
    expect(store.variants[0]!.sku).toBe("TSHIRT-BLK");
  });

  it("P2002 (yaris) → SKU_CONFLICT (500 sizmaz)", async () => {
    const store = new FakeStore();
    addVariant(store, { variantId: "v1", sku: "OLD-1", skuSource: "AUTO", optionCodes: ["BLK"] });
    store.failWriteWithConflict = true;
    const svc = createSkuService(fakeDataAccess(store));
    const res = await svc.regenerate({ storeId: "s1", productId: "p1", actorUserId: "admin" });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("SKU_CONFLICT");
    expect(skuErrorStatus(res.error.code)).toBe(409);
  });

  it("urun yok → PRODUCT_NOT_FOUND (404)", async () => {
    const store = new FakeStore();
    const svc = createSkuService(fakeDataAccess(store));
    const res = await svc.regenerate({ storeId: "s1", productId: "nope", actorUserId: "admin" });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(skuErrorStatus(res.error.code)).toBe(404);
  });
});

describe("TODO-160A · SkuService.validate (manuel override)", () => {
  it("gecerli + benzersiz → ok", async () => {
    const store = new FakeStore();
    const svc = createSkuService(fakeDataAccess(store));
    const r = await svc.validate({ storeId: "s1", sku: "MY-SKU-1" });
    expect(r).toMatchObject({ ok: true, available: true });
  });
  it("baska varyant almis → available=false", async () => {
    const store = new FakeStore();
    addVariant(store, { variantId: "v1", sku: "TAKEN" });
    const svc = createSkuService(fakeDataAccess(store));
    const r = await svc.validate({ storeId: "s1", sku: "TAKEN" });
    expect(r.available).toBe(false);
    expect(r.ok).toBe(false);
  });
  it("kendi variantId'siyle cakisma yok sayilir", async () => {
    const store = new FakeStore();
    addVariant(store, { variantId: "v1", sku: "TAKEN" });
    const svc = createSkuService(fakeDataAccess(store));
    const r = await svc.validate({ storeId: "s1", sku: "TAKEN", variantId: "v1" });
    expect(r.available).toBe(true);
  });
  it("gecersiz karakter → errors", async () => {
    const store = new FakeStore();
    const svc = createSkuService(fakeDataAccess(store));
    const r = await svc.validate({ storeId: "s1", sku: "bad sku!" });
    expect(r.ok).toBe(false);
    expect(r.errors).toContain("invalid-characters");
  });
});

describe("TODO-160A · SkuService.audit (governance salt-okuma)", () => {
  it("duplicate + bos + opak tespit + ozet", async () => {
    const store = new FakeStore();
    addVariant(store, { variantId: "v1", sku: "DUP", optionCodes: ["BLK"] });
    addVariant(store, { variantId: "v2", sku: "DUP", optionCodes: ["WHT"] });
    addVariant(store, { variantId: "v3", sku: "", optionCodes: ["RED"] });
    addVariant(store, { variantId: "v4", sku: "V-p1-1a2b", optionCodes: ["GRN"] });
    addVariant(store, { variantId: "v5", sku: "CLEAN-1", optionCodes: ["YLW"] });
    const svc = createSkuService(fakeDataAccess(store));
    const r = await svc.audit({ storeId: "s1", limit: 100 });
    expect(r.scanned).toBe(5);
    expect(r.flagged).toBe(4); // v1,v2 (DUP), v3 (EMPTY), v4 (OPAQUE); v5 temiz
    expect(r.summary.DUPLICATE).toBe(2);
    expect(r.summary.SKU_EMPTY).toBe(1);
    expect(r.summary.SKU_OPAQUE).toBe(1);
    // Oneri: bos SKU icin bile deterministik base uretir.
    const emptyRow = r.rows.find((x) => x.variantId === "v3");
    expect(emptyRow?.suggestedSku).toBe("TSHIRT-RED");
  });

  it("limit → truncated", async () => {
    const store = new FakeStore();
    for (let i = 0; i < 5; i++) addVariant(store, { variantId: `v${i}`, sku: "" });
    const svc = createSkuService(fakeDataAccess(store));
    const r = await svc.audit({ storeId: "s1", limit: 2 });
    expect(r.flagged).toBe(5);
    expect(r.rows).toHaveLength(2);
    expect(r.truncated).toBe(true);
  });
});

describe("TODO-160A · SkuService.generateForNewVariant (create auto-gen)", () => {
  it("slug + option kodlari → okunabilir SKU", async () => {
    const store = new FakeStore();
    const svc = createSkuService(fakeDataAccess(store));
    const r = await svc.generateForNewVariant({ storeId: "s1", productId: "p1", optionIds: ["blk", "m"] });
    expect(r?.sku).toBe("TSHIRT-BLK-M");
  });
  it("store collision → sonek", async () => {
    const store = new FakeStore();
    addVariant(store, { variantId: "v1", sku: "TSHIRT-BLK" });
    const svc = createSkuService(fakeDataAccess(store));
    const r = await svc.generateForNewVariant({ storeId: "s1", productId: "p1", optionIds: ["blk"] });
    expect(r?.sku).toBe("TSHIRT-BLK-002");
  });
  it("option yok (basit urun) → yalniz slug", async () => {
    const store = new FakeStore();
    const svc = createSkuService(fakeDataAccess(store));
    const r = await svc.generateForNewVariant({ storeId: "s1", productId: "p1", optionIds: [] });
    expect(r?.sku).toBe("TSHIRT");
  });
});

// ─────────────────────────── HTTP UÇLARI (Fastify inject) ───────────────────────────

function buildApp(store: FakeStore) {
  const app = Fastify();
  attachErrorHandler(app);
  registerSkuRoutes(app, {
    service: createSkuService(fakeDataAccess(store)),
    requireStoreAdmin: async () => ({ actorUserId: "admin" }),
  });
  return app;
}

describe("TODO-160A · SKU HTTP uclari", () => {
  let app: ReturnType<typeof Fastify>;
  afterEach(async () => {
    await app?.close();
  });

  it("POST .../sku/preview → oneri satirlari", async () => {
    const store = new FakeStore();
    addVariant(store, { variantId: "v1", sku: "OLD", skuSource: "AUTO", optionCodes: ["BLK"] });
    app = buildApp(store);
    const res = await app.inject({
      method: "POST",
      url: "/stores/s1/products/p1/sku/preview",
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.rows[0].suggestedSku).toBe("TSHIRT-BLK");
    expect(body.counts.changed).toBe(1);
  });

  it("POST .../sku/regenerate → yazar + updated", async () => {
    const store = new FakeStore();
    addVariant(store, { variantId: "v1", sku: "OLD", skuSource: "AUTO", optionCodes: ["BLK"] });
    app = buildApp(store);
    const res = await app.inject({
      method: "POST",
      url: "/stores/s1/products/p1/sku/regenerate",
      payload: { onlyAutoSource: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().updated).toBe(1);
    expect(store.variants[0]!.sku).toBe("TSHIRT-BLK");
  });

  it("POST .../sku/validate → benzersizlik", async () => {
    const store = new FakeStore();
    addVariant(store, { variantId: "v1", sku: "TAKEN" });
    app = buildApp(store);
    const res = await app.inject({
      method: "POST",
      url: "/stores/s1/sku/validate",
      payload: { sku: "TAKEN" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().available).toBe(false);
  });

  it("GET .../sku/audit → rapor", async () => {
    const store = new FakeStore();
    addVariant(store, { variantId: "v1", sku: "" });
    app = buildApp(store);
    const res = await app.inject({ method: "GET", url: "/stores/s1/sku/audit" });
    expect(res.statusCode).toBe(200);
    expect(res.json().flagged).toBe(1);
  });
});
