-- Optional signature image (logo / scanned signature), embedded in quote emails.
ALTER TABLE "User" ADD COLUMN "mailSignatureImage" BYTEA;
ALTER TABLE "User" ADD COLUMN "mailSignatureImageType" TEXT;
