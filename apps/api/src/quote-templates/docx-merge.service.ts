/**
 * מיזוג תבניות DOCX אמיתיות עם docxtemplater + PizZip.
 * פורמט משתנים ב-Word (ברירת מחדל docxtemplater): {fieldName} ולולאה {#items}…{/items}
 */

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

let Docxtemplater: any;
let PizZip: any;

function ensureDeps() {
  if (!Docxtemplater) {
    try {
      Docxtemplater = require('docxtemplater');
      PizZip = require('pizzip');
    } catch {
      throw new BadRequestException(
        'docxtemplater or pizzip not installed. Run: npm install docxtemplater pizzip',
      );
    }
  }
}

/** שורת פריט אחרי נרמול — לשימוש בתבנית בתוך {#items} */
export type DocxMergeItemRow = {
  lineNumber: string;
  sku: string;
  itemCode: string;
  description: string;
  quantity: string;
  unitPrice: string;
  lineDiscountPercent: string;
  lineTotal: string;
  /** תאימות לתבניות ישנות */
  rowNum: string;
  code: string;
  name: string;
  discountPct: string;
};

/**
 * גוף הבקשה ל-/merge-docx — שמות קנוניים + תמיכה בכינויי שדות ישנים (מנורמל ב-normalizeDocxMergePayload).
 */
export type DocxMergeData = {
  quoteNumber: string;
  contractSurveyNumber: string;
  quoteDate: string;
  validUntil: string;
  customerName: string;
  contactName: string;
  customerPhone: string;
  customerEmail: string;
  customerAddress: string;
  salesRepName: string;
  paymentTerms: string;
  subtotal: string;
  discountPercent: string;
  /** true אם discountPercent > 0 — מאפשר להסתיר את שורת ההנחה בתבנית עם {#hasDiscount}…{/hasDiscount} */
  hasDiscount?: boolean;
  /** true אם לפחות פריט אחד עם הנחת שורה > 0 — מסיר את עמודת "% הנחה לשורה" כשאין הנחות שורה */
  hasLineDiscount?: boolean;
  subtotalAfterDiscount: string;
  vatAmount: string;
  totalAmount: string;
  approverName: string;
  notes: string;
  items: DocxMergeItemRow[];
  /** כינויים ישנים / נוספים */
  customerCity?: string;
  contactTitle?: string;
  vat?: string;
  total?: string;
  validityDate?: string;
  /** טלפון ומייל של איש הקשר (לא שדות החברה) — לבלוק נמען */
  contactPhone?: string;
  contactEmail?: string;
  recipientLine1?: string;
  recipientLine2?: string;
  recipientLine3?: string;
  recipientLine4?: string;
  recipientLine5?: string;
  recipientLine6?: string;
  recipientLine7?: string;
};

function pickStr(r: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = r[k];
    if (v === null || v === undefined) continue;
    const s = typeof v === 'string' ? v : String(v);
    if (s.length > 0) return s;
  }
  return '';
}

function toNumber(s: string): number {
  const cleaned = (s || '').replace(/[^0-9.\-]/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function asRecord(x: unknown): Record<string, unknown> | null {
  return typeof x === 'object' && x !== null && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
}

/**
 * WordprocessingML לא מקבל תווי בקרה לא חוקיים ב-XML (למשל \u0000).
 * סניטציה לפני docxtemplater מונעת DOCX פגום/Repair ב-Word.
 */
function sanitizeDocxText(v: string): string {
  return v
    // XML 1.0 valid chars: \u0009, \u000A, \u000D, \u0020-\uD7FF, \uE000-\uFFFD
    .replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD]/g, '')
    // Normalize CRLF to LF for linebreak handling
    .replace(/\r\n/g, '\n');
}

function sanitizeDocxPayload(value: unknown): unknown {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return sanitizeDocxText(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map((x) => sanitizeDocxPayload(x));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = sanitizeDocxPayload(v);
    }
    return out;
  }
  return String(value);
}

/** סמן בתבנית Word — פסקה אחת שמוחלפת בבלוק שורות נמען (OOXML) */
export const DOCX_RECIPIENT_BLOCK_MARKER = '___RECIPIENT_BLOCK___';
const DOCX_RECIPIENT_BLOCK_MARKER_ALT = 'RECIPIENT_BLOCK';

/** במסמך RTL, הזחת w:left על פסקאות דוחפת את הבלוק שמאלה — המיקום הפיזי נעשה בטבלת תאים בתבנית. */
const RECIPIENT_BLOCK_LEFT_INDENT_TWIPS = 0;

const RTL_ONLY_RPR =
  /<w:rPr><w:rtl w:val="true"\/><\/w:rPr>/g;
const RTL_ONLY_RPR_REPLACEMENT =
  '<w:rPr><w:rFonts w:ascii="David" w:hAnsi="David" w:cs="David"/><w:sz w:val="28"/><w:szCs w:val="28"/><w:rtl w:val="true"/></w:rPr>';

function escapeXmlText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const NUM_TOKEN = /^\d+([/-]\d+)?$/;

/**
 * עיר בלבד: שדה עיר; אם ריק — חילוץ מהכתובת (אחרי פסיק, או סוף שורת כתובת ללא פסיק).
 */
export function extractCityOnly(cityField: string, addressField: string): string {
  const c = (cityField || '').trim();
  if (c) return c;
  const a = (addressField || '').trim();
  if (!a) return '';
  const commaParts = a.split(/[,،]/).map((x) => x.trim()).filter(Boolean);
  if (commaParts.length >= 2) return commaParts[commaParts.length - 1] ?? '';
  const one = commaParts[0] ?? a;
  let words = one.split(/\s+/).map((x) => x.trim()).filter(Boolean);
  while (words.length && NUM_TOKEN.test(words[words.length - 1])) {
    words = words.slice(0, -1);
  }
  const m = words.length;
  if (!m) return '';
  if (m >= 4) {
    const prev = words[m - 2];
    const last = words[m - 1];
    if (!NUM_TOKEN.test(prev) && !NUM_TOKEN.test(last)) {
      return `${prev} ${last}`.trim();
    }
  }
  if (m >= 3 && NUM_TOKEN.test(words[m - 2])) {
    return words[m - 1] ?? '';
  }
  if (m === 2) {
    const prev = words[0];
    const last = words[1];
    if (!NUM_TOKEN.test(prev) && !NUM_TOKEN.test(last)) {
      return `${prev} ${last}`.trim();
    }
    if (NUM_TOKEN.test(last)) return prev;
    return last;
  }
  if (m >= 3) {
    return words[m - 1] ?? '';
  }
  return words[0] ?? '';
}

function recipientLineParagraphOoxml(
  text: string,
  opts: { cityStyle?: boolean },
): string {
  const display = text === '' ? '\u200b' : text;
  const esc = escapeXmlText(display);
  const cityExtra = opts.cityStyle
    ? '<w:b/><w:bCs/><w:u w:val="single"/><w:lang w:val="he-IL" w:eastAsia="he-IL" w:bidi="he-IL"/>'
    : '';
  const ind =
    RECIPIENT_BLOCK_LEFT_INDENT_TWIPS > 0
      ? '<w:ind w:left="' + RECIPIENT_BLOCK_LEFT_INDENT_TWIPS + '"/>'
      : '';
  // במסמך RTL (bidi): w:jc start = יישור לקצה ההתחלה הלוגי = ימין ויזואלי; right לבד עלול להשאיר טקסט צמוד לשמאל התא.
  return (
    '<w:p>' +
    '<w:pPr><w:bidi/><w:jc w:val="start"/>' +
    ind +
    '</w:pPr>' +
    '<w:r>' +
    '<w:rPr>' +
    '<w:rFonts w:ascii="David" w:hAnsi="David" w:cs="David"/>' +
    '<w:sz w:val="28"/><w:szCs w:val="28"/>' +
    cityExtra +
    '<w:rtl/>' +
    '</w:rPr>' +
    '<w:t xml:space="preserve">' +
    esc +
    '</w:t>' +
    '</w:r>' +
    '</w:p>'
  );
}

export function buildRecipientBlockOoxml(data: DocxMergeData): string {
  const companyLineRaw = (data.recipientLine3 ?? '').trim();
  const lines: Array<{ text: string; cityStyle: boolean }> = [];
  lines.push({ text: data.recipientLine1 ?? 'לכבוד', cityStyle: false });
  lines.push({ text: data.recipientLine2 ?? '', cityStyle: false });
  if (companyLineRaw) {
    lines.push({ text: companyLineRaw, cityStyle: false });
  }
  const cityLine = (data.recipientLine4 ?? '').trim();
  if (cityLine) {
    lines.push({ text: cityLine, cityStyle: true });
  }
  lines.push({ text: data.recipientLine5 ?? 'טלפון נייד: ', cityStyle: false });
  lines.push({ text: data.recipientLine6 ?? 'מייל: ', cityStyle: false });
  lines.push({
    text: data.recipientLine7 ?? `תאריך: ${(data.quoteDate ?? '').trim()}`,
    cityStyle: false,
  });
  return lines.map((x) => recipientLineParagraphOoxml(x.text, { cityStyle: x.cityStyle })).join('');
}

/** ריצות עם rtl בלבד (בלי גודל פונט) — מוסיפים David 14 לטקסט ממוזג בגוף המסמך ובטבלאות */
function patchRtlOnlyRunsDavid14(documentXml: string): string {
  return documentXml.replace(RTL_ONLY_RPR, RTL_ONLY_RPR_REPLACEMENT);
}

/** סכום רוחב העמודות (gridCol) של טבלה ב-OOXML, או null אם אין tblGrid */
function tableGridWidth(tbl: string): number | null {
  const grid = tbl.match(/<w:tblGrid>[\s\S]*?<\/w:tblGrid>/);
  if (!grid) return null;
  const cols: string[] = grid[0].match(/<w:gridCol[^>]*\/>/g) || [];
  if (!cols.length) return null;
  return cols.reduce((sum: number, c: string) => {
    const m = c.match(/w:w="(\d+)"/);
    return sum + (m ? parseInt(m[1], 10) : 0);
  }, 0);
}

/** מקבע <w:jc w:val="right"/> ב-tblPr של טבלה (מוסיף אם חסר, מחליף אם שונה) */
function forceTableRightAlign(tbl: string): string {
  if (/<w:tblPr>[\s\S]*?<w:jc\b[^>]*\/>/.test(tbl)) {
    return tbl.replace(/(<w:tblPr>[\s\S]*?)<w:jc\b[^>]*\/>/, '$1<w:jc w:val="right"/>');
  }
  // אין jc — מזריקים מיד אחרי פתיחת tblPr (או יוצרים tblPr אם חסר)
  if (/<w:tblPr>/.test(tbl)) {
    return tbl.replace(/<w:tblPr>/, '<w:tblPr><w:jc w:val="right"/>');
  }
  return tbl.replace(/<w:tbl>/, '<w:tbl><w:tblPr><w:jc w:val="right"/></w:tblPr>');
}

/**
 * יישור שתי טבלאות המחיר (פריטים + סיכום) לקו ימני סימטרי במסמך RTL.
 * 1. מקבע jc=right בשתי הטבלאות → שתיהן צמודות לקצה הימני של העמוד.
 * 2. מרחיב את הטבלה הצרה יותר (בד"כ טבלת הסיכום) כך שרוחבה הכולל
 *    יהיה זהה לטבלה הרחבה — ע"י הוספת ההפרש לעמודה השמאלית-ביותר
 *    (ב-RTL זו העמודה הראשונה ב-gridCol, הקצה השמאלי הפיזי).
 *    כך הקצה הימני של שתי הטבלאות מיושר וגם הקצה השמאלי סימטרי.
 */
export function alignPriceTablesRight(documentXml: string): string {
  const tblRe = /<w:tbl>[\s\S]*?<\/w:tbl>/g;
  const tables: Array<{ start: number; end: number; text: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = tblRe.exec(documentXml)) !== null) {
    tables.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
  }

  // זיהוי הטבלאות הרלוונטיות לפי placeholders שמופיעים בהן.
  // הזיהוי רץ גם אחרי render (אז ייתכן שאין placeholders) — לכן בודקים
  // גם תוויות עבריות וגם placeholders, ונופלים חזרה לרוחב.
  const isItemsTable = (t: string) =>
    /\{(?:lineTotal|rowNum|lineNumber)\}/.test(t) || /fldDiscount|מק"ט|תיאור/.test(t);
  const isSummaryTable = (t: string) =>
    /\{(?:subtotalAfterDiscount|totalAmount|total|vat)\}/.test(t) ||
    /fldTotalAfterMaaM|fldTotalAfterDiscount|fldMAAM/.test(t);

  const itemsIdx = tables.findIndex((t) => isItemsTable(t.text));
  let summaryIdx = -1;
  for (let i = 0; i < tables.length; i++) {
    if (i !== itemsIdx && isSummaryTable(tables[i].text)) {
      summaryIdx = i;
      break;
    }
  }
  if (itemsIdx === -1 || summaryIdx === -1) return documentXml;

  const itemsWidth = tableGridWidth(tables[itemsIdx].text);
  const summaryWidth = tableGridWidth(tables[summaryIdx].text);

  // קביעת יישור ימני לשתי הטבלאות
  let itemsText = forceTableRightAlign(tables[itemsIdx].text);
  let summaryText = forceTableRightAlign(tables[summaryIdx].text);

  // הרחבת הטבלה הצרה לרוחב הטבלה הרחבה (הוספת ההפרש לעמודה הראשונה ב-gridCol)
  if (itemsWidth != null && summaryWidth != null && itemsWidth !== summaryWidth) {
    const wide = itemsWidth > summaryWidth ? itemsWidth : summaryWidth;
    const narrow = itemsWidth > summaryWidth ? summaryWidth : itemsWidth;
    const diff = wide - narrow;
    const narrowIsSummary = summaryWidth < itemsWidth;
    const apply = (t: string) =>
      t.replace(/<w:tblGrid>[\s\S]*?<\/w:tblGrid>/, (grid) => {
        let first = true;
        return grid.replace(/<w:gridCol[^>]*\/>/g, (g) => {
          if (!first) return g;
          first = false;
          const wm = g.match(/w:w="(\d+)"/);
          const cur = wm ? parseInt(wm[1], 10) : 0;
          return g.replace(/w:w="\d+"/, `w:w="${cur + diff}"`);
        });
      });
    if (narrowIsSummary) summaryText = apply(summaryText);
    else itemsText = apply(itemsText);
  }

  // הרכבה מחדש — מהאינדקס הגבוה לנמוך כדי לא לשבש היסטים
  const edits = [
    { start: tables[itemsIdx].start, end: tables[itemsIdx].end, text: itemsText },
    { start: tables[summaryIdx].start, end: tables[summaryIdx].end, text: summaryText },
  ].sort((a, b) => b.start - a.start);
  let out = documentXml;
  for (const e of edits) {
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
  }
  return out;
}

function injectRecipientBlockOoxml(documentXml: string, blockOoxml: string): string {
  const markerList = [DOCX_RECIPIENT_BLOCK_MARKER, DOCX_RECIPIENT_BLOCK_MARKER_ALT];
  let markerIndex = -1;
  for (const marker of markerList) {
    markerIndex = documentXml.indexOf(marker);
    if (markerIndex !== -1) break;
  }
  if (markerIndex === -1) return documentXml;
  let scan = markerIndex;
  let pStart = -1;
  while (scan >= 0) {
    const pSpace = documentXml.lastIndexOf('<w:p ', scan);
    const pBare = documentXml.lastIndexOf('<w:p>', scan);
    const cand = Math.max(pSpace, pBare);
    if (cand === -1) break;
    const between = documentXml.slice(cand, markerIndex);
    if (!between.includes('</w:p>')) {
      pStart = cand;
      break;
    }
    scan = cand - 1;
  }
  if (pStart === -1) return documentXml;
  const pEnd = documentXml.indexOf('</w:p>', markerIndex);
  if (pEnd === -1) return documentXml;
  return documentXml.slice(0, pStart) + blockOoxml + documentXml.slice(pEnd + '</w:p>'.length);
}

/**
 * מסיר עמודה שלמה מטבלה ב-OOXML לפי placeholder שמופיע באחד מתאיה.
 * מסיר את ה-<w:gridCol> המתאים ואת ה-<w:tc> באותו אינדקס מכל שורות הטבלה.
 * מניח תאים שטוחים (ללא טבלאות מקוננות) — כפי שקיים בתבניות הצעות המחיר.
 */
export function removeTableColumnByPlaceholder(documentXml: string, placeholder: string): string {
  const idx = documentXml.indexOf(placeholder);
  if (idx === -1) return documentXml;

  const tblStart = documentXml.lastIndexOf('<w:tbl>', idx);
  const tblEndMarker = documentXml.indexOf('</w:tbl>', idx);
  if (tblStart === -1 || tblEndMarker === -1) return documentXml;
  const tblEnd = tblEndMarker + '</w:tbl>'.length;
  let tbl = documentXml.slice(tblStart, tblEnd);

  // איתור שורת הלולאה שמכילה את ה-placeholder
  const relIdx = tbl.indexOf(placeholder);
  const trRe = /<w:tr[ >][\s\S]*?<\/w:tr>/g;
  let mr: RegExpExecArray | null;
  let targetTr: string | null = null;
  while ((mr = trRe.exec(tbl)) !== null) {
    if (relIdx >= mr.index && relIdx < mr.index + mr[0].length) {
      targetTr = mr[0];
      break;
    }
  }
  if (targetTr == null) return documentXml;

  // אינדקס העמודה (תא) שמכיל את ה-placeholder
  const tcRe = /<w:tc>[\s\S]*?<\/w:tc>/g;
  let mc: RegExpExecArray | null;
  let colIndex = -1;
  let ci = 0;
  while ((mc = tcRe.exec(targetTr)) !== null) {
    if (mc[0].indexOf(placeholder) !== -1) {
      colIndex = ci;
      break;
    }
    ci++;
  }
  if (colIndex === -1) return documentXml;

  // הסרת ה-gridCol המתאים — תוך חלוקה מחדש של רוחבו ליתר העמודות,
  // כדי שהרוחב הכולל של הטבלה יישמר (אחרת הטבלה מצטמצמת והקצה הימני זז).
  tbl = tbl.replace(/<w:tblGrid>[\s\S]*?<\/w:tblGrid>/, (grid) => {
    const widths = (grid.match(/<w:gridCol[^>]*\/>/g) || []).map((g) => {
      const m = g.match(/w:w="(\d+)"/);
      return m ? parseInt(m[1], 10) : 0;
    });
    const removedWidth = widths[colIndex] ?? 0;
    const remaining = widths.filter((_, i) => i !== colIndex);
    const remainingSum = remaining.reduce((a, b) => a + b, 0);
    // פיזור רוחב העמודה שנמחקה יחסית לרוחב הקיים של שאר העמודות
    let distributed = 0;
    const newWidths = remaining.map((w, i) => {
      if (remainingSum <= 0) return w;
      // העמודה האחרונה בולעת את שארית העיגול כדי לשמור על סכום מדויק
      if (i === remaining.length - 1) return w + (removedWidth - distributed);
      const add = Math.round((removedWidth * w) / remainingSum);
      distributed += add;
      return w + add;
    });
    let gi = 0;
    return grid.replace(/<w:gridCol[^>]*\/>/g, (g) => {
      if (gi === colIndex) {
        gi++;
        return '';
      }
      const widthIdx = gi < colIndex ? gi : gi - 1;
      gi++;
      const nw = newWidths[widthIdx];
      return nw != null ? g.replace(/w:w="\d+"/, `w:w="${nw}"`) : g;
    });
  });

  // הסרת התא באותו אינדקס מכל שורה
  tbl = tbl.replace(/<w:tr[ >][\s\S]*?<\/w:tr>/g, (tr) => {
    let k = 0;
    return tr.replace(/<w:tc>[\s\S]*?<\/w:tc>/g, (tc) => (k++ === colIndex ? '' : tc));
  });

  return documentXml.slice(0, tblStart) + tbl + documentXml.slice(tblEnd);
}

/**
 * חלק גדול מהתבניות מכילות סימנייה ריקה fldCity (מיקום עיר הלקוח במכתב) —
 * בלי placeholder בתוכה ובלי {customerCity} בשום מקום אחר במסמך. התוצאה:
 * עיר הלקוח לעולם לא מודפסת, גם כשללקוח יש עיר.
 *
 * הפונקציה רצה לפני render: אם סימניית fldCity ריקה (אין בה {customerCity}
 * ואין טקסט), ואין {customerCity} במקום אחר בתבנית — מזריקה ריצת טקסט עם
 * {customerCity} בתוך הסימנייה, תוך שימוש בעיצוב הריצה של פסקת הסימנייה
 * (David, מודגש, קו תחתון, RTL). docxtemplater מחליף אח״כ את ה-placeholder.
 * אם כבר קיים {customerCity} (בסימנייה או בתבנית) — לא נוגעת, כדי לא לכפול.
 */
export function ensureCityPlaceholderInBookmark(documentXml: string): string {
  // אם כבר יש placeholder עיר כלשהו בתבנית — אין מה לעשות
  if (documentXml.includes('{customerCity}')) return documentXml;

  const startRe = /<w:bookmarkStart\b[^>]*\bw:name="fldCity"[^>]*\/>/;
  const sm = startRe.exec(documentXml);
  if (!sm) return documentXml;
  const startEnd = sm.index + sm[0].length;

  const endRe = /<w:bookmarkEnd\b[^>]*\/>/g;
  endRe.lastIndex = startEnd;
  const em = endRe.exec(documentXml);
  if (!em) return documentXml;

  // הסימנייה כבר מכילה טקסט/ריצה — לא מזריקים
  const inner = documentXml.slice(startEnd, em.index);
  if (/<w:t[ >]/.test(inner)) return documentXml;

  // עיצוב הריצה: מתוך <w:rPr> של פסקת הסימנייה אם קיים, אחרת David 14 מודגש קו-תחתון RTL
  let rPr =
    '<w:rPr><w:rFonts w:cs="David"/><w:b/><w:bCs/><w:sz w:val="28"/><w:szCs w:val="28"/><w:u w:val="single"/><w:rtl/></w:rPr>';
  const pStart = Math.max(
    documentXml.lastIndexOf('<w:p ', sm.index),
    documentXml.lastIndexOf('<w:p>', sm.index),
  );
  if (pStart !== -1) {
    const pPrM = documentXml.slice(pStart, sm.index).match(/<w:pPr>[\s\S]*?<\/w:pPr>/);
    const rPrM = pPrM ? pPrM[0].match(/<w:rPr>[\s\S]*?<\/w:rPr>/) : null;
    if (rPrM) rPr = rPrM[0];
  }

  const run = `<w:r>${rPr}<w:t xml:space="preserve">{customerCity}</w:t></w:r>`;
  return documentXml.slice(0, startEnd) + run + documentXml.slice(startEnd);
}

/**
 * מבטל הדגשה (bold) מריצת הכתובת {customerAddress}. בכ-43 מתוך התבניות ריצת
 * הכתובת הוגדרה מודגשת (<w:b/><w:bCs/>) — לבקשת המשתמש הכתובת לא צריכה להיות
 * מודגשת. מסירים רק את <w:b/>/<w:bCs/> מ-rPr של הריצה שמכילה את ה-placeholder;
 * קו תחתון, פונט וגודל נשארים. רץ לפני render בזמן שה-placeholder עדיין קיים.
 */
export function unboldAddressRun(documentXml: string): string {
  const ph = '{customerAddress}';
  const i = documentXml.indexOf(ph);
  if (i === -1) return documentXml;

  // הריצה שמכילה את ה-placeholder
  const runStart = Math.max(
    documentXml.lastIndexOf('<w:r>', i),
    documentXml.lastIndexOf('<w:r ', i),
  );
  if (runStart === -1) return documentXml;
  const runEndMarker = documentXml.indexOf('</w:r>', i);
  if (runEndMarker === -1) return documentXml;
  const runEnd = runEndMarker + '</w:r>'.length;
  const run = documentXml.slice(runStart, runEnd);

  // הסרת סימני ההדגשה מ-rPr של הריצה בלבד
  const stripped = run
    .replace(/<w:b\/>/g, '')
    .replace(/<w:b\s[^>]*\/>/g, '')
    .replace(/<w:bCs\/>/g, '')
    .replace(/<w:bCs\s[^>]*\/>/g, '');
  if (stripped === run) return documentXml;
  return documentXml.slice(0, runStart) + stripped + documentXml.slice(runEnd);
}

/**
 * מסיר פסקאות ריקות שנמצאות בין פסקת הכתובת ({customerAddress}) לבין פסקת
 * העיר (סימניית fldCity) — שורת הרווח שהמשתמש ביקש להסיר. חלק מהתבניות הוסיפו
 * <w:p/> ריקה בין השתיים, כך שבמסמך הממוזג נוצרה שורה ריקה בין הכתובת לעיר.
 * מסיר כל פסקה שאין בה טקסט (<w:t) בין סוף פסקת הכתובת לתחילת פסקת ה-fldCity.
 * רץ לפני render. אם אין כתובת/עיר או אין פסקה ריקה ביניהן — לא נוגע.
 */
export function removeBlankLineBetweenAddressAndCity(documentXml: string): string {
  const addrIdx = documentXml.indexOf('{customerAddress}');
  if (addrIdx === -1) return documentXml;

  // סוף פסקת הכתובת
  const addrParaEndMarker = documentXml.indexOf('</w:p>', addrIdx);
  if (addrParaEndMarker === -1) return documentXml;
  const addrParaEnd = addrParaEndMarker + '</w:p>'.length;

  // תחילת פסקת ה-fldCity (העיר)
  const cityBookmark = documentXml.search(
    /<w:bookmarkStart\b[^>]*\bw:name="fldCity"[^>]*\/>/,
  );
  if (cityBookmark === -1 || cityBookmark <= addrParaEnd) return documentXml;
  const cityParaStart = Math.max(
    documentXml.lastIndexOf('<w:p ', cityBookmark),
    documentXml.lastIndexOf('<w:p>', cityBookmark),
  );
  if (cityParaStart === -1 || cityParaStart < addrParaEnd) return documentXml;

  // המקטע בין פסקת הכתובת לפסקת העיר — מכיל אפס או יותר פסקאות ריקות
  const between = documentXml.slice(addrParaEnd, cityParaStart);
  // הסרת פסקאות שאין בהן טקסט (<w:t) — שורות הרווח. פסקה עם טקסט נשמרת.
  const cleaned = between.replace(
    /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g,
    (p) => (/<w:t[ >]/.test(p) ? p : ''),
  );
  if (cleaned === between) return documentXml;
  return documentXml.slice(0, addrParaEnd) + cleaned + documentXml.slice(cityParaStart);
}

/**
 * הזרקת שורת "הנחה {discountPercent}" לטבלת הסיכום כשהיא חסרה.
 * חלק מהתבניות (10 מתוך 63) בנו טבלת סיכום בלי שורת הנחה — רק
 * "לאחר הנחה" / "מע״מ" / "סה״כ לתשלום" — כך שגם כשיש הנחה היא לא הוצגה.
 * הפונקציה רצה לפני render: מזהה את שורת {subtotalAfterDiscount},
 * משכפלת אותה, מחליפה תווית→"הנחה" ו-placeholder→{discountPercent},
 * ומכניסה אותה מעל. אם כבר קיים {discountPercent} בטבלה — לא נוגעת.
 *
 * נקראת רק כש-hasDiscount=true, כדי שלא להוסיף שורה כשאין הנחה.
 */
export function ensureDiscountRowInSummary(documentXml: string): string {
  const afterPh = '{subtotalAfterDiscount}';
  const discPh = '{discountPercent}';
  const i = documentXml.indexOf(afterPh);
  if (i === -1) return documentXml;

  const tblStart = documentXml.lastIndexOf('<w:tbl>', i);
  const tblEndMarker = documentXml.indexOf('</w:tbl>', i);
  if (tblStart === -1 || tblEndMarker === -1) return documentXml;
  const tblEnd = tblEndMarker + '</w:tbl>'.length;
  const tbl = documentXml.slice(tblStart, tblEnd);

  // אם כבר יש שורת הנחה בטבלה — לא מוסיפים
  if (tbl.indexOf(discPh) !== -1) return documentXml;

  // איתור שורת {subtotalAfterDiscount} בתוך הטבלה
  const relIdx = tbl.indexOf(afterPh);
  const trRe = /<w:tr[ >][\s\S]*?<\/w:tr>/g;
  let mr: RegExpExecArray | null;
  let afterRow: string | null = null;
  let afterRowStart = -1;
  while ((mr = trRe.exec(tbl)) !== null) {
    if (relIdx >= mr.index && relIdx < mr.index + mr[0].length) {
      afterRow = mr[0];
      afterRowStart = mr.index;
      break;
    }
  }
  if (afterRow == null) return documentXml;

  // בניית שורת ההנחה: שכפול שורת "לאחר הנחה", החלפת ה-placeholder
  // והחלפת תווית הטקסט בתא התווית ל"הנחה".
  let discountRow = afterRow.replace(discPhAll(afterPh), discPh);
  // החלפת טקסט התווית (התא הראשון) ל"הנחה" — מחליפים את תוכן ה-<w:t> הראשון
  // שאינו ה-placeholder. ה-placeholder יושב בתא הערך, התווית בתא הנפרד.
  discountRow = replaceFirstLabelText(discountRow, 'הנחה ');

  const newTbl =
    tbl.slice(0, afterRowStart) + discountRow + tbl.slice(afterRowStart);
  return documentXml.slice(0, tblStart) + newTbl + documentXml.slice(tblEnd);
}

/** RegExp בטוח להחלפת מחרוזת placeholder ליטרלית */
function discPhAll(s: string): RegExp {
  return new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
}

/**
 * מחליף את הטקסט בתוך ה-<w:t> הראשון בשורה (תא התווית) בתווית חדשה.
 * שומר על עיצוב הריצה הקיים.
 */
function replaceFirstLabelText(rowXml: string, newLabel: string): string {
  const esc = newLabel
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  let replaced = false;
  return rowXml.replace(/(<w:t\b[^>]*>)([\s\S]*?)(<\/w:t>)/, (m, open, _txt, close) => {
    if (replaced) return m;
    replaced = true;
    const openTag = open.includes('xml:space') ? open : open.replace('>', ' xml:space="preserve">');
    return `${openTag}${esc}${close}`;
  });
}

/**
 * כשאין הנחה כללית — התווית "סה״כ לאחר הנחה" בטבלת הסיכום מטעה (אין הנחה שאחריה).
 * הפונקציה מחליפה את הטקסט "סה״כ לאחר הנחה" → "סה״כ" בשורת {subtotalAfterDiscount}.
 * מטפלת בכל וריאציית הגרשיים (״ / " / '') ובטקסט מפוצל לכמה ריצות. רצה רק כשאין הנחה כללית,
 * לפני render. אם התווית לא קיימת — לא נוגעת.
 */
export function relabelSubtotalAfterDiscountWhenNoDiscount(documentXml: string): string {
  const ph = '{subtotalAfterDiscount}';
  const phIdx = documentXml.indexOf(ph);
  if (phIdx === -1) return documentXml;

  // גבולות השורה (<w:tr>) שמכילה את ה-placeholder של הסכום — התווית יושבת באותה שורה, בתא נפרד.
  const trStart = Math.max(
    documentXml.lastIndexOf('<w:tr>', phIdx),
    documentXml.lastIndexOf('<w:tr ', phIdx),
  );
  if (trStart === -1) return documentXml;
  const trEndMarker = documentXml.indexOf('</w:tr>', phIdx);
  if (trEndMarker === -1) return documentXml;
  const trEnd = trEndMarker + '</w:tr>'.length;
  let tr = documentXml.slice(trStart, trEnd);

  // 1) המקרה הנפוץ: הטקסט "סה״כ לאחר הנחה" נמצא ב-<w:t> יחיד. מחליפים ל"סה״כ".
  //    מכסה גרש עברי (״), מרכאות ASCII ("), שני גרשים בודדים ('') וכן רווחים משתנים.
  const singleRunRe = /(<w:t\b[^>]*>)\s*סה(?:״|"|'')?כ\s+לאחר\s+הנחה\s*(<\/w:t>)/;
  if (singleRunRe.test(tr)) {
    const fixed = tr.replace(singleRunRe, (_m, open, close) => `${open}סה״כ${close}`);
    return documentXml.slice(0, trStart) + fixed + documentXml.slice(trEnd);
  }

  // 2) נפילה-חזרה: הטקסט מפוצל לכמה ריצות. מוחקים "לאחר הנחה" מכל <w:t> שמכיל אותו,
  //    ומשאירים את "סה״כ" (הרעיון: להסיר את המילים "לאחר הנחה" בלבד).
  const strippedTr = tr.replace(/(<w:t\b[^>]*>)([\s\S]*?)(<\/w:t>)/g, (m, open, txt, close) => {
    if (!/לאחר\s+הנחה/.test(txt)) return m;
    const nt = txt.replace(/\s*לאחר\s+הנחה/g, '').replace(/\s+$/, '');
    return `${open}${nt}${close}`;
  });
  if (strippedTr !== tr) {
    return documentXml.slice(0, trStart) + strippedTr + documentXml.slice(trEnd);
  }
  return documentXml;
}

/**
 * מסיר את שורת "% הנחה {discountPercent}" מטבלת הסיכום — לשימוש כאשר יש הנחת-שורה אך אין
 * הנחה כללית: זוג הטבלאות המלא ({#hasDiscount}) מרונדר כדי להציג את עמודת הנחת-השורה, אך
 * שורת ההנחה הכללית מיותרת (הייתה מציגה "% הנחה: 0"). מסיר את ה-<w:tr> שמכיל את
 * {discountPercent}. אם ה-placeholder לא קיים בתבנית — לא נוגע.
 */
export function removeSummaryDiscountRow(documentXml: string): string {
  const ph = '{discountPercent}';
  const idx = documentXml.indexOf(ph);
  if (idx === -1) return documentXml;
  const trStart = Math.max(
    documentXml.lastIndexOf('<w:tr>', idx),
    documentXml.lastIndexOf('<w:tr ', idx),
  );
  if (trStart === -1) return documentXml;
  // ודא שה-placeholder באמת בתוך שורה זו (אין </w:tr> בין תחילת השורה ל-placeholder)
  if (documentXml.slice(trStart, idx).includes('</w:tr>')) return documentXml;
  const trEndMarker = documentXml.indexOf('</w:tr>', idx);
  if (trEndMarker === -1) return documentXml;
  const trEnd = trEndMarker + '</w:tr>'.length;
  return documentXml.slice(0, trStart) + documentXml.slice(trEnd);
}

/**
 * מסיר מ-document.xml כל פסקה שמכילה את שורת ה"פקס" הישנה — כדי שאף מסמך ממוזג
 * לא יכלול אותה, גם כשהיא צרובה בקובץ ה-DOCX של התבנית עצמה. מכסה את שתי הגרסאות:
 *   "לתיאום הגעה, נא לחתום ולשלוח לפקס 09-7724446. תודה."
 *   "אישור ההצעה: נא לשלוח את ההצעה חתומה לפקס 09-7724446 ..."
 * הזיהוי לפי הטקסט המשורשר של הפסקה (מספר הפקס או ניסוח "לשלוח...לפקס"), כדי לתפוס גם
 * מקרים שבהם הטקסט מפוצל לכמה ריצות (<w:t>). רץ לפני render.
 */
export function stripFaxParagraphsFromDocXml(documentXml: string): string {
  return documentXml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (para) => {
    const text = para.replace(/<[^>]+>/g, '');
    const hasFax =
      /09[-\s]?7724446/.test(text) || /לשלוח[^]{0,40}?לפקס/.test(text) || /לחתום ולשלוח\s*לפקס/.test(text);
    return hasFax ? '' : para;
  });
}

/**
 * נרמול payload מיזוג — מיפוי שמות שדות ישנים לקנוניים
 */
export function normalizeDocxMergePayload(raw: Record<string, unknown>): Record<string, unknown> {
  const r = { ...raw };

  // Map legacy field names to canonical
  if (!r.salesRepName && r.salesRep) r.salesRepName = r.salesRep;
  if (!r.subtotal && r.subtotalBeforeDiscount) r.subtotal = r.subtotalBeforeDiscount;
  if (!r.vatAmount && r.vat) r.vatAmount = r.vat;
  if (!r.totalAmount && r.total) r.totalAmount = r.total;
  if (!r.validUntil && r.validityDate) r.validUntil = r.validityDate;
  if (!r.contractSurveyNumber) r.contractSurveyNumber = '';

  // דגל הנחה כללית (שורת "% הנחה" בטבלת הסיכום)
  r.hasGeneralDiscount = toNumber(pickStr(r, ['discountPercent'])) > 0;

  // Normalize items array
  const items = Array.isArray(r.items) ? r.items : [];
  r.items = items.map((item: any, idx: number) => {
    const rec = asRecord(item);
    if (!rec) return { rowNum: String(idx + 1), code: '', name: '', quantity: '0', unitPrice: '0', discountPct: '0', lineTotal: '0', lineNumber: String(idx + 1), sku: '', itemCode: '', description: '', lineDiscountPercent: '0' };
    return {
      rowNum: pickStr(rec, ['rowNum', 'lineNumber']) || String(idx + 1),
      lineNumber: pickStr(rec, ['lineNumber', 'rowNum']) || String(idx + 1),
      code: pickStr(rec, ['code', 'itemCode']),
      itemCode: pickStr(rec, ['itemCode', 'code']),
      sku: pickStr(rec, ['sku', 'code']),
      name: pickStr(rec, ['name', 'description']),
      description: pickStr(rec, ['description', 'name']),
      quantity: pickStr(rec, ['quantity', 'qty']),
      unitPrice: pickStr(rec, ['unitPrice', 'price']),
      discountPct: pickStr(rec, ['discountPct', 'lineDiscountPercent', 'discount']),
      lineDiscountPercent: pickStr(rec, ['lineDiscountPercent', 'discountPct', 'discount']),
      lineTotal: pickStr(rec, ['lineTotal', 'total']),
    };
  });

  // דגל קיום הנחת-שורה (עמודת "% הנחה לשורה")
  r.hasLineDiscount = (r.items as Array<Record<string, unknown>>).some(
    (it) => toNumber(pickStr(it, ['lineDiscountPercent', 'discountPct', 'discount'])) > 0,
  );

  // דגל התבנית ({#hasDiscount}): מציג את זוג הטבלאות ה"מלא" (עמודת הנחת-שורה + שורת הנחה
  // כללית) כאשר קיימת הנחה כלשהי — כללית או לשורה. ההתאמה לכל מקרה (הסרת עמודה/שורה מיותרת)
  // נעשית ב-mergeTemplate לפני ה-render. כך הנחת-שורה מוצגת גם בלי הנחה כללית, ולהפך.
  r.hasDiscount = r.hasGeneralDiscount === true || r.hasLineDiscount === true;

  // Recipient block canonical lines
  const companyName = pickStr(r, ['customerName']).trim();
  const contactName = pickStr(r, ['contactName']).trim();
  // שם הנמען בכותרת: שם איש הקשר, ואם ריק — שם החברה. רוב התבניות מציגות {customerName}
  // בשורת השם (בלי placeholder נפרד לאיש קשר), לכן דורסים את customerName עצמו כך שיציג את
  // איש הקשר כשקיים. שם החברה נשמר ב-companyName למקרה שתבנית משתמשת בו בנפרד.
  const displayName = contactName || companyName;
  r.customerName = displayName;
  r.companyName = companyName;
  const cityOnly = extractCityOnly(
    pickStr(r, ['customerCity', 'city', 'billingCity', 'customer_city']).trim(),
    pickStr(r, ['customerAddress', 'address', 'billingAddress']).trim(),
  );
  const contactPhone = pickStr(r, ['contactPhone', 'customerPhone', 'phone']).trim();
  const contactEmail = pickStr(r, ['contactEmail', 'customerEmail', 'email']).trim();
  // נפילה-חזרה לפלייסהולדרים הישירים {contactPhone}/{contactEmail}: אם לא נבחר איש קשר,
  // מלא אותם מטלפון/מייל הלקוח — אחרת הם נשארים ריקים ולא מוצגים בכלל.
  r.contactPhone = contactPhone;
  r.contactEmail = contactEmail;
  r.recipientLine1 = 'לכבוד';
  r.recipientLine2 = contactName;
  r.recipientLine3 = companyName;
  r.recipientLine4 = cityOnly;
  // נפילה-חזרה ל-{customerCity}: אם שדה העיר ריק אך חולצה עיר מהכתובת — מלא גם את ה-placeholder הישיר
  if (!pickStr(r, ['customerCity']).trim() && cityOnly) r.customerCity = cityOnly;
  r.recipientLine5 = `טלפון נייד: ${contactPhone}`;
  r.recipientLine6 = `מייל: ${contactEmail}`;
  const quoteDateStr = pickStr(r, ['quoteDate']).trim();
  r.recipientLine7 = `תאריך: ${quoteDateStr}`;

  return sanitizeDocxPayload(r) as Record<string, unknown>;
}

/**
 * מוודא ש-[Content_Types].xml הוא הפריט הראשון בחבילת ה-ZIP (דרישת OPC/OOXML).
 * PizZip/docxtemplater עלולים לסדר אותו לא-ראשון אחרי render → Word מסמן "unreadable content".
 * מסדר מחדש את מפת הקבצים כך שהחלק הזה ראשון; שאר הסדר נשמר. פועל על אובייקט PizZip.
 */
function ensureContentTypesFirst(zip: any): void {
  const CT = '[Content_Types].xml';
  const files = zip?.files;
  if (!files || !files[CT]) return;
  const keys = Object.keys(files);
  if (keys[0] === CT) return; // כבר ראשון
  const reordered: Record<string, unknown> = {};
  reordered[CT] = files[CT];
  for (const k of keys) {
    if (k !== CT) reordered[k] = files[k];
  }
  zip.files = reordered;
}

/* ══════════════════════════════════════════════════════════════
 *  Injectable service — used by QuoteTemplatesController
 * ══════════════════════════════════════════════════════════════ */

@Injectable()
export class DocxMergeService {
  private readonly templatesDir: string;

  constructor() {
    this.templatesDir = path.resolve(process.cwd(), 'templates');
    if (!fs.existsSync(this.templatesDir)) {
      fs.mkdirSync(this.templatesDir, { recursive: true });
    }
  }

  /** מבצע מיזוג של תבנית DOCX עם נתונים ומחזיר Buffer */
  mergeTemplate(templatePath: string, data: Record<string, unknown>): Buffer {
    ensureDeps();

    const fullPath = path.resolve(this.templatesDir, templatePath);
    if (!fs.existsSync(fullPath)) {
      throw new NotFoundException(`Template file not found: ${templatePath}`);
    }

    const normalized = normalizeDocxMergePayload(data);
    const templateContent = fs.readFileSync(fullPath, 'binary');
    const zip = new PizZip(templateContent);

    // עיבוד מקדים של document.xml לפני render (פעם אחת על תבנית הלולאה/הטבלאות)
    {
      const preFile = zip.file('word/document.xml');
      if (preFile) {
        let pre = preFile.asText();
        // הסרת שורת ה"פקס" הישנה מכל מסמך ממוזג (צרובה בחלק מקבצי ה-DOCX של התבניות)
        pre = stripFaxParagraphsFromDocXml(pre);
        // הזרקת {customerCity} לסימניית fldCity הריקה (תבניות שבהן העיר חסרה placeholder)
        pre = ensureCityPlaceholderInBookmark(pre);
        // ביטול הדגשה מהכתובת + הסרת שורת הרווח בין הכתובת לעיר (בקשת המשתמש)
        pre = unboldAddressRun(pre);
        pre = removeBlankLineBetweenAddressAndCity(pre);
        // ── התאמת זוג טבלאות המחיר למצב ההנחות בפועל ──
        // מאז איחוד התבניות (2026-07-06) בכל תבנית יש זוג יחיד שתמיד מרונדר: טבלת פריטים עם
        // עמודת "% הנחה לשורה" + טבלת סיכום עם שורת "% הנחה" כללית. כאן מסירים את החלק
        // המיותר כדי שכל אחד מ-4 המצבים יוצג נכון:
        //   • אין הנחה כלל     → הסרת עמודת הנחת-השורה + הסרת שורת ההנחה הכללית
        //   • הנחה כללית בלבד  → הסרת עמודת הנחת-השורה (הייתה מציגה 0% בכל השורות)
        //   • הנחת-שורה בלבד   → הסרת שורת ההנחה הכללית (הייתה מציגה "% הנחה: 0")
        //   • שתיהן            → ללא שינוי (הכל מוצג)
        // (תאימות לאחור: בתבניות ישנות עם זוג-כפול ותנאי {#hasDiscount}, הטרנספורמציות
        //  נוגעות בזוג ה"מלא" בלבד — שממילא לא מרונדר כשאין הנחה — ולכן אינן מזיקות.)
        const hasGeneralDiscount = normalized.hasGeneralDiscount === true;
        const hasLineDiscount = normalized.hasLineDiscount === true;
        if (hasGeneralDiscount) {
          // הנחה כללית — ודא קיום שורת "הנחה" בטבלת הסיכום (לתבניות ישנות שחסרות אותה)
          pre = ensureDiscountRowInSummary(pre);
        } else {
          // אין הנחה כללית — הסר את שורת ההנחה הכללית המיותרת
          pre = removeSummaryDiscountRow(pre);
          // ...ושנה את התווית "סה״כ לאחר הנחה" → "סה״כ" (אין הנחה שאחריה — התווית מטעה)
          pre = relabelSubtotalAfterDiscountWhenNoDiscount(pre);
        }
        if (!hasLineDiscount) {
          // אין הנחת-שורה — הסר את עמודת "% הנחה לשורה" מטבלת הפריטים
          pre = removeTableColumnByPlaceholder(pre, '{lineDiscountPercent}');
        }
        zip.file('word/document.xml', pre);
      }
    }

    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      nullGetter: () => '',
    });

    doc.render(normalized);

    const outZip = doc.getZip();
    const docXml = outZip.file('word/document.xml');
    if (docXml) {
      const recData = normalized as unknown as DocxMergeData;
      const xml = docXml.asText();
      let replaced = injectRecipientBlockOoxml(xml, buildRecipientBlockOoxml(recData));
      replaced = patchRtlOnlyRunsDavid14(replaced);
      // אין נגיעה ברוחב/ביישור של טבלאות המחיר — הן מרונדרות בדיוק כפי
      // שהוגדרו בתבנית. (בעבר alignPriceTablesRight מתח את רוחב עמודות
      // טבלת הסיכום/הנחה כדי להשוות לרוחב טבלת הפריטים — הוסר ביודעין.)
      outZip.file('word/document.xml', replaced);
    }

    // ── תיקון קריטי: [Content_Types].xml חייב להיות הפריט הראשון ב-ZIP ──
    // מפרט ה-OPC (ISO/IEC 29500) דורש ש-[Content_Types].xml יהיה החלק הראשון בחבילה.
    // docxtemplater/PizZip מסדרים מחדש את הפריטים אחרי render, כך ש-[Content_Types].xml
    // כבר לא ראשון — ו-Word מסמן "תוכן שאינו ניתן לקריאה" ומציע לתקן (repair). כתוצאה,
    // הקובץ שנשמר ל-OneDrive פגום, וכשמושכים אותו בחזרה זו הגרסה הגולמית ולא הערוכה.
    // כאן מסדרים מחדש כך ש-[Content_Types].xml ראשון — ואז Word פותח את הקובץ ללא repair.
    ensureContentTypesFirst(outZip);

    return outZip.generate({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    });
  }

  /** בודק אם קיים קובץ תבנית DOCX */
  hasDocxTemplate(templatePath: string | null | undefined): boolean {
    if (!templatePath) return false;
    const fullPath = path.resolve(this.templatesDir, templatePath);
    return fs.existsSync(fullPath);
  }

  /** רשימת קבצי תבנית DOCX זמינים */
  listTemplates(): string[] {
    if (!fs.existsSync(this.templatesDir)) return [];
    return fs.readdirSync(this.templatesDir).filter((f) => f.endsWith('.docx'));
  }

  /** שומר קובץ תבנית DOCX שהועלה */
  saveUploadedTemplate(filename: string, buffer: Buffer): string {
    const safe = filename
      .replace(/[^a-zA-Z0-9\u0590-\u05FF._-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    const finalName = safe.endsWith('.docx') ? safe : `${safe}.docx`;
    const fullPath = path.resolve(this.templatesDir, finalName);
    fs.writeFileSync(fullPath, buffer);
    return finalName;
  }

  /** רשימת placeholders בתבנית DOCX */
  extractPlaceholders(templatePath: string): string[] {
    ensureDeps();

    const fullPath = path.resolve(this.templatesDir, templatePath);
    if (!fs.existsSync(fullPath)) {
      throw new NotFoundException(`Template file not found: ${templatePath}`);
    }

    const content = fs.readFileSync(fullPath, 'binary');
    const zip = new PizZip(content);
    const xml = zip.file('word/document.xml')?.asText() || '';

    const matches: string[] = xml.match(/\{[a-zA-Z][a-zA-Z0-9_]*\}/g) || [];
    return [...new Set(matches)].sort();
  }
}