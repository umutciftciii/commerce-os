/**
 * TD-130 (ADR-147) — Recommendation attribution istemci mantığı (sessionStorage; node env polyfill).
 *
 * Kapsam: rememberRecommendationClick → consumeRecommendationAttribution TÜKETİR (tek sefer); clickId nonce
 * (add-to-cart idempotency temeli); yoksa null; TTL sonrası null. sessionStorage in-memory polyfill'lenir.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  consumeRecommendationAttribution,
  rememberRecommendationClick,
} from "../lib/recommendation/track";

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  clear() {
    this.map.clear();
  }
}

beforeEach(() => {
  (globalThis as unknown as { sessionStorage: MemoryStorage }).sessionStorage = new MemoryStorage();
});
afterEach(() => {
  delete (globalThis as unknown as { sessionStorage?: MemoryStorage }).sessionStorage;
});

describe("recommendation attribution (sessionStorage)", () => {
  it("remember → consume: bağlamı döndürür ve TÜKETİR (ikinci consume null)", () => {
    rememberRecommendationClick({ source: "SIMILAR_PRODUCTS", placement: "PDP", anchorProductId: "anchor_1" }, "prod_1");
    const first = consumeRecommendationAttribution("prod_1");
    expect(first).toMatchObject({ source: "SIMILAR_PRODUCTS", placement: "PDP", anchorProductId: "anchor_1" });
    expect(first?.clickId).toBeTruthy();
    // İkinci consume: bağlam silindiği için null (tek dönüşüm bir kez atfedilir).
    expect(consumeRecommendationAttribution("prod_1")).toBeNull();
  });

  it("clickId benzersiz nonce (add-to-cart dedupe idempotency temeli)", () => {
    rememberRecommendationClick({ source: "RECENTLY_VIEWED", placement: "HOME" }, "a");
    rememberRecommendationClick({ source: "RECENTLY_VIEWED", placement: "HOME" }, "b");
    const ca = consumeRecommendationAttribution("a");
    const cb = consumeRecommendationAttribution("b");
    expect(ca?.clickId).toBeTruthy();
    expect(cb?.clickId).toBeTruthy();
    expect(ca?.clickId).not.toBe(cb?.clickId);
  });

  it("kayıt yoksa consume null", () => {
    expect(consumeRecommendationAttribution("unknown")).toBeNull();
  });

  it("TTL geçmiş kayıt null döner (30 dk penceresi)", () => {
    rememberRecommendationClick({ source: "RECENTLY_VIEWED", placement: "ACCOUNT" }, "p");
    // Kaydı elle eskiye çek (ts'i 31 dk öncesine).
    const raw = JSON.parse((globalThis as any).sessionStorage.getItem("commerce_os_rec_attr"));
    raw.p.ts = Date.now() - 31 * 60 * 1000;
    (globalThis as any).sessionStorage.setItem("commerce_os_rec_attr", JSON.stringify(raw));
    expect(consumeRecommendationAttribution("p")).toBeNull();
  });
});
