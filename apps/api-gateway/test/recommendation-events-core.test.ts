/**
 * TD-130 (ADR-145…147) — Recommendation Measurement SAF çekirdek testleri.
 * Kapsam: allowlist · kayıt-uygunluğu (bot/prefetch/kimlik/ürün) · dedupe penceresi · CTR.
 */
import { describe, expect, it } from "vitest";
import {
  computeCtr,
  dedupeWindowSecondsFor,
  isAllowedEventType,
  isAllowedPlacement,
  isAllowedSource,
  isWithinDedupeWindow,
  shouldRecordEvent,
} from "../src/recommendation-events/event-core.js";

describe("recommendation event-core: allowlist", () => {
  it("source allowlist", () => {
    expect(isAllowedSource("RECENTLY_VIEWED")).toBe(true);
    expect(isAllowedSource("SIMILAR_PRODUCTS")).toBe(true);
    expect(isAllowedSource("SPONSORED")).toBe(false);
    expect(isAllowedSource("")).toBe(false);
  });
  it("placement allowlist", () => {
    for (const p of ["HOME", "PDP", "CART", "ACCOUNT"]) expect(isAllowedPlacement(p)).toBe(true);
    expect(isAllowedPlacement("CHECKOUT")).toBe(false);
  });
  it("event type allowlist", () => {
    for (const t of ["IMPRESSION", "CLICK", "ADD_TO_CART"]) expect(isAllowedEventType(t)).toBe(true);
    expect(isAllowedEventType("PURCHASE")).toBe(false);
  });
});

describe("recommendation event-core: shouldRecordEvent", () => {
  const base = { isBot: false, isPrefetch: false, hasIdentity: true, hasProduct: true };
  it("hepsi geçerli → true", () => {
    expect(shouldRecordEvent(base)).toBe(true);
  });
  it("bot → false (event üretilmez)", () => {
    expect(shouldRecordEvent({ ...base, isBot: true })).toBe(false);
  });
  it("prefetch → false", () => {
    expect(shouldRecordEvent({ ...base, isPrefetch: true })).toBe(false);
  });
  it("kimlik yok → false", () => {
    expect(shouldRecordEvent({ ...base, hasIdentity: false })).toBe(false);
  });
  it("ürün yok → false", () => {
    expect(shouldRecordEvent({ ...base, hasProduct: false })).toBe(false);
  });
});

describe("recommendation event-core: dedupe", () => {
  it("IMPRESSION geniş, CLICK kısa, ADD_TO_CART 0 (idempotency key ile)", () => {
    const w = { impressionSeconds: 1800, clickSeconds: 30 };
    expect(dedupeWindowSecondsFor("IMPRESSION", w)).toBe(1800);
    expect(dedupeWindowSecondsFor("CLICK", w)).toBe(30);
    expect(dedupeWindowSecondsFor("ADD_TO_CART", w)).toBe(0);
  });
  it("isWithinDedupeWindow: son event yoksa false; pencere içinde true; dışında false", () => {
    const now = 1_000_000;
    expect(isWithinDedupeWindow(null, now, 1800)).toBe(false);
    expect(isWithinDedupeWindow(now - 60_000, now, 1800)).toBe(true); // 1 dk < 30 dk
    expect(isWithinDedupeWindow(now - 2_000_000, now, 1800)).toBe(false); // >30 dk
    expect(isWithinDedupeWindow(now - 1000, now, 0)).toBe(false); // pencere 0 → dedupe yok
  });
});

describe("recommendation event-core: CTR", () => {
  it("clicks/impressions; payda 0 → 0; 4 ondalık", () => {
    expect(computeCtr(0, 0)).toBe(0);
    expect(computeCtr(0, 5)).toBe(0);
    expect(computeCtr(100, 25)).toBe(0.25);
    expect(computeCtr(3, 1)).toBe(0.3333);
  });
});
