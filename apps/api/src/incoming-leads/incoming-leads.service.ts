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
    // ניקוי חד-פעמי (אידמפוטנטי): לידים שטרם נתפסו לא מחזיקים יותר משימה — המשימה נוצרת
    // רק בתפיסה. מוחק משימות "ליד חדש נכנס" של לידים NEW ישנים ומאפס להם את taskId.
    void this.cleanupUnclaimedLeadTasks().catch((e) =>
      this.logger.warn(`cleanup unclaimed lead tasks failed: ${e?.message || e}`),
    );
    // Polling פנימי (בלי תלות ב-@nestjs/schedule): כל דקה סורקים תיבות דואר מחוברות.
    if (process.env.LEAD_POLLING_DISABLED === '1') return;
    setInterval(() => {
      void this.pollAll().catch((e) => this.logger.error(`poll error: ${e?.message || e}`));
    }, POLL_INTERVAL_MS);
    this.logger.log('Incoming-lead mailbox polling started (every 60s)');
  }

  /** מיגרציה רכה: מוחק משימות של לידים שעדיין NEW (לא נתפסו) ומנתק אותן מהליד. */
  private async cleanupUnclaimedLeadTasks(): Promise<void> {
    const stale = await this.prisma.incomingLead.findMany({
      where: { status: 'NEW', taskId: { not: null } },
      select: { id: true, taskId: true },
    });
    for (const l of stale) {
      if (l.taskId) await this.prisma.task.delete({ where: { id: l.taskId } }).catch(() => undefined);
      await this.prisma.incomingLead.update({ where: { id: l.id }, data: { taskId: null } }).catch(() => undefined);
    }
    if (stale.length) this.logger.log(`Detached ${stale.length} unclaimed incoming leads from their tasks`);
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

  /** נרמול טקסט להשוואת "אותו ליד" (גיבוי כשאין internetMessageId זהה). */
  private normalizeForMatch(s?: string | null): string {
    return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  /**
   * יוצר IncomingLead + Task עבור הודעה אחת — עם *איחוד* של אותו ליד שהגיע לכמה תיבות.
   * dedup בשתי שכבות:
   *   1. messageId (פר-תיבה) — מונע יצירה כפולה לאותו משתמש (כמו קודם).
   *   2. אותו ליד בין עובדים שונים — לפי internetMessageId (זהה בכל התיבות), ובגיבוי
   *      לפי אותו גוף+שולח שהתקבל ב-10 הדקות האחרונות (למקרה שהמערכת הישנה שולחת עם
   *      מזהים שונים). אם כבר קיים ליד תואם — לא יוצרים עותק חדש כלל (ליד אחד משותף).
   */
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

    // ── איחוד "ליד אחד משותף": אם אותו מייל כבר נקלט (לאותו עובד או לאחר) — לא יוצרים עותק. ──
    if (await this.duplicateOfExistingLead(m)) {
      this.logger.log(`Skipping duplicate lead "${m.subject}" (already ingested for another mailbox)`);
      return;
    }

    // ליד נכנס *לא* יוצר משימה — הוא ממתין ב"לידים נכנסים" (פופ-אפ + רשימה) עד שעובד
    // לוחץ "התחל טיפול"/"העבר". המשימה נוצרת רק בתפיסה, ישירות על שם התופס.
    await this.prisma.incomingLead.create({
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
    this.logger.log(`New incoming lead "${m.subject}" (mailbox owner ${ownerId}) — waiting to be claimed`);
  }

  /** יוצר את משימת התהליך לליד ברגע התפיסה — על שם התופס בלבד. */
  private async createTaskForClaimedLead(
    lead: { id: string; body: string | null },
    ownerId: string,
  ): Promise<string> {
    const task = await this.prisma.task.create({
      data: {
        title: 'ליד חדש נכנס',
        description: lead.body || null,
        type: 'step1', // פתיחת פנייה
        status: 'OPEN',
        priority: 'HIGH',
        ownerId,
        currentStage: 0,
        incomingLeadId: lead.id,
      },
    });
    await this.prisma.incomingLead.update({ where: { id: lead.id }, data: { taskId: task.id } });
    return task.id;
  }

  /**
   * האם ההודעה הזו היא עותק של ליד שכבר נקלט (אותו מייל שהגיע לתיבה אחרת)?
   * ראשי: לפי internetMessageId (זהה בכל תיבות הנמענים). גיבוי: אותו גוף+שולח מנורמל
   * שהתקבל ב-10 הדקות האחרונות (למקרה שהמערכת הישנה שולחת עותקים עם מזהים שונים).
   * לא כולל לידים שכבר נדחו (DISMISSED) — כדי שדחייה לא תחסום ליד חדש אמיתי בעתיד.
   */
  private async duplicateOfExistingLead(m: {
    internetMessageId: string;
    subject: string;
    bodyText: string;
    fromEmail: string;
    receivedDateTime: string;
  }): Promise<boolean> {
    // 1) לפי internetMessageId — המפתח האמין (זהה בכל התיבות שקיבלו את אותו מייל).
    if (m.internetMessageId) {
      const byImi = await this.prisma.incomingLead.findFirst({
        where: { internetMessageId: m.internetMessageId, status: { not: 'DISMISSED' } },
        select: { id: true },
      });
      if (byImi) return true;
    }

    // 2) גיבוי: אותו גוף+שולח שהתקבל ב-10 הדקות האחרונות (חלון קצר → מזעור false-positive).
    const body = this.normalizeForMatch(m.bodyText);
    const from = this.normalizeForMatch(m.fromEmail);
    if (body && from) {
      const recvAt = m.receivedDateTime ? new Date(m.receivedDateTime) : new Date();
      const windowStart = new Date(recvAt.getTime() - 10 * 60_000);
      const windowEnd = new Date(recvAt.getTime() + 10 * 60_000);
      const candidates = await this.prisma.incomingLead.findMany({
        where: {
          fromEmail: m.fromEmail,
          status: { not: 'DISMISSED' },
          receivedAt: { gte: windowStart, lte: windowEnd },
        },
        select: { body: true },
      });
      if (candidates.some((c) => this.normalizeForMatch(c.body) === body)) return true;
    }

    return false;
  }

  /**
   * לידים להצגה למשתמש: לידים חדשים (NEW) משותפים שכל אחד יכול לתפוס — לכל אנשי המכירות
   * והמנהלים, בלי קשר לבעלים (מודל "ליד אחד משותף, ראשון תופס"). בנוסף, הלידים שכבר
   * בטיפול (ACTIVE) שהמשתמש הזה הבעלים שלהם. כך כל אנשי המכירות רואים ליד נכנס עד שנתפס,
   * ולאחר התפיסה הוא נשאר רק אצל התופס.
   */
  listForOwner(ownerId: string) {
    return this.prisma.incomingLead.findMany({
      where: {
        OR: [
          { status: 'NEW' }, // ליד משותף שלא נתפס — כל אחד רואה
          { ownerId, status: 'ACTIVE' }, // הליד שאני מטפל בו
        ],
      },
      orderBy: { receivedAt: 'desc' },
    });
  }

  /**
   * לידים חדשים להצגה כהתראה צידית (פופ-אפ) — לכל המשתמשים (מכירות + מנהלים):
   * כל ליד NEW שעדיין לא נתפס מ-24 השעות האחרונות. מודל "ליד משותף": כולם מקבלים התראה
   * וראשון שלוחץ "התחל טיפול" תופס. ה-dedup (אותו מייל = פופ-אפ אחד) והסגירה נעשים בצד הלקוח.
   */
  async pending(user: { id?: string; role?: string }) {
    // מגבילים ל-24 השעות האחרונות כדי שלא יוצף בלידים ישנים שלא נתפסו בכל רענון.
    // במודל החדש ליד NEW לא מחזיק משימה כלל (היא נוצרת רק בתפיסה) — אין צורך בסינון "יתומים".
    const since = new Date(Date.now() - 24 * 60 * 60_000);
    const where = { status: 'NEW' as const, receivedAt: { gte: since } };
    return this.prisma.incomingLead.findMany({ where, orderBy: { receivedAt: 'desc' } });
  }

  /** מסמן לידים כ"הוצגה עליהם התראה" כדי לא להקפיץ שוב. */
  async markNotified(ids: string[], ownerId: string) {
    if (!ids?.length) return { count: 0 };
    return this.prisma.incomingLead.updateMany({
      where: { id: { in: ids }, ownerId },
      data: { notifiedAt: new Date() },
    });
  }

  /**
   * "התחל טיפול" — התופס (actor) לוקח בעלות על הליד המשותף: הליד + המשימה עוברים אליו
   * ומסומנים ACTIVE (הטופס נעלם אצל כולם, מוצגים פרטי הליד רק אצל התופס).
   *
   * תפיסה אטומית ובטוחה ל-race דרך updateMany מותנה ב-status:'NEW': רק *הראשון* מצליח לשנות
   * את השורה (count=1); כל שאר המנסים מקבלים count=0 → 403. זה עובד גם כשיש שורה אחת משותפת
   * (המודל החדש) וגם כשנשארו אחים ישנים (המנצח מנקה אותם ב-claimGroup אחרי התפיסה).
   */
  async start(id: string, actor: { id?: string }) {
    const lead = await this.assertOwner(id, actor);
    if (lead.status === 'ACTIVE') throw new ForbiddenException('הליד כבר נתפס על ידי עובד אחר');
    if (lead.status === 'DISMISSED') throw new ForbiddenException('הליד כבר נתפס על ידי עובד אחר');
    const claimerId = actor?.id || lead.ownerId;

    // תפיסה אטומית: רק אם השורה עדיין NEW. count=0 → מישהו הקדים אותי.
    const claimed = await this.prisma.incomingLead.updateMany({
      where: { id: lead.id, status: 'NEW' },
      data: { ownerId: claimerId, status: 'ACTIVE', notifiedAt: lead.notifiedAt ?? new Date() },
    });
    if (claimed.count === 0) throw new ForbiddenException('הליד כבר נתפס על ידי עובד אחר');

    // המשימה נוצרת רק עכשיו — ישירות על שם התופס. (לידים ישנים שעוד נושאים משימה
    // מתקופת המודל הקודם: מעבירים את הבעלות במקום ליצור כפולה.)
    if (lead.taskId) {
      await this.prisma.task.update({ where: { id: lead.taskId }, data: { ownerId: claimerId } }).catch(() => {});
    } else {
      await this.createTaskForClaimedLead(lead, claimerId);
    }
    // ניקוי אחים ישנים (מנתונים שקדמו לאיחוד-בכניסה) — best-effort, לא חוסם.
    await this.dismissSiblings(lead).catch(() => undefined);
    return this.prisma.incomingLead.findUnique({ where: { id: lead.id } });
  }

  /** "העבר ל" — תפיסה אטומית (כמו start) ואז שיוך הליד+המשימה לעובד היעד. */
  async transfer(id: string, toUserId: string, actor: { id?: string }) {
    const lead = await this.assertOwner(id, actor);
    if (lead.status === 'ACTIVE') throw new ForbiddenException('הליד כבר נתפס על ידי עובד אחר');
    if (lead.status === 'DISMISSED') throw new ForbiddenException('הליד כבר נתפס על ידי עובד אחר');
    if (!toUserId) throw new ForbiddenException('חסר עובד יעד');

    // תפיסה אטומית מותנית ב-NEW — כמו ב-start; המנצח הוא זה שהעביר.
    const claimed = await this.prisma.incomingLead.updateMany({
      where: { id: lead.id, status: 'NEW' },
      data: { ownerId: toUserId, transferredToId: toUserId, status: 'ACTIVE', notifiedAt: null },
    });
    if (claimed.count === 0) throw new ForbiddenException('הליד כבר נתפס על ידי עובד אחר');

    // המשימה נוצרת רק עכשיו — ישירות על שם עובד היעד.
    if (lead.taskId) {
      await this.prisma.task.update({ where: { id: lead.taskId }, data: { ownerId: toUserId } }).catch(() => {});
    } else {
      await this.createTaskForClaimedLead(lead, toUserId);
    }
    await this.dismissSiblings(lead).catch(() => undefined);
    return this.prisma.incomingLead.findUnique({ where: { id: lead.id } });
  }

  /**
   * ניקוי אחים ישנים: אם בנתונים שקדמו לאיחוד-בכניסה נותרו עוד עותקים NEW עם אותו
   * internetMessageId (השורות של שאר העובדים) — מסמן אותם DISMISSED ומוחק את המשימות שלהם,
   * כדי שהליד ייעלם אצל כולם אחרי שנתפס. best-effort; התפיסה עצמה כבר אטומית ב-start/transfer.
   * במודל החדש (שורה אחת משותפת) אין אחים והפונקציה היא no-op.
   */
  private async dismissSiblings(lead: { id: string; internetMessageId: string | null }) {
    if (!lead.internetMessageId) return;
    const siblings = await this.prisma.incomingLead.findMany({
      where: { internetMessageId: lead.internetMessageId, id: { not: lead.id }, status: 'NEW' },
      select: { id: true, taskId: true },
    });
    for (const s of siblings) {
      if (s.taskId) await this.prisma.task.delete({ where: { id: s.taskId } }).catch(() => undefined);
      await this.prisma.incomingLead.update({ where: { id: s.id }, data: { status: 'DISMISSED' } }).catch(() => undefined);
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
