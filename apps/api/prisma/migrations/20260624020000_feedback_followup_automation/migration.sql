-- AddColumn: אוטומציית משוב ופולואו-אפ (לכל לקוח)
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "feedbackRequestedAt" TIMESTAMP(3);
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "feedbackOptOut" BOOLEAN;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "autoFollowupEnabled" BOOLEAN;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "followupIntervalDays" INTEGER;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "followupChannel" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "lastFollowupAt" TIMESTAMP(3);
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "nextFollowupAt" TIMESTAMP(3);
