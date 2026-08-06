/**
 * Backfill: מספר ההצעה (Quote.quoteNumber) לא נשמר מעולם.
 *
 * מסך ההצעה מושך מספר רץ מ-/quotes/next-reference ושומר אותו רק ב-orderReferenceNumber
 * ("סימוכין"), בעוד quoteNumber נשאר null. לכן ברשימות ההצעות, במסמכי ה-Word ובמיילים
 * ההצעה הופיעה בלי מספר ("—" / "טיוטה").
 *
 * quotes.service.ts מיישר את זה קדימה (create/update ממלאים את שני השדות באותו ערך);
 * הסקריפט הזה מיישר את הרשומות הקיימות.
 *
 * הכלל: מספר ההצעה = הסימוכין. מקור הערך, לפי סדר: quoteNumber → orderReferenceNumber
 * → importLegacyId (מספר מהמערכת הישנה). רשומה שאין לה אף אחד מהם מקבלת מספר רץ חדש
 * רק אם הועבר --allocate.
 *
 * בטוח להרצה חוזרת (idempotent).
 *
 * הרצה:  npx tsx scripts/backfill-quote-numbers.ts [--apply] [--allocate]
 * ללא --apply זו הרצה יבשה (dry-run) שרק מדפיסה מה ישתנה.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const apply = process.argv.includes('--apply');
const allocate = process.argv.includes('--allocate');

/** המספר הראשון בפורמט החדש — חייב להישאר תואם ל-QuotesService.QUOTE_NUMBER_START */
const QUOTE_NUMBER_START = 13763;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

/** '…' הוא מציין-הטעינה של מסך ההצעה — לא ערך אמיתי. */
function norm(v: unknown): string {
  const s = (v == null ? '' : String(v)).trim();
  if (!s || s === '…' || s === '...') return '';
  return s;
}

async function main() {
  const quotes = await prisma.quote.findMany({
    select: {
      id: true,
      quoteNumber: true,
      orderReferenceNumber: true,
      importLegacyId: true,
      customerName: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  // המספר הרץ הבא — ממשיך מהגבוה ביותר בשני השדות (כמו getNextReference)
  let nextNum = QUOTE_NUMBER_START - 1;
  for (const q of quotes) {
    for (const raw of [q.orderReferenceNumber, q.quoteNumber]) {
      const v = norm(raw);
      if (/^\d{4,6}$/.test(v)) nextNum = Math.max(nextNum, parseInt(v, 10));
    }
  }

  const fixes: Array<{ id: string; quoteNumber: string; orderReferenceNumber: string; reason: string; label: string }> = [];
  let skippedNoSource = 0;

  for (const q of quotes) {
    const no = norm(q.quoteNumber);
    const ref = norm(q.orderReferenceNumber);
    const legacy = norm(q.importLegacyId);
    if (no && ref) continue; // כבר תקין

    let value = no || ref || legacy;
    let reason = no ? 'סימוכין חסר' : ref ? 'מספר הצעה חסר' : 'מספר מהמערכת הישנה';
    if (!value) {
      if (!allocate) { skippedNoSource++; continue; }
      value = String(++nextNum);
      reason = 'הוקצה מספר חדש';
    }
    fixes.push({
      id: q.id,
      quoteNumber: value,
      orderReferenceNumber: value,
      reason,
      label: `${q.customerName ?? '—'} (${q.createdAt.toISOString().slice(0, 10)})`,
    });
  }

  console.log(`${apply ? 'APPLY' : 'DRY-RUN'} — ${quotes.length} הצעות נסרקו, ${fixes.length} לתיקון\n`);
  for (const f of fixes.slice(0, 50)) {
    console.log(`  ${f.quoteNumber.padEnd(8)} | ${f.reason.padEnd(22)} | ${f.label}`);
  }
  if (fixes.length > 50) console.log(`  ... ועוד ${fixes.length - 50}`);
  if (skippedNoSource) {
    console.log(`\n${skippedNoSource} הצעות ללא מספר כלשהו דולגו. להקצות להן מספר רץ חדש: הוסיפו --allocate`);
  }

  // אזהרה: מספרים שכבר משותפים ליותר מהצעה אחת (סימוכין כפול שנוצר לפני התיקון —
  // שני משתמשים/שתי טיוטות שקיבלו את אותו מספר רץ). הסקריפט לא משנה מספרים כאלה.
  const byNumber = new Map<string, string[]>();
  for (const q of quotes) {
    const value = norm(q.quoteNumber) || norm(q.orderReferenceNumber) || norm(q.importLegacyId);
    if (!value) continue;
    byNumber.set(value, [...(byNumber.get(value) ?? []), q.customerName ?? q.id.slice(0, 8)]);
  }
  const dups = [...byNumber.entries()].filter(([, list]) => list.length > 1);
  if (dups.length) {
    console.log(`\nשימו לב — ${dups.length} מספרים משותפים ליותר מהצעה אחת (קיים כבר בסימוכין, לא שונה כאן):`);
    for (const [num, list] of dups) console.log(`  ${num}: ${list.join(' | ')}`);
  }

  if (!apply) {
    console.log('\nלא בוצע שינוי. להרצה בפועל: npx tsx scripts/backfill-quote-numbers.ts --apply');
    return;
  }
  if (!fixes.length) return;

  // updatedAt נשמר כפי שהוא — אין כאן שינוי תוכן אמיתי של ההצעה.
  let done = 0;
  for (const f of fixes) {
    await prisma.$executeRaw`
      UPDATE "Quote"
         SET "quoteNumber" = ${f.quoteNumber},
             "orderReferenceNumber" = ${f.orderReferenceNumber},
             "updatedAt" = "updatedAt"
       WHERE "id" = ${f.id}
    `;
    done++;
  }
  console.log(`\nעודכנו ${done} רשומות.`);
}

main()
  .catch((e) => {
    console.error('נכשל:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
