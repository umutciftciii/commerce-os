/**
 * TODO-162 (ADR-205) — Home Discovery section-analytics SAF çekirdek testleri.
 * Kapsam (§22): allowlist · kayıt-uygunluğu (bot/prefetch/kimlik/hidden-section) · dedupe penceresi.
 */
import { describe, expect, it } from "vitest";
import {
  HOME_DISCOVERY_EVENT_TYPES,
  discoveryDedupeWindowSecondsFor,
  isAllowedDiscoveryEventType,
  shouldRecordDiscoveryEvent,
} from "../src/home/discovery-event-core.js";

describe("discovery-event-core: allowlist", () => {
  it("event tip allowlist", () => {
    for (const t of HOME_DISCOVERY_EVENT_TYPES) expect(isAllowedDiscoveryEventType(t)).toBe(true);
    expect(isAllowedDiscoveryEventType("PURCHASE")).toBe(false);
    expect(isAllowedDiscoveryEventType("")).toBe(false);
  });
});

describe("discovery-event-core: kayıt-uygunluğu (§22)", () => {
  const base = { isBot: false, isPrefetch: false, hasIdentity: true, sectionRendered: true };
  it("uygun → true", () => {
    expect(shouldRecordDiscoveryEvent(base)).toBe(true);
  });
  it("bot → false", () => {
    expect(shouldRecordDiscoveryEvent({ ...base, isBot: true })).toBe(false);
  });
  it("prefetch → false", () => {
    expect(shouldRecordDiscoveryEvent({ ...base, isPrefetch: true })).toBe(false);
  });
  it("kimlik yok → false", () => {
    expect(shouldRecordDiscoveryEvent({ ...base, hasIdentity: false })).toBe(false);
  });
  it("hidden section (sectionRendered=false) → false (eligibility=false → impression YOK)", () => {
    expect(shouldRecordDiscoveryEvent({ ...base, sectionRendered: false })).toBe(false);
  });
});

describe("discovery-event-core: dedupe penceresi", () => {
  const w = { impressionSeconds: 1800, interactionSeconds: 5 };
  it("impression'lar geniş pencere", () => {
    expect(discoveryDedupeWindowSecondsFor("SECTION_IMPRESSION", w)).toBe(1800);
    expect(discoveryDedupeWindowSecondsFor("CARD_IMPRESSION", w)).toBe(1800);
  });
  it("click'ler kısa pencere", () => {
    expect(discoveryDedupeWindowSecondsFor("PRODUCT_CLICK", w)).toBe(5);
    expect(discoveryDedupeWindowSecondsFor("CTA_CLICK", w)).toBe(5);
  });
  it("ADD_TO_CART pencere-bazlı DEĞİL (dedupeKey idempotency → 0)", () => {
    expect(discoveryDedupeWindowSecondsFor("ADD_TO_CART", w)).toBe(0);
  });
});
