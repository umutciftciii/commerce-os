# Decisions

## ADR-001 Monorepo + pnpm + Turborepo

- Durum: ACCEPTED
- Baglam: Backend, servis skeletonlari ve paylasimli paketlerin birlikte gelismesi gerekiyor.
- Karar: Proje monorepo olarak tutulacak; paket yonetimi pnpm, task orchestration Turborepo ile
  yapilacak.
- Sonuc: Paketler arasi kontrat ve build/test akislari tek repoda dogrulanir. Repo disiplini
  bozulmamasi icin workspace sinirlari korunur.

## ADR-002 Microservice-ready sinirli servis mimarisi

- Durum: ACCEPTED
- Baglam: Urun zamanla commerce, checkout, storefront, integration, search ve analytics alanlarina
  ayrilacak; erken asamada runtime karmasasi istenmiyor.
- Karar: Servisler microservice-ready olacak, ancak foundation asamasinda sinirli skeleton ve ortak
  paketlerle ilerleyecek.
- Sonuc: Servis sinirlari bugunden dokumante edilir; runtime ayrisma ihtiyaci dogdukca kontrollu
  genisletilir.

## ADR-003 Baslangicta tek PostgreSQL cluster

- Durum: ACCEPTED
- Baglam: MVP icin operasyonel basitlik ve veri modeli hizli dogrulama oncelikli.
- Karar: Baslangicta tek PostgreSQL cluster ve Prisma schema kullanilacak.
- Sonuc: Servisler kendi alan sinirlarini kod ve dokumanla korur; baska servisin DB alanina direkt
  erisim yasaktir.

## ADR-004 Redis + BullMQ

- Durum: ACCEPTED
- Baglam: Sync, notification, integration ve background job ihtiyaclari erken donemde ortaya cikacak.
- Karar: Queue foundation Redis ve BullMQ uzerine kurulacak.
- Sonuc: Worker runtime'i ve queue package ortak isleme desenlerini tasir; job idempotency fazlara
  gore genisletilir.

## ADR-005 Fastify api-gateway

- Durum: ACCEPTED
- Baglam: API gateway hafif, TypeScript dostu ve test edilebilir olmalidir.
- Karar: API gateway Fastify ile kurulacak.
- Sonuc: Health, version, auth/tenant middleware ve ilerideki route kayitlari Fastify pattern'leriyle
  ilerler.

## ADR-006 Prisma ORM

- Durum: ACCEPTED
- Baglam: PostgreSQL modeli, migration ve TypeScript tip guvencesi icin standart bir ORM gerekiyor.
- Karar: Prisma ORM kullanilacak.
- Sonuc: Schema, migration ve generated client lifecycle'i packages/db icinde tutulur; host/container
  DATABASE_URL farki dokumante edilir.

## ADR-007 Commerce core erken parcalanmayacak

- Durum: ACCEPTED
- Baglam: Product, inventory, customer ve order alanlari erken donemde sik degisecek.
- Karar: Commerce core Faz 2'de tek tutarli domain olarak ele alinacak; erken mikro parcalanmadan
  kacinilacak.
- Sonuc: Gereksiz network/runtime karmasasi ertelenir; servis sinirlari yine dokumante edilir.

## ADR-008 Docs-first proje disiplini

- Durum: ACCEPTED
- Baglam: Fazlar, teknik borclar, kararlar ve AI promptlari hizli degisebilir.
- Karar: Her faz ve anlamli degisiklik docs guncellemesiyle kapanacak.
- Sonuc: Yeni teknik borc TECHNICAL_DEBT.md'ye, yeni karar DECISIONS.md'ye, yeni is TODO.md'ye,
  faz notu PHASE_LOG.md'ye yazilir; docs guncelligi kabul kriteridir.

## ADR-009 Frontend stack: Next.js App Router + React 19 + Tailwind v3

- Durum: ACCEPTED
- Baglam: Uc frontend (super admin, store admin, public storefront) ortak monorepo icinde
  build/test/lint/typecheck uyumlu calismali; light-first premium SaaS gorunumu hedefleniyor.
- Karar: Frontend app'ler Next.js App Router, React 19 ve TypeScript strict ile kurulur. Styling
  Tailwind CSS v3 ile yapilir. Bilerek en yeni surum yerine stabil/iyi dokumante kombinasyon secildi
  (Next 15.5, React 19.2, Tailwind 3.4) cunku foundation'in deterministik build'i onceliklidir.
- Sonuc: App'ler `apps/admin-web`, `apps/store-admin-web`, `apps/storefront-web` olarak eklendi;
  Turborepo build/test grafigine dahil. Backend runtime ve Docker davranisi degismedi.

## ADR-010 Paylasimli UI paketi kaynak-transpile modeliyle

- Durum: ACCEPTED
- Baglam: Tekrar eden markup yerine ortak, light-first design system primitive'leri gerekiyor.
- Karar: `packages/ui` TypeScript/TSX kaynagi olarak yayinlanir (exports -> src). App'ler bu paketi
  `transpilePackages` ile derler. Ortak tasarim token'lari `tailwind-preset.cjs` icinde merkezilesir.
- Sonuc: Asiri soyutlamadan kacinilarak kucuk, yeniden kullanilabilir primitive seti olusturuldu;
  app'ler dist build adimi olmadan kaynaktan derler.

## ADR-011 API client placeholder paketi

- Durum: ACCEPTED
- Baglam: Frontend'in backend ile temasinin tek, type-safe ve genisletilebilir bir kanaldan olmasi
  isteniyor; ancak bu fazda gercek auth/token yok.
- Karar: `packages/api-client` eklenir. Base URL `API_GATEWAY_URL` env'inden cozulur, health/version
  helper'lari `packages/contracts` tipleriyle saglanir. Auth/token sonraki fazda eklenecek.
- Sonuc: Frontend -> gateway erisimi tek yerde toplandi; backend API kontrati bozulmadi.

## ADR-012 Design-first UI calisma kurali

- Durum: ACCEPTED
- Baglam: Placeholder ekranlarin bile tutarli, premium urun kalitesinde durmasi ve dagilmamasi
  gerekiyor.
- Karar: Yeni ana UI ekranlari once kisa "Claude Design Plan" ile tasarlanir, sonra kodlanir.
  Kural `docs/PROMPT_RULES.md` icinde kalici proje kurali olarak tanimlandi.
- Sonuc: UI calismalari tutarli bilgi hiyerarsisi, empty/loading/error yaklasimi ve light-first
  gorsel ton ile ilerler.

## ADR-013 Varsayilan urun dili Turkce

- Durum: ACCEPTED
- Baglam: Urun oncelikli olarak Turkiye pazarina hitap ediyor. Ilk UI foundation tum ekranlari
  Ingilizce uretmisti; UI smoke review'da bunun yanlis varsayilan oldugu tespit edildi.
- Karar: commerce-os'un varsayilan urun dili Turkce'dir. Tum gorunur UI metni (admin, store-admin,
  storefront) varsayilan olarak Turkce render edilir. Ingilizce ikinci dil olarak desteklenir ancak
  varsayilan degildir.
- Sonuc: `packages/i18n` icinde `defaultLocale = "tr"` tanimlandi; uc frontend app varsayilan olarak
  Turkce render eder. Gelecekteki tum UI metni de Turkce varsayilanla uretilecek.

## ADR-014 i18n-first frontend gelistirme (tipli sozluk)

- Durum: ACCEPTED
- Baglam: Sadece bir kerelik Turkce ceviri, ileride dil tutarsizligi ve hardcoded metin borcu
  uretir. Coklu dil ihtiyaci (en az tr/en) bastan ele alinmali; ancak agir bir i18n framework'u bu
  asamada gereksiz runtime ve bagimlilik karmasasi getirir.
- Karar: Frontend i18n-first gelistirilir. Tum gorunur UI metni `packages/i18n` icindeki tipli
  sozlukten okunur; bilesenlerde hardcoded gorunur metin yazmak yasaktir. Basit, bagimliliksiz bir
  sozluk sistemi kurulur: `defaultLocale = "tr"`, `supportedLocales = ["tr", "en"]`,
  `getDictionary(locale)` ve guvenli fallback. EN sozlukleri TR tip sekline bagli yazilarak derleme
  zamani key parity garanti edilir.
- Bilincli kapsam disi: runtime locale switcher, `/tr`-`/en` route prefix, tarayici dil tespiti, DB
  locale alani, Next middleware ve agir i18n framework. Bunlar ileride ayri islerde ele alinacak.
- Sonuc: `packages/i18n` eklendi; uc app tum gorunur metnini sozlukten okur. Yeni dependency
  eklenmedi. tr/en key parity testle korunur.

## ADR-015 Platform admin session token yaklasimi

- Durum: ACCEPTED
- Baglam: Faz 1A'da platform admin login, session dogrulama, logout/revoke ve admin endpoint guard'i
  gerekiyor. OAuth, 2FA, password reset ve browser cookie hardening bu fazin kapsaminda degil.
- Karar: API bearer token donduren session modeli kullanir. Raw token yalnizca login response'unda
  verilir; DB'de `SESSION_SECRET` ile uretilen SHA-256 `tokenHash`, TTL, revoke bilgisi ve opsiyonel
  user-agent/ip placeholder alanlari saklanir. Parola hash/dogrulama Node `crypto.scrypt` ile
  yapilir; ek auth dependency eklenmez.
- Sonuc: Backend endpointleri ve testleri cookie bagimliligi olmadan dogrulanir.
  `ADMIN_AUTH_COOKIE_NAME` ileride browser-cookie baglamina hazir env olarak tutulur. Rate limit,
  cookie security ve refresh token kararlarinin ayrintisi sonraki fazlara birakildi.

## ADR-016 Auth guard ve admin API contract yaklasimi

- Durum: ACCEPTED
- Baglam: Platform admin store/plan endpointleri auth gerektirmeli, ama Faz 1A commerce domain
  logic'i eklememeli. Frontend sonraki fazda bu endpointlere baglanacak.
- Karar: `packages/contracts` icinde basit Zod schema + exported type modeli kullanilir. API gateway
  route'lari platform session'i dogrular, platform admin guard uygular, input'u Zod ile validate eder
  ve tutarli `{ error: { code, message, details } }` zarfi dondurur. Store-scoped helper'lar
  `packages/auth` icinde role sirasi ve access assertion olarak hazir tutulur.
- Sonuc: Faz 1A endpointleri type-safe contract, test ve audit log ile hazir; asiri typed API
  framework veya frontend UI baglama eklenmedi.

## ADR-017 admin-web BFF (Next route handler proxy) + httpOnly cookie token saklama

- Durum: ACCEPTED
- Baglam: Faz 1B'de `apps/admin-web` canli gateway'e baglanmali (login, me, logout, stores, plans,
  system health). Iki kisit var: (1) api-gateway'de CORS yok ve backend Faz 1B'de degistirilmeyecek,
  bu yuzden tarayici dogrudan gateway'e gidemez; (2) gateway bearer token donduruyor ve token UI'a,
  log'a veya client bundle'a dusmemeli. Internal health uclari ayrica `INTERNAL_API_TOKEN` gerektirir.
- Karar: admin-web icinde **Backend-for-Frontend (BFF)** deseni kullanilir. Tarayici yalnizca
  ayni-origin Next route handler'larini (`/api/auth/*`, `/api/admin/*`, `/api/system/*`) cagirir;
  bu handler'lar `packages/api-client` ile gateway'e gider. Platform bearer token login'de **httpOnly
  cookie**'ye SERVER tarafinda yazilir (`ADMIN_AUTH_COOKIE_NAME`, `sameSite=lax`, prod'da `secure`);
  token hicbir zaman yanit govdesine, istemci JS'ine veya log'a dusmez. BFF yalnizca makine-okunur
  hata `code`'unu ve HTTP status'u tarayiciya doner; ham gateway mesaji sizdirilmaz ve UI kodu i18n
  sozluguyle Turkce mesaja cevirir. Internal DB/Redis health icin `INTERNAL_API_TOKEN` yalnizca
  sunucu env'inde tutulur ve `/api/system/internal` server-side proxy ile cagrilir; token yoksa uc
  `available:false` doner ve UI "dahili token gerektirir" durumunu gosterir. localStorage tabanli
  token saklama bilincli olarak REDDEDILDI (XSS yuzeyi daha genis; httpOnly cookie daha guvenli ve
  esit eforda).
- Bilincli kapsam disi (gecici): CSRF token, `secure` cookie matrisi disindaki production hardening,
  refresh token rotasyonu, rate limit, server-side render'da oturum on-yuklemesi. Bunlar TD-015 ve
  TD-017 altinda takip edilir.
- Sonuc: admin-web backend'i degistirmeden, CORS gerektirmeden ve token'i istemciye sizdirmadan canli
  API'ye baglanir. `packages/api-client` tek server->gateway kanali olarak kalir; frontend boundary
  korunur. Runtime smoke ile login/me/logout/revoke, stores/plans CRUD ve health akislari dogrulandi.

## ADR-018 Faz 1C admin auth hardening stratejisi

- Durum: ACCEPTED
- Baglam: Faz 1C'de commerce feature eklemeden admin auth/session/BFF hattindaki guvenlik ve
  operasyon borclari azaltildi. Ana riskler brute-force login, cookie tabanli BFF mutation'larinda
  CSRF, internal health token sizintisi, dev smoke verisi ve store domain contract gap'iydi.
- Karar: Gateway `POST /auth/platform/login` icin IP + normalize e-posta bazli proses ici rate limit
  eklendi (`AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS`, `AUTH_LOGIN_RATE_LIMIT_MAX_ATTEMPTS`). Redis tabanli
  dagitik sayaç bu fazda eklenmedi; production'da coklu instance icin takipli borc olarak kalir.
  Basarili login ilgili IP/e-posta sayacini sifirlar; basarisiz denemeler pencere sonuna kadar tutulur.
- Karar: admin-web BFF mutation'lari icin double-submit CSRF kullanilir. `GET /api/auth/csrf` token
  uretir, JS tarafindan alinabilen ayri CSRF cookie'sine yazar ve token/header adini JSON dondurur.
  Session cookie httpOnly kalir; CSRF token auth token degildir. Login CSRF disinda birakildi; pre-session
  login riski rate limit + credential dogrulamasi ile sinirlanir. Logout, stores/plans create/update
  CSRF header+cookie eslesmesi ister.
- Karar: Session cookie adi `ADMIN_SESSION_COOKIE_NAME` (geri uyum icin `ADMIN_AUTH_COOKIE_NAME`
  fallback), `ADMIN_COOKIE_SECURE`, `ADMIN_COOKIE_SAME_SITE` ile merkezilestirildi. Varsayilan
  sameSite `lax`; production'da secure varsayilan true. Path `/` tutuldu; clear parametreleri set ile
  ayni.
- Karar: Korumali admin route group server tarafinda once session cookie varligini kontrol eder; asil
  session dogrulamasi yine BFF `/api/auth/me` ile yapilir. Login sayfasi session cookie varsa erken
  panele yonlendirir. Token client bundle'a girmez.
- Karar: `/api/system/internal` server-side token proxy olarak kalir; token yoksa `available:false`,
  token varsa timeout kontrollu DB/Redis probe yapar. Secret istemciye donmez ve loglanmaz.
- Karar: Store list/get response'u `domain: string | null` ile genisletildi; StoreDomain tablosundaki
  ilk domain gosterilir. Delete endpoint eklenmedi; smoke temizligi icin production/staging'de
  calismayi reddeden `pnpm db:cleanup-smoke` script'i eklendi.

## ADR-019 Frontend Docker dev runtime + merkezi accent token

- Durum: ACCEPTED
- Baglam: Uc frontend app (admin-web, store-admin-web, storefront-web) compose'da yoktu (TD-008) ve
  UI accent rengi indigo idi; premium tek-marka vurgu rengi olarak `#9743CD` (rgb 151 67 205)
  istendi. Hedef: minimum/kontrollu degisiklik, backend compose'u bozmadan, secret sizdirmadan.
- Karar (container): Frontend app'ler icin ayri production Dockerfile uretmek yerine, backend ile
  ayni paylasimli `infra/docker/node.Dockerfile` imaji kullanilir; her servis `pnpm --filter <app> dev`
  ile Next.js dev runtime olarak calisir. Gerekce: monorepo tutarliligi, dusuk bakim yuku ve "ayaga
  kalksin" hedefi icin yeterli. Production-grade standalone image/optimizasyon, Nginx reverse proxy,
  SSL ve deploy pipeline bilincli olarak kapsam disi (TODO-028).
- Karar (env/secret): `API_GATEWAY_URL` host'ta `http://localhost:4000`, compose icinde
  `http://api-gateway:4000` (servis `environment` override). admin-web BFF gateway'e container network
  uzerinden erisir. `INTERNAL_API_TOKEN` yalnizca admin-web server env'inde (`env_file`) verilir;
  `NEXT_PUBLIC` ile tasinmadigindan client bundle'a girmez (smoke ile dogrulandi). store-admin/
  storefront secret almaz, shell olarak kalkar.
- Karar (accent token): Accent rengi tek merkezi noktadan — `packages/ui/tailwind-preset.cjs`
  icindeki `brand` skalasi — yonetilir; tum app'ler bu preset'i kullanir ve componentler yalnizca
  `brand-*` token'i tuketir. Bu yuzden indigo ramp'i, `brand-600 = #9743CD` ankrajli olculu bir
  menekse ramp'i ile degistirildi; app kodunda hicbir hardcoded hex tekrarI olmadan accent her yere
  yayildi. Renk yalnizca CTA, aktif durum ve accent rozetlerinde kullanilir; govde metni ve genis
  yuzeyler notr slate kalir. Kontrast: `brand-600` uzerine beyaz ~5.3:1 (AA), `text-brand-700`
  beyaz uzerinde ~7:1. Dark theme / neon / agir gradient yok; light-first premium ton korunur.
- Karar (Docker temizlik): Disk yonetimi icin yalnizca `docker builder prune` (kullanilmayan build
  cache) ve `docker image prune` (dangling) guvenli kabul edilir. `docker volume prune`,
  `docker system prune -a --volumes` ve `docker container prune` (diger projelerin stopped
  container'larini etkiler) kullanilmaz; named volume'lar (ozellikle `docker_postgres-data`) korunur.

## ADR-020 Catalog fiyat alanlari integer minor unit

- Durum: ACCEPTED
- Baglam: Faz 2A katalog foundation'da variant fiyatlari eklenirken para alanlarinin decimal mi
  integer minor unit mu tutulacagi netlestirildi. Decimal alanlar yuvarlama/format farklarina acik;
  order/payment fazlarinda fiyat snapshot ve vergi/kargo hesaplari daha kritik hale gelecek.
- Karar: `ProductVariant.priceMinor` ve `compareAtMinor` integer minor unit olarak tutulur; `currency`
  ISO-4217 uc harfli kod olarak zorunludur. API contract'lari integer ve `>= 0` validasyonu yapar.
  `compareAtMinor` verildiginde `priceMinor`'dan dusuk olamaz. Display formatlama UI katmanina
  birakilir.
- Sonuc: Para saklama deterministik ve yuvarlama bagimsizdir. Order/checkout fazinda fiyat snapshot
  modelleri ayni minor-unit yaklasimi ile genisletilecek.

## ADR-021 Inventory movement ledger ve negatif stok politikasi

- Durum: ACCEPTED
- Baglam: Faz 2A'da order/checkout yok; rezervasyon akisi henuz kurulmadigi icin stok davranisi
  manuel adjustment ile sinirli kalmali. Buna ragmen stok degisimleri audit edilebilir olmalidir.
- Karar: Her manual adjustment `InventoryMovement` kaydi yazar ve `InventoryItem.quantityOnHand`
  ayni transaction'da guncellenir. `quantityReserved` bu fazda 0 kalabilir; `quantityAvailable`
  API response'unda `quantityOnHand - quantityReserved` olarak turetilir, DB'de materialize edilmez.
  Adjustment sonucu `quantityOnHand < 0` olacaksa `INVALID_INVENTORY_ADJUSTMENT` ile 400 doner.
  Eksik inventory item, variant mevcut oldugu surece adjustment sirasinda repair/create edilebilir;
  variant yoksa kontrollu not-found doner.
- Sonuc: Siparis/rezervasyon olmadan stok ledger'i baslar, negatif stok engellenir ve ileride order
  rezervasyon hareket tipleri ayni ledger uzerinden genisletilir.

## ADR-022 Product archival status ve store-scoped catalog tenant guard

- Durum: ACCEPTED
- Baglam: Katalog entity'lerinde delete endpointleri bu fazin kapsaminda degil. Store-user auth henuz
  tamamlanmadigi icin store-admin endpointlerinin nasil korunacagi gecici olarak netlesmeli.
- Karar: Product, variant ve category icin soft delete modeli yerine status tabanli `ARCHIVED`
  kullanilir; DELETE endpoint eklenmez. Store-scoped catalog endpointleri bu fazda platform admin
  bearer session ile korunur ve path'teki explicit `storeId` once mevcut store'a cozulur. `storeId`
  ProductVariant/InventoryItem/Movement uzerinde bilincli olarak denormalize edilir; her sorgu ve
  unique constraint store bazli tenant guard'i dogrudan uygular (`Product(storeId, slug)`,
  `ProductVariant(storeId, sku)`, `ProductCategory(storeId, slug)`).
- Sonuc: UI baglama gelmeden backend smoke/test mumkun olur. Store-user session/role modeli geldiginde
  ayni endpointlerde platform admin store context secimi ve `requireStoreAccess`/role guard'i ayrica
  sertlestirilecek.

## ADR-023 Store-admin gecici BFF + server-side store context

- Durum: ACCEPTED
- Baglam: Faz 2B'de `apps/store-admin-web` canli katalog/stok ekranlarina baglanir, ancak store-user
  auth (store-scoped session/token + granular store role) henuz tamamlanmadi (TD-019). Faz 2A catalog
  endpointleri gecici olarak platform admin bearer + explicit `storeId` ile korunuyor (ADR-022).
  Store-admin UI'in token'i istemciye sizdirmadan ve hedef mağazayi explicit tutarak calismasi gerekir.
- Karar: admin-web'in kanitlanmis BFF deseni store-admin-web'e tasinir (ortak paket yerine app-yerel
  minimal route handler'lar; ortaklastirma scope'u buyuttugu icin paketleme sonraya birakildi).
  (1) Demo login platform admin login'i proxy'ler; bearer token store-admin'e ozel httpOnly cookie'de
  (`commerce_os_store_admin_session`) SADECE server tarafinda tutulur; istemciye yalnizca kullanici
  meta'si doner. (2) Secili mağaza her istekte server-side `admin.stores.list` ile cozulur
  (`STORE_ADMIN_DEMO_STORE_SLUG`, default `demo-store`; yoksa ilk mağaza); `storeId` istemciden gelmez,
  boylece tarayici keyfi mağaza secemez. (3) Tum gateway cagrilari ayni-origin `/api/*` proxy
  uzerinden; mutating route'lar double-submit CSRF ile korunur. Cookie adlari admin-web'den ayridir.
- Sonuc: Store-user auth gelmeden guvenli, token-sizdirmayan store-admin UI mumkun olur. Store-user
  session/role modeli geldiginde login proxy gercek store-user akisina, server-side store context
  secimi store-user'in erisim listesine bagli secime ve `requireStoreAccess`/role guard'a tasinacak
  (TD-019). Cok-mağazali store-user secici de o zaman eklenecek.

## ADR-024 Order lifecycle, reservation locking ve order number

- Durum: ACCEPTED
- Baglam: Faz 2C siparis cekirdegi checkout/payment/fulfillment olmadan kuruluyor. Stok
  rezervasyonu oversell yaratmamali, tenant isolation store bazli kalmali ve store-admin UI baglama
  sonraki faza birakilmali.
- Karar (lifecycle): Order `DRAFT -> PLACED -> CANCELLED` akisini bu fazda destekler. `CONFIRMED` ve
  `FULFILLED` sonraki payment/fulfillment fazlari icin enum olarak hazir tutulur. DRAFT order line
  mutation'a aciktir; PLACED/CANCELLED sonrasi line mutation `ORDER_MUTATION_NOT_ALLOWED` doner.
  `POST /place` PLACED order icin idempotent order response doner; `POST /cancel` CANCELLED order
  icin double release yapmadan mevcut order response doner.
- Karar (reservation/locking): Place islemi tek transaction'da calisir. Her line icin ilgili
  `InventoryItem` satiri PostgreSQL `SELECT ... FOR UPDATE` ile kilitlenir, available
  (`quantityOnHand - quantityReserved`) kontrol edilir, sonra `quantityReserved` increment edilir ve
  `InventoryReservation ACTIVE` + `InventoryMovement SALE_RESERVATION` yazilir. Cancel, aktif
  rezervasyonlari `RELEASED` yapar ve `quantityReserved` decrement eder; RELEASED kayitlari tekrar
  islenmez.
- Karar (order number): Store-scoped `OrderNumberCounter` kullanilir. Counter transaction icinde
  upsert/increment edilir ve `OS-000001` biciminde store bazli unique `orderNumber` uretilir. Global
  siralilik hedeflenmez; magaza icinde deterministik ve race-safe siralama yeterlidir.
- Karar (money): Order ve line para alanlari integer minor unit olarak tutulur. Line snapshot
  `ProductVariant.priceMinor/currency/sku/title` degerlerinden olusturulur; product/variant sonradan
  degisse bile order line snapshot degismez. Bu fazda discount/shipping/tax 0, total=subtotal.
- Sonuc: F2C backend cekirdegi checkout/payment bagimsiz calisir. Payment capture, fulfillment,
  consumed reservation, cart ve tax/discount engine sonraki fazlara birakildi.

## ADR-025 Product sales model ve order purchasability guard

- Durum: ACCEPTED
- Baglam: Commerce core artik her aktif urunun online sepete eklenebilir oldugunu varsaymamali.
  Teklif/randevu/WhatsApp/katalog odakli urunler storefront ve checkout fazlari gelmeden once
  backend contract/model seviyesinde ayirt edilmelidir.
- Karar: Product uzerinde ana karar enumlarla tutulur: `salesMode` (`ONLINE`, `INQUIRY`,
  `APPOINTMENT`, `WHATSAPP`, `CATALOG_ONLY`), `priceVisibility` (`VISIBLE`, `HIDDEN`,
  `STARTING_FROM`, `ON_REQUEST`) ve `primaryAction` (`ADD_TO_CART`, `REQUEST_PRICE`,
  `BOOK_APPOINTMENT`, `WHATSAPP`, `CONTACT_FORM`, `NONE`). Yardimci boolean alanlar yalnizca UI/akis
  sinyali olarak kalir (`inquiryEnabled`, `appointmentRequired`, `whatsappEnabled`, `purchasable`).
  Mevcut urunler migration defaultlariyla `ONLINE/VISIBLE/ADD_TO_CART/purchasable=true` kalir.
- Karar (tutarlilik): `ONLINE` urunlerde `primaryAction=ADD_TO_CART`, `priceVisibility` yalnizca
  `VISIBLE` veya `STARTING_FROM` kabul edilir. `purchasable=false`, online urunu gecici/bilincli
  olarak order'a kapatan bir override flag'i olarak gecerlidir ve order guard
  `PRODUCT_NOT_PURCHASABLE` doner. `HIDDEN` veya `ON_REQUEST` fiyat gorunurlugu online satin alma ile
  birlikte kullanilmaz; bu urunler `purchasable=false` olmalidir.
  `INQUIRY`, `APPOINTMENT`, `WHATSAPP`, `CATALOG_ONLY` urunler online order line'a eklenemez.
  `WHATSAPP` icin `primaryAction=WHATSAPP` ve `whatsappEnabled=true` zorunludur.
- Karar (order guard): Order create/add-line/place product ve variant status'unu `ACTIVE` olarak
  tekrar dogrular; product `salesMode=ONLINE` ve `purchasable=true` degilse kontrollu, stabil hata
  kodlari doner: `PRODUCT_NOT_PURCHASABLE`, `PRODUCT_REQUIRES_INQUIRY`,
  `PRODUCT_REQUIRES_APPOINTMENT`, `PRODUCT_REQUIRES_WHATSAPP`, `PRODUCT_CATALOG_ONLY`. Place
  asamasindaki tekrar dogrulama, eski DRAFT order'lar veya urun davranisi sonradan degistiginde
  rezervasyon olusmadan durur.
- Bilincli kapsam disi: Inquiry request, appointment request, WhatsApp redirect/store contact config
  ve storefront CTA render modelleri bu fazda eklenmez.
- Sonuc: Katalog ve order cekirdegi teklif/randevu/vitrin urunlerini online checkout'tan ayiracak
  foundation'a sahip olur; UI ve public storefront davranisi sonraki fazlarda bu contract uzerinden
  baglanir.

## ADR-026 Runtime locale (TR/EN) cookie stratejisi

- Durum: ACCEPTED
- Baglam: `packages/i18n` tip-guvenli TR/EN sozluk altyapisini sagliyordu ancak dil secimi statikti
  (her zaman varsayilan TR). Faz 2E kullanicinin admin-web, store-admin-web ve storefront-web arayuz
  dilini runtime'da TR/EN arasinda degistirebilmesini hedefler. Varsayilan dil Turkce kalir.
- Karar (tasima): Secim `commerce_os_locale` cookie'sinde tutulur. Desteklenen degerler `tr`, `en`;
  gecersiz/bos deger `resolveLocaleFromCookieValue` ile guvenli sekilde `tr`'ye duser. Sunucu
  bilesenleri cookie'yi `next/headers` ile okuyup sozlugu secer; istemci bilesenleri kok layout'tan
  `LocaleProvider`/`useLocale` ile cozulen locale'i alir. Degisim `LanguageSwitcher` ile cookie'ye
  yazilir ve tam sayfa yenilemesiyle sunucu-render sozluk yeniden uretilir.
- Neden cookie? Hem sunucu (server components, metadata, `<html lang>`) hem istemci ayni tek kaynaktan
  okuyabilir; SSR ile istemci arasinda tutarlilik saglanir; login dahil tum rotalar kapsanir;
  ek bagimlilik veya istemci state store'u gerekmez.
- Neden URL prefix (`/tr`, `/en`) degil? Mevcut rota yapisi, BFF proxy'leri ve auth redirect'leri
  prefix'siz tasarlandi. Prefix tum linkleri, middleware'i ve canonical/SEO kararlarini etkilerdi;
  bu fazin kapsami arayuz dili tercihidir, public SEO/i18n routing degil. Ileride gerekirse ayri is.
- Neden default TR? Urun birincil pazari Turkiye; kaynak sozluk TR'dir ve tum tip paritesi TR sekline
  baglidir. Cookie yoksa veya gecersizse davranis hicbir regresyon olmadan onceki (TR) ile aynidir.
- Neden kullanici tercihi DB'ye yazilmadi? Bu faz store-user auth/role modeli (TD-019) tamamlanmadan
  ilerler; kalici kullanici-bazli tercih icin guvenilir bir kullanici kimligi ve store-scoped tercih
  modeli gerekir. Cookie, oturum boyunca ve cihazda yeterli; DB tercihi ileride katmanlanabilir
  (bkz. TODO, TD-028).
- Guvenlik: Locale cookie bir tercih sinyalidir, gizli token degildir; httpOnly zorunlu degildir.
  `sameSite=lax`, `path=/`, uzun `max-age`, HTTPS'te `Secure`. Auth/session/CSRF cookie'leri
  ayri ve degismeden korunur; switcher sadece kendi cookie'sini yazar.
- Sonuc: Uc frontend uygulamasi da gorunur metni aktif dile gore sunar; key parity ve TR fallback
  korunur; hardcoded gorunur metin eklenmez.

## ADR-027 Entity detail = dedicated route/page (modal degil)

- Durum: ACCEPTED
- Baglam: F2G store-admin sipariş detayi modal olarak, F2D/F2F ürün düzenleme de modal olarak
  tasarlanmisti. Bu ekranlar uzun form, timeline, finansal özet, tablo, lifecycle aksiyon ve
  audit/event icerir; modal kapsamini asar ve derin-linklenemez/paylasilamaz.
- Karar: Ana entity detay ekranlari modal olamaz; her biri dedicated route/page olur. Modal yalnizca
  kisa, gecici, dusuk kapsamli aksiyonlar icindir (create/edit/confirm/quick action/adjust).
  Sipariş, ürün, müşteri, mağaza, stok, varyant, plan gibi detay ekranlari route/page'dir.
- Kural sinifi:
  - Detail = dedicated route/page (`/orders/[id]`, `/products/[id]`, gelecekte `/customers/[id]`,
    `/inventory/items/[id]`, `/stores/[id]`, `/plans/[id]`, `/products/[id]/variants/[variantId]`).
  - Modal = kisa create/edit/confirm/adjust. Mevcut kisa modallar (ürün/kategori/varyant create-edit,
    stok adjust, taslak sipariş create) korunur.
  - Uzun form, timeline, finansal özet, tablolu detay, lifecycle aksiyon veya audit/event varsa
    route/page zorunludur.
- Tasarim plani kurali: Her yeni ekran tasarim planinda "detail route vs modal" karari acikca yazilir.
- Sonuc: F2H'de sipariş detay modali `/orders/[id]`, ürün düzenleme modali `/products/[id]` route'una
  tasindi; varyant yonetimi ürün detay sayfasinda inline bölüm oldu. Backend/business logic ve BFF
  guvenligi (server-side store context, CSRF, token sizmamasi) degismeden korundu.

## ADR-028 Premium glass-inspired UI direction (store-admin)

- Durum: ACCEPTED
- Baglam: Store-admin ürün/sipariş ekranlari islevsel olarak calisiyordu ama musteri demosu icin
  yeterince premium degildi (F2I). Tutarli, satilabilir bir gorsel dil gerekti.
- Karar: Musteri onune cikan store-admin ekranlari "glass-inspired premium SaaS" gorsel dilini
  kullanir: light-first, kirik beyaz zemin, translucent yuzeyler (`bg-white/70`), olculu
  `backdrop-blur`, ince white/silver kenar (`ring-1 ring-slate-200/70`), dusuk yogunluklu katmanli
  golge, `rounded-2xl/3xl`. `#9743CD` marka vurgusu yalnizca CTA/accent/aktif gostergede. Apple cam
  dilinden ilham alinir ama birebir kopya degildir; dark theme/neon/agir gradient yoktur.
- Detay sayfasi standardi (ADR-027 ile uyumlu): hero kimlik basligi + iki kolon (sol ana icerik,
  sag kompakt baglam rayi) + bolumlenmis cam yuzeyler; "form yigini" gorunumu yasaktir.
- Primitive politikasi: store-admin'e ozel premium primitive'ler app-local tutulur
  (`apps/store-admin-web/app/components/premium.tsx`); admin-web ile ortaklasirsa `packages/ui`'ye
  tasinir. Asiri soyutlama yapilmaz.
- Sonuc: F2I'de `/products`, `/products/[id]`, `/orders`, `/orders/[id]` bu dile tasindi; backend
  business logic, API kontratlari ve BFF guvenligi degismedi (UI-only).

## ADR-029 Storefront product detail = satin alma karar merkezi + sunucu-tarafi resolver

- Durum: ACCEPTED
- Baglam: F3A'da public storefront demo kabuktan cikip canli katalog verisine baglandi. Iki karar
  netlestirilmesi gerekti: (1) urun detay sayfasinin standardi, (2) gateway'de public katalog ucu
  olmadan vitrinin veriye nasil, token sizdirmadan erisecegi.
- Karar 1 — Product detail standardi: Urun detay sayfasi yalnizca ad/fiyat/aciklama degil, bir
  "satin alma karar merkezi"dir (Amazon/Hepsiburada'dan ilham; birebir kopya degil). Asgari iskelet:
  breadcrumb, baslik/marka/SKU, rating+yorum yer tutucu, medya galerisi, fayda/aciklama/teknik
  ozellik/paket/kullanim, varyant secici (canli SKU/fiyat/stok), buy box (fiyat+compare-at,
  satis-modu CTA, adet yalniz ONLINE purchasable, stok, teslimat/iade/guvenli-odeme/satici guven
  kartlari), altta yorumlar/soru-cevap/birlikte-alinanlar/son-bakilanlar yer tutuculari + canli
  benzer urunler. Yer tutucular sakin/profesyonel; "yakinda" tarzi ucuz copy yasak.
- Karar 2 — CTA = satis-modeli fonksiyonu: CTA ve fiyat gorunumu, F2D urun satis-modeli alanlarinin
  (salesMode/priceVisibility/primaryAction/purchasable) saf bir fonksiyonudur (`lib/sales-model.ts`).
  ONLINE disindaki modlarda sepete ekleme/adet GOSTERILMEZ; gizli/talep fiyatlarda numerik fiyat
  gosterilmez. Mapping: ONLINE→sepete ekle/hemen al, INQUIRY→fiyat sor, APPOINTMENT→randevu al,
  WHATSAPP→WhatsApp, CATALOG_ONLY→bilgi al/pasif.
- Karar 3 — Sunucu-tarafi resolver (token gizliligi): Public vitrin, platform-admin session cookie'si
  KULLANMAZ. Gateway'de public-read ucu gelene kadar vitrin, sunucu-tarafinda platform-admin
  kimligiyle oturum acar ve token'i yalnizca sunucu belleginde tutar (cookie yok; istemciye/HTML/
  bundle'a sizmaz). Mağaza slug ile sunucuda cozulur; storeId istemciden alinmaz. Bu GECICI bir
  cozumdur — kalici hedef gateway'de auth gerektirmeyen public-read katalog ucudur (TD-032).
- Sonuc: F3A'da home/listing/detail canli veriye baglandi; cart/checkout musteri-dostu placeholder
  olarak kaldi (gercek akis F3B). Backend business logic, DB modeli ve API kontratlari degismedi.

## ADR-030 Gateway public-read katalog ucu + storefront token resolver kaldirildi

- Durum: ACCEPTED
- Baglam: ADR-029'da public vitrin, gateway'de auth gerektirmeyen bir katalog ucu olmadigindan
  GECICI olarak sunucu-tarafinda platform-admin kimligiyle oturum acip token'i sunucu belleginde
  tutuyordu (TD-032, PROD BLOCKER). Token istemciye sizmasa da public bir uygulamanin yuksek-yetkili
  bir kimlik tasimasi asiri yetkiydi ve vitrin uretime acilamiyordu.
- Karar 1 — Public-read katalog ucu: Gateway'e auth GEREKTIRMEYEN, store-scoped, salt-okunur iki uc
  eklendi: `GET /public/stores/:storeSlug/products` ve `GET /public/stores/:storeSlug/products/:productSlug`.
  Yalnizca GET; mutation ucu yoktur. Store slug ile cozulur; store yok ya da ACTIVE degilse guvenli
  404 doner (cross-store/inactive sizinti yok). Yalnizca ACTIVE store + ACTIVE urun/varyant gosterilir;
  draft/archived urun donmez.
- Karar 2 — Allowlist DTO (ic alan sizdirmama): Govde, ic DB modeli yerine `packages/contracts`
  icindeki `publicProduct*` (publicProductSchema/publicProductVariantSchema/publicProductDetailSchema)
  semalariyla `parse` edilerek uretilir. Bu semalar bir ALLOWLIST'tir: yalnizca vitrine uygun alanlar
  tanimlidir; storeId, status, type, vendor, seoTitle/seoDescription, categoryIds, audit zaman damgalari
  ve maliyet/tedarikci/ozel-not gibi alanlar bilincli olarak DISARIDA birakilir (zod bilinmeyen anahtari
  dusturur).
- Karar 3 — Fiyat gizliligi gateway'de uygulanir: priceVisibility HIDDEN/ON_REQUEST oldugunda numerik
  fiyat (priceMinor/compareAtMinor) gateway tarafinda `null` yapilir; sayisal fiyat public govdeye
  HIC girmez. Vitrin yalnizca gorunur etiket davranisina priceVisibility ile karar verir (F2D/F3A
  satis-modeli davranisi korunur). Stok durumu (inStock + adet) public kabul edilir.
- Karar 4 — Storefront token resolver kaldirildi: `apps/storefront-web` katalog cozumleyici artik bu
  public uclari TOKEN'SIZ (`fetch`, Authorization header yok) cagirir. Gecici platform-admin login/
  token modulu (`lib/server/api-token.ts`) ve kimlik bilgileri env'leri (`STOREFRONT_PLATFORM_EMAIL/
  PASSWORD`) tamamen silindi; vitrin `createApiClient`/Bearer/platformLogin KULLANMAZ. Tip guvenligi
  icin yalnizca `import type` ile public DTO tipleri alinir.
- Sonuc: TD-032 RESOLVED, prod blocker kalkti. Docker smoke: vitrin trafigi yalnizca `/public/*`'a
  gider; HTML ve `.next/static` bundle'da token/secret/credential YOK. DB modeli ve mevcut admin
  kontratlari degismedi (yalniz yeni public read DTO/uc eklendi).

## ADR-031 Storefront cart + checkout order foundation (F3B.1)

- Durum: ACCEPTED
- Baglam: ADR-029/030 sonrasi vitrin canli katalogu okur ama cart/checkout hala placeholder'di.
  Gercek sepet + checkout + guvenli order draft/placed olusturma gerekiyordu. ONLINE disi satis
  modlari ve gizli fiyat sepete/siparise dusmemeli; istemci tarafi manipulasyon order'i etkilememeli.
  Bu faz ODEME PROVIDER ENTEGRASYONU DEGILDIR (F3B.2).
- Karar 1 — Cart persistence = imzali httpOnly cookie cart: Vitrin TD-032 sonrasi bilincli olarak
  stateless (DB/auth/session yok); repoda anonim-session altyapisi yok. Bu yuzden DB-backed cart
  yerine imzali (HMAC-SHA256) httpOnly cookie secildi (`commerce_os_cart`). Cookie YALNIZCA
  `{variantId, quantity}` REFERANSI tutar; fiyat/baslik/SKU/salesMode/stok cookie'de TUTULMAZ. Imza
  bicimsel butunluk icindir; kurcalanmis/bozuk cookie bos sepete duser. Cookie mutasyonu yalniz Next.js
  Server Action'larinda yapilir; `STOREFRONT_CART_SECRET` server-only'dir (NEXT_PUBLIC degil, client
  bundle'a girmez).
- Karar 2 — Sunucu-otoriter cozumleme: Gateway'e auth GEREKTIRMEYEN iki public-write uc eklendi:
  `POST /public/stores/:storeSlug/cart` (sepet referansini cozer) ve `POST /public/stores/:storeSlug/checkout`
  (order olusturur). Her ikisi de urun/varyant/fiyat/stok/salesMode'u her istekte store-scoped olarak
  katalog/stok domaininden YENIDEN okur. Istemciden gelen price/title/sku/salesMode KABUL EDILMEZ
  (zod allowlist semasi bunlari dusturur). Cart state cihazda manipule edilse bile order aninda her sey
  sunucuda yeniden hesaplanir.
- Karar 3 — Satis-modeli/fiyat gizliligi kapisi: Yalniz `salesMode === ONLINE` + `purchasable` +
  gorunur fiyatli (VISIBLE/STARTING_FROM) varyant sepete/siparise dusebilir. CATALOG_ONLY/INQUIRY/
  APPOINTMENT/WHATSAPP ve HIDDEN/ON_REQUEST satirlar `UNAVAILABLE` isaretlenir, fiyat tasimaz
  (unitPriceMinor 0; numerik fiyat sizmaz) ve checkout'u engeller. Stok yetersiz → `OUT_OF_STOCK`;
  min/max veya stok nedeniyle kisilen adet → `QUANTITY_ADJUSTED`. checkout yalniz tum satirlar `OK` ise
  ilerler.
- Karar 4 — Order olusumu mevcut F2C cekirdegini kullanir: checkout, `createOrder` (DRAFT) →
  `placeOrder` (stok `FOR UPDATE` ile yeniden dogrulanip rezerve edilir) kompoze eder. Yeni reservation
  mantigi yazilmadi. Cozulemeyen/cross-store varyant index'te olmadigindan dusurulur (tenant izolasyonu
  iki katmanli: index + order create store-scoped).
- Karar 5 — Payment-status temsili: Bu fazda gercek odeme yok. Basarili checkout siparisi `status =
  PLACED`, `paymentStatus = UNPAID` (DB default; "odeme bekliyor") yaratir; `fulfillmentStatus =
  UNFULFILLED`. F3B.2 provider-ready contract: payment intent + webhook ile `AUTHORIZED`/`PAID` gecisleri
  (bkz. TODO-063). Allowlist order-confirmation DTO yalniz onay ozeti doner (orderNumber/status/
  paymentStatus/totals/lines/contactEmail); storeId/customerId/reservation/event/adres PII donmez.
- Sonuc: Gercek cart + checkout + order placement calisir; container smoke'ta gercek Postgres uzerinde
  201 PLACED/UNPAID order olustu, client fiyat manipulasyonu yok sayildi, eksik form 400 dondu,
  ONLINE-disi sepete dusmedi. HTML/bundle/response'ta secret/token YOK. DB modeli/migration DEGISMEDI
  (cookie cart + mevcut order/reservation cekirdegi). Bilincli borclar: TD-033 (create+place
  atomicligi, anonim rezervasyon expiry).
- Revizyon (UX correction, ayni faz): (1) "Sepete ekle" artik YONLENDIRME YAPMAZ — urun detayda kalir,
  nav sayaci revalidate ile guncellenir, inline "sepete eklendi" geri bildirimi + opsiyonel "sepete git";
  "Simdi Al" sepete ekleyip checkout'a yonlendirir. (2) Sunucu-otoriter siparis OZETI gateway cart/
  checkout yanitina eklendi (`summary`): itemsSubtotal/shipping/discount/taxIncluded/grandTotal +
  couponStatus. Genel toplam SUNUCUDAN gelir; istemci kendi toplamini uretmez. DEMO hesap kurallari
  (gercek motor YOK): KDV %20 FIYATLARA DAHIL (toplam uzerine eklenmez; taxIncluded yalniz gosterge),
  kargo itemsSubtotal>=₺750 ise 0 / altinda ₺49,90, kupon yalniz `DEMO10` %10 (digerleri INVALID).
  shipping/discount siparise de yazilir (createOrder genisletildi; total=subtotal-discount+shipping).
  (3) Checkout teslimat adresi: TR il/ilce BAGIMLI dropdown (81 il + ilce, `lib/tr-location-data.ts`;
  il secilmeden ilce kapali, il degisince ilce sifirlanir), sunucu-tarafi il/ilce tutarlilik dogrulamasi.
  (4) Telefon TR cep formatli (`5XX XXX XX XX`, +90 onek) + sunucu normalize/validasyon
  (`lib/phone.ts` → `+90XXXXXXXXXX`). (5) Posta kodundan "opsiyonel" etiketi kaldirildi (alan opsiyonel
  kalir). Mock odeme korunur; gercek provider yok. Kupon kodu ayri httpOnly cookie'de (hassas degil;
  gateway her istekte yeniden dogrular). Shipping/tax/coupon "demo calculation"dir; gercek motor F3B.2+
  (TODO-059/063).

## ADR-032 Store-admin koyu glassmorphism tema = app-local UI kit (paylasilan ui'ye dokunulmadi)

- Durum: ACCEPTED
- Baglam: Claude Design handoff'u store-admin tum ekranlari icin koyu "glassmorphism" bir gorunum
  istedi (ADR-028'deki light-first premium yonun yerine). Ancak gorsel primitive'ler paylasilan
  `@commerce-os/ui` paketinden gelir ve bu paket ayni anda storefront-web + admin-web tarafindan da
  kullanilir (acik tema). Paketi koyulastirmak diger iki uygulamayi bozardi.
- Karar: Paylasilan `@commerce-os/ui` DEGISTIRILMEDI. Store-admin'e ozel, **API-uyumlu koyu karsilik**
  primitive'leri `apps/store-admin-web/components/ui/index.tsx` icinde toplandi (ayni prop'lar; yalniz
  gorunum farkli). Sayfalar UI primitive'lerini bu yerel kit'ten import eder; degisiklik yalniz import
  kaynagi + inline sinif token'lari, hicbir state/handler/API cagrisi degismedi. Locale akisi
  (`useLocale`/`LocaleProvider`/`LanguageSwitcher`) ve `cn` yerel kit'ten paylasilan pakete aynen
  re-export edilir (akis degil, gorunum yeniden uretilmez).
- Karar (kapsam): app-local `premium.tsx` koyu glass'a cevrildi; tema kimligi `app/globals.css` (koyu
  gradient zemin) + `store-app-shell`/`store-nav` (koyu cam kabuk) ile tasinir. ADR-027 (entity detail
  = dedicated route) korundu.
- Bilincli kabul: topbar `LanguageSwitcher` paylasilan paketten geldigi icin acik (beyaz) segmented
  control kalir; koyu zeminde okunabilir, paketi bozmamak adina koyu varyant yapilmadi (gerekirse
  ileride yerel sarmalayici).
- Sonuc: store-admin koyu glassmorphism; storefront-web + admin-web acik temada etkilenmedi. typecheck
  0, store-admin 72/72 test gecti (akislar korundu). Bkz. Faz 2J phase log. Borc: paylasma ihtiyaci
  dogarsa koyu tema `packages/ui`'ye theming destegiyle tasinabilir; `LanguageSwitcher` koyu varyanti.
- Gorsel kanit: lokal/dev gercek seed veriyle alinan ekran goruntuleri
  `docs/screenshots/store-admin-glass-redesign/` altinda (login/dashboard/orders/products/
  product-detail/inventory/theme); prod DB'ye dokunulmadi (ayrinti: Faz 2J phase log).

## ADR-033 Payment provider foundation = provider-ready operasyon katmani (canli odeme degil)

- Durum: ACCEPTED
- Baglam: F3B.1 checkout siparisi `PLACED`/`paymentStatus=UNPAID` olarak yaratir; gercek odeme
  yoktu (ADR-031). Gercek odeme saglayicisi (iyzico/Stripe/PayTR/banka sanal POS) SOZLESMESI henuz
  yok; bu yuzden canli tahsilat YAPILMAYACAK. Ancak altyapi, sozlesme sonrasi admin panelinden
  credential girildiginde canli adaptor baglanabilecek sekilde hazir olmali.
- Karar: Bu faz "para cekiyor" degil, **"provider-ready odeme operasyon altyapisi"** kurar:
  PaymentProviderConfig/PaymentAttempt/PaymentProviderEvent modelleri, PaymentProviderAdapter
  arayuzu (`createPayment/confirmPayment/cancelPayment/refundPayment/getPaymentStatus/handleWebhook/
  testConnection`), store-bazli resolver, admin provider yonetimi (`/payment-providers`), TEST/LIVE
  mode, oncelik/fallback, webhook shell ve attempt/event log. MOCK adapter TAM calisir; IYZICO/STRIPE/
  PAYTR/GENERIC_REDIRECT icin **provider-specific adapter iskeleti** hazirlandi: gercek request payload
  builder, response parser, provider status mapping (success→PAID/AUTHORIZED, failure→FAILED, 3D/
  callback-pending→REQUIRES_ACTION/PENDING), credential validation (missing/invalid-format) ve webhook
  event-id + status mapping. Gercek HTTP transport `PAYMENT_SANDBOX_HTTP_ENABLED` ile gate'lenir ve bu
  fazda KAPALI'dir (kapaliyken mapping uretilir ama canli cagri yapilmaz → `SANDBOX_HTTP_DISABLED`).
  Sozlesme/test credential sonrasi flag acilinca AYNI adapter sandbox/live cagriyi yapar. Canli HTTP
  aktivasyonu + gercek imza dogrulama ayri fazda (TODO-066..069, TODO-071).
- Karar (checkout wiring — additive, zero-regression): Public checkout siparisi bugunku gibi guvenle
  olusturur. Uygun bir **TEST/MOCK** provider config varsa `placeOrder` sonrasi bir PaymentAttempt +
  kisa omurlu **access token** uretilir ve confirmation'a opsiyonel `payment` objesi eklenir (kullanici
  test odeme sayfasina yonlenir). **Provider yoksa `payment` alani HIC eklenmez** → mevcut checkout
  response shape'i ve davranisi (UNPAID) birebir korunur. Boylece F3B.1 regresyon riski yok.
- Karar (fallback + LIVE-MOCK yasagi): Resolver enabled provider'lari currency/amount/method/mode'a
  gore filtreler; siralama DETERMINISTIK'tir (priority asc → createdAt asc → id asc). `fallbackEnabled`
  ise primary basarisizliginda siradaki uygun provider denenebilir. **LIVE/production ortaminda MOCK
  provider asla secilmez/fallback olmaz** (test saglayicisi canli tahsilat gibi davranamaz); TEST/dev/
  demo ortaminda MOCK serbesttir.
- Karar (credential guvenligi): Secret'lar (apiKey/secretKey/webhookSecret) DB'de yalnizca ciphertext
  (AES-256-GCM, `PAYMENT_ENCRYPTION_KEY`) olarak saklanir; duz metin asla DB'ye yazilmaz, client'a
  asla maskesiz donmez. Yanitlarda yalnizca `apiKeyMasked` (son-4) + `*Set` boolean'lari doner. Update
  semantigi: secret alani GONDERILMEZSE mevcut deger KORUNUR, dolu deger gonderilirse DEGISTIRILIR.
  `PAYMENT_ENCRYPTION_KEY` yoksa development/test'te guvensiz dev fallback (yuksek sesli uyari);
  staging/production'da eksikse odeme sifreleme hata verir.
- Karar (public odeme sayfasi guvenligi): Test odeme sayfasi yalnizca `orderId` ile acilamaz; kisa
  omurlu token (DB'de yalnizca HMAC hash + TTL) zorunludur. State/submit uclari token hash'i + expiry +
  store/order/attempt eslesmesi + order'in hala odenebilir (UNPAID) olmasi + attempt'in TEST/MOCK
  olmasini dogrular. Basarili odemede token tek kullanim (gecersiz kilinir).
- Karar (webhook shell): `POST /payments/webhooks/:provider` — external event id ile idempotency
  (`@@unique([storeId, provider, eventId])`), event log. Bu fazda imza dogrulamasi PLACEHOLDER'dir
  (gercek HMAC/signature verification TODO-071); mimari (signature/rawBody param'lari) hazirdir.
- Sonuc: typecheck 0, lint 0, build OK, api-gateway 85/85 + store-admin 78/78 test gecti. Mevcut
  mock checkout regresyonu yok (provider yoksa response birebir/UNPAID). `@commerce-os/ui` etkilenmedi
  (store-admin yerel kit, ADR-032). Bkz. Faz 3B.2 phase log; backlog TODO-066..071.

## ADR-034 Storefront customer auth = mevcut store-scoped Customer'in genisletilmesi (F3B.3)

- Durum: ACCEPTED
- Not: Kullanici brief'inde bu karar "ADR-032" olarak adlandirilmisti; ADR-032 (store-admin tema)
  ve ADR-033 (payment foundation) zaten kullanimda oldugundan ADR-034 olarak numaralandirildi.
- Baglam: F3B.2'ye kadar storefront tamamen guest'ti; checkout guard, musteri uyeligi/oturumu ve
  adres defteri yoktu. Sema'da zaten store-scoped bir `Customer` (CRM + order/adres cipasi) ve
  `CustomerAddress` vardi; admin auth (`PlatformUser`/`StoreUser`) bundan ayri bir domain.
- Karar: Storefront musteri kimligi AYRI bir `CustomerAccount` domaini olarak DEGIL, mevcut
  `Customer` modelinin genisletilmesi olarak kurulur (tek musteri kavrami). `Customer`'a auth/profil
  alanlari eklenir (`birthDate`, `gender`, `emailVerifiedAt`, `phoneVerifiedAt`, `status`'a PASSIVE/
  BLOCKED; `email`/`phone` store-scope'ta unique + nullable — GSM-only/email-only kayit). Sifre/oturum/
  OTP/IBAN/iletisim tercihi AYRI alt tablolara baglanir: `CustomerCredential`, `CustomerSession`,
  `CustomerOtpVerification`, `CustomerIban`, `CustomerCommunicationPreference`. `CustomerAddress`
  adres-adi/varsayilan/fatura kimligi/soft-delete ile genisletilir.
- Gerekce: `Customer` zaten store-scoped ve order/adres cipasi; ayri bir hesap modeli ileride
  Customer↔Account eslestirme ve veri uzlastirma borcu yaratirdi. Store-admin musteri listesi,
  storefront uyeligi, checkout order, adres defteri, ileride B2B/kupon/wishlist/review hep ayni
  `Customer` uzerinden baglanir. "Admin auth ile karistirma" kurali ihlal edilmez (Customer admin
  auth degil; PlatformUser/StoreUser ayri kalir).
- Oturum mimarisi: Storefront httpOnly `commerce_os_customer_session` cookie'si opak jetonu tutar;
  gateway DB'de yalnizca `sha256(token)` (`CustomerSession.tokenHash`) saklar (PlatformSession deseni).
  Storefront, jetonu gateway'in public musteri uclarina YALNIZCA `x-customer-session` header'i ile
  server-to-server iletir (client bundle'a girmez). Gateway store-scope + suresi + ACTIVE durum +
  ownership dogrular. Checkout, oturum varsa ayni header'la gonderilir ve order `customerId`'ye baglanir.
- OTP/teslimat: Gercek SMS/e-posta saglayicisi YOK; teslimat provider-ready dev/mock. Plain OTP/sifre
  ASLA DB'ye yazilmaz/loglanmaz (yalniz sha256/scrypt hash). Izole smoke icin `CUSTOMER_OTP_DEV_CODE`
  (yalniz development/test) bypass kodu; gercek kod sizdirilmadan akis tamamlanabilir.
- PII: TCKN/VKN/IBAN response'larda MASKELI doner (son 2 hane / IBAN head+son2); event/log metadata'ya
  yazilmaz. Sifre degisikliginde oturum KORUNUR (yeniden giris istenmez), `passwordChangedAt` guncellenir.
- Kapsam disi (bu faz): password reset, social login, gercek SMS/e-posta provider, admin musteri yonetimi,
  e-posta/telefon DEGISIKLIGI (OTP gerektirir — disabled/not), guest gecmis siparis baglama (yalniz
  checkout anindaki yeni siparis baglanir).
- Sonuc: typecheck 0, lint 0, build 24/24, test 34/34 (contracts +8, api-gateway +12 musteri testi).
  Bkz. Faz 3B.3 phase log; backlog TODO-074..077.

## ADR-035 Admin-tetikli musteri aktivasyon/parola-sifirlama = tek seferlik token (TODO-087)

- Durum: ACCEPTED
- Baglam: Store-admin panelden yeni musteri olusturma + var olan musteriye uyelik/credential yonetimi
  gerekiyordu (TODO-087). F3B.3 guvenlik kurali: admin musteri credential'ini DOGRUDAN degistirmez.
  Gercek e-posta/SMS saglayici YOK (ADR-034). Soru: musteri hesabi olusturulunca/sifre sifirlanmaca
  musteri parolasini nasil belirler?
- Karar: Admin KALICI SIFRE BELIRLEMEZ ve parolayi goremez. Bunun yerine `CustomerCredentialToken`
  (yeni model) uretir: `purpose` (ADMIN_ACTIVATION | ADMIN_PASSWORD_RESET), `tokenHash`
  (sha256(`cred.<token>.<SESSION_SECRET>`), `@unique`), `expiresAt`, `consumedAt`, `createdByUserId`.
  Raw token DB/log/event/test snapshot/client bundle'a ASLA yazilmaz; yalniz uretim response'unda
  TEK SEFERLIK doner. Storefront `/auth/activate?token=` sayfasi + public `POST /public/stores/
  :storeSlug/customer/activate` token'i (hash ile) bulur, tek seferlik atomik tuketir (`consumedAt`),
  parolayi scrypt ile set eder.
- Tek seferlik link gosterimi: Mail provider olmadigindan, uretilen link admin UI'da BIR KEZ
  guvenlik uyarisiyla gosterilir (tekrar goruntulenemez; gerekirse yeni link uretilir). Guvenlik
  degerlendirmesi: link kisa omurlu (varsayilan 24s, `CUSTOMER_CREDENTIAL_TOKEN_TTL_SECONDS`),
  hash-saklanir, tek-kullanimlik; raw token yalniz transient response/DOM'da bulunur. Bu kabul
  EDILEN bir gecici cozumdur; gercek e-posta gonderimi TODO-076 ile gelir. Test ile sinirlandi
  (token bir kez kullanilir; tekrar 400 INVALID_TOKEN).
- Davranis: ADMIN_ACTIVATION parola set + musteriyi ACTIVE yapar. ADMIN_PASSWORD_RESET yalniz
  parolayi gunceller. HER IKI amac da parola set edildiginde (token tuketildiginde, uretildiginde
  DEGIL) mevcut TUM oturumlari revoke eder — guvenli varsayilan. Activation sonrasi otomatik login
  YOK; UI giris sayfasina yonlendirir (sade/guvenli akis). Aktivasyon dogrulama (emailVerifiedAt)
  set ETMEZ: link admin'e gosterildigi icin kanal sahipligi kanitlanmaz (muhafazakar).
- Status davranisi: PASSIVE/BLOCKED musteri login olamaz + oturumu resolve edilmez (gateway zaten
  `status === "ACTIVE"` zorunlu kiliyordu — `resolveCustomerFromRequest` + login). TODO-087'de
  DEGISIKLIK YAPILMADI; test ile dogrulandi.
- Iliski: TODO-075 (musteri self-service "sifremi unuttum") bu foundation'i yeniden kullanabilir
  ama ACIK kalir; TODO-076 (gercek teslimat) ACIK kalir.
- Sonuc: typecheck 0, lint 0, build 24/24, test 34/34 (api-gateway +15 credential testi). Docker
  smoke ile uctan uca dogrulandi (asagidaki phase log).

## ADR-036 MOCK 3D Secure simulasyon + computed taksit ozeti (TODO-072)

- Durum: ACCEPTED
- Baglam: F3B.2 follow-up UI polish (TODO-072). MOCK test odemede "3DS gerekli" kart secilince gercekci
  bir dogrulama adimi yoktu (dogrudan tek "tamamla" butonu → her zaman PAID); taksit secilse de odeme/
  success/store-admin tarafinda taksit detayi zayifti. Gercek provider HTTP entegrasyonu (iyzico sandbox),
  gercek 3DS redirect ve gercek faiz/oran motoru bu fazda KAPSAM DISI (ADR-033 cizgisi korunur).
- Karar (3DS): MOCK 3DS iki adimli kalir ama ikinci adim kullanici secimine baglanir. `three_ds_required`
  ilk confirm → REQUIRES_ACTION (threeDsApplied=true). Storefront ayri bir banka dogrulama SIMULASYON
  ekrani (ThreeDsChallenge) gosterir; kullanici "başarılı tamamla" (→ PAID) ya da "başarısız yap"
  (→ FAILED, code THREE_DS_FAILED, order UNPAID, retry) secer. Adapter sozlesmesine
  `ConfirmPaymentInput.threeDsOutcome` ("success"|"fail"), public sozlesmeye opsiyonel
  `publicPaymentSubmitRequest.threeDsAction` eklendi. Bu GERCEK 3DS redirect DEGILDIR ve oyle iddia
  edilmez — net "test simülasyonu" metni ile. Boylece "3DS karti → ANINDA PAID" yanlis pozitifi ortadan
  kalkar ve basarisiz yol da test edilebilir.
- Karar (taksit): Taksit ozeti CALISMA-ZAMANI HESAPLANAN bir UI alanidir; YENI DB ALANI YOK. Mevcut
  `PaymentAttempt.installmentCount` kullanilir; taksit basina tutar = round(total / count). SAHTE
  oran/faiz/komisyon YAZILMAZ — toplam degismez, "Vade farksız" notu acikca gosterilir. Gercek oran motoru
  geldiginde bu hesap degisecek (TODO acilabilir).
- Gozlemlenebilirlik/guvenlik: yanit serializer'lara eklenen tek yeni alan `publicPaymentInfo.threeDsApplied`
  (safe boolean). Full PAN/CVC/raw token ASLA serialize/log/snapshot edilmez (mevcut F3B.2 kurali korunur).
  Store-admin order detail 3DS durumu attempt.status + threeDsApplied'tan turetir (yeni veri sizmaz).
- Iliski: gercek provider/3DS redirect/iade-iptal ve faiz motoru ACIK (TODO-076 ve ilgili payment TODO'lari).
- Sonuc: typecheck 0, build 24/24, lint temiz, test yesil (storefront 60, store-admin 89, api-gateway 139,
  contracts 21). Docker smoke healthy.

## ADR-037 Buy-again = GÜNCEL katalog/stok dogrulamasi (eski sipariş fiyatina güvenilmez) (TODO-079)

- Durum: ACCEPTED
- Baglam: Hesabim > Siparislerim "Tekrar satin al" (TODO-079). Bir musteri eski siparisindeki urunleri
  tekrar sepete eklemek istiyor. Sipariş satiri (OrderLine) o anki fiyat/baslik/SKU'yu TARIHSEL olarak
  saklar; urun/varyant o gunden beri pasifleşmis, silinmis, fiyati degismis veya stoğu tukenmis olabilir.
- Karar: Buy-again AYRI bir backend endpoint'i DEGILDIR; storefront Server Action (`buyAgainAction`)
  olarak gerceklenir. Akis: (1) `getCustomerOrderDetail(orderNumber)` ile YALNIZ kendi siparisini al
  (own-only; baska musteri/yok → islem yok). (2) Sipariş satirlarinin `variantId`'lerini GÜNCEL katalogdan
  dogrula — mevcut `resolveCart` (gateway public cart cozumleyici) ile; bu zaten fiyat/stok/satilabilirlik
  otoritesidir. (3) Yalniz `status !== "UNAVAILABLE" && inStock && availableQuantity > 0` varyantlari
  `min(siparis adedi, mevcut stok)` ile sepete ekle. (4) Eklenemeyen varyantlari say → kismi ekleme +
  "Bazı ürünler artık mevcut değil." uyarisi; hicbiri uygun degilse "artık satın alınamıyor."
- Gerekce: Eski sipariş satiri FIYATINA/uygunluğuna GÜVENMEK yanlis fiyatla satis veya stoksuz urun ekleme
  riski tasir. Cart cozumleyici tek dogrulama otoritesi oldugundan (F3B.1 cizgisi: istemci/eski veriye
  güvenme), buy-again da ayni otoriteyi kullanir; yeni paralel dogrulama yuzeyi acilmaz. Ayri endpoint yerine
  Server Action: daha az backend yuzeyi + cart cookie mutasyonu zaten action/route baglaminda yapilabilir.
- Guvenlik: own-only order erisimi (x-customer-session); baska musteri siparisi tekrar satin alinamaz.
  Eklenen sepet kalemleri yalniz `{variantId, quantity}` referansi tutar (fiyat/baslik tasinmaz).
- Iliski: Gercek iade (TODO-081), destek (TODO-080), review (TODO-082), kargo takip (TODO-083) ile birlikte
  TODO-079 post-order CTA ailesini tamamlar (digerleri bu fazda placeholder).
- Sonuc: typecheck 0, build 24/24, lint temiz, test yesil (storefront 75, api-gateway 142). Docker smoke:
  gercek sipariş (OS-000043) ile buy-again güncel-katalog dogrulamasi (available + OUT_OF_STOCK branch) dogrulandi.

## ADR-038 Storefront raw musteri oturum jetonu SUNUCU-YALNIZ kalir (RSC payload'una girmez) (TODO-089)

- Durum: ACCEPTED
- Baglam: Vitrin musteri oturumu opak bir jeton tasir; `commerce_os_customer_session` httpOnly cookie'de
  saklanir, gateway'de `sha256(token + SESSION_SECRET) = tokenHash` ile dogrulanir (raw jeton DB'ye yazilmaz).
  Account sayfalari `force-dynamic` Server Component'lerdir ve `cookies()` ile jetonu okur. TODO-079 smoke'unda
  jetonun RSC flight payload'una serialize edildigi gozlemi raporlandi (TODO-089 denetimi).
- Karar: Raw oturum jetonu (ve cookie DEGERI) SUNUCU-YALNIZ kalir. Izin verilen tek kullanim:
  (1) Server Component / Server Action icinde `readCustomerToken()` ile okuma; (2) gateway'e YALNIZCA
  `x-customer-session` server-to-server fetch header'i olarak iletme. Jeton/cookie DEGERI ASLA bir client
  component prop'una, RSC flight payload'una, server-rendered HTML'e, Server Action donus degerine, API/BFF
  response'una veya log'a girmez. Client'a yalniz GÜVENLI view model gecer (`CustomerAccount`: id/email/phone/
  ad/soyad/dogum/cinsiyet/dogrulama/status — jeton/hash alani YOK). Cookie mutasyonu (`writeCustomerToken`/
  `clearCustomerToken`) yalniz Server Action/Route Handler baglaminda yapilir; jetonu donus degerine koymaz.
- Gerekce: httpOnly cookie'nin amaci jetonu JS/client erisiminden uzak tutmaktir; jetonun client-delivered
  herhangi bir ciktida (ozellikle RSC payload) gorunmesi bu siniri ihlal eder. Sunucu-yalniz sinir, jeton'u
  XSS/serialize sizinti yuzeyinden uzak tutar.
- Dogrulama / sentinel: `apps/storefront-web/test/account-session-boundary.test.tsx` bu siniri korur (cookie'de
  SENTINEL jeton → render ciktisi/loginAction sonucu/view model jetonu icermez, ama gateway fetch header'i
  tasir). Build grep: `.next/static` client chunk'lari jeton/marker icermez; cookie ADI yalniz server-only
  build output'unda literal sabit. Denetim sonucu: TODO-079 gozlemi muhtemelen RSC navigation ISTEK Cookie
  header'inin (tarayicinin same-origin httpOnly cookie'yi otomatik gondermesi) YANIT payload'u ile
  karistirilmasidir; uygulama kaynakli sizinti yok, urun kodu degismedi.
- Iliski: F3B.3 musteri oturum cizgisini (ADR-034) ve TODO-090 client bundle hygiene'ini tamamlar; ayni
  "client-delivered output'ta secret/raw value olmaz" prensibinin oturum jetonuna uygulanmis halidir.

## ADR-039 Shipping provider abstraction = mağaza-scoped, opsiyonel, admin-kontrollü kargo foundation (F3C.1 / TODO-094)

- Durum: ACCEPTED
- Baglam: Commerce OS'a kargo saglayici entegrasyonu gerekiyor (ilk: MOCK, GELIVER, DHL_ECOMMERCE).
  Core platform hicbir saglayiciya hard-coded bagli OLMAMALI; her magaza kendi credential'ini girer,
  aktif/pasif yonetir. Checkout'ta otomatik canli kargo satin alma ve odeme sonrasi otomatik kargo/barkod
  olusturma bu fazda KAPSAM DISI. Pattern olarak F3B.2 payment provider foundation (ADR-033) alindi.
- Karar: Provider-bagimsiz `ShippingProviderAdapter` sozlesmesi (testConnection/calculateRate/createOrder/
  createReturnOrder/createBarcodeOrLabel/get*/track/cancel/handleWebhook/listGeo*) + normalized result
  modelleri (`apps/api-gateway/src/shipping/types.ts`). MOCK tam calisir (credential gerektirmez); DHL/Geliver
  request mapping URETIR ama HTTP transport varsayilan KAPALI (`SHIPPING_SANDBOX_HTTP_ENABLED=false` →
  SHIPPING_HTTP_DISABLED). Store-scoped modeller: ShippingProviderConfig/Credential, Shipment, ShipmentEvent,
  ShipmentQuote. Gateway uclari `requireStorePlatformAdmin` + store-scope (cross-store → 404) + ALLOWLIST
  serializer ile korunur. DHL credential tek apiKey varsaymaz: type bazli (IDENTITY/STANDARD_COMMAND/
  STANDARD_QUERY/BARCODE_COMMAND/CBS_INFO/BULK_QUERY/FINANCE_QUERY); IDENTITY ayrica customerNumber/
  customerPassword/identityType tutar.
- Isimlendirme: UI/domain dilinde "DHL eCommerce"; "MNG" yalniz teknik endpoint/dokuman referansinda
  (api.mngkargo.com.tr, /mngapi/...). Adapter klasoru `dhl-ecommerce`.
- Sonuc: Store-admin kontrollu kargo operasyon foundation. Checkout/odeme akisina BAGLANMAZ; UI Faz B'ye birakildi.

## ADR-040 DHL eCommerce destructive operasyon guard'i (createOrder/createbarcode varsayilan 409)

- Durum: ACCEPTED
- Baglam: DHL Standard Command `createOrder` canli sipariş kaydi olusturur; Barcode Command `createbarcode`
  siparisi faturalastirip gonderiye cevirir (maliyetli/geri donulemez). Bu fazda canli destructive islem
  ISTENMEZ; ancak adapter/route foundation hazir olmali.
- Karar: Uc katmanli guard. Canli createOrder yalniz `DHL_ECOMMERCE_ALLOW_ORDER_CREATE==="true"` (env) &&
  `providerConfig.allowOrderCreate===true` (mağaza) && request `explicitConfirm===true` saglaninca calisir;
  aksi halde 409 `ORDER_CREATE_DISABLED`. createbarcode icin ayni uclu → 409 `BARCODE_CREATE_DISABLED`
  (`DHL_ECOMMERCE_ALLOW_BARCODE_CREATE`). Guard adapter katmaninda uygulanir (`adapters/guards.ts`); env&config
  izinleri route'ta birlestirilip `ctx.guards`'a verilir. Tum bayraklar varsayilan KAPALI.
- Sonuc: Default kurulumda canli sipariş/barkod olusturulamaz; etkinlestirme bilincli, cok-katmanli ve
  kayda gecer (audit yalniz alan adlarini yazar, secret degil).

## ADR-041 Geliver etiket satin alma guard'i + test-only akis (acceptOffer varsayilan 409)

- Durum: ACCEPTED
- Baglam: Geliver SDK'da `shipments.createTest` (test gonderi) ve `transactions.acceptOffer` (etiket satin
  alma — ucretli) var. Bu fazda canli etiket satin alma ISTENMEZ; yalniz test/dry-run akisi.
- Karar: Geliver `createOrder` = `createTest` (test gonderi; destructive DEGIL, guard YOK ama transport
  kapaliyken SHIPPING_HTTP_DISABLED). `createBarcodeOrLabel` = acceptOffer = etiket satin alma → uc katmanli
  guard: `GELIVER_ALLOW_LABEL_PURCHASE==="true"` && `providerConfig.allowLabelPurchase===true` &&
  `explicitConfirm===true` degilse 409 `LABEL_PURCHASE_DISABLED`. Canli `shipments.create`/acceptOffer bu
  fazda HIC cagrilmaz (guard gecse bile NOT_IMPLEMENTED). Geliver REST yollari SDK metod adlarindan turetildi;
  canli dogrulama yapilmadi (transport kapali).
- Sonuc: Geliver foundation test-guvenli; canli etiket maliyeti olusturulamaz.

## ADR-042 Shipping secret domain ayrimi = ayri SHIPPING_ENCRYPTION_KEY (zorunlu, fallback yok)

- Durum: ACCEPTED
- Baglam: Kargo credential'lari (X-IBM client id/secret, DHL musteri no/sifre, Geliver token) sifrelenmeli.
  Payment F3B.2 generic `createSecretCipher` (AES-256-GCM) helper'ini saglar ama payment dev/test'te guvensiz
  fallback anahtari kullanir. Kargo icin bu davranis ISTENMEZ.
- Karar: Kargo kendi domain anahtarini kullanir: `SHIPPING_ENCRYPTION_KEY`. PAYMENT_ENCRYPTION_KEY'e FALLBACK
  YOKTUR. Anahtar yoksa HICBIR ortamda (development/test/staging/production) guvensiz/hardcoded fallback
  kullanilmaz: kargo credential save/test/decrypt gerektiren TUM islemler `CONFIG_MISSING` doner (cipher lazy
  kurulur — anahtar yokken config listeleme gibi islemler calismaya devam eder). Test ortaminda anahtar test
  env'i ile acikca saglanir. Secret degerleri yalniz create/update request body'sinde plain alinir; response
  ALLOWLIST'tir (configured + maskedKey son-4 + *Set boolean); ciphertext/secret/JWT/customerPassword ASLA
  response/log/docs/test snapshot/client bundle'a cikmaz.
- Sonuc: Kargo gizli anahtar yonetimi odemeden bagimsiz; "anahtar yoksa fallback degil net hata" ilkesi.

## ADR-043 DHL TEST/LIVE base URL ayrimi + x-api-version + Plus Command preflight + cart quote vs sabit kural

- Durum: ACCEPTED
- Baglam: DHL eCommerce (MNG / IBM API Connect) istekleri test ve canli icin AYRI host kullanir ve zorunlu
  x-api-version header bekler. Onceki adapter host'u hardcode api.mngkargo.com.tr (LIVE) idi ve x-api-version
  YOKTU. DHL operasyon akisi paketleme oncesi Plus Command / createRecipient (varis sube tespiti) adimi icerir.
  Sepet/checkout kargo bedeli gercek provider quote ile magaza sabit kural ayrimini gerektirir.
- Karar:
  1. TEST/LIVE host env ile ayrilir: TEST mode DHL_ECOMMERCE_TEST_BASE_URL kullanir; YOKSA TEST_BASE_URL_MISSING
     doner ve CANLI host'a FALLBACK YAPMAZ. LIVE mode DHL_ECOMMERCE_LIVE_BASE_URL kullanir. OpenAPI path'leri
     (/mngapi/api/...) base URL'ye EKLENIR; base URL'ye path eklenmez.
  2. Tum DHL test/live isteklerine x-api-version (DHL_ECOMMERCE_API_VERSION) header eklenir.
  3. Plus Command / createRecipient skeleton eklendi; default destructive guard altinda: env
     DHL_ECOMMERCE_ALLOW_RECIPIENT_CREATE + providerConfig.allowRecipientCreate + request explicitConfirm
     uclusu olmadan RECIPIENT_CREATE_DISABLED (409). Bu turda canli/sandbox createRecipient YOK.
  4. KARGO FIYATI AYRIMI (revize 2026-06-29): DHL eCommerce bir OPERASYON saglayicisidir — Identity, CBS,
     createRecipient, createOrder, createbarcode, tracking. DHL `calculate` cart/checkout kargo fiyati icin
     KULLANILMAYACAK. Bu nedenle sepet/checkout kargo bedeli provider'dan CANLI CEKILMEZ. Kargo bedeli AYRI bir
     faz (F3C.2 Shipping Price Engine, TODO-108) ile cozulur: magaza/admin tarafindan girilen kargo tarife/
     rate-plan modeli. Mevcut sabit kargo kurali provider quote DEGILDIR. `cartShippingQuoteResponseSchema`
     yalniz contract seviyesinde birakildi (storefront/backend uygulamasi YOK; ileride F3C.2 sekillendirecek).
- Sonuc: Test/canli host karismasi ve sessiz yanlis-host fallback'i onlenir; x-api-version eksikligi giderilir;
  createRecipient guvenli skeleton. F3C.1 = shipping provider OPERASYON altyapisi; kargo FIYAT motoru F3C.2'de.
  Safe dogrulama (2026-06-29, testapi.mngkargo.com.tr + x-api-version): Identity HTTP 200 (JWT), CBS/calculate
  HTTP 401 (IBM gateway urun aboneligi: CBS_INFO + STANDARD_QUERY abone degil), Geliver auth gecerli (/providers
  200; eski /geo/cities 404 → testConnection /providers'a tasindi).

## ADR-044 Shipping Price Engine = mağaza TARİFE'si, provider quote DEĞİL (F3C.2 / TODO-108)

- Durum: ACCEPTED
- Bağlam: F3C.1 ile DHL/Geliver OPERASYON sağlayıcı altyapısı tamamlandı (ADR-039..043). DHL eCommerce
  `calculate` canlı/anlık kargo fiyatı için KULLANILMAYACAK; DHL bir operasyon sağlayıcısıdır (Identity, CBS,
  createRecipient, createOrder, createbarcode, tracking). Sepet/checkout kargo bedelinin nasıl belirleneceği
  çözülmeliydi.
- Karar:
  1. Kargo ücreti SAĞLAYICI quote'u DEĞİLDİR. Mağaza/admin tarafından girilen kargo TARİFE planına
     (ShippingRatePlan + ShippingRateRule) göre hesaplanır. Saf, deterministik price-engine (provider'a istek
     atmaz). pricingMode: FIXED / FREE_THRESHOLD / DESI_TABLE / WEIGHT_TABLE / DESI_AND_REGION_TABLE.
  2. `provider` alanı plan üzerinde yalnızca OPERASYON sağlayıcısıyla gevşek ilişkilendirme içindir; FİYAT etkisi
     YOKTUR (provider=MOCK ise quote source MOCK; aksi halde STORE_SHIPPING_TARIFF). Eski hardcoded ₺49,90 / ₺750
     ücretsiz eşiği artık "magic" değil; demo store default rate plan'a (FREE_THRESHOLD) taşındı (seed).
  3. Tek default guard UYGULAMA katmanındadır (Prisma partial unique yok): set-default transaction'ında diğer
     ACTIVE planların isDefault=false yapılır. Aktif/default plan çözümü: önce ACTIVE+isDefault, yoksa en eski
     ACTIVE plan; hiçbiri yoksa NO_RATE_PLAN.
  4. Adres davranışı: GUEST cart veya default adres yok → kargo hesaplanmaz, ADDRESS_REQUIRED ("Teslimat adresi
     seçildikten sonra hesaplanır"). Login + default teslimat adresi → engine çalışır. Checkout teslimat adresini
     her zaman taşır (addressKnown=true) ve quote OK değilse ödeme adımına GEÇİLMEZ (409
     SHIPPING_QUOTE_UNAVAILABLE; NO_RATE_PLAN / RATE_NOT_FOUND / MISSING_DIMENSIONS net kod).
  5. Kargo ücreti SNAPSHOT olarak siparişe yazılır: Order.shippingAmount (tutar) + shippingCurrency /
     shippingSource / shippingRatePlanId / shippingRatePlanName. Ödeme tutarı kargo dahildir; sipariş
     detayı/onay ekranı kargoyu ayrı satır gösterir.
  6. DESI/WEIGHT tablosu: sepet toplam desi/kg = Σ(adet × variant.shippingDesi ?? product.shippingDesi). Ölçüm
     eksikse MISSING_SHIPPING_DIMENSIONS. En spesifik kural seçilir: ilçe > şehir > bölge > generic; eşitlikte
     sortOrder. Eşleşmeyen geo alanı kuralı eler.
- Sonuç: DHL fiyatı MOCK/sabit kural gibi gösterilmez; kargo ücreti şeffaf biçimde mağaza tarifesinden gelir.
  cartShippingQuoteResponseSchema F3C.1'de yalnız contract seviyesindeydi; F3C.2'de status/source/ratePlanId/
  ratePlanName/freeShipping ile genişletilip backend+storefront'a bağlandı. TODO-108 DONE.

- REVİZYON (F3C.2 model genişletme — Generic Tariff Engine):
  1. **Her provider için ayrı fiyat motoru YOK.** Tek generic Shipping Tariff Engine. Provider fiyat listeleri
     (DHL aylık hacim segmenti + desi aralıkları; Aras mesafe zonu + kg/desi + ek hizmetler; Yurtiçi desi/ücrete-esas
     ağırlık + ek hizmet kalemleri) bu generic modele MAPLENİR. Provider-specific pricing CODE yazılmaz; provider'a
     özel işler ileride CSV/Excel import mapper olarak ele alınır (TODO-111).
  2. Model genişlemesi: `ShippingRateTier` (aylık gönderi hacmi segmenti = DHL Tarife I/II/III),
     `ShippingRateZone` (mesafe/bölge zonu = Aras şehir-içi/yakın/kısa/orta/uzak/KKTC/MOBILE; code plan içinde
     unique), `ShippingSurcharge` (SMS/güvence/mobil alan/hamaliye/ağır gönderi; zorunlu her zaman, opsiyonel
     müşteri seçince, conditionJsonSafe ile koşullu). `ShippingRateRule` + tierId/zoneId/chargeType/unitAmountMinor/
     baseAmountMinor/baseThreshold; amountMinor NULLABLE (FLAT dışında zorunlu değil). Mevcut veriler geriye uyumlu:
     chargeType DEFAULT 'FLAT' backfill, amountMinor korunur — FLAT mevcut sabit-ücret yolunu birebir korur.
  3. `chargeType`: FLAT / PER_KG / PER_DESI / PER_KG_OR_DESI / PER_ADDITIONAL_KG_OR_DESI. **billableWeight =
     max(totalWeightKg, totalDesi)** (Karar 5). Aralık eşleşmesi tek skaler billableWeight üzerinden. Volumetrik desi
     şu an precomputed Product/Variant.shippingDesi; gerçek en/boy/yükseklik + divisor (default 3000) ileride
     (TODO-110). 30+/31+ satırı PER_ADDITIONAL_KG_OR_DESI ile temsil edilir: `base + (billable − baseThreshold) ×
     unit`. maxDesi/maxWeightKg null = "ve üzeri". 30+/31+'in toplam fiyat mı ek-birim mi olduğu provider teyidine
     kadar ek-birim varsayılır (TODO-113).
  4. Seçim sırası: aktif/default plan → tarih penceresi → free threshold → tier (monthlyShipmentCount; bilinmiyorsa
     en küçük sortOrder = default) → zone/geo + kg/desi bracket → chargeType hesap → surcharge. Rule specificity:
     districtCode > cityCode > zoneId > regionCode > generic; eşitlikte sortOrder (Karar 2: mevcut city/district
     korundu, zone yeni ana yapı, regionCode geriye-uyumlu kaldı). extraAmountMinor legacy/simple-extra olarak
     korunur; gelişmiş hesabın merkezi DEĞİL — yeni ek ücretler ShippingSurcharge ile (Karar 3).
  5. **Frontend AUTHORITATIVE hesap yapmaz.** Tüm kargo fiyatı backend/api-gateway price-engine'de hesaplanır;
     frontend yalnız quote sonucunu gösterir. Checkout submit'te backend quote'u yeniden hesaplar; frontend'den gelen
     shippingAmountMinor/rateRuleId/tierId GÜVENİLMEZ kabul edilir, order/payment tutarını etkilemez.
  6. Validation: validFrom ≤ validTo; tier min ≤ max + tier aralık ÇAKIŞMA reddi (deterministik tier seçimi için);
     zone code plan içinde unique; chargeType zorunlu alanlar (FLAT→amountMinor; PER_*→unitAmountMinor;
     PER_ADDITIONAL→base+unit+threshold); amount/unit ≥ 0. **Aynı tier+zone içinde kg/desi aralık çakışması
     SERT engellenmez; sortOrder + specificity ile DETERMİNİSTİK çözülür** (Karar: brittle olmayan yaklaşım; engine
     en spesifik + en küçük sortOrder kuralı seçer).

- **F3C.4 ek — Matris giriş + CSV import (ADR-044 devamı, TODO-111).** Admin gerçek fiyat listelerini (DHL desi ×
  Tarife I/II/III; Aras/Yurtiçi desi/kg × zone) satır-satır kural eklemek yerine **matris/grid** ile girer; girdi
  yine aynı generic `ShippingRateRule` modeline maplenir (yeni kolon/şema YOK). Backend AUTHORITATIVE: frontend
  yalnız grid/CSV gönderir; sunucu diff + upsert yapar. **YALNIZ UPSERT:** matris kapsamı = (SEGMENT: yalnız
  tierId dolu) / (ZONE: yalnız zoneId dolu) ve geo (city/district/region) BOŞ olan kurallar; eşleşme anahtarı
  kolon (tierId|zoneId) + eksen bracket'i (minDesi/maxDesi veya minWeightKg/maxWeightKg). Eşleşen kural update,
  yoksa create; **boş hücre** kural oluşturmaz ve mevcudu SİLMEZ; matris kapsamı DIŞINDAKİ özel/gelişmiş kurallar
  (geo dolu veya tier+zone birlikte) KORUNUR (sil-ve-yeniden-yaz YOK). 30+ satırı (max=null = "ve üzeri") için
  davranış admin seçimi: FLAT (sabit toplam) veya PER_ADDITIONAL_KG_OR_DESI (eşik üstü birim, varsayılan; bkz.
  TODO-113). CSV ilk faz = **paste** (textarea), server-side parse, TR ondalık (116,99/₺116,99), ayraç ;/TAB/,;
  file upload + export sonraki faz. Apply tek transaction (partial failure → rollback). Uçlar: POST
  `/stores/:storeId/shipping/rate-plans/:id/{matrix,import}/{preview,apply}`; preview DB'ye YAZMAZ.

## F3C.3 — DHL operasyon aksiyonları sipariş SONRASI admindir (ADR-045)

- **Karar:** DHL eCommerce (teknik: MNG Kargo) operasyon çağrıları (createRecipient/createOrder/
  createbarcode/getshipmentstatus/trackshipment) **checkout'ta YAPILMAZ**. Checkout yalnız store tarife
  motoruyla (ADR-044) kargo ÜCRETİNİ hesaplar. Operasyon, sipariş oluştuktan sonra store-admin sipariş
  detayındaki admin aksiyonlarıyla tetiklenir: `prepare` (createRecipient+createOrder) → `barcode`
  (createbarcode) → `sync` (status/track).
- **createOrder ≠ fiziksel teslim.** `createOrder` 2xx = "DHL gönderi kaydı/kargo talebi oluşturuldu";
  `createbarcode` 2xx = "barkod oluşturuldu". **"Kargoya verildi" YALNIZCA** manuel admin durumu veya DHL
  tracking status (getshipmentstatus/trackshipment) ile söylenir; createOrder/createbarcode bunu ifade etmez.
- **cancel endpoint belirsiz.** Sandbox'ta standardcmd/barcodecmd altında cancelOrder/cancelShipment/
  deleteOrder/cancelbarcode varyantlarının tümü 404 döndü. Doğru endpoint MNG dokümanından teyit edilene kadar
  adapter `cancelShipment` → `ENDPOINT_UNRESOLVED` (409); UI'da iptal aksiyonu disabled.
- **Sandbox request-shape teyitleri:** createOrder order objesi zorunlu `marketPlaceShortCode:""`;
  createRecipient gövdesi `recipient` wrapper; createOrder yanıtı array; createbarcode `value` alanı ZPL
  içerir → DB'ye/loglara yalnız sanitize özet (`barcodeJsonSafe`: pieceNumber/barcodeCount/zplPresent/
  shipmentId/invoiceId) yazılır, raw ZPL ASLA. Bazı ilçelerde (örn. Küçükçekmece) sandbox "varış şubesi hat
  kodu" yok → barcode 500; routable ilçe gerekir.

## F3C.3 — Sağlayıcı HTTP timeout env-configurable (ek not)

- Kargo sağlayıcı HTTP çağrı timeout'u `DHL_ECOMMERCE_HTTP_TIMEOUT_MS` (default 60000ms) ile
  yapılandırılır; sabit 15s kaldırıldı (MNG sandbox ~15s latency'de sınırda abort üretiyordu).
  Timeout aşımı SANITIZE `SHIPPING_HTTP_TIMEOUT` → HTTP 504; URL/secret/token sızdırmaz.

## F3C.3 — DHL provider clarification PENDING (operasyon finalizasyonu beklemede)

**Durum (2026-06-30): BEKLEMEDE.** DHL/MNG'ye 4 kritik operasyonel davranış sorusu iletildi; yanıt
gelmeden DHL operasyon finalizasyonu (retry/failed/pending tasarımı, tracking gösterimi, cancel)
YAPILMAYACAK. Bekleyen sorular:
1. createbarcode 200 dönüp `barcodes`/`shipmentId` BOŞ olduğunda koşul nedir? createOrder→createbarcode
   arası minimum bekleme gerekir mi? (Aralıklı sparse yanıt gözlendi.)
2. createRecipient 200 + boş body → varış şube/hat tespiti senkron mu, ayrı sorgu mu? Bazı ilçelerde
   "VARIŞ ŞUBESİNİN HAT KODU BULUNAMADI" sebebi.
3. `shipmentStatusExplanation: "Sipariş Kargoya Verildi"` + `isDelivered: 0` → gönderi mi oluştu, fiziksel
   teslim mi? Operasyonel statusCode listesi gerekli.
4. trackshipment `location` çıkış/gönderici şubesi mi, varış/alıcı şubesi mi?

**Bekleme süresince bağlayıcı yorumlar:**
- createOrder fiziksel "kargoya verildi" olarak YORUMLANMAZ (yalnız gönderi kaydı/talep).
- createbarcode BOŞ response başarı SAYILMAZ (retry/failed/pending DHL yanıtına göre tasarlanacak).
- trackshipment `location` müşteriye KESİN varış konumu gibi gösterilmez.
- cancel endpoint belirsizliği TODO olarak kalır (TODO-116).

Kanıt/zincir: repo-dışı `dhl-sandbox-report.json` (sanitize req/resp), DHL'e iletildi.

## F3C.3 — DHL yanıtına göre operasyon finalizasyonu (ADR-045 revizyonu, RESOLVED)

**Durum (2026-06-30): YANIT ALINDI → uygulandı.** DHL/MNG operasyonel sorulara yanıt verdi; aşağıdaki
bağlayıcı kararlar kodlandı (provider-agnostic refactor hariç — o TODO-121'de). Bu tur DHL
implementasyonunun finalizasyonudur; rate engine / matrix UI'a dokunulmadı.

- **createOrder ≠ fiziksel kargoya verildi.** createOrder + createbarcode sonrası sistemde gönderi/paket
  kaydı oluşur; fiziksel MNG/DHL operasyonuna teslim edilene kadar gerçek "kargoya verildi" sayılmaz.
  UI/event copy: ORDER_CREATED = "DHL gönderi kaydı oluşturuldu", LABEL_CREATED = "Barkod oluşturuldu /
  paket hazırlandı". "Kargoya verildi" OTOMATİK kullanılmaz; yalnız tracking statusCode fiziksel operasyonu
  gösterirse veya admin manuel işaretlerse. `shipmentStatusExplanation` ham metni ("Sipariş Kargoya
  Verildi") kesin durum gibi gösterilmez → normalize edilmiş status authoritative; ham metin "Sağlayıcı
  durumu (ham)" etiketiyle ayrı gösterilir.
- **statusCode 0-7 normalize eşlemesi netleşti** (`mapProviderStatusToShipmentStatus`):
  0→ORDER_CREATED, 1→LABEL_CREATED, 2→IN_TRANSIT, 3→IN_TRANSIT (teslim birimine ulaştı; alt-durum),
  4→OUT_FOR_DELIVERY, 5→DELIVERED, 6→DELIVERY_FAILED, 7→RETURNED. 5/7 FINAL; 6 FINAL DEĞİL (takip
  gerektirir → ACTIVE). Regresyon koruması: eski/yanlış kod ileri durumu geri çekmez; terminalden dönülmez.
  Ham kod `shipmentStatusCode`, ham metin event `statusText` saklanır.
- **trackshipment `location` = işlem noktası, kesin varış/teslimat şubesi DEĞİL** (test ortamında
  gönderici/çıkış şubesi olabilir). UI label "İşlem noktası"; "Varış şubesi" HARDCODE EDİLMEZ.
- **createRecipient 200 + boş body normaldir** → başarı sayılır; response body zorunlu parse edilmez.
  Hat/şube tespiti barcode aşamasında yapılır; bulunamazsa ayrı operasyonel hata.
- **createbarcode 200 + boş `barcodes`/`shipmentId` ≠ tam başarı** → LABEL_PENDING (BARCODE_INCOMPLETE);
  trackingNumber/shipmentId/ZPL SET EDİLMEZ; BARCODE_PENDING event; retry mümkün. `barcodeJsonSafe`:
  zplPresent/barcodeCount/shipmentIdPresent/invoiceIdPresent/providerReturnedEmptyPayload. Dolu yanıt →
  mevcut LABEL_CREATED davranışı.
- **Routing/hat kodu hatası ("VARIŞ ŞUBESİNİN HAT KODU BULUNAMADI") blocker DEĞİL** → kod hatası değil,
  adres/şube/hat verisi. Status ilerletilmez; BARCODE_FAILED event (sanitize) + retryable
  `BARCODE_RETRYABLE_ERROR` (409). Retry aynı shipment/referenceId üzerinden barcode'u tekrar dener;
  createOrder TEKRAR ÇAĞRILMAZ (duplicate prepare guard korunur).
- **cancel endpoint TEYİT EDİLDİ:** `PUT /mngapi/api/barcodecmdapi/cancelshipment`, gövde
  `{ referenceId, shipmentId }`. adapter `cancelShipment` artık ENDPOINT_UNRESOLVED dönmez; guard üçlüsü:
  env `DHL_ECOMMERCE_ALLOW_CANCEL` && providerConfig (allowOrderCreate kapısı) && explicitConfirm.
  shipmentId yoksa `CANCEL_REQUIRES_SHIPMENT_ID` (409, sağlayıcıya gidilmez). Başarılı → status CANCELLED +
  CANCELLED event. Sağlayıcı 4xx/5xx → `CANCEL_FAILED` (502, fiziksel teslim yapılmış olabilir). UI: cancel
  aksiyonu artık shipmentId varsa aktif; explicit onay copy'si fiziksel teslim riskini belirtir.
- **Test/smoke adresi:** DHL'in önerdiği routable Bağcılar adresi (Bağlar Mah. 1. Sok. No:1 Bağcılar/İstanbul)
  veya daha önce routable Üsküdar kullanılır; Küçükçekmece smoke'ta KULLANILMAZ. Gerçek uygulamada CBS
  city/district kodu eşlemesi ayrı TODO.
- **Data model:** additive enum migration (`20260630120000_dhl_shipment_operation_statuses`):
  ShipmentStatus += LABEL_PENDING/OUT_FOR_DELIVERY/DELIVERY_FAILED; ShipmentEventType +=
  BARCODE_PENDING/BARCODE_FAILED. Mevcut veriyi bozmaz; değer silmez/yeniden adlandırmaz.

## ADR-046 Shipment = ayrı lojistik domain; Order detay yalnız özet + CTA; provider-agnostic operasyon UI (F3C.5 / TODO-121)

**Bağlam.** F3C.3'te kargo operasyonu (prepare/barcode/sync/cancel + timeline) sipariş detayındaki büyük
DHL-merkezli panele sıkışmıştı. Order = ticari işlem; Shipment = lojistik işlem ayrımı bulanıktı ve UI
provider-spesifik (DHL) sözcükler içeriyordu.

**Karar.**
- **Domain ayrımı.** Shipment bağımsız lojistik domain olarak ele alınır. Asıl takip/işlem/listeleme
  store-level shipment ekranlarındadır; sipariş detayında YALNIZ özet kartı + CTA bulunur.
  - `/shipping/shipments` — liste (sipariş no, müşteri, provider+logo, takip no, durum, son işlem noktası,
    son güncelleme, oluşturma) + sade 5 KPI (hazırlanan/barkod bekleyen/transferde/teslim/sorunlu) + filtreler.
  - `/shipping/shipments/[id]` — operasyon detayı: üst özet, provider-safe stepper, "İşlem noktası" timeline,
    capability-driven generic aksiyon paneli.
  - `/orders/[id]` — kargo ÖZET kartı: shipment varsa provider+logo/durum/takip/son işlem + "Kargo Detayına
    Git"; yoksa güvenli özet (alıcı önizleme + güvenlik-kilidi notu). Tam operasyon paneli KALDIRILDI; kart
    dış sağlayıcıya İSTEK ATMAZ (bkz. aşağıdaki F3C.5 manuel inceleme netleştirmesi).
- **Provider-agnostic UI, DHL backend dispatch (hibrit).** UI'da provider yalnız `displayName` + logo olarak
  görünür; buton/copy generic'tir (Barkod/Etiket Oluştur, Durumu Güncelle, Gönderi Kaydını İptal Et, Manuel
  Takip No Gir). Gateway generic alias uçları (`create-label`/`sync`/`cancel`/`manual-tracking`) içeride
  mevcut adapter mantığına dispatch eder (`applyCreateLabel/applySync/applyCancel/applyManualTracking`
  helper'ları order-scoped DHL route'larıyla paylaşılır). Tam provider-agnostic engine/registry bu turda
  yazılmadı (KASITLI: "UI/domain ayrımını doğru kur, engine'i sıfırdan yazma").
- **Generic capability projeksiyonu.** `computeShipmentActionCapabilities` provider capability + shipment
  durumunu minimum generic modele indirger: canPrepare/canCreateLabel/canSync/canCancel/canManualTracking +
  `disabledReason` (i18n kodu). Yalnız DHL sync destekler; manuel takip sağlayıcıya çağrı yapmaz (aktif
  shipment'te her zaman açık).
- **ADR-045 kuralları KORUNUR.** "Kargoya verildi" otomatik durum üretilmez (ORDER_CREATED fiziksel teslim
  değildir); timeline konumu KESİN varış/teslimat şubesi değil → "İşlem noktası". createbarcode boş 200 →
  LABEL_PENDING; routing hatası → BARCODE_RETRYABLE_ERROR; cancel shipmentId + explicit onay ister.
- **Provider logo.** `ShippingProviderConfig.logoUrl/logoAlt` additive (PUBLIC, secret DEĞİL; client
  bundle'a güvenli gider). Bozuk/eksik URL'de sağlayıcı baş harfleri fallback. Storefront'ta checkout'ta
  provider SEÇİMİ olmadığından (ücret F3C.2 tarifesinden, provider quote değil) storefront logo yalnız
  altyapı + TODO.
- **Data model.** Additive migration `20260630160000_add_shipment_provider_logo`:
  `ShippingProviderConfig += logoUrl/logoAlt`, `ShipmentEventType += MANUAL_TRACKING`. Mevcut veriyi bozmaz.

**Sonuç.** Sipariş detayı sadeleşti (operasyon shipment ekranlarına taşındı), kargo modülü güçlü ama yardımcı
e-ticaret modülü olarak kaldı (TMS/WMS şişkinliği yok). Secret/ZPL hiçbir response/UI/bundle'a girmez
(serialize allowlist; barkod yalnız boolean). KAPSAM DIŞI/sonraki: dedike `allowCancel` toggle, tam engine
refactor, müşteri bildirimi, manuel shipment ana akışı, tarife detail-page refactor.

**F3C.5 manuel inceleme netleştirmesi (5dc3cfb sonrası, revert YOK).**
- **Manuel takip explicit admin aksiyonu olduğunda shipment status İLERLEYEBİLİR.** Admin manuel takip no girince
  operasyonel olarak "kargo süreci başladı" demektir: hazırlık aşamasındaki gönderi (`DRAFT/ORDER_CREATED/
  LABEL_PENDING/LABEL_CREATED`) `IN_TRANSIT`'e ilerler; ileri/terminal durumlar korunur (regres yok). Bu YALNIZ
  explicit manuel tracking aksiyonuna özeldir — **provider barcode (createbarcode) sonrası OTOMATİK handoff
  DEĞİLDİR.** "Kargoya verildi" hâlâ otomatik üretilmez. Order ana ticari `OrderStatus` enum'una dokunulmaz;
  order özet kartı shipment status üzerinden güncel görünür.
- **Order detay CTA = online-first, güvenli fallback (REVİZE — bir önceki "istek atmaz" kararının yerine geçer).**
  Kullanıcı kararı: entegrasyonu test etmeden çalışıp çalışmadığı bilinemez → online akış BİRİNCİL. "Gönderi
  Oluştur" önce sağlayıcıyı dener (createRecipient + createOrder). Başarılı → shipment detayına yönlenir (barkod/
  takip/sync orada; createbarcode AYRI adım). Sağlayıcı hatası (401/409/network) kullanıcıya HAM patlatılmaz →
  "Geçici bir sağlayıcı hatası oluştu. Manuel gönderi ile devam edebilirsiniz." + İKİNCİL "Manuel Gönderi Hazırla".
  Manuel fallback (TODO-126) provider'a İSTEK ATMAZ: yerel ORDER_CREATED shipment (`POST .../shipping/shipment-draft`)
  → detay → "Manuel Takip No Gir" → IN_TRANSIT. `createOrder` = gönderi kaydıdır; `createbarcode` = barkod
  hazırlığıdır; ikisi de fiziksel "kargoya verildi" DEĞİLDİR (ADR-045 korunur).
- **Sandbox guard'ları local/test'te AÇIK.** `SHIPPING_SANDBOX_HTTP_ENABLED` + `DHL_ECOMMERCE_ALLOW_RECIPIENT/
  ORDER/BARCODE_CREATE/CANCEL` local/test'te açılır ki dış sağlayıcı entegrasyonu gerçekten test edilebilsin.
  Değerler repo-DIŞI `/.../.secrets/commerce-os-shipping.local.env`'de; tracked compose/.env.example **production-safe
  default (kapalı)** korur. Guard açıkken kullanıcı güvenlik-kilidi mesajını normalde görmez; yalnız gerçekten
  env/config kapalıysa görür. (DHL sandbox provisioning henüz tamsa 401 "no valid subscription" dönebilir → bu kod
  hatası değil; safe provider error olarak yakalanıp manuel fallback önerilir.)
- **Guard copy "canlı/test"ten bağımsızdır.** Sağlayıcı operasyonu güvenlik kilidi (sandbox HTTP + işlem izni)
  ile kapalıdır; UI copy'lerinde yanıltıcı "Canlı" çerçevesi kullanılmaz.

## ADR-046 ek — Müşteri-tarafı kargo takibi = Shipment domaininin ALLOWLIST projeksiyonu (TODO-117)

**Bağlam.** ADR-046 shipment'ı bağımsız lojistik domain yaptı ve operasyonu store-admin ekranlarına taşıdı.
Müşteri kendi siparişinin gönderi durumunu göremiyordu. Karar: müşteriye **yeni domain/endpoint açma**;
mevcut müşteri sipariş detayı uçunu (`GET /public/.../customer/orders/:orderNumber`) **salt-okunur, additive**
bir shipment ÖZETİYLE genişlet.

**Karar.**
- **Allowlist projeksiyon.** Müşteri yüzeyi shipment'ın yalnız güvenli alanlarını taşır (provider görünen ad +
  logo, status, takip no/url, son işlem noktası, updatedAt, sadeleştirilmiş event'ler). Barkod/ZPL, labelUrl,
  externalId'ler, referenceId, rawSafeJson, alıcı PII **çekilmez/serialize edilmez** (gateway SELECT + `parse`).
- **Event hijyeni.** Operasyonel-iç event'ler (barkod/webhook/iç oluşturma) müşteri timeline'ından dışlanır;
  yalnız anlamlı durum/konum event'leri gösterilir. Konum = "işlem noktası" (ADR-045; kesin varış değil).
- **Dürüst durum.** "Kargoya verildi" otomatik üretilmez; `ORDER_CREATED` hazırlık adımıdır, teslim yalnız
  `DELIVERED`. Order ana ticari `OrderStatus` enum'una dokunulmaz; shipment ayrı projeksiyon.
- **İzolasyon.** Own-only zaten `getOrderDetail` (store+customer+orderNumber); shipment additive nullable.
- **Provider seçimi YOK.** Checkout'ta provider seçimi olmadığından (ücret F3C.2 tarifesinden) bu yalnız
  takip gösterimidir; canlı provider sync (TODO-100/104) ve checkout provider logo (TODO-125) ayrı kalır.

**Sonuç.** Müşteri kendi gönderisini dürüst ve güvenli izler; kargo modülü yardımcı e-ticaret modülü olarak
kalır (müşteriye operasyon/secret sızmaz). Mevcut sözleşme/akış bozulmaz (additive).

## ADR-047 Checkout kargo SEÇENEĞİ = AKTİF tarife planı + sunucu-otoriter seçim; sipariş snapshot'ı (TODO-125)

**Bağlam.** F3C.2 (ADR-044) kargo ÜCRETİNİ mağaza TARİFE'sinden hesaplıyordu ama checkout kargoyu yalnız bir
sayı (fiyat) olarak gösteriyordu; müşteri hangi kargo firmasını/hizmetini seçtiğini görmüyordu. Gerçek bir
e-ticaret vitrini için müşteri mevcut kargo seçeneklerini görüp birini seçebilmeli ve seçim siparişe
sabitlenmeli. ADR-044 (kargo = store tarifesi, provider canlı quote DEĞİL) ve ADR-046 (Shipment = ayrı lojistik
domain, canlı takip) KORUNUR — bu karar SADECE checkout SEÇİMİ ile ilgilidir, canlı tracking/webhook ile değil.

**Karar.**
- **"Kargo seçeneği" = AKTİF `ShippingRatePlan`.** Mağazanın birden çok aktif tarife planı olabilir; her biri bir
  seçenektir. Ücret price-engine ile (store tarifesi) hesaplanır. Taşıyıcı görünüm bilgisi (ad + public logo)
  plan.provider üzerinden ENABLED `ShippingProviderConfig`'ten gevşek ilişkiyle eklenir. **Paralel kargo modeli
  oluşturulmaz**; mevcut F3C/F3C.5 domaini yeniden kullanılır. Saf üreteç: `shipping/checkout-options.ts`.
- **Sunucu-otoriterlik / tamper-proof.** İstemci yalnız `shippingOptionId` (= ratePlanId) gönderir; FİYAT GÖNDERMEZ
  (body'de fiyat alanı yoktur ve şema strip eder). Sunucu ücreti seçilen plandan YENİDEN hesaplar. Doğrulama:
  cross-store/inactive/bilinmeyen id → `SHIPPING_OPTION_INVALID`; çoklu seçenek + seçimsiz → `SHIPPING_OPTION_REQUIRED`;
  hiç uygun seçenek yok / quote OK değil → `SHIPPING_QUOTE_UNAVAILABLE` (NO_RATE_PLAN geriye dönük korunur); tek
  uygun seçenek seçimsizse otomatik seçilir.
- **Müşteri-güvenli ALLOWLIST.** `shipping.options[]` yalnız optionId/providerType/providerName/serviceName/
  priceMinor/currency/freeShipping/estimatedDelivery/logoUrl/logoAlt/available taşır. Secret/credential/account no/
  webhook secret/raw payload/label URL/barcode/ZPL ve admin-only alanlar ASLA storefront DTO'suna girmez.
- **Sipariş SNAPSHOT'ı (tarihsel sabitlik).** Seçim siparişe yazılır: `Order.shippingProvider/shippingProviderName/
  shippingLogoUrl/shippingEtaText` (+ mevcut `shippingRatePlanId/Name/Source/Currency` ve `shippingAmount`). Config
  sonradan değişse/silinse bile sipariş özeti sabit kalır. `ShippingRatePlan.deliveryEstimate` (opsiyonel ETA metni)
  eklendi; admin tarife formundan girilir.
- **Yüzeyler.** Sipariş onayı `shippingOption`; müşteri sipariş detayı `shippingSelection` (shipment CANLI
  takibinden AYRI — biri checkout seçimi, diğeri lojistik durum); store-admin sipariş detayı özet satırı +
  `orderSchema.shippingSelection`. Storefront checkout'ta dropdown değil **seçilebilir provider kartları** (radio):
  logo veya baş-harf fallback, fiyat/ETA, seçim cookie'ye yazılır ve sayfa revalidate ile toplamı günceller.
- **Kapsam dışı (KORUNUR).** Canlı provider tracking SYNC'i + webhook imza doğrulaması (TODO-100/104); provider
  logo dosya UPLOAD/asset storage (TODO-127, hâlâ manuel public URL). Dijital/hizmet ürün akışında kargo
  zorlanmaz (checkout-ready sepet zaten yalnız ONLINE fiziksel satırlardan oluşur).

**Sonuç.** Müşteri kargo firmasını/hizmetini fiyat + (varsa) tahmini teslim + logo ile görüp seçer; seçim toplamı
değiştirir ve siparişe sabitlenir. Tüm fiyat/seçim doğrulaması backend'dedir (istemci fiyatına güvenilmez,
cross-store/tamper reddedilir). ADR-044/045/046 bozulmaz; değişiklik additive ve geriye dönük uyumludur.

## ADR-048 Shipping webhook = platform-normalize sözleşme + HMAC imza + inbox idempotency; sync provider-agnostic uçtan (TODO-100/104)

**Bağlam.** TODO-117/125 sonrası müşteri kargo takibi ve checkout kargo seçimi çalışıyor ama shipment
durumları yalnız admin'in manuel "Durumu Güncelle" (tek gönderi sync) aksiyonuyla ilerliyordu. Sağlayıcıdan
GERÇEK durum akışı için iki yol gerekir: (a) push = webhook, (b) pull = toplu tracking sync. F3B.2 payment
webhook shell'i imzayı placeholder kabul ediyordu (TODO-071 ayrı iş); shipping tarafında webhook ucu HİÇ
yoktu. Kısıt: DHL sandbox'ta query/command ürünleri abone değil (F3C.3: 401) ve DHL/Geliver'in gerçek webhook
ham formatı/imza şeması canlı doğrulanamıyor → geniş provider-spesifik entegrasyon bu turda YAPILMAZ.

**Karar.**
- **Platform-normalize webhook sözleşmesi.** `POST /public/shipping/webhooks/:webhookToken` tek uçtur ve
  `shippingWebhookEventRequestSchema` (eventId + referenceId/trackingNumber/externalShipmentId + statusCode/
  statusText/isDelivered/location/occurredAt/trackingUrl) kabul eder. Sağlayıcı-özel ham format adaptörleri
  (DHL/Geliver push formatı + kendi imza şemaları) canlı abonelik/doğrulama mümkün olunca AYRI işte bu ucun
  önüne eklenir (TODO-130).
- **Kimlik ≠ yetki.** URL'deki `webhookToken` yalnız provider config ÇÖZÜMLEME kimliğidir (unique, rastgele);
  tek başına yetki VERMEZ. Yetki = her istekte `x-shipping-signature` + `x-shipping-timestamp` header'ları ile
  `hex(HMAC_SHA256(secret, "{timestamp}.{rawBody}"))`. İmza RAW BODY byte'ları üzerinden doğrulanır (route
  raw-string parser kullanır; JSON re-serialize İMZALANMAZ). Karşılaştırma `timingSafeEqual` (constant-time).
  Bilinmeyen/DISABLED/secret'siz token generic 404 alır (var/yok sızdırılmaz). Kullanıcı auth GEREKMEZ.
- **Secret yaşam döngüsü (ADR-035/042 deseni).** Secret + token admin ucu `POST /stores/:storeId/shipping/
  providers/:id/webhook/rotate` ile üretilir; secret DB'de AES-256-GCM (`SHIPPING_ENCRYPTION_KEY`, fallback yok)
  saklanır ve YALNIZ rotate yanıtında BİR KEZ plain döner. Config DTO'suna yalnız `webhookConfigured` boolean'ı
  girer; `webhookToken`/`webhookSecretCipher` response'a ASLA çıkmaz. Rotate eskisini anında geçersiz kılar.
- **Replay/idempotency = iki katman.** (1) Timestamp toleransı (300 sn) dışındaki istekler REDDEDİLİR
  (`TIMESTAMP_OUT_OF_RANGE`). (2) Pencere içi tekrarları `ShipmentWebhookInbox` keser: imzası GEÇERLİ her
  teslimat `(providerConfigId, eventKey)` unique kaydıyla, shipment güncelleme + `WEBHOOK_RECEIVED` event ile
  AYNI transaction'da yazılır; unique ihlali = duplicate → yeni event YAZILMAZ, ACK `duplicate:true` döner.
  `eventKey` = sağlayıcı `eventId` (varsa) yoksa raw body sha256'sı. Geçersiz imzalı istekler inbox'a YAZILMAZ
  (DB flood/DoS önlemi; yalnız log).
- **Güvenli eşleme.** Durum eşleme mevcut `mapProviderStatusToShipmentStatus` ile yapılır: bilinmeyen statusCode
  durumu DEĞİŞTİRMEZ, terminal durumdan geri dönülmez, regres edilmez (ADR-045 korunur). Eşleşen gönderi yoksa
  audit'li `IGNORED_UNKNOWN_SHIPMENT`, sözleşme dışı/bozuk payload `IGNORED_UNSUPPORTED` kaydı + 200 ACK (crash
  ve sonsuz sağlayıcı retry'ı yok). Shipment araması `{storeId, providerConfigId}` scoped → cross-store mutasyon
  İMKANSIZ. Event `rawSafeJson`'ı yalnız sanitize özet taşır; imza/secret/raw gövde saklanmaz. `location` taşıyan
  `WEBHOOK_RECEIVED` event'i müşteri timeline'ında "işlem noktası" olarak görünür (TODO-117 filtresi değişmedi).
- **Sync = provider-agnostic uç.** `POST /stores/:storeId/shipping/shipments/sync-all` (admin, limit≤50) terminal
  olmayan gönderileri (DRAFT hariç) mevcut `applySync` (getShipmentStatus+trackShipment, adapter registry
  dispatch) ile senkronlar; gönderi başına hata işi durdurmaz, kod bazlı özet döner. DHL Bulk Query
  (getShipmentByDate/getStatusChangedShipments) sağlayıcı-özel toplu ucu, sandbox aboneliği açılınca bu ucun
  arkasına takılır (TODO-100 kalan kısmı). Zamanlanmış otomatik sync worker job'ı ayrı iş (TODO-129).

**Sonuç.** Kargo durumu artık iki güvenli yoldan güncellenebilir: imza+timestamp+idempotency korumalı webhook
ve admin toplu sync. Webhook secret'ları server-side şifreli yaşar, hiçbir public/müşteri DTO'suna secret/raw
payload sızmaz, cross-store yazma tasarım gereği imkânsızdır. Payment webhook imza doğrulaması (TODO-071)
bu karardan BAĞIMSIZ açık kalır.

## ADR-049 DHL (MNG) sağlayıcı yanıtları status-aware normalize edilir; sandbox kanıtı doküman karşısında önceliklidir (F3C.6, TODO-131)

**Bağlam.** F3C.6'da sağlanan 6 OpenAPI dokümanı (Identity/CBS/Plus/Standard Command/Standard Query/Barcode)
mevcut DHL eCommerce (teknik: MNG) adapter'ıyla karşılaştırıldı ve güvenli read-only sandbox smoke yapıldı.
Üç sistematik boşluk bulundu: (1) sorgu/operasyon yanıtlarında HTTP status kontrolü olmadığından 4xx/5xx
gövdeleri "başarı" gibi parse ediliyordu; (2) kümülatif trackshipment listesi her sync'te yeniden event
yazıyordu; (3) dokümandaki dd-MM-yyyy tarih formatı JS `Date.parse` öncelikli parser'da yanlış çözülüyordu.
Ayrıca sandbox, dokümanla iki noktada çelişti (calculate kod alanları string ister; hata zarfı nested/PascalCase).

**Karar.**
- **HTTP >=400 asla başarı gibi parse edilmez.** DHL adapter'ının tüm sorgu/quote/geo/operasyon yolları
  `ensureProviderResponseOk` üzerinden geçer: gönderi sorgusunda 404 → `PROVIDER_SHIPMENT_NOT_FOUND` (HTTP 404;
  sipariş henüz faturalaşmamış olabilir), diğer sorgular → `PROVIDER_QUERY_FAILED` (502), operasyonlar →
  `PROVIDER_OPERATION_FAILED` (502). Hata mesajına yalnız sağlayıcının güvenli alanları girer
  (description/message/httpMessage...); secret/JWT/hesap numarası ASLA girmez. createbarcode/cancel'ın mevcut
  status-aware yolları (ADR-045) değişmez. Token akışı `AUTH_FAILED` yolunda kalır.
- **Sync idempotency insert seviyesinde.** `applySync` yeni TRACKING_UPDATED yazmadan önce mevcut event'lerle
  (statusText|location|occurredAt-ms) doğal anahtar karşılaştırır; müşteri timeline'ı ek olarak ardışık aynı
  event'leri tekler (A→B→A meşru geçişi korunur). STATUS_CHANGED sync-izi olarak event başına kalır (admin
  "son senkron" semantiği), müşteri görünümünde teklenir.
- **Sandbox kanıtı > doküman.** OpenAPI ile gerçek sandbox davranışı çeliştiğinde gözlemlenen davranış esas
  alınır ve çelişki koda yorum + PHASE_LOG kaydı olarak işlenir: calculate `cityCode/districtCode` STRING
  gönderilir (doküman integer der, integer 400 code 4002 üretir); `extractProviderErrorMessage` nested
  `{error:{...}}` + PascalCase varyantlarını tanır.
- **Doğrulanmayan şey iddia edilmez.** Dokümanların faturasız/güvenli olduğunu açıkça söylemediği
  createOrder/createbarcode/cancel bu fazda sandbox'ta ÇAĞIRILMADI (F3C.3 kanıtı geçerli); webhook push formatı
  dokümanlarda olmadığından provider-özel webhook adaptörü EKLENMEDİ (TODO-130 açık). calculate mutlu yolu
  hesap/provizyon kısıtı (500 code 20001 "[] NOLU ŞUBENİN İLİ BULUNAMADI") nedeniyle doğrulanamadı; bu durum
  başarı olarak raporlanmaz.

**Sonuç.** Sağlayıcı hataları artık kontrollü, redaksiyonlu ve makine-okunur kodlarla yüzeye çıkar (junk event /
0 TL quote / null-id sahte başarı imkânsız); tekrarlı sync müşteri-görünür duplikasyon üretmez; tarih alanları
dokümandaki tüm formatlarla doğru çözülür. ADR-044/045/048 korunur; değişiklikler additive'dir.

## ADR-050 Gönderi oluşturma ödeme ön koşulu = PAID/AUTHORIZED; backend guard nihai otorite (TODO-136)

**Bağlam.** Ödemesi alınmamış bir siparişe kargo gönderisi oluşturmak (createRecipient/createOrder veya manuel
taslak) iş açısından yanlıştır: ödemesiz sipariş fiziksel olarak kargoya verilmemelidir. Ödeme modeli
`paymentStatus ∈ {UNPAID, AUTHORIZED, PAID, REFUNDED}`; mock ödeme akışı PAID ve AUTHORIZED'ı "başarılı ödeme"
sayar (`paidAt` işaretlenir, `succeeded = PAID||AUTHORIZED`, gelir olarak işlenir).

**Karar.** "Gönderiye uygun ödeme" = mevcut domainin `succeeded` semantiği: **PAID veya AUTHORIZED uygun; UNPAID
ve REFUNDED engelli.** Tek SAF otorite `isOrderPaidForShipment(paymentStatus)` (`@commerce-os/contracts`,
api-client re-export) hem gateway guard'ı hem store-admin UI tarafından kullanılır (yeni bir ödeme lifecycle'ı
EKLENMEZ; mevcut alan semantiği yansıtılır). Backend NİHAİ otoritedir: gönderi yaratan üç uç (`create-order`,
`dhl/prepare`, `shipment-draft`) sağlayıcıya İSTEK ATILMADAN ve Shipment/ShipmentEvent kaydı OLUŞTURULMADAN, uygun
değilse HTTP **409 `ORDER_PAYMENT_REQUIRED`** döner (DUPLICATE_SHIPMENT ile aynı "sipariş durumu çatışması"
konvansiyonu). Store-admin kargo kartı ödemesiz siparişte "Gönderi Oluştur"u yalnızca UI'da pasifleştirir + net
Türkçe yardımcı metin gösterir; UI pasifliği tek başına GÜVENİLMEZ.

**Kapsam dışı.** Ödeme provider entegrasyonu, checkout fiyatlama, DHL/MNG istek şekli, webhook mimarisi
değişmez; sipariş/ödeme durumu MUTATE EDİLMEZ. Kısmi ödeme için ayrı bir "tam ödendi" bayrağı yoktur → mevcut
`paymentStatus` otoritedir. ADR-045/046/047 korunur.

---

## ADR-050 ek — Karşılama gösterim durumları hazırlık aşamasında ayrıştırıldı (TODO-136)

**Bağlam.** TODO-135'in tek `SHIPMENT_CREATED` gösterim durumu (ORDER_CREATED + LABEL_* birlikte) operasyonel
olarak yetersizdi ve kargo kaydı olmayan sipariş "Gönderilmedi"/"Henüz kargoya verilmedi" gibi yanıltıcı metin
gösteriyordu.

**Karar.** `OrderFulfillmentDisplay` genişletildi: ORDER_CREATED/LABEL_PENDING → `AWAITING_PICKUP` ("Kargonun
Alınması Bekleniyor"), LABEL_CREATED → `PACKED` ("Kargo İçin Paketlendi"), OUT_FOR_DELIVERY → `OUT_FOR_DELIVERY`
("Dağıtımda", artık IN_TRANSIT'e çökmez), kargo yok/DRAFT → `NOT_SHIPPED` ("Hazırlanıyor"). Bu yalnız GÖSTERİM
eşlemesidir; `Order.fulfillmentStatus`/`Shipment.status` MUTATE EDİLMEZ ve ADR-045 korunur (ORDER_CREATED asla
shipped/transit/delivered sayılmaz). Brief'in dördüncü etiketi "Henüz Teslim Alınmadı" bilinçli olarak OTOMATİK
türetilmedi: mevcut sağlayıcı mimarisinde "paketlendi ama kurye almadı"yı ORDER_CREATED/LABEL_CREATED'ten ayıran
ayrı bir provider event'i yoktur ve etiket müşteri teslim durumuyla karışabilir (brief'in kendi uyarısı).
`AWAITING_PICKUP`/`PACKED` "henüz teslim alınmadı"yı zaten dürüstçe karşılar.

---

## ADR-051 — Zamanlanmış shipment sync: çekirdek servis + api-gateway içi döngü; sync desteği adapter listesinden (TODO-129)

**Bağlam.** Gönderi durumu manuel prepare/webhook/manuel sync'e bağımlıydı. Periyodik senkron gerekiyordu;
"worker" için doğal aday `apps/worker` (bullmq) gibi görünse de shipping domain'i (adapter registry,
credential şifreleme AES-256-GCM, guard hesaplama, prisma modelleri) tamamen api-gateway içinde yaşar.
Kodu pakete çıkarmak/worker'a taşımak provider abstraction redesign'ı olurdu (TODO-129 non-goal'ü).

**Karar.**
1. **Çekirdek/zamanlayıcı ayrımı.** Provider-agnostic çekirdek `sync-service.ts`'te (DI persistence ile
   test edilebilir; webhook-routes deseni). Zamanlayıcı `sync-worker.ts` api-gateway SÜRECİ İÇİNDE
   setTimeout-zincirli döngüdür (overlap korumalı, `SHIPMENT_SYNC_ENABLED=false` → no-op, graceful stop).
   Manuel `sync-all` + tekil sync AYNI çekirdeği kullanır → davranış drift'i imkânsız. TODO-123 (barcode
   retry) ile birlikte shipping çekirdeği pakete çıkarılırsa döngü dedike worker servisine taşınabilir;
   çekirdek/zamanlayıcı ayrımı bu taşımayı ucuzlatır.
2. **Sync desteği tek listeden.** Worker sağlayıcı HTTP detayını bilmez; `shipment.provider` → registry
   dispatch. Hangi sağlayıcının tracking sync desteklediği UI capability ile AYNI kaynaktan gelir
   (`SYNC_PROVIDERS`/`providerSupportsShipmentSync`, serialize.ts). Desteklemeyen sağlayıcı
   `PROVIDER_SYNC_UNSUPPORTED` ile atlanır (attempt sayılmaz, batch sürer).
3. **Minimal sync metadata'sı Shipment üzerinde.** `lastSyncAt/nextSyncAt/syncAttempts/lastSyncErrorCode`
   (additive). Webhook inbox'ı zamanlanmış sync için KULLANILMAZ (o, imzalı teslimat idempotency'sidir);
   ayrı job-log tablosu da açılmadı — log + bu dört alan yeterli gözlemlenebilirlik sağlar.
4. **Event idempotency polling'e göre sıkılaştırıldı.** STATUS_CHANGED yalnız gerçek değişimde (durum
   geçişi veya sağlayıcı kod/metin değişimi) yazılır; `lastSyncedAt` DTO alanı artık `Shipment.lastSyncAt`
   öncelikli türetilir. Durum ilerletme kuralları DEĞİŞMEDİ (ADR-045/049 eşleme + regresyon koruması).

**Sonuçlar.** Artı: sıfır yeni servis/altyapı, tek çekirdek, test edilebilirlik, güvenli varsayılanlar
(kapalı; açıkken 300s/25 batch/15dk stale/10 attempt + üstel backoff 6 saat tavan). Eksi: döngü api-gateway
süreciyle aynı kaynakları paylaşır (muhafazakâr limitler bunu sınırlar) ve çoklu gateway replikasında
koordinasyonsuz çift tarama yapabilir (bugünkü tek-instance dev/smoke için kapsam dışı; replika senaryosu
worker servisine taşıma tetikleyicisidir).
