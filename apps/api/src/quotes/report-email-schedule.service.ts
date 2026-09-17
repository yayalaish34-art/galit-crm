import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { MicrosoftAuthService } from '../microsoft/microsoft-auth.service';
import { ReportMailService } from './report-mail.service';

/**
 * תור השליחות המתוזמנות של דוחות.
 *
 * "שלח עכשיו" עובר ישירות ל-ReportMailService; "תזמן שליחה" שומר כאן את אותה
 * בקשה בדיוק עם מועד, ו-dispatcher שולח אותה כשמגיע הזמן דרך אותו מסלול.
 * כלומר אין כאן מסלול שליחה שני — יש דחייה בזמן של המסלול היחיד, וכל מה
 * שמשתפר בשליחה הרגילה משתפר גם במתוזמנת.
 *
 * התור נשמר כ-JSON ב-SystemSetting ולא בטבלה משלו, כמו תור בקשות הדירוג
 * (ReviewRequestService): מדובר בעשרות רשומות קצרות-חיים, והמחיר של מיגרציה
 * במערכת הזאת גבוה מהתועלת.
 *
 * מה שלא נשמר כאן הוא הקובץ. הדוח נשלף לפי documentId ברגע השליחה, כך שדוח
 * שעודכן בכרטיס הלקוח אחרי התזמון נשלח בגרסתו העדכנית — ותור של עשרות מיילים
 * לא נושא עשרות עותקים של DOCX.
 */

const QUEUE_KEY = 'scheduledReportEmails';

/** כמה כישלונות אמיתיים לפני שמוותרים על עבודה. */
const MAX_ATTEMPTS = 3;

/** כמה זמן קדימה מותר לתזמן. מעבר לזה זו כמעט תמיד טעות הקלדה בתאריך. */
const MAX_DAYS_AHEAD = 180;

export interface ScheduledReportEmailJob {
  id: string;
  /** מתי לשלוח, ISO ב-UTC. */
  sendAt: string;

  /** מה לשלוח — הדוח נשלף לפי המזהה הזה בזמן השליחה. */
  documentId: string;
  documentName?: string;

  /** למי, ובשם מי. */
  customerId?: string;
  customerName?: string;
  userId: string;
  userName?: string;

  to: string;
  toList?: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  body?: string;
  includeSignature?: boolean;
  signatureId?: string;
  requestReadReceipt?: boolean;
  requestDeliveryReceipt?: boolean;

  createdAt: string;
  attempts: number;
  lastError?: string;
}

export type ScheduleInput = Omit<ScheduledReportEmailJob, 'id' | 'createdAt' | 'attempts' | 'lastError'>;

@Injectable()
export class ReportEmailScheduleService {
  private readonly logger = new Logger(ReportEmailScheduleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly msAuth: MicrosoftAuthService,
    private readonly reportMail: ReportMailService,
  ) {}

  // ── התור ────────────────────────────────────────────────────────────

  async all(): Promise<ScheduledReportEmailJob[]> {
    const row = await this.prisma.systemSetting.findUnique({ where: { key: QUEUE_KEY } }).catch(() => null);
    const value = row?.value as unknown;
    return Array.isArray(value) ? (value as ScheduledReportEmailJob[]) : [];
  }

  private async save(jobs: ScheduledReportEmailJob[]): Promise<void> {
    await this.prisma.systemSetting.upsert({
      where: { key: QUEUE_KEY },
      create: { key: QUEUE_KEY, value: jobs as any },
      update: { value: jobs as any },
    });
  }

  /** מה שמתוזמן לדוח מסוים, מהקרוב לרחוק. */
  async listForDocument(documentId: string): Promise<ScheduledReportEmailJob[]> {
    const jobs = await this.all();
    return jobs
      .filter((j) => j.documentId === documentId)
      .sort((a, b) => a.sendAt.localeCompare(b.sendAt));
  }

  // ── תזמון וביטול ────────────────────────────────────────────────────

  async schedule(input: ScheduleInput): Promise<ScheduledReportEmailJob> {
    const to = (input.to || '').trim();
    if (!to || !to.includes('@')) throw new BadRequestException('כתובת מייל לא תקינה');
    if (!input.documentId) throw new BadRequestException('לא נבחר דוח לשליחה');
    if (!input.userId) throw new BadRequestException('חסר משתמש שולח');

    const when = new Date(input.sendAt);
    if (Number.isNaN(when.getTime())) throw new BadRequestException('מועד שליחה לא תקין');
    // דקה של חסד: שעון הדפדפן והשרת לא זהים, ותזמון ל"עוד רגע" הוא בקשה סבירה.
    if (when.getTime() < Date.now() - 60_000) throw new BadRequestException('מועד השליחה כבר עבר');
    if (when.getTime() > Date.now() + MAX_DAYS_AHEAD * 86_400_000) {
      throw new BadRequestException(`לא ניתן לתזמן ליותר מ-${MAX_DAYS_AHEAD} ימים קדימה`);
    }

    const connected = await this.msAuth
      .getStatus(input.userId)
      .then((s) => s.connected)
      .catch(() => false);
    if (!connected) {
      throw new BadRequestException('תזמון שליחה דורש חיבור ל-Outlook — חבר חשבון Outlook ונסה שוב');
    }

    const job: ScheduledReportEmailJob = {
      ...input,
      to,
      sendAt: when.toISOString(),
      id: `sre_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      attempts: 0,
    };

    await this.save([...(await this.all()), job]);
    this.logger.log(`תוזמנה שליחת דוח ${job.documentId} ל-${job.to} בתאריך ${job.sendAt}`);
    return job;
  }

  async cancel(jobId: string): Promise<{ cancelled: boolean }> {
    const jobs = await this.all();
    const next = jobs.filter((j) => j.id !== jobId);
    if (next.length === jobs.length) return { cancelled: false };
    await this.save(next);
    return { cancelled: true };
  }

  // ── ה-dispatcher ────────────────────────────────────────────────────

  /**
   * כל דקה, כי המשתמש בוחר שעה מדויקת.
   *
   * הסריקה עצמה היא קריאת שורה אחת; העלות היא בשליחות שהגיע מועדן.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async tick(): Promise<void> {
    try {
      await this.processDue();
    } catch (e: any) {
      this.logger.error(`עיבוד תור השליחות נכשל: ${e?.message || e}`);
    }
  }

  async processDue(): Promise<{ sent: number; failed: number; remaining: number }> {
    const jobs = await this.all();
    if (!jobs.length) return { sent: 0, failed: 0, remaining: 0 };

    const now = Date.now();
    const due = jobs.filter((j) => new Date(j.sendAt).getTime() <= now);
    if (!due.length) return { sent: 0, failed: 0, remaining: jobs.length };

    const keep = jobs.filter((j) => new Date(j.sendAt).getTime() > now);
    let sent = 0;
    let failed = 0;

    for (const job of due) {
      /**
       * Outlook מנותק — לא כישלון של העבודה.
       *
       * העבודה נשארת בתור בלי לצרוך ניסיון, כי החיבור יחזור והמייל עדיין רלוונטי.
       * לספור את זה כניסיון היה מוחק את התור בשלוש דקות של ניתוק.
       */
      const connected = await this.msAuth
        .getStatus(job.userId)
        .then((s) => s.connected)
        .catch(() => false);
      if (!connected) {
        keep.push(job);
        continue;
      }

      try {
        await this.reportMail.sendDocumentEmail({
          documentId: job.documentId,
          userId: job.userId,
          to: job.to,
          toList: job.toList,
          cc: job.cc,
          bcc: job.bcc,
          subject: job.subject,
          body: job.body,
          includeSignature: job.includeSignature,
          signatureId: job.signatureId,
          customerName: job.customerName,
          requestReadReceipt: job.requestReadReceipt,
          requestDeliveryReceipt: job.requestDeliveryReceipt,
        } as any);
        sent++;
        this.logger.log(`נשלח דוח מתוזמן ${job.documentId} ל-${job.to}`);
      } catch (e: any) {
        const message = String(e?.message || e);
        const attempts = (job.attempts || 0) + 1;
        if (attempts >= MAX_ATTEMPTS) {
          failed++;
          this.logger.error(`שליחה מתוזמנת ${job.id} נזנחה אחרי ${attempts} ניסיונות: ${message}`);
        } else {
          // ניסיון חוזר בעוד חמש דקות, כדי לא להיתקע על תקלה רגעית.
          keep.push({
            ...job,
            attempts,
            lastError: message,
            sendAt: new Date(now + 5 * 60_000).toISOString(),
          });
        }
      }
    }

    await this.save(keep);
    return { sent, failed, remaining: keep.length };
  }
}
