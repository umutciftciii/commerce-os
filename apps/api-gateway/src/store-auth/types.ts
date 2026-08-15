/**
 * Store-auth (Faz B) — internal types.
 *
 * ADR-271 oturum modeli mağaza yöneticileri (StoreUser) için: kimlik doğrulama sonucu
 * dönen minimal principal + select-allowlist ile eşleşen oturum kaydı şekli. Bu modül
 * saf tip tanımlarıdır — Fastify/Prisma çalışma-zamanı bağımlılığı YOK.
 */
import type { StoreUserRole } from "@prisma/client";

/**
 * authenticateStoreToken başarılı dönüşünde taşınan asgari kimlik. `email` NON-NULL'dır:
 * kimlik-bütünlüğü eksik (null-email) StoreUser oturumu GEÇERSİZ sayılır (401) — bkz.
 * authenticate.ts. Böylece session DTO'su asla `email:""` sentineli üretmez / 500 vermez.
 */
export interface StoreSessionPrincipal {
  storeUserId: string;
  storeId: string;
  role: StoreUserRole;
  name: string | null;
  email: string; // normalize edilmiş (lowercase) e-posta — garantili non-null
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
  // Store status oturum doğrulamada değerlendirilir: mağaza sonradan SUSPENDED/CLOSED
  // (veya ACTIVE dışı) olursa mevcut oturum artık geçerli sayılmaz (bkz. authenticate.ts).
  // slug/name, /auth/store/session yanıtındaki store context için taşınır (Faz E1): BFF
  // aktif mağaza meta'sını yalnız oturumdan alır (mağaza listeleme / demo-first YOK).
  store: {
    slug: string;
    name: string;
    status: "DRAFT" | "ACTIVE" | "SUSPENDED" | "CLOSED";
  };
  storeUser: {
    id: string;
    storeId: string;
    email: string | null;
    name: string | null;
    role: StoreUserRole;
    status: "INVITED" | "ACTIVE" | "DISABLED";
  };
}
