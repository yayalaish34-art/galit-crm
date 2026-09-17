-- עריכת דוח שהופק ב-Word דרך OneDrive — אותו דפוס שכבר קיים ב-Quote.
-- בלי ownerId אי אפשר למשוך את הגרסה הערוכה בחזרה (טוקן ה-Graph הוא per-user).
-- שינוי אדיטיבי בלבד: שלוש עמודות nullable, ללא נגיעה בנתונים קיימים.
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "onedriveItemId"  TEXT;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "onedriveWebUrl"  TEXT;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "onedriveOwnerId" TEXT;
