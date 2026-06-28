import type { ShippingHttpRequest } from "../http.js";
import type {
  CalculateRateInput,
  CreateBarcodeInput,
  CreateOrderInput,
  ResolvedShippingCredential,
} from "../../types.js";

/**
 * F3C.1 — DHL eCommerce (teknik: MNG Kargo, api.mngkargo.com.tr) REST istemcisi.
 *
 * SDK yoktur; OpenAPI dosyalarina gore fetch tabanli, SERVER-ONLY request builder'lar.
 * Her API urunu icin AYRI basePath + AYRI X-IBM-Client-Id/Secret cifti kullanilir.
 * Authorization (Bearer JWT) ve X-IBM-Client-Secret degerleri ASLA loglanmaz.
 */

export const DHL_HOST = "https://api.mngkargo.com.tr";

export const DHL_BASE_PATHS = {
  identity: "/mngapi/api",
  standardCommand: "/mngapi/api/standardcmdapi",
  standardQuery: "/mngapi/api/standardqueryapi",
  barcodeCommand: "/mngapi/api/barcodecmdapi",
  cbsInfo: "/mngapi/api/cbsinfoapi",
  bulkQuery: "/mngapi/api/bulkqueryapi",
  financeQuery: "/mngapi/api/financequeryapi",
} as const;

const JSON_CONTENT_TYPE = "application/json";

/** X-IBM product security header cifti. Secret degerleri yalnizca request header'ina girer. */
export function buildXibmHeaders(cred: ResolvedShippingCredential): Record<string, string> {
  return {
    "X-IBM-Client-Id": cred.key ?? "",
    "X-IBM-Client-Secret": cred.secret ?? "",
  };
}

/**
 * Identity token request'i. body: customerNumber/password/identityType (default 1).
 * NOT: Bu request'in body/header'i ASLA loglanmaz; yalnizca transport.send'e verilir.
 */
export function buildIdentityTokenRequest(identity: ResolvedShippingCredential): ShippingHttpRequest {
  return {
    method: "POST",
    url: `${DHL_HOST}${DHL_BASE_PATHS.identity}/token`,
    headers: {
      ...buildXibmHeaders(identity),
      "Content-Type": JSON_CONTENT_TYPE,
    },
    body: JSON.stringify({
      customerNumber: identity.customerNumber ?? "",
      password: identity.customerPassword ?? "",
      identityType: identity.identityType ?? 1,
    }),
  };
}

/** Bearer JWT + X-IBM header'i olusturur. token degeri loglanmaz. */
function authedHeaders(product: ResolvedShippingCredential, token: string): Record<string, string> {
  return {
    ...buildXibmHeaders(product),
    Authorization: `Bearer ${token}`,
    "Content-Type": JSON_CONTENT_TYPE,
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
): ShippingHttpRequest {
  return {
    method: "POST",
    url: `${DHL_HOST}${DHL_BASE_PATHS.standardQuery}/calculate`,
    headers: authedHeaders(product, token),
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

/** Standard Command /createOrder request. referenceId/barcode uppercase olmalidir. */
export function buildCreateOrderRequest(
  input: CreateOrderInput,
  product: ResolvedShippingCredential,
  token: string,
): ShippingHttpRequest {
  const referenceId = input.referenceId.toUpperCase();
  return {
    method: "POST",
    url: `${DHL_HOST}${DHL_BASE_PATHS.standardCommand}/createOrder`,
    headers: authedHeaders(product, token),
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
): ShippingHttpRequest {
  const referenceId = input.referenceId.toUpperCase();
  return {
    method: "POST",
    url: `${DHL_HOST}${DHL_BASE_PATHS.barcodeCommand}/createbarcode`,
    headers: authedHeaders(product, token),
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
): ShippingHttpRequest {
  return {
    method: "GET",
    url: `${DHL_HOST}${DHL_BASE_PATHS.standardQuery}${pathSuffix}`,
    headers: authedHeaders(product, token),
  };
}

/** CBS Info GET request (yalnizca X-IBM; Authorization gerektirmez). */
export function buildCbsGetRequest(
  pathSuffix: string,
  product: ResolvedShippingCredential,
): ShippingHttpRequest {
  return {
    method: "GET",
    url: `${DHL_HOST}${DHL_BASE_PATHS.cbsInfo}${pathSuffix}`,
    headers: {
      ...buildXibmHeaders(product),
      "Content-Type": JSON_CONTENT_TYPE,
    },
  };
}
