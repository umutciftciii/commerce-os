/**
 * Store-auth (Faz B) — internal types.
 *
 * ADR-271 oturum modeli mağaza yöneticileri (StoreUser) için: kimlik doğrulama sonucu
 * dönen minimal principal + select-allowlist ile eşleşen oturum kaydı şekli. Bu modül
 * saf tip tanımlarıdır — Fastify/Prisma çalışma-zamanı bağımlılığı YOK.
 */
import type { StoreUserRole } from "@prisma/client";

/** authenticateStoreToken başarılı dönüşünde taşınan asgari kimlik. */
export interface StoreSessionPrincipal {
  storeUserId: string;
  storeId: string;
  role: StoreUserRole;
  name: string | null;
  email: string; // normalize edilmiş (lowercase) e-posta
}

/**
 * Auth-scoped oturum kaydı — `findStoreSessionByTokenHash` select-allowlist'iyle
 * BİRE BİR eşleşir. passwordHash/tokenHash asla bu şeklin parçası DEĞİLDİR.
 */
export interface StoreSessionAuthRecord {
  id: string;
  storeId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  lastActivityAt: Date;
  absoluteExpiresAt: Date | null;
  rememberMe: boolean;
  policyVersion: number;
  storeUser: {
    id: string;
    storeId: string;
    email: string | null;
    name: string | null;
    role: StoreUserRole;
    status: "INVITED" | "ACTIVE" | "DISABLED";
  };
}
