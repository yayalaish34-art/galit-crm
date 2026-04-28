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

  // Recipient block canonical lines
  const customerName = pickStr(r, ['customerName']).trim();
  const contactName = pickStr(r, ['contactName']).trim();
  const cityOnly = extractCityOnly(
    pickStr(r, ['customerCity', 'city', 'billingCity', 'customer_city']).trim(),
    pickStr(r, ['customerAddress', 'address', 'billingAddress']).trim(),
  );
  const contactPhone = pickStr(r, ['contactPhone', 'customerPhone', 'phone']).trim();
  const contactEmail = pickStr(r, ['contactEmail', 'customerEmail', 'email']).trim();
  const recipientLine3 = customerName ? customerName : '';
  r.recipientLine1 = 'לכבוד';
  r.recipientLine2 = contactName;
  r.recipientLine3 = recipientLine3;
  r.recipientLine4 = cityOnly;
  r.recipientLine5 = `טלפון נייד: ${contactPhone}`;
  r.recipientLine6 = `מייל: ${contactEmail}`;
  const quoteDateStr = pickStr(r, ['quoteDate']).trim();
  r.recipientLine7 = `תאריך: ${quoteDateStr}`;

  return sanitizeDocxPayload(r) as Record<string, unknown>;
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
      outZip.file('word/document.xml', replaced);
    }

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