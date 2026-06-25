-- Add SIGNED_QUOTE to DocumentType enum
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'SIGNED_QUOTE';

-- Add base64 storage column for files held in the DB (signed quotes)
ALTER TABLE "Document" ADD COLUMN "dataBase64" TEXT;
