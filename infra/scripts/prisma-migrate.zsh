#!/usr/bin/env zsh
set -euo pipefail

env -i \
  PATH="$PATH" \
  HOME="$HOME" \
  TMPDIR="${TMPDIR:-/tmp}" \
  DEBUG='prisma:migrate:*' \
  pnpm exec prisma migrate deploy --schema packages/db/prisma/schema.prisma
