import { ForbiddenException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GraphMailService } from '../microsoft/graph-mail.service';
import { AiMailService } from '../ai-mail/ai-mail.service';

const POLL_INTERVAL_MS = 60_000; // כל דקה
const LOOKBACK_MS = 15 * 60_000; // חלון בדיקה: 15 דקות אחורה (overlap; dedup לפי messageId)

/**
 * שולחים שאין להם פורמט תוויות קבוע — המייל הוא נושא + גוף טקסט-חופשי. עבורם מחלצים את
 * פרטי הליד (שם/טלפון/מייל/שירות/מהות) ב-GPT בזמן הקליטה ומזריקים בראש הגוף בלוק תוויות
 * שאותו ה-frontend (parseLeadBody) כבר יודע לקרוא — כך שדות השם/הטלפון מתמלאים אוטומטית.
 */
const FREE_TEXT_LEAD_SENDERS = ['office@inspect-in.co.il'];

@Injectable()
export class IncomingLeadsService implements OnModuleInit {
  private readonly logger = new Logger(IncomingLeadsService.name);
  private polling = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly graphMail: GraphMailService,
    private readonly aiMail: AiMailService,
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

    // עבור שולחים בטקסט-חופשי (למשל office@inspect-in.co.il) — מחלצים את פרטי הליד ב-GPT
    // ומזריקים בראש הגוף בלוק תוויות שה-frontend כבר יודע לקרוא (parseLeadBody), כדי ששדות
    // השם/הטלפון/השירות יתמלאו אוטומטית. best-effort: בכישלון הגוף המקורי נשמר כמות שהוא.
    const body = await this.enrichFreeTextLeadBody(m);

    // ליד נכנס *לא* יוצר משימה — הוא ממתין ב"לידים נכנסים" (פופ-אפ + רשימה) עד שעובד
    // לוחץ "התחל טיפול"/"העבר". המשימה נוצרת רק בתפיסה, ישירות על שם התופס.
    try {
      await this.prisma.incomingLead.create({
        data: {
          messageId: m.id,
          internetMessageId: m.internetMessageId || null,
          subject: m.subject,
          body: body || null,
          fromName: m.fromName || null,
          fromEmail: m.fromEmail || null,
          receivedAt: m.receivedDateTime ? new Date(m.receivedDateTime) : new Date(),
          ownerId,
          status: 'NEW',
        },
      });
    } catch (e: any) {
      // P2002 = הפרת ייחודיות (messageId או internetMessageId). זו בדיוק המשמעות של
      // "אותו מייל כבר נקלט" — duplicateOfExistingLead הוא check-then-act ולכן לא מספיק
      // לבדו כששני סבבי-סריקה/שתי תיבות מגיעים לאותה הודעה במקביל. האינדקס הוא הבלם
      // האמיתי; כאן רק בולעים אותו בשקט במקום להפיל את הסבב.
      if (e?.code === 'P2002') {
        this.logger.log(`Skipping duplicate lead "${m.subject}" (unique constraint — already ingested)`);
        return;
      }
      throw e;
    }
    this.logger.log(`New incoming lead "${m.subject}" (mailbox owner ${ownerId}) — waiting to be claimed`);
  }

  /**
   * לשולחים בטקסט-חופשי (FREE_TEXT_LEAD_SENDERS): מריץ חילוץ GPT על הנושא+גוף ומחזיר גוף
   * מועשר — בלוק תוויות ("שם מלא: ...", "טלפון נייד: ...", "סוג השירות: ...", "תוכן הפנייה: ...")
   * שאותו parseLeadBody ב-frontend קורא, ואחריו הגוף המקורי במלואו. לשולחים אחרים (טפסים עם
   * תוויות מובנות) מחזיר את הגוף כמו שהוא. best-effort: בכישלון החילוץ מוחזר הגוף המקורי.
   */
  private async enrichFreeTextLeadBody(m: {
    subject: string;
    bodyText: string;
    fromEmail: string;
  }): Promise<string> {
    const original = m.bodyText || '';
    const from = String(m.fromEmail || '').trim().toLowerCase();
    if (!FREE_TEXT_LEAD_SENDERS.includes(from)) return original;

    let fields: { fullName: string; phone: string; email: string; serviceType: string; essence: string };
    try {
      fields = await this.aiMail.extractLeadFields(m.subject, original);
    } catch (e: any) {
      this.logger.warn(`extractLeadFields failed for "${m.subject}": ${e?.message || e}`);
      return original;
    }

    // בונים בלוק תוויות בדיוק בשמות ש-parseLeadBody מזהה (שם מלא / טלפון נייד / כתובת אימייל /
    // סוג השירות / תוכן הפנייה). אם לא חולץ כלום — לא מוסיפים בלוק, מחזירים גוף מקורי.
    const labeled: string[] = [];
    if (fields.fullName) labeled.push(`שם מלא: ${fields.fullName}`);
    if (fields.phone) labeled.push(`טלפון נייד: ${fields.phone}`);
    if (fields.email) labeled.push(`כתובת אימייל: ${fields.email}`);
    if (fields.serviceType) labeled.push(`סוג השירות: ${fields.serviceType}`);
    if (fields.essence) labeled.push(`תוכן הפנייה: ${fields.essence}`);
    if (!labeled.length) return original;

    return `${labeled.join('\n')}\n\n--- תוכן המייל המקורי ---\n${original}`.trim();
  }

  /**
   * יוצר את משימת התהליך לליד ברגע התפיסה — על שם התופס בלבד.
   * מקבל client (tx) כדי שהיצירה תרוץ *באותה טרנזקציה* של החלפת הסטטוס: אם היצירה נכשלת,
   * החלפת ה-NEW→ACTIVE מתגלגלת אחורה והליד חוזר להיות זמין לתפיסה (לא נשאר תקוע בלי משימה).
   */
  private async createTaskForClaimedLead(
    tx: Prisma.TransactionClient,
    lead: { id: string; body: string | null },
    ownerId: string,
  ): Promise<string> {
    const task = await tx.task.create({
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
    await tx.incomingLead.update({ where: { id: lead.id }, data: { taskId: task.id } });
    return task.id;
  }

  /**
   * מבטיח שלליד תהיה משימה *אחת* על שם הבעלים החדש, בתפיסה/העברה.
   *
   * חשוב: החיפוש נעשה לפי Task.incomingLeadId ולא לפי lead.taskId שנקרא לפני הטרנזקציה.
   * ה-snapshot הזה יכול להיות מיושן (נקרא ב-assertOwner מחוץ ל-tx), וכשהוא היה null בעוד
   * שבפועל כבר קיימת משימה לליד — נוצרה משימה שנייה. כך ליד 20d5b17e קיבל שלוש משימות.
   * קריאה לפי incomingLeadId *בתוך* הטרנזקציה היא מקור האמת היחיד, ומגובה באינדקס
   * הייחודי החלקי Task_incomingLeadId_key (מיגרציה 20260802140000).
   *
   *  - קיימת כבר משימה לליד → מעדכן לה את הבעלים (העברה) ומיישר את lead.taskId.
   *  - אין משימה (או שהישנה נמחקה) → יוצר חדשה ומקשר אותה לליד.
   */
  private async assignOrCreateTask(
    tx: Prisma.TransactionClient,
    lead: { id: string; body: string | null; taskId: string | null },
    ownerId: string,
  ): Promise<void> {
    const existing =
      (await tx.task.findFirst({
        where: { incomingLeadId: lead.id },
        select: { id: true, ownerId: true },
        orderBy: { createdAt: 'asc' },
      })) ??
      // גיבוי למשימות ישנות מלפני שדה incomingLeadId — מקושרות רק דרך lead.taskId.
      (lead.taskId
        ? await tx.task.findUnique({ where: { id: lead.taskId }, select: { id: true, ownerId: true } })
        : null);

    if (existing) {
      // החלפת בעלים = העברה: transferredAt מרים את המשימה לראש הרשימה של המקבל.
      await tx.task.update({
        where: { id: existing.id },
        data: existing.ownerId === ownerId ? { ownerId } : { ownerId, transferredAt: new Date() },
      });
      if (lead.taskId !== existing.id) {
        await tx.incomingLead.update({ where: { id: lead.id }, data: { taskId: existing.id } });
      }
      return;
    }

    await this.createTaskForClaimedLead(tx, lead, ownerId);
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

    // תפיסה + יצירת משימה *באותה טרנזקציה*: אם יצירת המשימה נכשלת, החלפת ה-NEW→ACTIVE
    // מתגלגלת אחורה והליד חוזר להיות זמין לתפיסה — במקום להישאר ACTIVE-תקוע בלי משימה.
    try {
      await this.prisma.$transaction(async (tx) => {
        // תפיסה אטומית: רק אם השורה עדיין NEW. count=0 → מישהו הקדים אותי (זורק → rollback).
        const claimed = await tx.incomingLead.updateMany({
          where: { id: lead.id, status: 'NEW' },
          data: { ownerId: claimerId, status: 'ACTIVE', notifiedAt: lead.notifiedAt ?? new Date() },
        });
        if (claimed.count === 0) throw new ForbiddenException('הליד כבר נתפס על ידי עובד אחר');

        // המשימה נוצרת/משויכת עכשיו — ישירות על שם התופס. (לידים ישנים שעוד נושאים משימה
        // מתקופת המודל הקודם: מעבירים את הבעלות; אם המשימה הישנה נמחקה — יוצרים חדשה במקום להיכשל.)
        await this.assignOrCreateTask(tx, lead, claimerId);
      });
    } catch (e) {
      if (e instanceof ForbiddenException) throw e;
      this.logger.error(`start(${lead.id}) transaction failed — lead stays NEW: ${(e as any)?.message || e}`);
      throw new ForbiddenException('תפיסת הליד נכשלה. נסה שוב.');
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

    // תפיסה + יצירת משימה באותה טרנזקציה (כמו start) — כשל ביצירת המשימה מגלגל אחורה את
    // ההעברה והליד נשאר NEW/זמין, במקום להישאר ACTIVE-תקוע בלי משימה אצל עובד היעד.
    try {
      await this.prisma.$transaction(async (tx) => {
        // תפיסה אטומית מותנית ב-NEW — כמו ב-start; המנצח הוא זה שהעביר. count=0 → rollback.
        const claimed = await tx.incomingLead.updateMany({
          where: { id: lead.id, status: 'NEW' },
          data: { ownerId: toUserId, transferredToId: toUserId, status: 'ACTIVE', notifiedAt: null },
        });
        if (claimed.count === 0) throw new ForbiddenException('הליד כבר נתפס על ידי עובד אחר');

        // המשימה נוצרת/משויכת עכשיו — ישירות על שם עובד היעד (יוצר חדשה אם המשימה הישנה נמחקה).
        await this.assignOrCreateTask(tx, lead, toUserId);
      });
    } catch (e) {
      if (e instanceof ForbiddenException) throw e;
      this.logger.error(`transfer(${lead.id}) transaction failed — lead stays NEW: ${(e as any)?.message || e}`);
      throw new ForbiddenException('העברת הליד נכשלה. נסה שוב.');
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


  /**
   * דחיית ליד (לא רלוונטי).
   * - ליד NEW הוא *משותף* — כל עובד רשאי לדחות אותו (זה "לא רלוונטי" לכולם). דחייה אטומית
   *   מותנית ב-NEW כדי לא לדרוס תפיסה שקרתה באותו רגע (race → 403).
   * - ליד ACTIVE כבר נתפס ושייך לעובד ספציפי — רק *הבעלים* או מנהל/אדמין רשאי לדחות אותו,
   *   אחרת כל עובד היה יכול "להרוג" ליד שעמית עובד עליו בפועל.
   */
  async dismiss(id: string, actor: { id?: string; role?: string }) {
    const lead = await this.assertOwner(id, actor);
    const role = (actor?.role || '').toUpperCase();
    const isManager = role === 'ADMIN' || role === 'MANAGER';

    if (lead.status === 'DISMISSED') return lead; // כבר נדחה — idempotent

    if (lead.status === 'ACTIVE') {
      // ליד בטיפול — רק הבעלים או מנהל רשאי לדחות.
      if (!isManager && actor?.id && lead.ownerId !== actor.id) {
        throw new ForbiddenException('הליד בטיפול עובד אחר — רק הבעלים או מנהל יכולים לדחות אותו');
      }
      return this.prisma.incomingLead.update({ where: { id: lead.id }, data: { status: 'DISMISSED' } });
    }

    // ליד NEW משותף — דחייה אטומית מותנית ב-NEW (לא דורסת תפיסה מקבילה).
    const dismissed = await this.prisma.incomingLead.updateMany({
      where: { id: lead.id, status: 'NEW' },
      data: { status: 'DISMISSED' },
    });
    if (dismissed.count === 0) {
      // מישהו תפס את הליד בין הקריאה לעדכון — לא דורסים ACTIVE של אחר.
      throw new ForbiddenException('הליד כבר נתפס על ידי עובד אחר');
    }
    return this.prisma.incomingLead.findUnique({ where: { id: lead.id } });
  }

  private async assertOwner(id: string, actor: { id?: string }) {
    const lead = await this.prisma.incomingLead.findUnique({ where: { id } });
    if (!lead) throw new ForbiddenException('ליד לא נמצא');
    return lead;
  }
}
