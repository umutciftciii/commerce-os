/**
 * Magaza yonetim paneli (store-admin-web) gorunur metinleri. TR kaynak sozlugu.
 */
export const trStoreAdmin = {
  meta: {
    title: "commerce-os · Mağaza Yönetimi",
    description: "commerce-os üzerinde satış yapan işletmeler için mağaza yönetim paneli.",
  },
  shell: {
    brandName: "Demo Mağaza",
    brandSubtitle: "Mağaza Yönetimi",
    topbarTitle: "Mağaza paneli",
    userName: "Mağaza Sahibi",
    userRole: "Mağaza yöneticisi",
  },
  nav: {
    heading: "Operasyon",
    dashboard: "Mağaza Paneli",
    products: "Ürünler",
    orders: "Siparişler",
    inventory: "Stok",
    customers: "Müşteriler",
    marketplace: "Pazaryerleri",
    theme: "Tema",
    settings: "Ayarlar",
  },
  dashboard: {
    eyebrow: "Mağaza",
    title: "Mağaza Paneli",
    description: "Satış, sipariş, stok ve pazaryeri senkronizasyonu için operasyon özeti.",
    rangeLabel: "Son 30 gün",
    stats: {
      sales: "Bugünkü satış",
      salesHint: "Siparişler Faz 2'de bağlanacak",
      openOrders: "Açık siparişler",
      openOrdersHint: "Karşılama bekleniyor",
      lowStock: "Kritik stok",
      lowStockHint: "Stok takibi bekleniyor",
      marketplaceSync: "Pazaryeri senkronu",
    },
    ordersCard: {
      title: "Son siparişler",
      description: "Tüm kanallardan gelen güncel siparişler",
      emptyTag: "Faz 2",
      emptyTitle: "Henüz sipariş yok",
      emptyDescription:
        "Storefront ve pazaryeri siparişleri burada birleşecek; gelen siparişler kanal bilgisiyle listelenecek.",
    },
    inventoryCard: {
      title: "Stok uyarıları",
      description: "Dikkat gerektiren ürünler",
      emptyTag: "Faz 2",
      emptyTitle: "Yenilenecek ürün yok",
      emptyDescription:
        "Kritik ve tükenen stok uyarıları, stok takibi devreye girdiğinde burada listelenecek.",
    },
  },
  products: {
    eyebrow: "Katalog",
    title: "Ürünler",
    description: "Mağazanız için ürün kataloğu, varyantlar, fiyatlandırma ve görseller.",
    addProduct: "Ürün ekle",
    cardTitle: "Katalog",
    cardDescription: "Tüm ürünler",
    emptyTag: "Faz 2",
    emptyTitle: "Kataloğunuz boş",
    emptyDescription:
      "Ürün oluşturma, varyant, fiyatlandırma ve görsel yönetimi burada yer alacak. Ürün kataloğu Faz 2'de canlı veriyle yönetilecek.",
    emptyAction: "İlk ürünü ekle",
  },
  orders: {
    eyebrow: "Operasyon",
    title: "Siparişler",
    description: "Tüm satış kanallarından gelen siparişleri takip et, karşıla ve iade et.",
    cardTitle: "Tüm siparişler",
    cardDescription: "Storefront ve pazaryeri siparişleri",
    emptyTag: "Faz 2",
    emptyTitle: "Henüz sipariş yok",
    emptyDescription:
      "Storefront ve pazaryeri siparişleri burada birleşecek; sipariş detayları, karşılama durumu ve ödeme durumu buradan yönetilecek.",
  },
  inventory: {
    eyebrow: "Operasyon",
    title: "Stok",
    description: "Konumlar arası stok seviyeleri, depolar ve stok hareketleri.",
    adjustStock: "Stok düzelt",
    cardTitle: "Konuma göre stok",
    cardDescription: "Depolar ve miktarlar",
    emptyTag: "Faz 2",
    emptyTitle: "Henüz stok takibi yok",
    emptyDescription:
      "Depo, rezerve stok ve kanal bazlı stok kuralları burada yönetilecek; stok sayımı ve hareket geçmişi listelenecek.",
  },
  customers: {
    eyebrow: "İlişki",
    title: "Müşteriler",
    description: "Müşteri profilleri, iletişim bilgileri ve sipariş geçmişi.",
    cardTitle: "Tüm müşteriler",
    cardDescription: "Müşteri dizini",
    emptyTag: "Faz 2",
    emptyTitle: "Henüz müşteri yok",
    emptyDescription:
      "Müşteri kayıtları ve adres bilgileri burada listelenecek; segmentler ve yaşam boyu değer siparişler geldikçe görünecek.",
  },
  marketplace: {
    eyebrow: "Entegrasyon",
    title: "Pazaryerleri",
    description: "Dış pazaryerlerini bağla; ürün listelerini ve siparişleri senkron tut.",
    cardTitle: "Kanallar",
    cardDescription: "Kullanılabilir entegrasyonlar",
    channels: [
      { name: "Trendyol", detail: "Pazaryeri ürün listeleme ve sipariş senkronu" },
      { name: "Hepsiburada", detail: "Pazaryeri ürün listeleme ve sipariş senkronu" },
    ],
    note: "Trendyol ve Hepsiburada bağlantıları Faz 6'da aktif edilecek; OAuth/kimlik akışları ile ürün ve sipariş senkronizasyonu o fazda eklenecek.",
  },
  theme: {
    eyebrow: "Vitrin",
    title: "Tema",
    description: "Mağaza vitrininizin görünümünü seçin ve özelleştirin.",
    cardTitle: "Kullanılabilir temalar",
    cardDescription: "Vitrin sunumu",
    themes: [
      { name: "Aurora", detail: "Sade, dönüşüm odaklı varsayılan tema" },
      { name: "Boutique", detail: "Moda için editöryel düzen" },
      { name: "Market", detail: "Geniş katalog için yoğun ızgara" },
    ],
    note: "Mağaza vitrini için tema seçimi ve düzenleme burada yapılacak; canlı önizleme ve özelleştirme sonraki bir fazda vitrine bağlanacak.",
  },
  settings: {
    eyebrow: "Mağaza",
    title: "Ayarlar",
    description: "Mağaza bilgileri, domain, vergi ve operasyon ayarları burada yönetilecek.",
    cardTitle: "Genel",
    cardDescription: "Mağaza kimliği (salt okunur yer tutucu)",
    storeName: "Mağaza adı",
    contactEmail: "İletişim e-postası",
    note: "Düzenlenebilir mağaza ayarları ve kalıcı kayıt sonraki bir fazda bağlanacak.",
  },
};

export type StoreAdminDictionary = typeof trStoreAdmin;
