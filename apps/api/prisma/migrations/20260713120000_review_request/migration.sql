-- CreateTable: ReviewRequest — בקשת דירוג (5 פרצופים) שנשלחת ללקוח אוטומטית אחרי שליחת דוח
CREATE TABLE "ReviewRequest" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "customerId" TEXT,
    "taskId" TEXT,
    "toEmail" TEXT NOT NULL,
    "customerName" TEXT,
    "rating" INTEGER,
    "ratedAt" TIMESTAMP(3),
    "feedback" TEXT,
    "feedbackAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReviewRequest_token_key" ON "ReviewRequest"("token");
CREATE INDEX "ReviewRequest_customerId_idx" ON "ReviewRequest"("customerId");
CREATE INDEX "ReviewRequest_taskId_idx" ON "ReviewRequest"("taskId");
