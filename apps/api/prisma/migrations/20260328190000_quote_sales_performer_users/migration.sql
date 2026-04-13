-- Quote: link נציג מכירה + מבצע to User (real IDs)
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "salesRepresentativeId" TEXT;
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "performerUserId" TEXT;
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "performerName" TEXT;

CREATE INDEX IF NOT EXISTS "Quote_salesRepresentativeId_idx" ON "Quote"("salesRepresentativeId");
CREATE INDEX IF NOT EXISTS "Quote_performerUserId_idx" ON "Quote"("performerUserId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Quote_salesRepresentativeId_fkey'
  ) THEN
    ALTER TABLE "Quote"
      ADD CONSTRAINT "Quote_salesRepresentativeId_fkey"
      FOREIGN KEY ("salesRepresentativeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Quote_performerUserId_fkey'
  ) THEN
    ALTER TABLE "Quote"
      ADD CONSTRAINT "Quote_performerUserId_fkey"
      FOREIGN KEY ("performerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
