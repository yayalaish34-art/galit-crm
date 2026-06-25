import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const p = new PrismaClient({ adapter: new PrismaPg(pool) });
const cmd = process.argv[2] || 'demo';

if (cmd === 'cleanup') {
  const sims = await p.incomingLead.findMany({ where: { messageId: { startsWith: 'SIM-' } }, select: { id: true, taskId: true } });
  const taskIds = sims.map((s) => s.taskId).filter(Boolean);
  if (taskIds.length) await p.task.deleteMany({ where: { id: { in: taskIds } } });
  const r = await p.incomingLead.deleteMany({ where: { messageId: { startsWith: 'SIM-' } } });
  console.log(`🧹 Cleaned ${r.count} test lead(s) and ${taskIds.length} task(s).`);
  process.exit(0);
}

const admin = await p.user.findFirst({ where: { email: 'admin@galit.local' }, select: { id: true } });
if (!admin) { console.log('admin not found'); process.exit(1); }

// לקוח קיים אמיתי (לבדיקת התאמה)
const cust = await p.customer.findFirst({ where: { name: { not: '' } }, select: { name: true, contactName: true, phone: true } });
const existingName = cust?.contactName?.trim() || cust?.name?.trim() || 'לקוח קיים';

const make = async (name, phone, label) => {
  const stamp = Date.now() + Math.floor(Math.random() * 1000);
  const subject = 'הודעה חדשה מאת "גלית"';
  const body = [`שם: ${name}`, `טלפון: ${phone}`, 'אימייל: test@example.com', 'הודעה: מעוניין בבדיקת ראדון - נא לחזור אליי'].join('\n');
  const lead = await p.incomingLead.create({
    data: { messageId: `SIM-${stamp}`, internetMessageId: `<sim-${stamp}@galit.co.il>`, subject, body, fromName: 'אתר גלית', fromEmail: 'no-reply@galit.co.il', receivedAt: new Date(), ownerId: admin.id, status: 'NEW' },
  });
  const task = await p.task.create({
    data: { title: subject, description: body, type: 'step1', status: 'OPEN', priority: 'HIGH', ownerId: admin.id, currentStage: 0, incomingLeadId: lead.id },
  });
  await p.incomingLead.update({ where: { id: lead.id }, data: { taskId: task.id } });
  console.log(`✅ ${label}: "${name}" → lead ${lead.id}`);
};

await make(existingName, cust?.phone || '0500000000', `התאמה (לקוח קיים: ${existingName})`);
await make('ישראל ישראלי בדיקה', '0539998877', 'ללא התאמה (שם חדש)');
console.log('→ רענן את ה-CRM ופתח את שני הלידים בראש רשימת המשימות.');
process.exit(0);
