CREATE TABLE "ExecutionCalendarEntry" (
    "id" TEXT NOT NULL,
    "importLegacyId" TEXT,
    "date" TIMESTAMP(3),
    "startTime" TEXT,
    "endTime" TEXT,
    "assignedUserId" TEXT,
    "assignedUserName" TEXT,
    "title" TEXT,
    "customerId" TEXT,
    "customerName" TEXT,
    "relatedEntityType" TEXT,
    "relatedEntityId" TEXT,
    "entryType" TEXT,
    "status" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ExecutionCalendarEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExecutionCalendarEntry_importLegacyId_idx" ON "ExecutionCalendarEntry"("importLegacyId");
CREATE INDEX "ExecutionCalendarEntry_date_idx" ON "ExecutionCalendarEntry"("date");
CREATE INDEX "ExecutionCalendarEntry_assignedUserId_idx" ON "ExecutionCalendarEntry"("assignedUserId");
CREATE INDEX "ExecutionCalendarEntry_customerId_idx" ON "ExecutionCalendarEntry"("customerId");

ALTER TABLE "ExecutionCalendarEntry" ADD CONSTRAINT "ExecutionCalendarEntry_assignedUserId_fkey"
FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ExecutionCalendarEntry" ADD CONSTRAINT "ExecutionCalendarEntry_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
