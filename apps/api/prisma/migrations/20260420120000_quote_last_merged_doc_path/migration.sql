-- Add lastMergedDocPath to Quote for storing the path to the last merged DOCX
ALTER TABLE "Quote" ADD COLUMN "lastMergedDocPath" TEXT;
