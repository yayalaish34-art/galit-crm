-- Persist selected תנאי תשלום on Quote (schema had field; some DBs never got the column — P2022 self-heal was dropping it on save)
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "paymentTerms" TEXT;
