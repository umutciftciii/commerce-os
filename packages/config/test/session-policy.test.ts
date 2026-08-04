import { describe, expect, it } from "vitest";

import {
  DEFAULT_SESSION_POLICY,
  assertActivityThrottleSeconds,
  computeSessionExpiry,
  cookieMaxAgeSeconds,
  effectiveAbsolute,
  idleDeadline,
  isLegacySession,
  isSessionValid,
  loadConfig,
  resolveSessionPolicy,
  safeReturnTo,
  sessionDeadline,
  sessionTiming,
  shouldBumpActivity,
  windowFor,
  type SessionLifetimeFields,
  type SessionPolicy,
} from "../src/index.js";

const P = DEFAULT_SESSION_POLICY;
const T0 = new Date("2026-08-04T10:00:00.000Z");
const at = (base: Date, seconds: number) => new Date(base.getTime() + seconds * 1000);

function session(overrides: Partial<SessionLifetimeFields> = {}): SessionLifetimeFields {
  return {
    lastActivityAt: T0,
    absoluteExpiresAt: at(T0, 8 * 60 * 60),
    expiresAt: at(T0, 8 * 60 * 60),
    rememberMe: false,
    revokedAt: null,
    ...overrides,
  };
}

describe("ADR-271 policy table", () => {
  it("remember-off: idle 30m / absolute 8h", () => {
    expect(windowFor(P, false)).toEqual({ idleTimeoutSeconds: 1800, absoluteExpirySeconds: 28800 });
  });
  it("remember-on: idle 7d / absolute 30d", () => {
    expect(windowFor(P, true)).toEqual({ idleTimeoutSeconds: 604800, absoluteExpirySeconds: 2592000 });
  });
});

describe("computeSessionExpiry", () => {
  it("remember-off windows and expiresAt mirrors absolute", () => {
    const r = computeSessionExpiry(P, false, T0);
    expect(r.idleExpiresAt).toEqual(at(T0, 1800));
    expect(r.absoluteExpiresAt).toEqual(at(T0, 28800));
    expect(r.expiresAt).toEqual(r.absoluteExpiresAt);
  });
  it("remember-on windows", () => {
    const r = computeSessionExpiry(P, true, T0);
    expect(r.idleExpiresAt).toEqual(at(T0, 604800));
    expect(r.absoluteExpiresAt).toEqual(at(T0, 2592000));
  });
});

describe("effectiveAbsolute (safe-additive fallback)", () => {
  it("uses absoluteExpiresAt when present", () => {
    expect(effectiveAbsolute({ absoluteExpiresAt: at(T0, 100), expiresAt: at(T0, 200) })).toEqual(at(T0, 100));
  });
  it("falls back to expiresAt when absolute is null (pre-ADR-271 rows)", () => {
    expect(effectiveAbsolute({ absoluteExpiresAt: null, expiresAt: at(T0, 200) })).toEqual(at(T0, 200));
  });
});

describe("idleDeadline + sessionDeadline", () => {
  it("idle deadline = lastActivityAt + idle timeout", () => {
    expect(idleDeadline(P, { lastActivityAt: T0, rememberMe: false })).toEqual(at(T0, 1800));
  });
  it("session deadline is the earlier of idle vs absolute", () => {
    // fresh: idle (30m) is earlier than absolute (8h)
    expect(sessionDeadline(P, session())).toEqual(at(T0, 1800));
    // near absolute: absolute wins when idle would exceed it
    const near = session({ lastActivityAt: at(T0, 8 * 60 * 60 - 60) });
    expect(sessionDeadline(P, near)).toEqual(at(T0, 8 * 60 * 60));
  });
});

describe("S3 activity throttle footgun", () => {
  it("0 reddedilir (her ortamda footgun)", () => {
    expect(() => assertActivityThrottleSeconds(0, false)).toThrow();
    expect(() => assertActivityThrottleSeconds(0, true)).toThrow();
  });
  it("negatif / tamsayı-olmayan reddedilir", () => {
    expect(() => assertActivityThrottleSeconds(-5, false)).toThrow();
    expect(() => assertActivityThrottleSeconds(12.5, false)).toThrow();
  });
  it("production'da 1–29 reddedilir", () => {
    expect(() => assertActivityThrottleSeconds(1, true)).toThrow(/production/i);
    expect(() => assertActivityThrottleSeconds(29, true)).toThrow(/production/i);
  });
  it("production'da 30 kabul edilir", () => {
    expect(assertActivityThrottleSeconds(30, true)).toBe(30);
    expect(assertActivityThrottleSeconds(300, true)).toBe(300);
  });
  it("dev/test'te kısa değer (1–29) kabul edilir (test override)", () => {
    expect(assertActivityThrottleSeconds(1, false)).toBe(1);
    expect(assertActivityThrottleSeconds(5, false)).toBe(5);
  });

  // loadConfig zorunlu env'leri (DATABASE_URL/REDIS_URL/INTERNAL_API_TOKEN/SESSION_SECRET) ister.
  const baseEnv = {
    DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
    REDIS_URL: "redis://localhost:6379",
    INTERNAL_API_TOKEN: "test-internal-token-0123456789",
    SESSION_SECRET: "test-session-secret-0123456789abcdef",
  };
  it("loadConfig: unset → default 300", () => {
    const c = loadConfig({ ...baseEnv, NODE_ENV: "test" } as NodeJS.ProcessEnv);
    expect(c.SESSION_ACTIVITY_THROTTLE_SECONDS).toBe(300);
  });
  it("loadConfig: 0 reddedilir (parser fail-fast)", () => {
    expect(() =>
      loadConfig({ ...baseEnv, NODE_ENV: "test", SESSION_ACTIVITY_THROTTLE_SECONDS: "0" } as NodeJS.ProcessEnv),
    ).toThrow(/SESSION_ACTIVITY_THROTTLE_SECONDS/);
  });
  it("loadConfig: production + 5 reddedilir (test override production'a sızamaz)", () => {
    expect(() =>
      loadConfig({ ...baseEnv, NODE_ENV: "production", SESSION_ACTIVITY_THROTTLE_SECONDS: "5" } as NodeJS.ProcessEnv),
    ).toThrow(/SESSION_ACTIVITY_THROTTLE_SECONDS/);
  });
  it("loadConfig: test + 5 kabul edilir", () => {
    const c = loadConfig({ ...baseEnv, NODE_ENV: "test", SESSION_ACTIVITY_THROTTLE_SECONDS: "5" } as NodeJS.ProcessEnv);
    expect(c.SESSION_ACTIVITY_THROTTLE_SECONDS).toBe(5);
  });
  it("loadConfig: production + 300 (default) kabul edilir", () => {
    const c = loadConfig({ ...baseEnv, NODE_ENV: "production" } as NodeJS.ProcessEnv);
    expect(c.SESSION_ACTIVITY_THROTTLE_SECONDS).toBe(300);
  });
});

describe("M1 legacy cutover (policyVersion)", () => {
  it("isLegacySession: yalniz policyVersion===0 legacy", () => {
    expect(isLegacySession({ policyVersion: 0 })).toBe(true);
    expect(isLegacySession({ policyVersion: 1 })).toBe(false);
    expect(isLegacySession({ policyVersion: undefined })).toBe(false); // native varsayilan
  });

  it("legacy: idle capasi cok eski OLSA BILE absolute icinde GECERLI (silent logout YOK)", () => {
    // lastActivityAt 2 saat once (native remember-off idle 30dk'yi COK asar), absolute 8 saat.
    const legacy = session({ policyVersion: 0, lastActivityAt: at(T0, -2 * 60 * 60) });
    expect(isSessionValid(P, legacy, T0)).toBe(true);
    // Karsit: ayni satir native (v1) olsaydi idle ile GECERSIZ olurdu.
    const native = session({ policyVersion: 1, lastActivityAt: at(T0, -2 * 60 * 60) });
    expect(isSessionValid(P, native, T0)).toBe(false);
  });

  it("legacy: absolute tavani ASAMAZ (grandfather sinirsiz omur URETMEZ)", () => {
    const legacy = session({ policyVersion: 0, lastActivityAt: at(T0, -2 * 60 * 60) });
    // absolute = T0+8h; onu 1sn asinca GECERSIZ.
    expect(isSessionValid(P, legacy, at(T0, 8 * 60 * 60 + 1))).toBe(false);
    expect(sessionDeadline(P, legacy)).toEqual(effectiveAbsolute(legacy));
  });

  it("legacy timing: idleExpiresAt absolute'u yansitir (erken uyari YOK)", () => {
    const legacy = session({ policyVersion: 0, lastActivityAt: at(T0, -2 * 60 * 60) });
    const t = sessionTiming(P, legacy);
    expect(t.idleExpiresAt).toEqual(t.absoluteExpiresAt);
  });
});

describe("isSessionValid", () => {
  it("valid within idle window", () => {
    expect(isSessionValid(P, session(), at(T0, 60))).toBe(true);
  });
  it("expired by idle (remember-off, >30m inactive)", () => {
    expect(isSessionValid(P, session(), at(T0, 1801))).toBe(false);
  });
  it("expired by absolute even if idle refreshed at the ceiling", () => {
    const s = session({ lastActivityAt: at(T0, 8 * 60 * 60) });
    expect(isSessionValid(P, s, at(T0, 8 * 60 * 60 + 1))).toBe(false);
  });
  it("revoked is always invalid", () => {
    expect(isSessionValid(P, session({ revokedAt: T0 }), T0)).toBe(false);
  });
  it("remember-on stays valid for days of idle", () => {
    const s = session({
      rememberMe: true,
      absoluteExpiresAt: at(T0, 30 * 24 * 60 * 60),
      expiresAt: at(T0, 30 * 24 * 60 * 60),
    });
    expect(isSessionValid(P, s, at(T0, 6 * 24 * 60 * 60))).toBe(true);
    expect(isSessionValid(P, s, at(T0, 7 * 24 * 60 * 60 + 1))).toBe(false);
  });
  it("null absolute (pre-migration row) uses expiresAt as ceiling", () => {
    const s = session({ absoluteExpiresAt: null });
    expect(isSessionValid(P, s, at(T0, 60))).toBe(true);
  });
});

describe("shouldBumpActivity (write throttle)", () => {
  it("no write before throttle window elapses", () => {
    expect(shouldBumpActivity(P, T0, at(T0, 299))).toBe(false);
  });
  it("write after throttle window", () => {
    expect(shouldBumpActivity(P, T0, at(T0, 300))).toBe(true);
  });
});

describe("cookieMaxAgeSeconds", () => {
  it("remember-off → null (session cookie)", () => {
    expect(cookieMaxAgeSeconds(P, false)).toBeNull();
  });
  it("remember-on → absolute window (30d)", () => {
    expect(cookieMaxAgeSeconds(P, true)).toBe(2592000);
  });
});

describe("safeReturnTo (open-redirect defence)", () => {
  const FB = "/account";
  it("accepts same-origin relative path", () => {
    expect(safeReturnTo("/orders/42", FB)).toBe("/orders/42");
    expect(safeReturnTo("/a?b=1#c", FB)).toBe("/a?b=1#c");
  });
  it("rejects external / protocol-relative / scheme URLs", () => {
    expect(safeReturnTo("https://evil.com", FB)).toBe(FB);
    expect(safeReturnTo("//evil.com", FB)).toBe(FB);
    expect(safeReturnTo("http:/evil", FB)).toBe(FB);
    expect(safeReturnTo("javascript:alert(1)", FB)).toBe(FB);
  });
  it("rejects backslash and encoded tricks", () => {
    expect(safeReturnTo("/\\evil.com", FB)).toBe(FB);
    expect(safeReturnTo("/%2F%2Fevil.com", FB)).toBe(FB);
    expect(safeReturnTo("/%09/evil", FB)).toBe(FB); // encoded tab (control char)
  });
  it("rejects empty / nullish", () => {
    expect(safeReturnTo(null, FB)).toBe(FB);
    expect(safeReturnTo(undefined, FB)).toBe(FB);
    expect(safeReturnTo("   ", FB)).toBe(FB);
    expect(safeReturnTo("relative-no-slash", FB)).toBe(FB);
  });
  it("blocks auth/login/logout loop prefixes", () => {
    expect(safeReturnTo("/login", FB, ["/login", "/auth"])).toBe(FB);
    expect(safeReturnTo("/auth/logout", FB, ["/auth"])).toBe(FB);
    expect(safeReturnTo("/authorized", FB, ["/auth"])).toBe("/authorized"); // prefix must be a path segment
  });
});

describe("resolveSessionPolicy env overrides", () => {
  const baseConfig = {
    SESSION_IDLE_TIMEOUT_SECONDS: 60,
    SESSION_ABSOLUTE_EXPIRY_SECONDS: 120,
    SESSION_REMEMBER_IDLE_TIMEOUT_SECONDS: 600,
    SESSION_REMEMBER_ABSOLUTE_EXPIRY_SECONDS: 1200,
    SESSION_WARNING_LEAD_SECONDS: 20,
    SESSION_ACTIVITY_THROTTLE_SECONDS: 10,
  } as unknown as Parameters<typeof resolveSessionPolicy>[0];
  it("maps env to a policy object", () => {
    const p: SessionPolicy = resolveSessionPolicy(baseConfig);
    expect(p.rememberOff).toEqual({ idleTimeoutSeconds: 60, absoluteExpirySeconds: 120 });
    expect(p.rememberOn).toEqual({ idleTimeoutSeconds: 600, absoluteExpirySeconds: 1200 });
    expect(p.warningLeadSeconds).toBe(20);
    expect(p.activityThrottleSeconds).toBe(10);
  });
});
