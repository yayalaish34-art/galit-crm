-- חברת צד-שלישי / מפנה על הליד (הדס, גינדי וכו')
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "referralCompany" TEXT;

-- הערות כלליות על התהליך/הלקוח לאורך הזרימה (מערך JSON של { text, at })
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "processNotes" TEXT;
