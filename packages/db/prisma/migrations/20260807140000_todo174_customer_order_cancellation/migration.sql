-- TODO-174 (ADR-275/ADR-277/ADR-278) — Customer Self-Service Order Cancellation.
-- TÜMÜYLE ADDITIVE + geri uyumlu (migrate-before-app güvenli): tüm yeni Order kolonları nullable ya da
-- DEFAULT'lu; hiçbir kayıt backfill edilmez; hiçbir mevcut kolon/enum değiştirilmez/silinmez.
--   * OrderCancellationSource       = iptali başlatan aktör (CUSTOMER self-servis / ADMIN / SYSTEM).
--   * OrderCancellationReasonCategory + OrderCancellationReason = platform-tanımlı iptal nedeni taksonomisi
--     (Store Admin CRUD YOK; kategori contracts registry'de kod→kategori eşlemesiyle türetilir; OTHER
--     açıklama zorunlu — ADR-278). Kaldırma = registry INACTIVE (enum değeri kalıcı, raporlar korunur).
--   * Order.cancelSource/cancelReasonCode/cancelReasonCategory/cancelReasonNote = iptal provenance snapshot'i
--     (legacy serbest-metin `cancelReason` KORUNUR; geriye-dönük görüntüleme). Hepsi nullable.
--   * Order.version = optimistic concurrency (self-servis iptal ↔ admin handoff yarışı; updateMany guard).
--     DEFAULT 0 → mevcut TÜM siparişler version=0 ile başlar; yeni iptal akışı guard'lar.

-- CreateEnum
CREATE TYPE "OrderCancellationSource" AS ENUM ('CUSTOMER', 'ADMIN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "OrderCancellationReasonCategory" AS ENUM ('ORDER_MISTAKE', 'PRICE_PROMOTION', 'DELIVERY', 'PAYMENT', 'PRODUCT_DECISION', 'OTHER');

-- CreateEnum
CREATE TYPE "OrderCancellationReason" AS ENUM ('WRONG_PRODUCT', 'WRONG_VARIANT_SIZE_COLOR', 'WRONG_QUANTITY', 'DUPLICATE_ORDER', 'ACCIDENTAL_ORDER', 'FOUND_CHEAPER_ELSEWHERE', 'COUPON_DISCOUNT_NOT_AS_EXPECTED', 'TOTAL_PRICE_TOO_HIGH', 'DELIVERY_ESTIMATE_TOO_LONG', 'SHIPPING_FEE_TOO_HIGH', 'WILL_NOT_ARRIVE_IN_TIME', 'WRONG_PAYMENT_METHOD', 'INSTALLMENT_OR_PAYMENT_OPTION_UNSUITABLE', 'PAYMENT_CONCERN', 'NO_LONGER_NEEDED', 'CHANGED_MIND', 'PREFER_DIFFERENT_PRODUCT', 'OTHER');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "cancelReasonCategory" "OrderCancellationReasonCategory",
ADD COLUMN     "cancelReasonCode" "OrderCancellationReason",
ADD COLUMN     "cancelReasonNote" TEXT,
ADD COLUMN     "cancelSource" "OrderCancellationSource",
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;
