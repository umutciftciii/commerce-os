/**
 * TODO-174B (ADR-281/284) — Store Credit ledger SAF hesap çekirdeği (finansal invariant otoritesi).
 *
 * DB'siz, yan etkisiz, tamamen BigInt (float YOK). Bakiye OTORİTESİ = Σ "spendable" lot remaining
 * (status=ACTIVE ∧ remaining>0 ∧ expiresAt > now). FEFO tüketim: en erken sona erecek lot önce
 * (expiresAt ASC, createdAt ASC, id ASC deterministik tiebreak). Bu modül servis (service.ts) ve
 * expiry worker tarafından tüketilir; tüm invariant testleri buraya dayanır.
 */
import type { CreditLotStatus } from "@prisma/client";

/** Grant başına izin verilen son kullanım süreleri (gün). Maks 180 (ADR-284). */
export const CREDIT_EXPIRY_DAY_OPTIONS = [30, 60, 120, 180] as const;
export type CreditExpiryDays = (typeof CREDIT_EXPIRY_DAY_OPTIONS)[number];

export function isValidExpiryDays(days: number): days is CreditExpiryDays {
  return (CREDIT_EXPIRY_DAY_OPTIONS as readonly number[]).includes(days);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** now + days*gün (saat/dakika korunur; grant anına göre kesin pencere). */
export function computeExpiresAt(now: Date, days: CreditExpiryDays): Date {
  return new Date(now.getTime() + days * DAY_MS);
}

/** Saf lot görünümü (DB satırının hesaba giren alt kümesi). */
export interface CreditLotView {
  id: string;
  remainingAmountMinor: bigint;
  expiresAt: Date;
  status: CreditLotStatus;
  createdAt: Date;
}

/** Lot şu anda harcanabilir mi? ACTIVE ∧ remaining>0 ∧ henüz süresi dolmamış (expiresAt > now). */
export function isLotSpendable(lot: CreditLotView, now: Date): boolean {
  return lot.status === "ACTIVE" && lot.remainingAmountMinor > 0n && lot.expiresAt.getTime() > now.getTime();
}

/** Kullanılabilir bakiye (minor) = Σ spendable lot remaining. Süresi geçen lot HÂRİÇ (worker'dan bağımsız). */
export function availableBalanceMinor(lots: readonly CreditLotView[], now: Date): bigint {
  let sum = 0n;
  for (const lot of lots) {
    if (isLotSpendable(lot, now)) sum += lot.remainingAmountMinor;
  }
  return sum;
}

/** FEFO sıralaması: expiresAt ASC → createdAt ASC → id ASC (deterministik). Yeni dizi döner. */
export function sortFefo(lots: readonly CreditLotView[]): CreditLotView[] {
  return [...lots].sort((a, b) => {
    const ae = a.expiresAt.getTime();
    const be = b.expiresAt.getTime();
    if (ae !== be) return ae - be;
    const ac = a.createdAt.getTime();
    const bc = b.createdAt.getTime();
    if (ac !== bc) return ac - bc;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export interface SpendAllocation {
  lotId: string;
  amountMinor: bigint;
}

export type AllocateResult =
  | { ok: true; allocations: SpendAllocation[]; totalMinor: bigint }
  | { ok: false; code: "INSUFFICIENT_BALANCE" };

/**
 * FEFO harcama tahsisi. requestedMinor > available ise INSUFFICIENT_BALANCE.
 * requestedMinor <= 0 ise boş tahsis (harcama yok) — çağıran taraf zaten min(available, payable)
 * uygular; yine de savunmacı: 0/negatif için boş liste döner.
 */
export function allocateFefo(
  lots: readonly CreditLotView[],
  requestedMinor: bigint,
  now: Date,
): AllocateResult {
  if (requestedMinor <= 0n) return { ok: true, allocations: [], totalMinor: 0n };
  const spendable = sortFefo(lots.filter((l) => isLotSpendable(l, now)));
  const available = spendable.reduce((s, l) => s + l.remainingAmountMinor, 0n);
  if (requestedMinor > available) return { ok: false, code: "INSUFFICIENT_BALANCE" };

  const allocations: SpendAllocation[] = [];
  let remaining = requestedMinor;
  for (const lot of spendable) {
    if (remaining <= 0n) break;
    const take = lot.remainingAmountMinor < remaining ? lot.remainingAmountMinor : remaining;
    if (take > 0n) {
      allocations.push({ lotId: lot.id, amountMinor: take });
      remaining -= take;
    }
  }
  // remaining 0 olmalı (available yeterliydi); savunmacı invariant.
  return { ok: true, allocations, totalMinor: requestedMinor - remaining };
}

/** min(a, b) — BigInt. Checkout: creditUsed = min(available, payable). */
export function minBigInt(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

export interface RestoreCandidate {
  lotId: string;
  amountMinor: bigint;
}

export interface RestoreDecision {
  lotId: string;
  restoreMinor: bigint;
  skippedExpiredMinor: bigint;
}

/**
 * İptal/iade restore planı (ADR-284): her harcanan lot için, lot'un expiry'si HÂLÂ gelecekteyse
 * (expiresAt > now) o tutar geri yüklenir (lot revive); süresi GEÇMİŞSE yapay canlandırma YOK —
 * tutar skippedExpiredMinor olarak kaydedilir (history'de "süresi dolduğu için iade edilmedi").
 * lotById'de bulunmayan lot (silinmiş) → skip (güvenli).
 */
export function planRestore(
  debits: readonly RestoreCandidate[],
  lotById: ReadonlyMap<string, { expiresAt: Date }>,
  now: Date,
): RestoreDecision[] {
  return debits.map((d) => {
    const lot = lotById.get(d.lotId);
    const alive = lot ? lot.expiresAt.getTime() > now.getTime() : false;
    return alive
      ? { lotId: d.lotId, restoreMinor: d.amountMinor, skippedExpiredMinor: 0n }
      : { lotId: d.lotId, restoreMinor: 0n, skippedExpiredMinor: d.amountMinor };
  });
}

/** Worker: süresi dolmuş ama hâlâ ACTIVE + remaining>0 olan lot'lar (materialize edilecek). */
export function expiredSweepCandidates(lots: readonly CreditLotView[], now: Date): CreditLotView[] {
  return lots.filter(
    (l) => l.status === "ACTIVE" && l.remainingAmountMinor > 0n && l.expiresAt.getTime() <= now.getTime(),
  );
}
