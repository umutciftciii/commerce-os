import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const supportMock = {
  list: vi.fn().mockResolvedValue({ items: [] }),
  create: vi.fn().mockResolvedValue({ questionSet: {} }),
};

vi.mock("@commerce-os/api-client", () => ({
  ApiError: class ApiError extends Error {
    readonly status: number;
    readonly code: string;
    constructor(status: number, code: string) {
      super(code);
      this.status = status;
      this.code = code;
    }
  },
  createApiClient: () => ({ admin: { support: supportMock } }),
}));

import { GET, POST } from "../app/api/admin/support/question-sets/route";

function request(path: string, init: ConstructorParameters<typeof NextRequest>[1] = {}) {
  return new NextRequest(`http://localhost${path}`, init);
}

afterEach(() => vi.clearAllMocks());

describe("support BFF security (platform-admin session required)", () => {
  it("GET without a session cookie → 401 UNAUTHORIZED (gateway never called)", async () => {
    const res = await GET(request("/api/admin/support/question-sets"));
    expect(res.status).toBe(401);
    expect(supportMock.list).not.toHaveBeenCalled();
  });

  it("POST without a session cookie → 401 (no write reaches the gateway)", async () => {
    const res = await POST(
      request("/api/admin/support/question-sets", {
        method: "POST",
        body: JSON.stringify({ key: "x", title: "y" }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(res.status).toBe(401);
    expect(supportMock.create).not.toHaveBeenCalled();
  });

  it("POST with a session cookie but no CSRF header → 403 (no write reaches the gateway)", async () => {
    const res = await POST(
      request("/api/admin/support/question-sets", {
        method: "POST",
        body: JSON.stringify({ key: "x", title: "y" }),
        headers: { "content-type": "application/json", cookie: "commerce_os_admin_session=tkn" },
      }),
    );
    expect(res.status).toBe(403);
    expect(supportMock.create).not.toHaveBeenCalled();
  });
});
