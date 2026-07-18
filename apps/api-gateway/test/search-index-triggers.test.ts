import Fastify from "fastify";
import { z } from "zod";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * TODO-154 (ADR-079) — Faz 2C-8A · Search index emitter + mutation trigger wiring testleri.
 *  - createSearchIndexEmitter FIRE-AND-FORGET: enqueue hatası mutation'ı ETKİLEMEZ (yalnız warn loglar).
 *  - Mutation başarılı olunca onProductChanged tetiklenir; HATA olunca TETİKLENMEZ (temsili: attribute-values).
 */

const enqueueMock = vi.fn();
vi.mock("@commerce-os/queues", () => ({
  enqueueSearchIndexJob: (...args: unknown[]) => enqueueMock(...args),
}));
// attribute-values/data.js → @commerce-os/db (prisma) import eder; testte boş stub yeter.
vi.mock("@commerce-os/db", () => ({ prisma: {} }));

const { createSearchIndexEmitter, createNoopSearchIndexEmitter } = await import(
  "../src/search-index/emitter.js"
);
const { registerAttributeValueRoutes } = await import("../src/attribute-values/routes.js");

const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

afterEach(() => {
  enqueueMock.mockReset();
  logger.warn.mockReset();
});

describe("createSearchIndexEmitter (fire-and-forget)", () => {
  it("reindexProduct doğru job'u kuyruğa koyar", () => {
    enqueueMock.mockResolvedValue(undefined);
    const emitter = createSearchIndexEmitter("redis://x", logger);
    emitter.reindexProduct("s1", "p1");
    expect(enqueueMock).toHaveBeenCalledWith("redis://x", {
      kind: "reindex-product",
      storeId: "s1",
      productId: "p1",
    });
  });

  it("reindexStore doğru job'u kuyruğa koyar", () => {
    enqueueMock.mockResolvedValue(undefined);
    createSearchIndexEmitter("redis://x", logger).reindexStore("s1");
    expect(enqueueMock).toHaveBeenCalledWith("redis://x", { kind: "reindex-store", storeId: "s1" });
  });

  it("enqueue reddedilse bile FIRLATMAZ, yalnız warn loglar", async () => {
    enqueueMock.mockRejectedValue(new Error("redis down"));
    const emitter = createSearchIndexEmitter("redis://x", logger);
    expect(() => emitter.reindexProduct("s1", "p1")).not.toThrow();
    await new Promise((r) => setTimeout(r, 0)); // fire-and-forget flush
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0][0]).toContain("search index enqueue failed");
  });

  it("noop emitter hiçbir şey enqueue etmez", () => {
    const noop = createNoopSearchIndexEmitter();
    noop.reindexProduct("s", "p");
    noop.reindexStore("s");
    expect(enqueueMock).not.toHaveBeenCalled();
  });
});

// ─── Mutation trigger wiring (temsili: attribute-values PUT) ───

function attachErrorHandler(app: ReturnType<typeof Fastify>) {
  app.setErrorHandler(async (error, _request, reply) => {
    if (error instanceof z.ZodError) {
      await reply.code(400).send({ error: { code: "VALIDATION_ERROR", message: "Validation failed." } });
      return;
    }
    throw error;
  });
}

function buildApp(serviceResult: { ok: boolean }, onProductChanged: (s: string, p: string) => void) {
  const app = Fastify();
  attachErrorHandler(app);
  const service = {
    setProductValues: async () =>
      serviceResult.ok
        ? { ok: true, values: [] }
        : { ok: false, error: { code: "ATTRIBUTE_VALUE_NOT_FOUND", message: "no" } },
    setVariantValues: async () => ({ ok: true, values: [] }),
  } as unknown as Parameters<typeof registerAttributeValueRoutes>[1]["service"];
  registerAttributeValueRoutes(app, {
    service,
    requireStoreAdmin: async () => ({ actorUserId: "u1" }),
    recordAudit: async () => {},
    onProductChanged,
  });
  return app;
}

describe("attribute-values PUT → onProductChanged wiring", () => {
  it("başarılı yazımda reindex tetiklenir", async () => {
    const calls: Array<[string, string]> = [];
    const app = buildApp({ ok: true }, (s, p) => calls.push([s, p]));
    const res = await app.inject({
      method: "PUT",
      url: "/stores/store_1/products/prod_1/attribute-values",
      payload: { values: [] },
    });
    expect(res.statusCode).toBe(200);
    expect(calls).toEqual([["store_1", "prod_1"]]);
    await app.close();
  });

  it("hata durumunda reindex TETİKLENMEZ", async () => {
    const calls: Array<[string, string]> = [];
    const app = buildApp({ ok: false }, (s, p) => calls.push([s, p]));
    const res = await app.inject({
      method: "PUT",
      url: "/stores/store_1/products/prod_1/attribute-values",
      payload: { values: [] },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(calls).toHaveLength(0);
    await app.close();
  });
});
