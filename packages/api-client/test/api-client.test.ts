import { describe, expect, it } from "vitest";
import { ApiError, createApiClient, resolveApiGatewayUrl } from "../src/index.js";

/** Tek cagriyi kaydeden, verilen yaniti donduren basit fetch sahtesi. */
function stubFetch(response: {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return response;
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

describe("api client", () => {
  it("trims trailing slashes from the resolved base url", () => {
    expect(resolveApiGatewayUrl("http://localhost:4000/")).toBe("http://localhost:4000");
  });

  it("falls back to a localhost default", () => {
    expect(resolveApiGatewayUrl()).toContain("http");
  });

  it("calls the health endpoint against the base url", async () => {
    const calls: string[] = [];
    const fakeFetch = (async (url: string) => {
      calls.push(String(url));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: "ok",
          service: "api-gateway",
          timestamp: new Date().toISOString(),
        }),
      };
    }) as unknown as typeof fetch;

    const client = createApiClient({ baseUrl: "http://localhost:4000", fetch: fakeFetch });
    const result = await client.health();

    expect(result.status).toBe("ok");
    expect(calls[0]).toBe("http://localhost:4000/health");
  });

  it("throws on a non-ok response", async () => {
    const fakeFetch = (async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    })) as unknown as typeof fetch;

    const client = createApiClient({ baseUrl: "http://localhost:4000", fetch: fakeFetch });
    await expect(client.health()).rejects.toThrow(/503/);
  });

  it("sends bearer tokens and JSON bodies for admin requests", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: "store_1",
          name: "Demo",
          slug: "demo",
          status: "ACTIVE",
          metadata: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      };
    }) as unknown as typeof fetch;

    const client = createApiClient({
      baseUrl: "http://localhost:4000",
      fetch: fakeFetch,
      token: "default-token",
    });
    await client.admin.stores.create({ name: "Demo", slug: "demo", status: "ACTIVE" });

    const headers = calls[0]?.init?.headers as Headers;
    expect(calls[0]?.url).toBe("http://localhost:4000/admin/stores");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(headers.get("authorization")).toBe("Bearer default-token");
    expect(headers.get("content-type")).toBe("application/json");
    expect(calls[0]?.init?.body).toBe(JSON.stringify({ name: "Demo", slug: "demo", status: "ACTIVE" }));
  });
});

describe("platform auth helpers", () => {
  it("posts credentials to the login endpoint without a bearer token", async () => {
    const { calls, fetchImpl } = stubFetch({
      ok: true,
      status: 200,
      json: async () => ({
        token: "raw-token",
        expiresAt: new Date(Date.now() + 1000).toISOString(),
        user: { id: "u1", email: "a@b.co", name: "A", role: "SUPER_ADMIN" },
      }),
    });
    const client = createApiClient({ baseUrl: "http://localhost:4000", fetch: fetchImpl });
    const result = await client.auth.platformLogin({ email: "a@b.co", password: "pw" });

    expect(result.token).toBe("raw-token");
    expect(calls[0]?.url).toBe("http://localhost:4000/auth/platform/login");
    expect(calls[0]?.init?.method).toBe("POST");
    expect((calls[0]?.init?.headers as Headers).has("authorization")).toBe(false);
    expect(calls[0]?.init?.body).toBe(JSON.stringify({ email: "a@b.co", password: "pw" }));
  });

  it("sends the bearer token for me and logout", async () => {
    const me = stubFetch({
      ok: true,
      status: 200,
      json: async () => ({
        user: { id: "u1", email: "a@b.co", name: "A", role: "SUPER_ADMIN" },
        session: { id: "s1", expiresAt: new Date().toISOString() },
      }),
    });
    const meClient = createApiClient({ baseUrl: "http://localhost:4000", fetch: me.fetchImpl });
    await meClient.auth.platformMe("tok-1");
    expect(me.calls[0]?.url).toBe("http://localhost:4000/auth/platform/me");
    expect((me.calls[0]?.init?.headers as Headers).get("authorization")).toBe("Bearer tok-1");

    const out = stubFetch({ ok: true, status: 200, json: async () => ({ revoked: true }) });
    const outClient = createApiClient({ baseUrl: "http://localhost:4000", fetch: out.fetchImpl });
    const logout = await outClient.auth.platformLogout("tok-2");
    expect(logout.revoked).toBe(true);
    expect(out.calls[0]?.init?.method).toBe("POST");
    expect((out.calls[0]?.init?.headers as Headers).get("authorization")).toBe("Bearer tok-2");
  });
});

describe("admin plan + internal health helpers", () => {
  it("lists plans and creates a plan with a bearer token", async () => {
    const list = stubFetch({
      ok: true,
      status: 200,
      json: async () => ({ data: [], pagination: { limit: 50, offset: 0, total: 0 } }),
    });
    const listClient = createApiClient({ baseUrl: "http://localhost:4000", fetch: list.fetchImpl });
    await listClient.admin.plans.list("tok");
    expect(list.calls[0]?.url).toBe("http://localhost:4000/admin/plans");
    expect((list.calls[0]?.init?.headers as Headers).get("authorization")).toBe("Bearer tok");

    const create = stubFetch({
      ok: true,
      status: 201,
      json: async () => ({
        id: "p1",
        code: "starter",
        name: "Starter",
        description: null,
        metadata: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    });
    const createClient = createApiClient({ baseUrl: "http://localhost:4000", fetch: create.fetchImpl });
    const plan = await createClient.admin.plans.create({ code: "starter", name: "Starter" }, "tok");
    expect(plan.code).toBe("starter");
    expect(create.calls[0]?.init?.method).toBe("POST");
  });

  it("calls the internal db health endpoint with the internal token", async () => {
    const { calls, fetchImpl } = stubFetch({
      ok: true,
      status: 200,
      json: async () => ({ status: "ok" }),
    });
    const client = createApiClient({ baseUrl: "http://localhost:4000", fetch: fetchImpl });
    const result = await client.internal.dbHealth("internal-secret");
    expect(result.status).toBe("ok");
    expect(calls[0]?.url).toBe("http://localhost:4000/internal/health/db");
    expect((calls[0]?.init?.headers as Headers).get("authorization")).toBe("Bearer internal-secret");
  });
});

describe("catalog and inventory helpers", () => {
  it("calls category, product, variant and inventory endpoints with typed paths", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return {
        ok: true,
        status: init?.method === "POST" ? 201 : 200,
        json: async () => {
          if (String(url).endsWith("/categories")) {
            return { data: [], pagination: { limit: 50, offset: 0, total: 0 } };
          }
          if (String(url).endsWith("/products")) {
            return { data: [], pagination: { limit: 50, offset: 0, total: 0 } };
          }
          if (String(url).endsWith("/variants")) {
            return {
              id: "variant_1",
              productId: "product_1",
              storeId: "store_1",
              title: "Default",
              sku: "SKU-1",
              barcode: null,
              priceMinor: 1000,
              compareAtMinor: null,
              currency: "TRY",
              status: "ACTIVE",
              optionValues: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
          }
          return {
            item: {
              id: "inventory_1",
              storeId: "store_1",
              variantId: "variant_1",
              productId: "product_1",
              sku: "SKU-1",
              title: "Default",
              quantityOnHand: 3,
              quantityReserved: 0,
              quantityAvailable: 3,
              lowStockThreshold: null,
              updatedAt: new Date().toISOString(),
            },
            movement: {
              id: "movement_1",
              storeId: "store_1",
              variantId: "variant_1",
              type: "ADJUSTMENT",
              quantityDelta: 3,
              reason: null,
              referenceType: null,
              referenceId: null,
              actorUserId: null,
              createdAt: new Date().toISOString(),
            },
          };
        },
      };
    }) as unknown as typeof fetch;

    const client = createApiClient({ baseUrl: "http://localhost:4000", fetch: fakeFetch });
    await client.admin.categories.list("store_1", "tok");
    await client.admin.products.list("store_1", "tok");
    await client.admin.products.variants.create(
      "store_1",
      "product_1",
      { title: "Default", sku: "SKU-1", priceMinor: 1000 },
      "tok",
    );
    await client.admin.inventory.adjust("store_1", "variant_1", { quantityDelta: 3 }, "tok");

    expect(calls.map((call) => call.url)).toEqual([
      "http://localhost:4000/stores/store_1/categories",
      "http://localhost:4000/stores/store_1/products",
      "http://localhost:4000/stores/store_1/products/product_1/variants",
      "http://localhost:4000/stores/store_1/inventory/variant_1/adjust",
    ]);
    expect(calls[2]?.init?.method).toBe("POST");
    expect(calls[2]?.init?.body).toBe(
      JSON.stringify({ title: "Default", sku: "SKU-1", priceMinor: 1000 }),
    );
    expect(calls[3]?.init?.method).toBe("POST");
    expect(calls[3]?.init?.body).toBe(JSON.stringify({ quantityDelta: 3 }));
  });
});

describe("order helpers", () => {
  it("calls order lifecycle endpoints with typed paths", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const now = new Date().toISOString();
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return {
        ok: true,
        status: init?.method === "POST" ? 201 : 200,
        json: async () => {
          if (String(url).endsWith("/orders")) {
            return init?.method === "POST"
              ? {
                  id: "order_1",
                  storeId: "store_1",
                  orderNumber: "OS-000001",
                  customerId: null,
                  customerEmail: "buyer@example.com",
                  currency: "TRY",
                  status: "DRAFT",
                  paymentStatus: "UNPAID",
                  fulfillmentStatus: "UNFULFILLED",
                  subtotalAmount: 1000,
                  discountAmount: 0,
                  shippingAmount: 0,
                  taxAmount: 0,
                  totalAmount: 1000,
                  placedAt: null,
                  cancelledAt: null,
                  cancelReason: null,
                  createdAt: now,
                  updatedAt: now,
                  lines: [],
                  addresses: [],
                  reservations: [],
                  events: [],
                }
              : { data: [], pagination: { limit: 50, offset: 0, total: 0 } };
          }
          return {
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
            lines: [],
            addresses: [],
            reservations: [],
            events: [],
          };
        },
      };
    }) as unknown as typeof fetch;

    const client = createApiClient({ baseUrl: "http://localhost:4000", fetch: fakeFetch });
    await client.admin.orders.list("store_1", "tok");
    await client.admin.orders.create(
      "store_1",
      { customerEmail: "buyer@example.com", currency: "TRY", lines: [{ variantId: "variant_1", quantity: 1 }], addresses: [] },
      "tok",
    );
    await client.admin.orders.place("store_1", "order_1", "tok");
    await client.admin.orders.cancel("store_1", "order_1", { reason: "buyer request" }, "tok");

    expect(calls.map((call) => call.url)).toEqual([
      "http://localhost:4000/stores/store_1/orders",
      "http://localhost:4000/stores/store_1/orders",
      "http://localhost:4000/stores/store_1/orders/order_1/place",
      "http://localhost:4000/stores/store_1/orders/order_1/cancel",
    ]);
    expect(calls[1]?.init?.method).toBe("POST");
    expect(calls[2]?.init?.method).toBe("POST");
    expect(calls[3]?.init?.body).toBe(JSON.stringify({ reason: "buyer request" }));
  });
});

describe("error handling", () => {
  it("throws a typed ApiError carrying the gateway error code and status", async () => {
    const { fetchImpl } = stubFetch({
      ok: false,
      status: 409,
      json: async () => ({ error: { code: "STORE_SLUG_EXISTS", message: "Store slug already exists." } }),
    });
    const client = createApiClient({ baseUrl: "http://localhost:4000", fetch: fetchImpl });

    const error = await client.admin.stores
      .create({ name: "Demo", slug: "demo", status: "DRAFT" }, "tok")
      .catch((caught) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("STORE_SLUG_EXISTS");
    expect((error as ApiError).status).toBe(409);
    expect((error as ApiError).apiMessage).toBe("Store slug already exists.");
  });

  it("falls back to an UNKNOWN code when the error body is not an envelope", async () => {
    const { fetchImpl } = stubFetch({ ok: false, status: 500, json: async () => ({}) });
    const client = createApiClient({ baseUrl: "http://localhost:4000", fetch: fetchImpl });
    const error = await client.auth.platformMe("tok").catch((caught) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("UNKNOWN");
    expect((error as ApiError).status).toBe(500);
  });
});
