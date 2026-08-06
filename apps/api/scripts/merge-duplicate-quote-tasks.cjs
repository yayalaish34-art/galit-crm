#!/usr/bin/env node
/**
 * מיזוג משימות כפולות שנוצרו על אותו לקוח.
 *
 * הרקע: "מעקב" ממסך הצעת מחיר עצמאי עשה POST /tasks במקום להזיז את המשימה הקיימת,
 * ולכן לקוח שכבר היה לו "פנייה - X" פתוח קיבל משימה מקבילה. בייצור נמצאו 15 קבוצות
 * כפולות (יורם גבאי — 8 עותקים, cardo systems — 4, וזוגות בהפרש 0 דקות).
 * הבאג עצמו תוקן ב-promoteOrCreateFollowupTask + findPromotableForCustomer; הסקריפט
 * הזה מנקה את מה שכבר הצטבר.
 *
 * מה הוא עושה לכל קבוצה (אותו לקוח + אותה כותרת, שתי משימות פעילות ומעלה):
 *   • בוחר משימה ראשית — זו עם הכי הרבה הצעות מקושרות; שוויון → הוותיקה ביותר.
 *   • מעביר אליה מהמשימות הכפולות: הצעות מחיר (Quote.linkedEntityId), קבצים מצורפים,
 *     בקשות אישור, ונתוני שדה (רק אם לראשית אין — taskId שם הוא unique).
 *   • מאחד את תאריך היעד לקרוב ביותר ואת השלב למתקדם ביותר, כדי לא לאבד התקדמות.
 *   • מסמן את הכפולות CANCELLED עם הערה — ולא מוחק, כדי שהפעולה תהיה הפיכה.
 *
 * הרצה:
 *   node scripts/merge-duplicate-quote-tasks.cjs            # יבש — רק מדפיס תוכנית
 *   node scripts/merge-duplicate-quote-tasks.cjs --apply    # מבצע בפועל
 *
 * ריצה יבשה אינה כותבת דבר. ריצה עם --apply שומרת קודם גיבוי JSON של כל המשימות
 * המושפעות לצד הסקריפט, בדומה ל-_repair-empty-quotes.mjs.
 */
require('dotenv/config');
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const APPLY = process.argv.includes('--apply');

// Prisma 7 דורש adapter מפורש — אותה בנייה כמו PrismaService.
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing');
const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL })) });

/** כותרות משתנות בריווח בין יוצרים שונים — משווים מנורמל. */
const normTitle = (s) => String(s || '').trim().replace(/\s+/g, ' ');
const ACTIVE = ['OPEN', 'IN_PROGRESS'];

async function main() {
  const tasks = await prisma.task.findMany({
    where: { status: { in: ACTIVE }, customerId: { not: null } },
    select: {
      id: true, title: true, customerId: true, ownerId: true, type: true,
      currentStage: true, dueDate: true, createdAt: true, description: true,
      processNotes: true,
      customer: { select: { name: true } },
      _count: { select: { linkedQuotes: true, attachments: true } },
      taskField: { select: { id: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const groups = new Map();
  for (const t of tasks) {
    const key = `${t.customerId}::${normTitle(t.title)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  const dupes = [...groups.values()].filter((g) => g.length > 1);

  if (!dupes.length) {
    console.log('לא נמצאו משימות כפולות פעילות. אין מה למזג.');
    return;
  }

  console.log(`נמצאו ${dupes.length} קבוצות כפולות (${dupes.reduce((n, g) => n + g.length - 1, 0)} משימות למיזוג)\n`);

  const plan = [];
  for (const group of dupes) {
    // ראשית = הכי הרבה הצעות מקושרות; שוויון → הוותיקה (היא ה"פנייה" המקורית).
    const keeper = [...group].sort(
      (a, b) => b._count.linkedQuotes - a._count.linkedQuotes || a.createdAt - b.createdAt,
    )[0];
    const losers = group.filter((t) => t.id !== keeper.id);

    // הראשית שומרת על מצבה — ממלאים ממנה רק מה שחסר. לקחת "הכי מתקדם" מהקבוצה נשמע
    // נכון אבל מסוכן: currentStage 99 הוא סימן לשלב "הצעת מחיר" ולא ערך גבוה בסולם,
    // ולכן max היה מזיז את cardo systems מהצעת מחיר אחורה לביצוע. אובדן התקדמות שנעשתה
    // בטעות על העותק פחות מזיק מהעפת המשימה האמיתית לשלב הלא נכון.
    const otherDues = group.filter((t) => t.id !== keeper.id).map((t) => t.dueDate).filter(Boolean).sort((a, b) => a - b);
    const otherStages = group.filter((t) => t.id !== keeper.id).map((t) => t.currentStage).filter((s) => s != null);
    const mergedDue = keeper.dueDate ?? otherDues[0] ?? null;
    const mergedStage = keeper.currentStage ?? (otherStages.length ? Math.max(...otherStages) : null);

    plan.push({ keeper, losers, mergedDue, mergedStage });

    console.log(`▸ ${keeper.customer?.name || keeper.customerId} — "${normTitle(keeper.title)}"`);
    console.log(`   שומר: ${keeper.id}  (${keeper._count.linkedQuotes} הצעות, ${keeper._count.attachments} קבצים, נוצרה ${keeper.createdAt.toISOString().slice(0, 16)})`);
    for (const l of losers) {
      console.log(`   ממזג: ${l.id}  (${l._count.linkedQuotes} הצעות, ${l._count.attachments} קבצים, נוצרה ${l.createdAt.toISOString().slice(0, 16)})${l.description ? ` — ${l.description.slice(0, 40)}` : ''}`);
    }
    const fmtDue = (d) => (d ? d.toISOString().slice(0, 10) : '—');
    const stageChanges = mergedStage !== keeper.currentStage ? `  ⚠ שלב ${keeper.currentStage ?? '—'} → ${mergedStage ?? '—'}` : '';
    const dueChanges = String(mergedDue) !== String(keeper.dueDate) ? `  ⚠ יעד ${fmtDue(keeper.dueDate)} → ${fmtDue(mergedDue)}` : '';
    console.log(`   → הראשית אחרי המיזוג: יעד ${fmtDue(mergedDue)}, שלב ${mergedStage ?? '—'}${stageChanges}${dueChanges}\n`);
  }

  if (!APPLY) {
    console.log('── ריצה יבשה. לא שונה דבר. להרצה בפועל: --apply ──');
    return;
  }

  const backupPath = path.join(__dirname, `merge-duplicate-tasks-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(dupes, null, 2));
  console.log(`גיבוי נשמר: ${backupPath}\n`);

  let merged = 0;
  for (const { keeper, losers, mergedDue, mergedStage } of plan) {
    for (const loser of losers) {
      // כל מיזוג בטרנזקציה משלו: כישלון בקבוצה אחת לא משאיר קבוצה אחרת חצי-ממוזגת.
      await prisma.$transaction(async (tx) => {
        await tx.quote.updateMany({ where: { linkedEntityId: loser.id }, data: { linkedEntityId: keeper.id } });
        await tx.taskAttachment.updateMany({ where: { taskId: loser.id }, data: { taskId: keeper.id } });
        await tx.approvalRequest.updateMany({ where: { taskId: loser.id }, data: { taskId: keeper.id } });
        // TaskField.taskId הוא unique — מעבירים רק כשלראשית אין נתוני שדה משלה.
        if (loser.taskField && !keeper.taskField) {
          await tx.taskField.update({ where: { id: loser.taskField.id }, data: { taskId: keeper.id } });
        }
        await tx.task.update({
          where: { id: loser.id },
          data: {
            status: 'CANCELLED',
            description: `${loser.description ? `${loser.description}\n` : ''}[מוזגה אוטומטית אל ${keeper.id} — משימה כפולה]`,
          },
        });
      });
      merged++;
    }
    await prisma.task.update({
      where: { id: keeper.id },
      data: { dueDate: mergedDue, currentStage: mergedStage },
    });
  }
  console.log(`הושלם: ${merged} משימות כפולות מוזגו אל ${plan.length} משימות ראשיות.`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
