import { Injectable, Logger } from '@nestjs/common';
import { MicrosoftAuthService } from './microsoft-auth.service';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const GRAPH = 'https://graph.microsoft.com/v1.0';

/**
 * אחסון DOCX הניתן-לעריכה ב-OneDrive של המשתמש, לעריכה ב-Word עם שמירה-חזרה אוטומטית.
 *
 * בניגוד ל-GraphPdfService (קבצים זמניים שנמחקים מיד אחרי המרה) — כאן הקובץ נשאר ב-OneDrive
 * כל עוד ההצעה פעילה. כך המשתמש פותח אותו ב-Word (דפדפן/דסקטופ), עורך, שומר — והשמירה
 * חוזרת אוטומטית ל-OneDrive. בזמן השליחה המערכת מושכת את הגרסה העדכנית מ-OneDrive.
 *
 * דורש הרשאת Files.ReadWrite (delegated) — כבר נכללת ב-MicrosoftAuthService.SCOPES.
 */
@Injectable()
export class GraphFilesService {
  private readonly logger = new Logger(GraphFilesService.name);
  /** תיקיית העבודה הקבועה ב-OneDrive של המשתמש (הצעות מחיר לעריכה — לא נמחקת). */
  private static readonly FOLDER = 'CRM-Quotes';

  constructor(private readonly auth: MicrosoftAuthService) {}

  /** האם אינטגרציית Graph מוגדרת ברמת השרת (לא בודק חיבור משתמש ספציפי). */
  get configured(): boolean {
    return !!process.env.GRAPH_CLIENT_ID && !!process.env.GRAPH_CLIENT_SECRET;
  }

  /**
   * מעלה DOCX ל-OneDrive (יוצר חדש או דורס קיים באותו שם) ומחזיר מזהה פריט + כתובת צפייה/עריכה.
   * שים לב: יש לקרוא לזה רק כשרוצים להחליף את הקובץ — לא לפני כל עריכה (אחרת נדרוס שינויי המשתמש).
   */
  async uploadEditable(
    userId: string,
    fileName: string,
    docx: Buffer,
  ): Promise<{ itemId: string; webUrl: string; webDavUrl: string; name: string }> {
    const token = await this.auth.getAccessToken(userId);
    const safe =
      (fileName.replace(/\.docx$/i, '') || 'quote').replace(/[^A-Za-z0-9._\-א-ת ]+/g, '_').trim().slice(0, 120) ||
      'quote';
    const relPath = `${GraphFilesService.FOLDER}/${safe}.docx`;

    const res = await fetch(`${GRAPH}/me/drive/root:/${encodeURI(relPath)}:/content`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': DOCX_MIME },
      body: new Uint8Array(docx),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`OneDrive upload failed: ${res.status} ${t.slice(0, 200)}`);
    }
    const item: any = await res.json();
    if (!item?.id) throw new Error('OneDrive upload: missing item id');
    // webDavUrl = הנתיב הישיר לקובץ ש-Word דסקטופ פותח (ms-word:ofe). webUrl הוא דף תצוגה (Doc.aspx).
    return { itemId: item.id, webUrl: item.webUrl, webDavUrl: item.webDavUrl, name: item.name };
  }

  /** מטא-דאטה של פריט (כולל webUrl/webDavUrl + תאריך שינוי אחרון). מחזיר null אם הפריט נמחק/לא נמצא. */
  async getItem(
    userId: string,
    itemId: string,
  ): Promise<{ itemId: string; webUrl: string; webDavUrl: string; name: string; lastModified: string } | null> {
    const token = await this.auth.getAccessToken(userId);
    const res = await fetch(
      `${GRAPH}/me/drive/items/${itemId}?$select=id,name,webUrl,webDavUrl,lastModifiedDateTime`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (res.status === 404) return null;
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`OneDrive getItem failed: ${res.status} ${t.slice(0, 200)}`);
    }
    const item: any = await res.json();
    return { itemId: item.id, webUrl: item.webUrl, webDavUrl: item.webDavUrl, name: item.name, lastModified: item.lastModifiedDateTime };
  }

  /**
   * מוריד את התוכן העדכני של הקובץ מ-OneDrive (הגרסה שנערכה ונשמרה ב-Word).
   * Graph מחזיר בד"כ 302 לכתובת אחסון מאומתת-מראש — מפנים אליה ללא כותרת Authorization.
   */
  async downloadContent(userId: string, itemId: string): Promise<Buffer> {
    const token = await this.auth.getAccessToken(userId);
    const res = await fetch(`${GRAPH}/me/drive/items/${itemId}/content`, {
      headers: { Authorization: `Bearer ${token}` },
      redirect: 'manual',
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) throw new Error('OneDrive download: redirect without Location');
      const r2 = await fetch(loc); // כתובת מאומתת-מראש — בלי Authorization
      if (!r2.ok) throw new Error(`OneDrive download (redirect) failed: ${r2.status}`);
      return Buffer.from(await r2.arrayBuffer());
    }
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    const t = await res.text().catch(() => '');
    throw new Error(`OneDrive download failed: ${res.status} ${t.slice(0, 200)}`);
  }
}
