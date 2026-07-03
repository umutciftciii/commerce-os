import { describe, expect, it } from "vitest";
import { getShippingAdapter } from "../src/shipping/adapters/registry.js";
import type { ShippingHttpTransport } from "../src/shipping/adapters/http.js";
import {
  buildDhlRecipientBody,
  buildCreateRecipientRequest,
  normalizeDhlMobilePhoneNumber,
} from "../src/shipping/adapters/dhl-ecommerce/client.js";
import { extractProviderErrorCode } from "../src/shipping/adapters/dhl-ecommerce/mappers.js";
import { ShippingConfigError } from "../src/shipping/errors.js";
import { isValidRecipientEmail, resolveRecipientEmail } from "../src/shipping/recipient.js";
import type {
  ResolvedShippingCredential,
  ShippingActionContext,
  ShippingGuardFlags,
} from "../src/shipping/types.js";

/**
 * TODO-132 — MNG/DHL createRecipient alıcı e-posta çözümleme + payload doğrulama.
 *
 * Sandbox kanıtı: MNG `email: ""` değerini 400 kod 26039 ("'Recipient. Email' geçerli
 * bir e-posta adresi değil") ile reddeder. Bu suite şunları sabitler:
 *  - e-posta önceliği: sipariş seviyesi → Customer.email fallback → lokal red;
 *  - sağlayıcıya ASLA boş/null/geçersiz e-posta gitmez (istek hiç üretilmez);
 *  - cityCode/districtCode 0 GÖNDERİLMEZ (bilinmiyorsa alan atlanır; OpenAPI opsiyonel der);
 *  - telefon MNG doküman örneğindeki yerel 10 haneye normalize edilir (+90 soyulur);
 *  - MNG 26039 yanıtı aksiyon alınabilir RECIPIENT_EMAIL_INVALID koduna normalize edilir;
 *  - normalize hata çıktısında PII (e-posta değeri) bulunmaz.
 * Fixture'lar redakte örnek değerlerdir (gerçek PII değildir).
 */

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
      allowRecipientCreate: true,
      allowOrderCreate: true,
      allowBarcodeCreate: false,
      allowLabelPurchase: false,
      allowCancel: false,
      ...options.guards,
    },
  };
}

const TEST_ENDPOINTS = {
  testBaseUrl: "https://testapi.mngkargo.com.tr",
  liveBaseUrl: "https://api.mngkargo.com.tr",
  apiVersion: "v-test",
};

function identity(): ResolvedShippingCredential {
  return {
    type: "IDENTITY",
    key: "cid",
    secret: "csecret",
    customerNumber: "300000000",
    customerPassword: "PASS0000",
    identityType: 1,
  };
}

function product(type: ResolvedShippingCredential["type"]): ResolvedShippingCredential {
  return { type, key: "cid", secret: "csecret", customerNumber: null, customerPassword: null, identityType: null };
}

const TOKEN_OK = { status: 200, body: JSON.stringify({ jwt: "j.w.t", jwtExpireDate: "10.03.2030 16:05:00" }) };

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

const VALID_RECIPIENT = {
  fullName: "Redakte Alıcı",
  address: "Redakte Mah. Örnek Sok. No:1",
  cityName: "İstanbul",
  districtName: "Üsküdar",
  phone: "+905000000000",
  email: "alici@example.com",
};

describe("resolveRecipientEmail — öncelik + trim + lokal red", () => {
  it("sipariş seviyesindeki e-posta varsa ve geçerliyse onu kullanır", () => {
    const r = resolveRecipientEmail(["siparis@example.com", "musteri@example.com"]);
    expect(r).toEqual({ ok: true, email: "siparis@example.com" });
  });

  it("sipariş seviyesi boşsa Customer.email fallback'ine düşer", () => {
    const r = resolveRecipientEmail(["", "musteri@example.com"]);
    expect(r).toEqual({ ok: true, email: "musteri@example.com" });
  });

  it("null/undefined adaylar atlanır (Customer.email null olabilir — ADR-032)", () => {
    const r = resolveRecipientEmail([undefined, null]);
    expect(r).toEqual({ ok: false, code: "RECIPIENT_EMAIL_REQUIRED" });
  });

  it("hiç aday yoksa/boşsa RECIPIENT_EMAIL_REQUIRED", () => {
    const r = resolveRecipientEmail(["", "   "]);
    expect(r).toEqual({ ok: false, code: "RECIPIENT_EMAIL_REQUIRED" });
  });

  it("dolu ama biçimsiz adaylar RECIPIENT_EMAIL_INVALID (değer sonuca taşınmaz)", () => {
    const r = resolveRecipientEmail(["gecersiz-eposta", "eksik@alanadi"]);
    expect(r).toEqual({ ok: false, code: "RECIPIENT_EMAIL_INVALID" });
    expect(JSON.stringify(r)).not.toContain("gecersiz-eposta");
  });

  it("geçersiz sipariş e-postasında geçerli Customer.email fallback'i kazanır", () => {
    const r = resolveRecipientEmail(["bozuk@", "musteri@example.com"]);
    expect(r).toEqual({ ok: true, email: "musteri@example.com" });
  });

  it("çözülen e-posta trim'lenir", () => {
    const r = resolveRecipientEmail(["  siparis@example.com  "]);
    expect(r).toEqual({ ok: true, email: "siparis@example.com" });
  });

  it("isValidRecipientEmail temel biçimleri doğrular", () => {
    expect(isValidRecipientEmail("a@b.co")).toBe(true);
    expect(isValidRecipientEmail("")).toBe(false);
    expect(isValidRecipientEmail("a b@c.com")).toBe(false);
    expect(isValidRecipientEmail("a@b")).toBe(false);
  });
});

describe("buildDhlRecipientBody — sağlayıcıya asla boş/geçersiz e-posta gitmez", () => {
  it("boş e-posta → RECIPIENT_EMAIL_REQUIRED (istek üretilmez)", () => {
    expect(() => buildDhlRecipientBody({ ...VALID_RECIPIENT, email: "" })).toThrowError(
      expect.objectContaining({ code: "RECIPIENT_EMAIL_REQUIRED" }),
    );
  });

  it("eksik (undefined) e-posta → RECIPIENT_EMAIL_REQUIRED", () => {
    expect(() => buildDhlRecipientBody({ ...VALID_RECIPIENT, email: undefined })).toThrowError(
      expect.objectContaining({ code: "RECIPIENT_EMAIL_REQUIRED" }),
    );
  });

  it("biçimsiz e-posta → RECIPIENT_EMAIL_INVALID; hata mesajı e-posta DEĞERİNİ içermez", () => {
    let captured: ShippingConfigError | null = null;
    try {
      buildDhlRecipientBody({ ...VALID_RECIPIENT, email: "bozuk@@example" });
    } catch (e) {
      captured = e as ShippingConfigError;
    }
    expect(captured?.code).toBe("RECIPIENT_EMAIL_INVALID");
    expect(captured?.message ?? "").not.toContain("bozuk");
  });

  it("geçerli e-posta trim'lenerek gövdeye yazılır", () => {
    const body = buildDhlRecipientBody({ ...VALID_RECIPIENT, email: "  alici@example.com " });
    expect(body.email).toBe("alici@example.com");
  });

  it("cityCode/districtCode bilinmiyorsa 0 GÖNDERİLMEZ — alanlar atlanır, adlar kalır", () => {
    const body = buildDhlRecipientBody(VALID_RECIPIENT);
    expect("cityCode" in body).toBe(false);
    expect("districtCode" in body).toBe(false);
    expect(body.cityName).toBe("İstanbul");
    expect(body.districtName).toBe("Üsküdar");
  });

  it("cityCode/districtCode 0 verilirse de atlanır (MNG'ye 0 gitmez)", () => {
    const body = buildDhlRecipientBody({ ...VALID_RECIPIENT, cityCode: 0, districtCode: 0 });
    expect("cityCode" in body).toBe(false);
    expect("districtCode" in body).toBe(false);
  });

  it("gerçek CBS kodları (>0) aynen gönderilir", () => {
    const body = buildDhlRecipientBody({ ...VALID_RECIPIENT, cityCode: 34, districtCode: 87 });
    expect(body.cityCode).toBe(34);
    expect(body.districtCode).toBe(87);
  });
});

describe("normalizeDhlMobilePhoneNumber — doküman örneğindeki yerel formata normalize", () => {
  it("+90'lı numarayı 10 haneli yerel formata çevirir", () => {
    expect(normalizeDhlMobilePhoneNumber("+905000000000")).toBe("5000000000");
  });

  it("0 önekli 11 haneli numarayı 10 haneye indirir", () => {
    expect(normalizeDhlMobilePhoneNumber("05000000000")).toBe("5000000000");
  });

  it("zaten yerel 10 haneli numara aynen kalır", () => {
    expect(normalizeDhlMobilePhoneNumber("5000000000")).toBe("5000000000");
  });

  it("boşluk/tire gibi rakam dışı karakterler ayıklanır", () => {
    expect(normalizeDhlMobilePhoneNumber("+90 500 000-00-00")).toBe("5000000000");
  });

  it("eksik/boş değer boş string olarak geçer (doküman pattern dayatmaz)", () => {
    expect(normalizeDhlMobilePhoneNumber(undefined)).toBe("");
  });
});

describe("DHL adapter — createRecipient/createOrder e-posta guard'ı (sağlayıcı çağrısı yok)", () => {
  it("createRecipient boş e-postada sağlayıcıya İSTEK ATMAZ → RECIPIENT_EMAIL_REQUIRED", async () => {
    const { transport, requests } = capturingTransport([TOKEN_OK, { status: 200, body: "" }]);
    const adapter = getShippingAdapter("DHL_ECOMMERCE", transport, TEST_ENDPOINTS);
    await expectShippingError(
      adapter.createRecipient({
        context: ctx({ credentials: { IDENTITY: identity(), PLUS_COMMAND: product("PLUS_COMMAND") } }),
        referenceId: "cos-1",
        recipient: { ...VALID_RECIPIENT, email: "" },
        explicitConfirm: true,
      }),
      "RECIPIENT_EMAIL_REQUIRED",
    );
    expect(requests.some((r) => r.url.includes("/createRecipient"))).toBe(false);
  });

  it("createOrder geçersiz e-postada sağlayıcıya İSTEK ATMAZ → RECIPIENT_EMAIL_INVALID", async () => {
    const { transport, requests } = capturingTransport([TOKEN_OK, { status: 200, body: "[]" }]);
    const adapter = getShippingAdapter("DHL_ECOMMERCE", transport, TEST_ENDPOINTS);
    await expectShippingError(
      adapter.createOrder({
        context: ctx({ credentials: { IDENTITY: identity(), STANDARD_COMMAND: product("STANDARD_COMMAND") } }),
        referenceId: "cos-1",
        recipient: { ...VALID_RECIPIENT, email: "gecersiz" },
        pieces: [{ desi: 1, kg: 1 }],
        explicitConfirm: true,
      }),
      "RECIPIENT_EMAIL_INVALID",
    );
    expect(requests.some((r) => r.url.includes("/createOrder"))).toBe(false);
  });

  it("geçerli e-posta ile createRecipient isteği doğru gövdeyle gider (email dolu, 0 kod yok, telefon yerel)", async () => {
    const { transport, requests } = capturingTransport([TOKEN_OK, { status: 200, body: "" }]);
    const adapter = getShippingAdapter("DHL_ECOMMERCE", transport, TEST_ENDPOINTS);
    await adapter.createRecipient({
      context: ctx({ credentials: { IDENTITY: identity(), PLUS_COMMAND: product("PLUS_COMMAND") } }),
      referenceId: "cos-1",
      recipient: VALID_RECIPIENT,
      explicitConfirm: true,
    });
    const req = requests.find((r) => r.url.includes("/createRecipient"));
    const recipient = (req?.body as { recipient: Record<string, unknown> }).recipient;
    expect(recipient.email).toBe("alici@example.com");
    expect(recipient.mobilePhoneNumber).toBe("5000000000");
    expect("cityCode" in recipient).toBe(false);
    expect("districtCode" in recipient).toBe(false);
  });

  it("buildCreateRecipientRequest gövdesinde email hiçbir durumda '' veya null OLMAZ", () => {
    const request = buildCreateRecipientRequest(
      {
        context: ctx({ credentials: { IDENTITY: identity(), PLUS_COMMAND: product("PLUS_COMMAND") } }),
        referenceId: "cos-1",
        recipient: VALID_RECIPIENT,
        explicitConfirm: true,
      },
      product("PLUS_COMMAND"),
      "token",
      TEST_ENDPOINTS.testBaseUrl,
      TEST_ENDPOINTS.apiVersion,
    );
    const body = JSON.parse(request.body ?? "{}") as { recipient: { email: unknown } };
    expect(body.recipient.email).toBe("alici@example.com");
    expect(request.body).not.toContain('"email":""');
    expect(request.body).not.toContain('"email":null');
  });
});

describe("createOrder content fallback — OpenAPI required alan, MNG boş string'i reddeder", () => {
  it("content verilmezse referenceId fallback'i gönderilir (boş string ASLA)", async () => {
    const { transport, requests } = capturingTransport([TOKEN_OK, { status: 200, body: "[]" }]);
    const adapter = getShippingAdapter("DHL_ECOMMERCE", transport, TEST_ENDPOINTS);
    await adapter.createOrder({
      context: ctx({ credentials: { IDENTITY: identity(), STANDARD_COMMAND: product("STANDARD_COMMAND") } }),
      referenceId: "cos-t132",
      recipient: VALID_RECIPIENT,
      pieces: [{ desi: 1, kg: 1 }],
      explicitConfirm: true,
    });
    const req = requests.find((r) => r.url.includes("/createOrder"));
    const order = (req?.body as { order: Record<string, unknown> }).order;
    expect(order.content).toBe("COS-T132");
    expect(order.description).toBe("COS-T132");
  });

  it("admin content verdiyse aynen kullanılır", async () => {
    const { transport, requests } = capturingTransport([TOKEN_OK, { status: 200, body: "[]" }]);
    const adapter = getShippingAdapter("DHL_ECOMMERCE", transport, TEST_ENDPOINTS);
    await adapter.createOrder({
      context: ctx({ credentials: { IDENTITY: identity(), STANDARD_COMMAND: product("STANDARD_COMMAND") } }),
      referenceId: "cos-t132",
      content: "Tekstil",
      recipient: VALID_RECIPIENT,
      pieces: [{ desi: 1, kg: 1 }],
      explicitConfirm: true,
    });
    const req = requests.find((r) => r.url.includes("/createOrder"));
    const order = (req?.body as { order: Record<string, unknown> }).order;
    expect(order.content).toBe("Tekstil");
  });
});

describe("MNG 26039 normalizasyonu — aksiyon alınabilir güvenli hata", () => {
  const MNG_26039_BODY = JSON.stringify({
    error: { code: "26039", message: "Bad Request", description: "'Recipient. Email'  geçerli bir e-posta adresi değil.  " },
  });

  it("extractProviderErrorCode nested MNG zarfından kodu çıkarır", () => {
    expect(extractProviderErrorCode(JSON.parse(MNG_26039_BODY))).toBe("26039");
    expect(extractProviderErrorCode([{ code: 26029, message: "x" }])).toBe("26029");
    expect(extractProviderErrorCode({})).toBeNull();
    // Uzun serbest metin kod SAYILMAZ (mesaj sızıntısı olmaz).
    expect(extractProviderErrorCode({ error: { code: "'Recipient. Email' geçerli değil" } })).toBeNull();
  });

  it("createRecipient 400 + kod 26039 → RECIPIENT_EMAIL_INVALID (PROVIDER_OPERATION_FAILED değil)", async () => {
    const { transport } = capturingTransport([TOKEN_OK, { status: 400, body: MNG_26039_BODY }]);
    const adapter = getShippingAdapter("DHL_ECOMMERCE", transport, TEST_ENDPOINTS);
    const error = await expectShippingError(
      adapter.createRecipient({
        context: ctx({ credentials: { IDENTITY: identity(), PLUS_COMMAND: product("PLUS_COMMAND") } }),
        referenceId: "cos-1",
        recipient: VALID_RECIPIENT,
        explicitConfirm: true,
      }),
      "RECIPIENT_EMAIL_INVALID",
    );
    // Mesaj sağlayıcı kodu + açıklamayı taşır; secret/JWT/istek gövdesi (PII) taşımaz.
    expect(error.message).toContain("26039");
    expect(error.message).toContain("geçerli bir e-posta adresi değil");
    expect(error.message).not.toContain("alici@example.com");
    expect(error.message).not.toContain("csecret");
    expect(error.message).not.toContain("j.w.t");
  });

  it("26039 dışı operasyon hataları PROVIDER_OPERATION_FAILED kalır ve kodu mesajda taşır", async () => {
    const { transport } = capturingTransport([
      TOKEN_OK,
      { status: 400, body: JSON.stringify({ error: { code: "26029", description: "marketPlaceShortCode zorunlu" } }) },
    ]);
    const adapter = getShippingAdapter("DHL_ECOMMERCE", transport, TEST_ENDPOINTS);
    const error = await expectShippingError(
      adapter.createOrder({
        context: ctx({ credentials: { IDENTITY: identity(), STANDARD_COMMAND: product("STANDARD_COMMAND") } }),
        referenceId: "cos-1",
        recipient: VALID_RECIPIENT,
        pieces: [{ desi: 1, kg: 1 }],
        explicitConfirm: true,
      }),
      "PROVIDER_OPERATION_FAILED",
    );
    expect(error.message).toContain("26029");
  });
});
