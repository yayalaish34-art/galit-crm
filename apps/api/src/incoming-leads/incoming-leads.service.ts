import { ForbiddenException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GraphMailService } from '../microsoft/graph-mail.service';

const POLL_INTERVAL_MS = 60_000; // כל דקה
const LOOKBACK_MS = 15 * 60_000; // חלון בדיקה: 15 דקות אחורה (overlap; dedup לפי messageId)

@Injectable()
export class IncomingLeadsService implements OnModuleInit {
  private readonly logger = new Logger(IncomingLeadsService.name);
  private polling = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly graphMail: GraphMailService,
  ) {}

  onModuleInit() {
    // Polling פנימי (בלי תלות ב-@nestjs/schedule): כל דקה סורקים תיבות דואר מחוברות.
    if (process.env.LEAD_POLLING_DISABLED === '1') return;
    setInterval(() => {
      void this.pollAll().catch((e) => this.logger.error(`poll error: ${e?.message || e}`));
    }, POLL_INTERVAL_MS);
    this.logger.log('Incoming-lead mailbox polling started (every 60s)');
  }

  /** סורק את כל המשתמשים המחוברים ל-Outlook ויוצר לידים חדשים. */
  async pollAll(): Promise<void> {
    if (this.polling) return; // מניעת חפיפה אם סבב קודם עדיין רץ
    this.polling = true;
    try {
      const users = await this.prisma.user.findMany({
        where: { msRefreshToken: { not: null }, status: 'ACTIVE' },
        select: { id: true },
      });
      const sinceIso = new Date(Date.now() - LOOKBACK_MS).toISOString();
      for (const u of users) {
        try {
          const msgs = await this.graphMail.listRecentLeadMessages(u.id, sinceIso);
          for (const m of msgs) {
            await this.ingest(u.id, m);
          }
        } catch (e: any) {
          this.logger.warn(`poll user ${u.id} failed: ${e?.message || e}`);
        }
      }
    } finally {
      this.polling = false;
    }
  }

  /** יוצר IncomingLead + Task עבור הודעה אחת (dedup לפי messageId). */
  private async ingest(
    ownerId: string,
    m: {
      id: string;
      internetMessageId: string;
      subject: string;
      bodyText: string;
      fromName: string;
      fromEmail: string;
      receivedDateTime: string;
    },
  ): Promise<void> {
    const existing = await this.prisma.incomingLead.findUnique({ where: { messageId: m.id } });
    if (existing) return;

    // סינון: מיילים שמכילים את הביטוי המדויק "Want More Stats?" בגוף אינם לידים אמיתיים
    // (מיילים אוטומטיים/סטטיסטיקות) — לא מכניסים אותם לבסיס הנתונים כלל.
    if ((m.bodyText || '').includes('Want More Stats?')) {
      this.logger.log(`Skipping non-lead email "${m.subject}" (contains "Want More Stats?")`);
      return;
    }

    const lead = await this.prisma.incomingLead.create({
      data: {
        messageId: m.id,
        internetMessageId: m.internetMessageId || null,
        subject: m.subject,
        body: m.bodyText || null,
        fromName: m.fromName || null,
        fromEmail: m.fromEmail || null,
        receivedAt: m.receivedDateTime ? new Date(m.receivedDateTime) : new Date(),
        ownerId,
        status: 'NEW',
      },
    });

    const task = await this.prisma.task.create({
      data: {
        title: 'ליד חדש נכנס',
        description: m.bodyText || null,
        type: 'step1', // פתיחת פנייה
        status: 'OPEN',
        priority: 'HIGH',
        ownerId,
        currentStage: 0,
        incomingLeadId: lead.id,
      },
    });

    await this.prisma.incomingLead.update({ where: { id: lead.id }, data: { taskId: task.id } });
    this.logger.log(`New incoming lead "${m.subject}" → task ${task.id} (owner ${ownerId})`);
  }

  /** לידים פעילים של המשתמש (NEW/ACTIVE) — לצורך הצגת הטופס/פרטי הליד. */
  listForOwner(ownerId: string) {
    return this.prisma.incomingLead.findMany({
      where: { ownerId, status: { in: ['NEW', 'ACTIVE'] } },
      orderBy: { receivedAt: 'desc' },
    });
  }

  /**
   * לידים חדשים להצגה כהתראה צידית (פופ-אפ).
   * - מנהל/אדמין: כל ליד שעדיין לא נתפס (status=NEW), בלי קשר לבעלים — כדי שמנהלים יקבלו
   *   התראה על כל ליד נכנס. ה-dedup לכל מנהל נעשה בצד הלקוח (סגירה ידנית) כדי לא לדרוס את
   *   ה-notifiedAt של הבעלים.
   * - עובד רגיל: רק הלידים שלו שטרם הוצגה עליהם התראה (notifiedAt=null).
   */
  async pending(user: { id?: string; role?: string }) {
    const role = (user?.role || '').toUpperCase();
    const isManager = role === 'ADMIN' || role === 'MANAGER';
    // למנהל אין "אישור" נשמר בשרת (הסגירה מקומית), לכן מגבילים ל-24 השעות האחרונות
    // כדי שלא יוצף בלידים ישנים שלא נתפסו בכל רענון. לעובד — כל הלידים שלו שטרם הוצגו.
    const since = new Date(Date.now() - 24 * 60 * 60_000);
    const where = isManager
      ? { status: 'NEW' as const, receivedAt: { gte: since } }
      : { ownerId: user?.id, status: 'NEW' as const, notifiedAt: null };
    const leads = await this.prisma.incomingLead.findMany({ where, orderBy: { receivedAt: 'desc' } });
    if (!leads.length) return leads;
    // סינון לידים "יתומים": אם המשימה המקושרת נמחקה ידנית (taskId הוא מחרוזת חופשית בלי FF),
    // הליד נשאר NEW וממשיך להקפיץ פופ-אפ ש"פתח את הליד" לא מצליח לפתוח. מחזירים רק לידים
    // עם משימה חיה — כך כל פופ-אפ ניתן לפתיחה, ולידים יתומים מפסיקים לקפוץ.
    const taskIds = leads.map((l) => l.taskId).filter((x): x is string => !!x);
    const liveTasks = taskIds.length
      ? await this.prisma.task.findMany({ where: { id: { in: taskIds } }, select: { id: true } })
      : [];
    const liveTaskIds = new Set(liveTasks.map((t) => t.id));
    return leads.filter((l) => l.taskId && liveTaskIds.has(l.taskId));
  }

  /** מסמן לידים כ"הוצגה עליהם התראה" כדי לא להקפיץ שוב. */
  async markNotified(ids: string[], ownerId: string) {
    if (!ids?.length) return { count: 0 };
    return this.prisma.incomingLead.updateMany({
      where: { id: { in: ids }, ownerId },
      data: { notifiedAt: new Date() },
    });
  }

  /** "התחל טיפול" — הליד עובר ל-ACTIVE (הטופס נעלם, מוצגים פרטי הליד). */
  async start(id: string, actor: { id?: string }) {
    const lead = await this.assertOwner(id, actor);
    if (lead.status === 'DISMISSED') throw new ForbiddenException('הליד כבר נתפס על ידי עובד אחר');
    await this.removeSiblings(lead); // תפיסת הליד — מסיר אותו מכל שאר העובדים
    return this.prisma.incomingLead.update({
      where: { id: lead.id },
      data: { status: 'ACTIVE', notifiedAt: lead.notifiedAt ?? new Date() },
    });
  }

  /** "העבר ל" — מחליף owner של הליד ושל ה-Task, מסמן ACTIVE (למקבל אין טופס). */
  async transfer(id: string, toUserId: string, actor: { id?: string }) {
    const lead = await this.assertOwner(id, actor);
    if (lead.status === 'DISMISSED') throw new ForbiddenException('הליד כבר נתפס על ידי עובד אחר');
    if (!toUserId) throw new ForbiddenException('חסר עובד יעד');
    await this.removeSiblings(lead); // תפיסת הליד — מסיר אותו מכל שאר העובדים
    const updated = await this.prisma.incomingLead.update({
      where: { id: lead.id },
      data: { ownerId: toUserId, transferredToId: toUserId, status: 'ACTIVE', notifiedAt: null },
    });
    if (lead.taskId) {
      await this.prisma.task.update({ where: { id: lead.taskId }, data: { ownerId: toUserId } }).catch(() => {});
    }
    return updated;
  }

  /**
   * "תופס" את הליד: מסיר את אותו ליד (לפי internetMessageId — אותו מייל שהגיע לכמה תיבות)
   * מכל העובדים האחרים — מוחק את המשימה שלהם ומסמן את הליד שלהם כ-DISMISSED.
   * כך ששני עובדים לא יטפלו באותו ליד.
   */
  private async removeSiblings(lead: { id: string; internetMessageId: string | null }) {
    if (!lead.internetMessageId) return;
    const siblings = await this.prisma.incomingLead.findMany({
      where: {
        internetMessageId: lead.internetMessageId,
        id: { not: lead.id },
        status: 'NEW', // רק עותקים שעדיין לא נתפסו — לא דורסים מי שכבר התחיל
      },
    });
    for (const s of siblings) {
      if (s.taskId) {
        await this.prisma.task.delete({ where: { id: s.taskId } }).catch(() => {});
      }
      await this.prisma.incomingLead
        .update({ where: { id: s.id }, data: { status: 'DISMISSED' } })
        .catch(() => {});
    }
    if (siblings.length) {
      this.logger.log(`Lead claimed — removed ${siblings.length} duplicate(s) from other employees`);
    }
  }

  /** דחיית ליד (לא רלוונטי). */
  async dismiss(id: string, actor: { id?: string }) {
    const lead = await this.assertOwner(id, actor);
    return this.prisma.incomingLead.update({ where: { id: lead.id }, data: { status: 'DISMISSED' } });
  }

  private async assertOwner(id: string, actor: { id?: string }) {
    const lead = await this.prisma.incomingLead.findUnique({ where: { id } });
    if (!lead) throw new ForbiddenException('ליד לא נמצא');
    // הבעלים, או מנהל, רשאים. (בדיקה בסיסית — owner בלבד; מנהלים עוברים דרך ה-RolesGuard ברמת הנתיב)
    if (actor?.id && lead.ownerId !== actor.id) {
      // מתירים גם למנהלים — נבדק בשכבת ה-controller (Roles). כאן רק לוג.
      this.logger.debug(`actor ${actor.id} acting on lead of ${lead.ownerId}`);
    }
    return lead;
  }
}
