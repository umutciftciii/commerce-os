/**
 * TODO-163 Faz 3 (TD-153) — Worker capability gate testleri (prisma-backed persistence + cache).
 * Kapsam: baseline açık · store override DISABLED · plan default · dependency pass · DB hatası fail-closed
 * (non-core kapalı / core açık) · cross-store leak yok. Fake prisma yüzeyi (StoreModule + Subscription).
 */
import { describe, expect, it } from "vitest";
import { createWorkerCapabilityGate, type WorkerCapabilityPrisma } from "../src/capabilities/worker-gate.js";

function fakePrisma(
  overrides: Array<{ storeId: string; moduleKey: string; state: string }>,
  planByStore: Record<string, unknown>,
  opts: { fail?: boolean } = {},
): WorkerCapabilityPrisma {
  return {
    storeModule: {
      findMany: async ({ where }: { where: { storeId: string } }) => {
        if (opts.fail) throw new Error("db down");
        return overrides
          .filter((o) => o.storeId === where.storeId)
          .map((o) => ({ moduleKey: o.moduleKey, state: o.state }));
      },
    },
    subscription: {
      findFirst: async ({ where }: { where: { storeId: string } }) => {
        if (opts.fail) throw new Error("db down");
        const meta = planByStore[where.storeId];
        return meta === undefined ? null : { plan: { metadata: meta } };
      },
    },
  } as unknown as WorkerCapabilityPrisma;
}

describe("worker capability gate (TD-153)", () => {
  it("baseline: non-core açık; core açık", async () => {
    const gate = createWorkerCapabilityGate(fakePrisma([], {}));
    expect(await gate.isEnabled("s1", "RECOMMENDATION_ANALYTICS")).toBe(true);
    expect(await gate.isEnabled("s1", "CATALOG")).toBe(true);
  });

  it("store override DISABLED → kapalı; başka store etkilenmez (cross-store leak yok)", async () => {
    const gate = createWorkerCapabilityGate(
      fakePrisma([{ storeId: "s1", moduleKey: "CAMPAIGNS", state: "DISABLED" }], {}),
    );
    expect(await gate.isEnabled("s1", "CAMPAIGNS")).toBe(false);
    expect(await gate.isEnabled("s2", "CAMPAIGNS")).toBe(true);
  });

  it("plan default kapatır (metadata.modules)", async () => {
    const gate = createWorkerCapabilityGate(fakePrisma([], { s1: { modules: { RECENTLY_VIEWED: false } } }));
    expect(await gate.isEnabled("s1", "RECENTLY_VIEWED")).toBe(false);
  });

  it("dependency: CAMPAIGNS kapalı → SPONSORED_PRODUCTS effective kapanır", async () => {
    const gate = createWorkerCapabilityGate(
      fakePrisma([{ storeId: "s1", moduleKey: "CAMPAIGNS", state: "DISABLED" }], {}),
    );
    expect(await gate.isEnabled("s1", "SPONSORED_PRODUCTS")).toBe(false);
  });

  it("DB hatası → fail-closed (non-core kapalı, core açık)", async () => {
    const gate = createWorkerCapabilityGate(fakePrisma([], {}, { fail: true }));
    expect(await gate.isEnabled("s1", "CAMPAIGNS")).toBe(false);
    expect(await gate.isEnabled("s1", "CATALOG")).toBe(true);
  });

  it("bilinmeyen anahtar → false (fail-closed)", async () => {
    const gate = createWorkerCapabilityGate(fakePrisma([], {}));
    expect(await gate.isEnabled("s1", "nope")).toBe(false);
  });
});
