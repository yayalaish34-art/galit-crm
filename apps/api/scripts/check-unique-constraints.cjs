/**
 * איתור סחף בין schema.prisma לבין ה-DB בפועל: כל `upsert` של Prisma מתורגם ל-
 * ON CONFLICT, שדורש אינדקס ייחודי *קיים במסד*. כשמיגרציה הוחלה ידנית ונשכח בה
 * ה-UNIQUE, ה-upsert נופל ב-500 עם 42P10 ("no unique or exclusion constraint
 * matching the ON CONFLICT specification").
 *
 *   cd apps/api && npx railway run node scripts/check-unique-constraints.cjs
 */
const { Client } = require('pg');

/** (טבלה, עמודות) שה-קוד מבצע עליהן upsert. */
const EXPECTED = [
  ['SystemSetting', ['key']],
  ['CustomerView', ['userId', 'customerId']],
  ['RadonAlert', ['jobId', 'kind']],
  ['TaskField', ['taskId']],
  ['QuoteTemplateDocx', ['templateId']],
];

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    for (const [table, cols] of EXPECTED) {
      const exists = await c.query(`SELECT to_regclass($1) AS t`, [`"${table}"`]);
      if (!exists.rows[0].t) {
        console.log(`${table.padEnd(20)} ⚠ table does not exist`);
        continue;
      }
      const r = await c.query(
        `SELECT i.relname AS index_name,
                array_agg(a.attname::text ORDER BY k.ord) AS cols
           FROM pg_index x
           JOIN pg_class i ON i.oid = x.indexrelid
           JOIN pg_class t ON t.oid = x.indrelid
           JOIN LATERAL unnest(x.indkey) WITH ORDINALITY AS k(attnum, ord) ON TRUE
           JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
          WHERE t.relname = $1 AND x.indisunique
          GROUP BY i.relname`,
        [table],
      );
      const want = cols.join(',');
      const hit = r.rows.find((row) => row.cols.join(',') === want);
      console.log(
        `${table.padEnd(20)} ${hit ? '✓' : '✗ MISSING'}  unique(${want})` +
          (hit ? `  → ${hit.index_name}` : `   [has: ${r.rows.map((x) => x.cols.join('+')).join(' | ') || 'none'}]`),
      );
    }
  } finally {
    await c.end();
  }
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
