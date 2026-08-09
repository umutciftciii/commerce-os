# tests/e2e

Playwright E2E regression suite (TODO-176). Full guide: [`docs/TESTING.md`](../../docs/TESTING.md).
Decision record: [ADR-287](../../docs/adr/ADR-287-playwright-e2e-release-gate.md).

## Quickstart (local)

Bring up the shared docker stack (postgres/redis/api-gateway/worker), then:

```
pnpm db:seed-e2e          # seed the isolated e2e-store fixture (idempotent)
pnpm e2e:storefront        # separate terminal: host `next dev --port 3100` serving worktree code
pnpm e2e:smoke              # runs setup (real UI login) then the @smoke project
```

Report: `pnpm e2e:report`. Cleanup: `pnpm db:cleanup-e2e` (prefix-scoped, `APP_ENV`-guarded — never
runs against production). See `docs/TESTING.md` for the full env-var reference, CI wiring, fixture
details, and the flakiness policy.
