import Fastify from "fastify";
import { z } from "zod";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// createServer'in ZodError→400 handler'inin izole karsiligi (gercek sunucu davranisi).
function attachErrorHandler(app: ReturnType<typeof Fastify>) {
  app.setErrorHandler(async (error, _request, reply) => {
    if (error instanceof z.ZodError) {
      await reply.code(400).send({ error: { code: "VALIDATION_ERROR", message: "Validation failed." } });
      return;
    }
    throw error;
  });
}

// data.js -> @commerce-os/db (prisma) import eder; testte gercek prisma init'ini engelle.
vi.mock("@commerce-os/db", () => ({ prisma: {} }));

const engine = await import("../src/variant-combinations/engine.js");
const { generateVariantCombinations, buildCombinationKey, buildPreviewId } = engine;
type CombinationAxisInput = import("../src/variant-combinations/engine.js").CombinationAxisInput;

const { createVariantCombinationPreviewService } = await import(
  "../src/variant-combinations/service.js"
);
const { registerVariantCombinationRoutes } = await import("../src/variant-combinations/routes.js");
import type {
  CombinationOptionMeta,
  ProductOwnershipRef,
  VariantCombinationDataAccess,
} from "../src/variant-combinations/data.js";
import type { ProductVariantSelectionRecord } from "../src/variant-selections/data.js";

// Kucuk yardimci: eksen girdisi olustur.
function axis(
  attributeDefinitionId: string,
  position: number,
  options: Array<[optionId: string, position: number, label?: string | null, archived?: boolean]>,
): CombinationAxisInput {
  return {
    attributeDefinitionId,
    position,
    options: options.map(([optionId, pos, label, archived]) => ({
      optionId,
      position: pos,
      label: label ?? null,
      archived: archived ?? false,
    })),
  };
}

const LIMIT = { maxCombinations: 1000 };

// ─────────────────────────────── SAF MOTOR ───────────────────────────────

describe("Faz 2C-2 — generateVariantCombinations (saf motor)", () => {
  it("tek eksen tek option → tek kombinasyon", () => {
    const res = generateVariantCombinations([axis("color", 0, [["black", 0, "Siyah"]])], LIMIT);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.result.axisCount).toBe(1);
    expect(res.result.totalCombinations).toBe(1);
    expect(res.result.combinations).toHaveLength(1);
    expect(res.result.combinations[0]!.optionIds).toEqual(["black"]);
    expect(res.result.combinations[0]!.optionLabels).toEqual(["Siyah"]);
  });

  it("tek eksen çok option → her option bir kombinasyon", () => {
    const res = generateVariantCombinations(
      [axis("color", 0, [["black", 0], ["white", 1], ["blue", 2]])],
      LIMIT,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.result.totalCombinations).toBe(3);
    expect(res.result.combinations.map((c) => c.optionIds[0])).toEqual(["black", "white", "blue"]);
  });

  it("iki eksen → Cartesian çarpım (2×2=4)", () => {
    const res = generateVariantCombinations(
      [axis("color", 0, [["black", 0], ["white", 1]]), axis("size", 1, [["s", 0], ["m", 1]])],
      LIMIT,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.result.totalCombinations).toBe(4);
    // Son eksen en hızlı döner (odometer).
    expect(res.result.combinations.map((c) => c.optionIds.join("/"))).toEqual([
      "black/s",
      "black/m",
      "white/s",
      "white/m",
    ]);
  });

  it("2 eksen × 10 option = 100 kombinasyon", () => {
    const ten = (prefix: string) =>
      Array.from({ length: 10 }, (_, i) => [`${prefix}${i}`, i] as [string, number]);
    const res = generateVariantCombinations(
      [axis("a", 0, ten("a")), axis("b", 1, ten("b"))],
      LIMIT,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.result.totalCombinations).toBe(100);
    expect(res.result.combinations).toHaveLength(100);
  });

  // ── Canonical ordering ──
  it("kanonik eksen sırası: position ASC → attributeDefinitionId ASC", () => {
    // Girdi karışık: yüksek position önce, eşit position'da id sırası.
    const res = generateVariantCombinations(
      [
        axis("zeta", 5, [["z0", 0]]),
        axis("beta", 1, [["b0", 0]]),
        axis("alpha", 1, [["a0", 0]]), // beta ile eşit position → id ASC: alpha önce
      ],
      LIMIT,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.result.combinations[0]!.attributes.map((a) => a.attributeDefinitionId)).toEqual([
      "alpha",
      "beta",
      "zeta",
    ]);
  });

  it("kanonik option sırası: position ASC → optionId ASC", () => {
    const res = generateVariantCombinations(
      [axis("color", 0, [["blue", 2], ["black", 0], ["azure", 0]])],
      LIMIT,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // position: azure(0)/black(0) eşit → id ASC (azure<black), sonra blue(2).
    expect(res.result.combinations.map((c) => c.optionIds[0])).toEqual(["azure", "black", "blue"]);
  });

  // ── Determinizm / idempotency / input-order bağımsızlığı ──
  it("deterministik: aynı input iki kez → birebir aynı output", () => {
    const input = [
      axis("color", 0, [["black", 0], ["white", 1]]),
      axis("size", 1, [["s", 0], ["m", 1]]),
    ];
    const a = generateVariantCombinations(input, LIMIT);
    const b = generateVariantCombinations(input, LIMIT);
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it("idempotent: motor girdiyi mutasyona uğratmaz", () => {
    const input = [axis("color", 0, [["white", 1], ["black", 0]])];
    const snapshot = JSON.stringify(input);
    generateVariantCombinations(input, LIMIT);
    generateVariantCombinations(input, LIMIT);
    expect(JSON.stringify(input)).toEqual(snapshot);
  });

  it("input sırası sonucu DEĞİŞTİRMEZ (eksen + option karışık)", () => {
    const ordered = generateVariantCombinations(
      [axis("color", 0, [["black", 0], ["white", 1]]), axis("size", 1, [["s", 0], ["m", 1]])],
      LIMIT,
    );
    const shuffled = generateVariantCombinations(
      [
        axis("size", 1, [["m", 1], ["s", 0]]),
        axis("color", 0, [["white", 1], ["black", 0]]),
      ],
      LIMIT,
    );
    expect(shuffled.ok && ordered.ok).toBe(true);
    if (!ordered.ok || !shuffled.ok) return;
    expect(shuffled.result.combinations.map((c) => c.combinationKey)).toEqual(
      ordered.result.combinations.map((c) => c.combinationKey),
    );
  });

  // ── Duplicate önleme ──
  it("duplicate option → tekilleştirilir", () => {
    const res = generateVariantCombinations(
      [axis("color", 0, [["black", 0], ["black", 0], ["white", 1]])],
      LIMIT,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.result.totalCombinations).toBe(2);
    expect(res.result.combinations.map((c) => c.optionIds[0])).toEqual(["black", "white"]);
  });

  it("duplicate axis → option kümeleri birleştirilir (union), tek eksen olur", () => {
    const res = generateVariantCombinations(
      [axis("color", 0, [["black", 0]]), axis("color", 0, [["white", 1]])],
      LIMIT,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.result.axisCount).toBe(1);
    expect(res.result.totalCombinations).toBe(2);
    expect(res.result.combinations.map((c) => c.optionIds[0])).toEqual(["black", "white"]);
  });

  // ── Archived / empty ──
  it("archived option kombinasyona GİRMEZ", () => {
    const res = generateVariantCombinations(
      [axis("color", 0, [["black", 0], ["white", 1, "Beyaz", true]])],
      LIMIT,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.result.totalCombinations).toBe(1);
    expect(res.result.combinations[0]!.optionIds).toEqual(["black"]);
  });

  it("empty axis (tüm option'ları archived/boş) DÜŞÜRÜLÜR", () => {
    const res = generateVariantCombinations(
      [
        axis("color", 0, [["black", 0]]),
        axis("size", 1, [["s", 0, "S", true]]), // tek option archived → eksen boş
      ],
      LIMIT,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.result.axisCount).toBe(1);
    expect(res.result.totalCombinations).toBe(1);
    expect(res.result.combinations[0]!.optionIds).toEqual(["black"]);
  });

  it("hiç eksen yok / boş seçim → 0 kombinasyon (boş çarpım 1 DEĞİL)", () => {
    const res = generateVariantCombinations([], LIMIT);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.result.axisCount).toBe(0);
    expect(res.result.totalCombinations).toBe(0);
    expect(res.result.combinations).toEqual([]);
  });

  // ── combinationKey + previewId ──
  it("combinationKey ID-tabanlı + segmentler attrId'ye göre sıralı (rename/position bağımsız)", () => {
    const res = generateVariantCombinations(
      [axis("size", 5, [["m", 9, "Etiket-A"]]), axis("color", 0, [["black", 3, "Siyah"]])],
      LIMIT,
    );
    if (!res.ok) return;
    expect(res.result.combinations[0]!.combinationKey).toBe("v1|color:black|size:m");
  });

  it("combinationKey etiket değişiminden bağımsızdır (stabil kimlik)", () => {
    const withLabel = generateVariantCombinations([axis("color", 0, [["black", 0, "Siyah"]])], LIMIT);
    const renamed = generateVariantCombinations([axis("color", 0, [["black", 0, "Kömür"]])], LIMIT);
    if (!withLabel.ok || !renamed.ok) return;
    expect(renamed.result.combinations[0]!.combinationKey).toBe(
      withLabel.result.combinations[0]!.combinationKey,
    );
  });

  it("previewId deterministik + random DEĞİL (combinationKey'den türer)", () => {
    const key = buildCombinationKey([{ attributeDefinitionId: "color", optionId: "black" }]);
    expect(buildPreviewId(key)).toBe(buildPreviewId(key));
    expect(buildPreviewId(key)).toMatch(/^pv_[0-9a-f]{14}$/);
    // Farklı kombinasyon → farklı previewId.
    const other = buildCombinationKey([{ attributeDefinitionId: "color", optionId: "white" }]);
    expect(buildPreviewId(other)).not.toBe(buildPreviewId(key));
  });

  it("her kombinasyonun previewId'i benzersiz (100 kombinasyon)", () => {
    const ten = (p: string) =>
      Array.from({ length: 10 }, (_, i) => [`${p}${i}`, i] as [string, number]);
    const res = generateVariantCombinations([axis("a", 0, ten("a")), axis("b", 1, ten("b"))], LIMIT);
    if (!res.ok) return;
    const ids = new Set(res.result.combinations.map((c) => c.previewId));
    const keys = new Set(res.result.combinations.map((c) => c.combinationKey));
    expect(ids.size).toBe(100);
    expect(keys.size).toBe(100);
  });

  // ── Runtime guard / config limit ──
  it("performance guard: limit aşılırsa PREVIEW_LIMIT_EXCEEDED (materialize edilmez)", () => {
    const res = generateVariantCombinations(
      [axis("a", 0, [["a0", 0], ["a1", 1]]), axis("b", 1, [["b0", 0], ["b1", 1]])],
      { maxCombinations: 3 }, // 2×2=4 > 3
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("PREVIEW_LIMIT_EXCEEDED");
    expect(res.error.totalCombinations).toBe(4);
    expect(res.error.limit).toBe(3);
  });

  it("config limit sınırda (tam limit kadar) → üretilir", () => {
    const res = generateVariantCombinations(
      [axis("a", 0, [["a0", 0], ["a1", 1]]), axis("b", 1, [["b0", 0], ["b1", 1]])],
      { maxCombinations: 4 },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.result.totalCombinations).toBe(4);
  });

  // ── Büyük veri / stress ──
  it("3 eksen → 100 kombinasyon", () => {
    const res = generateVariantCombinations(
      [
        axis("a", 0, Array.from({ length: 5 }, (_, i) => [`a${i}`, i] as [string, number])),
        axis("b", 1, Array.from({ length: 5 }, (_, i) => [`b${i}`, i] as [string, number])),
        axis("c", 2, Array.from({ length: 4 }, (_, i) => [`c${i}`, i] as [string, number])),
      ],
      LIMIT,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.result.totalCombinations).toBe(100);
  });

  it("5 eksen → 1000+ kombinasyon (guard yeterince yüksekken doğru üretir)", () => {
    const bigLimit = { maxCombinations: 100_000 };
    const mk = (name: string, n: number) =>
      axis(name, 0, Array.from({ length: n }, (_, i) => [`${name}${i}`, i] as [string, number]));
    // 4 × 4 × 4 × 4 × 4 = 1024
    const res = generateVariantCombinations(
      [mk("a", 4), mk("b", 4), mk("c", 4), mk("d", 4), mk("e", 4)],
      bigLimit,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.result.axisCount).toBe(5);
    expect(res.result.totalCombinations).toBe(1024);
    expect(res.result.combinations).toHaveLength(1024);
    // Determinizm büyük veride de: previewId'ler benzersiz.
    expect(new Set(res.result.combinations.map((c) => c.previewId)).size).toBe(1024);
  });
});

// ─────────────────────────── SERVICE + DATA ACCESS ───────────────────────────

const STORE = "store_demo";
const OTHER = "store_other";

class MemoryCombinationData implements VariantCombinationDataAccess {
  products: ProductOwnershipRef[] = [];
  productStore = new Map<string, string>(); // productId → storeId
  selections: ProductVariantSelectionRecord[] = [];
  optionMeta: CombinationOptionMeta[] = [];

  async findProductForStore(storeId: string, productId: string) {
    if (this.productStore.get(productId) !== storeId) return null;
    return this.products.find((p) => p.id === productId) ?? null;
  }
  async listProductVariantSelections(storeId: string, productId: string) {
    return this.selections
      .filter((s) => s.storeId === storeId && s.productId === productId)
      .sort((a, b) => a.position - b.position);
  }
  async findAttributeOptionsMeta(optionIds: string[]) {
    return this.optionMeta.filter((m) => optionIds.includes(m.id));
  }
}

function seedService() {
  const da = new MemoryCombinationData();
  da.products.push({ id: "prod_1", primaryCategoryId: "cat_1" });
  da.productStore.set("prod_1", STORE);
  da.products.push({ id: "prod_empty", primaryCategoryId: "cat_1" });
  da.productStore.set("prod_empty", STORE);

  const rec = (
    attributeDefinitionId: string,
    position: number,
    optionIds: string[],
  ): ProductVariantSelectionRecord => ({
    id: `pva_${attributeDefinitionId}`,
    storeId: STORE,
    productId: "prod_1",
    attributeDefinitionId,
    dataType: "SELECT",
    position,
    optionIds,
    createdAt: new Date("2026-07-17T00:00:00.000Z"),
    updatedAt: new Date("2026-07-17T00:00:00.000Z"),
  });
  da.selections.push(rec("color", 0, ["black", "white"]));
  da.selections.push(rec("size", 1, ["s", "m"]));

  const meta = (id: string, label: string, status: "ACTIVE" | "ARCHIVED" = "ACTIVE") =>
    da.optionMeta.push({ id, label, status });
  meta("black", "Siyah");
  meta("white", "Beyaz");
  meta("s", "S");
  meta("m", "M");

  return da;
}

describe("Faz 2C-2 — variantCombinationPreviewService", () => {
  it("kalıcı reçeteden Cartesian önizleme üretir (2×2=4)", async () => {
    const da = seedService();
    const service = createVariantCombinationPreviewService(da, { maxCombinations: 1000 });
    const res = await service.previewCombinations({ storeId: STORE, productId: "prod_1" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.preview.totalCombinations).toBe(4);
    expect(res.preview.combinations[0]!.optionLabels).toEqual(["Siyah", "S"]);
  });

  it("ürün başka mağazaya aitse PRODUCT_NOT_FOUND (tenant mismatch)", async () => {
    const da = seedService();
    const service = createVariantCombinationPreviewService(da, { maxCombinations: 1000 });
    const res = await service.previewCombinations({ storeId: OTHER, productId: "prod_1" });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("PRODUCT_NOT_FOUND");
  });

  it("seçim yoksa 0 kombinasyon (boş seçim)", async () => {
    const da = seedService();
    const service = createVariantCombinationPreviewService(da, { maxCombinations: 1000 });
    const res = await service.previewCombinations({ storeId: STORE, productId: "prod_empty" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.preview.totalCombinations).toBe(0);
    expect(res.preview.combinations).toEqual([]);
  });

  it("archived olmuş option önizlemeden çıkar", async () => {
    const da = seedService();
    da.optionMeta = da.optionMeta.map((m) =>
      m.id === "white" ? { ...m, status: "ARCHIVED" } : m,
    );
    const service = createVariantCombinationPreviewService(da, { maxCombinations: 1000 });
    const res = await service.previewCombinations({ storeId: STORE, productId: "prod_1" });
    if (!res.ok) return;
    // color: yalnız black kaldı → 1×2 = 2
    expect(res.preview.totalCombinations).toBe(2);
  });

  it("guard: config limitini aşınca PREVIEW_LIMIT_EXCEEDED (+ ayrıntı)", async () => {
    const da = seedService();
    const service = createVariantCombinationPreviewService(da, { maxCombinations: 3 });
    const res = await service.previewCombinations({ storeId: STORE, productId: "prod_1" });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("PREVIEW_LIMIT_EXCEEDED");
    expect(res.error.totalCombinations).toBe(4);
    expect(res.error.limit).toBe(3);
  });
});

// ─────────────────────────────── ROUTE ───────────────────────────────

function buildApp(opts?: {
  storeAdmin?: (storeId: string) => { actorUserId: string } | null;
  maxCombinations?: number;
}) {
  const da = seedService();
  const service = createVariantCombinationPreviewService(da, {
    maxCombinations: opts?.maxCombinations ?? 1000,
  });
  const app = Fastify();
  attachErrorHandler(app);
  registerVariantCombinationRoutes(app, {
    service,
    requireStoreAdmin: async (_request, reply, storeId) => {
      const actor = opts?.storeAdmin ? opts.storeAdmin(storeId) : { actorUserId: "admin_1" };
      if (!actor) {
        await reply.code(403).send({ error: { code: "FORBIDDEN", message: "Forbidden." } });
        return null;
      }
      return actor;
    },
  });
  return { app, da };
}

let ctx: ReturnType<typeof buildApp>;
afterEach(async () => {
  if (ctx?.app) await ctx.app.close();
});

describe("Faz 2C-2 — variant-combinations preview route", () => {
  beforeEach(() => {
    ctx = buildApp();
  });

  it("GET preview → 200 + kombinasyon listesi", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: `/stores/${STORE}/products/prod_1/variant-combinations/preview`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.axisCount).toBe(2);
    expect(body.totalCombinations).toBe(4);
    expect(body.combinations).toHaveLength(4);
    expect(body.combinations[0].combinationKey).toMatch(/^v1\|/);
    expect(body.combinations[0].previewId).toMatch(/^pv_/);
  });

  it("ürün yoksa 404 PRODUCT_NOT_FOUND", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: `/stores/${STORE}/products/prod_missing/variant-combinations/preview`,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("PRODUCT_NOT_FOUND");
  });

  it("guard aşımı → 422 PREVIEW_LIMIT_EXCEEDED (+ totalCombinations/limit)", async () => {
    ctx = buildApp({ maxCombinations: 3 });
    const res = await ctx.app.inject({
      method: "GET",
      url: `/stores/${STORE}/products/prod_1/variant-combinations/preview`,
    });
    expect(res.statusCode).toBe(422);
    const err = res.json().error;
    expect(err.code).toBe("PREVIEW_LIMIT_EXCEEDED");
    expect(err.totalCombinations).toBe(4);
    expect(err.limit).toBe(3);
  });

  it("yetkisiz → 403 (requireStoreAdmin)", async () => {
    ctx = buildApp({ storeAdmin: () => null });
    const res = await ctx.app.inject({
      method: "GET",
      url: `/stores/${STORE}/products/prod_1/variant-combinations/preview`,
    });
    expect(res.statusCode).toBe(403);
  });
});
