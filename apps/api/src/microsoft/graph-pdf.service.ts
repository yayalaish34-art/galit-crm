import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { MicrosoftAuthService } from './microsoft-auth.service';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const GRAPH = 'https://graph.microsoft.com/v1.0';

/**
 * המרת DOCX ל-PDF דרך Microsoft Graph (מנוע ה-render של Office עצמו — זהה ל-Word Online).
 *
 * למה זה עדיף על CloudConvert/LibreOffice: ה-PDF נוצר על-ידי Word עצמו, ולכן הכותרת,
 * הפונטים, ה-RTL והפריסה יוצאים זהים לתבנית — בלי "סחיפת עיצוב" של מנוע render אחר.
 *
 * תהליך: העלאת ה-DOCX ל-OneDrive של המשתמש (קובץ זמני) → הורדה חזרה בפורמט PDF → מחיקת הקובץ הזמני.
 * דורש הרשאת Files.ReadWrite (delegated). ההרשאה התווספה לאחר ה-scopes הקיימים, ולכן כל משתמש
 * חייב להתחבר-מחדש פעם אחת כדי לאשר אותה (ראה microsoft-auth.service.ts). עד אז ההמרה תיכשל
 * וה-orchestrator (PdfConvertService) ייפול חזרה ל-CloudConvert.
 */
@Injectable()
export class GraphPdfService {
  private readonly logger = new Logger(GraphPdfService.name);
  /** תיקיית עבודה ב-OneDrive של המשתמש (קבצים זמניים בלבד — נמחקים מיד אחרי ההמרה). */
  private static readonly TEMP_FOLDER = 'CRM-PDF-Temp';

  constructor(private readonly auth: MicrosoftAuthService) {}

  /** האם אינטגרציית Graph מוגדרת ברמת השרת (לא בודק חיבור משתמש ספציפי). */
  get configured(): boolean {
    return !!process.env.GRAPH_CLIENT_ID && !!process.env.GRAPH_CLIENT_SECRET;
  }

  /**
   * ממיר DOCX ל-PDF דרך ה-OneDrive של המשתמש. מחזיר את ה-buffer של ה-PDF.
   * זורק אם המשתמש אינו מחובר / חסרה הרשאת Files.ReadWrite / אין לו OneDrive / ההמרה נכשלה —
   * המתקשר אחראי על fallback.
   */
  async docxToPdf(userId: string, docx: Buffer, fileName = 'document.docx'): Promise<Buffer> {
    const token = await this.auth.getAccessToken(userId);

    // שם זמני בטוח-URL וייחודי (נמנע מהתנגשויות בין המרות מקבילות; השם הסופי נקבע ע"י המתקשר).
    const base = fileName.replace(/\.docx$/i, '').replace(/[^A-Za-z0-9._-]+/g, '_') || 'quote';
    const tempPath = `${GraphPdfService.TEMP_FOLDER}/${base}-${crypto.randomUUID()}.docx`;

    let itemId: string | null = null;
    try {
      // 1) העלאת ה-DOCX (PUT פשוט — הצעות מחיר קטנות, הרבה מתחת לגבול ה-4MB).
      const upRes = await fetch(`${GRAPH}/me/drive/root:/${encodeURI(tempPath)}:/content`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': DOCX_MIME },
        body: new Uint8Array(docx),
      });
      if (!upRes.ok) {
        const t = await upRes.text().catch(() => '');
        throw new Error(`Graph upload failed: ${upRes.status} ${t.slice(0, 200)}`);
      }
      const item: any = await upRes.json();
      itemId = item?.id ?? null;
      if (!itemId) throw new Error('Graph upload: missing item id');

      // 2) הורדה בפורמט PDF. Graph מחזיר 302 אל כתובת הורדה מאומתת-מראש (storage).
      //    redirect:'manual' — כדי שנפנה לכתובת היעד ללא כותרת Authorization (אחרת היא עלולה להידחות).
      const dl = await fetch(`${GRAPH}/me/drive/items/${itemId}/content?format=pdf`, {
        headers: { Authorization: `Bearer ${token}` },
        redirect: 'manual',
      });

      if (dl.status >= 300 && dl.status < 400) {
        const loc = dl.headers.get('location');
        if (!loc) throw new Error('Graph PDF: redirect without Location');
        const pdfRes = await fetch(loc); // כתובת מאומתת-מראש — בלי Authorization
        if (!pdfRes.ok) throw new Error(`Graph PDF download failed: ${pdfRes.status}`);
        return Buffer.from(await pdfRes.arrayBuffer());
      }
      if (dl.ok) {
        // מקרה נדיר: Graph החזיר את ה-PDF ישירות בלי redirect.
        return Buffer.from(await dl.arrayBuffer());
      }
      const t = await dl.text().catch(() => '');
      throw new Error(`Graph PDF convert failed: ${dl.status} ${t.slice(0, 200)}`);
    } finally {
      // 3) ניקוי הקובץ הזמני (best-effort — לא חוסם/מפיל את ההמרה אם המחיקה נכשלה).
      if (itemId) {
        await fetch(`${GRAPH}/me/drive/items/${itemId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }).catch((e) => this.logger.warn(`temp cleanup failed for ${itemId}: ${e?.message || e}`));
      }
    }
  }
}
