-- מקורות הגעה ("מקור הגעה") הניתנים-לעריכה — נשמרים לתמיד ומשותפים לכל הלקוחות.
CREATE TABLE IF NOT EXISTS "LeadSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPreset" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadSource_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LeadSource_name_key" ON "LeadSource"("name");

-- ערכי ברירת המחדל הקיימים (תואמים לרשימה שהיתה מקודדת בפרונט).
INSERT INTO "LeadSource" ("id", "name", "sortOrder", "isPreset", "createdAt") VALUES
('ls000000-0000-4000-8000-000000000001', 'פייסבוק',    0, true, CURRENT_TIMESTAMP),
('ls000000-0000-4000-8000-000000000002', 'טיק טוק',     1, true, CURRENT_TIMESTAMP),
('ls000000-0000-4000-8000-000000000003', 'גוגל אדס',    2, true, CURRENT_TIMESTAMP),
('ls000000-0000-4000-8000-000000000004', 'אינסטגרם',    3, true, CURRENT_TIMESTAMP),
('ls000000-0000-4000-8000-000000000005', 'אתר',         4, true, CURRENT_TIMESTAMP),
('ls000000-0000-4000-8000-000000000006', 'המלצה',       5, true, CURRENT_TIMESTAMP),
('ls000000-0000-4000-8000-000000000007', 'לקוח חוזר',   6, true, CURRENT_TIMESTAMP),
('ls000000-0000-4000-8000-000000000008', 'הדס',         7, true, CURRENT_TIMESTAMP),
('ls000000-0000-4000-8000-000000000009', 'גינדי',       8, true, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;
