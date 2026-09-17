-- How the kit instructions message went out: a worker pressing the button, or
-- the 48-hour fallback firing because nobody did.
--
-- Kept as a column rather than inferred from kitSentByUserId being NULL: that id
-- is also NULL for a manual click by a user we could not resolve, so inferring
-- would quietly mislabel real human actions as automatic ones.
--
-- Additive and idempotent.

ALTER TABLE "RadonJob"
  ADD COLUMN IF NOT EXISTS "kitSentVia" TEXT;

-- Everything already sent predates the fallback, so it was necessarily a click.
UPDATE "RadonJob"
   SET "kitSentVia" = 'manual'
 WHERE "kitSentAt" IS NOT NULL
   AND "kitSentVia" IS NULL;

-- The 48-hour sweep scans for kit jobs that never got their instructions out.
CREATE INDEX IF NOT EXISTS "RadonJob_kit_unsent_idx"
  ON "RadonJob" ("taskId")
  WHERE "kitSentAt" IS NULL;
