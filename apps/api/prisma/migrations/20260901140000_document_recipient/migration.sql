-- הנמען שהדוח מוען אליו, כפי שהוזן במערכת הפקת הדוחות.
-- בלי זה חלון השליחה בכרטיס הלקוח נפל על כתובת הלקוח הכללית ולא על איש הקשר.
-- שינוי אדיטיבי בלבד: שתי עמודות nullable, ללא נגיעה בנתונים קיימים.
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "recipientName"  TEXT;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "recipientEmail" TEXT;
