# commerce-os — Project Pause Snapshot

**Date:** 2026-08-16  
**Status:** PAUSED

Bu dosya projeye geri dönüldüğünde kaldığımız noktayı tek yerden hatırlamak için oluşturuldu.

## Kaldığımız Yer

### Per-Tenant Store Admin Auth + RBAC
- **CLOSED & DEPLOYED**.
- PR #216 merged (`2d3fff8`).
- Docs closure PR #217 de merge edildi.
- StoreUser login/session/extend/logout, tenant isolation, RBAC, audit ve real-login Playwright green.
- Açık future debt: TD-AUTH-002/003/004/006.

### Structural Tenant Isolation / PostgreSQL RLS
- **PAUSED — EXTERNAL STAGING DEPENDENCY**.
- Phase A: DONE.
- Phase B: DONE.
- Phase C local performance pre-gate: **FAILED / NO-GO**.
- Security modeli kanıtlı: non-owner `commerce_app`, `NOBYPASSRLS`, role-targeted platform access, fail-closed tenant context, pool leak=0, cross-store deny.
- `app.bypass_rls` GUC authorization primitive olarak reddedildi.
- Preferred context baseline: transaction-scoped `SET LOCAL app.current_store_id` + request-scoped UoW/ALS.
- Local ölçümlerde transaction/context overhead strict budget dışında kaldı; threshold gevşetilmedi.
- A/B/C staging instrumentation, load tooling, RLS harness ve runbook hazır.
- **Gerçek staging erişimi yok**; bu nedenle authoritative RTT/A-B-C ölçümü ve FULL RLS RE-GO / BORDERLINE / ARCHITECTURE REDESIGN verdict'i henüz verilemez.

### RLS Resume Rule
Projeye dönüldüğünde RLS tarafındaki **ilk iş yeni kod yazmak değil**:
1. Gerçek staging gateway → PostgreSQL ortamına mevcut instrumentation'ı deploy et.
2. Fixed gate ile gerçek A/B/C ölçümü al: p95 ≤ +15%, p99 ≤ +20%, throughput loss ≤ 25%, saturation/timeout yok.
3. Instrumentation'ı kapat.
4. Sonuca göre yalnız şu üç karardan birini ver: FULL RLS RE-GO / BORDERLINE / ARCHITECTURE REDESIGN.

Staging verisi gelmeden:
- production RLS enable etme,
- runtime `DATABASE_URL` cutover yapma,
- synthetic RTT'yi karar verisi kullanma,
- selective RLS'e geçme,
- session-level SET/pinning workaround implement etme.

## Sonraki Ana Roadmap

RLS blokajından sonra mevcut roadmap sırası korunur:
- Production PSP Payment
- Real Online Refund Execution
- Live Carrier Integration
- Production Docker Runtime + Migration Strategy
- Backup / Restore / DR Validation
- Observability
- Rejected Disposition Inventory Completion
- Media Library Admin
- Coupon Wallet Admin
- TODO-176C E2E Mutation Coverage Completion

## Yeni Eklenen Product Roadmap Maddeleri

### PDP Bundle / Frequently Bought Together — P1
Ürün detayında **“Bu ürünle birlikte almak ister misin?”** alanında en fazla 3 tamamlayıcı ürün gösterilecek. Kullanıcı seçtiklerini ana ürünle birlikte tek aksiyonla sepete ekleyebilecek.

Implementasyon öncesi analizde netleştirilecek: admin/manual bundle yönetimi, otomatik öneri ihtiyacı, stok/fiyat doğrulaması, variant davranışı, cart atomicity ve analytics events.

### Low Stock Urgency Messaging — P2
Ürün veya varyant stoku tanımlı X bareminin altına düştüğünde PDP'de **“Acele et, stokta yalnızca X adet kaldı”** bilgisi gösterilecek.

Implementasyon öncesi analizde netleştirilecek: threshold scope (store/product/variant), hangi stok sayısının authoritative olduğu (`available`, reservation sonrası vb.), overselling davranışı ve cache/freshness.

### Product Personalization — Laser / Hot Print — P1
Ürün ekleme/yönetiminde seçili ürünlere **lazer baskı** ve/veya **sıcak baskı** kişiselleştirme seçeneği tanımlanabilecek.

Implementasyon öncesi analizde netleştirilecek: ücretlendirme, müşteri giriş alanları, validation, variant/product ilişkisi, cart/order line snapshot, üretim talimatı, fulfillment ve refund/return etkileri.

## Source of Truth
- Yaşayan roadmap: Google Sheets — `commerce-os — Güncel Roadmap Takibi`.
- Repo karar/teknik kayıtları: `docs/ROADMAP.md`, `docs/TODO.md`, `docs/TECHNICAL_DEBT.md`, `docs/PHASE_LOG.md`.
- Bu dosya yalnız **pause/resume handoff snapshot**'ıdır; çelişki halinde yaşayan roadmap ve güncel repo dokümanları esas alınır.
