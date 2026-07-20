import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { GraphMailService } from '../microsoft/graph-mail.service';
import { buildPreVisitEmailHtml, getPreVisitGuideline } from './pre-visit-guidelines';

/**
 * אוטומציית "הנחיות לפני הבדיקה".
 *
 * בשלב התיאום, כשהשירות הוא אחת משתי בדיקות איכות האוויר (קודים 72 / 69), נשמר על
 * ה-TaskField מועד שליחה (09:00 ביום שלפני הבדיקה). השירות הזה סורק כל 5 דקות את
 * הרשומות שהגיע מועדן וטרם נשלחו, ושולח ללקוח את ההנחיות בגוף המייל.
 *
 * מבנה זהה ל-FeedbackAutomationService: שליחה מה-Outlook של אדמין מחובר,
 * וחותמת preVisitEmailSentAt מונעת שליחה כפולה.
 */
@Injectable()
export class PreVisitEmailService {
  private readonly logger = new Logger(PreVisitEmailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: GraphMailService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async tick() {
    try {
      await this.processDue();
    } catch (e: any) {
      this.logger.error(`pre-visit email automation failed: ${e?.message}`);
    }
  }

  /**
   * שולח את כל מיילי ההנחיות שהגיע מועדם.
   * מדלג (ומכבה את האוטומציה) כשאין ללקוח כתובת מייל — אין טעם לנסות שוב.
   */
  async processDue() {
    const now = new Date();
    const due = await this.prisma.taskField.findMany({
      where: {
        preVisitEmailEnabled: true,
        preVisitEmailSentAt: null,
        preVisitEmailDueAt: { lte: now },
      },
      select: {
        id: true,
        taskId: true,
        preVisitEmailSku: true,
        scheduledStartAt: true,
        siteAddress: true,
        siteCity: true,
        fieldContactName: true,
        task: {
          select: {
            id: true,
            customerId: true,
            customer: { select: { name: true, email: true } },
          },
        },
      },
      take: 100,
    });
    if (!due.length) return { sent: 0, skipped: 0 };

    const senderId = await this.findSenderUserId();
    let sent = 0;
    let skipped = 0;

    for (const row of due) {
      const guideline = getPreVisitGuideline(row.preVisitEmailSku);
      if (!guideline) {
        await this.disable(row.id, 'סוג הבדיקה אינו נתמך לאוטומציית הנחיות');
        skipped++;
        continue;
      }
      const email = (row.task?.customer?.email || '').trim();
      if (!email || !email.includes('@')) {
        await this.disable(row.id, 'ללקוח אין כתובת מייל תקינה');
        skipped++;
        continue;
      }
      if (!senderId) {
        // אין אדמין עם Outlook מחובר — משאירים בתור לניסיון בסבב הבא.
        this.logger.warn('pre-visit email: no Outlook-connected user to send as');
        return { sent, skipped };
      }

      const customerName = (row.task?.customer?.name || row.fieldContactName || '').trim();
      const address = [row.siteAddress, row.siteCity].filter((s) => s && s.trim()).join(', ');
      const html = buildPreVisitEmailHtml({
        guideline,
        customerName: customerName || null,
        scheduledStartAt: row.scheduledStartAt,
        siteAddress: address || null,
      });

      try {
        await this.mail.sendMailAsUser(senderId, {
          to: email,
          subject: guideline.title,
          html,
        });
        await this.prisma.taskField.update({
          where: { id: row.id },
          data: { preVisitEmailSentAt: new Date(), preVisitEmailError: null },
        });
        sent++;
      } catch (e: any) {
        // נשאר enabled → ינוסה שוב בסבב הבא; השגיאה נשמרת לתצוגה/דיבוג.
        this.logger.warn(`pre-visit email failed for task ${row.taskId}: ${e?.message}`);
        await this.prisma.taskField
          .update({ where: { id: row.id }, data: { preVisitEmailError: String(e?.message ?? e).slice(0, 500) } })
          .catch(() => undefined);
        skipped++;
      }
    }

    if (sent || skipped) this.logger.log(`pre-visit emails: sent=${sent} skipped=${skipped}`);
    return { sent, skipped };
  }

  /** מכבה את האוטומציה לרשומה עם סיבה — למקרים שאין טעם לנסות שוב. */
  private async disable(taskFieldId: string, reason: string) {
    await this.prisma.taskField
      .update({ where: { id: taskFieldId }, data: { preVisitEmailEnabled: false, preVisitEmailError: reason } })
      .catch(() => undefined);
  }

  /** מאתר משתמש אדמין עם Outlook מחובר — לשליחת המיילים האוטומטיים. */
  private async findSenderUserId(): Promise<string | null> {
    const admin = await this.prisma.user
      .findFirst({ where: { msRefreshToken: { not: null }, role: 'ADMIN' }, select: { id: true } })
      .catch(() => null);
    if (admin) return admin.id;
    const any = await this.prisma.user
      .findFirst({ where: { msRefreshToken: { not: null } }, select: { id: true } })
      .catch(() => null);
    return any?.id ?? null;
  }
}
