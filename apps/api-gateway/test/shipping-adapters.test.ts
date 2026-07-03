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
      allowRecipientCreate: false,
      allowOrderCreate: false,
      allowBarcodeCreate: false,
      allowLabelPurchase: false,
      allowCancel: false,
      ...options.guards,
    },
  };
}

/** DHL adapter testleri icin gecerli TEST host + x-api-version (canli host'a fallback yok). */
const TEST_ENDPOINTS = {
  testBaseUrl: "https://testapi.mngkargo.com.tr",
  liveBaseUrl: "https://api.mngkargo.com.tr",
  apiVersion: "v-test",
};

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
  // transport disabled by default; gecerli TEST host verilir (read-only metotlar host cozer).
  const adapter = getShippingAdapter("DHL_ECOMMERCE", undefined, TEST_ENDPOINTS);

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
      TEST_ENDPOINTS,
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
      TEST_ENDPOINTS,
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
      TEST_ENDPOINTS,
    );
    const rate = await enabled.calculateRate({
      context: ctx("DHL_ECOMMERCE", { credentials: { IDENTITY: dhlIdentity(), STANDARD_QUERY: product("STANDARD_QUERY") } }),
      recipient: { cityCode: 34, districtCode: 56 },
      pieces: [{ desi: 2, kg: 1 }],
    });
    expect(rate.amountMinor).toBe(1600);
    expect(rate.currency).toBe("TRY");
  });

  it("TEST mode + missing test base URL → TEST_BASE_URL_MISSING (no live fallback)", async () => {
    // enabled transport ama TEST host yok: gercek cagri denenince TEST_BASE_URL_MISSING.
    const enabled = getShippingAdapter(
      "DHL_ECOMMERCE",
      sequencedTransport([{ status: 200, body: "{}" }]),
      { testBaseUrl: null, liveBaseUrl: "https://api.mngkargo.com.tr", apiVersion: "v1" },
    );
    await expectShippingError(
      enabled.calculateRate({
        context: ctx("DHL_ECOMMERCE", { credentials: { IDENTITY: dhlIdentity(), STANDARD_QUERY: product("STANDARD_QUERY") } }),
        recipient: { cityCode: 34, districtCode: 56 },
        pieces: [{ desi: 1, kg: 1 }],
      }),
      "TEST_BASE_URL_MISSING",
    );
  });

  it("TEST mode uses the test base URL + sends x-api-version (no live host)", async () => {
    const requests: Array<{ url: string; headers: Record<string, string> }> = [];
    const recordingTransport: ShippingHttpTransport = {
      enabled: true,
      async send(req) {
        requests.push({ url: req.url, headers: req.headers });
        // ilk cagri token, ikinci calculate
        return requests.length === 1
          ? { status: 200, body: JSON.stringify({ jwt: "jwt.value.x", jwtExpireDate: "10.03.2030 16:05:00" }) }
          : { status: 200, body: JSON.stringify({ finalTotal: 16 }) };
      },
    };
    const enabled = getShippingAdapter("DHL_ECOMMERCE", recordingTransport, {
      testBaseUrl: "https://testapi.mngkargo.com.tr",
      liveBaseUrl: "https://api.mngkargo.com.tr",
      apiVersion: "v-test",
    });
    await enabled.calculateRate({
      context: ctx("DHL_ECOMMERCE", { credentials: { IDENTITY: dhlIdentity(), STANDARD_QUERY: product("STANDARD_QUERY") } }),
      recipient: { cityCode: 34, districtCode: 56 },
      pieces: [{ desi: 1, kg: 1 }],
    });
    expect(requests.every((r) => r.url.startsWith("https://testapi.mngkargo.com.tr"))).toBe(true);
    expect(requests.every((r) => r.url.includes("/mngapi/api"))).toBe(true);
    expect(requests.every((r) => r.headers["x-api-version"] === "v-test")).toBe(true);
  });

  it("createRecipient blocked by default → RECIPIENT_CREATE_DISABLED", async () => {
    const enabled = getShippingAdapter(
      "DHL_ECOMMERCE",
      sequencedTransport([{ status: 200, body: "{}" }]),
      { testBaseUrl: "https://testapi.mngkargo.com.tr", liveBaseUrl: "https://api.mngkargo.com.tr", apiVersion: "v1" },
    );
    await expectShippingError(
      enabled.createRecipient({
        context: ctx("DHL_ECOMMERCE", { credentials: { IDENTITY: dhlIdentity(), PLUS_COMMAND: product("PLUS_COMMAND") } }),
        referenceId: "REF1",
        recipient: { cityCode: 34, districtCode: 1, address: "x" },
        explicitConfirm: true, // env/config guard kapali oldugundan yine bloklanir
      }),
      "RECIPIENT_CREATE_DISABLED",
    );
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

  it("testConnection with enabled transport returns OK + HTTP status (real /providers call)", async () => {
    const enabled = getShippingAdapter(
      "GELIVER",
      sequencedTransport([{ status: 200, body: JSON.stringify({ result: true, data: [] }) }]),
    );
    const result = await enabled.testConnection({
      context: ctx("GELIVER", { credentials: { DEFAULT: product("DEFAULT") } }),
    });
    expect(result.ok).toBe(true);
    expect(result.status).toBe("OK");
    expect(result.providerHttpStatus).toBe(200);
    // /geo/cities yolu 404 donuyordu; testConnection dogrulanmis /providers (200) kullanir.
    expect(result.testType).toBe("PROVIDERS");
  });
});

/**
 * F3C.3 — Sandbox smoke ile dogrulanan DHL request-shape sozlesmeleri.
 * Capturing transport tum istekleri kaydeder; identity token ardindan operasyon istegi gelir.
 */
function capturingTransport(responses: Array<{ status: number; body: string }>): {
  transport: ShippingHttpTransport;
  requests: Array<{ url: string; method: string; body: unknown }>;
} {
  const requests: Array<{ url: string; method: string; body: unknown }> = [];
  let i = 0;
  return {
    requests,
    transport: {
      enabled: true,
      async send(req) {
        requests.push({ url: req.url, method: req.method, body: req.body ? JSON.parse(req.body) : undefined });
        const r = responses[Math.min(i, responses.length - 1)];
        i += 1;
        return r;
      },
    },
  };
}

const TOKEN_RESPONSE = { status: 200, body: JSON.stringify({ jwt: "j.w.t", jwtExpireDate: "10.03.2030 16:05:00" }) };
const dhlGuards = { allowRecipientCreate: true, allowOrderCreate: true, allowBarcodeCreate: true };

describe("F3C.3 DHL operasyon request shape (sandbox smoke ile dogrulanmis)", () => {
  it("createRecipient gövdeyi `recipient` WRAPPER altında gönderir (flat değil)", async () => {
    const { transport, requests } = capturingTransport([TOKEN_RESPONSE, { status: 200, body: "" }]);
    const adapter = getShippingAdapter("DHL_ECOMMERCE", transport, TEST_ENDPOINTS);
    await adapter.createRecipient({
      context: ctx("DHL_ECOMMERCE", {
        guards: dhlGuards,
        credentials: { IDENTITY: dhlIdentity(), PLUS_COMMAND: product("PLUS_COMMAND") },
      }),
      referenceId: "cos-order-1",
      recipient: { fullName: "Smoke Tester", cityCode: 34, districtCode: 87, address: "x", email: "smoke@example.com" },
      explicitConfirm: true,
    });
    const recipientReq = requests.find((r) => r.url.includes("/createRecipient"));
    const body = recipientReq?.body as { referenceId: string; recipient?: Record<string, unknown> };
    expect(body.referenceId).toBe("COS-ORDER-1");
    expect(body.recipient).toBeDefined();
    expect(body.recipient).toMatchObject({ cityCode: 34, districtCode: 87, fullName: "Smoke Tester" });
    // flat alanlar TOP-LEVEL'da OLMAMALI (500 Code 1001 nedeni).
    expect((body as Record<string, unknown>).cityCode).toBeUndefined();
  });

  it("createOrder order objesine zorunlu marketPlaceShortCode='' ekler", async () => {
    const { transport, requests } = capturingTransport([
      TOKEN_RESPONSE,
      { status: 200, body: JSON.stringify([{ orderInvoiceId: "1", orderInvoiceDetailId: "2", shipperBranchCode: "034", referenceId: "COS-ORDER-1" }]) },
    ]);
    const adapter = getShippingAdapter("DHL_ECOMMERCE", transport, TEST_ENDPOINTS);
    const result = await adapter.createOrder({
      context: ctx("DHL_ECOMMERCE", {
        guards: dhlGuards,
        credentials: { IDENTITY: dhlIdentity(), STANDARD_COMMAND: product("STANDARD_COMMAND") },
      }),
      referenceId: "cos-order-1",
      recipient: { cityCode: 34, districtCode: 87, email: "smoke@example.com" },
      pieces: [{ desi: 1, kg: 1 }],
      explicitConfirm: true,
    });
    const orderReq = requests.find((r) => r.url.includes("/createOrder"));
    const order = (orderReq?.body as { order: Record<string, unknown> }).order;
    expect(order.marketPlaceShortCode).toBe("");
    // Array yanıt mapper'ı ilk elemandan id'leri çıkarır (asRecord(array) bug fix).
    expect(result.externalOrderId).toBe("1");
    expect(result.externalInvoiceId).toBe("2");
  });

  it("createBarcodeOrLabel sonucu ZPL/raw `value` TAŞIMAZ; yalnız kısa barcode + labelPresent", async () => {
    const { transport } = capturingTransport([
      TOKEN_RESPONSE,
      {
        status: 200,
        body: JSON.stringify({
          referenceId: "COS-ORDER-1",
          invoiceId: "FM1",
          shipmentId: "888",
          barcodes: [{ pieceNumber: 1, value: "^XA....LONG ZPL....^XZ", barcode: "BC123" }],
        }),
      },
    ]);
    const adapter = getShippingAdapter("DHL_ECOMMERCE", transport, TEST_ENDPOINTS);
    const result = await adapter.createBarcodeOrLabel({
      context: ctx("DHL_ECOMMERCE", {
        guards: dhlGuards,
        credentials: { IDENTITY: dhlIdentity(), BARCODE_COMMAND: product("BARCODE_COMMAND") },
      }),
      referenceId: "cos-order-1",
      pieces: [{ desi: 1, kg: 1 }],
      explicitConfirm: true,
    });
    expect(result.externalShipmentId).toBe("888");
    expect(result.barcodes[0]?.barcode).toBe("BC123");
    expect(result.barcodes[0]?.labelPresent).toBe(true);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("^XA");
    expect(serialized).not.toContain("ZPL");
  });

  it("createRecipient varsayılan guard'da RECIPIENT_CREATE_DISABLED döner", async () => {
    const adapter = getShippingAdapter("DHL_ECOMMERCE", undefined, TEST_ENDPOINTS);
    await expectShippingError(
      adapter.createRecipient({
        context: ctx("DHL_ECOMMERCE", { credentials: { IDENTITY: dhlIdentity(), PLUS_COMMAND: product("PLUS_COMMAND") } }),
        referenceId: "REF1",
        recipient: {},
        explicitConfirm: true,
      }),
      "RECIPIENT_CREATE_DISABLED",
    );
  });

  it("createBarcodeOrLabel boş 200 payload'ı providerReturnedEmptyPayload=true ile işaretler; tracking yok", async () => {
    const { transport } = capturingTransport([TOKEN_RESPONSE, { status: 200, body: JSON.stringify({}) }]);
    const adapter = getShippingAdapter("DHL_ECOMMERCE", transport, TEST_ENDPOINTS);
    const result = await adapter.createBarcodeOrLabel({
      context: ctx("DHL_ECOMMERCE", {
        guards: dhlGuards,
        credentials: { IDENTITY: dhlIdentity(), BARCODE_COMMAND: product("BARCODE_COMMAND") },
      }),
      referenceId: "cos-order-1",
      pieces: [{ desi: 1, kg: 1 }],
      explicitConfirm: true,
    });
    expect(result.providerReturnedEmptyPayload).toBe(true);
    expect(result.providerErrorMessage).toBeNull();
    expect(result.externalShipmentId).toBeNull();
    expect(result.barcodes).toHaveLength(0);
  });

  it("createBarcodeOrLabel hat kodu domain hatasını providerErrorMessage ile yüzeyler (retryable)", async () => {
    const { transport } = capturingTransport([
      TOKEN_RESPONSE,
      { status: 200, body: JSON.stringify({ message: "VARIŞ ŞUBESİNİN HAT KODU BULUNAMADI" }) },
    ]);
    const adapter = getShippingAdapter("DHL_ECOMMERCE", transport, TEST_ENDPOINTS);
    const result = await adapter.createBarcodeOrLabel({
      context: ctx("DHL_ECOMMERCE", {
        guards: dhlGuards,
        credentials: { IDENTITY: dhlIdentity(), BARCODE_COMMAND: product("BARCODE_COMMAND") },
      }),
      referenceId: "cos-order-1",
      pieces: [{ desi: 1, kg: 1 }],
      explicitConfirm: true,
    });
    expect(result.providerErrorMessage).toContain("HAT KODU");
    expect(result.providerReturnedEmptyPayload).toBe(false);
    expect(result.externalShipmentId).toBeNull();
  });

  it("cancelShipment PUT barcodecmdapi/cancelshipment'a referenceId+shipmentId gövdesiyle gider", async () => {
    const { transport, requests } = capturingTransport([TOKEN_RESPONSE, { status: 200, body: "" }]);
    const adapter = getShippingAdapter("DHL_ECOMMERCE", transport, TEST_ENDPOINTS);
    const result = await adapter.cancelShipment({
      context: ctx("DHL_ECOMMERCE", {
        guards: { ...dhlGuards, allowCancel: true },
        credentials: { IDENTITY: dhlIdentity(), BARCODE_COMMAND: product("BARCODE_COMMAND") },
      }),
      referenceId: "cos-order-1",
      shipmentId: "888",
      explicitConfirm: true,
    });
    expect(result.cancelled).toBe(true);
    const cancelReq = requests.find((r) => r.url.includes("/cancelshipment"));
    expect(cancelReq?.method).toBe("PUT");
    expect(cancelReq?.url).toBe("https://testapi.mngkargo.com.tr/mngapi/api/barcodecmdapi/cancelshipment");
    expect(cancelReq?.body).toEqual({ referenceId: "COS-ORDER-1", shipmentId: "888" });
  });

  it("cancelShipment guard kapalıyken CANCEL_DISABLED döner (sağlayıcıya gitmez)", async () => {
    const adapter = getShippingAdapter("DHL_ECOMMERCE", undefined, TEST_ENDPOINTS);
    await expectShippingError(
      adapter.cancelShipment({
        context: ctx("DHL_ECOMMERCE", { credentials: { IDENTITY: dhlIdentity() } }),
        referenceId: "REF1",
        shipmentId: "888",
        explicitConfirm: true,
      }),
      "CANCEL_DISABLED",
    );
  });

  it("cancelShipment shipmentId yoksa CANCEL_REQUIRES_SHIPMENT_ID döner (sağlayıcıya gitmez)", async () => {
    const adapter = getShippingAdapter("DHL_ECOMMERCE", undefined, TEST_ENDPOINTS);
    await expectShippingError(
      adapter.cancelShipment({
        context: ctx("DHL_ECOMMERCE", { guards: { allowCancel: true }, credentials: { IDENTITY: dhlIdentity() } }),
        referenceId: "REF1",
        explicitConfirm: true,
      }),
      "CANCEL_REQUIRES_SHIPMENT_ID",
    );
  });
});
