import { describe, expect, it } from "vitest";
import { NextResponse } from "next/server";
import { safeInternalPath } from "../lib/safe-path";
import { setSessionCookie, clearSessionCookie, SESSION_COOKIE_NAME } from "../lib/server/session";
import { setCsrfCookie, clearCsrfCookie, CSRF_COOKIE_NAME } from "../lib/server/csrf";

/**
 * ADR-271 — güvenli returnTo (open-redirect savunması) + cookie kalıcılık kuralları.
 */
describe("safeInternalPath (open-redirect defence)", () => {
  it("accepts same-origin relative paths", () => {
    expect(safeInternalPath("/stores/42")).toBe("/stores/42");
    expect(safeInternalPath("/a?b=1#c")).toBe("/a?b=1#c");
  });
  it("rejects external / protocol-relative / scheme URLs → fallback", () => {
    expect(safeInternalPath("https://evil.com")).toBe("/");
    expect(safeInternalPath("//evil.com")).toBe("/");
    expect(safeInternalPath("javascript:alert(1)")).toBe("/");
    expect(safeInternalPath("/%2F%2Fevil.com")).toBe("/");
    expect(safeInternalPath("/\\evil.com")).toBe("/");
  });
  it("rejects nullish/empty/non-slash and /login loop", () => {
    expect(safeInternalPath(null)).toBe("/");
    expect(safeInternalPath("relative")).toBe("/");
    expect(safeInternalPath("/login")).toBe("/");
    expect(safeInternalPath("/login/foo")).toBe("/");
  });
});

describe("session cookie persistence (ADR-271)", () => {
  const future = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();

  it("rememberMe=false → session cookie (no Expires/Max-Age)", () => {
    const res = NextResponse.json({ ok: true });
    setSessionCookie(res, "tok", future, false);
    const cookie = res.cookies.get("commerce_os_admin_session");
    expect(cookie?.value).toBe("tok");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.expires).toBeUndefined();
    expect(cookie?.maxAge).toBeUndefined();
  });

  it("rememberMe=true → persistent cookie with Expires from gateway absolute deadline", () => {
    const res = NextResponse.json({ ok: true });
    setSessionCookie(res, "tok", future, true);
    const cookie = res.cookies.get("commerce_os_admin_session");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.expires).toBeInstanceOf(Date);
    expect((cookie?.expires as Date).toISOString()).toBe(future);
  });

  it("clear → httpOnly maxAge 0", () => {
    const res = NextResponse.json({ ok: true });
    clearSessionCookie(res);
    const cookie = res.cookies.get("commerce_os_admin_session");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.maxAge).toBe(0);
  });
});

describe("S5 — cookie set/clear security parity", () => {
  const future = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();

  it("session cookie: set ve clear AYNI secure/sameSite/path", () => {
    const setRes = NextResponse.json({ ok: true });
    setSessionCookie(setRes, "tok", future, true);
    const clearRes = NextResponse.json({ ok: true });
    clearSessionCookie(clearRes);
    const s = setRes.cookies.get(SESSION_COOKIE_NAME);
    const c = clearRes.cookies.get(SESSION_COOKIE_NAME);
    expect(c?.secure).toBe(s?.secure);
    expect(c?.sameSite).toBe(s?.sameSite);
    expect(c?.path).toBe(s?.path);
    expect(c?.httpOnly).toBe(s?.httpOnly);
  });

  it("CSRF cookie: set ve clear AYNI secure/sameSite/path (S4 temizlik + S5 parity)", () => {
    const setRes = NextResponse.json({ ok: true });
    setCsrfCookie(setRes, "csrf-token");
    const clearRes = NextResponse.json({ ok: true });
    clearCsrfCookie(clearRes);
    const s = setRes.cookies.get(CSRF_COOKIE_NAME);
    const c = clearRes.cookies.get(CSRF_COOKIE_NAME);
    expect(c?.secure).toBe(s?.secure);
    expect(c?.sameSite).toBe(s?.sameSite);
    expect(c?.path).toBe(s?.path);
    expect(c?.maxAge).toBe(0);
  });

  it("test ortamında (NODE_ENV!=production) secure=false — localhost http çalışır", () => {
    const res = NextResponse.json({ ok: true });
    setSessionCookie(res, "tok", future, false);
    expect(res.cookies.get(SESSION_COOKIE_NAME)?.secure).toBe(false);
  });
});
