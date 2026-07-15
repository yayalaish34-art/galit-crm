import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

console.log('=== Server PDF-convert config ===');
console.log('GRAPH_CLIENT_ID set     :', !!process.env.GRAPH_CLIENT_ID);
console.log('GRAPH_CLIENT_SECRET set :', !!process.env.GRAPH_CLIENT_SECRET);
console.log('CLOUDCONVERT_API_KEY set:', !!process.env.CLOUDCONVERT_API_KEY, '  <-- if false, NO fallback when Graph fails');
console.log('');

const users = await prisma.user.findMany({
  where: { status: 'ACTIVE' },
  select: { id: true, name: true, email: true, msEmail: true, msConnectedAt: true, msRefreshToken: true, odRefreshToken: true },
  orderBy: { msConnectedAt: 'asc' },
});

console.log('=== Users & Outlook connection ===');
for (const u of users) {
  const connected = !!u.msRefreshToken;
  console.log(`${connected ? 'CONNECTED' : 'no-conn '} | ${u.name} (${u.email}) | msConnectedAt=${u.msConnectedAt ? u.msConnectedAt.toISOString() : 'NEVER'} | odConnected=${!!u.odRefreshToken}`);
}
console.log(`\nConnected to Outlook: ${users.filter((u) => u.msRefreshToken).length}/${users.length}`);

await prisma.$disconnect();
await pool.end();
