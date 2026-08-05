# İade Akışı Sadeleştirme — Tasarım Spec'i

**Tarih:** 2026-08-06
**Durum:** TASARIM (onay bekliyor) — implementasyon başlamadı
**İlgili:** TODO-169 (Returns Foundation), TODO-170 (Refund Ledger), ADR-269, ADR-270, ADR-272, TD-FR-7

---

## 1. Özet

İade (return) akışı bugün çok adımlı ve yanıltıcı bir yapıya sahip: `REFUND_PENDING`
durumunda gerçek para iadesi adımı (İade Defteri panelindeki "Para iadesini başlat")
ile talebi refund'suz kapatan "Kapat" butonu yan yana duruyor. Admin yanlışlıkla
"Kapat"a basınca talep, **para iadesi hiç yapılmadan** arşivleniyor ve `RefundIntent`
iptal oluyor. Bu spec, akışı **karar-odaklı** hale getirir: admin yalnız gerçek
kararları verir, sistem ara geçişleri otomatikleştirir, "Kapat" tuzağı ortadan kalkar,
inceleme ekranı iadeyi başlatan/redde götüren tek karar merkezi olur. Ayrıca iki açığı
kapatır: (a) red edilen iadede ürünün müşteriye geri gönderilmesi (ters kargo), (b)
gerçekleşen iadenin tüm finansal özetlerde görünmesi.

## 2. Motivasyon — gözlemlenen sorun (OS-000004 / R000001)

Gerçek bir vakada (enterprise-demo, OS-000004, Casper Ekran Kartı iadesi):

- Talep doğru ilerledi: `REQUESTED → UNDER_REVIEW → APPROVED → AWAITING_SHIPMENT →
  RETURN_SHIPPED → RECEIVED → INSPECTED → REFUND_PENDING` (inceleme: "hasarlı").
- `REFUND_PENDING`'de admin, aşağıdaki İade Defteri panelindeki **"Para iadesini
  başlat"** yerine üstteki belirgin **"Kapat"** butonuna bastı.
- Sonuç: `REFUND_PENDING → CLOSED`, `RefundIntent` **CANCELLED** ("Return CLOSED:
  refund not settled."), `OrderRefund` ledger'ı **boş**, `Order.paymentStatus` hâlâ
  `PAID`. **Müşteriye para iadesi hiç yapılmadı** ve ücret özetinde iade kalemi yok
  (çünkü finansal iade oluşmadı).

### Kök sorunlar
- **A — "Kapat" tuzağı:** `REFUND_PENDING → CLOSED` geçişi hiçbir refund kontrolü
  yapmıyor; `COMPLETED`'a geçiş refund SUCCEEDED gerektiriyor ama `CLOSED`'a geçiş
  serbest ve yıkıcılığı gizli.
- **B — Çift adım:** "İade sürecine al" (`INSPECTED→REFUND_PENDING`) ile "Para iadesini
  başlat" (panel) iki ayrı tık; inceleme geçtiğinde iade niyeti zaten belli.
- **C — Keşfedilebilirlik:** Gerçek iade adımı aşağıdaki panelde, yıkıcı "Kapat"
  yukarıda daha görünür.
- **D — Uzunluk:** 8+ manuel geçiş; bir kısmı yalnız "ilerlet" tıkı (otomatikleşebilir).

## 3. Hedefler / Hedef olmayanlar

**Hedefler**
- Admin yalnız gerçek kararları versin; ara geçişler otomatikleşsin.
- "Kapat" tuzağı ortadan kalksın (buton tümden kaldırılır).
- İnceleme = iadeyi başlatan/redde götüren tek karar merkezi.
- Admin, müşteri memnuniyeti için teslim/inceleme adımlarını atlayıp doğrudan iade
  yapabilsin ("Hızlı iade").
- Red edilen iadede ürün müşteriye geri gönderilebilsin ("İade gönderisi").
- Gerçekleşen iade tüm finansal özetlerde görünsün.

**Hedef olmayanlar**
- `ReturnStatus` enum'ını birleştirmek/yeniden yazmak (radikal Yaklaşım 2 — kapsam dışı).
- Gerçek ödeme sağlayıcısıyla otomatik online refund transportu (capability dürüstlüğü
  korunur: gerçek provider = `MANUAL_OFFLINE`; taklit yok).

## 4. Hedef akış

```
Talep → (oto UNDER_REVIEW) → [Onayla] → (oto AWAITING_SHIPMENT)
   → (müşteri kargo) RETURN_SHIPPED → [Teslim alındı] → RECEIVED
   → [İnceleme sonucu gir] = KARAR MERKEZİ:
        ├─ OLUMLU  → [İadeyi yap]  → refund başlar
        │              ├─ otomatik mod → SUCCEEDED anında → COMPLETED → (oto) CLOSED
        │              └─ manuel mod  → PENDING → [Manuel iade tamamlandı] → SUCCEEDED → COMPLETED → (oto) CLOSED
        └─ OLUMSUZ → zorunlu açıklama → [Reddet] → REJECTED
                        → "İade gönderisi" ile ürün müşteriye geri (ters kargo)

   ⚡ Hızlı iade: [Onayla] sonrası admin, teslim/incelemeyi atlayıp doğrudan [İadeyi yap]
```

Admin'in tipik karar tıkları: **Onayla → Teslim alındı → İnceleme(İadeyi yap) = 3**
(bugün 7+). Otomatik geçişler audit trail'de "sistem otomatik ilerletti" olarak
dürüstçe işaretlenir (aktör = SYSTEM/otomasyon, admin adına yanıltıcı yazım yok).

## 5. Tasarım bölümleri

### 5.1 — Otomatik geçişler
- `REQUESTED → UNDER_REVIEW`: "İncelemeye al" tıkı kalkar; talep açıldığında admin
  doğrudan **Onayla/Reddet** görür. (UNDER_REVIEW iç durum olarak korunabilir ama
  admin tıkı gerektirmez.)
- `APPROVED → AWAITING_SHIPMENT`: onaydan sonra **otomatik**.
- `COMPLETED → CLOSED`: refund SUCCEEDED → `COMPLETED` (bu zaten otomatik,
  `refunds/service.ts:134`) → ardından **otomatik** `CLOSED` (yeni). Admin ayrıca
  kapatmaz.
- Tüm otomatik geçişler idempotent + optimistic `version` guard ile; mevcut
  `evaluateReturnTransition` otoritesinden geçer (fail-closed korunur).

### 5.2 — İnceleme = karar merkezi
İnceleme diyaloğu iki sonuçlu:
- **Olumlu** (kabul): "İadeyi yap" birincil aksiyonu → `REFUND_PENDING`'e geçiş +
  `initiateRefund` **tek atomik akışta** çalışır (B kök sorununu çözer). Otomatik modda
  refund anında SUCCEEDED; manuel modda PENDING kalır ve "Manuel iade tamamlandı" ile
  kapanır.
- **Olumsuz** (red): **zorunlu açıklama** alanı + "Reddet" → `REJECTED`. Açıklama
  boşsa aksiyon kapalı (zaten mevcut reject diyaloğunda `rejectionReason` zorunlu).
- İnceleme adımı bir kalem bazında sonuç (hasarlı/geçti + stok kararı) girmeye devam
  eder; kısmi kabul/red mevcut yapı korunur.

### 5.3 — "Kapat" butonunun kaldırılması
- Admin UI'daki "Kapat" (`REFUND_PENDING/COMPLETED → CLOSED` manuel tıkı) **kaldırılır**.
- Kapanış artık yalnız iki yoldan olur: (a) refund SUCCEEDED → COMPLETED → oto CLOSED,
  (b) red → REJECTED.
- Backend `REFUND_PENDING → CLOSED` geçişi: settle edilmemiş bir talebi sessizce iptal
  eden yol kapatılır. (State-machine'de geçiş tanımı korunabilir ama admin route'undan
  tetiklenmez; yalnız sistemsel/idempotent kullanımlar için.) Böylece A kök sorunu
  yapısal olarak imkânsızlaşır.

### 5.4 — Hızlı iade kısayolu
- `APPROVED` (ve istenirse `RECEIVED`) durumunda **"Hızlı iade"** aksiyonu: teslim/
  inceleme adımlarını atlayıp doğrudan iadeyi başlatır.
- Onay modalı: "Teslim ve inceleme adımları atlanıyor; müşteriye doğrudan iade
  yapılacak" uyarısı + gerekçe (opsiyonel not).
- Audit trail'de "hızlı iade (adımlar atlandı)" olarak işaretlenir.

### 5.5 — Ters kargo (İade gönderisi)
- **Sorun:** Sipariş zaten teslim edildiği için (bir `Shipment` `DELIVERED`), sistem
  siparişe ikinci bir gönderi oluşturmaya izin vermiyor.
- **Çözüm:** Red edilen (`REJECTED`) iade talebine bağlı olarak, mevcut Kargo modülünde
  **"İade gönderisi"** (reverse / return-to-customer) tipli yeni bir gönderi
  oluşturmaya izin ver. Teslim-edilmiş-sipariş kısıtı bu akışta gevşetilir; yeni
  gönderi açıkça "İade gönderisi" etiketi taşır (mevcut çıkış gönderisiyle karışmaz).
- Müşteri, bu ters gönderinin takip numarasını kendi hesabından görür.
- Gönderi teslim edilince talep tamamen sonuçlanmış sayılır (bilgi amaçlı; REJECTED
  terminal kalır, ters kargo ona bağlı ek kayıt).
- **Not:** "Hafif" kapsam — mevcut Kargo modülü + yeni gönderi tipi/etiketi; ayrı bir
  state machine kurulmaz.

### 5.6 — Refund finansal görünürlük
- Refund SUCCEEDED olduğunda:
  - **Sipariş detayı → Ücret Özeti**'ne "İade (−)" satırı + net-of-refund tutarı
    eklenir (bugün gösterilmiyor — gerçek eksik).
  - **Finans raporları**: SUCCEEDED refund zaten Net/Total'dan düşülüyor (TODO-170,
    `metrics.ts`); bu spec kapsamında tutarlılık **doğrulanır** (yeni hesap eklenmez,
    yalnız görünürlük ve test).
- Kaynak doğrusu değişmez: gösterim `OrderRefund` ledger'ının SUCCEEDED toplamından
  türetilir; niyet (RefundIntent) finansal figürlerde kullanılmaz.

## 6. Fazlama (tek spec, fazlı implementasyon)

- **Faz 1 — Akış çekirdeği:** otomatik geçişler (5.1) + inceleme karar merkezi (5.2) +
  "Kapat" kaldırma (5.3) + hızlı iade (5.4). En yüksek değer; tuzağı yok eder.
- **Faz 2 — Ters kargo (5.5):** İade gönderisi tipi + teslim-sonrası kargo izni.
- **Faz 3 — Finansal görünürlük (5.6):** sipariş detayı ücret özeti iade satırı +
  finans tutarlılık doğrulaması.

Her faz kendi PR'ı olarak sevk edilebilir; Faz 1 diğerlerinden bağımsız değer taşır.

## 7. Geriye uyum
- Mevcut terminal iadeler (CLOSED/REJECTED/CANCELLED) etkilenmez.
- `RefundIntent`/`OrderRefund` ledger semantiği (TODO-170) korunur; yalnız tetikleme
  UX'i ve bazı geçişlerin otomasyonu değişir.
- Enum/migration gerektiren şema değişikliği (ters kargo etiketi/gönderi tipi hariç,
  additive) yok; ters kargo alanı da additive + nullable olacak.
- Mevcut `evaluateReturnTransition` state-machine otoritesi ve aktör-yetki ayrımı
  korunur.

## 8. Test stratejisi
- **Saf (state-machine):** yeni otomatik geçişler (approve→await, completed→closed),
  inceleme→iade tek-akış, "Kapat" yolunun admin route'undan erişilemezliği.
- **Gerçek-DB entegrasyon:** olumlu inceleme → İadeyi yap → OrderRefund SUCCEEDED →
  return COMPLETED→CLOSED (otomatik & manuel mod); red → REJECTED + ters kargo
  oluşturma izni; hızlı iade kısayolu.
- **Finans:** SUCCEEDED refund'ın sipariş ücret özetinde ve rapor tutarlarında
  görünmesi (net-of-refund).
- **Geriye uyum:** mevcut terminal iadelerin ve legacy siparişlerin bozulmaması.

## 9. Riskler / açık sorular
- **R1 — Otomatik CLOSED zamanlaması:** COMPLETED→CLOSED otomatiği, ileride manuel bir
  "kapanış sonrası aksiyon" ihtiyacını kısıtlar mı? (Şimdilik kabul: refund tamam =
  talep bitti.)
- **R2 — Ters kargo teslim-kısıtı gevşetmesi:** Kısıtın yalnız "red edilmiş iadeye
  bağlı" akışta gevşediğinden emin olunmalı; genel "teslim sonrası ikinci kargo"
  açığına dönüşmemeli.
- **R3 — Hızlı iade yetkisi:** Hızlı iade (adım atlama) belirli bir role/limite mi
  bağlı olmalı? (İlk sürümde tüm store-admin; ileride limit/rol eklenebilir.)
- **R4 — Manuel mod kapanışı:** Manuel modda refund PENDING iken talep COMPLETED'a
  geçmez; "Manuel iade tamamlandı" ile SUCCEEDED olunca kapanır — UI bu bekleme
  durumunu net göstermeli.
