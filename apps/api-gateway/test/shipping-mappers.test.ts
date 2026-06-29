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
          { pieceNumber: 1, value: "Barcode1" },
          { pieceNumber: 2, value: "Barcode2" },
        ],
      },
      "SIPARIS34567",
    );
    expect(result.externalShipmentId).toBe("4536457657");
    expect(result.externalInvoiceId).toBe("564645774");
    expect(result.barcodes).toHaveLength(2);
    expect(result.barcodes[1]).toEqual({ pieceNumber: 2, value: "Barcode2" });
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
