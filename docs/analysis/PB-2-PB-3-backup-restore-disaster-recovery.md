# PB-2 + PB-3 — Backup, Restore & Offsite Disaster Recovery (Mevcut Durum Analizi)

- **Tarih:** 2026-07-27
- **Kapsam:** Launch blocker PB-2 (test edilmiş gerçek DB restore yolu yok) + PB-3 (backup manuel/
  zamanlanmamış/tek-host/offsite-siz). Bu doküman yalnız **mevcut durum + karar zemini**; implementasyon
  ayrı bölümlerde (kod + test + canlı DR smoke + runbook) ele alınır.
- **Yöntem:** `claude/backup-restore-disaster-recovery-53105b` worktree'sinde 3 paralel salt-okunur kod
  keşfi (backup/seed script'leri · scheduler/worker/QueueJobLog · docker/env/secrets) + doğrudan kaynak
  doğrulama. Her load-bearing iddia dokümana değil **koda** karşı doğrulandı.

---

## 1. Yönetici özeti

Platformda **gerçek bir `pg_dump` backup'ı VAR** ama tek bir shell script'iyle sınırlı: elle çalıştırılır,
zamanlanmamış, tek-host, offsite kopya yok, şifreleme yok, rotasyon yok, ve **backup'ı geri yükleyen test
edilmiş bir yol yok**. `db:restore-enterprise` adı yanıltıcıdır: gerçek bir restore değil, enterprise-demo
kataloğunu deterministik olarak **yeniden seed** eder — gerçek sipariş/müşteri/ödeme verisini kurtarmaz.

Sonuç: ilk gerçek merchant verisi girdiği andan itibaren host kaybı hem DB'yi hem backup'ı kaybettirir ve
kurtarma yolu kanıtlanmamıştır. Bu, launch-readiness denetiminde PB-2 + PB-3 (PROD BLOCKER / DR kümesi,
TD-135) olarak işaretlidir.

---

## 2. Spec sorularına net yanıtlar

| Soru | Cevap |
|---|---|
| **Hangi komut gerçek `pg_dump` alıyor?** | Yalnız `pnpm db:backup` → `infra/scripts/db-backup.zsh:22` → `docker exec docker-postgres-1 pg_dump -U … -d … \| gzip > infra/backups/<db>-<label>-<stamp>.sql.gz`. Gerçek, çalışan, plain-SQL + gzip. |
| **Hangi komut yalnız demo re-seed yapıyor?** | `pnpm db:restore-enterprise` (`package.json:30`) = `db:backup && db:seed-enterprise && db:backfill-enterprise && db:verify-enterprise`. Bir dump okumaz; enterprise-demo dataset'ini **kod tarafından yeniden üretir** (ADR-085 deterministik seed). Gerçek işlem verisi bu yolla geri gelmez. |
| **Backup host kaybında korunuyor mu?** | **Hayır.** Çıktı `infra/backups/` — Postgres container'ıyla aynı yerel diskte. Offsite/object-storage kopya yok. Host kaybı → hem DB hem backup kaybı. |
| **Backup şifreli mi?** | **Hayır.** `pg_dump \| gzip` düz gzip; at-rest şifreleme yok. (Provider credential'ları DB içinde AES-256-GCM ile şifreli ama DB dump'ının kendisi değil.) |
| **Restore hiç gerçek dump ile denenmiş mi?** | **Hayır (otomatik/tatbik edilmiş biçimde).** Tek `pg_restore` kullanımı `docs/OPERATIONS.md:689-690`'da bir kereye mahsus `_prisma_migrations` baseline operasyonunda `pg_restore --list` (yalnız TOC listeler — restore değil). Uçtan uca "boş DB'ye gerçek restore + doğrulama" tatbikatı yapılmamış; restore runbook'u yok. |
| **RPO/RTO tanımlı mı?** | **Hayır.** Hiçbir dokümanda hedef RPO/RTO yok. |
| **Backup bütünlüğü nasıl doğrulanıyor?** | Yalnız `du -h` ile boyut ekrana yazılıyor (`db-backup.zsh:24`). Checksum yok, restore-test yok, manifest yok. |

---

## 3. Mevcut varlıklar (reuse edilecek desenler)

Yeni altyapıyı sıfırdan kurmak yerine kanıtlanmış proje desenleri reuse edilecek:

- **Zamanlanmış iş deseni** — `apps/api-gateway/src/main.ts`'te başlatılan, env-gate'li (`optionalBooleanEnv(false)`),
  `setTimeout` zinciri + süreç-içi `running` guard'lı worker'lar (ör. `settlement-scheduler-worker.ts`,
  `shipping/sync-worker.ts`). Backup scheduler bu deseni birebir izleyecek. (BullMQ `apps/worker` yalnız
  event-driven; repeatable/cron YOK.)
- **Dağıtık advisory lock** — `apps/api-gateway/src/commercial-automation/advisory-lock.ts`:
  `pg_try_advisory_lock(hashtext(jobType), hashtext(storeId))`, `connection_limit=1` ayrılmış session,
  session-level (transaction değil), crash-safe. Backup için `jobType="database-backup"`, `storeId=<environment>`
  anahtarıyla per-environment paralel-backup engelleme.
- **QueueJobLog job-run audit** — `apps/api-gateway/src/commercial-automation/job-log.ts`: enum
  (`PENDING/PROCESSING/COMPLETED/FAILED/RETRYING`) + ince durum `payload.outcome`
  (`STARTED/COMPLETED/SKIPPED_LOCKED/DRY_RUN/FAILED/PARTIAL_SUCCESS`). Yeni tablo/migration GEREKMEZ.
- **Fail-closed AES-256-GCM** — `apps/api-gateway/src/shipping/encryption.ts`: env anahtarı (base64/hex),
  fallback YOK, anahtar yoksa `CONFIG_MISSING`. Backup şifrelemesi aynı ilkeyi izler ama **streaming**
  (büyük dosya) biçiminde, **ayrı domain anahtarı** (`DATABASE_BACKUP_ENCRYPTION_KEY`) ile.
- **Config redaction** — `packages/config/src/index.ts` `ConfigValidationError`: env DEĞERLERİ asla loglanmaz.
  Manifest/loglarda aynı disiplin (DB URL/secret asla yazılmaz).
- **Güvenli reset guard'ları** — `packages/db/scripts/enterprise/safety.mjs`: prod-marker + host allowlist +
  circuit breaker + explicit flag deseni. Restore hedef guard'ı (prod'a yanlışlıkla restore engeli) bu
  deseni yansıtacak.
- **Config env normalizasyonu** — `packages/config/src/env.ts` `optionalEnv/optionalBooleanEnv/optionalNumberEnv`
  (TD-036). Tüm yeni backup env'leri boş-string toleranslı olacak.

## 4. Ortam gerçekleri (implementasyonu kısıtlayan)

- Postgres: **`postgres:16-alpine`** (docker-compose). `pg_dump`/`pg_restore`/`psql` yalnız postgres imajının
  içinde var. **node imajı (`node:22-alpine`) pg client İÇERMEZ** → scheduler pg araçlarını ya container'a
  eklenerek (direct mode, DATABASE_URL üzerinden ağ) ya da `docker exec/run postgres:16-alpine` ile çalıştırmalı.
  Sürüm uyumu: dump/restore aynı major (16) ile yapılmalı.
- Object storage yok: hiçbir S3/MinIO/bucket env'i yok; `@aws-sdk/*` bağımlılığı repoda yok. S3 uyumlu adapter
  ya SDK eklenerek ya da **SigV4 (HMAC-SHA256, node:crypto — belgelenmiş AWS protokolü, özel kripto DEĞİL)**
  ile fetch üzerinden kurulacak.
- Tek env şablonu (`.env.example`); prod/staging şablonu yok (ADR-019: prod image/K8s kapsam dışı).
- `infra/backups/` gitignored; host-only.
- `docker` + `postgres:16-alpine pg_dump` + Node AES-256-GCM bu ortamda çalışır → canlı DR smoke (MinIO +
  izole postgres container) yapılabilir.

## 5. Boşluk → çözüm haritası (bu iş paketi)

| Boşluk | Çözüm |
|---|---|
| Şifreleme yok | Streaming AES-256-GCM, ayrı domain anahtarı, fail-closed. |
| Offsite yok | S3-uyumlu storage adapter (endpoint/bucket/region/key/secret + prefix); upload + remote HEAD/checksum doğrulaması; public ACL yasak. |
| Zamanlama yok | `database-backup` scheduler worker (env-gate'li, advisory lock, QueueJobLog). |
| Test edilmiş restore yok | Gerçek `db:restore` CLI (checksum + decrypt + boş/reset hedef + restore + migrate status + integrity) + izole restore-verification. |
| Retention yok | GFS (günlük 14 / haftalık 8 / aylık 12), en-yeni-korunur, min-guard, dry-run, local↔remote parity. |
| Bütünlük doğrulama yok | Checksum + manifest + archive/list validation + remote HEAD + periyodik restore-test. |
| RPO/RTO yok | Doküman: hedef RPO ≤ 24s / RTO ≤ 4s + smoke'ta ölçülen gerçek süreler (garanti değil, hedef+ölçüm ayrı). |
| Demo≠restore karışıklığı | `db:restore-enterprise` → `db:reseed-enterprise` (deprecation köprüsü); demo seed asla "restore" olarak raporlanmaz. |
| Sağlık görünürlüğü yok | Backup health özeti (`lastSuccessfulBackupAt/lastVerifiedRestoreAt/backupAgeHours/status`) + operations UI. |

## 6. Kapsam sınırı (bu faz DIŞI — future capability)

Point-in-time recovery (WAL archiving), streaming replication, multi-region active-active, tenant-level
selective restore, Kubernetes operator. Bunlar runbook + DECISIONS'ta "future capability" olarak belgelenir;
bu faz **tam veritabanı (full logical) backup/restore + offsite + doğrulama** ile sınırlıdır.

## 7. PB-2 / PB-3 kapanış kriteri

- **PB-2** (restore yolu): gerçek `db:restore` CLI + izole restore-verification + tatbik edilmiş runbook +
  canlı boş-DB restore smoke geçerse **CLOSED**.
- **PB-3** (offsite/otomatik): scheduler + retention + S3 adapter kod+test tamam **VE** production offsite
  storage gerçekten yapılandırılmış + en az bir remote backup doğrulanmışsa **CLOSED**. Yalnız MinIO/local
  adapter smoke varsa **PB-3 OPEN / IMPLEMENTED-BUT-NOT-CONFIGURED** kalır (durum olduğundan iyi gösterilmez).
