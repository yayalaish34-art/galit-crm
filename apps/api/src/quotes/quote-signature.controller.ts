import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { QuoteSignatureService } from './quote-signature.service';

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

  /** ה-PDF להצגה בעמוד החתימה (inline). */
  @Get(':token/pdf')
  async getPdf(@Param('token') token: string, @Res() res: Response) {
    const { buffer, fileName } = await this.signature.getPdf(token);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
    // אותה כתובת מגישה את הלא-חתום לפני החתימה ואת החתום אחריה — בלי זה דפדפני מובייל
    // (בעיקר כרום באנדרואיד) מגישים מה-cache את העותק הלא-חתום גם אחרי החתימה.
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.send(buffer);
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
