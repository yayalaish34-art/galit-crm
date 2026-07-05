import { Body, Controller, Get, Param, Post, Query, Req, Res } from '@nestjs/common';
import { Response } from 'express';
import { QuoteSignatureService } from './quote-signature.service';

/** עמוד שגיאה ידידותי (RTL) — הלקוח מגיע לקישור מהמייל/וואטסאפ; JSON גולמי לא מובן לו. */
const ERROR_PAGE_HTML = `<!doctype html>
<html dir="rtl" lang="he"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>הקישור אינו זמין</title></head>
<body style="margin:0;font-family:Arial,Helvetica,sans-serif;background:linear-gradient(180deg,#ecfdf5,#f1f5f9);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;">
<div style="max-width:420px;background:#ffffff;border-radius:20px;box-shadow:0 8px 30px rgba(0,0,0,.08);padding:32px;text-align:center;">
<div style="font-size:44px;line-height:1;">&#9888;&#65039;</div>
<h1 style="font-size:20px;color:#0f172a;margin:14px 0 8px;">הקישור אינו זמין</h1>
<p style="font-size:14px;color:#64748b;line-height:1.7;margin:0;">ייתכן שנשלח אליכם קישור חדש ועדכני — בדקו את ההודעה האחרונה שקיבלתם מאיתנו, או צרו קשר ונשלח קישור מחדש.</p>
<div style="margin-top:20px;font-size:12px;color:#94a3b8;">גלית – החברה לאיכות הסביבה</div>
</div></body></html>`;

/**
 * נתיבים ציבוריים לחתימת לקוח על הצעת מחיר — ללא RolesGuard.
 * הטוקן (`<quoteId>~<secret>`) אינו ניתן לניחוש ומשמש כהרשאה (capability URL).
 */
@Controller('public/sign')
export class QuoteSignatureController {
  constructor(private readonly signature: QuoteSignatureService) {}

  /** מטא-דאטה לעמוד החתימה (שם ההצעה, סטטוס, האם כבר נחתם). */
  @Get(':token')
  getMeta(@Param('token') token: string) {
    return this.signature.getForSigning(token);
  }

  /** ה-PDF להצגה/הורדה. btn=1 — צורב על-הדרך את כפתור "לחץ כאן לחתימה".
   *  כפתור "ההסמכות שלנו ופרופיל החברה" נצרב תמיד (גם ללא btn), בסוף המסמך. */
  @Get(':token/pdf')
  async getPdf(@Param('token') token: string, @Query('btn') btn: string, @Req() req: any, @Res() res: Response) {
    try {
      const apiBase = (process.env.PUBLIC_API_URL || (req?.headers?.host ? `https://${req.headers.host}` : '')).replace(/\/+$/, '');
      const { buffer, fileName } = await this.signature.getPdf(token, {
        withButton: btn === '1',
        profileUrl: apiBase ? `${apiBase}/public/company-profile.pdf` : undefined,
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
      // אותה כתובת מגישה את הלא-חתום לפני החתימה ואת החתום אחריה — בלי זה דפדפני מובייל
      // (בעיקר כרום באנדרואיד) מגישים מה-cache את העותק הלא-חתום גם אחרי החתימה.
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.send(buffer);
    } catch {
      // קישור מת/לא תקין → עמוד שגיאה מעוצב במקום JSON גולמי.
      res.status(404).setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(ERROR_PAGE_HTML);
    }
  }

  /** הלקוח שלח בלוק חתימה (PNG data-URL) + פרטי החותם. */
  @Post(':token')
  submit(
    @Param('token') token: string,
    @Body()
    body: {
      signature?: string;
      signer?: { fullName?: string; idNumber?: string; companyName?: string; role?: string };
    },
  ) {
    return this.signature.submitSignature(token, body?.signature || '', body?.signer);
  }
}
