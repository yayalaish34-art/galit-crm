-- AlterTable: Microsoft Graph (Outlook) per-user connection
ALTER TABLE "User" ADD COLUMN "msEmail" TEXT;
ALTER TABLE "User" ADD COLUMN "msRefreshToken" TEXT;
ALTER TABLE "User" ADD COLUMN "msConnectedAt" TIMESTAMP(3);
