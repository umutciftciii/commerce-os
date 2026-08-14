/**
 * Store-auth (Faz B, TODO-B3) — gateway route'ları: login/logout/session.
 *
 * TENANT TRUST BOUNDARY (ADR-271 takip): tenant context YALNIZCA sunucu-tarafı deployment
 * config'inden (`deps.configuredStoreSlug` ← STORE_ADMIN_STORE_SLUG) çözülür. İstemci tenant
 * SEÇEMEZ: hiçbir request header'ı (eski `x-store-admin-tenant` dahil), host, body/query alanı
 * (storeSlug/storeId) tenant belirlemez — tarayıcı/keyfî dış çağıran kurban mağazayı hedef
 * ALAMAZ. Config tanımsızsa resolver null döner → fail-closed. TÜM login başarısızlıkları
 * (config yok, bilinmeyen store/email, INVITED/DISABLED, null passwordHash, yanlış şifre) AYNI
 * jenerik 401 INVALID_CREDENTIALS döner — enumeration sızıntısı yok. PlatformUser fallback YOK.
 * Başarısız denemeler audit YAZMAZ (yalnız rate-limiter). Yanıtlar B1 safe-DTO şemalarından geçer.
 */
import { randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  storeAdminLoginRequestSchema,
  storeAdminLoginResponseSchema,
  storeAdminSessionResponseSchema,
  storeAdminLogoutResponseSchema,
} from "@commerce-os/contracts";
import type { SessionPolicy } from "@commerce-os/config";
import { computeSessionExpiry, sessionTiming } from "@commerce-os/config";
import { resolveStoreAdminTenantContext } from "@commerce-os/auth";
import type { StoreAuthData } from "./data.js";
import { authenticateStoreToken } from "./authenticate.js";

// Local error-body helper (matches gateway shape { error: { code, message } }).
const err = (code: string, message: string) => ({ error: { code, message } });
const firstHeader = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

export interface StoreAuthRouteDeps {
  data: StoreAuthData;
  policy: SessionPolicy;
  /**
   * Sunucu-tarafı deployment tenant slug'ı (STORE_ADMIN_STORE_SLUG). Login tenant context'i
   * YALNIZCA buradan çözülür; istemci hiçbir şekilde tenant seçemez. Tanımsız/boş ise tüm
   * store-auth login'ler fail-closed 401 döner (bilerek — güven-sınır invariant'ı).
   */
  configuredStoreSlug?: string;
  hashToken: (token: string) => string;
  verifyPassword: (password: string, passwordHash: string) => Promise<boolean>;
  createAuditLog: (input: {
    action: "LOGIN" | "LOGOUT";
    storeId?: string;
    actorKind?: "STORE_USER";
    actorStoreUserId?: string;
    actorName?: string | null;
    actorEmail?: string | null;
    entityType: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<void>;
  loginRateLimiter: {
    isLimited(ip: string, key: string): boolean;
    recordFailure(ip: string, key: string): void;
    reset(ip: string, key: string): void;
  };
  onError?: (e: unknown) => void;
}

export function registerStoreAuthRoutes(app: FastifyInstance, deps: StoreAuthRouteDeps): void {
  const bearer = (request: FastifyRequest): string | null =>
    request.headers.authorization?.replace(/^Bearer\s+/i, "") || null;

  async function authenticate(request: FastifyRequest, reply: FastifyReply, countAsActivity: boolean) {
    const result = await authenticateStoreToken(
      { data: deps.data, policy: deps.policy, hashToken: deps.hashToken, onTouchError: deps.onError },
      bearer(request),
      new Date(),
      { countAsActivity },
    );
    if (!result) {
      await reply.code(401).send(err("UNAUTHORIZED", "Unauthorized."));
      return null;
    }
    return result;
  }

  // POST /auth/store/login — tenant is resolved SERVER-SIDE from deployment config ONLY.
  // No request header (incl. legacy x-store-admin-tenant), host, or body/query field can select
  // the tenant: an arbitrary external caller cannot target another store. Fail-closed if unset.
  app.post("/auth/store/login", async (request, reply) => {
    const input = storeAdminLoginRequestSchema.parse(request.body);
    const tenant = resolveStoreAdminTenantContext({
      configuredStoreSlug: deps.configuredStoreSlug,
    });
    const normalizedEmail = input.email.toLowerCase();
    const genericFail = () => reply.code(401).send(err("INVALID_CREDENTIALS", "Invalid email or password."));
    if (!tenant) return genericFail();

    const rlKey = `${tenant.storeSlug}:${normalizedEmail}`;
    if (deps.loginRateLimiter.isLimited(request.ip, rlKey)) {
      return reply.code(429).send(err("AUTH_RATE_LIMITED", "Too many login attempts. Please try again later."));
    }

    const store = await deps.data.findStoreBySlug(tenant.storeSlug);
    const user = store ? await deps.data.findStoreUserForAuth(store.id, normalizedEmail) : null;
    // Run verify whenever a passwordHash exists (ACTIVE or DISABLED) to keep the disabled-vs-wrong-password
    // timing indistinguishable; the ACTIVE gate is applied to the boolean, not to whether verify runs.
    const passwordMatches = user?.passwordHash ? await deps.verifyPassword(input.password, user.passwordHash) : false;
    const ok = !!store && !!user && user.status === "ACTIVE" && passwordMatches;
    if (!ok) {
      deps.loginRateLimiter.recordFailure(request.ip, rlKey);
      return genericFail();
    }
    deps.loginRateLimiter.reset(request.ip, rlKey);

    const token = randomBytes(32).toString("base64url");
    const now = new Date();
    const { absoluteExpiresAt, expiresAt } = computeSessionExpiry(deps.policy, input.rememberMe, now);
    const session = await deps.data.createStoreSession({
      storeUserId: user!.id,
      storeId: store!.id,
      tokenHash: deps.hashToken(token),
      expiresAt,
      lastActivityAt: now,
      absoluteExpiresAt,
      rememberMe: input.rememberMe,
      userAgent: firstHeader(request.headers["user-agent"]) ?? null,
      ipAddress: request.ip,
    });
    await deps.data.updateStoreUserLastLogin(user!.id, now);
    await deps.createAuditLog({
      action: "LOGIN",
      storeId: store!.id,
      actorKind: "STORE_USER",
      actorStoreUserId: user!.id,
      actorName: user!.name,
      actorEmail: user!.email,
      entityType: "StoreUserSession",
      entityId: session.id,
      metadata: { authSurface: "store", rememberMe: input.rememberMe },
    });

    return storeAdminLoginResponseSchema.parse({
      token,
      expiresAt: expiresAt.toISOString(),
      user: { id: user!.id, storeId: store!.id, email: user!.email ?? normalizedEmail, name: user!.name, role: user!.role },
    });
  });

  app.post("/auth/store/logout", async (request, reply) => {
    const result = await authenticate(request, reply, false);
    if (!result) return;
    const revoked = await deps.data.revokeStoreSession(result.session.id);
    await deps.createAuditLog({
      action: "LOGOUT",
      storeId: result.principal.storeId,
      actorKind: "STORE_USER",
      actorStoreUserId: result.principal.storeUserId,
      actorName: result.principal.name,
      actorEmail: result.principal.email,
      entityType: "StoreUserSession",
      entityId: result.session.id,
      metadata: { authSurface: "store" },
    });
    return storeAdminLogoutResponseSchema.parse({ revoked });
  });

  app.get("/auth/store/session", async (request, reply) => {
    const result = await authenticate(request, reply, false); // passive; does not extend idle
    if (!result) return;
    const timing = sessionTiming(deps.policy, result.session);
    return storeAdminSessionResponseSchema.parse({
      user: {
        id: result.principal.storeUserId,
        storeId: result.principal.storeId,
        email: result.principal.email,
        name: result.principal.name,
        role: result.principal.role,
      },
      session: {
        timing: {
          idleExpiresAt: timing.idleExpiresAt.toISOString(),
          absoluteExpiresAt: timing.absoluteExpiresAt.toISOString(),
          warningLeadSeconds: timing.warningLeadSeconds,
          rememberMe: timing.rememberMe,
          lastActivityAt: timing.lastActivityAt.toISOString(),
        },
      },
    });
  });
}
