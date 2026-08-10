# ADR-289 — Product Support Foundation & Guided Question Engine (Ürün Desteği Faz 1)

- **Status:** IMPLEMENTED & GATE GREEN (Faz A–G; 2026-08-10). Additive schema + new isolated
  `apps/api-gateway/src/product-support/` module + storefront guided flow + store-admin support inbox +
  platform-admin question-set management. Return/refund/cancellation domains are **not** touched (read-pattern
  reuse only). Runtime Playwright (storefront @regression 4 + admin @admin-regression 1 + smoke regresyonsuz)
  gerçek stack'te GREEN; full gate (unit/integration/component + typecheck/lint/build + additive migration) GREEN.
  **Bildirim:** in-app event + **honest e-posta stub** (`isConfigured=false ⇒ UNCONFIGURED`, sahte "SENT" YOK;
  gerçek provider FUTURE). Debt: TD-177-1 FUTURE, TD-177-2 RESOLVED, TD-177-3 FUTURE, TD-177-4 FUTURE (bkz.
  `docs/TECHNICAL_DEBT.md`).
- **Date:** 2026-08-10
- **Builds on:** ADR-269 (Returns Authority — `Shipment.deliveredAt` stable delivery anchor, private
  `RETURN_ATTACHMENT` media, `ReturnStatusHistory`/`ReturnActorType`, `ReturnNumberCounter`), ADR-283/
  TODO-174B (Order Experience Recovery — case lifecycle + priority SLA + append-only activity +
  version-guarded transitions + assignment + `slaState` badge), ADR-089 (Admin Data Grid), ADR-090
  (shared selectors), ADR-065 (media pipeline sharp/webp + `StorageDriver` + private `/media/*` guard),
  ADR-271 (`packages/config` platform-owned policy pattern), ADR-034 (`x-customer-session` customer auth),
  ADR-287 (Playwright E2E release gate).
- **Design spec:** [2026-08-10-product-support-phase-1-design.md](../superpowers/specs/2026-08-10-product-support-phase-1-design.md)
- **Scope tag:** TODO-177

## Context

The platform has orders, order-lines, products/variants, category hierarchy, customer auth, private media
attachments (returns), and an admin case-lifecycle domain (recovery) — but **no product-support capability**:
no guided help flow, no support tickets, no support question content. An audit (six parallel reconnaissance
passes) established what can be reused and what is genuinely absent:

- **Reusable near-verbatim:** the Order Experience Recovery domain is a full template (lifecycle + SLA +
  append-only activity + `version` guard + assignment + serialize + `slaState` badge); the Returns domain is
  the template for customer-facing routes + private auth-gated attachments; `ReturnStatusHistory` /
  `ReturnActorType` / `ReturnNumberCounter` / `OrderLine` snapshot / `ReturnRequest.returnWindowEndsAt` are
  the exact model shapes; the theme-library editor is the template for versioned platform-admin content.
- **Absent / load-bearing gaps:**
  1. **No warranty data anywhere.** Greenfield. `Shipment.deliveredAt` (ADR-269 anchor) exists as a stable
     delivery date.
  2. **No real notification delivery.** Only a `PaymentNotificationDispatcher` contract stub + `OrderEvent`
     timeline + BullMQ plumbing. TD-110 forbids fabricating "sent" success while `isConfigured=false`.
  3. **`OrderLine.id` is deliberately stripped from the customer order-detail DTO** — a line-scoped support
     entry point needs it re-exposed additively and re-validated server-side.
  4. **Media is image-only** (`sharp → webp`; `.webp`-only storage-key regex). PDF needs a pipeline branch.
  5. **`admin-web` has no RHF/Zod**; the dark-glass store-admin kit has no Tabs/Timeline.
  6. Domain services live under `apps/api-gateway/src/<domain>/` (not `services/*`); tenancy is explicit
     storeId-first (no Prisma middleware).

## Decision

### 1. New isolated `product-support` domain; return/refund/cancel untouched

All logic in `apps/api-gateway/src/product-support/` (pure modules `question-engine` / `resolution` / `sla` /
`warranty` / `status-map`; services `service` / `question-service`; routes `routes-customer` / `routes-admin`
/ `routes-platform` / `routes-attachment`; `notification` stub; `serialize`). storeId-first explicit scoping,
sentinel-result error style, optimistic `version` guard, advisory-locked store-scoped ticket counter — all
mirroring returns/recovery. The support domain **reads** order/line/product/variant/customer but never mutates
returns/refunds/cancellation/finance.

### 2. Ticket lifecycle & statuses (locked)

`OPEN, WAITING_STORE, WAITING_CUSTOMER, RESOLVED, CLOSED`; no `CANCELLED`. First open = UNASSIGNED; assignment
is manual (no round-robin). Transitions are server-side validated (`status-map.ts`) under a `version` guard,
each writing an atomic `SupportTicketStatusHistory` row (`ReturnStatusHistory` shape; actor enum
`CUSTOMER|STORE_ADMIN|SYSTEM`). Conversation is append-only `SupportTicketMessage`. Raw enums never reach UI.

### 3. Question engine is deterministic; content is platform-owned and versioned

Question types (locked): `SINGLE_SELECT, MULTI_SELECT, BOOLEAN, SHORT_TEXT, LONG_TEXT, INFO,
SELF_SERVICE_RESULT`. Branching is a table of `SupportQuestionTransition` rows evaluated by `sortOrder`
(first match wins) with a mandatory `DEFAULT` for select/boolean questions. Targets: next question,
self-service result, or escalation. **No arbitrary rule/script/expression engine.** Publish-time
`validateQuestionGraph` rejects cycles and dead-ends and guarantees escalation is always reachable
(no dead-end). Content ownership is **Platform Admin only**; Store Admin cannot mutate question sets,
options, transitions, or any of the three mapping tiers. A `SupportQuestionSetVersion` is snapshot-referenced
by every ticket, and answers are stored with their **question text + type** at that version
(`SupportTicketAnswerSnapshot`) so later content changes never alter a historical ticket's meaning.

### 4. Resolution hierarchy (locked) — mandatory DEFAULT, no dead-end

`(storeId, productId, topic)` → `SupportProductQuestionSetMapping` → `SupportCategoryQuestionSetMapping`
(walk `primaryCategory` ancestry) → `SupportTopicDefault(topic)`. The topic DEFAULT is **mandatory** (seeded
for all seven topics), so resolution can never dead-end. The resolved set runs its latest `PUBLISHED` version.

### 5. SLA is topic-based, platform-owned, store-uneditable

`DEFAULT_TICKET_SLA_POLICY` lives in `packages/config` (ADR-271 pure-policy pattern): a per-`SupportTopic` map
of `{ firstResponseHours, resolutionHours }` with a `DEFAULT` fallback for topics without an override.
Optional env override via TD-036 empty-string normalization. **Store Admin has no mutation path** (config-only
→ platform-owned by construction). Two deadlines (first-response + resolution) are materialized per ticket
per SLA cycle into `SupportSlaSnapshot`; the live SLA is the highest-`cycle` snapshot. Breach is derived at
read time (recovery `slaState`: `INSIDE|DUE_TODAY|OVERDUE|DONE`); no breach-flag worker in Faz 1.

### 6. Reopen restarts a fresh SLA cycle

A `RESOLVED` ticket may be reopened **only** by the owning customer, **only** within `resolvedAt + 7 days`,
transitioning `RESOLVED → OPEN`. Reopen writes a **new `SupportSlaSnapshot(cycle+1)`** with fresh
first-response + resolution deadlines from the topic policy, increments `reopenCount`, and records a
`TICKET_REOPENED` history event. Past the 7-day window reopen is rejected (`REOPEN_WINDOW_EXPIRED`) and the UI
directs the customer to open a new ticket. `CLOSED` tickets can never be reopened (`CLOSED_CANNOT_REOPEN`).

### 7. Warranty: minimal deterministic eligibility, bounded to this ADR

Additive `Product.warrantyMonths Int?` (+ optional `ProductVariant.warrantyMonths Int?` override). No broader
warranty domain is built. At ticket creation for `WARRANTY_SERVICE` (and for display in the guided flow),
`warrantyEndsAt` is computed deterministically and snapshotted:

- **Primary anchor:** `MAX(Shipment.deliveredAt)` over the order's `DELIVERED` shipments (ADR-269 stable
  anchor). `warrantyAnchorSource = SHIPMENT_DELIVERED`.
- **Deterministic fallback:** if no delivered shipment / no `deliveredAt`, anchor on **`order.createdAt`**
  (purchase instant — conservative, never blocks). `warrantyAnchorSource = ORDER_CREATED`.
- `warrantyEndsAt = anchor + warrantyMonths` (calendar months; variant override wins when present).
- **`warrantyMonths` null → no eligibility gating** (`warrantyAnchorSource = NONE`, `warrantyEndsAt = null`);
  escalation is always available.
- **Expired warranty never blocks ticket creation.** Only eligibility/context (in/out of warranty +
  `warrantyEndsAt`) is displayed. No dead-end.

### 8. Notifications: in-app events + honest dispatcher stub (no fake delivery)

Five events (`TICKET_OPENED, TICKET_STORE_REPLY, TICKET_CUSTOMER_REPLY, TICKET_RESOLVED, TICKET_REOPENED`).
Primary surfacing is **in-app**: `SupportTicketStatusHistory` (eventType) + `SupportTicketMessage`, read by the
customer account and the store-admin inbox. A `SupportNotificationDispatcher` (`PaymentNotificationDispatcher`
pattern) is wired with a `createLog…` no-op default; while `isConfigured=false` it reports
`delivery: "UNCONFIGURED"` and **never fabricates "sent"** (TD-110). No new channel system; no async queue in
Faz 1 (in-app is synchronous). Real email provider is future work.

### 9. Attachments: images reuse returns verbatim; PDF adds a bounded pipeline branch; collected only at/after escalation

`SupportTicketAttachment` mirrors `ReturnAttachment` (private, join-table link, `mediaAsset onDelete: Restrict`,
served only via an auth-gated stream route). A new `MediaContext.SUPPORT_ATTACHMENT` (private) is added, plus a
`support` segment in `buildStorageKey`, the `STORAGE_KEY_PATTERN` regex, and the `/media/*` private-guard
classifier, and a `supportTicketAttachment.count` in the `MEDIA_IN_USE` delete guard. PDF support adds
`application/pdf` to the allow-list **and** a pipeline branch that stores PDF bytes unmodified
(`mimeType: application/pdf`, `.pdf` extension) rather than forcing `sharp → webp`. Customer uploads are gated
by `resolveCustomerFromRequest` and scoped by `customerId`; admin reads are `storeId`-scoped; mismatches → 404.
**Attachments are collected only when escalating to a ticket or inside ticket conversation — never during the
self-service wizard** (so self-service-resolved flows create no orphan media).

### 10. Security (server-authoritative, storeId-first)

Customer queries/mutations always filter `{ storeId, customerId }`; client-provided order/line/product context
is untrusted and re-validated server-side (mismatch → 404, never leaking existence). `orderLineId` is exposed
additively on the customer order-detail line DTO but re-validated against `(storeId, customerId)` before use.
Store-admin routes use `requireStoreAdminForModule("PRODUCT_SUPPORT")` and see only their store's tickets.
Question-domain mutations are platform-admin only. status/assignee are server-authoritative.

## Consequences

- **Additive, low blast-radius migration** (new tables + nullable `warrantyMonths` + additive `orderLineId`
  DTO field). Rollback = drop new tables / column; existing data untouched. Returns/refunds/cancel/finance
  behavior unchanged and covered by their own green regression tests (an explicit "domains unaffected" test
  is part of the suite).
- The recovery/returns templates keep the new domain consistent with existing lifecycle, SLA, audit, and
  admin-UI conventions — no parallel infrastructure.
- Warranty is intentionally minimal; a full warranty/service domain is deferred (future).
- In-app-only notifications mean customers/admins see updates by viewing tickets; real email is future work
  and gated behind the honest dispatcher.

## Out of scope (future / tech-debt)

AI chatbot, LLM-generated answers, live chat/websocket, auto-assignment/round-robin, custom store SLA editing,
video attachments, return/refund/cancel workflow rewrite, Store→Platform question-set request system,
marketplace support.
