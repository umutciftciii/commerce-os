/**
 * TODO-168 (ADR-267) — ANONIM cart-change meta token testleri.
 * Kapsam: encode/decode round-trip · imza doğrulama · sürüm uyuşmazlığı → null · bozuk → null ·
 * 100-item + tam ack GERÇEK byte-boyut bütçesi · severity-farkında budama (WARN/BLOCKING korunur).
 */
import { describe, expect, it } from "vitest";
import {
  CART_META_BUDGET_BYTES,
  CART_META_VERSION,
  type CartMeta,
  decodeCartMeta,
  emptyCartMeta,
  encodeCartMeta,
  mintCartId,
  serializeCartMetaWithinBudget,
} from "../lib/cart-meta-token";

const SECRET = "storefront-test-cart-secret-000000";

function snap(t: number, over: Partial<CartMeta["s"][string]> = {}) {
  return { u: 499_900, l: 599_900, d: 449_900, c: "TRY", k: 1 as const, o: 1 as const, t, ...over };
}

function metaWith(count: number, ackCount: number): CartMeta {
  const meta = emptyCartMeta(mintCartId());
  for (let i = 0; i < count; i++) meta.s[`variant_${"c".repeat(20)}_${i}`] = snap(1_700_000_000 + i);
  for (let i = 0; i < ackCount; i++) meta.a.push(`${"f".repeat(38)}${i}`);
  return meta;
}

describe("cart-meta-token: encode/decode", () => {
  it("round-trips a valid meta", () => {
    const meta = emptyCartMeta(mintCartId());
    meta.s["v1"] = snap(1_700_000_000);
    meta.a.push("fp-1");
    const decoded = decodeCartMeta(encodeCartMeta(meta, SECRET), SECRET);
    expect(decoded).not.toBeNull();
    expect(decoded?.cid).toBe(meta.cid);
    expect(decoded?.s.v1?.u).toBe(499_900);
    expect(decoded?.a).toEqual(["fp-1"]);
  });

  it("rejects tampered signature → null (fail-safe)", () => {
    const token = encodeCartMeta(emptyCartMeta("cid-1"), SECRET);
    expect(decodeCartMeta(token, "wrong-secret-zzzzzzzzzzzzzzzzzz")).toBeNull();
    expect(decodeCartMeta(token.slice(0, -3) + "aaa", SECRET)).toBeNull();
  });

  it("rejects unknown schema version → null (re-baseline)", () => {
    const meta = { ...emptyCartMeta("cid-1"), v: CART_META_VERSION + 99 };
    const token = encodeCartMeta(meta as CartMeta, SECRET);
    expect(decodeCartMeta(token, SECRET)).toBeNull();
  });

  it("rejects garbage → null", () => {
    expect(decodeCartMeta("not-a-token", SECRET)).toBeNull();
    expect(decodeCartMeta(undefined, SECRET)).toBeNull();
    expect(decodeCartMeta("", SECRET)).toBeNull();
  });

  it("drops malformed snapshot entries but keeps valid ones", () => {
    const meta = emptyCartMeta("cid-1");
    meta.s["ok"] = snap(1);
    (meta.s as Record<string, unknown>)["bad"] = { nope: true };
    const decoded = decodeCartMeta(encodeCartMeta(meta, SECRET), SECRET);
    expect(Object.keys(decoded!.s)).toEqual(["ok"]);
  });
});

describe("cart-meta-token: byte budget (REQUIRED)", () => {
  it("100 snapshots + full ack set → signed cookie stays within budget after pruning", () => {
    const meta = metaWith(100, 250);
    const { token, pruned } = serializeCartMetaWithinBudget(meta, SECRET);
    expect(Buffer.byteLength(token, "utf8")).toBeLessThanOrEqual(CART_META_BUDGET_BYTES + 64);
    expect(pruned).toBe(true);
    // Sonuç yine geçerli bir meta olmalı (cart ASLA bozulmaz).
    expect(decodeCartMeta(token, SECRET)).not.toBeNull();
  });

  it("small meta is not pruned", () => {
    const { token, pruned } = serializeCartMetaWithinBudget(metaWith(2, 2), SECRET);
    expect(pruned).toBe(false);
    expect(Buffer.byteLength(token, "utf8")).toBeLessThanOrEqual(CART_META_BUDGET_BYTES);
  });

  it("severity-aware: WARN/BLOCKING snapshots are preserved over oldest INFO", () => {
    const meta = metaWith(100, 0);
    const keepIds = Object.keys(meta.s).slice(0, 5); // 5 WARN/BLOCKING varyant korunmalı
    const { token } = serializeCartMetaWithinBudget(meta, SECRET, new Set(keepIds));
    const decoded = decodeCartMeta(token, SECRET)!;
    for (const id of keepIds) expect(decoded.s[id]).toBeDefined();
  });
});
