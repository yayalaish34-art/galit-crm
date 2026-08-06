/**
 * תיקון חד-פעמי לנתוני ייצור — "הצעות ריקות שהסתירו את ההצעה האמיתית".
 *
 * הרקע: השמירה האוטומטית במסך ההצעה יצרה הצעה חדשה רק בגלל שהמסך נפתח בתוך משימה
 * (customerId הגיע מ-prefill). ההצעה הריקה נרשמה על המשימה, ומכיוון שרשימת ההצעות
 * של משימה ממוינת מהחדש לישן — היא הסתירה את ההצעה האמיתית.
 *
 * מה הסקריפט עושה:
 *   1. מקשר את ההצעה האמיתית של "גילת רשתות לוין" (18373) למשימה שלה.
 *   2. מנתק (linkedEntityId = NULL) כל הצעה ריקה — 0 פריטים, סכום 0, בלי קובץ ובלי
 *      QuoteDocument — שמקושרת למשימה. השורות עצמן *לא* נמחקות.
 *
 * הכל מגובה ל-_repair-empty-quotes-backup-<ts>.json לפני העדכון.
 * הרצה: node _repair-empty-quotes.mjs --apply   (בלי הדגל = תצוגה מקדימה בלבד)
 */
import pg from 'pg';
import fs from 'fs';

const APPLY = process.argv.includes('--apply');
const url = fs.readFileSync('.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL')).split('=')[1].replace(/^"|"$/g, '').trim();
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

const REAL_QUOTE_ID = '9d87805d-ed6a-46cc-979a-6709246f38a4'; // הצעה 18373 — גילת רשתות לוין
const REAL_QUOTE_TASK = '44c3a7b4-030d-4654-82b6-a19e4704e5f9'; // המשימה שנפתחה ממנה

// ── 1. ההצעות הריקות המקושרות למשימה ──────────────────────────────────────────
const empties = await c.query(`
  SELECT q.id, q."quoteNumber", q."customerName", q."linkedEntityId", q."createdAt", t.title AS task_title
  FROM "Quote" q
  JOIN "Task" t ON t.id = q."linkedEntityId"
  WHERE COALESCE(q."totalAmount", 0) = 0
    AND jsonb_array_length(COALESCE(q."lineItemsJson"::jsonb, '[]'::jsonb)) = 0
    AND q."lastMergedDocPath" IS NULL
    AND q."pdfPath" IS NULL
    AND q."contentHtml" IS NULL
    AND NOT EXISTS (SELECT 1 FROM "QuoteDocument" d WHERE d."quoteId" = q.id)
  ORDER BY q."createdAt"`);

console.log(`\n== הצעות ריקות שינותקו מהמשימה (${empties.rowCount}) ==`);
console.table(empties.rows.map((r) => ({
  quote: r.quoteNumber, customer: (r.customerName || '').slice(0, 24),
  task: (r.task_title || '').slice(0, 38), created: r.createdAt,
})));

// ── 2. ההצעה האמיתית שתקושר למשימה ────────────────────────────────────────────
const real = await c.query(
  `SELECT id, "quoteNumber", "customerName", "totalAmount", "linkedEntityId" FROM "Quote" WHERE id = $1`,
  [REAL_QUOTE_ID],
);
console.log('\n== ההצעה שתקושר למשימה ==');
console.table(real.rows.map((r) => ({
  quote: r.quoteNumber, customer: r.customerName, total: r.totalAmount,
  linked_now: r.linkedEntityId, linked_after: REAL_QUOTE_TASK,
})));

if (!APPLY) {
  console.log('\n[תצוגה מקדימה בלבד] להרצה אמיתית: node _repair-empty-quotes.mjs --apply\n');
  await c.end();
  process.exit(0);
}

// ── גיבוי לפני שינוי ──────────────────────────────────────────────────────────
const backup = {
  at: new Date().toISOString(),
  unlinked: empties.rows.map((r) => ({ id: r.id, quoteNumber: r.quoteNumber, linkedEntityId: r.linkedEntityId })),
  relinked: real.rows.map((r) => ({ id: r.id, quoteNumber: r.quoteNumber, linkedEntityId: r.linkedEntityId })),
};
const file = `_repair-empty-quotes-backup-${backup.at.replace(/[:.]/g, '-')}.json`;
fs.writeFileSync(file, JSON.stringify(backup, null, 2), 'utf8');
console.log(`\nגיבוי נשמר: ${file}`);

await c.query('BEGIN');
try {
  const ids = empties.rows.map((r) => r.id);
  if (ids.length) {
    const u = await c.query(`UPDATE "Quote" SET "linkedEntityId" = NULL WHERE id = ANY($1)`, [ids]);
    console.log(`נותקו ${u.rowCount} הצעות ריקות מהמשימות שלהן`);
  }
  const l = await c.query(`UPDATE "Quote" SET "linkedEntityId" = $2 WHERE id = $1`, [REAL_QUOTE_ID, REAL_QUOTE_TASK]);
  console.log(`קושרו ${l.rowCount} הצעות אמיתיות למשימה`);
  await c.query('COMMIT');
  console.log('\n✓ התיקון הושלם');
} catch (e) {
  await c.query('ROLLBACK');
  console.error('✗ נכשל — בוצע ROLLBACK:', e.message);
  process.exitCode = 1;
}
await c.end();
