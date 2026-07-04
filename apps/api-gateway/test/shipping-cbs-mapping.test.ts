import { describe, expect, it } from "vitest";
import {
  createCbsLookupService,
  isValidGeoCode,
  normalizeGeoName,
  type CbsLookupTarget,
} from "../src/shipping/cbs-resolver.js";
import {
  BARCODE_ERROR_DESTINATION_BRANCH_NOT_FOUND,
  classifyBarcodeProviderError,
  mapCreateBarcodeResponse,
} from "../src/shipping/adapters/dhl-ecommerce/mappers.js";
import {
  buildCreateOrderRequest,
  buildCreateRecipientRequest,
} from "../src/shipping/adapters/dhl-ecommerce/client.js";
import { computeShipmentActionCapabilities, type ShippingEnvGuards } from "../src/shipping/serialize.js";
import { ShippingConfigError } from "../src/shipping/errors.js";
import type {
  ResolvedShippingCredential,
  ShippingActionContext,
  ShippingGeoCity,
  ShippingGeoDistrict,
  ShippingProviderAdapter,
} from "../src/shipping/types.js";
import type { Shipment, ShippingProviderConfig } from "@prisma/client";

/**
 * TODO-124 — CBS il/ilce kod cozumleme + barkod hata sinif­landirma testleri.
 *
 * OS-000053 vakasi: cityCode/districtCode gonderilmeyince MNG createbarcode 500
 * kod 20001 "VARIŞ ŞUBESİ BULUNAMADI" doner. Bu test seti:
 *  - TR casing/diakritik guvenli exact-match cozumleme (fuzzy YOK),
 *  - gecerli sakli kodun korunmasi / 0-gecersiz kodun degistirilmesi,
 *  - TTL cache (saglayici asiri cagrilmaz),
 *  - 20001 sinif­landirmasi ve payload'a kod girmesi,
 *  - repair capability projeksiyonunu dogrular.
 */

function ctx(): ShippingActionContext {
  return {
    provider: "DHL_ECOMMERCE",
    mode: "TEST",
    credentials: { byType: {} },
    guards: {
      allowRecipientCreate: false,
      allowOrderCreate: false,
      allowBarcodeCreate: false,
      allowLabelPurchase: false,
      allowCancel: false,
    },
  };
}

const CITIES: ShippingGeoCity[] = [
  { code: "34", name: "İstanbul" },
  { code: "06", name: "Ankara" },
];

const ISTANBUL_DISTRICTS: ShippingGeoDistrict[] = [
  { code: "1103", name: "Üsküdar", cityCode: "34" },
  { code: "1071", name: "Kadıköy", cityCode: "34" },
  { code: "1042", name: "Küçükçekmece", cityCode: "34" },
];

/** Yalniz geo metotlari olan sahte adapter; cagri sayaclari cache dogrulamasi icin. */
function fakeGeoAdapter(options?: {
  cities?: ShippingGeoCity[];
  districts?: ShippingGeoDistrict[];
  fail?: boolean;
}) {
  const calls = { cities: 0, districts: 0 };
  const adapter = {
    async listGeoCities() {
      calls.cities += 1;
      if (options?.fail) throw new ShippingConfigError("SHIPPING_HTTP_DISABLED", "kapali");
      return { cities: options?.cities ?? CITIES };
    },
    async listGeoDistricts() {
      calls.districts += 1;
      if (options?.fail) throw new ShippingConfigError("SHIPPING_HTTP_DISABLED", "kapali");
      return { districts: options?.districts ?? ISTANBUL_DISTRICTS };
    },
  } as unknown as ShippingProviderAdapter;
  return { adapter, calls };
}

function target(adapter: ShippingProviderAdapter, key = "cfg_1"): CbsLookupTarget {
  return { cacheKey: key, adapter, context: ctx() };
}

describe("normalizeGeoName — TR casing/diakritik guvenli", () => {
  it("İstanbul / ISTANBUL / istanbul ayni anahtara duser", () => {
    expect(normalizeGeoName("İstanbul")).toBe("istanbul");
    expect(normalizeGeoName("ISTANBUL")).toBe("istanbul");
    expect(normalizeGeoName("Istanbul")).toBe("istanbul");
    expect(normalizeGeoName("istanbul")).toBe("istanbul");
  });

  it("Üsküdar/uskudar ve Küçükçekmece/kucukcekmece eslesir", () => {
    expect(normalizeGeoName("Üsküdar")).toBe(normalizeGeoName("uskudar"));
    expect(normalizeGeoName("Küçükçekmece")).toBe(normalizeGeoName("KUCUKCEKMECE"));
  });

  it("bosluk kirpar ve ardisik boslugu tekler", () => {
    expect(normalizeGeoName("  kadıköy  ")).toBe("kadikoy");
    expect(normalizeGeoName(" İstanbul   Anadolu ")).toBe("istanbul anadolu");
  });

  it("isValidGeoCode: 0/negatif/ondalik GECERSIZ", () => {
    expect(isValidGeoCode(34)).toBe(true);
    expect(isValidGeoCode(0)).toBe(false);
    expect(isValidGeoCode(-1)).toBe(false);
    expect(isValidGeoCode(1.5)).toBe(false);
    expect(isValidGeoCode(undefined)).toBe(false);
  });
});

describe("resolveRecipientGeo — CBS exact-match cozumleme", () => {
  it("il+ilce metnini kodlara cozer (kanonik adlarla)", async () => {
    const { adapter } = fakeGeoAdapter();
    const svc = createCbsLookupService();
    const r = await svc.resolveRecipientGeo(target(adapter), {
      cityName: "İstanbul",
      districtName: "Üsküdar",
    });
    expect(r.status).toBe("MATCHED");
    expect(r.cityCode).toBe(34);
    expect(r.districtCode).toBe(1103);
    expect(r.cityName).toBe("İstanbul");
    expect(r.districtName).toBe("Üsküdar");
  });

  it("TR casing/diakritik varyantlarini cozer (ISTANBUL/uskudar, kucukcekmece)", async () => {
    const { adapter } = fakeGeoAdapter();
    const svc = createCbsLookupService();
    const r1 = await svc.resolveRecipientGeo(target(adapter), {
      cityName: "ISTANBUL",
      districtName: "uskudar",
    });
    expect(r1.status).toBe("MATCHED");
    expect(r1.districtCode).toBe(1103);
    const r2 = await svc.resolveRecipientGeo(target(adapter), {
      cityName: "Istanbul",
      districtName: "kucukcekmece",
    });
    expect(r2.status).toBe("MATCHED");
    expect(r2.districtCode).toBe(1042);
  });

  it("gecerli sakli kod cifti CBS'e SORULMADAN korunur (OS-000050 yolu)", async () => {
    const { adapter, calls } = fakeGeoAdapter();
    const svc = createCbsLookupService();
    const r = await svc.resolveRecipientGeo(target(adapter), {
      cityCode: 34,
      districtCode: 1103,
      cityName: "İstanbul",
      districtName: "Üsküdar",
    });
    expect(r.status).toBe("ALREADY_CODED");
    expect(r.cityCode).toBe(34);
    expect(r.districtCode).toBe(1103);
    expect(calls.cities).toBe(0);
    expect(calls.districts).toBe(0);
  });

  it("0/gecersiz sakli kod CBS cozumlemesiyle DEGISTIRILIR (0 asla korunmaz)", async () => {
    const { adapter } = fakeGeoAdapter();
    const svc = createCbsLookupService();
    const r = await svc.resolveRecipientGeo(target(adapter), {
      cityCode: 0,
      districtCode: 0,
      cityName: "İstanbul",
      districtName: "Kadıköy",
    });
    expect(r.status).toBe("MATCHED");
    expect(r.cityCode).toBe(34);
    expect(r.districtCode).toBe(1071);
  });

  it("ilce eslesmezse DISTRICT_NOT_MATCHED (guvenli basarisizlik; tahmin yok)", async () => {
    const { adapter } = fakeGeoAdapter();
    const svc = createCbsLookupService();
    const r = await svc.resolveRecipientGeo(target(adapter), {
      cityName: "İstanbul",
      districtName: "Olmayanİlçe",
    });
    expect(r.status).toBe("DISTRICT_NOT_MATCHED");
    expect(r.districtCode).toBeNull();
  });

  it("fuzzy/partial ESLEMEZ: 'Üsküdar Merkez' sessizce Üsküdar'a maplenmez", async () => {
    const { adapter } = fakeGeoAdapter();
    const svc = createCbsLookupService();
    const r = await svc.resolveRecipientGeo(target(adapter), {
      cityName: "İstanbul",
      districtName: "Üsküdar Merkez",
    });
    expect(r.status).toBe("DISTRICT_NOT_MATCHED");
  });

  it("ayni normalize ada FARKLI kodlu cift varsa muglak sayilir (sessiz yanlis esleme yok)", async () => {
    const { adapter } = fakeGeoAdapter({
      districts: [
        { code: "1103", name: "Üsküdar", cityCode: "34" },
        { code: "9999", name: "USKUDAR", cityCode: "34" },
      ],
    });
    const svc = createCbsLookupService();
    const r = await svc.resolveRecipientGeo(target(adapter), {
      cityName: "İstanbul",
      districtName: "Üsküdar",
    });
    expect(r.status).toBe("DISTRICT_NOT_MATCHED");
  });

  it("il/ilce metni yoksa INPUT_MISSING (eski isim-bazli davranis bloklanmaz)", async () => {
    const { adapter, calls } = fakeGeoAdapter();
    const svc = createCbsLookupService();
    const r = await svc.resolveRecipientGeo(target(adapter), { cityName: "İstanbul" });
    expect(r.status).toBe("INPUT_MISSING");
    expect(calls.cities).toBe(0);
  });

  it("CBS erisilemezse CBS_UNAVAILABLE + sanitize errorCode (BLOKLAMAZ)", async () => {
    const { adapter } = fakeGeoAdapter({ fail: true });
    const svc = createCbsLookupService();
    const r = await svc.resolveRecipientGeo(target(adapter), {
      cityName: "İstanbul",
      districtName: "Üsküdar",
    });
    expect(r.status).toBe("CBS_UNAVAILABLE");
    expect(r.errorCode).toBe("SHIPPING_HTTP_DISABLED");
  });

  it("TTL cache: tekrarlanan cozumleme saglayiciyi TEK sefer cagirir", async () => {
    const { adapter, calls } = fakeGeoAdapter();
    const svc = createCbsLookupService({ ttlMs: 60_000 });
    for (let i = 0; i < 3; i += 1) {
      await svc.resolveRecipientGeo(target(adapter), { cityName: "İstanbul", districtName: "Üsküdar" });
    }
    expect(calls.cities).toBe(1);
    expect(calls.districts).toBe(1);
  });

  it("TTL dolunca cache yenilenir", async () => {
    let nowMs = 0;
    const { adapter, calls } = fakeGeoAdapter();
    const svc = createCbsLookupService({ ttlMs: 1000, now: () => nowMs });
    await svc.resolveRecipientGeo(target(adapter), { cityName: "İstanbul", districtName: "Üsküdar" });
    nowMs = 2000;
    await svc.resolveRecipientGeo(target(adapter), { cityName: "İstanbul", districtName: "Üsküdar" });
    expect(calls.cities).toBe(2);
  });
});

describe("validateCodes — onarim kod dogrulamasi", () => {
  it("gecerli kod cifti kanonik CBS adlarini doner", async () => {
    const { adapter } = fakeGeoAdapter();
    const svc = createCbsLookupService();
    const r = await svc.validateCodes(target(adapter), 34, 1042);
    expect(r).toEqual({ cityName: "İstanbul", districtName: "Küçükçekmece" });
  });

  it("listede olmayan kod CBS_CODE_INVALID firlatir (kayit yapilmaz)", async () => {
    const { adapter } = fakeGeoAdapter();
    const svc = createCbsLookupService();
    await expect(svc.validateCodes(target(adapter), 34, 424242)).rejects.toMatchObject({
      code: "CBS_CODE_INVALID",
    });
    await expect(svc.validateCodes(target(adapter), 99, 1103)).rejects.toMatchObject({
      code: "CBS_CODE_INVALID",
    });
    await expect(svc.validateCodes(target(adapter), 0, 1103)).rejects.toMatchObject({
      code: "CBS_CODE_INVALID",
    });
  });
});

describe("TODO-124 — MNG 20001 barkod hata sinif­landirmasi", () => {
  // OS-000053'te gozlemlenen gercek zarf sekli (PascalCase error nesnesi).
  const MNG_20001_BODY = {
    error: {
      Code: 20001,
      Description: "VARIŞ ŞUBESİ BULUNAMADI , DAHA SONRA TEKRAR DENEYİN",
    },
  };

  it("mapCreateBarcodeResponse 500 kod 20001 → providerErrorCode '20001' + mesaj", () => {
    const r = mapCreateBarcodeResponse(MNG_20001_BODY, "OS-000053", 500);
    expect(r.providerErrorMessage).toContain("VARIŞ ŞUBESİ");
    expect(r.providerErrorCode).toBe("20001");
    expect(r.providerReturnedEmptyPayload).toBe(false);
    expect(r.externalShipmentId).toBeNull();
  });

  it("classify: kod 20001 → DESTINATION_BRANCH_NOT_FOUND", () => {
    expect(classifyBarcodeProviderError("20001", null)).toBe(BARCODE_ERROR_DESTINATION_BRANCH_NOT_FOUND);
  });

  it("classify: kod yoksa mesaj imzasi da yeterli (TR katlanmis)", () => {
    expect(classifyBarcodeProviderError(null, "VARIŞ ŞUBESİ BULUNAMADI")).toBe(
      BARCODE_ERROR_DESTINATION_BRANCH_NOT_FOUND,
    );
    expect(classifyBarcodeProviderError(null, "varis subesinin hat kodu bulunamadi")).toBe(
      BARCODE_ERROR_DESTINATION_BRANCH_NOT_FOUND,
    );
  });

  it("classify: iliskisiz hata sinif­lanMAZ (null → generic retryable korunur)", () => {
    expect(classifyBarcodeProviderError("26039", "Recipient.Email gecerli degil")).toBeNull();
    expect(classifyBarcodeProviderError(null, "Sağlayıcı hatası (HTTP 503)")).toBeNull();
    expect(classifyBarcodeProviderError(null, null)).toBeNull();
  });

  it("basarili barkod yanitinda providerErrorCode null", () => {
    const r = mapCreateBarcodeResponse(
      { shipmentId: "SHP-1", barcodes: [{ pieceNumber: 1, barcode: "B1", value: "" }] },
      "OS-000050",
      200,
    );
    expect(r.providerErrorCode).toBeNull();
    expect(r.providerErrorMessage).toBeNull();
  });
});

describe("TODO-124 — cozulmus kodlar saglayici payload'ina girer", () => {
  const product: ResolvedShippingCredential = {
    type: "STANDARD_COMMAND",
    key: "cid",
    secret: "csecret",
    customerNumber: null,
    customerPassword: null,
    identityType: null,
  };
  const recipient = {
    fullName: "Test Alıcı",
    email: "alici@example.com",
    phone: "05551112233",
    cityCode: 34,
    districtCode: 1103,
    cityName: "İstanbul",
    districtName: "Üsküdar",
    address: "Deneme Mah. No:1",
  };

  it("createRecipient govdesi cityCode/districtCode icerir", () => {
    const req = buildCreateRecipientRequest(
      { context: ctx(), referenceId: "os-000053", recipient, explicitConfirm: true },
      product,
      "jwt",
      "https://testapi.mngkargo.com.tr",
      "1.0",
    );
    const body = JSON.parse(req.body!) as { recipient: Record<string, unknown> };
    expect(body.recipient.cityCode).toBe(34);
    expect(body.recipient.districtCode).toBe(1103);
    expect(body.recipient.cityName).toBe("İstanbul");
    expect(body.recipient.districtName).toBe("Üsküdar");
  });

  it("createOrder govdesi cityCode/districtCode icerir; 0 kod ATLANIR", () => {
    const req = buildCreateOrderRequest(
      {
        context: ctx(),
        referenceId: "os-000053",
        recipient,
        pieces: [{ desi: 1, kg: 1 }],
        explicitConfirm: true,
      },
      product,
      "jwt",
      "https://testapi.mngkargo.com.tr",
      "1.0",
    );
    const body = JSON.parse(req.body!) as { recipient: Record<string, unknown> };
    expect(body.recipient.cityCode).toBe(34);
    expect(body.recipient.districtCode).toBe(1103);

    const reqZero = buildCreateOrderRequest(
      {
        context: ctx(),
        referenceId: "os-000041",
        recipient: { ...recipient, cityCode: 0, districtCode: 0 },
        pieces: [{ desi: 1, kg: 1 }],
        explicitConfirm: true,
      },
      product,
      "jwt",
      "https://testapi.mngkargo.com.tr",
      "1.0",
    );
    const bodyZero = JSON.parse(reqZero.body!) as { recipient: Record<string, unknown> };
    expect("cityCode" in bodyZero.recipient).toBe(false);
    expect("districtCode" in bodyZero.recipient).toBe(false);
  });
});

describe("TODO-124 — canRepairDestination capability projeksiyonu", () => {
  const ENV_ON: ShippingEnvGuards = { orderCreate: true, barcodeCreate: true, labelPurchase: true, cancel: true };

  function config(overrides: Partial<ShippingProviderConfig> = {}) {
    return {
      id: "spc_1",
      storeId: "store_1",
      provider: "DHL_ECOMMERCE",
      mode: "TEST",
      status: "ENABLED",
      displayName: "DHL eCommerce",
      allowRecipientCreate: true,
      allowOrderCreate: true,
      allowBarcodeCreate: true,
      allowLabelPurchase: false,
      ...overrides,
      credentials: [],
    } as unknown as ShippingProviderConfig & { credentials: [] };
  }

  function shipment(overrides: Partial<Shipment> = {}) {
    return {
      status: "ORDER_CREATED",
      externalShipmentId: null,
      provider: "DHL_ECOMMERCE",
      ...overrides,
    } as Pick<Shipment, "status" | "externalShipmentId" | "provider">;
  }

  it("DHL + ORDER_CREATED/LABEL_PENDING → onarim acik", () => {
    expect(computeShipmentActionCapabilities(config(), shipment(), ENV_ON).canRepairDestination).toBe(true);
    expect(
      computeShipmentActionCapabilities(config(), shipment({ status: "LABEL_PENDING" }), ENV_ON)
        .canRepairDestination,
    ).toBe(true);
  });

  it("barkod olusmus/tasima baslamis gonderide onarim KAPALI", () => {
    for (const status of ["LABEL_CREATED", "IN_TRANSIT", "DELIVERED", "CANCELLED"] as const) {
      expect(
        computeShipmentActionCapabilities(config(), shipment({ status }), ENV_ON).canRepairDestination,
      ).toBe(false);
    }
  });

  it("DHL olmayan saglayicida onarim KAPALI", () => {
    expect(
      computeShipmentActionCapabilities(
        config({ provider: "MOCK" }),
        shipment({ provider: "MOCK" }),
        ENV_ON,
      ).canRepairDestination,
    ).toBe(false);
  });

  it("provider config disabled ise onarim KAPALI", () => {
    expect(
      computeShipmentActionCapabilities(config({ status: "DISABLED" }), shipment(), ENV_ON)
        .canRepairDestination,
    ).toBe(false);
  });
});
