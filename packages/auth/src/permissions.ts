import type { StoreRole } from "./index.js";

export type StorePermission =
  | "catalog:read" | "catalog:write"
  | "orders:read" | "orders:write"
  | "returns:read" | "returns:manage"
  | "refunds:read" | "refunds:write" | "refunds:manage"
  | "shopping-balance:read" | "shopping-balance:write" | "shopping-balance:manage"
  | "product-support:read" | "product-support:write"
  | "platform-requests:read" | "platform-requests:write"
  | "customers:read" | "customers:write"
  | "settings:read" | "settings:manage"
  // Faz E2 — Finans/ticari yönetim (raporlar + sponsorluk/sponsorlu/influencer/otomasyon).
  // Gelir-hassas: STAFF/VIEWER ERİŞMEZ (fail-closed). write mutation'ları manage'e düşer.
  | "finance:read" | "finance:manage"
  | "store-users:manage";

export const ROLE_PERMISSIONS: Record<StoreRole, ReadonlySet<StorePermission>> = {
  OWNER: new Set<StorePermission>([
    "catalog:read", "catalog:write",
    "orders:read", "orders:write",
    "returns:read", "returns:manage",
    "refunds:read", "refunds:write", "refunds:manage",
    "shopping-balance:read", "shopping-balance:write", "shopping-balance:manage",
    "product-support:read", "product-support:write",
    "platform-requests:read", "platform-requests:write",
    "customers:read", "customers:write",
    "settings:read", "settings:manage",
    "store-users:manage",
    "finance:read", "finance:manage",
  ]),
  ADMIN: new Set<StorePermission>([
    "catalog:read", "catalog:write",
    "orders:read", "orders:write",
    "returns:read", "returns:manage",
    "refunds:read", "refunds:write", "refunds:manage",
    "shopping-balance:read", "shopping-balance:write", "shopping-balance:manage",
    "product-support:read", "product-support:write",
    "platform-requests:read", "platform-requests:write",
    "customers:read", "customers:write",
    "settings:read",
    "finance:read", "finance:manage",
  ]),
  MANAGER: new Set<StorePermission>([
    "catalog:read", "catalog:write",
    "orders:read", "orders:write",
    "returns:read", "returns:manage",
    "refunds:read", "refunds:write",
    "shopping-balance:read",
    "product-support:read", "product-support:write",
    "platform-requests:read", "platform-requests:write",
    "customers:read",
    "settings:read",
    "finance:read",
  ]),
  STAFF: new Set<StorePermission>([
    "catalog:read",
    "orders:read", "orders:write",
    // STAFF: yalnız returns:read — manage'i operasyon modeli gerçekten gerektirmedikçe vermeyiz (fail-closed).
    "returns:read",
    "refunds:read",
    "shopping-balance:read",
    "product-support:read", "product-support:write",
    "platform-requests:read",
    "customers:read",
  ]),
  VIEWER: new Set<StorePermission>([
    "catalog:read",
    "orders:read",
    "returns:read",
    "refunds:read",
    "shopping-balance:read",
    "product-support:read",
    "platform-requests:read",
    "customers:read",
  ]),
};

// FAIL-CLOSED: bilinmeyen role (matrix'te olmayan) VEYA bilinmeyen permission → false.
// Optional-chain, çalışma-zamanı geçersiz bir role gelse bile (ör. tipi zorlanmış) throw etmez.
export function hasStorePermission(role: StoreRole, permission: StorePermission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}
