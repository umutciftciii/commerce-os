/**
 * C1 (post-audit) — Private media guard: encoded-path bypass savunması. Bu SAF sınıflandırıcı
 * fastifyStatic'e ulaşmadan çalışır; tüm encoding vektörleri (raw/%2F/%252F/%5C/mixed/malformed/
 * traversal) reddedilmeli, meşru public media geçmeli.
 */
import { describe, expect, it } from "vitest";
import { classifyMediaRequestPath } from "../src/media/private-guard.js";

describe("classifyMediaRequestPath (C1 private media guard)", () => {
  it("raw /returns/ path'i private (404)", () => {
    expect(classifyMediaRequestPath("/media/returns/abc123.webp")).toBe("private");
  });

  it("encoded slash %2F bypass'i private (ESKI AÇIK)", () => {
    expect(classifyMediaRequestPath("/media/returns%2Fabc123.webp")).toBe("private");
  });

  it("double-encoded %252F private", () => {
    expect(classifyMediaRequestPath("/media/returns%252Fabc123.webp")).toBe("private");
  });

  it("backslash %5C private", () => {
    expect(classifyMediaRequestPath("/media/returns%5Cabc123.webp")).toBe("private");
  });

  it("mixed-case %2f private", () => {
    expect(classifyMediaRequestPath("/media/returns%2fabc.webp")).toBe("private");
    expect(classifyMediaRequestPath("/media/ReTurNs/abc.webp")).toBe("private");
  });

  it("query string guard'ı atlatmaz", () => {
    expect(classifyMediaRequestPath("/media/returns%2Fabc.webp?w=100")).toBe("private");
  });

  it("path traversal malformed (400)", () => {
    expect(classifyMediaRequestPath("/media/../etc/passwd")).toBe("malformed");
    expect(classifyMediaRequestPath("/media/returns%2F..%2F..%2Fsecret")).toBe("malformed");
  });

  it("malformed percent encoding (400)", () => {
    expect(classifyMediaRequestPath("/media/returns%2Gx.webp")).toBe("malformed");
    expect(classifyMediaRequestPath("/media/%ZZ")).toBe("malformed");
  });

  it("kontrol/null karakter malformed", () => {
    expect(classifyMediaRequestPath("/media/returns%00.webp")).toBe("malformed");
  });

  it("meşru public media OK (regression)", () => {
    expect(classifyMediaRequestPath("/media/products/cover-abc.webp")).toBe("ok");
    expect(classifyMediaRequestPath("/media/category/x.png?v=2")).toBe("ok");
    expect(classifyMediaRequestPath("/media/hero/banner.jpg")).toBe("ok");
  });

  it("/media/ dışı istekler guard konusu değil (ok)", () => {
    expect(classifyMediaRequestPath("/stores/s1/returns/r1/attachments/a1")).toBe("ok");
    expect(classifyMediaRequestPath("/api/returns")).toBe("ok");
  });
});
