import { describe, expect, it } from "vitest";
import { getShippingAdapter } from "../src/shipping/adapters/registry.js";
import type { ShippingHttpTransport } from "../src/shipping/adapters/http.js";
import { ShippingConfigError } from "../src/shipping/errors.js";
import {
  mapProviderStatusToShipmentStatus,
  parseProviderDate,
  shipmentTrackingEventKey,
} from "../src/shipping/routes.js";
import { dedupeConsecutiveShipmentEvents } from "../src/customers/index.js";
import { mapShipmentStatusResponse, mapTrackResponse } from "../src/shipping/adapters/dhl-ecommerce/mappers.js";
import type {
  ResolvedShippingCredential,
  ShippingActionContext,
  ShippingGuardFlags,
} from "../src/shipping/types.js";

/**
 * F3C.6 — DHL (MNG) sandbox dogrulama & sertlestirme testleri.
 *
 * Fixture'lar dogrudan saglanan OpenAPI dokumanlarindaki ornek yanitlardan alinmistir
 * (Identity/Standard Query/Standard Command/CBS). Kapsam:
 *  - dd-MM-yyyy / dd.MM.yyyy / yyyy-MM-dd tarih formatlarinin DOGRU parse edilmesi
 *    (JS Date.parse'in ABD MM-DD tuzagina dusulmemesi),
 *  - bilinmeyen statusCode (8 Destek_Gerekiyor dahil) durum ILERLETMEZ,
 *  - kumulatif trackshipment listesinin tekrar sync'te duplikasyon uretmemesi,
 *  - HTTP >=400 saglayici yanitinin basari gibi parse EDILMEMESI (normalize + redaksiyon).
 */

const TEST_ENDPOINTS = {
  testBaseUrl: "https://testapi.mngkargo.com.tr",
  liveBaseUrl: "https://api.mngkargo.com.tr",
  apiVersion: "1.0",
};

function ctx(
  options: {
    guards?: Partial<ShippingGuardFlags>;
    credentials?: Partial<Record<ResolvedShippingCredential["type"], ResolvedShippingCredential>>;
  } = {},
): ShippingActionContext {
  return {
    provider: "DHL_ECOMMERCE",
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

function identity(): ResolvedShippingCredential {
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

const TOKEN_OK = {
  status: 200,
  body: JSON.stringify({ jwt: "test-jwt", jwtExpireDate: "10.03.2020 16:05:00" }),
};

// OpenAPI ProblemDetails ornegi (Standard Query 404 "Shipment not found").
const PROBLEM_404 = {
  status: 404,
  body: JSON.stringify({ type: "about:blank", title: "Shipment not found", status: 404 }),
};

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

async function expectShippingError(promise: Promise<unknown>, code: string): Promise<ShippingConfigError> {
  let captured: unknown;
  try {
    await promise;
  } catch (e) {
    captured = e;
  }
  expect(captured).toBeInstanceOf(ShippingConfigError);
  expect((captured as ShippingConfigError).code).toBe(code);
  return captured as ShippingConfigError;
}

describe("parseProviderDate — OpenAPI tarih formatlari", () => {
  it("dd-MM-yyyy HH:mm:ss (eventDateTime) gunu AY sanmaz (ABD MM-DD tuzagi)", () => {
    const d = parseProviderDate("12-02-2019 20:30:45");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2019);
    expect(d!.getMonth()).toBe(1); // Subat (Aralik DEGIL)
    expect(d!.getDate()).toBe(12);
    expect(d!.getHours()).toBe(20);
  });

  it("gun>12 dd-MM-yyyy (deliveryDateTime, saniyesiz) kaybolmaz", () => {
    const d = parseProviderDate("13-02-2019 14:56");
    expect(d).not.toBeNull();
    expect(d!.getDate()).toBe(13);
    expect(d!.getMonth()).toBe(1);
    expect(d!.getMinutes()).toBe(56);
  });

  it("yyyy-MM-dd HH:mm:ss (eventDateTime2) ISO yolundan cozulur", () => {
    const d = parseProviderDate("2019-02-12 20:30:45");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2019);
    expect(d!.getMonth()).toBe(1);
    expect(d!.getDate()).toBe(12);
  });

  it("dd.MM.yyyy (jwtExpireDate) ve salt-tarih dd-MM-yyyy (estimatedDeliveryDate) cozulur", () => {
    const dotted = parseProviderDate("30.06.2026 00:27:37");
    expect(dotted!.getDate()).toBe(30);
    expect(dotted!.getMonth()).toBe(5);
    const dateOnly = parseProviderDate("21-02-2020");
    expect(dateOnly).not.toBeNull();
    expect(dateOnly!.getDate()).toBe(21);
    expect(dateOnly!.getMonth()).toBe(1);
    expect(dateOnly!.getFullYear()).toBe(2020);
  });

  it("cozulmeyen/bos deger null'a duser", () => {
    expect(parseProviderDate("bugun")).toBeNull();
    expect(parseProviderDate("")).toBeNull();
    expect(parseProviderDate(null)).toBeNull();
    expect(parseProviderDate(undefined)).toBeNull();
  });
});

describe("mapProviderStatusToShipmentStatus — bilinmeyen kodlar durum ilerletmez", () => {
  it("statusCode 8 (Destek_Gerekiyor, OpenAPI'de tanimli) mevcut durumu korur", () => {
    expect(mapProviderStatusToShipmentStatus({ statusCode: 8, isDelivered: false }, "IN_TRANSIT")).toBe("IN_TRANSIT");
    expect(mapProviderStatusToShipmentStatus({ statusCode: 8, isDelivered: false }, "ORDER_CREATED")).toBe(
      "ORDER_CREATED",
    );
  });

  it("tanimsiz kod (99) crash etmez, durumu korur; terminal durumdan donulmez", () => {
    expect(mapProviderStatusToShipmentStatus({ statusCode: 99, isDelivered: false }, "OUT_FOR_DELIVERY")).toBe(
      "OUT_FOR_DELIVERY",
    );
    expect(mapProviderStatusToShipmentStatus({ statusCode: 2, isDelivered: false }, "DELIVERED")).toBe("DELIVERED");
  });
});

describe("tracking event idempotency (F3C.6)", () => {
  it("ayni hareket ayni anahtari uretir (ham format farkina ragmen)", () => {
    const a = shipmentTrackingEventKey({
      statusText: "Gönderi Hazırlandı",
      location: "Atalar Şube",
      occurredAt: parseProviderDate("12-02-2019 20:30:45"),
    });
    const b = shipmentTrackingEventKey({
      statusText: "Gönderi Hazırlandı",
      location: "Atalar Şube",
      occurredAt: parseProviderDate("2019-02-12 20:30:45"),
    });
    expect(a).toBe(b);
  });

  it("farkli hareketler farkli anahtar uretir", () => {
    const base = { statusText: "Transfer Aşamasında", location: "Marmara Aktarma", occurredAt: new Date(2019, 1, 12) };
    expect(shipmentTrackingEventKey(base)).not.toBe(
      shipmentTrackingEventKey({ ...base, location: "Atalar Şube" }),
    );
    expect(shipmentTrackingEventKey(base)).not.toBe(shipmentTrackingEventKey({ ...base, occurredAt: null }));
  });

  it("musteri timeline'i ardisik ayni event'leri tekler, A→B→A gecisini korur", () => {
    const events = [
      { eventType: "STATUS_CHANGED", statusText: "Transfer_Aşamasında", location: null },
      { eventType: "STATUS_CHANGED", statusText: "Transfer_Aşamasında", location: null }, // tekrar sync
      { eventType: "TRACKING_UPDATED", statusText: "Gönderi Hazırlandı", location: "Atalar Şube" },
      { eventType: "STATUS_CHANGED", statusText: "Transfer_Aşamasında", location: null },
    ];
    const out = dedupeConsecutiveShipmentEvents(events);
    expect(out).toHaveLength(3);
    expect(out.map((e) => e.eventType)).toEqual(["STATUS_CHANGED", "TRACKING_UPDATED", "STATUS_CHANGED"]);
  });
});

describe("DHL query/operasyon HTTP hata normalizasyonu (F3C.6)", () => {
  const queryCtx = () =>
    ctx({ credentials: { IDENTITY: identity(), STANDARD_QUERY: product("STANDARD_QUERY") } });

  it("getshipmentstatus 404 ProblemDetails → PROVIDER_SHIPMENT_NOT_FOUND (junk sonuc yok)", async () => {
    const adapter = getShippingAdapter(
      "DHL_ECOMMERCE",
      sequencedTransport([TOKEN_OK, PROBLEM_404]),
      TEST_ENDPOINTS,
    );
    const error = await expectShippingError(
      adapter.getShipmentStatus({ context: queryCtx(), referenceId: "YOKBOYLEREF" }),
      "PROVIDER_SHIPMENT_NOT_FOUND",
    );
    expect(error.message).toContain("404");
    expect(error.message).not.toContain("csecret");
    expect(error.message).not.toContain("test-jwt");
  });

  it("trackshipment 500 → PROVIDER_QUERY_FAILED (bos event listesi uydurmaz)", async () => {
    const adapter = getShippingAdapter(
      "DHL_ECOMMERCE",
      sequencedTransport([TOKEN_OK, { status: 500, body: JSON.stringify({ message: "Server Error" }) }]),
      TEST_ENDPOINTS,
    );
    await expectShippingError(
      adapter.trackShipment({ context: queryCtx(), referenceId: "REF1" }),
      "PROVIDER_QUERY_FAILED",
    );
  });

  it("calculate 401 → PROVIDER_QUERY_FAILED (0 TL quote persist edilmez); mesaj redaksiyonlu", async () => {
    const adapter = getShippingAdapter(
      "DHL_ECOMMERCE",
      sequencedTransport([
        TOKEN_OK,
        { status: 401, body: JSON.stringify({ httpMessage: "Unauthorized", moreInformation: "no valid subscription" }) },
      ]),
      TEST_ENDPOINTS,
    );
    const error = await expectShippingError(
      adapter.calculateRate({
        context: queryCtx(),
        recipient: { cityCode: 34, districtCode: 56, address: "test" },
        pieces: [{ desi: 2, kg: 1 }],
      }),
      "PROVIDER_QUERY_FAILED",
    );
    expect(error.message).toContain("Unauthorized");
    expect(error.message).not.toContain("csecret");
  });

  it("createOrder 400 (or. eksik alan 26029) → PROVIDER_OPERATION_FAILED, null-id sahte basari yok", async () => {
    const adapter = getShippingAdapter(
      "DHL_ECOMMERCE",
      sequencedTransport([
        TOKEN_OK,
        { status: 400, body: JSON.stringify([{ code: 26029, message: "marketPlaceShortCode zorunlu" }]) },
      ]),
      TEST_ENDPOINTS,
    );
    const error = await expectShippingError(
      adapter.createOrder({
        context: ctx({
          guards: { allowOrderCreate: true },
          credentials: { IDENTITY: identity(), STANDARD_COMMAND: product("STANDARD_COMMAND") },
        }),
        referenceId: "REF1",
        recipient: { cityCode: 34, districtCode: 56, address: "adres", fullName: "Ad Soyad", phone: "5555555555", email: "smoke@example.com" },
        pieces: [{ desi: 1, kg: 1 }],
        explicitConfirm: true,
      }),
      "PROVIDER_OPERATION_FAILED",
    );
    expect(error.message).toContain("marketPlaceShortCode");
  });

  it("CBS getcities 401 → PROVIDER_QUERY_FAILED (bos sehir listesi uydurmaz)", async () => {
    const adapter = getShippingAdapter(
      "DHL_ECOMMERCE",
      sequencedTransport([{ status: 401, body: JSON.stringify({ httpMessage: "Unauthorized" }) }]),
      TEST_ENDPOINTS,
    );
    await expectShippingError(
      adapter.listGeoCities({ context: ctx({ credentials: { CBS_INFO: product("CBS_INFO") } }) }),
      "PROVIDER_QUERY_FAILED",
    );
  });

  it("basarili getshipmentstatus (OpenAPI ornegi) alan eslemesi bozulmadi", async () => {
    // Standard Query dokuman ornegi (getshipmentstatus 200).
    const docExample = {
      shipmentStatusCode: 5,
      orderId: "5464767",
      referenceId: "SIPARIS34567",
      shipmentId: "14556546",
      shipmentStatus: "Teslim_Edildi",
      trackingUrl: "www.mngkargo.com.tr/track/14556546",
      isDelivered: 1,
      deliveryDateTime: "13-02-2019 14:56",
      deliveryTo: "Sema Kudu",
    };
    const adapter = getShippingAdapter(
      "DHL_ECOMMERCE",
      sequencedTransport([TOKEN_OK, { status: 200, body: JSON.stringify(docExample) }]),
      TEST_ENDPOINTS,
    );
    const result = await adapter.getShipmentStatus({ context: queryCtx(), referenceId: "SIPARIS34567" });
    expect(result.statusCode).toBe(5);
    expect(result.isDelivered).toBe(true);
    expect(result.externalShipmentId).toBe("14556546");
    expect(result.trackingUrl).toBe("www.mngkargo.com.tr/track/14556546");
  });
});

describe("F3C.6 sandbox dogrulamasindan gelen duzeltmeler", () => {
  it("calculate cityCode/districtCode STRING gonderir (sandbox binder integer'i 400 ile reddeder)", async () => {
    let capturedBody: string | undefined;
    const transport: ShippingHttpTransport = {
      enabled: true,
      async send(request) {
        if (request.url.endsWith("/token")) return TOKEN_OK;
        capturedBody = request.body;
        return { status: 200, body: JSON.stringify({ finalTotal: 16, kdv: 2 }) };
      },
    };
    const adapter = getShippingAdapter("DHL_ECOMMERCE", transport, TEST_ENDPOINTS);
    const result = await adapter.calculateRate({
      context: ctx({ credentials: { IDENTITY: identity(), STANDARD_QUERY: product("STANDARD_QUERY") } }),
      recipient: { cityCode: 34, districtCode: 82, address: "Baglar Mah." },
      pieces: [{ desi: 2, kg: 1 }],
    });
    expect(result.amountMinor).toBe(1600);
    const parsed = JSON.parse(capturedBody ?? "{}") as Record<string, unknown>;
    expect(parsed.cityCode).toBe("34");
    expect(parsed.districtCode).toBe("82");
  });

  it("nested MNG hata zarfi (camelCase 4002 / PascalCase 20001) mesaji cikarilir", async () => {
    // Sandbox'ta birebir gozlemlenen iki zarf sekli.
    const nested4002 = {
      error: { code: "4002", message: "Bad Request", description: "The JSON value could not be converted to System.String. Path: $.districtCode" },
    };
    const nested20001 = {
      error: { Code: "20001", Message: "Error", Description: "<WERR>[] NOLU SUBENIN ILI BULUNAMADI.</WERR>" },
    };
    const adapterA = getShippingAdapter(
      "DHL_ECOMMERCE",
      sequencedTransport([TOKEN_OK, { status: 400, body: JSON.stringify(nested4002) }]),
      TEST_ENDPOINTS,
    );
    const errA = await expectShippingError(
      adapterA.calculateRate({
        context: ctx({ credentials: { IDENTITY: identity(), STANDARD_QUERY: product("STANDARD_QUERY") } }),
        recipient: { cityCode: 34, districtCode: 82 },
        pieces: [{ desi: 1, kg: 1 }],
      }),
      "PROVIDER_QUERY_FAILED",
    );
    expect(errA.message).toContain("System.String");
    const adapterB = getShippingAdapter(
      "DHL_ECOMMERCE",
      sequencedTransport([TOKEN_OK, { status: 500, body: JSON.stringify(nested20001) }]),
      TEST_ENDPOINTS,
    );
    const errB = await expectShippingError(
      adapterB.calculateRate({
        context: ctx({ credentials: { IDENTITY: identity(), STANDARD_QUERY: product("STANDARD_QUERY") } }),
        recipient: { cityCode: 34, districtCode: 82 },
        pieces: [{ desi: 1, kg: 1 }],
      }),
      "PROVIDER_QUERY_FAILED",
    );
    expect(errB.message).toContain("SUBENIN ILI BULUNAMADI");
    expect(errB.message).not.toContain("csecret");
  });
});

describe("mapper'lar — OpenAPI fixture uyumu", () => {
  it("trackshipment dokuman ornegi normalize edilir; occurredAt eventDateTime2 tercih eder", () => {
    const events = mapTrackResponse([
      {
        referenceId: "SIPARIS_28654",
        eventSequence: "1",
        eventStatus: "Gönderi Hazırlandı",
        eventStatusEn: "Shipment Created",
        eventDateTime: "12-02-2019 20:30:45",
        eventDateTime2: "2019-02-12 20:30:45",
        location: "Atalar Şube",
        country: "TR",
      },
    ]);
    expect(events).toHaveLength(1);
    expect(events[0].statusText).toBe("Gönderi Hazırlandı");
    expect(events[0].location).toBe("Atalar Şube");
    expect(events[0].occurredAt).toBe("2019-02-12 20:30:45");
    expect(parseProviderDate(events[0].occurredAt)!.getMonth()).toBe(1);
  });

  it("getshipment sarmali `{ shipment: {...} }` yaniti desteklenir (dokuman ornegi)", () => {
    const result = mapShipmentStatusResponse({
      shipment: { referenceId: "SIPARIS34567", shipmentId: "931001401082", shipmentStatusCode: 5, isDelivered: 0 },
    });
    expect(result.externalShipmentId).toBe("931001401082");
    expect(result.statusCode).toBe(5);
    expect(result.isDelivered).toBe(false);
  });
});
