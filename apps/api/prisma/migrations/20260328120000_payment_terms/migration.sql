-- CreateTable
CREATE TABLE "PaymentTerm" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentTerm_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentTerm_label_key" ON "PaymentTerm"("label");

INSERT INTO "PaymentTerm" ("id", "label", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, x.label, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES
  ('מזומן'),
  ('שוטף 30'),
  ('שוטף 60'),
  ('שוטף +30'),
  ('שיק'),
  ('העברה בנקאית')
) AS x(label);
