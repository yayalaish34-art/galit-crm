CREATE TABLE "Inquiry" (
    "id" TEXT NOT NULL,
    "importLegacyId" TEXT,
    "customerId" TEXT,
    "date" TIMESTAMP(3),
    "time" TEXT,
    "customerCode" TEXT,
    "productCode" TEXT,
    "contactName" TEXT,
    "phone" TEXT,
    "hValue" TEXT,
    "productName" TEXT,
    "faultCode" TEXT,
    "eValue" TEXT,
    "dValue" TEXT,
    "treatmentCode" TEXT,
    "handlerName" TEXT,
    "followUp" BOOLEAN,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Inquiry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Inquiry_importLegacyId_idx" ON "Inquiry"("importLegacyId");
CREATE INDEX "Inquiry_customerId_idx" ON "Inquiry"("customerId");
CREATE INDEX "Inquiry_date_idx" ON "Inquiry"("date");

ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
