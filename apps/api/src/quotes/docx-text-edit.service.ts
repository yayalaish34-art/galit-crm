/**
 * עריכת *טקסט בלבד* בתוך קובץ DOCX ממוזג, בלי לגעת בתבנית.
 *
 * העיקרון: לא בונים מסמך מחדש ולא ממירים לפורמט אחר — פותחים את ה-ZIP, נוגעים אך ורק
 * בתוכן של אלמנטי `<w:t>` בתוך `word/document.xml`, וסוגרים את ה-ZIP חזרה. כל השאר —
 * סגנונות, כותרות עליונות/תחתונות, תמונות, טבלאות, טבלת החתימה, numbering, relationships —
 * נשאר בייט-בייט כפי שהיה. כך אפשר "לשנות מילים" בלי הסיכון שהמסמך ייצא שבור.
 *
 * שימור עיצוב בתוך פסקה: העריכה מחושבת כ-diff של תחילית/סופת-משותפת מול הטקסט המקורי,
 * וה-runs שמחוץ לקטע שהשתנה נשארים ללא נגיעה. כלומר אם בפסקה יש מילה מודגשת והמנהל
 * ערך מילה אחרת — ההדגשה נשמרת. הטקסט *שנוסף* מקבל את העיצוב של ה-run הראשון שנפגע,
 * כי אין דרך אחרת לדעת איזה עיצוב התכוון לו.
 *
 * מה שלא נוגעים בו בכוונה: `word/header*.xml` / `footer*.xml` (הלוגו והכותרת הקבועה של
 * גלית), שדות (`w:instrText`) ותוכן שאינו `w:t`.
 */

import { BadRequestException, Injectable } from '@nestjs/common';

let PizZip: any;

function ensureZip() {
  if (!PizZip) {
    try {
      PizZip = require('pizzip');
    } catch {
      throw new BadRequestException('pizzip not installed. Run: npm install pizzip');
    }
  }
}

const DOCUMENT_PART = 'word/document.xml';

/** פסקה אחת כפי שהיא מוצגת למנהל לעריכה. */
export type DocxParagraph = {
  /** מזהה יציב כל עוד המסמך לא השתנה — אינדקס הפסקה בסריקה. */
  id: number;
  text: string;
};

/** מיקום התוכן הפנימי של אלמנט `<w:t>` בתוך ה-XML. */
type TextRun = {
  /** אינדקס תחילת התוכן (אחרי תג הפתיחה). */
  start: number;
  /** אינדקס סוף התוכן (לפני `</w:t>`). */
  end: number;
  /** אינדקס תחילת תג הפתיחה — לצורך הוספת xml:space בעת הצורך. */
  tagStart: number;
  /** תג הפתיחה המלא, למשל `<w:t xml:space="preserve">`. */
  openTag: string;
  /** הטקסט המקורי אחרי פענוח ישויות XML. */
  text: string;
};

type ParsedParagraph = { id: number; runs: TextRun[] };

/** פענוח ישויות XML (כולל מספריות) לטקסט רגיל. */
function decodeXml(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** קידוד טקסט לתוכן XML בטוח. `&` ראשון — אחרת נכפיל קידוד. */
function encodeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * סורק את document.xml פעם אחת ומחזיר את הפסקאות עם ה-runs שלהן.
 *
 * הסריקה מנהלת מחסנית של פסקאות פתוחות, כי ב-OOXML פסקה יכולה להכיל פסקה
 * (תיבת טקסט בתוך run). בלי המחסנית, ביטוי רגולרי לא-חמדני היה "סוגר" פסקה חיצונית
 * על תג הסגירה של הפנימית — וזו בדיוק הדרך לשבור מסמך.
 */
function parseParagraphs(xml: string): ParsedParagraph[] {
  // סדר החלופות חשוב: הסוגר והסוגר-עצמי לפני תג הפתיחה הכללי.
  const re = /<\/w:p>|<w:p(?:\s[^>]*?)?\/>|<w:p(?:\s[^>]*?)?>|<w:t(?:\s[^>]*?)?>[\s\S]*?<\/w:t>/g;
  const paragraphs: ParsedParagraph[] = [];
  const stack: ParsedParagraph[] = [];
  let nextId = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(xml)) !== null) {
    const tok = m[0];
    if (tok === '</w:p>') {
      const done = stack.pop();
      if (done) paragraphs.push(done);
      continue;
    }
    if (tok.startsWith('<w:p')) {
      // `<w:p/>` — פסקה ריקה, אין לה תוכן לערוך.
      if (tok.endsWith('/>')) continue;
      stack.push({ id: nextId++, runs: [] });
      continue;
    }
    // `<w:t …>טקסט</w:t>` — שייך לפסקה הפנימית ביותר שפתוחה כרגע.
    const current = stack[stack.length - 1];
    if (!current) continue; // w:t מחוץ לפסקה — לא אמור לקרות; מתעלמים
    const openEnd = tok.indexOf('>') + 1;
    const openTag = tok.slice(0, openEnd);
    const inner = tok.slice(openEnd, tok.length - '</w:t>'.length);
    current.runs.push({
      start: m.index + openEnd,
      end: m.index + tok.length - '</w:t>'.length,
      tagStart: m.index,
      openTag,
      text: decodeXml(inner),
    });
  }
  // פסקאות שנותרו פתוחות (XML פגום) — לא מחזירים אותן, לא נערוך מסמך שלא הבנו.
  return paragraphs.sort((a, b) => a.id - b.id);
}

/** קורא את document.xml מתוך ה-DOCX. */
function readDocumentXml(buffer: Buffer): { zip: any; xml: string } {
  ensureZip();
  let zip: any;
  try {
    zip = new PizZip(buffer);
  } catch {
    throw new BadRequestException('הקובץ אינו DOCX תקין');
  }
  const file = zip.file(DOCUMENT_PART);
  if (!file) throw new BadRequestException('הקובץ אינו DOCX תקין (חסר word/document.xml)');
  return { zip, xml: file.asText() };
}

/**
 * מוודא ש-[Content_Types].xml הוא הפריט הראשון בחבילה (דרישת OPC).
 * שכפול מכוון של הלוגיקה ב-docx-merge — אותה מלכודת בדיוק: סדר שגוי → Word מכריז
 * "תוכן שאינו ניתן לקריאה" ומציע לתקן את הקובץ.
 */
function ensureContentTypesFirst(zip: any): void {
  const CT = '[Content_Types].xml';
  const files = zip?.files;
  if (!files || !files[CT]) return;
  const keys = Object.keys(files);
  if (keys[0] === CT) return;
  const reordered: Record<string, unknown> = {};
  reordered[CT] = files[CT];
  for (const k of keys) if (k !== CT) reordered[k] = files[k];
  zip.files = reordered;
}

@Injectable()
export class DocxTextEditService {
  /** הפסקאות הניתנות לעריכה במסמך — רק כאלה שיש בהן טקסט בפועל. */
  extractParagraphs(buffer: Buffer): DocxParagraph[] {
    const { xml } = readDocumentXml(buffer);
    return parseParagraphs(xml)
      .map((p) => ({ id: p.id, text: p.runs.map((r) => r.text).join('') }))
      .filter((p) => p.text.trim() !== '');
  }

  /**
   * מחיל עריכות טקסט ומחזיר DOCX חדש.
   * @param edits מזהי הפסקאות (כפי שהוחזרו מ-extractParagraphs) והטקסט החדש.
   * @returns הקובץ החדש ומספר הפסקאות ששונו בפועל.
   */
  applyParagraphEdits(buffer: Buffer, edits: Array<{ id: number; text: string }>): { buffer: Buffer; changed: number } {
    const { zip, xml } = readDocumentXml(buffer);
    const paragraphs = parseParagraphs(xml);
    const byId = new Map(paragraphs.map((p) => [p.id, p]));

    /** כל השינויים על ה-runs, לפי מיקום — מוחלים בסוף מהסוף להתחלה. */
    const patches: Array<{ run: TextRun; text: string }> = [];
    let changed = 0;

    for (const edit of edits) {
      const para = byId.get(edit.id);
      if (!para || para.runs.length === 0) continue; // פסקה שאינה קיימת/בלי runs — אין לאן לכתוב
      const oldText = para.runs.map((r) => r.text).join('');
      const newText = String(edit.text ?? '');
      if (newText === oldText) continue;

      for (const p of this.planParagraphPatch(para.runs, oldText, newText)) patches.push(p);
      changed++;
    }

    if (changed === 0) return { buffer, changed: 0 };

    // מהסוף להתחלה — כדי שהאינדקסים של התיקונים הקודמים יישארו תקפים.
    patches.sort((a, b) => b.run.start - a.run.start);
    let out = xml;
    for (const { run, text } of patches) {
      let replacementTag = '';
      let tagFrom = run.start;
      // רווח בקצה נבלע ב-XML אלא אם מסומן במפורש — בלעדיו "שתי מילים" הופך ל"שתימילים".
      const needsSpace = /^\s|\s$/.test(text);
      if (needsSpace && !/xml:space\s*=/.test(run.openTag)) {
        replacementTag = run.openTag.replace(/\s*\/?>$/, ' xml:space="preserve">');
        tagFrom = run.tagStart;
      }
      out =
        out.slice(0, tagFrom) +
        (replacementTag || '') +
        encodeXml(text) +
        out.slice(run.end);
    }

    zip.file(DOCUMENT_PART, out);
    ensureContentTypesFirst(zip);
    const result: Buffer = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
    return { buffer: result, changed };
  }

  /**
   * מחשב אילו runs בפסקה צריכים תוכן חדש.
   *
   * משתמש בתחילית ובסופת המשותפות: כל מה שמחוץ לקטע שהשתנה נשאר ב-runs המקוריים
   * שלו, כולל העיצוב. הטקסט החדש נכנס ל-run הראשון שנפגע, ושאר ה-runs שנפגעו
   * מאבדים את החלק שהוחלף.
   */
  private planParagraphPatch(runs: TextRun[], oldText: string, newText: string): Array<{ run: TextRun; text: string }> {
    const maxCommon = Math.min(oldText.length, newText.length);
    let prefix = 0;
    while (prefix < maxCommon && oldText[prefix] === newText[prefix]) prefix++;
    let suffix = 0;
    while (
      suffix < maxCommon - prefix &&
      oldText[oldText.length - 1 - suffix] === newText[newText.length - 1 - suffix]
    ) {
      suffix++;
    }

    const changedFrom = prefix;                  // כולל
    const changedTo = oldText.length - suffix;   // לא כולל
    const inserted = newText.slice(prefix, newText.length - suffix);

    const patches: Array<{ run: TextRun; text: string }> = [];
    let insertedPlaced = false;
    let offset = 0;

    for (const run of runs) {
      const runFrom = offset;
      const runTo = offset + run.text.length;
      offset = runTo;

      // run שכולו מחוץ לקטע שהשתנה — לא נוגעים בו בכלל (העיצוב שלו נשמר).
      if (runTo <= changedFrom || runFrom >= changedTo) continue;

      const keepHead = run.text.slice(0, Math.max(0, changedFrom - runFrom));
      const keepTail = run.text.slice(Math.max(0, changedTo - runFrom));
      if (!insertedPlaced) {
        patches.push({ run, text: keepHead + inserted + keepTail });
        insertedPlaced = true;
      } else {
        patches.push({ run, text: keepHead + keepTail });
      }
    }

    // הוספה טהורה בגבול בין runs (changedFrom === changedTo) — אף run לא "נפגע",
    // אז מכניסים את הטקסט ל-run שבתוכו נמצא הגבול, ובנפילה לאחרון.
    if (!insertedPlaced && inserted) {
      let cursor = 0;
      let target = runs[runs.length - 1];
      for (const run of runs) {
        const runTo = cursor + run.text.length;
        if (changedFrom <= runTo) { target = run; break; }
        cursor = runTo;
      }
      let base = 0;
      for (const run of runs) {
        if (run === target) break;
        base += run.text.length;
      }
      const at = Math.max(0, Math.min(target.text.length, changedFrom - base));
      patches.push({ run: target, text: target.text.slice(0, at) + inserted + target.text.slice(at) });
    }

    return patches;
  }
}
