import { describe, expect, it } from "vitest";
import { GET } from "../app/api/health/route.js";

describe("storefront-web health route", () => {
  it("returns ok status for the app", async () => {
    const response = GET();
    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: string; service: string };
    expect(body.status).toBe("ok");
    expect(body.service).toBe("storefront-web");
  });
});
