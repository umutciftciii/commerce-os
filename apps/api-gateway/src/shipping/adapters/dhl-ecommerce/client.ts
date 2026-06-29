import type { ShippingHttpRequest } from "../http.js";
import type {
  CalculateRateInput,
  CreateBarcodeInput,
  CreateOrderInput,
  CreateRecipientInput,
  ResolvedShippingCredential,
} from "../../types.js";

/**
 * F3C.1 — DHL eCommerce (teknik: MNG Kargo) REST istemcisi.
 *
 * SDK yoktur; OpenAPI dosyalarina gore fetch tabanli, SERVER-ONLY request builder'lar.
 * Her API urunu icin AYRI basePath + AYRI X-IBM-Client-Id/Secret cifti kullanilir.
 *
 * BASE URL: adapter mode'a gore host'u (TEST/LIVE) cozer ve buraya `host` olarak verir;
 * builder'lar OpenAPI path'lerini (/mngapi/api/...) host'a EKLER. Host'a path eklenmez.
 *
 * x-api-version: DHL test/live isteklerinde ZORUNLUDUR (IBM API Connect surum header'i).
 * Authorization (Bearer JWT) ve X-IBM-Client-Secret degerleri ASLA loglanmaz.
 */

export const DHL_BASE_PATHS = {
  identity: "/mngapi/api",
  plusCommand: "/mngapi/api/pluscmdapi",
  standardCommand: "/mngapi/api/standardcmdapi",
  standardQuery: "/mngapi/api/standardqueryapi",
  barcodeCommand: "/mngapi/api/barcodecmdapi",
  cbsInfo: "/mngapi/api/cbsinfoapi",
  bulkQuery: "/mngapi/api/bulkqueryapi",
  financeQuery: "/mngapi/api/financequeryapi",
} as const;

const JSON_CONTENT_TYPE = "application/json";

/** x-api-version header (varsa). Bos/null ise header eklenmez. */
function versionHeader(apiVersion: string | null): Record<string, string> {
  return apiVersion ? { "x-api-version": apiVersion } : {};
}

/** X-IBM product security header cifti + x-api-version. Secret degerleri yalnizca request header'ina girer. */
export function buildXibmHeaders(
  cred: ResolvedShippingCredential,
  apiVersion: string | null,
): Record<string, string> {
  return {
    "X-IBM-Client-Id": cred.key ?? "",
    "X-IBM-Client-Secret": cred.secret ?? "",
    ...versionHeader(apiVersion),
  };
}

/** Bearer JWT + X-IBM + x-api-version header'i olusturur. token degeri loglanmaz. */
function authedHeaders(
  product: ResolvedShippingCredential,
  token: string,
  apiVersion: string | null,
): Record<string, string> {
  return {
    ...buildXibmHeaders(product, apiVersion),
    Authorization: `Bearer ${token}`,
    "Content-Type": JSON_CONTENT_TYPE,
  };
}

/**
 * Identity token request'i. body: customerNumber/password/identityType (default 1).
 * NOT: Bu request'in body/header'i ASLA loglanmaz; yalnizca transport.send'e verilir.
 */
export function buildIdentityTokenRequest(
  identity: ResolvedShippingCredential,
  host: string,
  apiVersion: string | null,
): ShippingHttpRequest {
  return {
    method: "POST",
    url: `${host}${DHL_BASE_PATHS.identity}/token`,
    headers: {
      ...buildXibmHeaders(identity, apiVersion),
      "Content-Type": JSON_CONTENT_TYPE,
    },
    body: JSON.stringify({
      customerNumber: identity.customerNumber ?? "",
      password: identity.customerPassword ?? "",
      identityType: identity.identityType ?? 1,
    }),
  };
}

function piecesToOrderList(pieces: CreateOrderInput["pieces"], referenceId: string) {
  return pieces.map((p, i) => ({
    barcode: p.barcode ?? `${referenceId}_PARCA${i + 1}`,
    desi: p.desi,
    kg: p.kg,
    content: p.content ?? "",
  }));
}

/** Standard Query /calculate request. */
export function buildCalculateRequest(
  input: CalculateRateInput,
  product: ResolvedShippingCredential,
  token: string,
  host: string,
  apiVersion: string | null,
): ShippingHttpRequest {
  return {
    method: "POST",
    url: `${host}${DHL_BASE_PATHS.standardQuery}/calculate`,
    headers: authedHeaders(product, token, apiVersion),
    body: JSON.stringify({
      shipmentServiceType: input.shipmentServiceType ?? 1,
      packagingType: input.packagingType ?? 3,
      paymentType: input.paymentType ?? 1,
      pickUpType: input.pickUpType ?? 1,
      deliveryType: input.deliveryType ?? 1,
      cityCode: input.recipient.cityCode,
      districtCode: input.recipient.districtCode,
      address: input.recipient.address ?? "",
      smsPreference1: 0,
      smsPreference2: 0,
      smsPreference3: 0,
      orderPieceList: input.pieces.map((p, i) => ({
        barcode: p.barcode ?? `CALC_PARCA${i + 1}`,
        desi: p.desi,
        kg: p.kg,
        content: p.content ?? "",
      })),
    }),
  };
}

/**
 * Plus Command /createRecipient request (paketleme öncesi varış şube tespiti için
 * alıcı adresini DHL'e iletir). GUARD altında çağrılır.
 */
export function buildCreateRecipientRequest(
  input: CreateRecipientInput,
  product: ResolvedShippingCredential,
  token: string,
  host: string,
  apiVersion: string | null,
): ShippingHttpRequest {
  const referenceId = input.referenceId.toUpperCase();
  // F3C.3 sandbox dogrulama: govde `recipient` WRAPPER ister; flat alanlar 500 (Code 1001
  // "Unexpected error") doner. Dogru sekil: { referenceId, recipient: {...} }.
  return {
    method: "POST",
    url: `${host}${DHL_BASE_PATHS.plusCommand}/createRecipient`,
    headers: authedHeaders(product, token, apiVersion),
    body: JSON.stringify({
      referenceId,
      recipient: {
        cityCode: input.recipient.cityCode ?? 0,
        districtCode: input.recipient.districtCode ?? 0,
        cityName: input.recipient.cityName ?? "",
        districtName: input.recipient.districtName ?? "",
        address: input.recipient.address ?? "",
        email: input.recipient.email ?? "",
        fullName: input.recipient.fullName ?? "",
        mobilePhoneNumber: input.recipient.phone ?? "",
      },
    }),
  };
}

/** Standard Command /createOrder request. referenceId/barcode uppercase olmalidir. */
export function buildCreateOrderRequest(
  input: CreateOrderInput,
  product: ResolvedShippingCredential,
  token: string,
  host: string,
  apiVersion: string | null,
): ShippingHttpRequest {
  const referenceId = input.referenceId.toUpperCase();
  return {
    method: "POST",
    url: `${host}${DHL_BASE_PATHS.standardCommand}/createOrder`,
    headers: authedHeaders(product, token, apiVersion),
    body: JSON.stringify({
      order: {
        referenceId,
        barcode: referenceId,
        isCOD: 0,
        codAmount: 0,
        shipmentServiceType: input.shipmentServiceType ?? 1,
        packagingType: input.packagingType ?? 3,
        content: input.content ?? "",
        smsPreference1: 0,
        smsPreference2: 0,
        smsPreference3: 0,
        paymentType: input.paymentType ?? 1,
        deliveryType: input.deliveryType ?? 1,
        description: input.content ?? "",
        // F3C.3 sandbox dogrulama: marketPlaceShortCode ZORUNLU (yoksa 400 code 26029).
        // Marketplace gonderisi degil → bos string (gecerli enum: TRND/GG/N11/"").
        marketPlaceShortCode: "",
        marketPlaceSaleCode: "",
      },
      orderPieceList: piecesToOrderList(input.pieces, referenceId),
      recipient: {
        cityCode: input.recipient.cityCode ?? 0,
        districtCode: input.recipient.districtCode ?? 0,
        cityName: input.recipient.cityName ?? "",
        districtName: input.recipient.districtName ?? "",
        address: input.recipient.address ?? "",
        email: input.recipient.email ?? "",
        fullName: input.recipient.fullName ?? "",
        mobilePhoneNumber: input.recipient.phone ?? "",
      },
    }),
  };
}

/** Barcode Command /createbarcode request (siparisi faturalastirip gonderiye cevirir). */
export function buildCreateBarcodeRequest(
  input: CreateBarcodeInput,
  product: ResolvedShippingCredential,
  token: string,
  host: string,
  apiVersion: string | null,
): ShippingHttpRequest {
  const referenceId = input.referenceId.toUpperCase();
  return {
    method: "POST",
    url: `${host}${DHL_BASE_PATHS.barcodeCommand}/createbarcode`,
    headers: authedHeaders(product, token, apiVersion),
    body: JSON.stringify({
      referenceId,
      isCOD: 0,
      codAmount: 0,
      packagingType: input.packagingType ?? 3,
      printReferenceBarcodeOnError: 0,
      orderPieceList: piecesToOrderList(input.pieces, referenceId),
    }),
  };
}

/** Standard Query GET request (getorder/getshipment/getshipmentstatus/trackshipment). */
export function buildQueryGetRequest(
  pathSuffix: string,
  product: ResolvedShippingCredential,
  token: string,
  host: string,
  apiVersion: string | null,
): ShippingHttpRequest {
  return {
    method: "GET",
    url: `${host}${DHL_BASE_PATHS.standardQuery}${pathSuffix}`,
    headers: authedHeaders(product, token, apiVersion),
  };
}

/** CBS Info GET request (X-IBM + x-api-version). */
export function buildCbsGetRequest(
  pathSuffix: string,
  product: ResolvedShippingCredential,
  host: string,
  apiVersion: string | null,
): ShippingHttpRequest {
  return {
    method: "GET",
    url: `${host}${DHL_BASE_PATHS.cbsInfo}${pathSuffix}`,
    headers: {
      ...buildXibmHeaders(product, apiVersion),
      "Content-Type": JSON_CONTENT_TYPE,
    },
  };
}
