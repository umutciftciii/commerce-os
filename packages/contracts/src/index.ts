import { z } from "zod";
// Sema dogrulamalarinda kullanilan saf yardimcilarin yerel referanslari.
import {
  isValidTckn,
  isValidTaxNumber,
  isValidTrPhone,
  isValidIban,
} from "./validators.js";
// TODO-165A (ADR-165A) — governed taksonomi TIP/durum listeleri TEK OTORITE
// `product-taxonomy.ts`'dendir; `productTaxonomyTypeSchema`/`productTaxonomyStatusSchema`
// bu listelerden TUREtilir (hardcoded ikinci bir kopya TUTULMAZ — drift riski).
import type { ProductTaxonomyType, ProductTaxonomyStatus } from "./product-taxonomy.js";
import { PRODUCT_TAXONOMY_TYPES, PRODUCT_TAXONOMY_STATUSES } from "./product-taxonomy.js";

const jsonRecordSchema = z.record(z.unknown());
const slugSchema = z.string().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const skuSchema = z.string().min(1).max(80).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);
// TODO-160A (ADR-110) — SKU governance kaynagi. AUTO=generator uretti, MANUAL=kullanici override etti,
// IMPORTED=disaridan geldi. Barcode ile karistirilmaz (ayri kavram).
export const skuSourceSchema = z.enum(["AUTO", "MANUAL", "IMPORTED"]);
export type SkuSource = z.infer<typeof skuSourceSchema>;
const currencySchema = z.string().length(3).regex(/^[A-Z]{3}$/);
const optionalNullableStringSchema = z.string().max(500).nullable().optional();

/* ────────────────────────────────────────────────────────────────────────────
 * Paylasilan dogrulama yardimcilari (TCKN/VKN/IBAN/TR-telefon + kart) artik SAF
 * `./validators` modulunde yasar (zod bagimliligi YOK). Buradan tam yuzeyi
 * re-export ederiz; boylece `@commerce-os/contracts` tuketicileri icin API
 * degismeden kalir, client component'ler ise `@commerce-os/api-client/validators`
 * uzerinden yalniz saf yardimcilari (createApiClient/zod sizmadan) alir.
 * ──────────────────────────────────────────────────────────────────────────── */
export * from "./validators.js";

// TODO-165 Fashion Vertical (ADR-248) — typed size-system registry (SAF, zod'suz). Ana
// yuzeyden re-export edilir; client component'ler zod sizmadan `@commerce-os/contracts/
// size-systems` altpath'inden tuketebilir.
export * from "./size-systems.js";

// TODO-165A (ADR-165A) — typed Product Taxonomy registry (SAF, zod'suz). Ana yuzeyden
// re-export edilir; client component'ler zod sizmadan `@commerce-os/contracts/
// product-taxonomy` altpath'inden tuketebilir.
export * from "./product-taxonomy.js";

export const healthResponseSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  service: z.string(),
  timestamp: z.string().datetime(),
});

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    details: z.unknown().optional(),
  }),
});

export const tenantContextSchema = z.object({
  storeId: z.string().min(1),
  storeUserId: z.string().min(1),
  role: z.enum(["OWNER", "ADMIN", "MANAGER", "STAFF", "VIEWER"]),
});

/* ════════════════════════════════════════════════════════════════════════════
 * TODO-159A (ADR-089) — Admin Data Grid ortak liste sözleşmesi.
 *
 * Store Admin'deki her sunucu-taraflı liste ekranı AYNI query ve AYNI pagination
 * meta'sını konuşur: `page`/`pageSize`/`search`/`sortBy`/`sortOrder` + modüle özel
 * filtreler. `sortBy` her modülde KENDİ allowlist enum'u ile daraltılır (serbest
 * metin ASLA orderBy'a geçmez).
 *
 * Pagination meta'sı GERİYE UYUMLUDUR: eski `{limit,offset,total}` üçlüsü aynen
 * KORUNUR (mevcut tüketiciler bozulmaz), üzerine `page/pageSize/totalItems/
 * totalPages` EKLENİR. Tek doğruluk kaynağı `buildAdminListPagination` —
 * limit=pageSize, offset=(page-1)*pageSize, totalItems=total türetilir.
 * ════════════════════════════════════════════════════════════════════════════ */

/** UI'da sunulan sayfa boyutu seçenekleri (varsayılan 25). */
export const ADMIN_LIST_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
export const ADMIN_LIST_DEFAULT_PAGE_SIZE = 25;
/** Sunucu tarafında ZORLANAN üst sınır — istemci ne gönderirse göndersin aşılamaz. */
export const ADMIN_LIST_MAX_PAGE_SIZE = 100;
/** Serbest metin arama üst sınırı (pahalı LIKE taramasını sınırlar). */
export const ADMIN_LIST_MAX_SEARCH_LENGTH = 120;

export const adminListSortOrderSchema = z.enum(["asc", "desc"]);

/**
 * Her admin liste ucunun ortak query tabanı. Modüller bunu `.extend({...})` ile
 * kendi `sortBy` allowlist'i ve filtreleriyle genişletir.
 *
 * `limit`/`offset` GERİYE UYUMLULUK için kabul edilir: yalnız `page`/`pageSize`
 * verilmediğinde devreye girer (bkz. `resolveAdminListPage`). Böylece eski
 * istemciler (ve gateway-içi çağrılar) kırılmaz.
 */
export const adminListQueryBaseSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(ADMIN_LIST_MAX_PAGE_SIZE).optional(),
  limit: z.coerce.number().int().positive().max(ADMIN_LIST_MAX_PAGE_SIZE).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
  search: z.string().trim().min(1).max(ADMIN_LIST_MAX_SEARCH_LENGTH).optional(),
  sortOrder: adminListSortOrderSchema.optional(),
});

/** Liste response'larının ortak pagination meta'sı (legacy üçlü + Data Grid alanları). */
export const adminListPaginationSchema = z.object({
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

/**
 * `page`/`pageSize` ile `limit`/`offset`'i TEK bir sayfa tanımına indirger.
 * Öncelik: page/pageSize > limit/offset > varsayılan. pageSize her hâlükârda
 * `ADMIN_LIST_MAX_PAGE_SIZE` ile kırpılır (sunucu-otoriter üst sınır).
 */
export function resolveAdminListPage(
  query: { page?: number; pageSize?: number; limit?: number; offset?: number },
  defaultPageSize: number = ADMIN_LIST_DEFAULT_PAGE_SIZE,
): { page: number; pageSize: number; limit: number; offset: number } {
  const pageSize = Math.min(
    ADMIN_LIST_MAX_PAGE_SIZE,
    Math.max(1, query.pageSize ?? query.limit ?? defaultPageSize),
  );
  const page =
    query.page ??
    (query.offset !== undefined ? Math.floor(query.offset / pageSize) + 1 : 1);
  const safePage = Math.max(1, page);
  return { page: safePage, pageSize, limit: pageSize, offset: (safePage - 1) * pageSize };
}

/** Pagination meta'sını üretir (legacy alanlar dahil). `totalPages` boş sonuçta 0'dır. */
export function buildAdminListPagination(input: {
  page: number;
  pageSize: number;
  totalItems: number;
}): z.infer<typeof adminListPaginationSchema> {
  const { page, pageSize, totalItems } = input;
  return {
    limit: pageSize,
    offset: (page - 1) * pageSize,
    total: totalItems,
    page,
    pageSize,
    totalItems,
    totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize),
  };
}

export type AdminListSortOrder = z.infer<typeof adminListSortOrderSchema>;
export type AdminListPagination = z.infer<typeof adminListPaginationSchema>;

/* ════════════════════════════════════════════════════════════════════════════
 * TODO-159B (ADR-090) — Admin Searchable Selector ortak sözleşmesi.
 *
 * Seçici uçları Data Grid sözleşmesinin (ADR-089) TÜRETİLMİŞ bir dalıdır: aynı
 * `page`/`pageSize`/`search`/`sortBy`/`sortOrder` + aynı pagination meta'sı. İki
 * fark vardır:
 *
 *  1. PROJEKSİYON: seçici satırı entity'nin TAMAMINI değil, seçim için gereken
 *     asgari alanları taşır (ürün detay payload'ı seçiciye girmez).
 *  2. `ids` MODU: `ids` verildiğinde uç "seçili kaydı çöz" moduna geçer — arama
 *     ve filtreler UYGULANMAZ, yalnız verilen id'ler (mağaza içinde) döner.
 *     Böylece düzenleme ekranı, seçili kayıt arama sonucunun/sayfanın dışında
 *     kalsa bile onu gösterebilir; "seçileni bulmak için tüm kataloğu çek"
 *     ihtiyacı ORTADAN KALKAR.
 *
 * `ids` istemci tarafından CSV olarak taşınır (`?ids=a,b,c`). Üst sınır
 * `ADMIN_SELECTOR_MAX_IDS`'tir: sınırsız IN(...) listesi kabul edilmez.
 * ════════════════════════════════════════════════════════════════════════════ */

/** Tek istekte çözülebilecek en fazla seçili kayıt (IN(...) üst sınırı). */
export const ADMIN_SELECTOR_MAX_IDS = 100;

/** Seçici modallarının varsayılan sayfa boyutu (liste ekranlarıyla aynı). */
export const ADMIN_SELECTOR_DEFAULT_PAGE_SIZE = ADMIN_LIST_DEFAULT_PAGE_SIZE;

/**
 * `?ids=a,b,c` CSV'sini benzersiz id dizisine indirger. Boş parçalar atılır,
 * sıra KORUNUR (istemci seçim sırasını göstermek isteyebilir) ve dizi
 * `ADMIN_SELECTOR_MAX_IDS` ile kırpılır — sunucu-otoriter üst sınır.
 */
export function parseSelectorIds(raw: string | undefined | null): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const part of raw.split(",")) {
    const id = part.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= ADMIN_SELECTOR_MAX_IDS) break;
  }
  return ids;
}

/**
 * Her seçici ucunun ortak query tabanı. Modüller `.extend({...})` ile kendi
 * `sortBy` allowlist'ini ve filtrelerini ekler.
 *
 * `ids` uzunluk sınırı: en fazla `ADMIN_SELECTOR_MAX_IDS` adet id + ayraç.
 * Ham uzunluk sınırı ilk savunma katmanıdır (devasa query string reddi);
 * gerçek kırpma `parseSelectorIds` içindedir.
 */
export const adminSelectorQueryBaseSchema = adminListQueryBaseSchema.extend({
  ids: z
    .string()
    .trim()
    .min(1)
    .max(ADMIN_SELECTOR_MAX_IDS * 64)
    .optional(),
});

/**
 * `ids` modunun pagination meta'sı. Çözüm modu SAYFALANMAZ (tek atışta en çok
 * `ADMIN_SELECTOR_MAX_IDS` kayıt döner); meta yine de ortak şekli korur ki
 * istemci tek bir okuma yolu kullansın. `totalPages` boş sonuçta 0'dır.
 */
export function buildSelectorIdsPagination(totalItems: number): AdminListPagination {
  const pageSize = Math.max(1, Math.min(ADMIN_SELECTOR_MAX_IDS, totalItems));
  return buildAdminListPagination({ page: 1, pageSize, totalItems });
}

export type AdminSelectorQueryBase = z.infer<typeof adminSelectorQueryBaseSchema>;

export const platformEventSchema = z.object({
  type: z.enum([
    "STORE_CREATED",
    "STORE_UPDATED",
    "USER_INVITED",
    "SUBSCRIPTION_CHANGED",
    "SYSTEM_EVENT",
  ]),
  storeId: z.string().min(1).optional(),
  payload: z.record(z.unknown()).default({}),
  occurredAt: z.string().datetime(),
});

// TODO-154 (ADR-079) — Faz 2C-8A · Search index job kontratı. api-gateway mutation'ları bu job'ları
// `search-index` kuyruğuna koyar; worker `search-service` provider'ıyla işler. İş idempotent + job'lar
// deterministik jobId taşır (bekleyen duplicate'lar tekleşir). Şema değişimi (kategori/attribute) →
// `reindex-store` (provider chunk'lar; kontrollü batch). Payload SECRET/PII taşımaz (yalnız id'ler).
export const searchIndexJobSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("reindex-product"),
    storeId: z.string().min(1),
    productId: z.string().min(1),
  }),
  z.object({
    kind: z.literal("remove-product"),
    storeId: z.string().min(1),
    productId: z.string().min(1),
  }),
  z.object({
    kind: z.literal("reindex-products"),
    storeId: z.string().min(1),
    productIds: z.array(z.string().min(1)).min(1).max(1000),
  }),
  z.object({
    kind: z.literal("reindex-store"),
    storeId: z.string().min(1),
  }),
]);
export type SearchIndexJob = z.infer<typeof searchIndexJobSchema>;

export const platformUserSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  name: z.string().nullable(),
  role: z.enum(["SUPER_ADMIN", "SUPPORT_ADMIN"]),
});

export const platformLoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  // ADR-271 — "Beni hatirla". Server-otoriter oturum penceresini secer
  // (kapali: idle 30dk/abs 8s, acik: idle 7g/abs 30g). Varsayilan KAPALI.
  rememberMe: z.boolean().optional().default(false),
});

export const platformLoginResponseSchema = z.object({
  token: z.string().min(1),
  expiresAt: z.string().datetime(),
  user: platformUserSchema,
});

// ADR-271 — istemci uyari/geri-sayim + oturum yonetimi UX'i icin oturum zamanlamasi.
// idleExpiresAt = lastActivityAt + idleTimeout; absoluteExpiresAt = mutlak tavan.
// warningLeadSeconds = idle bitimine kac saniye kala uyari. Hepsi opsiyonel
// (geriye uyumlu; eski istemci yok sayar).
export const sessionTimingSchema = z.object({
  idleExpiresAt: z.string().datetime(),
  absoluteExpiresAt: z.string().datetime(),
  warningLeadSeconds: z.number().int().nonnegative(),
  rememberMe: z.boolean(),
  lastActivityAt: z.string().datetime(),
});

export const platformMeResponseSchema = z.object({
  user: platformUserSchema,
  session: z.object({
    id: z.string().min(1),
    expiresAt: z.string().datetime(),
    timing: sessionTimingSchema.optional(),
  }),
});

export const platformLogoutResponseSchema = z.object({
  revoked: z.boolean(),
});

// ADR-271 — oturum uzatma (extend): token ROTATE edilir; yeni token + zamanlama
// doner (BFF cookie'yi yeni token ile yeniden yazar). absoluteExpiresAt DEGISMEZ.
export const platformSessionExtendResponseSchema = z.object({
  token: z.string().min(1),
  expiresAt: z.string().datetime(),
  timing: sessionTimingSchema,
});

export const storeStatusSchema = z.enum(["DRAFT", "ACTIVE", "SUSPENDED", "CLOSED"]);

export const adminStoreSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  domain: z.string().min(3).max(255).nullable(),
  status: storeStatusSchema,
  metadata: jsonRecordSchema.nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const adminStoreListResponseSchema = z.object({
  data: z.array(adminStoreSchema),
  pagination: z.object({
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
});

export const adminStoreCreateRequestSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().min(3).max(80).regex(/^[a-z0-9-]+$/),
  status: storeStatusSchema.default("DRAFT"),
  domain: z.string().min(3).max(255).optional(),
  metadata: jsonRecordSchema.optional(),
});

export const adminStoreUpdateRequestSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    status: storeStatusSchema.optional(),
    metadata: jsonRecordSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

export const planSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  metadata: jsonRecordSchema.nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const planListResponseSchema = z.object({
  data: z.array(planSchema),
  pagination: z.object({
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
});

export const planCreateRequestSchema = z.object({
  code: z.string().min(2).max(80).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  metadata: jsonRecordSchema.optional(),
});

export const planUpdateRequestSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(500).nullable().optional(),
    metadata: jsonRecordSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

export const productStatusSchema = z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]);
export const productTypeSchema = z.enum(["PHYSICAL"]);
export const productSalesModeSchema = z.enum(["ONLINE", "INQUIRY", "APPOINTMENT", "WHATSAPP", "CATALOG_ONLY"]);
export const productPriceVisibilitySchema = z.enum(["VISIBLE", "HIDDEN", "STARTING_FROM", "ON_REQUEST"]);
export const productPrimaryActionSchema = z.enum([
  "ADD_TO_CART",
  "REQUEST_PRICE",
  "BOOK_APPOINTMENT",
  "WHATSAPP",
  "CONTACT_FORM",
  "NONE",
]);
export const productVariantStatusSchema = z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]);
export const productCategoryStatusSchema = z.enum(["ACTIVE", "ARCHIVED"]);
export const inventoryMovementTypeSchema = z.enum([
  "ADJUSTMENT",
  "SALE_RESERVATION",
  "SALE_RELEASE",
  "RETURN",
  "IMPORT",
]);
export const customerStatusSchema = z.enum(["ACTIVE", "ARCHIVED"]);
export const addressTypeSchema = z.enum(["SHIPPING", "BILLING"]);
export const orderStatusSchema = z.enum(["DRAFT", "PLACED", "CONFIRMED", "CANCELLED", "FULFILLED"]);
// TODO-159F (ADR-095) — Genişletilmiş sipariş ödeme durum makinesi. Tek otorite
// `apps/api-gateway/src/payments/payment-state.ts`. ADDITIVE: eski değerler korunur.
export const paymentStatusSchema = z.enum([
  "UNPAID",
  "PAYMENT_PENDING",
  "AUTHORIZED",
  "PAID",
  "PARTIALLY_REFUNDED",
  "REFUNDED",
  "PAYMENT_FAILED",
  "CANCELLED",
]);
export const fulfillmentStatusSchema = z.enum(["UNFULFILLED", "PARTIAL", "FULFILLED", "CANCELLED"]);
export const inventoryReservationStatusSchema = z.enum(["ACTIVE", "RELEASED", "CONSUMED", "EXPIRED"]);

/**
 * TODO-135 — Sipariş özet/liste DTO'larında kargo HAZIRLIK durumunu rozete
 * yansıtmak için erken tanımlı (TDZ-safe) kargo durum enum'u. Değerler
 * `shipmentStatusValueSchema` ile AYNIdır; modül sırası nedeniyle burada da
 * tanımlanır (Fable'ın shipment şeması korunur — refactor edilmez). Yalnız DURUM
 * enum'u taşınır; statusText/iç ID/ham payload TAŞINMAZ.
 */
export const orderSummaryShipmentStatusSchema = z.enum([
  "DRAFT",
  "ORDER_CREATED",
  "LABEL_PENDING",
  "LABEL_CREATED",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "DELIVERY_FAILED",
  "RETURNED",
  "CANCELLED",
  "FAILED",
]);
export type OrderSummaryShipmentStatus = z.infer<typeof orderSummaryShipmentStatusSchema>;

/**
 * TODO-135/TODO-136 — Sipariş listesi/başlık karşılama rozetinin GÖSTERİM durumu.
 * Kargo (shipment) durumu VARSA rozet ondan türetilir; `Order.fulfillmentStatus`
 * MUTATE EDİLMEZ (bu yalnız gösterim eşlemesidir). ADR-045: ORDER_CREATED fiziksel
 * "kargoya verildi" DEĞİL → asla SHIPPED/IN_TRANSIT/DELIVERED sayılmaz.
 *
 * TODO-136 — Operasyonel netlik için hazırlık aşaması iki gösterim durumuna ayrıldı:
 *   AWAITING_PICKUP ("Kargonun Alınması Bekleniyor") = ORDER_CREATED (kargo kaydı açıldı,
 *     kurye henüz almadı) ve LABEL_PENDING.
 *   PACKED ("Kargo İçin Paketlendi") = LABEL_CREATED (barkod/etiket hazır, paket teslim
 *     için hazır) — kurye fiziksel teslim aldı ANLAMINA GELMEZ.
 *   OUT_FOR_DELIVERY ("Dağıtımda") artık IN_TRANSIT'e çökmez, ayrı gösterilir.
 */
export type OrderFulfillmentDisplay =
  | "NOT_SHIPPED"
  | "AWAITING_PICKUP"
  | "PACKED"
  | "IN_TRANSIT"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "FULFILLED"
  | "PARTIAL"
  | "CANCELLED";

/**
 * Öncelik:
 *   iptal sipariş → CANCELLED
 *   shipment DELIVERED → DELIVERED
 *   shipment OUT_FOR_DELIVERY → OUT_FOR_DELIVERY ("Dağıtımda")
 *   shipment IN_TRANSIT → IN_TRANSIT ("Yolda")
 *   shipment LABEL_CREATED → PACKED ("Kargo İçin Paketlendi")
 *   shipment ORDER_CREATED/LABEL_PENDING → AWAITING_PICKUP ("Kargonun Alınması Bekleniyor")
 *   (shipment yok / DRAFT / iptal-iade-başarısız) → fulfillmentStatus'e düş
 *     FULFILLED → FULFILLED, PARTIAL → PARTIAL, aksi → NOT_SHIPPED ("Hazırlanıyor")
 */
export function getOrderFulfillmentDisplay(
  fulfillmentStatus: FulfillmentStatus,
  shipmentStatus: OrderSummaryShipmentStatus | null | undefined,
): OrderFulfillmentDisplay {
  if (fulfillmentStatus === "CANCELLED") return "CANCELLED";
  switch (shipmentStatus) {
    case "DELIVERED":
      return "DELIVERED";
    case "OUT_FOR_DELIVERY":
      return "OUT_FOR_DELIVERY";
    case "IN_TRANSIT":
      return "IN_TRANSIT";
    case "LABEL_CREATED":
      return "PACKED";
    case "ORDER_CREATED":
    case "LABEL_PENDING":
      return "AWAITING_PICKUP";
    // DRAFT / DELIVERY_FAILED / RETURNED / CANCELLED / FAILED / null → sipariş seviyesine düş.
    default:
      break;
  }
  switch (fulfillmentStatus) {
    case "FULFILLED":
      return "FULFILLED";
    case "PARTIAL":
      return "PARTIAL";
    default:
      return "NOT_SHIPPED";
  }
}

/**
 * TODO-136 — Ödeme uygunluğu (gönderi oluşturma ön koşulu). Ödemesi ALINMAMIŞ sipariş
 * kargoya VERİLEMEZ. Mevcut alan semantiği (server.ts): mock ödeme akışında PAID ve
 * AUTHORIZED "başarılı ödeme"dir (paidAt işaretlenir, gelir sayılır → succeeded);
 * UNPAID ve REFUNDED uygun DEĞİLdir. Saf/deterministik — hem gateway prepare guard'ı
 * hem store-admin UI aynı otoriteyi kullanır (yeni lifecycle EKLEMEZ).
 */
export function isOrderPaidForShipment(paymentStatus: PaymentStatus): boolean {
  return paymentStatus === "PAID" || paymentStatus === "AUTHORIZED";
}

/**
 * TODO-135 — Bir siparişin BİRDEN ÇOK gönderisi olabilir; rozette gösterilecek
 * TEMSİLİ kargo durumunu, "en ileri" pozitif ilerleme durumunu seçerek belirler.
 * İptal/iade/başarısız (terminal-olumsuz) durumlar 0 sayılır ve — tek olan onlarsa —
 * `null` döner (rozet sipariş seviyesine düşer). Saf/deterministik.
 */
const ORDER_SHIPMENT_STATUS_RANK: Record<OrderSummaryShipmentStatus, number> = {
  DELIVERED: 7,
  OUT_FOR_DELIVERY: 6,
  IN_TRANSIT: 5,
  LABEL_CREATED: 4,
  LABEL_PENDING: 3,
  ORDER_CREATED: 2,
  DRAFT: 1,
  DELIVERY_FAILED: 0,
  RETURNED: 0,
  CANCELLED: 0,
  FAILED: 0,
};

export function pickOrderShipmentStatus(
  statuses: ReadonlyArray<OrderSummaryShipmentStatus | string>,
): OrderSummaryShipmentStatus | null {
  let best: OrderSummaryShipmentStatus | null = null;
  let bestRank = 0;
  for (const raw of statuses) {
    const status = raw as OrderSummaryShipmentStatus;
    const rank = ORDER_SHIPMENT_STATUS_RANK[status];
    if (rank === undefined || rank <= 0) continue;
    if (rank > bestRank) {
      best = status;
      bestRank = rank;
    }
  }
  return best;
}

export const productCategorySchema = z.object({
  id: z.string().min(1),
  storeId: z.string().min(1),
  name: z.string().min(1),
  slug: slugSchema,
  parentId: z.string().min(1).nullable(),
  sortOrder: z.number().int(),
  status: productCategoryStatusSchema,
  // ADR-065 (Faz 2/Dilim 3) — opsiyonel tekil kategori gorseli. imageId ham FK
  // (edit modunda MediaUpload value'sunun kimligi icin), imageUrl ise runtime'da
  // storageKey'den turetilen public URL (render icin). Entity kendi GET'inden
  // gorselini dondurur (ProductImage.url ile tutarli).
  imageId: z.string().nullable(),
  imageUrl: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const productCategoryListResponseSchema = z.object({
  data: z.array(productCategorySchema),
  // TODO-159A (ADR-089) — ortak Data Grid meta'sı (legacy limit/offset/total KORUNUR).
  pagination: adminListPaginationSchema,
});

/**
 * TODO-159A (ADR-089) — Kategori liste query sözleşmesi. Arama ad + slug üzerinde.
 * Varsayılan sıra `sortOrder` (merchandising sırası) — kategori ağacının anlamlı
 * varsayılanı budur; `name`/`createdAt` allowlist'te alternatiftir.
 */
export const adminCategoryListSortBySchema = z.enum(["sortOrder", "name", "createdAt"]);

export const adminCategoryListQuerySchema = adminListQueryBaseSchema.extend({
  sortBy: adminCategoryListSortBySchema.optional(),
  status: productCategoryStatusSchema.optional(),
});

export type AdminCategoryListSortBy = z.infer<typeof adminCategoryListSortBySchema>;
export type AdminCategoryListQuery = z.infer<typeof adminCategoryListQuerySchema>;

/* ────────────────────────────────────────────────────────────────────────────
 * TODO-159B (ADR-090) — Kategori SEÇİCİ sözleşmesi.
 *
 * `path` kategorinin kökten kendisine kadar olan AD zinciridir
 * (`["Elektronik","Bilgisayar","Ekran Kartı"]`). UI bunu "Elektronik / Bilgisayar
 * / Ekran Kartı" olarak gösterir; böylece aynı adı taşıyan iki kategori
 * karıştırılmaz. Zincir sunucuda SEVİYE SEVİYE batched çözülür (satır başına
 * sorgu YOK) ve tüm kategori ağacı hiçbir istekte baştan yüklenmez.
 * ──────────────────────────────────────────────────────────────────────────── */

export const adminCategorySelectorSortBySchema = z.enum(["name", "sortOrder", "createdAt"]);

export const adminCategorySelectorQuerySchema = adminSelectorQueryBaseSchema.extend({
  sortBy: adminCategorySelectorSortBySchema.optional(),
  status: productCategoryStatusSchema.optional(),
});

export const adminCategorySelectorOptionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  slug: slugSchema,
  status: productCategoryStatusSchema,
  parentId: z.string().min(1).nullable(),
  /** Kökten kendisine AD zinciri; son eleman kategorinin kendi adıdır (en az 1). */
  path: z.array(z.string().min(1)).min(1),
});

export const adminCategorySelectorResponseSchema = z.object({
  data: z.array(adminCategorySelectorOptionSchema),
  pagination: adminListPaginationSchema,
});

export type AdminCategorySelectorSortBy = z.infer<typeof adminCategorySelectorSortBySchema>;
export type AdminCategorySelectorQuery = z.infer<typeof adminCategorySelectorQuerySchema>;
export type AdminCategorySelectorOption = z.infer<typeof adminCategorySelectorOptionSchema>;
export type AdminCategorySelectorResponse = z.infer<typeof adminCategorySelectorResponseSchema>;

export const productCategoryCreateRequestSchema = z.object({
  name: z.string().min(1).max(160),
  slug: slugSchema,
  parentId: z.string().min(1).nullable().optional(),
  sortOrder: z.number().int().default(0),
  status: productCategoryStatusSchema.default("ACTIVE"),
  // ADR-065 (Faz 2/Dilim 3) — opsiyonel; null = gorsel yok. Tenant/context
  // dogrulamasi route katmaninda yapilir (cross-tenant baglama reddi).
  imageId: z.string().min(1).nullable().optional(),
});

export const productCategoryUpdateRequestSchema = z
  .object({
    name: z.string().min(1).max(160).optional(),
    slug: slugSchema.optional(),
    parentId: z.string().min(1).nullable().optional(),
    sortOrder: z.number().int().optional(),
    status: productCategoryStatusSchema.optional(),
    // ADR-065 (Faz 2/Dilim 3) — null gonderilirse gorsel kaldirilir (FK NULL).
    // refine "en az bir alan" kontrolu bu alani da sayar; yalniz imageId ile
    // gelen "sadece gorseli degistir/kaldir" istegi gecerlidir.
    imageId: z.string().min(1).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

/* ════════════════════════════════════════════════════════════════════════════
 * TODO-165A (ADR-165A) — Product Data Governance: Brand (Marka) sozlesmeleri.
 *
 * Product.brand (legacy serbest metin) DORMANT kalir; governed marka yazma yolu
 * bu tablo + `Product.brandId` uzerindendir (bkz. productCreateRequestSchema/
 * productUpdateRequestSchema `brandId` uzantisi asagida). logoUrl/coverUrl runtime'da
 * logoMediaId/coverMediaId'den turetilir (ProductCategory imageId/imageUrl deseniyle
 * ayni), ham medya id'leri edit modu icindir.
 * ════════════════════════════════════════════════════════════════════════════ */

export const brandStatusSchema = z.enum(["ACTIVE", "ARCHIVED"]);

export const brandSchema = z.object({
  id: z.string().min(1),
  storeId: z.string().min(1),
  name: z.string().min(1),
  slug: slugSchema,
  description: z.string().nullable(),
  logoMediaId: z.string().nullable(),
  logoUrl: z.string().nullable(),
  coverMediaId: z.string().nullable(),
  coverUrl: z.string().nullable(),
  websiteUrl: z.string().nullable(),
  status: brandStatusSchema,
  seoTitle: z.string().nullable(),
  seoDescription: z.string().nullable(),
  // Turetilmis (COUNT) — admin liste/detay siralama ve gosterim icin.
  productCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Brand = z.infer<typeof brandSchema>;

export const brandListResponseSchema = z.object({
  data: z.array(brandSchema),
  pagination: adminListPaginationSchema,
});
export const brandResponseSchema = z.object({ data: brandSchema });
export type BrandListResponse = z.infer<typeof brandListResponseSchema>;
export type BrandResponse = z.infer<typeof brandResponseSchema>;

export const brandCreateRequestSchema = z.object({
  name: z.string().min(1).max(160),
  slug: slugSchema.optional(),
  description: z.string().max(2000).nullable().optional(),
  logoMediaId: z.string().min(1).nullable().optional(),
  coverMediaId: z.string().min(1).nullable().optional(),
  websiteUrl: z.string().max(500).nullable().optional(),
  status: brandStatusSchema.default("ACTIVE"),
  seoTitle: z.string().max(160).nullable().optional(),
  seoDescription: z.string().max(320).nullable().optional(),
});
export type BrandCreateRequest = z.infer<typeof brandCreateRequestSchema>;

export const brandUpdateRequestSchema = z
  .object({
    name: z.string().min(1).max(160).optional(),
    slug: slugSchema.optional(),
    description: z.string().max(2000).nullable().optional(),
    logoMediaId: z.string().min(1).nullable().optional(),
    coverMediaId: z.string().min(1).nullable().optional(),
    websiteUrl: z.string().max(500).nullable().optional(),
    status: brandStatusSchema.optional(),
    seoTitle: z.string().max(160).nullable().optional(),
    seoDescription: z.string().max(320).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });
export type BrandUpdateRequest = z.infer<typeof brandUpdateRequestSchema>;

/** TODO-159A (ADR-089) — Marka liste query sozlesmesi. */
export const adminBrandListSortBySchema = z.enum(["name", "createdAt", "productCount"]);

export const adminBrandListQuerySchema = adminListQueryBaseSchema.extend({
  sortBy: adminBrandListSortBySchema.optional(),
  status: brandStatusSchema.optional(),
});
export type AdminBrandListSortBy = z.infer<typeof adminBrandListSortBySchema>;
export type AdminBrandListQuery = z.infer<typeof adminBrandListQuerySchema>;

/** TODO-159B (ADR-090) — Marka SECICI sozlesmesi (dual `?ids=` modu, bkz. adminSelectorQueryBaseSchema). */
export const adminBrandSelectorSortBySchema = z.enum(["name", "createdAt"]);

export const adminBrandSelectorQuerySchema = adminSelectorQueryBaseSchema.extend({
  sortBy: adminBrandSelectorSortBySchema.optional(),
  status: brandStatusSchema.optional(),
});

export const adminBrandSelectorOptionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  slug: slugSchema,
  status: brandStatusSchema,
  logoUrl: z.string().nullable(),
});

export const adminBrandSelectorResponseSchema = z.object({
  data: z.array(adminBrandSelectorOptionSchema),
  pagination: adminListPaginationSchema,
});
export type AdminBrandSelectorSortBy = z.infer<typeof adminBrandSelectorSortBySchema>;
export type AdminBrandSelectorQuery = z.infer<typeof adminBrandSelectorQuerySchema>;
export type AdminBrandSelectorOption = z.infer<typeof adminBrandSelectorOptionSchema>;
export type AdminBrandSelectorResponse = z.infer<typeof adminBrandSelectorResponseSchema>;

/** Public (storefront) — PLP/PDP marka projeksiyonu (kart/rozet icin asgari alan). */
export const publicBrandSummarySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  slug: slugSchema,
  logoUrl: z.string().nullable(),
  description: z.string().nullable(),
});
export type PublicBrandSummary = z.infer<typeof publicBrandSummarySchema>;

/** Public (storefront) — marka vitrin sayfasi projeksiyonu (ozet + kapak/SEO/urun sayisi). */
export const publicBrandDetailSchema = publicBrandSummarySchema.extend({
  coverUrl: z.string().nullable(),
  websiteUrl: z.string().nullable(),
  seoTitle: z.string().nullable(),
  seoDescription: z.string().nullable(),
  productCount: z.number().int().nonnegative(),
});
export type PublicBrandDetail = z.infer<typeof publicBrandDetailSchema>;

/** TODO-165A (Task 11) — `GET /public/stores/:slug/brands` govdesi (ACTIVE + >=1 gorunur urunlu markalar). */
export const publicBrandListResponseSchema = z.object({
  data: z.array(publicBrandSummarySchema),
});
export type PublicBrandListResponse = z.infer<typeof publicBrandListResponseSchema>;

/** TODO-165A (Task 11) — `GET /public/stores/:slug/brands/:brandSlug` govdesi. */
export const publicBrandDetailResponseSchema = z.object({
  data: publicBrandDetailSchema,
});
export type PublicBrandDetailResponse = z.infer<typeof publicBrandDetailResponseSchema>;

/**
 * TODO-165A (ADR-165A) Task 15/16 gap — `GET /:brandId/products` COUNT-ONLY'den GERÇEK
 * (sayfalanmış) ürün listesine YÜKSELTİLDİ. Admin "Bağlı ürünler" modalının minimal
 * projeksiyonu: `sku` TEK örnek varyanttan (ilk/en eski) gelir — çok varyantlı üründe
 * ADR-090 seçici deseniyle AYNI TERCİH: modal "hangi ürün bu?" sorusuna yanıt verir,
 * varyant listesi taşımaz. `imageUrl` kapak görselinin türetilmiş public URL'idir;
 * storageKey ASLA taşınmaz (ProductCategory/Brand imageUrl deseniyle aynı tek-çıkış).
 */
export const brandProductRowSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  status: productStatusSchema,
  sku: z.string().nullable(),
  imageUrl: z.string().nullable(),
});
export type BrandProductRow = z.infer<typeof brandProductRowSchema>;

export const brandProductsResponseSchema = z.object({
  data: z.array(brandProductRowSchema),
  pagination: adminListPaginationSchema,
});
export type BrandProductsResponse = z.infer<typeof brandProductsResponseSchema>;

/* ════════════════════════════════════════════════════════════════════════════
 * TODO-165A (ADR-165A) — Product Data Governance: ProductTaxonomyValue sozlesmeleri.
 *
 * Governed taksonomi degeri (ör. Malzeme=Pamuk, Sezon=Yaz) — her deger TAM OLARAK bir
 * AttributeOption'i "destekler" (governance sunum katmani; EAV deger secimi hala
 * AttributeOption uzerinden akar, KIRILMAZ). `type` yalniz `ProductTaxonomyType`
 * (product-taxonomy.ts) uyeleriyle sinirlidir — tip registry'nin `fashion.*`
 * definitionCode'una baglidir (bkz. TAXONOMY_TYPE_REGISTRY).
 * ════════════════════════════════════════════════════════════════════════════ */

export const productTaxonomyTypeSchema = z.enum(
  PRODUCT_TAXONOMY_TYPES as [ProductTaxonomyType, ...ProductTaxonomyType[]],
);
export type ProductTaxonomyTypeContract = z.infer<typeof productTaxonomyTypeSchema>;

export const productTaxonomyStatusSchema = z.enum(
  PRODUCT_TAXONOMY_STATUSES as [ProductTaxonomyStatus, ...ProductTaxonomyStatus[]],
);
export type ProductTaxonomyStatusContract = z.infer<typeof productTaxonomyStatusSchema>;

export const productTaxonomyValueSchema = z.object({
  id: z.string().min(1),
  storeId: z.string().min(1),
  type: productTaxonomyTypeSchema,
  name: z.string().min(1),
  slug: slugSchema,
  status: productTaxonomyStatusSchema,
  displayOrder: z.number().int(),
  metadata: jsonRecordSchema,
  parentId: z.string().min(1).nullable(),
  attributeOptionId: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  /**
   * Task 24 (store-admin "Ürün Sözlükleri" ekranı) — kaç ürün/varyant ataması bu değeri
   * (destekledigi AttributeOption'i) kullanıyor. `TaxonomyService.usageCount`/`usageCountForOptions`
   * ile birebir (ProductAttributeValue + ProductAttributeValueOption + VariantAttributeValue
   * toplamı) — silme öncesi UI uyarısı + "kullanımda" rozeti için. Additive (yeni alan).
   */
  usageCount: z.number().int().min(0),
});
export type ProductTaxonomyValue = z.infer<typeof productTaxonomyValueSchema>;

export const productTaxonomyListResponseSchema = z.object({
  data: z.array(productTaxonomyValueSchema),
  pagination: adminListPaginationSchema,
});
export const productTaxonomyResponseSchema = z.object({ data: productTaxonomyValueSchema });
export type ProductTaxonomyListResponse = z.infer<typeof productTaxonomyListResponseSchema>;
export type ProductTaxonomyResponse = z.infer<typeof productTaxonomyResponseSchema>;

export const productTaxonomyCreateRequestSchema = z.object({
  type: productTaxonomyTypeSchema,
  name: z.string().min(1).max(160),
  parentId: z.string().min(1).nullable().optional(),
  metadata: jsonRecordSchema.optional(),
});
export type ProductTaxonomyCreateRequest = z.infer<typeof productTaxonomyCreateRequestSchema>;

export const productTaxonomyUpdateRequestSchema = z
  .object({
    name: z.string().min(1).max(160).optional(),
    status: productTaxonomyStatusSchema.optional(),
    displayOrder: z.number().int().optional(),
    metadata: jsonRecordSchema.optional(),
    parentId: z.string().min(1).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });
export type ProductTaxonomyUpdateRequest = z.infer<typeof productTaxonomyUpdateRequestSchema>;

/**
 * Merchandising surukle-birak sirasi — bir tip icindeki TAM sirali id kumesi.
 * `type` (Task 10, ADR-165A) — reorder ucu `orderedIds`'in HANGI tip icin verildigini
 * bilmeden "bu store'daki tum ACTIVE degerleri kapsiyor mu" kontrolunu yapamaz; route
 * bu alanla store+type icin ACTIVE tam kume kontrolu yapar (kismi kume → 400).
 */
export const productTaxonomyReorderRequestSchema = z.object({
  type: productTaxonomyTypeSchema,
  orderedIds: z.array(z.string().min(1)).min(1),
});
export type ProductTaxonomyReorderRequest = z.infer<typeof productTaxonomyReorderRequestSchema>;

export const productTaxonomyQuerySchema = adminListQueryBaseSchema.extend({
  type: productTaxonomyTypeSchema.optional(),
  status: productTaxonomyStatusSchema.optional(),
});
export type ProductTaxonomyQuery = z.infer<typeof productTaxonomyQuerySchema>;

// ─────────────────────── Faz 1B (ADR-067) — Attribute katalog cekirdegi ───────────────────────
// Kategoriye-bagli dinamik urun ozelliklerinin KATALOG kontratlari. Yalniz TANIM
// katmani: urun/varyant deger semalari KAPSAM DISI. scope + storeId istek govdesinde
// YOKTUR — route katmani turer (STORE route → STORE+storeId; PLATFORM route → PLATFORM+null);
// boylece istemci scope'u spoof edemez.
export const attributeScopeSchema = z.enum(["PLATFORM", "STORE"]);
export const attributeStatusSchema = z.enum(["ACTIVE", "ARCHIVED"]);
export const attributeDataTypeSchema = z.enum([
  "TEXT",
  "TEXTAREA",
  "RICH_TEXT",
  "INTEGER",
  "DECIMAL",
  "BOOLEAN",
  "DATE",
  "URL",
  "SELECT",
  "MULTI_SELECT",
  "COLOR",
  "IMAGE",
  "FILE",
]);

// Attribute kodu: kucuk harf/rakam, tek _ veya - ile ayrilmis. IMMUTABLE (create'te
// set; update'te farkli deger gonderilirse route ATTRIBUTE_CODE_IMMUTABLE doner).
const attributeCodeSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:[_-][a-z0-9]+)*$/);
// COLOR secenegi icin 6 haneli hex (opsiyonel; # ile).
const colorHexSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const attributeDefinitionSchema = z.object({
  id: z.string().min(1),
  scope: attributeScopeSchema,
  // PLATFORM => null; STORE => store id. Public projeksiyon YOK (yonetim entity'si).
  storeId: z.string().min(1).nullable(),
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  dataType: attributeDataTypeSchema,
  unit: z.string().nullable(),
  status: attributeStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// Attribute listeleri mutevazi kardinalitededir (hero deseni) → pagination YOK.
export const attributeDefinitionListResponseSchema = z.object({
  data: z.array(attributeDefinitionSchema),
});

export const attributeDefinitionCreateRequestSchema = z.object({
  code: attributeCodeSchema,
  name: z.string().min(1).max(160),
  description: z.string().max(1000).nullable().optional(),
  dataType: attributeDataTypeSchema,
  unit: z.string().max(32).nullable().optional(),
  status: attributeStatusSchema.default("ACTIVE"),
});

// code + dataType update govdesinde KABUL EDILIR ancak mevcuttan FARKLIYSA route
// stabil kodla reddeder (code her zaman immutable; dataType yalniz kullanim
// baslamissa immutable). Ayni deger gonderilirse no-op — full-object echo eden
// istemciler kirilmaz. En az bir alan zorunlu (bos PATCH reddi).
export const attributeDefinitionUpdateRequestSchema = z
  .object({
    code: attributeCodeSchema.optional(),
    name: z.string().min(1).max(160).optional(),
    description: z.string().max(1000).nullable().optional(),
    dataType: attributeDataTypeSchema.optional(),
    unit: z.string().max(32).nullable().optional(),
    status: attributeStatusSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

export const attributeGroupSchema = z.object({
  id: z.string().min(1),
  storeId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  sortOrder: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const attributeGroupListResponseSchema = z.object({
  data: z.array(attributeGroupSchema),
});

export const attributeGroupCreateRequestSchema = z.object({
  name: z.string().min(1).max(160),
  description: z.string().max(1000).nullable().optional(),
  sortOrder: z.number().int().default(0),
});

export const attributeGroupUpdateRequestSchema = z
  .object({
    name: z.string().min(1).max(160).optional(),
    description: z.string().max(1000).nullable().optional(),
    sortOrder: z.number().int().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

// SELECT/MULTI_SELECT/COLOR secenekleri. `value` immutable (kimlik; update'te YOK);
// duplicate value ayni tanim icinde DB unique ([attributeDefinitionId, value]) ile
// yakalanir, route 409 doner. colorHex yalniz COLOR icin anlamli.
export const attributeOptionSchema = z.object({
  id: z.string().min(1),
  attributeDefinitionId: z.string().min(1),
  storeId: z.string().min(1).nullable(),
  value: z.string().min(1),
  label: z.string().min(1),
  colorHex: z.string().nullable(),
  sortOrder: z.number().int(),
  status: attributeStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const attributeOptionListResponseSchema = z.object({
  data: z.array(attributeOptionSchema),
});

export const attributeOptionCreateRequestSchema = z.object({
  value: z.string().min(1).max(120),
  label: z.string().min(1).max(160),
  colorHex: colorHexSchema.nullable().optional(),
  sortOrder: z.number().int().default(0),
  status: attributeStatusSchema.default("ACTIVE"),
});

export const attributeOptionUpdateRequestSchema = z
  .object({
    label: z.string().min(1).max(160).optional(),
    colorHex: colorHexSchema.nullable().optional(),
    sortOrder: z.number().int().optional(),
    status: attributeStatusSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

// CategoryAttribute — bir attribute'un bir kategori kapsamindaki davranisinin TEK
// SAHIBI. attributeDefinitionId + categoryId immutable (link kimligi); categoryId
// route param'dan, attributeDefinitionId yalniz create'te. Kategori mirasi/overrideMode
// YOK (ADR-067 md.7).
export const categoryAttributeSchema = z.object({
  id: z.string().min(1),
  storeId: z.string().min(1),
  categoryId: z.string().min(1),
  attributeDefinitionId: z.string().min(1),
  groupId: z.string().min(1).nullable(),
  required: z.boolean(),
  filterable: z.boolean(),
  searchable: z.boolean(),
  comparable: z.boolean(),
  variantDefining: z.boolean(),
  visibleOnProductPage: z.boolean(),
  visibleOnListing: z.boolean(),
  displayOrder: z.number().int(),
  validationRules: jsonRecordSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const categoryAttributeListResponseSchema = z.object({
  data: z.array(categoryAttributeSchema),
});

export const categoryAttributeCreateRequestSchema = z.object({
  attributeDefinitionId: z.string().min(1),
  groupId: z.string().min(1).nullable().optional(),
  required: z.boolean().default(false),
  filterable: z.boolean().default(false),
  searchable: z.boolean().default(false),
  comparable: z.boolean().default(false),
  variantDefining: z.boolean().default(false),
  visibleOnProductPage: z.boolean().default(true),
  visibleOnListing: z.boolean().default(false),
  displayOrder: z.number().int().default(0),
  validationRules: jsonRecordSchema.default({}),
});

export const categoryAttributeUpdateRequestSchema = z
  .object({
    groupId: z.string().min(1).nullable().optional(),
    required: z.boolean().optional(),
    filterable: z.boolean().optional(),
    searchable: z.boolean().optional(),
    comparable: z.boolean().optional(),
    variantDefining: z.boolean().optional(),
    visibleOnProductPage: z.boolean().optional(),
    visibleOnListing: z.boolean().optional(),
    displayOrder: z.number().int().optional(),
    validationRules: jsonRecordSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

// ─────────────────────── Faz 2A (ADR-068) — Urun/varyant attribute DEGERLERI ───────────────────────
// Faz 1B katalog TANIMINI tuketen DEGER katmani. Hangi deger alaninin dolacagi attribute'un
// dataType'ina baglidir; tip<->alan eslemesi, "en fazla bir alan" ve required/tenant/option
// kontrolleri attributeValueService'te STABIL kodlarla yapilir (zod refine DEGIL — generic
// VALIDATION_ERROR ozel kodlari yutmasin; Faz 1A/1B deseni). Sema yalniz sekli dogrular.

// Tek bir urun attribute deger GIRDISI (product create/update icindeki attributeValues[] ogesi
// ve dedike replace ucunun eleman tipi). MULTI_SELECT icin optionIds[] kullanilir.
export const productAttributeValueInputSchema = z.object({
  attributeDefinitionId: z.string().min(1),
  valueText: z.string().optional(),
  valueInteger: z.number().int().optional(),
  valueDecimal: z.number().optional(),
  valueBoolean: z.boolean().optional(),
  // ISO-8601; servis DATE dataType'i icin valueDate kolonuna yazar.
  valueDate: z.string().datetime().optional(),
  optionId: z.string().min(1).optional(), // SELECT / COLOR
  optionIds: z.array(z.string().min(1)).optional(), // MULTI_SELECT
  mediaId: z.string().min(1).optional(), // IMAGE / FILE
});

// Varyant deger girdisi — yalniz metin veya secenek (variantDefining attribute'lar).
export const variantAttributeValueInputSchema = z.object({
  attributeDefinitionId: z.string().min(1),
  valueText: z.string().optional(),
  optionId: z.string().min(1).optional(),
});

// Okuma projeksiyonu (dual-read hazirligi). dataType echo edilir; tuketici hangi deger
// alanini okuyacagini bilir. MULTI_SELECT icin optionIds dolar (digerlerinde bos dizi).
export const productAttributeValueSchema = z.object({
  id: z.string().min(1),
  attributeDefinitionId: z.string().min(1),
  dataType: attributeDataTypeSchema,
  valueText: z.string().nullable(),
  valueInteger: z.number().int().nullable(),
  valueDecimal: z.number().nullable(),
  valueBoolean: z.boolean().nullable(),
  valueDate: z.string().datetime().nullable(),
  optionId: z.string().nullable(),
  optionIds: z.array(z.string().min(1)),
  mediaId: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const productAttributeValueListResponseSchema = z.object({
  data: z.array(productAttributeValueSchema),
});

export const variantAttributeValueSchema = z.object({
  id: z.string().min(1),
  attributeDefinitionId: z.string().min(1),
  dataType: attributeDataTypeSchema,
  valueText: z.string().nullable(),
  optionId: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const variantAttributeValueListResponseSchema = z.object({
  data: z.array(variantAttributeValueSchema),
});

// Dedike internal replace uclari icin govde. `values` TAM istenen kume (replace-set
// semantigi); [] gonderilirse tum degerler temizlenir (categoryIds/imageMediaIds deseni).
export const productAttributeValuesReplaceRequestSchema = z.object({
  values: z.array(productAttributeValueInputSchema),
});

export const variantAttributeValuesReplaceRequestSchema = z.object({
  values: z.array(variantAttributeValueInputSchema),
});

// ─────────────────── Faz 2C-1 (ADR-070) — Varyant motoru TEMELI (eksen secimi) ───────────────────
// Bir urunun hangi variant-defining attribute'lari EKSEN olarak kullanacagini + her eksende hangi
// option'lari kapsayacagini NORMALIZE tasir. Bu KOMBINASYON DEGILDIR: ProductVariant/combinationKey/
// Cartesian URETILMEZ. "En az bir option", "eksen option-tabanli", "variantDefining", tenant ve
// duplicate kontrolleri variantSelectionService'te STABIL kodlarla yapilir (zod refine DEGIL —
// Faz 2A deseni). Sema yalniz sekli dogrular; optionIds'e min(1) KONMAZ (bos → servis VARIANT_OPTION_REQUIRED).

// Tek bir varyant eksen GIRDISI (product create/update icindeki variantSelections[] ogesi + dedike
// replace ucunun eleman tipi). optionIds bu eksende kapsanan AttributeOption id'leri (TAM istenen kume).
export const productVariantSelectionInputSchema = z.object({
  attributeDefinitionId: z.string().min(1),
  optionIds: z.array(z.string().min(1)),
});

// Okuma projeksiyonu (edit round-trip). dataType echo edilir (SELECT/COLOR); optionIds position
// sirasinda doner. UI option metadata'sini (label/colorHex) kendi cektigi seceneklerle join eder.
export const productVariantSelectionSchema = z.object({
  attributeDefinitionId: z.string().min(1),
  dataType: attributeDataTypeSchema,
  position: z.number().int(),
  optionIds: z.array(z.string().min(1)),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const productVariantSelectionListResponseSchema = z.object({
  data: z.array(productVariantSelectionSchema),
});

// Dedike replace ucu govdesi. `selections` TAM istenen kume (replace-set); [] tumunu temizler.
export const productVariantSelectionsReplaceRequestSchema = z.object({
  selections: z.array(productVariantSelectionInputSchema),
});

// ─────────────────── Faz 2C-2 (ADR-071) — Combination Engine ONIZLEME ───────────────────
// Bir urunun kalici varyant EKSEN recetesinden (2C-1) SAF + deterministik Cartesian carpimiyla
// "olusacak varyant kombinasyonlari" onizlemesi. Bu KOMBINASYON YAZMAZ: ProductVariant/SKU/price/
// inventory OLUSTURULMAZ. combinationKey uretilir ama DB'ye yazilmaz (kaliciligi Faz 2C-3). Sunucu
// otoritedir: canonical ordering + duplicate onleme + guard motordadir (engine.ts).

// Tek bir kombinasyonun tek ekseni: hangi attribute (eksen) icin hangi option secildi.
export const variantCombinationPreviewAttributeSchema = z.object({
  attributeDefinitionId: z.string().min(1),
  position: z.number().int(),
  optionId: z.string().min(1),
  optionLabel: z.string().nullable(),
});

// Tek bir olusacak kombinasyon (henuz ProductVariant DEGIL). previewId deterministik (random DEGIL);
// combinationKey kanonik makine kimligi (ID-tabanli). attributes/optionIds/optionLabels kanonik sirada paralel.
export const variantCombinationPreviewSchema = z.object({
  previewId: z.string().min(1),
  combinationKey: z.string().min(1),
  attributes: z.array(variantCombinationPreviewAttributeSchema),
  optionIds: z.array(z.string().min(1)),
  optionLabels: z.array(z.string().nullable()),
});

// Preview ucu yaniti. axisCount = kombinasyona katki veren (bos olmayan) eksen sayisi;
// totalCombinations = uretilen kombinasyon sayisi (Cartesian buyuklugu).
export const variantCombinationPreviewResponseSchema = z.object({
  axisCount: z.number().int().nonnegative(),
  totalCombinations: z.number().int().nonnegative(),
  combinations: z.array(variantCombinationPreviewSchema),
});

// ─────────────────── Faz 2C-3 (ADR-072) — ProductVariant persistence + incremental generation ───────────────────
// Kalici varyant URETIMI: 2C-1 receteden 2C-2 motoruyla hedef kombinasyonlar uretilir ve mevcut
// ProductVariant kayitlariyla diff'lenir (create/keep/restore/archive). Deterministik + idempotent +
// transaction-safe + concurrency-safe. Manuel varyantlar dokunulmaz. Combination Engine DEGISMEZ.

// Uretilmis/korunmus/geri-yuklenmis bir varyantin ozet gorunumu (SKU Matrix DEGIL; salt ozet).
export const variantGenerationVariantAttributeSchema = z.object({
  attributeDefinitionId: z.string().min(1),
  optionId: z.string().min(1),
  optionLabel: z.string().nullable(),
});

export const variantGenerationVariantSchema = z.object({
  id: z.string().min(1),
  combinationKey: z.string().min(1),
  title: z.string(),
  sku: z.string(),
  status: productVariantStatusSchema,
  attributes: z.array(variantGenerationVariantAttributeSchema),
});

// Generate ucu yaniti. Ozet sayaclar + hedef kumeyi temsil eden aktif varyantlar (created+kept+restored;
// archived yalniz sayilir). Idempotent: ayni recete ikinci kez → created/restored/archived = 0.
export const variantGenerationResponseSchema = z.object({
  totalTarget: z.number().int().nonnegative(),
  created: z.number().int().nonnegative(),
  kept: z.number().int().nonnegative(),
  restored: z.number().int().nonnegative(),
  archived: z.number().int().nonnegative(),
  manualVariantsUntouched: z.number().int().nonnegative(),
  variants: z.array(variantGenerationVariantSchema),
});

// ─────────────────── TODO-150 (ADR-073) — Identity Management Engine (SKU/Barcode/Title) ───────────────────
// Pattern tabanli kimlik motoru: bir urunun varyantlarina SKU/Barcode/Title patternlarini toplu uygular.
// Preview-first + collision-first + fail-closed. Motor SAFtir (parser/evaluator/collision); sunucu
// otoriter (apply preview'i yeniden hesaplar). combinationKey/2C-* DEGISMEZ.

export const identityFieldSchema = z.enum(["SKU", "BARCODE", "TITLE"]);

// Tek bir alanin (SKU/Barcode/Title) degerlendirilmis sonucu. `issues` stable tani kodlaridir
// (SKU_COLLISION, TITLE_PROTECTED, ...). `applied` true → apply bu alani yazar.
export const identityPreviewFieldSchema = z.object({
  next: z.string(),
  changed: z.boolean(),
  applied: z.boolean(),
  missing: z.array(z.string()),
  issues: z.array(z.string()),
});

// Tek varyantin preview satiri. Pattern verilmeyen alan null. seq = bu satirin 1-tabanli SEQ degeri.
export const identityPreviewRowSchema = z.object({
  variantId: z.string().min(1),
  status: productVariantStatusSchema,
  seq: z.number().int().nonnegative(),
  current: z.object({
    sku: z.string(),
    barcode: z.string().nullable(),
    title: z.string(),
  }),
  sku: identityPreviewFieldSchema.nullable(),
  barcode: identityPreviewFieldSchema.nullable(),
  title: identityPreviewFieldSchema.nullable(),
});

export const identityCollisionSchema = z.object({
  variantId: z.string().min(1),
  field: identityFieldSchema,
  value: z.string(),
  code: z.string(),
});

// Uygulanan ham patternlarin echo'su (audit/UI). Verilmeyen alan null.
export const identityPatternsEchoSchema = z.object({
  sku: z.string().nullable(),
  barcode: z.string().nullable(),
  title: z.string().nullable(),
});

export const identityPreviewResponseSchema = z.object({
  rows: z.array(identityPreviewRowSchema),
  collisions: z.array(identityCollisionSchema),
  // true → apply reddedilir (SKU collision / sert validation). UI Apply'i disable eder.
  blocked: z.boolean(),
  counts: z.object({
    changed: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    collisions: z.number().int().nonnegative(),
  }),
  patterns: identityPatternsEchoSchema,
  // Bu urunun uygulanabilir (non-archived) varyant sayisi (bos-durum UI'si icin).
  variantCount: z.number().int().nonnegative(),
});

// Apply yaniti: yazilan varyant/alan sayilari + degismeyen + collision + tam preview snapshot + batchId
// (undo metadata grubu). updated = yazilan ALAN sayisi degil, yazilan VARYANT sayisi.
export const identityApplyResponseSchema = z.object({
  batchId: z.string().min(1),
  updated: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  collisions: z.array(identityCollisionSchema),
  preview: identityPreviewResponseSchema,
});

// Apply istegi: her pattern opsiyonel (en az biri zorunlu — servis STABIL kodla dogrular, refine DEGIL).
// seqStart {SEQ}'in baslangic degeri (varsayilan 1). regenerateCustomTitles true → korumali (custom)
// basliklar da yenilenir. Bos-string pattern = "alan yok" (trim'lenir; validator IDENTITY_PATTERN_EMPTY).
export const identityApplyRequestSchema = z.object({
  sku: z.string().optional(),
  barcode: z.string().optional(),
  title: z.string().optional(),
  seqStart: z.number().int().min(0).optional(),
  regenerateCustomTitles: z.boolean().optional(),
});

// ─────────────────── TODO-151 (ADR-074) — Commercial Engine (Price/Compare-at/Cost/VAT) ───────────────────
// Varyantlarin ticari alanlarini preview-first + toplu yoneten motor. "Price" = KDV DAHIL brut satis
// fiyati (priceMinor); net/KDV apply'da bundan turetilir. Margin/markup brut uzerinden hesaplanir.
// Structured bulk rule (serbest metin/eval YOK) + direct-edit. Server-authoritative + stale fingerprint.

export const commercialFieldSchema = z.enum(["PRICE", "COMPARE_AT_PRICE", "COST", "VAT_RATE"]);

export const commercialOperationSchema = z.enum([
  "SET_FIXED",
  "INCREASE_PERCENT",
  "DECREASE_PERCENT",
  "INCREASE_FIXED",
  "DECREASE_FIXED",
  "SET_FROM_COST_MARKUP",
  "SET_COMPARE_AT_FROM_PRICE",
  "ROUND",
  "SET_PRICE_ENDING",
]);

export const commercialRoundingModeSchema = z.enum(["NONE", "NEAREST", "UP", "DOWN"]);
export const commercialRoundingStepSchema = z.union([
  z.literal(1),
  z.literal(10),
  z.literal(100),
  z.literal(1000),
]);
export const commercialPriceEndingSchema = z.enum(["END_90", "END_99", "END_990", "END_9990"]);

// Yapisal bulk rule. Deger alanlari integer minor/bps (float YOK). Operation<->field uyumu SUNUCUDA
// (compileRule) STABIL kodla dogrulanir; burada yalniz sekil/aralik.
export const commercialRuleSchema = z.object({
  targetField: commercialFieldSchema,
  operation: commercialOperationSchema,
  valueMinor: z.number().int().nonnegative().optional(),
  valueBps: z.number().int().min(0).max(10000).optional(),
  percentBps: z.number().int().optional(),
  rounding: z
    .object({ mode: commercialRoundingModeSchema, step: commercialRoundingStepSchema.optional() })
    .optional(),
  priceEnding: commercialPriceEndingSchema.optional(),
});

// Direct-edit: bir varyanta hedef alan degerleri. Verilmeyen alan = dokunma; explicit null
// (compareAt/cost) = temizle. priceMinor/vatRateBps null olamaz.
export const commercialDirectEditSchema = z.object({
  variantId: z.string().min(1),
  priceMinor: z.number().int().nonnegative().optional(),
  compareAtMinor: z.number().int().nonnegative().nullable().optional(),
  costMinor: z.number().int().nonnegative().nullable().optional(),
  vatRateBps: z.number().int().min(0).max(10000).optional(),
});

export const commercialStateSchema = z.object({
  priceMinor: z.number().int(),
  compareAtMinor: z.number().int().nullable(),
  costMinor: z.number().int().nullable(),
  vatRateBps: z.number().int(),
});

export const commercialCalcSchema = z.object({
  grossProfitMinor: z.number().int().nullable(),
  marginPct: z.number().nullable(),
  markupPct: z.number().nullable(),
  discountPct: z.number().nullable(),
});

export const commercialPreviewRowSchema = z.object({
  variantId: z.string().min(1),
  sku: z.string(),
  title: z.string(),
  status: productVariantStatusSchema,
  currency: currencySchema,
  attributes: z.array(z.object({ code: z.string(), label: z.string() })),
  current: commercialStateSchema,
  currentCalc: commercialCalcSchema,
  target: commercialStateSchema,
  targetCalc: commercialCalcSchema,
  changedFields: z.array(commercialFieldSchema),
  changed: z.boolean(),
  // Stable tani kodlari (NEGATIVE_MARGIN, COMPARE_AT_BELOW_PRICE, ...). errors → apply reddedilir.
  warnings: z.array(z.string()),
  errors: z.array(z.string()),
});

export const commercialSummarySchema = z.object({
  totalVariants: z.number().int().nonnegative(),
  changedVariants: z.number().int().nonnegative(),
  unchangedVariants: z.number().int().nonnegative(),
  changedFieldCount: z.number().int().nonnegative(),
  warningCount: z.number().int().nonnegative(),
  errorCount: z.number().int().nonnegative(),
  minNewPriceMinor: z.number().int().nullable(),
  maxNewPriceMinor: z.number().int().nullable(),
  avgPriceChangePct: z.number().nullable(),
  negativeMarginCount: z.number().int().nonnegative(),
  compareAtBelowPriceCount: z.number().int().nonnegative(),
});

export const commercialPreviewResponseSchema = z.object({
  // Stale-guard temeli: apply bu fingerprint'i geri gonderir; sunucu guncel degerle karsilastirir.
  fingerprint: z.string().min(1),
  source: z.enum(["DIRECT_EDIT", "BULK_RULE"]),
  blocked: z.boolean(),
  rows: z.array(commercialPreviewRowSchema),
  summary: commercialSummarySchema,
});

// Preview/apply istegi: rule VEYA edits (ikisi de yoksa no-op = matris okuma). selectedVariantIds
// verilmisse bos olamaz ve tumu kapsam-ici (non-archived, bu urun) olmali (SUNUCU dogrular).
export const commercialPreviewRequestSchema = z.object({
  rule: commercialRuleSchema.optional(),
  edits: z.array(commercialDirectEditSchema).optional(),
  selectedVariantIds: z.array(z.string().min(1)).optional(),
});

export const commercialApplyRequestSchema = commercialPreviewRequestSchema.extend({
  baseFingerprint: z.string().min(1),
});

export const commercialApplyResponseSchema = z.object({
  batchId: z.string().min(1),
  updatedVariants: z.number().int().nonnegative(),
  updatedFields: z.number().int().nonnegative(),
  skippedVariants: z.number().int().nonnegative(),
  auditCount: z.number().int().nonnegative(),
  source: z.enum(["DIRECT_EDIT", "BULK_RULE"]),
  preview: commercialPreviewResponseSchema,
});

// ─────────────────── TODO-152 (ADR-076) — Inventory Engine (warehouse-aware stok) ───────────────────
// Depo-bazlı varyant stoğu (onHand/reserved/incoming/safetyStock/reorderPoint) preview-first + toplu
// yonetim. available TURETILIR (kolon yok): onHand − reserved − safetyStock. incoming DAHIL DEGIL.
// reserved SISTEM-kontrollu (kullanici duzenlemez → rule/direct-edit alanlarinda YOK). Tum degerler
// non-negative integer adet (float YOK). Commercial deseniyle simetrik (stale-fingerprint stringi).

export const warehouseStatusSchema = z.enum(["ACTIVE", "INACTIVE"]);

export const inventoryFieldSchema = z.enum(["ON_HAND", "INCOMING", "SAFETY_STOCK", "REORDER_POINT"]);

export const inventoryOperationSchema = z.enum(["SET_ABSOLUTE", "INCREASE", "DECREASE"]);

export const inventoryStockStatusSchema = z.enum([
  "IN_STOCK",
  "LOW_STOCK",
  "OUT_OF_STOCK",
  "INCOMING",
  "NEGATIVE",
  "NO_BALANCE",
]);

export const inventoryWarehouseSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  status: warehouseStatusSchema,
  isDefault: z.boolean(),
  priority: z.number().int(),
});

export const inventoryWarehouseListResponseSchema = z.object({
  data: z.array(inventoryWarehouseSchema),
});

export const inventoryRuleSchema = z.object({
  targetField: inventoryFieldSchema,
  operation: inventoryOperationSchema,
  amount: z.number().int().nonnegative(),
});

export const inventoryDirectEditSchema = z.object({
  variantId: z.string().min(1),
  onHand: z.number().int().nonnegative().optional(),
  incoming: z.number().int().nonnegative().optional(),
  safetyStock: z.number().int().nonnegative().optional(),
  reorderPoint: z.number().int().nonnegative().optional(),
});

export const inventoryStateSchema = z.object({
  onHand: z.number().int(),
  reserved: z.number().int(),
  incoming: z.number().int(),
  safetyStock: z.number().int(),
  reorderPoint: z.number().int(),
});

export const inventoryCalcSchema = z.object({
  rawAvailable: z.number().int(),
  sellableAvailable: z.number().int(),
  reservedRatioPct: z.number().nullable(),
  status: inventoryStockStatusSchema,
});

export const inventoryPreviewRowSchema = z.object({
  variantId: z.string().min(1),
  sku: z.string(),
  title: z.string(),
  status: productVariantStatusSchema,
  attributes: z.array(z.object({ code: z.string(), label: z.string() })),
  balanceExists: z.boolean(),
  current: inventoryStateSchema,
  currentCalc: inventoryCalcSchema,
  target: inventoryStateSchema,
  targetCalc: inventoryCalcSchema,
  changedFields: z.array(inventoryFieldSchema),
  changed: z.boolean(),
  warnings: z.array(z.string()),
  errors: z.array(z.string()),
});

export const inventorySummarySchema = z.object({
  totalVariants: z.number().int().nonnegative(),
  changedVariants: z.number().int().nonnegative(),
  unchangedVariants: z.number().int().nonnegative(),
  changedFieldCount: z.number().int().nonnegative(),
  warningCount: z.number().int().nonnegative(),
  errorCount: z.number().int().nonnegative(),
  totalOnHandDelta: z.number().int(),
  totalSellableDelta: z.number().int(),
  lowStockCount: z.number().int().nonnegative(),
  outOfStockCount: z.number().int().nonnegative(),
  newBalanceCount: z.number().int().nonnegative(),
});

export const inventoryPreviewResponseSchema = z.object({
  fingerprint: z.string().min(1),
  source: z.enum(["DIRECT_EDIT", "BULK_RULE"]),
  warehouse: inventoryWarehouseSchema,
  blocked: z.boolean(),
  rows: z.array(inventoryPreviewRowSchema),
  summary: inventorySummarySchema,
});

export const inventoryPreviewRequestSchema = z.object({
  warehouseId: z.string().min(1).optional(),
  rule: inventoryRuleSchema.optional(),
  edits: z.array(inventoryDirectEditSchema).optional(),
  selectedVariantIds: z.array(z.string().min(1)).optional(),
});

export const inventoryApplyRequestSchema = inventoryPreviewRequestSchema.extend({
  baseFingerprint: z.string().min(1),
  reason: z.string().max(500).optional(),
});

export const inventoryApplyResponseSchema = z.object({
  batchId: z.string().min(1),
  updatedVariants: z.number().int().nonnegative(),
  updatedFields: z.number().int().nonnegative(),
  skippedVariants: z.number().int().nonnegative(),
  auditCount: z.number().int().nonnegative(),
  source: z.enum(["DIRECT_EDIT", "BULK_RULE"]),
  preview: inventoryPreviewResponseSchema,
});

// TODO-152A — Mağaza-geneli stok MATRİS okuması (SALT-OKUMA; izleme/operasyon merkezi).
// Motor product-scoped kalır (ADR-076); bu uç yalnız ürünlerin varyantlarını seçili depoda
// current bakiye + SAF hesaplanmış göstergelerle (sellable/status) döndürür. Düzenleme YOK (preview/
// apply ürün-bazlı tabda). Satırlar ürün kimliği taşır (global tabloda "Ürün" kolonu için).
// TODO-159C (ADR-092) — `barcode`/`updatedAt` EKLENDİ (arama görünürlüğü + updatedAt sıralaması).
export const inventoryStoreMatrixRowSchema = z.object({
  productId: z.string().min(1),
  productTitle: z.string(),
  productSlug: z.string(),
  variantId: z.string().min(1),
  sku: z.string(),
  barcode: z.string().nullable(),
  title: z.string(),
  status: productVariantStatusSchema,
  attributes: z.array(z.object({ code: z.string(), label: z.string() })),
  balanceExists: z.boolean(),
  current: inventoryStateSchema,
  currentCalc: inventoryCalcSchema,
  updatedAt: z.string(),
});

/* ────────────────────────────────────────────────────────────────────────────
 * TODO-159C (ADR-092) — Inventory Matrix server-side liste sözleşmesi.
 *
 * ADR-089 Data Grid tabanının TÜRETİLMİŞ bir dalı: aynı `page`/`pageSize`/`search`/
 * `sortBy`/`sortOrder` + aynı `adminListPaginationSchema` meta'sı. `sortBy` ALLOWLIST'tir
 * (serbest metin ASLA orderBy'a geçmez). `warehouseId` matrisin BAKILAN deposunu seçer
 * (filtre değil — tüm satırlar o depodan). `stockStatus` in/out/low/incoming/negative/
 * no_balance'ı TEK kanonik filtrede kapsar; `reserved` rezerve>0 ayrımıdır.
 *
 * `summary` sayfadan BAĞIMSIZ: aktif filtrelere uyan TÜM kümenin aggregate'i (ayrı sorgu).
 * ──────────────────────────────────────────────────────────────────────────── */

export const adminInventoryMatrixSortBySchema = z.enum([
  "productTitle",
  "sku",
  "onHand",
  "reserved",
  "available",
  "updatedAt",
]);

/** Rezerve stok ayrımı: "yes" → reserved > 0, "no" → reserved = 0. */
export const adminInventoryMatrixReservedSchema = z.enum(["yes", "no"]);

export const adminInventoryMatrixListQuerySchema = adminListQueryBaseSchema.extend({
  sortBy: adminInventoryMatrixSortBySchema.optional(),
  warehouseId: z.string().min(1).optional(),
  stockStatus: inventoryStockStatusSchema.optional(),
  reserved: adminInventoryMatrixReservedSchema.optional(),
  variantStatus: productVariantStatusSchema.optional(),
  productStatus: productStatusSchema.optional(),
});

/**
 * Sayfadan BAĞIMSIZ özet: aktif filtreye uyan tüm varyant kümesinin aggregate'i.
 * `totalVariants` pagination.totalItems ile birebir eşleşir. Durum sayıları SAF
 * calculator ile aynı eşikleri kullanır (SQL türetmesi computeCalc ile parite testli).
 */
export const inventoryStoreMatrixSummarySchema = z.object({
  totalVariants: z.number().int().nonnegative(),
  totalOnHand: z.number().int(),
  totalReserved: z.number().int(),
  totalSellable: z.number().int(),
  totalIncoming: z.number().int(),
  inStock: z.number().int().nonnegative(),
  lowStock: z.number().int().nonnegative(),
  outOfStock: z.number().int().nonnegative(),
  incoming: z.number().int().nonnegative(),
  negative: z.number().int().nonnegative(),
  noBalance: z.number().int().nonnegative(),
});

export const inventoryStoreMatrixResponseSchema = z.object({
  warehouse: inventoryWarehouseSchema,
  rows: z.array(inventoryStoreMatrixRowSchema),
  // TODO-159C (ADR-092) — ortak Data Grid meta'sı + sayfadan bağımsız özet.
  pagination: adminListPaginationSchema,
  summary: inventoryStoreMatrixSummarySchema,
});

export type AdminInventoryMatrixSortBy = z.infer<typeof adminInventoryMatrixSortBySchema>;
export type AdminInventoryMatrixListQuery = z.infer<typeof adminInventoryMatrixListQuerySchema>;
export type InventoryStoreMatrixSummary = z.infer<typeof inventoryStoreMatrixSummarySchema>;

// ADR-065 (Faz 2/Dilim 4) — Magaza marka ayarlari (StoreSettings 1-1 singleton;
// PK=FK storeId). *MediaId ham FK (MediaUpload value kimligi icin), *Url ise
// runtime'da storageKey'den turetilen public URL (render icin). storeName
// salt-okunur echo'dur (Store.name) ve yalniz response'ta yer alir; hepsi nullable
// olabilir (henuz logo/favicon baglanmamis magaza).
// TODO-172 (ADR-273) — minor-unit BigInt finansal tutarların API taşıması: KANONİK ONDALIK STRING
// (işaretsiz, baştan-sıfırsız base-10 tamsayı). `Number(bigint)`/`parseInt` precision kaybını önler;
// `JSON.stringify` BigInt hatasını önler. Runtime parse/format @commerce-os/utils money helper'larında
// (isCanonicalMinorString ile AYNI desen — contracts'ın utils'e bağımlılığı yok, desen bilinçli kopya).
export const canonicalMinorAmountString = z
  .string()
  .regex(/^(0|[1-9]\d*)$/, "Non-negative canonical minor-unit amount string required");

export const storeSettingsSchema = z.object({
  storeId: z.string().min(1),
  storeName: z.string(),
  logoMediaId: z.string().nullable(),
  logoUrl: z.string().nullable(),
  faviconMediaId: z.string().nullable(),
  faviconUrl: z.string().nullable(),
  // TODO-169 (ADR-269) — Mağaza iade politikası (satır yoksa aynı default'lar resolver'da).
  returnWindowDays: z.number().int().nonnegative(),
  returnsRequireApproval: z.boolean(),
  returnsCustomerPaysShipping: z.boolean(),
  returnsAllowReplacement: z.boolean(),
  returnsAllowOriginalPaymentRefund: z.boolean(),
  // TODO-172 (ADR-273) — Fast Refund Controls (additive; satır yoksa hepsi kapalı default'lanır).
  // maxAmountMinor null = hızlı iade KAPALI (sınırsız DEĞİL). currency null = sipariş para biriminde
  // yorumlanır. DB'de BigInt → API'de KANONİK ONDALIK STRING (Number/float YOK; 2^53 üstü precision
  // korunur). Client @commerce-os/utils money helper'larıyla parse/format eder.
  fastRefundEnabled: z.boolean(),
  fastRefundMaxAmountMinor: canonicalMinorAmountString.nullable(),
  fastRefundCurrency: z.string().nullable(),
  // TODO-174B (ADR-281) — Goodwill / Store Credit compensation policy (additive). null =
  // maxGoodwillCreditPerActionMinor: özellik KAPALI (normal operatör kredi VEREMEZ; SUPER_ADMIN override).
  // Değer = aksiyon başına üst sınır (KANONİK STRING). currency null = mağaza para biriminde.
  maxGoodwillCreditPerActionMinor: canonicalMinorAmountString.nullable(),
  goodwillCreditCurrency: z.string().nullable(),
});

// null = bagi kaldir (FK NULL); absent = dokunma; string = bagla/degistir. Tenant +
// context (BRANDING) dogrulamasi route katmaninda yapilir. refine "en az bir alan"
// kontrolu bos PATCH'i reddeder (kategori update deseniyle tutarli).
export const storeSettingsUpdateRequestSchema = z
  .object({
    logoMediaId: z.string().min(1).nullable().optional(),
    faviconMediaId: z.string().min(1).nullable().optional(),
    // TODO-169 (ADR-269) — İade politikası düzenleme (additive; absent=dokunma).
    returnWindowDays: z.number().int().min(0).max(365).optional(),
    returnsRequireApproval: z.boolean().optional(),
    returnsCustomerPaysShipping: z.boolean().optional(),
    returnsAllowReplacement: z.boolean().optional(),
    returnsAllowOriginalPaymentRefund: z.boolean().optional(),
    // TODO-172 (ADR-273) — Fast Refund Controls (additive; absent=dokunma). maxAmountMinor null =
    // limiti kaldır → hızlı iade kapat. Değer KANONİK ONDALIK STRING (Number/float YOK). currency null
    // = sipariş para birimine bırak. Bu alanları yalnız SUPER_ADMIN düzenler (route-seviyesi guard).
    fastRefundEnabled: z.boolean().optional(),
    fastRefundMaxAmountMinor: canonicalMinorAmountString.nullable().optional(),
    fastRefundCurrency: z.string().min(3).max(3).nullable().optional(),
    // TODO-174B (ADR-281) — Goodwill policy (additive; absent=dokunma). null = özelliği kapat.
    // Bu alanlar yalnız SUPER_ADMIN düzenler (route-seviyesi guard, fast-refund deseni).
    maxGoodwillCreditPerActionMinor: canonicalMinorAmountString.nullable().optional(),
    goodwillCreditCurrency: z.string().min(3).max(3).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

// ============================================================================
// TODO-174B (ADR-281/282/284) — Customer Shopping Balance / Store Credit contracts.
// ============================================================================

/** Grant expiry süresi (gün) — yalnız 30/60/120/180 (ADR-284, maks 180). */
export const creditExpiryDaysSchema = z.union([
  z.literal(30),
  z.literal(60),
  z.literal(120),
  z.literal(180),
]);

export const creditLedgerTypeSchema = z.enum([
  "ADMIN_GOODWILL_CREDIT",
  "RECOVERY_GOODWILL_CREDIT",
  "ORDER_PAYMENT_DEBIT",
  "ORDER_CANCELLATION_RESTORE",
  "REFUND_RESTORE",
  "ADMIN_ADJUSTMENT_CREDIT",
  "ADMIN_ADJUSTMENT_DEBIT",
  "EXPIRE",
]);

export const creditDirectionSchema = z.enum(["CREDIT", "DEBIT"]);

/** Pozitif kanonik minor (0 reddedilir) — kredi tutarı. */
export const positiveMinorAmountString = canonicalMinorAmountString.refine((s) => s !== "0", {
  message: "Amount must be positive.",
});

/** Admin manuel bakiye düzeltmesi (CREDIT ekle / DEBIT çıkar). GÜÇLÜ YETKİ (SUPER_ADMIN). */
export const adminAdjustCreditRequestSchema = z
  .object({
    direction: z.enum(["CREDIT", "DEBIT"]),
    amountMinor: positiveMinorAmountString,
    reason: z.string().min(1).max(80),
    internalNote: z.string().max(500).optional(),
    idempotencyKey: z.string().min(8).max(200),
    // CREDIT düzeltmesinde grant expiry zorunlu; DEBIT'te yoksayılır.
    expiryDays: creditExpiryDaysSchema.optional(),
  })
  .refine((v) => v.direction !== "CREDIT" || v.expiryDays !== undefined, {
    message: "CREDIT düzeltmesi için son kullanım (expiryDays) zorunlu.",
    path: ["expiryDays"],
  });
export type AdminAdjustCreditRequest = z.infer<typeof adminAdjustCreditRequestSchema>;

/** Admin/recovery goodwill kredi verme isteği. */
export const adminIssueCreditRequestSchema = z.object({
  amountMinor: positiveMinorAmountString,
  expiryDays: creditExpiryDaysSchema,
  // Yapısal neden etiketi (storefront'a sızmaz; audit + admin). Serbest metin değil, kısa etiket.
  reason: z.string().min(1).max(80),
  internalNote: z.string().max(500).optional(),
  // Opsiyonel: recovery case'e bağla (bağlıysa idempotency case-bazlı; duplicate credit engeli).
  recoveryCaseId: z.string().min(1).max(64).optional(),
  // Sayfa refresh / çift-submit koruması (client modal-open başına üretir).
  idempotencyKey: z.string().min(8).max(200),
});

/**
 * Tek ledger hareketi (admin + storefront ortak). `description` bir SEMANTİK KEY'dir (ör. "credit.goodwill",
 * "credit.orderPayment") — client TR/EN lokalize eder; RAW ENUM/internal note ASLA taşınmaz. `orderNumber`
 * sipariş ilişkili hareketlerde insan-okur numara (OS-000123) — client copy'de interpolate eder.
 */
export const creditLedgerEntrySchema = z.object({
  id: z.string().min(1),
  type: creditLedgerTypeSchema,
  direction: creditDirectionSchema,
  amountMinor: canonicalMinorAmountString,
  balanceAfterMinor: canonicalMinorAmountString,
  currency: z.string(),
  description: z.string(),
  orderId: z.string().nullable(),
  orderNumber: z.string().nullable(),
  createdAt: z.string(),
});

/** Müşteri bakiyesi + hareket geçmişi (admin + storefront). */
export const customerCreditBalanceResponseSchema = z.object({
  currency: z.string(),
  availableMinor: canonicalMinorAmountString,
  entries: z.array(creditLedgerEntrySchema),
});

export type AdminIssueCreditRequest = z.infer<typeof adminIssueCreditRequestSchema>;
export type CreditLedgerEntryDto = z.infer<typeof creditLedgerEntrySchema>;
export type CustomerCreditBalanceResponse = z.infer<typeof customerCreditBalanceResponseSchema>;

// ============================================================================
// TODO-174B (ADR-283) — Order Experience Recovery Operations contracts.
// ============================================================================

export const recoveryCaseStatusSchema = z.enum([
  "OPEN",
  "ASSIGNED",
  "CONTACT_ATTEMPTED",
  "CUSTOMER_REACHED",
  "ACTION_REQUIRED",
  "RESOLVED",
  "CLOSED",
  "UNREACHABLE",
  "NO_ACTION_REQUIRED",
]);
export const recoveryPrioritySchema = z.enum(["LOW", "MEDIUM", "HIGH"]);
export const recoveryOutcomeSchema = z.enum([
  "ISSUE_RESOLVED",
  "APOLOGY_ACCEPTED",
  "REFUND_QUESTION",
  "DELIVERY_COMPLAINT",
  "PRICE_COMPLAINT",
  "PRODUCT_EXPECTATION_MISMATCH",
  "CUSTOMER_UNREACHABLE",
  "CUSTOMER_DECLINED",
  "OTHER",
]);
export const recoveryResolutionTypeSchema = z.enum(["GOODWILL_CREDIT", "APOLOGY", "REFUND_FOLLOWUP", "NO_ACTION", "OTHER"]);
export const recoveryActionTypeSchema = z.enum([
  "ASSIGN",
  "CONTACT_CALL",
  "CONTACT_EMAIL",
  "UNREACHABLE",
  "ISSUE_HEARD",
  "ACTION_REQUIRED",
  "RESOLVE",
  "CLOSE",
  "NO_ACTION_REQUIRED",
  "NOTE",
]);

export const experienceRatingBucketSchema = z.enum(["ONE_TWO", "THREE", "FOUR_FIVE"]);

export const experienceListRowSchema = z.object({
  reviewId: z.string(),
  rating: z.number().int(),
  comment: z.string().nullable(),
  customerId: z.string(),
  customerName: z.string(),
  orderId: z.string(),
  orderNumber: z.string(),
  orderStatus: z.string(),
  cancelReasonCode: z.string().nullable(),
  reviewCreatedAt: z.string(),
  recovery: z
    .object({
      caseId: z.string(),
      status: recoveryCaseStatusSchema,
      priority: recoveryPrioritySchema,
      assigneePlatformUserId: z.string().nullable(),
      dueAt: z.string(),
      overdue: z.boolean(),
    })
    .nullable(),
});
export const experienceListResponseSchema = z.object({
  rows: z.array(experienceListRowSchema),
  total: z.number().int().nonnegative(),
});

export const experienceKpiSchema = z.object({
  averageRating: z.number(),
  totalReviews: z.number().int().nonnegative(),
  lowRatingRatio: z.number(),
  highRatingRatio: z.number(),
  openRecoveryCount: z.number().int().nonnegative(),
  slaOverdueCount: z.number().int().nonnegative(),
  reachedRatio: z.number(),
  resolutionRatio: z.number(),
  totalGoodwillCreditMinor: canonicalMinorAmountString,
});

export const recoveryActivitySchema = z.object({
  id: z.string(),
  type: z.string(),
  actorId: z.string().nullable(),
  outcome: z.string().nullable(),
  note: z.string().nullable(),
  creditLedgerEntryId: z.string().nullable(),
  createdAt: z.string(),
});
export const recoveryCaseDetailSchema = z.object({
  caseId: z.string(),
  status: recoveryCaseStatusSchema,
  priority: recoveryPrioritySchema,
  version: z.number().int(),
  assigneePlatformUserId: z.string().nullable(),
  openedAt: z.string(),
  firstContactAt: z.string().nullable(),
  dueAt: z.string(),
  overdue: z.boolean(),
  resolvedAt: z.string().nullable(),
  closedAt: z.string().nullable(),
  resolutionType: z.string().nullable(),
  resolutionNote: z.string().nullable(),
  review: z.object({ id: z.string(), rating: z.number().int(), comment: z.string().nullable(), createdAt: z.string() }),
  order: z.object({ id: z.string(), orderNumber: z.string(), status: z.string(), cancelReasonCode: z.string().nullable() }),
  customer: z.object({ id: z.string(), name: z.string(), email: z.string() }),
  activities: z.array(recoveryActivitySchema),
});

export const recoveryActionRequestSchema = z.object({
  action: recoveryActionTypeSchema,
  expectedVersion: z.number().int().nonnegative().optional(),
  assigneePlatformUserId: z.string().min(1).nullable().optional(),
  outcome: recoveryOutcomeSchema.nullable().optional(),
  resolutionType: recoveryResolutionTypeSchema.nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
});
export const manualOpenCaseRequestSchema = z.object({ reviewId: z.string().min(1) });

/**
 * TD-174B-1 — Store-admin SİPARİŞ DETAYI "Sipariş Deneyimi" kartı için TEK-SİPARİŞ
 * özeti. Review yoksa endpoint 200 + `null` döner (kart gizlenir). `recovery` yalnız
 * case açıldıysa dolu (1-2★ auto / 3★ manuel). `goodwillCreditMinor` bu case'e bağlı
 * RECOVERY_GOODWILL ledger toplamı (yoksa "0"). Internal note TAŞINMAZ.
 */
export const orderExperienceSummarySchema = z.object({
  reviewId: z.string(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().nullable(),
  reviewCreatedAt: z.string(),
  recovery: z
    .object({
      caseId: z.string(),
      status: recoveryCaseStatusSchema,
      priority: recoveryPrioritySchema,
      assigneePlatformUserId: z.string().nullable(),
      dueAt: z.string(),
      overdue: z.boolean(),
      resolvedAt: z.string().nullable(),
      resolutionType: z.string().nullable(),
    })
    .nullable(),
  goodwillCreditMinor: canonicalMinorAmountString,
});
export type OrderExperienceSummaryDto = z.infer<typeof orderExperienceSummarySchema>;

/**
 * TD-174B-2 — Recovery raporlama (Sipariş Deneyimi > Raporlar). experienceKpi'nın
 * ÜSTÜNE trend + zamanlama + outcome dağılımı ekler; storeId-scoped, bounded aralık.
 * Süreler dakika (integer, null=veri yok). Oranlar 0..1. Goodwill tutarı BigInt-string.
 */
export const recoveryRatingTrendPointSchema = z.object({
  date: z.string(), // YYYY-MM-DD (mağaza tz)
  count: z.number().int().nonnegative(),
  averageRating: z.number(),
  lowCount: z.number().int().nonnegative(), // 1-2★
});
export const recoveryOutcomeSliceSchema = z.object({
  outcome: z.string(),
  count: z.number().int().nonnegative(),
});
export const recoveryReportSchema = z.object({
  range: z.object({ dateFrom: z.string(), dateTo: z.string(), timezone: z.string() }),
  totals: z.object({
    totalReviews: z.number().int().nonnegative(),
    lowRatingCount: z.number().int().nonnegative(),
    highRatingCount: z.number().int().nonnegative(),
    averageRating: z.number(),
    openCases: z.number().int().nonnegative(),
    resolvedCases: z.number().int().nonnegative(),
    closedCases: z.number().int().nonnegative(),
  }),
  ratingTrend: z.array(recoveryRatingTrendPointSchema),
  avgFirstContactMinutes: z.number().int().nonnegative().nullable(),
  avgResolutionMinutes: z.number().int().nonnegative().nullable(),
  contactSuccessRatio: z.number(),
  outcomeDistribution: z.array(recoveryOutcomeSliceSchema),
  goodwill: z.object({ totalMinor: canonicalMinorAmountString, caseCount: z.number().int().nonnegative() }),
});
export type RecoveryReportDto = z.infer<typeof recoveryReportSchema>;

/**
 * TD-174B-2 — Alışveriş bakiyesi (store credit) FİNANSAL raporu (Finans > Raporlar).
 * `outstandingLiabilityMinor` NOKTA-ANLIK (şu an canlı lot Σ remaining, expiresAt>now).
 * Diğer bucket'lar aralık içi ledger hareket toplamı (issued/spent/restored/expired/
 * adjustments). Tümü BigInt minor-string; storeId-scoped. Kaynak = append-only ledger.
 */
export const creditReportSchema = z.object({
  range: z.object({ dateFrom: z.string(), dateTo: z.string(), timezone: z.string() }),
  currency: currencySchema,
  outstandingLiabilityMinor: canonicalMinorAmountString,
  activeLotCount: z.number().int().nonnegative(),
  customersWithBalance: z.number().int().nonnegative(),
  issuedMinor: canonicalMinorAmountString,
  goodwillIssuedMinor: canonicalMinorAmountString,
  spentMinor: canonicalMinorAmountString,
  restoredMinor: canonicalMinorAmountString,
  expiredMinor: canonicalMinorAmountString,
  adjustmentsNetMinor: canonicalMinorAmountString, // adjustment CREDIT − DEBIT
});
export type CreditReportDto = z.infer<typeof creditReportSchema>;

export type ExperienceListResponse = z.infer<typeof experienceListResponseSchema>;
export type ExperienceListRow = z.infer<typeof experienceListRowSchema>;
export type ExperienceKpiDto = z.infer<typeof experienceKpiSchema>;
export type RecoveryCaseDetailDto = z.infer<typeof recoveryCaseDetailSchema>;
export type RecoveryActivityDto = z.infer<typeof recoveryActivitySchema>;
export type RecoveryActionRequest = z.infer<typeof recoveryActionRequestSchema>;
export type ManualOpenCaseRequest = z.infer<typeof manualOpenCaseRequestSchema>;

// ADR-065 (Faz 2/Dilim 5) — Yayin durumu (hero slide gibi vitrin icerikleri).
// DRAFT admin'de gorunur ama vitrine cikmaz; PUBLISHED vitrinde yayinlanir.
// (schema.prisma ContentStatus enum'unun kontrat karsiligi.)
export const contentStatusSchema = z.enum(["DRAFT", "PUBLISHED"]);

// ADR-065 (Faz 2/Dilim 5) — Ana sayfa hero slide. Model COKLU kayit (tam CRUD);
// her slide birincil entity, media yalnizca bir alani. mediaId ham FK (MediaUpload
// value kimligi icin), mediaUrl runtime'da storageKey'den turetilir (render icin;
// kategori imageUrl / urun galeri url deseniyle tutarli). startsAt/endsAt semada
// vardir ancak Dilim 5 UI'i bunlari YONETMEZ (Faz 4 zamanlama; backend forward-compat).
export const heroSlideSchema = z.object({
  id: z.string().min(1),
  mediaId: z.string().min(1),
  mediaUrl: z.string(),
  position: z.number().int(),
  status: contentStatusSchema,
  headline: z.string().nullable(),
  subtext: z.string().nullable(),
  ctaLabel: z.string().nullable(),
  ctaHref: z.string().nullable(),
  startsAt: z.string().datetime().nullable(),
  endsAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// Hero az sayida kayittir → pagination YOK (kategori/urun listelerinden farkli).
export const heroSlideListResponseSchema = z.object({
  data: z.array(heroSlideSchema),
});

// R6: mediaId ZORUNLU (hero gorselsiz var olamaz; DB'de mediaId NOT NULL). status
// opsiyonel; sunucu default DRAFT ile create eder (Dilim 5'te istemci DRAFT disi
// gondermez; yayin gecisi ayri checkpoint). position sunucu tarafinda atanir
// (mevcut max+1) — istemci gondermez. Tenant/context (HERO) dogrulamasi route'ta.
export const heroSlideCreateRequestSchema = z.object({
  mediaId: z.string().min(1),
  status: contentStatusSchema.optional(),
  headline: z.string().max(200).nullable().optional(),
  subtext: z.string().max(500).nullable().optional(),
  ctaLabel: z.string().max(120).nullable().optional(),
  ctaHref: z.string().max(2048).nullable().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
});

// mediaId opsiyonel ama null'a CEKILEMEZ (.nullable() YOK — hero gorselsiz kalamaz,
// R6). Diger alanlar null = temizle. refine "en az bir alan" bos PATCH'i reddeder
// (kategori/ayarlar update deseniyle tutarli).
export const heroSlideUpdateRequestSchema = z
  .object({
    mediaId: z.string().min(1).optional(),
    status: contentStatusSchema.optional(),
    headline: z.string().max(200).nullable().optional(),
    subtext: z.string().max(500).nullable().optional(),
    ctaLabel: z.string().max(120).nullable().optional(),
    ctaHref: z.string().max(2048).nullable().optional(),
    startsAt: z.string().datetime().nullable().optional(),
    endsAt: z.string().datetime().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

// ADR-065 (Faz 2/Dilim 5, Checkpoint B) — Hero slide siralama. Sirali id listesi
// gonderilir; sunucu position=index yazar. Duplicate reddi (urun galeri imageMediaIds
// deseniyle tutarli). id-setinin mevcut slide setiyle BIREBIR eslesmesi route'ta
// dogrulanir (eksik/fazla → 400 HERO_REORDER_MISMATCH; galeri diff'inin aksine silme YOK).
export const heroSlideReorderRequestSchema = z
  .object({
    orderedIds: z.array(z.string().min(1)).min(1),
  })
  .superRefine((value, ctx) => {
    if (new Set(value.orderedIds).size !== value.orderedIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "orderedIds must not contain duplicates.",
        path: ["orderedIds"],
      });
    }
  });

// ADR-065 (Faz 2/Dilim 5, Checkpoint C) — publish/unpublish durum-gecisi hafif yaniti
// (kampanya campaignStatusActionResponseSchema deseni).
export const heroSlideStatusActionResponseSchema = z.object({
  id: z.string().min(1),
  status: contentStatusSchema,
});

// ─────────────────── TODO-158A (ADR-086) — Home Experience Platform ───────────────────
// Yönetilebilir ana sayfa "section" altyapısı. Mevcut hero (ADR-065) DOKUNULMAZ; bu katman
// ADDITIVE. Genişleyebilirlik: section `type` bir DB enum DEĞİL; burada allowlist'lenir.
// Yeni tip = bu enum'a değer + tip-özel config şeması eklemek (migration'sız).

export const homeSectionTypeSchema = z.enum([
  "HERO_SLIDER",
  "FEATURED_CATEGORIES",
  "PRODUCT_SHOWCASE",
  // TODO-161 (ADR-114) — Sponsorlu vitrin yüzeyi. İçerik AKTIF sponsorlu kampanyalardan (HOME_SHOWCASE)
  // gelir; section yalnız yerleşim konumunu (sayfa sırası) belirler. Kampanya/ürün yoksa render EDİLMEZ.
  "SPONSORED_SHOWCASE",
  // TD-129 (ADR-144) — "Son İncelediklerin" yönetilebilir şerit. Section YALNIZ sunum yapılandırması
  // taşır (başlık TR/EN + maxItems + düzen); ürünler ziyaretçiye-özgüdür → /home'da DEĞİL, storefront
  // istemcisinde mevcut /recently-viewed ucundan hidrasyon. Böylece /home cacheable + viewer-agnostic kalır.
  "RECENTLY_VIEWED",
  // TODO-162 (ADR-197…ADR-206) — Storefront Discovery & Merchandising. Eligibility-driven, ziyaretçiye-özgü
  // keşif section'ları. RECENTLY_VIEWED deseninin GENELLEŞTİRİLMESİ: bu tipler public /home'da ÜRÜN TAŞIMAZ;
  // içerik ve eligibility kararı viewer-specific Katman B ucundan (`POST .../home/discovery`) çözülür
  // (force-dynamic + no-store; shared-cache'e girmez). Eligibility sağlanmazsa section DOM'a hiç eklenmez.
  "DISCOVERY_GRID", // hero altı; içinde 2-4 eligible kart (§6)
  "CONTINUE_BROWSING", // yalnız PDP view (§7)
  "CART_RECOMMENDATIONS", // sepete göre öneri (§8)
  "PERSONALIZED_DEALS", // gerçek kullanıcı sinyalinde kampanya (§9)
  "DAILY_DEALS", // genel; gerçekten indirimli ürünler (§10)
  "EDITORIAL_CAMPAIGN", // editoryal kart (§11)
  "REPURCHASE", // yalnız auth; tekrar satın al (§12)
  "SIMILAR_TO_PURCHASED", // yalnız auth; aldıklarına benzer (§13)
  "WISHLIST_DEALS", // wishlist fırsatları (§14)
  "SPONSORED_RAIL", // sponsorlu vitrin (§15) — mevcut sponsorship reuse
]);

// Showcase düzeni. İleride EDITORIAL/MAGAZINE/MIXED eklenebilir (config alanı; migration'sız).
export const homeShowcaseLayoutSchema = z.enum(["CAROUSEL", "GRID"]);

// Dynamic showcase kural anahtarı. İlk versiyon 6 kural; kolay genişletilebilir.
export const homeShowcaseRuleSchema = z.enum([
  "NEW_PRODUCTS",
  "CAMPAIGN",
  "CATEGORY",
  "BRAND",
  "ATTRIBUTE",
  "IN_STOCK",
]);

// Showcase kaynağı: MANUAL (admin ürün seçer, HomeShowcaseProduct tablosu) veya DYNAMIC
// (kural + parametre; render-zamanı canlı katalogtan çözülür, tablo boş).
export const homeShowcaseSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("MANUAL") }),
  z.object({
    kind: z.literal("DYNAMIC"),
    rule: homeShowcaseRuleSchema,
    params: z
      .object({
        categorySlug: z.string().min(1).max(160).optional(),
        brand: z.string().min(1).max(160).optional(),
        attributeCode: z.string().min(1).max(160).optional(),
        attributeValue: z.string().min(1).max(240).optional(),
      })
      .strict()
      .optional(),
  }),
]);

// Tip-özel config şemaları. Route katmanı section.type'a göre uygun şemayı seçer ve config'i
// doğrular (parseHomeSectionConfig helper). DB'de opaque JSON; okuma/yazımda burada validate edilir.
export const homeHeroConfigSchema = z
  .object({ autoplayMs: z.number().int().min(0).max(60000).optional() })
  .strict();

export const homeFeaturedCategoriesConfigSchema = z.object({}).strict();

export const homeShowcaseConfigSchema = z
  .object({
    layout: homeShowcaseLayoutSchema.default("CAROUSEL"),
    maxItems: z.number().int().min(1).max(48).default(12),
    source: homeShowcaseSourceSchema,
  })
  .strict();

// TODO-161 (ADR-114/115) — Sponsorlu vitrin section config'i. İçerik kampanyalardan gelir (section'da
// ürün seçimi YOK); yalnız sunum + slot tavanı. maxItems tavanı SPONSORED_HOME_MAX_SLOTS (12) ile hizalı.
export const homeSponsoredShowcaseConfigSchema = z
  .object({
    layout: homeShowcaseLayoutSchema.default("GRID"),
    maxItems: z.number().int().min(1).max(12).default(8),
  })
  .strict();

// TD-129 (ADR-144) — "Son İncelediklerin" section config'i. Ürün seçimi YOK (içerik ziyaretçi geçmişinden,
// storefront istemcisinde çözülür); yalnız sunum: TR/EN başlık (locale storefront'ta seçilir → /home
// locale-agnostic/cacheable kalır), düzen ve maks. ürün sayısı. maxItems tavanı RECENTLY_VIEWED_MAX_LIMIT (50).
export const homeRecentlyViewedConfigSchema = z
  .object({
    layout: homeShowcaseLayoutSchema.default("CAROUSEL"),
    maxItems: z.number().int().min(1).max(50).default(12),
    titleTr: z.string().max(200).nullable().optional(),
    titleEn: z.string().max(200).nullable().optional(),
  })
  .strict();
export type HomeRecentlyViewedConfig = z.infer<typeof homeRecentlyViewedConfigSchema>;

// ─────────────────────── TODO-162 (ADR-197…206) — Discovery section config'leri ───────────────────────
// Ortak sunum+yönetim alanları. maxItems burada gevşek [1,12] doğrulanır; GERÇEK tip-bazlı min/max
// invariant'ı gateway eligibility-core SECTION_BOUNDS'ta (tek doğruluk kaynağı, ADR-199). Admin yalnız
// max'ı düşürebilir; min'i düşüremez (engine kelepçeler). guest/authSupported + fallbackDisabled §23 admin.
const homeDiscoveryCommonConfig = {
  titleTr: z.string().max(200).nullable().optional(),
  titleEn: z.string().max(200).nullable().optional(),
  maxItems: z.number().int().min(1).max(12).optional(),
  guestSupported: z.boolean().optional(),
  authSupported: z.boolean().optional(),
  // Yalnız fallback-izinli (generic) tiplerde etkili; admin fallback'i KAPATABİLİR, açamaz (engine).
  fallbackDisabled: z.boolean().optional(),
};

// Kişiselleştirilmiş/generic rail config'leri (CONTINUE_BROWSING, CART_RECOMMENDATIONS, PERSONALIZED_DEALS,
// DAILY_DEALS, REPURCHASE, SIMILAR_TO_PURCHASED, WISHLIST_DEALS, SPONSORED_RAIL). Ürün seçimi YOK — içerik
// viewer-specific Katman B'de eligibility motoru ile çözülür. Yalnız sunum + yönetim.
export const homeDiscoveryRailConfigSchema = z
  .object({
    layout: homeShowcaseLayoutSchema.default("CAROUSEL"),
    ...homeDiscoveryCommonConfig,
  })
  .strict();
export type HomeDiscoveryRailConfig = z.infer<typeof homeDiscoveryRailConfigSchema>;

// DISCOVERY_GRID (§6): hero altı grid. Admin kartları SIRALAR (eligibility'yi değiştiremez). Grid içeriği
// 2-4 eligible kartla sınırlıdır (engine). cards: admin'in dahil ettiği kart tipleri + sırası.
export const homeDiscoveryGridCardTypeSchema = z.enum([
  "CONTINUE_BROWSING",
  "CART_RECOMMENDATIONS",
  "PERSONALIZED_DEALS",
  "EDITORIAL_CAMPAIGN",
  "DAILY_DEALS",
]);
export const homeDiscoveryGridConfigSchema = z
  .object({
    titleTr: z.string().max(200).nullable().optional(),
    titleEn: z.string().max(200).nullable().optional(),
    guestSupported: z.boolean().optional(),
    authSupported: z.boolean().optional(),
    cards: z
      .array(
        z.object({
          type: homeDiscoveryGridCardTypeSchema,
          order: z.number().int().min(0).max(999).default(0),
        }),
      )
      .max(5)
      .optional(),
  })
  .strict();
export type HomeDiscoveryGridConfig = z.infer<typeof homeDiscoveryGridConfigSchema>;

// EDITORIAL_CAMPAIGN (§11): editoryal kart. Campaign modelinde image/CTA/TR-EN YOK → içerik section
// config'inde. Eksik içerikte fallback ÜRETİLMEZ; kart gizlenir (gateway doğrular). linkedCampaignId
// yalnız yayın-penceresi doğrulaması için (opsiyonel); hedef route ctaHref (göreli, aynı origin).
export const homeEditorialCampaignConfigSchema = z
  .object({
    mediaId: z.string().min(1).max(120).nullable().optional(),
    titleTr: z.string().max(200).nullable().optional(),
    titleEn: z.string().max(200).nullable().optional(),
    bodyTr: z.string().max(600).nullable().optional(),
    bodyEn: z.string().max(600).nullable().optional(),
    ctaLabelTr: z.string().max(80).nullable().optional(),
    ctaLabelEn: z.string().max(80).nullable().optional(),
    // Göreli, aynı-origin route (örn. /products?category=... veya /campaigns/...). Mutlak URL reddedilir.
    ctaHref: z
      .string()
      .max(400)
      .regex(/^\/[^\s]*$/u, "ctaHref göreli (/ ile başlayan) bir yol olmalı")
      .nullable()
      .optional(),
    linkedCampaignId: z.string().min(1).max(120).nullable().optional(),
    guestSupported: z.boolean().optional(),
    authSupported: z.boolean().optional(),
  })
  .strict();
export type HomeEditorialCampaignConfig = z.infer<typeof homeEditorialCampaignConfigSchema>;

// Admin section entity. config tip-özel (opaque record; admin UI type'a göre yorumlar).
export const homeSectionSchema = z.object({
  id: z.string().min(1),
  type: homeSectionTypeSchema,
  title: z.string().nullable(),
  subtitle: z.string().nullable(),
  enabled: z.boolean(),
  sortOrder: z.number().int(),
  desktopVisible: z.boolean(),
  mobileVisible: z.boolean(),
  publishStart: z.string().datetime().nullable(),
  publishEnd: z.string().datetime().nullable(),
  config: z.record(z.unknown()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const homeSectionListResponseSchema = z.object({ data: z.array(homeSectionSchema) });

// type create'te zorunlu ve sonrasında IMMUTABLE (route guard). sortOrder server-assigned (max+1).
export const homeSectionCreateRequestSchema = z.object({
  type: homeSectionTypeSchema,
  title: z.string().max(200).nullable().optional(),
  subtitle: z.string().max(400).nullable().optional(),
  enabled: z.boolean().optional(),
  desktopVisible: z.boolean().optional(),
  mobileVisible: z.boolean().optional(),
  publishStart: z.string().datetime().nullable().optional(),
  publishEnd: z.string().datetime().nullable().optional(),
  config: z.record(z.unknown()).optional(),
});

export const homeSectionUpdateRequestSchema = z
  .object({
    title: z.string().max(200).nullable().optional(),
    subtitle: z.string().max(400).nullable().optional(),
    enabled: z.boolean().optional(),
    desktopVisible: z.boolean().optional(),
    mobileVisible: z.boolean().optional(),
    publishStart: z.string().datetime().nullable().optional(),
    publishEnd: z.string().datetime().nullable().optional(),
    config: z.record(z.unknown()).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

// Section sıralama (hero reorder deseni; birebir set eşleşmesi route'ta, HOME_SECTION_REORDER_MISMATCH).
export const homeSectionReorderRequestSchema = z
  .object({ orderedIds: z.array(z.string().min(1)).min(1) })
  .superRefine((value, ctx) => {
    if (new Set(value.orderedIds).size !== value.orderedIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "orderedIds must not contain duplicates.",
        path: ["orderedIds"],
      });
    }
  });

// ── HERO_SLIDER alt varlığı (HomeHeroSlide). Mevcut HeroSlide'dan AYRI ve daha zengin. ──
export const homeHeroSlideSchema = z.object({
  id: z.string().min(1),
  sectionId: z.string().min(1),
  mediaId: z.string().min(1),
  mediaUrl: z.string(),
  mobileMediaId: z.string().nullable(),
  mobileMediaUrl: z.string().nullable(),
  videoUrl: z.string().nullable(),
  headline: z.string().nullable(),
  subtext: z.string().nullable(),
  ctaLabel: z.string().nullable(),
  ctaHref: z.string().nullable(),
  targetProductId: z.string().nullable(),
  targetCategoryId: z.string().nullable(),
  targetCampaignId: z.string().nullable(),
  enabled: z.boolean(),
  sortOrder: z.number().int(),
  publishStart: z.string().datetime().nullable(),
  publishEnd: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const homeHeroSlideListResponseSchema = z.object({ data: z.array(homeHeroSlideSchema) });

export const homeHeroSlideCreateRequestSchema = z.object({
  mediaId: z.string().min(1),
  mobileMediaId: z.string().min(1).nullable().optional(),
  videoUrl: z.string().max(2048).nullable().optional(),
  headline: z.string().max(200).nullable().optional(),
  subtext: z.string().max(500).nullable().optional(),
  ctaLabel: z.string().max(120).nullable().optional(),
  ctaHref: z.string().max(2048).nullable().optional(),
  targetProductId: z.string().min(1).nullable().optional(),
  targetCategoryId: z.string().min(1).nullable().optional(),
  targetCampaignId: z.string().min(1).nullable().optional(),
  enabled: z.boolean().optional(),
  publishStart: z.string().datetime().nullable().optional(),
  publishEnd: z.string().datetime().nullable().optional(),
});

export const homeHeroSlideUpdateRequestSchema = z
  .object({
    mediaId: z.string().min(1).optional(),
    mobileMediaId: z.string().min(1).nullable().optional(),
    videoUrl: z.string().max(2048).nullable().optional(),
    headline: z.string().max(200).nullable().optional(),
    subtext: z.string().max(500).nullable().optional(),
    ctaLabel: z.string().max(120).nullable().optional(),
    ctaHref: z.string().max(2048).nullable().optional(),
    targetProductId: z.string().min(1).nullable().optional(),
    targetCategoryId: z.string().min(1).nullable().optional(),
    targetCampaignId: z.string().min(1).nullable().optional(),
    enabled: z.boolean().optional(),
    publishStart: z.string().datetime().nullable().optional(),
    publishEnd: z.string().datetime().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

export const homeHeroSlideReorderRequestSchema = homeSectionReorderRequestSchema;

// ── FEATURED_CATEGORIES alt varlığı (HomeFeaturedCategory). ──
export const homeFeaturedCategorySchema = z.object({
  id: z.string().min(1),
  sectionId: z.string().min(1),
  categoryId: z.string().min(1),
  categorySlug: z.string(),
  categoryName: z.string(),
  imageMediaId: z.string().nullable(),
  // Görüntü: override kapak varsa o, yoksa kategorinin kendi görseli (ikisi de yoksa null).
  imageUrl: z.string().nullable(),
  titleOverride: z.string().nullable(),
  descriptionOverride: z.string().nullable(),
  enabled: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const homeFeaturedCategoryListResponseSchema = z.object({
  data: z.array(homeFeaturedCategorySchema),
});

export const homeFeaturedCategoryCreateRequestSchema = z.object({
  categoryId: z.string().min(1),
  imageMediaId: z.string().min(1).nullable().optional(),
  titleOverride: z.string().max(200).nullable().optional(),
  descriptionOverride: z.string().max(400).nullable().optional(),
  enabled: z.boolean().optional(),
});

export const homeFeaturedCategoryUpdateRequestSchema = z
  .object({
    imageMediaId: z.string().min(1).nullable().optional(),
    titleOverride: z.string().max(200).nullable().optional(),
    descriptionOverride: z.string().max(400).nullable().optional(),
    enabled: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

export const homeFeaturedCategoryReorderRequestSchema = homeSectionReorderRequestSchema;

// ── PRODUCT_SHOWCASE (MANUAL kaynak) alt varlığı (HomeShowcaseProduct). ──
export const homeShowcaseProductSchema = z.object({
  id: z.string().min(1),
  sectionId: z.string().min(1),
  productId: z.string().min(1),
  productTitle: z.string(),
  productSlug: z.string(),
  coverUrl: z.string().nullable(),
  sortOrder: z.number().int(),
});

export const homeShowcaseProductListResponseSchema = z.object({
  data: z.array(homeShowcaseProductSchema),
});

// Manuel showcase ürünleri TEK atomik "set" ile yönetilir (sıralı liste = replace).
// Boş dizi = tüm manuel seçimleri temizle. Duplicate reddi.
export const homeShowcaseProductSetRequestSchema = z
  .object({ productIds: z.array(z.string().min(1)).max(48) })
  .superRefine((value, ctx) => {
    if (new Set(value.productIds).size !== value.productIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "productIds must not contain duplicates.",
        path: ["productIds"],
      });
    }
  });

// ADR-065 (Faz 2/Dilim 2) — urun galerisi ogesi. mediaId ham FK (edit modunda
// MediaUpload value'sunun kimligi ve "zaten ekli" kontrolu icin), url ise
// runtime'da storageKey'den turetilen public URL (render icin). position=0 kapak
// (ayri coverImageUrl alani YOK; kapak images[0]'dan turetilir). Kategori tekil
// imageId/imageUrl deseninin cogul karsiligidir.
export const productImageSchema = z.object({
  mediaId: z.string().min(1),
  url: z.string(),
  altText: z.string().nullable(),
  position: z.number().int(),
  // Faz 2C-7 (ADR-078) — Variant Media Engine. Bu gorselin baglandigi media-tanimlayici
  // eksen degeri (genelde Renk option id'si). null = "Tum varyantlar" (paylasilan gorsel).
  // Yalniz Product.mediaDefiningAttributeId set iken anlamlidir. default(null): eski
  // fixture/consumer'lar bu alani vermeden parse edebilir (geriye uyumlu).
  optionId: z.string().nullable().default(null),
});

export const productSchema = z.object({
  id: z.string().min(1),
  storeId: z.string().min(1),
  title: z.string().min(1),
  slug: slugSchema,
  // TODO-165B — Slug kilidi (admin form otomatik/manuel durumu + "yeniden üret" aksiyonu).
  slugLocked: z.boolean().default(false),
  description: z.string().nullable(),
  status: productStatusSchema,
  type: productTypeSchema,
  vendor: z.string().nullable(),
  brand: z.string().nullable(),
  // TODO-165A (ADR-165A) Task 17 — governed marka FK (Task 7'de kabul edilen `brandId`
  // GET/detail cikisinda eksikti; edit formu bu yuzden secili markayi ON-SECEMIYORDU).
  // `brand` (yukarida) legacy serbest-metin alanidir ve DEGISMEDEN kalir.
  brandId: z.string().nullable().default(null),
  // Kucuk marka OZETI (id/name/slug) — edit formu ayrica marka kaydini FETCH ETMEDEN
  // secili chip'i gosterebilsin diye. Public projeksiyondaki `brandRef` deseniyle
  // isim/sekil tutarlidir (bkz. publicProductSchema). null = markasiz veya governed FK yok.
  brandRef: z
    .object({ id: z.string().min(1), name: z.string().min(1), slug: slugSchema })
    .nullable()
    .default(null),
  seoTitle: z.string().nullable(),
  seoDescription: z.string().nullable(),
  salesMode: productSalesModeSchema,
  priceVisibility: productPriceVisibilitySchema,
  primaryAction: productPrimaryActionSchema,
  inquiryEnabled: z.boolean(),
  appointmentRequired: z.boolean(),
  whatsappEnabled: z.boolean(),
  purchasable: z.boolean(),
  minOrderQuantity: z.number().int().positive(),
  maxOrderQuantity: z.number().int().positive().nullable(),
  callToActionLabel: z.string().nullable(),
  whatsappMessageTemplate: z.string().nullable(),
  inquiryFormTitle: z.string().nullable(),
  appointmentNote: z.string().nullable(),
  categoryIds: z.array(z.string().min(1)).default([]),
  // Faz 1A (ADR-067) — urunun TEK ana kategorisi (dinamik sema/breadcrumb kaynagi).
  // categoryIds icindeki bir id olmalidir (route service guard); legacy/kategorisiz
  // urunde null. Admin response'ta doner; public projeksiyonda YOK (label sunucuda turer).
  primaryCategoryId: z.string().nullable(),
  // Faz 2C-7 (ADR-078) — Variant Media Engine. Bu urunun gorsellerini gruplayan TEK
  // media-tanimlayici eksen (genelde Renk); null = klasik urun galerisi (backward compat).
  // default(null): eski fixture/consumer'lar bu alani vermeden parse edebilir.
  mediaDefiningAttributeId: z.string().nullable().default(null),
  // ADR-065 (Faz 2/Dilim 2) — urun galerisi (coklu, sirali). position ASC dondurulur;
  // images[0] kapaktir. Entity kendi GET'inden galerisini dondurur.
  images: z.array(productImageSchema).default([]),
  // F3C.2 — Kargo olcumu (desi/kg). DESI_TABLE/WEIGHT_TABLE/PER_KG_OR_DESI tarifelerinde
  // kullanilir; varyant degeri urun-seviyesini override eder (bkz. productVariantSchema).
  shippingWeightKg: z.number().nullable(),
  shippingDesi: z.number().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const productListResponseSchema = z.object({
  data: z.array(productSchema),
  // TODO-159A (ADR-089) — ortak Data Grid meta'sı (legacy limit/offset/total KORUNUR).
  pagination: adminListPaginationSchema,
});

/* ────────────────────────────────────────────────────────────────────────────
 * TODO-159A (ADR-089) — Ürün liste query sözleşmesi (server-side Data Grid).
 *
 * `sortBy` ALLOWLIST'tir: serbest metin ASLA orderBy'a geçmez. `price`/`stock`
 * ürünün varyantlarından TÜRETİLİR (price = aktif varyantların MIN priceMinor;
 * stock = InventoryItem varsayılan-depo toplamı, available = onHand − reserved —
 * search read-model ile AYNI otorite). `stockStatus` de aynı türetmeyi kullanır.
 *
 * Modelde ayrı bir "yayın durumu" kolonu YOKTUR: `status` (DRAFT/ACTIVE/ARCHIVED)
 * yayın otoritesidir; ticari erişilebilirlik `salesMode` + `purchasable` ile
 * ifade edilir. Uydurma kavram eklenmez.
 * ──────────────────────────────────────────────────────────────────────────── */

export const adminProductListSortBySchema = z.enum([
  "createdAt",
  "updatedAt",
  "title",
  "price",
  "stock",
]);

/** Stok durumu ürün seviyesinde türetilir (herhangi bir aktif varyantta available > 0). */
export const adminProductStockStatusSchema = z.enum(["IN_STOCK", "OUT_OF_STOCK"]);

export const adminProductListQuerySchema = adminListQueryBaseSchema.extend({
  sortBy: adminProductListSortBySchema.optional(),
  status: productStatusSchema.optional(),
  salesMode: productSalesModeSchema.optional(),
  purchasable: z.enum(["true", "false"]).optional(),
  categoryId: z.string().min(1).max(64).optional(),
  brand: z.string().trim().min(1).max(120).optional(),
  vendor: z.string().trim().min(1).max(120).optional(),
  stockStatus: adminProductStockStatusSchema.optional(),
  // Fiyat aralığı MINOR birimde (kuruş) — varyant priceMinor ile aynı ölçek.
  priceMin: z.coerce.number().int().nonnegative().optional(),
  priceMax: z.coerce.number().int().nonnegative().optional(),
});

/**
 * Filtre açılırlarını besleyen hafif uç: mağazadaki DISTINCT marka/tedarikçi
 * değerleri. Ürün listesinden BAĞIMSIZ (liste sayfalandığı için istemci tarafında
 * türetilemez); tek `groupBy` sorgusuyla döner.
 */
export const adminProductFilterOptionsResponseSchema = z.object({
  brands: z.array(z.string()),
  vendors: z.array(z.string()),
});

export type AdminProductListSortBy = z.infer<typeof adminProductListSortBySchema>;
export type AdminProductStockStatus = z.infer<typeof adminProductStockStatusSchema>;
export type AdminProductListQuery = z.infer<typeof adminProductListQuerySchema>;
export type AdminProductFilterOptionsResponse = z.infer<
  typeof adminProductFilterOptionsResponseSchema
>;

/* ────────────────────────────────────────────────────────────────────────────
 * TODO-159B (ADR-090) — Ürün SEÇİCİ sözleşmesi.
 *
 * Satır YALNIZ seçim kararı için gerekeni taşır: kapak görseli, ad, SKU, durum,
 * fiyat ve stok özeti. Açıklama / SEO / ticari model alanları BURAYA GİRMEZ —
 * seçici, ürün detay payload'ının taşıyıcısı değildir.
 *
 * `sku` YALNIZ tek aktif varyantlı üründe doludur — çok varyantlı üründe "bir
 * SKU" göstermek yanıltıcı olurdu; orada `variantCount` konuşur. `priceMinor` +
 * `currency` en ucuz aktif varyanttan, `stockAvailable` varsayılan depo
 * `onHand − reserved` toplamından gelir — liste ekranıyla (ADR-089) ve search
 * read-model ile AYNI otorite.
 * ──────────────────────────────────────────────────────────────────────────── */

export const adminProductSelectorSortBySchema = z.enum([
  "title",
  "createdAt",
  "updatedAt",
  "price",
  "stock",
]);

export const adminProductSelectorQuerySchema = adminSelectorQueryBaseSchema.extend({
  sortBy: adminProductSelectorSortBySchema.optional(),
  status: productStatusSchema.optional(),
  categoryId: z.string().min(1).max(64).optional(),
});

export const adminProductSelectorOptionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  slug: slugSchema,
  status: productStatusSchema,
  sku: z.string().nullable(),
  /** Kapak görselinin türetilmiş public URL'i; storageKey ASLA taşınmaz. */
  imageUrl: z.string().nullable(),
  priceMinor: z.number().int().nonnegative().nullable(),
  /** `priceMinor`'ın para birimi; fiyat yoksa null (uydurma varsayılan YOK). */
  currency: z.string().min(3).max(3).nullable(),
  stockAvailable: z.number().int().nullable(),
  variantCount: z.number().int().nonnegative(),
});

export const adminProductSelectorResponseSchema = z.object({
  data: z.array(adminProductSelectorOptionSchema),
  pagination: adminListPaginationSchema,
});

export type AdminProductSelectorSortBy = z.infer<typeof adminProductSelectorSortBySchema>;
export type AdminProductSelectorQuery = z.infer<typeof adminProductSelectorQuerySchema>;
export type AdminProductSelectorOption = z.infer<typeof adminProductSelectorOptionSchema>;
export type AdminProductSelectorResponse = z.infer<typeof adminProductSelectorResponseSchema>;

function isConsistentSalesModel(value: {
  salesMode?: z.infer<typeof productSalesModeSchema>;
  priceVisibility?: z.infer<typeof productPriceVisibilitySchema>;
  primaryAction?: z.infer<typeof productPrimaryActionSchema>;
  whatsappEnabled?: boolean;
  purchasable?: boolean;
}) {
  if (value.salesMode === "ONLINE") {
    if (value.primaryAction !== undefined && value.primaryAction !== "ADD_TO_CART") return false;
    if (
      value.priceVisibility !== undefined &&
      !["VISIBLE", "STARTING_FROM"].includes(value.priceVisibility)
    ) {
      return false;
    }
  }
  if (value.salesMode === "INQUIRY") {
    if (
      value.primaryAction !== undefined &&
      !["REQUEST_PRICE", "CONTACT_FORM"].includes(value.primaryAction)
    ) {
      return false;
    }
    if (value.purchasable !== undefined && value.purchasable !== false) return false;
  }
  if (value.salesMode === "APPOINTMENT") {
    if (value.primaryAction !== undefined && value.primaryAction !== "BOOK_APPOINTMENT") return false;
    if (value.purchasable !== undefined && value.purchasable !== false) return false;
  }
  if (value.salesMode === "WHATSAPP") {
    if (value.primaryAction !== undefined && value.primaryAction !== "WHATSAPP") return false;
    if (value.whatsappEnabled !== undefined && value.whatsappEnabled !== true) return false;
    if (value.purchasable !== undefined && value.purchasable !== false) return false;
  }
  if (value.salesMode === "CATALOG_ONLY") {
    if (value.primaryAction !== undefined && !["NONE", "CONTACT_FORM"].includes(value.primaryAction)) return false;
    if (value.purchasable !== undefined && value.purchasable !== false) return false;
  }
  if (["HIDDEN", "ON_REQUEST"].includes(value.priceVisibility ?? "")) {
    if (value.purchasable !== undefined && value.purchasable !== false) return false;
  }
  return true;
}

export const productCreateRequestSchema = z
  .object({
    title: z.string().min(1).max(220),
    slug: slugSchema,
    // TODO-165B — Manuel slug kilidi. true: ad degisse bile slug korunur. create'te
    // varsayilan false (kullanici slug'i elle girse de kilit acik baslar; sonra kilitleyebilir).
    slugLocked: z.boolean().default(false),
    description: optionalNullableStringSchema,
    status: productStatusSchema.default("DRAFT"),
    type: productTypeSchema.default("PHYSICAL"),
    vendor: z.string().max(120).nullable().optional(),
    brand: z.string().max(120).nullable().optional(),
    // TODO-165A (ADR-165A) — governed marka FK. `brand` (serbest metin) DORMANT kalir;
    // undefined = dokunma, null = markasiz. Cross-tenant/mevcutluk dogrulamasi route
    // katmaninda (Brand seciciyle ayni gecerlilik kurali).
    brandId: z.string().min(1).nullable().optional(),
    seoTitle: z.string().max(160).nullable().optional(),
    seoDescription: z.string().max(320).nullable().optional(),
    salesMode: productSalesModeSchema.default("ONLINE"),
    priceVisibility: productPriceVisibilitySchema.default("VISIBLE"),
    primaryAction: productPrimaryActionSchema.default("ADD_TO_CART"),
    inquiryEnabled: z.boolean().default(false),
    appointmentRequired: z.boolean().default(false),
    whatsappEnabled: z.boolean().default(false),
    purchasable: z.boolean().default(true),
    minOrderQuantity: z.number().int().positive().default(1),
    maxOrderQuantity: z.number().int().positive().nullable().optional(),
    callToActionLabel: z.string().max(120).nullable().optional(),
    whatsappMessageTemplate: z.string().max(500).nullable().optional(),
    inquiryFormTitle: z.string().max(160).nullable().optional(),
    appointmentNote: z.string().max(500).nullable().optional(),
    categoryIds: z.array(z.string().min(1)).default([]),
    // Faz 1A (ADR-067) — opsiyonel ana kategori. Cross-field semantik (zorunlu/
    // atanmis mi) route'ta `resolvePrimaryCategorySelection` ile STABIL kodlarla
    // dogrulanir; burada yalniz tip. Tek kategoride backend normalize eder (null
    // gecerli), coklu kategoride route REQUIRED dondurur.
    primaryCategoryId: z.string().min(1).nullable().optional(),
    // F3C.2 — Kargo olcumu. 0/negatif anlamsiz: >0 olmali; bos birakilabilir (null).
    shippingWeightKg: z.number().positive().nullable().optional(),
    shippingDesi: z.number().positive().nullable().optional(),
    // Faz 2A (ADR-068) — OPSIYONEL urun attribute degerleri. undefined = eski davranis
    // (attribute yazilmaz; geriye donuk uyumlu). Verildiginde attributeValueService TAM
    // istenen kume olarak isler + tip/tenant/required/option/variantDefining dogrular.
    attributeValues: z.array(productAttributeValueInputSchema).optional(),
    // Faz 2C-1 (ADR-070) — OPSIYONEL variant-defining eksen secimi. undefined = eski davranis
    // (varyant secimi yazilmaz; geriye donuk uyumlu). KOMBINASYON URETMEZ. variantSelectionService
    // TAM istenen kume olarak isler + variantDefining/option-tabanli/tenant/duplicate/≥1-option dogrular.
    variantSelections: z.array(productVariantSelectionInputSchema).optional(),
  })
  .refine((value) => value.maxOrderQuantity == null || value.maxOrderQuantity >= value.minOrderQuantity, {
    message: "maxOrderQuantity must be greater than or equal to minOrderQuantity.",
    path: ["maxOrderQuantity"],
  })
  .refine(isConsistentSalesModel, {
    message: "Product sales model fields are inconsistent.",
    path: ["salesMode"],
  });

// Faz 2C-7 (ADR-078) — Variant Media Engine. Sirali galeri ogesi + media-tanimlayici
// eksen etiketi. `imageMediaIds`'in (etiketsiz) uzeri-kumesi: verildiginde SIRALI TAM
// galeri olarak islenir ve her ogeye optionId (Renk) etiketi tasir. optionId null/yok =
// "Tum varyantlar" (paylasilan). Model tek-option (ProductImage.optionId); coklu-option
// gerekince join tablosuna gecis yalniz persistence'i degistirir.
export const productImageBindingInputSchema = z.object({
  mediaId: z.string().min(1),
  optionId: z.string().min(1).nullable().optional(),
});

export const productUpdateRequestSchema = z
  .object({
    title: z.string().min(1).max(220).optional(),
    slug: slugSchema.optional(),
    // TODO-165B — Slug yasam dongusu. `slug` (manuel override) + `slugLocked` (kilit)
    // + `regenerateFromTitle` (adindan yeniden uret aksiyonu) server-authoritative
    // resolveProductSlugOnUpdate ile cozulur; slug gercekten degisirse 301 redirect yazilir.
    slugLocked: z.boolean().optional(),
    regenerateFromTitle: z.boolean().optional(),
    description: optionalNullableStringSchema,
    status: productStatusSchema.optional(),
    type: productTypeSchema.optional(),
    vendor: z.string().max(120).nullable().optional(),
    brand: z.string().max(120).nullable().optional(),
    // TODO-165A (ADR-165A) — governed marka FK. undefined = dokunma; null = markayi
    // kaldir. Cross-tenant/mevcutluk dogrulamasi route katmaninda.
    brandId: z.string().min(1).nullable().optional(),
    seoTitle: z.string().max(160).nullable().optional(),
    seoDescription: z.string().max(320).nullable().optional(),
    salesMode: productSalesModeSchema.optional(),
    priceVisibility: productPriceVisibilitySchema.optional(),
    primaryAction: productPrimaryActionSchema.optional(),
    inquiryEnabled: z.boolean().optional(),
    appointmentRequired: z.boolean().optional(),
    whatsappEnabled: z.boolean().optional(),
    purchasable: z.boolean().optional(),
    minOrderQuantity: z.number().int().positive().optional(),
    maxOrderQuantity: z.number().int().positive().nullable().optional(),
    callToActionLabel: z.string().max(120).nullable().optional(),
    whatsappMessageTemplate: z.string().max(500).nullable().optional(),
    inquiryFormTitle: z.string().max(160).nullable().optional(),
    appointmentNote: z.string().max(500).nullable().optional(),
    categoryIds: z.array(z.string().min(1)).optional(),
    // Faz 1A (ADR-067) — ana kategori. undefined = dokunma; null = temizle (yalniz
    // kategori bosaltiliyorsa gecerli). Assignment kaldirma/degistirme + primary
    // tutarliligi route'ta tek transaction icinde STABIL kodlarla dogrulanir.
    primaryCategoryId: z.string().min(1).nullable().optional(),
    // ADR-065 (Faz 2/Dilim 2) — sirali galeri; position = dizideki index, kapak = index 0.
    // Tam sirali liste (tekil swap yok): sunucu mevcut ile diff'ler. [] gonderilirse
    // galeri tamamen temizlenir. Tenant/context dogrulamasi route katmaninda (her mediaId
    // icin assertMediaAttachable "PRODUCT"). "En az bir alan" refine'i bunu da sayar
    // (yalniz imageMediaIds ile "sadece galeriyi guncelle" istegi gecerlidir).
    imageMediaIds: z.array(z.string().min(1)).optional(),
    // Faz 2C-7 (ADR-078) — Variant Media Engine. imageMediaIds'in etiketli uzeri-kumesi:
    // SIRALI TAM galeri + her ogede optionId (Renk) etiketi. undefined = dokunma; [] = galeriyi
    // temizle. imageBindings verilirse imageMediaIds YOK SAYILIR (oncelik). Tenant/context/eksen/
    // option dogrulamasi route'ta (assertMediaAttachable + assertMediaOptionBinding).
    imageBindings: z.array(productImageBindingInputSchema).optional(),
    // Faz 2C-7 (ADR-078) — media-tanimlayici eksen. undefined = dokunma; null = klasik moda don
    // (etiketler ProductImage'da Restrict ile korunur, gorsel kaybi yok); string = ekseni ayarla
    // (yalniz SELECT/COLOR + bu urunun variant-defining ekseni olmali — route service guard).
    mediaDefiningAttributeId: z.string().min(1).nullable().optional(),
    // F3C.2 — Kargo olcumu. >0 olmali; null = temizle.
    shippingWeightKg: z.number().positive().nullable().optional(),
    shippingDesi: z.number().positive().nullable().optional(),
    // Faz 2A (ADR-068) — OPSIYONEL urun attribute degerleri (TAM istenen kume). undefined =
    // dokunma (eski davranis korunur); [] = tumunu temizle. attributeValueService dogrular.
    attributeValues: z.array(productAttributeValueInputSchema).optional(),
    // Faz 2C-1 (ADR-070) — OPSIYONEL variant-defining eksen secimi (TAM istenen kume). undefined =
    // dokunma (eski davranis); [] = tumunu temizle. KOMBINASYON URETMEZ. variantSelectionService dogrular.
    variantSelections: z.array(productVariantSelectionInputSchema).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  })
  .refine(
    (value) =>
      value.imageMediaIds === undefined ||
      new Set(value.imageMediaIds).size === value.imageMediaIds.length,
    {
      // @@unique([productId, mediaId]) ihlaline karsi ilk savunma katmani (UI Set'i ikinci).
      message: "DUPLICATE_IMAGE",
      path: ["imageMediaIds"],
    },
  )
  .refine(
    (value) =>
      value.imageBindings === undefined ||
      new Set(value.imageBindings.map((b) => b.mediaId)).size === value.imageBindings.length,
    {
      // Faz 2C-7 (ADR-078) — @@unique([productId, mediaId]) ihlaline karsi ilk savunma (imageBindings).
      message: "DUPLICATE_IMAGE",
      path: ["imageBindings"],
    },
  )
  .refine(
    (value) =>
      value.minOrderQuantity === undefined ||
      value.maxOrderQuantity == null ||
      value.maxOrderQuantity >= value.minOrderQuantity,
    {
      message: "maxOrderQuantity must be greater than or equal to minOrderQuantity.",
      path: ["maxOrderQuantity"],
    },
  )
  .refine(isConsistentSalesModel, {
    message: "Product sales model fields are inconsistent.",
    path: ["salesMode"],
  });

// ─────────────────────── Faz 1A (ADR-067) — Ana kategori secim kurallari ───────────────────────
// Ana kategori SEMANTIGININ tek KAYNAK DOGRUSU (saf, IO'suz). Route bunu cagirir ve
// donen kodu HTTP hatasina cevirir; boylece stabil hata kodlari admin UI'da ilgili
// kategori alanina baglanabilir (zod refine kullanmiyoruz cunku generic VALIDATION_ERROR
// ozel kodlari yutardi). categoryIds'in store'da var oldugu + dedup route'ta (validateCategoryIds)
// dogrulanir; bu fonksiyon yalniz kombinasyon kurallarini uygular. STORE_MISMATCH / ARCHIVED /
// ASSIGNMENT_CONFLICT baglamsal kodlaridir ve route katmaninda uretilir.
export type PrimaryCategorySelectionErrorCode =
  | "PRIMARY_CATEGORY_REQUIRED"
  | "PRIMARY_CATEGORY_NOT_ASSIGNED";

export type PrimaryCategorySelectionResult =
  | { ok: true; primaryCategoryId: string | null; categoryIds: string[] }
  | { ok: false; code: PrimaryCategorySelectionErrorCode };

/**
 * Faz 1A (ADR-067) — Ana kategori secimini normalize eder / dogrular.
 *  - categoryIds bos   => primary yalniz null olabilir (verilmisse NOT_ASSIGNED).
 *  - categoryIds tek + primary yok => otomatik o kategori (sessizce normalize).
 *  - categoryIds >1  + primary yok => REQUIRED (backend sessizce SECMEZ).
 *  - primary verilmis ama categoryIds icinde degil => NOT_ASSIGNED.
 *  - primary verilmis ve gecerli => oldugu gibi.
 * categoryIds cikista dedup edilmis dondurulur.
 */
export function resolvePrimaryCategorySelection(input: {
  categoryIds: string[];
  primaryCategoryId?: string | null;
}): PrimaryCategorySelectionResult {
  const categoryIds = [...new Set(input.categoryIds)];
  const primary = input.primaryCategoryId ?? null;
  if (categoryIds.length === 0) {
    if (primary !== null) return { ok: false, code: "PRIMARY_CATEGORY_NOT_ASSIGNED" };
    return { ok: true, primaryCategoryId: null, categoryIds };
  }
  if (primary === null) {
    if (categoryIds.length === 1) return { ok: true, primaryCategoryId: categoryIds[0]!, categoryIds };
    return { ok: false, code: "PRIMARY_CATEGORY_REQUIRED" };
  }
  if (!categoryIds.includes(primary)) return { ok: false, code: "PRIMARY_CATEGORY_NOT_ASSIGNED" };
  return { ok: true, primaryCategoryId: primary, categoryIds };
}

// ADR-065 (Faz 2/Dilim 2) — NOT: public/vitrin semalari (publicProductDetailSchema)
// bu dilimde DEGISMEDI; storefront galeri render'i Faz 3'e aittir.

export const productVariantSchema = z.object({
  id: z.string().min(1),
  productId: z.string().min(1),
  storeId: z.string().min(1),
  title: z.string().min(1),
  sku: skuSchema,
  // TODO-160A (ADR-110) — SKU kaynagi (governance). Additive; eski projeksiyonlarda MANUAL.
  skuSource: skuSourceSchema,
  barcode: z.string().nullable(),
  priceMinor: z.number().int().nonnegative(),
  compareAtMinor: z.number().int().nonnegative().nullable(),
  // F4B — Maliyet (minor). Yalnizca yonetim tarafinda gorunur; public'e sizmaz.
  // priceMinor (satis) ile karistirilmamali; marj/kar gostergesi bundan turer.
  costMinor: z.number().int().nonnegative().nullable(),
  // F4C (ADR-063) — KDV alanlari. priceMinor KDV DAHIL brut satis fiyati olarak
  // KALIR; netPriceMinor admin'in girdigi KDV HARIC fiyat, vatAmountMinor ve
  // brut SUNUCUDA hesaplanir (istemci hesabina guvenilmez). vatRateBps:
  // 2000=%20, 1000=%10, 100=%1, 0=%0.
  netPriceMinor: z.number().int().nonnegative().nullable(),
  vatRateBps: z.number().int().min(0).max(10000),
  vatAmountMinor: z.number().int().nonnegative().nullable(),
  currency: currencySchema,
  status: productVariantStatusSchema,
  optionValues: jsonRecordSchema.nullable(),
  // F3C.2 — Kargo olcumu; urun-seviyesi degerini override eder (varyantta bos ise fallback).
  shippingWeightKg: z.number().nullable(),
  shippingDesi: z.number().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const productVariantListResponseSchema = z.object({
  data: z.array(productVariantSchema),
  pagination: z.object({
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
});

/* ────────────────────────────────────────────────────────────────────────────
 * TODO-160A (ADR-109…113) — SKU Generation & Governance contracts.
 * Deterministik varyant-seviyesi SKU: preview (salt-okuma) + regenerate (server-authoritative)
 * + validate (manuel override) + audit (salt-okuma). SKU issue/problem kodlari STABIL string'dir.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Bir varyant icin SKU onizleme/regenerate satiri (deterministik oneri + tani). */
export const skuPreviewRowSchema = z.object({
  variantId: z.string().min(1),
  status: productVariantStatusSchema,
  currentSku: z.string(),
  skuSource: skuSourceSchema,
  /** Cakisma cozulmus deterministik oneri. */
  suggestedSku: z.string(),
  /** Cakisma cozumu ONCESI deterministik temel. */
  baseSku: z.string(),
  /** suggested != current. */
  changed: z.boolean(),
  /** Temel cakisti, sonek uygulandi. */
  collision: z.boolean(),
  /** MANUAL/IMPORTED kaynak → auto regenerate ATLAR (force yoksa). */
  protected: z.boolean(),
  /** Mevcut SKU'nun tani kodlari (SKU_EMPTY, SKU_INVALID_CHARS, ...). */
  issues: z.array(z.string()),
});
export const skuPreviewResponseSchema = z.object({
  rows: z.array(skuPreviewRowSchema),
  counts: z.object({
    total: z.number().int().nonnegative(),
    changed: z.number().int().nonnegative(),
    collisions: z.number().int().nonnegative(),
    protectedCount: z.number().int().nonnegative(),
  }),
});

export const skuRegenerateRequestSchema = z.object({
  /** Yalniz AUTO kaynakli SKU'lari yeniden uret (default true — manuel SKU sessizce degismez). */
  onlyAutoSource: z.boolean().optional(),
  /** true → MANUAL/IMPORTED dahil yeniden uret (acik override). */
  force: z.boolean().optional(),
  /** Alt kume (verilmezse urunun tum varyantlari). */
  variantIds: z.array(z.string().min(1)).max(2000).optional(),
});
export const skuRegenerateResponseSchema = z.object({
  batchId: z.string(),
  updated: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  rows: z.array(skuPreviewRowSchema),
});

export const skuValidateRequestSchema = z.object({
  sku: z.string(),
  /** Guncelleme senaryosu — kendi variantId'siyle cakismayi yok say. */
  variantId: z.string().min(1).optional(),
});
export const skuValidateResponseSchema = z.object({
  ok: z.boolean(),
  normalized: z.string(),
  errors: z.array(z.string()),
  /** Store icinde benzersiz mi (baska bir varyant almamis mi). */
  available: z.boolean(),
});

/** Store-scoped SKU audit satiri (salt-okuma governance). */
export const skuAuditRowSchema = z.object({
  variantId: z.string().min(1),
  productId: z.string().min(1),
  currentSku: z.string(),
  skuSource: skuSourceSchema,
  status: productVariantStatusSchema,
  /** Problem kodlari: EMPTY · DUPLICATE · INVALID_CHARS · TOO_LONG · BARCODE_EQUALS_SKU · OPAQUE. */
  problems: z.array(z.string()),
  /** Onerilen (deterministik) SKU — null ise oneri uretilemedi. */
  suggestedSku: z.string().nullable(),
});
export const skuAuditResponseSchema = z.object({
  storeId: z.string().min(1),
  scanned: z.number().int().nonnegative(),
  flagged: z.number().int().nonnegative(),
  /** problem kodu → adet. */
  summary: z.record(z.number().int().nonnegative()),
  rows: z.array(skuAuditRowSchema),
  /** Rapor limitle kesildi mi (flagged > rows.length). */
  truncated: z.boolean(),
});

/**
 * F4B — Kampanya-disi fiyat/liste/maliyet degisikligi audit'i (append-only).
 * Yonetim gorunumu; asla public degildir (maliyet iceriр). Storefront Omnibus
 * gosterimi bu kayitlar uzerinden turer ("son N gunun en dusuk fiyati").
 */
export const priceChangeSourceSchema = z.enum(["ADMIN_EDIT", "IMPORT", "API"]);

export const productPriceChangeSchema = z.object({
  id: z.string().min(1),
  storeId: z.string().min(1),
  productId: z.string().min(1),
  variantId: z.string().min(1),
  changedByPlatformUserId: z.string().nullable(),
  currency: currencySchema,
  oldPriceMinor: z.number().int().nonnegative().nullable(),
  newPriceMinor: z.number().int().nonnegative().nullable(),
  oldCompareAtMinor: z.number().int().nonnegative().nullable(),
  newCompareAtMinor: z.number().int().nonnegative().nullable(),
  oldCostMinor: z.number().int().nonnegative().nullable(),
  newCostMinor: z.number().int().nonnegative().nullable(),
  source: priceChangeSourceSchema,
  reason: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export const productPriceChangeListResponseSchema = z.object({
  data: z.array(productPriceChangeSchema),
  pagination: z.object({
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
});

/**
 * Public storefront catalog DTO'lari (TD-032 / TODO-061).
 *
 * Bu semalar, auth gerektirmeyen public-read katalog uclarinin DONDURDUGU
 * govdedir ve bir ALLOWLIST'tir: yalnizca vitrinde gosterilmesi guvenli olan
 * alanlar tanimlidir. Ic/yonetim alanlari (storeId, status, type, seo*, audit
 * zaman damgalari, tedarikci/maliyet/marj, ozel not, kategori id listesi vb.)
 * bilincli olarak DISARIDA birakilmistir. Gateway, kayitlari bu semalarla
 * `parse` ederek serialize eder; semada olmayan her alan otomatik dusturulur.
 *
 * Fiyat gizliligi: priceVisibility HIDDEN/ON_REQUEST oldugunda numerik fiyat
 * (priceMinor/compareAtMinor) gateway tarafinda `null` yapilir; sayisal fiyat
 * public govdede ASLA gorunmez (yalnizca etiket davranisina karar verecek
 * priceVisibility bayragi doner).
 */
export const publicProductVariantSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  sku: skuSchema,
  /** priceVisibility VISIBLE/STARTING_FROM degilse null (fiyat sizmaz). */
  priceMinor: z.number().int().nonnegative().nullable(),
  compareAtMinor: z.number().int().nonnegative().nullable(),
  /**
   * F4B — EU Omnibus: son N gunun (default 30) en dusuk SATIS fiyati (minor).
   * Yalnizca gecerli bir compareAt indirimi varken ve fiyat gorunurken doldurulur;
   * aksi halde null. Bu bir FIYAT'tir (maliyet DEGIL); public'e sizmesi guvenli.
   */
  lowestPriceMinor: z.number().int().nonnegative().nullable(),
  currency: currencySchema,
  /** Satilabilir stok adedi; bilinmiyorsa null. */
  available: z.number().int().nullable(),
  inStock: z.boolean(),
  /**
   * Faz 2C-7 (ADR-078) — Variant Media Engine. Bu varyantin media-tanimlayici eksendeki
   * (Renk) OPTION id'si; `ProductVariantOptionValue`'dan turetilir. Urunun
   * mediaDefiningAttributeId'si yoksa ya da varyantin o eksende degeri yoksa null.
   * Vitrin, secili varyanta gore galeriyi image.variantOptionId ile eslesenlere filtreler.
   * Yalnizca option id'dir; hicbir media ic alani tasimaz.
   */
  mediaOptionId: z.string().nullable().default(null),
});

/**
 * F4A.1 — Public urun kampanya rozeti (ALLOWLIST). Yalnizca vitrinde reklam
 * edilmesi guvenli alanlar tasinir: kampanya IC kimligi, kullanim/limit
 * istatistikleri, priority, stackable, kapsam id listeleri ve isPublic=false
 * kampanyalar bu projeksiyona ASLA girmez. Etiket metni istemci tarafinda
 * paylasilan helper'la (getCampaignPublicLabel/getCampaignBadgeText) uretilir.
 */
/**
 * F4A.3 — Vitrin kampanya gosterim taksonomisi (ADR-060):
 *  - AUTOMATIC_CART_DISCOUNT: kod gerektirmeden sepette otomatik uygulanir
 *    ("Sepette %10").
 *  - PUBLIC_COUPON: public kupon; urun detay/sepette kupon karti/aksiyonu ile
 *    gosterilir. (Private kuponlar bu projeksiyona ASLA girmez.)
 */
export const publicCampaignDisplayKindSchema = z.enum([
  "AUTOMATIC_CART_DISCOUNT",
  "PUBLIC_COUPON",
]);

/** F4A.3 — Public kupon icin urun detay aksiyonu. */
export const publicCouponActionSchema = z.enum(["CLAIM", "APPLY", "COPY", "MANUAL_ONLY"]);

/* ─────────────────────── F4A.4 — Sunum alanlari (ADR-061) ───────────────────────
 * Bu enum/alanlar YALNIZCA gorunumdur; indirim motorunu ETKILEMEZ. Public
 * projeksiyonlara ALLOWLIST olarak eklenirler; ic kimlik/limit/istatistik/
 * priority/stackable SIZMAZ. FOLLOW/store-follow/seller-follow gibi takip
 * tabanli hicbir deger BILINCLI olarak yoktur (bu urun marketplace degildir).
 */
export const campaignBadgeVariantSchema = z.enum([
  "DEFAULT",
  "SUPER",
  "LIMITED_TIME",
  "PERSONAL",
  "WEEKEND",
  "NEW_CUSTOMER",
]);
export const campaignCardStyleSchema = z.enum(["STANDARD", "FEATURED", "PERSONAL"]);
/**
 * Erisim/edinme modeli. isPublic bu secimden TURETILIR (authoritative gate):
 *   AUTO_VISIBLE / PUBLIC_CLAIMABLE => isPublic=true
 *   CODE_CLAIMED  / ADMIN_ASSIGNED  => isPublic=false
 * Reserved (FIRST_ORDER/RETURNING/EMAIL_LIST) enforce edilemedigi icin YOK.
 */
export const campaignAccessModelSchema = z.enum([
  "AUTO_VISIBLE",
  "PUBLIC_CLAIMABLE",
  "CODE_CLAIMED",
  "ADMIN_ASSIGNED",
]);

export type CampaignBadgeVariant = z.infer<typeof campaignBadgeVariantSchema>;
export type CampaignCardStyle = z.infer<typeof campaignCardStyleSchema>;
export type CampaignAccessModel = z.infer<typeof campaignAccessModelSchema>;

/**
 * accessModel -> isPublic tek-yonlu turetim. isPublic public projeksiyon icin
 * AUTHORITATIVE gate olarak kalir; admin formu isPublic'i ayri input olarak
 * GOSTERMEZ, bu fonksiyonla tutarli sekilde set eder.
 */
export function deriveIsPublicFromAccessModel(accessModel: CampaignAccessModel): boolean {
  return accessModel === "AUTO_VISIBLE" || accessModel === "PUBLIC_CLAIMABLE";
}

/**
 * F4A.4 — Public-safe kupon SUNUM alan paketi. Rozet/cuzdan/kupon-merkezi
 * kartlarinda ORTAK kullanilir. Tumu nullable/defaultlu: eksikse UI uretilmis
 * fallback'e doner. Ic kampanya alanlari (limit/priority/istatistik) GIRMEZ.
 */
export const couponDisplayFieldsSchema = z.object({
  displayTitle: z.string().nullable().default(null),
  shortDescription: z.string().nullable().default(null),
  badgeLabel: z.string().nullable().default(null),
  badgeVariant: campaignBadgeVariantSchema.nullable().default(null),
  cardStyle: campaignCardStyleSchema.default("STANDARD"),
  terms: z.string().nullable().default(null),
});
export type CouponDisplayFields = z.infer<typeof couponDisplayFieldsSchema>;

export const publicCampaignBadgeSchema = z.object({
  /** COUPON = kupon kodu gerektirir; AUTOMATIC = sepette kendiliginden uygulanir. */
  kind: z.enum(["AUTOMATIC", "COUPON"]),
  /** F4A.3 — Ayrimli gosterim taksonomisi (kind ile tutarli; additive). */
  displayKind: publicCampaignDisplayKindSchema,
  /** F4A.3 — Kupon kodu gerektiren kampanya mi (PUBLIC_COUPON icin true). */
  requiresCouponCode: z.boolean().default(false),
  discountType: z.enum(["PERCENT", "FIXED_AMOUNT"]),
  /** PERCENT: 1-100; FIXED_AMOUNT: minor unit tutar. */
  discountValue: z.number().int().positive(),
  /**
   * F4A.6 — Otomatik indirimin ust siniri (varsa). Vitrin per-varyant "Sepette"
   * tahminini motorla AYNI capleme ile hesaplayabilsin diye tasinir; kampanyanin
   * reklam edilen teklifinin parcasidir (ic limit/priority DEGIL). Yoksa null.
   */
  maxDiscountAmountMinor: z.number().int().positive().nullable().default(null),
  /** Varsa "X uzeri gecerli" copy'si icin minimum sepet tutari. */
  minOrderAmountMinor: z.number().int().positive().nullable(),
  /**
   * F4A.3 — Public kupon kodu; YALNIZCA guvenli oldugunda (isPublic + ACTIVE +
   * pencere gecerli) doldurulur, aksi halde null. Otomatik kampanyada her zaman null.
   * PRIVATE kupon kodu bu alanda ASLA sizmaz.
   */
  couponCode: z.string().max(40).nullable().default(null),
  /** F4A.3 — Urun detay kupon aksiyonu; kod yoksa MANUAL_ONLY. */
  couponAction: publicCouponActionSchema.default("MANUAL_ONLY"),
  /** F4A.3 — Kampanya/kupon bitis tarihi (ISO); yoksa null. */
  endsAt: z.string().datetime().nullable().default(null),
  /**
   * F4A.6 (ADR-062) — Otomatik sepet indiriminin GUVENLI birim-basi tahmini.
   * YALNIZCA otomatik (AUTOMATIC_CART_DISCOUNT) + PERCENT + tek-fiyatli urun +
   * (minOrder yok ya da birim fiyat esigi karsiliyor) durumunda doldurulur;
   * aksi halde null (sahte nihai fiyat URETILMEZ). Motorla ayni formul:
   * round(unit*yuzde), maxDiscount cap. Kupon rozetinde HER ZAMAN null.
   * KAYNAK DOGRUSU checkout motorudur; bu yalniz gorunum tahminidir.
   */
  estimatedDiscountMinor: z.number().int().nonnegative().nullable().default(null),
  estimatedFinalUnitPriceMinor: z.number().int().nonnegative().nullable().default(null),
  /** F4A.4 — Admin-kontrollu sunum alanlari (allowlist; yoksa UI fallback uretir). */
  ...couponDisplayFieldsSchema.shape,
});

/**
 * ADR-065 (Faz 3/Dilim 1) — Public urun gorseli (ALLOWLIST). Yalnizca vitrinde
 * gosterilmesi guvenli alanlar tasinir: runtime'da storageKey'den turetilen public
 * `url` + `altText` + `position`. Ic/yonetim alanlari (mediaId ham FK, storageKey,
 * checksum, createdBy) bilincli olarak DISARIDA birakilir; admin `productImageSchema`
 * `mediaId` tasir, bu public karsiligi TASIMAZ. `position` yalniz siralama indeksidir
 * (0=kapak); dizi zaten position ASC dondurulur.
 */
export const publicProductImageSchema = z.object({
  url: z.string(),
  altText: z.string().nullable(),
  position: z.number().int(),
  // Faz 2C-7 (ADR-078) — Variant Media Engine (ALLOWLIST-guvenli). Bu gorselin ait oldugu
  // media-tanimlayici eksen degeri (Renk OPTION id'si) ya da null = "Tum varyantlar"
  // (paylasilan). Yalnizca option id'dir — mediaId/storageKey/checksum ASLA tasinmaz.
  // Vitrin, varyant secilince galeriyi bu id'ye gore gruplar/filtreler.
  variantOptionId: z.string().nullable().default(null),
});

export const publicProductSchema = z.object({
  id: z.string().min(1),
  slug: slugSchema,
  title: z.string().min(1),
  brand: z.string().nullable(),
  /**
   * TODO-165A (ADR-165A) Task 11 — Governed marka ENTITY projeksiyonu (ADDITIVE; legacy `brand`
   * serbest-metin alanı YUKARIDA DEĞİŞMEDEN KALIR). Yalnız `product.brandId` set edilmişse dolu;
   * aksi halde null. `/markalar/[slug]` bağlantısı + marka rozeti/logosu için (linking projection).
   */
  brandRef: publicBrandSummarySchema.nullable().default(null),
  categoryLabel: z.string().nullable(),
  salesMode: productSalesModeSchema,
  priceVisibility: productPriceVisibilitySchema,
  primaryAction: productPrimaryActionSchema,
  purchasable: z.boolean(),
  whatsappEnabled: z.boolean(),
  inquiryEnabled: z.boolean(),
  appointmentRequired: z.boolean(),
  minOrderQuantity: z.number().int().positive(),
  maxOrderQuantity: z.number().int().positive().nullable(),
  variants: z.array(publicProductVariantSchema),
  /**
   * ADR-065 (Faz 3/Dilim 1) — Urun gorselleri (ALLOWLIST). Liste/ilgili ucunda
   * yalnizca kapak ([cover] ya da []); detay ucunda tam galeri (position ASC).
   * Ayni alan, farkli doldurma (gateway record'a hangi gorselleri koyduguna bagli).
   * Gorseli olmayan urunde [] → vitrin deterministik yer tutucu gosterir.
   */
  images: z.array(publicProductImageSchema).default([]),
  /**
   * Faz 2C-7 (ADR-078) — Variant Media Engine. Urunun gorsellerini gruplayan media-tanimlayici
   * eksen (Renk) id'si; null = klasik urun galerisi (varyant secimi galeriyi degistirmez).
   * Yalnizca attribute-definition id'dir (media ic alani degil). Vitrin SSR/varsayilan grup
   * ve fallback kararini bununla verir.
   */
  mediaDefiningAttributeId: z.string().nullable().default(null),
  /** F4A.1 — Bu urun icin gecerli kampanya rozeti (yoksa null; additive alan). */
  campaign: publicCampaignBadgeSchema.nullable().default(null),
  /**
   * F4A.6 (ADR-062) — Birincil rozet OTOMATIK sepet indirimi iken, ayni urune
   * uygulanan ve tum uygun kampanyalarin stackable oldugu durumda EK olarak
   * gosterilecek public kupon rozeti; aksi halde null. Tek bir non-stackable
   * kampanya varsa (checkout'ta digerlerini blokladigi icin) yalniz birincil
   * gosterilir ve bu alan null olur.
   */
  secondaryCoupon: publicCampaignBadgeSchema.nullable().default(null),
});

export const publicProductListResponseSchema = z.object({
  data: z.array(publicProductSchema),
  pagination: z.object({
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
});

/* ────────────────────────────────────────────────────────────────────────────
 * TODO-165 Fashion Vertical (ADR-247/249/250) — Public PDP fashion projeksiyonu.
 * YALNIZ FASHION_VERTICAL açık mağazada + fashion ürününde dolu; aksi halde null
 * (capability-aware, leak-free). Yapısal eksenler (renk/beden) + fashion attribute
 * özetleri + published size chart özeti. Salt sunum verisi (hesaplama yok).
 * ──────────────────────────────────────────────────────────────────────────── */
export const publicFashionOptionSchema = z.object({
  optionId: z.string(),
  value: z.string(),
  label: z.string(),
  colorHex: z.string().nullable().default(null),
  colorFamily: z.string().nullable().default(null),
  order: z.number().int(),
  // TODO-165B — Renk/beden kartı fiyat özeti (SERVER-authoritative; bu option'a sahip ACTIVE
  // + görünür-fiyatlı varyantların min priceMinor'ı). compareAtMinor = o min varyantın eski
  // fiyatı (yalnız indirimliyse). Karışık para birimi → startingPriceMinor null (fail-safe).
  // priceVisibility gizli veya varyant yoksa null → UI fiyat göstermez. inStock: option'ın
  // en az bir ACTIVE varyantı satılabilir mi (OOS işaretlemesi için).
  startingPriceMinor: z.number().int().nonnegative().nullable().default(null),
  compareAtMinor: z.number().int().nonnegative().nullable().default(null),
  priceCurrency: z.string().nullable().default(null),
  inStock: z.boolean().default(true),
});
export const publicFashionAxisSchema = z.object({
  attributeDefinitionId: z.string(),
  code: z.string(),
  name: z.string(),
  dataType: z.string(), // "COLOR" | "SELECT"
  kind: z.enum(["color", "size", "other"]),
  options: z.array(publicFashionOptionSchema),
});
export const publicFashionVariantAxisSchema = z.object({
  variantId: z.string(),
  // attributeDefinitionId -> optionId (bu varyantın eksen seçimleri)
  axisOptions: z.array(z.object({ attributeDefinitionId: z.string(), optionId: z.string() })),
});
export const publicFashionAttributeSchema = z.object({
  code: z.string(),
  name: z.string(),
  values: z.array(z.string()), // görünür etiketler
});
// PDP size-chart özeti (inline; publicSizeChartSchema forward-reference'ından kaçınır).
export const publicPdpSizeChartSchema = z.object({
  id: z.string(),
  name: z.string(),
  sizeSystemKey: z.string(),
  measurementUnit: z.string(),
  columns: z.array(z.object({ key: z.string(), label: z.string(), unit: z.string().optional() })),
  rows: z.array(
    z.object({ size: z.string(), cells: z.record(z.union([z.string(), z.number()])) }),
  ),
});
export const publicFashionProjectionSchema = z.object({
  optionAxes: z.array(publicFashionAxisSchema),
  variantAxisOptions: z.array(publicFashionVariantAxisSchema),
  attributes: z.array(publicFashionAttributeSchema),
  sizeSystemKey: z.string().nullable().default(null),
  sizeChart: publicPdpSizeChartSchema.nullable().default(null),
});
export type PublicFashionProjection = z.infer<typeof publicFashionProjectionSchema>;

export const publicProductDetailSchema = publicProductSchema.extend({
  description: z.string().nullable(),
  callToActionLabel: z.string().nullable(),
  whatsappMessageTemplate: z.string().nullable(),
  inquiryFormTitle: z.string().nullable(),
  appointmentNote: z.string().nullable(),
  // TODO-165 — capability-aware fashion projeksiyonu (kapalı/fashion-dışı → null).
  fashion: publicFashionProjectionSchema.nullable().default(null),
  /**
   * TODO-156D (ADR-080) — Admin-kontrollü SEO override'ları (public-safe meta metni; zaten yayına yönelik).
   * Vitrin `generateMetadata` bunları title/description için KULLANIR, yoksa title/description'a düşer.
   * Additive + nullable; iç alan değil (Product.seoTitle/seoDescription doğrudan meta amaçlıdır).
   */
  seoTitle: z.string().nullable().default(null),
  seoDescription: z.string().nullable().default(null),
  related: z.array(publicProductSchema),
});

// ── TODO-156D tamamlama (ADR-082) — Public redirect listesi (ALLOWLIST; runtime çözümleme) ──
//
// Storefront istek-zamanı redirect çözümleyicisi (middleware) bu ucu okur. YALNIZ enabled kurallar;
// `status` DB enum'undan sayısal HTTP koduna çevrilmiş (301/302/307/308). İç alan (id/storeId/notes/
// timestamps) SIZMAZ — redirect davranışı zaten public (HTTP), ancak yalnız source/target/status yeter.
export const publicRedirectSchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  status: z.union([z.literal(301), z.literal(302), z.literal(307), z.literal(308)]),
});
export const publicRedirectListResponseSchema = z.object({
  data: z.array(publicRedirectSchema),
});

// ── TODO-155 (ADR-079) — Faz 2C-8B · Public Search & Facet API (ALLOWLIST) ──
//
// Arama sonucu ürünü, search read-model doküman projeksiyonundan türetilen HAFİF listing DTO'sudur
// (buildPublicProduct'ın tam varyant/kampanya gövdesi DEĞİL). Sızmaması gerekenler (costMinor/
// netPriceMinor/storageKey/mediaId/searchText/searchVector/revision/internal facet row/tenant id)
// şemada YOKTUR → serialize edilse bile allowlist keser. `image` sayfa-yalnız bounded kapak hidrasyonu.

export const publicSearchSortSchema = z.enum([
  "relevance",
  "newest",
  "price_asc",
  "price_desc",
  "title_asc",
  "title_desc",
]);

// TODO-155.1 (ADR-079) — Faz 2C-9 · Listing projection swatch (ALLOWLIST). Media-tanımlayıcı eksen (Renk)
// kart swatch'ı. `imageUrl` runtime'da storageKey'den türetilir (storageKey/mediaId SIZMAZ). Bounded liste.
export const publicSearchSwatchSchema = z.object({
  optionId: z.string(),
  label: z.string(),
  colorHex: z.string().nullable(),
  /** Swatch kapak görseli public URL'i (option'a etiketli görsel; yoksa ürün ana görseline fallback). */
  imageUrl: z.string().nullable(),
  isDefault: z.boolean(),
});

export const publicSearchProductSchema = z.object({
  id: z.string().min(1),
  slug: slugSchema,
  title: z.string().min(1),
  brand: z.string().nullable(),
  /**
   * TODO-165A (ADR-165A) Task 11 — Governed marka ENTITY projeksiyonu (ADDITIVE; legacy `brand`
   * serbest-metin alanı YUKARIDA DEĞİŞMEDEN KALIR). Yalnız read-model'de brandId set edilmişse
   * dolu (bounded lookup ile hidratlanır); aksi halde null.
   */
  brandRef: publicBrandSummarySchema.nullable().default(null),
  categoryLabel: z.string().nullable(),
  minPriceMinor: z.number().int().nullable(),
  maxPriceMinor: z.number().int().nullable(),
  currency: z.string().nullable(),
  availability: z.enum(["IN_STOCK", "OUT_OF_STOCK"]),
  inStock: z.boolean(),
  /** Sayfa-yalnız bounded kapak görseli (ALLOWLIST: url/altText/position); yoksa null. */
  image: publicProductImageSchema.nullable().default(null),
  // ── TODO-155.1 — Listing projection zenginleştirmesi (ADDITIVE; eski istemciler kırılmaz) ──
  // Kart ticari zenginliği + swatch, read-model snapshot'ından (ikinci hydration turu YOK).
  /** En ucuz görünür varyantın compareAt'i (yalnız > satış fiyatı); üstü-çizili liste fiyatı. */
  compareAtMinor: z.number().int().nullable().default(null),
  /** İndirim yüzdesi (tek server-side formül; compareAt tabanı); indirim yoksa null. */
  discountPercent: z.number().int().nullable().default(null),
  /** EU Omnibus: son 30 günün en düşük satış fiyatı (yalnız indirim aktifken); yoksa null. */
  omnibusPreviousPriceMinor: z.number().int().nullable().default(null),
  /** İkincil/hover kart görseli (ALLOWLIST: url/altText/position); yoksa null. */
  secondaryImage: publicProductImageSchema.nullable().default(null),
  /** Media-tanımlayıcı eksen swatch'ları (bounded; ilk MAX_LISTING_SWATCHES). */
  swatches: z.array(publicSearchSwatchSchema).default([]),
  /** Toplam swatch sayısı (> swatches.length ise vitrin "+N" gösterir). */
  swatchTotalCount: z.number().int().nonnegative().default(0),
  // TODO-155.2 (ADR-079 Ek) — Kampanya rozeti snapshot'ı (BİRİNCİL; PublicCampaignBadge allowlist). Index-anı
  // snapshot + read-time geçerlilik bastırması UYGULANMIŞ (süresi geçmişse null). PDP ile AYNI "tek formül"
  // (ADR-062) → PDP↔PLP "Sepette" tutarlılığı. İç campaign id/limit/priority/stackable/usageCount SIZMAZ.
  campaign: publicCampaignBadgeSchema.nullable().default(null),
  // ── TODO-161 (ADR-114/118) — Sponsorlu yerleşim işaretleri (ADDITIVE; eski istemciler kırılmaz) ──
  // sponsored=true ise kart "Sponsorlu" rozeti gösterir (ZORUNLU). sponsoredToken opak GATEWAY-imzalı
  // (impression/click ölçümü + checkout attribution taşıyıcısı); organik üründe null. İç campaign/priority SIZMAZ.
  sponsored: z.boolean().default(false),
  sponsoredToken: z.string().nullable().default(null),
});

export const publicSearchFacetValueSchema = z.object({
  optionId: z.string().nullable(),
  value: z.string(),
  label: z.string(),
  colorHex: z.string().nullable(),
  count: z.number().int().nonnegative(),
  selected: z.boolean(),
});

export const publicSearchFacetRangeSchema = z.object({
  availableMin: z.number().nullable(),
  availableMax: z.number().nullable(),
  selectedMin: z.number().nullable(),
  selectedMax: z.number().nullable(),
});

export const publicSearchFacetSchema = z.object({
  attributeDefinitionId: z.string(),
  code: z.string(),
  name: z.string(),
  dataType: attributeDataTypeSchema,
  unit: z.string().nullable(),
  displayOrder: z.number().int(),
  selectionMode: z.enum(["MULTI", "RANGE", "BOOLEAN"]),
  values: z.array(publicSearchFacetValueSchema),
  range: publicSearchFacetRangeSchema.nullable(),
});

/** İsteğe uygulanan dinamik attribute filtresi özeti (yansıma/aktif-filtre çipi kaynağı). */
export const publicSearchAppliedAttributeFilterSchema = z.object({
  code: z.string(),
  values: z.array(z.string()).default([]),
  min: z.number().nullable().default(null),
  max: z.number().nullable().default(null),
  bool: z.boolean().nullable().default(null),
});

export const publicSearchResponseSchema = z.object({
  query: z.string().nullable(),
  category: z.string().nullable(),
  sort: publicSearchSortSchema,
  appliedFilters: z.object({
    minPrice: z.number().int().nullable(),
    maxPrice: z.number().int().nullable(),
    inStock: z.boolean(),
    attributes: z.array(publicSearchAppliedAttributeFilterSchema),
  }),
  pagination: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    totalItems: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
    hasNextPage: z.boolean(),
    hasPreviousPage: z.boolean(),
  }),
  facets: z.array(publicSearchFacetSchema),
  products: z.array(publicSearchProductSchema),
});
export type PublicSearchResponse = z.infer<typeof publicSearchResponseSchema>;
export type PublicSearchSort = z.infer<typeof publicSearchSortSchema>;
export type PublicSearchProduct = z.infer<typeof publicSearchProductSchema>;

/* ── TODO-161B (ADR-137…143) — Recently Viewed & Product Recommendations ─────────────────────────
 * Öneri kartları read-model (`ProductSearchDocument.listing`) snapshot'ından üretilir; PLP/arama ile
 * AYNI `publicSearchProductSchema` kart sözleşmesi (istemci ikinci hidrasyon YAPMAZ, fiyat otoritesi
 * DEĞİL). Yanıtlar `{ data }` sarmalıdır. */
export const RECENTLY_VIEWED_DEFAULT_LIMIT = 12;
export const RECENTLY_VIEWED_MAX_LIMIT = 50;
export const SIMILAR_PRODUCTS_DEFAULT_LIMIT = 8;
export const SIMILAR_PRODUCTS_MAX_LIMIT = 24;
/** Guest→customer merge tek istekte taşınan en fazla visitor satırı (bounded). */
export const RECENTLY_VIEWED_MERGE_MAX_ITEMS = 50;

export const recordProductViewRequestSchema = z.object({
  productId: z.string().min(1).max(64),
});
export type RecordProductViewRequest = z.infer<typeof recordProductViewRequestSchema>;

export const recordProductViewResponseSchema = z.object({
  data: z.object({
    /** false = bot/prefetch/tanımsız kimlik/geçersiz ürün → kayıt yapılmadı (sessiz, 200). */
    recorded: z.boolean(),
  }),
});
export type RecordProductViewResponse = z.infer<typeof recordProductViewResponseSchema>;

export const recentlyViewedResponseSchema = z.object({
  data: z.array(publicSearchProductSchema),
});
export type RecentlyViewedResponse = z.infer<typeof recentlyViewedResponseSchema>;

export const clearRecentlyViewedResponseSchema = z.object({
  data: z.object({ cleared: z.number().int().nonnegative() }),
});
export type ClearRecentlyViewedResponse = z.infer<typeof clearRecentlyViewedResponseSchema>;

export const recentlyViewedMergeResponseSchema = z.object({
  data: z.object({ merged: z.number().int().nonnegative() }),
});
export type RecentlyViewedMergeResponse = z.infer<typeof recentlyViewedMergeResponseSchema>;

export const similarProductsResponseSchema = z.object({
  data: z.array(publicSearchProductSchema),
});
export type SimilarProductsResponse = z.infer<typeof similarProductsResponseSchema>;

// ───────────── TD-130 (ADR-145…148) — Recommendation Measurement (event domain) ─────────────
// Öneri yüzeylerinin (Recently Viewed / Similar Products) impression/click/add-to-cart ölçümü.
// AYRI davranış-event domaini: influencer/sponsored tablolarına YAZMAZ. source/placement/type ALLOWLIST'tir
// (sunucu doğrular). storeId + kimlik + zaman SUNUCU otoritesidir (istemci belirleyemez). Bkz. ADR-146.
export const recommendationEventSourceSchema = z.enum(["RECENTLY_VIEWED", "SIMILAR_PRODUCTS"]);
export const recommendationEventPlacementSchema = z.enum(["HOME", "PDP", "CART", "ACCOUNT"]);
export const recommendationEventTypeSchema = z.enum(["IMPRESSION", "CLICK", "ADD_TO_CART"]);
export type RecommendationEventSource = z.infer<typeof recommendationEventSourceSchema>;
export type RecommendationEventPlacement = z.infer<typeof recommendationEventPlacementSchema>;
export type RecommendationEventType = z.infer<typeof recommendationEventTypeSchema>;
export const RECOMMENDATION_EVENT_SOURCES = recommendationEventSourceSchema.options;
export const RECOMMENDATION_EVENT_PLACEMENTS = recommendationEventPlacementSchema.options;
export const RECOMMENDATION_EVENT_TYPES = recommendationEventTypeSchema.options;

// Event kayıt isteği (public). productId/anchorProductId store-sahipliği gateway'de doğrulanır. dedupeKey
// YALNIZ ADD_TO_CART idempotency'si için (istemci nonce'u; aynı dönüşüm iki kez sayılmaz). Payload bounded.
export const recommendationEventRequestSchema = z.object({
  type: recommendationEventTypeSchema,
  source: recommendationEventSourceSchema,
  placement: recommendationEventPlacementSchema,
  productId: z.string().min(1).max(64),
  anchorProductId: z.string().min(1).max(64).nullable().optional(),
  dedupeKey: z.string().min(1).max(96).nullable().optional(),
});
export type RecommendationEventRequest = z.infer<typeof recommendationEventRequestSchema>;

export const recommendationEventResponseSchema = z.object({
  data: z.object({ recorded: z.boolean(), deduped: z.boolean() }),
});
export type RecommendationEventResponse = z.infer<typeof recommendationEventResponseSchema>;

// ── Store-admin görünürlük özeti (platform-admin; store-scoped). Küçük funnel; büyük raporlama YOK. ──
const recommendationSummaryBucketSchema = z.object({
  key: z.string(),
  impressions: z.number().int(),
  clicks: z.number().int(),
  addToCart: z.number().int(),
  ctr: z.number(),
});
export const recommendationSummaryResponseSchema = z.object({
  data: z.object({
    range: z.object({ from: z.string().datetime(), to: z.string().datetime() }),
    filters: z.object({
      source: recommendationEventSourceSchema.nullable(),
      placement: recommendationEventPlacementSchema.nullable(),
    }),
    totals: z.object({
      impressions: z.number().int(),
      clicks: z.number().int(),
      addToCart: z.number().int(),
      ctr: z.number(),
    }),
    bySource: z.array(recommendationSummaryBucketSchema),
    byPlacement: z.array(recommendationSummaryBucketSchema),
  }),
});
export type RecommendationSummaryResponse = z.infer<typeof recommendationSummaryResponseSchema>;

// ───────────── TODO-162 (ADR-205) — Home Discovery section-analytics (event domain) ─────────────
// Katman B kişiselleştirilmiş keşif section'larının funnel ölçümü (SECTION_IMPRESSION → CARD_IMPRESSION →
// PRODUCT_CLICK/CTA_CLICK → ADD_TO_CART). AYRI davranış-event domaini: recommendation/influencer/sponsored
// tablolarına YAZMAZ. eventType ALLOWLIST'tir; sectionType/eligibilitySource sunucuda gerçek yayınlanmış
// discovery section'a karşı doğrulanır. storeId + kimlik + zaman SUNUCU otoritesidir (istemci belirleyemez).
// Hidden/eligible-olmayan section event ÜRETMEZ (client yalnız render edileni emit eder; sunucu section
// sahipliğini doğrular). Sponsorlu kartların OTORİTATİF ölçümü yine SponsoredProductEvent token'ıdır
// (bu event yalnız funnel kırılımı; çift-ölçüm değil). Bkz. discovery-event-core.ts.
export const homeDiscoveryEventTypeSchema = z.enum([
  "SECTION_IMPRESSION",
  "CARD_IMPRESSION",
  "PRODUCT_CLICK",
  "CTA_CLICK",
  "ADD_TO_CART",
]);
export type HomeDiscoveryEventType = z.infer<typeof homeDiscoveryEventTypeSchema>;
export const HOME_DISCOVERY_EVENT_TYPES = homeDiscoveryEventTypeSchema.options;

// Event kayıt isteği (public). sectionId/sectionType/eligibilitySource gateway'de gerçek yayınlanmış
// discovery section'a karşı doğrulanır; productId/campaign/sponsored store-sahipliği gateway'de kontrol edilir.
// .strict(): customerId/storeId/visitorHash/config override gövdede KABUL EDİLMEZ (kimlik sunucu-türevi).
// dedupeKey YALNIZ ADD_TO_CART idempotency'si (istemci nonce'u; aynı dönüşüm iki kez sayılmaz). Payload bounded.
export const homeDiscoveryEventRequestSchema = z
  .object({
    type: homeDiscoveryEventTypeSchema,
    sectionId: z.string().min(1).max(64),
    sectionType: z.string().min(1).max(48),
    eligibilitySource: z.string().min(1).max(48),
    productId: z.string().min(1).max(64).nullable().optional(),
    campaignId: z.string().min(1).max(64).nullable().optional(),
    sponsoredCampaignId: z.string().min(1).max(64).nullable().optional(),
    placement: z.literal("HOME").default("HOME"),
    dedupeKey: z.string().min(1).max(96).nullable().optional(),
  })
  .strict();
export type HomeDiscoveryEventRequest = z.infer<typeof homeDiscoveryEventRequestSchema>;

export const homeDiscoveryEventResponseSchema = z.object({
  data: z.object({ recorded: z.boolean(), deduped: z.boolean() }),
});
export type HomeDiscoveryEventResponse = z.infer<typeof homeDiscoveryEventResponseSchema>;

// ── Store-admin discovery funnel özeti (platform-admin; store-scoped). Küçük funnel; büyük raporlama YOK. ──
const homeDiscoverySummaryBucketSchema = z.object({
  key: z.string(),
  sectionImpressions: z.number().int(),
  cardImpressions: z.number().int(),
  productClicks: z.number().int(),
  ctaClicks: z.number().int(),
  addToCart: z.number().int(),
  /** clickThroughRate = productClicks / cardImpressions (payda 0 → 0). */
  ctr: z.number(),
});
export const homeDiscoverySummaryResponseSchema = z.object({
  data: z.object({
    range: z.object({ from: z.string().datetime(), to: z.string().datetime() }),
    filters: z.object({
      sectionType: z.string().nullable(),
      eligibilitySource: z.string().nullable(),
    }),
    totals: z.object({
      sectionImpressions: z.number().int(),
      cardImpressions: z.number().int(),
      productClicks: z.number().int(),
      ctaClicks: z.number().int(),
      addToCart: z.number().int(),
      ctr: z.number(),
    }),
    bySectionType: z.array(homeDiscoverySummaryBucketSchema),
    byEligibilitySource: z.array(homeDiscoverySummaryBucketSchema),
  }),
});
export type HomeDiscoverySummaryResponse = z.infer<typeof homeDiscoverySummaryResponseSchema>;

export type PublicSearchSwatch = z.infer<typeof publicSearchSwatchSchema>;
export type PublicSearchFacet = z.infer<typeof publicSearchFacetSchema>;
export type PublicSearchFacetValue = z.infer<typeof publicSearchFacetValueSchema>;
/** TODO-155 sort enum değerleri (storefront sort toolbar allowlist'i; backend'le birebir). */
export const PUBLIC_SEARCH_SORTS = publicSearchSortSchema.options;

// ── TODO-156E (ADR-084) — Faz 2C-8E · Public Autocomplete & Discovery API (ALLOWLIST) ──
//
// Autocomplete AYRI, HAFİF bir uçtur (tam search DEĞİL): facet/pagination/appliedFilters YOK. Dört grup:
// query-suggestions (string), products (hafif kart), categories (breadcrumb'lı), brands (sayaçlı). Sızmaması
// gerekenler (storageKey/mediaId/searchText/searchVector/revision/internal campaign id/tenant id) ŞEMADA
// YOKTUR → serialize edilse bile allowlist keser. `image` runtime'da storageKey'den türetilir (url/altText).

export const publicAutocompleteProductSchema = z.object({
  id: z.string().min(1),
  slug: slugSchema,
  title: z.string().min(1),
  brand: z.string().nullable(),
  /** Ana kategori görünen etiketi (route-resolved; kategori id SIZMAZ). Kart hiyerarşisi ad→marka→kategori. */
  categoryLabel: z.string().nullable().default(null),
  availability: z.enum(["IN_STOCK", "OUT_OF_STOCK"]),
  inStock: z.boolean(),
  /** Bounded kapak görseli (ALLOWLIST: url/altText/position); yoksa null. */
  image: publicProductImageSchema.nullable().default(null),
  // TODO-156E UX: autocomplete SATIN ALMA ekranı DEĞİL → fiyat/indirim/kampanya-fiyatı TAŞINMAZ. Yalnız ROZET
  // sinyalleri: kampanya varlığı + opsiyonel etiket (tutar YOK), "Yeni" (productCreatedAt türevi), stok.
  /** Görüntülenebilir aktif kampanya var mı (rozet; indirim TUTARI değil). */
  hasCampaign: z.boolean().default(false),
  /** Kampanya rozet etiketi (admin-kontrollü; yoksa null → UI jenerik gösterir). */
  campaignLabel: z.string().nullable().default(null),
  /** Son 30 günde eklendi mi ("Yeni" rozeti). */
  isNew: z.boolean().default(false),
});

export const publicAutocompleteBrandSchema = z.object({
  brand: z.string().min(1),
  productCount: z.number().int().nonnegative(),
});

/** Kategori breadcrumb düğümü (kök→yaprak). */
export const publicAutocompleteCategoryPathNodeSchema = z.object({
  slug: slugSchema,
  name: z.string().min(1),
});

export const publicAutocompleteCategorySchema = z.object({
  id: z.string().min(1),
  slug: slugSchema,
  name: z.string().min(1),
  /** Kök→yaprak ata yolu (kategorinin kendisi son eleman). */
  path: z.array(publicAutocompleteCategoryPathNodeSchema).default([]),
});

export const publicAutocompleteResponseSchema = z.object({
  /** Normalize edilmiş sorgu yankısı (highlight kaynağı; ham q DEĞİL). */
  query: z.string(),
  /** Sorgu-tamamlama önerileri (deterministik, tekil, relevance sıralı). */
  suggestions: z.array(z.string()).default([]),
  products: z.array(publicAutocompleteProductSchema).default([]),
  categories: z.array(publicAutocompleteCategorySchema).default([]),
  brands: z.array(publicAutocompleteBrandSchema).default([]),
  /** Eşleşen TOPLAM ürün sayısı ("tüm sonuçları görüntüle (N)"); gösterilen products bounded. */
  total: z.number().int().nonnegative().default(0),
});
export type PublicAutocompleteResponse = z.infer<typeof publicAutocompleteResponseSchema>;
export type PublicAutocompleteProduct = z.infer<typeof publicAutocompleteProductSchema>;
export type PublicAutocompleteBrand = z.infer<typeof publicAutocompleteBrandSchema>;
export type PublicAutocompleteCategory = z.infer<typeof publicAutocompleteCategorySchema>;

/**
 * ADR-065 (Faz 3/Site Kabuğu) — Public magaza marka bilgisi (ALLOWLIST). Site
 * kabugu (header kelime-isareti/logo + <head> favicon/title) icin store-seviyesi
 * salt-okunur uc. Yalnizca vitrinde gosterilmesi guvenli alanlar: storeName +
 * runtime'da storageKey'den turetilen logoUrl/faviconUrl. Ic/yonetim alanlari
 * (logoMediaId, faviconMediaId ham FK'ler) BILINCLI olarak DISARIDA — admin
 * storeSettingsSchema bunlari tasir, bu public karsiligi TASIMAZ.
 */
export const publicStoreInfoSchema = z.object({
  storeName: z.string(),
  logoUrl: z.string().nullable(),
  faviconUrl: z.string().nullable(),
});

/**
 * ADR-065 (Faz 3/Site Kabuğu) — Public hero slide (ALLOWLIST). Yalnizca PUBLISHED
 * slide'lar bu uctan doner (DRAFT gateway SORGUSUNDA elenir, route'ta degil).
 * `key` opaque slide kimligidir (React list key; media/kaynak erisimi SAGLAMAZ).
 * `mediaId` ham FK, `status` ve zamanlama (`startsAt`/`endsAt`) BILINCLI olarak
 * DISARIDA — admin heroSlideSchema bunlari tasir, bu public karsiligi TASIMAZ.
 * Dizi position ASC dondurulur.
 */
export const publicHeroSlideSchema = z.object({
  key: z.string().min(1),
  mediaUrl: z.string(),
  headline: z.string().nullable(),
  subtext: z.string().nullable(),
  ctaLabel: z.string().nullable(),
  ctaHref: z.string().nullable(),
  position: z.number().int(),
});

// Hero az sayida kayittir → pagination YOK (public urun listesinden farkli).
export const publicHeroSlidesResponseSchema = z.object({
  data: z.array(publicHeroSlideSchema),
});

// ───────────── TODO-158A (ADR-086) — Home Experience public composed projeksiyonu ─────────────
// Vitrin ana sayfası TEK public uçtan (/public/stores/:slug/home) beslenir. Sunucu tüm çözümü
// (dynamic showcase kuralları, kategori/ürün projeksiyonu, publish penceresi) yapar; storefront
// yalnız render eder (Server Component uyumlu, no-store). ALLOWLIST: hiçbir ham FK/iç alan sızmaz.

export const publicHomeHeroSlideSchema = z.object({
  key: z.string().min(1),
  mediaUrl: z.string(),
  mobileMediaUrl: z.string().nullable(),
  headline: z.string().nullable(),
  subtext: z.string().nullable(),
  ctaLabel: z.string().nullable(),
  ctaHref: z.string().nullable(),
});

export const publicHomeFeaturedCategorySchema = z.object({
  key: z.string().min(1),
  title: z.string(),
  description: z.string().nullable(),
  href: z.string(),
  imageUrl: z.string().nullable(),
});

// Section birleşimi (discriminated union). Showcase ürünleri mevcut publicProductSchema ile
// AYNI projeksiyondur → storefront'un var olan toSummary mapper'ı değişmeden çalışır.
// Ortak section alanları (her varyantta) — responsive gizleme için görünürlük bayrakları dahil.
const publicHomeSectionBase = {
  id: z.string().min(1),
  title: z.string().nullable(),
  subtitle: z.string().nullable(),
  desktopVisible: z.boolean(),
  mobileVisible: z.boolean(),
};

export const publicHomeSectionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("HERO_SLIDER"),
    ...publicHomeSectionBase,
    autoplayMs: z.number().int().nullable(),
    slides: z.array(publicHomeHeroSlideSchema),
  }),
  z.object({
    type: z.literal("FEATURED_CATEGORIES"),
    ...publicHomeSectionBase,
    categories: z.array(publicHomeFeaturedCategorySchema),
  }),
  z.object({
    type: z.literal("PRODUCT_SHOWCASE"),
    ...publicHomeSectionBase,
    layout: homeShowcaseLayoutSchema,
    products: z.array(publicProductSchema),
  }),
  // TODO-161 (ADR-114) — Sponsorlu vitrin. Ürünler publicProductSchema + opak sponsoredToken (impression/
  // click ölçümü). Storefront "Sponsorlu" rozeti gösterir (ZORUNLU). İç campaign/priority SIZMAZ.
  z.object({
    type: z.literal("SPONSORED_SHOWCASE"),
    ...publicHomeSectionBase,
    layout: homeShowcaseLayoutSchema,
    products: z.array(publicProductSchema.extend({ sponsoredToken: z.string() })),
  }),
  // TD-129 (ADR-144) — "Son İncelediklerin". ÜRÜN TAŞIMAZ (ziyaretçiye-özgü, storefront istemcisinde
  // /recently-viewed ucundan hidrasyon). Yalnız sunum: TR/EN başlık (locale storefront'ta seçilir) +
  // maxItems + düzen. Geçmiş yoksa storefront şeridi hiç render etmez (boş-durum yer tutmaz).
  z.object({
    type: z.literal("RECENTLY_VIEWED"),
    ...publicHomeSectionBase,
    layout: homeShowcaseLayoutSchema,
    maxItems: z.number().int(),
    titleTr: z.string().nullable(),
    titleEn: z.string().nullable(),
  }),
]);

export const publicHomeResponseSchema = z.object({
  sections: z.array(publicHomeSectionSchema),
});

/* -------------------------------------------------------------------------- */
/* TODO-162 (ADR-202) — Katman B viewer-specific Discovery response            */
/* -------------------------------------------------------------------------- */

/**
 * `POST /public/stores/:storeSlug/home/discovery` istek gövdesi. YALNIZ güvenli public context taşır:
 * kimlik header'lardan (x-customer-session / x-visitor-id) SUNUCU-tarafı türetilir; body ASLA customerId/
 * storeId override/eligibility count/order history/admin config TAŞIMAZ. Sepet, mevcut public cart deseniyle
 * yalnız {variantId, quantity} REFERANSI olarak gelir (sunucu yeniden çözer). seenProductIds bounded.
 */
export const publicHomeDiscoveryRequestSchema = z
  .object({
    locale: z.enum(["tr", "en"]).default("tr"),
    currency: z.string().min(1).max(8).optional(),
    // {variantId, quantity} referansı (public cart deseniyle simetrik; sunucu yeniden çözer). Inline —
    // publicCartItemInputSchema bu noktadan SONRA tanımlı olduğundan bildirim-sırası bağımlılığı yaratmaz.
    cartItems: z
      .array(z.object({ variantId: z.string().min(1).max(120), quantity: z.number().int().positive().max(999) }))
      .max(100)
      .optional(),
    // Guest wishlist cookie ürün referansları (auth'ta sunucu CustomerList otoritedir; guest'te bu). Bounded.
    wishlistProductIds: z.array(z.string().min(1).max(120)).max(100).optional(),
    seenProductIds: z.array(z.string().min(1).max(120)).max(100).optional(),
  })
  .strict();
export type PublicHomeDiscoveryRequest = z.infer<typeof publicHomeDiscoveryRequestSchema>;

/** Editoryal kart içeriği (EDITORIAL_CAMPAIGN). mediaUrl türetilmiş göreli/CDN url; iç mediaId sızmaz. */
export const publicDiscoveryEditorialSchema = z.object({
  mediaUrl: z.string().nullable(),
  title: z.string(),
  body: z.string().nullable(),
  ctaLabel: z.string().nullable(),
  ctaHref: z.string(),
});

/** DISCOVERY_GRID içindeki tek kart. Ürün-kartları products taşır; editoryal kart editorial taşır. */
export const publicDiscoveryGridCardSchema = z.object({
  type: z.string(),
  source: z.string(),
  title: z.string().nullable(),
  products: z.array(publicProductSchema.extend({ sponsoredToken: z.string().optional() })),
  editorial: publicDiscoveryEditorialSchema.nullable(),
});

/**
 * Tek discovery section (viewer-specific). ALLOWLIST: yalnız sunum + public-safe ürün projeksiyonu.
 * `reason`/customerId/visitorHash/iç campaign config/cost/tedarikçi verisi/debug metadata TAŞIMAZ.
 * `source` = eligibility kaynağı (analytics). `sponsored` = SPONSORED_RAIL işareti (rozet ZORUNLU).
 */
export const publicDiscoverySectionSchema = z.object({
  id: z.string(),
  type: z.string(),
  source: z.string(),
  title: z.string().nullable(),
  subtitle: z.string().nullable(),
  layout: homeShowcaseLayoutSchema.nullable(),
  sponsored: z.boolean(),
  products: z.array(publicProductSchema.extend({ sponsoredToken: z.string().optional() })),
  editorial: publicDiscoveryEditorialSchema.nullable(),
  // DISCOVERY_GRID: kolon sayısı (kart sayısı) + kartlar; diğer tiplerde null.
  columns: z.number().int().nullable(),
  cards: z.array(publicDiscoveryGridCardSchema).nullable(),
});
export type PublicDiscoverySection = z.infer<typeof publicDiscoverySectionSchema>;

export const publicHomeDiscoveryResponseSchema = z.object({
  sections: z.array(publicDiscoverySectionSchema),
});
export type PublicHomeDiscoveryResponse = z.infer<typeof publicHomeDiscoveryResponseSchema>;

/**
 * F4A / Storefront redesign — Vitrin ust band kampanya slider'i icin STORE
 * seviyesi public kampanya slide listesi. Her slide, urun rozetiyle AYNI
 * public-safe projeksiyondur ({@link publicCampaignBadgeSchema}); kampanya IC
 * kimligi/limit/priority/stackable SIZMAZ. Yalnizca ACTIVE + isPublic + pencere
 * gecerli + (kupon icin) ACTIVE kuponu olan kampanyalar dahildir. Bu GERCEK F4A
 * verisidir (mock degil); kaynak dogrusu yine sunucudur.
 */
export const publicCampaignSlidesResponseSchema = z.object({
  data: z.array(publicCampaignBadgeSchema),
});

/* -------------------------------------------------------------------------- */
/* Public storefront cart + checkout (F3B.1)                                  */
/* -------------------------------------------------------------------------- */

/**
 * Public sepet + checkout kontratlari (F3B.1).
 *
 * GUVENLIK MODELI: Istemci (vitrin cookie'si) yalnizca {variantId, quantity}
 * REFERANSI gonderir. Fiyat, baslik, SKU, salesMode, stok GIBI hicbir alan
 * istemciden KABUL EDILMEZ; gateway bunlari her istekte store-scoped olarak
 * katalog/stok domaininden YENIDEN okur ve hesaplar. Bu yuzden istek semasi
 * bilincli olarak sadece referans+adet+iletisim/adres alir; yanit semalari ise
 * birer ALLOWLIST'tir (storeId/customerId/audit/reservation gibi ic alanlar
 * disarida birakilir). ONLINE disi satis modlari ve gizli fiyat (HIDDEN/
 * ON_REQUEST) sepete/siparise DUSEMEZ; numerik fiyat yalnizca gorunur fiyatli
 * ONLINE satilabilir varyantlarda doner.
 */
export const publicCartItemInputSchema = z.object({
  variantId: z.string().min(1).max(120),
  quantity: z.number().int().positive().max(999),
});

/** Uygulanan kupon kodunun durumu. NONE=kod yok, APPLIED=gecerli, INVALID=gecersiz. */
export const publicCouponStatusSchema = z.enum(["NONE", "APPLIED", "INVALID"]);

/**
 * F4A — INVALID kuponun makine-okunur nedeni (UI kopyasi istemci i18n'inde).
 * NOT_FOUND ve INACTIVE istemcide AYNI genel kopyayla gosterilmelidir (kupon
 * varligi/durumu detayini sizdirmamak icin).
 */
export const publicCouponReasonSchema = z.enum([
  "NOT_FOUND",
  "INACTIVE",
  "NOT_STARTED",
  "EXPIRED",
  "MIN_ORDER_NOT_MET",
  "USAGE_LIMIT_REACHED",
  "NOT_APPLICABLE",
]);

/** F4A — Uygulanan indirim satiri (kampanya adi + varsa kupon kodu). ALLOWLIST:
 * kampanya ic metadata'si (limit/istatistik) PUBLIC yanita TASINMAZ. */
export const publicCartDiscountLineSchema = z.object({
  label: z.string().min(1),
  code: z.string().max(40).nullable(),
  amountMinor: z.number().int().nonnegative(),
});

/**
 * F4A.3 — Sepetteki kullanilabilir kupon karti (cuzdan) durumu (ADR-060).
 *  - AVAILABLE: uygun, "Kullan" ile uygulanabilir.
 *  - APPLIED: su an sepete uygulanmis.
 *  - MIN_ORDER_NOT_MET: kart gorunur ama alt limit eksik ("Alt limit eksik").
 *  - EXPIRED: suresi dolmus (turetilir; genelde gosterilmez).
 */
export const publicWalletCouponStateSchema = z.enum([
  "AVAILABLE",
  "APPLIED",
  "MIN_ORDER_NOT_MET",
  "EXPIRED",
]);

/** F4A.3 — Kupon kartinin nereden geldigi (public/atanmis/kod-claim). */
export const publicWalletCouponSourceSchema = z.enum(["PUBLIC", "ASSIGNED", "CLAIMED"]);

/**
 * F4A.3 — Sepet "Kuponlar" alanindaki kullanilabilir kupon karti. ALLOWLIST:
 * kampanya/kupon ic kimligi, limit/istatistik, priority/stackable TASINMAZ.
 * Kod yalnizca public/claimed/assigned + guvenli oldugunda gosterilir.
 */
export const publicWalletCouponSchema = z.object({
  code: z.string().min(1).max(40),
  discountType: z.enum(["PERCENT", "FIXED_AMOUNT"]),
  discountValue: z.number().int().positive(),
  minOrderAmountMinor: z.number().int().positive().nullable(),
  endsAt: z.string().datetime().nullable(),
  state: publicWalletCouponStateSchema,
  source: publicWalletCouponSourceSchema,
  /** F4A.4 — Admin-kontrollu sunum alanlari (allowlist; yoksa UI fallback uretir). */
  ...couponDisplayFieldsSchema.shape,
});

/**
 * Sunucu-otoriter sepet OZETI. Tutarlar gateway'de hesaplanir:
 *   - KDV fiyatlara DAHILDIR; toplam uzerine EKLENMEZ. taxIncludedMinor yalnizca
 *     grandTotal icindeki KDV gostergesidir (taxRatePercent ile).
 *   - Kargo: magaza tarife planindan (ADR-036/044).
 *   - Indirim: F4A kampanya/kupon motoru (ADR-058); istemciden tutar alinmaz.
 * grandTotalMinor = itemsSubtotal - discount + shipping. Insan-okunur etiketler
 * istemci i18n'inden gelir; bu govde yalnizca makine-okunur deger/durum tasir.
 */
export const publicCartSummarySchema = z.object({
  itemsSubtotalMinor: z.number().int().nonnegative(),
  shippingMinor: z.number().int().nonnegative(),
  discountMinor: z.number().int().nonnegative(),
  taxIncludedMinor: z.number().int().nonnegative(),
  grandTotalMinor: z.number().int().nonnegative(),
  currency: currencySchema,
  /** Bu tutarin ustunde kargo ucretsiz (UI copy icin). */
  freeShippingThresholdMinor: z.number().int().nonnegative(),
  /** KDV orani (dahil); UI "KDV dahil (%20)" copy'si icin. */
  taxRatePercent: z.number().int().nonnegative(),
  /** Uygulanan/denenen kupon kodu (yoksa null). */
  couponCode: z.string().max(40).nullable(),
  couponStatus: publicCouponStatusSchema,
  /** F4A — INVALID ise makine-okunur neden; degilse null. */
  couponReason: publicCouponReasonSchema.nullable(),
  /** F4A — Uygulanan indirim satirlari (kupon + otomatik kampanyalar). */
  discountLines: z.array(publicCartDiscountLineSchema),
  /**
   * F4A.3 — Sepet "Kuponlar" alanindaki kullanilabilir kupon kartlari (cuzdan):
   * public adaylar + (oturum acmis/eslesen) atanmis + kod ile claim edilmis
   * kuponlar. Sunucu-otoriter; bos dizi = gosterilecek kart yok.
   */
  availableCoupons: z.array(publicWalletCouponSchema).default([]),
});

export const publicCartRequestSchema = z.object({
  items: z.array(publicCartItemInputSchema).max(100).default([]),
  /**
   * Dilim 6a-refine — Kullanicinin SECIMINI KALDIRDIGI satirlarin variantId'leri
   * (checkbox). Bu satirlar yanitta `selected:false` doner (sepette gorunur) ama
   * toplam/checkout'a girmez. Hassas degil; gateway her istekte yeniden uygular.
   */
  deselectedVariantIds: z.array(z.string().max(120)).max(100).optional(),
  /** Opsiyonel kupon kodu; sunucu dogrular (gecersizse INVALID doner). */
  couponCode: z.string().max(40).nullable().optional(),
  /**
   * F4A.3 — Misafir sepetinde kod ile "claim" edilmis kupon kodlari (cookie'den).
   * Sunucu her istekte yeniden dogrular; gecerli olanlar availableCoupons
   * kartlarina donusur. Oturum acmis musteride cuzdan DB'den gelir (bu alan
   * yoksayilabilir/birlestirilir). Max 20 kod.
   */
  claimedCodes: z.array(z.string().max(40)).max(20).optional(),
  /**
   * TODO-125 — Müşterinin seçtiği kargo seçeneği (= ShippingRatePlan.id). Sunucu
   * doğrular; geçersiz/uygunsuzsa güvenli varsayılana (default/en ucuz) düşer.
   */
  shippingOptionId: z.string().max(120).nullable().optional(),
  /**
   * TODO-168 (ADR-267) — ANONIM degisiklik baglami (storefront commerce_os_cart_meta cookie'sinden).
   * Sunucu bu snapshot+ack ile degisiklikleri SAF motorla hesaplar; cookie OTORITE DEGIL, yalniz
   * karsilastirma referansi. Authenticated yolda YOKSAYILIR (snapshot/ack DB'den gelir).
   */
  changeContext: z.lazy(() => publicCartChangeContextSchema).optional(),
});

/**
 * F4A.3 — Kupon "claim" (cuzdana ekle) istegi (ADR-060). Kod sunucuda
 * dogrulanir; kriter saglaniyorsa cuzdana/cookie'ye eklenir. Uygulama (APPLY)
 * AYRI bir adimdir.
 */
export const publicCouponClaimRequestSchema = z.object({
  code: z.string().min(1).max(40),
});

/** F4A.3 — Claim sonucu. ok=true ise kupon cuzdana eklendi (state ile). */
export const publicCouponClaimResponseSchema = z.object({
  ok: z.boolean(),
  /** ok=true: eklenen kupon karti; ok=false: null. */
  coupon: publicWalletCouponSchema.nullable(),
  /** Basarisizsa makine-okunur neden (UI kopyasi istemci i18n'inde). */
  reason: publicCouponReasonSchema.nullable(),
  /** Normalize edilmis kod (misafir cookie'sine yazmak icin). */
  normalizedCode: z.string().max(40).nullable(),
});

/**
 * F4A.5 — Vitrin "Kuponlarım / Tüm Kuponlar" kupon merkezi kart durumu (ADR-060
 * devami). Cuzdan kart durumlarina ek olarak USED (kullanildi gecmisi) tasir.
 * Kupon merkezi SEPET-BAGIMSIZDIR; MIN_ORDER_NOT_MET yalnizca tip butunlugu icin
 * tutulur, sunucu bu ucta uretmez (alt limit sepet-zamanli hesaplanir).
 */
export const publicCouponCenterStateSchema = z.enum([
  "AVAILABLE",
  "APPLIED",
  "MIN_ORDER_NOT_MET",
  "EXPIRED",
  "USED",
]);

/**
 * F4A.5 — Kupon merkezi tek kupon karti. ALLOWLIST (publicWalletCoupon ile ayni
 * guvenlik sozlesmesi): kampanya/kupon ic kimligi, limit/istatistik, priority/
 * stackable, redemption ic verisi TASINMAZ. Kod yalnizca public/atanmis/claim
 * edilmis + guvenli oldugunda gonderilir. usedAt/orderNumber yalnizca bu musteri/
 * email'in KENDI kullandigi kuponlar icin doldurulur (baska musteri sizmaz).
 */
export const publicCouponCenterCouponSchema = z.object({
  code: z.string().min(1).max(40),
  discountType: z.enum(["PERCENT", "FIXED_AMOUNT"]),
  discountValue: z.number().int().positive(),
  minOrderAmountMinor: z.number().int().positive().nullable(),
  endsAt: z.string().datetime().nullable(),
  state: publicCouponCenterStateSchema,
  source: publicWalletCouponSourceSchema,
  /** USED kart icin kullanim tarihi (ISO); digerlerinde null. */
  usedAt: z.string().datetime().nullable().default(null),
  /** USED kart icin musterinin KENDI siparis numarasi; digerlerinde null. */
  orderNumber: z.string().max(40).nullable().default(null),
  /** F4A.4 — Admin-kontrollu sunum alanlari (allowlist; yoksa UI fallback uretir). */
  ...couponDisplayFieldsSchema.shape,
});

/**
 * F4A.5 — Kupon merkezi yaniti (musteri-scoped, store-scoped). `coupons`:
 * kullanilabilir (public + atanmis + claim) + kullanildi (gecmis) kartlari.
 * Sunucu-otoriter; istemci indirim tutari hesaplamaz.
 */
export const publicCouponCenterResponseSchema = z.object({
  coupons: z.array(publicCouponCenterCouponSchema),
});

/** Bir sepet satirinin cozumleme/uygunluk durumu. */
export const publicCartLineStatusSchema = z.enum([
  "OK",
  "UNAVAILABLE",
  "OUT_OF_STOCK",
  "QUANTITY_ADJUSTED",
]);

// ── TODO-168 (ADR-267) — Cart Change Awareness (sepet degisiklik farkindaligi) ─────────────
/** Desteklenen degisiklik tipleri (SAF change-engine ile birebir; SELLER/FREE_SHIPPING future). */
export const cartChangeTypeSchema = z.enum([
  "PRICE_DECREASED",
  "PRICE_INCREASED",
  "DISCOUNT_STARTED",
  "DISCOUNT_ENDED",
  "VARIANT_OUT_OF_STOCK",
  "VARIANT_BACK_IN_STOCK",
  "PRODUCT_UNAVAILABLE",
  "PRODUCT_AVAILABLE_AGAIN",
  "QUANTITY_ADJUSTED",
]);
/** INFO bloklamaz · WARN ack'e kadar 409 CART_CHANGED · BLOCKING ack yetmez (CART_NOT_READY). */
export const cartChangeSeveritySchema = z.enum(["INFO", "WARN", "BLOCKING"]);

/**
 * Bir satirdaki birincil degisiklik isareti (sunucu-otoriter, deterministik). old/new minor-unit;
 * stok/varlik degisiminde 1/0 bit. fingerprint = hash(store,cart,variant,tip,old,new,currency);
 * yeni fiyat degisikligi YENI fingerprint uretir (eski ack gizlemez). Ham teknik detay sizmaz.
 */
export const publicCartLineChangeSchema = z.object({
  changeType: cartChangeTypeSchema,
  severity: cartChangeSeveritySchema,
  /** WARN → checkout ack bekler (INFO/BLOCKING icin false). */
  requiresAction: z.boolean(),
  /** BLOCKING → ack yetmez; satir duzeltilmeli. */
  blocking: z.boolean(),
  oldValueMinor: z.number().int().nullable(),
  newValueMinor: z.number().int().nullable(),
  currency: currencySchema.nullable(),
  fingerprint: z.string().min(1).max(64),
  acknowledged: z.boolean(),
});

/** Cart-seviyesi degisiklik listesi ogesi (satir isaretinin variantId ile zenginlesmis hali). */
export const publicCartChangeSchema = publicCartLineChangeSchema.extend({
  variantId: z.string().min(1),
});

/**
 * Gateway tarafindan cozulmus (sunucu-otoriter) tek sepet satiri. unitPriceMinor/
 * lineTotalMinor yalnizca ONLINE + gorunur fiyatli satilabilir varyant icindir;
 * boyle olmayan referanslar UNAVAILABLE olarak isaretlenir ve fiyat tasimaz.
 */
export const publicCartLineSchema = z.object({
  variantId: z.string().min(1),
  productSlug: slugSchema,
  title: z.string().min(1),
  variantTitle: z.string().min(1),
  sku: skuSchema,
  /** Talep edilen adet (kullaniciya gosterilen). */
  quantity: z.number().int().positive(),
  /** Stok/limit nedeniyle siparise dusebilecek nihai adet (<= quantity). */
  availableQuantity: z.number().int().nonnegative(),
  unitPriceMinor: z.number().int().nonnegative(),
  lineTotalMinor: z.number().int().nonnegative(),
  currency: currencySchema,
  minOrderQuantity: z.number().int().positive(),
  maxOrderQuantity: z.number().int().positive().nullable(),
  inStock: z.boolean(),
  status: publicCartLineStatusSchema,
  // ADR-065 (Faz 3/Dilim 6a) — ALLOWLIST: yalniz turetilmis kapak URL'i (storageKey'den
  // gateway'de resolveMediaUrl ile). mediaId/storageKey ASLA sizmaz. Gorseli olmayan
  // urun -> null (vitrin deterministik yer tutucuya duser). Zorunlu alan: cart yolu
  // her satir icin URL ya da null uretir (publicProductImageSchema.url deseniyle simetri).
  imageUrl: z.string().nullable(),
  // Dilim 6a-refine — Satir SECIM durumu (checkbox). Varsayilan true; kullanici
  // secimi kaldirinca satir sepette KALIR ama toplam/checkout'a girmez (sunucu-otoriter:
  // subtotal/itemCount/checkoutReady/indirim/kargo YALNIZ secili satirlardan hesaplanir).
  selected: z.boolean(),
  // Dilim 6a-refine — Satir birim LISTE (compareAt) fiyati; yalnizca gecerli bir indirim
  // varken (compareAt > satis fiyati) ve fiyat gorunurken doldurulur → vitrin ustu-cizili
  // gosterir. Indirim yoksa null. (PDP buy-box compareAt mantigi ile simetri.)
  // YEDEK: kampanya indirimi yoksa gosterilir (kampanya ONCELIKLI).
  compareAtMinor: z.number().int().nonnegative().nullable(),
  // Dilim 6a-refine — KAMPANYA indirimi satira dagitildiktan sonraki birim/satir fiyati
  // (motor pro-rata). Aktif kampanya bu satiri kapsiyorsa doldurulur → vitrin ustu-cizili
  // (unitPrice/lineTotal) + indirimli gosterir. Kampanya yoksa null (compareAt yedegine duser).
  discountedUnitPriceMinor: z.number().int().nonnegative().nullable(),
  discountedLineTotalMinor: z.number().int().nonnegative().nullable(),
  // TODO-168 (ADR-267) — Bu satirin add-time snapshot'ina gore birincil degisikligi (yoksa null).
  // Additive/default: degisiklik-farkinda olmayan cagrilar icin null; farkinda yol acikca doldurur.
  change: publicCartLineChangeSchema.nullable().default(null),
});

export const publicCartSchema = z.object({
  storeSlug: slugSchema,
  currency: currencySchema,
  lines: z.array(publicCartLineSchema),
  /** Yalnizca OK satirlarin toplami. */
  subtotalMinor: z.number().int().nonnegative(),
  /** OK satirlarin toplam adedi (rozet/nav sayaci). */
  itemCount: z.number().int().nonnegative(),
  /** Tum satirlar OK ve en az bir satir varsa true (checkout'a gecilebilir). */
  checkoutReady: z.boolean(),
  /** Sunucu-otoriter siparis ozeti (kargo/KDV/indirim/genel toplam). */
  summary: publicCartSummarySchema,
  // F3C.2 — Kargo TARIFE quote sonucu (status/source/amount/plan). Adres yoksa
  // ADDRESS_REQUIRED; aktif tarife yoksa NO_RATE_PLAN. (Sema asagida tanimli —
  // ileri referans icin z.lazy kullanilir.)
  shipping: z.lazy(() => cartShippingQuoteResponseSchema),
  // TODO-168 (ADR-267) — Cart Change Awareness (hepsi additive/default → geriye uyumlu).
  // Severity-sirali degisiklik listesi + ozet bayraklar. Fiyat/stok her okumada TAZE turetilir;
  // bu alanlar yalniz "neyin degistigi" + ack durumunu tasir (siparis fiyati DEGIL).
  changes: z.array(publicCartChangeSchema).default([]),
  unacknowledgedChangeCount: z.number().int().nonnegative().default(0),
  hasBlockingChanges: z.boolean().default(false),
  hasWarnings: z.boolean().default(false),
  /** Ack bekleyen en az bir WARN var mi → checkout WARN gate (INFO/BLOCKING tetiklemez). */
  requiresAcknowledgement: z.boolean().default(false),
});

// ============================================================================
// TODO-167 (ADR-266) — Persistent Cart & Cross-Device Foundation (customer cart).
//
// Authenticated musterinin KALICI DB sepeti. Anonim sepet mevcut publicCart* akisini
// kullanmaya devam eder (cookie). Projeksiyon AYNI publicCartSchema'dir (kaynaga gore
// FARKLI fiyatlama YOK); yalniz `version` (optimistic-concurrency) + `status` eklenir.
// Mutation'lar beklenen `cartVersion` tasir; uyusmazsa 409 CART_STALE + guncel projeksiyon.
// ============================================================================

/** Persistent cart limitleri (anonim cookie ile ayni ust sinirlar; sunucu-otoriter). */
export const CART_MAX_LINES = 100;
export const CART_MAX_QUANTITY = 999;

export const cartStatusSchema = z.enum(["ACTIVE", "CONVERTED", "MERGED", "EXPIRED"]);

/** Cart projeksiyonu: guncel version + status + ortak publicCart + variantId→lineId eslemesi. */
export const customerCartProjectionSchema = z.object({
  version: z.number().int().nonnegative(),
  status: cartStatusSchema,
  // TODO-168 (ADR-267) — Cart.id (analytics cartIdHash grouping; opak, gateway KVKK-hash'ler). Additive.
  cartId: z.string().default(""),
  cart: publicCartSchema,
  /** variantId → DB cart line id (istemci PATCH/DELETE /lines/:lineId icin; satirsiz = bos). */
  lineIds: z.record(z.string(), z.string()),
});

export const customerCartResponseSchema = z.object({ data: customerCartProjectionSchema });

/**
 * 409 CART_STALE govdesi: beklenen version guncelden farkli. Istemci SESSIZ overwrite
 * YAPMAZ; `data` icindeki guncel otoriter projeksiyonu gosterir ve yeniden dener.
 */
export const customerCartStaleResponseSchema = z.object({
  error: z.object({ code: z.literal("CART_STALE"), message: z.string() }),
  data: customerCartProjectionSchema,
});

/** POST /customer/cart/lines — bir varyanti ekler/artirir (mevcut adede ekler). */
export const customerCartAddLineRequestSchema = z.object({
  variantId: z.string().min(1).max(120),
  quantity: z.number().int().positive().max(CART_MAX_QUANTITY),
  cartVersion: z.number().int().nonnegative(),
});

/** PATCH /customer/cart/lines/:lineId — satir adedini AYARLAR (0 → satiri kaldirir). */
export const customerCartSetLineRequestSchema = z.object({
  quantity: z.number().int().nonnegative().max(CART_MAX_QUANTITY),
  cartVersion: z.number().int().nonnegative(),
});

/** DELETE /customer/cart/lines/:lineId — satiri kaldirir (beklenen version ile). */
export const customerCartDeleteLineRequestSchema = z.object({
  cartVersion: z.number().int().nonnegative(),
});

/**
 * POST /customer/cart/reconcile — cozulemeyen (silinmis/pasif/baska-store) varyant
 * satirlarini SUNUCUDA budar (istemci kalemine guvenmez); guncel projeksiyon doner.
 */
export const customerCartReconcileRequestSchema = z.object({
  cartVersion: z.number().int().nonnegative(),
});

/** POST /customer/cart/merge — login sonrasi anonim cookie sepetini DB sepetine merge. */
export const customerCartMergeRequestSchema = z.object({
  items: z.array(publicCartItemInputSchema).max(CART_MAX_LINES),
});

/** Merge sonucu: uygulanan/atlanan sayilar + 100-sinira sigmayan satirlar (sessiz kayip yok). */
export const customerCartMergeResultSchema = z.object({
  merged: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  overflow: z.array(publicCartItemInputSchema),
  limitExceeded: z.boolean(),
});

export const customerCartMergeResponseSchema = z.object({
  data: z.object({
    result: customerCartMergeResultSchema,
    cart: customerCartProjectionSchema,
  }),
});

// ============================================================================
// TODO-168 (ADR-267) — Cart Change Awareness kontratlari.
// ============================================================================

/**
 * ANONIM referans snapshot (bir satir icin add-time deger). Storefront commerce_os_cart_meta
 * cookie'sinden gelir; sunucu SAF motorla guncel projeksiyonla karsilastirir. Cookie OTORITE DEGIL.
 */
export const publicCartLineSnapshotSchema = z.object({
  variantId: z.string().min(1).max(120),
  unitPriceMinor: z.number().int().nonnegative(),
  listPriceMinor: z.number().int().nonnegative().nullable(),
  discountedUnitPriceMinor: z.number().int().nonnegative().nullable(),
  currency: currencySchema,
  inStock: z.boolean(),
  orderable: z.boolean(),
});

/** ANONIM degisiklik baglami: cookie cartId + snapshot listesi + onaylanan fingerprint'ler. */
export const publicCartChangeContextSchema = z.object({
  cartId: z.string().min(1).max(80),
  snapshots: z.array(publicCartLineSnapshotSchema).max(CART_MAX_LINES).default([]),
  acknowledgedFingerprints: z.array(z.string().min(1).max(64)).max(500).default([]),
});

/**
 * ANONIM baseline yaniti: guncel her satirin snapshot-referans degerleri. Storefront bunu meta
 * cookie'ye yazarak eksik/legacy satirlar icin baseline kurar (ilk guvenilir resolve = baseline).
 * (Auth yolda gerek yok — baseline DB'de lazy yazilir.)
 */
export const publicCartResolveResponseSchema = z.object({
  cart: publicCartSchema,
  baselines: z.array(publicCartLineSnapshotSchema),
});

/**
 * POST /customer/cart/changes/:fingerprint/acknowledge — AUTH per-fingerprint ack (cross-device).
 * Body gerekmez (fingerprint path'te). Ack cart line'lari MUTASYONA UGRATMAZ (version bump yok);
 * yalniz CartChangeAck satiri ekler → guncel projeksiyonda o degisiklik acknowledged doner.
 */
export const customerCartAckResponseSchema = z.object({ data: customerCartProjectionSchema });

/** Analytics event tipi (RecommendationEvent deseni; read side-effect-free, yalniz acik ingest). */
export const cartChangeEventTypeSchema = z.enum([
  "detected",
  "viewed",
  "acknowledged",
  "checkout_blocked",
  "item_removed",
]);
export const cartChangeEventPlacementSchema = z.enum(["CART_BAR", "CART_LINE", "CHECKOUT"]);

/** BFF → gateway best-effort ingest govdesi (KVKK: ham cart/musteri gonderilmez; sunucu hash'ler). */
export const cartChangeEventRequestSchema = z.object({
  cartId: z.string().min(1).max(80),
  changeType: cartChangeTypeSchema,
  eventType: cartChangeEventTypeSchema,
  severity: cartChangeSeveritySchema.optional(),
  fingerprint: z.string().min(1).max(64),
  productId: z.string().max(120).optional(),
  variantId: z.string().max(120).optional(),
  oldMinor: z.number().int().optional(),
  newMinor: z.number().int().optional(),
  currency: currencySchema.optional(),
  placement: cartChangeEventPlacementSchema.optional(),
});

export const cartChangeEventResponseSchema = z.object({
  data: z.object({ recorded: z.boolean(), deduped: z.boolean() }),
});

export const publicCheckoutContactSchema = z.object({
  fullName: z.string().min(1).max(220),
  email: z.string().email().max(320),
  phone: z.string().min(1).max(40),
});

export const publicCheckoutAddressSchema = z.object({
  country: z.string().length(2).regex(/^[A-Z]{2}$/),
  city: z.string().min(1).max(120),
  district: z.string().max(120).nullable().optional(),
  addressLine1: z.string().min(1).max(500),
  addressLine2: z.string().max(500).nullable().optional(),
  postalCode: z.string().max(40).nullable().optional(),
});

/**
 * F3B.2 — Fatura bilgileri. Bireysel: ad-soyad + T.C. Kimlik No (zorunlu, dogrulanir).
 * Kurumsal: firma unvani + vergi dairesi + vergi no (zorunlu, dogrulanir).
 * `sameAsShipping=false` ise ayri fatura adresi (`billingAddress`) beklenir.
 * PII (TCKN/VKN) gereksiz log/event metadata'ya yazilmaz; public receipt'te TCKN donmez.
 */
export const publicCheckoutBillingSchema = z
  .object({
    type: z.enum(["INDIVIDUAL", "CORPORATE"]),
    sameAsShipping: z.boolean().default(true),
    name: z.string().max(220).nullable().optional(),
    tckn: z.string().max(20).nullable().optional(),
    companyName: z.string().max(255).nullable().optional(),
    taxOffice: z.string().max(255).nullable().optional(),
    taxNumber: z.string().max(20).nullable().optional(),
    email: z.string().email().max(320).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.type === "INDIVIDUAL") {
      if (!value.name || value.name.trim().length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["name"], message: "Ad soyad zorunlu." });
      }
      if (!value.tckn || !isValidTckn(value.tckn)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["tckn"], message: "Gecerli T.C. Kimlik No zorunlu." });
      }
    } else {
      if (!value.companyName || value.companyName.trim().length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["companyName"], message: "Firma unvani zorunlu." });
      }
      if (!value.taxOffice || value.taxOffice.trim().length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["taxOffice"], message: "Vergi dairesi zorunlu." });
      }
      if (!value.taxNumber || !isValidTaxNumber(value.taxNumber)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["taxNumber"], message: "Gecerli vergi no zorunlu." });
      }
    }
  });

export const publicCheckoutRequestSchema = z
  .object({
    items: z.array(publicCartItemInputSchema).min(1).max(100),
    contact: publicCheckoutContactSchema,
    shippingAddress: publicCheckoutAddressSchema,
    /**
     * F3B.2 — Fatura bilgileri OPSIYONEL. Verilmezse (varsayilan checkout)
     * sunucu fatura bilgisini iletisim/teslimat bilgisinden TURETIR ve T.C.
     * Kimlik No / VKN ISTEMEZ. Yalnizca kullanici "Fatura bilgilerim farkli"
     * derse gonderilir; o zaman asagidaki superRefine ile sikica dogrulanir
     * (Bireysel → gecerli TCKN; Kurumsal → firma/vergi dairesi/gecerli VKN).
     */
    billing: publicCheckoutBillingSchema.nullable().optional(),
    /** sameAsShipping=false ise ayri fatura adresi. */
    billingAddress: publicCheckoutAddressSchema.nullable().optional(),
    /** Opsiyonel kupon kodu; sunucu dogrular ve indirimi siparise yansitir. */
    couponCode: z.string().max(40).nullable().optional(),
    /**
     * TODO-125 — Müşterinin seçtiği kargo seçeneği (= ShippingRatePlan.id). Sunucu
     * seçeneğin bu mağazaya ait + AKTİF + bu sepet/adres için uygun olduğunu doğrular;
     * ÜCRETİ İSTEMCİDEN DEĞİL seçilen plandan yeniden hesaplar (tamper-proof, ADR-047).
     */
    shippingOptionId: z.string().max(120).nullable().optional(),
    /**
     * BUG-CART-002 — Checkbox ile secim-disi birakilan varyantlar. Auth checkout'ta DB cart
     * OTORITEDIR (istemci `items` yoksayilir) ama secim TRANSIENT bir gorunum durumu oldugundan
     * ayrica tasinir: sunucu DB cart satirlarindan bu varyantlari checkout'a KATMAZ (guest yoluyla
     * ayni deselection semantigi). Boylece kullanici secim-disi (or. OUT_OF_STOCK) satiri
     * kaldirmadan checkout'a devam edebilir. Fiyat/stok yine sunucu-otoriter dogrulanir.
     */
    deselectedVariantIds: z.array(z.string().min(1)).max(100).optional(),
    /**
     * TODO-168 (ADR-267) — ANONIM checkout degisiklik baglami (cookie meta). Auth checkout'ta
     * YOKSAYILIR (snapshot/ack DB'den). WARN degisiklik ack edilmemisse checkout 409 CART_CHANGED.
     */
    changeContext: z.lazy(() => publicCartChangeContextSchema).optional(),
    /**
     * TODO-160 (ADR-102) — Influencer attribution GRANT (opak, GATEWAY-imzalı).
     * Storefront first-party cookie'sinden aynen taşınır; gateway KENDİ imzasını
     * doğrular. İçindeki influencer/campaign alanlarına DÜZ güvenilmez — yalnız
     * imza + pencere + aktiflik geçerse OrderAttribution snapshot'ı yazılır.
     * Geçersiz/eksik → attribution yazılmaz (checkout etkilenmez).
     */
    attributionGrant: z.string().max(2048).nullable().optional(),
    /**
     * TODO-161 (ADR-118) — Sponsorlu ürün attribution GRANT'leri (opak, GATEWAY-imzalı; ürün
     * başına bir token). Storefront first-party cookie'sinden aynen taşınır; gateway KENDİ
     * imzasını doğrular. İçindeki campaign/product alanlarına DÜZ güvenilmez — yalnız imza +
     * pencere + kampanya aktifliği geçerse VE ürün siparişte gerçekten varsa OrderSponsoredAttribution
     * yazılır. Influencer attributionGrant'inden BAĞIMSIZ (ADR-120 coexistence). Geçersiz → atlanır.
     */
    sponsoredGrants: z.array(z.string().max(2048)).max(48).nullable().optional(),
    /**
     * TODO-174B (ADR-282) — "Alışveriş bakiyemi kullan" toggle. true → sunucu min(availableCredit,
     * payableOrderAmount) kadarını otomatik uygular (kısmi tutar girişi YOK). Yalnız oturum açmış
     * müşteride etkilidir (anonim checkout'ta yoksayılır). Tutar İSTEMCİDEN GELMEZ (server-authoritative).
     */
    useShoppingCredit: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.billing && value.billing.sameAsShipping === false && !value.billingAddress) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["billingAddress"],
        message: "Fatura adresi zorunlu.",
      });
    }
  });

/**
 * Basarili checkout sonrasi guvenli siparis onayi (ALLOWLIST). Ic alanlar
 * (storeId, customerId, reservation/event detaylari, adres PII tam dokumu)
 * disarida birakilir; yalnizca onay icin gereken ozet doner.
 */
export const publicOrderConfirmationLineSchema = z.object({
  title: z.string().min(1),
  variantTitle: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPriceMinor: z.number().int().nonnegative(),
  lineTotalMinor: z.number().int().nonnegative(),
  currency: currencySchema,
  // ADR-065 (Faz 3/Dilim 6a) — Kapak URL'i (ALLOWLIST; storageKey sizmaz). Bu line
  // semasi PAYLASILIR: checkout confirmation DOLDURUR; receipt/payment-state (Dilim 6b
  // kapsami) su an DOLDURMAZ. Bu nedenle `.optional()` — alan absent olabilir; boylece
  // receipt/payment-state serialize noktalarina DOKUNMADAN geriye-uyumlu kalir.
  imageUrl: z.string().nullable().optional(),
});

/**
 * F3B.2 — Public (token-korumalı) GUVENLI fatura ozeti. PII allowlist: bireysel
 * faturada T.C. Kimlik No CLIENT'A DONMEZ (yalniz ad + tip). Kurumsal alanlar
 * (firma/vergi dairesi/vergi no) is kimligi oldugundan donebilir.
 */
export const publicBillingSummarySchema = z.object({
  type: z.enum(["INDIVIDUAL", "CORPORATE"]),
  name: z.string().nullable(),
  companyName: z.string().nullable(),
  taxOffice: z.string().nullable(),
  taxNumber: z.string().nullable(),
  email: z.string().nullable(),
  sameAsShipping: z.boolean(),
});

/** F3B.2 — Public GUVENLI adres ozeti (teslimat/fatura gosterimi icin). */
export const publicAddressSummarySchema = z.object({
  fullName: z.string(),
  phone: z.string().nullable(),
  country: z.string(),
  city: z.string(),
  district: z.string().nullable(),
  addressLine1: z.string(),
  addressLine2: z.string().nullable(),
  postalCode: z.string().nullable(),
});

/**
 * F3B.2 — Public GUVENLI ödeme bilgisi. Full PAN/CVC ASLA donmez; yalniz
 * marka + son 4 + taksit + saglayici islem referansi (transaction id) + durum.
 */
const publicAttemptStatusEnum = z.enum([
  "CREATED",
  "PENDING",
  "REQUIRES_ACTION",
  "AUTHORIZED",
  "PAID",
  "FAILED",
  "CANCELLED",
  "REFUNDED",
]);
const publicPaymentMethodEnum = z.enum([
  "CARD",
  "BANK_TRANSFER",
  "CASH_ON_DELIVERY",
  "PAYMENT_LINK",
]);

export const publicPaymentInfoSchema = z.object({
  attemptId: z.string().min(1),
  provider: z.enum(["MOCK", "IYZICO", "STRIPE", "PAYTR", "GENERIC_REDIRECT"]),
  mode: z.enum(["TEST", "LIVE"]),
  method: publicPaymentMethodEnum,
  status: publicAttemptStatusEnum,
  /** 3D Secure dogrulamasi uygulandi mi (safe gozlem alani; secret degil). */
  threeDsApplied: z.boolean(),
  cardBrand: z.string().nullable(),
  cardLast4: z.string().nullable(),
  installmentCount: z.number().int().positive(),
  providerReference: z.string().nullable(),
  paidAt: z.string().datetime().nullable(),
});

/** F3B.2 — Public test ödeme senaryolari (MOCK provider). */
export const publicPaymentScenarioSchema = z.enum([
  "success",
  "failure",
  "three_ds_required",
  "insufficient_funds",
  "cancelled",
]);

/**
 * F3B.2 — Checkout sonrasi ödeme yönlendirme objesi. Yalnizca uygun bir TEST/MOCK
 * provider config varsa eklenir; provider yoksa bu alan HİÇ serialize edilmez
 * (mevcut checkout response shape'i birebir korunur). `token` kisa omurludur ve
 * yalnizca bu yanitta doner.
 */
export const publicPaymentRedirectSchema = z.object({
  required: z.literal(true),
  attemptId: z.string().min(1),
  token: z.string().min(1),
  paymentPath: z.string().min(1),
  scenarios: z.array(publicPaymentScenarioSchema),
});

// Kargo sağlayıcı tipi (taşıyıcı). Order/checkout şemalarından önce tanımlı olmalı
// (TDZ); sağlayıcı config şemaları da bunu kullanır.
export const shippingProviderTypeSchema = z.enum(["MOCK", "GELIVER", "DHL_ECOMMERCE"]);

/**
 * TODO-125 (ADR-047) — Siparişe yazılan SEÇİLEN kargo sağlayıcı/seçenek özeti
 * (snapshot). PUBLIC/müşteri-güvenli ALLOWLIST: provider secret/credential/iç alan
 * TAŞIMAZ; yalnız görünen ad + hizmet adı + ücret + (opsiyonel) public logo + ETA.
 * Sipariş onayı, müşteri sipariş detayı ve store-admin sipariş detayında kullanılır.
 */
export const orderShippingSelectionSchema = z.object({
  providerType: shippingProviderTypeSchema.nullable(),
  providerName: z.string().nullable(),
  serviceName: z.string().nullable(),
  amountMinor: z.number().int().nonnegative(),
  currency: currencySchema,
  freeShipping: z.boolean(),
  estimatedDelivery: z.string().nullable(),
  logoUrl: z.string().nullable(),
  logoAlt: z.string().nullable(),
});
export type OrderShippingSelection = z.infer<typeof orderShippingSelectionSchema>;

export const publicOrderConfirmationSchema = z.object({
  orderNumber: z.string().min(1),
  status: orderStatusSchema,
  paymentStatus: paymentStatusSchema,
  currency: currencySchema,
  /** Urunler ara toplami (kargo/indirim oncesi). */
  subtotalMinor: z.number().int().nonnegative(),
  shippingMinor: z.number().int().nonnegative(),
  discountMinor: z.number().int().nonnegative(),
  /** Grand total icindeki KDV gostergesi (dahil; toplam uzerine eklenmez). */
  taxIncludedMinor: z.number().int().nonnegative(),
  /** Genel toplam = subtotal - discount + shipping. */
  totalMinor: z.number().int().nonnegative(),
  couponCode: z.string().max(40).nullable(),
  couponStatus: publicCouponStatusSchema,
  contactEmail: z.string().email(),
  lines: z.array(publicOrderConfirmationLineSchema),
  createdAt: z.string().datetime(),
  /** F3B.2 — Teslimat/fatura ozeti (success ekraninda gosterim). Opsiyonel (geri uyum). */
  shippingAddress: publicAddressSummarySchema.optional(),
  billing: publicBillingSummarySchema.nullable().optional(),
  /** TODO-125 — Seçilen kargo sağlayıcı/seçenek özeti (varsa). Geri uyum için opsiyonel. */
  shippingOption: orderShippingSelectionSchema.nullable().optional(),
  /**
   * Opsiyonel ödeme yönlendirme. Provider yoksa alan eklenmez (undefined) →
   * mevcut response birebir kalir. Uygun TEST/MOCK provider varsa doldurulur.
   */
  payment: publicPaymentRedirectSchema.optional(),
});

/**
 * F3B.2 — Public GUVENLI siparis fisi (success ekrani + ödeme sayfasi ozeti).
 * Tek allowlist'li sema; ödeme sayfasinda payment=null (henuz odenmedi), basarili
 * odeme sonrasinda payment dolu doner. Full PAN/CVC ASLA; bireysel TCKN donmez.
 */
export const publicOrderReceiptSchema = z.object({
  orderNumber: z.string().min(1),
  status: orderStatusSchema,
  paymentStatus: paymentStatusSchema,
  currency: currencySchema,
  subtotalMinor: z.number().int().nonnegative(),
  shippingMinor: z.number().int().nonnegative(),
  discountMinor: z.number().int().nonnegative(),
  taxIncludedMinor: z.number().int().nonnegative(),
  totalMinor: z.number().int().nonnegative(),
  couponCode: z.string().max(40).nullable(),
  contactEmail: z.string().email(),
  lines: z.array(publicOrderConfirmationLineSchema),
  shippingAddress: publicAddressSummarySchema.nullable(),
  billing: publicBillingSummarySchema.nullable(),
  payment: publicPaymentInfoSchema.nullable(),
  createdAt: z.string().datetime(),
});

/** F3B.2 — Public ödeme test sayfasi durumu (secret/credential ASLA donmez). */
export const publicPaymentStateSchema = z.object({
  orderNumber: z.string().min(1),
  paymentStatus: paymentStatusSchema,
  currency: currencySchema,
  totalMinor: z.number().int().nonnegative(),
  subtotalMinor: z.number().int().nonnegative(),
  shippingMinor: z.number().int().nonnegative(),
  discountMinor: z.number().int().nonnegative(),
  taxIncludedMinor: z.number().int().nonnegative(),
  contactEmail: z.string().email(),
  provider: z.enum(["MOCK", "IYZICO", "STRIPE", "PAYTR", "GENERIC_REDIRECT"]),
  mode: z.enum(["TEST", "LIVE"]),
  method: publicPaymentMethodEnum,
  threeDsMode: z.enum(["DISABLED", "OPTIONAL", "REQUIRED"]),
  installmentEnabled: z.boolean(),
  /** Provider config + tutara gore izin verilen taksit secenekleri (1 = tek cekim). */
  installmentOptions: z.array(z.number().int().positive()),
  attempt: z.object({
    id: z.string().min(1),
    status: publicAttemptStatusEnum,
    threeDsApplied: z.boolean(),
  }),
  scenarios: z.array(publicPaymentScenarioSchema),
  lines: z.array(publicOrderConfirmationLineSchema),
  shippingAddress: publicAddressSummarySchema.nullable(),
  billing: publicBillingSummarySchema.nullable(),
});

/**
 * F3B.2 — Test kart bilgileri. SUNUCU dogrular; full PAN/CVC saklanmaz/serialize
 * edilmez/loglanmaz. Senaryo (success/failure/3DS...) kart numarasindan turetilir.
 */
export const publicPaymentCardSchema = z.object({
  holder: z.string().min(1).max(120),
  number: z.string().min(12).max(32),
  expMonth: z.number().int().min(1).max(12),
  expYear: z.number().int().min(2000).max(2100),
  cvc: z.string().min(3).max(4).regex(/^[0-9]+$/),
});

/**
 * F3B.2 — 3D Secure simulasyon adimi aksiyonu. Ilk submit REQUIRES_ACTION urettikten
 * sonra, kullanicinin banka dogrulama ekranindaki secimi: dogrulamayi tamamla
 * (success) veya basarisiz yap (fail). Yalnizca MOCK 3DS akisinda anlamlidir.
 */
export const publicPaymentThreeDsActionSchema = z.enum(["success", "fail"]);

export const publicPaymentSubmitRequestSchema = z
  .object({
    token: z.string().min(1),
    /** Yeni akis: gercekci test kart formu. Senaryo karttan turetilir. */
    card: publicPaymentCardSchema.optional(),
    /** Eski akis (geri uyum): dogrudan senaryo secimi. */
    scenario: publicPaymentScenarioSchema.optional(),
    installmentCount: z.number().int().min(1).max(12).default(1),
    /** 3DS dogrulama adimindaki kullanici secimi (REQUIRES_ACTION sonrasi). */
    threeDsAction: publicPaymentThreeDsActionSchema.optional(),
  })
  .refine((value) => Boolean(value.card) || Boolean(value.scenario), {
    message: "card or scenario is required.",
    path: ["card"],
  });

export const publicPaymentResultSchema = z.object({
  orderNumber: z.string().min(1),
  paymentStatus: paymentStatusSchema,
  attempt: z.object({
    id: z.string().min(1),
    status: publicAttemptStatusEnum,
    threeDsApplied: z.boolean(),
    failureCode: z.string().nullable(),
    failureMessage: z.string().nullable(),
    cardBrand: z.string().nullable(),
    cardLast4: z.string().nullable(),
    installmentCount: z.number().int().positive(),
    providerReference: z.string().nullable(),
  }),
  /** 3D Secure senaryosunda ikinci adim gerekiyorsa true. */
  requiresAction: z.boolean(),
  /** Basarili odeme sonrasi zengin success fisi; aksi halde null. */
  receipt: publicOrderReceiptSchema.nullable(),
});

/**
 * F3B.2 — Public ödeme uygunlugu (checkout ÖNCESI bilgilendirme icin). Yalnizca
 * "checkout sonrasi test ödeme adimina gecilecek mi?" sorusunu yanitlar; secret
 * /credential ASLA donmez. `testPaymentEnabled`, checkout sonrasi redirect'i
 * URETEN resolver ile ayni kosulu yansitir (uygun TEST/MOCK provider varligi).
 */
export const publicPaymentAvailabilitySchema = z.object({
  testPaymentEnabled: z.boolean(),
});

export const productVariantCreateRequestSchema = z
  .object({
    title: z.string().min(1).max(220),
    // TODO-160A (ADR-111) — SKU artik OPSIYONEL: bos/verilmemisse sunucu deterministik uretir
    // (skuSource=AUTO). Verilirse manuel override (skuSource=MANUAL, server-side dogrulanir + dupe 409).
    sku: skuSchema.optional(),
    barcode: z.string().max(80).nullable().optional(),
    // F4C — priceMinor (KDV DAHIL brut) YA DA netPriceMinor (KDV HARIC) verilir;
    // en az biri zorunlu (refine asagida). netPriceMinor verildiyse brut SUNUCUDA
    // vatRateBps ile hesaplanir; yalniz priceMinor verildiyse (legacy istemci)
    // net/KDV bruttan ayristirilir. Istemcinin gonderecegi vatAmountMinor KABUL
    // EDILMEZ (semada yok — sunucu hesabi tek otorite).
    priceMinor: z.number().int().nonnegative().optional(),
    netPriceMinor: z.number().int().nonnegative().optional(),
    vatRateBps: z.number().int().min(0).max(10000).optional(),
    compareAtMinor: z.number().int().nonnegative().nullable().optional(),
    // F4B — Maliyet (minor). Kural: maliyet <= liste tavani (compareAtMinor ?? brut).
    costMinor: z.number().int().nonnegative().nullable().optional(),
    currency: currencySchema.default("TRY"),
    status: productVariantStatusSchema.default("ACTIVE"),
    optionValues: jsonRecordSchema.nullable().optional(),
    // TODO-152A — lowStockThreshold KALDIRILDI: stok eşiği artık tek authority olan
    // InventoryBalance.reorderPoint'tir (Product Detail > Stok / global izleme merkezi).
    // F3C.2 — Kargo olcumu (varyant override). >0 olmali; bos = null.
    shippingWeightKg: z.number().positive().nullable().optional(),
    shippingDesi: z.number().positive().nullable().optional(),
    // Faz 2A (ADR-068) — OPSIYONEL variantDefining attribute degerleri (TAM istenen kume).
    // undefined = eski davranis; attributeValueService yalniz variantDefining kabul eder.
    attributeValues: z.array(variantAttributeValueInputSchema).optional(),
  })
  // F4C — Fiyat girisi zorunlu: brut (legacy) veya net (yeni admin UI).
  .refine((value) => value.priceMinor !== undefined || value.netPriceMinor !== undefined, {
    message: "Either priceMinor or netPriceMinor is required.",
    path: ["netPriceMinor"],
  })
  // F4B — Satis (brut) > liste (compareAtMinor) ARTIK hata degil: sadece
  // storefront'ta indirim rozeti turemez. Onceki compareAt>=price hard refine
  // bilincli kaldirildi (karar: yalnizca UI uyarisi).
  // F4C NOT: kesin maliyet<=liste tavani dogrulamasi SUNUCUDA (hesaplanan brut
  // uzerinden) yapilir; burada yalniz brut dogrudan verildiyse erken kontrol.
  .refine(
    (value) =>
      value.costMinor == null ||
      (value.compareAtMinor == null && value.priceMinor === undefined) ||
      value.costMinor <= (value.compareAtMinor ?? value.priceMinor ?? Number.POSITIVE_INFINITY),
    {
      message: "costMinor must be less than or equal to the list price (compareAtMinor ?? priceMinor).",
      path: ["costMinor"],
    },
  );

export const productVariantUpdateRequestSchema = z
  .object({
    title: z.string().min(1).max(220).optional(),
    sku: skuSchema.optional(),
    barcode: z.string().max(80).nullable().optional(),
    priceMinor: z.number().int().nonnegative().optional(),
    // F4C — Yeni admin UI KDV HARIC net fiyat + oran gonderir; brut/KDV tutari
    // SUNUCUDA hesaplanir (istemcinin vatAmountMinor'i kabul edilmez). Yalniz
    // vatRateBps degisirse net SABIT kalir, brut yeniden hesaplanir.
    netPriceMinor: z.number().int().nonnegative().optional(),
    vatRateBps: z.number().int().min(0).max(10000).optional(),
    compareAtMinor: z.number().int().nonnegative().nullable().optional(),
    // F4B — Maliyet (minor). null = temizle. Kesin liste-tavani dogrulamasi
    // gateway'de (mevcut kayitla birlestirilmis durum uzerinden) yapilir.
    costMinor: z.number().int().nonnegative().nullable().optional(),
    currency: currencySchema.optional(),
    status: productVariantStatusSchema.optional(),
    optionValues: jsonRecordSchema.nullable().optional(),
    // TODO-152A — lowStockThreshold KALDIRILDI (bkz. create şeması notu); authority reorderPoint.
    // F3C.2 — Kargo olcumu (varyant override). >0 olmali; null = temizle.
    shippingWeightKg: z.number().positive().nullable().optional(),
    shippingDesi: z.number().positive().nullable().optional(),
    // Faz 2A (ADR-068) — OPSIYONEL variantDefining attribute degerleri (TAM istenen kume).
    // undefined = dokunma; [] = temizle. attributeValueService dogrular.
    attributeValues: z.array(variantAttributeValueInputSchema).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  })
  // F4B — compareAt>=price hard refine kaldirildi (satis>liste yalnizca UI uyarisi).
  // Ayni patch'te hem maliyet hem tavan varsa erken kontrol; degilse gateway kesinler.
  .refine(
    (value) =>
      value.costMinor == null ||
      (value.compareAtMinor == null && value.priceMinor === undefined) ||
      value.costMinor <= (value.compareAtMinor ?? value.priceMinor ?? Number.POSITIVE_INFINITY),
    {
      message: "costMinor must be less than or equal to the list price (compareAtMinor ?? priceMinor).",
      path: ["costMinor"],
    },
  );

export const inventoryItemSchema = z.object({
  id: z.string().min(1),
  storeId: z.string().min(1),
  variantId: z.string().min(1),
  productId: z.string().min(1),
  sku: skuSchema,
  title: z.string().min(1),
  quantityOnHand: z.number().int(),
  quantityReserved: z.number().int().nonnegative(),
  quantityAvailable: z.number().int(),
  lowStockThreshold: z.number().int().nonnegative().nullable(),
  updatedAt: z.string().datetime(),
});

export const inventoryListResponseSchema = z.object({
  data: z.array(inventoryItemSchema),
  pagination: z.object({
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
});

export const inventoryAdjustRequestSchema = z.object({
  quantityDelta: z.number().int().refine((value) => value !== 0, {
    message: "quantityDelta must not be zero.",
  }),
  reason: z.string().max(500).optional(),
  referenceType: z.string().max(80).optional(),
  referenceId: z.string().max(120).optional(),
});

export const inventoryAdjustmentResponseSchema = z.object({
  item: inventoryItemSchema,
  movement: z.object({
    id: z.string().min(1),
    storeId: z.string().min(1),
    variantId: z.string().min(1),
    type: inventoryMovementTypeSchema,
    quantityDelta: z.number().int(),
    reason: z.string().nullable(),
    referenceType: z.string().nullable(),
    referenceId: z.string().nullable(),
    actorUserId: z.string().nullable(),
    createdAt: z.string().datetime(),
  }),
});

export const customerSchema = z.object({
  id: z.string().min(1),
  storeId: z.string().min(1),
  email: z.string().email(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  phone: z.string().nullable(),
  status: customerStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const addressInputSchema = z.object({
  type: addressTypeSchema,
  fullName: z.string().min(1).max(220),
  phone: z.string().max(80).nullable().optional(),
  countryCode: z.string().length(2).regex(/^[A-Z]{2}$/),
  city: z.string().min(1).max(120),
  district: z.string().max(120).nullable().optional(),
  addressLine1: z.string().min(1).max(500),
  addressLine2: z.string().max(500).nullable().optional(),
  postalCode: z.string().max(40).nullable().optional(),
});

export const orderAddressSchema = addressInputSchema.extend({
  id: z.string().min(1),
  storeId: z.string().min(1),
  orderId: z.string().min(1),
  phone: z.string().nullable(),
  district: z.string().nullable(),
  addressLine2: z.string().nullable(),
  postalCode: z.string().nullable(),
});

export const orderLineInputSchema = z.object({
  variantId: z.string().min(1),
  quantity: z.number().int().positive().max(10000),
});

export const orderLineUpdateRequestSchema = z.object({
  quantity: z.number().int().positive().max(10000),
});

export const orderLineSchema = z.object({
  id: z.string().min(1),
  storeId: z.string().min(1),
  orderId: z.string().min(1),
  productId: z.string().min(1),
  variantId: z.string().min(1),
  sku: skuSchema,
  title: z.string().min(1),
  variantTitle: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPriceAmount: z.number().int().nonnegative(),
  totalAmount: z.number().int().nonnegative(),
  currency: currencySchema,
  // F4C (ADR-063/ADR-064) — Siparis ani KDV/maliyet/liste SNAPSHOT'lari.
  // ESKI siparislerde null (legacy; guncel urun verisinden YENIDEN HESAPLANMAZ).
  // unitPriceAmount/totalAmount KDV DAHIL brut olarak kalir (geri uyum).
  unitNetPriceMinor: z.number().int().nonnegative().nullable().default(null),
  unitVatRateBps: z.number().int().min(0).max(10000).nullable().default(null),
  unitVatAmountMinor: z.number().int().nonnegative().nullable().default(null),
  unitGrossPriceMinor: z.number().int().nonnegative().nullable().default(null),
  unitListPriceMinor: z.number().int().nonnegative().nullable().default(null),
  unitCostMinor: z.number().int().nonnegative().nullable().default(null),
  lineNetAmountMinor: z.number().int().nonnegative().nullable().default(null),
  lineVatAmountMinor: z.number().int().nonnegative().nullable().default(null),
  lineGrossAmountMinor: z.number().int().nonnegative().nullable().default(null),
  lineCostMinor: z.number().int().nonnegative().nullable().default(null),
  createdAt: z.string().datetime(),
});

export const inventoryReservationSchema = z.object({
  id: z.string().min(1),
  storeId: z.string().min(1),
  orderId: z.string().min(1),
  orderLineId: z.string().min(1),
  variantId: z.string().min(1),
  quantity: z.number().int().positive(),
  status: inventoryReservationStatusSchema,
  expiresAt: z.string().datetime().nullable(),
  releasedAt: z.string().datetime().nullable(),
  consumedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const orderEventSchema = z.object({
  id: z.string().min(1),
  storeId: z.string().min(1),
  orderId: z.string().min(1),
  type: z.string().min(1),
  message: z.string().nullable(),
  metadata: jsonRecordSchema.nullable(),
  actorUserId: z.string().nullable(),
  createdAt: z.string().datetime(),
});

/**
 * F3B.2 — Admin (authenticated) sipariş ödeme denemesi (gözlemlenebilirlik).
 * Full PAN/CVC ASLA; yalniz turetilmis guvenli alanlar (marka/son4/taksit) +
 * saglayici islem referansi + durum + zaman damgalari. Enum'lar inline (sira bagimsiz).
 */
// TODO-159F (ADR-098) — Manuel (offline) tahsilat yöntemi allowlist'i.
export const paymentManualMethodSchema = z.enum(["BANK_TRANSFER", "CASH", "POS", "OTHER"]);
export type PaymentManualMethod = z.infer<typeof paymentManualMethodSchema>;

export const paymentAttemptTypeSchema = z.enum(["ONLINE", "MANUAL"]);
export type PaymentAttemptType = z.infer<typeof paymentAttemptTypeSchema>;

export const orderPaymentAttemptSchema = z.object({
  id: z.string().min(1),
  // TODO-159F (ADR-098) — MANUAL attempt'te provider/mode yoktur → nullable.
  type: paymentAttemptTypeSchema.default("ONLINE"),
  provider: z.enum(["MOCK", "IYZICO", "STRIPE", "PAYTR", "GENERIC_REDIRECT"]).nullable(),
  mode: z.enum(["TEST", "LIVE"]).nullable(),
  // TODO-174B (ADR-282) — STORE_CREDIT: alışveriş bakiyesiyle ödenen MANUAL attempt sipariş ödeme
  // listesinde görünür (external ödemeden ayrı; admin ödeme özetinde ayrı satır).
  method: z.enum(["CARD", "BANK_TRANSFER", "CASH_ON_DELIVERY", "PAYMENT_LINK", "STORE_CREDIT"]),
  amount: z.number().int().nonnegative(),
  currency: currencySchema,
  status: z.enum([
    "CREATED",
    "PENDING",
    "REQUIRES_ACTION",
    "AUTHORIZED",
    "PAID",
    "FAILED",
    "CANCELLED",
    "REFUNDED",
  ]),
  threeDsApplied: z.boolean(),
  scenario: z.string().nullable(),
  installmentCount: z.number().int().positive(),
  cardBrand: z.string().nullable(),
  cardLast4: z.string().nullable(),
  providerReference: z.string().nullable(),
  failureCode: z.string().nullable(),
  failureMessage: z.string().nullable(),
  paidAt: z.string().datetime().nullable(),
  failedAt: z.string().datetime().nullable(),
  // TODO-159F — recovery alanları (ALLOWLIST: plain token/secret ASLA dönmez).
  expiresAt: z.string().datetime().nullable().default(null),
  hasActiveLink: z.boolean().default(false),
  manualMethod: paymentManualMethodSchema.nullable().default(null),
  manualReference: z.string().nullable().default(null),
  manualNote: z.string().nullable().default(null),
  collectedAt: z.string().datetime().nullable().default(null),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

/** F3B.2 — Sipariş fatura bilgisi (admin; allowlist). PII gereksiz yere loglanmaz. */
export const orderBillingSchema = z.object({
  type: z.enum(["INDIVIDUAL", "CORPORATE"]).nullable(),
  name: z.string().nullable(),
  taxId: z.string().nullable(),
  companyName: z.string().nullable(),
  taxOffice: z.string().nullable(),
  taxNumber: z.string().nullable(),
  email: z.string().nullable(),
});

/**
 * F4A.2 — Siparis indirim SNAPSHOT satiri (store-admin siparis detayi).
 * KAYNAK DOGRUSU OrderDiscount kaydidir: kampanya sonradan degisse/silinse
 * bile siparis detayi tarihsel dogrulugunu korur (guncel kampanya kurallari
 * YENIDEN HESAPLANMAZ). ALLOWLIST: ham scopeSummary/metadata JSON'u ve kupon
 * ic kimligi tasinmaz; campaignId yalniz admin yuzeyinde kampanya detayina
 * baglanti icindir (public yuzeylere TASINMAZ).
 */
export const orderDiscountLineSchema = z.object({
  id: z.string().min(1),
  campaignId: z.string().min(1).nullable(),
  code: z.string().nullable(),
  label: z.string().min(1),
  discountType: z.enum(["PERCENT", "FIXED_AMOUNT"]),
  discountValue: z.number().int().positive(),
  discountAmountMinor: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});

/**
 * F4C (ADR-064) — Admin siparis "satis ozeti" projeksiyonu. KAYNAK DOGRUSU
 * SNAPSHOT'lardir: satirlarin F4C KDV/maliyet snapshot alanlari + OrderDiscount
 * + kargo snapshot + PaymentAttempt kayitlari. Guncel urun/kampanya verisinden
 * ASLA yeniden hesaplanmaz; turetme deterministiktir (gateway'de tek yer).
 *
 * `sales` yalniz TUM satirlarda KDV snapshot'i varsa doludur; eski (F4C oncesi)
 * siparislerde null'dur — UI "eski formatta olusturuldu" gosterir, yaniltici
 * sifir GOSTERILMEZ. Kar alanlari maliyet snapshot'i eksikse null kalir.
 */
export const orderSalesSummaryVatLineSchema = z.object({
  rateBps: z.number().int().min(0).max(10000),
  amountMinor: z.number().int().nonnegative(),
});

export const orderSalesSummarySchema = z.object({
  currency: currencySchema,
  // Bolum A — Odeme/tutar ozeti (mevcut siparis alanlarindan; her sipariste dolu).
  subtotalGrossMinor: z.number().int().nonnegative(),
  discountGrossMinor: z.number().int().nonnegative(),
  /** Indirim etiketi ("%10 Sepet İndirimi"); birden coksa " + " ile birlesir; yoksa null. */
  discountLabel: z.string().nullable(),
  shippingGrossMinor: z.number().int().nonnegative(),
  payableGrossMinor: z.number().int().nonnegative(),
  paidGrossMinor: z.number().int().nonnegative(),
  remainingGrossMinor: z.number().int().nonnegative(),
  // Bolum B — Satis/vergi/kar ozeti (yalniz F4C snapshot'li siparislerde).
  sales: z
    .object({
      /** Liste fiyati toplami: sum(unitList*qty); indirim ONCESI brut taban. */
      listGrossMinor: z.number().int().nonnegative(),
      /** Indirim oncesi KDV haric net toplam: sum(lineNet). */
      subtotalNetMinor: z.number().int().nonnegative(),
      /** Indirim oncesi toplam KDV: sum(lineVat). */
      totalVatMinor: z.number().int().nonnegative(),
      /** Tek oran ise 1 satir ("KDV (%20)"); karma oranlarda oran-bazli dagilim. */
      vatBreakdown: z.array(orderSalesSummaryVatLineSchema),
      /** Maliyet snapshot toplami; HERHANGI bir satirda maliyet yoksa null. */
      totalCostMinor: z.number().int().nonnegative().nullable(),
      /** Brut kar = subtotalNet - totalCost; maliyet eksikse null. Negatif olabilir. */
      grossProfitMinor: z.number().int().nullable(),
      /** Kampanya/kupon indirimi (brut; OrderDiscount toplami = discountGross). */
      campaignDiscountMinor: z.number().int().nonnegative(),
      /** Net kar = brut kar - kampanya indirimi (MVP kurali; ADR-064). Negatif olabilir. */
      netProfitMinor: z.number().int().nullable(),
    })
    .nullable(),
});

/* TODO-174 (ADR-275/278) — İptal taksonomisi enum'ları. orderSchema + finance iptal raporu + customer
 * cancellation blokları ORTAK kullanır; forward-ref olmaması için burada (erken) tanımlı (Prisma sırası). */
export const orderCancellationSourceSchema = z.enum(["CUSTOMER", "ADMIN", "SYSTEM"]);
export type OrderCancellationSourceValue = z.infer<typeof orderCancellationSourceSchema>;

export const orderCancellationReasonCategorySchema = z.enum([
  "ORDER_MISTAKE",
  "PRICE_PROMOTION",
  "DELIVERY",
  "PAYMENT",
  "PRODUCT_DECISION",
  "OTHER",
]);
export type OrderCancellationReasonCategoryValue = z.infer<typeof orderCancellationReasonCategorySchema>;

export const orderCancellationReasonSchema = z.enum([
  "WRONG_PRODUCT",
  "WRONG_VARIANT_SIZE_COLOR",
  "WRONG_QUANTITY",
  "DUPLICATE_ORDER",
  "ACCIDENTAL_ORDER",
  "FOUND_CHEAPER_ELSEWHERE",
  "COUPON_DISCOUNT_NOT_AS_EXPECTED",
  "TOTAL_PRICE_TOO_HIGH",
  "DELIVERY_ESTIMATE_TOO_LONG",
  "SHIPPING_FEE_TOO_HIGH",
  "WILL_NOT_ARRIVE_IN_TIME",
  "WRONG_PAYMENT_METHOD",
  "INSTALLMENT_OR_PAYMENT_OPTION_UNSUITABLE",
  "PAYMENT_CONCERN",
  "NO_LONGER_NEEDED",
  "CHANGED_MIND",
  "PREFER_DIFFERENT_PRODUCT",
  "OTHER",
]);
export type OrderCancellationReasonValue = z.infer<typeof orderCancellationReasonSchema>;

/**
 * TD-174B-1 — Store-admin sipariş detayı ÖDEME DAĞILIMI (allocation). BUG-CART-005
 * `buildPaymentAllocations` projeksiyonu ile birebir aynı gövde (müşteri-facing
 * `customerOrderPaymentAllocationSchema` ile hizalı; o şema bu satırın ALTINDA
 * tanımlı olduğundan TDZ nedeniyle burada tekrar edilir). Kaynak = settled
 * (PAID/AUTHORIZED) PaymentAttempt; toplam = sipariş captured toplamı (invariant).
 * Ham PAN/provider payload TAŞINMAZ; STORE_CREDIT = "Mağaza bakiyesi" satırı.
 */
export const orderPaymentAllocationSchema = z.object({
  sourceType: z.enum(["CARD", "BANK_TRANSFER", "CASH_ON_DELIVERY", "PAYMENT_LINK", "STORE_CREDIT"]),
  amountMinor: z.number().int().nonnegative(),
  currency: currencySchema,
  cardBrand: z.string().nullable(),
  cardLast4: z.string().nullable(),
  provider: z.enum(["MOCK", "IYZICO", "STRIPE", "PAYTR", "GENERIC_REDIRECT"]).nullable(),
  installmentCount: z.number().int().positive(),
  paidAt: z.string().datetime().nullable(),
});
export type OrderPaymentAllocation = z.infer<typeof orderPaymentAllocationSchema>;

export const orderSchema = z.object({
  id: z.string().min(1),
  storeId: z.string().min(1),
  orderNumber: z.string().min(1),
  customerId: z.string().min(1).nullable(),
  customerEmail: z.string().email(),
  currency: currencySchema,
  status: orderStatusSchema,
  paymentStatus: paymentStatusSchema,
  fulfillmentStatus: fulfillmentStatusSchema,
  subtotalAmount: z.number().int().nonnegative(),
  discountAmount: z.number().int().nonnegative(),
  shippingAmount: z.number().int().nonnegative(),
  taxAmount: z.number().int().nonnegative(),
  totalAmount: z.number().int().nonnegative(),
  placedAt: z.string().datetime().nullable(),
  cancelledAt: z.string().datetime().nullable(),
  cancelReason: z.string().nullable(),
  // TODO-174 (ADR-275/278) — iptal provenance (store-admin görünürlüğü). Legacy/admin iptalde null.
  cancelSource: orderCancellationSourceSchema.nullable().default(null),
  cancelReasonCode: orderCancellationReasonSchema.nullable().default(null),
  cancelReasonCategory: orderCancellationReasonCategorySchema.nullable().default(null),
  cancelReasonNote: z.string().nullable().default(null),
  billing: orderBillingSchema.nullable().default(null),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lines: z.array(orderLineSchema).default([]),
  addresses: z.array(orderAddressSchema).default([]),
  reservations: z.array(inventoryReservationSchema).default([]),
  events: z.array(orderEventSchema).default([]),
  paymentAttempts: z.array(orderPaymentAttemptSchema).default([]),
  // TD-174B-1 — Ödeme dağılımı (settled attempt'lerden türetilir; BUG-CART-005
  // projeksiyonu). Legacy/pending-only siparişlerde boş dizi. Snapshot değildir.
  paymentAllocations: z.array(orderPaymentAllocationSchema).default([]),
  // TODO-125 — Sipariş anında seçilen kargo sağlayıcı/seçenek özeti (store-admin
  // sipariş detayı görünümü). Eski siparişlerde null/yok olabilir (geri uyum).
  shippingSelection: orderShippingSelectionSchema.nullable().default(null),
  // TODO-135 — Sipariş listesi/başlık karşılama rozetinin kargo HAZIRLIK durumunu
  // yansıtabilmesi için TEMSİLİ kargo durumu (allowlist: yalnız DURUM enum'u).
  // Shipment yoksa null. statusText/iç ID/ham payload TAŞINMAZ.
  shipmentStatus: orderSummaryShipmentStatusSchema.nullable().default(null),
  // F4A.2 — Kampanya/kupon indirim SNAPSHOT satırları (tarihsel kayıt; additive).
  discounts: z.array(orderDiscountLineSchema).default([]),
  // F4C (ADR-064) — Satis/kar ozeti (snapshot-turevi; admin yuzeyi). Eski API
  // yanitlarinda yok → null default (geri uyum).
  salesSummary: orderSalesSummarySchema.nullable().default(null),
});

export const orderListResponseSchema = z.object({
  data: z.array(orderSchema),
  // TODO-159A (ADR-089) — ortak Data Grid meta'sı (legacy limit/offset/total KORUNUR).
  pagination: adminListPaginationSchema,
});

// TODO-073 — Store-admin sipariş listesi operasyonel filtreleri. Tüm filtreler
// opsiyonel; verilmeyen filtre kısıt getirmez. Tarihler yalnız gün (YYYY-MM-DD);
// gateway gün başı/sonu (UTC) sınırına genişletir. `search` sipariş no, müşteri
// e-postası ve müşteri adı/soyadı içinde (case-insensitive) arar. Filtreler DB
// tarafında uygulanır; store-scope route düzeyinde zorlanır (burada taşınmaz).
const orderListDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format.");

/**
 * TODO-159A (ADR-089) — Sipariş listesi sıralama allowlist'i. `total` sipariş
 * satırında MATERYAL bir kolondur (totalAmount), aggregate değil → güvenle
 * sıralanabilir.
 */
export const adminOrderListSortBySchema = z.enum(["createdAt", "placedAt", "total"]);

export const orderListQuerySchema = z.object({
  // Pagination opsiyonel; verilmezse gateway varsayılanı uygular (limit=50, offset=0).
  // TODO-159A — `page`/`pageSize` ortak Data Grid alanları da kabul edilir; ikisi
  // birden gelirse page/pageSize kazanır (resolveAdminListPage).
  limit: z.coerce.number().int().positive().max(ADMIN_LIST_MAX_PAGE_SIZE).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(ADMIN_LIST_MAX_PAGE_SIZE).optional(),
  sortBy: adminOrderListSortBySchema.optional(),
  sortOrder: adminListSortOrderSchema.optional(),
  status: orderStatusSchema.optional(),
  paymentStatus: paymentStatusSchema.optional(),
  fulfillmentStatus: fulfillmentStatusSchema.optional(),
  search: z.string().trim().min(1).max(120).optional(),
  dateFrom: orderListDateSchema.optional(),
  dateTo: orderListDateSchema.optional(),
});

export const orderCreateRequestSchema = z
  .object({
    customerId: z.string().min(1).nullable().optional(),
    customerEmail: z.string().email(),
    currency: currencySchema.default("TRY"),
    lines: z.array(orderLineInputSchema).min(1),
    addresses: z.array(addressInputSchema).max(2).default([]),
  })
  .refine(
    (value) => {
      const seen = new Set<string>();
      return value.addresses.every((address) => {
        if (seen.has(address.type)) return false;
        seen.add(address.type);
        return true;
      });
    },
    { message: "Only one address per type is allowed.", path: ["addresses"] },
  );

export const orderUpdateRequestSchema = z
  .object({
    customerEmail: z.string().email().optional(),
    customerId: z.string().min(1).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

export const orderCancelRequestSchema = z.object({
  reason: z.string().max(500).optional(),
});

// ============================================================================
// Financial Reporting Foundation (ADR-268) — Finans > Raporlar sözleşmeleri.
// Tümü minor-unit; KDV fiyata DAHİL (inclusive). Her currency AYRI; FX yok.
// KAYNAK DOĞRUSU sipariş snapshot'larıdır (canlı fiyat değil).
// ============================================================================
const financeDayStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD bekleniyor");

export const financePeriodPresetSchema = z.enum([
  "today",
  "yesterday",
  "last7",
  "last30",
  "thisMonth",
  "lastMonth",
  "thisYear",
  "custom",
]);

export const financeReportQuerySchema = z.object({
  period: financePeriodPresetSchema.optional(),
  dateFrom: financeDayStringSchema.optional(),
  dateTo: financeDayStringSchema.optional(),
  currency: currencySchema.optional(),
  status: orderStatusSchema.optional(),
  paymentStatus: paymentStatusSchema.optional(),
  productId: z.string().min(1).max(64).optional(),
  variantId: z.string().min(1).max(64).optional(),
  categoryId: z.string().min(1).max(64).optional(),
  brandId: z.string().min(1).max(64).optional(),
  campaignId: z.string().min(1).max(64).optional(),
  paymentMethod: z.enum(["CARD", "BANK_TRANSFER", "CASH_ON_DELIVERY", "PAYMENT_LINK"]).optional(),
});

const financeRangeSchema = z.object({
  from: financeDayStringSchema,
  to: financeDayStringSchema,
  timezone: z.string().min(1),
  days: z.number().int().nonnegative(),
});

const financeDeltaSchema = z.object({
  current: z.number(),
  previous: z.number(),
  deltaMinor: z.number(),
  deltaPct: z.number().nullable(),
});

const financeSummaryMetricsSchema = z.object({
  currency: currencySchema,
  grossSalesMinor: z.number().int(),
  discountsMinor: z.number().int(),
  productRefundsMinor: z.number().int(),
  netProductSalesMinor: z.number().int(),
  shippingRevenueMinor: z.number().int(),
  shippingRefundsMinor: z.number().int(),
  taxMinor: z.number().int(),
  totalRevenueMinor: z.number().int(),
  orderCount: z.number().int(),
  paidOrderCount: z.number().int(),
  cancelledOrderCount: z.number().int(),
  refundedOrderCount: z.number().int(),
  unitsSold: z.number().int(),
  averageOrderValueMinor: z.number().int(),
  grossProfitMinor: z.number().int().nullable(),
  netProfitMinor: z.number().int().nullable(),
  costMinor: z.number().int().nullable(),
  taxCoveredOrderCount: z.number().int(),
  costCoveredOrderCount: z.number().int(),
});

const financeComparisonSchema = z.object({
  totalRevenue: financeDeltaSchema,
  netProductSales: financeDeltaSchema,
  grossSales: financeDeltaSchema,
  discounts: financeDeltaSchema,
  orders: financeDeltaSchema,
  averageOrderValue: financeDeltaSchema,
  unitsSold: financeDeltaSchema,
});

const financeDailyPointSchema = z.object({
  date: financeDayStringSchema,
  grossSalesMinor: z.number().int(),
  discountsMinor: z.number().int(),
  netProductSalesMinor: z.number().int(),
  shippingRevenueMinor: z.number().int(),
  totalRevenueMinor: z.number().int(),
  taxMinor: z.number().int(),
  orderCount: z.number().int(),
  paidOrderCount: z.number().int(),
  unitsSold: z.number().int(),
  cancelledOrderCount: z.number().int(),
  refundedOrderCount: z.number().int(),
});

export const financeSummaryResponseSchema = z.object({
  data: z.object({
    range: financeRangeSchema,
    currency: currencySchema,
    availableCurrencies: z.array(currencySchema),
    /** İade tutar defteri bu fazda yok → false (UI dürüst mesaj gösterir; §Refund). */
    refundAmountsSupported: z.boolean(),
    summary: financeSummaryMetricsSchema,
    comparison: financeComparisonSchema,
    daily: z.array(financeDailyPointSchema),
  }),
});

const financeProductRowSchema = z.object({
  productId: z.string(),
  title: z.string(),
  sku: z.string(),
  units: z.number().int(),
  grossMinor: z.number().int(),
  listGrossMinor: z.number().int(),
  discountMinor: z.number().int(),
  netMinor: z.number().int(),
  costMinor: z.number().int(),
  orderCount: z.number().int(),
  coveredUnits: z.number().int(),
});

const financeVariantRowSchema = financeProductRowSchema.extend({
  variantId: z.string(),
  variantTitle: z.string(),
});

const financeDimensionRowSchema = z.object({
  key: z.string(),
  label: z.string(),
  units: z.number().int(),
  grossMinor: z.number().int(),
  orderCount: z.number().int(),
});

const financePaymentRowSchema = z.object({
  provider: z.string(),
  method: z.string(),
  paidCount: z.number().int(),
  failedCount: z.number().int(),
  refundedCount: z.number().int(),
  collectedMinor: z.number().int(),
  currency: currencySchema,
});

const financeDiscountRowSchema = z.object({
  campaignId: z.string().nullable(),
  couponId: z.string().nullable(),
  code: z.string().nullable(),
  label: z.string(),
  usageCount: z.number().int(),
  discountMinor: z.number().int(),
  ordersGrossMinor: z.number().int(),
});

export const financeBreakdownsResponseSchema = z.object({
  data: z.object({
    range: financeRangeSchema,
    currency: currencySchema,
    byProduct: z.array(financeProductRowSchema),
    byVariant: z.array(financeVariantRowSchema),
    byCategory: z.array(financeDimensionRowSchema),
    byBrand: z.array(financeDimensionRowSchema),
    byPaymentMethod: z.array(financePaymentRowSchema),
    byCampaign: z.array(financeDiscountRowSchema),
  }),
});

export const financePaymentReportResponseSchema = z.object({
  data: z.object({
    range: financeRangeSchema,
    currency: currencySchema,
    rows: z.array(financePaymentRowSchema),
  }),
});

export const financeDiscountReportResponseSchema = z.object({
  data: z.object({
    range: financeRangeSchema,
    currency: currencySchema,
    rows: z.array(financeDiscountRowSchema),
  }),
});

/* ══ TODO-174 (ADR-275) — İptal raporu (Store Admin; YALNIZ görüntüleme, taksonomi CRUD YOK) ═══════ */
export const cancellationReportQuerySchema = z.object({
  period: financePeriodPresetSchema.optional(),
  dateFrom: financeDayStringSchema.optional(),
  dateTo: financeDayStringSchema.optional(),
  currency: currencySchema.optional(),
  reasonCategory: orderCancellationReasonCategorySchema.optional(),
  reasonCode: orderCancellationReasonSchema.optional(),
  productId: z.string().min(1).max(64).optional(),
  categoryId: z.string().min(1).max(64).optional(),
  paymentMethod: z.enum(["CARD", "BANK_TRANSFER", "CASH_ON_DELIVERY", "PAYMENT_LINK"]).optional(),
  shippingProvider: z.string().min(1).max(32).optional(),
});
export type CancellationReportQuery = z.infer<typeof cancellationReportQuerySchema>;

const cancellationReasonCategoryRowSchema = z.object({
  category: orderCancellationReasonCategorySchema.nullable(),
  count: z.number().int().nonnegative(),
  revenueMinor: z.number().int().nonnegative(),
  sharePct: z.number(),
});
const cancellationReasonRowSchema = z.object({
  code: orderCancellationReasonSchema.nullable(),
  category: orderCancellationReasonCategorySchema.nullable(),
  count: z.number().int().nonnegative(),
  revenueMinor: z.number().int().nonnegative(),
});
const cancellationTrendPointSchema = z.object({
  date: z.string(),
  count: z.number().int().nonnegative(),
  revenueMinor: z.number().int().nonnegative(),
});
const cancellationDimensionRowSchema = z.object({
  key: z.string(),
  label: z.string(),
  count: z.number().int().nonnegative(),
  revenueMinor: z.number().int().nonnegative(),
});
const cancellationProductRowSchema = z.object({
  productId: z.string(),
  title: z.string(),
  count: z.number().int().nonnegative(),
  quantity: z.number().int().nonnegative(),
});
const cancellationSourceRowSchema = z.object({
  source: orderCancellationSourceSchema.nullable(),
  count: z.number().int().nonnegative(),
});

export const cancellationReportResponseSchema = z.object({
  data: z.object({
    range: financeRangeSchema,
    currency: currencySchema,
    totals: z.object({
      cancellationCount: z.number().int().nonnegative(),
      cancelledRevenueMinor: z.number().int().nonnegative(),
      refundedRevenueMinor: z.number().int().nonnegative(),
      ordersInRangeCount: z.number().int().nonnegative(),
      cancellationRatePct: z.number(),
      deliveryRelatedCount: z.number().int().nonnegative(),
      deliveryRelatedRatePct: z.number(),
    }),
    reasonCategoryDistribution: z.array(cancellationReasonCategoryRowSchema),
    reasonDistribution: z.array(cancellationReasonRowSchema),
    trend: z.array(cancellationTrendPointSchema),
    paymentMethodBreakdown: z.array(cancellationDimensionRowSchema),
    shippingMethodBreakdown: z.array(cancellationDimensionRowSchema),
    sourceBreakdown: z.array(cancellationSourceRowSchema),
    topProducts: z.array(cancellationProductRowSchema),
  }),
});
export type CancellationReportResponse = z.infer<typeof cancellationReportResponseSchema>;

// --- F3B.2 Payment provider operasyon altyapisi (provider-ready; canli odeme YOK) ---
export const paymentProviderTypeSchema = z.enum([
  "MOCK",
  "IYZICO",
  "STRIPE",
  "PAYTR",
  "GENERIC_REDIRECT",
]);
export const paymentProviderModeSchema = z.enum(["TEST", "LIVE"]);
export const paymentMethodTypeSchema = z.enum([
  "CARD",
  "BANK_TRANSFER",
  "CASH_ON_DELIVERY",
  "PAYMENT_LINK",
]);
export const paymentProviderStatusSchema = z.enum(["ENABLED", "DISABLED"]);
export const threeDsModeSchema = z.enum(["DISABLED", "OPTIONAL", "REQUIRED"]);
export const paymentAttemptStatusSchema = z.enum([
  "CREATED",
  "PENDING",
  "REQUIRES_ACTION",
  "AUTHORIZED",
  "PAID",
  "FAILED",
  "CANCELLED",
  "REFUNDED",
]);
export const paymentProviderEventTypeSchema = z.enum([
  "PAYMENT_CREATED",
  "PAYMENT_CONFIRMED",
  "PAYMENT_FAILED",
  "PAYMENT_CANCELLED",
  "PAYMENT_REFUNDED",
  "WEBHOOK_RECEIVED",
  "CONNECTION_TEST",
  "STATUS_CHANGED",
]);

/**
 * Provider config CLIENT yaniti — MASKELI. Secret alanlar (apiKey/secretKey/
 * webhookSecret) asla duz metin/ciphertext donmez; yalnizca apiKeyMasked (son-4)
 * ve *Set boolean'lari doner.
 */
export const paymentProviderConfigSchema = z.object({
  id: z.string().min(1),
  provider: paymentProviderTypeSchema,
  displayName: z.string().min(1),
  status: paymentProviderStatusSchema,
  mode: paymentProviderModeSchema,
  priority: z.number().int(),
  supportedMethods: z.array(paymentMethodTypeSchema),
  supportedCurrencies: z.array(currencySchema),
  minAmount: z.number().int().nonnegative().nullable(),
  maxAmount: z.number().int().nonnegative().nullable(),
  threeDsMode: threeDsModeSchema,
  installmentEnabled: z.boolean(),
  fallbackEnabled: z.boolean(),
  merchantId: z.string().nullable(),
  callbackUrl: z.string().nullable(),
  apiKeySet: z.boolean(),
  apiKeyMasked: z.string().nullable(),
  secretKeySet: z.boolean(),
  webhookSecretSet: z.boolean(),
  lastTestStatus: z.string().nullable(),
  lastTestMessage: z.string().nullable(),
  lastTestAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const paymentProviderConfigListResponseSchema = z.object({
  data: z.array(paymentProviderConfigSchema),
});

const optionalSecretInputSchema = z.string().min(1).max(2000).nullable().optional();

export const paymentProviderConfigCreateRequestSchema = z.object({
  provider: paymentProviderTypeSchema,
  displayName: z.string().min(1).max(120),
  status: paymentProviderStatusSchema.default("DISABLED"),
  mode: paymentProviderModeSchema.default("TEST"),
  priority: z.number().int().min(0).max(100000).default(100),
  supportedMethods: z.array(paymentMethodTypeSchema).min(1).default(["CARD"]),
  supportedCurrencies: z.array(currencySchema).min(1).default(["TRY"]),
  minAmount: z.number().int().nonnegative().nullable().optional(),
  maxAmount: z.number().int().nonnegative().nullable().optional(),
  threeDsMode: threeDsModeSchema.default("DISABLED"),
  installmentEnabled: z.boolean().default(false),
  fallbackEnabled: z.boolean().default(false),
  merchantId: z.string().max(255).nullable().optional(),
  callbackUrl: z.string().url().max(2000).nullable().optional(),
  // Secret alanlari: girilirse encrypt edilir; verilmezse set edilmez.
  apiKey: optionalSecretInputSchema,
  secretKey: optionalSecretInputSchema,
  webhookSecret: optionalSecretInputSchema,
});

/**
 * Update: tum alanlar opsiyonel. Secret semantigi — alan GONDERILMEZSE (undefined)
 * mevcut cipher KORUNUR; bos string ("") gonderilirse secret TEMIZLENIR; dolu deger
 * gonderilirse DEGISTIRILIR. (Route katmani uygular.)
 */
export const paymentProviderConfigUpdateRequestSchema = z
  .object({
    displayName: z.string().min(1).max(120).optional(),
    status: paymentProviderStatusSchema.optional(),
    mode: paymentProviderModeSchema.optional(),
    priority: z.number().int().min(0).max(100000).optional(),
    supportedMethods: z.array(paymentMethodTypeSchema).min(1).optional(),
    supportedCurrencies: z.array(currencySchema).min(1).optional(),
    minAmount: z.number().int().nonnegative().nullable().optional(),
    maxAmount: z.number().int().nonnegative().nullable().optional(),
    threeDsMode: threeDsModeSchema.optional(),
    installmentEnabled: z.boolean().optional(),
    fallbackEnabled: z.boolean().optional(),
    merchantId: z.string().max(255).nullable().optional(),
    callbackUrl: z.string().url().max(2000).nullable().optional(),
    apiKey: z.string().max(2000).nullable().optional(),
    secretKey: z.string().max(2000).nullable().optional(),
    webhookSecret: z.string().max(2000).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

export const paymentProviderStatusUpdateRequestSchema = z.object({
  status: paymentProviderStatusSchema,
});

export const paymentProviderReorderRequestSchema = z.object({
  items: z
    .array(z.object({ id: z.string().min(1), priority: z.number().int().min(0).max(100000) }))
    .min(1)
    .max(100),
});

export const paymentProviderTestConnectionResponseSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
  testedAt: z.string().datetime(),
});

export const paymentProviderEventSchema = z.object({
  id: z.string().min(1),
  provider: paymentProviderTypeSchema,
  type: paymentProviderEventTypeSchema,
  providerConfigId: z.string().nullable(),
  attemptId: z.string().nullable(),
  orderId: z.string().nullable(),
  eventId: z.string().nullable(),
  message: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export const paymentProviderEventListResponseSchema = z.object({
  data: z.array(paymentProviderEventSchema),
});

/* ─────────────── TODO-159F — Order Payment Recovery & Collection ─────────────── */

/**
 * Admin ödeme denemesi görünümü (ALLOWLIST). orderPaymentAttemptSchema + paylaşılabilir
 * ödeme bağlantısı. plain access token / secret / provider credential ASLA dönmez;
 * `paymentLinkUrl` bilinçli olarak paylaşılan bearer linktir (yalnız aktif online link'te).
 */
export const paymentRecoveryAttemptSchema = orderPaymentAttemptSchema.extend({
  // Mutlak müşteri ödeme adresi (STOREFRONT_PUBLIC_BASE_URL varsa), yoksa göreli /pay/:token.
  paymentLinkUrl: z.string().nullable().default(null),
  initiatedBy: z.string().nullable().default(null),
});
export type PaymentRecoveryAttempt = z.infer<typeof paymentRecoveryAttemptSchema>;

/** Admin'in tahsilat için seçebileceği uygun sağlayıcı (secret DÖNMEZ). */
export const paymentRecoveryProviderOptionSchema = z.object({
  providerConfigId: z.string().min(1),
  provider: paymentProviderTypeSchema,
  displayName: z.string(),
  mode: paymentProviderModeSchema,
  supportedMethods: z.array(paymentMethodTypeSchema),
  installmentEnabled: z.boolean(),
});
export type PaymentRecoveryProviderOption = z.infer<typeof paymentRecoveryProviderOptionSchema>;

/**
 * Sipariş ödeme durumu (admin). Kalan bakiye + uygun sağlayıcılar + aktif deneme +
 * geçmiş. Tutar otoritesi order snapshot'ıdır (client ASLA amount/currency belirlemez).
 */
export const orderPaymentStateResponseSchema = z.object({
  orderId: z.string().min(1),
  orderNumber: z.string().min(1),
  currency: currencySchema,
  paymentStatus: paymentStatusSchema,
  payableMinor: z.number().int().nonnegative(),
  capturedMinor: z.number().int().nonnegative(),
  remainingMinor: z.number().int().nonnegative(),
  canStartCollection: z.boolean(),
  // Store'da hiç ENABLED provider yoksa false → admin "sağlayıcı tanımlayın" mesajı gösterir.
  providersConfigured: z.boolean(),
  // TODO-159F (TD-110) — Gerçek e-posta teslimatı yapılandırılmış mı? false ise admin
  // "Müşteriye Gönder" aksiyonunu AKTİF göstermez (sahte gönderim YOK); kopyala yeterli.
  emailDeliveryConfigured: z.boolean().default(false),
  availableProviders: z.array(paymentRecoveryProviderOptionSchema),
  manualMethods: z.array(paymentManualMethodSchema),
  activeAttempt: paymentRecoveryAttemptSchema.nullable(),
  attempts: z.array(paymentRecoveryAttemptSchema),
});
export type OrderPaymentStateResponse = z.infer<typeof orderPaymentStateResponseSchema>;

/** Ödeme bağlantısı oluştur/yenile. providerConfigId opsiyonel (yoksa sunucu seçer). */
export const createPaymentLinkRequestSchema = z.object({
  providerConfigId: z.string().min(1).optional(),
});
export type CreatePaymentLinkRequest = z.infer<typeof createPaymentLinkRequestSchema>;

/** Ödeme bağlantısını e-posta ile gönder. email verilmezse siparişin iletişim e-postası. */
export const sendPaymentLinkEmailRequestSchema = z.object({
  email: z.string().email().max(320).optional(),
});
export type SendPaymentLinkEmailRequest = z.infer<typeof sendPaymentLinkEmailRequestSchema>;

export const sendPaymentLinkEmailResponseSchema = z.object({
  // Yalnız gerçek provider teslimat sonucu kabul edilirse true (SENT). FAILED → false.
  sent: z.boolean(),
  delivery: z.enum(["QUEUED", "SENDING", "SENT", "FAILED"]),
  recipientEmail: z.string(),
  attempt: paymentRecoveryAttemptSchema,
});
export type SendPaymentLinkEmailResponse = z.infer<typeof sendPaymentLinkEmailResponseSchema>;

/**
 * Manuel (offline) tahsilat kaydı. Sunucu-otoriter: amount kalan bakiyeyi AŞAMAZ,
 * currency sipariş para birimiyle eşleşmeli. MVP: tam tahsilat (amount === kalan) → PAID;
 * kısmi tahsilat REDDEDİLİR.
 */
export const recordManualPaymentRequestSchema = z.object({
  method: paymentManualMethodSchema,
  amountMinor: z.number().int().positive(),
  currency: currencySchema,
  reference: z.string().max(200).optional(),
  note: z.string().max(1000).optional(),
  collectedAt: z.string().datetime().optional(),
});
export type RecordManualPaymentRequest = z.infer<typeof recordManualPaymentRequestSchema>;

/** Ödeme bağlantısı oluşturma/yenileme yanıtı. */
export const paymentLinkResponseSchema = z.object({
  attempt: paymentRecoveryAttemptSchema,
  paymentLinkUrl: z.string(),
  paymentPath: z.string(),
  expiresAt: z.string().datetime(),
});
export type PaymentLinkResponse = z.infer<typeof paymentLinkResponseSchema>;

/* ---- Public müşteri ödeme sayfası (/pay/:token) — opaque token ---- */

/**
 * Token çözümleme yanıtı (ALLOWLIST). Sipariş no + tutar + durum + ödeme seçenekleri.
 * GÖSTERİLMEZ: admin/internal alanlar, maliyet/kâr, başka müşteri bilgisi, tam yönetim
 * detayı, sipariş ID'si. paymentStatus dışarıya UNPAID/PAYMENT_PENDING/PAID/... döner.
 */
export const publicPayResolveResponseSchema = z.object({
  orderNumber: z.string(),
  storeName: z.string(),
  currency: currencySchema,
  amountMinor: z.number().int().nonnegative(),
  paymentStatus: paymentStatusSchema,
  provider: paymentProviderTypeSchema.nullable(),
  mode: paymentProviderModeSchema.nullable(),
  method: paymentMethodTypeSchema,
  expiresAt: z.string().datetime().nullable(),
  // Ödeme başlatılabilir mi? (UNPAID/PAYMENT_PENDING + token geçerli + süresi dolmamış).
  payable: z.boolean(),
  // Bu fazda yalnız MOCK sandbox tamamlanabilir; gerçek provider kontrollü hata döner.
  sandbox: z.boolean(),
  scenarios: z.array(publicPaymentScenarioSchema),
});
export type PublicPayResolveResponse = z.infer<typeof publicPayResolveResponseSchema>;

export const publicPayStartRequestSchema = z.object({
  card: publicPaymentCardSchema.optional(),
  scenario: publicPaymentScenarioSchema.optional(),
  threeDsAction: publicPaymentThreeDsActionSchema.optional(),
});
export type PublicPayStartRequest = z.infer<typeof publicPayStartRequestSchema>;

export const publicPayResultResponseSchema = z.object({
  orderNumber: z.string(),
  paymentStatus: paymentStatusSchema,
  status: z.enum([
    "CREATED",
    "PENDING",
    "REQUIRES_ACTION",
    "AUTHORIZED",
    "PAID",
    "FAILED",
    "CANCELLED",
    "REFUNDED",
  ]),
  requiresAction: z.boolean(),
  failureCode: z.string().nullable(),
  failureMessage: z.string().nullable(),
});
export type PublicPayResultResponse = z.infer<typeof publicPayResultResponseSchema>;

export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
export type TenantContextContract = z.infer<typeof tenantContextSchema>;
export type PlatformEventContract = z.infer<typeof platformEventSchema>;
export type PlatformUserContract = z.infer<typeof platformUserSchema>;
export type PlatformLoginRequest = z.infer<typeof platformLoginRequestSchema>;
export type PlatformLoginResponse = z.infer<typeof platformLoginResponseSchema>;
export type PlatformMeResponse = z.infer<typeof platformMeResponseSchema>;
export type PlatformLogoutResponse = z.infer<typeof platformLogoutResponseSchema>;
export type PlatformSessionExtendResponse = z.infer<typeof platformSessionExtendResponseSchema>;
export type SessionTiming = z.infer<typeof sessionTimingSchema>;
export type AdminStore = z.infer<typeof adminStoreSchema>;
export type AdminStoreListResponse = z.infer<typeof adminStoreListResponseSchema>;
export type AdminStoreCreateRequest = z.infer<typeof adminStoreCreateRequestSchema>;
export type AdminStoreUpdateRequest = z.infer<typeof adminStoreUpdateRequestSchema>;
export type Plan = z.infer<typeof planSchema>;
export type PlanListResponse = z.infer<typeof planListResponseSchema>;
export type PlanCreateRequest = z.infer<typeof planCreateRequestSchema>;
export type PlanUpdateRequest = z.infer<typeof planUpdateRequestSchema>;
export type ProductStatus = z.infer<typeof productStatusSchema>;
export type ProductType = z.infer<typeof productTypeSchema>;
export type ProductSalesMode = z.infer<typeof productSalesModeSchema>;
export type ProductPriceVisibility = z.infer<typeof productPriceVisibilitySchema>;
export type ProductPrimaryAction = z.infer<typeof productPrimaryActionSchema>;
export type ProductVariantStatus = z.infer<typeof productVariantStatusSchema>;
export type ProductCategoryStatus = z.infer<typeof productCategoryStatusSchema>;
export type InventoryMovementType = z.infer<typeof inventoryMovementTypeSchema>;
export type CustomerStatus = z.infer<typeof customerStatusSchema>;
export type AddressType = z.infer<typeof addressTypeSchema>;
export type OrderStatus = z.infer<typeof orderStatusSchema>;
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;
export type FulfillmentStatus = z.infer<typeof fulfillmentStatusSchema>;
export type InventoryReservationStatus = z.infer<typeof inventoryReservationStatusSchema>;
export type ProductCategory = z.infer<typeof productCategorySchema>;
export type ProductCategoryListResponse = z.infer<typeof productCategoryListResponseSchema>;
export type ProductCategoryCreateRequest = z.infer<typeof productCategoryCreateRequestSchema>;
export type ProductCategoryUpdateRequest = z.infer<typeof productCategoryUpdateRequestSchema>;
// Faz 1B (ADR-067) — Attribute katalog cekirdegi tipleri.
export type AttributeScope = z.infer<typeof attributeScopeSchema>;
export type AttributeStatus = z.infer<typeof attributeStatusSchema>;
export type AttributeDataType = z.infer<typeof attributeDataTypeSchema>;
export type AttributeDefinition = z.infer<typeof attributeDefinitionSchema>;
export type AttributeDefinitionListResponse = z.infer<typeof attributeDefinitionListResponseSchema>;
export type AttributeDefinitionCreateRequest = z.infer<typeof attributeDefinitionCreateRequestSchema>;
export type AttributeDefinitionUpdateRequest = z.infer<typeof attributeDefinitionUpdateRequestSchema>;
export type AttributeGroup = z.infer<typeof attributeGroupSchema>;
export type AttributeGroupListResponse = z.infer<typeof attributeGroupListResponseSchema>;
export type AttributeGroupCreateRequest = z.infer<typeof attributeGroupCreateRequestSchema>;
export type AttributeGroupUpdateRequest = z.infer<typeof attributeGroupUpdateRequestSchema>;
export type AttributeOption = z.infer<typeof attributeOptionSchema>;
export type AttributeOptionListResponse = z.infer<typeof attributeOptionListResponseSchema>;
export type AttributeOptionCreateRequest = z.infer<typeof attributeOptionCreateRequestSchema>;
export type AttributeOptionUpdateRequest = z.infer<typeof attributeOptionUpdateRequestSchema>;
export type CategoryAttribute = z.infer<typeof categoryAttributeSchema>;
export type CategoryAttributeListResponse = z.infer<typeof categoryAttributeListResponseSchema>;
export type CategoryAttributeCreateRequest = z.infer<typeof categoryAttributeCreateRequestSchema>;
export type CategoryAttributeUpdateRequest = z.infer<typeof categoryAttributeUpdateRequestSchema>;
// Faz 2A (ADR-068) — urun/varyant attribute deger tipleri.
export type ProductAttributeValueInput = z.infer<typeof productAttributeValueInputSchema>;
export type VariantAttributeValueInput = z.infer<typeof variantAttributeValueInputSchema>;
export type ProductAttributeValueResponse = z.infer<typeof productAttributeValueSchema>;
export type ProductAttributeValueListResponse = z.infer<typeof productAttributeValueListResponseSchema>;
export type VariantAttributeValueResponse = z.infer<typeof variantAttributeValueSchema>;
export type VariantAttributeValueListResponse = z.infer<typeof variantAttributeValueListResponseSchema>;
export type ProductAttributeValuesReplaceRequest = z.infer<typeof productAttributeValuesReplaceRequestSchema>;
export type VariantAttributeValuesReplaceRequest = z.infer<typeof variantAttributeValuesReplaceRequestSchema>;
// Faz 2C-1 (ADR-070) — varyant eksen secimi tipleri.
export type ProductVariantSelectionInput = z.infer<typeof productVariantSelectionInputSchema>;
export type ProductVariantSelectionResponse = z.infer<typeof productVariantSelectionSchema>;
export type ProductVariantSelectionListResponse = z.infer<typeof productVariantSelectionListResponseSchema>;
export type ProductVariantSelectionsReplaceRequest = z.infer<typeof productVariantSelectionsReplaceRequestSchema>;
// Faz 2C-2 (ADR-071) — Combination Engine onizleme tipleri.
export type VariantCombinationPreviewAttribute = z.infer<typeof variantCombinationPreviewAttributeSchema>;
export type VariantCombinationPreview = z.infer<typeof variantCombinationPreviewSchema>;
export type VariantCombinationPreviewResponse = z.infer<typeof variantCombinationPreviewResponseSchema>;

export type VariantGenerationVariantAttribute = z.infer<typeof variantGenerationVariantAttributeSchema>;
export type VariantGenerationVariant = z.infer<typeof variantGenerationVariantSchema>;
export type VariantGenerationResponse = z.infer<typeof variantGenerationResponseSchema>;
// TODO-150 (ADR-073) — Identity Management Engine tipleri.
export type IdentityField = z.infer<typeof identityFieldSchema>;
export type IdentityPreviewField = z.infer<typeof identityPreviewFieldSchema>;
export type IdentityPreviewRow = z.infer<typeof identityPreviewRowSchema>;
export type IdentityCollision = z.infer<typeof identityCollisionSchema>;
export type IdentityPreviewResponse = z.infer<typeof identityPreviewResponseSchema>;
export type IdentityApplyResponse = z.infer<typeof identityApplyResponseSchema>;
export type IdentityApplyRequest = z.infer<typeof identityApplyRequestSchema>;
// TODO-151 (ADR-074) — Commercial Engine tipleri.
export type CommercialField = z.infer<typeof commercialFieldSchema>;
export type CommercialOperation = z.infer<typeof commercialOperationSchema>;
export type CommercialRoundingMode = z.infer<typeof commercialRoundingModeSchema>;
export type CommercialPriceEnding = z.infer<typeof commercialPriceEndingSchema>;
export type CommercialRule = z.infer<typeof commercialRuleSchema>;
export type CommercialDirectEdit = z.infer<typeof commercialDirectEditSchema>;
export type CommercialState = z.infer<typeof commercialStateSchema>;
export type CommercialCalc = z.infer<typeof commercialCalcSchema>;
export type CommercialPreviewRow = z.infer<typeof commercialPreviewRowSchema>;
export type CommercialSummary = z.infer<typeof commercialSummarySchema>;
export type CommercialPreviewResponse = z.infer<typeof commercialPreviewResponseSchema>;
export type CommercialPreviewRequest = z.infer<typeof commercialPreviewRequestSchema>;
export type CommercialApplyRequest = z.infer<typeof commercialApplyRequestSchema>;
export type CommercialApplyResponse = z.infer<typeof commercialApplyResponseSchema>;
// TODO-152 (ADR-076) — Inventory Engine tipleri.
export type WarehouseStatusValue = z.infer<typeof warehouseStatusSchema>;
export type InventoryField = z.infer<typeof inventoryFieldSchema>;
export type InventoryOperation = z.infer<typeof inventoryOperationSchema>;
export type InventoryStockStatus = z.infer<typeof inventoryStockStatusSchema>;
export type InventoryWarehouse = z.infer<typeof inventoryWarehouseSchema>;
export type InventoryWarehouseListResponse = z.infer<typeof inventoryWarehouseListResponseSchema>;
export type InventoryRule = z.infer<typeof inventoryRuleSchema>;
export type InventoryDirectEdit = z.infer<typeof inventoryDirectEditSchema>;
export type InventoryStateContract = z.infer<typeof inventoryStateSchema>;
export type InventoryCalcContract = z.infer<typeof inventoryCalcSchema>;
export type InventoryPreviewRow = z.infer<typeof inventoryPreviewRowSchema>;
export type InventorySummary = z.infer<typeof inventorySummarySchema>;
export type InventoryPreviewResponse = z.infer<typeof inventoryPreviewResponseSchema>;
export type InventoryPreviewRequest = z.infer<typeof inventoryPreviewRequestSchema>;
export type InventoryApplyRequest = z.infer<typeof inventoryApplyRequestSchema>;
export type InventoryApplyResponse = z.infer<typeof inventoryApplyResponseSchema>;
export type InventoryStoreMatrixRow = z.infer<typeof inventoryStoreMatrixRowSchema>;
export type InventoryStoreMatrixResponse = z.infer<typeof inventoryStoreMatrixResponseSchema>;
export type StoreSettings = z.infer<typeof storeSettingsSchema>;
export type StoreSettingsUpdateRequest = z.infer<typeof storeSettingsUpdateRequestSchema>;
export type ContentStatus = z.infer<typeof contentStatusSchema>;
export type HeroSlide = z.infer<typeof heroSlideSchema>;
export type HeroSlideListResponse = z.infer<typeof heroSlideListResponseSchema>;
export type HeroSlideCreateRequest = z.infer<typeof heroSlideCreateRequestSchema>;
export type HeroSlideUpdateRequest = z.infer<typeof heroSlideUpdateRequestSchema>;
export type HeroSlideReorderRequest = z.infer<typeof heroSlideReorderRequestSchema>;
export type HeroSlideStatusActionResponse = z.infer<typeof heroSlideStatusActionResponseSchema>;
// TODO-158A (ADR-086) — Home Experience Platform (admin + config).
export type HomeSectionType = z.infer<typeof homeSectionTypeSchema>;
export type HomeShowcaseLayout = z.infer<typeof homeShowcaseLayoutSchema>;
export type HomeShowcaseRule = z.infer<typeof homeShowcaseRuleSchema>;
export type HomeShowcaseSource = z.infer<typeof homeShowcaseSourceSchema>;
export type HomeShowcaseConfig = z.infer<typeof homeShowcaseConfigSchema>;
export type HomeHeroConfig = z.infer<typeof homeHeroConfigSchema>;
export type HomeSection = z.infer<typeof homeSectionSchema>;
export type HomeSectionListResponse = z.infer<typeof homeSectionListResponseSchema>;
export type HomeSectionCreateRequest = z.infer<typeof homeSectionCreateRequestSchema>;
export type HomeSectionUpdateRequest = z.infer<typeof homeSectionUpdateRequestSchema>;
export type HomeSectionReorderRequest = z.infer<typeof homeSectionReorderRequestSchema>;
export type HomeHeroSlide = z.infer<typeof homeHeroSlideSchema>;
export type HomeHeroSlideListResponse = z.infer<typeof homeHeroSlideListResponseSchema>;
export type HomeHeroSlideCreateRequest = z.infer<typeof homeHeroSlideCreateRequestSchema>;
export type HomeHeroSlideUpdateRequest = z.infer<typeof homeHeroSlideUpdateRequestSchema>;
export type HomeHeroSlideReorderRequest = z.infer<typeof homeHeroSlideReorderRequestSchema>;
export type HomeFeaturedCategory = z.infer<typeof homeFeaturedCategorySchema>;
export type HomeFeaturedCategoryListResponse = z.infer<
  typeof homeFeaturedCategoryListResponseSchema
>;
export type HomeFeaturedCategoryCreateRequest = z.infer<
  typeof homeFeaturedCategoryCreateRequestSchema
>;
export type HomeFeaturedCategoryUpdateRequest = z.infer<
  typeof homeFeaturedCategoryUpdateRequestSchema
>;
export type HomeFeaturedCategoryReorderRequest = z.infer<
  typeof homeFeaturedCategoryReorderRequestSchema
>;
export type HomeShowcaseProduct = z.infer<typeof homeShowcaseProductSchema>;
export type HomeShowcaseProductListResponse = z.infer<
  typeof homeShowcaseProductListResponseSchema
>;
export type HomeShowcaseProductSetRequest = z.infer<typeof homeShowcaseProductSetRequestSchema>;
export type Product = z.infer<typeof productSchema>;
export type ProductListResponse = z.infer<typeof productListResponseSchema>;
export type ProductCreateRequest = z.input<typeof productCreateRequestSchema>;
export type ProductUpdateRequest = z.infer<typeof productUpdateRequestSchema>;
export type ProductVariant = z.infer<typeof productVariantSchema>;
export type ProductVariantListResponse = z.infer<typeof productVariantListResponseSchema>;
export type PriceChangeSource = z.infer<typeof priceChangeSourceSchema>;
export type ProductPriceChange = z.infer<typeof productPriceChangeSchema>;
export type ProductPriceChangeListResponse = z.infer<typeof productPriceChangeListResponseSchema>;
export type PublicCampaignBadge = z.infer<typeof publicCampaignBadgeSchema>;
export type PublicProductVariant = z.infer<typeof publicProductVariantSchema>;
export type PublicProductImage = z.infer<typeof publicProductImageSchema>;
export type PublicProduct = z.infer<typeof publicProductSchema>;
export type PublicProductListResponse = z.infer<typeof publicProductListResponseSchema>;
export type PublicProductDetail = z.infer<typeof publicProductDetailSchema>;
// TODO-156D tamamlama (ADR-082) — public redirect DTO'ları (runtime çözümleme).
export type PublicRedirect = z.infer<typeof publicRedirectSchema>;
export type PublicRedirectListResponse = z.infer<typeof publicRedirectListResponseSchema>;
export type PublicCampaignSlidesResponse = z.infer<typeof publicCampaignSlidesResponseSchema>;
export type PublicStoreInfo = z.infer<typeof publicStoreInfoSchema>;
export type PublicHeroSlide = z.infer<typeof publicHeroSlideSchema>;
export type PublicHeroSlidesResponse = z.infer<typeof publicHeroSlidesResponseSchema>;
// TODO-158A (ADR-086) — Home Experience public composed projeksiyon tipleri.
export type PublicHomeHeroSlide = z.infer<typeof publicHomeHeroSlideSchema>;
export type PublicHomeFeaturedCategory = z.infer<typeof publicHomeFeaturedCategorySchema>;
export type PublicHomeSection = z.infer<typeof publicHomeSectionSchema>;
export type PublicHomeResponse = z.infer<typeof publicHomeResponseSchema>;
export type PublicCartItemInput = z.infer<typeof publicCartItemInputSchema>;
export type PublicCartRequest = z.infer<typeof publicCartRequestSchema>;
export type PublicCartLineStatus = z.infer<typeof publicCartLineStatusSchema>;
export type PublicCartLine = z.infer<typeof publicCartLineSchema>;
export type PublicCouponStatus = z.infer<typeof publicCouponStatusSchema>;
export type PublicCartSummary = z.infer<typeof publicCartSummarySchema>;
export type PublicCart = z.infer<typeof publicCartSchema>;
// TODO-167 (ADR-266) — Persistent Cart (customer cart) tipleri.
export type CartStatus = z.infer<typeof cartStatusSchema>;
export type CustomerCartProjection = z.infer<typeof customerCartProjectionSchema>;
export type CustomerCartResponse = z.infer<typeof customerCartResponseSchema>;
export type CustomerCartStaleResponse = z.infer<typeof customerCartStaleResponseSchema>;
export type CustomerCartAddLineRequest = z.infer<typeof customerCartAddLineRequestSchema>;
export type CustomerCartSetLineRequest = z.infer<typeof customerCartSetLineRequestSchema>;
export type CustomerCartDeleteLineRequest = z.infer<typeof customerCartDeleteLineRequestSchema>;
export type CustomerCartReconcileRequest = z.infer<typeof customerCartReconcileRequestSchema>;
export type CustomerCartMergeRequest = z.infer<typeof customerCartMergeRequestSchema>;
export type CustomerCartMergeResult = z.infer<typeof customerCartMergeResultSchema>;
export type CustomerCartMergeResponse = z.infer<typeof customerCartMergeResponseSchema>;
// TODO-168 (ADR-267) — Cart Change Awareness tipleri.
export type CartChangeType = z.infer<typeof cartChangeTypeSchema>;
export type CartChangeSeverity = z.infer<typeof cartChangeSeveritySchema>;
export type PublicCartLineChange = z.infer<typeof publicCartLineChangeSchema>;
export type PublicCartChange = z.infer<typeof publicCartChangeSchema>;
export type PublicCartLineSnapshot = z.infer<typeof publicCartLineSnapshotSchema>;
export type PublicCartChangeContext = z.infer<typeof publicCartChangeContextSchema>;
export type PublicCartResolveResponse = z.infer<typeof publicCartResolveResponseSchema>;
export type CustomerCartAckResponse = z.infer<typeof customerCartAckResponseSchema>;
export type CartChangeEventType = z.infer<typeof cartChangeEventTypeSchema>;
export type CartChangeEventPlacement = z.infer<typeof cartChangeEventPlacementSchema>;
export type CartChangeEventRequest = z.infer<typeof cartChangeEventRequestSchema>;
export type CartChangeEventResponse = z.infer<typeof cartChangeEventResponseSchema>;
export type PublicCheckoutContact = z.infer<typeof publicCheckoutContactSchema>;
export type PublicCheckoutAddress = z.infer<typeof publicCheckoutAddressSchema>;
export type PublicCheckoutRequest = z.infer<typeof publicCheckoutRequestSchema>;
export type PublicOrderConfirmationLine = z.infer<typeof publicOrderConfirmationLineSchema>;
export type PublicOrderConfirmation = z.infer<typeof publicOrderConfirmationSchema>;
export type PublicCheckoutBilling = z.infer<typeof publicCheckoutBillingSchema>;
export type PublicBillingSummary = z.infer<typeof publicBillingSummarySchema>;
export type PublicAddressSummary = z.infer<typeof publicAddressSummarySchema>;
export type PublicPaymentInfo = z.infer<typeof publicPaymentInfoSchema>;
export type PublicOrderReceipt = z.infer<typeof publicOrderReceiptSchema>;
export type PublicPaymentCard = z.infer<typeof publicPaymentCardSchema>;
export type PublicPaymentScenario = z.infer<typeof publicPaymentScenarioSchema>;
export type PublicPaymentThreeDsAction = z.infer<typeof publicPaymentThreeDsActionSchema>;
export type PublicPaymentRedirect = z.infer<typeof publicPaymentRedirectSchema>;
export type PublicPaymentState = z.infer<typeof publicPaymentStateSchema>;
export type PublicPaymentSubmitRequest = z.infer<typeof publicPaymentSubmitRequestSchema>;
export type PublicPaymentResult = z.infer<typeof publicPaymentResultSchema>;
export type PublicPaymentAvailability = z.infer<typeof publicPaymentAvailabilitySchema>;
export type PaymentProviderTypeContract = z.infer<typeof paymentProviderTypeSchema>;
export type PaymentProviderModeContract = z.infer<typeof paymentProviderModeSchema>;
export type PaymentMethodTypeContract = z.infer<typeof paymentMethodTypeSchema>;
export type PaymentProviderStatusContract = z.infer<typeof paymentProviderStatusSchema>;
export type ThreeDsModeContract = z.infer<typeof threeDsModeSchema>;
export type PaymentAttemptStatusContract = z.infer<typeof paymentAttemptStatusSchema>;
export type PaymentProviderEventTypeContract = z.infer<typeof paymentProviderEventTypeSchema>;
export type PaymentProviderConfig = z.infer<typeof paymentProviderConfigSchema>;
export type PaymentProviderConfigListResponse = z.infer<
  typeof paymentProviderConfigListResponseSchema
>;
export type PaymentProviderConfigCreateRequest = z.infer<
  typeof paymentProviderConfigCreateRequestSchema
>;
export type PaymentProviderConfigUpdateRequest = z.infer<
  typeof paymentProviderConfigUpdateRequestSchema
>;
export type PaymentProviderStatusUpdateRequest = z.infer<
  typeof paymentProviderStatusUpdateRequestSchema
>;
export type PaymentProviderReorderRequest = z.infer<typeof paymentProviderReorderRequestSchema>;
export type PaymentProviderTestConnectionResponse = z.infer<
  typeof paymentProviderTestConnectionResponseSchema
>;
export type PaymentProviderEvent = z.infer<typeof paymentProviderEventSchema>;
export type PaymentProviderEventListResponse = z.infer<
  typeof paymentProviderEventListResponseSchema
>;
export type ProductVariantCreateRequest = z.infer<typeof productVariantCreateRequestSchema>;
export type ProductVariantUpdateRequest = z.infer<typeof productVariantUpdateRequestSchema>;
// TODO-160A (ADR-109…113) — SKU Generation & Governance tipleri.
export type SkuPreviewRow = z.infer<typeof skuPreviewRowSchema>;
export type SkuPreviewResponse = z.infer<typeof skuPreviewResponseSchema>;
export type SkuRegenerateRequest = z.infer<typeof skuRegenerateRequestSchema>;
export type SkuRegenerateResponse = z.infer<typeof skuRegenerateResponseSchema>;
export type SkuValidateRequest = z.infer<typeof skuValidateRequestSchema>;
export type SkuValidateResponse = z.infer<typeof skuValidateResponseSchema>;
export type SkuAuditRow = z.infer<typeof skuAuditRowSchema>;
export type SkuAuditResponse = z.infer<typeof skuAuditResponseSchema>;
export type InventoryItem = z.infer<typeof inventoryItemSchema>;
export type InventoryListResponse = z.infer<typeof inventoryListResponseSchema>;
export type InventoryAdjustRequest = z.infer<typeof inventoryAdjustRequestSchema>;
export type InventoryAdjustmentResponse = z.infer<typeof inventoryAdjustmentResponseSchema>;
export type Customer = z.infer<typeof customerSchema>;
export type OrderAddress = z.infer<typeof orderAddressSchema>;
export type OrderLine = z.infer<typeof orderLineSchema>;
export type OrderLineInput = z.infer<typeof orderLineInputSchema>;
export type OrderLineUpdateRequest = z.infer<typeof orderLineUpdateRequestSchema>;
export type InventoryReservation = z.infer<typeof inventoryReservationSchema>;
export type OrderEvent = z.infer<typeof orderEventSchema>;
export type OrderPaymentAttempt = z.infer<typeof orderPaymentAttemptSchema>;
export type OrderBilling = z.infer<typeof orderBillingSchema>;
export type Order = z.infer<typeof orderSchema>;
export type OrderDiscountLine = z.infer<typeof orderDiscountLineSchema>;
// F4C (ADR-064) — Satis/kar ozeti tipleri.
export type OrderSalesSummary = z.infer<typeof orderSalesSummarySchema>;
export type OrderSalesSummaryVatLine = z.infer<typeof orderSalesSummaryVatLineSchema>;
export type OrderListResponse = z.infer<typeof orderListResponseSchema>;
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;
// ADR-268 — Financial Reporting Foundation tipleri.
export type FinancePeriodPreset = z.infer<typeof financePeriodPresetSchema>;
export type FinanceReportQuery = z.infer<typeof financeReportQuerySchema>;
export type FinanceSummaryResponse = z.infer<typeof financeSummaryResponseSchema>;
export type FinanceBreakdownsResponse = z.infer<typeof financeBreakdownsResponseSchema>;
export type FinancePaymentReportResponse = z.infer<typeof financePaymentReportResponseSchema>;
export type FinanceDiscountReportResponse = z.infer<typeof financeDiscountReportResponseSchema>;
export type AdminOrderListSortBy = z.infer<typeof adminOrderListSortBySchema>;
export type OrderCreateRequest = z.infer<typeof orderCreateRequestSchema>;
export type OrderUpdateRequest = z.infer<typeof orderUpdateRequestSchema>;
export type OrderCancelRequest = z.infer<typeof orderCancelRequestSchema>;

/* ════════════════════════════════════════════════════════════════════════════
 * F3B.3 — Storefront musteri hesabi: auth (kayit/giris/otp/session), profil,
 * sifre, iletisim tercihleri, adres defteri, IBAN. Tek otorite (gateway server-
 * otoriter + vitrin UX). Plain sifre/OTP ASLA; TCKN/VKN/IBAN response'ta maskeli.
 * ════════════════════════════════════════════════════════════════════════════ */

/** Sifre politikasi: min 8, en az bir buyuk + kucuk harf + rakam. */
export const customerPasswordSchema = z
  .string()
  .min(8, "Sifre en az 8 karakter olmali.")
  .max(200)
  .refine((v) => /[a-z]/.test(v), "Sifre kucuk harf icermeli.")
  .refine((v) => /[A-Z]/.test(v), "Sifre buyuk harf icermeli.")
  .refine((v) => /[0-9]/.test(v), "Sifre rakam icermeli.");

export const customerGenderSchema = z.enum(["FEMALE", "MALE", "OTHER"]);
export const customerOtpChannelSchema = z.enum(["EMAIL", "SMS"]);

/** Kayit/giris tanimlayici girisi (email veya GSM, tek input). */
export const customerIdentifierSchema = z.string().min(1).max(320);

/* ── Kayit (3 adim) ───────────────────────────────────────────────────────── */

export const customerRegisterStartRequestSchema = z.object({
  identifier: customerIdentifierSchema,
});

/** OTP gonderim sonucu. Kod ASLA donmez; yalniz kanal + maskeli hedef + sayaclar. */
export const customerOtpChallengeResponseSchema = z.object({
  otpRequired: z.literal(true),
  channel: customerOtpChannelSchema,
  maskedDestination: z.string().min(1),
  expiresInSeconds: z.number().int().positive(),
  resendAvailableInSeconds: z.number().int().nonnegative(),
});

export const customerOtpVerifyRequestSchema = z.object({
  identifier: customerIdentifierSchema,
  code: z.string().regex(/^[0-9]{6}$/, "6 haneli kod girin."),
});

export const customerOtpVerifyResponseSchema = z.object({
  verified: z.literal(true),
});

export const customerRegisterCompleteRequestSchema = z.object({
  identifier: customerIdentifierSchema,
  code: z.string().regex(/^[0-9]{6}$/, "6 haneli kod girin."),
  firstName: z.string().min(1, "Ad zorunlu.").max(120),
  lastName: z.string().min(1, "Soyad zorunlu.").max(120),
  password: customerPasswordSchema,
  kvkkConsent: z.literal(true, { errorMap: () => ({ message: "KVKK onayi zorunlu." }) }),
  clarificationConsent: z.literal(true, {
    errorMap: () => ({ message: "Aydinlatma metni onayi zorunlu." }),
  }),
  // ADR-271 — kayit tamamlaninca acilan oturum icin "Beni hatirla". Varsayilan KAPALI.
  rememberMe: z.boolean().optional().default(false),
});

/* ── Giris / oturum ───────────────────────────────────────────────────────── */

export const customerLoginRequestSchema = z.object({
  identifier: customerIdentifierSchema,
  password: z.string().min(1).max(200),
  // ADR-271 — "Beni hatirla" (bkz. platformLoginRequestSchema). Varsayilan KAPALI.
  rememberMe: z.boolean().optional().default(false),
});

/** Oturum acan musterinin guvenli profili (kendi hesabi). */
export const customerAccountSchema = z.object({
  id: z.string().min(1),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  birthDate: z.string().nullable(),
  gender: customerGenderSchema.nullable(),
  emailVerified: z.boolean(),
  phoneVerified: z.boolean(),
  status: z.enum(["ACTIVE", "PASSIVE", "BLOCKED", "ARCHIVED", "ERASED"]),
});

export const customerSessionResponseSchema = z.object({
  token: z.string().min(1),
  expiresAt: z.string().datetime(),
  customer: customerAccountSchema,
});

export const customerMeResponseSchema = z.object({
  customer: customerAccountSchema,
  session: z.object({
    expiresAt: z.string().datetime(),
    timing: sessionTimingSchema.optional(),
  }),
});

export const customerLogoutResponseSchema = z.object({ revoked: z.boolean() });

// ADR-271 — musteri oturum uzatma (extend): token ROTATE; yeni token + zamanlama.
export const customerSessionExtendResponseSchema = z.object({
  token: z.string().min(1),
  expiresAt: z.string().datetime(),
  timing: sessionTimingSchema,
});

/* ── Profil / sifre / iletisim tercihleri ─────────────────────────────────── */

export const customerProfileUpdateRequestSchema = z.object({
  firstName: z.string().min(1).max(120),
  lastName: z.string().min(1).max(120),
  birthDate: z.string().date().nullable().optional(),
  gender: customerGenderSchema.nullable().optional(),
});

export const customerPasswordChangeRequestSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: customerPasswordSchema,
});

export const customerCommunicationPreferenceSchema = z.object({
  smsEnabled: z.boolean(),
  emailEnabled: z.boolean(),
  phoneEnabled: z.boolean(),
});

/* ── Adres defteri ────────────────────────────────────────────────────────── */

/**
 * Adres olustur/guncelle. Teslimat alanlari + opsiyonel fatura kimligi. Fatura
 * tipi verilirse F3B.2 ile ayni katilikta dogrulanir (Bireysel→TCKN; Kurumsal→
 * firma/vergi dairesi/VKN). Guncellemede maskeli tax alani bos birakilirsa mevcut
 * korunur (gateway karari).
 */
export const customerAddressInputSchema = z
  .object({
    addressName: z.string().min(1, "Adres adi zorunlu.").max(120),
    fullName: z.string().min(1, "Ad soyad zorunlu.").max(220),
    phone: z.string().min(1, "Telefon zorunlu.").max(40),
    city: z.string().min(1, "Il zorunlu.").max(120),
    district: z.string().min(1, "Ilce zorunlu.").max(120),
    addressLine1: z.string().min(1, "Adres bilgisi zorunlu.").max(500),
    addressLine2: z.string().max(500).nullable().optional(),
    postalCode: z.string().max(40).nullable().optional(),
    isDefaultShipping: z.boolean().optional(),
    billingType: z.enum(["INDIVIDUAL", "CORPORATE"]).nullable().optional(),
    tckn: z.string().max(20).nullable().optional(),
    companyName: z.string().max(255).nullable().optional(),
    taxOffice: z.string().max(255).nullable().optional(),
    taxNumber: z.string().max(20).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.phone || !isValidTrPhone(value.phone)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["phone"], message: "Gecerli telefon girin." });
    }
    if (value.billingType === "INDIVIDUAL") {
      // Guncellemede maskeli/bos gelebilir; doluysa gecerli olmali.
      if (value.tckn && value.tckn.trim().length > 0 && !isValidTckn(value.tckn)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["tckn"], message: "Gecerli T.C. Kimlik No girin." });
      }
    } else if (value.billingType === "CORPORATE") {
      if (!value.companyName || value.companyName.trim().length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["companyName"], message: "Firma unvani zorunlu." });
      }
      if (!value.taxOffice || value.taxOffice.trim().length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["taxOffice"], message: "Vergi dairesi zorunlu." });
      }
      if (value.taxNumber && value.taxNumber.trim().length > 0 && !isValidTaxNumber(value.taxNumber)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["taxNumber"], message: "Gecerli vergi no girin." });
      }
    }
  });

/** Adres listesi/gosterimi (own account). TCKN/VKN MASKELI doner. */
export const customerAddressSchema = z.object({
  id: z.string().min(1),
  addressName: z.string(),
  fullName: z.string(),
  phone: z.string().nullable(),
  city: z.string(),
  district: z.string().nullable(),
  addressLine1: z.string(),
  addressLine2: z.string().nullable(),
  postalCode: z.string().nullable(),
  isDefaultShipping: z.boolean(),
  isDefaultBilling: z.boolean(),
  billingType: z.enum(["INDIVIDUAL", "CORPORATE"]).nullable(),
  tcknMasked: z.string().nullable(),
  companyName: z.string().nullable(),
  taxOffice: z.string().nullable(),
  taxNumberMasked: z.string().nullable(),
});

export const customerAddressListResponseSchema = z.object({
  data: z.array(customerAddressSchema),
});

/* ── IBAN ─────────────────────────────────────────────────────────────────── */

export const customerIbanInputSchema = z.object({
  accountHolderName: z.string().min(1, "Hesap sahibi adi zorunlu.").max(220),
  iban: z.string().min(1).max(40).refine((v) => isValidIban(v), "Gecerli IBAN girin."),
  isDefault: z.boolean().optional(),
});

/** IBAN listesi/gosterimi. Tam IBAN ASLA donmez; yalniz maskeli. */
export const customerIbanSchema = z.object({
  id: z.string().min(1),
  accountHolderName: z.string(),
  ibanMasked: z.string(),
  isDefault: z.boolean(),
});

export const customerIbanListResponseSchema = z.object({
  data: z.array(customerIbanSchema),
});

/* ── Tipler ───────────────────────────────────────────────────────────────── */

export type CustomerRegisterStartRequest = z.infer<typeof customerRegisterStartRequestSchema>;
export type CustomerOtpChallengeResponse = z.infer<typeof customerOtpChallengeResponseSchema>;
export type CustomerOtpVerifyRequest = z.infer<typeof customerOtpVerifyRequestSchema>;
export type CustomerRegisterCompleteRequest = z.infer<
  typeof customerRegisterCompleteRequestSchema
>;
export type CustomerLoginRequest = z.infer<typeof customerLoginRequestSchema>;
export type CustomerAccount = z.infer<typeof customerAccountSchema>;
export type CustomerSessionResponse = z.infer<typeof customerSessionResponseSchema>;
export type CustomerMeResponse = z.infer<typeof customerMeResponseSchema>;
export type CustomerSessionExtendResponse = z.infer<typeof customerSessionExtendResponseSchema>;
export type CustomerProfileUpdateRequest = z.infer<typeof customerProfileUpdateRequestSchema>;
export type CustomerPasswordChangeRequest = z.infer<typeof customerPasswordChangeRequestSchema>;
export type CustomerCommunicationPreference = z.infer<
  typeof customerCommunicationPreferenceSchema
>;
export type CustomerAddressInput = z.infer<typeof customerAddressInputSchema>;
export type CustomerAddress = z.infer<typeof customerAddressSchema>;
export type CustomerAddressListResponse = z.infer<typeof customerAddressListResponseSchema>;
export type CustomerIbanInput = z.infer<typeof customerIbanInputSchema>;
export type CustomerIban = z.infer<typeof customerIbanSchema>;
export type CustomerIbanListResponse = z.infer<typeof customerIbanListResponseSchema>;

/* ── Hesabim > Siparislerim (own account) ─────────────────────────────────── */

export const customerOrderStatusSchema = z.enum([
  "DRAFT",
  "PLACED",
  "CONFIRMED",
  "CANCELLED",
  "FULFILLED",
]);
export const customerOrderPaymentStatusSchema = z.enum([
  "UNPAID",
  "AUTHORIZED",
  "PAID",
  "REFUNDED",
]);
export const customerOrderFulfillmentStatusSchema = z.enum([
  "UNFULFILLED",
  "PARTIAL",
  "FULFILLED",
  "CANCELLED",
]);

/**
 * Sipariş kartı/arama satırı. `variantId` "tekrar satın al" için geçerli güncel
 * varyant referansını taşır (eski fiyata GÜVENİLMEZ; sepet çözümlemede güncel
 * katalogdan doğrulanır). `productSlug` müşteri-facing ürün bağlantısı içindir.
 */
export const customerOrderLineSummarySchema = z.object({
  variantId: z.string(),
  productSlug: z.string(),
  sku: z.string(),
  title: z.string(),
  variantTitle: z.string(),
  quantity: z.number().int().positive(),
  // Faz 3/Dilim 6b — Sipariş satırı thumbnail'i. ALLOWLIST: yalnız türetilmiş
  // (güncel ProductImage[position=0]) URL; kapaksız/görselsiz ürün → null.
  // Kozmetik (yasal snapshot DEĞİL) → güncel kapak gösterilir, snapshot YOK.
  // productId/mediaId/storageKey ASLA taşınmaz (gateway iç record'unda kalır).
  imageUrl: z.string().nullable(),
  // TODO-165 (ADR-252) — moda snapshot (immutable; fashion-dışı/eski satırda null).
  selectedColor: z.string().nullable().default(null),
  selectedColorHex: z.string().nullable().default(null),
  selectedSize: z.string().nullable().default(null),
  sizeSystem: z.string().nullable().default(null),
  swatchLabel: z.string().nullable().default(null),
  materialSummary: z.string().nullable().default(null),
  variantDisplayName: z.string().nullable().default(null),
});

export const customerOrderSummarySchema = z.object({
  orderNumber: z.string(),
  status: customerOrderStatusSchema,
  paymentStatus: customerOrderPaymentStatusSchema,
  fulfillmentStatus: customerOrderFulfillmentStatusSchema,
  currency: currencySchema,
  totalMinor: z.number().int().nonnegative(),
  itemCount: z.number().int().nonnegative(),
  lines: z.array(customerOrderLineSummarySchema),
  createdAt: z.string().datetime(),
  // TODO-135 — Hazırlanan gönderiyi ("Gönderi oluşturuldu") liste rozetinde
  // yansıtmak için TEMSİLİ kargo durumu; shipment yoksa null. Müşteri-güvenli:
  // yalnız DURUM enum'u taşınır (statusText/iç alan yok).
  shipmentStatus: orderSummaryShipmentStatusSchema.nullable().default(null),
  // TODO-169 (blocker #5/#8) — ORTAK iade özeti projeksiyonu. Teslim rozetini DEĞİŞTİRMEZ; iade
  // durumunu AYRI taşır. İade yoksa da pencere bilgisi (returnWindowEndsAt/windowState) döner.
  // Forward-ref (returnOrderSummarySchema bu dosyada aşağıda tanımlı) için z.lazy.
  returnSummary: z.lazy(() => returnOrderSummarySchema).nullable().default(null),
  // TODO-174 (ADR-275) — iptal uygunluğu özeti (CTA/mesaj kararı). İptal edilmiş siparişte provenance taşır.
  cancellationSummary: z.lazy(() => cancellationOrderSummarySchema).nullable().default(null),
});

export const customerOrderListResponseSchema = z.object({
  data: z.array(customerOrderSummarySchema),
});

export type CustomerOrderSummary = z.infer<typeof customerOrderSummarySchema>;
export type CustomerOrderListResponse = z.infer<typeof customerOrderListResponseSchema>;

/* ── Sipariş detayı (own account) ─────────────────────────────────────────────
 * Müşteri-facing dedicated detay route'unun (account/orders/[orderNumber]) veri
 * sözleşmesi. Yalnız KENDİ siparişi döner (başka müşteri → 404). Allowlist:
 * tutar kırılımı + satırlar + teslimat adresi + fatura özeti (taxId MASKELİ) +
 * ödeme GÜVENLİ alanları. PAN/CVC/token/hash ASLA dönmez. */
export const customerOrderDetailLineSchema = customerOrderLineSummarySchema.extend({
  unitPriceMinor: z.number().int().nonnegative(),
  lineTotalMinor: z.number().int().nonnegative(),
});

export const customerOrderAddressSummarySchema = z.object({
  fullName: z.string(),
  phone: z.string().nullable(),
  countryCode: z.string(),
  city: z.string(),
  district: z.string().nullable(),
  addressLine1: z.string(),
  addressLine2: z.string().nullable(),
  postalCode: z.string().nullable(),
});

export const customerOrderBillingSummarySchema = z.object({
  type: z.enum(["INDIVIDUAL", "CORPORATE"]),
  name: z.string().nullable(),
  companyName: z.string().nullable(),
  taxOffice: z.string().nullable(),
  // Bireysel: T.C. Kimlik No (MASKELİ); Kurumsal: vergi no (MASKELİ).
  taxId: z.string().nullable(),
});

/**
 * Ödeme GÜVENLİ alanları (F3B.2 PaymentAttempt allowlist). Yalnız türetilmiş
 * güvenli alanlar: kart markası + son 4 + taksit + güvenli sağlayıcı referansı.
 * Full PAN/CVC/token/hash ASLA bu yüzeyde yer almaz.
 */
export const customerOrderPaymentSummarySchema = z.object({
  // BUG-CART-004 — provider NULLABLE: store-credit (TODO-174B/ADR-282) ve manuel (ADR-098)
  // tahsilatların dış ödeme sağlayıcısı YOKTUR. Prisma `PaymentAttempt.provider` da nullable.
  // Eskiden zorunlu enum olması, store-credit ile ödenmiş siparişin detay ucunu 500'e düşürüp
  // storefront'ta yanlış ÜRÜN-404 ekranına yol açıyordu.
  provider: z.enum(["MOCK", "IYZICO", "STRIPE", "PAYTR", "GENERIC_REDIRECT"]).nullable(),
  // BUG-CART-004 — method Prisma `PaymentMethodType` ile hizalı (STORE_CREDIT dahil).
  method: z.enum(["CARD", "BANK_TRANSFER", "CASH_ON_DELIVERY", "PAYMENT_LINK", "STORE_CREDIT"]),
  cardBrand: z.string().nullable(),
  cardLast4: z.string().nullable(),
  installmentCount: z.number().int().positive(),
  transactionId: z.string().nullable(),
  threeDsApplied: z.boolean(),
  paidAt: z.string().datetime().nullable(),
});

/**
 * BUG-CART-005 — Ödeme DAĞILIMI (allocation) satırı. Mixed-payment siparişte (ör. mağaza
 * bakiyesi + kart) her BAŞARILI (settled: PAID/AUTHORIZED) ödeme kaynağı AYRI satır olur.
 * Kaynak = PaymentAttempt (finansal source-of-truth); order snapshot alanları TEK BAŞINA
 * otorite değildir. `sourceType` mevcut `PaymentMethodType` ile hizalı (UI i18n etiketine
 * çevirir — ham enum ekranda gösterilmez). maskedCard = kart markası + son 4 (varsa); raw
 * PAN/provider payload ASLA. Discount/coupon/campaign BURADA YER ALMAZ (ödeme kaynağı değil).
 * Gösterilen allocation'lar toplamı sipariş captured/paid toplamı ile eşleşir (invariant).
 */
export const customerOrderPaymentAllocationSchema = z.object({
  sourceType: z.enum(["CARD", "BANK_TRANSFER", "CASH_ON_DELIVERY", "PAYMENT_LINK", "STORE_CREDIT"]),
  amountMinor: z.number().int().nonnegative(),
  currency: currencySchema,
  cardBrand: z.string().nullable(),
  cardLast4: z.string().nullable(),
  provider: z.enum(["MOCK", "IYZICO", "STRIPE", "PAYTR", "GENERIC_REDIRECT"]).nullable(),
  installmentCount: z.number().int().positive(),
  paidAt: z.string().datetime().nullable(),
});
export type CustomerOrderPaymentAllocation = z.infer<typeof customerOrderPaymentAllocationSchema>;

/**
 * TODO-117 — Müşteri-facing kargo takip özeti. F3C.5 shipment domaininden TÜRETİLİR
 * ama ALLOWLIST'tir: yalnız müşteri-güvenli alanlar. SECRET/iç alan TAŞIMAZ
 * (barkod/ZPL, labelUrl, rawSafeJson, externalOrderId/ShipmentId, referenceId,
 * alıcı telefon/adres GÖSTERİLMEZ). ADR-045: "Kargoya verildi" otomatik üretilmez;
 * event konumu KESİN varış/teslim şubesi değildir → storefront "işlem noktası"
 * etiketi uygular. status/eventType değerleri shipmentStatusValueSchema /
 * shipmentEventTypeSchema ile aynıdır (modül sıralaması/TDZ nedeniyle burada inline).
 */
export const customerOrderShipmentStatusSchema = z.enum([
  "DRAFT",
  "ORDER_CREATED",
  "LABEL_PENDING",
  "LABEL_CREATED",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "DELIVERY_FAILED",
  "RETURNED",
  "CANCELLED",
  "FAILED",
]);

export const customerOrderShipmentEventSchema = z.object({
  eventType: z.enum([
    "CREATED",
    "ORDER_CREATED",
    "BARCODE_CREATED",
    "BARCODE_PENDING",
    "BARCODE_FAILED",
    "STATUS_CHANGED",
    "TRACKING_UPDATED",
    "MANUAL_TRACKING",
    // TODO-162 (ADR-101) — operatör manuel durum ilerletmesi.
    "MANUAL_STATUS",
    "CANCELLED",
    "WEBHOOK_RECEIVED",
  ]),
  statusText: z.string().nullable(),
  // ADR-045: kesin varış/teslim şubesi DEĞİL; UI "işlem noktası" etiketi uygular.
  location: z.string().nullable(),
  occurredAt: z.string().datetime().nullable(),
});

export const customerOrderShipmentSchema = z.object({
  // Sağlayıcı yalnız görünen ad + (opsiyonel) logo olarak gösterilir; PUBLIC, secret değil.
  providerName: z.string(),
  logoUrl: z.string().nullable(),
  logoAlt: z.string().nullable(),
  status: customerOrderShipmentStatusSchema,
  trackingNumber: z.string().nullable(),
  trackingUrl: z.string().nullable(),
  // En son işlem noktası (kesin varış konumu değil; ADR-045).
  lastLocation: z.string().nullable(),
  updatedAt: z.string().datetime(),
  events: z.array(customerOrderShipmentEventSchema),
});

export const customerOrderDetailSchema = z.object({
  orderNumber: z.string(),
  status: customerOrderStatusSchema,
  paymentStatus: customerOrderPaymentStatusSchema,
  fulfillmentStatus: customerOrderFulfillmentStatusSchema,
  currency: currencySchema,
  createdAt: z.string().datetime(),
  placedAt: z.string().datetime().nullable(),
  cancelledAt: z.string().datetime().nullable(),
  subtotalMinor: z.number().int().nonnegative(),
  discountMinor: z.number().int().nonnegative(),
  shippingMinor: z.number().int().nonnegative(),
  taxMinor: z.number().int().nonnegative(),
  totalMinor: z.number().int().nonnegative(),
  itemCount: z.number().int().nonnegative(),
  lines: z.array(customerOrderDetailLineSchema),
  shippingAddress: customerOrderAddressSummarySchema.nullable(),
  billing: customerOrderBillingSummarySchema.nullable(),
  payment: customerOrderPaymentSummarySchema.nullable(),
  // BUG-CART-005 — Ödeme DAĞILIMI (mixed-payment görünürlüğü). Her başarılı ödeme kaynağı
  // (mağaza bakiyesi + kart + …) ayrı satır. `payment` (tek özet) geriye-uyum için KORUNUR;
  // UI bu listeyi tercih eder. Ödeme yoksa boş dizi. Toplamı order captured/paid ile eşleşir.
  paymentAllocations: z.array(customerOrderPaymentAllocationSchema).default([]),
  // TODO-117 — Kargo takip özeti; shipment yoksa null.
  shipment: customerOrderShipmentSchema.nullable(),
  // TODO-125 — Sipariş anında seçilen kargo sağlayıcı/seçenek özeti; yoksa null.
  shippingSelection: orderShippingSelectionSchema.nullable(),
  // TODO-169 (blocker #6/#7/#8) — ORTAK iade özeti (pencere + aktivite + pending finansal etki).
  // Teslimat/finansal orijinal özeti DEĞİŞTİRMEZ; iade etkisini AYRI + "beklenen" olarak taşır.
  returnSummary: z.lazy(() => returnOrderSummarySchema).nullable().default(null),
  // TODO-174 (ADR-275) — iptal uygunluğu + provenance özeti (CTA/mesaj + iptal edilmiş sipariş detayı).
  cancellationSummary: z.lazy(() => cancellationOrderSummarySchema).nullable().default(null),
});

export const customerOrderDetailResponseSchema = z.object({
  order: customerOrderDetailSchema,
});

export type CustomerOrderDetailLine = z.infer<typeof customerOrderDetailLineSchema>;
export type CustomerOrderAddressSummary = z.infer<typeof customerOrderAddressSummarySchema>;
export type CustomerOrderBillingSummary = z.infer<typeof customerOrderBillingSummarySchema>;
export type CustomerOrderPaymentSummary = z.infer<typeof customerOrderPaymentSummarySchema>;
export type CustomerOrderShipmentEvent = z.infer<typeof customerOrderShipmentEventSchema>;
export type CustomerOrderShipment = z.infer<typeof customerOrderShipmentSchema>;
export type CustomerOrderDetail = z.infer<typeof customerOrderDetailSchema>;
export type CustomerOrderDetailResponse = z.infer<typeof customerOrderDetailResponseSchema>;

/* ── Store-admin müşteri dizini (F3B.3) ───────────────────────────────────────
 * Mağaza paneli müşteri listesi. PII minimizasyonu: hash/token/OTP ASLA dönmez;
 * adres yalnızca şehir/ilçe özeti taşır (TCKN/VKN/IBAN bu yüzeyde yer almaz). */
export const storeAdminCustomerStatusSchema = z.enum([
  "ACTIVE",
  "PASSIVE",
  "BLOCKED",
  "ARCHIVED",
  // TD-131 (ADR-149) — kişisel verileri silinmiş/anonimleştirilmiş terminal durum.
  "ERASED",
]);

export const storeAdminCustomerSummarySchema = z.object({
  id: z.string().min(1),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  fullName: z.string(),
  status: storeAdminCustomerStatusSchema,
  emailVerified: z.boolean(),
  phoneVerified: z.boolean(),
  // hasCredential=false => kimlik kaydı yok (misafir/parolasız); true => üye.
  hasCredential: z.boolean(),
  orderCount: z.number().int().nonnegative(),
  totalSpentMinor: z.number().int().nonnegative(),
  currency: currencySchema,
  lastOrderAt: z.string().datetime().nullable(),
  addressCount: z.number().int().nonnegative(),
  // Varsayılan adresin kısa özeti (örn. "İstanbul, Kadıköy"); tam adres/PII içermez.
  defaultAddressSummary: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export const storeAdminCustomerListResponseSchema = z.object({
  data: z.array(storeAdminCustomerSummarySchema),
  // TODO-159A (ADR-089) — ortak Data Grid meta'sı.
  pagination: adminListPaginationSchema,
});

/**
 * TODO-159A (ADR-089) — Müşteri dizini query sözleşmesi. Arama e-posta / ad /
 * soyad / telefon üzerinde çalışır (hepsi Customer kolonu; PII türetimi YOK).
 * `sortBy` allowlist: kayıt tarihi / isim. Sipariş sayısı-cirosu TÜRETİLMİŞ
 * alanlardır (aggregate) — sıralama allowlist'ine ALINMAZ (bkz. TD-092).
 */
export const adminCustomerListSortBySchema = z.enum(["createdAt", "firstName", "email"]);

export const adminCustomerListQuerySchema = adminListQueryBaseSchema.extend({
  sortBy: adminCustomerListSortBySchema.optional(),
  status: storeAdminCustomerStatusSchema.optional(),
  hasCredential: z.enum(["true", "false"]).optional(),
});

export type AdminCustomerListSortBy = z.infer<typeof adminCustomerListSortBySchema>;
export type AdminCustomerListQuery = z.infer<typeof adminCustomerListQuerySchema>;

export type StoreAdminCustomerStatus = z.infer<typeof storeAdminCustomerStatusSchema>;
export type StoreAdminCustomerSummary = z.infer<typeof storeAdminCustomerSummarySchema>;
export type StoreAdminCustomerListResponse = z.infer<typeof storeAdminCustomerListResponseSchema>;

/* ── Store-admin müşteri detay + yönetim (F3B.3) ───────────────────────────────
 * Dedicated detail route'unun (modal değil) veri sözleşmesi. account + agregalar +
 * adresler (TCKN/VKN MASKELİ) + IBAN (MASKELİ) + iletişim tercihleri + siparişler.
 * credential/session/OTP hash ASLA dönmez. */
export const storeAdminCustomerDetailSchema = z.object({
  id: z.string().min(1),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  fullName: z.string(),
  birthDate: z.string().nullable(),
  gender: customerGenderSchema.nullable(),
  status: storeAdminCustomerStatusSchema,
  emailVerified: z.boolean(),
  phoneVerified: z.boolean(),
  hasCredential: z.boolean(),
  orderCount: z.number().int().nonnegative(),
  totalSpentMinor: z.number().int().nonnegative(),
  currency: currencySchema,
  lastOrderAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

/**
 * Müşteri güvenlik / üyelik durumu (TODO-087). passwordHash/tokenHash/sessionToken
 * ASLA dönmez. activeSessionCount: revoke edilmemiş + süresi geçmemiş oturum sayısı.
 * passwordChangedAt: credential varsa son şifre değişimi; yoksa null.
 */
export const storeAdminCustomerSecuritySchema = z.object({
  hasCredential: z.boolean(),
  passwordChangedAt: z.string().datetime().nullable(),
  activeSessionCount: z.number().int().nonnegative(),
});

export const storeAdminCustomerDetailResponseSchema = z.object({
  customer: storeAdminCustomerDetailSchema,
  security: storeAdminCustomerSecuritySchema,
  addresses: z.array(customerAddressSchema),
  ibans: z.array(customerIbanSchema),
  communicationPreference: customerCommunicationPreferenceSchema,
  orders: z.array(customerOrderSummarySchema),
});

/**
 * Admin müşteri PATCH. Tüm alanlar opsiyonel (partial). status yalnızca
 * ACTIVE/PASSIVE/BLOCKED (ARCHIVED admin panelinden set edilmez). E-posta/telefon
 * admin tarafından değiştirilirse ilgili verifiedAt gateway'de null'a çekilir
 * ("admin verified override yok" yaklaşımı).
 */
export const storeAdminCustomerUpdateRequestSchema = z
  .object({
    firstName: z.string().max(120).nullable().optional(),
    lastName: z.string().max(120).nullable().optional(),
    email: z.string().email("Geçerli e-posta girin.").nullable().optional(),
    phone: z.string().max(40).nullable().optional(),
    status: z.enum(["ACTIVE", "PASSIVE", "BLOCKED"]).optional(),
    birthDate: z.string().date().nullable().optional(),
    gender: customerGenderSchema.nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "En az bir alan gönderin.")
  .superRefine((value, ctx) => {
    if (value.phone && value.phone.trim().length > 0 && !isValidTrPhone(value.phone)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["phone"], message: "Geçerli telefon girin." });
    }
  });

export type StoreAdminCustomerDetail = z.infer<typeof storeAdminCustomerDetailSchema>;
export type StoreAdminCustomerSecurity = z.infer<typeof storeAdminCustomerSecuritySchema>;
export type StoreAdminCustomerDetailResponse = z.infer<typeof storeAdminCustomerDetailResponseSchema>;
export type StoreAdminCustomerUpdateRequest = z.infer<typeof storeAdminCustomerUpdateRequestSchema>;

/* ── Store-admin müşteri oluşturma + credential yönetimi (TODO-087, ADR-035) ────
 * Admin panelden müşteri kaydı + opsiyonel üyelik (activation token) oluşturma ve
 * mevcut müşteride credential/oturum yönetimi. Admin KALICI ŞİFRE belirlemez;
 * activation/reset token üretir. Plain/raw token DB/log/event/snapshot'a YAZILMAZ;
 * yalnız üretim response'unda TEK SEFERLİK döner (mail provider yok — ADR-035).
 */

/** Admin müşteri oluşturma. fullName zorunlu; e-posta veya telefon en az biri
 *  zorunlu (üyelik/giriş tanımlayıcısı). createMembership=true ise ADMIN_ACTIVATION
 *  token üretilir ve tek seferlik kurulum linki döner. */
export const storeAdminCustomerCreateRequestSchema = z
  .object({
    fullName: z.string().min(1, "Ad soyad zorunlu.").max(220),
    email: z.string().email("Geçerli e-posta girin.").nullable().optional(),
    phone: z.string().max(40).nullable().optional(),
    status: z.enum(["ACTIVE", "PASSIVE", "BLOCKED"]).default("ACTIVE"),
    createMembership: z.boolean().default(false),
  })
  .superRefine((value, ctx) => {
    const hasEmail = Boolean(value.email && value.email.trim().length > 0);
    const hasPhone = Boolean(value.phone && value.phone.trim().length > 0);
    if (!hasEmail && !hasPhone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["email"],
        message: "E-posta veya telefon zorunlu.",
      });
    }
    if (hasPhone && !isValidTrPhone(value.phone as string)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["phone"], message: "Geçerli telefon girin." });
    }
  });

/** Üretim response'unda TEK SEFERLİK dönen kurulum jetonu. Raw token kalıcı yerde
 *  tutulmaz; istemciye yalnız bu yanıtla ulaşır ve admin UI'da bir kez gösterilir. */
export const storeAdminCredentialSetupSchema = z.object({
  token: z.string().min(1),
  purpose: z.enum(["ADMIN_ACTIVATION", "ADMIN_PASSWORD_RESET"]),
  expiresAt: z.string().datetime(),
});

export const storeAdminCustomerCreateResponseSchema = z.object({
  customer: storeAdminCustomerSummarySchema,
  setup: storeAdminCredentialSetupSchema.nullable(),
});

/** Mevcut müşteride credential/aktivasyon veya parola sıfırlama jetonu üretimi. */
export const storeAdminCredentialTokenResponseSchema = z.object({
  setup: storeAdminCredentialSetupSchema,
});

export const storeAdminRevokeSessionsResponseSchema = z.object({
  revokedCount: z.number().int().nonnegative(),
});

export type StoreAdminCustomerCreateRequest = z.infer<typeof storeAdminCustomerCreateRequestSchema>;
export type StoreAdminCredentialSetup = z.infer<typeof storeAdminCredentialSetupSchema>;
export type StoreAdminCustomerCreateResponse = z.infer<typeof storeAdminCustomerCreateResponseSchema>;
export type StoreAdminCredentialTokenResponse = z.infer<typeof storeAdminCredentialTokenResponseSchema>;
export type StoreAdminRevokeSessionsResponse = z.infer<typeof storeAdminRevokeSessionsResponseSchema>;

/* ── TD-131 (ADR-149…155) — Customer Data Erasure Workflow ─────────────────────
 * İki ayrı aksiyon: DEACTIVATE (PASSIVE, geri alınabilir) ve ERASE_PERSONAL_DATA
 * (ERASED terminal, geri alınamaz). Erasure önce dry-run (preview) sunar; apply
 * açık onay ifadesi + neden ister. Finansal/yasal kayıt korunur, kişisel+davranışsal
 * veri silinir/anonimleşir. Sunucu-otoriter: storeId path'ten, PII response'a çıkmaz. */

/** Silinecek/silinen tablo başına kayıt sayıları (dry-run count = apply deletedCount). */
export const storeAdminCustomerErasureDeleteCountsSchema = z.object({
  sessions: z.number().int().nonnegative(),
  credentials: z.number().int().nonnegative(),
  credentialTokens: z.number().int().nonnegative(),
  otpVerifications: z.number().int().nonnegative(),
  ibans: z.number().int().nonnegative(),
  communicationPreferences: z.number().int().nonnegative(),
  addresses: z.number().int().nonnegative(),
  coupons: z.number().int().nonnegative(),
  lists: z.number().int().nonnegative(),
  listItems: z.number().int().nonnegative(),
  reviewHelpfulVotes: z.number().int().nonnegative(),
  recentlyViewed: z.number().int().nonnegative(),
  recommendationEvents: z.number().int().nonnegative(),
});

export const storeAdminCustomerErasureAnonymizeCountsSchema = z.object({
  orders: z.number().int().nonnegative(),
  orderAddresses: z.number().int().nonnegative(),
  campaignRedemptions: z.number().int().nonnegative(),
});

export const storeAdminCustomerErasurePreserveCountsSchema = z.object({
  orders: z.number().int().nonnegative(),
  orderLines: z.number().int().nonnegative(),
  payments: z.number().int().nonnegative(),
  campaignRedemptions: z.number().int().nonnegative(),
});

/** Erasure dry-run raporu (YAZMA YOK). Kişisel alan DEĞERİ taşımaz — yalnız sayaç/alan-adı. */
export const storeAdminCustomerErasurePreviewResponseSchema = z.object({
  customerId: z.string(),
  status: z.enum(["ACTIVE", "PASSIVE", "BLOCKED", "ARCHIVED", "ERASED"]),
  alreadyErased: z.boolean(),
  erasedAt: z.string().datetime().nullable(),
  confirmationPhrase: z.string(),
  activeSessionCount: z.number().int().nonnegative(),
  openOrderCount: z.number().int().nonnegative(),
  delete: storeAdminCustomerErasureDeleteCountsSchema,
  deleteTotal: z.number().int().nonnegative(),
  anonymize: storeAdminCustomerErasureAnonymizeCountsSchema,
  preserve: storeAdminCustomerErasurePreserveCountsSchema,
  reviewsAnonymized: z.number().int().nonnegative(),
  anonymizedCustomerFields: z.array(z.string()),
  warnings: z.array(z.string()),
});

/** Erasure apply isteği — açık onay ifadesi (birebir) + neden zorunlu. */
export const storeAdminCustomerErasureApplyRequestSchema = z.object({
  confirmationPhrase: z.string().min(1, "Onay ifadesi zorunlu."),
  reason: z.string().trim().min(1, "Neden zorunlu.").max(500),
});

export const storeAdminCustomerErasureApplyResponseSchema = z.object({
  customerId: z.string(),
  status: z.literal("ERASED"),
  erasedAt: z.string().datetime(),
  alreadyErased: z.boolean(),
  deleted: storeAdminCustomerErasureDeleteCountsSchema,
  deleteTotal: z.number().int().nonnegative(),
  anonymized: storeAdminCustomerErasureAnonymizeCountsSchema,
  reviewsAnonymized: z.number().int().nonnegative(),
});

export const storeAdminCustomerDeactivateResponseSchema = z.object({
  customerId: z.string(),
  status: z.literal("PASSIVE"),
  revokedCount: z.number().int().nonnegative(),
});

export const storeAdminCustomerErasureStatusResponseSchema = z.object({
  customerId: z.string(),
  status: z.enum(["ACTIVE", "PASSIVE", "BLOCKED", "ARCHIVED", "ERASED"]),
  erased: z.boolean(),
  erasedAt: z.string().datetime().nullable(),
  erasedByUserId: z.string().nullable(),
  eraseReason: z.string().nullable(),
});

export type StoreAdminCustomerErasureDeleteCounts = z.infer<
  typeof storeAdminCustomerErasureDeleteCountsSchema
>;
export type StoreAdminCustomerErasurePreviewResponse = z.infer<
  typeof storeAdminCustomerErasurePreviewResponseSchema
>;
export type StoreAdminCustomerErasureApplyRequest = z.infer<
  typeof storeAdminCustomerErasureApplyRequestSchema
>;
export type StoreAdminCustomerErasureApplyResponse = z.infer<
  typeof storeAdminCustomerErasureApplyResponseSchema
>;
export type StoreAdminCustomerDeactivateResponse = z.infer<
  typeof storeAdminCustomerDeactivateResponseSchema
>;
export type StoreAdminCustomerErasureStatusResponse = z.infer<
  typeof storeAdminCustomerErasureStatusResponseSchema
>;

/** Storefront aktivasyon / parola belirleme (admin token'ı ile). Token tek
 *  seferlik; consumedAt sonrası reddedilir. Parola politikası kayıt ile aynı. */
export const customerActivateRequestSchema = z.object({
  token: z.string().min(1).max(512),
  password: customerPasswordSchema,
});

export const customerActivateResponseSchema = z.object({
  activated: z.boolean(),
});

export type CustomerActivateRequest = z.infer<typeof customerActivateRequestSchema>;
export type CustomerActivateResponse = z.infer<typeof customerActivateResponseSchema>;

/* ─────────────────────── F3C.1 Shipping provider foundation ───────────────────────
 * Magaza bazli opsiyonel kargo saglayici altyapisi. UI/domain dilinde "DHL eCommerce";
 * "MNG" yalniz teknik endpoint referansinda. Secret alanlar create/update REQUEST'inde
 * plain alinir; RESPONSE allowlist'tir — secret/ciphertext/JWT/customerPassword DONMEZ,
 * yalniz configured + maskedKey (son-4) + *Set boolean'lari doner.
 */
export const shippingProviderModeSchema = z.enum(["TEST", "LIVE"]);
export const shippingProviderStatusSchema = z.enum(["ENABLED", "DISABLED"]);
/**
 * TODO-094B — "kimlik bilgisi kayitli" ile "gercek baglanti dogrulandi" AYRI kavramlardir.
 * credentialStatus: credential'larin eksiksiz girilip girilmedigi (HTTP cagrisindan bagimsiz).
 * connectionStatus: SON gercek provider HTTP testinin sonucu. HTTP transport kapaliyken
 *   (SHIPPING_SANDBOX_HTTP_ENABLED=false) test ASLA OK donmez; HTTP_DISABLED doner.
 *   UNTESTED = henuz gercek test calistirilmadi.
 */
export const shippingCredentialStatusSchema = z.enum(["CONFIGURED", "INCOMPLETE", "MISSING"]);
export const shippingConnectionStatusSchema = z.enum([
  "UNTESTED",
  "OK",
  "FAILED",
  "HTTP_DISABLED",
  "SKIPPED",
]);
export const shippingCredentialTypeSchema = z.enum([
  "DEFAULT",
  "IDENTITY",
  "PLUS_COMMAND",
  "STANDARD_COMMAND",
  "STANDARD_QUERY",
  "BARCODE_COMMAND",
  "CBS_INFO",
  "BULK_QUERY",
  "FINANCE_QUERY",
]);

/** Credential CLIENT yaniti — ALLOWLIST. Secret/customerPassword/JWT DONMEZ. */
export const shippingCredentialSchema = z.object({
  type: shippingCredentialTypeSchema,
  configured: z.boolean(),
  maskedKey: z.string().nullable(),
  secretSet: z.boolean(),
  customerNumberSet: z.boolean(),
  customerPasswordSet: z.boolean(),
  identityType: z.number().int().nullable(),
  lastTestedAt: z.string().datetime().nullable(),
  lastTestStatus: z.string().nullable(),
  lastErrorCode: z.string().nullable(),
});

/** Turetilmis yetenekler — UI CTA'lari bunlara gore acilir/kapanir. */
export const shippingCapabilitiesSchema = z.object({
  canTestConnection: z.boolean(),
  canCalculateRate: z.boolean(),
  canCreateTestShipment: z.boolean(),
  canCreateOrder: z.boolean(),
  canCreateBarcode: z.boolean(),
  canPurchaseLabel: z.boolean(),
  destructiveActionsDisabledReason: z.string().nullable(),
});

export const shippingProviderConfigSchema = z.object({
  id: z.string().min(1),
  provider: shippingProviderTypeSchema,
  mode: shippingProviderModeSchema,
  status: shippingProviderStatusSchema,
  displayName: z.string().min(1),
  // F3C.5 (TODO-121) — public provider logo (secret DEGIL; client bundle'a guvenli gider).
  logoUrl: z.string().nullable().optional(),
  logoAlt: z.string().nullable().optional(),
  allowRecipientCreate: z.boolean(),
  allowOrderCreate: z.boolean(),
  allowBarcodeCreate: z.boolean(),
  allowLabelPurchase: z.boolean(),
  lastTestedAt: z.string().datetime().nullable(),
  lastTestStatus: z.string().nullable(),
  lastErrorCode: z.string().nullable(),
  // TODO-094B — credential "kayitli mi" vs gercek baglanti "test edildi mi" ayrimi.
  credentialStatus: shippingCredentialStatusSchema.optional(),
  connectionStatus: shippingConnectionStatusSchema.optional(),
  // TODO-104 — webhook secret+token kayitli mi (yalniz boolean; secret/token DONMEZ).
  webhookConfigured: z.boolean().optional(),
  // Son GERCEK provider HTTP testinin meta'si (transport kapaliyken null/HTTP_DISABLED).
  lastProviderHttpStatus: z.number().int().nullable().optional(),
  lastProviderTestType: z.string().nullable().optional(),
  lastProviderTestAt: z.string().datetime().nullable().optional(),
  lastProviderErrorCode: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  credentials: z.array(shippingCredentialSchema),
  capabilities: shippingCapabilitiesSchema,
});

export const shippingProviderConfigListResponseSchema = z.object({
  data: z.array(shippingProviderConfigSchema),
});

// F3C.5 — provider logo (public URL). Bos string ("") => TEMIZLE (null'a indir);
// undefined => KORU. Yalniz http(s) kabul edilir (javascript:/data: reddedilir).
const shippingLogoUrlSchema = z
  .string()
  .trim()
  .max(2000)
  .url()
  .refine((v) => /^https?:\/\//i.test(v), { message: "Logo URL http(s) olmalıdır." });
const shippingLogoAltSchema = z.string().trim().max(160);

export const shippingProviderConfigCreateRequestSchema = z.object({
  provider: shippingProviderTypeSchema,
  displayName: z.string().min(1).max(120),
  mode: shippingProviderModeSchema.default("TEST"),
  status: shippingProviderStatusSchema.default("DISABLED"),
  logoUrl: shippingLogoUrlSchema.nullable().optional(),
  logoAlt: shippingLogoAltSchema.nullable().optional(),
  allowRecipientCreate: z.boolean().default(false),
  allowOrderCreate: z.boolean().default(false),
  allowBarcodeCreate: z.boolean().default(false),
  allowLabelPurchase: z.boolean().default(false),
});

export const shippingProviderConfigUpdateRequestSchema = z
  .object({
    displayName: z.string().min(1).max(120).optional(),
    mode: shippingProviderModeSchema.optional(),
    status: shippingProviderStatusSchema.optional(),
    // "" => logo temizle; URL => degistir; undefined => koru (route uygular).
    logoUrl: z.union([shippingLogoUrlSchema, z.literal("")]).nullable().optional(),
    logoAlt: z.union([shippingLogoAltSchema, z.literal("")]).nullable().optional(),
    allowRecipientCreate: z.boolean().optional(),
    allowOrderCreate: z.boolean().optional(),
    allowBarcodeCreate: z.boolean().optional(),
    allowLabelPurchase: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "En az bir alan güncellenmelidir.",
  });

export const shippingProviderStatusUpdateRequestSchema = z.object({
  status: shippingProviderStatusSchema,
});

/**
 * Credential upsert REQUEST'i. Secret alanlar (key/secret/customerNumber/
 * customerPassword) yalniz BURADA plain alinir; server-side encrypt edilir.
 * identityType DHL IDENTITY icin (varsayilan 1). Bos string ("") gonderim ilgili
 * alani TEMIZLER; alan verilmezse (undefined) mevcut deger KORUNUR (route uygular).
 */
const optionalShippingSecretSchema = z.string().max(2000).nullable().optional();
export const shippingCredentialUpsertRequestSchema = z.object({
  type: shippingCredentialTypeSchema,
  key: optionalShippingSecretSchema,
  secret: optionalShippingSecretSchema,
  customerNumber: optionalShippingSecretSchema,
  customerPassword: optionalShippingSecretSchema,
  identityType: z.number().int().min(1).max(99).nullable().optional(),
});

/**
 * Baglanti testi yaniti. KRITIK (TODO-094B): `ok` yalnizca GERCEK provider HTTP
 * cagrisindan basarili yanit alindiginda true olur. Transport kapaliyken
 * (SHIPPING_SANDBOX_HTTP_ENABLED=false) `ok=false` + status="HTTP_DISABLED" doner;
 * "credential kayitli ama gercek cagri yapilmadi" anlamina gelir.
 */
export const shippingProviderTestResponseSchema = z.object({
  ok: z.boolean(),
  status: shippingConnectionStatusSchema,
  message: z.string(),
  testedAt: z.string().datetime(),
  /** Gercek HTTP cagrisi yapildiysa provider'in dondurdugu HTTP status; aksi halde null. */
  providerHttpStatus: z.number().int().nullable().optional(),
  /** Hangi gercek test calistirildi (or. IDENTITY_TOKEN, GEO_CITIES); yapilmadiysa null. */
  testType: z.string().nullable().optional(),
  errorCode: z.string().nullable().optional(),
});

/* ── Order detail shipping operasyonlari ── */
const shipmentPieceSchema = z.object({
  barcode: z.string().max(120).optional(),
  desi: z.number().nonnegative(),
  kg: z.number().nonnegative(),
  content: z.string().max(255).optional(),
});

const shipmentRecipientSchema = z.object({
  fullName: z.string().max(255).optional(),
  email: z.string().max(255).optional(),
  phone: z.string().max(40).optional(),
  cityCode: z.number().int().optional(),
  districtCode: z.number().int().optional(),
  cityName: z.string().max(120).optional(),
  districtName: z.string().max(120).optional(),
  address: z.string().max(1000).optional(),
});

export const shippingRateRequestSchema = z.object({
  providerConfigId: z.string().min(1),
  shipmentServiceType: z.number().int().optional(),
  packagingType: z.number().int().optional(),
  paymentType: z.number().int().optional(),
  pickUpType: z.number().int().optional(),
  deliveryType: z.number().int().optional(),
  recipient: shipmentRecipientSchema,
  pieces: z.array(shipmentPieceSchema).min(1),
});

export const shippingRateResponseSchema = z.object({
  amountMinor: z.number().int().nonnegative(),
  currency: currencySchema,
  breakdownSafe: z.record(z.number()).optional(),
});

/**
 * Cart/checkout provider kargo teklifi (quote) yaniti.
 *
 * Kritik ayrim: `source` teklif fiyatinin GERCEK kaynagini belirtir; UI bunu net
 * gostermelidir (DHL fiyati MOCK/sabit kural gibi gosterilmemeli):
 *  - DHL_ECOMMERCE  : gercek DHL Standard Query /calculate fiyati.
 *  - MOCK           : dev/test mock fiyati (DHL aktifken kullanICILMAZ).
 *  - STORE_FIXED_RULE: magaza sabit kargo kurali (provider quote DEGIL).
 * status=UNAVAILABLE ise amountMinor checkout total'a DAHIL EDILMEZ; UI "kargo
 * hesaplanamiyor" mesaji gosterir ve odeme adimina gecisi gerektiginde engeller.
 */
// F3C.2 — Kargo ucreti store TARIFE'sinden hesaplanir (provider quote DEGIL).
//  - STORE_SHIPPING_TARIFF: admin kargo tarife planindan hesaplanan ucret.
//  - STORE_FIXED_RULE      : eski sabit magaza kurali (geriye donuk fallback).
//  - MOCK                  : dev/test mock plani.
//  - DHL_ECOMMERCE         : (bu fazda kullanILMAZ; sema geriye donuk korunur).
export const shippingQuoteSourceSchema = z.enum([
  "DHL_ECOMMERCE",
  "MOCK",
  "STORE_FIXED_RULE",
  "STORE_SHIPPING_TARIFF",
]);
// status: OK=ucret hesaplandi; ADDRESS_REQUIRED=teslimat adresi gerekli;
// NO_RATE_PLAN=aktif/default tarife yok; RATE_NOT_FOUND=uygun kural yok;
// MISSING_DIMENSIONS=desi/kg olcumu eksik; UNAVAILABLE/ERROR=genel hata.
export const shippingQuoteStatusSchema = z.enum([
  "OK",
  "ADDRESS_REQUIRED",
  "NO_RATE_PLAN",
  "RATE_NOT_FOUND",
  "MISSING_DIMENSIONS",
  "UNAVAILABLE",
  "ERROR",
]);
/**
 * TODO-125 (ADR-047) — Checkout'ta SEÇİLEBİLİR tek kargo seçeneği. Bir seçenek =
 * AKTİF bir ShippingRatePlan (fiyat store TARİFE'sinden hesaplanır, ADR-044) +
 * (varsa) ENABLED ShippingProviderConfig'ten gelen taşıyıcı görünüm bilgisi.
 * PUBLIC/müşteri-güvenli ALLOWLIST: provider secret/credential/account no TAŞIMAZ;
 * yalnız görünen ad + (opsiyonel) public logo. priceMinor null => adres henüz
 * seçilmediği için fiyatlanamadı (available=false). available=true yalnız
 * fiyatlanabilir/uygun seçenekler içindir.
 */
export const shippingOptionSchema = z.object({
  /** Seçenek kimliği = ShippingRatePlan.id (checkout'a geri gönderilir). */
  optionId: z.string().min(1),
  /** Taşıyıcı kimliği (enum) — gevşek ilişki; null olabilir. */
  providerType: shippingProviderTypeSchema.nullable(),
  /** Taşıyıcı/sağlayıcı görünen adı (config displayName ya da güvenli fallback). */
  providerName: z.string().min(1),
  /** Hizmet/yöntem adı (= rate plan adı). */
  serviceName: z.string().min(1),
  /** Hesaplanan kargo ücreti (minor). Adres yoksa null. */
  priceMinor: z.number().int().nonnegative().nullable(),
  currency: currencySchema,
  freeShipping: z.boolean(),
  /** Tahmini teslim metni (ör. "2-3 iş günü"); yoksa null. */
  estimatedDelivery: z.string().nullable(),
  /** Public provider logo URL (secret DEĞİL); yoksa null → UI baş harf fallback. */
  logoUrl: z.string().nullable(),
  logoAlt: z.string().nullable(),
  /** Bu seçenek bu sepet/adres için seçilebilir mi (fiyatlandı + uygun). */
  available: z.boolean(),
});
export type ShippingOption = z.infer<typeof shippingOptionSchema>;

export const cartShippingQuoteResponseSchema = z.object({
  provider: shippingProviderTypeSchema.nullable(),
  source: shippingQuoteSourceSchema.nullable(),
  status: shippingQuoteStatusSchema,
  amountMinor: z.number().int().nonnegative().nullable(),
  currency: currencySchema.nullable(),
  ratePlanId: z.string().nullable(),
  ratePlanName: z.string().nullable(),
  freeShipping: z.boolean(),
  errorCode: z.string().nullable(),
  message: z.string().nullable(),
  calculatedAt: z.string().datetime().nullable(),
  // TODO-125 — Seçilebilir kargo seçenekleri + seçili seçenek. Üstteki alanlar
  // SEÇİLİ seçeneğin quote'unu yansıtır (geriye dönük uyumlu). options boşsa
  // seçenek yok (tek-plan eski davranış: options tek eleman + selectedOptionId dolu).
  options: z.array(shippingOptionSchema).default([]),
  selectedOptionId: z.string().nullable().default(null),
});
export type CartShippingQuoteResponse = z.infer<typeof cartShippingQuoteResponseSchema>;

export const shippingCreateOrderRequestSchema = z.object({
  providerConfigId: z.string().min(1),
  referenceId: z.string().min(1).max(120),
  shipmentServiceType: z.number().int().optional(),
  packagingType: z.number().int().optional(),
  paymentType: z.number().int().optional(),
  deliveryType: z.number().int().optional(),
  content: z.string().max(255).optional(),
  recipient: shipmentRecipientSchema,
  pieces: z.array(shipmentPieceSchema).min(1),
  // Destructive guard: canli order create yalniz bu true iken (+env+config izni).
  explicitConfirm: z.boolean().default(false),
});

export const shippingCreateBarcodeRequestSchema = z.object({
  providerConfigId: z.string().min(1),
  referenceId: z.string().min(1).max(120),
  packagingType: z.number().int().optional(),
  pieces: z.array(shipmentPieceSchema).min(1),
  explicitConfirm: z.boolean().default(false),
});

// F3C.3 — Gonderi olay tipi (DHL post-order operasyon timeline'i). rawSafeJson sanitize.
export const shipmentEventTypeSchema = z.enum([
  "CREATED",
  "ORDER_CREATED",
  "BARCODE_CREATED",
  // F3C.3 (ADR-045): createbarcode bos 200 → BARCODE_PENDING; varis sube/hat kodu
  // routing hatasi → BARCODE_FAILED (retryable; createOrder TEKRAR cagrilmaz).
  "BARCODE_PENDING",
  "BARCODE_FAILED",
  "STATUS_CHANGED",
  "TRACKING_UPDATED",
  // F3C.5 (TODO-121) — admin manuel takip no girisi (provider-agnostic aksiyon).
  "MANUAL_TRACKING",
  // TODO-124 — admin varis il/ilce eslemesi duzeltmesi (CBS kodlari snapshot'a yazildi).
  "DESTINATION_REPAIRED",
  // TODO-162 (ADR-101) — operatör manuel durum ilerletmesi (entegre süreç dışı teslim akışı).
  "MANUAL_STATUS",
  "CANCELLED",
  "WEBHOOK_RECEIVED",
]);

/**
 * F3C.3 (ADR-045) — normalize shipment durum degerleri. DRAFT…FAILED; "Kargoya
 * verildi" OTOMATIK turetilmez (ORDER_CREATED fiziksel teslim DEGIL). Named enum:
 * hem order-detay hem F3C.5 shipment list/detay DTO'larinda yeniden kullanilir.
 */
export const shipmentStatusValueSchema = z.enum([
  "DRAFT",
  "ORDER_CREATED",
  "LABEL_PENDING",
  "LABEL_CREATED",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "DELIVERY_FAILED",
  "RETURNED",
  "CANCELLED",
  "FAILED",
]);

// TODO-173 (ADR-274) — kargo yönü (shipmentListQuerySchema'dan önce tanımlı olmalı — TDZ).
export const shipmentDirectionSchema = z.enum([
  "OUTBOUND_TO_CUSTOMER",
  "CUSTOMER_RETURN_TO_STORE",
  "STORE_RETURN_TO_CUSTOMER",
]);
export type ShipmentDirectionValue = z.infer<typeof shipmentDirectionSchema>;

export const shipmentEventSchema = z.object({
  id: z.string(),
  eventType: shipmentEventTypeSchema,
  statusCode: z.number().int().nullable(),
  statusText: z.string().nullable(),
  location: z.string().nullable(),
  occurredAt: z.string().datetime().nullable(),
  trackingUrl: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export const shipmentSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  provider: shippingProviderTypeSchema,
  referenceId: z.string(),
  status: shipmentStatusValueSchema,
  externalOrderId: z.string().nullable(),
  externalShipmentId: z.string().nullable(),
  externalInvoiceId: z.string().nullable(),
  trackingNumber: z.string().nullable(),
  trackingUrl: z.string().nullable(),
  labelUrl: z.string().nullable(),
  // F3C.3 — operasyon paneli icin zengin alanlar (secret icermez).
  shipmentStatusCode: z.number().int().nullable(),
  // Barkod/ZPL etiketi olusturuldu mu (yalniz BOOLEAN; raw ZPL DB'ye yazilmaz/donmez).
  barcodeHasLabel: z.boolean(),
  recipientName: z.string().nullable(),
  // TODO-124 — varis eslemesi goruntuleme/onarim icin recipient SNAPSHOT'i (yalniz
  // store-admin API; musteri DTO'su degildir). Secret/raw saglayici verisi icermez.
  recipientCityCode: z.number().int().nullable(),
  recipientDistrictCode: z.number().int().nullable(),
  recipientCityName: z.string().nullable(),
  recipientDistrictName: z.string().nullable(),
  recipientAddress: z.string().nullable(),
  // TODO-124 — son barkod denemesinin SINIFLANDIRILMIS sanitize hata kodu (or.
  // DESTINATION_BRANCH_NOT_FOUND); basarili barkod/onarim sifirlar. TODO-123 girdisi.
  lastBarcodeErrorCode: z.string().nullable(),
  // TODO-123 — barkod retry/backoff operasyon durumu (admin gorunumu; secret icermez).
  // barcodeRetryBlockedReason: "DATA_FIX" (adres/varis eslemesi duzeltilmeli) | "TERMINAL"
  // (kalici/desteklenmeyen) | "MAX_ATTEMPTS" (transient limit doldu). null => bloklu degil.
  barcodeRetryCount: z.number().int(),
  barcodeNextRetryAt: z.string().datetime().nullable(),
  barcodeLastAttemptAt: z.string().datetime().nullable(),
  barcodeRetryBlockedReason: z.string().nullable(),
  // Son provider senkronu (en yeni STATUS/TRACKING event'inden turetilir).
  lastSyncedAt: z.string().datetime().nullable(),
  lastProviderStatus: z.string().nullable(),
  events: z.array(shipmentEventSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const orderShippingResponseSchema = z.object({
  shipments: z.array(shipmentSchema),
});

/* ─────────────────── F3C.3 DHL post-order operasyon admin aksiyonlari ───────────────────
 * Sipariş OLUSTUKTAN SONRA admin aksiyonu: createRecipient+createOrder (prepare) →
 * createbarcode → status/track sync. Checkout DHL'e operasyon cagrisi YAPMAZ (ADR-044).
 * referenceId backend'de order'dan turetilir; client'tan gelen provider/order id GUVENILMEZ.
 */
export const shippingPrepareRequestSchema = z.object({
  providerConfigId: z.string().min(1),
  shipmentServiceType: z.number().int().optional(),
  packagingType: z.number().int().optional(),
  paymentType: z.number().int().optional(),
  deliveryType: z.number().int().optional(),
  content: z.string().max(255).optional(),
  recipient: shipmentRecipientSchema,
  pieces: z.array(shipmentPieceSchema).min(1),
  // Destructive guard: canli createRecipient+createOrder yalniz bu true iken (+env+config izni).
  explicitConfirm: z.boolean().default(false),
});

export const shippingBarcodeActionRequestSchema = z.object({
  providerConfigId: z.string().min(1),
  packagingType: z.number().int().optional(),
  explicitConfirm: z.boolean().default(false),
});

export const shippingSyncRequestSchema = z.object({
  providerConfigId: z.string().min(1),
});

export const shippingCancelRequestSchema = z.object({
  providerConfigId: z.string().min(1),
  explicitConfirm: z.boolean().default(false),
});

export const shippingShipmentMutationResponseSchema = z.object({
  shipment: shipmentSchema,
  alreadyExisted: z.boolean().default(false),
});

/* ─────────────────── TODO-100/104 Shipping webhook + toplu tracking sync ───────────────────
 * Webhook, PLATFORM-NORMALIZE sozlesme kabul eder (ADR-048): saglayici/entegrasyon
 * katmani bu sekle donusturur. Uc, kullanici auth GEREKTIRMEZ ama her istekte
 * HMAC-SHA256 imza + timestamp zorunludur; token yalniz config cozumleme kimligidir.
 * Imza semasi: hex(HMAC_SHA256(secret, `${timestamp}.${rawBody}`)),
 * header'lar: x-shipping-signature + x-shipping-timestamp (unix saniye).
 */
export const shippingWebhookEventRequestSchema = z.object({
  /** Saglayici event kimligi — idempotency anahtari (yoksa payload hash kullanilir). */
  eventId: z.string().min(1).max(200).optional(),
  /** Gonderi eslestirme kimlikleri — en az biri gerekli (route uygular). */
  referenceId: z.string().min(1).max(200).optional(),
  trackingNumber: z.string().min(1).max(200).optional(),
  externalShipmentId: z.string().min(1).max(200).optional(),
  /** Saglayici durum kodu (0-7 normalize eslemesi; bilinmeyen kod durumu DEGISTIRMEZ). */
  statusCode: z.number().int().nullable().optional(),
  statusText: z.string().max(500).nullable().optional(),
  isDelivered: z.boolean().optional(),
  location: z.string().max(255).nullable().optional(),
  occurredAt: z.string().max(64).nullable().optional(),
  trackingUrl: z.string().max(2000).nullable().optional(),
});

/** Webhook ACK — ic detay/secret tasimayan minimal yanit. */
export const shippingWebhookAckResponseSchema = z.object({
  ok: z.boolean(),
  duplicate: z.boolean(),
  handled: z.boolean(),
});

/**
 * Webhook secret/token rotate yaniti. Secret yalniz BURADA, BIR KEZ plain doner
 * (ADR-035 deseni); config response'unda ASLA gorunmez. Kaybedilirse yeniden rotate.
 */
export const shippingWebhookRotateResponseSchema = z.object({
  webhookPath: z.string().min(1),
  webhookSecret: z.string().min(1),
  rotatedAt: z.string().datetime(),
});

/**
 * TODO-128 — Store-admin gorunur webhook teslimat sonucu (ShipmentWebhookInbox
 * projeksiyonu). KESIN ALLOWLIST: raw payload / imza / secret / payloadHash / tam
 * header ASLA yer almaz. Yalnizca gozlemlenebilirlik icin sanitize ozet alanlar.
 */
export const shippingWebhookOutcomeSchema = z.enum([
  "ACCEPTED",
  "IGNORED_UNKNOWN_SHIPMENT",
  "IGNORED_UNSUPPORTED",
]);

export const shippingWebhookEventSchema = z.object({
  id: z.string().min(1),
  provider: shippingProviderTypeSchema,
  // Saglayici event kimligi (evt:<id>) ya da payload sha256 ozeti (sha256:<hash>);
  // idempotency anahtaridir, geri cevrilemez, PII/secret icermez.
  eventKey: z.string().min(1),
  outcome: shippingWebhookOutcomeSchema,
  shipmentId: z.string().nullable(),
  statusCode: z.number().int().nullable(),
  // Sanitize durum ozeti (secret/imza/raw icermez).
  statusText: z.string().nullable(),
  receivedAt: z.string().datetime(),
});

/**
 * TODO-128 — Tekil saglayici webhook bilgi/gozlem ucu. Tam webhook URL'si YALNIZ bu
 * tekil, yetkili ucta doner (bulk config DTO'sunda token asla yer almaz). webhookUrl,
 * PUBLIC_WEBHOOK_BASE_URL tanimli VE token uretilmis ise doludur; aksi halde null.
 */
export const shippingWebhookInfoResponseSchema = z.object({
  webhookConfigured: z.boolean(),
  webhookUrl: z.string().nullable(),
  webhookBaseUrlConfigured: z.boolean(),
  events: z.array(shippingWebhookEventSchema),
});

/** Store-level toplu tracking sync (TODO-100 provider-agnostic runtime yolu). */
export const shipmentSyncAllRequestSchema = z.object({
  limit: z.number().int().min(1).max(50).default(20),
});

export const shipmentSyncAllResultSchema = z.object({
  shipmentId: z.string(),
  ok: z.boolean(),
  status: shipmentStatusValueSchema.nullable(),
  errorCode: z.string().nullable(),
});

export const shipmentSyncAllResponseSchema = z.object({
  scanned: z.number().int().nonnegative(),
  synced: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  results: z.array(shipmentSyncAllResultSchema),
});

/* ─────────────────── F3C.5 (TODO-121) Provider-agnostic shipment operasyon UI ───────────────────
 * Shipment = lojistik islem (Order'dan dogar). Bu DTO'lar store-level shipment LIST/DETAIL
 * ekranlarini ve generic (provider-agnostic) aksiyon yetkilerini besler. UI'da DHL/provider
 * adi yalniz displayName+logo olarak gorunur; buton/copy provider-spesifik DEGILDIR.
 * Secret/ZPL/token ASLA donmez (serialize allowlist; raw barkod yalniz boolean).
 */

/** Generic provider gorunum DTO'su (liste/detay/ozet kartinda). logo PUBLIC, secret degil. */
export const shipmentProviderInfoSchema = z.object({
  configId: z.string().nullable(),
  type: shippingProviderTypeSchema,
  displayName: z.string(),
  status: shippingProviderStatusSchema.nullable(),
  logoUrl: z.string().nullable(),
  logoAlt: z.string().nullable(),
});

/**
 * Generic (provider-agnostic) aksiyon yetenekleri — UI CTA'lari bunlara gore acilir/kapanir.
 * Provider capability (DHL/Geliver/MOCK) + shipment durumu birlikte projekte edilir.
 * disabledReason bir i18n hata KODudur (UI lokalize eder) ya da null.
 */
export const shipmentActionCapabilitiesSchema = z.object({
  canPrepare: z.boolean(),
  canCreateLabel: z.boolean(),
  canSync: z.boolean(),
  canCancel: z.boolean(),
  canManualTracking: z.boolean(),
  // TODO-124 — varis il/ilce eslemesi onarimi (yalniz DHL/MNG, barkod oncesi durumlar).
  canRepairDestination: z.boolean(),
  disabledReason: z.string().nullable(),
});

/** Shipment list satiri (ozet). Sipariş no + müşteri + provider + son event noktasi. */
export const shipmentListItemSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  orderNumber: z.string(),
  customerName: z.string().nullable(),
  provider: shipmentProviderInfoSchema,
  referenceId: z.string(),
  status: shipmentStatusValueSchema,
  trackingNumber: z.string().nullable(),
  trackingUrl: z.string().nullable(),
  barcodeHasLabel: z.boolean(),
  // Son hareketin tipi + "işlem noktası" (KESIN varis/teslimat subesi DEGIL — ADR-045).
  lastEventType: shipmentEventTypeSchema.nullable(),
  lastEventLocation: z.string().nullable(),
  lastProviderStatus: z.string().nullable(),
  lastSyncedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

/** KPI kartlari (sade MVP): hazirlanan / barkod bekleyen / transferde / teslim / sorunlu. */
export const shipmentListKpiSchema = z.object({
  prepared: z.number().int(),
  awaitingLabel: z.number().int(),
  inTransit: z.number().int(),
  delivered: z.number().int(),
  problem: z.number().int(),
});

export const shipmentListResponseSchema = z.object({
  data: z.array(shipmentListItemSchema),
  total: z.number().int(),
  kpi: shipmentListKpiSchema,
});

/** Liste filtre/sorgu parametreleri (gateway query string'inden coerce edilir). */
export const shipmentListQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  status: shipmentStatusValueSchema.optional(),
  provider: shippingProviderTypeSchema.optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  // Hizli filtreler: sorunlu / barkod bekleyen / teslim edilemeyen.
  flag: z.enum(["PROBLEM", "AWAITING_LABEL", "UNDELIVERABLE"]).optional(),
  // TODO-173 (ADR-274) — kargo yönü filtresi. Belirtilmezse operasyon listesi + KPI OUTBOUND_TO_
  // CUSTOMER'a düşer (normal gönderiler; reverse/customer-return SLA'yı kirletmez). Ayrı yönler
  // filtrelenebilir.
  direction: shipmentDirectionSchema.optional(),
  take: z.coerce.number().int().min(1).max(200).optional(),
  skip: z.coerce.number().int().min(0).optional(),
});

/** Shipment detay = shipment + order/müşteri baglami + generic provider + aksiyon yetkileri. */
export const shipmentDetailSchema = shipmentSchema.extend({
  orderNumber: z.string(),
  customerName: z.string().nullable(),
  customerEmail: z.string().nullable(),
  providerInfo: shipmentProviderInfoSchema,
  actions: shipmentActionCapabilitiesSchema,
});

export const shipmentDetailResponseSchema = z.object({
  shipment: shipmentDetailSchema,
});

/** Manuel takip no girisi (provider-agnostic; saglayiciya CAGRI YAPMAZ). */
export const shipmentManualTrackingRequestSchema = z.object({
  trackingNumber: z.string().trim().min(1).max(120),
  trackingUrl: z.string().trim().url().max(2000).optional(),
});

// TODO-162 (ADR-101) — Operatörün elle taşıyabileceği kargo hedef durumları (entegre
// süreç dışı teslim akışı). Sunucu ayrıca monotonic + terminal-kilit doğrular.
export const manualShipmentStatusTargetSchema = z.enum([
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "DELIVERY_FAILED",
  "RETURNED",
]);
export type ManualShipmentStatusTarget = z.infer<typeof manualShipmentStatusTargetSchema>;

/** Manuel kargo durumu güncelleme body'si. Not opsiyonel (timeline'a yazılır). */
export const shipmentStatusUpdateRequestSchema = z.object({
  status: manualShipmentStatusTargetSchema,
  note: z.string().trim().max(500).optional(),
});
export type ShipmentStatusUpdateRequest = z.infer<typeof shipmentStatusUpdateRequestSchema>;

/** create-label (barkod/etiket) generic aksiyon body'si. */
export const shipmentCreateLabelRequestSchema = z.object({
  packagingType: z.number().int().optional(),
  explicitConfirm: z.boolean().default(false),
});

/** cancel (gönderi kaydi iptali) generic aksiyon body'si — explicit onay zorunlu. */
export const shipmentCancelRequestSchema = z.object({
  explicitConfirm: z.boolean().default(false),
});

/* ─────────────────── TODO-124 CBS il/ilce eslemesi + varis onarimi ───────────────────
 * CBS listeleri store-admin dropdown'lari icindir (public/musteri ucu DEGIL). Onarim,
 * Shipment recipient SNAPSHOT'ini gunceller; siparis/musteri adresi MUTASYONA UGRAMAZ.
 * Kodlar sunucuda CBS listesine karsi YENIDEN dogrulanir (CBS_CODE_INVALID). */

export const shippingCbsCitySchema = z.object({
  code: z.string(),
  name: z.string(),
});

export const shippingCbsDistrictSchema = z.object({
  code: z.string(),
  name: z.string(),
  cityCode: z.string(),
});

export const shippingCbsCitiesResponseSchema = z.object({
  cities: z.array(shippingCbsCitySchema),
});

export const shippingCbsDistrictsRequestSchema = z.object({
  providerConfigId: z.string().min(1),
  cityCode: z.coerce.number().int().positive(),
});

export const shippingCbsDistrictsResponseSchema = z.object({
  districts: z.array(shippingCbsDistrictSchema),
});

/** Varis il/ilce eslemesi onarimi. Kodlar CBS'ten secilir; 0/negatif KABUL EDILMEZ. */
export const shipmentRepairDestinationRequestSchema = z.object({
  cityCode: z.number().int().positive(),
  districtCode: z.number().int().positive(),
  // Saglayiciya createRecipient yeniden iletimi icin onay (guard'larla birlikte).
  explicitConfirm: z.boolean().default(false),
});

/**
 * Onarim yaniti. providerResent=false ⇒ yerel duzeltme kaydedildi ama saglayiciya
 * yeniden iletim yapilamadi/reddedildi (providerErrorCode sanitize kod). Sahte basari
 * YOK: UI "mevcut kargo kaydini otomatik guncellemeyebilir" sinirlamasini gosterir.
 */
export const shipmentRepairDestinationResponseSchema = z.object({
  shipment: shipmentSchema,
  providerResent: z.boolean(),
  providerErrorCode: z.string().nullable(),
});

/* ─────────────────────── TODO-139 Sipariş teslimat adresi snapshot düzenleme ───────────────────────
 * Admin, siparişin teslimat adresi SNAPSHOT'ını (OrderAddress SHIPPING) — ve gönderi hâlâ
 * güvenli düzenlenebilir durumdaysa Shipment alıcı snapshot'ını — düzeltir. Bu MÜŞTERİ adres
 * defterini DEĞİL, yalnız bu siparişi etkiler. cityCode/districtCode CBS dropdown'undan seçilir
 * ve sunucuda CBS'e karşı YENİDEN doğrulanır (client değerine körü körüne güvenilmez); 0/negatif
 * ASLA kaydedilmez. Email allowlist'te DEĞİLDİR (OrderAddress'te yok + kimlik alanı; TODO-132
 * sunucu-otoriter e-posta çözümü korunur). */
export const shippingAddressUpdateRequestSchema = z.object({
  recipientName: z.string().min(1).max(220),
  recipientPhone: z.string().max(80).nullable().optional(),
  cityName: z.string().min(1).max(120),
  districtName: z.string().max(120).nullable().optional(),
  addressLine1: z.string().min(1).max(500),
  addressLine2: z.string().max(500).nullable().optional(),
  postalCode: z.string().max(40).nullable().optional(),
  countryCode: z.string().length(2).regex(/^[A-Z]{2}$/).optional(),
  // CBS dropdown'undan seçilen kargo il/ilçe kodu (opsiyonel). Sunucuda CBS ile doğrulanır.
  cityCode: z.number().int().positive().optional(),
  districtCode: z.number().int().positive().optional(),
  // Gönderi varsa sağlayıcıya createRecipient yeniden iletimi için onay (guard'larla birlikte).
  explicitConfirm: z.boolean().default(false),
});

/**
 * Yanıt: güncellenen sipariş teslimat adresi + (varsa) gönderi snapshot'ı + CBS/sağlayıcı
 * bayrakları. providerRepairSupported=false ⇒ sağlayıcı kayıt güncellemeyi desteklemiyor
 * (non-DHL). providerResent=false ⇒ yerel snapshot kaydedildi ama sağlayıcıya iletilemedi
 * (sahte başarı YOK; UI sınırlama kopyasını gösterir).
 */
export const shippingAddressUpdateResponseSchema = z.object({
  shippingAddress: orderAddressSchema,
  shipment: shipmentSchema.nullable(),
  cbsMatched: z.boolean(),
  providerRepairSupported: z.boolean(),
  providerResent: z.boolean(),
  providerErrorCode: z.string().nullable(),
});

/* ─────────────────────── F3C.2 Shipping rate plans (store tarife) ───────────────────────
 * Kargo ucreti SAGLAYICI quote'u DEGILDIR; magaza/admin tarife planindan hesaplanir
 * (ADR-044). Generic Tariff Engine: provider'a ozel fiyat kodu yok; DHL (tier=aylik
 * hacim) / Aras (zone=mesafe) / Yurtici fiyat listeleri ayni generic kurallara maplenir.
 * `provider` yalniz operasyon sağlayıcısıyla gevsek iliskilendirme icindir; fiyat etkisi YOK.
 */
export const shippingRatePlanStatusSchema = z.enum(["ACTIVE", "PASSIVE"]);
export const shippingRatePricingModeSchema = z.enum([
  "FIXED",
  "FREE_THRESHOLD",
  "DESI_TABLE",
  "WEIGHT_TABLE",
  "DESI_AND_REGION_TABLE",
]);
export const shippingRateSourceSchema = z.enum([
  "STORE_FIXED_RULE",
  "STORE_SHIPPING_TARIFF",
  "MOCK",
]);
export const shippingChargeTypeSchema = z.enum([
  "FLAT",
  "PER_KG",
  "PER_DESI",
  "PER_KG_OR_DESI",
  "PER_ADDITIONAL_KG_OR_DESI",
]);

const decimalStringSchema = z
  .number()
  .nonnegative()
  .nullable();

const codeSchema = z.string().min(1).max(40);

export const shippingRateRuleSchema = z.object({
  id: z.string().min(1),
  tierId: z.string().nullable(),
  zoneId: z.string().nullable(),
  minDesi: decimalStringSchema,
  maxDesi: decimalStringSchema,
  minWeightKg: decimalStringSchema,
  maxWeightKg: decimalStringSchema,
  cityCode: z.string().max(40).nullable(),
  districtCode: z.string().max(40).nullable(),
  regionCode: z.string().max(40).nullable(),
  chargeType: shippingChargeTypeSchema,
  amountMinor: z.number().int().nonnegative().nullable(),
  unitAmountMinor: z.number().int().nonnegative().nullable(),
  baseAmountMinor: z.number().int().nonnegative().nullable(),
  baseThreshold: decimalStringSchema,
  extraAmountMinor: z.number().int().nonnegative().nullable(),
  sortOrder: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

/**
 * chargeType zorunlu alan dogrulamasi (ADR-044): FLAT->amountMinor; PER_*->unitAmountMinor;
 * PER_ADDITIONAL_KG_OR_DESI ayrica baseAmountMinor + baseThreshold ister.
 */
const shippingRateRuleInputBaseSchema = z.object({
  tierId: z.string().nullable().optional(),
  zoneId: z.string().nullable().optional(),
  minDesi: z.number().nonnegative().nullable().optional(),
  maxDesi: z.number().nonnegative().nullable().optional(),
  minWeightKg: z.number().nonnegative().nullable().optional(),
  maxWeightKg: z.number().nonnegative().nullable().optional(),
  cityCode: z.string().max(40).nullable().optional(),
  districtCode: z.string().max(40).nullable().optional(),
  regionCode: z.string().max(40).nullable().optional(),
  chargeType: shippingChargeTypeSchema.default("FLAT"),
  amountMinor: z.number().int().nonnegative().nullable().optional(),
  unitAmountMinor: z.number().int().nonnegative().nullable().optional(),
  baseAmountMinor: z.number().int().nonnegative().nullable().optional(),
  baseThreshold: z.number().nonnegative().nullable().optional(),
  extraAmountMinor: z.number().int().nonnegative().nullable().optional(),
  sortOrder: z.number().int().min(0).max(100000).default(0),
});

export const shippingRateRuleInputSchema = shippingRateRuleInputBaseSchema
  .superRefine((val, ctx) => {
    if (val.chargeType === "FLAT") {
      if (val.amountMinor == null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["amountMinor"], message: "FLAT requires amountMinor" });
      }
    } else if (val.chargeType === "PER_ADDITIONAL_KG_OR_DESI") {
      if (val.baseAmountMinor == null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["baseAmountMinor"], message: "PER_ADDITIONAL requires baseAmountMinor" });
      }
      if (val.unitAmountMinor == null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["unitAmountMinor"], message: "PER_ADDITIONAL requires unitAmountMinor" });
      }
      if (val.baseThreshold == null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["baseThreshold"], message: "PER_ADDITIONAL requires baseThreshold" });
      }
    } else {
      // PER_KG / PER_DESI / PER_KG_OR_DESI -> unitAmountMinor zorunlu.
      if (val.unitAmountMinor == null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["unitAmountMinor"], message: `${val.chargeType} requires unitAmountMinor` });
      }
    }
  });

/** Kismi guncelleme: zorunlu-alan refine'i uygulanmaz (mevcut degerlerle birlesir). */
export const shippingRateRulePatchSchema = shippingRateRuleInputBaseSchema.partial();

export const shippingRateTierSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  monthlyShipmentMin: z.number().int().nonnegative().nullable(),
  monthlyShipmentMax: z.number().int().nonnegative().nullable(),
  sortOrder: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const shippingRateTierInputSchema = z
  .object({
    name: z.string().min(1).max(120),
    monthlyShipmentMin: z.number().int().nonnegative().nullable().optional(),
    monthlyShipmentMax: z.number().int().nonnegative().nullable().optional(),
    sortOrder: z.number().int().min(0).max(100000).default(0),
  })
  .superRefine((val, ctx) => {
    if (val.monthlyShipmentMin != null && val.monthlyShipmentMax != null && val.monthlyShipmentMin > val.monthlyShipmentMax) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["monthlyShipmentMax"], message: "min must be <= max" });
    }
  });

export const shippingRateZoneSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  minDistanceKm: decimalStringSchema,
  maxDistanceKm: decimalStringSchema,
  sortOrder: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const shippingRateZoneInputSchema = z
  .object({
    code: codeSchema,
    name: z.string().min(1).max(120),
    minDistanceKm: z.number().nonnegative().nullable().optional(),
    maxDistanceKm: z.number().nonnegative().nullable().optional(),
    sortOrder: z.number().int().min(0).max(100000).default(0),
  })
  .superRefine((val, ctx) => {
    if (val.minDistanceKm != null && val.maxDistanceKm != null && val.minDistanceKm > val.maxDistanceKm) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["maxDistanceKm"], message: "min must be <= max" });
    }
  });

const surchargeConditionSchema = z
  .object({
    minBillable: z.number().nonnegative().optional(),
    maxBillable: z.number().nonnegative().optional(),
    minSubtotalMinor: z.number().int().nonnegative().optional(),
    maxSubtotalMinor: z.number().int().nonnegative().optional(),
    zoneCode: z.string().max(40).optional(),
  })
  .nullable();

export const shippingSurchargeSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  chargeType: shippingChargeTypeSchema,
  amountMinor: z.number().int().nonnegative().nullable(),
  unitAmountMinor: z.number().int().nonnegative().nullable(),
  conditionJsonSafe: surchargeConditionSchema,
  isOptional: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const shippingSurchargeInputSchema = z
  .object({
    code: codeSchema,
    name: z.string().min(1).max(120),
    chargeType: shippingChargeTypeSchema.default("FLAT"),
    amountMinor: z.number().int().nonnegative().nullable().optional(),
    unitAmountMinor: z.number().int().nonnegative().nullable().optional(),
    conditionJsonSafe: surchargeConditionSchema.optional(),
    isOptional: z.boolean().default(false),
    sortOrder: z.number().int().min(0).max(100000).default(0),
  })
  .superRefine((val, ctx) => {
    if (val.chargeType === "FLAT") {
      if (val.amountMinor == null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["amountMinor"], message: "FLAT surcharge requires amountMinor" });
      }
    } else if (val.unitAmountMinor == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["unitAmountMinor"], message: `${val.chargeType} surcharge requires unitAmountMinor` });
    }
  });

export const shippingRatePlanSchema = z.object({
  id: z.string().min(1),
  provider: shippingProviderTypeSchema.nullable(),
  name: z.string().min(1),
  status: shippingRatePlanStatusSchema,
  isDefault: z.boolean(),
  pricingMode: shippingRatePricingModeSchema,
  currency: currencySchema,
  fixedAmountMinor: z.number().int().nonnegative().nullable(),
  freeShippingThresholdMinor: z.number().int().nonnegative().nullable(),
  // TODO-125 — Checkout seçenek kartında gösterilecek tahmini teslim metni (opsiyonel).
  deliveryEstimate: z.string().nullable(),
  validFrom: z.string().datetime().nullable(),
  validTo: z.string().datetime().nullable(),
  ruleCount: z.number().int().nonnegative(),
  rules: z.array(shippingRateRuleSchema),
  tiers: z.array(shippingRateTierSchema),
  zones: z.array(shippingRateZoneSchema),
  surcharges: z.array(shippingSurchargeSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const shippingRatePlanListResponseSchema = z.object({
  data: z.array(shippingRatePlanSchema),
});

export const shippingRatePlanCreateRequestSchema = z.object({
  provider: shippingProviderTypeSchema.nullable().optional(),
  name: z.string().min(1).max(160),
  status: shippingRatePlanStatusSchema.default("ACTIVE"),
  isDefault: z.boolean().default(false),
  pricingMode: shippingRatePricingModeSchema.default("FIXED"),
  currency: currencySchema.default("TRY"),
  fixedAmountMinor: z.number().int().nonnegative().nullable().optional(),
  freeShippingThresholdMinor: z.number().int().nonnegative().nullable().optional(),
  // TODO-125 — Tahmini teslim metni (ör. "2-3 iş günü"); checkout kartında gösterilir.
  deliveryEstimate: z.string().max(120).nullable().optional(),
  validFrom: z.string().datetime().nullable().optional(),
  validTo: z.string().datetime().nullable().optional(),
});

export const shippingRatePlanUpdateRequestSchema = shippingRatePlanCreateRequestSchema
  .partial()
  .extend({
    // name kismi guncellemede de bos olamaz.
    name: z.string().min(1).max(160).optional(),
  });

/* ─────────────────────── F3C.4 Tarife matrisi + CSV import ───────────────────────
 * Gercek kargo fiyat listelerini (DHL desi x Tarife I/II/III, Aras desi/kg x zone)
 * satir-satir kural eklemek yerine matris/grid mantigiyla girer. Backend AUTHORITATIVE:
 * frontend yalniz grid gonderir, backend upsert eder. Yalniz UPSERT (ADR-044 F3C.4):
 * eslesen kural update, yoksa create; bos hucre kural olusturmaz ve mevcudu silmez;
 * matris kapsami disindaki ozel/gelismis kurallar (city/district/region veya tier+zone)
 * KORUNUR. Provider'a ozel fiyat kodu yoktur; generic chargeType'a maplenir.
 */
export const shippingMatrixModeSchema = z.enum(["SEGMENT", "ZONE"]);
export const shippingMatrixAxisSchema = z.enum(["DESI", "WEIGHT"]);
/** 30+/"ve uzeri" satiri davranisi: sabit toplam ucret (FLAT) veya esik ustu birim. */
export const shippingMatrixOverflowSchema = z.enum(["FIXED", "PER_ADDITIONAL"]);

export const shippingMatrixCellInputSchema = z.object({
  // tierId (SEGMENT) veya zoneId (ZONE). Plan kapsami route'ta dogrulanir.
  columnId: z.string().min(1),
  // FLAT tutar veya PER_ADDITIONAL birim ucret (minor/kurus). null = bos hucre.
  amountMinor: z.number().int().nonnegative().nullable(),
  // Yalniz "ve uzeri" + PER_ADDITIONAL satirinda anlamli: esik alti taban ucret.
  baseAmountMinor: z.number().int().nonnegative().nullable().optional(),
});

export const shippingMatrixRowInputSchema = z.object({
  // Eksen alt/ust siniri (DESI veya WEIGHT). max=null => "ve uzeri" (overflow satiri).
  min: z.number().nonnegative().nullable(),
  max: z.number().nonnegative().nullable(),
  // Yalniz max=null satirinda: 30+ nasil islenir (varsayilan PER_ADDITIONAL).
  overflowBehavior: shippingMatrixOverflowSchema.default("PER_ADDITIONAL"),
  cells: z.array(shippingMatrixCellInputSchema),
});

export const shippingMatrixApplyRequestSchema = z.object({
  mode: shippingMatrixModeSchema,
  axis: shippingMatrixAxisSchema,
  // Beklenen kolon kimlikleri (sira korunur; route plan kapsamiyla dogrular).
  columns: z.array(z.string().min(1)).min(1),
  rows: z.array(shippingMatrixRowInputSchema).min(1),
});

export const shippingMatrixErrorSchema = z.object({
  rowIndex: z.number().int().nullable(),
  columnId: z.string().nullable(),
  code: z.string().min(1),
  message: z.string().min(1),
});

export const shippingMatrixCellDiffSchema = z.object({
  rowIndex: z.number().int(),
  columnId: z.string().min(1),
  action: z.enum(["CREATE", "UPDATE", "UNCHANGED", "EMPTY"]),
  existingRuleId: z.string().nullable(),
  chargeType: shippingChargeTypeSchema.nullable(),
  amountMinor: z.number().int().nonnegative().nullable(),
});

export const shippingMatrixSummarySchema = z.object({
  create: z.number().int().nonnegative(),
  update: z.number().int().nonnegative(),
  unchanged: z.number().int().nonnegative(),
  empty: z.number().int().nonnegative(),
});

export const shippingMatrixPreviewResponseSchema = z.object({
  valid: z.boolean(),
  summary: shippingMatrixSummarySchema,
  cells: z.array(shippingMatrixCellDiffSchema),
  errors: z.array(shippingMatrixErrorSchema),
});

export const shippingMatrixApplyResponseSchema = z.object({
  summary: shippingMatrixSummarySchema,
  plan: shippingRatePlanSchema,
});

/** CSV yapistir/import: ham metin server-side parse edilir (TR ondalik: 116,99 / ₺116,99). */
export const shippingImportRequestSchema = z.object({
  mode: shippingMatrixModeSchema,
  axis: shippingMatrixAxisSchema,
  csv: z.string().min(1).max(100_000),
});

export const shippingImportPreviewResponseSchema = z.object({
  valid: z.boolean(),
  rowCount: z.number().int().nonnegative(),
  summary: shippingMatrixSummarySchema,
  cells: z.array(shippingMatrixCellDiffSchema),
  errors: z.array(shippingMatrixErrorSchema),
});

export const shippingImportApplyResponseSchema = shippingMatrixApplyResponseSchema;

export type ShippingCredentialStatus = z.infer<typeof shippingCredentialStatusSchema>;
export type ShippingConnectionStatus = z.infer<typeof shippingConnectionStatusSchema>;
export type ShippingProviderConfigResponse = z.infer<typeof shippingProviderConfigSchema>;
export type ShippingProviderConfigListResponse = z.infer<typeof shippingProviderConfigListResponseSchema>;
export type ShippingProviderConfigCreateRequest = z.infer<typeof shippingProviderConfigCreateRequestSchema>;
export type ShippingProviderConfigUpdateRequest = z.infer<typeof shippingProviderConfigUpdateRequestSchema>;
export type ShippingProviderStatusUpdateRequest = z.infer<typeof shippingProviderStatusUpdateRequestSchema>;
export type ShippingCredentialUpsertRequest = z.infer<typeof shippingCredentialUpsertRequestSchema>;
export type ShippingProviderTestResponse = z.infer<typeof shippingProviderTestResponseSchema>;
export type ShippingRateRequest = z.infer<typeof shippingRateRequestSchema>;
export type ShippingRateResponse = z.infer<typeof shippingRateResponseSchema>;
export type ShippingCreateOrderRequest = z.infer<typeof shippingCreateOrderRequestSchema>;
export type ShippingCreateBarcodeRequest = z.infer<typeof shippingCreateBarcodeRequestSchema>;
export type OrderShippingResponse = z.infer<typeof orderShippingResponseSchema>;
export type ShipmentResponse = z.infer<typeof shipmentSchema>;
export type ShipmentEventResponse = z.infer<typeof shipmentEventSchema>;
export type ShipmentEventType = z.infer<typeof shipmentEventTypeSchema>;
export type ShippingPrepareRequest = z.infer<typeof shippingPrepareRequestSchema>;
export type ShippingBarcodeActionRequest = z.infer<typeof shippingBarcodeActionRequestSchema>;
export type ShippingSyncRequest = z.infer<typeof shippingSyncRequestSchema>;
export type ShippingCancelRequest = z.infer<typeof shippingCancelRequestSchema>;
export type ShippingShipmentMutationResponse = z.infer<typeof shippingShipmentMutationResponseSchema>;
export type ShipmentStatusValue = z.infer<typeof shipmentStatusValueSchema>;
// TODO-124 — CBS il/ilce listeleri + varis eslemesi onarimi.
export type ShippingCbsCity = z.infer<typeof shippingCbsCitySchema>;
export type ShippingCbsDistrict = z.infer<typeof shippingCbsDistrictSchema>;
export type ShippingCbsCitiesResponse = z.infer<typeof shippingCbsCitiesResponseSchema>;
export type ShippingCbsDistrictsRequest = z.infer<typeof shippingCbsDistrictsRequestSchema>;
export type ShippingCbsDistrictsResponse = z.infer<typeof shippingCbsDistrictsResponseSchema>;
export type ShipmentRepairDestinationRequest = z.infer<typeof shipmentRepairDestinationRequestSchema>;
export type ShipmentRepairDestinationResponse = z.infer<typeof shipmentRepairDestinationResponseSchema>;
// TODO-139 — sipariş teslimat adresi snapshot düzenleme.
export type ShippingAddressUpdateRequest = z.infer<typeof shippingAddressUpdateRequestSchema>;
export type ShippingAddressUpdateResponse = z.infer<typeof shippingAddressUpdateResponseSchema>;
// TODO-100/104 — shipping webhook + toplu tracking sync.
export type ShippingWebhookEventRequest = z.infer<typeof shippingWebhookEventRequestSchema>;
export type ShippingWebhookAckResponse = z.infer<typeof shippingWebhookAckResponseSchema>;
export type ShippingWebhookRotateResponse = z.infer<typeof shippingWebhookRotateResponseSchema>;
// TODO-128 — webhook yonetim/gozlem admin UI.
export type ShippingWebhookOutcomeContract = z.infer<typeof shippingWebhookOutcomeSchema>;
export type ShippingWebhookEvent = z.infer<typeof shippingWebhookEventSchema>;
export type ShippingWebhookInfoResponse = z.infer<typeof shippingWebhookInfoResponseSchema>;
export type ShipmentSyncAllRequest = z.infer<typeof shipmentSyncAllRequestSchema>;
export type ShipmentSyncAllResponse = z.infer<typeof shipmentSyncAllResponseSchema>;
// F3C.5 (TODO-121) — provider-agnostic shipment operasyon UI.
export type ShipmentProviderInfo = z.infer<typeof shipmentProviderInfoSchema>;
export type ShipmentActionCapabilities = z.infer<typeof shipmentActionCapabilitiesSchema>;
export type ShipmentListItem = z.infer<typeof shipmentListItemSchema>;
export type ShipmentListKpi = z.infer<typeof shipmentListKpiSchema>;
export type ShipmentListResponse = z.infer<typeof shipmentListResponseSchema>;
export type ShipmentListQuery = z.infer<typeof shipmentListQuerySchema>;
export type ShipmentDetail = z.infer<typeof shipmentDetailSchema>;
export type ShipmentDetailResponse = z.infer<typeof shipmentDetailResponseSchema>;
export type ShipmentManualTrackingRequest = z.infer<typeof shipmentManualTrackingRequestSchema>;
export type ShipmentCreateLabelRequest = z.infer<typeof shipmentCreateLabelRequestSchema>;
export type ShipmentCancelRequest = z.infer<typeof shipmentCancelRequestSchema>;
export type ShippingRatePlanStatus = z.infer<typeof shippingRatePlanStatusSchema>;
export type ShippingRatePricingMode = z.infer<typeof shippingRatePricingModeSchema>;
export type ShippingRateSource = z.infer<typeof shippingRateSourceSchema>;
export type ShippingChargeType = z.infer<typeof shippingChargeTypeSchema>;
export type ShippingRateRule = z.infer<typeof shippingRateRuleSchema>;
export type ShippingRateRuleInput = z.infer<typeof shippingRateRuleInputSchema>;
export type ShippingRateRulePatch = z.infer<typeof shippingRateRulePatchSchema>;
export type ShippingRateTier = z.infer<typeof shippingRateTierSchema>;
export type ShippingRateTierInput = z.infer<typeof shippingRateTierInputSchema>;
export type ShippingRateZone = z.infer<typeof shippingRateZoneSchema>;
export type ShippingRateZoneInput = z.infer<typeof shippingRateZoneInputSchema>;
export type ShippingSurcharge = z.infer<typeof shippingSurchargeSchema>;
export type ShippingSurchargeInput = z.infer<typeof shippingSurchargeInputSchema>;
export type ShippingRatePlanResponse = z.infer<typeof shippingRatePlanSchema>;
export type ShippingRatePlanListResponse = z.infer<typeof shippingRatePlanListResponseSchema>;
export type ShippingRatePlanCreateRequest = z.infer<typeof shippingRatePlanCreateRequestSchema>;
export type ShippingRatePlanUpdateRequest = z.infer<typeof shippingRatePlanUpdateRequestSchema>;
export type ShippingMatrixMode = z.infer<typeof shippingMatrixModeSchema>;
export type ShippingMatrixAxis = z.infer<typeof shippingMatrixAxisSchema>;
export type ShippingMatrixOverflow = z.infer<typeof shippingMatrixOverflowSchema>;
export type ShippingMatrixCellInput = z.infer<typeof shippingMatrixCellInputSchema>;
export type ShippingMatrixRowInput = z.infer<typeof shippingMatrixRowInputSchema>;
export type ShippingMatrixApplyRequest = z.infer<typeof shippingMatrixApplyRequestSchema>;
export type ShippingMatrixError = z.infer<typeof shippingMatrixErrorSchema>;
export type ShippingMatrixCellDiff = z.infer<typeof shippingMatrixCellDiffSchema>;
export type ShippingMatrixSummary = z.infer<typeof shippingMatrixSummarySchema>;
export type ShippingMatrixPreviewResponse = z.infer<typeof shippingMatrixPreviewResponseSchema>;
export type ShippingMatrixApplyResponse = z.infer<typeof shippingMatrixApplyResponseSchema>;
export type ShippingImportRequest = z.infer<typeof shippingImportRequestSchema>;
export type ShippingImportPreviewResponse = z.infer<typeof shippingImportPreviewResponseSchema>;
export type ShippingImportApplyResponse = z.infer<typeof shippingImportApplyResponseSchema>;
export type ShippingQuoteSource = z.infer<typeof shippingQuoteSourceSchema>;
export type ShippingQuoteStatus = z.infer<typeof shippingQuoteStatusSchema>;

/* ─────────────────────── F4A Campaigns & Coupons MVP (ADR-058) ───────────────────────
 * Indirim KAYNAK DOGRUSU sunucu tarafi motorudur (apps/api-gateway/src/campaigns).
 * Istemciden yalnizca kupon KODU alinir; indirim tutari/istatistigi istemciden
 * ASLA kabul edilmez. Kampanya/kupon store-scoped'tur; admin uclari platform
 * admin + store scope guard'iyla korunur. Public yanitlar ALLOWLIST'tir
 * (usage/musteri verisi ve ic kampanya metadata'si disari sizmaz).
 */
export const campaignStatusSchema = z.enum(["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"]);
/** BUY_X_GET_Y / FREE_SHIPPING / MEMBERSHIP_ONLY gelecek fazlar icin enum rezervi. */
export const campaignTypeSchema = z.enum([
  "COUPON_CODE",
  "AUTOMATIC_CART",
  "PRODUCT_DISCOUNT",
  "CATEGORY_DISCOUNT",
  "BUY_X_GET_Y",
  "FREE_SHIPPING",
  "MEMBERSHIP_ONLY",
]);
/** MVP'de olusturulabilir kampanya tipleri (rezerv tipler admin'den ACILAMAZ). */
export const campaignCreatableTypeSchema = z.enum([
  "COUPON_CODE",
  "AUTOMATIC_CART",
  "PRODUCT_DISCOUNT",
  "CATEGORY_DISCOUNT",
]);
export const campaignDiscountTypeSchema = z.enum(["PERCENT", "FIXED_AMOUNT"]);
export const couponStatusSchema = z.enum(["ACTIVE", "PAUSED", "ARCHIVED"]);

/** Kupon kodu: 2-40 karakter, [A-Za-z0-9_-]; sunucu locale-BAGIMSIZ uppercase'e normalize eder. */
export const couponCodeSchema = z
  .string()
  .min(2)
  .max(40)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]{1,39}$/, "Invalid coupon code format");

export const campaignCouponSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  normalizedCode: z.string().min(1),
  status: couponStatusSchema,
  totalUsageLimit: z.number().int().positive().nullable(),
  perCustomerUsageLimit: z.number().int().positive().nullable(),
  usageCount: z.number().int().nonnegative(),
  startsAt: z.string().datetime().nullable(),
  endsAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

/** Admin liste/detay kampanya govdesi (store-admin; secret icermez). */
export const campaignSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  status: campaignStatusSchema,
  type: campaignTypeSchema,
  discountType: campaignDiscountTypeSchema,
  discountValue: z.number().int().positive(),
  maxDiscountAmountMinor: z.number().int().positive().nullable(),
  minOrderAmountMinor: z.number().int().nonnegative().nullable(),
  startsAt: z.string().datetime().nullable(),
  endsAt: z.string().datetime().nullable(),
  totalUsageLimit: z.number().int().positive().nullable(),
  perCustomerUsageLimit: z.number().int().positive().nullable(),
  usageCount: z.number().int().nonnegative(),
  stackable: z.boolean(),
  priority: z.number().int(),
  isPublic: z.boolean(),
  // F4A.4 — Sunum alanlari (ADR-061); admin yuzeyi. isPublic accessModel'den turetilir.
  displayTitle: z.string().nullable(),
  shortDescription: z.string().nullable(),
  terms: z.string().nullable(),
  badgeLabel: z.string().nullable(),
  badgeVariant: campaignBadgeVariantSchema.nullable(),
  cardStyle: campaignCardStyleSchema,
  accessModel: campaignAccessModelSchema,
  displayPriority: z.number().int(),
  productIds: z.array(z.string().min(1)),
  categoryIds: z.array(z.string().min(1)),
  coupons: z.array(campaignCouponSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const campaignListResponseSchema = z.object({
  data: z.array(campaignSchema),
});

/** Son kullanim kayitlari (admin detay; e-posta MASKELI doner, PII sizdirmaz). */
/**
 * F4A.2 — Kampanya analitigi (ADR-059). Kaynak: immutable CampaignRedemption +
 * siparis snapshot alanlari (subtotal/total). Guncel kampanya tanimindan
 * YENIDEN HESAPLANMAZ; iptal/iade edilmis siparislerin kullanim kayitlari
 * tarihsel olarak dahildir.
 */
export const campaignAnalyticsSchema = z.object({
  redemptionCount: z.number().int().nonnegative(),
  uniqueCustomerCount: z.number().int().nonnegative(),
  totalDiscountMinor: z.number().int().nonnegative(),
  ordersSubtotalMinor: z.number().int().nonnegative(),
  ordersTotalMinor: z.number().int().nonnegative(),
  avgDiscountPerOrderMinor: z.number().int().nonnegative(),
  avgOrderTotalMinor: z.number().int().nonnegative(),
  lastRedemptionAt: z.string().datetime().nullable(),
});

export const campaignRedemptionSummarySchema = z.object({
  id: z.string().min(1),
  orderId: z.string().min(1),
  orderNumber: z.string().nullable(),
  couponCode: z.string().nullable(),
  maskedEmail: z.string().nullable(),
  discountAmountMinor: z.number().int().nonnegative(),
  /** F4A.2 — Siparisin genel toplami (siparis detay linki yaninda gosterim). */
  orderTotalMinor: z.number().int().nonnegative().nullable().default(null),
  createdAt: z.string().datetime(),
});

export const campaignDetailResponseSchema = campaignSchema.extend({
  recentRedemptions: z.array(campaignRedemptionSummarySchema),
  totalRedemptionCount: z.number().int().nonnegative(),
  totalDiscountMinor: z.number().int().nonnegative(),
  /** F4A.2 — Snapshot-tabanli kampanya analitigi (ADR-059). */
  analytics: campaignAnalyticsSchema,
});

const campaignBaseInputSchema = z.object({
  name: z.string().min(1).max(160),
  description: z.string().max(2000).nullable().optional(),
  type: campaignCreatableTypeSchema,
  discountType: campaignDiscountTypeSchema,
  discountValue: z.number().int().positive(),
  maxDiscountAmountMinor: z.number().int().positive().nullable().optional(),
  minOrderAmountMinor: z.number().int().nonnegative().nullable().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  totalUsageLimit: z.number().int().positive().nullable().optional(),
  perCustomerUsageLimit: z.number().int().positive().nullable().optional(),
  stackable: z.boolean().default(false),
  priority: z.number().int().min(-1000).max(1000).default(0),
  productIds: z.array(z.string().min(1)).max(200).default([]),
  categoryIds: z.array(z.string().min(1)).max(200).default([]),
  /** Yalniz type=COUPON_CODE icin zorunlu; kampanyanin ilk kupon kodu. */
  couponCode: couponCodeSchema.nullable().optional(),
  /* F4A.4 — Sunum alanlari (ADR-061). isPublic bunlardan (accessModel) TURETILIR;
   * admin isPublic'i ayri input olarak GONDERMEZ. Bu alanlar motoru ETKILEMEZ. */
  displayTitle: z.string().max(120).nullable().optional(),
  shortDescription: z.string().max(240).nullable().optional(),
  terms: z.string().max(2000).nullable().optional(),
  badgeLabel: z.string().max(40).nullable().optional(),
  badgeVariant: campaignBadgeVariantSchema.nullable().optional(),
  cardStyle: campaignCardStyleSchema.default("STANDARD"),
  accessModel: campaignAccessModelSchema.default("AUTO_VISIBLE"),
  displayPriority: z.number().int().min(-1000).max(1000).default(0),
});

function refineCampaignInput(
  value: {
    type?: string;
    discountType?: string;
    discountValue?: number;
    startsAt?: string | null;
    endsAt?: string | null;
    couponCode?: string | null;
  },
  ctx: z.RefinementCtx,
  options: { requireCouponCode: boolean },
) {
  if (value.discountType === "PERCENT" && value.discountValue !== undefined) {
    if (value.discountValue < 1 || value.discountValue > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["discountValue"],
        message: "Percent discount must be between 1 and 100.",
      });
    }
  }
  if (value.startsAt && value.endsAt && new Date(value.startsAt) >= new Date(value.endsAt)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endsAt"],
      message: "endsAt must be after startsAt.",
    });
  }
  if (options.requireCouponCode && value.type === "COUPON_CODE" && !value.couponCode) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["couponCode"],
      message: "couponCode is required for COUPON_CODE campaigns.",
    });
  }
}

export const campaignCreateRequestSchema = campaignBaseInputSchema.superRefine((value, ctx) =>
  refineCampaignInput(value, ctx, { requireCouponCode: true }),
);

/** Kismi guncelleme; type degistirilemez (kupon/kapsam tutarliligi icin). */
export const campaignUpdateRequestSchema = campaignBaseInputSchema
  .omit({ type: true, couponCode: true })
  .partial()
  .superRefine((value, ctx) => refineCampaignInput(value, ctx, { requireCouponCode: false }));

export const campaignStatusActionResponseSchema = z.object({
  id: z.string().min(1),
  status: campaignStatusSchema,
});

/* -------------------------------------------------------------------------- */
/* F4A.3 — Customer coupon wallet / assignment (admin) (ADR-060)              */
/* -------------------------------------------------------------------------- */

export const customerCouponStatusSchema = z.enum(["AVAILABLE", "APPLIED", "USED", "REVOKED"]);
export const customerCouponSourceSchema = z.enum([
  "ADMIN_ASSIGNED",
  "PUBLIC_CLAIMED",
  "CODE_CLAIMED",
]);

/**
 * F4A.3 — Kupon atama istegi. Bir mevcut musteri (customerId) VEYA bir email
 * hedeflenir; ikisi birden verilirse customerId oncelenir. Kupon bu store'a ait
 * ve ATANABILIR (kod tabanli) olmalidir. Sunucu store-scope/cross-store dogrular.
 */
export const couponAssignmentRequestSchema = z
  .object({
    couponId: z.string().min(1),
    customerId: z.string().min(1).nullable().optional(),
    email: z.string().email().max(320).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.customerId && !value.email) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customerId"],
        message: "Either customerId or email is required.",
      });
    }
  });

/**
 * F4A.3 — Admin cuzdan/atama kaydi (ALLOWLIST). Musteri email'i MASKELI doner;
 * kupon/kampanya ic sayaci/limiti TASINMAZ.
 */
export const customerCouponAssignmentSchema = z.object({
  id: z.string().min(1),
  couponId: z.string().min(1),
  couponCode: z.string().min(1),
  campaignId: z.string().min(1),
  campaignName: z.string().min(1),
  customerId: z.string().nullable(),
  customerName: z.string().nullable(),
  maskedEmail: z.string().nullable(),
  status: customerCouponStatusSchema,
  source: customerCouponSourceSchema,
  claimedAt: z.string().datetime(),
  appliedAt: z.string().datetime().nullable(),
  usedAt: z.string().datetime().nullable(),
  orderId: z.string().nullable(),
  orderNumber: z.string().nullable(),
});

export const customerCouponAssignmentListResponseSchema = z.object({
  data: z.array(customerCouponAssignmentSchema),
});

export type CampaignStatus = z.infer<typeof campaignStatusSchema>;
export type CampaignType = z.infer<typeof campaignTypeSchema>;
export type CampaignCreatableType = z.infer<typeof campaignCreatableTypeSchema>;
export type CampaignDiscountType = z.infer<typeof campaignDiscountTypeSchema>;
export type CouponStatus = z.infer<typeof couponStatusSchema>;
export type CampaignCoupon = z.infer<typeof campaignCouponSchema>;
export type CampaignResponse = z.infer<typeof campaignSchema>;
export type CampaignListResponse = z.infer<typeof campaignListResponseSchema>;
export type CampaignRedemptionSummary = z.infer<typeof campaignRedemptionSummarySchema>;
export type CampaignAnalytics = z.infer<typeof campaignAnalyticsSchema>;
export type CampaignDetailResponse = z.infer<typeof campaignDetailResponseSchema>;
export type CampaignCreateRequest = z.infer<typeof campaignCreateRequestSchema>;
export type CampaignUpdateRequest = z.infer<typeof campaignUpdateRequestSchema>;
export type CampaignStatusActionResponse = z.infer<typeof campaignStatusActionResponseSchema>;
export type PublicCouponReason = z.infer<typeof publicCouponReasonSchema>;
export type PublicCartDiscountLine = z.infer<typeof publicCartDiscountLineSchema>;
export type PublicCampaignDisplayKind = z.infer<typeof publicCampaignDisplayKindSchema>;
export type PublicCouponAction = z.infer<typeof publicCouponActionSchema>;
export type PublicWalletCoupon = z.infer<typeof publicWalletCouponSchema>;
export type PublicWalletCouponState = z.infer<typeof publicWalletCouponStateSchema>;
export type PublicWalletCouponSource = z.infer<typeof publicWalletCouponSourceSchema>;
export type PublicCouponClaimRequest = z.infer<typeof publicCouponClaimRequestSchema>;
export type PublicCouponClaimResponse = z.infer<typeof publicCouponClaimResponseSchema>;
export type PublicCouponCenterState = z.infer<typeof publicCouponCenterStateSchema>;
export type PublicCouponCenterCoupon = z.infer<typeof publicCouponCenterCouponSchema>;
export type PublicCouponCenterResponse = z.infer<typeof publicCouponCenterResponseSchema>;
export type CustomerCouponStatus = z.infer<typeof customerCouponStatusSchema>;
export type CustomerCouponSource = z.infer<typeof customerCouponSourceSchema>;
export type CouponAssignmentRequest = z.infer<typeof couponAssignmentRequestSchema>;
export type CustomerCouponAssignment = z.infer<typeof customerCouponAssignmentSchema>;
export type CustomerCouponAssignmentListResponse = z.infer<
  typeof customerCouponAssignmentListResponseSchema
>;

// ADR-065 — Site-geneli gorsel yonetimi (Faz 1). Yuklenen gorselin public gorunumu.
// GUVENLIK (allowlist): storageKey / checksum / createdBy gibi ic alanlar bu semaya
// SIZMAZ; yalniz turetilmis `url` (resolveMediaUrl) ve gorunur meta tasinir.
export const mediaAssetSchema = z.object({
  id: z.string().min(1),
  context: z.enum(["PRODUCT", "CATEGORY", "HERO", "BRANDING"]),
  url: z.string(),
  mimeType: z.string(),
  byteSize: z.number().int().nonnegative(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  altText: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export const mediaUploadResponseSchema = z.object({ data: mediaAssetSchema });

// ADR-065 Faz 2 (Dilim 1) — Media kutuphane listesi. Yeniden yukleme yerine
// var olan gorseli baska entity'ye baglamak icin store'un gorsellerini dondurur.
//
// TODO-159B (ADR-090) — TD-095 KAPANDI: sabit `take: 100` kaldirildi. Uc artik
// ortak Data Grid pagination meta'sini (ADR-089) dondurur; legacy {limit,offset,
// total} ucluler KORUNUR, uzerine page/pageSize/totalItems/totalPages EKLENIR.
export const mediaContextSchema = z.enum(["PRODUCT", "CATEGORY", "HERO", "BRANDING"]);

export const mediaListResponseSchema = z.object({
  data: z.array(mediaAssetSchema),
  pagination: adminListPaginationSchema,
});

/**
 * TODO-159B (ADR-090) — Medya kutuphanesi query sozlesmesi.
 *
 * Siralama allowlist'i MODELDE VAR OLAN alanlarla sinirlidir: `createdAt`
 * (yukleme tarihi), `altText` (kullaniciya gorunen ad) ve `byteSize`. Dosya adi
 * kolonu YOKTUR — `storageKey` sunucu uretimi opak bir yoldur ve response'a
 * sizmaz (ADR-065 allowlist); bu yuzden "isim" araması/siralaması `altText`
 * uzerindedir.
 *
 * `mimeType` filtresi BILINCLI olarak YOKTUR: yukleme yolu her gorseli sunucuda
 * image/webp'e normalize eder, dolayisiyla tek degerli sahte bir daraltma olurdu.
 * Gercek ayrim `context`tir (kullanim alani).
 */
export const adminMediaListSortBySchema = z.enum(["createdAt", "altText", "byteSize"]);

export const adminMediaListQuerySchema = adminSelectorQueryBaseSchema.extend({
  sortBy: adminMediaListSortBySchema.optional(),
  context: mediaContextSchema.optional(),
});

export type MediaContext = z.infer<typeof mediaContextSchema>;
export type MediaAssetResponse = z.infer<typeof mediaAssetSchema>;
export type MediaUploadResponse = z.infer<typeof mediaUploadResponseSchema>;
export type MediaListResponse = z.infer<typeof mediaListResponseSchema>;
export type AdminMediaListSortBy = z.infer<typeof adminMediaListSortBySchema>;
export type AdminMediaListQuery = z.infer<typeof adminMediaListQuerySchema>;

// ─────────────────────── TODO-155.2 — PAYLAŞILAN Kampanya Rozet Değerlendiricisi (SAF) ───────────────────────
//
// F4A "tek formül" (ADR-062) ilkesinin PAYLAŞILAN çekirdeği. Daha önce api-gateway'e ait olan
// `selectPublicCampaignDisplay` + `CampaignRecord` tipleri buraya TAŞINDI ki HEM api-gateway (PDP/PLP detay
// yanıtı) HEM search-service (index-anı rozet snapshot'ı) AYNI saf değerlendiriciyi kullansın → PDP ↔ PLP
// ticari sunum tutarlılığı (kaynak ayrımı korunur: checkout nihai fiyat otoritesidir, bu YALNIZ gösterim).
//
// SAF: I/O yok, Prisma yok, `now` PARAMETREdir → deterministik + birim-test edilebilir. Public allowlist:
// yalnız PublicCampaignBadge alanları sızar (iç id/limit/priority/stackable/usageCount TAŞINMAZ).

/** Değerlendiriciye giren kupon kaydı (store-scoped yüklenmiş; iç kimlik dahil — public'e SIZMAZ). */
export interface CampaignCouponRecord {
  id: string;
  code: string;
  normalizedCode: string;
  status: CouponStatus;
  totalUsageLimit: number | null;
  perCustomerUsageLimit: number | null;
  usageCount: number;
  startsAt: Date | null;
  endsAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Değerlendiriciye giren kampanya kaydı (store-scoped yüklenmiş). Public projeksiyon buradan TÜRETİLİR. */
export interface CampaignRecord {
  id: string;
  storeId: string;
  name: string;
  description: string | null;
  status: CampaignStatus;
  type: CampaignType;
  discountType: CampaignDiscountType;
  discountValue: number;
  maxDiscountAmountMinor: number | null;
  minOrderAmountMinor: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  totalUsageLimit: number | null;
  perCustomerUsageLimit: number | null;
  usageCount: number;
  stackable: boolean;
  priority: number;
  isPublic: boolean;
  /** F4A.4 — SUNUM alanları (ADR-061); motor bunları KULLANMAZ. */
  displayTitle: string | null;
  shortDescription: string | null;
  terms: string | null;
  badgeLabel: string | null;
  badgeVariant: CampaignBadgeVariant | null;
  cardStyle: CampaignCardStyle;
  accessModel: CampaignAccessModel;
  displayPriority: number;
  productIds: string[];
  categoryIds: string[];
  coupons: CampaignCouponRecord[];
  createdAt: Date;
  updatedAt: Date;
}

/** Rozet üretebilen kampanya tipleri (checkout motoruyla AYNI MVP kümesi). */
const CAMPAIGN_BADGE_TYPES: ReadonlySet<CampaignType> = new Set([
  "COUPON_CODE",
  "AUTOMATIC_CART",
  "PRODUCT_DISCOUNT",
  "CATEGORY_DISCOUNT",
]);

/** F4A.4 — Kampanya kaydından PUBLIC-SAFE sunum alan paketini çıkarır (ADR-061). İç alan GİRMEZ. */
export function toCouponDisplayFields(campaign: CampaignRecord): CouponDisplayFields {
  return {
    displayTitle: campaign.displayTitle,
    shortDescription: campaign.shortDescription,
    badgeLabel: campaign.badgeLabel,
    badgeVariant: campaign.badgeVariant,
    cardStyle: campaign.cardStyle,
    terms: campaign.terms,
  };
}

function campaignWithinWindow(campaign: CampaignRecord, now: Date): boolean {
  if (campaign.startsAt && now.getTime() < campaign.startsAt.getTime()) return false;
  if (campaign.endsAt && now.getTime() > campaign.endsAt.getTime()) return false;
  return true;
}

/** Rozet adayı mı? ACTIVE + public + tip destekli + pencere içinde + limiti dolmamış + (kupon ise ACTIVE kupon). */
export function isBadgeEligible(campaign: CampaignRecord, now: Date): boolean {
  if (campaign.status !== "ACTIVE") return false;
  if (!campaign.isPublic) return false;
  if (!CAMPAIGN_BADGE_TYPES.has(campaign.type)) return false;
  if (!campaignWithinWindow(campaign, now)) return false;
  if (campaign.totalUsageLimit !== null && campaign.usageCount >= campaign.totalUsageLimit) return false;
  if (campaign.type === "COUPON_CODE") {
    if (!campaign.coupons.some((coupon) => coupon.status === "ACTIVE")) return false;
  }
  return true;
}

/** Kampanya kapsamı bu ürünü içeriyor mu? Boş kapsam = tüm ürünler. */
export function campaignAppliesToProduct(
  campaign: CampaignRecord,
  product: { id: string; categoryIds: string[] },
): boolean {
  const hasScope = campaign.productIds.length > 0 || campaign.categoryIds.length > 0;
  if (!hasScope) return true;
  if (campaign.productIds.includes(product.id)) return true;
  return product.categoryIds.some((categoryId) => campaign.categoryIds.includes(categoryId));
}

function compareCampaigns(a: CampaignRecord, b: CampaignRecord): number {
  if (a.priority !== b.priority) return b.priority - a.priority;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function selectPublicCouponCode(campaign: CampaignRecord, now: Date): string | null {
  const coupon = campaign.coupons.find((item) => {
    if (item.status !== "ACTIVE") return false;
    if (item.startsAt && now.getTime() < item.startsAt.getTime()) return false;
    if (item.endsAt && now.getTime() > item.endsAt.getTime()) return false;
    if (item.totalUsageLimit !== null && item.usageCount >= item.totalUsageLimit) return false;
    return true;
  });
  return coupon?.code ?? null;
}

function effectiveCampaignEndsAt(campaign: CampaignRecord, coupon: CampaignCouponRecord | null): Date | null {
  const ends = [campaign.endsAt, coupon?.endsAt ?? null].filter((d): d is Date => d instanceof Date);
  if (ends.length === 0) return null;
  return ends.reduce((min, d) => (d.getTime() < min.getTime() ? d : min));
}

/**
 * F4A.6 (ADR-062) — Otomatik sepet indiriminin GÜVENLİ birim-başı tahmini. Yalnız PERCENT + tek-fiyatlı ürün
 * (unitPriceMinor bilinir) + (minOrder yok ya da tek birim eşiği karşılar). Aksi null (sahte fiyat ÜRETİLMEZ).
 * Checkout motoruyla AYNI formül: round(unit*yüzde), maxDiscount cap, birim fiyatla sınırla. FIXED_AMOUNT → null.
 */
export function computeAutomaticEstimate(
  campaign: CampaignRecord,
  unitPriceMinor: number | null,
): { estimatedDiscountMinor: number | null; estimatedFinalUnitPriceMinor: number | null } {
  const none = { estimatedDiscountMinor: null, estimatedFinalUnitPriceMinor: null };
  if (unitPriceMinor === null || unitPriceMinor <= 0) return none;
  if (campaign.discountType !== "PERCENT") return none;
  if (campaign.minOrderAmountMinor !== null && unitPriceMinor < campaign.minOrderAmountMinor) return none;
  let discount = Math.round((unitPriceMinor * campaign.discountValue) / 100);
  if (campaign.maxDiscountAmountMinor !== null) discount = Math.min(discount, campaign.maxDiscountAmountMinor);
  discount = Math.max(0, Math.min(discount, unitPriceMinor));
  if (discount <= 0) return none;
  return { estimatedDiscountMinor: discount, estimatedFinalUnitPriceMinor: unitPriceMinor - discount };
}

function buildCampaignBadge(
  winner: CampaignRecord,
  now: Date,
  unitPriceMinor: number | null,
): PublicCampaignBadge {
  const isCoupon = winner.type === "COUPON_CODE";
  const couponCode = isCoupon ? selectPublicCouponCode(winner, now) : null;
  const activeCoupon = isCoupon ? (winner.coupons.find((c) => c.code === couponCode) ?? null) : null;
  const estimate = isCoupon
    ? { estimatedDiscountMinor: null, estimatedFinalUnitPriceMinor: null }
    : computeAutomaticEstimate(winner, unitPriceMinor);
  const endsAt = effectiveCampaignEndsAt(winner, activeCoupon);
  return {
    kind: isCoupon ? "COUPON" : "AUTOMATIC",
    displayKind: isCoupon ? "PUBLIC_COUPON" : "AUTOMATIC_CART_DISCOUNT",
    requiresCouponCode: isCoupon,
    discountType: winner.discountType,
    discountValue: winner.discountValue,
    maxDiscountAmountMinor: winner.maxDiscountAmountMinor,
    minOrderAmountMinor: winner.minOrderAmountMinor,
    couponCode,
    couponAction: isCoupon ? (couponCode ? "CLAIM" : "MANUAL_ONLY") : "MANUAL_ONLY",
    endsAt: endsAt ? endsAt.toISOString() : null,
    ...estimate,
    ...toCouponDisplayFields(winner),
  };
}

/** Ürün için gösterim seti (birincil rozet + stackable ikincil kupon). */
export interface PublicCampaignDisplay {
  primary: PublicCampaignBadge | null;
  secondaryCoupon: PublicCampaignBadge | null;
}

/** Ürün için uygun kampanyaları (rozet-uygun + kapsam) sıralı döndürür (priority DESC, id ASC). */
function eligibleCampaignsFor(
  campaigns: CampaignRecord[],
  product: { id: string; categoryIds: string[] },
  now: Date,
): CampaignRecord[] {
  return campaigns
    .filter((campaign) => isBadgeEligible(campaign, now))
    .filter((campaign) => campaignAppliesToProduct(campaign, product))
    .sort(compareCampaigns);
}

/** Uygun kampanyalardan birincil + (stackable ise) ikincil kupon kaydını seçer (badge üretmeden). */
function selectPrimaryRecords(eligible: CampaignRecord[]): {
  primary: CampaignRecord | null;
  secondary: CampaignRecord | null;
} {
  if (eligible.length === 0) return { primary: null, secondary: null };
  const allStackable = eligible.every((campaign) => campaign.stackable);
  if (allStackable) {
    const automatic = eligible.find((campaign) => campaign.type !== "COUPON_CODE") ?? null;
    const coupon = eligible.find((campaign) => campaign.type === "COUPON_CODE") ?? null;
    const primary = automatic ?? coupon;
    const secondary = automatic && coupon ? coupon : null;
    return { primary: primary ?? null, secondary };
  }
  return { primary: eligible[0], secondary: null };
}

/**
 * F4A.6 (ADR-062) — Ürün kartı/detayı için gösterim setini seçer. `campaigns` önceden store-scoped yüklenmiş
 * olmalıdır. `unitPriceMinor` yalnız otomatik indirimin güvenli nihai fiyat tahmini içindir (kupon → null).
 */
export function selectPublicCampaignDisplay(
  campaigns: CampaignRecord[],
  product: { id: string; categoryIds: string[] },
  now: Date,
  unitPriceMinor: number | null = null,
): PublicCampaignDisplay {
  const eligible = eligibleCampaignsFor(campaigns, product, now);
  const { primary, secondary } = selectPrimaryRecords(eligible);
  if (!primary) return { primary: null, secondaryCoupon: null };
  return {
    primary: buildCampaignBadge(primary, now, primary.type !== "COUPON_CODE" ? unitPriceMinor : null),
    secondaryCoupon: secondary ? buildCampaignBadge(secondary, now, null) : null,
  };
}

/** Ürün için gösterilecek BİRİNCİL rozeti seçer (yoksa null). İnce sarmalayıcı (geriye-uyumlu). */
export function selectPublicCampaignBadge(
  campaigns: CampaignRecord[],
  product: { id: string; categoryIds: string[] },
  now: Date,
  unitPriceMinor: number | null = null,
): PublicCampaignBadge | null {
  return selectPublicCampaignDisplay(campaigns, product, now, unitPriceMinor).primary;
}

/** STORE seviyesi public kampanya slide listesi (vitrin üst band slider'ı). Ürün kapsamı UYGULANMAZ. */
export function selectPublicCampaignSlides(campaigns: CampaignRecord[], now: Date): PublicCampaignBadge[] {
  return campaigns
    .filter((campaign) => isBadgeEligible(campaign, now))
    .sort(compareCampaigns)
    .map((campaign) => buildCampaignBadge(campaign, now, null));
}

/**
 * TODO-155.2 — INDEX-ANI snapshot'ı: birincil rozet + kazanan kampanyanın GEÇERLİLİK penceresi (read-time
 * bastırma için). `selectPublicCampaignDisplay` ile AYNI seçimi yapar ama kazananın startsAt/endsAt'ini de
 * döndürür (badge startsAt taşımaz). Uygun kampanya yoksa null. `now` snapshot anıdır.
 */
export interface PublicCampaignSnapshot {
  badge: PublicCampaignBadge;
  /** Kazanan kampanyanın başlangıcı (read-time: now < startsAt → bastır). */
  startsAt: Date | null;
  /** Kazanan kampanya+kupon efektif bitişi (read-time: now > endsAt → bastır). */
  endsAt: Date | null;
}

export function selectIndexableCampaignSnapshot(
  campaigns: CampaignRecord[],
  product: { id: string; categoryIds: string[] },
  now: Date,
  unitPriceMinor: number | null = null,
): PublicCampaignSnapshot | null {
  const eligible = eligibleCampaignsFor(campaigns, product, now);
  const { primary } = selectPrimaryRecords(eligible);
  if (!primary) return null;
  const badge = buildCampaignBadge(primary, now, primary.type !== "COUPON_CODE" ? unitPriceMinor : null);
  const activeCoupon =
    primary.type === "COUPON_CODE"
      ? (primary.coupons.find((c) => c.code === selectPublicCouponCode(primary, now)) ?? null)
      : null;
  return { badge, startsAt: primary.startsAt, endsAt: effectiveCampaignEndsAt(primary, activeCoupon) };
}

/**
 * TODO-155.2 — READ-TIME geçerlilik bastırması (provider-bağımsız güvenlik ağı). Snapshot penceresi `now`'a
 * göre geçersizse (başlamamış / bitmiş) rozet GÖSTERİLMEZ. Postgres bugün + gelecekte OpenSearch AYNI semantik.
 * Asıl bayat-temizlik reconciliation ile yapılır; bu yalnız stale badge'in vitrine sızmasını önler.
 */
export function isCampaignSnapshotDisplayable(
  window: { startsAt: Date | null; endsAt: Date | null },
  now: Date,
): boolean {
  if (window.startsAt && now.getTime() < window.startsAt.getTime()) return false;
  if (window.endsAt && now.getTime() > window.endsAt.getTime()) return false;
  return true;
}

// ═══════════════════ TODO-158B (ADR-087) — Enterprise Theme Engine ═══════════════════
// Görsel kimlik store-scoped, VERSİYONLU JSON belgesidir (ThemeDocument — bkz.
// @commerce-os/theme). Contracts belgeyi OPAK (record) taşır: asıl şema/token/
// referans doğrulaması gateway'de @commerce-os/theme `validateThemeDocument` +
// `importTheme` ile yapılır (TEK otorite; büyük token şeması burada tekrarlanmaz).
// `status` alanları String'tir (enum değil — migration'sız genişler); contracts
// düzeyinde kabul edilen değerler allowlist'lenir.

// TODO-164 — INCOMPATIBLE/DISABLED additive (String kolon; migration'sız). Forward-compat.
export const themeStatusSchema = z.enum([
  "DRAFT",
  "PUBLISHED",
  "ARCHIVED",
  "INCOMPATIBLE",
  "DISABLED",
]);

/** Tam ThemeDocument — opak; gateway @commerce-os/theme ile doğrular. */
export const themeDocumentPayloadSchema = z.record(z.unknown());

/** TODO-164 — layout/slot config (opak; gateway themeConfigSchema ile doğrular). */
export const themeConfigPayloadSchema = z.record(z.unknown());

export const themeVersionSummarySchema = z.object({
  id: z.string().min(1),
  version: z.number().int().positive(),
  status: themeStatusSchema,
  schemaVersion: z.number().int().positive(),
  label: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  publishedAt: z.string().nullable(),
});

export const themeSummarySchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  description: z.string().nullable(),
  status: themeStatusSchema,
  source: z.string().nullable(),
  colorScheme: z.string(),
  // TODO-164 — theme-key / layout preset (registry key + etkin düzen).
  themeKey: z.string(),
  layoutPreset: z.string(),
  themeApiVersion: z.number().int().positive(),
  versionCount: z.number().int().nonnegative(),
  publishedVersion: z.number().int().positive().nullable(),
  draftVersion: z.number().int().positive().nullable(),
  updatedAt: z.string(),
});

export const themeListResponseSchema = z.object({
  themes: z.array(themeSummarySchema),
});

const themeVersionDocumentSchema = z.object({
  version: z.number().int().positive(),
  status: themeStatusSchema,
  schemaVersion: z.number().int().positive(),
  document: themeDocumentPayloadSchema,
  // TODO-164 — sürümün layout/slot config'i (draft = düzenlenen, published = yayın).
  config: themeConfigPayloadSchema,
});

/* ── TODO-164B (ADR-233) — Store Override Policy (transport) ──
 * Alan yetki modeli. Otorite @commerce-os/theme (override-policy.ts); contracts
 * OPAK-tipli taşır (path/policy String → forward-compat; gateway strict doğrular).
 */
export const fieldPolicyValueSchema = z.enum([
  "editable",
  "locked",
  "inherited",
  "required",
  "hidden",
]);

export const storeOverridePolicySchema = z.object({
  fields: z.record(z.string(), fieldPolicyValueSchema),
  allowedFonts: z.array(z.string()),
  allowedPalettes: z.array(z.string()),
  allowedLayoutPresets: z.array(z.string()),
});

/** Store Admin bağlamına yansıyan alan sınıflandırması (client gizleme; server enforce). */
export const fieldPolicyProjectionSchema = z.object({
  editable: z.array(z.string()),
  locked: z.array(z.string()),
  hidden: z.array(z.string()),
});

export type FieldPolicyValue = z.infer<typeof fieldPolicyValueSchema>;
export type StoreOverridePolicyContract = z.infer<typeof storeOverridePolicySchema>;
export type FieldPolicyProjection = z.infer<typeof fieldPolicyProjectionSchema>;

export const themeDetailSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  description: z.string().nullable(),
  status: themeStatusSchema,
  source: z.string().nullable(),
  colorScheme: z.string(),
  themeKey: z.string(),
  layoutPreset: z.string(),
  themeApiVersion: z.number().int().positive(),
  // TODO-164A — builder kimlik alanları (görünürlük/audit).
  duplicatedFrom: z.string().nullable().optional(),
  updatedAt: z.string().optional(),
  // TODO-164B — rol ayrımı + override policy bağlamı. ownerScope STORE|PLATFORM;
  // overridePolicy Store Admin alan yetkileri (null → hepsi editable, geriye uyum);
  // fieldPolicyProjection UI'ın locked/hidden gizlemesi için; sourceThemeVersion +
  // updateAvailable platform template'inden türetilen mağaza teması için.
  ownerScope: z.string().optional(),
  overridePolicy: storeOverridePolicySchema.nullable().optional(),
  fieldPolicyProjection: fieldPolicyProjectionSchema.optional(),
  sourceThemeVersion: z.number().int().positive().nullable().optional(),
  updateAvailable: z.boolean().optional(),
  draft: themeVersionDocumentSchema.nullable(),
  published: themeVersionDocumentSchema.nullable(),
  versions: z.array(themeVersionSummarySchema),
});

// null = alanı temizle; absent = dokunma. refine boş PATCH'i reddeder.
export const themeCreateRequestSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  // Preset id ("modern" vb.); yoksa paketlenmiş varsayılan tema kopyalanır.
  presetId: z.string().max(60).optional(),
  // TODO-164A — başlangıç noktası (BASE_COMMERCE/FASHION_MINIMAL/FASHION_EDITORIAL/
  // PREMIUM_BOUTIQUE/EMPTY). Verilirse preset'i kopyalayıp draft config+document
  // snapshot'ı üretir (registry MUTATE edilmez). presetId ile geriye uyumlu.
  startingPoint: z.string().max(40).optional(),
});

export const themeUpdateRequestSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(500).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

export const themeDraftUpdateRequestSchema = z.object({
  document: themeDocumentPayloadSchema,
  label: z.string().max(120).optional(),
  // TODO-164 — layout/slot config (opsiyonel; yoksa mevcut config korunur). Gateway
  // themeConfigSchema + compatibility ile doğrular; geçersiz variant reddedilir.
  config: themeConfigPayloadSchema.optional(),
});

export const themePublishRequestSchema = z.object({
  notes: z.string().max(500).optional(),
});

// TODO-164A — Tema kopyalama isteği (yeni tema adı).
export const themeDuplicateRequestSchema = z.object({
  name: z.string().min(1).max(120),
});

export const themeRollbackRequestSchema = z.object({
  version: z.number().int().positive(),
});

export const themeImportRequestSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  // Export zarfı ya da ham ThemeDocument; gateway importTheme ile doğrular.
  data: z.unknown(),
});

export const themeExportResponseSchema = z.object({
  json: z.string(),
});

export const themePresetSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
});

export const themePresetListResponseSchema = z.object({
  presets: z.array(themePresetSummarySchema),
});

// Admin canlı önizleme: draft/verilen versiyonun çözülmüş CSS'i.
export const themePreviewResponseSchema = z.object({
  css: z.string(),
  colorScheme: z.string(),
  schemaVersion: z.number().int().positive(),
});

// TODO-164A — Builder önizleme token'ı (kısa ömürlü, store+theme scoped, imzalı).
// Store-admin iframe bunu storefront `/preview/theme?token=` route'una geçirir.
export const themePreviewTokenResponseSchema = z.object({
  token: z.string(),
  expiresAt: z.string(),
});
export type ThemePreviewTokenResponse = z.infer<typeof themePreviewTokenResponseSchema>;

/**
 * PUBLIC (vitrin) — yayınlanmış temanın SUNUCU-ÇÖZÜLMÜŞ CSS'i (ALLOWLIST).
 * Vitrin yalnız `css`'i head'e enjekte eder + `colorScheme` ipucunu uygular.
 * Ham token belgesi / iç alanlar BİLİNÇLİ olarak DIŞARIDA (sunucu-otoriter).
 */
export const publicThemeSchema = z.object({
  css: z.string(),
  colorScheme: z.string(),
  schemaVersion: z.number().int().positive(),
  // TODO-164 — presentation projection: etkin layout preset + tam slot→variant haritası
  // (storefront slot resolver bunu okur). İç config/audit/draft SIZMAZ.
  themeKey: z.string(),
  layoutPreset: z.string(),
  slots: z.record(z.string(), z.string()),
});

/* ── TODO-164 (ADR-217/ADR-221/ADR-222) — Theme compatibility & Platform Admin binding ── */

export const themeCompatibilityIssueSchema = z.object({
  code: z.string(),
  severity: z.enum(["ERROR", "WARNING"]),
  slot: z.string().optional(),
  message: z.string(),
});

/**
 * PLATFORM ADMIN — store "Tema ve Marka" görünümü (salt-okuma) + atama. İç token
 * belgesi / draft config SIZMAZ; yalnız yönetim özeti.
 */
export const themeBindingResponseSchema = z.object({
  storeId: z.string(),
  // Aktif (yayın) tema özeti — yoksa base.
  activeThemeKey: z.string(),
  activeThemeName: z.string(),
  kind: z.enum(["BASE", "LAYOUT_PRESET", "CUSTOM_PACKAGE"]),
  layoutPreset: z.string(),
  themeApiVersion: z.number().int().positive(),
  publishedVersion: z.number().int().positive().nullable(),
  draftVersion: z.number().int().positive().nullable(),
  previousPublishedVersion: z.number().int().positive().nullable(),
  lastPublishedAt: z.string().nullable(),
  rollbackAvailable: z.boolean(),
  capabilityEnabled: z.boolean(),
  updateAvailable: z.boolean(),
  compatible: z.boolean(),
  // TODO-164A — builder görünürlüğü: taslak tema sayısı, kaynak preset, son güncelleme.
  draftThemeCount: z.number().int().nonnegative().optional(),
  sourcePreset: z.string().nullable().optional(),
  lastUpdatedAt: z.string().nullable().optional(),
  issues: z.array(themeCompatibilityIssueSchema),
  // Platform admin'in atayabileceği temalar (registry projeksiyonu).
  assignableThemes: z.array(
    z.object({
      key: z.string(),
      nameTr: z.string(),
      nameEn: z.string(),
      kind: z.enum(["BASE", "LAYOUT_PRESET", "CUSTOM_PACKAGE"]),
      layoutPreset: z.string(),
      status: z.enum(["ACTIVE", "DEPRECATED", "DISABLED"]),
      compatible: z.boolean(),
    }),
  ),
});

/** Platform admin theme-key atama isteği. */
export const themeBindingAssignRequestSchema = z.object({
  themeKey: z.string().min(1).max(64),
  // TODO-164B — atama sırasında mağaza override policy'si (opsiyonel; verilmezse
  // gateway varsayılan = hepsi editable uygular → mevcut davranış korunur).
  overridePolicy: storeOverridePolicySchema.optional(),
});

/**
 * PLATFORM ADMIN "Tema Yönetimi" fleet tablosu satırı. Tüm mağazalar + yayınlı tema
 * özeti (aktif tema/preset/uyumluluk/capability). ALLOWLIST: ham belge/config SIZMAZ.
 */
export const themeBindingSummarySchema = z.object({
  storeId: z.string(),
  storeName: z.string(),
  storeSlug: z.string(),
  storeStatus: z.string(),
  activeThemeKey: z.string(),
  activeThemeName: z.string(),
  kind: z.enum(["BASE", "LAYOUT_PRESET", "CUSTOM_PACKAGE"]),
  layoutPreset: z.string(),
  publishedVersion: z.number().int().positive().nullable(),
  compatible: z.boolean(),
  capabilityEnabled: z.boolean(),
});

export const themeBindingListResponseSchema = z.object({
  bindings: z.array(themeBindingSummarySchema),
});

export type ThemeStatus = z.infer<typeof themeStatusSchema>;
export type ThemeVersionSummary = z.infer<typeof themeVersionSummarySchema>;
export type ThemeSummary = z.infer<typeof themeSummarySchema>;
export type ThemeListResponse = z.infer<typeof themeListResponseSchema>;
export type ThemeDetail = z.infer<typeof themeDetailSchema>;
export type ThemeCreateRequest = z.infer<typeof themeCreateRequestSchema>;
export type ThemeUpdateRequest = z.infer<typeof themeUpdateRequestSchema>;
export type ThemeDraftUpdateRequest = z.infer<typeof themeDraftUpdateRequestSchema>;
export type ThemePublishRequest = z.infer<typeof themePublishRequestSchema>;
export type ThemeRollbackRequest = z.infer<typeof themeRollbackRequestSchema>;
export type ThemeImportRequest = z.infer<typeof themeImportRequestSchema>;
export type ThemeDuplicateRequest = z.infer<typeof themeDuplicateRequestSchema>;
export type ThemeExportResponse = z.infer<typeof themeExportResponseSchema>;
export type ThemePresetSummary = z.infer<typeof themePresetSummarySchema>;
export type ThemePresetListResponse = z.infer<typeof themePresetListResponseSchema>;
export type ThemePreviewResponse = z.infer<typeof themePreviewResponseSchema>;
export type PublicTheme = z.infer<typeof publicThemeSchema>;
export type ThemeCompatibilityIssue = z.infer<typeof themeCompatibilityIssueSchema>;
export type ThemeBindingResponse = z.infer<typeof themeBindingResponseSchema>;
export type ThemeBindingAssignRequest = z.infer<typeof themeBindingAssignRequestSchema>;
export type ThemeBindingSummary = z.infer<typeof themeBindingSummarySchema>;
export type ThemeBindingListResponse = z.infer<typeof themeBindingListResponseSchema>;

/* ════════════════════════════════════════════════════════════════════════════
 * TODO-164B Dilim 2 (ADR-238…245) — Platform Theme Library, Designer & Rollout.
 * Yalnız Platform Admin (super admin) mutate eder. ALLOWLIST: ham token belgesi /
 * secret TAŞINMAZ; before/after özeti kullanıcı-dostu (yalnız path/label/before/after).
 * ════════════════════════════════════════════════════════════════════════════ */

/** Kütüphane liste satırı — template özeti + kullanım/güncelleme sayaçları. */
export const libraryTemplateSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  themeKey: z.string(),
  status: z.string(),
  ownerScope: z.string(),
  compatible: z.boolean(),
  sourcePreset: z.string().nullable(),
  colorScheme: z.string(),
  publishedVersion: z.number().int().positive().nullable(),
  draftVersion: z.number().int().positive().nullable(),
  policyComplete: z.boolean(),
  usingCount: z.number().int().nonnegative(),
  updatePendingCount: z.number().int().nonnegative(),
  updatedAt: z.string(),
  lastPublishedAt: z.string().nullable(),
});
export const libraryListResponseSchema = z.object({
  templates: z.array(libraryTemplateSummarySchema),
});

/** Yeni platform template isteği (başlangıç noktası). */
export const libraryTemplateCreateRequestSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  startingPoint: z.string().max(40).optional(),
});

/** Override policy matris editörü — tam policy yazar (fields + allowlist'ler). */
export const themePolicyUpdateRequestSchema = z.object({
  overridePolicy: storeOverridePolicySchema,
});

/** Kullanıcı-dostu before/after değişiklik özeti (raw JSON DEĞİL). */
export const themeChangeCategorySchema = z.enum([
  "color",
  "typography",
  "layout",
  "slot",
  "media",
  "policy",
]);
export const themeFieldChangeSchema = z.object({
  path: z.string(),
  labelTr: z.string(),
  labelEn: z.string(),
  category: themeChangeCategorySchema,
  before: z.string().nullable(),
  after: z.string().nullable(),
  kind: z.enum(["added", "removed", "changed"]),
});
export const themeChangeSummarySchema = z.object({
  changes: z.array(themeFieldChangeSchema),
  counts: z.record(themeChangeCategorySchema, z.number().int().nonnegative()),
  total: z.number().int().nonnegative(),
  hasChanges: z.boolean(),
});

/** Bir template'i kullanan mağazalar + update-available durumu. */
export const templateUsageRowSchema = z.object({
  storeId: z.string(),
  storeName: z.string(),
  storeSlug: z.string(),
  storeStatus: z.string(),
  sourceThemeVersion: z.number().int().positive().nullable(),
  updateAvailable: z.boolean(),
});
export const templateUsageResponseSchema = z.object({
  templatePublishedVersion: z.number().int().positive().nullable(),
  usingCount: z.number().int().nonnegative(),
  updatePendingCount: z.number().int().nonnegative(),
  usage: z.array(templateUsageRowSchema),
});

/** Atanabilir mağaza (sistem mağazaları HARİÇ). */
export const assignableStoreSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  status: z.string(),
  sourceThemeId: z.string().nullable(),
  sourceThemeVersion: z.number().int().positive().nullable(),
});
export const assignableStoresResponseSchema = z.object({
  stores: z.array(assignableStoreSchema),
});

/** Atama/rollout dry-run isteği (mağaza id listesi). */
export const themeAssignPreviewRequestSchema = z.object({
  storeIds: z.array(z.string().min(1)).min(1).max(500),
});
export const themeAssignStorePreviewSchema = z.object({
  storeId: z.string(),
  storeName: z.string(),
  compatible: z.boolean(),
  issues: z.array(themeCompatibilityIssueSchema),
  summary: themeChangeSummarySchema,
});
export const themeAssignPreviewResponseSchema = z.object({
  templateName: z.string(),
  templatePublishedVersion: z.number().int().positive().nullable(),
  previews: z.array(themeAssignStorePreviewSchema),
});

export const rolloutModeSchema = z.enum(["single", "selected", "pilot", "all-compatible"]);

/** Atama/rollout apply isteği. */
export const themeAssignRequestSchema = z.object({
  storeIds: z.array(z.string().min(1)).min(1).max(500),
  mode: rolloutModeSchema.default("selected"),
  overridePolicy: storeOverridePolicySchema.optional(),
});
export const rolloutStoreResultSchema = z.object({
  storeId: z.string(),
  storeName: z.string().optional(),
  status: z.enum(["success", "failed", "skipped"]),
  reasonCode: z.string().optional(),
  newVersion: z.number().int().positive().optional(),
});
export const rolloutSummaryResponseSchema = z.object({
  mode: rolloutModeSchema,
  total: z.number().int().nonnegative(),
  succeeded: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  results: z.array(rolloutStoreResultSchema),
});

/** Kütüphane preview token isteği (opsiyonel hedef sürüm). */
export const libraryPreviewTokenRequestSchema = z.object({
  version: z.number().int().positive().optional(),
});

/** TD-162 — logo/favicon DRAFT staging isteği. null → o alanın staging'ini temizler. */
export const themeStageAssetsRequestSchema = z
  .object({
    logoMediaId: z.string().min(1).max(64).nullable().optional(),
    faviconMediaId: z.string().min(1).max(64).nullable().optional(),
  })
  .refine((v) => v.logoMediaId !== undefined || v.faviconMediaId !== undefined, {
    message: "At least one asset field is required.",
  });
export type ThemeStageAssetsRequest = z.infer<typeof themeStageAssetsRequestSchema>;

/** Store Admin — aktif platform teması durumu (update-available + kilitli/editable). */
export const platformThemeStatusResponseSchema = z.object({
  managedByPlatform: z.boolean(),
  templateName: z.string().nullable(),
  currentVersion: z.number().int().positive().nullable(),
  templatePublishedVersion: z.number().int().positive().nullable(),
  updateAvailable: z.boolean(),
  editableFields: z.array(z.string()),
  lockedFields: z.array(z.string()),
});

export type LibraryTemplateSummary = z.infer<typeof libraryTemplateSummarySchema>;
export type LibraryListResponse = z.infer<typeof libraryListResponseSchema>;
export type LibraryTemplateCreateRequest = z.infer<typeof libraryTemplateCreateRequestSchema>;
export type ThemePolicyUpdateRequest = z.infer<typeof themePolicyUpdateRequestSchema>;
export type ThemeChangeSummary = z.infer<typeof themeChangeSummarySchema>;
export type ThemeFieldChange = z.infer<typeof themeFieldChangeSchema>;
export type TemplateUsageResponse = z.infer<typeof templateUsageResponseSchema>;
export type AssignableStoresResponse = z.infer<typeof assignableStoresResponseSchema>;
export type ThemeAssignPreviewRequest = z.infer<typeof themeAssignPreviewRequestSchema>;
export type ThemeAssignPreviewResponse = z.infer<typeof themeAssignPreviewResponseSchema>;
export type ThemeAssignRequest = z.infer<typeof themeAssignRequestSchema>;
export type RolloutSummaryResponse = z.infer<typeof rolloutSummaryResponseSchema>;
export type LibraryPreviewTokenRequest = z.infer<typeof libraryPreviewTokenRequestSchema>;
export type PlatformThemeStatusResponse = z.infer<typeof platformThemeStatusResponseSchema>;

/* ════════════════════════════════════════════════════════════════════════════
 * TODO-159D (ADR-093) — Customer Lists & Wishlist (own account).
 *
 * Favori (wishlist) ve alışveriş listeleri AYRI iki sistem DEĞİL; ortak bir
 * `CustomerList` altyapısıdır. Wishlist = type=WISHLIST olan TEK varsayılan liste.
 *
 * Tüm uçlar müşteri-scoped'tur (`requireStore` + `requireCustomer`); müşteri yalnız
 * KENDİ listelerine erişir. Öğe hidrasyonu CANLI ürün/varyant/stok otoritesinden
 * yapılır — fiyat/stok SNAPSHOT'ına ASLA güvenilmez (kupon/sipariş deseniyle simetrik).
 * Fiyatlar minor + currency olarak taşınır; etiketleme istemcide (i18n gateway'e girmez).
 * ════════════════════════════════════════════════════════════════════════════ */

export const customerListTypeSchema = z.enum(["WISHLIST", "SHOPPING_LIST"]);
export const customerListVisibilitySchema = z.enum(["PRIVATE"]);

/** Sunucu-otoriter sınırlar (istemci ne gönderirse göndersin aşılamaz). */
export const CUSTOMER_LIST_NAME_MAX_LENGTH = 60;
export const CUSTOMER_LIST_MAX_PER_CUSTOMER = 50;
export const CUSTOMER_LIST_MAX_ITEMS = 200;
export const CUSTOMER_LIST_ITEM_NOTE_MAX_LENGTH = 280;
export const CUSTOMER_LIST_BATCH_ADD_MAX = 100;
export const CUSTOMER_WISHLIST_STATUS_MAX_IDS = 200;
export const CUSTOMER_WISHLIST_MERGE_MAX_ITEMS = 100;
export const CUSTOMER_LIST_ITEM_QUANTITY_MAX = 999;

/**
 * Hidrate liste öğesinin uygunluk durumu (canlı otoriteden türetilir):
 *  - AVAILABLE:    satın alınabilir + stokta.
 *  - OUT_OF_STOCK: aktif/satın alınabilir ama stok yok.
 *  - UNAVAILABLE:  arşiv/pasif/satın alınamaz/fiyat gizli (ürün artık uygun değil).
 */
export const customerListItemAvailabilitySchema = z.enum([
  "AVAILABLE",
  "OUT_OF_STOCK",
  "UNAVAILABLE",
]);

/** Liste özeti (listeler dizini). itemCount canlı öğe sayısıdır. */
export const customerListSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  type: customerListTypeSchema,
  visibility: customerListVisibilitySchema,
  isDefault: z.boolean(),
  itemCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const customerListListResponseSchema = z.object({
  data: z.array(customerListSummarySchema),
});

/**
 * Hidrate liste öğesi (liste detayı). ALLOWLIST: müşteri-güvenli alanlar. `productId`
 * public ürün kimliğidir (publicProductSchema.id ile aynı; sızıntı değil). `variantId`
 * yalnız varyant-özel öğede dolu (wishlist favorisi = bütün-ürün → null). `addableVariantId`
 * "sepete ekle" için çözülen satın alınabilir varyanttır (yoksa null). mediaId/storageKey
 * ASLA taşınmaz — yalnız türetilmiş `imageUrl`.
 */
export const customerListItemSchema = z.object({
  id: z.string(),
  productId: z.string(),
  variantId: z.string().nullable(),
  productSlug: z.string(),
  productTitle: z.string(),
  variantTitle: z.string().nullable(),
  sku: z.string().nullable(),
  note: z.string().nullable(),
  quantity: z.number().int().positive(),
  imageUrl: z.string().nullable(),
  priceMinor: z.number().int().nonnegative().nullable(),
  compareAtMinor: z.number().int().nonnegative().nullable(),
  currency: currencySchema.nullable(),
  availability: customerListItemAvailabilitySchema,
  inStock: z.boolean(),
  addableVariantId: z.string().nullable(),
  addedAt: z.string().datetime(),
});

export const customerListDetailSchema = customerListSummarySchema.extend({
  items: z.array(customerListItemSchema),
});

/** Liste detayı — ADR-089 Data Grid sayfalaması (varsayılan 25; 25/50/100). */
export const customerListDetailResponseSchema = z.object({
  data: customerListDetailSchema,
  pagination: adminListPaginationSchema,
});

export const customerListMutationResponseSchema = z.object({
  data: customerListSummarySchema,
});

/* ── İstek şemaları ─────────────────────────────────────────────────────────── */

export const customerListCreateRequestSchema = z.object({
  name: z.string().trim().min(1).max(CUSTOMER_LIST_NAME_MAX_LENGTH),
});
export const customerListRenameRequestSchema = customerListCreateRequestSchema;

export const customerListAddItemRequestSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1).nullish(),
  note: z.string().trim().max(CUSTOMER_LIST_ITEM_NOTE_MAX_LENGTH).nullish(),
  quantity: z.coerce.number().int().positive().max(CUSTOMER_LIST_ITEM_QUANTITY_MAX).optional(),
});

/** İdempotent öğe ekleme sonucu: yeni mi eklendi yoksa zaten var mıydı. */
export const customerListAddItemResponseSchema = z.object({
  data: z.object({
    itemId: z.string(),
    alreadyExisted: z.boolean(),
  }),
});

export const customerListMoveItemRequestSchema = z.object({
  targetListId: z.string().min(1),
});
export const customerListCopyItemRequestSchema = customerListMoveItemRequestSchema;

export const customerListItemMutationResponseSchema = z.object({
  data: z.object({ ok: z.literal(true) }),
});

/**
 * Toplu sepete ekleme. `itemIds` verilmezse listedeki TÜM öğeler değerlendirilir
 * (sunucu yine `CUSTOMER_LIST_BATCH_ADD_MAX` ile sınırlar). Sepet cookie-tabanlı
 * olduğundan uç, eklenebilir adayları (variantId + qty) + atlananları (sebep) DÖNER;
 * gerçek sepet yazımı storefront cookie'sinde yapılır (canlı otorite gateway'de kalır).
 */
export const customerListBatchAddToCartRequestSchema = z.object({
  itemIds: z.array(z.string().min(1)).max(CUSTOMER_LIST_BATCH_ADD_MAX).optional(),
});

export const customerListCartCandidateSchema = z.object({
  itemId: z.string(),
  productId: z.string(),
  variantId: z.string(),
  quantity: z.number().int().positive(),
});

export const customerListSkippedItemSchema = z.object({
  itemId: z.string(),
  productTitle: z.string(),
  reason: customerListItemAvailabilitySchema,
});

export const customerListBatchAddToCartResponseSchema = z.object({
  data: z.object({
    candidates: z.array(customerListCartCandidateSchema),
    skipped: z.array(customerListSkippedItemSchema),
  }),
});

/* ── Wishlist (default liste kısa yolları) ─────────────────────────────────────
 * Wishlist favorisi HER ZAMAN ürün-seviyesidir (variantId=NULL) → PLP/PDP durum
 * tutarlılığı. Toggle/status productId ile anahtarlanır. */

export const customerWishlistToggleRequestSchema = z.object({
  productId: z.string().min(1),
  // İstenen durum; verilirse idempotent (çift-tık güvenli), verilmezse ters çevirir.
  saved: z.boolean().optional(),
});

export const customerWishlistToggleResponseSchema = z.object({
  data: z.object({ productId: z.string(), saved: z.boolean() }),
});

/** Batched favori durumu: verilen productId'lerden favoride olanlar. N+1 önler. */
export const customerWishlistStatusRequestSchema = z.object({
  productIds: z.array(z.string().min(1)).max(CUSTOMER_WISHLIST_STATUS_MAX_IDS),
});

export const customerWishlistStatusResponseSchema = z.object({
  data: z.object({ savedProductIds: z.array(z.string()) }),
});

export const customerWishlistMergeItemSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1).nullish(),
});

/** Guest wishlist → default wishlist idempotent merge. Bozuk/eski id sunucuda elenir. */
export const customerWishlistMergeRequestSchema = z.object({
  items: z.array(customerWishlistMergeItemSchema).max(CUSTOMER_WISHLIST_MERGE_MAX_ITEMS),
});

export const customerWishlistMergeResponseSchema = z.object({
  data: z.object({
    merged: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
  }),
});

/* ── Store Admin — müşteri liste özeti (salt-okunur, gizlilik-güvenli) ──────────
 * Platform-admin müşteri detayında gösterilen ASGARİ özet: liste/öğe sayısı + son
 * eklenen tarih. Öğe içeriği/davranış takibi GÖSTERİLMEZ. */
export const storeAdminCustomerListSummaryResponseSchema = z.object({
  data: z.object({
    listCount: z.number().int().nonnegative(),
    wishlistItemCount: z.number().int().nonnegative(),
    totalItemCount: z.number().int().nonnegative(),
    lastAddedAt: z.string().datetime().nullable(),
  }),
});

export type CustomerListType = z.infer<typeof customerListTypeSchema>;
export type CustomerListVisibility = z.infer<typeof customerListVisibilitySchema>;
export type CustomerListItemAvailability = z.infer<typeof customerListItemAvailabilitySchema>;
export type CustomerListSummary = z.infer<typeof customerListSummarySchema>;
export type CustomerListListResponse = z.infer<typeof customerListListResponseSchema>;
export type CustomerListItem = z.infer<typeof customerListItemSchema>;
export type CustomerListDetail = z.infer<typeof customerListDetailSchema>;
export type CustomerListDetailResponse = z.infer<typeof customerListDetailResponseSchema>;
export type CustomerListMutationResponse = z.infer<typeof customerListMutationResponseSchema>;
export type CustomerListCreateRequest = z.infer<typeof customerListCreateRequestSchema>;
export type CustomerListRenameRequest = z.infer<typeof customerListRenameRequestSchema>;
export type CustomerListAddItemRequest = z.infer<typeof customerListAddItemRequestSchema>;
export type CustomerListAddItemResponse = z.infer<typeof customerListAddItemResponseSchema>;
export type CustomerListMoveItemRequest = z.infer<typeof customerListMoveItemRequestSchema>;
export type CustomerListCopyItemRequest = z.infer<typeof customerListCopyItemRequestSchema>;
export type CustomerListItemMutationResponse = z.infer<typeof customerListItemMutationResponseSchema>;
export type CustomerListBatchAddToCartRequest = z.infer<typeof customerListBatchAddToCartRequestSchema>;
export type CustomerListCartCandidate = z.infer<typeof customerListCartCandidateSchema>;
export type CustomerListSkippedItem = z.infer<typeof customerListSkippedItemSchema>;
export type CustomerListBatchAddToCartResponse = z.infer<typeof customerListBatchAddToCartResponseSchema>;
export type CustomerWishlistToggleRequest = z.infer<typeof customerWishlistToggleRequestSchema>;
export type CustomerWishlistToggleResponse = z.infer<typeof customerWishlistToggleResponseSchema>;
export type CustomerWishlistStatusRequest = z.infer<typeof customerWishlistStatusRequestSchema>;
export type CustomerWishlistStatusResponse = z.infer<typeof customerWishlistStatusResponseSchema>;
export type CustomerWishlistMergeItem = z.infer<typeof customerWishlistMergeItemSchema>;
export type CustomerWishlistMergeRequest = z.infer<typeof customerWishlistMergeRequestSchema>;
export type CustomerWishlistMergeResponse = z.infer<typeof customerWishlistMergeResponseSchema>;
export type StoreAdminCustomerListSummaryResponse = z.infer<typeof storeAdminCustomerListSummaryResponseSchema>;

/* ════════════════════════════════════════════════════════════════════════════
 * TODO-159E (ADR-094) — Product Reviews & Ratings.
 *
 * Gerçek, tenant-safe, moderasyonlu ve DOĞRULANMIŞ ALIŞVERİŞ temelli yorum sistemi.
 * Yorum ÜRÜN seviyesinde yayınlanır/toplanır; variantId yalnız BAĞLAM olarak saklanır.
 * Uygunluk SUNUCU-otoriter (satın alma kanıtı gateway'de doğrulanır; UI `verifiedPurchase`
 * değerine ASLA güvenilmez). Aggregate = ProductRatingAggregate projection (yalnız APPROVED;
 * tamsayı toplamlar → float drift yok). Public projeksiyon ALLOWLIST: müşteri PII / orderId /
 * orderLineId / moderationNote / iç durum SIZMAZ. Bkz. docs/analysis/TODO-159E-*.md.
 * ════════════════════════════════════════════════════════════════════════════ */

export const productReviewStatusSchema = z.enum(["PENDING", "APPROVED", "REJECTED", "HIDDEN"]);
export const reviewPublicSortSchema = z.enum(["newest", "oldest", "highest", "lowest", "most_helpful"]);
export const reviewModerationActionSchema = z.enum(["approve", "reject", "hide"]);
/** PDP "yorum yaz" uygunluk sonucu (giriş yapılmış müşteri için). */
export const reviewEligibilityReasonSchema = z.enum([
  "ELIGIBLE",
  "NO_ELIGIBLE_PURCHASE",
  "ALREADY_REVIEWED",
]);

/** Sunucu-otoriter sınırlar (istemci ne gönderirse göndersin aşılamaz). */
export const REVIEW_RATING_MIN = 1;
export const REVIEW_RATING_MAX = 5;
export const REVIEW_TITLE_MAX_LENGTH = 120;
export const REVIEW_BODY_MIN_LENGTH = 1;
export const REVIEW_BODY_MAX_LENGTH = 4000;
export const REVIEW_MODERATION_NOTE_MAX_LENGTH = 500;
/** Batched kart summary üst sınırı (PLP/Home/Search tek çağrı). */
export const REVIEW_SUMMARY_MAX_IDS = 200;
/** Public yorum listesi varsayılan sayfa boyutu (admin 25'ten küçük). */
export const REVIEW_PUBLIC_DEFAULT_PAGE_SIZE = 10;

/** Rating değeri: 1–5 arası integer (coerce → query/string güvenli). */
export const reviewRatingSchema = z.coerce
  .number()
  .int()
  .min(REVIEW_RATING_MIN)
  .max(REVIEW_RATING_MAX);

/** Yıldız dağılımı: her yıldız (1..5) için APPROVED yorum sayısı. */
export const ratingDistributionSchema = z.object({
  "1": z.number().int().nonnegative(),
  "2": z.number().int().nonnegative(),
  "3": z.number().int().nonnegative(),
  "4": z.number().int().nonnegative(),
  "5": z.number().int().nonnegative(),
});

/** Ürün rating özeti (aggregate projection'dan). averageRating 1 ondalık. */
export const reviewSummarySchema = z.object({
  productId: z.string(),
  averageRating: z.number().nonnegative(),
  reviewCount: z.number().int().nonnegative(),
  ratingDistribution: ratingDistributionSchema,
});

export const reviewSummaryResponseSchema = z.object({ data: reviewSummarySchema });

/** Batched summary (PLP/Home/Search kartları). Yalnız aggregate satırı olan ürünler döner. */
export const reviewSummaryBatchRequestSchema = z.object({
  productIds: z.array(z.string().min(1)).max(REVIEW_SUMMARY_MAX_IDS),
});
export const reviewSummaryBatchResponseSchema = z.object({
  data: z.array(reviewSummarySchema),
});

/**
 * Public yorum (ALLOWLIST — müşteri-güvenli alanlar). `authorName` maskeli gösterim adı
 * (ör. "Ayşe K."). `viewerFoundHelpful` yalnız giriş yapmış müşteride true olabilir.
 * customerId/email/orderId/orderLineId/moderationNote/status ASLA taşınmaz.
 */
export const publicReviewSchema = z.object({
  id: z.string(),
  rating: z.number().int(),
  title: z.string().nullable(),
  body: z.string(),
  authorName: z.string(),
  verifiedPurchase: z.boolean(),
  helpfulCount: z.number().int().nonnegative(),
  variantLabel: z.string().nullable(),
  createdAt: z.string().datetime(),
  publishedAt: z.string().datetime().nullable(),
  viewerFoundHelpful: z.boolean(),
});

/** Public yorum listesi query: sayfalama + rating filtresi + sıralama. */
export const reviewPublicListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(ADMIN_LIST_MAX_PAGE_SIZE).optional(),
  limit: z.coerce.number().int().positive().max(ADMIN_LIST_MAX_PAGE_SIZE).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
  rating: reviewRatingSchema.optional(),
  sort: reviewPublicSortSchema.optional(),
});

export const reviewPublicListResponseSchema = z.object({
  data: z.array(publicReviewSchema),
  summary: reviewSummarySchema,
  pagination: adminListPaginationSchema,
});

/* ── Customer (x-customer-session) ─────────────────────────────────────────── */

/** Kendi yorumum (tüm durumlar). moderationNote SIZMAZ; yalnız durum + editable. */
export const customerReviewSchema = z.object({
  id: z.string(),
  productId: z.string(),
  productTitle: z.string(),
  productSlug: z.string(),
  productImageUrl: z.string().nullable(),
  variantLabel: z.string().nullable(),
  rating: z.number().int(),
  title: z.string().nullable(),
  body: z.string(),
  status: productReviewStatusSchema,
  verifiedPurchase: z.boolean(),
  helpfulCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  publishedAt: z.string().datetime().nullable(),
  /** true ise müşteri düzenleyebilir (PENDING/APPROVED/REJECTED; HIDDEN düzenlenemez). */
  editable: z.boolean(),
});

/** Yoruma uygun sipariş kalemi (henüz yorumlanmamış, teslim edilmiş+ödenmiş). */
export const reviewEligibleOrderLineSchema = z.object({
  orderLineId: z.string(),
  orderId: z.string(),
  orderNumber: z.string(),
  productId: z.string(),
  productTitle: z.string(),
  productSlug: z.string(),
  productImageUrl: z.string().nullable(),
  variantLabel: z.string().nullable(),
  purchasedAt: z.string().datetime(),
});

export const customerReviewsResponseSchema = z.object({
  data: z.object({
    reviews: z.array(customerReviewSchema),
    eligible: z.array(reviewEligibleOrderLineSchema),
  }),
});

/** PDP "yorum yaz" gate'i (belirli ürün için). */
export const reviewEligibilityResponseSchema = z.object({
  data: z.object({
    eligible: z.boolean(),
    reason: reviewEligibilityReasonSchema,
    orderLineId: z.string().nullable(),
    existingReview: customerReviewSchema.nullable(),
  }),
});

export const reviewCreateRequestSchema = z.object({
  orderLineId: z.string().min(1),
  rating: reviewRatingSchema,
  title: z.string().trim().max(REVIEW_TITLE_MAX_LENGTH).nullish(),
  body: z.string().trim().min(REVIEW_BODY_MIN_LENGTH).max(REVIEW_BODY_MAX_LENGTH),
});

export const reviewUpdateRequestSchema = z.object({
  rating: reviewRatingSchema,
  title: z.string().trim().max(REVIEW_TITLE_MAX_LENGTH).nullish(),
  body: z.string().trim().min(REVIEW_BODY_MIN_LENGTH).max(REVIEW_BODY_MAX_LENGTH),
});

export const customerReviewMutationResponseSchema = z.object({ data: customerReviewSchema });

/** Faydalı oyu toggle. `helpful` verilirse açık set (çift-tık güvenli), yoksa toggle. */
export const reviewHelpfulRequestSchema = z.object({
  helpful: z.boolean().optional(),
});
export const reviewHelpfulResponseSchema = z.object({
  data: z.object({
    reviewId: z.string(),
    helpful: z.boolean(),
    helpfulCount: z.number().int().nonnegative(),
  }),
});

/* ── Store Admin (platform-admin bearer) ───────────────────────────────────── */

/** Admin liste satırı. Müşteri adı moderasyon için görünür (public'te maskeli). */
export const adminReviewSummarySchema = z.object({
  id: z.string(),
  productId: z.string(),
  productTitle: z.string(),
  variantLabel: z.string().nullable(),
  customerName: z.string(),
  rating: z.number().int(),
  title: z.string().nullable(),
  bodyPreview: z.string(),
  status: productReviewStatusSchema,
  verifiedPurchase: z.boolean(),
  helpfulCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  publishedAt: z.string().datetime().nullable(),
});

/** Admin detay (moderasyon drawer). Tam gövde + not + sipariş/müşteri referansı. */
export const adminReviewDetailSchema = adminReviewSummarySchema.extend({
  body: z.string(),
  moderationNote: z.string().nullable(),
  orderId: z.string(),
  orderNumber: z.string(),
  customerId: z.string(),
  customerEmail: z.string().nullable(),
  updatedAt: z.string().datetime(),
});

export const adminReviewListQuerySchema = adminListQueryBaseSchema.extend({
  sortBy: z.enum(["createdAt", "rating", "status", "helpfulCount"]).optional(),
  status: productReviewStatusSchema.optional(),
  rating: reviewRatingSchema.optional(),
  verifiedPurchase: z.enum(["true", "false"]).optional(),
  productId: z.string().min(1).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export const adminReviewListResponseSchema = z.object({
  data: z.array(adminReviewSummarySchema),
  pagination: adminListPaginationSchema,
});

export const adminReviewDetailResponseSchema = z.object({ data: adminReviewDetailSchema });

export const reviewModerateRequestSchema = z.object({
  action: reviewModerationActionSchema,
  moderationNote: z.string().trim().max(REVIEW_MODERATION_NOTE_MAX_LENGTH).nullish(),
});
export const reviewModerateResponseSchema = z.object({ data: adminReviewDetailSchema });

export type ProductReviewStatus = z.infer<typeof productReviewStatusSchema>;
export type ReviewPublicSort = z.infer<typeof reviewPublicSortSchema>;
export type ReviewModerationAction = z.infer<typeof reviewModerationActionSchema>;
export type ReviewEligibilityReason = z.infer<typeof reviewEligibilityReasonSchema>;
export type RatingDistribution = z.infer<typeof ratingDistributionSchema>;
export type ReviewSummary = z.infer<typeof reviewSummarySchema>;
export type ReviewSummaryResponse = z.infer<typeof reviewSummaryResponseSchema>;
export type ReviewSummaryBatchRequest = z.infer<typeof reviewSummaryBatchRequestSchema>;
export type ReviewSummaryBatchResponse = z.infer<typeof reviewSummaryBatchResponseSchema>;
export type PublicReview = z.infer<typeof publicReviewSchema>;
export type ReviewPublicListQuery = z.infer<typeof reviewPublicListQuerySchema>;
export type ReviewPublicListResponse = z.infer<typeof reviewPublicListResponseSchema>;
export type CustomerReview = z.infer<typeof customerReviewSchema>;
export type ReviewEligibleOrderLine = z.infer<typeof reviewEligibleOrderLineSchema>;
export type CustomerReviewsResponse = z.infer<typeof customerReviewsResponseSchema>;
export type ReviewEligibilityResponse = z.infer<typeof reviewEligibilityResponseSchema>;
export type ReviewCreateRequest = z.infer<typeof reviewCreateRequestSchema>;
export type ReviewUpdateRequest = z.infer<typeof reviewUpdateRequestSchema>;
export type CustomerReviewMutationResponse = z.infer<typeof customerReviewMutationResponseSchema>;
export type ReviewHelpfulRequest = z.infer<typeof reviewHelpfulRequestSchema>;
export type ReviewHelpfulResponse = z.infer<typeof reviewHelpfulResponseSchema>;
export type AdminReviewSummary = z.infer<typeof adminReviewSummarySchema>;
export type AdminReviewDetail = z.infer<typeof adminReviewDetailSchema>;
export type AdminReviewListQuery = z.infer<typeof adminReviewListQuerySchema>;
export type AdminReviewListResponse = z.infer<typeof adminReviewListResponseSchema>;
export type AdminReviewDetailResponse = z.infer<typeof adminReviewDetailResponseSchema>;
export type ReviewModerateRequest = z.infer<typeof reviewModerateRequestSchema>;
export type ReviewModerateResponse = z.infer<typeof reviewModerateResponseSchema>;

/* ════════════════════════════════════════════════════════════════════════════
 * TODO-160 (ADR-102…107) — Influencer Tracking & Attribution.
 *
 * Influencer + kampanya + takip linki CRUD (admin), public tracking yanıtı ve
 * attribution dashboard/CSV export sözleşmeleri. Enum'lar Prisma ile birebir;
 * bu Zod şemaları api-gateway + api-client + store-admin arasında TEK kaynak.
 * Para her yerde tamsayı minor unit. Attribution SUNUCU-otoriter (ADR-103).
 * ════════════════════════════════════════════════════════════════════════════ */

export const influencerStatusSchema = z.enum(["ACTIVE", "INACTIVE"]);
// ADR-170 yaşam döngüsü. ARCHIVED/INACTIVE legacy (yeni UI üretmez); sunucu ENDED/
// PAUSED semantiğine normalize eder (normalizeCampaignStatus/normalizeLinkStatus).
export const influencerCampaignStatusSchema = z.enum(["DRAFT", "ACTIVE", "PAUSED", "ENDED", "CANCELLED", "ARCHIVED"]);
export const trackingLinkTargetTypeSchema = z.enum(["HOME", "PRODUCT", "CATEGORY", "PATH"]);
export const trackingLinkStatusSchema = z.enum(["ACTIVE", "PAUSED", "REVOKED", "INACTIVE"]);
export const attributionModelSchema = z.enum(["LAST_CLICK"]);

export const INFLUENCER_NAME_MAX_LENGTH = 160;
export const INFLUENCER_CODE_MAX_LENGTH = 48;
export const INFLUENCER_NOTES_MAX_LENGTH = 2000;
export const INFLUENCER_CAMPAIGN_NAME_MAX_LENGTH = 160;
export const ATTRIBUTION_WINDOW_MIN_DAYS = 1;
export const ATTRIBUTION_WINDOW_MAX_DAYS = 365;
export const ATTRIBUTION_WINDOW_DEFAULT_DAYS = 30;
export const TRACKING_LINK_PATH_MAX_LENGTH = 512;
export const TRACKING_UTM_MAX_LENGTH = 120;

/** Influencer code: locale-BAĞIMSIZ [A-Z0-9_-], ilk karakter alfanumerik (TR-I güvenli). */
export const influencerCodeSchema = z
  .string()
  .trim()
  .min(2)
  .max(INFLUENCER_CODE_MAX_LENGTH)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);

/* ── Influencer (admin CRUD) ────────────────────────────────────────────────── */

export const influencerSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
  email: z.string().nullable(),
  status: influencerStatusSchema,
  campaignCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const influencerDetailSchema = influencerSummarySchema.extend({
  notes: z.string().nullable(),
});

export const influencerCreateRequestSchema = z.object({
  name: z.string().trim().min(1).max(INFLUENCER_NAME_MAX_LENGTH),
  code: influencerCodeSchema,
  email: z.string().trim().email().max(200).nullish(),
  status: influencerStatusSchema.optional(),
  notes: z.string().trim().max(INFLUENCER_NOTES_MAX_LENGTH).nullish(),
});

export const influencerUpdateRequestSchema = z.object({
  name: z.string().trim().min(1).max(INFLUENCER_NAME_MAX_LENGTH).optional(),
  code: influencerCodeSchema.optional(),
  email: z.string().trim().email().max(200).nullish(),
  status: influencerStatusSchema.optional(),
  notes: z.string().trim().max(INFLUENCER_NOTES_MAX_LENGTH).nullish(),
});

export const influencerListQuerySchema = adminListQueryBaseSchema.extend({
  sortBy: z.enum(["createdAt", "name", "code", "status"]).optional(),
  status: influencerStatusSchema.optional(),
});

export const influencerListResponseSchema = z.object({
  data: z.array(influencerSummarySchema),
  pagination: adminListPaginationSchema,
});
export const influencerDetailResponseSchema = z.object({ data: influencerDetailSchema });

/* ── Influencer Campaign (admin CRUD) ───────────────────────────────────────── */

export const influencerCampaignSummarySchema = z.object({
  id: z.string(),
  influencerId: z.string(),
  influencerName: z.string(),
  name: z.string(),
  status: influencerCampaignStatusSchema,
  attributionWindowDays: z.number().int().positive(),
  startsAt: z.string().datetime().nullable(),
  endsAt: z.string().datetime().nullable(),
  linkCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const influencerCampaignCreateRequestSchema = z
  .object({
    influencerId: z.string().min(1),
    name: z.string().trim().min(1).max(INFLUENCER_CAMPAIGN_NAME_MAX_LENGTH),
    status: influencerCampaignStatusSchema.optional(),
    attributionWindowDays: z.coerce
      .number()
      .int()
      .min(ATTRIBUTION_WINDOW_MIN_DAYS)
      .max(ATTRIBUTION_WINDOW_MAX_DAYS)
      .optional(),
    startsAt: z.string().datetime().nullish(),
    endsAt: z.string().datetime().nullish(),
  })
  .superRefine((value, ctx) => {
    if (value.startsAt && value.endsAt && new Date(value.endsAt) < new Date(value.startsAt)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endsAt"], message: "Bitiş başlangıçtan önce olamaz." });
    }
  });

export const influencerCampaignUpdateRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(INFLUENCER_CAMPAIGN_NAME_MAX_LENGTH).optional(),
    status: influencerCampaignStatusSchema.optional(),
    attributionWindowDays: z.coerce
      .number()
      .int()
      .min(ATTRIBUTION_WINDOW_MIN_DAYS)
      .max(ATTRIBUTION_WINDOW_MAX_DAYS)
      .optional(),
    startsAt: z.string().datetime().nullish(),
    endsAt: z.string().datetime().nullish(),
  })
  .superRefine((value, ctx) => {
    if (value.startsAt && value.endsAt && new Date(value.endsAt) < new Date(value.startsAt)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endsAt"], message: "Bitiş başlangıçtan önce olamaz." });
    }
  });

export const influencerCampaignListQuerySchema = adminListQueryBaseSchema.extend({
  sortBy: z.enum(["createdAt", "name", "status"]).optional(),
  status: influencerCampaignStatusSchema.optional(),
  influencerId: z.string().min(1).optional(),
});

export const influencerCampaignListResponseSchema = z.object({
  data: z.array(influencerCampaignSummarySchema),
  pagination: adminListPaginationSchema,
});
export const influencerCampaignDetailResponseSchema = z.object({ data: influencerCampaignSummarySchema });

/* ── Tracking Link (admin CRUD + kopyalanabilir URL) ────────────────────────── */

// NOT (ADR-102 revizyon): token/plain URL liste/detay projeksiyonunda YER ALMAZ.
// Plain token DB'de saklanmaz (tokenHash); plain URL yalnız oluşturma/yenileme
// yanıtında BİR KEZ döner (trackingLinkWithUrlSchema). Liste linki hedef/kampanya/
// tarih ile tanınır; kopyalanabilir URL için "yeni link üret" (rotation) sunulur.
export const trackingLinkSummarySchema = z.object({
  id: z.string(),
  campaignId: z.string(),
  campaignName: z.string(),
  influencerId: z.string(),
  influencerName: z.string(),
  targetType: trackingLinkTargetTypeSchema,
  targetPath: z.string(),
  productId: z.string().nullable(),
  productTitle: z.string().nullable(),
  categoryId: z.string().nullable(),
  categoryTitle: z.string().nullable(),
  utmSource: z.string().nullable(),
  utmMedium: z.string().nullable(),
  utmCampaign: z.string().nullable(),
  utmContent: z.string().nullable(),
  utmTerm: z.string().nullable(),
  customLabel: z.string().nullable(),
  status: trackingLinkStatusSchema,
  activatedAt: z.string().datetime().nullable(),
  pausedAt: z.string().datetime().nullable(),
  revokedAt: z.string().datetime().nullable(),
  totalClicks: z.number().int().nonnegative(),
  attributedOrders: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

/**
 * Oluşturma/yenileme yanıtı: özet + TEK SEFERLİK kopyalanabilir plain URL
 * (STOREFRONT_PUBLIC_BASE_URL tanımlıysa mutlak). Bu URL bir daha DÖNMEZ;
 * kaybedilirse "yeni link üret" ile rotasyon yapılır (eski token geçersizlenir).
 */
export const trackingLinkWithUrlSchema = trackingLinkSummarySchema.extend({
  url: z.string(),
});

export const trackingLinkCreateRequestSchema = z
  .object({
    campaignId: z.string().min(1),
    targetType: trackingLinkTargetTypeSchema,
    productId: z.string().min(1).nullish(),
    categoryId: z.string().min(1).nullish(),
    /** targetType=PATH için serbest iç yol; sunucu güvenli-yola normalize eder. */
    targetPath: z.string().trim().max(TRACKING_LINK_PATH_MAX_LENGTH).nullish(),
    utmSource: z.string().trim().max(TRACKING_UTM_MAX_LENGTH).nullish(),
    utmMedium: z.string().trim().max(TRACKING_UTM_MAX_LENGTH).nullish(),
    utmCampaign: z.string().trim().max(TRACKING_UTM_MAX_LENGTH).nullish(),
    utmContent: z.string().trim().max(TRACKING_UTM_MAX_LENGTH).nullish(),
    utmTerm: z.string().trim().max(TRACKING_UTM_MAX_LENGTH).nullish(),
    customLabel: z.string().trim().max(TRACKING_UTM_MAX_LENGTH).nullish(),
  })
  .superRefine((value, ctx) => {
    if (value.targetType === "PRODUCT" && !value.productId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["productId"], message: "Ürün seçilmeli." });
    }
    if (value.targetType === "CATEGORY" && !value.categoryId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["categoryId"], message: "Kategori seçilmeli." });
    }
    if (value.targetType === "PATH" && !value.targetPath) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["targetPath"], message: "Hedef yol zorunlu." });
    }
  });

/**
 * Link immutable (token/hedef/UTM sabit — ADR-175); yalnız yaşam döngüsü status
 * geçişi. Kabul edilen hedef değerler: ACTIVE (etkinleştir) | PAUSED (durdur) |
 * REVOKED (iptal, terminal). INACTIVE legacy — yeni istekte kullanılmaz.
 */
export const trackingLinkUpdateRequestSchema = z.object({
  status: z.enum(["ACTIVE", "PAUSED", "REVOKED"]),
});

export const trackingLinkListQuerySchema = adminListQueryBaseSchema.extend({
  sortBy: z.enum(["createdAt", "status", "totalClicks", "attributedOrders"]).optional(),
  status: trackingLinkStatusSchema.optional(),
  campaignId: z.string().min(1).optional(),
  influencerId: z.string().min(1).optional(),
});

export const trackingLinkListResponseSchema = z.object({
  data: z.array(trackingLinkSummarySchema),
  pagination: adminListPaginationSchema,
});
export const trackingLinkDetailResponseSchema = z.object({ data: trackingLinkSummarySchema });
/** Oluşturma + yenileme (regenerate): tek-seferlik plain URL taşır. */
export const trackingLinkCreateResponseSchema = z.object({ data: trackingLinkWithUrlSchema });

/* ── Public tracking yanıtı (storefront BFF → gateway) ──────────────────────── */

/** Public redirect reddedilme domain kodu (ADR-171). Ham gösterilmez → i18n eşlenir. */
export const trackingDenyReasonSchema = z.enum([
  "STORE_NOT_ACTIVE",
  "INFLUENCER_NOT_ACTIVE",
  "CAMPAIGN_NOT_ACTIVE",
  "CAMPAIGN_ENDED",
  "CAMPAIGN_CANCELLED",
  "TRACKING_LINK_NOT_ACTIVE",
  "TRACKING_LINK_REVOKED",
  "TRACKING_TARGET_NOT_AVAILABLE",
]);
/** Terminal sayfa mesaj kovası — ürün adı/özel bilgi sızdırmaz (ADR-172). */
export const terminalReasonBucketSchema = z.enum(["ended", "inactive", "unavailable"]);

/**
 * Gateway click kaydı sonrası storefront'a döndürdüğü karar (ADR-171/172).
 *  - available=true → grant + güvenli hedef (`targetPath`); storefront grant'i cookie'ye
 *    yazar ve hedefe redirect eder.
 *  - available=false → hedef ürün/sayfa SIZDIRILMAZ (targetPath null); storefront markalı
 *    terminal sayfaya (`/campaign-unavailable?state=<bucket>`) yönlendirir. Click/session/
 *    cookie yazılmaz. `reason` ham domain kodu (log/gözlem); `bucket` public mesaj kovası.
 */
export const trackClickResponseSchema = z.object({
  data: z.object({
    available: z.boolean(),
    grant: z.string().nullable(),
    targetPath: z.string().nullable(),
    reason: trackingDenyReasonSchema.nullable(),
    bucket: terminalReasonBucketSchema.nullable(),
    cookieMaxAgeSeconds: z.number().int().positive(),
  }),
});

/* ── Attribution dashboard + CSV export ─────────────────────────────────────── */

/** Analytics tarih aralığı üst sınırı (gün) — bounded (ADR-178). Aşan aralık kırpılır. */
export const ANALYTICS_MAX_RANGE_DAYS = 366;
export const ANALYTICS_DEFAULT_RANGE_DAYS = 30;

export const influencerAnalyticsQuerySchema = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  influencerId: z.string().min(1).optional(),
  campaignId: z.string().min(1).optional(),
  trackingLinkId: z.string().min(1).optional(),
  // Zaman serisi + kırılım filtreleri (campaign dashboard). UTM link'ten (immutable) eşlenir.
  utmSource: z.string().min(1).max(TRACKING_UTM_MAX_LENGTH).optional(),
  utmMedium: z.string().min(1).max(TRACKING_UTM_MAX_LENGTH).optional(),
  utmCampaign: z.string().min(1).max(TRACKING_UTM_MAX_LENGTH).optional(),
});

/**
 * Para birimi başına gelir (ADR-176). Gelir YALNIZ aynı currency içinde toplanır;
 * çok para birimli mağazada sessiz tek toplam ÜRETİLMEZ — her currency ayrı satır.
 */
export const attributionCurrencyRevenueSchema = z.object({
  currency: z.string(),
  attributedOrders: z.number().int().nonnegative(),
  grossRevenueMinor: z.number().int().nonnegative(),
  refundedRevenueMinor: z.number().int().nonnegative(),
  netRevenueMinor: z.number().int().nonnegative(),
  averageOrderValueMinor: z.number().int().nonnegative(),
});

export const attributionKpiSummarySchema = z.object({
  totalClicks: z.number().int().nonnegative(),
  uniqueVisitors: z.number().int().nonnegative(),
  attributedOrders: z.number().int().nonnegative(),
  conversionRate: z.number().nonnegative(),
  grossRevenueMinor: z.number().int().nonnegative(),
  refundedRevenueMinor: z.number().int().nonnegative(),
  netRevenueMinor: z.number().int().nonnegative(),
  averageOrderValueMinor: z.number().int().nonnegative(),
  // Birincil (en yüksek net gelirli) currency — geriye dönük uyum. Gerçek dağılım `revenues`.
  currency: z.string(),
  // Para birimi başına ayrı toplam (ADR-176). Tek currency ise tek eleman.
  revenues: z.array(attributionCurrencyRevenueSchema),
  hasMultipleCurrencies: z.boolean(),
});

/** Günlük seri için para birimi başına gelir (ADR-176/179 — cross-currency birleştirmez). */
export const attributionDailyCurrencyRevenueSchema = z.object({
  currency: z.string(),
  grossRevenueMinor: z.number().int().nonnegative(),
  netRevenueMinor: z.number().int().nonnegative(),
});

export const attributionDailyPointSchema = z.object({
  date: z.string(), // YYYY-MM-DD (store timezone gün sınırı — ADR-178)
  clicks: z.number().int().nonnegative(),
  uniqueVisitors: z.number().int().nonnegative(),
  orders: z.number().int().nonnegative(),
  conversionRate: z.number().nonnegative(),
  // Birincil currency özet (geri uyum) — gerçek dağılım `revenues`.
  grossRevenueMinor: z.number().int().nonnegative(),
  netRevenueMinor: z.number().int().nonnegative(),
  revenues: z.array(attributionDailyCurrencyRevenueSchema),
});

export const attributionInfluencerBreakdownSchema = z.object({
  influencerId: z.string(),
  influencerName: z.string(),
  code: z.string(),
  clicks: z.number().int().nonnegative(),
  orders: z.number().int().nonnegative(),
  grossRevenueMinor: z.number().int().nonnegative(),
  netRevenueMinor: z.number().int().nonnegative(),
});

export const attributionCampaignBreakdownSchema = z.object({
  campaignId: z.string(),
  campaignName: z.string(),
  influencerName: z.string(),
  clicks: z.number().int().nonnegative(),
  orders: z.number().int().nonnegative(),
  grossRevenueMinor: z.number().int().nonnegative(),
  netRevenueMinor: z.number().int().nonnegative(),
});

// url YOK (ADR-102 revizyon): plain URL projeksiyonda gösterilmez. Link kampanya/
// influencer adı ve targetPath ile tanınır.
export const attributionTopLinkSchema = z.object({
  trackingLinkId: z.string(),
  campaignName: z.string(),
  influencerName: z.string(),
  targetPath: z.string(),
  clicks: z.number().int().nonnegative(),
  orders: z.number().int().nonnegative(),
  netRevenueMinor: z.number().int().nonnegative(),
});

export const attributionTopProductSchema = z.object({
  productId: z.string(),
  productTitle: z.string(),
  orders: z.number().int().nonnegative(),
  grossRevenueMinor: z.number().int().nonnegative(),
});

export const influencerAnalyticsResponseSchema = z.object({
  data: z.object({
    summary: attributionKpiSummarySchema,
    daily: z.array(attributionDailyPointSchema),
    influencers: z.array(attributionInfluencerBreakdownSchema),
    campaigns: z.array(attributionCampaignBreakdownSchema),
    topLinks: z.array(attributionTopLinkSchema),
    topProducts: z.array(attributionTopProductSchema),
  }),
});

/* ── Granüler 3-seviyeli dashboard (ADR-174) ────────────────────────────────── */

/** Metrik gövdesi — tüm seviyelerde (campaign/link) ortak KPI (ADR-174/176). */
export const attributionMetricBodySchema = z.object({
  clicks: z.number().int().nonnegative(),
  uniqueVisitors: z.number().int().nonnegative(),
  attributedOrders: z.number().int().nonnegative(),
  conversionRate: z.number().nonnegative(),
  grossRevenueMinor: z.number().int().nonnegative(),
  refundedRevenueMinor: z.number().int().nonnegative(),
  netRevenueMinor: z.number().int().nonnegative(),
  averageOrderValueMinor: z.number().int().nonnegative(),
  currency: z.string(),
  revenues: z.array(attributionCurrencyRevenueSchema),
  hasMultipleCurrencies: z.boolean(),
});

/** Influencer toplamı: kampanya/link sayıları (yalnız aggregate seviyesinde). */
export const attributionInfluencerTotalsSchema = z.object({
  campaignCount: z.number().int().nonnegative(),
  activeCampaignCount: z.number().int().nonnegative(),
  linkCount: z.number().int().nonnegative(),
});

/** Kampanya bazlı zengin satır (B seviyesi tablo — satır tıklanınca kampanya detayı). */
export const attributionCampaignRowSchema = attributionMetricBodySchema.extend({
  campaignId: z.string(),
  campaignName: z.string(),
  influencerId: z.string(),
  influencerName: z.string(),
  status: influencerCampaignStatusSchema,
  startsAt: z.string().datetime().nullable(),
  endsAt: z.string().datetime().nullable(),
  attributionWindowDays: z.number().int().positive(),
  linkCount: z.number().int().nonnegative(),
});

/** Link bazlı zengin satır (C seviyesi tablo — seçili kampanya altında her URL). */
export const attributionLinkRowSchema = attributionMetricBodySchema.extend({
  trackingLinkId: z.string(),
  campaignId: z.string(),
  campaignName: z.string(),
  targetType: trackingLinkTargetTypeSchema,
  targetPath: z.string(),
  productTitle: z.string().nullable(),
  categoryTitle: z.string().nullable(),
  status: trackingLinkStatusSchema,
  createdAt: z.string().datetime(),
  activatedAt: z.string().datetime().nullable(),
  pausedAt: z.string().datetime().nullable(),
  revokedAt: z.string().datetime().nullable(),
  utmSource: z.string().nullable(),
  utmMedium: z.string().nullable(),
  utmCampaign: z.string().nullable(),
  utmContent: z.string().nullable(),
  utmTerm: z.string().nullable(),
  customLabel: z.string().nullable(),
  attributionWindowDays: z.number().int().positive(),
});

/**
 * UTM kırılımı (kampanya detayı) — currency-aware (ADR-179/TD-144). Her UTM kombinasyonu
 * için clicks/unique/orders/CR + para birimi başına AYRI gelir (sessiz cross-currency toplam
 * YOK). customLabel dahil. UTM/customLabel link'ten (immutable) türetilir.
 */
export const attributionUtmBreakdownSchema = z.object({
  utmSource: z.string().nullable(),
  utmMedium: z.string().nullable(),
  utmCampaign: z.string().nullable(),
  utmContent: z.string().nullable(),
  utmTerm: z.string().nullable(),
  customLabel: z.string().nullable(),
  clicks: z.number().int().nonnegative(),
  uniqueVisitors: z.number().int().nonnegative(),
  attributedOrders: z.number().int().nonnegative(),
  conversionRate: z.number().nonnegative(),
  revenues: z.array(attributionCurrencyRevenueSchema),
  hasMultipleCurrencies: z.boolean(),
});

/** Son atıflı sipariş satırı (kampanya/link detayında). */
export const attributionRecentOrderSchema = z.object({
  orderNumber: z.string(),
  attributedAt: z.string().datetime(),
  targetPath: z.string().nullable(),
  netRevenueMinor: z.number().int().nonnegative(),
  currency: z.string(),
});

/** A. Influencer toplam dashboard yanıtı (`GET .../influencers/:id/analytics`). */
export const influencerAggregateAnalyticsResponseSchema = z.object({
  data: z.object({
    summary: attributionKpiSummarySchema,
    totals: attributionInfluencerTotalsSchema,
    campaigns: z.array(attributionCampaignRowSchema),
    daily: z.array(attributionDailyPointSchema),
  }),
});

/** B. Kampanya detay dashboard yanıtı (`GET .../influencer-campaigns/:id/analytics`). */
export const campaignAnalyticsResponseSchema = z.object({
  data: z.object({
    campaign: z.object({
      campaignId: z.string(),
      campaignName: z.string(),
      influencerId: z.string(),
      influencerName: z.string(),
      status: influencerCampaignStatusSchema,
      startsAt: z.string().datetime().nullable(),
      endsAt: z.string().datetime().nullable(),
      attributionWindowDays: z.number().int().positive(),
      linkCount: z.number().int().nonnegative(),
    }),
    summary: attributionKpiSummarySchema,
    links: z.array(attributionLinkRowSchema),
    daily: z.array(attributionDailyPointSchema),
    utm: z.array(attributionUtmBreakdownSchema),
    targets: z.array(attributionTopLinkSchema),
    recentOrders: z.array(attributionRecentOrderSchema),
  }),
});

/** C. Link detay dashboard yanıtı (`GET .../influencer-tracking-links/:id/analytics`). */
export const linkAnalyticsResponseSchema = z.object({
  data: z.object({
    link: attributionLinkRowSchema,
    summary: attributionKpiSummarySchema,
    daily: z.array(attributionDailyPointSchema),
    recentOrders: z.array(attributionRecentOrderSchema),
    lastClickAt: z.string().datetime().nullable(),
    lastConversionAt: z.string().datetime().nullable(),
  }),
});

export type InfluencerStatus = z.infer<typeof influencerStatusSchema>;
export type InfluencerCampaignStatus = z.infer<typeof influencerCampaignStatusSchema>;
export type TrackingLinkTargetType = z.infer<typeof trackingLinkTargetTypeSchema>;
export type TrackingLinkStatus = z.infer<typeof trackingLinkStatusSchema>;
export type AttributionModel = z.infer<typeof attributionModelSchema>;
export type InfluencerSummary = z.infer<typeof influencerSummarySchema>;
export type InfluencerDetail = z.infer<typeof influencerDetailSchema>;
export type InfluencerCreateRequest = z.infer<typeof influencerCreateRequestSchema>;
export type InfluencerUpdateRequest = z.infer<typeof influencerUpdateRequestSchema>;
export type InfluencerListQuery = z.infer<typeof influencerListQuerySchema>;
export type InfluencerListResponse = z.infer<typeof influencerListResponseSchema>;
export type InfluencerDetailResponse = z.infer<typeof influencerDetailResponseSchema>;
export type InfluencerCampaignSummary = z.infer<typeof influencerCampaignSummarySchema>;
export type InfluencerCampaignCreateRequest = z.infer<typeof influencerCampaignCreateRequestSchema>;
export type InfluencerCampaignUpdateRequest = z.infer<typeof influencerCampaignUpdateRequestSchema>;
export type InfluencerCampaignListQuery = z.infer<typeof influencerCampaignListQuerySchema>;
export type InfluencerCampaignListResponse = z.infer<typeof influencerCampaignListResponseSchema>;
export type InfluencerCampaignDetailResponse = z.infer<typeof influencerCampaignDetailResponseSchema>;
export type TrackingLinkSummary = z.infer<typeof trackingLinkSummarySchema>;
export type TrackingLinkWithUrl = z.infer<typeof trackingLinkWithUrlSchema>;
export type TrackingLinkCreateRequest = z.infer<typeof trackingLinkCreateRequestSchema>;
export type TrackingLinkUpdateRequest = z.infer<typeof trackingLinkUpdateRequestSchema>;
export type TrackingLinkListQuery = z.infer<typeof trackingLinkListQuerySchema>;
export type TrackingLinkListResponse = z.infer<typeof trackingLinkListResponseSchema>;
export type TrackingLinkDetailResponse = z.infer<typeof trackingLinkDetailResponseSchema>;
export type TrackingLinkCreateResponse = z.infer<typeof trackingLinkCreateResponseSchema>;
export type TrackClickResponse = z.infer<typeof trackClickResponseSchema>;
export type InfluencerAnalyticsQuery = z.infer<typeof influencerAnalyticsQuerySchema>;
export type AttributionKpiSummary = z.infer<typeof attributionKpiSummarySchema>;
export type AttributionDailyPoint = z.infer<typeof attributionDailyPointSchema>;
export type AttributionInfluencerBreakdown = z.infer<typeof attributionInfluencerBreakdownSchema>;
export type AttributionCampaignBreakdown = z.infer<typeof attributionCampaignBreakdownSchema>;
export type AttributionTopLink = z.infer<typeof attributionTopLinkSchema>;
export type AttributionTopProduct = z.infer<typeof attributionTopProductSchema>;
export type InfluencerAnalyticsResponse = z.infer<typeof influencerAnalyticsResponseSchema>;
export type TrackingDenyReason = z.infer<typeof trackingDenyReasonSchema>;
export type TerminalReasonBucket = z.infer<typeof terminalReasonBucketSchema>;
export type AttributionCurrencyRevenue = z.infer<typeof attributionCurrencyRevenueSchema>;
export type AttributionDailyCurrencyRevenue = z.infer<typeof attributionDailyCurrencyRevenueSchema>;
export type AttributionMetricBody = z.infer<typeof attributionMetricBodySchema>;
export type AttributionInfluencerTotals = z.infer<typeof attributionInfluencerTotalsSchema>;
export type AttributionCampaignRow = z.infer<typeof attributionCampaignRowSchema>;
export type AttributionLinkRow = z.infer<typeof attributionLinkRowSchema>;
export type AttributionUtmBreakdown = z.infer<typeof attributionUtmBreakdownSchema>;
export type AttributionRecentOrder = z.infer<typeof attributionRecentOrderSchema>;
export type InfluencerAggregateAnalyticsResponse = z.infer<typeof influencerAggregateAnalyticsResponseSchema>;
export type CampaignAnalyticsResponse = z.infer<typeof campaignAnalyticsResponseSchema>;
export type LinkAnalyticsResponse = z.infer<typeof linkAnalyticsResponseSchema>;

/* ════════════════════════════════════════════════════════════════════════════
 * TODO-161 (ADR-114…120) — Sponsored Product Management.
 *
 * Sponsorlu kampanya + placement + hedefleme CRUD (admin), public event (impression/
 * click/cart) ve performans dashboard/CSV sözleşmeleri. Enum'lar Prisma ile birebir.
 * Organik aramadan İZOLE (ADR-091 karar 5); ölçüm TODO-160 attribution KATMANINI
 * yeniden kullanır. Para tamsayı minor unit. Order/refund SUNUCU-otoriter (ADR-118).
 * ════════════════════════════════════════════════════════════════════════════ */

export const sponsoredCampaignStatusSchema = z.enum(["ACTIVE", "PAUSED", "ARCHIVED"]);
export const sponsoredPlacementTypeSchema = z.enum(["HOME_SHOWCASE", "SEARCH_RESULTS"]);
export const sponsoredEventTypeSchema = z.enum(["IMPRESSION", "CLICK", "CART"]);

export const SPONSORED_CAMPAIGN_NAME_MAX_LENGTH = 160;
export const SPONSORED_MAX_PRODUCTS = 48;
export const SPONSORED_MAX_KEYWORDS = 32;
export const SPONSORED_KEYWORD_MAX_LENGTH = 80;
export const SPONSORED_PRIORITY_MIN = 0;
export const SPONSORED_PRIORITY_MAX = 1000;
export const SPONSORED_MAX_SLOTS_MIN = 1;
export const SPONSORED_MAX_SLOTS_MAX = 24;

/** Hedef anahtar kelime: serbest metin (sunucu normalize eder); boş/uzun reddedilir. */
export const sponsoredKeywordSchema = z.string().trim().min(1).max(SPONSORED_KEYWORD_MAX_LENGTH);

/* ── Sponsorlu kampanya (admin CRUD) ────────────────────────────────────────── */

export const sponsoredCampaignPlacementProductSchema = z.object({
  productId: z.string(),
  title: z.string(),
  slug: z.string(),
  position: z.number().int().nullable(),
  priority: z.number().int(),
  // Aday uygunlugu (read-model): ACTIVE + hasStock degilse sponsorlu gosterilmez (admin uyarisi).
  eligible: z.boolean(),
});

export const sponsoredCampaignSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  status: sponsoredCampaignStatusSchema,
  placement: sponsoredPlacementTypeSchema,
  startsAt: z.string().datetime().nullable(),
  endsAt: z.string().datetime().nullable(),
  priority: z.number().int(),
  maxSlots: z.number().int().positive(),
  targetCategoryId: z.string().nullable(),
  targetCategoryLabel: z.string().nullable(),
  timezone: z.string(),
  productCount: z.number().int().nonnegative(),
  keywordCount: z.number().int().nonnegative(),
  // Server-türetilmiş aktiflik (status ACTIVE + pencere geçerli) → liste rozeti.
  isLive: z.boolean(),
  // Ticari mod (TODO-161A.2/ADR-128): INTERNAL_PROMOTION = mağazanın kendi ürünü (anlaşma gerekmez);
  // SPONSORED = üçüncü taraf adına, geçerli anlaşma ZORUNLU.
  commercialMode: z.enum(["INTERNAL_PROMOTION", "SPONSORED"]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const sponsoredCampaignDetailSchema = sponsoredCampaignSummarySchema.extend({
  products: z.array(sponsoredCampaignPlacementProductSchema),
  keywords: z.array(z.string()),
});

const sponsoredCampaignWritableFields = {
  name: z.string().trim().min(1).max(SPONSORED_CAMPAIGN_NAME_MAX_LENGTH),
  status: sponsoredCampaignStatusSchema.optional(),
  startsAt: z.string().datetime().nullish(),
  endsAt: z.string().datetime().nullish(),
  priority: z.coerce.number().int().min(SPONSORED_PRIORITY_MIN).max(SPONSORED_PRIORITY_MAX).optional(),
  maxSlots: z.coerce.number().int().min(SPONSORED_MAX_SLOTS_MIN).max(SPONSORED_MAX_SLOTS_MAX).optional(),
  targetCategoryId: z.string().min(1).nullish(),
  timezone: z.string().trim().min(1).max(64).optional(),
  // Atomik replace-set: verilen ürün id listesi (sıralı → position). Verilmezse dokunulmaz (update).
  productIds: z.array(z.string().min(1)).max(SPONSORED_MAX_PRODUCTS).optional(),
  // SEARCH_RESULTS query allowlist (sunucu normalize + tekilleştirir). HOME_SHOWCASE'te YOK SAYILIR.
  keywords: z.array(sponsoredKeywordSchema).max(SPONSORED_MAX_KEYWORDS).optional(),
  // Ticari mod (TODO-161A.2). Verilmezse INTERNAL_PROMOTION varsayılır (sıfır regresyon).
  commercialMode: z.enum(["INTERNAL_PROMOTION", "SPONSORED"]).optional(),
};

function refineSponsoredDates(
  value: { startsAt?: string | null; endsAt?: string | null },
  ctx: z.RefinementCtx,
) {
  if (value.startsAt && value.endsAt && new Date(value.endsAt) < new Date(value.startsAt)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endsAt"], message: "Bitiş başlangıçtan önce olamaz." });
  }
}

export const sponsoredCampaignCreateRequestSchema = z
  .object({
    ...sponsoredCampaignWritableFields,
    // placement create'te ZORUNLU + sonrasında IMMUTABLE (ölçüm/slot semantiği tipe bağlı).
    placement: sponsoredPlacementTypeSchema,
    // TODO-161A.2 — birleşik akış: SPONSORED kampanya oluşturulurken doğrudan bir anlaşmaya bağla.
    // Verilirse sunucu link'i kurar (pencere kapsama + tekil-anlaşma guard'ları uygulanır).
    agreementId: z.string().min(1).nullish(),
    allocationAmountMinor: z.number().int().min(0).max(2_000_000_000).nullish(),
  })
  .superRefine(refineSponsoredDates);

export const sponsoredCampaignUpdateRequestSchema = z
  .object({
    ...sponsoredCampaignWritableFields,
    name: sponsoredCampaignWritableFields.name.optional(),
  })
  .superRefine((value, ctx) => {
    refineSponsoredDates(value, ctx);
    if (Object.keys(value).length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "At least one field is required." });
    }
  });

export const sponsoredCampaignListQuerySchema = adminListQueryBaseSchema.extend({
  sortBy: z.enum(["createdAt", "name", "status", "priority"]).optional(),
  status: sponsoredCampaignStatusSchema.optional(),
  placement: sponsoredPlacementTypeSchema.optional(),
});

export const sponsoredCampaignListResponseSchema = z.object({
  data: z.array(sponsoredCampaignSummarySchema),
  pagination: adminListPaginationSchema,
});
export const sponsoredCampaignDetailResponseSchema = z.object({ data: sponsoredCampaignDetailSchema });

/* ── Public event (impression/click/cart) ───────────────────────────────────── */

// Opak GATEWAY-imzalı token (campaignId/placementId/productId içerir; istemci BELİRLEYEMEZ). source
// serbest bağlam etiketi (örn. "search"/"home"); ölçüm ham verisidir, güvenlik kararı ETKİLEMEZ.
export const sponsoredEventRequestSchema = z.object({
  type: sponsoredEventTypeSchema,
  token: z.string().min(1).max(2048),
  source: z.string().trim().max(40).nullish(),
});
export const sponsoredEventResponseSchema = z.object({
  data: z.object({ recorded: z.boolean() }),
});

/* ── Performans dashboard + CSV export ──────────────────────────────────────── */

export const sponsoredAnalyticsQuerySchema = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  campaignId: z.string().min(1).optional(),
  placement: sponsoredPlacementTypeSchema.optional(),
  productId: z.string().min(1).optional(),
});

export const sponsoredKpiSummarySchema = z.object({
  impressions: z.number().int().nonnegative(),
  uniqueImpressions: z.number().int().nonnegative(),
  clicks: z.number().int().nonnegative(),
  clickThroughRate: z.number().nonnegative(),
  carts: z.number().int().nonnegative(),
  orders: z.number().int().nonnegative(),
  conversionRate: z.number().nonnegative(),
  grossRevenueMinor: z.number().int().nonnegative(),
  refundedRevenueMinor: z.number().int().nonnegative(),
  netRevenueMinor: z.number().int().nonnegative(),
  currency: z.string(),
});

export const sponsoredDailyPointSchema = z.object({
  date: z.string(), // YYYY-MM-DD
  impressions: z.number().int().nonnegative(),
  clicks: z.number().int().nonnegative(),
  orders: z.number().int().nonnegative(),
  grossRevenueMinor: z.number().int().nonnegative(),
  netRevenueMinor: z.number().int().nonnegative(),
});

export const sponsoredCampaignBreakdownSchema = z.object({
  campaignId: z.string(),
  campaignName: z.string(),
  placement: sponsoredPlacementTypeSchema,
  impressions: z.number().int().nonnegative(),
  clicks: z.number().int().nonnegative(),
  orders: z.number().int().nonnegative(),
  grossRevenueMinor: z.number().int().nonnegative(),
  netRevenueMinor: z.number().int().nonnegative(),
});

export const sponsoredProductBreakdownSchema = z.object({
  productId: z.string(),
  productTitle: z.string(),
  impressions: z.number().int().nonnegative(),
  clicks: z.number().int().nonnegative(),
  orders: z.number().int().nonnegative(),
  grossRevenueMinor: z.number().int().nonnegative(),
});

export const sponsoredPlacementBreakdownSchema = z.object({
  placement: sponsoredPlacementTypeSchema,
  impressions: z.number().int().nonnegative(),
  clicks: z.number().int().nonnegative(),
  orders: z.number().int().nonnegative(),
  grossRevenueMinor: z.number().int().nonnegative(),
});

export const sponsoredTopSearchTermSchema = z.object({
  keyword: z.string(),
  campaignCount: z.number().int().nonnegative(),
});

export const sponsoredAnalyticsResponseSchema = z.object({
  data: z.object({
    summary: sponsoredKpiSummarySchema,
    daily: z.array(sponsoredDailyPointSchema),
    campaigns: z.array(sponsoredCampaignBreakdownSchema),
    products: z.array(sponsoredProductBreakdownSchema),
    placements: z.array(sponsoredPlacementBreakdownSchema),
    topSearchTerms: z.array(sponsoredTopSearchTermSchema),
  }),
});

export type SponsoredCampaignStatus = z.infer<typeof sponsoredCampaignStatusSchema>;
export type SponsoredPlacementType = z.infer<typeof sponsoredPlacementTypeSchema>;
export type SponsoredEventType = z.infer<typeof sponsoredEventTypeSchema>;
export type SponsoredCampaignPlacementProduct = z.infer<typeof sponsoredCampaignPlacementProductSchema>;
export type SponsoredCampaignSummary = z.infer<typeof sponsoredCampaignSummarySchema>;
export type SponsoredCampaignDetail = z.infer<typeof sponsoredCampaignDetailSchema>;
export type SponsoredCampaignCreateRequest = z.infer<typeof sponsoredCampaignCreateRequestSchema>;
export type SponsoredCampaignUpdateRequest = z.infer<typeof sponsoredCampaignUpdateRequestSchema>;
export type SponsoredCampaignListQuery = z.infer<typeof sponsoredCampaignListQuerySchema>;
export type SponsoredCampaignListResponse = z.infer<typeof sponsoredCampaignListResponseSchema>;
export type SponsoredCampaignDetailResponse = z.infer<typeof sponsoredCampaignDetailResponseSchema>;
export type SponsoredEventRequest = z.infer<typeof sponsoredEventRequestSchema>;
export type SponsoredEventResponse = z.infer<typeof sponsoredEventResponseSchema>;
export type SponsoredAnalyticsQuery = z.infer<typeof sponsoredAnalyticsQuerySchema>;
export type SponsoredKpiSummary = z.infer<typeof sponsoredKpiSummarySchema>;
export type SponsoredDailyPoint = z.infer<typeof sponsoredDailyPointSchema>;
export type SponsoredCampaignBreakdown = z.infer<typeof sponsoredCampaignBreakdownSchema>;
export type SponsoredProductBreakdown = z.infer<typeof sponsoredProductBreakdownSchema>;
export type SponsoredPlacementBreakdown = z.infer<typeof sponsoredPlacementBreakdownSchema>;
export type SponsoredTopSearchTerm = z.infer<typeof sponsoredTopSearchTermSchema>;
export type SponsoredAnalyticsResponse = z.infer<typeof sponsoredAnalyticsResponseSchema>;

/**
 * ============================================================================
 * TODO-161A (ADR-121…127) — Sponsorship Agreements, Billing & Settlement.
 *
 * Sponsor firma cari kaydı → anlaşma → dönemsel mutabakat (settlement) → tahakkuk
 * (charge) → tahsilat (payment). TÜMÜ store-admin yüzeyidir; **public uç YOKTUR**
 * (vergi no / iletişim / fatura adresi / sözleşme belgesi hiçbir public response'a çıkmaz).
 *
 * Para tamsayı minor unit (`...Minor`); oranlar basis point (`...Bp`, 10000 = %100).
 * `displayStatus` TÜRETİLMİŞ görünüm durumudur — `OVERDUE` yalnız burada görünür,
 * DB'de kalıcı DEĞİLDİR (ADR-125).
 * ============================================================================
 */

export const sponsorAccountStatusSchema = z.enum(["ACTIVE", "INACTIVE"]);
export const sponsorshipAgreementStatusSchema = z.enum([
  "DRAFT",
  "PENDING_APPROVAL",
  "ACTIVE",
  "SUSPENDED",
  "COMPLETED",
  "CANCELLED",
]);
export const sponsorshipPricingModelSchema = z.enum(["FIXED_FEE", "CPM", "CPC", "CPA", "REVENUE_SHARE"]);
export const sponsorshipSettlementPeriodSchema = z.enum(["CAMPAIGN_END", "WEEKLY", "MONTHLY", "MANUAL"]);
export const sponsorshipSettlementStatusSchema = z.enum(["DRAFT", "FINALIZED"]);
export const sponsorshipChargeTypeSchema = z.enum(["PERIOD", "ADJUSTMENT"]);
export const sponsorshipChargeStatusSchema = z.enum(["DRAFT", "ISSUED", "PARTIALLY_PAID", "PAID", "CANCELLED"]);
/** Kalıcı durumlar + TÜRETİLMİŞ `OVERDUE` (ADR-125). */
export const sponsorshipChargeDisplayStatusSchema = z.enum([
  "DRAFT",
  "ISSUED",
  "PARTIALLY_PAID",
  "PAID",
  "CANCELLED",
  "OVERDUE",
]);
export const sponsorshipPaymentMethodSchema = z.enum([
  "BANK_TRANSFER",
  "CARD_POS",
  "CASH",
  "ONLINE_PROVIDER",
  "OTHER",
]);
export const sponsoredCommercialModeSchema = z.enum(["INTERNAL_PROMOTION", "SPONSORED"]);

/** ISO-4217 benzeri 3 harfli kod (büyük harfe normalize edilir). */
export const sponsorshipCurrencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Currency must be a 3-letter code.");

const SPONSORSHIP_TEXT_MAX = 500;
const SPONSORSHIP_NOTES_MAX = 2000;
/** Minor unit üst sınırı (~21 milyar kuruş) — Int taşmasına karşı sunucu-taraflı tavan. */
const SPONSORSHIP_MONEY_MAX = 2_000_000_000;

// ── Sponsor firma (SponsorAccount) ───────────────────────────────────────────
export const sponsorAccountSummarySchema = z.object({
  id: z.string(),
  companyName: z.string(),
  contactName: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  status: sponsorAccountStatusSchema,
  agreementCount: z.number().int().nonnegative(),
  activeAgreementCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const sponsorAccountDetailSchema = sponsorAccountSummarySchema.extend({
  taxOffice: z.string().nullable(),
  taxNumber: z.string().nullable(),
  billingAddress: z.string().nullable(),
  notes: z.string().nullable(),
  /** Para birimi bazında cari özet (farklı para birimleri TOPLANMAZ — ADR-127). */
  balances: z.array(
    z.object({
      currency: z.string(),
      chargedMinor: z.number().int(),
      paidMinor: z.number().int(),
      outstandingMinor: z.number().int(),
      overdueMinor: z.number().int(),
      // Kullanılmamış avans = tahakkuka mahsup edilmemiş nakit (ADR-129).
      advanceBalanceMinor: z.number().int(),
    }),
  ),
});

const sponsorAccountWritableFields = {
  companyName: z.string().trim().min(1).max(SPONSORSHIP_TEXT_MAX),
  contactName: z.string().trim().min(1).max(SPONSORSHIP_TEXT_MAX),
  email: z.string().trim().email().max(SPONSORSHIP_TEXT_MAX),
  phone: z.string().trim().max(SPONSORSHIP_TEXT_MAX).nullable().optional(),
  taxOffice: z.string().trim().max(SPONSORSHIP_TEXT_MAX).nullable().optional(),
  taxNumber: z.string().trim().max(SPONSORSHIP_TEXT_MAX).nullable().optional(),
  billingAddress: z.string().trim().max(SPONSORSHIP_NOTES_MAX).nullable().optional(),
  status: sponsorAccountStatusSchema.optional(),
  notes: z.string().trim().max(SPONSORSHIP_NOTES_MAX).nullable().optional(),
};

export const sponsorAccountCreateRequestSchema = z.object(sponsorAccountWritableFields).strict();
export const sponsorAccountUpdateRequestSchema = z
  .object({
    ...sponsorAccountWritableFields,
    companyName: sponsorAccountWritableFields.companyName.optional(),
    contactName: sponsorAccountWritableFields.contactName.optional(),
    email: sponsorAccountWritableFields.email.optional(),
  })
  .strict();

export const sponsorAccountListQuerySchema = adminListQueryBaseSchema.extend({
  sortBy: z.enum(["createdAt", "companyName", "status"]).optional(),
  status: sponsorAccountStatusSchema.optional(),
});

export const sponsorAccountListResponseSchema = z.object({
  data: z.array(sponsorAccountSummarySchema),
  pagination: adminListPaginationSchema,
});
export const sponsorAccountDetailResponseSchema = z.object({ data: sponsorAccountDetailSchema });

// ── Anlaşma (SponsorshipAgreement) ───────────────────────────────────────────
export const sponsorshipAgreementCampaignLinkSchema = z.object({
  campaignId: z.string(),
  campaignName: z.string(),
  placement: sponsoredPlacementTypeSchema,
  campaignStatus: sponsoredCampaignStatusSchema,
  commercialMode: sponsoredCommercialModeSchema,
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  allocationAmountMinor: z.number().int().nullable(),
});

export const sponsorshipAgreementSummarySchema = z.object({
  id: z.string(),
  agreementNumber: z.string(),
  title: z.string(),
  status: sponsorshipAgreementStatusSchema,
  sponsorAccountId: z.string(),
  sponsorCompanyName: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  currency: z.string(),
  pricingModel: sponsorshipPricingModelSchema,
  settlementPeriod: sponsorshipSettlementPeriodSchema,
  agreedAmountMinor: z.number().int().nullable(),
  unitPriceMinor: z.number().int().nullable(),
  revenueSharePercentBp: z.number().int().nullable(),
  budgetLimitMinor: z.number().int().nullable(),
  paymentTermDays: z.number().int(),
  taxRateBp: z.number().int(),
  campaignCount: z.number().int().nonnegative(),
  chargedMinor: z.number().int(),
  paidMinor: z.number().int(),
  outstandingMinor: z.number().int(),
  hasOverdueCharge: z.boolean(),
  budgetExhausted: z.boolean(),
  /** Teslim uygunluğu — `SPONSORED` kampanyaların yayınlanabilirlik kapısı (ADR-124). */
  commerciallyEligible: z.boolean(),
  ineligibilityReason: z
    .enum(["NO_AGREEMENT", "AGREEMENT_NOT_ACTIVE", "AGREEMENT_WINDOW", "BUDGET_EXHAUSTED", "OVERDUE_CHARGE"])
    .nullable(),
  signedAt: z.string().nullable(),
  /** Onay damgası — anlaşma ilk kez ACTIVE'e geçtiğinde kim/ne zaman (ADR-128). */
  approvedAt: z.string().nullable(),
  approvedByUserId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const sponsorshipAgreementDetailSchema = sponsorshipAgreementSummarySchema.extend({
  documentUrl: z.string().nullable(),
  notes: z.string().nullable(),
  campaigns: z.array(sponsorshipAgreementCampaignLinkSchema),
});

const sponsorshipAgreementWritableFields = {
  title: z.string().trim().min(1).max(SPONSORSHIP_TEXT_MAX),
  status: sponsorshipAgreementStatusSchema.optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  currency: sponsorshipCurrencySchema,
  pricingModel: sponsorshipPricingModelSchema,
  settlementPeriod: sponsorshipSettlementPeriodSchema.optional(),
  agreedAmountMinor: z.number().int().min(0).max(SPONSORSHIP_MONEY_MAX).nullable().optional(),
  unitPriceMinor: z.number().int().min(0).max(SPONSORSHIP_MONEY_MAX).nullable().optional(),
  revenueSharePercentBp: z.number().int().min(0).max(10_000).nullable().optional(),
  budgetLimitMinor: z.number().int().min(0).max(SPONSORSHIP_MONEY_MAX).nullable().optional(),
  paymentTermDays: z.number().int().min(0).max(365).optional(),
  taxRateBp: z.number().int().min(0).max(10_000).optional(),
  signedAt: z.string().datetime().nullable().optional(),
  documentUrl: z.string().trim().max(SPONSORSHIP_TEXT_MAX).nullable().optional(),
  notes: z.string().trim().max(SPONSORSHIP_NOTES_MAX).nullable().optional(),
};

export const sponsorshipAgreementCreateRequestSchema = z
  .object({
    ...sponsorshipAgreementWritableFields,
    sponsorAccountId: z.string().min(1),
    /** Verilmezse sunucu deterministik bir numara üretir (istemci otorite DEĞİL). */
    agreementNumber: z.string().trim().min(1).max(64).optional(),
  })
  .strict();

export const sponsorshipAgreementUpdateRequestSchema = z
  .object({
    ...sponsorshipAgreementWritableFields,
    title: sponsorshipAgreementWritableFields.title.optional(),
    startsAt: sponsorshipAgreementWritableFields.startsAt.optional(),
    endsAt: sponsorshipAgreementWritableFields.endsAt.optional(),
    currency: sponsorshipAgreementWritableFields.currency.optional(),
    pricingModel: sponsorshipAgreementWritableFields.pricingModel.optional(),
  })
  .strict();

export const sponsorshipAgreementListQuerySchema = adminListQueryBaseSchema.extend({
  sortBy: z.enum(["createdAt", "agreementNumber", "title", "status", "endsAt"]).optional(),
  status: sponsorshipAgreementStatusSchema.optional(),
  sponsorAccountId: z.string().optional(),
  pricingModel: sponsorshipPricingModelSchema.optional(),
});

export const sponsorshipAgreementListResponseSchema = z.object({
  data: z.array(sponsorshipAgreementSummarySchema),
  pagination: adminListPaginationSchema,
});
export const sponsorshipAgreementDetailResponseSchema = z.object({ data: sponsorshipAgreementDetailSchema });

export const sponsorshipAgreementCampaignLinkRequestSchema = z
  .object({
    campaignId: z.string().min(1),
    allocationAmountMinor: z.number().int().min(0).max(SPONSORSHIP_MONEY_MAX).nullable().optional(),
  })
  .strict();

// ── Mutabakat (SponsorshipSettlement) ────────────────────────────────────────
export const sponsorshipSettlementSchema = z.object({
  id: z.string(),
  agreementId: z.string(),
  agreementNumber: z.string(),
  agreementTitle: z.string(),
  sponsorCompanyName: z.string(),
  periodKind: sponsorshipSettlementPeriodSchema,
  periodStart: z.string(),
  periodEnd: z.string(),
  impressions: z.number().int().nonnegative(),
  billableImpressions: z.number().int().nonnegative(),
  clicks: z.number().int().nonnegative(),
  billableClicks: z.number().int().nonnegative(),
  orders: z.number().int().nonnegative(),
  grossRevenueMinor: z.number().int(),
  refundedRevenueMinor: z.number().int(),
  netRevenueMinor: z.number().int(),
  calculatedChargeMinor: z.number().int(),
  currency: z.string(),
  pricingModel: sponsorshipPricingModelSchema,
  status: sponsorshipSettlementStatusSchema,
  /** Bu settlement'tan tahakkuk üretildi mi? (idempotency göstergesi) */
  chargeId: z.string().nullable(),
  createdAt: z.string(),
  finalizedAt: z.string().nullable(),
});

export const sponsorshipSettlementPreviewRequestSchema = z
  .object({
    periodStart: z.string().datetime(),
    periodEnd: z.string().datetime(),
    periodKind: sponsorshipSettlementPeriodSchema.optional(),
  })
  .strict();

export const sponsorshipSettlementListQuerySchema = adminListQueryBaseSchema.extend({
  sortBy: z.enum(["createdAt", "periodStart", "status"]).optional(),
  status: sponsorshipSettlementStatusSchema.optional(),
  agreementId: z.string().optional(),
});

export const sponsorshipSettlementListResponseSchema = z.object({
  data: z.array(sponsorshipSettlementSchema),
  pagination: adminListPaginationSchema,
});
export const sponsorshipSettlementDetailResponseSchema = z.object({ data: sponsorshipSettlementSchema });

// ── Tahakkuk (SponsorshipCharge) — iç ticari belge, resmî fatura DEĞİL (ADR-126) ──
export const sponsorshipChargeSchema = z.object({
  id: z.string(),
  chargeNumber: z.string(),
  agreementId: z.string(),
  agreementNumber: z.string(),
  sponsorAccountId: z.string(),
  sponsorCompanyName: z.string(),
  campaignId: z.string().nullable(),
  campaignName: z.string().nullable(),
  settlementId: z.string().nullable(),
  chargeType: sponsorshipChargeTypeSchema,
  pricingModel: sponsorshipPricingModelSchema,
  periodStart: z.string(),
  periodEnd: z.string(),
  quantity: z.number().int(),
  unitPriceMinor: z.number().int(),
  subtotalMinor: z.number().int(),
  taxRateBp: z.number().int(),
  taxAmountMinor: z.number().int(),
  totalAmountMinor: z.number().int(),
  paidMinor: z.number().int(),
  remainingMinor: z.number().int(),
  currency: z.string(),
  status: sponsorshipChargeStatusSchema,
  /** TÜRETİLMİŞ görünüm durumu — `OVERDUE` burada görünür, DB'de kalıcı DEĞİLDİR. */
  displayStatus: sponsorshipChargeDisplayStatusSchema,
  isOverdue: z.boolean(),
  daysOverdue: z.number().int().nonnegative(),
  notes: z.string().nullable(),
  generatedAt: z.string(),
  issuedAt: z.string().nullable(),
  dueAt: z.string(),
  createdAt: z.string(),
});

export const sponsorshipChargeListQuerySchema = adminListQueryBaseSchema.extend({
  sortBy: z.enum(["createdAt", "chargeNumber", "dueAt", "totalAmountMinor", "status"]).optional(),
  status: sponsorshipChargeStatusSchema.optional(),
  agreementId: z.string().optional(),
  sponsorAccountId: z.string().optional(),
  chargeType: sponsorshipChargeTypeSchema.optional(),
  /** Yalnız vadesi geçmiş açık tahakkuklar (sunucu-taraflı türetim). */
  overdueOnly: z.enum(["true", "false"]).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export const sponsorshipChargeListResponseSchema = z.object({
  data: z.array(sponsorshipChargeSchema),
  pagination: adminListPaginationSchema,
});
export const sponsorshipChargeDetailResponseSchema = z.object({ data: sponsorshipChargeSchema });

export const sponsorshipChargeCreateRequestSchema = z
  .object({
    /** Tahakkuk tutarı İSTEMCİDEN GELMEZ — settlement snapshot'ından türetilir (ADR-122). */
    settlementId: z.string().min(1),
    notes: z.string().trim().max(SPONSORSHIP_NOTES_MAX).nullable().optional(),
    /** Üretildiği anda düzenlensin (ISSUED) mi, taslak mı kalsın? */
    issue: z.boolean().optional(),
  })
  .strict();

export const sponsorshipChargeIssueRequestSchema = z
  .object({ issuedAt: z.string().datetime().optional() })
  .strict();

export const sponsorshipChargeCancelRequestSchema = z
  .object({ reason: z.string().trim().max(SPONSORSHIP_NOTES_MAX).optional() })
  .strict();

// ── Tahsilat (SponsorshipPayment) — append-only defter (ADR-125) ─────────────
export const sponsorshipPaymentSchema = z.object({
  id: z.string(),
  agreementId: z.string(),
  agreementNumber: z.string(),
  sponsorCompanyName: z.string(),
  chargeId: z.string().nullable(),
  chargeNumber: z.string().nullable(),
  amountMinor: z.number().int(),
  currency: z.string(),
  method: sponsorshipPaymentMethodSchema,
  providerReference: z.string().nullable(),
  manualReference: z.string().nullable(),
  paidAt: z.string(),
  notes: z.string().nullable(),
  /** Bu satır bir ters kayıt mı? (negatif tutarlı iptal/iade) */
  isReversal: z.boolean(),
  reversalOfPaymentId: z.string().nullable(),
  reversalReason: z.string().nullable(),
  /** Bu (pozitif) ödeme daha sonra ters çevrildi mi? */
  reversed: z.boolean(),
  createdAt: z.string(),
});

export const sponsorshipPaymentCreateRequestSchema = z
  .object({
    /**
     * Talep edilen tutar. SUNUCU bunu kalan bakiyeye karşı DOĞRULAR; aşırı tahsilat
     * reddedilir (400 OVERPAYMENT). İstemci kalan bakiyenin otoritesi DEĞİLDİR.
     */
    amountMinor: z.number().int().positive().max(SPONSORSHIP_MONEY_MAX),
    currency: sponsorshipCurrencySchema,
    method: sponsorshipPaymentMethodSchema,
    paidAt: z.string().datetime().optional(),
    providerReference: z.string().trim().max(SPONSORSHIP_TEXT_MAX).nullable().optional(),
    manualReference: z.string().trim().max(SPONSORSHIP_TEXT_MAX).nullable().optional(),
    notes: z.string().trim().max(SPONSORSHIP_NOTES_MAX).nullable().optional(),
    idempotencyKey: z.string().trim().min(1).max(128).optional(),
  })
  .strict();

export const sponsorshipPaymentReverseRequestSchema = z
  .object({ reason: z.string().trim().max(SPONSORSHIP_NOTES_MAX).optional() })
  .strict();

export const sponsorshipPaymentListQuerySchema = adminListQueryBaseSchema.extend({
  sortBy: z.enum(["createdAt", "paidAt", "amountMinor"]).optional(),
  agreementId: z.string().optional(),
  sponsorAccountId: z.string().optional(),
  chargeId: z.string().optional(),
  method: sponsorshipPaymentMethodSchema.optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export const sponsorshipPaymentListResponseSchema = z.object({
  data: z.array(sponsorshipPaymentSchema),
  pagination: adminListPaginationSchema,
});
export const sponsorshipPaymentDetailResponseSchema = z.object({ data: sponsorshipPaymentSchema });

// ══════════ TODO-161A.2 (ADR-128/129) — Birleşik sponsorluk ticari akışı ══════════

/** FIXED_FEE anlaşma için doğrudan (settlement'sız) tahakkuk isteği — ADR-128 §6. */
export const sponsorshipFixedFeeChargeRequestSchema = z
  .object({
    /** Kampanyaya ayrılan tutar; verilmezse anlaşmanın `agreedAmountMinor`'ı kullanılır. */
    amountMinor: z.number().int().positive().max(SPONSORSHIP_MONEY_MAX).nullable().optional(),
    campaignId: z.string().min(1).nullable().optional(),
    issue: z.boolean().optional(),
    notes: z.string().trim().max(SPONSORSHIP_NOTES_MAX).nullable().optional(),
  })
  .strict();

/** Avans (chargeId=null tahsilat) kaydı — anlaşmaya bağlı kullanılabilir nakit (ADR-129). */
export const sponsorshipAdvanceCreateRequestSchema = z
  .object({
    amountMinor: z.number().int().positive().max(SPONSORSHIP_MONEY_MAX),
    currency: sponsorshipCurrencySchema,
    method: sponsorshipPaymentMethodSchema,
    paidAt: z.string().datetime().optional(),
    providerReference: z.string().trim().max(SPONSORSHIP_TEXT_MAX).nullable().optional(),
    manualReference: z.string().trim().max(SPONSORSHIP_TEXT_MAX).nullable().optional(),
    notes: z.string().trim().max(SPONSORSHIP_NOTES_MAX).nullable().optional(),
    idempotencyKey: z.string().trim().min(1).max(128).optional(),
  })
  .strict();

/** Avans mahsup isteği — kullanılabilir avanstan açık bir tahakkuğa (ADR-129). */
export const sponsorshipAdvanceAllocationRequestSchema = z
  .object({
    advancePaymentId: z.string().min(1),
    chargeId: z.string().min(1),
    amountMinor: z.number().int().positive().max(SPONSORSHIP_MONEY_MAX),
    /** İyimser kilit: istemcinin gördüğü kalan; sunucudakiyle uyuşmazsa `BALANCE_CHANGED`. */
    expectedRemainingMinor: z.number().int().nonnegative().optional(),
    idempotencyKey: z.string().trim().min(1).max(128).optional(),
    notes: z.string().trim().max(SPONSORSHIP_NOTES_MAX).nullable().optional(),
  })
  .strict();

/** Kullanılabilir avans (türetilmiş bakiye) satırı. */
export const sponsorshipAdvanceSchema = z.object({
  id: z.string(),
  agreementId: z.string(),
  agreementNumber: z.string(),
  sponsorCompanyName: z.string(),
  amountMinor: z.number().int(),
  allocatedMinor: z.number().int(),
  availableMinor: z.number().int(),
  currency: z.string(),
  method: sponsorshipPaymentMethodSchema,
  paidAt: z.string(),
  notes: z.string().nullable(),
  createdAt: z.string(),
});

export const sponsorshipAllocationSchema = z.object({
  id: z.string(),
  agreementId: z.string(),
  advancePaymentId: z.string(),
  chargeId: z.string(),
  chargeNumber: z.string(),
  amountMinor: z.number().int(),
  currency: z.string(),
  createdAt: z.string(),
});

export const sponsorshipAdvanceListResponseSchema = z.object({ data: z.array(sponsorshipAdvanceSchema) });
export const sponsorshipAdvanceDetailResponseSchema = z.object({ data: sponsorshipPaymentSchema });
export const sponsorshipAllocationDetailResponseSchema = z.object({ data: sponsorshipAllocationSchema });
export const sponsorshipOpenChargeListResponseSchema = z.object({ data: z.array(sponsorshipChargeSchema) });

/** Bir sponsora ait, kampanyaya bağlanabilir aday anlaşma (kampanya oluşturma akışı — ADR-128). */
export const sponsorshipEligibleAgreementSchema = z.object({
  id: z.string(),
  agreementNumber: z.string(),
  title: z.string(),
  status: sponsorshipAgreementStatusSchema,
  currency: z.string(),
  pricingModel: sponsorshipPricingModelSchema,
  startsAt: z.string(),
  endsAt: z.string(),
  agreedAmountMinor: z.number().int().nullable(),
  budgetLimitMinor: z.number().int().nullable(),
  allocatedToCampaignsMinor: z.number().int(),
  availableAllocationMinor: z.number().int().nullable(),
  outstandingMinor: z.number().int(),
  commerciallyEligible: z.boolean(),
  ineligibilityReason: z
    .enum(["NO_AGREEMENT", "AGREEMENT_NOT_ACTIVE", "AGREEMENT_WINDOW", "BUDGET_EXHAUSTED", "OVERDUE_CHARGE"])
    .nullable(),
});
export const sponsorshipEligibleAgreementListResponseSchema = z.object({ data: z.array(sponsorshipEligibleAgreementSchema) });

/** Kampanya ticari özeti — sponsor/anlaşma/finans (kampanya liste/detay ekranı — ADR-128). */
export const sponsorshipCampaignCommercialSummarySchema = z.object({
  campaignId: z.string(),
  campaignName: z.string(),
  commercialMode: sponsoredCommercialModeSchema,
  agreement: z
    .object({
      id: z.string(),
      agreementNumber: z.string(),
      title: z.string(),
      status: sponsorshipAgreementStatusSchema,
      sponsorAccountId: z.string(),
      sponsorCompanyName: z.string(),
      pricingModel: sponsorshipPricingModelSchema,
      currency: z.string(),
      startsAt: z.string(),
      endsAt: z.string(),
      agreedAmountMinor: z.number().int().nullable(),
      allocationAmountMinor: z.number().int().nullable(),
      commerciallyEligible: z.boolean(),
      ineligibilityReason: z
        .enum(["NO_AGREEMENT", "AGREEMENT_NOT_ACTIVE", "AGREEMENT_WINDOW", "BUDGET_EXHAUSTED", "OVERDUE_CHARGE"])
        .nullable(),
    })
    .nullable(),
  currency: z.string().nullable(),
  chargedMinor: z.number().int(),
  paidMinor: z.number().int(),
  outstandingMinor: z.number().int(),
  overdueMinor: z.number().int(),
});
export const sponsorshipCampaignCommercialSummaryResponseSchema = z.object({ data: sponsorshipCampaignCommercialSummarySchema });

// ── Dashboard — para birimi bazında AYRI (ADR-127) ───────────────────────────
export const sponsorshipCurrencyKpiSchema = z.object({
  currency: z.string(),
  contractedMinor: z.number().int(),
  chargedMinor: z.number().int(),
  collectedMinor: z.number().int(),
  outstandingMinor: z.number().int(),
  overdueMinor: z.number().int(),
  sponsoredNetRevenueMinor: z.number().int(),
});

export const sponsorshipDashboardBreakdownRowSchema = z.object({
  key: z.string(),
  label: z.string(),
  currency: z.string(),
  chargedMinor: z.number().int(),
  collectedMinor: z.number().int(),
  outstandingMinor: z.number().int(),
  overdueMinor: z.number().int(),
  /** Yalnız kampanya kırılımında dolu: atfedilen net gelir − tahakkuk (kârlılık). */
  netRevenueMinor: z.number().int().nullable(),
  profitabilityMinor: z.number().int().nullable(),
});

export const sponsorshipDashboardQuerySchema = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  sponsorAccountId: z.string().optional(),
  agreementId: z.string().optional(),
});

/**
 * H-2 / ADR-185 — currency mismatch görünürlüğü (operations). Karışık-para gelir SESSİZCE
 * birleştirilmez; bu sayaçlar uyuşmayan/eksik finansal kapsamı operatöre gösterir.
 */
export const sponsorshipCurrencyMismatchSummarySchema = z.object({
  mismatchedAttributionCount: z.number().int().nonnegative(),
  affectedCampaignCount: z.number().int().nonnegative(),
  affectedAgreementIds: z.array(z.string()),
  mismatchedSettlementCount: z.number().int().nonnegative(),
  foundForeignCurrencies: z.array(z.string()),
  lastDetectedAt: z.string().nullable(),
});

export const sponsorshipDashboardResponseSchema = z.object({
  data: z.object({
    activeSponsors: z.number().int().nonnegative(),
    totalSponsors: z.number().int().nonnegative(),
    activeAgreements: z.number().int().nonnegative(),
    totalAgreements: z.number().int().nonnegative(),
    overdueChargeCount: z.number().int().nonnegative(),
    currencyMismatch: sponsorshipCurrencyMismatchSummarySchema,
    /** Her para birimi AYRI satırdır; tek toplam altında BİRLEŞTİRİLMEZ. */
    currencies: z.array(sponsorshipCurrencyKpiSchema),
    bySponsor: z.array(sponsorshipDashboardBreakdownRowSchema),
    byAgreement: z.array(sponsorshipDashboardBreakdownRowSchema),
    byCampaign: z.array(sponsorshipDashboardBreakdownRowSchema),
    byPricingModel: z.array(sponsorshipDashboardBreakdownRowSchema),
    byDueStatus: z.array(sponsorshipDashboardBreakdownRowSchema),
  }),
});

export type SponsorAccountStatus = z.infer<typeof sponsorAccountStatusSchema>;
export type SponsorshipAgreementStatus = z.infer<typeof sponsorshipAgreementStatusSchema>;
export type SponsorshipPricingModel = z.infer<typeof sponsorshipPricingModelSchema>;
export type SponsorshipSettlementPeriod = z.infer<typeof sponsorshipSettlementPeriodSchema>;
export type SponsorshipSettlementStatus = z.infer<typeof sponsorshipSettlementStatusSchema>;
export type SponsorshipChargeType = z.infer<typeof sponsorshipChargeTypeSchema>;
export type SponsorshipChargeStatus = z.infer<typeof sponsorshipChargeStatusSchema>;
export type SponsorshipChargeDisplayStatus = z.infer<typeof sponsorshipChargeDisplayStatusSchema>;
export type SponsorshipPaymentMethod = z.infer<typeof sponsorshipPaymentMethodSchema>;
export type SponsoredCommercialMode = z.infer<typeof sponsoredCommercialModeSchema>;
export type SponsorAccountSummary = z.infer<typeof sponsorAccountSummarySchema>;
export type SponsorAccountDetail = z.infer<typeof sponsorAccountDetailSchema>;
export type SponsorAccountCreateRequest = z.infer<typeof sponsorAccountCreateRequestSchema>;
export type SponsorAccountUpdateRequest = z.infer<typeof sponsorAccountUpdateRequestSchema>;
export type SponsorAccountListQuery = z.infer<typeof sponsorAccountListQuerySchema>;
export type SponsorAccountListResponse = z.infer<typeof sponsorAccountListResponseSchema>;
export type SponsorAccountDetailResponse = z.infer<typeof sponsorAccountDetailResponseSchema>;
export type SponsorshipAgreementCampaignLink = z.infer<typeof sponsorshipAgreementCampaignLinkSchema>;
export type SponsorshipAgreementSummary = z.infer<typeof sponsorshipAgreementSummarySchema>;
export type SponsorshipAgreementDetail = z.infer<typeof sponsorshipAgreementDetailSchema>;
export type SponsorshipAgreementCreateRequest = z.infer<typeof sponsorshipAgreementCreateRequestSchema>;
export type SponsorshipAgreementUpdateRequest = z.infer<typeof sponsorshipAgreementUpdateRequestSchema>;
export type SponsorshipAgreementListQuery = z.infer<typeof sponsorshipAgreementListQuerySchema>;
export type SponsorshipAgreementListResponse = z.infer<typeof sponsorshipAgreementListResponseSchema>;
export type SponsorshipAgreementDetailResponse = z.infer<typeof sponsorshipAgreementDetailResponseSchema>;
export type SponsorshipAgreementCampaignLinkRequest = z.infer<typeof sponsorshipAgreementCampaignLinkRequestSchema>;
export type SponsorshipSettlement = z.infer<typeof sponsorshipSettlementSchema>;
export type SponsorshipSettlementPreviewRequest = z.infer<typeof sponsorshipSettlementPreviewRequestSchema>;
export type SponsorshipSettlementListQuery = z.infer<typeof sponsorshipSettlementListQuerySchema>;
export type SponsorshipSettlementListResponse = z.infer<typeof sponsorshipSettlementListResponseSchema>;
export type SponsorshipSettlementDetailResponse = z.infer<typeof sponsorshipSettlementDetailResponseSchema>;
export type SponsorshipCharge = z.infer<typeof sponsorshipChargeSchema>;
export type SponsorshipChargeListQuery = z.infer<typeof sponsorshipChargeListQuerySchema>;
export type SponsorshipChargeListResponse = z.infer<typeof sponsorshipChargeListResponseSchema>;
export type SponsorshipChargeDetailResponse = z.infer<typeof sponsorshipChargeDetailResponseSchema>;
export type SponsorshipChargeCreateRequest = z.infer<typeof sponsorshipChargeCreateRequestSchema>;
export type SponsorshipChargeIssueRequest = z.infer<typeof sponsorshipChargeIssueRequestSchema>;
export type SponsorshipChargeCancelRequest = z.infer<typeof sponsorshipChargeCancelRequestSchema>;
export type SponsorshipPayment = z.infer<typeof sponsorshipPaymentSchema>;
export type SponsorshipPaymentCreateRequest = z.infer<typeof sponsorshipPaymentCreateRequestSchema>;
export type SponsorshipPaymentReverseRequest = z.infer<typeof sponsorshipPaymentReverseRequestSchema>;
export type SponsorshipPaymentListQuery = z.infer<typeof sponsorshipPaymentListQuerySchema>;
export type SponsorshipPaymentListResponse = z.infer<typeof sponsorshipPaymentListResponseSchema>;
export type SponsorshipPaymentDetailResponse = z.infer<typeof sponsorshipPaymentDetailResponseSchema>;
export type SponsorshipFixedFeeChargeRequest = z.infer<typeof sponsorshipFixedFeeChargeRequestSchema>;
export type SponsorshipAdvanceCreateRequest = z.infer<typeof sponsorshipAdvanceCreateRequestSchema>;
export type SponsorshipAdvanceAllocationRequest = z.infer<typeof sponsorshipAdvanceAllocationRequestSchema>;
export type SponsorshipAdvance = z.infer<typeof sponsorshipAdvanceSchema>;
export type SponsorshipAllocation = z.infer<typeof sponsorshipAllocationSchema>;
export type SponsorshipAdvanceListResponse = z.infer<typeof sponsorshipAdvanceListResponseSchema>;
export type SponsorshipAdvanceDetailResponse = z.infer<typeof sponsorshipAdvanceDetailResponseSchema>;
export type SponsorshipAllocationDetailResponse = z.infer<typeof sponsorshipAllocationDetailResponseSchema>;
export type SponsorshipOpenChargeListResponse = z.infer<typeof sponsorshipOpenChargeListResponseSchema>;
export type SponsorshipEligibleAgreement = z.infer<typeof sponsorshipEligibleAgreementSchema>;
export type SponsorshipEligibleAgreementListResponse = z.infer<typeof sponsorshipEligibleAgreementListResponseSchema>;
export type SponsorshipCampaignCommercialSummary = z.infer<typeof sponsorshipCampaignCommercialSummarySchema>;
export type SponsorshipCampaignCommercialSummaryResponse = z.infer<typeof sponsorshipCampaignCommercialSummaryResponseSchema>;
export type SponsorshipCurrencyKpi = z.infer<typeof sponsorshipCurrencyKpiSchema>;
export type SponsorshipDashboardBreakdownRow = z.infer<typeof sponsorshipDashboardBreakdownRowSchema>;
export type SponsorshipDashboardQuery = z.infer<typeof sponsorshipDashboardQuerySchema>;
export type SponsorshipDashboardResponse = z.infer<typeof sponsorshipDashboardResponseSchema>;

// ───────────────────── TODO-161A.1 (ADR-130…136) — Commercial Automation & Retention ─────────────────────
// Store-admin operasyon görünürlüğü + manuel tetik uçları. Public uç YOK; tümü platform/store admin.
// dryRun bayrağı: settlement scheduler için "oluşturulacakları raporla, üretme"; retention için
// "adayları say, silme". Sunucu otoritesi: storeId URL'den; retention cutoff/gün SERVER config'inden
// (istemci gönderemez). allowlist job type route katmanında.

export const commercialAutomationRunRequestSchema = z
  .object({
    // Varsayılan: settlement scheduler run için apply (dryRun=false); retention için route DRY-RUN'ı
    // güvenli varsayılan yapar. İstemci açıkça true/false gönderebilir.
    dryRun: z.boolean().optional(),
  })
  .strict();

const commercialAutomationJobRunSchema = z.object({
  status: z.string(),
  attempts: z.number().int(),
  at: z.string().nullable(),
  report: z.unknown().nullable(),
});

export const commercialAutomationStatusResponseSchema = z.object({
  data: z.object({
    settlementScheduler: commercialAutomationJobRunSchema.nullable(),
    attributionRetention: commercialAutomationJobRunSchema.nullable(),
    retentionConfig: z.object({
      sponsoredEventRetentionDays: z.number().int(),
      influencerClickRetentionDays: z.number().int(),
      maxDeletePerRun: z.number().int(),
    }),
  }),
});

const commercialAutomationOutcomeSchema = z.enum([
  "STARTED",
  "COMPLETED",
  "PARTIAL_SUCCESS",
  "FAILED",
  "SKIPPED_LOCKED",
  "DRY_RUN",
]);

const settlementSchedulerStoreReportSchema = z.object({
  storeId: z.string(),
  timeZone: z.string(),
  mode: z.enum(["dry-run", "apply"]),
  outcome: commercialAutomationOutcomeSchema,
  scannedAgreements: z.number().int(),
  createdDrafts: z.number().int(),
  candidateDrafts: z.number().int(),
  skipped: z.number().int(),
  skippedByReason: z.record(z.number().int()),
  erroredAgreements: z.number().int(),
  errors: z.array(z.object({ agreementId: z.string(), code: z.string() })),
  createdSettlementIds: z.array(z.string()),
});

export const settlementSchedulerRunResponseSchema = z.object({
  data: z.object({
    mode: z.enum(["dry-run", "apply"]),
    stores: z.number().int(),
    scannedAgreements: z.number().int(),
    createdDrafts: z.number().int(),
    candidateDrafts: z.number().int(),
    erroredAgreements: z.number().int(),
    skippedLocked: z.number().int(),
    perStore: z.array(settlementSchedulerStoreReportSchema),
  }),
});

const retentionTableResultSchema = z.object({
  table: z.enum(["SponsoredProductEvent", "AttributionClick"]),
  domain: z.enum(["sponsored", "influencer"]),
  retentionDays: z.number().int(),
  cutoff: z.string(),
  candidates: z.number().int(),
  deleted: z.number().int(),
  circuitBreakerTripped: z.boolean(),
});

const retentionStoreReportSchema = z.object({
  storeId: z.string(),
  mode: z.enum(["dry-run", "apply"]),
  outcome: commercialAutomationOutcomeSchema,
  tables: z.array(retentionTableResultSchema),
  totalCandidates: z.number().int(),
  totalDeleted: z.number().int(),
  anyCircuitBreakerTripped: z.boolean(),
});

export const retentionRunResponseSchema = z.object({
  data: z.object({
    mode: z.enum(["dry-run", "apply"]),
    stores: z.number().int(),
    totalCandidates: z.number().int(),
    totalDeleted: z.number().int(),
    skippedLocked: z.number().int(),
    perStore: z.array(retentionStoreReportSchema),
  }),
});

export type CommercialAutomationRunRequest = z.infer<typeof commercialAutomationRunRequestSchema>;
export type CommercialAutomationStatusResponse = z.infer<typeof commercialAutomationStatusResponseSchema>;
export type SettlementSchedulerRunResponse = z.infer<typeof settlementSchedulerRunResponseSchema>;
export type RetentionRunResponse = z.infer<typeof retentionRunResponseSchema>;

// ── TODO-163 (ADR-208…ADR-210) — Tenant Module & Capability Management ────────
// Effective modul matrisi (admin). effectiveEnabled + source SUNUCUDA turetilir;
// istemci override state DISINDA hicbir yetki gonderemez. moduleKey allowlist gateway
// registry'sine karsi dogrulanir (serbest string DEGIL).
export const storeModuleStateSchema = z.enum(["INHERIT", "ENABLED", "DISABLED"]);

export const storeModuleMatrixEntrySchema = z.object({
  key: z.string(),
  group: z.string(),
  labelTr: z.string(),
  labelEn: z.string(),
  descriptionTr: z.string(),
  core: z.boolean(),
  effectiveEnabled: z.boolean(),
  source: z.enum(["core", "override", "plan", "baseline", "dependency"]),
  overrideState: storeModuleStateSchema,
  blockedBy: z.string().nullable().optional(),
});

export const storeModulesResponseSchema = z.object({
  data: z.object({
    storeId: z.string(),
    modules: z.array(storeModuleMatrixEntrySchema),
  }),
});

// Faz 2: cascade → parent-disable onayı (aktif dependent varsa gerekli; sessiz cascade yok).
export const updateStoreModuleRequestSchema = z.object({
  state: storeModuleStateSchema,
  cascade: z.boolean().optional(),
});

// Faz 2: parent-disable preview — bir modülü DISABLE etmenin kapatacağı aktif dependent'lar.
export const storeModuleDisablePreviewResponseSchema = z.object({
  data: z.object({
    moduleKey: z.string(),
    dependents: z.array(z.string()),
  }),
});

// Faz 2: PUBLIC capability projeksiyonu (storefront hot-path). YALNIZ moduleKey→boolean
// (source/label/plan sızmaz). Effective durum sunucuda türetilir; istemci gönderemez.
export const publicStoreCapabilitiesResponseSchema = z.object({
  data: z.object({
    modules: z.record(z.boolean()),
  }),
});

// TODO-163 Faz 3 (TD-154 · ADR-215) — Plan → Capability editörü (platform-admin).
// Bounded durum enum'u (arbitrary JSON DEĞİL): required=plan default açık, optional=baseline,
// unavailable=plan default kapalı. Effective sıra korunur (store override > plan > baseline).
export const planCapabilityStatusSchema = z.enum(["required", "optional", "unavailable"]);

export const planCapabilityMatrixEntrySchema = z.object({
  key: z.string(),
  group: z.string(),
  labelTr: z.string(),
  labelEn: z.string(),
  descriptionTr: z.string(),
  core: z.boolean(),
  requires: z.array(z.string()),
  status: planCapabilityStatusSchema,
  effectivePlanEnabled: z.boolean(),
  blockedBy: z.string().nullable(),
});

export const planCapabilitiesResponseSchema = z.object({
  data: z.object({
    planId: z.string(),
    modules: z.array(planCapabilityMatrixEntrySchema),
  }),
});

// Editör apply/preview gövdesi: yalnız durum enum'u (değerler bounded; anahtarlar sunucuda registry'ye
// karşı doğrulanır → bilinmeyen/core-unavailable/invalid-dependency reddedilir).
export const planCapabilitiesUpdateRequestSchema = z.object({
  statuses: z.record(planCapabilityStatusSchema),
});

export const planCapabilityValidationErrorSchema = z.object({
  code: z.enum(["UNKNOWN_MODULE", "CORE_UNAVAILABLE", "INVALID_DEPENDENCY"]),
  key: z.string(),
  requires: z.string().optional(),
});

export const planCapabilityPreviewResponseSchema = z.object({
  data: z.object({
    ok: z.boolean(),
    errors: z.array(planCapabilityValidationErrorSchema),
    entries: z.array(
      z.object({
        key: z.string(),
        proposedStatus: planCapabilityStatusSchema,
        effectivePlanEnabled: z.boolean(),
        blockedBy: z.string().nullable(),
        changed: z.boolean(),
      }),
    ),
    changedModules: z.array(z.string()),
    dependencyDisabled: z.array(z.string()),
    /** Bu plana bağlı (ACTIVE/TRIALING) mağaza sayısı — etki özeti (bounded). */
    subscriberCount: z.number().int().nonnegative(),
  }),
});

export type StoreModuleState = z.infer<typeof storeModuleStateSchema>;
export type StoreModuleMatrixEntry = z.infer<typeof storeModuleMatrixEntrySchema>;
export type StoreModulesResponse = z.infer<typeof storeModulesResponseSchema>;
export type UpdateStoreModuleRequest = z.infer<typeof updateStoreModuleRequestSchema>;
export type StoreModuleDisablePreviewResponse = z.infer<typeof storeModuleDisablePreviewResponseSchema>;
export type PublicStoreCapabilitiesResponse = z.infer<typeof publicStoreCapabilitiesResponseSchema>;
export type PlanCapabilityStatus = z.infer<typeof planCapabilityStatusSchema>;
export type PlanCapabilityMatrixEntry = z.infer<typeof planCapabilityMatrixEntrySchema>;
export type PlanCapabilitiesResponse = z.infer<typeof planCapabilitiesResponseSchema>;
export type PlanCapabilitiesUpdateRequest = z.infer<typeof planCapabilitiesUpdateRequestSchema>;
export type PlanCapabilityPreviewResponse = z.infer<typeof planCapabilityPreviewResponseSchema>;

/* ────────────────────────────────────────────────────────────────────────────
 * TODO-165 Fashion Vertical (ADR-249) — Size Chart sozlesmeleri.
 * columns/rows PLAIN-TEXT sunum verisi (raw HTML/CSS/JS YOK). Hucre degerleri kisitli
 * string/number; server-side ayrica dogrulanir. sizeSystemKey kod registry ile denetlenir.
 * ──────────────────────────────────────────────────────────────────────────── */
const sizeChartStatusSchema = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]);
const sizeChartScopeSchema = z.enum(["STORE", "CATEGORY", "PRODUCT"]);
// Sunum guvenligi: hucre/etiket yalniz gorunur-metin; kontrol karakteri/aci parantez yok.
const plainCellSchema = z
  .union([z.string().max(120), z.number()])
  .refine((v) => typeof v === "number" || !/[<>]/.test(v), { message: "raw markup not allowed" });
const sizeChartColumnSchema = z.object({
  key: z.string().min(1).max(40).regex(/^[a-zA-Z0-9_-]+$/),
  label: z.string().min(1).max(60).regex(/^[^<>]*$/),
  unit: z.string().max(12).regex(/^[^<>]*$/).optional(),
});
const sizeChartRowSchema = z.object({
  size: z.string().min(1).max(40).regex(/^[^<>]*$/),
  cells: z.record(plainCellSchema),
});
export const sizeChartRevisionSchema = z.object({
  id: z.string(),
  revision: z.number().int().positive(),
  columns: z.array(sizeChartColumnSchema).max(20),
  rows: z.array(sizeChartRowSchema).max(60),
  locale: z.string().max(10).nullable(),
  createdAt: z.string(),
});
export const sizeChartSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(120),
  sizeSystemKey: z.string().min(1).max(40),
  measurementUnit: z.string().max(12),
  gender: z.string().max(40).nullable(),
  locale: z.string().max(10).nullable(),
  status: sizeChartStatusSchema,
  publishedRevisionId: z.string().nullable(),
  publishedRevision: sizeChartRevisionSchema.nullable(),
  draftColumns: z.array(sizeChartColumnSchema).max(20),
  draftRows: z.array(sizeChartRowSchema).max(60),
  assignments: z.array(
    z.object({
      id: z.string(),
      scope: sizeChartScopeSchema,
      categoryId: z.string().nullable(),
      productId: z.string().nullable(),
    }),
  ),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export const sizeChartListResponseSchema = z.object({ data: z.array(sizeChartSchema) });
export const sizeChartResponseSchema = z.object({ data: sizeChartSchema });
export const sizeChartCreateRequestSchema = z.object({
  name: z.string().min(1).max(120),
  sizeSystemKey: z.string().min(1).max(40),
  measurementUnit: z.string().max(12).optional(),
  gender: z.string().max(40).nullable().optional(),
  locale: z.string().max(10).nullable().optional(),
  columns: z.array(sizeChartColumnSchema).max(20).optional(),
  rows: z.array(sizeChartRowSchema).max(60).optional(),
});
export const sizeChartUpdateRequestSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  measurementUnit: z.string().max(12).optional(),
  gender: z.string().max(40).nullable().optional(),
  locale: z.string().max(10).nullable().optional(),
  columns: z.array(sizeChartColumnSchema).max(20).optional(),
  rows: z.array(sizeChartRowSchema).max(60).optional(),
});
export const sizeChartAssignRequestSchema = z.object({
  scope: sizeChartScopeSchema,
  categoryId: z.string().min(1).nullable().optional(),
  productId: z.string().min(1).nullable().optional(),
});
// Public (storefront) — PDP beden tablosu projeksiyonu (yalniz published revision).
export const publicSizeChartSchema = z.object({
  id: z.string(),
  name: z.string(),
  sizeSystemKey: z.string(),
  measurementUnit: z.string(),
  columns: z.array(sizeChartColumnSchema),
  rows: z.array(sizeChartRowSchema),
});

export type SizeChartStatusContract = z.infer<typeof sizeChartStatusSchema>;
export type SizeChartScopeContract = z.infer<typeof sizeChartScopeSchema>;
export type SizeChartColumn = z.infer<typeof sizeChartColumnSchema>;
export type SizeChartRow = z.infer<typeof sizeChartRowSchema>;
export type SizeChartRevisionContract = z.infer<typeof sizeChartRevisionSchema>;
export type SizeChartContract = z.infer<typeof sizeChartSchema>;
export type SizeChartCreateRequest = z.infer<typeof sizeChartCreateRequestSchema>;
export type SizeChartUpdateRequest = z.infer<typeof sizeChartUpdateRequestSchema>;
export type SizeChartAssignRequest = z.infer<typeof sizeChartAssignRequestSchema>;
export type PublicSizeChart = z.infer<typeof publicSizeChartSchema>;

/* ────────────────────────────────────────────────────────────────────────────
 * TODO-165A (ADR-165A) — Beden Tablosu (SizeChart) SECICI sozlesmesi.
 *
 * TODO-159B (ADR-090) desenini mirror'lar (dual `?ids=` modu, bkz.
 * adminSelectorQueryBaseSchema). Secici satiri tablonun TAMAMINI degil, urun formunda
 * "beden tablosu ata" adiminin ihtiyac duydugu asgari projeksiyonu tasir: `revision`
 * en-guncel taslak/yayin revizyon sayisi, `previewSummary` sunucuda uretilen kisa
 * ozet metindir (ör. sutun x satir sayisi) — tam tablo govdesi secicide DONMEZ.
 * ──────────────────────────────────────────────────────────────────────────── */

export const adminSizeChartSelectorSortBySchema = z.enum(["name", "createdAt"]);

export const adminSizeChartSelectorQuerySchema = adminSelectorQueryBaseSchema.extend({
  sortBy: adminSizeChartSelectorSortBySchema.optional(),
  status: sizeChartStatusSchema.optional(),
});

export const adminSizeChartSelectorOptionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  sizeSystemKey: z.string().min(1),
  gender: z.string().max(40).nullable(),
  measurementUnit: z.string().max(12),
  status: sizeChartStatusSchema,
  revision: z.number().int().nonnegative(),
  publishedRevisionId: z.string().nullable(),
  previewSummary: z.string(),
});

export const adminSizeChartSelectorResponseSchema = z.object({
  data: z.array(adminSizeChartSelectorOptionSchema),
  pagination: adminListPaginationSchema,
});

export type AdminSizeChartSelectorSortBy = z.infer<typeof adminSizeChartSelectorSortBySchema>;
export type AdminSizeChartSelectorQuery = z.infer<typeof adminSizeChartSelectorQuerySchema>;
export type AdminSizeChartSelectorOption = z.infer<typeof adminSizeChartSelectorOptionSchema>;
export type AdminSizeChartSelectorResponse = z.infer<typeof adminSizeChartSelectorResponseSchema>;

/* ────────────────────────────────────────────────────────────────────────────
 * TODO-165A Tasks 25/26 — Bir ürünün GÜNCEL beden tablosu bağlantısını gösteren
 * hafif okuma ucu (`GET /stores/:storeId/products/:productId/size-chart-assignment`).
 *
 * İki ayrı bilgi taşır: `productAssignment` (yalnız bu ürüne PRODUCT-scope doğrudan
 * bağlıysa dolu) ve `effective` (PRODUCT>CATEGORY>STORE önceliğiyle ÇÖZÜLMÜŞ, sunucu
 * `resolvePublishedSizeChart` ile AYNI mantığı kullanır — paralel bir çözümleme
 * YAZILMAZ). Ürün formu "bağlı: X (ürün)" veya "kategori/mağaza varsayılanı: Y"
 * ayrımını `effective.scope` ile kurar; kaldırma `productAssignment.assignmentId`
 * üzerinden MEVCUT `DELETE .../assignments/:assignmentId` ucuna gider (paralel
 * bir kaldırma ucu YOK).
 * ──────────────────────────────────────────────────────────────────────────── */
export const productSizeChartAssignmentSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  sizeSystemKey: z.string(),
  measurementUnit: z.string(),
  gender: z.string().max(40).nullable(),
  status: sizeChartStatusSchema,
  publishedRevisionId: z.string().nullable(),
});
export const productSizeChartAssignmentSchema = z.object({
  productAssignment: z
    .object({
      assignmentId: z.string(),
      chart: productSizeChartAssignmentSummarySchema,
    })
    .nullable(),
  effective: z
    .object({
      scope: sizeChartScopeSchema,
      chart: productSizeChartAssignmentSummarySchema,
    })
    .nullable(),
});
export const productSizeChartAssignmentResponseSchema = z.object({
  data: productSizeChartAssignmentSchema,
});
export type ProductSizeChartAssignmentSummary = z.infer<typeof productSizeChartAssignmentSummarySchema>;
export type ProductSizeChartAssignment = z.infer<typeof productSizeChartAssignmentSchema>;
export type ProductSizeChartAssignmentResponse = z.infer<typeof productSizeChartAssignmentResponseSchema>;

/* ════════════════════════════════════════════════════════════════════════════
 * TODO-166 (ADR-265) — Admin Slug & Redirect Management (TD-057 kapanışı).
 *
 * Store-admin SEO modülü sözleşmeleri. Mevcut motoru (SlugHistory/Redirect +
 * @commerce-os/utils saf resolver) YÖNETİR; yeni motor KURMAZ. İki yüzey:
 *  - Redirect'ler: otomatik (slug-değişimi) + manuel (elle) yönlendirme kuralları.
 *  - Slug'lar: ürün/kategori/marka güncel slug + geçmiş projeksiyonu.
 * Tüm uçlar store-scoped; response'lar allowlist projeksiyonu (storeId sızmaz).
 * ════════════════════════════════════════════════════════════════════════════ */

export const REDIRECT_TYPE_VALUES = ["PERMANENT_301", "FOUND_302", "TEMPORARY_307", "PERMANENT_308"] as const;
export const adminRedirectTypeSchema = z.enum(REDIRECT_TYPE_VALUES);
export const adminRedirectOriginSchema = z.enum(["AUTOMATIC", "MANUAL"]);
/** Redirect'in kaynak path şeklinden TÜRETİLEN entity türü (kolon/filtre; DB'de tutulmaz). */
export const adminRedirectEntityTypeSchema = z.enum(["PRODUCT", "CATEGORY", "BRAND", "OTHER"]);

export const REDIRECT_PATH_MAX_LENGTH = 2048;
export const REDIRECT_NOTES_MAX_LENGTH = 500;
const redirectPathInputSchema = z.string().trim().min(1).max(REDIRECT_PATH_MAX_LENGTH);

export const adminRedirectSchema = z.object({
  id: z.string(),
  sourcePath: z.string(),
  targetPath: z.string(),
  type: adminRedirectTypeSchema,
  /** HTTP sayısal statü (301/302/307/308) — type'tan türetilir (istemci kolaylığı). */
  status: z.number().int(),
  origin: adminRedirectOriginSchema,
  entityType: adminRedirectEntityTypeSchema,
  enabled: z.boolean(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

/** Detay: SAF resolver ile çözülen zincir (canonical hedef + zincir uzunluğu + loop bayrağı). */
export const adminRedirectDetailSchema = adminRedirectSchema.extend({
  resolvedTarget: z.string().nullable(),
  chainLength: z.number().int().nonnegative(),
  hasLoop: z.boolean(),
});

export const adminRedirectListResponseSchema = z.object({
  data: z.array(adminRedirectSchema),
  pagination: adminListPaginationSchema,
});
export const adminRedirectDetailResponseSchema = z.object({ data: adminRedirectDetailSchema });
export const adminRedirectResponseSchema = z.object({ data: adminRedirectSchema });

export const adminRedirectListQuerySchema = adminListQueryBaseSchema.extend({
  sortBy: z.enum(["createdAt", "updatedAt", "sourcePath"]).optional(),
  origin: adminRedirectOriginSchema.optional(),
  type: adminRedirectTypeSchema.optional(),
  entityType: adminRedirectEntityTypeSchema.optional(),
  /** Query-string boolean: "true"/"false". */
  enabled: z.enum(["true", "false"]).optional(),
});

export const adminRedirectCreateRequestSchema = z.object({
  sourcePath: redirectPathInputSchema,
  targetPath: redirectPathInputSchema,
  type: adminRedirectTypeSchema.optional(),
  notes: z.string().trim().max(REDIRECT_NOTES_MAX_LENGTH).optional(),
  enabled: z.boolean().optional(),
});

export const adminRedirectUpdateRequestSchema = z
  .object({
    sourcePath: redirectPathInputSchema.optional(),
    targetPath: redirectPathInputSchema.optional(),
    type: adminRedirectTypeSchema.optional(),
    notes: z.string().trim().max(REDIRECT_NOTES_MAX_LENGTH).nullable().optional(),
    enabled: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "At least one field is required." });

export type AdminRedirect = z.infer<typeof adminRedirectSchema>;
export type AdminRedirectDetail = z.infer<typeof adminRedirectDetailSchema>;
export type AdminRedirectListResponse = z.infer<typeof adminRedirectListResponseSchema>;
export type AdminRedirectDetailResponse = z.infer<typeof adminRedirectDetailResponseSchema>;
export type AdminRedirectResponse = z.infer<typeof adminRedirectResponseSchema>;
export type AdminRedirectListQuery = z.infer<typeof adminRedirectListQuerySchema>;
export type AdminRedirectCreateRequest = z.infer<typeof adminRedirectCreateRequestSchema>;
export type AdminRedirectUpdateRequest = z.infer<typeof adminRedirectUpdateRequestSchema>;

/* ---- Slug projeksiyonu (ürün/kategori/marka güncel slug + geçmiş) -------------- */

export const adminSlugEntityTypeSchema = z.enum(["PRODUCT", "CATEGORY", "BRAND"]);

export const adminSlugRecordSchema = z.object({
  entityType: adminSlugEntityTypeSchema,
  entityId: z.string(),
  name: z.string(),
  slug: z.string(),
  canonicalUrl: z.string(),
  status: z.string(),
  previousSlugCount: z.number().int().nonnegative(),
  redirectCount: z.number().int().nonnegative(),
  updatedAt: z.string().datetime(),
});

export const adminSlugHistoryEntrySchema = z.object({
  oldSlug: z.string(),
  oldPath: z.string(),
  createdAt: z.string().datetime(),
});

export const adminSlugDetailSchema = adminSlugRecordSchema.extend({
  history: z.array(adminSlugHistoryEntrySchema),
});

export const adminSlugListResponseSchema = z.object({
  data: z.array(adminSlugRecordSchema),
  pagination: adminListPaginationSchema,
});
export const adminSlugDetailResponseSchema = z.object({ data: adminSlugDetailSchema });

export const adminSlugListQuerySchema = adminListQueryBaseSchema.extend({
  sortBy: z.enum(["updatedAt", "slug", "name"]).optional(),
  entityType: adminSlugEntityTypeSchema.optional(),
  status: z.enum(["active", "archived"]).optional(),
  /** Yalnız yönlendirmesi (slug geçmişi) olan kayıtlar. */
  hasRedirects: z.enum(["true", "false"]).optional(),
});

export type AdminSlugEntityType = z.infer<typeof adminSlugEntityTypeSchema>;
export type AdminSlugRecord = z.infer<typeof adminSlugRecordSchema>;
export type AdminSlugHistoryEntry = z.infer<typeof adminSlugHistoryEntrySchema>;
export type AdminSlugDetail = z.infer<typeof adminSlugDetailSchema>;
export type AdminSlugListResponse = z.infer<typeof adminSlugListResponseSchema>;
export type AdminSlugDetailResponse = z.infer<typeof adminSlugDetailResponseSchema>;
export type AdminSlugListQuery = z.infer<typeof adminSlugListQuerySchema>;

/* ═══════════════════════ TODO-169 (ADR-269) — Returns Management Foundation ═══════════════════════
 * Müşteri iade talebi + Store Admin iade operasyonu. İade OrderLine + quantity seviyesinde.
 * Enum'lar Prisma ile birebir (stable/dildir); TR/EN etiketler i18n katmanındadır. Para minor-unit.
 * Müşteri yüzeyi allowlist: adminNote / iç alan / secret ASLA dönmez. */

export const returnStatusSchema = z.enum([
  "REQUESTED",
  "UNDER_REVIEW",
  "PARTIALLY_APPROVED",
  "APPROVED",
  "REJECTED",
  "AWAITING_SHIPMENT",
  "RETURN_SHIPPED",
  "RECEIVED",
  "INSPECTION_REQUIRED",
  "INSPECTED",
  "REFUND_PENDING",
  "REPLACEMENT_PENDING",
  "COMPLETED",
  "CANCELLED_BY_CUSTOMER",
  "EXPIRED",
  "CLOSED",
]);

// TODO-175 (ADR-285): REFUND = nötr refund çözümü (destination ayrı refundDestination alanında).
// REFUND_TO_ORIGINAL_PAYMENT legacy olarak korunur (= REFUND + ORIGINAL_PAYMENT semantiği).
export const returnResolutionTypeSchema = z.enum(["REFUND", "REFUND_TO_ORIGINAL_PAYMENT", "REPLACEMENT"]);

// TODO-175 (ADR-285) — Refund geri ödeme hedefi (yalnız external-origin bileşeni yönetir).
export const refundDestinationSchema = z.enum(["ORIGINAL_PAYMENT", "SHOPPING_BALANCE"]);
export type RefundDestinationValue = z.infer<typeof refundDestinationSchema>;

// Server-authoritative refund hedef önizlemesi (split + eligibility). Client tutar GÖNDERMEZ.
export const refundDestinationPreviewSchema = z.object({
  totalRefundableMinor: z.number().int().nonnegative(),
  externalComponentMinor: z.number().int().nonnegative(),
  creditComponentMinor: z.number().int().nonnegative(),
  offerOriginalPayment: z.boolean(),
  offerShoppingBalance: z.boolean(),
});
export type RefundDestinationPreview = z.infer<typeof refundDestinationPreviewSchema>;

export const returnReasonSchema = z.enum([
  "NO_LONGER_NEEDED",
  "ORDERED_BY_MISTAKE",
  "BETTER_PRICE_AVAILABLE",
  "NOT_AS_DESCRIBED",
  "WRONG_ITEM_RECEIVED",
  "DEFECTIVE_OR_NOT_WORKING",
  "DAMAGED_PRODUCT",
  "DAMAGED_PACKAGING",
  "MISSING_PARTS_OR_ACCESSORIES",
  "QUALITY_NOT_EXPECTED",
  "SIZE_OR_FIT_ISSUE",
  "DELIVERY_TOO_LATE",
  "UNAUTHORIZED_PURCHASE",
  "OTHER",
]);

export const returnItemConditionStatusSchema = z.enum([
  "NEW_UNOPENED",
  "OPENED_UNUSED",
  "USED",
  "DAMAGED",
]);
export const returnInspectionResultSchema = z.enum(["PASSED", "FAILED", "PARTIAL"]);
export const returnRestockDecisionSchema = z.enum([
  "RESTOCK_AS_SELLABLE",
  "RESTOCK_AS_DAMAGED",
  "DO_NOT_RESTOCK",
  "RETURN_TO_VENDOR",
  "DISPOSE",
]);
// ADR-272: CONSUMED additive (ilk OrderRefund oluşturulurken atomik consume). PROCESSED legacy/kullanılmaz.
export const refundIntentStatusSchema = z.enum(["PENDING", "PROCESSED", "CONSUMED", "CANCELLED"]);

/** Nedene göre açıklama zorunlu mu (server + client aynı kural). Kusurlu/hasarlı/yanlış/OTHER → zorunlu. */
export const RETURN_REASONS_REQUIRING_COMMENT: readonly z.infer<typeof returnReasonSchema>[] = [
  "NOT_AS_DESCRIBED",
  "WRONG_ITEM_RECEIVED",
  "DEFECTIVE_OR_NOT_WORKING",
  "DAMAGED_PRODUCT",
  "DAMAGED_PACKAGING",
  "MISSING_PARTS_OR_ACCESSORIES",
  "OTHER",
] as const;

export function returnReasonRequiresComment(reason: z.infer<typeof returnReasonSchema>): boolean {
  return RETURN_REASONS_REQUIRING_COMMENT.includes(reason);
}

export const RETURN_COMMENT_MAX = 1000;

/* ── ORTAK: sipariş-bazında iade özeti projeksiyonu (TODO-169 blocker #8) ─────────
 * Tek server-side otorite. Müşteri sipariş listesi/detayı + Store-Admin sipariş detayı AYNI özeti
 * kullanır (React'te yeniden hesap YOK). windowState = teslim-türetilmiş sipariş-seviyesi pencere
 * durumu (iade olmasa da geçerli). Finans dürüstlüğü: approvedRefundIntentMinor (PENDING niyet) ≠
 * completedRefundMinor (gerçekleşen; TODO-170'e kadar 0). Gross satış ASLA düşülmez. */
export const returnWindowStateSchema = z.enum(["NOT_DELIVERED", "ELIGIBLE", "EXPIRED"]);

export const returnOrderSummarySchema = z.object({
  currency: currencySchema,
  // Pencere (blocker #1) — teslim ankoru + policy'den türetilir; teslim yoksa null.
  deliveredAt: z.string().datetime().nullable(),
  returnWindowDays: z.number().int().nonnegative(),
  returnWindowEndsAt: z.string().datetime().nullable(),
  remainingDays: z.number().int().nullable(),
  windowState: returnWindowStateSchema,
  // Aktivite (blocker #5/#6).
  requestCount: z.number().int().nonnegative(),
  activeRequestCount: z.number().int().nonnegative(),
  // TODO-169 recovery (BUG-RETURN-DEEPLINK) — CTA tek-otorite deep-link hedefi: tam olarak bir
  // "odak" iade varsa (tek aktif; yoksa tek toplam) onun returnNumber'ı, belirsizse null (→ sipariş
  // detayı #returns). React'te ayrı hesap YOK; her CTA aynı contract'ı kullanır.
  primaryReturnNumber: z.string().nullable().default(null),
  returnedItemQuantity: z.number().int().nonnegative(),
  pendingItemQuantity: z.number().int().nonnegative(),
  latestStatus: returnStatusSchema.nullable(),
  // Finansal etki (blocker #7) — niyet vs gerçekleşen AYRI.
  approvedRefundIntentMinor: z.number().int().nonnegative(),
  completedRefundMinor: z.number().int().nonnegative(),
  hasPendingFinancialImpact: z.boolean(),
});
export type ReturnWindowState = z.infer<typeof returnWindowStateSchema>;
export type ReturnOrderSummary = z.infer<typeof returnOrderSummarySchema>;

/* ══ TODO-174 (ADR-275/277/278) — Customer Self-Service Order Cancellation ═════════════════════════
 * Platform-tanımlı iptal taksonomisi + sipariş-bazında iptal uygunluğu özeti + müşteri iptal talebi.
 * Store Admin taksonomiyi DEĞİŞTİREMEZ (registry burada platform-owned). Refund tutarı client'tan
 * KABUL EDİLMEZ (server-authoritative). Enum'lar dosyanın başında (finance raporu da kullanır) tanımlı. */

/**
 * Platform-tanımlı iptal nedeni taksonomisi — TEK OTORİTE (server + client aynı registry). Store Admin
 * CRUD YAPAMAZ. Kaldırma = `active:false` (enum değeri kalıcı → geçmiş raporlar korunur; ADR-278). TR/EN
 * etiketleri i18n katmanındadır (packages/i18n storefront `cancellations`). `displayOrder` müşteriye
 * gösterim sırası (kategori sonra kod). Taksonomi değişikliği gelecekteki "Store → Platform Request"
 * domain'i üzerinden yapılacak (bu fazda IMPLEMENT EDİLMEZ).
 */
export interface CancellationReasonTaxonomyEntry {
  code: OrderCancellationReasonValue;
  category: OrderCancellationReasonCategoryValue;
  active: boolean;
  displayOrder: number;
}

export const CANCELLATION_REASON_TAXONOMY: readonly CancellationReasonTaxonomyEntry[] = [
  { code: "WRONG_PRODUCT", category: "ORDER_MISTAKE", active: true, displayOrder: 10 },
  { code: "WRONG_VARIANT_SIZE_COLOR", category: "ORDER_MISTAKE", active: true, displayOrder: 20 },
  { code: "WRONG_QUANTITY", category: "ORDER_MISTAKE", active: true, displayOrder: 30 },
  { code: "DUPLICATE_ORDER", category: "ORDER_MISTAKE", active: true, displayOrder: 40 },
  { code: "ACCIDENTAL_ORDER", category: "ORDER_MISTAKE", active: true, displayOrder: 50 },
  { code: "FOUND_CHEAPER_ELSEWHERE", category: "PRICE_PROMOTION", active: true, displayOrder: 60 },
  { code: "COUPON_DISCOUNT_NOT_AS_EXPECTED", category: "PRICE_PROMOTION", active: true, displayOrder: 70 },
  { code: "TOTAL_PRICE_TOO_HIGH", category: "PRICE_PROMOTION", active: true, displayOrder: 80 },
  { code: "DELIVERY_ESTIMATE_TOO_LONG", category: "DELIVERY", active: true, displayOrder: 90 },
  { code: "SHIPPING_FEE_TOO_HIGH", category: "DELIVERY", active: true, displayOrder: 100 },
  { code: "WILL_NOT_ARRIVE_IN_TIME", category: "DELIVERY", active: true, displayOrder: 110 },
  { code: "WRONG_PAYMENT_METHOD", category: "PAYMENT", active: true, displayOrder: 120 },
  { code: "INSTALLMENT_OR_PAYMENT_OPTION_UNSUITABLE", category: "PAYMENT", active: true, displayOrder: 130 },
  { code: "PAYMENT_CONCERN", category: "PAYMENT", active: true, displayOrder: 140 },
  { code: "NO_LONGER_NEEDED", category: "PRODUCT_DECISION", active: true, displayOrder: 150 },
  { code: "CHANGED_MIND", category: "PRODUCT_DECISION", active: true, displayOrder: 160 },
  { code: "PREFER_DIFFERENT_PRODUCT", category: "PRODUCT_DECISION", active: true, displayOrder: 170 },
  { code: "OTHER", category: "OTHER", active: true, displayOrder: 999 },
] as const;

const CANCELLATION_REASON_INDEX: ReadonlyMap<OrderCancellationReasonValue, CancellationReasonTaxonomyEntry> =
  new Map(CANCELLATION_REASON_TAXONOMY.map((e) => [e.code, e]));

/** Aktif taksonomi girişleri (displayOrder'a göre sıralı). Client seçim listesi + server whitelist. */
export function activeCancellationReasons(): CancellationReasonTaxonomyEntry[] {
  return CANCELLATION_REASON_TAXONOMY.filter((e) => e.active).sort((a, b) => a.displayOrder - b.displayOrder);
}

/** Kod aktif taksonomide mi (inactive/bilinmeyen reddedilir — server whitelist). */
export function isActiveCancellationReason(code: string): code is OrderCancellationReasonValue {
  const entry = CANCELLATION_REASON_INDEX.get(code as OrderCancellationReasonValue);
  return Boolean(entry && entry.active);
}

/** Kodun (server-türetilen) kategori kodu; bilinmeyen → null. */
export function cancellationReasonCategory(
  code: OrderCancellationReasonValue,
): OrderCancellationReasonCategoryValue | null {
  return CANCELLATION_REASON_INDEX.get(code)?.category ?? null;
}

export const CANCELLATION_NOTE_MAX = 1000;

/** OTHER → açıklama zorunlu; diğerlerinde opsiyonel (server + client aynı kural — ADR-278). */
export function cancellationReasonRequiresNote(code: OrderCancellationReasonValue): boolean {
  return code === "OTHER";
}

/* ── Sipariş-bazında iptal uygunluğu özeti (customer list/detail + admin) ─────────────────────────
 * Eligibility sınırı = CARRIER HANDOFF (shipment varlığı DEĞİL). Yalnız OUTBOUND_TO_CUSTOMER gönderiler
 * sayılır; reverse yönler HARİÇ. ALLOWED=iptal edilebilir; BLOCKED_IN_TRANSIT=kargoya verildi (iade akışı
 * değil, "yolda" mesajı); BLOCKED_DELIVERED=teslim edildi (→ iade akışı); NOT_CANCELLABLE=durum uygun değil
 * (zaten iptal/fulfilled/draft). `version` = optimistic concurrency (modal expectedVersion olarak döner). */
export const cancellationEligibilityStateSchema = z.enum([
  "ALLOWED",
  "BLOCKED_IN_TRANSIT",
  "BLOCKED_DELIVERED",
  "NOT_CANCELLABLE",
]);
export type CancellationEligibilityState = z.infer<typeof cancellationEligibilityStateSchema>;

/** Vitrin refund durumu (MASKELİ; teknik provider kodu YOK). NONE = ödeme alınmamış / refund üretilmemiş. */
export const cancellationRefundStatusSchema = z.enum([
  "NONE",
  "PENDING",
  "PROCESSING",
  "SUCCEEDED",
  "FAILED",
]);
export type CancellationRefundStatus = z.infer<typeof cancellationRefundStatusSchema>;

export const cancellationOrderSummarySchema = z.object({
  eligibility: cancellationEligibilityStateSchema,
  currency: currencySchema,
  // Optimistic concurrency; modal bunu expectedVersion olarak geri gönderir.
  version: z.number().int().nonnegative(),
  // Ödeme alınmış mı (captured>0). false ise refund copy gösterilmez.
  isPaid: z.boolean(),
  // ALLOWED iken iptalde iade edilecek server-authoritative tahmini tutar (unpaid → 0). Kargo ücreti dahil.
  estimatedRefundMinor: z.number().int().nonnegative(),
  // TODO-175 — refund destination split (§5.5): external-origin (PSP/balance seçilebilir) vs credit-origin
  // (her zaman balance restore). Modal destination adımı + confirm summary bunları gösterir.
  externalRefundableMinor: z.number().int().nonnegative().default(0),
  creditRestorableMinor: z.number().int().nonnegative().default(0),
  offerOriginalPayment: z.boolean().default(false),
  offerShoppingBalance: z.boolean().default(false),
  // Zaten iptal edilmiş sipariş provenance'i (iptal edilmemişse null).
  cancelledAt: z.string().datetime().nullable().default(null),
  cancelSource: orderCancellationSourceSchema.nullable().default(null),
  reasonCode: orderCancellationReasonSchema.nullable().default(null),
  reasonCategory: orderCancellationReasonCategorySchema.nullable().default(null),
  reasonNote: z.string().nullable().default(null),
  // İptal refund'unun (varsa) MASKELİ yürütme durumu.
  refundStatus: cancellationRefundStatusSchema.nullable().default(null),
});
export type CancellationOrderSummary = z.infer<typeof cancellationOrderSummarySchema>;

/* ── Müşteri: iptal uygunluğu (dedicated GET) + iptal talebi (POST) ──────────────────────────────── */
export const customerOrderCancelEligibilityResponseSchema = z.object({
  // Projeksiyon fail-open (geçici DB hatası) → null (client "bilinmiyor" olarak ele alır, yenile).
  eligibility: cancellationOrderSummarySchema.nullable().default(null),
});
export type CustomerOrderCancelEligibilityResponse = z.infer<
  typeof customerOrderCancelEligibilityResponseSchema
>;

export const customerOrderCancelRequestSchema = z
  .object({
    // Client YALNIZ kodu gönderir; kategori server'da registry'den türetilir + doğrulanır.
    reasonCode: orderCancellationReasonSchema,
    reasonNote: z.string().max(CANCELLATION_NOTE_MAX).optional(),
    // TODO-175 — müşteri refund hedefi (yalnız external-origin bileşeni etkiler). Opsiyonel: unpaid /
    // credit-only akışta gönderilmez; gönderilirse server eligibility'yi doğrular (INVALID_DESTINATION).
    refundDestination: refundDestinationSchema.optional(),
    // Optimistic concurrency (opsiyonel; verilirse guard'lanır — server ayrıca kendi guard'ını uygular).
    expectedVersion: z.number().int().nonnegative().optional(),
  })
  .superRefine((val, ctx) => {
    if (cancellationReasonRequiresNote(val.reasonCode) && !val.reasonNote?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reasonNote"],
        message: "OTHER nedeni için açıklama zorunludur.",
      });
    }
  });
export type CustomerOrderCancelRequest = z.infer<typeof customerOrderCancelRequestSchema>;

export const customerOrderCancelResponseSchema = z.object({
  order: z.lazy(() => customerOrderDetailSchema),
  // İptal başarılı; refund AYRI durum (yanıltıcı "iade tamamlandı" gösterme — refundStatus otoritedir).
  // Projeksiyon fail-open olursa null (order.cancellationSummary da taşınır — client oradan da okuyabilir).
  cancellation: cancellationOrderSummarySchema.nullable().default(null),
});
export type CustomerOrderCancelResponse = z.infer<typeof customerOrderCancelResponseSchema>;

/* ── Müşteri: iade uygunluğu (order detay üzeri) ─────────────────────────────── */
export const returnLineEligibilityStatusSchema = z.enum([
  "ELIGIBLE",
  "NOT_DELIVERED",
  "WINDOW_EXPIRED",
  "FULLY_RETURNED",
  "NOT_ELIGIBLE",
]);

export const customerReturnEligibilityLineSchema = z.object({
  orderLineId: z.string(),
  variantId: z.string(),
  productSlug: z.string(),
  sku: z.string(),
  title: z.string(),
  variantTitle: z.string(),
  imageUrl: z.string().nullable(),
  purchasedQuantity: z.number().int().positive(),
  remainingReturnableQty: z.number().int().nonnegative(),
  unitPriceMinor: z.number().int().nonnegative(),
  eligibility: returnLineEligibilityStatusSchema,
  returnWindowEndsAt: z.string().datetime().nullable(),
  hasActiveReturn: z.boolean(),
});

export const customerReturnEligibilitySchema = z.object({
  orderNumber: z.string(),
  currency: currencySchema,
  returnable: z.boolean(),
  // TODO-169 (blocker #1) — teslim ankoru + policy'den türetilen pencere alanları (server-authoritative).
  // deliveredAt = iade penceresi başlangıç otoritesi (satın alma/placedAt DEĞİL). returnWindowDays =
  // store policy (default 14). remainingDays/windowState = müşteri-facing etiketler için türetilir.
  deliveredAt: z.string().datetime().nullable(),
  returnWindowDays: z.number().int().nonnegative(),
  returnWindowEndsAt: z.string().datetime().nullable(),
  remainingDays: z.number().int().nullable(),
  windowState: returnWindowStateSchema,
  allowReplacement: z.boolean(),
  allowOriginalPaymentRefund: z.boolean(),
  customerPaysReturnShipping: z.boolean(),
  lines: z.array(customerReturnEligibilityLineSchema),
});
export const customerReturnEligibilityResponseSchema = z.object({
  eligibility: customerReturnEligibilitySchema,
});

/* ── Müşteri: iade talebi oluşturma ───────────────────────────────────────────── */
export const customerReturnCreateItemSchema = z.object({
  orderLineId: z.string().min(1),
  quantity: z.number().int().positive(),
  reason: returnReasonSchema,
  customerComment: z.string().max(RETURN_COMMENT_MAX).optional(),
  // Daha önce yüklenmiş (bu müşteriye ait) iade attachment media id'leri.
  attachmentMediaIds: z.array(z.string().min(1)).max(6).optional(),
});

export const customerReturnCreateRequestSchema = z
  .object({
    orderNumber: z.string().min(1),
    resolutionType: returnResolutionTypeSchema,
    // TODO-175 — REFUND çözümünde zorunlu müşteri hedefi; REPLACEMENT'ta gönderilmez.
    refundDestination: refundDestinationSchema.optional(),
    customerNote: z.string().max(RETURN_COMMENT_MAX).optional(),
    items: z.array(customerReturnCreateItemSchema).min(1),
  })
  .superRefine((val, ctx) => {
    // Nötr REFUND çözümü için destination zorunlu (server ayrıca eligibility doğrular).
    if (val.resolutionType === "REFUND" && !val.refundDestination) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["refundDestination"],
        message: "İade yöntemi seçimi zorunludur.",
      });
    }
  });

/* ── Müşteri: iade özeti / detay / takip ──────────────────────────────────────── */
export const customerReturnItemSchema = z.object({
  id: z.string(),
  orderLineId: z.string(),
  title: z.string(),
  variantTitle: z.string(),
  sku: z.string(),
  imageUrl: z.string().nullable(),
  quantity: z.number().int().positive(),
  approvedQuantity: z.number().int().nonnegative().nullable(),
  reason: returnReasonSchema,
  customerComment: z.string().nullable(),
  attachmentCount: z.number().int().nonnegative(),
});

export const customerReturnHistoryEntrySchema = z.object({
  toStatus: returnStatusSchema,
  actorType: z.enum(["CUSTOMER", "ADMIN", "SYSTEM"]),
  createdAt: z.string().datetime(),
});

export const customerReturnSummarySchema = z.object({
  returnNumber: z.string(),
  orderNumber: z.string(),
  status: returnStatusSchema,
  resolutionType: returnResolutionTypeSchema,
  itemCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});

/* TODO-170 (ADR-272) — Customer (vitrin) refund durumu — MASKELİ; teknik provider kodu YOK. */
export const customerRefundSummarySchema = z.object({
  // NONE = henüz refund başlatılmadı (yalnız beklenen niyet var).
  status: z.enum(["NONE", "PENDING", "PROCESSING", "SUCCEEDED", "FAILED"]),
  currency: currencySchema,
  refundedTotalMinor: z.number().int().nonnegative(),
  expectedTotalMinor: z.number().int().nonnegative(),
  // Maskeli ödeme yöntemi ("Kart •••• 1234" / "Banka havalesi"); ham PAN/secret ASLA.
  methodLabel: z.string().nullable(),
  completedAt: z.string().datetime().nullable(),
});
export type CustomerRefundSummary = z.infer<typeof customerRefundSummarySchema>;

/* ── TODO-174A (ADR-280) — Refund menşei (birleşik iade/refund görünürlüğü) ──────────
 * ReturnRequest akışı ile intent'siz cancellation akışını POZİTİF ayırır (nullable-FK
 * çıkarımına güvenmeden). Hem Store Admin hem vitrin birleşik projeksiyonu bunun üstüne kurulur. */
export const refundOriginSchema = z.enum(["RETURN_REQUEST", "ORDER_CANCELLATION"]);
export type RefundOriginValue = z.infer<typeof refundOriginSchema>;

// TODO-173 (ADR-274) — Müşteri sade reverse tracking görünümü — teknik disposition kodu / internal
// reason / recipient PII YOK; refund'dan AYRIK ("Ürün size geri gönderiliyor").
export const customerReverseShipmentSchema = z.object({
  productTitle: z.string(),
  variantTitle: z.string().nullable(),
  quantity: z.number().int().positive(),
  carrierName: z.string().nullable(),
  trackingNumber: z.string().nullable(),
  trackingUrl: z.string().nullable(),
  status: shipmentStatusValueSchema,
  shippedAt: z.string().datetime().nullable(),
  estimatedDeliveryAt: z.string().datetime().nullable(),
  deliveredAt: z.string().datetime().nullable(),
});
export type CustomerReverseShipment = z.infer<typeof customerReverseShipmentSchema>;

export const customerReturnDetailSchema = customerReturnSummarySchema.extend({
  currency: currencySchema,
  customerNote: z.string().nullable(),
  returnCarrier: z.string().nullable(),
  returnTrackingNumber: z.string().nullable(),
  customerPaysReturnShipping: z.boolean(),
  // Snapshot verisinden TAHMİNİ iade tutarı (yalnız bilgilendirme; nihai gerçek tutar `refund`'da).
  estimatedRefundMinor: z.number().int().nonnegative().nullable(),
  // TODO-170 (ADR-272) — MASKELİ müşteri refund durumu (teknik provider kodu YOK). null = henüz refund yok.
  refund: customerRefundSummarySchema.nullable().default(null),
  returnWindowEndsAt: z.string().datetime(),
  // TODO-169 recovery — "Ürünü geri gönderin" akışı: ürünün mağazaya son gönderim tarihi (onay
  // ankoru + kargolama süresi). Sunucu-otoriter; AWAITING_SHIPMENT'te müşteriye gösterilir.
  shipByDate: z.string().datetime().nullable().default(null),
  canCancel: z.boolean(),
  canSubmitTracking: z.boolean(),
  items: z.array(customerReturnItemSchema),
  history: z.array(customerReturnHistoryEntrySchema),
  // TODO-173 (ADR-274) — "Ürün size geri gönderiliyor" (STORE_RETURN_TO_CUSTOMER). Refund'dan AYRIK.
  reverseShipments: z.array(customerReverseShipmentSchema).default([]),
});

export const customerReturnListResponseSchema = z.object({
  data: z.array(customerReturnSummarySchema),
});

/* ── TODO-174A — Vitrin "İadelerim" BİRLEŞİK satırı: iade talebi + sipariş iptali geri ödemesi ──
 * ReturnRequest ve OrderRefund AYRI domain'ler kalır; bu yalnız PROJEKSİYON birleşimidir (yeni
 * tablo YOK). Cancellation satırı "return request varmış" gibi sunulmaz — kendi kaynağıyla
 * (`source`) etiketlenir. Müşteri YALNIZ kendi kayıtlarını görür (server-scoped). */
export const customerRefundVisibilityItemSchema = z.object({
  source: refundOriginSchema,
  // Kart tıklaması: RETURN_REQUEST → iade detayı (`reference`=returnNumber);
  // ORDER_CANCELLATION → sipariş detayı (`reference`=orderNumber → /account/orders/:orderNumber).
  reference: z.string(),
  orderNumber: z.string(),
  createdAt: z.string().datetime(),
  // Yalnız iade talebi (RETURN_REQUEST) satırları:
  returnStatus: returnStatusSchema.nullable().default(null),
  resolutionType: returnResolutionTypeSchema.nullable().default(null),
  itemCount: z.number().int().nonnegative().nullable().default(null),
  // Yalnız sipariş iptali (ORDER_CANCELLATION) satırları — MASKELİ refund + insani neden:
  refund: customerRefundSummarySchema.nullable().default(null),
  cancellationReasonCode: orderCancellationReasonSchema.nullable().default(null),
  cancellationReasonNote: z.string().nullable().default(null),
});
export type CustomerRefundVisibilityItem = z.infer<typeof customerRefundVisibilityItemSchema>;

export const customerRefundVisibilityListResponseSchema = z.object({
  data: z.array(customerRefundVisibilityItemSchema),
});
export type CustomerRefundVisibilityListResponse = z.infer<
  typeof customerRefundVisibilityListResponseSchema
>;

/* ── TODO-174A (ADR-279) — Sipariş Deneyimi Değerlendirmesi (ProductReview'dan TAMAMEN AYRIK) ──
 * ÜRÜN puanına / ProductRatingAggregate'e / PDP-PLP rating'lerine ASLA yansımaz ("ürünü kullandım"
 * anlamı üretmez). İptal edilmiş ve teslim EDİLMEMİŞ siparişte sipariş/iptal deneyimi (1-5 + opsiyonel
 * yorum). Bir müşteri bir sipariş için EN FAZLA bir değerlendirme (duplicate koruması). */
export const ORDER_EXPERIENCE_COMMENT_MAX = 1000;
export const orderExperienceReviewCreateSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(ORDER_EXPERIENCE_COMMENT_MAX).optional(),
});
export type OrderExperienceReviewCreateInput = z.infer<typeof orderExperienceReviewCreateSchema>;

// Vitrin sipariş kartı/detayında deneyim-değerlendirme CTA durumu (server-otoriter uygunluk).
// `eligible` = iptal edilmiş + teslim EDİLMEMİŞ + müşteriye ait. `submitted` = zaten değerlendirilmiş.
export const orderExperienceEligibilitySchema = z.object({
  orderNumber: z.string(),
  submitted: z.boolean(),
  rating: z.number().int().min(1).max(5).nullable().default(null),
});
export type OrderExperienceEligibility = z.infer<typeof orderExperienceEligibilitySchema>;

export const orderExperienceListResponseSchema = z.object({
  data: z.array(orderExperienceEligibilitySchema),
});
export type OrderExperienceListResponse = z.infer<typeof orderExperienceListResponseSchema>;

export const orderExperienceReviewResponseSchema = z.object({
  review: z.object({
    orderNumber: z.string(),
    rating: z.number().int().min(1).max(5),
    comment: z.string().nullable(),
    createdAt: z.string().datetime(),
  }),
});
export type OrderExperienceReviewResponse = z.infer<typeof orderExperienceReviewResponseSchema>;
export const customerReturnDetailResponseSchema = z.object({ return: customerReturnDetailSchema });
export const customerReturnCreateResponseSchema = z.object({
  return: customerReturnDetailSchema,
});

// Müşteri iade kargo takip no gönderimi (AWAITING_SHIPMENT → RETURN_SHIPPED) + iptal.
export const customerReturnTrackingRequestSchema = z.object({
  carrier: z.string().min(1).max(120),
  trackingNumber: z.string().min(1).max(120),
});

/* ── Store Admin: iade listesi ────────────────────────────────────────────────── */
export const adminReturnListItemSchema = z.object({
  id: z.string(),
  returnNumber: z.string(),
  orderNumber: z.string(),
  customerName: z.string().nullable(),
  customerEmail: z.string().nullable(),
  itemCount: z.number().int().nonnegative(),
  totalQuantity: z.number().int().nonnegative(),
  resolutionType: returnResolutionTypeSchema,
  status: returnStatusSchema,
  requestedAt: z.string().datetime(),
  returnWindowEndsAt: z.string().datetime(),
  // SLA: talepten bu yana geçen gün (server hesaplar; renk yalnız gösterge, tek sinyal değil).
  ageDays: z.number().int().nonnegative(),
});

export const adminReturnListQuerySchema = adminListQueryBaseSchema.extend({
  sortBy: z.enum(["requestedAt", "returnWindowEndsAt", "status"]).optional(),
  status: returnStatusSchema.optional(),
  resolutionType: returnResolutionTypeSchema.optional(),
  reason: returnReasonSchema.optional(),
  orderNumber: z.string().optional(),
  // SLA gecikenler (ageDays >= eşik). true → yalnız geciken talepler.
  overdue: z.enum(["true", "false"]).optional(),
  // TODO-174A — kaynak filtresi: yok → hepsi; RETURN_REQUEST → yalnız iade talepleri;
  // ORDER_CANCELLATION → yalnız sipariş iptali geri ödemeleri.
  source: refundOriginSchema.optional(),
});

export const adminReturnListResponseSchema = z.object({
  data: z.array(adminReturnListItemSchema),
  pagination: adminListPaginationSchema,
});

/* ── Store Admin: sipariş detayına iade entegrasyonu (blocker #6) ────────────────
 * Bir siparişin ORTAK iade özeti (projection) + o siparişe ait iade talepleri. */
export const adminOrderReturnsResponseSchema = z.object({
  summary: returnOrderSummarySchema,
  returns: z.array(adminReturnListItemSchema),
});
export type AdminOrderReturnsResponse = z.infer<typeof adminOrderReturnsResponseSchema>;

/* ── Store Admin: Bekleyen İş Özeti (Pending Work Summary) ───────────────────────
 * TODO-170-recovery — tek server-side otorite; store-scoped bounded aggregate (N+1 YOK).
 * Sidebar sayaçları + Dashboard "Bekleyen İşler" kartı AYNI özeti kullanır. Ham enum
 * kullanıcıya sızmaz (etiketler i18n'den). Sayılar gerçek bekleyen kayıt sayısıdır; route
 * açılınca otomatik sıfırlanmaz. `oldest*At` en eski bekleme ankoru (bekleme süresi türetimi). */
const pendingBucketSchema = z.object({
  count: z.number().int().nonnegative(),
  oldestAt: z.string().datetime().nullable(),
});
export const pendingWorkSummarySchema = z.object({
  // Bekleyen ürün değerlendirmeleri (moderasyon).
  reviews: pendingBucketSchema,
  returns: z.object({
    // Sidebar rozeti: ilerleyen (settled olmayan) tüm iadeler.
    actionable: pendingBucketSchema,
    // Yeni talepler — incelenmeyi bekliyor (REQUESTED/UNDER_REVIEW).
    newRequests: pendingBucketSchema,
    // Ürün mağazaya ulaştı — inceleme bekliyor (RECEIVED/INSPECTION_REQUIRED).
    inspection: pendingBucketSchema,
    // İnceleme sonrası finansal/operasyonel aksiyon bekliyor (REFUND_PENDING/REPLACEMENT_PENDING).
    financialAction: pendingBucketSchema,
  }),
});
export type PendingWorkSummary = z.infer<typeof pendingWorkSummarySchema>;

/* ── TODO-173 (ADR-274): Reverse Shipment enum + record şemaları (admin detail'den önce) ──── */
export const returnRejectedDispositionSchema = z.enum([
  "RETURN_TO_CUSTOMER",
  "DESTROY",
  "SEND_TO_VENDOR",
  "KEEP_IN_STORE",
  "CONTACT_CUSTOMER",
]);
export type ReturnRejectedDispositionValue = z.infer<typeof returnRejectedDispositionSchema>;

export const returnDispositionStatusSchema = z.enum(["PENDING", "COMPLETED", "CANCELLED"]);
export type ReturnDispositionStatusValue = z.infer<typeof returnDispositionStatusSchema>;

// Reverse shipment manuel durum hedefi (mevcut ShipmentStatus alt-kümesi + CANCELLED). "Kargoya verildi"
// = IN_TRANSIT; "Teslim edildi" = DELIVERED; "İptal et" = CANCELLED (quantity serbest bırakır).
export const reverseShipmentStatusTargetSchema = z.enum([
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
]);
export type ReverseShipmentStatusTarget = z.infer<typeof reverseShipmentStatusTargetSchema>;

// Admin disposition kaydı (internal reason DAHİL — müşteriye ASLA sızmaz; yalnız admin DTO).
export const adminReturnDispositionSchema = z.object({
  id: z.string(),
  returnItemId: z.string(),
  type: returnRejectedDispositionSchema,
  quantity: z.number().int().positive(),
  status: returnDispositionStatusSchema,
  reason: z.string().nullable(),
  version: z.number().int().nonnegative(),
  // RETURN_TO_CUSTOMER için türetme: bu tipteki (aktif) disposition'lardan zaten sevk edilen + kalan.
  reverseShippedQuantity: z.number().int().nonnegative(),
  reverseShippableRemaining: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type AdminReturnDisposition = z.infer<typeof adminReturnDispositionSchema>;

// Reverse shipment admin kaydı (STORE_RETURN_TO_CUSTOMER). reason internal (admin görünümü).
export const reverseShipmentSchema = z.object({
  id: z.string(),
  direction: shipmentDirectionSchema,
  returnRequestId: z.string().nullable(),
  returnItemId: z.string().nullable(),
  returnQuantity: z.number().int().positive().nullable(),
  status: shipmentStatusValueSchema,
  carrierName: z.string().nullable(),
  trackingNumber: z.string().nullable(),
  trackingUrl: z.string().nullable(),
  reason: z.string().nullable(),
  recipientName: z.string().nullable(),
  recipientCityName: z.string().nullable(),
  recipientDistrictName: z.string().nullable(),
  recipientAddress: z.string().nullable(),
  estimatedDeliveryAt: z.string().datetime().nullable(),
  deliveredAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ReverseShipment = z.infer<typeof reverseShipmentSchema>;

/* ── Store Admin: iade detayı ─────────────────────────────────────────────────── */
export const adminReturnAttachmentSchema = z.object({
  id: z.string(),
  type: z.string(),
  // Auth-gate'li iade attachment erişim yolu (public /media DEĞİL; sahip/store-admin stream).
  url: z.string(),
});

export const adminReturnItemSchema = z.object({
  id: z.string(),
  orderLineId: z.string(),
  title: z.string(),
  variantTitle: z.string(),
  sku: z.string(),
  imageUrl: z.string().nullable(),
  quantity: z.number().int().positive(),
  approvedQuantity: z.number().int().nonnegative().nullable(),
  rejectedQuantity: z.number().int().nonnegative().nullable(),
  reason: returnReasonSchema,
  customerComment: z.string().nullable(),
  conditionStatus: returnItemConditionStatusSchema.nullable(),
  inspectionResult: returnInspectionResultSchema.nullable(),
  restockDecision: returnRestockDecisionSchema.nullable(),
  restockedAt: z.string().datetime().nullable(),
  unitPriceMinor: z.number().int().nonnegative(),
  // Bu satırın toplam satın alınan adedi + (bu talep hariç) daha önce iade edilen tutulan adet.
  purchasedQuantity: z.number().int().positive(),
  priorReturnedQuantity: z.number().int().nonnegative(),
  attachments: z.array(adminReturnAttachmentSchema),
  // TODO-173 (ADR-274) — reddedilen adet disposition'ları + bu kalemden doğan reverse shipment'lar.
  // undispositionedRejectedQuantity = rejectedQuantity − Σ(aktif disposition quantity) (karar bekleyen).
  dispositions: z.array(adminReturnDispositionSchema).default([]),
  reverseShipments: z.array(reverseShipmentSchema).default([]),
  undispositionedRejectedQuantity: z.number().int().nonnegative().default(0),
});

export const adminReturnHistoryEntrySchema = z.object({
  fromStatus: returnStatusSchema.nullable(),
  toStatus: returnStatusSchema,
  actorType: z.enum(["CUSTOMER", "ADMIN", "SYSTEM"]),
  actorId: z.string().nullable(),
  note: z.string().nullable(),
  createdAt: z.string().datetime(),
});

// ADR-272 — ORTAK refund durum semantiği (ledger-otoriteli; store-admin + müşteri AYNI değeri kullanır).
export const refundSummaryStatusSchema = z.enum([
  "INTENT_PENDING",
  "PROCESSING",
  "SUCCEEDED",
  "PARTIALLY_SUCCEEDED",
  "FAILED",
  "CANCELLED",
]);
export type RefundSummaryStatusValue = z.infer<typeof refundSummaryStatusSchema>;

export const adminReturnRefundIntentSchema = z.object({
  currency: currencySchema,
  productRefundMinor: z.number().int().nonnegative(),
  shippingRefundMinor: z.number().int().nonnegative(),
  taxRefundMinor: z.number().int().nonnegative(),
  totalRefundMinor: z.number().int().nonnegative(),
  status: refundIntentStatusSchema,
});

/**
 * TODO-170 (ADR-272) — İade talebi refund ÖZETİ (ledger-otoriteli; return/order detail sağ rayı için).
 * `status` ortak semantiktir; tamamlanmış refund sonrası ASLA "beklemede" göstermez. Amount'lar: niyet
 * snapshot'ı (product/shipping/tax/total) + GERÇEKLEŞEN (realized) + sipariş düzeyi kalan refundable.
 */
export const adminReturnRefundSummarySchema = z.object({
  status: refundSummaryStatusSchema,
  currency: currencySchema,
  productRefundMinor: z.number().int().nonnegative(),
  shippingRefundMinor: z.number().int().nonnegative(),
  taxRefundMinor: z.number().int().nonnegative(),
  intentTotalMinor: z.number().int().nonnegative(),
  realizedRefundMinor: z.number().int().nonnegative(),
  refundableRemainingMinor: z.number().int().nonnegative(),
  completedAt: z.string().datetime().nullable(),
  // provider referansı ya da manuel dekont/reference (admin yüzeyi; müşteriye ham kod gitmez).
  reference: z.string().nullable(),
});
export type AdminReturnRefundSummary = z.infer<typeof adminReturnRefundSummarySchema>;

export const adminReturnDetailSchema = z.object({
  id: z.string(),
  returnNumber: z.string(),
  orderNumber: z.string(),
  status: returnStatusSchema,
  resolutionType: returnResolutionTypeSchema,
  currency: currencySchema,
  customerName: z.string().nullable(),
  customerEmail: z.string().nullable(),
  shippingAddress: customerOrderAddressSummarySchema.nullable(),
  customerNote: z.string().nullable(),
  adminNote: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  returnCarrier: z.string().nullable(),
  returnTrackingNumber: z.string().nullable(),
  refundShipping: z.boolean(),
  returnWindowEndsAt: z.string().datetime(),
  requestedAt: z.string().datetime(),
  version: z.number().int().nonnegative(),
  // Sipariş ödeme özeti (allowlist; refund uygunluğu için paymentStatus).
  orderPaymentStatus: customerOrderPaymentStatusSchema,
  items: z.array(adminReturnItemSchema),
  history: z.array(adminReturnHistoryEntrySchema),
  refundIntent: adminReturnRefundIntentSchema.nullable(),
  // TODO-170 (ADR-272) — ledger-otoriteli refund özeti (sağ ray semantik durumu + gerçekleşen tutar).
  refundSummary: adminReturnRefundSummarySchema.nullable().default(null),
});

export const adminReturnDetailResponseSchema = z.object({ return: adminReturnDetailSchema });

/* ── TODO-170 (ADR-272): Refund Ledger & Payment Reversal ───────────────────────
 * OrderRefund = gerçekleşen/denenen para hareketi. Ham provider hata KODU müşteriye ASLA sızmaz
 * (admin yüzeyinde kontrollü gösterilir). Maskelenmemiş ödeme verisi gösterilmez. */
export const orderRefundStatusSchema = z.enum(["PENDING", "PROCESSING", "SUCCEEDED", "FAILED", "CANCELLED"]);
export type OrderRefundStatusValue = z.infer<typeof orderRefundStatusSchema>;

/* ── TODO-174A — Store Admin BİRLEŞİK İadeler satırı: iade talebi + sipariş iptali geri ödemesi ──
 * ReturnRequest ve OrderRefund AYRI domain'ler; bu PROJEKSİYON birleşimidir (yeni tablo YOK; Refund
 * Ledger/OrderRefund source-of-truth kalır). Cancellation satırı için "return request" copy'si
 * KULLANILMAZ. Detay yönü `detailKind`/`detailId` ile: RETURN → iade detayı, ORDER → sipariş detayı. */
export const adminRefundVisibilityItemSchema = z.object({
  source: refundOriginSchema,
  detailKind: z.enum(["RETURN", "ORDER"]),
  detailId: z.string(),
  // Görünen referans: returnNumber (iade) | orderNumber (iptal geri ödemesi).
  reference: z.string(),
  orderNumber: z.string(),
  customerName: z.string().nullable(),
  customerEmail: z.string().nullable(),
  // Birleşik sıralama/gösterim ankoru (return.requestedAt | orderRefund.requestedAt).
  createdAt: z.string().datetime(),
  // Yalnız iade talebi (RETURN_REQUEST):
  itemCount: z.number().int().nonnegative().nullable(),
  totalQuantity: z.number().int().nonnegative().nullable(),
  resolutionType: returnResolutionTypeSchema.nullable(),
  returnStatus: returnStatusSchema.nullable(),
  returnWindowEndsAt: z.string().datetime().nullable(),
  ageDays: z.number().int().nonnegative().nullable(),
  // Refund alanları (iptal satırı DAİMA taşır; iade satırı refund oluştuysa taşır):
  refundStatus: orderRefundStatusSchema.nullable(),
  refundAmountMinor: z.number().int().nonnegative().nullable(),
  currency: currencySchema.nullable(),
  // Admin'e maskeli ödeme yöntemi ("Kart •••• 1234" / "Banka havalesi"); ham PAN/secret ASLA.
  refundMethodLabel: z.string().nullable(),
  refundCompletedAt: z.string().datetime().nullable(),
  // TODO-175 — müşterinin refund hedefi tercihi (REFUND çözümü/iptal external legi taşır; REPLACEMENT null).
  refundDestination: refundDestinationSchema.nullable(),
  // Yalnız sipariş iptali (ORDER_CANCELLATION) — insani etiket UI'da registry/i18n'den türetilir:
  cancellationReasonCode: orderCancellationReasonSchema.nullable(),
});
export type AdminRefundVisibilityItem = z.infer<typeof adminRefundVisibilityItemSchema>;

export const adminRefundVisibilityListResponseSchema = z.object({
  data: z.array(adminRefundVisibilityItemSchema),
  pagination: adminListPaginationSchema,
});
export type AdminRefundVisibilityListResponse = z.infer<
  typeof adminRefundVisibilityListResponseSchema
>;
// TODO-175 (ADR-285) — INTERNAL_CREDIT: SHOPPING_BALANCE external legi (provider yok, tx-içi SUCCEEDED).
export const refundExecutionModeSchema = z.enum(["PROVIDER_AUTOMATIC", "MANUAL_OFFLINE", "INTERNAL_CREDIT"]);
export type RefundExecutionModeValue = z.infer<typeof refundExecutionModeSchema>;
export const refundCapabilityReasonSchema = z.enum([
  "PROVIDER_AUTOMATIC",
  "PROVIDER_AUTOMATIC_UNSUPPORTED",
  "MANUAL_OFFLINE_PAYMENT",
]);
export const orderRefundEventTypeSchema = z.enum([
  "REQUESTED",
  "PROVIDER_SUBMITTED",
  "PROCESSING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
  "RETRY",
  "MANUAL_COMPLETED",
  "RECONCILED",
  "STATUS_QUERIED",
  "DUPLICATE_CALLBACK",
]);
const refundProviderEnum = z.enum(["MOCK", "IYZICO", "STRIPE", "PAYTR", "GENERIC_REDIRECT"]);
// TODO-174B (ADR-282) — STORE_CREDIT eklendi: iade edilen attempt'in yöntemi store credit olabilir
// (bu attempt provider'a iade EDİLMEZ, bakiyeye restore edilir; ancak method serileştirilir).
const refundMethodEnum = z.enum(["CARD", "BANK_TRANSFER", "CASH_ON_DELIVERY", "PAYMENT_LINK", "STORE_CREDIT"]);

export const adminRefundCapabilitySchema = z.object({
  mode: refundExecutionModeSchema,
  supportsRefund: z.boolean(),
  supportsPartialRefund: z.boolean(),
  provider: refundProviderEnum.nullable(),
  method: refundMethodEnum,
  manualMethod: paymentManualMethodSchema.nullable(),
  reason: refundCapabilityReasonSchema,
});
export type AdminRefundCapability = z.infer<typeof adminRefundCapabilitySchema>;

export const adminRefundEventSchema = z.object({
  type: orderRefundEventTypeSchema,
  actorType: z.enum(["ADMIN", "SYSTEM", "PROVIDER"]),
  amountMinor: z.number().int(),
  providerReference: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export const adminOrderRefundSchema = z.object({
  id: z.string(),
  status: orderRefundStatusSchema,
  executionMode: refundExecutionModeSchema,
  provider: refundProviderEnum.nullable(),
  method: refundMethodEnum,
  currency: currencySchema,
  productRefundMinor: z.number().int().nonnegative(),
  shippingRefundMinor: z.number().int().nonnegative(),
  taxRefundMinor: z.number().int().nonnegative(),
  totalRefundMinor: z.number().int().nonnegative(),
  providerRefundId: z.string().nullable(),
  providerReference: z.string().nullable(),
  // Admin'e kontrollü gösterilen teknik hata (müşteriye asla); ham secret içermez.
  failureCode: z.string().nullable(),
  failureMessage: z.string().nullable(),
  manualMethod: paymentManualMethodSchema.nullable(),
  manualReference: z.string().nullable(),
  manualNote: z.string().nullable(),
  requestedAt: z.string().datetime(),
  processingStartedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  failedAt: z.string().datetime().nullable(),
  cancelledAt: z.string().datetime().nullable(),
  version: z.number().int().nonnegative(),
  events: z.array(adminRefundEventSchema),
});
export type AdminOrderRefund = z.infer<typeof adminOrderRefundSchema>;

export const adminRefundContextSchema = z.object({
  currency: currencySchema,
  capturedMinor: z.number().int().nonnegative(),
  succeededRefundMinor: z.number().int().nonnegative(),
  activeRefundMinor: z.number().int().nonnegative(),
  // TD-FR-7 (ADR-272 ek) — PENDING ve PROCESSING AYRI figürler (activeRefundMinor = pendingMinor + processingMinor,
  // geriye uyumlu korunur). Yalnız SUCCEEDED netten düşer; PENDING/PROCESSING düşmez.
  pendingMinor: z.number().int().nonnegative(),
  processingMinor: z.number().int().nonnegative(),
  // TD-FR-7 — server-side TEK otorite net tahsilat (payment-state.computeNetCollectedMinor: captured − succeeded).
  netCollectedMinor: z.number().int().nonnegative(),
  refundableRemainingMinor: z.number().int().nonnegative(),
  // ORTAK ledger-otoriteli durum (bu iade talebi için); rail/panel AYNI otoriteyi kullanır.
  summaryStatus: refundSummaryStatusSchema,
  intent: adminReturnRefundIntentSchema.nullable(),
  capability: adminRefundCapabilitySchema.nullable(),
  // Bu iade için "Para iadesini başlat" mümkün mü (intent PENDING/CONSUMED + REFUND_PENDING + aktif refund yok + kalan yeterli).
  canInitiate: z.boolean(),
  refunds: z.array(adminOrderRefundSchema),
});
export type AdminRefundContext = z.infer<typeof adminRefundContextSchema>;

export const adminRefundContextResponseSchema = z.object({ context: adminRefundContextSchema });
export type AdminRefundContextResponse = z.infer<typeof adminRefundContextResponseSchema>;
export const adminRefundResponseSchema = z.object({
  refund: adminOrderRefundSchema,
  context: adminRefundContextSchema,
});
export type AdminRefundResponse = z.infer<typeof adminRefundResponseSchema>;

export const adminInitiateRefundRequestSchema = z.object({
  // Intent 1:1 ReturnRequest — server iade talebinden türetir; client yalnız optimistic version yollar.
  expectedReturnVersion: z.number().int().nonnegative(),
});
export type AdminInitiateRefundRequest = z.infer<typeof adminInitiateRefundRequestSchema>;
export const adminManualCompleteRefundRequestSchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
  manualReference: z.string().min(1).max(200),
  manualNote: z.string().min(1).max(1000),
});
export type AdminManualCompleteRefundRequest = z.infer<typeof adminManualCompleteRefundRequestSchema>;
export const adminRefundVersionActionRequestSchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
});
export type AdminRefundVersionActionRequest = z.infer<typeof adminRefundVersionActionRequestSchema>;
export const adminCancelRefundRequestSchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
  reason: z.string().max(300).optional(),
});
export type AdminCancelRefundRequest = z.infer<typeof adminCancelRefundRequestSchema>;

/* ── Store Admin: aksiyon istekleri (hepsi state-machine + yetkiden geçer) ─────── */
export const adminReturnApproveItemSchema = z.object({
  returnItemId: z.string().min(1),
  approvedQuantity: z.number().int().nonnegative(),
});
// R3 (ADR-269 hardening) — optimistic concurrency. Her state-changing admin mutation, detayda
// gördüğü kaydın `version`'ini geri gönderir; gateway tx içinde eşleşmezse 409 VERSION_CONFLICT
// döner (bayat approve intent OLUŞTURMAZ, bayat inspect restock ÜRETMEZ). Zorunlu.
export const returnExpectedVersionSchema = z.number().int().nonnegative();
// Tam onay: items verilmezse tüm kalemler istenen adetle onaylanır. Kısmi: per-item approvedQuantity.
export const adminReturnApproveRequestSchema = z.object({
  items: z.array(adminReturnApproveItemSchema).optional(),
  adminNote: z.string().max(RETURN_COMMENT_MAX).optional(),
  expectedVersion: returnExpectedVersionSchema,
});
export const adminReturnRejectRequestSchema = z.object({
  rejectionReason: z.string().min(1).max(RETURN_COMMENT_MAX),
  adminNote: z.string().max(RETURN_COMMENT_MAX).optional(),
  expectedVersion: returnExpectedVersionSchema,
});
export const adminReturnInspectItemSchema = z.object({
  returnItemId: z.string().min(1),
  conditionStatus: returnItemConditionStatusSchema,
  inspectionResult: returnInspectionResultSchema,
  restockDecision: returnRestockDecisionSchema,
});
export const adminReturnInspectRequestSchema = z.object({
  items: z.array(adminReturnInspectItemSchema).min(1),
  adminNote: z.string().max(RETURN_COMMENT_MAX).optional(),
  expectedVersion: returnExpectedVersionSchema,
});
// Basit durum ilerletmeleri (incelemeye al / teslim alındı / refund|replacement pending / kapat).
export const adminReturnTransitionRequestSchema = z.object({
  targetStatus: returnStatusSchema,
  adminNote: z.string().max(RETURN_COMMENT_MAX).optional(),
  refundShipping: z.boolean().optional(),
  expectedVersion: returnExpectedVersionSchema,
});

// TODO-172 (ADR-273) — Fast Refund Controls. Teslim alma + inceleme adımları atlanarak doğrudan
// para iadesi başlatan tek admin aksiyonu. reason ZORUNLU (audit + history). expectedVersion ile
// optimistic lock (çift tıklama/stale). Tutar/limit client'tan GELMEZ; sunucu StoreSettings +
// RefundIntent otoritesinden hesaplar (gönderilse bile yok sayılır — bilinçli olarak şemada YOK).
export const adminReturnFastRefundRequestSchema = z.object({
  reason: z.string().trim().min(3).max(RETURN_COMMENT_MAX),
  expectedVersion: returnExpectedVersionSchema,
});

// Fast-refund onay modalı için bounded risk/uygunluk özeti (salt-okunur; mevcut veriden türetilir,
// fraud scoring YOK). permitted: viewer SUPER_ADMIN mı. eligible: permitted && enabled && limit-içi &&
// kaynak-durum && refund-çözümü && intent PENDING. reasonCode: eligible değilse ilk engel kodu.
export const adminReturnFastRefundContextSchema = z.object({
  permitted: z.boolean(),
  enabled: z.boolean(),
  eligible: z.boolean(),
  reasonCode: z.string().nullable(),
  sourceStatus: returnStatusSchema.nullable(),
  skippedSteps: z.array(z.string()),
  currency: z.string(),
  // TODO-172 (ADR-273) — minor-unit finansal tutarlar KANONİK ONDALIK STRING (Number/float YOK).
  refundAmountMinor: canonicalMinorAmountString,
  limitMinor: canonicalMinorAmountString.nullable(),
  withinLimit: z.boolean(),
  orderTotalMinor: canonicalMinorAmountString,
  customerOrderCount: z.number().int().nonnegative(),
  customerReturnCount: z.number().int().nonnegative(),
  fastRefundsLast90Days: z.number().int().nonnegative(),
  deliveryReceived: z.boolean(),
  inspectionDone: z.boolean(),
});
export const adminReturnFastRefundContextResponseSchema = z.object({
  context: adminReturnFastRefundContextSchema,
});

/* ── TODO-173 (ADR-274): Reverse Shipment + reddedilen-adet disposition (request/response) ──
 * Direction üç yönlü; bu PR'da yalnız STORE_RETURN_TO_CUSTOMER gerçek akış (K2). Reddedilen adet
 * disposition'ı ReturnRestockDecision'dan AYRI domain'dir (K1). Tüm mutation'lar expectedVersion +
 * store-admin (K3); reverse shipment OrderRefund/RefundIntent/envanter ÜRETMEZ. Enum/record şemaları
 * yukarıda (admin return detail'den önce) tanımlıdır. */
// Disposition oluşturma (reddedilen adet üzerinde; Σ ≤ rejectedQuantity backend-enforce).
export const adminReturnDispositionCreateRequestSchema = z.object({
  returnItemId: z.string().min(1),
  type: returnRejectedDispositionSchema,
  quantity: z.number().int().positive(),
  reason: z.string().trim().max(RETURN_COMMENT_MAX).optional(),
  expectedVersion: returnExpectedVersionSchema,
});
export type AdminReturnDispositionCreateRequest = z.infer<
  typeof adminReturnDispositionCreateRequestSchema
>;

// Disposition iptali (PENDING → CANCELLED; quantity serbest). COMPLETED iptal EDİLEMEZ (immutable).
export const adminReturnDispositionCancelRequestSchema = z.object({
  dispositionId: z.string().min(1),
  reason: z.string().trim().max(RETURN_COMMENT_MAX).optional(),
  expectedVersion: returnExpectedVersionSchema,
});
export type AdminReturnDispositionCancelRequest = z.infer<
  typeof adminReturnDispositionCancelRequestSchema
>;

// Reverse shipment oluşturma. reason ZORUNLU (audit). quantity cap + duplicate backend-enforce.
export const adminReverseShipmentCreateRequestSchema = z.object({
  returnItemId: z.string().min(1),
  quantity: z.number().int().positive(),
  carrierName: z.string().trim().max(120).optional(),
  trackingNumber: z.string().trim().max(120).optional(),
  trackingUrl: z.string().trim().url().max(500).optional(),
  estimatedDeliveryAt: z.string().datetime().optional(),
  reason: z.string().trim().min(3).max(RETURN_COMMENT_MAX),
  expectedVersion: returnExpectedVersionSchema,
});
export type AdminReverseShipmentCreateRequest = z.infer<
  typeof adminReverseShipmentCreateRequestSchema
>;

// Reverse shipment durum aksiyonu (kargoya verildi/teslim/iptal). Monotonic + terminal guard backend'de.
export const adminReverseShipmentStatusRequestSchema = z.object({
  status: reverseShipmentStatusTargetSchema,
  note: z.string().trim().max(RETURN_COMMENT_MAX).optional(),
});
export type AdminReverseShipmentStatusRequest = z.infer<
  typeof adminReverseShipmentStatusRequestSchema
>;

// Reverse shipment carrier/tracking güncelleme (terminal olmayan gönderide).
export const adminReverseShipmentTrackingRequestSchema = z.object({
  carrierName: z.string().trim().max(120).nullable().optional(),
  trackingNumber: z.string().trim().max(120).nullable().optional(),
  trackingUrl: z.string().trim().url().max(500).nullable().optional(),
  estimatedDeliveryAt: z.string().datetime().nullable().optional(),
});
export type AdminReverseShipmentTrackingRequest = z.infer<
  typeof adminReverseShipmentTrackingRequestSchema
>;

export const adminReverseShipmentResponseSchema = z.object({ shipment: reverseShipmentSchema });
export type AdminReverseShipmentResponse = z.infer<typeof adminReverseShipmentResponseSchema>;

export type ReturnStatusValue = z.infer<typeof returnStatusSchema>;
export type ReturnResolutionTypeValue = z.infer<typeof returnResolutionTypeSchema>;
export type ReturnReasonValue = z.infer<typeof returnReasonSchema>;
export type ReturnLineEligibilityStatus = z.infer<typeof returnLineEligibilityStatusSchema>;
export type CustomerReturnEligibilityLine = z.infer<typeof customerReturnEligibilityLineSchema>;
export type CustomerReturnEligibility = z.infer<typeof customerReturnEligibilitySchema>;
export type CustomerReturnEligibilityResponse = z.infer<typeof customerReturnEligibilityResponseSchema>;
export type CustomerReturnCreateItem = z.infer<typeof customerReturnCreateItemSchema>;
export type CustomerReturnCreateRequest = z.infer<typeof customerReturnCreateRequestSchema>;
export type CustomerReturnItem = z.infer<typeof customerReturnItemSchema>;
export type CustomerReturnHistoryEntry = z.infer<typeof customerReturnHistoryEntrySchema>;
export type CustomerReturnSummary = z.infer<typeof customerReturnSummarySchema>;
export type CustomerReturnDetail = z.infer<typeof customerReturnDetailSchema>;
export type CustomerReturnListResponse = z.infer<typeof customerReturnListResponseSchema>;
export type CustomerReturnDetailResponse = z.infer<typeof customerReturnDetailResponseSchema>;
export type CustomerReturnCreateResponse = z.infer<typeof customerReturnCreateResponseSchema>;
export type CustomerReturnTrackingRequest = z.infer<typeof customerReturnTrackingRequestSchema>;
export type AdminReturnListItem = z.infer<typeof adminReturnListItemSchema>;
export type AdminReturnListQuery = z.infer<typeof adminReturnListQuerySchema>;
export type AdminReturnListResponse = z.infer<typeof adminReturnListResponseSchema>;
export type AdminReturnAttachment = z.infer<typeof adminReturnAttachmentSchema>;
export type AdminReturnItem = z.infer<typeof adminReturnItemSchema>;
export type AdminReturnHistoryEntry = z.infer<typeof adminReturnHistoryEntrySchema>;
export type AdminReturnRefundIntent = z.infer<typeof adminReturnRefundIntentSchema>;
export type AdminReturnDetail = z.infer<typeof adminReturnDetailSchema>;
export type AdminReturnDetailResponse = z.infer<typeof adminReturnDetailResponseSchema>;
export type AdminReturnApproveRequest = z.infer<typeof adminReturnApproveRequestSchema>;
export type AdminReturnRejectRequest = z.infer<typeof adminReturnRejectRequestSchema>;
export type AdminReturnInspectRequest = z.infer<typeof adminReturnInspectRequestSchema>;
export type AdminReturnTransitionRequest = z.infer<typeof adminReturnTransitionRequestSchema>;
export type AdminReturnFastRefundRequest = z.infer<typeof adminReturnFastRefundRequestSchema>;
export type AdminReturnFastRefundContext = z.infer<typeof adminReturnFastRefundContextSchema>;
export type AdminReturnFastRefundContextResponse = z.infer<
  typeof adminReturnFastRefundContextResponseSchema
>;
