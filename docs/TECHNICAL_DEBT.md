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
- Ilerleme (2026-07-13): Kategoriye-bagli dinamik attribute calismasi baslatildi. **Faz 1A (ADR-067,
  TODO-143)** ana kategori temelini (`Product.primaryCategoryId`) kurdu — attribute tablolari HENUZ YOK
  (Faz 1B+). Bu, "zengin option/metafield" boslugunun ilk adimidir; tam attribute modeli (AttributeDefinition/
  CategoryAttribute/tiplenmis EAV degerleri) ayri fazlarda gelecek.

## TD-039 Ana kategori (`primaryCategoryId`) ileride NOT NULL degerlendirmesi (Faz 1A follow-up)

- Durum: OPEN
- Oncelik: LOW
- Etki: Faz 1A (ADR-067) `primaryCategoryId`'yi bilincli **nullable** ekledi; legacy/kategorisiz urunler ve
  cok-kategorili backfill'in ticari dogrulanmamis satirlari null/deterministik kalir. Attribute zorunlulugu
  ana kategoriye baglandiginda (Faz 2+), kategorili urunlerde ana kategorinin garanti edilmesi istenebilir.
- Cozum onerisi: Veri temizligi (`db:audit-primary-category` review + cok-kategorili urunlerin manuel
  onayi) sonrasi, "kategorisi olan urunde primary zorunlu" kurali icin AYRI migration + backfill tamamlama.
  DB `NOT NULL` yerine once uygulama-katmani zorunlulugu (kategorili urunde) tercih edilebilir; tam DB
  constraint en son adim.
- Hedef faz: Faz 2+ (attribute zorunlulugu netlestikten sonra)

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

## TD-034 Payment provider canli adaptorleri + gercek webhook imza dogrulamasi yok

- Durum: OPEN
- Oncelik: MEDIUM
- Etki: F3B.2 provider-ready operasyon altyapisini kurar ancak CANLI tahsilat yapmaz. IYZICO/STRIPE/
  PAYTR/GENERIC_REDIRECT icin provider-specific adapter iskeleti (request/response/status mapping +
  credential validation + webhook event-id/status mapping) HAZIR; ancak gercek sandbox/live HTTP
  `PAYMENT_SANDBOX_HTTP_ENABLED` ile gate'li ve bu fazda KAPALI (canli cagri yapilmaz). Webhook shell
  imzayi placeholder olarak kabul eder. Gercek odeme icin saglayici sozlesmesi + flag aktivasyonu +
  kanit + gercek imza dogrulama gerekir.
- Cozum onerisi: Saglayici sozlesmesi sonrasi her provider icin canli/sandbox adaptor (TODO-066..069):
  `createPayment/confirmPayment/cancelPayment/refundPayment/getPaymentStatus/handleWebhook` gercek HTTP;
  provider basina webhook imza dogrulamasi (raw-body + HMAC/signature, TODO-071); refund/dispute/
  settlement is akislari + `/payments` operations ekrani (TODO-070).
- Hedef faz: F3B.3+ (saglayici sozlesmesine bagli)
- Bagli: ADR-033, TODO-066..071, Faz 3B.2 phase log.

## TODO-127 — Provider logo dosya upload/asset storage (TODO-125'ten ayrıldı)
- Sorun: `ShippingProviderConfig.logoUrl` manuel public URL (admin elle girer). Checkout/success/admin'de
  logo gösterimi TODO-125 ile devrede ama logo KAYNAĞI dış bağımlılık (kırık URL riski, marka/CDN kontrolü yok).
- Çözüm önerisi: dosya upload + asset storage / media library; `logoStorageKey` ile object-store entegrasyonu;
  `logoAlt` korunur. Doğrulama (boyut/format) + güvenli serve.
- Bağlı: ADR-047, TODO-125.

## TODO-125 ek — Checkout kargo seçeneği: küçük borçlar
- Misafir (oturumsuz) sepet sayfasında adres bilinmediği için seçenekler FİYATSIZ listelenir (taşıyıcı görünür,
  `available=false`); kesin fiyat checkout adresinde hesaplanır. İleride sepet için hızlı il/ilçe seçimiyle
  önizleme fiyatı verilebilir (zoneCode city→zone çözümlemesi TODO ile birlikte).
- `ShippingRatePlan.deliveryEstimate` serbest-metin (i18n değil); çok-dilli ETA gerekirse yapılandırılmalı.
- Seçim değişiminde toplam sunucu revalidate ile güncellenir (tam sayfa yeniden çözümleme); büyük sepetlerde
  istemci-tarafı anlık toplam hesabı + arka planda doğrulama daha akıcı olabilir.
- Bağlı: ADR-047, TODO-125.

## TD-035 DHL sandbox calculate hesap kısıtı + token expiry sabit cache
- Tarih: 2026-07-03 (F3C.6, TODO-131)
- Sorun 1: Sandbox test müşteri hesabında şube ataması olmadığından Standard Query `calculate` mutlu yolu
  doğrulanamıyor (HTTP 500 code 20001 "<WERR>[] NOLU ŞUBENİN İLİ BULUNAMADI"; string kod düzeltmesi sonrası
  binder geçiyor, domain katmanında takılıyor). ADR-044 gereği calculate checkout fiyatında kullanılmadığından
  etki düşük; ancak canlı geçiş öncesi DHL/MNG'den hesap şube ataması istenip mutlu yol bir kez doğrulanmalı.
- Sorun 2: Identity JWT cache'i sabit 5 dk; yanıttaki `jwtExpireDate` (dd.MM.yyyy HH:mm:ss — sandbox'ta ~saatler)
  parse edilip kullanılmıyor → gereksiz token istekleri. Refresh-token akışı da tanımsız (TODO-103).
- Çözüm: canlı rollout checklist'e (TODO-118) hesap doğrulaması ekle; token cache'i `jwtExpireDate` tabanlı yap
  (parseProviderDate artık bu formatı çözüyor) + TODO-103 refresh akışı.
- Kapsam: apps/api-gateway/src/shipping/adapters/dhl-ecommerce. Bloklayıcı: sandbox için HAYIR, canlı için kısmi.

## TD-037 Faz 1B attribute katalog: bilinen sınırlar (kapsam gereği)
- Tarih: 2026-07-14 (Faz 1B, TODO-144, ADR-067)
- Sorun 1 (PLATFORM UI yok): Bu fazda PLATFORM attribute tanımları yalnız gateway (`/admin/attributes`,
  `requireSuperAdmin`) + api-client (`admin.platformAttributes`) düzeyinde vardır; adanmış bir SUPER_ADMIN
  yönetim ekranı (admin-web) EKLENMEDİ. Store admin ekranı PLATFORM tanımlarını salt-okunur gösterir ve
  kategoriye bağlayabilir, ancak OLUŞTURAMAZ. Etki: düşük (backend + kabul kriterleri karşılanıyor); platform
  attribute'ları geçici olarak API/seed ile üretilebilir. Faz 2'de admin-web ekranı planlanmalı.
- Sorun 2 (validationRules tüketilmiyor): `CategoryAttribute.validationRules` (Json) SAKLANIR ama henüz hiçbir
  yerde ZORLANMAZ — kural motoru + ürün attribute değer doğrulaması Faz 2 kapsamıdır. Şimdilik istemci `{}` gönderir.
- Sorun 3 (pagination yok): Attribute/grup/seçenek listeleri mütevazı kardinalite varsayımıyla PAGINATION'SIZ
  döner (hero deseni). Bir mağaza yüzlerce attribute tanımlarsa liste uçlarına sayfalama gerekebilir.
- Sorun 4 (runtime smoke bekliyor): Faz 1A ile aynı desen — merge sonrası HEDEF DB `prisma migrate deploy`
  (reset YOK) + docker rebuild (api-gateway + store-admin-web) + prod-benzeri canlı smoke henüz yapılmadı
  (izole shadow-DB migration diff = empty ile şema/migration uyumu doğrulandı; gerçek stack smoke'u ayrı adım).
- Kapsam: packages/db, packages/contracts, apps/api-gateway/src/attributes, apps/store-admin-web. Bloklayıcı: HAYIR.

## TD-038 Faz 2A attribute değer katmanı: bilinen sınırlar (kapsam gereği)
- Tarih: 2026-07-14 (Faz 2A, TODO-145, ADR-068)
- Sorun 1 (ürün + attribute değer yazımı atomik DEĞİL): Product/Variant satırı bir `$transaction`'da, attribute
  değerleri ise ayrı bir `attributeValueService.persist*` `$transaction`'ında yazılır (modüler prisma-per-module
  deseni; server.ts `AppDataAccess` transaction'ına iplik geçirilmedi). Değerler create/update'ten ÖNCE
  `prepare*` ile doğrulandığından persist adımı yalnız beklenmedik DB hatasında (nadir) başarısız olur; o durumda
  ürün oluşur ama değerler yazılmaz. Etki: düşük (foundation, UI yok). Faz 2B'de gerekiyorsa ortak transaction'a taşınır.
- Sorun 2 (validationRules hâlâ tüketilmiyor): `CategoryAttribute.validationRules` (Json; min/max/regex vb.) SAKLANIR
  ama attributeValueService bu fazda ZORLAMAZ — yalnız tip/tenant/option/required/variantDefining doğrular. Kural motoru
  (validationRules yorumlama) Faz 2B kapsamındadır. TD-037 Sorun 2'nin devamı.
- Sorun 3 (dinamik ürün formu / okuma tüketimi yok): Değerler yalnız gömülü create-update + dedike internal uçlardan
  yazılır/okunur; ürün formu, PDP tablosu, faceted search DEĞİŞMEDİ (dual-read hazırlığı yapıldı, tüketim Faz 2B).
- Sorun 4 (valueDecimal JS number): `productAttributeValueInputSchema.valueDecimal` `z.number()`tır (JS double);
  DB `Decimal(20,6)`. Aşırı hassas ondalıklar için ileride string girdi düşünülebilir; foundation'da number yeterli.
- Sorun 5 (runtime smoke bekliyor): izole shadow-DB `migrate diff = "No difference"` + izole canlı DB CHECK/FK smoke
  YAPILDI; ancak merge sonrası HEDEF DB `prisma migrate deploy` (reset YOK) + docker rebuild + prod-benzeri stack smoke
  ayrı adım (Faz 1A/1B deseni).
- Kapsam: packages/db, packages/contracts, packages/api-client, apps/api-gateway/src/attribute-values,
  apps/api-gateway/src/media. Bloklayıcı: HAYIR.
- **Güncelleme (Faz 2B, TODO-146):** Sorun 2 KISMEN çözüldü — `validationRules` (min/max/minLength/maxLength/pattern/
  step/placeholder/helperText) artık dinamik ürün formunda CLIENT-SIDE zorlanır. Backend'te (attributeValueService)
  hâlâ zorlanmaz (nihai otorite yalnız tip/tenant/option/required); server-side kural motoru açık kalır. Sorun 3
  çözüldü (dinamik form + okuma tüketimi Faz 2B'de eklendi).

## TD-039 Faz 2B dinamik ürün formu: bilinen sınırlar (kapsam gereği)
- Tarih: 2026-07-17 (Faz 2B, TODO-146, ADR-069)
- Sorun 1 (RICH_TEXT düz textarea): RICH_TEXT dataType zengin metin editörü yerine düz `<textarea>` ile render edilir.
  Değer yine `valueText`'e yazılır; WYSIWYG/markdown editörü ileride. Etki: düşük.
- Sorun 2 (FILE = görsel yükleyici): FILE dataType, IMAGE ile aynı `MediaUpload` (single) bileşenini yeniden kullanır;
  MediaUpload görsel-odaklıdır (jpeg/png/webp allowlist + webp normalize). Gerçek dosya (PDF vb.) attribute'ları için
  ayrı yükleyici gerekebilir. Etki: düşük (FILE attribute'ları nadir).
- Sorun 3 (validationRules backend'te zorlanmıyor): Kurallar client-side uygulanır; kötü niyetli/doğrudan-API çağrısı
  bunları atlayabilir. Server-side kural motoru TD-038 Sorun 2'nin kalanı olarak açık.
- Sorun 4 (server hata → alan eşlemesi yalnız gömülü akış): `attributeDefinitionId` gömülü create/update hatasında
  `details`'e konur; ancak client-side doğrulama çoğu vakayı submit öncesi yakaladığından bu yol nadiren tetiklenir.
  Alan-seviyesi olmayan attribute hataları genel Alert'e düşer.
- Sorun 5 (IMAGE/FILE düzenleme URL çözümü): Mevcut mediaId'nin önizleme URL'si `listMedia()` ile (modül cache'li)
  çözülür; büyük medya kütüphanelerinde bir defalık ek fetch. Etki: düşük.
- Sorun 6 (runtime smoke bekliyor): typecheck + lint + 255/255 test + `next build` YAPILDI; docker rebuild +
  prod-benzeri auth'lu tarayıcı smoke (canlı attribute'lu ürün oluştur/düzenle round-trip) ayrı adım.
- Kapsam: apps/store-admin-web (product form + attributes/*), apps/api-gateway/src/server.ts (hata detayı),
  packages/api-client (type re-export), packages/i18n. Bloklayıcı: HAYIR.

## TD-040 storefront `checkout-form-render` fixture bayat (ÖNCEDEN mevcut; Faz 2B'de yüzeye çıktı)
- Durum: RESOLVED (2026-07-19, TD-052)
- Tarih: 2026-07-17 (gözlem; Faz 2B, TODO-146)
- Sorun: `apps/storefront-web/test/checkout-form-render.test.tsx`'teki sahte `CartLineView` nesnesi güncel tipin
  `imageUrl / selected / compareAtLabel / discountedUnitPriceLabel / discountedLineTotalLabel` alanlarını sağlamıyor →
  `tsc --noEmit` TS2739 verir. Bu alanlar önceki fazlarda (sepet kampanya indirimi + thumbnail) `CartLineView`'e
  eklenmiş ama fixture güncellenmemiş. Faz 2A TODO entry'sinde de "ÖNCEDEN mevcut" olarak not edildi. Faz 2B'de
  contracts/api-client dist rebuild'i yerelde bayat dist'i tazelediği için hata görünür oldu.
- Neden (o zaman) düzeltilmedi: storefront/checkout TODO-146'nın "Kesinlikle Yapılmayacak" listesindeydi; ürün kodu
  değil test fixture'ıdır ve CI'da tsc gate'i yoktur (`next build` test dosyalarını dışlar → build kırılmaz). Faz 2B
  işiyle ilişkisiz.
- Çözüm: TD-052 kapsamında fixture'a eksik 5 gösterim alanı eklendi (davranış-nötr: `imageUrl: null`, `selected: true`,
  `compareAtLabel: null`, `discountedUnitPriceLabel: null`, `discountedLineTotalLabel: null` → indirim yok, render
  çıktısı değişmedi). Ürün koduna, `CartLineView` tipine veya test assertion'larına dokunulmadı. Doğrulama: `tsc
  --noEmit` TS2739 = 0 (storefront-web genelinde 0 hata), ilgili vitest 6/6 yeşil, `next build` yeşil. Kapsam:
  apps/storefront-web/test/checkout-form-render.test.tsx. Bloklayıcı: HAYIR.

## TD-041 Faz 2C-1 varyant motoru temeli: bilinen sınırlar (kapsam gereği)
- Tarih: 2026-07-17 (Faz 2C-1, TODO-147, ADR-070)
- Sorun 1 (ürün + varyant seçim yazımı atomik DEĞİL): TD-038 Sorun 1 ile aynı desen — Product satırı bir `$transaction`'da,
  varyant eksen seçimi ise ayrı `variantSelectionService.persistSelections` `$transaction`'ında yazılır. Create/update'ten
  ÖNCE `prepareSelections` ile doğrulandığından persist yalnız beklenmedik DB hatasında (nadir) başarısız olur. Etki: düşük.
- Sorun 2 (kategori-attribute uçları iki tüketici tarafından çift çekilir): `useCategoryAttributes` (ürün-seviyesi) +
  `useVariantAttributes` (varyant) aynı `listCategoryAttributes` + `listAttributes` uçlarını kategori başına AYRI çeker
  (her biri kendi içinde memoize eder → yeniden seçimde tekrar YOK, ama iki hook toplam 2 istek atar). Hafif admin-read
  ikiye katlanması; ileride tek paylaşımlı fetch'e birleştirilebilir. Etki: düşük.
- Sorun 3 (yalnız option-tabanlı eksen): Bu ekran yalnız SELECT/COLOR variantDefining attribute'ları eksen olarak kabul eder
  (varyant ekseni tek-seçimli option olmalı — VariantAttributeValue tek option taşır). Serbest-metin varyant eksenleri (ör.
  gravür) kapsam dışı; ihtiyaç olursa kombinasyon-girişi adımında ele alınır. Bilinçli kapsam kararı (ADR-070 md.2).
- Sorun 4 (KOMBINASYON YOK — foundation): Bu faz yalnız "eksenler + option'lar" reçetesini saklar. `ProductVariant` üretimi,
  Cartesian, `combinationKey`, SKU matris, bulk edit, varyant görselleri, storefront/search/inventory/order snapshot Faz 2C-2+
  Combination Engine'e aittir. Seçim tabloları (ProductVariantAttribute/OptionSelection) o motorun GİRDİSİDİR.
- Sorun 5 (runtime smoke bekliyor): `migrate diff --from-empty` ile index/FK adları doğrulandı + tüm gate yeşil (269/767/23/
  101/16 test + `next build`); ancak merge sonrası HEDEF DB `prisma migrate deploy` + docker rebuild + prod-benzeri auth'lu
  tarayıcı smoke (canlı variantDefining attribute + eksen/option seçimi round-trip) ayrı adım.
- Kapsam: packages/db, packages/contracts, packages/api-client, apps/api-gateway/src/variant-selections,
  apps/store-admin-web (product form + variant-attributes/*), packages/i18n. Bloklayıcı: HAYIR.

## TD-042 Faz 2C-2 Combination Engine: bilinen sınırlar (kapsam gereği)
- Tarih: 2026-07-17 (Faz 2C-2, TODO-148, ADR-071)
- Sorun 1 (KOMBINASYON YAZIMI YOK — preview-first): Bu faz yalnız oluşacak kombinasyonların ÖNİZLEMESİNİ hesaplar. `combinationKey`
  üretilir ama **DB'ye yazılmaz**; `ProductVariant`, SKU, barcode, price, inventory, bulk edit, varyant görselleri, storefront/search/
  marketplace, order snapshot Faz 2C-3+'ye aittir. Bilinçli kapsam kararı (ADR-071 md.1/md.8). Etki: yok (tasarım).
- Sorun 2 (önizleme yalnız KALICI seçimi yansıtır): Önizleme sunucu-otoriter olduğundan store-admin paneli KAYDEDİLMİŞ eksen
  reçetesini gösterir; kaydedilmemiş form değişiklikleri kaydetmeden görünmez (kaydetme sonrası `refreshToken` ile yeniden çekilir).
  İstenirse ileride motorun bir client-port'u ile "canlı" önizleme eklenebilir (aynı saf algoritma). Etki: düşük (UX tercihi).
- Sorun 3 (`previewId` cyrb53, kriptografik DEĞİL): `previewId` geçici bir UI kimliğidir (React key/snapshot). Çarpışma olasılığı
  ~1000 kombinasyonda ihmal edilebilir; kalıcı benzersizlik `combinationKey`'dedir (ID-tabanlı, çakışmasız). Kalıcı kimlik gerekirse
  Faz 2C-3 `combinationKey`'i DB unique kısıtıyla kullanır. Etki: yok.
- Sorun 4 (guard global sabit, ürün-bazlı DEĞİL): `MAX_PREVIEW_COMBINATIONS` mağaza/ürün-bazlı değil global config'tir. Çok büyük
  katalog ihtiyacında ürün/plan-bazlı limit ileride eklenebilir. Etki: düşük.
- Sorun 5 (runtime smoke bekliyor): Tüm gate yeşil (api-gateway 802, store-admin 269, contracts 101, config 24, i18n 47 + tsc temiz);
  ancak docker rebuild + prod-benzeri auth'lu tarayıcı smoke (canlı eksen reçeteli üründe preview + guard 422) ayrı adım.
- Kapsam: packages/config, packages/contracts, packages/api-client, apps/api-gateway/src/variant-combinations,
  apps/store-admin-web (product form + variant-attributes/*), packages/i18n. Bloklayıcı: HAYIR.

## TD-043 Faz 2C-3 ProductVariant persistence: bilinen sınırlar (kapsam gereği)
- Tarih: 2026-07-18 (Faz 2C-3, TODO-149, ADR-072)
- Sorun 1 (legacy `optionValues` backfill YOK): Mevcut manuel/legacy `ProductVariant.optionValues` JSON'undan `combinationKey` veya
  normalize `ProductVariantOptionValue` **türetilmedi** (tahminî kimlik üretmek riskli — ADR-072 md.3). Legacy varyantlar `MANUAL`
  kalır; yalnız yeni Combination Engine üretimleri authoritative normalize kayıt kullanır. İhtiyaç olursa ayrı, dikkatli bir migration/
  audit işi gerekir. Etki: yok (bilinçli kapsam).
- Sorun 2 (gerçek-PG concurrency integration testi YOK): Concurrency advisory lock + DB unique `(productId, combinationKey)` ile
  tasarlandı ve in-memory fake + `VARIANT_GENERATION_CONFLICT` (P2002) testiyle kanıtlandı; ancak repo test altyapısında canlı
  PostgreSQL'e karşı iki paralel generation isteği çalıştıran integration testi yok. Merge sonrası docker/PG ortamında elle veya
  ileride bir integration harness ile doğrulanmalı. Etki: düşük (tasarım güvenli; kanıt in-memory).
- Sorun 3 (generation limit global sabit): `MAX_PREVIEW_COMBINATIONS` preview ile paylaşılan global config; ürün/kategori/mağaza-bazlı
  generation limiti yok (TD-042 Sorun 4 ile aynı). Etki: düşük.
- Sorun 4 (generation audit history YOK): Kim ne zaman hangi varyantları üretti/arşivledi/geri yükledi kaydı tutulmuyor (create'te
  ProductPriceChange audit'i de yazılmıyor — price 0 placeholder). Denetim gerekirse ayrı audit tablosu/log eklenebilir. Etki: düşük.
- Sorun 5 (generated SKU değiştirme politikası + regenerate confirmation UX): Deterministik placeholder SKU'yu kullanıcı SKU Matrix'te
  (2C-4) değiştirebilecek; değiştirilmiş SKU'nun yeniden üretim/restore davranışı (korunuyor) belgeli ama UI onay akışı (örn. "N varyant
  arşivlenecek, onaylıyor musun?") 2C-4'e ait. Etki: düşük (UX).
- Sorun 6 (yeni varyantta InventoryItem YOK): Üretilen DRAFT varyant için InventoryItem oluşturulmaz (görev kuralı; ilişki nullable).
  Stok girişi SKU Matrix / inventory adjust upsert'i ile lazy oluşur. Etki: yok (DRAFT satılmaz).
- Sorun 7 (runtime smoke bekliyor): Tüm gate yeşil (api-gateway 838, contracts 104, store-admin 285, api-client 23, db 16 + tsc/lint/
  build temiz); docker rebuild + `migrate deploy` + prod-benzeri auth'lu smoke (2×2 üretim/tekrar/option ekle-kaldır/restore/korunum/
  storefront-checkout-inventory regresyon) ayrı adım.
- Kapsam: packages/db (schema + migration), packages/contracts, packages/api-client, apps/api-gateway/src/variant-generation,
  apps/store-admin-web (product form + variant-attributes/* + BFF), packages/i18n. Bloklayıcı: HAYIR.

## TD-044 Faz 2C-4 Identity Management Engine: bilinen sınırlar (kapsam gereği)
- Tarih: 2026-07-18 (Faz 2C-4, TODO-150, ADR-073)
- Sorun 1 (gerçek-PG concurrency integration testi YOK): Apply concurrency advisory lock + DB unique `(storeId, sku)` ile tasarlandı ve
  in-memory fake + `IDENTITY_SKU_CONFLICT` (P2002) yoluyla kanıtlandı; canlı PostgreSQL'e karşı iki paralel apply çalıştıran integration
  testi repo altyapısında yok. Merge sonrası docker/PG ortamında elle veya ileride bir harness ile doğrulanmalı. Etki: düşük (tasarım güvenli).
- Sorun 2 (Identity Rule DB'de kalıcı DEĞİL): Pattern'lar request-scoped'tur; per-store/product varsayılan kural (IdentityRule tablosu)
  bu faz kapsamı dışında bırakıldı. Kullanıcı her seferinde pattern yazar. İhtiyaç olursa alan-agnostik motor korunarak eklenebilir. Etki: düşük (UX).
- Sorun 3 (tam Undo UI YOK): `VariantIdentityChange` batchId gruplu undo METADATA kalıcıdır ama bir batch'i geri alan reverse-apply
  ucu/UI'si bu faz yazılmadı (görev: "tam undo UI gerekmiyor"). Etki: düşük.
- Sorun 4 (rezerve token'lar aktif değil): ID/YEAR/MONTH token'ları gramerde tanınır ama bu faz `IDENTITY_TOKEN_NOT_SUPPORTED` döner
  (YEAR/MONTH saat gerektirir → saf evaluator'a enjekte edilmeli; ID = variant id ileride). GTIN/EAN/UPC/ERP/Marketplace SKU hedef
  alanları da öngörülür ama YAZILMAZ. Etki: yok (bilinçli kapsam; alan-agnostik motor genişlemeye hazır).
- Sorun 5 (Identity global length limit sabit): SKU/barcode/title max uzunlukları `DEFAULT_IDENTITY_LIMITS` sabiti (64/64/200);
  mağaza/kategori-bazlı override yok. Etki: düşük.
- Sorun 6 (Identity Matrix yalnız eksen-var ürünlerde görünür): UI, `hasVariantAxes` olan düzenleme ekranında görünür; eksen tanımlamamış
  ama manuel varyantlı ürünlerde bölüm gizli (ATTRIBUTE token'ları zaten çözülemezdi; {SEQ}/{PRODUCT} pattern'ları teorik olarak
  çalışırdı). İhtiyaç olursa görünürlük koşulu gevşetilebilir. Etki: düşük (UX kapsamı).
- Sorun 7 (runtime smoke bekliyor): Tüm gate yeşil (api-gateway 878, store-admin 285 + full `pnpm -r build` 25/25 PASS + prisma
  format/generate + migration SQL); docker rebuild + `migrate deploy` + prod-benzeri auth'lu smoke (pattern preview → collision → apply →
  audit → title koruma → idempotent) ayrı adım (commit/merge/deploy bu görevde YAPILMADI).
- Kapsam: packages/db (schema + migration), packages/contracts, packages/api-client, apps/api-gateway/src/identity-engine + variant PATCH
  (titleIsCustom), apps/store-admin-web (product form + identity/* + BFF), packages/i18n. Bloklayıcı: HAYIR.

## TD-045 Faz 2C-5 Commercial Engine: bilinen sınırlar (kapsam gereği)
- **Bağlam.** TODO-151 / ADR-074 · Commercial Engine (Price/Compare-at/Cost/VAT preview-first bulk). Aşağıdakiler bilinçli ertelendi; hiçbiri
  bloklayıcı değildir ve additive/motor-korunarak eklenebilir.
- Sorun 1 (gerçek-PG concurrency integration testi YOK): Advisory xact lock + stale-preview fingerprint tasarımı iki paralel apply'ı
  serileştirir ve lost-update'i engeller; testler in-memory fake + P2002 mapping ile doğrular ama iki gerçek eşzamanlı `prisma.$transaction`
  testi repo altyapısında yok. Merge sonrası docker/PG ortamında elle veya bir harness ile doğrulanmalı. Etki: düşük (tasarım güvenli).
- Sorun 2 (Commercial Rule DB'de kalıcı DEĞİL): Kurallar request-scoped'tur; kayıtlı/yeniden-kullanılabilir rule preset'leri (SavedCommercialRule
  tablosu) bu faz kapsamı dışı. `VariantCommercialChange.ruleSnapshot` uygulanan kuralı iz olarak tutar ama canlı preset yönetimi yok. Etki: düşük (UX).
- Sorun 3 (tam Undo UI YOK): `VariantCommercialChange` batchId gruplu undo METADATA (old/new + currency) kalıcıdır ama bir batch'i geri alan
  reverse-apply UI'si bu faz kapsamı dışı. Metadata gelecekte undo'ya yeterli. Etki: düşük.
- Sorun 4 (1000+ satır sanal tablo YOK): Commercial Matrix DOM tablosu; 1000 satır senaryosu pure preview hesabı <200ms olsa da render'da
  virtualization gerekebilir (bkz. final rapor performans). Bu faz gerekmedi; ihtiyaç olursa react-window benzeri eklenir. Etki: düşük.
- Sorun 5 (currency conversion + scheduled/channel pricing YOK): Batch tek currency (karışık → CURRENCY_MISMATCH blocking); çok-para dönüşümü,
  zamanlanmış fiyat, kanal-bazlı fiyat, kategori/vendor/brand-scoped politika bilinçli kapsam dışı. Etki: yok (kapsam).
- Sorun 6 (approval workflow YOK): Bulk fiyat apply doğrudan uygulanır; onay akışı (maker/checker) bu faz kapsamı dışı. Etki: düşük.
- Sorun 7 (price history reporting YOK): `VariantCommercialChange` sorgulanabilir ama admin raporu/ekranı bu fazda yok (audit veri temeli hazır). Etki: düşük.
- Sorun 8 (runtime smoke bekliyor): Tüm gate yeşil (api-gateway 944, store-admin 285 + typecheck TEMİZ + lint + prisma format/validate/generate
  + migration SQL); docker rebuild + `migrate deploy` + prod-benzeri auth'lu smoke (matris → direct-edit preview → +%10 → margin/markup → warning →
  blocking → apply → audit → idempotent → stale → archived exclusion) ayrı adım (commit/merge/deploy bu görevde YAPILMADI).
- Kapsam: packages/db (schema + migration), packages/contracts, packages/api-client, apps/api-gateway/src/commercial-engine, apps/store-admin-web
  (product form + commercial/* + BFF), packages/i18n. Bloklayıcı: HAYIR.

## TD-046 Faz 2C-5A Commercial UX Refinement: bilinen sınırlar (kapsam gereği)

TODO-151A / ADR-075 yalnız Store Admin UX'i yeniden tasarladı; Commercial Engine ve API kontratı değişmedi. Bilinen sınırlar:
- Sorun 1 (panelde light/dark toggle YOK; açık tema türetmesi "hazır" ama bağlı değil): Store-admin bilinçli koyu-tek-temadır (globals.css
  `color-scheme: dark`; paylaşılan @commerce-os/ui light-first ve dokunulmaz). Pricing workspace semantik token'lara bağlandı ve
  `[data-theme="light"]` override'ı tanımlı; ancak paneli açık temaya geçiren bir anahtar yok. Panel geneli light/dark AYRI iş. Etki: düşük.
- Sorun 2 (1440px+ per-tab breakout YOK): Pricing tab sayfa içerik genişliğinin tamamını (shell `max-w-6xl`) kullanır; shell'in global kapağını
  yalnız bu sekme için aşan bir breakout kırılganlık/tutarsızlık nedeniyle YAPILMADI. Çok geniş ekranlarda panelin tüm sayfalarıyla aynı mütevazı
  gutter kalır. Çözüm: shell içerik sarmalayıcısına route-bazlı genişlik varyantı (ör. `data-wide`) eklemek. Etki: düşük (kozmetik).
- Sorun 3 (eski `commercialMatrix` i18n bloğu korundu): `products.commercialMatrix` sözlüğü, statusLabels/vatOptions/rounding/priceEnding gibi
  paylaşılan enum etiketlerini yeniden kullanmak için canlı tutuldu (Pricing bloğu bunlara referans verir). Tümüyle `pricing`'e taşımak ileride
  temizlenebilir. Etki: yok (ölü metin değil, aktif referans).
- Sorun 4 (sekme geçişinde Genel formun kaydedilmemiş değişiklikleri korunmaz): Aktif olmayan sekme unmount edilir (test netliği + basitlik);
  autosave yasak olduğundan sekme değiştirince Genel formdaki kaydedilmemiş düzenlemeler kaybolur. Tab-değişiminde "kaydedilmemiş değişiklik"
  uyarısı ileride eklenebilir. Etki: düşük.
- Sorun 5 (runtime görsel smoke bekliyor): store-admin typecheck+lint+build+305 test yeşil; docker rebuild + auth'lu görsel smoke (Pricing tab
  light/dark, Hızlı düzenleme, Toplu işlem, preview özeti, warning/blocking, apply success, 1440/tablet/mobile) ayrı adım. Auth'lu piksel-smoke
  bu ortamda credential/SESSION_SECRET forge engeli nedeniyle yapılamaz (F3 dersleriyle aynı).
- Kapsam: apps/store-admin-web (products/[id] + products/pricing/* [yeni] + commercial/use-commercial-matrix.ts [hook] + product-form.tsx +
  globals.css + testler), packages/i18n (products.pricing + detail.tabs). Silinen: commercial/commercial-matrix.tsx. Bloklayıcı: HAYIR.

## TD-047 Faz 2C-6 Inventory Engine: bilinen sınırlar ve ertelenen işler (kapsam gereği)

TODO-152 / ADR-076 warehouse-aware stok TEMELİNİ kurdu (Warehouse + InventoryBalance + InventoryAdjustment + preview-first engine). Bilinçle
ERTELENEN işler (yalnız gerçekten ertelenenler):
- **Warehouse-aware reservation / checkout / allocation (Alternatif A gereği).** Sipariş yaşam döngüsü (`placeOrder`/`cancelOrder`) DEĞİŞMEDİ;
  `reserved` sistem-kontrollü, `reservation-service.ts` yalnız SAF foundation (order flow'a bağlı değil). Overselling mevcut tek-depo `FOR UPDATE`
  ile korunur; "çözüldü" iddia edilmez. Çoklu-depo rezervasyon/allocation ayrı iş.
- **Checkout safety-stock uygulaması.** Bu faz checkout hâlâ `onHand − reserved` kullanır (safety admin-görünürlük; sıfır regresyon). Checkout'un
  `sellableAvailable`'a (safety düşülmüş) geçmesi ayrı, davranış-değiştiren iş.
- **Warehouse CRUD UI + çoklu depo operasyonu.** Bu faz store başına bir DEFAULT depo + read endpoint (`GET /stores/:storeId/warehouses`) sunar.
  Depo create/update/set-default/deactivate UI ve non-default depoya sipariş entegrasyonu ertelendi.
- **Fulfillment commit (onHand düşümü).** Sipariş şu an yalnız rezerve eder; fulfillment'ta `onHand` düşümü (commit) yok.
- **Stock transfer, purchase order, supplier receiving, bin/shelf, lot/batch/serial, expiry, cycle count, reconciliation, ERP/marketplace sync,
  low-stock notification, 1000+ satır virtualization.** Enum'da `ORDER_*`/`IMPORT`/`SYSTEM` kaynakları REZERVE (kullanıcı UI'ına sızmaz).
- **Gerçek-PG concurrency integration testi.** Bu ortamda canlı Postgres yok; advisory-lock (`$executeRaw pg_advisory_xact_lock`) ve
  stale-fingerprint korumaları birim testlerle + kod düzeyinde doğrulandı; iki-paralel-adjustment lost-update senaryosu runtime smoke checklist'e
  (aşağıda) taşındı.
- **Runtime görsel smoke bekliyor.** api-gateway (1008 test) + engine (64 test) + store-admin (312 test) + typecheck + lint yeşil; migration deploy
  + docker rebuild + auth'lu görsel smoke (Stok tab, depo seçici, KPI, hızlı düzenleme, toplu işlem, preview, warning/blocking, apply→audit→
  idempotent, stale, archived exclusion, Pricing/Identity/generation/storefront/checkout regresyonu, desktop/tablet/mobile) AYRI adım. Auth'lu
  piksel-smoke bu ortamda credential/SESSION_SECRET forge engeli nedeniyle yapılamaz (F3/2C-5 dersleriyle aynı).
- Kapsam: packages/db (schema + migration 20260718150000 + seed), packages/contracts, packages/api-client, apps/api-gateway (inventory-engine/* +
  server.ts wiring), apps/store-admin-web (products/[id] + products/inventory/* [yeni] + api/catalog proxy'ler + lib/client/api.ts + testler),
  packages/i18n (products.inventory + detail.tabs.inventory). Bloklayıcı: HAYIR.

### TODO-152A — Inventory UX Birleştirme (ADR-077) kalan/dormant borç
- **`InventoryItem.lowStockThreshold` DORMANT kolon.** Artık hiçbir yerde YAZILMAZ (variant modalı + gateway create/update + contract create/update
  request kaldırıldı) ve hiçbir runtime kararı OKUMAZ (eşik authority'si tek başına `InventoryBalance.reorderPoint`). Kolon + `inventoryItemSchema`
  yanıt alanı + legacy list serileştirmesi bilinçli KORUNDU (additive/non-destructive felsefe). İleride tam emeklilik: kolon drop migration + response
  şemasından çıkarma (ayrı, dikkatli bir destructive iş — checkout/storefront stok haritası bağımsız olduğundan güvenli ama kapsam-dışı bırakıldı).
- **Store-geneli matris paginate DEĞİL.** `GET …/inventory/matrix` tüm non-archived varyantları tek seferde döndürür (demo veri seti için yeterli;
  dashboard summary'nin mevcut ilk-sayfa yaklaşımıyla aynı sınıf borç). Büyük katalog için pagination-aware/virtualized aggregation gerekir.
- **Global tek-satır hızlı işlem = iki round-trip.** +N/−N/reset her tıklamada ürün-bazlı preview→apply yapar (stale-guard için fingerprint şart).
  Doğru ve güvenli; ama toplu global operasyon için optimize değil — bilinçli (ADR-076 per-product transaction/lock korunur, fan-out reddedildi).

## TD-048 Faz 2C-7 Variant Media Engine: bilinen sınırlar ve ertelenen işler (kapsam gereği)

TODO-153 / ADR-078 media-defining axis (Renk-öncelikli) ile varyant galerisini kurdu. Bilinçle ERTELENEN / sınırlı işler:
- **Tek media-defining axis (per-SKU override / hibrit YOK).** Görseller tek eksene (genelde Renk) etiketlenir; Beden gibi diğer eksenler galeriyi
  değiştirmez. Belirli bir SKU'ya (Kırmızı/M) özel görsel override'ı bu fazda uygulanmadı (kullanıcı onayı). Mimari additive genişlemeye açık.
- **Tek-option/tek-eksen persistence (`ProductImage.optionId`).** Bir görsel en fazla bir renge etiketlenir. Bir görselin birden çok option'a
  (Kırmızı+Bordo) veya birden çok eksene eşlenmesi gerekirse `ProductImageOption` join tablosuna geçiş gerekir — servis/route "binding" (`ProductImageBinding`)
  soyutlamasıyla yazıldığı için **yalnız persistence katmanı değişir**, iş kuralları (gruplama/primary/fallback/doğrulama) aynı kalır.
- **Yalnız image; video/360°/3D/AR YOK.** Motor MediaAsset-türünden bağımsız kuruldu ama bu faz image-only. `mediaKind` enum + video upload/encoding/
  streaming + storefront `<video>`/3D oynatma ayrı Epic (F5). MediaContext PRODUCT değişmedi.
- **Media-ekseni değiştirme + yeniden-etiketlememe köşe durumu.** Bir ürünün media-ekseni A→B değiştirilir ve AYNI istekte yeni `imageBindings`
  gönderilmezse, eski eksene (A) etiketli ProductImage satırları DB'de kalır; storefront bunları B ekseninin varyantlarıyla eşleyemez → o görseller
  (paylaşılan değilse) ilgili varyant grubunda görünmez (DB bütün, görsel kaybı yok; storefront güvenli fallback tüm-dizi devreye girer hiç eşleşme yoksa).
  Admin UI ekseni değiştirince görsel etiketlerini sıfırladığı ve eksen+bindings birlikte kaydedildiği için pratikte oluşmaz. Ekseni null'a çekmek
  (klasik mod) tamamen güvenlidir (tüm görseller gösterilir). Otomatik stale-tag temizliği bilinçli eklenmedi (destructive olurdu).
- **Media-ekseni yalnız KAYITLI variant ekseni olabilir.** `assertMediaDefiningAxis` mevcut (pre-save) `ProductVariantAttribute`'a bakar; aynı kayıtta
  yeni bir eksen enable edilip media-ekseni yapılırsa 400 INVALID_MEDIA_AXIS döner (önce varyant eksenini kaydet). Admin çok-adımlı akışına uygun; friendly
  hata mesajı verilir.
- **Runtime görsel smoke bekliyor.** contracts (107) + api-gateway (1011) + storefront (202) + store-admin (313) + typecheck + lint + build yeşil; migrate
  deploy + docker rebuild + auth'lu görsel smoke (admin renk etiketleme + gruplu galeri + PDP varyant→galeri anında geçiş + SSR default grup + klasik ürün
  regresyonu) AYRI adım. Auth'lu piksel-smoke bu ortamda credential/SESSION_SECRET forge engeli nedeniyle yapılamaz.
- Kapsam: packages/db (schema + migration 20260718170000), packages/contracts, apps/api-gateway (server.ts projeksiyon/repo/route + test), apps/store-admin-web
  (product-form + media-upload + schema + test), apps/storefront-web (catalog-types + catalog + page + buy-box + pdp-selection[yeni] + variant-gallery[yeni] +
  test), packages/i18n (storeAdmin form + errors). Bloklayıcı: HAYIR.

### TODO-154 / ADR-079 — Search Read-Model Foundation (Faz 2C-8A)
- **TD-049 — PLATFORM attribute/option global fan-out YOK.** STORE attribute/option/categoryAttribute değişimi → ilgili mağazanın `reindex-store`'u tetiklenir.
  PLATFORM (admin) AttributeDefinition/AttributeOption label/status değişimi BİRDEN ÇOK mağazayı etkiler; otomatik fan-out bilinçli EKLENMEDİ (sınırsız cross-store
  fan-out riski). Geçici çözüm: admin-tetikli global rebuild (`search:backfill --all`) veya etkilenen mağazaların hedefli reindex'i. Bloklayıcı: HAYIR.
- **Kampanya-etkin fiyat facet'i YOK.** `minPriceMinor`/`maxPriceMinor` taban (liste) fiyattır; kampanya/kupon indirimli efektif fiyat aralığı read-model'e
  yansıtılmaz (zaman-bağlı + stackable → reproject maliyeti). Fiyat facet'i P1'de taban fiyat üzerinden; kampanya-etkin fiyat Faz B+ (kampanya değişince reindex).
- **PRE_ORDER / COMING_SOON kaynak bayrağı YOK.** `SearchAvailabilityState` enum ileriye açık ama besleyecek ürün/varyant bayrakları yok → bu faz yalnız
  IN_STOCK/OUT_OF_STOCK üretilir. Ön-sipariş/yakında modeli ayrı faz.
- **Kategori-hedefli reindex yerine store-batch.** Şema değişiminde (categoryAttribute/attribute) yalnız etkilenen kategorinin ürünleri yerine TÜM mağaza yeniden
  indekslenir (`reindex-store`; provider chunk'lar → bounded ama gereğinden fazla iş). Kategori-scoped tarama (scanProductIdsByCategory) Faz B optimizasyonu.
- **Eventual consistency + enqueue kaybı.** Emitter fire-and-forget: Redis erişilemezse reindex job'u KAYBOLUR (doküman bir sonraki değişime/backfill'e kadar bayat).
  Checkout/fiyat/stok canlı-otoriter olduğundan satış etkilenmez; keşif yüzeyi geçici bayat kalır. Periyodik `search:backfill` reconcile eder (zamanlanmış job Faz B/E).
- **Docker build filter — services/* eklendi (PR #81).** `node.Dockerfile` yalnız `--filter="./packages/*"` build ediyordu → worker `@commerce-os/search-service`
  (services/) dist'ini bulamayıp boot'ta çöktü (deploy sırasında yakalandı). `--filter="./services/*"` eklendi. İLERİYE DERS: yeni bir `services/*` paketi bir
  app tarafından import edilecekse Dockerfile build filter'ının onu kapsadığından emin ol. Bloklayıcı: HAYIR (çözüldü).
- **DEPLOYED + doğrulandı.** MERGED (PR #80 `0aaea08` + PR #81 `0b1a63c`=main); migrate deploy (up to date), 7/7 healthy, deployed event-driven smoke ALL PASS.
  Kapsam: packages/db (schema + migration 20260719120000), packages/contracts, packages/queues, services/search-service (yeni), apps/worker, apps/api-gateway
  (emitter + 8 route modülü + server wiring), infra/docker/node.Dockerfile. Bloklayıcı: HAYIR.
### TODO-155 / ADR-079 Faz B — Public Search & Facet API (Faz 2C-8B): bilinen sınırlar (kapsam gereği)
- **TD-050 — Fiyat facet/filtre taban fiyat + min/max range overlap (gap edge-case).** Filtre `[minPrice,maxPrice]` ürünün `[minPriceMinor,maxPriceMinor]`
  aralığıyla OVERLAP ile eşleşir. Read-model per-variant fiyat SATIRI tutmadığından, varyantlar 100 ve 500, filtre [200,300] gibi GAP durumunda ürün SUPERSET
  olarak görünür (aralıkta gerçek varyant yok ama overlap true). Güvenli yön (eşleşen ürünü ASLA gizlemez; nadiren fazla gösterir). Kesin eşleşme = per-variant
  fiyat facet satırı (additive read-model, Faz C+). Kampanya/kupon indirimli efektif fiyat KAPSAM DIŞI (taban=liste fiyatı; ADR-079 Faz B #8). Bloklayıcı: HAYIR.
- **Relevance Türkçe morfoloji + fuzzy typo Faz E.** `sort=relevance` tier'ları raw title üzerinde `lower()`/`ILIKE`/`ts_rank`/`similarity` kullanır; Türkçe
  İ/ı normalizasyonu exact/prefix tier'ında `lower()` ile sınırlıdır (searchText normalize edilmiştir ama ayrı normalize-title kolonu yok). Keyword MATCHING
  `searchVector @@ plainto_tsquery` OR `title ILIKE %q%` (substring) — gerçek edit-distance fuzzy/typo tolerance ve synonym Faz E (`normalize.ts` stemming notuyla tutarlı).
- **Facet displayOrder çoklu-kategori belirsizliği.** Bir attributeDefinition birden çok kategoride farklı `displayOrder` ile tanımlıysa, facet sırası deterministik
  olarak MIN(displayOrder) (kategori verilmişse subtree kapsamında, yoksa store genelinde) ile çözülür. Kategori-özel tam sıralama Faz C UI kararı.
- **DATE facet epoch-ms kontratı.** DATE attribute facet'i RANGE olarak `valueDate` → epoch millis ile üretilir/filtrelenir (`filter[code][min|max]`=epoch ms).
  E-ticarette nadir; zengin tarih UI (takvim/relatif) Faz C.
- **Cache YOK (bilinçle ertelendi).** Read-model materialized cache; smoke EXPLAIN bounded sorgu + index kullanımını gösterdi. Kısa-TTL Redis facet/response cache
  (`search:{storeId}:{queryHash}` + version namespace + DB fallback) ölçek/latency gerektirdiğinde eklenir (ADR-079 Faz B #13). Bloklayıcı: HAYIR.
- **Kapak/kategori hidrasyonu display-only bounded join.** Arama sonucu ürün listing DTO'su read-model'den; kategori ADI + kapak GÖRSELİ yalnız dönen SAYFA için
  bounded (≤pageSize) `listProductImages`/`listCategories` ile hidre edilir (mevcut PLP deseni). Bu, arama/facet MANTIĞININ read-model-only kilidini bozmaz
  (eşleşme/sayım/pagination read-model'de); yalnız display zenginleştirmesidir. İleride read-model'e `coverStorageKey`/`categoryName` denormalize edilebilir.
- **Durum.** DONE + MERGED + DEPLOYED (feat `5a5e597`, PR #83, merge `04264ae`=main; CI yeşil; merged-main deploy 4/4 healthy + post-merge runtime smoke ALL PASS).
  Gate yeşil + Docker gerçek-PG smoke 31/31 + HTTP uçtan uca (20/20) + EXPLAIN + allowlist temiz. Kapsam: services/search-service (types + search-query +
  provider.search), packages/contracts (publicSearchResponseSchema), apps/api-gateway (search/query-parser + search/routes + server wiring + package.json).
  YENİ MIGRATION YOK. Bloklayıcı: HAYIR.

## TD-050 Faz 2C-9 Search Listing Projection Enrichment (TODO-155.1): bilinen sınırlar ve ertelenen işler (kapsam gereği)

TODO-156A R1 riskini çözen listing projection enrichment'ının **bilinçli** kapsam-dışıları. Hiçbiri bloklayıcı değildir; hepsi kart gösterimini bozmadan ileriye ertelenmiştir.

- **TD-050.1 — Kampanya/indirim rozeti snapshot'ı YOK (→ TODO-155.2). RESOLVED (2026-07-19, TODO-155.2).** Kampanya rozeti artık search read-model'de: `selectPublicCampaignDisplay` + `CampaignRecord` + `toCouponDisplayFields` **paylaşılan pakete taşındı** (`@commerce-os/contracts`; PDP + indexer AYNI "tek formül"). `selectIndexableCampaignSnapshot` index-anında birincil rozeti + kazanan pencere (`campaignStartsAt/EndsAt`) snapshot'lar; `ProductSearchDocument.campaign` (jsonb) additive; read-time `isCampaignSnapshotDisplayable` bastırması + kampanya lifecycle reindex (`onCampaignChanged→reindexStore`) + reconciliation sweep (`CAMPAIGN_RECONCILE_ENABLED`). PDP↔PLP "Sepette" tutarlılığı sağlandı. Bkz. PHASE_LOG Faz 2C-9B. (Eski açıklama tarihsel:) Bu pass ticari snapshot olarak yalnız `compareAt`/`discountPercent`/Omnibus taşır. F4A **kampanya rozeti** ("Sepette %X" + `estimatedFinalUnitPriceMinor` + public kupon) snapshot'ı ERTELENDİ: hesaplama search-service'te olur (worker ayrı proses, api-gateway'i import edemez), "tek formül" için pure `selectPublicCampaignDisplay` + record tipleri + `toCouponDisplayFields` **paylaşılan pakete taşınmalı** (F4A modülü refactor'u + F4A test doğrulaması). Karar: F4A regresyon riskini bu pass'e sokmamak. **Strateji sabit (ADR-079 Ek §6):** badge validity window (`startsAt`/`endsAt`) snapshot'lanır; arama **okuma yolunda pencere-dışı badge bastırılır** (join YOK → expiry anında self-heal) + kampanya lifecycle event reindex tetikleyicileri. Şu an PLP kartı kampanya rozetini kaybeder (compareAt indirimi + Omnibus KORUNUR); rozet 155.2'de gelir.
- **TD-050.2 — Omnibus 30-gün penceresi bayatlaması.** `omnibusPreviousPriceMinor` index anında snapshot'lanır; pencere **mutasyonsuz kayar** (30 gün önceki düşük fiyat düşer). Fiyat/compareAt değişimi zaten reindexProduct tetikler (taze); saf pencere-kayması için **günlük reconciliation sweep** (kampanya sınırı geçen + Omnibus penceresi kayan ürünleri reindex) STRATEJİ olarak dokümante — **kod TODO-155.2**. Risk düşük: Omnibus yalnız indirim aktifken gösterilir + "geçmişte en düşük" bir alt-sınırdır (yanlış aktif indirim göstermez).
- **TD-050.3 — PLATFORM option fan-out (TD-049 duruşu korundu).** Swatch label/colorHex/sortOrder/status **STORE** option değişiminde `reindexStore` ile tazelenir. **PLATFORM** (storeId=null) option değişimi otomatik fan-out ETMEZ (birden çok mağaza; TD-049) → admin-tetikli global rebuild. Bu pass bu duruşu KORUR (yeni fan-out tetikleyicisi eklemez).
- **TD-050.4 — Swatch modeli sınırları.** Yalnız **tek** media-tanımlayıcı eksen (Renk); size swatch girmez. Her swatch kapağı `ProductImage.optionId` tek-option persistence'ından (ADR-078 ile tutarlı); çok-option/çok-eksen `ProductImageOption` join'e yükseltilince yalnız kaynak sorgusu değişir. Default swatch pencere kesilirse (>8 renk + default yüksek sortOrder) son slotta garanti edilir; bu edge nadir.
- **TD-050.5 — Secondary/hover görseli ürün-seviyesi.** `secondaryImage` = farklı mediaId ikinci görsel (paylaşılan); seçili swatch'a göre reaktif hover görseli storefront tarafında swatch.image ile yapılır (kart etkileşimi TODO-156 kapsamı).
- **TD-050.6 — Kategori adı hâlâ query-time hidre.** `categoryLabel` route'ta bounded `resolveCategoryNames` ile çözülür (read-model'e taşınmadı — R1 kapsamı DIŞI; nadir değişir). İleride `primaryCategoryLabel` doküman kolonu ile snapshot'lanabilir.
- **Durum.** DONE + **MERGED + DEPLOYED** (feat `dbeeac0`, PR **#85**, merge **`42bc9c7`**=main; CI pass 3m34s; merged-main deploy 4/4 healthy + post-merge runtime smoke ALL PASS). Gate yeşil (search-service 70 + contracts 110 + api-gateway 1047; full build 24/24 + typecheck + lint + prisma validate). Migration additive (`20260719130000`). Bloklayıcı: HAYIR.

## TD-051 Faz 2C-8C Storefront Search Foundation (TODO-156B): bilinen sınırlar ve ertelenen işler (kapsam gereği)

TODO-156B storefront search wiring'inin **bilinçli** kapsam-dışıları. Hiçbiri bloklayıcı değildir; her biri ANALIZ-156A'da fazlandırıldı.

- **TD-051.1 — Dynamic Facet UI YOK (→ TODO-156C). RESOLVED (2026-07-19, TODO-156C).** `FacetRenderer` registry (`resolveFacetKind` + `Record<FacetKind,Component>`, switch-case yok) + `FilterRail` (desktop) + `FilterDrawer` (mobil, focus-trap/ESC/scroll-lock) + `ActiveFilterChips` (URL-türevli) + 7 dataType renderer eklendi. Backend disjunctive facet artık storefront'ta render + filtrelenir; +39 test + docker smoke ALL PASS. Bkz. PHASE_LOG Faz 2C-8D + [[TD-053]].
- **TD-051.2 — Load More ERTELENDİ (→ TODO-156C/D).** Yalnız numaralı pagination (canonical/SEO otorite). Load More client'ın gateway'e doğrudan erişimi olmadığından (BFF sunucu-yalnız) temiz + history-güvenli kurulum için ayrı Route Handler/Server Action ister; §11 "yarım/history-bozan çözüm yapma" gereği ertelendi.
- **TD-051.3 — Kampanya rozeti YOK (→ TODO-155.2, TD-050.1). RESOLVED (2026-07-19, TODO-155.2).** Kart artık kampanya "Sepette" rozetini read-model snapshot'ından tüketir (`listing-adapter.toCardCampaign` + `SearchProductCard` PriceBlock; PDP ile aynı sunum). Öncelik: otomatik kampanya varsa "Sepette" bloğu (compareAt üstü-çizili + Omnibus bu dalda gizli); yoksa compareAt markdown. Bkz. [[TD-050.1]].
- **TD-051.4 — Kategori SEO landing + JSON-LD YOK (→ TODO-156D).** `category` yalnız search param (subtree passthrough); ayrı `/categories/[slug]` route + zengin H1/açıklama + `ItemList`/`BreadcrumbList` JSON-LD + `rel prev/next` 156D'de. Bu fazda breadcrumb iskeleti + noindex/canonical **temeli** kuruldu (kötü temel bırakılmadı).
- **TD-051.5 — Mobil header arama girişi YOK.** Header arama mevcut tasarımda `md:` üstünde görünür (mobilde gizli — pre-existing davranış korundu). Mobil arama girişi (mobil menüye eklenebilir) ayrı UX işi; regresyon değil.
- **TD-051.6 — next/image yerine native `<img>`.** Tüm vitrin `/media/*` Next rewrite + native `<img>` kullanır (tutarlılık; remotePatterns config gerektirmez). LCP için `ProductMedia` additive `priority` (eager+fetchpriority=high ilk satır; gerisi lazy) aldı. next/image'a topyekûn geçiş ayrı iş (site-geneli).
- **TD-051.7 — Tam storefront dict client island'lara serialize edilir.** Kart/sort/pagination `t: StorefrontDictionary` alır (mevcut ProductCard deseniyle tutarlı) → RSC flight payload'una i18n sözlüğü girer. İş mantığı değil; mevcut konvansiyon. İleride dar prop yüzeyi (yalnız `t.search`) ile küçültülebilir.
- **TD-051.8 — Pre-existing typecheck borcu (kapsam dışı).** `apps/storefront-web` typecheck gate'i yok; manuel `tsc` `test/checkout-form-render.test.tsx`'te stale CartLineView fixture'ı gösteriyordu (imageUrl/selected/discounted* eksik). 156B öncesinden; `next build`'i kırmaz, vitest geçer. **RESOLVED (2026-07-19, TD-052 → [[TD-040]]):** fixture'a eksik 5 gösterim alanı davranış-nötr eklendi; `tsc --noEmit` TS2739 = 0.
- **Durum.** DONE + **MERGED + DEPLOYED** (feat `415a0cd`, PR **#87**, merge **`77042e4`**=main; CI pass 3m37s; merged-main deploy 5/5 healthy + post-merge runtime smoke ALL PASS). Gate: storefront 273/273 (+75) · i18n 47 (TR/EN parity) · contracts 110 · next build yeşil · lint temiz. YENİ MIGRATION YOK. Bloklayıcı: HAYIR.

## TD-053 Faz 2C-8D Dynamic Facet Experience (TODO-156C): bilinen sınırlar ve ertelenen işler

TODO-156C facet UI'inin **bilinçli** kapsam-dışıları/sınırları. Hiçbiri bloklayıcı değildir.

- **TD-053.1 — Range facet TAM SAYI sınırı (INTEGER tam, DECIMAL yuvarlanır).** Gateway query-parser + storefront codec `filter[code][min|max]`'i `parseIntStrict` ile **tam sayı** olarak ayrıştırır. DECIMAL dataType facet'inin ondalık sınırları (ör. 12.5) URL'de kabul edilmez → tam sayıya iner. `FacetNumberRange` bunu yansıtır (available sınırları floor/ceil placeholder). Gerçek ondalık aralık istenirse gateway parser + codec ondalık-destekli hale gelmeli (ayrı iş; backend kontratı da değişir).
- **TD-053.2 — Slider YOK (min/max input).** Backend yalnız `availableMin/Max` + `selectedMin/Max` verir (histogram/bucket YOK; ADR-079). Bu faz iki sayısal input; çift-tutamaçlı slider ayrı faz (brief §8 açıkça "slider yapma"). Sahte histogram çizilmez.
- **TD-053.3 — Fiyat minor↔major sabit ×100 varsayımı.** `PriceFacet` kullanıcı girişini (ana birim ₺) minor'a `×100` ile çevirir (mağaza TRY). Minor-birim oranı farklı bir para biriminde (ör. JPY=1, KWD=1000) yanlış olur. Vitrin bugün tek-mağaza TRY; çok-para-birimi gelince `Intl.NumberFormat(...).resolvedOptions().maximumFractionDigits` tabanlı dinamik çarpan gerekir.
- **TD-053.4 — DATE facet "hazırlık" (canlı doğrulanmadı).** `FacetDateRange` native `type=date` ↔ epoch-ms (UTC) dönüşümü yapar; backend DATE facet gönderirse çalışır ama demo veride DATE facet yok → yalnız SSR/unit düzeyinde kanıtlandı, canlı endpoint smoke'u yapılmadı (brief §9 "yalnız backend desteği varsa göster").
- **TD-053.5 — Facet GÖRÜNÜM ≠ FİLTRELENEBİLİRLİK asimetrisi (backend). KISMEN RESOLVED (2026-07-19, TODO-155.2).** Asıl **swatch↔facet boşluğu** çözüldü: variantDefining+filterable eksen seçimleri (`ProductVariantOptionValue`) artık `ProductFacetValue`'ya index'lenir (`buildFacets` variantDefining dalı VAV **VE** variant eksen option değerlerini birleşik dedupe ile yayar) → Demo Hoodie "Renk" facet'i artık ELLE SEED OLMADAN üretilir (swatch'ı besleyen aynı eksen). Kalan teorik asimetri: universe sorgusu hâlâ `filterable`'ı kontrol etmez (görünüm) ama uygulama `filterable=TRUE` ister; index-anı `filterable` yalnız filtrelenebilir attribute'ı yazdığından pratikte tutarlı, elle/tutarsız veri teorik risk. Frontend 400→boş-durum ile güvenli karşılar.
- **TD-053.6 — Tam storefront dict çipe/facet'e serialize (TD-051.7 devamı).** Rail/drawer/chip/facet component'leri `t: StorefrontDictionary` alır (mevcut konvansiyon) → RSC flight payload'una tüm sözlük girer. İş mantığı değil; ileride dar `t.search` yüzeyine indirilebilir.

## TD-054 Faz 2C-9B Search Listing Semantic Completion (TODO-155.2): bilinen sınırlar ve ertelenen işler

TODO-155.2 kampanya snapshot + variant facet projeksiyonunun **bilinçli** kapsam-dışıları/sınırları.

- **TD-054.1 — Kampanya lifecycle reindex = STORE-geneli (granüler değil).** `onCampaignChanged` her kampanya create/update/activate/pause/archive'da `reindexStore` tetikler (attribute ŞEMA değişimi deseniyle aynı; her zaman doğru + bounded). Scoped kampanyada yalnız etkilenen ürünleri reindex etmek (kategori→ürün genişletme + eski∪yeni kapsam) ileri optimizasyon; store reindex `rebuildStore` ile chunk'lı zaten bounded. Düşük-frekanslı admin mutasyonu için kabul edilir.
- **TD-054.2 — Reconciliation sweep yalnız KAMPANYA penceresi (Omnibus penceresi hariç).** Sweep (a) süresi geçmiş kampanya snapshot'lı ürünleri (b) yeni açılan kampanya mağazalarını reindex eder. TD-050.2 Omnibus 30-gün pencere kayması AYRI kalır (aynı sweep altyapısına eklenebilir; kod ertelendi). Read-time bastırma zaten stale kampanya badge'ini gizler → sweep gecikse bile kullanıcı yanlış görmez.
- **TD-054.3 — Reconciliation in-process, tek-instance (ADR-051 mirası).** Sweep api-gateway süreci içinde `setTimeout` zinciri + in-process overlap lock; çoklu gateway replica'da çift-tarama olur (idempotent olduğundan zararsız, yalnız fazladan reindex job'u). Varsayılan KAPALI (`CAMPAIGN_RECONCILE_ENABLED=false`). Dedike worker servisine taşıma = ADR-051 ile aynı tetikleyici.
- **TD-054.4 — PLP kampanya fiyatı BİLGİLENDİRİCİ (checkout otoriter).** Kart "Sepette ₺X" sunucunun index-anı GÜVENLİ tahminidir (ADR-062 tek formül; yalnız otomatik PERCENT + tek fiyat + minOrder karşılanır). Nihai fiyat checkout motorunda (canlı) hesaplanır; sepet toplamı/segment/kupon/çoklu-ürün koşullu kampanyalar karta kesin fiyat olarak YANSITILMAZ (badge etiketi gösterilir, sahte final yok). FIXED_AMOUNT sepet indirimi tek birime bölünmez → estimatedFinal null.
- **TD-054.5 — İkincil kupon karta yansımaz (yalnız birincil "Sepette").** Snapshot birincil rozeti taşır (kartın ihtiyacı); PDP ikincil stackable kuponu canlı gösterir. Kart bounded kalsın diye ikincil kupon çipi karta eklenmedi (ileri iş).
- **TD-054.6 — Kampanya scope kategori eşleşmesi DİREKT üyelik (subtree değil).** `campaignAppliesToProduct` ürünün `categoryIds`'i ∩ kampanya `categoryIds` (doğrudan atama; alt-kategori otomatik dahil DEĞİL). F4A motoruyla birebir (checkout ile tutarlı); değişirse iki tarafta birlikte değişmeli.

### TODO-156D — SEO URL Governance / Slug / Redirect / JSON-LD / Accessibility (kalan borçlar)
- **TD-055 — `STOREFRONT_SITE_URL` prod'da SET edilmeli.** Canonical/OG/JSON-LD/sitemap mutlak URL üretir; env yoksa `http://localhost:3000` fallback'e düşer (dev doğru, prod'da yanlış origin). Deploy checklist: prod origin'e ayarla. Değer boş/whitespace ise fallback (TD-036 toleransı).
- **TD-056 — ~~products-search-page.test.tsx tsc `campaign` uyuşmazlığı~~ → KAPANDI (TODO-156D tamamlama).** Fixture'a zorunlu `campaign: null` eklendi; storefront tsc artık TAM temiz (exit 0). Ayrıca önceki fazdan tsc-denetlenmemiş iki test fixture (`sku: null` → `StorefrontVariantView.sku: string`) düzeltildi.
- **TD-057 — Admin SEO UI YOK (foundation-only, brief §19).** Slug/redirect/history servis mantığı (`@commerce-os/utils`) + persistence (SlugHistory/Redirect tablo) hazır; Admin CRUD ekranı + gateway ucu bu fazda YAPILMADI (brief kuralı).
- **TD-058 — ~~SlugHistory canlı wiring yok~~ → KAPANDI (TODO-156D tamamlama).** Ürün/kategori PATCH akışında slug gerçekten değişince (updateProduct/updateCategory transaction'ı içinde ATOMIK) `recordSlugChange` → SlugHistory (immutable, idempotent) + otomatik 301 `Redirect` + chain collapse yazılıyor. Bkz. `apps/api-gateway/src/seo/slug-governance.ts`.
- **TD-059 — ~~Redirect istek-zamanı çözümleme bağlı DEĞİL~~ → KAPANDI (TODO-156D tamamlama).** Storefront `middleware.ts` 404'ten ÖNCE public redirect ucunu (`GET /public/stores/:slug/redirects`, TTL-cache'li) okuyup SAF resolver ile çözüyor; doğru 301/302/307/308 dönüyor. Bkz. `apps/storefront-web/lib/seo/redirect-runtime.ts`.
- **TD-064 — Kategori RUNTIME redirect (query-param) devre dışı.** Kategori slug değişince SlugHistory + `Redirect` (source `/products?category=old`) YAZILIR, ancak storefront runtime çözümleyicisi query-tabanlı kaynakları index'ten HARİÇ tutar (pathname eşleşmesi `/products?category=x`'i `/products` listeleme sayfasıyla karıştırırdı → yanlış redirect). Ürün redirect'i (path-segment) tam çalışır. Kategori runtime redirect'i, ADR-080'de ertelenen `/categories/[slug]` dedike route'u (path-segment) gelince aktifleşir; foundation (history + redirect satırı) hazır.
- **TD-065 — Runtime redirect cache instance-lokal + kısa TTL.** Middleware redirect index'ini worker isolate başına 60s TTL modül cache'inde tutar (Redis yok — brief §6). Çoklu instance'ta redirect değişimi ≤60s'de yayılır (kabul); Admin'den redirect düzenleme gelince cache invalidation (webhook/versiyon) düşünülebilir. Middleware her içerik isteğinde (cache-miss'te) gateway'e bir fetch yapar.
- **TD-060 — Sitemap kategori/CMS genişlemesi.** Sitemap ürün + statik kapsar; kategori URL'leri (`?category=`) indexlenebilir ama public categories listeleme ucu yok → sitemap'e eklenemedi. Bir `GET /public/stores/:slug/categories` ucu + CMS sayfa kaynağı gelince genişletilir (`app/sitemap.ts` genişlemeye açık yazıldı).
- **TD-061 — 410 Gone politikası ertelendi.** Silinen ürün = 404 (ADR-080 §7). Admin'de "kalıcı sil / arşivle" ayrımı gelince kalıcı kaldırma için `410 Gone` (daha güçlü de-index sinyali) değerlendirilecek. 404 v1 için yeterli.
- **TD-066 — Enterprise demo dataset: per-renk swatch görselleri + `VariantAttributeValue` searchText yolu ertelendi.** Enterprise seed (TODO-157) ürünlere tek domain-yer tutucu kapak atar; renk eksenine etiketli per-option görsel üretmez → `VariantGallery` swatch listesi kapak görseline fallback eder. Ayrıca variant eksenleri için `VariantAttributeValue` (Faz 2A typed variant değeri) doldurulmaz; renk/kapasite aranabilirliği açıklama anahtar-kelimeleri + `ProductVariantOptionValue` facet'i ile sağlanır (facet/PLP tam çalışır). Zengin swatch görseli gerektiğinde per-option `ProductImage(attributeDefinitionId, optionId)` + `VariantAttributeValue` eklenir.
- **TD-067 — Enterprise seed script'leri tsc typecheck kapsamı dışında.** `packages/db/scripts/enterprise/*.mjs` düz ESM (docker container'da `node` ile çalışır; tsx gerektirmez). `packages/db/tsconfig.json` yalnız `src/**` + `scripts/**/*.ts` derler → `.mjs` runtime script'leri typecheck gate'inde değil. Koruma: SAF üretici vitest (`packages/db/test/enterprise-dataset.test.ts`, 43 test) + eslint. İleride `.ts` + `tsx`'e taşınabilir.
- **TD-062 — Ürün görsel `alt` metni sınırlı.** JSON-LD `image` + PDP galeri `altText` public DTO'dan gelir; boşsa jenerik. Zengin alt-metin (ürün+varyant bağlamı) admin-girişli olduğunda iyileşir (SEO/erişilebilirlik ortak kazanç).
- **TD-063 — Docker/Lighthouse SEO smoke YAPILMADI (deploy kuralı).** Brief §22 gerçek-veri doğrulaması (canonical/JSON-LD/robots/sitemap/Lighthouse) deploy adımıdır; bu faz "commit/deploy YAPMA" kuralı gereği çalıştırılmadı. Doğrulama: `next build` 17 route temiz + 2068 unit + PDP JSON-LD render kanıtı ile yapıldı. Docker runtime smoke merge öncesi ayrı adım.

## TODO-156E — Autocomplete & Discovery (Faz 2C-8E)

- **TD-066 — Marka için AYRI facet/filtre yok → marka önerisi = `q` araması.** Autocomplete marka grubu `q=marka` aramasına yönlendirir (`brandHref`); read-model'de `brand` bir facet attribute'u değil, doküman alanıdır ve search parser `filter[brand]` desteklemez. `searchText` marka'yı kapsadığından `q=marka` doğru daraltmayı verir. Gerçek "marka filtresi" (facet çipi + `filter[brand]`) marka'yı `ProductFacetValue`'ya bir sentetik facet olarak eklemeyi veya parser'a birinci-sınıf `brand` filtresi eklemeyi gerektirir (Faz E+).
- **TD-067 — Typo tolerance / synonym YOK.** Autocomplete eşleşmesi prefix ILIKE + `searchText` contains + tsvector + trigram similarity'dir (deterministik). Yazım-hatası toleransı (ör. "iphon"→"iphone" ötesi) ve eşanlamlı (synonym) genişletme KAPSAM DIŞI (Çalışma Sınırı). Trigram `similarity` ORDER BY kısmi bulanıklık verir ama eşik/synonym sözlüğü yok. OpenSearch/synonym analyzer geçişinde çözülür.
- **TD-068 — Recent searches yalnız istemci-yerel; popüler/trending placeholder.** Son aramalar `localStorage` (`commerce_os_recent_searches`, tekil/bounded); cihazlar arası senkron / sunucu persistence YOK. Popüler aramalar i18n statik placeholder (`autocomplete.popularTerms`) — gerçek analytics değil (Çalışma Sınırı). Trending products placeholder da eklenmedi. `buildPopupOptions` empty-modu bu kaynakları grupladığı için gerçek veri gelince (Faz E analytics) drop-in bağlanır.
- **TD-069 — Query-suggestions katalog başlığı/marka'dan türetilir (popüler-sorgu indeksi yok).** `buildQuerySuggestions` eşleşen ürün başlıkları + markalardan deterministik tamamlama üretir; gerçek "popüler sorgu" / "sıkça aranan" indeksi (tıklama/impression analytics tabanlı) YOK (Çalışma Sınırı). Algolia/Shopify tarzı Query Suggestions ayrı bir türetilmiş indeks gerektirir (Faz E).
- **TD-070 — Autocomplete cache instance-yerel + rate-limit yok.** Gateway `autocomplete-cache` process-yerel TTL (30s) — çoklu replica'da paylaşılmaz (kabul; kısa TTL, deterministik sonuç). İstek başına rate-limit YOK (debounce + client cache istek yağmurunu azaltır ama sunucu-tarafı kötüye-kullanım guard'ı Faz E). Redis paylaşımlı cache + rate-limit ölçekte değerlendirilir.
- **TD-071 — Docker/tarayıcı autocomplete smoke YAPILDI ama commit/deploy YAPILMADI (brief kuralı).** Faz 2C-8E worktree'de gerçek-PG + gerçek-tarayıcı smoke geçti (aşağıda PHASE_LOG), ancak "commit/push/PR/merge/deploy YAPMA" kuralı gereği kod worktree'de bırakıldı; api-gateway + storefront-web imajları worktree'den rebuild edilip smoke için çalıştırıldı (main stack üzerine). Merge sonrası temiz rebuild ayrı adım.

## TODO-156E UX Rafinasyonu (2. geçiş)

- **TD-072 — "Çok Satan" (best-seller) rozeti YOK.** Ürün kartı "Yeni" (productCreatedAt türevi) + "Kampanya" rozetlerini gösterir; "Çok Satan" satış/sipariş analitiği gerektirir (sales velocity) ve analytics KAPSAM DIŞI (Çalışma Sınırı). Kart bileşeni ek nötr pill'e açık; gerçek best-seller sinyali (Faz E analytics/read-model'e satış sayacı) gelince eklenir. Fabrikasyon YAPILMADI (yanıltıcı rozet önlenir).
- **TD-073 — Empty-state popüler KATEGORİLER placeholder değil, aksiyon olarak eklenmedi.** Empty state son aramalar (localStorage) + popüler aramalar (i18n placeholder) + "Tüm ürünlere göz at" gösterir; "popüler kategoriler" gerçek kategori listesi gerektirir ama public `GET /public/stores/:slug/categories` ucu YOK ([[TD-060]] ile aynı boşluk). Categories ucu gelince empty-state'e gerçek kategori kısayolları eklenir (combobox empty-mode kaynak-agnostik yazıldı → drop-in).
- **TD-074 — Hero slide hedef (ürün/kategori/kampanya) SEÇİCİ admin UI'da yok; yalnız CTA URL + backend alanları.** `HomeHeroSlide` şeması `targetProductId`/`targetCategoryId`/`targetCampaignId` taşır ve gateway var-olma doğrular; store-admin slide editörü bu faz yalnız `ctaHref` (manuel link) sunar. Hedef seçici (ürün/kategori/kampanya picker → otomatik href) ertelendi (Çalışma Sınırı). Backend hazır; UI drop-in.
- **TD-075 — Hero video KAPSAM DIŞI (yalnız alan ayrıldı).** `HomeHeroSlide.videoUrl` şemada var ama storefront hero slider render ETMEZ (forward-compat). Video section tipi + oynatıcı ileri faz.
- **TD-076 — DYNAMIC showcase `CAMPAIGN` kuralı yalnız ÜRÜN-ölçekli kampanyaları kapsar.** `CampaignProduct` üzerinden ACTIVE+isPublic+pencere-geçerli kampanyalara bağlı ürünler seçilir; kategori-ölçekli veya mağaza-geneli kampanyaların dolaylı ürünleri (primaryCategory eşleşmesi vb.) v1'de DAHİL DEĞİL. Genişletme resolver'a bir dal (Çalışma Sınırı).
- **TD-077 — DYNAMIC `CATEGORY` kuralı primaryCategory + doğrudan atama ile sınırlı (alt-ağaç yok).** Kural, kategorinin kendisine primary VEYA assignment ile bağlı ürünleri seçer; alt kategori ağacını (descendant) OTOMATİK dahil etmez. Alt-ağaç genişletme (search subtree deseni) ileri faz.
- **TD-078 — Section yayın penceresi (publishStart/publishEnd) admin UI'da yok; backend + seed destekler.** Şema + gateway + public eleme yayın penceresini tam destekler; store-admin section ayar formu bu faz enabled/görünürlük sunar, tarih alanlarını sunmaz (Çalışma Sınırı). Datetime alanları drop-in eklenebilir.
- **TD-079 — Enterprise seed sipariş varken tam wipe-reseed yapamaz (ÖNCEDEN VAR olan sınır; TODO-158A'da teyit edildi).** `persistDataset` → `wipeScope` ürünleri siler; enterprise-demo ürünlerinde `OrderLine` varsa `Product.deleteMany` FK ihlali verir (P2003) ve seed yarıda kalır. Home seed kodu doğru ve verify edildi; tam re-seed yalnız sipariş yokken/temiz DB'de çalışır. Çözüm: seed öncesi demo sipariş temizliği veya wipe sırasını sipariş-güvenli yapmak (ayrı iş).
