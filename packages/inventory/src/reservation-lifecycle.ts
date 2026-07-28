/**
 * H-3 (ADR-187…191) — Rezervasyon lifecycle SAF çekirdeği (DB'siz, DI-testable).
 *
 * Burada YALNIZ karar mantığı yaşar: TTL/expiry hesabı, read-time available add-back, state-machine
 * guard'ları. Gerçek DB mutasyonları (placeOrder/consume/release/sweep) server.ts + worker'da bu
 * saf fonksiyonları çağırır. Client timestamp OTORİTE DEĞİLDİR; tüm zaman sunucudan (`now`) gelir.
 */

/** Rezervasyon lifecycle durumu (schema `InventoryReservationStatus` ile birebir). */
export type ReservationStatus = "ACTIVE" | "CONSUMED" | "RELEASED" | "EXPIRED";

/** Terminal (yeniden ACTIVE olamaz) durumlar. */
const TERMINAL: ReadonlySet<ReservationStatus> = new Set(["CONSUMED", "RELEASED", "EXPIRED"]);

export function isTerminalReservation(status: ReservationStatus): boolean {
  return TERMINAL.has(status);
}

/** Consume yalnız ACTIVE rezervasyonda geçerli (idempotency: terminal → no-op). */
export function canConsume(status: ReservationStatus): boolean {
  return status === "ACTIVE";
}

/** Release/expire yalnız ACTIVE rezervasyonda geçerli (idempotency: terminal → no-op). */
export function canRelease(status: ReservationStatus): boolean {
  return status === "ACTIVE";
}

/** Release/expire nedeni (audit; PII taşımaz). */
export type ReleaseReason =
  | "ORDER_CANCELLED"
  | "PAYMENT_CANCELLED"
  | "RESERVATION_EXPIRED"
  | "ORPHAN_DRAFT"
  | "MANUAL";

/** TTL parametreleri (config'ten türetilir, sunucu-otoriter). Tümü dakika. */
export interface ReservationTtlPolicy {
  /** Checkout rezervasyonu varsayılan ömrü (dk). */
  ttlMinutes: number;
  /** Ödeme oturumu açılınca (PAYMENT_PENDING) uzatılan pencere (dk). */
  paymentWindowMinutes: number;
  /** createdAt'ten itibaren mutlak üst sınır (dk). Yenileme bunu AŞAMAZ. */
  maxMinutes: number;
}

/** Yeni ACTIVE rezervasyon için ilk `expiresAt` = createdAt + ttl. */
export function computeInitialExpiresAt(createdAt: Date, policy: ReservationTtlPolicy): Date {
  return new Date(createdAt.getTime() + policy.ttlMinutes * 60_000);
}

/**
 * Ödeme oturumu başlangıcında (tek kontrollü yenileme) yeni `expiresAt`.
 * = min(now + paymentWindow, createdAt + maxMinutes). Sayfa yenileme uzatmaz; yalnız gerçek ödeme
 * ilerlemesi bu fonksiyonu tetikler. Hesaplanan değer mevcut `expiresAt`'ten küçükse UZATMAZ (geri almaz).
 */
export function computePaymentWindowExpiresAt(
  createdAt: Date,
  now: Date,
  currentExpiresAt: Date | null,
  policy: ReservationTtlPolicy,
): Date {
  const hardCap = createdAt.getTime() + policy.maxMinutes * 60_000;
  const window = now.getTime() + policy.paymentWindowMinutes * 60_000;
  const proposed = Math.min(window, hardCap); // pencere hard cap'i aşamaz
  const current = currentExpiresAt?.getTime() ?? 0;
  // Yalnız ileriye uzatır (asla kısaltmaz); hard cap üstüne çıkmaz (current zaten <= cap).
  return new Date(Math.max(proposed, current));
}

/**
 * Read-time kullanılabilir stok: sayaç bazlı + süresi dolmuş ama henüz süpürülmemiş ACTIVE
 * rezervasyonların GERİ EKLENMESİ. Doğruluk scheduler'a bağlı DEĞİL.
 *   available = max(0, onHand − reserved + expiredActiveReserved)
 */
export function effectiveAvailable(onHand: number, reserved: number, expiredActiveReserved: number): number {
  return Math.max(0, onHand - reserved + expiredActiveReserved);
}

/**
 * Bir rezervasyon süpürücü cutoff'una göre süresi dolmuş aday mı?
 * ACTIVE + expiresAt != null + expiresAt <= cutoff. (NULL expiresAt = meşru/kalıcı tutulan → aday değil.)
 */
export function isExpiryCandidate(
  status: ReservationStatus,
  expiresAt: Date | null,
  cutoff: Date,
): boolean {
  return status === "ACTIVE" && expiresAt !== null && expiresAt.getTime() <= cutoff.getTime();
}

/** Ödeme durumu "ödenmiş sayılır" mı? (consume tetikleyen / expiry-koruyan durumlar.) */
export type OrderPaymentStatusLike =
  | "UNPAID"
  | "PAYMENT_PENDING"
  | "AUTHORIZED"
  | "PAID"
  | "PARTIALLY_REFUNDED"
  | "REFUNDED"
  | "PAYMENT_FAILED"
  | "CANCELLED";

/** PAID/AUTHORIZED → satış kesinleşti; expiry job rezervasyonu BIRAKMAZ (reconcile/consume). */
export function isPaidForCommit(paymentStatus: OrderPaymentStatusLike): boolean {
  return paymentStatus === "PAID" || paymentStatus === "AUTHORIZED" || paymentStatus === "PARTIALLY_REFUNDED";
}

/**
 * Expiry job'ın kilit altında yeniden-okuma kararı (ADR-191, payment-vs-expiry race):
 *  - order PAID/AUTHORIZED → CONSUME_INSTEAD (bırakma; commit et/atla)
 *  - order UNPAID/PENDING/FAILED ve aday → EXPIRE (bırak + EXPIRED)
 *  - aksi halde → SKIP
 */
export type ExpiryDecision = "EXPIRE" | "CONSUME_INSTEAD" | "SKIP";

export function decideExpiry(
  status: ReservationStatus,
  paymentStatus: OrderPaymentStatusLike,
  isCandidate: boolean,
): ExpiryDecision {
  if (status !== "ACTIVE") return "SKIP";
  if (isPaidForCommit(paymentStatus)) return "CONSUME_INSTEAD";
  if (!isCandidate) return "SKIP";
  return "EXPIRE";
}
