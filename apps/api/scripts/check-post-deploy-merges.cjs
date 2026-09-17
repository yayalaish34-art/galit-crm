/** מוודא שמיזוג הצעות המשיך לעבוד אחרי המעבר ל-TemplateDocxStore. */
const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    for (const [label, since] of [
      ['since template-store deploy (Aug 16 13:50 UTC)', '2026-08-16 13:50'],
      ['since encoding-fix deploy (Aug 18 06:31 UTC)', '2026-08-18 06:31'],
    ]) {
      const r = await c.query(
        `SELECT "documentType", COUNT(*)::int AS n, MAX("createdAt") AS last
           FROM "QuoteDocument" WHERE "createdAt" >= $1::timestamp
          GROUP BY 1 ORDER BY 2 DESC`, [since],
      );
      console.log(`\n${label}:`);
      if (!r.rowCount) { console.log('   (none)'); continue; }
      for (const row of r.rows) console.log(`   ${row.documentType.padEnd(14)} ${String(row.n).padStart(4)}   last: ${String(row.last).slice(0,19)}`);
    }
    const q = await c.query(`SELECT COUNT(*)::int AS n FROM "Quote" WHERE "createdAt" >= '2026-08-16 13:50'::timestamp`);
    console.log(`\nquotes created since template-store deploy: ${q.rows[0].n}`);
    const t = await c.query(`SELECT COUNT(*)::int AS n FROM "QuoteTemplateDocx"`);
    console.log(`template overrides stored so far          : ${t.rows[0].n}`);
  } finally { await c.end(); }
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
