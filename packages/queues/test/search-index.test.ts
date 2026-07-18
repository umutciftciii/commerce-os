import { describe, expect, it, vi } from "vitest";

// BullMQ/ioredis'i mock'la → gerçek Redis olmadan enqueue seçeneklerini yakala (jobId regresyonu).
const addSpy = vi.fn().mockResolvedValue(undefined);
vi.mock("bullmq", () => ({
  Queue: class {
    name: string;
    constructor(name: string) {
      this.name = name;
    }
    add = addSpy;
    close = async () => {};
  },
  Worker: class {},
}));
vi.mock("ioredis", () => ({
  Redis: class {
    quit = async () => {};
  },
}));

const { searchIndexJobId, enqueueSearchIndexJob } = await import("../src/index.js");
import { searchIndexJobSchema, type SearchIndexJob } from "@commerce-os/contracts";

/**
 * TODO-154 (ADR-079) — Faz 2C-8A · Search index job kontratı + jobId + enqueue regresyon testleri.
 */

describe("searchIndexJobSchema", () => {
  it("geçerli job tiplerini kabul eder", () => {
    expect(searchIndexJobSchema.parse({ kind: "reindex-product", storeId: "s", productId: "p" })).toBeTruthy();
    expect(searchIndexJobSchema.parse({ kind: "remove-product", storeId: "s", productId: "p" })).toBeTruthy();
    expect(searchIndexJobSchema.parse({ kind: "reindex-store", storeId: "s" })).toBeTruthy();
    expect(
      searchIndexJobSchema.parse({ kind: "reindex-products", storeId: "s", productIds: ["a", "b"] }),
    ).toBeTruthy();
  });

  it("geçersiz kind / boş id reddedilir", () => {
    expect(() => searchIndexJobSchema.parse({ kind: "nope", storeId: "s" })).toThrow();
    expect(() => searchIndexJobSchema.parse({ kind: "reindex-product", storeId: "", productId: "p" })).toThrow();
    expect(() => searchIndexJobSchema.parse({ kind: "reindex-products", storeId: "s", productIds: [] })).toThrow();
  });
});

describe("searchIndexJobId", () => {
  it("ürün job'ları deterministik jobId üretir (duplicate coalescing; colon-free)", () => {
    expect(searchIndexJobId({ kind: "reindex-product", storeId: "s1", productId: "p1" })).toBe(
      "reindex-product__s1__p1",
    );
    expect(searchIndexJobId({ kind: "remove-product", storeId: "s1", productId: "p1" })).toBe(
      "remove-product__s1__p1",
    );
    expect(searchIndexJobId({ kind: "reindex-store", storeId: "s1" })).toBe("reindex-store__s1");
  });

  it("jobId `:` içermez (BullMQ custom id kuralı)", () => {
    for (const job of [
      { kind: "reindex-product" as const, storeId: "s", productId: "p" },
      { kind: "remove-product" as const, storeId: "s", productId: "p" },
      { kind: "reindex-store" as const, storeId: "s" },
      { kind: "reindex-products" as const, storeId: "s", productIds: ["a"] },
    ]) {
      expect(searchIndexJobId(job)).not.toContain(":");
    }
  });

  it("aynı ürün için jobId stabil (util; enqueue KULLANMAZ)", () => {
    const a = searchIndexJobId({ kind: "reindex-product", storeId: "s", productId: "p" });
    const b = searchIndexJobId({ kind: "reindex-product", storeId: "s", productId: "p" });
    expect(a).toBe(b);
  });
});

describe("enqueueSearchIndexJob · jobId regresyonu (BullMQ completed-dedup bug'ı)", () => {
  it("SABİT jobId GEÇMEZ → art arda iki değişim İKİ ayrı job olur (dedup ile düşmez)", async () => {
    addSpy.mockClear();
    const job = { kind: "reindex-product" as const, storeId: "s", productId: "p" };
    await enqueueSearchIndexJob("redis://localhost:6379", job);
    await enqueueSearchIndexJob("redis://localhost:6379", job); // ikinci değişim
    expect(addSpy).toHaveBeenCalledTimes(2);
    for (const call of addSpy.mock.calls) {
      const opts = call[2] ?? {};
      // KRİTİK: jobId verilMEMELİ (aksi halde tamamlanmış-job retention ikinciyi dedup ederdi).
      expect(opts.jobId).toBeUndefined();
      // retry/backoff mevcut.
      expect(opts.attempts).toBe(5);
      expect(opts.backoff).toMatchObject({ type: "exponential" });
    }
  });

  it("payload zod ile doğrulanır (geçersiz job atılır)", async () => {
    addSpy.mockClear();
    await expect(
      enqueueSearchIndexJob("redis://localhost:6379", { kind: "nope" } as unknown as SearchIndexJob),
    ).rejects.toThrow();
    expect(addSpy).not.toHaveBeenCalled();
  });
});
