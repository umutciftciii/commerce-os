import { describe, expect, it } from "vitest";
import { createApiClient } from "../src/index.js";

/** İstek header'larını + gövdeyi kaydeden fetch sahtesi. */
function recordingFetch(response: { ok: boolean; status: number; body?: unknown }) {
  const calls: Array<{ url: string; init: RequestInit; headers: Headers }> = [];
  const fetchImpl = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url: String(url), init, headers: new Headers(init.headers) });
    return {
      ok: response.ok,
      status: response.status,
      json: async () => response.body ?? {},
    };
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

describe("api-client media transport (ADR-065 Faz 2 / Dilim 1)", () => {
  it("does NOT set content-type for FormData bodies (upload)", async () => {
    const { calls, fetchImpl } = recordingFetch({
      ok: true,
      status: 201,
      body: { data: { id: "m1" } },
    });
    const client = createApiClient({ fetch: fetchImpl, baseUrl: "http://gw" });

    const form = new FormData();
    form.append("context", "PRODUCT");
    form.append("file", new File([new Uint8Array([1])], "x.png", { type: "image/png" }));
    await client.admin.media.upload("store-1", form, "tok");

    expect(calls[0].url).toBe("http://gw/stores/store-1/media");
    // Boundary'yi undici koyar; el ile content-type set edilmemeli.
    expect(calls[0].headers.get("content-type")).toBeNull();
    expect(calls[0].headers.get("authorization")).toBe("Bearer tok");
    expect(calls[0].init.body).toBeInstanceOf(FormData);
  });

  it("DOES set application/json for non-FormData bodies (regression guard)", async () => {
    const { calls, fetchImpl } = recordingFetch({ ok: true, status: 200, body: {} });
    const client = createApiClient({ fetch: fetchImpl, baseUrl: "http://gw" });

    await client.admin.categories.create("store-1", { name: "n", slug: "s" } as never, "tok");

    expect(calls[0].headers.get("content-type")).toBe("application/json");
  });

  it("list forwards the optional context filter as a query param", async () => {
    const { calls, fetchImpl } = recordingFetch({
      ok: true,
      status: 200,
      body: { data: [], pagination: { limit: 100, offset: 0, total: 0 } },
    });
    const client = createApiClient({ fetch: fetchImpl, baseUrl: "http://gw" });

    await client.admin.media.list("store-1", "CATEGORY", "tok");
    expect(calls[0].url).toBe("http://gw/stores/store-1/media?context=CATEGORY");

    await client.admin.media.list("store-1", undefined, "tok");
    expect(calls[1].url).toBe("http://gw/stores/store-1/media");
  });

  it("remove tolerates a 204 No Content response (no json parse)", async () => {
    const { fetchImpl } = recordingFetch({ ok: true, status: 204 });
    const client = createApiClient({ fetch: fetchImpl, baseUrl: "http://gw" });
    await expect(client.admin.media.remove("store-1", "m1", "tok")).resolves.toBeUndefined();
  });
});
