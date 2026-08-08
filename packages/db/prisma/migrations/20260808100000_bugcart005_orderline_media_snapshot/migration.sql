-- BUG-CART-005 — OrderLine purchase-time cover media snapshot (additive, nullable).
-- Sipariş geçmişi thumbnail'i satın alma anında varyantın efektif medya ekseninden
-- (renk) çözülen ProductImage.storageKey'ini kalıcı tutar; ürün medyası sonradan
-- değişse bile geçmiş sipariş görseli sabit kalır. Eski kalemlerde NULL (backfill YOK).
ALTER TABLE "OrderLine" ADD COLUMN "mediaStorageKey" TEXT;
