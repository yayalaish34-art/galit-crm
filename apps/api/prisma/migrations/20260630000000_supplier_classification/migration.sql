-- סיווג לקוח חדש: "ספק" — מתנהג כמו חברה / מוסד (לא כמו לקוח פרטי): מחייב איש קשר.
INSERT INTO "CustomerClassification" ("id", "code", "labelHe", "sortOrder", "isPreset", "createdAt") VALUES
('cc000000-0000-4000-8000-000000000004', 'SUPPLIER', 'ספק', 3, true, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
