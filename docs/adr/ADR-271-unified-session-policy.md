# ADR-271 — Unified Session Policy

- **Status:** **ACCEPTED & DEPLOYED** (2026-08-05, PR #177). Design accepted earlier; the implementation pass
  delivered the full feature — additive migration, single policy module, gateway dual-gate validation + sliding
  refresh, remember-me (three apps), extend endpoints (both session types) with token rotation, expiry UX + safe
  returnTo, accessible warning modal + countdown, and multi-tab sync — plus the post-audit critical hardening
  (§8). Merged (#177), migrate-before-app applied, docker stack rebuilt/recreated, post-deploy smoke green.
- **Date:** 2026-08-04
- **Related:** ADR-032 (single `Customer` identity), F3B.3 (`x-customer-session`), ADR-270 (recovery closed
  blockers 1/2/4). **Unblocks:** TODO-170 (Refund Ledger) once this closes.

> **Implementation summary is in §7 below.** §1–§5 are the accepted design (preserved); §6 is the decision.

## 1. Current architecture (analysis, evidence-based)

Two **distinct** opaque-token session systems; no JWT for app sessions. Each frontend is a Next App-Router BFF —
the raw token lives in an **httpOnly** cookie server-side and is never exposed to client JS; the gateway stores
only `sha256(`​`${token}.${SESSION_SECRET}`​`)`.

| Aspect | Platform (`admin-web` + `store-admin-web`) | Customer (`storefront-web`) |
|---|---|---|
| Table | `PlatformSession` (`platformUserId`) | `CustomerSession` (`storeId`,`customerId`) |
| Transport | `Authorization: Bearer` | `x-customer-session` header |
| Cookie | `commerce_os_admin_session` / `commerce_os_store_admin_session` (httpOnly, SameSite lax, Secure in prod, path `/`, `expires`=absolute) | `commerce_os_customer_session` (httpOnly, SameSite lax, **maxAge 30d hardcoded**) |
| TTL source | `SESSION_TTL_SECONDS` (8h) in `packages/config` | `CUSTOMER_SESSION_TTL_SECONDS` (30d) in `packages/config` |
| CSRF | double-submit on mutating BFF routes | none (Server Actions + SameSite) |

**Gaps (all confirmed):** only a single **absolute** `expiresAt`, set once at login and never refreshed — **no
idle timeout, no sliding expiry**. **No remember-me** anywhere (no UI control, no server field; the customer 30d
is unconditional). **No session-extend/refresh endpoint.** **No expiry UX** — a mid-session 401 surfaces as an
inline error and only redirects on shell remount (admin) or next server render (storefront); `returnTo`/`next`
exists **only** on the storefront account page. **No warning modal / countdown. No multi-tab logout signal.**
Policy values are **scattered** (config TTLs + per-app `lib/server/session.ts`/`csrf.ts` cookie flags + a
hardcoded `customer-cookie.ts` maxAge). **No raw token in localStorage** (verified by grep — httpOnly-cookie
only). **Login autocomplete is already correct** (`username` / `current-password`) in all three apps — verified
live in the ADR-270 smoke; remember-me checkbox is the only missing login control.

## 2. Data-model & migration plan (additive)

Add to **both** `PlatformSession` and `CustomerSession` (one additive migration, no column repurposed):

| Column | Type | Meaning |
|---|---|---|
| `lastActivityAt` | `DateTime` (default `now()`) | Sliding idle anchor; bumped by meaningful activity (throttled). |
| `absoluteExpiresAt` | `DateTime` | Hard ceiling; idle refresh never extends past this. |
| `rememberMe` | `Boolean` (default `false`) | Which policy window was chosen at login (server-authoritative). |
| `rotatedFromSessionId` | `String?` | Token rotation lineage (fixation defence / audit). |
| `policyVersion` | `Int` (default `1`) | **Post-audit hardening (M1).** `0` = legacy (grandfathered, absolute-only); `1` = ADR-271-native (idle+absolute). See §7. |

**`expiresAt` is KEPT, NOT repurposed** (see §5 for the authoritative decision). It is preserved with its original
meaning as an absolute deadline; after ADR-271 login it is set equal to `absoluteExpiresAt`, and the validator falls
back to `absoluteExpiresAt ?? expiresAt` for pre-migration rows. The idle deadline is **computed** from
`lastActivityAt` and is never stored. `absoluteExpiresAt` is the hard ceiling. Migration is additive and reversible.

**Migration cutover (M1 — post-audit).** The naive backfill `lastActivityAt = updatedAt` + `rememberMe = false` would
collapse existing long-lived (e.g. 30-day) sessions to a 30-minute idle window on deploy — a silent mass-logout. The
hardening follow-up migration (`20260804170000_adr271_returns_session_hardening`) instead marks all pre-existing rows
`policyVersion = 0` (via a PG "fast default" — no table rewrite, no unconditional full-table `UPDATE`, addressing the
M2 lock concern) and sets the column default to `1` for new rows. Legacy (`policyVersion = 0`) sessions are validated
**absolute-only** (idle collapse skipped) until the first meaningful activity, which atomically promotes them to
`policyVersion = 1` with a fresh idle window. Existing sessions therefore survive the deploy, never exceed their
original absolute expiry, and adopt the native policy on first real use. Deterministic (column-driven, not heuristic).

## 3. Unified policy contract (single source, three apps)

One `SESSION_POLICY` in `packages/config` (or a shared `packages/auth` module) — no per-app hardcoding:

| Remember-me | Idle timeout | Absolute expiry |
|---|---|---|
| **off** | 30 min | 8 h |
| **on** | 7 days | 30 days |

Session validity at the gateway = `now ≤ min(idleDeadline, absoluteExpiresAt)` AND not revoked. Both platform
and customer auth paths share the same evaluator. Cookie flags (HttpOnly, Secure-in-prod, SameSite, scoped path)
and names resolve from the single policy module; the customer cookie maxAge is derived from the policy, not a
hardcoded constant.

## 4. Behaviour plan (implementation-phase contract)

- **Login:** set `expiresAt` (idle window), `absoluteExpiresAt` (absolute window), `rememberMe`; **rotate** the
  session token on login (defence against fixation); cookie maxAge = policy.
- **Activity:** refresh `lastActivityAt`/`expiresAt` only on **meaningful** activity (authenticated navigation,
  mutation, controlled API activity, optionally throttled pointer/keyboard) — **never per mousemove** — and
  **never past `absoluteExpiresAt`**.
- **Extend endpoint:** CSRF-protected, rate-limited (reuse the existing login limiter), operates **only** on an
  active, refreshable session; an expired session is **not** revived; rotate on extend. One per session type.
- **Expiry UX:** on expiry redirect to login with a **safe `returnTo`** (open-redirect rejected — same-origin
  path only) and the message "Oturumunuz sona erdi. Devam etmek için tekrar giriş yapın."; POST/form state is
  **never** silently re-submitted; Store/Platform Admin warn on unsaved form.
- **Warning:** accessible modal/banner shortly before idle expiry ("Oturumunuz 5 dakika içinde sona erecek",
  "Oturumu uzat" / "Çıkış yap"), focus-trapped, `aria-live` countdown.
- **Multi-tab:** `BroadcastChannel` (or storage-event fallback) — logout/expiry in one tab is observed by others.
- **Logout:** clears **all** related cookies (session + CSRF) and revokes the server session; password
  change/reset keeps its existing `revokeAllSessions`.
- **Login UI:** add a "Beni hatırla" checkbox to all three login forms (autocomplete already correct); no
  in-app password storage; browser/password-manager remains responsible for credentials.

## 5. Risks & migration sequence

- **Risk — session semantics change is security-sensitive & cross-app.** Sequence: (1) additive migration +
  policy module (no behaviour change; backfill absolute=idle); (2) gateway dual-gate validation + sliding
  refresh behind a flag; (3) extend endpoint (both types); (4) login remember-me UI + cookie-maxAge from policy;
  (5) expiry UX (returnTo + message + middleware); (6) warning modal + multi-tab; (7) tests + 3-app timing smoke
  (test-clock/config override — never a real 30-min wait). Each slice independently gated.
- **Risk — repurposing `expiresAt` meaning.** Mitigate by keeping the column, adding `absoluteExpiresAt`, and
  validating with `min(...)`; document clearly so no reader assumes `expiresAt` is still the absolute deadline.
- **Risk — customer 30d hardcode drift.** Remove the `customer-cookie.ts` constant; derive maxAge from policy.
- **Risk — CSRF gap on storefront extend.** The customer extend endpoint needs its own CSRF story (storefront
  currently relies on Server Actions + SameSite); design before build.
- **Test matrix (next phase):** remember-off/on expiry, idle vs absolute, extend, expired-cannot-extend,
  logout-all-cookies, token rotation, safe returnTo, open-redirect rejection, CSRF, multi-tab logout,
  autocomplete attributes, no-localStorage-token.

## 6. Decision

Adopt the additive two-gate (idle + absolute) + remember-me model with a single policy source and the behaviour
contract above.

## 7. Implementation (delivered 2026-08-04)

**Policy source (single).** `packages/config/src/session-policy.ts` — pure module (no `node:*`, no top-level
`process.env`), safe to import from gateway (Node) and Next BFF (server), values passed to client as props.
Exposes `SESSION_POLICY` windows, `isSessionValid`, `computeSessionExpiry`, `idleDeadline`/`sessionDeadline`,
`shouldBumpActivity`, `cookieMaxAgeSeconds`, `sessionTiming`, and `safeReturnTo`. Env overrides
(`SESSION_IDLE_TIMEOUT_SECONDS`, `SESSION_ABSOLUTE_EXPIRY_SECONDS`, remember-on variants,
`SESSION_WARNING_LEAD_SECONDS`, `SESSION_ACTIVITY_THROTTLE_SECONDS`) resolve via `resolveSessionPolicy(config)`;
defaults = §3 table. `resolveSessionPolicy` is default-tolerant (partial config → defaults; never NaN windows).

**Design choice — `expiresAt` kept, not repurposed.** Contrary to the §2 sketch, `expiresAt` is NOT repurposed to
the idle deadline. New columns `lastActivityAt`, `absoluteExpiresAt` (nullable, safe-additive), `rememberMe`,
`rotatedFromSessionId` were added; validity is `revokedAt == null && now ≤ min(lastActivityAt + idle(rememberMe),
absoluteExpiresAt ?? expiresAt)`. `expiresAt` is set = `absoluteExpiresAt` at login (back-compat) and the idle
deadline is **computed** from `lastActivityAt`, matching the governing spec formula. `absoluteExpiresAt` is
nullable so ADR-271-pre / concurrent main-branch inserts don't break; the validator falls back to `expiresAt`.

**Migration.** `20260804160000_adr271_unified_session_policy` — additive, `IF NOT EXISTS`, replay-safe; backfills
existing rows (`absoluteExpiresAt = expiresAt`, `lastActivityAt = updatedAt`, `rememberMe = false`); no drops/renames.

**Gateway.** `authenticatePlatform` (server.ts) and `resolveCustomerFromRequest` (customers/index.ts) now use the
shared evaluator + throttled activity bump (fire-and-forget; never past absolute; never per-mousemove — only on
authenticated API activity). Login computes both windows from `rememberMe`; `me` returns `session.timing`.
Extend endpoints `POST /auth/platform/extend` and `POST /public/stores/:slug/customer/extend`: active-only
(expired never revived), token **rotated** (`rotatedFromSessionId`, old token 401), absolute **unchanged**,
rate-limited (login limiter window), audited (`UPDATE` + `metadata.event=SESSION_EXTEND`).

**Store-admin note.** `store-admin-web` authenticates as a **PlatformSession** (calls `platformLogin`), so the
platform-side gateway changes cover both admin apps; only two session tables exist.

**BFF / three apps.** Cookie persistence derives from the gateway response (`rememberMe` → persistent `expires` =
absolute deadline; off → session cookie); the hardcoded customer-cookie 30d and CSRF 8h constants were removed.
Remember-me checkbox + helper on all three login forms (autocomplete already correct). Shared client `SessionGuard`
(accessible focus-trapped modal via `@commerce-os/ui`/local kit, `aria-live` countdown) drives warning → extend /
logout, computes idle locally from `me().timing` (mirrors server), re-checks `me()` before redirecting (cross-tab
/ skew safe), and syncs logout/expired/extended over **BroadcastChannel** (`*_session_sync` key — deliberately
distinct from the cookie name; carries only a message type, never a token) with a storage-event fallback. Expiry
redirects to login with a safe same-origin `returnTo` and the message *"Oturumunuz sona erdi. Devam etmek için
tekrar giriş yapın."* Storefront extend/timing/logout run as Server Actions (same-origin) over the httpOnly
`x-customer-session`; the guard mounts only for logged-in customers (no anonymous overhead).

**Security verified.** Session token stays in an httpOnly cookie (not readable by JS, not in localStorage —
confirmed in browser); CSRF double-submit on admin extend/logout; customer extend relies on Next Server-Action
same-origin + httpOnly cookie. `safeReturnTo`/`safeInternalPath`/`safeNextPath` reject external,
protocol-relative, backslash, control-char, encoded-scheme, and auth-loop paths.

**Tests.** 24 policy unit tests (`packages/config`), gateway integration (extend rotation, idle expiry,
expired-cannot-extend, remember-me windows, revoked rejection) + all pre-existing gateway tests updated for the
new fields; app tests for cookie persistence + open-redirect. **Real browser smoke** (admin-web full lifecycle:
remember-me, warning modal + countdown, extend, idle-expiry redirect + message, httpOnly, multi-tab logout;
storefront login + remember-me + mobile responsive) plus **live API smoke** against the real DB (platform + customer
login/me/extend/idle-expiry) with test-clock-shrunk windows (`SESSION_*` env) — no real 30-minute wait.

**Deferred (future TD).** Per-form unsaved-changes escalation beyond the pre-expiry warning modal, device/session
management UI, all-devices logout, session anomaly detection, social-login identity linking, provider
logout/revocation — see TECHNICAL_DEBT.md.

## 8. Post-Audit Hardening (2026-08-04) — status IN_PROGRESS

Cross-module review found deploy- and correctness-blocking gaps in the delivered work. Fixed on top of §7 (still
**uncommitted**; no commit/push/PR/merge/deploy). Follow-up migration `20260804170000_adr271_returns_session_hardening`
(additive, replay-safe, fast-default — no table rewrite, no unconditional full-table `UPDATE`).

- **M1 — Legacy session cutover (silent mass-logout averted).** The §7 backfill (`lastActivityAt = updatedAt`,
  `rememberMe = false`) would idle-collapse existing long sessions to 30 min on deploy. Added `policyVersion` (0 =
  legacy/grandfathered, 1 = native). `sessionDeadline`/`isSessionValid`/`sessionTiming` treat legacy sessions
  **absolute-only** (idle skipped) until first meaningful activity, which promotes them to native (`policyVersion=1`)
  with a fresh idle window — never exceeding the original absolute. Deterministic (column-driven). See §2.
- **M2 — Migration lock.** Backfill via PG fast-default (`ADD COLUMN … DEFAULT 0` then `SET DEFAULT 1`), not a
  full-table `UPDATE` inside the DDL transaction. The original §7 migration's `UPDATE … SET lastActivityAt` remains
  (immutable, already applied); its lock characteristic is documented in OPERATIONS deploy runbook.
- **M3 — Dead index removed.** `PlatformSession_absoluteExpiresAt_idx` / `CustomerSession_absoluteExpiresAt_idx`
  dropped — no sweep/range query references `absoluteExpiresAt` (validity is per-row tokenHash lookup).
- **S1 — Activity classification.** `/me`, logout, extend (passive session-management endpoints) now pass
  `countAsActivity=false` → they no longer refresh the idle window. Only meaningful authenticated activity bumps
  `lastActivityAt` (and promotes legacy sessions). Prevents `me()` polling from keeping an idle session alive forever.
- **S2 — Multi-tab false-expiry race.** A peer-tab `expired`/`extended` broadcast is no longer trusted blindly; the
  receiving tab reconciles via `me()` — if the (rotated) session is still valid it refreshes timing instead of
  logging out. Only a real server-confirmed expiry, or an explicit `logout` broadcast, ends the session.
- **S4 — Logout cookie/CSRF cleanup.** Admin + Store-Admin logout now clear the CSRF cookie (`clearCsrfCookie`,
  matching path/sameSite/secure) alongside the session cookie. Storefront uses Server Actions with a single
  httpOnly `x-customer-session` cookie (no double-submit CSRF cookie) and already clears it.
- **Migrate-before-app deploy order (required).** Migrations (both ADR-271 + hardening) MUST be applied before the
  new app boots. old-app/new-schema is safe (additive); new-app/old-schema is NOT supported — see OPERATIONS runbook.
- **S5 — Cookie Secure env hardening (CLOSED).** New shared parser `@commerce-os/utils` `resolveCookieSecure` /
  `resolveSameSite`: empty/whitespace env → default (production → `Secure=true`); `"true"` → true; `"false"` →
  dev/test only, **production FAIL-FAST (throws)**; invalid → prod fail-fast. All 5 cookie modules (Platform Admin
  + Store Admin session & CSRF, Storefront customer cookie) use it; session and CSRF cookies share one policy; set/
  clear options match (parity). Fixes the `ADMIN_COOKIE_SECURE=""` → accidental `Secure=false` footgun.
- **S3 — Activity throttle footgun (CLOSED).** `SESSION_ACTIVITY_THROTTLE_SECONDS` now `.positive()` (0 rejected at
  parse); `assertActivityThrottleSeconds` enforces a **production floor of 30 s** (default 300) via `loadConfig`
  fail-fast; sub-30 values allowed only in dev/test and cannot leak to production. Unit: seconds.
- **Tests.** +4 legacy policy unit tests + S3 throttle suite (`packages/config`), S5 parser suite
  (`packages/utils`), S5 cookie set/clear parity (`admin-web session-security`), and a real-DB legacy integration
  suite (`session-legacy.integration.test.ts`) — real-DB tests run against `commerce_os_test` with `DATABASE_URL`
  set (skipped in CI where no DB).

**Deferred TD.** S7 (client `warningLeadSeconds` not re-fetched from server between polls) and P3 (single-tab
pending-work refresh) remain **future** — low impact; see TECHNICAL_DEBT.

**Status.** ADR-271 → **ACCEPTED & DEPLOYED** (2026-08-05, PR #177; multi-tab logout + false-expiry reconciliation
verified in a real browser; migrate-before-app applied; docker stack rebuilt/recreated; post-deploy smoke green).
Unified Session Policy + Post-Audit Critical Hardening → **CLOSED & DEPLOYED**. **TODO-170 UNBLOCKED.** S7/P3 remain
future (TECHNICAL_DEBT). Doc fixes: `8 s`→`8 saat`; `expiresAt` repurpose contradiction resolved (kept, §2/§5).
