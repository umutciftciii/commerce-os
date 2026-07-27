#!/usr/bin/env zsh
# PB-2 — `db:restore-enterprise` DEPRECATION köprüsü.
#
# Bu komut GERÇEK bir restore DEĞİLDİR: enterprise-demo demo kataloğunu deterministik olarak YENİDEN SEED
# eder (gerçek sipariş/müşteri/ödeme verisini kurtarmaz). Yanıltıcı ada sahip olduğu için `db:reseed-enterprise`
# olarak yeniden adlandırıldı. Gerçek felaket kurtarma için:  pnpm db:restore -- --file <backup> --target-url <url>
# Bkz. docs/runbooks/database-backup-restore.md.
set -euo pipefail

print -u2 -- ""
print -u2 -- "⚠️  DEPRECATION: 'db:restore-enterprise' bir RESTORE DEĞİLDİR — demo veriyi yeniden seed eder."
print -u2 -- "    Yeni ad: 'pnpm db:reseed-enterprise'. Gerçek DB restore: 'pnpm db:restore -- --file ... --target-url ...'"
print -u2 -- "    (docs/runbooks/database-backup-restore.md)"
print -u2 -- ""

exec pnpm db:reseed-enterprise
