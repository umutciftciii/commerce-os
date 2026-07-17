import Fastify from "fastify";
import { z } from "zod";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

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
// (Bu suite prisma-backed data-access'i KULLANMAZ; saf diff + in-memory fake + route test eder.)
import { vi } from "vitest";
vi.mock("@commerce-os/db", () => ({ prisma: {} }));

const { diffVariantCombinations } = await import("../src/variant-generation/diff-engine.js");
type DiffExistingVariant = import("../src/variant-generation/diff-engine.js").DiffExistingVariant;

const { createVariantGenerationService } = await import("../src/variant-generation/service.js");
const { registerVariantGenerationRoutes } = await import("../src/variant-generation/routes.js");
import type {
  AppliedVariant,
  GenerationExistingVariant,
  GenerationOptionMeta,
  GenerationRecipeAxis,
  GenerationTxContext,
  NewGeneratedVariantInput,
  VariantGenerationDataAccess,
} from "../src/variant-generation/data.js";

// ─────────────────────────────── SAF DIFF MOTORU ───────────────────────────────

function existing(
  id: string,
  combinationKey: string | null,
  opts?: { source?: "MANUAL" | "ATTRIBUTE_COMBINATION"; archived?: boolean },
): DiffExistingVariant {
  return {
    id,
    combinationKey,
    generationSource: opts?.source ?? "ATTRIBUTE_COMBINATION",
    archived: opts?.archived ?? false,
  };
}
const target = (combinationKey: string) => ({ combinationKey });

describe("Faz 2C-3 — diffVariantCombinations (saf motor)", () => {
  it("empty existing / populated target → hepsi toCreate", () => {
    const diff = diffVariantCombinations([], [target("a"), target("b")]);
    expect(diff.toCreate.map((c) => c.combinationKey)).toEqual(["a", "b"]);
    expect(diff.toKeep).toHaveLength(0);
    expect(diff.toRestore).toHaveLength(0);
    expect(diff.toArchive).toHaveLength(0);
  });

  it("populated existing / same target → hepsi toKeep (write yok)", () => {
    const diff = diffVariantCombinations(
      [existing("v1", "a"), existing("v2", "b")],
      [target("a"), target("b")],
    );
    expect(diff.toKeep.map((v) => v.id).sort()).toEqual(["v1", "v2"]);
    expect(diff.toCreate).toHaveLength(0);
    expect(diff.toArchive).toHaveLength(0);
    expect(diff.toRestore).toHaveLength(0);
  });

  it("create diff → yeni hedef", () => {
    const diff = diffVariantCombinations([existing("v1", "a")], [target("a"), target("c")]);
    expect(diff.toCreate.map((c) => c.combinationKey)).toEqual(["c"]);
    expect(diff.toKeep.map((v) => v.id)).toEqual(["v1"]);
  });

  it("archive diff → hedefte olmayan aktif generated", () => {
    const diff = diffVariantCombinations([existing("v1", "a"), existing("v2", "b")], [target("a")]);
    expect(diff.toKeep.map((v) => v.id)).toEqual(["v1"]);
    expect(diff.toArchive.map((v) => v.id)).toEqual(["v2"]);
  });

  it("restore diff → arsivli kayit hedefe geri girdi", () => {
    const diff = diffVariantCombinations(
      [existing("v1", "a", { archived: true })],
      [target("a")],
    );
    expect(diff.toRestore.map((v) => v.id)).toEqual(["v1"]);
    expect(diff.toCreate).toHaveLength(0); // yeni satir ACILMAZ
  });

  it("mixed create/keep/restore/archive", () => {
    const diff = diffVariantCombinations(
      [
        existing("keep", "a"),
        existing("restore", "b", { archived: true }),
        existing("archive", "c"),
      ],
      [target("a"), target("b"), target("d")],
    );
    expect(diff.toKeep.map((v) => v.id)).toEqual(["keep"]);
    expect(diff.toRestore.map((v) => v.id)).toEqual(["restore"]);
    expect(diff.toArchive.map((v) => v.id)).toEqual(["archive"]);
    expect(diff.toCreate.map((c) => c.combinationKey)).toEqual(["d"]);
  });

  it("input order independence → cikti deterministik", () => {
    const a = diffVariantCombinations(
      [existing("v2", "b"), existing("v1", "a")],
      [target("b"), target("a"), target("c")],
    );
    const b = diffVariantCombinations(
      [existing("v1", "a"), existing("v2", "b")],
      [target("c"), target("a"), target("b")],
    );
    expect(a).toEqual(b);
    expect(a.toCreate.map((c) => c.combinationKey)).toEqual(["c"]);
    expect(a.toKeep.map((v) => v.id)).toEqual(["v1", "v2"]);
  });

  it("duplicate existing detection → fazla aktif kayit arsivlenir", () => {
    const diff = diffVariantCombinations(
      [existing("v1", "a"), existing("v1dup", "a")],
      [target("a")],
    );
    expect(diff.toKeep).toHaveLength(1);
    expect(diff.toArchive).toHaveLength(1);
    // Kalan (keep) + fazlalik (archive) birlikte iki farkli id.
    expect([...diff.toKeep, ...diff.toArchive].map((v) => v.id).sort()).toEqual(["v1", "v1dup"]);
  });

  it("manual variant exclusion → manuel varyant hicbir gruba karismaz", () => {
    const diff = diffVariantCombinations(
      [existing("m1", null, { source: "MANUAL" }), existing("g1", "a")],
      [target("a")],
    );
    expect(diff.manualVariants.map((v) => v.id)).toEqual(["m1"]);
    expect(diff.toKeep.map((v) => v.id)).toEqual(["g1"]);
    expect(diff.toArchive).toHaveLength(0);
  });

  it("zaten arsivli hedefte-olmayan generated → tekrar archive edilmez (idempotent)", () => {
    const diff = diffVariantCombinations([existing("v1", "z", { archived: true })], [target("a")]);
    expect(diff.toArchive).toHaveLength(0);
    expect(diff.toCreate.map((c) => c.combinationKey)).toEqual(["a"]);
  });

  it("input mutation YOK (girdi degistirilmez)", () => {
    const ex = [existing("v1", "a")];
    const tg = [target("a"), target("b")];
    const snapEx = JSON.parse(JSON.stringify(ex));
    const snapTg = JSON.parse(JSON.stringify(tg));
    diffVariantCombinations(ex, tg);
    expect(ex).toEqual(snapEx);
    expect(tg).toEqual(snapTg);
  });
});

// ─────────────────────────────── IN-MEMORY FAKE ───────────────────────────────
// Prisma-backed data-access'in izole (gercek DB'siz) karsiligi. Unique (productId, combinationKey)
// ve (storeId, sku) kisitlarini + create/restore/archive + updatedAt sayacini taklit eder.

interface FakeVariant {
  id: string;
  storeId: string;
  productId: string;
  combinationKey: string | null;
  generationSource: "MANUAL" | "ATTRIBUTE_COMBINATION";
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  title: string;
  sku: string;
  currency: string;
  priceMinor: number;
  archivedAt: number | null;
  updatedAt: number; // yazim sayaci (idempotentlik kaniti icin)
  optionValues: Array<{ attributeDefinitionId: string; optionId: string }>;
}

interface UniqueConflictError extends Error {
  code: string;
}
function p2002(): UniqueConflictError {
  const e = new Error("Unique constraint failed") as UniqueConflictError;
  e.code = "P2002";
  return e;
}

class FakeStore {
  products = new Map<string, { id: string; storeId: string }>();
  recipes = new Map<string, GenerationRecipeAxis[]>(); // key: storeId|productId
  optionMeta = new Map<string, GenerationOptionMeta>();
  variants: FakeVariant[] = [];
  seq = 0;
  clock = 0;
  // Test hook: createVariant sirasinda bir kez P2002 firlat (concurrency conflict simulasyonu).
  failNextCreateWithConflict = false;

  key(storeId: string, productId: string) {
    return `${storeId}|${productId}`;
  }
  setRecipe(storeId: string, productId: string, recipe: GenerationRecipeAxis[]) {
    this.recipes.set(this.key(storeId, productId), recipe);
  }
  setOption(id: string, label: string, status: "ACTIVE" | "ARCHIVED" = "ACTIVE") {
    this.optionMeta.set(id, { id, label, status });
  }
}

function fakeDataAccess(store: FakeStore): VariantGenerationDataAccess {
  const ctx: GenerationTxContext = {
    lockProduct: async () => {},
    listRecipe: async (storeId, productId) => store.recipes.get(store.key(storeId, productId)) ?? [],
    findOptionMeta: async (optionIds) =>
      optionIds.map((id) => store.optionMeta.get(id)).filter((m): m is GenerationOptionMeta => !!m),
    listExistingVariants: async (storeId, productId): Promise<GenerationExistingVariant[]> =>
      store.variants
        .filter((v) => v.storeId === storeId && v.productId === productId)
        .map((v) => ({
          id: v.id,
          combinationKey: v.combinationKey,
          generationSource: v.generationSource,
          status: v.status,
          title: v.title,
          sku: v.sku,
          currency: v.currency,
        })),
    createVariant: async (storeId, productId, input: NewGeneratedVariantInput): Promise<AppliedVariant> => {
      if (store.failNextCreateWithConflict) {
        store.failNextCreateWithConflict = false;
        throw p2002();
      }
      // Unique (productId, combinationKey) — arsivli dahil.
      if (store.variants.some((v) => v.productId === productId && v.combinationKey === input.combinationKey)) {
        throw p2002();
      }
      // Unique (storeId, sku).
      if (store.variants.some((v) => v.storeId === storeId && v.sku === input.sku)) throw p2002();
      const rec: FakeVariant = {
        id: `gen_${++store.seq}`,
        storeId,
        productId,
        combinationKey: input.combinationKey,
        generationSource: "ATTRIBUTE_COMBINATION",
        status: "DRAFT",
        title: input.title,
        sku: input.sku,
        currency: input.currency,
        priceMinor: 0,
        archivedAt: null,
        updatedAt: ++store.clock,
        optionValues: input.optionValues.map((o) => ({ ...o })),
      };
      store.variants.push(rec);
      return { id: rec.id, combinationKey: rec.combinationKey, title: rec.title, sku: rec.sku, status: rec.status };
    },
    restoreVariant: async (storeId, productId, variantId): Promise<AppliedVariant> => {
      const rec = store.variants.find(
        (v) => v.id === variantId && v.storeId === storeId && v.productId === productId,
      );
      if (!rec) throw new Error("not found");
      rec.status = "DRAFT";
      rec.archivedAt = null;
      rec.updatedAt = ++store.clock;
      return { id: rec.id, combinationKey: rec.combinationKey, title: rec.title, sku: rec.sku, status: rec.status };
    },
    archiveVariant: async (storeId, productId, variantId) => {
      const rec = store.variants.find(
        (v) => v.id === variantId && v.storeId === storeId && v.productId === productId,
      );
      if (!rec) throw new Error("not found");
      rec.status = "ARCHIVED";
      rec.archivedAt = ++store.clock;
      rec.updatedAt = store.clock;
    },
  };

  return {
    findProductForStore: async (storeId, productId) => {
      const p = store.products.get(`${storeId}|${productId}`);
      return p ? { id: p.id, primaryCategoryId: null } : null;
    },
    transaction: (fn) => fn(ctx),
  };
}

const STORE = "store_1";
const PRODUCT = "prod_1";

// Reçete kurulum yardımcısı (Color/Size eksenleri).
function twoAxisRecipe(colors: string[], sizes: string[]): GenerationRecipeAxis[] {
  return [
    { attributeDefinitionId: "color", position: 0, optionIds: colors },
    { attributeDefinitionId: "size", position: 1, optionIds: sizes },
  ];
}

function setupStore(): FakeStore {
  const store = new FakeStore();
  store.products.set(`${STORE}|${PRODUCT}`, { id: PRODUCT, storeId: STORE });
  for (const id of ["red", "blue", "green"]) store.setOption(id, id.toUpperCase());
  for (const id of ["s", "m"]) store.setOption(id, id.toUpperCase());
  return store;
}

function makeService(store: FakeStore, maxCombinations = 1000) {
  return createVariantGenerationService(fakeDataAccess(store), { maxCombinations });
}

async function run(store: FakeStore, maxCombinations = 1000) {
  const svc = makeService(store, maxCombinations);
  return svc.generate({ storeId: STORE, productId: PRODUCT });
}

// ─────────────────────────────── PERSISTENCE SERVICE ───────────────────────────────

describe("Faz 2C-3 — variantGenerationService (in-memory)", () => {
  it("first generation → 2×2 = 4 varyant olusur (DRAFT)", async () => {
    const store = setupStore();
    store.setRecipe(STORE, PRODUCT, twoAxisRecipe(["red", "blue"], ["s", "m"]));
    const res = await run(store);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.summary).toMatchObject({ totalTarget: 4, created: 4, kept: 0, restored: 0, archived: 0 });
    expect(store.variants).toHaveLength(4);
    expect(store.variants.every((v) => v.status === "DRAFT")).toBe(true);
    expect(store.variants.every((v) => v.generationSource === "ATTRIBUTE_COMBINATION")).toBe(true);
    // Normalize selection = combinationKey ile tutarli (2 eksen degeri).
    expect(store.variants.every((v) => v.optionValues.length === 2)).toBe(true);
  });

  it("repeated generation idempotency → created/restored/archived = 0; ID/SKU/updatedAt korunur", async () => {
    const store = setupStore();
    store.setRecipe(STORE, PRODUCT, twoAxisRecipe(["red", "blue"], ["s", "m"]));
    await run(store);
    const snapshot = store.variants.map((v) => ({ id: v.id, sku: v.sku, updatedAt: v.updatedAt }));
    const res = await run(store);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.summary).toMatchObject({ created: 0, kept: 4, restored: 0, archived: 0 });
    expect(store.variants).toHaveLength(4);
    // keep write YAPMAZ → updatedAt aynen kalir.
    expect(store.variants.map((v) => ({ id: v.id, sku: v.sku, updatedAt: v.updatedAt }))).toEqual(snapshot);
  });

  it("incremental option addition → yalniz yeni kombinasyonlar olusur", async () => {
    const store = setupStore();
    store.setRecipe(STORE, PRODUCT, twoAxisRecipe(["red", "blue"], ["s", "m"]));
    await run(store);
    store.setRecipe(STORE, PRODUCT, twoAxisRecipe(["red", "blue", "green"], ["s", "m"]));
    const res = await run(store);
    if (!res.ok) return;
    expect(res.summary).toMatchObject({ totalTarget: 6, created: 2, kept: 4, archived: 0 });
    expect(store.variants.filter((v) => v.status !== "ARCHIVED")).toHaveLength(6);
  });

  it("option removal → yalniz kaldirilan kombinasyonlar archive edilir", async () => {
    const store = setupStore();
    store.setRecipe(STORE, PRODUCT, twoAxisRecipe(["red", "blue"], ["s", "m"]));
    await run(store);
    store.setRecipe(STORE, PRODUCT, twoAxisRecipe(["red"], ["s", "m"]));
    const res = await run(store);
    if (!res.ok) return;
    expect(res.summary).toMatchObject({ created: 0, kept: 2, archived: 2 });
    expect(store.variants.filter((v) => v.status === "ARCHIVED")).toHaveLength(2);
    expect(store.variants.filter((v) => v.status === "ARCHIVED").every((v) => v.archivedAt !== null)).toBe(true);
  });

  it("option restore → ayni ID/SKU/price korunur; yeni satir ACILMAZ", async () => {
    const store = setupStore();
    store.setRecipe(STORE, PRODUCT, twoAxisRecipe(["red", "blue"], ["s", "m"]));
    await run(store);
    // Kullanici blue varyantlarina fiyat verdi (SKU Matrix simülasyonu).
    for (const v of store.variants.filter((v) => v.combinationKey!.includes("blue"))) {
      v.priceMinor = 4990;
    }
    const blueBefore = store.variants
      .filter((v) => v.combinationKey!.includes("blue"))
      .map((v) => ({ id: v.id, sku: v.sku, priceMinor: v.priceMinor }));
    // blue kaldir → archive
    store.setRecipe(STORE, PRODUCT, twoAxisRecipe(["red"], ["s", "m"]));
    await run(store);
    // blue geri ekle → restore (create DEGIL)
    store.setRecipe(STORE, PRODUCT, twoAxisRecipe(["red", "blue"], ["s", "m"]));
    const res = await run(store);
    if (!res.ok) return;
    expect(res.summary).toMatchObject({ created: 0, restored: 2, kept: 2, archived: 0 });
    const blueAfter = store.variants
      .filter((v) => v.combinationKey!.includes("blue"))
      .map((v) => ({ id: v.id, sku: v.sku, priceMinor: v.priceMinor }));
    // Ayni ID + SKU + fiyat (kullanici verisi korundu); yeni satir yok (toplam 4).
    expect(new Set(store.variants.map((v) => v.id)).size).toBe(4);
    expect(blueAfter.sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      blueBefore.sort((a, b) => a.id.localeCompare(b.id)),
    );
    expect(blueAfter.every((v) => v.priceMinor === 4990)).toBe(true);
  });

  it("axis removal → iki eksenli kombinasyonlar archive, tek eksenli yeni create", async () => {
    const store = setupStore();
    store.setRecipe(STORE, PRODUCT, twoAxisRecipe(["red", "blue"], ["s", "m"]));
    await run(store);
    // Size eksenini tamamen kaldir → yalniz Color ekseni.
    store.setRecipe(STORE, PRODUCT, [{ attributeDefinitionId: "color", position: 0, optionIds: ["red", "blue"] }]);
    const res = await run(store);
    if (!res.ok) return;
    expect(res.summary).toMatchObject({ totalTarget: 2, created: 2, kept: 0, archived: 4 });
    expect(store.variants.filter((v) => v.status === "ARCHIVED")).toHaveLength(4);
    expect(store.variants.filter((v) => v.status !== "ARCHIVED")).toHaveLength(2);
  });

  it("axis addition → tek eksenli eski kombinasyonlar archive, iki eksenli yeni create", async () => {
    const store = setupStore();
    store.setRecipe(STORE, PRODUCT, [{ attributeDefinitionId: "color", position: 0, optionIds: ["red", "blue"] }]);
    await run(store);
    store.setRecipe(STORE, PRODUCT, twoAxisRecipe(["red", "blue"], ["s", "m"]));
    const res = await run(store);
    if (!res.ok) return;
    expect(res.summary).toMatchObject({ totalTarget: 4, created: 4, archived: 2 });
  });

  it("rename does not regenerate → label degisir, combinationKey/ID sabit", async () => {
    const store = setupStore();
    store.setRecipe(STORE, PRODUCT, twoAxisRecipe(["red", "blue"], ["s", "m"]));
    await run(store);
    const before = store.variants.map((v) => v.id).sort();
    // Option label degistir (rename).
    store.setOption("red", "Kırmızı");
    const res = await run(store);
    if (!res.ok) return;
    expect(res.summary).toMatchObject({ created: 0, kept: 4, archived: 0 });
    expect(store.variants.map((v) => v.id).sort()).toEqual(before);
  });

  it("position change does not regenerate → identity sabit", async () => {
    const store = setupStore();
    store.setRecipe(STORE, PRODUCT, twoAxisRecipe(["red", "blue"], ["s", "m"]));
    await run(store);
    const before = store.variants.map((v) => v.id).sort();
    // Eksen sirasini degistir (position swap): identity ID-tabanli combinationKey'e bagli, degismez.
    store.setRecipe(STORE, PRODUCT, [
      { attributeDefinitionId: "size", position: 0, optionIds: ["s", "m"] },
      { attributeDefinitionId: "color", position: 1, optionIds: ["red", "blue"] },
    ]);
    const res = await run(store);
    if (!res.ok) return;
    expect(res.summary).toMatchObject({ created: 0, kept: 4, archived: 0 });
    expect(store.variants.map((v) => v.id).sort()).toEqual(before);
  });

  it("empty selection rejected → VARIANT_SELECTION_EMPTY; hicbir varyant degismez", async () => {
    const store = setupStore();
    store.setRecipe(STORE, PRODUCT, twoAxisRecipe(["red", "blue"], ["s", "m"]));
    await run(store);
    const snapshot = store.variants.map((v) => ({ ...v }));
    store.setRecipe(STORE, PRODUCT, []); // recete bosaltildi
    const res = await run(store);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VARIANT_SELECTION_EMPTY");
    // Sessiz archive YOK.
    expect(store.variants.map((v) => v.status)).toEqual(snapshot.map((v) => v.status));
  });

  it("preview limit respected → PREVIEW_LIMIT_EXCEEDED", async () => {
    const store = setupStore();
    store.setRecipe(STORE, PRODUCT, twoAxisRecipe(["red", "blue"], ["s", "m"]));
    const res = await run(store, 3);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("PREVIEW_LIMIT_EXCEEDED");
    expect(res.error.limit).toBe(3);
    expect(store.variants).toHaveLength(0); // hicbir sey yazilmadi
  });

  it("archived option excluded → arsivli secenek kombinasyona girmez", async () => {
    const store = setupStore();
    store.setOption("blue", "BLUE", "ARCHIVED");
    store.setRecipe(STORE, PRODUCT, twoAxisRecipe(["red", "blue"], ["s", "m"]));
    const res = await run(store);
    if (!res.ok) return;
    // blue arsivli → yalniz red × {s,m} = 2.
    expect(res.summary).toMatchObject({ totalTarget: 2, created: 2 });
    expect(store.variants.every((v) => !v.combinationKey!.includes("blue"))).toBe(true);
  });

  it("tum secenekler arsivli → INVALID_VARIANT_SELECTION (sessiz archive YOK)", async () => {
    const store = setupStore();
    store.setOption("red", "RED", "ARCHIVED");
    store.setOption("blue", "BLUE", "ARCHIVED");
    store.setRecipe(STORE, PRODUCT, [{ attributeDefinitionId: "color", position: 0, optionIds: ["red", "blue"] }]);
    const res = await run(store);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("INVALID_VARIANT_SELECTION");
  });

  it("invalid option relationship → ATTRIBUTE_OPTION_NOT_FOUND (metadata cozulemez)", async () => {
    const store = setupStore();
    store.setRecipe(STORE, PRODUCT, [{ attributeDefinitionId: "color", position: 0, optionIds: ["ghost"] }]);
    const res = await run(store);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("ATTRIBUTE_OPTION_NOT_FOUND");
  });

  it("product not found → PRODUCT_NOT_FOUND", async () => {
    const store = setupStore();
    const svc = makeService(store);
    const res = await svc.generate({ storeId: STORE, productId: "ghost" });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("PRODUCT_NOT_FOUND");
  });

  it("manual variants untouched → manuel varyant archive/restore edilmez, sayilir", async () => {
    const store = setupStore();
    // Manuel varyant ekle.
    store.variants.push({
      id: "manual_1",
      storeId: STORE,
      productId: PRODUCT,
      combinationKey: null,
      generationSource: "MANUAL",
      status: "ACTIVE",
      title: "Elle",
      sku: "MAN-1",
      currency: "TRY",
      priceMinor: 9990,
      archivedAt: null,
      updatedAt: 0,
      optionValues: [],
    });
    store.setRecipe(STORE, PRODUCT, twoAxisRecipe(["red"], ["s"]));
    const res = await run(store);
    if (!res.ok) return;
    expect(res.summary.manualVariantsUntouched).toBe(1);
    const manual = store.variants.find((v) => v.id === "manual_1")!;
    expect(manual.status).toBe("ACTIVE");
    expect(manual.sku).toBe("MAN-1");
    expect(manual.combinationKey).toBeNull();
  });

  it("unique conflict handling → VARIANT_GENERATION_CONFLICT", async () => {
    const store = setupStore();
    store.setRecipe(STORE, PRODUCT, twoAxisRecipe(["red"], ["s"]));
    store.failNextCreateWithConflict = true;
    const res = await run(store);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VARIANT_GENERATION_CONFLICT");
  });

  it("deterministik SKU → ayni kombinasyon her uretimde ayni SKU (stabil)", async () => {
    const store = setupStore();
    store.setRecipe(STORE, PRODUCT, twoAxisRecipe(["red"], ["s"]));
    await run(store);
    const sku = store.variants[0]!.sku;
    expect(sku).toMatch(/^V-prod_1-/);
    // Sil + tekrar uret → ayni SKU (deterministik; random/timestamp YOK).
    store.variants = [];
    await run(store);
    expect(store.variants[0]!.sku).toBe(sku);
  });

  it("tenant mismatch → baska magazadan urun bulunamaz", async () => {
    const store = setupStore();
    store.setRecipe(STORE, PRODUCT, twoAxisRecipe(["red"], ["s"]));
    const svc = makeService(store);
    const res = await svc.generate({ storeId: "other_store", productId: PRODUCT });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("PRODUCT_NOT_FOUND");
  });
});

// ─────────────────────────────── ROUTE ───────────────────────────────

function buildApp(opts?: { storeAdmin?: (storeId: string) => { actorUserId: string } | null; maxCombinations?: number }) {
  const store = setupStore();
  store.setRecipe(STORE, PRODUCT, twoAxisRecipe(["red", "blue"], ["s", "m"]));
  const service = makeService(store, opts?.maxCombinations ?? 1000);
  const app = Fastify();
  attachErrorHandler(app);
  registerVariantGenerationRoutes(app, {
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
  return { app, store };
}

let ctx: ReturnType<typeof buildApp>;
afterEach(async () => {
  if (ctx?.app) await ctx.app.close();
});

describe("Faz 2C-3 — variant generation route", () => {
  beforeEach(() => {
    ctx = buildApp();
  });

  it("POST generate → 200 + ozet", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: `/stores/${STORE}/products/${PRODUCT}/variant-combinations/generate`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ totalTarget: 4, created: 4, kept: 0, restored: 0, archived: 0 });
    expect(body.variants).toHaveLength(4);
    expect(body.variants[0].combinationKey).toMatch(/^v1\|/);
    expect(body.variants[0].attributes).toHaveLength(2);
  });

  it("repeated request → idempotent (created 0)", async () => {
    await ctx.app.inject({ method: "POST", url: `/stores/${STORE}/products/${PRODUCT}/variant-combinations/generate` });
    const res = await ctx.app.inject({
      method: "POST",
      url: `/stores/${STORE}/products/${PRODUCT}/variant-combinations/generate`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ created: 0, kept: 4 });
  });

  it("empty recipe → 422 VARIANT_SELECTION_EMPTY", async () => {
    ctx = buildApp();
    ctx.store.setRecipe(STORE, PRODUCT, []);
    const res = await ctx.app.inject({
      method: "POST",
      url: `/stores/${STORE}/products/${PRODUCT}/variant-combinations/generate`,
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("VARIANT_SELECTION_EMPTY");
  });

  it("limit error → 422 PREVIEW_LIMIT_EXCEEDED", async () => {
    ctx = buildApp({ maxCombinations: 3 });
    const res = await ctx.app.inject({
      method: "POST",
      url: `/stores/${STORE}/products/${PRODUCT}/variant-combinations/generate`,
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("PREVIEW_LIMIT_EXCEEDED");
  });

  it("not found → 404 PRODUCT_NOT_FOUND", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: `/stores/${STORE}/products/ghost/variant-combinations/generate`,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("PRODUCT_NOT_FOUND");
  });

  it("auth guard → 403 (requireStoreAdmin null)", async () => {
    ctx = buildApp({ storeAdmin: () => null });
    const res = await ctx.app.inject({
      method: "POST",
      url: `/stores/${STORE}/products/${PRODUCT}/variant-combinations/generate`,
    });
    expect(res.statusCode).toBe(403);
  });
});
