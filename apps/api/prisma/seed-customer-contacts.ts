import 'dotenv/config';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

/** Two sample contacts per customer when missing; rotate templates for variety */
const CONTACT_TEMPLATES: ReadonlyArray<
  Readonly<{ fullName: string; phone: string; mobile: string; email: string; roleTitle: string }>
> = [
  {
    fullName: 'יוסי כהן',
    phone: '050-1234567',
    mobile: '050-1234567',
    email: 'yossi@test.co.il',
    roleTitle: 'מנהל פרויקטים',
  },
  {
    fullName: 'דנה לוי',
    phone: '052-9876543',
    mobile: '052-9876543',
    email: 'dana@test.co.il',
    roleTitle: 'רכש',
  },
  {
    fullName: 'משה אברהם',
    phone: '054-1112233',
    mobile: '054-1112233',
    email: 'moshe@test.co.il',
    roleTitle: 'מנכ"ל',
  },
  {
    fullName: 'רינה גולן',
    phone: '053-4445566',
    mobile: '053-4445566',
    email: 'rina@test.co.il',
    roleTitle: 'מנהלת משרד',
  },
];

function variantForCustomer(customerIndex: number, slot: 0 | 1) {
  const t = CONTACT_TEMPLATES[(customerIndex * 2 + slot) % CONTACT_TEMPLATES.length];
  const suffix = `${customerIndex}-${slot}`;
  const emailLocal = t.email.replace('@', `.c${suffix}@`);
  const phoneDigits = String(1000000 + customerIndex * 31 + slot * 17).padStart(7, '0').slice(-7);
  const prefix = slot === 0 ? '050' : '052';
  return {
    ...t,
    email: emailLocal,
    phone: `${prefix}-${phoneDigits}`,
    mobile: `${prefix}-${phoneDigits}`,
  };
}

async function main() {
  const customers = await prisma.customer.findMany({ select: { id: true } });
  let customersUpdated = 0;
  let contactsCreated = 0;

  for (let i = 0; i < customers.length; i++) {
    const { id: customerId } = customers[i];
    const existingCount = await prisma.customerContact.count({ where: { customerId } });
    const need = Math.max(0, 2 - existingCount);
    if (need === 0) continue;

    customersUpdated += 1;
    for (let s = 0; s < need; s++) {
      const slot = ((existingCount + s) % 2) as 0 | 1;
      const v = variantForCustomer(i, slot);
      await prisma.customerContact.create({
        data: {
          importLegacyId: `seed-min2-${customerId}-${randomUUID()}`,
          customerId,
          fullName: v.fullName,
          phone: v.phone,
          mobile: v.mobile,
          email: v.email,
          roleTitle: v.roleTitle,
          isPrimary: existingCount === 0 && s === 0,
        },
      });
      contactsCreated += 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        customersConsidered: customers.length,
        customersThatNeededContacts: customersUpdated,
        contactsCreated,
        table: 'CustomerContact',
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
