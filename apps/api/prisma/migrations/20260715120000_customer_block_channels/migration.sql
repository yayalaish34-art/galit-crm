-- CreateEnum
CREATE TYPE "BlockChannel" AS ENUM ('MAILING', 'WHATSAPP', 'EMAIL', 'SMS');

-- CreateTable
CREATE TABLE "CustomerBlock" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "channel" "BlockChannel" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerBlock_customerId_idx" ON "CustomerBlock"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerBlock_customerId_channel_key" ON "CustomerBlock"("customerId", "channel");

-- AddForeignKey
ALTER TABLE "CustomerBlock" ADD CONSTRAINT "CustomerBlock_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
