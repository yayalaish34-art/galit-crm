-- CreateTable
CREATE TABLE "CustomerEmailRequest" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "graphMessageId" TEXT,
    "internetMessageId" TEXT,
    "subject" TEXT,
    "fromName" TEXT,
    "fromEmail" TEXT,
    "receivedAt" TIMESTAMP(3),
    "bodyText" TEXT,
    "attachedByUserId" TEXT,
    "attachedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerEmailRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerEmailRequest_customerId_idx" ON "CustomerEmailRequest"("customerId");

-- CreateIndex
CREATE INDEX "CustomerEmailRequest_graphMessageId_idx" ON "CustomerEmailRequest"("graphMessageId");

-- AddForeignKey
ALTER TABLE "CustomerEmailRequest" ADD CONSTRAINT "CustomerEmailRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
