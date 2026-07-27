#!/usr/bin/env zsh
# PB-2/PB-3 — Canlı Disaster Recovery smoke (izole stack + MinIO offsite).
#
# Gerçek ama İZOLE stack üzerinde uçtan uca DR kanıtı (spec §18): fixture → gerçek pg_dump → encrypt →
# MinIO upload → remote checksum → BOŞ postgres → download → decrypt → restore → migrate status →
# fixture ilişkileri → read-only smoke → süre ölçümü → temizlik. SOURCE dev/prod DB'ye DOKUNMAZ
# (kendi izole source container'ını kurar). Runbook: docs/runbooks/database-backup-restore.md.
#
# Gereksinim: docker + repo kökünden çalıştırma. Kullanım:  ./infra/scripts/dr-smoke.zsh
set -euo pipefail
cd "$(dirname "$0")/../.."
ROOT="$PWD"

NET=pb-dr-net
SRC=pb-dr-src; TGT=pb-dr-tgt; MINIO=pb-dr-minio
PGUSER=commerce_os; PGPW=pb_dr_pw; PGDB=commerce_os
SRC_HOSTPORT=55432; MINIO_PORT=59000
BUCKET=dr-backups; AKID=drminio; SECRET=drminiosecret123
KEY="$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")"
WORKDIR="$(mktemp -d)"
PG_IMAGE=postgres:16-alpine

pass() { print -- "  ✅ $1"; }
fail() { print -u2 -- "  ❌ $1"; exit 1; }
step() { print -- "\n▶ $1"; }

cleanup() {
  step "Temizlik"
  docker rm -f "$SRC" "$TGT" "$MINIO" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
  rm -rf "$WORKDIR"
  pass "container/network/temp temizlendi"
}
trap cleanup EXIT

wait_pg() { # $1=container
  for i in {1..40}; do
    docker exec "$1" pg_isready -U "$PGUSER" -d "$PGDB" >/dev/null 2>&1 && return 0
    sleep 1
  done
  fail "postgres hazır olmadı: $1"
}

step "İzole stack kur (network + MinIO + source/target postgres)"
docker network create "$NET" >/dev/null
docker run -d --name "$MINIO" --network "$NET" -p "${MINIO_PORT}:9000" \
  -e MINIO_ROOT_USER="$AKID" -e MINIO_ROOT_PASSWORD="$SECRET" \
  minio/minio server /data >/dev/null
docker run -d --name "$SRC" --network "$NET" -p "${SRC_HOSTPORT}:5432" \
  -e POSTGRES_USER="$PGUSER" -e POSTGRES_PASSWORD="$PGPW" -e POSTGRES_DB="$PGDB" "$PG_IMAGE" >/dev/null
docker run -d --name "$TGT" --network "$NET" \
  -e POSTGRES_USER="$PGUSER" -e POSTGRES_PASSWORD="$PGPW" -e POSTGRES_DB="$PGDB" "$PG_IMAGE" >/dev/null
wait_pg "$SRC"; wait_pg "$TGT"
pass "source + target postgres hazır"

# MinIO bucket
for i in {1..30}; do
  docker run --rm --network "$NET" --entrypoint sh minio/mc -c \
    "mc alias set m http://${MINIO}:9000 ${AKID} ${SECRET} && mc mb -p m/${BUCKET}" >/dev/null 2>&1 && break
  sleep 1
done
pass "MinIO bucket hazır: ${BUCKET}"

step "Source DB migrate (host prisma) + fixture"
DATABASE_URL="postgresql://${PGUSER}:${PGPW}@localhost:${SRC_HOSTPORT}/${PGDB}" \
  pnpm exec prisma migrate deploy --schema packages/db/prisma/schema.prisma >/dev/null
DATABASE_URL="postgresql://${PGUSER}:${PGPW}@localhost:${SRC_HOSTPORT}/${PGDB}" \
  node packages/db/scripts/dr-fixture.mjs
pass "migration + bağlı fixture yazıldı"

# ── Ortak DR ortamı (docker-mode pg over $NET; offsite=MinIO via host port) ──
export DATABASE_BACKUP_ENCRYPTION_KEY="$KEY"
export DATABASE_BACKUP_PG_MODE=docker
export DATABASE_BACKUP_PG_NETWORK="$NET"
export DATABASE_BACKUP_PG_IMAGE="$PG_IMAGE"
export DATABASE_BACKUP_ENVIRONMENT=dr-smoke
export DATABASE_BACKUP_LOCAL_DIR="${WORKDIR}/backups"
export DATABASE_BACKUP_S3_BUCKET="$BUCKET"
export DATABASE_BACKUP_S3_ENDPOINT="http://localhost:${MINIO_PORT}"
export DATABASE_BACKUP_S3_ACCESS_KEY_ID="$AKID"
export DATABASE_BACKUP_S3_SECRET_ACCESS_KEY="$SECRET"
export DATABASE_BACKUP_S3_REGION=us-east-1
export DATABASE_BACKUP_S3_FORCE_PATH_STYLE=true
export DATABASE_BACKUP_S3_ALLOW_INSECURE=true  # yalnız local MinIO (http); production'da https zorunlu
export DATABASE_BACKUP_MIGRATIONS_DIR="${ROOT}/packages/db/prisma/migrations"
export LOG_LEVEL=error  # CLI --json çıktısı stdout'ta tek başına olsun (info logları bastır)

step "Gerçek backup (pg_dump → encrypt → MinIO upload → remote HEAD doğrulama)"
DATABASE_URL="postgresql://${PGUSER}:${PGPW}@${SRC}:5432/${PGDB}" \
  pnpm -s db:backup:run -- --json > "${WORKDIR}/backup.json"
cat "${WORKDIR}/backup.json"
BASE="$(node -e "console.log(require('${WORKDIR}/backup.json').base)")"
REMOTE_VERIFIED="$(node -e "console.log(require('${WORKDIR}/backup.json').remoteVerified)")"
BK_MS="$(node -e "console.log(require('${WORKDIR}/backup.json').durationMs)")"
[[ "$REMOTE_VERIFIED" == "true" ]] || fail "remote HEAD doğrulaması geçmedi"
pass "backup COMPLETED + remote doğrulandı (base=${BASE}, ${BK_MS}ms)"

# MinIO'da objenin gerçekten var olduğunu bağımsız doğrula (mc).
docker run --rm --network "$NET" --entrypoint sh minio/mc -c \
  "mc alias set m http://${MINIO}:9000 ${AKID} ${SECRET} >/dev/null && mc stat m/${BUCKET}/${BASE}.dump.enc" >/dev/null \
  && pass "offsite obje MinIO'da mevcut (bağımsız mc doğrulaması)" || fail "offsite obje MinIO'da yok"

step "Boş target'a restore + verification (download → checksum → decrypt → restore → migrate status → integrity)"
TGT_URL="postgresql://${PGUSER}:${PGPW}@${TGT}:5432/${PGDB}"
DATABASE_URL="postgresql://${PGUSER}:${PGPW}@${SRC}:5432/${PGDB}" \
  pnpm -s db:verify-restore -- \
    --object-key "${BASE}.dump.enc" \
    --target-url "$TGT_URL" \
    --confirm-destructive \
    --manifest "${WORKDIR}/backups/${BASE}.manifest.json" \
    --json > "${WORKDIR}/verify.json"
cat "${WORKDIR}/verify.json"
VERIFY_OK="$(node -e "console.log(require('${WORKDIR}/verify.json').ok)")"
RS_MS="$(node -e "console.log(require('${WORKDIR}/verify.json').restoreDurationMs)")"
[[ "$VERIFY_OK" == "true" ]] || fail "restore verification başarısız"
pass "restore + genel doğrulama OK (${RS_MS}ms)"

step "Fixture ilişkileri + read-only smoke (restored target üzerinde)"
q() { docker run --rm --network "$NET" -e PGPASSWORD="$PGPW" "$PG_IMAGE" \
  psql -h "$TGT" -U "$PGUSER" -d "$PGDB" -tAqc "$1" | tr -d '[:space:]'; }
[[ "$(q "SELECT count(*) FROM \"Order\" WHERE \"orderNumber\"='PB-DR-1001'")" == "1" ]] || fail "order fixture yok"
pass "Order PB-DR-1001 mevcut"
[[ "$(q "SELECT count(*) FROM \"OrderLine\" ol JOIN \"Order\" o ON ol.\"orderId\"=o.id WHERE o.\"orderNumber\"='PB-DR-1001'")" == "1" ]] || fail "orderLine→order ilişkisi yok"
pass "OrderLine→Order ilişkisi korundu"
[[ "$(q "SELECT count(*) FROM \"PaymentAttempt\" WHERE \"orderId\"='pb-dr-order'")" == "1" ]] || fail "paymentAttempt yok"
pass "PaymentAttempt→Order ilişkisi korundu"
[[ "$(q "SELECT \"quantityOnHand\" FROM \"InventoryItem\" WHERE \"variantId\"='pb-dr-variant'")" == "42" ]] || fail "inventory değeri korunmadı"
pass "InventoryItem.quantityOnHand=42 korundu"
[[ "$(q "SELECT count(*) FROM \"_prisma_migrations\" WHERE finished_at IS NOT NULL")" -gt 0 ]] || fail "migration history boş"
pass "migration history restore edildi"

step "Source DB'ye dokunulmadığını doğrula"
qs() { docker run --rm --network "$NET" -e PGPASSWORD="$PGPW" "$PG_IMAGE" \
  psql -h "$SRC" -U "$PGUSER" -d "$PGDB" -tAqc "$1" | tr -d '[:space:]'; }
[[ "$(qs "SELECT count(*) FROM \"Order\" WHERE \"orderNumber\"='PB-DR-1001'")" == "1" ]] || fail "source fixture değişti!"
pass "source fixture bozulmadan duruyor (restore yalnız target'a yazdı)"

print -- "\n──────────────────────────────────────────────"
print -- "✅ DR SMOKE PASS"
print -- "   backup base:        ${BASE}"
print -- "   backup süresi:      ${BK_MS} ms"
print -- "   restore süresi:     ${RS_MS} ms"
print -- "   offsite:            MinIO s3://${BUCKET} (remote HEAD+checksum doğrulandı)"
print -- "   encryption:         AES-256-GCM (client-side)"
print -- "──────────────────────────────────────────────"
