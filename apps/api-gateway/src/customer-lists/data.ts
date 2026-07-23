/**
 * TODO-159D (ADR-093) — Customer Lists & Wishlist — Prisma veri erişimi.
 *
 * SAF CRUD (katalog/fiyat/stok hidrasyonu YOK; o iş route katmanında enjekte edilen
 * katalog yardımcılarıyla yapılır). Tüm sorgular storeId + customerId ile scope'lanır
 * (tenant izolasyonu + ownership). Idempotency: `insertItem` P2002'yi çağırana bırakır;
 * `addItemIdempotent` check-then-insert + P2002 yutma ile idempotent davranır.
 */
import { prisma } from "@commerce-os/db";
import { Prisma } from "@prisma/client";

export interface CustomerListRecord {
  id: string;
  storeId: string;
  customerId: string;
  name: string;
  type: "WISHLIST" | "SHOPPING_LIST";
  visibility: "PRIVATE";
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomerListItemRecord {
  id: string;
  storeId: string;
  listId: string;
  productId: string;
  variantId: string | null;
  note: string | null;
  quantity: number;
  sortOrder: number;
  addedAt: Date;
}

/** Varsayılan wishlist adı (DB'de sabit; storefront isDefault için lokalize etiket gösterir). */
export const DEFAULT_WISHLIST_NAME = "Favorilerim";

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export interface CustomerListData {
  ensureDefaultWishlist(storeId: string, customerId: string): Promise<CustomerListRecord>;
  listListsWithCounts(
    storeId: string,
    customerId: string,
  ): Promise<Array<CustomerListRecord & { itemCount: number }>>;
  countCustomerLists(storeId: string, customerId: string): Promise<number>;
  findListByNameCI(
    storeId: string,
    customerId: string,
    name: string,
  ): Promise<CustomerListRecord | null>;
  createList(
    storeId: string,
    customerId: string,
    name: string,
  ): Promise<CustomerListRecord>;
  findList(
    storeId: string,
    customerId: string,
    listId: string,
  ): Promise<CustomerListRecord | null>;
  renameList(listId: string, name: string): Promise<CustomerListRecord>;
  deleteList(listId: string): Promise<void>;
  countItems(listId: string): Promise<number>;
  listItemsPage(
    listId: string,
    limit: number,
    offset: number,
  ): Promise<{ items: CustomerListItemRecord[]; total: number }>;
  listAllItems(listId: string, cap: number): Promise<CustomerListItemRecord[]>;
  findItemById(listId: string, itemId: string): Promise<CustomerListItemRecord | null>;
  findItemByProductVariant(
    listId: string,
    productId: string,
    variantId: string | null,
  ): Promise<CustomerListItemRecord | null>;
  addItemIdempotent(input: {
    storeId: string;
    listId: string;
    productId: string;
    variantId: string | null;
    note: string | null;
    quantity: number;
  }): Promise<{ item: CustomerListItemRecord; alreadyExisted: boolean }>;
  deleteItem(itemId: string): Promise<void>;
  moveItem(itemId: string, targetListId: string): Promise<void>;
  /**
   * Bütün-ürün öğelerinin fiyat/eklenebilir-varyant çözümü için: verilen ürünlerin
   * ACTIVE varyantları (fiyat artan). Tek batched sorgu (N+1 yok).
   */
  listActiveVariantsByProductIds(
    storeId: string,
    productIds: string[],
  ): Promise<
    Array<{
      id: string;
      productId: string;
      title: string;
      sku: string;
      priceMinor: number;
      compareAtMinor: number | null;
      currency: string;
    }>
  >;
  /** Default wishlist'te (variantId=NULL) favori olan productId kümesi (batched). */
  wishlistProductIdSet(
    wishlistId: string,
    productIds: string[],
  ): Promise<Set<string>>;
  adminSummary(
    storeId: string,
    customerId: string,
  ): Promise<{
    listCount: number;
    wishlistItemCount: number;
    totalItemCount: number;
    lastAddedAt: Date | null;
  }>;
}

export function createCustomerListData(): CustomerListData {
  return {
    async ensureDefaultWishlist(storeId, customerId) {
      const existing = await prisma.customerList.findFirst({
        where: { storeId, customerId, type: "WISHLIST", isDefault: true },
      });
      if (existing) return existing as CustomerListRecord;
      try {
        return (await prisma.customerList.create({
          data: {
            storeId,
            customerId,
            name: DEFAULT_WISHLIST_NAME,
            type: "WISHLIST",
            visibility: "PRIVATE",
            isDefault: true,
          },
        })) as CustomerListRecord;
      } catch (error) {
        // Yarış: başka istek aynı anda oluşturduysa kısmi unique reddeder → yeniden oku.
        if (isUniqueViolation(error)) {
          const row = await prisma.customerList.findFirst({
            where: { storeId, customerId, type: "WISHLIST", isDefault: true },
          });
          if (row) return row as CustomerListRecord;
        }
        throw error;
      }
    },

    async listListsWithCounts(storeId, customerId) {
      const lists = await prisma.customerList.findMany({
        where: { storeId, customerId },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        include: { _count: { select: { items: true } } },
      });
      return lists.map((list) => ({
        ...(list as unknown as CustomerListRecord),
        itemCount: list._count.items,
      }));
    },

    async countCustomerLists(storeId, customerId) {
      return prisma.customerList.count({ where: { storeId, customerId } });
    },

    async findListByNameCI(storeId, customerId, name) {
      const row = await prisma.customerList.findFirst({
        where: {
          storeId,
          customerId,
          isDefault: false,
          name: { equals: name, mode: "insensitive" },
        },
      });
      return (row as CustomerListRecord) ?? null;
    },

    async createList(storeId, customerId, name) {
      return (await prisma.customerList.create({
        data: {
          storeId,
          customerId,
          name,
          type: "SHOPPING_LIST",
          visibility: "PRIVATE",
          isDefault: false,
        },
      })) as CustomerListRecord;
    },

    async findList(storeId, customerId, listId) {
      const row = await prisma.customerList.findFirst({
        where: { id: listId, storeId, customerId },
      });
      return (row as CustomerListRecord) ?? null;
    },

    async renameList(listId, name) {
      return (await prisma.customerList.update({
        where: { id: listId },
        data: { name },
      })) as CustomerListRecord;
    },

    async deleteList(listId) {
      await prisma.customerList.delete({ where: { id: listId } });
    },

    async countItems(listId) {
      return prisma.customerListItem.count({ where: { listId } });
    },

    async listItemsPage(listId, limit, offset) {
      const [items, total] = await Promise.all([
        prisma.customerListItem.findMany({
          where: { listId },
          orderBy: [{ sortOrder: "asc" }, { addedAt: "desc" }],
          skip: offset,
          take: limit,
        }),
        prisma.customerListItem.count({ where: { listId } }),
      ]);
      return { items: items as CustomerListItemRecord[], total };
    },

    async listAllItems(listId, cap) {
      const items = await prisma.customerListItem.findMany({
        where: { listId },
        orderBy: [{ sortOrder: "asc" }, { addedAt: "desc" }],
        take: cap,
      });
      return items as CustomerListItemRecord[];
    },

    async findItemById(listId, itemId) {
      const row = await prisma.customerListItem.findFirst({
        where: { id: itemId, listId },
      });
      return (row as CustomerListItemRecord) ?? null;
    },

    async findItemByProductVariant(listId, productId, variantId) {
      const row = await prisma.customerListItem.findFirst({
        where: { listId, productId, variantId: variantId ?? null },
      });
      return (row as CustomerListItemRecord) ?? null;
    },

    async addItemIdempotent(input) {
      const existing = await prisma.customerListItem.findFirst({
        where: {
          listId: input.listId,
          productId: input.productId,
          variantId: input.variantId ?? null,
        },
      });
      if (existing) return { item: existing as CustomerListItemRecord, alreadyExisted: true };
      try {
        const created = await prisma.customerListItem.create({
          data: {
            storeId: input.storeId,
            listId: input.listId,
            productId: input.productId,
            variantId: input.variantId ?? null,
            note: input.note,
            quantity: input.quantity,
          },
        });
        return { item: created as CustomerListItemRecord, alreadyExisted: false };
      } catch (error) {
        // Yarış/çift-istek: unique reddederse mevcut satırı yeniden oku (idempotent).
        if (isUniqueViolation(error)) {
          const row = await prisma.customerListItem.findFirst({
            where: {
              listId: input.listId,
              productId: input.productId,
              variantId: input.variantId ?? null,
            },
          });
          if (row) return { item: row as CustomerListItemRecord, alreadyExisted: true };
        }
        throw error;
      }
    },

    async deleteItem(itemId) {
      await prisma.customerListItem.delete({ where: { id: itemId } });
    },

    async moveItem(itemId, targetListId) {
      await prisma.customerListItem.update({
        where: { id: itemId },
        data: { listId: targetListId },
      });
    },

    async listActiveVariantsByProductIds(storeId, productIds) {
      const unique = [...new Set(productIds)];
      if (unique.length === 0) return [];
      const rows = await prisma.productVariant.findMany({
        where: { storeId, productId: { in: unique }, status: "ACTIVE" },
        orderBy: { priceMinor: "asc" },
        select: {
          id: true,
          productId: true,
          title: true,
          sku: true,
          priceMinor: true,
          compareAtMinor: true,
          currency: true,
        },
      });
      return rows;
    },

    async wishlistProductIdSet(wishlistId, productIds) {
      if (productIds.length === 0) return new Set<string>();
      const rows = await prisma.customerListItem.findMany({
        where: {
          listId: wishlistId,
          variantId: null,
          productId: { in: [...new Set(productIds)] },
        },
        select: { productId: true },
      });
      return new Set(rows.map((row) => row.productId));
    },

    async adminSummary(storeId, customerId) {
      const lists = await prisma.customerList.findMany({
        where: { storeId, customerId },
        select: { id: true, type: true },
      });
      if (lists.length === 0) {
        return { listCount: 0, wishlistItemCount: 0, totalItemCount: 0, lastAddedAt: null };
      }
      const listIds = lists.map((list) => list.id);
      const wishlistIds = lists.filter((list) => list.type === "WISHLIST").map((list) => list.id);
      const [totalItemCount, wishlistItemCount, latest] = await Promise.all([
        prisma.customerListItem.count({ where: { storeId, listId: { in: listIds } } }),
        wishlistIds.length > 0
          ? prisma.customerListItem.count({ where: { storeId, listId: { in: wishlistIds } } })
          : Promise.resolve(0),
        prisma.customerListItem.findFirst({
          where: { storeId, listId: { in: listIds } },
          orderBy: { addedAt: "desc" },
          select: { addedAt: true },
        }),
      ]);
      return {
        listCount: lists.length,
        wishlistItemCount,
        totalItemCount,
        lastAddedAt: latest?.addedAt ?? null,
      };
    },
  };
}
