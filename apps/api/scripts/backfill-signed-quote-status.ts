/**
 * Backfill: הצעות שנחתמו דיגיטלית לפני התיקון נשארו עם status=DRAFT/SENT.
 *
 * זרימת החתימה (quote-signature.service.ts submitSignature) הגדירה רק
 * digitalSignatureStatus='SIGNED', בעוד שהדשבורד סופר הכנסות לפי Quote.status —
 * ולכן הזמנות חתומות לא הופיעו ב"הכנסות לפי הזמנות" / "הכנסה החודש".
 *
 * החתימה מתקנת את זה קדימה; הסקריפט הזה מיישר את הרשומות ההיסטוריות.
 * בטוח להרצה חוזרת (idempotent) — מעדכן רק רשומות שעדיין לא APPROVED/SIGNED.
 *
 * הרצה:  npx tsx scripts/backfill-signed-quote-status.ts [--apply]
 * ללא --apply מדובר בהרצה יבשה (dry-run) שרק מדפיסה מה ישתנה.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const apply = process.argv.includes('--apply');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const candidates = await prisma.quote.findMany({
    where: {
      digitalSignatureStatus: 'SIGNED' as any,
      status: { notIn: ['APPROVED', 'SIGNED'] as any },
    },
    select: {
      id: true,
      quoteNumber: true,
      status: true,
      signedAt: true,
      totalAmount: true,
      amount: true,
    },
    orderBy: { signedAt: 'desc' },
  });

  console.log(`${apply ? 'APPLY' : 'DRY-RUN'} — נמצאו ${candidates.length} הצעות חתומות עם status לא-מעודכן\n`);

  let sum = 0;
  for (const q of candidates) {
    const amt = Number(q.totalAmount ?? q.amount ?? 0);
    sum += amt;
    const signed = q.signedAt ? q.signedAt.toISOString().slice(0, 10) : 'ללא תאריך';
    console.log(`  ${q.quoteNumber ?? q.id.slice(0, 8)} | ${q.status} → SIGNED | נחתם ${signed} | ₪${amt.toLocaleString()}`);
  }
  console.log(`\nסה"כ הכנסה שתיכנס לדשבורד: ₪${sum.toLocaleString()}`);

  if (!apply) {
    console.log('\nלא בוצע שינוי. להרצה בפועל: npx tsx scripts/backfill-signed-quote-status.ts --apply');
    return;
  }
  if (!candidates.length) return;

  // updatedAt מוגדר במפורש כדי לשמר את ערכו — אחרת Prisma היה דוחף אותו להיום
  // ומזייף את תאריך הסגירה עבור כל צרכן שעדיין נופל חזרה ל-updatedAt.
  const res = await prisma.$executeRawUnsafe(`
    UPDATE "Quote"
       SET "status" = 'SIGNED', "updatedAt" = "updatedAt"
     WHERE "digitalSignatureStatus" = 'SIGNED'
       AND "status" NOT IN ('APPROVED', 'SIGNED')
  `);
  console.log(`\nעודכנו ${res} רשומות.`);
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
