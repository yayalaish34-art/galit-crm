import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MicrosoftAuthService } from '../microsoft/microsoft-auth.service';
import { GraphMailService } from '../microsoft/graph-mail.service';
import { resolvePublicApiBase } from '../quotes/public-api-base.util';

/**
 * ברירת מחדל לקישור הביקורות בגוגל של גלית — ניתן לדריסה דרך SystemSetting("googleReviewUrl").
 * משתמש ב-ludocid (מזהה העסק ב-Google Maps) של גלית כדי לפתוח ישירות את חלונית כתיבת הביקורת.
 */
const GALIT_LUDOCID = '6353540875700534600';
const DEFAULT_GOOGLE_REVIEW_URL =
  `https://search.google.com/local/writereview?ludocid=${GALIT_LUDOCID}`;

/** מפתח ההגדרה שבו נשמר קישור הביקורות בגוגל (ניתן לעריכה בהגדרות המערכת). */
export const GOOGLE_REVIEW_URL_KEY = 'googleReviewUrl';

/** חמשת הפרצופים — מהעצוב (1) ועד השמח (5). rating נשמר במסד. */
const FACES: { rating: number; emoji: string; label: string }[] = [
  { rating: 1, emoji: '😠', label: 'מאוד לא מרוצה' },
  { rating: 2, emoji: '😕', label: 'לא מרוצה' },
  { rating: 3, emoji: '😐', label: 'סביר' },
  { rating: 4, emoji: '🙂', label: 'מרוצה' },
  { rating: 5, emoji: '😄', label: 'מאוד מרוצה' },
];

export interface SendReviewRequestOpts {
  toEmail: string;
  customerName?: string;
  customerId?: string;
  taskId?: string;
  /** המשתמש השולח — תיבת ה-Outlook שלו משמשת לשליחה. */
  userId: string;
  /** host הבקשה הנוכחית — לבניית קישור ה-API הציבורי שנצרב במייל. */
  requestHost?: string | null;
}

/**
 * שולח ללקוח מייל "בקשת דירוג" עם 5 פרצופים (מהעצוב עד השמח).
 * כל פרצוף הוא קישור אל /public/rate/:token?r=<1..5> בשרת ה-API הציבורי.
 * דירוג 4-5 → הפניה לדף הביקורות בגוגל ; דירוג 1-3 → דף משוב/התנצלות פנימי.
 *
 * best-effort: אם השליחה נכשלת (אין חיבור Outlook / מייל לא תקין) — לא זורק,
 * כדי שלא להפיל את זרימת שליחת הדוח שממנה אנו נקראים.
 */
@Injectable()
export class ReviewRequestService {
  private readonly logger = new Logger(ReviewRequestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly msAuth: MicrosoftAuthService,
    private readonly graphMail: GraphMailService,
  ) {}

  /** מחזיר את קישור הביקורות בגוגל מההגדרות, או ברירת המחדל. */
  async getGoogleReviewUrl(): Promise<string> {
    try {
      const s: any = await this.prisma.systemSetting.findUnique({ where: { key: GOOGLE_REVIEW_URL_KEY } });
      const val = typeof s?.value === 'string' ? s.value : s?.value?.url;
      const url = String(val || '').trim();
      if (url && /^https?:\/\//i.test(url)) return url;
    } catch (e: any) {
      this.logger.warn(`getGoogleReviewUrl failed: ${e?.message || e}`);
    }
    return DEFAULT_GOOGLE_REVIEW_URL;
  }

  /**
   * יוצר רשומת ReviewRequest ושולח את מייל הדירוג. מחזיר true בהצלחה.
   * לא זורק — נכשל בשקט (מלווה בלוג) כדי לא להפיל את זרימת שליחת הדוח.
   */
  async sendReviewRequest(opts: SendReviewRequestOpts): Promise<boolean> {
    const to = (opts.toEmail || '').trim();
    if (!to || !to.includes('@')) {
      this.logger.warn(`sendReviewRequest skipped — invalid email "${to}"`);
      return false;
    }
    if (!opts.userId) {
      this.logger.warn('sendReviewRequest skipped — no sending user');
      return false;
    }
    const connected = await this.msAuth.getStatus(opts.userId).then((s) => s.connected).catch(() => false);
    if (!connected) {
      this.logger.warn(`sendReviewRequest skipped — user ${opts.userId} has no Outlook connection`);
      return false;
    }

    // רשומה עם טוקן לא-ניחוש שמשמש כהרשאה בקישורי המייל.
    let record: { id: string; token: string };
    try {
      record = await this.prisma.reviewRequest.create({
        data: {
          toEmail: to,
          customerName: opts.customerName || null,
          customerId: opts.customerId || null,
          taskId: opts.taskId || null,
        },
        select: { id: true, token: true },
      });
    } catch (e: any) {
      this.logger.error(`create ReviewRequest failed: ${e?.message || e}`);
      return false;
    }

    const apiBase = resolvePublicApiBase(opts.requestHost);
    if (!apiBase) {
      this.logger.warn('sendReviewRequest — could not resolve public API base; links would break. Aborting.');
      return false;
    }

    const html = this.buildEmailHtml(apiBase, record.token, opts.customerName);
    const firstName = this.firstNameOf(opts.customerName);
    const subject = 'נשמח לשמוע ממך — איך היה השירות שלנו?';

    try {
      await this.graphMail.sendMailAsUser(opts.userId, { to, subject, html });
      this.logger.log(`review request sent to ${to} (id=${record.id})`);
      return true;
    } catch (e: any) {
      this.logger.error(`sendReviewRequest sendMail failed: ${e?.message || e}`);
      return false;
    }
  }

  /** בונה את גוף המייל: פנייה + שאלה + שורת 5 הפרצופים כקישורים. */
  private buildEmailHtml(apiBase: string, token: string, customerName?: string): string {
    const firstName = this.firstNameOf(customerName);
    const greeting = firstName ? `שלום ${this.esc(firstName)},` : 'שלום רב,';

    const faceLinks = FACES.map((f) => {
      const url = `${apiBase}/public/rate/${encodeURIComponent(token)}?r=${f.rating}`;
      return `<td align="center" style="padding:0 6px;">
  <a href="${url}" title="${this.esc(f.label)}" style="text-decoration:none;display:inline-block;">
    <span style="font-size:42px;line-height:1;">${f.emoji}</span>
  </a>
</td>`;
    }).join('\n');

    return `<div dir="rtl" style="font-family:Arial,'Segoe UI',sans-serif;font-size:15px;color:#1a1a1a;line-height:1.7;max-width:560px;margin:0 auto;">
  <p style="margin:0 0 14px;">${greeting}</p>
  <p style="margin:0 0 14px;">תודה שבחרת ב<strong>גלית – החברה לאיכות הסביבה</strong>. חשוב לנו מאוד לשמוע ממך — איך היה השירות שקיבלת?</p>
  <p style="margin:0 0 20px;">נשמח אם תדרג/י אותנו בלחיצה על אחד הפרצופים:</p>
  <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:8px auto 4px;">
    <tr>
${faceLinks}
    </tr>
    <tr>
      <td colspan="5" align="center" style="padding-top:6px;font-size:12px;color:#888;">
        <span style="float:right;">מאוד לא מרוצה</span>
        <span style="float:left;">מאוד מרוצה</span>
      </td>
    </tr>
  </table>
  <p style="margin:26px 0 0;font-size:13px;color:#666;">הדירוג שלך אורך רק שנייה ועוזר לנו מאוד. תודה! 🙏</p>
  <p style="margin:18px 0 0;font-size:13px;color:#444;">בברכה,<br>צוות גלית – החברה לאיכות הסביבה</p>
</div>`;
  }

  private esc(s: string): string {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /** שם פרטי = המילה הראשונה בשם המלא. */
  private firstNameOf(fullName?: string): string {
    const name = (fullName || '').trim();
    if (!name) return '';
    return name.split(/\s+/).filter(Boolean)[0] || '';
  }
}
