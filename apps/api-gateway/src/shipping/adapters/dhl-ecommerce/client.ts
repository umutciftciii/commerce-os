import type { ShippingHttpRequest } from "../http.js";
import { ShippingConfigError } from "../../errors.js";
import { isValidRecipientEmail } from "../../recipient.js";
import type {
  CalculateRateInput,
  CancelShipmentInput,
  CreateBarcodeInput,
  CreateOrderInput,
  CreateRecipientInput,
  ResolvedShippingCredential,
  ShipmentRecipientInput,
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

/**
 * TODO-132 — MNG cep telefonu normalizasyonu. OpenAPI örnekleri YEREL 10 haneli format
 * kullanır ("5555555555"); F3C.3'ün başarılı sandbox zinciri de yerel formatla doğrulandı.
 * +90/0090/90/0 önekleri sunucu tarafında soyulur; rakam dışı karakterler atılır.
 * Normalize edilemeyen değerler (yabancı numara vb.) rakam haliyle geçirilir (doküman
 * bir pattern DAYATMAZ; format kararını sağlayıcı verir).
 */
export function normalizeDhlMobilePhoneNumber(raw: string | undefined): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("90")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}

/**
 * TODO-132 — createRecipient/createOrder ortak recipient gövdesi.
 *
 * Sandbox kanıtı (400 kod 26039): MNG `email: ""` değerini geçersiz e-posta olarak
 * REDDEDER. Bu builder geçerli e-posta olmadan istek ÜRETMEZ: boş/eksik →
 * RECIPIENT_EMAIL_REQUIRED, biçimsiz → RECIPIENT_EMAIL_INVALID (sağlayıcıya çağrı
 * yapılmadan). Hata mesajları e-posta DEĞERİNİ içermez (PII yok).
 *
 * cityCode/districtCode: OpenAPI'de opsiyonel int32 (CBS Info'dan alınabilir);
 * bilinmiyorsa 0 GÖNDERİLMEZ, alan tamamen atlanır (cityName/districtName kalır).
 */
export function buildDhlRecipientBody(recipient: ShipmentRecipientInput): Record<string, unknown> {
  const email = (recipient.email ?? "").trim();
  if (email.length === 0) {
    throw new ShippingConfigError(
      "RECIPIENT_EMAIL_REQUIRED",
      "DHL gönderi kaydı için alıcı e-posta adresi gerekli; sağlayıcıya istek gönderilmedi.",
    );
  }
  if (!isValidRecipientEmail(email)) {
    throw new ShippingConfigError(
      "RECIPIENT_EMAIL_INVALID",
      "Alıcı e-posta adresi geçerli değil; sağlayıcıya istek gönderilmedi.",
    );
  }
  const cityCode = recipient.cityCode;
  const districtCode = recipient.districtCode;
  return {
    ...(typeof cityCode === "number" && cityCode > 0 ? { cityCode } : {}),
    ...(typeof districtCode === "number" && districtCode > 0 ? { districtCode } : {}),
    cityName: recipient.cityName ?? "",
    districtName: recipient.districtName ?? "",
    address: recipient.address ?? "",
    email,
    fullName: recipient.fullName ?? "",
    mobilePhoneNumber: normalizeDhlMobilePhoneNumber(recipient.phone),
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
      // F3C.6 sandbox dogrulama: OpenAPI integer dese de calculate binder'i STRING ister
      // (integer gonderilirse 400 code 4002 "could not be converted to System.String").
      cityCode: input.recipient.cityCode != null ? String(input.recipient.cityCode) : "",
      districtCode: input.recipient.districtCode != null ? String(input.recipient.districtCode) : "",
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
      recipient: buildDhlRecipientBody(input.recipient),
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
  // TODO-132 sandbox dogrulama: OpenAPI Order.content + Order.description REQUIRED;
  // MNG bos string'i 400 (aciklamasiz Bad Request) ile reddeder. Icerik verilmemisse
  // PII icermeyen benzersiz fallback olarak referenceId gonderilir.
  const content = (input.content ?? "").trim() || referenceId;
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
        content,
        smsPreference1: 0,
        smsPreference2: 0,
        smsPreference3: 0,
        paymentType: input.paymentType ?? 1,
        deliveryType: input.deliveryType ?? 1,
        description: content,
        // F3C.3 sandbox dogrulama: marketPlaceShortCode ZORUNLU (yoksa 400 code 26029).
        // Marketplace gonderisi degil → bos string (gecerli enum: TRND/GG/N11/"").
        marketPlaceShortCode: "",
        marketPlaceSaleCode: "",
      },
      orderPieceList: piecesToOrderList(input.pieces, referenceId),
      // TODO-132: createOrder recipient'i da ayni guvenli govdeyi kullanir (email
      // zorunlu/gecerli; 0 kod gonderilmez; telefon yerel formata normalize).
      recipient: buildDhlRecipientBody(input.recipient),
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

/**
 * Barcode Command /cancelshipment request (DHL gonderi/barkod kaydini iptal dener).
 * F3C.3 (ADR-045) netlestirmesi: dogru ucsuz PUT barcodecmdapi/cancelshipment; govde
 * { referenceId, shipmentId }. shipmentId ZORUNLU (route'ta CANCEL_REQUIRES_SHIPMENT_ID
 * ile onceden dogrulanir). Bearer JWT + X-IBM Barcode Command credential ile yetkilenir.
 */
export function buildCancelShipmentRequest(
  input: CancelShipmentInput,
  product: ResolvedShippingCredential,
  token: string,
  host: string,
  apiVersion: string | null,
): ShippingHttpRequest {
  return {
    method: "PUT",
    url: `${host}${DHL_BASE_PATHS.barcodeCommand}/cancelshipment`,
    headers: authedHeaders(product, token, apiVersion),
    body: JSON.stringify({
      referenceId: input.referenceId.toUpperCase(),
      shipmentId: input.shipmentId ?? "",
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
