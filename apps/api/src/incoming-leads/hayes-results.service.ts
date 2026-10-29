import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GraphMailService } from '../microsoft/graph-mail.service';

const POLL_INTERVAL_MS = 2 * 60_000; // כל שתי דקות
const LOOKBACK_MS = 30 * 60_000; // חלון בדיקה: 30 דקות אחורה (overlap; dedup לפי internetMessageId)

/**
 * דוחות תוצאות עובשים שמגיעים במייל ממעבדת Hayes (reporting@hayesmicrobial.com).
 *
 * אותו מנגנון כמו קליטת לידים נכנסים (IncomingLeadsService): סריקה תקופתית של תיבות
 * ה-Outlook המחוברות. כל PDF מצורף נשלח ל-reporttt (POST /api/mold/intake), שם הוא נקרא
 * לטבלאות התוצאות, משויך לדוח העובשים של אותה עבודה לפי מספרי הדגימות (Chain of Custody),
 * ומנוסח — כך שהדוח מוכן כשנכנסים אליו. אם אין דוח תואם, reporttt פותח דוח חדש מהתוצאות.
 *
 * dedup: אותו מייל מגיע לכמה תיבות ונסרק שוב בכל סבב בתוך חלון הבדיקה. reporttt שומר כל
 * internetMessageId שכבר עובד ולכן שליחה חוזרת אינה יוצרת דוח שני; הסט כאן רק חוסך
 * העלאות חוזרות בין סבבים.
 *
 * דורש REPORTTT_URL (כתובת reporttt) ו-CRM_API_TOKEN (הסוד המשותף שכבר קיים בין המערכות).
 * כיבוי: HAYES_INTAKE_DISABLED=1.
 */
@Injectable()
export class HayesResultsService implements OnModuleInit {
  private readonly logger = new Logger(HayesResultsService.name);
  private polling = false;
  private readonly handled = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly graphMail: GraphMailService,
  ) {}

  onModuleInit() {
    if (process.env.HAYES_INTAKE_DISABLED === '1') return;
    if (!this.configured()) {
      this.logger.log('Hayes results intake off — REPORTTT_URL / CRM_API_TOKEN not set');
      return;
    }
    setInterval(() => {
      void this.pollAll().catch((e) => this.logger.error(`Hayes poll error: ${e?.message || e}`));
    }, POLL_INTERVAL_MS);
    this.logger.log('Hayes results mailbox polling started (every 2 min)');
  }

  private configured(): boolean {
    return Boolean(process.env.REPORTTT_URL?.trim() && process.env.CRM_API_TOKEN?.trim());
  }

  async pollAll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const users = await this.prisma.user.findMany({
        where: { msRefreshToken: { not: null }, status: 'ACTIVE' },
        select: { id: true },
      });
      const sinceIso = new Date(Date.now() - LOOKBACK_MS).toISOString();
      for (const u of users) {
        try {
          const messages = await this.graphMail.listRecentHayesReports(u.id, sinceIso);
          for (const m of messages) {
            for (const pdf of m.pdfs) await this.forward(m.internetMessageId, m.subject, pdf);
          }
        } catch (e: any) {
          this.logger.warn(`Hayes poll user ${u.id} failed: ${e?.message || e}`);
        }
      }
    } finally {
      this.polling = false;
    }
  }

  /** שולח PDF אחד ל-reporttt. כישלון זמני (רשת/5xx) ינוסה שוב בסבב הבא. */
  private async forward(messageId: string, subject: string, pdf: { name: string; content: Buffer }): Promise<void> {
    const key = `${messageId}|${pdf.name}`;
    if (this.handled.has(key)) return;

    const form = new FormData();
    form.set('file', new Blob([new Uint8Array(pdf.content)], { type: 'application/pdf' }), pdf.name);
    form.set('messageId', messageId);

    const base = process.env.REPORTTT_URL!.trim().replace(/\/$/, '');
    let res: Response;
    try {
      res = await fetch(`${base}/api/mold/intake`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.CRM_API_TOKEN!.trim()}` },
        body: form,
      });
    } catch (e: any) {
      this.logger.warn(`Hayes "${subject}" → reporttt unreachable: ${e?.message || e}`);
      return;
    }

    const body: any = await res.json().catch(() => ({}));
    if (res.ok) {
      this.handled.add(key);
      if (!body?.duplicate) {
        this.logger.log(
          `Hayes "${subject}" (${pdf.name}) → mold report ${body?.created ? 'created' : 'updated'}: ${body?.url} (${body?.samples} samples)`,
        );
      }
      return;
    }
    // 4xx = הקובץ אינו דוח תוצאות (למשל אישור קבלה או חשבונית מ-Hayes) — לא מנסים שוב.
    if (res.status >= 400 && res.status < 500) this.handled.add(key);
    this.logger.warn(`Hayes "${subject}" (${pdf.name}) not processed: ${res.status} ${body?.error || ''}`);
  }
}
