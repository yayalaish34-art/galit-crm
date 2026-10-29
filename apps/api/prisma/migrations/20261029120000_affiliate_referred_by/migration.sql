-- "מי הפנה": רשימת מפנים לכל שותף + המפנה של כל הפניה.
ALTER TABLE "Affiliate" ADD COLUMN "referrerOptions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "AffiliateReferral" ADD COLUMN "referredBy" TEXT;

-- המפנים של השותף inspect.
UPDATE "Affiliate"
   SET "referrerOptions" = ARRAY['יניב', 'דפנה', 'ריקי', 'אתי', 'רון']
 WHERE LOWER("username") = 'inspect';
