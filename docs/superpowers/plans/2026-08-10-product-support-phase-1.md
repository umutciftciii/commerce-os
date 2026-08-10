# Product Support / Ürün Desteği (Faz 1, TODO-177) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.
> Design authority: [spec](../specs/2026-08-10-product-support-phase-1-design.md) + [ADR-289](../../adr/ADR-289-product-support-foundation.md).

**Goal:** Add an isolated, order/product-contextual guided **product-support** domain — deterministic question
engine → self-service → ticket escalation — with a store-admin support inbox and platform-admin question-set
management, reusing existing returns/recovery/media/i18n infrastructure and touching no return/refund/cancel logic.

**Architecture:** New `apps/api-gateway/src/product-support/` domain (pure engine modules + services + audience-split
routes), additive Prisma models mirroring returns/recovery, topic-based platform-owned SLA in `packages/config`,
storefront guided flow + ticket UI (BFF + server actions), store-admin inbox/detail (ADR-089 data-grid + recovery
detail template), platform-admin question-set editor (theme-library template). storeId-first explicit scoping,
sentinel-result errors, optimistic `version` guard, advisory-locked store counter.

**Tech Stack:** Prisma/PostgreSQL, Fastify (api-gateway), Next.js App Router (storefront-web/store-admin-web/admin-web),
Zod contracts, BullMQ (unused in Faz 1), Vitest (unit/integration), Playwright (regression), pnpm/turbo monorepo.

## Global Constraints

- **Language:** product default **Turkish** (`packages/i18n` defaultLocale `tr`); every user-facing surface tr+en with
  copy-parity test. **Raw enums must never render** — use co-located `humanize`-fallback label modules.
- **Tenancy:** explicit `storeId`-first `where` on every query (no Prisma middleware, no `tenantWhere` helper).
- **Errors:** sentinel discriminated unions `{ ok:false, code }` in services; routes map to 404/409/400 fail-closed.
  Cross-tenant / cross-customer mismatch → **404** (never leak existence, never 403).
- **Concurrency:** side-effectful ticket writes go through optimistic `version` guard
  (`updateMany({ where:{ id, storeId, version }, data:{ version:{ increment:1 } } })`, `count!==1 → VERSION_CONFLICT`).
- **Money/time:** N/A money; timestamps via injected `now: Date` into pure modules (never `Date.now()` inside pure
  logic — testability). Calendar-month warranty math.
- **Migrations:** additive only; new tables + nullable columns; folder `packages/db/prisma/migrations/<UTCyyyymmddHHMMSS>_todo177_product_support_foundation/migration.sql`; `prisma migrate dev` to author.
- **Notification:** honest stub only — `isConfigured=false ⇒ delivery "UNCONFIGURED"`, never fabricate "sent" (TD-110).
- **Untouched domains:** returns, refunds, order-experience(recovery), cancellation, finance, cart/checkout, shipping
  core. Read-pattern reuse only; no mutation. A regression test asserts these remain green.
- **Gate sequence (per Global gate, Phase G):** `pnpm db:generate` → `pnpm typecheck` → `pnpm lint` →
  `pnpm test` (turbo, concurrency=1) → `pnpm build` → e2e (`e2e:regression` + `e2e:admin-regression`) →
  `git diff --check`. Run twice (Run1+Run2) for flake detection.

---

## 0. Cross-cutting reference (read before Phase A)

### 0.1 Migration / model changes (single migration `todo177_product_support_foundation`)

**New enums:** `SupportTicketStatus`, `SupportActorType`, `SupportTopic`, `SupportQuestionType`,
`SupportQuestionSetStatus`, `SupportQuestionSetVersionStatus`, `SupportTransitionMatchKind`, `SupportTransitionAction`
(values verbatim from spec §4).

**New models (14):** `SupportQuestionSet`, `SupportQuestionSetVersion`, `SupportQuestion`, `SupportQuestionOption`,
`SupportQuestionTransition`, `SupportProductQuestionSetMapping`, `SupportCategoryQuestionSetMapping`,
`SupportTopicDefault`, `SupportTicket`, `SupportTicketMessage`, `SupportTicketAnswerSnapshot`,
`SupportTicketAttachment`, `SupportTicketStatusHistory`, `SupportSlaSnapshot`, `SupportTicketNumberCounter`
(field lists verbatim from spec §4).

**Modified models:** `Product.warrantyMonths Int?` (nullable), `ProductVariant.warrantyMonths Int?` (nullable),
`MediaContext` enum += `SUPPORT_ATTACHMENT`, `Store` back-relations (ticket/history/mapping/counter arrays),
`Product`/`ProductVariant`/`Order`/`OrderLine`/`Customer`/`MediaAsset` back-relations for FK integrity,
`Category` back-relation for category mapping.

**FK `onDelete` discipline:** store→children `Cascade`; `SupportTicket.product/variant/order/orderLine` `Restrict`
(pin history); `SupportTicketAttachment.mediaAsset` `Restrict`; mapping product/category `Cascade`.

**Rollback:** `migrate resolve` down = drop 14 tables + 8 enums + 2 columns + enum value. No data mutation on existing
rows → safe; drop order: attachments→messages→answers→sla→history→ticket→counter→mappings→topic-default→
transitions→options→questions→versions→sets, then columns, then enums.

### 0.2 Endpoint / contracts inventory

All request/response schemas in `packages/contracts/src/index.ts` (Zod), types re-exported via `packages/api-client`.

**Customer** (`/public/stores/:storeSlug/customer/support/*`, `resolveCustomerFromRequest` + `requireStore`):
| Method | Path | Purpose |
|---|---|---|
| POST | `.../resolve` | `{orderNumber, orderLineId, topic}` → resolved published questionSet DTO + context + warranty eligibility |
| POST | `.../attachments` | customer upload (image/PDF) → `{mediaId}` (returns customer-attachment pattern) |
| POST | `.../tickets` | `{orderNumber, orderLineId, topic, questionSetVersionId, answers[], attachments[], attemptedResolution}` → ticket |
| GET | `.../tickets` | customer's tickets (list) |
| GET | `.../tickets/:ticketNumber` | ticket detail (messages, answers, attachments, status, sla) |
| POST | `.../tickets/:ticketNumber/messages` | `{body, attachments[]}` customer reply |
| POST | `.../tickets/:ticketNumber/reopen` | reopen (7-day guard) |
| GET | `.../tickets/:ticketNumber/attachments/:attachmentId` | serve (customerId-scoped) |

**Store admin** (`/stores/:storeId/support/*`, `requireStoreAdminForModule("PRODUCT_SUPPORT")`):
| Method | Path | Purpose |
|---|---|---|
| GET | `.../tickets` | inbox list (filter status/assignee/sla/topic/date/search, sort, paginate) |
| GET | `.../tickets/:ticketId` | detail (context + answers + attachments + conversation + timeline + sla) |
| POST | `.../tickets/:ticketId/messages` | store reply `{body, attachments[]}` |
| POST | `.../tickets/:ticketId/actions` | `{action: ASSIGN\|SET_STATUS, expectedVersion, ...}` |
| GET | `.../assignable-users` | reuse recovery `assignableUsers` |
| GET | `.../tickets/:ticketId/attachments/:attachmentId` | serve (storeId-scoped) |

**Platform admin** (`/platform/support/*`, `requireSuperAdmin`/platform admin):
| Method | Path | Purpose |
|---|---|---|
| GET/POST | `.../question-sets` | list / create set |
| GET/PATCH | `.../question-sets/:id` | detail / update (title/status/isDefault) |
| POST | `.../question-sets/:id/versions` | create DRAFT version (optionally clone latest) |
| PATCH | `.../versions/:versionId` | edit draft (questions/options/transitions bulk) |
| POST | `.../versions/:versionId/validate` | run `validateQuestionGraph` → report |
| POST | `.../versions/:versionId/publish` | validate + DRAFT→PUBLISHED |
| POST | `.../versions/:versionId/archive` | PUBLISHED→ARCHIVED |
| GET/PUT/DELETE | `.../mappings/product` / `.../mappings/category` | mapping CRUD |
| GET/PUT | `.../topic-defaults` | topic default management |

### 0.3 Fixture / seed strategy

- **Platform seed (additive, `packages/db/scripts/seed.mjs` + a new `support-question-seed.mjs` imported by it):**
  7 `SupportTopicDefault` rows, each → a DEFAULT `SupportQuestionSet` with ≥1 `PUBLISHED` version containing a small
  deterministic graph (entry SINGLE_SELECT → ≥1 branch → 1 SELF_SERVICE_RESULT + 1 ESCALATE path). Idempotent
  (upsert by stable `key`). **enterprise-demo + verify-seed invariants must stay green.**
- **E2E seed (`packages/db/scripts/e2e-seed.mjs`, `e2e-store`):** 1 published DEFAULT question-set with a
  self-service + escalate branch; 1 product with `warrantyMonths`; 1 pre-seeded `SupportTicket` (for admin flows).
  Add ids to `tests/e2e/fixtures/ids.ts` (`support: { questionSetKey, warrantyProductSlug, seededTicketNumber }`).
  Idempotent; demo-store pristine after cleanup.
- **Integration tests:** build their own rows via `prisma` in `beforeEach` against the test DB (returns integration
  test pattern), not the seed.

### 0.4 Affected services / packages (mutation vs read-only)

| Package/App | Change kind |
|---|---|
| `packages/db` | **mutate**: schema + migration + seed |
| `packages/config` | **mutate**: `ticket-sla-policy.ts` + env |
| `packages/contracts` | **mutate**: support schemas |
| `packages/api-client` | **mutate**: type re-export + admin client methods |
| `apps/api-gateway` | **mutate**: `product-support/*`, server.ts wiring, media (context/PDF/guard/regex/MEDIA_IN_USE), customers DTO `orderLineId` |
| `apps/storefront-web` | **mutate**: support BFF/actions/pages/wizard + order-line CTA |
| `apps/store-admin-web` | **mutate**: inbox/detail/nav/labels |
| `apps/admin-web` | **mutate**: question-set UI/nav + RHF/Zod deps |
| `packages/i18n` | **mutate**: support copy + parity test |
| `tests/e2e` | **mutate**: specs + fixtures + seed |
| returns/refunds/recovery/cancellation/finance/cart/shipping | **read-only reuse** — no code change |

### 0.5 Rollback risks & mitigations

| Risk | Mitigation |
|---|---|
| Migration breaks deploy | Additive-only; new tables/nullable cols; verified `migrate deploy` on smoke stack before prod; down script in §0.1 |
| PDF pipeline regresses image upload | PDF is a separate branch; image path byte-identical; media unit/integration tests guard both |
| `orderLineId` DTO change breaks storefront order detail | Additive optional field; existing consumers ignore it; contract test asserts backward-compat |
| Question graph cycle/dead-end reaches runtime | `validateQuestionGraph` blocks publish; seed graphs are validated in a unit test |
| Store admin mutates question content | Question routes are platform-admin only; integration test asserts store-admin 403/404 |
| Notification fabricates delivery | Honest stub; unit test asserts `UNCONFIGURED` while not configured |
| Cross-store/customer leak | storeId+customerId scoping; isolation integration tests; 404-not-403 |
| Capability gate hides support unexpectedly | `PRODUCT_SUPPORT` registered as core-always-on (like returns); nav/module test |

---

## Phase A — Schema, migration, config policy, pure engines

**Deliverable:** compiled schema + migration + topic-SLA config + fully unit-tested pure modules (no HTTP yet).
**Phase gate:** `pnpm db:generate` clean; `pnpm --filter @commerce-os/config test` + new unit tests green;
`pnpm typecheck` (db+config) clean. **Checkpoint report** → wait for approval before Phase B.

### Task A1: Prisma schema — enums + models + warranty columns

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (append enums + 15 models near returns block; add `warrantyMonths` to
  `Product` ~1222 and `ProductVariant` ~1336; `MediaContext` += `SUPPORT_ATTACHMENT` ~158; `Store` back-relations ~1074).
- Create (after model edit): migration via `pnpm --filter @commerce-os/db db:migrate` (author name `todo177_product_support_foundation`).

**Interfaces — Produces:** Prisma models/enums per spec §4; `prisma` client types consumed by all later tasks.

- [ ] **Step 1:** Add the 8 enums + `MediaContext.SUPPORT_ATTACHMENT` (spec §4).
- [ ] **Step 2:** Add `Product.warrantyMonths Int?` and `ProductVariant.warrantyMonths Int?` with clarifying comments.
- [ ] **Step 3:** Add the 15 models with exact fields/indexes/`onDelete` from spec §4 and §0.1; add `Store` (+ Product/
  Variant/Order/OrderLine/Customer/MediaAsset/ProductCategory) back-relation arrays required by Prisma.
- [ ] **Step 4:** Author migration:

```bash
pnpm --filter @commerce-os/db exec prisma migrate dev --name todo177_product_support_foundation --schema prisma/schema.prisma
```
Expected: new migration folder + `prisma generate` succeeds.

- [ ] **Step 5:** Regenerate + typecheck db package:

```bash
pnpm db:generate && pnpm --filter @commerce-os/db exec tsc -p tsconfig.json --noEmit
```
Expected: clean.

- [ ] **Step 6: Commit** `git add packages/db && git commit -m "feat(support): TODO-177 schema + migration foundation"`

### Task A2: Topic-based SLA policy (`packages/config`)

**Files:**
- Create: `packages/config/src/ticket-sla-policy.ts`
- Modify: `packages/config/src/index.ts` (re-export `export * from "./ticket-sla-policy.js"`; optional env keys)
- Test: `packages/config/test/ticket-sla-policy.test.ts`

**Interfaces — Produces:**
```ts
export type TicketSlaTarget = { firstResponseHours: number; resolutionHours: number };
export interface TicketSlaPolicy { default: TicketSlaTarget; byTopic: Partial<Record<SupportTopic, TicketSlaTarget>>; }
export const DEFAULT_TICKET_SLA_POLICY: TicketSlaPolicy;
export function resolveTicketSlaTarget(policy: TicketSlaPolicy, topic: SupportTopic): TicketSlaTarget;
export function computeTicketDueAts(now: Date, target: TicketSlaTarget): { firstResponseDueAt: Date; resolutionDueAt: Date };
```

- [ ] **Step 1: Write failing tests** `ticket-sla-policy.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { DEFAULT_TICKET_SLA_POLICY, resolveTicketSlaTarget, computeTicketDueAts } from "../src/ticket-sla-policy.js";

describe("ticket SLA policy", () => {
  it("uses topic override when present", () => {
    const p = { default: { firstResponseHours: 24, resolutionHours: 72 }, byTopic: { WARRANTY_SERVICE: { firstResponseHours: 8, resolutionHours: 48 } } };
    expect(resolveTicketSlaTarget(p, "WARRANTY_SERVICE")).toEqual({ firstResponseHours: 8, resolutionHours: 48 });
  });
  it("falls back to default when topic has no override", () => {
    expect(resolveTicketSlaTarget(DEFAULT_TICKET_SLA_POLICY, "OTHER")).toEqual(DEFAULT_TICKET_SLA_POLICY.default);
  });
  it("computes deterministic due dates from now", () => {
    const now = new Date("2026-08-10T00:00:00.000Z");
    const { firstResponseDueAt, resolutionDueAt } = computeTicketDueAts(now, { firstResponseHours: 24, resolutionHours: 72 });
    expect(firstResponseDueAt.toISOString()).toBe("2026-08-11T00:00:00.000Z");
    expect(resolutionDueAt.toISOString()).toBe("2026-08-13T00:00:00.000Z");
  });
});
```

- [ ] **Step 2: Run → FAIL** `pnpm --filter @commerce-os/config exec vitest run test/ticket-sla-policy.test.ts`
- [ ] **Step 3: Implement** `ticket-sla-policy.ts` (pure; `DEFAULT_TICKET_SLA_POLICY.default = {24,72}`; per spec §5 topic overrides — start with `DAMAGED_OR_MISSING`/`PRODUCT_NOT_WORKING` faster, `PRODUCT_INFO` slower; `computeTicketDueAts` adds `hours*3600_000`ms).
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: (optional env)** add `TICKET_SLA_*` optional keys in `index.ts` using TD-036 normalization helpers + `resolveTicketSlaPolicy(config)` with `?? DEFAULT` fallbacks; extend test.
- [ ] **Step 6: Commit** `feat(support): TODO-177 topic-based platform SLA policy`.

### Task A3: `warranty.ts` pure module

**Files:** Create `apps/api-gateway/src/product-support/warranty.ts`; Test `apps/api-gateway/src/product-support/warranty.test.ts`.

**Interfaces — Produces:**
```ts
export type WarrantyAnchorSource = "SHIPMENT_DELIVERED" | "ORDER_CREATED" | "NONE";
export interface WarrantyInput { warrantyMonths: number | null; deliveredAt: Date | null; orderCreatedAt: Date; now: Date; }
export interface WarrantyEligibility { warrantyEndsAt: Date | null; anchorSource: WarrantyAnchorSource; inWarranty: boolean | null; }
export function computeWarrantyEligibility(i: WarrantyInput): WarrantyEligibility;
```

- [ ] **Step 1: Write failing tests** covering: (a) delivered anchor → `SHIPMENT_DELIVERED`, endsAt = delivered+months,
  `inWarranty` by `now`; (b) no delivery → `ORDER_CREATED` fallback; (c) `warrantyMonths=null` → `{null,"NONE",null}`;
  (d) expired → `inWarranty=false` but result still returned (never throws/blocks). Include calendar-month assertion
  (e.g. Jan-31 + 1 month) using a fixed helper (add whole months, clamp end-of-month).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** deterministic month-add + anchor precedence per ADR-289 §7.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `feat(support): TODO-177 warranty eligibility module`.

### Task A4: `question-engine.ts` — graph validation + traversal

**Files:** Create `apps/api-gateway/src/product-support/question-engine.ts`; Test `.../question-engine.test.ts`.

**Interfaces — Produces:**
```ts
export interface EngineQuestion { key: string; type: SupportQuestionType; isEntry: boolean; optionKeys: string[]; }
export interface EngineTransition { fromKey: string; matchKind: SupportTransitionMatchKind; matchOptionKey: string | null; action: SupportTransitionAction; toKey: string | null; sortOrder: number; }
export interface QuestionGraph { questions: EngineQuestion[]; transitions: EngineTransition[]; }
export type GraphValidation = { ok: true } | { ok: false; errors: Array<{ code: "NO_ENTRY"|"MULTIPLE_ENTRY"|"CYCLE"|"DEAD_END"|"UNCOVERED_OPTION"|"UNREACHABLE"|"NO_ESCALATION_PATH"|"BAD_TARGET"; detail: string }> };
export function validateQuestionGraph(g: QuestionGraph): GraphValidation;
export type NextStep = { kind: "QUESTION"; key: string } | { kind: "RESULT"; key: string } | { kind: "ESCALATE" };
export function nextStep(g: QuestionGraph, fromKey: string, answer: { optionKeys?: string[]; boolean?: boolean }): NextStep;
```

- [ ] **Step 1: Write failing tests** — validation: exactly-one-entry (NO_ENTRY/MULTIPLE_ENTRY), SINGLE_SELECT missing
  option coverage → UNCOVERED_OPTION, missing DEFAULT → UNCOVERED_OPTION, cycle (A→B→A) → CYCLE, path with no terminal
  → DEAD_END, unreachable node → UNREACHABLE, no ESCALATE reachable → NO_ESCALATION_PATH, transition to missing key →
  BAD_TARGET, and a valid graph → `{ok:true}`. traversal: OPTION match, BOOLEAN_TRUE/FALSE, DEFAULT fallback, GO_TO_RESULT,
  ESCALATE, first-match-wins by sortOrder. (Write ~12 focused test cases with concrete graphs.)
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** DFS for cycle/reachability; per-question option coverage check; deterministic `nextStep`
  (evaluate transitions in sortOrder, first match). Pure, no I/O.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `feat(support): TODO-177 deterministic question engine + graph validation`.

### Task A5: `resolution.ts` — 3-tier hierarchy (pure)

**Files:** Create `apps/api-gateway/src/product-support/resolution.ts`; Test `.../resolution.test.ts`.

**Interfaces — Produces:**
```ts
export interface ResolutionInput {
  topic: SupportTopic; productId: string; categoryAncestryIds: string[]; // [primaryCategoryId, parent, ... root]
  productMap: Map<string, string>;   // key `${productId}:${topic}` → questionSetId
  categoryMap: Map<string, string>;  // key `${categoryId}:${topic}` → questionSetId
  topicDefault: Map<SupportTopic, string>;
}
export type ResolutionResult = { questionSetId: string; tier: "PRODUCT"|"CATEGORY"|"DEFAULT" };
export function resolveQuestionSet(i: ResolutionInput): ResolutionResult; // never null — throws if topicDefault missing (seed invariant)
```

- [ ] **Step 1: Write failing tests** — product mapping wins; category mapping when no product; nearest ancestor wins
  (child category before root); DEFAULT fallback when neither; DEFAULT always resolvable; throws `MISSING_TOPIC_DEFAULT`
  when default map lacks topic (guards seed invariant).
- [ ] **Step 2: Run → FAIL.** **Step 3: Implement.** **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `feat(support): TODO-177 resolution hierarchy`.

### Task A6: `sla.ts` — read-time SLA state (pure)

**Files:** Create `apps/api-gateway/src/product-support/sla.ts`; Test `.../sla.test.ts`.

**Interfaces — Produces:**
```ts
export type SlaStateKind = "INSIDE" | "DUE_TODAY" | "OVERDUE" | "DONE";
export function slaStateFor(dueAt: Date, metAt: Date | null, now: Date, isTerminal: boolean): SlaStateKind;
```
(DONE if metAt or terminal; OVERDUE if now>dueAt; DUE_TODAY if same calendar day; else INSIDE — recovery `slaState` parity.)

- [ ] **Step 1–4:** failing tests (each branch incl. same-day boundary) → implement → pass.
- [ ] **Step 5: Commit** `feat(support): TODO-177 sla state`.

### Task A7: `status-map.ts` — transition + reopen validation (pure)

**Files:** Create `apps/api-gateway/src/product-support/status-map.ts`; Test `.../status-map.test.ts`.

**Interfaces — Produces:**
```ts
export type SupportActor = "CUSTOMER" | "STORE_ADMIN" | "SYSTEM";
export type TransitionCode = "OK" | "INVALID_TRANSITION" | "REOPEN_WINDOW_EXPIRED" | "CLOSED_CANNOT_REOPEN" | "NOT_OWNER";
export function evaluateStatusTransition(from: SupportTicketStatus, to: SupportTicketStatus, actor: SupportActor): { ok: boolean; code: TransitionCode };
export function evaluateReopen(status: SupportTicketStatus, resolvedAt: Date | null, now: Date, isOwner: boolean): { ok: boolean; code: TransitionCode };
```

- [ ] **Step 1: Write failing tests** — allowed matrix (store: →WAITING_CUSTOMER/RESOLVED/CLOSED; customer reply:
  →WAITING_STORE; system: →WAITING_CUSTOMER); disallowed (customer→CLOSED, →RESOLVED by customer) → INVALID_TRANSITION;
  reopen inside 7d + owner + RESOLVED → OK; >7d → REOPEN_WINDOW_EXPIRED; CLOSED → CLOSED_CANNOT_REOPEN; non-owner → NOT_OWNER.
- [ ] **Step 2–4:** FAIL → implement → PASS. **Step 5: Commit** `feat(support): TODO-177 status/reopen state machine`.

### Task A8: Seed graph validity unit test

**Files:** Create `packages/db/scripts/support-question-seed.mjs` (export the seed graph builder as data);
Test `apps/api-gateway/src/product-support/seed-graphs.test.ts` (import the graph JSON, run `validateQuestionGraph`).

- [ ] **Step 1: Write failing test** asserting every seeded DEFAULT graph passes `validateQuestionGraph` and has an
  ESCALATE-reachable path + ≥1 SELF_SERVICE_RESULT.
- [ ] **Step 2–4:** author the 7 default graphs (deterministic) → PASS.
- [ ] **Step 5: Commit** `test(support): TODO-177 seed graphs validate`.

> **Phase A checkpoint report:** models+migration compiled; all pure modules green; SLA/warranty/engine/resolution/
> status-map covered; seed graphs valid. → **wait for approval.**

---

## Phase B — Backend services, routes, contracts, media, notification, DTO

**Deliverable:** working HTTP surface (customer/admin/platform) against the test DB; media PDF + support attachment;
notification stub; `orderLineId` DTO. **Phase gate:** `pnpm test:integration` new suites green; `pnpm typecheck` +
`pnpm --filter @commerce-os/api-gateway lint` clean; existing returns/recovery integration tests still green.
**Checkpoint** → approval before Phase C.

### Task B1: Contracts (Zod) + api-client types

**Files:** Modify `packages/contracts/src/index.ts` (+ maybe `packages/contracts/src/support.ts` split, re-exported);
`packages/api-client/src/index.ts` (type re-exports + admin client methods); Test `packages/contracts/test/support.test.ts`.

**Interfaces — Produces:** `supportResolveRequestSchema`, `supportTicketCreateSchema`, `supportTicketDtoSchema`,
`supportTicketListItemSchema`, `supportMessageCreateSchema`, `supportAdminActionSchema`, question-set admin schemas;
types `SupportTicketDto`, `SupportTicketListItem`, `SupportQuestionSetDto`, etc.

- [ ] **Step 1:** failing schema tests (valid/invalid payload parse; enum coverage; `expectedVersion` required on admin action).
- [ ] **Step 2–4:** implement schemas mirroring returns/recovery DTO shaping → PASS.
- [ ] **Step 5: Commit** `feat(support): TODO-177 contracts + api-client types`.

### Task B2: `serialize.ts` — DTO projections (allowlist)

**Files:** Create `apps/api-gateway/src/product-support/serialize.ts`; Test `.../serialize.test.ts`.

- [ ] **Steps:** failing tests asserting internal fields (raw storageKey, internal notes, actorId secrets) never appear;
  actor/status/topic emitted as codes for client-side label mapping; attachments as ids only. Implement → PASS → commit.

### Task B3: Ticket service — create/list/get/message/transition/assign/reopen

**Files:** Create `apps/api-gateway/src/product-support/service.ts`; Test `tests/integration/product-support-service.test.ts`.

**Interfaces — Produces (sentinel results):**
```ts
createTicketFromGuidedFlow(input): Promise<{ok:true; ticket} | {ok:false; code:"ORDER_NOT_FOUND"|"LINE_MISMATCH"|"TOPIC_DEFAULT_MISSING"|...}>
addMessage(...) / applyAdminAction({action, expectedVersion, ...}) / reopenTicket(...) → version-guarded
```

- [ ] **Step 1: Write failing integration tests** (real test DB, `beforeEach` seeds store/customer/order/line/product/
  question-set): create ticket snapshots all context + answers + sla cycle 1 + status history OPEN; `LINE_MISMATCH`
  when orderLineId not owned; store reply sets firstResponseAt + firstResponseMetAt; version conflict; reopen fresh
  cycle (cycle=2 snapshot); 7-day boundary; CLOSED cannot reopen; assignment (me/user).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** using `prisma.$transaction` + advisory lock + `ticketNumber` counter + the Phase A pure
  modules (resolution already done at resolve-time; here trust `questionSetVersionId` from request but re-validate it
  is PUBLISHED & belongs to resolved set) + `computeTicketDueAts` + `computeWarrantyEligibility` +
  `evaluateStatusTransition`/`evaluateReopen`. Emit notification (Task B6) + status history atomically.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `feat(support): TODO-177 ticket lifecycle service`.

### Task B4: Question-set service (platform CRUD + publish)

**Files:** Create `apps/api-gateway/src/product-support/question-service.ts`; Test `tests/integration/product-support-question-service.test.ts`.

- [ ] **Steps:** failing integration tests — create set/version, edit draft (bulk questions/options/transitions),
  publish runs `validateQuestionGraph` and rejects invalid graph (`GRAPH_INVALID` with errors), archive, mapping CRUD,
  topic-default upsert. Implement → PASS → commit `feat(support): TODO-177 question-set management service`.

### Task B5: Media — SUPPORT_ATTACHMENT context + PDF pipeline + guards

**Files:** Modify `apps/api-gateway/src/media/storage-key.ts` (CONTEXT_SEGMENT `support`),
`apps/api-gateway/src/media/local-disk-driver.ts` (`STORAGE_KEY_PATTERN` add `support` segment + `.pdf`),
`apps/api-gateway/src/media/private-guard.ts` (add `support` private segment), `apps/api-gateway/src/media/routes.ts`
(MEDIA_IN_USE += `supportTicketAttachment.count`); Create `apps/api-gateway/src/product-support/routes-attachment.ts`
(customer upload with image+PDF branch, and serve routes); Test `tests/integration/product-support-attachment.test.ts`
+ extend media unit tests.

- [ ] **Step 1: Write failing tests** — customer uploads image → webp mediaAsset (SUPPORT_ATTACHMENT); customer uploads
  PDF → stored as `application/pdf` `.pdf` (no sharp); disallowed mime → 415; oversize → 413; arbitrary storageKey/
  traversal → rejected; `/media/*` support path → 404 (private); customer serve own → 200, other customer → 404;
  admin serve in-store → 200, cross-store → 404; delete media referenced by ticket → 409 MEDIA_IN_USE.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** the pipeline branch (mime `application/pdf` skips sharp, `buildStorageKey(...,"SUPPORT_ATTACHMENT",uuid,ext)`),
  guards, serve routes (returns `routes-attachment.ts` pattern; `Cache-Control: private, no-store`).
- [ ] **Step 4: Run → PASS.** **Step 5: Commit** `feat(support): TODO-177 support attachments (image+PDF, private, authz)`.

### Task B6: Notification dispatcher stub

**Files:** Create `apps/api-gateway/src/product-support/notification.ts`; Test `.../notification.test.ts`.

**Interfaces — Produces:** `SupportNotificationDispatcher { isConfigured: boolean; sendTicketNotification(input): Promise<{ delivery: "UNCONFIGURED"|"QUEUED"|"SENT"|"FAILED" }> }`; `createLogSupportNotificationDispatcher(logger)`.

- [ ] **Steps:** failing test — `isConfigured=false` ⇒ `UNCONFIGURED`, never `SENT`; implement no-op log dispatcher →
  PASS → commit `feat(support): TODO-177 honest notification stub`.

### Task B7: `orderLineId` additive on customer order-detail DTO

**Files:** Modify `packages/contracts/src/index.ts` (`customerOrderDetailLineSchema` += `orderLineId`),
`apps/api-gateway/src/customers/index.ts` (`serializeCustomerOrderDetail` includes `id` as `orderLineId`);
Test extend customer order-detail integration/contract test.

- [ ] **Steps:** failing test — order detail line exposes `orderLineId`; backward-compat (optional) — implement →
  PASS → commit `feat(support): TODO-177 expose orderLineId on customer order-detail line`.

### Task B8: Route registration + wiring in server.ts

**Files:** Create `apps/api-gateway/src/product-support/routes-customer.ts`, `routes-admin.ts`, `routes-platform.ts`;
Modify `apps/api-gateway/src/server.ts` (imports + register near returns ~7839/~8178; inject deps; wire notification
dispatcher; register `PRODUCT_SUPPORT` module key as core-always-on); Test `tests/integration/product-support-routes.test.ts`.

- [ ] **Step 1: Write failing route/integration tests** — customer resolve→create→message→reopen happy path over HTTP;
  admin list/detail/action/reply; platform question-set CRUD/publish; auth guards (customer other-store 404; store-admin
  cross-store 404; store-admin cannot hit platform question routes → 403/404; unauthenticated 401).
- [ ] **Step 2: Run → FAIL. Step 3: Implement routes** (thin; delegate to services; map sentinel codes to HTTP).
- [ ] **Step 4: Run → PASS. Step 5: Commit** `feat(support): TODO-177 gateway routes + wiring`.

### Task B9: "Domains unaffected" regression assertion

**Files:** Test `tests/integration/product-support-isolation.test.ts`.

- [ ] **Steps:** test that creating/mutating support tickets does not create/alter any ReturnRequest/OrderRefund/
  RecoveryCase/Order status rows; run existing returns+recovery integration suites (they must stay green). Commit.

> **Phase B checkpoint report:** full API green over integration; media/PDF/authz; notification honest; isolation
> proven. → **wait for approval.**

---

## Phase C — Platform Admin question-set UI (`admin-web`)

**Deliverable:** platform admin can CRUD question sets, edit versions (questions/options/branches), validate+publish,
manage mappings + topic defaults. **Phase gate:** `pnpm --filter @commerce-os/admin-web build` + `lint` +
`typecheck` clean; i18n parity test green. **Checkpoint** → approval before Phase D.

### Task C1: Add RHF/Zod deps + nav entry
**Files:** Modify `apps/admin-web/package.json` (`react-hook-form ^7.54`, `@hookform/resolvers ^3.10`, `zod ^3.24` —
match store-admin), `apps/admin-web/components/admin-nav.tsx` (+ item), `packages/i18n/src/locales/{tr,en}/admin.ts` (nav key + parity test).
- [ ] Steps: add deps (`pnpm install`), nav item, i18n keys; `pnpm --filter @commerce-os/admin-web build` clean; commit.

### Task C2: Question-set list + create
**Files:** Create `apps/admin-web/app/(app)/question-sets/page.tsx` (+ create modal, plans-page pattern), BFF client
methods in `apps/admin-web/lib/*`. Steps: build list + create; verify against gateway (dev); commit.

### Task C3: Version editor (tabs: Questions | Options/Branches | Mappings) + publish/archive
**Files:** Create `apps/admin-web/app/(app)/question-sets/[id]/page.tsx`, reuse `components/theme-library/tabs.tsx`
pattern (port), RHF+Zod form schema (`product-form-schema.ts` composition), assignment-dialog pattern for mappings.
- [ ] Steps: version list + draft edit (ordering, option/branch CRUD) + validate button (shows graph errors) +
  publish/archive; enum→label (no raw enum); build/lint/typecheck clean; commit.

### Task C4: Mapping + topic-default management
**Files:** within `[id]` editor or a `question-sets/mappings` sub-view; product/category mapping + topic default CRUD.
- [ ] Steps: implement; verify DEFAULT always set; commit.

> **Phase C checkpoint:** platform admin fully manages content; publish blocks invalid graphs (manual verify + screenshot). → approval.

---

## Phase D — Storefront guided flow + ticket UI

**Deliverable:** customer opens support from an order line, runs guided flow, self-serves or escalates, views/reopens
tickets. **Phase gate:** `pnpm --filter @commerce-os/storefront-web build` + `lint` + `typecheck`; i18n parity.
**Checkpoint** → approval before Phase E.

### Task D1: BFF reads + server actions
**Files:** Create `apps/storefront-web/lib/server/support.ts` (reads via `getCustomer`), `support-actions.ts`
(`"use server"` mutations via `sendCustomer` + `revalidatePath`). Steps: implement + typecheck; commit.

### Task D2: Order-line CTA
**Files:** Modify `apps/storefront-web/components/account/order-actions.tsx` (replace `support` placeholder →
"Ürün desteği al" → `/account/support/new?order=..&line=..`), `app/account/orders/[orderNumber]/page.tsx` (per-line
CTA using new `orderLineId`). Steps: implement; verify context auto-passed; commit.

### Task D3: Guided wizard (client component)
**Files:** Create `apps/storefront-web/app/account/support/new/page.tsx` + `components/account/support/guided-wizard.tsx`
(client; consumes resolved published version DTO; traverses with engine logic mirrored client-side; context auto; no
attachment step). Steps: topic pick → questions → self-service result (resolved ends; unresolved → escalate form with
optional attachment) → create ticket; commit.

### Task D4: Ticket list + detail + reopen + attachments
**Files:** Create `app/account/support/page.tsx` (list), `app/account/support/[ticketNumber]/page.tsx` (detail:
conversation, add message + attachment, reopen CTA with 7-day/closed handling → "yeni ticket"), photo/PDF upload reuse
`components/ui/photo-upload.tsx` (extend accept for PDF). Steps: implement; enum→label; commit.

### Task D5: i18n storefront copy + parity
**Files:** `packages/i18n/src/locales/{tr,en}/storefront.ts` + parity test. Steps: add keys; parity green; commit.

> **Phase D checkpoint:** end-to-end customer flow works in dev (manual verify: self-service resolve + escalate + reopen). → approval.

---

## Phase E — Store Admin support inbox + detail

**Deliverable:** store admin sees `Destek > Ürün Desteği` inbox, opens ticket, assigns, replies, transitions status,
sees SLA. **Phase gate:** `pnpm --filter @commerce-os/store-admin-web build` + `lint` + `typecheck`; i18n parity.
**Checkpoint** → approval before Phase F.

### Task E1: Nav + labels
**Files:** Modify `apps/store-admin-web/components/store-nav.tsx` (new `support` group, inline locale label), Create
`apps/store-admin-web/lib/client/ticket-labels.ts` (recovery-labels pattern: status/topic/actor/slaState maps + tone +
`humanize` fallback + `ticketSlaState`). Steps: implement; commit.

### Task E2: Inbox list (ADR-089 data-grid)
**Files:** Create `apps/store-admin-web/app/(app)/support/page.tsx` using `useDataGridQuery` + `DataGridToolbar` +
`DataGrid`; BFF `lib/client/api.ts` methods; columns (ticket no, customer, product, order, topic, status, assignee,
first-response SLA, resolution SLA, last activity); filters (status/assignee/sla-risk/topic/date/search). Steps:
implement; SLA badge via `ticketSlaState`; commit.

### Task E3: Ticket detail (recovery detail template)
**Files:** Create `apps/store-admin-web/app/(app)/support/[ticketId]/page.tsx` — context (order/product) + guided
answers + attachments (auth-gated serve) + conversation + timeline (`<ol>`) + assignment (assign-to-me/user) + status
actions (`expectedVersion`) + SLA panel. BFF methods. Steps: implement; enum→label; commit.

### Task E4: i18n store-admin copy + parity
**Files:** `packages/i18n/src/locales/{tr,en}/storeAdmin.ts` + parity test. Steps: add keys; green; commit.

> **Phase E checkpoint:** store admin manages tickets in dev (manual verify: list→detail→assign→reply→resolve→SLA). → approval.

---

## Phase F — Playwright regression + smoke + seed/fixtures

**Deliverable:** deterministic browser regression for both audiences + seed/fixtures. **Phase gate:**
`pnpm e2e:regression` (storefront) + `pnpm e2e:admin-regression` green locally (ports 3100/3110, `e2e-store`).
**Checkpoint** → approval before Phase G.

### Task F1: Seed + fixtures
**Files:** Modify `packages/db/scripts/e2e-seed.mjs` (published DEFAULT question-set + warranty product + seeded ticket),
`tests/e2e/fixtures/ids.ts` (`support` block). Steps: run `pnpm db:seed-e2e` idempotent twice; commit.

### Task F2: Storefront regression spec
**Files:** Create `tests/e2e/regression/NN-product-support.spec.ts` (`@regression`): order → product support → guided
questions → self-service path → unresolved → ticket → customer message → resolved → reopen. Uses `customer.json` at
`STOREFRONT_URL`. Steps: write with `getByTestId` (add stable testids in Phase D as needed — note back-fill),
run green; commit.

### Task F3: Store-admin regression spec
**Files:** Create `tests/e2e/admin-regression/NN-product-support.spec.ts` (`@admin-regression`): inbox → detail →
assign → reply → status lifecycle → SLA display; assert raw enum never leaks (`not.toContainText("WAITING_STORE")` etc.).
Uses `store-admin.json` at `STORE_ADMIN_URL`. Steps: write; run green; commit.

### Task F4: Smoke read/nav (optional deterministic)
**Files:** add a `@smoke`/`@admin-smoke` inbox-list-loads assertion if deterministic. Steps: add; green; commit.

> **Phase F checkpoint:** both regression suites green twice (Run1+Run2). → approval.

---

## Phase G — Full gate + ship + docs

**Deliverable:** merged, migrated, deployed, documented. **This phase is the release gate.**

### Task G1: Full local gate (Run1 + Run2)
- [ ] `pnpm db:generate`
- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] `pnpm test` (turbo, concurrency=1)
- [ ] `pnpm build`
- [ ] `pnpm e2e:regression` + `pnpm e2e:admin-regression`
- [ ] `git diff --check`
- [ ] Repeat once (Run2) to catch flakes. Fix any red before proceeding.

### Task G2: Docs
**Files:** `docs/DECISIONS.md` (append ADR-289 summary), `docs/ROADMAP.md` (Product Support entry), `docs/TODO.md`
(TODO-177), `docs/TESTING.md` (new suites + e2e specs), `docs/TECHNICAL_DEBT.md` (future: real email provider, auto-
assign, warranty domain, Store→Platform request, video). Steps: update; commit.

### Task G3: Commit → push → PR → CI → merge
- [ ] Ensure branch `claude/product-support-phase-1-audit-2c6e71`; push; open PR (title `feat(support): TODO-177
  Product Support Foundation (ADR-289)`, body linking spec/ADR/plan).
- [ ] Required CI (`ci.yml` + merge-blocking `e2e.yml`) green.
- [ ] Merge commit to `main`.

### Task G4: Migration + changed-services-only deploy + post-deploy smoke
- [ ] Apply migration on smoke/prod stack (`migrate deploy`).
- [ ] Rebuild/recreate only changed services (api-gateway + storefront-web + store-admin-web + admin-web + worker if
  needed) `--no-deps`; postgres/redis/volumes untouched (returns ADR-269 deploy pattern).
- [ ] Post-deploy **safe** smoke (auth'lu read/nav + one create→resolve; fixtures cleaned; demo-store pristine).

### Task G5: Docs CLOSED & DEPLOYED + cleanup + memory
- [ ] Mark ADR-289 / DECISIONS / ROADMAP / TODO as **CLOSED & DEPLOYED** with PR#/merge sha + smoke result.
- [ ] Clean smoke fixtures; verify enterprise-demo pristine.
- [ ] Write a memory note (kebab-slug) + MEMORY.md pointer.

> **Phase G checkpoint:** merged + deployed + smoke PASS + docs closed. Final short report.

---

## Self-review notes (author)

- **Spec coverage:** every spec §1–§13 requirement maps to a task (question engine A4/A8/B4/C3; resolution A5/B3;
  versioning/snapshot A1/B3/B4; SLA A2/A6/B3; reopen A7/B3/D4; warranty A3/B3; attachments B5/D4; notification B6;
  security B5/B8/B9; admin C; storefront D; store-admin E; tests A/B/F; scope-out in ADR §out-of-scope).
- **No placeholders:** each logic task carries concrete test code or precise assertion lists; UI tasks carry exact
  file paths + acceptance checks + build/lint gate.
- **Type consistency:** pure-module signatures in Phase A are consumed by Phase B services under the same names
  (`computeWarrantyEligibility`, `validateQuestionGraph`, `nextStep`, `resolveQuestionSet`, `slaStateFor`,
  `evaluateStatusTransition`, `evaluateReopen`, `computeTicketDueAts`).
- **Testids caveat (F2/F3):** stable `data-testid`s are added during Phase D/E; F-phase specs reference them — if a
  testid is missing at F time, back-fill it in the owning component (small, tracked).
