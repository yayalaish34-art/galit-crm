import { ForbiddenException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QuotesService } from '../quotes/quotes.service';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly quotesService: QuotesService,
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
        customer: { select: { id: true, name: true } },
        lead: { select: { id: true, fullName: true, phone: true, email: true, company: true } },
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
    return this.prisma.task.create({ data });
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
    if (role === 'SALES' || role === 'TECHNICIAN') {
      if (!user?.id) throw new UnauthorizedException('Missing user id');
      const existing = await this.prisma.task.findUnique({ where: { id }, select: { ownerId: true } });
      if (!existing || existing.ownerId !== user.id) throw new ForbiddenException();
    } else if (role !== 'ADMIN' && role !== 'MANAGER') {
      throw new ForbiddenException();
    }
    return this.prisma.task.update({ where: { id }, data });
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
  }) {
    const parsedStart = data.scheduledStartAt ? new Date(data.scheduledStartAt) : undefined;
    const parsedEnd = data.scheduledEndAt ? new Date(data.scheduledEndAt) : undefined;

    // inspectionTypeId הוא uuid NOT NULL עם FK ל-InspectionType. הפרונט מחזיק רק את הקוד (productName),
    // אז מתרגמים כאן. InspectionType לא קיים ב-schema.prisma → שאילתת raw (פרמטרים מבוטחים).
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let inspectionTypeId = data.inspectionTypeId ?? undefined;
    let family = data.family ?? undefined;
    let productLookupFailed = false;
    if ((!inspectionTypeId || !uuidRe.test(inspectionTypeId)) && data.productName) {
      const rows = await this.prisma.$queryRaw<Array<{ id: string; family: string }>>`
        SELECT id, family FROM "InspectionType"
        WHERE code = ${data.productName} OR id::text = ${data.productName}
        LIMIT 1`;
      if (rows[0]) {
        inspectionTypeId = rows[0].id;
        family = family ?? rows[0].family;
      } else {
        productLookupFailed = true;
      }
    }

    // עמודות NOT NULL בטבלה — בלעדיהן אי-אפשר לכתוב. במקום ליפול בשקט (best-effort),
    // מדווחים סיבה מדויקת ל-log + מחזירים אובייקט skip שהפרונט יכול להציג כאזהרה.
    const missing: string[] = [];
    if (!inspectionTypeId) {
      missing.push(
        productLookupFailed
          ? `inspectionTypeId (productName ${JSON.stringify(data.productName)} לא תואם לאף code ב-InspectionType)`
          : !data.productName
            ? 'inspectionTypeId (productName ריק/חסר במשימה)'
            : 'inspectionTypeId',
      );
    }
    if (!parsedStart) missing.push('scheduledStartAt');
    if (!parsedEnd) missing.push('scheduledEndAt');
    if (data.durationMinutes == null) missing.push('durationMinutes');
    if (missing.length > 0) {
      this.logger.warn(
        `upsertTaskField skipped for task ${taskId}: missing required column(s) → ${missing.join(', ')}`,
      );
      return { skipped: true as const, reason: 'missing_required_fields', missing };
    }

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
    };
    return this.prisma.taskField.upsert({
      where: { taskId },
      update: payload,
      create: { taskId, ...payload },
    });
  }
}

