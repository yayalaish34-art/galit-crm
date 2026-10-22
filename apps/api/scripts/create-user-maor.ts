import 'dotenv/config';
import { PrismaClient, UserRole, UserStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcryptjs';

// Use the Supabase session pooler (port 5432), not the transaction pooler (6543).
// See memory: railway-migrations-session-pooler.
const pool = new Pool({ connectionString: (process.env.DATABASE_URL || '').replace(':6543', ':5432') });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const NAME = 'מאור';
const EMAIL = 'maor@galit.co.il';
const PASSWORD = 'maor2026!';
const ROLE: UserRole = UserRole.SALES;
const PBX_EXTENSION = '206';

(async () => {
  const existing = await prisma.user.findUnique({ where: { email: EMAIL } });
  const hashed = await bcrypt.hash(PASSWORD, 10);

  // "לגנוב" את השלוחה אם מישהו אחר תפוס עליה — אותה סמנטיקה כמו claimPbxExtension.
  const squatter = await prisma.user.findFirst({
    where: { pbxExtension: PBX_EXTENSION, NOT: existing ? { id: existing.id } : undefined },
  });
  if (squatter) {
    await prisma.user.update({ where: { id: squatter.id }, data: { pbxExtension: null } });
    console.log(`שלוחה ${PBX_EXTENSION} הייתה רשומה על ${squatter.name} — פונתה.`);
  }

  if (existing) {
    const u = await prisma.user.update({
      where: { id: existing.id },
      data: {
        name: NAME,
        password: hashed,
        role: ROLE,
        status: UserStatus.ACTIVE,
        pbxExtension: PBX_EXTENSION,
      },
    });
    console.log(`עודכן משתמש קיים: ${u.name} <${u.email}>`);
  } else {
    const u = await prisma.user.create({
      data: {
        name: NAME,
        email: EMAIL,
        password: hashed,
        role: ROLE,
        status: UserStatus.ACTIVE,
        pbxExtension: PBX_EXTENSION,
      },
    });
    console.log(`נוצר משתמש חדש: ${u.name} <${u.email}>`);
  }
  console.log('\n=== פרטי כניסה ===');
  console.log(`  אימייל: ${EMAIL}`);
  console.log(`  סיסמה:  ${PASSWORD}`);
  console.log(`  תפקיד:  ${ROLE}`);
  await prisma.$disconnect();
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
