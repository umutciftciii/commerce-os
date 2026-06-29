import { describe, expect, it } from "vitest";
import {
  mapCalculateResponse,
  mapCitiesResponse,
  mapCreateBarcodeResponse,
  mapDistrictsResponse,
  mapShipmentStatusResponse,
  mapTokenResponse,
  mapTrackResponse,
} from "../src/shipping/adapters/dhl-ecommerce/mappers.js";
import { buildIdentityTokenRequest } from "../src/shipping/adapters/dhl-ecommerce/client.js";
import { computeShippingCapabilities, serializeShippingProviderConfig } from "../src/shipping/serialize.js";
import type { ResolvedShippingCredential } from "../src/shipping/types.js";

const SAMPLE_JWT =
  "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

describe("DHL token response sanitization", () => {
  it("never includes jwt/refreshToken in the normalized auth result", () => {
    const result = mapTokenResponse({
      jwt: SAMPLE_JWT,
      refreshToken: "f41c92bf-cc20-491b-9e4c-efc1b253e43a",
      jwtExpireDate: "10.03.2020 16:05:00",
    });
    expect(result.ok).toBe(true);
    expect(result.expiresAt).toBe("10.03.2020 16:05:00");
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(SAMPLE_JWT);
    expect(serialized).not.toContain("refreshToken");
    expect(serialized).not.toContain("f41c92bf");
  });
});

describe("DHL identity token request builder", () => {
  it("builds X-IBM headers + customerNumber/password body (and exposes nothing else)", () => {
    const identity: ResolvedShippingCredential = {
      type: "IDENTITY",
      key: "client-id-123",
      secret: "client-secret-456",
      customerNumber: "312947702",
      customerPassword: "ABCD1234",
      identityType: 1,
    };
    const request = buildIdentityTokenRequest(identity, "https://testapi.mngkargo.com.tr", "v-test");
    expect(request.method).toBe("POST");
    // TEST host'a OpenAPI path eklenir; canli host'a fallback yok.
    expect(request.url).toBe("https://testapi.mngkargo.com.tr/mngapi/api/token");
    expect(request.headers["X-IBM-Client-Id"]).toBe("client-id-123");
    expect(request.headers["X-IBM-Client-Secret"]).toBe("client-secret-456");
    // x-api-version DHL test/live isteklerinde zorunludur.
    expect(request.headers["x-api-version"]).toBe("v-test");
    const body = JSON.parse(request.body ?? "{}");
    expect(body).toEqual({ customerNumber: "312947702", password: "ABCD1234", identityType: 1 });
  });
});

describe("DHL response mappers normalize provider payloads", () => {
  it("maps /calculate finalTotal (TL) to amountMinor (kuruş) + currency", () => {
    const rate = mapCalculateResponse({ subTotal: 12, kdv: 2, finalTotal: 16 });
    expect(rate.amountMinor).toBe(1600);
    expect(rate.currency).toBe("TRY");
    expect(rate.breakdownSafe?.kdv).toBe(200);
  });

  it("maps shipment status (trackingUrl/isDelivered/statusCode)", () => {
    const status = mapShipmentStatusResponse({
      shipmentStatusCode: 5,
      shipmentStatus: "Teslim_Edildi",
      trackingUrl: "www.mngkargo.com.tr/track/14556546",
      isDelivered: 1,
      shipmentId: "14556546",
      referenceId: "SIPARIS34567",
    });
    expect(status.statusCode).toBe(5);
    expect(status.isDelivered).toBe(true);
    expect(status.trackingUrl).toBe("www.mngkargo.com.tr/track/14556546");
    expect(status.externalShipmentId).toBe("14556546");
  });

  it("maps barcode response (shipmentId/invoiceId/barcodes)", () => {
    const result = mapCreateBarcodeResponse(
      {
        referenceId: "SIPARIS34567",
        invoiceId: "564645774",
        shipmentId: "4536457657",
        barcodes: [
          { pieceNumber: 1, value: "^XA...ZPL...^XZ", barcode: "Barcode1" },
          { pieceNumber: 2, value: "^XA...ZPL...^XZ", barcode: "Barcode2" },
        ],
      },
      "SIPARIS34567",
    );
    expect(result.externalShipmentId).toBe("4536457657");
    expect(result.externalInvoiceId).toBe("564645774");
    expect(result.barcodes).toHaveLength(2);
    // F3C.3: raw ZPL `value` taşınmaz; kısa `barcode` + labelPresent korunur.
    expect(result.barcodes[1]).toEqual({ pieceNumber: 2, barcode: "Barcode2", labelPresent: true });
  });

  it("maps CBS cities and districts", () => {
    const cities = mapCitiesResponse([{ code: "01", name: "Adana" }]);
    expect(cities.cities?.[0]).toEqual({ code: "01", name: "Adana" });
    const districts = mapDistrictsResponse([{ cityCode: "01", cityName: "Adana", code: "85", name: "Çukurova" }]);
    expect(districts.districts?.[0]).toEqual({ code: "85", name: "Çukurova", cityCode: "01" });
  });

  it("maps tracking events to a normalized sequence", () => {
    const events = mapTrackResponse([
      { eventSequence: "1", eventStatus: "Gönderi Hazırlandı", location: "Atalar Şube", eventDateTime2: "2019-02-12 20:30:45" },
    ]);
    expect(events[0]).toMatchObject({ sequence: 1, statusText: "Gönderi Hazırlandı", location: "Atalar Şube" });
  });
});

describe("shipping provider config serializer (allowlist)", () => {
  const now = new Date("2026-06-28T12:00:00.000Z");
  const baseConfig = {
    id: "cfg_1",
    storeId: "store_1",
    provider: "DHL_ECOMMERCE" as const,
    mode: "TEST" as const,
    status: "DISABLED" as const,
    displayName: "DHL eCommerce",
    allowOrderCreate: false,
    allowBarcodeCreate: false,
    allowLabelPurchase: false,
    lastTestedAt: null,
    lastTestStatus: null,
    lastErrorCode: null,
    createdAt: now,
    updatedAt: now,
  };
  const NO_ENV = { orderCreate: false, barcodeCreate: false, labelPurchase: false };

  const identityCred = {
    id: "cred_1",
    providerConfigId: "cfg_1",
    type: "IDENTITY" as const,
    encryptedKey: "v1:gcm:aaa:bbb:ccc",
    encryptedSecret: "v1:gcm:ddd:eee:fff",
    encryptedCustomerNumber: "v1:gcm:ggg:hhh:iii",
    encryptedCustomerPassword: "v1:gcm:jjj:kkk:lll",
    identityType: 1,
    maskedKey: "••••6789",
    configured: true,
    lastTestedAt: null,
    lastTestStatus: null,
    lastErrorCode: null,
    createdAt: now,
    updatedAt: now,
  };

  it("returns maskedKey + configured but never raw/encrypted secret values", () => {
    const serialized = serializeShippingProviderConfig({ ...baseConfig, credentials: [identityCred] }, NO_ENV);
    const cred = serialized.credentials[0];
    expect(cred.configured).toBe(true);
    expect(cred.maskedKey).toBe("••••6789");
    expect(cred.secretSet).toBe(true);
    expect(cred.customerPasswordSet).toBe(true);
    // KRITIK: hicbir cipher/secret degeri serialize edilmez.
    const blob = JSON.stringify(serialized);
    expect(blob).not.toContain("v1:gcm:");
    expect(blob).not.toContain("encryptedSecret");
    expect(blob).not.toContain("encryptedCustomerPassword");
  });
});

describe("shipping capability derivation", () => {
  const now = new Date("2026-06-28T12:00:00.000Z");
  const base = {
    id: "c",
    storeId: "s",
    mode: "TEST" as const,
    displayName: "x",
    allowOrderCreate: false,
    allowBarcodeCreate: false,
    allowLabelPurchase: false,
    lastTestedAt: null,
    lastTestStatus: null,
    lastErrorCode: null,
    createdAt: now,
    updatedAt: now,
  };
  const cred = (type: string, configured: boolean) => ({
    id: `cr_${type}`,
    providerConfigId: "c",
    type: type as "DEFAULT",
    encryptedKey: configured ? "v1:gcm:x" : null,
    encryptedSecret: null,
    encryptedCustomerNumber: null,
    encryptedCustomerPassword: null,
    identityType: null,
    maskedKey: configured ? "••••1" : null,
    configured,
    lastTestedAt: null,
    lastTestStatus: null,
    lastErrorCode: null,
    createdAt: now,
    updatedAt: now,
  });
  const NO_ENV = { orderCreate: false, barcodeCreate: false, labelPurchase: false };
  const ALL_ENV = { orderCreate: true, barcodeCreate: true, labelPurchase: true };

  it("MOCK enabled supports rate + create; disabled supports nothing operational", () => {
    const en = computeShippingCapabilities({ ...base, provider: "MOCK", status: "ENABLED", credentials: [] }, NO_ENV);
    expect(en.canCalculateRate).toBe(true);
    expect(en.canCreateTestShipment).toBe(true);
    const dis = computeShippingCapabilities({ ...base, provider: "MOCK", status: "DISABLED", credentials: [] }, NO_ENV);
    expect(dis.canCalculateRate).toBe(false);
  });

  it("GELIVER never supports calculateRate; test shipment needs DEFAULT cred + enabled", () => {
    const noCred = computeShippingCapabilities({ ...base, provider: "GELIVER", status: "ENABLED", credentials: [] }, NO_ENV);
    expect(noCred.canCalculateRate).toBe(false);
    expect(noCred.canCreateTestShipment).toBe(false);
    const withCred = computeShippingCapabilities({ ...base, provider: "GELIVER", status: "ENABLED", credentials: [cred("DEFAULT", true)] }, NO_ENV);
    expect(withCred.canCreateTestShipment).toBe(true);
    expect(withCred.canPurchaseLabel).toBe(false); // env+config kapali
    expect(withCred.destructiveActionsDisabledReason).toBe("LABEL_PURCHASE_DISABLED");
  });

  it("DHL calculateRate needs STANDARD_QUERY cred + enabled; destructive needs allow+env", () => {
    const noQuery = computeShippingCapabilities({ ...base, provider: "DHL_ECOMMERCE", status: "ENABLED", credentials: [] }, NO_ENV);
    expect(noQuery.canCalculateRate).toBe(false);
    const withQuery = computeShippingCapabilities({ ...base, provider: "DHL_ECOMMERCE", status: "ENABLED", credentials: [cred("STANDARD_QUERY", true)] }, NO_ENV);
    expect(withQuery.canCalculateRate).toBe(true);
    expect(withQuery.canCreateOrder).toBe(false);
    const live = computeShippingCapabilities(
      { ...base, provider: "DHL_ECOMMERCE", status: "ENABLED", allowOrderCreate: true, allowBarcodeCreate: true, credentials: [cred("STANDARD_QUERY", true)] },
      ALL_ENV,
    );
    expect(live.canCreateOrder).toBe(true);
    expect(live.canCreateBarcode).toBe(true);
  });
});

import { mapCreateOrderResponse } from "../src/shipping/adapters/dhl-ecommerce/mappers.js";
import { mapProviderStatusToShipmentStatus, serializeShipment } from "../src/shipping/routes.js";

describe("F3C.3 mapper fixes (sandbox smoke ile doğrulanmış)", () => {
  it("mapCreateOrderResponse ARRAY yanıtını ilk elemandan çözer (asRecord(array) bug fix)", () => {
    const result = mapCreateOrderResponse(
      [{ orderInvoiceId: "1719897", orderInvoiceDetailId: "1720383", shipperBranchCode: "03401700", referenceId: "COS-X" }],
      "COS-FALLBACK",
    );
    expect(result.referenceId).toBe("COS-X");
    expect(result.externalOrderId).toBe("1719897");
    expect(result.externalInvoiceId).toBe("1720383");
    expect(result.shipperBranchCode).toBe("03401700");
  });

  it("mapShipmentStatusResponse isDelivered BOOLEAN değerini kabul eder", () => {
    expect(mapShipmentStatusResponse({ shipmentStatus: "Teslim", isDelivered: true }).isDelivered).toBe(true);
    expect(mapShipmentStatusResponse({ shipmentStatus: "Yolda", isDelivered: false }).isDelivered).toBe(false);
    // Geriye dönük: number 1 de çalışır.
    expect(mapShipmentStatusResponse({ isDelivered: 1 }).isDelivered).toBe(true);
  });

  it("mapCreateBarcodeResponse raw ZPL (`value`) taşımaz; labelPresent + kısa barcode", () => {
    const result = mapCreateBarcodeResponse(
      { referenceId: "COS-X", invoiceId: "FM1", shipmentId: "888", barcodes: [{ pieceNumber: 1, value: "^XA ZPL ^XZ", barcode: "BC1" }] },
      "COS-X",
    );
    expect(result.externalShipmentId).toBe("888");
    expect(result.barcodes[0]).toMatchObject({ pieceNumber: 1, barcode: "BC1", labelPresent: true });
    expect(JSON.stringify(result)).not.toContain("^XA");
  });

  it("mapTrackResponse tek-obje yanıtı da listeye sarar", () => {
    const single = mapTrackResponse({ eventSequence: "1", eventStatus: "Gönderi Hazırlandı", location: "İstanbul" });
    expect(single).toHaveLength(1);
    expect(single[0]?.statusText).toBe("Gönderi Hazırlandı");
  });
});

describe("F3C.3 shipment serialization + status mapping", () => {
  const baseShipment = {
    id: "s1",
    storeId: "store1",
    orderId: "o1",
    providerConfigId: "pc1",
    provider: "DHL_ECOMMERCE" as const,
    referenceId: "COS-1",
    status: "LABEL_CREATED" as const,
    externalOrderId: "1",
    externalShipmentId: "888",
    externalInvoiceId: "FM1",
    shipmentStatusCode: null,
    trackingNumber: "888",
    trackingUrl: "https://track/888",
    labelUrl: null,
    barcodeJsonSafe: { zplPresent: true },
    pieceCount: 1,
    totalKg: 1,
    totalDesi: 1,
    packagingType: 3,
    shipmentServiceType: 1,
    paymentType: 1,
    deliveryType: 1,
    recipientName: "Smoke Tester",
    recipientEmail: null,
    recipientPhone: null,
    recipientCityCode: 34,
    recipientDistrictCode: 87,
    recipientCityName: "İstanbul",
    recipientDistrictName: "Üsküdar",
    recipientAddress: "x",
    createdAt: new Date("2026-06-30T00:00:00Z"),
    updatedAt: new Date("2026-06-30T01:00:00Z"),
  };

  it("serializeShipment barcodeHasLabel + lastProviderStatus'ü event'ten türetir; ZPL içermez", () => {
    const dto = serializeShipment({
      ...baseShipment,
      events: [
        { id: "e1", storeId: "store1", shipmentId: "s1", provider: "DHL_ECOMMERCE", eventType: "ORDER_CREATED", statusCode: null, statusText: "Kargo talebi oluşturuldu", location: null, occurredAt: null, trackingUrl: null, rawSafeJson: null, createdAt: new Date("2026-06-30T00:00:00Z") },
        { id: "e2", storeId: "store1", shipmentId: "s1", provider: "DHL_ECOMMERCE", eventType: "STATUS_CHANGED", statusCode: 3, statusText: "Yolda", location: "İstanbul", occurredAt: null, trackingUrl: null, rawSafeJson: null, createdAt: new Date("2026-06-30T02:00:00Z") },
      ],
    });
    expect(dto.barcodeHasLabel).toBe(true);
    expect(dto.lastProviderStatus).toBe("Yolda");
    expect(dto.lastSyncedAt).toBe("2026-06-30T02:00:00.000Z");
    expect(dto.events).toHaveLength(2);
    expect(JSON.stringify(dto)).not.toContain("^XA");
  });

  it("mapProviderStatusToShipmentStatus isDelivered → DELIVERED; geri gitmez", () => {
    expect(mapProviderStatusToShipmentStatus({ statusCode: 9, isDelivered: true }, "LABEL_CREATED")).toBe("DELIVERED");
    expect(mapProviderStatusToShipmentStatus({ statusCode: 3, isDelivered: false }, "LABEL_CREATED")).toBe("IN_TRANSIT");
    expect(mapProviderStatusToShipmentStatus({ statusCode: null, isDelivered: false }, "ORDER_CREATED")).toBe("ORDER_CREATED");
    expect(mapProviderStatusToShipmentStatus({ statusCode: 1, isDelivered: false }, "DELIVERED")).toBe("DELIVERED");
  });
});
