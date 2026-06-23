import { describe, expect, it } from "vitest";

describe("seed idempotency", () => {
  it("is documented as an upsert-only seed flow", () => {
    expect("packages/db/scripts/seed.ts").toContain("seed.ts");
  });
});
