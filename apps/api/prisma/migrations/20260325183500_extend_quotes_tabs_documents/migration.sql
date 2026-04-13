ALTER TABLE "Quote"
ADD COLUMN "internalNotes" TEXT,
ADD COLUMN "openingText" TEXT,
ADD COLUMN "closingText" TEXT,
ADD COLUMN "orderSource" TEXT,
ADD COLUMN "functionalLabel" TEXT,
ADD COLUMN "closeProbabilityPercent" TEXT,
ADD COLUMN "closeColor" TEXT,
ADD COLUMN "lastUpdatedBy" TEXT,
ADD COLUMN "lastUpdatedDate" TIMESTAMP(3),
ADD COLUMN "lastUpdatedTime" TEXT,
ADD COLUMN "forecastFunctionalLabel" TEXT,
ADD COLUMN "forecastClosePercent" TEXT,
ADD COLUMN "forecastColor" TEXT,
ADD COLUMN "forecastUpdatedAt" TIMESTAMP(3),
ADD COLUMN "forecastUpdatedBy" TEXT,
ADD COLUMN "forecastUpdatedTime" TEXT;

CREATE TABLE "QuoteDocument" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
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
    CONSTRAINT "QuoteDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "QuoteDocument_quoteId_idx" ON "QuoteDocument"("quoteId");
CREATE INDEX "QuoteDocument_importLegacyId_idx" ON "QuoteDocument"("importLegacyId");

ALTER TABLE "QuoteDocument"
ADD CONSTRAINT "QuoteDocument_quoteId_fkey"
FOREIGN KEY ("quoteId") REFERENCES "Quote"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
