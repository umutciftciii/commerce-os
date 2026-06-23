# Technical Debt

## TD-001 Frontend app'ler henuz yok

- Durum: RESOLVED
- Oncelik: HIGH
- Etki: Admin, super admin ve storefront deneyimleri henuz kullanici tarafindan dogrulanamiyor.
- Cozum onerisi: Faz 1 ve Faz 3 kapsaminda admin/storefront foundation app'lerini baslatmak.
- Cozum: `apps/admin-web`, `apps/store-admin-web` ve `apps/storefront-web` shell'leri eklendi
  (placeholder/empty state seviyesinde). Gercek veri ve aksiyonlar yeni TD/TODO altinda takip edilir.
- Hedef faz: Faz 1, Faz 3

## TD-002 Gercek auth/session implementasyonu yok

- Durum: RESOLVED
- Oncelik: HIGH
- Etki: Tenant context ve permission kararlari henuz gercek oturum uzerinden uretilmiyor.
- Cozum onerisi: Session modeli, token stratejisi ve auth middleware'i Faz 1'de netlestirmek.
- Cozum: Faz 1A'da `PlatformSession`, bearer token hash dogrulama, login/me/logout endpointleri ve
  platform admin guard eklendi. OAuth, 2FA, password reset, refresh token ve browser cookie hardening
  bilincli olarak sonraki fazlara birakildi.
- Hedef faz: Faz 1

## TD-003 Permission sistemi henuz gercek endpointlerde uygulanmadi

- Durum: PARTIAL
- Oncelik: HIGH
- Etki: Roller ve yetkiler foundation seviyesinde; davranissal guvence endpointlerde eksik.
- Cozum onerisi: Permission guard'lari API gateway ve servis adapter'larinda zorunlu hale getirmek.
- Not: Faz 1A platform admin guard'i admin store/plan endpointlerinde uygulanir. Store admin
  endpointleri, store-user token/session tipi ve granular permission matrisi henuz yok. Bu nedenle
  platform admin endpointleri yalnizca `PlatformSession` uzerinden dogrulanir; ileride store-user
  token'i eklendiginde platform admin endpointlerine kabul edilmemesi ayrica test edilecek.
- Hedef faz: Faz 1

## TD-004 Tenant isolation helperlari foundation seviyesinde

- Durum: OPEN
- Oncelik: HIGH
- Etki: Store-scoped sorgular icin desen var, ancak gercek endpoint kapsaminda genisletilmeli.
- Cozum onerisi: TenantContext kullanan repository/service pattern'lerini Faz 1 endpointlerine tasimak.
- Not: `requireStoreAccess` ve `assertStoreRole` helper'lari eklendi ve testlendi; gercek store-admin
  endpointlerine uygulanmasi sonraki fazda devam edecek.
- Hedef faz: Faz 1

## TD-005 Integration/search/analytics servisleri skeleton seviyesinde

- Durum: OPEN
- Oncelik: MEDIUM
- Etki: Servis sinirlari ayrilmis olsa da gercek is davranisi ve kontratlar eksik.
- Cozum onerisi: Her servisi ilgili fazda minimum kontrat, test ve job/event akislariyla genisletmek.
- Hedef faz: Faz 6, Faz 7

## TD-006 Root db:migrate/seed Compose runtime'a bagli

- Durum: OPEN
- Oncelik: MEDIUM
- Etki: Host uzerinden migration/seed calismasi icin Docker Compose runtime'in ayakta olmasi gerekiyor.
- Cozum onerisi: Compose bagimli runtime komutlarini korurken host lifecycle notlarini README ve infra
  dokumanlarinda belirgin tutmak.
- Hedef faz: Faz 0, Faz 1

## TD-007 Prisma CLI host lifecycle notu dokumante edilmeli

- Durum: OPEN
- Oncelik: MEDIUM
- Etki: Host ve container `DATABASE_URL` farki yanlis migration/seed calistirmaya yol acabilir.
- Cozum onerisi: README'deki notu docs/ARCHITECTURE.md ve faz kapanis kurallarina baglamak.
- Hedef faz: Faz 0

## TD-008 Frontend app'ler Docker Compose'a eklenmedi

- Durum: OPEN
- Oncelik: MEDIUM
- Etki: admin-web, store-admin-web ve storefront-web container olarak compose ile ayaga kalkmiyor;
  su an lokal `pnpm dev:*` ile calisiyorlar. Backend runtime ve mevcut compose davranisi bilincli
  olarak degistirilmedi.
- Cozum onerisi: Frontend app'ler icin Next.js production Dockerfile ve compose servisleri eklemek;
  `API_GATEWAY_URL`'i container network'une gore set etmek.
- Hedef faz: Faz 3+

## TD-009 API client placeholder (auth/token yok)

- Durum: PARTIAL
- Oncelik: HIGH
- Etki: `packages/api-client` yalnizca public health/version cagrilarini yapar; auth, token, session
  ve per-domain resource'lar (stores, products, orders...) yok.
- Cozum onerisi: Auth/session fazinda token stratejisi ve type-safe resource gruplarini eklemek
  (TD-002 ile birlikte).
- Not: Faz 1A'da auth ve admin store/plan helper'lari eklendi. Faz 1B'de tipli `ApiError` (gateway
  hata `code`/`status`), internal DB/Redis health helper'lari ve frontend'in tek kanaldan erismesi
  icin kontrat tipi re-export'lari eklendi. Commerce per-domain resource'lari (product/order...) henuz
  yok.
- Hedef faz: Faz 1

## TD-015 Auth rate limit ve cookie hardening eksik

- Durum: OPEN
- Oncelik: HIGH
- Etki: Login endpointinde production-grade rate limit, lockout, cookie security ayarlari, CSRF
  stratejisi ve refresh token rotasyonu henuz yok.
- Cozum onerisi: UI baglama ve production hardening fazinda Fastify rate limit, browser cookie
  stratejisi, secure/sameSite/httpOnly ayarlari ve brute-force izleme eklemek.
- Not: Faz 1B'de admin-web BFF, platform token'i httpOnly + sameSite=lax + (prod) secure cookie'ye
  yazar (ADR-017). Kalan production hardening hala acik: gateway rate limit/lockout, CSRF token,
  refresh token rotasyonu ve `secure` flag'in prod dağıtım davranisinin dogrulanmasi.
- Hedef faz: Faz 1B/Faz 2

## TD-016 Admin UI auth baglama yok

- Durum: RESOLVED
- Oncelik: HIGH
- Etki: Backend auth/admin endpointleri hazir olsa da `apps/admin-web` henuz login formu, token
  saklama, me kontrolu, store/plan liste/form baglantisi yapmiyor.
- Cozum onerisi: Faz 1B'de admin-web'i `packages/api-client` auth/admin helper'larina baglamak.
- Cozum: Faz 1B'de admin-web BFF (Next route handler proxy) ile canli gateway'e baglandi: login/me/
  logout akisi, httpOnly cookie token saklama (ADR-017), oturum guard'li yonetim kabugu, stores/plans
  canli liste + create/update modallari, system health public bağlama ve dahili token gerektiren
  DB/Redis durumu icin guvenli server-side proxy. Tum gorunur metin `packages/i18n` uzerinden Turkce.
  Kalan hardening TD-015 ve TD-017'de takip edilir.
- Hedef faz: Faz 1B

## TD-010 Frontend ekranlari placeholder; gercek veri/aksiyon yok

- Durum: OPEN
- Oncelik: HIGH
- Etki: Tum frontend sayfalari empty state/placeholder; form submit, listeleme, mutation ve gercek
  is akislari yok. Storefront sepet/checkout aksiyonlari devre disi.
- Cozum onerisi: Ilgili commerce/storefront fazlarinda sayfalari gercek API'ye baglamak.
- Hedef faz: Faz 2, Faz 3, Faz 4

## TD-011 Storefront multi-tenant store resolver yok

- Durum: OPEN
- Oncelik: MEDIUM
- Etki: storefront-web tek demo store render eder; demo.localhost / custom domain / slug -> store
  cozumleyici yok.
- Cozum onerisi: Storefront foundation fazinda domain/slug routing ve tenant cozumleme eklemek.
- Hedef faz: Faz 3

## TD-012 Frontend testleri smoke seviyesinde

- Durum: OPEN
- Oncelik: MEDIUM
- Etki: UI testleri `react-dom/server` ile render smoke testleri ve health route guard'lari ile
  sinirli; jsdom tabanli etkilesim/erisilebilirlik testleri yok.
- Cozum onerisi: Etkilesim gerektiren ekranlar gelistikce jsdom + Testing Library tabanli testler
  eklemek.
- Not: Faz 1B'de admin-web icin BFF/data-katmani testleri (adminApi fake-fetch ile login/me/logout,
  stores/plans list+create, hata->kod, NETWORK), hata-kodu->Turkce mesaj esleme testi, login SSR
  smoke ve i18n copy/parity testleri eklendi. Gercek DOM etkilesimi (form submit, modal acma, satir
  aksiyonu, erisilebilirlik) hala jsdom + Testing Library bekliyor.
- Hedef faz: Faz 2+

## TD-013 Frontend UI Ingilizce ve basic/starter template gorunum

- Durum: RESOLVED
- Oncelik: HIGH
- Etki: Ilk UI foundation tum ekranlari Ingilizce uretmisti; oysa proje Turkiye pazari odakli ve
  varsayilan dil Turkce olmali. Ayrica tasarim fazla basic/starter template hissi veriyordu;
  premium SaaS karakteri zayifti.
- Cozum: Dil/tasarim revizyonu yapildi. Varsayilan urun dili Turkce'ye cekildi (ADR-013); uc app'in
  tum gorunur metni Turkce'ye cevrildi ve `packages/i18n` tipli sozluk sisteminden okunur hale
  getirildi (ADR-014). `packages/ui` ve ekranlar premium, sade, kurumsal SaaS yonunde rafine edildi
  (canvas tuval, katmanli golge, rafine sidebar/topbar, UserChip, urunlesmis empty state'ler, nav
  ikonlari, storefront premium vitrin). Dark theme/neon/agir gradient eklenmedi.
- Hedef faz: Faz 1 (UI revizyonu)

## TD-014 Locale switcher / URL locale stratejisi yok

- Durum: OPEN
- Oncelik: MEDIUM
- Etki: `packages/i18n` tr/en sozluk parite ile hazir ancak runtime locale switcher, `/tr`-`/en`
  route prefix, tarayici dil tespiti, kullanici/mağaza locale tercihi ve DB locale alani yok.
  Su an uc app varsayilan olarak Turkce render eder.
- Cozum onerisi: Locale switcher, URL locale stratejisi ve kullanici/mağaza locale tercihini ileride
  ayri islerde eklemek; gerekirse storefront icin mağaza bazli locale cozumlemesi.
- Hedef faz: Faz 3+

## TD-017 admin-web BFF/internal-health operasyonel notlari

- Durum: OPEN
- Oncelik: MEDIUM
- Etki: (1) `/api/system/internal` dahili DB/Redis durumu yalnizca admin-web SUNUCU env'inde
  `INTERNAL_API_TOKEN` tanimliysa canli doner; tanimli degilse UI "dahili token gerektirir" durumunu
  gosterir. Compose'da bu env admin-web container'ina henuz verilmedi (frontend compose servisi de yok,
  bkz. TD-008), bu yuzden Faz 1C'de guvenli ops baglama planlanir. (2) BFF hata->kod esleme listesi
  (`packages/i18n` admin.errors) gateway hata kodlariyla elle senkron tutulur; gateway yeni kod
  eklerse UI'da genel UNKNOWN mesajina duser. (3) Oturum guard istemci tarafinda `/api/auth/me`
  ile yapilir; server-side render on-yuklemesi/middleware korumasi yoktur, bu yuzden korumali sayfa
  ilk frame'de kisa bir spinner gosterir.
- Cozum onerisi: Faz 1C'de internal health icin guvenli ops ekrani/secret dagitimini netlestirmek;
  gateway hata kodlarini paylasimli bir kaynaktan turetmek; gerekirse Next middleware ile sunucu
  tarafli oturum korumasi eklemek.
- Hedef faz: Faz 1C/Faz 2

## TD-018 admin-web canli smoke test verisi yerel DB'de kaliyor

- Durum: OPEN
- Oncelik: LOW
- Etki: Faz 1B runtime smoke'unda yerel dev DB'sine ornek `smoke-*` mağaza/paket kayitlari olusturuldu;
  delete endpoint'i kapsam disi oldugu icin temizlenmedi. Yalnizca yerel gelistirme verisini etkiler.
- Cozum onerisi: Delete/bulk action fazinda temizleme; veya gerekirse `pnpm db:seed` oncesi yerel DB
  reset akisini dokumante etmek.
- Hedef faz: Faz 2+
