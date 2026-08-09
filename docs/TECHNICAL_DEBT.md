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
- **Launch Audit (2026-07-27):** rate limit artık **VAR** (platform login `server.ts:1548-1590,6670`;
  customer login/OTP `customers/index.ts:1519-1540,1639,1788`, IP+identifier keyed lockout). Kalan gerçek
  boşluk = limiter state in-memory `Map` → çok-replika round-robin ile bypass edilebilir → Redis/dağıtık
  limiter gerekir (MEDIUM, launch-sonrası). Cookie/CSRF/session hardening kısmı **handled**.
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

- Durum: RESOLVED (2026-08-02, Final Polish readiness audit)
- Oncelik: LOW
- Etki: `apps/store-admin-web` dashboard ozeti (`/api/dashboard/summary`) toplam urun/kategori/stok
  sayilarini gateway pagination `total`'inden kesin alir; ancak "aktif urun" sayisi yalnizca ilk sayfa
  (gateway varsayilan limit) uzerinden `data.filter(status==="ACTIVE")` ile hesaplaniyordu. Demo veri
  seti icin dogru, ama tek sayfadan buyuk katalogta ciddi undercount: enterprise-demo'da 418 aktif urun
  dashboard'da **24** goruluyordu.
- Cozum (2026-08-02): "Aktif urun" artik ilk-sayfa satirlarindan degil, gateway'e `status=ACTIVE` ile
  yapilan ikinci hafif sayim cagrisinin `pagination.total`'indan alinir (`pageSize=1`, satir tasinmaz).
  `apps/store-admin-web/app/api/dashboard/summary/route.ts`. "Kritik stok" zaten Inventory Engine'in
  sayfadan-bagimsiz `summary`'sinden geliyordu (TD-152A/159C) — o kisimda hata yoktu. Browser'da
  dogrulandi (dashboard 24 → 418) + `bff-security.test.ts` mekanizmaya gore guncellendi.
- Hedef faz: Faz 2C+ (kapatildi)

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
- **Launch Audit (2026-07-27):** oversell bölümü **handled** (kilit doğru). Ancak (2)+(3) dilimi —
  orphan DRAFT + expiry-yok — anonim checkout'ta gerçek stok-kilitlenmesi üretir; bu **HIGH** dilim ayrı
  **[[TD-136]]** olarak izlenir. TD-033 gövdesi atomiklik (single-tx create+place) tamamlayıcısı olarak açık kalır.
- **H-3 (2026-07-29) güncellemesi:** dilim (2) **orphan DRAFT auto-cancel** ve (3) **rezervasyon expiry**
  **ÇÖZÜLDÜ** ([[TD-136]] CLOSED; worker `inventory-reservation-expiry` + TTL + read-time add-back).
  TD-033'te AÇIK kalan **yalnız** dilim (1): `createOrder`(DRAFT)+`placeOrder` **iki ayrı transaction**;
  aralarındaki yaris penceresi oversell ÜRETMEZ (placeOrder FOR UPDATE ile yeniden doğrular; en kötü
  durum benign 409/INSUFFICIENT_STOCK), fakat single-tx create+place atomiklik iyileştirmesi tamamlayıcı
  olarak **OPEN** kalır (MEDIUM; reserve-on-auth ile birlikte ele alınabilir). Stok-kilitlenmesi riski YOK.
- Durum güncelleme: OPEN (yalnız single-tx atomiklik dilimi; stok-kilitlenmesi/expiry dilimi CLOSED).
- Hedef faz: Faz 3B.2 (atomiklik) — düşük öncelik.

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
- **Launch Audit (2026-07-27) — somut risk netleştirmesi:** webhook shell yalnız placeholder DEĞİL; asıl
  tehlike, sipariş PAID **geçişinin `signatureValid`'e gate'lenmemesi** ve store'un client-supplied `body.storeId`'den
  çözülmesidir (`server.ts:9069-9147`; `verifyWebhookSignature(){ return true }` `stripe.ts:146`). `attemptId`
  müşteriye payment-state yanıtında döndüğü için müşteri kendi siparişini bedavaya PAID işaretleyebilir. Bugün
  MOCK-only ile sınırlı; **gerçek sağlayıcı açılmadan ÖNCE** imza zorunlu + store'u doğrulanmış attempt'ten türet.
  Bu, canlı sağlayıcı kapısının (EXTERNAL DECISION) ayrılmaz parçası → launch için **PROD BLOCKER (gerçek-ödeme kapısı)**.
- **PB-1 ÇÖZÜLDÜ (2026-07-27; ADR-156/157/158; kod TAMAM, deploy YOK):** Eski client-otoriteli
  `/payments/webhooks/:provider` ucu KALDIRILDI. Doğrulanmış webhook `POST /public/payments/webhooks/:webhookToken`:
  HMAC(`timestamp.rawBody`) imza + replay penceresi, store token'dan, attempt/order DOĞRULANMIŞ provider
  reference'tan, amount/currency invariant, monotonik geçiş, `(storeId,provider,eventId)` idempotency; fail-closed
  (secret yok → 404). Tüm `verifyWebhookSignature(){return true}` bypass'ları + adapter webhook metodları silindi.
  30 birim/route testi + **14/14 canlı exploit regresyonu** (gerçek PostgreSQL). Migration `20260727170000`.
  Analiz: `docs/analysis/PB-1-payment-webhook-authenticity.md`. **Kalan (EX-1'e bağlı):** [[TD-137]] sağlayıcı-native
  imza + [[TD-138]] webhook provisioning UI.

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

## TD-039B Faz 2B dinamik ürün formu: bilinen sınırlar (kapsam gereği)
- Not (2026-08-02, readiness audit): Bu baslik onceden TD-039 idi ve `primaryCategoryId` follow-up'i
  (bkz. yukaridaki TD-039) ile ayni id'yi paylasiyordu (duplicate). Ikisi ayri borctur; bu giris
  TD-039B'ye tasindi.
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
- **TD-057 — ~~Admin SEO UI YOK~~ → KAPANDI (TODO-166 / ADR-265).** Store-admin "SEO > Slug ve Yönlendirmeler" modülü eklendi: `/stores/:storeId/seo/redirects` (list/create/detail/patch/delete) + `/stores/:storeId/seo/slugs[/:type/:id]` gateway uçları (`CATALOG` core-gate), api-client + BFF proxy, DataGrid tabanlı Slug/Yönlendirme ekranları + detay drawer + manuel redirect formu. Marka slug lifecycle de eklendi (`SlugEntityType += BRAND`, `brandUrlPath`, atomik `recordSlugChange`). `Redirect.origin` (AUTOMATIC/MANUAL) ayrımı; otomatik kayıt salt-toggle, manuel tam CRUD. Bkz. `docs/analysis/SLUG-redirect-management.md`.
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

## TODO-158B (ADR-087) — Enterprise Theme Engine sınırları (TD-080…TD-086)

- **TD-080 — Theme Engine yalnız STOREFRONT'a bağlandı; store-admin/customer-portal/landing henüz tüketmez.** `@commerce-os/theme` framework-agnostik ve çok-app hedefli tasarlandı; ancak bu faz yalnız `apps/storefront-web` public `/theme` ucundan beslenir. Store-admin kendi dark-glass kitini kullanmaya devam eder (görünümü DEĞİŞMEDİ, kasıtlı). Diğer app'lerin `--ds-*` katmanını tüketmesi ayrı faz (Çalışma Sınırı).
- **TD-081 — Preset'lerin özel font aileleri @font-face ile YÜKLENMİYOR (yalnız paketli Inter/Playfair).** Preset `typography.headingFont/bodyFont` serbest CSS font-stack alır ve token olarak yayınlanır; ancak storefront yalnız next/font ile paketlenmiş Inter (`--font-sans-face`) + Playfair (`--font-serif-face`) yüzlerini yükler. Başka aile isteyen preset güvenli sistem yedeğine düşer. Dinamik @font-face / Google Fonts yükleme (ve CSP) ileri faz.
- **TD-082 — Theme Studio editörü token'ların ÇEKİRDEĞİNİ kapsar (motor tümünü destekler).** UI bugün renk grupları (brand/surface/text/border/feedback) + köşe (sm/md/lg) + başlık/gövde font ailesi + rollback + import/export sunar. Gölge/motion/layout/z-index/breakpoint token'ları ve semantic/component katmanı doğrudan-düzenleme + variant seçici UI'da YOK (belge motoru + import/export ile düzenlenebilir). Genişletme drop-in (Çalışma Sınırı; brief "UI hepsini desteklemek zorunda değil, mimari desteklemeli").
- **TD-083 — Component variant'ları KATALOG + belge alanı olarak var; storefront variant-bazlı render UYGULAMAZ.** `COMPONENT_VARIANTS` + `components[x].variant` mimariyi taşır; ancak storefront bileşenleri (button/card/hero…) seçili variant'a göre farklı layout render ETMEZ (yalnız token değerleri uygulanır). Variant-duyarlı bileşen implementasyonu ileri faz.
- **TD-084 — Live Preview = izole örnek panel; gerçek storefront iframe önizlemesi değil.** Theme Studio istemci-tarafı @commerce-os/theme ile temsili bir bileşen panelini anlık render eder (hızlı, round-trip'siz). Taslağı gerçek storefront'ta (draft token'larla, publish etmeden) görmek için scoped iframe/preview-token akışı YOK. `GET .../preview` ucu CSS döndürür (iframe altyapısına hazır). İleri faz.
- **TD-085 — Custom CSS sandbox v1 REGEX-tabanlı savunma; tam scoped-nesting/allowlist ayrıştırıcı değil.** `sanitizeCustomCss` bilinen tehlike sınıflarını (style-tag kaçışı, @import, javascript:, expression(), behavior, -moz-binding) kaldırır ve boyut sınırlar; ancak tam CSS parse + selector allowlisting + otomatik scoping yapmaz. Ayrıca Theme Studio UI'da custom CSS editörü YOK (yalnız backend + import belgesi taşır). Gerçek CSS AST sandbox ileri faz.
- **TD-086 — Theme seed/persist yalnızca enterprise-demo scope'unda; ayrıca TD-079 wipe-reseed sınırı Theme tablolarını da kapsar.** `Theme`/`ThemeVersion` seed'i wipe+recreate ile enterprise-demo'ya yazılır; başka mağazalar için otomatik varsayılan tema PROVİZYONU YOK (tema yoksa vitrin paketli varsayılana düşer — güvenli). Ayrıca sipariş varken tam re-seed TD-079 nedeniyle yarıda kalırsa Theme satırları da yazılmaz (Product.deleteMany önce patlar). Store oluşturulurken otomatik varsayılan tema provizyonu ileri faz.

## TODO-158C (ADR-088) — Enterprise Storefront Redesign Faz 1 sınırları (TD-087…TD-090)

- **TD-087 — Legacy `ui/product-card.tsx` + `components/product-card.tsx` artık CANLIDA ÖLÜ (yalnız test).** PDP benzer-ürünler token'lı `StorefrontProductCard`'a taşındı; PLP canlı kartı `search/search-product-card.tsx`. İki legacy slate/brand kart (`components/ui/product-card.tsx`, `components/product-card.tsx`) uygulamada hiçbir yerde render EDİLMEZ; yalnız `product-card.test.tsx` / `product-card-plp.test.tsx` onları ayakta tutar. Silinmedi (fiyat/CTA semantiği testleri kaybolmasın); temizlik = ayrı iş (kartı token'lı sürüme migrate eden test + dosya kaldırma).
- **TD-088 — Kategori mega-menü + PLP kategori şeridi FEATURED_CATEGORIES'e piggyback yapar (adanmış public kategori-nav ucu yok).** Public bir kategori-AĞACI ucu yayınlanmadığından (admin uçları auth arkasında; search facet'leri kategori değil) header mega-menü ve `CategoryChips` yalnız admin'in seçtiği FEATURED_CATEGORIES'i gösterir — TAM kategori taksonomisini değil. Ayrıca her PLP/layout render'ında `getHome` (tüm section'lar + showcase ürünleri) çekilir (cache'li → istek başına tek çağrı, ama hafif değil). Çözüm: hafif public `GET /public/stores/:slug/nav-categories` (yalnız kategori ağacı) — search iş mantığına dokunmadan ayrı faz.
- **TD-089 — Managed Campaign Block / Promo Banner / Editorial home SECTION TİPLERİ eklenmedi.** ADR-086 polimorfik `HomeSection` (String type + JSON config) bunları migration'sız destekler; ancak bu faz yeni section tipi eklemedi. `ValueProps`/`EditorialBanner` sunum bileşenleri yalnız FALLBACK home'da (section yapılandırılmamış mağaza) kullanılır; yönetilen home'a admin'den eklenemez. Gateway compose + admin editör + renderer wiring = ayrı faz.
- **TD-090 — Footer sosyal linkleri MOCK; ödeme yöntemleri statik.** "Bizi takip edin" ikonları (Instagram/X/YouTube) presentational `<button>` placeholder'dır — gerçek hesap URL'i yok (bülten formu gibi MOCK). Ödeme şeridi (VISA/MASTERCARD/TROY) statik metin pill'dir. Store settings sosyal/ödeme alanları geldiğinde `<a href>` + gerçek yöntem listesine drop-in yükseltilir. Ayrıca overlay/hero-yükseklik token'ları globals.css'te tanımlı ama Theme Engine semantic KATMANINA henüz yayınlanmıyor (tema custom-CSS ile override edebilir; belge-token emisyonu ayrı faz).

## TODO-159A (ADR-089) — Admin Data Grid sınırları (TD-091…TD-095)

- **TD-091 — ~~`GET /stores/:id/inventory/matrix` SINIRSIZ; Envanter ekranı hâlâ tamamen istemci-taraflı.~~ KAPANDI (TODO-159C / ADR-092, 2026-07-23).** Uç artık ortak Data Grid sözleşmesini konuşuyor: `page`/`pageSize`(≤100 sunucu-otoriter tavan)/`search`/`sortBy`(allowlist)/`sortOrder` + `warehouseId`/`stockStatus`/`reserved`/`variantStatus`/`productStatus` filtreleri; yanıt `warehouse` + bir SAYFA `rows` + gerçek `adminListPaginationSchema` meta'sı + sayfadan BAĞIMSIZ `summary` taşıyor. `listStoreVariants` sınırsız `findMany`'den tek raw SQL CTE taramasına (LIMIT/OFFSET + aggregate özet + sayfa-id'leri için attribute hidrasyonu; sabit 3 sorgu, N+1 yok) taşındı. Çift otorite (ADR-076: default depoda InventoryItem overlay) SQL'de birebir korundu; `available`/durum türetmesi SAF calculator ile aynı eşikleri kullanır (satır `currentCalc` yine JS `computeCalc` ile — tek formül otoritesi). `/inventory` ekranı `useDataGridQuery` + `DataGridToolbar`/`DataGrid`/`DataGridPagination` kullanır; KPI'lar server `summary`'sinden (aktif filtreyle tutarlı). Additive `ProductVariant(storeId, status)` indeksi eklendi (migration `20260723120000`). Canlı doğrulama enterprise-demo (edm-store, 2138 non-archived varyant) ile: sayfa taraması 5.7 ms (top-N heapsort → yalnız 25 satır), payload 819 KB → 9.7 KB (~84×), `stockStatus=LOW_STOCK` filtre sayısı summary.lowStock ile birebir (187), tenant sızıntısı 0, non-default depoda item overlay uygulanmadı. Dashboard KPI özeti de artık matrisin `summary`'sinden gelir (eski "ilk sayfa" hesabı kapandı). **Kalan sınırlar: TD-099, TD-100 (yeni borç DEĞİL, uygulanmış tasarım sınırları).**
- **TD-092 — Sayfalamasız koleksiyon uçları (`campaigns`, `attributes`, `attribute-groups`, attribute `options`, `home/sections`, `hero-slides`, `themes`, `shipping/rate-plans`, `shipping/providers`, `payment-providers`).** Bu uçlar `{ data: [...] }` döner; `pagination` meta'sı YOKTUR, dolayısıyla ortak Data Grid'e (toplam kayıt + aralık göstergesi) doğrudan bağlanamazlar. Bugün kümeler küçük olduğu için işlevsel bir sorun görünmüyor; ancak sözleşme büyümeye kapalıdır ve her biri response şeması değişikliği + istemci güncellemesi gerektirir. Kampanya ve attribute-option listeleri ilk taşınacaklar olmalı (gerçekçi büyüme sırası). Ayrıca müşteri listesindeki sıralama allowlist'i `orderCount`/`totalSpent` gibi TÜRETİLMİŞ (aggregate) alanları içermez — bunlar ürün fiyat/stok sıralamasındaki gibi ayrı bir SQL yolu gerektirir.
- **TD-093 — ~~Ürün/kategori SEÇİCİLERİ hâlâ ilk 100 kayıtla sınırlı.~~ KAPANDI (TODO-159B / ADR-090, 2026-07-22).** Ortak `EntitySelectorField`/`EntitySelectorModal` ailesi ve `products/selector` + `categories/selector` uçlarıyla çözüldü: seçiciler artık sunucu-taraflı arama + sayfalama yapar, seçili kayıtlar `?ids=` çözüm moduyla SAYFADAN BAĞIMSIZ getirilir (kaçıncı sayfada olduğu önemsizdir). Taşınan yüzeyler: kampanya ürün+kategori kapsamı, Home Showcase, Home öne çıkan kategoriler, ürün formu kategori ataması (★ ana kategori dahil), ürün listesi kategori filtresi, kategori ebeveyn seçici + liste ebeveyn adı çözümü. Canlı doğrulama enterprise-demo (471 ürün) ile yapıldı: alfabetik olarak son sıradaki ürün aranıp seçildi, kaydedildi ve yeniden açıldığında korundu. **Kalan (yeni borç DEĞİL, TD-094'ün kapsamında):** seçici araması da `ILIKE '%term%'` kullanır.
- **TD-094 — Ürün araması `ILIKE '%term%'`; trigram indeksi YOK.** Admin arama başlık/slug/marka/tedarikçi + varyant SKU/barkod üzerinde önek DEĞİL, içerik araması yapar; bu desen B-tree indeksinden yararlanamaz (471 üründe sorun değil, 100k üründe sequential scan). LIKE metakarakterleri kaçırıldığı için kontrolsüz wildcard riski YOK, `pageSize` tavanı da yanıt boyutunu sınırlar; sorun yalnız tarama maliyetidir. Çözüm: `pg_trgm` + GIN indeksi (search read-model'de zaten kullanılıyor) veya admin aramasını `ProductSearchDocument` read-model'ine bağlamak. İkincisi daha güçlü ama DRAFT/ARCHIVED ürünlerin indekslenme politikasını netleştirmeyi gerektirir. Ayrıca `title` sıralaması `LOWER(title)` kullandığı için mevcut B-tree indeksinden yararlanamaz (expression index ayrı karar).
- **TD-095 — ~~Medya kütüphanesi sabit 100 kayıtla sınırlı ve pagination meta'sı YANILTICI.~~ KAPANDI (TODO-159B / ADR-090, 2026-07-22).** `GET /stores/:id/media` artık ortak Data Grid sözleşmesini konuşuyor: `page`/`pageSize`/`search`/`context`/`sortBy`/`sortOrder` + `?ids=` çözüm modu; yanıt gerçek `page/pageSize/totalItems/totalPages` taşıyor (legacy `limit/offset/total` KORUNDU). Kütüphane modalı ortak `DataGridPagination` çubuğunu kullanıyor. `MediaAsset(storeId, createdAt)` indeksi eklendi (migration `20260722190000`); 60k satırlık ölçümde plan Seq Scan + top-N sort'tan (7.5 ms / 1549 buffer) Index Scan Backward'a (0.07 ms / 11 buffer) döndü. Canlı doğrulama: 139 medya kaydıyla `page=1/page=2` kesişimi 0, birleşim tam; 100. kaydın ötesindeki görsel `ids` ile çözüldü, başka mağazanın id'si çözülmedi.

## TODO-159B (ADR-090) — Admin Searchable Selector sınırları (TD-096…TD-098)

Aşağıdakiler TODO-159B'de BİLİNÇLİ olarak yapılmadı. Hiçbiri veri kaybı ya da yanlış
sonuç üretmez; her biri ölçek ya da kapsam sınırıdır.

- **TD-096 — Medya araması `ILIKE '%term%'`; `altText` dışında aranabilir alan YOK.** `MediaAsset` modelinde kullanıcıya görünen tek metin `altText`'tir (nullable); `storageKey` sunucu üretimi opak bir yoldur ve ADR-065 allowlist'i gereği response'a hiç çıkmaz. Sonuç: (a) `altText` girilmemiş görseller arama ile BULUNAMAZ — yalnız sayfalama/sıralama ile erişilir, (b) arama deseni B-tree indeksinden yararlanamaz (TD-094'ün medya karşılığı). Doğru çözüm ikili: kullanıcıya görünen bir "dosya adı" alanı eklemek (yükleme anında orijinal dosya adından türetilir) + `pg_trgm` GIN indeksi. Medya kümeleri ürün kataloğundan çok daha küçük olduğu için tarama maliyeti bugün hissedilmiyor. **Öncelik: DÜŞÜK-ORTA.**
- **TD-097 — Medya picker'da "kullanım alanı" (context) filtresi YOK; bağlam çağırana kilitlidir.** Kütüphane modalı hangi bağlam için açıldıysa (PRODUCT/CATEGORY/HERO/BRANDING) yalnız onu gösterir. Bu bilinçlidir: kullanıcıya bağlam seçtirmek, gateway'in cross-context bağlama guard'ının (`assertMediaAttachable`) reddedeceği seçimler üretirdi. Ancak projede AYRI bir "Medya Kütüphanesi" EKRANI olmadığı için bugün görselleri bağlamdan bağımsız gözden geçirmenin (ve toplu silmenin) bir yolu da yok. Böyle bir ekran eklenirse context filtresi orada anlamlıdır. **Öncelik: DÜŞÜK.**
- **TD-098 — Seçici satırındaki fiyat/stok özeti sayfa başına iki ek LATERAL join ile hesaplanır.** `products/selector` her satır için (a) aktif varyant toplamları, (b) en ucuz aktif varyant satırını çeker; kapak görselleri ayrı bir batched sorgudur. Enterprise-demo'da (471 ürün / 2202 varyant) tam sorgu 4.96 ms sürüyor ve tüm join'ler mevcut indeksleri kullanıyor (`ProductVariant_productId_idx`, `InventoryItem_variantId_idx`) — yani N+1 YOK. Yine de bu değerler `ProductSearchDocument` read-model'inde zaten snapshot'lanmış durumda; seçiciyi read-model'e bağlamak sorguyu tek tabloya indirir. Bunun ön koşulu DRAFT/ARCHIVED ürünlerin indeksleme politikasının netleşmesidir (TD-094 ile AYNI ön koşul). **Öncelik: DÜŞÜK.**

## TODO-159C (ADR-092) — Inventory Matrix sınırları (TD-099…TD-100)

Aşağıdakiler TODO-159C'de BİLİNÇLİ olarak ertelendi. Hiçbiri veri kaybı ya da yanlış
sonuç üretmez; her biri uygulanmış bir tasarım sınırıdır.

- **TD-099 — Envanter matrisinde ürün-facet filtreleri (kategori/marka/tedarikçi) YOK.** Matris varyant-stok merkezlidir; bu faz filtre olarak `warehouseId`/`stockStatus`/`reserved`/`variantStatus`/`productStatus` ekledi (hepsi tenant-safe, gerçek). Kategori/marka/tedarikçi eklenmedi çünkü bunlar ürün-seviyesi facet'lerdir (kategori için `ProductCategoryAssignment` EXISTS join'i, marka/tedarikçi için `Product` kolon eşitliği + DISTINCT açılır kaynağı gerekir — ürün listesindeki `listProductFilterOptions` ile aynı desen). Eklemek TAMAMEN ADDITIVE'tir: `Product p` zaten join'li olduğundan `buildStoreMatrixScan` base WHERE'ine birkaç koşul + contract/BFF allowlist/UI filtre tanımı yeter. Bugün stok filtreleri (durum/rezerve/depo) operasyonel ihtiyacı karşıladığı için ertelendi. **Öncelik: DÜŞÜK-ORTA** — çok markalı büyük katalogda "marka X'in stoğu" sorgusu istenince.
- **TD-100 — Stok durumu/`available` türetmesi SQL'de VE JS'te iki kez ifade edilir (parite testle korunur, tek kaynaktan ÜRETİLMEZ).** Filtre (`stockStatus`/`reserved`) ve sıralama (`onHand`/`reserved`/`available`) sunucu-taraflı yapılabilmesi için `buildStoreMatrixScan` CTE'sinde `available = onHand−reserved−safetyStock`, `sellable = max(·,0)` ve durum CASE'i SAF `availability.ts`/`calculator.ts`'in birebir SQL transkripsiyonudur. Gösterilen satır `currentCalc` yine JS `computeCalc` ile hesaplanır (tek gösterim otoritesi); ancak formül İKİ dilde yaşar. Bugün risk düşüktür: contract testleri + calculator birim testleri tüm dalları kapsar ve canlı doğrulamada summary durum sayıları toplam varyantla tutarlı çıktı (parite). İdeal çözüm formülü tek bir yerde (örn. generated SQL fragment veya materialized computed column) tutmaktır; `available`'ın materialize edilmemesi ADR-076 kararıdır (türetilir). Divergence oluşursa filtre/sıralama gösterilen durumdan sapabilir — bu yüzden formül değişince İKİ yer birlikte güncellenmeli. **Öncelik: DÜŞÜK** (yapısal not; aktif risk değil).

## TODO-159D (ADR-093) — Customer Lists & Wishlist sınırları (TD-101…TD-105)

- **TD-101 — Kısmi unique index'ler Prisma şemasında YOK; yalnız migration SQL'inde.** İki invariant (tek
  default WISHLIST + bütün-ürün öğe dedup) `WHERE`-koşullu kısmi unique index'lerle DB'de zorlanır ancak
  Prisma şema dili kısmi index ifade edemez. Bu yüzden `prisma migrate dev` bunları "drift" olarak görebilir
  (tıpkı TODO-152'deki partial-index tuzağı gibi). Proje elle-yazılan migration + `migrate deploy` (diff
  YAPMAZ) kullandığından üretimde/CI'da sorun yok; sadece yerel `migrate dev` çalıştıran geliştirici drift
  uyarısı görebilir. Çözüm: Prisma partial-index desteği gelince şemaya taşımak veya `migrate dev` yerine
  hep hand-authored akış. **Öncelik: DÜŞÜK** (yapısal; işlevsel risk yok — invariant DB'de gerçek).
- **TD-102 — Özel liste isim tekilliği yalnız SERVİS katmanında (DB unique DEĞİL).** Aynı müşterinin aynı
  isimli (case-insensitive) ikinci özel listesi `findListByNameCI` kontrolüyle reddedilir (409); ancak eşzamanlı
  iki istek teorik olarak yarışıp iki aynı-isimli liste yaratabilir. DB unique eklenmedi çünkü default wishlist'in
  adı lokalize/sabit ve i18n'e tabidir (isim DB'de sabit "Favorilerim" tutulur, gösterimde çevrilir) — global
  isim unique'i bunu ve gelecekteki lokalize adları kırardı. Pratikte çift-liste yarışı zararsızdır (kullanıcı
  silebilir). **Öncelik: DÜŞÜK.**
- **TD-103 — Liste öğesi uygunluk/stok türetmesi cart otoritesinin TAZE bir transkripsiyonu (TD-100 ile aynı
  sınıf).** `customer-lists/routes.ts` `hydrateItems` `available=onHand−reserved`, `inStock`, `AVAILABLE/
  OUT_OF_STOCK/UNAVAILABLE` mantığını `buildPublicCartLine`/`isPublicPriceVisible` ile BİREBİR eşleyecek şekilde
  yeniden yazar (tek fonksiyondan türetmez). Bugün risk düşüktür: batch-add-to-cart + list-detail testleri üç
  durumu da kapsar ve gerçek sepet yazımı yine cart resolve otoritesinden geçer (nihai stok kontrolü orada).
  Divergence oluşursa liste-detay rozeti sepet davranışından sapabilir; formül değişince iki yer güncellenmeli.
  İdeal: uygunluk hesabını paylaşılan SAF bir modüle çıkarmak. **Öncelik: DÜŞÜK.**
- **TD-104 — Liste öğesi yeniden sıralama UI'ı YOK (`sortOrder` alanı hazır).** `CustomerListItem.sortOrder`
  şemada mevcut ve liste sorgusu `sortOrder ASC, addedAt DESC` sıralar; ancak sürükle-bırak/manuel sıralama
  arayüzü ve bunu yazan uç eklenmedi. Öğeler bugün eklenme sırasında görünür. Eklemek additive: bir
  `reorder` ucu + UI. **Öncelik: DÜŞÜK.**
- **TD-105 — Store Admin'de liste YÖNETİM ekranı YOK; yalnız salt-okunur özet.** MVP kararı: müşteri detayında
  yalnız asgari sayaç/tarih (liste sayısı, wishlist öğe sayısı, son eklenen) gösterilir (gizlilik: öğe içeriği/
  davranış takibi yok). Admin'in müşteri listelerini görüntüleme/düzenleme ekranı bilinçli olarak roadmap'e
  bırakıldı (kapsam büyümesi). Veri modeli + `list-summary` ucu hazır olduğundan ileri faz yalnız UI ekler.
  **Öncelik: DÜŞÜK** (ürün kararı; teknik borç değil, kapsam sınırı).

## TODO-159E (ADR-094) — Product Reviews & Ratings sınırları (TD-106…TD-108)

Aşağıdakiler TODO-159E'de BİLİNÇLİ olarak ertelendi. Hiçbiri veri kaybı ya da yanlış sonuç üretmez;
her biri uygulanmış bir tasarım sınırıdır.

- **TD-106 — İade/iptal sonrası yorum/rozet otomatik davranışı YOK (manuel moderasyon).** Yorum
  oluşturulduktan SONRA sipariş iade edilir/iptal edilirse yorum ve `verifiedPurchase` rozeti KORUNUR
  (alışveriş yorum anında gerçekten gerçekleşmişti; geriye dönük "doğrulanmamış" yapılmaz). Yeni yorum
  uygunluğu zaten `paymentStatus=PAID && status!=CANCELLED` istediğinden REFUNDED/CANCELLED sipariş yeni
  yorum DOĞURMAZ. Kötüye kullanım moderasyonla (HIDDEN) ele alınır. Arka planda yorumları yeniden tarayıp
  otomatik gizleyen/rozet düşüren bir job EKLENMEDİ (aggregate churn + karmaşıklık). Bugün risk yok
  (uygunluk sunucu-otoriter; her yeni yorum gerçek satın almadan doğar). İleri faz: tam-iade politikasına
  bağlı otomatik gizleme + net gelir tutarlılığı istenirse. **Öncelik: DÜŞÜK** (ürün kararı).

- **TD-107 — Rating aggregate search read-model'e (`ProductSearchDocument`) denormalize EDİLMEDİ.** PLP/Home/
  Search kartları rating'i AYRI batched uçtan (`/reviews/summary`) alır (wishlist-status deseni; sayfa başına
  TEK çağrı, N+1 yok). Aggregate search dokümanına yazılmadığından **sort-by-rating** ve **rating-facet**
  araması bu fazda YOK. Eklemek TAMAMEN ADDITIVE'tir (ADR-079 §Ek TODO-155.1/155.2 deseni: source→builder→
  persist üçlüsüne `ratingAverage`/`ratingCount` alanı + moderasyon sonrası `reindexProduct` tetikleme).
  Bugün ertelendi çünkü kart summary'si zaten batched çözülüyor ve aggregate eventual-consistency + reindek
  karmaşıklığı MVP dışı. **Öncelik: DÜŞÜK-ORTA** — "en çok beğenilen" sıralaması/filtresi istenince.

- **TD-108 — Review approved/rejected BİLDİRİMİ YOK (notification-service stub).** `services/notification-
  service` 5 satırlık bir stub'tır (mailer/template/dispatch YOK); platform-events bus tanımlı ama hiçbir
  yerde çağrılmıyor. Sıfırdan e-posta/push altyapısı (transport + template + event→dispatch) bu fazın
  kapsamını aşar. Yorum durum değişimleri müşteriye **Account "Değerlendirmelerim"** ekranında gösterilir
  (pull model). Push bildirim ayrı bir roadmap işidir (bildirim altyapısı kurulunca review onay/red event'i
  eklenir). **Öncelik: DÜŞÜK** (kapsam sınırı; UX pull-model ile karşılanıyor).

- **TD-109 — Admin moderasyon ekranında ürün + tarih UI filtresi YOK (sunucu-destekli).** Gateway admin liste
  ucu `productId`/`dateFrom`/`dateTo` filtrelerini ZATEN destekler (contract + data katmanı); ancak ekran UI'ı
  MVP'de yalnız status/rating/verifiedPurchase select filtrelerini + arama + sıralamayı sunar. Ürün filtresi
  ADR-090 entity-selector wiring'i (SelectorPresenter + resolveByIds) gerektirir; tarih aralığı standart Data
  Grid toolbar'ında widget olmadığından (yalnız orders sayfasının bespoke paneli) ertelendi. Eklemek additive
  (UI-only; sunucu hazır). **Öncelik: DÜŞÜK.**

## TODO-159F (ADR-095…100) — Order Payment Recovery & Collection sınırları (TD-110…TD-112)

- **TD-110 — SMTP/gerçek e-posta teslimatı YOK; "Müşteriye Gönder" DEVRE DIŞI (sahte gönderim YOK).**
  `services/notification-service` stub olduğundan gerçek mail altyapısı yoktur. Ship kararı (Seçenek B):
  SAHTE başarı SUNULMAZ. `PaymentNotificationDispatcher.isConfigured=false` (varsayılan log dispatcher);
  bu durumda (a) `POST .../payment-link/email` ucu **501 `PAYMENT_EMAIL_NOT_CONFIGURED`** döner (hiçbir
  attempt/olay mutasyonu yapmaz), (b) Store Admin "Müşteriye Gönder" butonu **disabled** gösterilir +
  açıklama: "E-posta teslimatı henüz yapılandırılmadı. Bağlantıyı kopyalayarak müşteriye iletebilirsiniz."
  Gerçek teslimat için SMTP/provider entegrasyonlu bir dispatcher (`isConfigured=true`,
  `sendPaymentLinkEmail`→SENT/FAILED) enjekte edilir; kontrat + `emailDeliveryConfigured` sinyali + UI
  aksiyonu OTOMATİK devreye girer (kod hazır — Seçenek A yolu). Bağlantı oluşturma/kopyalama/yenileme +
  manuel ödeme tam çalışır. **Öncelik: ORTA.**

- **TD-111 — Gerçek provider (IYZICO/STRIPE/PAYTR/GENERIC_REDIRECT) canlı/sandbox tahsilatı YOK.**
  Ödeme bağlantısı tüm uygun sağlayıcılar için üretilir, ancak müşteri ödeme sayfası (`/pay/:token`)
  yalnız MOCK sağlayıcıda tamamlanır; gerçek sağlayıcı kontrollü hata döner (fake success YOK).
  Webhook state uygulaması gövdedeki `attemptId + status` alanlarına dayanır ve gerçek HMAC imza
  doğrulaması hâlâ placeholder'dır (shipping webhook deseni — `shipping/webhook.ts` — port edilmelidir).
  Gerçek tahsilat için provider adapter'larının `createPayment`/`confirmPayment` HTTP transport'u +
  webhook imza doğrulaması gerekir. **Öncelik: YÜKSEK (canlı tahsilat için ön koşul).**

- **TD-112 — Kısmi tahsilat (partial capture) desteklenmiyor.** Manuel ödeme MVP'de yalnız tam
  tahsilat (`amount === remaining`) kabul eder; kısmi tutar 422 `PAYMENT_PARTIAL_NOT_SUPPORTED` ile
  reddedilir. `PARTIALLY_REFUNDED` enum değeri iade tarafı için rezervedir; kısmi capture/iade akışı
  (birden çok kısmi tahsilat toplamı) uygulanmadı. Kalan bakiye altyapısı (captured toplamı) çoklu
  tahsilata hazırdır; yalnız giriş kapısı tam-tutar zorunlu kılar. **Öncelik: DÜŞÜK.**

## TODO-160 (ADR-102…107) — Influencer Tracking & Attribution sınırları (TD-113…TD-115)

- **TD-113 — Click retention purge worker'ı YOK (KVKK saklama otomasyonu). — CLOSED (2026-07-27, TODO-161A.1).**
  `AttributionClick` ham hash'li verisi için `attribution-event-retention` worker'ı + manuel dry-run/apply
  uygulandı (`INFLUENCER_CLICK_RETENTION_DAYS`=180; ADR-133/135). Finansal snapshot (`OrderAttribution`) +
  iade defteri KORUNUR (ADR-134); yalnız ham click satırları store-scope batch DELETE edilir. Sync-worker
  deseni (ADR-051) + dry-run default + circuit breaker + env gate + QueueJobLog audit. Canlı doğrulama PASS.

- **TD-114 — Canlı KISMI iade → net gelir yolu YOK.** `applyRefund` + `OrderAttributionRefund` defteri
  kısmi tutarları (append-only, idempotent) MATEMATİKSEL olarak destekler ve birim-testlidir; ancak
  net-gelir düzeltmesini tetikleyen CANLI yollar yalnız TAM iade üretir: (a) sipariş iptali
  (`cancel:<orderId>` = gross), (b) payment webhook `REFUNDED` (`refund:<eventId>` = gross). Webhook
  status enum'unda `PARTIALLY_REFUNDED` + tutar taşımadığından (TD-112 hizası, ödeme blast-radius'undan
  kaçınmak için genişletilmedi) canlı kısmi iade net'i düşüremez. Kısmi refund tutarı taşıyan bir
  admin/webhook girişi eklenince `applyRefund(storeId, orderId, refundKey, amountMinor)` DEĞİŞMEDEN
  çalışır. **Öncelik: DÜŞÜK.**

- **TD-115 — Ertelenen influencer özellikleri (MVP kapsam dışı, ADR-091 "sonraki faz").** Kupon↔
  influencer attribution bağı (şimdilik bağımsız ölçülür), multi-touch attribution (yalnız LAST_CLICK),
  komisyon hesabı/ödeme akışı, influencer self-service portalı, gelişmiş fraud scoring (mevcut: bot UA
  + rapid-repeat dedupe + rate-limit). Rate limiter in-memory'dir (tek-proses); çok-instance dağıtımda
  Redis tabanlı limiter gerekir. **Öncelik: DÜŞÜK.**

## TODO-159G (ADR-108) — Demo Data Safety & Recovery (veri kaybı olayı)

- **TD-116 — Enterprise-demo katalog veri kaybı olayı (2026-07-23) + kalan riskler.**
  **Olay:** 2026-07-23 23:36 UTC'de çalışan yerel postgres'e elle yıkıcı `prisma db push`
  (tüm tablolar + `_prisma_migrations` düştü) → 00:03'te yalnız temel `db:seed` koştu →
  enterprise-demo (471 ürün/2202 varyant) + tüm Order/Customer verisi silindi. **Kök neden:**
  politika `db push`'u yasaklasa da kod düzeyinde guard yoktu. **Recovery:** deterministik
  `db:seed-enterprise` (ADR-085) + search backfill; katalog birebir geri geldi (verify 21/21,
  demo-store korundu). **Önleme:** ADR-108 guard'ları (env/scope/circuit-breaker/backup) +
  20 birim + 3 statik-invariant test + 3 canlı guard testi.
  **Kalan borç:**
  - **(a) DB `_prisma_migrations` YOK — şema `db push` ile kurulmuş. ✅ KAPANDI (2026-07-24).**
    Yerel DB migrasyon geçmişi taşımıyordu. Baseline operasyonu (ADR-108, PR #115 merge+deploy SONRASI,
    reset/push/drop KULLANILMADAN) uygulandı: (1) tam custom-format backup + `pg_restore --list` doğrulaması;
    (2) `prisma migrate diff --from-migrations … --to-url <live> --shadow-database-url <shadow>` → **"No
    difference detected"** (DB, 51 migration replay'iyle birebir; tek fark schema.prisma vs ham-SQL tsvector
    gap'i, her migrate edilmiş DB'de mevcut ve beklenen); (3) 51 migration `prisma migrate resolve --applied`
    ile sırayla applied işaretlendi (DDL/veri DEĞİŞMEDİ; yalnız `_prisma_migrations` tablosu eklendi).
    Sonuç: `prisma migrate status` → **"Database schema is up to date!"**, 51/51 applied, 0 rolled-back,
    veri sayıları birebir korundu (verify-enterprise 21/21, storefront smoke PASS). Artık `prisma migrate
    deploy` yolu bu DB'de temiz çalışır; clean-build gerekmedi. **KAPANDI.**
  - **(b) Guard'lar imaj yeniden kurulunca canlıya girer.** Seed api-gateway imajına baked
    kaynaktan koşar; `safety.mjs` değişikliği `docker compose build api-gateway` sonrası etkindir
    (bu görevde rebuild + canlı doğrulama YAPILDI). **Öncelik: DÜŞÜK (belgelendi).**
  - **(c) Sipariş/müşteri/review/wishlist verisi geri getirilemedi (yedek yoktu).** Olay öncesi
    yerel test verisiydi; kalıcı kayıp. Backup guard (`pnpm db:backup`) bundan sonrası için otomatik dump sağlar. **Öncelik: DÜŞÜK.**
  - **(d) Backup guard seed içine gömülü DEĞİL.** `pnpm db:backup` operasyonel adım + `db:restore-enterprise`
    zincirinin ilk halkası; seed'in kendisi rebuild-anında dump almaz (container'da pg_dump yürütmek kırılgan).
    Circuit breaker zaten flag'siz yıkımı durdurduğundan yeterli. **Öncelik: DÜŞÜK.**

## TODO-160A (ADR-109…113) — SKU Generation & Governance sınırları (TD-117…TD-118)

- **TD-117 — Ürün/varyant import sistemi YOK (greenfield).** Repoda ürün/varyant CSV/bulk-import ucu
  yoktur (yalnız shipping rate-plan CSV + influencer export). Bu fazda tam import sistemi KURULMADI;
  bunun yerine saf generator (`@commerce-os/utils/sku`) + collision servisi **import-hazır** tasarlandı ve
  import-side kurallar ADR-113'te sabitlendi: geçerli mevcut SKU korunur · boş SKU AUTO üretilir · duplicate
  satır reddedilir/raporlanır · barcode SKU yerine kullanılmaz · üretilen SKU raporlanır. Import motoru
  yazıldığında bu servisi yeniden kullanmalı (SKU üretimini/collision'ı yeniden yazmamalı). **Öncelik: ORTA.**
- **TD-118 — Docker'da canlı API/UI smoke → KAPANDI (2026-07-24, PR #119 sonrası).** api-gateway +
  store-admin-web `main` (merge commit 4f75b6b) kodundan rebuild/recreate edildi; migration deploy
  "no pending". Gerçek deploy edilen stack üzerinde doğrulandı: **API** — preview (Türkçe→ASCII,
  collision `-002`), validate (geçerli/duplicate/invalid/too-long/cross-store), regenerate (AUTO yazılır,
  MANUAL korunur, force ile ezilir, AuditLog field-level), audit (edm-store 2202 varyant, flagged=0,
  125ms), backfill guardrail (dry-run default, `--apply` için `--store` zorunlu), **boş SKU ile create →
  AUTO üretim** (`MAVI-CEKET`). **UI** — store-admin Otomatik SKU paneli render + Önizle/Yeniden Üret
  uçtan uca (UI→BFF→gateway), Türkçe→ASCII öneri, MANUAL koruma/force, kaynak rozeti, buton enable/disable;
  BFF route'ları guard'lı (401/403, 404/500 yok). **OrderLine snapshot regresyonu** — SKU değişince
  ProductVariant.sku değişti, OrderLine.sku snapshot korundu, inventory/FK bozulmadı. Tüm test verisi
  temizlendi; enterprise-demo bütün (471 ürün / 2202 varyant).

## TD-119 — Sponsored: CPC/CPM bütçe + bidding + günlük harcama limiti + faturalandırma (TODO-161)

**Durum:** Ertelendi (ileri faz; MVP kapsamı DIŞI — ADR-091). MVP sponsorluk bir **self-merchandising**
yerleşim kararıdır; reklam açık artırması/bütçe/CPC/CPM/keyword bidding/günlük harcama limiti/vendor
self-service/faturalandırma YOK. Model ileriye hazır (priority/maxSlots var), ama para akışı yoktur.
Eklenince: kampanyada budget/pricing alanları, harcama sayacı + circuit breaker, açık-artırma sıralaması
(priority yerine bid), fatura entegrasyonu. `ROAS` alanı dashboard'da HAZIR (bütçe olmadığı için
hesaplanmaz).

## TD-120 — Sponsored: ek placement tipleri (PDP / Cart / Checkout upsell) (TODO-161)

**Durum:** KISMEN KAPANDI (follow-up). **Category-PLP artık DESTEKLENİYOR:** kategori gezinme
(`/products?category=…` → search endpoint, keyword'süz) `SEARCH_RESULTS` yerleşimli + hedef-kategorisi
gezilen kategoriyi (subtree) kapsayan kampanyaları enjekte eder. Keyword bağlamı ile kategori bağlamı
AYRIDIR (keyword aramasında kategori-fallback YOK → ilgisiz keyword'de gösterilmez). **Kalan (ertelendi):**
PDP recommendation, Cart/Checkout upsell — ayrı yerleşim yüzeyleri + ölçüm dalları gerektirir.
`SponsoredPlacementType` enum ileriye açık; yeni placement = servis dalı (migration YOK).

**Follow-up düzeltmeleri (aynı fix seti):** (1) sponsorlu kampanya düzenleme formunda başarı sonrası
"Kaydediliyor…" butonunun takılması giderildi (busy `finally`'de sıfırlanır). (2) Home Experience yönetim
ekranına `SPONSORED_SHOWCASE` bölüm tipi eklendi — admin artık ana sayfaya sponsorlu vitrin bölümü
ekleyebilir (önceden HOME_SHOWCASE kampanyası hiç render olmuyordu). (3) Hedefleme (keyword + kategori)
alanları formda YALNIZ `SEARCH_RESULTS` yerleşiminde gösterilir (HOME_SHOWCASE'te gizli — kafa karışıklığı yok).

## TD-121 — Sponsored: fraud/bot skorlama + retention purge (TODO-161)

**Durum:** **retention purge kısmı CLOSED (2026-07-27, TODO-161A.1)** — `SponsoredProductEvent` ham verisi için
`attribution-event-retention` worker'ı + manuel dry-run/apply uygulandı (başlangıç 180 gün,
`SPONSORED_EVENT_RETENTION_DAYS`; dry-run default; ADR-133/135). Finansal snapshot (`OrderSponsoredAttribution`)
+ iade defteri KORUNUR (ADR-134); yalnız funnel event ham'ı store-scope batch DELETE edilir (TD-113 influencer
click retention ile ORTAK SAF purge yardımcıları). **KALAN (AYRI, future):** gelişmiş fraud scoring (davranışsal,
IP reputation) — MVP yalnız bot UA regex + repeat dedupe + rate-limit yapar; bu kısım açık kalır (yeni borç
DEĞİL, orijinal kapsamın devamı).

## TD-122 — Sponsored: canlı UI/e2e smoke (auth'lu store-admin) (TODO-161)

**Durum:** **CLOSED (2026-07-29, H-4).** Sponsored funnel'ın para/güvenlik özü — agreement-gated activation
(`409 AGREEMENT_NOT_ACTIVE`), settlement/charge/payment (avans/mahsup/tahsilat/overpayment, unique-dönem +
FINALIZED-immutable), revenue-share currency guard (same-currency tam sayı; karışık-para fail-closed),
attribution store/campaign/product scope + duplicate/bot-prefetch guard + cross-store reddi + refund/reversal
— gateway entegrasyon suite'leri (`sponsored-*`, `sponsorship-*`, `commercial-automation-*`; 1793 test PASS) +
**canlı deployed gateway/DB smoke** ile doğrulandı: imzalı payment webhook 10/10 (fail-closed 404, unsigned/
wrong-sig/old-ts → 401, amount/currency/reference mismatch → no mutation, monotonic no-rollback, idempotent),
fixture CustomerSession auth (200/401/401), cross-store isolation (401 `CUSTOMER_UNAUTHORIZED`), consume-on-paid
wired (server.ts:4744/:6610), veri bütünlüğü clean-except-legacy. **Residual (kapsam dışı):** store-admin
tarayıcı UI-piksel click-through non-interactive session'da yapılamaz (parola gerekir; [[TD-126]]'nın
kullanıcı-parolalı yöntemi tekrarlanamaz) → Final Enterprise UI Polish + deploy-öncesi manuel kontrol.
Analiz: `docs/analysis/H-4-authenticated-money-sponsored-funnel-smoke.md`.

## TD-123 — Sponsorship: Sponsor↔Influencer birleştirme (TODO-161A)

**Durum:** Ertelendi (ileri faz). MVP'de `SponsorAccount` (reklamveren cari) ve `Influencer`
(TODO-160 iş-ortağı) AYRI modellerdir ve aynı gerçek firmaya işaret edebilirler ama bağlanmazlar
(ADR-091/121). Birleştirme (tek ticari kimlik + iki attribution akışı) ileri faza bırakıldı;
gerektiğinde bir `party`/`organization` üst-tipi + rol tabloları eklenebilir.

## TD-124 — Sponsorship: resmî e-Fatura + muhasebe + çoklu para birimi (TODO-161A)

**Durum:** Ertelendi (ADR-126/127). MVP iç ticari belge (tahakkuk) + tahsilat takibi yapar; resmî
e-Fatura/e-Arşiv üretmez, muhasebe fişi oluşturmaz. Ertelenen: Paraşüt/Logo/Mikro entegrasyonu ·
e-Fatura/e-Arşiv · banka hareketi eşleştirme · otomatik mutabakat · gelir muhasebeleştirme (revenue
recognition) · komisyon faturaları · **çoklu para birimi kur dönüşümü** (şu an REVENUE_SHARE anlaşma
para birimi mağaza siparişleriyle aynı olmalı; farklı para birimleri tek toplamda birleşmez).
- **Launch Audit (2026-07-27) — yanlış kayıt düzeltmesi:** "aynı olmalı" bir invariant gibi yazılmış ama
  kod bunu revenue-share settlement yolunda **uygulamıyor** (guard yok). FX dönüşümü (FUTURE CAPABILITY) ile
  eksik enforcement (finansal-doğruluk guard'ı, HIGH) AYRI şeylerdir → enforcement boşluğu **[[TD-133]]** olarak
  ayrı izlenir. Bu satırın kalanı (e-Fatura/muhasebe/gerçek FX dönüşümü) doğru şekilde ertelendi.

## TD-125 — Sponsorship: otomatik dönemsel settlement zamanlayıcısı (TODO-161A)

**Durum:** **CLOSED (2026-07-27, TODO-161A.1).** `sponsorship-settlement-scheduler` worker'ı + manuel
dry-run/run uygulandı (TODO-129 shipment-sync deseni; ADR-130/131/132/136). Otomatik zamanlanmış **DRAFT**
settlement üretimi: yalnız ACTIVE/COMPLETED + WEEKLY/MONTHLY/CAMPAIGN_END (MANUAL hariç); **otomatik finalize
YOK**; `previewSettlement` reuse (unique-dönem + FINALIZED-immutable) → duplicate imkânsız + idempotent;
timezone-aware dönem (`StoreSettings.timezone`, ADR-132); in-process `withJobLock` overlap koruması;
anlaşma-başına hata izolasyonu; `QueueJobLog` job-run audit. Canlı doğrulama (weekly/monthly/campaign-end +
duplicate + finalized-immutable + error-isolation) PASS. `budgetExhaustedAt` yine yalnız tahakkuk anında
damgalanır (cron gerekmez).

## TD-126 — Sponsorship: canlı auth'lu store-admin UI/e2e smoke (TODO-161A / TODO-161A.2)

**Durum:** KAPANDI (2026-07-27). Auth'lu canlı UI smoke, **gerçek worktree kodu** (deploy YOK; imaj rebuild
YOK) YEREL DEV modunda ayrı portlarda (api-gateway :4100, store-admin :3102) **gerçek migrate edilmiş
PostgreSQL**'e (enterprise-demo, docker postgres/redis) karşı çalıştırılarak yapıldı; kullanıcı store-admin'e
kendi parolasıyla giriş yaptı. 75.000 TL senaryosunun 25 adımı DOĞRULANDI:
- **Menü/IA:** tek "Sponsorluk" grubu (Sponsorlar · Anlaşmalar · **Sponsorlu Kampanyalar** · Mutabakatlar ·
  **Tahakkuk & Tahsilat**); "Sponsorlu Ürünler" adı hiçbir yerde yok; Satış'ta ikinci sponsored menü yok.
- **Agreement-gated activation:** anlaşma PENDING iken SPONSORED kampanya ACTIVE denemesi → `409 AGREEMENT_NOT_ACTIVE`;
  anlaşma ACTIVE + uygun iken aktivasyon başarılı (isLive=true). SUSPENDED → kampanya ticari uygunluğu
  tersine döndü (`AGREEMENT_NOT_ACTIVE`) → teslim guard'ı adaydan düşürür. INTERNAL_PROMOTION muaf.
- **Finans:** 75k FIXED_FEE doğrudan tahakkuk → Kalan ₺75.000; 30k avans → kullanılmamış avans ₺30.000;
  mahsup → Kalan ₺45.000; 20k tahsilat → Kalan ₺25.000; 25k → **PAID**, Kalan ₺0; fazla tahsilat → `400 OVERPAYMENT`.
  Sponsor cari (Tahakkuk/Tahsil/Kalan/Vadesi/Avans sütunu), anlaşma finans rayı, Tahakkuk & Tahsilat ledger
  (avans chargeId=null satır) ve CSV export doğru. İyimser kilit (`expectedRemainingMinor`) + advisory-lock aktif.
- Financial mutasyonlar (avans/mahsup/tahsilat) uygulamanın **kendi auth'lu BFF uçlarıyla** (UI butonlarının
  çağırdığı aynı endpoint'ler; gerçek CSRF + guard + advisory-lock) yürütüldü, sonuçlar UI'da doğrulandı;
  menü/sponsor/anlaşma/kampanya oluşturma + PENDING/ACTIVE geçiş + aktivasyon-guard + tahakkuk butonları
  literal olarak UI'dan tıklandı. Cross-store izolasyonu tenant-scoped sorgular + route testleriyle güvence
  altında (canlı ikinci-mağaza denemesi yapılmadı).
- Smoke sırasında bulunan 3 UI metni düzeltildi (sayfa başlığı "Sponsorlu Ürünler"→"Sponsorlu Kampanyalar";
  "Append-only defter" ve "OVERDUE türetilmiş" jargonları Türkçeleştirildi) ve tüm gate'ler yeniden PASS.

## TD-127 — Operations: auth'lu `/operations` UI click-through smoke (TODO-161A.1)

**Durum:** ✅ CLOSED (2026-07-27). TODO-161A.1 (Commercial Automation & Data Retention) MERGED + DEPLOYED
(commit `a6c607b`, PR #126, merge `36b188b`). Backend, DB, liveness ve auth guard katmanları zaten
doğrulanmıştı (17/17 canlı doğrulama + 42 birim/route testi PASS); kalan tek boşluk **parola gerektiren
gerçek store-admin click-through** idi ve bu doğrulama borcu bu turda **auth'lu gerçek UI üzerinden**
kapatıldı. **Kod defekti bulunmadı → docs-only kapanış.**

**Auth yöntemi (yalnız geçici doğrulama; kalıcı helper/script commit EDİLMEDİ).** TD-131 Faz B'deki
fixture-session tekniği yeniden kullanıldı: token yerelde üretildi, hash (`sha256(token.SESSION_SECRET)`)
gateway container İÇİNDE hesaplandı (secret asla dışarı çıkmaz/loglanmaz/repo'ya yazılmaz), **demo admin +
demo store (edm-store) kapsamlı**, **30 dk TTL** `PlatformSession` eklendi, store-admin cookie'si
(`commerce_os_store_admin_session`) tarayıcıya set edildi. Parola isteme/okuma/loglama YOK. Smoke sonunda
session + tüm fixture kayıtları silindi; temp dosyalar kaldırıldı. Production/staging'de KULLANILMADI.

**Yürütülen doğrulama (deployed store-admin :3002 / gateway :4000, enterprise-demo):**
- `/operations` auth sonrası açıldı; loading (skeleton), empty ("Henüz çalışmadı"), error state'leri;
  **TR + EN** tam doğru (SKIPPED_LOCKED→"Atlandı (zaten çalışıyor)"), çıplak teknik kod/stack YOK.
- **Settlement dry-run:** "İncelenen anlaşma: 4 · Oluşturulan: 0 · Oluşturulacak: 1 · Hatalı: 0" (DRAFT üretmedi).
- **Settlement run:** Oluşturulan DRAFT: 1 (izole kapalı-dönem CAMPAIGN_END anlaşması). Tekrar run → Oluşturulan: 0
  (**existing DRAFT duplicate ÜRETMEDİ**). DRAFT FINALIZED yapıldı + tekrar run → **FINALIZED kayda DOKUNMADI**
  (`finalizedAt`/`updatedAt` değişmedi, yeni settlement yok).
- **Retention dry-run:** "Silinecek kayıt: 2 · Silinen: 0" — yalnız **181 günlük** sponsored + influencer aday;
  179 günlükler ve recommendation event'ler (ayrı domain) sayılmadı.
- **Retention apply:** açık onay modalı (kapsam + kalıcı-silme uyarısı) → "Silinen kayıt: 2". DB doğrulaması:
  181g sponsored + 181g influencer **silindi**; 179g'ler + recommendation event'ler + **FINALIZED settlement /
  agreement (finans) korundu**.
- **QueueJobLog (6 durum) UI'da doğru:** DRY_RUN (Önizleme), COMPLETED (Tamamlandı), SKIPPED_LOCKED
  (Atlandı) canlı üretildi; STARTED (Çalışıyor, geçici) + PARTIAL_SUCCESS (Kısmen başarılı) + FAILED (Hata)
  rozet render'ı servis-şekilli satırla doğrulandı. Tek satır/run (STARTED→terminal update).
- **SKIPPED_LOCKED / concurrent:** harici psql ile dağıtık advisory lock tutulurken UI'dan run tetiklendi →
  gateway **409 JOB_ALREADY_RUNNING** + `QueueJobLog` SKIPPED_LOCKED satırı; işlem yürütülmedi.
- **Güvenlik:** cookie yok → `/operations` **/login'e redirect** (+ gateway 401); yanlış store → **404
  STORE_ACCESS_DENIED**; cutoff/storeId **sunucu-otoritesi** (run body yalnız `dryRun`, storeId slug'dan
  sunucuda çözülür, retention günleri sunucu config'i); apply **açık onay** gerektiriyor; internal 500 →
  generic mesaj (stack sızmıyor).

**Minör gözlem (bloklamayan, defekt değil):** concurrent 409 `JOB_ALREADY_RUNNING` kodu store-admin i18n
sözlüğünde eşlenmediğinden genel "beklenmeyen hata" mesajına düşer (güvenli by-design fallback — ham kod/stack
sızmaz, run doğru reddedilir, tekrar denemede başarılı). İleride özel bir "zaten çalışıyor" kopyası eklenebilir.

## TODO-161B (ADR-137…143) — Recently Viewed & Product Recommendations sınırları (TD-128…TD-130)

- **TD-128 — Öneri şeritlerinde wishlist kalbi no-op → ÇÖZÜLDÜ / CLOSED (2026-07-27, pre-ship hardening).**
  Tüm öneri island'ları (`SimilarProducts`, `RecentlyViewedRail`, `ViewHistorySection`) grid'lerini `WishlistProvider
  initialSavedIds={savedIds}` ile SARAR → wishlist kalbi GERÇEK: mevcut TODO-159D altyapısına bağlı (auth→gateway
  `x-customer-session`, guest→imzalı cookie; `toggleWishlistAction`), optimistic + rollback provider'da. Doğru
  başlangıç durumu için BFF GET yanıtları (`/api/recently-viewed`, `/api/similar`) `getWishlistStatus` ile `savedIds`
  taşır (tek round-trip; auth→gateway batched, guest→cookie kesişimi). Paralel wishlist state YOK; no-op kontrol YOK;
  sahte optimistic YOK. **Kalıntı (TD-128'e bağlı değil):** rating yıldızları öneri kartlarında hâlâ gizli (summaries
  taşınmıyor) — bloklamayan kozmetik; ileride `getRatingSummaries` batched ile eklenebilir.
- **TD-129 — Home "Son İncelediklerin" admin-CMS yapılandırılabilir DEĞİL → ÇÖZÜLDÜ / CLOSED (2026-07-27; ADR-144).**
  `RECENTLY_VIEWED` yeni bir `HomeSection` tipi yapıldı (migration'sız; `type=String`). Admin göster/gizle, diğer
  section'lar arasında sıralama, TR/EN başlık ve `maxItems` yönetir. ADR-141 gerilimi çözüldü: section YALNIZ sunum
  config'i taşır (`/home` cacheable/viewer-agnostic kalır); veri storefront istemcisinde `/recently-viewed` ucundan
  hidrasyon (TODO-161B altyapısı değişmedi). Storefront'taki eski manuel iki sabit render KALDIRILDI (duplicate yok).
- **TD-130 — Recommendation ölçümü (impression/click/add-to-cart + source/placement) → ÇÖZÜLDÜ / CLOSED (2026-07-27;
  ADR-145…148).** AYRI davranış-event domaini: yeni `RecommendationEvent` tablosu (yalnız Store FK; productId plain;
  KVKK HMAC; bot/prefetch satır yazmaz) + `apps/api-gateway/src/recommendation-events/` (public ingest ucu + admin
  funnel özeti + 180-gün retention). Influencer/sponsored tablolarına YAZMAZ; `RETENTION_TABLE_SPECS` allowlist'ine
  DOKUNMAZ (ayrı worker/jobType). source/placement/type ALLOWLIST + sunucu-otoritesi (store/kimlik/zaman/ürün-anchor
  sahipliği). Impression viewport-only (IntersectionObserver %50), click gerçek kart tıklaması, add-to-cart yalnız
  başarılı sepete-ekleme (son-öneri-tıklama attribution, sahte aksiyon yok). Dedupe: impression 30 dk, click 30 sn,
  add-to-cart dedupeKey idempotency. Store-admin görünürlük: `/home/insights` (impression/click/CTR/add-to-cart +
  source/placement kırılımı; tarih/source/placement filtresi). **Not:** order/revenue/multi-touch/ML bilinçli
  kapsam-dışı; gerçek ihtiyaç oluşursa ayrı future faz. **KVKK:** platformda hard customer-deletion akışı YOK
  (yalnız status soft-deactivation); `customerId` FK'siz → KVKK hash + retention + store-Cascade ile karşılanır.
  İleri hard-deletion akışı için testli+hazır erasure primitifi `RecommendationEventData.deleteForCustomer(storeId,
  customerId)` eklendi (henüz bağlı değil; aynı gereklilik FK'siz `SponsoredProductEvent`/`AttributionClick` için).

## TD-131 — Customer Data Erasure Workflow → ÇÖZÜLDÜ / CLOSED (2026-07-27; ADR-149…155)

**Durum:** ÇÖZÜLDÜ (kod + migration + test + canlı doğrulama tamam; commit'e hazır). ADR-148'in öngördüğü
"ileri hard-deletion akışı" tamamlandı. Store-admin müşteri detayında **iki ayrı aksiyon**: `Hesabı Pasifleştir`
(DEACTIVATE → PASSIVE + oturum revoke, geri alınabilir) ve `Kişisel Verileri Sil` (ERASE_PERSONAL_DATA → ERASED
terminal, geri alınamaz). Domain: `apps/api-gateway/src/customer-erasure/` (core/data/service/routes) — dry-run
preview + apply (müşteri-izole advisory lock + tek transaction + kilit-altı ikinci okuma + idempotent) + deactivate.
Silinir: session/credential/token/OTP/IBAN/commPref/address/wishlist(+item)/coupon/recentlyViewed/reviewHelpful +
FK'siz `RecommendationEvent` (deleteForCustomer). Anonimleşir: Customer (name/email/phone/…) + Order temas PII +
OrderAddress + CampaignRedemption.email. Korunur: Order/OrderLine/Payment/redemption mali + `billingTaxId` yasal
kimlik. Review KORU+ANONİM (silinmez; yazar Customer'dan türer; helpfulCount recompute). Guest/cross-store
DOKUNULMAZ. Audit PII-SIZ (ADR-154). Migration `20260727160000_customer_erasure` (additive: `CustomerStatus.ERASED`
+ 3 kolon). **Test:** 25 birim (core/service/data) + 47/47 canlı smoke (gerçek PostgreSQL, enterprise-demo).

## TD-132 — Erasure: yasal-saklama süre-sonu retention purge (TD-131)

**Durum:** AÇIK (2026-07-27). TD-131 erasure, `Order.billingTaxId/billingName/billingCompanyName/billingTaxOffice/
billingTaxNumber` yasal fatura kimliğini **asgari saklama** gereği KORUR (VUK md.253 ~5 yıl; KVKK md.7/GDPR
17(3)(b) yasal yükümlülük istisnası — ADR-151). Tam KVKK/GDPR uyumu için bu alanların **saklama süresi dolduğunda**
otomatik silinmesi/anonimleştirilmesi gerekir. Şu an bu süre-sonu purge YOK (erasure anında bilinçli korunuyor).
**Kapsam (kapatılınca):** sipariş yaşına göre (placedAt + statutoryRetentionDays) yasal-kimlik alanlarını budayan
zamanlanmış retention job (TODO-161A.1 SAF altyapısı + `RETENTION_TABLE_SPECS` deseni reuse; dry-run/apply +
advisory lock + circuit breaker). **ÖN KOŞUL:** saklama süresi ve süre-sonu anonimleştirme politikası **mali
müşavir/hukuk onayıyla** belirlenmeden bu iş BAŞLATILMAZ — süre uygulama kodunun tek başına verebileceği hukuki
bir karar değildir; mevzuat doğrulaması olmadan otomatik purge YAZILMAZ. **Neden borç:** product blocker değil
(erasure kişisel/davranışsal veriyi zaten tam siler); yalnız uzun-vadeli yasal-kimlik yaşam döngüsü boşluğu +
hukuki onay bekliyor. Final enterprise UI/design polish'i bloklamaz.
**Sınıflandırma (Launch Audit 2026-07-27):** yalnız **EXTERNAL DECISION REQUIRED** olarak kalır — kod tarafı
hazır, karar hukukidir.

---

## Launch Readiness Audit bulguları (2026-07-27)

> Kaynak: `docs/analysis/launch-readiness-product-gap-audit.md`. `main` HEAD `03042f3` üzerinde 6 paralel
> salt-okunur kod keşfi. Aşağıdaki kayıtlar denetimde **doğrulanmış** (docs değil kod) gerçek boşluklardır.

## TD-133 — Sponsorship REVENUE_SHARE currency-mismatch guard YOK (finansal doğruluk)

**Durum:** **ÇÖZÜLDÜ (H-2, 2026-07-28, ADR-181…186). CLOSED.** Revenue toplamları artık YALNIZ agreement
currency ile eşleşen attribution satırlarından alınır (`collectBillableMetrics(expectedCurrency)` filtre;
snapshot her zaman tek-para) ve `partitionRevenueCurrencies` (SAF billing-core) karışık-para tespit edince
`previewSettlement`/`finalizeSettlement`/`createChargeFromSettlement`/`createRefundAdjustment` **fail-closed**
olur (`AGREEMENT_CURRENCY_REQUIRED` / `REVENUE_CURRENCY_MISMATCH` / `SETTLEMENT_CURRENCY_MISMATCH`). `getDashboard`
net gelir kovası currency-aware yapıldı (mağaza-currency net'i anlaşma-currency kovasına sessizce ekleme bug'ı
kapandı) + operations `currencyMismatch` özeti. Zamanlanmış scheduler adapter'ı mismatch objesini fail-closed
koda çevirir (otomatik karışık-para settlement üretmez). Karışık-para kayıtlar sessizce dışlanmaz (kısmi
settlement yok); mismatch AuditLog (SYSTEM, PII-free) + store-admin kontrollü uyarı + buton disable. Salt-okuma
tarama: `packages/db/scripts/security/scan-sponsorship-currency.mjs` (`pnpm db:scan-sponsorship-currency`).
**Testler:** 12 SAF currency-guard + 6 route (fail-closed HTTP + dashboard) + 3 persistence-adapter + 1 scheduler
izolasyon. **Canlı smoke (enterprise-demo, izole fixture):** 21/21 PASS — TRY happy-path (preview→finalize→charge
→payment) · karışık-para fail-closed (draft yok, audit yazıldı, TRY+USD birleşmedi) · finalize recheck · USD
payment/advance reddi · cross-store izolasyon · boş currency fail-closed · fixture temizlendi. FX dönüşümü kapsam
dışı → **[[TD-148]]** (FUTURE CAPABILITY). Migration GEREKMEDİ (currency alanları zaten var). Tarihsel kök neden
aşağıda korunur.

`collectBillableMetrics` (`apps/api-gateway/src/sponsorship/data.ts:738-822`) dönemin
`OrderSponsoredAttribution.netRevenueMinor`'unu her satırın `currency`'sini yoksayarak toplar; `previewSettlement`
(`:1563-1626`) `currency: agreement.currency` damgalar ama kontrol etmez. `isSameCurrency` yalnız payment↔charge
(`:2047`), advance↔agreement (`:2183`), advance↔charge (`:2237`), agreement-update (`:1336`) yollarında uygulanır —
**revenue-share↔orders yolunda DEĞİL**. Order currency variant-başına (`server.ts:2311-2312`); `Store`'da currency
alanı yok. ADR-127'nin öngördüğü `assertSameCurrency` helper'ı kodda **yok** (grep 0). **Yanlış kayıt düzeltmesi:**
TD-124 bu enforcement'ı mevcut bir invariant sanar ("mağaza siparişleriyle aynı olmalı") ama uygulanmıyor; bu FX
dönüşümü (FUTURE) DEĞİL, eksik guard'dır. **Bugünkü sınır:** her şey TRY ise latent; karışık-para-birimli variant +
REVENUE_SHARE anlaşma birlikte olduğunda net gelir toplamı yanlış tahakkuk üretir. **Kapsam:** revenue-share
settlement yolunda aynı-currency guard (`400 CURRENCY_MISMATCH`) + karışık-currency dönem tespiti.

## TD-134 — Tema token değerleri sanitize edilmeden `<style dangerouslySetInnerHTML>`'e enjekte ediliyor (stored-XSS / render-break)

**Durum:** **ÇÖZÜLDÜ (H-1, 2026-07-28, ADR-180). CLOSED.** Typed theme token registry + save-time + render-time
savunma ile kapatıldı. Artık token değerleri **serbest CSS değildir**: her token merkezi registry'de
(`packages/theme/src/registry.ts`) bir tiple (COLOR/LENGTH/NUMBER/FONT_FAMILY_PRESET/FONT_WEIGHT/SHADOW_PRESET/
DURATION/EASING) tanımlıdır; değerler parse+range+canonical-normalize ile doğrulanır
(`packages/theme/src/validate.ts`) ve TEK güvenli serializer'dan geçer (`css.ts` `generateCssVariables` her değeri
tipine göre validate eder, geçersizi ATLAR → render-time defense). Bilinmeyen primitive anahtar yayınlanmaz
(`.passthrough()` enjeksiyon yolu kapandı). Save-time: gateway draft/publish/import token doğrulaması +
`THEME_TOKEN_UNKNOWN/INVALID_VALUE/TYPE_MISMATCH/UNSAFE_VALUE` + `THEME_PUBLISH_BLOCKED` (ham payload/regex
response'a dönmez). Font/shadow ham string kabul etmez → preset ID + kanonik allowlist. customCss sanitizer
sertleştirildi (yorum-strip + tüm `<` kaldırma + fixpoint döngü). Store-admin field-level TR/EN + publish-blocked
state. Legacy salt-okuma tarama scripti (`packages/db/scripts/security/scan-theme-tokens.mjs`). **Canlı smoke
(enterprise-demo):** payload DB'ye enjekte → mevcut stack ham breakout servis etti (vuln doğrulandı, 8× DOM
breakout); düzeltilmiş serializer aynı belgede payload'ı düşürdü (`--accent` atlandı, `--paper` sağlam). Testler:
147 theme (validate/registry/custom-css/css) + 6 gateway integration (XSS regression). **Kalan risk:** storefront'ta
CSP yok → derinlemesine savunma için **TD-147**.

## TD-135 — Felaket kurtarma: backup manuel/tek-host/zamanlanmamış + test edilmiş restore YOK (DR)

**Durum:** **ÇÖZÜLDÜ (kod/test/tatbik) — PB-2 CLOSED; PB-3 IMPLEMENTED-BUT-NOT-CONFIGURED (bkz. TD-139).**
`@commerce-os/backup` paketi + api-gateway `database-backup` worker'ı + CLI'lar (`db:backup:run`/`db:restore`/
`db:verify-restore`/`db:backup:retention`) ile: gerçek `pg_dump -Fc` + client-side AES-256-GCM (fail-closed) +
S3-uyumlu offsite (SigV4, private, remote HEAD/checksum doğrulama) + GFS retention + **gerçek `db:restore`** +
izole restore-verification. Manifest secret'siz + PII-sınıflandırmalı. Yanıltıcı `db:restore-enterprise` →
`db:reseed-enterprise` (ADR-166). Uçtan uca **canlı DR smoke** (`infra/scripts/dr-smoke.zsh`): MinIO offsite +
boş postgres, fixture ilişkileri korundu, source dokunulmadı — **PASS** (backup ~0.57s / restore ~1.1s).
84 test (73 paket + 11 api-gateway). ADR-159…166. **PB-2 CLOSED.** Kalan yapılandırma açığı → TD-139.

**Pre-ship hardening (2026-07-28, ADR-167…169):** zamanlama api-gateway `setTimeout`'tan **apps/worker** BullMQ Job
Scheduler'a taşındı (API restart takvimi etkilemez; worker restart paralel timer üretmez; advisory lock impl
`@commerce-os/db`'ye taşındı, job orchestration `@commerce-os/backup`'a); elle SigV4 → **AWS SDK v3** (bounded retry
+ timeout + **https-only**, prod'da HTTP reddedilir); encryption **envelope** version+keyId (rotation-hazır, truncation
tespiti); **manifest HMAC** (kurcalanma → cross-environment/checksum guard atlatılamaz) + restore ortam guard'ı;
`DATABASE_BACKUP_SOURCE_URL` (replica/host-vs-container). Testler **95 paket + worker/health** + **iki canlı smoke**
(`dr-smoke.zsh` data-path + `dr-worker-smoke.zsh` worker-tetikli: COMPLETED + offsite + SKIPPED_LOCKED + Redis
scheduler). PB-2 CLOSED kalır; PB-3 hâlâ TD-139'a bağlı.

## TD-136 — Rezervasyon süre-aşımı / terk-edilmiş sipariş süpürücüsü + orphan DRAFT temizliği YOK

**Durum:** **ÇÖZÜLDÜ (H-3, 2026-07-29, ADR-187…193). CLOSED.** Rezervasyon lifecycle tamamlandı:
`InventoryReservationStatus`'a `EXPIRED` eklendi; `placeOrder` artık `expiresAt=createdAt+RESERVATION_TTL_MINUTES`
(varsayılan 15) yazıyor **ve** kilit altında lazy-expiry ile o varyantın süresi dolmuş rezervasyonlarını bırakıp
oversell kontrolünü scheduler'dan bağımsız DOĞRU tutuyor. Kullanılabilir stok read-time'da
`onHand−reserved+expiredActiveReserved` ile hesaplanıyor (PLP/PDP/sepet; `findExpiredReservedByVariant`) →
süresi dolmuş rezervasyon stoğu azaltmıyor. Ödeme `PAID/AUTHORIZED` → `consumeOrderReservations` (idempotent;
onHand+reserved birlikte düşer, `SALE_COMMIT`); geç-ödeme fail-closed `LATE_PAYMENT_AFTER_EXPIRY` order-event.
Ödeme `CANCELLED`/admin iptal → `releaseOrderReservations` (idempotent, tenant-safe, `releaseReason`);
`PAYMENT_FAILED` retryable → bırakılmaz (TTL halleder). Zamanlanmış `inventory-reservation-expiry` worker'ı
(api-gateway içi, `INVENTORY_RESERVATION_EXPIRY_ENABLED=false` varsayılan; advisory lock + `FOR UPDATE SKIP
LOCKED` + dry-run/apply + circuit breaker + `QueueJobLog`) expired rezervasyonları bırakır/`reconcile` eder,
PLACED+UNPAID siparişleri ve eski orphan DRAFT'ları kontrollü `CANCELLED`'a alır (silmez). Payment-vs-expiry
yarışı: her ikisi de `InventoryItem` satırını `FOR UPDATE` kilitler → serialize; PAID reservasyon expiry
tarafından release EDİLMEZ (reconcile→consume). Salt-okunur reconciliation scan + store-admin görünürlük uçları
(`/stores/:id/inventory/reservations/{status,reconcile,expiry/run}`). Migration `20260729120000` gerçek PG'de
uygulandı; backfill PAID+ACTIVE rezervasyonlara dokunmadı (baseline temiz). 25 birim testi + 18/18 canlı smoke
PASS (enterprise-demo, izole fixture). TD-033'ün atomiklik notu (single-tx create+place) tamamlayıcı olarak açık
kalır (bkz. TD-033). **Kapsam-dışı FUTURE:** çok-depolu dağıtık rezervasyon/waitlist/backorder + refund-on-restock
(ADR-193).

**Pre-ship hardening (2026-07-29, ADR-194…196):** iki mimari düzeltme eklendi. (A) Süpürücü job **api-gateway
runtime'ından ÇIKARILDI** → yeni `@commerce-os/inventory` paketi + `apps/worker` BullMQ consumer + Job Scheduler
(sabit id `inventory-reservation-expiry-schedule`, idempotent upsert → worker restart duplicate üretmez; gateway
restart/deploy takvimi etkilemez). Gateway yalnız manuel expiry/reconcile **enqueue** + status/reconcile-scan sunar;
`setTimeout`/`setInterval` KALMADI. (B) Baseline **PAID/AUTHORIZED + ACTIVE** rezervasyonlar için ayrı kontrollü
**reconcile** servisi (`inventory-reservation-reconcile`): dry-run varsayılan, transaction + `FOR UPDATE SKIP LOCKED`,
qty/line/inventory doğrulama, `SALE_COMMIT` yalnız ACTIVE→CONSUMED geçişinde (duplicate movement yok), belirsiz kayıt
**MANUAL_REVIEW** (mutate etmez). Lock sırası `InventoryReservation`(claim) → `InventoryItem` (ADR-196; deadlock yok).
31 paket testi + 4 worker testi + **13/13 hardening canlı smoke** (PG+Redis; reconcile idempotency, BullMQ scheduler
tek-kayıt, advisory-lock SKIPPED_LOCKED, payment-race reconcile) PASS.

## TD-137 — Payment webhook: sağlayıcı-native imza şeması (PB-1 devamı, EX-1'e bağlı)

**Durum:** AÇIK — EX-1 (canlı ödeme sağlayıcısı) sözleşmesine bağlı. PB-1 (ADR-157) doğrulanmış webhook için
**PLATFORM HMAC** şemasını (`hex(HMAC_SHA256(secret, timestamp.rawBody))`) kullanır ve gerçek sağlayıcıları
webhookSecret'sız fail-closed bırakır. Gerçek sağlayıcı (Stripe/iyzico/PayTR) canlıya alınırken her sağlayıcının
**native imza** doğrulaması (Stripe-Signature `t=…,v1=…`; iyzico/PayTR hash) + native payload→normalized event
adapter'ı eklenmeli. **Kapsam:** provider başına `verifyNativeWebhook(rawBody, headers, secret)` + provider
payload→`{eventId, providerReference, status, amountMinor, currency, occurredAt}` normalize; PB-1 route/invariant/
idempotency altyapısı DEĞİŞMEZ (yalnız doğrulama+parse dalı eklenir). **Not:** yeni yetenek değil, EX-1'in ödeme
otantiklik dilimi. Native imza gelmeden gerçek sağlayıcı webhook'u AÇILMAZ.

## TD-138 — Payment webhook provisioning (token/secret rotate) admin UI (PB-1 devamı)

**Durum:** AÇIK — MEDIUM (operasyonel). PB-1 `PaymentProviderConfig.webhookToken` + `webhookSecretCipher` alanlarını
ekledi; ödeme sağlayıcı config'i için webhook token+secret üreten **admin rotate ucu/BFF/UI** henüz YOK (shipping'in
`.../webhook/rotate` deseni birebir uygulanabilir — `generatePaymentWebhookToken`/`generatePaymentWebhookSecret`
helper'ları hazır). Gerçek sağlayıcı (EX-1/TD-137) canlıya alınana dek webhook tüketicisi olmadığından bloklamaz;
token/secret bugün doğrudan DB'de (veya gelecek rotate ucuyla) sağlanır. **Kapsam:** gateway rotate ucu (audit'li)
+ store-admin ödeme sağlayıcı ekranında "Webhook URL + secret (bir kez göster)" + rotate butonu.

## TD-139 — PB-3: production offsite storage YAPILANDIRILMADI (IMPLEMENTED-BUT-NOT-CONFIGURED)

**Durum:** **AÇIK — PROD BLOCKER (PB-3).** DR pipeline (kod/test/tatbik) tamam ama **gerçek production offsite provider'ı
yapılandırılmadı** ve gerçek production ortamından en az bir remote backup doğrulanmadı. Yalnız izole
MinIO/local adapter smoke'u var (`dr-smoke.zsh` PASS). PB-3 ancak (a) production `.env`'inde gerçek
S3-uyumlu provider (bucket/region/key/secret + encryption key repo-dışı) yapılandırılınca **ve** (b) production
ortamından alınan en az bir remote backup `db:verify-restore` ile doğrulanınca CLOSED olur. O zamana dek
**PB-3 OPEN / launch blocker (offsite yapılandırma)**. Durumu olduğundan iyi gösterme: local/MinIO smoke ≠
production offsite. **Kapsam (operatör):** provider seç + bucket (private + versioning öner) + secret yönetimi
+ ilk production backup + doğrulama + izleme.

## TD-140 — DR backup yalnız Postgres; `media-data` volume kapsam dışı

**Durum:** AÇIK — DÜŞÜK/ORTA. DR backup yalnız PostgreSQL'i (tam logical) yedekler; yüklenen görsellerin tutulduğu
`media-data` named volume (`/app/uploads`) DR pipeline'ına dahil DEĞİL. Host/volume kaybında görseller kaybolur
(DB'deki storageKey'ler kalır ama dosya yok). **Kapsam:** medya volume'ünü ayrı bir offsite senkron/backup'a bağla
(object storage'a mirror ya da düzenli tar+offsite). Görseller yeniden-üretilemez veri olduğundan launch öncesi
değerlendirilmeli. ADR-159 kapsam notu.

## TD-141 — Zamanlanmış restore-verification izole hedef DB provizyonu gerektirir

**Durum:** AÇIK — DÜŞÜK. `DATABASE_BACKUP_VERIFY_AFTER=true` her zamanlanmış backup sonrası restore-verification
koşar ama bunun için ayrı bir **izole/atılabilir PostgreSQL hedefi** (`DATABASE_BACKUP_VERIFY_TARGET_URL`)
provizyonlanmalı. Target yoksa doğrulama atlanır (log uyarısı; sessiz değil). Periyodik otomatik doğrulama için
ephemeral bir postgres (ör. ayrı container/instance) + reset döngüsü kurulmalı. Manuel/`dr-smoke.zsh` doğrulaması
bu boşluğu kapatır (izole stack'i kendi kurar). **Kapsam:** production'da ephemeral verify-target orkestrasyonu.

## TD-143 — Influencer lifecycle canlı smoke — ✅ CLOSED (2026-07-28)

Influencer Campaign Lifecycle fazı KOD + MIGRATION + birim/route testleri tamam; ancak §17 canlı smoke (3 kampanya + farklı
UTM + click/order üretimi + PAUSED→terminal + ACTIVE→çalışır + REVOKED→çalışmaz + CANCELLED→conversion yok + cross-store)
docker stack rebuild gerektirdiğinden bu turda ÇALIŞTIRILMADI. Migration gerçek PG'ye uygulanıp doğrulandı; data-layer
+ 39 yeni birim/route testi yeşil. Commit sonrası izole test influencer'da uçtan-uca smoke koşulmalı.

## TD-144 — Currency-aware UTM analytics — ✅ CLOSED (2026-07-28)

`campaignAnalyticsResponse.utm[].netRevenueMinor` toplam net; UI'da `summary.currency` (birincil) etiketiyle gösterilir.
Çok para birimli kampanyada UTM satırı per-currency ayrıştırmaz (link/kampanya seviyesi ayrıştırır). Tek para birimli
mağazada (varsayılan) doğru. Gerekirse UTM sorgusu currency GROUP BY ile genişletilir.

## TD-145 — Tracking link formu UTM/customLabel alanları — ✅ CLOSED (2026-07-28)

`utmContent/utmTerm/customLabel` şema + DB + API'de mevcut ve raporlarda gösterilir; ancak store-admin `LinkFormModal`
create formu yalnız source/medium/campaign topluyor. Yeni alanlar API üzerinden set edilebilir; UI form alanları eklenmeli.
UTM immutable (ADR-175) olduğundan yalnız create formunda.

## TD-146 — Kampanya/link günlük zaman serisi grafiği — ✅ CLOSED (2026-07-28)

`daily` zaman serisi API yanıtında döner; kampanya/link detay sayfaları KPI + tablo (link/UTM/son sipariş) gösteriyor ama
günlük click/order/revenue serisini GRAFİK olarak render etmiyor (chart bileşeni ertelendi). Veri hazır; sparkline/line
chart eklenebilir.

**KAPANIŞ (2026-07-28, ADR-177…179):** TD-143/144/145/146 Analytics Demo Completion fazında kapatıldı. Currency-aware UTM (source/medium/campaign/content/term+customLabel, per-currency `revenues[]`, unique+CR); günlük zaman serisi bağımlılıksız inline-SVG grafik (7/30/90/özel, store-tz gün sınırı, zero-fill, link/UTM filtre, tooltip/legend/empty/a11y); tracking link formu 6 UTM/label alanı (trim+empty-to-null+max120+kontrol-karakter reddi+TR/EN+immutable ipucu); deterministik demo fixture (`influencer-demo-seed.mjs`) + runbook. Data-layer smoke gerçek PG'ye karşı PASS; birim testleri (analytics-range 10 + serialize currency 6 + lifecycle 23) yeşil.

## TD-147 — Storefront CSP hardening (inline `<style>`/`<script>` için nonce/hash)

**Durum:** AÇIK — MEDIUM (derinlemesine savunma; H-1 ana çözümü DEĞİL). Kod tabanında **hiç
Content-Security-Policy başlığı yok** (`grep Content-Security-Policy` → 0 sonuç). Storefront tema CSS'ini
`<style id="commerce-os-theme" dangerouslySetInnerHTML>` ile enjekte eder; JSON-LD ve Next runtime de inline
`<script>` kullanır. H-1 (ADR-180) typed token registry + serializer ile stored-XSS'i **kaynağında** kapattı
(CSP'ye bağlı değil) — bu yüzden bu borç MEDIUM. Ancak bir CSP (`style-src`/`script-src` nonce veya hash,
`default-src 'self'`, `object-src 'none'`, `base-uri 'self'`) gelecekteki sink'lere karşı ikinci bir kat sağlar.
**Kapsam:** inline `<style>`/`<script>`'lere nonce/hash; `unsafe-inline` KULLANMA (kullanılırsa ayrı borç olarak
işaretle); Next.js `headers()`/middleware ile uygula; report-only aşamasıyla başla. Bu, H-1'i büyük bir CSP
yeniden tasarımına dönüştürmemek için ayrıştırıldı (bkz. `docs/analysis/H-1-theme-token-stored-xss.md` §11).

## TD-148 — Sponsorship çok-para (FX) settlement — FUTURE CAPABILITY (borç değil)

**Durum:** AÇIK — FUTURE CAPABILITY (teknik borç DEĞİL; ADR-186). H-2 guard'ı farklı para birimlerini tek hesapta
**birleştirmeyi reddeder** (fail-closed) — kur dönüşümü yapmaz. Bugün gerçek çok-para ihtiyacı yok (mağaza pratikte
tek-para; enterprise-demo tümü TRY). Eğer ileride bir anlaşma farklı para birimli siparişlerden gelir paylaşımı almak
zorunda kalırsa, bu ayrı bir **FX conversion engine** yeteneğidir: dönem+currency bazında ayrı revenue bucket,
güvenilir kaynaktan kur (snapshot'lanmış rate, audit'li), currency-başına ayrı charge veya settlement anında dönüşüm
kararı. **Kapsam (gelecekte):** rate source + snapshot + rounding politikası + currency-başına settlement satırı; mevcut
fail-closed guard'ı bu yetenek gelene kadar OTORİTE olarak kalır. Bunu bir eksiklik gibi ele ALMA — bilinçli sınırdır.

## TD-149 — TODO-162 Katman B viewer-specific resolver + endpoint (2026-07-30) — CLOSED

**Durum:** CLOSED (2026-07-30). `POST /public/stores/:storeSlug/home/discovery` CANLI (server.ts). Kimlik
SUNUCU-türevi (customer session + store-scoped visitorHash; customerId/storeId override body'de KABUL EDİLMEZ —
`.strict()` schema); `Cache-Control: private, no-store` + `Vary`. Eligibility motoru + page-level dedupe (seen-set);
yalnız eligible section + public-safe projeksiyon (reason/customerId/visitorHash/iç config/cost SIZMAZ). 8 data-access
yolu (`home/discovery-data.ts`, mevcut modüller REUSE): CONTINUE_BROWSING · CART_RECOMMENDATIONS (cart-anchor→rankSimilar,
cart ürünleri hariç) · PERSONALIZED_DEALS (sinyal ürünleri × gerçekten-indirimli) · DAILY_DEALS (CAMPAIGN rule) ·
REPURCHASE (paid+active) · SIMILAR_TO_PURCHASED (satın-alınan anchor→rankSimilar) · WISHLIST_DEALS (indirimli wishlist) ·
SPONSORED_RAIL (mevcut sponsored home candidates + token). DISCOVERY_GRID (min2/max4). Orkestrasyon saf çekirdek
`home/discovery-core.ts` (12 test). **Canlı smoke (enterprise-demo, fixture'lar oluşturulup temizlendi):** guest
13/13 (no-signal→yalnız generic; CB 0/1→gizli,2→2,5→4; cart→8 öneri cart-hariç; cache private,no-store; PII/reason
yok; spoof body→400; cross-store→404) · DISCOVERY_GRID columns=3 / 1-kart→gizli · REPURCHASE izole 3 (auth-only,
guest'te yok) · SIMILAR_TO_PURCHASED 8 · PERSONALIZED_DEALS sinyalde 5 / no-signal→gizli · WISHLIST_DEALS indirimlide
4 / 1→gizli / non-discounted→gizli · page-level dedupe doğrulandı. **Smoke sırasında bulunan+düzeltilen defect:**
`discoverySections` filtresi DISCOVERY_GRID'i (SECTION_BOUNDS'ta değil) eliyordu → grid asla render olmuyordu; filtre
düzeltildi. Gate: api-gateway build 0 + 1743 test PASS + 34 yeni core test + lint 0 + git diff temiz + migrate up-to-date.
Kalan: yalnız store-admin yönetim UI + preview ([[TD-152]]) — TD-150/TD-151 CLOSED.

## TD-150 — TODO-162 storefront Discovery UI + lazy hydration (2026-07-30) — CLOSED

**Durum:** CLOSED (2026-07-30). Storefront `getDiscovery(locale)` (`lib/server/catalog.ts`) Katman B ucunu
SUNUCU-tarafı çağırır (kimlik cookie→header; cart/guest-wishlist ref; `no-store`) → **flash/CLS yok** (§24;
lazy client-island yerine SSR tercih edildi: ineligible section zaten yanıtta yok → boş-durum render edilmez).
Renderer `components/site/home/discovery-sections.tsx` (Server Component): DISCOVERY_GRID (columns 2-4, tablet
2×2, mobile tek kolon), rail'ler (yatay snap şerit, StorefrontProductCard reuse), SPONSORED_RAIL ("Sponsorlu"
etiketi), EDITORIAL_CAMPAIGN kartı. Home page (`app/page.tsx`): public /home + discovery PARALEL; layout Hero →
Discovery (hero altı) → kalan public; wishlist/rating batch'ine discovery ürün id'leri dahil. TR/EN default
başlıklar (`i18n discovery.titles`). **Category Shortcuts boş-kategori fix** (`home/data.ts
listPublishedFeaturedCategories`): ACTIVE kategori VE ≥1 ACTIVE ürün (primaryProducts VEYA assignments) →
boş kategori kısayolu gizlenir (§16). a11y: h2/h3 hiyerarşi, section aria-label, tek-link kart (nested-link yok).
**Canlı smoke (storefront `next dev` @ localhost:3001 → gateway 4001, enterprise-demo, fixture oluştur+temizle):**
guest home SSR'de "Günün fırsatları" 12 indirimli ürün + Category Shortcuts + public showcase render; no-signal
guest'te personalized section YOK (görünür-metin doğrulaması; "leak" grep artefaktı=dict serialization); cookie'li
ziyaretçide CONTINUE_BROWSING/PERSONALIZED/GRID render. Gate: storefront typecheck PASS + lint 0 + gateway build 0 +
59 home test + git diff temiz + migrate up-to-date. Kalan TODO-162: yalnız admin/preview ([[TD-152]]) — TD-151 CLOSED.

## TD-151 — TODO-162 analytics ingest + retention (2026-07-30) — CLOSED

**Durum:** CLOSED. `POST /public/stores/:storeSlug/home/discovery-events` ingest (`home/discovery-event-{data,routes}.ts`;
bot/prefetch/kimlik gate + eventType/sectionType/eligibilitySource allowlist + sectionId enabled-guard + claimed↔actual
type çapraz-doğrulama + ürün sahipliği + impression zaman-pencere/ADD_TO_CART dedupeKey) + admin funnel özeti
`GET .../home/discovery-events/summary` + storefront BFF proxy + pasif client tracker (IntersectionObserver impression +
click delegation) + retention worker (ayrı jobType `home-discovery-event-retention`, env-gated, advisory-lock+circuit-breaker;
RETENTION_TABLE_SPECS dokunmaz). ADD_TO_CART discovery kart yüzeyinde emit edilmez (kart PDP'ye götürür). Gate: gateway
1775 test PASS (+32), build 0, storefront tsc+lint 0. ADR-205 güncellendi.

## TD-152 — TODO-162 store-admin yönetimi + preview (2026-07-30) — CLOSED

**Durum:** CLOSED. Store-admin Home SectionEditor (`app/(app)/home/page.tsx` + `labels.ts`) 10 yeni keşif tipini
yönetir: rail'ler (TR/EN başlık + düzen + maxItems tavanı + guest/authSupported + fallbackDisabled), DISCOVERY_GRID
(TR/EN başlık + kart sırası düzenleyici + guest/auth), EDITORIAL_CAMPAIGN (TR/EN başlık/metin/CTA/mediaId/linkedCampaignId).
Salt-görünüm `DISCOVERY_BOUNDS` aynası min/max/auth/fallback ipucu gösterir (admin min düşüremez — motor kelepçeler).
Gateway tamamlaması: discovery endpoint section başlığını config `titleTr/titleEn`'den locale'e göre çözer
(rail/sponsored/grid; RecentlyViewed deseni). Keşif önizleme (`home/preview/page.tsx` + `discovery-preview-logic.ts`):
5 senaryo × keşif bölümleri eligible/hidden simülasyonu — ÖRNEK sinyal, disclaimer'lı (gerçek veri değil; nihai karar
sunucuda). Gate: gateway build 0 + 1775 test PASS, store-admin tsc+lint 0. **Kalan:** yalnız enterprise-demo canlı
smoke + store-admin UI-piksel click-through (parola; TD-126 sınırı → Final UI Polish/deploy-öncesi manuel).

## TD-153 Worker per-store capability skip (TODO-163 Faz 3) — CLOSED (2026-07-30)

- Durum: CLOSED
- Çözüm (ADR-214): Paylaşılan `capabilities/worker-gate.ts` (`createWorkerCapabilityGate(prisma)` →
  StoreModule + aktif Subscription.Plan.metadata sorgularından `createStoreModuleData`+`createCapabilityCache`;
  store-scoped, bounded TTL, fail-closed, tenant-safe) `apps/api-gateway/src/main.ts`'te TEK kez kurulup
  6 OPSİYONEL worker'a enjekte edildi: recommendation-event / recently-viewed / discovery-event retention
  (per-store), attribution retention (per-store-per-tablo: SPONSORED_PRODUCTS/INFLUENCER_TRACKING),
  settlement scheduler (SPONSORSHIP_FINANCE), campaign reconcile (emit-site gate). Kapalı store →
  MUTATION YOK + `SKIPPED_DISABLED` (QueueJobLog `payload.outcome`, status COMPLETED = hata değil, retry
  yok, `SKIPPED_LOCKED` deseniyle simetrik); diğer store'lar devam eder. CORE worker'lar (shipment sync /
  barkod retry / apps/worker inventory·backup) gate ENJEKTE EDİLMEDİ → çekirdek asla kapanmaz. Testler +
  canlı smoke PASS.

## TD-154 Plan → capability editörü UI (TODO-163 Faz 3) — CLOSED (2026-07-30)

- Durum: CLOSED
- Çözüm (ADR-215): SAF `capabilities/plan-capabilities.ts` (status required/optional/unavailable ↔ boolean
  plan default; core-unavailable + unknown + invalid-dependency doğrulama; preview dependency-pass; MERGE
  helper). Gateway `GET/POST(preview)/PUT /admin/plans/:id/capabilities` (platform-admin; audit
  `{capabilities:{changedModules}}`; MERGE → diğer metadata korunur; StoreModule override'a DOKUNMAZ; plan
  değişince capability cache clear). api-client `admin.plans.capabilities.{get,preview,apply}`. platform-admin
  `/plans` PlanEditor'e capability matrisi (TR/EN ad, status seçici, dependency uyarısı, canlı preview,
  abonelik etki sayısı, apply). Effective sıra korunur: store override > plan default > registry baseline >
  dependency. Testler (SAF + route) + canlı smoke PASS.

## TD-155 Store-admin per-page direct-URL guard (TODO-163 Faz 3) — CLOSED (2026-07-30)

- Durum: CLOSED
- Çözüm (ADR-214): Paylaşılan `lib/store-modules.ts` (route→modül TEK OTORİTE; StoreNav ona bağlandı) +
  `lib/server/module-access.ts` (`getStoreModuleMatrix` cache()'li; cookie→token→store→gateway matris) +
  `components/module-guard.tsx` (async server component; kapalı → EmptyState "MODULE_DISABLED", children
  render EDİLMEZ). 14 opsiyonel route klasörüne server-component `layout.tsx` guard'ı (inventory/reviews/
  campaigns/influencers/influencer-campaigns/sponsors/sponsorship-agreements/-settlements/-payments/
  sponsored-products/home/hero/theme/operations). Doğrudan URL ile veri fetch YOK + render YOK; boş
  nav-grup zaten gizli. Testler (ModuleGuard + StoreNav) PASS.

## TD-156 Kalan storefront render gate'leri (TODO-163 Faz 3) — CLOSED (2026-07-30)

- Durum: CLOSED
- Çözüm: Kalan yüzeyler kapatıldı — PDP recently-viewed tracker beacon (RECENTLY_VIEWED), SimilarProducts
  fetch (RECOMMENDATIONS), reviews summary/list/eligibility + rating batch + PdpReviews (REVIEWS); home
  discovery fetch (RECOMMENDATIONS) + card ratings (REVIEWS) + RECENTLY_VIEWED/SPONSORED section render;
  PLP/discovery-list card ratings + wishlist; cart + rail RECENTLY_VIEWED; nested WishlistProvider'lar
  (similar/rail/view-history) `wishlistEnabled` alır; influencer `/t/[token]` INFLUENCER_TRACKING kapalıysa
  fail-closed (track POST + cookie YOK → terminal redirect). Gateway sponsored TOKEN ÜRETİMİ home/discovery/
  search'te SPONSORED_PRODUCTS'a bağlandı (kapalı → token yok → rozet/beacon yok). Kapalı modül: veri
  çekilmez + section/island render edilmez + event üretilmez; public projeksiyon boolean-only kalır.
  storefront 446 test PASS.

## TD-157 Layout preset slot varyantları ilk faz (TODO-164) — CLOSED & DEPLOYED

- **Bağlam.** TODO-164 slot contract 8 slot × N variant tanımlar (allowlist); bu fazda gerçek GÖRÜNÜR CSS
  farkı YALNIZ birkaç slot için uygulandı (ProductCard comfortable/compact/premium, Header solid/minimal/
  floating, Footer expanded/minimal, Hero full/editorial/split, MobileNav drawer/fullscreen). Prompt: "her
  preset için tamamen farklı tasarım üretme; contract + en az iki gerçek çalışan varyant yeterli."
- **Kalan.** `productDetailLayout` (standard/gallery-left/editorial), `productListingLayout` (standard/dense),
  `homeSectionFrame` (standard/boxed) variant'ları ŞU AN sadece `data-*` işaretler; görsel farkları CSS/yapı
  olarak henüz UYGULANMADI (kayıtlı ve resolve edilir, ama render aynı). Ayrıca custom package için @font-face
  yükleme ve non-bundled paket kayıt akışı (registry harici manifest) FUTURE.
- **Risk.** Düşük (presentation-only; eksik variant defaultVariant gibi render eder; kırılma yok).
- **Plan.** TODO-165 Fashion Vertical Foundation bu slot variant'larını gerçek moda düzenleriyle doldurur.

## TD-158 Storefront tema smoke — worktree docker rebuild gereği (TODO-164) — NOTE

- **Bağlam.** Docker compose app'leri kaynağı IMAGE'a bake edip `dev` (tsx/next) çalıştırır (bind-mount YOK).
  Bir gateway/storefront kaynak değişikliğini canlı smoke etmek için `infra/docker` compose'u WORKTREE'den
  build etmek gerekir (context `../..` = worktree kökü) + `up -d api-gateway storefront-web`. Migration ayrı
  uygulanır (`prisma migrate deploy`, DATABASE_URL=localhost:5432). Paylaşılan paketler (@commerce-os/theme/
  contracts/api-client) IMAGE içinde turbo ile derlenir → değişiklikler yansır. Bkz. [[docker-smoke-vs-worktree]].
- **Aksiyon.** Yok (bilgilendirme); TODO-164 canlı smoke bu yolla yapıldı (enterprise-demo, 6/6 senaryo PASS).

## TD-159 — Builder responsiveOverrides henüz builder-UI'da açık değil (TODO-164A) — FUTURE

`responsiveOverrides.{tablet,mobile}` config ŞEMADA mevcut ve builder-css `columns/containerPadding/heroHeight/
sectionSpacing/productCardDensity` anahtarlarını `--tb-*` + sistem `@media` ile GERÇEK render eder; yalnız
`navigationVariant` CSS ile değil server slot çözümüyle uygulanır (bu fazda render edilmez, yalnız doğrulanır).
KRİTİK: builder **UI'ı responsiveOverrides'ı henüz KULLANICIYA AÇMIYOR** (Yapı sekmesi yalnız top-level slot +
yapısal knob sunar) → "sessizce yoksayılan görünür kontrol" YOK. Gelecek: responsive override editörü + mobil
nav breakpoint-duyarlı `useSlotVariant`. Etki: düşük (bounded future capability; güvenlik/veri etkisi yok).

## TD-160 — Builder iframe preview env (TODO-164A) — CLOSED

Store-admin "Gerçek vitrin" iframe önizlemesi `NEXT_PUBLIC_STOREFRONT_URL` okur. **Kapatıldı:** dev compose
store-admin servisine `NEXT_PUBLIC_STOREFRONT_URL=http://localhost:3000` eklendi (dev'de runtime okunur).
Prod deploy'da helm/compose'a ilgili public storefront kökü set edilmelidir (deploy config notu). Gateway
preview-token + `GET /public/theme-preview` env'den bağımsız çalışır. Canlı smoke'ta iframe önizleme doğrulandı.

## TD-161 — Builder token override çift-kaynak (document + config) (TODO-164A)

Token render otoritesi `ThemeDocument` (Stil sekmesi düzenler). `builder-config.tokenOverrides` (opsiyonel)
builder-css ile document CSS'inden SONRA layered override olarak yayımlanır → deterministik ama iki kaynak.
Store-admin UI tokenOverrides'ı POPÜLE ETMEZ (yalnız document); alan spec bütünlüğü + programatik yol için
mevcut. İyileştirme: tek kaynağa indirgeme (config→document derive) ileride değerlendirilir. Etki: düşük.

## TD-162 — Logo/favicon draft-staging + atomik publish (TODO-164B) — CLOSED (Dilim 2, ADR-243)

**CLOSED (2026-07-31).** `ThemeVersion.stagedLogoMediaId/stagedFaviconMediaId` DRAFT staging + publish anında
AYNI $transaction içinde StoreSettings'e ATOMİK yazma + sürümün `assetSnapshot`'ına alma; publish başarısızsa
StoreSettings DEĞİŞMEZ (txn rollback); rollback hedef sürümün asset snapshot'ına döner. Kalıcı otorite StoreSettings
kaldı; ThemeDocument içinde ikinci kalıcı logo kaynağı OLUŞTURULMADI (staging geçici, publish'te temizlenir). Preview
draft-staged logoyu gösterir (version-scoped preview token). Gateway+data test: staged→StoreSettings→rollback.

## TD-163 — allowedPalettes katalog-kısıtı, publish-gate değil (TODO-164B) — CLOSED (Dilim 2)

**CLOSED (2026-07-31).** Ürün kararı: palet-seviyesi HARD LOCK, override policy matris editörüyle (ADR-239)
per-alan `FieldPolicy=locked` üzerinden GERÇEKTEN uygulanıyor (server-side `enforceOverridePolicy` →
THEME_FIELD_LOCKED). Bir platform admini renk alanlarını kilitleyerek mağazanın rengi değiştirmesini engeller.
`allowedPalettes` tasarım gereği KATALOG kısıtı olarak kalır (renkler editable ise kısayol filtresi; hard lock
gerektiğinde field policy kullanılır). Güvenlik açığı değil; kullanıcıya görünen borç yok.

## TD-164 — Font kütüphanesi web-font yükleme (TODO-164B) — OPEN (non-blocking)

`font-library.ts` stack'leri yaygın SİSTEM fontlarına + bundled Inter/Playfair'e (next/font ile YÜKLÜ) dayanır →
kullanıcıya görünen font GERÇEKTEN render edilir (generic fallback garantili). Bu nedenle TODO-164B kapanışını
ENGELLEMEZ (kullanıcıya görünen font yükleniyor). Açık kalan yalnız harici/self-host web-font barındırma (custom
uploaded font aileleri + license metadata + preload) — bu bir FUTURE iş kalemidir, blocker değil. Etki: düşük.

## TD-165 — Size-chart STORE-scope tekilliği servis-enforce (TODO-165) — OPEN (non-blocking)

`SizeChartAssignment.@@unique([storeId, scope, categoryId, productId])` — Postgres NULL'ları DISTINCT saydığından
STORE-scope satırları (categoryId=NULL, productId=NULL) DB'de tekil değildir; STORE-scope tekilliği SERVİS
katmanında (upsertAssignment önce mevcut satırı arar) enforce edilir. CATEGORY/PRODUCT scope için unique index
zaten tekildir. İleride partial unique index (`WHERE scope='STORE'`) ile DB-seviyesi garanti eklenebilir. Etki: düşük.

## TD-166 — Fashion Vertical geleceğe dönük iyileştirmeler (TODO-165) — OPEN (non-blocking, future)

TODO-165 çekirdek kapsamı TAMAM & smoke geçti (bkz. ROADMAP/TODO). Aşağıdakiler yalnız GERÇEK future/
non-blocking iyileştirmelerdir (çekirdek kullanıcı değeri DEĞİL — TODO-165 kapsamına dahil DEĞİL):
- **Fashion'a özel inventory matris görünümü**: mevcut inventory workspace fashion varyantlarıyla çalışır (renk×beden
  varyantlar + reservation/oversell invariant korunur); ancak renk-satır/beden-kolon gruplayan ADANMIŞ bir fashion
  matris grid'i UI cilası olarak eklenebilir.
- **Çok-eksenli beden sistemleri** (JEANS bel×boy, BRA band+cup): şu an tek `fashion.size` ekseni; JEANS/BRA için
  bileşik eksen ayrıştırması ileride.
- **Size-chart revizyon geçmişi ucu**: publish revision üretir + rollback `publishedRevisionId`'e döner; tam revizyon
  seçici (geçmiş listesi) için ayrı liste ucu eklenebilir.
- **Görsel içerik**: seed placeholder media asset id'leri yeniden kullanır (dosya yok → PDP'de kırık görsel); gerçek
  fashion görselleri yüklenebilir. Yapı (variant media engine) doğru çalışır.
Blocker değil; çekirdek etkilenmez.

## TD-167 — Legacy `Product.brand` string dual-read emeklilik (TODO-165A) — OPEN (non-blocking)

`Product.brandId` (`governedBrand`) artık otoriter FK'dir; legacy `brand` string DORMANT read-model olarak
KORUNUYOR (dual-write: brandId set/değişince `brand` = `brand.name`). Admin ürün **LIST** görünümü
(`apps/store-admin-web/app/(app)/products/page.tsx`) hâlâ legacy `product.brand` string'ini okuyor (T7 dual-write
sayesinde ÇALIŞIYOR ama tek kaynak değil) — legacy string emekli edilince `brandRef`'e geçmesi gerekir. Ayrıca
dead i18n `brandPlaceholder` anahtarı (artık serbest-metin marka input'u kaldırıldığı için kullanılmıyor) temizlik
bekliyor. Etki: düşük (veri kaybı/güvenlik riski yok — geriye-uyum amaçlı bilinçli DORMANT tasarım).

## TD-168 — Opsiyonel kontrollü re-point migration: legacy global-option atamaları (TODO-165A) — OPEN (deferred)

TODO-165A T14b, `FASHION_VERTICAL`-enabled mağazalar için governed global-canonical opsiyonların YENİ
store-scoped kopyalarını oluşturdu; ancak bu opsiyonlara zaten atanmış MEVCUT ürün/varyant değerleri
(`ProductAttributeValue`, `ProductAttributeValueOption`, `VariantAttributeValue`) global opsiyona re-point
EDİLMEDİ — güvenli geçiş kararı (bkz. ADR-255 §11). Bu satırlar legacy okunmaya devam eder (resolver
store-scoped>global önceliğiyle yeni seçimler doğru çalışır; eski atama görünürlüğü etkilenmez). İleride
opsiyonel, KONTROLLÜ, transaction-safe bir re-point migration'ı (üç tabloyu birlikte, mağaza-bazlı,
idempotent) eklenip mevcut atamalar store-scoped opsiyonlara taşınabilir. T14b bu nedenle
`FASHION_VERTICAL`-migration-öncesi-enabled olmayan (yani migration `20260802120000`'dan SONRA enable edilen)
mağazalar için NO-OP kalır — bu mağazalar runtime `ensureStoreTaxonomyDefaults` (bootstrap-on-enable) ile bir
sonraki taksonomi erişiminde kapsanır. Etki: düşük (veri kaybı yok; iki-kaynaklı-ama-tutarlı okuma önceliği var).

## TD-169 — Plan-seviyesi FASHION_VERTICAL enable, lazy net'e dayanıyor + compensating-revert CAS değil (TODO-165A) — OPEN (non-blocking)

Store-seviyesi `FASHION_VERTICAL` DISABLED→ENABLED geçişi eager fail-closed bootstrap çalıştırır
(`ensureStoreTaxonomyDefaults`, başarısızsa `TAXONOMY_BOOTSTRAP_FAILED` + compensating revert). Ancak
**plan-seviyesi** `PUT /admin/plans/:id/capabilities` (INHERIT mağazaları toplu etkiler) bu eager bootstrap'i
ATLAYABİLİR — güvenlik ağı yalnız taxonomy list/quick-create handler'ındaki idempotent **lazy** çağrı
(`ensureStoreTaxonomyDefaults`, ilk taksonomi okumasında self-heal). Eager toplu plan-bazlı bootstrap
ERTELENDİ (bkz. `apps/api-gateway/src/capabilities/plan-routes.ts` inline TD notu). Ayrıca store-seviyesi
compensating-revert **CAS (compare-and-swap) DEĞİL** — düz bir overwrite; iki eşzamanlı çakışan enable/disable
PUT'u arasında dar bir yarış penceresi var (pratikte capability state tekil admin operasyonu; ölçülebilir kullanıcı
etkisi yok). Etki: düşük (self-healing lazy net kapsıyor; dar eşzamanlılık penceresi).

## TD-170 — TODO-165A küçük/kozmetik ertelemeler (TODO-165A) — OPEN (non-blocking)

Aşağıdakiler review turlarında bulunup bilinçli olarak ERTELENDİ (spec-dışı, davranış-etkisiz veya çok dar):
- **`clearedFiltersOnly`** (`apps/storefront-web/lib/search/url-state.ts`) `q`/`category`'yi korur ama `brand`'i
  korumuyor — marka sayfasında "filtreleri temizle" markayı da düşürüyor (kategori sayfasındaki davranışla
  tutarsız; küçük UX drift).
- Backend brand facet section adı `"Marka"` HARDCODED (locale-aware değil) — `services/search-service/src/
  search-query.ts` `synthesizeBrandFacet`.
- Recently-viewed/similar-products uçları (`apps/api-gateway/src/recently-viewed/routes.ts`) `brandRef: null`
  döner — bu modüllerin read-model'i henüz `brandId` taşımıyor (T11 kapsamı yalnız catalog+search'ü kapsadı).
- Synthesize edilen `brand` facet kodu, bir mağazanın kendi `AttributeDefinition.code="brand"` tanımlamasıyla
  çakışabilir ihtimaline karşı reserved-word guard'ı YOK (dar/teorik risk).
- Size-chart selector her zaman `sortOrder` default geçtiğinden data-access `createdAt desc` fallback dead code
  (`size-chart-service.ts`/`size-chart-data.ts`) — davranış-etkisiz.
- Taxonomy reorder ekranı tip-başına `pageSize=100` çeker — governed sözlük sınırlı büyüklükte olduğundan
  bugün sorun değil; 100'den büyük bir tip reorder listesinde eksik görünür (bounded future risk).
- `SizeChartService.resolveEffective` artık iki sorgu (`getResolutionMeta`+`getRevision`) — hot-path perf için
  bilinçli küçültme; iki sorgu arasında teorik, güvenli-şekilde-bozulan (safe-degrading) dar bir yarış var
  (kazanan chart iki sorgu arasında unpublish edilirse eski revizyon dönebilir — kullanıcı etkisi yok, sonraki
  okuma düzelir).
- PR#158 (TODO-165 Fashion Vertical) fashion test-fixture type drift'i (5 dosya) bu branch'te additive-only
  greenlendi (branch'in kendi regresyonu değil; `tsc --noEmit` gate'ini yeşile çevirmek için gerekliydi) — bkz.
  SDD ledger Task 29.
Etki: hepsi düşük; kullanıcıya görünen davranış kırılmıyor.

## TD-171 — `schema.prisma`/api-gateway placeholder `(ADR-165A)` yorumları kısmen düzeltildi (TODO-165A) — OPEN (non-blocking)

Implementasyon sırasında henüz gerçek ADR numaraları atanmamıştı; kod yorumları geçici `(ADR-165A)` placeholder'ı
kullandı. Bu görev (T32) sırasında **`packages/db/prisma/schema.prisma`** içindeki TÜM `(ADR-165A)` yorumları
gerçek numaralara (`ADR-253` Brand model/BrandStatus/logo-kapak, `ADR-254` Product↔Brand relation/dual-read/
search-doc brand alanları, `ADR-255` ProductTaxonomyType/Status/ProductTaxonomyValue/AttributeOption.metadata/
taxonomyValue) düzeltildi + `pnpm db:generate` (comment-only, migration YOK) çalıştırıldı. **`apps/api-gateway/
src/**` ve `apps/api-gateway/test/**` içindeki `(ADR-165A)` yorumları (server.ts, brand/*, taxonomy/*,
attributes/routes.ts, capabilities/plan-routes.ts, search/*, recently-viewed/routes.ts, sponsored/data.ts, ilgili
test dosyaları — toplam onlarca satır) **DEĞİŞTİRİLMEDİ** (kapsam/risk-bütçesi nedeniyle bu görevde ertelendi) —
haritalama netti (marka satırları→ADR-253/254, taksonomi satırları→ADR-255/256, selector satırları→ADR-258) ama
büyük hacim düşük-değer bir metin-değişikliği olduğundan ertelendi. Uygulanmış migration `.sql` dosyalarındaki
`(ADR-165A)` yorumları KASITLI OLARAK DOKUNULMADI (immutable — değiştirmek migration checksum'ını bozar). Etki:
düşük (yalnız kod-yorumu doğruluğu; davranış etkisi yok).

### TD-172 — Marka arşiv/yeniden-adlandırma search read-model gecikmesi (TODO-165A, final review)
- **Durum:** OPEN (Minor). Public katalog/detay projektörleri `brandRef`'i ACTIVE-only gösterir (arşivli marka → `brandRef: null`, `/markalar/[slug]` → 404). Ancak search read-model (`ProductSearchDocument.brandSlug/brandName`) marka `status` ile FİLTRELENMEZ; `synthesizeBrandFacet` facet'i canlı bu kolondan türetir. Marka arşivlemek hiçbir ürün satırına dokunmadığından reindex tetiklenmez → arşivli marka bir sonraki ürün-dokunuşu/`search:backfill`'e kadar facet olarak görünmeye + slug filtresiyle ürün döndürmeye devam eder.
- **Etki:** Nadir admin işlemi; reindex ile kendini iyileştirir; kullanıcı-görünür kritik yol kırılmaz. Kalıcı çözüm: marka archive/rename'de ilgili ürünleri reindex kuyruğuna al VEYA facet sentezini `Brand.status='ACTIVE'` join'iyle kısıtla.
- **Güncelleme (TODO-165B, ADR-263):** Marka **rename** (name/slug PATCH) artık `onBrandChanged`→`reindexStore` tetikler (search doc `brandSlug/brandName` snapshot tazelenir). **Archive/restore** hâlâ reindex tetiklemiyor → arşivli marka facet'te bir sonraki ürün-dokunuşuna kadar kalabilir (bu TD'nin kalan kısmı OPEN).

### TD-173 — TODO-165B ertelenen küçük borçlar (recovery, non-blocking)

- **Durum:** OPEN (Minor). TODO-165B recovery kapsamında bilinçli ertelenen kozmetik/optimizasyon kalemleri:
  - **Kategori/marka rename reindex granülerliği:** `reindexStore` tüm mağazayı yeniden indeksler (kategori/marka rename SEYREK olduğu için kabul edildi). Optimizasyon: yalnız etkilenen ürünleri (assignment/subtree veya `brandId`) hedefleyen kategori/marka-scoped reindex API'si.
  - **discovery-sections `GridThumb` aspect değişimi:** ortak primitive'e geçişte kart görsel oranı kare→`aspect-[4/5]` oldu (2 kolonlu kompakt grid; layout güvenli ama görsel ritim değişti — F14 görsel doğrulama önerildi).
  - **Sepet/sipariş/checkout satır thumbnail'ları + QuickView modal + `home-sections` kategori karosu:** ortak `ProductMediaFrame`'e taşınmadı (ürün-kartı kapsamı dışı; farklı bağlam/tam-taşan görsel). İstenirse ayrı kapsamda `gallery-main`/yeni variant ile ele alınabilir.
  - **Fashion projeksiyon fiyat özeti:** option başına `startingPriceMinor` çok-eksende o option'ın TÜM kombinasyonlarındaki min'dir (renk kartı "başlangıç" semantiği doğru); seçilen kesin kombinasyon fiyatı yine buy-box'ta gösterilir (tasarım gereği).
- **Etki:** Hiçbiri kritik yolu kırmaz; kullanıcı-görünür doğruluk korunur.

## Final Enterprise UI Polish — Readiness Audit (2026-08-02)

`main == origin/main == 83bcd8e`. Final Polish öncesi denetim: 3 yüzey (Platform Admin :3001, Store
Admin :3002, Storefront :3000) gerçek browser smoke + kod/doküman denetimi. Sonuç: **READY** — açık UI
PROD blocker yok. Bu turda yapılan küçük/orta UI düzeltmeleri (worktree; typecheck+lint+test yeşil,
browser-doğrulandı; commit YOK):

1. **TD-024 (RESOLVED):** Store Admin dashboard "Aktif ürün" undercount (24 → 418). Bkz. TD-024.
2. **Store Admin — beden tablosu seçici raw enum rozeti (E1):** `catalog-sources.tsx` DRAFT/ARCHIVED ham
   enum yerine okunur etiket (`SIZE_CHART_STATUS_LABELS`; size-charts sayfasıyla tutarlı).
3. **Store Admin — marka arama placeholder (E3):** `brands/page.tsx` "…veya slug ara…" → "Marka adı
   ara…" (teknik "slug" terimi kullanıcıdan gizlendi).
4. **Platform Admin — tema sürüm rozeti raw enum (E2):** `theme-library/[id]/page.tsx` `{v.status}` →
   `VERSION_STATUS_LABEL` (liste sayfasıyla tutarlı). Demo'da tema şablonu 0 → typecheck/test ile doğrulandı.
5. **Storefront — tükenen beden a11y (buy-box):** OOS (disabled + üstü-çizili) beden butonuna
   `aria-label="{beden} — Tükendi"` (mevcut `t.detail.fashion.soldOut`); ekran-okuyucuya renk-dışı
   OOS göstergesi. Browser'da doğrulandı (`aria-label="XXL — Tükendi"`).

Denetimde bulunup **Final Polish kapsamına** bırakılan (bu turda düzeltilmeyen) kullanıcı-görünür kalemler:
storefront buton/input token ikiliği (shared `@commerce-os/ui` vs local editorial kit — B1), hardcoded
non-locale "Marka" facet adı + marka sayfasında filtre-temizlemede brand düşmesi (TD-170), thumbnail
medya-primitive tutarlılığı + discovery aspect (TD-173), layout preset no-op kontrolleri (TD-157),
form error mesajlarının `aria-describedby` ile bağlanmaması (C1), Modal focus-trap yokluğu (D1).
Detay/sınıflandırma: bkz. bu turun final raporu.

Doküman hijyeni: duplicate **TD-039** id ayrıştırıldı (ikinci giriş → **TD-039B**). ROADMAP/TODO tail'inde
TODO-165/165A/165B "commit YOK" bayat durumları CLOSED & DEPLOYED olarak düzeltildi.

## Final Enterprise UI Polish — Implementation (2026-08-02, worktree, commit YOK)

Denetimde Final Polish kapsamına bırakılan kalemlerin uygulanması. Detay: `docs/analysis/FINAL-enterprise-ui-polish.md`. Gate: typecheck+lint+test(1199)+build(9/9)+`git diff --check` YEŞİL; browser smoke (desktop 1440 + mobil 375).

**RESOLVED:**
- **B1 (buton/input token):** storefront auth/account/checkout/pay editorial local kite hizalandı; header ÜYE OL editorial; semantik status Badge/Card korundu.
- **C1 (form aria):** paylaşılan `fieldAria` + üç input sistemi `aria-invalid`/`aria-describedby`/`aria-required` + id'li mesaj; zorunlu göstergesi CSS `::after` (etiket adı sade).
- **D1 (modal focus trap):** ortak `useFocusTrap` (saf çekirdek `focus-trap.ts` + client `use-focus-trap.ts`, RSC sınırı); shared + store-admin modal + gallery lightbox; `useId` benzersiz id.
- **TD-170 (brand facet):** facet label locale'den (`facetTitle`); marka landing'de yanıltıcı brand chip kaldırıldı + marka facet'i raydan gizlendi; clear-all brand path'te kalır (context korunur).
- **§6 tooltip/z-index:** merkezi z-index ölçeği (preset); portallı Tooltip (collision+auto-flip); pricing InfoTip kırpılma fix.
- **§5 Ana Sayfa duplicate:** `/hero`→`/home` redirect; nav + orphaned dead-code + legacy BFF/client temizlendi; veri korundu.
- **FP-3 (rating):** recently-viewed + similar rail'leri BFF `getCardRatings` reuse ile RatingProvider'a bağlandı.
- **PDP:** hover zoom (§2), layout dengesi + sticky buy-box (§3), Reviews 4. tab + hash (§4).

**PARTIAL / follow-up:**
- **TD-173 (product media):** cart/order-summary hâlâ `ProductMedia`; `ProductMediaFrame` altına alınmalı.
- **TD-157 (theme preset):** heroHeight geçersiz-değer + ham enum düzeltildi; orphaned `--tb-heading-scale`/`--tb-line-height`/`--tb-card-gap` wiring/removal + preview/publish doğrulaması follow-up.
- **§14/15/16 geniş taramalar:** primitive + hedefli düzeltmeler yapıldı; Platform Admin raw enum/slug (plans capability keys, theme-library sourcePreset, themes layoutPreset/kind, assignment reasonCode) + her ekran görsel taraması follow-up.
- **§17 responsive:** PDP 375/1440 doğrulandı; 768/1024 + checkout/wizard/theme-designer matris follow-up.

## Final Polish — Completion Recovery (2026-08-02, worktree, commit YOK)

İlk turda PARTIAL kalanlar KAPATILDI. Detay: `docs/analysis/FINAL-enterprise-ui-polish.md` (Completion Recovery). Gate: typecheck+lint(11/11)+test(1231)+build(9/9)+`git diff --check` YEŞİL; storefront browser matris 375/768/1024/1280.

- **TD-173 CLOSED:** `ProductMediaFrame` tam geçişi — yeni `line-thumbnail` varyantı (kare/contain/placeholder); cart, order success, account order detail+list, PDP hızlı-bakış geçirildi (wishlist/PLP/search/discovery zaten frame'de). Test +2. Browser (cart contain) doğrulandı.
- **TD-157 CLOSED:** heroHeight geçersiz enum + ham enum → friendly label; `productCardDensity`→`--tb-card-gap` storefront'ta tüketilir (mobil grid row-gap); `headingScale`/`lineHeight` kontrollü kaldırıldı (utility-based tipografide güvenli bağlanamıyordu). No-op kontrol/geçersiz değer kalmadı.
- **§14 Platform Admin CLOSED:** raw sourcePreset/layoutPreset/kind/reasonCode/capability-key → friendly (getLayoutPreset.nameTr / capLabel / reasonLabel; ham key yalnız ikincil teknik detay). Theme designer status/source friendly.
- **§8 Settings CLOSED:** inert placeholder nav'dan kaldırıldı + `/settings`→`/` redirect.
- **§17/§7:** storefront browser responsive matris + PDP tablist klavye doğrulandı; admin browser oturum-gated (tasarım-responsive + test-kapsamlı).

**Final Enterprise UI Polish: IMPLEMENTED.** TD-173/TD-157/B1/C1/D1/TD-170/FP-3 CLOSED. Kalan tek PROD BLOCKER pre-existing PB-3/TD-139 (offsite backup, UI dışı — kapsam dışı).

## Final Acceptance Recovery (2026-08-02) — durum: IN_PROGRESS

Üç kabul (acceptance) browser smoke'u istendi. Detay: `docs/analysis/FINAL-enterprise-ui-polish.md` (Final Acceptance Recovery).
- **Hover zoom regresyonu: ÇÖZÜLDÜ + browser kanıtı.** Kök neden: (1) saydam overlay img base'in üstünde → duplicate/seam; (2) cached ölçüm-img'i onLoad ateşlemiyor → maxScale=1 → zoom yok; (3) origin frame'e göre → beyaz boşlukta zoom. Fix: tek OPAK katman + `img.complete` ile ölçüm + `containZoomOrigin` letterbox-aware kelepçe. Test: containZoomOrigin 4 + gallery 18/18 + storefront 523/523.
- **Theme smoke: KISMİ.** Canlı admin oturumunda TD-157 kontrolleri (removed sliders, friendly/valid enum), draft-preview GÖRÜNÜR storefront diff (sarı zemin), publish + WCAG-kontrast + override-policy governance gate'leri DOĞRULANDI. Canlı store-assignment→production-swap→sürüm-rollback YAPILMADI (paylaşılan enterprise-demo store mutasyon riski; 0-store atama → canlı storefront etkilenmedi). Smoke tema DB'den temizlendi.
- **Checkout smoke: KISMİ.** Non-auth yüzeyler doğrulandı (sepet TD-173, checkout→login gate, editorial login + aria + 375). Tam kimlik-doğrulamalı akış YAPILMADI (güvenlik kuralı: hesap oluşturma + parola girme kısıtlı; bilinen-parolalı müşteri fixture'ı yok).

**Sonuç (güncelleme 2026-08-02, ayrı acceptance turu):** Üç smoke İZOLE test verisiyle TAM GEÇTİ → **TD-157 CLOSED & DEPLOYED / Final Enterprise UI Polish CLOSED & DEPLOYED.** (a) Hover-zoom regresyonu çözüldü+browser; (b) Theme publish/rollback throwaway store'da tam lifecycle (draft-preview görünür diff→publish→preview=published→revision→rollback→immutable revision + cache invalidation + tenant isolation); (c) Authenticated checkout izole müşteri (env-driven parola) ile login→order PAID→account detail; reservation invariant + order snapshot immutable + KDV/fiyat doğru. Ek: **inclusive-VAT order-detail düzeltmesi** (taxMinor=0 → "Fiyatlara KDV dahildir" / "Prices include VAT", yanıltıcı ₺0,00 kaldırıldı). PR #163 (merge 1dd7d71); docker storefront/store-admin/admin/api-gateway main'den rebuild + post-deploy smoke PASS; izole smoke FK-güvenli temizlendi. Gate: build+typecheck+lint+test(storefront523/store-admin364/admin30/ui31/theme287)+git diff --check YEŞİL. Kalan tek pre-existing PROD BLOCKER PB-3/TD-139 (offsite backup, UI dışı).

## TODO-167 Persistent Cart & Cross-Device Foundation (Faz A) — 2026-08-03 (worktree, commit YOK)

Hibrit cart: anonim=cookie (değişmez), authenticated=kalıcı DB cart (cross-device). Cart REFERANS tutar
(fiyat YOK; ortak assemblePublicCart). Tek ACTIVE/(store,customer) partial-unique; version optimistic-
concurrency (409 CART_STALE); deterministik login-merge (100-cap + MERGE_LIMIT_EXCEEDED, sessiz kayıp yok);
checkout DB-cart otoriter + CONVERTED; env-gated 90-gün expiry sweep (default OFF). Detay:
`docs/analysis/PERSISTENT-cart-implementation.md`, `docs/adr/ADR-266-persistent-cart-authority.md`.
Gate: build 27/27 + lint 42/42 + test 2132 + git diff --check YEŞİL. Yeni testler: cart-core(14)/
cart-data(10)/customer-cart-routes(8)/cart-expiry-service(3).

**Yeni açık borçlar:**
- **TD-174** — authenticated cart kupon-kodu + kargo-seçeneği SEÇİMİ persist edilmiyor (otomatik kampanyalar
  uygulanır; seçim threading follow-up). Faz A membership + cross-device odaklı.
  **KISMEN ÇÖZÜLDÜ (2026-08-08, BUG-CART-003):** uygulanan kupon/kargo artık auth cart READ yoluna query ile
  thread edilir → anonim yolla AYNI motorla yeniden fiyatlanır (explicit kupon totals'i etkiler). Seçimin DB
  cart'ta **cross-device persist'i** hâlâ future (seçim cookie'de yaşar). Bkz. `docs/analysis/BUG-CART-003-variant-media-coupon-checkout.md`.
- **TD-175** — cart CONVERTED order PLACE anında (anonim cookie-temizleme ile parity), strictly-on-paid
  değil; "başarısız ödeme cart'ı korur" refinement ödeme-yolu hook'ları gerektirir (future).

### TODO-167 update (2026-08-03) — TD-175 RESOLVED + isolated acceptance PASSED

- **TD-175 RESOLVED:** cart CONVERTED artık ödeme SETTLEMENT'ında (`consumeOrderReservations` / SALE_COMMIT —
  webhook + test-payment tek chokepoint) yapılıyor; order PLACE'de DEĞİL. Başarısız ödeme cart'ı ACTIVE
  bırakır (yeniden denenebilir); başarılı ödeme convert eder (+ satır temizler, sonraki okuma yeni boş ACTIVE
  lazy oluşturur). Ödeme tx'i içinde atomik. Değişiklik: `packages/inventory/src/reservation-operations.ts`.
- **İzole browser acceptance (FONKSİYONEL) GEÇTİ:** ayrı `cart_smoke` DB + worktree gateway :4100 + izole
  seed + bilinen-parolalı müşteri + MOCK/TEST ödeme. Canlı HTTP + DB kanıtı: cart mekaniği 17/17 (CART_STALE
  concurrency dahil), checkout DB-cart otoritesi + failed-payment→ACTIVE, convert-on-paid doğrudan DB PROOF,
  login-merge 4/4, DB invariant 4/4 (tek ACTIVE, unique, CartLine'da fiyat kolonu YOK, sızıntı yok).
  enterprise-demo PRISTINE bırakıldı. **Görsel/responsive UI walkthrough (375/768/1024/1440) çalıştırılMADI**
  (storefront dev boot edilmedi; aynı server-authoritative projeksiyonu render eder). Detay:
  `docs/analysis/PERSISTENT-cart-implementation.md §8`.
- **Kalan açık borç:** TD-174 (auth cart kupon/kargo seçim persist).

### TODO-167 update (2026-08-03) — UI acceptance RUN

Friendly persistent-cart notice UI eklendi (merge / cross-device / payment-preserved → TR/EN dostu metin;
ham CART_STALE/MERGE_LIMIT_EXCEEDED gösterilmez; role=status/alert + aria-live + not-color-only + erişilebilir
kapat). İzole storefront (:3100) + gateway (:4100) canlı browser: authenticated DB cart render (satır/adet/
üstü-çizili+indirimli fiyat/sipariş özeti/ÖDEMEYE GEÇ), cross-device görsel (API-doldurulmuş cart browser'da),
empty cart, **responsive 375/768/1024/1440 (yatay taşma yok)**, a11y canlı-doğrulandı; merge banner login sonrası
cart HTML'de (one-shot). Gate YEŞİL: build 27/27 + lint 42/42 + test (gateway 2132 / storefront 526 / inventory 31 /
cart 35) + git diff --check. enterprise-demo PRISTINE. Ortam notu: browser-automation add-to-cart button-onClick'i
tetikleyemedi (login form-submit + gateway-API ile sürüldü; her adımın fonksiyonel davranışı HTTP+DB ile bağımsız
kanıtlı). Detay: docs/analysis/PERSISTENT-cart-implementation.md §8.

## TODO-167 Persistent Cart — CLOSED & DEPLOYED (2026-08-03)

PR #165 merged (merge commit `0a602d2`). api-gateway + storefront-web rebuilt from main; migration
`20260803140000_todo167_persistent_cart` applied via `migrate deploy` (partial ACTIVE index verified live).
Post-deploy smoke 20/20 PASS (deployed gateway :4000): cart mechanics · CART_STALE concurrency · login merge ·
checkout DB-cart authority · convert-on-paid (settlement) · failed-payment→ACTIVE · DB invariants. Temp fixtures
FK-safe cleaned + inventory restored; enterprise-demo pristine (473 products / 9 orders unchanged). ADR-266
ACCEPTED. **TODO-168 (Cart Change Awareness) UNBLOCKED.** TD-174 open future; cart hard-delete/anonymization
future; cross-device Cart-Change acknowledgement = TODO-168 scope.

## TD-176 — Cart Change Awareness future scopes (TODO-168) — OPEN (deferred, non-blocking)

TODO-168 (ADR-267) IMPLEMENTED; the following are explicitly out-of-scope future additives (design leaves
room, no code now):
- **`CartChangeEvent` retention worker** — table + idempotent ingest shipped; automatic DELETE not built
  (default-safe = off). Add later by reusing the recommendation-events retention worker pattern
  (env-gated, advisory-locked, `QueueJobLog`) with a distinct jobType.
- **`FREE_SHIPPING_ELIGIBILITY_CHANGED`** — cart-level aggregate change type (not per-line); future.
- **`SELLER_CHANGED`** — marketplace-only; N/A for Modular single-seller; future.
- **Read-only admin cart-change history surface** — `CartChangeEvent` is analytics/audit only today; no
  admin UI. Future if a support surface is needed.
- **Anon meta cookie audit boundary** — anonymous baseline is captured on the first reliable *mutation*
  (Next.js only allows cookie writes in actions/route handlers), not the first *render*; pre-feature carts
  therefore begin change detection from their next mutation. Acceptable per ADR-267 §Consequences.

## TD-177 — PLP list + home showcase hâlâ bounded (fail-open) stok haritası — OPEN (non-blocking)

- Durum: OPEN
- Öncelik: MEDIUM
- Etki: BUG-CART-002'de PDP detay ucu variant-scoped fail-CLOSED stok haritasına (`loadPublicStockMapForVariants`
  → `findInventoryByVariantIds`) geçti. Ancak `GET /public/stores/:slug/products` (PLP liste) ve home showcase
  section'ları hâlâ `loadPublicStockMap` (bounded `listInventory(PUBLIC_CATALOG_MAX=200, updatedAt desc)`)
  kullanıyor → pencerenin dışındaki varyant `available:null → inStock:true` (kart stok rozeti kozmetik
  fail-open). Checkout güvende: kullanıcı PDP'ye tıkladığında detay ucu artık DOĞRU OOS gösterir (disabled)
  ve add endpoint fail-closed'dur; PLP fail-open yalnız kart üzerindeki rozet/nokta görselini etkiler.
- Çözüm önerisi: PLP/home caller'larını da variant-scoped'a çevir (slice'ın ürünlerinin varyant id'lerini
  topla → `loadPublicStockMapForVariants`). Search read-model zaten ayrı raw-SQL `onHand−reserved` otoritesi
  kullanır (etkilenmez). Aynı bounded-scan sınıfı: `pdp-404-public-catalog-max`.
- İlişki: BUG-CART-002.

## Returns Management Foundation — açık future kalemler (ADR-269 / TODO-169)

- **Gerçek provider refund + OrderRefund ledger (TD-RET-1 → TODO-170):** bu faz yalnız `RefundIntent` (PENDING)
  üretir; gerçek para iadesi YAPILMAZ ve finans raporuna tutar DÜŞMEZ (`refundAmountsSupported=false`). TODO-170
  PENDING intent'leri işleyip append-only `OrderRefund` (ADR-268 §5) yazacak ve Financial Reporting'i besleyecek.
- **Private media = uygulama-katmanı (TD-RET-2):** iade attachment'ları non-enumerable key + `/media/*` onRequest
  guard (404) + auth-gate'li stream ile korunur; dosya fiziksel olarak public root altında (gerçek private-bucket/
  signed-URL YOK). Object-store/signed-URL migration'ı future. `StorageDriver.read` eklendi (S3Driver de uygulamalı).
- **Gerçek email teslimi (TD-RET-3):** bildirimler post-commit fail-open emit edilir ama platformda gerçek
  transactional email gönderici/şablon YOK (notification-service + worker log-only). Returns bu boşluğu paylaşır;
  gerçek teslim platform-geneli future iştir.
- **Return-exclusion registry (TD-RET-4):** ürün/ürün-türü iade-dışı bırakma kaydı yok → eligibility bu eksende
  her zaman uygun (`excluded=false`). Politika/registry gelince `computeLineEligibility` uzantı noktası hazır.
- **Otomatik iade etiketi (TD-RET-5):** ilk faz manuel iade kargosu (müşteri tracking no girer, admin teslim alındı
  işaretler); carrier return-label API entegrasyonu future (sahte etiket üretilmez).
- **`COMPLETED` para-doğrulamalı geçişi (TD-RET-6):** bu faz `REFUND_PENDING`/`REPLACEMENT_PENDING` → `CLOSED`
  arşivler; sonucu doğrulanmış `COMPLETED` geçişi TODO-170 refund işlemine kapılıdır.
- **`Shipment.deliveredAt` webhook yolu (TD-RET-7):** deliveredAt manuel-durum + provider-sync yollarında set
  edilir; provider webhook yolunda (webhook-routes) DELIVERED eşlemesi henüz deliveredAt yazmaz (sync bir sonraki
  turda düzeltir). Additive; eligibility fallback `updatedAt` bunu telafi eder.
- **Return order-summary projection perf (TD-RET-8, TODO-169.1):** ortak `computeReturnOrderSummaries`
  (customer order list) her sayfa için shipment+returnRequest'i batched (N+1'siz) sorgular; müşteri sipariş
  sayısı büyürse (yüzlerce) pencere ankoru + iade toplaması sipariş listesi gecikmesine katkı yapabilir. Fail-open
  (hata → boş özet, order bozulmaz). İleride: teslim ankorunu order/shipment read-model'e materialize et ya da
  yalnız DELIVERED siparişlerde hesapla. Non-blocking.
- **Return shipping UX (TD-RET-9, TODO-169.1):** geri kargo hâlâ MANUEL (müşteri carrier+tracking string girer,
  admin teslim-alındı işaretler). "Ürünü geri gönderin" bloğu son-gönderim tarihini iade penceresi bitişinden
  türetir (ayrı ship-by SLA alanı yok) ve iade adresini metinle anlatır (yapılandırılabilir mağaza iade adresi +
  otomatik etiket TD-RET-5 ile birlikte future). Non-blocking.
- **Pending profitability semantics (TD-RET-10, TODO-169.1):** sipariş detayında pending iade finansal etkisi
  "beklenen/provisional" olarak gösterilir (RefundIntent PENDING ≠ gerçekleşen); Financial Reporting revenue TODO-170
  öncesi DÜŞMEZ (`refundAmountsSupported=false` korunur). Gerçek gerçekleşen refund + kesinleşmiş kâr düzeltmesi
  TODO-170'e (OrderRefund ledger) kapılı. "beklenen net" satırı sipariş-seviyesi bilgilendirmedir, muhasebe kaydı değil.

## Financial Reporting Foundation — açık future kalemler (ADR-268)

- **Refund amount read-model (TD-FR-1):** ✅ **CLOSED (TODO-170 / ADR-272, PR #179 merge `9023d3d`; 2026-08-05).**
  Append-only `OrderRefund` + `OrderRefundEvent` ledger; yalnız `SUCCEEDED` refund'lar `completedAt` (store tz)
  ile gün×currency bucketlenip Product/Shipping Refunds olarak Net/Total'dan **TEK kez** düşülür (inclusive KDV
  üstüne eklenmez; attribution `refundedRevenueMinor` karışmaz; cancelled order zaten satış evreni dışı). Finance
  `refundAmountsSupported=true`. Deploy edildi (post-deploy smoke 15/15). Detay ADR-272.
- **Provider-native refund webhook + scheduled reconciliation (TD-FR-5, TODO-170 future):** bu fazda otomatik
  refund yalnız MOCK için yürütülür; reconciliation kontrollü `refresh` (status query) ile manueldir. Gerçek online
  provider (Stripe/iyzico/PayTR) canlı refund transport'u (EX-1) ve provider-native refund webhook imzası (TD-137)
  gelince: imzalı refund callback + zamanlanmış otomatik reconciliation worker eklenmeli. Şimdilik gerçek online
  provider refund'ları `MANUAL_OFFLINE` workflow'una düşürülür (sahte başarı üretilmez).
- **Chargeback / dispute & Gift Card/Store Credit refund hedefi (TD-FR-6, future):** OrderRefund ledger yalnız
  orijinal ödemeye iade (`REFUND_TO_ORIGINAL_PAYMENT`) kapsar; chargeback/dispute ve alternatif iade hedefleri
  (store credit / gift card) kapsam dışı — additive genişletilebilir.
- **⚠️ Per-line discount refund accuracy (TD-FR-7, KARARLI — sıradaki iş, 2026-08-06):** İade, kalemin
  **FİİLEN ödenen** (indirim dahil/değil) tutarını iade etmeli; mevcut `returns/refund-calc.ts` sipariş
  indirimini kalemlere **brüt-ağırlıkla oransal** dağıtıyor (ADR-269 §6 / ADR-066) ve bu **scope'lu
  kampanyalarda YANLIŞ** (finansal). Kanıt (OS-000004 / R000001): "Seçili Ürünlerde %20" yalnız Karaca'ya
  (`scopeSummary.eligibleSubtotalMinor=1980120`) uygulanmışken indirimsiz Casper kaleminin iadesi ₺6.313,50
  yerine ₺5.541,95 hesaplanıyor (**−₺771,55 eksik-iade**; simetrik olarak indirimli kalemde fazla-iade).
  **Kök neden:** sipariş anında indirim **kalem-bazında snapshot'lanmıyor** (`OrderDiscount` yalnız sipariş
  düzeyi + `scopeSummary.eligibleSubtotalMinor`). **Karar:** additive `OrderLine.discountAllocatedMinor`
  (KDV-dahil, kaleme fiilen düşen indirim; checkout/kampanya motoru placement'ta snapshot'lar; invariant
  Σ==`Order.discountAmount`); refund-calc oransal dağıtımı bırakır, `(lineGross − discountAllocated)`
  üzerinden hesaplar (disclosed KDV de indirim-sonrası taban → ADR-269 §6'daki KDV tutarsızlığını da çözer);
  nullable kolon → legacy null'da oransal fallback, set'te exact; scope'tan best-effort backfill. Detay:
  `docs/analysis/PER-LINE-DISCOUNT-REFUND-ACCURACY.md`. Ayrı ticket/ADR hak ediyor (finansal doğruluk).
- **Payment fee/commission (TD-FR-2):** `PaymentAttempt`'te fee alanı yok → net tahsilat (fee sonrası) hesaplanamaz;
  ödeme raporu brüt tahsilatı gösterir. Sağlayıcı fee snapshot'ı gelirse additive eklenir.
- **FX / multi-currency consolidation (TD-FR-3):** her currency AYRI raporlanır; birleşik tek-para görünüm YOK
  (FX katmanı yok — bilinçli). Gelecekte oran snapshot'lı consolidation gerekebilir.
- **FinancialDailyAggregate (TD-FR-4):** bu fazda snapshot sorgusu yeterli; gerçek hacimde sorgu gecikirse
  rebuildable günlük read-model + worker (search-index emitter→queue→worker kalıbı). Accounting source DEĞİL.
- **Profitability allocation (TD-FR-5):** kâr kapsam-kapılı satır maliyetinden; blended margin / allocation /
  zaman-serisi kâr future.
- **XLSX export (TD-FR-6):** CSV mevcut; XLSX primitive yok → future.
- **Scheduled/emailed reports & Platform cross-store aggregation (TD-FR-7):** bu fazda yok.

## Pre-Refund UX Recovery — açık future kalemler (ADR-270 / ADR-271) — 2026-08-04

- **TD-UX-1 — Unified Session Policy implementasyonu (BLOCKING sonraki faz):** ADR-271 tasarımı uygulanacak —
  additive migration (`PlatformSession`/`CustomerSession`: `lastActivityAt`/`absoluteExpiresAt`/`rememberMe`),
  gateway iki-kapılı (idle+absolute) sliding refresh, extend endpoint (CSRF+rate-limit, expired diriltmez,
  rotation), remember-me UI ×3, expiry UX (safe returnTo + mesaj + unsaved-form uyarı), warning modal + countdown,
  multi-tab (BroadcastChannel), tek policy kaynağı (customer-cookie 30d hardcode kaldırılır). TODO-170 bu bitene
  kadar BLOCKED. 7-adım geçiş sırası ADR-271 §5.
- **TD-UX-2 — Return address/instructions per-store (future):** İlk faz "iade adresi VEYA mağaza talimatı" i18n
  talimatıyla karşılandı (manuel iade kargolaması). Gerçek per-store iade adresi + paketleme + `returnShipBackDays`
  → `StoreSettings` additive alanları + settings PATCH/UI (contract test kuplajı dikkatle) future. Şimdilik
  `RETURN_SHIP_BACK_DAYS=7` config-default sabiti.
- **TD-UX-3 — Pending-work filtreli link query-param hydration:** Dashboard kartı + sidebar rozetleri doğru
  ekrana (`/reviews?status=PENDING`, `/orders/returns?status=…`) yönlendiriyor; hedef liste ekranlarının bu
  query-param'ı başlangıç filtre state'ine hydrate etmesi (şu an ekrana iner, filtre otomatik uygulanmayabilir)
  future iyileştirme.
- **TD-UX-4 — Platform-level pending-work summary:** Platform Admin'e mağaza-op sayacı BİLİNÇLİ eklenmedi
  (mağaza operasyonunu platform sidebar'a karıştırma kuralı). Gerçek platform-seviyesi aksiyon kuyruğu (ör.
  mağaza yaşam döngüsü / platform moderasyonu) oluşursa ayrı bir platform-scoped özet future.
- **TD-UX-5 — Gerçek notification center:** Bu faz spec gereği yalnız dashboard + nav badge sundu. Gerçek
  notification inbox (okundu/okunmadı, geçmiş, push) roadmap'e alındı → future faz.
- **TD-UX-6 (smoke side-effect) — ✅ CLOSED (repaired + hardened, 2026-08-04):** Browser smoke, bir enterprise-demo
  müşterisi (edm-store) için password-login testinde `CustomerCredential` upsert'ü (`ON CONFLICT (customerId)`)
  mevcut credential'ın `passwordHash`'ini geçici bir smoke şifresine ezdi. **Kök neden analizi:** credential seed
  kaynaklı DEĞİL — müşteri storefront'tan manuel kaydolmuş (seed/enterprise-seed bu credential'ı üretmez); orijinal
  hash geri alınamaz (yerel backup yok, `DATABASE_BACKUP_ENABLED=false`). **Onarım (kullanıcı kararı — local demo):**
  credential kullanıcının belirlediği bilinen bir demo parolasına resetlendi; deployed :4000 üzerinden doğrulandı —
  yeni parola login 200, eski smoke şifresi → 401, customerId değişmedi, orders(4)/returns(1)/reviews(3 PENDING)/
  R000001 APPROVED korundu, prod/başka store etkilenmedi. Diğer tüm smoke mutasyonları zaten restore edilmişti.
  **Hardening (kalıcı):**
  `packages/db/scripts/smoke-credential-safety.ts` — `assertSmokeCredentialTarget` (yalnız `smk_`/`smoke-`/
  `rev-`/`test-` fixture; gerçek müşteri fail-closed) + `withSmokeCredential` (snapshot + `try/finally` birebir
  restore; cleanup fail = smoke fail) + 7 birim test (`packages/db/test/smoke-credential-safety.test.ts`); kural
  `docs/OPERATIONS.md`'ye kalıcı yazıldı (izole `smk_` müşteri + FK-güvenli teardown).

## Unified Session Policy (ADR-271) — future teknik borç (2026-08-04)

ADR-271 IMPLEMENTED (analiz + implementasyon + tam gate + gerçek browser smoke; commit/deploy YOK). Aşağıdaki
başlıklar bilinçli olarak KAPSAM DIŞI bırakıldı (bu faz temeli kurar; hepsi additive genişletir):

- **TD-178 (Session device management UI) — 🔵 FUTURE:** Account/Security ekranında aktif oturum listesi (cihaz/UA/IP,
  son etkinlik, oturum sonu). Bu fazda yalnız yardımcı metin + i18n hazır (`session.helperRememberOn/Off`,
  `lastActivity`, `endsAt`); liste UI + veri ucu future. `PlatformSession`/`CustomerSession` zaten UA/IP tutuyor.
- **TD-179 (All-devices logout / revoke-all UX) — 🔵 FUTURE:** Kullanıcı-tetikli "tüm cihazlardan çıkış". Gateway
  `revokeAllSessions` (customer) zaten var (parola değişiminde kullanılıyor); platform tarafı + UX + audit future.
- **TD-180 (Session anomaly detection) — 🔵 FUTURE:** Eşzamanlı uzak IP/UA sıçraması, imkânsız-seyahat, rotation
  soyağacı (`rotatedFromSessionId`) üzerinden anomali skorlama + opsiyonel step-up. Şu an yalnız rotation kaydı var.
- **TD-181 (Storefront social login & identity linking) — 🔵 FUTURE (roadmap adayı):** Sosyal sağlayıcı (Google/Apple)
  ile giriş + tek `Customer` kimliğine bağlama (ADR-032). Unified Session Policy bunun oturum temelidir; sıradaki
  roadmap adayı budur.
- **TD-182 (Provider logout / token revocation) — 🔵 FUTURE:** Sosyal login geldiğinde sağlayıcı tarafı logout /
  refresh-token revocation (RP-initiated logout). TD-181'e bağımlı.
- **TD-183 (Unsaved-form granular escalation) — 🟡 FUTURE:** Idle-öncesi uyarı modalı + geri sayım zaten "sessiz
  redirect yok" garantisini verir (kullanıcı 5 dk önceden uyarılır) ve POST otomatik yeniden gönderilmez. Form-bazlı
  "kirli durum" tespitiyle modalı yükseltme (or. "kaydedilmemiş değişiklik var") her formun opt-in'ini gerektirir →
  additive; formlar kademeli benimser.
- **TD-184 (Legacy TTL config temizliği) — 🟢 MINOR:** `SESSION_TTL_SECONDS` / `CUSTOMER_SESSION_TTL_SECONDS` artık
  oturum ömrü OTORİTESİ DEĞİL (policy penceresi otorite); geriye-uyum için env şemasında bırakıldı. İleride
  kaldırılabilir (başka tüketici yoksa) — düşük öncelik.
- **TD-185 (ADR-271 §7 migration full-table UPDATE — kabul edilen borç) — 🟡 (2026-08-04):** Orijinal §7 migration'ının
  backfill'i (`UPDATE … SET lastActivityAt = updatedAt, rememberMe = false`) immutable kaldı (zaten uygulandı). Bu
  koşulsuz full-table `UPDATE` büyük `PlatformSession`/`CustomerSession` tablosunda satır-kilidi/tablo-yükü yaratabilir
  → **prod deploy'da düşük-trafik/maintenance penceresi gerektirir** (M2 kabul edilen borç). Follow-up hardening
  migration `20260804170000` fast-default kullanır (tablo rewrite/UPDATE yok); ileriki ADR-271 migration'ları da
  fast-default/`SET DEFAULT` pattern'ini izlemeli. Detay: ADR-271 §8, OPERATIONS deploy runbook.
- **TD-186 (Private media hâlâ uygulama-katmanı guard) — 🟡 (2026-08-04; C1 sonrası kalan borç):** C1 hardening'i
  substring-bypass'ı kapattı (iteratif-decode + segment-bazlı `returns` eşleşmesi), ama private media erişimi hâlâ
  **uygulama-katmanı guard + non-enumerable storage key** üzerine kurulu (fastifyStatic dosya sistemi + gateway
  `classifyMediaRequestPath`). Gerçek private-bucket / signed-URL (object-store, süreli imzalı erişim) ileriye
  ertelendi. Detay: ADR-269 Post-Audit Hardening (C1), `apps/api-gateway/src/media/private-guard.ts`.
- **TD-187 (RefundIntent enum genişletme — henüz gerekmiyor) — 🟢 MINOR (2026-08-04):** `RefundIntent` durum enum'u
  `PENDING`/`PROCESSED`/`CANCELLED` (R1 ile eklendi) ile yeterli; `CONSUMED`/`FAILED` gibi değerler **eklenmedi**.
  TODO-170 gerçek provider refund + append-only ledger geldiğinde (partial-fail / provider-hata modellemesi gerekirse)
  additive olarak eklenebilir. Şu an gereksiz karmaşıklık olmasın diye kapsam dışı.
- **S5 (Cookie Secure env hardening) — ✅ CLOSED (2026-08-04):** Ortak `@commerce-os/utils` `resolveCookieSecure`/
  `resolveSameSite`. Boş/whitespace env → default (prod `Secure=true`); `"false"`/geçersiz production'da **fail-fast**;
  5 cookie modülü (Platform Admin + Store Admin session & CSRF, Storefront customer) tek policy + set/clear parity.
  `ADMIN_COOKIE_SECURE=""` → kazara `Secure=false` footgun'u kapandı. Testler: utils parser + admin parity.
- **S3 (Activity throttle footgun) — ✅ CLOSED (2026-08-04):** `SESSION_ACTIVITY_THROTTLE_SECONDS` `.positive()`
  (0 reddedilir) + `assertActivityThrottleSeconds` production alt sınırı **30 sn** (default 300); `loadConfig` fail-fast;
  <30 yalnız dev/test, production'a sızamaz. Birim: saniye.
- **S7 (warningLeadSeconds server-refresh) — 🟡 FUTURE (düşük etki):** SessionGuard client'ı `warningLeadSeconds`'i
  poll'lar arası server'dan yeniden almaz (login/extend/me anındaki değeri kullanır). Politika nadiren değiştiği için
  düşük etkili; ileride timing yanıtından tazelenebilir.
- **P3 (single-tab pending-work refresh) — 🟡 FUTURE (düşük etki):** Bekleyen-iş sayacı mutation sonrası aynı sekmede
  tazelenir; sekmeler arası anlık senkron (BroadcastChannel) future. P1/P2 semantiği doğru (allowlist + invariant).

## Return Decision Flow Simplification — Faz 1 açık future kalemler (2026-08-06)

Faz 1 (`docs/analysis/RETURNS-FLOW-SIMPLIFICATION.md`, K1–K4) implementasyonu tamamlandı (2396 test yeşil;
commit/deploy YOK). Aşağıdakiler bilinçli olarak kapsam dışı bırakıldı veya denetimde bulunan küçük borçlar:

- **TD-188 (PROCESSING refund reconcile — TD-FR-5 ile AYNI borç, çoğaltılmadı) — 🟡 FUTURE:** İnceleme→
  "İadeyi yap" orchestration'ında (`apps/api-gateway/src/returns/routes-admin.ts`
  `POST /stores/:storeId/returns/:returnId/inspect-decision`) provider async kabul ederse (`PROCESSING`)
  otomatik reconcile scheduler YOK — yalnız admin `refresh` (status query). MOCK/manuel modda sorun değil;
  bu zaten TODO-170/ADR-272'nin **TD-FR-5**'i (provider-native refund webhook + scheduled reconciliation)
  ile aynı borç — ayrı TD numarası açılmadı, Faz 1 bu borcu genişletmedi/kapatmadı.
- **TD-189 (Review-started event $queryRaw'ı yalnız gerçek-DB integration testiyle doğrulanıyor) — 🟡 FUTURE:**
  `writeReviewStartedEvent` (`apps/api-gateway/src/returns/review-event.ts:63-71`) idempotency'yi parametreli
  `$queryRaw` exact-match (`fromStatus::text = toStatus::text`) ile kurar; bu SQL yolu yalnız
  `test/returns-review-event.integration.test.ts` (gerçek `commerce_os_test` DB, `DATABASE_URL` set) ile
  kapsanır — CI'da DB yoksa **SKIP** edilir (repo genelinde kabul edilen desen). Raw SQL sözdiziminde bir
  regresyon, yalnız yerel/manuel DB'li çalıştırmada yakalanır, varsayılan CI'da DEĞİL. Pure/mock-tx birim
  testi (DB'siz) eklenmedi.
- **TD-190 (Order-level vs return-level refund-context iki ayrı endpoint, DRY değil ama tutarlı) — 🟢 MINOR:**
  `GET /stores/:storeId/returns/:returnId/refund-context` (`refunds/routes-admin.ts:225`) ve `GET
  /stores/:storeId/orders/:orderId/refund-context` (`refunds/routes-admin.ts:235`) AYNI veri otoritesini
  (`loadOrderMoney`, `refunds/routes-admin.ts:108`) çağırır — tek kaynak, tutarlı. Ancak yanıt objesini
  kuran alan listesi (`capturedMinor/succeededRefundMinor/activeRefundMinor/pendingMinor/processingMinor/
  netCollectedMinor/refundableRemainingMinor`) üç ayrı yerde (`buildReturnContext` ~L194, order-level route
  ~L252, manual-complete route ~L417) elle tekrarlanıyor. Ortak bir `serializeMoneyFigures(money)` helper'ı
  çıkarılabilir — davranış değişmez, yalnız kopya azalır.
- **TD-191 (Finance raporunda `refundAmountsSupported` ölü hint dalı) — 🟢 MINOR:**
  `apps/store-admin-web/app/(app)/finance/reports/page.tsx:361` `hint={data.refundAmountsSupported ?
  undefined : "İade tutarı altyapısı henüz yok"}` — TODO-170/ADR-272 deploy sonrası `refundAmountsSupported`
  her zaman `true` döner (bkz. `finance/metrics.ts`), dolayısıyla `false` dalı (uyarı metni) fiilen hiç
  render edilmiyor. Kod hâlâ doğru/güvenli (flag korunuyor, taklit değer üretilmiyor) ama görünmeyen ölü UI
  dalı — flag tamamen kaldırılırsa (yalnız TODO-170 kalıcı/geri alınamaz kabul edilirse) sadeleştirilebilir;
  şimdilik dokunulmadı (flag'in kendisi ADR-268 §5 dürüstlük sözleşmesinin parçası).
- **TD-192 (RECEIVED/INSPECTION_REQUIRED'ten doğrudan red — backend izin vermiyor, iki adımlı yol gerekli) —
  🟡 FUTURE:** State-machine (`apps/api-gateway/src/returns/status-map.ts:46-48`) `RECEIVED` ve
  `INSPECTION_REQUIRED`'den yalnız `INSPECTED`/`INSPECTION_REQUIRED`'e izin verir — `REJECTED` YOK
  (`REJECTED` yalnız `REQUESTED`/`UNDER_REVIEW`/`INSPECTED`'ten erişilebilir). Ürün teslim alındıktan
  (`RECEIVED`) sonra admin doğrudan `/reject` çağıramaz — önce inceleme kararını (`INSPECTED`'e geçiş)
  kaydetmesi, SONRA reddetmesi gerekir (iki adım). Bilinçli değil, bu fazın kapsamı dışında bırakıldı;
  `RECEIVED → REJECTED` doğrudan geçiş eklenirse (K1'in "Faz 3" kalem-bazlı red modeliyle birlikte
  değerlendirilmeli) admin akışı bir adım kısalır.

## TODO-172 (ADR-273) — Fast Refund Controls teknik borç / gelecek

- **TD-193 (Fast Refund limit tek-para-birimi varsayımı) — 🟡 FUTURE:** `fastRefundMaxAmountMinor` bare
  minor-unit; `fastRefundCurrency` null iken limit **sipariş para biriminde** yorumlanır (mağazanın tek
  para birimi çalıştığı varsayımı). Store'da currency alanı YOK (otorite `Order.currency`). Gerçek
  multi-currency store için `fastRefundCurrency` set edilmeli (aksi eşleşmezse `FAST_REFUND_CURRENCY_MISMATCH`
  → normal akış); per-currency ayrı limit tablosu ileride değerlendirilebilir.
- **TD-194 (Fast Refund BigInt kolonu serileştirme sınırı) — ✅ CLOSED (2026-08-07):** ilk çözüm
  serileştirmede `Number(bigint)` kullanıyordu (2^53 üstü precision riski). Ship-hardening'de **kanonik
  ondalik string kontrat** + ortak BigInt-tabanlı `@commerce-os/utils` money helper
  (`parseMinorString`/`minorToCanonicalString`/`compareMinorStrings`/`formatMinorMoney`; float YOK) ile
  kapatıldı: `fastRefundMaxAmountMinor` + fast-refund-context tutarları API'de string taşınır, server
  string→BigInt doğrular, client güvenli helper'la parse/format eder. `packages/utils/test/money.test.ts`
  (0/eşit/üstü/`MAX_SAFE_INTEGER`+1/invalid/negative/leading-zero/round-trip). Güvenli sözleşme artık borç
  değil. NOT: diğer para alanları (Order.totalAmount vb.) hâlâ INTEGER minor-unit — bu kapsam TODO-172
  değil; genel BigInt göçü ayrı bir iş olarak değerlendirilebilir (bu özellik için gerekmiyor).
- **TD-195 (Yüksek-tutar çift onay — dual approval) — 🟡 FUTURE:** Fast Refund tek SUPER_ADMIN onayıyla
  başlatılır. Yüksek-tutarlı hızlı iadeler için ikinci bir onaylayıcı (dört-göz ilkesi) gelecekte
  eklenebilir; şu an limit + audit + risk özeti caydırıcı kontroller.
- **TD-196 (Fraud scoring motoru) — 🟡 FUTURE:** Risk context yalnız mevcut veriden **bounded summary**
  üretir (müşteri sipariş/iade sayısı, son-90-gün hızlı iade). Davranışsal fraud scoring motoru (anomali,
  velocity, cihaz/IP) kurulmadı — kapsam dışı; gerektiğinde ayrı modül.
- **TD-197 (Per-role return permissions) — 🟡 FUTURE:** Fast Refund iade domenine ilk granular yetkiyi
  (`RETURN_FAST_REFUND` = SUPER_ADMIN) getirdi. approve/reject/inspect gibi diğer iade aksiyonları hâlâ
  kaba-taneli (herhangi platform admin). İleride per-role return permission matrisi değerlendirilebilir.
- **TD-198 (Fast Refund UI component testi yok; browser smoke'a dayanıyor) — 🟢 MINOR:** Store-admin return
  detail sayfasının dedicated component testi yok (mevcut durum; CTA/modal davranışı browser smoke ile
  doğrulanır). Backend saf+entegrasyon 37 test kapsar. İleride RTL component testi eklenebilir.
- **TD-199 (store-admin test flaky — KÖK NEDEN çözüldü) — ✅ CLOSED (2026-08-07):** iki form testi
  (campaigns/categories create) tam-suite yük altında 5000ms timeout'una takılıyordu. Kök neden:
  `userEvent` varsayılan `delay: 0` her tuşta `setTimeout(0)` macrotask planlar; ~67 tuşluk ağır akışlar +
  varsayılan `forks` havuzunun çekirdek-sayısı-kadar fork'la CPU'yu aşırı-abone etmesi event-loop'u
  aç bırakıyor. Fix (maske DEĞİL): o iki dosyada `userEvent.setup({ delay: null })` (async assertion'lar
  güvenli) + `apps/store-admin-web/vitest.config.ts` `maxForks = çekirdek−2` (zamanlama düzeltmesi) +
  `products-form-primary-category` senkron-assertion race'i `findByText` ile giderildi. Store-admin suite
  5× arka arkaya tam yeşil. `.skip`/retry/timeout-artırma KULLANILMADI.

## TD-173-* — Reverse Shipment FUTURE (TODO-173 / ADR-274)

- **TD-173-1 — `CUSTOMER_RETURN_TO_STORE` modele bağlama.** Müşteri→mağaza iade kargosu bugün `ReturnRequest.
  returnCarrier/returnTrackingNumber/shippedAt` string alanlarıdır; enum değeri RESERVED. Shipment modeline
  taşıma: dual-write → backfill → storefront/admin projection migration → legacy field deprecation. Bağımsız
  migration + regresyon fazı; Reverse Shipment PR'ına sıkıştırılmadı (K2).
- **TD-173-2 — Reverse shipment gerçek carrier/label automation.** Şu an manuel (serbest-metin carrier +
  takip no; provider çağrısı yok). Gerçek online carrier label transportu FUTURE.
- **TD-173-3 — Reverse shipment SLA + maliyet muhasebesi.** Ters gönderi teslim SLA'sı ve lojistik maliyet
  kaydı FUTURE (bu faz yalnız lojistik/audit izi).
- **TD-173-4 — SUPER_ADMIN istisna yönetimi.** Yüksek-maliyetli carrier override / manuel ücret yazma /
  force-cancel-complete için güçlü yetki katmanı FUTURE (bu faz normal operasyon = `requireStoreAdmin`).

## Test Infrastructure Hardening — CLOSED (PR #187 `cb70738`, 2026-08-07)

CPU oversubscription kaynaklı UI-test flakiness'i YAPISAL çözüldü (timeout/skip/retry YOK): ortak
`vitest.shared.ts` `boundedForkPool({heavy})` (heavy UI = `min(4,cores-1)`, backend = `cores-2`) + UI/backend
vitest config'leri + root `test`=`turbo run test --concurrency=1` (cross-suite serial) + turbo.json test
`passThroughEnv:["DATABASE_URL"]`. Doğrulama: 3 flaky ×10 izole, 3 UI suite ×5, full workspace ×2 (42/42
first-try). Reverse Shipment ile ayrı PR (feature diff kapsamı korundu).

> **Ayrı FUTURE — CI governance (Actions outage'dan öğrenilen):** `workflow_dispatch` desteği · main branch
> protection · required CI checks · Actions outage runbook. Reverse/test-infra PR'larına KARIŞTIRILMADI;
> bağımsız iş olarak ele alınacak.

## Post-PR163 Returns/Refund/Reverse Shipment UI Alignment — 2026-08-07

PR #163 (Final Enterprise UI Polish) SONRASI eklenen Returns/Refund/Fast-Refund/Reverse-Shipment yüzeyleri
(TODO-169…173), o polish'in kapattığı enterprise UI standardına (typography/spacing/badge/empty-loading-error/
ProductMediaFrame/responsive/a11y/focus) göre hizalandı. **Bu iş B1/C1/D1/TD-170/TD-173/TD-157/FP-3'ü YENİDEN
AÇMAZ** — onlar CLOSED & DEPLOYED kalır. Yalnız yeni yüzeylerde doğrulanan drift/eksik düzeltildi (polish +
gerçek UI bug); backend/business/API/migration DEĞİŞMEDİ. 9 dosya (+258/−106).

**Store Admin (dark kit):**
- Ham-enum ödeme rozeti (return detail): `{orderPaymentStatus}` → friendly label (`paymentStatusLabel`, admin
  `paymentLabels` sözcükleri) + paylaşılan `PAYMENT_STATUS_TONES` (yerel 4-key tone map kaldırıldı; standart #1).
- Reverse-shipment panel yıkıcı iptaller (disposition cancel + shipment cancel) tek-tık ham link → **onay modali**
  (refund-panel `ConfirmDialog` deseni; danger flag). Shipment cancel `danger` Button (ters hiyerarşi düzeldi).
- Responsive: disposition/shipment satırları `flex-wrap`/`min-w-0`/`shrink-0`, uzun tracking `break-all`
  (375px yatay taşma giderildi). Modal footer çift-`div` sarma → fragment (Modal zaten flex/justify-end/gap).
  Modal cancel `ghost`→`secondary` (kardeş dialog'larla tutarlı). Disposition badge `dot` (ship-status ile eş).
- Alert "Kapat" ham underlined `<button>` → `Button variant="ghost"` (focus state). Returns list SLA checkbox
  `accent` + `focus-visible:ring` (klavye a11y).

**Storefront (light editorial kit):**
- **Reverse-shipment section i18n (tek gerçek standart ihlali):** hardcoded TR/EN `isTr` dallanması kaldırıldı;
  yeni `account.returns.detail.reverseShipment` sözlük bloğu (title/disclaimer/ariaLabel + **11-değerli** tam
  `statuses` map, ham enum sızmaz + shipped/estimatedDelivery/delivered). Failed-durum için danger tonu
  EKLENMEDİ (editorial Badge nötr — design language korundu; durum metinle iletilir).
- Wizard: `QuantityStepper` `aria-label="−/+"` → açıklayıcı lokalize (`decreaseQuantity`/`increaseQuantity`).
  Submit hatası çift-render (role=alert özet + inline `red-600` kopya) → tek kaynak (kullanılmayan `submitState`
  state kaldırıldı).
- Return detail status badge tone parite (`ink`→`outline`, list ile). Returns list boş-state description + CTA
  (kardeş yüzeylerle tutarlı).
- **Browser smoke sırasında bulunup düzeltilen gerçek bug:** return-detail `Row` bileşeni uzun değerleri
  (48-karakter takip no) 375px'de yatay taşırıyordu → `min-w-0 break-all text-right` + label `shrink-0`.

**Gate:** typecheck (i18n+2 app) ✅ · lint 9/9 ✅ · test Run1 = Run2 (storefront 550/550, store-admin 368/368,
flake yok) ✅ · build 8/8 ✅ · `git diff --check` temiz ✅. **Browser smoke** izole throwaway fixture ile
(store `zzz-uitest-reverse` + admin + customer + order + return + rejected item + RETURN_TO_CUSTOMER disposition
+ IN_TRANSIT reverse shipment + SUCCEEDED refund): Store Admin (returns list · return detail · reverse panel ·
disposition modal · confirm dialog + focus-trap + ESC-restore · refund panel) ve Storefront (return detail ·
reverse section · refund-vs-reverse ayrımı · returns list) 375/768/1024/1440'ta doğrulandı; 4 breakpoint'te
yatay taşma yok. Fixture FK-güvenli teardown: residue=0, inventory net=0, enterprise-demo (R000001) değişmedi.

> **FUTURE (bu PR'a alınmadı, TODO-173 kapsamına bırakıldı):** reverse-shipment quantity input `Number(...)`→
> `NaN` guard'ı (empty input'ta submit butonu enable kalabilir — client validation/business sınırı); inspect→
> reject iki-mutation sequencing (business). Ayrıca CI governance ve TD-173-1…4 FUTURE kalır.

**CLOSED & DEPLOYED (2026-08-07):** PR #190 (merge `ab1bbec`); CI lint·test·build 5m59s PASS. Deploy: docker `storefront-web` + `store-admin-web` main'den rebuild+recreate (api-gateway/worker/postgres/redis DOKUNULMADI — i18n reverseShipment/wizard yalnız web dict). Post-deploy smoke: store-admin returns list + R000001 detay production build render + SA-1 friendly ödeme rozeti + taşma yok; storefront home/PLP 200, account/returns login-render, reverseShipment key deployed bundle'da. İzole browser-smoke fixture FK-güvenli temizlendi (enterprise-demo R000001 değişmedi).

## TODO-174 Customer Self-Service Order Cancellation — açık borç (FUTURE)

- **TD-CXL-1** `Order.version` yalnız self-servis iptal akışında bump edilir (genel optimistic-lock değil).
  İleride sipariş mutasyonlarına yaygınlaştırılabilir. Şu an iptal-vs-handoff yarışı için yeterli.
- **TD-CXL-2** Shipment create-yolu (`create-order`/`shipment-draft`/`dhl/prepare`) `ensureOrderNotCancelled`
  guard'ı ile korunur ama tx-dışı okuma nedeniyle DRAFT shipment oluşturmada teorik mikro-yarış penceresi kalır
  (yeni shipment DRAFT = handoff değil, zararsız). IN_TRANSIT handoff `/status` route'unda tx-içi guard +
  koşullu update ile airtight'tır (ADR-275).
- **TD-CXL-3** Legacy/admin `cancelOrder` (server.ts) taksonomi alanlarını (cancelSource/reasonCode/Category)
  YAZMAZ → İptal Raporu'nda source=null bucket'ında görünür. Admin iptalini taksonomiye taşımak FUTURE.
- **TD-CXL-4** İptal Raporu CSV export'u YOK (finance raporlarının aksine); tab'da export butonu gizli. FUTURE.
- **TD-CXL-5** Taksonomi değişikliği (yeni reason ekleme/INACTIVE) gelecekteki `Store → Platform Request & Task
  Management` domain'i üzerinden yapılacak; bu fazda enum + registry çift-kaynak elle güncellenir (ADR-278).

## TODO-174A Cancellation UX & Refund Visibility — açık borç (FUTURE)

- **TD-174A-1** `OrderExperienceReview` için Store Admin görünürlük/moderasyon UI'ı ve sipariş-deneyimi
  metriği (raporlama) YOK — bu fazda yalnız müşteri yakalama. Ürün kararı: ileride admin raporlamasında
  kullanılabilir (ADR-279). **✅ RESOLVED (TODO-174B, 2026-08-07):** Store Admin `Müşteri Deneyimi > Sipariş
  Deneyimi` yüzeyi (liste + KPI + recovery case detay/lifecycle) + otomatik recovery case (1-2★) + goodwill
  credit shipped (ADR-283). ProductReview/aggregate'e sıfır dokunuş korundu.

## TODO-174B Order Experience Recovery + Store Credit — açık borç (FUTURE)

- **TD-174B-1** ✅ **RESOLVED (2026-08-08, PR #201, DEPLOYED 2026-08-08):** Store Admin **sipariş detayı** "Sipariş
  Deneyimi" kartı (rating + yorum + recovery durumu + atanan + tanımlanan goodwill + geri kazanım detayına
  köprü) + payment-summary **Ödeme dağılımı** satırları eklendi. Ödeme dağılımı BUG-CART-005
  `buildPaymentAllocations` projeksiyonu REUSE edilerek serializeOrder'a additive `paymentAllocations` alanı
  olarak taşındı (STORE_CREDIT → "Mağaza bakiyesi"; toplam = captured toplamı invariant). Tek-sipariş özet ucu
  `GET /stores/:storeId/order-experience/orders/:orderId` (review yoksa 200+null; fail-open kart gizlenir).
  Storefront credit-used satırı (`shoppingCreditUsedMinor`) hâlâ FUTURE (bu iş yalnız store-admin).
- **TD-174B-2** ✅ **RESOLVED (2026-08-08, PR #201, DEPLOYED 2026-08-08):** (a) **Alışveriş bakiyesi finansal raporu** —
  Finans>Raporlar yeni "Alışveriş Bakiyesi" sekmesi (`GET /stores/:storeId/finance/credit-report`): NOKTA-ANLIK
  outstanding liability (canlı lot Σ remaining, expiresAt>now) + dönem-içi issued/spent/restored/expired/
  goodwill/adjustments-net; tek para birimi (mixed-currency toplamı yok). (b) **Recovery raporu** — Sipariş
  Deneyimi sayfası yeni "Geri kazanım raporu" bölümü (`GET /stores/:storeId/order-experience/report`): puan
  trendi (zero-fill gün serisi) + ort. ilk temas / ort. çözüm süresi + ulaşma oranı + outcome dağılımı +
  goodwill; KPI grid'ine goodwill toplamı kartı eklendi. Tümü storeId-scoped + bounded aralık (finance
  date-range REUSE).
- **TD-174B-3** ✅ **RESOLVED (2026-08-08):** 4-viewport (375/768/1024/1440) gerçek-auth izole-fixture browser
  smoke koşuldu (worktree gateway :4100 + store-admin :3102, enterprise-demo): order-detail ödeme dağılımı
  (Mağaza bakiyesi ₺300 + Visa ••••4242 ₺700 = ₺1000 invariant) + Sipariş Deneyimi kartı (1★/Açık/goodwill
  ₺250/link) · recovery raporu (trend/timing/outcome) · credit raporu (outstanding = issued−spent invariant,
  recovery goodwill ₺250) · 4 viewport yatay taşma YOK · fixture FK-güvenli temizlendi (enterprise-demo PRISTINE
  471). 6 yeni gerçek-DB test (getOrderExperienceForOrder + recoveryReport + creditReport; store-izolasyon dahil).
- **Gift Card Purchase / Code Redemption** — hediye kartı satın alma / kod üretme / redeem / 3. kişiye hediye /
  e-posta teslim / gift-card ürün-expiry politikası bu fazda KAPSAM DIŞI (spec §13). Customer Shopping Balance /
  Store Credit foundation ACTIVE; gift-card ürünü FUTURE.
- **TD-174A-2** Store Admin birleşik İadeler listesinde `RETURN_REQUEST` satırları refund tutar/durum
  kolonlarını (refundStatus/refundAmountMinor) DOLDURMAZ (null) — iade refund durumu iade detayında
  gösterilir. Cancellation satırları refund alanlarını taşır. İstenirse return satırlarına da roll-up
  refund özeti eklenebilir (ADR-280). FUTURE.
- **TD-174A-3** Birleşik admin listesinde sıralama yalnız `createdAt` (requestedAt); eski return-özel
  sortBy `returnWindowEndsAt`/`status` kaldırıldı (kaynaklar-arası anlamsız). Return-only görünümde bu
  sıralamalar istenirse `source=RETURN_REQUEST` filtresiyle geri getirilebilir (kod eklenmesi gerekir).
  FUTURE.

- **TD-175-1** TODO-175 tam 4-viewport (375/768/1024/1440) gerçek-auth UI browser click-through
  standart smoke harness'ında tamamlanmalı (cancel modal destination adımı + split · return wizard
  destination · İadelerim/Bakiyem görünürlük · store-admin detail/list). Bu oturumda ad-hoc worktree
  kurulumunda storefront STORE_SLUG çözümlemesi fixture store'a bağlanmadı (config quirk, feature
  defect'i DEĞİL); API-katmanı gerçek-auth doğrulaması (cancel-eligibility split + /me) YAPILDI ve
  tüm UI birim testleri (storefront 569 · store-admin 368) yeşil. FUTURE.
- **TD-175-2** Unified İadeler admin listesinde `refundDestination` KOLON/badge var; **filtre** eklenmedi
  (gateway list sorgusu `refundDestination` param'ını henüz onurlandırmıyor — no-op filtre yanıltıcı
  olurdu). İstenirse gateway `returnWhere`/`cancelWhere`'e destination filtresi eklenebilir (ADR-285). FUTURE.
- **TD-175-3** Return detail (`AdminReturnDetail`) `refundDestination`'ı DTO'da taşımıyor; müşteri hedefi
  RefundPanel'de OrderRefund ledger satırlarından türetiliyor. İstenirse serialize'a additive alan
  eklenip başlıkta gösterilebilir. FUTURE.

## TODO-176 Playwright E2E Regression Suite — açık borç (PR1 sonrası, FUTURE)

PR1 (ADR-287) yalnız altyapı + auth + 8 çekirdek smoke senaryosu + CI gate'i kapsar. Aşağıdakiler
bilinçli olarak PR1 kapsamı DIŞINDA bırakıldı.

- **TD-176-1 PR2 senaryoları — henüz Playwright kapsamında değil.** Aşağıdaki kritik akışların hiçbiri
  `tests/e2e/` içinde henüz bir kalıcı test olarak yok (yalnız manuel/exploratory doğrulanmış olabilir):
  reorder / BUG-CART-006 invariant (`reorder == /cart == checkout` — sipariş tekrar-ver akışının sepet
  ve checkout ile aynı satır/qty/fiyat kimliğini üretmesi), shopping-balance-only ödeme (TODO-174B),
  mixed balance+external ödeme, self-servis cancellation (TODO-174), return (TODO-169/171), refund
  ORIGINAL_PAYMENT (TODO-175), refund SHOPPING_BALANCE (TODO-175), İadelerim listesi/detayı, Alışveriş
  Bakiyem (hareket geçmişi), wishlist (TODO-159D), ürün review (TODO-159E), order-experience review
  (TODO-174A). Bu senaryoların her biri ayrı bir plan/PR olarak (`tests/e2e/smoke/` altında yeni spec
  dosyaları + gerekiyorsa `e2e-seed.mjs`'e additive fixture — PR1'in "yalnız ilk 8 senaryonun ihtiyacını
  seed'e ekle" kararı gereği bugün seed'de YOK) ele alınmalı. FUTURE.
- **TD-176-2 Per-worker cart isolation — `workers:1` paralelliği engelliyor.** `smoke`/`responsive`
  projelerindeki tüm testler **aynı** e2e müşterisinin (`e2e-customer@example.test`) DB-tabanlı
  (server-authoritative) sepetini paylaşır (bkz. `tests/e2e/fixtures/cart.ts`, `playwright.config.ts`
  üstündeki yorum). `fullyParallel:false` yalnız dosya-içi sırayı garanti eder, dosyalar-arası
  izolasyonu SAĞLAMAZ — bu yüzden `workers:1` zorunlu ve suite'i seri çalıştırır (CI süresi doğrudan
  test sayısıyla orantılı büyür). Gerçek çözüm: her worker'a **ayrı** bir e2e müşterisi/sepet ataması
  (ör. `e2e-customer-w{workerIndex}@example.test`, `playwright.config.ts` `testInfo.parallelIndex`
  bazlı fixture seçimi + seed'e N müşteri eklenmesi) — bu, paralelliği yeniden açar. FUTURE.
- **TD-176-3 `e2e-store` search read-model boş — PLP/arama prod-smoke yolları local'de skip.**
  `e2e-seed.mjs` yalnız Prisma tablolarına yazar; arama/facet read-model'ini (TODO-154
  `ProductSearchDocument`/`FacetValue`) besleyen backfill/worker'ı TETİKLEMEZ. Bu yüzden
  `prod-smoke` projesindeki `E2E_PROD_CATEGORY_SLUG`/`E2E_PROD_SEARCH_TERM` kontrolleri **local**
  `e2e-store`'a karşı koşulursa boş/uyumsuz sonuç dönebilir (bu iki kontrol PR1'de zaten opsiyonel ve
  env tanımsızsa görünür `test.skip` ile atlanıyor — ör. `e2e-store` local koşumunda bilinçli olarak
  tanımlanmıyor). Gerçek veriyle bu iki yolu egzersiz etmek için `e2e-seed.mjs` sonrası search backfill/
  worker adımı eklenmeli (ör. `db:backfill-enterprise` desenine benzer bir `db:backfill-e2e`, veya
  worker'ı seed sırasında senkron tetikleme). FUTURE.
- **TD-176-4 Cross-browser/device matrisi (BrowserStack vb.) — FUTURE.** PR1 yalnız Desktop Chromium
  (+ küçük responsive-viewport subset, 375/1440) koşar. Gerçek tarayıcı (Safari/Firefox) ve gerçek
  cihaz matrisi bilinçli olarak kapsam DIŞI bırakıldı (ADR-287 Alternatifler). Değerlendirme kriteri:
  prod'da tarayıcıya-özel bir regresyon rapor edilirse veya kullanıcı tabanı analytics'i belirli bir
  tarayıcı/cihaz sınıfında anlamlı pay gösterirse önceliklendirilir. Aday araç: BrowserStack (veya
  eşdeğeri) Playwright entegrasyonu. FUTURE.
- **TD-176-5 Required-status-check governance — repo-admin adımı bekliyor.** `.github/workflows/e2e.yml`
  eklemek onu otomatik olarak branch-protection'da **required** yapmaz. Repo admin'in, `main` branch
  protection/ruleset'ine tam context adını **`smoke`** (workflow adı `e2e` + job adı `smoke`)
  required-status-check olarak eklemesi gerekir — örn.:
  ```
  gh api repos/:owner/:repo/branches/main/protection/required_status_checks/contexts \
    --method POST -f contexts[]='smoke'
  ```
  (veya repo ruleset UI/`gh api .../rulesets`). Bu adım workflow ilk kez bir PR'da çalışıp context'in
  GitHub'da görünür hale gelmesinden SONRA yapılabilir. PR1 kapsamında bu adım YAPILMADI (repo-admin
  yetkisi bu task'ın kapsamı dışında) — açık governance notu olarak burada takip edilir. FUTURE.
- **TD-176-6 Console-error assertion — `next dev` HMR/hydration gürültüsüne karşı kırılgan olabilir.**
  Smoke testlerindeki `expect(errors).toEqual([])` / `not.toContainText(raw enum)` kontrolleri gerçek
  `next dev` (host :3100 local, `storefront-web-e2e` CI) sunucusuna karşı koşar — production build
  değil. Eğer CI'da HMR/hydration kaynaklı benign console/page hatası flaky bir kırmızıya yol açarsa,
  `tests/e2e/fixtures/` altına bir "bilinen-benign pattern allowlist" yardımcı fonksiyonu (ör.
  `isBenignDevError(message)`) eklenip yalnız gerçek hatalar assert edilmeli — bugün böyle bir filtre
  YOK (ham `errors.length === 0` / `toEqual([])`). Şu ana kadar (PR1 gate koşumlarında) gözlemlenmedi;
  gözlemlenirse eklenecek. FUTURE.
