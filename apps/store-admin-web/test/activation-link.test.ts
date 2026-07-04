import { afterEach, describe, expect, it } from "vitest";
import type { StoreAdminCredentialSetup } from "@commerce-os/api-client";
import { buildActivationLink } from "../lib/server/activation-link.js";

/** Minimal setup payload; token yalniz linke gomulur, DB/log'a yazilmaz. */
const setup: StoreAdminCredentialSetup = {
  token: "raw-token-123",
  purpose: "ADMIN_ACTIVATION",
  expiresAt: "2026-07-05T00:00:00.000Z",
};

describe("buildActivationLink — STOREFRONT_BASE_URL (TD-038)", () => {
  const KEY = "STOREFRONT_BASE_URL";
  const original = process.env[KEY];
  afterEach(() => {
    if (original === undefined) delete process.env[KEY];
    else process.env[KEY] = original;
  });

  const expectedPath = `/auth/activate?token=${encodeURIComponent(setup.token)}`;

  it("returns a relative path when the base url is unset", () => {
    delete process.env[KEY];
    expect(buildActivationLink(setup).link).toBe(expectedPath);
  });

  it("returns a relative path when the base url is an empty string", () => {
    process.env[KEY] = "";
    expect(buildActivationLink(setup).link).toBe(expectedPath);
  });

  it("returns a relative path (not a broken blank url) for whitespace-only base", () => {
    process.env[KEY] = "   ";
    const { link } = buildActivationLink(setup);
    expect(link).toBe(expectedPath);
    expect(link.startsWith(" ")).toBe(false);
  });

  it("builds an absolute url when a non-empty base is set, trimming trailing slashes", () => {
    process.env[KEY] = "https://shop.example.com/";
    expect(buildActivationLink(setup).link).toBe(`https://shop.example.com${expectedPath}`);
  });
});
