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
  resolvePrimaryCategorySelection,
  publicProductImageSchema,
  publicCartLineSchema,
  publicOrderConfirmationLineSchema,
  publicProductSchema,
  publicProductDetailSchema,
  productVariantCreateRequestSchema,
  productVariantUpdateRequestSchema,
  storeSettingsSchema,
  storeSettingsUpdateRequestSchema,
  heroSlideCreateRequestSchema,
  heroSlideReorderRequestSchema,
  heroSlideSchema,
  heroSlideStatusActionResponseSchema,
  heroSlideUpdateRequestSchema,
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
      primaryCategoryId: null,
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

  it("ADR-078 Faz 2C-7: product update accepts imageBindings + mediaDefiningAttributeId (tek alan yeterli)", () => {
    const parsed = productUpdateRequestSchema.parse({
      mediaDefiningAttributeId: "attr_color",
      imageBindings: [
        { mediaId: "m1", optionId: "opt_red" },
        { mediaId: "m2", optionId: null },
        { mediaId: "m3" },
      ],
    });
    expect(parsed.mediaDefiningAttributeId).toBe("attr_color");
    expect(parsed.imageBindings).toEqual([
      { mediaId: "m1", optionId: "opt_red" },
      { mediaId: "m2", optionId: null },
      { mediaId: "m3" },
    ]);
    // null = klasik moda don (gecerli tek alan).
    expect(productUpdateRequestSchema.parse({ mediaDefiningAttributeId: null }).mediaDefiningAttributeId).toBeNull();
  });

  it("ADR-078 Faz 2C-7: imageBindings duplicate mediaId reddedilir (DUPLICATE_IMAGE)", () => {
    const result = productUpdateRequestSchema.safeParse({
      imageBindings: [
        { mediaId: "m1", optionId: "opt_red" },
        { mediaId: "m1", optionId: null },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message === "DUPLICATE_IMAGE")).toBe(true);
    }
  });

  it("ADR-078 Faz 2C-7: public variant/image/product media alanlari default(null) (allowlist-guvenli)", () => {
    // publicProductImageSchema.variantOptionId default null; verilirse tasinir.
    expect(publicProductImageSchema.parse({ url: "/media/x.webp", altText: null, position: 0 }).variantOptionId).toBeNull();
    expect(
      publicProductImageSchema.parse({ url: "/media/x.webp", altText: null, position: 0, variantOptionId: "opt_red" })
        .variantOptionId,
    ).toBe("opt_red");
    // publicProductSchema.mediaDefiningAttributeId default null.
    expect(publicProductSchema.parse(basePublicProduct).mediaDefiningAttributeId).toBeNull();
  });

  // ADR-065 (Faz 2/Dilim 4) — magaza marka ayarlari contract kablolamasi.
  it("ADR-065 Faz 2/Dilim 4: store settings response allows all-null media (nullable)", () => {
    const allNull = storeSettingsSchema.parse({
      storeId: "store_1",
      storeName: "Demo Store",
      logoMediaId: null,
      logoUrl: null,
      faviconMediaId: null,
      faviconUrl: null,
    });
    expect(allNull).toMatchObject({ storeName: "Demo Store", logoMediaId: null, faviconUrl: null });
    // Bagli logo + favicon ile de gecerli.
    const bound = storeSettingsSchema.parse({
      storeId: "store_1",
      storeName: "Demo Store",
      logoMediaId: "media_logo",
      logoUrl: "/media/stores/store_1/branding/logo.webp",
      faviconMediaId: "media_fav",
      faviconUrl: "/media/stores/store_1/branding/fav.webp",
    });
    expect(bound).toMatchObject({ logoMediaId: "media_logo", faviconMediaId: "media_fav" });
  });

  it("ADR-065 Faz 2/Dilim 4: store settings update refine — empty rejected, single field ok, null clears", () => {
    // Tamamen bos gövde reddedilir (refine "en az bir alan").
    expect(() => storeSettingsUpdateRequestSchema.parse({})).toThrow();
    // Yalniz logoMediaId → gecerli.
    expect(storeSettingsUpdateRequestSchema.parse({ logoMediaId: "media_logo" })).toEqual({
      logoMediaId: "media_logo",
    });
    // Yalniz faviconMediaId: null (kaldir) → gecerli; absent olan logo alani gövdeye SIZMAZ
    // (absent-vs-null ayrimini upsert bu sayede korur).
    expect(storeSettingsUpdateRequestSchema.parse({ faviconMediaId: null })).toEqual({ faviconMediaId: null });
    // Bos string reddedilir (min(1)).
    expect(() => storeSettingsUpdateRequestSchema.parse({ logoMediaId: "" })).toThrow();
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
      primaryCategoryId: null,
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
    // Faz 2C-7 (ADR-078) — optionId default(null) eklenir (etiketsiz = paylasilan).
    expect(withImages.images).toEqual([
      { mediaId: "m1", url: "/media/stores/store_1/products/a.webp", altText: null, position: 0, optionId: null },
      { mediaId: "m2", url: "/media/stores/store_1/products/b.webp", altText: "alt", position: 1, optionId: null },
    ]);
  });

  // ADR-065 (Faz 3/Dilim 1) — Public görsel ALLOWLIST'i.
  const basePublicProduct = {
    id: "product_1",
    slug: "demo-hoodie",
    title: "Demo Hoodie",
    brand: null,
    categoryLabel: null,
    salesMode: "ONLINE",
    priceVisibility: "VISIBLE",
    primaryAction: "ADD_TO_CART",
    purchasable: true,
    whatsappEnabled: false,
    inquiryEnabled: false,
    appointmentRequired: false,
    minOrderQuantity: 1,
    maxOrderQuantity: null,
    variants: [],
  };

  it("ADR-065 Faz 3/Dilim 1: publicProductImageSchema is an allowlist (drops mediaId/storageKey)", () => {
    // Ic/yonetim alanlari (mediaId ham FK, storageKey, checksum) parse'ta DUSTURULUR;
    // yalniz url/altText/position kalir → public govdeye asla sizmaz.
    const parsed = publicProductImageSchema.parse({
      url: "/media/stores/store_1/products/a.webp",
      altText: "Kapak",
      position: 0,
      mediaId: "media_1",
      storageKey: "stores/store_1/products/a.webp",
      checksum: "deadbeef",
    } as Record<string, unknown>);
    // Faz 2C-7 (ADR-078) — variantOptionId (option id; media ic alani DEGIL) allowlist'te, default null.
    expect(parsed).toEqual({
      url: "/media/stores/store_1/products/a.webp",
      altText: "Kapak",
      position: 0,
      variantOptionId: null,
    });
    expect(parsed).not.toHaveProperty("mediaId");
    expect(parsed).not.toHaveProperty("storageKey");
    expect(parsed).not.toHaveProperty("checksum");
  });

  it("ADR-065 Faz 3/Dilim 1: publicProduct images defaults to [] and strips leaked image fields", () => {
    // images verilmezse [] (gorseli olmayan urun → vitrin yer tutucuya duser).
    expect(publicProductSchema.parse(basePublicProduct).images).toEqual([]);
    // images verilirse yalniz allowlist alanlari tasinir; mediaId/storageKey elenir.
    const withImages = publicProductSchema.parse({
      ...basePublicProduct,
      images: [
        {
          url: "/media/stores/store_1/products/cover.webp",
          altText: null,
          position: 0,
          mediaId: "media_1",
          storageKey: "stores/store_1/products/cover.webp",
        },
      ],
    } as Record<string, unknown>);
    expect(withImages.images).toEqual([
      { url: "/media/stores/store_1/products/cover.webp", altText: null, position: 0, variantOptionId: null },
    ]);
    expect(JSON.stringify(withImages)).not.toContain("mediaId");
    expect(JSON.stringify(withImages)).not.toContain("storageKey");
  });

  it("ADR-065 Faz 3/Dilim 1: publicProductDetail inherits the images allowlist (full gallery)", () => {
    const detail = publicProductDetailSchema.parse({
      ...basePublicProduct,
      description: null,
      callToActionLabel: null,
      whatsappMessageTemplate: null,
      inquiryFormTitle: null,
      appointmentNote: null,
      related: [],
      images: [
        { url: "/media/stores/store_1/products/a.webp", altText: "A", position: 0, mediaId: "m1" },
        { url: "/media/stores/store_1/products/b.webp", altText: null, position: 1, mediaId: "m2" },
      ],
    } as Record<string, unknown>);
    expect(detail.images).toHaveLength(2);
    expect(detail.images[0]).toEqual({
      url: "/media/stores/store_1/products/a.webp",
      altText: "A",
      position: 0,
      variantOptionId: null,
    });
    expect(JSON.stringify(detail.images)).not.toContain("mediaId");
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

  // ADR-065 (Faz 3/Dilim 6a) — Sepet/onay satiri KAPAK thumbnail'i (imageUrl).
  const baseCartLine = {
    variantId: "variant_1",
    productSlug: "demo-hoodie",
    title: "Demo Hoodie",
    variantTitle: "Black / M",
    sku: "DEMO-HOODIE-BLK-M",
    quantity: 1,
    availableQuantity: 1,
    unitPriceMinor: 129900,
    lineTotalMinor: 129900,
    currency: "TRY",
    minOrderQuantity: 1,
    maxOrderQuantity: null,
    inStock: true,
    status: "OK" as const,
    imageUrl: null,
    selected: true,
    compareAtMinor: null,
    discountedUnitPriceMinor: null,
    discountedLineTotalMinor: null,
  };

  it("Dilim 6a-refine: publicCartLine carries selected + compareAtMinor (nullable)", () => {
    // selected zorunlu; compareAtMinor nullable (indirim yoksa null, varsa liste fiyati).
    expect(publicCartLineSchema.parse({ ...baseCartLine, selected: false }).selected).toBe(false);
    expect(publicCartLineSchema.parse({ ...baseCartLine, compareAtMinor: 174900 }).compareAtMinor).toBe(174900);
    expect(publicCartLineSchema.parse({ ...baseCartLine, compareAtMinor: null }).compareAtMinor).toBeNull();
  });

  it("Dilim 6a-refine: publicCartLine carries campaign discounted unit/line price (nullable)", () => {
    const parsed = publicCartLineSchema.parse({
      ...baseCartLine,
      discountedUnitPriceMinor: 134910,
      discountedLineTotalMinor: 134910,
    });
    expect(parsed.discountedUnitPriceMinor).toBe(134910);
    expect(parsed.discountedLineTotalMinor).toBe(134910);
    // Kampanya yoksa null.
    expect(publicCartLineSchema.parse(baseCartLine).discountedUnitPriceMinor).toBeNull();
  });

  it("Dilim 6a: publicCartLine imageUrl accepts a URL and null; drops leaked media fields", () => {
    // Kapak URL'i (turetilmis) tasinir; null gecerli (gorselsiz urun → yer tutucu).
    expect(publicCartLineSchema.parse({ ...baseCartLine, imageUrl: "/media/x.webp" }).imageUrl).toBe("/media/x.webp");
    expect(publicCartLineSchema.parse({ ...baseCartLine, imageUrl: null }).imageUrl).toBeNull();
    // ALLOWLIST: ham mediaId/storageKey parse'ta DUSTURULUR → yalniz turetilmis URL kalir.
    const parsed = publicCartLineSchema.parse({
      ...baseCartLine,
      imageUrl: "/media/x.webp",
      mediaId: "media_1",
      storageKey: "stores/store_1/products/x.webp",
    } as Record<string, unknown>);
    expect(parsed).not.toHaveProperty("mediaId");
    expect(parsed).not.toHaveProperty("storageKey");
    expect(JSON.stringify(parsed)).not.toContain("storageKey");
  });

  it("Dilim 6a: publicOrderConfirmationLine imageUrl is optional (absent OK) + allowlist", () => {
    const base = {
      title: "Demo Hoodie",
      variantTitle: "Black / M",
      quantity: 1,
      unitPriceMinor: 129900,
      lineTotalMinor: 129900,
      currency: "TRY",
    };
    // OPTIONAL: alan hic verilmese de parse gecer → receipt/payment-state (Dilim 6b
    // kapsami) serialize noktalarina DOKUNMADAN geriye-uyumlu kalir.
    expect(publicOrderConfirmationLineSchema.parse(base)).not.toHaveProperty("imageUrl");
    // Confirmation yolunda doldurulur: URL ya da null.
    expect(publicOrderConfirmationLineSchema.parse({ ...base, imageUrl: "/media/x.webp" }).imageUrl).toBe("/media/x.webp");
    expect(publicOrderConfirmationLineSchema.parse({ ...base, imageUrl: null }).imageUrl).toBeNull();
    // ALLOWLIST: ham anahtarlar dusturulur.
    const parsed = publicOrderConfirmationLineSchema.parse({
      ...base,
      imageUrl: "/media/x.webp",
      mediaId: "media_1",
      storageKey: "stores/store_1/products/x.webp",
    } as Record<string, unknown>);
    expect(parsed).not.toHaveProperty("mediaId");
    expect(parsed).not.toHaveProperty("storageKey");
  });
});

// ADR-065 (Faz 2/Dilim 5) — Hero slide kontratlari.
describe("hero slide contracts", () => {
  it("create: mediaId zorunlu; status semada opsiyonel (sunucu default DRAFT)", () => {
    const parsed = heroSlideCreateRequestSchema.parse({ mediaId: "media_1" });
    expect(parsed.mediaId).toBe("media_1");
    expect(parsed.status).toBeUndefined();
  });

  it("create: mediaId eksikse reddedilir (R6 gorsel zorunlu)", () => {
    expect(() => heroSlideCreateRequestSchema.parse({ headline: "x" })).toThrow();
  });

  it("create: bos mediaId reddedilir", () => {
    expect(() => heroSlideCreateRequestSchema.parse({ mediaId: "" })).toThrow();
  });

  it("update: bos PATCH reddedilir (en az bir alan)", () => {
    expect(() => heroSlideUpdateRequestSchema.parse({})).toThrow();
  });

  it("update: mediaId null'a cekilemez (gorselsiz kalamaz, R6)", () => {
    expect(() => heroSlideUpdateRequestSchema.parse({ mediaId: null })).toThrow();
  });

  it("update: tekil alan gecerli; null ile alan temizlenebilir", () => {
    expect(heroSlideUpdateRequestSchema.parse({ headline: null })).toEqual({ headline: null });
    expect(heroSlideUpdateRequestSchema.parse({ ctaLabel: "Al" })).toEqual({ ctaLabel: "Al" });
  });

  it("response: nullable metin alanlari + mediaUrl parse edilir", () => {
    const parsed = heroSlideSchema.parse({
      id: "hero_1",
      mediaId: "media_1",
      mediaUrl: "/media/stores/s/hero/a.webp",
      position: 0,
      status: "DRAFT",
      headline: null,
      subtext: null,
      ctaLabel: null,
      ctaHref: null,
      startsAt: null,
      endsAt: null,
      createdAt: "2026-07-11T00:00:00.000Z",
      updatedAt: "2026-07-11T00:00:00.000Z",
    });
    expect(parsed.status).toBe("DRAFT");
    expect(parsed.mediaUrl).toBe("/media/stores/s/hero/a.webp");
  });

  it("reorder: sıralı id listesi parse; duplicate ve boş liste reddedilir", () => {
    expect(heroSlideReorderRequestSchema.parse({ orderedIds: ["a", "b", "c"] }).orderedIds).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(() => heroSlideReorderRequestSchema.parse({ orderedIds: ["a", "a"] })).toThrow();
    expect(() => heroSlideReorderRequestSchema.parse({ orderedIds: [] })).toThrow();
  });

  it("statusAction response: id + status enum; geçersiz status reddedilir", () => {
    expect(heroSlideStatusActionResponseSchema.parse({ id: "hero_1", status: "PUBLISHED" })).toEqual({
      id: "hero_1",
      status: "PUBLISHED",
    });
    expect(() => heroSlideStatusActionResponseSchema.parse({ id: "hero_1", status: "X" })).toThrow();
  });

  // Faz 1A (ADR-067) — ana kategori secim/normalizasyon kaynak dogrusu (saf).
  describe("resolvePrimaryCategorySelection", () => {
    it("kategorisiz: primary yok => null; primary verilmis => NOT_ASSIGNED", () => {
      expect(resolvePrimaryCategorySelection({ categoryIds: [] })).toEqual({
        ok: true,
        primaryCategoryId: null,
        categoryIds: [],
      });
      expect(resolvePrimaryCategorySelection({ categoryIds: [], primaryCategoryId: "c1" })).toEqual({
        ok: false,
        code: "PRIMARY_CATEGORY_NOT_ASSIGNED",
      });
    });

    it("tek kategori + primary yok => otomatik o kategori", () => {
      expect(resolvePrimaryCategorySelection({ categoryIds: ["c1"] })).toEqual({
        ok: true,
        primaryCategoryId: "c1",
        categoryIds: ["c1"],
      });
    });

    it("coklu kategori + primary yok => REQUIRED", () => {
      expect(resolvePrimaryCategorySelection({ categoryIds: ["c1", "c2"] })).toEqual({
        ok: false,
        code: "PRIMARY_CATEGORY_REQUIRED",
      });
    });

    it("primary listede degil => NOT_ASSIGNED; listede => gecerli", () => {
      expect(resolvePrimaryCategorySelection({ categoryIds: ["c1", "c2"], primaryCategoryId: "c3" })).toEqual({
        ok: false,
        code: "PRIMARY_CATEGORY_NOT_ASSIGNED",
      });
      expect(resolvePrimaryCategorySelection({ categoryIds: ["c1", "c2"], primaryCategoryId: "c2" })).toEqual({
        ok: true,
        primaryCategoryId: "c2",
        categoryIds: ["c1", "c2"],
      });
    });

    it("categoryIds cikista dedup edilir", () => {
      expect(resolvePrimaryCategorySelection({ categoryIds: ["c1", "c1"] })).toEqual({
        ok: true,
        primaryCategoryId: "c1",
        categoryIds: ["c1"],
      });
    });
  });

  it("Faz 1A: productSchema primaryCategoryId (nullable) tasir; create/update opsiyonel kabul eder", () => {
    // create: primaryCategoryId opsiyonel; verilmezse undefined.
    expect(productCreateRequestSchema.parse({ title: "P", slug: "p" }).primaryCategoryId).toBeUndefined();
    expect(
      productCreateRequestSchema.parse({ title: "P", slug: "p", categoryIds: ["c1"], primaryCategoryId: "c1" })
        .primaryCategoryId,
    ).toBe("c1");
    // update: null ile temizleme kabul edilir.
    expect(productUpdateRequestSchema.parse({ primaryCategoryId: null }).primaryCategoryId).toBeNull();
  });
});
