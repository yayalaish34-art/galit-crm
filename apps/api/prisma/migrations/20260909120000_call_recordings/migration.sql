-- הקלטות שיחה ותמלולן.
-- מיושם ידנית דרך scripts/apply-call-recordings-migration.cjs (session pooler 5432),
-- כי prisma migrate deploy נתקע מול ה-transaction pooler.

DO $$ BEGIN
  CREATE TYPE "TranscriptStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED', 'SKIPPED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "CallRecording" (
  "id"               TEXT NOT NULL,
  "externalId"       TEXT NOT NULL,
  "phone"            TEXT NOT NULL,
  "phoneDigits"      TEXT NOT NULL,
  "direction"        TEXT NOT NULL DEFAULT 'IN',
  "startedAt"        TIMESTAMP(3) NOT NULL,
  "durationSec"      INTEGER NOT NULL DEFAULT 0,
  "audioUrl"         TEXT,
  "agentName"        TEXT,
  "transcriptStatus" "TranscriptStatus" NOT NULL DEFAULT 'PENDING',
  "transcript"       TEXT,
  "transcriptError"  TEXT,
  "transcribedAt"    TIMESTAMP(3),
  "customerId"       TEXT,
  "taskId"           TEXT,
  "manuallyLinked"   BOOLEAN NOT NULL DEFAULT false,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CallRecording_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CallRecording_externalId_key" ON "CallRecording"("externalId");
CREATE INDEX IF NOT EXISTS "CallRecording_customerId_startedAt_idx" ON "CallRecording"("customerId", "startedAt");
CREATE INDEX IF NOT EXISTS "CallRecording_taskId_idx" ON "CallRecording"("taskId");
CREATE INDEX IF NOT EXISTS "CallRecording_phoneDigits_idx" ON "CallRecording"("phoneDigits");
CREATE INDEX IF NOT EXISTS "CallRecording_transcriptStatus_idx" ON "CallRecording"("transcriptStatus");
CREATE INDEX IF NOT EXISTS "CallRecording_startedAt_idx" ON "CallRecording"("startedAt");

DO $$ BEGIN
  ALTER TABLE "CallRecording"
    ADD CONSTRAINT "CallRecording_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CallRecording"
    ADD CONSTRAINT "CallRecording_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- שלוחת המרכזייה של העובד (Click2Call). idempotent.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pbxExtension" TEXT;
