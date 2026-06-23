import { describe, expect, it } from "vitest";
import { createApiClient, resolveApiGatewayUrl } from "../src/index.js";

describe("api client", () => {
  it("trims trailing slashes from the resolved base url", () => {
    expect(resolveApiGatewayUrl("http://localhost:4000/")).toBe("http://localhost:4000");
  });

  it("falls back to a localhost default", () => {
    expect(resolveApiGatewayUrl()).toContain("http");
  });

  it("calls the health endpoint against the base url", async () => {
    const calls: string[] = [];
    const fakeFetch = (async (url: string) => {
      calls.push(String(url));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: "ok",
          service: "api-gateway",
          timestamp: new Date().toISOString(),
        }),
      };
    }) as unknown as typeof fetch;

    const client = createApiClient({ baseUrl: "http://localhost:4000", fetch: fakeFetch });
    const result = await client.health();

    expect(result.status).toBe("ok");
    expect(calls[0]).toBe("http://localhost:4000/health");
  });

  it("throws on a non-ok response", async () => {
    const fakeFetch = (async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    })) as unknown as typeof fetch;

    const client = createApiClient({ baseUrl: "http://localhost:4000", fetch: fakeFetch });
    await expect(client.health()).rejects.toThrow(/503/);
  });

  it("sends bearer tokens and JSON bodies for admin requests", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: "store_1",
          name: "Demo",
          slug: "demo",
          status: "ACTIVE",
          metadata: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      };
    }) as unknown as typeof fetch;

    const client = createApiClient({
      baseUrl: "http://localhost:4000",
      fetch: fakeFetch,
      token: "default-token",
    });
    await client.admin.stores.create({ name: "Demo", slug: "demo", status: "ACTIVE" });

    const headers = calls[0]?.init?.headers as Headers;
    expect(calls[0]?.url).toBe("http://localhost:4000/admin/stores");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(headers.get("authorization")).toBe("Bearer default-token");
    expect(headers.get("content-type")).toBe("application/json");
    expect(calls[0]?.init?.body).toBe(JSON.stringify({ name: "Demo", slug: "demo", status: "ACTIVE" }));
  });
});
