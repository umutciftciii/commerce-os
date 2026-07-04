import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { createShippingSecretCipher } from "../src/shipping/encryption.js";
import {
  SHIPPING_WEBHOOK_SIGNATURE_HEADER,
  SHIPPING_WEBHOOK_TIMESTAMP_HEADER,
  computeShippingWebhookSignature,
} from "../src/shipping/webhook.js";
import {
  computeNormalizedWebhookEventKey,
  normalizeShippingWebhookPayload,
} from "../src/shipping/webhook-adapters.js";
import { shipmentTrackingEventKey } from "../src/shipping/status-map.js";
import {
  registerShippingWebhookRoutes,
  type ShippingWebhookPersistence,
  type WebhookDeliveryInput,
  type WebhookProviderConfigRecord,
  type WebhookShipmentRecord,
} from "../src/shipping/webhook-routes.js";

/**
 * TODO-130 (ADR-055) — Provider ham webhook adapter testleri.
 *
 * Adapter saf fonksiyon olarak (normalize + event key) ve uctan uca (imzali istek →
 * inbox/outcome/durum) test edilir. Ham sekiller repoda GROUNDED alan adlariyla
 * sinirlidir (mappers.ts getshipmentstatus/trackshipment); Geliver ornek payload
 * gelene kadar guvenli unsupported'tir.
 */

const TEST_KEY = "a".repeat(64);
const WEBHOOK_SECRET = "test-webhook-secret-0123456789abcdef";
const DHL_TOKEN = "whk_dhl_token_0123456789";
const GELIVER_TOKEN = "whk_geliver_token_0123456789";
const NOW = new Date("2026-07-04T12:00:00.000Z");

/* ───────────────────────── Adapter saf fonksiyon testleri ───────────────────────── */

describe("normalizeShippingWebhookPayload — DHL_ECOMMERCE (MNG) ham sekiller", () => {
  it("getshipmentstatus-benzeri durum payload'i guvenli evente normalize olur", () => {
    const result = normalizeShippingWebhookPayload("DHL_ECOMMERCE", {
      shipment: {
        referenceId: "ref_1",
        shipmentId: "MNG-777",
        shipmentStatusCode: 4,
        shipmentStatus: "DAĞITIMDA",
        isDelivered: false,
        trackingUrl: "https://kargotakip.example/777",
        deliveryDateTime: null,
      },
    });
    expect(result.supported).toBe(true);
    if (!result.supported) return;
    expect(result.format).toBe("DHL_STATUS");
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      referenceId: "ref_1",
      externalShipmentId: "MNG-777",
      statusCode: 4,
      statusText: "DAĞITIMDA",
      isDelivered: false,
      trackingUrl: "https://kargotakip.example/777",
    });
  });

  it("sarmalsiz (flat) durum payload'i ve string statusCode da cozulur", () => {
    const result = normalizeShippingWebhookPayload("DHL_ECOMMERCE", {
      referenceId: "ref_2",
      shipmentStatusCode: "5",
      isDelivered: 1,
      deliveryDateTime: "04-07-2026 11:30:00",
    });
    expect(result.supported).toBe(true);
    if (!result.supported) return;
    expect(result.events[0]).toMatchObject({
      referenceId: "ref_2",
      statusCode: 5,
      isDelivered: true,
      occurredAtRaw: "04-07-2026 11:30:00",
    });
  });

  it("trackshipment-benzeri kumulatif hareket dizisi coklu evente normalize olur", () => {
    const result = normalizeShippingWebhookPayload("DHL_ECOMMERCE", [
      {
        referenceId: "ref_3",
        eventSequence: 1,
        eventStatusCode: 2,
        eventStatus: "TRANSFER MERKEZİNDE",
        location: "İstanbul",
        eventDateTime2: "2026-07-03",
      },
      {
        referenceId: "ref_3",
        eventSequence: 2,
        eventStatusCode: 4,
        eventStatus: "DAĞITIMDA",
        location: "Kadıköy",
        eventDateTime: "04-07-2026 09:15:00",
      },
    ]);
    expect(result.supported).toBe(true);
    if (!result.supported) return;
    expect(result.format).toBe("DHL_TRACKING");
    expect(result.events).toHaveLength(2);
    expect(result.events[1]).toMatchObject({ statusCode: 4, location: "Kadıköy" });
  });

  it("sarmal { referenceId, events: [...] } sekli kimligi hareketlere miras birakir", () => {
    const result = normalizeShippingWebhookPayload("DHL_ECOMMERCE", {
      referenceId: "ref_4",
      events: [{ eventStatusCode: 2, eventStatus: "YOLDA", eventDateTime: "03-07-2026 10:00:00" }],
    });
    expect(result.supported).toBe(true);
    if (!result.supported) return;
    expect(result.events[0]!.referenceId).toBe("ref_4");
  });

  it("farkli gonderilere ait kimlikler tek teslimatta TAHMIN EDILMEZ (ambiguous)", () => {
    const result = normalizeShippingWebhookPayload("DHL_ECOMMERCE", [
      { referenceId: "ref_A", eventStatusCode: 2, eventDateTime: "03-07-2026 10:00:00" },
      { referenceId: "ref_B", eventStatusCode: 4, eventDateTime: "03-07-2026 11:00:00" },
    ]);
    expect(result).toEqual({ supported: false, reason: "AMBIGUOUS_SHIPMENT_IDS" });
  });

  it("kimliksiz/taninmayan payload unsupported doner, throw etmez", () => {
    for (const payload of [
      { shipmentStatusCode: 4 }, // kimlik yok
      { shipment: { referenceId: "ref_x" } }, // ham sekil ama durum sinyali yok
      { foo: "bar" },
      42,
      "metin",
      null,
      [],
      [{ hello: 1 }],
    ]) {
      const result = normalizeShippingWebhookPayload("DHL_ECOMMERCE", payload);
      expect(result.supported).toBe(false);
    }
  });

  it("kimlikli PLATFORM payload'i durum sinyalsiz de kabul edilir (mevcut davranis)", () => {
    // ADR-048: kimlik tasiyan sozlesme payload'i ACCEPTED olur; statusCode null
    // oldugu icin durum ILERLEMEZ (status-map mevcut durumu korur).
    const result = normalizeShippingWebhookPayload("DHL_ECOMMERCE", { referenceId: "ref_x" });
    expect(result.supported).toBe(true);
    if (!result.supported) return;
    expect(result.format).toBe("PLATFORM");
    expect(result.events[0]!.statusCode).toBeNull();
  });

  it("PLATFORM sozlesmesi DHL config'inde de oncelikli calisir (geriye uyum)", () => {
    const result = normalizeShippingWebhookPayload("DHL_ECOMMERCE", {
      eventId: "evt_p",
      trackingNumber: "TR1",
      statusCode: 2,
    });
    expect(result.supported).toBe(true);
    if (!result.supported) return;
    expect(result.format).toBe("PLATFORM");
    expect(result.events[0]!.eventId).toBe("evt_p");
  });
});

describe("normalizeShippingWebhookPayload — Geliver / MOCK", () => {
  it("Geliver ham payload'i ornek olmadigi icin guvenli unsupported", () => {
    const result = normalizeShippingWebhookPayload("GELIVER", {
      shipmentID: "glv_1",
      statu: "delivered",
    });
    expect(result).toEqual({ supported: false, reason: "GELIVER_SAMPLE_REQUIRED" });
  });

  it("Geliver PLATFORM sozlesmesini kabul etmeye devam eder", () => {
    const result = normalizeShippingWebhookPayload("GELIVER", {
      trackingNumber: "GLV-TRACK",
      statusCode: 5,
      isDelivered: true,
    });
    expect(result.supported).toBe(true);
    if (!result.supported) return;
    expect(result.format).toBe("PLATFORM");
  });

  it("MOCK yalniz PLATFORM sozlesmesi kabul eder; ham DHL sekli unsupported", () => {
    const platform = normalizeShippingWebhookPayload("MOCK", { trackingNumber: "T", statusCode: 2 });
    expect(platform.supported).toBe(true);
    const raw = normalizeShippingWebhookPayload("MOCK", {
      shipment: { referenceId: "r", shipmentStatusCode: 2 },
    });
    expect(raw).toEqual({ supported: false, reason: "UNSUPPORTED_PAYLOAD" });
  });
});

describe("computeNormalizedWebhookEventKey — idempotency anahtari", () => {
  const evt = (over: Record<string, unknown>) => ({
    eventId: null,
    referenceId: "ref_1",
    trackingNumber: null,
    externalShipmentId: null,
    statusCode: 4,
    statusText: "DAĞITIMDA",
    isDelivered: false,
    location: "İstanbul",
    occurredAtRaw: "04-07-2026 09:15:00",
    trackingUrl: null,
    ...over,
  });

  it("ayni normalize event ayni anahtari uretir (deterministik)", () => {
    expect(computeNormalizedWebhookEventKey("DHL_ECOMMERCE", [evt({})])).toBe(
      computeNormalizedWebhookEventKey("DHL_ECOMMERCE", [evt({})]),
    );
    expect(computeNormalizedWebhookEventKey("DHL_ECOMMERCE", [evt({})])).toMatch(/^nrm:[0-9a-f]{64}$/);
  });

  it("farkli saglayici eventleri farkli anahtar uretir", () => {
    const a = computeNormalizedWebhookEventKey("DHL_ECOMMERCE", [evt({})]);
    expect(computeNormalizedWebhookEventKey("DHL_ECOMMERCE", [evt({ statusCode: 5 })])).not.toBe(a);
    expect(
      computeNormalizedWebhookEventKey("DHL_ECOMMERCE", [evt({ occurredAtRaw: "04-07-2026 10:00:00" })]),
    ).not.toBe(a);
    expect(computeNormalizedWebhookEventKey("GELIVER", [evt({})])).not.toBe(a);
  });

  it("saglayici eventId'si varsa evt:<id> onceliklidir", () => {
    expect(computeNormalizedWebhookEventKey("DHL_ECOMMERCE", [evt({ eventId: "mng_9" })])).toBe(
      "evt:mng_9",
    );
  });
});

/* ───────────────────────── Uctan uca route testleri ───────────────────────── */

interface FakeShipment extends WebhookShipmentRecord {
  providerConfigId: string;
  referenceId: string;
  externalShipmentId: string | null;
}

interface FakeState {
  configs: WebhookProviderConfigRecord[];
  shipments: FakeShipment[];
  inbox: Map<string, WebhookDeliveryInput>;
  appliedEvents: WebhookDeliveryInput[];
  /** shipmentTrackingEventKey formatinda mevcut timeline (dedupe kaynagi). */
  timelineKeys: Map<string, Set<string>>;
}

function makeState(): FakeState {
  const cipher = createShippingSecretCipher(TEST_KEY);
  return {
    configs: [
      {
        id: "spc_dhl",
        storeId: "store_1",
        provider: "DHL_ECOMMERCE",
        status: "ENABLED",
        webhookSecretCipher: cipher.encrypt(WEBHOOK_SECRET),
      },
      {
        id: "spc_glv",
        storeId: "store_1",
        provider: "GELIVER",
        status: "ENABLED",
        webhookSecretCipher: cipher.encrypt(WEBHOOK_SECRET),
      },
    ],
    shipments: [
      {
        id: "shp_dhl_1",
        storeId: "store_1",
        providerConfigId: "spc_dhl",
        provider: "DHL_ECOMMERCE",
        status: "IN_TRANSIT",
        shipmentStatusCode: 2,
        trackingNumber: "TRACK-1",
        trackingUrl: null,
        referenceId: "ref_1",
        externalShipmentId: "MNG-777",
      },
      // Eslestirme onceligi testi: TRACK-PRIORITY takip no'su BU gonderide,
      // ayni teslimatta gelen externalShipmentId ise shp_dhl_1'de.
      {
        id: "shp_dhl_2",
        storeId: "store_1",
        providerConfigId: "spc_dhl",
        provider: "DHL_ECOMMERCE",
        status: "LABEL_CREATED",
        shipmentStatusCode: 1,
        trackingNumber: "TRACK-PRIORITY",
        trackingUrl: null,
        referenceId: "ref_2",
        externalShipmentId: null,
      },
      {
        id: "shp_dhl_delivered",
        storeId: "store_1",
        providerConfigId: "spc_dhl",
        provider: "DHL_ECOMMERCE",
        status: "DELIVERED",
        shipmentStatusCode: 5,
        trackingNumber: "TRACK-DONE",
        trackingUrl: null,
        referenceId: "ref_done",
        externalShipmentId: null,
      },
    ],
    inbox: new Map(),
    appliedEvents: [],
    timelineKeys: new Map(),
  };
}

function makePersistence(state: FakeState): ShippingWebhookPersistence {
  return {
    async findConfigByWebhookToken(token) {
      if (token === DHL_TOKEN) return state.configs[0]!;
      if (token === GELIVER_TOKEN) return state.configs[1]!;
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
    async listShipmentEventKeys(shipmentId) {
      return [...(state.timelineKeys.get(shipmentId) ?? [])];
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
        // Timeline'i gercek persistence gibi buyut (sonraki dedupe turlari icin).
        const keys = state.timelineKeys.get(input.apply.shipmentId) ?? new Set<string>();
        for (const ev of [...(input.apply.additionalEvents ?? []), input.apply]) {
          keys.add(
            shipmentTrackingEventKey({
              statusText: ev.statusText,
              location: ev.location,
              occurredAt: ev.occurredAt,
            }),
          );
        }
        state.timelineKeys.set(input.apply.shipmentId, keys);
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

function signedHeaders(rawBody: string) {
  const timestamp = String(Math.floor(NOW.getTime() / 1000));
  return {
    "content-type": "application/json",
    [SHIPPING_WEBHOOK_SIGNATURE_HEADER]: computeShippingWebhookSignature(
      WEBHOOK_SECRET,
      timestamp,
      rawBody,
    ),
    [SHIPPING_WEBHOOK_TIMESTAMP_HEADER]: timestamp,
  };
}

async function post(app: Awaited<ReturnType<typeof buildApp>>, token: string, body: string) {
  return app.inject({
    method: "POST",
    url: `/public/shipping/webhooks/${token}`,
    headers: signedHeaders(body),
    payload: body,
  });
}

describe("TODO-130 — DHL/MNG ham webhook uctan uca", () => {
  it("durum payload'i externalShipmentId ile eslesir ve durumu kanitla ilerletir", async () => {
    const state = makeState();
    const app = await buildApp(state);
    const body = JSON.stringify({
      shipment: { shipmentId: "MNG-777", shipmentStatusCode: 4, shipmentStatus: "DAĞITIMDA" },
    });
    const res = await post(app, DHL_TOKEN, body);
    expect(res.json()).toEqual({ ok: true, duplicate: false, handled: true });
    expect(state.shipments[0]!.status).toBe("OUT_FOR_DELIVERY");
    const recorded = [...state.inbox.values()][0]!;
    expect(recorded.outcome).toBe("ACCEPTED");
    expect(recorded.eventKey).toMatch(/^nrm:/);
    await app.close();
  });

  it("eslestirme onceligi: externalShipmentId trackingNumber'dan ONCE gelir", async () => {
    const state = makeState();
    const app = await buildApp(state);
    // Payload iki kimlik tasir: shipmentId → shp_dhl_1, barcode → shp_dhl_2.
    const body = JSON.stringify({
      shipment: { shipmentId: "MNG-777", barcode: "TRACK-PRIORITY", shipmentStatusCode: 2 },
    });
    const res = await post(app, DHL_TOKEN, body);
    expect(res.json().handled).toBe(true);
    expect(state.appliedEvents[0]!.apply!.shipmentId).toBe("shp_dhl_1");
    expect(state.shipments[1]!.status).toBe("LABEL_CREATED"); // dokunulmadi
    await app.close();
  });

  it("trackingNumber (barcode) ve referenceId ile de eslesir", async () => {
    const state = makeState();
    const app = await buildApp(state);
    const byBarcode = JSON.stringify({ shipment: { barcode: "TRACK-PRIORITY", shipmentStatusCode: 2 } });
    await post(app, DHL_TOKEN, byBarcode);
    expect(state.shipments[1]!.status).toBe("IN_TRANSIT");
    const byRef = JSON.stringify({ shipment: { referenceId: "ref_1", shipmentStatusCode: 4 } });
    await post(app, DHL_TOKEN, byRef);
    expect(state.shipments[0]!.status).toBe("OUT_FOR_DELIVERY");
    await app.close();
  });

  it("teslim kaniti olmadan DELIVERED'a GECMEZ (yalniz metin yeterli degil)", async () => {
    const state = makeState();
    const app = await buildApp(state);
    const body = JSON.stringify({
      shipment: { referenceId: "ref_1", shipmentStatus: "TESLİM EDİLDİ" }, // kod/isDelivered YOK
    });
    const res = await post(app, DHL_TOKEN, body);
    expect(res.json().handled).toBe(true);
    expect(state.shipments[0]!.status).toBe("IN_TRANSIT"); // kanit yok → ilerleme yok
    await app.close();
  });

  it("bilinmeyen statusCode durumu ILERLETMEZ ama audit event kalir", async () => {
    const state = makeState();
    const app = await buildApp(state);
    const body = JSON.stringify({ shipment: { referenceId: "ref_1", shipmentStatusCode: 99 } });
    const res = await post(app, DHL_TOKEN, body);
    expect(res.json().handled).toBe(true);
    expect(state.shipments[0]!.status).toBe("IN_TRANSIT");
    expect(state.appliedEvents).toHaveLength(1);
    await app.close();
  });

  it("terminal (DELIVERED) gonderi ham webhook ile geri ALINMAZ", async () => {
    const state = makeState();
    const app = await buildApp(state);
    const body = JSON.stringify({ shipment: { referenceId: "ref_done", shipmentStatusCode: 2 } });
    await post(app, DHL_TOKEN, body);
    expect(state.shipments[2]!.status).toBe("DELIVERED");
    await app.close();
  });

  it("ayni ham payload'in tekrar teslimati idempotenttir (nrm anahtari)", async () => {
    const state = makeState();
    const app = await buildApp(state);
    const body = JSON.stringify({ shipment: { referenceId: "ref_1", shipmentStatusCode: 4 } });
    const first = await post(app, DHL_TOKEN, body);
    expect(first.json()).toEqual({ ok: true, duplicate: false, handled: true });
    const second = await post(app, DHL_TOKEN, body);
    expect(second.json()).toEqual({ ok: true, duplicate: true, handled: false });
    expect(state.appliedEvents).toHaveLength(1);
    await app.close();
  });

  it("kumulatif hareket dizisi: yeni hareketler eklenir, tekrarlar dedupe edilir", async () => {
    const state = makeState();
    const app = await buildApp(state);
    const move1 = {
      referenceId: "ref_1",
      eventStatusCode: 2,
      eventStatus: "TRANSFER MERKEZİNDE",
      location: "İstanbul",
      eventDateTime: "03-07-2026 10:00:00",
    };
    const move2 = {
      referenceId: "ref_1",
      eventStatusCode: 4,
      eventStatus: "DAĞITIMDA",
      location: "Kadıköy",
      eventDateTime: "04-07-2026 09:15:00",
    };
    await post(app, DHL_TOKEN, JSON.stringify([move1, move2]));
    expect(state.shipments[0]!.status).toBe("OUT_FOR_DELIVERY");
    // primary=move2, additional=move1.
    expect(state.appliedEvents[0]!.apply!.additionalEvents).toHaveLength(1);

    // Kumulatif liste yeni hareketle buyuyerek TEKRAR gelir (farkli payload → yeni delivery).
    const move3 = {
      referenceId: "ref_1",
      eventStatusCode: 5,
      eventStatus: "TESLİM EDİLDİ",
      location: "Kadıköy",
      eventDateTime: "04-07-2026 14:00:00",
    };
    await post(app, DHL_TOKEN, JSON.stringify([move1, move2, move3]));
    expect(state.appliedEvents).toHaveLength(2);
    // move1 timeline'da VARDI → dedupe; yalniz move2 additional olarak filtrelenmisti,
    // bu turda additional adaylari move1+move2; ikisi de mevcut → 0 ek hareket.
    expect(state.appliedEvents[1]!.apply!.additionalEvents).toHaveLength(0);
    // eventStatusCode 5 tracking hareketi tek basina DELIVERED KANITI SAYILIR (kod eslemesi).
    expect(state.shipments[0]!.status).toBe("DELIVERED");
    await app.close();
  });

  it("eslesmeyen kimlik gonderi YARATMAZ; IGNORED_UNKNOWN_SHIPMENT kaydi", async () => {
    const state = makeState();
    const app = await buildApp(state);
    const before = state.shipments.length;
    const body = JSON.stringify({ shipment: { referenceId: "ref_yok", shipmentStatusCode: 4 } });
    const res = await post(app, DHL_TOKEN, body);
    expect(res.json()).toEqual({ ok: true, duplicate: false, handled: false });
    expect(state.shipments).toHaveLength(before);
    expect([...state.inbox.values()][0]!.outcome).toBe("IGNORED_UNKNOWN_SHIPMENT");
    await app.close();
  });

  it("taninmayan sekil guvenle IGNORED_UNSUPPORTED olur (mutasyon yok)", async () => {
    const state = makeState();
    const app = await buildApp(state);
    const body = JSON.stringify({ tamamen: "alakasiz", alanlar: [1, 2, 3] });
    const res = await post(app, DHL_TOKEN, body);
    expect(res.statusCode).toBe(200);
    expect(res.json().handled).toBe(false);
    const recorded = [...state.inbox.values()][0]!;
    expect(recorded.outcome).toBe("IGNORED_UNSUPPORTED");
    expect(recorded.statusText).toBe("Sözleşme dışı payload");
    expect(state.shipments[0]!.status).toBe("IN_TRANSIT");
    await app.close();
  });
});

describe("TODO-130 — Geliver ham webhook guvenli unsupported", () => {
  it("Geliver ham payload'i kabul edilir ama islenmez; neden sanitize kaydedilir", async () => {
    const state = makeState();
    const app = await buildApp(state);
    const body = JSON.stringify({ shipmentID: "glv_1", statu: "delivered" });
    const res = await post(app, GELIVER_TOKEN, body);
    expect(res.statusCode).toBe(200);
    expect(res.json().handled).toBe(false);
    const recorded = [...state.inbox.values()][0]!;
    expect(recorded.outcome).toBe("IGNORED_UNSUPPORTED");
    expect(recorded.statusText).toBe("Geliver ham formatı desteklenmiyor (örnek payload gerekli)");
    await app.close();
  });
});

describe("TODO-130 — guvenlik regresyonu", () => {
  it("ham payload yolunda da ACK ic alan/secret/raw tasimaz", async () => {
    const state = makeState();
    const app = await buildApp(state);
    const body = JSON.stringify({
      shipment: { shipmentId: "MNG-777", shipmentStatusCode: 4, aliciAdi: "GİZLİ PII" },
    });
    const res = await post(app, DHL_TOKEN, body);
    expect(Object.keys(res.json()).sort()).toEqual(["duplicate", "handled", "ok"]);
    expect(res.body).not.toContain(WEBHOOK_SECRET);
    expect(res.body).not.toContain("MNG-777");
    expect(res.body).not.toContain("GİZLİ PII");
    // Inbox'a da raw payload/PII gecmez (yalniz sanitize kod/metin alanlari).
    const recorded = [...state.inbox.values()][0]!;
    expect(JSON.stringify(recorded)).not.toContain("GİZLİ PII");
    await app.close();
  });

  it("imzasiz ham payload islenmez (adapter imza SONRASI calisir)", async () => {
    const state = makeState();
    const app = await buildApp(state);
    const body = JSON.stringify({ shipment: { shipmentId: "MNG-777", shipmentStatusCode: 5 } });
    const res = await app.inject({
      method: "POST",
      url: `/public/shipping/webhooks/${DHL_TOKEN}`,
      headers: { "content-type": "application/json" },
      payload: body,
    });
    expect(res.statusCode).toBe(401);
    expect(state.inbox.size).toBe(0);
    expect(state.shipments[0]!.status).toBe("IN_TRANSIT");
    await app.close();
  });
});
