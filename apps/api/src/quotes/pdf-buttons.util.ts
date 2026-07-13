import { PDFDocument, PDFName, PDFString, PDFArray } from 'pdf-lib';
import { SIGN_BUTTON_PNG_BASE64 } from './sign-button-image';
import { PROFILE_BUTTON_PNG_BASE64 } from './profile-button-image';

const SIGN_PNG = Buffer.from(SIGN_BUTTON_PNG_BASE64, 'base64');
const PROFILE_PNG = Buffer.from(PROFILE_BUTTON_PNG_BASE64, 'base64');

/**
 * מנתח עמוד ומחזיר שתי נקודות-y (קואורדינטות pdf, מקור בתחתית-שמאל):
 *   textBottom  — ה-y של בסיס הטקסט הנמוך ביותר בעמוד (איפה הטקסט נגמר).
 *   footerTop   — הקצה העליון של אשכול תמונות-הפוטר (תעודות הסמכה/לוגו בתחתית העמוד).
 *                 null אם אין תמונות פוטר. הכפתור אמור לשבת *מתחת לטקסט ומעל הפוטר*.
 * כשל בזיהוי → textBottom=null (שמרני).
 */
async function analyzePage(
  pdf: Buffer,
  pageIndex: number,
  pageHeight: number,
): Promise<{ textBottom: number | null; footerTop: number | null }> {
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

      // (1) טקסט — ה-y של בסיס הטקסט הנמוך ביותר.
      let textBottom = Infinity;
      const tc = await page.getTextContent();
      for (const it of tc.items as any[]) {
        if (it?.str && String(it.str).trim() && Array.isArray(it.transform)) {
          const y = Number(it.transform[5]);
          if (isFinite(y) && y < textBottom) textBottom = y;
        }
      }

      // (2) תמונות — אוספים את מלבני התמונות (bottom+top) כדי לזהות את אשכול הפוטר.
      //     אשכול הפוטר = תמונות שיושבות בשליש התחתון של העמוד. footerTop = הקצה העליון
      //     הגבוה ביותר מביניהן (מעליו מותר לצרוב את הכפתור, מתחתיו נמצא הפוטר).
      const imgRects: Array<{ bottom: number; top: number }> = [];
      try {
        const opList = await page.getOperatorList();
        const OPS = pdfjs.OPS || {};
        const imageOps = new Set(
          [OPS.paintImageXObject, OPS.paintInlineImage, OPS.paintImageMaskXObject, OPS.paintJpegXObject].filter(
            (x: any) => typeof x === 'number',
          ),
        );
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
            // בקואורדינטות היחידה: התמונה תופסת 0..1 בשני הצירים; לכן הגובה = |ctm[3]|.
            const bottom = ctm[5];
            const top = ctm[5] + Math.abs(ctm[3]);
            if (isFinite(bottom) && isFinite(top)) imgRects.push({ bottom, top });
          }
        }
      } catch { /* אם רשימת האופרטורים נכשלת — מסתמכים על הטקסט בלבד */ }

      // אשכול הפוטר: תמונות שכולן בשליש התחתון של העמוד (top < pageHeight/3).
      // footerTop = ה-top הגבוה ביותר מביניהן. אם אין — null (אין פוטר לחסום).
      let footerTop: number | null = null;
      for (const r of imgRects) {
        if (r.top < pageHeight / 3) {
          if (footerTop === null || r.top > footerTop) footerTop = r.top;
        }
      }

      return {
        textBottom: isFinite(textBottom) ? textBottom : null,
        footerTop,
      };
    } finally {
      try { await doc.destroy(); } catch { /* ignore */ }
    }
  } catch {
    return { textBottom: null, footerTop: null };
  }
}

/**
 * צורב כפתורים לחיצים (תמונות PNG שאומתו ויזואלית — עברית קריאה) בתוך ה-PDF:
 *   signUrl    → "לחץ כאן לחתימה" (ירוק)  — קישור לטופס החתימה
 *   profileUrl → "לחץ כאן להסמכות שלנו" (כחול) — קישור לפרופיל+רישיונות (משמש רק בשליחת וואטסאפ)
 *
 * מיקום: הכפתור נצרב מיד *מתחת לטקסט האחרון* בעמוד האחרון — ולא בעמוד נפרד. אם יש
 * תמונות פוטר (תעודות/לוגו) בתחתית, הכפתור נשאר בין סוף הטקסט לבין ראש הפוטר; אם המרווח
 * צר, הכפתור מוקטן כדי להיכנס (עד גבול מינימלי) במקום לעבור לעמוד חדש. עמוד חדש נוסף רק
 * במקרה קיצוני שבו באמת אין שום מרווח סביר מתחת לטקסט.
 */
export async function stampQuoteButtons(
  pdf: Buffer,
  opts: { signUrl?: string; profileUrl?: string },
): Promise<Buffer> {
  if (!opts.signUrl && !opts.profileUrl) return pdf;
  const doc = await PDFDocument.load(pdf);
  const pages = doc.getPages();
  const lastPage = pages[pages.length - 1];
  const lastIdx = pages.length - 1;
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
  const fullStackH = stack.reduce((s, b) => s + b.h, 0) + gap * (stack.length - 1);
  const topGap = 12;       // רווח בין סוף הטקסט לכפתור הראשון
  const footerPad = 8;     // רווח מינימלי בין הכפתור לראש הפוטר
  const bottomMargin = 16; // שוליים תחתונים כשאין פוטר

  // ── בחירת עמוד ומיקום: מעדיפים את העמוד האחרון, מתחת לטקסט האחרון ומעל הפוטר ──
  const analysis = await analyzePage(pdf, lastIdx, ph);
  // סוף הטקסט (אם אין טקסט — מניחים אמצע העמוד כדי לא להיתקע גבוה מדי).
  const textBottom = analysis.textBottom ?? ph * 0.5;
  // הרצפה שמעליה מותר לצרוב: ראש הפוטר (אם קיים) אחרת השוליים התחתונים.
  const floorY = analysis.footerTop != null ? analysis.footerTop + footerPad : bottomMargin;

  // ה-y הפנוי מתחת לטקסט ועד הרצפה.
  const available = (textBottom - topGap) - floorY;

  let page = lastPage;
  let topY: number;        // הקצה העליון של הכפתור הראשון
  let scale = 1;           // קנה-מידה של הכפתורים (מוקטן אם צריך כדי להיכנס)

  const MIN_SCALE = 0.6;   // לא מקטינים מתחת ל-60% (עדיין קריא)
  if (available >= fullStackH) {
    // יש מספיק מקום — צורבים בגודל מלא מיד מתחת לטקסט.
    topY = textBottom - topGap;
  } else if (available >= fullStackH * MIN_SCALE) {
    // מרווח צר — מקטינים את הכפתור כדי שייכנס בין הטקסט לפוטר.
    scale = available / fullStackH;
    topY = textBottom - topGap;
  } else {
    // באמת אין מקום סביר מתחת לטקסט בעמוד האחרון — מוצא אחרון: עמוד חדש.
    page = doc.addPage([pw, ph]);
    topY = ph - 90;
    scale = 1;
  }

  let y = topY;
  for (const b of stack) {
    const w = b.w * scale;
    const h = b.h * scale;
    const x = (pw - w) / 2;
    const by = y - h;
    page.drawImage(b.img, { x, y: by, width: w, height: h });
    const rect = [x, by, x + w, by + h];
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
    y = by - gap * scale;
  }

  return Buffer.from(await doc.save());
}
