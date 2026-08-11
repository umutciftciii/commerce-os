# ADR-290 — Store → Platform Request & Task Management (Faz 1)

- **Status:** IMPLEMENTED & GATE GREEN (Faz A–G; 2026-08-12). PR #214 merged `cea3c53`; CI required
  checks (`lint · test · build` + `smoke`) GREEN; docker enterprise stack rebuilt (api-gateway +
  store-admin-web + admin-web) + `migrate deploy` idempotent; post-deploy runtime smoke GREEN (schema
  7 tables + 5 active categories, gateway routes auth-gated 401, UI routes 307). Additive schema (7 model +
  `PlatformRequestAttachment` + 8 enum + `MediaContext.PLATFORM_REQUEST_ATTACHMENT`) + 2 additive migration +
  new isolated `apps/api-gateway/src/platform-requests/` module + store-admin request surface + admin-web
  operational inbox + cross-app Playwright regression. **Product Support (TODO-177/ADR-289) is NOT touched**
  — pattern reuse only; no `Support*` table/enum/route is shared. Full local gate (unit/integration
  Run1+Run2 + component + typecheck/lint/build + additive migration parity) GREEN; Playwright cross-app
  `@platform-smoke`/`@platform-regression` (repeat-each=3 → 17/17) GREEN. Debt: TD-178-1/2/3/7 FUTURE,
  TD-178-4/5/6 RESOLVED (bkz. `docs/TECHNICAL_DEBT.md`).
- **Date:** 2026-08-11
- **Builds on:** ADR-289 (Product Support — isolated `apps/api-gateway/src/<domain>/` module shape,
  honest `UNCONFIGURED` notification stub, private auth-gated attachments, version-guarded transitions,
  serialize projection discipline), ADR-287 (Playwright E2E = source-of-truth release gate), ADR-065
  (media pipeline sharp/webp + `StorageDriver` + private `/media/*` segment guard), ADR-271
  (`packages/config` platform-owned policy pattern), ADR-090 (shared admin selectors), ADR-089 (Admin
  Data Grid), TD-019 (Store Admin = `PlatformUser` — current auth reality).
- **Scope tag:** TODO-178

## Context

Stores (Store Admin) periodically need the **platform operator** to intervene on matters a tenant cannot
self-serve: taxonomy/category requests, platform content or policy questions, configuration changes,
operational escalations. Before TODO-178 there was **no store→platform channel** — only the reverse-shaped
Product Support (customer→store, ADR-289) and internal admin case tooling. The two are structurally
different actors and must not be conflated:

- **Product Support (ADR-289):** customer → store; storefront guided flow; store-admin inbox.
- **Platform Request (this ADR):** store → platform; store-admin request surface; **admin-web** (global
  platform console) operational inbox.

Product Support is a **pattern template only** — its lifecycle/serialize/attachment/notification shapes are
reused, but **zero** `Support*` models, enums, routes, or DTOs are shared. A store request and a support
ticket never touch the same table.

## Decisions

1. **Domain boundary — store → platform.** Store Admin opens/tracks requests; Platform Admin triages and
   operates. The store surface (`apps/store-admin-web`) and the platform surface (`apps/admin-web`) are
   distinct apps with distinct auth cookies. Serialization uses **separate allowlist projections** per
   surface — the platform DTO is never reused on the store side.

2. **Separation from Product Support.** No `Support*` table/enum/route/DTO is shared. Reuse is limited to
   design patterns (module shape, version guard, honest notification, private attachments).

3. **Global request number `PR-000001`.** Numbers are **globally** unique (not per-store), issued by a
   singleton `PlatformRequestNumberCounter` (id=`global`) under an advisory lock. This gives the platform
   operator a single stable cross-tenant reference.

4. **Platform-managed taxonomy.** Category is a first-class `PlatformRequestCategory` table (not an enum,
   not a form-engine). Categories are platform-owned, bilingual (`labelTr`/`labelEn`), and toggled active.
   Store create reads only **active** categories; taxonomy writes require SUPER_ADMIN.

5. **Lifecycle `OPEN → TRIAGED → IN_PROGRESS ↔ WAITING_STORE → RESOLVED → CLOSED`.** There is **no
   CANCELLED status** — terminal outcomes are captured by `closeReason` (COMPLETED / WITHDRAWN_BY_STORE /
   NOT_ACTIONABLE / DUPLICATE / REJECTED). Reopen is only via `reopenRequest` within a **7-day inclusive,
   server-authoritative** window; reopen restarts a fresh SLA cycle. Transitions are optimistic-`version`
   guarded (409 `VERSION_CONFLICT`).

6. **`storeImpact` advisory; priority platform-owned.** The store may declare `storeImpact`
   (LOW/MEDIUM/HIGH) as an advisory hint; it does **not** set or influence `priority`. Priority
   (LOW/NORMAL/URGENT…) is platform-owned and only mutable by the platform surface
   (`deriveInitialPriority` is test-locked to ignore `storeImpact` authority).

7. **STORE_VISIBLE vs INTERNAL — hard boundary.** Messages, notes, and attachments carry a `visibility`.
   INTERNAL content (platform-internal notes/replies/attachments) **never** reaches the store surface —
   not the body, not metadata, not counts, not the audit timeline, not the attachment stream (store serve
   of an INTERNAL id returns 404 even when the id is known). Enforced structurally: the store DTO has no
   `visibility` field at all, and the store timeline projection drops message/internal events entirely.

8. **Current category vs immutable filed snapshot (TD-178-4).** Operational category is always the CURRENT
   `category` relation (recategorize reflects everywhere — inbox column, filter, detail, SLA). The
   original `categoryKey`/`categoryLabel` snapshot is audit-only (`filedCategory`, platform detail).

9. **Bilingual taxonomy snapshot (TD-178-5).** `PlatformRequest.categoryLabel` (TR) + `categoryLabelEn`;
   category refs are `{key, labelTr, labelEn}`. No raw enum/key/UUID is ever rendered in either UI.

10. **SLA live-cycle / reopen.** SLA state (first-response, resolution) is derived over the **live** cycle
    (ACTIVE + unresolved). Resolved cycles do not produce false-positive overdue; reopen starts a fresh
    live cycle. SLA is surfaced as human-readable labels only (no raw state enum leaks).

11. **Private attachments — single-step, request-scoped.** Upload is one canonical request-scoped step
    (`messageId` null = request-level), `sharp → webp` for photos, PDF as-is; stored via the ADR-065
    `StorageDriver` under a private `platform-requests` segment with an auth-gated serve. Store uploads are
    forced STORE_VISIBLE; platform uploads validate visibility server-side. DTOs expose only
    `{id, type, createdAt}` (store) — never raw `storageKey`/`mediaAssetId`. `MediaAsset` delete is
    blocked while referenced (`onDelete: Restrict` → `MEDIA_IN_USE`).

12. **Honest `UNCONFIGURED` notification.** The dispatcher never fabricates a "SENT" success while
    unconfigured and never throws into the request path (post-commit best-effort). Assignment notifies the
    store (`REQUEST_ASSIGNED`); INTERNAL notes never produce a store notification. No real email provider
    is written (FUTURE).

13. **Current `PlatformUser`-backed Store Admin auth is accepted (TD-019).** Store Admin authenticates as a
    `PlatformUser` today; TODO-178 does **not** invent new tenant-auth/RBAC. Assignee is a scalar
    `assigneePlatformUserId` (not an FK), `"me"` sentinel supported; there is no store-side assignment.

14. **Faz 2 tenant-auth/RBAC dependency (TD-178-1).** A proper tenant-identity bridge (store users distinct
    from platform users, per-tenant RBAC) is deferred; the creator identity is stored forward-compatibly
    (`createdByActorKind` PLATFORM_USER today → STORE_USER later + actor id + name/email snapshot).

15. **Playwright = source-of-truth (ADR-287).** Cross-app store-admin ↔ admin-web coverage is a permanent
    automated browser gate: canonical lifecycle in `@platform-smoke` (PR-required), plus
    visibility/attachment/assignment/SLA/reopen in `@platform-regression` (nightly). admin-web enters E2E
    for the first time (dedicated `admin-web-e2e` service + platform-admin login setup).

16. **Phase 1 scope boundaries.** In scope: request CRUD + lifecycle + taxonomy + visibility + SLA +
    attachments + honest notification + cross-app UI. Out of scope (FUTURE): message-linked attachments
    (TD-178-7), real email provider, tenant-auth bridge (TD-178-1), SLA helper consolidation (TD-178-2),
    category-seed dual-source removal (TD-178-3).

## Consequences

- A single global `PR-######` gives the platform a stable cross-tenant reference; store numbering is not
  isolated per tenant.
- The hard INTERNAL boundary means the store DTO/serializer can never accidentally leak internal content —
  the cost is two separate projection paths that must both be maintained.
- Accepting current `PlatformUser`-backed auth ships value now but leaves a real tenant-identity bridge
  (TD-178-1) as a Faz 2 prerequisite before true multi-tenant store-user separation.
- Reusing (not sharing) Product Support patterns keeps the two domains independent at the cost of some
  duplicated shapes (SLA helper — TD-178-2; category seed dual-source — TD-178-3).
