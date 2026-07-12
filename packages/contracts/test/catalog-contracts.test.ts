import { describe, expect, it } from "vitest";
import {
  inventoryAdjustRequestSchema,
  orderCreateRequestSchema,
  orderSchema,
  productCategoryCreateRequestSchema,
  productCategorySchema,
  productCategoryUpdateRequestSchema,
  productCreateRequestSchema,
  productSchema,
  productUpdateRequestSchema,
  productVariantCreateRequestSchema,
  productVariantUpdateRequestSchema,
} from "../src/index.js";

describe("catalog contracts", () => {
  it("parses product create input with category ids", () => {
    const parsed = productCreateRequestSchema.parse({
      title: "Demo Hoodie",
      slug: "demo-hoodie",
      status: "ACTIVE",
      categoryIds: ["cat_1"],
    });
    expect(parsed).toMatchObject({
      type: "PHYSICAL",
      categoryIds: ["cat_1"],
      salesMode: "ONLINE",
      priceVisibility: "VISIBLE",
      primaryAction: "ADD_TO_CART",
      purchasable: true,
      minOrderQuantity: 1,
    });
  });

  it("parses product sales model fields and rejects inconsistent CTA behavior", () => {
    const parsed = productCreateRequestSchema.parse({
      title: "Appointment Dress",
      slug: "appointment-dress",
      salesMode: "APPOINTMENT",
      priceVisibility: "ON_REQUEST",
      primaryAction: "BOOK_APPOINTMENT",
      appointmentRequired: true,
      purchasable: false,
      minOrderQuantity: 1,
      maxOrderQuantity: 1,
      appointmentNote: "Randevu ile gosterilir.",
    });
    expect(parsed).toMatchObject({
      salesMode: "APPOINTMENT",
      priceVisibility: "ON_REQUEST",
      primaryAction: "BOOK_APPOINTMENT",
      purchasable: false,
    });
    expect(
      productCreateRequestSchema.parse({
        title: "Paused Online Product",
        slug: "paused-online-product",
        salesMode: "ONLINE",
        priceVisibility: "VISIBLE",
        primaryAction: "ADD_TO_CART",
        purchasable: false,
      }),
    ).toMatchObject({ salesMode: "ONLINE", purchasable: false });
    expect(() =>
      productCreateRequestSchema.parse({
        title: "Bad WhatsApp",
        slug: "bad-whatsapp",
        salesMode: "WHATSAPP",
        primaryAction: "ADD_TO_CART",
        whatsappEnabled: false,
        purchasable: false,
      }),
    ).toThrow();
    expect(() =>
      productUpdateRequestSchema.parse({
        salesMode: "ONLINE",
        priceVisibility: "ON_REQUEST",
        primaryAction: "ADD_TO_CART",
        purchasable: true,
      }),
    ).toThrow();
  });

  it("parses product responses with sales model fields", () => {
    const now = new Date().toISOString();
    const parsed = productSchema.parse({
      id: "product_1",
      storeId: "store_1",
      title: "Demo Hoodie",
      slug: "demo-hoodie",
      description: null,
      status: "ACTIVE",
      type: "PHYSICAL",
      vendor: null,
      brand: null,
      seoTitle: null,
      seoDescription: null,
      salesMode: "ONLINE",
      priceVisibility: "VISIBLE",
      primaryAction: "ADD_TO_CART",
      inquiryEnabled: false,
      appointmentRequired: false,
      whatsappEnabled: false,
      purchasable: true,
      minOrderQuantity: 1,
      maxOrderQuantity: null,
      callToActionLabel: null,
      whatsappMessageTemplate: null,
      inquiryFormTitle: null,
      appointmentNote: null,
      categoryIds: [],
      shippingWeightKg: null,
      shippingDesi: null,
      createdAt: now,
      updatedAt: now,
    });
    expect(parsed.salesMode).toBe("ONLINE");
  });

  it("F3C.2: accepts product shipping dimensions, rejects non-positive", () => {
    const parsed = productCreateRequestSchema.parse({
      title: "Dim Product",
      slug: "dim-product",
      shippingWeightKg: 0.6,
      shippingDesi: 5,
    });
    expect(parsed.shippingWeightKg).toBe(0.6);
    expect(parsed.shippingDesi).toBe(5);
    // Bos birakilabilir (alanlar olmadan da gecerli).
    expect(productCreateRequestSchema.parse({ title: "No Dim", slug: "no-dim" }).shippingDesi).toBeUndefined();
    // null = temizle (update) gecerli.
    expect(productUpdateRequestSchema.parse({ shippingDesi: null }).shippingDesi).toBeNull();
    // 0 ve negatif reddedilir.
    expect(() => productCreateRequestSchema.parse({ title: "Z", slug: "z", shippingDesi: 0 })).toThrow();
    expect(() => productCreateRequestSchema.parse({ title: "N", slug: "n", shippingWeightKg: -1 })).toThrow();
  });

  it("F3C.2: accepts variant shipping dimensions, rejects non-positive", () => {
    const parsed = productVariantCreateRequestSchema.parse({
      title: "Dim Variant",
      sku: "DIM-1",
      priceMinor: 1000,
      shippingWeightKg: 0.4,
      shippingDesi: 3,
    });
    expect(parsed.shippingWeightKg).toBe(0.4);
    expect(parsed.shippingDesi).toBe(3);
    expect(productVariantUpdateRequestSchema.parse({ shippingDesi: null }).shippingDesi).toBeNull();
    expect(() =>
      productVariantCreateRequestSchema.parse({ title: "Z", sku: "Z-1", priceMinor: 1000, shippingDesi: 0 }),
    ).toThrow();
  });

  it("requires minor-unit integer prices", () => {
    expect(() =>
      productVariantCreateRequestSchema.parse({
        title: "Default",
        sku: "SKU-1",
        priceMinor: 1299.5,
      }),
    ).toThrow();
  });

  // F4B — Satis > liste ARTIK gecerli (karar: yalnizca storefront'ta rozet turemez).
  it("allows list price (compareAtMinor) below sale price (only a warning in UI, not an error)", () => {
    const parsed = productVariantCreateRequestSchema.parse({
      title: "Default",
      sku: "SKU-1",
      priceMinor: 129900,
      compareAtMinor: 99900,
    });
    expect(parsed.compareAtMinor).toBe(99900);
  });

  // F4B — Maliyet <= liste tavani (compareAtMinor ?? priceMinor) hard kurali.
  it("rejects cost above the list ceiling and accepts cost at/below it", () => {
    expect(() =>
      productVariantCreateRequestSchema.parse({
        title: "Cost",
        sku: "SKU-COST",
        priceMinor: 100000,
        compareAtMinor: 120000,
        costMinor: 130000,
      }),
    ).toThrow();
    const parsed = productVariantCreateRequestSchema.parse({
      title: "Cost",
      sku: "SKU-COST",
      priceMinor: 100000,
      compareAtMinor: 120000,
      costMinor: 80000,
    });
    expect(parsed.costMinor).toBe(80000);
    // compareAt yoksa tavan = priceMinor.
    expect(() =>
      productVariantCreateRequestSchema.parse({
        title: "Cost",
        sku: "SKU-COST2",
        priceMinor: 100000,
        costMinor: 110000,
      }),
    ).toThrow();
  });

  // ADR-065 (Faz 2/Dilim 3) — kategori gorseli contract kablolamasi.
  it("ADR-065: category update accepts an imageId-only payload (not caught by the NO_FIELDS refine)", () => {
    // Yalniz imageId ile "gorseli degistir" — refine "en az bir alan" kontrolune TAKILMAZ.
    expect(productCategoryUpdateRequestSchema.parse({ imageId: "media_1" })).toEqual({ imageId: "media_1" });
    // Yalniz imageId: null ile "gorseli kaldir" da gecerlidir.
    expect(productCategoryUpdateRequestSchema.parse({ imageId: null })).toEqual({ imageId: null });
    // Tamamen bos gövde HALA reddedilir (refine korunuyor).
    expect(() => productCategoryUpdateRequestSchema.parse({})).toThrow();
  });

  it("ADR-065: category create accepts optional imageId (absent, null, or string)", () => {
    expect(productCategoryCreateRequestSchema.parse({ name: "Cat", slug: "cat" }).imageId).toBeUndefined();
    expect(productCategoryCreateRequestSchema.parse({ name: "Cat", slug: "cat", imageId: null }).imageId).toBeNull();
    expect(productCategoryCreateRequestSchema.parse({ name: "Cat", slug: "cat", imageId: "media_1" }).imageId).toBe(
      "media_1",
    );
  });

  it("ADR-065: category response carries imageId and derived imageUrl (both nullable)", () => {
    const now = new Date().toISOString();
    const base = {
      id: "cat_1",
      storeId: "store_1",
      name: "Winter",
      slug: "winter",
      parentId: null,
      sortOrder: 0,
      status: "ACTIVE" as const,
      createdAt: now,
      updatedAt: now,
    };
    const withImage = productCategorySchema.parse({
      ...base,
      imageId: "media_1",
      imageUrl: "/media/stores/store_1/categories/aaa.webp",
    });
    expect(withImage).toMatchObject({ imageId: "media_1", imageUrl: "/media/stores/store_1/categories/aaa.webp" });
    // Gorselsiz kategori: ikisi de null.
    const noImage = productCategorySchema.parse({ ...base, imageId: null, imageUrl: null });
    expect(noImage).toMatchObject({ imageId: null, imageUrl: null });
  });

  it("ADR-065 Faz 2/Dilim 2: product update accepts an ordered imageMediaIds list (incl. empty = clear)", () => {
    // Yalniz imageMediaIds ile "sadece galeriyi guncelle" — NO_FIELDS refine'ine TAKILMAZ.
    expect(productUpdateRequestSchema.parse({ imageMediaIds: ["m1", "m2"] }).imageMediaIds).toEqual(["m1", "m2"]);
    // Bos dizi = galeriyi tamamen temizle (gecerli, tek alan yeterli).
    expect(productUpdateRequestSchema.parse({ imageMediaIds: [] }).imageMediaIds).toEqual([]);
  });

  it("ADR-065 Faz 2/Dilim 2: product update rejects duplicate mediaIds (DUPLICATE_IMAGE)", () => {
    const result = productUpdateRequestSchema.safeParse({ imageMediaIds: ["m1", "m1"] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message === "DUPLICATE_IMAGE")).toBe(true);
    }
  });

  it("ADR-065 Faz 2/Dilim 2: empty product update body is still rejected (NO_FIELDS)", () => {
    expect(() => productUpdateRequestSchema.parse({})).toThrow();
  });

  it("ADR-065 Faz 2/Dilim 2: product response carries an images array (defaults to [])", () => {
    const now = new Date().toISOString();
    const base = {
      id: "product_1",
      storeId: "store_1",
      title: "Demo Hoodie",
      slug: "demo-hoodie",
      description: null,
      status: "ACTIVE" as const,
      type: "PHYSICAL" as const,
      vendor: null,
      brand: null,
      seoTitle: null,
      seoDescription: null,
      salesMode: "ONLINE" as const,
      priceVisibility: "VISIBLE" as const,
      primaryAction: "ADD_TO_CART" as const,
      inquiryEnabled: false,
      appointmentRequired: false,
      whatsappEnabled: false,
      purchasable: true,
      minOrderQuantity: 1,
      maxOrderQuantity: null,
      callToActionLabel: null,
      whatsappMessageTemplate: null,
      inquiryFormTitle: null,
      appointmentNote: null,
      categoryIds: [],
      shippingWeightKg: null,
      shippingDesi: null,
      createdAt: now,
      updatedAt: now,
    };
    // images verilmezse [] default'lanir (liste yolu hafif kalir).
    expect(productSchema.parse(base).images).toEqual([]);
    // images verilirse sirali/kapak (position) tasinir.
    const withImages = productSchema.parse({
      ...base,
      images: [
        { mediaId: "m1", url: "/media/stores/store_1/products/a.webp", altText: null, position: 0 },
        { mediaId: "m2", url: "/media/stores/store_1/products/b.webp", altText: "alt", position: 1 },
      ],
    });
    expect(withImages.images).toEqual([
      { mediaId: "m1", url: "/media/stores/store_1/products/a.webp", altText: null, position: 0 },
      { mediaId: "m2", url: "/media/stores/store_1/products/b.webp", altText: "alt", position: 1 },
    ]);
  });

  it("accepts positive and negative non-zero inventory adjustments", () => {
    expect(inventoryAdjustRequestSchema.parse({ quantityDelta: 5 }).quantityDelta).toBe(5);
    expect(inventoryAdjustRequestSchema.parse({ quantityDelta: -2 }).quantityDelta).toBe(-2);
    expect(() => inventoryAdjustRequestSchema.parse({ quantityDelta: 0 })).toThrow();
  });

  it("parses order create input and rejects invalid email or quantity", () => {
    const parsed = orderCreateRequestSchema.parse({
      customerEmail: "buyer@example.com",
      lines: [{ variantId: "variant_1", quantity: 1 }],
    });
    expect(parsed).toMatchObject({ currency: "TRY", lines: [{ quantity: 1 }] });
    expect(() =>
      orderCreateRequestSchema.parse({
        customerEmail: "not-an-email",
        lines: [{ variantId: "variant_1", quantity: 1 }],
      }),
    ).toThrow();
    expect(() =>
      orderCreateRequestSchema.parse({
        customerEmail: "buyer@example.com",
        lines: [{ variantId: "variant_1", quantity: 0 }],
      }),
    ).toThrow();
    expect(() =>
      orderCreateRequestSchema.parse({
        customerEmail: "buyer@example.com",
        lines: [{ variantId: "variant_1", quantity: 10001 }],
      }),
    ).toThrow();
  });

  it("parses order responses with line snapshots and reservations", () => {
    const now = new Date().toISOString();
    const parsed = orderSchema.parse({
      id: "order_1",
      storeId: "store_1",
      orderNumber: "OS-000001",
      customerId: null,
      customerEmail: "buyer@example.com",
      currency: "TRY",
      status: "PLACED",
      paymentStatus: "UNPAID",
      fulfillmentStatus: "UNFULFILLED",
      subtotalAmount: 1000,
      discountAmount: 0,
      shippingAmount: 0,
      taxAmount: 0,
      totalAmount: 1000,
      placedAt: now,
      cancelledAt: null,
      cancelReason: null,
      createdAt: now,
      updatedAt: now,
      lines: [{
        id: "line_1",
        storeId: "store_1",
        orderId: "order_1",
        productId: "product_1",
        variantId: "variant_1",
        sku: "SKU-1",
        title: "Snapshot Product",
        variantTitle: "Default",
        quantity: 1,
        unitPriceAmount: 1000,
        totalAmount: 1000,
        currency: "TRY",
        createdAt: now,
      }],
      reservations: [{
        id: "reservation_1",
        storeId: "store_1",
        orderId: "order_1",
        orderLineId: "line_1",
        variantId: "variant_1",
        quantity: 1,
        status: "ACTIVE",
        expiresAt: null,
        releasedAt: null,
        consumedAt: null,
        createdAt: now,
        updatedAt: now,
      }],
      addresses: [],
      events: [],
    });
    expect(parsed.lines[0]?.sku).toBe("SKU-1");
    expect(parsed.reservations[0]?.status).toBe("ACTIVE");
  });
});
