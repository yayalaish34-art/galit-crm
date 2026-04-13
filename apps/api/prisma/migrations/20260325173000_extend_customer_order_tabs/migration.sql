ALTER TABLE "CustomerOrder"
ADD COLUMN "internalNotes" TEXT,
ADD COLUMN "extraCost" DECIMAL(18,2),
ADD COLUMN "orderSource" TEXT,
ADD COLUMN "lastUpdatedBy" TEXT,
ADD COLUMN "confirmationSent" BOOLEAN,
ADD COLUMN "lastUpdatedAtLegacy" TIMESTAMP(3),
ADD COLUMN "lastUpdatedTime" TEXT,
ADD COLUMN "billingSettings" TEXT,
ADD COLUMN "nextBillingDate" TIMESTAMP(3),
ADD COLUMN "billingStatus" TEXT,
ADD COLUMN "billingFromDate" TIMESTAMP(3),
ADD COLUMN "recurringChargesCount" TEXT,
ADD COLUMN "billingEndMode" TEXT,
ADD COLUMN "billingAfterValue" TEXT,
ADD COLUMN "accountingReceiptNumber" TEXT,
ADD COLUMN "accountingInvoiceNumber" TEXT,
ADD COLUMN "accountingTransferDate" TIMESTAMP(3),
ADD COLUMN "accountingStatus" TEXT,
ADD COLUMN "nextAccountingTransferDate" TIMESTAMP(3),
ADD COLUMN "accountingCategory" TEXT,
ADD COLUMN "accountingReferenceText" TEXT;

CREATE TABLE "OrderDocument" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "importLegacyId" TEXT,
    "rowOrder" INTEGER NOT NULL DEFAULT 0,
    "documentDescription" TEXT,
    "documentType" TEXT,
    "fileName" TEXT,
    "filePath" TEXT,
    "documentDate" TIMESTAMP(3),
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OrderDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrderChargeTransaction" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "importLegacyId" TEXT,
    "rowOrder" INTEGER NOT NULL DEFAULT 0,
    "periodNumber" TEXT,
    "approvalNumber" TEXT,
    "chargeDate" TIMESTAMP(3),
    "billingMethod" TEXT,
    "transactionType" TEXT,
    "chargeAmount" DECIMAL(18,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OrderChargeTransaction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrderDocument_orderId_idx" ON "OrderDocument"("orderId");
CREATE INDEX "OrderDocument_importLegacyId_idx" ON "OrderDocument"("importLegacyId");
CREATE INDEX "OrderChargeTransaction_orderId_idx" ON "OrderChargeTransaction"("orderId");
CREATE INDEX "OrderChargeTransaction_importLegacyId_idx" ON "OrderChargeTransaction"("importLegacyId");

ALTER TABLE "OrderDocument" ADD CONSTRAINT "OrderDocument_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "CustomerOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderChargeTransaction" ADD CONSTRAINT "OrderChargeTransaction_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "CustomerOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
