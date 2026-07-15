import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { writeFileSync } from 'fs';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const APPLY = process.argv.includes('--apply');
const now = new Date();
const OPEN = ['OPEN', 'IN_PROGRESS'];

// Overdue = dueDate in the past AND status OPEN/IN_PROGRESS (matches dashboard.service.ts)
const overdue = await prisma.task.findMany({
  where: { status: { in: OPEN }, dueDate: { lt: now, not: null } },
  include: { owner: { select: { name: true } } },
});

// Group by owner; keep the 2 with the LATEST dueDate, delete the rest.
const byOwner = new Map();
for (const t of overdue) {
  if (!byOwner.has(t.ownerId)) byOwner.set(t.ownerId, []);
  byOwner.get(t.ownerId).push(t);
}
const toDelete = [];
for (const [, tasks] of byOwner) {
  tasks.sort((a, b) => b.dueDate.getTime() - a.dueDate.getTime()); // newest dueDate first
  toDelete.push(...tasks.slice(2)); // keep first 2, delete rest
}
const ids = toDelete.map((t) => t.id);

console.log(`Total overdue: ${overdue.length} | owners: ${byOwner.size} | to delete: ${ids.length} | to keep: ${overdue.length - ids.length}`);
if (ids.length === 0) { console.log('Nothing to delete.'); await prisma.$disconnect(); process.exit(0); }

// Snapshot dependent rows that will be deleted (reminder logs) or nulled (audit/pending).
const reminderLogs = (await pool.query(`SELECT * FROM "WhatsappReminderLog" WHERE "taskId" = ANY($1)`, [ids])).rows;
const auditNulled = (await pool.query(`SELECT id, "targetTaskId" FROM "WhatsappAuditLog" WHERE "targetTaskId" = ANY($1)`, [ids])).rows;
const pendingNulled = (await pool.query(`SELECT id, "targetTaskId" FROM "WhatsappPendingAction" WHERE "targetTaskId" = ANY($1)`, [ids])).rows;

// Full backup (BigInt-safe).
const stamp = now.toISOString().replace(/[:.]/g, '-');
const backupPath = `_overdue-deleted-backup-${stamp}.json`;
writeFileSync(
  backupPath,
  JSON.stringify(
    { deletedTasks: toDelete, deletedReminderLogs: reminderLogs, nulledAuditLogs: auditNulled, nulledPendingActions: pendingNulled },
    (_k, v) => (typeof v === 'bigint' ? v.toString() : v),
    2,
  ),
);
console.log(`Backup written: ${backupPath}`);
console.log(`  reminderLogs to delete: ${reminderLogs.length} | auditLogs to null: ${auditNulled.length} | pendingActions to null: ${pendingNulled.length} | taskAttachments: cascade`);

if (!APPLY) { console.log('\nDRY RUN — no changes. Re-run with --apply.'); await prisma.$disconnect(); process.exit(0); }

// Atomic: null nullable refs, delete required reminder logs, then delete tasks (TaskAttachment cascades).
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query(`UPDATE "WhatsappAuditLog"      SET "targetTaskId" = NULL WHERE "targetTaskId" = ANY($1)`, [ids]);
  await client.query(`UPDATE "WhatsappPendingAction" SET "targetTaskId" = NULL WHERE "targetTaskId" = ANY($1)`, [ids]);
  await client.query(`DELETE FROM "WhatsappReminderLog" WHERE "taskId" = ANY($1)`, [ids]);
  const del = await client.query(`DELETE FROM "Task" WHERE id = ANY($1)`, [ids]);
  await client.query('COMMIT');
  console.log(`\nDeleted ${del.rowCount} tasks.`);
} catch (e) {
  await client.query('ROLLBACK');
  console.error('ROLLED BACK — no changes committed.');
  throw e;
} finally {
  client.release();
}

const remaining = await prisma.task.count({ where: { status: { in: OPEN }, dueDate: { lt: new Date(), not: null } } });
console.log(`Overdue tasks remaining: ${remaining}`);

await prisma.$disconnect();
await pool.end();
