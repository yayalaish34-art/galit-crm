import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QuotesService } from '../quotes/quotes.service';
import { AffiliateService } from '../affiliate/affiliate.service';
import { getPreVisitGuideline } from './pre-visit-guidelines';

/**
 * ── מניעת כפילות משימות (POST /tasks) ────────────────────────────────────────
 * כל יוצרי המשימות ב-frontend (התחל תהליך / כרטיס לקוח חדש / שיתוף משימה /
 * תזכורת דוח חוזר / מעקב הצעת מחיר) שולחים POST בלחיצה, בלי מפתח אידמפוטנטיות.
 * לחיצה כפולה, טאב שני, או ניסיון חוזר אחרי שנדמה שכלום לא קרה — ייצרו משימה
 * נוספת בכל פעם. בפועל נוצרו כך 9 עותקים של "כרטיס לקוח — אורים הנדסת חשמל"
 * תוך 3 דקות, 4 עותקים של "פנייה - cardo systems", ועוד.
 *
 * הפתרון: השרת מזהה יצירה חוזרת של אותה משימה ומחזיר את הקיימת במקום ליצור
 * חדשה. הלקוח לא מבחין בהבדל (הוא מקבל משימה תקינה ופותח אותה), אבל לא נוצר עותק.
 */
/** חלון "לחיצה כפולה" — יצירה זהה לחלוטין (כולל type) בטווח הזה = אותה יצירה. */
const DUP_EXACT_WINDOW_MS = 5 * 60_000;
/** חלון למשימות "פתיחת תהליך" — הן משנות type תוך כדי הזרימה, לכן משווים בלי type. */
const DUP_OPENER_WINDOW_MS = 24 * 60 * 60_000;
/** קידומות של משימות "פתיחת תהליך" שנוצרות בלחיצה אחת מכרטיס הלקוח / הסרגל. */
const OPENER_TITLE_PREFIXES = ['פנייה - ', 'כרטיס לקוח'];
/** קידומת משימת "תזכורת שליחת דוח חוזר" — תזכורת פתוחה אחת ללקוח, ללא הגבלת זמן. */
const REPORT_REMINDER_PREFIX = '🔁 תזכורת: שליחת דוח חוזר';

/**
 * ── שלבים שמהם מותר לקדם משימה קיימת ל"פולואפ" ──────────────────────────────
 * כפתור "מעקב" בהצעת מחיר צריך להזיז את משימת הלקוח הקיימת, לא לפתוח שנייה
 * (ראה findPromotableForCustomer). אבל רק כשהמשימה עדיין בטרום-מכירה: משימה
 * שכבר בביצוע/דוח/גבייה מייצגת עסקה שנסגרה, והצעה חדשה עליה היא מחזור מכירה
 * חדש — שם יצירת משימה נפרדת היא ההתנהגות הנכונה.
 * 0 פתיחת פנייה · 1 התאמת פתרון · 2 שיחת מכירה · 3 פולואפ · 99 הצעת מחיר.
 */
const PRESALE_STAGES = new Set([0, 1, 2, 3, 99]);
/** אותו דבר לפי type, למשימות ישנות שנוצרו לפני ש-currentStage נכתב. */
const PRESALE_TYPES = new Set([
  'general', 'step1', 'step2', 'step3', 'step4',
  'stepquote', 'quote_preparation', 'sales_followup',
]);

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly quotesService: QuotesService,
    private readonly affiliate: AffiliateService,
  ) {}

  async findAll({
    projectId,
    scope,
    user,
  }: {
    projectId?: string;
    scope?: string;
    user?: { id?: string; role?: string };
  } = {}) {
    const role = (user?.role || '').toUpperCase();
    if (!role) throw new UnauthorizedException('Missing role');

    const baseWhere: any = projectId ? { projectId } : {};
    // מנהל מערכת רואה את כל המשימות. כל שאר העובדים רואים כברירת מחדל
    // רק את המשימות שלהם, אך יכולים לבקש את כולן באמצעות scope=all.
    const restrictToOwner = role !== 'ADMIN' && (scope || '').toLowerCase() !== 'all';
    if (role !== 'ADMIN') {
      if (!user?.id) throw new UnauthorizedException('Missing user id');
      if (restrictToOwner) {
        baseWhere.ownerId = user.id;
      }
    }

    // הערה: במודל הנוכחי ליד נכנס שטרם נתפס אינו מחזיק משימה כלל (המשימה נוצרת רק
    // בתפיסה, ישירות על שם התופס) — לכן אין יותר "משימות לידים משותפות" להזריק לכולם.
    const where: any = Object.keys(baseWhere).length ? baseWhere : undefined;

    return this.prisma.task.findMany({
      where,
      include: {
        owner: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true, projectNumber: true } },
        // כולל את הטלפון של הלקוח (וטלפון איש הקשר הראשי כגיבוי) כדי שעמודת "טלפון"
        // ברשימת המשימות תציג מספר גם למשימות שמקורן בלקוח (לא רק בליד).
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            contacts: {
              where: { isPrimary: true },
              select: { phone: true, mobile: true },
              take: 1,
            },
          },
        },
        lead: { select: { id: true, fullName: true, phone: true, email: true, company: true, service: true, serviceType: true } },
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    });
  }

  /**
   * שליפת משימה בודדת לפי id — משמש בין היתר את הסוכן הקולי לשליפת פרטי משימת משרד.
   * מחזיר בדיוק את שדות ה-CrmTract (אותו shape שמוחזר מ-create/update). 404 אם לא קיימת.
   */
  async findOne(id: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        description: true,
        dueDate: true,
        priority: true,
        status: true,
        ownerId: true,
        customerId: true,
        productName: true,
        createdAt: true,
      },
    });
    if (!task) throw new NotFoundException('משימה לא נמצאה');
    return task;
  }

  /** האם המשימה עדיין בשלב טרום-מכירה, כלומר מותר לקדם אותה ל"פולואפ". */
  private isPresaleTask(t: { type: string | null; currentStage: number | null }): boolean {
    if (t.currentStage != null) return PRESALE_STAGES.has(t.currentStage);
    return PRESALE_TYPES.has(String(t.type || '').toLowerCase());
  }

  /**
   * מאתר את המשימה הפעילה של הלקוח שאליה צריך להיצמד "מעקב" של הצעת מחיר,
   * במקום לפתוח משימה שנייה. מחזיר null כשאין מועמדת — ורק אז מותר לקורא ליצור.
   *
   * הרקע: "מעקב" מתוך משימה עשה PATCH על אותה משימה, אבל "מעקב" ממסך הצעה עצמאי
   * עשה POST /tasks — ולכן לקוח עם משימת "פנייה - X" פתוחה קיבל משימת מעקב מקבילה
   * (יורם גבאי הגיע ל-8 עותקים, cardo systems ל-4). הכותרות שונות, ולכן גם
   * findDuplicateOf — שמשווה כותרת מדויקת — לא תפס את זה.
   *
   * סדר העדיפות:
   *   1. המשימה ש-Quote.linkedEntityId מצביע עליה — אם היא עדיין קיימת ופעילה.
   *      אין FK על השדה הזה, ולכן יש בייצור מצביעים למשימות שנמחקו; findUnique
   *      שמחזיר null נופל בשקט לשלב הבא במקום לשבור את הזרימה.
   *   2. משימה פעילה בטרום-מכירה של אותו לקוח — עדיפות למשימה של המשתמש הפועל.
   *
   * הרשאות: SALES/TECHNICIAN רשאים לעדכן רק משימות שבבעלותם (ראה update), ולכן
   * מוחזרות להם רק כאלה. משימה של עובד אחר תיתן כאן null → תיווצר משימה חדשה
   * בבעלות הפועל, וזו ההתנהגות הנכונה: זו העבודה שלו, לא של חברו.
   */
  async findPromotableForCustomer(
    customerId: string,
    preferTaskId: string | undefined,
    user?: { id?: string; role?: string },
  ) {
    const role = (user?.role || '').toUpperCase();
    if (!role) throw new UnauthorizedException('Missing role');
    if (!customerId || !String(customerId).trim()) return null;

    const ownerOnly = role === 'SALES' || role === 'TECHNICIAN';
    if (ownerOnly && !user?.id) throw new UnauthorizedException('Missing user id');

    const select = {
      id: true, title: true, type: true, currentStage: true,
      ownerId: true, status: true, dueDate: true, customerId: true,
    } as const;
    const isActive = (t: { status: string }) => t.status !== 'DONE' && t.status !== 'CANCELLED';

    const prefer = String(preferTaskId || '').trim();
    if (prefer) {
      const linked = await this.prisma.task.findUnique({ where: { id: prefer }, select });
      if (linked && linked.customerId === customerId && isActive(linked)) {
        if (!ownerOnly || linked.ownerId === user!.id) return linked;
      }
    }

    const candidates = await this.prisma.task.findMany({
      where: {
        customerId,
        status: { notIn: ['DONE', 'CANCELLED'] },
        ...(ownerOnly ? { ownerId: user!.id } : {}),
      },
      select,
      orderBy: { createdAt: 'desc' },
    });
    const presale = candidates.filter((t) => this.isPresaleTask(t));
    if (!presale.length) return null;
    return presale.find((t) => t.ownerId === user?.id) ?? presale[0];
  }

  async create(data: any, user?: { id?: string; role?: string }) {
    const role = (user?.role || '').toUpperCase();
    if (!role) throw new UnauthorizedException('Missing role');
    if (role === 'SALES' || role === 'TECHNICIAN') {
      if (!user?.id) throw new UnauthorizedException('Missing user id');
      if (data?.ownerId && data.ownerId !== user.id) throw new ForbiddenException();
      data = { ...data, ownerId: user.id };
    } else if (role !== 'ADMIN' && role !== 'MANAGER') {
      throw new ForbiddenException();
    }
    if (!data?.title || !String(data.title).trim()) {
      data = { ...data, title: await this.buildTaskTitle(data) };
    }

    // אידמפוטנטיות: אם זו יצירה חוזרת של משימה שכבר קיימת — מחזירים את הקיימת.
    const duplicate = await this.findDuplicateOf(data);
    if (duplicate) {
      this.logger.warn(
        `Duplicate task create suppressed: "${String(data.title).trim()}" (owner ${data.ownerId}) → returning ${duplicate.id}`,
      );
      return duplicate;
    }

    return this.prisma.task.create({ data });
  }

  /**
   * מאתר משימה קיימת שהיצירה הנוכחית היא כפילות שלה. מחזיר null כשזו משימה חדשה באמת.
   *
   * ההשוואה תמיד דורשת אותה כותרת (מנורמלת) + אותו לקוח + שהמשימה הקיימת עדיין
   * פעילה (לא DONE/CANCELLED — משימה שנסגרה מותר לפתוח שוב). מעל זה, אחד מארבעה:
   *   1. אותו בעלים + אותו type + נוצרה ב-5 הדקות האחרונות → לחיצה כפולה / retry.
   *   2. משימת "פתיחת תהליך" (פנייה / כרטיס לקוח) של אותו בעלים ב-24 השעות האחרונות —
   *      בלי להשוות type, כי המשימה מתקדמת בשלבים (GENERAL→step4→stepQuote...) והעותק
   *      החדש נוצר תמיד כ-GENERAL/step1.
   *   3. "תזכורת: שליחת דוח חוזר" לאותו לקוח — תזכורת פתוחה אחת בלבד, גם אם עובד אחר
   *      יצר אותה וגם אחרי שבועות (כך תומר גולדפדר קיבל שתי תזכורות מחיים ומגלית).
   *   4. אותו תאריך יעד בדיוק — מכסה את משימת המעקב שנוצרת מ"תאריך למעקב" של הצעת
   *      מחיר, שהמנעול שלה ב-frontend הוא ref בזיכרון ונאבד ברענון/טאב שני.
   */
  private async findDuplicateOf(data: any) {
    const title = String(data?.title ?? '').trim();
    if (!title) return null;
    const ownerId = data?.ownerId ?? data?.owner?.connect?.id ?? null;
    const customerId = data?.customerId ?? data?.customer?.connect?.id ?? null;
    const type = data?.type ?? null;
    const dueDate = data?.dueDate ? new Date(data.dueDate) : null;

    const isOpener = OPENER_TITLE_PREFIXES.some((p) => title.startsWith(p));
    const isReportReminder = title.startsWith(REPORT_REMINDER_PREFIX);
    const now = Date.now();

    const or: any[] = [
      { ownerId, type, createdAt: { gte: new Date(now - DUP_EXACT_WINDOW_MS) } },
    ];
    if (isOpener && ownerId) {
      or.push({ ownerId, createdAt: { gte: new Date(now - DUP_OPENER_WINDOW_MS) } });
    }
    if (isReportReminder && customerId) {
      or.push({ customerId }); // ללא הגבלת זמן וללא תלות בבעלים
    }
    if (dueDate && !isNaN(dueDate.getTime())) {
      or.push({ dueDate });
    }

    return this.prisma.task.findFirst({
      where: {
        title,
        customerId,
        status: { notIn: ['DONE', 'CANCELLED'] },
        OR: or,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * בניית כותרת אוטומטית למשימה כשלא הוזנה כותרת ידנית.
   * פורמט: "שם לקוח — שם מוצר". נופל לשם הליד אם אין לקוח, ומדלג על המוצר אם חסר.
   */
  private async buildTaskTitle(data: any): Promise<string> {
    const product = String(data?.productName ?? '').trim();
    let who = '';

    const customerId = data?.customerId ?? data?.customer?.connect?.id;
    if (customerId) {
      const customer = await this.prisma.customer.findUnique({
        where: { id: customerId },
        select: { name: true },
      });
      who = String(customer?.name ?? '').trim();
    }

    if (!who) {
      const leadId = data?.leadId ?? data?.lead?.connect?.id;
      if (leadId) {
        const lead = await this.prisma.lead.findUnique({
          where: { id: leadId },
          select: { fullName: true },
        });
        who = String(lead?.fullName ?? '').trim();
      }
    }

    return [who, product].filter(Boolean).join(' — ') || 'משימה חדשה';
  }

  async update(id: string, data: any, user?: { id?: string; role?: string }) {
    const role = (user?.role || '').toUpperCase();
    if (!role) throw new UnauthorizedException('Missing role');
    const existing = await this.prisma.task.findUnique({ where: { id }, select: { ownerId: true } });
    if (role === 'SALES' || role === 'TECHNICIAN') {
      if (!user?.id) throw new UnauthorizedException('Missing user id');
      if (!existing || existing.ownerId !== user.id) throw new ForbiddenException();
    } else if (role !== 'ADMIN' && role !== 'MANAGER') {
      throw new ForbiddenException();
    }

    // ── העברה לעובד אחר: חותמים את רגע ההעברה ──────────────────────────────────
    // "העבר לעובד" שומר קודם את כרטיס הלקוח ורק אז מחליף בעלים, ולכן המשימה מגיעה
    // לעובד החדש עם customerId — ואיבדה את הסימון שמרים משימת "ליד חדש נכנס" לראש
    // הרשימה. transferredAt הוא הסימון שמחזיק את המשימה בראש אצל מי שקיבל אותה.
    const newOwnerId = data?.ownerId ? String(data.ownerId) : '';
    if (newOwnerId && existing && newOwnerId !== existing.ownerId) {
      data = { ...data, transferredAt: new Date() };
    }

    const updated = await this.prisma.task.update({ where: { id }, data });
    // ── הוק עמלת שותפים: אם העדכון הוסיף הערת "שולם" למשימה שמקושרת להפניה של
    //    שותף → מחשבים עמלה אוטומטית (best-effort, לא מפיל את העדכון). ──
    if (typeof data?.processNotes === 'string') {
      this.maybeRecordAffiliateCommission(id, data.processNotes).catch((e) =>
        this.logger.warn(`affiliate commission hook failed for task ${id}: ${e?.message || e}`),
      );
    }
    return updated;
  }

  /**
   * בודק אם הערת התהליך האחרונה מסמנת "שולם"; אם כן ויש הצעת מחיר מקושרת למשימה,
   * מפעיל את חישוב עמלת השותף עם totalAmount של ההצעה כסכום ששולם.
   */
  private async maybeRecordAffiliateCommission(taskId: string, processNotesJson: string): Promise<void> {
    let notes: Array<{ text?: string; at?: string }> = [];
    try { const p = JSON.parse(processNotesJson); if (Array.isArray(p)) notes = p; } catch { return; }
    if (!notes.length) return;
    // ההערה האחרונה לפי זמן קובעת את הסטטוס (עקבי עם ReportsPaymentsSection בפרונט).
    const sorted = [...notes].filter((n) => n && typeof n.text === 'string')
      .sort((a, b) => new Date(a.at || 0).getTime() - new Date(b.at || 0).getTime());
    const latest = sorted[sorted.length - 1];
    if (!latest) return;
    const text = String(latest.text || '');
    const isPaid = ((/דוח/.test(text) && /(שולם|תשלום)/.test(text)) || /סומן כשולם/.test(text)) && !/טרם/.test(text);
    if (!isPaid) return;

    // סכום ששולם = totalAmount של ההצעה המקושרת למשימה (linkedEntityId = taskId).
    const quote = await this.prisma.quote.findFirst({
      where: { linkedEntityId: taskId },
      select: { totalAmount: true, amount: true },
      orderBy: { createdAt: 'desc' },
    });
    const paidAmount = Number(quote?.totalAmount || quote?.amount || 0);
    if (!paidAmount) return;
    await this.affiliate.recordPaymentByTaskId(taskId, paidAmount);
  }

  async remove(id: string, user?: { id?: string; role?: string }) {
    const role = (user?.role || '').toUpperCase();
    if (!role) throw new UnauthorizedException('Missing role');
    if (role === 'SALES' || role === 'TECHNICIAN') {
      if (!user?.id) throw new UnauthorizedException('Missing user id');
      const existing = await this.prisma.task.findUnique({ where: { id }, select: { ownerId: true } });
      if (!existing || existing.ownerId !== user.id) throw new ForbiddenException();
    } else if (role !== 'ADMIN' && role !== 'MANAGER') {
      throw new ForbiddenException();
    }
    return this.prisma.task.delete({ where: { id } });
  }

  /** רשימת קבצים מצורפים למשימה (ללא תוכן הקובץ עצמו) */
  listAttachments(taskId: string) {
    return this.prisma.taskAttachment.findMany({
      where: { taskId },
      select: { id: true, fileName: true, mimeType: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addAttachment(taskId: string, fileName: string, mimeType: string, data: Buffer) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId }, select: { id: true } });
    if (!task) throw new ForbiddenException('Task not found');
    return this.prisma.taskAttachment.create({
      data: { taskId, fileName, mimeType, data: Uint8Array.from(data) },
      select: { id: true, fileName: true, mimeType: true, createdAt: true },
    });
  }

  getAttachment(attachmentId: string) {
    return this.prisma.taskAttachment.findUnique({ where: { id: attachmentId } });
  }

  /**
   * מחזיר קובץ מצורף להורדה, עם משיכה-בקריאה (pull-on-read) של הגרסה הערוכה מ-OneDrive.
   * אם הקובץ הוא DOCX של הצעת מחיר שנפתחה לעריכה ב-Word (יש הפניית OneDrive למשימה),
   * מסנכרן קודם את הגרסה העדכנית מ-OneDrive — הסנכרון מעדכן גם את הקובץ המצורף עצמו
   * (refreshLinkedTaskAttachmentDocx) — ואז מגיש את הבייטים העדכניים. כך פתיחה-מחדש של
   * המשימה והורדת הקובץ תמיד מחזירות את הגרסה שנערכה, ולא את המסמך שנוצר במיזוג לפני העריכה.
   * best-effort: כשל בסנכרון לא חוסם את ההורדה — מוגש הקובץ השמור.
   */
  async getAttachmentForDownload(taskId: string, attachmentId: string) {
    const att = await this.prisma.taskAttachment.findUnique({ where: { id: attachmentId } });
    if (!att) return null;

    const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const isDocx = att.mimeType === DOCX_MIME || /\.docx$/i.test(att.fileName || '');
    if (!isDocx) return att;

    // האם למשימה יש הצעה מקושרת עם קובץ פתוח-לעריכה ב-OneDrive? (העמודות עשויות שלא להתקיים
    // עדיין לפני מיגרציה — לכן guarded ב-catch.)
    const quote = await this.prisma.quote
      .findFirst({
        where: { linkedEntityId: taskId, onedriveItemId: { not: null } } as any,
        select: { id: true },
      })
      .catch(() => null);
    if (!quote?.id) return att;

    await this.quotesService.syncFromOneDrive(quote.id).catch(() => null);
    const fresh = await this.prisma.taskAttachment
      .findUnique({ where: { id: attachmentId } })
      .catch(() => null);
    return fresh ?? att;
  }

  async removeAttachment(attachmentId: string) {
    return this.prisma.taskAttachment.delete({ where: { id: attachmentId } });
  }

  /**
   * שינוי שם קובץ מצורף (עריכה ידנית). מעדכן את הרשומה ב-DB, וגם — אם זה DOCX של הצעה
   * עם קובץ פעיל ב-OneDrive — משנה את השם *גם ב-OneDrive* ונועל אותו (השם הידני מנצח,
   * הסנכרון האוטומטי לא ידרוס). סנכרון ה-OneDrive הוא best-effort ולא מפיל את שינוי השם.
   */
  async renameAttachment(attachmentId: string, fileName: string) {
    const name = (fileName || '').trim();
    if (!name) throw new BadRequestException('fileName is required');
    const updated = await this.prisma.taskAttachment.update({
      where: { id: attachmentId },
      data: { fileName: name },
      select: { id: true, fileName: true, mimeType: true, createdAt: true, taskId: true },
    });

    // סנכרון שם ל-OneDrive רק ל-DOCX (קבצי הצעה ניתנים-לעריכה). כישלון כאן שקט.
    const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const isDocx = updated.mimeType === DOCX_MIME || /\.docx$/i.test(updated.fileName || '');
    if (isDocx) {
      await this.quotesService.renameOnedriveForTask(updated.taskId, name).catch(() => null);
    }

    const { taskId: _taskId, ...rest } = updated;
    return rest;
  }

  /** יצירה/עדכון רשומת TaskField לפגישה שתואמה בשלב 6.
   *  ממפה רק עמודות שקיימות בטבלת TaskField בפועל, ומתרגם productName (קוד) → inspectionTypeId (uuid)
   *  מתוך טבלת InspectionType. אם אין סוג-בדיקה תקין / זמנים / משך — לא כותב (עמודות NOT NULL). */
  async upsertTaskField(taskId: string, data: {
    productName?: string | null;
    inspectionTypeId?: string | null;
    family?: string | null;
    appointmentTitle?: string | null;
    scheduledStartAt?: string | null;
    scheduledEndAt?: string | null;
    durationMinutes?: number | null;
    siteAddress?: string | null;
    siteCity?: string | null;
    fieldContactName?: string | null;
    fieldContactPhone?: string | null;
    navigationUrl?: string | null;
    specialInstructions?: string | null;
    updatedByUserId?: string | null;
    /** הפעלת אוטומציית "הנחיות לפני הבדיקה" (רלוונטי רק לבדיקות עם הנחיות). */
    preVisitEmailEnabled?: boolean | null;
  }) {
    const parsedStart = data.scheduledStartAt ? new Date(data.scheduledStartAt) : undefined;
    const parsedEnd = data.scheduledEndAt ? new Date(data.scheduledEndAt) : undefined;

    // inspectionTypeId — nullable מאז מיגרציה 20260726170000. אנחנו כבר לא תלויים בו:
    // שמירת הפגישה לא נכשלת כשה-SKU לא תואם לאף InspectionType. עדיין ננסה למלא אותו
    // best-effort (כשקל), אך אם אין התאמה — נשמור null בלי לחסום. InspectionType לא קיים
    // ב-schema.prisma → שאילתת raw (פרמטרים מבוטחים); כישלון בשאילתה לא מפיל את השמירה.
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let inspectionTypeId: string | null = data.inspectionTypeId ?? null;
    let family = data.family ?? undefined;
    if ((!inspectionTypeId || !uuidRe.test(inspectionTypeId)) && data.productName) {
      try {
        const rows = await this.prisma.$queryRaw<Array<{ id: string; family: string }>>`
          SELECT id, family FROM "InspectionType"
          WHERE code = ${data.productName} OR id::text = ${data.productName}
          LIMIT 1`;
        if (rows[0]) {
          inspectionTypeId = rows[0].id;
          family = family ?? rows[0].family;
        } else {
          inspectionTypeId = null; // אין התאמה — שומרים null, לא חוסמים
        }
      } catch {
        inspectionTypeId = null; // כשל בשליפה — ממשיכים בלי inspectionType
      }
    }

    // עמודות שעדיין חובה (זמנים/משך) — בלעדיהן אין פגישה. inspectionTypeId כבר לא כאן.
    const missing: string[] = [];
    if (!parsedStart) missing.push('scheduledStartAt');
    if (!parsedEnd) missing.push('scheduledEndAt');
    if (data.durationMinutes == null) missing.push('durationMinutes');
    if (missing.length > 0) {
      this.logger.warn(
        `upsertTaskField skipped for task ${taskId}: missing required column(s) → ${missing.join(', ')}`,
      );
      return { skipped: true as const, reason: 'missing_required_fields', missing };
    }

    // ── אוטומציית "הנחיות לפני הבדיקה" ──
    // מופעלת רק כשהשירות הוא אחת משתי בדיקות איכות האוויר שיש להן נוסח הנחיות.
    // המועד: 09:00 ביום שלפני מועד הבדיקה. אם המועד כבר חלף (פגישה שתואמה
    // להיום/מחר בבוקר) — לא מתזמנים, כדי לא לשלוח "יום לפני" באיחור.
    const guideline = getPreVisitGuideline(data.productName);
    const wantsPreVisit = !!data.preVisitEmailEnabled && !!guideline;
    let preVisitDueAt: Date | null = null;
    if (wantsPreVisit) {
      const d = new Date(parsedStart);
      d.setDate(d.getDate() - 1);
      d.setHours(9, 0, 0, 0);
      if (d.getTime() > Date.now()) preVisitDueAt = d;
      else this.logger.warn(`pre-visit email not scheduled for task ${taskId}: due time already passed`);
    }
    const preVisit = {
      preVisitEmailEnabled: wantsPreVisit && !!preVisitDueAt,
      preVisitEmailSku: wantsPreVisit && preVisitDueAt ? guideline!.sku : null,
      preVisitEmailDueAt: preVisitDueAt,
      // תיאום מחדש → מאפסים את חותמת השליחה כדי שהמייל יישלח שוב למועד החדש.
      preVisitEmailSentAt: null,
      preVisitEmailError: null,
    };

    const payload = {
      inspectionTypeId,
      family: family ?? 'other',
      appointmentTitle: data.appointmentTitle ?? null,
      scheduledStartAt: parsedStart,
      scheduledEndAt: parsedEnd,
      durationMinutes: data.durationMinutes,
      siteAddress: data.siteAddress ?? null,
      siteCity: data.siteCity ?? null,
      fieldContactName: data.fieldContactName ?? null,
      fieldContactPhone: data.fieldContactPhone ?? null,
      navigationUrl: data.navigationUrl ?? null,
      specialInstructions: data.specialInstructions ?? null,
      updatedByUserId: data.updatedByUserId ?? null,
      ...preVisit,
    };
    return this.prisma.taskField.upsert({
      where: { taskId },
      update: payload,
      create: { taskId, ...payload },
    });
  }
}

