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
    cancel: "Vazgeç",
    create: "Oluştur",
    update: "Güncelle",
    edit: "Düzenle",
    retry: "Tekrar dene",
    refresh: "Yenile",
    logout: "Çıkış yap",
    signIn: "Giriş yap",
    dismiss: "Kapat",
  },
  states: {
    loading: "Yükleniyor…",
    saving: "Kaydediliyor…",
    loadErrorTitle: "Veriler yüklenemedi",
    loadErrorBody: "İçerik alınırken bir sorun oluştu. Lütfen tekrar deneyin.",
  },
  status: {
    live: "Canlı",
    healthy: "Sağlıklı",
    pending: "Bekliyor",
    idle: "Beklemede",
    notConnected: "Bağlı değil",
    notWired: "Henüz bağlı değil",
    active: "Etkin",
    ok: "Çalışıyor",
    degraded: "Sorunlu",
    unknown: "Bilinmiyor",
  },
  language: {
    ariaLabel: "Arayüz dili",
    turkish: "Türkçe",
    english: "İngilizce",
  },
};

export type CommonDictionary = typeof trCommon;
