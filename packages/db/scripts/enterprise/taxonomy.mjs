/**
 * Enterprise Demo Dataset — TAKSONOMİ (kategori ağacı, marka evreni, attribute kataloğu).
 *
 * Bu dosya SAF veridir (IO yok). Gerçek bir Türkiye e-ticaret mağazasının dağılımını
 * taklit eder: çok gruplu kategori ağacı, dengesiz marka dağılımı, kategoriye anlamlı
 * bağlı attribute tanımları ve facet-üreten option havuzları.
 */

// ---------------------------------------------------------------------------
// 1) KATEGORİ AĞACI — birden fazla ana grup, 2–3 seviye derinlik.
//    kind: yaprak kategorinin üretim profili (bkz. LEAF_PROFILES). Dal düğümlerde null.
// ---------------------------------------------------------------------------
export const CATEGORY_TREE = [
  // Elektronik
  { slug: "elektronik", name: "Elektronik", parent: null, sortOrder: 10, kind: null },
  { slug: "telefon", name: "Telefon", parent: "elektronik", sortOrder: 10, kind: "phone" },
  { slug: "dizustu-bilgisayar", name: "Dizüstü Bilgisayar", parent: "elektronik", sortOrder: 20, kind: "laptop" },
  { slug: "masaustu-bilgisayar", name: "Masaüstü Bilgisayar", parent: "elektronik", sortOrder: 30, kind: "desktop" },
  { slug: "monitor", name: "Monitör", parent: "elektronik", sortOrder: 40, kind: "monitor" },
  { slug: "kulaklik", name: "Kulaklık", parent: "elektronik", sortOrder: 50, kind: "headphone" },
  { slug: "akilli-saat", name: "Akıllı Saat", parent: "elektronik", sortOrder: 60, kind: "smartwatch" },
  { slug: "tablet", name: "Tablet", parent: "elektronik", sortOrder: 70, kind: "tablet" },
  { slug: "bilgisayar-bilesenleri", name: "Bilgisayar Bileşenleri", parent: "elektronik", sortOrder: 80, kind: null },
  { slug: "ram", name: "RAM", parent: "bilgisayar-bilesenleri", sortOrder: 10, kind: "ram" },
  { slug: "ssd", name: "SSD", parent: "bilgisayar-bilesenleri", sortOrder: 20, kind: "ssd" },
  { slug: "ekran-karti", name: "Ekran Kartı", parent: "bilgisayar-bilesenleri", sortOrder: 30, kind: "gpu" },

  // Moda
  { slug: "moda", name: "Moda", parent: null, sortOrder: 20, kind: null },
  { slug: "kadin-giyim", name: "Kadın Giyim", parent: "moda", sortOrder: 10, kind: "womens-apparel" },
  { slug: "erkek-giyim", name: "Erkek Giyim", parent: "moda", sortOrder: 20, kind: "mens-apparel" },
  { slug: "ayakkabi", name: "Ayakkabı", parent: "moda", sortOrder: 30, kind: "shoes" },
  { slug: "canta", name: "Çanta", parent: "moda", sortOrder: 40, kind: "bags" },

  // Ev ve Yaşam
  { slug: "ev-ve-yasam", name: "Ev ve Yaşam", parent: null, sortOrder: 30, kind: null },
  { slug: "kucuk-ev-aletleri", name: "Küçük Ev Aletleri", parent: "ev-ve-yasam", sortOrder: 10, kind: "small-appliance" },
  { slug: "mutfak", name: "Mutfak", parent: "ev-ve-yasam", sortOrder: 20, kind: "kitchen" },
  { slug: "ev-tekstili", name: "Ev Tekstili", parent: "ev-ve-yasam", sortOrder: 30, kind: "home-textile" },
  { slug: "dekorasyon", name: "Dekorasyon", parent: "ev-ve-yasam", sortOrder: 40, kind: "decor" },

  // Kişisel Bakım
  { slug: "kisisel-bakim", name: "Kişisel Bakım", parent: null, sortOrder: 40, kind: null },
  { slug: "cilt-bakimi", name: "Cilt Bakımı", parent: "kisisel-bakim", sortOrder: 10, kind: "skincare" },
  { slug: "sac-bakimi", name: "Saç Bakımı", parent: "kisisel-bakim", sortOrder: 20, kind: "haircare" },
  { slug: "parfum", name: "Parfüm", parent: "kisisel-bakim", sortOrder: 30, kind: "perfume" },

  // Spor ve Outdoor
  { slug: "spor-ve-outdoor", name: "Spor ve Outdoor", parent: null, sortOrder: 50, kind: null },
  { slug: "fitness-ekipmanlari", name: "Fitness Ekipmanları", parent: "spor-ve-outdoor", sortOrder: 10, kind: "fitness" },
  { slug: "outdoor-giyim", name: "Outdoor Giyim", parent: "spor-ve-outdoor", sortOrder: 20, kind: "outdoor-apparel" },
  { slug: "bisiklet", name: "Bisiklet", parent: "spor-ve-outdoor", sortOrder: 30, kind: "bicycle" },

  // Anne ve Bebek
  { slug: "anne-ve-bebek", name: "Anne ve Bebek", parent: null, sortOrder: 60, kind: null },
  { slug: "bebek-bezi", name: "Bebek Bezi", parent: "anne-ve-bebek", sortOrder: 10, kind: "baby-diaper" },
  { slug: "bebek-giyim", name: "Bebek Giyim", parent: "anne-ve-bebek", sortOrder: 20, kind: "baby-apparel" },
  { slug: "oyuncak", name: "Oyuncak", parent: "anne-ve-bebek", sortOrder: 30, kind: "toys" },

  // Ofis ve Kırtasiye
  { slug: "ofis-ve-kirtasiye", name: "Ofis ve Kırtasiye", parent: null, sortOrder: 70, kind: null },
  { slug: "kirtasiye", name: "Kırtasiye", parent: "ofis-ve-kirtasiye", sortOrder: 10, kind: "stationery" },
  { slug: "ofis-mobilyasi", name: "Ofis Mobilyası", parent: "ofis-ve-kirtasiye", sortOrder: 20, kind: "office-furniture" },
];

// ---------------------------------------------------------------------------
// 2) MARKA EVRENİ — dengesiz dağılım (major → çok ürün, niche → az ürün).
//    domain: markanın ait olduğu ürün alanı; weight: ürün atama ağırlığı.
//    Bazı markalar BİLEREK aynı prefix ile başlar (autocomplete prefix testleri için:
//    "Nova*", "Arte/Artis", "Sun*").
// ---------------------------------------------------------------------------
const B = (name, domain, tier) => ({ name, domain, tier });
export const BRANDS = [
  // Teknoloji — major
  B("Samsung", "tech", "major"),
  B("Apple", "tech", "major"),
  B("Xiaomi", "tech", "major"),
  B("Lenovo", "tech", "major"),
  B("Asus", "tech", "mid"),
  B("HP", "tech", "mid"),
  B("Dell", "tech", "mid"),
  B("Sony", "tech", "mid"),
  B("Monster", "tech", "mid"),
  B("Casper", "tech", "mid"),
  B("Logitech", "tech", "mid"),
  B("JBL", "tech", "mid"),
  B("Kingston", "tech", "mid"),
  B("Corsair", "tech", "mid"),
  B("Samfer", "tech", "niche"), // "Sam*" prefix çakışması (Samsung ile)
  B("Novatek", "tech", "mid"), // "Nova*" prefix ailesi
  B("Novasonic", "tech", "niche"), // "Nova*" prefix ailesi
  B("SunPower", "tech", "niche"), // "Sun*" prefix ailesi
  B("Anker", "tech", "mid"),
  B("Realme", "tech", "niche"),

  // Moda — major/mid/niche
  B("LC Waikiki", "fashion", "major"),
  B("Koton", "fashion", "major"),
  B("Mavi", "fashion", "mid"),
  B("Defacto", "fashion", "mid"),
  B("Nike", "fashion", "major"),
  B("Adidas", "fashion", "mid"),
  B("Puma", "fashion", "mid"),
  B("Converse", "fashion", "mid"),
  B("Novastyle", "fashion", "niche"), // "Nova*" prefix ailesi
  B("Artis", "fashion", "mid"), // "Art*" prefix
  B("Artesan", "fashion", "niche"), // "Art*" prefix
  B("Sunwear", "fashion", "niche"), // "Sun*" prefix
  B("Lumière", "fashion", "niche"),
  B("Denimo", "fashion", "niche"),
  B("Trendix", "fashion", "mid"),

  // Ev & Yaşam / Mutfak — major/mid/niche
  B("Arçelik", "home", "major"),
  B("Vestel", "home", "major"),
  B("Arzum", "home", "mid"),
  B("Fakir", "home", "mid"),
  B("Karaca", "home", "mid"),
  B("Tefal", "home", "mid"),
  B("Philips", "home", "major"),
  B("Bosch", "home", "mid"),
  B("Novahome", "home", "niche"), // "Nova*" prefix ailesi
  B("Artdeco Living", "home", "niche"), // "Art*" prefix
  B("Evina", "home", "mid"),
  B("Madame Coco", "home", "mid"),
  B("English Home", "home", "mid"),
  B("Sunhome", "home", "niche"), // "Sun*" prefix

  // Kişisel Bakım
  B("Nivea", "personalcare", "major"),
  B("L'Oréal", "personalcare", "mid"),
  B("Dove", "personalcare", "mid"),
  B("Garnier", "personalcare", "mid"),
  B("Bioderma", "personalcare", "niche"),
  B("Novaskin", "personalcare", "niche"), // "Nova*" prefix ailesi

  // Spor & Outdoor
  B("Decathlon", "sports", "major"),
  B("Salomon", "sports", "niche"),
  B("Jack Wolfskin", "sports", "niche"),
  B("Kron", "sports", "mid"),
  B("Suntrek", "sports", "niche"), // "Sun*" prefix

  // Anne & Bebek
  B("Prima", "baby", "major"),
  B("Molfix", "baby", "mid"),
  B("Chicco", "baby", "mid"),
  B("Johnson's", "baby", "mid"),
  B("Novababy", "baby", "niche"), // "Nova*" prefix ailesi

  // Ofis & Kırtasiye
  B("Faber-Castell", "office", "mid"),
  B("Bic", "office", "mid"),
  B("Stella", "office", "mid"),
  B("IKEA", "office", "major"),
  B("Artline", "office", "niche"), // "Art*" prefix
];

/** Marka tier → ürün-atama ağırlığı (dengesiz dağılım). */
export const BRAND_TIER_WEIGHT = { major: 9, mid: 4, niche: 1 };

// ---------------------------------------------------------------------------
// 3) ATTRIBUTE KATALOĞU — tanımlar + option havuzları (facet üretir).
//    dataType: Prisma AttributeDataType. options yalnız SELECT/MULTI_SELECT/COLOR için.
// ---------------------------------------------------------------------------
const opt = (value, label, colorHex) => (colorHex ? { value, label, colorHex } : { value, label });

export const ATTRIBUTES = {
  renk: {
    code: "renk",
    name: "Renk",
    dataType: "COLOR",
    options: [
      opt("siyah", "Siyah", "#111111"),
      opt("beyaz", "Beyaz", "#FFFFFF"),
      opt("gri", "Gri", "#808080"),
      opt("lacivert", "Lacivert", "#1B2A4A"),
      opt("mavi", "Mavi", "#1E5FBF"),
      opt("kirmizi", "Kırmızı", "#C0392B"),
      opt("yesil", "Yeşil", "#27AE60"),
      opt("pembe", "Pembe", "#E84393"),
      opt("bej", "Bej", "#D8C3A5"),
      opt("mor", "Mor", "#8E44AD"),
      opt("gumus", "Gümüş", "#C0C0C0"),
      opt("altin", "Altın", "#D4AF37"),
    ],
  },
  beden: {
    code: "beden",
    name: "Beden",
    dataType: "SELECT",
    options: ["XS", "S", "M", "L", "XL", "XXL"].map((s) => opt(s.toLowerCase(), s)),
  },
  numara: {
    code: "numara",
    name: "Numara",
    dataType: "SELECT",
    options: ["36", "37", "38", "39", "40", "41", "42", "43", "44", "45"].map((s) => opt(s, s)),
  },
  depolama: {
    code: "depolama",
    name: "Depolama",
    dataType: "SELECT",
    options: [opt("128gb", "128 GB"), opt("256gb", "256 GB"), opt("512gb", "512 GB"), opt("1tb", "1 TB")],
  },
  ram_kapasitesi: {
    code: "ram_kapasitesi",
    name: "RAM Kapasitesi",
    dataType: "SELECT",
    options: [opt("8gb", "8 GB"), opt("16gb", "16 GB"), opt("32gb", "32 GB"), opt("64gb", "64 GB")],
  },
  ssd_kapasitesi: {
    code: "ssd_kapasitesi",
    name: "SSD Kapasitesi",
    dataType: "SELECT",
    options: [opt("256gb", "256 GB"), opt("512gb", "512 GB"), opt("1tb", "1 TB"), opt("2tb", "2 TB")],
  },
  ekran_boyutu: {
    code: "ekran_boyutu",
    name: "Ekran Boyutu",
    dataType: "SELECT",
    options: [
      opt("13", '13"'),
      opt("14", '14"'),
      opt("156", '15.6"'),
      opt("24", '24"'),
      opt("27", '27"'),
      opt("32", '32"'),
    ],
  },
  yenileme_hizi: {
    code: "yenileme_hizi",
    name: "Yenileme Hızı",
    dataType: "SELECT",
    options: [opt("60hz", "60 Hz"), opt("75hz", "75 Hz"), opt("144hz", "144 Hz"), opt("165hz", "165 Hz")],
  },
  islemci: {
    code: "islemci",
    name: "İşlemci",
    dataType: "SELECT",
    options: [
      opt("i5", "Intel Core i5"),
      opt("i7", "Intel Core i7"),
      opt("ryzen5", "AMD Ryzen 5"),
      opt("ryzen7", "AMD Ryzen 7"),
      opt("m3", "Apple M3"),
    ],
  },
  ekran_karti: {
    code: "ekran_karti",
    name: "Ekran Kartı",
    dataType: "SELECT",
    options: [
      opt("rtx4060", "GeForce RTX 4060"),
      opt("rtx4070", "GeForce RTX 4070"),
      opt("rx7600", "Radeon RX 7600"),
      opt("dahili", "Dahili Grafik"),
    ],
  },
  isletim_sistemi: {
    code: "isletim_sistemi",
    name: "İşletim Sistemi",
    dataType: "SELECT",
    options: [opt("win11", "Windows 11"), opt("macos", "macOS"), opt("freedos", "FreeDOS")],
  },
  cozunurluk: {
    code: "cozunurluk",
    name: "Çözünürlük",
    dataType: "SELECT",
    options: [opt("fhd", "Full HD"), opt("2k", "2K QHD"), opt("4k", "4K UHD")],
  },
  baglanti: {
    code: "baglanti",
    name: "Bağlantı",
    dataType: "MULTI_SELECT",
    options: [opt("bluetooth", "Bluetooth"), opt("kablolu", "Kablolu"), opt("24ghz", "2.4 GHz Alıcı")],
  },
  materyal: {
    code: "materyal",
    name: "Materyal",
    dataType: "SELECT",
    options: [
      opt("pamuk", "Pamuk"),
      opt("polyester", "Polyester"),
      opt("deri", "Deri"),
      opt("yun", "Yün"),
      opt("keten", "Keten"),
      opt("denim", "Denim"),
    ],
  },
  kalip: {
    code: "kalip",
    name: "Kalıp",
    dataType: "SELECT",
    options: [opt("slim", "Slim Fit"), opt("regular", "Regular Fit"), opt("oversize", "Oversize")],
  },
  yaka_tipi: {
    code: "yaka_tipi",
    name: "Yaka Tipi",
    dataType: "SELECT",
    options: [opt("bisiklet", "Bisiklet Yaka"), opt("vyaka", "V Yaka"), opt("polo", "Polo Yaka")],
  },
  kol_tipi: {
    code: "kol_tipi",
    name: "Kol Tipi",
    dataType: "SELECT",
    options: [opt("uzun", "Uzun Kol"), opt("kisa", "Kısa Kol")],
  },
  sezon: {
    code: "sezon",
    name: "Sezon",
    dataType: "SELECT",
    options: [opt("yaz", "Yaz"), opt("kis", "Kış"), opt("4mevsim", "4 Mevsim")],
  },
  malzeme: {
    code: "malzeme",
    name: "Malzeme",
    dataType: "SELECT",
    options: [
      opt("paslanmaz", "Paslanmaz Çelik"),
      opt("ahsap", "Ahşap"),
      opt("cam", "Cam"),
      opt("seramik", "Seramik"),
      opt("plastik", "Plastik"),
      opt("aluminyum", "Alüminyum"),
      opt("pamuk", "Pamuk"),
    ],
  },
  guc: { code: "guc", name: "Güç", dataType: "INTEGER", unit: "W" },
  parca_sayisi: { code: "parca_sayisi", name: "Parça Sayısı", dataType: "INTEGER", unit: "adet" },
  cilt_tipi: {
    code: "cilt_tipi",
    name: "Cilt Tipi",
    dataType: "SELECT",
    options: [
      opt("kuru", "Kuru"),
      opt("yagli", "Yağlı"),
      opt("karma", "Karma"),
      opt("hassas", "Hassas"),
      opt("normal", "Normal"),
    ],
  },
  hacim: {
    code: "hacim",
    name: "Hacim",
    dataType: "SELECT",
    options: [opt("50ml", "50 ml"), opt("100ml", "100 ml"), opt("200ml", "200 ml"), opt("400ml", "400 ml")],
  },
  yas_araligi: {
    code: "yas_araligi",
    name: "Yaş Aralığı",
    dataType: "SELECT",
    options: [
      opt("0-6ay", "0-6 Ay"),
      opt("6-12ay", "6-12 Ay"),
      opt("1-2yas", "1-2 Yaş"),
      opt("2-4yas", "2-4 Yaş"),
    ],
  },
  bez_bedeni: {
    code: "bez_bedeni",
    name: "Bez Bedeni",
    dataType: "SELECT",
    options: ["1", "2", "3", "4", "5", "6"].map((n) => opt(`no${n}`, `${n} Numara`)),
  },
};
