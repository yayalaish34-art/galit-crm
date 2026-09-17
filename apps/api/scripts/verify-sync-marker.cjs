/**
 * מאמת שהחסימה של "נסח מחדש" נפתחה: בודק כמה הצעות מזוהות כבעלות גרסה
 * ערוכה מ-Word — כלומר documentDescription שמכיל "סונכרן אוטומטית", המחרוזת
 * ש-AiMailService.gatherQuoteContent מחפש כדי לאשר ניסוח.
 */
const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    const r = await c.query(
      `SELECT COUNT(*)::int AS n FROM "QuoteDocument" WHERE "documentDescription" LIKE '%סונכרן אוטומטית%'`,
    );
    const recent = await c.query(
      `SELECT "documentDescription", COUNT(*)::int AS n, MAX("createdAt") AS last
         FROM "QuoteDocument" WHERE "documentDescription" IS NOT NULL
        GROUP BY 1 ORDER BY last DESC NULLS LAST LIMIT 6`,
    );
    console.log(`docs marked "סונכרן אוטומטית": ${r.rows[0].n}`);
    console.log('\nrecent documentDescription values:');
    for (const row of recent.rows) {
      console.log(`  ${row.n.toString().padStart(5)}  ${String(row.last).slice(0,19)}  ${row.documentDescription}`);
    }
  } finally { await c.end(); }
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
