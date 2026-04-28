-- AlterTable
ALTER TABLE "Quote" ADD COLUMN "lastEmailedAt" TIMESTAMP(3);
ALTER TABLE "Quote" ADD COLUMN "lastEmailedTo" TEXT;
