# CART Change Awareness & Price Movement Notifications — Design & Analysis

> **TODO-168** · Design/spec + implementation record.
>
> ## ✅ STATUS: IMPLEMENTED (2026-08-03, worktree, commit YOK) — hybrid model per [ADR-267](../adr/ADR-267-cart-change-semantics.md)
>
> **Faz B implemented on top of the Persistent Cart (ADR-266) hybrid model.** Snapshot/ack authority is
> **identity-split** (auth = DB `CartLine` snapshot columns + `CartChangeAck`, genuine cross-device; anon =
> signed `commerce_os_cart_meta` cookie), driven by one shared pure engine
> (`apps/api-gateway/src/cart-changes/change-engine.ts`). The §2–§4/§8/§10 "cookie-carried, zero-migration"
> framing below is **superseded by [ADR-267](../adr/ADR-267-cart-change-semantics.md) + the
> [roadmap](./PERSISTENT-CART-roadmap.md) Faz B** for the authenticated path; §1 audit, §5 change types, §6
> fingerprint/dedup, §7 acknowledgement, §9 three-tier checkout, §12 analytics, §13 UX, §15 tests remain the
> behaviour reference and are what shipped. Gate GREEN (build 27/27 · lint 42/42 · typecheck · test:
> gateway 2184 / storefront 534 / store-admin 364 · `git diff --check`). No commit/push/PR/merge/deploy.
>
> **Original pause context (historical):** implementation was deferred until the Persistent Cart foundation
> landed (it did — TODO-167 / ADR-266, merged `0a602d2`). The cookie-only design premises for the
> authenticated path were then replaced as noted above.
>
> **What stays valid regardless of the foundation:**
> - **§1 (audited architecture)** — accurate as of 2026-08-03; the durable reference.
> - **§5 change types**, **§6 fingerprint/dedup**, **§7 acknowledgement rules**, **§9 three-tier checkout
>   blocking**, **§12 analytics**, **§15 tests**, **§17 future** — the *behaviour* is foundation-independent.
>
> **What must be revisited once Persistent Cart lands (design premises that will change):**
> - **§2/§3/§4 snapshot & ack home** — with a persisted cart, the reference snapshot + acknowledgement move
>   to **server-side cart-line state** (not the `commerce_os_cart_meta` cookie). The whole "cookie-carried,
>   zero-migration" framing is superseded; snapshot becomes an additive column/table on the persisted cart
>   line, and authenticated ack becomes genuinely server-side + cross-device (§17's future item becomes the
>   default, not a future).
> - **§3.4 meta↔cookie binding** — replaced by the persisted cart's own identity/versioning.
> - **§8 cart merge** — the persisted cart will have a real login-time merge; the "oldest meaningful
>   `addedAt` snapshot wins / never migrate an ack across users" rule (§8) becomes a **hard requirement**,
>   not a future note.
> - **§10 contracts** — snapshot no longer travels in the request body; it is server-owned.
>
> Original approved scope: storefront cart change awareness (price / discount / stock / availability) with
> acknowledgement and checkout safety. **No commit/push/PR/merge/deploy** was performed; **no code was
> written** — only this analysis doc.

## 0. Constraints (from prompt)

- Do **not** touch the Marketplace repository.
- Do **not** work on Gift Card or Financial Reporting.
- Do **not** touch PB-3 / TD-139 (offsite backup) scope.
- Build **one** pricing/availability engine — reuse the existing server-authoritative path; **no parallel
  pricing engine.**
- Additive-only data model & migration (no drop/delete; safe backfill for existing carts).

---

## 1. Existing cart / pricing architecture (audited)

Evidence-backed audit (2026-08-03). The single most important fact drives the whole design:

**The cart is stateless and cookie-only. There is NO `Cart` / `CartLine` table in the database.**

- **Cart storage:** HMAC-signed httpOnly cookie `commerce_os_cart` holding only
  `CartItem[] = { variantId, quantity }` — `apps/storefront-web/lib/cart-token.ts:15-18`. No price, title,
  currency, or stock is ever cached client-side (documented invariant, `cart-token.ts:5-11`).
- **Mutations:** Next.js **server actions** (`"use server"`) —
  `apps/storefront-web/lib/server/cart-actions.ts` (`addToCartAction`, `updateCartItemAction`,
  `removeCartItemAction`, `reconcileCartAction`); each calls `revalidateCart()` (revalidates `/`, `/cart`,
  `/checkout`).
- **Read path:** every render calls `POST /public/stores/:slug/cart`
  (`apps/api-gateway/src/server.ts:6126-6189`) → `buildPublicCartIndex` (fresh DB variant rows + live
  inventory) → `assemblePublicCart` (`server.ts:2441-2588`) → `buildPublicCartLine`
  (`server.ts:2243-2313`). **Price/stock/discount are recomputed server-authoritative on every read;** no
  snapshot is trusted until an order is placed.
- **Authenticated vs anonymous:** the **same cookie** for both. Auth only adds default-address shipping
  pricing + DB wallet coupons (`apps/storefront-web/lib/server/cart.ts:287-330`, `x-customer-session`).
- **Login cart merge:** **none.** The cookie already stays on the device; `loginAction` /
  `registerCompleteAction` merge only wishlist + recently-viewed (`auth-actions.ts:89-109`). In-request
  dedupe (`mergeCartItems`, `server.ts:2316-2322`; client `sanitizeItems`, `cart-token.ts:71-81`) sums
  quantity by `variantId`, caps `[1,999]` per line, `MAX_ITEMS=100`.
- **Pricing:** `unitPriceMinor = variant.priceMinor`; `compareAtMinor` only when `> unitPriceMinor`
  (`server.ts:2299-2303`). Campaigns via pure `computeDiscounts` (`campaigns/discount-engine.ts:345`),
  computed **only when `checkoutReady`**, surfaced per line as `discountedUnitPriceMinor` /
  `discountedLineTotalMinor` (`server.ts:2558-2571`). ADR-066 largest-remainder pro-rata.
- **Availability:** derived, no boolean column. `available = onHand − reserved` clamped ≥0
  (`server.ts:2759`); `inStock = available === null ? true : available > 0` (`server.ts:2118-2120`) —
  **unknown stock ⇒ in-stock.** `orderable = salesMode==="ONLINE" && purchasable &&
  isPublicPriceVisible(...)` (`server.ts:2269-2270`). Line status enum:
  `OK | OUT_OF_STOCK | QUANTITY_ADJUSTED | UNAVAILABLE` (`contracts/src/index.ts:3917-3922`).
- **Checkout:** `POST /public/stores/:slug/checkout` (`server.ts:6320+`) re-resolves the cart with the same
  `assemblePublicCart`; rejects on `!checkoutReady` → `409 CART_NOT_READY` (stock), invalid coupon
  → `409 COUPON_INVALID`, shipping. **It does NOT compare or reject on price drift** and there is **no cart
  version.** Order snapshots the **current DB price** at creation (`server.ts:4363/4387/4393`).
- **Currency:** integer minor units everywhere; `currency` a per-variant 3-letter string; single-currency
  cart (`orderableCurrency ?? lines[0]?.currency ?? "TRY"`, `server.ts:2476`); **no FX conversion** anywhere.
- **Money DTOs:** `publicCartLineSchema` / `publicCartSchema` (`contracts/src/index.ts:3929-3983`).
- **Event/analytics reuse template:** no generic outbox. Closest reuse = `RecommendationEvent`
  (`schema.prisma:4593`) / `HomeDiscoveryEvent` — FK-minimal, KVKK-hashed identity, `dedupeKey`-idempotent,
  retention sweep + `QueueJobLog`. Client emits best-effort (`sendBeacon`/`keepalive`) to a BFF proxy
  `/api/*/event` → gateway `insertEvent` (`recommendation-events/data.ts:122`).
- **Existing cart notice slots:** reconciled banner `role="status"` (`components/cart-view.tsx:84-92`) and
  blocked-notice (`cart-view.tsx:382-384`). No price/stock-change bar today. Line row `CartLineRow`
  (`cart-view.tsx:126`), price block (`cart-view.tsx:244-276`). ProductMediaFrame `line-thumbnail` variant
  exists (TD-173).

---

## 2. Product decision

Every cart line keeps a **reference snapshot** captured at add-time / last user confirmation:
`addedUnitPriceMinor`, `addedListPriceMinor` (compareAt), `addedDiscountedUnitPriceMinor`,
`addedCurrency`, `addedVariantId`, `addedInStock`, `addedOrderable`, `addedAt`.

- **Checkout price is ALWAYS the current server-authoritative price.** Unchanged.
- **The snapshot is used only to explain a change** — never as an order price. (Reinforces the existing
  invariant "client snapshot'a güvenme".)
- Because the cart is stateless-cookie for both anon and auth (deliberate architecture), **the snapshot
  and acknowledgement state live in the HMAC-signed cart cookie** — same mechanism for both identities.
  Zero migration for the core diffing feature. (Approved decision #1.)

---

## 3. Data model

**Core diffing = ZERO schema change.** The reference snapshot + acknowledgement set travel in the cart
cookie.

### 3.1 Cookie shape (extended, additive & backward-compatible)

The primary `commerce_os_cart` cookie is **unchanged** (`{variantId, quantity}`). A separate signed
`commerce_os_cart_meta` cookie carries the reference snapshot per variant + the ack set (compact keys keep
it within budget, see §3.3):

```ts
// commerce_os_cart      — UNCHANGED:  CartItem = { variantId, quantity }
// commerce_os_cart_meta — NEW, additive, best-effort (safely ignorable):
interface CartMeta {
  v: number;            // payload schema version (bump on shape change; unknown/old ⇒ discard → re-baseline)
  cid: string;          // cartId — MUST equal the primary cart cookie's cartId (binding, see §3.4)
  s: Record<string, {   // keyed by variantId; absent entry ⇒ baseline on first resolve
    u: number;          // addedUnitPriceMinor
    l: number | null;   // addedListPriceMinor (compareAt)
    d: number | null;   // addedDiscountedUnitPriceMinor
    c: string;          // addedCurrency
    k: 0 | 1;           // addedInStock (bit)
    o: 0 | 1;           // addedOrderable (bit)
    t: number;          // addedAt (epoch seconds)
  }>;
  a: string[];          // acknowledged fingerprints (bounded, e.g. last 50)
}
```

### 3.4 Meta ↔ primary cookie binding & orphan cleanup (REQUIRED)

- The primary cart cookie carries a stable **`cartId`** (a random id minted when the cart is first created;
  add it to the cart token envelope alongside `items`, additive — legacy tokens without `cartId` get one on
  first write). `commerce_os_cart_meta.cid` **must equal** that `cartId`.
- On every resolve/reconcile the server compares `meta.cid` and `meta.v` against the primary cookie:
  **mismatched `cid` or unknown `v` ⇒ discard the meta cookie entirely and re-baseline** (treated as a fresh
  cart). This prevents a stale meta cookie from a previous cart binding to a new one.
- **Cart reset / reconcile / clear** (cart emptied, `reconcileCartAction`, cookie rotation) **clears the meta
  cookie** so no orphan snapshots/acks survive. Removing a line prunes that variant's snapshot + its
  fingerprints from `a`.

- Legacy cookies (no `s`) → **baseline established on first resolve** from the current server-authoritative
  value (approved / spec §9). This is the documented **audit boundary**: for a pre-existing cart the first
  observed value is the baseline, so changes are detected only from that point forward.
- Snapshot re-baselines when the user **acknowledges** the change for that line (the current value becomes
  the new reference), and when the line is added/replaced.

### 3.2 `CartChangeEvent` (additive analytics/audit table — approved decision #3)

Modeled on `RecommendationEvent`. **Analytics/audit only — NOT the source of truth for the UI** (changes
are derived deterministically on read; this table records that they happened). One additive migration, no
backfill.

```prisma
model CartChangeEvent {
  id           String   @id @default(cuid())
  storeId      String
  cartId       String                 // stable per-cookie id (hashed cart token id), NOT PII
  eventType    String                 // cart_change_detected | _viewed | _acknowledged | _checkout_blocked | _item_removed
  changeType   String?                // PRICE_DECREASED | PRICE_INCREASED | DISCOUNT_STARTED | DISCOUNT_ENDED | VARIANT_OUT_OF_STOCK | VARIANT_BACK_IN_STOCK | PRODUCT_UNAVAILABLE | PRODUCT_AVAILABLE_AGAIN
  severity     String?                // INFO | WARN | BLOCKING
  variantId    String?                // FK-less (measurement store convention)
  productId    String?
  oldValueMinor Int?
  newValueMinor Int?
  currency     String?
  placement    String?                // CART_BAR | CART_LINE | CHECKOUT
  fingerprint  String?                // change fingerprint (per §6)
  dedupeKey    String?                // = hash(eventType, fingerprint) — idempotency key for the upsert
  customerId   String?
  visitorHash  String?                // KVKK HMAC (no raw IP/UA)
  createdAt    DateTime @default(now())
  store        Store    @relation(fields: [storeId], references: [id], onDelete: Cascade)
  @@index([storeId, cartId, createdAt])
  @@index([storeId, changeType, createdAt])
  @@unique([storeId, cartId, dedupeKey])   // detected-event idempotency
}
```

Retention: reuse the existing `setTimeout` self-chaining retention-worker pattern
(`recommendation-events/retention-worker.ts`), env-gated, advisory-locked, `QueueJobLog`-logged. Off by
default.

### 3.3 Cookie budget

The meta cookie is **versioned (`v`), HMAC-signed, and size-limited**. It must stay under the 4 KB
per-cookie limit; worst case `MAX_ITEMS=100`. **A real byte-size test at the 100-item boundary is a
required test** (assert the signed, serialized cookie ≤ budget with 100 snapshots + a full ack set).
Mitigations:
- Compact single-char keys + epoch-seconds (above).
- **Snapshot only lines that materially need it** and drop the snapshot object when it equals the current
  value after re-baseline (no `s` entry ⇒ "in sync").
- **Severity-aware pruning (REQUIRED):** if the signed payload would exceed budget, `serializeWithinBudget()`
  prunes **oldest INFO / in-sync snapshots first** (by `addedAt`), and **must preserve snapshots that
  currently yield WARN or BLOCKING changes** (`PRICE_INCREASED`, `DISCOUNT_ENDED`, `VARIANT_OUT_OF_STOCK`,
  `PRODUCT_UNAVAILABLE`). Classification uses the current computed line values available on the write-back
  path (resolve/reconcile). Cart items are **never** dropped. Pruning is logged; degradation = fewer INFO
  notices, never a lost WARN/BLOCKING or a broken cart. If even the WARN/BLOCKING-only set exceeds budget
  (pathological), keep the most recent by `addedAt` and log.
- **Split cookie (DECIDED):** keep `commerce_os_cart` unchanged for `{variantId, quantity}` (lowest
  regression) and put snapshots + acks in a **separate** signed cookie `commerce_os_cart_meta` keyed by
  `variantId` (its own 4 KB budget). The primary cart cookie contract is untouched; meta is best-effort and
  safely ignorable.
- Hard guard: a `serializeWithinBudget()` that, if exceeded, drops oldest snapshots/acks first (never drops
  cart items) and logs; degradation = fewer change notices, never a broken cart.

---

## 4. Snapshot behaviour

- **Capture:** baseline written on the first resolve where `s` is missing (reuses the existing
  `reconcileCartAction` write-back path that already persists gateway-canonical items to the cookie).
- **Compare:** on each cart read the server receives the snapshot (in the request body, additive optional
  field on `publicCartItemInputSchema`) and the current computed line; a **pure engine** diffs them.
- **Re-baseline:** on per-line acknowledge, on add/replace of the line.
- **Never** an order price.

---

## 5. Change types & mapping

| changeType | trigger (minor-unit, same currency) | severity | checkout |
|---|---|---|---|
| `PRICE_DECREASED` | current unit < snapshot unit | INFO | not blocked |
| `PRICE_INCREASED` | current unit > snapshot unit | WARN | **409 until fingerprint acked** |
| `DISCOUNT_STARTED` | snapshot had no active discount, now does | INFO | not blocked |
| `DISCOUNT_ENDED` | snapshot had active discount, now none | WARN | **409 until fingerprint acked** |
| `VARIANT_OUT_OF_STOCK` | snapshot in-stock → now out | BLOCKING | **blocked; ack insufficient — fix line** |
| `VARIANT_BACK_IN_STOCK` | snapshot out → now in | INFO | not blocked |
| `PRODUCT_UNAVAILABLE` | snapshot orderable → now not | BLOCKING | **blocked; ack insufficient — fix line** |
| `PRODUCT_AVAILABLE_AGAIN` | snapshot not orderable → now orderable | INFO | not blocked |

Rules:
- **Quantity change is never a price change** and never produces a change event. Quantity adjustment
  (`QUANTITY_ADJUSTED`) remains a hard checkout block (existing `checkoutReady`), ack-insufficient.
- All money comparisons in **minor units**.
- **Currency mismatch is NOT a price movement:** if `addedCurrency !== currency`, suppress price/discount
  change types (only re-baseline). FX is never shown as a product price change.
- Effective unit for price comparison = discounted unit when a campaign applies, else unit price — but
  `DISCOUNT_STARTED/ENDED` are emitted from discount presence, and `PRICE_*` from base unit, so a campaign
  toggling does not double-count as both a price move and a discount move (deterministic precedence:
  discount-presence change → `DISCOUNT_*`; otherwise base-unit delta → `PRICE_*`).

---

## 6. Event generation & deduplication

Pure module `apps/api-gateway/src/cart-changes/change-engine.ts` (mirrors `discount-engine.ts` purity;
`now` injected). Input: `{ snapshot, current }` per line + acked fingerprint set. Output:
`CartChange[] { changeType, severity, requiresAck, blocking, oldValueMinor, newValueMinor, currency,
fingerprint, acknowledged }` + per-line marker.

- **Fingerprint** = stable hash of `(storeId, cartId, variantId, changeType, oldValueMinor,
  newValueMinor)`. Deterministic; **store-scoped** (cross-store isolation).
- **Dedupe:** the same change (same fingerprint) does not re-emit / re-persist. A **new** price change
  (different `newValueMinor`) ⇒ new fingerprint ⇒ surfaces again and **invalidates the old ack** (approved
  decision #4).
- **Acknowledged** = fingerprint ∈ cookie ack set. Ack is **per-fingerprint** only.
- **Line removed** ⇒ its snapshot/acks/active changes drop with it (they live on the cookie line).

**Read must not emit uncontrolled events (REQUIRED).** Deriving changes on read is pure and side-effect-free
— it never writes. `CartChangeEvent` rows are written **only** through an **idempotent upsert keyed on
`@@unique([storeId, cartId, dedupeKey])`**, where `dedupeKey = hash(eventType, fingerprint)`. So a
`cart_change_detected` for a given `(cartId, fingerprint, eventType)` is written **at most once** no matter
how many times the cart is re-read/re-rendered; the same holds for `_viewed` / `_acknowledged` /
`_checkout_blocked` / `_item_removed` (each its own `eventType`, same fingerprint). Re-render of an
unchanged cart produces **zero** new rows. Persistence is best-effort and off the render hot path (fire via
the BFF ingest proxy), never blocking the cart response.

---

## 7. Acknowledgement behaviour

- Cookie ack set (`commerce_os_cart_meta.a`) holds acknowledged fingerprints (bounded, e.g. last 50).
- Server actions: `acknowledgeCartChangeAction(fingerprint)` (dismiss one) and
  `acknowledgeAllCartChangesAction()` (mark all currently-shown fingerprints seen). Both update the cookie
  + re-baseline the acked lines + `revalidateCart()`.
- **Acknowledgement does not resolve a problem:** BLOCKING changes (stock/unavailable/qty) stay blocked
  after ack. Ack only clears the informational surface and unblocks the WARN (`PRICE_INCREASED`,
  `DISCOUNT_ENDED`) checkout gate for that fingerprint.
- **New change after ack re-appears** (new fingerprint, not in ack set).
- **Anon vs auth:** both use the cookie (there is no server-side cart). Documented deviation from the
  literal "auth ack server-side" — a server cart does not exist; a cross-device auth ack table
  (`CustomerCartChangeAck`) is a documented **future** option, not built now.

---

## 8. Anonymous → authenticated cart merge

No server-side cart merge exists (cookie stays on device). Therefore:
- The cart cookie (items **+ snapshots + acks**) simply persists across login — snapshots and acks are
  preserved automatically; nothing is copied between users.
- If a future server-cart merge is introduced, the rule is: **keep the oldest meaningful `addedAt`
  snapshot** when duplicate lines merge; acks stay with their fingerprint; **never migrate an ack to a
  different user.** (Documented for the future path.)

---

## 9. Checkout repricing (safety)

Extend `POST /checkout` (server-authoritative; client snapshot never trusted for price):
1. Re-resolve cart via `assemblePublicCart` (unchanged).
2. Recompute changes from `{snapshot (from cookie), current}` using the same pure engine.
3. **Block order** if any BLOCKING change or `!checkoutReady` (stock / unavailable / qty) → existing
   `409 CART_NOT_READY` semantics, now enriched with the changed lines.
4. **Block order** if any WARN (`PRICE_INCREASED` / `DISCOUNT_ENDED`) fingerprint is **not** in the ack set
   → `409 CART_CHANGED` with `{ lines: [...changed], changes: [...] }`.
5. Response returns the current cart state + which line changed and why; client redirects to `/cart`.

Order price stays the current server price (unchanged).

---

## 10. API / BFF contracts

- **Request (additive):** `publicCartItemInputSchema` gains optional `snapshot` (compact); cart request
  gains optional `acknowledgedFingerprints: string[]`. (Server reads them from the cookie server-side in
  practice; the schema stays additive.)
- **Response (additive):** `publicCartSchema` gains `changes: CartChange[]` (cart-level, ordered by
  severity) and each `publicCartLineSchema` gains `change: CartLineChange | null`.
- `CartChange` fields: `changeType, severity, requiresAck, blocking, variantId, productId, title,
  variantTitle, imageUrl, oldValueMinor, newValueMinor, currency, fingerprint, acknowledged, occurredAt?`.
- **All computation server-side; client only renders.**
- BFF: new server actions for acknowledge one/all; analytics via new BFF proxy `/api/cart/change-event`
  → gateway ingest (RecommendationEvent-style, HMAC identity server-side).

---

## 11. Store Admin visibility

No separate admin module this phase. If a read-only surface is cheap, expose `CartChangeEvent` history on
an existing order/cart debug surface; otherwise **future**. (Approved: keep minimal.)

---

## 12. Analytics

Client (best-effort, via BFF proxy, KVKK — no PII):
`cart_change_detected`, `cart_change_viewed`, `cart_change_acknowledged`, `cart_change_checkout_blocked`,
`cart_change_item_removed`. Fields: `storeId, cartId, productId, variantId, changeType, oldValueMinor,
newValueMinor, placement, timestamp`. Persisted in `CartChangeEvent` (idempotent via `dedupeKey`).

---

## 13. UX & accessibility

- **Cart bar** at top of `/cart`: heading `Sepetinizle ilgili değişiklikler`; per-change row with
  ProductMediaFrame `line-thumbnail`, product + variant, old→new value, changeType label, occurred-time
  (if needed), dismiss/ack action; "Tümünü gördüm". Attention-grabbing but not alarmist.
- **Line markers** in `CartLineRow`: price-down / price-up / discount-ended / out-of-stock / unavailable —
  never color-only (icon + text). Price-down shows old snapshot, current price, delta amount/percent.
  Price-up explicitly surfaced pre-checkout.
- Controlled `aria-live` (polite) region; keyboard access; visible focus; accessible dismiss label; mobile
  no-overflow; readable price delta. TR/EN full parity.

---

## 14. Tenant isolation

Fingerprint + `CartChangeEvent` are store-scoped; `cartId` is a hashed cookie id (not PII); cross-store
carts cannot collide. Variant/product ids resolved only within the store slug's store (existing guard).

---

## 15. Testing

Pure-engine unit tests: price down / up / discount start / discount end / OOS / back-in-stock / product
unavailable / available-again / quantity-change-no-event / duplicate-state-no-duplicate-event / second
price change = new event / ack / ack-then-new-event-reappears / currency-mismatch-suppressed. Contract/
integration: cart endpoint returns changes; checkout `CART_CHANGED` (WARN unacked) & `CART_NOT_READY`
(BLOCKING); anon cart; auth cart; (future) merge rule; cross-store isolation; order snapshot uses current
price; legacy-cookie backfill baseline.

---

## 16. Browser smoke (real stack, enterprise-demo)

Add → drop price → verify bar → raise price → verify new message → remove campaign → deplete stock →
verify checkout block → acknowledge → new change re-appears → anon→login persistence → restore prices &
stock. Viewports 375 / 768 / 1024 / 1440. **Leave enterprise-demo pristine.**

---

## 17. Future scopes

- `FREE_SHIPPING_ELIGIBILITY_CHANGED` (cart-level aggregate) — future.
- `SELLER_CHANGED` — N/A for single-seller Modular; marketplace-only — future.
- `CustomerCartChangeAck` server-side ack for cross-device authenticated ack — future.
- Read-only admin cart-change history surface — future.

---

## 18. Deltas from the literal prompt (because the cart is stateless-cookie)

1. Snapshot lives on the **cart cookie**, not a `CartLine` row (no such row exists).
2. Acknowledgement is **cookie-scoped for both** anon and auth (no server cart to hold auth ack);
   server-side auth ack is a future additive.
3. `CartChangeEvent` is **analytics/audit only**; the UI's change list is derived deterministically on read
   (not read from the table).
4. Core diffing needs **no migration**; the only additive migration is the analytics table.
