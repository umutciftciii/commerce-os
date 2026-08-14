/**
 * Store-auth (Faz C, ADR-271 RBAC foundation) — gateway reusable guard'ları.
 *
 * KAPSAM: Faz E'de kullanılacak gerçek authorization primitive'leri. Bu faz route cutover
 * YAPMAZ; legacy `requireStorePlatformAdmin` (PlatformUser-backed) yerinde kalır. Bu guard
 * legacy'ye HİÇBİR ŞEKİLDE fallback ETMEZ.
 *
 * GÜVEN MODELİ:
 *  - YALNIZ StoreUserSession (bkz. authenticateStoreToken); PlatformUser fallback YOK.
 *  - ACTIVE StoreUser + valid/non-revoked/non-expired session; session.storeId authoritative.
 *  - Path'te `:storeId` varsa principal.storeId ile eşleşmeli; değilse 404 (existence-probing-safe).
 *  - Kanonik kompozisyon (auth → store → capability → permission) SAF `authorizeStoreRequest`
 *    ile hesaplanır; burada yalnız HTTP eşlemesi + request-context iliştirme yapılır.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { StoreUserRole } from "@prisma/client";
import type { SessionPolicy } from "@commerce-os/config";
import { authorizeStoreRequest, type StorePermission, type StoreRole } from "@commerce-os/auth";
import type { StoreAuthData } from "./data.js";
import type { StoreSessionAuthRecord } from "./types.js";
import { authenticateStoreToken } from "./authenticate.js";

/**
 * Request-context'e iliştirilen typed StoreUser principal. Domain service'ler ileride actor
 * snapshot'ı bundan alır (bkz. toStoreAuditActor). PlatformUser context'iyle KARIŞTIRILMAZ.
 * `email` NULLABLE'dır (native/unlinked StoreUser) — "" ile maskelenmez.
 */
export interface StoreUserRequestPrincipal {
  storeUserId: string;
  storeId: string;
  role: StoreUserRole;
  name: string | null;
  email: string | null;
  sessionId: string;
}

// Fastify request-context genişletmesi (per-request; AsyncLocalStorage/global DEĞİL).
declare module "fastify" {
  interface FastifyRequest {
    storeUserPrincipal: StoreUserRequestPrincipal | null;
  }
}

export interface StoreUserGuardDeps {
  data: Pick<StoreAuthData, "findStoreSessionByTokenHash" | "touchStoreSessionActivity">;
  policy: SessionPolicy;
  hashToken: (token: string) => string;
  /**
   * Capability çözümleyici (mevcut capability cache: `isEnabled`). Bir capabilityKey istenip
   * bu çözümleyici verilmezse guard FAIL-CLOSED davranır (capability doğrulanamadı → deny).
   */
  isCapabilityEnabled?: (storeId: string, capabilityKey: string) => boolean | Promise<boolean>;
  onError?: (e: unknown) => void;
}

interface GuardOptions {
  pathStoreId?: string;
  requiredPermission?: StorePermission;
  capabilityKey?: string;
}

const err = (code: string, message: string) => ({ error: { code, message } });

const bearer = (request: FastifyRequest): string | null =>
  request.headers.authorization?.replace(/^Bearer\s+/i, "") || null;

function toRequestPrincipal(session: StoreSessionAuthRecord): StoreUserRequestPrincipal {
  return {
    storeUserId: session.storeUser.id,
    storeId: session.storeId, // session authoritative
    role: session.storeUser.role,
    name: session.storeUser.name,
    email: session.storeUser.email, // gerçek değer (nullable) — "" maskesi yok
    sessionId: session.id,
  };
}

/**
 * StoreUser principal → audit actor projeksiyonu (STORE_USER). PlatformUser id beklenen
 * yerlere sahte/linked id SOKMAZ; actorStoreUserId ayrı bir alandır.
 */
export function toStoreAuditActor(principal: StoreUserRequestPrincipal): {
  actorKind: "STORE_USER";
  actorStoreUserId: string;
  actorName: string | null;
  actorEmail: string | null;
} {
  return {
    actorKind: "STORE_USER",
    actorStoreUserId: principal.storeUserId,
    actorName: principal.name,
    actorEmail: principal.email,
  };
}

/** Request-context'ten typed StoreUser principal accessor'ı (domain service'ler için). */
export function getStoreUserPrincipal(request: FastifyRequest): StoreUserRequestPrincipal | null {
  return request.storeUserPrincipal ?? null;
}

export interface StoreUserGuards {
  /** Yalnız kimlik + (opsiyonel) path storeId eşleşmesi. Başarıda principal döner + context'e iliştirir. */
  requireStoreUser: (
    request: FastifyRequest,
    reply: FastifyReply,
    opts?: { pathStoreId?: string },
  ) => Promise<StoreUserRequestPrincipal | null>;
  /** Kimlik + (opsiyonel path storeId) + (opsiyonel capability) + RBAC permission. Curried (legacy require*ForModule ile aynı biçim). */
  requireStorePermission: (
    permission: StorePermission,
    opts?: { capabilityKey?: string },
  ) => (
    request: FastifyRequest,
    reply: FastifyReply,
    pathStoreId?: string,
  ) => Promise<StoreUserRequestPrincipal | null>;
  /** Hassas/manage-tier operasyonlar için composable. permission `:manage` olmalıdır (misuse → programlama hatası). */
  requireStoreManage: (
    permission: StorePermission,
    opts?: { capabilityKey?: string },
  ) => (
    request: FastifyRequest,
    reply: FastifyReply,
    pathStoreId?: string,
  ) => Promise<StoreUserRequestPrincipal | null>;
  getStoreUserPrincipal: typeof getStoreUserPrincipal;
}

export function createStoreUserGuard(app: FastifyInstance, deps: StoreUserGuardDeps): StoreUserGuards {
  // İlk request-context decorator'ı (bu repoda önceki bir precedent yok). Idempotent.
  if (!app.hasRequestDecorator("storeUserPrincipal")) {
    app.decorateRequest("storeUserPrincipal", null);
  }

  async function runGuard(
    request: FastifyRequest,
    reply: FastifyReply,
    opts: GuardOptions,
  ): Promise<StoreUserRequestPrincipal | null> {
    const result = await authenticateStoreToken(
      { data: deps.data, policy: deps.policy, hashToken: deps.hashToken, onTouchError: deps.onError },
      bearer(request),
      new Date(),
      { countAsActivity: true },
    );
    const principal = result ? toRequestPrincipal(result.session) : null;

    let capabilityEnabled: boolean | undefined;
    if (opts.capabilityKey) {
      // Capability kapısı istendi. principal yoksa auth kararı zaten reddedecek; principal varsa
      // çözümle. Çözümleyici yoksa FAIL-CLOSED (doğrulanamadı → kapalı say).
      capabilityEnabled = principal
        ? deps.isCapabilityEnabled
          ? await deps.isCapabilityEnabled(principal.storeId, opts.capabilityKey)
          : false
        : false;
    }

    const decision = authorizeStoreRequest({
      principal: principal ? { storeId: principal.storeId, role: principal.role as StoreRole } : null,
      pathStoreId: opts.pathStoreId,
      requiredPermission: opts.requiredPermission,
      capabilityEnabled,
    });

    if (decision.allowed) {
      request.storeUserPrincipal = principal;
      return principal;
    }

    switch (decision.reason) {
      case "UNAUTHENTICATED":
        await reply.code(401).send(err("UNAUTHORIZED", "Unauthorized."));
        return null;
      case "STORE_MISMATCH":
        // Legacy requireStorePlatformAdmin ile aynı 404 (tenant-leak-free).
        await reply.code(404).send(err("STORE_ACCESS_DENIED", "Store access denied."));
        return null;
      case "CAPABILITY_DISABLED":
        // Kanonik admin module-disabled semantiği (requireCapability ile aynı).
        await reply
          .code(403)
          .send(err("MODULE_DISABLED", `Module '${opts.capabilityKey}' is disabled for this store.`));
        return null;
      case "PERMISSION_DENIED":
        // Jenerik: gereken permission'ı/role'ü ECHO ETMEZ (hassas iç detay leak yok).
        await reply.code(403).send(err("FORBIDDEN", "Insufficient permissions."));
        return null;
    }
  }

  const requireStoreUser: StoreUserGuards["requireStoreUser"] = (request, reply, opts) =>
    runGuard(request, reply, { pathStoreId: opts?.pathStoreId });

  const requireStorePermission: StoreUserGuards["requireStorePermission"] =
    (permission, opts) => (request, reply, pathStoreId) =>
      runGuard(request, reply, {
        pathStoreId,
        requiredPermission: permission,
        capabilityKey: opts?.capabilityKey,
      });

  const requireStoreManage: StoreUserGuards["requireStoreManage"] = (permission, opts) => {
    // Manage-tier kontrolü çağrı-yerinde niyeti belgeler (hassas op foundation). Yanlış
    // kullanım = programlama hatası (isteği reddetmek değil, geliştiriciyi uyarmak için throw).
    if (!permission.endsWith(":manage")) {
      throw new Error(`requireStoreManage expects a ':manage' permission, got '${permission}'.`);
    }
    // Store-local hassas op'lar (refunds/shopping-balance/settings :manage) `isSensitiveStorePermission`
    // ile @commerce-os/auth'ta sınıflandırılır. SUPER_ADMIN triage PLATFORM tarafında kalır; bu guard
    // StoreUser'a platform override/fallback AÇMAZ.
    return requireStorePermission(permission, opts);
  };

  return { requireStoreUser, requireStorePermission, requireStoreManage, getStoreUserPrincipal };
}
