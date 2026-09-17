-- Radon kit tracking (SKU 61 / 10000) — the customer-held lifecycle.
--
-- Additive only: every column is nullable or has a default, so existing
-- RadonJob rows stay valid and nothing in the pipeline changes. Idempotent
-- (IF NOT EXISTS) because this file is also applied by hand against the
-- Supabase session pooler when `prisma migrate deploy` cannot run.

ALTER TABLE "RadonJob"
  ADD COLUMN IF NOT EXISTS "kitSentAt"             TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "kitSentByUserId"       TEXT,
  ADD COLUMN IF NOT EXISTS "kitInstructionsText"   TEXT,
  ADD COLUMN IF NOT EXISTS "kitInstructionsSentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "installConfirmedAt"    TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "installConfirmedVia"   TEXT,
  ADD COLUMN IF NOT EXISTS "installConfirmedNote"  TEXT,
  ADD COLUMN IF NOT EXISTS "testDurationDays"      INTEGER NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS "returnReminderId"      TEXT,
  ADD COLUMN IF NOT EXISTS "returnReminderText"    TEXT;

-- The hourly alert cron scans for kit jobs whose test period has ended.
-- Partial: only jobs that actually started a customer-held test qualify.
CREATE INDEX IF NOT EXISTS "RadonJob_kit_expected_end_idx"
  ON "RadonJob" ("expectedEndAt")
  WHERE "kitSentAt" IS NOT NULL AND "collectedAt" IS NULL;
