/**
 * TODO-159D (ADR-093) — Customer Lists & Wishlist — HTTP route katmanı.
 *
 * Tüm uçlar müşteri-scoped'tur: `requireStore` (slug→store) + `requireCustomer`
 * (`x-customer-session`). Her yazma öncesi store+customer+list ownership doğrulanır;
 * bulunamayan liste/öğe 404 döner (ID enumeration başka müşterinin verisini SIZDIRMAZ).
 *
 * Öğe hidrasyonu CANLI katalog/stok otoritesinden yapılır (enjekte edilen dataAccess
 * yardımcıları; N+1 yok). Fiyat/stok SNAPSHOT'ına ASLA güvenilmez.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "@commerce-os/config";
import {
  ADMIN_LIST_DEFAULT_PAGE_SIZE,
  CUSTOMER_LIST_BATCH_ADD_MAX,
  CUSTOMER_LIST_ITEM_QUANTITY_MAX,
  CUSTOMER_LIST_MAX_ITEMS,
  CUSTOMER_LIST_MAX_PER_CUSTOMER,
  buildAdminListPagination,
  customerListAddItemRequestSchema,
  customerListAddItemResponseSchema,
  customerListBatchAddToCartRequestSchema,
  customerListBatchAddToCartResponseSchema,
  customerListCopyItemRequestSchema,
  customerListCreateRequestSchema,
  customerListDetailResponseSchema,
  customerListItemMutationResponseSchema,
  customerListListResponseSchema,
  customerListMoveItemRequestSchema,
  customerListMutationResponseSchema,
  customerListRenameRequestSchema,
  customerWishlistMergeRequestSchema,
  customerWishlistMergeResponseSchema,
  customerWishlistStatusRequestSchema,
  customerWishlistStatusResponseSchema,
  customerWishlistToggleRequestSchema,
  customerWishlistToggleResponseSchema,
  resolveAdminListPage,
  storeAdminCustomerListSummaryResponseSchema,
  type CustomerListItem,
  type CustomerListItemAvailability,
  type CustomerListSummary,
} from "@commerce-os/contracts";
import { buildProductCoverUrlMap, type ListProductImagesFn } from "../media/cover.js";
import {
  resolveCustomerFromRequest,
  type CustomerAuthRecord,
  type CustomerDataAccess,
} from "../customers/index.js";
import type {
  CustomerListData,
  CustomerListItemRecord,
  CustomerListRecord,
} from "./data.js";

/* ── Enjekte edilen katalog yardımcıları (yapısal alt küme) ─────────────────── */

interface CatalogProduct {
  id: string;
  storeId: string;
  slug: string;
  title: string;
  status: string;
  salesMode: string;
  purchasable: boolean;
  priceVisibility: string;
  minOrderQuantity: number;
  maxOrderQuantity: number | null;
}
interface CatalogVariant {
  id: string;
  productId: string;
  title: string;
  sku: string;
  status: string;
  priceMinor: number;
  compareAtMinor: number | null;
  currency: string;
}
interface CatalogInventory {
  variantId: string;
  quantityOnHand: number;
  quantityReserved: number;
}

export interface CustomerListRoutesDeps {
  config: AppConfig;
  customers: CustomerDataAccess;
  logger: { info: (m: string, meta?: Record<string, unknown>) => void; warn: (m: string, meta?: Record<string, unknown>) => void };
  resolvePublicStore: (slug: string) => Promise<{ id: string; slug: string } | null>;
  data: CustomerListData;
  catalog: {
    findProductsByIds: (storeId: string, ids: string[]) => Promise<CatalogProduct[]>;
    findVariantsByIds: (storeId: string, ids: string[]) => Promise<CatalogVariant[]>;
    findInventoryByVariantIds: (storeId: string, ids: string[]) => Promise<CatalogInventory[]>;
    listProductImages: ListProductImagesFn;
  };
}

function errorBody(code: string, message: string, extra?: Record<string, unknown>) {
  return { error: { code, message, ...(extra ?? {}) } };
}

function isPublicPriceVisible(visibility: string): boolean {
  return visibility === "VISIBLE" || visibility === "STARTING_FROM";
}

/** Liste kaydı → müşteri-güvenli özet (itemCount çağıran tarafından verilir). */
function toListSummary(list: CustomerListRecord, itemCount: number): CustomerListSummary {
  return {
    id: list.id,
    name: list.name,
    type: list.type,
    visibility: list.visibility,
    isDefault: list.isDefault,
    itemCount,
    createdAt: list.createdAt.toISOString(),
    updatedAt: list.updatedAt.toISOString(),
  };
}

/**
 * Bir öğe kümesini CANLI katalog/stok otoritesinden hidrate eder (sıra korunur).
 * Sabit sayıda batched sorgu (ürünler + varyant-özel varyantlar + bütün-ürün
 * varyantları + envanter + kapak görselleri) — N+1 YOK.
 */
async function hydrateItems(
  deps: CustomerListRoutesDeps,
  storeId: string,
  records: CustomerListItemRecord[],
): Promise<CustomerListItem[]> {
  if (records.length === 0) return [];
  const productIds = [...new Set(records.map((r) => r.productId))];
  const variantSpecificIds = [
    ...new Set(records.map((r) => r.variantId).filter((v): v is string => v !== null)),
  ];
  const wholeProductIds = [
    ...new Set(records.filter((r) => r.variantId === null).map((r) => r.productId)),
  ];

  const [products, variantSpecific, wholeVariants] = await Promise.all([
    deps.catalog.findProductsByIds(storeId, productIds),
    variantSpecificIds.length > 0
      ? deps.catalog.findVariantsByIds(storeId, variantSpecificIds)
      : Promise.resolve([] as CatalogVariant[]),
    deps.data.listActiveVariantsByProductIds(storeId, wholeProductIds),
  ]);

  const productById = new Map(products.map((p) => [p.id, p]));
  const variantById = new Map(variantSpecific.map((v) => [v.id, v]));
  // Bütün-ürün öğesinin temsili varyantı = EN UCUZ ACTIVE varyant (liste priceMinor ASC).
  const cheapestWholeVariantByProduct = new Map<string, (typeof wholeVariants)[number]>();
  for (const variant of wholeVariants) {
    if (!cheapestWholeVariantByProduct.has(variant.productId)) {
      cheapestWholeVariantByProduct.set(variant.productId, variant);
    }
  }

  // Stok: hem varyant-özel hem bütün-ürün temsili varyant id'leri için tek batched çağrı.
  const stockVariantIds = [
    ...variantSpecificIds,
    ...[...cheapestWholeVariantByProduct.values()].map((v) => v.id),
  ];
  const [inventory, coverUrlByProductId] = await Promise.all([
    stockVariantIds.length > 0
      ? deps.catalog.findInventoryByVariantIds(storeId, [...new Set(stockVariantIds)])
      : Promise.resolve([] as CatalogInventory[]),
    buildProductCoverUrlMap(
      deps.catalog.listProductImages,
      deps.config.MEDIA_PUBLIC_BASE_URL,
      storeId,
      productIds,
    ),
  ]);
  const stockByVariantId = new Map(
    inventory.map((item) => [item.variantId, item.quantityOnHand - item.quantityReserved]),
  );

  return records.map((record) => {
    const product = productById.get(record.productId);
    const productActive = !!product && product.status === "ACTIVE";
    const purchasable =
      productActive &&
      product!.purchasable &&
      product!.salesMode === "ONLINE" &&
      isPublicPriceVisible(product!.priceVisibility);

    // Temsili varyant (fiyat + eklenebilir-varyant için).
    let variant: CatalogVariant | { id: string; title: string; sku: string; priceMinor: number; compareAtMinor: number | null; currency: string; status: string } | undefined;
    if (record.variantId) {
      variant = variantById.get(record.variantId);
    } else {
      const whole = cheapestWholeVariantByProduct.get(record.productId);
      variant = whole ? { ...whole, status: "ACTIVE" } : undefined;
    }
    const variantUsable = !!variant && variant.status === "ACTIVE";

    const available =
      variant && stockByVariantId.has(variant.id) ? stockByVariantId.get(variant.id)! : null;
    // Cart otoritesiyle simetri: null stok = "izlenmiyor" → stokta kabul edilir.
    const inStock = available === null ? true : available > 0;

    let availability: CustomerListItemAvailability;
    if (!purchasable || !variantUsable) {
      availability = "UNAVAILABLE";
    } else if (!inStock) {
      availability = "OUT_OF_STOCK";
    } else {
      availability = "AVAILABLE";
    }

    const priceMinor = purchasable && variantUsable ? variant!.priceMinor : null;
    const compareAtMinor =
      purchasable &&
      variantUsable &&
      variant!.compareAtMinor !== null &&
      variant!.compareAtMinor > variant!.priceMinor
        ? variant!.compareAtMinor
        : null;
    const currency = variantUsable ? variant!.currency : null;
    const addableVariantId = purchasable && variantUsable ? variant!.id : null;

    return {
      id: record.id,
      productId: record.productId,
      variantId: record.variantId,
      productSlug: product?.slug ?? "",
      productTitle: product?.title ?? "",
      variantTitle: record.variantId ? (variant && "title" in variant ? variant.title : null) : null,
      sku: record.variantId ? (variant && "sku" in variant ? variant.sku : null) : null,
      note: record.note,
      quantity: record.quantity,
      imageUrl: coverUrlByProductId.get(record.productId) ?? null,
      priceMinor,
      compareAtMinor,
      currency,
      availability,
      inStock,
      addableVariantId,
      addedAt: record.addedAt.toISOString(),
    } satisfies CustomerListItem;
  });
}

export function registerCustomerListRoutes(app: FastifyInstance, deps: CustomerListRoutesDeps): void {
  const { config, customers, resolvePublicStore, data } = deps;

  async function requireStore(request: FastifyRequest, reply: FastifyReply) {
    const slug = (request.params as { storeSlug: string }).storeSlug;
    const store = await resolvePublicStore(slug);
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
    const customer = await resolveCustomerFromRequest(request, storeId, { customers, config });
    if (!customer) {
      await reply.code(401).send(errorBody("CUSTOMER_UNAUTHORIZED", "Oturum gerekli."));
      return null;
    }
    return customer;
  }

  /** Ownership: liste müşteriye ait mi? Değilse null döndürür (çağıran 404 verir). */
  async function requireOwnedList(
    storeId: string,
    customerId: string,
    listId: string,
  ): Promise<CustomerListRecord | null> {
    return data.findList(storeId, customerId, listId);
  }

  const base = "/public/stores/:storeSlug/customer";

  // ── GET listeler ──────────────────────────────────────────────────────────
  app.get(`${base}/lists`, async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const customer = await requireCustomer(request, reply, store.id);
    if (!customer) return;
    // Varsayılan wishlist'i tembel oluştur (her müşteride tam bir tane bulunmalı).
    await data.ensureDefaultWishlist(store.id, customer.id);
    const lists = await data.listListsWithCounts(store.id, customer.id);
    return customerListListResponseSchema.parse({
      data: lists.map((list) => toListSummary(list, list.itemCount)),
    });
  });

  // ── POST yeni özel liste ────────────────────────────────────────────────────
  app.post(`${base}/lists`, async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const customer = await requireCustomer(request, reply, store.id);
    if (!customer) return;
    const body = customerListCreateRequestSchema.parse(request.body);
    const count = await data.countCustomerLists(store.id, customer.id);
    if (count >= CUSTOMER_LIST_MAX_PER_CUSTOMER) {
      return reply
        .code(422)
        .send(errorBody("LIST_LIMIT_REACHED", "Liste sayısı sınırına ulaşıldı."));
    }
    const duplicate = await data.findListByNameCI(store.id, customer.id, body.name);
    if (duplicate) {
      return reply.code(409).send(errorBody("LIST_NAME_CONFLICT", "Bu isimde bir liste zaten var."));
    }
    const list = await data.createList(store.id, customer.id, body.name);
    return reply.code(201).send(customerListMutationResponseSchema.parse({ data: toListSummary(list, 0) }));
  });

  // ── GET liste detayı (sayfalı hidrate öğeler) ───────────────────────────────
  app.get(`${base}/lists/:listId`, async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const customer = await requireCustomer(request, reply, store.id);
    if (!customer) return;
    const { listId } = request.params as { listId: string };
    const list = await requireOwnedList(store.id, customer.id, listId);
    if (!list) {
      return reply.code(404).send(errorBody("LIST_NOT_FOUND", "Liste bulunamadı."));
    }
    const { page, pageSize, limit, offset } = resolveAdminListPage(
      request.query as Record<string, unknown>,
      ADMIN_LIST_DEFAULT_PAGE_SIZE,
    );
    const { items, total } = await data.listItemsPage(list.id, limit, offset);
    const hydrated = await hydrateItems(deps, store.id, items);
    return customerListDetailResponseSchema.parse({
      data: { ...toListSummary(list, total), items: hydrated },
      pagination: buildAdminListPagination({ page, pageSize, totalItems: total }),
    });
  });

  // ── PATCH yeniden adlandır (default hariç) ──────────────────────────────────
  app.patch(`${base}/lists/:listId`, async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const customer = await requireCustomer(request, reply, store.id);
    if (!customer) return;
    const { listId } = request.params as { listId: string };
    const list = await requireOwnedList(store.id, customer.id, listId);
    if (!list) return reply.code(404).send(errorBody("LIST_NOT_FOUND", "Liste bulunamadı."));
    if (list.isDefault) {
      return reply
        .code(422)
        .send(errorBody("DEFAULT_LIST_IMMUTABLE", "Varsayılan favori listesi yeniden adlandırılamaz."));
    }
    const body = customerListRenameRequestSchema.parse(request.body);
    const duplicate = await data.findListByNameCI(store.id, customer.id, body.name);
    if (duplicate && duplicate.id !== list.id) {
      return reply.code(409).send(errorBody("LIST_NAME_CONFLICT", "Bu isimde bir liste zaten var."));
    }
    const updated = await data.renameList(list.id, body.name);
    const itemCount = await data.countItems(list.id);
    return customerListMutationResponseSchema.parse({ data: toListSummary(updated, itemCount) });
  });

  // ── DELETE liste (default hariç) ────────────────────────────────────────────
  app.delete(`${base}/lists/:listId`, async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const customer = await requireCustomer(request, reply, store.id);
    if (!customer) return;
    const { listId } = request.params as { listId: string };
    const list = await requireOwnedList(store.id, customer.id, listId);
    if (!list) return reply.code(404).send(errorBody("LIST_NOT_FOUND", "Liste bulunamadı."));
    if (list.isDefault) {
      return reply
        .code(422)
        .send(errorBody("DEFAULT_LIST_IMMUTABLE", "Varsayılan favori listesi silinemez."));
    }
    await data.deleteList(list.id);
    return customerListItemMutationResponseSchema.parse({ data: { ok: true } });
  });

  // ── POST öğe ekle (idempotent) ──────────────────────────────────────────────
  app.post(`${base}/lists/:listId/items`, async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const customer = await requireCustomer(request, reply, store.id);
    if (!customer) return;
    const { listId } = request.params as { listId: string };
    const list = await requireOwnedList(store.id, customer.id, listId);
    if (!list) return reply.code(404).send(errorBody("LIST_NOT_FOUND", "Liste bulunamadı."));
    const body = customerListAddItemRequestSchema.parse(request.body);

    // Ürün/varyant CANLI otoriteden doğrulanır (cross-store / nonexistent reddedilir).
    const [products, variants] = await Promise.all([
      deps.catalog.findProductsByIds(store.id, [body.productId]),
      body.variantId
        ? deps.catalog.findVariantsByIds(store.id, [body.variantId])
        : Promise.resolve([] as CatalogVariant[]),
    ]);
    const product = products.find((p) => p.id === body.productId);
    if (!product) {
      return reply.code(404).send(errorBody("PRODUCT_NOT_FOUND", "Ürün bulunamadı."));
    }
    if (body.variantId) {
      const variant = variants.find((v) => v.id === body.variantId);
      if (!variant || variant.productId !== body.productId) {
        return reply.code(404).send(errorBody("VARIANT_NOT_FOUND", "Varyant bulunamadı."));
      }
    }

    const itemCount = await data.countItems(list.id);
    if (itemCount >= CUSTOMER_LIST_MAX_ITEMS) {
      return reply.code(422).send(errorBody("LIST_ITEMS_LIMIT_REACHED", "Liste öğe sınırına ulaşıldı."));
    }

    const quantity = Math.min(body.quantity ?? 1, CUSTOMER_LIST_ITEM_QUANTITY_MAX);
    const { item, alreadyExisted } = await data.addItemIdempotent({
      storeId: store.id,
      listId: list.id,
      productId: body.productId,
      variantId: body.variantId ?? null,
      note: body.note ?? null,
      quantity,
    });
    return reply
      .code(alreadyExisted ? 200 : 201)
      .send(customerListAddItemResponseSchema.parse({ data: { itemId: item.id, alreadyExisted } }));
  });

  // ── DELETE öğe kaldır (idempotent) ──────────────────────────────────────────
  app.delete(`${base}/lists/:listId/items/:itemId`, async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const customer = await requireCustomer(request, reply, store.id);
    if (!customer) return;
    const { listId, itemId } = request.params as { listId: string; itemId: string };
    const list = await requireOwnedList(store.id, customer.id, listId);
    if (!list) return reply.code(404).send(errorBody("LIST_NOT_FOUND", "Liste bulunamadı."));
    const item = await data.findItemById(list.id, itemId);
    if (item) await data.deleteItem(item.id); // yoksa idempotent no-op
    return customerListItemMutationResponseSchema.parse({ data: { ok: true } });
  });

  // ── POST öğe taşı / kopyala ─────────────────────────────────────────────────
  async function resolveMoveCopy(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<{
    storeId: string;
    sourceList: CustomerListRecord;
    targetList: CustomerListRecord;
    item: CustomerListItemRecord;
  } | null> {
    const store = await requireStore(request, reply);
    if (!store) return null;
    const customer = await requireCustomer(request, reply, store.id);
    if (!customer) return null;
    const { listId, itemId } = request.params as { listId: string; itemId: string };
    const body = customerListMoveItemRequestSchema.parse(request.body);
    const sourceList = await requireOwnedList(store.id, customer.id, listId);
    if (!sourceList) {
      await reply.code(404).send(errorBody("LIST_NOT_FOUND", "Liste bulunamadı."));
      return null;
    }
    const item = await data.findItemById(sourceList.id, itemId);
    if (!item) {
      await reply.code(404).send(errorBody("ITEM_NOT_FOUND", "Öğe bulunamadı."));
      return null;
    }
    // Hedef liste de MÜŞTERİYE ait olmalı (cross-customer/cross-store engellenir).
    const targetList = await requireOwnedList(store.id, customer.id, body.targetListId);
    if (!targetList) {
      await reply.code(404).send(errorBody("TARGET_LIST_NOT_FOUND", "Hedef liste bulunamadı."));
      return null;
    }
    return { storeId: store.id, sourceList, targetList, item };
  }

  app.post(`${base}/lists/:listId/items/:itemId/move`, async (request, reply) => {
    const ctx = await resolveMoveCopy(request, reply);
    if (!ctx) return;
    if (ctx.targetList.id === ctx.sourceList.id) {
      return customerListItemMutationResponseSchema.parse({ data: { ok: true } });
    }
    const targetCount = await data.countItems(ctx.targetList.id);
    if (targetCount >= CUSTOMER_LIST_MAX_ITEMS) {
      return reply.code(422).send(errorBody("LIST_ITEMS_LIMIT_REACHED", "Hedef liste öğe sınırında."));
    }
    // Hedefte aynı ürün/varyant varsa: taşımada kaynağı sil (dedup), aksi halde taşı.
    const existing = await data.findItemByProductVariant(
      ctx.targetList.id,
      ctx.item.productId,
      ctx.item.variantId,
    );
    if (existing) {
      await data.deleteItem(ctx.item.id);
    } else {
      await data.moveItem(ctx.item.id, ctx.targetList.id);
    }
    return customerListItemMutationResponseSchema.parse({ data: { ok: true } });
  });

  app.post(`${base}/lists/:listId/items/:itemId/copy`, async (request, reply) => {
    // copy: aynı sözleşme (targetListId); kaynak korunur, hedefe idempotent eklenir.
    customerListCopyItemRequestSchema.parse(request.body ?? {});
    const ctx = await resolveMoveCopy(request, reply);
    if (!ctx) return;
    if (ctx.targetList.id === ctx.sourceList.id) {
      return customerListItemMutationResponseSchema.parse({ data: { ok: true } });
    }
    const targetCount = await data.countItems(ctx.targetList.id);
    if (targetCount >= CUSTOMER_LIST_MAX_ITEMS) {
      return reply.code(422).send(errorBody("LIST_ITEMS_LIMIT_REACHED", "Hedef liste öğe sınırında."));
    }
    await data.addItemIdempotent({
      storeId: ctx.storeId,
      listId: ctx.targetList.id,
      productId: ctx.item.productId,
      variantId: ctx.item.variantId,
      note: ctx.item.note,
      quantity: ctx.item.quantity,
    });
    return customerListItemMutationResponseSchema.parse({ data: { ok: true } });
  });

  // ── POST toplu sepete ekle (canlı otorite; aday + atlanan özeti) ─────────────
  app.post(`${base}/lists/:listId/add-to-cart`, async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const customer = await requireCustomer(request, reply, store.id);
    if (!customer) return;
    const { listId } = request.params as { listId: string };
    const list = await requireOwnedList(store.id, customer.id, listId);
    if (!list) return reply.code(404).send(errorBody("LIST_NOT_FOUND", "Liste bulunamadı."));
    const body = customerListBatchAddToCartRequestSchema.parse(request.body ?? {});

    let records = await data.listAllItems(list.id, CUSTOMER_LIST_MAX_ITEMS);
    if (body.itemIds && body.itemIds.length > 0) {
      const wanted = new Set(body.itemIds);
      records = records.filter((r) => wanted.has(r.id));
    }
    records = records.slice(0, CUSTOMER_LIST_BATCH_ADD_MAX);

    const hydrated = await hydrateItems(deps, store.id, records);
    const candidates = [];
    const skipped = [];
    for (const item of hydrated) {
      if (item.availability === "AVAILABLE" && item.addableVariantId) {
        candidates.push({
          itemId: item.id,
          productId: item.productId,
          variantId: item.addableVariantId,
          quantity: item.quantity,
        });
      } else {
        skipped.push({
          itemId: item.id,
          productTitle: item.productTitle,
          reason: item.availability === "OUT_OF_STOCK" ? "OUT_OF_STOCK" : "UNAVAILABLE",
        });
      }
    }
    return customerListBatchAddToCartResponseSchema.parse({ data: { candidates, skipped } });
  });

  // ── POST wishlist toggle (ürün-seviyesi; idempotent) ────────────────────────
  app.post(`${base}/wishlist/toggle`, async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const customer = await requireCustomer(request, reply, store.id);
    if (!customer) return;
    const body = customerWishlistToggleRequestSchema.parse(request.body);
    // Ürün CANLI otoriteden doğrulanır (nonexistent/cross-store reddedilir).
    const products = await deps.catalog.findProductsByIds(store.id, [body.productId]);
    if (!products.find((p) => p.id === body.productId)) {
      return reply.code(404).send(errorBody("PRODUCT_NOT_FOUND", "Ürün bulunamadı."));
    }
    const wishlist = await data.ensureDefaultWishlist(store.id, customer.id);
    const existing = await data.findItemByProductVariant(wishlist.id, body.productId, null);
    const desired = body.saved ?? !existing; // saved verilmezse ters çevir
    if (desired && !existing) {
      const itemCount = await data.countItems(wishlist.id);
      if (itemCount >= CUSTOMER_LIST_MAX_ITEMS) {
        return reply.code(422).send(errorBody("LIST_ITEMS_LIMIT_REACHED", "Favori listesi sınırında."));
      }
      await data.addItemIdempotent({
        storeId: store.id,
        listId: wishlist.id,
        productId: body.productId,
        variantId: null,
        note: null,
        quantity: 1,
      });
    } else if (!desired && existing) {
      await data.deleteItem(existing.id);
    }
    return customerWishlistToggleResponseSchema.parse({
      data: { productId: body.productId, saved: desired },
    });
  });

  // ── POST wishlist status (batched) ──────────────────────────────────────────
  app.post(`${base}/wishlist/status`, async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const customer = await requireCustomer(request, reply, store.id);
    if (!customer) return;
    const body = customerWishlistStatusRequestSchema.parse(request.body);
    const wishlist = await data.ensureDefaultWishlist(store.id, customer.id);
    const saved = await data.wishlistProductIdSet(wishlist.id, body.productIds);
    return customerWishlistStatusResponseSchema.parse({
      data: { savedProductIds: [...saved] },
    });
  });

  // ── POST wishlist merge (guest → default; idempotent) ───────────────────────
  app.post(`${base}/wishlist/merge`, async (request, reply) => {
    const store = await requireStore(request, reply);
    if (!store) return;
    const customer = await requireCustomer(request, reply, store.id);
    if (!customer) return;
    const body = customerWishlistMergeRequestSchema.parse(request.body);
    const wishlist = await data.ensureDefaultWishlist(store.id, customer.id);

    // Bozuk/eski id'leri elemek için ürünleri CANLI otoriteden toplu doğrula.
    const productIds = [...new Set(body.items.map((i) => i.productId))];
    const products = await deps.catalog.findProductsByIds(store.id, productIds);
    const validProductIds = new Set(products.map((p) => p.id));

    let merged = 0;
    let skipped = 0;
    let itemCount = await data.countItems(wishlist.id);
    // Yalnız bütün-ürün favorisi merge edilir (wishlist favorisi ürün-seviyesidir).
    const seen = new Set<string>();
    for (const entry of body.items) {
      if (!validProductIds.has(entry.productId) || seen.has(entry.productId)) {
        if (!validProductIds.has(entry.productId)) skipped += 1;
        continue;
      }
      seen.add(entry.productId);
      if (itemCount >= CUSTOMER_LIST_MAX_ITEMS) {
        skipped += 1;
        continue;
      }
      try {
        const { alreadyExisted } = await data.addItemIdempotent({
          storeId: store.id,
          listId: wishlist.id,
          productId: entry.productId,
          variantId: null,
          note: null,
          quantity: 1,
        });
        merged += 1;
        if (!alreadyExisted) itemCount += 1;
      } catch (error) {
        // Kısmi hata sessiz veri kaybına yol açmasın: logla, atlanan say (merge sürer).
        deps.logger.warn("wishlist.merge.item_failed", {
          storeId: store.id,
          productId: entry.productId,
          error: error instanceof Error ? error.message : String(error),
        });
        skipped += 1;
      }
    }
    return customerWishlistMergeResponseSchema.parse({ data: { merged, skipped } });
  });
}

/**
 * Store-admin (platform-admin scope) — müşteri liste özeti (salt-okunur).
 * Ayrı register: bu uç `/stores/:storeId/customers/:customerId/list-summary`
 * altında ve platform-admin guard ile korunur (müşteri kimliği TAKLİT edilmez;
 * yalnız ASGARİ sayaç/tarih döner, öğe içeriği/davranış takibi GÖSTERİLMEZ).
 */
export interface CustomerListAdminRoutesDeps {
  data: CustomerListData;
  requireStoreAdmin: (
    request: FastifyRequest,
    reply: FastifyReply,
    storeId: string,
  ) => Promise<{ actorUserId: string } | null>;
}

export function registerCustomerListAdminRoutes(
  app: FastifyInstance,
  deps: CustomerListAdminRoutesDeps,
): void {
  app.get("/stores/:storeId/customers/:customerId/list-summary", async (request, reply) => {
    const { storeId, customerId } = request.params as { storeId: string; customerId: string };
    const access = await deps.requireStoreAdmin(request, reply, storeId);
    if (!access) return;
    const summary = await deps.data.adminSummary(storeId, customerId);
    return storeAdminCustomerListSummaryResponseSchema.parse({
      data: {
        listCount: summary.listCount,
        wishlistItemCount: summary.wishlistItemCount,
        totalItemCount: summary.totalItemCount,
        lastAddedAt: summary.lastAddedAt ? summary.lastAddedAt.toISOString() : null,
      },
    });
  });
}
