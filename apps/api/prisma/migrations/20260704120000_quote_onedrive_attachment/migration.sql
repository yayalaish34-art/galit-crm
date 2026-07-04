-- עריכה פר-קובץ ב-Word: זוכר איזה TaskAttachment פתוח ב-OneDrive, כדי שהסנכרון-חזרה
-- יעדכן את הקובץ הנכון (ולא את ה-DOCX החדש ביותר של המשימה).
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "onedriveAttachmentId" TEXT;
