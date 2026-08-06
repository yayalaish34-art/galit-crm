-- "לקוחות אחרונים" per-user: נרשם ברגע שעובד נכנס לכרטיס לקוח / משימה משויכת.
CREATE TABLE "CustomerView" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerView_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerView_userId_customerId_key" ON "CustomerView"("userId", "customerId");

CREATE INDEX "CustomerView_userId_viewedAt_idx" ON "CustomerView"("userId", "viewedAt");

ALTER TABLE "CustomerView" ADD CONSTRAINT "CustomerView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerView" ADD CONSTRAINT "CustomerView_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
