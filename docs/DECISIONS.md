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

## ADR-052 — CBS il/ilçe kod çözümü: exact-match + prepare-öncesi blok; varış onarımı snapshot-bazlı (TODO-124)

**Bağlam.** MNG, cityCode/districtCode gönderilmediğinde varış şubesini districtName + adres
metninden tahmin eder; tutarsız/muğlak adreste createOrder kabul edilip createbarcode 500 kod
20001 "VARIŞ ŞUBESİ BULUNAMADI" ile düşer (OS-000053). Retry/backoff (TODO-123) bu sınıfı
çözemez: yanlış eşleme zamanla düzelmez.

**Karar.**
1. **Çözümleme sağlayıcı çağrısından ÖNCE ve yalnız exact-match.** TR-güvenli normalize
   (tr-TR küçük harf + diakritik katlama) sonrası CBS listesinde birebir eşleşme aranır;
   fuzzy/benzerlik ve serbest adres metninden ilçe çıkarımı YASAK (yanlış ilçeye sessiz
   eşleme, hiç eşlememekten kötüdür). Aynı normalize ada farklı kodlu birden çok kayıt =
   muğlak = eşleşmedi.
2. **CBS verisi varken eşleşmeme = prepare bloklanır** (422 ADDRESS_DISTRICT_CODE_REQUIRED,
   sağlayıcı çağrılmaz) — bozuk sağlayıcı kaydı hiç oluşmaz. **CBS erişilemezse bloklanmaz**:
   isim-bazlı eski davranış sürer (çalışan Kadıköy-tipi siparişler CBS kesintisinde de
   çalışmaya devam eder). Geçerli saklı kod (>0) CBS'e sorulmadan korunur; 0 asla gönderilmez.
3. **CBS lookup'ı providerConfig başına TTL cache'lidir** (6 saat, in-memory). İl/ilçe listesi
   nadir değişir; dropdown + çözümleme + onarım doğrulaması aynı cache'i paylaşır.
4. **Onarım Shipment SNAPSHOT'ında yaşar.** Admin düzeltmesi Shipment recipient alanlarını
   günceller; sipariş/müşteri adresi mutasyona uğramaz (tarihsel sipariş bütünlüğü). Kodlar
   sunucuda CBS'e karşı yeniden doğrulanır. Sağlayıcıya aynı referenceId ile createRecipient
   yeniden iletilir; kabul garantisi olmadığından sonuç `providerResent` olarak dürüstçe
   raporlanır (sahte başarı yok) ve UI "mevcut kargo kaydını otomatik güncellemeyebilir"
   sınırlamasını gösterir.
5. **Sınıflandırma retry politikasının girdisidir.** 20001/"VARIŞ ŞUBESİ" →
   `DESTINATION_BRANCH_NOT_FOUND` → `Shipment.lastBarcodeErrorCode`; TODO-123 job'ı bu koddaki
   gönderileri admin düzeltmesine kadar retry etmemelidir (onarım kodu sıfırlar).

**Sonuçlar.** (+) OS-000053 sınıfı hata prepare aşamasında engellenir; (+) çalışan yollar
(OS-000041/43 isim-bazlı, OS-000050 explicit kod) regresyonsuz; (+) duplicate guard/ADR-045
durum güvenliği korunur. (–) CBS listesi ile mağaza adres metni uyuşmayan meşru adreslerde
admin müdahalesi gerekir (bilinçli tercih: sessiz yanlış şube yerine açık düzeltme);
(–) MNG'nin post-createOrder varış güncellemesi doğrulanmadıkça takılı kayıtlar yeni gönderi
gerektirebilir (dokümante sınırlama).

## ADR-053 — Sipariş teslimat adresi snapshot düzenleme: çift-snapshot yazımı + durum-kilidi (TODO-139)

**Bağlam.** Sipariş oluştuktan sonra yanlış adres kalabiliyordu. TODO-124 repair (ADR-052)
yalnız `Shipment` il/ilçe KODLARINI düzeltiyor; adres İSİMLERİ/ad/telefon/adres satırı ve
`OrderAddress(SHIPPING)` snapshot'ı düzenlenemiyordu. Tarihsel sipariş bütünlüğü gereği adres
snapshot'ıdır (müşteri profili/adres defteri değişince tarihsel siparişler değişmemeli), ama
admin taşımadan önce bu snapshot'ı düzeltebilmeli.

**Karar.**
1. **Snapshot kaynak-otoritesi ikilidir ve ayrı kopyalardır.** Sipariş teslimat adresi =
   `OrderAddress(SHIPPING)` (kargo kodu YOK); kargo kodları/operasyon = `Shipment.recipient*`
   (gönderi sonrası provider işlemlerinin otoritesi). Düzenleme her ikisini de (gönderi
   düzenlenebilirse) tek transaction'da günceller; **müşteri adres defteri (CustomerAddress)
   global mutasyona uğramaz** — değişiklik yalnız bu siparişe özeldir.
2. **Durum-kilidi TODO-124 repair guard'ıyla birebir aynıdır.** Düzenlenebilir = aktif gönderi
   yok **veya** `DRAFT`/`ORDER_CREATED`/`LABEL_PENDING`. Aksi halde 409
   `SHIPMENT_ADDRESS_LOCKED` (`LABEL_CREATED` dahil kilitli: etiket basılı = taşıyıcıya devir
   varsayımı). Kilit backend'de nihai otoritedir; UI ayrıca gizler/uyarır.
3. **CBS aynı ADR-052 kurallarını yeniden kullanır.** Client'tan gelen cityCode/districtCode
   CBS'e karşı yeniden doğrulanır (`validateCodes`; körü körüne güvenilmez); kod verilmezse
   yeni isimden yalnız exact-match (`resolveRecipientGeo`; fuzzy YOK); eşleşmezse bayat kod
   NULL'lanır (0/negatif ASLA persist). Geçerli eşleşmede `lastBarcodeErrorCode` sıfırlanır.
4. **Migration YOK — mevcut yapı yeniden kullanılır.** Gönderi olayı için yeni enum eklemek
   yerine `ShipmentEvent.DESTINATION_REPAIRED` net `statusText` ile yeniden kullanılır; sipariş
   olayı `OrderEvent.type` serbest String olduğundan `SHIPPING_ADDRESS_UPDATED` migrationsız
   yazılır. (Şema yüzeyi genişletilmez; TODO-124/129 alanlarına dokunulmaz.)
5. **Sağlayıcı onarımı en-iyi-çaba, dürüst raporlu.** DHL + güvenli + geçerli kodlu ise
   `createRecipient` yeniden iletilir (ADR-052 guard deseni); başarısız/desteklenmezse yerel
   snapshot KORUNUR, `providerResent:false`/`providerRepairSupported:false` döner (sahte başarı
   yok). Duplicate guard'a dokunulmaz — otomatik ikinci aktif gönderi açılmaz.

**Sonuçlar.** (+) Admin taşıma öncesi adresi güvenle düzeltir; barkod retry düzeltilmiş
kodlarla çalışır; (+) tarihsel sipariş/müşteri adres bütünlüğü korunur; (+) ADR-045 durum
güvenliği + duplicate guard bozulmaz; (+) migration/şema genişlemesi yok. (–) LABEL_CREATED
sonrası düzeltme kapalı (bilinçli konservatif sınır — ayrı "taşıyıcıya devredildi" bayrağı
yok); gerekirse yeni gönderi manuel açılır. (–) Sağlayıcı post-kayıt güncellemeyi kabul
etmezse (providerResent:false) eski provider kaydı için yeni gönderi gerekebilir. TODO-123
retry job'ı adres onarımından SONRA çalışmalıdır.

## ADR-054 — Barkod retry/backoff: sınıflandırma + ayrı Shipment metadata + api-gateway içi döngü (TODO-123)

**Bağlam.** Barkod oluşturma sağlayıcı hatasıyla düşebiliyordu; admin "Barkod Oluştur"u tekrar
tekrar tıklamak zorundaydı. Sistem **geçici** (timeout/5xx) ile **veri düzeltmesi gerektiren**
(varış şubesi/adres eşlemesi geçersiz — TODO-124) hatayı ayırt edip zamanlanmış retry
uygulamıyordu.

**Karar.**
1. **Üç sınıf** (`barcode-service.ts`): `RETRYABLE` (transient: `SHIPPING_HTTP_TIMEOUT`,
   `BARCODE_PROVIDER_ERROR`, `PROVIDER_NETWORK_ERROR`) → backoff; `DATA_FIX`
   (`DESTINATION_BRANCH_NOT_FOUND`, `ADDRESS_DISTRICT_CODE_REQUIRED`, `CBS_CODE_INVALID`,
   `RECIPIENT_EMAIL_*`) → admin düzeltmesi bekler; `TERMINAL` (`AUTH_FAILED`, `*_DISABLED`) →
   otomatik denenmez. Bilinmeyen kod uydurulmaz → `RETRYABLE` (mevcut ADR-045 default'u korunur).
2. **Ayrı Shipment metadata** (additive migration): `barcodeRetryCount`, `barcodeNextRetryAt`,
   `barcodeLastAttemptAt`, `barcodeRetryBlockedReason`. TODO-129 sync alanlarından (`syncAttempts`/
   `nextSyncAt`) AYRIDIR — barkod oluşturma ve durum senkronu farklı yaşam döngüleridir.
   `barcodeRetryBlockedReason` ("neden otomatik denenmiyor": DATA_FIX/TERMINAL/MAX_ATTEMPTS) ile
   `lastBarcodeErrorCode` ("ne oldu") **ayrı** tutulur.
3. **Tek çekirdek, iki tetik.** Manuel "Barkod/Etiket Oluştur" + zamanlanmış `barcode-retry-worker.ts`
   (TODO-129 sync worker deseni: api-gateway içi overlap-korumalı `setTimeout` zinciri) AYNI
   `attemptBarcode` çekirdeğini kullanır (drift yok). Manuel tetik backoff'u bypass eder; firlatılan
   hata (timeout) manuelde yeniden fırlatılır → mevcut HTTP mapping (504/409) korunur.
4. **Backoff** üssel: `stale·2^(deneme-1)`, 6 saatle sınırlı; başarı/pending tüm retry metadata'sını,
   adres/varış onarımı (TODO-124/139) bloğu + sayaç/backoff'u sıfırlar.
5. **Idempotent event:** `BARCODE_FAILED` yalnız ilk hata / kod değişimi / yeni blok nedeninde.
6. **Varsayılan kapalı** (`BARCODE_RETRY_ENABLED=false`); docker dev'de açılmaz (MNG sandbox'ı
   düzenli çağırmamak için) — manuel retry her zaman çalışır.

**Sonuçlar.** (+) Transient hatalar otomatik iyileşir; veri hataları admin'e net CTA ile yönlendirilir;
(+) sahte başarı/durum ilerlemesi yok, duplicate guard + CustomerAddress bütünlüğü korunur; (+) manuel
ve otomatik yol tek çekirdekten (drift yok). (–) İki ayrı worker (sync + barcode retry) aynı süreçte
döner (kabul: küçük, gürültüsüz, varsayılan kapalı); (–) DATA_FIX blokunda manuel tıklama düzeltme
yapılmadıysa aynı hatayı üretir (bilinçli: sağlayıcı nihai otorite).

## ADR-055 — Provider HAM webhook payload adapter'ı: grounded şekiller + normalize idempotency; imza modeli DEĞİŞMEDİ (TODO-130)

**Bağlam.** ADR-048 webhook ucu platform-normalize sözleşme + platform HMAC ile çalışıyordu; sağlayıcının
GERÇEK push formatları için adapter katmanı TODO-130'a bırakılmıştı. Kısıtlar aynı kaldı: repoda hiçbir
sağlayıcının RESMÎ ham webhook örneği yok (DHL sandbox aboneliği/callback kaydı açık — TODO-107); repoda
grounded olan tek şey MNG/DHL query API yanıt şekilleri (mappers.ts: getshipmentstatus/trackshipment).
Geliver için hiçbir payload şekli grounded değil. Not: bu repoda "MNG" ayrı provider DEĞİLDİR;
DHL_ECOMMERCE = api.mngkargo.com.tr (ADR-039/049).

**Karar.**
- **Adapter = imza SONRASI saf normalize katmanı** (`webhook-adapters.ts`):
  `normalizeShippingWebhookPayload(provider, json) → { supported, format, events[] } | { supported:false,
  reason }`. Güvenlik modeli (raw-body HMAC + timestamp + generic 404 + inbox idempotency + rotate)
  AYNEN korunur; adapter throw ETMEZ, bilinmeyen şekil güvenli `IGNORED_UNSUPPORTED` olur (neden sanitize
  `statusText`'te). Sağlayıcının KENDİ imza şeması bu turda EKLENMEZ (HMAC zayıflatılamaz); canlı
  callback kaydıyla birlikte ayrı iş.
- **Yalnız GROUNDED şekiller.** PLATFORM sözleşmesi (en az bir eşleştirme kimliği zorunlu) tüm
  sağlayıcılarda öncelikli çalışır (geriye uyum). DHL_ECOMMERCE ek olarak: (a) getshipmentstatus-benzeri
  durum push'u (`shipment{referenceId,shipmentId,barcode,shipmentStatusCode,shipmentStatus,isDelivered,
  trackingUrl,deliveryDateTime}` — kimlik + durum sinyali zorunlu), (b) trackshipment-benzeri kümülatif
  hareket push'u (dizi / tek hareket / `{referenceId,events[]}` sarmalı; `eventStatusCode/eventStatus/
  eventDateTime2/eventDateTime/location`). Farklı gönderi kimlikleri tek teslimatta → AMBIGUOUS,
  işlenmez (tahmin yok). Geliver ham formatı örnek payload gelene kadar `GELIVER_SAMPLE_REQUIRED` ile
  güvenli unsupported; MOCK yalnız PLATFORM kabul eder (testler stabil).
- **Eşleştirme önceliği + sınırı.** externalShipmentId → trackingNumber → referenceId; hepsi
  `{storeId, providerConfigId}` scoped (cross-store imkânsız). PII/adres ile eşleşme YOK; webhook'tan
  shipment YARATILMAZ; eşleşmeyen kimlik audit'li `IGNORED_UNKNOWN_SHIPMENT`.
- **Idempotency.** PLATFORM yolu mevcut anahtarı korur (`evt:<id>` / `sha256:<rawBody>`); ham şekiller
  volatil alan içermeyen normalize deterministik `nrm:<sha256(provider+event parmak izleri)>` kullanır
  (aynı sağlayıcı eventi aynı anahtar; kümülatif liste büyüyünce yeni teslimat kabul edilir). Inbox
  unique `(providerConfigId, eventKey)` dedupe KAPISI değişmedi.
- **Durum/olay güvenliği.** Durum, sync ile AYNI `mapProviderStatusToShipmentStatus` üzerinden event
  fold'u ile ilerler (drift yok; bilinmeyen kod İLERLETMEZ, terminal regres ETMEZ, teslim yalnız kanıtla).
  Çoklu hareketli payload'ın ek hareketleri doğal anahtarla (`shipmentTrackingEventKey`,
  TRACKING_UPDATED ∪ WEBHOOK_RECEIVED timeline'ına karşı) dedupe edilip ayrı WEBHOOK_RECEIVED yazılır;
  persistence anahtar listesi sunmuyorsa ek hareket YAZILMAZ (güvenli taraf). Ham tarihler
  `parseProviderDate` (dd-MM-yyyy tuzağı çözülü) ile parse edilir. Migration YOK; kontrat/DTO değişikliği
  YOK (admin allowlist + müşteri projeksiyonu aynen).

**Sonuçlar.** (+) MNG/DHL gerçek push'ları imza + idempotency + regresyon korumalarıyla işlenebilir;
(+) tek durum eşleme kaynağı (sync/webhook drift'i yok); (+) bilinmeyen/deştelenmeyen her şey audit'li ve
mutasyonsuz. (–) DHL ham şekilleri query-API yanıtlarından türetildi; canlı push formatı farklı çıkarsa
adapter alanları genişletilecek (unsupported güvenli düşüş garantili); (–) Geliver adapter'ı örnek payload
gelene kadar bilinçli boş.

## ADR-056 — Kargo HAREKET metniyle durum ilerletme: kod-yoksa-metin, yalnız movement push'una scoped (TODO-140)

**Bağlam.** TODO-130 (ADR-055) sonrası MNG/DHL sandbox HAREKET (trackshipment / DHL_TRACKING) push'ları
durum KODU taşımadan yalnız `eventStatus` METNİ gönderebiliyor ("SMOKE AKTARMADA", "SMOKE TRANSFER
MERKEZİNDE"). `mapProviderStatusToShipmentStatus` yalnız `statusCode`+`isDelivered` incelediğinden kod
null → ilerleme yok; timeline hareket gösterse de üst durum PACKED/"Kargonun alımı bekleniyor."da takılı
kalıyordu. Müşteri/store-admin gösterimi zaten `Shipment.status`'tan doğru türetiyordu (IN_TRANSIT →
"Yolda"); sorun kaynak-otorite durumun bayat kalmasıydı (UI değil).

**Karar.**
- **Paylaşılan saf çıkarım.** `status-map.ts` içine `inferShipmentStatusFromTrackingText(text) →
  ShipmentStatus | null`. Türkçe büyük/küçük + diakritik BAĞIMSIZ normalize (NFD + noktalı/noktasız i
  sabitleme + combining-mark strip + ASCII fold). Güçlü kanıt önceliği: TESLİM EDİLDİ/DELIVERED →
  DELIVERED; DAĞITIMA ÇIKTI/DAĞITIMDA/OUT FOR DELIVERY → OUT_FOR_DELIVERY; TRANSFER/AKTARMA/TAŞIMA/YOLDA/
  HUB/SORTING/DAĞITIM MERKEZ/ARRIVED-DEPARTED FACILITY → IN_TRANSIT. Zayıf/bilinmeyen (oluşturuldu/etiket/
  barkod/paketlendi/"teslim alındı"=kuryeye teslim) → null (sahte ilerleme yok).
- **Tek fold, iki kaynak.** `mapProviderStatusToShipmentStatus` kod eşlemesi + metin çıkarımından EN İLERİ
  adayı (rank) seçer; terminal hedef (DELIVERED/RETURNED) her zaman uygulanır, terminalden GERİ dönülmez,
  ileri durum geri çekilmez. Webhook (`webhook-routes.ts`) ve zamanlanmış sync (`sync-service.ts`) AYNI
  yardımcıyı kullanır (drift yok); sync ayrıca `trackShipment` hareketlerini katarak ilerletir.
- **Kapsam güvenliği (kritik).** Metin çıkarımı YALNIZ HAREKET push'una (DHL_TRACKING + sync `track`
  olayları) uygulanır. DURUM push'u (getshipmentstatus / DHL_STATUS) ve PLATFORM sözleşmesi kod/isDelivered
  ile ilerler — status-push `statusText`'i TEK BAŞINA kanıt sayılmaz (TODO-130'un kararı korunur; ADR-045
  "ORDER_CREATED fiziksel teslim değil" semantiği bozulmaz).
- **Değişmeyenler.** Idempotency/dedupe (event fingerprint durum metnini zaten taşıyordu, türetilen durumu
  değil), müşteri/admin DTO allowlist'i, ham payload sızmazlığı. Migration YOK, kontrat/DTO YOK.

**Sonuçlar.** (+) Kod taşımayan gerçek carrier hareketleri artık üst durumu doğru yansıtıyor ("Yolda"),
UI tutarsızlığı giderildi; (+) tek çıkarım kaynağı (webhook/sync drift'siz), regresyon/terminal koruması
merkezi. (–) PLATFORM sözleşmesiyle gelen SALT-metin movement'ları (kod yok) ilerlemez — grounded sağlayıcı
(MNG/DHL) DHL_TRACKING kullandığından pratik etki yok; gerekirse ileride PLATFORM movement'ı da kapsanabilir.
(–) Metin sözlüğü kalıp-tabanlı; sağlayıcı beklenmedik ifade kullanırsa null'a düşer (güvenli — kod/isDelivered
yolu hâlâ ilerletir).

## ADR-057 — Config env parsing politikası: opsiyonel boş-string normalizasyonu, zorunlular strict (TD-036)

**Bağlam.** `infra/docker/docker-compose.yml` tüm servislere `.env.example`'ı `env_file` olarak besler;
`KEY=` (boş) satırlar container'a boş string olarak geçer. Merkezi Zod şeması (`packages/config`) OPSİYONEL
alanlarda bile `url()`/`regex()`/enum/`coerce.number()` doğrulaması boş string'i reddedip api-gateway
boot'unu çökertme sınıfıydı (PR #10/#15 nokta-atışı düzeltmişti; desen inline tekrar ediyordu).

**Karar.**
- **Tek kural.** Opsiyonel env: `undefined | null | "" | yalniz-bosluk` → "yok" (undefined) → varsayılan/
  undefined. Zorunlu env: strict; eksik/geçersiz → yüksek sesle hata. Opsiyonel alanda boş OLMAYAN geçersiz
  değer → yine yüksek sesle hata.
- **Paylaşılan helper.** `packages/config/src/env.ts`: `emptyToUndefined`, `optionalEnv`, `optionalUrlEnv`,
  `optionalBooleanEnv`, `optionalNumberEnv`. Şema (`index.ts`) bunları kullanır; inline `z.preprocess`
  tekrarı yok.
- **Strict beyaz-değil-liste.** `DATABASE_URL`, `REDIS_URL`, `INTERNAL_API_TOKEN`, `SESSION_SECRET`
  toleranssız kalır. Secret'lar (`PAYMENT_ENCRYPTION_KEY`, `SHIPPING_ENCRYPTION_KEY`) şemada `optional`
  bırakıldı; downstream `key.trim().length` ile boşu "yok" sayar (config'te normalize edilmez).
- **Hata mesajı.** `loadConfig` `safeParse` + `ConfigValidationError`: yalnız env ANAHTARI + Zod mesajı;
  env DEĞERİ asla basılmaz (secret sızmaz).

**Sonuçlar.** (+) Herhangi bir opsiyonel env'i boş bırakmak artık boot'u çökertmez; tek merkezi kural,
inline tekrar yok; hata mesajları anahtar-adlı ve secret-güvenli. (–) Opsiyonel alanlara verilen boş
OLMAYAN yazım hataları sessizce yutulmaz — bilinçli olarak yüksek sesle hata (doğru davranış). (–) Web
app'lerin request-time `?? default` okuyuşları bu ADR kapsamı dışında (boot değil).

## ADR-058 — Kampanya indirimi kaynak doğrusu: sunucu motoru + immutable sipariş snapshot'ı (F4A)

**Bağlam.** F4A Kampanyalar & Kuponlar MVP'si kupon kodu + otomatik sepet/ürün/kategori kampanyaları
getiriyor. Önceki durum tek hardcoded `DEMO10` demo kuponuydu (ADR-031 "demo calculation"). İndirim parası
etkileyen bir alan olduğundan istemciye güvenilemez; kampanya tanımı sonradan değişse bile geçmiş sipariş
tutarları sabit kalmalı; kullanım limitleri eşzamanlı checkout'larda aşılmamalıdır.

**Karar.**
- **Tek hesap noktası.** İndirim YALNIZ sunucu tarafındaki saf motorla hesaplanır
  (`apps/api-gateway/src/campaigns/discount-engine.ts`). İstemciden yalnız kupon KODU alınır; tutar/oran/
  toplam istemciden ASLA kabul edilmez. Public sepet ve checkout AYNI motoru kullanır (drift yok).
- **Immutable sipariş snapshot'ı.** Sipariş oluşurken uygulanan her indirim `OrderDiscount` satırı olarak
  (label/code/discountType/discountValue/discountAmountMinor/scopeSummary) kopyalanır ve sipariş sonrası
  DEĞİŞTİRİLMEZ; kampanya/kupon silinse/değişse bile tarihsel sipariş sabittir (kargo snapshot deseniyle
  — ADR-047 — tutarlı). `Order.discountAmount`/`totalAmount` mevcut finance yolunda kalır
  (max(0, subtotal - discount + shipping)); negatif toplam imkânsız, indirim subtotal'i aşamaz.
- **Transactional redemption.** Kullanım kaydı (`CampaignRedemption`, sipariş başına kampanya UNIQUE)
  sipariş transaction'ının İÇİNDE yazılır; toplam limit koşullu `updateMany` (`usageCount < totalUsageLimit`)
  ile ATOMIK artar, müşteri-başı limit aynı transaction'da redemption COUNT ile doğrulanır. İhlalde
  transaction ROLLBACK edilir (sipariş + sayaç kalıcı olmaz) ve istemci 409 `COUPON_INVALID` alır. Quote
  anındaki değerlendirme yalnız UX'tir; TEK geçerli kontrol sipariş transaction'ıdır.
- **Kupon kimliği store-scoped.** `normalizedCode` (trim + locale-BAĞIMSIZ uppercase; TR-I tuzağına karşı
  `[A-Z0-9_-]` kısıtı) mağaza kapsamında UNIQUE'tir; kupon lookup'ı storeId ile yapılır — bir mağazanın
  kuponu başka mağazada ÇÖZÜLMEZ. Public hata nedenlerinde NOT_FOUND ve INACTIVE istemcide aynı genel
  kopyaya düşer (kupon varlığı/durum detayı sızdırılmaz); kampanya iç metadata'sı/istatistiği public
  yanıta taşınmaz (yalnız label/code/amount).
- **Stacking varsayılanı: BİRLEŞMEZ.** Kupon her zaman önceliklidir; adaylar priority→tutar→id sırasıyla
  deterministik değerlendirilir; `stackable=false` bir kampanya seçildiğinde başka kampanya uygulanmaz
  (birden çok otomatik aday varsa en iyi indirim seçilir); yalnız `stackable=true` kampanyalar birleşir ve
  toplam daima kalan sepet tutarıyla cap'lenir.
- **Geçersiz kuponla sipariş OLUŞMAZ.** Checkout, `couponStatus !== APPLIED` iken 409 döner (sessiz
  sıfır-indirimle müşteriyi tam fiyata düşürmek yok).
- **Enum rezervi.** BUY_X_GET_Y/FREE_SHIPPING/MEMBERSHIP_ONLY tipleri şemada rezervedir; motor bilinmeyen/
  rezerv tipi UYGULAMAZ (ileri fazlar migrationsız tip açabilir).

**Sonuçlar.** (+) İndirim tamper-proof ve deterministik; geçmiş siparişler kampanya değişikliklerinden
etkilenmez; limitler yarış koşulunda aşılamaz; mağazalar arası kupon sızıntısı yok. (–) Sipariş sonrası
iptal/refund'ta redemption GERİ ALINMAZ (mevcut sipariş yaşam döngüsünde kompanzasyon deseni yok; kayıt
tarihseldir — bilinçli sınırlama, gelecekte iade akışıyla ele alınabilir). (–) Ürün kartı kampanya rozeti
MVP dışı bırakıldı (public listing sözleşmesi değişmedi; follow-up).

## ADR-059 — Kampanya raporlaması immutable sipariş snapshot'ları + redemption kayıtlarından hesaplanır (F4A.2)

**Bağlam.** F4A.1/F4A.2 takibi kampanya görünürlüğü (vitrin rozetleri) ve kampanya analitiği (kullanım,
toplam indirim, ciro, ortalamalar, son kullanımlar) getiriyor. Kampanya tanımı yaşayan bir kayıttır
(değer/pencere/kapsam sonradan değişebilir, kampanya arşivlenebilir); rapor geçmişe dönük doğru kalmalıdır.

**Karar.**
- **Kaynak doğrusu snapshot'lardır.** Sipariş detayı ve kampanya analitiği YALNIZ immutable
  `OrderDiscount` satırları + `CampaignRedemption` kayıtları + siparişin kendi tutar alanlarından
  (`subtotalAmount`/`discountAmount`/`totalAmount`) hesaplanır. Güncel kampanya tanımından geçmişe dönük
  YENİDEN HESAP YAPILMAZ; kampanya sonradan düzenlense/arşivlense bile rapor değişmez (arşivli kampanyanın
  analitiği görüntülenebilir kalır).
- **Çift sayım imkânsız.** `CampaignRedemption` `@@unique([campaignId, orderId])` olduğundan kampanya
  başına her sipariş bir kez sayılır; "ciro" metrikleri redemption'lı siparişlerin subtotal (indirim
  öncesi) ve totalAmount (tahsil edilen) toplamıdır.
- **İptal/iade dahildir (dokümante sınırlama).** ADR-058'deki kompanzasyonsuz modelle tutarlı olarak
  iptal/refund edilmiş siparişlerin redemption'ları analitikte TARİHSEL olarak kalır; UI bu notu taşır.
  İade akışı geldiğinde net-rapor ayrı bir karar olacaktır.
- **Public rozet projeksiyonu allowlist'tir.** Vitrine ürün başına tek kampanya rozeti sunulur
  (`publicCampaignBadgeSchema`: kind/discountType/discountValue/minOrderAmountMinor). Yalnız
  ACTIVE + `isPublic=true` + penceresi açık + limiti dolmamış kampanyalar aday olur; kampanya iç kimliği,
  kullanım/limit istatistiği, priority/stackable ve kapsam listeleri public gövdeye TAŞINMAZ
  (`isPublic=false` özel kuponlar hiçbir public yüzeyde görünmez). Etiket metni paylaşılan helper'dan
  (`getCampaignPublicLabel`/`getCampaignBadgeText`, `@commerce-os/utils`) üretilir — tek kopya kaynağı.
- **Başarısız denemeler rapor dışıdır.** Analitik yalnız başarılı redemption'lara dayanır; geçersiz kupon
  denemeleri için event tablosu YOKTUR ve MVP'de eklenmedi.

**Sonuçlar.** (+) Rapor, tarihsel siparişlerle her zaman tutarlı; kampanya düzenlemeleri raporu bozamaz;
mağazalar arası izolasyon mevcut store-scope guard'larıyla korunur. (–) Analitik MVP'de redemption
kayıtlarını bellekte toplar (kampanya başına); çok yüksek hacimde SQL aggregate/materialized görünüme
taşınması follow-up'tır. (–) İptal edilen siparişler ciroda kalır (nota bağlanmış bilinçli sınırlama).

## ADR-060 — Vitrin kampanya gösterim taksonomisi + kalıcı müşteri kupon cüzdanı (F4A.3)

**Bağlam.** F4A.1/F4A.2 sonrası vitrin, otomatik sepet indirimlerini ("Sepette %X") ve
kupon-kodu gerektiren kampanyaları GÖRSEL OLARAK karıştırıyordu: kupon ürünlerinde müşteri kodu
görmüyor, nereden alacağını/nasıl kullanacağını bilmiyordu ("Kupon kodu gerektirir" çıkmaz sokak).
Ayrıca kuponların üç meşru dağıtım yolu (public keşif, admin ataması, kod ile tanımlama) için bir
model yoktu.

**Karar.**
- **Gösterim taksonomisi (public DTO, additive):** `publicCampaignBadgeSchema` genişletildi —
  `displayKind` (`AUTOMATIC_CART_DISCOUNT` | `PUBLIC_COUPON`), `requiresCouponCode`, `couponCode`
  (nullable), `couponAction` (`CLAIM`/`APPLY`/`COPY`/`MANUAL_ONLY`), `endsAt`.
  - **Otomatik kampanya:** ürün kartı "Sepette %10", detay "Kod gerekmez" + alt limit; kod ASLA taşınmaz.
  - **Public kupon:** kart "Kuponlu ürün"/"₺X kupon"; detay KUPON KARTI (tutar, alt limit, son kullanma,
    kod, aksiyon). "Kupon kodu gerektirir" tek başına gösterilmez — kullanıcıya yol verilir.
- **Public kod güvenliği:** kupon kodu yalnızca `campaign.isPublic=true` + kupon `ACTIVE` + pencere
  geçerli + store-scoped iken taşınır. Private (`isPublic=false`) kuponlar hiçbir public yüzeye girmez;
  yalnızca kodu bilen veya kendisine atanan müşteri kullanabilir. İç kimlik/priority/stackable/usage/
  limit/redemption ASLA sızmaz (allowlist korunur).
- **Kalıcı müşteri kupon cüzdanı (`CustomerCoupon`):** additive migration. Bir satır bir müşteri
  (`customerId`) VEYA bir email için tutulur; `status` (AVAILABLE/APPLIED/USED/REVOKED), `source`
  (ADMIN_ASSIGNED/PUBLIC_CLAIMED/CODE_CLAIMED). Yaşam döngüsü: "Kullan" → APPLIED, "Kaldır" →
  AVAILABLE, başarılı sipariş → USED (`orderId`/`usedAt`). Başarısız sipariş USED yapmaz (aynı
  transaction; rollback).
- **İki adımlı akış:** "Kupon Kodu Ekle" kodu DOĞRULAR ve uygunsa cüzdana (Kuponlar) EKLER (claim);
  uygulama ("Kullan") AYRI adımdır. Alt limit/kapsam claim'i reddetmez — kart "Alt limit eksik"
  durumuyla görünür.
- **İndirim kaynak doğrusu değişmez.** Kupon indirimi yine `couponCode` + sunucu motoru (ADR-058);
  cüzdan APPLIED yalnızca durum aynasıdır, client'a güvenilmez. "Kullan" hem cookie `couponCode`'unu
  yazar hem (oturum açmış müşteride) cüzdanı APPLIED'a senkronlar. Sipariş oluşturma yine transaction
  içinde limitleri/pencereyi/store-scope'u yeniden doğrular.
- **Sepet başına tek APPLIED (MVP).** Tek `couponCode` transport'u ile birebir; motor stacking
  davranışı korunur.
- **Admin ataması:** kampanya detayı (email ile) VE müşteri detayı (kupon seçerek) — AYNI backend
  servisi (`assignCoupon`). Cross-store atama reddedilir; private kuponu public YAPMAZ; email listede
  MASKELİ döner.

**Sonuçlar.** (+) Otomatik vs kupon vs private ayrımı net; müşteriye kupon için gerçek bir yol
(kart/kod/aksiyon) sunulur; cüzdan atama/claim/kullanım kalıcıdır. (–) Misafir sepetinde kalıcı müşteri
kimliği olmadığından: misafire ATANAN kupon checkout email'i girilene kadar görünmez; misafir kod-claim'i
sepet cookie'sinde (`claimedCodes`) yaşar. (–) Cüzdan APPLIED durumu kalıcıdır ama indirimin kaynak
doğrusu değildir (bilinçli; client tamper koruması). (–) Kampanya detayı atama listesi bellekte
toplanır — çok yüksek hacimde SQL aggregate'e taşınması follow-up'tır.

## ADR-061 — Kupon sunum alanları indirim hesabından ayrıdır; erişim modeli isPublic'i türetir (F4A.4)

**Bağlam.** F4A kampanya/kupon oluşturma yüzeyi fazla temeldi (ad/tip/kod/indirim/limit/tarih/kapsam).
Gerçek e-ticaret kupon yönetimi admin-kontrollü zengin SUNUM (müşteri-yüzü başlık, kısa açıklama,
rozet/etiket, kart görünümü, detay/şartlar) ve net bir edinme/erişim modeli gerektiriyor. Ancak bu
alanların indirim motorunu, checkout hesabını veya cüzdan yaşam döngüsünü ETKİLEMEMESİ şart. Ayrıca
"takip et kazan" gibi marketplace-follow kalıpları bu ürünün kapsamı DIŞINDADIR.

**Karar.**
- **Sunum ≠ hesaplama (temel kural).** `Campaign`'e additive, nullable/varsayılanlı SUNUM alanları
  eklendi: `displayTitle` (≤120), `shortDescription` (≤240), `terms` (≤2000), `badgeLabel` (≤40),
  `badgeVariant` (enum), `cardStyle` (enum, STANDARD), `displayPriority` (int, 0). Bunlar YALNIZCA
  görünümdür; `toEngineCampaign` bunları TAŞIMAZ, motor doğrulanmış kural alanlarını kullanmaya devam eder.
- **Erişim modeli türetimi (`accessModel`).** Tek enum {AUTO_VISIBLE, PUBLIC_CLAIMABLE, CODE_CLAIMED,
  ADMIN_ASSIGNED}. `isPublic` bundan TEK-YÖNLÜ TÜRETİLİR ve public projeksiyon için AUTHORITATIVE gate
  olarak kalır: AUTO_VISIBLE/PUBLIC_CLAIMABLE→`true`, CODE_CLAIMED/ADMIN_ASSIGNED→`false`
  (`deriveIsPublicFromAccessModel`, contracts'ta tek kaynak). Admin `isPublic`'i ayrı input olarak
  görmez; form accessModel seçiminden set eder. Redundant `audience`/`claimType` çifti eklenmedi
  (over-modeling'den kaçınıldı).
- **Public projeksiyon allowlist'i genişletildi.** Sunum alan paketi (`couponDisplayFieldsSchema`)
  `publicCampaignBadge` (ürün rozeti), `publicWalletCoupon` (sepet) ve `publicCouponCenterCoupon`
  (kupon merkezi) yanıtlarına eklendi. Private veri güvenliği KORUNDU: alanlar yalnız `isPublic=true`
  kampanyalarda (rozet) veya cüzdana girmiş (atanmış/claim) kuponlarda (sepet/merkez) taşınır; iç
  kimlik/limit/priority/stackable yine sızmaz. Alan yoksa UI üretilmiş fallback'e döner.
- **Reserved kriterler enum'a/forma eklenmez.** İlk sipariş/geri dönen müşteri/e-posta listesi motor
  tarafından ENFORCE EDİLEMEDİĞİ için aktif seçenek olarak sunulmaz (enforcement yoksa davranış üretme).
- **Takip tabanlı kupon YOKTUR.** FOLLOW_REQUIRED / store-follow / seller-follow / marketplace-follow
  hiçbir enum, UI kopyası, doküman veya testte yer almaz; enum bu değerleri REDDEDER.
- **Marka/vendor kapsamı eklenmez.** `Product.brand`/`Product.vendor` serbest metindir (first-class
  model değil); scope tablosu icat edilmedi — follow-up olarak dokümante edildi.
- **Coupon-seviyesi sunum alanı eklenmez.** Campaign-seviyesi yeterli; over-modeling'den kaçınıldı.

**Sonuçlar.** (+) Admin production-grade kupon kartları (başlık/rozet/şartlar/erişim) tanımlar; vitrin
bunları güvenle tüketir, eksikse fallback üretir. (+) `isPublic` tek türetim noktasıyla tutarlı;
public/private güvenlik değişmez. (+) Motor/checkout/cüzdan/kargo'ya sıfır etki (additive). (–) Reserved
segmentler ve marka/vendor scope sonraki fazlara bırakıldı. (–) Sunum alanları OrderDiscount snapshot'ına
yazılmaz (bilinçli; sipariş etiketi mevcut label mantığından — görünüm ve immutable kayıt ayrı tutuldu).

## ADR-062 — Ürün kartı otomatik indirim "Sepette" fiyat gösterimi güvenlik kuralı (F4A.6)

**Bağlam.** F4A.1 public rozet projeksiyonu ürün başına TEK rozet seçiyordu (priority DESC, id ASC).
Demo mağazada global kapsamlı + yüksek öncelikli bir public kupon (TEST250), ürün kapsamlı otomatik
"Sepette %10" kampanyasını her kartta gölgeliyor; ayrıca kart yalnız küçük bir pill rozeti gösteriyor,
gerçek e-ticaret referanslarındaki "üstü çizili normal fiyat + Sepette + %badge + nihai fiyat" bloğu yok.
Nihai fiyat tahmininin YANILTICI olmaması (sepet/alt-limit/kapsam belirsizliği) ve checkout motorunun tek
kaynak-doğrusu kalması şart.

**Karar.**
- **Güvenli nihai fiyat yalnız güvenle hesaplanabildiğinde gösterilir.** Public rozete additive,
  nullable `estimatedDiscountMinor` / `estimatedFinalUnitPriceMinor` alanları eklendi. YALNIZCA:
  otomatik (AUTOMATIC_CART_DISCOUNT) + `PERCENT` + TEK-FIYATLI ürün (görünür varyant fiyatları eşit) +
  (`minOrder` yok ya da birim fiyat eşiği karşılıyor) durumunda doldurulur. Formül checkout motoruyla
  AYNIDIR: `round(unit*yüzde)`, `maxDiscount` cap, birim fiyatla sınırlama. Aksi halde `null` → kart
  yalnız "Sepette %X" rozeti + (varsa) "₺X üzeri" alt-limit notu gösterir; **sahte nihai fiyat üretilmez**.
- **Sabit tutarlı (FIXED_AMOUNT) sepet indiriminde tahmin üretilmez.** Sepet geneli sabit indirim tek
  birime güvenle bölünemez; birim-bazı nihai fiyat yanıltıcı olur.
- **Kupon kampanyaları kupon kartı olarak kalır; otomatik fiyat bloğu OLMAZ.** `displayKind` yine
  `type === COUPON_CODE`'dan türetilir — `accessModel` default'u (AUTO_VISIBLE) bir kupon kampanyasını
  otomatik "Sepette" indirimine ÇEVİRMEZ. Kupon rozetinde tahmin daima `null`.
- **Stackable-duyarlı gösterim seti (checkout stacking semantiğiyle tutarlı).** Ürüne uygulanan tüm uygun
  kampanyaların HEPSİ `stackable` ise otomatik "Sepette" birincil + public kupon ikincil çip BİRLİKTE
  gösterilir (`publicProductSchema.secondaryCoupon`, additive). En az biri non-stackable ise (checkout'ta
  diğerlerini bloklar) yalnızca öncelik kazananı (priority DESC, id ASC) gösterilir; ikincil `null`.
- **Allowlist güvenliği korunur.** İç kimlik/limit/priority/stackable/usage public gövdeye SIZMAZ;
  yalnız türetilmiş güvenli tahmin alanları taşınır.

**Sonuçlar.** (+) Kartlar referans e-ticaret gibi net "Sepette" fiyatı gösterir; nihai fiyat yalnız
güvenli olduğunda görünür. (+) Motor/checkout/OrderDiscount snapshot/cüzdan/analitik/kargo'ya SIFIR etki
(additive, migration yok). (+) Tahmin motor formülüyle birebir; checkout ile tutarlı. (–) Fiyat
ARALIKLI ürünlerde tekil nihai fiyat gösterilmez (bilinçli; yanıltıcı tekil fiyattan kaçınıldı). (–) Tahmin
tek-birim varsayar; müşteri sepetinde maxDiscount cap veya sepet-geneli min-order farklı çıkabilir — bu yüzden
yalnız güvenli alt-küme gösterilir, checkout yine otoriterdir. Follow-up: ürün maliyet/marj + liste fiyatı
ayrımı ve fiyat değişikliği audit'i (son 30 gün en düşük fiyat) F4B'ye bırakıldı.

## ADR-063 — Varyant KDV alanları ve brüt görünen fiyat semantiği (F4C)

**Bağlam.** Faturalama/yasal belgeler KDV'nin ayrı gösterimini gerektirecek; bugüne dek `priceMinor`
KDV DAHİL brüt satış fiyatıydı ve sepet özeti KDV'yi sabit %20 varsayımıyla bilgi amaçlı ayrıştırıyordu
(`CART_TAX_RATE_PERCENT`). Ürün/varyant bazında farklı KDV oranları desteklenmeli; ancak mevcut vitrin
fiyatları ve checkout toplamları DEĞİŞMEMELİ.

**Karar.** Option A (en az riskli additive yol): `priceMinor` KDV DAHİL brüt satış fiyatı olarak KALIR ve
vitrin/sepet/checkout/sipariş tahsilatının tek kaynağı olmaya devam eder. Varyanta additive
`netPriceMinor` (admin girişi, KDV hariç), `vatRateBps` (default 2000; 0..10000 doğrulanır) ve
`vatAmountMinor` eklendi. Admin KDV HARİÇ net fiyat girer ("Fiyat alanına KDV hariç tutarı girin");
sunucu tek otoritedir: `vat = round(net·bps/10000)`, `brüt = net + vat` (paylaşılan `@commerce-os/utils`
vat modülü; UI aynı fonksiyonla yalnız ÖNİZLEME yapar, istemci KDV tutarı asla kabul edilmez). Legacy
brüt girişte brüt korunarak `net = round(brüt·10000/(10000+bps))` ayrıştırılır; yalnız oran değişirse net
ANKOR'dur. Backfill mevcut tüm varyantlarda brütü koruyarak net/KDV doldurur → GÖRÜNEN FİYAT DEĞİŞMEZ.
Ürün kartı fiyat tabanı = en ucuz aktif görünür varyantın brüt fiyatı; kart fiyat aralığı göstermez ve
kampanya "Sepette" tahmini aynı tabandan hesaplanır (ADR-062 "yalnız tek-fiyatlı ürün" güvenlik kuralı bu
tabana bilinçli genişletildi — kart tek fiyat gösterdiğinden tekil tahmin artık yanıltıcı değil). Public
DTO'ya net/KDV/maliyet alanları sızmaz; vitrin yalnız brüt gösterir.

**Sonuçlar.** (+) Sıfır fiyat regresyonu; checkout/kampanya semantiği değişmedi. (+) Fatura için gerekli
tüm KDV verisi sunucu-otoriter üretiliyor. (–) `netPriceMinor` brütten türetilen kayıtlarda "elle girilmiş
gibi" görünür (yuvarlama tabanlı); admin ilk düzenlemede gerçek net'i girebilir. (–) Sepet "KDV (dahil)"
bilgi satırı hâlâ %20 sabit çıkarım (toplamları etkilemez) — karma oranlı mağazalar için follow-up.

## ADR-064 — Sipariş satış özeti değişmez snapshot'lardan türetilir (F4C)

**Bağlam.** Admin sipariş detayında ödeme + satış/vergi/kâr özeti (liste/KDV/net/maliyet/brüt kâr/kampanya
indirimi/net kâr) gerekiyor. Kâr/vergi tarihsel doğrulukla, sipariş ANINDAKİ değerlerle hesaplanmalı;
güncel ürün fiyat/maliyetinden yeniden hesap YASAK.

**Karar.** `OrderLine`'a additive birim+satır snapshot kolonları (unitNet/unitVatRateBps/unitVatAmount/
unitGross/unitList/unitCost, lineNet/lineVat/lineGross/lineCost) eklendi; sipariş oluşturma/satır ekleme
anında varyanttan yazılır, adet güncellemesi satır toplamlarını birim snapshot'tan türetir. Sipariş
seviyesinde ek kolon AÇILMADI: `salesSummary`, gateway'deki saf `orders/sales-summary.ts` modülünde satır
snapshot'ları + OrderDiscount + kargo snapshot + PaymentAttempt kayıtlarından DETERMİNİSTİK türetilir.
Kurallar: Liste = Σ(unitList·adet); KDV = Σ(lineVat) + oran-bazlı dağılım (tek oran "KDV (%X)"); Vergisiz
net = Σ(lineNet) (indirim ÖNCESİ); Maliyet = Σ(lineCost), TEK satır bile eksikse null (kısmi maliyetle
yanıltıcı kâr üretilmez); Brüt kâr = net − maliyet; Kampanya indirimi = brüt Order.discountAmount; Net kâr
= Brüt kâr − brüt kampanya indirimi (MVP; indirim KDV dağılımı satır-bazına İNDİRİLMEDİ — bilinçli, sahte
hassasiyet yok); Net ödenen = ilk PAID/AUTHORIZED deneme ?? (paymentStatus PAID/AUTHORIZED → genel toplam)
?? 0; Kalan = max(0, ödenmesi gereken − ödenen). Tüm satırlarda KDV snapshot'ı yoksa (F4C öncesi sipariş)
Bölüm B null döner ve UI "Bu sipariş eski formatta oluşturuldu" gösterir; OrderLine backfill'i bilinçli
YOKTUR (mevcut siparişler mutate edilmez).

**Sonuçlar.** (+) Tarihsel doğruluk: ürün/kampanya sonradan değişse de özet sabit. (+) Sipariş-seviyesi
kolon şişkinliği yok; türetim tek modülde test edilebilir. (–) Eski siparişlerde satış özeti yok (kabul
edildi; yanıltıcı sıfırdan iyi). (–) Net kâr, brüt indirimi net kâr tabanından düşer (kullanıcı tablosuyla
uyumlu MVP); indirimin net/KDV bileşenlerine dağıtımı fatura üretimi fazında ele alınacak.

## ADR-065 — Site-geneli görsel yönetim altyapısı: local storage + "storage key sakla, URL türet" + CDN-hazır soyutlama

- Durum: ACCEPTED (Umut onayladı: storeId-bazlı path + Faz 1'de sunucu-taraflı sharp/webp normalize dahil)

**Bağlam.** Platformda bugün HİÇBİR gerçek görsel altyapısı yok: `Product`, `ProductVariant`,
`ProductCategory` ve `Store` modellerinde image/media/logo alanı bulunmuyor; hero/slider/banner ve
mağaza ayarları (logo/favicon) için model yok; api-gateway (Fastify v5) ne statik dosya sunumu ne de
multipart upload içeriyor (kargo CSV import'u bile dosya değil, JSON body'de string metin); docker-compose'da
tek named volume `postgres-data`, api-gateway'in hiç mount'u yok. Buna karşılık storefront bu boşluğu
BİLİNÇLİ olarak tek bir entegrasyon kancasına indirgemiş: `productImageSrc()` (storefront `product-media.tsx`)
daima `null` döner ve handle'dan deterministik gradyan+monogram yer-tutucu üretir; PLP/PDP/Cart ve public
DTO'lar (`publicProductSchema`) "drop-in hazır" (`imageUrl` opsiyonel prop olarak var ama hiç dolmuyor).
Home hero hardcoded tek panel (`HeroVisual`), site logosu i18n sabit metni (`shell.brand` = "Demo Mağaza"),
mağaza ayarları sayfası tamamen mock+disabled. Kargo sağlayıcı `ShippingProviderConfig.logoUrl` mevcut tek
görsel deseni ve yorumunda "logoStorageKey ileride object-store için TODO" notuyla doğru yönü zaten işaret
ediyor. Görseller local filesystem'de gerçek dosya olarak tutulmalı (dış URL değil), imaj rebuild'de
SİLİNMEMELİ (Docker volume), ve ileride önüne CDN konabilmeli (öngörülebilir path + env-tabanlı prefix).
Platform çok kiracılı olduğundan görsellerin store bazında izole olması gerekiyor.

**Karar.**
- **"Storage key sakla, URL türet" (temel kural).** Veritabanına ASLA tam URL yazılmaz; yalnız göreli
  `storageKey` (path) saklanır. Public URL runtime'da tek noktadan üretilir:
  `resolveMediaUrl(storageKey) = MEDIA_PUBLIC_BASE_URL + "/" + storageKey`. Böylece local'de
  (`http://localhost:4000/media/...`) ve ileride CDN'de (`https://cdn.magaza.com/...`) AYNI key,
  farklı prefix — geriye dönük veri migration'ı GEREKMEZ. `MEDIA_PUBLIC_BASE_URL`, `packages/config`
  `envSchema` + `optionalUrlEnv()` deseniyle eklenir (`PUBLIC_WEBHOOK_BASE_URL` referans; TD-036/ADR-057).
- **storeId-bazlı, öngörülebilir path şeması.** `stores/{storeId}/{context}/{uuid}.webp`;
  context ∈ {products, categories, hero, branding}. `storeId` (cuid) STABİL olduğu için `storeSlug`
  yerine tercih edildi (slug değişse dosya taşıma/yeniden yazma gerekmez). storageKey'i DAİMA sunucu
  üretir (client'tan path kabul edilmez → path traversal ve cross-tenant sızıntı önlenir; `storeId`
  auth guard'dan gelir).
  **Güncelleme (Faz 1 uygulaması):** path'ten `{entityId}` segmenti ÇIKARILDI. Entity bağlama tamamen
  DB ilişkisiyle yapılır (`ProductImage.mediaId`, `HeroSlide.mediaId`, `StoreSettings.logoMediaId`/
  `faviconMediaId`, `ProductCategory.imageId`); böylece yeni-ürün akışında (ürün henüz id almadan görsel
  yüklenebilir) dosya taşıma HİÇ gerekmez ve storageKey yaşam boyu değişmez.
- **Storage sürücüsü soyutlaması.** `StorageDriver` arayüzü (`put(key,buffer,mime)` / `delete(key)`) +
  Faz 1'de `LocalDiskDriver`. İleride `S3Driver` aynı arayüzle eklenir; çağıran kod değişmez.
- **Prisma modelleri (additive, taslak).** Tümü mevcut multi-tenant desenini izler
  (`storeId` FK + `onDelete: Cascade` + `@@index([storeId])`, tenant-patterns.ts ile tutarlı):
  - `MediaAsset` — merkezi/polimorfik yükleme kaydı (storageKey `@unique`, mimeType, byteSize,
    width/height, altText, checksum, createdBy). Tek yükleme kaynağı.
  - `ProductImage` — join model (productId + mediaId), `position` ile sıralı galeri (0 = kapak),
    `@@unique([productId, mediaId])`; `ProductCategoryAssignment` gibi `storeId` denormalize.
  - `ProductCategory.imageId` — opsiyonel FK (tekil kategori görseli, `onDelete: SetNull`).
  - `StoreSettings` — yeni model (storeId PK); `logoMediaId` / `faviconMediaId` (ileride tema/renk/SEO
    default'ları da buraya). Mağaza logosu artık i18n sabiti değil bu modelden gelir (fallback: mevcut metin).
  - `HeroSlide` — çoklu slide (mediaId, position, status DRAFT/PUBLISHED, headline/subtext/ctaLabel/
    ctaHref, opsiyonel startsAt/endsAt). Model çoklu kurulur; UI tek slide ile başlar, CampaignBar'ın
    mevcut çoklu-slide UX mantığı (auto-geçiş/ok/nokta/reduced-motion) referans alınır.
- **Upload API (mevcut route deseni).** `registerMediaRoutes(app, deps)` modülü + `createServer`'da
  wire; `@fastify/multipart` eklenir. `POST /stores/:storeId/media` — `requireStoreAdmin` guard, mime
  whitelist (jpg/png/webp) + boyut limiti (max 5MB), **sharp ile webp'e normalize + max-boyut clamp**,
  diske yaz, `MediaAsset` kaydı, `recordAudit`; döner `{ id, storageKey, url }`. `DELETE .../media/:id`
  kaydı + fiziksel dosyayı temizler. Ürün/kategori/hero bağlama ayrışık kalır (endpoint `mediaId` alır).
  Statik servis: `@fastify/static` ile `/media/*` → volume dizini (public, CDN-uyumlu); imzalı/özel URL
  Faz 4'e bırakıldı. **Silme politikası (Faz 1):** `MediaAsset` başka bir kayıt tarafından kullanılıyorsa
  (`ProductImage`/`HeroSlide`/`StoreSettings`/`ProductCategory` referansı) DELETE `409 MEDIA_IN_USE`
  döner — sessiz `SetNull` YOK; kullanıcı önce ilişkiyi kaldırmalı (kaza sonucu görsel kaybını önler).
  Şemadaki FK `onDelete` davranışları (ProductImage/HeroSlide → Cascade; kategori/logo/favicon → SetNull)
  KORUNUR; 409 kontrolü DELETE endpoint'inin iş mantığında yapılır.
- **Docker volume.** api-gateway'e yeni named volume `media-data:/app/uploads`, `postgres-data` deseniyle
  birebir (dosya sonu `volumes:` bloğu + servise `volumes:` mount'u). `MEDIA_STORAGE_DIR=/app/uploads`.
  Rebuild'de veri korunur (named volume imajdan bağımsız).
- **Faz bölünmesi (özet).** Faz 0: bu ADR + path/limit kararlarının donması. Faz 1: backend (şema+migration,
  StorageDriver/LocalDiskDriver, multipart+static, registerMediaRoutes, media-data volume, config env).
  Faz 2: store-admin yükleme UI (yerel koyu glass kit'e yeni `MediaUpload`/`ImagePicker`; ürün çoklu-galeri,
  kategori tekil, ayarlar logo/favicon, yeni Hero yönetim ekranı — paylaşılan `@commerce-os/ui`'ye
  dokunulmaz). Faz 3: storefront wiring (public DTO'lara `images[]`/`imageUrl`, `productImageSrc()` gerçek
  URL, PDP thumbnail şeridi, home hero HeroSlide'dan, header logo StoreSettings'ten). Faz 4 (sonra): banner
  sistemi, CDN geçişi, responsive srcset/çoklu boyut, S3Driver, imzalı URL, yetim dosya taraması.
  Sıra gerekçesi: admin storefront'tan ÖNCE gelir ki storefront gerçek görselle test edilebilsin; backend
  ikisinin de önkoşulu, tek başına smoke edilebilir (curl upload → disk + DB + statik serve).

**Sonuçlar.** (+) Görsel altyapısı tek merkezi `MediaAsset` üzerinden; ürün/kategori/hero/logo aynı yükleme
kaynağını paylaşır. (+) storefront değişikliği MİNİMAL: `productImageSrc()` gerçek URL döndürünce
PLP/PDP/Cart/home otomatik gerçek görsele geçer (kanca zaten hazır). (+) CDN-hazır: `MEDIA_PUBLIC_BASE_URL`
env değişikliği yeterli, veri migration'ı yok. (+) Multi-tenant izolasyon mevcut desenle tutarlı;
sunucu-üretimli storageKey path traversal/cross-tenant sızıntıyı önler. (+) Docker volume ile rebuild'de
kalıcılık. (–) api-gateway'e ilk kez multipart + statik servis + sharp bağımlılığı girer (imaj boyutu/build
karmaşıklığı artar). (–) Görsel işleme senkron yükleme yolunda (büyük dosyada gecikme; async pipeline Faz 4).
(–) Banner ve responsive varyantlar Faz 4'e ertelendi.

**Reddedilen alternatifler.**
- **storeSlug-bazlı path.** URL'ler daha okunabilir/SEO-dostu olurdu; reddedildi çünkü slug değiştirilebilir
  ve o an tüm dosyaların taşınması/yeniden yazılması + eski URL kırılması gerekir. `storeId` değişmez →
  stabilite tercih edildi. (Okunabilir public URL istenirse ileride CDN katmanında slug→id yönlendirmesi
  eklenebilir.)
- **Faz 1'de görsel işleme olmadan (ham sakla) başlamak.** Daha hızlı MVP olurdu; reddedildi çünkü tutarsız
  format/boyut (dev cihazından gelen 10MB+ HEIC/PNG) hem volume'u hem storefront performansını bozar ve
  sonradan normalize etmek backfill gerektirir. webp normalize + clamp baştan zorunlu kılındı.
- **Dış URL alanı (kargo logoUrl gibi) genişletmek.** Görev gereği gerçek dosya yükleme isteniyor; harici
  URL saklama tenant izolasyonu/kalıcılık/CDN kontrolü sağlamaz. Reddedildi.
- **Object storage (S3/MinIO) ile başlamak.** Faz 1 için operasyonel yük; local FS + `StorageDriver`
  soyutlaması aynı arayüzle ileride S3'e geçişi zaten mümkün kılıyor. Ertelendi.

**Açık riskler / sorular (Faz 1 planında netleşecek).**
- Boyut limiti max 5MB/görsel (`@fastify/multipart` `limits` ile zorlanır) — hero için ayrı/daha yüksek
  limit gerekebilir.
- Format whitelist giriş jpg/png/webp; sunucuda webp'e normalize. HEIC/animasyonlu içerik kapsam dışı.
- `media-data` volume postgres gibi YEDEKLENMELİ — OPERATIONS/runbook'a eklenecek.
- Silme & yetim dosya: `MediaAsset` silinince disk dosyası temizlenir; referans sayımı + periyodik yetim
  tarama (worker) ileride.
- Path traversal / cross-tenant: storageKey daima sunucu üretir, `storeId` guard'dan gelir.
- Statik `/media/*` public — draft/özel içerik için imzalı URL Faz 4.
- Mevcut veri migration'ı YOK (hiçbir görsel verisi yok; tüm alanlar nullable/opsiyonel eklenir, geriye
  dönük risk minimal).

## ADR-066 — Sepet satırında kampanya indirimi: motor satır-bazlı pro-rata dağıtımı (kampanya öncelikli, compareAt yedek)

**Bağlam.** Vitrin sepet satırında kampanya indiriminin gösterilmesi istendi (kampanya-öncesi birim fiyat
üstü çizili + kampanya-sonrası fiyat) — tıpkı özet panelindeki "Sepette %10 İndirim" satırının satır
kartına da yansıması gibi. İndirim motoru (`computeDiscounts`, ADR-058) o güne dek yalnız **kampanya-başı**
toplam indirim + sepet-geneli toplam üretiyordu; **hangi satıra ne kadar indirim düştüğü** hesaplanmıyordu.
İlk (hatalı) deneme satırda `compareAtMinor` (mağaza liste fiyatı) üstü çizili gösterdi — bu kampanya
değil liste fiyatıdır, istenen bu değildi.

**Karar.**
1. **Motora satır-bazlı allocation eklendi.** `computeDiscounts` her uygulanan kampanya indirimini,
   kapsamına giren satırlara `lineTotalMinor` oranında (pro-rata) dağıtır. Yuvarlama **en-büyük-kalan
   (largest-remainder)** ile yapılır: floor sonrası artan kuruş(lar), en büyük kesirli paya sahip satırlara
   deterministik sırayla eklenir → `sum(lineDiscounts) === discountMinor` (kuruş kaybı/fazlası YOK). Çoklu
   kampanya (stacking) satır bazında birikir; satır indirimi satır tutarıyla sınırlanır (negatif fiyat olmaz).
   Sonuç `DiscountEngineResult.lineDiscounts: {variantId, discountMinor}[]`.
2. **Gateway** her cart line'a kampanya-sonrası `discountedUnitPriceMinor` + `discountedLineTotalMinor`
   işler (`assemblePublicCart`, yalnız checkoutReady + seçili satırlar; ADR-047 sunucu-otoriter korunur).
3. **Vitrin önceliği: kampanya > compareAt > sade.** Kampanya indirimi varsa satırda kampanya-sonrası fiyat
   + üstü çizili orijinal; kampanya yoksa `compareAtMinor` (liste > satış) yedek üstü çizili; o da yoksa
   sade fiyat.

**Sonuçlar.**
- Satır gösterimi ile özet indirimi tutarlı (kuruş kuruşuna); tek üründe satır indirimi = özet indirimi.
- Motor girdisi (`DiscountCartLine`) zaten satır-farkındalıklıydı; yalnız çıktıya allocation eklendi —
  mevcut toplam/kupon/stacking mantığı DEĞİŞMEDİ (yalnız additive `lineDiscounts`).
- KDV/Omnibus/checkout snapshot yolları etkilenmez; `lineDiscounts` yalnız vitrin gösterimi için türetilir.

**Alternatifler (reddedilen).**
- **PDP-tahmini deseni (yalnız AUTOMATIC+PERCENT).** PDP buy-box'ın `estimatedFinalUnitPriceMinor`'ı cart'a
  taşınırdı; daha basit ama kupon/sabit-tutar/çok-kampanya kapsanmaz ve özet ile satır çelişebilirdi.
  Reddedildi — gerçek (motor-tutarlı) satır indirimi tercih edildi.
- **compareAt (liste) üstü çizili.** İstenen kampanyayı yansıtmaz; yalnız yedek olarak korundu.

## ADR-067 — Ürün ana kategorisi (`primaryCategoryId`): dinamik katalog için tek şema kaynağı (Faz 1A)

**Bağlam.** Kategoriye-bağlı dinamik ürün özellikleri (attribute) altyapısına geçişin ilk adımı. Ürün ↔ kategori
ilişkisi bugün `ProductCategoryAssignment` üzerinden M:N'dir (`schema.prisma`); dinamik attribute şemasının hangi
kategoriden çözüleceği belirsizdir. Ayrıca public kategori etiketi bugün "ilk assignment" (`assignments` orderBy
`createdAt asc`) ile seçilir (`server.ts:publicCategoryLabel`) — kırılgan ve örtük bir kural.

**Karar.** Her ürüne **tek bir ana kategori** (`Product.primaryCategoryId`) eklendi; ileriki attribute şemasının,
breadcrumb'ın ve kanonik kategori URL'inin **tek kaynağıdır**.
1. **Additive + nullable.** `primaryCategoryId String?`, FK `onDelete: Restrict` (ana kategori fiziksel silinemez),
   `@@index([storeId, primaryCategoryId])`. İlk migration'da **NOT NULL YOK**; legacy/kategorisiz ürün null kalır.
2. **İkincil kategoriler korunur.** M:N `assignments` sınıflandırma/koleksiyon/navigasyon/merchandising için aynen kalır.
3. **Ana kategori assignments'tan biri olmalı** — DB tek başına M:N tutarlılığını garanti edemez; **service transaction
   guard** ile sağlanır (`resolvePrimaryCategory` route helper + `resolvePrimaryCategorySelection` saf kural fonksiyonu,
   `@commerce-os/contracts`).
4. **Normalizasyon/kurallar (stabil hata kodları).** Tek kategori + ana yok → otomatik o kategori; çoklu kategori + ana
   yok → `PRIMARY_CATEGORY_REQUIRED` (backend sessizce SEÇMEZ); ana listede değil → `PRIMARY_CATEGORY_NOT_ASSIGNED`;
   arşivli kategori ana yapılamaz → `PRIMARY_CATEGORY_ARCHIVED`; update'te mevcut ana kaldırılıp yenisi verilmezse →
   `PRIMARY_CATEGORY_ASSIGNMENT_CONFLICT`; kategoriler boşaltılınca ana → null. Kodlar zod refine yerine route/service'te
   üretilir (generic `VALIDATION_ERROR` özel kodları yutmasın; admin UI ilgili alana bağlayabilsin).
5. **Assignment + primary tek transaction.** `createProduct`/`updateProduct` yazımları aynı `$transaction` içinde;
   yarı-uygulanmış ara durum yok.
6. **Storefront geriye uyumlu.** `publicCategoryLabel` ÖNCE `primaryCategoryId`'yi kullanır; yoksa mevcut "ilk assignment"
   davranışına fallback (legacy ürünler aynı etiketi gösterir).
7. **Runtime kategori mirası UYGULANMAZ (MVP).** Attribute yalnız doğrudan ana kategoriden çözülür; parent zinciri
   dolaşılmaz. `overrideMode`/`INHERIT`/`OVERRIDE`/`DISABLE` gibi alanlar bu fazda EKLENMEZ (YAGNI).

**Backfill.** Migration içindeki backfill deterministiktir: her ürün için aynı store kapsamında en eski assignment
(`createdAt ASC`, eşitlikte `categoryId ASC`) ana kategori olur; tek kategorili → o kategori; kategorisiz → null.

- **Tie-breaker neden `categoryId ASC` (`assignment.id ASC` DEĞİL):** `ProductCategoryAssignment`'ın surrogate `id`
  kolonu YOKTUR — composite PK `(productId, categoryId)` (bkz. `schema.prisma`, init migration `PRIMARY KEY ("productId","categoryId")`).
  Bir ürünün iki assignment'ı asla aynı categoryId'yi paylaşamaz (composite PK unique), bu yüzden eşit `createdAt`'te
  `categoryId ASC` TAM DETERMINISTIKTIR. Bir `id` eklemek composite PK'yi değiştirir → Faz 1A'nın "assignment modeline
  dokunma / kapsam dışı refactor yok" kısıtlarına aykırıdır, bu yüzden `categoryId ASC` korunmuştur. "En düşük sortOrder"
  seçeneği de uygulanamaz (`ProductCategoryAssignment` `sortOrder` taşımaz); `createdAt ASC` mevcut `publicCategoryLabel`
  davranışıyla tutarlıdır.
- **Idempotency (kesin ifade):** Migration, Prisma migration history nedeniyle hedef DB'ye YALNIZ BİR KEZ uygulanır
  ("migration ikinci kez çalışır" ifadesi yanlıştır). İdempotent olan, backfill UPDATE'inin `WHERE primaryCategoryId IS NULL`
  koşulu sayesinde RE-RUN güvenli olmasıdır: elle veya `db:audit-primary-category --apply` ile tekrar çağrılırsa mevcut
  (non-null) değerleri EZMEZ, yalnız hâlâ NULL olanları doldurur → ikinci `--apply` sıfır değişiklik üretir. Çok kategorili
  ürünler ticari doğrulama için `db:audit-primary-category` ile raporlanır (dry-run default DB'yi değiştirmez; `--apply`
  migration ile AYNI algoritmayla güvenli doldurur). İzole PostgreSQL üzerinde doğrulanmıştır (tek/çok/eşit-createdAt/
  kategorisiz/önceden-primary/cross-store/FK-RESTRICT + audit dry-run↔DB uyumu + iki kez `--apply` idempotent).

**Sonuçlar.**
- Deterministik kategori şeması; recursive query yok; kategori döngü riski attribute sistemine taşınmaz.
- Attribute tabloları (`AttributeDefinition`/`CategoryAttribute`/değerler) ve varyant/sipariş-snapshot bu ADR kapsamı DIŞINDADIR
  (Faz 1B+). Bu faz yalnız **ana kategori temelini** kurar.
- İleride `NOT NULL`'a geçiş, veri temizliği sonrası **ayrı migration** olarak değerlendirilecektir.

**Alternatifler (reddedilen).** M:N'den runtime türetme (belirsiz, kırılgan); runtime kategori mirası (recursive, döngü riski,
MVP dışı); zod refine ile cross-field (özel kodları yutar, admin alan bağlama bozulur).

### Faz 1B — Attribute katalog çekirdeği (TODO-144, 2026-07-14)

**Bağlam.** Faz 1A ana kategori temelini kurdu; dinamik attribute şemasının kategoriden çözüleceği netleşti. Faz 1B
**yalnız katalog TANIM katmanını** ekler: attribute tanımları, gruplar, seçenekler ve kategori-bazlı davranış. Ürün/varyant
**DEĞER** tabloları (`ProductAttributeValue`/`VariantAttributeValue`), dinamik ürün formu, varyant kombinasyon motoru,
order snapshot, PDP tablo, faceted search ve marketplace mapping **Faz 2+**'ye aittir (bu ADR kapsamı DIŞI).

**Karar.**
1. **Tek tablo + scope.** `AttributeDefinition.scope` = `PLATFORM` (tüm mağazalar, `storeId=null`, yalnız `SUPER_ADMIN`)
   veya `STORE` (tek mağaza, `storeId` zorunlu, ilgili store admin). Bir mağazanın kullanabileceği tanımlar = kendi STORE
   tanımları + tüm PLATFORM tanımları (kategoriye bağlamak için okunur; PLATFORM tanımları store'dan düzenlenemez).
2. **Davranışın tek sahibi `CategoryAttribute`.** `required/filterable/searchable/comparable/variantDefining/
   visibleOnProductPage/visibleOnListing` + `displayOrder` + `validationRules Json` YALNIZ burada. `AttributeDefinition`
   davranış TAŞIMAZ (tanım global, davranış kategoriye özgü). `@@unique([categoryId, attributeDefinitionId])` — bir
   attribute bir kategoriye en fazla bir kez. **Kategori mirası ve `overrideMode` UYGULANMAZ** (ADR-067 md.7 ile tutarlı; YAGNI).
3. **Immutability (stabil kodlar, route katmanı).** `code` HER ZAMAN immutable (farklı değer → `ATTRIBUTE_CODE_IMMUTABLE`);
   `dataType` yalnız **kullanım başlamışsa** immutable — CategoryAttribute bağlantısı VEYA seçenek varsa → `ATTRIBUTE_DATATYPE_IMMUTABLE`,
   aksi halde değiştirilebilir. Aynı değeri echo eden istemci kırılmaz (no-op). Kodlar zod refine yerine route'ta üretilir
   (generic `VALIDATION_ERROR` özel kodları yutmasın; Faz 1A deseni).
4. **Duplicate.** `code`: `@@unique([storeId, code])` STORE çakışmasını DB'de yakalar; PLATFORM (null storeId; Postgres
   NULL'ları distinct sayar) için route ön-kontrolü (`findAttributeDefinitionByCode`). `option value`:
   `@@unique([attributeDefinitionId, value])` (DB) + route ön-kontrolü → 409.
5. **Yetki.** PLATFORM uçları için YENİ `requireSuperAdmin` guard'ı (mevcut `requirePlatformAdmin` SUPPORT_ADMIN'e de izin
   verir; bu onu daraltır — **mevcut yetkiler BOZULMADAN** yeni katı kapı). STORE uçları mevcut `requireStorePlatformAdmin`.
6. **Migration additive.** `20260714120000_add_attribute_catalog` yalnız yeni enum + tablo ekler; mevcut şemaya DOKUNMAZ.
   İzole shadow-DB üzerinde `prisma migrate diff (from-migrations → to-schema)` = "empty migration" → migration şemayla
   birebir, **drift yok**. `db push`/`migrate reset` KULLANILMADI.
7. **Modülerlik.** Gateway'de `src/attributes/` ayrı `AttributeDataAccess` + route modülü (customers/hero/kampanya deseni);
   DI ile enjekte edilir → dev in-memory `AppDataAccess`'e (health.test) DOKUNULMADAN izole test edilir.

**Sonuçlar.**
- Temiz katalog çekirdeği; Faz 2 ürün attribute değer altyapısı için hazır (`CategoryAttribute` davranışı + `validationRules`
  motoru orada tüketilecek).
- `AttributeOption.storeId` PLATFORM seçeneğinde null, STORE seçeneğinde mağaza — tenant bütünlüğü FK ile korunur.
- Storefront/checkout/order/inventory/search/marketplace ve ürün formu DEĞİŞMEDİ (yalnız katalog yönetimi eklendi).

**Alternatifler (reddedilen).** Davranışı `AttributeDefinition`'a koymak (kategori-bazlı davranış imkânsızlaşır); scope
başına ayrı tablo (sorgu/birleştirme karmaşası, YAGNI); kategori mirası/overrideMode (recursive, döngü riski, MVP dışı);
`code`/`dataType`'ı update şemasından tümüyle çıkarmak (sessiz strip — açık hata kodu ve full-object echo kaybı).

## ADR-068 — Ürün/varyant attribute DEĞER katmanı + `attributeValueService` (Faz 2A)

- **Durum:** Kabul edildi (2026-07-14). Faz 1B (ADR-067) katalog TANIMINI (`AttributeDefinition` + `CategoryAttribute`
  davranışı) tüketen DEĞER katmanı. TODO-145.
- **Bağlam.** Faz 1B attribute tanımlarını ve kategori-bazlı davranışı kurdu ama ürün/varyantların **değerleri** için
  saklama yoktu. Bu faz yalnız **çekirdek veri + doğrulama** katmanını ekler. Dinamik ürün formu, varyant kombinasyon
  motoru/`combinationKey`, otomatik varyant üretimi, PDP attribute tablosu, faceted search, marketplace mapping ve order
  attribute snapshot **Faz 2B+**'ye aittir (bu ADR kapsamı DIŞI). Storefront/checkout/order/inventory/search/marketplace
  ve ürün formu DEĞİŞMEZ.

**Karar.**
1. **Tip güvenli saklama (JSON YOK).** Her `AttributeDataType` için ayrı kolon: `TEXT/TEXTAREA/RICH_TEXT/URL → valueText`,
   `INTEGER → valueInteger`, `DECIMAL → valueDecimal (Decimal(20,6))`, `BOOLEAN → valueBoolean`, `DATE → valueDate`,
   `SELECT/COLOR → optionId (FK)`, `IMAGE/FILE → mediaId (FK)`, `MULTI_SELECT → ProductAttributeValueOption` junction.
   `ProductAttributeValue` tüm kolonları taşır; `VariantAttributeValue` yalnız `valueText`+`optionId` (variantDefining
   attribute'lar metin/seçenek olur). `@@unique([productId, attributeDefinitionId])` / `@@unique([variantId, attributeDefinitionId])`.
2. **CHECK constraint — savunma katmanı.** Her DEĞER satırında **en fazla bir** değer kolonu dolu olabilir
   (`(sum of NOT NULL) <= 1`). MULTI_SELECT satırında tüm değer kolonları boştur (seçenekler junction'da) → `<= 1` bunu
   da kapsar. **Cross-table datatype eşlemesi** (ör. INTEGER attribute'una valueText yazma) DB'ye TAŞINMAZ — bu kontrol
   servistedir (DB sade ve genel kalır; ADR-067'nin "kategori-bağlamlı kural serviste" felsefesiyle tutarlı).
3. **`attributeValueService` — tek yazma otoritesi.** ProductAttributeValue/VariantAttributeValue yazan **hiçbir route
   doğrudan Prisma'ya yazmaz**; her şey servisten geçer. Servis şunları STABIL kodlarla doğrular (zod refine DEĞİL —
   generic `VALIDATION_ERROR` özel kodları yutmasın; Faz 1A/1B deseni): tenant izolasyonu (STORE tanımı/seçeneği/görseli
   başka mağazadan olamaz; PLATFORM tanımı her mağazada geçerli), attribute mevcut/archived, `product.primaryCategoryId`
   mevcut + attribute o kategoriye `CategoryAttribute` ile bağlı, **required** (yalnız değer sağlandığında — undefined =
   eski davranış, kontrol atlanır), option doğru attribute'a/tenant'a ait + archived değil, media doğru tenant'ta,
   dataType↔alan eşlemesi + "en fazla bir alan", ve **variantDefining tablo yönlendirme**: variantDefining=true attribute
   yalnız `VariantAttributeValue`'a, variantDefining=false yalnız `ProductAttributeValue`'a yazılabilir (product-level
   attribute variant tablosuna, variant attribute product tablosuna YAZILAMAZ).
4. **prepare/persist ayrımı (write-time doğrulama).** `prepare*` read-only doğrular ve normalize edilmiş girdileri döner;
   `persist*` ayrı adımda yazar. Böylece **gömülü create akışı ürünü OLUŞTURMADAN önce doğrular** (geçersizse hiçbir
   yazım olmaz). Yazma **replace-set** semantiğidir (`categoryIds`/`imageMediaIds` deseni): sağlanan liste TAM istenen
   kümedir, `[]` tümünü temizler, `undefined` dokunmaz.
5. **Geriye dönük uyum.** Product/Variant create/update'e **opsiyonel `attributeValues`** eklenir. `undefined` = bugünkü
   davranış birebir korunur (attribute yazılmaz, required kontrolü çalışmaz) → attribute göndermeyen eski istemciler
   BOZULMAZ. Değer verildiğinde tam doğrulama + required kontrolü devreye girer. Ürün/varyant yanıt şeması (`productSchema`
   vb.) DEĞİŞMEZ — değerler ayrı dedike uçlardan okunur (public/storefront sıfır-regresyon; dual-read hazırlığı).
6. **Modülerlik + FK politikası.** Gateway `src/attribute-values/` ayrı data-access + service + route modülü (attributes/
   deseni; DI ile dev `AppDataAccess`/`MemoryDataAccess`'e dokunulmadan izole test). definition/option/media FK
   `onDelete: Restrict` (kullanımda olan tanım/seçenek/görsel silinemez — katalog usage-guard felsefesi); product/variant/
   store `Cascade`. Media silme in-use guard'ına `ProductAttributeValue.mediaId` eklendi (Restrict FK aksi halde P2003→500 verirdi).
7. **Dedike internal uçlar.** `GET/PUT /stores/:storeId/products/:productId/attribute-values` ve
   `.../variants/:variantId/attribute-values` (store admin). Dinamik ürün formu YOK; bu API onu bekler (Faz 2B UI).

**Sonuçlar.**
- Ürün/varyant attribute değerleri tip güvenli, tenant-izole ve tek doğrulama noktasından saklanır; Faz 2B (dinamik form +
  varyant motoru) bu servisi tüketmeye hazır.
- Migration TAMAMEN ADDITIVE; izole shadow-DB `migrate diff` = "No difference" (drift yok). Canlı DB smoke: CHECK iki-değeri
  reddetti, sıfır-değer (MULTI_SELECT) CHECK'ten geçip FK'ye düştü, variant CHECK ikili değeri reddetti.
- Storefront/checkout/order/inventory/search/marketplace ve ürün formu DEĞİŞMEDİ.

**Alternatifler (reddedilen).** Değerleri tek JSON kolonunda tutmak (tip güvenliği + ilişkisel bütünlük + gelecek faceted-filtre
kaybı); değerleri var olan `ProductVariant.optionValues Json`'a genişletmek (yapısız; katalog davranışından kopuk); tüm datatype
kuralını DB CHECK'e taşımak (kategori-bağlamlı + cross-tenant kontroller DB'de imkânsız/karmaşık); product+attribute değerlerini
TEK transaction'da atomik yapmak (modüler prisma-per-module desenini kırar; foundation'da prepare-önce-doğrula yeterli — bkz. TD).

## ADR-069 — Dinamik ürün formu: RHF + Zod + dataType-güdümlü renderer; ana kategori şema kaynağı; gömülü replace-set save (Faz 2B)

**Bağlam.** Faz 2A backend'i (ADR-068) ürün/varyant attribute DEĞER katmanını + `attributeValueService`'i (tek yazma otoritesi)
hazırladı ama store-admin ürün formu DEĞİŞMEDİ. Faz 2B yalnızca admin Create/Edit ekranını kategoriye göre çalışan dinamik forma
çevirir. Varyant motoru / `combinationKey` / PDP / storefront / faceted search KAPSAM DIŞI.

**Karar.**
1. **RHF + Zod.** Form tamamen React Hook Form'a taşınır (dağınık useState kaldırılır). Çekirdek alanlar Zod `superRefine` ile
   doğrulanır (mevcut elle onSubmit ile birebir; davranış korunur). Dinamik attribute alanları backend-şekilli kurallarla ayrı
   doğrulanıp **birleşik resolver**'da (zodResolver-core + attribute döngüsü) birleştirilir — attribute doğrulaması dinamik
   (yüklenen şemaya bağlı) olduğundan tek statik Zod şemasına gömülmez. Resolver başarıda ham form değerlerini döndürür (nested
   `attributes`/`images` strip edilmez).
2. **Ana kategori şema kaynağı.** Attribute şemasını `primaryCategoryId` sürer — backend değer doğrulaması da primaryCategoryId +
   CategoryAttribute bağına göre yapıldığından UI aynı otoriteyi izler (ADR-067/068 ile tutarlı). Yalnız ürün-seviyesi
   (`variantDefining=false`) + ACTIVE attribute'lar render edilir.
3. **Client-side join + memoization.** CategoryAttribute serializer'ı self-describing DEĞİL; UI tanım + seçenek + grup uçlarını
   ayrı çekip join eder. Sıralama displayOrder ASC → name ASC; gruplar AttributeGroup.sortOrder (grupsuz "General attributes"
   önce). Kategori-bağımsız veriler tek sefer, kategori-attribute join'i kategori başına cache'lenir → kategori değişmezse
   yeniden istek yok.
4. **dataType-güdümlü renderer (registry).** `dataType → widget kind → bileşen` haritası (switch-case cehennemi yok). 13 tip
   desteklenir; RICH_TEXT düz textarea, FILE görsel-yükleyiciyi yeniden kullanır (TD). `validationRules` (min/max/minLength/
   maxLength/pattern/step/placeholder/helperText) client-side uygulanır; desteklenmeyen kural sessizce yok sayılır.
5. **Save = gömülü replace-set.** Değerler product create/update payload'ının gömülü `attributeValues` alanıyla gönderilir
   (attributeValueService'ten geçer — tek yazma otoritesi; ayrı PUT çağrısı yok → create'te atomik prepare-önce-doğrula korunur).
   `attributeValues` YALNIZ kategori attribute tanımlıysa gönderilir; aksi halde `undefined` → boş kümenin required'ı tetiklemesi
   ve legacy ürünlerin bozulması önlenir. BOOLEAN her zaman gönderilir (false anlamlı); diğer boş opsiyoneller atlanır.
6. **Sunucu hata → alan.** Gömülü create/update akışı artık `error.details.attributeDefinitionId` taşır (dedike PUT ucuyla
   tutarlı bilgi; `errorBody(code,message,details)` deseni — ADR-065 `usedIn` gibi). store-admin `UiError`/`call()` bunu okur;
   form attribute hatasını ilgili alana bağlar. Client-side doğrulama çoğu vakayı submit öncesi yakalar.

**Sonuçlar.**
- Ürün formu artık kategoriye göre dinamik; core alan davranışı ve mevcut testler (235) korunur; 20 yeni test eklenir.
- Backend, api-client hata-envelope'u ve migration DEĞİŞMEDİ (yalnız gömülü akışa additive `details.attributeDefinitionId`).
- Legacy (attribute tanımsız) kategoriler eski ürün gibi davranır; hiç attribute render edilmez, `attributeValues` gönderilmez.

**Alternatifler (reddedilen).** Save'i dedike PUT `.../attribute-values` ile yapmak (create'te ürün henüz yok → iki-adım, atomik
değil; gömülü akış prepare-önce-doğrula ile daha güvenli); attribute'ları tek statik Zod şemasına gömmek (dinamik şema →
`useForm` resolver'ını her kategori değişiminde yeniden kurmak gerekir); tüm alanları Controller ile controlled yapmak (register +
`forwardRef` daha yalın; yalnız side-effect'li alanlar watch/setValue); required'ı boş kümede de zorlamak (backend `values.length===0`
kısa devre eder — UI aynı semantiği izler, boş kategori submit'i required tetiklemez).

## ADR-070 — Varyant motoru TEMELI: ürün-seviyesi variant-defining eksen seçimi (normalize; kombinasyon YOK) (Faz 2C-1)

- **Durum:** Kabul edildi (2026-07-17). Faz 2A/2B (ADR-068/069) attribute DEĞER katmanını + dinamik ürün formunu kurdu.
  Bu faz Variant Engine'in **yalnız veri modelini + admin seçim ekranını** ekler. TODO-147.
- **Bağlam.** Bir mağaza sahibinin çok-varyantlı ürün yönetebilmesi için önce **hangi attribute'ların varyantı
  belirlediğini** (eksen/axis) ve her eksende **hangi option'ların kullanılacağını** tanımlaması gerekir. Bu PR
  **KESİNLİKLE** kombinasyon üretmez: `ProductVariant`, Cartesian çarpım, `combinationKey`, SKU matris, bulk edit,
  varyant görselleri, storefront/search/inventory/order snapshot **KAPSAM DIŞI**. Yalnız "eksen + kapsanan option'lar"
  seçimi ürün seviyesinde saklanır; gelecekteki Combination Engine bunu tüketecek.

**Karar.**
1. **Normalize model (JSON YOK).** İki additive relational tablo:
   - `ProductVariantAttribute` — bir üründe EKSEN olarak seçilen variant-defining attribute. `@@unique([productId,
     attributeDefinitionId])` (aynı attribute iki kez seçilemez — DB + servis), `position` (eksen sırası), `storeId`
     denormalize tenant sütunu. FK: `attributeDefinitionId → Restrict` (eksen olarak kullanılan tanım silinemez —
     katalog usage-guard, Faz 2A ile tutarlı); `productId/storeId → Cascade`.
   - `ProductVariantOptionSelection` — bir eksen altında kapsanan `AttributeOption`. `@@unique([productVariantAttributeId,
     optionId])`, `position`, `optionId → Restrict`, parent/`storeId → Cascade`.
   `ProductVariant.optionValues Json?` (legacy) **DOKUNULMAZ**; yeni akış onu kullanmaz — combination engine geldiğinde
   yerini normalize `combinationKey` alacak.
2. **Eksen yalnız option-tabanlı (SELECT/COLOR).** Bir varyant ekseni doğası gereği TEK-seçimli option'dur — `VariantAttributeValue`
   (Faz 2A) tek `optionId` taşır. Dolayısıyla eksen olabilecek attribute `dataType ∈ {SELECT, COLOR}` olmalı. `MULTI_SELECT`
   (çok-değerli, eksen değil) ve metin/sayı/tarih/medya tipleri eksen OLAMAZ (`VARIANT_ATTRIBUTE_NOT_OPTION_BASED`). Bu, gelecekteki
   Cartesian'ı sağlam tutar (her eksen tek-seçimli). Serbest-metin varyant eksenleri (ör. gravür) bu ekranın kapsamı dışıdır.
3. **`variantSelectionService` — tek yazma otoritesi.** `ProductVariantAttribute`/`ProductVariantOptionSelection` yazan hiçbir route
   doğrudan Prisma'ya yazmaz (Faz 2A `attributeValueService` deseni). Servis STABIL kodlarla (zod refine DEĞİL) doğrular: tenant
   izolasyonu (STORE tanımı/seçeneği başka mağazadan olamaz; PLATFORM her mağazada geçerli), attribute mevcut/archived, `product.
   primaryCategoryId` mevcut + attribute o kategoriye `CategoryAttribute` ile bağlı, **`variantDefining=true`**
   (`VARIANT_ATTRIBUTE_NOT_VARIANT_DEFINING`), dataType option-tabanlı, **aynı attribute tek** (`VARIANT_ATTRIBUTE_DUPLICATE`), her
   eksende **en az bir option** (`VARIANT_OPTION_REQUIRED`), option doğru attribute'a + tenant'a ait + archived değil
   (`VARIANT_OPTION_INVALID` / `_ARCHIVED` / `_TENANT_MISMATCH`), option'lar dedupe.
4. **prepare/persist ayrımı + replace-set.** `prepareVariantSelections` read-only doğrular + normalize entries döner;
   `persistVariantSelections` ayrı transaction'da replace-set yazar (mevcut eksenler silinir → yeniden yazılır; option'lar parent
   Cascade ile temizlenir). Böylece **gömülü create akışı ürünü OLUŞTURMADAN önce doğrular** (geçersizse hiçbir yazım olmaz).
   Sağlanan liste TAM istenen kümedir; `[]` tümünü temizler, `undefined` dokunmaz.
5. **Geriye dönük uyum.** Product create/update'e **opsiyonel `variantSelections`** eklenir. `undefined` = bugünkü davranış birebir
   (varyant seçimi yazılmaz) → eski istemciler BOZULMAZ. Ürün/varyant yanıt şeması (`productSchema` vb.) DEĞİŞMEZ; seçimler ayrı
   dedike uçtan okunur (`GET/PUT .../variant-selections`). `ProductVariant` create/update ve `optionValues` semantiği DEĞİŞMEZ.
6. **Modülerlik.** Gateway `src/variant-selections/` ayrı data-access + service + route modülü (attribute-values/ deseni; DI ile izole
   test). Route yetkisi `requireStorePlatformAdmin` (fiyat/attribute düzenleyenle aynı yetki düzlemi).
7. **UI (dinamik form uyumlu).** store-admin ürün formuna **"Variant Attributes"** bölümü. `variantDefining=true` + option-tabanlı
   `CategoryAttribute`'lar (mevcut `useCategoryAttributes` bunları DIŞLIYOR → ayna hook `useVariantAttributes`) listelenir. Admin bir
   eksen'i checkbox ile seçer; seçince altındaki option checkbox'ları görünür (Siyah ✓ / Beyaz ✓ / Mavi ☐). Form state
   `variantSelections: Record<attributeDefinitionId, {enabled, optionIds[]}>`. Checkbox'lı eksende ≥1 option client-side zorunlu
   (submit öncesi); server hatası `error.details.attributeDefinitionId` ile ilgili eksene bağlanır (Faz 2B deseni). Kategori
   variant-defining attribute tanımlamamışsa bölüm gizlenir + payload `undefined` (legacy korunur).

**Sonuçlar.**
- Ürün, "hangi eksenler + hangi option'lar" bilgisini normalize + tenant-izole + tek doğrulama noktasından saklar; gelecekteki
  Combination Engine (Cartesian → `combinationKey` → `ProductVariant`) bu iki tabloyu okuyup tüketmeye hazır — ama bu faz HİÇBİR
  varyant/kombinasyon üretmez.
- Migration TAMAMEN ADDITIVE (izole shadow-DB `migrate diff` = "No difference" hedefi); mevcut `ProductVariant`/`optionValues`/
  storefront/checkout/order/inventory/search DEĞİŞMEZ; eski istemciler `variantSelections` göndermezse davranış birebir korunur.

**Alternatifler (reddedilen).** Seçimi `Product.metadata`/yeni bir JSON kolonunda tutmak (tip güvenliği + ilişkisel bütünlük +
gelecekte Cartesian sorgusu kaybı — ADR-068 ile tutarlı red); mevcut `ProductVariant.optionValues`'ı genişletmek (yapısız + eksen/
option kavramı yok); eksen + option'ları tek tabloda (self-join) tutmak (option "en az bir" ve sıralama semantiği bulanıklaşır);
kombinasyonu/`combinationKey`'i şimdi üretmek (brief'in açık YASAK listesi — foundation yalnız seçim); eksene `MULTI_SELECT` izni
(varyant ekseni tek-seçimli olmalı, `VariantAttributeValue` tek option taşır); seçimi ürün yerine varyant seviyesinde tutmak (henüz
varyant YOK; seçim ürün-seviyesi bir "reçetedir").

## ADR-071 — Deterministik Combination Engine: saf Cartesian önizleme motoru (kombinasyon YAZIMI ayrı faz) (Faz 2C-2)

- **Durum:** Kabul edildi (2026-07-17). ADR-070 (Faz 2C-1) varyant EKSEN seçimi veri modelini + admin ekranını kurdu
  (`ProductVariantAttribute` × `ProductVariantOptionSelection` reçetesi). Bu faz o reçeteyi tüketip **oluşacak varyant
  kombinasyonlarının ÖNİZLEMESİNİ** üreten **tamamen SAF** bir motor + salt-okunur önizleme ucu/ekranı ekler. TODO-148.
- **Bağlam.** Combination Engine'in çekirdeği (Cartesian çarpım + kanonik sıralama + `combinationKey`) doğruluğu
  **deterministiklik** ve **idempotentlik** üzerine kuruludur; bu özellikler ancak yan-etkisiz saf bir fonksiyonda güvenle
  test edilebilir. Bu PR **KESİNLİKLE** kombinasyon YAZMAZ: `ProductVariant`, SKU, barcode, price, inventory, bulk edit,
  varyant görselleri, storefront/search/marketplace, order snapshot **KAPSAM DIŞI**. `combinationKey` üretilir ama **DB'ye
  yazılmaz** (kalıcılığı Faz 2C-3).

**Karar.**
1. **Saf motor (`engine.ts`).** `generateVariantCombinations(axes, {maxCombinations})` yalnız input → output üretir; Prisma/DB/
   transaction/network/logger/`process.env`/`Date`/`Math.random` **bilmez** ve girdiyi **mutasyona uğratmaz**. Bu, "aynı input →
   aynı output" (deterministik) ve "iki kez çağır → birebir aynı" (idempotent) garantilerini test edilebilir kılar. IO (kalıcı
   reçete + option metadata okuma) ayrı `data.ts`'te; eşleme + guard `service.ts`'te; HTTP `routes.ts`'te (Faz 2A/2C-1 modül deseni).
2. **Canonical ordering (girdi sırası sonucu DEĞİŞTİRMEZ).** Eksenler `position ASC → attributeDefinitionId ASC`; eksen içi
   option'lar `position ASC → optionId ASC`. Böylece karışık sıralı girdi ve farklı `position` değerleri aynı deterministik
   çıktıyı verir. **Neden:** kombinasyon kimliği (`combinationKey`) ve önizleme satır sırası girdi sırasından bağımsız, tekrarlanabilir
   olmalı — yoksa aynı ürün için farklı isteklerde farklı kimlik/sıra üretilir.
3. **`combinationKey` — ID-tabanlı kanonik kimlik.** Format `v1|<attributeDefinitionId>:<optionId>|...`, segmentler
   `attributeDefinitionId`'ye göre sıralı. **Neden ID (kod/değer DEĞİL):** `code`/`value`/`label` yeniden adlandırılabilir
   (mutable) — ID-tabanlı anahtar rename VE `position` değişiminden **bağımsızdır** (stabil kimlik), gelecekte `ProductVariant`
   üzerinde `@@unique([productId, combinationKey])` kısıtı için sağlam temeldir. cuid'ler `[a-z0-9]` olduğundan `:`/`|` ayraç
   çakışması yoktur. Sürüm ön eki (`v1|`) format evrimine izin verir. **Bu fazda üretilir, DB'ye YAZILMAZ.**
4. **`previewId` — deterministik hash (random DEĞİL).** `pv_<cyrb53(combinationKey)>` (14 haneli hex). **Neden random/UUID değil:**
   önizleme kimliği tekrarlanabilir olmalı (React key stabilitesi + snapshot testleri + idempotency kanıtı). `previewId` geçici bir
   UI kimliğidir; kalıcı benzersizlik `combinationKey`'dedir. `Math.random()`/`Date.now()` motor sözleşmesinde YASAK (saflık).
5. **Cartesian üretim — iteratif odometer.** Recursive zorunlu değil; en okunabilir çözüm seçildi. `O(k)` çalışma-belleği index'i
   (k=eksen sayısı) ile satırlar üretilir; son eksen en hızlı döner (deterministik satır sırası). Bellek: guard çıktıyı sınırladığı
   için materialize edilmiş dizi yeterli — **streaming gerekmez** (çıktı kümesi zaten üst-sınırlı; sınırsız olsaydı streaming gerekirdi).
6. **Duplicate önleme + kenar durumlar.** Duplicate option tekilleştirilir; duplicate axis (aynı attribute) option kümeleri
   **birleştirilir (union)** — böylece girdi tekrarı çıktıyı değiştirmez ve sonuç girdi sırasından bağımsız kalır. Archived option'lar
   çıkarılır; filtreleme sonrası boş kalan eksen (empty axis) **düşürülür**. Hiç eksen yoksa **0 kombinasyon** (matematiksel "boş çarpım
   = 1" reddedildi — varyantı olmayan ürün için anlamsız).
7. **Runtime guard — `MAX_PREVIEW_COMBINATIONS` (config; magic number DEĞİL).** Cartesian büyüklüğü **materialize edilmeden önce**
   hesaplanır; limit aşılırsa stabil `PREVIEW_LIMIT_EXCEEDED` kodu + `{totalCombinations, limit}` döner (route 422). Varsayılan 1000
   (`optionalNumberEnv`, TD-036 boş-string toleranslı). **Neden:** 5+ eksen × yüksek option pratik-dışı bir kombinasyon patlaması
   üretebilir; guard bellek/CPU'yu korur ve sessiz kırpma yerine yüksek-sesli hata verir.
8. **Preview-first + salt-okunur uç/ekran.** `GET /stores/:storeId/products/:productId/variant-combinations/preview` yalnız hesaplar
   (WRITE YOK). Legacy `GET/PUT .../variant-selections` (2C-1) ve `ProductVariant`/`optionValues` semantiği **DEĞİŞMEZ**. store-admin
   ürün formuna salt-okunur **"Oluşacak Kombinasyonlar"** paneli (yalnız düzenleme modunda + kategori varyant-defining eksen tanımladıysa;
   kaydedilmiş reçeteyi yansıtır). **Düzenleme/oluşturma YOK** — yalnız oluşacak kombinasyonlar listelenir.

**Sonuçlar.**
- Combination Engine'in doğruluk çekirdeği (Cartesian + kanonik sıralama + `combinationKey`) saf, deterministik, idempotent ve
  yoğun birim testleriyle (31 motor/servis/route + 7 UI testi) kanıtlanmış olarak hazır; Faz 2C-3 (kalıcı `ProductVariant` + SKU
  matris) bu motoru olduğu gibi tüketebilir.
- Migration YOK (şema değişmedi); `optionValues`/storefront/checkout/order/inventory DEĞİŞMEZ; eski istemciler için ek uç tamamen
  additive.

**Alternatifler (reddedilen).** `combinationKey`'i `code:value` (insan-okunur) ile üretmek (rename ile kimlik kayar — ID-tabanlı
tercih edildi); `previewId` için random UUID (tekrarlanamaz → determinizm/idempotency kanıtı imkânsız — deterministik hash seçildi);
motoru servise/Prisma'ya bağlamak (saflık + izole test kaybı — DI ile ayrıldı); guard'ı sabit magic number yapmak (config'ten gelir);
recursive Cartesian (odometer daha okunur + `O(k)` bellek); bu fazda `ProductVariant`/`combinationKey` yazmak (brief'in açık YASAK
listesi — preview-first, yazım Faz 2C-3); boş çarpımı 1 kombinasyon saymak (varyantsız ürün için anlamsız — 0 seçildi); streaming
çıktı (guard zaten üst-sınırladığından gereksiz karmaşıklık).

## ADR-072 — ProductVariant persistence + incremental generation: saf diff motoru, soft-archive/restore, deterministik sistem SKU (Faz 2C-3)

- **Durum:** Kabul edildi (2026-07-18). ADR-071 (Faz 2C-2) SAF Combination Engine'i (`combinationKey` üretir ama DB'ye YAZMAZ)
  kurdu. Bu ADR o motoru olduğu gibi tüketip **kalıcı `ProductVariant` üretimini** ekler: reçeteden hedef kombinasyonlar üretilir ve
  mevcut varyantlarla **diff'lenir** (create/keep/restore/archive). Combination Engine (`engine.ts`) DEĞİŞMEDİ.

**Bağlam.** TODO-149. Faz 2C-2 önizleme-önce yaklaşımıyla kombinasyonları hesaplıyordu ama hiçbir şey yazmıyordu. Bu faz kalıcılığı
ekler; deterministik · idempotent · transaction-safe · concurrency-safe · tenant-safe · tekrar-çalıştırılabilir olmalı. SKU Matrix
DEĞİLDİR (fiyat/stok/barcode/inline düzenleme YOK).

**Kararlar.**
1. **Preview-first sonrası persistence + SAF diff motoru.** Önizleme (2C-2) kararlaştırıldıktan sonra kalıcılık ayrı fazda: kullanıcı
   önce ne oluşacağını görür, sonra açık bir aksiyonla üretir. Üç saf katman ayrıldı: `engine.ts` (Cartesian — DOKUNULMADI) ·
   `diff-engine.ts` (mevcut/hedef küme karşılaştırması — Prisma/DB/Date/random BİLMEZ, girdiyi mutasyona uğratmaz) ·
   `service.ts`/`data.ts` (transaction + DB). Diff **Map/Set tabanlı ~O(P+E)** (P=hedef, E=mevcut generated); nested O(P×E) YASAK.
   Çıktı `{toCreate, toKeep, toRestore, toArchive, manualVariants}`, `combinationKey` sırasında deterministik.
2. **`combinationKey` kalıcı + `@@unique([productId, combinationKey])`.** Üretilmiş varyantta dolu, manuel varyantta `null`.
   **PostgreSQL NULL-distinct** semantiği: çok sayıda manuel `null` çakışmaz; üretilmiş non-null key aynı ürün altında **tektir**;
   farklı ürünlerde aynı key serbest. Partial index GEREKMEYDİ (standart composite unique yeterli). Bu unique aynı zamanda
   concurrency insert-conflict (P2002) temeli.
3. **`generationSource` enum (MANUAL | ATTRIBUTE_COMBINATION).** String magic value DEĞİL. Migration default'u `MANUAL` → mevcut/legacy
   TÜM varyantlar MANUAL (tahminî `combinationKey` ATANMAZ; **backfill YOK**). Sistem YALNIZ `ATTRIBUTE_COMBINATION` varyantlarını
   archive/restore eder; **manuel varyantlara DOKUNMAZ** (izolasyon).
4. **Soft-archive/restore — hard-delete YASAK.** Reçeteden çıkan üretilmiş varyant `status=ARCHIVED` + `archivedAt=now` olur (storefront/
   checkout zaten ARCHIVED'ı dışlar → **storefront kodu değişmez**). Aynı `combinationKey` reçeteye geri girerse **aynı kayıt** restore
   edilir (`status=DRAFT`, `archivedAt=null`) — **yeni ProductVariant ID açılmaz**, SKU/barcode/price/cost/inventory KORUNUR.
   **Neden restore aynı ID:** order line / inventory / fiyat geçmişi / audit / gelecekteki marketplace eşlemesi varyanta bağlı;
   hard-delete bunları yetim bırakır/bozar.
5. **Kullanıcı verisi koruma.** `toKeep` → **HİÇBİR write yok** (idempotentlik; `updatedAt` değişmez). `toRestore` → yalnız
   `status`+`archivedAt` flip. Yalnız `toCreate` yeni varyanta güvenli başlangıç verir. Regeneration SKU/barcode/price/compareAt/cost/
   inventory/images ÜZERİNE YAZMAZ.
6. **Yeni varyant başlangıç değerleri + deterministik sistem SKU.** Yeni üretilen varyant `status=DRAFT` (vitrine sızmaz),
   `priceMinor=0`, `netPriceMinor=0`, `vatRateBps=2000`, `currency=mevcut varyant currency veya "TRY"`, `optionValues` JSON'a **YAZILMAZ**.
   SKU zorunlu + `@@unique([storeId, sku])` → **deterministik**: `sku = "V-<productId>-<hash(combinationKey)>"`. productId cuid
   (mağaza-içi + global tekil) → ürünler arası çakışma yok; hash(combinationKey) ürün-içi kombinasyonları ayırır; yeniden üretimde
   DEĞİŞMEZ; restore mevcut SKU'yu korur. **random/timestamp/`Math.random()` YASAK.** Kullanıcı SKU Matrix'te (2C-4) değiştirebilir.
   **InventoryItem OLUŞTURULMAZ** (görev kuralı; ilişki nullable; adjust/SKU-Matrix upsert'i lazy oluşturur) ve ProductPriceChange
   audit'i yazılmaz (price 0 placeholder).
7. **Normalize selection storage — YENİ `ProductVariantOptionValue`.** Üretilmiş varyantın çözülmüş eksen→option çiftleri
   (variantId, attributeDefinitionId, optionId; `@@unique([variantId, attributeDefinitionId])` → çift değer engellenir). **Neden yeni
   tablo, 2A `VariantAttributeValue` DEĞİL:** `VariantAttributeValue`'nun tek yazma otoritesi 2A `attributeValueService`; persistence
   oraya yazarsa single-writer invariantı kırılır ve kullanıcının girdiği variant attribute değerleri ezilebilir. `optionValues Json?`
   bu fazda AUTHORITATIVE DEĞİL.
8. **Transaction + concurrency.** Tüm üretim (lock → reçete oku → option meta → engine → mevcut oku → diff → create/restore/archive)
   TEK `prisma.$transaction` içinde. Concurrency iki katmanlı: (a) transaction başında **PostgreSQL advisory xact lock**
   (`pg_advisory_xact_lock(hashtext(productId))`) → aynı ürün için generation'lar serileşir; (b) DB unique `(productId, combinationKey)` →
   yarış durumunda duplicate insert **P2002** ile reddedilir → kontrollü `VARIANT_GENERATION_CONFLICT` (409). Yalnız application-level
   "önce kontrol et sonra ekle" YETERSİZ sayıldı.
9. **Boş reçete + axis semantiği.** Reçetede eksen yoksa `VARIANT_SELECTION_EMPTY` — **sessiz archive YOK** (mevcut varyantlar
   dokunulmaz). Eksen var ama tüm option'lar archived → 0 kombinasyon → `INVALID_VARIANT_SELECTION`. "Tüm generated'ı kaldır" ayrı/açık
   bir aksiyon olmalı (bu fazda YOK). **Axis ekleme/kaldırma:** `combinationKey` eksen kümesini kodlar (`v1|attrId:optId|...`); eksen
   sayısı değişince key değişir → eski kombinasyonlar hedefte YOK (archive), yenileri create. **Rename/position** identity'yi
   DEĞİŞTİRMEZ (key ID-tabanlı; ProductVariant ID sabit).
10. **API + UI.** `POST /stores/:storeId/products/:productId/variant-combinations/generate` (gövdesiz; authoritative kaynak DB reçetesi).
    Yanıt: `{totalTarget, created, kept, restored, archived, manualVariantsUntouched, variants[]}`. Stabil hatalar: PRODUCT_NOT_FOUND(404),
    VARIANT_SELECTION_EMPTY / INVALID_VARIANT_SELECTION / PREVIEW_LIMIT_EXCEEDED / ATTRIBUTE_OPTION_NOT_FOUND (422),
    VARIANT_GENERATION_CONFLICT(409). Preview ucu (GET) BOZULMAZ. store-admin ürün formuna **"Varyantları Oluştur"** aksiyonu + sonuç
    özeti (yalnız düzenleme + eksen varsa görünür; preview limiti aşıldıysa/yükleniyorsa pasif); başarıda önizleme yeniden çekilir.
    i18n tr+en. **SKU Matrix / inline fiyat-stok düzenleme YOK.**

**Sonuçlar.** Faz 2C-4 (SKU Matrix) kalıcı `ProductVariant` + `combinationKey` + normalize selection üzerine kurulabilir. Migration
tamamen additive (yeni enum + 3 nullable/defaultli kolon + yeni tablo + 1 unique index); mevcut `ProductVariant`/`optionValues`/SKU/
storefront/checkout/order/inventory DEĞİŞMEZ; legacy varyantlar `MANUAL` kalır.

**Alternatifler (reddedilen).** Her generate'te tüm varyantları silip yeniden oluşturmak (ID/SKU/price/order-line kaybı → diff);
title/label tabanlı identity (rename kimliği bozar → ID-tabanlı `combinationKey`); JSON `optionValues`'ı authoritative tutmak
(sorgulanamaz + tutarsızlık → normalize tablo); hard-delete (order/inventory/audit yetim → soft-archive); random/timestamp SKU
(tekrar-üretimde değişir + determinizm kaybı → deterministik hash); yalnız application-level duplicate check (yarış → DB unique +
advisory lock); manuel ve generated'ı ayırmamak (kullanıcı verisi riski → `generationSource` enum); Combination Engine'e Prisma eklemek
(saflık/izole test kaybı → ayrı persistence katmanı); 2A `VariantAttributeValue`'yu paylaşmak (single-writer invariantı kırılır → yeni
`ProductVariantOptionValue`); yeni varyanta InventoryItem/price-audit yazmak (görev kuralı + DRAFT placeholder → lazy).
