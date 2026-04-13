ALTER TABLE "Task"
ADD COLUMN "importLegacyId" TEXT,
ADD COLUMN "customerName" TEXT,
ADD COLUMN "contactName" TEXT,
ADD COLUMN "productName" TEXT,
ADD COLUMN "activityName" TEXT,
ADD COLUMN "cityName" TEXT,
ADD COLUMN "campaignName" TEXT,
ADD COLUMN "contactRepresentative" TEXT,
ADD COLUMN "customerDocumentType" TEXT,
ADD COLUMN "homePhone" TEXT,
ADD COLUMN "mobilePhone" TEXT,
ADD COLUMN "workPhone" TEXT,
ADD COLUMN "address" TEXT,
ADD COLUMN "timeSlot" TEXT,
ADD COLUMN "dialCount" INTEGER,
ADD COLUMN "floatingWindowEnabled" BOOLEAN;

CREATE INDEX "Task_importLegacyId_idx" ON "Task"("importLegacyId");
CREATE INDEX "Task_dueDate_idx" ON "Task"("dueDate");
CREATE INDEX "Task_cityName_idx" ON "Task"("cityName");
CREATE INDEX "Task_campaignName_idx" ON "Task"("campaignName");
CREATE INDEX "Task_productName_idx" ON "Task"("productName");
