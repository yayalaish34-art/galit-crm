CREATE TABLE "TransactionJournalEntry" (
    "id" TEXT NOT NULL,
    "importLegacyId" TEXT,
    "number" TEXT,
    "status" TEXT,
    "workStatus" TEXT,
    "weekday" TEXT,
    "date" TIMESTAMP(3),
    "deliveryDate" TIMESTAMP(3),
    "customerId" TEXT,
    "customerName" TEXT,
    "contactName" TEXT,
    "linkedCustomerName" TEXT,
    "transactionType" TEXT,
    "productName" TEXT,
    "quantity" DECIMAL(18,4),
    "price" DECIMAL(18,2),
    "deliveryLocation" TEXT,
    "coordinateDay" TEXT,
    "phone" TEXT,
    "basketOrRefNumber" TEXT,
    "stage" TEXT,
    "supplierName" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TransactionJournalEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TransactionJournalEntry_importLegacyId_idx" ON "TransactionJournalEntry"("importLegacyId");
CREATE INDEX "TransactionJournalEntry_date_idx" ON "TransactionJournalEntry"("date");
CREATE INDEX "TransactionJournalEntry_deliveryDate_idx" ON "TransactionJournalEntry"("deliveryDate");
CREATE INDEX "TransactionJournalEntry_stage_idx" ON "TransactionJournalEntry"("stage");
CREATE INDEX "TransactionJournalEntry_status_idx" ON "TransactionJournalEntry"("status");
CREATE INDEX "TransactionJournalEntry_customerId_idx" ON "TransactionJournalEntry"("customerId");

ALTER TABLE "TransactionJournalEntry" ADD CONSTRAINT "TransactionJournalEntry_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
