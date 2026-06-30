import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { PdfConvertService } from './pdf-convert.service';

/**
 * "הפרופיל שלנו + רישיונות" — קובץ שיווקי קבוע שמשובץ ככפתור בגוף מייל ההצעה.
 *
 * המקור: templates/company-profile.docx (נארז לתוך תמונת ה-Docker). הוא מומר ל-PDF
 * פעם אחת ונשמר כ-Document גלובלי (customerId=null, filePath סנטינל) — כך הוא שורד
 * דפלוי (הדיסק ב-Railway זמני). הכפתור במייל מצביע אל /public/company-profile.pdf,
 * שמגיש את ה-PDF השמור גם אחרי ימים (כשללקוח אין הקשר משתמש).
 *
 * המרת ה-PDF מתבצעת בשליחת מייל ההצעה (עם ה-Outlook של השולח), ומתבצעת מחדש
 * אוטומטית אם תוכן ה-DOCX השתנה (לפי חתימת SHA-256 של המקור).
 */
@Injectable()
export class CompanyProfileService {
  private readonly logger = new Logger(CompanyProfileService.name);
  /** filePath סנטינל שמזהה את רשומת ה-Document הגלובלית (לא נתיב אמיתי). */
  private static readonly ASSET_KEY = 'app-asset:company-profile';
  private static readonly SOURCE = 'templates/company-profile.docx';
  private static readonly OUT_NAME = 'הפרופיל שלנו ורישיונות.pdf';

  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfConvert: PdfConvertService,
  ) {}

  private srcPath(): string {
    return path.resolve(process.cwd(), CompanyProfileService.SOURCE);
  }

  /** חתימת תוכן של ה-DOCX המקורי — לזיהוי שינוי תוכן ורענון ה-PDF השמור. */
  private srcSignature(): string | null {
    try {
      const buf = fs.readFileSync(this.srcPath());
      return 'src-sha256:' + createHash('sha256').update(buf).digest('hex');
    } catch {
      return null;
    }
  }

  /** ה-PDF השמור (או null אם עוד לא נוצר). */
  async getCachedPdf(): Promise<{ buffer: Buffer; fileName: string } | null> {
    const doc = await this.prisma.document.findFirst({
      where: { filePath: CompanyProfileService.ASSET_KEY },
      orderBy: { createdAt: 'desc' },
    });
    if (!doc?.dataBase64) return null;
    return {
      buffer: Buffer.from(doc.dataBase64, 'base64'),
      fileName: doc.name || CompanyProfileService.OUT_NAME,
    };
  }

  /**
   * מוודא שקיים PDF עדכני למקור. ממיר ושומר רק אם חסר/השתנה. best-effort —
   * לעולם לא זורק (כשל המרה לא יפיל את שליחת המייל). מחזיר true אם בסוף קיים PDF.
   */
  async ensurePdf(userId?: string): Promise<boolean> {
    try {
      const sig = this.srcSignature();
      if (!sig) {
        this.logger.warn(`company profile source missing at ${this.srcPath()}`);
        return !!(await this.getCachedPdf());
      }
      const existing = await this.prisma.document.findFirst({
        where: { filePath: CompanyProfileService.ASSET_KEY },
        orderBy: { createdAt: 'desc' },
      });
      // קיים ותואם לתוכן הנוכחי — אין מה לעשות.
      if (existing?.dataBase64 && existing.description === sig) return true;

      const docx = fs.readFileSync(this.srcPath());
      const pdf = await this.pdfConvert.docxToPdf(docx, 'company-profile.docx', userId);

      // החלפה אטומית-מספיק: מוחקים ישן ויוצרים חדש (רשומה גלובלית בודדת).
      await this.prisma.document.deleteMany({ where: { filePath: CompanyProfileService.ASSET_KEY } });
      await this.prisma.document.create({
        data: {
          id: randomUUID(),
          name: CompanyProfileService.OUT_NAME,
          filePath: CompanyProfileService.ASSET_KEY,
          documentType: 'OTHER' as any,
          mimeType: 'application/pdf',
          sizeBytes: pdf.length,
          dataBase64: pdf.toString('base64'),
          description: sig, // חתימת המקור — לזיהוי רענון
        },
      });
      this.logger.log('Company profile PDF (re)generated & cached');
      return true;
    } catch (e: any) {
      this.logger.warn(`ensurePdf failed: ${e?.message || e}`);
      return !!(await this.getCachedPdf().catch(() => null));
    }
  }
}
