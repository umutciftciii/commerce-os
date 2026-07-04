import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import type { ShipmentStatus } from "@prisma/client";
import { createShippingSecretCipher } from "../src/shipping/encryption.js";
import {
  SHIPPING_WEBHOOK_SIGNATURE_HEADER,
  SHIPPING_WEBHOOK_TIMESTAMP_HEADER,
  SHIPPING_WEBHOOK_TOLERANCE_SECONDS,
  computeShippingWebhookEventKey,
  computeShippingWebhookSignature,
  verifyShippingWebhookSignature,
} from "../src/shipping/webhook.js";
import {
  registerShippingWebhookRoutes,
  type ShippingWebhookPersistence,
  type WebhookDeliveryInput,
  type WebhookProviderConfigRecord,
  type WebhookShipmentRecord,
} from "../src/shipping/webhook-routes.js";
import { SYNCABLE_SHIPMENT_STATUSES } from "../src/shipping/routes.js";
import { serializeShippingProviderConfig, type ShippingEnvGuards } from "../src/shipping/serialize.js";
import type { ShippingProviderConfig } from "@prisma/client";

/**
 * TODO-104 (ADR-048) — Shipping webhook guvenlik testleri. In-memory persistence
 * fake'i ile gercek route app.inject ile cagrilir: imza/timestamp dogrulama,
 * duplicate/replay idempotency, status esleme, cross-store izolasyon ve DTO
 * sizinti kontrolu.
 */

// 32 byte hex test anahtari (yalniz test; gercek ortam SHIPPING_ENCRYPTION_KEY).
const TEST_KEY = "a".repeat(64);
const WEBHOOK_SECRET = "test-webhook-secret-0123456789abcdef";
const TOKEN = "whk_test_token_0123456789";
const DHL_TOKEN = "whk_dhl_token_0123456789";
const NOW = new Date("2026-07-03T12:00:00.000Z");

interface FakeState {
  configs: WebhookProviderConfigRecord[];
  shipments: (WebhookShipmentRecord & { providerConfigId: string; referenceId: string; externalShipmentId: string | null })[];
  inbox: Map<string, WebhookDeliveryInput>;
  appliedEvents: WebhookDeliveryInput[];
}

function makeState(): FakeState {
  const cipher = createShippingSecretCipher(TEST_KEY);
  return {
    configs: [
      {
        id: "spc_1",
        storeId: "store_1",
        provider: "MOCK",
        status: "ENABLED",
        webhookSecretCipher: cipher.encrypt(WEBHOOK_SECRET),
      },
      {
        id: "spc_disabled",
        storeId: "store_1",
        provider: "MOCK",
        status: "DISABLED",
        webhookSecretCipher: cipher.encrypt(WEBHOOK_SECRET),
      },
      // TODO-140 — Ham MNG/DHL hareket push'unu (kod tasimayan aktarma metni) test etmek icin.
      {
        id: "spc_dhl",
        storeId: "store_1",
        provider: "DHL_ECOMMERCE",
        status: "ENABLED",
        webhookSecretCipher: cipher.encrypt(WEBHOOK_SECRET),
      },
    ],
    shipments: [
      {
        id: "shp_1",
        storeId: "store_1",
        providerConfigId: "spc_1",
        provider: "MOCK",
        status: "IN_TRANSIT",
        shipmentStatusCode: 2,
        trackingNumber: "TRACK123",
        trackingUrl: null,
        referenceId: "ref_order_1",
        externalShipmentId: "ext_1",
      },
      // Baska store'un gonderisi — ayni takip no ile bile ESLESMEMELI.
      {
        id: "shp_other_store",
        storeId: "store_2",
        providerConfigId: "spc_other",
        provider: "MOCK",
        status: "IN_TRANSIT",
        shipmentStatusCode: 2,
        trackingNumber: "OTHER-STORE-TRACK",
        trackingUrl: null,
        referenceId: "ref_other",
        externalShipmentId: null,
      },
      // TODO-140 — Hazirlik asamasindaki (PACKED) DHL gonderisi; hareket metniyle ilerleyecek.
      {
        id: "shp_dhl",
        storeId: "store_1",
        providerConfigId: "spc_dhl",
        provider: "DHL_ECOMMERCE",
        status: "LABEL_CREATED",
        shipmentStatusCode: 1,
        trackingNumber: "DHL-BARCODE-1",
        trackingUrl: null,
        referenceId: "ref_dhl_1",
        externalShipmentId: "dhl_ext_1",
      },
    ],
    inbox: new Map(),
    appliedEvents: [],
  };
}

function makePersistence(state: FakeState): ShippingWebhookPersistence {
  return {
    async findConfigByWebhookToken(token) {
      // Fake: TOKEN → spc_1, "disabled-token" → spc_disabled, DHL_TOKEN → spc_dhl.
      if (token === TOKEN) return state.configs[0]!;
      if (token === "disabled-token-0123456789") return state.configs[1]!;
      if (token === DHL_TOKEN) return state.configs.find((c) => c.id === "spc_dhl")!;
      return null;
    },
    async findShipment(storeId, providerConfigId, ids) {
      return (
        state.shipments.find(
          (s) =>
            s.storeId === storeId &&
            s.providerConfigId === providerConfigId &&
            ((ids.referenceId && s.referenceId === ids.referenceId) ||
              (ids.trackingNumber && s.trackingNumber === ids.trackingNumber) ||
              (ids.externalShipmentId && s.externalShipmentId === ids.externalShipmentId)),
        ) ?? null
      );
    },
    async recordDelivery(input) {
      const key = `${input.providerConfigId}:${input.eventKey}`;
      if (state.inbox.has(key)) return "duplicate";
      state.inbox.set(key, input);
      if (input.apply) {
        const shipment = state.shipments.find((s) => s.id === input.apply!.shipmentId);
        if (shipment) {
          shipment.status = input.apply.nextStatus;
          shipment.shipmentStatusCode = input.apply.statusCode ?? shipment.shipmentStatusCode;
        }
        state.appliedEvents.push(input);
      }
      return "created";
    },
  };
}

async function buildApp(state: FakeState) {
  const app = Fastify({ logger: false });
  registerShippingWebhookRoutes(app, {
    config: { SHIPPING_ENCRYPTION_KEY: TEST_KEY },
    persistence: makePersistence(state),
    now: () => NOW,
  });
  await app.ready();
  return app;
}

function signedHeaders(rawBody: string, overrides?: { timestamp?: string; signature?: string }) {
  const timestamp = overrides?.timestamp ?? String(Math.floor(NOW.getTime() / 1000));
  const signature =
    overrides?.signature ?? computeShippingWebhookSignature(WEBHOOK_SECRET, timestamp, rawBody);
  return {
    "content-type": "application/json",
    [SHIPPING_WEBHOOK_SIGNATURE_HEADER]: signature,
    [SHIPPING_WEBHOOK_TIMESTAMP_HEADER]: timestamp,
  };
}

const VALID_EVENT = JSON.stringify({
  eventId: "evt_100",
  trackingNumber: "TRACK123",
  statusCode: 4,
  statusText: "Dağıtımda",
  location: "İstanbul Transfer Merkezi",
  occurredAt: "2026-07-03T11:45:00.000Z",
});

describe("shipping webhook — imza dogrulama", () => {
  it("gecerli imzali webhook shipment'i gunceller ve event yazar", async () => {
    const state = makeState();
    const app = await buildApp(state);
    const res = await app.inject({
      method: "POST",
      url: `/public/shipping/webhooks/${TOKEN}`,
      headers: signedHeaders(VALID_EVENT),
      payload: VALID_EVENT,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, duplicate: false, handled: true });
    const shipment = state.shipments[0]!;
    expect(shipment.status).toBe("OUT_FOR_DELIVERY"); // statusCode 4 eslemesi
    expect(state.appliedEvents).toHaveLength(1);
    expect(state.appliedEvents[0]!.apply?.location).toBe("İstanbul Transfer Merkezi");
    await app.close();
  });

  it("gecersiz imza 401 ile reddedilir; hicbir sey yazilmaz", async () => {
    const state = makeState();
    const app = await buildApp(state);
    const res = await app.inject({
      method: "POST",
      url: `/public/shipping/webhooks/${TOKEN}`,
      headers: signedHeaders(VALID_EVENT, { signature: "f".repeat(64) }),
      payload: VALID_EVENT,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SIGNATURE_INVALID");
    expect(state.inbox.size).toBe(0);
    expect(state.shipments[0]!.status).toBe("IN_TRANSIT");
    await app.close();
  });

  it("imza header'i yoksa 401 SIGNATURE_MISSING", async () => {
    const state = makeState();
    const app = await buildApp(state);
    const res = await app.inject({
      method: "POST",
      url: `/public/shipping/webhooks/${TOKEN}`,
      headers: {
        "content-type": "application/json",
        [SHIPPING_WEBHOOK_TIMESTAMP_HEADER]: String(Math.floor(NOW.getTime() / 1000)),
      },
      payload: VALID_EVENT,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SIGNATURE_MISSING");
    expect(state.inbox.size).toBe(0);
    await app.close();
  });

  it("govde degistirilmis (tamper) istek reddedilir", async () => {
    const state = makeState();
    const app = await buildApp(state);
    const tampered = VALID_EVENT.replace("TRACK123", "TRACK999");
    const res = await app.inject({
      method: "POST",
      url: `/public/shipping/webhooks/${TOKEN}`,
      // Imza ORIJINAL govdeye gore; gonderilen govde degistirilmis.
      headers: signedHeaders(VALID_EVENT),
      payload: tampered,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("SIGNATURE_INVALID");
    await app.close();
  });

  it("timestamp tolerans disi (replay) istek reddedilir", async () => {
    const state = makeState();
    const app = await buildApp(state);
    const oldTs = String(
      Math.floor(NOW.getTime() / 1000) - SHIPPING_WEBHOOK_TOLERANCE_SECONDS - 10,
    );
    const res = await app.inject({
      method: "POST",
      url: `/public/shipping/webhooks/${TOKEN}`,
      headers: signedHeaders(VALID_EVENT, { timestamp: oldTs }),
      payload: VALID_EVENT,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("TIMESTAMP_OUT_OF_RANGE");
    expect(state.inbox.size).toBe(0);
    await app.close();
  });

  it("bilinmeyen/disabled token generic 404 alir (var/yok sizdirilmez)", async () => {
    const state = makeState();
    const app = await buildApp(state);
    for (const token of ["unknown-token-0123456789", "disabled-token-0123456789"]) {
      const res = await app.inject({
        method: "POST",
        url: `/public/shipping/webhooks/${token}`,
        headers: signedHeaders(VALID_EVENT),
        payload: VALID_EVENT,
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("WEBHOOK_NOT_FOUND");
    }
    await app.close();
  });
});

describe("shipping webhook — idempotency/replay", () => {
  it("ayni eventId'li duplicate teslimat ikinci event uretmez", async () => {
    const state = makeState();
    const app = await buildApp(state);
    const first = await app.inject({
      method: "POST",
      url: `/public/shipping/webhooks/${TOKEN}`,
      headers: signedHeaders(VALID_EVENT),
      payload: VALID_EVENT,
    });
    expect(first.json()).toEqual({ ok: true, duplicate: false, handled: true });
    const second = await app.inject({
      method: "POST",
      url: `/public/shipping/webhooks/${TOKEN}`,
      headers: signedHeaders(VALID_EVENT),
      payload: VALID_EVENT,
    });
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual({ ok: true, duplicate: true, handled: false });
    expect(state.appliedEvents).toHaveLength(1);
    expect(state.inbox.size).toBe(1);
    await app.close();
  });

  it("eventId yoksa payload hash idempotency anahtari olur", () => {
    const raw = '{"a":1}';
    expect(computeShippingWebhookEventKey(null, raw)).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(computeShippingWebhookEventKey("evt_9", raw)).toBe("evt:evt_9");
    // Ayni govde ayni anahtari uretir (deterministik dedupe).
    expect(computeShippingWebhookEventKey(null, raw)).toBe(computeShippingWebhookEventKey(null, raw));
  });
});

describe("shipping webhook — status esleme ve guvenli davranis", () => {
  it("teslim kodu (5) DELIVERED'a esler", async () => {
    const state = makeState();
    const app = await buildApp(state);
    const body = JSON.stringify({ eventId: "evt_del", trackingNumber: "TRACK123", statusCode: 5 });
    const res = await app.inject({
      method: "POST",
      url: `/public/shipping/webhooks/${TOKEN}`,
      headers: signedHeaders(body),
      payload: body,
    });
    expect(res.json().handled).toBe(true);
    expect(state.shipments[0]!.status).toBe("DELIVERED");
    await app.close();
  });

  it("bilinmeyen statusCode mevcut durumu KORUR ama event yine kaydedilir", async () => {
    const state = makeState();
    const app = await buildApp(state);
    const body = JSON.stringify({ eventId: "evt_unknown", trackingNumber: "TRACK123", statusCode: 99, statusText: "???" });
    const res = await app.inject({
      method: "POST",
      url: `/public/shipping/webhooks/${TOKEN}`,
      headers: signedHeaders(body),
      payload: body,
    });
    expect(res.json().handled).toBe(true);
    expect(state.shipments[0]!.status).toBe("IN_TRANSIT"); // regres/crash yok
    expect(state.appliedEvents).toHaveLength(1);
    await app.close();
  });

  it("eslesen gonderi yoksa audit'li IGNORED kaydi; mutasyon yok", async () => {
    const state = makeState();
    const app = await buildApp(state);
    // Cross-store: store_2'nin takip no'su bu config'in store'unda ESLESMEZ.
    const body = JSON.stringify({ eventId: "evt_cross", trackingNumber: "OTHER-STORE-TRACK", statusCode: 5 });
    const res = await app.inject({
      method: "POST",
      url: `/public/shipping/webhooks/${TOKEN}`,
      headers: signedHeaders(body),
      payload: body,
    });
    expect(res.json()).toEqual({ ok: true, duplicate: false, handled: false });
    // Baska store'un gonderisi DEGISMEDI (cross-store mutasyon imkansiz).
    expect(state.shipments[1]!.status).toBe("IN_TRANSIT");
    expect(state.appliedEvents).toHaveLength(0);
    const recorded = [...state.inbox.values()][0]!;
    expect(recorded.outcome).toBe("IGNORED_UNKNOWN_SHIPMENT");
    await app.close();
  });

  it("sozlesme disi/bozuk JSON payload crash etmez; IGNORED_UNSUPPORTED kaydi", async () => {
    const state = makeState();
    const app = await buildApp(state);
    const body = "bozuk-json{{{";
    const res = await app.inject({
      method: "POST",
      url: `/public/shipping/webhooks/${TOKEN}`,
      headers: signedHeaders(body),
      payload: body,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().handled).toBe(false);
    const recorded = [...state.inbox.values()][0]!;
    expect(recorded.outcome).toBe("IGNORED_UNSUPPORTED");
    await app.close();
  });

  it("ACK yaniti ic alan/secret tasimaz", async () => {
    const state = makeState();
    const app = await buildApp(state);
    const res = await app.inject({
      method: "POST",
      url: `/public/shipping/webhooks/${TOKEN}`,
      headers: signedHeaders(VALID_EVENT),
      payload: VALID_EVENT,
    });
    expect(Object.keys(res.json()).sort()).toEqual(["duplicate", "handled", "ok"]);
    const rawResponse = res.body;
    expect(rawResponse).not.toContain(WEBHOOK_SECRET);
    expect(rawResponse).not.toContain("shp_1");
    expect(rawResponse).not.toContain("store_1");
    await app.close();
  });
});

describe("verifyShippingWebhookSignature (saf)", () => {
  const base = { secret: "s3cret", rawBody: '{"x":1}', nowMs: NOW.getTime() };
  const ts = String(Math.floor(NOW.getTime() / 1000));

  it("dogru imza gecer", () => {
    const signature = computeShippingWebhookSignature("s3cret", ts, base.rawBody);
    expect(verifyShippingWebhookSignature({ ...base, signature, timestamp: ts })).toEqual({ ok: true });
  });

  it("timestamp eksik/bozuksa reddeder", () => {
    const signature = computeShippingWebhookSignature("s3cret", ts, base.rawBody);
    expect(verifyShippingWebhookSignature({ ...base, signature, timestamp: null })).toEqual({
      ok: false,
      code: "TIMESTAMP_MISSING",
    });
    expect(verifyShippingWebhookSignature({ ...base, signature, timestamp: "abc" })).toEqual({
      ok: false,
      code: "TIMESTAMP_INVALID",
    });
  });

  it("farkli secret ile uretilmis imza gecmez", () => {
    const signature = computeShippingWebhookSignature("baska-secret", ts, base.rawBody);
    expect(verifyShippingWebhookSignature({ ...base, signature, timestamp: ts })).toEqual({
      ok: false,
      code: "SIGNATURE_INVALID",
    });
  });

  it("hex olmayan/kisa imza guvenle reddedilir", () => {
    expect(
      verifyShippingWebhookSignature({ ...base, signature: "zzzz", timestamp: ts }),
    ).toEqual({ ok: false, code: "SIGNATURE_INVALID" });
  });
});

describe("TODO-104 — config DTO webhook secret sizdirmaz", () => {
  const ENV_OFF: ShippingEnvGuards = { orderCreate: false, barcodeCreate: false, labelPurchase: false, cancel: false };

  it("serialize edilen provider config'te webhookToken/webhookSecretCipher YOK, yalniz boolean var", () => {
    const cfg = {
      id: "spc_1",
      storeId: "store_1",
      provider: "MOCK",
      mode: "TEST",
      status: "ENABLED",
      displayName: "Mock Kargo",
      logoUrl: null,
      logoAlt: null,
      allowRecipientCreate: false,
      allowOrderCreate: false,
      allowBarcodeCreate: false,
      allowLabelPurchase: false,
      lastTestedAt: null,
      lastTestStatus: null,
      lastErrorCode: null,
      lastProviderHttpStatus: null,
      lastProviderTestType: null,
      webhookToken: "whk_super_secret_token",
      webhookSecretCipher: "v1:gcm:aaa:bbb:ccc",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      credentials: [],
    } as unknown as ShippingProviderConfig & { credentials: [] };
    const serialized = serializeShippingProviderConfig(cfg, ENV_OFF);
    expect(serialized.webhookConfigured).toBe(true);
    const json = JSON.stringify(serialized);
    expect(json).not.toContain("whk_super_secret_token");
    expect(json).not.toContain("webhookSecretCipher");
    expect(json).not.toContain("v1:gcm");
  });
});

describe("TODO-100 — toplu sync durum secimi", () => {
  it("terminal durumlar ve DRAFT toplu sync'e girmez", () => {
    const excluded: ShipmentStatus[] = ["DRAFT", "DELIVERED", "RETURNED", "CANCELLED", "FAILED"];
    for (const status of excluded) {
      expect(SYNCABLE_SHIPMENT_STATUSES).not.toContain(status);
    }
    for (const status of ["ORDER_CREATED", "LABEL_PENDING", "LABEL_CREATED", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERY_FAILED"] as ShipmentStatus[]) {
      expect(SYNCABLE_SHIPMENT_STATUSES).toContain(status);
    }
  });
});

describe("TODO-140 — ham hareket metni durum ilerletme (webhook)", () => {
  // Kod tasimayan ham MNG/DHL hareket push'u. DIZI formu kullanilir: tek bir ust-duzey
  // referenceId PLATFORM sozlesmesince yakalanip events'i yok sayardi → dizi + her harekete
  // barkod kimligi (DHL-BARCODE-1) ile DHL_TRACKING adapter yolu zorlanir.
  function dhlTrackingBody(movements: { eventStatus: string; location?: string; when?: string }[]) {
    return JSON.stringify(
      movements.map((m, i) => ({
        eventSequence: String(i + 1),
        eventStatus: m.eventStatus,
        location: m.location ?? "İstanbul",
        eventDateTime2: m.when ?? `2026-07-03 1${i}:30:00`,
        barcode: "DHL-BARCODE-1",
      })),
    );
  }

  async function postDhl(state: FakeState, body: string) {
    const app = await buildApp(state);
    const res = await app.inject({
      method: "POST",
      url: `/public/shipping/webhooks/${DHL_TOKEN}`,
      headers: signedHeaders(body),
      payload: body,
    });
    await app.close();
    return res;
  }

  function dhlShipment(state: FakeState) {
    return state.shipments.find((s) => s.id === "shp_dhl")!;
  }

  it("transfer/aktarma hareketi PACKED gonderiyi IN_TRANSIT'e ilerletir (kod yok, metin var)", async () => {
    const state = makeState();
    const res = await postDhl(state, dhlTrackingBody([{ eventStatus: "SMOKE AKTARMADA" }]));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, duplicate: false, handled: true });
    expect(dhlShipment(state).status).toBe("IN_TRANSIT");
  });

  it("ayni hareket ikinci kez gelince duplicate; ikinci kez event/durum spam'i yok", async () => {
    const state = makeState();
    const body = dhlTrackingBody([{ eventStatus: "SMOKE TRANSFER MERKEZİNDE" }]);
    const first = await postDhl(state, body);
    expect(first.json()).toEqual({ ok: true, duplicate: false, handled: true });
    expect(dhlShipment(state).status).toBe("IN_TRANSIT");
    expect(state.appliedEvents).toHaveLength(1);

    const second = await postDhl(state, body);
    expect(second.json()).toEqual({ ok: true, duplicate: true, handled: false });
    // Duplicate teslimat yeni apply URETMEZ (event/durum spam'i yok).
    expect(state.appliedEvents).toHaveLength(1);
    expect(dhlShipment(state).status).toBe("IN_TRANSIT");
  });

  it("zayif/bilinmeyen hareket metni tracking event yazar ama Shipment.status'u DEGISTIRMEZ", async () => {
    const state = makeState();
    const res = await postDhl(state, dhlTrackingBody([{ eventStatus: "Gönderi oluşturuldu" }]));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, duplicate: false, handled: true });
    // Event kaydedildi (apply var) ama durum LABEL_CREATED korundu.
    expect(state.appliedEvents).toHaveLength(1);
    expect(dhlShipment(state).status).toBe("LABEL_CREATED");
  });

  it("teslim hareketi yalniz KESIN kanitla DELIVERED'a ilerletir", async () => {
    const state = makeState();
    const res = await postDhl(state, dhlTrackingBody([{ eventStatus: "TESLİM EDİLDİ" }]));
    expect(res.statusCode).toBe(200);
    expect(dhlShipment(state).status).toBe("DELIVERED");
  });
});
