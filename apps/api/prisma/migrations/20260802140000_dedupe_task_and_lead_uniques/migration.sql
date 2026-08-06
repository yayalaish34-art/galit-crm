-- מניעת כפילות משימות/לידים ברמת ה-DB.
--
-- 1) Task.incomingLeadId ייחודי: לליד נכנס יש משימת-תהליך אחת בדיוק. עד היום זה נשען
--    רק על קוד (assignOrCreateTask), וכשה-snapshot של הליד היה מיושן נוצרו עד 3 משימות
--    לאותו ליד. ב-Postgres NULL אינו מתנגש ב-NULL, לכן משימות שאינן מליד לא מושפעות.
--
-- 2) IncomingLead.internetMessageId ייחודי: אותו מייל שהגיע לכמה תיבות = ליד אחד משותף.
--    duplicateOfExistingLead הוא check-then-act ולכן לא עמד בסריקות מקבילות.
--
-- שתי השורות מניחות שהנתונים כבר נוקו (scripts/dedupe-tasks-cleanup.mjs).
-- CREATE UNIQUE INDEX IF NOT EXISTS כדי שהמיגרציה תהיה אידמפוטנטית.

CREATE UNIQUE INDEX IF NOT EXISTS "Task_incomingLeadId_key"
  ON "Task" ("incomingLeadId");

CREATE UNIQUE INDEX IF NOT EXISTS "IncomingLead_internetMessageId_key"
  ON "IncomingLead" ("internetMessageId");
