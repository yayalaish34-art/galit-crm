/**
 * חד-פעמי: מעצב עם מקף כל מספר טלפון שכבר שמור ב-DB בלי מקף.
 *
 * מאז השינוי, כל כתיבה חדשה (טופס, בוט, ייבוא, פענוח מייל ליד) כבר נשמרת עם מקף,
 * וכל תצוגה מעוצבת בזמן רינדור. הסקריפט הזה נועד לרשומות הישנות — כדי שגם מה
 * שיוצא *מחוץ* למערכת (הצעות מחיר ב-DOCX, חשבוניות כספית, מיילים) יראה מקף.
 *
 * טבלאות: Customer(phone, phone2, phone3, fax), CustomerContact(phone, mobile, fax), Lead(phone).
 *
 * בטיחות:
 *  - formatIsraeliPhone לעולם לא מאבד מידע: מה שלא זוהה כמספר ישראלי חוזר כמו שהוא,
 *    ומספר שכבר מכיל מקף לא נגוע. לכן הסקריפט אידמפוטנטי — הרצה שנייה לא תשנה כלום.
 *  - החיפוש/ההתאמה לפי טלפון במערכת עובד על ספרות בלבד (digits-only), ולכן הוספת
 *    מקף אינה שוברת התאמות קיימות.
 *
 * מפעילים דרך:  railway run --service api -- npx tsx scripts/backfill-phone-dashes.ts
 * ברירת מחדל = DRY RUN (רק מדפיס). להרצה אמיתית: הוסיפו את הדגל  --apply
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { formatIsraeliPhone } from '../src/common/phone.util';

const BATCH = 500;

type Row = Record<string, any> & { id: string };

/** מחזיר patch רק לשדות שהעיצוב באמת שינה. אובייקט ריק = אין מה לעדכן. */
function diffPhones(row: Row, fields: string[]): Record<string, string> {
  const patch: Record<string, string> = {};
  for (const f of fields) {
    const cur = row[f];
    if (cur == null || cur === '') continue;
    const next = formatIsraeliPhone(cur);
    if (next !== cur) patch[f] = next;
  }
  return patch;
}

async function backfillTable(
  prisma: PrismaClient,
  label: string,
  model: any,
  fields: string[],
  apply: boolean,
): Promise<{ scanned: number; changed: number }> {
  const select: Record<string, boolean> = { id: true };
  for (const f of fields) select[f] = true;

  let cursor: string | undefined;
  let scanned = 0;
  let changed = 0;
  const samples: string[] = [];

  for (;;) {
    const rows: Row[] = await model.findMany({
      select,
      take: BATCH,
      orderBy: { id: 'asc' },
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1].id;
    scanned += rows.length;

    for (const row of rows) {
      const patch = diffPhones(row, fields);
      if (Object.keys(patch).length === 0) continue;
      changed++;
      if (samples.length < 10) {
        const shown = Object.entries(patch)
          .map(([f, v]) => `${f}: "${row[f]}" → "${v}"`)
          .join(', ');
        samples.push(`  ${row.id}  ${shown}`);
      }
      if (apply) await model.update({ where: { id: row.id }, data: patch });
    }
  }

  console.log(`\n== ${label} ==`);
  console.log(`  נסרקו: ${scanned}   לשינוי: ${changed}`);
  if (samples.length) {
    console.log('  דוגמאות:');
    for (const s of samples) console.log(s);
  }
  return { scanned, changed };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    console.log(apply ? '=== מצב APPLY — מעדכן את ה-DB ===' : '=== DRY RUN — לא נכתב כלום (הוסיפו --apply) ===');

    const results = [
      await backfillTable(prisma, 'Customer', prisma.customer, ['phone', 'phone2', 'phone3', 'fax'], apply),
      await backfillTable(prisma, 'CustomerContact', prisma.customerContact, ['phone', 'mobile', 'fax'], apply),
      await backfillTable(prisma, 'Lead', prisma.lead, ['phone'], apply),
    ];

    const totalChanged = results.reduce((s, r) => s + r.changed, 0);
    console.log(`\nסה"כ רשומות לשינוי: ${totalChanged}`);
    if (!apply && totalChanged > 0) console.log('להרצה אמיתית: הוסיפו --apply');
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
