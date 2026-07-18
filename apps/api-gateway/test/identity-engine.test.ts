import Fastify from "fastify";
import { z } from "zod";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

// ─────────────────────────── SAF MODULLER (DB'siz) ───────────────────────────
const { tokenize } = await import("../src/identity-engine/tokenizer.js");
const { parsePattern } = await import("../src/identity-engine/parser.js");
const { evaluatePattern } = await import("../src/identity-engine/evaluator.js");
const { buildValueFrequency, detectCollision } = await import("../src/identity-engine/collision.js");
const { buildIdentityPreview } = await import("../src/identity-engine/preview.js");
type EvaluationContext = import("../src/identity-engine/evaluator.js").EvaluationContext;
type PreviewInput = import("../src/identity-engine/preview.js").PreviewInput;
type PreviewVariantInput = import("../src/identity-engine/preview.js").PreviewVariantInput;

const { createIdentityService, identityErrorStatus } = await import("../src/identity-engine/service.js");
const { registerIdentityRoutes } = await import("../src/identity-engine/routes.js");
import type {
  IdentityDataAccess,
  IdentityProductRef,
  IdentityTxContext,
  IdentityVariantRow,
} from "../src/identity-engine/data.js";

function compile(source: string) {
  const r = parsePattern(source);
  if (!r.ok) throw new Error(`parse failed: ${r.error.code}`);
  return r.pattern;
}

function ctx(over: Partial<EvaluationContext> = {}): EvaluationContext {
  return {
    product: { slug: "premium-tshirt", name: "Premium T-Shirt" },
    category: { code: "tees", name: "Tişörtler" },
    attributes: new Map([
      ["color", { value: "RED", label: "Kırmızı" }],
      ["size", { value: "S", label: "Small" }],
    ]),
    seq: 1,
    preferLabel: false,
    ...over,
  };
}

describe("TODO-150 · tokenizer (saf)", () => {
  it("literal + token karisimi", () => {
    const r = tokenize("TSH-{COLOR}-{SEQ:3}");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lexemes.map((l) => l.kind)).toEqual(["literal", "token", "literal", "token"]);
    expect(r.lexemes[1]).toMatchObject({ name: "COLOR" });
    expect(r.lexemes[3]).toMatchObject({ name: "SEQ", arg: "3" });
  });

  it("kacis {{ }} → literal parantez", () => {
    const r = tokenize("a{{b}}c");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lexemes).toHaveLength(1);
    expect(r.lexemes[0]).toMatchObject({ kind: "literal", text: "a{b}c" });
  });

  it("kapanmayan token → IDENTITY_UNCLOSED_TOKEN", () => {
    const r = tokenize("A-{COLOR");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("IDENTITY_UNCLOSED_TOKEN");
  });

  it("acilmadan kapanan } → IDENTITY_UNEXPECTED_CLOSE", () => {
    const r = tokenize("A}B");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("IDENTITY_UNEXPECTED_CLOSE");
  });

  it("ic-ice { (recursive) → IDENTITY_NESTED_TOKEN", () => {
    const r = tokenize("{FOO{BAR}}");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("IDENTITY_NESTED_TOKEN");
  });

  it("bos token {} → IDENTITY_EMPTY_TOKEN", () => {
    const r = tokenize("a{}b");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("IDENTITY_EMPTY_TOKEN");
  });
});

describe("TODO-150 · parser (saf)", () => {
  it("bilinen tokenlar + attributeCodes + usesSeq", () => {
    const p = compile("{PRODUCT}-{CATEGORY}-{ATTRIBUTE:color}-{SEQ}");
    expect(p.usesSeq).toBe(true);
    expect(p.attributeCodes).toEqual(["color"]);
    expect(p.segments.map((s) => s.kind)).toEqual([
      "product",
      "literal",
      "category",
      "literal",
      "attribute",
      "literal",
      "seq",
    ]);
  });

  it("COLOR/SIZE aliaslari attribute'a normalize olur", () => {
    const p = compile("{COLOR}-{SIZE}");
    expect(p.attributeCodes.sort()).toEqual(["color", "size"]);
  });

  it("bilinmeyen token → IDENTITY_UNKNOWN_TOKEN", () => {
    const r = parsePattern("{FOO}");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("IDENTITY_UNKNOWN_TOKEN");
  });

  it("rezerve token (YEAR) → IDENTITY_TOKEN_NOT_SUPPORTED", () => {
    const r = parsePattern("{YEAR}");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("IDENTITY_TOKEN_NOT_SUPPORTED");
  });

  it("ATTRIBUTE argsiz → IDENTITY_TOKEN_ARG_REQUIRED", () => {
    const r = parsePattern("{ATTRIBUTE}");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("IDENTITY_TOKEN_ARG_REQUIRED");
  });

  it("PRODUCT arg alirsa → IDENTITY_TOKEN_ARG_UNEXPECTED", () => {
    const r = parsePattern("{PRODUCT:x}");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("IDENTITY_TOKEN_ARG_UNEXPECTED");
  });

  it("SEQ padding gecersiz → IDENTITY_SEQ_PADDING_INVALID", () => {
    expect(parsePattern("{SEQ:x}").ok).toBe(false);
    expect(parsePattern("{SEQ:0}").ok).toBe(false);
    expect(parsePattern("{SEQ:99}").ok).toBe(false);
  });

  it("bos pattern → IDENTITY_PATTERN_EMPTY", () => {
    const r = parsePattern("   ");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("IDENTITY_PATTERN_EMPTY");
  });
});

describe("TODO-150 · evaluator (saf)", () => {
  it("identifier modu: value + UPPER + literal", () => {
    const r = evaluatePattern(compile("TSH-{COLOR}-{SIZE}"), ctx({ preferLabel: false }));
    expect(r.value).toBe("TSH-RED-S");
    expect(r.missing).toEqual([]);
  });

  it("title modu: label (upper YOK)", () => {
    const r = evaluatePattern(compile("{PRODUCT} - {COLOR} - {SIZE}"), ctx({ preferLabel: true }));
    expect(r.value).toBe("Premium T-Shirt - Kırmızı - Small");
  });

  it("SEQ padding", () => {
    expect(evaluatePattern(compile("A-{SEQ:3}"), ctx({ seq: 7 })).value).toBe("A-007");
    expect(evaluatePattern(compile("A-{SEQ}"), ctx({ seq: 42 })).value).toBe("A-042");
  });

  it("eksik attribute → missing + bos", () => {
    const r = evaluatePattern(compile("{ATTRIBUTE:material}"), ctx());
    expect(r.value).toBe("");
    expect(r.missing).toEqual(["attribute:material"]);
  });

  it("kategori yoksa → missing", () => {
    const r = evaluatePattern(compile("{CATEGORY}"), ctx({ category: null }));
    expect(r.missing).toEqual(["category"]);
  });

  it("determinizm: iki cagri ayni sonuc", () => {
    const p = compile("TSH-{COLOR}-{SEQ:3}");
    expect(evaluatePattern(p, ctx({ seq: 5 })).value).toBe(evaluatePattern(p, ctx({ seq: 5 })).value);
  });
});

describe("TODO-150 · collision (saf)", () => {
  it("internal duplicate", () => {
    const freq = buildValueFrequency(["A", "A", "B", "", null]);
    expect(freq.get("A")).toBe(2);
    expect(freq.get("B")).toBe(1);
    expect(detectCollision("A", freq, new Map(), "v1").internalCount).toBe(2);
  });

  it("external owner (kendisi degilse cakisma)", () => {
    const ext = new Map([["A", "other-variant"]]);
    expect(detectCollision("A", new Map([["A", 1]]), ext, "v1").external).toBe(true);
    // Kendi mevcut SKU'su → cakisma degil
    expect(detectCollision("A", new Map([["A", 1]]), new Map([["A", "v1"]]), "v1").external).toBe(false);
  });
});

// ─────────────────────────── PREVIEW ORKESTRASYONU (saf) ───────────────────────────

function pv(over: Partial<PreviewVariantInput> = {}): PreviewVariantInput {
  return {
    variantId: "v1",
    status: "DRAFT",
    currentSku: "OLD-1",
    currentBarcode: null,
    currentTitle: "old title",
    titleIsCustom: false,
    attributes: new Map([
      ["color", { value: "RED", label: "Kırmızı" }],
      ["size", { value: "S", label: "Small" }],
    ]),
    ...over,
  };
}

function previewInput(over: Partial<PreviewInput> = {}): PreviewInput {
  return {
    variants: [pv()],
    patterns: { sku: null, barcode: null, title: null },
    seqStart: 1,
    regenerateCustomTitles: false,
    product: { slug: "premium-tshirt", name: "Premium T-Shirt" },
    category: { code: "tees", name: "Tişörtler" },
    externalSkuOwners: new Map(),
    externalBarcodeOwners: new Map(),
    ...over,
  };
}

describe("TODO-150 · buildIdentityPreview (saf)", () => {
  it("degisen SKU applied + changed", () => {
    const out = buildIdentityPreview(
      previewInput({ patterns: { sku: compile("TSH-{COLOR}"), barcode: null, title: null } }),
    );
    expect(out.rows[0].sku).toMatchObject({ next: "TSH-RED", changed: true, applied: true });
    expect(out.blocked).toBe(false);
    expect(out.counts.changed).toBe(1);
  });

  it("internal collision → blocked", () => {
    const out = buildIdentityPreview(
      previewInput({
        variants: [pv({ variantId: "v1" }), pv({ variantId: "v2" })], // ayni COLOR=RED → ayni SKU
        patterns: { sku: compile("TSH-{COLOR}"), barcode: null, title: null },
      }),
    );
    expect(out.blocked).toBe(true);
    expect(out.collisions.filter((c) => c.code === "SKU_COLLISION")).toHaveLength(2);
    // SEQ eklenince cozulur
    const fixed = buildIdentityPreview(
      previewInput({
        variants: [pv({ variantId: "v1" }), pv({ variantId: "v2" })],
        patterns: { sku: compile("TSH-{COLOR}-{SEQ}"), barcode: null, title: null },
      }),
    );
    expect(fixed.blocked).toBe(false);
  });

  it("external collision → blocked", () => {
    const out = buildIdentityPreview(
      previewInput({
        patterns: { sku: compile("TSH-{COLOR}"), barcode: null, title: null },
        externalSkuOwners: new Map([["TSH-RED", "someone-else"]]),
      }),
    );
    expect(out.blocked).toBe(true);
  });

  it("gecersiz karakter (bosluk) → SKU_INVALID_CHARS blocked", () => {
    const out = buildIdentityPreview(
      previewInput({ patterns: { sku: compile("{PRODUCT}"), barcode: null, title: null } }),
    );
    // {PRODUCT} slug = PREMIUM-TSHIRT (gecerli) → bu test icin boslukli literal kullanalim:
    const bad = buildIdentityPreview(
      previewInput({ patterns: { sku: compile("A B"), barcode: null, title: null } }),
    );
    expect(bad.rows[0].sku?.issues).toContain("SKU_INVALID_CHARS");
    expect(bad.blocked).toBe(true);
    expect(out.blocked).toBe(false);
  });

  it("korumali title (titleIsCustom) → applied=false, TITLE_PROTECTED, non-blocking", () => {
    const out = buildIdentityPreview(
      previewInput({
        variants: [pv({ titleIsCustom: true })],
        patterns: { sku: null, barcode: null, title: compile("{PRODUCT} - {COLOR}") },
      }),
    );
    expect(out.rows[0].title).toMatchObject({ applied: false });
    expect(out.rows[0].title?.issues).toContain("TITLE_PROTECTED");
    expect(out.blocked).toBe(false);
    // regenerateCustomTitles → yazilir
    const forced = buildIdentityPreview(
      previewInput({
        variants: [pv({ titleIsCustom: true })],
        patterns: { sku: null, barcode: null, title: compile("{PRODUCT} - {COLOR}") },
        regenerateCustomTitles: true,
      }),
    );
    expect(forced.rows[0].title?.applied).toBe(true);
  });

  it("barcode duplicate → uyari (non-blocking)", () => {
    const out = buildIdentityPreview(
      previewInput({
        variants: [pv({ variantId: "v1" }), pv({ variantId: "v2" })],
        patterns: { sku: null, barcode: compile("BC-{COLOR}"), title: null },
      }),
    );
    expect(out.blocked).toBe(false);
    expect(out.collisions.some((c) => c.code === "BARCODE_DUPLICATE")).toBe(true);
  });

  it("degismeyen deger → applied=false (idempotent)", () => {
    const out = buildIdentityPreview(
      previewInput({
        variants: [pv({ currentSku: "TSH-RED" })],
        patterns: { sku: compile("TSH-{COLOR}"), barcode: null, title: null },
      }),
    );
    expect(out.rows[0].sku).toMatchObject({ changed: false, applied: false });
    expect(out.counts.changed).toBe(0);
  });
});

// ─────────────────────────── SERVIS + ROUTE (in-memory fake) ───────────────────────────

interface FakeVariant {
  id: string;
  productId: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  sku: string;
  barcode: string | null;
  title: string;
  titleIsCustom: boolean;
  combinationKey: string | null;
  attributes: Array<{ code: string; value: string; label: string }>;
}

function makeFake(initial: FakeVariant[]) {
  const store = { variants: initial.map((v) => ({ ...v })), audits: [] as any[] };
  const product: IdentityProductRef = {
    id: "p1",
    slug: "premium-tshirt",
    name: "Premium T-Shirt",
    category: { code: "tees", name: "Tişörtler" },
  };
  const toRow = (v: FakeVariant): IdentityVariantRow => ({
    variantId: v.id,
    status: v.status,
    currentSku: v.sku,
    currentBarcode: v.barcode,
    currentTitle: v.title,
    titleIsCustom: v.titleIsCustom,
    attributes: new Map(v.attributes.map((a) => [a.code, { value: a.value, label: a.label }])),
  });
  const ctxImpl: IdentityTxContext = {
    lockProduct: async () => {},
    listVariants: async (_s, pid) =>
      store.variants
        .filter((v) => v.productId === pid && v.status !== "ARCHIVED")
        .sort((a, b) => (a.combinationKey ?? "~").localeCompare(b.combinationKey ?? "~") || a.id.localeCompare(b.id))
        .map(toRow),
    findExternalSkuOwners: async (_s, candidates, targetIds) => {
      const m = new Map<string, string>();
      for (const v of store.variants) {
        if (targetIds.includes(v.id)) continue;
        if (candidates.includes(v.sku)) m.set(v.sku, v.id);
      }
      return m;
    },
    findExternalBarcodeOwners: async (_s, candidates, targetIds) => {
      const m = new Map<string, string>();
      for (const v of store.variants) {
        if (targetIds.includes(v.id) || !v.barcode) continue;
        if (candidates.includes(v.barcode)) m.set(v.barcode, v.id);
      }
      return m;
    },
    applyWrites: async (_s, _p, batchId, writes, audits) => {
      for (const w of writes) {
        const v = store.variants.find((x) => x.id === w.variantId)!;
        if (w.sku !== undefined) v.sku = w.sku;
        if (w.barcode !== undefined) v.barcode = w.barcode;
        if (w.title !== undefined) {
          v.title = w.title;
          v.titleIsCustom = false;
        }
      }
      store.audits.push(...audits.map((a) => ({ ...a, batchId })));
    },
  };
  const dataAccess: IdentityDataAccess = {
    findProduct: async (_s, pid) => (pid === product.id ? product : null),
    read: (fn) => fn(ctxImpl),
    transaction: (fn) => fn(ctxImpl),
  };
  return { store, dataAccess };
}

const baseVariants: FakeVariant[] = [
  {
    id: "v1",
    productId: "p1",
    status: "DRAFT",
    sku: "V-p1-old1",
    barcode: null,
    title: "old 1",
    titleIsCustom: false,
    combinationKey: "v1|a:red",
    attributes: [
      { code: "color", value: "RED", label: "Kırmızı" },
      { code: "size", value: "S", label: "Small" },
    ],
  },
  {
    id: "v2",
    productId: "p1",
    status: "DRAFT",
    sku: "V-p1-old2",
    barcode: null,
    title: "old 2",
    titleIsCustom: false,
    combinationKey: "v1|b:blue",
    attributes: [
      { code: "color", value: "BLUE", label: "Mavi" },
      { code: "size", value: "M", label: "Medium" },
    ],
  },
];

describe("TODO-150 · identityService", () => {
  it("preview: SKU pattern → next degerler + deterministik", async () => {
    const { dataAccess } = makeFake(baseVariants);
    const svc = createIdentityService(dataAccess);
    const r = await svc.preview({ storeId: "s1", productId: "p1", sku: "TSH-{COLOR}-{SIZE}" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.rows.map((x) => x.sku?.next)).toEqual(["TSH-RED-S", "TSH-BLUE-M"]);
    expect(r.result.blocked).toBe(false);
    expect(r.result.variantCount).toBe(2);
  });

  it("apply: yalniz degisen varyantlari yazar + audit + titleIsCustom=false", async () => {
    const { store, dataAccess } = makeFake(baseVariants);
    const svc = createIdentityService(dataAccess);
    const r = await svc.apply({
      storeId: "s1",
      productId: "p1",
      actorUserId: "u1",
      sku: "TSH-{COLOR}",
      title: "{PRODUCT}-{SIZE}",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.updated).toBe(2);
    expect(store.variants.find((v) => v.id === "v1")!.sku).toBe("TSH-RED");
    // title modu LABEL kullanir ({SIZE}=Small, upper YOK)
    expect(store.variants.find((v) => v.id === "v1")!.title).toBe("Premium T-Shirt-Small");
    // SKU + TITLE = 2 varyant * 2 alan = 4 audit satiri
    expect(store.audits).toHaveLength(4);
    expect(new Set(store.audits.map((a) => a.batchId)).size).toBe(1); // tek batch
  });

  it("apply idempotent: ikinci kez → updated=0", async () => {
    const { dataAccess } = makeFake(baseVariants);
    const svc = createIdentityService(dataAccess);
    await svc.apply({ storeId: "s1", productId: "p1", actorUserId: "u1", sku: "TSH-{COLOR}" });
    const second = await svc.apply({ storeId: "s1", productId: "p1", actorUserId: "u1", sku: "TSH-{COLOR}" });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.result.updated).toBe(0);
  });

  it("apply blocked (collision) → hicbir yazim", async () => {
    const { store, dataAccess } = makeFake(baseVariants);
    const svc = createIdentityService(dataAccess);
    // Her iki varyanta ayni sabit SKU → internal collision
    const r = await svc.apply({ storeId: "s1", productId: "p1", actorUserId: "u1", sku: "FIXED" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("IDENTITY_APPLY_BLOCKED");
    expect(store.variants.every((v) => v.sku.startsWith("V-p1-old"))).toBe(true); // degismedi
  });

  it("title korumasi: custom title yeniden generate edilmez", async () => {
    const custom = baseVariants.map((v) => ({ ...v, titleIsCustom: v.id === "v1" }));
    const { store, dataAccess } = makeFake(custom);
    const svc = createIdentityService(dataAccess);
    const r = await svc.apply({ storeId: "s1", productId: "p1", actorUserId: "u1", title: "{PRODUCT}-{COLOR}" });
    expect(r.ok).toBe(true);
    // v1 korumali → degismedi; v2 degisti
    expect(store.variants.find((v) => v.id === "v1")!.title).toBe("old 1");
    // title modu LABEL kullanir ({COLOR}=Mavi)
    expect(store.variants.find((v) => v.id === "v2")!.title).toBe("Premium T-Shirt-Mavi");
  });

  it("pattern hatasi → IDENTITY_PATTERN_INVALID + field", async () => {
    const { dataAccess } = makeFake(baseVariants);
    const svc = createIdentityService(dataAccess);
    const r = await svc.preview({ storeId: "s1", productId: "p1", sku: "{FOO}" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("IDENTITY_PATTERN_INVALID");
    expect(r.error.field).toBe("SKU");
  });

  it("pattern yok → IDENTITY_NO_PATTERN", async () => {
    const { dataAccess } = makeFake(baseVariants);
    const svc = createIdentityService(dataAccess);
    const r = await svc.preview({ storeId: "s1", productId: "p1" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("IDENTITY_NO_PATTERN");
  });

  it("urun yok → PRODUCT_NOT_FOUND (404)", async () => {
    const { dataAccess } = makeFake(baseVariants);
    const svc = createIdentityService(dataAccess);
    const r = await svc.preview({ storeId: "s1", productId: "nope", sku: "A-{SEQ}" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(identityErrorStatus(r.error.code)).toBe(404);
  });
});

describe("TODO-150 · routes (fastify)", () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    app = Fastify();
    attachErrorHandler(app);
    const { dataAccess } = makeFake(baseVariants);
    const service = createIdentityService(dataAccess);
    registerIdentityRoutes(app, {
      service,
      requireStoreAdmin: async () => ({ actorUserId: "u1" }),
    });
    await app.ready();
  });
  afterEach(async () => {
    await app.close();
  });

  it("GET preview → 200 + rows", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/stores/s1/products/p1/identity/preview?sku=" + encodeURIComponent("TSH-{COLOR}"),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.rows).toHaveLength(2);
    expect(body.blocked).toBe(false);
  });

  it("POST apply → 200 + updated", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/stores/s1/products/p1/identity/apply",
      payload: { sku: "TSH-{COLOR}" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().updated).toBe(2);
  });

  it("GET preview pattern hatasi → 422", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/stores/s1/products/p1/identity/preview?sku=" + encodeURIComponent("{FOO}"),
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("IDENTITY_PATTERN_INVALID");
  });
});
