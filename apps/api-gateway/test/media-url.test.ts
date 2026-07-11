import { describe, expect, it } from "vitest";

import { resolveMediaUrl } from "../src/media/url.js";

const KEY = "stores/store_123/products/abc-uuid.webp";

describe("resolveMediaUrl", () => {
  it("base URL verildiginde tam URL uretir", () => {
    expect(resolveMediaUrl("https://cdn.magaza.com", KEY)).toBe(
      "https://cdn.magaza.com/stores/store_123/products/abc-uuid.webp",
    );
  });

  it("base URL undefined ise /media/ ile goreli yol uretir", () => {
    expect(resolveMediaUrl(undefined, KEY)).toBe("/media/stores/store_123/products/abc-uuid.webp");
  });

  it("base URL bos string ise /media/ ile goreli yol uretir", () => {
    expect(resolveMediaUrl("", KEY)).toBe("/media/stores/store_123/products/abc-uuid.webp");
  });

  it("base URL'deki sondaki slash normalize edilir (cift slash yok)", () => {
    expect(resolveMediaUrl("https://cdn.magaza.com/", KEY)).toBe(
      "https://cdn.magaza.com/stores/store_123/products/abc-uuid.webp",
    );
  });

  it("birden fazla sondaki slash de normalize edilir", () => {
    expect(resolveMediaUrl("https://cdn.magaza.com///", KEY)).toBe(
      "https://cdn.magaza.com/stores/store_123/products/abc-uuid.webp",
    );
  });

  it("alt-yol iceren base URL (CDN + prefix) korunur", () => {
    expect(resolveMediaUrl("https://cdn.magaza.com/assets", KEY)).toBe(
      "https://cdn.magaza.com/assets/stores/store_123/products/abc-uuid.webp",
    );
  });
});
