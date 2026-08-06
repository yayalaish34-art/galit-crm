import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AiMailService } from '../../ai-mail/ai-mail.service';
import type { OutlookImportMetadata, OutlookImportResult } from './dto/import-email.dto';

/** לקוח-מאגר לבקשות מ-Outlook שהשולח שלהן לא זוהה כלקוח/איש-קשר קיים. נוצר פעם אחת. */
const CATCH_ALL_NAME = 'בקשות נכנסות (Outlook)';
/** גודל מקסימלי לקובץ ה-EML (בבתים) — 20MB. */
const MAX_EML_BYTES = 20 * 1024 * 1024;

@Injectable()
export class OutlookImportService {
  private readonly logger = new Logger(OutlookImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiMail: AiMailService,
  ) {}

  /** בסיס הכתובת הציבורית של ה-CRM לבניית requestUrl. */
  private get publicBase(): string {
    return (process.env.CRM_PUBLIC_URL || 'https://crm.galit.co.il').replace(/\/+$/, '');
  }

  private requestUrl(customerId: string): string {
    // פותח את כרטיס הלקוח בטאב הבקשות. הפרונט קורא את הפרמטרים.
    return `${this.publicBase}/dashboard?customerId=${encodeURIComponent(customerId)}&tab=requests`;
  }

  /**
   * ניקוי HTML בסיסי לפני שמירה/הצגה ב-CRM — הסרת script/style/iframe ותכונות on*.
   * לא תחליף לספריית sanitizer מלאה, אבל חוסם את וקטורי ה-XSS הנפוצים בגוף מייל.
   */
  private sanitizeHtml(html: string): string {
    if (!html) return '';
    return String(html)
      .replace(/<\s*script[\s\S]*?<\s*\/\s*script\s*>/gi, '')
      .replace(/<\s*style[\s\S]*?<\s*\/\s*style\s*>/gi, '')
      .replace(/<\s*iframe[\s\S]*?<\s*\/\s*iframe\s*>/gi, '')
      .replace(/<\s*(script|iframe|object|embed|link|meta)\b[^>]*>/gi, '')
      .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
      .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
      .replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
      .replace(/javascript:/gi, '')
      .slice(0, 500_000);
  }

  /** המרה גסה של HTML לטקסט קריא (למקרה שלא נשלח bodyText). */
  private htmlToText(html: string): string {
    return String(html || '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, 100_000);
  }

  /** רישום ביקורת — best-effort, לעולם לא מפיל. אין לרשום תוכן מייל/טוקנים. */
  private async audit(row: {
    userId?: string | null; requestId?: string | null; customerId?: string | null;
    outlookItemId?: string | null; internetMessageId?: string | null; mailboxEmail?: string | null;
    result: string; errorCode?: string | null;
  }): Promise<void> {
    try {
      await (this.prisma as any).outlookImportAudit.create({ data: { id: randomUUID(), ...row } });
    } catch (e: any) {
      this.logger.warn(`audit write failed: ${e?.message || e}`);
    }
  }

  /** מוצא/יוצר את לקוח-המאגר לבקשות ללא-שיוך. */
  private async getCatchAllCustomerId(): Promise<string> {
    const existing = await this.prisma.customer.findFirst({
      where: { name: CATCH_ALL_NAME },
      select: { id: true },
    });
    if (existing) return existing.id;
    const created = await this.prisma.customer.create({
      data: {
        name: CATCH_ALL_NAME,
        type: 'POTENTIAL',
        contactName: '',
        phone: '',
        email: '',
        city: '',
        leadSource: 'OUTLOOK',
      },
      select: { id: true },
    });
    return created.id;
  }

  /**
   * מאתר לקוח לפי מייל השולח — קודם לפי Customer.email, אחרת דרך CustomerContact.email.
   * מחזיר customerId או null. לא משנה שום מידע קיים.
   */
  private async findCustomerBySenderEmail(email: string): Promise<string | null> {
    const e = (email || '').trim().toLowerCase();
    if (!e || !e.includes('@')) return null;
    const byCustomer = await this.prisma.customer.findFirst({
      where: { email: { equals: e, mode: 'insensitive' } },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    if (byCustomer) return byCustomer.id;
    const contact = await this.prisma.customerContact.findFirst({
      where: { email: { equals: e, mode: 'insensitive' }, isActive: true },
      select: { customerId: true },
      orderBy: { createdAt: 'asc' },
    });
    return contact?.customerId ?? null;
  }

  /**
   * במייל **יוצא** הלקוח נמצא בצד הנמענים — השולח הוא העובד שלנו. שיוך לפי
   * senderEmail היה מתייק כל מייל יוצא לכרטיס של העובד (או ללקוח-המאגר).
   * לכן כאן עוברים על to ואז cc, ומדלגים על כתובות של הבית עצמו.
   */
  private async findCustomerByRecipients(
    to: Array<{ email?: string }> | undefined,
    cc: Array<{ email?: string }> | undefined,
    mailboxEmail: string | null,
  ): Promise<string | null> {
    const ownDomain = (mailboxEmail || '').split('@')[1]?.toLowerCase() || null;
    const candidates = [...(to ?? []), ...(cc ?? [])]
      .map((r) => (r?.email || '').trim().toLowerCase())
      .filter((e) => e.includes('@'))
      .filter((e) => e !== (mailboxEmail || '').toLowerCase())
      // כתובת מאותו דומיין היא כמעט תמיד עמית, לא לקוח.
      .filter((e) => !ownDomain || e.split('@')[1] !== ownDomain);

    for (const email of candidates) {
      const hit = await this.findCustomerBySenderEmail(email);
      if (hit) return hit;
    }
    return null;
  }

  /**
   * הזרימה המרכזית: יצירת בקשה מ-Outlook. מזהה עובד (userId) מגיע מה-JWT — לא מה-metadata.
   * - דדופ לפי internetMessageId → outlookItemId (לכל תיבה).
   * - שיוך אוטומטי לפי senderEmail, אחרת ללקוח-מאגר.
   * - שמירת EML כמסמך (Document) אם נשלח קובץ.
   * - סיווג שירות best-effort.
   */
  async importEmail(
    userId: string,
    userName: string | null,
    meta: OutlookImportMetadata,
    emlFile?: { buffer: Buffer; originalname?: string; size?: number; mimetype?: string } | null,
    attachmentFiles?: Array<{ buffer: Buffer; originalname?: string; size?: number; mimetype?: string }>,
  ): Promise<OutlookImportResult> {
    const subject = (meta.subject || '').toString().slice(0, 500).trim();
    const senderEmail = (meta.senderEmail || '').toString().trim();
    const senderName = (meta.senderName || '').toString().trim();
    const internetMessageId = (meta.internetMessageId || '').toString().trim() || null;
    const outlookItemId = (meta.outlookItemId || '').toString().trim() || null;
    const conversationId = (meta.conversationId || '').toString().trim() || null;
    const mailboxEmail = (meta.mailboxEmail || '').toString().trim().toLowerCase() || null;

    if (!senderEmail && !subject) {
      await this.audit({ userId, outlookItemId, internetMessageId, mailboxEmail, result: 'FAILED', errorCode: 'NO_SENDER_OR_SUBJECT' });
      throw new BadRequestException('אין די פרטים מהמייל (חסר שולח ונושא)');
    }

    // ── דדופ: לפי internetMessageId, אחרת outlookItemId (מוגבל לאותה תיבה כשידוע) ──
    const dedupeOr: any[] = [];
    if (internetMessageId) dedupeOr.push({ internetMessageId });
    if (outlookItemId) dedupeOr.push({ outlookItemId });
    if (dedupeOr.length) {
      const existing: any = await (this.prisma as any).customerEmailRequest.findFirst({
        where: mailboxEmail ? { OR: dedupeOr, mailboxEmail } : { OR: dedupeOr },
        orderBy: { createdAt: 'asc' },
      });
      if (existing) {
        await this.audit({ userId, requestId: existing.id, customerId: existing.customerId, outlookItemId, internetMessageId, mailboxEmail, result: 'DUPLICATE' });
        return this.result(existing, true, 'המייל כבר מתויק בבקשה זו');
      }
    }

    // ── שיוך לקוח ──
    // נכנס → לפי השולח. יוצא → לפי הנמענים (השולח הוא אנחנו).
    // בשני המקרים, אם לא נמצא — לקוח-מאגר.
    const isOutgoing = String(meta.direction || '').toUpperCase() === 'OUTGOING';
    let customerId = isOutgoing
      ? await this.findCustomerByRecipients(meta.to as any, meta.cc as any, mailboxEmail)
      : senderEmail
        ? await this.findCustomerBySenderEmail(senderEmail)
        : null;
    // נפילה-חזרה הפוכה: מייל יוצא ללא התאמה בנמענים עדיין עשוי להיות תשובה
    // בשרשור שבו הלקוח הוא השולח המקורי, ולהפך.
    if (!customerId && isOutgoing && senderEmail) {
      customerId = await this.findCustomerBySenderEmail(senderEmail);
    }
    if (!customerId && !isOutgoing) {
      customerId = await this.findCustomerByRecipients(meta.to as any, meta.cc as any, mailboxEmail);
    }
    if (!customerId) customerId = await this.getCatchAllCustomerId();

    // ── גוף המייל: HTML מנוקה + טקסט ──
    const bodyHtml = this.sanitizeHtml((meta.bodyHtml || '').toString());
    const bodyText = ((meta.bodyText || '').toString().trim() || this.htmlToText(bodyHtml)).slice(0, 100_000);

    const receivedAt = meta.receivedAt ? new Date(meta.receivedAt) : null;
    const toJson = JSON.stringify(Array.isArray(meta.to) ? meta.to.slice(0, 100) : []);
    const ccJson = JSON.stringify(Array.isArray(meta.cc) ? meta.cc.slice(0, 100) : []);

    // ── יצירת רשומת הבקשה ──
    let request: any;
    try {
      request = await (this.prisma as any).customerEmailRequest.create({
        data: {
          customerId,
          source: 'OUTLOOK_ADDIN',
          status: 'NEW',
          graphMessageId: outlookItemId,
          internetMessageId,
          outlookItemId,
          conversationId,
          mailboxEmail,
          subject: subject || '(ללא נושא)',
          fromName: senderName || null,
          fromEmail: senderEmail || null,
          toJson,
          ccJson,
          receivedAt: receivedAt && !isNaN(receivedAt.getTime()) ? receivedAt : null,
          bodyText: bodyText || null,
          bodyHtml: bodyHtml || null,
          emlArchived: false,
          attachedByUserId: userId,
          attachedByName: userName || null,
        },
      });
    } catch (e: any) {
      this.logger.error(`create request failed: ${e?.message || e}`);
      await this.audit({ userId, customerId, outlookItemId, internetMessageId, mailboxEmail, result: 'FAILED', errorCode: 'CREATE_FAILED' });
      throw new BadRequestException('יצירת הבקשה נכשלה');
    }

    // ── שמירת EML כמסמך (best-effort — לא מפיל את הבקשה) ──
    if (emlFile?.buffer?.length) {
      if (emlFile.buffer.length > MAX_EML_BYTES) {
        this.logger.warn(`EML too large (${emlFile.buffer.length}) — skipping archive for request ${request.id}`);
      } else {
        try {
          const doc = await this.prisma.document.create({
            data: {
              id: randomUUID(),
              customerId,
              name: `${subject || 'email'}.eml`.slice(0, 200),
              documentType: 'OTHER',
              filePath: `outlook-eml:${request.id}`,
              description: `מייל מ-Outlook (בקשה REQ-${request.requestNumber})`,
              mimeType: emlFile.mimetype || 'message/rfc822',
              sizeBytes: emlFile.size ?? emlFile.buffer.length,
              dataBase64: emlFile.buffer.toString('base64'),
              uploadedById: userId,
            },
            select: { id: true },
          });
          await (this.prisma as any).customerEmailRequest.update({
            where: { id: request.id },
            data: { emlArchived: true, emlDocumentId: doc.id },
          });
          request.emlArchived = true;
        } catch (e: any) {
          this.logger.warn(`EML archive failed for ${request.id}: ${e?.message || e}`);
        }
      }
    }

    // ── שמירת כל צרופה כמסמך עצמאי בכרטיס הלקוח ──
    // עד כה הצרופות נשמרו רק *בתוך* ה-EML, כלומר כדי להגיע לקובץ בודד היה צריך
    // להוריד את המייל ולפתוח אותו בתוכנת דואר. כאן כל צרופה הופכת ל-Document
    // נפרד, ולכן היא מופיעה ככל מסמך אחר בכרטיס. best-effort: כישלון בצרופה
    // אחת לא מפיל את הבקשה ולא את השאר.
    let attachmentsSaved = 0;
    for (const f of attachmentFiles ?? []) {
      if (!f?.buffer?.length) continue;
      if (f.buffer.length > MAX_EML_BYTES) {
        this.logger.warn(`attachment too large (${f.buffer.length}) — skipped for request ${request.id}`);
        continue;
      }
      try {
        await this.prisma.document.create({
          data: {
            id: randomUUID(),
            customerId,
            name: (f.originalname || 'attachment').slice(0, 200),
            documentType: 'OTHER',
            filePath: `outlook-attachment:${request.id}`,
            description: `צרופה ממייל (בקשה REQ-${request.requestNumber})`,
            mimeType: f.mimetype || 'application/octet-stream',
            sizeBytes: f.size ?? f.buffer.length,
            dataBase64: f.buffer.toString('base64'),
            uploadedById: userId,
          },
          select: { id: true },
        });
        attachmentsSaved++;
      } catch (e: any) {
        this.logger.warn(`attachment save failed for ${request.id}: ${e?.message || e}`);
      }
    }
    if (attachmentsSaved) {
      this.logger.log(`saved ${attachmentsSaved} attachment(s) for request ${request.id}`);
    }

    // ── סיווג שירות best-effort (לא מעכב, לא מפיל) ──
    try {
      const guess = await this.aiMail.extractLeadFields(subject, bodyText);
      if (guess?.serviceType) {
        await (this.prisma as any).customerEmailRequest.update({
          where: { id: request.id },
          data: { serviceTypeGuess: guess.serviceType.slice(0, 120) },
        });
      }
    } catch (e: any) {
      this.logger.warn(`classification failed for ${request.id}: ${e?.message || e}`);
    }

    await this.audit({ userId, requestId: request.id, customerId, outlookItemId, internetMessageId, mailboxEmail, result: 'CREATED' });
    return this.result(request, false, 'המייל נוסף בהצלחה לבקשות');
  }

  private result(r: any, duplicate: boolean, message: string): OutlookImportResult {
    return {
      success: true,
      duplicate,
      requestId: r.id,
      requestNumber: `REQ-${r.requestNumber}`,
      requestUrl: this.requestUrl(r.customerId),
      message,
    };
  }
}
