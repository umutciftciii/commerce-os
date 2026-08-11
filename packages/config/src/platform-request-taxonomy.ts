/**
 * TODO-178 — Store→Platform Request taksonomisi + priority/impact policy (platform-owned, SAF modul).
 *
 * `@prisma/client` bagimliligi YOK — string union'lar burada LOKAL tanimlidir ve Prisma enum'lariyla
 * BIREBIR ayni olmalidir (migration + gateway status-map drift'i yakalar). Boylece Next BFF de
 * (Prisma'siz) bu sabitleri import edebilir. Kategori seed'i TEK KAYNAK'tir: migration INSERT'i ve
 * ileride platform CRUD default'lari bununla ayni satirlari uretmelidir.
 */

// ── Priority (platform-owned) ────────────────────────────────────────────────
export type PlatformRequestPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
export const PLATFORM_REQUEST_PRIORITIES: readonly PlatformRequestPriority[] = [
  "LOW",
  "NORMAL",
  "HIGH",
  "URGENT",
] as const;

// ── Store impact (yalniz advisory; priority OTORITESI DEGIL) ──────────────────
export type PlatformRequestStoreImpact = "LOW" | "MEDIUM" | "HIGH";
export const PLATFORM_REQUEST_STORE_IMPACTS: readonly PlatformRequestStoreImpact[] = [
  "LOW",
  "MEDIUM",
  "HIGH",
] as const;

// ── Close reason (CANCELLED status YOK; kapanis nedeni burada tasinir) ────────
export type PlatformRequestCloseReason =
  | "COMPLETED"
  | "WITHDRAWN_BY_STORE"
  | "NOT_ACTIONABLE"
  | "DUPLICATE"
  | "REJECTED";
export const PLATFORM_REQUEST_CLOSE_REASONS: readonly PlatformRequestCloseReason[] = [
  "COMPLETED",
  "WITHDRAWN_BY_STORE",
  "NOT_ACTIONABLE",
  "DUPLICATE",
  "REJECTED",
] as const;

// ── Context kind (polimorfik contextType/contextId YERINE; contextSnapshot ile) ──
export type PlatformRequestContextKind =
  | "NONE"
  | "PLATFORM_TAXONOMY"
  | "PLATFORM_CONTENT"
  | "PLATFORM_POLICY"
  | "STORE_DATA"
  | "OTHER";
export const PLATFORM_REQUEST_CONTEXT_KINDS: readonly PlatformRequestContextKind[] = [
  "NONE",
  "PLATFORM_TAXONOMY",
  "PLATFORM_CONTENT",
  "PLATFORM_POLICY",
  "STORE_DATA",
  "OTHER",
] as const;

// ── Category seed (platform-managed taxonomy; enum DEGIL, dynamic form engine DEGIL) ──
export interface PlatformRequestCategorySeed {
  key: string;
  labelTr: string;
  labelEn: string;
  defaultPriority: PlatformRequestPriority;
  /** `platform-request-sla-policy` byKey anahtari; "DEFAULT" → policy.default'a duser. */
  slaPolicyKey: string;
  sortOrder: number;
}

/**
 * Deterministik baslangic kategori seti — TEK KAYNAK. Faz A migration'i bu satirlari sabit id'lerle
 * (idempotent ON CONFLICT DO NOTHING) INSERT eder. Ilk gercek kullanim senaryolarini kapsar; platform
 * ileride yeni satir EKLEYEBILIR (deploy'suz) ama bunlar cekirdek referanstir.
 */
export const PLATFORM_REQUEST_CATEGORY_SEED: readonly PlatformRequestCategorySeed[] = [
  {
    key: "CANCELLATION_TAXONOMY",
    labelTr: "İptal Nedeni Taksonomisi",
    labelEn: "Cancellation Reason Taxonomy",
    defaultPriority: "NORMAL",
    slaPolicyKey: "DEFAULT",
    sortOrder: 10,
  },
  {
    key: "PRODUCT_SUPPORT_CONFIG",
    labelTr: "Ürün Desteği Yapılandırması",
    labelEn: "Product Support Configuration",
    defaultPriority: "NORMAL",
    slaPolicyKey: "DEFAULT",
    sortOrder: 20,
  },
  {
    key: "CATALOG_TAXONOMY",
    labelTr: "Katalog/Kategori Taksonomisi",
    labelEn: "Catalogue/Category Taxonomy",
    defaultPriority: "NORMAL",
    slaPolicyKey: "DEFAULT",
    sortOrder: 30,
  },
  {
    key: "PLATFORM_POLICY",
    labelTr: "Platform Politikası",
    labelEn: "Platform Policy",
    defaultPriority: "NORMAL",
    slaPolicyKey: "POLICY_REVIEW",
    sortOrder: 40,
  },
  {
    key: "OPERATIONAL_OTHER",
    labelTr: "Operasyonel / Diğer",
    labelEn: "Operational / Other",
    defaultPriority: "NORMAL",
    slaPolicyKey: "DEFAULT",
    sortOrder: 90,
  },
] as const;

/**
 * Bir request'in BASLANGIC platform priority'sini turetir. AUTORITE PLATFORMDADIR: baslangic
 * priority = kategori default'u. `storeImpact` YALNIZ advisory'dir ve bu turetimi ETKILEMEZ
 * (magaza, platform priority'sini dolayli bile olsa belirleyemez). Impact, triage'da platform'a
 * gosterilir ama priority'yi degistirmez — bu davranis test ile kilitlenmistir.
 */
export function deriveInitialPriority(
  categoryDefaultPriority: PlatformRequestPriority,
  storeImpact?: PlatformRequestStoreImpact,
): PlatformRequestPriority {
  // storeImpact API kontratında yer alır (çağıran advisory değeri geçer) ama priority türetimini
  // ETKİLEMEZ — otorite platformdadır. Kasıtlı olarak yok sayılır (test ile kilitli).
  void storeImpact;
  return categoryDefaultPriority;
}

/**
 * GLOBAL (store-scoped DEGIL) sıralı request numarasini formatlar: `PR-000001`. Platform cross-store
 * inbox'inda numara TEK BASINA global referanstir (store slug ile composite gerektirmez). Sayacin
 * atomik uretimi (advisory-lock'lu singleton counter) Faz B servis katmanindadir.
 */
export function formatPlatformRequestNumber(value: number): string {
  return `PR-${String(value).padStart(6, "0")}`;
}
