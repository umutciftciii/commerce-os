# Service Boundaries

## Temel Kural

Her servis yalnizca kendi domain alanindan sorumludur. Bir servis baska servisin DB alanina direkt
erismez, baska servisin tablolarini kendi is kuralinin parcasi gibi mutate etmez ve paylasimli veri
degisimini kontrat, API, event veya queue uzerinden yapar.

Baslangicta tek PostgreSQL cluster kullanilsa bile bu kural gecerlidir. Tek cluster, operasyonel
foundation tercihidir; servis sinirlarini gevsetme izni degildir.

## API Gateway

- Yapar: HTTP giris noktasi, health/version endpointleri, internal health kontrolleri, platform
  admin auth/session cozumleme, platform admin store/plan foundation endpointleri, Faz 2A
  store-scoped catalog/inventory API foundation endpointleri ve audit log yazimi. Catalog/inventory
  endpointleri su an gateway icinde yayinlanir; store-user auth tamamlanana kadar platform admin
  bearer session + explicit `storeId` context ile korunur.
- Yapmaz: Commerce, checkout veya integration davranisini DB'ye direkt yazarak sahiplenmez. Store
  admin UI, storefront resolver, sepet/siparis/checkout/odeme/kargo/pazaryeri modulleri bu sinirin
  disindadir. Faz 2A catalog/inventory yalnizca foundation CRUD ve manual stock adjustment'tir;
  order reservation veya marketplace sync davranisi degildir.

## Worker

- Yapar: Queue joblarini calistirir, background isleri ilgili servis kontratlarina gore tetikler.
- Yapmaz: Servis sahipligini atlayarak farkli domain tablolarini rastgele guncellemez.

## Frontend App'ler (admin-web, store-admin-web, storefront-web)

- Yapar: Kullanici arayuzu, layout, routing, ortak UI shell ve presentation. Backend ile yalnizca
  API gateway uzerinden ve `packages/api-client` ile konusur. admin-web ve store-admin-web bu gateway
  erisimini Next route handler'lari (BFF) icinde SUNUCU tarafinda yapar; tarayici yalnizca ayni-origin
  `/api/*` uclarini cagirir. Platform bearer token httpOnly cookie'de server-side tutulur; mutating BFF
  istekleri CSRF header/cookie dogrulamasi ister (ADR-017, ADR-018, ADR-023).
- store-admin-web BFF sinirlari (Faz 2B, ADR-023): store-admin'e ozel cookie adlari kullanir; hedef
  `storeId` istemciden ALINMAZ, her istekte session token ile server-side cozulur (tarayici keyfi
  mağaza secemez). UI'a yalnizca mağaza meta'si (id/ad/slug/durum) doner; bearer token UI/JS/log/client
  bundle'a girmez. Fiyat TL<->minor unit donusumu UI helper'inda yapilir; backend her zaman minor unit
  (integer) alir/doner. Gateway hata `code`'u UI'da ham gosterilmez, i18n ile Turkce mesaja cevrilir.
- Yapmaz: Domain is kurali, DB erisimi, gercek auth/session logic'i (token uretme/dogrulama gateway'in
  isidir; BFF yalnizca cookie tasir/proxy yapar), odeme veya pazaryeri logic'i icermez. Servis
  tablolarina veya Prisma'ya dogrudan erismez. BFF route handler'lari gateway'i cagirmanin disinda
  domain karari vermez (store context cozumleme haric — o da yalnizca gateway store list cagrisidir);
  gizli degeri (internal token) yalnizca sunucuda tutar, istemciye sizdirmaz. CSRF token'i auth token
  degildir; session bearer token'i istemci JS'ine verilmez.

## packages/ui ve packages/api-client

- `packages/ui`: Yalnizca sunum katmani primitive'leri. Domain bilgisi, network cagrisi veya is
  kurali tasimaz; framework-agnostik ve presentational kalir.
- `packages/api-client`: Frontend -> API gateway erisiminin tek type-safe kanali. Backend kontratini
  bozmadan `packages/contracts` tiplerini kullanir (ve frontend'in tek kanaldan erismesi icin gerekli
  contract tiplerini re-export eder); bearer/internal token alabilen auth/admin/health/catalog/
  inventory helper'lari ve tipli `ApiError` saglar. Faz 1B'de admin-web, Faz 2B'de store-admin-web bu
  client'i BFF route handler'lari icinde (SUNUCU tarafinda, asla istemci JS'inde) kullanir. Network
  cagrisi yapar ama UI/DOM veya domain is kurali tasimaz.

## Commerce Service

- Yapar: Product, catalog, inventory, customer, order ve commerce core kurallarini sahiplenir.
- Faz 2A notu: Product/category/variant/inventory foundation modelleri ve gateway endpointleri
  eklendi; ancak `services/commerce-service` henuz runtime sahibi olarak genisletilmedi. Bu gecici
  gateway uygulamasi, commerce-service ayrismasi ve store-user guard tamamlanana kadar kontrollu
  foundation'dir.
- Yapmaz: Odeme provider detaylarini, pazaryeri credential'larini veya storefront tema render
  davranisini sahiplenmez.

## Checkout Service

- Yapar: Cart, checkout session, payment abstraction ve odeme sonucuna bagli commerce entegrasyon
  akisini sahiplenir.
- Yapmaz: Product katalog dogrulugunun tek kaynagi olmaz; pazaryeri sync veya fatura provider
  detaylarini sahiplenmez.

## Storefront Service

- Yapar: Public storefront okuma, tema foundation ve domain routing davranislarini sahiplenir.
- Yapmaz: Admin operasyonlarini, odeme yakalama davranisini veya pazaryeri sync islerini sahiplenmez.

## Integration Service

- Yapar: Pazaryeri ve dis sistem connector'lari, credential isolation, sync joblari ve integration
  state yonetimini sahiplenir.
- Yapmaz: Commerce core verisini kendi kaynagi gibi tanimlamaz; commerce degisikliklerini kontratli
  API/event akislariyla ister veya yayar.

## Search Service

- Yapar: Arama indeksleri, index refresh joblari ve search query davranislarini sahiplenir.
- Yapmaz: Product veya order kayitlarinin otoritatif kaynagi olmaz.

## Analytics Service

- Yapar: Raporlama, metrik hesaplama, aggregate veri ve growth assistant girdilerini sahiplenir.
- Yapmaz: Operasyonel order/product state'ini dogrudan degistirmez.

## Notification Service

- Yapar: Email, webhook, sistem bildirimi ve notification delivery state'ini sahiplenir.
- Yapmaz: Auth/session, order state veya integration credential alanlarini sahiplenmez.
