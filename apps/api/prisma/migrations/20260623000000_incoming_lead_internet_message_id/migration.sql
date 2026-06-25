-- AlterTable: מזהה הודעה חוצה-תיבות (RFC 5322 Message-ID) לקיבוץ אותו ליד בין עובדים
ALTER TABLE "IncomingLead" ADD COLUMN "internetMessageId" TEXT;

-- CreateIndex
CREATE INDEX "IncomingLead_internetMessageId_idx" ON "IncomingLead"("internetMessageId");
