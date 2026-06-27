import { describe, expect, it } from "vitest";
import {
  resolvePaymentProviders,
  selectFallbackProviders,
  selectPaymentProvider,
  type PaymentResolutionCriteria,
  type ResolvableProviderConfig,
} from "../src/payments/resolver.js";

function config(overrides: Partial<ResolvableProviderConfig> = {}): ResolvableProviderConfig {
  return {
    id: "ppc_1",
    provider: "MOCK",
    status: "ENABLED",
    mode: "TEST",
    priority: 100,
    supportedMethods: ["CARD"],
    supportedCurrencies: ["TRY"],
    minAmount: null,
    maxAmount: null,
    fallbackEnabled: false,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

const baseCriteria: PaymentResolutionCriteria = {
  currency: "TRY",
  amount: 10000,
  method: "CARD",
  mode: "TEST",
  isLiveEnv: false,
};

describe("payment resolver", () => {
  it("selects the lowest-priority (highest precedence) enabled provider", () => {
    const a = config({ id: "a", priority: 50 });
    const b = config({ id: "b", priority: 10 });
    const c = config({ id: "c", priority: 30 });
    expect(selectPaymentProvider([a, b, c], baseCriteria)?.id).toBe("b");
  });

  it("breaks priority ties deterministically by createdAt then id", () => {
    const older = config({ id: "z", priority: 10, createdAt: new Date("2026-01-01T00:00:00.000Z") });
    const newer = config({ id: "a", priority: 10, createdAt: new Date("2026-02-01T00:00:00.000Z") });
    expect(selectPaymentProvider([newer, older], baseCriteria)?.id).toBe("z");

    const sameTimeA = config({ id: "a", priority: 10 });
    const sameTimeB = config({ id: "b", priority: 10 });
    expect(selectPaymentProvider([sameTimeB, sameTimeA], baseCriteria)?.id).toBe("a");
  });

  it("filters by currency, amount range and method", () => {
    expect(selectPaymentProvider([config({ supportedCurrencies: ["USD"] })], baseCriteria)).toBeNull();
    expect(selectPaymentProvider([config({ minAmount: 20000 })], baseCriteria)).toBeNull();
    expect(selectPaymentProvider([config({ maxAmount: 5000 })], baseCriteria)).toBeNull();
    expect(selectPaymentProvider([config({ supportedMethods: ["BANK_TRANSFER"] })], baseCriteria)).toBeNull();
    expect(selectPaymentProvider([config({ minAmount: 5000, maxAmount: 20000 })], baseCriteria)?.id).toBe("ppc_1");
  });

  it("excludes DISABLED providers", () => {
    expect(selectPaymentProvider([config({ status: "DISABLED" })], baseCriteria)).toBeNull();
  });

  it("excludes providers whose mode does not match", () => {
    expect(selectPaymentProvider([config({ mode: "LIVE" })], baseCriteria)).toBeNull();
  });

  it("blocks MOCK in a live environment (no auto MOCK fallback in LIVE)", () => {
    const mock = config({ id: "mock", provider: "MOCK", mode: "LIVE", priority: 1 });
    const real = config({ id: "real", provider: "IYZICO", mode: "LIVE", priority: 5, fallbackEnabled: true });
    const liveCriteria: PaymentResolutionCriteria = { ...baseCriteria, mode: "LIVE", isLiveEnv: true };
    const resolved = resolvePaymentProviders([mock, real], liveCriteria);
    expect(resolved.map((c) => c.id)).toEqual(["real"]);
    expect(selectFallbackProviders([mock, real], liveCriteria).map((c) => c.id)).toEqual([]);
  });

  it("allows MOCK fallback in TEST/dev environments", () => {
    const real = config({ id: "real", provider: "IYZICO", mode: "TEST", priority: 5, fallbackEnabled: true });
    const mock = config({ id: "mock", provider: "MOCK", mode: "TEST", priority: 10 });
    const resolved = resolvePaymentProviders([real, mock], baseCriteria);
    expect(resolved.map((c) => c.id)).toEqual(["real", "mock"]);
    expect(selectFallbackProviders([real, mock], baseCriteria).map((c) => c.id)).toEqual(["mock"]);
  });
});
