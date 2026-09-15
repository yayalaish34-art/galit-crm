/**
 * מחיל את מיגרציית CallRecording ישירות (prisma migrate deploy נתקע מול
 * ה-pooler — ראו [[railway-migrations-session-pooler]]).
 *   cd apps/api && npx railway run node scripts/apply-call-recordings-migration.cjs
 * אידמפוטנטי: אפשר להריץ שוב בלי נזק.
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const SQL_FILE = path.join(__dirname, '..', 'prisma', 'migrations', '20260909120000_call_recordings', 'migration.sql');

(async () => {
  const sql = fs.readFileSync(SQL_FILE, 'utf8');
  // ה-DATABASE_URL של Railway מצביע ל-transaction pooler (6543); DDL מחייב את
  // ה-session pooler (5432), אחרת ההרצה נתקעת.
  const url = (process.env.DATABASE_URL || '').replace(':6543/', ':5432/');
  if (!url) throw new Error('DATABASE_URL missing — run via `railway run`');

  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    await c.query(sql);
    const r = await c.query(
      `SELECT column_name, data_type FROM information_schema.columns
        WHERE table_name = 'CallRecording' ORDER BY ordinal_position`,
    );
    console.log('CallRecording columns:');
    for (const row of r.rows) console.log(`  ${row.column_name} : ${row.data_type}`);
    const cnt = await c.query(`SELECT COUNT(*)::int AS n FROM "CallRecording"`);
    console.log(`rows: ${cnt.rows[0].n}`);
  } finally {
    await c.end();
  }
  console.log('\nmigration applied.');
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
