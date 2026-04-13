ALTER TABLE "Quote"
ADD COLUMN "customerName" TEXT,
ADD COLUMN "quoteDate" TIMESTAMP(3),
ADD COLUMN "followupDate" TIMESTAMP(3),
ADD COLUMN "salesRepresentativeName" TEXT,
ADD COLUMN "executorName" TEXT,
ADD COLUMN "linkedEntityId" TEXT,
ADD COLUMN "orderReferenceNumber" TEXT,
ADD COLUMN "copiedFromOrder" TEXT,
ADD COLUMN "priceList" TEXT,
ADD COLUMN "exchangeRate" DECIMAL(18,4),
ADD COLUMN "accountingNumber" TEXT,
ADD COLUMN "companyRegNumber" TEXT,
ADD COLUMN "addressSummary" TEXT,
ADD COLUMN "phoneSummary" TEXT,
ADD COLUMN "faxSummary" TEXT,
ADD COLUMN "validityDays" INTEGER,
ADD COLUMN "paymentsCount" INTEGER,
ADD COLUMN "paymentAmount" DECIMAL(18,2),
ADD COLUMN "paymentFactor" DECIMAL(18,4),
ADD COLUMN "paymentTotal" DECIMAL(18,2),
ADD COLUMN "paymentReference" TEXT,
ADD COLUMN "paymentDueDate" TIMESTAMP(3),
ADD COLUMN "paymentStatus" TEXT;

CREATE TABLE "CustomerQuoteItem" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "rowOrder" INTEGER NOT NULL DEFAULT 0,
    "productCode" TEXT,
    "sku" TEXT,
    "productDescription" TEXT,
    "distributionChannel" TEXT,
    "quantity" DECIMAL(18,4),
    "price" DECIMAL(18,2),
    "discountPercent" DECIMAL(6,2),
    "total" DECIMAL(18,2),
    "totalIls" DECIMAL(18,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomerQuoteItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CustomerQuoteItem_quoteId_idx" ON "CustomerQuoteItem"("quoteId");
CREATE INDEX "CustomerQuoteItem_rowOrder_idx" ON "CustomerQuoteItem"("rowOrder");

ALTER TABLE "CustomerQuoteItem"
ADD CONSTRAINT "CustomerQuoteItem_quoteId_fkey"
FOREIGN KEY ("quoteId") REFERENCES "Quote"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
