import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import PizZip from 'pizzip';
import { GraphPdfService } from '../microsoft/graph-pdf.service';
import { MicrosoftAuthService } from '../microsoft/microsoft-auth.service';

/**
 * המרת DOCX ל-PDF. מנוע ראשי: Microsoft Graph (Word עצמו — כותרת/עיצוב זהים לתבנית), בתנאי
 * שה-userId מחובר ל-Outlook. מנוע גיבוי: CloudConvert (LibreOffice) — כשאין משתמש מחובר/Graph נכשל.
 * המפתח של CloudConvert נשמר במשתנה סביבה CLOUDCONVERT_API_KEY — לעולם לא בקוד.
 */
@Injectable()
export class PdfConvertService {
  private readonly logger = new Logger(PdfConvertService.name);
  private readonly apiKey = process.env.CLOUDCONVERT_API_KEY || '';
  private readonly base = 'https://api.cloudconvert.com/v2';

  constructor(private readonly graphPdf: GraphPdfService) {}

  /** האם מנוע הגיבוי (CloudConvert) מוגדר. ההמרה דרך Graph זמינה גם בלי זה (אם המשתמש מחובר). */
  get enabled(): boolean {
    return !!this.apiKey;
  }

  /** מסיר ניקוד עברי */
  private stripNikud(s: string): string {
    return s.replace(/[֑-ׇ]/g, '');
  }

  /** מחזיר את תאריך היום בעברית: לוח עברי + גרגוריאני בעברית. */
  private async hebrewDates(d = new Date()): Promise<{ heb: string; greg: string }> {
    const days = ['יום ראשון', 'יום שני', 'יום שלישי', 'יום רביעי', 'יום חמישי', 'יום שישי', 'שבת'];
    // חודשים גרגוריאניים בעברית — נבנים ידנית ולא דרך Intl/ICU בכוונה:
    // בשרת (Railway/דוקר) חבילת ה-ICU של Node עלולה לא לכלול את הלוקאל he-IL,
    // ואז Intl.DateTimeFormat('he-IL', { month: 'long' }) מחזיר חודש באנגלית
    // (או זורק → כל ההקפאה נכשלת והשדה מודפס כקוד פורמט "dd/y"). בנייה ידנית
    // מבטיחה פלט עברי תקין בכל סביבה.
    const gregMonths = [
      'בינואר', 'בפברואר', 'במרץ', 'באפריל', 'במאי', 'ביוני',
      'ביולי', 'באוגוסט', 'בספטמבר', 'באוקטובר', 'בנובמבר', 'בדצמבר',
    ];
    const greg = `${String(d.getDate()).padStart(2, '0')} ${gregMonths[d.getMonth()]} ${d.getFullYear()}`;
    let heb = '';
    try {
      // @hebcal/core הוא ESM — נטען ב-dynamic import
      const { HDate } = await import('@hebcal/core');
      heb = this.stripNikud(`${days[d.getDay()]} ${new HDate(d).renderGematriya()}`);
    } catch (e: any) {
      this.logger.warn(`hebcal load failed: ${e?.message || e}`);
      // נפילה-חזרה: יום בשבוע + התאריך הגרגוריאני בעברית, כדי שגם השדה העברי
      // (\h) לא יישאר ריק / לא יודפס כקוד פורמט.
      heb = `${days[d.getDay()]} ${greg}`;
    }
    return { heb, greg };
  }

  /**
   * "מקפיא" שדות DATE של Word בכותרת/תחתית ל-טקסט סטטי בעברית (תאריך היום) — לפני CloudConvert.
   * סיבה: LibreOffice (CloudConvert) מחשב מחדש שדות DATE בלוקאל אנגלי → "23 Jun 26"/"Yom Shlishi".
   * שדות PAGE/NUMPAGES נשארים דינמיים. אם משהו נכשל — מחזיר את ה-DOCX המקורי (fallback בטוח).
   */
  private async freezeDocxDates(docx: Buffer): Promise<Buffer> {
    try {
      const { heb, greg } = await this.hebrewDates();
      if (!heb && !greg) return docx;
      const zip = new PizZip(docx);
      // שדה שלם: ריצת begin … ריצת end (שדות אינם מקוננים). עיגון מדויק של ריצת ה-begin.
      // הלוקאהדים הם קריטיים: ה-<w:rPr> של ריצת ה-begin אסור לו לחצות גבול של ריצה/פסקה/
      // תיבת-טקסט (w:r/w:p/w:pict/w:drawing/w:txbxContent), אחרת הרגקס "מגלגל" אחורה ובולע
      // את עטיפת תיבת-הטקסט (כשהתאריך יושב בתוך textbox בכותרת) — ההחלפה אז מוחקת תגי-פתיחה
      // מבניים, ה-DOCX יוצא פגום, וההמרה ל-PDF נכשלת ב-Word (Graph 406) וב-LibreOffice כאחד.
      // גם פנים השדה אסור לו לחצות </w:txbxContent>.
      const fieldRe =
        /<w:r\b[^>]*>(?:<w:rPr>(?:(?!<\/?w:(?:r|p|pict|drawing|txbxContent)\b)[\s\S])*?<\/w:rPr>)?\s*<w:fldChar w:fldCharType="begin"\s*\/>\s*<\/w:r>(?:(?!<\/w:txbxContent>)[\s\S])*?<w:fldChar w:fldCharType="end"\s*\/>\s*<\/w:r>/g;
      const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      // רשת ביטחון: "הקפאה" מחליפה ריצת-שדה בריצה בודדת — היא לעולם לא אמורה לשנות את מספר
      // התגיות המבניות. אם המספר השתנה, הרגקס בלע מבנה (textbox/טבלה) → נחזיר את החלק המקורי
      // (התאריך לא יוקפא שם, אבל ה-DOCX יישאר תקין ויומר ל-PDF). הגנה כפולה על התיקון ברגקס.
      const STRUCT = ['<w:pict', '<w:drawing', '<w:txbxContent>', '</w:txbxContent>', '<w:tbl>', '</w:tbl>', '<w:tc>', '</w:tc>', '<w:p>', '<w:p ', '</w:p>'];
      const structSig = (s: string) => STRUCT.map((t) => s.split(t).length).join(',');
      let froze = 0;
      for (const name of Object.keys(zip.files)) {
        if (!/^word\/(header\d*|footer\d*|document)\.xml$/.test(name)) continue;
        const orig = zip.file(name)!.asText();
        if (!orig.includes('DATE')) continue;
        let localFroze = 0;
        const xml = orig.replace(fieldRe, (field) => {
          if (!/<w:instrText[^>]*>\s*DATE/.test(field)) return field; // רק שדות DATE (PAGE נשאר דינמי)
          const date = field.includes('\\h') ? heb : greg; // \h = לוח עברי
          // עיצוב (rPr) לטקסט הסטטי — חייב להילקח מ"ריצת התוצאה" של השדה (אחרי fldChar
          // separate), ולא מריצת ה-begin. עיגון על ה-<w:rPr> הראשון בשדה (כפי שהיה) גרר
          // את כל פנים השדה — fldChar begin, ה-instrText (קוד "DATE \@ ..."), ו-separate —
          // אל תוך ההחלפה, והשמיט את ה-end, כך שנותר שדה לא-סגור והקוד הודפס כטקסט גלוי
          // (למשל dddd dd MMMM yyyy בכותרת ה-PDF). חיתוך מ-separate ואילך מבטיח שנלכד רק
          // עיצוב ריצת התוצאה.
          const sepIdx = field.indexOf('fldCharType="separate"');
          const afterSep = sepIdx >= 0 ? field.slice(sepIdx) : '';
          const rPrM = afterSep.match(/<w:rPr>[\s\S]*?<\/w:rPr>(?=\s*<w:t[ >])/);
          const rPr = rPrM ? rPrM[0] : '';
          localFroze++;
          return `<w:r>${rPr}<w:t xml:space="preserve">${esc(date)}</w:t></w:r>`;
        });
        if (structSig(xml) !== structSig(orig)) {
          this.logger.warn(`freezeDocxDates: structural change in ${name} — keeping original (dates not frozen there)`);
          continue;
        }
        if (localFroze) {
          zip.file(name, xml);
          froze += localFroze;
        }
      }
      if (!froze) return docx;
      this.logger.log(`Froze ${froze} DATE field(s) to Hebrew before PDF conversion`);
      return zip.generate({ type: 'nodebuffer' });
    } catch (e: any) {
      this.logger.warn(`freezeDocxDates failed (using original): ${e?.message || e}`);
      return docx;
    }
  }

  /**
   * ממיר buffer של DOCX ל-PDF ומחזיר את ה-buffer של ה-PDF.
   * מנוע ראשי: Microsoft Graph (כש-userId מחובר ל-Outlook) → פלט נאמן ל-Word.
   * אם Graph לא זמין/נכשל — נופלים ל-CloudConvert. אם גם הוא לא מוגדר — זורקים.
   */
  async docxToPdf(docx: Buffer, fileName = 'document.docx', userId?: string): Promise<Buffer> {
    // הקפאת שדות התאריך לעברית פעם אחת, לפני שני המנועים (טקסט תאריך זהה למה שמוצג היום).
    const frozen = await this.freezeDocxDates(docx);

    // 1) ניסיון ראשי: Microsoft Graph (מנוע Word — כותרת/עיצוב זהים לתבנית).
    //    ההמרה עוברת דרך חשבון ה-OneDrive הייעודי המחובר (לא דרך חשבון הקורא), ולכן די בכך
    //    ש-Graph מוגדר ברמת השרת — אין תלות ב-userId של הקורא.
    let graphErr: any = null;
    if (this.graphPdf.configured) {
      try {
        const pdf = await this.graphPdf.docxToPdf(userId ?? '', frozen, fileName);
        this.logger.log(`Converted "${fileName}" to PDF via Microsoft Graph`);
        return pdf;
      } catch (e: any) {
        graphErr = e;
        // "לא מחובר חשבון OneDrive להמרת PDF" — הדרישה היא fail-with-clear-error: אין ליפול
        // חזרה ל-CloudConvert (או לחשבון הקורא). מעבירים את השגיאה כמות שהיא כדי שמנהל יחבר OneDrive.
        if (String(e?.message || '').includes(MicrosoftAuthService.NO_ONEDRIVE_FOR_PDF)) {
          throw e;
        }
        this.logger.warn(
          `Graph PDF conversion failed for "${fileName}" — falling back to CloudConvert: ${e?.message || e}`,
        );
      }
    }

    // 2) גיבוי: CloudConvert (LibreOffice).
    if (!this.apiKey) {
      // אין מנוע גיבוי — ההודעה נגזרת מהסיבה האמיתית שבגללה Graph נכשל, כדי שהמשתמש יֵדע
      // אם עליו להתחבר, להתחבר-מחדש, או שהבעיה בקובץ/בשרת (ולא לשלוח מחובר שוב ל"התחבר").
      throw this.pdfUnavailableError(userId, graphErr);
    }
    return this.cloudConvertDocxToPdf(frozen, fileName);
  }

  /**
   * בונה הודעת שגיאה מדויקת כשאין מנוע PDF זמין, לפי *סיבת* כשל ה-Graph:
   * - אין userId / משתמש לא מחובר / הטוקן פג  → "חבר / התחבר-מחדש ל-Outlook".
   * - Graph זמין אך נכשל על הקובץ (403/406/500/timeout) → הבעיה בקובץ/בהמרה, לא בחיבור.
   */
  private pdfUnavailableError(userId?: string, graphErr?: any): BadRequestException {
    if (!userId) {
      return new BadRequestException('אינך מחובר ל-Outlook — התחבר ל-Outlook בהגדרות ונסה שוב.');
    }
    const msg = String(graphErr?.message || graphErr || '');
    const status = graphErr?.status ?? (msg.match(/\b(40[0-9]|50[0-9])\b/)?.[1] ? Number(msg.match(/\b(40[0-9]|50[0-9])\b/)![1]) : undefined);
    // חיבור פג/נדחה: mintAccessToken כבר זרק BadRequestException עם הודעת "התחבר מחדש" —
    // מעבירים אותה כמות שהיא (היא מדויקת). גם 401 = טוקן לא תקף.
    if (graphErr instanceof BadRequestException) return graphErr;
    if (status === 401) {
      return new BadRequestException('חיבור ה-Outlook פג תוקף או שההרשאות חסרות — התחבר מחדש ל-Outlook ונסה שוב.');
    }
    if (status === 403) {
      // 403 provisioningNotAllowed = לחשבון אין OneDrive/רישיון. הפתרון: לחבר חשבון OneDrive
      // *נפרד* (בהגדרות › חשבון OneDrive נפרד) שדרכו תתבצע ההמרה.
      if (/provisioningNotAllowed|personal site|valid license/i.test(msg)) {
        return new BadRequestException(
          'לחשבון ה-Outlook שלך אין OneDrive להמרת הקובץ ל-PDF. חבר "חשבון OneDrive נפרד" בהגדרות ונסה שוב.',
        );
      }
      return new BadRequestException(
        'חסרה הרשאת גישה ל-OneDrive להמרת הקובץ. התחבר מחדש ל-Outlook (כדי לאשר את ההרשאה החדשה) ונסה שוב.',
      );
    }
    // Graph היה זמין אך נכשל על הקובץ עצמו (406/415/500/timeout וכו') — לא בעיית חיבור.
    return new BadRequestException(
      'המרת הקובץ ל-PDF נכשלה. ייתכן שהקובץ פגום או כבד מדי. נסה למזג מחדש את ההצעה, או שמור אותה כ-PDF ב-Word ולהעלות ידנית.',
    );
  }

  /**
   * ממיר קובץ כלשהו (DOC/DOCX/XLS/XLSX/תמונה וכו') ל-PDF דרך Microsoft Graph — ללא נפילה-חזרה
   * ל-CloudConvert (הוא תומך רק ב-DOCX). דורש userId מחובר ל-Outlook.
   */
  async fileToPdf(file: Buffer, fileName: string, mimeType?: string, userId?: string): Promise<Buffer> {
    if (!userId || !this.graphPdf.configured) {
      throw new BadRequestException('המרת PDF לקובץ זה דורשת חיבור ל-Outlook');
    }
    const pdf = await this.graphPdf.fileToPdf(userId, file, fileName, mimeType);
    this.logger.log(`Converted "${fileName}" to PDF via Microsoft Graph`);
    return pdf;
  }

  /**
   * פורמטים שמותר וכדאי להמיר ל-PDF לפני שליחה ללקוח: משפחת Word על כל הגרסאות.
   * ‎.doc‎ (Word הישן) הוא המקרה שנפל עד כה — דוחות רבים נשמרים בפורמט הזה, והבדיקה
   * הקודמת בדקה ‎.docx‎ בלבד ולכן שלחה אותם כמסמך Word.
   */
  private static readonly CONVERTIBLE_EXT = new Set(['doc', 'docx', 'docm', 'dot', 'dotx', 'rtf', 'odt']);
  private static readonly CONVERTIBLE_MIME = new Set([
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-word.document.macroenabled.12',
    'application/rtf',
    'text/rtf',
    'application/vnd.oasis.opendocument.text',
  ]);

  static extensionOf(fileName: string): string {
    return (fileName.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
  }

  /** האם הקובץ הוא מסמך Word שיש להמיר ל-PDF (PDF/תמונה מוחזרים false). */
  static isConvertibleToPdf(fileName: string, mime?: string | null): boolean {
    const ext = PdfConvertService.extensionOf(fileName);
    if (ext === 'pdf') return false;
    if (ext && PdfConvertService.CONVERTIBLE_EXT.has(ext)) return true;
    const m = (mime || '').toLowerCase().split(';')[0].trim();
    return !!m && PdfConvertService.CONVERTIBLE_MIME.has(m);
  }

  /**
   * המרה ל-PDF של כל מסמך Word — ‎.docx‎ עובר במסלול הוותיק (הקפאת תאריכים לעברית +
   * CloudConvert כגיבוי), וכל פורמט אחר (‎.doc‎ הישן, ‎.rtf‎, ‎.odt‎) מומר דרך OneDrive/Word,
   * עם CloudConvert כגיבוי לפי סיומת הקובץ.
   */
  async anyWordToPdf(file: Buffer, fileName: string, mime?: string | null, userId?: string): Promise<Buffer> {
    const ext = PdfConvertService.extensionOf(fileName) || (mime === 'application/msword' ? 'doc' : 'docx');
    if (ext === 'docx' || ext === 'docm') return this.docxToPdf(file, fileName, userId);

    let graphErr: any = null;
    if (this.graphPdf.configured) {
      try {
        const pdf = await this.graphPdf.fileToPdf(userId ?? '', file, fileName, mime || undefined);
        this.logger.log(`Converted "${fileName}" (${ext}) to PDF via Microsoft Graph`);
        return pdf;
      } catch (e: any) {
        graphErr = e;
        if (String(e?.message || '').includes(MicrosoftAuthService.NO_ONEDRIVE_FOR_PDF)) throw e;
        this.logger.warn(`Graph PDF conversion failed for "${fileName}" — falling back to CloudConvert: ${e?.message || e}`);
      }
    }
    if (!this.apiKey) throw this.pdfUnavailableError(userId, graphErr);
    return this.cloudConvertDocxToPdf(file, fileName, ext);
  }

  /** המרת מסמך Word (DOCX כבר עם תאריכים מוקפאים) ל-PDF דרך CloudConvert. */
  private async cloudConvertDocxToPdf(docx: Buffer, fileName: string, inputFormat = 'docx'): Promise<Buffer> {
    const authHeaders = { Authorization: `Bearer ${this.apiKey}` };

    // 1) יצירת job: import(upload) → convert(docx→pdf) → export(url)
    const jobRes = await fetch(`${this.base}/jobs`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tasks: {
          'import-file': { operation: 'import/upload' },
          'convert-file': {
            operation: 'convert',
            input: 'import-file',
            input_format: inputFormat,
            output_format: 'pdf',
          },
          'export-file': { operation: 'export/url', input: 'convert-file' },
        },
      }),
    });
    if (!jobRes.ok) {
      const t = await jobRes.text().catch(() => '');
      this.logger.error(`CloudConvert job create failed: ${jobRes.status} ${t}`);
      throw new BadRequestException('יצירת המרת ה-PDF נכשלה');
    }
    const job: any = await jobRes.json();
    const jobId = job?.data?.id;
    const tasks: any[] = job?.data?.tasks || [];
    const form = tasks.find((x) => x.name === 'import-file')?.result?.form;
    if (!jobId || !form?.url) {
      throw new BadRequestException('CloudConvert: לא התקבל יעד העלאה');
    }

    // 2) העלאת ה-DOCX אל משימת ה-import (multipart — הפרמטרים לפני הקובץ)
    const fd = new FormData();
    for (const [k, v] of Object.entries(form.parameters || {})) {
      fd.append(k, String(v));
    }
    fd.append('file', new Blob([new Uint8Array(docx)]), fileName);
    const uploadRes = await fetch(form.url, { method: 'POST', body: fd });
    if (!uploadRes.ok && uploadRes.status !== 201) {
      const t = await uploadRes.text().catch(() => '');
      this.logger.error(`CloudConvert upload failed: ${uploadRes.status} ${t}`);
      throw new BadRequestException('העלאת הקובץ להמרה נכשלה');
    }

    // 3) המתנה לסיום ה-job (סנכרוני)
    const waitRes = await fetch(`${this.base}/jobs/${jobId}/wait`, { headers: authHeaders });
    if (!waitRes.ok) {
      const t = await waitRes.text().catch(() => '');
      this.logger.error(`CloudConvert wait failed: ${waitRes.status} ${t}`);
      throw new BadRequestException('המרת ה-PDF נכשלה');
    }
    const finished: any = await waitRes.json();
    if (finished?.data?.status !== 'finished') {
      throw new BadRequestException('המרת ה-PDF לא הושלמה');
    }
    const fileUrl = (finished?.data?.tasks || [])
      .find((x: any) => x.name === 'export-file')?.result?.files?.[0]?.url;
    if (!fileUrl) {
      throw new BadRequestException('CloudConvert: לא התקבל קובץ PDF');
    }

    // 4) הורדת ה-PDF
    const pdfRes = await fetch(fileUrl);
    if (!pdfRes.ok) {
      throw new BadRequestException('הורדת ה-PDF נכשלה');
    }
    return Buffer.from(await pdfRes.arrayBuffer());
  }
}
