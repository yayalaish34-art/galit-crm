import { Controller, Get, Post, Param, Query, Body, Res, NotFoundException } from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { ReviewRequestService } from '../reviews/review-request.service';

/**
 * נתיבים ציבוריים (ללא RolesGuard) — לשיתוף קבצים בקישור ישיר (capability URL)
 * וקליטת דירוגי לקוחות ממייל בקשת הדירוג (5 הפרצופים).
 * המזהה/הטוקן הוא UUID לא-ניחוש, כך שהקישור משמש כהרשאה.
 */
@Controller('public')
export class PublicController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reviews: ReviewRequestService,
  ) {}

  private async sendAttachment(id: string, res: Response) {
    const att = await this.prisma.taskAttachment.findUnique({ where: { id } });
    if (!att) throw new NotFoundException('Attachment not found');
    // שם ההורדה תמיד נלקח מהשם השמור (יפה, בעברית) — ללא תלות בכתובת
    res.setHeader('Content-Type', att.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(att.fileName)}"`);
    res.send(Buffer.from(att.data));
  }

  /** הורדת קובץ מצורף של משימה לפי מזהה */
  @Get('attachments/:id')
  async getAttachment(@Param('id') id: string, @Res() res: Response) {
    await this.sendAttachment(id, res);
  }

  /**
   * אותו דבר, עם סיומת שם-קובץ בכתובת לקריאוּת בלבד (למשל ".../price-quote.docx").
   * שם ההורדה בפועל נקבע מהשם השמור.
   */
  @Get('attachments/:id/:filename')
  async getAttachmentNamed(@Param('id') id: string, @Res() res: Response) {
    await this.sendAttachment(id, res);
  }

  // ───────────────────────── דירוג לקוח (5 פרצופים) ─────────────────────────

  /**
   * GET /public/rate/:token?r=<1..5>
   * נקלט כשהלקוח לוחץ על פרצוף במייל בקשת הדירוג.
   * שומר את הדירוג, ואז:
   *   דירוג 4-5 → redirect לדף הביקורות בגוגל.
   *   דירוג 1-3 → מציג דף משוב/התנצלות פנימי (עם אפשרות להשאיר הערה).
   */
  @Get('rate/:token')
  async rate(
    @Param('token') token: string,
    @Query('r') r: string,
    @Res() res: Response,
  ) {
    const rating = Math.max(1, Math.min(5, parseInt(String(r), 10) || 0));
    const rr = await this.prisma.reviewRequest.findUnique({ where: { token } });
    if (!rr) {
      res.status(404).type('html').send(this.pageShell('קישור לא תקין', '<p>הקישור אינו תקין או שפג תוקפו.</p>'));
      return;
    }

    // שומרים את הדירוג הראשון בלבד (לחיצה חוזרת לא דורסת — אבל תמיד מפנים לפי הבחירה הנוכחית).
    if (rating >= 1 && !rr.rating) {
      await this.prisma.reviewRequest
        .update({ where: { token }, data: { rating, ratedAt: new Date() } })
        .catch(() => null);
    }

    if (rating >= 4) {
      const googleUrl = await this.reviews.getGoogleReviewUrl();
      res.redirect(302, googleUrl);
      return;
    }

    // דירוג נמוך — דף משוב/התנצלות.
    res.type('html').send(this.feedbackPage(token, rr.customerName));
  }

  /**
   * POST /public/rate/:token/feedback  { feedback }
   * שמירת המשוב החופשי שהלקוח כתב בדף הדירוג הנמוך. מציג דף "תודה".
   */
  @Post('rate/:token/feedback')
  async submitFeedback(
    @Param('token') token: string,
    @Body('feedback') feedback: string,
    @Res() res: Response,
  ) {
    const rr = await this.prisma.reviewRequest.findUnique({ where: { token } });
    if (!rr) {
      res.status(404).type('html').send(this.pageShell('קישור לא תקין', '<p>הקישור אינו תקין או שפג תוקפו.</p>'));
      return;
    }
    const text = String(feedback || '').trim().slice(0, 4000);
    if (text) {
      await this.prisma.reviewRequest
        .update({ where: { token }, data: { feedback: text, feedbackAt: new Date() } })
        .catch(() => null);
    }
    res.type('html').send(this.thanksAfterFeedbackPage());
  }

  // ── תבניות HTML (עצמאיות, מוגשות מה-API — ללא תלות ב-frontend) ──

  /** מעטפת עמוד בסיסית — RTL, מרוכזת, נעימה למובייל. */
  private pageShell(title: string, inner: string): string {
    return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${this.esc(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
    background:#f4f6f8; font-family:Arial,'Segoe UI',sans-serif; color:#1a1a1a; padding:20px; }
  .card { background:#fff; border-radius:16px; box-shadow:0 8px 30px rgba(0,0,0,.08);
    max-width:460px; width:100%; padding:32px 28px; text-align:center; }
  h1 { font-size:22px; margin:0 0 12px; color:#0d5c63; }
  p { font-size:15px; line-height:1.7; color:#333; margin:0 0 12px; }
  textarea { width:100%; min-height:120px; border:1px solid #d0d7de; border-radius:10px;
    padding:12px; font-family:inherit; font-size:14px; resize:vertical; margin:8px 0 16px; }
  button { background:#0d5c63; color:#fff; border:0; border-radius:10px; padding:12px 26px;
    font-size:15px; font-weight:600; cursor:pointer; }
  button:hover { background:#0a4a50; }
  .brand { margin-top:22px; font-size:12px; color:#999; }
</style>
</head>
<body>
  <div class="card">
    ${inner}
    <div class="brand">גלית – החברה לאיכות הסביבה</div>
  </div>
</body>
</html>`;
  }

  /** דף דירוג נמוך — התנצלות + טופס משוב חופשי. */
  private feedbackPage(token: string, customerName?: string | null): string {
    const firstName = String(customerName || '').trim().split(/\s+/)[0] || '';
    const hello = firstName ? `${this.esc(firstName)}, ` : '';
    const inner = `
    <div style="font-size:44px;line-height:1;margin-bottom:10px;">🙏</div>
    <h1>${hello}תודה על המשוב הכן</h1>
    <p>אנחנו מצטערים לשמוע שהשירות לא עמד בציפיות שלך.</p>
    <p>המשוב שלך חשוב לנו מאוד ויעזור לנו להשתפר. נשמח אם תשתף/י אותנו במה שאפשר לעשות טוב יותר:</p>
    <form method="post" action="/public/rate/${encodeURIComponent(token)}/feedback">
      <textarea name="feedback" placeholder="ספר/י לנו מה קרה, ומה נוכל לשפר…"></textarea>
      <button type="submit">שליחת המשוב</button>
    </form>`;
    return this.pageShell('תודה על המשוב', inner);
  }

  /** דף תודה אחרי שליחת משוב. */
  private thanksAfterFeedbackPage(): string {
    const inner = `
    <div style="font-size:44px;line-height:1;margin-bottom:10px;">💚</div>
    <h1>המשוב נשלח — תודה!</h1>
    <p>תודה שהקדשת מזמנך. קיבלנו את המשוב שלך ונטפל בו באחריות מלאה כדי להשתפר.</p>`;
    return this.pageShell('המשוב נשלח', inner);
  }

  private esc(s: string): string {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}
