/**
 * Store-auth (Faz B) — veri erişimi (SELECT-ALLOWLIST).
 *
 * Kural: `passwordHash` YALNIZ `findStoreUserForAuth`'ta seçilir (login doğrulaması için
 * zorunlu); başka HİÇBİR select'te yer almaz. `tokenHash` hiçbir select sonucunda çağırana
 * DÖNMEZ (yalnız `where` filtresi olarak kullanılır). `process.env`/Fastify importu YOK —
 * `PrismaClient` dışarıdan enjekte edilir (test edilebilirlik + server.ts'den ayrışma).
 */
import type { PrismaClient } from "@prisma/client";
import type { StoreSessionAuthRecord } from "./types.js";

export function createStoreAuthData(prisma: PrismaClient) {
  return {
    // Tenant mağaza çözümü (login). Fail-closed: bulunamazsa null.
    findStoreBySlug: (slug: string) =>
      prisma.store.findUnique({
        where: { slug },
        select: { id: true, slug: true, status: true },
      }),

    // Kimlik-bilgisi araması. passwordHash SADECE burada (doğrulama için gerekli).
    findStoreUserForAuth: (storeId: string, normalizedEmail: string) =>
      prisma.storeUser.findUnique({
        where: { storeId_email: { storeId, email: normalizedEmail } },
        select: {
          id: true,
          storeId: true,
          email: true,
          name: true,
          role: true,
          status: true,
          passwordHash: true,
        },
      }),

    createStoreSession: (input: {
      storeUserId: string;
      storeId: string;
      tokenHash: string;
      expiresAt: Date;
      lastActivityAt: Date;
      absoluteExpiresAt: Date;
      rememberMe: boolean;
      userAgent?: string | null;
      ipAddress?: string | null;
    }) =>
      prisma.storeUserSession.create({
        data: { ...input },
        select: { id: true, expiresAt: true },
      }),

    // Oturum doğrulama araması. passwordHash YOK, tokenHash çağırana ASLA YANSITILMAZ.
    findStoreSessionByTokenHash: (tokenHash: string): Promise<StoreSessionAuthRecord | null> =>
      prisma.storeUserSession.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          storeId: true,
          expiresAt: true,
          revokedAt: true,
          lastActivityAt: true,
          absoluteExpiresAt: true,
          rememberMe: true,
          policyVersion: true,
          // Store status: mağaza SUSPENDED/CLOSED olduğunda mevcut oturum reddedilir (authenticate.ts).
          // slug/name: /auth/store/session store context'i için (Faz E1) — server-otoriter.
          store: { select: { slug: true, name: true, status: true } },
          storeUser: {
            select: {
              id: true,
              storeId: true,
              email: true,
              name: true,
              role: true,
              status: true,
            },
          },
        },
      }),

    // Idempotent-safe: yalnız ACTIVE (revokedAt IS NULL) satırı iptal eder.
    revokeStoreSession: async (sessionId: string): Promise<boolean> => {
      const res = await prisma.storeUserSession.updateMany({
        where: { id: sessionId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return res.count > 0;
    },

    // ADR-271 (Faz F) — extend/rotation: eskiyi revoke + yenisini oluştur, TEK transaction.
    // `rotatePlatformSession`/`rotateSession` (customer) ile birebir semantik. absoluteExpiresAt
    // DEĞİŞMEZ (çağıran `effectiveAbsolute(session)`'ı geçirir; idle capası `lastActivityAt=now`
    // ile yenilenir). Eşzamanlılık: `updateMany where revokedAt:null` yalnız TEK çağırana count>0
    // verir → race'te tek kanonik başarı; kaybeden (ve replay eden eski token) count=0 → null
    // (dirilme YOK, retry ile maskeleme YOK). Yeni satır `rotatedFromSessionId` ile zincir izlenir.
    rotateStoreSession: async (input: {
      currentSessionId: string;
      storeUserId: string;
      storeId: string;
      newTokenHash: string;
      lastActivityAt: Date;
      expiresAt: Date;
      absoluteExpiresAt: Date;
      rememberMe: boolean;
      userAgent?: string | null;
      ipAddress?: string | null;
    }): Promise<{ id: string; expiresAt: Date } | null> => {
      return prisma.$transaction(async (tx) => {
        const revoked = await tx.storeUserSession.updateMany({
          where: { id: input.currentSessionId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        // Yarışta eski oturum zaten revoke/expired olduysa DİRİLTME: rotation reddedilir.
        if (revoked.count === 0) return null;
        return tx.storeUserSession.create({
          data: {
            storeUserId: input.storeUserId,
            storeId: input.storeId,
            tokenHash: input.newTokenHash,
            expiresAt: input.expiresAt,
            lastActivityAt: input.lastActivityAt,
            absoluteExpiresAt: input.absoluteExpiresAt,
            rememberMe: input.rememberMe,
            rotatedFromSessionId: input.currentSessionId,
            userAgent: input.userAgent ?? null,
            ipAddress: input.ipAddress ?? null,
          },
          select: { id: true, expiresAt: true },
        });
      });
    },

    touchStoreSessionActivity: (sessionId: string, now: Date, promoteLegacy = false) =>
      prisma.storeUserSession.update({
        where: { id: sessionId },
        data: { lastActivityAt: now, ...(promoteLegacy ? { policyVersion: 1 } : {}) },
        select: { id: true },
      }),

    updateStoreUserLastLogin: (storeUserId: string, now: Date) =>
      prisma.storeUser.update({
        where: { id: storeUserId },
        data: { lastLoginAt: now },
        select: { id: true },
      }),
  };
}

export type StoreAuthData = ReturnType<typeof createStoreAuthData>;
