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

- Durum: RESOLVED (UI accent polish + frontend Docker runtime gorevi)
- Oncelik: MEDIUM
- Etki: admin-web (3001), store-admin-web (3002) ve storefront-web (3000) artik compose ile ayaga
  kalkar; backend ile ayni paylasimli `node.Dockerfile` imajini kullanip `pnpm --filter <app> dev`
  ile calisir. Her servisin `/api/health` liveness'i compose healthcheck olarak kullanilir.
- Cozum: Uc frontend servisi `infra/docker/docker-compose.yml`'e eklendi. `API_GATEWAY_URL` compose
  icinde `http://api-gateway:4000` olarak override edilir; admin-web BFF gateway'e container network
  uzerinden erisir (smoke ile dogrulandi). `INTERNAL_API_TOKEN` yalnizca admin-web server env'inde
  (`env_file`) tutulur, client bundle'a girmez. store-admin/storefront henuz canli API'ye bagli
  degil; shell olarak kalkar (bkz. TD-010/TD-011). Karar: ADR-019.
- Kalan: Production-grade image (standalone build, non-root, healthcheck tuning), Nginx/SSL ve deploy
  pipeline kapsam disi — TODO-028 altinda takip edilir.

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

- Durum: PARTIAL
- Oncelik: HIGH
- Etki: Login endpointinde production-grade rate limit, lockout, cookie security ayarlari, CSRF
  stratejisi ve refresh token rotasyonu eksikleri vardi.
- Cozum onerisi: UI baglama ve production hardening fazinda Fastify rate limit, browser cookie
  stratejisi, secure/sameSite/httpOnly ayarlari ve brute-force izleme eklemek.
- Not: Faz 1B'de admin-web BFF, platform token'i httpOnly + sameSite=lax + (prod) secure cookie'ye
  yazar (ADR-017). Faz 1C'de gateway login icin IP/e-posta bazli proses ici rate limit, admin-web
  BFF mutation'lari icin double-submit CSRF, env kontrollu session/CSRF cookie adlari ve secure/sameSite
  ayarlari eklendi (ADR-018). Kalan borc: coklu instance production icin Redis/dagitik rate limit veya
  izleme, refresh token/rotasyon ve daha gelismis lockout politikasi.
- Hedef faz: Faz 2

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

- Durum: PARTIAL
- Oncelik: MEDIUM
- Etki: UI testleri `react-dom/server` ile render smoke testleri ve health route guard'lari ile
  sinirli; jsdom tabanli etkilesim/erisilebilirlik testleri yok.
- Cozum onerisi: Etkilesim gerektiren ekranlar gelistikce jsdom + Testing Library tabanli testler
  eklemek.
- Not: Faz 1B'de admin-web icin BFF/data-katmani testleri (adminApi fake-fetch ile login/me/logout,
  stores/plans list+create, hata->kod, NETWORK), hata-kodu->Turkce mesaj esleme testi, login SSR
  smoke ve i18n copy/parity testleri eklendi. Gercek DOM etkilesimi (form submit, modal acma, satir
  aksiyonu, erisilebilirlik) hala jsdom + Testing Library bekliyor.
- Not: Faz 1C'de admin-web icin Testing Library/jsdom eklendi; login validation + hatali giris,
  stores/plans create modal happy path ve logout flow mock testleri kapsandi. Kalan borc: update
  modal, system health render ve daha genis erisilebilirlik kontrolleri.
- Not: Faz 2B'de store-admin-web icin jsdom + Testing Library etkilesim testleri eklendi (dashboard
  live + invalid-nesting regression, categories/products/variant create form, inventory adjust,
  duplicate/negatif stok Turkce hata esleme). Kalan borc: edit-modal genis kapsami, erisilebilirlik
  (focus trap/odak yonetimi) ve gercek E2E (Playwright) hala acik.
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

- Durum: PARTIAL
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
- Not: Faz 1C'de `/api/system/internal` token yokken `available:false`, token varken timeout kontrollu
  server-side proxy davranisini testlerle sabitledi. `(app)` route group server tarafinda session
  cookie varligini kontrol eder; asil dogrulama BFF `/api/auth/me` ile devam eder. Kalan borc: frontend
  compose servisine secret dagitimi ve hata kodu kaynagini paylasimli hale getirmek.
- Hedef faz: Faz 2

## TD-018 admin-web canli smoke test verisi yerel DB'de kaliyor

- Durum: RESOLVED
- Oncelik: LOW
- Etki: Faz 1B runtime smoke'unda yerel dev DB'sine ornek `smoke-*` mağaza/paket kayitlari olusturuldu;
  delete endpoint'i kapsam disi oldugu icin temizlenmedi. Yalnizca yerel gelistirme verisini etkiler.
- Cozum: Faz 1C'de delete endpoint eklenmeden `pnpm db:cleanup-smoke` script'i eklendi. Script yalnizca
  `smoke-`, `rev-`, `test-` prefiksli store slug/name ve plan code/name kayitlarini siler; APP_ENV
  production/staging ise calismayi reddeder. Seed demo kayitlari hedeflenmez.
- Hedef faz: Faz 1C

## TD-019 Store-user auth ve store-admin catalog guard eksik

- Durum: OPEN
- Oncelik: HIGH
- Etki: Faz 2A catalog/inventory endpointleri platform admin bearer token + explicit `storeId` ile
  korunur. `packages/auth` icindeki `requireStoreAccess` foundation'i hazir olsa da store-user
  session/token tipi, granular store role permission matrisi ve store-admin UI token akisi henuz yok.
- Cozum onerisi: Faz 2B'de store-admin-web baglanirken store-user auth akisini veya platform admin
  store context secimini netlestirmek; catalog/inventory endpointlerinde `requireStoreAccess` ve
  role guard'larini gercek context ile zorunlu kilmak.
- Faz 2B notu: store-admin-web canli baglandi ancak store-user auth HALA EKSIK. Gecici cozum olarak
  store-admin-web platform admin login'i BFF uzerinden kullanir ve hedef mağazayi server-side cozer
  (ADR-023). Bu OPEN borc: (1) store-user session/token tipi, (2) granular store role permission
  matrisi, (3) login proxy'nin gercek store-user akisina tasinmasi, (4) server-side store context
  seciminin store-user erisim listesine baglanmasi ve cok-mağazali secici, (5) catalog/inventory
  endpointlerinde `requireStoreAccess`/role guard'in gercek context ile zorunlu kilinmasi.
- Hedef faz: Faz 2C / store-user auth fazi

## TD-020 Catalog model eksikleri: media, options, metafields, import/export

- Durum: OPEN
- Oncelik: MEDIUM
- Etki: Faz 2A bilerek minimum katalog modeli kurdu. Product image/media upload, zengin option modeli,
  metafields, collections/tags ve bulk import/export yok. `ProductVariant.optionValues` JSON ile
  baslangic esnekligi saglar ancak tam option matrix kurali degildir.
- Cozum onerisi: Store-admin UI ve marketplace/import ihtiyaci netlestikce media, options ve import/
  export alanlarini ayri migration + contract + test fazlarinda eklemek.
- Hedef faz: Faz 2B, Faz 6

## TD-021 Order/reservation core henuz yok

- Durum: RESOLVED
- Oncelik: HIGH
- Etki: Inventory `quantityReserved` alanina sahip ama Faz 2A'da order/checkout yoktu; rezervasyon
  hareketleri yazilmiyordu.
- Cozum: Faz 2C'de Customer/Address, Order/OrderLine/OrderAddress/OrderEvent,
  InventoryReservation ve OrderNumberCounter modelleri eklendi. `POST /place` transaction icinde
  `SELECT ... FOR UPDATE` ile inventory satirini kilitler, oversell'i `ORDER_INSUFFICIENT_STOCK`
  ile engeller, `quantityReserved` artirir ve `SALE_RESERVATION` movement yazar. `POST /cancel`
  aktif rezervasyonlari idempotent release eder, `quantityReserved` dusurur ve `SALE_RELEASE` yazar.
- Kalan not: Fulfillment fazinda `CONSUMED` rezervasyon akisi ve onHand dusumu ayrica eklenecek.
- Hedef faz: Faz 2C

## TD-022 Storefront catalog resolver yok

- Durum: OPEN
- Oncelik: MEDIUM
- Etki: Product/category modelleri ve store-scoped API hazir olsa da public storefront resolver,
  domain/slug -> store cozumleme ve public catalog read modeli yok. Storefront-web demo/placeholder
  kalir.
- Cozum onerisi: Faz 3'te domain/slug resolver, public catalog query contract'i, cache stratejisi ve
  storefront UI veri baglamasini eklemek.
- Hedef faz: Faz 3

## TD-023 F2A smoke catalog temizligi

- Durum: RESOLVED
- Oncelik: LOW
- Etki: F2A canli API smoke'u yerel DB'de `f2a-smoke-*` category/product/variant/inventory/movement
  kayitlari birakabilir. Delete endpointleri kapsam disi oldugu icin temizlik script seviyesinde
  yapilmaliydi.
- Cozum: `pnpm db:cleanup-smoke` script'i production/staging guard'ini koruyarak `f2a-smoke-`
  prefix'li product/category/variant kayitlarini da temizleyecek sekilde genisletildi. Variant/product
  cascade ile inventory ve movement kayitlari da temizlenir; seed demo verisi hedeflenmez.
- Hedef faz: Faz 2A final review

## TD-024 Store-admin dashboard pagination-aware aggregation eksik

- Durum: OPEN
- Oncelik: LOW
- Etki: `apps/store-admin-web` dashboard ozeti (`/api/dashboard/summary`) toplam urun/kategori/stok
  sayilarini gateway pagination `total`'inden kesin alir; ancak "aktif urun" ve "kritik stok" sayilari
  yalnizca ilk sayfa (gateway varsayilan limit 50) uzerinden hesaplanir. Demo veri seti icin dogru,
  ama 50'den fazla urun/varyantta bu iki sayi eksik kalir. api-client list helper'lari su an
  limit/offset query'si gondermiyor.
- Cozum onerisi: Ya gateway'e hafif sayim/aggregate ucu eklemek, ya api-client list helper'larina
  limit/offset/filter ekleyip dashboard'da sayfalama ile toplamak, ya da aktif/kritik sayimlari
  dogrudan dondurmek. Faz 2B kapsaminda backend davranisi degistirilmedigi icin ertelendi.
- Hedef faz: Faz 2C+

## TD-025 Payment, shipping, fulfillment, cart ve notification eksik

- Durum: OPEN
- Oncelik: HIGH
- Etki: Faz 2C order/reservation backend cekirdegi payment provider, cart/checkout session, shipment,
  invoice, refund/return ve email notification olmadan calisir. `paymentStatus`/`fulfillmentStatus`
  enumlari hazirdir ancak harici provider veya fulfillment state machine yoktur.
- Cozum onerisi: Faz 3/Faz 4'te storefront resolver + cart/checkout; Faz 4'te payment abstraction;
  Faz 5'te fulfillment/shipping/invoice; notification ve refund/return ayri slice olarak eklenmeli.
- Hedef faz: Faz 3, Faz 4, Faz 5

## TD-026 Reservation concurrency kalan riskler

- Durum: OPEN
- Oncelik: MEDIUM
- Etki: F2C place/cancel akislari PostgreSQL row-level lock ile oversell'i engeller. Ancak expired
  reservation job'u, multi-warehouse stok, uzun sureli checkout hold, consumed reservation ve retry/
  dead-letter stratejileri henuz yoktur.
- Cozum onerisi: Queue tabanli expiration/release job'u, fulfillment consume akisi ve ileride warehouse
  bazli stok modeli eklenirken ayni lock stratejisi yeniden degerlendirilmeli.
- Hedef faz: Faz 4+

## TD-027 Storefront CTA render ve sales-model request modelleri eksik

- Durum: OPEN (store-admin UI kismi F2F'de kapandi)
- Oncelik: MEDIUM
- Etki: Faz 2F ile store-admin urun listesi ve create/update formu sales model alanlarina baglandi
  (rozetler, "Satis davranisi" bolumu, dinamik default, client validasyon, lokalize guard hatalari).
  Kalan eksikler: public storefront sales model'e gore CTA render etmez (Faz 3); `INQUIRY` ve
  `APPOINTMENT` icin gercek talep/randevu kayit modelleri yoktur; `WHATSAPP` aksiyonu icin store-level
  public contact/telefon config'i ve redirect davranisi yoktur. Store-admin yalnizca catalog API
  alanlarini yonetir; herhangi bir inquiry/appointment kaydi yaratmaz.
- Cozum onerisi: Faz 3'te Storefront CTA behavior; ayrica Product inquiry request model, Appointment
  request model ve WhatsApp redirect/store contact config islerini ayri backend/UI slice'lari olarak
  eklemek (TODO-040/041/042/043).
- Hedef faz: Faz 3+

## TD-028 Runtime locale: kullanici tercihi, URL prefix ve dil tespiti eksik

- Durum: OPEN
- Oncelik: LOW
- Etki: Faz 2E TR/EN runtime switch'i `commerce_os_locale` cookie ile cozer (bkz. ADR-026). Tercih
  oturum/cihaz duzeyindedir; kullanici-bazli (DB) kalici locale tercihi yoktur — store-user auth
  (TD-019) gelmeden guvenilir kullanici kimligi ve store-scoped tercih modeli kurulamaz. URL locale
  prefix (`/tr`-`/en`) ve public i18n routing yoktur; bu nedenle public storefront icin locale'e
  ozel canonical/SEO ve paylasilabilir dil-bazli URL yoktur. Tarayici dil tespiti (Accept-Language)
  yoktur; ilk ziyaret her zaman varsayilan TR'dir.
- Cozum onerisi: TODO-044 (user/DB locale preference) ve TODO-045 (URL locale prefix / public i18n
  routing). Mevcut cookie stratejisi bu katmanlarin uzerine genisletilebilir; cozumleme onceligi
  (URL > user > cookie > default) eklenirken yeniden degerlendirilmeli.
- Hedef faz: Faz 3+ (public storefront ve store-user auth ile birlikte)

## TD-029 Store-admin orders UI sinirli (F2G)

- Durum: OPEN
- Oncelik: MEDIUM
- Etki: Faz 2G `/orders` ekranini F2C order/reservation core'a baglar ama bilincli olarak dar
  kapsamlidir. (1) Sipariş listesinde arama/filtre ve pagination UI yoktur; liste tek sayfa olarak
  gelir (backend pagination mevcut). (2) Yasam dongusu yalniz place/cancel'dir; payment, shipping/
  fulfillment, invoice/refund/return UI yoktur — `paymentStatus`/`fulfillmentStatus` rozet olarak
  gosterilir ama UI'dan degistirilemez (gercek payment/shipping akisi yoktur). (3) Taslak sipariş
  olusturma minimaldir: stoktaki varyant + adet + musteri e-postasi; customerId secimi, adres girisi
  ve placed-order satir duzenleme yoktur. (4) Store context hala server-side platform-admin token
  deseniyle cozulur (store-user auth TD-019 bekler).
- Cozum onerisi: TODO-047 (storefront checkout/cart), TODO-048 (payment/shipping/fulfillment UI +
  arama/filtre/pagination), TODO-049 (gelismis draft order creation UI) ve TD-019 (store-user auth).
- Hedef faz: Faz 3+ / Faz 4

## TD-030 Canli order smoke artiklari cleanup-smoke ile eslesmiyor

- Durum: OPEN
- Oncelik: LOW
- Etki: F2G canli BFF smoke'u store-admin-web uzerinden gercek bir order olusturup place/cancel eder.
  cleanup-smoke yalniz `smoke-`/`rev-`/`test-`/`f2a-smoke-`/`f2d-smoke-`/`f2f-smoke-` prefix'leriyle
  baslayan orderNumber/customerEmail/cancelReason kayitlarini siler. F2G smoke'unda kullanilan
  `smoke@example.local` / `F2G smoke cleanup` bu prefix'lere uymadigi icin tek bir CANCELLED order
  (OS-000009) dev DB'de kaldi. Rezervasyonlari RELEASED oldugundan stok/seed etkisi yoktur ve
  verify-seed gecer.
- Cozum onerisi: Gelecek canli order smoke'larinda `smoke-` prefix'li customerEmail/cancelReason
  kullanmak, veya cleanup-smoke'a F2G icin `f2g-smoke-` prefix'i eklemek; mevcut artik tek kayit
  manuel silinebilir.
- Hedef faz: Faz 2G takip

## TD-031 admin-web store/plan detay ekranlari hala modal (ADR-027 disinda)

- Durum: OPEN
- Oncelik: MEDIUM
- Etki: ADR-027 (entity detail = dedicated route/page) F2H'de store-admin orders/products icin
  uygulandi; ancak `apps/admin-web` stores ve plans ekranlari hala create/edit modali kullaniyor.
  Bu ekranlar su an kisa edit formu (detay timeline/audit icermiyor) oldugundan kural ihlali
  sinir durumunda, fakat Store/Plan birer ana entity'dir ve detaylari buyudukce (audit, kullanim,
  fatura/abonelik, store kullanicilari) route/page olmalidir.
- Cozum onerisi: `/stores/[id]` ve `/plans/[id]` dedicated detail/edit route'lari; kisa create
  modali kalabilir. Mevcut edit modallari detail page'e tasinir.
- Hedef faz: admin-web ileri turu (bkz. TODO-053, TODO-054)

## TD-032 Storefront public katalog read'i platform-admin token ile (gecici)

- Durum: RESOLVED (F3A.1 / TODO-061) — **PROD BLOCKER KALDIRILDI**
- Oncelik: HIGH
- Etki: F3A'da public storefront canli katalog verisine baglandi, ancak gateway'de auth gerektirmeyen
  bir public-read katalog ucu YOKTU; tum `/stores/:storeId/*` katalog uclari `requireStorePlatformAdmin`
  (platform-admin session) isterdi. Bu nedenle vitrin, gecici olarak sunucu-tarafinda platform-admin
  kimligiyle (`STOREFRONT_PLATFORM_EMAIL/PASSWORD`, seed admin'e duserdi) oturum acip token'i sunucu
  belleginde tutardi. Token sizmasa da public bir uygulamanin yuksek-yetkili bir kimlik tasimasi asiri
  yetkiydi ve prod blocker'di.
- Cozum (F3A.1 / TODO-061): Gateway'de auth gerektirmeyen, store-scoped, yalniz-okuma, yalniz ACTIVE
  store + ACTIVE urun/varyant donen public katalog uclari eklendi:
  `GET /public/stores/:storeSlug/products` ve `GET /public/stores/:storeSlug/products/:productSlug`.
  Govde, `packages/contracts` icindeki `publicProduct*` ALLOWLIST semalariyla serialize edilir; ic/
  yonetim alanlari (storeId, status, type, vendor, seo*, audit zaman damgalari, categoryIds...) disari
  cikmaz. Fiyat gizliligi (HIDDEN/ON_REQUEST) durumunda numerik fiyat gateway'de null'lanir; sayisal
  fiyat public govdeye girmez. Store inactive/yok -> guvenli 404; cross-store sizinti yok.
  Vitrin (`apps/storefront-web/lib/server/catalog.ts`) artik bu uclari TOKEN'SIZ cagirir; gecici
  platform-admin login/token resolver (`lib/server/api-token.ts`) ve kimlik bilgileri (env) tamamen
  KALDIRILDI. Docker smoke ile dogrulandi: vitrin trafigi yalnizca `/public/*`'a gider; HTML/`.next/
  static` bundle'da token/Bearer/createApiClient/platformLogin/credential YOK.
- Karar kaydi: ADR-030. Bkz. TODO-061 (DONE).
- Hedef faz: Faz 3 (F3A.1)

## TD-033 Public checkout atomicligi + anonim rezervasyon yasam dongusu

- Durum: OPEN
- Oncelik: MEDIUM
- Etki: F3B.1 public checkout, mevcut F2C cekirdegini kompoze eder: `createOrder` (DRAFT) ve
  `placeOrder` (stok `FOR UPDATE` ile rezervasyon) AYRI iki transaction'dir. (1) `createOrder` ile
  `placeOrder` arasinda kucuk bir yaris penceresi vardir (placeOrder stok'u yine de FOR UPDATE ile
  yeniden dogrular, asiri-satis olmaz; en kotu durum INSUFFICIENT_STOCK ile 409). (2) `placeOrder`
  basarisiz olursa olusturulan DRAFT siparis kalir (yetim draft); su an temizlenmez. (3) Anonim
  checkout'ta odeme alinmadan stok PLACED ile rezerve edilir; terk edilen siparisler icin rezervasyon
  expiry/iptal mekanizmasi yoktur (stok suresiz rezerve kalabilir).
- Cozum onerisi: (a) Tek transaction'da create+place yapan bir public-checkout data-access metodu;
  (b) basarisiz place'te DRAFT'i otomatik iptal/temizleme; (c) worker'da rezervasyon expiry + abandoned
  DRAFT/PLACED-UNPAID temizlik job'i. F3B.2 odeme adimi geldiginde stok rezervasyonunu odeme
  authorize'a baglamak (rezerv-on-auth) bu borcu buyuk olcude kapatir.
- Karar kaydi: ADR-031. Bkz. TODO-064, TODO-065.
- Hedef faz: Faz 3B.2
