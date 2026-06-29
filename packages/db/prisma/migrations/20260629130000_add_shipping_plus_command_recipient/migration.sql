-- F3C.1 — DHL Plus Command / createRecipient revizyonu.
-- 1) ShippingCredentialType enum'a PLUS_COMMAND eklenir (DHL Plus Command X-IBM cifti).
-- 2) ShippingProviderConfig.allowRecipientCreate guard kolonu (varsayilan KAPALI).
--    Canli createRecipient ancak env flag (DHL_ECOMMERCE_ALLOW_RECIPIENT_CREATE) +
--    bu alan + request explicitConfirm uclusu saglaninca calisir; aksi halde 409
--    RECIPIENT_CREATE_DISABLED. Bu turda canli/sandbox createRecipient YOK.

-- AlterEnum
ALTER TYPE "ShippingCredentialType" ADD VALUE IF NOT EXISTS 'PLUS_COMMAND' BEFORE 'STANDARD_COMMAND';

-- AlterTable
ALTER TABLE "ShippingProviderConfig" ADD COLUMN "allowRecipientCreate" BOOLEAN NOT NULL DEFAULT false;
