import type { StoreRole } from "./index.js";

export type StorePermission =
  | "catalog:read" | "catalog:write"
  | "orders:read" | "orders:write"
  | "refunds:read" | "refunds:write" | "refunds:manage"
  | "shopping-balance:read" | "shopping-balance:write" | "shopping-balance:manage"
  | "product-support:read" | "product-support:write"
  | "platform-requests:read" | "platform-requests:write"
  | "customers:read" | "customers:write"
  | "settings:read" | "settings:manage"
  | "store-users:manage";

export const ROLE_PERMISSIONS: Record<StoreRole, ReadonlySet<StorePermission>> = {
  OWNER: new Set<StorePermission>([
    "catalog:read", "catalog:write",
    "orders:read", "orders:write",
    "refunds:read", "refunds:write", "refunds:manage",
    "shopping-balance:read", "shopping-balance:write", "shopping-balance:manage",
    "product-support:read", "product-support:write",
    "platform-requests:read", "platform-requests:write",
    "customers:read", "customers:write",
    "settings:read", "settings:manage",
    "store-users:manage",
  ]),
  ADMIN: new Set<StorePermission>([
    "catalog:read", "catalog:write",
    "orders:read", "orders:write",
    "refunds:read", "refunds:write", "refunds:manage",
    "shopping-balance:read", "shopping-balance:write", "shopping-balance:manage",
    "product-support:read", "product-support:write",
    "platform-requests:read", "platform-requests:write",
    "customers:read", "customers:write",
    "settings:read",
  ]),
  MANAGER: new Set<StorePermission>([
    "catalog:read", "catalog:write",
    "orders:read", "orders:write",
    "refunds:read", "refunds:write",
    "shopping-balance:read",
    "product-support:read", "product-support:write",
    "platform-requests:read", "platform-requests:write",
    "customers:read",
    "settings:read",
  ]),
  STAFF: new Set<StorePermission>([
    "catalog:read",
    "orders:read", "orders:write",
    "refunds:read",
    "shopping-balance:read",
    "product-support:read", "product-support:write",
    "platform-requests:read",
    "customers:read",
  ]),
  VIEWER: new Set<StorePermission>([
    "catalog:read",
    "orders:read",
    "refunds:read",
    "shopping-balance:read",
    "product-support:read",
    "platform-requests:read",
    "customers:read",
  ]),
};

export function hasStorePermission(role: StoreRole, permission: StorePermission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}
