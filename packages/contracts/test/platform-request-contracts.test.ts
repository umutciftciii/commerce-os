import { describe, it, expect } from "vitest";
import {
  storePlatformRequestMessageSchema,
  storePlatformRequestMessageCreateRequestSchema,
  createStorePlatformRequestRequestSchema,
  platformRequestStatusRequestSchema,
  platformRequestMessageCreateRequestSchema,
  platformRequestCategoryCreateRequestSchema,
  platformRequestCategoryUpdateRequestSchema,
  platformUserDirectoryItemSchema,
  PLATFORM_REQUEST_UNASSIGNED_FILTER,
} from "../src/index.js";

describe("TODO-178 store-facing contracts never carry INTERNAL/visibility", () => {
  it("store message DTO has no visibility field (structurally store-safe)", () => {
    expect(Object.keys(storePlatformRequestMessageSchema.shape).sort()).toEqual(
      ["authorType", "body", "createdAt", "id"].sort(),
    );
    // an incoming object with a visibility key is stripped, never surfaced
    const parsed = storePlatformRequestMessageSchema.parse({
      id: "m1",
      authorType: "PLATFORM",
      body: "hi",
      createdAt: "2026-08-11T00:00:00.000Z",
      visibility: "INTERNAL",
    });
    expect("visibility" in parsed).toBe(false);
  });

  it("store reply request cannot carry a visibility (server forces STORE_VISIBLE)", () => {
    expect(Object.keys(storePlatformRequestMessageCreateRequestSchema.shape)).toEqual(["body"]);
  });

  it("store create requires category/subject/description; storeImpact optional advisory", () => {
    expect(
      createStorePlatformRequestRequestSchema.safeParse({
        categoryKey: "CANCELLATION_TAXONOMY",
        subject: "s",
        description: "d",
      }).success,
    ).toBe(true);
    expect(createStorePlatformRequestRequestSchema.safeParse({ subject: "s" }).success).toBe(false);
  });
});

describe("TODO-178 platform action contracts", () => {
  it("status request accepts CLOSED + closeReason and a plain transition without it", () => {
    expect(
      platformRequestStatusRequestSchema.safeParse({
        expectedVersion: 0,
        toStatus: "CLOSED",
        closeReason: "NOT_ACTIONABLE",
      }).success,
    ).toBe(true);
    expect(
      platformRequestStatusRequestSchema.safeParse({ expectedVersion: 2, toStatus: "IN_PROGRESS" })
        .success,
    ).toBe(true);
  });

  it("platform message requires an explicit visibility", () => {
    expect(
      platformRequestMessageCreateRequestSchema.safeParse({ body: "note", visibility: "INTERNAL" })
        .success,
    ).toBe(true);
    expect(platformRequestMessageCreateRequestSchema.safeParse({ body: "x" }).success).toBe(false);
  });

  it("TD-178-6: platform-user directory item carries only id/name/email/role (no sensitive fields)", () => {
    expect(Object.keys(platformUserDirectoryItemSchema.shape).sort()).toEqual(
      ["email", "id", "name", "role"].sort(),
    );
    // passwordHash / session must be stripped even if present on the input
    const parsed = platformUserDirectoryItemSchema.parse({
      id: "pu1",
      name: "Ada",
      email: "ada@ex.test",
      role: "SUPPORT_ADMIN",
      passwordHash: "SECRET",
    });
    expect("passwordHash" in parsed).toBe(false);
    expect(PLATFORM_REQUEST_UNASSIGNED_FILTER).toBe("__unassigned__");
  });

  it("category create enforces UPPER_SNAKE key; update omits the immutable key", () => {
    expect(
      platformRequestCategoryCreateRequestSchema.safeParse({
        key: "NEW_TYPE",
        labelTr: "Yeni",
        labelEn: "New",
      }).success,
    ).toBe(true);
    expect(
      platformRequestCategoryCreateRequestSchema.safeParse({
        key: "bad-key",
        labelTr: "x",
        labelEn: "y",
      }).success,
    ).toBe(false);
    expect("key" in platformRequestCategoryUpdateRequestSchema.shape).toBe(false);
  });
});
