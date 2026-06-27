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
