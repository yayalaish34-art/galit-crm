CREATE TABLE "EventHistory" (
    "id" TEXT NOT NULL,
    "importLegacyId" TEXT,
    "customerId" TEXT,
    "linkedCustomerId" TEXT,
    "customerName" TEXT,
    "linkedCustomerName" TEXT,
    "contactName" TEXT,
    "phone" TEXT,
    "mobilePhone" TEXT,
    "customerPhone1" TEXT,
    "customerPhone2" TEXT,
    "customerPhone3" TEXT,
    "status" TEXT,
    "date" TIMESTAMP(3),
    "time" TEXT,
    "notes" TEXT,
    "activityName" TEXT,
    "productName" TEXT,
    "salesRepresentativeName" TEXT,
    "executorName" TEXT,
    "sourceName" TEXT,
    "activityTreePath" TEXT,
    "productTreePath" TEXT,
    "communicationFlag" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EventHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EventHistory_importLegacyId_idx" ON "EventHistory"("importLegacyId");
CREATE INDEX "EventHistory_customerId_idx" ON "EventHistory"("customerId");
CREATE INDEX "EventHistory_linkedCustomerId_idx" ON "EventHistory"("linkedCustomerId");
CREATE INDEX "EventHistory_date_idx" ON "EventHistory"("date");
CREATE INDEX "EventHistory_status_idx" ON "EventHistory"("status");
CREATE INDEX "EventHistory_communicationFlag_idx" ON "EventHistory"("communicationFlag");

ALTER TABLE "EventHistory" ADD CONSTRAINT "EventHistory_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
