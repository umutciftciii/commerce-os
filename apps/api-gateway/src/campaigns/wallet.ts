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
  PublicCouponCenterCoupon,
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

/**
 * F4A.5 — Kupon merkezi USED gecmis kaydi (kimligin KENDI kullanimi). Sepet
 * baglamindan bagimsizdir; yalnizca kart projeksiyonu icin gerekli allowlist
 * alanlarini tasir.
 */
export interface CouponCenterUsedEntry {
  coupon: CampaignCouponRecord;
  campaign: CampaignRecord;
  source: PublicWalletCouponSource;
  usedAt: Date | null;
  orderNumber: string | null;
}

/**
 * F4A.5 — Vitrin "Kuponlarım / Tüm Kuponlar" kupon merkezi projeksiyonu (ADR-060
 * devami). SEPET-BAGIMSIZ: alt limit (MIN_ORDER_NOT_MET) burada hesaplanmaz;
 * kullanilabilir kartlar AVAILABLE ya da EXPIRED olur (uygulama durumu sepet
 * cookie'sinden istemcide isaretlenir). USED kartlar gecmisten uretilir. Zaten
 * kullanilmis bir kod "Kullanılabilir" listesinden DUSURULUR (yalniz Kullanıldı'da
 * gorunur). Modul SAF'tir (I/O yok); `now` parametredir. Cikan kartlar allowlist:
 * kampanya/kupon ic kimligi, limit/istatistik, priority/stackable TASINMAZ.
 */
export function projectCouponCenter(
  available: WalletCandidate[],
  used: CouponCenterUsedEntry[],
  now: Date,
): PublicCouponCenterCoupon[] {
  // Kullanilmis kodlar: ayni kod hem gecmiste hem public havuzda olabilir; kod
  // merkezinde "Kullanıldı" sekmesine ait sayilir, "Kullanılabilir"den dusurulur.
  const usedByCode = new Map<string, CouponCenterUsedEntry>();
  for (const entry of used) {
    const key = entry.coupon.normalizedCode;
    const existing = usedByCode.get(key);
    // En son kullanim (usedAt) tutulur.
    if (!existing || (entry.usedAt?.getTime() ?? 0) >= (existing.usedAt?.getTime() ?? 0)) {
      usedByCode.set(key, entry);
    }
  }
  const usedCodes = new Set(usedByCode.keys());

  const availableCards = projectWalletCoupons(
    available.filter((candidate) => !usedCodes.has(candidate.coupon.normalizedCode)),
    // subtotal = +∞: alt limit hicbir zaman "eksik" cikmaz (sepet-bagimsiz merkez);
    // applied kod istemcide (sepet cookie'si) isaretlenir, burada null.
    { subtotalMinor: Number.MAX_SAFE_INTEGER, appliedNormalizedCode: null, now },
  ).map<PublicCouponCenterCoupon>((card) => ({
    code: card.code,
    discountType: card.discountType,
    discountValue: card.discountValue,
    minOrderAmountMinor: card.minOrderAmountMinor,
    endsAt: card.endsAt,
    state: card.state,
    source: card.source,
    usedAt: null,
    orderNumber: null,
  }));

  const usedCards = [...usedByCode.values()]
    .sort((a, b) => (b.usedAt?.getTime() ?? 0) - (a.usedAt?.getTime() ?? 0))
    .map<PublicCouponCenterCoupon>((entry) => ({
      code: entry.coupon.code,
      discountType: entry.campaign.discountType,
      discountValue: entry.campaign.discountValue,
      minOrderAmountMinor: entry.campaign.minOrderAmountMinor,
      endsAt: effectiveEndsAt(entry.campaign, entry.coupon),
      state: "USED",
      source: entry.source,
      usedAt: entry.usedAt ? entry.usedAt.toISOString() : null,
      orderNumber: entry.orderNumber,
    }));

  return [...availableCards, ...usedCards];
}
