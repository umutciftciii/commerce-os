import { describe, expect, it } from "vitest";
import { vi } from "vitest";

// data.js -> @commerce-os/db (prisma). Testte gerçek prisma init'ini engelle (fake data-access).
vi.mock("@commerce-os/db", () => ({ prisma: {} }));

const availability = await import("../src/inventory-engine/availability.js");
const calc = await import("../src/inventory-engine/calculator.js");
const { validateTarget } = await import("../src/inventory-engine/validation.js");
const { inventoryFingerprint } = await import("../src/inventory-engine/fingerprint.js");
const { diffState } = await import("../src/inventory-engine/diff-engine.js");
const { buildInventoryPreview, applyRuleToState, applyDirectEdit } = await import(
  "../src/inventory-engine/preview.js"
);
const { canReserve, releaseReservation } = await import("../src/inventory-engine/reservation-service.js");
const { createInventoryService, inventoryErrorStatus } = await import(
  "../src/inventory-engine/service.js"
);
const { DEFAULT_INVENTORY_LIMITS } = await import("../src/inventory-engine/types.js");

import type {
  InventoryState,
  VariantStatus,
} from "../src/inventory-engine/types.js";
import type {
  InventoryDataAccess,
  InventoryTxContext,
  InventoryVariantRow,
  InventoryWarehouseRef,
} from "../src/inventory-engine/data.js";

const state = (over: Partial<InventoryState> = {}): InventoryState => ({
  onHand: 0,
  reserved: 0,
  incoming: 0,
  safetyStock: 0,
  reorderPoint: 0,
  ...over,
});

// ─────────────────────────── Availability Calculator ───────────────────────────
describe("TODO-152 · availability", () => {
  it("onHand only", () => {
    expect(availability.computeAvailability(state({ onHand: 10 }))).toEqual({
      rawAvailable: 10,
      sellableAvailable: 10,
    });
  });
  it("reserved subtraction", () => {
    expect(availability.computeAvailability(state({ onHand: 10, reserved: 3 })).rawAvailable).toBe(7);
  });
  it("safety stock subtraction", () => {
    expect(
      availability.computeAvailability(state({ onHand: 10, reserved: 3, safetyStock: 2 })).rawAvailable,
    ).toBe(5);
  });
  it("incoming excluded", () => {
    const a = availability.computeAvailability(state({ onHand: 10, reserved: 3, safetyStock: 2, incoming: 20 }));
    expect(a.rawAvailable).toBe(5);
    expect(a.sellableAvailable).toBe(5);
  });
  it("zero", () => {
    expect(availability.computeAvailability(state()).sellableAvailable).toBe(0);
  });
  it("negative raw availability + sellable clamp", () => {
    const a = availability.computeAvailability(state({ onHand: 2, reserved: 3, safetyStock: 4 }));
    expect(a.rawAvailable).toBe(-5);
    expect(a.sellableAvailable).toBe(0);
  });
  it("deterministic + no input mutation", () => {
    const s = state({ onHand: 10, reserved: 3, safetyStock: 2 });
    const frozen = { ...s };
    availability.computeAvailability(s);
    availability.computeAvailability(s);
    expect(s).toEqual(frozen);
  });
  it("overflow-scale values", () => {
    const a = availability.computeAvailability(state({ onHand: 1_000_000_000, reserved: 1, safetyStock: 1 }));
    expect(a.rawAvailable).toBe(999_999_998);
  });
});

// ─────────────────────────── Calculator (status/ratio) ───────────────────────────
describe("TODO-152 · calculator status", () => {
  it("NO_BALANCE when balance absent", () => {
    expect(calc.stockStatus(state({ onHand: 5 }), false)).toBe("NO_BALANCE");
  });
  it("IN_STOCK", () => {
    expect(calc.stockStatus(state({ onHand: 10 }), true)).toBe("IN_STOCK");
  });
  it("LOW_STOCK at/below reorder point", () => {
    expect(calc.stockStatus(state({ onHand: 5, reorderPoint: 5 }), true)).toBe("LOW_STOCK");
  });
  it("OUT_OF_STOCK", () => {
    expect(calc.stockStatus(state({ onHand: 0 }), true)).toBe("OUT_OF_STOCK");
  });
  it("INCOMING when out but incoming>0", () => {
    expect(calc.stockStatus(state({ onHand: 0, incoming: 20 }), true)).toBe("INCOMING");
  });
  it("NEGATIVE availability", () => {
    expect(calc.stockStatus(state({ onHand: 1, reserved: 3 }), true)).toBe("NEGATIVE");
  });
  it("reserved ratio null when onHand<=0", () => {
    expect(calc.reservedRatioPct(state({ onHand: 0, reserved: 3 }))).toBeNull();
  });
  it("reserved ratio pct", () => {
    expect(calc.reservedRatioPct(state({ onHand: 10, reserved: 5 }))).toBe(50);
  });
});

// ─────────────────────────── Validation ───────────────────────────
const vctx = (over: Partial<Parameters<typeof validateTarget>[2]> = {}) => ({
  status: "ACTIVE" as VariantStatus,
  changed: true,
  newBalance: false,
  limits: DEFAULT_INVENTORY_LIMITS,
  ...over,
});

describe("TODO-152 · validation", () => {
  it("negative onHand blocks", () => {
    expect(validateTarget(state(), state({ onHand: -1 }), vctx())).toContain("NEGATIVE_ON_HAND");
  });
  it("negative incoming blocks", () => {
    expect(validateTarget(state(), state({ incoming: -1 }), vctx())).toContain("NEGATIVE_INCOMING");
  });
  it("negative safety stock blocks", () => {
    expect(validateTarget(state(), state({ safetyStock: -1 }), vctx())).toContain("NEGATIVE_SAFETY_STOCK");
  });
  it("negative reorder point blocks", () => {
    expect(validateTarget(state(), state({ reorderPoint: -1 }), vctx())).toContain("NEGATIVE_REORDER_POINT");
  });
  it("overflow blocks", () => {
    const codes = validateTarget(state(), state({ onHand: 2_000_000_000 }), vctx());
    expect(codes).toContain("OVERFLOW");
  });
  it("warning does not include blocking (out of stock)", () => {
    const codes = validateTarget(state({ onHand: 5 }), state({ onHand: 0 }), vctx());
    expect(codes).toContain("OUT_OF_STOCK");
    expect(codes).not.toContain("NEGATIVE_ON_HAND");
  });
  it("large decrease warning only when changed", () => {
    const codes = validateTarget(state({ onHand: 100 }), state({ onHand: 10 }), vctx({ changed: true }));
    expect(codes).toContain("LARGE_DECREASE");
  });
  it("archived variant warning", () => {
    expect(validateTarget(state(), state({ onHand: 5 }), vctx({ status: "ARCHIVED" }))).toContain(
      "ARCHIVED_VARIANT",
    );
  });
  it("new balance warning", () => {
    expect(validateTarget(state(), state({ onHand: 5 }), vctx({ newBalance: true }))).toContain(
      "NEW_BALANCE",
    );
  });
});

// ─────────────────────────── Fingerprint ───────────────────────────
describe("TODO-152 · fingerprint", () => {
  const rows = [
    { warehouseId: "w1", variantId: "b", state: state({ onHand: 5 }) },
    { warehouseId: "w1", variantId: "a", state: state({ onHand: 3 }) },
  ];
  it("stable", () => {
    expect(inventoryFingerprint(rows)).toBe(inventoryFingerprint(rows));
  });
  it("input-order independent", () => {
    expect(inventoryFingerprint(rows)).toBe(inventoryFingerprint([...rows].reverse()));
  });
  it("warehouse-sensitive", () => {
    const other = rows.map((r) => ({ ...r, warehouseId: "w2" }));
    expect(inventoryFingerprint(rows)).not.toBe(inventoryFingerprint(other));
  });
  it("field change alters fingerprint (incl. reserved)", () => {
    const changed = [{ ...rows[0], state: state({ onHand: 5, reserved: 1 }) }, rows[1]];
    expect(inventoryFingerprint(rows)).not.toBe(inventoryFingerprint(changed));
  });
});

// ─────────────────────────── Diff ───────────────────────────
describe("TODO-152 · diff", () => {
  it("no change", () => {
    expect(diffState(state({ onHand: 5 }), state({ onHand: 5 })).changed).toBe(false);
  });
  it("onHand only", () => {
    const d = diffState(state({ onHand: 5 }), state({ onHand: 8 }));
    expect(d.changedFields).toEqual(["ON_HAND"]);
    expect(d.diffs[0]).toMatchObject({ field: "ON_HAND", oldValue: 5, newValue: 8, delta: 3 });
  });
  it("multi-field deterministic order", () => {
    const d = diffState(state(), state({ onHand: 1, incoming: 2, safetyStock: 3, reorderPoint: 4 }));
    expect(d.changedFields).toEqual(["ON_HAND", "INCOMING", "SAFETY_STOCK", "REORDER_POINT"]);
  });
  it("reserved never diffed", () => {
    // reserved yalnız state'te; diff editable alanlara bakar → reserved farkı changed üretmez.
    const d = diffState(state({ onHand: 5, reserved: 1 }), state({ onHand: 5, reserved: 9 }));
    expect(d.changed).toBe(false);
  });
});

// ─────────────────────────── Evaluator (rule/direct) ───────────────────────────
describe("TODO-152 · evaluator", () => {
  it("SET_ABSOLUTE", () => {
    expect(applyRuleToState(state({ onHand: 5 }), { targetField: "ON_HAND", operation: "SET_ABSOLUTE", amount: 50 }).onHand).toBe(50);
  });
  it("INCREASE", () => {
    expect(applyRuleToState(state({ onHand: 5 }), { targetField: "ON_HAND", operation: "INCREASE", amount: 10 }).onHand).toBe(15);
  });
  it("DECREASE below zero (validation later blocks)", () => {
    expect(applyRuleToState(state({ onHand: 5 }), { targetField: "ON_HAND", operation: "DECREASE", amount: 10 }).onHand).toBe(-5);
  });
  it("rule never touches reserved", () => {
    const t = applyRuleToState(state({ onHand: 5, reserved: 3 }), { targetField: "ON_HAND", operation: "SET_ABSOLUTE", amount: 0 });
    expect(t.reserved).toBe(3);
  });
  it("direct edit only given fields", () => {
    const t = applyDirectEdit(state({ onHand: 5, incoming: 1, safetyStock: 2 }), { variantId: "x", onHand: 9 });
    expect(t).toMatchObject({ onHand: 9, incoming: 1, safetyStock: 2 });
  });
});

// ─────────────────────────── Preview ───────────────────────────
const variant = (id: string, over: Partial<InventoryState> = {}, status: VariantStatus = "ACTIVE") => ({
  variantId: id,
  sku: `SKU-${id}`,
  title: `Variant ${id}`,
  status,
  attributes: [],
  current: state(over),
  balanceExists: true,
});

describe("TODO-152 · preview", () => {
  it("bulk INCREASE on_hand +10", () => {
    const out = buildInventoryPreview({
      warehouseId: "w1",
      variants: [variant("a", { onHand: 5 }), variant("b", { onHand: 15 })],
      mode: { kind: "rule", rule: { targetField: "ON_HAND", operation: "INCREASE", amount: 10 } },
    });
    expect(out.rows.map((r) => r.target.onHand)).toEqual([15, 25]);
    expect(out.summary.changedVariants).toBe(2);
    expect(out.summary.totalOnHandDelta).toBe(20);
    expect(out.blocked).toBe(false);
  });
  it("bulk DECREASE below zero → blocked", () => {
    const out = buildInventoryPreview({
      warehouseId: "w1",
      variants: [variant("a", { onHand: 5 })],
      mode: { kind: "rule", rule: { targetField: "ON_HAND", operation: "DECREASE", amount: 10 } },
    });
    expect(out.blocked).toBe(true);
    expect(out.rows[0].errors).toContain("NEGATIVE_ON_HAND");
  });
  it("direct edit safety stock", () => {
    const out = buildInventoryPreview({
      warehouseId: "w1",
      variants: [variant("a", { onHand: 10, safetyStock: 2 })],
      mode: { kind: "direct", edits: [{ variantId: "a", safetyStock: 4 }] },
    });
    expect(out.rows[0].target.safetyStock).toBe(4);
    expect(out.rows[0].targetCalc.sellableAvailable).toBe(6);
  });
  it("missing balance shown as zero + NEW_BALANCE", () => {
    const out = buildInventoryPreview({
      warehouseId: "w1",
      variants: [{ ...variant("a"), balanceExists: false }],
      mode: { kind: "direct", edits: [{ variantId: "a", onHand: 5 }] },
    });
    expect(out.rows[0].current.onHand).toBe(0);
    expect(out.rows[0].warnings).toContain("NEW_BALANCE");
    expect(out.summary.newBalanceCount).toBe(1);
  });
  it("deterministic fingerprint (order independent)", () => {
    const a = buildInventoryPreview({
      warehouseId: "w1",
      variants: [variant("a", { onHand: 5 }), variant("b", { onHand: 6 })],
      mode: { kind: "direct", edits: [] },
    });
    const b = buildInventoryPreview({
      warehouseId: "w1",
      variants: [variant("b", { onHand: 6 }), variant("a", { onHand: 5 })],
      mode: { kind: "direct", edits: [] },
    });
    expect(a.fingerprint).toBe(b.fingerprint);
  });
});

// ─────────────────────────── Reservation foundation ───────────────────────────
describe("TODO-152 · reservation (foundation)", () => {
  it("canReserve when checkout-available enough (safety ignored)", () => {
    expect(canReserve(state({ onHand: 10, reserved: 3, safetyStock: 5 }), 5)).toEqual({ ok: true, nextReserved: 8 });
  });
  it("insufficient", () => {
    expect(canReserve(state({ onHand: 5, reserved: 3 }), 5)).toEqual({ ok: false, reason: "INSUFFICIENT_STOCK" });
  });
  it("release", () => {
    expect(releaseReservation(state({ reserved: 3 }), 2)).toEqual({ ok: true, nextReserved: 1 });
  });
});

// ─────────────────────────── Service (apply/idempotent/stale/…) ───────────────────────────
interface FakeVariant {
  id: string;
  productId: string;
  storeId: string;
  status: VariantStatus;
  current: InventoryState;
  balanceExists: boolean;
}

const DEFAULT_WH: InventoryWarehouseRef = { id: "wh1", code: "DEFAULT", name: "Ana Depo", status: "ACTIVE", isDefault: true, priority: 0 };
const INACTIVE_WH: InventoryWarehouseRef = { id: "wh2", code: "SEC", name: "İkincil", status: "INACTIVE", isDefault: false, priority: 1 };

function makeFake(initial: FakeVariant[], warehouses: InventoryWarehouseRef[] = [DEFAULT_WH]) {
  const store = {
    variants: initial.map((v) => ({ ...v, current: { ...v.current } })),
    audits: [] as { batchId: string; variantId: string; field: string; delta: number; source: string }[],
    writeCount: 0,
  };
  const toRow = (v: FakeVariant): InventoryVariantRow => ({
    variantId: v.id,
    sku: `SKU-${v.id}`,
    title: v.id,
    status: v.status,
    attributes: [],
    current: { ...v.current },
    balanceExists: v.balanceExists,
  });
  const ctxImpl: InventoryTxContext = {
    lockProductWarehouse: async () => {},
    listVariants: async (_s, pid) => store.variants.filter((v) => v.productId === pid && v.status !== "ARCHIVED").map(toRow),
    applyWrites: async (_s, _p, _w, batchId, writes, audits, source) => {
      for (const w of writes) {
        const v = store.variants.find((x) => x.id === w.variantId)!;
        v.current = { ...w.target };
        v.balanceExists = true;
        store.writeCount++;
      }
      store.audits.push(...audits.map((a) => ({ ...a, batchId, source })));
    },
  };
  const dataAccess: InventoryDataAccess = {
    findProduct: async (s, pid) => (store.variants.some((v) => v.productId === pid && v.storeId === s) ? { id: pid } : null),
    listWarehouses: async () => warehouses,
    findWarehouse: async (_s, id) => warehouses.find((w) => w.id === id) ?? null,
    findDefaultWarehouse: async () => warehouses.find((w) => w.isDefault) ?? null,
    read: (fn) => fn(ctxImpl),
    transaction: (fn) => fn(ctxImpl),
  };
  return { store, dataAccess };
}

const base: FakeVariant[] = [
  { id: "v1", productId: "p1", storeId: "s1", status: "ACTIVE", current: state({ onHand: 10, reserved: 2 }), balanceExists: true },
  { id: "v2", productId: "p1", storeId: "s1", status: "ACTIVE", current: state({ onHand: 20 }), balanceExists: true },
  { id: "v3", productId: "p1", storeId: "s1", status: "ARCHIVED", current: state({ onHand: 99 }), balanceExists: true },
];

describe("TODO-152 · inventoryService", () => {
  it("matrix excludes archived", async () => {
    const { dataAccess } = makeFake(base);
    const svc = createInventoryService(dataAccess);
    const res = await svc.matrix({ storeId: "s1", productId: "p1" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.result.rows.map((r) => r.variantId)).toEqual(["v1", "v2"]);
  });

  it("preview bulk +10 onHand", async () => {
    const { dataAccess } = makeFake(base);
    const svc = createInventoryService(dataAccess);
    const res = await svc.preview({
      storeId: "s1",
      productId: "p1",
      rule: { targetField: "ON_HAND", operation: "INCREASE", amount: 10 },
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.result.rows.map((r) => r.target.onHand)).toEqual([20, 30]);
  });

  it("apply writes only changed + single batchId + audit", async () => {
    const { store, dataAccess } = makeFake(base);
    const svc = createInventoryService(dataAccess);
    const preview = await svc.preview({
      storeId: "s1",
      productId: "p1",
      edits: [{ variantId: "v1", onHand: 15 }],
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    const res = await svc.apply({
      storeId: "s1",
      productId: "p1",
      actorUserId: "u1",
      baseFingerprint: preview.result.fingerprint,
      edits: [{ variantId: "v1", onHand: 15 }],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.result.updatedVariants).toBe(1);
      expect(res.result.auditCount).toBe(1);
      expect(new Set(store.audits.map((a) => a.batchId)).size).toBe(1);
      expect(store.audits[0]).toMatchObject({ field: "ON_HAND", delta: 5, source: "MANUAL_EDIT" });
    }
  });

  it("idempotent re-apply → updated 0", async () => {
    const { store, dataAccess } = makeFake(base);
    const svc = createInventoryService(dataAccess);
    const edits = [{ variantId: "v1", onHand: 15 }];
    const p1 = await svc.preview({ storeId: "s1", productId: "p1", edits });
    if (!p1.ok) throw new Error("preview failed");
    await svc.apply({ storeId: "s1", productId: "p1", actorUserId: "u1", baseFingerprint: p1.result.fingerprint, edits });
    const writesAfterFirst = store.writeCount;
    const p2 = await svc.preview({ storeId: "s1", productId: "p1", edits });
    if (!p2.ok) throw new Error("preview2 failed");
    const res = await svc.apply({ storeId: "s1", productId: "p1", actorUserId: "u1", baseFingerprint: p2.result.fingerprint, edits });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.result.updatedVariants).toBe(0);
    expect(store.writeCount).toBe(writesAfterFirst);
  });

  it("stale fingerprint → INVENTORY_PREVIEW_STALE, no writes", async () => {
    const { store, dataAccess } = makeFake(base);
    const svc = createInventoryService(dataAccess);
    const res = await svc.apply({
      storeId: "s1",
      productId: "p1",
      actorUserId: "u1",
      baseFingerprint: "if1:deadbeef:2",
      edits: [{ variantId: "v1", onHand: 15 }],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("INVENTORY_PREVIEW_STALE");
    expect(store.writeCount).toBe(0);
  });

  it("blocking (negative) → INVENTORY_APPLY_BLOCKED, no writes", async () => {
    const { store, dataAccess } = makeFake(base);
    const svc = createInventoryService(dataAccess);
    const rule = { targetField: "ON_HAND" as const, operation: "DECREASE" as const, amount: 999 };
    const p = await svc.preview({ storeId: "s1", productId: "p1", rule });
    if (!p.ok) throw new Error("preview failed");
    const res = await svc.apply({ storeId: "s1", productId: "p1", actorUserId: "u1", baseFingerprint: p.result.fingerprint, rule });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("INVENTORY_APPLY_BLOCKED");
    expect(store.writeCount).toBe(0);
  });

  it("scope guard → INVENTORY_VARIANT_NOT_FOUND", async () => {
    const { dataAccess } = makeFake(base);
    const svc = createInventoryService(dataAccess);
    const res = await svc.preview({ storeId: "s1", productId: "p1", selectedVariantIds: ["nope"] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("INVENTORY_VARIANT_NOT_FOUND");
  });

  it("empty selection → INVENTORY_SELECTION_EMPTY", async () => {
    const { dataAccess } = makeFake(base);
    const svc = createInventoryService(dataAccess);
    const res = await svc.preview({ storeId: "s1", productId: "p1", selectedVariantIds: [] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("INVENTORY_SELECTION_EMPTY");
  });

  it("product not found → PRODUCT_NOT_FOUND", async () => {
    const { dataAccess } = makeFake(base);
    const svc = createInventoryService(dataAccess);
    const res = await svc.preview({ storeId: "s1", productId: "nope" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("PRODUCT_NOT_FOUND");
  });

  it("no default warehouse → WAREHOUSE_NOT_FOUND", async () => {
    const { dataAccess } = makeFake(base, [INACTIVE_WH]);
    const svc = createInventoryService(dataAccess);
    const res = await svc.matrix({ storeId: "s1", productId: "p1" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("WAREHOUSE_NOT_FOUND");
  });

  it("inactive warehouse apply → INVENTORY_WAREHOUSE_INACTIVE, no writes", async () => {
    const { store, dataAccess } = makeFake(base, [DEFAULT_WH, INACTIVE_WH]);
    const svc = createInventoryService(dataAccess);
    const p = await svc.preview({ storeId: "s1", productId: "p1", warehouseId: "wh2", edits: [{ variantId: "v1", onHand: 5 }] });
    if (!p.ok) throw new Error("preview failed");
    const res = await svc.apply({
      storeId: "s1",
      productId: "p1",
      actorUserId: "u1",
      warehouseId: "wh2",
      baseFingerprint: p.result.fingerprint,
      edits: [{ variantId: "v1", onHand: 5 }],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("INVENTORY_WAREHOUSE_INACTIVE");
    expect(store.writeCount).toBe(0);
  });

  it("invalid rule (negative amount) → INVENTORY_INVALID_RULE", async () => {
    const { dataAccess } = makeFake(base);
    const svc = createInventoryService(dataAccess);
    const res = await svc.preview({ storeId: "s1", productId: "p1", rule: { targetField: "ON_HAND", operation: "INCREASE", amount: -5 } });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("INVENTORY_INVALID_RULE");
  });
});

describe("TODO-152 · error status mapping", () => {
  it("stale → 409", () => expect(inventoryErrorStatus("INVENTORY_PREVIEW_STALE")).toBe(409));
  it("inactive → 409", () => expect(inventoryErrorStatus("INVENTORY_WAREHOUSE_INACTIVE")).toBe(409));
  it("blocked → 422", () => expect(inventoryErrorStatus("INVENTORY_APPLY_BLOCKED")).toBe(422));
  it("invalid rule → 422", () => expect(inventoryErrorStatus("INVENTORY_INVALID_RULE")).toBe(422));
  it("product not found → 404", () => expect(inventoryErrorStatus("PRODUCT_NOT_FOUND")).toBe(404));
  it("warehouse not found → 404", () => expect(inventoryErrorStatus("WAREHOUSE_NOT_FOUND")).toBe(404));
});
