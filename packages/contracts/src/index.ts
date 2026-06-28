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

export const productCategorySchema = z.object({
  id: z.string().min(1),
  storeId: z.string().min(1),
  name: z.string().min(1),
  slug: slugSchema,
  parentId: z.string().min(1).nullable(),
  sortOrder: z.number().int(),
  status: productCategoryStatusSchema,
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
});

export const productCategoryUpdateRequestSchema = z
  .object({
    name: z.string().min(1).max(160).optional(),
    slug: slugSchema.optional(),
    parentId: z.string().min(1).nullable().optional(),
    sortOrder: z.number().int().optional(),
    status: productCategoryStatusSchema.optional(),
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
  currency: currencySchema,
  status: productVariantStatusSchema,
  optionValues: jsonRecordSchema.nullable(),
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
  currency: currencySchema,
  /** Satilabilir stok adedi; bilinmiyorsa null. */
  available: z.number().int().nullable(),
  inStock: z.boolean(),
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
 * Sunucu-otoriter sepet OZETI (F3B.1 UX). Tutarlar gateway'de DEMO kurallariyla
 * hesaplanir (gercek shipping/tax/coupon motoru YOK; bkz. ADR-031):
 *   - KDV fiyatlara DAHILDIR; toplam uzerine EKLENMEZ. taxIncludedMinor yalnizca
 *     grandTotal icindeki KDV gostergesidir (taxRatePercent ile).
 *   - Kargo: itemsSubtotal >= freeShippingThresholdMinor ise 0, altinda sabit
 *     demo ucret.
 *   - Kupon: yalnizca DEMO kodu (or. DEMO10) indirim uygular; digerleri INVALID.
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
});

export const publicCartRequestSchema = z.object({
  items: z.array(publicCartItemInputSchema).max(100).default([]),
  /** Opsiyonel kupon kodu; sunucu dogrular (gecersizse INVALID doner). */
  couponCode: z.string().max(40).nullable().optional(),
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
    priceMinor: z.number().int().nonnegative(),
    compareAtMinor: z.number().int().nonnegative().nullable().optional(),
    currency: currencySchema.default("TRY"),
    status: productVariantStatusSchema.default("ACTIVE"),
    optionValues: jsonRecordSchema.nullable().optional(),
    lowStockThreshold: z.number().int().nonnegative().nullable().optional(),
  })
  .refine((value) => value.compareAtMinor == null || value.compareAtMinor >= value.priceMinor, {
    message: "compareAtMinor must be greater than or equal to priceMinor.",
    path: ["compareAtMinor"],
  });

export const productVariantUpdateRequestSchema = z
  .object({
    title: z.string().min(1).max(220).optional(),
    sku: skuSchema.optional(),
    barcode: z.string().max(80).nullable().optional(),
    priceMinor: z.number().int().nonnegative().optional(),
    compareAtMinor: z.number().int().nonnegative().nullable().optional(),
    currency: currencySchema.optional(),
    status: productVariantStatusSchema.optional(),
    optionValues: jsonRecordSchema.nullable().optional(),
    lowStockThreshold: z.number().int().nonnegative().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  })
  .refine(
    (value) =>
      value.compareAtMinor == null ||
      value.priceMinor === undefined ||
      value.compareAtMinor >= value.priceMinor,
    {
      message: "compareAtMinor must be greater than or equal to priceMinor.",
      path: ["compareAtMinor"],
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
export type PublicProductVariant = z.infer<typeof publicProductVariantSchema>;
export type PublicProduct = z.infer<typeof publicProductSchema>;
export type PublicProductListResponse = z.infer<typeof publicProductListResponseSchema>;
export type PublicProductDetail = z.infer<typeof publicProductDetailSchema>;
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
});

export const customerOrderDetailResponseSchema = z.object({
  order: customerOrderDetailSchema,
});

export type CustomerOrderDetailLine = z.infer<typeof customerOrderDetailLineSchema>;
export type CustomerOrderAddressSummary = z.infer<typeof customerOrderAddressSummarySchema>;
export type CustomerOrderBillingSummary = z.infer<typeof customerOrderBillingSummarySchema>;
export type CustomerOrderPaymentSummary = z.infer<typeof customerOrderPaymentSummarySchema>;
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
export const shippingProviderTypeSchema = z.enum(["MOCK", "GELIVER", "DHL_ECOMMERCE"]);
export const shippingProviderModeSchema = z.enum(["TEST", "LIVE"]);
export const shippingProviderStatusSchema = z.enum(["ENABLED", "DISABLED"]);
export const shippingCredentialTypeSchema = z.enum([
  "DEFAULT",
  "IDENTITY",
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

export const shippingProviderConfigSchema = z.object({
  id: z.string().min(1),
  provider: shippingProviderTypeSchema,
  mode: shippingProviderModeSchema,
  status: shippingProviderStatusSchema,
  displayName: z.string().min(1),
  allowOrderCreate: z.boolean(),
  allowBarcodeCreate: z.boolean(),
  allowLabelPurchase: z.boolean(),
  lastTestedAt: z.string().datetime().nullable(),
  lastTestStatus: z.string().nullable(),
  lastErrorCode: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  credentials: z.array(shippingCredentialSchema),
});

export const shippingProviderConfigListResponseSchema = z.object({
  data: z.array(shippingProviderConfigSchema),
});

export const shippingProviderConfigCreateRequestSchema = z.object({
  provider: shippingProviderTypeSchema,
  displayName: z.string().min(1).max(120),
  mode: shippingProviderModeSchema.default("TEST"),
  status: shippingProviderStatusSchema.default("DISABLED"),
  allowOrderCreate: z.boolean().default(false),
  allowBarcodeCreate: z.boolean().default(false),
  allowLabelPurchase: z.boolean().default(false),
});

export const shippingProviderConfigUpdateRequestSchema = z
  .object({
    displayName: z.string().min(1).max(120).optional(),
    mode: shippingProviderModeSchema.optional(),
    status: shippingProviderStatusSchema.optional(),
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

export const shippingProviderTestResponseSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
  testedAt: z.string().datetime(),
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

export const shipmentSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  provider: shippingProviderTypeSchema,
  referenceId: z.string(),
  status: z.enum([
    "DRAFT",
    "ORDER_CREATED",
    "LABEL_CREATED",
    "IN_TRANSIT",
    "DELIVERED",
    "RETURNED",
    "CANCELLED",
    "FAILED",
  ]),
  externalOrderId: z.string().nullable(),
  externalShipmentId: z.string().nullable(),
  externalInvoiceId: z.string().nullable(),
  trackingNumber: z.string().nullable(),
  trackingUrl: z.string().nullable(),
  labelUrl: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const orderShippingResponseSchema = z.object({
  shipments: z.array(shipmentSchema),
});

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
