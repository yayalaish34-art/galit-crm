-- B2B sales dashboard: track who recruited each affiliate + follow-up fields.
ALTER TABLE "Affiliate" ADD COLUMN "recruitedByUserId" TEXT;
ALTER TABLE "Affiliate" ADD COLUMN "salesNotes" TEXT;
ALTER TABLE "Affiliate" ADD COLUMN "nextFollowupAt" TIMESTAMP(3);

CREATE INDEX "Affiliate_recruitedByUserId_idx" ON "Affiliate"("recruitedByUserId");
