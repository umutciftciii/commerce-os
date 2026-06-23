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

- Durum: OPEN
- Oncelik: HIGH
- Etki: Tenant context ve permission kararlari henuz gercek oturum uzerinden uretilmiyor.
- Cozum onerisi: Session modeli, token stratejisi ve auth middleware'i Faz 1'de netlestirmek.
- Hedef faz: Faz 1

## TD-003 Permission sistemi henuz gercek endpointlerde uygulanmadi

- Durum: OPEN
- Oncelik: HIGH
- Etki: Roller ve yetkiler foundation seviyesinde; davranissal guvence endpointlerde eksik.
- Cozum onerisi: Permission guard'lari API gateway ve servis adapter'larinda zorunlu hale getirmek.
- Hedef faz: Faz 1

## TD-004 Tenant isolation helperlari foundation seviyesinde

- Durum: OPEN
- Oncelik: HIGH
- Etki: Store-scoped sorgular icin desen var, ancak gercek endpoint kapsaminda genisletilmeli.
- Cozum onerisi: TenantContext kullanan repository/service pattern'lerini Faz 1 endpointlerine tasimak.
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

- Durum: OPEN
- Oncelik: HIGH
- Etki: `packages/api-client` yalnizca public health/version cagrilarini yapar; auth, token, session
  ve per-domain resource'lar (stores, products, orders...) yok.
- Cozum onerisi: Auth/session fazinda token stratejisi ve type-safe resource gruplarini eklemek
  (TD-002 ile birlikte).
- Hedef faz: Faz 1

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
- Hedef faz: Faz 2+
