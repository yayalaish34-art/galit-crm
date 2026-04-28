-- Follow-up owner for quotes (אחראי למעקב)
ALTER TABLE "Quote" ADD COLUMN "followUpResponsibleUserId" TEXT;

CREATE INDEX "Quote_followUpResponsibleUserId_idx" ON "Quote"("followUpResponsibleUserId");

ALTER TABLE "Quote" ADD CONSTRAINT "Quote_followUpResponsibleUserId_fkey" FOREIGN KEY ("followUpResponsibleUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
