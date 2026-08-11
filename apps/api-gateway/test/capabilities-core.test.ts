/**
 * TODO-163 (ADR-208…ADR-212) — Tenant Module & Capability SAF çekirdek testleri (Faz 2 taksonomi).
 * Kapsam: registry bütünlüğü · core her zaman açık · baseline geriye uyumlu · override > plan >
 * baseline · dependency pass (gereken kapalı → dependent kapanır) · bilinmeyen key fail-closed ·
 * plan metadata çıkarımı · core plan ile kapatılamaz.
 */
import { describe, expect, it } from "vitest";
import {
  STORE_MODULE_REGISTRY,
  directDependentsOf,
  getStoreModuleDefinition,
  isStoreModuleKey,
} from "../src/capabilities/registry.js";
import {
  extractPlanModuleDefaults,
  isModuleEnabled,
  resolveEffectiveModules,
} from "../src/capabilities/resolver.js";

describe("registry", () => {
  it("benzersiz key; requires yalnız kayıtlı key'lere işaret eder; core baseline=true", () => {
    const keys = STORE_MODULE_REGISTRY.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const m of STORE_MODULE_REGISTRY) {
      for (const req of m.requires ?? []) expect(isStoreModuleKey(req)).toBe(true);
      if (m.core) expect(m.baselineEnabled).toBe(true);
    }
  });

  it("core taksonomisi doğru", () => {
    expect(getStoreModuleDefinition("CATALOG").core).toBe(true);
    expect(getStoreModuleDefinition("ORDERS").core).toBe(true);
    expect(getStoreModuleDefinition("PAYMENTS").core).toBe(true);
    expect(getStoreModuleDefinition("CAMPAIGNS").core).toBe(false);
    expect(getStoreModuleDefinition("REVIEWS").core).toBe(false);
  });

  it("TODO-178 — PLATFORM_REQUESTS kayıtlı, gate'lenebilir (core değil) ve baseline açık (geriye uyumlu)", () => {
    expect(isStoreModuleKey("PLATFORM_REQUESTS")).toBe(true);
    const def = getStoreModuleDefinition("PLATFORM_REQUESTS");
    expect(def.core).toBe(false);
    expect(def.baselineEnabled).toBe(true);
  });

  it("dependency zincirleri (prompt §8) doğru", () => {
    expect(getStoreModuleDefinition("RECOMMENDATIONS").requires).toContain("RECENTLY_VIEWED");
    expect(getStoreModuleDefinition("RECOMMENDATION_ANALYTICS").requires).toContain("RECOMMENDATIONS");
    expect(getStoreModuleDefinition("SPONSORED_PRODUCTS").requires).toContain("CAMPAIGNS");
    expect(getStoreModuleDefinition("SPONSORSHIP_FINANCE").requires).toContain("SPONSORED_PRODUCTS");
    expect(getStoreModuleDefinition("INFLUENCER_TRACKING").requires).toContain("CAMPAIGNS");
    expect(getStoreModuleDefinition("PAYMENT_RECOVERY").requires).toContain("PAYMENTS");
    expect(getStoreModuleDefinition("MULTI_WAREHOUSE").requires).toContain("BASIC_INVENTORY");
    expect(getStoreModuleDefinition("THEME_STUDIO").requires).toContain("HOME_EXPERIENCE");
    expect(getStoreModuleDefinition("WISHLIST").requires).toContain("CUSTOMER_LISTS");
  });

  it("directDependentsOf CAMPAIGNS → sponsored + influencer", () => {
    const deps = directDependentsOf("CAMPAIGNS");
    expect(deps).toContain("SPONSORED_PRODUCTS");
    expect(deps).toContain("INFLUENCER_TRACKING");
  });

  it("isStoreModuleKey yalnız kayıtlı anahtar", () => {
    expect(isStoreModuleKey("CAMPAIGNS")).toBe(true);
    expect(isStoreModuleKey("campaigns")).toBe(false); // eski lowercase reddedilir
    expect(isStoreModuleKey("nope")).toBe(false);
  });
});

describe("resolveEffectiveModules — geriye uyumluluk", () => {
  it("override/plan yokken effective = registry baseline (core + eski modüller açık)", () => {
    const eff = resolveEffectiveModules();
    for (const def of STORE_MODULE_REGISTRY) {
      // core her zaman açık; non-core baseline default'una eşit (opt-in modüller kapalı).
      const expected = def.core ? true : def.baselineEnabled;
      expect(eff.get(def.key)?.enabled).toBe(expected);
    }
  });

  it("FASHION_VERTICAL opt-in: override/plan yokken KAPALI (baseline), diğer eski modüller açık", () => {
    const eff = resolveEffectiveModules();
    // TODO-165: yeni capability geriye-uyum kaygısı olmadan opt-in → varsayılan kapalı.
    expect(getStoreModuleDefinition("FASHION_VERTICAL").baselineEnabled).toBe(false);
    expect(eff.get("FASHION_VERTICAL")).toMatchObject({ enabled: false, source: "baseline" });
    // Açık override ile etkinleşir (ör. enterprise-demo).
    const on = resolveEffectiveModules({ overrides: { FASHION_VERTICAL: "ENABLED" } });
    expect(on.get("FASHION_VERTICAL")).toMatchObject({ enabled: true, source: "override" });
  });

  it("core modül override ile kapatılamaz", () => {
    const eff = resolveEffectiveModules({ overrides: { CATALOG: "DISABLED", ORDERS: "DISABLED" } });
    expect(eff.get("CATALOG")).toMatchObject({ enabled: true, source: "core" });
    expect(eff.get("ORDERS")).toMatchObject({ enabled: true, source: "core" });
  });
});

describe("resolveEffectiveModules — öncelik", () => {
  it("store override plan default'u ezer", () => {
    const eff = resolveEffectiveModules({ overrides: { CAMPAIGNS: "DISABLED" }, planDefaults: { CAMPAIGNS: true } });
    expect(eff.get("CAMPAIGNS")).toMatchObject({ enabled: false, source: "override" });
  });
  it("INHERIT iken plan uygulanır", () => {
    const eff = resolveEffectiveModules({ overrides: { CAMPAIGNS: "INHERIT" }, planDefaults: { CAMPAIGNS: false } });
    expect(eff.get("CAMPAIGNS")).toMatchObject({ enabled: false, source: "plan" });
  });
  it("plan yoksa baseline", () => {
    expect(resolveEffectiveModules({}).get("CAMPAIGNS")).toMatchObject({ enabled: true, source: "baseline" });
  });
});

describe("resolveEffectiveModules — dependency pass", () => {
  it("CAMPAIGNS kapalı → SPONSORED_PRODUCTS + INFLUENCER_TRACKING dependency ile kapanır", () => {
    const eff = resolveEffectiveModules({ overrides: { CAMPAIGNS: "DISABLED" } });
    expect(eff.get("CAMPAIGNS")?.enabled).toBe(false);
    expect(eff.get("SPONSORED_PRODUCTS")).toMatchObject({ enabled: false, source: "dependency", blockedBy: "CAMPAIGNS" });
    expect(eff.get("INFLUENCER_TRACKING")).toMatchObject({ enabled: false, source: "dependency" });
  });

  it("transitif: CAMPAIGNS kapalı → SPONSORSHIP_FINANCE de kapanır (SPONSORED üzerinden)", () => {
    const eff = resolveEffectiveModules({ overrides: { CAMPAIGNS: "DISABLED" } });
    expect(eff.get("SPONSORSHIP_FINANCE")?.enabled).toBe(false);
  });

  it("RECENTLY_VIEWED kapalı → RECOMMENDATIONS + RECOMMENDATION_ANALYTICS kapanır", () => {
    const eff = resolveEffectiveModules({ overrides: { RECENTLY_VIEWED: "DISABLED" } });
    expect(eff.get("RECOMMENDATIONS")?.enabled).toBe(false);
    expect(eff.get("RECOMMENDATION_ANALYTICS")?.enabled).toBe(false);
  });
});

describe("isModuleEnabled — fail-closed", () => {
  it("bilinmeyen key false", () => {
    expect(isModuleEnabled("nope")).toBe(false);
    expect(isModuleEnabled("campaigns")).toBe(false); // eski lowercase
  });
  it("kayıtlı key baseline true, DISABLED override false", () => {
    expect(isModuleEnabled("CAMPAIGNS")).toBe(true);
    expect(isModuleEnabled("CAMPAIGNS", { overrides: { CAMPAIGNS: "DISABLED" } })).toBe(false);
  });
});

describe("extractPlanModuleDefaults", () => {
  it("yalnız registry key + boolean; core ve çöp elenir", () => {
    const out = extractPlanModuleDefaults({
      modules: {
        CAMPAIGNS: false,
        CATALOG: false, // core → elenir
        nope: true, // registry-dışı → elenir
        SHIPPING: false, // core → elenir
        REVIEWS: true,
      },
    });
    expect(out).toEqual({ CAMPAIGNS: false, REVIEWS: true });
  });
  it("geçersiz metadata boş", () => {
    expect(extractPlanModuleDefaults(null)).toEqual({});
    expect(extractPlanModuleDefaults({ modules: 5 })).toEqual({});
  });
});
