# Product Support / Ürün Desteği — Faz 1 (TODO-177) — Design Spec

- **Durum:** APPROVED (design) · implementation başlamadı
- **Tarih:** 2026-08-10
- **İlgili ADR:** ADR-289 (Product Support Foundation & Guided Question Engine)
- **Kapsam etiketi:** TODO-177
- **Worktree:** `claude/product-support-phase-1-audit-2c6e71`

> Return / refund / cancellation bu domain'e taşınmaz ve DEĞİŞTİRİLMEZ. Bu iş yeni, izole bir
> `product-support` domain'i ekler; mevcut finansal/iade/iptal çekirdeğine dokunmaz.

---

## 1. Amaç

Müşterinin satın aldığı ürün için sipariş/ürün bağlamlı guided support akışı:
`context → topic seçimi → deterministik soru ağacı → self-service çözüm → gerekirse ticket escalation`.

Context (order/line/product/variant/customer) otomatik alınır; müşteri tekrar seçim yapmaz.
Self-service yeterliyse ticket açılmaz. "Sorunum çözülmedi" → ticket, tüm bağlam kaybolmadan taşınır.

---

## 2. Audit özeti — reuse haritası (yeni paralel altyapı YOK)

| İhtiyaç | Reuse edilecek şablon (repo-relative) |
|---|---|
| Tüm domain iskeleti (lifecycle+SLA+activity+version guard+assign+serialize) | `apps/api-gateway/src/order-experience/` (recovery-service.ts, recovery-read.ts, recovery-routes.ts) |
| Müşteri-yüz rota + private attachment | `apps/api-gateway/src/returns/routes-customer.ts`, `routes-attachment.ts` |
| Status history modeli | `ReturnStatusHistory` + `ReturnActorType` (`schema.prisma:5711/5542`) |
| Event ledger deseni | `OrderRefundEvent` (`schema.prisma:5890`) |
| Snapshot deseni | `OrderLine` immutable alanlar (`schema.prisma:1980`); `ReturnRequest.returnWindowEndsAt` (`5579`) |
| Numara sayacı | `ReturnNumberCounter` (PK storeId, `schema.prisma:5561`) + advisory lock |
| Attachment (private, auth-gated) | `ReturnAttachment` + `MediaContext.RETURN_ATTACHMENT` (`schema.prisma:5692/166`) |
| SLA hesap + badge | `recovery-service.ts` `computeDueAt`; `store-admin-web/lib/client/recovery-labels.ts` `slaState` |
| Store Admin inbox (list) | ADR-089 `store-admin-web/components/data-grid/*`; kolon örneği returns list |
| Store Admin detay (action+timeline+assign+not) | `store-admin-web/app/(app)/order-experience/[caseId]/page.tsx` |
| Assign-to-me / assign-to-user | recovery detay (`runAction("ASSIGN", { assigneePlatformUserId })`) + `listAssignableUsers` |
| Dark-glass UI kit (Tabs/Timeline YOK → port) | `store-admin-web/components/ui/index.tsx` + `app/components/premium.tsx` |
| Enum→label + tone (ham enum ASLA) | `store-admin-web/lib/client/recovery-labels.ts` (`humanize` fallback) |
| Platform Admin editör (version/publish/tabs/mapping) | `admin-web/app/(app)/theme-library/[id]/page.tsx` + `components/theme-library/{tabs,assignment-dialog}.tsx` |
| Platform Admin basit CRUD | `admin-web/app/(app)/plans/page.tsx` |
| Platform-owned policy sabiti | `packages/config/src/session-policy.ts` deseni (`DEFAULT_SESSION_POLICY`) |
| Zamanlı worker (gerekirse) | BullMQ Job Scheduler (`packages/queues` + `apps/worker`, reservation-expiry deseni) |
| Customer auth chokepoint | `apps/api-gateway/src/customers/index.ts` `resolveCustomerFromRequest` (x-customer-session) |
| Storefront read/mutation BFF | `storefront-web/lib/server/customer.ts` + `"use server"` action dosyaları |
| Order-line CTA host | `storefront-web/components/account/order-actions.tsx` (mevcut `support` panel placeholder) |
| Playwright | `tests/e2e/{regression,admin-regression}` + `fixtures/ids.ts` |
| i18n (tr default) | `packages/i18n` dictionaries + co-located label modülleri |

**Kritik audit bulguları (kilitli varsayımlar):**
- Domain servisleri `services/` altında DEĞİL, `apps/api-gateway/src/<domain>/` altındadır (`services/*` yalnız boundary stub).
- storeId çok-kiracılık **explicit where-clause** ile uygulanır (Prisma middleware/extension YOK). `tenantWhere` helper'ı kullanılmıyor — explicit storeId-first izle.
- **Gerçek bildirim teslimat sistemi YOK.** Sadece `PaymentNotificationDispatcher` kontrat stub'ı + `OrderEvent` timeline deseni + BullMQ plumbing. TD-110: `isConfigured=false` iken sahte "gönderildi" ÜRETİLEMEZ.
- **Warranty hiçbir yerde yok** — greenfield. `Shipment.deliveredAt` (returns'ün ADR-269 stabil teslim ankoru) mevcut.
- **`OrderLine.id` müşteri-DTO'sundan bilinçli çıkarılmış** — line-scoped destek için additive `orderLineId` gerekir + sunucuda re-validate.
- `admin-web`'de RHF/Zod bağımlılığı YOK (store-admin-web'de var) — question-set editörü için eklenecek.
- Dark-glass kit'te **Tabs & Timeline yok** — Tabs port (admin-web `theme-library/tabs.tsx` ARIA impl'inden), Timeline hand-rolled `<ol>`.

---

## 3. Kilitlenmiş kararlar

### Ticket statüleri & kurallar
- Statüler: `OPEN`, `WAITING_STORE`, `WAITING_CUSTOMER`, `RESOLVED`, `CLOSED`. `CANCELLED` YOK.
- İlk açılışta ticket **UNASSIGNED**. Assignment manuel; round-robin Faz 1'de yok.
- `RESOLVED` ticket müşteri tarafından **resolvedAt + 7 gün** içinde reopen edilebilir (→ `OPEN`).
- 7 gün sonrası reopen reddedilir; UI yeni ticket'a yönlendirir. `CLOSED` reopen edilemez → yeni ticket.

### Destek uygunluğu
- kullanım/kurulum/ürün bilgisi vb. için genel süre sınırı yok.
- garanti/servis desteği ürünün garanti süresine bağlı (bkz. §7 Warranty) — ama **süre dolmuş olsa bile ticket açılabilir**.

### SLA (KARAR 1 — topic-bazlı, platform-owned)
- **Topic-bazlı**: her `SupportTopic` için ayrı `firstResponseHours` + `resolutionHours` tanımlanabilir.
- Topic override yoksa **platform DEFAULT SLA** fallback kullanılır.
- Platform-owned; `packages/config`'te sabit (`DEFAULT_TICKET_SLA_POLICY`), opsiyonel env override. **Store Admin SLA'yı DEĞİŞTİREMEZ** (mutasyon yolu yok — config-only).
- İki hedef: first-response SLA + resolution SLA. `slaState` badge: `INSIDE | DUE_TODAY | OVERDUE | DONE` (recovery `slaState` birebir).
- SLA breach **read-time türetilir** (recovery deseni; kalıcı flag için worker Faz 1'de gerekmez).

### Attachment (KARAR 2 — self-service sırasında toplanmaz)
- Fotoğraf/PDF **yalnız** (a) ticket escalation oluşturulurken veya (b) ticket conversation mesajı içinde eklenir.
- Self-service wizard adımlarında attachment TOPLANMAZ → self-service ile çözülen akışlarda **orphan media oluşmaz**.
- Guided answers/context yine de eksiksiz korunur (`SupportTicketAnswerSnapshot`).
- video Faz 1'de yok. Mevcut media/security limitleri reuse (5 MB, `image/jpeg|png|webp` + **yeni** `application/pdf`).

### Warranty başlangıç tarihi (KARAR 3 — deterministik, ADR-289'da sabit)
- Anchor önceliği: **`MAX(Shipment.deliveredAt)`** (order'ın `DELIVERED` gönderileri; returns ADR-269 ile aynı stabil ankor).
- Fallback (deterministik): teslim edilmiş gönderi/`deliveredAt` yoksa → **`order.createdAt`** ankor alınır (satın alma anı; konservatif, asla bloklamaz). ADR-289 bu fallback'i açıkça dokümante eder.
- `warrantyEndsAt = anchor + Product.warrantyMonths` (takvim ayı; variant override varsa onu kullan).
- `Product.warrantyMonths` (ve variant override) **null ise gating YOK**; escalation her zaman mümkün.
- Süre dolmuş olsa bile ticket açılması **engellenmez**; yalnız eligibility/context bilgisi (in/out of warranty + warrantyEndsAt) gösterilir.

### Question-set ownership
- **Platform Admin owner**. Store içerik mutate EDEMEZ (3 tier mapping de platform-managed).
- Mağaza yeni/değişiklik talebini ileride Store→Platform Request sistemiyle iletir (bu PR'da YOK — future).

### Resolution hierarchy
1. store + product explicit mapping (`(storeId, productId, topic)`)
2. category mapping (`(storeId, categoryId, topic)` — primaryCategory ağacını kökten dip'e yürür)
3. platform DEFAULT (`(topic)`) — **zorunlu**, dead-end imkânsız.

### Escalation context (kaybolmadan taşınır)
order, orderLine, product, variant, customer, topic, tüm cevaplar (snapshot), attachments, attempted self-service resolution.

---

## 4. Domain modeli (Prisma — tüm alanlar additive, storeId-scoped, `onDelete` disiplini)

### Question domain (platform-owned, versiyonlu)
- **`SupportQuestionSet`** — mantıksal konteyner. `id, key @unique(global platform key), title, description?, isDefault Boolean, status SupportQuestionSetStatus(ACTIVE|INACTIVE), createdAt, updatedAt`.
  - NOT: platform-owned; `storeId` YOK (global şablonlar). Mapping tabloları store'a bağlar.
- **`SupportQuestionSetVersion`** — `id, questionSetId, version Int, status SupportQuestionSetVersionStatus(DRAFT|PUBLISHED|ARCHIVED), publishedAt?, createdByPlatformUserId?, createdAt`. `@@unique([questionSetId, version])`, `@@index([questionSetId, status])`.
  - "Aktif" versiyon = en son `PUBLISHED`. Ticket bu satırın `id`'sini snapshot'lar.
- **`SupportQuestion`** — `id, questionSetVersionId, key, type SupportQuestionType, prompt String, helpText String?, sortOrder Int, required Boolean @default(true), isEntry Boolean @default(false)`. `@@unique([questionSetVersionId, key])`, `@@index([questionSetVersionId, sortOrder])`.
- **`SupportQuestionOption`** — `id, questionId, key, label String, sortOrder Int`. `@@unique([questionId, key])`.
- **`SupportQuestionTransition`** — `id, questionSetVersionId, fromQuestionId, matchKind SupportTransitionMatchKind(OPTION|BOOLEAN_TRUE|BOOLEAN_FALSE|DEFAULT), matchOptionId?, action SupportTransitionAction(GO_TO_QUESTION|GO_TO_RESULT|ESCALATE), toQuestionId?, sortOrder Int`. `@@index([questionSetVersionId, fromQuestionId, sortOrder])`.
  - Deterministik: bir sorunun transition'ları `sortOrder`'da değerlendirilir, **ilk eşleşen kazanır**. select/boolean sorularında bir `DEFAULT` transition zorunlu.

### Mapping (resolution hierarchy — 3 tier de platform-owned)
- **`SupportProductQuestionSetMapping`** — `id, storeId, productId, topic SupportTopic, questionSetId, createdAt`. `@@unique([storeId, productId, topic])`, `@@index([storeId])`. FK product `onDelete: Cascade`.
- **`SupportCategoryQuestionSetMapping`** — `id, storeId, categoryId, topic SupportTopic, questionSetId, createdAt`. `@@unique([storeId, categoryId, topic])`.
- **`SupportTopicDefault`** — `id, topic SupportTopic @unique, questionSetId, createdAt, updatedAt`. Platform seviyesinde; **zorunlu** (seed ile 7 topic doldurulur).

### Ticket domain (store-scoped)
- **`SupportTicket`**
  - Immutable snapshot: `id, storeId, ticketNumber String, customerId, orderId, orderLineId, productId, variantId?, questionSetVersionId, topic SupportTopic, warrantyEndsAt DateTime?, warrantyAnchorSource String? (SHIPMENT_DELIVERED|ORDER_CREATED|NONE), suggestedResolutionKey String?, suggestedResolutionText String?, createdAt`.
  - Mutable: `status SupportTicketStatus @default(OPEN), assigneePlatformUserId String?, reopenCount Int @default(0), firstResponseAt DateTime?, resolvedAt DateTime?, closedAt DateTime?, lastActivityAt DateTime, version Int @default(0), updatedAt`.
  - FK: store Cascade; product/variant `onDelete: Restrict` (OrderLine deseni — geçmiş ticket ürünü pinler); order/orderLine Restrict.
  - `@@unique([storeId, ticketNumber])`, `@@index([storeId, status, lastActivityAt])`, `@@index([storeId, assigneePlatformUserId])`, `@@index([storeId, customerId])`.
- **`SupportTicketMessage`** (append-only konuşma) — `id, storeId, ticketId, actorType SupportActorType(CUSTOMER|STORE_ADMIN|SYSTEM), actorId String?, body String, createdAt`. `@@index([storeId, ticketId, createdAt])`. `updatedAt` YOK (immutable).
- **`SupportTicketAnswerSnapshot`** — `id, storeId, ticketId, questionKey String, questionPrompt String (snapshot metin), questionType SupportQuestionType, answerValue Json (optionKeys[]|boolean|text), sortOrder Int, createdAt`. `@@index([storeId, ticketId, sortOrder])`.
  - Soru seti sonradan değişse bile eski ticket'ın anlamı sabit (version + metin snapshot).
- **`SupportTicketAttachment`** (ReturnAttachment birebir) — `id, storeId, ticketId, ticketMessageId String?, mediaAssetId, type String @default("PHOTO") (PHOTO|PDF), createdAt`. FK mediaAsset `onDelete: Restrict`. `@@index([storeId]) @@index([ticketId]) @@index([mediaAssetId])`.
- **`SupportTicketStatusHistory`** (ReturnStatusHistory birebir) — `id, storeId, ticketId, fromStatus SupportTicketStatus?, toStatus SupportTicketStatus, actorType SupportActorType, actorId String?, eventType String?, note String?, metadata Json?, createdAt`. `@@index([storeId, ticketId, createdAt])`, `@@index([storeId, eventType, createdAt])`.
- **`SupportSlaSnapshot`** — `id, storeId, ticketId, cycle Int (1; reopen'da +1), topic SupportTopic, firstResponseDueAt DateTime, resolutionDueAt DateTime, firstResponseMetAt DateTime?, resolvedAt DateTime?, policyLabel String?, createdAt`. `@@unique([storeId, ticketId, cycle])`, `@@index([storeId, ticketId, cycle])`.
  - **Canlı SLA = ticket için en yüksek `cycle`'lı snapshot.** Reopen → yeni cycle satırı (taze dueAt'ler).
- **`SupportTicketNumberCounter`** (ReturnNumberCounter deseni) — `storeId String @id, lastValue Int @default(0)`.

### Warranty (Product/Variant, additive)
- `Product.warrantyMonths Int?` (null = warranty gating yok).
- `ProductVariant.warrantyMonths Int?` (opsiyonel override; null → product'a düşer).

### Enum'lar (yeni)
- `SupportTicketStatus { OPEN WAITING_STORE WAITING_CUSTOMER RESOLVED CLOSED }`
- `SupportActorType { CUSTOMER STORE_ADMIN SYSTEM }`
- `SupportTopic { PRODUCT_NOT_WORKING DAMAGED_OR_MISSING SETUP_USAGE WARRANTY_SERVICE PRODUCT_INFO INVOICE_DOCUMENT OTHER }`
- `SupportQuestionType { SINGLE_SELECT MULTI_SELECT BOOLEAN SHORT_TEXT LONG_TEXT INFO SELF_SERVICE_RESULT }`
- `SupportQuestionSetStatus { ACTIVE INACTIVE }`
- `SupportQuestionSetVersionStatus { DRAFT PUBLISHED ARCHIVED }`
- `SupportTransitionMatchKind { OPTION BOOLEAN_TRUE BOOLEAN_FALSE DEFAULT }`
- `SupportTransitionAction { GO_TO_QUESTION GO_TO_RESULT ESCALATE }`

### `Store` relation ekleri
`SupportTicket[]`, `SupportTicketStatusHistory[]`, mapping[]'ler, counter (returns deseni gibi Store'a back-relation dizileri).

---

## 5. Question engine (deterministik, saf modül)

`question-engine.ts` — framework-bağımsız, tam test edilebilir.

**Traverse (runtime):**
- Entry question (`isEntry=true`) ile başla.
- Cevap → o sorunun transition'larını `sortOrder`'da değerlendir; ilk eşleşen:
  - `matchKind=OPTION` + seçilen optionKey eşleşir → `matchOptionId`.
  - `BOOLEAN_TRUE/FALSE` → boolean cevap.
  - `DEFAULT` → her zaman eşleşir (fallback).
- `action`: `GO_TO_QUESTION`(toQuestionId) | `GO_TO_RESULT`(SELF_SERVICE_RESULT node'una) | `ESCALATE`.
- `INFO`/`SELF_SERVICE_RESULT` node'ları terminal; SELF_SERVICE_RESULT "Sorunum çözüldü" (bitir, ticket yok) / "Çözülmedi" (→ ESCALATE) sunar.
- **Arbitrary rule/script/expression engine YOK.**

**Publish-time validation (`validateQuestionGraph`):**
1. Tam olarak bir `isEntry` question var.
2. Her `SINGLE_SELECT`/`BOOLEAN` sorusunun tüm option/boolean değerleri + bir `DEFAULT` transition ile kapsanır (eksik → reddet).
3. **Cycle yok**: DFS; path üzerinde ziyaret edilen node'a dönüş → reddet.
4. **Dead-end yok**: her path bir `SELF_SERVICE_RESULT` veya `ESCALATE` ile biter; ulaşılamayan node → uyarı/red.
5. ESCALATE en az bir path'ten erişilebilir (ticket her zaman mümkün).
6. `MULTI_SELECT`/text soruları için deterministik: yalnız `DEFAULT` transition (branch'lenmez) — Faz 1 sadeliği.

Validation `question-service.ts` publish akışında zorunlu; DRAFT→PUBLISHED yalnız valid graph ile.

---

## 6. Resolution hierarchy (saf modül `resolution.ts`)

Girdi: `(storeId, productId, topic)`; ürünün `primaryCategoryId` + kategori ağacı.
1. `SupportProductQuestionSetMapping(storeId, productId, topic)` → varsa questionSet.
2. yoksa: primaryCategory'den köke doğru her ata için `SupportCategoryQuestionSetMapping(storeId, categoryId, topic)` → ilk eşleşen.
3. yoksa: `SupportTopicDefault(topic)` → **her zaman var** (seed garanti).
Seçilen questionSet'in en son `PUBLISHED` version'ı çalıştırılır. `PUBLISHED` version yoksa DEFAULT'un published'ına düş (dead-end guard).

---

## 7. Ticket lifecycle, SLA & reopen

**Create (self-service unresolved → ticket):**
- `resolveCustomerFromRequest` → `customer.id`; body'deki `orderId/orderLineId` sunucuda `(storeId, customerId)`'ye karşı re-validate (mismatch → 404).
- `prisma.$transaction`: advisory lock (storeId) → counter upsert (`ticketNumber = "S" + padStart(6)`) → SupportTicket create (snapshot alanlar + questionSetVersionId + warranty snapshot) → SupportTicketAnswerSnapshot[] (guided cevaplar) → SupportTicketAttachment[] (varsa) → SupportSlaSnapshot(cycle=1, topic SLA) → SupportTicketStatusHistory(→OPEN, actor CUSTOMER, eventType TICKET_OPENED) → notification emit (opened).
- İlk statü `OPEN`, UNASSIGNED.

**Transitions (`status-map.ts`, server-side validate):**
- İzinli geçişler (aktör bazlı): örn. store reply → `WAITING_CUSTOMER`; customer reply → `WAITING_STORE`; store `RESOLVED`; `RESOLVED`→`CLOSED` (store veya sistem/otomatik değil — manuel). Her geçiş `version` guard (`updateMany where version` `count!==1 → VERSION_CONFLICT`) + atomik status history.
- `firstResponseAt`: ilk STORE_ADMIN mesajında set (+ ilgili cycle SupportSlaSnapshot.firstResponseMetAt).
- `resolvedAt`: RESOLVED'a geçişte; `closedAt`: CLOSED'da.

**Assignment:** manuel; `assign-to-me` (sentinel "me" → actorUserId) / `assign-to-user` (listAssignableUsers). `version` guard.

**SLA:** ticket create/reopen'da `SupportSlaSnapshot` yazılır (topic policy → DEFAULT fallback). Canlı SLA = max cycle snapshot; `slaState(now)` badge read-time.

**Reopen (KARAR: taze döngü):**
- Yalnız ticket-owner müşteri; `status=RESOLVED`; `now <= resolvedAt + 7 gün`.
- `RESOLVED → OPEN`; `reopenCount++`; **yeni `SupportSlaSnapshot(cycle+1)`** (topic SLA'dan taze first-response + resolution dueAt); status history (eventType TICKET_REOPENED); notification (reopened).
- `now > resolvedAt + 7 gün` → `REOPEN_WINDOW_EXPIRED` → UI "yeni ticket aç".
- `CLOSED` → reopen imkânsız (`CLOSED_CANNOT_REOPEN`).

**Konuşma:** append-only `SupportTicketMessage`; actor CUSTOMER/STORE_ADMIN/SYSTEM. Ham enum UI'da gösterilmez.

---

## 8. Bildirim (in-app event + honest stub)

5 olay: `TICKET_OPENED`, `TICKET_STORE_REPLY`, `TICKET_CUSTOMER_REPLY`, `TICKET_RESOLVED`, `TICKET_REOPENED`.
- **In-app (primary):** `SupportTicketStatusHistory` (eventType) + `SupportTicketMessage`; müşteri Hesabım > Destek ve store-admin inbox'ta görünür (last activity, unread türetimi).
- **E-posta (stub):** `product-support/notification.ts` — `PaymentNotificationDispatcher` deseninde `SupportNotificationDispatcher { isConfigured, sendTicketNotification(...) }`; default `createLog...` no-op → `isConfigured=false` iken `delivery: "UNCONFIGURED"`, **sahte "sent" YOK** (TD-110). server.ts'te wire; gerçek sağlayıcı future.
- Yeni kanal sistemi KURULMAZ; BullMQ async Faz 1'de gereksiz (in-app senkron yeterli).

---

## 9. Güvenlik

- Müşteri: `resolveCustomerFromRequest`; her query/mutation `{ storeId, customerId }`; client'ın verdiği order/product/line context **trusted değil** → sunucuda `(storeId, customerId)` re-validate; existence sızmaması için mismatch → 404.
- Store admin: `requireStoreAdminForModule("PRODUCT_SUPPORT")` (yeni core `StoreModuleKey` veya core-always-on); yalnız kendi store ticket'ları; cross-store `findFirst({ id, storeId })` → 404.
- Question domain (set/version/question/option/transition/mapping/topic-default): **store write YOK**; yalnız `requireSuperAdmin`/platform admin.
- Attachment: `routes-attachment` auth-gated. Müşteri yalnız kendi ticket eki (`customerId` scoped); admin `storeId` scoped. `SUPPORT_ATTACHMENT` özel MediaContext; `/media/*` private-guard'a `support` segment; `buildStorageKey` + `STORAGE_KEY_PATTERN` `support` segment; PDF için `.pdf` uzantısı + pipeline dalı (sharp'ı atla, bytes as-is, `mimeType application/pdf`). Arbitrary storage key reddedilir. `MEDIA_IN_USE` guard'a `supportTicketAttachment.count`.
- status/assignee **server-authoritative**; transitions server-side validate.

---

## 10. Contracts & endpoint yüzeyi

Yeni Zod şemaları `packages/contracts/src/index.ts`; tip re-export `packages/api-client`.

**Customer (`/public/stores/:storeSlug/customer/support/*`):**
- `POST .../resolve` → `{ orderNumber, orderLineId, topic }` → resolved questionSet (entry question DTO) + context + warranty eligibility.
- `POST .../answer` (opsiyonel stateless step) veya client-driven traverse (tercih: engine client'ta çalışır, sunucu published version DTO'yu verir; deterministik). → sonraki node / self-service / escalate.
- `POST .../tickets` → guided answers + attachments(mediaId[]) → ticket create.
- `GET .../tickets` / `GET .../tickets/:ticketNumber` → müşteri ticket list/detail.
- `POST .../tickets/:ticketNumber/messages` → müşteri mesaj (+attachment).
- `POST .../tickets/:ticketNumber/reopen` → reopen.
- `POST .../support/attachments` → customer upload (returns customer attachment birebir; +PDF).
- `GET .../tickets/:ticketNumber/attachments/:attachmentId` → serve (customerId scoped).

**Store admin (`/stores/:storeId/support/*`):** list (filtre/sort/paginate), detail, `POST .../tickets/:id/messages` (reply), `POST .../tickets/:id/actions` (assign/status transition; `expectedVersion`), `GET assignable-users` (reuse), attachment serve (storeId scoped).

**Platform admin (`/platform/support/*` veya `/admin/...`):** question-set CRUD, version create/publish/archive, question/option/transition editör, graph validate, mapping CRUD (product/category), topic-default yönetimi.

---

## 11. UI yüzeyleri

**Storefront (`storefront-web`):**
- order-detail satırında "Ürün desteği al" CTA — `components/account/order-actions.tsx` mevcut `support` panel'i gerçek akışa bağlar; per-line entry `/account/support/new?order=..&line=..`.
- Guided wizard: client component, sunucudan published version DTO alır, engine ile traverse; context otomatik (order/line/product/variant) — müşteri seçmez. Attachment YOK bu adımda.
- Self-service result: çözüldü → bitir; çözülmedi → ticket create (answers snapshot + opsiyonel attachment).
- `/account/support` (list) + `/account/support/[ticketNumber]` (detay: konuşma, attachment ekleme, reopen).
- Read: `lib/server/support.ts`; mutation: `lib/server/support-actions.ts` (`"use server"` + revalidatePath).
- `OrderLine.id` müşteri order-detail DTO'suna additive eklenir (`customerOrderDetailLineSchema` + serializer); sunucuda re-validate korunur.

**Store Admin (`store-admin-web`):**
- Nav: `Destek > Ürün Desteği` (`components/store-nav.tsx` yeni group; inline locale label).
- Inbox: ADR-089 `useDataGridQuery` + `DataGridToolbar` + `DataGrid`. Kolonlar: ticket no, müşteri, ürün, sipariş, topic, status, assignee, first-response SLA, resolution SLA, last activity. Filtre: status, assignee, SLA risk/breach, topic, date, search.
- Detail: `order-experience/[caseId]` şablonu — context (order/product) + guided answers + attachments + konuşma + timeline + assignment + status actions + SLA. Transition'lar `expectedVersion` ile.
- `lib/client/ticket-labels.ts` (recovery-labels birebir: status/topic/actor/sla-state maps + tone + `humanize` fallback).
- Tabs/Timeline: Timeline hand-rolled `<ol>`; gerekiyorsa Tabs dark port.

**Platform Admin (`admin-web`):**
- Nav item (`components/admin-nav.tsx` + shared i18n `admin.nav`).
- `/question-sets` (list) + `/question-sets/[id]` (theme-library editör şablonu: version list + publish/archive + tabs [Questions | Options/Branches | Mappings]).
- Question ordering (sortOrder), option/branch editör, kategori & product mapping (assignment-dialog deseni), DEFAULT/topic-default yönetimi.
- RHF+Zod bağımlılıkları eklenir (`react-hook-form ^7.54`, `@hookform/resolvers ^3.10`, `zod ^3.24` — store-admin ile aynı sürüm); `product-form-schema.ts` kompozisyon deseni.

---

## 12. Test stratejisi

**Unit (saf modüller, `tests/unit` / co-located):**
- resolution hierarchy: explicit product → category → DEFAULT; DEFAULT fallback.
- question-set version snapshot (set değişse eski ticket sabit).
- branching (option/boolean/default deterministic).
- cycle & dead-end validation (reddedilen graf'lar).
- self-service result yolu; unresolved → ticket.
- context preservation (order/line/product/variant/customer/topic/answers/attachments/attempted-resolution).
- SLA: topic-based first-response + resolution dueAt hesap; DEFAULT fallback; slaState (INSIDE/DUE_TODAY/OVERDUE/DONE).
- warranty: deliveredAt anchor / order.createdAt fallback / null-no-gating / expired-still-open.

**Integration (`tests/integration`, gerçek DB):**
- assignment; status transitions (izinli/izinsiz); version conflict.
- first-response SLA met; resolution SLA.
- 7-day reopen boundary (içinde/dışında); CLOSED cannot reopen; reopen fresh cycle snapshot.
- cross-store isolation; cross-customer isolation; attachment authorization (own/other → 404).
- **return/refund/cancel domain unaffected** (regression assertion — bu domainlerin mevcut testleri yeşil kalır; support domain onlara yazmaz).

**Playwright (mevcut harness REUSE):**
- Storefront `@regression` (`tests/e2e/regression/NN-product-support.spec.ts`): order → product support → guided questions → self-service path → unresolved → ticket → customer message → resolved → reopen.
- Store Admin `@admin-regression` (`tests/e2e/admin-regression/NN-product-support.spec.ts`): support inbox → ticket detail → assign → reply → status lifecycle → SLA display (ham enum sızmaz assertion).
- Deterministik kritik read/navigation smoke'a eklenebilir (inbox list load). Mutation-heavy akışlar regression'da.
- `tests/e2e/fixtures/ids.ts`'e `support` fixture bloğu (seeded ticket + question-set); `e2e-seed.mjs` idempotent ek.

---

## 13. Fixture & seed stratejisi

- **Question-set seed:** platform DEFAULT question-set'ler (7 topic için en az DEFAULT + 1 published version) — deterministik seed (`packages/db/scripts` mevcut seed'lere additive; enterprise-demo bozulmaz). `SupportTopicDefault` 7 satır.
- **E2E seed (`e2e-seed.mjs`):** `e2e-store` için 1 published DEFAULT question-set (dallanma + self-service + escalate içeren), 1 warrantyMonths'lu ürün, 1 seeded ticket (admin akışları için). `fixtures/ids.ts`'e id'ler.
- Idempotent; enterprise-demo/pristine invariant korunur.

---

## 14. Etkilenen servisler / paketler

| Paket/App | Değişiklik |
|---|---|
| `packages/db` | schema.prisma yeni modeller/enum'lar + Product/Variant warrantyMonths; 1 migration + seed additive |
| `packages/config` | `ticket-sla-policy.ts` (DEFAULT_TICKET_SLA_POLICY topic map) + opsiyonel env |
| `packages/contracts` | support Zod şemaları (customer/admin/platform DTO) |
| `packages/api-client` | tip re-export + (admin) client method'ları |
| `apps/api-gateway` | yeni `product-support/*` domain; server.ts route wiring; media (SUPPORT_ATTACHMENT context, PDF pipeline, private-guard segment, storage-key regex, MEDIA_IN_USE count); customers order-detail DTO'ya orderLineId |
| `apps/storefront-web` | support BFF + actions + guided wizard + support pages + order-line CTA |
| `apps/store-admin-web` | inbox + detail + nav + ticket-labels |
| `apps/admin-web` | question-set yönetimi + nav + RHF/Zod deps |
| `packages/i18n` | tr/en support copy (storeAdmin/storefront/admin) + parity test |
| `tests/e2e` | regression + admin-regression specs + fixtures/ids + e2e-seed |

**Etkilenmeyen (dokunulmaz):** returns, refunds, order-experience (recovery), cancellation, financial reporting, cart/checkout, shipping çekirdek davranışı. Bu domainlere yalnız **read pattern reuse** var, mutasyon yok.

---

## 15. Rollback riskleri & azaltım

- **Migration additive** (yeni tablolar + nullable kolonlar); geri alım = tabloları drop. Mevcut veriye dokunmaz → düşük blast-radius.
- **warrantyMonths nullable** → mevcut ürünler etkilenmez; gating opt-in.
- **orderLineId DTO ekleme additive** → mevcut storefront kırılmaz (opsiyonel alan).
- **Media pipeline PDF dalı**: image akışı değişmez; PDF ayrı branch → regresyon riski izole; media testleri korur.
- **Capability gating** (`PRODUCT_SUPPORT` core-always-on) → tenant'lara zorunlu görünürlük; feature-flag ile kapatılabilir (istenirse).
- **Notification stub** → hiçbir gerçek e-posta gitmez; `isConfigured=false` → yan etki yok.
- **Question domain platform-only** → store admin yanlışlıkla içerik bozamaz.
- Rollback sırası: deploy revert → migration down (yeni tablolar) → warrantyMonths kolon drop (son). Idempotent seed geri-uyumlu.

---

## 16. Fazlar (A→G) — özet (ayrıntı writing-plans planında)

- **A** — Schema + migration + config topic-SLA policy + saf engine'ler (question-engine/resolution/sla/warranty/status-map) + unit testler.
- **B** — Backend servisler + rotalar (customer/admin/platform) + contracts + api-client + attachment (media+PDF) + notification stub + orderLineId DTO + integration testler.
- **C** — Platform Admin question-set UI (RHF/Zod).
- **D** — Storefront guided flow + ticket UI + order-line CTA.
- **E** — Store Admin inbox + detail + nav + labels.
- **F** — Playwright regression (storefront+admin) + smoke + fixtures/seed.
- **G** — Gate (db:generate→typecheck→lint→test→build→e2e→git diff --check) + commit/PR/CI/merge/migration/deploy/post-deploy smoke + docs (ROADMAP/TODO/TESTING/DECISIONS+ADR-289/TECHNICAL_DEBT).

Her faz sonunda checkpoint: hedeflenen testler yeşil + kısa rapor + kullanıcı onayı → sonraki faz.

---

## 17. Scope dışı (bu PR'da YOK → future/tech-debt)

AI chatbot, LLM-generated answers, live chat/websocket, auto assignment/round-robin, custom store SLA editing, video attachments, return/refund/cancel workflow rewrite, Store→Platform Request sistemi, marketplace support.
