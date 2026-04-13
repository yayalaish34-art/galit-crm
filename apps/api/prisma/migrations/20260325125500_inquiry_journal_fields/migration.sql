ALTER TABLE "Inquiry"
ADD COLUMN "trackingDate" TIMESTAMP(3),
ADD COLUMN "receivedDate" TIMESTAMP(3),
ADD COLUMN "hour" TEXT,
ADD COLUMN "customerName" TEXT,
ADD COLUMN "displayName" TEXT,
ADD COLUMN "salesRepresentativeName" TEXT,
ADD COLUMN "status" TEXT,
ADD COLUMN "inquiryDuration" TEXT,
ADD COLUMN "homePhone" TEXT,
ADD COLUMN "mobilePhone" TEXT,
ADD COLUMN "workPhone" TEXT,
ADD COLUMN "isOpen" BOOLEAN,
ADD COLUMN "isClosed" BOOLEAN,
ADD COLUMN "isUrgent" BOOLEAN,
ADD COLUMN "campaignName" TEXT,
ADD COLUMN "operationName" TEXT,
ADD COLUMN "lastStatusNotes" TEXT,
ADD COLUMN "faultDescription" TEXT;

CREATE INDEX "Inquiry_trackingDate_idx" ON "Inquiry"("trackingDate");
CREATE INDEX "Inquiry_receivedDate_idx" ON "Inquiry"("receivedDate");
CREATE INDEX "Inquiry_status_idx" ON "Inquiry"("status");
CREATE INDEX "Inquiry_salesRepresentativeName_idx" ON "Inquiry"("salesRepresentativeName");
