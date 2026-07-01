-- Add citySummary to Quote — stores the city entered in the form independently of customer.city
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "citySummary" TEXT;
