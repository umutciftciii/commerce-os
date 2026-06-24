# Project Overview

## Urun Amaci

commerce-os, Turkiye pazarina odaklanan cok kiracili e-ticaret operasyon SaaS temelidir. Hedefi,
markalarin ve saticilarin urun, siparis, odeme, kargo, fatura, pazaryeri entegrasyonu ve operasyon
sureclerini tek bir yonetim yuzeyinden kontrol edebilmesidir.

## MVP Konumlandirmasi

MVP, tam kapsamli bir e-ticaret platformu degil; guvenilir backend foundation uzerine kurulacak
yonetim, storefront ve entegrasyon yetenekleri icin ilk calisir urun cekirdegidir. Ilk hedef, temel
tenant modeli, ticaret varliklari, admin akislari ve Turkiye pazaryeri ihtiyaclarini tasiyabilecek
servis sinirlarini dogrulamaktir.

## Turkiye Pazaryeri Odakli E-Ticaret SaaS Hedefi

Urun stratejisi Turkiye'deki pazaryeri ve ticaret operasyonlarina gore sekillenir:

- Trendyol, Hepsiburada, N11 ve benzeri pazaryerleriyle entegrasyon icin genisleyebilir altyapi.
- Magaza, domain, abonelik, kullanici ve rol yonetimi icin cok kiracili temel.
- Yerel operasyon ihtiyaclari icin kargo, fatura, odeme ve bildirim servislerine ayrilabilir yapi.
- Buyume asistanlari, raporlama ve otomasyonlar icin olay, kuyruk ve analitik temeli.

## MVP Kapsami

- Monorepo, pnpm ve Turborepo foundation.
- Fastify tabanli API gateway.
- PostgreSQL 16 ve Prisma tabanli veri modeli.
- Redis ve BullMQ kuyruk altyapisi.
- Tenant foundation modelleri: platform user, store, store user, domain, plan, subscription.
- Faz 2A katalog/stok foundation: store-scoped product, category, variant, inventory item ve
  inventory movement modelleri; manuel stok adjustment API'leri.
- Health, version, internal DB ve Redis health endpointleri.
- Idempotent seed ve seed dogrulama akislari.
- Servis skeletonlari ve paylasimli paketler.
- Dokumantasyon-first proje takip disiplini.

## MVP Disi Kalanlar

- Gercek frontend uygulamalari.
- Gercek auth/session implementasyonu.
- Tam permission enforcement.
- Canli odeme, kargo, fatura ve pazaryeri entegrasyonlari.
- Store-admin UI catalog baglama, public storefront resolver, sepet, siparis, checkout, payment,
  shipping, campaign ve marketplace akislari.
- Production-grade observability, alerting ve deployment otomasyonu.
- Buyume asistaninin AI destekli son kullanici ozellikleri.
