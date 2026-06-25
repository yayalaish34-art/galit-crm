import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const p = new PrismaClient({ adapter: new PrismaPg(pool) });

// אותה רשימה כמו בקוד השרת
const ALLOWLIST = ['noreply@galit.co.il', 'no-reply@galit.co.il', 'notify@web3forms.com'];
const norm = (s) => String(s || '').trim().toLowerCase();
const isAllowed = (email) => ALLOWLIST.includes(norm(email));

const cmd = process.argv[2] || 'count';

// כל הלידים בסטטוס NEW
const news = await p.incomingLead.findMany({
  where: { status: 'NEW' },
  select: { id: true, taskId: true, fromEmail: true, subject: true, receivedAt: true },
  orderBy: { receivedAt: 'desc' },
});

// משימות חיות מבין ה-taskId-ים
const taskIds = news.map((l) => l.taskId).filter(Boolean);
const liveTasks = taskIds.length
  ? await p.task.findMany({ where: { id: { in: taskIds } }, select: { id: true } })
  : [];
const liveTaskIds = new Set(liveTasks.map((t) => t.id));

const badSender = news.filter((l) => !isAllowed(l.fromEmail));
const orphaned = news.filter((l) => !l.taskId || !liveTaskIds.has(l.taskId));
// קבוצת המחיקה: שולח לא מאושר או ליד יתום (משימה נמחקה)
const toDeleteMap = new Map();
for (const l of [...badSender, ...orphaned]) toDeleteMap.set(l.id, l);
const toDelete = [...toDeleteMap.values()];

console.log(`סה"כ לידים בסטטוס NEW: ${news.length}`);
console.log(`  • שולח לא מאושר: ${badSender.length}`);
console.log(`  • יתומים (משימה נמחקה/חסרה): ${orphaned.length}`);
console.log(`  → מועמדים למחיקה (איחוד): ${toDelete.length}`);
console.log('');
console.log('פירוט לפי שולח (NEW):');
const bySender = {};
for (const l of news) bySender[norm(l.fromEmail) || '(ריק)'] = (bySender[norm(l.fromEmail) || '(ריק)'] || 0) + 1;
for (const [k, v] of Object.entries(bySender).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${isAllowed(k) ? '✅' : '🗑️ '} ${k}: ${v}`);
}

if (cmd === 'delete') {
  const ids = toDelete.map((l) => l.id);
  const delTaskIds = toDelete.map((l) => l.taskId).filter(Boolean);
  if (delTaskIds.length) await p.task.deleteMany({ where: { id: { in: delTaskIds } } });
  const r = await p.incomingLead.deleteMany({ where: { id: { in: ids } } });
  console.log('');
  console.log(`🧹 נמחקו ${r.count} לידים ו-${delTaskIds.length} משימות מקושרות.`);
} else {
  console.log('');
  console.log('— מצב ספירה בלבד (dry-run). למחיקה בפועל הרץ עם הפרמטר: delete —');
}

await p.$disconnect();
process.exit(0);
