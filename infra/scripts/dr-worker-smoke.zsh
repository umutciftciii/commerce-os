#!/usr/bin/env zsh
# PB-2/PB-3 — Worker-tetikli DR smoke (spec §11): backup zamanlaması + yürütmesi apps/worker'da olduğunu kanıtlar.
#
# İZOLE stack (redis + MinIO + source/target postgres + gerçek worker süreci). Kanıtlar:
#  1. Manuel job kuyruğa konur → WORKER işler → QueueJobLog STARTED→COMPLETED (api-gateway ÇALIŞMADAN).
#  2. Encrypted object offsite'a (MinIO) yüklenir + bağımsız doğrulanır.
#  3. Advisory lock tutulurken tetiklenen tur → SKIPPED_LOCKED (çok-replika/paralel duplicate engeli).
#  4. BullMQ Job Scheduler Redis'te kayıtlı → api-gateway restart takvimi ETKİLEMEZ (gateway'de scheduler YOK).
# Runbook: docs/runbooks/database-backup-restore.md.
set -euo pipefail
cd "$(dirname "$0")/../.."
ROOT="$PWD"

NET=pbw-dr-net
SRC=pbw-src; TGT=pbw-tgt; MINIO=pbw-minio; REDIS=pbw-redis; LOCKC=pbw-lock
PGUSER=commerce_os; PGPW=pbw_dr_pw; PGDB=commerce_os
SRC_HOSTPORT=55442; MINIO_PORT=59010; REDIS_PORT=63790
BUCKET=dr-backups; AKID=drminio; SECRET=drminiosecret123
KEY="$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")"
WORKDIR="$(mktemp -d)"
PG_IMAGE=postgres:16-alpine
ENVIRONMENT=dr-worker
WORKER_PID=""

pass() { print -- "  ✅ $1"; }
fail() { print -u2 -- "  ❌ $1"; exit 1; }
step() { print -- "\n▶ $1"; }

cleanup() {
  step "Temizlik"
  [[ -n "$WORKER_PID" ]] && kill "$WORKER_PID" 2>/dev/null || true
  docker rm -f "$SRC" "$TGT" "$MINIO" "$REDIS" "$LOCKC" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
  rm -rf "$WORKDIR"
  pass "worker/container/network/temp temizlendi"
}
trap cleanup EXIT

wait_pg() { for i in {1..40}; do docker exec "$1" pg_isready -U "$PGUSER" -d "$PGDB" >/dev/null 2>&1 && return 0; sleep 1; done; fail "postgres hazır olmadı: $1"; }

step "İzole stack (redis + MinIO + source/target postgres)"
docker network create "$NET" >/dev/null
docker run -d --name "$REDIS" --network "$NET" -p "${REDIS_PORT}:6379" redis:7-alpine >/dev/null
docker run -d --name "$MINIO" --network "$NET" -p "${MINIO_PORT}:9000" -e MINIO_ROOT_USER="$AKID" -e MINIO_ROOT_PASSWORD="$SECRET" minio/minio server /data >/dev/null
docker run -d --name "$SRC" --network "$NET" -p "${SRC_HOSTPORT}:5432" -e POSTGRES_USER="$PGUSER" -e POSTGRES_PASSWORD="$PGPW" -e POSTGRES_DB="$PGDB" "$PG_IMAGE" >/dev/null
docker run -d --name "$TGT" --network "$NET" -e POSTGRES_USER="$PGUSER" -e POSTGRES_PASSWORD="$PGPW" -e POSTGRES_DB="$PGDB" "$PG_IMAGE" >/dev/null
wait_pg "$SRC"; wait_pg "$TGT"
for i in {1..30}; do docker run --rm --network "$NET" --entrypoint sh minio/mc -c "mc alias set m http://${MINIO}:9000 ${AKID} ${SECRET} && mc mb -p m/${BUCKET}" >/dev/null 2>&1 && break; sleep 1; done
pass "stack hazır (redis + MinIO + postgres x2)"

step "Source migrate + fixture"
DATABASE_URL="postgresql://${PGUSER}:${PGPW}@localhost:${SRC_HOSTPORT}/${PGDB}" pnpm exec prisma migrate deploy --schema packages/db/prisma/schema.prisma >/dev/null
DATABASE_URL="postgresql://${PGUSER}:${PGPW}@localhost:${SRC_HOSTPORT}/${PGDB}" node packages/db/scripts/dr-fixture.mjs
pass "migration + fixture"

# Worker env: prisma/jobLog → host localhost; pg_dump (docker) → container-network SOURCE_URL.
export SERVICE_NAME=worker
export DATABASE_URL="postgresql://${PGUSER}:${PGPW}@localhost:${SRC_HOSTPORT}/${PGDB}"
export DATABASE_BACKUP_SOURCE_URL="postgresql://${PGUSER}:${PGPW}@${SRC}:5432/${PGDB}"
export REDIS_URL="redis://localhost:${REDIS_PORT}"
export INTERNAL_API_TOKEN="dr-worker-internal-token"
export SESSION_SECRET="dr-worker-session-secret-000000000000"
export DATABASE_BACKUP_ENABLED=true
export DATABASE_BACKUP_INTERVAL_SECONDS=3600   # uzak → auto-fire smoke sırasında olmaz; manuel tetikleriz
export DATABASE_BACKUP_ENVIRONMENT="$ENVIRONMENT"
export DATABASE_BACKUP_ENCRYPTION_KEY="$KEY"
export DATABASE_BACKUP_PG_MODE=docker
export DATABASE_BACKUP_PG_NETWORK="$NET"
export DATABASE_BACKUP_PG_IMAGE="$PG_IMAGE"
export DATABASE_BACKUP_LOCAL_DIR="${WORKDIR}/backups"
export DATABASE_BACKUP_MIGRATIONS_DIR="${ROOT}/packages/db/prisma/migrations"
export DATABASE_BACKUP_S3_BUCKET="$BUCKET"
export DATABASE_BACKUP_S3_ENDPOINT="http://localhost:${MINIO_PORT}"
export DATABASE_BACKUP_S3_ACCESS_KEY_ID="$AKID"
export DATABASE_BACKUP_S3_SECRET_ACCESS_KEY="$SECRET"
export DATABASE_BACKUP_S3_REGION=us-east-1
export DATABASE_BACKUP_S3_FORCE_PATH_STYLE=true
export DATABASE_BACKUP_S3_ALLOW_INSECURE=true
export LOG_LEVEL=info

step "Gerçek worker sürecini başlat (apps/worker; BullMQ backup queue + scheduler)"
pnpm exec tsx apps/worker/src/main.ts > "${WORKDIR}/worker.log" 2>&1 &
WORKER_PID=$!
for i in {1..60}; do grep -q "database backup worker started" "${WORKDIR}/worker.log" 2>/dev/null && break; sleep 1; kill -0 "$WORKER_PID" 2>/dev/null || fail "worker öldü:\n$(cat ${WORKDIR}/worker.log)"; done
grep -q "database backup worker started" "${WORKDIR}/worker.log" || fail "worker backup dongusu baslamadi:\n$(cat ${WORKDIR}/worker.log)"
pass "worker çalışıyor (backup queue tüketiyor)"

# Job scheduler Redis'te kayıtlı mı? (api-gateway restart bunu etkilemez — gateway'de scheduler yok.)
SCHED="$(node infra/scripts/dr-check-schedule.mjs)"
[[ "$SCHED" -ge 1 ]] && pass "BullMQ Job Scheduler Redis'te kayıtlı (schedulers=$SCHED)" || fail "scheduler kaydı yok"
grep -rqE "startDatabaseBackupWorker|upsertBackupSchedule|startBackupWorker" apps/api-gateway/src \
  && fail "api-gateway backup scheduler başlatıyor (olmamalı)" \
  || pass "api-gateway backup scheduler İÇERMEZ (restart takvimi etkilemez — architectural)"

step "Manuel backup job → WORKER işler → QueueJobLog COMPLETED"
JOBID="$(node infra/scripts/dr-enqueue.mjs)"
pass "job kuyruğa kondu (jobId=$JOBID)"
qsrc() { docker run --rm --network "$NET" -e PGPASSWORD="$PGPW" "$PG_IMAGE" psql -h "$SRC" -U "$PGUSER" -d "$PGDB" -tAqc "$1" | tr -d '[:space:]'; }
COMPLETED=0
for i in {1..90}; do
  C="$(qsrc "SELECT count(*) FROM \"QueueJobLog\" WHERE \"jobName\"='database-backup' AND \"queueName\"='database-backup' AND payload->>'outcome'='COMPLETED'")"
  [[ "$C" -ge 1 ]] && { COMPLETED=1; break; }; sleep 1
done
[[ "$COMPLETED" == "1" ]] || fail "worker COMPLETED üretmedi:\n$(tail -20 ${WORKDIR}/worker.log)"
pass "QueueJobLog: STARTED→COMPLETED (worker-tetikli, api-gateway ÇALIŞMADAN)"
BASE="$(qsrc "SELECT payload->>'base' FROM \"QueueJobLog\" WHERE payload->>'outcome'='COMPLETED' ORDER BY \"createdAt\" DESC LIMIT 1")"
docker run --rm --network "$NET" --entrypoint sh minio/mc -c "mc alias set m http://${MINIO}:9000 ${AKID} ${SECRET} >/dev/null && mc stat m/${BUCKET}/${BASE}.dump.enc" >/dev/null \
  && pass "encrypted object offsite'ta (MinIO): ${BASE}.dump.enc" || fail "offsite obje yok"

step "Advisory lock tutulurken tetik → SKIPPED_LOCKED"
# Source DB'de (worker'ın jobLog+lock DB'si) advisory lock'u tut (session lock; sleep ile açık kalır).
docker run -d --name "$LOCKC" --network "$NET" -e PGPASSWORD="$PGPW" "$PG_IMAGE" \
  psql -h "$SRC" -U "$PGUSER" -d "$PGDB" -tAqc \
  "SELECT pg_advisory_lock(hashtext('database-backup')::int4, hashtext('${ENVIRONMENT}')::int4); SELECT pg_sleep(45);" >/dev/null
sleep 3
node infra/scripts/dr-enqueue.mjs >/dev/null
SKIPPED=0
for i in {1..60}; do
  S="$(qsrc "SELECT count(*) FROM \"QueueJobLog\" WHERE payload->>'outcome'='SKIPPED_LOCKED'")"
  [[ "$S" -ge 1 ]] && { SKIPPED=1; break; }; sleep 1
done
[[ "$SKIPPED" == "1" ]] || fail "SKIPPED_LOCKED üretilmedi:\n$(tail -20 ${WORKDIR}/worker.log)"
pass "kilit tutulurken tetiklenen tur SKIPPED_LOCKED (paralel duplicate engellendi)"

print -- "\n──────────────────────────────────────────────"
print -- "✅ WORKER DR SMOKE PASS"
print -- "   worker-tetikli backup:   COMPLETED (base=${BASE})"
print -- "   offsite:                 MinIO s3://${BUCKET} (obje doğrulandı)"
print -- "   parallel lock:           SKIPPED_LOCKED"
print -- "   schedule:                Redis Job Scheduler (gateway'de scheduler YOK)"
print -- "──────────────────────────────────────────────"
