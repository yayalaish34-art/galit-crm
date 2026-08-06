import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcryptjs';

const pool = new Pool({ connectionString: (process.env.DATABASE_URL || '').replace(':6543', ':5432') });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

// שותף בדיקה (fake) — username/password לבדיקת הפורטל.
const NAME = 'שותף בדיקה בע״מ';
const USERNAME = 'demo-partner';
const PASSWORD = 'Partner-2026';
const COMMISSION_PCT = 10;

(async () => {
  const existing = await prisma.affiliate.findFirst({ where: { username: { equals: USERNAME, mode: 'insensitive' } } });
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  let affiliate;
  if (existing) {
    affiliate = await prisma.affiliate.update({
      where: { id: existing.id },
      data: { passwordHash, name: NAME, commissionPct: COMMISSION_PCT, isActive: true },
    });
    console.log('עודכן שותף קיים.');
  } else {
    affiliate = await prisma.affiliate.create({
      data: { name: NAME, username: USERNAME, passwordHash, commissionPct: COMMISSION_PCT, email: 'partner@example.com' },
    });
    console.log('נוצר שותף חדש.');
    // שתי הפניות לדוגמה כדי שיהיה מה לראות בפורטל.
    await prisma.affiliateReferral.createMany({
      data: [
        { affiliateId: affiliate.id, customerName: 'לקוח לדוגמה א׳', customerPhone: '050-1112222', serviceType: 'בדיקת קרינה', status: 'NEW' },
        { affiliateId: affiliate.id, customerName: 'לקוח לדוגמה ב׳', customerEmail: 'b@example.com', serviceType: 'בדיקת אסבסט', status: 'IN_PROGRESS' },
      ],
    });
    console.log('נוספו 2 הפניות לדוגמה.');
  }
  console.log('\n=== פרטי כניסה לפורטל השותפים ===');
  console.log(`  כתובת:    <FRONTEND_URL>/affiliate`);
  console.log(`  שם משתמש: ${USERNAME}`);
  console.log(`  סיסמה:    ${PASSWORD}`);
  console.log(`  עמלה:     ${COMMISSION_PCT}%`);
  await prisma.$disconnect();
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
