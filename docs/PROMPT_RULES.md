# Prompt Rules

## AI Calisma Kurallari

- Her prompt, ilgili ise docs guncelleme zorunlulugu icerecek.
- Yeni teknik borc `docs/TECHNICAL_DEBT.md` dosyasina yazilacak.
- Yeni karar `docs/DECISIONS.md` dosyasina ADR olarak yazilacak.
- Yeni yapilacak is `docs/TODO.md` dosyasina yazilacak.
- Faz notu `docs/PHASE_LOG.md` dosyasina yazilacak.
- Secret, token, credential veya gercek musteri verisi dokumanlara yazilmayacak.
- Feature sisirmesi yapilmayacak; istenmeyen yeni ozellik eklenmeyecek.
- Test, lint, typecheck ve build sonuclari raporlanacak.
- Kod mimarisi veya runtime davranisi degistirildiginde ilgili mimari ve servis siniri dokumanlari
  ayni degisiklikte guncellenecek.
- Faz kapanisi, docs guncelligi dogrulanmadan tamamlanmis sayilmayacak.

## Design-First Kurali (Frontend/UI)

Yeni bir page, layout, dashboard, panel, shell veya onemli UI ekrani olustururken once kisa bir
"Claude Design Plan" cikarilir, sonra koda gecilir. Plan pratik ve uygulanabilir olur; uzun manifesto
olmaz. Kod, plan ile celismez.

Claude Design Plan icerigi:

- Sayfanin amaci
- Kullanici rolu
- Bilgi hiyerarsisi
- Layout yapisi
- Ana componentler
- Empty/loading/error state yaklasimi
- Responsive davranis
- Gorsel ton: acik, premium, sade, kurumsal SaaS

Kacinilacaklar: dark theme, neon/AI look, asiri gradient, gereksiz animasyon, dashboard kalabaligi.

Ek kurallar:

- Birden fazla page olusturulurken her page icin kisa design plan eklenir.
- Placeholder ekranlar bile gercek urun kalitesine yakin app shell hissi verir; "bos ekran" yapilmaz,
  her placeholder sayfada baglam, beklenen gelecek modul ve anlasilir empty state bulunur.
- Ortak component kullanilabilecek yerde tekrar eden markup yazilmaz; `packages/ui` primitive'leri
  tercih edilir.
- Light-first premium SaaS gorunumu korunur; ortak Tailwind preset kullanilir.

### Detail Route vs Modal Kurali (bkz. ADR-027)

- Ana entity detay ekranlari MODAL OLAMAZ; ayri route/page olarak tasarlanir.
- Modal yalnizca kisa, gecici, dusuk kapsamli aksiyonlar icindir (create/edit/confirm/quick
  action/adjust).
- Sipariş, ürün, müşteri, mağaza, stok, varyant, plan gibi detay ekranlari modal degildir; route/page
  olur (`/orders/[id]`, `/products/[id]`, …).
- Uzun form, timeline, finansal özet, tablolu detay, lifecycle aksiyon veya audit/event iceren ekran
  route/page olmak zorundadir.
- Her tasarim planinda "detail route vs modal" karari acikca yazilir.

### Premium / Demo-Ready UI Kurali (bkz. F2I)

- Musteri onune cikan ekranlar "demo-ready" kalitede olur: yalniz islevsel degil, satilabilir
  gorunum. Tasarim once yapilir (design-first), sonra kod yazilir.
- Gorsel dil "glass-inspired premium SaaS"tir (Apple cam dilinden ilham; birebir kopya degil):
  light-first, kirik beyaz zemin, translucent yuzeyler (`bg-white/70`), olculu `backdrop-blur`,
  ince white/silver kenar (`ring-1 ring-slate-200/70`), dusuk yogunluklu katmanli golge,
  `rounded-2xl/3xl` olculu. `#9743CD` marka vurgusu yalnizca CTA/accent/aktif gostergede.
- Detay sayfasi "form yiginina" benzemez: guclu kimlik basligi (hero), iki kolonlu yerlesim
  (sol ana icerik + sag kompakt baglam rayi) ve bolumlenmis cam yuzeyler kullanilir.
- Liste sayfalari ust ozet/metric tile seridi, rafine filtre/aksiyon alani ve urun hissinde
  empty/loading/error state tasir.
- Erisilebilirlik korunur: glass effect okunabilirligi/kontrasti dusurmez, tum etkilesimli
  ogelerde focus state kalir, `backdrop-blur` performans/okunabilirlik bozacak kadar kullanilmaz.
- Store-admin'e ozel premium primitive'ler app-local olabilir; admin-web ile ortaklasirsa
  `packages/ui`'ye tasinir. Asiri soyutlamadan kacinilir.

## Dil ve i18n Kurali (Frontend/UI)

- Varsayilan urun dili Turkce'dir. Tum yeni gorunur UI metni varsayilan olarak Turkce uretilir
  (bkz. ADR-013).
- Tum gorunur UI metni `packages/i18n` sozlugunden okunur. Bilesenlerde, sayfalarda veya layout'larda
  hardcoded gorunur metin yazmak YASAKTIR (bkz. ADR-014). Buna sidebar, topbar, sayfa basligi ve
  aciklamasi, buton, badge, empty state, kart basligi, footer notu ve storefront metinleri dahildir.
- Yeni bir gorunur metin eklerken once ilgili namespace sozlugune (`common`, `admin`, `storeAdmin`,
  `storefront`) Turkce key eklenir; ardindan ayni key Ingilizce (`en`) ayna sozluge eklenir. tr/en
  key parity her zaman korunur ve testle dogrulanir.
- Sabit kimlikler (urun `handle`, route segmenti, env adlari) gorunur metin degildir ve cevrilmez.
- Locale cozumleme her app'te tek noktada (`lib/i18n.ts`) toplanir; su an varsayilan `tr`. Runtime
  locale switcher, URL locale prefix ve tarayici dil tespiti bu asamada kapsam disidir.
- Yeni i18n ihtiyaclari icin agir framework veya yeni dependency eklenmez; mevcut basit tipli sozluk
  sistemi genisletilir.
