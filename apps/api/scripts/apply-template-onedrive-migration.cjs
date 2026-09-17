/**
 * מוסיף ל-QuoteTemplateDocx את עמודות ה-OneDrive (עריכת קובץ התבנית ב-Word).
 *   cd apps/api && npx railway run node scripts/apply-template-onedrive-migration.cjs
 * אידמפוטנטי (ADD COLUMN IF NOT EXISTS).
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const SQL_FILE = path.join(__dirname, '..', 'prisma', 'migrations', '20260816160000_quote_template_docx_onedrive', 'migration.sql');

(async () => {
  const url = (process.env.DATABASE_URL || '').replace(':6543/', ':5432/');
  if (!url) throw new Error('DATABASE_URL missing — run via `railway run`');
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    await c.query(fs.readFileSync(SQL_FILE, 'utf8'));
    const r = await c.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'QuoteTemplateDocx' ORDER BY ordinal_position`,
    );
    console.log('QuoteTemplateDocx columns:', r.rows.map((x) => x.column_name).join(', '));
  } finally {
    await c.end();
  }
  console.log('migration applied.');
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
