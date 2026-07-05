/**
 * F4A.3 — Musteri kupon cuzdani (wallet) SAF projeksiyon mantigi (ADR-060).
 *
 * Sepet "Kuponlar" alanindaki kullanilabilir kupon kartlarini (PublicWalletCoupon)
 * uretir. KAYNAK DOGRUSU indirim tutari icin BU DEGILDIR — nihai indirim yine
 * couponCode + sunucu-tarafi motordan gelir; burada yalnizca kart GORUNUM/DURUM'u
 * hesaplanir. Modul SAF'tir (I/O yok); `now` parametredir.
 *
 * Guvenlik: cagiran YALNIZCA guvenli adaylari (public kupon / bu musteriye-email'e
 * ait cuzdan / kod ile claim edilmis) gecmelidir. Kart projeksiyonu kampanya/kupon
 * ic kimligini, limit/istatistigini, priority/stackable'i TASIMAZ.
 */
import type {
  PublicCouponReason,
  PublicWalletCoupon,
  PublicWalletCouponSource,
  PublicWalletCouponState,
} from "@commerce-os/contracts";
import type { CampaignCouponRecord, CampaignRecord } from "./data.js";

export interface WalletCandidate {
  coupon: CampaignCouponRecord;
  campaign: CampaignRecord;
  source: PublicWalletCouponSource;
}

export interface WalletProjectionInput {
  /** Sepet ara toplami (indirim oncesi); alt limit karsilastirmasi icin. */
  subtotalMinor: number;
  /** Su an sepete uygulanmis kupon kodu (normalize edilmis) ya da null. */
  appliedNormalizedCode: string | null;
  now: Date;
}

function withinStart(startsAt: Date | null, now: Date): boolean {
  return !startsAt || now.getTime() >= startsAt.getTime();
}

/**
 * F4A.3 — "Kupon kodu ekle" (claim) uygunlugu: kupon+kampanya ACTIVE, pencere
 * gecerli, toplam limit dolmamis. Alt limit/kapsam BURADA kontrol EDILMEZ — bunlar
 * sepet-zamanli kart durumudur (MIN_ORDER_NOT_MET vb.). Uygunsa null, degilse neden.
 * NOT_FOUND cagiran tarafta (kupon bulunamadi) uretilir.
 */
export function evaluateCouponClaim(
  coupon: CampaignCouponRecord,
  campaign: CampaignRecord,
  now: Date,
): PublicCouponReason | null {
  if (coupon.status !== "ACTIVE" || campaign.status !== "ACTIVE") return "INACTIVE";
  if (campaign.type !== "COUPON_CODE") return "INACTIVE";
  if (!withinStart(campaign.startsAt, now) || !withinStart(coupon.startsAt, now)) return "NOT_STARTED";
  if (isExpired(campaign.endsAt, now) || isExpired(coupon.endsAt, now)) return "EXPIRED";
  if (usageFull(campaign.totalUsageLimit, campaign.usageCount)) return "USAGE_LIMIT_REACHED";
  if (usageFull(coupon.totalUsageLimit, coupon.usageCount)) return "USAGE_LIMIT_REACHED";
  return null;
}

function isExpired(endsAt: Date | null, now: Date): boolean {
  return endsAt !== null && now.getTime() > endsAt.getTime();
}

function usageFull(limit: number | null, count: number): boolean {
  return limit !== null && count >= limit;
}

function effectiveEndsAt(campaign: CampaignRecord, coupon: CampaignCouponRecord): string | null {
  const ends = [campaign.endsAt, coupon.endsAt].filter((d): d is Date => d instanceof Date);
  if (ends.length === 0) return null;
  return ends.reduce((min, d) => (d.getTime() < min.getTime() ? d : min)).toISOString();
}

/**
 * Tek bir aday kuponu sepet baglaminda kart projeksiyonuna cevirir. GORUNMEMESI
 * gerekenler (baslamamis, limit dolmus, kupon/kampanya pasif) null doner. Diger
 * durumlar (APPLIED / MIN_ORDER_NOT_MET / EXPIRED / AVAILABLE) kart olarak doner.
 * Kapsam (product/category) uygunlugu cagiran tarafta filtrelenir.
 */
export function projectWalletCoupon(
  candidate: WalletCandidate,
  input: WalletProjectionInput,
): PublicWalletCoupon | null {
  const { coupon, campaign, source } = candidate;
  const { now } = input;

  // Pasif kupon/kampanya veya henuz baslamamis pencere: gosterme.
  if (coupon.status !== "ACTIVE" || campaign.status !== "ACTIVE") return null;
  if (!withinStart(campaign.startsAt, now) || !withinStart(coupon.startsAt, now)) return null;
  // Toplam limiti dolmus: gosterme (per-customer limit bilincli olarak kapsam disi).
  if (usageFull(campaign.totalUsageLimit, campaign.usageCount)) return null;
  if (usageFull(coupon.totalUsageLimit, coupon.usageCount)) return null;

  const endsAt = effectiveEndsAt(campaign, coupon);
  const normalizedCode = coupon.normalizedCode;

  let state: PublicWalletCouponState;
  if (isExpired(campaign.endsAt, now) || isExpired(coupon.endsAt, now)) {
    state = "EXPIRED";
  } else if (input.appliedNormalizedCode && input.appliedNormalizedCode === normalizedCode) {
    state = "APPLIED";
  } else if (
    campaign.minOrderAmountMinor !== null &&
    input.subtotalMinor < campaign.minOrderAmountMinor
  ) {
    state = "MIN_ORDER_NOT_MET";
  } else {
    state = "AVAILABLE";
  }

  return {
    code: coupon.code,
    discountType: campaign.discountType,
    discountValue: campaign.discountValue,
    minOrderAmountMinor: campaign.minOrderAmountMinor,
    endsAt,
    state,
    source,
  };
}

/**
 * Aday listesini kart projeksiyonlarina cevirir; ayni koda ait tekrarlari (public
 * + atanmis ayni kupon) teklestirir: ONCELIK APPLIED > AVAILABLE > MIN_ORDER_NOT_MET
 * > EXPIRED, kaynak onceligi ASSIGNED > CLAIMED > PUBLIC. Deterministik sirali.
 */
export function projectWalletCoupons(
  candidates: WalletCandidate[],
  input: WalletProjectionInput,
): PublicWalletCoupon[] {
  const byCode = new Map<string, PublicWalletCoupon>();
  const stateRank: Record<PublicWalletCouponState, number> = {
    APPLIED: 0,
    AVAILABLE: 1,
    MIN_ORDER_NOT_MET: 2,
    EXPIRED: 3,
  };
  const sourceRank: Record<PublicWalletCouponSource, number> = {
    ASSIGNED: 0,
    CLAIMED: 1,
    PUBLIC: 2,
  };
  for (const candidate of candidates) {
    const projected = projectWalletCoupon(candidate, input);
    if (!projected) continue;
    const key = candidate.coupon.normalizedCode;
    const existing = byCode.get(key);
    if (
      !existing ||
      stateRank[projected.state] < stateRank[existing.state] ||
      (stateRank[projected.state] === stateRank[existing.state] &&
        sourceRank[projected.source] < sourceRank[existing.source])
    ) {
      byCode.set(key, projected);
    }
  }
  return [...byCode.values()].sort(
    (a, b) => stateRank[a.state] - stateRank[b.state] || a.code.localeCompare(b.code),
  );
}
