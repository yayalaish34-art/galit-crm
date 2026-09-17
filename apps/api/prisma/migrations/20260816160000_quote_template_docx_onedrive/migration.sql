-- עריכת קובץ התבנית ב-Word דרך OneDrive: מזהה הפריט + בעל התיבה שאליה הועלה.
-- בלי ownerId אי אפשר למשוך את הגרסה הערוכה בחזרה (הטוקן הוא per-user).
ALTER TABLE "QuoteTemplateDocx" ADD COLUMN IF NOT EXISTS "onedriveItemId"   TEXT;
ALTER TABLE "QuoteTemplateDocx" ADD COLUMN IF NOT EXISTS "onedriveOwnerId"  TEXT;
ALTER TABLE "QuoteTemplateDocx" ADD COLUMN IF NOT EXISTS "onedriveWebUrl"   TEXT;
ALTER TABLE "QuoteTemplateDocx" ADD COLUMN IF NOT EXISTS "onedriveSyncedAt" TIMESTAMP(3);
