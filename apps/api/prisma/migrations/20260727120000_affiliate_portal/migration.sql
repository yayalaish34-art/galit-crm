-- Affiliate portal — חברות צד-שלישי ששולחות לקוחות ומקבלות עמלה. מודול עצמאי:
-- טבלאות חדשות בלבד, בלי FK לטבלאות קיימות (קישור רופף ל-Lead/Task דרך id).

-- CreateEnum
CREATE TYPE "AffiliateReferralStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'WON', 'LOST');

-- CreateTable
CREATE TABLE "Affiliate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "commissionPct" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "contactName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Affiliate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateReferral" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT,
    "customerEmail" TEXT,
    "serviceType" TEXT,
    "note" TEXT,
    "status" "AffiliateReferralStatus" NOT NULL DEFAULT 'NEW',
    "leadId" TEXT,
    "taskId" TEXT,
    "paidAmount" DOUBLE PRECISION,
    "commissionPct" DOUBLE PRECISION,
    "commissionAmount" DOUBLE PRECISION,
    "paidAt" TIMESTAMP(3),
    "commissionSettledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliateReferral_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Affiliate_username_key" ON "Affiliate"("username");

-- CreateIndex
CREATE INDEX "Affiliate_isActive_idx" ON "Affiliate"("isActive");

-- CreateIndex
CREATE INDEX "AffiliateReferral_affiliateId_idx" ON "AffiliateReferral"("affiliateId");

-- CreateIndex
CREATE INDEX "AffiliateReferral_status_idx" ON "AffiliateReferral"("status");

-- CreateIndex
CREATE INDEX "AffiliateReferral_leadId_idx" ON "AffiliateReferral"("leadId");

-- CreateIndex
CREATE INDEX "AffiliateReferral_taskId_idx" ON "AffiliateReferral"("taskId");

-- AddForeignKey
ALTER TABLE "AffiliateReferral" ADD CONSTRAINT "AffiliateReferral_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
