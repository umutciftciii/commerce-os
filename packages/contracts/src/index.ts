import { z } from "zod";
// Sema dogrulamalarinda kullanilan saf yardimcilarin yerel referanslari.
import {
  isValidTckn,
  isValidTaxNumber,
  isValidTrPhone,
  isValidIban,
} from "./validators.js";

const jsonRecordSchema = z.record(z.unknown());
const slugSchema = z.string().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const skuSchema = z.string().min(1).max(80).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);
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

export const platformUserSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  name: z.string().nullable(),
  role: z.enum(["SUPER_ADMIN", "SUPPORT_ADMIN"]),
});

export const platformLoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const platformLoginResponseSchema = z.object({
  token: z.string().min(1),
  expiresAt: z.string().datetime(),
  user: platformUserSchema,
});

export const platformMeResponseSchema = z.object({
  user: platformUserSchema,
  session: z.object({
    id: z.string().min(1),
    expiresAt: z.string().datetime(),
  }),
});

export const platformLogoutResponseSchema = z.object({
  revoked: z.boolean(),
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
export const paymentStatusSchema = z.enum(["UNPAID", "AUTHORIZED", "PAID", "REFUNDED"]);
export const fulfillmentStatusSchema = z.enum(["UNFULFILLED", "PARTIAL", "FULFILLED", "CANCELLED"]);
export const inventoryReservationStatusSchema = z.enum(["ACTIVE", "RELEASED", "CONSUMED"]);

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
  pagination: z.object({
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
});

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

export const productSchema = z.object({
  id: z.string().min(1),
  storeId: z.string().min(1),
  title: z.string().min(1),
  slug: slugSchema,
  description: z.string().nullable(),
  status: productStatusSchema,
  type: productTypeSchema,
  vendor: z.string().nullable(),
  brand: z.string().nullable(),
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
  // F3C.2 — Kargo olcumu (desi/kg). DESI_TABLE/WEIGHT_TABLE/PER_KG_OR_DESI tarifelerinde
  // kullanilir; varyant degeri urun-seviyesini override eder (bkz. productVariantSchema).
  shippingWeightKg: z.number().nullable(),
  shippingDesi: z.number().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const productListResponseSchema = z.object({
  data: z.array(productSchema),
  pagination: z.object({
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
});

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
    description: optionalNullableStringSchema,
    status: productStatusSchema.default("DRAFT"),
    type: productTypeSchema.default("PHYSICAL"),
    vendor: z.string().max(120).nullable().optional(),
    brand: z.string().max(120).nullable().optional(),
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
    // F3C.2 — Kargo olcumu. 0/negatif anlamsiz: >0 olmali; bos birakilabilir (null).
    shippingWeightKg: z.number().positive().nullable().optional(),
    shippingDesi: z.number().positive().nullable().optional(),
  })
  .refine((value) => value.maxOrderQuantity == null || value.maxOrderQuantity >= value.minOrderQuantity, {
    message: "maxOrderQuantity must be greater than or equal to minOrderQuantity.",
    path: ["maxOrderQuantity"],
  })
  .refine(isConsistentSalesModel, {
    message: "Product sales model fields are inconsistent.",
    path: ["salesMode"],
  });

export const productUpdateRequestSchema = z
  .object({
    title: z.string().min(1).max(220).optional(),
    slug: slugSchema.optional(),
    description: optionalNullableStringSchema,
    status: productStatusSchema.optional(),
    type: productTypeSchema.optional(),
    vendor: z.string().max(120).nullable().optional(),
    brand: z.string().max(120).nullable().optional(),
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
    // F3C.2 — Kargo olcumu. >0 olmali; null = temizle.
    shippingWeightKg: z.number().positive().nullable().optional(),
    shippingDesi: z.number().positive().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  })
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

export const productVariantSchema = z.object({
  id: z.string().min(1),
  productId: z.string().min(1),
  storeId: z.string().min(1),
  title: z.string().min(1),
  sku: skuSchema,
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

export const publicProductSchema = z.object({
  id: z.string().min(1),
  slug: slugSchema,
  title: z.string().min(1),
  brand: z.string().nullable(),
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

export const publicProductDetailSchema = publicProductSchema.extend({
  description: z.string().nullable(),
  callToActionLabel: z.string().nullable(),
  whatsappMessageTemplate: z.string().nullable(),
  inquiryFormTitle: z.string().nullable(),
  appointmentNote: z.string().nullable(),
  related: z.array(publicProductSchema),
});

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
    sku: skuSchema,
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
    lowStockThreshold: z.number().int().nonnegative().nullable().optional(),
    // F3C.2 — Kargo olcumu (varyant override). >0 olmali; bos = null.
    shippingWeightKg: z.number().positive().nullable().optional(),
    shippingDesi: z.number().positive().nullable().optional(),
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
    lowStockThreshold: z.number().int().nonnegative().nullable().optional(),
    // F3C.2 — Kargo olcumu (varyant override). >0 olmali; null = temizle.
    shippingWeightKg: z.number().positive().nullable().optional(),
    shippingDesi: z.number().positive().nullable().optional(),
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
export const orderPaymentAttemptSchema = z.object({
  id: z.string().min(1),
  provider: z.enum(["MOCK", "IYZICO", "STRIPE", "PAYTR", "GENERIC_REDIRECT"]),
  mode: z.enum(["TEST", "LIVE"]),
  method: z.enum(["CARD", "BANK_TRANSFER", "CASH_ON_DELIVERY", "PAYMENT_LINK"]),
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
  billing: orderBillingSchema.nullable().default(null),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lines: z.array(orderLineSchema).default([]),
  addresses: z.array(orderAddressSchema).default([]),
  reservations: z.array(inventoryReservationSchema).default([]),
  events: z.array(orderEventSchema).default([]),
  paymentAttempts: z.array(orderPaymentAttemptSchema).default([]),
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
  pagination: z.object({
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
});

// TODO-073 — Store-admin sipariş listesi operasyonel filtreleri. Tüm filtreler
// opsiyonel; verilmeyen filtre kısıt getirmez. Tarihler yalnız gün (YYYY-MM-DD);
// gateway gün başı/sonu (UTC) sınırına genişletir. `search` sipariş no, müşteri
// e-postası ve müşteri adı/soyadı içinde (case-insensitive) arar. Filtreler DB
// tarafında uygulanır; store-scope route düzeyinde zorlanır (burada taşınmaz).
const orderListDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format.");

export const orderListQuerySchema = z.object({
  // Pagination opsiyonel; verilmezse gateway varsayılanı uygular (limit=50, offset=0).
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
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

export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
export type TenantContextContract = z.infer<typeof tenantContextSchema>;
export type PlatformEventContract = z.infer<typeof platformEventSchema>;
export type PlatformUserContract = z.infer<typeof platformUserSchema>;
export type PlatformLoginRequest = z.infer<typeof platformLoginRequestSchema>;
export type PlatformLoginResponse = z.infer<typeof platformLoginResponseSchema>;
export type PlatformMeResponse = z.infer<typeof platformMeResponseSchema>;
export type PlatformLogoutResponse = z.infer<typeof platformLogoutResponseSchema>;
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
export type PublicProduct = z.infer<typeof publicProductSchema>;
export type PublicProductListResponse = z.infer<typeof publicProductListResponseSchema>;
export type PublicProductDetail = z.infer<typeof publicProductDetailSchema>;
export type PublicCampaignSlidesResponse = z.infer<typeof publicCampaignSlidesResponseSchema>;
export type PublicCartItemInput = z.infer<typeof publicCartItemInputSchema>;
export type PublicCartRequest = z.infer<typeof publicCartRequestSchema>;
export type PublicCartLineStatus = z.infer<typeof publicCartLineStatusSchema>;
export type PublicCartLine = z.infer<typeof publicCartLineSchema>;
export type PublicCouponStatus = z.infer<typeof publicCouponStatusSchema>;
export type PublicCartSummary = z.infer<typeof publicCartSummarySchema>;
export type PublicCart = z.infer<typeof publicCartSchema>;
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
});

/* ── Giris / oturum ───────────────────────────────────────────────────────── */

export const customerLoginRequestSchema = z.object({
  identifier: customerIdentifierSchema,
  password: z.string().min(1).max(200),
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
  status: z.enum(["ACTIVE", "PASSIVE", "BLOCKED", "ARCHIVED"]),
});

export const customerSessionResponseSchema = z.object({
  token: z.string().min(1),
  expiresAt: z.string().datetime(),
  customer: customerAccountSchema,
});

export const customerMeResponseSchema = z.object({
  customer: customerAccountSchema,
  session: z.object({ expiresAt: z.string().datetime() }),
});

export const customerLogoutResponseSchema = z.object({ revoked: z.boolean() });

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
  provider: z.enum(["MOCK", "IYZICO", "STRIPE", "PAYTR", "GENERIC_REDIRECT"]),
  method: z.enum(["CARD", "BANK_TRANSFER", "CASH_ON_DELIVERY", "PAYMENT_LINK"]),
  cardBrand: z.string().nullable(),
  cardLast4: z.string().nullable(),
  installmentCount: z.number().int().positive(),
  transactionId: z.string().nullable(),
  threeDsApplied: z.boolean(),
  paidAt: z.string().datetime().nullable(),
});

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
  // TODO-117 — Kargo takip özeti; shipment yoksa null.
  shipment: customerOrderShipmentSchema.nullable(),
  // TODO-125 — Sipariş anında seçilen kargo sağlayıcı/seçenek özeti; yoksa null.
  shippingSelection: orderShippingSelectionSchema.nullable(),
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
export const storeAdminCustomerStatusSchema = z.enum(["ACTIVE", "PASSIVE", "BLOCKED", "ARCHIVED"]);

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
  pagination: z.object({
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
});

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
// Sayfalama kontrati simdiden {limit,offset,total} ile stabil kurulur; Dilim 1'de
// backend sabit limit (son N) uygular, gercek sayfalama/arama Faz 4'e ertelenir.
export const mediaContextSchema = z.enum(["PRODUCT", "CATEGORY", "HERO", "BRANDING"]);

export const mediaListResponseSchema = z.object({
  data: z.array(mediaAssetSchema),
  pagination: z.object({
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
});

export type MediaContext = z.infer<typeof mediaContextSchema>;
export type MediaAssetResponse = z.infer<typeof mediaAssetSchema>;
export type MediaUploadResponse = z.infer<typeof mediaUploadResponseSchema>;
export type MediaListResponse = z.infer<typeof mediaListResponseSchema>;
