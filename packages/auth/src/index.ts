import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

export type PlatformRole = "SUPER_ADMIN" | "SUPPORT_ADMIN";
export type StoreRole = "OWNER" | "ADMIN" | "MANAGER" | "STAFF" | "VIEWER";

const scrypt = promisify(scryptCallback);
const passwordPrefix = "scrypt";
const passwordKeyLength = 64;
const storeRoleRank: Record<StoreRole, number> = {
  VIEWER: 0,
  STAFF: 1,
  MANAGER: 2,
  ADMIN: 3,
  OWNER: 4,
};

export interface TenantContext {
  storeId: string;
  storeUserId: string;
  role: StoreRole;
}

export interface PlatformContext {
  platformUserId: string;
  role: PlatformRole;
}

export interface AuthenticatedPlatformUser extends PlatformContext {
  email: string;
  name: string | null;
  sessionId: string;
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
  const platformUser = requireAuthenticatedPlatformUser(context);
  if (!["SUPER_ADMIN", "SUPPORT_ADMIN"].includes(platformUser.role)) {
    throw new AuthContextError("Platform admin context is required.");
  }

  return platformUser;
}

export function requireAuthenticatedPlatformUser(
  context: PlatformContext | null | undefined,
): PlatformContext {
  if (!context?.platformUserId) {
    throw new AuthContextError("Authenticated platform user is required.");
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

export function requireStoreAccess(
  context: TenantContext | null | undefined,
  storeId: string,
): TenantContext {
  const tenantContext = requireStoreContext(context);
  assertStoreAccess(tenantContext, storeId);
  return tenantContext;
}

export function assertStoreRole(context: TenantContext, minimumRole: StoreRole): void {
  if (storeRoleRank[context.role] < storeRoleRank[minimumRole]) {
    throw new AuthContextError("Store role is not allowed.");
  }
}

export async function hashPassword(password: string, pepper = ""): Promise<string> {
  const salt = randomBytes(16).toString("base64url");
  const key = (await scrypt(`${password}${pepper}`, salt, passwordKeyLength)) as Buffer;
  return `${passwordPrefix}$${salt}$${key.toString("base64url")}`;
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
  pepper = "",
): Promise<boolean> {
  const [prefix, salt, key] = passwordHash.split("$");
  if (prefix !== passwordPrefix || !salt || !key) {
    return false;
  }

  const expected = Buffer.from(key, "base64url");
  const actual = (await scrypt(`${password}${pepper}`, salt, expected.length)) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
