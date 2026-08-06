/**
 * חד-פעמי: מאחד את כל הווריאציות של "מקור הגעה = אתר" לתווית קנונית אחת
 * "אתר אינטרנט" בעמודת Customer.leadSource.
 *
 * מפעילים דרך:  railway run --service api -- npx tsx scripts/normalize-leadsource-site.ts
 * ברירת מחדל = DRY RUN (רק מדפיס). להרצה אמיתית: הוסיפו את הדגל  --apply
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const CANON = 'אתר אינטרנט';
// כל הערכים (case-insensitive, אחרי trim) שצריכים להפוך ל-CANON:
const VARIANTS = new Set(
  ['אתר', 'SITE', 'WEBSITE', 'WEB', 'אתר אינטרנט', 'אינטרנט'].map((v) => v.toLowerCase()),
);

async function main() {
  const apply = process.argv.includes('--apply');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    // 1) פילוח כל הערכים הקיימים בעמודה — כדי לראות מה באמת יש לפני שינוי
    const groups = await prisma.customer.groupBy({
      by: ['leadSource'],
      _count: { _all: true },
      where: { leadSource: { not: null } },
    });
    const nonEmpty = groups
      .map((g) => ({ value: (g.leadSource || '').trim(), count: g._count._all }))
      .filter((g) => g.value)
      .sort((a, b) => b.count - a.count);

    console.log('== ערכי leadSource קיימים ==');
    for (const g of nonEmpty) {
      const hit = VARIANTS.has(g.value.toLowerCase()) ? '  → יומר ל"אתר אינטרנט"' : '';
      console.log(`  ${g.count.toString().padStart(5)}  "${g.value}"${hit}`);
    }

    // 2) איסוף ה-IDs שצריך לעדכן (כולל התאמה case-insensitive/trim ב-JS,
    //    כי ב-DB יש רווחים/רישיות מעורבים)
    const candidates = await prisma.customer.findMany({
      where: { leadSource: { not: null } },
      select: { id: true, leadSource: true },
    });
    const toFix = candidates.filter((c) => {
      const v = (c.leadSource || '').trim().toLowerCase();
      return VARIANTS.has(v) && (c.leadSource || '').trim() !== CANON;
    });

    console.log(`\nסה"כ רשומות שצריך לעדכן (לא כולל כאלה שכבר "${CANON}"): ${toFix.length}`);

    if (!apply) {
      console.log('\n[DRY RUN] לא בוצע שום שינוי. להרצה אמיתית הוסיפו --apply');
      return;
    }

    if (toFix.length) {
      const ids = toFix.map((c) => c.id);
      const res = await prisma.customer.updateMany({
        where: { id: { in: ids } },
        data: { leadSource: CANON },
      });
      console.log(`\n✅ עודכנו ${res.count} רשומות ל-"${CANON}".`);
    } else {
      console.log('\nאין מה לעדכן.');
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
