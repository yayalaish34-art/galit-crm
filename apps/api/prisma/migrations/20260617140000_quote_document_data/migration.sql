-- Store merged quote DOCX bytes directly in the DB so they survive Railway deploys
-- (the container disk is ephemeral). filePath rows remain for backward compatibility.
ALTER TABLE "QuoteDocument" ADD COLUMN "data" BYTEA;
ALTER TABLE "QuoteDocument" ADD COLUMN "mimeType" TEXT;
