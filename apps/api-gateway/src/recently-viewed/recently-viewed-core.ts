/**
 * TODO-161B (ADR-137/138) — Recently Viewed SAF çekirdeği (prisma/fastify yok; deterministik).
 *
 * Kayıt-uygunluk kararı (bot/prefetch/kimlik), guest→customer merge sayaç birleştirme ve limit clamp
 * yardımcıları. HAM IP/UA burada YOK; yalnız karar mantığı. İzole test edilir.
 */

/** Prefetch/preload isteği mi? Tarayıcı/crawler'lar PDP'yi önceden çeker → görüntüleme SAYILMAZ. */
export function isPrefetchRequest(headers: {
  secPurpose?: string | string[] | undefined;
  purpose?: string | string[] | undefined;
  xPurpose?: string | string[] | undefined;
  xMoz?: string | string[] | undefined;
}): boolean {
  const norm = (v: string | string[] | undefined): string =>
    (Array.isArray(v) ? v[0] ?? "" : v ?? "").toLowerCase();
  const values = [norm(headers.secPurpose), norm(headers.purpose), norm(headers.xPurpose), norm(headers.xMoz)];
  return values.some((v) => v.includes("prefetch") || v.includes("preload") || v.includes("prerender"));
}

export interface RecordEligibilityInput {
  isBot: boolean;
  isPrefetch: boolean;
  hasIdentity: boolean;
  hasProductId: boolean;
}

/**
 * Görüntüleme kaydedilsin mi? Bot / prefetch / kimliksiz / ürünsüz → HAYIR (sessiz no-op, PDP bloklanmaz).
 * Tek karar noktası — route bunu çağırır.
 */
export function shouldRecordView(input: RecordEligibilityInput): boolean {
  if (input.isBot) return false;
  if (input.isPrefetch) return false;
  if (!input.hasIdentity) return false;
  if (!input.hasProductId) return false;
  return true;
}

/**
 * Guest→customer merge'te aynı ürün için viewCount birleştirme: iki sayacın toplamı, cap ile sınırlı.
 * (ADR-138: idempotent; tekrar merge şişirmez çünkü guest satırları merge sonrası temizlenir.)
 */
export function mergeViewCount(customerCount: number, guestCount: number, cap: number): number {
  const sum = Math.max(0, customerCount) + Math.max(0, guestCount);
  return Math.min(Math.max(1, cap), Math.max(1, sum));
}

/** İki lastViewedAt'ten en güncelini seç (merge'te en güncel korunur). */
export function mostRecent(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
}

/** İstenen limit'i [1, max] aralığına clamp'ler; geçersiz/eksikse default. */
export function clampLimit(requested: number | undefined, fallback: number, max: number): number {
  if (requested === undefined || !Number.isFinite(requested)) return fallback;
  const n = Math.trunc(requested);
  if (n < 1) return fallback;
  return Math.min(n, max);
}
