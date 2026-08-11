/**
 * חילוץ פרטים מתוך PDF של הצעת מחיר חתומה: הסכום הסופי ומספר ההצעה.
 *
 * נטען לפי דרישה (lazy require) על ה-legacy CJS build של pdfjs — תואם Node 20
 * בפרודקשן, בדיוק כמו ב-pdf-buttons.util.ts. עובד רק ל-PDF טקסטואלי; להצעות
 * שהן תמונה/סריקה (image/*) או PDF ללא שכבת טקסט — יחזיר null, והמשתמש ימלא ידנית.
 */

/** מנקה מספר עברי/אנגלי עם פסיקים/רווחים/₪ למספר. מחזיר NaN אם לא מספר תקין. */
function toNumber(raw: string): number {
  const cleaned = String(raw)
    .replace(/[₪$€]/g, '')
    .replace(/[\s ]/g, '')
    .replace(/,/g, '')
    .trim();
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return NaN;
  return Number(cleaned);
}

/**
 * מזהה את הסכום שאחרי אחת מתוויות "סך הכל" בשורת טקסט.
 * מכסה: "סה"כ לתשלום", "סך הכל כולל מע"מ", "סכום כולל", "מחיר סופי", "Total".
 */
const TOTAL_LABELS = [
  /סה["'׳]?\s?כ\s*לתשלום/,
  /סך\s*הכל\s*כולל\s*מע/,
  /סכום\s*כולל\s*מע/,
  /סה["'׳]?\s?כ\s*כולל\s*מע/,
  /מחיר\s*סופי/,
  /סך\s*הכל\s*לתשלום/,
  /total\s*(incl|amount|due)/i,
];

// חלש יותר — נשתמש בו רק אם אף אחת מהחזקות לא נמצאה.
const WEAK_LABELS = [/סה["'׳]?\s?כ/, /סך\s*הכל/, /סכום\s*כולל/, /\btotal\b/i];

/**
 * תוויות מספר ההצעה. המסמכים שלנו מרנדרים "מס' הצעת מחיר" מתוך {contractSurveyNumber}
 * (כך ב-71 מהתבניות), ולצידו "סימוכין" — שניהם אותו מספר רץ. הצעות של צד-שלישי
 * מגיעות בדרך כלל כ"הצעת מחיר מס' …" / "מספר הצעה".
 */
const QUOTE_NO_LABELS = [
  /מס["'׳]?\s*הצעת\s*מחיר/,
  /מספר\s*הצעת\s*מחיר/,
  /הצעת\s*מחיר\s*מס["'׳]?/,
  /מספר\s*הצעה/,
  /מס["'׳]?\s*הצעה/,
  /הצעה\s*מס["'׳]?/,
  /סימוכין/,
  /quote\s*(?:no|number|#)/i,
];

/** מוצא את המספר הגדול-ביותר שמופיע אחרי label באותה שורה. */
function amountAfterLabel(line: string, labels: RegExp[]): number | null {
  for (const label of labels) {
    const m = label.exec(line);
    if (!m) continue;
    const after = line.slice(m.index + m[0].length);
    // כל רצפי הספרות (עם פסיקים/נקודה) שאחרי התווית.
    const nums = after.match(/\d[\d,]*(?:\.\d+)?/g);
    if (!nums || !nums.length) continue;
    const vals = nums.map(toNumber).filter((n) => Number.isFinite(n) && n > 0);
    if (vals.length) return Math.max(...vals);
  }
  return null;
}

/**
 * מספר ההצעה הראשון שמופיע אחרי אחת מתוויות המספר באותה שורה.
 * המספר הרץ שלנו הוא 4–6 ספרות; מקבלים 3–8 כדי לא לפספס מספרים חיצוניים.
 * הביטוי דורש שהמספר לא ייגע ב-/ . - כדי שתאריך ("11/08/2026") לא ייקלט כמספר הצעה,
 * וגם תומך בפורמט הישן "Q-202601-0012".
 */
function quoteNumberAfterLabel(line: string): string | null {
  for (const label of QUOTE_NO_LABELS) {
    const m = label.exec(line);
    if (!m) continue;
    const after = line.slice(m.index + m[0].length);
    const legacy = /\bQ-\d{6}-\d{3,5}\b/i.exec(after);
    if (legacy) return legacy[0].toUpperCase();
    const plain = /(?:^|[^\d/.\-])(\d{3,8})(?![\d/.\-])/.exec(after);
    if (plain) return plain[1];
  }
  return null;
}

/**
 * קורא את שכבת הטקסט של ה-PDF ומחזיר אותה כשורות (או null אם אין/נכשל).
 * pdfjs מפרק טקסט ל-runs; מקבצים לפי y ומסדרים פר-שורה לפי x (RTL: ימני קודם).
 */
async function readPdfLines(pdf: Buffer | Uint8Array): Promise<string[] | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      pdfjs.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.js');
    } catch {
      /* fake worker on main thread — extraction still works */
    }
    const data = pdf instanceof Uint8Array ? pdf : new Uint8Array(pdf);
    const doc = await pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;
    try {
      const lines: string[] = [];
      for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const tc = await page.getTextContent();
        // קיבוץ items לשורות לפי ה-y (transform[5]) — pdfjs מפרק טקסט ל-runs.
        const rows = new Map<number, Array<{ x: number; s: string }>>();
        for (const it of tc.items as any[]) {
          const s = it?.str ? String(it.str) : '';
          if (!s.trim() || !Array.isArray(it.transform)) continue;
          const y = Math.round(Number(it.transform[5]));
          const x = Number(it.transform[4]) || 0;
          if (!rows.has(y)) rows.set(y, []);
          rows.get(y)!.push({ x, s });
        }
        // מיון פר-שורה לפי x (RTL: הכי ימני קודם), חיבור לשורת טקסט אחת.
        for (const parts of rows.values()) {
          parts.sort((a, b) => b.x - a.x);
          lines.push(parts.map((p2) => p2.s).join(' '));
        }
      }
      return lines;
    } finally {
      try {
        await doc.destroy();
      } catch {
        /* ignore */
      }
    }
  } catch {
    return null; // pdfjs נכשל / לא PDF תקין — נופלים לקלט ידני.
  }
}

/**
 * הסכום הסופי המשוער מתוך השורות (או null). לוקח את הופעת ה"סך הכל" האחרונה
 * במסמך — בהצעות מחיר שורת הסיכום כמעט תמיד בתחתית.
 */
function totalFromLines(lines: string[]): number | null {
  // מעבר על השורות; זוכרים את הסכום מהתווית החזקה האחרונה, ואם אין — מהחלשה.
  let strong: number | null = null;
  let weak: number | null = null;
  for (const line of lines) {
    const s = amountAfterLabel(line, TOTAL_LABELS);
    if (s != null) strong = s;
    else {
      const w = amountAfterLabel(line, WEAK_LABELS);
      if (w != null) weak = w;
    }
  }
  const total = strong ?? weak;
  return total != null && Number.isFinite(total) && total > 0 ? total : null;
}

/**
 * מספר ההצעה מתוך השורות (או null). לוקח את ההופעה *הראשונה* — כותרת ההצעה
 * נמצאת בעמוד הראשון, בעוד בתחתית עשויים להופיע מספרים אחרים (הזמנה/חשבונית).
 */
function quoteNumberFromLines(lines: string[]): string | null {
  for (const line of lines) {
    const n = quoteNumberAfterLabel(line);
    if (n) return n;
  }
  return null;
}

/** מחזיר את הסכום הסופי המשוער (או null). */
export async function extractTotalFromPdf(pdf: Buffer | Uint8Array): Promise<number | null> {
  const lines = await readPdfLines(pdf);
  return lines ? totalFromLines(lines) : null;
}

/**
 * קריאה אחת של ה-PDF → גם הסכום הסופי וגם מספר ההצעה. עדיף על שתי קריאות נפרדות:
 * פענוח PDF של הצעה סרוקה יקר, ואין סיבה לשלם עליו פעמיים.
 */
export async function extractSignedQuoteInfo(
  pdf: Buffer | Uint8Array,
): Promise<{ total: number | null; quoteNumber: string | null }> {
  const lines = await readPdfLines(pdf);
  if (!lines) return { total: null, quoteNumber: null };
  return { total: totalFromLines(lines), quoteNumber: quoteNumberFromLines(lines) };
}