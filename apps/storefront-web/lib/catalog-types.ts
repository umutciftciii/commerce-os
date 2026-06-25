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
}

/** Detaydaki tek varyant gorunumu. */
export interface StorefrontVariantView {
  id: string;
  title: string;
  sku: string;
  priceLabel: string | null;
  compareAtLabel: string | null;
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
