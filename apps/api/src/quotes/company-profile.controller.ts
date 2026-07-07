import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { CompanyProfileService } from './company-profile.service';

/**
 * נתיב ציבורי (ללא RolesGuard) — מגיש את "הפרופיל שלנו + רישיונות" כ-PDF.
 * משמש ככפתור בגוף מייל ההצעה. ה-PDF נוצר ונשמר ב-DB בשליחת המייל הראשונה;
 * אם עדיין לא נוצר — ניסיון יצירה עצלה כאן (CloudConvert, ללא הקשר משתמש).
 */
@Controller('public')
export class CompanyProfileController {
  constructor(private readonly profile: CompanyProfileService) {}

  @Get('company-profile.pdf')
  async get(@Res() res: Response) {
    // ensurePdf תמיד — הוא זול (בודק חתימת SHA של המקור) ומרענן רק אם התוכן ב-templates
    // השתנה. כך החלפת הקובץ ב-templates/company-profile.pdf משתקפת מיד, בלי להמתין לשליחת מייל.
    await this.profile.ensurePdf();
    const asset = await this.profile.getCachedPdf();
    if (!asset) {
      res.status(404).send('הפרופיל אינו זמין כרגע');
      return;
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="company-profile.pdf"');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(asset.buffer);
  }
}
