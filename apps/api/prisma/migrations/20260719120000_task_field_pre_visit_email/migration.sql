-- אוטומציית "הנחיות לפני הבדיקה" על TaskField.
-- נשלח ללקוח מייל עם הנחיות 09:00 ביום שלפני מועד הבדיקה, רק לבדיקות איכות אוויר (קודים 72 / 69).
ALTER TABLE "TaskField"
  ADD COLUMN IF NOT EXISTS "preVisitEmailEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "preVisitEmailSku"     TEXT,
  ADD COLUMN IF NOT EXISTS "preVisitEmailDueAt"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "preVisitEmailSentAt"  TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "preVisitEmailError"   TEXT;

-- אינדקס לסריקת ה-cron: רשומות שהאוטומציה דלוקה עליהן, טרם נשלחו, והגיע מועדן.
CREATE INDEX IF NOT EXISTS "TaskField_preVisitEmailEnabled_preVisitEmailSentAt_preVisitE_idx"
  ON "TaskField" ("preVisitEmailEnabled", "preVisitEmailSentAt", "preVisitEmailDueAt");
