import type { PaymentAttemptStatus, PaymentStatus } from "@prisma/client";

/**
 * TODO-159F (ADR-095) — Order Payment Recovery state machine (SAF, yan etkisiz).
 *
 * Sipariş ödeme durumunun TEK OTORİTESİDİR. Tahsilat uygunluğu, aktif attempt
 * tespiti, attempt→order durum geçişleri ve kalan bakiye türetimi burada tanımlıdır.
 * İstemci payload'ına ASLA güvenilmez; tutar daima order snapshot'ından gelir.
 *
 * Kurallar (spec §2):
 *  - PAID / REFUNDED / CANCELLED / PARTIALLY_REFUNDED sipariş için yeni tahsilat YOK.
 *  - AUTHORIZED sipariş için yeni tahsilat YOK (zaten shipment'a uygun; capture ayrı).
 *  - UNPAID / PAYMENT_FAILED / PAYMENT_PENDING sipariş yeniden tahsilata uygundur
 *    (PAYMENT_PENDING'de aktif attempt varsa ÇAĞIRAN taraf yeni oturum yerine mevcut
 *    olanı kullanır — bkz. isAttemptActive).
 *  - Terminal (PAID) durumdan sonra geç gelen FAILED/CANCELLED webhook geriye ÇEVİRMEZ
 *    (webhook ordering — resolveOrderPaymentTransition monotonic'tir).
 */

/** Yeni tahsilat başlatmayı KESİN engelleyen sipariş ödeme durumları (terminal). */
export const TERMINAL_ORDER_PAYMENT_STATUSES: readonly PaymentStatus[] = [
  "PAID",
  "AUTHORIZED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
  "CANCELLED",
];

/** Bir denemenin (attempt) daha ileri işlem görmeyeceği terminal durumları. */
export const TERMINAL_ATTEMPT_STATUSES: readonly PaymentAttemptStatus[] = [
  "PAID",
  "AUTHORIZED",
  "FAILED",
  "CANCELLED",
  "REFUNDED",
];

/** Aktif (henüz sonuçlanmamış) online deneme durumları. */
export const ACTIVE_ATTEMPT_STATUSES: readonly PaymentAttemptStatus[] = [
  "CREATED",
  "PENDING",
  "REQUIRES_ACTION",
];

/**
 * Sipariş bu ödeme durumundayken YENİ bir tahsilat (ödeme bağlantısı / manuel kayıt)
 * başlatılabilir mi? Terminal durumlar için false. PAYMENT_PENDING'de true döner;
 * aktif attempt olup olmadığını çağıran taraf ayrıca kontrol eder (idempotency).
 */
export function canStartCollection(status: PaymentStatus): boolean {
  return !TERMINAL_ORDER_PAYMENT_STATUSES.includes(status);
}

export function isAttemptTerminal(status: PaymentAttemptStatus): boolean {
  return TERMINAL_ATTEMPT_STATUSES.includes(status);
}

export interface AttemptActivityView {
  status: PaymentAttemptStatus;
  expiresAt: Date | null;
}

/**
 * Deneme ŞU AN aktif mi? (paralel ikinci oturumu engelleyen). Terminal durumlar aktif
 * değildir. Süresi dolmuş (expiresAt <= now) deneme aktif SAYILMAZ → yeni deneme oluşturmayı
 * ENGELLEMEZ (spec §2: "Süresi dolmuş/başarısız attempt yeni attempt oluşturulmasına engel değil").
 */
export function isAttemptActive(attempt: AttemptActivityView, now: Date): boolean {
  if (!ACTIVE_ATTEMPT_STATUSES.includes(attempt.status)) {
    return false;
  }
  if (attempt.expiresAt !== null && attempt.expiresAt.getTime() <= now.getTime()) {
    return false;
  }
  return true;
}

/**
 * Bir attempt sonucunun (status) sipariş ödeme durumuna DOĞRUDAN karşılığı.
 * REFUNDED order-seviyesinde ayrı ele alınır (kısmi/tam iade), burada tam iade kabul edilir.
 */
export function mapAttemptStatusToOrderStatus(status: PaymentAttemptStatus): PaymentStatus | null {
  switch (status) {
    case "PAID":
      return "PAID";
    case "AUTHORIZED":
      return "AUTHORIZED";
    case "CREATED":
    case "PENDING":
    case "REQUIRES_ACTION":
      return "PAYMENT_PENDING";
    case "FAILED":
    case "CANCELLED":
      // Tek deneme başarısız/iptal → sipariş yeniden denenebilir (order CANCELLED DEĞİL).
      return "PAYMENT_FAILED";
    case "REFUNDED":
      return "REFUNDED";
    default:
      return null;
  }
}

/** "Ödenmiş" (captured) sayılan sipariş ödeme durumları — kalan bakiye türetimi için. */
export function isSettledOrderStatus(status: PaymentStatus): boolean {
  return status === "PAID" || status === "AUTHORIZED";
}

/** "Ödenmiş" (captured) sayılan deneme durumları. */
export function isSettledAttemptStatus(status: PaymentAttemptStatus): boolean {
  return status === "PAID" || status === "AUTHORIZED";
}

/**
 * Sipariş ödeme durumu geçişini MONOTONIC olarak çözer (webhook ordering guard, ADR-100).
 * `current` terminal-paid ise (PAID/AUTHORIZED/REFUNDED/PARTIALLY_REFUNDED/CANCELLED),
 * yalnızca gerçek bir iade (REFUNDED) ileri geçiştir; başarısız/bekleyen geç webhook
 * durumu GERİYE çevirmez (null döner = değişiklik yok).
 *
 * @returns uygulanacak yeni PaymentStatus, ya da null (değişiklik yapma).
 */
export function resolveOrderPaymentTransition(
  current: PaymentStatus,
  attemptStatus: PaymentAttemptStatus,
): PaymentStatus | null {
  const target = mapAttemptStatusToOrderStatus(attemptStatus);
  if (target === null) {
    return null;
  }
  if (target === current) {
    return null;
  }
  // Terminal-paid bir siparişte yalnız iade ileri geçiştir; gerisi no-op (late webhook).
  if (TERMINAL_ORDER_PAYMENT_STATUSES.includes(current)) {
    if (target === "REFUNDED" && (current === "PAID" || current === "AUTHORIZED")) {
      return "REFUNDED";
    }
    return null;
  }
  return target;
}

export interface CapturedAttemptView {
  status: PaymentAttemptStatus;
  amount: number;
}

/** Bu siparişte TAHSİL EDİLMİŞ (PAID/AUTHORIZED) denemelerin toplam tutarı (minor). */
export function sumCapturedMinor(attempts: readonly CapturedAttemptView[]): number {
  return attempts
    .filter((attempt) => isSettledAttemptStatus(attempt.status))
    .reduce((sum, attempt) => sum + attempt.amount, 0);
}

/**
 * Kalan bakiye (minor) — daima order snapshot toplamı üzerinden. Negatif olmaz.
 * capturedMinor, order snapshot'tan türetilen tahsil edilmiş toplamdır.
 */
export function computeRemainingMinor(totalAmountMinor: number, capturedMinor: number): number {
  return Math.max(0, totalAmountMinor - capturedMinor);
}

/**
 * Manuel/online tahsilatta AŞIRI-tahsilat (overpayment) kontrolü: talep edilen tutar
 * kalan bakiyeyi aşamaz (spec §3). Kalan 0 ise (zaten ödenmiş) hiç tahsilat yapılamaz.
 */
export function isWithinRemaining(requestedMinor: number, remainingMinor: number): boolean {
  return requestedMinor > 0 && requestedMinor <= remainingMinor;
}
