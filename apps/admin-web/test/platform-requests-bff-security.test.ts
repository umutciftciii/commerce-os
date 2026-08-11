import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const platformMock = {
  list: vi.fn().mockResolvedValue({ items: [], page: 1, pageSize: 25, total: 0 }),
  assign: vi.fn().mockResolvedValue({ request: {} }),
  users: vi.fn().mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 }),
};
const categoriesMock = { list: vi.fn().mockResolvedValue({ items: [] }) };

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
  createApiClient: () => ({ platformRequests: { platform: platformMock, categories: categoriesMock } }),
}));

import { GET as LIST } from "../app/api/admin/platform-requests/route";
import { POST as ASSIGN } from "../app/api/admin/platform-requests/[id]/assign/route";
import { GET as USERS } from "../app/api/admin/platform-users/route";

function request(path: string, init: ConstructorParameters<typeof NextRequest>[1] = {}) {
  return new NextRequest(`http://localhost${path}`, init);
}
const params = Promise.resolve({ id: "req-1" });

afterEach(() => vi.clearAllMocks());

describe("platform-requests BFF security (platform-admin session required)", () => {
  it("GET inbox without a session cookie → 401 (gateway never called)", async () => {
    const res = await LIST(request("/api/admin/platform-requests?status=OPEN"));
    expect(res.status).toBe(401);
    expect(platformMock.list).not.toHaveBeenCalled();
  });

  it("POST assign without a session cookie → 401 (no write reaches the gateway)", async () => {
    const res = await ASSIGN(
      request("/api/admin/platform-requests/req-1/assign", {
        method: "POST",
        body: JSON.stringify({ expectedVersion: 0, assigneePlatformUserId: "me" }),
        headers: { "content-type": "application/json" },
      }),
      { params },
    );
    expect(res.status).toBe(401);
    expect(platformMock.assign).not.toHaveBeenCalled();
  });

  it("TD-178-6: GET assignable-user directory without a session cookie → 401 (gateway never called)", async () => {
    const res = await USERS(request("/api/admin/platform-users?search=ada"));
    expect(res.status).toBe(401);
    expect(platformMock.users).not.toHaveBeenCalled();
  });

  it("POST assign with a session cookie but no CSRF header → 403", async () => {
    const res = await ASSIGN(
      request("/api/admin/platform-requests/req-1/assign", {
        method: "POST",
        body: JSON.stringify({ expectedVersion: 0, assigneePlatformUserId: "me" }),
        headers: { "content-type": "application/json", cookie: "commerce_os_admin_session=tkn" },
      }),
      { params },
    );
    expect(res.status).toBe(403);
    expect(platformMock.assign).not.toHaveBeenCalled();
  });
});
