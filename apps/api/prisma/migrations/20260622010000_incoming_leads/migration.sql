-- CreateEnum
CREATE TYPE "IncomingLeadStatus" AS ENUM ('NEW', 'ACTIVE', 'DISMISSED');

-- AlterTable: סימון task שמקורו בליד נכנס
ALTER TABLE "Task" ADD COLUMN "incomingLeadId" TEXT;
CREATE INDEX "Task_incomingLeadId_idx" ON "Task"("incomingLeadId");

-- CreateTable: לידים נכנסים מהמייל
CREATE TABLE "IncomingLead" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT,
    "fromName" TEXT,
    "fromEmail" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "status" "IncomingLeadStatus" NOT NULL DEFAULT 'NEW',
    "ownerId" TEXT NOT NULL,
    "transferredToId" TEXT,
    "taskId" TEXT,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncomingLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IncomingLead_messageId_key" ON "IncomingLead"("messageId");
CREATE INDEX "IncomingLead_ownerId_idx" ON "IncomingLead"("ownerId");
CREATE INDEX "IncomingLead_status_idx" ON "IncomingLead"("status");

-- AddForeignKey
ALTER TABLE "IncomingLead" ADD CONSTRAINT "IncomingLead_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
