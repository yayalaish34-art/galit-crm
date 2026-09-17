/**
 * מונע מכותרת להישאר לבדה בתחתית עמוד כשמסמך Word מומר ל-PDF.
 *
 * הבעיה (דוח אקוסטי "אחים יפה 8", 2026-09-15): דוחות רבים דוחפים כותרת לעמוד הבא בעזרת
 * רצף של שורות ריקות (20 פסקאות ריקות לפני "4. מדידות הרעש") ולא בעזרת מעבר עמוד, ואף
 * כותרת אינה מסומנת "שמור עם הבא". כשהשורות הריקות נגמרות בדיוק בתחתית העמוד, הכותרת
 * נוחתת בשורה האחרונה והתוכן שלה עובר לעמוד הבא. זה על חוט השערה: הבדל זעיר במדדי הגופן
 * בין מחשבים קובע אם הכותרת נשארת או קופצת — ולכן במחשב של הכותב זה נראה תקין וב-PDF לא.
 * ההמרה עצמה אינה אשמה: Word שולחני מפיק בדיוק אותו עימוד.
 *
 * התיקון: keepNext לכל פסקה שנראית ככותרת, ולעד שתי הפסקאות הריקות שמיד אחריה, כך שהכותרת
 * תמיד עוברת לעמוד הבא יחד עם תחילת התוכן שלה. keepNext אינו מוסיף מעבר עמוד בשום מקום —
 * הוא פועל רק כשהכותרת הייתה נשארת יתומה, ולכן מסמך שעימודו תקין יוצא זהה.
 *
 * רק פסקאות ברמה העליונה של גוף המסמך — לא בתוך טבלאות, תיבות טקסט, כותרת עליונה/תחתונה.
 */

/** כמה פסקאות ריקות אחרי כותרת נכללות בשרשרת. יותר מזה — זה ריווח מכוון, לא חלק מהכותרת. */
const MAX_TRAILING_EMPTY = 2;
/** רצף ארוך יותר של "כותרות" צמודות הוא כנראה רשימה מודגשת — לא נועלים אותו. */
const MAX_HEADING_RUN = 3;
const MAX_HEADING_LENGTH = 80;

type Block =
  | { kind: 'p'; start: number; end: number; xml: string; empty: boolean; heading: boolean; boundary: boolean }
  | { kind: 'other'; start: number; end: number; boundary: boolean };

/** סוף האלמנט שמתחיל ב-start, כולל קינון של אותו תג (פסקה בתוך תיבת טקסט, טבלה בתוך טבלה). */
function elementEnd(xml: string, start: number, name: string): number {
  const re = new RegExp(`<(/?)${name}(?=[\\s>/])[^>]*?(/?)>`, 'g');
  re.lastIndex = start;
  let depth = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    if (m[1] === '/') depth--;
    else if (m[2] !== '/') depth++;
    if (depth === 0) return m.index + m[0].length;
  }
  return xml.length;
}

/**
 * הטקסט הגלוי של קטע XML.
 * `(?:\s[^>]*)?>` ולא `[^>]*>` — אחרת הביטוי תופס גם `<w:tc>`/`<w:tbl>` ובולע מבנה.
 */
function textOf(xml: string): string {
  let out = '';
  const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out += m[1];
  return out;
}

const isOn = (rPr: string, tag: string) =>
  new RegExp(`<w:${tag}(?:\\s+w:val="(?:1|true|on)")?\\s*/>`).test(rPr);

/** חלק התווים שמודגשים או מקווים — כותרת בדוחות האלה היא מודגשת ו/או עם קו תחתון. */
function emphasisRatio(paragraph: string): number {
  let total = 0;
  let emphasized = 0;
  const runRe = /<w:r(?=[\s>])[^>]*>([\s\S]*?)<\/w:r>/g;
  let m: RegExpExecArray | null;
  while ((m = runRe.exec(paragraph)) !== null) {
    const chars = textOf(m[1]).replace(/\s+/g, '').length;
    if (!chars) continue;
    const rPr = m[1].match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0] ?? '';
    const bold = isOn(rPr, 'b') || isOn(rPr, 'bCs');
    const underline = /<w:u\s+w:val="(?!none")[^"]+"/.test(rPr);
    total += chars;
    if (bold || underline) emphasized += chars;
  }
  return total ? emphasized / total : 0;
}

function classifyParagraph(xml: string, headingStyles: Set<string>) {
  const hasObject = /<w:drawing\b|<w:pict\b|<w:object\b|<mc:AlternateContent\b|<w:txbxContent\b/.test(xml);
  const hasField = /<w:fldChar\b|<w:fldSimple\b|<w:instrText\b/.test(xml);
  // מעבר עמוד/מקטע הוא גבול: כותרת שנעולה אליו הייתה נגררת לעמוד משלה.
  const boundary = /<w:br\b[^>]*w:type="page"/.test(xml) || /<w:sectPr\b/.test(xml);
  const text = textOf(xml).trim();
  const empty = text === '' && !hasObject && !hasField && !boundary;

  const pPr = xml.match(/<w:pPr(?:\s[^>]*)?>[\s\S]*?<\/w:pPr>/)?.[0] ?? '';
  const styleId = pPr.match(/<w:pStyle\s+w:val="([^"]+)"/)?.[1];
  const outline = /<w:outlineLvl\s+w:val="[0-8]"/.test(pPr) || (!!styleId && headingStyles.has(styleId));
  const looksLikeHeading =
    text.length >= 2 &&
    text.length <= MAX_HEADING_LENGTH &&
    !/[.,;!?]$/.test(text) &&
    emphasisRatio(xml) >= 0.5;

  return { empty, boundary, heading: !empty && !boundary && !hasObject && (outline || looksLikeHeading) };
}

/** מזהי הסגנונות שהם כותרות (outlineLvl 0-8) — מתוך word/styles.xml. */
export function headingStyleIds(stylesXml: string | null | undefined): Set<string> {
  const ids = new Set<string>();
  if (!stylesXml) return ids;
  const re = /<w:style\b[^>]*w:type="paragraph"[^>]*>[\s\S]*?<\/w:style>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stylesXml)) !== null) {
    const id = m[0].match(/w:styleId="([^"]+)"/)?.[1];
    if (id && /<w:outlineLvl\s+w:val="[0-8]"/.test(m[0])) ids.add(id);
  }
  return ids;
}

/** מוסיף <w:keepNext/> במקום החוקי ב-pPr (אחרי pStyle אם יש — סדר CT_PPr מחייב). */
function withKeepNext(paragraph: string): string {
  const pPr = paragraph.match(/<w:pPr(?:\s[^>]*)?>[\s\S]*?<\/w:pPr>/);
  if (pPr) {
    // קיים כבר (גם w:val="0" — החלטה מפורשת של הכותב) — לא נוגעים.
    if (/<w:keepNext\b/.test(pPr[0])) return paragraph;
    const open = pPr[0].match(/^<w:pPr(?:\s[^>]*)?>/)![0];
    const style = pPr[0].slice(open.length).match(/^<w:pStyle\b[^>]*\/>/)?.[0] ?? '';
    const patched = open + style + '<w:keepNext/>' + pPr[0].slice(open.length + style.length);
    return paragraph.replace(pPr[0], patched);
  }
  if (/^<w:p(?:\s[^>]*)?\/>$/.test(paragraph)) {
    return paragraph.replace(/\/>$/, '><w:pPr><w:keepNext/></w:pPr></w:p>');
  }
  const open = paragraph.match(/^<w:p(?:\s[^>]*)?>/);
  return open ? open[0] + '<w:pPr><w:keepNext/></w:pPr>' + paragraph.slice(open[0].length) : paragraph;
}

/**
 * מחזיר את document.xml עם keepNext על הכותרות, ואת מספר הפסקאות שסומנו.
 * `stylesXml` — אופציונלי, לזיהוי סגנונות כותרת מובנים.
 */
export function keepHeadingsWithNext(
  documentXml: string,
  stylesXml?: string | null,
): { xml: string; changed: number } {
  const bodyOpen = documentXml.match(/<w:body(?:\s[^>]*)?>/);
  const bodyClose = documentXml.lastIndexOf('</w:body>');
  if (!bodyOpen || bodyClose < 0) return { xml: documentXml, changed: 0 };

  const styles = headingStyleIds(stylesXml);
  const blocks: Block[] = [];
  let i = (bodyOpen.index ?? 0) + bodyOpen[0].length;
  while (i < bodyClose) {
    const lt = documentXml.indexOf('<', i);
    if (lt < 0 || lt >= bodyClose) break;
    const name = documentXml.slice(lt + 1, lt + 64).match(/^[\w:]+/)?.[0] ?? '';
    if (!name) {
      i = lt + 1;
      continue;
    }
    const end = elementEnd(documentXml, lt, name);
    if (name === 'w:p') {
      const xml = documentXml.slice(lt, end);
      blocks.push({ kind: 'p', start: lt, end, xml, ...classifyParagraph(xml, styles) });
    } else if (/^w:(bookmarkStart|bookmarkEnd|proofErr|permStart|permEnd)$/.test(name)) {
      // סימניות בין פסקאות אינן תוכן — מדלגים עליהן בלי לשבור את השרשרת.
    } else {
      // טבלה, sdt, sectPr וכל השאר: תוכן. sectPr סופי הוא גבול.
      blocks.push({ kind: 'other', start: lt, end, boundary: name === 'w:sectPr' });
    }
    i = end;
  }

  // רצפי "כותרות" צמודות (פסקאות ריקות ביניהן לא נספרות) ארוכים מדי — רשימה מודגשת.
  const suppressed = new Set<number>();
  for (let a = 0; a < blocks.length; ) {
    const block = blocks[a];
    if (block.kind !== 'p' || !block.heading) { a++; continue; }
    const run: number[] = [];
    let b = a;
    while (b < blocks.length) {
      const x = blocks[b];
      if (x.kind === 'p' && x.heading) run.push(b);
      else if (!(x.kind === 'p' && x.empty)) break;
      b++;
    }
    if (run.length > MAX_HEADING_RUN) run.forEach((n) => suppressed.add(n));
    a = b;
  }

  const mark = new Set<number>();
  blocks.forEach((block, n) => {
    if (block.kind !== 'p' || !block.heading || suppressed.has(n)) return;
    const chain = [n];
    let k = n + 1;
    while (k < blocks.length && blocks[k].kind === 'p' && (blocks[k] as { empty: boolean }).empty && chain.length <= MAX_TRAILING_EMPTY) {
      chain.push(k);
      k++;
    }
    const next = blocks[k];
    // אין תוכן אחרי הכותרת, או שהבא הוא עוד ריקה / מעבר עמוד — שרשרת כזו לא מצילה כלום.
    if (!next || next.boundary || (next.kind === 'p' && next.empty)) return;
    chain.forEach((c) => mark.add(c));
  });

  if (mark.size === 0) return { xml: documentXml, changed: 0 };

  let out = '';
  let cursor = 0;
  let changed = 0;
  blocks.forEach((block, n) => {
    if (!mark.has(n) || block.kind !== 'p') return;
    const patched = withKeepNext(block.xml);
    if (patched === block.xml) return;
    out += documentXml.slice(cursor, block.start) + patched;
    cursor = block.end;
    changed++;
  });
  return { xml: out + documentXml.slice(cursor), changed };
}
