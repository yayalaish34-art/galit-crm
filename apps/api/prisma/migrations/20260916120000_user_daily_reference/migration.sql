-- מונה יומי אישי לסימוכין (SS+DDMMYY), כרגע ליורם — ר' ReferenceNumbersService.
-- אידמפוטנטית: אפשר להריץ שוב בלי נזק.
CREATE TABLE IF NOT EXISTS "UserDailyReference" (
  "id"         TEXT PRIMARY KEY,
  "userId"     TEXT NOT NULL,
  "dateKey"    TEXT NOT NULL,
  "lastSerial" INTEGER NOT NULL DEFAULT 0,
  "updatedAt"  TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserDailyReference_userId_dateKey_key" ON "UserDailyReference"("userId", "dateKey");

DO $$ BEGIN
  ALTER TABLE "UserDailyReference"
    ADD CONSTRAINT "UserDailyReference_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
