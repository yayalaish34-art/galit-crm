-- Per-user email signature, auto-appended to quote emails.
ALTER TABLE "User" ADD COLUMN "mailSignature" TEXT;
