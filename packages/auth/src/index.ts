export type PlatformRole = "SUPER_ADMIN" | "SUPPORT_ADMIN";
export type StoreRole = "OWNER" | "ADMIN" | "MANAGER" | "STAFF" | "VIEWER";

export interface TenantContext {
  storeId: string;
  storeUserId: string;
  role: StoreRole;
}

export interface PlatformContext {
  platformUserId: string;
  role: PlatformRole;
}

export class AuthContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthContextError";
  }
}

export function requireStoreContext(context: TenantContext | null | undefined): TenantContext {
  if (!context?.storeId) {
    throw new AuthContextError("Store context is required.");
  }

  return context;
}

export function requirePlatformAdmin(context: PlatformContext | null | undefined): PlatformContext {
  if (!context || !["SUPER_ADMIN", "SUPPORT_ADMIN"].includes(context.role)) {
    throw new AuthContextError("Platform admin context is required.");
  }

  return context;
}

export function getStoreIdOrThrow(context: TenantContext | null | undefined): string {
  return requireStoreContext(context).storeId;
}

export function assertStoreAccess(context: TenantContext, storeId: string): void {
  if (context.storeId !== storeId) {
    throw new AuthContextError("Store access denied.");
  }
}
