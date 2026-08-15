/**
 * Store-admin RBAC — SAF (Fastify/Prisma-bağımsız) yetkilendirme kompozisyonu ve politika
 * eşlemesi (Faz C, ADR-271 RBAC foundation).
 *
 * Kanonik yetkilendirme SIRASI (leak-safe): kimlik doğrulandı mı → doğru mağaza mı →
 * gerekli capability açık mı → gerekli RBAC permission var mı. Capability-deny ile
 * permission-deny AYRI reason'lardır (birbirine karışmaz); HTTP eşlemesi çağırana bırakılır.
 * Source-of-truth: Faz A `ROLE_PERMISSIONS` (bkz. permissions.ts). Burada YENİ hardcoded
 * role kontrolü YOK; dinamik/custom-role engine YOK.
 */
import type { StoreRole } from "./index.js";
import type { StorePermission } from "./permissions.js";
import { hasStorePermission } from "./permissions.js";

/** SAF karar tipi — çağıran (gateway guard) HTTP koduna eşler. */
export type StoreAuthorizationDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason: "UNAUTHENTICATED" | "STORE_MISMATCH" | "CAPABILITY_DISABLED" | "PERMISSION_DENIED";
    };

export interface StoreAuthorizationPrincipal {
  storeId: string;
  role: StoreRole;
}

export interface StoreAuthorizationInput {
  /** Kimlik doğrulanmış StoreUser principal'ı; yoksa null (kimliksiz istek). */
  principal: StoreAuthorizationPrincipal | null;
  /** Route path'inde `:storeId` varsa; principal.storeId ile eşleşmeli (yoksa/undefined ise kontrol edilmez). */
  pathStoreId?: string | null;
  /** Gereken RBAC permission; verilmezse (null/undefined) permission kapısı uygulanmaz. */
  requiredPermission?: StorePermission | null;
  /** Gereken store capability'nin çözülmüş durumu. undefined = capability kapısı yok; false = kapalı. */
  capabilityEnabled?: boolean;
}

const deny = (reason: Exclude<StoreAuthorizationDecision, { allowed: true }>["reason"]): StoreAuthorizationDecision => ({
  allowed: false,
  reason,
});

/**
 * Kanonik kompozisyon. Sıra bilinçlidir:
 *  1. principal yoksa → UNAUTHENTICATED
 *  2. pathStoreId verildi ve principal.storeId ile eşleşmiyor → STORE_MISMATCH (existence-probing-safe)
 *  3. capability açıkça kapalı → CAPABILITY_DISABLED (modül herkese kapalı; role'e bakılmaz — leak yok)
 *  4. permission gerekli ve yoksa → PERMISSION_DENIED
 *  5. aksi halde → allowed
 */
export function authorizeStoreRequest(input: StoreAuthorizationInput): StoreAuthorizationDecision {
  const { principal, pathStoreId, requiredPermission, capabilityEnabled } = input;

  if (!principal) return deny("UNAUTHENTICATED");
  if (pathStoreId != null && pathStoreId !== principal.storeId) return deny("STORE_MISMATCH");
  if (capabilityEnabled === false) return deny("CAPABILITY_DISABLED");
  if (requiredPermission != null && !hasStorePermission(principal.role, requiredPermission)) {
    return deny("PERMISSION_DENIED");
  }
  return { allowed: true };
}

// --- Policy mapping: modül + aksiyon → StorePermission ------------------------------------
//
// Faz A kilitli matris'e göre TEK yerde tanımlı eşleme (section 6). "returns" kendi
// permission'larına sahiptir (returns:read/returns:manage); orders'a alias DEĞİL. İade yönetimi
// (returns:manage) TEK BAŞINA para iadesi yetkisi VERMEZ — refund execution ayrıca refunds:manage
// gerektirir. Manage tier'ı olmayan modüllerde "manage" write'a düşer; settings'te write→manage
// (settings:write yok); returns'te write→manage (returns:write yok).

export type StorePolicyModule =
  | "catalog"
  | "orders"
  | "returns"
  | "refunds"
  | "shopping-balance"
  | "product-support"
  | "platform-requests"
  | "customers"
  | "settings"
  | "finance";

export type StoreAction = "read" | "write" | "manage";

const MODULE_ACTION_PERMISSION: Record<
  StorePolicyModule,
  Partial<Record<StoreAction, StorePermission>>
> = {
  catalog: { read: "catalog:read", write: "catalog:write", manage: "catalog:write" },
  orders: { read: "orders:read", write: "orders:write", manage: "orders:write" },
  // returns: read + manage (write tier yok → write manage'e düşer). refunds'tan bağımsızdır.
  returns: { read: "returns:read", write: "returns:manage", manage: "returns:manage" },
  refunds: { read: "refunds:read", write: "refunds:write", manage: "refunds:manage" },
  "shopping-balance": {
    read: "shopping-balance:read",
    write: "shopping-balance:write",
    manage: "shopping-balance:manage",
  },
  "product-support": {
    read: "product-support:read",
    write: "product-support:write",
    manage: "product-support:write",
  },
  "platform-requests": {
    read: "platform-requests:read",
    write: "platform-requests:write",
    manage: "platform-requests:write",
  },
  customers: { read: "customers:read", write: "customers:write", manage: "customers:write" },
  // settings:write yok → write ve manage aynı manage permission'ına eşlenir.
  settings: { read: "settings:read", write: "settings:manage", manage: "settings:manage" },
  // finance:write yok → write/manage aynı manage'e (gelir-hassas ticari mutation).
  finance: { read: "finance:read", write: "finance:manage", manage: "finance:manage" },
};

/**
 * Modül + aksiyon → StorePermission. Bilinmeyen modül/aksiyon → null (FAIL-CLOSED: çağıran
 * bunu "izin yok" değil "reddet" olarak yorumlamalıdır). Guard'lara açık `StorePermission`
 * literal'i geçmek tercih edilir; bu eşleyici Faz E route-wiring kolaylığı içindir.
 */
export function resolveStorePermission(
  module: StorePolicyModule,
  action: StoreAction,
): StorePermission | null {
  return MODULE_ACTION_PERMISSION[module]?.[action] ?? null;
}

// --- Sensitive operations foundation (section 7) -----------------------------------------
//
// Store-local hassas manage operasyonları. Faz A matris'i zaten OWNER/ADMIN (settings:manage
// yalnız OWNER) sınırını uygular — burada YENİ erişim AÇILMAZ; yalnız sınıflandırma sağlanır.
// SUPER_ADMIN triage'ı PLATFORM tarafında kalır (Faz A planı); StoreUser guard'ına platform
// fallback / override EKLENMEZ.
export const SENSITIVE_STORE_PERMISSIONS: ReadonlySet<StorePermission> = new Set<StorePermission>([
  "refunds:manage",
  "shopping-balance:manage",
  "settings:manage",
]);

export function isSensitiveStorePermission(permission: StorePermission): boolean {
  return SENSITIVE_STORE_PERMISSIONS.has(permission);
}
