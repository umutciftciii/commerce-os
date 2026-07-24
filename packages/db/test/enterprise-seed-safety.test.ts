/**
 * Enterprise Demo Seed — YIKICI RESET GÜVENLİK GUARD testleri (ADR-108 / TD-159G).
 *
 * 2026-07-23 veri kaybı olayına (elle `prisma db push` → tüm katalog silindi) yanıt.
 * Guard'lar SAF fonksiyonlardır → DB'siz, deterministik test edilir. Ayrıca persist.mjs
 * kaynağı üzerinde statik invariant: sipariş/müşteri/ödeme verisi ASLA silinmez ve wipe
 * yalnız store-scope'ludur.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
// @ts-expect-error — .mjs saf güvenlik modülü (runtime import).
import {
  assertScopeSlug,
  assertSafeDatabaseEnvironment,
  assertDestructiveResetAllowed,
  parseDatabaseUrl,
  DESTRUCTIVE_RESET_FLAG,
  ANY_DB_OVERRIDE_FLAG,
  DESTRUCTIVE_ROW_THRESHOLD,
} from "../scripts/enterprise/safety.mjs";
// @ts-expect-error — .mjs sabitler.
import { PROTECTED_STORE_SLUGS } from "../scripts/enterprise/constants.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SAFE_DB = "postgresql://commerce_os:commerce_os_password@postgres:5432/commerce_os?schema=public";

describe("store-scope guard", () => {
  it("doğru slug (enterprise-demo) geçer", () => {
    expect(() => assertScopeSlug("enterprise-demo", PROTECTED_STORE_SLUGS)).not.toThrow();
  });
  it("yanlış store slug → fail", () => {
    expect(() => assertScopeSlug("demo-store", PROTECTED_STORE_SLUGS)).toThrow(/enterprise-demo/);
    expect(() => assertScopeSlug("acme-prod", PROTECTED_STORE_SLUGS)).toThrow(/enterprise-demo/);
  });
  it("korumalı store slug seti demo-store içerir (üretim seed izolasyonu)", () => {
    expect(PROTECTED_STORE_SLUGS.has("demo-store")).toBe(true);
  });
});

describe("environment guard", () => {
  it("yerel docker DB (host=postgres) geçer", () => {
    expect(() => assertSafeDatabaseEnvironment(SAFE_DB, {})).not.toThrow();
  });
  it("localhost geçer (allowlist host)", () => {
    expect(() =>
      assertSafeDatabaseEnvironment("postgresql://u:p@localhost:5432/commerce_os", {}),
    ).not.toThrow();
  });
  it("production-like DB (RDS host) → fail", () => {
    expect(() =>
      assertSafeDatabaseEnvironment(
        "postgresql://u:p@commerce-prod.abc123.eu-central-1.rds.amazonaws.com:5432/commerce_os",
        {},
      ),
    ).toThrow(/REDDEDİLDİ|üretim/i);
  });
  it("DB adında 'prod' işareti → fail", () => {
    expect(() =>
      assertSafeDatabaseEnvironment("postgresql://u:p@localhost:5432/commerce_prod", {}),
    ).toThrow();
  });
  it("staging işareti → fail", () => {
    expect(() =>
      assertSafeDatabaseEnvironment("postgresql://u:p@db.staging.internal:5432/commerce_os", {}),
    ).toThrow();
  });
  it("bilinmeyen host (localhost DEĞİL) → fail — localhost tek başına güvenli değil kuralı", () => {
    expect(() =>
      assertSafeDatabaseEnvironment("postgresql://u:p@10.0.3.14:5432/commerce_os", {}),
    ).toThrow(/allowlist/i);
  });
  it("DATABASE_URL tanımsız → fail", () => {
    expect(() => assertSafeDatabaseEnvironment(undefined, {})).toThrow(/tanımsız/);
  });
  it("açık override flag ile bilinmeyen host geçer (bilinçli kaçış)", () => {
    expect(() =>
      assertSafeDatabaseEnvironment("postgresql://u:p@10.0.3.14:5432/commerce_os", {
        [ANY_DB_OVERRIDE_FLAG]: "true",
      }),
    ).not.toThrow();
  });
  it("parseDatabaseUrl host+db çıkarır", () => {
    expect(parseDatabaseUrl(SAFE_DB)).toEqual({ host: "postgres", database: "commerce_os" });
    expect(parseDatabaseUrl("garbage")).toEqual({ host: null, database: null });
  });
});

describe("row-count circuit breaker", () => {
  it("ilk seed (0 ürün) flag'siz serbest", () => {
    expect(() => assertDestructiveResetAllowed({ existingProductCount: 0, env: {} })).not.toThrow();
  });
  it("eşik altı (küçük kalıntı) flag'siz serbest", () => {
    expect(() =>
      assertDestructiveResetAllowed({ existingProductCount: DESTRUCTIVE_ROW_THRESHOLD, env: {} }),
    ).not.toThrow();
  });
  it("eşik aşımı + flag YOK → fail", () => {
    expect(() =>
      assertDestructiveResetAllowed({ existingProductCount: 471, env: {} }),
    ).toThrow(/DURDURULDU|ALLOW_DESTRUCTIVE_DEMO_RESET/);
  });
  it("eşik aşımı + açık flag → geçer (yalnız hedef store yıkılır)", () => {
    expect(() =>
      assertDestructiveResetAllowed({
        existingProductCount: 471,
        env: { [DESTRUCTIVE_RESET_FLAG]: "true" },
      }),
    ).not.toThrow();
  });
  it("geçersiz sayı → fail", () => {
    expect(() => assertDestructiveResetAllowed({ existingProductCount: -1, env: {} })).toThrow();
  });
});

describe("persist.mjs statik invariant — operasyonel veri korunur", () => {
  const src = readFileSync(join(HERE, "../scripts/enterprise/persist.mjs"), "utf8");

  it("wipeScope sipariş/müşteri/ödeme verisini SİLMEZ", () => {
    expect(src).not.toMatch(/order\.deleteMany/i);
    expect(src).not.toMatch(/orderLine\.deleteMany/i);
    expect(src).not.toMatch(/customer\.deleteMany/i);
    expect(src).not.toMatch(/payment\w*\.deleteMany/i);
    expect(src).not.toMatch(/review\.deleteMany/i);
    expect(src).not.toMatch(/customerList\.deleteMany/i);
  });

  it("her deleteMany store-scope'ludur (where storeId dışında filtre yok)", () => {
    // wipeScope içindeki tüm deleteMany çağrıları `{ where }` (= { storeId: STORE_ID }) kullanır.
    const deleteManyCalls = src.match(/\.deleteMany\(\{[^}]*\}\)/g) ?? [];
    expect(deleteManyCalls.length).toBeGreaterThan(0);
    for (const call of deleteManyCalls) {
      expect(call).toContain("where");
    }
  });

  it("guard'lar persist yolunda çağrılır (env + scope + circuit breaker)", () => {
    expect(src).toMatch(/assertSafeDatabaseEnvironment/);
    expect(src).toMatch(/assertScopeSlug/);
    expect(src).toMatch(/assertDestructiveResetAllowed/);
  });
});
