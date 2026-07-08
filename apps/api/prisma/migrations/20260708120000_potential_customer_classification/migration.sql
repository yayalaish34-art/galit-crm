-- סיווג לקוח חדש: "לקוח פוטנציאלי" — ברירת המחדל בטופס לקוח חדש.
-- מתנהג כמו לקוח פרטי (לא מחייב שם חברה / איש קשר). sortOrder=-1 כדי שיופיע ראשון ברשימה.
INSERT INTO "CustomerClassification" ("id", "code", "labelHe", "sortOrder", "isPreset", "createdAt") VALUES
('cc000000-0000-4000-8000-000000000005', 'POTENTIAL', 'לקוח פוטנציאלי', -1, true, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
