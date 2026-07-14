/**
 * ניקוי חד-פעמי: איחוד כפילויות של לידים נכנסים שכבר קיימים ב-DB.
 * אותו מייל-ליד שהגיע לכמה תיבות נוצר בעבר כמה פעמים (עותק לכל עובד). הסקריפט משאיר
 * עותק אחד לכל internetMessageId (הכי מוקדם), ומסמן את השאר DISMISSED + מוחק את המשימות שלהם.
 *
 * בטיחות:
 *   - מטפל רק בקבוצות שכולן עדיין NEW (אף אחד לא תפס). אם באחת מהן כבר יש ACTIVE — מדלגים
 *     (התפיסה כבר טיפלה באחים; לא נוגעים).
 *   - ברירת מחדל: DRY-RUN (רק מדפיס). כדי לבצע בפועל, הוסף --apply.
 *
 * הרצה (session pooler): railway run bash -c 'export DATABASE_URL="${DATABASE_URL/:6543/:5432}"; node scripts/dedup-incoming-leads.cjs [--apply]'
 */
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const APPLY = process.argv.includes('--apply');
const adapter = new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL }));
const prisma = new PrismaClient({ adapter });

(async () => {
  console.log(`\n=== dedup-incoming-leads (${APPLY ? 'APPLY' : 'DRY-RUN'}) ===\n`);

  // כל הלידים שיש להם internetMessageId — מקובצים לפיו.
  const leads = await prisma.incomingLead.findMany({
    where: { internetMessageId: { not: null } },
    select: { id: true, internetMessageId: true, status: true, taskId: true, receivedAt: true, ownerId: true },
    orderBy: { receivedAt: 'asc' },
  });

  const groups = new Map();
  for (const l of leads) {
    if (!groups.has(l.internetMessageId)) groups.set(l.internetMessageId, []);
    groups.get(l.internetMessageId).push(l);
  }

  let groupsToFix = 0, rowsDismissed = 0, tasksDeleted = 0, groupsSkipped = 0;

  for (const [imi, arr] of groups) {
    if (arr.length < 2) continue; // אין כפילות

    const hasActive = arr.some((l) => l.status === 'ACTIVE');
    if (hasActive) { groupsSkipped++; continue; } // כבר נתפס — התפיסה טיפלה; לא נוגעים

    // מטפלים רק בעותקים NEW; משאירים את הכי מוקדם, מבטלים את השאר.
    const news = arr.filter((l) => l.status === 'NEW').sort((a, b) => +new Date(a.receivedAt) - +new Date(b.receivedAt));
    if (news.length < 2) continue;

    groupsToFix++;
    const keep = news[0];
    const drop = news.slice(1);
    console.log(`group ${imi.slice(0, 24)}…: keep ${keep.id.slice(0,8)} (owner ${keep.ownerId.slice(0,8)}), drop ${drop.length}`);

    for (const d of drop) {
      rowsDismissed++;
      if (d.taskId) tasksDeleted++;
      if (APPLY) {
        if (d.taskId) await prisma.task.delete({ where: { id: d.taskId } }).catch(() => undefined);
        await prisma.incomingLead.update({ where: { id: d.id }, data: { status: 'DISMISSED' } }).catch((e) => {
          console.warn(`  ! failed to dismiss ${d.id}: ${e?.message || e}`);
        });
      }
    }
  }

  console.log(`\n--- summary ---`);
  console.log(`duplicate NEW groups collapsed: ${groupsToFix}`);
  console.log(`rows dismissed:                 ${rowsDismissed}`);
  console.log(`tasks deleted:                  ${tasksDeleted}`);
  console.log(`groups skipped (already claimed): ${groupsSkipped}`);
  console.log(APPLY ? '\n✓ applied.' : '\n(dry-run — add --apply to execute)');

  await prisma.$disconnect();
})().catch((e) => { console.error(e?.message || e); process.exit(1); });
