/**
 * F4A — Kampanya/Kupon indirim motoru (ADR-058).
 *
 * KAYNAK DOGRUSU: Indirim tutari YALNIZCA burada, sunucu tarafinda hesaplanir.
 * Istemciden gelen indirim/tutar bilgisi ASLA girdi degildir; girdi sepetin
 * sunucu-otoriter cozumlenmis satirlari + DB'den yuklenen kampanya/kupon
 * kayitlaridir. Modul SAF'tir (I/O yok, Date.now yok) — `now` parametredir.
 *
 * Para: integer minor unit (kurus). Yuzde hesabi Math.round ile deterministik
 * yuvarlanir (mevcut sepet ozeti davranisiyla tutarli). Indirim hicbir kosulda
 * uygun (eligible) ara toplami ve kalan sepet ara toplamini ASAMAZ.
 *
 * Stacking (MVP):
 *  - Kupon uygulanmissa kupon kampanyasi HER ZAMAN once gelir.
 *  - Adaylar (kupon + otomatik kampanyalar) priority DESC, sonra indirim tutari
 *    DESC, sonra id ASC sirasiyla degerlendirilir.
 *  - stackable=false bir kampanya secildiginde baska kampanya UYGULANMAZ;
 *    secim sirasindaki ilk aday zaten en iyi indirimdir ("best discount").
 *  - stackable=true kampanyalar birlikte uygulanabilir; her satir kendi uygun
 *    ara toplami uzerinden hesaplanir ve KALAN sepet ara toplamiyla cap'lenir
 *    (toplam indirim > subtotal olamaz).
 */

export type EngineCampaignStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";
export type EngineCampaignType =
  | "COUPON_CODE"
  | "AUTOMATIC_CART"
  | "PRODUCT_DISCOUNT"
  | "CATEGORY_DISCOUNT"
  | "BUY_X_GET_Y"
  | "FREE_SHIPPING"
  | "MEMBERSHIP_ONLY";
export type EngineDiscountType = "PERCENT" | "FIXED_AMOUNT";
export type EngineCouponStatus = "ACTIVE" | "PAUSED" | "ARCHIVED";

/** MVP'de motorun indirim uygulayabildigi kampanya tipleri; digerleri enum rezervi. */
const SUPPORTED_TYPES: ReadonlySet<EngineCampaignType> = new Set([
  "COUPON_CODE",
  "AUTOMATIC_CART",
  "PRODUCT_DISCOUNT",
  "CATEGORY_DISCOUNT",
]);

export interface EngineCampaign {
  id: string;
  name: string;
  status: EngineCampaignStatus;
  type: EngineCampaignType;
  discountType: EngineDiscountType;
  /** PERCENT: 1-100 tam sayi; FIXED_AMOUNT: minor unit tutar. */
  discountValue: number;
  maxDiscountAmountMinor: number | null;
  minOrderAmountMinor: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  totalUsageLimit: number | null;
  perCustomerUsageLimit: number | null;
  usageCount: number;
  stackable: boolean;
  priority: number;
  /** Kapsam: bos ise tum sepet. Dolu ise urun/kategori eslesen satirlar. */
  productIds: string[];
  categoryIds: string[];
}

export interface EngineCoupon {
  id: string;
  campaignId: string;
  code: string;
  normalizedCode: string;
  status: EngineCouponStatus;
  totalUsageLimit: number | null;
  perCustomerUsageLimit: number | null;
  usageCount: number;
  /** Kampanya penceresini daraltan opsiyonel override. */
  startsAt: Date | null;
  endsAt: Date | null;
}

/** Sepetin siparise dusebilecek (OK) tek satiri; tutarlar sunucu-otoriter. */
export interface DiscountCartLine {
  variantId: string;
  productId: string;
  categoryIds: string[];
  quantity: number;
  lineTotalMinor: number;
}

/**
 * Kupon dogrulama sonucu. INVALID yerine spesifik neden doner; PUBLIC yanita
 * couponStatus=INVALID + couponReason olarak maplenir (varlik sizdirmamak icin
 * NOT_FOUND ve INACTIVE istemciye ayni genel kopyayla gosterilebilir).
 */
export type CouponReason =
  | "NOT_FOUND"
  | "INACTIVE"
  | "NOT_STARTED"
  | "EXPIRED"
  | "MIN_ORDER_NOT_MET"
  | "USAGE_LIMIT_REACHED"
  | "NOT_APPLICABLE";

export interface DiscountContext {
  /** ACTIVE otomatik kampanyalar (COUPON_CODE haric); DB'den yuklenir. */
  automaticCampaigns: EngineCampaign[];
  /** normalizedCode ile store-scoped bulunan kupon (yoksa null). */
  coupon: EngineCoupon | null;
  /** Kuponun bagli oldugu kampanya (kupon varsa yuklenir). */
  couponCampaign: EngineCampaign | null;
  /** Kimligi bilinen musteri icin kampanya bazinda kullanim sayisi. */
  customerUsageByCampaign: ReadonlyMap<string, number>;
  /** Kimligi bilinen musteri icin kupon bazinda kullanim sayisi. */
  customerUsageByCoupon: ReadonlyMap<string, number>;
}

export interface DiscountEngineInput {
  lines: DiscountCartLine[];
  subtotalMinor: number;
  /** Kullanicinin girdigi ham kupon kodu (normalize edilmemis olabilir). */
  couponCode: string | null;
  context: DiscountContext;
  now: Date;
}

export interface DiscountLine {
  campaignId: string;
  couponId: string | null;
  code: string | null;
  label: string;
  discountType: EngineDiscountType;
  discountValue: number;
  discountAmountMinor: number;
  /** Indirimin hesaplandigi uygun ara toplam (kapsam sonrasi). */
  eligibleSubtotalMinor: number;
}

/** Bir sepet satirina (variantId) DUSEN toplam kampanya indirimi (tum kampanyalar). */
export interface DiscountLineAllocation {
  variantId: string;
  discountMinor: number;
}

export interface DiscountEngineResult {
  discountLines: DiscountLine[];
  discountMinor: number;
  /**
   * Sepet satiri (variantId) bazinda DAGITILMIS toplam indirim. Her kampanyanin
   * indirimi, kapsamina giren satirlara lineTotalMinor oraninda (pro-rata, en-buyuk-
   * kalan yuvarlamasiyla) dagitilir; coklu kampanya birikir. sum(lineDiscounts) =
   * discountMinor (kurus kurusuna). Vitrin satirda kampanya-sonrasi fiyat gosterir.
   */
  lineDiscounts: DiscountLineAllocation[];
  /** Kupon girildiyse sonucu; girilmediyse NONE. */
  couponStatus: "NONE" | "APPLIED" | "INVALID";
  couponReason: CouponReason | null;
  /** Normalize edilmis kupon kodu (girildiyse). */
  couponCode: string | null;
}

/** Bir kampanyanin kapsamina giren satir mi? (eligibleSubtotalFor ile ayni kural.) */
function campaignCoversLine(campaign: EngineCampaign, line: DiscountCartLine): boolean {
  const hasScope = campaign.productIds.length > 0 || campaign.categoryIds.length > 0;
  if (!hasScope) return true;
  const productSet = new Set(campaign.productIds);
  const categorySet = new Set(campaign.categoryIds);
  return productSet.has(line.productId) || line.categoryIds.some((id) => categorySet.has(id));
}

/**
 * Tek kampanyanin `amount` indirimini, kapsamina giren satirlara lineTotalMinor
 * oraninda dagitir. En-buyuk-kalan (largest-remainder) yuvarlamasi: floor sonrasi
 * artan kurus(lar) en buyuk kesirli paya sahip satirlara dagitilir → sum = amount
 * (kurus kaybi/fazlasi yok). Sonuc perLine map'ine BIRIKTIRILIR.
 */
function allocateProRata(
  campaign: EngineCampaign,
  amount: number,
  lines: DiscountCartLine[],
  perLine: Map<string, number>,
): void {
  if (amount <= 0) return;
  const eligible = lines.filter((line) => campaignCoversLine(campaign, line) && line.lineTotalMinor > 0);
  const eligibleTotal = eligible.reduce((sum, line) => sum + line.lineTotalMinor, 0);
  if (eligibleTotal <= 0) return;
  const parts = eligible.map((line) => {
    const exact = (amount * line.lineTotalMinor) / eligibleTotal;
    const floor = Math.floor(exact);
    return { variantId: line.variantId, floor, frac: exact - floor };
  });
  const allocated = parts.reduce((sum, p) => sum + p.floor, 0);
  let residual = amount - allocated;
  // Kalan kurusu en buyuk kesirli paya sahip satirlara sirayla ekle (deterministik).
  parts.sort((a, b) => b.frac - a.frac || (a.variantId < b.variantId ? -1 : 1));
  for (let i = 0; i < parts.length && residual > 0; i += 1) {
    parts[i].floor += 1;
    residual -= 1;
  }
  for (const part of parts) {
    if (part.floor > 0) perLine.set(part.variantId, (perLine.get(part.variantId) ?? 0) + part.floor);
  }
}

/** Kupon kodu izinli karakterleri (normalize SONRASI). */
const COUPON_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{1,39}$/;

/**
 * Kupon kodu normalizasyonu: trim + locale-BAGIMSIZ uppercase. TR-I tuzagi:
 * toLocaleUpperCase("tr") "i"yi "İ" yapar; kodlar ASCII oldugu icin spec geregi
 * locale-bagimsiz String.prototype.toUpperCase kullanilir.
 */
export function normalizeCouponCode(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  return trimmed.toUpperCase();
}

/** Normalize edilmis kodun bicimsel gecerliligi (magaza dogrulamasi degil). */
export function isValidCouponCodeFormat(normalized: string): boolean {
  return COUPON_CODE_PATTERN.test(normalized);
}

function isWithinWindow(startsAt: Date | null, endsAt: Date | null, now: Date): "OK" | "NOT_STARTED" | "EXPIRED" {
  if (startsAt && now.getTime() < startsAt.getTime()) return "NOT_STARTED";
  if (endsAt && now.getTime() > endsAt.getTime()) return "EXPIRED";
  return "OK";
}

/** Kampanya kapsamina giren satirlarin ara toplami. Bos kapsam = tum sepet. */
export function eligibleSubtotalFor(campaign: EngineCampaign, lines: DiscountCartLine[]): number {
  const hasScope = campaign.productIds.length > 0 || campaign.categoryIds.length > 0;
  if (!hasScope) return lines.reduce((sum, line) => sum + line.lineTotalMinor, 0);
  const productSet = new Set(campaign.productIds);
  const categorySet = new Set(campaign.categoryIds);
  let total = 0;
  for (const line of lines) {
    const productMatch = productSet.has(line.productId);
    const categoryMatch = line.categoryIds.some((id) => categorySet.has(id));
    if (productMatch || categoryMatch) total += line.lineTotalMinor;
  }
  return total;
}

/** Tek kampanyanin ham indirim tutari (kalan-cap HARIC; eligible-cap DAHIL). */
export function computeCampaignDiscount(campaign: EngineCampaign, eligibleMinor: number): number {
  if (eligibleMinor <= 0) return 0;
  let amount: number;
  if (campaign.discountType === "PERCENT") {
    amount = Math.round((eligibleMinor * campaign.discountValue) / 100);
  } else {
    amount = campaign.discountValue;
  }
  if (campaign.maxDiscountAmountMinor !== null) {
    amount = Math.min(amount, campaign.maxDiscountAmountMinor);
  }
  return Math.max(0, Math.min(amount, eligibleMinor));
}

interface CampaignCandidate {
  campaign: EngineCampaign;
  coupon: EngineCoupon | null;
  eligibleMinor: number;
  rawDiscountMinor: number;
}

/**
 * Otomatik kampanya uygunlugu (kupon disi). Uygunsuzsa null. Kupon kampanyasi
 * icin ayri, nedenli dogrulama `validateCoupon` icindedir.
 */
function automaticCandidate(
  campaign: EngineCampaign,
  input: DiscountEngineInput,
): CampaignCandidate | null {
  if (campaign.status !== "ACTIVE") return null;
  if (!SUPPORTED_TYPES.has(campaign.type) || campaign.type === "COUPON_CODE") return null;
  if (isWithinWindow(campaign.startsAt, campaign.endsAt, input.now) !== "OK") return null;
  if (campaign.minOrderAmountMinor !== null && input.subtotalMinor < campaign.minOrderAmountMinor) return null;
  if (campaign.totalUsageLimit !== null && campaign.usageCount >= campaign.totalUsageLimit) return null;
  if (campaign.perCustomerUsageLimit !== null) {
    const used = input.context.customerUsageByCampaign.get(campaign.id) ?? 0;
    if (used >= campaign.perCustomerUsageLimit) return null;
  }
  const eligibleMinor = eligibleSubtotalFor(campaign, input.lines);
  if (eligibleMinor <= 0) return null;
  const rawDiscountMinor = computeCampaignDiscount(campaign, eligibleMinor);
  if (rawDiscountMinor <= 0) return null;
  return { campaign, coupon: null, eligibleMinor, rawDiscountMinor };
}

interface CouponValidation {
  candidate: CampaignCandidate | null;
  reason: CouponReason | null;
}

/** Kupon + bagli kampanyanin nedenli dogrulamasi. */
function validateCoupon(input: DiscountEngineInput): CouponValidation {
  const { coupon, couponCampaign } = input.context;
  if (!coupon || !couponCampaign) return { candidate: null, reason: "NOT_FOUND" };
  if (coupon.status !== "ACTIVE" || couponCampaign.status !== "ACTIVE") {
    return { candidate: null, reason: "INACTIVE" };
  }
  if (!SUPPORTED_TYPES.has(couponCampaign.type)) return { candidate: null, reason: "INACTIVE" };

  const campaignWindow = isWithinWindow(couponCampaign.startsAt, couponCampaign.endsAt, input.now);
  if (campaignWindow !== "OK") return { candidate: null, reason: campaignWindow };
  const couponWindow = isWithinWindow(coupon.startsAt, coupon.endsAt, input.now);
  if (couponWindow !== "OK") return { candidate: null, reason: couponWindow };

  if (couponCampaign.totalUsageLimit !== null && couponCampaign.usageCount >= couponCampaign.totalUsageLimit) {
    return { candidate: null, reason: "USAGE_LIMIT_REACHED" };
  }
  if (coupon.totalUsageLimit !== null && coupon.usageCount >= coupon.totalUsageLimit) {
    return { candidate: null, reason: "USAGE_LIMIT_REACHED" };
  }
  if (couponCampaign.perCustomerUsageLimit !== null) {
    const used = input.context.customerUsageByCampaign.get(couponCampaign.id) ?? 0;
    if (used >= couponCampaign.perCustomerUsageLimit) return { candidate: null, reason: "USAGE_LIMIT_REACHED" };
  }
  if (coupon.perCustomerUsageLimit !== null) {
    const used = input.context.customerUsageByCoupon.get(coupon.id) ?? 0;
    if (used >= coupon.perCustomerUsageLimit) return { candidate: null, reason: "USAGE_LIMIT_REACHED" };
  }

  if (couponCampaign.minOrderAmountMinor !== null && input.subtotalMinor < couponCampaign.minOrderAmountMinor) {
    return { candidate: null, reason: "MIN_ORDER_NOT_MET" };
  }

  const eligibleMinor = eligibleSubtotalFor(couponCampaign, input.lines);
  if (eligibleMinor <= 0) return { candidate: null, reason: "NOT_APPLICABLE" };
  const rawDiscountMinor = computeCampaignDiscount(couponCampaign, eligibleMinor);
  if (rawDiscountMinor <= 0) return { candidate: null, reason: "NOT_APPLICABLE" };

  return {
    candidate: { campaign: couponCampaign, coupon, eligibleMinor, rawDiscountMinor },
    reason: null,
  };
}

/** Deterministik aday sirasi: priority DESC, indirim DESC, id ASC. */
function compareCandidates(a: CampaignCandidate, b: CampaignCandidate): number {
  if (a.campaign.priority !== b.campaign.priority) return b.campaign.priority - a.campaign.priority;
  if (a.rawDiscountMinor !== b.rawDiscountMinor) return b.rawDiscountMinor - a.rawDiscountMinor;
  return a.campaign.id < b.campaign.id ? -1 : a.campaign.id > b.campaign.id ? 1 : 0;
}

export function computeDiscounts(input: DiscountEngineInput): DiscountEngineResult {
  const normalizedCode = normalizeCouponCode(input.couponCode);
  const empty: DiscountEngineResult = {
    discountLines: [],
    discountMinor: 0,
    lineDiscounts: [],
    couponStatus: normalizedCode ? "INVALID" : "NONE",
    couponReason: normalizedCode ? "NOT_FOUND" : null,
    couponCode: normalizedCode,
  };
  if (input.subtotalMinor <= 0 || input.lines.length === 0) return empty;

  let couponStatus: "NONE" | "APPLIED" | "INVALID" = "NONE";
  let couponReason: CouponReason | null = null;
  let couponCandidate: CampaignCandidate | null = null;

  if (normalizedCode) {
    if (!isValidCouponCodeFormat(normalizedCode)) {
      couponStatus = "INVALID";
      couponReason = "NOT_FOUND";
    } else {
      const validation = validateCoupon(input);
      if (validation.candidate) {
        couponStatus = "APPLIED";
        couponCandidate = validation.candidate;
      } else {
        couponStatus = "INVALID";
        couponReason = validation.reason;
      }
    }
  }

  // Aday listesi: kupon (varsa) HER ZAMAN once; otomatikler deterministik sirali.
  const automatic = input.context.automaticCampaigns
    .map((campaign) => automaticCandidate(campaign, input))
    .filter((candidate): candidate is CampaignCandidate => candidate !== null)
    .sort(compareCandidates);
  const ordered = couponCandidate ? [couponCandidate, ...automatic] : automatic;

  const discountLines: DiscountLine[] = [];
  // Satir bazinda dagitilmis indirim (variantId -> toplam). Her kampanyanin uygulanan
  // tutari kapsam satirlarina pro-rata dagitilir; coklu kampanya birikir.
  const perLine = new Map<string, number>();
  let remainingMinor = input.subtotalMinor;
  let blockedByNonStackable = false;
  for (const candidate of ordered) {
    if (remainingMinor <= 0) break;
    if (blockedByNonStackable) break;
    // Ilk secimden sonra yalniz stackable adaylar eklenebilir (secilenlerin
    // tumu de stackable olmalidir; degilse ilk secim non-stackable'dir ve
    // asagida bloklanmistir).
    if (discountLines.length > 0 && !candidate.campaign.stackable) continue;
    const amount = Math.min(candidate.rawDiscountMinor, remainingMinor);
    if (amount <= 0) continue;
    discountLines.push({
      campaignId: candidate.campaign.id,
      couponId: candidate.coupon?.id ?? null,
      code: candidate.coupon?.normalizedCode ?? null,
      label: candidate.campaign.name,
      discountType: candidate.campaign.discountType,
      discountValue: candidate.campaign.discountValue,
      discountAmountMinor: amount,
      eligibleSubtotalMinor: candidate.eligibleMinor,
    });
    // Uygulanan tutari (remaining-cap sonrasi) kapsam satirlarina dagit.
    allocateProRata(candidate.campaign, amount, input.lines, perLine);
    remainingMinor -= amount;
    if (!candidate.campaign.stackable) blockedByNonStackable = true;
  }

  const discountMinor = discountLines.reduce((sum, line) => sum + line.discountAmountMinor, 0);
  // Satir indirimini satir tutariyla sinirla (negatif fiyat olmaz; kenar durum: ayni
  // satira coklu kampanya). Yalniz pozitif dagitilmis satirlar doner.
  const lineTotalByVariant = new Map(input.lines.map((line) => [line.variantId, line.lineTotalMinor]));
  const lineDiscounts: DiscountLineAllocation[] = [];
  for (const [variantId, discount] of perLine) {
    const capped = Math.min(discount, lineTotalByVariant.get(variantId) ?? discount);
    if (capped > 0) lineDiscounts.push({ variantId, discountMinor: capped });
  }

  // Kupon gecerliydi ama kalan-cap nedeniyle satiri dusmediyse (teorik sinir
  // durumu) yine NOT_APPLICABLE'a cevrilir; UI yaniltilmaz.
  if (couponStatus === "APPLIED" && !discountLines.some((line) => line.couponId !== null)) {
    couponStatus = "INVALID";
    couponReason = "NOT_APPLICABLE";
  }

  return {
    discountLines,
    discountMinor,
    lineDiscounts,
    couponStatus,
    couponReason,
    couponCode: normalizedCode,
  };
}
