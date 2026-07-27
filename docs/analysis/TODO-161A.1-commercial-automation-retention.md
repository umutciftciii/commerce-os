# TODO-161A.1 — Commercial Automation & Data Retention — Ön Analiz

**Tarih:** 2026-07-27 · **Kapsam:** operasyonel otomasyon + veri yaşam döngüsü (yeni ticari yüzey YOK).
**Kapatılan borçlar:** TD-125 (otomatik settlement zamanlayıcı), TD-121 + TD-113 (sponsored + influencer ham event retention).

---

## 1. Mevcut durum

### 1.1 Scheduler / worker altyapısı

Monorepo'da **iki ayrı arka-plan iş evreni** var; ayrım mimari olarak yük taşıyıcı:

1. **BullMQ + Redis kuyruk worker'ları** — ayrı süreç (`apps/worker/src/main.ts`), event-driven / ağır async iş.
   Kuyruk yardımcıları: `packages/queues/src/index.ts` (`createQueue`/`createWorker`, retry sözleşmesi `attempts:5` + exponential backoff).
2. **Süreç-içi `setTimeout` zinciri zamanlanmış worker'lar** — `apps/api-gateway` süreci İÇİNDE çalışır. Provider-agnostik
   tarama/süpürme döngüleri için. ADR-051 (shipment sync) ile kurulan, TODO-123 (barcode retry) ve TODO-155.2 (campaign
   reconcile) tarafından birebir yeniden kullanılan desen.

**Kanonik şablon** (`apps/api-gateway/src/campaigns/reconcile-worker.ts` + `reconcile-service.ts`):
- Handle arayüzü: `{ enabled, runOnce(): Promise<Summary | null>, stop(): Promise<void> }`.
- `XXX_ENABLED=false` (varsayılan) → döngü KURULMAZ, tek satır log, no-op handle.
- **setInterval değil setTimeout zinciri** — sonraki tur ancak önceki BİTTİKTEN sonra planlanır (`runOnce().finally(schedule)`),
  `timer.unref?.()`.
- **Overlap koruması:** süreç-içi `let running = false` guard'ı (`if (running) return null`). Job-lock tablosu / advisory-lock
  YOK; tek-instance varsayımı (TD-054.3'te belgeli sınır).
- Tur hatası süreci ÇÖKERTMEZ (try/catch + log), sonraki tur planlanır.
- `stop()`: `stopped=true` + timer temizle + `while(running) await sleep(50)` (in-flight tur biter).
- Saf çekirdek (`*-service.ts`) DI-testable: `{ persistence, logger, ... }`; prisma persistence factory ayrı.

**Kayıt noktası:** `apps/api-gateway/src/main.ts` (süreç girişi; `createServer` DEĞİL — testler worker'sız kurar).
Her worker `start...Worker({ config, logger })` ile başlatılır, handle'ı `shutdown()` içinde `.stop()` edilir (SIGTERM/SIGINT).

**Config env deseni:** `packages/config/src/index.ts` — `optionalBooleanEnv(false)` / `optionalNumberEnv(z.coerce...min().default())`
(TD-036: `KEY=` boş bırakılırsa default'a düşer, boot çökmez).

### 1.2 Job run audit / report

- `QueueJobLog` modeli (`schema.prisma:976`) ŞEMADA VAR ama **hiçbir yerde YAZILMIYOR** (scaffold). Alanlar:
  `storeId?`, `jobName`, `queueName`, `status QueueJobStatus`, `attempts`, `payload Json?`, `error Json?`, `createdAt`.
  Enum `QueueJobStatus { PENDING PROCESSING COMPLETED FAILED RETRYING }`. Index'ler: `[storeId]`, `[queueName, jobName]`, `[status]`.
  → **Bu iş için job-run audit/görünürlük deposu olarak ideal; migration gerektirmez.**
- Bugün job raporu yalnızca log satırı; domain durumu ilgili satırlarda (ör. `Shipment.lastSyncAt`).

### 1.3 Purge / retention

- Genel purge/retention yardımcısı **YOK**. En yakın şablon: `packages/db/scripts/cleanup-smoke.ts`
  (`assertSafeCleanupEnv` env guard, prefix-scoped `where`, tek `$transaction`, `deleteMany`, JSON özet).
- Dağınık `deleteMany({ where: { createdAt: { lt: cutoff } } })` çağrıları var ama paylaşılan cutoff/dry-run/circuit-breaker YOK.

### 1.4 Sponsorship / settlement domain

- Şema: `packages/db/prisma/schema.prisma`.
- **`SponsorshipAgreement`** (3945): `status SponsorshipAgreementStatus` (DRAFT/PENDING_APPROVAL/ACTIVE/SUSPENDED/
  COMPLETED/CANCELLED), `settlementPeriod SponsorshipSettlementPeriod @default(CAMPAIGN_END)`, `startsAt`/`endsAt` (zorunlu),
  `currency`, `pricingModel`. **Kampanya `campaignId` YOK** — bağ `SponsorshipAgreementCampaign` junction (`@@unique([campaignId])`).
- **`SponsorshipSettlement`** (4019): `status SponsorshipSettlementStatus { DRAFT FINALIZED }`, `periodKind`, `periodStart`/
  `periodEnd`, metrik snapshot, `@@unique([agreementId, periodStart, periodEnd])` (dönem başına tek settlement, DB-enforced).
- **Enum `SponsorshipSettlementPeriod { CAMPAIGN_END WEEKLY MONTHLY MANUAL }`** — bu ZATEN anlaşma başına schedule tercihidir.
  → **Yeni schedule alanı GEREKMEZ; `agreement.settlementPeriod` otoritedir.**
- Çekirdek servis: `apps/api-gateway/src/sponsorship/data.ts` → `createSponsorshipData(prisma)`.
  `previewSettlement(storeId, agreementId, { periodStart, periodEnd, periodKind }, now)`:
  - Aynı dönem FINALIZED ise `PERIOD_ALREADY_FINALIZED` döner (dokunmaz).
  - Metrik toplar (`collectBillableMetrics`), fiyatlar (`computePricedAmountMinor` + `clampToBudget`), `status:"DRAFT"` yazar.
  - Mevcut DRAFT'ı **upsert** eder (unique dönem) → duplicate imkansız; yoksa oluşturur.
  → **Scheduler bu fonksiyonu YENİDEN KULLANIR** (fiyat matematiği bölünmez). DRAFT-only + FINALIZED-immutable + duplicate
    guard hazır. Otomatik finalize YOK (finalize ayrı, manuel).
- Saf ticari matematik: `sponsorship/billing-core.ts` (SAF, prisma yok). Testler: `vitest`; `sponsorship-billing-core.test.ts`
  (saf unit), `sponsorship-routes.test.ts` (Fastify + in-memory `SponsorshipData` double). **Settlement DB katmanının DB
  entegrasyon testi YOK** — canlı doğrulama (bölüm 11) bu boşluğu kapatır.

### 1.5 Ham event tabloları (retention hedefleri)

| Tablo | Domain | Anlam | storeId | createdAt idx | Silinebilir? |
|---|---|---|---|---|---|
| `SponsoredProductEvent` (3826) | sponsored | funnel ham (IMPRESSION/CLICK/CART), KVKK-hash'li | ✓ | `@@index([storeId, createdAt])` | **EVET** (raw) |
| `AttributionClick` (3652) | influencer | ham click, KVKK-hash'li | ✓ | `@@index([storeId, createdAt])` | **EVET** (raw) |
| `OrderSponsoredAttribution` (3854) | sponsored | sipariş finans snapshot | ✓ | — | HAYIR (korunur) |
| `OrderSponsoredAttributionRefund` (3885) | sponsored | append-only iade defteri | — | — | HAYIR |
| `OrderAttribution` (3682) | influencer | sipariş finans snapshot | ✓ | — | HAYIR (korunur) |
| `OrderAttributionRefund` (3718) | influencer | append-only iade defteri | — | — | HAYIR |
| `SponsorshipSettlement/Charge/Payment/AdvanceAllocation/Agreement` | billing | finans | ✓ | — | HAYIR |

- **Orphan riski YOK:** `SponsoredProductEvent` ve `AttributionClick` yaprak (leaf) tablolar — hiçbir tablo bunlara FK ile
  bağlanmaz. Finans snapshot'ları (`OrderAttribution`, `OrderSponsoredAttribution`) sipariş anında türetilir, click/event
  satırına FK YOKTUR → ham satır silinince finans etkilenmez.
- Her ikisinde de `@@index([storeId, createdAt])` mevcut → `storeId + createdAt < cutoff` sorgusu index-backed.
  **Retention için ek index migration GEREKMEZ** (canlı doğrulamada `EXPLAIN` ile teyit edilecek).

### 1.6 Timezone otoritesi

- **Store-seviyesi timezone alanı YOK.** Şemada `timezone` yalnız `SponsoredProductCampaign.timezone @default("Europe/Istanbul")`
  üzerinde (yalnız admin görüntü bağlamı; aktiflik UTC — ADR-119). `Store`/`StoreSettings`'te timezone yok.
- Settlement dönem sınırları "store timezone'a göre" isteniyor → **additive `StoreSettings.timezone String @default("Europe/Istanbul")`
  eklenecek** (otorite = StoreSettings; satır yoksa/boşsa sabit fallback "Europe/Istanbul"). Tarih kütüphanesi (luxon/date-fns)
  YOK → timezone matematiği `Intl.DateTimeFormat` ile saf helper olarak yazılacak.

### 1.7 API / auth

- Sponsorship uçları store-admin yüzeyi: `/stores/:storeId/...` + `requireStoreAdmin` guard (server.ts'te
  `requireStorePlatformAdmin` closure'ı → platform SUPER_ADMIN/SUPPORT_ADMIN + store varlık kontrolü). Public uç YOK.
- Route katmanı yalnız doğrular/serialize/audit; tüm iş `data.ts`/`billing-core.ts`'te. Tutar/scope istemciden otorite değil.

### 1.8 Store-admin UI

- `apps/store-admin-web` (Next.js 15 App Router). Yerel "dark glass" UI kit: `components/ui/index.tsx`
  (`StatCard`/`SectionCard`/`Button` danger/`Modal` onay/`Alert`). Paylaşılan `@commerce-os/ui`'ye DOKUNULMAZ.
- BFF iki-hop: tarayıcı → same-origin `/api/*` (`lib/client/api.ts` `storeApi`, CSRF `mutatingCall`) → route handler
  (`requireStoreContext` + `isValidCsrfRequest`) → `@commerce-os/api-client` `admin.*`. Bearer token httpOnly cookie'de kalır.
- Ayrı "operations/system" alanı YOK; en yakın ev `/settings`. Yeni küçük `/operations` sayfası + yerel nav etiketi eklenecek.

---

## 2. Uygulama planı (özet)

Yeni dizin: `apps/api-gateway/src/commercial-automation/` (settlement scheduler sponsorship domain'i tüketir; retention
sponsored + influencer'a dokunur → nötr ev).

| Dosya | Sorumluluk | Test |
|---|---|---|
| `timezone.ts` | `Intl` tabanlı SAF TZ helper (zoned parts, gün/hafta/ay sınırı → UTC) | unit |
| `settlement-schedule-core.ts` | SAF: weekly/monthly/campaign-end dönem hesabı + uygunluk yüklemi | unit (boundary, DST, kapalı-dönem) |
| `settlement-scheduler-service.ts` | DB orkestrasyon (port + prisma persistence), `data.previewSettlement` reuse, per-agreement error isolation, per-store QueueJobLog | in-memory double |
| `settlement-scheduler-worker.ts` | setTimeout döngü (reconcile-worker deseni) | worker no-op/overlap |
| `retention-core.ts` | SAF: cutoff hesabı + tablo bazında plan + circuit-breaker kararı | unit |
| `retention-service.ts` | DB orkestrasyon: dry-run count / apply batch-delete + store scope + env guard + QueueJobLog | double |
| `retention-worker.ts` | setTimeout döngü | worker no-op |
| `job-log.ts` | `QueueJobLog` lifecycle (startJobRun→finishJobRun / recordSkippedLockedRun / latest) | double üzerinden |
| `advisory-lock.ts` | **DAĞITIK** `(jobType,storeId)` PG advisory lock (ayrılmış connection_limit=1) + ikincil in-memory guard | çoklu-instance smoke |
| `routes.ts` | manuel `run`/`retention` (dryRun bayrağı) + `status`; store-admin guard; kilitliyse 409 JOB_ALREADY_RUNNING | routes test |

**Pre-ship hardening (ADR-136 revize):** overlap kilidi process-local `withJobLock`'tan **dağıtık PostgreSQL
advisory lock**'a taşındı (session-level, ayrılmış tek bağlantı, crash-safe, per-(jobType,storeId)). Süreç-içi
guard yalnız ikincil. Çoklu-instance smoke (iki bağımsız lock manager = iki replica) ile doğrulandı: aynı
store+job paralel → biri SKIPPED_LOCKED, duplicate DRAFT/çift-silme YOK; farklı store/job paralel; manuel vs
scheduled dışlanır. Job log durumları: STARTED/COMPLETED/PARTIAL_SUCCESS/FAILED/SKIPPED_LOCKED/DRY_RUN.

**Migration (tek, additive):** `StoreSettings.timezone`. `SponsorshipAgreement.settlementPeriod` zaten mevcut → agreement
alanı eklenmez. `QueueJobLog` zaten mevcut → job audit için migration yok. Retention index'leri zaten mevcut → yok.

**Config env (yeni):**
- `SETTLEMENT_SCHEDULER_ENABLED` (false), `_INTERVAL_SECONDS` (default 3600, min 60), `_BATCH_SIZE`.
- `ATTRIBUTION_RETENTION_ENABLED` (false), `_INTERVAL_SECONDS` (default 86400, min 3600), `_BATCH_SIZE` (default 1000),
  `SPONSORED_EVENT_RETENTION_DAYS` (default 180, min 30 floor), `INFLUENCER_CLICK_RETENTION_DAYS` (default 180, min 30),
  `ATTRIBUTION_RETENTION_MAX_DELETE_PER_RUN` (circuit breaker, default 200000).
- `COMMERCIAL_AUTOMATION_DEFAULT_TIMEZONE` (default "Europe/Istanbul").

**Güvenlik duruşu:** dry-run varsayılan; apply explicit; cutoff/scope SUNUCU otoritesi (istemci gönderemez); store scope her
delete'te zorunlu; global unscoped `deleteMany({})` YASAK; circuit-breaker; env-flag gate; QueueJobLog + AuditLog izi.

**ADR (yeni, ADR-130'dan itibaren):** settlement scheduling policy · DRAFT-only automation · timezone period authority
(StoreSettings) · retention scope (raw-only, finans korunur) · financial record preservation · purge safety (dry-run/apply/
scope/circuit-breaker/env-guard) · overlap & idempotency modeli.
