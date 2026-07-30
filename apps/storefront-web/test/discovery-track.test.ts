/**
 * TODO-162 (ADR-205) — Keşif → PDP → add-to-cart attribution istemci mantığı (sessionStorage; node polyfill).
 *
 * Kapsam: rememberDiscoveryClick → consumeDiscoveryAttribution TÜKETİR (tek sefer); clickId nonce (add-to-cart
 * idempotency temeli); product-scoped (başka ürün bağlamını tüketmez); yoksa null; TTL sonrası null; TTL dolmuş
 * bağlam consume edilse de null (sahte attribution yok). trackDiscoveryAddToCart bağlam yoksa emit ETMEZ (NO-OP).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  consumeDiscoveryAttribution,
  rememberDiscoveryClick,
  trackDiscoveryAddToCart,
} from "../lib/discovery/track";

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

const CTX = { sectionId: "sec_1", sectionType: "CONTINUE_BROWSING", eligibilitySource: "RECENTLY_VIEWED" };

beforeEach(() => {
  (globalThis as unknown as { sessionStorage: MemoryStorage }).sessionStorage = new MemoryStorage();
});
afterEach(() => {
  delete (globalThis as unknown as { sessionStorage?: MemoryStorage }).sessionStorage;
  vi.restoreAllMocks();
});

describe("discovery attribution (sessionStorage)", () => {
  it("remember → consume: bağlamı döndürür ve TÜKETİR (ikinci consume null)", () => {
    rememberDiscoveryClick(CTX, "prod_1");
    const first = consumeDiscoveryAttribution("prod_1");
    expect(first).toMatchObject(CTX);
    expect(first?.clickId).toBeTruthy();
    expect(first?.pageViewId).toBeTruthy();
    expect(consumeDiscoveryAttribution("prod_1")).toBeNull();
  });

  it("clickId benzersiz nonce (add-to-cart dedupe idempotency temeli)", () => {
    rememberDiscoveryClick(CTX, "a");
    rememberDiscoveryClick(CTX, "b");
    const ca = consumeDiscoveryAttribution("a");
    const cb = consumeDiscoveryAttribution("b");
    expect(ca?.clickId).toBeTruthy();
    expect(cb?.clickId).toBeTruthy();
    expect(ca?.clickId).not.toBe(cb?.clickId);
  });

  it("product-scoped: bir ürünü consume etmek diğerinin bağlamını tüketmez", () => {
    rememberDiscoveryClick(CTX, "a");
    rememberDiscoveryClick(CTX, "b");
    expect(consumeDiscoveryAttribution("a")).toMatchObject(CTX);
    expect(consumeDiscoveryAttribution("b")).toMatchObject(CTX); // hâlâ mevcut
  });

  it("kayıt yoksa consume null (doğrudan PDP → sahte attribution yok)", () => {
    expect(consumeDiscoveryAttribution("unknown")).toBeNull();
  });

  it("TTL geçmiş kayıt null döner (30 dk penceresi)", () => {
    rememberDiscoveryClick(CTX, "p");
    const raw = JSON.parse((globalThis as unknown as { sessionStorage: MemoryStorage }).sessionStorage.getItem("commerce_os_discovery_attr")!);
    raw.p.ts = Date.now() - 31 * 60 * 1000;
    (globalThis as unknown as { sessionStorage: MemoryStorage }).sessionStorage.setItem("commerce_os_discovery_attr", JSON.stringify(raw));
    expect(consumeDiscoveryAttribution("p")).toBeNull();
  });

  it("trackDiscoveryAddToCart: bağlam yoksa emit ETMEZ (NO-OP)", () => {
    const fetchSpy = vi.fn(() => Promise.resolve(new Response(null, { status: 200 })));
    (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchSpy as unknown as typeof fetch;
    trackDiscoveryAddToCart("no-context");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("trackDiscoveryAddToCart: taze bağlam varsa ADD_TO_CART emit eder (dedupeKey=clickId) ve bağlamı tüketir", () => {
    const fetchSpy = vi.fn(() => Promise.resolve(new Response(null, { status: 200 })));
    (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchSpy as unknown as typeof fetch;
    rememberDiscoveryClick(CTX, "prod_9");
    trackDiscoveryAddToCart("prod_9");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/discovery/event");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ type: "ADD_TO_CART", productId: "prod_9", sectionId: "sec_1", eligibilitySource: "RECENTLY_VIEWED" });
    expect(String(body.dedupeKey)).toMatch(/^atc:/);
    // Bağlam tüketildi → ikinci çağrı emit etmez (duplicate dönüşüm sayılmaz).
    trackDiscoveryAddToCart("prod_9");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
