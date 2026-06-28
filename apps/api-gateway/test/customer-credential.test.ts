import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { type AppDataAccess, createServer } from "../src/server.js";
import type {
  CustomerAuthRecord,
  CustomerCredentialTokenRecord,
  CustomerDataAccess,
  CustomerSessionRecord,
} from "../src/customers/index.js";
import type { CustomerCredentialTokenPurpose, CustomerStatus } from "@prisma/client";

/**
 * TODO-087 — Store-admin müşteri oluşturma + admin tetikli credential/oturum
 * yönetimi gateway entegrasyon testleri. In-memory CustomerDataAccess fake'i ile
 * gerçek route'lar app.inject ile çağrılır. Platform-admin auth Bearer token +
 * fake platform session ile sağlanır. Doğrulananlar: müşteri create, store-scope
 * dup 409, cross-store izolasyon, detail security, activation/reset token tek
 * seferlik + hash saklama, public activate, session revoke, status davranışı ve
 * secret/token sızıntısı kontrolü.
 */
const SECRET = "test-session-secret-with-enough-length";
const ADMIN_TOKEN = "admin-bearer-token-abc";
const adminHeaders = { authorization: `Bearer ${ADMIN_TOKEN}` };

const config = {
  APP_ENV: "test" as const,
  SERVICE_NAME: "api-gateway-test",
  LOG_LEVEL: "error" as const,
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  REDIS_URL: "redis://localhost:6379",
  INTERNAL_API_TOKEN: "test-internal-token",
  SESSION_SECRET: SECRET,
  SESSION_TTL_SECONDS: 3600,
  PASSWORD_HASH_PEPPER: "test-pepper",
  ADMIN_AUTH_COOKIE_NAME: "commerce_os_admin_session",
  AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS: 60,
  AUTH_LOGIN_RATE_LIMIT_MAX_ATTEMPTS: 50,
  API_GATEWAY_PORT: 3000,
  WORKER_CONCURRENCY: 5,
  PAYMENT_SANDBOX_HTTP_ENABLED: false,
  CUSTOMER_SESSION_TTL_SECONDS: 3600,
  CUSTOMER_OTP_TTL_SECONDS: 300,
  CUSTOMER_OTP_MAX_ATTEMPTS: 5,
  CUSTOMER_OTP_RESEND_COOLDOWN_SECONDS: 0,
  CUSTOMER_CREDENTIAL_TOKEN_TTL_SECONDS: 3600,
};

const demoStore = {
  id: "store_demo",
  name: "Demo Store",
  slug: "demo-store",
  status: "ACTIVE" as const,
  metadata: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};
const otherStore = { ...demoStore, id: "store_other", slug: "other-store", name: "Other Store" };

function hashSessionToken(token: string, secret: string): string {
  return createHash("sha256").update(`${token}.${secret}`).digest("hex");
}

// Bearer ADMIN_TOKEN -> geçerli SUPER_ADMIN platform session döndüren fake.
const adminSession = {
  id: "psess_1",
  expiresAt: new Date(Date.now() + 3_600_000),
  revokedAt: null,
  platformUser: { id: "padmin_1", email: "admin@example.com", name: "Admin", passwordHash: "x", role: "SUPER_ADMIN" },
};

const dataAccess = {
  async findStoreBySlug(slug: string) {
    if (slug === demoStore.slug) return demoStore;
    if (slug === otherStore.slug) return otherStore;
    return null;
  },
  async findStoreById(id: string) {
    if (id === demoStore.id) return demoStore;
    if (id === otherStore.id) return otherStore;
    return null;
  },
  async findPlatformSessionByTokenHash(tokenHash: string) {
    return tokenHash === hashSessionToken(ADMIN_TOKEN, SECRET) ? adminSession : null;
  },
} as unknown as AppDataAccess;

interface TokenRow {
  id: string;
  storeId: string;
  customerId: string;
  purpose: CustomerCredentialTokenPurpose;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
}

/** Bu testlerin dokunduğu uçları kapsayan in-memory fake. Kullanılmayan uçlar
 *  çağrılmadığından kasıtlı olarak throw eder. */
class MemoryCustomers {
  private seq = 0;
  customers: (CustomerAuthRecord & { createdAt: Date })[] = [];
  credentials = new Map<string, { passwordHash: string; passwordChangedAt: Date }>();
  tokens: TokenRow[] = [];
  sessions = new Map<string, { id: string; storeId: string; customerId: string; expiresAt: Date; revokedAt: Date | null }>();

  private id(prefix: string) {
    this.seq += 1;
    return `${prefix}_${this.seq}`;
  }

  async findByEmail(storeId: string, email: string) {
    return this.customers.find((c) => c.storeId === storeId && c.email === email) ?? null;
  }
  async findByPhone(storeId: string, phone: string) {
    return this.customers.find((c) => c.storeId === storeId && c.phone === phone) ?? null;
  }
  async findById(storeId: string, id: string) {
    return this.customers.find((c) => c.storeId === storeId && c.id === id) ?? null;
  }
  async hasCredential(customerId: string) {
    return this.credentials.has(customerId);
  }
  async findCredentialHash(customerId: string) {
    return this.credentials.get(customerId)?.passwordHash ?? null;
  }
  async setCredential(_storeId: string, customerId: string, passwordHash: string) {
    this.credentials.set(customerId, { passwordHash, passwordChangedAt: new Date() });
  }
  async getCredentialMeta(customerId: string) {
    const c = this.credentials.get(customerId);
    return c ? { passwordChangedAt: c.passwordChangedAt } : null;
  }
  async createSession(input: { storeId: string; customerId: string; tokenHash: string; expiresAt: Date }) {
    this.sessions.set(input.tokenHash, {
      id: this.id("ses"),
      storeId: input.storeId,
      customerId: input.customerId,
      expiresAt: input.expiresAt,
      revokedAt: null,
    });
  }
  async findSessionByTokenHash(tokenHash: string): Promise<CustomerSessionRecord | null> {
    const s = this.sessions.get(tokenHash);
    if (!s) return null;
    const customer = this.customers.find((c) => c.id === s.customerId)!;
    return { id: s.id, storeId: s.storeId, expiresAt: s.expiresAt, revokedAt: s.revokedAt, customer };
  }
  async countActiveSessions(storeId: string, customerId: string) {
    let count = 0;
    for (const s of this.sessions.values()) {
      if (s.storeId === storeId && s.customerId === customerId && !s.revokedAt && s.expiresAt.getTime() > Date.now()) {
        count += 1;
      }
    }
    return count;
  }
  async revokeAllSessions(storeId: string, customerId: string) {
    let count = 0;
    for (const s of this.sessions.values()) {
      if (s.storeId === storeId && s.customerId === customerId && !s.revokedAt) {
        s.revokedAt = new Date();
        count += 1;
      }
    }
    return count;
  }
  async adminCreateCustomer(
    storeId: string,
    input: { firstName: string; lastName: string; email: string | null; phone: string | null; status: CustomerStatus },
  ) {
    if (input.email && this.customers.some((c) => c.storeId === storeId && c.email === input.email)) {
      return "EMAIL_TAKEN" as const;
    }
    if (input.phone && this.customers.some((c) => c.storeId === storeId && c.phone === input.phone)) {
      return "PHONE_TAKEN" as const;
    }
    const record = {
      id: this.id("cus"),
      storeId,
      email: input.email,
      phone: input.phone,
      firstName: input.firstName,
      lastName: input.lastName,
      birthDate: null,
      gender: null,
      emailVerifiedAt: null,
      phoneVerifiedAt: null,
      status: input.status,
      createdAt: new Date(),
    };
    this.customers.push(record);
    return record;
  }
  async adminFindDetail(storeId: string, customerId: string) {
    const c = this.customers.find((x) => x.storeId === storeId && x.id === customerId);
    if (!c) return null;
    return { ...c, hasCredential: this.credentials.has(c.id) };
  }
  async createCredentialToken(input: {
    storeId: string;
    customerId: string;
    purpose: CustomerCredentialTokenPurpose;
    tokenHash: string;
    expiresAt: Date;
    createdByUserId: string;
  }) {
    this.tokens.push({
      id: this.id("tok"),
      storeId: input.storeId,
      customerId: input.customerId,
      purpose: input.purpose,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      consumedAt: null,
    });
  }
  async findCredentialTokenByHash(tokenHash: string): Promise<CustomerCredentialTokenRecord | null> {
    const t = this.tokens.find((x) => x.tokenHash === tokenHash);
    return t
      ? { id: t.id, storeId: t.storeId, customerId: t.customerId, purpose: t.purpose, expiresAt: t.expiresAt, consumedAt: t.consumedAt }
      : null;
  }
  async consumeCredentialToken(id: string) {
    const t = this.tokens.find((x) => x.id === id && !x.consumedAt);
    if (!t) return false;
    t.consumedAt = new Date();
    return true;
  }
  async setCustomerActive(storeId: string, customerId: string) {
    const c = this.customers.find((x) => x.storeId === storeId && x.id === customerId);
    if (c) c.status = "ACTIVE";
  }
  // Detay ucu bu yardımcıları çağırır; bu testlerde boş.
  async listAddresses() {
    return [];
  }
  async listIbans() {
    return [];
  }
  async getCommPref() {
    return { smsEnabled: false, emailEnabled: true, phoneEnabled: false };
  }
  async listOrders() {
    return [];
  }
}

function makeApp() {
  const customers = new MemoryCustomers();
  const app = createServer(config, {
    dataAccess,
    customerDataAccess: customers as unknown as CustomerDataAccess,
  });
  return { app, customers };
}

const adminBase = `/stores/${demoStore.id}/customers`;
const publicBase = `/public/stores/${demoStore.slug}/customer`;

async function createCustomer(
  app: ReturnType<typeof makeApp>["app"],
  body: Record<string, unknown>,
) {
  return app.inject({ method: "POST", url: adminBase, headers: adminHeaders, payload: body });
}

describe("api gateway · store-admin customer create + credential (TODO-087)", () => {
  it("creates a customer and returns it without a membership token by default", async () => {
    const { app } = makeApp();
    const res = await createCustomer(app, { fullName: "Ada Lovelace", email: "ada@example.com", status: "ACTIVE" });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.customer.fullName).toBe("Ada Lovelace");
    expect(body.customer.status).toBe("ACTIVE");
    expect(body.customer.hasCredential).toBe(false);
    expect(body.setup).toBeNull();
  });

  it("rejects create without an identifier (email or phone)", async () => {
    const { app } = makeApp();
    const res = await createCustomer(app, { fullName: "No Contact", status: "ACTIVE" });
    expect(res.statusCode).toBe(400);
  });

  it("returns 409 on duplicate email within the store scope", async () => {
    const { app } = makeApp();
    await createCustomer(app, { fullName: "Ada One", email: "dup@example.com", status: "ACTIVE" });
    const res = await createCustomer(app, { fullName: "Ada Two", email: "dup@example.com", status: "ACTIVE" });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("EMAIL_TAKEN");
  });

  it("returns 409 on duplicate phone within the store scope", async () => {
    const { app } = makeApp();
    await createCustomer(app, { fullName: "Ada One", phone: "5551112233", status: "ACTIVE" });
    const res = await createCustomer(app, { fullName: "Ada Two", phone: "5551112233", status: "ACTIVE" });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("PHONE_TAKEN");
  });

  it("requires platform-admin auth", async () => {
    const { app } = makeApp();
    const res = await app.inject({ method: "POST", url: adminBase, payload: { fullName: "X", email: "x@example.com" } });
    expect(res.statusCode).toBe(401);
  });

  it("blocks cross-store access to another store's customer", async () => {
    const { app } = makeApp();
    const created = (await createCustomer(app, { fullName: "Ada", email: "ada@example.com" })).json();
    const res = await app.inject({
      method: "GET",
      url: `/stores/${otherStore.id}/customers/${created.customer.id}`,
      headers: adminHeaders,
    });
    expect(res.statusCode).toBe(404);
  });

  it("create with membership returns a one-time setup token and stores only its hash", async () => {
    const { app, customers } = makeApp();
    const res = await createCustomer(app, {
      fullName: "Ada Member",
      email: "member@example.com",
      status: "ACTIVE",
      createMembership: true,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.setup).not.toBeNull();
    expect(body.setup.purpose).toBe("ADMIN_ACTIVATION");
    const rawToken: string = body.setup.token;
    expect(rawToken.length).toBeGreaterThan(20);
    // DB'de raw token YOK; yalnız hash saklanır.
    expect(customers.tokens).toHaveLength(1);
    expect(customers.tokens[0].tokenHash).not.toBe(rawToken);
    expect(customers.tokens[0].tokenHash).toBe(
      createHash("sha256").update(`cred.${rawToken}.${SECRET}`).digest("hex"),
    );
    expect(JSON.stringify(customers.tokens[0])).not.toContain(rawToken);
  });

  it("detail exposes security block but never a hash", async () => {
    const { app } = makeApp();
    const created = (await createCustomer(app, { fullName: "Ada", email: "ada@example.com", createMembership: true })).json();
    const res = await app.inject({
      method: "GET",
      url: `${adminBase}/${created.customer.id}`,
      headers: adminHeaders,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.security.hasCredential).toBe(false);
    expect(body.security.activeSessionCount).toBe(0);
    expect(JSON.stringify(body)).not.toMatch(/passwordHash|tokenHash|codeHash/);
  });

  it("end-to-end: activation sets password, activates, and login works; token is single-use", async () => {
    const { app, customers } = makeApp();
    const created = (await createCustomer(app, {
      fullName: "Ada Member",
      email: "member@example.com",
      status: "PASSIVE",
      createMembership: true,
    })).json();
    const token: string = created.setup.token;

    const activate = await app.inject({
      method: "POST",
      url: `${publicBase}/activate`,
      payload: { token, password: "Passw0rd" },
    });
    expect(activate.statusCode).toBe(200);
    expect(activate.json().activated).toBe(true);
    // Aktivasyon müşteriyi ACTIVE yapar + credential set eder.
    expect(customers.customers[0].status).toBe("ACTIVE");
    expect(customers.credentials.has(created.customer.id)).toBe(true);

    // Aynı token ikinci kez kullanılamaz.
    const reuse = await app.inject({
      method: "POST",
      url: `${publicBase}/activate`,
      payload: { token, password: "Passw0rd" },
    });
    expect(reuse.statusCode).toBe(400);
    expect(reuse.json().error.code).toBe("INVALID_TOKEN");

    // Yeni parola ile giriş çalışır.
    const login = await app.inject({
      method: "POST",
      url: `${publicBase}/login`,
      payload: { identifier: "member@example.com", password: "Passw0rd" },
    });
    expect(login.statusCode).toBe(200);
    expect(login.json().token).toBeTruthy();
  });

  it("rejects an invalid / unknown activation token generically", async () => {
    const { app } = makeApp();
    const res = await app.inject({
      method: "POST",
      url: `${publicBase}/activate`,
      payload: { token: "totally-made-up-token", password: "Passw0rd" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("INVALID_TOKEN");
  });

  it("password reset changes the password and revokes existing sessions", async () => {
    const { app, customers } = makeApp();
    const created = (await createCustomer(app, {
      fullName: "Ada Member",
      email: "member@example.com",
      status: "ACTIVE",
      createMembership: true,
    })).json();
    const customerId: string = created.customer.id;
    // İlk parolayı aktivasyonla belirle + giriş yap (aktif oturum oluşsun).
    await app.inject({ method: "POST", url: `${publicBase}/activate`, payload: { token: created.setup.token, password: "Passw0rd" } });
    const login = await app.inject({ method: "POST", url: `${publicBase}/login`, payload: { identifier: "member@example.com", password: "Passw0rd" } });
    const sessionToken: string = login.json().token;
    expect(await customers.countActiveSessions(demoStore.id, customerId)).toBe(1);

    // Admin reset linki üret.
    const reset = await app.inject({
      method: "POST",
      url: `${adminBase}/${customerId}/credential/reset`,
      headers: adminHeaders,
    });
    expect(reset.statusCode).toBe(201);
    expect(reset.json().setup.purpose).toBe("ADMIN_PASSWORD_RESET");

    // Yeni parola belirle.
    await app.inject({ method: "POST", url: `${publicBase}/activate`, payload: { token: reset.json().setup.token, password: "NewPass1" } });

    // Eski parola artık çalışmaz; yeni parola çalışır.
    const oldLogin = await app.inject({ method: "POST", url: `${publicBase}/login`, payload: { identifier: "member@example.com", password: "Passw0rd" } });
    expect(oldLogin.statusCode).toBe(401);
    const newLogin = await app.inject({ method: "POST", url: `${publicBase}/login`, payload: { identifier: "member@example.com", password: "NewPass1" } });
    expect(newLogin.statusCode).toBe(200);

    // Reset parolayı set ettiğinde eski oturum revoke edilmiştir.
    const me = await app.inject({ method: "GET", url: `${publicBase}/me`, headers: { "x-customer-session": sessionToken } });
    expect(me.statusCode).toBe(401);
  });

  it("reset is rejected when the customer has no credential", async () => {
    const { app } = makeApp();
    const created = (await createCustomer(app, { fullName: "Ada", email: "ada@example.com" })).json();
    const res = await app.inject({ method: "POST", url: `${adminBase}/${created.customer.id}/credential/reset`, headers: adminHeaders });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("NO_CREDENTIAL");
  });

  it("createCredential is rejected when one already exists", async () => {
    const { app } = makeApp();
    const created = (await createCustomer(app, { fullName: "Ada", email: "ada@example.com", createMembership: true })).json();
    await app.inject({ method: "POST", url: `${publicBase}/activate`, payload: { token: created.setup.token, password: "Passw0rd" } });
    const res = await app.inject({ method: "POST", url: `${adminBase}/${created.customer.id}/credential`, headers: adminHeaders });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("CREDENTIAL_EXISTS");
  });

  it("revokes all sessions and blocks /me with a revoked session", async () => {
    const { app } = makeApp();
    const created = (await createCustomer(app, { fullName: "Ada", email: "ada@example.com", createMembership: true })).json();
    await app.inject({ method: "POST", url: `${publicBase}/activate`, payload: { token: created.setup.token, password: "Passw0rd" } });
    const login = await app.inject({ method: "POST", url: `${publicBase}/login`, payload: { identifier: "ada@example.com", password: "Passw0rd" } });
    const sessionToken: string = login.json().token;

    const revoke = await app.inject({ method: "POST", url: `${adminBase}/${created.customer.id}/sessions/revoke`, headers: adminHeaders });
    expect(revoke.statusCode).toBe(200);
    expect(revoke.json().revokedCount).toBe(1);

    const me = await app.inject({ method: "GET", url: `${publicBase}/me`, headers: { "x-customer-session": sessionToken } });
    expect(me.statusCode).toBe(401);
  });

  it("PASSIVE customers cannot log in even with a valid password", async () => {
    const { app, customers } = makeApp();
    const created = (await createCustomer(app, {
      fullName: "Ada Member",
      email: "member@example.com",
      status: "ACTIVE",
      createMembership: true,
    })).json();
    await app.inject({ method: "POST", url: `${publicBase}/activate`, payload: { token: created.setup.token, password: "Passw0rd" } });
    // Admin müşteriyi PASSIVE yapar (doğrudan fake üzerinden).
    customers.customers[0].status = "PASSIVE";
    const login = await app.inject({ method: "POST", url: `${publicBase}/login`, payload: { identifier: "member@example.com", password: "Passw0rd" } });
    expect(login.statusCode).toBe(401);
    expect(login.json().error.code).toBe("INVALID_CREDENTIALS");
  });
});
