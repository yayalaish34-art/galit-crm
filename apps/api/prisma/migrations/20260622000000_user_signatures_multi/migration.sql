-- CreateTable: חתימות מרובות למשתמש (תמונה + כותרת)
CREATE TABLE "UserSignature" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "image" BYTEA NOT NULL,
    "imageType" TEXT NOT NULL DEFAULT 'image/png',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSignature_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserSignature_userId_idx" ON "UserSignature"("userId");

-- AddForeignKey
ALTER TABLE "UserSignature" ADD CONSTRAINT "UserSignature_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate existing single (legacy) signature images into the new table as a first entry
INSERT INTO "UserSignature" ("id", "userId", "title", "image", "imageType", "sortOrder", "createdAt")
SELECT gen_random_uuid()::text, "id", 'חתימה ראשית', "mailSignatureImage", COALESCE("mailSignatureImageType", 'image/png'), 0, CURRENT_TIMESTAMP
FROM "User"
WHERE "mailSignatureImage" IS NOT NULL;
