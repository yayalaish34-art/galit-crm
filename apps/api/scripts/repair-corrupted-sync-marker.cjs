/**
 * תיקון נתונים: שורות QuoteDocument שנכתבו בזמן שהקוד היה פגום-קידוד קיבלו
 * documentDescription משובש במקום 'גרסה ערוכה מ-Word (סונכרן אוטומטית)'.
 * בלי התיקון, AiMailService.gatherQuoteContent לא מזהה אותן כגרסה ערוכה
 * ו"נסח מחדש" ממשיך להיחסם עבור אותן הצעות.
 *
 *   DRY_RUN=1 npx railway run node scripts/repair-corrupted-sync-marker.cjs
 *   npx railway run node scripts/repair-corrupted-sync-marker.cjs
 */
const { Client } = require('pg');
const GOOD = 'גרסה ערוכה מ-Word (סונכרן אוטומטית)';
const DRY = process.env.DRY_RUN === '1';

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    // המשובשות: מזכירות Word אך חסרות את הסמן התקין ומכילות geresh (U+05F3) — חתימת ה-mojibake.
    const where = `"documentDescription" LIKE '%Word%'
                   AND "documentDescription" NOT LIKE '%סונכרן אוטומטית%'
                   AND "documentDescription" LIKE '%' || chr(1523) || '%'`;
    const found = await c.query(`SELECT COUNT(*)::int AS n FROM "QuoteDocument" WHERE ${where}`);
    console.log(`corrupted rows: ${found.rows[0].n}`);
    if (DRY) { console.log('DRY_RUN — nothing written.'); return; }
    if (found.rows[0].n === 0) { console.log('nothing to repair.'); return; }

    const upd = await c.query(
      `UPDATE "QuoteDocument" SET "documentDescription" = $1 WHERE ${where}`, [GOOD],
    );
    console.log(`repaired: ${upd.rowCount}`);
    const after = await c.query(
      `SELECT COUNT(*)::int AS n FROM "QuoteDocument" WHERE "documentDescription" LIKE '%סונכרן אוטומטית%'`,
    );
    console.log(`rows now marked correctly: ${after.rows[0].n}`);
  } finally { await c.end(); }
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
