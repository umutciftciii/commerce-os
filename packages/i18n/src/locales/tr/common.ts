/**
 * Uygulamalar arasi paylasilan gorunur metinler (kabuk rozetleri, ortak aksiyon
 * fiilleri, durum etiketleri). TR kaynak sozlugudur; tip parite kaynagi burasidir.
 */
export const trCommon = {
  badges: {
    foundation: "Altyapı",
  },
  footer: "Altyapı sürümü · örnek veriler",
  actions: {
    save: "Kaydet",
    export: "Dışa aktar",
    manage: "Yönet",
    view: "Görüntüle",
    viewAll: "Tümünü gör",
    connect: "Bağlan",
    preview: "Önizle",
    customize: "Özelleştir",
  },
  status: {
    live: "Canlı",
    healthy: "Sağlıklı",
    pending: "Bekliyor",
    idle: "Beklemede",
    notConnected: "Bağlı değil",
    notWired: "Henüz bağlı değil",
    active: "Etkin",
  },
};

export type CommonDictionary = typeof trCommon;
