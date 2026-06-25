import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';
import { MicrosoftAuthService } from '../microsoft/microsoft-auth.service';
import { GraphMailService } from '../microsoft/graph-mail.service';

/** קישור הדירוג של גלית בגוגל (כפי שנמסר) — פותח את כרטיס העסק עם חלונית הדירוג. */
export const GOOGLE_REVIEW_FULL_URL =
  'https://www.google.com/search?hl=he-IL&gl=il&q=%D7%92%D7%9C%D7%99%D7%AA+-+%D7%94%D7%97%D7%91%D7%A8%D7%94+%D7%9C%D7%90%D7%99%D7%9B%D7%95%D7%AA+%D7%94%D7%A1%D7%91%D7%99%D7%91%D7%94,+%D7%90%D7%95%D7%A1%D7%98%D7%A8%D7%95%D7%91%D7%A1%D7%A7%D7%99+11,+%D7%A8%D7%A2%D7%A0%D7%A0%D7%94&ludocid=6353540875700534600&lsig=AB86z5XBBuvKEizwumoxn7pKhEyY#lrd=0x151d381236a2b835:0x582c4fc3920dfd48,3';

export interface FeedbackSendDto {
  customerId?: string;
  email?: string;
  customerName?: string;
  /** נושא מותאם (נערך בחלון השליחה) — אם ריק, ייווצר נושא ברירת מחדל אישי. */
  subject?: string;
  /** גוף ההודעה (טקסט חופשי שנערך בחלון השליחה) — קישור הדירוג יתווסף תמיד ככפתור. */
  message?: string;
}

/** הגדרות אוטומציה לבקשת משוב (גלובלי). */
export interface FeedbackAutomationConfig {
  enabled: boolean;
  /** כמה ימים אחרי סגירת המשימה לשלוח את בקשת המשוב. */
  delayDays: number;
  /** שעת שליחה מועדפת (0-23). */
  sendHour: number;
  /** ערוץ שליחה אוטומטי. */
  channel: 'email' | 'sms';
  subject: string;
  message: string;
}

/** הגדרות אוטומציה לפולואו-אפ תקופתי (גלובלי). */
export interface FollowupAutomationConfig {
  /** הפעלה גלובלית לכל הלקוחות (מעבר לבחירה פר-לקוח). */
  enabledGlobal: boolean;
  /** מרווח ימים בין פולואו-אפים. */
  intervalDays: number;
  sendHour: number;
  channel: 'email' | 'sms';
  subject: string;
  message: string;
}

export const FEEDBACK_AUTOMATION_KEY = 'automation.feedback';
export const FOLLOWUP_AUTOMATION_KEY = 'automation.followup';

const DEFAULT_FEEDBACK_AUTOMATION: FeedbackAutomationConfig = {
  enabled: false,
  delayDays: 3,
  sendHour: 10,
  channel: 'email',
  subject: 'נשמח לשמוע את דעתך — גלית, החברה לאיכות הסביבה',
  message:
    'שלום {firstName},\n' +
    'תודה שבחרת ב"גלית – החברה לאיכות הסביבה". היה לנו עונג לעבוד איתך, ונשמח מאוד לשמוע איך היה.\n' +
    'נשמח אם תוכל/י להקדיש רגע ולדרג אותנו — זה עוזר לנו מאוד להמשיך ולתת שירות מצוין.',
};

const DEFAULT_FOLLOWUP_AUTOMATION: FollowupAutomationConfig = {
  enabledGlobal: false,
  intervalDays: 180,
  sendHour: 10,
  channel: 'email',
  subject: 'שלום מ"גלית" — נשמח לבדוק מה שלומך',
  message:
    'שלום {firstName},\n' +
    'מזמן לא דיברנו! כאן צוות "גלית – החברה לאיכות הסביבה".\n' +
    'רצינו לבדוק מה שלומך ואם נוכל לסייע בבדיקה או בייעוץ נוסף. נשמח לעמוד לרשותך בכל עת.',
};

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);
  private readonly transporter: nodemailer.Transporter | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly msAuth: MicrosoftAuthService,
    private readonly graphMail: GraphMailService,
  ) {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || 587);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    this.transporter = host && user && pass
      ? nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } })
      : null;
  }

  /**
   * רשימת הלקוחות שיש להם לפחות משימה אחת שהסתיימה (DONE) — ללא כפילויות לקוח.
   * משמש לדאשבורד המשוב (admin בלבד).
   */
  async listFeedbackCustomers(user?: { id?: string; role?: string }) {
    const role = (user?.role || '').toUpperCase();
    if (role !== 'ADMIN') throw new ForbiddenException();

    try {
      const doneTasks = await this.prisma.task.findMany({
        where: { status: 'DONE', customerId: { not: null } },
        select: {
          customerId: true,
          updatedAt: true,
          title: true,
          productName: true,
          customer: { select: { id: true, name: true, email: true, phone: true, contactName: true, city: true } },
        },
        orderBy: { updatedAt: 'desc' },
      });

      const byCustomer = new Map<string, any>();
      for (const t of doneTasks) {
        const c = t.customer;
        if (!c) continue;
        const existing = byCustomer.get(c.id);
        if (existing) {
          existing.doneTasksCount += 1;
          continue;
        }
        // הרשומה הראשונה לכל לקוח היא המשימה האחרונה שהסתיימה (ordered desc).
        byCustomer.set(c.id, {
          id: c.id,
          name: c.name,
          email: c.email || '',
          phone: c.phone || '',
          contactName: c.contactName || '',
          city: c.city || '',
          lastDoneAt: t.updatedAt.toISOString(),
          lastService: t.productName || t.title || '',
          doneTasksCount: 1,
        });
      }

      return Array.from(byCustomer.values());
    } catch (e: any) {
      this.logger.warn(`listFeedbackCustomers failed: ${e?.message}`);
      return [];
    }
  }

  // ─────────────────────────────────────────────────────────────
  // תבניות ופרסונליזציה
  // ─────────────────────────────────────────────────────────────

  /** מחליף את הפלייסהולדרים בתבנית בשם הלקוח. */
  personalize(template: string, name?: string): string {
    const first = (name || '').trim().split(/\s+/)[0] || '';
    return (template || '')
      .replace(/\{firstName\}/g, first || 'לקוח/ה יקר/ה')
      .replace(/\{name\}/g, (name || '').trim() || 'לקוח/ה יקר/ה');
  }

  /** נושא ברירת מחדל אישי לבקשת משוב. */
  defaultFeedbackSubject(): string {
    return DEFAULT_FEEDBACK_AUTOMATION.subject;
  }

  /** גוף ברירת מחדל אישי לבקשת משוב (טקסט חופשי, ללא קישור — הקישור מתווסף ככפתור). */
  defaultFeedbackMessage(name?: string): string {
    return this.personalize(DEFAULT_FEEDBACK_AUTOMATION.message, name);
  }

  /** טיוטה אישית מוכנה לשליחה (נושא + גוף) — נטענת לחלון העריכה בממשק. */
  feedbackDraft(name?: string) {
    return {
      subject: this.defaultFeedbackSubject(),
      message: this.defaultFeedbackMessage(name),
      reviewUrl: GOOGLE_REVIEW_FULL_URL,
    };
  }

  /** שליחת מייל משוב ללקוח דרך Outlook המחובר (Graph), עם נפילה ל-SMTP. */
  async sendFeedbackEmail(user: { id?: string; role?: string } | undefined, dto: FeedbackSendDto) {
    const role = (user?.role || '').toUpperCase();
    if (role !== 'ADMIN') throw new ForbiddenException();

    let email = (dto.email || '').trim();
    let name = (dto.customerName || '').trim();
    if ((!email || !name) && dto.customerId) {
      const c = await this.prisma.customer
        .findUnique({ where: { id: dto.customerId }, select: { name: true, email: true } })
        .catch(() => null);
      if (c) {
        email = email || c.email || '';
        name = name || c.name || '';
      }
    }
    if (!email || !email.includes('@')) {
      throw new BadRequestException('ללקוח אין כתובת מייל תקינה — עדכן את פרטי הלקוח');
    }

    const subject = (dto.subject || '').trim() || this.defaultFeedbackSubject();
    const message = (dto.message || '').trim() || this.defaultFeedbackMessage(name);
    const html = this.buildFeedbackHtml(message);

    await this.deliverEmail(user, email, subject, html);

    // חותמת זמן למניעת שליחה כפולה ע"י האוטומציה.
    if (dto.customerId) {
      await this.prisma.customer
        .update({ where: { id: dto.customerId }, data: { feedbackRequestedAt: new Date() } })
        .catch(() => null);
    }
    return { success: true as const, sentTo: email };
  }

  /** שליחת מייל גנרי (משוב/פולואו-אפ) דרך Graph עם נפילה ל-SMTP. */
  async deliverEmail(
    user: { id?: string } | undefined,
    email: string,
    subject: string,
    html: string,
  ) {
    const userId = user?.id;
    const graphReady = userId ? (await this.msAuth.getStatus(userId)).connected : false;

    if (graphReady && userId) {
      await this.graphMail.sendMailAsUser(userId, { to: email, subject, html });
      return { via: 'graph' as const };
    }
    if (this.transporter) {
      await this.transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: email,
        subject,
        html,
      });
      return { via: 'smtp' as const };
    }
    throw new BadRequestException(
      'שליחת מייל אינה מוגדרת — חבר חשבון Outlook (מומלץ) או הגדר SMTP בשרת',
    );
  }

  /** טקסט נקי לערוצים שאינם HTML (SMS/WhatsApp) — גוף ההודעה + קישור הדירוג. */
  feedbackPlainText(name?: string, message?: string) {
    const body = (message || '').trim() || this.defaultFeedbackMessage(name);
    return `${body}\n${GOOGLE_REVIEW_FULL_URL}`;
  }

  /** עוטף גוף הודעה (טקסט חופשי) בתבנית HTML מעוצבת, ומוסיף תמיד את כפתור הדירוג. */
  private buildFeedbackHtml(message: string) {
    const paragraphs = (message || '')
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map(
        (line) =>
          `<p dir="rtl" style="font-size:15px;line-height:1.7;margin:0 0 14px;text-align:right;">${this.escapeHtml(line)}</p>`,
      )
      .join('\n');
    return `<!doctype html><html lang="he" dir="rtl"><body dir="rtl" style="margin:0;background:#f4f7f5;font-family:Arial,Helvetica,sans-serif;color:#163324;direction:rtl;text-align:right;">
  <div dir="rtl" style="max-width:560px;margin:0 auto;padding:24px;direction:rtl;text-align:right;">
    <div dir="rtl" style="background:#ffffff;border-radius:18px;padding:28px;box-shadow:0 8px 24px rgba(15,23,42,0.08);direction:rtl;text-align:right;">
      ${paragraphs}
      <div style="text-align:center;margin:22px 0 8px;">
        <a href="${GOOGLE_REVIEW_FULL_URL}" target="_blank"
           style="display:inline-block;background:#4ba647;color:#ffffff;text-decoration:none;font-weight:bold;
                  font-size:16px;padding:14px 34px;border-radius:999px;">
          ⭐ לדירוג בגוגל
        </a>
      </div>
      <p style="font-size:13px;color:#6b7280;text-align:center;margin:18px 0 0;">תודה רבה, צוות גלית – החברה לאיכות הסביבה</p>
    </div>
  </div>
</body></html>`;
  }

  /** עוטף גוף הודעה כללי (פולואו-אפ) בתבנית HTML מעוצבת — ללא כפתור הדירוג. */
  buildGenericHtml(message: string) {
    const paragraphs = (message || '')
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map(
        (line) =>
          `<p dir="rtl" style="font-size:15px;line-height:1.7;margin:0 0 14px;text-align:right;">${this.escapeHtml(line)}</p>`,
      )
      .join('\n');
    return `<!doctype html><html lang="he" dir="rtl"><body dir="rtl" style="margin:0;background:#f4f7f5;font-family:Arial,Helvetica,sans-serif;color:#163324;direction:rtl;text-align:right;">
  <div dir="rtl" style="max-width:560px;margin:0 auto;padding:24px;direction:rtl;text-align:right;">
    <div dir="rtl" style="background:#ffffff;border-radius:18px;padding:28px;box-shadow:0 8px 24px rgba(15,23,42,0.08);direction:rtl;text-align:right;">
      ${paragraphs}
      <p style="font-size:13px;color:#6b7280;text-align:center;margin:18px 0 0;">בברכה, צוות גלית – החברה לאיכות הסביבה</p>
    </div>
  </div>
</body></html>`;
  }

  private escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // ─────────────────────────────────────────────────────────────
  // הגדרות אוטומציה (משוב + פולואו-אפ) + SMS — admin בלבד
  // ─────────────────────────────────────────────────────────────

  async getFeedbackAutomation(): Promise<FeedbackAutomationConfig> {
    const row = await this.prisma.systemSetting
      .findUnique({ where: { key: FEEDBACK_AUTOMATION_KEY } })
      .catch(() => null);
    return { ...DEFAULT_FEEDBACK_AUTOMATION, ...((row?.value as object) || {}) };
  }

  async getFollowupAutomation(): Promise<FollowupAutomationConfig> {
    const row = await this.prisma.systemSetting
      .findUnique({ where: { key: FOLLOWUP_AUTOMATION_KEY } })
      .catch(() => null);
    return { ...DEFAULT_FOLLOWUP_AUTOMATION, ...((row?.value as object) || {}) };
  }

  async saveFeedbackAutomation(
    user: { role?: string } | undefined,
    patch: Partial<FeedbackAutomationConfig>,
  ) {
    this.assertAdmin(user);
    const next = { ...(await this.getFeedbackAutomation()), ...patch };
    await this.prisma.systemSetting.upsert({
      where: { key: FEEDBACK_AUTOMATION_KEY },
      create: { key: FEEDBACK_AUTOMATION_KEY, value: next as any },
      update: { value: next as any },
    });
    return next;
  }

  async saveFollowupAutomation(
    user: { role?: string } | undefined,
    patch: Partial<FollowupAutomationConfig>,
  ) {
    this.assertAdmin(user);
    const next = { ...(await this.getFollowupAutomation()), ...patch };
    await this.prisma.systemSetting.upsert({
      where: { key: FOLLOWUP_AUTOMATION_KEY },
      create: { key: FOLLOWUP_AUTOMATION_KEY, value: next as any },
      update: { value: next as any },
    });
    return next;
  }

  // ─────────────────────────────────────────────────────────────
  // פולואו-אפ פר-לקוח
  // ─────────────────────────────────────────────────────────────

  /** רשימת לקוחות לבחירת פולואו-אפ אוטומטי (כל הלקוחות הפעילים). */
  async listFollowupCustomers(user?: { role?: string }) {
    this.assertAdmin(user);
    const customers = await this.prisma.customer.findMany({
      // רק לקוחות שסיימו תהליך — כלומר יש להם לפחות משימה אחת שנסגרה (DONE).
      where: { status: { not: 'INACTIVE' }, tasks: { some: { status: 'DONE' } } },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        city: true,
        autoFollowupEnabled: true,
        followupIntervalDays: true,
        followupChannel: true,
        lastFollowupAt: true,
        nextFollowupAt: true,
      },
      orderBy: { name: 'asc' },
      take: 1000,
    });
    return customers.map((c) => ({
      ...c,
      lastFollowupAt: c.lastFollowupAt?.toISOString() || null,
      nextFollowupAt: c.nextFollowupAt?.toISOString() || null,
    }));
  }

  /** עדכון הגדרות פולואו-אפ ללקוח בודד. */
  async setCustomerFollowup(
    user: { role?: string } | undefined,
    customerId: string,
    patch: {
      autoFollowupEnabled?: boolean;
      followupIntervalDays?: number | null;
      followupChannel?: 'email' | 'sms' | null;
    },
  ) {
    this.assertAdmin(user);
    const global = await this.getFollowupAutomation();
    const data: any = {};
    if (patch.autoFollowupEnabled !== undefined) data.autoFollowupEnabled = patch.autoFollowupEnabled;
    if (patch.followupIntervalDays !== undefined) data.followupIntervalDays = patch.followupIntervalDays;
    if (patch.followupChannel !== undefined) data.followupChannel = patch.followupChannel;

    // חישוב nextFollowupAt כשמדליקים פולואו-אפ ועדיין אין מועד.
    if (patch.autoFollowupEnabled) {
      const existing = await this.prisma.customer
        .findUnique({ where: { id: customerId }, select: { lastFollowupAt: true, nextFollowupAt: true } })
        .catch(() => null);
      if (!existing?.nextFollowupAt) {
        const interval = patch.followupIntervalDays ?? global.intervalDays;
        const base = existing?.lastFollowupAt ?? new Date();
        data.nextFollowupAt = new Date(base.getTime() + interval * 86400000);
      }
    }
    return this.prisma.customer.update({ where: { id: customerId }, data });
  }

  private assertAdmin(user?: { role?: string }) {
    const role = (user?.role || '').toUpperCase();
    if (role !== 'ADMIN') throw new ForbiddenException();
  }
}
