import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Vitrin katalog resolver (F3A) — sunucu-tarafi token + mağaza bağlami + canli
 * veri. api-client sahteleneek; gercek ag cagrisi yapilmaz. Token'in istemciye
 * donen veriye sizmadigi dogrulanir.
 */
const TOKEN = "secret-server-token";

const apiClient = {
  auth: { platformLogin: vi.fn() },
  admin: {
    stores: { list: vi.fn() },
    categories: { list: vi.fn() },
    products: { list: vi.fn(), variants: { list: vi.fn() } },
    inventory: { list: vi.fn() },
  },
};

vi.mock("@commerce-os/api-client", () => {
  // Hata sinifi factory icinde tanimlanir (statik import sirasinda TDZ olmaz).
  class ApiError extends Error {
    readonly status: number;
    readonly code: string;
    constructor(status: number, code: string) {
      super(code);
      this.status = status;
      this.code = code;
    }
  }
  return { ApiError, createApiClient: () => apiClient };
});

import { ApiError as MockApiError } from "@commerce-os/api-client";
import {
  resolveStoreContext,
  getStorefrontListing,
  getStorefrontProductByHandle,
} from "../lib/server/catalog";
import { resetCatalogTokenForTests } from "../lib/server/api-token";

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1",
    storeId: "store-1",
    title: "Demo Hoodie",
    slug: "demo-hoodie",
    description: "Cozy hoodie",
    status: "ACTIVE",
    type: "PHYSICAL",
    vendor: null,
    brand: "Commerce OS",
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
    categoryIds: ["c1"],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function variant(overrides: Record<string, unknown> = {}) {
  return {
    id: "v1",
    productId: "p1",
    storeId: "store-1",
    title: "Black / M",
    sku: "DEMO-HOODIE-BLK-M",
    barcode: null,
    priceMinor: 129900,
    compareAtMinor: 149900,
    currency: "TRY",
    status: "ACTIVE",
    optionValues: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function page<T>(data: T[]) {
  return { data, pagination: { limit: 50, offset: 0, total: data.length } };
}

beforeEach(() => {
  resetCatalogTokenForTests();
  apiClient.auth.platformLogin.mockResolvedValue({
    token: TOKEN,
    expiresAt: "2030-01-01T00:00:00.000Z",
    user: { id: "u1", email: "x", name: null, role: "SUPER_ADMIN" },
  });
  apiClient.admin.stores.list.mockResolvedValue(
    page([
      { id: "store-9", name: "Other", slug: "other", domain: null, status: "ACTIVE", metadata: null, createdAt: "x", updatedAt: "x" },
      { id: "store-1", name: "Demo Store", slug: "demo-store", domain: null, status: "ACTIVE", metadata: null, createdAt: "x", updatedAt: "x" },
    ]),
  );
  apiClient.admin.categories.list.mockResolvedValue(
    page([{ id: "c1", storeId: "store-1", name: "Apparel", slug: "apparel", parentId: null, sortOrder: 10, status: "ACTIVE", createdAt: "x", updatedAt: "x" }]),
  );
  apiClient.admin.products.list.mockResolvedValue(page([product()]));
  apiClient.admin.products.variants.list.mockResolvedValue(page([variant()]));
  apiClient.admin.inventory.list.mockResolvedValue(
    page([{ id: "i1", storeId: "store-1", variantId: "v1", productId: "p1", sku: "DEMO-HOODIE-BLK-M", title: "Black / M", quantityOnHand: 15, quantityReserved: 0, quantityAvailable: 15, lowStockThreshold: 10, updatedAt: "x" }]),
  );
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("storefront resolver · store context", () => {
  it("resolves the demo store by slug server-side using the login token", async () => {
    const store = await resolveStoreContext();
    expect(store).toEqual({ id: "store-1", name: "Demo Store", slug: "demo-store" });
    // mağaza listesi sunucu token'iyla cekildi
    expect(apiClient.admin.stores.list).toHaveBeenCalledWith(TOKEN);
    expect(apiClient.auth.platformLogin).toHaveBeenCalledTimes(1);
  });

  it("returns no-store when no active store exists", async () => {
    apiClient.admin.stores.list.mockResolvedValue(page([]));
    const result = await getStorefrontListing();
    expect(result).toEqual({ ok: false, reason: "no-store" });
  });
});

describe("storefront resolver · live listing", () => {
  it("returns live product summaries with price + sales-mode view", async () => {
    const result = await getStorefrontListing();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toHaveLength(1);
    const [summary] = result.data;
    expect(summary.handle).toBe("demo-hoodie");
    expect(summary.title).toBe("Demo Hoodie");
    expect(summary.categoryLabel).toBe("Apparel");
    expect(summary.commerce.primaryCta).toBe("ADD_TO_CART");
    expect(summary.price.amountLabel).toContain("1.299");
    expect(summary.badgeKind).toBe("discount"); // compareAt > price
  });

  it("never exposes the server token in the returned data", async () => {
    const result = await getStorefrontListing();
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });

  it("hides numeric price for an INQUIRY / on-request product", async () => {
    apiClient.admin.products.list.mockResolvedValue(
      page([
        product({
          salesMode: "INQUIRY",
          priceVisibility: "ON_REQUEST",
          primaryAction: "REQUEST_PRICE",
          purchasable: false,
          inquiryEnabled: true,
        }),
      ]),
    );
    const result = await getStorefrontListing();
    if (!result.ok) throw new Error("expected ok");
    expect(result.data[0].price.mode).toBe("onRequest");
    expect(result.data[0].price.amountLabel).toBeNull();
    expect(result.data[0].commerce.primaryCta).toBe("REQUEST_PRICE");
  });
});

describe("storefront resolver · product detail", () => {
  it("resolves a product by handle with variants, stock and related", async () => {
    const result = await getStorefrontProductByHandle("demo-hoodie");
    expect(result.ok).toBe(true);
    if (!result.ok || result.data === null) throw new Error("expected detail");
    expect(result.data.sku).toBe("DEMO-HOODIE-BLK-M");
    expect(result.data.variants[0].inStock).toBe(true);
    expect(result.data.variants[0].available).toBe(15);
    expect(result.data.description).toBe("Cozy hoodie");
  });

  it("returns null data for an unknown handle (404/empty state)", async () => {
    const result = await getStorefrontProductByHandle("does-not-exist");
    expect(result).toEqual({ ok: true, data: null });
  });

  it("re-logs in and retries once on a 401 from the gateway", async () => {
    apiClient.admin.stores.list
      .mockRejectedValueOnce(new MockApiError(401, "UNAUTHORIZED", "Unauthorized."))
      .mockResolvedValueOnce(
        page([{ id: "store-1", name: "Demo Store", slug: "demo-store", domain: null, status: "ACTIVE", metadata: null, createdAt: "x", updatedAt: "x" }]),
      );
    const store = await resolveStoreContext();
    expect(store?.id).toBe("store-1");
    expect(apiClient.auth.platformLogin).toHaveBeenCalledTimes(2);
  });
});
