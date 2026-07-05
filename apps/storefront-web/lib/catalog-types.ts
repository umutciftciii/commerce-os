import type { ProductSalesMode, ProductPriceVisibility } from "@commerce-os/api-client";

/**
 * Vitrin (storefront) gorunum modelleri. Bu modul SADECE saf tipler + saf turetme
 * mantigi icindir; sunucu/istemci ayrimindan bagimsizdir ve gizli deger tasimaz.
 * Bilesenler ve testler bu tipleri kullanir; gorunur metin (CTA etiketleri vb.)
 * burada DEGIL, i18n sozlugundedir — buradaki alanlar makine-okunur enum/bayrak
 * ya da mağaza verisidir (urun basligi, fiyat etiketi gibi).
 */

/** Fiyatin nasil gosterilecegi (F2D priceVisibility -> vitrin davranisi). */
export type PriceDisplayMode = "amount" | "startingFrom" | "onRequest" | "hidden";

/**
 * Vitrin CTA turleri. Ham API primaryAction kodlari (ADD_TO_CART, NONE...) UI'da
 * gosterilmez; bu enum'lar i18n etiketlerine eslenir.
 */
export type StorefrontCtaKind =
  | "ADD_TO_CART"
  | "BUY_NOW"
  | "REQUEST_PRICE"
  | "BOOK_APPOINTMENT"
  | "CONTACT_WHATSAPP"
  | "REQUEST_INFO";

/** Bir urunun satis-modeline gore turetilmis vitrin davranisi (saf). */
export interface ProductCommerceView {
  salesMode: ProductSalesMode;
  priceVisibility: ProductPriceVisibility;
  priceMode: PriceDisplayMode;
  /** Online + satilabilir mi (sepete ekleme/adet secimi yalniz bu durumda). */
  purchasable: boolean;
  showQuantity: boolean;
  minQuantity: number;
  maxQuantity: number | null;
  primaryCta: StorefrontCtaKind;
  primaryCtaDisabled: boolean;
  secondaryCta: StorefrontCtaKind | null;
  showWhatsappTemplate: boolean;
  showInquiry: boolean;
  showAppointmentNote: boolean;
}

/** Bicimlendirilmis fiyat gorunumu (sayi etiketleri tr-TR para bicimindedir). */
export interface StorefrontPrice {
  mode: PriceDisplayMode;
  /** Bicimlenmis tutar ( or. "₺1.299,00") ya da gizli/talep durumunda null. */
  amountLabel: string | null;
  /** Indirimde ustu cizili karsilastirma fiyati; yoksa null. */
  compareAtLabel: string | null;
}

/** Liste/karti besleyen ozet urun gorunumu. */
export interface StorefrontProductSummary {
  /** URL handle = urun slug'i (cevrilmez, sabit kimlik). */
  handle: string;
  title: string;
  brand: string | null;
  categoryLabel: string | null;
  price: StorefrontPrice;
  commerce: ProductCommerceView;
  /** Indirim varsa rozet anahtari ("discount"); yoksa null. i18n'de cevrilir. */
  badgeKind: "discount" | "new" | null;
  /** F4A.1 — Aktif public kampanya rozeti; yoksa null. */
  campaign: StorefrontCampaignView | null;
  /**
   * F4A.6 — Birincil rozet OTOMATIK "Sepette" iken, tum uygun kampanyalar
   * stackable oldugunda EK gosterilecek public kupon; aksi halde null.
   */
  secondaryCoupon: StorefrontCampaignView | null;
}

/**
 * F4A.1 — Vitrin kampanya gorunumu. Gateway'in public-safe rozet
 * projeksiyonundan (kind/discountType/discountValue/minOrderAmountMinor)
 * turetilmis HAZIR metinler tasir; kampanya ic verisi (id/limit/istatistik)
 * burada YOKTUR.
 */
export interface StorefrontCampaignView {
  /** F4A.3 — Gosterim taksonomisi: otomatik sepet indirimi mi public kupon mu. */
  displayKind: "AUTOMATIC_CART_DISCOUNT" | "PUBLIC_COUPON";
  /** Urun karti rozeti ("Sepette %10 indirim" / "Kuponlu ürün"). */
  badgeText: string;
  /** Detay etiketi ("Sepette %10 indirim" / "₺250 kupon"). */
  label: string;
  /** Ham indirim tutari metni ("%10" / "₺250") — kupon karti icin. */
  discountText: string;
  /** Kupon kodu gerektiren kampanya mi. */
  requiresCoupon: boolean;
  /** F4A.3 — Public kupon kodu (varsa); otomatik/gizli kuponda null. */
  couponCode: string | null;
  /** F4A.3 — Urun detay kupon aksiyonu. */
  couponAction: "CLAIM" | "APPLY" | "COPY" | "MANUAL_ONLY";
  /** "X üzeri geçerli" esigi bicimli; yoksa null. */
  minOrderLabel: string | null;
  /** F4A.3 — Bitis tarihi (ISO); yoksa null. */
  endsAt: string | null;
  /**
   * F4A.6 — Otomatik sepet indiriminin GUVENLI tahmini birim nihai fiyati
   * (bicimli, or. "₺1.169,10"); yalnizca sunucu guvenli hesaplayabildiyse dolu,
   * aksi halde null (o zaman yalniz "Sepette %X" + alt-limit notu gosterilir).
   */
  estimatedFinalLabel: string | null;
  /** F4A.4 — Admin-kontrollu sunum alanlari (ADR-061; yoksa null → fallback). */
  displayTitle: string | null;
  shortDescription: string | null;
  badgeLabel: string | null;
  terms: string | null;
}

/**
 * F4A.3 — Sepet "Kuponlar" alanindaki kullanilabilir kupon karti gorunumu.
 * Gateway'in cuzdan projeksiyonundan (PublicWalletCoupon) turetilmis HAZIR
 * metinler tasir; kampanya ic verisi tasimaz.
 */
export interface StorefrontWalletCouponView {
  code: string;
  /** Indirim tutari metni ("%10" / "₺250"). */
  discountText: string;
  /** "Alt limit: ₺1.000" esigi; yoksa null. */
  minOrderLabel: string | null;
  /** Bitis tarihi (ISO); yoksa null. */
  endsAt: string | null;
  state: "AVAILABLE" | "APPLIED" | "MIN_ORDER_NOT_MET" | "EXPIRED";
  source: "PUBLIC" | "ASSIGNED" | "CLAIMED";
}

/**
 * F4A.5 — Vitrin "Kuponlarım / Tüm Kuponlar" kupon merkezi kart gorunumu.
 * Gateway'in kupon merkezi projeksiyonundan (PublicCouponCenterCoupon) turetilmis
 * HAZIR metinler tasir; kampanya ic verisi tasimaz. `state` USED'i de kapsar
 * (kullanildi gecmisi). `usedAt`/`orderNumber` yalnizca USED kartta doludur.
 */
export interface StorefrontCouponCenterView {
  code: string;
  /** Indirim tutari metni ("%10" / "₺250"). */
  discountText: string;
  /** "Alt limit: ₺1.000" esigi; yoksa null. */
  minOrderLabel: string | null;
  /** Bitis tarihi (ISO); yoksa null. */
  endsAt: string | null;
  state: "AVAILABLE" | "APPLIED" | "MIN_ORDER_NOT_MET" | "EXPIRED" | "USED";
  source: "PUBLIC" | "ASSIGNED" | "CLAIMED";
  /** USED kart icin kullanim tarihi (ISO); digerlerinde null. */
  usedAt: string | null;
  /** USED kart icin musterinin kendi siparis numarasi; digerlerinde null. */
  orderNumber: string | null;
  /** F4A.4 — Admin-kontrollu sunum alanlari (ADR-061; yoksa null → fallback). */
  displayTitle: string | null;
  shortDescription: string | null;
  badgeLabel: string | null;
  terms: string | null;
}

/**
 * Satin alinabilir azami adet (saf turetme): magaza max siniri ile (biliniyorsa)
 * varyant stok limitinin kucugu, min adetin altina dusmez. Stok bilinmiyorsa
 * (available === null) yalniz magaza siniri gecerlidir. Server reconcile yine son
 * guvenliktir; bu yalniz istemci clamp'i icindir.
 */
export function maxPurchasableQuantity(opts: {
  minQuantity: number;
  storeMax: number | null;
  available: number | null;
}): number {
  const storeMax = opts.storeMax ?? 99;
  if (opts.available === null) return storeMax;
  return Math.max(opts.minQuantity, Math.min(storeMax, opts.available));
}

/** Detaydaki tek varyant gorunumu. */
export interface StorefrontVariantView {
  id: string;
  title: string;
  sku: string;
  priceLabel: string | null;
  compareAtLabel: string | null;
  /**
   * Ham birim fiyat (minor/kurus) — adet x birim toplamini ISTEMCIDE bicimlemek
   * icin (buy box). Numerik fiyat gizli/talep modunda null. Nihai tutar yine
   * gateway'de yeniden hesaplanir; bu yalniz gosterim icindir.
   */
  priceMinor: number | null;
  compareAtMinor: number | null;
  /** Para birimi (tr-TR bicimleme icin). */
  currency: string;
  /** Stok adedi (bilinmiyorsa null). */
  available: number | null;
  inStock: boolean;
}

/** Urun detay sayfasini (satin alma karar merkezi) besleyen tam gorunum. */
export interface StorefrontProductDetail extends StorefrontProductSummary {
  description: string | null;
  /** Ilk varyantin SKU'su (urun kodu) ya da null. */
  sku: string | null;
  variants: StorefrontVariantView[];
  /** Mağaza yoneticisinin girdigi ozel CTA etiketi (varsa gosterilebilir). */
  callToActionLabel: string | null;
  whatsappMessageTemplate: string | null;
  inquiryFormTitle: string | null;
  appointmentNote: string | null;
  /** Benzer urunler (ayni katalogtan turetilir). */
  related: StorefrontProductSummary[];
}
