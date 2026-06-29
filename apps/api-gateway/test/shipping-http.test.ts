import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDisabledHttpTransport,
  createFetchHttpTransport,
} from "../src/shipping/adapters/http.js";
import { ShippingConfigError } from "../src/shipping/errors.js";

const req = { method: "GET" as const, url: "https://testapi.example/x", headers: {} };
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe("shipping HTTP transport", () => {
  it("disabled transport returns SHIPPING_HTTP_DISABLED without any network call", async () => {
    const t = createDisabledHttpTransport();
    expect(t.enabled).toBe(false);
    await expect(t.send(req)).rejects.toMatchObject({ code: "SHIPPING_HTTP_DISABLED" });
  });

  it("passes through provider status + body on success", async () => {
    globalThis.fetch = vi.fn(async () => ({ status: 200, text: async () => '{"ok":true}' })) as unknown as typeof fetch;
    const result = await createFetchHttpTransport(1000).send(req);
    expect(result).toEqual({ status: 200, body: '{"ok":true}' });
  });

  it("maps timeout abort to sanitized SHIPPING_HTTP_TIMEOUT (no url/secret leak)", async () => {
    // fetch yalniz abort sinyaliyle reddeder → bizim timeout'umuzu simule eder.
    globalThis.fetch = vi.fn(
      (_url: string, opts: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          opts.signal.addEventListener("abort", () => {
            const e = new Error("This operation was aborted");
            e.name = "AbortError";
            reject(e);
          });
        }),
    ) as unknown as typeof fetch;
    let captured: unknown;
    try {
      await createFetchHttpTransport(20).send(req);
    } catch (e) {
      captured = e;
    }
    expect(captured).toBeInstanceOf(ShippingConfigError);
    expect((captured as ShippingConfigError).code).toBe("SHIPPING_HTTP_TIMEOUT");
    // sanitize: hata mesaji yalnizca timeout suresini icerir; URL/secret/token icermez.
    const serialized = JSON.stringify({ code: (captured as ShippingConfigError).code, message: (captured as Error).message });
    expect(serialized).not.toContain("testapi.example");
  });

  it("rethrows non-abort fetch errors unchanged", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError("network down");
    }) as unknown as typeof fetch;
    await expect(createFetchHttpTransport(1000).send(req)).rejects.toBeInstanceOf(TypeError);
  });
});
