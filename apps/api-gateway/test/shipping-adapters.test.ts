import { describe, expect, it } from "vitest";
import { getShippingAdapter } from "../src/shipping/adapters/registry.js";
import type { ShippingHttpTransport } from "../src/shipping/adapters/http.js";
import { ShippingConfigError } from "../src/shipping/errors.js";
import type {
  ResolvedShippingCredential,
  ShippingActionContext,
  ShippingGuardFlags,
} from "../src/shipping/types.js";

function ctx(
  provider: ShippingActionContext["provider"],
  options: {
    guards?: Partial<ShippingGuardFlags>;
    credentials?: Partial<Record<ResolvedShippingCredential["type"], ResolvedShippingCredential>>;
  } = {},
): ShippingActionContext {
  return {
    provider,
    mode: "TEST",
    credentials: { byType: options.credentials ?? {} },
    guards: {
      allowOrderCreate: false,
      allowBarcodeCreate: false,
      allowLabelPurchase: false,
      ...options.guards,
    },
  };
}

function dhlIdentity(): ResolvedShippingCredential {
  return {
    type: "IDENTITY",
    key: "cid",
    secret: "csecret",
    customerNumber: "312947702",
    customerPassword: "ABCD1234",
    identityType: 1,
  };
}

function product(type: ResolvedShippingCredential["type"]): ResolvedShippingCredential {
  return { type, key: "cid", secret: "csecret", customerNumber: null, customerPassword: null, identityType: null };
}

/** Transport stub: enabled; sirayla onceden tanimli yanitlari dondurur (ag yok). */
function sequencedTransport(responses: Array<{ status: number; body: string }>): ShippingHttpTransport {
  let i = 0;
  return {
    enabled: true,
    async send() {
      const r = responses[Math.min(i, responses.length - 1)];
      i += 1;
      return r;
    },
  };
}

async function expectShippingError(promise: Promise<unknown>, code: string): Promise<void> {
  let captured: unknown;
  try {
    await promise;
  } catch (e) {
    captured = e;
  }
  expect(captured).toBeInstanceOf(ShippingConfigError);
  expect((captured as ShippingConfigError).code).toBe(code);
}

describe("MOCK shipping adapter (fully functional, no credentials)", () => {
  const adapter = getShippingAdapter("MOCK");

  it("reports a healthy test connection without credentials", async () => {
    const result = await adapter.testConnection({ context: ctx("MOCK") });
    expect(result.ok).toBe(true);
  });

  it("produces a deterministic rate quote and geo lists", async () => {
    const rate = await adapter.calculateRate({
      context: ctx("MOCK"),
      recipient: {},
      pieces: [{ desi: 2, kg: 1 }],
    });
    expect(rate.amountMinor).toBeGreaterThan(0);
    expect(rate.currency).toBe("TRY");
    const cities = await adapter.listGeoCities({ context: ctx("MOCK") });
    expect(cities.cities?.length).toBeGreaterThan(0);
  });
});

describe("DHL eCommerce adapter — destructive guards default to 409", () => {
  const adapter = getShippingAdapter("DHL_ECOMMERCE"); // transport disabled by default

  it("blocks createOrder with ORDER_CREATE_DISABLED unless guard + explicitConfirm", async () => {
    await expectShippingError(
      adapter.createOrder({
        context: ctx("DHL_ECOMMERCE", { credentials: { STANDARD_COMMAND: product("STANDARD_COMMAND"), IDENTITY: dhlIdentity() } }),
        referenceId: "REF1",
        recipient: {},
        pieces: [{ desi: 1, kg: 1 }],
        explicitConfirm: true, // env/config guard kapali oldugundan yine de bloklanir
      }),
      "ORDER_CREATE_DISABLED",
    );
  });

  it("blocks createBarcodeOrLabel with BARCODE_CREATE_DISABLED by default", async () => {
    await expectShippingError(
      adapter.createBarcodeOrLabel({
        context: ctx("DHL_ECOMMERCE", { credentials: { BARCODE_COMMAND: product("BARCODE_COMMAND"), IDENTITY: dhlIdentity() } }),
        referenceId: "REF1",
        pieces: [{ desi: 1, kg: 1 }],
        explicitConfirm: true,
      }),
      "BARCODE_CREATE_DISABLED",
    );
  });

  it("requires complete IDENTITY credentials → CONFIG_INCOMPLETE", async () => {
    await expectShippingError(
      adapter.testConnection({ context: ctx("DHL_ECOMMERCE", { credentials: {} }) }),
      "CONFIG_INCOMPLETE",
    );
  });

  it("testConnection with disabled transport does NOT return OK — HTTP_DISABLED, no live call", async () => {
    const result = await adapter.testConnection({
      context: ctx("DHL_ECOMMERCE", {
        credentials: {
          IDENTITY: dhlIdentity(),
          STANDARD_COMMAND: product("STANDARD_COMMAND"),
          STANDARD_QUERY: product("STANDARD_QUERY"),
          BARCODE_COMMAND: product("BARCODE_COMMAND"),
        },
      }),
    });
    // Credential eksiksiz ama GERCEK cagri yapilmadi: ok=false, HTTP_DISABLED.
    expect(result.ok).toBe(false);
    expect(result.status).toBe("HTTP_DISABLED");
    expect(result.providerHttpStatus).toBeNull();
    expect(result.message).toContain("gerçek API çağrısı yapılmadı");
  });

  it("testConnection with enabled transport returns OK + provider HTTP status (real Identity call)", async () => {
    const enabled = getShippingAdapter(
      "DHL_ECOMMERCE",
      sequencedTransport([
        { status: 200, body: JSON.stringify({ jwt: "jwt.value.x", jwtExpireDate: "10.03.2030 16:05:00" }) },
      ]),
    );
    const result = await enabled.testConnection({
      context: ctx("DHL_ECOMMERCE", {
        credentials: {
          IDENTITY: dhlIdentity(),
          STANDARD_COMMAND: product("STANDARD_COMMAND"),
          STANDARD_QUERY: product("STANDARD_QUERY"),
          BARCODE_COMMAND: product("BARCODE_COMMAND"),
        },
      }),
    });
    expect(result.ok).toBe(true);
    expect(result.status).toBe("OK");
    expect(result.providerHttpStatus).toBe(200);
    expect(result.testType).toBe("IDENTITY_TOKEN");
    // JWT plain deger sonuca SIZMAZ.
    expect(JSON.stringify(result)).not.toContain("jwt.value.x");
  });

  it("testConnection enabled but auth fails → FAILED (not OK), with provider HTTP status", async () => {
    const enabled = getShippingAdapter(
      "DHL_ECOMMERCE",
      sequencedTransport([{ status: 401, body: JSON.stringify({ message: "unauthorized" }) }]),
    );
    const result = await enabled.testConnection({
      context: ctx("DHL_ECOMMERCE", {
        credentials: {
          IDENTITY: dhlIdentity(),
          STANDARD_COMMAND: product("STANDARD_COMMAND"),
          STANDARD_QUERY: product("STANDARD_QUERY"),
          BARCODE_COMMAND: product("BARCODE_COMMAND"),
        },
      }),
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe("FAILED");
    expect(result.providerHttpStatus).toBe(401);
  });

  it("read-only metotlar transport kapaliyken SHIPPING_HTTP_DISABLED döner", async () => {
    await expectShippingError(
      adapter.getShipmentStatus({
        context: ctx("DHL_ECOMMERCE", { credentials: { IDENTITY: dhlIdentity(), STANDARD_QUERY: product("STANDARD_QUERY") } }),
        referenceId: "REF1",
      }),
      "SHIPPING_HTTP_DISABLED",
    );
  });

  it("calculateRate normalizes amount/currency when transport is enabled (token then calculate)", async () => {
    const enabled = getShippingAdapter(
      "DHL_ECOMMERCE",
      sequencedTransport([
        { status: 200, body: JSON.stringify({ jwt: "jwt.value.x", jwtExpireDate: "10.03.2030 16:05:00" }) },
        { status: 200, body: JSON.stringify({ finalTotal: 16, kdv: 2 }) },
      ]),
    );
    const rate = await enabled.calculateRate({
      context: ctx("DHL_ECOMMERCE", { credentials: { IDENTITY: dhlIdentity(), STANDARD_QUERY: product("STANDARD_QUERY") } }),
      recipient: { cityCode: 34, districtCode: 56 },
      pieces: [{ desi: 2, kg: 1 }],
    });
    expect(rate.amountMinor).toBe(1600);
    expect(rate.currency).toBe("TRY");
  });
});

describe("Geliver adapter — test-only, label purchase guarded", () => {
  const adapter = getShippingAdapter("GELIVER"); // transport disabled by default

  it("blocks label purchase with LABEL_PURCHASE_DISABLED by default", async () => {
    await expectShippingError(
      adapter.createBarcodeOrLabel({
        context: ctx("GELIVER", { credentials: { DEFAULT: product("DEFAULT") } }),
        referenceId: "REF1",
        pieces: [{ desi: 1, kg: 1 }],
        explicitConfirm: true,
      }),
      "LABEL_PURCHASE_DISABLED",
    );
  });

  it("createTest (createOrder) never performs a live create — disabled transport blocks the call", async () => {
    // Guard FIRLATMAZ (test gonderi destructive degil); canli cagri transport kapali oldugundan engellenir.
    await expectShippingError(
      adapter.createOrder({
        context: ctx("GELIVER", { credentials: { DEFAULT: product("DEFAULT") } }),
        referenceId: "REF1",
        recipient: {},
        pieces: [{ desi: 1, kg: 1 }],
      }),
      "SHIPPING_HTTP_DISABLED",
    );
  });

  it("requires an API token → CONFIG_INCOMPLETE", async () => {
    await expectShippingError(
      adapter.testConnection({ context: ctx("GELIVER", { credentials: {} }) }),
      "CONFIG_INCOMPLETE",
    );
  });

  it("testConnection with disabled transport does NOT return OK — HTTP_DISABLED", async () => {
    const result = await adapter.testConnection({
      context: ctx("GELIVER", { credentials: { DEFAULT: product("DEFAULT") } }),
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe("HTTP_DISABLED");
    expect(result.providerHttpStatus).toBeNull();
    expect(result.message).toContain("gerçek API çağrısı yapılmadı");
  });

  it("testConnection with enabled transport returns OK + HTTP status (real geo/cities call)", async () => {
    const enabled = getShippingAdapter(
      "GELIVER",
      sequencedTransport([{ status: 200, body: JSON.stringify([{ code: "34", name: "İstanbul" }]) }]),
    );
    const result = await enabled.testConnection({
      context: ctx("GELIVER", { credentials: { DEFAULT: product("DEFAULT") } }),
    });
    expect(result.ok).toBe(true);
    expect(result.status).toBe("OK");
    expect(result.providerHttpStatus).toBe(200);
    expect(result.testType).toBe("GEO_CITIES");
  });
});
