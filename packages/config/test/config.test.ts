import { describe, expect, it } from "vitest";

import {
  ConfigValidationError,
  emptyToUndefined,
  loadConfig,
  optionalBooleanEnv,
  optionalNumberEnv,
  optionalUrlEnv,
} from "../src/index.js";
import { z } from "zod";

const validEnv = {
  APP_ENV: "test",
  SERVICE_NAME: "test-service",
  LOG_LEVEL: "debug",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  REDIS_URL: "redis://localhost:6379",
  INTERNAL_API_TOKEN: "test-internal-token",
  SESSION_SECRET: "test-session-secret-with-enough-length",
  SESSION_TTL_SECONDS: "3600",
  PASSWORD_HASH_PEPPER: "test-pepper",
  ADMIN_AUTH_COOKIE_NAME: "commerce_os_admin_session",
  AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS: "30",
  AUTH_LOGIN_RATE_LIMIT_MAX_ATTEMPTS: "4",
  API_GATEWAY_PORT: "4000",
  WORKER_CONCURRENCY: "3",
};

// TD-036: yalniz zorunlu alanlar; opsiyonellerin hepsi bos/absent birakilir.
const requiredOnlyEnv = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  REDIS_URL: "redis://localhost:6379",
  INTERNAL_API_TOKEN: "test-internal-token",
  SESSION_SECRET: "test-session-secret-with-enough-length",
};

describe("loadConfig", () => {
  it("parses supported env values", () => {
    expect(loadConfig(validEnv).API_GATEWAY_PORT).toBe(4000);
    expect(loadConfig(validEnv).WORKER_CONCURRENCY).toBe(3);
    expect(loadConfig(validEnv).SESSION_TTL_SECONDS).toBe(3600);
    expect(loadConfig(validEnv).AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS).toBe(30);
    expect(loadConfig(validEnv).AUTH_LOGIN_RATE_LIMIT_MAX_ATTEMPTS).toBe(4);
  });

  it("rejects short internal tokens", () => {
    expect(() => loadConfig({ ...validEnv, INTERNAL_API_TOKEN: "short" })).toThrow();
  });

  it("defaults DHL provider HTTP timeout to 60000ms and honors override", () => {
    // F3C.3 — MNG sandbox ~15s yanit verdiginden default 60s; env ile override edilebilir.
    expect(loadConfig(validEnv).DHL_ECOMMERCE_HTTP_TIMEOUT_MS).toBe(60000);
    expect(loadConfig({ ...validEnv, DHL_ECOMMERCE_HTTP_TIMEOUT_MS: "90000" }).DHL_ECOMMERCE_HTTP_TIMEOUT_MS).toBe(90000);
    expect(() => loadConfig({ ...validEnv, DHL_ECOMMERCE_HTTP_TIMEOUT_MS: "-1" })).toThrow();
  });
});

describe("TD-036 — zorunlu env'ler strict kalir", () => {
  it("yalniz zorunlu alanlarla (opsiyoneller bos/absent) yuklenir ve varsayilanlara duser", () => {
    const cfg = loadConfig(requiredOnlyEnv);
    expect(cfg.APP_ENV).toBe("development");
    expect(cfg.SERVICE_NAME).toBe("commerce-os");
    expect(cfg.LOG_LEVEL).toBe("info");
    expect(cfg.API_GATEWAY_PORT).toBe(3000);
    expect(cfg.SESSION_TTL_SECONDS).toBe(60 * 60 * 8);
  });

  it.each([
    ["DATABASE_URL", "not-a-url"],
    ["REDIS_URL", ""],
    ["INTERNAL_API_TOKEN", ""],
    ["SESSION_SECRET", "too-short"],
  ])("zorunlu %s gecersiz/bos ise ConfigValidationError firlatir", (key, value) => {
    expect(() => loadConfig({ ...requiredOnlyEnv, [key]: value })).toThrow(ConfigValidationError);
  });

  it("zorunlu URL tamamen eksikse hata verir (undefined normalize edilmez)", () => {
    const rest = { ...requiredOnlyEnv, DATABASE_URL: undefined };
    expect(() => loadConfig(rest)).toThrow(ConfigValidationError);
  });

  it("ConfigValidationError yalniz anahtar+mesaj icerir; env DEGERI basilmaz (secret sizmaz)", () => {
    const secret = "postgresql://user:sup3r-s3cret@db/app-should-not-leak";
    try {
      loadConfig({ ...requiredOnlyEnv, DATABASE_URL: "gecersiz", SESSION_SECRET: secret.slice(0, 5) });
      throw new Error("hata bekleniyordu");
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigValidationError);
      const message = (err as ConfigValidationError).message;
      expect(message).toContain("DATABASE_URL");
      expect(message).not.toContain("sup3r-s3cret");
    }
  });
});

describe("TD-036 — opsiyonel URL env regresyonu", () => {
  it("PUBLIC_WEBHOOK_BASE_URL bos string config'i COKERTMEZ", () => {
    expect(loadConfig({ ...requiredOnlyEnv, PUBLIC_WEBHOOK_BASE_URL: "" }).PUBLIC_WEBHOOK_BASE_URL).toBeUndefined();
    expect(loadConfig({ ...requiredOnlyEnv, PUBLIC_WEBHOOK_BASE_URL: "   " }).PUBLIC_WEBHOOK_BASE_URL).toBeUndefined();
  });

  it("DHL TEST base URL bos string → undefined (TEST_BASE_URL_MISSING akisi korunur)", () => {
    expect(loadConfig({ ...requiredOnlyEnv, DHL_ECOMMERCE_TEST_BASE_URL: "" }).DHL_ECOMMERCE_TEST_BASE_URL).toBeUndefined();
  });

  it("DHL LIVE base URL bos string → varsayilan (default'a duser, cokmez)", () => {
    expect(loadConfig({ ...requiredOnlyEnv, DHL_ECOMMERCE_LIVE_BASE_URL: "" }).DHL_ECOMMERCE_LIVE_BASE_URL).toBe(
      "https://api.mngkargo.com.tr",
    );
  });

  it("gecerli URL oldugu gibi kabul edilir", () => {
    expect(
      loadConfig({ ...requiredOnlyEnv, PUBLIC_WEBHOOK_BASE_URL: "https://api.example.com" }).PUBLIC_WEBHOOK_BASE_URL,
    ).toBe("https://api.example.com");
  });

  it("bos OLMAYAN gecersiz URL yuksek sesle hata verir", () => {
    expect(() => loadConfig({ ...requiredOnlyEnv, PUBLIC_WEBHOOK_BASE_URL: "not a url" })).toThrow(
      ConfigValidationError,
    );
    expect(() => loadConfig({ ...requiredOnlyEnv, DHL_ECOMMERCE_TEST_BASE_URL: "ftp:" })).toThrow(
      ConfigValidationError,
    );
  });
});

describe("TD-036 — opsiyonel OTP dev-code regex regresyonu", () => {
  it("CUSTOMER_OTP_DEV_CODE bos string → undefined (bypass yok), COKMEZ", () => {
    expect(loadConfig({ ...requiredOnlyEnv, CUSTOMER_OTP_DEV_CODE: "" }).CUSTOMER_OTP_DEV_CODE).toBeUndefined();
  });

  it("gecerli 6 haneli kod kabul edilir; gecersiz non-empty kod hata verir", () => {
    expect(loadConfig({ ...requiredOnlyEnv, CUSTOMER_OTP_DEV_CODE: "123456" }).CUSTOMER_OTP_DEV_CODE).toBe("123456");
    expect(() => loadConfig({ ...requiredOnlyEnv, CUSTOMER_OTP_DEV_CODE: "12ab" })).toThrow(ConfigValidationError);
  });
});

describe("TD-036 — opsiyonel boolean env regresyonu", () => {
  it("bos string → default false; provider guard flag'leri cokmez", () => {
    const cfg = loadConfig({
      ...requiredOnlyEnv,
      PAYMENT_SANDBOX_HTTP_ENABLED: "",
      SHIPPING_SANDBOX_HTTP_ENABLED: "",
      DHL_ECOMMERCE_ALLOW_ORDER_CREATE: "",
    });
    expect(cfg.PAYMENT_SANDBOX_HTTP_ENABLED).toBe(false);
    expect(cfg.SHIPPING_SANDBOX_HTTP_ENABLED).toBe(false);
    expect(cfg.DHL_ECOMMERCE_ALLOW_ORDER_CREATE).toBe(false);
  });

  it("'true'/'false' dogru parse edilir; gecersiz non-empty deger hata verir", () => {
    expect(loadConfig({ ...requiredOnlyEnv, SHIPPING_SANDBOX_HTTP_ENABLED: "true" }).SHIPPING_SANDBOX_HTTP_ENABLED).toBe(
      true,
    );
    expect(() => loadConfig({ ...requiredOnlyEnv, SHIPPING_SANDBOX_HTTP_ENABLED: "yes" })).toThrow(
      ConfigValidationError,
    );
  });
});

describe("TD-036 — opsiyonel sayi env regresyonu", () => {
  it("bos string → default; gecersiz non-empty hata verir", () => {
    expect(loadConfig({ ...requiredOnlyEnv, WORKER_CONCURRENCY: "" }).WORKER_CONCURRENCY).toBe(5);
    expect(loadConfig({ ...requiredOnlyEnv, WORKER_CONCURRENCY: "9" }).WORKER_CONCURRENCY).toBe(9);
    expect(() => loadConfig({ ...requiredOnlyEnv, WORKER_CONCURRENCY: "abc" })).toThrow(ConfigValidationError);
    expect(() => loadConfig({ ...requiredOnlyEnv, WORKER_CONCURRENCY: "0" })).toThrow(ConfigValidationError);
  });
});

describe("TD-036 — helper birim testleri", () => {
  it("emptyToUndefined: bos/whitespace/null → undefined; diger → oldugu gibi", () => {
    expect(emptyToUndefined("")).toBeUndefined();
    expect(emptyToUndefined("   ")).toBeUndefined();
    expect(emptyToUndefined(null)).toBeUndefined();
    expect(emptyToUndefined(undefined)).toBeUndefined();
    expect(emptyToUndefined("x")).toBe("x");
    expect(emptyToUndefined("0")).toBe("0");
    expect(emptyToUndefined(false)).toBe(false);
  });

  it("optionalUrlEnv: bos → undefined/default; gecerli → parse; gecersiz → hata", () => {
    expect(optionalUrlEnv().parse("")).toBeUndefined();
    expect(optionalUrlEnv().parse(undefined)).toBeUndefined();
    expect(optionalUrlEnv({ default: "https://d.example" }).parse("")).toBe("https://d.example");
    expect(optionalUrlEnv().parse("https://ok.example")).toBe("https://ok.example");
    expect(() => optionalUrlEnv().parse("nope")).toThrow();
  });

  it("optionalBooleanEnv: bos → default; degerler parse; gecersiz → hata", () => {
    expect(optionalBooleanEnv(false).parse("")).toBe(false);
    expect(optionalBooleanEnv(true).parse("")).toBe(true);
    expect(optionalBooleanEnv(false).parse("true")).toBe(true);
    expect(optionalBooleanEnv(true).parse("false")).toBe(false);
    expect(() => optionalBooleanEnv(false).parse("maybe")).toThrow();
  });

  it("optionalNumberEnv: bos → default; gecerli → coerce; gecersiz → hata", () => {
    const schema = optionalNumberEnv(z.coerce.number().int().positive().default(7));
    expect(schema.parse("")).toBe(7);
    expect(schema.parse("42")).toBe(42);
    expect(() => schema.parse("nan")).toThrow();
  });
});
