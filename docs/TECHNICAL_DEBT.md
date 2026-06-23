# Technical Debt

## TD-001 Frontend app'ler henuz yok

- Durum: OPEN
- Oncelik: HIGH
- Etki: Admin, super admin ve storefront deneyimleri henuz kullanici tarafindan dogrulanamiyor.
- Cozum onerisi: Faz 1 ve Faz 3 kapsaminda admin/storefront foundation app'lerini baslatmak.
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
