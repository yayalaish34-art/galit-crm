/**
 * מחיל את מיגרציית RadonJob.detectorNumber ישירות (prisma migrate deploy
 * נתקע מול ה-pooler — ראו [[railway-migrations-session-pooler]]).
 *   cd apps/api && npx railway run node scripts/apply-radon-kit-customer-fields-migration.cjs
 * אידמפוטנטי: אפשר להריץ שוב בלי נזק.
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const SQL_FILE = path.join(
  __dirname,
  '..',
  'prisma',
  'migrations',
  '20260917090000_radon_kit_customer_fields',
  'migration.sql',
);

(async () => {
  const sql = fs.readFileSync(SQL_FILE, 'utf8');
  const url = (process.env.DATABASE_URL || '').replace(':6543/', ':5432/');
  if (!url) throw new Error('DATABASE_URL missing — run via `railway run`');

  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    await c.query(sql);
    const r = await c.query(
      `SELECT column_name, data_type FROM information_schema.columns
        WHERE table_name = 'RadonJob' AND column_name = 'detectorNumber'`,
    );
    console.log('RadonJob columns:', r.rows);
  } finally {
    await c.end();
  }
  console.log('\nmigration applied.');
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
