import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "@commerce-os/config";

/**
 * TODO-128 — Webhook yönetim/gözlem admin ucu (GET .../webhook). Testler: mağaza/provider
 * SCOPING, güvenli DTO allowlist'i (payloadHash/raw/imza/secret DÖNMEZ), public base URL
 * durumuna göre webhookUrl üretimi, yetkisiz erişim reddi ve 404 kapsamı.
 */

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    shippingProviderConfig: { findFirst: vi.fn() },
    shipmentWebhookInbox: { findMany: vi.fn() },
  },
}));

vi.mock("@commerce-os/db", () => ({ prisma: prismaMock }));

const { registerShippingAdminRoutes } = await import("../src/shipping/routes.js");

const BASE_CONFIG = {
  DHL_ECOMMERCE_ALLOW_ORDER_CREATE: false,
  DHL_ECOMMERCE_ALLOW_BARCODE_CREATE: false,
  GELIVER_ALLOW_LABEL_PURCHASE: false,
  DHL_ECOMMERCE_ALLOW_CANCEL: false,
  SHIPPING_SANDBOX_HTTP_ENABLED: false,
  DHL_ECOMMERCE_HTTP_TIMEOUT_MS: 1000,
  DHL_ECOMMERCE_LIVE_BASE_URL: "https://live.example",
  SHIPPING_ENCRYPTION_KEY: "a".repeat(64),
} as unknown as AppConfig;

function buildApp(opts?: { baseUrl?: string; authorized?: boolean }) {
  const config = { ...BASE_CONFIG, PUBLIC_WEBHOOK_BASE_URL: opts?.baseUrl } as unknown as AppConfig;
  const app = Fastify();
  registerShippingAdminRoutes(app, {
    config,
    requireStoreAdmin: async (_req, reply) => {
      if (opts?.authorized === false) {
        reply.code(403).send({ error: { code: "FORBIDDEN", message: "no" } });
        return null;
      }
      return { actorUserId: "u1" };
    },
    recordAudit: async () => {},
  });
  return app;
}

function providerConfig() {
  return {
    id: "spc_1",
    storeId: "s1",
    provider: "DHL_ECOMMERCE",
    status: "ENABLED",
    webhookToken: "whk_super_secret_token_value",
    webhookSecretCipher: "v1:gcm:aaa:bbb:ccc",
    credentials: [],
  };
}

function inboxRow() {
  return {
    id: "wbi_1",
    storeId: "s1",
    providerConfigId: "spc_1",
    provider: "DHL_ECOMMERCE",
    eventKey: "evt:abc-123",
    payloadHash: "deadbeefdeadbeefdeadbeef",
    outcome: "ACCEPTED",
    shipmentId: "shp_1",
    statusCode: 5,
    statusText: "Teslim edildi",
    createdAt: new Date("2026-07-03T10:00:00.000Z"),
  };
}

beforeEach(() => {
  prismaMock.shippingProviderConfig.findFirst.mockReset();
  prismaMock.shipmentWebhookInbox.findMany.mockReset();
});

afterEach(() => vi.clearAllMocks());

describe("TODO-128 — webhook info endpoint", () => {
  it("returns full webhook URL when base URL configured + token present, with safe events", async () => {
    prismaMock.shippingProviderConfig.findFirst.mockResolvedValue(providerConfig());
    prismaMock.shipmentWebhookInbox.findMany.mockResolvedValue([inboxRow()]);
    const app = buildApp({ baseUrl: "https://api.example.com" });

    const res = await app.inject({ method: "GET", url: "/stores/s1/shipping/providers/spc_1/webhook" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.webhookConfigured).toBe(true);
    expect(body.webhookBaseUrlConfigured).toBe(true);
    expect(body.webhookUrl).toBe("https://api.example.com/public/shipping/webhooks/whk_super_secret_token_value");
    expect(body.events).toHaveLength(1);
    const evt = body.events[0];
    expect(evt).toMatchObject({
      id: "wbi_1",
      provider: "DHL_ECOMMERCE",
      eventKey: "evt:abc-123",
      outcome: "ACCEPTED",
      shipmentId: "shp_1",
      statusCode: 5,
      statusText: "Teslim edildi",
      receivedAt: "2026-07-03T10:00:00.000Z",
    });
  });

  it("does NOT expose payloadHash, secret cipher, or webhook token in event/info DTO", async () => {
    prismaMock.shippingProviderConfig.findFirst.mockResolvedValue(providerConfig());
    prismaMock.shipmentWebhookInbox.findMany.mockResolvedValue([inboxRow()]);
    const app = buildApp({ baseUrl: "https://api.example.com" });

    const res = await app.inject({ method: "GET", url: "/stores/s1/shipping/providers/spc_1/webhook" });
    const raw = res.body;
    expect(raw).not.toContain("payloadHash");
    expect(raw).not.toContain("deadbeef");
    expect(raw).not.toContain("webhookSecretCipher");
    expect(raw).not.toContain("v1:gcm");
    // Token yalnızca URL içinde beklenir (yetkili tekil uç); ham "webhookToken" alanı DÖNMEZ.
    expect(raw).not.toContain("webhookToken");
  });

  it("returns webhookUrl null + warning flag when public base URL is not configured", async () => {
    prismaMock.shippingProviderConfig.findFirst.mockResolvedValue(providerConfig());
    prismaMock.shipmentWebhookInbox.findMany.mockResolvedValue([]);
    const app = buildApp({ baseUrl: undefined });

    const res = await app.inject({ method: "GET", url: "/stores/s1/shipping/providers/spc_1/webhook" });
    const body = res.json();
    expect(body.webhookUrl).toBeNull();
    expect(body.webhookBaseUrlConfigured).toBe(false);
    expect(body.webhookConfigured).toBe(true);
  });

  it("scopes inbox query by storeId + providerConfigId with default limit 20", async () => {
    prismaMock.shippingProviderConfig.findFirst.mockResolvedValue(providerConfig());
    prismaMock.shipmentWebhookInbox.findMany.mockResolvedValue([]);
    const app = buildApp({ baseUrl: "https://api.example.com" });

    await app.inject({ method: "GET", url: "/stores/s1/shipping/providers/spc_1/webhook" });
    expect(prismaMock.shipmentWebhookInbox.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { storeId: "s1", providerConfigId: "spc_1" },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    );
    // Provider config'i de mağazaya scoped yüklenir.
    expect(prismaMock.shippingProviderConfig.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "spc_1", storeId: "s1" } }),
    );
  });

  it("rejects an over-limit query (max 50) instead of running an unbounded scan", async () => {
    prismaMock.shippingProviderConfig.findFirst.mockResolvedValue(providerConfig());
    prismaMock.shipmentWebhookInbox.findMany.mockResolvedValue([]);
    const app = buildApp({ baseUrl: "https://api.example.com" });

    // limit=999 şema doğrulamasını (max 50) aşar → istek reddedilir; büyük tarama YAPILMAZ.
    // İzole Fastify app'inde ZodError 500; gerçek gateway global handler'da 400. Her ikisi de >=400.
    const res = await app.inject({ method: "GET", url: "/stores/s1/shipping/providers/spc_1/webhook?limit=999" });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(prismaMock.shipmentWebhookInbox.findMany).not.toHaveBeenCalled();
  });

  it("accepts a valid limit query and forwards it to the scoped inbox scan", async () => {
    prismaMock.shippingProviderConfig.findFirst.mockResolvedValue(providerConfig());
    prismaMock.shipmentWebhookInbox.findMany.mockResolvedValue([]);
    const app = buildApp({ baseUrl: "https://api.example.com" });

    const res = await app.inject({ method: "GET", url: "/stores/s1/shipping/providers/spc_1/webhook?limit=5" });
    expect(res.statusCode).toBe(200);
    expect(prismaMock.shipmentWebhookInbox.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 5 }));
  });

  it("returns 404 when provider config not found for store (cross-store isolation)", async () => {
    prismaMock.shippingProviderConfig.findFirst.mockResolvedValue(null);
    const app = buildApp({ baseUrl: "https://api.example.com" });

    const res = await app.inject({ method: "GET", url: "/stores/s1/shipping/providers/spc_other/webhook" });
    expect(res.statusCode).toBe(404);
    expect(prismaMock.shipmentWebhookInbox.findMany).not.toHaveBeenCalled();
  });

  it("rejects unauthorized access (requireStoreAdmin denies)", async () => {
    const app = buildApp({ authorized: false });
    const res = await app.inject({ method: "GET", url: "/stores/s1/shipping/providers/spc_1/webhook" });
    expect(res.statusCode).toBe(403);
    expect(prismaMock.shippingProviderConfig.findFirst).not.toHaveBeenCalled();
  });
});
