CREATE TABLE "SalesRepCalendarEntry" (
    "id" TEXT NOT NULL,
    "importLegacyId" TEXT,
    "salesRepresentativeId" TEXT,
    "salesRepresentativeName" TEXT,
    "date" TIMESTAMP(3),
    "startTime" TEXT,
    "endTime" TEXT,
    "title" TEXT,
    "customerId" TEXT,
    "customerName" TEXT,
    "notes" TEXT,
    "entryType" TEXT,
    "relatedEntityType" TEXT,
    "relatedEntityId" TEXT,
    "status" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SalesRepCalendarEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SalesRepCalendarEntry_importLegacyId_idx" ON "SalesRepCalendarEntry"("importLegacyId");
CREATE INDEX "SalesRepCalendarEntry_date_idx" ON "SalesRepCalendarEntry"("date");
CREATE INDEX "SalesRepCalendarEntry_salesRepresentativeId_idx" ON "SalesRepCalendarEntry"("salesRepresentativeId");
CREATE INDEX "SalesRepCalendarEntry_customerId_idx" ON "SalesRepCalendarEntry"("customerId");
CREATE INDEX "SalesRepCalendarEntry_status_idx" ON "SalesRepCalendarEntry"("status");

ALTER TABLE "SalesRepCalendarEntry" ADD CONSTRAINT "SalesRepCalendarEntry_salesRepresentativeId_fkey"
FOREIGN KEY ("salesRepresentativeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SalesRepCalendarEntry" ADD CONSTRAINT "SalesRepCalendarEntry_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
