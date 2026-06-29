-- OneDrive editable-document tracking for quotes (edit in Word with auto save-back).
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "onedriveItemId" TEXT;
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "onedriveWebUrl" TEXT;
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "onedriveOwnerId" TEXT;
