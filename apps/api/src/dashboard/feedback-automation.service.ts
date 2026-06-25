import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { FeedbackService } from './feedback.service';
import { SmsService } from './sms.service';

/**
 * אוטומציה מתוזמנת לבקשות משוב ולפולואו-אפ תקופתי.
 * רצה כל שעה; כל אוטומציה פועלת רק בשעת השליחה שנבחרה (sendHour),
 * ומסתמכת על חותמות זמן בלקוח כדי למנוע שליחה כפולה.
 */
@Injectable()
export class FeedbackAutomationService {
  private readonly logger = new Logger(FeedbackAutomationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly feedback: FeedbackService,
    private readonly sms: SmsService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async hourlyTick() {
    const hour = new Date().getHours();
    try {
      await this.runFeedback({ hour });
    } catch (e: any) {
      this.logger.error(`feedback automation failed: ${e?.message}`);
    }
    try {
      await this.runFollowup({ hour });
    } catch (e: any) {
      this.logger.error(`followup automation failed: ${e?.message}`);
    }
  }

  /** מאתר משתמש אדמין עם חשבון Outlook מחובר — לשליחת מיילים אוטומטיים. */
  private async findSenderUserId(): Promise<string | null> {
    const u = await this.prisma.user
      .findFirst({
        where: { msRefreshToken: { not: null }, role: 'ADMIN' },
        select: { id: true },
      })
      .catch(() => null);
    if (u) return u.id;
    const any = await this.prisma.user
      .findFirst({ where: { msRefreshToken: { not: null } }, select: { id: true } })
      .catch(() => null);
    return any?.id ?? null;
  }

  // ─────────────────────────────────────────────────────────────
  // משוב אוטומטי — אחרי שמשימה נסגרה
  // ─────────────────────────────────────────────────────────────

  /** opts.force מפעיל ללא בדיקת שעה (לשליחה ידנית "שלח לכולם"). */
  async runFeedback(opts: { hour?: number; force?: boolean } = {}) {
    const config = await this.feedback.getFeedbackAutomation();
    if (!config.enabled && !opts.force) return { sent: 0, skipped: 0 };
    if (!opts.force && opts.hour !== undefined && opts.hour !== config.sendHour) {
      return { sent: 0, skipped: 0 };
    }

    const cutoff = new Date(Date.now() - config.delayDays * 86400000);
    const doneTasks = await this.prisma.task.findMany({
      where: { status: 'DONE', customerId: { not: null }, updatedAt: { lte: cutoff } },
      select: { customerId: true },
      orderBy: { updatedAt: 'desc' },
    });
    const customerIds = Array.from(new Set(doneTasks.map((t) => t.customerId).filter(Boolean))) as string[];
    if (customerIds.length === 0) return { sent: 0, skipped: 0 };

    const customers = await this.prisma.customer.findMany({
      where: {
        id: { in: customerIds },
        feedbackRequestedAt: null,
        OR: [{ feedbackOptOut: null }, { feedbackOptOut: false }],
      },
      select: { id: true, name: true, email: true, phone: true },
    });

    const senderId = config.channel === 'email' ? await this.findSenderUserId() : null;
    if (config.channel === 'email' && !senderId) {
      this.logger.warn('feedback automation: no Outlook-connected user to send as');
      return { sent: 0, skipped: customers.length };
    }

    let sent = 0;
    let skipped = 0;
    for (const c of customers) {
      try {
        if (config.channel === 'sms') {
          if (!c.phone) { skipped++; continue; }
          const text = this.feedback.feedbackPlainText(c.name, this.feedback.personalize(config.message, c.name));
          const res = await this.sms.sendSms(c.phone, text);
          if (!res.ok) { skipped++; continue; }
        } else {
          if (!c.email || !c.email.includes('@')) { skipped++; continue; }
          // sendFeedbackEmail עוטף את ההודעה, מוסיף את כפתור הדירוג וחותם feedbackRequestedAt.
          await this.feedback.sendFeedbackEmail(
            { id: senderId!, role: 'ADMIN' },
            {
              customerId: c.id,
              email: c.email,
              customerName: c.name,
              subject: this.feedback.personalize(config.subject, c.name),
              message: this.feedback.personalize(config.message, c.name),
            },
          );
          sent++;
          continue;
        }
        await this.prisma.customer.update({ where: { id: c.id }, data: { feedbackRequestedAt: new Date() } });
        sent++;
      } catch (e: any) {
        this.logger.warn(`feedback send failed for ${c.id}: ${e?.message}`);
        skipped++;
      }
    }
    this.logger.log(`feedback automation: sent=${sent} skipped=${skipped}`);
    return { sent, skipped };
  }

  // ─────────────────────────────────────────────────────────────
  // פולואו-אפ תקופתי
  // ─────────────────────────────────────────────────────────────

  async runFollowup(opts: { hour?: number; force?: boolean } = {}) {
    const config = await this.feedback.getFollowupAutomation();
    const perCustomerActive = await this.prisma.customer.count({ where: { autoFollowupEnabled: true } }).catch(() => 0);
    if (!config.enabledGlobal && perCustomerActive === 0 && !opts.force) return { sent: 0, scheduled: 0, skipped: 0 };
    if (!opts.force && opts.hour !== undefined && opts.hour !== config.sendHour) {
      return { sent: 0, scheduled: 0, skipped: 0 };
    }

    const where = config.enabledGlobal
      ? { status: { not: 'INACTIVE' } }
      : { autoFollowupEnabled: true };
    const customers = await this.prisma.customer.findMany({
      where: where as any,
      select: {
        id: true, name: true, email: true, phone: true,
        autoFollowupEnabled: true, followupIntervalDays: true, followupChannel: true,
        lastFollowupAt: true, nextFollowupAt: true,
      },
      take: 2000,
    });

    const senderId = await this.findSenderUserId();
    const now = new Date();
    let sent = 0;
    let scheduled = 0;
    let skipped = 0;

    for (const c of customers) {
      const interval = c.followupIntervalDays ?? config.intervalDays;
      // אתחול מועד ראשון — לא שולחים מיד, מתזמנים קדימה.
      if (!c.nextFollowupAt) {
        await this.prisma.customer.update({
          where: { id: c.id },
          data: { nextFollowupAt: new Date(now.getTime() + interval * 86400000) },
        });
        scheduled++;
        continue;
      }
      if (c.nextFollowupAt > now && !opts.force) { skipped++; continue; }

      const channel = (c.followupChannel as 'email' | 'sms' | null) || config.channel;
      const message = this.feedback.personalize(config.message, c.name);
      const subject = this.feedback.personalize(config.subject, c.name);
      try {
        if (channel === 'sms') {
          if (!c.phone) { skipped++; continue; }
          const res = await this.sms.sendSms(c.phone, `${message}`);
          if (!res.ok) { skipped++; continue; }
        } else {
          if (!c.email || !c.email.includes('@')) { skipped++; continue; }
          if (!senderId) { skipped++; continue; }
          const html = this.feedback.buildGenericHtml(message);
          await this.feedback.deliverEmail({ id: senderId }, c.email, subject, html);
        }
        await this.prisma.customer.update({
          where: { id: c.id },
          data: { lastFollowupAt: now, nextFollowupAt: new Date(now.getTime() + interval * 86400000) },
        });
        sent++;
      } catch (e: any) {
        this.logger.warn(`followup send failed for ${c.id}: ${e?.message}`);
        skipped++;
      }
    }
    this.logger.log(`followup automation: sent=${sent} scheduled=${scheduled} skipped=${skipped}`);
    return { sent, scheduled, skipped };
  }
}
