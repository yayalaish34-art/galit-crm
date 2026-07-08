import { PDFDocument, PDFName, PDFString, PDFArray } from 'pdf-lib';
import { SIGN_BUTTON_PNG_BASE64 } from './sign-button-image';
import { PROFILE_BUTTON_PNG_BASE64 } from './profile-button-image';

const SIGN_PNG = Buffer.from(SIGN_BUTTON_PNG_BASE64, 'base64');
const PROFILE_PNG = Buffer.from(PROFILE_BUTTON_PNG_BASE64, 'base64');

/**
 * ה-y הנמוך ביותר של *תוכן* בעמוד — טקסט וגם תמונות/גרפיקה (קואורדינטות pdf, מקור
 * בתחתית-שמאל). משמש כדי לצרוב את הכפתורים *מתחת* לכל התוכן ולא עליו — כולל טבלת
 * החתימה ותעודות ההסמכה שהן תמונות. כשל בזיהוי → 0 (שמרני: מניחים עמוד מלא, הכפתורים
 * יעברו לעמוד חדש — בלי סיכון של עלייה על תוכן).
 */
async function contentBottomY(pdf: Buffer, pageIndex: number, pageHeight: number): Promise<number> {
  try {
    // טעינה עצלה של pdfjs (legacy CJS — תואם Node 20 בפרודקשן).
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      pdfjs.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.js');
    } catch { /* fake worker on main thread — extraction still works */ }
    const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf), useSystemFonts: true, isEvalSupported: false }).promise;
    try {
      const page = await doc.getPage(pageIndex + 1);
      let minY = Infinity;

      // (1) טקסט — ה-y של בסיס כל ריצת טקסט.
      const tc = await page.getTextContent();
      for (const it of tc.items as any[]) {
        if (it?.str && String(it.str).trim() && Array.isArray(it.transform)) {
          const y = Number(it.transform[5]);
          if (isFinite(y) && y < minY) minY = y;
        }
      }

      // (2) תמונות/גרפיקה — סורקים את רשימת האופרטורים ומאתרים ציור תמונות.
      //     ה-CTM הנוכחי (transform) קובע את מיקום התחתית של התמונה: e[5] הוא ה-y
      //     של הפינה התחתונה (בגלל שמטריצת התמונה מנרמלת יחידה 1x1). זה מכסה את
      //     תעודות ההסמכה/הלוגו שאינן טקסט, כדי שהכפתורים לא ייצרבו עליהן.
      try {
        const opList = await page.getOperatorList();
        const OPS = pdfjs.OPS || {};
        const imageOps = new Set(
          [OPS.paintImageXObject, OPS.paintInlineImage, OPS.paintImageMaskXObject, OPS.paintJpegXObject].filter(
            (x: any) => typeof x === 'number',
          ),
        );
        // מעקב אחר מטריצת הטרנספורמציה הנוכחית (CTM) דרך save/restore/transform.
        const stack: number[][] = [];
        let ctm = [1, 0, 0, 1, 0, 0];
        const mul = (a: number[], b: number[]) => [
          a[0] * b[0] + a[2] * b[1],
          a[1] * b[0] + a[3] * b[1],
          a[0] * b[2] + a[2] * b[3],
          a[1] * b[2] + a[3] * b[3],
          a[0] * b[4] + a[2] * b[5] + a[4],
          a[1] * b[4] + a[3] * b[5] + a[5],
        ];
        for (let i = 0; i < opList.fnArray.length; i++) {
          const fn = opList.fnArray[i];
          const args = opList.argsArray[i];
          if (fn === OPS.save) {
            stack.push(ctm.slice());
          } else if (fn === OPS.restore) {
            if (stack.length) ctm = stack.pop() as number[];
          } else if (fn === OPS.transform && Array.isArray(args) && args.length >= 6) {
            ctm = mul(ctm, args as number[]);
          } else if (imageOps.has(fn)) {
            // התחתית של התמונה = ה-y של תרגום ה-CTM (הפינה בקואורדינטות היחידה 0,0).
            const bottom = ctm[5];
            if (isFinite(bottom) && bottom < minY) minY = bottom;
          }
        }
      } catch { /* אם רשימת האופרטורים נכשלת — מסתמכים על הטקסט בלבד */ }

      // אין תוכן בעמוד → כולו פנוי.
      return isFinite(minY) ? Math.max(0, minY - 8) : pageHeight;
    } finally {
      try { await doc.destroy(); } catch { /* ignore */ }
    }
  } catch {
    return 0;
  }
}

/**
 * צורב כפתורים לחיצים (תמונות PNG שאומתו ויזואלית — עברית קריאה):
 *   signUrl    → "לחץ כאן לחתימה" (ירוק)
 *   profileUrl → "לחץ כאן להסמכות שלנו" (כחול)
 *
 * מיקום: מיד מתחת לסוף התוכן — כמה שיותר גבוה, בלי לעלות על טקסט. מעדיף להישאר
 * בעמוד האחרון (מתחת לטקסט האחרון); אם באמת אין שם מקום פנוי, סורק אחורה לעמוד
 * הקודם שיש בו מספיק שטח פנוי בתחתית וצורב שם — כך הכפתורים לא נדחקים לעמוד ריק
 * חדש בסוף. עמוד חדש נוצר רק כמוצא אחרון (כשאין באף עמוד מקום פנוי מתחת לתוכן).
 */
export async function stampQuoteButtons(
  pdf: Buffer,
  opts: { signUrl?: string; profileUrl?: string },
): Promise<Buffer> {
  if (!opts.signUrl && !opts.profileUrl) return pdf;
  const doc = await PDFDocument.load(pdf);
  const pages = doc.getPages();
  const lastPage = pages[pages.length - 1];
  const { width: pw, height: ph } = lastPage.getSize();

  // הטמעת התמונות (רונדרו ב-3x — נצרבות ברוחב נקודות קטן פי 3 לחדות בזום).
  const stack: { img: any; url: string; w: number; h: number }[] = [];
  if (opts.signUrl) {
    const img = await doc.embedPng(SIGN_PNG);
    const w = 204;
    stack.push({ img, url: opts.signUrl, w, h: w * (img.height / img.width) });
  }
  if (opts.profileUrl) {
    const img = await doc.embedPng(PROFILE_PNG);
    const w = 250;
    stack.push({ img, url: opts.profileUrl, w, h: w * (img.height / img.width) });
  }
  const gap = 12;
  const stackH = stack.reduce((s, b) => s + b.h, 0) + gap * (stack.length - 1);
  const bottomMargin = 20; // שוליים תחתונים מינימליים (הוקטן כדי להעדיף הישארות בעמוד)
  const topGap = 16;       // רווח בין סוף הטקסט לכפתור הראשון (הוקטן — כפתורים גבוהים יותר)

  // מיקום: מיד מתחת לסוף התוכן בעמוד האחרון — גבוה ככל האפשר, בלי לעלות על טקסט/תמונות.
  // contentBottomY לוקח בחשבון גם טקסט וגם תמונות/גרפיקה (למשל טבלת חתימה ותעודות הסמכה),
  // כדי שהכפתורים לא ייצרבו עליהן. עמוד חדש נוצר רק אם באמת אין מקום פנוי בתחתית העמוד האחרון.
  let page = lastPage;
  const contentBottom = await contentBottomY(pdf, pages.length - 1, ph);
  let y: number; // הקצה העליון של ערימת הכפתורים
  if (contentBottom - topGap - stackH >= bottomMargin) {
    y = contentBottom - topGap;
  } else {
    page = doc.addPage([pw, ph]);
    y = ph - 90;
  }

  for (const b of stack) {
    const x = (pw - b.w) / 2;
    const by = y - b.h;
    page.drawImage(b.img, { x, y: by, width: b.w, height: b.h });
    const rect = [x, by, x + b.w, by + b.h];
    const linkDict = doc.context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: rect,
      Border: [0, 0, 0],
      A: { Type: 'Action', S: 'URI', URI: PDFString.of(b.url) },
    });
    const linkRef = doc.context.register(linkDict);
    const existing = page.node.Annots();
    if (existing instanceof PDFArray) existing.push(linkRef);
    else page.node.set(PDFName.of('Annots'), doc.context.obj([linkRef]));
    y = by - gap;
  }

  return Buffer.from(await doc.save());
}
