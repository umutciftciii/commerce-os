# Runbook — Influencer Campaign Analytics Demo

> Müşteri demosu için influencer kampanya yaşam döngüsü + granüler analitik gösterimi.
> Fixture: `packages/db/scripts/influencer-demo-seed.mjs` (ADR-177). İlgili: ADR-170…179,
> TD-143/144/145/146.

## 0. Ortam

| Yüzey | URL |
|---|---|
| Storefront (vitrin) | `http://localhost:3000` |
| Store Admin | `http://localhost:3002` |
| API Gateway | `http://localhost:4000` |
| Demo mağaza | `enterprise-demo` (edm-store) — hem storefront hem store-admin bu mağazayı kullanır |

Servisler güncel kodla çalışıyor olmalı (deploy sonrası). Postgres/Redis/worker'a dokunulmaz.

## 1. Fixture kurulumu (deterministik, idempotent)

```bash
cd packages/db
DATABASE_URL="postgresql://commerce_os:commerce_os_password@127.0.0.1:5432/commerce_os?schema=public" \
SESSION_SECRET="<gateway ile aynı>" \
node scripts/influencer-demo-seed.mjs
```

Fixture (DEMO_FIXTURE): influencer **Melek İçmeli** (`MELEK-DEMO`) + 3 kampanya + 3 izleme linki + 42 tıklama + 5
atıflı sipariş (TRY + USD). Tekrar çalıştırma güvenli (kendi fixture'ını sıfırlar). **Demo bitene kadar SİLME.**

### Tracking linkleri (storefront)

| Kampanya | UTM | customLabel | Tracking URL |
|---|---|---|---|
| Instagram Yaz Kampanyası | source=instagram · medium=influencer · campaign=yaz-kampanyasi · content=reel-1 | Instagram Reel | `http://localhost:3000/t/WNML0ZhLUxV6PYNGO-fLV1B3KWapAAwf` |
| TikTok Çanta Lansmanı | source=tiktok · medium=influencer · campaign=canta-lansman · content=video-2 | TikTok Ürün Videosu | `http://localhost:3000/t/qTVKN_JCXTlh8aeiH8gf7zcBKCkMgD6_` |
| YouTube Teknoloji Demo | source=youtube · medium=influencer · term=gaming | YouTube Açıklama Linki | `http://localhost:3000/t/s28yEWg9KnwQKLdxTJedlEOAFfGsU19E` |

> Not: tracking token güvenlik nedeniyle store-admin'de gösterilmez (yalnız oluşturma/yenileme anında). Bu tablo
> yalnız runbook/demo içindir.

## 2. Demo akışı (store-admin)

1. **Giriş:** `http://localhost:3002` → Influencer'lar → **Melek İçmeli**.
2. **Influencer toplam dashboard** (üst): Kampanya 3 · Aktif 3 · Link 3 · 42 tıklama · 30 tekil · 5 sipariş.
   Kampanya kartları metrikli + **Analizi aç**.
3. **Kampanya dashboard** (Analizi aç → Instagram): yalnız o kampanyanın KPI'ı + **Günlük analytics** grafiği
   (7/30/90/özel tarih + link filtresi) + link tablosu + **UTM kırılımı** (customLabel dahil) + son siparişler.
4. **Link dashboard** (link satırı → Analizi aç): link KPI + günlük grafik + UTM + yaşam döngüsü zaman damgaları +
   son sipariş + son tıklama/dönüşüm. Gerçek URL/token GÖSTERİLMEZ.
5. **UTM görünürlüğü:** her kampanyanın UTM source/medium/campaign/content/term + customLabel doğru görünür.
6. **Currency ayrımı:** TikTok kampanyası **TRY + USD** ayrı gösterilir (`hasMultipleCurrencies`); tek toplama
   birleştirilmez. Influencer toplamı da TRY + USD ayrı.

### Beklenen KPI değerleri (fixture)

| Seviye | Tıklama | Tekil | Sipariş | Net gelir |
|---|---|---|---|---|
| Influencer toplam | 42 | 30 | 5 | ₺2.249,00 (TRY) · $129,00 (USD) |
| Instagram | 24 | 16 | 3 | ₺1.350,00 |
| TikTok | 12 | 9 | 2 | ₺899,00 + $129,00 |
| YouTube | 6 | 5 | 0 | — |

## 3. Yaşam döngüsü gösterimi (storefront + store-admin)

Store-admin İzleme linkleri bölümünde link aksiyonları: **Durdur** (PAUSED), **Etkinleştir** (ACTIVE), **İptal et**
(REVOKED, terminal). Kampanya için **Analizi aç** + durum.

1. **ACTIVE:** Instagram tracking URL'sini aç → ürüne yönlenir, tıklama kaydedilir (dashboard'da +1).
2. **PAUSED kampanya:** kampanyayı duraklat → aynı URL'yi aç → **`/campaign-unavailable`** markalı terminal sayfa
   ("Kampanya şu anda aktif değil"). Ürüne YÖNLENMEZ; yeni tıklama/session/cookie OLUŞMAZ.
3. **Tekrar ACTIVE:** kampanyayı etkinleştir → URL yeniden ürüne çalışır.
4. **REVOKED link:** linki iptal et → kampanya aktif olsa bile URL terminal sayfaya gider; geri alınamaz.
5. **ENDED/CANCELLED:** kampanya ENDED → terminal ("Kampanya sona erdi"); pencere-içi eski session convert edebilir.
   CANCELLED → terminal + eski session conversion üretmez + reaktive edilemez.
6. **noindex:** `/campaign-unavailable` `robots: noindex, nofollow` (SEO indexlenmez); attribution event DEĞİLDİR.

## 4. Cross-store izolasyonu

Başka mağaza admin'i bu influencer/kampanya verisini GÖREMEZ (store-scoped, cross-store 404). Data-layer smoke bunu
doğrular.

## 5. Demo sonrası

- **Fixture koruma:** demo verisi (MELEK-DEMO + INFDEMO- siparişler) demo bitene kadar KORUNUR.
- **Temizlik (isteğe bağlı, demo bitince):** seed'i `MELEK-DEMO` influencer + `INFDEMO-` siparişleri silecek şekilde
  tekrar çalıştırmak yerine, doğrudan: `DELETE FROM "Order" WHERE "orderNumber" LIKE 'INFDEMO-%'; DELETE FROM
  "Influencer" WHERE code='MELEK-DEMO';` (cascade kampanya/link/click/attribution). Postgres volume'a başka dokunma.
- **Geçici teknik smoke verisi** (varsa) temizlenir; DEMO_FIXTURE korunur.

## 6. Doğrulama (data-layer smoke özeti)

Beklenen (gerçek PG'ye karşı doğrulandı): influencer toplam 3 kampanya/42 tıklama/30 tekil/TRY+USD ayrı; kampanya
izolasyonu (A yalnız TRY, B TRY+USD); UTM currency-aware + customLabel; günlük seri store-tz + zero-fill; 7/30/90
aralık; cross-store sıfır.
