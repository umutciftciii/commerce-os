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
  /**
   * F4B — EU Omnibus: yalnizca aktif bir indirim varken doldurulur. Son 30 gunun
   * en dusuk SATIS fiyatinin bicimlenmis hali (or. "₺1.199,00"); yoksa null.
   */
  lowestRecentLabel: string | null;
}

/** Liste/karti besleyen ozet urun gorunumu. */
export interface StorefrontProductSummary {
  /**
   * TODO-159D (ADR-093) — Public ürün kimliği (publicProductSchema.id). Wishlist
   * favori durumu/toggle bu STABIL id ile anahtarlanır (slug değişebilir; SlugHistory).
   * Kişisel veri değil; public projeksiyonda zaten mevcut.
   */
  id: string;
  /** URL handle = urun slug'i (cevrilmez, sabit kimlik). */
  handle: string;
  title: string;
  brand: string | null;
  categoryLabel: string | null;
  /**
   * ADR-065 (Faz 3/Dilim 1) — Kapak gorseli public URL'i (liste ucundaki images[0]).
   * Gorseli olmayan urunde null → kart `ProductMedia`'da deterministik yer tutucuya
   * duser (productImageSrc fallback'i DEGISMEZ). Cogul galeri PDP'de (StorefrontProductDetail.images).
   */
  coverUrl: string | null;
  price: StorefrontPrice;
  commerce: ProductCommerceView;
  /**
   * Adim 3 (PLP) — Istemci-tarafi fiyat siralamasi icin en ucuz gorunur varyantin
   * ham minor tutari (kurus). Gizli/talep fiyatinda ya da fiyat gorunmezse null
   * (siralamada sona duser). Yalnizca siralama anahtaridir; gosterimde kullanilmaz.
   */
  sortPriceMinor?: number | null;
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
  /**
   * F4A.6 — Otomatik "Sepette" tahminini SECILI/EN-UCUZ varyantin fiyatindan
   * (motorla ayni formul) turetmek icin gereken ham teklif parametreleri. Bunlar
   * zaten reklam edilen tekliftir (rozet "%10" gosterir); ic kampanya verisi
   * (limit/priority/kimlik) DEGILDIR. FIXED_AMOUNT ya da gizli fiyatta tahmin
   * uretilmez. bkz. {@link estimateAutomaticUnitFinalMinor}.
   */
  discountType: "PERCENT" | "FIXED_AMOUNT";
  discountValue: number;
  maxDiscountAmountMinor: number | null;
  minOrderAmountMinor: number | null;
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
 * F4A.6 (ADR-062) — Otomatik sepet indiriminin GUVENLI birim-basi tahmini
 * (vitrin gorunumu). Gateway'in `computeAutomaticEstimate` fonksiyonuyla AYNI
 * formul: yalniz AUTOMATIC_CART_DISCOUNT + PERCENT + (minOrder yok ya da tek
 * birim esigi karsiliyor) durumunda hesaplanir; round(unit*yuzde), maxDiscount
 * cap ve birim fiyatla sinirlama. Aksi halde null (sahte nihai fiyat URETILMEZ).
 *
 * Bu SAF turetme, sunucunun urun-seviyesi (en-ucuz varyant) `estimatedFinalLabel`
 * degeri yerine SECILI varyantin fiyatindan hesap yapmak icindir: boylece PDP'de
 * varyant degisince "Sepette" fiyati REAKTIF ve uzeri-cizili liste fiyatiyla
 * TUTARLI olur (cok-varyantli urunde ust-varyant artik yanlis/donuk gostermez).
 * KAYNAK DOGRUSU yine checkout motorudur; bu yalniz gorunum tahminidir.
 */
export function estimateAutomaticUnitFinalMinor(
  unitPriceMinor: number | null,
  campaign: Pick<
    StorefrontCampaignView,
    "displayKind" | "discountType" | "discountValue" | "minOrderAmountMinor" | "maxDiscountAmountMinor"
  >,
): { discountMinor: number; finalMinor: number } | null {
  if (campaign.displayKind !== "AUTOMATIC_CART_DISCOUNT") return null;
  if (unitPriceMinor === null || unitPriceMinor <= 0) return null;
  if (campaign.discountType !== "PERCENT") return null;
  // `!= null` bilincli: alan gateway yanitinda henuz yoksa (undefined) null gibi
  // ele alinir — yoksa `Math.min(discount, undefined)` NaN uretirdi.
  if (campaign.minOrderAmountMinor != null && unitPriceMinor < campaign.minOrderAmountMinor) {
    return null;
  }
  let discount = Math.round((unitPriceMinor * campaign.discountValue) / 100);
  if (campaign.maxDiscountAmountMinor != null) {
    discount = Math.min(discount, campaign.maxDiscountAmountMinor);
  }
  discount = Math.max(0, Math.min(discount, unitPriceMinor));
  if (discount <= 0) return null;
  return { discountMinor: discount, finalMinor: unitPriceMinor - discount };
}

/**
 * Vitrin ust band kampanya slider'i slide gorunumu (GERCEK F4A verisi).
 * Gateway'in store-seviyesi public kampanya projeksiyonundan (publicCampaignBadge)
 * turetilmis HAZIR metinler tasir; kampanya ic verisi (id/limit/priority) YOKTUR.
 */
export interface StorefrontCampaignSlide {
  /** Stabil React key (kupon kodu ya da turetilmis etiket). */
  key: string;
  /** Ana band metni: admin displayTitle varsa o, yoksa turetilmis etiket. */
  headline: string;
  /** Ikincil kisa metin (shortDescription / alt-limit); yoksa null. */
  detail: string | null;
  /** Public kupon kodu (varsa); otomatik indirimde null. */
  couponCode: string | null;
}

/**
 * ADR-065 (Faz 3/Site Kabuğu) — Site-geneli marka bilgisi (header + <head>).
 * Gateway'in public store-info ucundan (allowlist) gelir; ic/yonetim alani
 * (logoMediaId/faviconMediaId) TASIMAZ. *Url null → header kelime-isareti /
 * <head> favicon override'siz fallback.
 */
export interface StorefrontStoreInfo {
  storeName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
}

/**
 * ADR-065 (Faz 3/Site Kabuğu) — Ana sayfa hero slide gorunumu. Gateway'in public
 * hero-slides ucundan (yalniz PUBLISHED, position ASC) gelir; `mediaId`/`status`/
 * zamanlama TASIMAZ. Dizi zaten sirali dondugu icin view model position tasimaz;
 * `key` stabil React list anahtaridir (opaque slide id).
 */
export interface StorefrontHeroSlide {
  key: string;
  mediaUrl: string;
  headline: string | null;
  subtext: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
}

/**
 * TODO-158A (ADR-086) — Home Experience Platform vitrin görünüm modelleri. Gateway'in
 * public composed `/home` ucundan (yalnız enabled + yayın-penceresi geçerli section'lar,
 * DB sırasında) gelir. Hiçbir ham FK/iç alan taşımaz. Section birleşimi discriminated union.
 */
export interface StorefrontHomeHeroSlide {
  key: string;
  mediaUrl: string;
  mobileMediaUrl: string | null;
  headline: string | null;
  subtext: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
}

export interface StorefrontHomeFeaturedCategory {
  key: string;
  title: string;
  description: string | null;
  href: string;
  imageUrl: string | null;
}

interface StorefrontHomeSectionBase {
  id: string;
  title: string | null;
  subtitle: string | null;
  desktopVisible: boolean;
  mobileVisible: boolean;
}

export type StorefrontHomeSection =
  | (StorefrontHomeSectionBase & {
      type: "HERO_SLIDER";
      autoplayMs: number | null;
      slides: StorefrontHomeHeroSlide[];
    })
  | (StorefrontHomeSectionBase & {
      type: "FEATURED_CATEGORIES";
      categories: StorefrontHomeFeaturedCategory[];
    })
  | (StorefrontHomeSectionBase & {
      type: "PRODUCT_SHOWCASE";
      layout: "CAROUSEL" | "GRID";
      products: StorefrontProductSummary[];
    });

export interface StorefrontHome {
  sections: StorefrontHomeSection[];
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

/**
 * PDP varsayilan varyant secimi = EN UCUZ gorunur (numerik fiyatli) varyant.
 * Boylece PDP acilis fiyati, kart/PLP'nin gosterdigi "en ucuzdan baslayan"
 * fiyatla (ve kampanya "Sepette" tahminiyle) BIREBIR tutarli olur. Numerik
 * fiyatli varyant yoksa ilk varyanta (ya da null'a) duser. Esitlikte dizi
 * sirasi korunur (deterministik).
 */
export function cheapestVariantId(variants: StorefrontVariantView[]): string | null {
  const priced = variants.filter((variant) => variant.priceMinor !== null);
  if (priced.length === 0) return variants[0]?.id ?? null;
  return priced.reduce(
    (min, variant) => ((variant.priceMinor as number) < (min.priceMinor as number) ? variant : min),
    priced[0],
  ).id;
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
  /**
   * Faz 2C-7 (ADR-078) — Variant Media Engine. Bu varyantin media-tanimlayici eksendeki
   * (Renk) OPTION id'si; urunun media-ekseni yoksa ya da varyantin o eksende degeri yoksa null.
   * Galeri, secili varyanta gore bununla filtrelenir. Yalnizca option id (media ic alani degil).
   */
  mediaOptionId: string | null;
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
  /**
   * ADR-065 (Faz 3/Dilim 1) — Tam urun galerisi (position ASC; images[0]=kapak).
   * Dilim 1'de PDP yalniz kapagi (`coverUrl`) render eder; thumbnail seridi bu diziyi
   * tuketecek (Dilim 2). Gorseli olmayan urunde bos dizi.
   */
  // Faz 2C-7 (ADR-078) — variantOptionId: gorselin media-tanimlayici eksen (Renk) etiketi;
  // null = "Tum varyantlar" (paylasilan). Vitrin, secili varyanta gore bununla filtreler.
  images: { url: string; altText: string | null; variantOptionId: string | null }[];
  /**
   * Faz 2C-7 (ADR-078) — Urunun gorsellerini gruplayan media-tanimlayici eksen (Renk) id'si;
   * null = klasik galeri (varyant secimi galeriyi degistirmez). Vitrin varsayilan grup / fallback
   * karari icin kullanir. Yalnizca attribute-definition id (media ic alani degil).
   */
  mediaDefiningAttributeId: string | null;
  /**
   * TODO-156D (ADR-080) — Admin-kontrollü SEO override'ları. Vitrin `generateMetadata` title/description
   * için önce bunları kullanır, yoksa title/description'a düşer. Public-safe meta metni (iç alan değil).
   */
  seoTitle: string | null;
  seoDescription: string | null;
  /** Benzer urunler (ayni katalogtan turetilir). */
  related: StorefrontProductSummary[];
}

/**
 * Faz 2C-7 (ADR-078) — Secili varyanta gore gosterilecek galeri gorsellerini secer.
 * Klasik galeride (media ekseni yok) TUM gorseller donmus (mevcut davranis birebir).
 * Eksen varsa: varyantin renk etiketine eslesenler + etiketsiz (paylasilan) gorseller.
 * Guvenli fallback: hic eslesme yoksa (or. tum gorseller baska renklerde) tum diziyi dondur
 * (gorselsiz PDP'yi onle).
 */
export function galleryImagesForVariant(
  images: StorefrontProductDetail["images"],
  mediaDefiningAttributeId: string | null,
  selectedMediaOptionId: string | null,
): StorefrontProductDetail["images"] {
  if (!mediaDefiningAttributeId) return images;
  const matched = images.filter(
    (image) => image.variantOptionId === null || image.variantOptionId === selectedMediaOptionId,
  );
  return matched.length > 0 ? matched : images;
}
