/**
 * מיזוג משתנים דינמיים בתבניות HTML להצעות מחיר.
 * פורמט: {{variableName}}
 */

export type QuoteTemplateLineItem = {
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal?: number;
  code?: string;
  sku?: string;
  discountPct?: number;
};

export type MergeQuoteTemplateInput = {
  customer: {
    name: string;
    contactName?: string | null;
    address?: string | null;
    city?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  serviceName: string;
  quoteNumber: string;
  quoteDate: Date;
  notes: string;
  lineItems: QuoteTemplateLineItem[];
  vatPercent: number;
  discountType: string;
  discountValue: number;
  paymentTerms?: string;
  validityDate?: string;
  approverName?: string;
};

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function computeTotalWithVat(input: {
  subtotalBeforeVat: number;
  vatPercent: number;
  discountType: string;
  discountValue: number;
}): number {
  const base = Math.max(0, input.subtotalBeforeVat);
  const vat = base * (input.vatPercent / 100);
  const withVat = base + vat;
  const discType = (input.discountType || 'NONE').toUpperCase();
  const discVal = Number(input.discountValue) || 0;
  let discounted = withVat;
  if (discType === 'CURRENCY') discounted = withVat - discVal;
  if (discType === 'PERCENT') discounted = withVat * (1 - discVal / 100);
  return Math.max(0, Math.round(discounted * 100) / 100);
}

export function buildItemsTableHtml(items: QuoteTemplateLineItem[], formatMoney: (n: number) => string): string {
  if (!items.length) {
    return '<p dir="rtl">—</p>';
  }
  const hasSkuOrCode = items.some((li) => li.code || li.sku);
  const hasDiscount = items.some((li) => (li.discountPct ?? 0) > 0);
  const rows = items
    .map((li, idx) => {
      const disc = li.discountPct ?? 0;
      const line =
        li.lineTotal !== undefined ? li.lineTotal : Math.round(li.quantity * li.unitPrice * (1 - disc / 100) * 100) / 100;
      const cs = 'border:1px solid #bbb;padding:4px 8px;';
      return `<tr>
        <td style="${cs}text-align:center">${idx + 1}</td>
        ${hasSkuOrCode ? `<td style="${cs}">${escapeHtml(li.code || li.sku || '')}</td>` : ''}
        <td style="${cs}">${escapeHtml(li.name)}</td>
        <td style="${cs}text-align:center">${li.quantity}</td>
        <td style="${cs}text-align:left">${formatMoney(li.unitPrice)}</td>
        ${hasDiscount ? `<td style="${cs}text-align:center">${disc > 0 ? disc + '%' : '—'}</td>` : ''}
        <td style="${cs}text-align:left;font-weight:bold">${formatMoney(line)}</td>
      </tr>`;
    })
    .join('');
  const ths = `<th style="border:1px solid #bbb;padding:4px 8px;background:#f5f5f5;">שורה</th>
    ${hasSkuOrCode ? '<th style="border:1px solid #bbb;padding:4px 8px;background:#f5f5f5;">מק&quot;ט</th>' : ''}
    <th style="border:1px solid #bbb;padding:4px 8px;background:#f5f5f5;">תיאור המוצר</th>
    <th style="border:1px solid #bbb;padding:4px 8px;background:#f5f5f5;">כמות</th>
    <th style="border:1px solid #bbb;padding:4px 8px;background:#f5f5f5;">מחיר ליחידה</th>
    ${hasDiscount ? '<th style="border:1px solid #bbb;padding:4px 8px;background:#f5f5f5;">% הנחה לשורה</th>' : ''}
    <th style="border:1px solid #bbb;padding:4px 8px;background:#f5f5f5;">סה&quot;כ ₪</th>`;
  return `<table dir="rtl" class="quote-items-table" border="1" cellpadding="8" style="border-collapse:collapse;width:100%;max-width:720px;"><thead><tr>${ths}</tr></thead><tbody>${rows}</tbody></table>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** בונה מפת ערכים למשתני {{...}} */
export function buildQuoteTemplateContext(
  input: MergeQuoteTemplateInput,
  formatMoney: (n: number) => string,
): Record<string, string> {
  const c = input.customer;
  const lineItems = input.lineItems.map((li) => ({
    ...li,
    lineTotal: li.lineTotal !== undefined ? li.lineTotal : Math.round(li.quantity * li.unitPrice * 100) / 100,
  }));
  const subtotal = Math.round(lineItems.reduce((a, li) => a + (li.lineTotal ?? 0), 0) * 100) / 100;
  const vatAmount = Math.round(subtotal * (input.vatPercent / 100) * 100) / 100;
  const total = computeTotalWithVat({
    subtotalBeforeVat: subtotal,
    vatPercent: input.vatPercent,
    discountType: input.discountType,
    discountValue: input.discountValue,
  });

  const discType = (input.discountType || 'NONE').toUpperCase();
  const discVal = Number(input.discountValue) || 0;
  const discountPctStr = discType === 'PERCENT' ? String(discVal) : '0';
  const subtotalAfterDiscount = discType === 'PERCENT'
    ? Math.round(subtotal * (1 - discVal / 100) * 100) / 100
    : discType === 'CURRENCY'
      ? Math.round((subtotal - discVal) * 100) / 100
      : subtotal;

  return {
    customerName: c?.name ?? '',
    contactName: c?.contactName ?? '',
    customerAddress: c?.address ?? '',
    customerCity: c?.city ?? '',
    customerEmail: c?.email ?? '',
    customerPhone: c?.phone ?? '',
    quoteDate: input.quoteDate.toLocaleDateString('he-IL'),
    quoteNumber: input.quoteNumber || '—',
    serviceName: input.serviceName,
    itemsTable: buildItemsTableHtml(lineItems, formatMoney),
    subtotal: formatMoney(subtotal),
    vat: formatMoney(vatAmount),
    total: formatMoney(total),
    notes: input.notes || '',
    terms: '',
    discountPercent: discountPctStr,
    subtotalAfterDiscount: formatMoney(subtotalAfterDiscount),
    paymentTerms: input.paymentTerms || '',
    validityDate: input.validityDate || '',
    approverName: input.approverName || c?.contactName || '',
  };
}

/** מחליף {{key}} בטקסט; מפתחות לא קיימים נשארים ריקים */
export function mergeTemplatePlaceholders(template: string, ctx: Record<string, string>): string {
  return template.replace(/\{\{\s*([\w]+)\s*\}\}/g, (_, key: string) => (key in ctx ? ctx[key] : ''));
}

/**
 * מסיר שורות "פקס" ישנות מכל HTML ממוזג — כדי שאף מסמך ממוזג (docx/PDF) לא יכלול אותן,
 * גם אם הן עדיין שמורות בתבנית שב-DB. מכסה את שתי הגרסאות:
 *   "לתיאום הגעה, נא לחתום ולשלוח לפקס 09-7724446. תודה."
 *   "אישור ההצעה: נא לשלוח את ההצעה חתומה לפקס 09-7724446 ..."
 * מוחק פסקאות (<p>…</p>) שמכילות את מספר הפקס או ניסוח "לשלוח...לפקס"; משאיר שאר התוכן כמות שהוא.
 */
export function stripFaxLines(html: string): string {
  if (!html) return html;
  // מחיקת כל <p>…</p> שמכיל את מספר הפקס (עם/בלי מקף) או הוראת שליחה לפקס.
  // ([\s\S] במקום flag של dotAll — תאימות ל-target ישן יותר.)
  const paragraphWithFax = /<p\b[^>]*>(?:(?!<\/p>)[\s\S])*?(?:09[-\s]?7724446|ל(?:חתום ולשלוח|שלוח[^<]*?)\s*לפקס)(?:(?!<\/p>)[\s\S])*?<\/p>\s*/gi;
  let out = html.replace(paragraphWithFax, '');
  // גיבוי: אם השורה הופיעה בלי עטיפת <p> — מסירים את הטקסט עצמו.
  out = out
    .replace(/לתיאום הגעה,?\s*נא לחתום ולשלוח לפקס\s*\.?09[-\s]?7724446\.?\s*תודה\.?/gi, '')
    .replace(/אישור ההצעה:\s*נא לשלוח את ההצעה חתומה לפקס\s*09[-\s]?7724446[^<\n]*/gi, '');
  return out;
}

export function mergeQuoteTemplateParts(
  parts: {
    introHtml?: string | null;
    bodyHtml?: string | null;
    closingHtml?: string | null;
    termsHtml?: string | null;
  },
  ctx: Record<string, string>,
): string {
  const chunks = [parts.introHtml, parts.bodyHtml, parts.closingHtml, parts.termsHtml].filter(
    (x): x is string => typeof x === 'string' && x.trim().length > 0,
  );
  const merged = chunks.map((c) => mergeTemplatePlaceholders(c, ctx)).join('\n<hr class="quote-sep" />\n');
  return stripFaxLines(merged);
}

/** מיזוג מלא: פתיחה, גוף, סיום, ואז תנאים (ממוזגים פעם אחת; {{terms}} בגוף מתמלא מבלוק התנאים) */
export function mergeQuoteTemplateFull(
  tpl: {
    introHtml?: string | null;
    bodyHtml?: string | null;
    closingHtml?: string | null;
    termsHtml?: string | null;
  },
  ctx: Record<string, string>,
): string {
  const termsMerged = mergeTemplatePlaceholders(tpl.termsHtml || '', ctx);
  const ctx2 = { ...ctx, terms: termsMerged };
  const chunks = [
    mergeTemplatePlaceholders(tpl.introHtml || '', ctx2),
    mergeTemplatePlaceholders(tpl.bodyHtml || '', ctx2),
    mergeTemplatePlaceholders(tpl.closingHtml || '', ctx2),
    termsMerged,
  ].filter((x) => x.trim().length > 0);
  return stripFaxLines(chunks.join('\n<hr class="quote-sep" />\n'));
}

export function mergedHtmlToPlainDescription(html: string): string {
  return stripHtml(html).slice(0, 8000);
}

/** ערכי שירות לתבניות ולהצעות — חייבים להיות זהים לקטגוריות בהתאמת הפתרון (SERVICE_CATEGORIES) */
export const QUOTE_SERVICE_TYPE_OPTIONS = [
  'איכות אוויר',
  'אסבסט',
  'בנייה ירוקה',
  'גהות / רעש תעסוקתי',
  'חוות דעת סביבתית',
  'כללי',
  'מים',
  'קרינה',
  'קרקע',
  'ראדון',
  'ריח',
  'תרמי',
  'רעש',
] as const;

/** רשימת משתנים לתצוגה בהגדרות */
export const QUOTE_TEMPLATE_VARIABLES_HELP = `
{{customerName}} — שם לקוח
{{contactName}} — איש קשר
{{customerAddress}} — כתובת
{{customerCity}} — עיר
{{customerEmail}} — אימייל
{{customerPhone}} — טלפון
{{quoteDate}} — תאריך הצעה
{{quoteNumber}} — מספר הצעה
{{serviceName}} — שם שירות
{{itemsTable}} — טבלת פריטים (HTML) כולל מק״ט, כמות, מחיר, הנחה וסה״כ
{{subtotal}} — סכום לפני מע״מ (מחושב מפריטים)
{{vat}} — סכום מע״מ
{{total}} — סה״כ כולל מע״מ (אחרי הנחה)
{{notes}} — הערות מהטופס
{{terms}} — בלוק תנאים (מתבנית או מהטופס)
{{discountPercent}} — אחוז הנחה כללי
{{subtotalAfterDiscount}} — סה״כ לאחר הנחה
{{paymentTerms}} — תנאי תשלום
{{validityDate}} — תוקף ההצעה
{{approverName}} — שם מלא של מאשר ההצעה (איש קשר)
`.trim();
