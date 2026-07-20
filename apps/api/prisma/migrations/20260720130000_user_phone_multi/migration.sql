-- מספרי וואטסאפ מרובים למשתמש — מחליף את העמודה הבודדת "User"."phoneAlt"
-- בטבלה "UserPhone" (ללא תקרה על מספר המכשירים).
--
-- זהות בבוט הוואטסאפ נקבעת לפי טלפון → שורת "User" (auth/userResolver.ts).
-- שורת משתמש נפרדת לכל מכשיר הייתה מפצלת את הזהות: userId אחר = משימות אחרות
-- וחיבור Outlook אחר (ה-CRM שומר את חיבור היומן לפי userId). הטבלה שומרת על
-- userId אחד לכל המספרים.
--
-- אבטחה: מספר שמופיע כאן מקבל את מלוא ההרשאות של המשתמש, כולל יומן ה-Outlook.
-- "phoneDigits" הוא UNIQUE — כך שאי אפשר לשייך בטעות מספר אחד לשני אנשים.

-- ── 1. הטבלה ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "UserPhone" (
  "id"          TEXT         NOT NULL,
  "userId"      TEXT         NOT NULL,
  -- כפי שהוזן, לתצוגה בלבד.
  "phone"       TEXT         NOT NULL,
  -- ספרות בלבד, מנורמל ל-972XXXXXXXXX. שדה החיפוש בפועל.
  "phoneDigits" TEXT         NOT NULL,
  "label"       TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserPhone_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "UserPhone"
    ADD CONSTRAINT "UserPhone_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "UserPhone_phoneDigits_key" ON "UserPhone" ("phoneDigits");
CREATE INDEX        IF NOT EXISTS "UserPhone_userId_idx"      ON "UserPhone" ("userId");

-- ── 2. העברת נתונים קיימים מ-"phoneAlt" ─────────────────────────────────────
-- רץ רק אם העמודה קיימת (היא נוספה במיגרציה 20260720120000).
-- נרמול: הסרת תווים שאינם ספרות, ואז 0XXXXXXXXX → 972XXXXXXXXX.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'User' AND column_name = 'phoneAlt'
  ) THEN
    INSERT INTO "UserPhone" ("id", "userId", "phone", "phoneDigits", "label")
    SELECT gen_random_uuid()::text,
           u."id",
           u."phoneAlt",
           CASE
             WHEN regexp_replace(u."phoneAlt", '[^0-9]', '', 'g') ~ '^972[0-9]{9}$'
               THEN regexp_replace(u."phoneAlt", '[^0-9]', '', 'g')
             WHEN regexp_replace(u."phoneAlt", '[^0-9]', '', 'g') ~ '^0[0-9]{9}$'
               THEN '972' || substring(regexp_replace(u."phoneAlt", '[^0-9]', '', 'g') from 2)
             WHEN regexp_replace(u."phoneAlt", '[^0-9]', '', 'g') ~ '^[0-9]{9}$'
               THEN '972' || regexp_replace(u."phoneAlt", '[^0-9]', '', 'g')
             ELSE NULL
           END,
           'הועבר מ-phoneAlt'
    FROM "User" u
    WHERE u."phoneAlt" IS NOT NULL
      AND u."phoneAlt" <> ''
    -- דילוג על מספרים שאינם ניתנים לנרמול או שכבר קיימים בטבלה.
    AND CASE
          WHEN regexp_replace(u."phoneAlt", '[^0-9]', '', 'g') ~ '^972[0-9]{9}$'
            THEN regexp_replace(u."phoneAlt", '[^0-9]', '', 'g')
          WHEN regexp_replace(u."phoneAlt", '[^0-9]', '', 'g') ~ '^0[0-9]{9}$'
            THEN '972' || substring(regexp_replace(u."phoneAlt", '[^0-9]', '', 'g') from 2)
          WHEN regexp_replace(u."phoneAlt", '[^0-9]', '', 'g') ~ '^[0-9]{9}$'
            THEN '972' || regexp_replace(u."phoneAlt", '[^0-9]', '', 'g')
          ELSE NULL
        END IS NOT NULL
    ON CONFLICT ("phoneDigits") DO NOTHING;

    -- ── 3. הסרת העמודה הישנה ────────────────────────────────────────────────
    ALTER TABLE "User" DROP COLUMN "phoneAlt";
  END IF;
END $$;

-- ── 4. ניקוי: האינדקס של העמודה שהוסרה (אם נותר) ────────────────────────────
DROP INDEX IF EXISTS "User_phoneAlt_digits_idx";
