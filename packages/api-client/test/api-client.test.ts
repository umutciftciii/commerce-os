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
});
