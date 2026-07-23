import { describe, expect, it } from "vitest";
import {
  canManuallyAdvance,
  evaluateManualStatusChange,
  MANUAL_SHIPMENT_STATUS_TARGETS,
} from "../src/shipping/status-map.js";

/**
 * TODO-162 (ADR-101) — Manual Shipment Status transition kuralları (SAF).
 * Monotonic + terminal-kilit + izinli hedef (operatör entegre süreç dışı teslim akışı).
 */
describe("evaluateManualStatusChange", () => {
  it("izinli ileri hedeflere geçiş serbest (IN_TRANSIT → DELIVERED)", () => {
    expect(evaluateManualStatusChange("IN_TRANSIT", "DELIVERED")).toEqual({ ok: true });
    expect(evaluateManualStatusChange("ORDER_CREATED", "IN_TRANSIT")).toEqual({ ok: true });
    expect(evaluateManualStatusChange("OUT_FOR_DELIVERY", "DELIVERED")).toEqual({ ok: true });
    expect(evaluateManualStatusChange("DELIVERY_FAILED", "DELIVERED")).toEqual({ ok: true });
    expect(evaluateManualStatusChange("LABEL_CREATED", "DELIVERED")).toEqual({ ok: true });
  });

  it("geri gidiş reddedilir (OUT_FOR_DELIVERY → IN_TRANSIT)", () => {
    expect(evaluateManualStatusChange("OUT_FOR_DELIVERY", "IN_TRANSIT")).toEqual({
      ok: false,
      reason: "STATUS_REGRESSION",
    });
  });

  it("terminal gönderi farklı hedefe değiştirilemez (DELIVERED/RETURNED/CANCELLED/FAILED)", () => {
    for (const current of ["DELIVERED", "RETURNED", "CANCELLED", "FAILED"] as const) {
      // Hedef mevcut durumdan FARKLI olmalı (aynısı NO_CHANGE'e düşer).
      expect(evaluateManualStatusChange(current, "OUT_FOR_DELIVERY")).toEqual({
        ok: false,
        reason: "SHIPMENT_TERMINAL",
      });
    }
  });

  it("aynı duruma geçiş NO_CHANGE", () => {
    expect(evaluateManualStatusChange("IN_TRANSIT", "IN_TRANSIT")).toEqual({
      ok: false,
      reason: "NO_CHANGE",
    });
  });

  it("izinli olmayan hedef reddedilir (ör. hazırlık durumları hedef olamaz)", () => {
    expect(evaluateManualStatusChange("IN_TRANSIT", "DRAFT" as never)).toEqual({
      ok: false,
      reason: "INVALID_TARGET",
    });
    expect(evaluateManualStatusChange("IN_TRANSIT", "CANCELLED" as never)).toEqual({
      ok: false,
      reason: "INVALID_TARGET",
    });
  });

  it("izinli hedef kümesi tam olarak 5 operasyonel durum", () => {
    expect([...MANUAL_SHIPMENT_STATUS_TARGETS].sort()).toEqual(
      ["DELIVERED", "DELIVERY_FAILED", "IN_TRANSIT", "OUT_FOR_DELIVERY", "RETURNED"].sort(),
    );
  });
});

describe("canManuallyAdvance", () => {
  it("terminal olmayan gönderi ilerletilebilir", () => {
    expect(canManuallyAdvance("IN_TRANSIT")).toBe(true);
    expect(canManuallyAdvance("ORDER_CREATED")).toBe(true);
    expect(canManuallyAdvance("OUT_FOR_DELIVERY")).toBe(true);
  });
  it("terminal gönderi ilerletilemez", () => {
    expect(canManuallyAdvance("DELIVERED")).toBe(false);
    expect(canManuallyAdvance("CANCELLED")).toBe(false);
  });
});
