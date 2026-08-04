/**
 * TODO-UX (TD-UX-6 hardening) — Browser-smoke KİMLİK BİLGİSİ GÜVENLİĞİ.
 *
 * Kalıcı kural: bir browser smoke, MEVCUT (gerçek/seed) bir müşterinin parolasını DEĞİŞTİREMEZ. Bu
 * modül iki savunma sunar:
 *   1. `assertSmokeCredentialTarget` — yalnız `smk_`/`smoke-` gibi izole fixture kimliklerine izin verir;
 *      gerçek bir müşteri (ör. seed/manuel kayıt) hedeflenirse HERHANGİ bir mutasyondan ÖNCE fail-closed atar.
 *   2. `withSmokeCredential` — zorunluysa (login akışı) credential'ı `try/finally` içinde snapshot alır ve
 *      SONUNDA birebir restore eder (fixture değilse çalışmaz). Body hata atsa bile restore çalışır; restore
 *      başarısızsa hata yayılır (smoke başarısız sayılır).
 *
 * SAF (I/O yok) çekirdek + dependency-injected async sarmalayıcı → tam unit-testlenebilir.
 */

/** İzole smoke fixture kimlik önekleri (cleanup-smoke.ts konvansiyonuyla hizalı). */
export const SMOKE_ID_PREFIXES = ["smk_", "smoke-", "rev-", "test-"] as const;

export interface CredentialTarget {
  customerId: string;
  email?: string | null;
}

/** id VEYA email izole smoke önekiyle başlıyor mu? (SAF) */
export function isSmokeIdentity(target: CredentialTarget): boolean {
  const hit = (s?: string | null): boolean =>
    !!s && SMOKE_ID_PREFIXES.some((p) => s.startsWith(p));
  return hit(target.customerId) || hit(target.email);
}

/**
 * Fail-closed guard: hedef izole bir smoke fixture DEĞİLSE atar. Credential yazan HER smoke yardımcısı
 * mutasyondan önce bunu çağırmalı → gerçek/seed müşteri parolası ASLA ezilemez.
 */
export function assertSmokeCredentialTarget(target: CredentialTarget): void {
  if (!isSmokeIdentity(target)) {
    throw new Error(
      `Smoke güvenlik ihlali: gerçek/seed müşteri credential'ı (customerId=${target.customerId}` +
        `${target.email ? `, email=${target.email}` : ""}) smoke sırasında değiştirilemez. ` +
        `İzole bir 'smk_' fixture müşteri kullanın.`,
    );
  }
}

/** Snapshot: mevcut credential (yoksa null). */
export interface CredentialSnapshot {
  passwordHash: string;
  passwordChangedAt: Date;
}

export interface SmokeCredentialDeps {
  readCredential(customerId: string): Promise<CredentialSnapshot | null>;
  setCredential(customerId: string, passwordHash: string): Promise<void>;
  restoreCredential(customerId: string, snapshot: CredentialSnapshot): Promise<void>;
  deleteCredential(customerId: string): Promise<void>;
}

/**
 * Smoke için credential set eder, body'yi çalıştırır ve SONUNDA orijinali birebir restore eder (yoksa
 * oluşturduğu fixture credential'ı siler). Body hata atsa bile finally çalışır. Hedef izole fixture
 * değilse HİÇBİR mutasyon yapılmaz (guard önce atar). Restore hatası yayılır (smoke fail sayılır).
 */
export async function withSmokeCredential<T>(
  deps: SmokeCredentialDeps,
  target: CredentialTarget,
  passwordHash: string,
  body: () => Promise<T>,
): Promise<T> {
  assertSmokeCredentialTarget(target);
  const snapshot = await deps.readCredential(target.customerId);
  await deps.setCredential(target.customerId, passwordHash);
  try {
    return await body();
  } finally {
    if (snapshot) {
      await deps.restoreCredential(target.customerId, snapshot);
    } else {
      await deps.deleteCredential(target.customerId);
    }
  }
}
