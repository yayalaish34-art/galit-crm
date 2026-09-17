/**
 * מחיל את האינדקס הייחודי החסר על TaskField(taskId).
 *   cd apps/api && npx railway run node scripts/apply-taskfield-unique-migration.cjs
 * בודק כפילויות לפני היצירה ונעצר אם יש — עדיף להיכשל מאשר להרוס נתונים.
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const SQL_FILE = path.join(__dirname, '..', 'prisma', 'migrations', '20260813220000_taskfield_unique_taskid', 'migration.sql');

(async () => {
  const url = (process.env.DATABASE_URL || '').replace(':6543/', ':5432/');
  if (!url) throw new Error('DATABASE_URL missing — run via `railway run`');
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    const dup = await c.query(
      `SELECT COUNT(*)::int AS n FROM (
         SELECT "taskId" FROM "TaskField" GROUP BY "taskId" HAVING COUNT(*) > 1
       ) s`,
    );
    if (dup.rows[0].n > 0) {
      throw new Error(`${dup.rows[0].n} duplicate taskId group(s) — dedupe first, aborting`);
    }
    await c.query(fs.readFileSync(SQL_FILE, 'utf8'));
    const r = await c.query(
      `SELECT i.relname FROM pg_index x
         JOIN pg_class i ON i.oid = x.indexrelid
         JOIN pg_class t ON t.oid = x.indrelid
        WHERE t.relname = 'TaskField' AND x.indisunique`,
    );
    console.log('unique indexes on TaskField:', r.rows.map((x) => x.relname).join(', '));
  } finally {
    await c.end();
  }
  console.log('done.');
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
