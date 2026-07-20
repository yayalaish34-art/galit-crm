-- מספר וואטסאפ שני לאותו משתמש ("User"."phoneAlt").
-- זהות בבוט הוואטסאפ נקבעת לפי טלפון → שורת "User" (auth/userResolver.ts).
-- חלק מהמשתמשים כותבים לבוט משני מכשירים. בלי עמודה זו המספר השני הוא
-- UNKNOWN_NUMBER, ופתיחת שורת "User" נוספת הייתה מפצלת את הזהות — userId אחר
-- פירושו משימות אחרות ו*חיבור Outlook אחר* (ה-CRM שומר את חיבור היומן לפי
-- userId). עמודה משנית שומרת על userId אחד, ולכן שני המספרים מגיעים לאותן
-- משימות ולאותו יומן.
--
-- אבטחה: מספר שמוגדר כאן מקבל את מלוא ההרשאות של המשתמש (תפקיד, הרשאות,
-- וקריאה/כתיבה/מחיקה ביומן ה-Outlook שלו). למלא רק במספר ששייך לאותו אדם.

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "phoneAlt" TEXT;

-- אינדקס לחיפוש של resolveUserByPhone, שמשווה על ספרות בלבד
-- (regexp_replace(phone,'[^0-9]','','g')). אינדקס רגיל על העמודה הגולמית לא
-- היה נבחר, ולכן מאנדקסים את אותו ביטוי. חלקי — רק שורות שבהן הוגדר phoneAlt.
CREATE INDEX IF NOT EXISTS "User_phoneAlt_digits_idx"
  ON "User" ((regexp_replace("phoneAlt", '[^0-9]', '', 'g')))
  WHERE "phoneAlt" IS NOT NULL;
