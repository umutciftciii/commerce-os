/**
 * Genel demo vitrin (storefront-web) gorunur metinleri. TR kaynak sozlugu.
 * Demo urun katalogu da burada tutulur (yer tutucu icerik); handle alanlari
 * sabit kimliklerdir, gorunur metin degildir ve cevrilmez.
 */
export const trStorefront = {
  meta: {
    title: "Demo Mağaza · commerce-os",
    description: "commerce-os platformu üzerinde çalışan demo vitrin.",
  },
  shell: {
    brand: "Demo Mağaza",
    announcement: "₺750 ve üzeri siparişlerde ücretsiz kargo · Demo vitrin",
    navProducts: "Ürünler",
    navCart: "Sepet",
    footerTagline: "commerce-os üzerinde çalışan örnek bir vitrin.",
    footerShopHeading: "Alışveriş",
    footerAllProducts: "Tüm ürünler",
    footerCart: "Sepetim",
    footerHelpHeading: "Yardım",
    footerHelpShipping: "Kargo ve teslimat",
    footerHelpReturns: "İade ve değişim",
    footerCompanyHeading: "Kurumsal",
    footerCompanyAbout: "Hakkımızda",
    footerCompanyContact: "İletişim",
    footerCopyright: "© 2026 Demo Mağaza · Tüm hakları saklıdır.",
    footerPoweredBy: "commerce-os altyapısıyla güçlendirilmiştir · vitrin altyapısı",
  },
  home: {
    badge: "Demo Mağaza",
    heroTitle: "Günlük yaşamın özenle üretilmiş parçaları.",
    heroDescription:
      "commerce-os üzerinde çalışan bir demo vitrin. Aşağıdaki ürünler, sepet ve ödeme akışı, alışveriş deneyimini önizleyen yer tutuculardır.",
    shopCta: "Ürünleri keşfet",
    cartCta: "Sepete göz at",
    valueProps: [
      { title: "Hızlı teslimat", detail: "Türkiye geneli 1–3 iş günü" },
      { title: "Güvenli ödeme", detail: "256-bit SSL korumalı altyapı" },
      { title: "Kolay iade", detail: "14 gün içinde koşulsuz iade" },
    ],
    featuredEyebrow: "Seçtiklerimiz",
    featuredTitle: "Öne çıkan ürünler",
    featuredViewAll: "Tümünü gör",
  },
  listing: {
    eyebrow: "Koleksiyon",
    title: "Tüm ürünler",
    // {count} yer tutucusu urun sayisi ile degistirilir.
    description: "Demo katalog — listeleme ızgarasını önizleyen {count} örnek ürün.",
  },
  detail: {
    breadcrumbProducts: "Ürünler",
    fallbackName: "Örnek ürün",
    fallbackCategory: "Demo",
    fallbackBlurb: "Bu, vitrin altyapısı için bir örnek ürün detay sayfasıdır.",
    sizeLabel: "Beden",
    addToCart: "Sepete ekle",
    buyNow: "Hemen al",
    note: "Sepet ve ödeme aksiyonları yer tutucudur; henüz gerçek satın alma işlemi çalışmaz.",
  },
  cart: {
    title: "Sepetim",
    emptyTitle: "Sepetiniz boş",
    emptyDescription:
      "Sepet satırlarını, adetleri ve toplamı önizlemek için demo ürünler ekleyin. Sepet içeriği henüz kalıcı olarak saklanmıyor.",
    emptyAction: "Ürünlere göz at",
  },
  checkout: {
    title: "Ödeme",
    steps: [
      { title: "Bilgiler", detail: "İletişim ve teslimat adresi" },
      { title: "Kargo", detail: "Teslimat yöntemi ve ücretleri" },
      { title: "Ödeme", detail: "Güvenli ödeme alımı" },
    ],
    note: "Ödeme akışı yer tutucudur. Gerçek kargo, vergi ve ödeme adımları sonraki bir fazda ödeme servisine bağlanacak — burada hiçbir ödeme işlemi çalışmaz.",
  },
  cartCount: "0",
  products: [
    {
      handle: "merinos-yuvarlak-yaka-kazak",
      name: "Merinos Yuvarlak Yaka Kazak",
      category: "Giyim",
      priceLabel: "₺1.290",
      tag: "Yeni",
      blurb: "Yumuşak merinos yününden, her güne uygun hafif örgü.",
    },
    {
      handle: "kanvas-haftasonu-cantasi",
      name: "Kanvas Hafta Sonu Çantası",
      category: "Aksesuar",
      priceLabel: "₺1.850",
      tag: "Çok satan",
      blurb: "Deri detaylı, dayanıklı pamuklu kanvas seyahat çantası.",
    },
    {
      handle: "seramik-filtre-kahve-demligi",
      name: "Seramik Filtre Kahve Demliği",
      category: "Ev & Yaşam",
      priceLabel: "₺640",
      tag: "",
      blurb: "Sakin sabahlar için tek fincanlık seramik demlik.",
    },
    {
      handle: "keten-masa-runneri",
      name: "Keten Masa Örtüsü Runner",
      category: "Ev & Yaşam",
      priceLabel: "₺420",
      tag: "",
      blurb: "Her gün kullanım için taş yıkamalı keten runner.",
    },
  ],
};

export type StorefrontDictionary = typeof trStorefront;
