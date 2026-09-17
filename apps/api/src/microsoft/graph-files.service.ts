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
   * אורך השם המרבי שנכתב ל-OneDrive.
   *
   * היה 120, וזה היה גבוה מדי: SharePoint החזיר 423 "resourceLocked" על שם באורך 110
   * בתיקיית CRM-Quotes — כשהקובץ עצמו לא היה קיים כלל (GET החזיר 404), כלומר לא הייתה
   * שום נעילה. אותו תוכן בדיוק נכתב בהצלחה אחרי קיצור השם.
   *
   * שמות הדוחות בפועל חורגים מזה בקלות ("סקר בטיחות קרינה אלקטרומגנטית (אל מג) בתדירויות
   * רשת החשמל בבית ספר חינוך מיוחד גבעת שמואל - סימוכין 2609010003" = 110 תווים), ולכן
   * זה לא מקרה קצה אלא מסלול רגיל.
   */
  private static readonly MAX_NAME = 90;

  /**
   * שם קובץ בטוח לכתיבה ל-OneDrive: ניקוי תווים אסורים וקיצור לאורך המותר.
   *
   * מרוכז כאן כדי שההעלאה ושינוי-השם יסכימו על אותו שם. כשהם נגזרו בנפרד, שינוי שם
   * יכול היה לייצר שם שההעלאה לא הייתה מייצרת לעולם — ומכאן פריטים כפולים.
   */
  private static safeName(fileName: string, max = GraphFilesService.MAX_NAME): string {
    return (
      (fileName.replace(/\.docx$/i, '') || 'quote')
        .replace(/[^A-Za-z0-9._\-א-ת ]+/g, '_')
        .trim()
        .slice(0, max)
        .trim() || 'quote'
    );
  }

  /**
   * מעלה DOCX ל-OneDrive (יוצר חדש או דורס קיים באותו שם) ומחזיר מזהה פריט + כתובת צפייה/עריכה.
   * שים לב: יש לקרוא לזה רק כשרוצים להחליף את הקובץ — לא לפני כל עריכה (אחרת נדרוס שינויי המשתמש).
   *
   * הנתיב נגזר משם הקובץ, ולכן שני מסמכים באותו שם נכתבים לאותו פריט.
   *
   * SharePoint מחזיר 423 "resourceLocked" גם על שמות ארוכים — לא רק על קובץ שפתוח
   * ב-Word. זה נבדק מול הדרייב עצמו: שם של 110 תווים החזיר 423 בעוד ש-GET על אותו
   * נתיב החזיר 404 (כלומר הקובץ בכלל לא קיים — אין מה לנעול), ואותו תוכן בדיוק נכתב
   * בהצלחה כשקיצרנו את השם. זו הסיבה שסגירת Word לא עזרה: לא הייתה שם נעילה מלכתחילה.
   *
   * לכן הניסיון החוזר **מקצר** את השם ולא מאריך אותו. חותמת זמן, שהייתה הניסיון
   * הראשון כאן, דוחפת בדיוק לכיוון הלא נכון — שם ארוך יותר נכשל שוב.
   *
   * 120 תווים היה הגבול שנבחר במקור והוא גבוה מדי בפועל; 90 עובר בכל המקרים שנבדקו
   * ועדיין נשאר שם שאפשר לזהות בתיקייה.
   */
  async uploadEditable(
    userId: string,
    fileName: string,
    docx: Buffer,
  ): Promise<{ itemId: string; webUrl: string; webDavUrl: string; name: string }> {
    const token = await this.auth.getFilesAccessToken(userId);
    const safe = GraphFilesService.safeName(fileName);

    const put = async (base: string) => {
      const relPath = `${GraphFilesService.FOLDER}/${base}.docx`;
      return fetch(`${GRAPH}/me/drive/root:/${encodeURI(relPath)}:/content`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': DOCX_MIME },
        body: new Uint8Array(docx),
      });
    };

    let res = await put(safe);

    /*
     * 423 על שם שכבר קוצר ל-90 הוא כמעט תמיד קובץ שבאמת פתוח ב-Word, אבל לא תמיד —
     * ולשני המקרים יש אותו פתרון ראשון: לנסות שם קצר יותר וייחודי. 409 הוא התנגשות
     * על אותו נתיב, ומטופל זהה.
     *
     * הקיצור ל-60 מותיר מקום לחותמת הזמן בלי לחזור ולחצות את הגבול — הוספת חותמת
     * לשם באורך מלא הייתה מאריכה אותו וחוזרת ונכשלת מאותה סיבה.
     */
    if (res.status === 423 || res.status === 409) {
      const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
      const shorter = `${safe.slice(0, 60).trim()} ${stamp}`;
      this.logger.warn(
        `OneDrive: "${safe}.docx" נדחה (${res.status}) — מנסים בשם קצר יותר: "${shorter}.docx"`,
      );
      res = await put(shorter);
    }

    if (!res.ok) {
      const t = await res.text().catch(() => '');
      /*
       * 423 ששרד גם את הניסיון הקצר. שתי סיבות אפשריות ל-423 ולשתיהן הודעה אחת
       * שאומרת את שתיהן, כי מבחוץ אי אפשר להבחין ביניהן: או שהקובץ פתוח ב-Word,
       * או ש-SharePoint דוחה את השם עצמו.
       */
      if (res.status === 423) {
        throw new Error(
          'OneDrive דחה את הקובץ (423). אם המסמך פתוח ב-Word — סגרו אותו ונסו שוב; ' +
            'אחרת קצרו את שם הדוח (שמות ארוכים נדחים ע"י SharePoint) ונסו שנית.',
        );
      }
      throw new Error(`OneDrive upload failed: ${res.status} ${t.slice(0, 200)}`);
    }
    const item: any = await res.json();
    if (!item?.id) throw new Error('OneDrive upload: missing item id');
    // webDavUrl = הנתיב הישיר לקובץ ש-Word דסקטופ פותח (ms-word:ofe). webUrl הוא דף תצוגה (Doc.aspx).
    // תגובת ה-PUT לרוב לא כוללת webDavUrl (SharePoint/OneDrive-Business) — בלעדיו "ערוך בוורד" נופל
    // לכתובת Doc.aspx ש-Word לא יכול לפתוח. לכן מושכים את הפריט, ואם עדיין ריק — בונים נתיב ישיר.
    let webDavUrl: string = item.webDavUrl || '';
    if (!webDavUrl) {
      try {
        const got = await this.getItem(userId, item.id);
        webDavUrl = got?.webDavUrl || '';
      } catch { /* ignore — ניפול ל-derive */ }
    }
    if (!webDavUrl) webDavUrl = this.deriveWebDavUrl({ webUrl: item.webUrl, name: item.name });
    return { itemId: item.id, webUrl: item.webUrl, webDavUrl, name: item.name };
  }

  /**
   * בונה נתיב WebDAV ישיר לקובץ מתוך כתובת ה-Doc.aspx (כשה-Graph לא מחזיר webDavUrl).
   * ב-OneDrive-for-Business הנתיב הוא: {אתר אישי}/Documents/{תיקייה}/{שם קובץ}.
   */
  private deriveWebDavUrl(item: { webDavUrl?: string | null; webUrl?: string | null; name?: string | null }): string {
    if (item.webDavUrl) return item.webDavUrl;
    const webUrl = item.webUrl || '';
    const name = item.name || '';
    if (webUrl && name && webUrl.includes('/_layouts/')) {
      const base = webUrl.split('/_layouts/')[0].replace(/\/+$/, '');
      if (/sharepoint\.com/.test(base)) {
        return `${base}/Documents/${GraphFilesService.FOLDER}/${name}`;
      }
    }
    return '';
  }

  /** מטא-דאטה של פריט (כולל webUrl/webDavUrl + תאריך שינוי אחרון). מחזיר null אם הפריט נמחק/לא נמצא. */
  async getItem(
    userId: string,
    itemId: string,
  ): Promise<{ itemId: string; webUrl: string; webDavUrl: string; name: string; lastModified: string } | null> {
    const token = await this.auth.getFilesAccessToken(userId);
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
    const webDavUrl: string = item.webDavUrl || this.deriveWebDavUrl({ webUrl: item.webUrl, name: item.name });
    return { itemId: item.id, webUrl: item.webUrl, webDavUrl, name: item.name, lastModified: item.lastModifiedDateTime };
  }

  /**
   * משנה את שם הקובץ ב-OneDrive (PATCH על הפריט). לא נוגע בתוכן — רק בשם.
   * מקבל שם ידידותי ללא סיומת (או עם), מנקה תווים לא-חוקיים ומוודא סיומת .docx,
   * בדיוק כמו uploadEditable, כדי שהשם ב-OneDrive יישאר עקבי עם שם ההעלאה המקורי.
   * מחזיר את הפריט המעודכן, או null אם הפריט נמחק/לא נמצא (404) — best-effort לקורא.
   */
  async renameItem(
    userId: string,
    itemId: string,
    fileName: string,
  ): Promise<{ itemId: string; webUrl: string; webDavUrl: string; name: string } | null> {
    const token = await this.auth.getFilesAccessToken(userId);
    // אותו ניקוי ואותו אורך כמו בהעלאה — אחרת שינוי שם היה יכול ליצור שם שההעלאה
    // לא הייתה מייצרת לעולם, ולהיכשל באותה דחייה של שם ארוך.
    const safe = GraphFilesService.safeName(fileName);
    const res = await fetch(`${GRAPH}/me/drive/items/${itemId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `${safe}.docx` }),
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`OneDrive rename failed: ${res.status} ${t.slice(0, 200)}`);
    }
    const item: any = await res.json();
    const webDavUrl: string = item.webDavUrl || this.deriveWebDavUrl({ webUrl: item.webUrl, name: item.name });
    return { itemId: item.id, webUrl: item.webUrl, webDavUrl, name: item.name };
  }

  /**
   * מוריד את התוכן העדכני של הקובץ מ-OneDrive (הגרסה שנערכה ונשמרה ב-Word).
   * Graph מחזיר בד"כ 302 לכתובת אחסון מאומתת-מראש — מפנים אליה ללא כותרת Authorization.
   */
  async downloadContent(userId: string, itemId: string): Promise<Buffer> {
    const token = await this.auth.getFilesAccessToken(userId);
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
