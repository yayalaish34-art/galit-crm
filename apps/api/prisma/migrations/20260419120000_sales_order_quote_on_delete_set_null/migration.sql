-- DropForeignKey
ALTER TABLE "SalesOrder" DROP CONSTRAINT IF EXISTS "SalesOrder_quoteId_fkey";

-- AddForeignKey with ON DELETE SET NULL
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
