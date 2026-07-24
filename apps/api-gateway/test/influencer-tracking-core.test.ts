import { describe, expect, it } from "vitest";
import {
  ATTRIBUTION_GRANT_VERSION,
  clampAttributionWindowDays,
  computeAttributionExpiry,
  computeAttributionMetrics,
  computeNetRevenueMinor,
  createSlidingWindowLimiter,
  generateTrackingToken,
  hashIdentifier,
  isBotUserAgent,
  isRapidRepeatClick,
  isValidInfluencerCode,
  isValidTrackingTokenFormat,
  isWithinAttributionWindow,
  normalizeInfluencerCode,
  reduceAttributionRevenue,
  resolveReferrerHost,
  resolveSafeTargetPath,
  sanitizeInternalPath,
  signAttributionGrant,
  verifyAttributionGrant,
  type AttributionGrantPayload,
} from "../src/influencers/tracking-core.js";

const SECRET = "test-session-secret-with-enough-length-1234";

function grant(overrides: Partial<AttributionGrantPayload> = {}): AttributionGrantPayload {
  return {
    v: ATTRIBUTION_GRANT_VERSION,
    storeId: "store_a",
    influencerId: "inf_1",
    campaignId: "camp_1",
    trackingLinkId: "link_1",
    clickId: "click_1",
    clickedAt: 1_000_000,
    expiresAt: 1_000_000 + 30 * 86_400_000,
    ...overrides,
  };
}

describe("token üretimi", () => {
  it("opak, tahmin-edilemez, geçerli biçim", () => {
    const a = generateTrackingToken();
    const b = generateTrackingToken();
    expect(a).not.toBe(b);
    expect(isValidTrackingTokenFormat(a)).toBe(true);
    expect(isValidTrackingTokenFormat(b)).toBe(true);
  });
  it("anlamlı-id taşımaz (sadece base64url karakterleri)", () => {
    expect(generateTrackingToken()).toMatch(/^[A-Za-z0-9_-]+$/);
  });
  it("geçersiz biçimleri reddeder", () => {
    expect(isValidTrackingTokenFormat("")).toBe(false);
    expect(isValidTrackingTokenFormat(null)).toBe(false);
    expect(isValidTrackingTokenFormat("short")).toBe(false);
    expect(isValidTrackingTokenFormat("has spaces here now")).toBe(false);
    expect(isValidTrackingTokenFormat("path/traversal/attempt")).toBe(false);
  });
});

describe("KVKK hash (ham PII saklamadan)", () => {
  it("deterministik + ham değeri döndürmez", () => {
    const h = hashIdentifier("1.2.3.4", SECRET);
    expect(h).not.toBeNull();
    expect(h).not.toContain("1.2.3.4");
    expect(hashIdentifier("1.2.3.4", SECRET)).toBe(h);
  });
  it("farklı secret → farklı hash", () => {
    expect(hashIdentifier("x", SECRET)).not.toBe(hashIdentifier("x", "başka-secret-uzun-uzun"));
  });
  it("boş/undefined → null", () => {
    expect(hashIdentifier("", SECRET)).toBeNull();
    expect(hashIdentifier(undefined, SECRET)).toBeNull();
    expect(hashIdentifier("   ", SECRET)).toBeNull();
  });
  it("referrer yalnız host tutar (path/query atılır)", () => {
    expect(resolveReferrerHost("https://insta.com/user/post?x=1")).toBe("insta.com");
    expect(resolveReferrerHost("not-a-url")).toBeNull();
    expect(resolveReferrerHost(null)).toBeNull();
  });
});

describe("bot tespiti", () => {
  it("bilinen bot/preview UA → true", () => {
    for (const ua of [
      "Googlebot/2.1",
      "facebookexternalhit/1.1",
      "curl/8.0",
      "python-requests/2.31",
      "HeadlessChrome/120",
      "WhatsApp/2.2",
    ]) {
      expect(isBotUserAgent(ua)).toBe(true);
    }
  });
  it("boş UA → bot", () => {
    expect(isBotUserAgent("")).toBe(true);
    expect(isBotUserAgent(undefined)).toBe(true);
  });
  it("gerçek tarayıcı → bot değil", () => {
    expect(
      isBotUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605 Safari/604"),
    ).toBe(false);
  });
});

describe("güvenli hedef yol (open-redirect yok)", () => {
  it("geçerli iç yollar korunur", () => {
    expect(resolveSafeTargetPath({ targetType: "PATH", targetPath: "/products/x" })).toBe("/products/x");
    expect(resolveSafeTargetPath({ targetType: "HOME", targetPath: "/" })).toBe("/");
    expect(sanitizeInternalPath("/c/shoes?ref=1")).toBe("/c/shoes?ref=1");
  });
  it("açık yönlendirme girişimleri fallback'e düşer", () => {
    expect(sanitizeInternalPath("//evil.com")).toBe("/");
    expect(sanitizeInternalPath("https://evil.com")).toBe("/");
    expect(sanitizeInternalPath("/\\evil.com")).toBe("/");
    expect(sanitizeInternalPath("javascript:alert(1)")).toBe("/");
    expect(sanitizeInternalPath("/a/../../etc")).toBe("/");
    expect(sanitizeInternalPath("")).toBe("/");
    expect(sanitizeInternalPath("relative/path")).toBe("/");
  });
});

describe("attribution grant (gateway-imzalı)", () => {
  it("imzala → doğrula round-trip", () => {
    const token = signAttributionGrant(grant(), SECRET);
    expect(verifyAttributionGrant(token, SECRET)).toEqual(grant());
  });
  it("kurcalanan payload reddedilir", () => {
    const token = signAttributionGrant(grant(), SECRET);
    const [body, sig] = token.split(".");
    const tamperedBody = Buffer.from(
      JSON.stringify(grant({ influencerId: "inf_ATTACKER" })),
      "utf8",
    ).toString("base64url");
    expect(verifyAttributionGrant(`${tamperedBody}.${sig}`, SECRET)).toBeNull();
    expect(verifyAttributionGrant(`${body}.deadbeef`, SECRET)).toBeNull();
  });
  it("farklı secret ile doğrulanamaz (cross-store/forge)", () => {
    const token = signAttributionGrant(grant(), SECRET);
    expect(verifyAttributionGrant(token, "farklı-secret-yeterince-uzun-xx")).toBeNull();
  });
  it("bozuk/eksik token → null (tolerans)", () => {
    expect(verifyAttributionGrant("", SECRET)).toBeNull();
    expect(verifyAttributionGrant("no-dot", SECRET)).toBeNull();
    expect(verifyAttributionGrant("a.", SECRET)).toBeNull();
    expect(verifyAttributionGrant(".b", SECRET)).toBeNull();
    expect(verifyAttributionGrant(null, SECRET)).toBeNull();
  });
  it("yanlış versiyon → null", () => {
    const token = signAttributionGrant(grant({ v: 99 }), SECRET);
    expect(verifyAttributionGrant(token, SECRET)).toBeNull();
  });
});

describe("attribution penceresi", () => {
  it("windowDays clamp", () => {
    expect(clampAttributionWindowDays(30)).toBe(30);
    expect(clampAttributionWindowDays(0)).toBe(1);
    expect(clampAttributionWindowDays(9999)).toBe(365);
    expect(clampAttributionWindowDays(undefined)).toBe(30);
    expect(clampAttributionWindowDays(7.9)).toBe(7);
  });
  it("expiry + within kontrolü", () => {
    const clicked = 1_000_000_000_000;
    const expires = computeAttributionExpiry(clicked, 7);
    expect(expires).toBe(clicked + 7 * 86_400_000);
    expect(isWithinAttributionWindow(clicked + 6 * 86_400_000, expires)).toBe(true);
    expect(isWithinAttributionWindow(expires, expires)).toBe(true);
    expect(isWithinAttributionWindow(expires + 1, expires)).toBe(false);
  });
});

describe("rapid-repeat dedupe", () => {
  it("pencere içi tekrar → dedupe (true)", () => {
    expect(isRapidRepeatClick(1_000_000, 1_000_000 + 60_000, 1800)).toBe(true);
  });
  it("pencere dışı → yeni satır (false)", () => {
    expect(isRapidRepeatClick(1_000_000, 1_000_000 + 1800_001, 1800)).toBe(false);
  });
  it("ilk tıklama (null) → her zaman kaydet", () => {
    expect(isRapidRepeatClick(null, 1_000_000)).toBe(false);
  });
});

describe("net gelir (append-only defter)", () => {
  it("net = gross - refunded", () => {
    expect(computeNetRevenueMinor(10000, 3000)).toBe(7000);
    expect(computeNetRevenueMinor(10000, 0)).toBe(10000);
  });
  it("tam iade → net 0", () => {
    expect(computeNetRevenueMinor(10000, 10000)).toBe(0);
  });
  it("aşırı iade gross'a clamp (net >= 0)", () => {
    expect(computeNetRevenueMinor(10000, 15000)).toBe(0);
  });
  it("defter idempotent: aynı refundKey iki kez → bir kez sayılır", () => {
    const state = reduceAttributionRevenue(10000, [
      { refundKey: "r1", amountMinor: 3000 },
      { refundKey: "r1", amountMinor: 3000 },
      { refundKey: "r2", amountMinor: 2000 },
    ]);
    expect(state.refundedRevenueMinor).toBe(5000);
    expect(state.netRevenueMinor).toBe(5000);
    expect(state.grossRevenueMinor).toBe(10000);
  });
  it("toplam iade gross'u aşamaz", () => {
    const state = reduceAttributionRevenue(10000, [
      { refundKey: "cancel:o1", amountMinor: 10000 },
      { refundKey: "extra", amountMinor: 5000 },
    ]);
    expect(state.refundedRevenueMinor).toBe(10000);
    expect(state.netRevenueMinor).toBe(0);
  });
});

describe("rapor metrikleri", () => {
  it("conversionRate + AOV", () => {
    const m = computeAttributionMetrics({
      totalClicks: 100,
      uniqueVisitors: 80,
      attributedOrders: 8,
      grossRevenueMinor: 160000,
      refundedRevenueMinor: 20000,
      netRevenueMinor: 140000,
    });
    expect(m.conversionRate).toBeCloseTo(0.1);
    expect(m.averageOrderValueMinor).toBe(20000);
  });
  it("payda 0 → 0 (bölme yok)", () => {
    const m = computeAttributionMetrics({
      totalClicks: 0,
      uniqueVisitors: 0,
      attributedOrders: 0,
      grossRevenueMinor: 0,
      refundedRevenueMinor: 0,
      netRevenueMinor: 0,
    });
    expect(m.conversionRate).toBe(0);
    expect(m.averageOrderValueMinor).toBe(0);
  });
});

describe("rate limiter (sliding window)", () => {
  it("limit aşımını engeller, pencere kayınca serbest bırakır", () => {
    const limiter = createSlidingWindowLimiter(2, 1000);
    expect(limiter.hit("ip1", 0)).toBe(true);
    expect(limiter.hit("ip1", 100)).toBe(true);
    expect(limiter.hit("ip1", 200)).toBe(false); // 3. istek pencere içinde → red
    expect(limiter.hit("ip2", 200)).toBe(true); // farklı anahtar bağımsız
    expect(limiter.hit("ip1", 1101)).toBe(true); // ilk iki hit pencereden çıktı
  });
});

describe("influencer code normalize", () => {
  it("locale-bağımsız uppercase + izinli karakter", () => {
    expect(normalizeInfluencerCode(" yaz-indirimi ")).toBe("YAZ-INDIRIMI");
    // TR-I tuzağı: locale-bağımsız — 'i'→'I' (Türkçe 'İ' DEĞİL); non-ASCII 'İ' allowlist dışı → atılır.
    expect(normalizeInfluencerCode("aiİ")).toBe("AI");
    expect(isValidInfluencerCode("YAZ-2026")).toBe(true);
    expect(isValidInfluencerCode("A")).toBe(false); // en az 2 karakter
    expect(isValidInfluencerCode("-BAD")).toBe(false); // baş harf alfanumerik
  });
});
