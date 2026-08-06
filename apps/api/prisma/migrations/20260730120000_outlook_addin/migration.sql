-- Extend CustomerEmailRequest for the Outlook add-in + add audit table.

-- New columns on CustomerEmailRequest (all additive, safe on existing rows)
ALTER TABLE "CustomerEmailRequest"
  ADD COLUMN IF NOT EXISTS "requestNumber" SERIAL,
  ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'NEW',
  ADD COLUMN IF NOT EXISTS "outlookItemId" TEXT,
  ADD COLUMN IF NOT EXISTS "conversationId" TEXT,
  ADD COLUMN IF NOT EXISTS "mailboxEmail" TEXT,
  ADD COLUMN IF NOT EXISTS "toJson" TEXT,
  ADD COLUMN IF NOT EXISTS "ccJson" TEXT,
  ADD COLUMN IF NOT EXISTS "bodyHtml" TEXT,
  ADD COLUMN IF NOT EXISTS "emlArchived" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "emlDocumentId" TEXT,
  ADD COLUMN IF NOT EXISTS "serviceTypeGuess" TEXT;

-- Dedup helper index (partial-ish: index on both cols; nulls are fine for a plain index)
CREATE INDEX IF NOT EXISTS "CustomerEmailRequest_mailboxEmail_internetMessageId_idx"
  ON "CustomerEmailRequest" ("mailboxEmail", "internetMessageId");

-- Audit table
CREATE TABLE IF NOT EXISTS "OutlookImportAudit" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "requestId" TEXT,
  "customerId" TEXT,
  "outlookItemId" TEXT,
  "internetMessageId" TEXT,
  "mailboxEmail" TEXT,
  "result" TEXT NOT NULL,
  "errorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OutlookImportAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OutlookImportAudit_userId_idx" ON "OutlookImportAudit" ("userId");
CREATE INDEX IF NOT EXISTS "OutlookImportAudit_createdAt_idx" ON "OutlookImportAudit" ("createdAt");
