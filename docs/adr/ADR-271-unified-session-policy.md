# ADR-271 — Unified Session Policy (DESIGN ONLY — next independent phase)

- **Status:** ACCEPTED (design) / NOT IMPLEMENTED — next independent phase. **No implementation in this pass** — per direction, item 3 is limited to
  analysis, migration & data-model plan, the three-app policy contract, risks, and migration sequence.
  Implementation (migration, remember-me, idle/absolute expiry, extend endpoint, warning modal, multi-tab) is
  the **next independent phase**.
- **Date:** 2026-08-04
- **Related:** ADR-032 (single `Customer` identity), F3B.3 (`x-customer-session`), ADR-270 (this recovery closed
  blockers 1/2/4). **Blocks:** TODO-170 stays BLOCKED until this phase closes.

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

`expiresAt` is **repurposed in meaning to the idle deadline** (kept as the column name to avoid a rename);
`absoluteExpiresAt` becomes the second gate. Backfill: `absoluteExpiresAt = expiresAt`, `lastActivityAt = updatedAt`,
`rememberMe = false` for existing rows (documented approximation). Migration is additive and reversible.

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
contract above. Implement in the next phase per §5; TODO-170 remains BLOCKED until then.
