import { PDFDocument, PDFName, PDFString, PDFArray } from 'pdf-lib';
import { SIGN_BUTTON_PNG_BASE64 } from './sign-button-image';
import { PROFILE_BUTTON_PNG_BASE64 } from './profile-button-image';

const SIGN_PNG = Buffer.from(SIGN_BUTTON_PNG_BASE64, 'base64');
const PROFILE_PNG = Buffer.from(PROFILE_BUTTON_PNG_BASE64, 'base64');

/**
 * ה-y הנמוך ביותר של טקסט בעמוד (קואורדינטות pdf — מקור בתחתית-שמאל).
 * משמש כדי לצרוב את הכפתורים *מתחת* לתוכן ולא עליו. כשל בזיהוי → 0 (שמרני:
 * מניחים שהעמוד מלא, והכפתורים יעברו לעמוד חדש — בלי סיכון של עלייה על טקסט).
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
      const tc = await page.getTextContent();
      let minY = Infinity;
      for (const it of tc.items as any[]) {
        if (it?.str && String(it.str).trim() && Array.isArray(it.transform)) {
          const y = Number(it.transform[5]);
          if (isFinite(y) && y < minY) minY = y;
        }
      }
      // אין טקסט בעמוד → כולו פנוי.
      return isFinite(minY) ? Math.max(0, minY - 8) : pageHeight;
    } finally {
      try { await doc.destroy(); } catch { /* ignore */ }
    }
  } catch {
    return 0;
  }
}

/**
 * צורב בעמוד האחרון כפתורים לחיצים (תמונות PNG שאומתו ויזואלית — עברית קריאה):
 *   signUrl    → "לחץ כאן לחתימה" (ירוק)
 *   profileUrl → "ההסמכות שלנו ופרופיל החברה" (כחול)
 * הכפתורים ממוקמים מתחת לתוכן הקיים; אם אין מספיק מקום פנוי בתחתית העמוד האחרון —
 * נוסף עמוד חדש והכפתורים נצרבים בו (כדי לא לעלות על טקסט).
 */
export async function stampQuoteButtons(
  pdf: Buffer,
  opts: { signUrl?: string; profileUrl?: string },
): Promise<Buffer> {
  if (!opts.signUrl && !opts.profileUrl) return pdf;
  const doc = await PDFDocument.load(pdf);
  const pages = doc.getPages();
  let page = pages[pages.length - 1];
  const { width: pw, height: ph } = page.getSize();

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
  const bottomMargin = 30;
  const topGap = 24; // רווח בין סוף הטקסט לכפתור הראשון

  const contentBottom = await contentBottomY(pdf, pages.length - 1, ph);
  let y: number; // הקצה העליון של ערימת הכפתורים
  if (contentBottom - topGap - stackH >= bottomMargin) {
    y = contentBottom - topGap;
  } else {
    // אין מקום פנוי בתחתית העמוד האחרון → עמוד חדש, הכפתורים בחלקו העליון.
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
