CREATE TABLE "CustomerOrder" (
    "id" TEXT NOT NULL,
    "importLegacyId" TEXT,
    "customerId" TEXT,
    "customerName" TEXT,
    "orderDate" TIMESTAMP(3),
    "followupDate" TIMESTAMP(3),
    "status" TEXT,
    "salesRepresentativeName" TEXT,
    "contactName" TEXT,
    "executorName" TEXT,
    "linkedEntityId" TEXT,
    "parentOrderId" TEXT,
    "priceList" TEXT,
    "currencyOrReadyStatus" TEXT,
    "exchangeRate" DECIMAL(18,4),
    "quoteReference" TEXT,
    "addressSummary" TEXT,
    "phoneSummary" TEXT,
    "faxSummary" TEXT,
    "customerTypeSummary" TEXT,
    "accountingNumber" TEXT,
    "companyRegNumber" TEXT,
    "supplyAddressUntil" TEXT,
    "supplyPhone" TEXT,
    "supplyDate" TIMESTAMP(3),
    "firstDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomerOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerOrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "rowOrder" INTEGER NOT NULL DEFAULT 0,
    "productCode" TEXT,
    "sku" TEXT,
    "productDescription" TEXT,
    "distributionChannel" TEXT,
    "quantity" DECIMAL(18,4),
    "price" DECIMAL(18,2),
    "discountPercent" DECIMAL(6,2),
    "total" DECIMAL(18,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomerOrderItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CustomerOrder_importLegacyId_idx" ON "CustomerOrder"("importLegacyId");
CREATE INDEX "CustomerOrder_customerId_idx" ON "CustomerOrder"("customerId");
CREATE INDEX "CustomerOrder_orderDate_idx" ON "CustomerOrder"("orderDate");
CREATE INDEX "CustomerOrderItem_orderId_idx" ON "CustomerOrderItem"("orderId");
CREATE INDEX "CustomerOrderItem_rowOrder_idx" ON "CustomerOrderItem"("rowOrder");

ALTER TABLE "CustomerOrder" ADD CONSTRAINT "CustomerOrder_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CustomerOrderItem" ADD CONSTRAINT "CustomerOrderItem_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "CustomerOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
