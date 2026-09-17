-- גרסה ערוכה של קובץ תבנית DOCX. ראו ההערה ב-schema.prisma:
-- תיקיית templates/ נצרבת לאימג' ה-Docker, ולכן עריכות חייבות לשבת ב-DB
-- כדי לשרוד דיפלוי. מחיקת השורה = חזרה לקובץ המקורי.
CREATE TABLE IF NOT EXISTS "QuoteTemplateDocx" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "dataBase64" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "updatedById" TEXT,
    "updatedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "QuoteTemplateDocx_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "QuoteTemplateDocx_templateId_key"
    ON "QuoteTemplateDocx"("templateId");

DO $$
BEGIN
    ALTER TABLE "QuoteTemplateDocx"
        ADD CONSTRAINT "QuoteTemplateDocx_templateId_fkey"
        FOREIGN KEY ("templateId") REFERENCES "QuoteTemplate"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
