-- TODO-094B — Shipping provider safe external verification.
-- "Kimlik bilgisi kayitli" ile "gercek baglanti test edildi" ayrimi icin son GERCEK
-- provider HTTP testinin meta alanlari. lastTestStatus artik OK/FAILED disinda
-- HTTP_DISABLED/SKIPPED de tutabilir (string kolon; enum degil). HTTP transport
-- kapaliyken (SHIPPING_SANDBOX_HTTP_ENABLED=false) test ASLA OK yazmaz.

-- AlterTable
ALTER TABLE "ShippingProviderConfig" ADD COLUMN "lastProviderHttpStatus" INTEGER;
ALTER TABLE "ShippingProviderConfig" ADD COLUMN "lastProviderTestType" TEXT;
