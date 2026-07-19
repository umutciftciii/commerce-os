import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resolveIncomingRedirect,
  __resetRedirectCache,
} from "../lib/seo/redirect-runtime";

/**
 * TODO-156D tamamlama — Storefront RUNTIME redirect çözümleyicisi (§4/§5/§6/§7). Gateway public redirect ucu
 * fetch ile mock'lanır; SAF resolver (chain/loop) + TTL cache davranışı doğrulanır. DB/gateway gerekmez.
 */

type Row = { source: string; target: string; status: number };

function mockRedirects(rows: Row[]): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async () => ({ ok: true, json: async () => ({ data: rows }) }));
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

beforeEach(() => {
  __resetRedirectCache();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("resolveIncomingRedirect — lookup (§4/§5)", () => {
  it("ürün redirect eşleşir → hedef + status", async () => {
    mockRedirects([{ source: "/products/iphone-15", target: "/products/iphone-15-pro", status: 301 }]);
    expect(await resolveIncomingRedirect("/products/iphone-15", 1000)).toEqual({
      target: "/products/iphone-15-pro",
      type: 301,
      hops: 1,
    });
  });

  it("eşleşme yoksa null (route devam → gerekiyorsa 404, soft redirect yok)", async () => {
    mockRedirects([{ source: "/products/x", target: "/products/y", status: 301 }]);
    expect(await resolveIncomingRedirect("/products/canli-urun", 1000)).toBeNull();
  });

  it("farklı status kodları korunur (302/307/308)", async () => {
    for (const status of [302, 307, 308] as const) {
      __resetRedirectCache();
      mockRedirects([{ source: "/products/a", target: "/products/b", status }]);
      expect((await resolveIncomingRedirect("/products/a", 1000))?.type).toBe(status);
    }
  });
});

describe("resolveIncomingRedirect — chain & loop (§7)", () => {
  it("zincir tek adımda son hedefe iner (A→B→C ⇒ C)", async () => {
    mockRedirects([
      { source: "/products/a", target: "/products/b", status: 301 },
      { source: "/products/b", target: "/products/c", status: 301 },
    ]);
    expect((await resolveIncomingRedirect("/products/a", 1000))?.target).toBe("/products/c");
  });

  it("loop → null (güvenli; ana sayfaya yönlendirme yok)", async () => {
    mockRedirects([
      { source: "/products/a", target: "/products/b", status: 301 },
      { source: "/products/b", target: "/products/a", status: 301 },
    ]);
    expect(await resolveIncomingRedirect("/products/a", 1000)).toBeNull();
  });
});

describe("resolveIncomingRedirect — güvenlik filtreleri", () => {
  it("query-tabanlı kaynak (kategori ?category=) runtime index'ten HARİÇ (yanlış /products redirect'i yok)", async () => {
    mockRedirects([{ source: "/products?category=eski", target: "/products?category=yeni", status: 301 }]);
    // /products listeleme sayfası ASLA redirect olmamalı (query source elendi).
    expect(await resolveIncomingRedirect("/products", 1000)).toBeNull();
  });

  it("gateway hatası (ok:false) → boş kural → null (site kırılmaz)", async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch;
    expect(await resolveIncomingRedirect("/products/a", 1000)).toBeNull();
  });

  it("fetch throw → null (gateway down güvenli)", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("network");
    }) as unknown as typeof fetch;
    expect(await resolveIncomingRedirect("/products/a", 1000)).toBeNull();
  });
});

describe("resolveIncomingRedirect — TTL cache (§6)", () => {
  it("TTL içinde fetch bir kez çağrılır (DB/gateway her istekte vurulmaz)", async () => {
    const fn = mockRedirects([{ source: "/products/a", target: "/products/b", status: 301 }]);
    await resolveIncomingRedirect("/products/a", 1000);
    await resolveIncomingRedirect("/products/a", 1000 + 30_000); // TTL (60s) içinde
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("TTL dolunca yeniden fetch eder", async () => {
    const fn = mockRedirects([{ source: "/products/a", target: "/products/b", status: 301 }]);
    await resolveIncomingRedirect("/products/a", 1000);
    await resolveIncomingRedirect("/products/a", 1000 + 61_000); // TTL aşıldı
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
