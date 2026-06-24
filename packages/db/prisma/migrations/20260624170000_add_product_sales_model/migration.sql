CREATE TYPE "ProductSalesMode" AS ENUM ('ONLINE', 'INQUIRY', 'APPOINTMENT', 'WHATSAPP', 'CATALOG_ONLY');

CREATE TYPE "ProductPriceVisibility" AS ENUM ('VISIBLE', 'HIDDEN', 'STARTING_FROM', 'ON_REQUEST');

CREATE TYPE "ProductPrimaryAction" AS ENUM ('ADD_TO_CART', 'REQUEST_PRICE', 'BOOK_APPOINTMENT', 'WHATSAPP', 'CONTACT_FORM', 'NONE');

ALTER TABLE "Product"
  ADD COLUMN "salesMode" "ProductSalesMode" NOT NULL DEFAULT 'ONLINE',
  ADD COLUMN "priceVisibility" "ProductPriceVisibility" NOT NULL DEFAULT 'VISIBLE',
  ADD COLUMN "primaryAction" "ProductPrimaryAction" NOT NULL DEFAULT 'ADD_TO_CART',
  ADD COLUMN "inquiryEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "appointmentRequired" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "whatsappEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "purchasable" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "minOrderQuantity" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "maxOrderQuantity" INTEGER,
  ADD COLUMN "callToActionLabel" TEXT,
  ADD COLUMN "whatsappMessageTemplate" TEXT,
  ADD COLUMN "inquiryFormTitle" TEXT,
  ADD COLUMN "appointmentNote" TEXT;

CREATE INDEX "Product_salesMode_idx" ON "Product"("salesMode");
CREATE INDEX "Product_purchasable_idx" ON "Product"("purchasable");
