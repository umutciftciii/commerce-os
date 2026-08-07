# ADR-278 — Cancellation Reason Taxonomy (Platform-Governed)

**Durum:** ACCEPTED & DEPLOYED (2026-08-07; PR #191 merge `5ce426d`; CI lint·test·build 4m13s PASS).

**İlişkili:** [ADR-275](ADR-275-customer-order-cancellation-authority.md),
[ADR-269](ADR-269-returns-authority-and-lifecycle.md) (`ReturnReason` enum+i18n deseni — genişletilerek mirror).

---

## Bağlam

İptal nedeni ZORUNLU + platform-tanımlı merkezi taksonomi. Store Admin taksonomiyi DEĞİŞTİREMEZ. Her reason:
stable immutable `code`, category code, TR/EN label, active/inactive, displayOrder. Reason SİLME yok
(kullanımdan kaldırılan `INACTIVE`; geçmiş raporlar korunur). Mevcut `ReturnReason` deseni saf enum + i18n +
Zod; ama active/inactive + displayOrder + category **taşımaz**.

## Karar

Taksonomi = **Prisma enum (stored value) + platform-owned kod registry (metadata) + i18n label**.

- **Prisma enums** (`packages/db/prisma/schema.prisma`): `OrderCancellationReasonCategory` (6),
  `OrderCancellationReason` (18). Enum değeri KALICI (silinmez → tarihsel satır/rapor güvenli).
- **Registry** (`packages/contracts` `CANCELLATION_REASON_TAXONOMY`): `{code, category, active, displayOrder}[]`
  — TEK OTORİTE (server whitelist + client seçim listesi). Platform-owned; Store Admin CRUD YOK. Kaldırma =
  `active:false` (enum değeri kalır). Yardımcılar: `activeCancellationReasons()`, `isActiveCancellationReason`,
  `cancellationReasonCategory(code)`, `cancellationReasonRequiresNote(code)`.
- **i18n** (`packages/i18n` storefront `cancellations` + store-admin `order-shared.ts` bilingual maps): TR/EN.
- **Doğrulama**: `reasonCode` yalnız AKTİF taksonomiden kabul (inactive/bilinmeyen → `INVALID_REASON` 400).
  Kategori client'tan alınmaz — server registry'den TÜRETİR + doğrular. `OTHER` → açıklama zorunlu
  (`NOTE_REQUIRED` 400); diğerlerinde opsiyonel. Client refund tutarı KABUL EDİLMEZ.

### Başlangıç taksonomisi
`ORDER_MISTAKE` (WRONG_PRODUCT, WRONG_VARIANT_SIZE_COLOR, WRONG_QUANTITY, DUPLICATE_ORDER, ACCIDENTAL_ORDER) ·
`PRICE_PROMOTION` (FOUND_CHEAPER_ELSEWHERE, COUPON_DISCOUNT_NOT_AS_EXPECTED, TOTAL_PRICE_TOO_HIGH) ·
`DELIVERY` (DELIVERY_ESTIMATE_TOO_LONG, SHIPPING_FEE_TOO_HIGH, WILL_NOT_ARRIVE_IN_TIME) ·
`PAYMENT` (WRONG_PAYMENT_METHOD, INSTALLMENT_OR_PAYMENT_OPTION_UNSUITABLE, PAYMENT_CONCERN) ·
`PRODUCT_DECISION` (NO_LONGER_NEEDED, CHANGED_MIND, PREFER_DIFFERENT_PRODUCT) · `OTHER` (OTHER).
**NOT:** "Teslimat adresini yanlış girdim" EKLENMEDİ — operasyonel olarak düzeltilebilir bir problem.

Kayıtta saklanan (Order): `cancelReasonCategory`, `cancelReasonCode`, `cancelReasonNote?`,
`cancelSource=CUSTOMER`, `cancelledAt`.

## Sonuçlar
- `+` Type-safe + tarihsel-güvenli (enum) + zengin metadata (registry: active/displayOrder/category).
- `+` Store Admin yalnız RAPORLARI görür; taksonomi değişikliği gelecekteki `Store → Platform Request & Task
  Management` domain'i üzerinden (bu fazda IMPLEMENT EDİLMEZ).
- `−` Enum + registry çift-kaynak: yeni reason eklerken hem Prisma enum hem registry güncellenmeli (kasıtlı;
  enum tarihsel bütünlük, registry sunum/aktiflik).
