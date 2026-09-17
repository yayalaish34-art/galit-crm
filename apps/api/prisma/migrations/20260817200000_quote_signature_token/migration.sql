-- Append-only record of every signature secret ever issued for a quote.
--
-- Why: a sign link's validity used to live in one mutable JSON blob
-- (Quote."digitalCertificateMeta"->>'secret'). Any write that replaced the blob
-- without carrying the old secret forward silently killed every link already in
-- customers' hands, and it only surfaced when a customer complained. Moving
-- validity into rows that are only ever INSERTed makes that failure mode
-- structurally impossible.
--
-- Additive and idempotent — safe to apply by hand against the session pooler.

CREATE TABLE IF NOT EXISTS "QuoteSignatureToken" (
  "id"         TEXT         NOT NULL,
  "quoteId"    TEXT         NOT NULL,
  "secret"     TEXT         NOT NULL,
  "issuedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "issuedById" TEXT,
  "source"     TEXT,
  "revokedAt"  TIMESTAMP(3),

  CONSTRAINT "QuoteSignatureToken_pkey" PRIMARY KEY ("id")
);

-- A secret is a capability: it must never resolve to two different quotes.
-- This index is also what makes the "insert, ignore duplicate" write safe, so it
-- has to exist in the DB and not only in schema.prisma — a @unique that never
-- reached the database turns every ON CONFLICT into a 42P10 error at runtime.
CREATE UNIQUE INDEX IF NOT EXISTS "QuoteSignatureToken_secret_key"
  ON "QuoteSignatureToken" ("secret");

CREATE INDEX IF NOT EXISTS "QuoteSignatureToken_quoteId_idx"
  ON "QuoteSignatureToken" ("quoteId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'QuoteSignatureToken_quoteId_fkey'
  ) THEN
    ALTER TABLE "QuoteSignatureToken"
      ADD CONSTRAINT "QuoteSignatureToken_quoteId_fkey"
      FOREIGN KEY ("quoteId") REFERENCES "Quote"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ── Backfill ────────────────────────────────────────────────────────────────
-- Every secret currently reachable — the live one plus anything already rescued
-- into previousSecrets — becomes a row. Without this the table would only
-- protect links issued from today onward, leaving every outstanding link still
-- resting on the blob.

INSERT INTO "QuoteSignatureToken" ("id", "quoteId", "secret", "issuedAt", "source")
SELECT gen_random_uuid()::text,
       q."id",
       q."digitalCertificateMeta"->>'secret',
       COALESCE(q."signatureRequestedAt", q."updatedAt", now()),
       'backfill_current'
  FROM "Quote" q
 WHERE q."digitalCertificateMeta"->>'secret' IS NOT NULL
ON CONFLICT ("secret") DO NOTHING;

INSERT INTO "QuoteSignatureToken" ("id", "quoteId", "secret", "issuedAt", "source")
SELECT gen_random_uuid()::text,
       q."id",
       s.value #>> '{}',
       COALESCE(q."signatureRequestedAt", q."updatedAt", now()),
       'backfill_previous'
  FROM "Quote" q,
       LATERAL jsonb_array_elements(
         COALESCE(q."digitalCertificateMeta"::jsonb->'previousSecrets', '[]'::jsonb)
       ) AS s(value)
 WHERE s.value #>> '{}' IS NOT NULL
ON CONFLICT ("secret") DO NOTHING;
