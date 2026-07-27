# Runbook — Database Backup, Restore & Offsite Disaster Recovery (PB-2 / PB-3)

> Kapsam: **tam veritabanı (full logical)** backup/restore + client-side şifreleme + offsite object storage +
> retention + doğrulanmış restore. Bu, `db:reseed-enterprise` (demo veriyi yeniden üreten seed) ile
> KARIŞTIRILMAMALIDIR — o gerçek işlem verisini kurtarmaz. ADR-159…166.

## 0. TL;DR komutları

```bash
# Manuel gerçek backup (encrypt + offsite + manifest + remote doğrulama)
pnpm db:backup:run                 # insan-okur özet
pnpm db:backup:run -- --json       # makine-okur
pnpm db:backup:run -- --dry-run    # yalnız plan + config doğrulama (üretmez)

# Retention (VARSAYILAN dry-run; gerçek silme --apply ile)
pnpm db:backup:retention
pnpm db:backup:retention -- --apply --include-local

# GERÇEK restore (yıkıcı; guard'lı) — İZOLE hedefe
pnpm db:restore -- --object-key <env>-<ts>.dump.enc --target-url <ISOLATED_URL> --confirm-destructive

# Restore doğrulama (izole hedefte gerçek restore + bütünlük)
pnpm db:verify-restore -- --object-key <...>.dump.enc --target-url <ISOLATED_URL> --confirm-destructive --manifest <...>.manifest.json

# Uçtan uca izole DR tatbikatı (MinIO + boş postgres; source'a dokunmaz)
./infra/scripts/dr-smoke.zsh
```

## 1. Mimari özet

| Bileşen | Karar |
|---|---|
| Backup formatı | `pg_dump -Fc` (custom, sıkıştırılmış) → `<env>-<UTC-timestamp>.dump.enc` + `.sha256` + `.manifest.json` (ADR-159) |
| Şifreleme | Client-side **AES-256-GCM** (Node crypto, streaming); **envelope** `MAGIC\|VERSION\|KEYID\|NONCE\|CT\|TAG` (version+keyId taşır, rotation-hazır); ayrı domain anahtarı `DATABASE_BACKUP_ENCRYPTION_KEY` (TAM 32 byte), fallback YOK → **fail-closed** (ADR-160, ADR-169) |
| Offsite | S3-uyumlu (AWS S3 / R2 / B2 / MinIO), **AWS SDK v3** (bounded retry + timeout), **private ACL**, upload sonrası remote HEAD + sha256, **https-only** (prod'da HTTP reddedilir) (ADR-161, ADR-168) |
| Manifest bütünlüğü | **HMAC-SHA256** (encryption anahtarından türetilmiş MAC key); kurcalanma → restore/verify reddeder; cross-environment guard (ADR-169) |
| Retention | GFS: günlük 14 / haftalık 8 / aylık 12; en-yeni asla purge edilmez; dry-run; local↔remote parity (ADR-162) |
| Scheduler | **apps/worker** BullMQ Job Scheduler (`DATABASE_BACKUP_ENABLED`; api-gateway'den TAŞINDI); advisory lock, QueueJobLog; api-gateway yalnız enqueue eder (ADR-167) |
| Restore | Gerçek `pg_restore`; checksum + decrypt + hedef guard + boş-şema reset; **CLI/runbook-only, UI YOK** (ADR-165) |
| Doğrulama | İzole hedefte restore + migrate status + tablo/integrity + bilinen fixture (ADR-163) |
| RPO / RTO | Hedef RPO ≤ 24s / RTO ≤ 4s (garanti değil; ölçüm ayrı — §7) (ADR-164) |

Manifest secret İÇERMEZ; backup **PII içerir** (`dataClassification: CONTAINS_PII`) → offsite bucket private,
şifreli, erişim kısıtlı olmalı.

## 2. Yapılandırma (production)

`.env` (bkz. `.env.example` DR bloğu). Production için **zorunlu**lar:

```bash
DATABASE_BACKUP_ENABLED=true
DATABASE_BACKUP_ENCRYPTION_KEY=<32-byte base64/hex — repo DIŞI, backup ile AYNI storage'da TUTMA>
DATABASE_BACKUP_S3_BUCKET=<private-bucket>
DATABASE_BACKUP_S3_ENDPOINT=<provider endpoint | AWS için boş>
DATABASE_BACKUP_S3_ACCESS_KEY_ID=<...>
DATABASE_BACKUP_S3_SECRET_ACCESS_KEY=<...>
DATABASE_BACKUP_S3_REGION=<...>
# pg araçları: api-gateway imajında postgresql16-client kuruludur → direct mod DATABASE_URL'e ağ üzerinden.
DATABASE_BACKUP_PG_MODE=direct
```

**Kurallar:**
- Anahtar YOKSA production backup **fail-closed** (şifresiz üretmez).
- Offsite YOKSA production backup **başarısız** sayılır (`OFFSITE_REQUIRED`) — yalnız-local production kabul edilmez.
- Encryption key'i backup'larla **aynı** object storage'da saklama (aksi halde şifreleme anlamsız).
- Bucket **versioning** açıksa yanlışlıkla silme/üzerine yazmaya karşı ek koruma sağlar (öneri).
- Bucket **lifecycle** politikası: uygulama retention'ı offsite'ta siler; ek olarak provider lifecycle
  (ör. glacier geçişi) tanımlanabilir — uygulama retention'ıyla ÇAKIŞMAYACAK şekilde (uygulama en-yeni'yi korur).

## 3. Zamanlanmış backup (apps/worker)

`DATABASE_BACKUP_ENABLED=true` → **apps/worker** süreci bir BullMQ **Job Scheduler** (`upsertBackupSchedule`, sabit
id → idempotent) kaydeder; periyodik tur (varsayılan günlük; `DATABASE_BACKUP_INTERVAL_SECONDS` ya da
`DATABASE_BACKUP_CRON`) worker'da çalışır. **api-gateway'de backup zamanlayıcı YOKTUR** → API deploy/restart backup
takvimini ETKİLEMEZ (zamanlama Redis'te, yürütme worker'da). Worker restart PARALEL timer üretmez (setTimeout zinciri
sorunu ortadan kalktı). Backup ana API request akışında ÇALIŞMAZ. Dağıtık advisory lock manuel/scheduled + çok-replika
çakışmasını çözer (kilit alınamazsa `SKIPPED_LOCKED`). Job sırası (spec §7): advisory lock → STARTED → dump →
non-zero/validate → encrypt → checksum → manifest(imzalı) → upload → remote HEAD → COMPLETED → retention → cleanup →
lock release. Upload/HEAD başarısızsa COMPLETED sayılmaz. Her tur `QueueJobLog`'a yazılır; job başında önceki
`lastSuccessfulBackupAt` gözlemlenir (RPO-gap).

Görünürlük (api-gateway; internal-token guard'lı; BFF INTERNAL_API_TOKEN ekler):
```
GET  /internal/backup/health   # HEALTHY/DEGRADED → 200 ; CRITICAL/NOT_CONFIGURED → 503
GET  /internal/backup/status    # health + son çalışmalar + retention + RPO/RTO
POST /internal/backup/run       # WORKER'a enqueue (202); VARSAYILAN dry-run; gerçek backup {"dryRun": false}
```
Manuel restore ucu **yoktur** (yanlışlıkla prod ezilmesini engellemek için restore yalnız CLI/runbook).

## 4. Restore prosedürü (felaket anı)

> **UYARI:** Restore YIKICIDIR — hedef şemayı sıfırlar. Varsayılan olarak **mevcut/production DB'nin üzerine
> restore YAPILMAZ** (guard). Önce yeni/izole bir DB hazırla.

1. Restore edilecek backup'ı seç (offsite `list` ya da health `lastSuccessfulBackupBase`).
2. Manifest'i indir/aç → `dump.checksumSha256`, `migration.latest` teyit.
3. **İzole/yeni** bir PostgreSQL hedefi hazırla (boş DB). Production'ı geri getiriyorsan yeni bir instance kur,
   uygulamayı DB'ye bağlamadan önce restore et.
4. Restore:
   ```bash
   pnpm db:restore -- \
     --object-key <env>-<ts>.dump.enc \
     --target-url postgresql://user:pass@<NEW_HOST>:5432/<db> \
     --confirm-destructive \
     --expected-checksum <hex-manifest'ten>
   ```
   - Checksum uyuşmazlığı / decrypt hatası → restore YAPILMAZ (fail-closed).
   - Hedef **production-benzeri** ise ek onay gerekir: `--allow-production-target --confirm-production-restore`.
   - Hedef süreç DATABASE_URL'i ile aynıysa reddedilir (`--allow-restore-over-current` ile bilinçli override).
5. `--json` çıktısındaki `timings.restoreMs` = ölçülen RTO bileşeni.
6. Migration durumunu doğrula: `prisma migrate status` (hedef DATABASE_URL ile) → "up to date".
7. Uygulama katmanını yeni DB'ye yönlendir.

## 5. Restore doğrulama (periyodik zorunlu)

İzole geçici PostgreSQL hedefinde gerçek restore + bütünlük:
```bash
pnpm db:verify-restore -- \
  --object-key <...>.dump.enc \
  --target-url postgresql://user:pass@<ISOLATED>:5432/<db> \
  --confirm-destructive \
  --manifest <...>.manifest.json --json
```
Doğrular: checksum, decrypt, restore, migrate status (manifest `migration.latest` ile eşleşme), kritik tablolar
(Store/Product/ProductVariant/InventoryItem/Customer/Order/OrderLine/PaymentAttempt/HomeSection/SponsorshipAgreement/
`_prisma_migrations`), referential integrity (orphan yok). `ok:false` → restore güvenilmez.

Otomatik: `DATABASE_BACKUP_VERIFY_AFTER=true` + `DATABASE_BACKUP_VERIFY_TARGET_URL=<izole hedef>` → her
zamanlanmış backup'tan sonra doğrulama koşar (izole hedef DB provizyonu gerekir — TD-141).

## 6. Uçtan uca DR tatbikatı (izole)

```bash
./infra/scripts/dr-smoke.zsh          # DATA-path: backup→encrypt→MinIO→boş DB restore→integrity
./infra/scripts/dr-worker-smoke.zsh   # WORKER-path: gerçek worker job → COMPLETED + offsite + SKIPPED_LOCKED
```
- **dr-smoke.zsh**: izole source+target postgres + MinIO; fixture → gerçek backup → encrypt → upload → remote
  checksum → boş postgres → download → decrypt → restore → migrate status → **fixture ilişkileri** → read-only
  smoke → süre ölçümü → temizlik. Gerçek dev/prod DB'ye dokunmaz.
- **dr-worker-smoke.zsh** (spec §11): redis + MinIO + izole postgres + **gerçek apps/worker süreci**. Manuel job
  enqueue → worker işler → `QueueJobLog` STARTED→COMPLETED (api-gateway ÇALIŞMADAN) + offsite obje; advisory lock
  tutulurken tetik → `SKIPPED_LOCKED`; BullMQ Job Scheduler Redis'te kayıtlı + api-gateway'de scheduler yok
  (restart takvimi etkilemez).

Her ikisi CI-dışı; docker gerektirir.

## 7. RPO / RTO

| Ölçüt | Hedef | Ölçülen (izole DR smoke, taze-şema DB ~0.5 MB şifreli) |
|---|---|---|
| RPO | ≤ 24 saat (günlük backup) | backup aralığına bağlı (varsayılan 24s) |
| RTO | ≤ 4 saat | restore ~1.1 sn + verification; büyük production DB'de dump/upload/restore boyutla ölçeklenir |
| Backup süresi | — | ~0.57 sn (dump 310ms + encrypt 3ms + upload 36ms) |
| Backup boyutu | — | 466 KB (şifreli, custom-format) |

> Bunlar HEDEF ve KÜÇÜK-DB ölçümüdür — production boyutunda RTO/backup süresi veri hacmiyle büyür. Gerçek
> production restore tatbikatıyla yeniden ölçülmelidir.

## 8. Güvenlik

- DB URL / storage secret / encryption key ASLA log/manifest/argv'de görünmez (parola PG* env ile geçer, argv değil).
- Backup **private** (public ACL asla gönderilmez). Temp dosya izinleri 0600; temp cleanup `finally`.
- Kullanıcı verdiği file/path güvenli normalize; komutlar `spawn` arg-array (shell interpolation yok → injection engeli).
- Backup PII içerir → offsite bucket erişimi kısıtlı, şifreli, denetimli olmalı.

## 9. Sağlık & alerting

- `GET /internal/backup/health` → `status` (HEALTHY/DEGRADED/CRITICAL/NOT_CONFIGURED) + `backupAgeHours`.
  CRITICAL/NOT_CONFIGURED → HTTP 503 (readiness sondası bağlanabilir).
- Backup yapılandırılmamış **production** → `NOT_CONFIGURED` (kritik).
- Başarısız backup / RPO aşımı → job `QueueJobLog`'a `FAILED` yazar + health `DEGRADED/CRITICAL`. Mail/alerting
  altyapısı platform-genelinde yok (M-7); minimum bildirim = health endpoint + job log (izleme sondası buradan okur).

## 10. Sorun giderme

| Belirti | Neden / Çözüm |
|---|---|
| `ENCRYPTION_KEY_MISSING` | `DATABASE_BACKUP_ENCRYPTION_KEY` yok/geçersiz (32 byte base64/hex). |
| `OFFSITE_REQUIRED` | Production'da S3 env'leri eksik. |
| `REMOTE_CHECKSUM_MISMATCH`/`REMOTE_SIZE_MISMATCH` | Upload bozuldu → job FAILED; tekrar dene / provider'ı kontrol et. |
| `DECRYPT_FAILED` (restore) | Yanlış anahtar ya da bozuk/kurcalanmış artefakt. |
| `PRODUCTION_TARGET_BLOCKED` | Hedef prod-benzeri → `--allow-production-target --confirm-production-restore`. |
| `SAME_AS_CURRENT_DB_BLOCKED` | Hedef mevcut DATABASE_URL ile aynı → yeni/izole hedef kullan. |
| pg_dump `command not found` (direct) | İmajda `postgresql16-client` yok (node.Dockerfile). Ya da `DATABASE_BACKUP_PG_MODE=docker`. |

## 11. Kapsam dışı (future capability — ADR-159)

Point-in-time recovery (WAL archiving), streaming replication, multi-region active-active, tenant-level
selective restore, Kubernetes operator, `media-data` volume backup (yalnız Postgres yedeklenir — TD-140).
