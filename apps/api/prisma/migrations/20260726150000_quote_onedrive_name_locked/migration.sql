-- שם קובץ ידני מנצח: כשהמשתמש עורך ידנית שם קובץ, מסמנים dat כדי שהסנכרון האוטומטי
-- (renameOnedriveToMatch) לא ידרוס אותו ב-OneDrive.
ALTER TABLE "Quote" ADD COLUMN "onedriveNameLocked" BOOLEAN NOT NULL DEFAULT false;
