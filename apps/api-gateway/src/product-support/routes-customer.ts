/**
 * TODO-177 (ADR-289) — Ürün Desteği müşteri rotaları (storefront BFF çağırır).
 * `/public/stores/:storeSlug/customer/support/*`. Guard: requireStore + requireCustomer.
 * Tüm order/line context sunucuda (storeId, customerId)'ye karşı re-validate (service katmanı).
 */

import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import sharp from "sharp";
import {
  supportResolveRequestSchema,
  supportResolveResponseSchema,
  supportTicketCreateRequestSchema,
  supportMessageCreateRequestSchema,
  customerSupportTicketListResponseSchema,
  customerSupportTicketDetailResponseSchema,
  customerSupportAttachmentUploadResponseSchema,
} from "@commerce-os/contracts";
import type { AppConfig } from "@commerce-os/config";
import { prisma } from "@commerce-os/db";
import { buildStorageKey } from "../media/storage-key.js";
import type { StorageDriver } from "../media/storage.js";
import { resolveCustomerFromRequest, type CustomerAuthRecord, type CustomerDataAccess } from "../customers/index.js";
import type { SupportNotificationDispatcher } from "./notification.js";
import {
  resolveSupportContext,
  createTicketFromGuidedFlow,
  listCustomerTickets,
  getCustomerTicketDetail,
  addCustomerMessage,
  reopenTicket,
} from "./service.js";

const MAX_ATTACHMENT_BYTES = 5_242_880;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export interface SupportCustomerRoutesDeps {
  config: AppConfig;
  customers: CustomerDataAccess;
  storage: StorageDriver;
  resolvePublicStore: (slug: string) => Promise<{ id: string; slug: string } | null>;
  notifications: SupportNotificationDispatcher;
}

function errorBody(code: string, message: string) {
  return { error: { code, message } };
}

export function registerSupportCustomerRoutes(app: FastifyInstance, deps: SupportCustomerRoutesDeps): void {
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

  const attachmentBaseFor = (storeSlug: string, ticketNumber: string) =>
    `/public/stores/${storeSlug}/customer/support/tickets/${ticketNumber}`;

  // resolve guided context (published question set + context + warranty)
  app.post("/public/stores/:storeSlug/customer/support/resolve", async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const customer = await requireCustomer(request, reply, store.id);
    if (!customer) return;
    const input = supportResolveRequestSchema.parse(request.body);
    const result = await resolveSupportContext({
      storeId: store.id,
      customerId: customer.id,
      orderNumber: input.orderNumber,
      orderLineId: input.orderLineId,
      topic: input.topic,
      now: new Date(),
    });
    if (!result.ok) {
      const status = result.code === "ORDER_LINE_NOT_FOUND" ? 404 : 409;
      return reply.code(status).send(errorBody(result.code, resolveMessage(result.code)));
    }
    return reply.send(
      supportResolveResponseSchema.parse({
        graph: result.graph,
        context: result.context,
        warranty: result.warranty,
      }),
    );
  });

  // attachment upload (image → webp; PDF → stored as-is). Only for escalation/conversation.
  app.post("/public/stores/:storeSlug/customer/support/attachments", async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const customer = await requireCustomer(request, reply, store.id);
    if (!customer) return;

    const file = await (
      request as unknown as {
        file: () => Promise<{ mimetype: string; toBuffer: () => Promise<Buffer> } | undefined>;
      }
    ).file();
    if (!file) return reply.code(400).send(errorBody("FILE_REQUIRED", "Dosya gerekli."));
    if (!ALLOWED_MIME.has(file.mimetype))
      return reply.code(415).send(errorBody("UNSUPPORTED_MEDIA_TYPE", "Yalnız JPEG/PNG/WebP/PDF."));
    const raw = await file.toBuffer();
    if (raw.byteLength > MAX_ATTACHMENT_BYTES)
      return reply.code(413).send(errorBody("FILE_TOO_LARGE", "Dosya çok büyük."));

    let storageKey: string;
    let mimeType: string;
    let body: Buffer;
    let width: number | null = null;
    let height: number | null = null;

    if (file.mimetype === "application/pdf") {
      // PDF: sharp pipeline ATLANIR; bytes as-is, .pdf uzantı.
      storageKey = buildStorageKey(store.id, "SUPPORT_ATTACHMENT", randomUUID(), "pdf");
      mimeType = "application/pdf";
      body = raw;
    } else {
      try {
        const normalized = await sharp(raw)
          .rotate()
          .resize(2048, 2048, { fit: "inside", withoutEnlargement: true })
          .webp({ quality: 82 })
          .toBuffer();
        const meta = await sharp(normalized).metadata();
        width = meta.width ?? null;
        height = meta.height ?? null;
        storageKey = buildStorageKey(store.id, "SUPPORT_ATTACHMENT", randomUUID(), "webp");
        mimeType = "image/webp";
        body = normalized;
      } catch {
        return reply.code(422).send(errorBody("INVALID_IMAGE", "Görsel işlenemedi."));
      }
    }

    await deps.storage.put(storageKey, body, mimeType);
    const asset = await prisma.mediaAsset.create({
      data: {
        storeId: store.id,
        context: "SUPPORT_ATTACHMENT",
        storageKey,
        mimeType,
        byteSize: body.byteLength,
        width,
        height,
        createdBy: `customer:${customer.id}`,
      },
      select: { id: true },
    });
    return reply.code(201).send(customerSupportAttachmentUploadResponseSchema.parse({ mediaId: asset.id }));
  });

  // create ticket (unresolved self-service → escalate)
  app.post("/public/stores/:storeSlug/customer/support/tickets", async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const customer = await requireCustomer(request, reply, store.id);
    if (!customer) return;
    const input = supportTicketCreateRequestSchema.parse(request.body);
    const result = await createTicketFromGuidedFlow(
      {
        storeId: store.id,
        customerId: customer.id,
        orderNumber: input.orderNumber,
        orderLineId: input.orderLineId,
        topic: input.topic,
        questionSetVersionId: input.questionSetVersionId,
        answers: input.answers.map((a) => ({ questionKey: a.questionKey, value: a.value })),
        attachments: input.attachments,
        attemptedResolutionKey: input.attemptedResolutionKey,
        attemptedResolutionText: input.attemptedResolutionText,
      },
      deps.notifications,
      new Date(),
    );
    if (!result.ok) {
      const status = result.code === "ORDER_LINE_NOT_FOUND" ? 404 : result.code === "ATTACHMENT_NOT_FOUND" ? 404 : 409;
      return reply.code(status).send(errorBody(result.code, resolveMessage(result.code)));
    }
    const detail = await getCustomerTicketDetail(
      store.id,
      customer.id,
      result.ticketNumber,
      (tn) => attachmentBaseFor(store.slug, tn),
      new Date(),
    );
    return reply.code(201).send(customerSupportTicketDetailResponseSchema.parse({ ticket: detail }));
  });

  app.get("/public/stores/:storeSlug/customer/support/tickets", async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const customer = await requireCustomer(request, reply, store.id);
    if (!customer) return;
    const tickets = await listCustomerTickets(store.id, customer.id);
    return reply.send(customerSupportTicketListResponseSchema.parse({ tickets }));
  });

  app.get("/public/stores/:storeSlug/customer/support/tickets/:ticketNumber", async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const customer = await requireCustomer(request, reply, store.id);
    if (!customer) return;
    const ticketNumber = (request.params as { ticketNumber: string }).ticketNumber;
    const detail = await getCustomerTicketDetail(
      store.id,
      customer.id,
      ticketNumber,
      (tn) => attachmentBaseFor(store.slug, tn),
      new Date(),
    );
    if (!detail) return reply.code(404).send(errorBody("TICKET_NOT_FOUND", "Destek talebi bulunamadı."));
    return reply.send(customerSupportTicketDetailResponseSchema.parse({ ticket: detail }));
  });

  app.post("/public/stores/:storeSlug/customer/support/tickets/:ticketNumber/messages", async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const customer = await requireCustomer(request, reply, store.id);
    if (!customer) return;
    const ticketNumber = (request.params as { ticketNumber: string }).ticketNumber;
    const input = supportMessageCreateRequestSchema.parse(request.body);
    const result = await addCustomerMessage(
      { storeId: store.id, customerId: customer.id, ticketNumber, body: input.body, attachments: input.attachments },
      deps.notifications,
      new Date(),
    );
    if (!result.ok) return reply.code(messageStatus(result.code)).send(errorBody(result.code, resolveMessage(result.code)));
    const detail = await getCustomerTicketDetail(
      store.id,
      customer.id,
      ticketNumber,
      (tn) => attachmentBaseFor(store.slug, tn),
      new Date(),
    );
    return reply.send(customerSupportTicketDetailResponseSchema.parse({ ticket: detail }));
  });

  app.post("/public/stores/:storeSlug/customer/support/tickets/:ticketNumber/reopen", async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const customer = await requireCustomer(request, reply, store.id);
    if (!customer) return;
    const ticketNumber = (request.params as { ticketNumber: string }).ticketNumber;
    const result = await reopenTicket(
      { storeId: store.id, customerId: customer.id, ticketNumber },
      deps.notifications,
      new Date(),
    );
    if (!result.ok) return reply.code(reopenStatus(result.code)).send(errorBody(result.code, resolveMessage(result.code)));
    const detail = await getCustomerTicketDetail(
      store.id,
      customer.id,
      ticketNumber,
      (tn) => attachmentBaseFor(store.slug, tn),
      new Date(),
    );
    return reply.send(customerSupportTicketDetailResponseSchema.parse({ ticket: detail }));
  });
}

function resolveMessage(code: string): string {
  const map: Record<string, string> = {
    ORDER_LINE_NOT_FOUND: "Sipariş satırı bulunamadı.",
    QUESTION_SET_UNAVAILABLE: "Bu konu için destek akışı hazır değil.",
    VERSION_NOT_PUBLISHED: "Seçilen soru seti yayında değil.",
    ATTACHMENT_NOT_FOUND: "Ek bulunamadı.",
    TICKET_NOT_FOUND: "Destek talebi bulunamadı.",
    TICKET_CLOSED: "Kapatılmış talebe mesaj eklenemez; yeni talep açın.",
    REOPEN_WINDOW_EXPIRED: "Yeniden açma süresi doldu; yeni talep açın.",
    CLOSED_CANNOT_REOPEN: "Kapatılmış talep yeniden açılamaz; yeni talep açın.",
    INVALID_TRANSITION: "Bu işlem şu an yapılamaz.",
    NOT_OWNER: "Bu talebe erişiminiz yok.",
    VERSION_CONFLICT: "Talep bu sırada değişti; yenileyin.",
  };
  return map[code] ?? "İşlem reddedildi.";
}
function messageStatus(code: string): number {
  if (code === "TICKET_NOT_FOUND" || code === "ATTACHMENT_NOT_FOUND") return 404;
  if (code === "VERSION_CONFLICT") return 409;
  return 409;
}
function reopenStatus(code: string): number {
  if (code === "TICKET_NOT_FOUND") return 404;
  if (code === "NOT_OWNER") return 404; // existence-leak yok
  return 409;
}
