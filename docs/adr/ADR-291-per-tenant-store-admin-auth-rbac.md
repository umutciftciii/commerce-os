# ADR-291 — Per-Tenant Store Admin Authentication & RBAC

- **Status:** IMPLEMENTED & GATE GREEN (2026-08-15). PR #216 merged (`2d3fff8`); CI required checks
  (`lint · test · build` 7m0s + `smoke` 6m38s — store-admin real-login Playwright **16 passed** on the docker
  branch stack, admin/platform/storefront smoke green) GREEN; docker enterprise stack rebuilt (api-gateway +
  store-admin-web only; storefront/admin-web/worker/postgres/redis untouched) + `prisma migrate deploy`
  idempotent (no pending; identity migration already live); **post-deploy runtime smoke GREEN** (deployed
  :4000, real StoreUser OWNER `enterprise-demo`): login/session/**extend rotation** (new≠old token, absolute
  unchanged, old→401, new→200)/logout · wrong-pw→401 · cross-store own→200/wrong→404 · PlatformUser token →
  store session/extend → 401 (no bridge; platform auth unaffected) · LOGIN AuditLog `actorKind=STORE_USER`,
  `platformUserId` NULL. No new session policy (ADR-271 reuse); additive-only identity foundation migration
  `20260811231121_store_user_identity_foundation` (session rotation needs no new migration); no `TD-AUTH-002`
  migration; Impersonation (Phase 1.5) remains FUTURE.
- **Date:** 2026-08-11 (Phase B) … 2026-08-15 (Phase G)
- **Builds on:** ADR-271 (Unified Session Policy — idle+absolute+remember-me+extend rotation+warning+multi-tab;
  `packages/config` platform-owned policy), ADR-287 (Playwright E2E = source-of-truth release gate),
  ADR-290/289 (isolated gateway module shape, STORE_USER audit actor precedent), TD-019 (the pre-existing
  reality this ADR retires: "Store Admin = `PlatformUser`").
- **Scope tag:** Per-Tenant Store Admin Auth + RBAC (Phases B–G).

## Context

Before this work, the Store Admin console (`apps/store-admin-web`) authenticated as a **`PlatformUser`**
(the fleet/platform operator identity) and selected the active store via a server env
(`STORE_ADMIN_DEMO_STORE_SLUG`) plus a "first/demo store" fallback (TD-019). Three structural problems:

1. **Wrong identity.** A store's staff logged in as a *platform* user. There was no per-tenant store
   identity, no per-store roles, and audit rows attributed store actions to a platform actor.
2. **Client-influenced tenant.** An earlier iteration resolved the tenant from a request header
   (`x-store-admin-tenant`). The gateway is not network-isolated (docker publishes `4000:4000`, no
   ingress), so an arbitrary caller could spoof the header and target a victim store.
3. **Silent fallback.** "First store / demo store" selection meant a misconfiguration could silently bind
   the console to the wrong tenant.

The goal: a **first-class per-tenant Store Admin identity** with real roles, a server-authoritative tenant,
fail-closed everywhere, and **no** dual-auth or PlatformUser fallback on the normal path — while preserving
the small set of genuinely **platform-owned** surfaces that must stay Platform-Admin-guarded.

## Decisions

### 1. PlatformUser vs StoreUser boundary
Two distinct identities, two distinct session tables, no bridge:
- **`PlatformUser` / `PlatformSession`** — the fleet operator (admin-web): `/admin/*` fleet management,
  theme library/binding, platform question-set management, the platform side of Platform Requests.
- **`StoreUser` / `StoreUserSession`** — a tenant's staff (store-admin-web): all store business routes.

The store-admin normal path contains **no** PlatformUser login, PlatformSession, `auth.platform*`,
`requireStorePlatformAdmin`/`requirePlatformAdmin`, `STORE_ADMIN_DEMO_STORE_SLUG`, first/demo-store
fallback, or client-controlled tenant selection (verified by static audit §"Auth cleanup", below).

### 2. StoreUserSession (ADR-271 model, per-tenant)
`StoreUserSession` mirrors `PlatformSession`/`CustomerSession`: opaque random token, gateway stores only
`sha256(token · SESSION_SECRET)` (plaintext token never persisted), two-gate validity
(`!revoked && now ≤ min(idle, absolute)`), `rememberMe`, `policyVersion` (legacy grandfathering),
`rotatedFromSessionId` (rotation chain). Cookie `commerce_os_store_admin_session`, httpOnly, name distinct
from admin-web so the two consoles never collide.

### 3. Server-side tenant resolver (Option A)
The login tenant is resolved **only** from server-side deployment config
(`STORE_ADMIN_STORE_SLUG`, `packages/config`). No request header, host, or body field (`storeSlug`/`storeId`)
can select the tenant. `storeAdminLoginRequestSchema` carries `{ email, password, rememberMe }` only — the
client cannot name a tenant. Undefined config → resolver returns null → login fails closed (generic 401).
This is **Phase 1**: a single-store deployment resolver (one app instance pinned to one store). Host/subdomain
resolution is a reserved abstraction (`resolveStoreAdminTenantContext`) for a future multi-store deployment.

### 4. `session.storeId` is authority
Once authenticated, the active store is **the store the session is bound to** — never listed, never
selected. `/auth/store/session` returns a server-authoritative `store { id, slug, name, status }` derived
from the session. The BFF's `/api/store/context` reads only this (no `admin.stores.list`, no first/demo
selection). A path `:storeId` that mismatches `session.storeId` → 404 `STORE_ACCESS_DENIED` (tenant-leak-free).

### 5. Explicit OWNER provisioning (no heuristic)
Native/first store OWNERs are provisioned from an **explicit manifest** (`scripts/provision-store-owners.ts`,
`--dry-run` default / `--apply`): `storeSlug|storeId → ownerEmail`. Unmapped-ACTIVE / unknown / duplicate →
`applicable=false`; existing `PlatformUser` password hash is reused (login-ready + link) else `INVITED`;
`DISABLED` → conflict. **No** heuristic "pick a user" path. Production cutover HARD gate: a real
owner-mapping manifest must exist; local/demo mapping is never accepted as a production owner (see
`docs/OPERATIONS.md`).

### 6. No dual-auth / no fallback
Business routes are guarded by `requireStoreUser` / `requireStorePermission` (StoreUser session only).
There is **no** PlatformUser fallback and **no** identity-bridge: a PlatformUser token is not present in
`StoreUserSession` → 401. A native (unlinked, null-email) StoreUser session is invalid → 401 (never emits an
`email:""` sentinel).

### 7. Role matrix (RBAC)
Five roles — `OWNER, ADMIN, MANAGER, STAFF, VIEWER` — over a typed permission set
(`packages/auth/permissions.ts`). `hasStorePermission` is fail-closed (unknown role/permission → false).
`resolveStorePermission(module, action)` maps a route family+method to a permission. Sensitive permissions
(`refunds:manage`, `shopping-balance:manage`, `settings:manage`, revenue-sensitive `finance:*`) are
restricted (e.g. VIEWER = read-only across the board; STAFF/VIEWER excluded from finance).

### 8. Capability AND RBAC
A store route is allowed only if **both** hold: the store's **capability/module** is enabled
(`MODULE_DISABLED` → 403 when off) **and** the actor's **role** grants the permission (`FORBIDDEN` → 403).
Capability gates *what the store bought*; RBAC gates *what this user may do*.

### 9. Inactive store / user fail-closed
Login and every subsequent validation require an **ACTIVE** store: `SUSPENDED/CLOSED/DRAFT` → deny (folded
into the generic 401 — no enumeration). A `DISABLED` StoreUser cannot use an existing session. All failure
reasons (config missing, unknown store/email, INVITED/DISABLED, null hash, wrong password, non-ACTIVE store)
collapse to one generic `INVALID_CREDENTIALS` 401; failed attempts write no audit row.

### 10. StoreUser audit actors
`AuditLog` gained a dual-actor shape: store actions record `actorKind=STORE_USER` + `actorStoreUserId`
(`platformUserId` NULL). Domain scalar `…PlatformUserId` fields (OrderRefund/OrderEvent/assignee/…) now carry
StoreUser ids where the actor is a StoreUser (the names are legacy — see TD-AUTH-002). The only hard
`PlatformUser` FK is `AuditLog.platformUserId`, which store actions leave NULL.

### 11. Session rotation / ADR-271 parity (Phase F)
`POST /auth/store/extend` rotates the token exactly like `rotatePlatformSession`/customer `rotateSession`:
one `$transaction` revokes the old row (`updateMany where revokedAt:null` → count 0 = single canonical winner,
no resurrection) and creates a successor (`rotatedFromSessionId`). The **absolute cap never extends**; idle is
renewed; concurrent extend yields exactly one success (loser + replayed old token → 401, never retry-masked).
STORE_USER audit `UPDATE`/`SESSION_EXTEND`. The BFF replaces the httpOnly cookie atomically with the new
token; the shared `SessionGuard` (warning modal + countdown + extend/logout + server-authoritative reconcile +
BroadcastChannel multi-tab) drives the UX from `session.timing` (single source of truth — no duplicate timers).
No new session policy is introduced.

### 12. Platform-owned route separation (explicit, retained)
The following stay Platform-Admin-guarded **by design** and are out of scope for the StoreUser cutover:
- `requireStorePlatformAdmin` → Theme & Brand **theme-binding** assignment (`server.ts:8881`).
- `requirePlatformAdmin` → `/admin/plans*` and `/admin/stores*` (fleet management), Product Support
  **platform question-set** management, and the **platform side** of Platform Requests (admin-web inbox).
These are Platform Admin (admin-web) surfaces, never exposed to a StoreUser.

## Auth cleanup — static audit (Phase G §11)

Normal Store Admin path is **clean** — none of the following appear:
`PlatformUser login`, `PlatformSession`, `requireStorePlatformAdmin`/`requirePlatformAdmin`, `auth.platform*`,
`STORE_ADMIN_DEMO_STORE_SLUG`, first-store/demo fallback, client-controlled tenant selection. The only legacy
guards remaining are the explicit platform-owned surfaces in Decision 12 (each justified above).

## Testing (source-of-truth ladder)
- **Gateway integration (authoritative for auth/RBAC/tenant):** store-auth authenticate/data/routes/guard +
  `store-rbac.integration` (role matrix + tenant isolation + STORE_USER audit) + `/auth/store/extend` suite
  (rotation/replay/absolute-unchanged/expired/revoked/DISABLED/SUSPENDED+CLOSED/rememberMe/PlatformUser-401/
  concurrent single-winner). Run1+Run2.
- **BFF unit:** store-auth cutover (login/session/logout/extend rotation + atomic cookie replace).
- **Component:** `SessionGuard` (warning/extend/logout/expiry/reconcile/multi-tab).
- **Browser (Playwright `@store-admin-auth`, required gate):** real StoreUser login (OWNER + VIEWER),
  identity/shell/context, canonical smoke + controlled mutation, PlatformUser-login-deny, VIEWER manage→403,
  session lifecycle (extend/rotation/logout). Structural cross-tenant isolation is asserted at the gateway
  integration layer (store-admin routes derive `storeId` from the session — there is no client-selectable
  `:storeId` attack surface to exercise in the browser).

## Consequences

**Positive:** correct per-tenant identity + real roles; server-authoritative tenant (no spoof surface);
fail-closed inactive store/user; auditable STORE_USER actor; ADR-271-parity session lifecycle; no dual-auth.

**Neutral / FUTURE (tracked in `docs/TECHNICAL_DEBT.md`):**
- **TD-AUTH-002** — legacy `…PlatformUserId`-named scalar actor fields now carry StoreUser ids (safe: no FK;
  correct actor). Rename/model migration deferred (not migrated in this scope).
- **Phase 1.5 — explicit, audited impersonation** (a Platform operator acting *as* a store, clearly attributed)
  is FUTURE. Not built here.
- **Multi-store host/subdomain tenant resolver** — FUTURE (Phase 1 is single-store deployment).
- **Structural Tenant Isolation / Postgres RLS** — a separate future initiative (defense-in-depth beyond the
  application-layer `storeId` scoping enforced today).
- Minor: the extend rate-limit map is shared with the platform extend limiter (`ip:sessionId`; cuid collision
  is not credible — safe); isolating it is an optional minor.

## Implementation arc
Phase B (store-auth login/logout/session + tenant trust boundary) → C (RBAC guard foundation) →
D (OWNER provisioning + native readiness + Store.status policy) → E1 (BFF cutover) / E2 (gateway route+RBAC
cutover + audit-actor conversion) → **F** (session lifecycle UX + `/auth/store/extend` rotation + final
cleanup) → **G** (Playwright real-login E2E + docs/ADR + gates + ship).
