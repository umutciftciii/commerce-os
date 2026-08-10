-- CreateEnum
CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'WAITING_STORE', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SupportActorType" AS ENUM ('CUSTOMER', 'STORE_ADMIN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "SupportTopic" AS ENUM ('PRODUCT_NOT_WORKING', 'DAMAGED_OR_MISSING', 'SETUP_USAGE', 'WARRANTY_SERVICE', 'PRODUCT_INFO', 'INVOICE_DOCUMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "SupportQuestionType" AS ENUM ('SINGLE_SELECT', 'MULTI_SELECT', 'BOOLEAN', 'SHORT_TEXT', 'LONG_TEXT', 'INFO', 'SELF_SERVICE_RESULT');

-- CreateEnum
CREATE TYPE "SupportQuestionSetStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "SupportQuestionSetVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SupportTransitionMatchKind" AS ENUM ('OPTION', 'BOOLEAN_TRUE', 'BOOLEAN_FALSE', 'DEFAULT');

-- CreateEnum
CREATE TYPE "SupportTransitionAction" AS ENUM ('GO_TO_QUESTION', 'GO_TO_RESULT', 'ESCALATE');

-- CreateEnum
CREATE TYPE "SupportMappingScope" AS ENUM ('PRODUCT', 'CATEGORY');

-- AlterEnum
ALTER TYPE "MediaContext" ADD VALUE 'SUPPORT_ATTACHMENT';

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "warrantyMonths" INTEGER;

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "warrantyMonths" INTEGER;

-- CreateTable
CREATE TABLE "SupportQuestionSet" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "status" "SupportQuestionSetStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportQuestionSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportQuestionSetVersion" (
    "id" TEXT NOT NULL,
    "questionSetId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "SupportQuestionSetVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdByPlatformUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportQuestionSetVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportQuestion" (
    "id" TEXT NOT NULL,
    "questionSetVersionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "type" "SupportQuestionType" NOT NULL,
    "prompt" TEXT NOT NULL,
    "helpText" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "isEntry" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportQuestionOption" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SupportQuestionOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportQuestionTransition" (
    "id" TEXT NOT NULL,
    "questionSetVersionId" TEXT NOT NULL,
    "fromQuestionId" TEXT NOT NULL,
    "matchKind" "SupportTransitionMatchKind" NOT NULL,
    "matchOptionId" TEXT,
    "action" "SupportTransitionAction" NOT NULL,
    "toQuestionId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SupportQuestionTransition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportQuestionSetMapping" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "scope" "SupportMappingScope" NOT NULL,
    "targetId" TEXT NOT NULL,
    "topic" "SupportTopic" NOT NULL,
    "questionSetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportQuestionSetMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTopicDefault" (
    "id" TEXT NOT NULL,
    "topic" "SupportTopic" NOT NULL,
    "questionSetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTopicDefault_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "ticketNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderLineId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "questionSetVersionId" TEXT NOT NULL,
    "topic" "SupportTopic" NOT NULL,
    "warrantyEndsAt" TIMESTAMP(3),
    "warrantyAnchorSource" TEXT,
    "suggestedResolutionKey" TEXT,
    "suggestedResolutionText" TEXT,
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
    "assigneePlatformUserId" TEXT,
    "reopenCount" INTEGER NOT NULL DEFAULT 0,
    "firstResponseAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicketMessage" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "actorType" "SupportActorType" NOT NULL,
    "actorId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportTicketMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicketAnswerSnapshot" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "questionKey" TEXT NOT NULL,
    "questionPrompt" TEXT NOT NULL,
    "questionType" "SupportQuestionType" NOT NULL,
    "answerValue" JSONB NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportTicketAnswerSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicketAttachment" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "ticketMessageId" TEXT,
    "mediaAssetId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'PHOTO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportTicketAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicketStatusHistory" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "fromStatus" "SupportTicketStatus",
    "toStatus" "SupportTicketStatus" NOT NULL,
    "actorType" "SupportActorType" NOT NULL,
    "actorId" TEXT,
    "eventType" TEXT,
    "note" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportTicketStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportSlaSnapshot" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "cycle" INTEGER NOT NULL,
    "topic" "SupportTopic" NOT NULL,
    "firstResponseDueAt" TIMESTAMP(3) NOT NULL,
    "resolutionDueAt" TIMESTAMP(3) NOT NULL,
    "firstResponseMetAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "policyLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportSlaSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicketNumberCounter" (
    "storeId" TEXT NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicketNumberCounter_pkey" PRIMARY KEY ("storeId")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupportQuestionSet_key_key" ON "SupportQuestionSet"("key");

-- CreateIndex
CREATE INDEX "SupportQuestionSet_status_idx" ON "SupportQuestionSet"("status");

-- CreateIndex
CREATE INDEX "SupportQuestionSetVersion_questionSetId_status_idx" ON "SupportQuestionSetVersion"("questionSetId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SupportQuestionSetVersion_questionSetId_version_key" ON "SupportQuestionSetVersion"("questionSetId", "version");

-- CreateIndex
CREATE INDEX "SupportQuestion_questionSetVersionId_sortOrder_idx" ON "SupportQuestion"("questionSetVersionId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "SupportQuestion_questionSetVersionId_key_key" ON "SupportQuestion"("questionSetVersionId", "key");

-- CreateIndex
CREATE INDEX "SupportQuestionOption_questionId_idx" ON "SupportQuestionOption"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "SupportQuestionOption_questionId_key_key" ON "SupportQuestionOption"("questionId", "key");

-- CreateIndex
CREATE INDEX "SupportQuestionTransition_questionSetVersionId_fromQuestion_idx" ON "SupportQuestionTransition"("questionSetVersionId", "fromQuestionId", "sortOrder");

-- CreateIndex
CREATE INDEX "SupportQuestionSetMapping_storeId_scope_topic_idx" ON "SupportQuestionSetMapping"("storeId", "scope", "topic");

-- CreateIndex
CREATE INDEX "SupportQuestionSetMapping_questionSetId_idx" ON "SupportQuestionSetMapping"("questionSetId");

-- CreateIndex
CREATE UNIQUE INDEX "SupportQuestionSetMapping_storeId_scope_targetId_topic_key" ON "SupportQuestionSetMapping"("storeId", "scope", "targetId", "topic");

-- CreateIndex
CREATE UNIQUE INDEX "SupportTopicDefault_topic_key" ON "SupportTopicDefault"("topic");

-- CreateIndex
CREATE INDEX "SupportTopicDefault_questionSetId_idx" ON "SupportTopicDefault"("questionSetId");

-- CreateIndex
CREATE INDEX "SupportTicket_storeId_status_lastActivityAt_idx" ON "SupportTicket"("storeId", "status", "lastActivityAt");

-- CreateIndex
CREATE INDEX "SupportTicket_storeId_assigneePlatformUserId_idx" ON "SupportTicket"("storeId", "assigneePlatformUserId");

-- CreateIndex
CREATE INDEX "SupportTicket_storeId_customerId_idx" ON "SupportTicket"("storeId", "customerId");

-- CreateIndex
CREATE INDEX "SupportTicket_orderId_idx" ON "SupportTicket"("orderId");

-- CreateIndex
CREATE INDEX "SupportTicket_productId_idx" ON "SupportTicket"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicket_storeId_ticketNumber_key" ON "SupportTicket"("storeId", "ticketNumber");

-- CreateIndex
CREATE INDEX "SupportTicketMessage_storeId_ticketId_createdAt_idx" ON "SupportTicketMessage"("storeId", "ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportTicketAnswerSnapshot_storeId_ticketId_sortOrder_idx" ON "SupportTicketAnswerSnapshot"("storeId", "ticketId", "sortOrder");

-- CreateIndex
CREATE INDEX "SupportTicketAttachment_storeId_idx" ON "SupportTicketAttachment"("storeId");

-- CreateIndex
CREATE INDEX "SupportTicketAttachment_ticketId_idx" ON "SupportTicketAttachment"("ticketId");

-- CreateIndex
CREATE INDEX "SupportTicketAttachment_mediaAssetId_idx" ON "SupportTicketAttachment"("mediaAssetId");

-- CreateIndex
CREATE INDEX "SupportTicketStatusHistory_storeId_ticketId_createdAt_idx" ON "SupportTicketStatusHistory"("storeId", "ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportTicketStatusHistory_storeId_eventType_createdAt_idx" ON "SupportTicketStatusHistory"("storeId", "eventType", "createdAt");

-- CreateIndex
CREATE INDEX "SupportSlaSnapshot_storeId_ticketId_cycle_idx" ON "SupportSlaSnapshot"("storeId", "ticketId", "cycle");

-- CreateIndex
CREATE UNIQUE INDEX "SupportSlaSnapshot_storeId_ticketId_cycle_key" ON "SupportSlaSnapshot"("storeId", "ticketId", "cycle");

-- AddForeignKey
ALTER TABLE "SupportQuestionSetVersion" ADD CONSTRAINT "SupportQuestionSetVersion_questionSetId_fkey" FOREIGN KEY ("questionSetId") REFERENCES "SupportQuestionSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportQuestion" ADD CONSTRAINT "SupportQuestion_questionSetVersionId_fkey" FOREIGN KEY ("questionSetVersionId") REFERENCES "SupportQuestionSetVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportQuestionOption" ADD CONSTRAINT "SupportQuestionOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "SupportQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportQuestionTransition" ADD CONSTRAINT "SupportQuestionTransition_questionSetVersionId_fkey" FOREIGN KEY ("questionSetVersionId") REFERENCES "SupportQuestionSetVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportQuestionTransition" ADD CONSTRAINT "SupportQuestionTransition_fromQuestionId_fkey" FOREIGN KEY ("fromQuestionId") REFERENCES "SupportQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportQuestionTransition" ADD CONSTRAINT "SupportQuestionTransition_toQuestionId_fkey" FOREIGN KEY ("toQuestionId") REFERENCES "SupportQuestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportQuestionTransition" ADD CONSTRAINT "SupportQuestionTransition_matchOptionId_fkey" FOREIGN KEY ("matchOptionId") REFERENCES "SupportQuestionOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportQuestionSetMapping" ADD CONSTRAINT "SupportQuestionSetMapping_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportQuestionSetMapping" ADD CONSTRAINT "SupportQuestionSetMapping_questionSetId_fkey" FOREIGN KEY ("questionSetId") REFERENCES "SupportQuestionSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTopicDefault" ADD CONSTRAINT "SupportTopicDefault_questionSetId_fkey" FOREIGN KEY ("questionSetId") REFERENCES "SupportQuestionSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "OrderLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_questionSetVersionId_fkey" FOREIGN KEY ("questionSetVersionId") REFERENCES "SupportQuestionSetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicketMessage" ADD CONSTRAINT "SupportTicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicketAnswerSnapshot" ADD CONSTRAINT "SupportTicketAnswerSnapshot_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicketAttachment" ADD CONSTRAINT "SupportTicketAttachment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicketAttachment" ADD CONSTRAINT "SupportTicketAttachment_ticketMessageId_fkey" FOREIGN KEY ("ticketMessageId") REFERENCES "SupportTicketMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicketAttachment" ADD CONSTRAINT "SupportTicketAttachment_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicketStatusHistory" ADD CONSTRAINT "SupportTicketStatusHistory_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportSlaSnapshot" ADD CONSTRAINT "SupportSlaSnapshot_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicketNumberCounter" ADD CONSTRAINT "SupportTicketNumberCounter_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

