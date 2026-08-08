/**
 * TODO-169 (ADR-269) — Storefront müşteri iade uçları. `/public/stores/:slug/customer/returns/*`.
 * Auth: requireStore + requireCustomer (x-customer-session). Ownership: yalnız kendi siparişi/iadesi
 * (başka müşteri/store → 404). Eligibility/adet/açıklama/çözüm server-side (fail-closed). adminNote
 * ASLA dönmez. Attachment upload sharp/webp pipeline'ından geçer, PRIVATE context'e yazılır.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "@commerce-os/config";
import { prisma } from "@commerce-os/db";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import {
  customerReturnCreateRequestSchema,
  customerReturnCreateResponseSchema,
  customerReturnDetailResponseSchema,
  customerReturnEligibilityResponseSchema,
  customerRefundVisibilityListResponseSchema,
  customerReturnTrackingRequestSchema,
  type CustomerRefundVisibilityItem,
} from "@commerce-os/contracts";
import type { CustomerAuthRecord, CustomerDataAccess } from "../customers/index.js";
import { resolveCustomerFromRequest } from "../customers/index.js";
import { serializeCustomerReverseShipment } from "./reverse-serialize.js";
// BUG-CART-005 — iade kalemi thumbnail'i sipariş geçmişiyle AYNI varyant-farkında resolver'dan.
import { resolveReturnItemCovers, type OrderLineCoverEntry } from "./covers.js";
import type { StorageDriver } from "../media/storage.js";
import { buildStorageKey } from "../media/storage-key.js";
import { buildCustomerRefundSummary, maskPaymentMethodLabel } from "../refunds/serialize.js";
import {
  mapCustomerCancellationItem,
  type CustomerCancellationRowSource,
} from "../refunds/visibility.js";
import {
  createReturnRequest,
  applyReturnTransition,
  computeOrderEligibility,
  resolveStoreReturnPolicy,
  type CreateReturnError,
} from "./service.js";
import { computeRefund, type RefundCalcLine } from "./refund-calc.js";
import { evaluateReturnTransition } from "./status-map.js";
import { resolveReturnWindow } from "./projection.js";

export interface ReturnCustomerRoutesDeps {
  config: AppConfig;
  customers: CustomerDataAccess;
  storage: StorageDriver;
  resolvePublicStore: (slug: string) => Promise<{ id: string; slug: string } | null>;
}

function errorBody(code: string, message: string, details?: unknown) {
  return { error: { code, message, ...(details !== undefined ? { details } : {}) } };
}

const MAX_ATTACHMENT_BYTES = 5_242_880;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * TODO-169 recovery — Onaydan sonra ürünün mağazaya son gönderim süresi (gün). İlk faz manuel iade
 * kargolamasında güvenli varsayılan; ileride store politikasına taşınabilir (TECHNICAL_DEBT).
 */
const RETURN_SHIP_BACK_DAYS = 7;

export function registerReturnCustomerRoutes(app: FastifyInstance, deps: ReturnCustomerRoutesDeps): void {
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

  // BUG-CART-005 — iade kalemi thumbnail'i: OrderLine.id → kapak URL'i (snapshot → efektif
  // varyant → ürün kapağı). Sipariş geçmişiyle AYNI resolver (varyant renk-farkında).
  const lineCovers = (storeId: string, entries: OrderLineCoverEntry[]) =>
    resolveReturnItemCovers(storeId, entries, deps.config.MEDIA_PUBLIC_BASE_URL);

  // ── İade uygunluğu (sipariş bazında) ──────────────────────────────────────────
  app.get("/public/stores/:storeSlug/customer/orders/:orderNumber/return-eligibility", async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const customer = await requireCustomer(request, reply, store.id);
    if (!customer) return;
    const orderNumber = (request.params as { orderNumber: string }).orderNumber;

    const order = await prisma.order.findFirst({
      where: { storeId: store.id, orderNumber, customerId: customer.id },
      select: {
        id: true,
        currency: true,
        lines: {
          select: {
            id: true,
            productId: true,
            variantId: true,
            // BUG-CART-005 — varyant-farkında thumbnail (snapshot + renk ekseni).
            mediaStorageKey: true,
            title: true,
            variantTitle: true,
            sku: true,
            quantity: true,
            unitPriceAmount: true,
            product: { select: { slug: true, mediaDefiningAttributeId: true } },
          },
        },
        // TODO-173 (ADR-274) — iade uygunluğu teslim ankoru yalnız OUTBOUND_TO_CUSTOMER'dan.
        shipments: {
          where: { direction: "OUTBOUND_TO_CUSTOMER" },
          select: { status: true, deliveredAt: true, updatedAt: true },
        },
      },
    });
    if (!order) return reply.code(404).send(errorBody("ORDER_NOT_FOUND", "Sipariş bulunamadı."));

    const policy = await resolveStoreReturnPolicy(prisma, store.id);
    const elig = await computeOrderEligibility(
      prisma,
      store.id,
      { id: order.id, currency: order.currency, lines: order.lines.map((l) => ({ id: l.id, quantity: l.quantity, unitPriceAmount: l.unitPriceAmount })), shipments: order.shipments },
      policy,
      new Date(),
    );
    const eligByLine = new Map(elig.lines.map((l) => [l.orderLineId, l]));
    const covers = await lineCovers(
      store.id,
      order.lines.map((l) => ({
        lineId: l.id,
        productId: l.productId,
        variantId: l.variantId,
        mediaStorageKey: l.mediaStorageKey,
        mediaDefiningAttributeId: l.product?.mediaDefiningAttributeId ?? null,
      })),
    );
    // TODO-169 (blocker #1) — pencere alanları tek otoriteden (projection.resolveReturnWindow).
    const win = resolveReturnWindow(elig.anchor, policy.returnWindowDays, new Date());

    return customerReturnEligibilityResponseSchema.parse({
      eligibility: {
        orderNumber,
        currency: order.currency,
        returnable: elig.anchor !== null,
        deliveredAt: elig.anchor?.toISOString() ?? null,
        returnWindowDays: policy.returnWindowDays,
        returnWindowEndsAt: elig.windowEnd?.toISOString() ?? null,
        remainingDays: win.remainingDays,
        windowState: win.windowState,
        allowReplacement: policy.allowReplacement,
        allowOriginalPaymentRefund: policy.allowOriginalPaymentRefund,
        customerPaysReturnShipping: policy.customerPaysReturnShipping,
        lines: order.lines.map((line) => {
          const e = eligByLine.get(line.id)!;
          return {
            orderLineId: line.id,
            variantId: line.variantId,
            productSlug: line.product?.slug ?? "",
            sku: line.sku,
            title: line.title,
            variantTitle: line.variantTitle,
            imageUrl: covers.get(line.id) ?? null,
            purchasedQuantity: line.quantity,
            remainingReturnableQty: e.remainingReturnableQty,
            unitPriceMinor: line.unitPriceAmount,
            eligibility: e.status,
            returnWindowEndsAt: e.returnWindowEndsAt?.toISOString() ?? null,
            hasActiveReturn: e.hasActiveReturn,
          };
        }),
      },
    });
  });

  // ── Talep oluşturma ────────────────────────────────────────────────────────────
  app.post("/public/stores/:storeSlug/customer/returns", async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const customer = await requireCustomer(request, reply, store.id);
    if (!customer) return;
    const input = customerReturnCreateRequestSchema.parse(request.body);

    const result = await createReturnRequest(
      {
        storeId: store.id,
        customerId: customer.id,
        orderNumber: input.orderNumber,
        resolutionType: input.resolutionType,
        customerNote: input.customerNote,
        items: input.items,
      },
      new Date(),
    );
    if (!result.ok) return reply.code(createErrorStatus(result)).send(errorBody(result.code, createErrorMessage(result)));

    const detail = await loadCustomerDetail(deps, store.id, customer.id, result.returnRequestId);
    return reply.code(201).send(customerReturnCreateResponseSchema.parse({ return: detail }));
  });

  // ── Liste — TODO-174A: BİRLEŞİK "İadelerim" (iade talepleri + sipariş iptali geri ödemeleri) ──
  // Müşteri YALNIZ kendi kayıtlarını görür. ReturnRequest ve OrderRefund AYRI domain'ler; yalnız
  // projeksiyon birleşimi. Cancellation satırı kendi kaynağıyla (source) etiketlenir, "iade talebi"
  // gibi sunulmaz. Refund MASKELİ (buildCustomerRefundSummary), ham provider kodu SIZMAZ.
  app.get("/public/stores/:storeSlug/customer/returns", async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const customer = await requireCustomer(request, reply, store.id);
    if (!customer) return;

    const [returnRows, cancelRows] = await Promise.all([
      prisma.returnRequest.findMany({
        where: { storeId: store.id, customerId: customer.id },
        orderBy: { createdAt: "desc" },
        select: {
          returnNumber: true,
          status: true,
          resolutionType: true,
          createdAt: true,
          order: { select: { orderNumber: true } },
          items: { select: { id: true } },
        },
      }),
      prisma.orderRefund.findMany({
        where: {
          storeId: store.id,
          origin: "ORDER_CANCELLATION",
          order: { customerId: customer.id },
        },
        orderBy: { requestedAt: "desc" },
        select: {
          status: true,
          currency: true,
          totalRefundMinor: true,
          requestedAt: true,
          completedAt: true,
          order: {
            select: { orderNumber: true, cancelReasonCode: true, cancelReasonNote: true },
          },
          paymentAttempt: {
            select: { method: true, cardBrand: true, cardLast4: true, manualMethod: true },
          },
        },
      }),
    ]);

    const returnItems: CustomerRefundVisibilityItem[] = returnRows.map((r) => ({
      source: "RETURN_REQUEST",
      reference: r.returnNumber,
      orderNumber: r.order.orderNumber,
      createdAt: r.createdAt.toISOString(),
      returnStatus: r.status,
      resolutionType: r.resolutionType,
      itemCount: r.items.length,
      refund: null,
      cancellationReasonCode: null,
      cancellationReasonNote: null,
    }));
    const cancelItems = (cancelRows as CustomerCancellationRowSource[]).map(mapCustomerCancellationItem);

    const data = [...returnItems, ...cancelItems].sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
    );
    return customerRefundVisibilityListResponseSchema.parse({ data });
  });

  // ── Detay / takip ekranı ────────────────────────────────────────────────────
  app.get("/public/stores/:storeSlug/customer/returns/:returnNumber", async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const customer = await requireCustomer(request, reply, store.id);
    if (!customer) return;
    const returnNumber = (request.params as { returnNumber: string }).returnNumber;
    const rr = await prisma.returnRequest.findFirst({
      where: { storeId: store.id, customerId: customer.id, returnNumber },
      select: { id: true },
    });
    if (!rr) return reply.code(404).send(errorBody("RETURN_NOT_FOUND", "İade bulunamadı."));
    const detail = await loadCustomerDetail(deps, store.id, customer.id, rr.id);
    return customerReturnDetailResponseSchema.parse({ return: detail });
  });

  // ── İade kargo takip no gönder (AWAITING_SHIPMENT → RETURN_SHIPPED) ───────────
  app.post("/public/stores/:storeSlug/customer/returns/:returnNumber/tracking", async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const customer = await requireCustomer(request, reply, store.id);
    if (!customer) return;
    const returnNumber = (request.params as { returnNumber: string }).returnNumber;
    const input = customerReturnTrackingRequestSchema.parse(request.body);
    const rr = await prisma.returnRequest.findFirst({
      where: { storeId: store.id, customerId: customer.id, returnNumber },
      select: { id: true },
    });
    if (!rr) return reply.code(404).send(errorBody("RETURN_NOT_FOUND", "İade bulunamadı."));

    const result = await applyReturnTransition(
      store.id,
      rr.id,
      "RETURN_SHIPPED",
      { type: "CUSTOMER", id: customer.id },
      {
        timestampField: "shippedAt",
        extraData: { returnCarrier: input.carrier, returnTrackingNumber: input.trackingNumber },
      },
    );
    if (!result.ok) return reply.code(transitionStatus(result.code)).send(errorBody(result.code, "Takip numarası gönderilemedi."));
    const detail = await loadCustomerDetail(deps, store.id, customer.id, rr.id);
    return customerReturnDetailResponseSchema.parse({ return: detail });
  });

  // ── İptal (yalnız onay öncesi) ────────────────────────────────────────────────
  app.post("/public/stores/:storeSlug/customer/returns/:returnNumber/cancel", async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const customer = await requireCustomer(request, reply, store.id);
    if (!customer) return;
    const returnNumber = (request.params as { returnNumber: string }).returnNumber;
    const rr = await prisma.returnRequest.findFirst({
      where: { storeId: store.id, customerId: customer.id, returnNumber },
      select: { id: true },
    });
    if (!rr) return reply.code(404).send(errorBody("RETURN_NOT_FOUND", "İade bulunamadı."));
    const result = await applyReturnTransition(
      store.id,
      rr.id,
      "CANCELLED_BY_CUSTOMER",
      { type: "CUSTOMER", id: customer.id },
      { timestampField: "cancelledAt" },
    );
    if (!result.ok) return reply.code(transitionStatus(result.code)).send(errorBody(result.code, "İade iptal edilemedi."));
    const detail = await loadCustomerDetail(deps, store.id, customer.id, rr.id);
    return customerReturnDetailResponseSchema.parse({ return: detail });
  });

  // ── Fotoğraf yükleme (PRIVATE; talep oluşturmadan önce çağrılır) ──────────────
  app.post("/public/stores/:storeSlug/customer/returns/attachments", async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const customer = await requireCustomer(request, reply, store.id);
    if (!customer) return;

    const file = await (request as unknown as { file: () => Promise<{ mimetype: string; toBuffer: () => Promise<Buffer> } | undefined> }).file();
    if (!file) return reply.code(400).send(errorBody("FILE_REQUIRED", "Dosya gerekli."));
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return reply.code(415).send(errorBody("UNSUPPORTED_MEDIA_TYPE", "Yalnız JPEG/PNG/WebP."));
    }
    const raw = await file.toBuffer();
    if (raw.byteLength > MAX_ATTACHMENT_BYTES) {
      return reply.code(413).send(errorBody("FILE_TOO_LARGE", "Dosya çok büyük."));
    }
    let normalized: Buffer;
    let width: number | undefined;
    let height: number | undefined;
    try {
      const pipeline = sharp(raw).rotate().resize(2048, 2048, { fit: "inside", withoutEnlargement: true }).webp({ quality: 82 });
      normalized = await pipeline.toBuffer();
      const meta = await sharp(normalized).metadata();
      width = meta.width;
      height = meta.height;
    } catch {
      return reply.code(422).send(errorBody("INVALID_IMAGE", "Görsel işlenemedi."));
    }

    const storageKey = buildStorageKey(store.id, "RETURN_ATTACHMENT", randomUUID());
    await deps.storage.put(storageKey, normalized, "image/webp");
    const asset = await prisma.mediaAsset.create({
      data: {
        storeId: store.id,
        context: "RETURN_ATTACHMENT",
        storageKey,
        mimeType: "image/webp",
        byteSize: normalized.byteLength,
        width: width ?? null,
        height: height ?? null,
        createdBy: `customer:${customer.id}`,
      },
      select: { id: true },
    });
    return reply.code(201).send({ mediaId: asset.id });
  });
}

function createErrorStatus(result: CreateReturnError): number {
  switch (result.code) {
    case "ORDER_NOT_FOUND":
      return 404;
    case "ATTACHMENT_NOT_FOUND":
      return 404;
    case "ORDER_NOT_DELIVERED":
    case "RESOLUTION_NOT_ALLOWED":
    case "LINE_NOT_ELIGIBLE":
    case "QUANTITY_EXCEEDS_REMAINING":
    case "DUPLICATE_LINE":
      return 409;
    case "COMMENT_REQUIRED":
      return 400;
    default:
      return 409;
  }
}

function createErrorMessage(result: CreateReturnError): string {
  switch (result.code) {
    case "ORDER_NOT_FOUND":
      return "Sipariş bulunamadı.";
    case "ORDER_NOT_DELIVERED":
      return "Sipariş henüz teslim edilmedi; iade başlatılamaz.";
    case "RESOLUTION_NOT_ALLOWED":
      return "Seçilen çözüm bu mağaza için kullanılamıyor.";
    case "COMMENT_REQUIRED":
      return "Bu neden için açıklama zorunludur.";
    case "LINE_NOT_ELIGIBLE":
      return "Bu ürün iade için uygun değil.";
    case "QUANTITY_EXCEEDS_REMAINING":
      return "İade adedi kalan iade edilebilir adedi aşıyor.";
    case "DUPLICATE_LINE":
      return "Aynı ürün birden fazla kez seçilemez.";
    case "ATTACHMENT_NOT_FOUND":
      return "Yüklenen fotoğraf bulunamadı.";
    default:
      return "İade talebi oluşturulamadı.";
  }
}

function transitionStatus(code: string): number {
  switch (code) {
    case "RETURN_NOT_FOUND":
      return 404;
    case "ACTOR_NOT_ALLOWED":
      return 403;
    default:
      return 409;
  }
}

async function loadCustomerDetail(
  deps: ReturnCustomerRoutesDeps,
  storeId: string,
  customerId: string,
  returnRequestId: string,
) {
  const rr = await prisma.returnRequest.findFirst({
    where: { id: returnRequestId, storeId, customerId },
    include: {
      order: { select: { orderNumber: true, currency: true } },
      items: {
        include: {
          orderLine: {
            select: {
              id: true,
              productId: true,
              variantId: true,
              // BUG-CART-005 — varyant-farkında iade kalemi thumbnail'i.
              mediaStorageKey: true,
              title: true,
              variantTitle: true,
              sku: true,
              product: { select: { mediaDefiningAttributeId: true } },
            },
          },
          attachments: { select: { id: true } },
        },
      },
      history: { orderBy: { createdAt: "asc" } },
      // TODO-173 (ADR-274) — "Ürün size geri gönderiliyor": yalnız STORE_RETURN_TO_CUSTOMER; sade tracking.
      shipments: {
        where: { direction: "STORE_RETURN_TO_CUSTOMER" },
        orderBy: { createdAt: "asc" },
      },
      // TODO-170 (ADR-272) — müşteri refund durumu (MASKELİ) için intent + ledger + ödeme yöntemi.
      refundIntent: {
        select: {
          status: true,
          totalRefundMinor: true,
          paymentAttempt: {
            select: { method: true, cardBrand: true, cardLast4: true, manualMethod: true },
          },
        },
      },
      orderRefunds: {
        select: { status: true, totalRefundMinor: true, completedAt: true, requestedAt: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!rr) return null;

  const policy = await resolveStoreReturnPolicy(prisma, storeId);
  const covers = await resolveReturnItemCovers(
    storeId,
    rr.items.map((i) => ({
      lineId: i.orderLine.id,
      productId: i.orderLine.productId,
      variantId: i.orderLine.variantId,
      mediaStorageKey: i.orderLine.mediaStorageKey,
      mediaDefiningAttributeId: i.orderLine.product?.mediaDefiningAttributeId ?? null,
    })),
    deps.config.MEDIA_PUBLIC_BASE_URL,
  );
  const estimatedRefundMinor = await estimateRefund(storeId, rr);
  // Refund özeti yalnız aktif (CANCELLED olmayan) refund niyeti varken; teknik provider kodu MÜŞTERİYE YOK.
  const refund =
    rr.refundIntent && rr.refundIntent.status !== "CANCELLED"
      ? buildCustomerRefundSummary({
          currency: rr.order.currency,
          expectedTotalMinor: rr.refundIntent.totalRefundMinor,
          refunds: rr.orderRefunds.map((r) => ({
            status: r.status,
            totalRefundMinor: r.totalRefundMinor,
            completedAt: r.completedAt,
            requestedAt: r.requestedAt,
          })),
          methodLabel: maskPaymentMethodLabel(rr.refundIntent.paymentAttempt),
        })
      : null;
  const canCancel = evaluateReturnTransition(rr.status, "CANCELLED_BY_CUSTOMER", "CUSTOMER").ok;
  const canSubmitTracking = evaluateReturnTransition(rr.status, "RETURN_SHIPPED", "CUSTOMER").ok;
  // Son gönderim tarihi: onay ankoru + kargolama süresi (yoksa iade penceresi sonuna düş).
  const shipAnchor = rr.approvedAt ?? rr.reviewedAt ?? rr.returnWindowEndsAt;
  const shipByDate = new Date(shipAnchor.getTime() + RETURN_SHIP_BACK_DAYS * DAY_MS).toISOString();

  return {
    returnNumber: rr.returnNumber,
    orderNumber: rr.order.orderNumber,
    status: rr.status,
    resolutionType: rr.resolutionType,
    itemCount: rr.items.length,
    createdAt: rr.createdAt.toISOString(),
    currency: rr.order.currency,
    customerNote: rr.customerNote,
    returnCarrier: rr.returnCarrier,
    returnTrackingNumber: rr.returnTrackingNumber,
    customerPaysReturnShipping: policy.customerPaysReturnShipping,
    estimatedRefundMinor,
    refund,
    returnWindowEndsAt: rr.returnWindowEndsAt.toISOString(),
    shipByDate,
    canCancel,
    canSubmitTracking,
    items: rr.items.map((item) => ({
      id: item.id,
      orderLineId: item.orderLineId,
      title: item.orderLine.title,
      variantTitle: item.orderLine.variantTitle,
      sku: item.orderLine.sku,
      imageUrl: covers.get(item.orderLine.id) ?? null,
      quantity: item.quantity,
      approvedQuantity: item.approvedQuantity,
      reason: item.reason,
      customerComment: item.customerComment,
      attachmentCount: item.attachments.length,
    })),
    history: rr.history.map((h) => ({
      toStatus: h.toStatus,
      actorType: h.actorType,
      createdAt: h.createdAt.toISOString(),
    })),
    // TODO-173 (ADR-274) — reverse tracking (internal reason / PII / disposition kodu YOK). Ürün başlığı
    // eşleşen ReturnItem'dan; yoksa genel etiket.
    reverseShipments: rr.shipments.map((s) => {
      const item = rr.items.find((i) => i.id === s.returnItemId);
      return serializeCustomerReverseShipment(s, {
        title: item?.orderLine.title ?? "Ürün",
        variantTitle: item?.orderLine.variantTitle ?? null,
      });
    }),
  };
}


// REPLACEMENT → refund yok (null). REFUND → snapshot'lardan tahmin (approved ?? requested adet).
async function estimateRefund(
  storeId: string,
  rr: { orderId: string; resolutionType: string; refundShipping: boolean; items: Array<{ orderLineId: string; quantity: number; approvedQuantity: number | null }> },
): Promise<number | null> {
  if (rr.resolutionType !== "REFUND_TO_ORIGINAL_PAYMENT") return null;
  const order = await prisma.order.findFirst({
    where: { id: rr.orderId, storeId },
    select: {
      currency: true,
      discountAmount: true,
      shippingAmount: true,
      lines: { select: { id: true, quantity: true, unitPriceAmount: true, totalAmount: true, lineGrossAmountMinor: true, lineVatAmountMinor: true, discountAllocatedMinor: true } },
    },
  });
  if (!order) return null;
  const returnedByLine = new Map(rr.items.map((i) => [i.orderLineId, i.approvedQuantity ?? i.quantity]));
  const lines: RefundCalcLine[] = order.lines.map((l) => ({
    orderLineId: l.id,
    lineQuantity: l.quantity,
    returnedQuantity: returnedByLine.get(l.id) ?? 0,
    lineGrossMinor: l.lineGrossAmountMinor ?? l.totalAmount,
    lineVatMinor: l.lineVatAmountMinor,
    // TD-FR-7 — kalem-bazlı indirim snapshot'ı (legacy siparişte null → oransal fallback).
    discountAllocatedMinor: l.discountAllocatedMinor,
  }));
  const refund = computeRefund({
    currency: order.currency,
    orderLevelDiscountMinor: order.discountAmount,
    shippingAmountMinor: order.shippingAmount,
    refundShipping: rr.refundShipping,
    lines,
  });
  return refund.totalRefundMinor;
}
