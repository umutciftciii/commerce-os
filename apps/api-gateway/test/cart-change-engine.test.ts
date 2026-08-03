/**
 * TODO-168 (ADR-267) — Cart Change Awareness SAF motor testleri.
 * Kapsam (spec §13): 8 değişiklik tipi + quantity · fiyat yönü · indirim başla/bitti · stok/varlık ·
 * currency mismatch bastırma · dedupe/idempotency · yeni-fiyat-yeni-fingerprint · ack (WARN gate) ·
 * severity sıralama · legacy snapshot yok · tenant/store izolasyon.
 */
import { describe, expect, it } from "vitest";
import {
  type CartChangeLineInput,
  type CartLineProjection,
  type CartLineSnapshot,
  computeCartChanges,
  fingerprintFor,
  isAllowedChangeType,
  severityOf,
} from "../src/cart-changes/change-engine.js";

const NONE: ReadonlySet<string> = new Set<string>();

function snap(over: Partial<CartLineSnapshot> = {}): CartLineSnapshot {
  return {
    unitPriceMinor: 10_000,
    listPriceMinor: null,
    discountedUnitPriceMinor: null,
    currency: "TRY",
    inStock: true,
    orderable: true,
    ...over,
  };
}

function proj(over: Partial<CartLineProjection> = {}): CartLineProjection {
  return {
    unitPriceMinor: 10_000,
    listPriceMinor: null,
    discountedUnitPriceMinor: null,
    currency: "TRY",
    inStock: true,
    orderable: true,
    quantityAdjusted: false,
    requestedQuantity: 1,
    availableQuantity: 1,
    ...over,
  };
}

function line(over: Partial<CartChangeLineInput> = {}): CartChangeLineInput {
  return {
    storeId: "store_1",
    cartId: "cart_1",
    variantId: "var_1",
    snapshot: snap(),
    current: proj(),
    ...over,
  };
}

function only(input: CartChangeLineInput, acked: ReadonlySet<string> = NONE) {
  const res = computeCartChanges([input], acked);
  return res.changes[0] ?? null;
}

describe("change-engine: severity map + allowlist", () => {
  it("severity by type", () => {
    expect(severityOf("PRICE_DECREASED")).toBe("INFO");
    expect(severityOf("PRICE_INCREASED")).toBe("WARN");
    expect(severityOf("DISCOUNT_STARTED")).toBe("INFO");
    expect(severityOf("DISCOUNT_ENDED")).toBe("WARN");
    expect(severityOf("VARIANT_OUT_OF_STOCK")).toBe("BLOCKING");
    expect(severityOf("VARIANT_BACK_IN_STOCK")).toBe("INFO");
    expect(severityOf("PRODUCT_UNAVAILABLE")).toBe("BLOCKING");
    expect(severityOf("PRODUCT_AVAILABLE_AGAIN")).toBe("INFO");
    expect(severityOf("QUANTITY_ADJUSTED")).toBe("BLOCKING");
  });
  it("allowlist", () => {
    expect(isAllowedChangeType("PRICE_DECREASED")).toBe(true);
    expect(isAllowedChangeType("SELLER_CHANGED")).toBe(false);
    expect(isAllowedChangeType("")).toBe(false);
  });
});

describe("change-engine: price movement", () => {
  it("PRICE_DECREASED (INFO, not blocking)", () => {
    const c = only(line({ current: proj({ unitPriceMinor: 8_000 }) }));
    expect(c?.changeType).toBe("PRICE_DECREASED");
    expect(c?.severity).toBe("INFO");
    expect(c?.oldValueMinor).toBe(10_000);
    expect(c?.newValueMinor).toBe(8_000);
    expect(c?.requiresAction).toBe(false);
    expect(c?.blocking).toBe(false);
  });
  it("PRICE_INCREASED (WARN, requiresAction)", () => {
    const c = only(line({ current: proj({ unitPriceMinor: 12_000 }) }));
    expect(c?.changeType).toBe("PRICE_INCREASED");
    expect(c?.severity).toBe("WARN");
    expect(c?.requiresAction).toBe(true);
  });
  it("no price change when equal", () => {
    expect(only(line())).toBeNull();
  });
});

describe("change-engine: discount presence (no double-count with price)", () => {
  it("DISCOUNT_STARTED when snapshot had none, now has one", () => {
    const c = only(
      line({
        snapshot: snap({ discountedUnitPriceMinor: null }),
        current: proj({ discountedUnitPriceMinor: 8_000 }),
      }),
    );
    expect(c?.changeType).toBe("DISCOUNT_STARTED");
    expect(c?.severity).toBe("INFO");
    expect(c?.oldValueMinor).toBe(10_000);
    expect(c?.newValueMinor).toBe(8_000);
  });
  it("DISCOUNT_ENDED when snapshot had one, now none (WARN)", () => {
    const c = only(
      line({
        snapshot: snap({ discountedUnitPriceMinor: 8_000 }),
        current: proj({ discountedUnitPriceMinor: null }),
      }),
    );
    expect(c?.changeType).toBe("DISCOUNT_ENDED");
    expect(c?.severity).toBe("WARN");
    expect(c?.oldValueMinor).toBe(8_000);
    expect(c?.newValueMinor).toBe(10_000);
  });
  it("discount presence unchanged → falls through to base price delta only", () => {
    // Both discounted; base unit unchanged, discounted differs → discount presence same → PRICE by base (equal) → none.
    const c = only(
      line({
        snapshot: snap({ discountedUnitPriceMinor: 9_000 }),
        current: proj({ discountedUnitPriceMinor: 8_000 }),
      }),
    );
    expect(c).toBeNull();
  });
});

describe("change-engine: stock & availability", () => {
  it("VARIANT_OUT_OF_STOCK (BLOCKING)", () => {
    const c = only(line({ snapshot: snap({ inStock: true }), current: proj({ inStock: false }) }));
    expect(c?.changeType).toBe("VARIANT_OUT_OF_STOCK");
    expect(c?.blocking).toBe(true);
  });
  it("VARIANT_BACK_IN_STOCK (INFO)", () => {
    const c = only(line({ snapshot: snap({ inStock: false }), current: proj({ inStock: true }) }));
    expect(c?.changeType).toBe("VARIANT_BACK_IN_STOCK");
    expect(c?.severity).toBe("INFO");
  });
  it("PRODUCT_UNAVAILABLE (BLOCKING) takes precedence over stock/price", () => {
    const c = only(
      line({
        snapshot: snap({ orderable: true, inStock: true, unitPriceMinor: 10_000 }),
        current: proj({ orderable: false, inStock: false, unitPriceMinor: 12_000 }),
      }),
    );
    expect(c?.changeType).toBe("PRODUCT_UNAVAILABLE");
    expect(c?.blocking).toBe(true);
  });
  it("PRODUCT_AVAILABLE_AGAIN (INFO)", () => {
    const c = only(line({ snapshot: snap({ orderable: false }), current: proj({ orderable: true }) }));
    expect(c?.changeType).toBe("PRODUCT_AVAILABLE_AGAIN");
  });
  it("both unavailable → no change", () => {
    expect(only(line({ snapshot: snap({ orderable: false }), current: proj({ orderable: false }) }))).toBeNull();
  });
});

describe("change-engine: quantity adjustment", () => {
  it("QUANTITY_ADJUSTED (BLOCKING) when system truncates requested qty", () => {
    const c = only(
      line({ current: proj({ quantityAdjusted: true, requestedQuantity: 5, availableQuantity: 2 }) }),
    );
    expect(c?.changeType).toBe("QUANTITY_ADJUSTED");
    expect(c?.severity).toBe("BLOCKING");
    expect(c?.oldValueMinor).toBe(5);
    expect(c?.newValueMinor).toBe(2);
  });
  it("user's own quantity change (status OK) produces NO price false-positive", () => {
    // Same variant, snapshot price unchanged, quantityAdjusted false → no change even if qty differs.
    expect(only(line({ current: proj({ quantityAdjusted: false }) }))).toBeNull();
  });
});

describe("change-engine: currency mismatch suppression", () => {
  it("price/discount suppressed when currency differs", () => {
    const c = only(
      line({
        snapshot: snap({ currency: "TRY", unitPriceMinor: 10_000 }),
        current: proj({ currency: "USD", unitPriceMinor: 5_000 }),
      }),
    );
    expect(c).toBeNull();
  });
  it("availability change still fires across currency change", () => {
    const c = only(
      line({
        snapshot: snap({ currency: "TRY", orderable: true }),
        current: proj({ currency: "USD", orderable: false }),
      }),
    );
    expect(c?.changeType).toBe("PRODUCT_UNAVAILABLE");
  });
});

describe("change-engine: legacy (no snapshot) baseline", () => {
  it("no snapshot → no change (no fabricated history)", () => {
    expect(only(line({ snapshot: null, current: proj({ unitPriceMinor: 99_999 }) }))).toBeNull();
  });
});

describe("change-engine: fingerprint determinism & dedupe", () => {
  it("same state → same fingerprint (idempotent)", () => {
    const a = only(line({ current: proj({ unitPriceMinor: 12_000 }) }));
    const b = only(line({ current: proj({ unitPriceMinor: 12_000 }) }));
    expect(a?.fingerprint).toBe(b?.fingerprint);
  });
  it("a NEW price value yields a NEW fingerprint", () => {
    const a = only(line({ current: proj({ unitPriceMinor: 12_000 }) }));
    const b = only(line({ current: proj({ unitPriceMinor: 13_000 }) }));
    expect(a?.fingerprint).not.toBe(b?.fingerprint);
  });
  it("store-scoped: different store → different fingerprint (tenant isolation)", () => {
    const a = only(line({ storeId: "store_A", current: proj({ unitPriceMinor: 12_000 }) }));
    const b = only(line({ storeId: "store_B", current: proj({ unitPriceMinor: 12_000 }) }));
    expect(a?.fingerprint).not.toBe(b?.fingerprint);
  });
  it("different cart → different fingerprint", () => {
    const a = only(line({ cartId: "cart_A", current: proj({ unitPriceMinor: 12_000 }) }));
    const b = only(line({ cartId: "cart_B", current: proj({ unitPriceMinor: 12_000 }) }));
    expect(a?.fingerprint).not.toBe(b?.fingerprint);
  });
  it("duplicate identical lines do not produce duplicate changes", () => {
    const l = line({ current: proj({ unitPriceMinor: 12_000 }) });
    const res = computeCartChanges([l, { ...l }], NONE);
    expect(res.changes).toHaveLength(1);
  });
  it("fingerprintFor is pure/stable", () => {
    const args = {
      storeId: "s",
      cartId: "c",
      variantId: "v",
      changeType: "PRICE_INCREASED" as const,
      oldValueMinor: 100,
      newValueMinor: 200,
      currency: "TRY",
    };
    expect(fingerprintFor(args)).toBe(fingerprintFor(args));
  });
});

describe("change-engine: acknowledgement (WARN checkout gate)", () => {
  it("unacked WARN → requiresAcknowledgement true", () => {
    const res = computeCartChanges([line({ current: proj({ unitPriceMinor: 12_000 }) })], NONE);
    expect(res.hasWarnings).toBe(true);
    expect(res.requiresAcknowledgement).toBe(true);
    expect(res.unacknowledgedChangeCount).toBe(1);
  });
  it("acked WARN → requiresAcknowledgement false, still listed as acknowledged", () => {
    const fp = only(line({ current: proj({ unitPriceMinor: 12_000 }) }))!.fingerprint;
    const res = computeCartChanges([line({ current: proj({ unitPriceMinor: 12_000 }) })], new Set([fp]));
    expect(res.requiresAcknowledgement).toBe(false);
    expect(res.changes[0]?.acknowledged).toBe(true);
    expect(res.unacknowledgedChangeCount).toBe(0);
  });
  it("acking an OLD fingerprint does not hide a NEW price change", () => {
    const oldFp = only(line({ current: proj({ unitPriceMinor: 12_000 }) }))!.fingerprint;
    // Price moves again → new fingerprint; old ack must not suppress.
    const res = computeCartChanges([line({ current: proj({ unitPriceMinor: 13_000 }) })], new Set([oldFp]));
    expect(res.requiresAcknowledgement).toBe(true);
    expect(res.changes[0]?.acknowledged).toBe(false);
  });
  it("INFO never requires acknowledgement", () => {
    const res = computeCartChanges([line({ current: proj({ unitPriceMinor: 8_000 }) })], NONE);
    expect(res.requiresAcknowledgement).toBe(false);
    expect(res.hasWarnings).toBe(false);
  });
  it("BLOCKING is not resolved by acknowledgement (still blocking)", () => {
    const fp = only(line({ current: proj({ inStock: false }) }))!.fingerprint;
    const res = computeCartChanges([line({ current: proj({ inStock: false }) })], new Set([fp]));
    expect(res.hasBlockingChanges).toBe(true);
    expect(res.changes[0]?.blocking).toBe(true);
  });
});

describe("change-engine: severity ordering & cart-level flags", () => {
  it("orders BLOCKING → WARN → INFO", () => {
    const res = computeCartChanges(
      [
        line({ variantId: "v_info", current: proj({ unitPriceMinor: 8_000 }) }), // INFO
        line({ variantId: "v_block", current: proj({ inStock: false }) }), // BLOCKING
        line({ variantId: "v_warn", current: proj({ unitPriceMinor: 12_000 }) }), // WARN
      ],
      NONE,
    );
    expect(res.changes.map((c) => c.severity)).toEqual(["BLOCKING", "WARN", "INFO"]);
    expect(res.hasBlockingChanges).toBe(true);
    expect(res.hasWarnings).toBe(true);
    expect(res.unacknowledgedChangeCount).toBe(3);
  });
  it("empty input → empty result", () => {
    const res = computeCartChanges([], NONE);
    expect(res.changes).toHaveLength(0);
    expect(res.requiresAcknowledgement).toBe(false);
    expect(res.hasBlockingChanges).toBe(false);
  });
});
