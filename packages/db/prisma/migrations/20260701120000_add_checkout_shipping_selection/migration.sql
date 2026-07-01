-- TODO-125 (ADR-047) — Checkout kargo sağlayıcı/seçenek seçimi.
-- ADDITIVE-only: mevcut veriye dokunmaz, değer silmez/yeniden adlandırmaz.

-- Order: checkout'ta seçilen kargo sağlayıcı/seçenek SNAPSHOT'i (tarihsel sabitlik).
-- shippingProvider taşıyıcı kimliği (ShippingProviderType), shippingProviderName
-- görünen ad, shippingLogoUrl public logo (secret DEĞİL), shippingEtaText tahmini teslim.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "shippingProvider" "ShippingProviderType";
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "shippingProviderName" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "shippingLogoUrl" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "shippingEtaText" TEXT;

-- ShippingRatePlan: checkout seçenek kartında gösterilecek tahmini teslim metni.
ALTER TABLE "ShippingRatePlan" ADD COLUMN IF NOT EXISTS "deliveryEstimate" TEXT;
