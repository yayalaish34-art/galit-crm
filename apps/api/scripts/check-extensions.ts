import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: (process.env.DATABASE_URL || '').replace(':6543', ':5432') });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

(async () => {
  console.log('\n=== כל השלוחות הקיימות (לא NULL) ===');
  const withExt = await prisma.user.findMany({
    where: { pbxExtension: { not: null } },
    select: { name: true, email: true, pbxExtension: true, status: true, role: true },
    orderBy: { pbxExtension: 'asc' },
  });
  for (const u of withExt) {
    console.log(`  ${u.pbxExtension}  —  ${u.name}  <${u.email}>  [${u.status}/${u.role}]`);
  }

  console.log('\n=== חיפוש "גיא" ===');
  const guys = await prisma.user.findMany({
    where: { name: { contains: 'גיא' } },
    select: { name: true, email: true, pbxExtension: true, status: true, role: true },
  });
  if (guys.length === 0) console.log('  לא נמצא אף משתמש עם "גיא" בשם.');
  for (const u of guys) {
    console.log(`  ${u.name}  <${u.email}>  שלוחה=${u.pbxExtension ?? '(ריק)'}  [${u.status}/${u.role}]`);
  }

  console.log('\n=== חיפוש "יאיר" ===');
  const yairs = await prisma.user.findMany({
    where: { name: { contains: 'יאיר' } },
    select: { name: true, email: true, pbxExtension: true, status: true, role: true },
  });
  if (yairs.length === 0) console.log('  לא נמצא אף משתמש עם "יאיר" בשם.');
  for (const u of yairs) {
    console.log(`  ${u.name}  <${u.email}>  שלוחה=${u.pbxExtension ?? '(ריק)'}  [${u.status}/${u.role}]`);
  }

  await prisma.$disconnect();
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
