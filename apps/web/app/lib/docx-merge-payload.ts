/**
 * בניית גוף JSON ל־POST /quote-templates/:id/merge-docx
 * (שמות שדות תואמים ל־normalizeDocxMergePayload בצד ה-API).
 */

export type DocxLineInput = {
  code?: string;
  sku?: string;
  description?: string;
  qty: number;
  unitPrice: number;
  discountPct: number;
};

export type BuildQuoteDocxMergeBodyOpts = {
  quoteNumber: string;
  contractSurveyNumber: string;
  quoteDateYmd: string;
  validUntilYmd: string;
  customerName: string;
  contactName: string;
  customerPhone: string;
  customerEmail: string;
  customerAddress: string;
  customerCity: string;
  /** טלפון איש הקשר (לא טלפון החברה) — לבלוק נמען במיזוג */
  contactPhone?: string;
  /** מייל איש הקשר — לבלוק נמען במיזוג */
  contactEmail?: string;
  salesRepName: string;
  paymentTerms: string;
  notes: string;
  approverName: string;
  globalDiscountPercent: number;
  vatPercent: number;
  lineItems: DocxLineInput[];
  formatMoney: (n: number) => string;
  /**
   * אופציונלי: סכומי סיכום שכבר חושבו בטופס (למשל דשבורד עם הנחה במטבע / לפני מע״מ משדה נפרד).
   * אם קיים — משמש לשדות subtotal / subtotalAfterDiscount / vatAmount / totalAmount.
   */
  summaryOverride?: {
    subtotal: number;
    afterDiscount: number;
    vatAmount: number;
    totalAmount: number;
  };
};

/** מחזיר אובייקט מוכן ל־JSON.stringify עבור merge-docx */
export function buildQuoteDocxMergeBody(o: BuildQuoteDocxMergeBodyOpts): Record<string, unknown> {
  const fmt = o.formatMoney;
  const discPct = Number.isFinite(o.globalDiscountPercent) ? o.globalDiscountPercent : 0;
  const vp = Number.isFinite(o.vatPercent) ? o.vatPercent : 0;

  let rawSubtotal = 0;
  const items = o.lineItems.map((li, idx) => {
    const qty = Number.isFinite(li.qty) ? li.qty : 0;
    const price = Number.isFinite(li.unitPrice) ? li.unitPrice : 0;
    const lineDisc = Number.isFinite(li.discountPct) ? li.discountPct : 0;
    const lineTotal = Math.round(qty * price * (1 - lineDisc / 100) * 100) / 100;
    rawSubtotal += lineTotal;
    return {
      lineNumber: String(idx + 1),
      sku: li.sku ?? '',
      itemCode: li.code ?? '',
      description: li.description ?? '',
      quantity: String(qty),
      unitPrice: fmt(price),
      lineDiscountPercent: lineDisc > 0 ? String(lineDisc) : '0',
      lineTotal: fmt(lineTotal),
    };
  });

  const subtotal = Math.round(rawSubtotal * 100) / 100;
  let afterDisc =
    discPct > 0 ? Math.round(subtotal * (1 - discPct / 100) * 100) / 100 : subtotal;
  let vatVal = Math.round(afterDisc * (vp / 100) * 100) / 100;
  let totalVal = Math.round((afterDisc + vatVal) * 100) / 100;

  if (o.summaryOverride) {
    const s = o.summaryOverride;
    afterDisc = Math.round(s.afterDiscount * 100) / 100;
    vatVal = Math.round(s.vatAmount * 100) / 100;
    totalVal = Math.round(s.totalAmount * 100) / 100;
    return {
      quoteNumber: o.quoteNumber,
      contractSurveyNumber: o.contractSurveyNumber,
      quoteDate: (() => {
        const qd = o.quoteDateYmd.trim()
          ? new Date(`${o.quoteDateYmd.trim()}T12:00:00`)
          : new Date();
        return Number.isNaN(qd.getTime()) ? new Date().toLocaleDateString('he-IL') : qd.toLocaleDateString('he-IL');
      })(),
      validUntil: (() => {
        const vd = o.validUntilYmd.trim()
          ? new Date(`${o.validUntilYmd.trim()}T12:00:00`)
          : new Date();
        return Number.isNaN(vd.getTime()) ? '' : vd.toLocaleDateString('he-IL');
      })(),
      customerName: o.customerName,
      contactName: o.contactName,
      customerPhone: o.customerPhone,
      customerEmail: o.customerEmail,
      customerAddress: o.customerAddress,
      customerCity: o.customerCity,
      contactPhone: o.contactPhone ?? '',
      contactEmail: o.contactEmail ?? '',
      salesRepName: o.salesRepName,
      paymentTerms: o.paymentTerms,
      subtotal: fmt(Math.round(s.subtotal * 100) / 100),
      discountPercent: discPct > 0 ? String(discPct) : '0',
      subtotalAfterDiscount: fmt(afterDisc),
      vatAmount: fmt(vatVal),
      totalAmount: fmt(totalVal),
      approverName: o.approverName,
      notes: o.notes,
      items,
    };
  }

  const qd = o.quoteDateYmd.trim()
    ? new Date(`${o.quoteDateYmd.trim()}T12:00:00`)
    : new Date();
  const vd = o.validUntilYmd.trim()
    ? new Date(`${o.validUntilYmd.trim()}T12:00:00`)
    : new Date();

  return {
    quoteNumber: o.quoteNumber,
    contractSurveyNumber: o.contractSurveyNumber,
    quoteDate: Number.isNaN(qd.getTime()) ? new Date().toLocaleDateString('he-IL') : qd.toLocaleDateString('he-IL'),
    validUntil: Number.isNaN(vd.getTime()) ? '' : vd.toLocaleDateString('he-IL'),
    customerName: o.customerName,
    contactName: o.contactName,
    customerPhone: o.customerPhone,
    customerEmail: o.customerEmail,
    customerAddress: o.customerAddress,
    customerCity: o.customerCity,
    contactPhone: o.contactPhone ?? '',
    contactEmail: o.contactEmail ?? '',
    salesRepName: o.salesRepName,
    paymentTerms: o.paymentTerms,
    subtotal: fmt(subtotal),
    discountPercent: discPct > 0 ? String(discPct) : '0',
    subtotalAfterDiscount: fmt(afterDisc),
    vatAmount: fmt(vatVal),
    totalAmount: fmt(totalVal),
    approverName: o.approverName,
    notes: o.notes,
    items,
  };
}