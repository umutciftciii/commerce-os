/**
 * TODO-174A (ADR-279) — Storefront sipariş deneyimi değerlendirme uçları.
 * `/public/stores/:slug/customer/order-experience` (uygunluk listesi) +
 * `/public/stores/:slug/customer/orders/:orderNumber/order-experience` (oluştur).
 * Auth: requireStore + requireCustomer (x-customer-session). Ownership + eligibility SUNUCU-otoriter
 * (fail-closed). ÜRÜN review/aggregate akışına DOKUNMAZ.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "@commerce-os/config";
import {
  customerCreditBalanceResponseSchema,
  orderExperienceListResponseSchema,
  orderExperienceReviewCreateSchema,
  orderExperienceReviewResponseSchema,
} from "@commerce-os/contracts";
import { prisma } from "@commerce-os/db";
import { minorToCanonicalString } from "@commerce-os/utils";
import type { CustomerAuthRecord, CustomerDataAccess } from "../customers/index.js";
import { resolveCustomerFromRequest } from "../customers/index.js";
import { getCustomerBalance } from "../customer-credit/service.js";
import {
  createOrderExperienceReview,
  findOrderExperienceReview,
  listOrderExperienceEligibility,
  resolveOrderForExperience,
  sanitizeExperienceComment,
} from "./service.js";

const STOREFRONT_CREDIT_CURRENCY = "TRY";

export interface OrderExperienceRoutesDeps {
  config: AppConfig;
  customers: CustomerDataAccess;
  resolvePublicStore: (slug: string) => Promise<{ id: string; slug: string } | null>;
}

function errorBody(code: string, message: string) {
  return { error: { code, message } };
}

export function registerOrderExperienceRoutes(
  app: FastifyInstance,
  deps: OrderExperienceRoutesDeps,
): void {
  async function requireStore(request: FastifyRequest, reply: FastifyReply) {
    const slug = (request.params as { storeSlug: string }).storeSlug;
    const store = await deps.resolvePublicStore(slug);
    if (!store) {
      await reply.code(404).send(errorBody("STORE_NOT_FOUND", "Store not found."));
      return null;
    }
    return store;
  }
  async function requireCustomer(
    request: FastifyRequest,
    reply: FastifyReply,
    storeId: string,
  ): Promise<CustomerAuthRecord | null> {
    const customer = await resolveCustomerFromRequest(request, storeId, {
      customers: deps.customers,
      config: deps.config,
    });
    if (!customer) {
      await reply.code(401).send(errorBody("CUSTOMER_UNAUTHORIZED", "Oturum gerekli."));
      return null;
    }
    return customer;
  }

  const base = "/public/stores/:storeSlug/customer";

  // ── Deneyim-değerlendirmesine uygun siparişler + submitted durumu ────────────
  app.get(`${base}/order-experience`, async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const customer = await requireCustomer(request, reply, store.id);
    if (!customer) return;
    const rows = await listOrderExperienceEligibility(store.id, customer.id);
    return orderExperienceListResponseSchema.parse({ data: rows });
  });

  // ── Sipariş deneyimi değerlendirmesi oluştur ─────────────────────────────────
  app.post(`${base}/orders/:orderNumber/order-experience`, async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const customer = await requireCustomer(request, reply, store.id);
    if (!customer) return;
    const { orderNumber } = request.params as { orderNumber: string };
    const body = orderExperienceReviewCreateSchema.parse(request.body);

    // Ownership + eligibility SUNUCU-otoriter (başka müşteri/store/uygun-değil → 404 fail-closed).
    const order = await resolveOrderForExperience(store.id, customer.id, orderNumber);
    if (!order) {
      return reply
        .code(404)
        .send(errorBody("ORDER_EXPERIENCE_NOT_ELIGIBLE", "Bu sipariş için değerlendirme yapılamaz."));
    }
    // Sipariş başına tek değerlendirme (duplicate koruması).
    const existing = await findOrderExperienceReview(store.id, order.id, customer.id);
    if (existing) {
      return reply
        .code(409)
        .send(errorBody("ORDER_EXPERIENCE_ALREADY_EXISTS", "Bu siparişi zaten değerlendirdiniz."));
    }
    const cleanComment = body.comment ? sanitizeExperienceComment(body.comment) : "";
    try {
      const created = await createOrderExperienceReview({
        storeId: store.id,
        orderId: order.id,
        customerId: customer.id,
        rating: body.rating,
        comment: cleanComment.length > 0 ? cleanComment : null,
      });
      return reply.code(201).send(
        orderExperienceReviewResponseSchema.parse({
          review: {
            orderNumber,
            rating: created.rating,
            comment: created.comment,
            createdAt: created.createdAt.toISOString(),
          },
        }),
      );
    } catch (error) {
      // Yarış: aynı sipariş için ikinci istek (idempotent duplicate koruması).
      if (error instanceof Error && "code" in error && (error as { code?: string }).code === "P2002") {
        return reply
          .code(409)
          .send(errorBody("ORDER_EXPERIENCE_ALREADY_EXISTS", "Bu siparişi zaten değerlendirdiniz."));
      }
      throw error;
    }
  });

  // ── TODO-174B (ADR-281) — Müşteri alışveriş bakiyesi + hareket geçmişi (storefront). ──────────
  app.get(`${base}/balance`, async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const customer = await requireCustomer(request, reply, store.id);
    if (!customer) return;
    const view = await getCustomerBalance(store.id, customer.id, STOREFRONT_CREDIT_CURRENCY);
    // orderId → orderNumber (insan-okur; description KEY client'ta lokalize edilir).
    const orderIds = [...new Set(view.entries.map((e) => e.orderId).filter((v): v is string => !!v))];
    const orders = orderIds.length
      ? await prisma.order.findMany({ where: { storeId: store.id, id: { in: orderIds } }, select: { id: true, orderNumber: true } })
      : [];
    const orderNumberById = new Map(orders.map((o) => [o.id, o.orderNumber]));
    return reply.send(
      customerCreditBalanceResponseSchema.parse({
        currency: view.currency,
        availableMinor: minorToCanonicalString(view.availableMinor),
        entries: view.entries.map((e) => ({
          id: e.id,
          type: e.type,
          direction: e.direction,
          amountMinor: minorToCanonicalString(e.amountMinor),
          balanceAfterMinor: minorToCanonicalString(e.balanceAfterMinor),
          currency: e.currency,
          description: e.description,
          orderId: e.orderId,
          orderNumber: e.orderId ? orderNumberById.get(e.orderId) ?? null : null,
          createdAt: e.createdAt.toISOString(),
        })),
      }),
    );
  });
}
