#!/usr/bin/env zsh
# ADR-108 — Backup guard. Yıkıcı bir seed/reset ÖNCESİNDE çalışan postgres'in tam
# pg_dump'ını sıkıştırılmış olarak infra/backups/ altına alır. Enterprise demo reset
# runbook'unun zorunlu ilk adımıdır (bkz. docs/OPERATIONS.md).
#
# NOT (PB-2/PB-3): Bu yalnız YEREL, ŞİFRESİZ, OFFSITE-SİZ bir pre-reseed güvenlik anlık-görüntüsüdür
# (dev). Production felaket kurtarma için ŞİFRELİ + OFFSITE + manifest'li DR pipeline'ını kullan:
#   pnpm db:backup:run          (encrypt + S3 upload + remote HEAD doğrulama + manifest)
#   pnpm db:restore -- ...      (checksum + decrypt + hedef-guard + restore)
# Bkz. docs/runbooks/database-backup-restore.md.
#
# Kullanım:  ./infra/scripts/db-backup.zsh [etiket]
#   etiket   dosya adına eklenir (varsayılan: manual)
set -euo pipefail

CONTAINER="${POSTGRES_CONTAINER:-docker-postgres-1}"
DB_USER="${POSTGRES_USER:-commerce_os}"
DB_NAME="${POSTGRES_DB:-commerce_os}"
LABEL="${1:-manual}"

# Determinizm için tarih damgasını host saatinden al (script kabuk düzeyinde çalışır).
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="$(cd "$(dirname "$0")/../backups" 2>/dev/null && pwd || echo "$(dirname "$0")/../backups")"
mkdir -p "$OUT_DIR"
OUT="$OUT_DIR/${DB_NAME}-${LABEL}-${STAMP}.sql.gz"

echo "[db-backup] container=$CONTAINER db=$DB_NAME -> $OUT"
docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" | gzip > "$OUT"

SIZE="$(du -h "$OUT" | cut -f1)"
echo "[db-backup] OK — $OUT ($SIZE)"
