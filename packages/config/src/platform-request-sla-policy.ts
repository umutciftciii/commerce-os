/**
 * TODO-178 — Store→Platform Request SLA politikası (platform-owned).
 *
 * SAF modul: `node:*` importu YOK, `process.env`e TOP-LEVEL erisim YOK (ticket-sla-policy.ts deseni).
 * Boylece gateway (Node) + Next BFF (server) tarafindan guvenle import edilir ve pure fonksiyonlar
 * unit-test edilebilir. Store MUTATE EDEMEZ: politika yalniz burada (config) tanimlidir ve yalniz
 * sunucu tarafinda tuketilir → mağazanin mutasyon yolu YOK (platform-owned by construction).
 *
 * Iki hedef: first-response + resolution. Anahtar = kategori `slaPolicyKey`'i (Product Support'ta
 * topic idi; burada platform-managed taxonomy'nin key'i). `byKey`'de olmayan anahtar (ör. "DEFAULT")
 * → `default` fallback. Bu, Product Support tablosunu DEGIL yalniz DESENINI reuse eder.
 */

export interface PlatformRequestSlaTarget {
  /** İlk yanit hedefi (saat). */
  firstResponseHours: number;
  /** Cozum hedefi (saat). */
  resolutionHours: number;
}

export interface PlatformRequestSlaPolicy {
  /** `byKey` override'i olmayan kategoriler icin fallback. */
  default: PlatformRequestSlaTarget;
  /** Kategori `slaPolicyKey` bazli override'lar (kismi; eksik key `default`e duser). */
  byKey: Record<string, PlatformRequestSlaTarget>;
}

/**
 * Platform DEFAULT request-SLA politikasi. Platform ops, musteri destegine gore daha rahat
 * hedeflerle calisir (default 24h/120h). Hicbir kategori dead-end degildir (hepsi `default`
 * veya override ile bir hedef alir). Kategori seed'inin `slaPolicyKey`'leri buradaki anahtarlara
 * (veya `default`e dusen "DEFAULT" sentinel'ine) isaret eder.
 */
export const DEFAULT_PLATFORM_REQUEST_SLA_POLICY: PlatformRequestSlaPolicy = {
  default: { firstResponseHours: 24, resolutionHours: 120 },
  byKey: {
    // Operasyonel mudahale — daha hizli.
    EXPEDITED: { firstResponseHours: 8, resolutionHours: 48 },
    // Politika incelemesi — daha uzun degerlendirme.
    POLICY_REVIEW: { firstResponseHours: 48, resolutionHours: 240 },
  },
};

/** Verilen sla policy key icin hedefi cozer (override → default fallback). Asla null donmez. */
export function resolvePlatformRequestSlaTarget(
  policy: PlatformRequestSlaPolicy,
  slaPolicyKey: string,
): PlatformRequestSlaTarget {
  return policy.byKey[slaPolicyKey] ?? policy.default;
}

const HOUR_MS = 3_600_000;

/**
 * `now` + hedef saatlerden deterministik son tarihleri uretir. Pure: `now` mutasyona ugramaz.
 * Request create/reopen sirasinda `PlatformRequestSlaSnapshot`'a yazilir.
 */
export function computePlatformRequestDueAts(
  now: Date,
  target: PlatformRequestSlaTarget,
): { firstResponseDueAt: Date; resolutionDueAt: Date } {
  const base = now.getTime();
  return {
    firstResponseDueAt: new Date(base + target.firstResponseHours * HOUR_MS),
    resolutionDueAt: new Date(base + target.resolutionHours * HOUR_MS),
  };
}
