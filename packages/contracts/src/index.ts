import { z } from "zod";

const jsonRecordSchema = z.record(z.unknown());
const slugSchema = z.string().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const skuSchema = z.string().min(1).max(80).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);
const currencySchema = z.string().length(3).regex(/^[A-Z]{3}$/);
const optionalNullableStringSchema = z.string().max(500).nullable().optional();

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
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lines: z.array(orderLineSchema).default([]),
  addresses: z.array(orderAddressSchema).default([]),
  reservations: z.array(inventoryReservationSchema).default([]),
  events: z.array(orderEventSchema).default([]),
});

export const orderListResponseSchema = z.object({
  data: z.array(orderSchema),
  pagination: z.object({
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
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
export type Order = z.infer<typeof orderSchema>;
export type OrderListResponse = z.infer<typeof orderListResponseSchema>;
export type OrderCreateRequest = z.infer<typeof orderCreateRequestSchema>;
export type OrderUpdateRequest = z.infer<typeof orderUpdateRequestSchema>;
export type OrderCancelRequest = z.infer<typeof orderCancelRequestSchema>;
