import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiClient = {
  admin: {
    stores: { list: vi.fn() },
    media: {
      list: vi.fn(),
      upload: vi.fn(),
      remove: vi.fn(),
    },
  },
};

class MockApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  constructor(status: number, code: string, message?: string, details?: unknown) {
    super(message ?? code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

vi.mock("@commerce-os/api-client", () => ({
  ApiError: MockApiError,
  createApiClient: () => apiClient,
}));

const SESSION = "commerce_os_store_admin_session=platform-token";
const CSRF_COOKIE = "; commerce_os_store_admin_csrf=csrf-token";

const DEMO_STORE = {
  id: "store-1",
  name: "Demo Store",
  slug: "demo-store",
  domain: null,
  status: "ACTIVE",
  metadata: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const ASSET = {
  id: "media_1",
  context: "PRODUCT",
  url: "/media/stores/store-1/products/x.webp",
  mimeType: "image/webp",
  byteSize: 1234,
  width: 800,
  height: 800,
  altText: null,
  createdAt: "2026-07-12T00:00:00.000Z",
};

function request(path: string, init: ConstructorParameters<typeof NextRequest>[1] = {}) {
  return new NextRequest(`http://localhost${path}`, init);
}

beforeEach(() => {
  apiClient.admin.stores.list.mockResolvedValue({
    data: [DEMO_STORE],
    pagination: { limit: 50, offset: 0, total: 1 },
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("store-admin BFF — media (ADR-065 Faz 2 / Dilim 1)", () => {
  it("GET rejects without a session cookie", async () => {
    const { GET } = await import("../app/api/media/route.js");
    const response = await GET(request("/api/media"));
    expect(response.status).toBe(401);
    expect(apiClient.admin.media.list).not.toHaveBeenCalled();
  });

  it("GET lists media for the resolved store with the context filter", async () => {
    apiClient.admin.media.list.mockResolvedValue({
      data: [ASSET],
      pagination: { limit: 100, offset: 0, total: 1 },
    });
    const { GET } = await import("../app/api/media/route.js");
    const response = await GET(request("/api/media?context=PRODUCT", { headers: { cookie: SESSION } }));

    expect(response.status).toBe(200);
    expect(apiClient.admin.media.list).toHaveBeenCalledWith("store-1", "PRODUCT", "platform-token");
  });

  it("GET rejects an invalid context with 400 and never calls the gateway", async () => {
    const { GET } = await import("../app/api/media/route.js");
    const response = await GET(request("/api/media?context=BOGUS", { headers: { cookie: SESSION } }));
    expect(response.status).toBe(400);
    expect(apiClient.admin.media.list).not.toHaveBeenCalled();
  });

  it("POST requires a CSRF header", async () => {
    const form = new FormData();
    form.append("context", "PRODUCT");
    form.append("file", new File([new Uint8Array([1, 2, 3])], "x.png", { type: "image/png" }));
    const { POST } = await import("../app/api/media/route.js");
    const response = await POST(
      request("/api/media", { method: "POST", headers: { cookie: SESSION }, body: form }),
    );
    expect(response.status).toBe(403);
    expect(apiClient.admin.media.upload).not.toHaveBeenCalled();
  });

  it("POST uploads with context/altText appended BEFORE the file (gateway field order)", async () => {
    apiClient.admin.media.upload.mockResolvedValue({ data: ASSET });
    const form = new FormData();
    form.append("context", "PRODUCT");
    form.append("altText", "kapak");
    form.append("file", new File([new Uint8Array([1, 2, 3])], "x.png", { type: "image/png" }));

    const { POST } = await import("../app/api/media/route.js");
    const response = await POST(
      request("/api/media", {
        method: "POST",
        headers: { cookie: SESSION + CSRF_COOKIE, "x-commerce-os-csrf": "csrf-token" },
        body: form,
      }),
    );

    expect(response.status).toBe(201);
    const [storeId, sentForm, token] = apiClient.admin.media.upload.mock.calls[0];
    expect(storeId).toBe("store-1");
    expect(token).toBe("platform-token");
    expect(Array.from((sentForm as FormData).keys())).toEqual(["context", "altText", "file"]);
  });

  it("DELETE propagates 409 MEDIA_IN_USE with details.usedIn", async () => {
    apiClient.admin.media.remove.mockRejectedValue(
      new MockApiError(409, "MEDIA_IN_USE", "in use", { usedIn: ["ProductImage"] }),
    );
    const { DELETE } = await import("../app/api/media/[mediaId]/route.js");
    const response = await DELETE(
      request("/api/media/media_1", {
        method: "DELETE",
        headers: { cookie: SESSION + CSRF_COOKIE, "x-commerce-os-csrf": "csrf-token" },
      }),
      { params: Promise.resolve({ mediaId: "media_1" }) },
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("MEDIA_IN_USE");
    expect(body.error.details.usedIn).toEqual(["ProductImage"]);
  });

  it("DELETE returns 204 on success", async () => {
    apiClient.admin.media.remove.mockResolvedValue(undefined);
    const { DELETE } = await import("../app/api/media/[mediaId]/route.js");
    const response = await DELETE(
      request("/api/media/media_1", {
        method: "DELETE",
        headers: { cookie: SESSION + CSRF_COOKIE, "x-commerce-os-csrf": "csrf-token" },
      }),
      { params: Promise.resolve({ mediaId: "media_1" }) },
    );
    expect(response.status).toBe(204);
    expect(apiClient.admin.media.remove).toHaveBeenCalledWith("store-1", "media_1", "platform-token");
  });
});
