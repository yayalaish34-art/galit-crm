-- ── Quote.linkedEntityId → מפתח זר אמיתי אל Task ──────────────────────────────
--
-- הרקע: הקישור בין הצעת מחיר למשימה נשמר ב-Quote.linkedEntityId כמחרוזת חופשית,
-- בלי FK ובלי אינדקס. לכן:
--   • מחיקת משימה השאירה מצביע מת (10 הצעות בייצור הצביעו על משימות שלא קיימות);
--   • המנעול "ההצעה כבר מקושרת למשימה" ראה ערך לא-ריק שמצביע לשום מקום ודילג —
--     או נדרס למשימה החדשה ונטש את הקודמת. שתי הדרכים ייצרו שתי משימות להצעה אחת.
--
-- ON DELETE SET NULL: מחיקת משימה מנקה את הקישור, במקום להשאיר מצביע מת.

-- 1. ניקוי מצביעים למשימות שכבר לא קיימות — חובה לפני הוספת ה-FK, אחרת ALTER ייכשל.
UPDATE "Quote" q
   SET "linkedEntityId" = NULL
 WHERE q."linkedEntityId" IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM "Task" t WHERE t."id" = q."linkedEntityId");

-- 2. אינדקס על עמודת הקישור (חיפוש הצעות לפי משימה רץ בכל פתיחת שלב "הצעת מחיר").
CREATE INDEX IF NOT EXISTS "Quote_linkedEntityId_idx" ON "Quote"("linkedEntityId");

-- 3. המפתח הזר עצמו.
ALTER TABLE "Quote"
  ADD CONSTRAINT "Quote_linkedEntityId_fkey"
  FOREIGN KEY ("linkedEntityId") REFERENCES "Task"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
