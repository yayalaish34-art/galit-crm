import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MicrosoftAuthService } from '../microsoft/microsoft-auth.service';
import { GraphMailService, GraphMailAttachment } from '../microsoft/graph-mail.service';
import { resolvePublicApiBase } from '../quotes/public-api-base.util';
import { GOOGLE_REVIEW_FULL_URL } from '../dashboard/feedback.service';
import { REVIEW_EMAIL_ASSETS } from './review-email-assets';

/**
 * ברירת מחדל לקישור הביקורות בגוגל של גלית — ניתן לדריסה דרך SystemSetting("googleReviewUrl").
 *
 * הפורמט הישן `writereview?ludocid=<CID>` הופסק ע"י גוגל ומחזיר HTTP 400 (לא נפתח).
 * משתמשים בקישור העובד המשותף (GOOGLE_REVIEW_FULL_URL) — אותו קישור שכבר בשימוש בזרימת
 * המשוב הידנית (feedback.service) ובדשבורד — כדי לשמור מקור-אמת אחד לקישור הדירוג של גלית.
 */
const DEFAULT_GOOGLE_REVIEW_URL = GOOGLE_REVIEW_FULL_URL;

/** מפתח ההגדרה שבו נשמר קישור הביקורות בגוגל (ניתן לעריכה בהגדרות המערכת). */
export const GOOGLE_REVIEW_URL_KEY = 'googleReviewUrl';

/**
 * תור בקשות הדירוג המתוזמנות — נשמר ב-SystemSetting כמערך JSON, נשלח ע"י ה-cron
 * (dispatcher) כשמגיע dueAt. בקשת דירוג אחרי דוח מתוזמנת ל-09:00 של יום המחרת
 * (Asia/Jerusalem) במקום להישלח מיד. אותה תבנית כמו feedback.scheduled.
 */
export const SCHEDULED_REVIEWS_KEY = 'reviews.scheduled';

/** עבודת בקשת-דירוג מתוזמנת בודדת בתור. */
export interface ScheduledReviewJob {
  toEmail: string;
  customerName?: string | null;
  customerId?: string | null;
  taskId?: string | null;
  /** המשתמש השולח — תיבת ה-Outlook שלו (שולח הדוח). */
  userId: string;
  /** host הבקשה המקורית — לבניית קישור ה-API הציבורי במייל. */
  requestHost?: string | null;
  /** ISO — מתי לשלוח (09:00 למחרת). */
  dueAt: string;
  /** מספר ניסיונות שליחה שנכשלו (נופל מהתור אחרי MAX_ATTEMPTS). */
  attempts?: number;
}

/** מקסימום ניסיונות שליחה כושלים לפני זריקת עבודה מהתור. */
const MAX_REVIEW_SEND_ATTEMPTS = 6;

/**
 * חמשת הפרצופים — מהעצוב (1) ועד השמח (5). rating נשמר במסד.
 * asset = מפתח ב-REVIEW_EMAIL_ASSETS (אייקון PNG מוטבע), color = צבע התווית שמתחתיו.
 */
const FACES: { rating: number; asset: string; label: string; color: string }[] = [
  { rating: 1, asset: 'face1', label: 'מאוד לא מרוצה', color: '#d9382d' },
  { rating: 2, asset: 'face2', label: 'לא מרוצה', color: '#df7c1f' },
  { rating: 3, asset: 'face3', label: 'ניטרלי', color: '#c69a0b' },
  { rating: 4, asset: 'face4', label: 'מרוצה', color: '#6ea828' },
  { rating: 5, asset: 'face5', label: 'מרוצה מאוד', color: '#3d9942' },
];

/** ירוק המותג (מהלוגו) — לכותרות ולפס הסיום. */
const BRAND_GREEN = '#1d7a3d';
const BRAND_LEAF = '#8cc63f';

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
    const subject = 'נשמח לשמוע ממך — איך היה השירות שלנו?';

    try {
      await this.graphMail.sendMailAsUser(opts.userId, {
        to,
        subject,
        html,
        attachments: this.buildInlineAssets(),
      });
      this.logger.log(`review request sent to ${to} (id=${record.id})`);
      return true;
    } catch (e: any) {
      this.logger.error(`sendReviewRequest sendMail failed: ${e?.message || e}`);
      return false;
    }
  }

  // ── תור בקשות דירוג מתוזמנות (09:00 למחרת) ──────────────────────────────────

  /** התור הנוכחי של בקשות הדירוג המתוזמנות. */
  async getScheduledReviews(): Promise<ScheduledReviewJob[]> {
    const row = await this.prisma.systemSetting
      .findUnique({ where: { key: SCHEDULED_REVIEWS_KEY } })
      .catch(() => null);
    const arr = row?.value as unknown;
    return Array.isArray(arr) ? (arr as ScheduledReviewJob[]) : [];
  }

  /** שמירת התור (נקרא גם ע"י ה-dispatcher אחרי עיבוד). */
  async setScheduledReviews(jobs: ScheduledReviewJob[]): Promise<void> {
    await this.prisma.systemSetting.upsert({
      where: { key: SCHEDULED_REVIEWS_KEY },
      create: { key: SCHEDULED_REVIEWS_KEY, value: jobs as any },
      update: { value: jobs as any },
    });
  }

  /**
   * מחזיר את ה-timestamp של 09:00 למחרת בשעון ישראל (Asia/Jerusalem), כ-ISO.
   * מחושב בלי תלות באזור-הזמן של השרת: נגזר ה-offset של ישראל מ-Intl ומורכב UTC.
   */
  static nextMorning9IsraelIso(from: Date = new Date()): string {
    // התאריך המקומי (ישראל) של "מחר".
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
    });
    const todayIl = fmt.format(from); // YYYY-MM-DD בישראל
    const [y, m, d] = todayIl.split('-').map(Number);
    const tomorrow = new Date(Date.UTC(y, m - 1, d + 1, 9, 0, 0)); // 09:00 "נאיבי" כ-UTC
    // כמה ישראל מקדימה את UTC באותו יום (2 בחורף / 3 בקיץ) — מתקנים לאותה שעת-קיר.
    const offsetMin = ReviewRequestService.israelOffsetMinutes(tomorrow);
    return new Date(tomorrow.getTime() - offsetMin * 60000).toISOString();
  }

  /** דקות ה-offset של Asia/Jerusalem מ-UTC בזמן נתון (120 בחורף, 180 בקיץ). */
  private static israelOffsetMinutes(at: Date): number {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Jerusalem', hour12: false, year: 'numeric', month: '2-digit',
      day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const parts = dtf.formatToParts(at);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
    return Math.round((asUtc - at.getTime()) / 60000);
  }

  /**
   * מתזמן בקשת דירוג ל-09:00 למחרת (במקום שליחה מיידית). דדופ לפי taskId — אם
   * כבר יש עבודה מתוזמנת לאותה משימה, לא מוסיפים כפילות. לא זורק.
   */
  async enqueueReviewRequest(opts: SendReviewRequestOpts): Promise<{ scheduled: boolean; dueAt?: string }> {
    const toEmail = (opts.toEmail || '').trim();
    if (!toEmail || !toEmail.includes('@') || !opts.userId) {
      this.logger.warn('enqueueReviewRequest skipped — missing email/user');
      return { scheduled: false };
    }
    try {
      const jobs = await this.getScheduledReviews();
      if (opts.taskId && jobs.some((j) => j.taskId && j.taskId === opts.taskId)) {
        return { scheduled: false }; // כבר מתוזמן לאותה משימה
      }
      const dueAt = ReviewRequestService.nextMorning9IsraelIso();
      jobs.push({
        toEmail,
        customerName: opts.customerName || null,
        customerId: opts.customerId || null,
        taskId: opts.taskId || null,
        userId: opts.userId,
        requestHost: opts.requestHost || null,
        dueAt,
        attempts: 0,
      });
      await this.setScheduledReviews(jobs);
      this.logger.log(`review request scheduled for ${toEmail} at ${dueAt}`);
      return { scheduled: true, dueAt };
    } catch (e: any) {
      this.logger.error(`enqueueReviewRequest failed: ${e?.message || e}`);
      return { scheduled: false };
    }
  }

  /**
   * מעבד את תור הדירוגים המתוזמנים: שולח את אלו שהגיע מועדן דרך sendReviewRequest.
   * עבודה שנכשלה חוזרת לתור עד MAX_REVIEW_SEND_ATTEMPTS. אם ל-Outlook של השולח אין
   * חיבור כרגע — נשארת בתור בלי לצרוך ניסיון (כדי לשרוד עד שהוא יתחבר באותו יום).
   */
  async processScheduledReviews(): Promise<{ sent: number; skipped: number; remaining: number }> {
    const jobs = await this.getScheduledReviews();
    if (!jobs.length) return { sent: 0, skipped: 0, remaining: 0 };

    const now = Date.now();
    const due = jobs.filter((j) => new Date(j.dueAt).getTime() <= now);
    if (!due.length) return { sent: 0, skipped: 0, remaining: jobs.length };

    // נשמרים: כל מה שטרם הגיע מועדו + עבודות שנכשלו/מחכות לחיבור.
    const stillPending = jobs.filter((j) => new Date(j.dueAt).getTime() > now);
    let sent = 0;
    let skipped = 0;

    for (const job of due) {
      // בדיקת חיבור Outlook של השולח — אם מנותק, משאירים בתור בלי לצרוך ניסיון.
      const connected = await this.msAuth.getStatus(job.userId).then((s) => s.connected).catch(() => false);
      if (!connected) {
        stillPending.push(job);
        continue;
      }
      const ok = await this.sendReviewRequest({
        toEmail: job.toEmail,
        customerName: job.customerName || undefined,
        customerId: job.customerId || undefined,
        taskId: job.taskId || undefined,
        userId: job.userId,
        requestHost: job.requestHost,
      });
      if (ok) {
        sent++;
      } else {
        const attempts = (job.attempts || 0) + 1;
        if (attempts < MAX_REVIEW_SEND_ATTEMPTS) {
          stillPending.push({ ...job, attempts });
        } else {
          this.logger.warn(`scheduled review dropped for ${job.toEmail} after ${attempts} attempts`);
          skipped++;
        }
      }
    }

    await this.setScheduledReviews(stillPending);
    this.logger.log(`scheduled reviews: sent=${sent} skipped=${skipped} remaining=${stillPending.length}`);
    return { sent, skipped, remaining: stillPending.length };
  }

  /**
   * התמונות המוטבעות של המייל (לוגו, באנר עלים, תג עלה, 5 פרצופים) כ-inline
   * attachments. המייל מפנה אליהן ב-src="cid:<cid>" — כך הן מוצגות גם באאוטלוק
   * (שחוסם data:base64) וגם ב-Gmail, בלי תלות בשרת תמונות חיצוני.
   */
  private buildInlineAssets(): GraphMailAttachment[] {
    return Object.values(REVIEW_EMAIL_ASSETS).map((a) => ({
      name: a.name,
      contentType: 'image/png',
      content: Buffer.from(a.base64, 'base64'),
      contentId: a.cid,
    }));
  }

  /**
   * בונה את גוף המייל — כרטיס ממותג (לוגו + באנר עלים) עם 5 אייקוני פרצופים
   * צבעוניים כקישורי דירוג. HTML לתיבות דואר: טבלאות + סגנון inline בלבד,
   * בלי CSS חיצוני/flex/grid, כדי שייראה נכון גם באאוטלוק.
   */
  private buildEmailHtml(apiBase: string, token: string, customerName?: string): string {
    const firstName = this.firstNameOf(customerName);
    const greeting = firstName ? `שלום ${this.esc(firstName)},` : 'שלום רב,';
    const cid = (key: string) => REVIEW_EMAIL_ASSETS[key].cid;

    const faceCells = FACES.map((f) => {
      const url = `${apiBase}/public/rate/${encodeURIComponent(token)}?r=${f.rating}`;
      const label = this.esc(f.label);
      return `        <td align="center" valign="top" style="padding:0 7px;">
          <a href="${url}" title="${label}" style="text-decoration:none;display:block;">
            <img src="cid:${cid(f.asset)}" width="62" height="62" alt="${label}" style="display:block;border:0;outline:none;margin:0 auto;">
            <span style="display:block;padding-top:8px;font-family:Arial,'Segoe UI',Helvetica,sans-serif;font-size:12px;font-weight:bold;color:${f.color};white-space:nowrap;">${label}</span>
          </a>
        </td>`;
    }).join('\n');

    return `<div dir="rtl" style="background-color:#f2f5f1;margin:0;padding:22px 10px;font-family:Arial,'Segoe UI',Helvetica,sans-serif;">
<div style="display:none;font-size:1px;color:#f2f5f1;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">דירוג מהיר בלחיצה אחת — איך הייתה חוויית השירות שקיבלת?</div>
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" align="center" style="width:100%;max-width:600px;margin:0 auto;background-color:#ffffff;border:1px solid #e4e9e1;border-radius:16px;">
  <tr>
    <td style="padding:12px 22px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td width="92" align="right" valign="middle">
            <img src="cid:${cid('logo')}" width="86" height="88" alt="גלית – החברה לאיכות הסביבה" style="display:block;border:0;outline:none;">
          </td>
          <td align="left" valign="middle">
            <img src="cid:${cid('banner')}" width="420" height="60" alt="" style="display:block;border:0;outline:none;max-width:100%;">
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:6px 26px 0;">
      <div style="font-size:21px;line-height:1.35;font-weight:bold;color:${BRAND_GREEN};">נשמח לשמוע ממך — איך היה השירות שלנו?</div>
    </td>
  </tr>
  <tr>
    <td style="padding:16px 26px 0;font-size:15px;line-height:1.75;color:#2b2f2a;">
      <p style="margin:0 0 12px;">${greeting}</p>
      <p style="margin:0 0 6px;">תודה שבחרת ב<strong style="color:${BRAND_GREEN};">גלית – החברה לאיכות הסביבה</strong>.</p>
      <p style="margin:0;">חשוב לנו מאוד לשמוע ממך איך הייתה חוויית השירות שקיבלת.</p>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:20px 26px 12px;font-size:14px;color:#4b5349;">
      נשמח אם תדרג/י אותנו בלחיצה על אחד מהאייקונים:
    </td>
  </tr>
  <tr>
    <td style="padding:0 22px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#fbfcfa;border:1px solid #e6ebe3;border-radius:14px;">
        <tr>
          <td align="center" style="padding:18px 8px 16px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
              <tr>
${faceCells}
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:20px 26px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
        <tr>
          <td valign="middle" style="font-size:13px;color:#6b7268;padding-left:10px;">המשוב שלך לוקח רגע קטן ועוזר לנו להשתפר. תודה רבה!</td>
          <td width="26" valign="middle">
            <img src="cid:${cid('leaf')}" width="26" height="26" alt="" style="display:block;border:0;outline:none;">
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:18px 26px 22px;">
      <div style="height:1px;background-color:#e6ebe3;font-size:0;line-height:0;">&nbsp;</div>
      <div style="padding-top:14px;font-size:13px;line-height:1.7;color:#5a6157;">
        בברכה,<br><strong style="color:${BRAND_GREEN};">צוות גלית – החברה לאיכות הסביבה</strong>
      </div>
    </td>
  </tr>
  <tr>
    <td style="padding:0;">
      <div style="height:5px;background-color:${BRAND_LEAF};border-radius:0 0 15px 15px;font-size:0;line-height:0;">&nbsp;</div>
    </td>
  </tr>
</table>
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
