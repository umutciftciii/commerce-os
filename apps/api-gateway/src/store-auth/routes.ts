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
  storeAdminSessionExtendResponseSchema,
} from "@commerce-os/contracts";
import type { SessionPolicy } from "@commerce-os/config";
import { computeSessionExpiry, effectiveAbsolute, sessionTiming } from "@commerce-os/config";
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
    action: "LOGIN" | "LOGOUT" | "UPDATE";
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
  /**
   * ADR-271 (Faz F) — extend uçları için ayrı rate limiter (Platform `isExtendLimited`/
   * `recordExtend` ile parity). Anahtar `${ip}:${sessionId}`. Opsiyonel: verilmezse extend
   * limitlenmez (test harness'ı ya da sınırlamayı üst katmanda yapan deployment).
   */
  extendRateLimiter?: {
    isLimited(key: string): boolean;
    record(key: string): void;
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
    // Store status policy (Faz D): yalnız ACTIVE mağaza login'e eligible; SUSPENDED/CLOSED/DRAFT → deny
    // (jenerik 401'e katlanır — enumeration yok). Not: null-email StoreUser zaten storeId_email ile
    // bulunamaz (email input non-null), dolayısıyla login üzerinden asla kimlik doğrulayamaz.
    const ok =
      !!store && store.status === "ACTIVE" && !!user && user.status === "ACTIVE" && passwordMatches;
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

  // POST /auth/store/extend (ADR-271, Faz F) — StoreUser oturum uzatma. YALNIZ geçerli (aktif)
  // oturum uzatılır: `authenticateStoreToken` revoked/idle-expired/absolute-expired/DISABLED-user/
  // non-ACTIVE-store/null-email hepsini jenerik 401 yapar (dirilme YOK). Token ROTATE edilir
  // (fixation savunması); absolute tavan DEĞİŞMEZ; idle capası yenilenir. Yarışta yalnız TEK
  // rotation kanonik başarılıdır; kaybeden ve replay eden eski token 401 (retry ile maskeleme YOK).
  // PlatformUser token'ı StoreUserSession'da bulunmaz → 401 (identity-bridge / dual-auth YOK).
  app.post("/auth/store/extend", async (request, reply) => {
    // Extend kendi rotation'ında lastActivityAt=now yazar; on-auth idle-bump gereksiz (çift yazım).
    const result = await authenticate(request, reply, false);
    if (!result) return;

    const rlKey = `${request.ip}:${result.session.id}`;
    if (deps.extendRateLimiter?.isLimited(rlKey)) {
      return reply.code(429).send(err("AUTH_RATE_LIMITED", "Too many attempts. Please try again later."));
    }
    deps.extendRateLimiter?.record(rlKey);

    const now = new Date();
    const abs = effectiveAbsolute(result.session); // absolute DEĞİŞMEZ (uzatılamaz)
    const newToken = randomBytes(32).toString("base64url");
    const rotated = await deps.data.rotateStoreSession({
      currentSessionId: result.session.id,
      storeUserId: result.principal.storeUserId,
      storeId: result.principal.storeId,
      newTokenHash: deps.hashToken(newToken),
      lastActivityAt: now,
      expiresAt: abs,
      absoluteExpiresAt: abs,
      rememberMe: result.session.rememberMe,
      userAgent: firstHeader(request.headers["user-agent"]) ?? null,
      ipAddress: request.ip,
    });
    if (!rotated) {
      // Yarışta eski oturum revoke/expired olduysa DİRİLTME.
      return reply.code(401).send(err("UNAUTHORIZED", "Unauthorized."));
    }
    await deps.createAuditLog({
      action: "UPDATE",
      storeId: result.principal.storeId,
      actorKind: "STORE_USER",
      actorStoreUserId: result.principal.storeUserId,
      actorName: result.principal.name,
      actorEmail: result.principal.email,
      entityType: "StoreUserSession",
      entityId: rotated.id,
      metadata: { authSurface: "store", event: "SESSION_EXTEND", rememberMe: result.session.rememberMe },
    });

    const timing = sessionTiming(deps.policy, {
      lastActivityAt: now,
      absoluteExpiresAt: abs,
      expiresAt: abs,
      rememberMe: result.session.rememberMe,
      revokedAt: null,
    });
    return storeAdminSessionExtendResponseSchema.parse({
      token: newToken,
      expiresAt: abs.toISOString(),
      timing: {
        idleExpiresAt: timing.idleExpiresAt.toISOString(),
        absoluteExpiresAt: timing.absoluteExpiresAt.toISOString(),
        warningLeadSeconds: timing.warningLeadSeconds,
        rememberMe: timing.rememberMe,
        lastActivityAt: timing.lastActivityAt.toISOString(),
      },
    });
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
      // Store context — SERVER-otoriter, oturumun bağlı olduğu mağazadan (Faz E1). BFF bu
      // meta'yı mağaza listeleyerek/demo-first seçerek DEĞİL yalnızca oturumdan alır.
      store: {
        id: result.principal.storeId,
        slug: result.session.store.slug,
        name: result.session.store.name,
        status: result.session.store.status,
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
