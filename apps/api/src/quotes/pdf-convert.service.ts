import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import PizZip from 'pizzip';
import { GraphPdfService } from '../microsoft/graph-pdf.service';

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
    if (userId && this.graphPdf.configured) {
      try {
        const pdf = await this.graphPdf.docxToPdf(userId, frozen, fileName);
        this.logger.log(`Converted "${fileName}" to PDF via Microsoft Graph`);
        return pdf;
      } catch (e: any) {
        this.logger.warn(
          `Graph PDF conversion failed for "${fileName}" — falling back to CloudConvert: ${e?.message || e}`,
        );
      }
    }

    // 2) גיבוי: CloudConvert (LibreOffice).
    if (!this.apiKey) {
      throw new BadRequestException('המרת PDF לא מוגדרת בשרת — חבר חשבון Outlook או הגדר CLOUDCONVERT_API_KEY');
    }
    return this.cloudConvertDocxToPdf(frozen, fileName);
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

  /** המרת DOCX (כבר עם תאריכים מוקפאים) ל-PDF דרך CloudConvert. */
  private async cloudConvertDocxToPdf(docx: Buffer, fileName: string): Promise<Buffer> {
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
            input_format: 'docx',
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
