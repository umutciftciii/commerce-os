/**
 * Platform yonetim konsolu (admin-web) gorunur metinleri. TR kaynak sozlugu.
 */
export const trAdmin = {
  meta: {
    title: "commerce-os · Platform Yönetimi",
    description: "commerce-os çok kiracılı SaaS platformu için merkezi yönetim konsolu.",
  },
  shell: {
    brandName: "commerce-os",
    brandSubtitle: "Platform Yönetimi",
    topbarTitle: "Platform konsolu",
    userName: "Süper Yönetici",
    userRole: "Platform yöneticisi",
  },
  nav: {
    heading: "Yönetim",
    dashboard: "Platform Özeti",
    stores: "Mağazalar",
    plans: "Paketler",
    systemHealth: "Sistem Sağlığı",
    settings: "Ayarlar",
  },
  dashboard: {
    eyebrow: "Platform",
    title: "Platform Özeti",
    description: "Mağazalar, paketler ve sistem durumu için merkezi yönetim alanı.",
    exportReport: "Rapor indir",
    stats: {
      activeStores: "Aktif mağazalar",
      activeStoresHint: "Sağlama Faz 2'de devreye girecek",
      plans: "Paketler",
      plansHint: "Faturalandırma bağlanacak",
      mrr: "Aylık yinelenen gelir",
      mrrHint: "Analitik hazırlanıyor",
      systemStatus: "Sistem durumu",
    },
    storesCard: {
      title: "Mağazalar",
      description: "Platforma alınan kiracı mağazalar",
      emptyTag: "Faz 1",
      emptyTitle: "Henüz mağaza yok",
      emptyDescription:
        "Platforma alınan kiracı mağazalar, paket ve durum bilgileriyle burada listelenecek. Mağaza yönetimi Faz 1'de canlı API'ye bağlanacak.",
      emptyAction: "Mağazalara git",
    },
    plansCard: {
      title: "Paketler",
      description: "Kiracılara sunulan abonelik paketleri",
      emptyTag: "Faz 1",
      emptyTitle: "Henüz paket tanımlı değil",
      emptyDescription:
        "Abonelik paketleri ve kullanım limitleri burada yönetilecek; faturalandırma bağlandığında tanımlanabilir olacak.",
    },
    healthCard: {
      title: "Sistem Sağlığı",
      description: "Gateway, worker, veritabanı ve önbellek",
      emptyTag: "Faz 1",
      emptyTitle: "Canlı kontroller bekleniyor",
      emptyDescription:
        "API Gateway, Worker, PostgreSQL ve Redis sağlık durumu burada özetlenecek.",
      emptyAction: "Sistem sağlığını aç",
    },
  },
  stores: {
    eyebrow: "Platform",
    title: "Mağazalar",
    description: "Platformdaki tüm kiracı mağazaları sağla, askıya al ve incele.",
    newStore: "Yeni mağaza",
    cardTitle: "Tüm mağazalar",
    cardDescription: "Kiracı dizini",
    emptyTag: "Faz 1",
    emptyTitle: "Henüz mağaza yok",
    emptyDescription:
      "Mağaza sağlama, paket atama ve kiracı yaşam döngüsü kontrolleri burada yer alacak. Mağaza yönetimi Faz 1'de canlı API'ye bağlanacak.",
    emptyAction: "İlk mağazayı oluştur",
  },
  plans: {
    eyebrow: "Platform",
    title: "Paketler",
    description: "Kiracılara sunulan abonelik kademeleri, kullanım limitleri ve fiyatlandırma.",
    newPlan: "Yeni paket",
    cardTitle: "Abonelik paketleri",
    cardDescription: "Paketler ve limitler",
    emptyTag: "Faz 1",
    emptyTitle: "Henüz paket tanımlı değil",
    emptyDescription:
      "Abonelik paketleri ve kullanım limitleri burada yönetilecek. Faturalandırma modülü bağlandığında kademe, hak ve fiyatlandırma tanımlanabilir olacak.",
    emptyAction: "Paket tanımla",
  },
  systemHealth: {
    eyebrow: "Operasyon",
    title: "Sistem Sağlığı",
    description: "Platform çalışma zamanı bileşenlerinin canlı durumu.",
    breadcrumb: "Platform · Operasyon",
    cardTitle: "Çalışma zamanı bileşenleri",
    cardDescriptionPrefix: "Sağlık kontrolleri gateway'i şu adresten çağıracak:",
    components: [
      { name: "API Gateway", detail: "Fastify HTTP geçidi" },
      { name: "Worker", detail: "BullMQ arka plan işleri" },
      { name: "PostgreSQL", detail: "Birincil veritabanı" },
      { name: "Redis", detail: "Kuyruk ve önbellek" },
    ],
    emptyTag: "Faz 1",
    emptyTitle: "Canlı kontroller henüz bağlı değil",
    emptyDescription:
      "Bu sayfa, API Gateway, Worker, PostgreSQL ve Redis kontrollerini izleyecek; gateway'in dahili sağlık uçlarını (DB ve Redis) yoklayacak ve worker kuyruk derinliğini gösterecek. API istemci yer tutucusu gateway adresini API_GATEWAY_URL üzerinden çözüyor.",
  },
  settings: {
    eyebrow: "Platform",
    title: "Ayarlar",
    description: "Platform geneli güvenlik, limit ve operasyon ayarları burada toplanacak.",
    cardTitle: "Genel",
    cardDescription: "Platform kimliği (salt okunur yer tutucu)",
    platformName: "Platform adı",
    supportEmail: "Destek e-postası",
    note: "Düzenlenebilir platform ayarları ve kalıcı kayıt sonraki bir fazda bağlanacak.",
  },
};

export type AdminDictionary = typeof trAdmin;
