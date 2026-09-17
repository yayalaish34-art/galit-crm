import { Controller, Get, Post, Param, Query, Body, Req, Res, NotFoundException, ForbiddenException, UseInterceptors, UploadedFiles, Logger } from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { ReviewRequestService } from '../reviews/review-request.service';
import { CallRecordingsService } from '../call-recordings/call-recordings.service';

/**
 * נתיבים ציבוריים (ללא RolesGuard) — לשיתוף קבצים בקישור ישיר (capability URL)
 * וקליטת דירוגי לקוחות ממייל בקשת הדירוג (5 הפרצופים).
 * המזהה/הטוקן הוא UUID לא-ניחוש, כך שהקישור משמש כהרשאה.
 */
@Controller('public')
export class PublicController {
  private readonly logger = new Logger(PublicController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reviews: ReviewRequestService,
    private readonly calls: CallRecordingsService,
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
    // ההערה חובה — אם ריקה/קצרה מדי, חוזרים לדף המשוב עם שגיאה במקום להציג "תודה".
    if (text.length < 5) {
      res
        .status(400)
        .type('html')
        .send(this.feedbackPage(token, rr.customerName, 'יש לכתוב הערה (לפחות 5 תווים) לפני השליחה.', text));
      return;
    }
    await this.prisma.reviewRequest
      .update({ where: { token }, data: { feedback: text, feedbackAt: new Date() } })
      .catch(() => null);
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

  /** דף דירוג נמוך — התנצלות + טופס משוב חופשי. ההערה חובה (מינימום 5 תווים).
   *  errorMsg / prevText מוצגים כשחוזרים מהשרת לאחר ניסיון שליחה ריק. */
  private feedbackPage(token: string, customerName?: string | null, errorMsg?: string, prevText?: string): string {
    const firstName = String(customerName || '').trim().split(/\s+/)[0] || '';
    const hello = firstName ? `${this.esc(firstName)}, ` : '';
    const errBlock = errorMsg
      ? `<p style="color:#c0392b;font-weight:600;margin:0 0 10px;">${this.esc(errorMsg)}</p>`
      : '';
    const inner = `
    <div style="font-size:44px;line-height:1;margin-bottom:10px;">🙏</div>
    <h1>${hello}תודה על המשוב הכן</h1>
    <p>אנחנו מצטערים לשמוע שהשירות לא עמד בציפיות שלך.</p>
    <p>המשוב שלך חשוב לנו מאוד ויעזור לנו להשתפר. <strong>נשמח שתפרט/י מה קרה ומה נוכל לשפר — זו הערת חובה:</strong></p>
    ${errBlock}
    <form method="post" action="/public/rate/${encodeURIComponent(token)}/feedback" onsubmit="return validateFb(this)">
      <textarea name="feedback" required minlength="5" aria-required="true"
        placeholder="ספר/י לנו מה קרה, ומה נוכל לשפר… (חובה)">${this.esc(prevText || '')}</textarea>
      <div id="fbErr" style="display:none;color:#c0392b;font-size:13px;font-weight:600;text-align:right;margin:-8px 0 12px;">יש לכתוב הערה (לפחות 5 תווים) לפני השליחה.</div>
      <button type="submit">שליחת המשוב</button>
    </form>
    <script>
      function validateFb(f){
        var t=(f.feedback.value||'').trim();
        var e=document.getElementById('fbErr');
        if(t.length<5){ e.style.display='block'; f.feedback.focus(); return false; }
        e.style.display='none'; return true;
      }
    </script>`;
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

  // ───────────────────────── Webhook שיחות מהמרכזייה ─────────────────────────

  /**
   * GET/POST /public/call-webhook?key=<טוקן>&call_id=…&from_phone=…&direction=…
   *
   * המרכזייה (CloudPlus/BlueBe, סעיף 1.9 — ALERTs) שולחת לכאן על כל שיחה. זה
   * הנתיב הציבורי היחיד ההגיוני עבורה: למרכזייה אין JWT של המערכת, ולכן היא לא
   * יכולה לעבור דרך RolesGuard. במקום זאת היא מאומתת ב-`key` שמוגדר במרכזייה
   * ומושווה ל-CLOUDPLUS_TOKEN — בלי טוקן תואם, הבקשה נדחית ב-403.
   *
   * שתי השיטות (GET ו-POST) כי מרכזיות שונות שולחות אחרת, והמסמך מתיר את שתיהן.
   */
  @Get('call-webhook')
  async callWebhookGet(@Query() q: Record<string, string>) {
    // קישור הקלטה יכול להגיע גם ב-GET (query) — ר' extractRecordingAudio; לא רק
    // ב-POST. בלי זה, ALERT עם קישור שמגיע כ-GET היה מתעלם לגמרי מההקלטה.
    const audio = await this.extractRecordingAudio(q);
    return this.handleCallWebhook(q, audio);
  }

  /**
   * הורדת ההקלטה (סעיף 1.8) דורשת session מחובר למרכזייה — וזה נכשל אצלנו
   * (ראה CallRecordingsService/CloudPlusClient). לכן הנתיב הזה מקבל גם, כאופציה,
   * את קובץ ההקלטה עצמו מצורף ישירות לוובהוק — אם המרכזייה תוגדר לצרף אותו
   * (multipart, שדה recording_base64/audio_base64, או recording_url ציבורי בלי
   * אימות) אנחנו מתמללים ישר מהקובץ שצורף ומדלגים לגמרי על ההורדה המאומתת.
   */
  @Post('call-webhook')
  @UseInterceptors(AnyFilesInterceptor())
  async callWebhookPost(
    @Query() q: Record<string, string>,
    @Body() body: Record<string, string>,
    @UploadedFiles() files?: Array<{ buffer: Buffer; mimetype?: string }>,
  ) {
    // הפרמטרים עשויים להגיע ב-query או בגוף — ממזגים, גוף גובר.
    const params = { ...q, ...(body || {}) };
    const audio = await this.extractRecordingAudio(params, files);
    return this.handleCallWebhook(params, audio);
  }

  /**
   * מחלץ את בתי האודיו מהוובהוק, אם צורפו — בשלוש הצורות הסבירות שמרכזייה
   * עשויה לתמוך בהן: קובץ multipart, שדה base64, או קישור ציבורי בלי אימות.
   *
   * גלית אישרה (2026-09-16) שאצל CloudPlus זו הדרך השלישית — הם פשוט שולחים
   * קישור, לא קובץ מצורף — אבל שם השדה המדויק עדיין לא ידוע (ה-webhooks
   * שנתפסו עד כה הם רק אירועי התחלה/סוף שיחה, בלי קישור הקלטה). לכן מנחשים
   * כמה שמות סבירים, ואם אף אחד לא תאם — נופלים חזרה לכל ערך בפרמטרים
   * שנראה כמו URL http(s). ברגע שמגיע webhook אמיתי עם קישור, השורה
   * `call-webhook: accepted {...}` בלוג מדפיסה את כל הפרמטרים כפי שהתקבלו,
   * כך שאפשר לאשר את שם השדה האמיתי ולצמצם את הניחוש בהמשך.
   */
  private async extractRecordingAudio(
    params: Record<string, string>,
    files?: Array<{ buffer: Buffer; mimetype?: string }>,
  ): Promise<{ bytes: Buffer; contentType: string } | undefined> {
    if (files?.length) {
      const f = files[0];
      if (f.buffer?.length) return { bytes: f.buffer, contentType: f.mimetype || 'audio/wav' };
    }
    const b64 = params.recording_base64 || params.audio_base64;
    if (b64) {
      try {
        const bytes = Buffer.from(b64, 'base64');
        if (bytes.length) return { bytes, contentType: 'audio/wav' };
      } catch {
        // התעלמות — ממשיכים לנסות דרכים אחרות.
      }
    }

    const isUrl = (v: unknown): v is string => typeof v === 'string' && /^https?:\/\/\S+$/i.test(v.trim());
    const namedGuesses = [
      params.recording_url,
      params.record_url,
      params.recording,
      params.record,
      params.audio_url,
      params.file_url,
      params.file,
      params.url,
      params.link,
    ].filter(isUrl);
    // שם השדה לא ידוע — נופלים חזרה לכל ערך שנראה כמו URL, כדי לא לפספס קישור
    // תחת שם שלא ניחשנו.
    if (!namedGuesses.length) {
      const anyUrlValue = Object.values(params).find(isUrl);
      if (anyUrlValue) namedGuesses.push(anyUrlValue);
    }

    for (const url of namedGuesses) {
      try {
        const res = await fetch(url.trim());
        if (res.ok) {
          const bytes = Buffer.from(await res.arrayBuffer());
          if (bytes.length) return { bytes, contentType: res.headers.get('content-type') || 'audio/wav' };
        }
      } catch {
        // קישור לא זמין/לא תקין — ממשיכים לנסות מועמד אחר, ולא חוסמים את קליטת השיחה.
      }
    }
    return undefined;
  }

  private async handleCallWebhook(
    params: Record<string, string>,
    audio?: { bytes: Buffer; contentType: string },
  ) {
    // אימות הוחזר (17.9) אחרי שהתברר למה ה-key נדחה: BlueBe מדביקים את הפרמטר
    // הראשון שלהם ישר אחרי הטוקן בלי `&` (`key=<TOKEN>?BillableSeconds=...`),
    // וverifyWebhookKey תוקן להשוות קידומת (startsWith) ולא שוויון מלא — ראה
    // [[call-recordings-cloudplus]]. עד הרגע הזה הנתיב היה פתוח לגמרי לפי בקשה
    // מפורשת (2026-09-16) כדי לא לחסום ALERTs אמיתיים בזמן האבחון.
    if (!this.calls.verifyWebhookKey(params.key)) {
      this.logger.warn(`call-webhook: rejected, key mismatch. received=${JSON.stringify(params)}`);
      // הודעה כללית בכוונה — לא רומזים אם הטוקן קרוב או לא מוגדר.
      throw new ForbiddenException('unauthorized');
    }
    this.logger.log(`call-webhook: accepted ${JSON.stringify(params)}`);
    return this.calls.ingestWebhook(params, audio);
  }
}
