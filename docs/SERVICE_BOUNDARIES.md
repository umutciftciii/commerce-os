# Service Boundaries

## Temel Kural

Her servis yalnizca kendi domain alanindan sorumludur. Bir servis baska servisin DB alanina direkt
erismez, baska servisin tablolarini kendi is kuralinin parcasi gibi mutate etmez ve paylasimli veri
degisimini kontrat, API, event veya queue uzerinden yapar.

Baslangicta tek PostgreSQL cluster kullanilsa bile bu kural gecerlidir. Tek cluster, operasyonel
foundation tercihidir; servis sinirlarini gevsetme izni degildir.

## API Gateway

- Yapar: HTTP giris noktasi, health/version endpointleri, internal health kontrolleri, ileride auth
  ve tenant context cozumleme.
- Yapmaz: Domain is kurallarini kendi icinde buyutmez; commerce, checkout veya integration davranisini
  DB'ye direkt yazarak sahiplenmez.

## Worker

- Yapar: Queue joblarini calistirir, background isleri ilgili servis kontratlarina gore tetikler.
- Yapmaz: Servis sahipligini atlayarak farkli domain tablolarini rastgele guncellemez.

## Commerce Service

- Yapar: Product, catalog, inventory, customer, order ve commerce core kurallarini sahiplenir.
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
