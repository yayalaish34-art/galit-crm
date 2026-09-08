-- רשימת דיוור שיווקי: הסכמה שהתקבלה מהטופס באתר + הסרה ידנית מהכרטיס.
-- נפרד מ-allowMail/allowEmail הקיימים, שהם העדפות דיוור תפעולי מהכרטיס הישן.
ALTER TABLE "Customer"
  ADD COLUMN IF NOT EXISTS "marketingConsent"       BOOLEAN,
  ADD COLUMN IF NOT EXISTS "marketingConsentAt"     TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "marketingConsentSource" TEXT,
  ADD COLUMN IF NOT EXISTS "marketingOptOut"        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "marketingOptOutAt"      TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "marketingOptOutById"    TEXT;

CREATE INDEX IF NOT EXISTS "Customer_marketingOptOut_idx"  ON "Customer"("marketingOptOut");
CREATE INDEX IF NOT EXISTS "Customer_marketingConsent_idx" ON "Customer"("marketingConsent");
