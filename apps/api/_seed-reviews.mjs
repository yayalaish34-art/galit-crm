import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// מסמן כדי שנוכל למחוק בקלות אחר כך (ב-toEmail).
const SEED_MARKER = 'seed-review@galit.local';

// ביקורות לדוגמה — 2×5 כוכבים + 2×4 כוכבים, כל אחת עם טקסט קצר.
const SEEDS = [
  { rating: 5, name: 'תעשיות ברזל רעננה', feedback: 'שירות מעולה ומקצועי, הדוח הגיע מהר וברור. ממליצים בחום!' },
  { rating: 5, name: 'מפעל פלסטיק גן יבנה', feedback: 'צוות אדיב ויסודי, ליוו אותנו לאורך כל התהליך. מרוצים מאוד.' },
  { rating: 4, name: 'עיריית כפר סבא', feedback: 'עבודה טובה ומקצועית, קצת התעכב הדוח אבל בסך הכל שירות איכותי.' },
  { rating: 4, name: 'מרכז לוגיסטי חולון', feedback: 'מקצועיים ונעימים. היינו שמחים לזמינות טלפונית מעט גבוהה יותר.' },
];

async function main() {
  // ננסה לשייך לכל ביקורת לקוח אמיתי לפי שם דומה (best-effort) — כדי שהלחיצה בדשבורד תפתח כרטיס לקוח.
  const customers = await prisma.customer.findMany({ select: { id: true, name: true }, take: 5000 });
  const findCustomer = (name) => {
    const key = name.split(' ')[0];
    return customers.find((c) => (c.name || '').includes(key)) || null;
  };

  let created = 0;
  for (let i = 0; i < SEEDS.length; i++) {
    const s = SEEDS[i];
    const c = findCustomer(s.name);
    // מפזרים את תאריך הדירוג על פני הימים האחרונים כדי שייראה טבעי.
    const ratedAt = new Date(Date.now() - (i + 1) * 36 * 60 * 60 * 1000);
    await prisma.reviewRequest.create({
      data: {
        toEmail: SEED_MARKER,
        customerId: c?.id ?? null,
        customerName: c?.name || s.name,
        rating: s.rating,
        ratedAt,
        feedback: s.feedback,
        feedbackAt: ratedAt,
        sentAt: new Date(ratedAt.getTime() - 60 * 60 * 1000),
      },
    });
    created++;
    console.log(`✓ ${s.rating}★  ${c?.name || s.name}${c ? ' (linked)' : ' (no customer link)'}`);
  }

  const agg = await prisma.reviewRequest.findMany({ where: { rating: { not: null } }, select: { rating: true } });
  const avg = agg.reduce((a, r) => a + r.rating, 0) / (agg.length || 1);
  console.log(`\nDone. Created ${created}. Total rated reviews now: ${agg.length}, avg ${avg.toFixed(1)}★`);
  console.log(`(to delete these seeds: reviewRequest where toEmail = "${SEED_MARKER}")`);
}

main()
  .catch((e) => { console.error('SEED FAILED:', e.message); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
