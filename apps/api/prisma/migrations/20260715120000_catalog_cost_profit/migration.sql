-- QuoteItemCatalog: מחיר עלות + אחוז רווח
-- costPrice = מחיר עלות (כמה עולה לנו), basePrice = מחיר ללקוח (העלות הסופית),
-- profitPercent = אחוז הרווח (nullable — למילוי ידני / חישוב)
ALTER TABLE "QuoteItemCatalog" ADD COLUMN "costPrice" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "QuoteItemCatalog" ADD COLUMN "profitPercent" DOUBLE PRECISION;
