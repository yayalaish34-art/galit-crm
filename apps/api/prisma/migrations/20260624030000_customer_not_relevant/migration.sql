-- AddColumn: סיווג "לא רלוונטי" ללקוח
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "notRelevantReason" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "notRelevantNote" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "notRelevantAt" TIMESTAMP(3);
