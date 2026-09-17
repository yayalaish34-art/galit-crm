/**
 * סריקה רוחבית: מאתר טקסט משובש-קידוד בכל עמודות הטקסט במסד.
 *
 * חתימה: geresh (׳, U+05F3) שחוזר לפחות 3 פעמים עם תו כלשהו אחריו — התבנית
 * שנוצרת כשעברית UTF-8 נקראת כ-ANSI. גרש בודד הוא עברית לגיטימית (ג'ון),
 * ולכן דורשים רצף כדי לא לקבל התראות שווא.
 */
const { Client } = require('pg');
const SIG = "~ '(\u05f3.){3,}'";

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    const cols = await c.query(`
      SELECT table_name, column_name
        FROM information_schema.columns
       WHERE table_schema = 'public'
         AND data_type IN ('text','character varying')
       ORDER BY table_name, column_name`);
    console.log(`scanning ${cols.rows.length} text columns…\n`);
    const hits = [];
    for (const { table_name, column_name } of cols.rows) {
      try {
        const r = await c.query(
          `SELECT COUNT(*)::int AS n FROM "${table_name}" WHERE "${column_name}" ${SIG}`,
        );
        if (r.rows[0].n > 0) hits.push({ table: table_name, column: column_name, n: r.rows[0].n });
      } catch (e) { /* view/permission — דלג */ }
    }
    if (!hits.length) { console.log('✓ no corrupted text found anywhere'); return; }
    console.log('CORRUPTED:');
    for (const h of hits) {
      console.log(`  ${h.table}.${h.column} → ${h.n} row(s)`);
      const s = await c.query(
        `SELECT DISTINCT "${h.column}" AS v FROM "${h.table}" WHERE "${h.column}" ${SIG} LIMIT 4`,
      );
      for (const row of s.rows) console.log(`      ${String(row.v).slice(0, 90)}`);
    }
  } finally { await c.end(); }
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
