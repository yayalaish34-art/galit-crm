-- AlterTable: separate per-user OneDrive account (files only; distinct from the Outlook account)
ALTER TABLE "User" ADD COLUMN "odEmail" TEXT;
ALTER TABLE "User" ADD COLUMN "odRefreshToken" TEXT;
ALTER TABLE "User" ADD COLUMN "odConnectedAt" TIMESTAMP(3);
