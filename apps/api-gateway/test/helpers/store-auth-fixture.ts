/**
 * Faz E2B — Reusable Store Admin auth test fixture.
 *
 * Store Admin gateway route'ları artık YALNIZ StoreUserSession ile doğrulanır (Faz E2 cutover;
 * PlatformSession fallback YOK). Bu fixture, full-server (`createServer`) testlerine deterministik
 * bir fake `storeAuthData` (guard'ın `findStoreSessionByTokenHash` bağımlılığı) enjekte eder:
 * ACTIVE StoreUser + ACTIVE store + explicit role + geçerli/taze oturum (iki-kapılı ömür).
 * Token→hash pariteği gateway ile AYNIdır (`sha256(`${token}.${SESSION_SECRET}`)`).
 *
 * TEK primitive: OWNER/ADMIN/MANAGER/STAFF/VIEWER ve tüm invariant testleri bunu kullanır —
 * 20 dosyaya farklı auth fake kopyalanmaz. PlatformSession mock'u YALNIZ Platform Admin
 * testlerinde kalır; bu fixture StoreUser→PlatformUser bridge / dual-auth ÜRETMEZ.
 */
import { createHash } from "node:crypto";
import type { StoreUserRole, StoreUserStatus, StoreStatus } from "@prisma/client";

export const TEST_SESSION_SECRET = "test-session-secret-with-enough-length";

/** Gateway `hashSessionToken` ile birebir (sha256(token.secret)). */
export function hashStoreToken(token: string, secret: string = TEST_SESSION_SECRET): string {
  return createHash("sha256").update(`${token}.${secret}`).digest("hex");
}

export function bearer(token: string): { authorization: string } {
  return { authorization: `Bearer ${token}` };
}

export interface StoreAuthSpec {
  token: string;
  storeId: string;
  role: StoreUserRole;
  storeUserId?: string;
  storeUserStatus?: StoreUserStatus; // default ACTIVE
  storeStatus?: StoreStatus; // default ACTIVE
  email?: string | null;
  name?: string | null;
  storeSlug?: string;
  storeName?: string;
  revoked?: boolean;
  /** Oturumu süresi-dolmuş yapmak için (idle+absolute geçmişte). */
  expired?: boolean;
}

/** guard'ın `findStoreSessionByTokenHash` beklediği select-allowlist şekli (StoreSessionAuthRecord). */
export interface FakeStoreSessionRecord {
  id: string;
  storeId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  lastActivityAt: Date;
  absoluteExpiresAt: Date | null;
  rememberMe: boolean;
  policyVersion: number;
  store: { slug: string; name: string; status: StoreStatus };
  storeUser: {
    id: string;
    storeId: string;
    email: string | null;
    name: string | null;
    role: StoreUserRole;
    status: StoreUserStatus;
  };
}

export function makeStoreSessionRecord(spec: StoreAuthSpec): FakeStoreSessionRecord {
  const now = Date.now();
  const past = new Date(now - 3_600_000);
  const future = new Date(now + 3_600_000);
  const storeUserId = spec.storeUserId ?? `su_${spec.role.toLowerCase()}`;
  return {
    id: `sess_${storeUserId}`,
    storeId: spec.storeId,
    // expired → hem idle hem absolute geçmişte (iki-kapılı geçersizlik).
    expiresAt: spec.expired ? past : future,
    revokedAt: spec.revoked ? new Date(now - 1000) : null,
    lastActivityAt: spec.expired ? past : new Date(now),
    absoluteExpiresAt: spec.expired ? past : new Date(now + 8 * 3_600_000),
    rememberMe: false,
    policyVersion: 1,
    store: {
      slug: spec.storeSlug ?? "test-store",
      name: spec.storeName ?? "Test Store",
      status: spec.storeStatus ?? "ACTIVE",
    },
    storeUser: {
      id: storeUserId,
      storeId: spec.storeId,
      email: spec.email === undefined ? `${storeUserId}@store.test` : spec.email,
      name: spec.name === undefined ? `Store ${spec.role}` : spec.name,
      role: spec.role,
      status: spec.storeUserStatus ?? "ACTIVE",
    },
  };
}

/**
 * `createServer(config, { storeAuthData: createStoreAuthDataFake(specs) })` olarak enjekte edilir.
 * findStoreSessionByTokenHash: token→hash map'ten kaydı döner (yoksa null → guard 401).
 * touchStoreSessionActivity: no-op (idle bump'ı test etkilemez).
 */
export function createStoreAuthDataFake(
  specs: StoreAuthSpec[],
  secret: string = TEST_SESSION_SECRET,
) {
  const byHash = new Map<string, FakeStoreSessionRecord>();
  for (const spec of specs) byHash.set(hashStoreToken(spec.token, secret), makeStoreSessionRecord(spec));
  return {
    findStoreSessionByTokenHash: async (tokenHash: string) => byHash.get(tokenHash) ?? null,
    touchStoreSessionActivity: async () => ({ id: "noop" }),
  };
}
