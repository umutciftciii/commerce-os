/**
 * TODO-159F (ADR-095..100) — Order Payment Recovery & Collection.
 *
 * Sağlayıcı tanımlanmadan / ödeme oturumu üretilemeden oluşmuş UNPAID siparişler
 * için güvenli, idempotent tahsilat akışı. Store-admin uçları + opaque token'lı
 * müşteri ödeme sayfası (/pay/:token).
 *
 * Güvenlik:
 *  - Admin uçları requireStoreAdmin (platform admin + store scope) ile korunur;
 *    tüm sorgular {id, storeId} scoped (tenant isolation).
 *  - Tutar OTORİTESİ order snapshot'ıdır (Order.totalAmount − captured). Client
 *    amount/currency/provider reference BELİRLEYEMEZ.
 *  - Public /pay token: opaque, hash'li saklanır, süreli, tek-store, sipariş ID'si
 *    taşımaz. Bilinmeyen/expired token generic hata (order enumeration YOK).
 *  - AuditLog/event metadata'sına secret / token / TAM ödeme URL'i YAZILMAZ.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "@commerce-os/config";
import { prisma } from "@commerce-os/db";
import type {
  PaymentAttempt,
  PaymentMethodType,
  PaymentProviderConfig,
  PaymentProviderMode,
  Prisma,
} from "@prisma/client";
import {
  createPaymentLinkRequestSchema,
  orderPaymentStateResponseSchema,
  paymentLinkResponseSchema,
  publicPayResolveResponseSchema,
  publicPayResultResponseSchema,
  publicPayStartRequestSchema,
  recordManualPaymentRequestSchema,
  sendPaymentLinkEmailRequestSchema,
  sendPaymentLinkEmailResponseSchema,
  type PaymentManualMethod,
} from "@commerce-os/contracts";
import { z } from "zod";
import { resolvePaymentProviders, type ResolvableProviderConfig } from "./resolver.js";
import { createPaymentAdapterRegistry } from "./adapters/registry.js";
import { createDisabledHttpTransport } from "./adapters/http.js";
import { PAYMENT_SCENARIOS, type PaymentScenario } from "./types.js";
import { scenarioFromCardNumber, validateCard } from "./card.js";
import {
  createPaymentAccessToken,
  hashPaymentAccessToken,
  PAYMENT_ACCESS_TOKEN_TTL_SECONDS,
} from "./tokens.js";
import {
  canStartCollection,
  computeRemainingMinor,
  isAttemptActive,
  resolveOrderPaymentTransition,
  sumCapturedMinor,
} from "./payment-state.js";
import type { PaymentNotificationDispatcher } from "./notification.js";

export interface PaymentRecoveryRoutesDeps {
  config: AppConfig;
  requireStoreAdmin: (
    request: FastifyRequest,
    reply: FastifyReply,
    storeId: string,
  ) => Promise<{ actorUserId: string } | null>;
  recordAudit: (input: {
    action: "CREATE" | "UPDATE" | "DELETE";
    platformUserId?: string;
    storeId?: string;
    entityType: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<void>;
  notifications: PaymentNotificationDispatcher;
}

const PAYMENT_LINK_TTL_SECONDS = PAYMENT_ACCESS_TOKEN_TTL_SECONDS; // 30 dk (checkout ile aynı)
const ONLINE_LINK_METHOD: PaymentMethodType = "CARD";

/** Aktif online ödeme bağlantısı için DETERMINISTIK idempotency anahtarı (sipariş başına 1). */
function activeLinkKey(orderId: string): string {
  return `active-link:${orderId}`;
}

/** Manuel yöntem → PaymentMethodType eşlemesi (method NOT NULL; manualMethod otoritedir). */
function manualMethodToPaymentMethod(method: PaymentManualMethod): PaymentMethodType {
  switch (method) {
    case "BANK_TRANSFER":
      return "BANK_TRANSFER";
    case "CASH":
      return "CASH_ON_DELIVERY";
    case "POS":
      return "CARD";
    case "OTHER":
    default:
      return "PAYMENT_LINK";
  }
}

function toResolvable(config: PaymentProviderConfig): ResolvableProviderConfig {
  return {
    id: config.id,
    provider: config.provider,
    status: config.status,
    mode: config.mode,
    priority: config.priority,
    supportedMethods: config.supportedMethods,
    supportedCurrencies: config.supportedCurrencies,
    minAmount: config.minAmount,
    maxAmount: config.maxAmount,
    fallbackEnabled: config.fallbackEnabled,
    createdAt: config.createdAt,
  };
}

const errorBody = (code: string, message: string) => ({ error: { code, message } });

export function registerPaymentRecoveryRoutes(
  app: FastifyInstance,
  deps: PaymentRecoveryRoutesDeps,
): void {
  const { config, requireStoreAdmin, recordAudit, notifications } = deps;
  const isLiveEnv = config.APP_ENV === "production" || config.APP_ENV === "staging";
  const providerMode: PaymentProviderMode = isLiveEnv ? "LIVE" : "TEST";
  // MOCK confirm için transport gerekmez (disabled). Gerçek provider bu fazda canlı çekmez.
  const adapters = createPaymentAdapterRegistry(createDisabledHttpTransport());

  const orderParam = z.object({ storeId: z.string().min(1), orderId: z.string().min(1) });
  const tokenParam = z.object({ token: z.string().min(1) });

  /** Mutlak müşteri ödeme adresi (base varsa), yoksa göreli /pay/:token. */
  function absolutePayUrl(relativePath: string): string {
    const base = config.STOREFRONT_PUBLIC_BASE_URL;
    if (!base) return relativePath;
    return `${base.replace(/\/$/, "")}${relativePath}`;
  }

  /** PaymentAttempt satırını admin ALLOWLIST görünümüne çevirir. */
  function serializeRecoveryAttempt(attempt: PaymentAttempt, now: Date) {
    const active = isAttemptActive(
      { status: attempt.status, expiresAt: attempt.expiresAt },
      now,
    );
    // Ödeme linki YALNIZCA aktif online link'te dışa verilir (terminal/expired'da null).
    const paymentLinkUrl =
      active && attempt.type === "ONLINE" && attempt.paymentUrl
        ? absolutePayUrl(attempt.paymentUrl)
        : null;
    return {
      id: attempt.id,
      type: attempt.type,
      provider: attempt.provider,
      mode: attempt.mode,
      method: attempt.method,
      amount: attempt.amount,
      currency: attempt.currency,
      status: attempt.status,
      threeDsApplied: attempt.threeDsApplied,
      scenario: attempt.scenario ?? null,
      installmentCount: attempt.installmentCount,
      cardBrand: attempt.cardBrand ?? null,
      cardLast4: attempt.cardLast4 ?? null,
      providerReference: attempt.providerReference ?? null,
      failureCode: attempt.failureCode ?? null,
      failureMessage: attempt.failureMessage ?? null,
      paidAt: attempt.paidAt?.toISOString() ?? null,
      failedAt: attempt.failedAt?.toISOString() ?? null,
      expiresAt: attempt.expiresAt?.toISOString() ?? null,
      hasActiveLink: active && attempt.type === "ONLINE" && !!attempt.paymentUrl,
      manualMethod: attempt.manualMethod ?? null,
      manualReference: attempt.manualReference ?? null,
      manualNote: attempt.manualNote ?? null,
      collectedAt: attempt.collectedAt?.toISOString() ?? null,
      createdAt: attempt.createdAt.toISOString(),
      updatedAt: attempt.updatedAt.toISOString(),
      paymentLinkUrl,
      initiatedBy: attempt.initiatedBy ?? null,
    };
  }

  async function loadOrder(storeId: string, orderId: string) {
    return prisma.order.findFirst({ where: { id: orderId, storeId } });
  }

  async function loadAttempts(storeId: string, orderId: string): Promise<PaymentAttempt[]> {
    return prisma.paymentAttempt.findMany({
      where: { storeId, orderId },
      orderBy: { createdAt: "asc" },
    });
  }

  /** Store'un ENABLED + (amount/currency/method/mode uygun) sağlayıcı adaylarını çözer. */
  async function resolveProviderOptions(storeId: string, amountMinor: number, currency: string) {
    const configs = await prisma.paymentProviderConfig.findMany({ where: { storeId } });
    const anyEnabled = configs.some((c) => c.status === "ENABLED");
    const resolved = resolvePaymentProviders(configs.map(toResolvable), {
      currency,
      amount: amountMinor,
      method: ONLINE_LINK_METHOD,
      mode: providerMode,
      isLiveEnv,
    });
    // MOCK'u öne al (test akışını yalnız MOCK tamamlar; gerçek provider kontrollü hata).
    const ordered = [
      ...resolved.filter((c) => c.provider === "MOCK"),
      ...resolved.filter((c) => c.provider !== "MOCK"),
    ];
    const byId = new Map(configs.map((c) => [c.id, c]));
    const options = ordered
      .map((r) => byId.get(r.id))
      .filter((c): c is PaymentProviderConfig => !!c)
      .map((c) => ({
        providerConfigId: c.id,
        provider: c.provider,
        displayName: c.displayName,
        mode: c.mode,
        supportedMethods: c.supportedMethods,
        installmentEnabled: c.installmentEnabled,
      }));
    return { anyEnabled, options, configs };
  }

  async function writeOrderEvent(
    tx: Prisma.TransactionClient,
    input: {
      storeId: string;
      orderId: string;
      type: string;
      message: string;
      actorUserId?: string | null;
      metadata?: Record<string, unknown>;
    },
  ) {
    await tx.orderEvent.create({
      data: {
        storeId: input.storeId,
        orderId: input.orderId,
        type: input.type,
        message: input.message,
        actorUserId: input.actorUserId ?? null,
        metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  /* ─────────────────────────── Admin: ödeme durumu ─────────────────────────── */

  app.get("/stores/:storeId/orders/:orderId/payment", async (request, reply) => {
    const params = orderParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const order = await loadOrder(params.storeId, params.orderId);
    if (!order) return reply.code(404).send(errorBody("ORDER_NOT_FOUND", "Order not found."));

    const now = new Date();
    const attempts = await loadAttempts(params.storeId, params.orderId);
    const capturedMinor = sumCapturedMinor(attempts);
    const remainingMinor = computeRemainingMinor(order.totalAmount, capturedMinor);
    const collectible = canStartCollection(order.paymentStatus) && remainingMinor > 0;
    const { anyEnabled, options } = await resolveProviderOptions(
      params.storeId,
      remainingMinor > 0 ? remainingMinor : order.totalAmount,
      order.currency,
    );
    const activeAttempt =
      attempts
        .filter((a) => isAttemptActive({ status: a.status, expiresAt: a.expiresAt }, now))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;

    return orderPaymentStateResponseSchema.parse({
      orderId: order.id,
      orderNumber: order.orderNumber,
      currency: order.currency,
      paymentStatus: order.paymentStatus,
      payableMinor: order.totalAmount,
      capturedMinor,
      remainingMinor,
      canStartCollection: collectible,
      providersConfigured: anyEnabled,
      emailDeliveryConfigured: notifications.isConfigured,
      availableProviders: collectible ? options : [],
      manualMethods: ["BANK_TRANSFER", "CASH", "POS", "OTHER"],
      activeAttempt: activeAttempt ? serializeRecoveryAttempt(activeAttempt, now) : null,
      // en güncel önce
      attempts: [...attempts]
        .reverse()
        .map((a) => serializeRecoveryAttempt(a, now)),
    });
  });

  /* ──────────────── Admin: ödeme bağlantısı oluştur / yenile ──────────────── */

  async function createLink(
    storeId: string,
    orderId: string,
    actorUserId: string,
    providerConfigId: string | undefined,
    regenerate: boolean,
    reply: FastifyReply,
  ) {
    const order = await loadOrder(storeId, orderId);
    if (!order) return reply.code(404).send(errorBody("ORDER_NOT_FOUND", "Order not found."));
    if (!canStartCollection(order.paymentStatus)) {
      return reply
        .code(409)
        .send(errorBody("PAYMENT_NOT_COLLECTIBLE", "Bu sipariş için yeni tahsilat başlatılamaz."));
    }
    const attempts = await loadAttempts(storeId, orderId);
    const capturedMinor = sumCapturedMinor(attempts);
    const remainingMinor = computeRemainingMinor(order.totalAmount, capturedMinor);
    if (remainingMinor <= 0) {
      return reply.code(409).send(errorBody("PAYMENT_ALREADY_SETTLED", "Kalan bakiye yok."));
    }

    // Sağlayıcı seç: verilen configId varsa doğrula, yoksa çöz.
    const { anyEnabled, options, configs } = await resolveProviderOptions(
      storeId,
      remainingMinor,
      order.currency,
    );
    if (!anyEnabled) {
      return reply
        .code(409)
        .send(
          errorBody(
            "PAYMENT_NO_PROVIDER",
            "Bu sipariş için ödeme başlatabilmek üzere aktif bir ödeme sağlayıcısı tanımlayın.",
          ),
        );
    }
    let chosen = options[0] ?? null;
    if (providerConfigId) {
      const match = options.find((o) => o.providerConfigId === providerConfigId);
      if (!match) {
        // İstenen provider yok / uygun değil (inactive / cross-store / unsupported currency).
        const owned = configs.find((c) => c.id === providerConfigId);
        const code = !owned
          ? "PAYMENT_PROVIDER_NOT_FOUND"
          : "PAYMENT_PROVIDER_NOT_ELIGIBLE";
        return reply
          .code(owned ? 409 : 404)
          .send(errorBody(code, "Seçilen ödeme sağlayıcısı bu sipariş için uygun değil."));
      }
      chosen = match;
    }
    if (!chosen) {
      return reply
        .code(409)
        .send(
          errorBody(
            "PAYMENT_NO_ELIGIBLE_PROVIDER",
            "Sipariş tutarı/para birimi için uygun aktif sağlayıcı yok.",
          ),
        );
    }

    const now = new Date();
    const token = createPaymentAccessToken(config.SESSION_SECRET, PAYMENT_LINK_TTL_SECONDS, now);
    const relativePath = `/pay/${token.token}`;
    const chosenId = chosen.providerConfigId;
    const chosenProvider = chosen.provider;

    try {
      const result = await prisma.$transaction(async (tx) => {
        // Yenile: mevcut aktif link'i iptal et (geçmişi SİLME) + idempotency anahtarını serbest bırak.
        if (regenerate) {
          await tx.paymentAttempt.updateMany({
            where: { storeId, orderId, idempotencyKey: activeLinkKey(orderId) },
            data: {
              status: "CANCELLED",
              idempotencyKey: null,
              accessTokenHash: null,
              accessTokenExpiresAt: null,
              expiresAt: now,
            },
          });
        }
        const attempt = await tx.paymentAttempt.create({
          data: {
            storeId,
            orderId,
            type: "ONLINE",
            providerConfigId: chosenId,
            provider: chosenProvider,
            mode: providerMode,
            method: ONLINE_LINK_METHOD,
            amount: remainingMinor,
            currency: order.currency,
            status: "CREATED",
            idempotencyKey: activeLinkKey(orderId),
            accessTokenHash: token.tokenHash,
            accessTokenExpiresAt: token.expiresAt,
            expiresAt: token.expiresAt,
            paymentUrl: relativePath,
            initiatedBy: actorUserId,
          },
        });
        // Sipariş durumunu PAYMENT_PENDING'e taşı (monotonic; terminal-paid'i bozmaz).
        const next = resolveOrderPaymentTransition(order.paymentStatus, "CREATED");
        if (next && next !== order.paymentStatus) {
          await tx.order.update({ where: { id: orderId }, data: { paymentStatus: next } });
        }
        await tx.paymentProviderEvent.create({
          data: {
            storeId,
            providerConfigId: chosenId,
            attemptId: attempt.id,
            orderId,
            provider: chosenProvider,
            type: regenerate ? "PAYMENT_LINK_REGENERATED" : "PAYMENT_LINK_CREATED",
            message: regenerate ? "Payment link regenerated." : "Payment link created.",
            // Token/URL METADATA'ya YAZILMAZ.
            metadata: { amountMinor: remainingMinor, provider: chosenProvider },
          },
        });
        await writeOrderEvent(tx, {
          storeId,
          orderId,
          type: regenerate ? "PAYMENT_LINK_REGENERATED" : "PAYMENT_LINK_CREATED",
          message: regenerate ? "Ödeme bağlantısı yenilendi." : "Ödeme bağlantısı oluşturuldu.",
          actorUserId,
          metadata: { attemptId: attempt.id, provider: chosenProvider, amountMinor: remainingMinor },
        });
        return attempt;
      });

      await recordAudit({
        action: regenerate ? "UPDATE" : "CREATE",
        platformUserId: actorUserId,
        storeId,
        entityType: "PaymentAttempt",
        entityId: result.id,
        metadata: { action: regenerate ? "regenerate-link" : "create-link", provider: chosenProvider },
      });

      const serialized = serializeRecoveryAttempt(result, now);
      return reply.code(regenerate ? 200 : 201).send(
        paymentLinkResponseSchema.parse({
          attempt: serialized,
          paymentLinkUrl: absolutePayUrl(relativePath),
          paymentPath: relativePath,
          expiresAt: token.expiresAt.toISOString(),
        }),
      );
    } catch (err) {
      // Idempotency: eşzamanlı ikinci "oluştur" isteği unique(storeId, idempotencyKey)'e
      // takılır (P2002) → mevcut aktif link'i döndür (tek aktif attempt garantisi).
      if (
        !regenerate &&
        typeof err === "object" &&
        err !== null &&
        (err as { code?: string }).code === "P2002"
      ) {
        const existing = await prisma.paymentAttempt.findFirst({
          where: { storeId, orderId, idempotencyKey: activeLinkKey(orderId) },
        });
        if (existing) {
          const serialized = serializeRecoveryAttempt(existing, now);
          return reply.code(200).send(
            paymentLinkResponseSchema.parse({
              attempt: serialized,
              // Mevcut link'in plain token'i elde YOK → paymentUrl (saklı /pay/:token) kullanılır.
              paymentLinkUrl: existing.paymentUrl
                ? absolutePayUrl(existing.paymentUrl)
                : absolutePayUrl(relativePath),
              paymentPath: existing.paymentUrl ?? relativePath,
              expiresAt: (existing.expiresAt ?? token.expiresAt).toISOString(),
            }),
          );
        }
      }
      throw err;
    }
  }

  app.post("/stores/:storeId/orders/:orderId/payment-link", async (request, reply) => {
    const params = orderParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const body = createPaymentLinkRequestSchema.parse(request.body ?? {});
    return createLink(params.storeId, params.orderId, access.actorUserId, body.providerConfigId, false, reply);
  });

  app.post("/stores/:storeId/orders/:orderId/payment-link/regenerate", async (request, reply) => {
    const params = orderParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const body = createPaymentLinkRequestSchema.parse(request.body ?? {});
    return createLink(params.storeId, params.orderId, access.actorUserId, body.providerConfigId, true, reply);
  });

  /* ─────────────────── Admin: ödeme bağlantısını e-postala ─────────────────── */

  app.post("/stores/:storeId/orders/:orderId/payment-link/email", async (request, reply) => {
    const params = orderParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    // TD-110 — GERÇEK e-posta teslimatı yapılandırılmamışsa SAHTE başarı ÜRETİLMEZ.
    // Uç 501 döner; hiçbir attempt/olay mutasyonu yapılmaz. UI bu aksiyonu zaten
    // aktif göstermez (emailDeliveryConfigured=false) — bu sunucu-tarafı guard'dır.
    if (!notifications.isConfigured) {
      return reply
        .code(501)
        .send(
          errorBody(
            "PAYMENT_EMAIL_NOT_CONFIGURED",
            "E-posta teslimatı henüz yapılandırılmadı. Bağlantıyı kopyalayarak müşteriye iletebilirsiniz.",
          ),
        );
    }
    const body = sendPaymentLinkEmailRequestSchema.parse(request.body ?? {});
    const order = await loadOrder(params.storeId, params.orderId);
    if (!order) return reply.code(404).send(errorBody("ORDER_NOT_FOUND", "Order not found."));
    const now = new Date();
    const attempts = await loadAttempts(params.storeId, params.orderId);
    const active = attempts.find(
      (a) =>
        a.type === "ONLINE" &&
        a.paymentUrl &&
        isAttemptActive({ status: a.status, expiresAt: a.expiresAt }, now),
    );
    if (!active || !active.paymentUrl) {
      return reply
        .code(409)
        .send(errorBody("PAYMENT_NO_ACTIVE_LINK", "Gönderilecek aktif ödeme bağlantısı yok."));
    }
    const recipientEmail = body.email ?? order.customerEmail;

    // Gerçek provider teslimatı — sonuç SENT/FAILED. Başarısızlık payment attempt'i BOZMAZ.
    let delivery: "QUEUED" | "SENDING" | "SENT" | "FAILED";
    try {
      const result = await notifications.sendPaymentLinkEmail({
        storeId: params.storeId,
        orderId: order.id,
        orderNumber: order.orderNumber,
        recipientEmail,
        paymentLinkUrl: absolutePayUrl(active.paymentUrl),
        amountMinor: active.amount,
        currency: active.currency,
      });
      delivery = result.delivery;
    } catch {
      delivery = "FAILED";
    }
    const sent = delivery === "SENT";

    await prisma.$transaction(async (tx) => {
      await tx.paymentProviderEvent.create({
        data: {
          storeId: params.storeId,
          providerConfigId: active.providerConfigId,
          attemptId: active.id,
          orderId: order.id,
          provider: active.provider ?? "MOCK",
          type: "PAYMENT_LINK_EMAILED",
          message: `Payment link email ${delivery.toLowerCase()}.`,
          // Alıcı e-posta metadata'da; TAM URL / token YAZILMAZ.
          metadata: { delivery, recipientEmail },
        },
      });
      await writeOrderEvent(tx, {
        storeId: params.storeId,
        orderId: order.id,
        type: "PAYMENT_LINK_EMAILED",
        message: `Ödeme bağlantısı e-postalandı (${delivery.toLowerCase()}).`,
        actorUserId: access.actorUserId,
        metadata: { attemptId: active.id, delivery, recipientEmail },
      });
    });
    await recordAudit({
      action: "UPDATE",
      platformUserId: access.actorUserId,
      storeId: params.storeId,
      entityType: "PaymentAttempt",
      entityId: active.id,
      metadata: { action: "email-link", delivery, recipientEmail },
    });

    return sendPaymentLinkEmailResponseSchema.parse({
      sent,
      delivery,
      recipientEmail,
      attempt: serializeRecoveryAttempt(active, now),
    });
  });

  /* ──────────────────────── Admin: manuel ödeme kaydet ─────────────────────── */

  app.post("/stores/:storeId/orders/:orderId/manual-payment", async (request, reply) => {
    const params = orderParam.parse(request.params);
    const access = await requireStoreAdmin(request, reply, params.storeId);
    if (!access) return;
    const body = recordManualPaymentRequestSchema.parse(request.body);
    const order = await loadOrder(params.storeId, params.orderId);
    if (!order) return reply.code(404).send(errorBody("ORDER_NOT_FOUND", "Order not found."));
    if (!canStartCollection(order.paymentStatus)) {
      return reply
        .code(409)
        .send(errorBody("PAYMENT_NOT_COLLECTIBLE", "Bu sipariş için tahsilat kaydedilemez."));
    }
    // SUNUCU-otoriter: para birimi sipariş ile eşleşmeli (client belirleyemez).
    if (body.currency !== order.currency) {
      return reply
        .code(400)
        .send(errorBody("PAYMENT_CURRENCY_MISMATCH", "Para birimi sipariş ile uyuşmuyor."));
    }
    const now = new Date();
    const attempts = await loadAttempts(params.storeId, params.orderId);
    const capturedMinor = sumCapturedMinor(attempts);
    const remainingMinor = computeRemainingMinor(order.totalAmount, capturedMinor);
    if (remainingMinor <= 0) {
      return reply.code(409).send(errorBody("PAYMENT_ALREADY_SETTLED", "Kalan bakiye yok."));
    }
    if (body.amountMinor > remainingMinor) {
      return reply
        .code(422)
        .send(errorBody("PAYMENT_OVERPAYMENT", "Tahsilat kalan bakiyeden fazla olamaz."));
    }
    // MVP: kısmi tahsilat desteklenmiyor → tam tahsilat şart (spec §3).
    if (body.amountMinor < remainingMinor) {
      return reply
        .code(422)
        .send(errorBody("PAYMENT_PARTIAL_NOT_SUPPORTED", "Kısmi manuel tahsilat bu sürümde desteklenmiyor."));
    }
    const collectedAt = body.collectedAt ? new Date(body.collectedAt) : now;

    const created = await prisma.$transaction(async (tx) => {
      // Çift tahsilat yarışını önle: aktif online link'i iptal et + anahtarı serbest bırak.
      await tx.paymentAttempt.updateMany({
        where: { storeId: params.storeId, orderId: order.id, idempotencyKey: activeLinkKey(order.id) },
        data: {
          status: "CANCELLED",
          idempotencyKey: null,
          accessTokenHash: null,
          accessTokenExpiresAt: null,
          expiresAt: now,
        },
      });
      const attempt = await tx.paymentAttempt.create({
        data: {
          storeId: params.storeId,
          orderId: order.id,
          type: "MANUAL",
          providerConfigId: null,
          provider: null,
          mode: null,
          method: manualMethodToPaymentMethod(body.method),
          amount: body.amountMinor,
          currency: order.currency,
          status: "PAID",
          paidAt: now,
          collectedAt,
          manualMethod: body.method,
          manualReference: body.reference ?? null,
          manualNote: body.note ?? null,
          initiatedBy: access.actorUserId,
        },
      });
      const next = resolveOrderPaymentTransition(order.paymentStatus, "PAID");
      if (next && next !== order.paymentStatus) {
        await tx.order.update({ where: { id: order.id }, data: { paymentStatus: next } });
      }
      // Manuel ödeme provider event akışına YAZILMAZ (webhook gibi gösterilmez); yalnız timeline.
      await writeOrderEvent(tx, {
        storeId: params.storeId,
        orderId: order.id,
        type: "MANUAL_PAYMENT_RECORDED",
        message: `Manuel ödeme kaydedildi (${body.method}).`,
        actorUserId: access.actorUserId,
        metadata: {
          attemptId: attempt.id,
          method: body.method,
          amountMinor: body.amountMinor,
          reference: body.reference ?? null,
        },
      });
      return attempt;
    });

    await recordAudit({
      action: "CREATE",
      platformUserId: access.actorUserId,
      storeId: params.storeId,
      entityType: "PaymentAttempt",
      entityId: created.id,
      metadata: {
        action: "manual-payment",
        method: body.method,
        amountMinor: body.amountMinor,
        reference: body.reference ?? null,
      },
    });

    return reply.code(201).send(serializeRecoveryAttempt(created, now));
  });

  /* ─────────────── Public müşteri ödeme sayfası (/pay/:token) ─────────────── */

  /** Token → attempt (hash lookup + timing-safe verify). Bulunamaz/expired → generic 404/410. */
  async function resolvePublicAttempt(token: string) {
    const tokenHash = hashPaymentAccessToken(token, config.SESSION_SECRET);
    const attempt = await prisma.paymentAttempt.findFirst({ where: { accessTokenHash: tokenHash } });
    if (!attempt) return { attempt: null as PaymentAttempt | null, expired: false };
    const expired =
      !attempt.accessTokenExpiresAt || attempt.accessTokenExpiresAt.getTime() <= Date.now();
    return { attempt, expired };
  }

  app.get("/public/pay/:token", async (request, reply) => {
    const params = tokenParam.parse(request.params);
    const { attempt, expired } = await resolvePublicAttempt(params.token);
    if (!attempt) {
      return reply.code(404).send(errorBody("PAYMENT_LINK_INVALID", "Ödeme bağlantısı geçersiz."));
    }
    const order = await prisma.order.findFirst({
      where: { id: attempt.orderId, storeId: attempt.storeId },
    });
    const store = await prisma.store.findFirst({ where: { id: attempt.storeId } });
    if (!order || !store) {
      return reply.code(404).send(errorBody("PAYMENT_LINK_INVALID", "Ödeme bağlantısı geçersiz."));
    }
    const collectible = canStartCollection(order.paymentStatus);
    const payable = collectible && !expired && attempt.type === "ONLINE";
    return publicPayResolveResponseSchema.parse({
      orderNumber: order.orderNumber,
      storeName: store.name,
      currency: order.currency,
      amountMinor: attempt.amount,
      paymentStatus: order.paymentStatus,
      provider: attempt.provider,
      mode: attempt.mode,
      method: attempt.method,
      expiresAt: attempt.expiresAt?.toISOString() ?? null,
      payable,
      sandbox: attempt.provider === "MOCK",
      scenarios: [...PAYMENT_SCENARIOS],
    });
  });

  app.post("/public/pay/:token", async (request, reply) => {
    const params = tokenParam.parse(request.params);
    const body = publicPayStartRequestSchema.parse(request.body ?? {});
    const { attempt, expired } = await resolvePublicAttempt(params.token);
    if (!attempt) {
      return reply.code(404).send(errorBody("PAYMENT_LINK_INVALID", "Ödeme bağlantısı geçersiz."));
    }
    if (expired) {
      return reply.code(410).send(errorBody("PAYMENT_LINK_EXPIRED", "Ödeme bağlantısının süresi doldu."));
    }
    const order = await prisma.order.findFirst({
      where: { id: attempt.orderId, storeId: attempt.storeId },
    });
    if (!order) {
      return reply.code(404).send(errorBody("PAYMENT_LINK_INVALID", "Ödeme bağlantısı geçersiz."));
    }
    if (!canStartCollection(order.paymentStatus)) {
      return reply.code(409).send(errorBody("PAYMENT_NOT_PAYABLE", "Sipariş ödeme beklemiyor."));
    }
    // Bu fazda yalnız MOCK sandbox tamamlanabilir; gerçek provider fake success ÜRETMEZ.
    if (attempt.provider !== "MOCK") {
      return reply
        .code(409)
        .send(
          errorBody(
            "PAYMENT_PROVIDER_NOT_CONFIGURED",
            "Bu sağlayıcı için ödeme şu an tamamlanamıyor. Lütfen mağaza ile iletişime geçin.",
          ),
        );
    }

    // Senaryo: kart girildiyse karttan türet (sunucu-otoriter), yoksa gövdeden.
    let scenario: PaymentScenario;
    let cardBrand: string | null = null;
    let cardLast4: string | null = null;
    if (body.card) {
      const validation = validateCard(body.card);
      if (!validation.ok) {
        return reply.code(400).send(errorBody(validation.code, "Kart bilgisi geçersiz."));
      }
      cardBrand = validation.brand;
      cardLast4 = validation.last4;
      scenario = scenarioFromCardNumber(body.card.number);
    } else {
      scenario = (body.scenario ?? "success") as PaymentScenario;
    }

    const adapter = adapters.get("MOCK");
    const result = await adapter.confirmPayment({
      context: {
        provider: "MOCK",
        mode: attempt.mode ?? "TEST",
        threeDsMode: "DISABLED",
        method: attempt.method,
        amount: attempt.amount,
        currency: attempt.currency,
        credentials: { apiKey: null, secretKey: null, webhookSecret: null, merchantId: null },
      },
      attemptId: attempt.id,
      currentStatus: attempt.status,
      scenario,
      ...(body.threeDsAction ? { threeDsOutcome: body.threeDsAction } : {}),
    });

    const now = new Date();
    const paid = result.status === "PAID" || result.status === "AUTHORIZED";
    const orderNext = resolveOrderPaymentTransition(order.paymentStatus, result.status);
    const clearToken = paid || result.status === "FAILED" || result.status === "CANCELLED";

    await prisma.$transaction(async (tx) => {
      await tx.paymentAttempt.update({
        where: { id: attempt.id },
        data: {
          status: result.status,
          threeDsApplied: result.threeDsApplied ?? false,
          scenario,
          providerReference: result.providerReference ?? undefined,
          failureCode: result.failureCode ?? null,
          failureMessage: result.failureMessage ?? null,
          cardBrand,
          cardLast4,
          ...(paid ? { paidAt: now } : {}),
          ...(result.status === "FAILED" || result.status === "CANCELLED" ? { failedAt: now } : {}),
          ...(clearToken
            ? { accessTokenHash: null, accessTokenExpiresAt: null, idempotencyKey: null }
            : {}),
        },
      });
      if (orderNext && orderNext !== order.paymentStatus) {
        await tx.order.update({ where: { id: order.id }, data: { paymentStatus: orderNext } });
      }
      await tx.paymentProviderEvent.create({
        data: {
          storeId: attempt.storeId,
          providerConfigId: attempt.providerConfigId,
          attemptId: attempt.id,
          orderId: order.id,
          provider: "MOCK",
          type:
            result.status === "PAID" || result.status === "AUTHORIZED"
              ? "PAYMENT_CONFIRMED"
              : result.status === "CANCELLED"
                ? "PAYMENT_CANCELLED"
                : result.status === "FAILED"
                  ? "PAYMENT_FAILED"
                  : "STATUS_CHANGED",
          message: `Customer pay page: ${scenario} → ${result.status}.`,
          metadata: { scenario },
        },
      });
      if (paid) {
        await writeOrderEvent(tx, {
          storeId: attempt.storeId,
          orderId: order.id,
          type: "PAYMENT_COMPLETED",
          message: "Ödeme tamamlandı (müşteri ödeme sayfası).",
          metadata: { attemptId: attempt.id },
        });
      }
    });

    return publicPayResultResponseSchema.parse({
      orderNumber: order.orderNumber,
      paymentStatus: orderNext ?? order.paymentStatus,
      status: result.status,
      requiresAction: result.status === "REQUIRES_ACTION",
      failureCode: result.failureCode ?? null,
      failureMessage: result.failureMessage ?? null,
    });
  });
}
