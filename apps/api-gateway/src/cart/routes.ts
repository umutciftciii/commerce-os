/**
 * TODO-167 (ADR-266) — Persistent Cart musteri route'lari (customer-session scoped).
 *
 * GET/POST/PATCH/DELETE /customer/cart[/lines[/:lineId]] + /reconcile + /merge. Fiyat
 * projeksiyonu ENJEKTE edilir (ORTAK assemblePublicCart; kaynaga gore farkli fiyatlama YOK).
 * Tenant fail-closed: store 404, oturumsuz 401, baska customer/store satiri 404, inactive 409,
 * stale version 409 CART_STALE (guncel otoriter projeksiyon govdede). Istemci fiyat/versiyona
 * guvenilmez; sunucu otoriterdir.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  customerCartAddLineRequestSchema,
  customerCartDeleteLineRequestSchema,
  customerCartMergeRequestSchema,
  customerCartReconcileRequestSchema,
  customerCartSetLineRequestSchema,
  type PublicCart,
} from "@commerce-os/contracts";
import {
  CartInactiveError,
  CartLineLimitError,
  CartLineNotFoundError,
  CartStaleError,
  type CartData,
  type CartRecord,
} from "./data.js";
import type { CartLineSnapshot } from "../cart-changes/change-engine.js";
import { attachChangesToCart, snapshotFromDbLine } from "../cart-changes/projection.js";
import type { CartChangeAckData } from "../cart-changes/ack-data.js";

interface ResolvedStore {
  id: string;
  slug: string;
}
interface ResolvedCustomer {
  id: string;
  storeId: string;
}

export interface CustomerCartRoutesDeps {
  logger: {
    info: (m: string, meta?: Record<string, unknown>) => void;
    warn: (m: string, meta?: Record<string, unknown>) => void;
  };
  resolvePublicStore: (slug: string) => Promise<ResolvedStore | null>;
  /** x-customer-session → {id, storeId} | null (server.ts resolveCustomerFromRequest sarar). */
  resolveCustomer: (request: FastifyRequest, storeId: string) => Promise<ResolvedCustomer | null>;
  data: CartData;
  /** TODO-168 (ADR-267) — cross-device ack veri katmani (fingerprint listeleme/ekleme). */
  ackData: CartChangeAckData;
  catalog: {
    findVariantsByIds: (storeId: string, ids: string[]) => Promise<Array<{ id: string; storeId: string }>>;
  };
  /** DB cart satirlarini ORTAK assembler ile server-authoritative fiyatlar (anonim ile ayni). */
  projectCart: (input: {
    store: ResolvedStore;
    customer: ResolvedCustomer;
    request: FastifyRequest;
    items: Array<{ variantId: string; quantity: number }>;
  }) => Promise<PublicCart>;
  /** Yeni cart olusturulurken varsayilan para birimi (projeksiyon otoriter; bu bilgi amaclidir). */
  defaultCurrency?: string;
  /** Anlamli mutation audit'i (opsiyonel). */
  auditLog?: (input: {
    storeId: string;
    customerId: string;
    action: string;
    metadata?: Record<string, unknown>;
  }) => void;
}

function errorBody(code: string, message: string, extra?: Record<string, unknown>) {
  return { error: { code, message, ...(extra ?? {}) } };
}

export function registerCustomerCartRoutes(app: FastifyInstance, deps: CustomerCartRoutesDeps): void {
  const defaultCurrency = deps.defaultCurrency ?? "TRY";
  const base = "/public/stores/:storeSlug/customer/cart";

  async function requireStore(request: FastifyRequest, reply: FastifyReply): Promise<ResolvedStore | null> {
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
  ): Promise<ResolvedCustomer | null> {
    const customer = await deps.resolveCustomer(request, storeId);
    if (!customer) {
      await reply.code(401).send(errorBody("CUSTOMER_UNAUTHORIZED", "Oturum gerekli."));
      return null;
    }
    return customer;
  }

  // TODO-168 (ADR-267) — Otoriter projeksiyon + DB snapshot → cart-changes. Anonim ile AYNI SAF motor;
  // tek fark snapshot/ack DB'den gelir. Agir projectCart bir kez calisir; ack sonrasi re-attach SAFtir.
  async function assembleBase(
    store: ResolvedStore,
    customer: ResolvedCustomer,
    request: FastifyRequest,
    record: CartRecord,
  ) {
    const items = record.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity }));
    const cart = await deps.projectCart({ store, customer, request, items });
    const lineIds: Record<string, string> = {};
    const snapshotByVariant = new Map<string, CartLineSnapshot>();
    for (const l of record.lines) {
      lineIds[l.variantId] = l.id;
      const snap = snapshotFromDbLine(l);
      if (snap) snapshotByVariant.set(l.variantId, snap);
    }
    return { cart, lineIds, snapshotByVariant };
  }

  async function projection(
    store: ResolvedStore,
    customer: ResolvedCustomer,
    request: FastifyRequest,
    record: CartRecord,
  ) {
    const acked = new Set(await deps.ackData.listAckFingerprints(store.id, record.id));
    const { cart, lineIds, snapshotByVariant } = await assembleBase(store, customer, request, record);
    const { cart: enriched, baselines } = attachChangesToCart(
      cart,
      { storeId: store.id, cartId: record.id },
      snapshotByVariant,
      acked,
    );
    // "Ilk guvenilir resolve = baseline": snapshot'siz satirlara guncel referans yazilir (idempotent).
    if (baselines.length > 0) {
      await deps.data.baselineLineSnapshots({ storeId: store.id, cartId: record.id, baselines });
    }
    return { version: record.version, status: record.status, cartId: record.id, cart: enriched, lineIds };
  }

  /** Mutation sonucunu 200 doner; typed data hatalarini HTTP'ye esler (stale → guncel projeksiyon). */
  async function runMutation(
    store: ResolvedStore,
    customer: ResolvedCustomer,
    request: FastifyRequest,
    reply: FastifyReply,
    run: () => Promise<CartRecord>,
  ) {
    try {
      const record = await run();
      return reply.code(200).send({ data: await projection(store, customer, request, record) });
    } catch (error) {
      if (error instanceof CartStaleError) {
        const current = await deps.data.findActiveCart(store.id, customer.id);
        if (!current) {
          return reply.code(409).send(errorBody("CART_INACTIVE", "Sepet artık aktif değil."));
        }
        return reply.code(409).send({
          error: { code: "CART_STALE", message: "Sepet başka bir cihazda güncellendi." },
          data: await projection(store, customer, request, current),
        });
      }
      if (error instanceof CartInactiveError) {
        return reply.code(409).send(errorBody("CART_INACTIVE", "Sepet artık aktif değil."));
      }
      if (error instanceof CartLineLimitError) {
        return reply.code(409).send(errorBody("CART_LINE_LIMIT", "Sepet ürün sınırına ulaştı."));
      }
      if (error instanceof CartLineNotFoundError) {
        return reply.code(404).send(errorBody("CART_LINE_NOT_FOUND", "Satır bulunamadı."));
      }
      throw error;
    }
  }

  // ── GET cart (lazy ACTIVE cart) ────────────────────────────────────────────────────
  app.get(base, async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const customer = await requireCustomer(request, reply, store.id);
    if (!customer) return;
    const record = await deps.data.ensureActiveCart(store.id, customer.id, defaultCurrency);
    return reply.code(200).send({ data: await projection(store, customer, request, record) });
  });

  // ── POST cart/lines (add/increment) ────────────────────────────────────────────────
  app.post(`${base}/lines`, async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const customer = await requireCustomer(request, reply, store.id);
    if (!customer) return;
    const parsed = customerCartAddLineRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody("BAD_REQUEST", "Geçersiz istek."));
    const { variantId, quantity, cartVersion } = parsed.data;
    // Varyant store-sahipligi (cross-store/enumeration guard → 404).
    const variants = await deps.catalog.findVariantsByIds(store.id, [variantId]);
    if (!variants.some((v) => v.id === variantId && v.storeId === store.id)) {
      return reply.code(404).send(errorBody("VARIANT_NOT_FOUND", "Ürün bulunamadı."));
    }
    // Cart lazy: mutation aktif cart yoksa CART_INACTIVE dondurur; once ensure ederiz.
    await deps.data.ensureActiveCart(store.id, customer.id, defaultCurrency);
    return runMutation(store, customer, request, reply, () =>
      deps.data.addOrIncrementLine({
        storeId: store.id,
        customerId: customer.id,
        expectedVersion: cartVersion,
        variantId,
        quantity,
      }),
    ).then((res) => {
      deps.auditLog?.({ storeId: store.id, customerId: customer.id, action: "CART_LINE_ADD", metadata: { variantId } });
      return res;
    });
  });

  // ── PATCH cart/lines/:lineId (set quantity; 0 removes) ──────────────────────────────
  app.patch(`${base}/lines/:lineId`, async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const customer = await requireCustomer(request, reply, store.id);
    if (!customer) return;
    const parsed = customerCartSetLineRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody("BAD_REQUEST", "Geçersiz istek."));
    const { lineId } = request.params as { lineId: string };
    return runMutation(store, customer, request, reply, () =>
      deps.data.setLineQuantity({
        storeId: store.id,
        customerId: customer.id,
        expectedVersion: parsed.data.cartVersion,
        lineId,
        quantity: parsed.data.quantity,
      }),
    );
  });

  // ── DELETE cart/lines/:lineId ───────────────────────────────────────────────────────
  app.delete(`${base}/lines/:lineId`, async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const customer = await requireCustomer(request, reply, store.id);
    if (!customer) return;
    const parsed = customerCartDeleteLineRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody("BAD_REQUEST", "Geçersiz istek."));
    const { lineId } = request.params as { lineId: string };
    return runMutation(store, customer, request, reply, () =>
      deps.data.deleteLine({
        storeId: store.id,
        customerId: customer.id,
        expectedVersion: parsed.data.cartVersion,
        lineId,
      }),
    );
  });

  // ── POST cart/reconcile (cozulemeyen varyant satirlarini SUNUCUDA budar) ────────────
  app.post(`${base}/reconcile`, async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const customer = await requireCustomer(request, reply, store.id);
    if (!customer) return;
    const parsed = customerCartReconcileRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody("BAD_REQUEST", "Geçersiz istek."));
    const current = await deps.data.ensureActiveCart(store.id, customer.id, defaultCurrency);
    const variantIds = [...new Set(current.lines.map((l) => l.variantId))];
    const valid = await deps.catalog.findVariantsByIds(store.id, variantIds);
    const keepVariantIds = valid.filter((v) => v.storeId === store.id).map((v) => v.id);
    return runMutation(store, customer, request, reply, () =>
      deps.data.reconcile({
        storeId: store.id,
        customerId: customer.id,
        expectedVersion: parsed.data.cartVersion,
        keepVariantIds,
      }),
    );
  });

  // ── POST cart/merge (login sonrasi anonim cookie sepetini DB sepetine merge) ─────────
  app.post(`${base}/merge`, async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const customer = await requireCustomer(request, reply, store.id);
    if (!customer) return;
    const parsed = customerCartMergeRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody("BAD_REQUEST", "Geçersiz istek."));
    const guestItems = parsed.data.items;
    const variantIds = [...new Set(guestItems.map((i) => i.variantId))];
    const valid = await deps.catalog.findVariantsByIds(store.id, variantIds);
    const validVariantIds = new Set(valid.filter((v) => v.storeId === store.id).map((v) => v.id));
    const { cart, result } = await deps.data.mergeGuestItems({
      storeId: store.id,
      customerId: customer.id,
      currency: defaultCurrency,
      guestItems,
      validVariantIds,
    });
    deps.auditLog?.({
      storeId: store.id,
      customerId: customer.id,
      action: "CART_MERGE",
      metadata: { merged: result.merged, skipped: result.skipped },
    });
    return reply.code(200).send({
      data: {
        result: {
          merged: result.merged,
          skipped: result.skipped,
          overflow: result.overflow,
          limitExceeded: result.overflow.length > 0,
        },
        cart: await projection(store, customer, request, cart),
      },
    });
  });

  // ── POST cart/changes/:fingerprint/acknowledge (TODO-168 — per-fingerprint cross-device ack) ──
  // Ack cart line'lari MUTASYONA UGRATMAZ (version bump yok); yalniz CartChangeAck ekler → guncel
  // projeksiyonda o degisiklik acknowledged doner (WARN checkout gate acilir). BLOCKING'i COZMEZ.
  app.post(`${base}/changes/:fingerprint/acknowledge`, async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const customer = await requireCustomer(request, reply, store.id);
    if (!customer) return;
    const { fingerprint } = request.params as { fingerprint: string };
    const record = await deps.data.ensureActiveCart(store.id, customer.id, defaultCurrency);
    const acked = new Set(await deps.ackData.listAckFingerprints(store.id, record.id));
    const { cart, lineIds, snapshotByVariant } = await assembleBase(store, customer, request, record);
    const attached = attachChangesToCart(cart, { storeId: store.id, cartId: record.id }, snapshotByVariant, acked);
    if (attached.baselines.length > 0) {
      await deps.data.baselineLineSnapshots({ storeId: store.id, cartId: record.id, baselines: attached.baselines });
    }
    const target = attached.cart.changes.find((c) => c.fingerprint === fingerprint);
    if (target) {
      await deps.ackData.insertAck({
        storeId: store.id,
        cartId: record.id,
        cartLineId: lineIds[target.variantId] ?? null,
        customerId: customer.id,
        fingerprint,
        changeType: target.changeType,
      });
      acked.add(fingerprint);
    }
    // SAF re-attach (agir projectCart tekrar CALISMAZ) — guncel ack ile.
    const { cart: finalCart } = attachChangesToCart(
      cart,
      { storeId: store.id, cartId: record.id },
      snapshotByVariant,
      acked,
    );
    return reply.code(200).send({
      data: { version: record.version, status: record.status, cartId: record.id, cart: finalCart, lineIds },
    });
  });

  // ── POST cart/changes/acknowledge-all (TODO-168 — "tumunu gordum": INFO+WARN dismiss) ──────────
  // BLOCKING ack EDILMEZ (ack yetmez; satir surekli gorunur kalir). INFO+WARN fingerprint'leri ack'lenir.
  app.post(`${base}/changes/acknowledge-all`, async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const customer = await requireCustomer(request, reply, store.id);
    if (!customer) return;
    const record = await deps.data.ensureActiveCart(store.id, customer.id, defaultCurrency);
    const acked = new Set(await deps.ackData.listAckFingerprints(store.id, record.id));
    const { cart, lineIds, snapshotByVariant } = await assembleBase(store, customer, request, record);
    const attached = attachChangesToCart(cart, { storeId: store.id, cartId: record.id }, snapshotByVariant, acked);
    if (attached.baselines.length > 0) {
      await deps.data.baselineLineSnapshots({ storeId: store.id, cartId: record.id, baselines: attached.baselines });
    }
    const toAck = attached.cart.changes.filter((c) => c.severity !== "BLOCKING" && !acked.has(c.fingerprint));
    if (toAck.length > 0) {
      await deps.ackData.insertAcks(
        toAck.map((c) => ({
          storeId: store.id,
          cartId: record.id,
          cartLineId: lineIds[c.variantId] ?? null,
          customerId: customer.id,
          fingerprint: c.fingerprint,
          changeType: c.changeType,
        })),
      );
      for (const c of toAck) acked.add(c.fingerprint);
    }
    const { cart: finalCart } = attachChangesToCart(
      cart,
      { storeId: store.id, cartId: record.id },
      snapshotByVariant,
      acked,
    );
    return reply.code(200).send({
      data: { version: record.version, status: record.status, cartId: record.id, cart: finalCart, lineIds },
    });
  });
}
