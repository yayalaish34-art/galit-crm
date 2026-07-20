-- CreateEnum
CREATE TYPE "ApprovalKind" AS ENUM ('EXEC_UNPAID_PRIVATE', 'REPORT_UNPAID_PRIVATE');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "ApprovalRequest" (
    "id" TEXT NOT NULL,
    "kind" "ApprovalKind" NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "taskId" TEXT NOT NULL,
    "customerId" TEXT,
    "customerName" TEXT,
    "taskTitle" TEXT,
    "reason" TEXT,
    "requesterId" TEXT NOT NULL,
    "deciderId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApprovalRequest_status_idx" ON "ApprovalRequest"("status");
CREATE INDEX "ApprovalRequest_taskId_idx" ON "ApprovalRequest"("taskId");
CREATE INDEX "ApprovalRequest_requesterId_idx" ON "ApprovalRequest"("requesterId");

-- Only one PENDING request per (task, kind): repeated clicks must not pile up duplicates.
CREATE UNIQUE INDEX "ApprovalRequest_task_kind_pending_key"
  ON "ApprovalRequest"("taskId", "kind")
  WHERE "status" = 'PENDING';

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_deciderId_fkey" FOREIGN KEY ("deciderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
