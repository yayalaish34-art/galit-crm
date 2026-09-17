/** מוודא שכל אובייקטי המסד שהקוד הפרוס מסתמך עליהם קיימים בפועל. */
const { Client } = require('pg');
const CHECKS = [
  ['table',  'QuoteSignatureToken', null],
  ['table',  'QuoteTemplateDocx',   null],
  ['column', 'RadonJob',            'kitSentVia'],
  ['column', 'RadonJob',            'kitSentByUserId'],
  ['column', 'QuoteTemplateDocx',   'onedriveItemId'],
];
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    for (const [kind, table, col] of CHECKS) {
      if (kind === 'table') {
        const r = await c.query(`SELECT to_regclass($1) AS t`, [`"${table}"`]);
        console.log(`${r.rows[0].t ? '✓' : '✗ MISSING'}  table  ${table}`);
      } else {
        const r = await c.query(
          `SELECT 1 FROM information_schema.columns WHERE table_name=$1 AND column_name=$2`, [table, col]);
        console.log(`${r.rowCount ? '✓' : '✗ MISSING'}  column ${table}.${col}`);
      }
    }
  } finally { await c.end(); }
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
