import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * TODO-156D tamamlama — middleware runtime davranışı (§4/§7). Resolver mock'lanır; middleware'in doğru HTTP
 * kodu + Location ile yönlendirdiği, eşleşme yoksa geçiş (next) yaptığı doğrulanır. NextResponse gerçek.
 */

const resolve = vi.fn();
vi.mock("../lib/seo/redirect-runtime", () => ({
  resolveIncomingRedirect: (...args: unknown[]) => resolve(...args),
}));

import { middleware } from "../middleware";

function req(pathname: string) {
  return {
    nextUrl: { pathname, origin: "https://magaza.example" },
  } as unknown as Parameters<typeof middleware>[0];
}

afterEach(() => {
  resolve.mockReset();
});

describe("middleware — redirect resolution", () => {
  it("eşleşme varsa 301 + Location(mutlak hedef) döner", async () => {
    resolve.mockResolvedValue({ target: "/products/iphone-15-pro", type: 301, hops: 1 });
    const res = await middleware(req("/products/iphone-15"));
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("https://magaza.example/products/iphone-15-pro");
  });

  it("farklı status (308) korunur", async () => {
    resolve.mockResolvedValue({ target: "/products/y", type: 308, hops: 1 });
    const res = await middleware(req("/products/x"));
    expect(res.status).toBe(308);
  });

  it("eşleşme yoksa geçiş (next) — redirect değil", async () => {
    resolve.mockResolvedValue(null);
    const res = await middleware(req("/products/canli"));
    // NextResponse.next() → yönlendirme yok (3xx değil); Location header yok.
    expect(res.headers.get("location")).toBeNull();
    expect(res.status).toBeLessThan(300);
  });
});
