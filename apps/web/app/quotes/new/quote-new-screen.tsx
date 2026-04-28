'use client';
import React, { useState, useEffect, useRef } from 'react';
import { Save, Plus, Trash2, Copy, RefreshCw, Printer, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, FileText, LogOut, X, Search as SearchIcon, Pencil, Send, Mail, MessageCircle } from 'lucide-react';
import { CustomerPickerModal, CustomerRow } from './customer-picker-modal';
import { QuoteLookupModal, type QuoteLookupRow } from './quote-lookup-modal';
import { apiUrl, apiFetch } from '../../lib/api-base';
import {
  buildQuoteTemplateContext,
  mergeQuoteTemplateFull,
  type QuoteTemplateLineItem,
} from '../../lib/quote-template-merge';

/* ── Quote line-item types & helpers ── */
type LineItem = {
  id: string;
  code: string;
  sku: string;
  description: string;
  channel: string;
  qty: string;
  price: string;
  discountPct: string;
};

function calcTotal(item: LineItem): string {
  const qty = parseFloat(item.qty) || 0;
  const price = parseFloat(item.price) || 0;
  const disc = parseFloat(item.discountPct) || 0;
  const t = qty * price * (1 - disc / 100);
  return t === 0 ? '' : t.toFixed(2);
}

/** Money rounding to 2 decimals (cents) for installment math */
function roundMoney2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function newLineItem(): LineItem {
  return {
    id: `${Date.now()}-${Math.random()}`,
    code: '', sku: '', description: '', channel: '',
    qty: '1', price: '', discountPct: '0',
  };
}

/** Escape HTML entities for safe injection into generated print HTML */
function escHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ── Generate Word (.doc) HTML from merged quote data — returns HTML string ── */
function buildQuoteWordHtml(opts: {
  mergedHtml: string;
  quoteNo: string;
  reference: string;
  customer: string;
  contact: string;
  phone: string;
  fax: string;
  companyNo: string;
  date: string;
  salesRep: string;
  performerName: string;
  lineItems: LineItem[];
  subtotal: string;
  afterDiscount: string;
  cashTotal: string;
  discountPercent: string;
  vatPercent: string;
  paymentTerms: string;
  paymentsCount: string;
  paymentValidityDate: string;
  notes: string;
}) {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const fmt = (n: number) => isFinite(n) ? n.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';

  const itemRows = opts.lineItems
    .filter((li) => li.description.trim() || parseFloat(li.price) > 0)
    .map((li, i) => {
      const qty = parseFloat(li.qty) || 0;
      const price = parseFloat(li.price) || 0;
      const disc = parseFloat(li.discountPct) || 0;
      const tot = qty * price * (1 - disc / 100);
      return `<tr>
        <td style="border:1px solid #bbb;padding:4px 8px;text-align:center">${i + 1}</td>
        <td style="border:1px solid #bbb;padding:4px 8px">${esc(li.code)}</td>
        <td style="border:1px solid #bbb;padding:4px 8px">${esc(li.sku)}</td>
        <td style="border:1px solid #bbb;padding:4px 8px">${esc(li.description)}</td>
        <td style="border:1px solid #bbb;padding:4px 8px;text-align:center">${qty > 0 ? qty : ''}</td>
        <td style="border:1px solid #bbb;padding:4px 8px;text-align:left">${price > 0 ? fmt(price) : ''}</td>
        <td style="border:1px solid #bbb;padding:4px 8px;text-align:center">${disc > 0 ? disc + '%' : '—'}</td>
        <td style="border:1px solid #bbb;padding:4px 8px;text-align:left;font-weight:bold">${tot > 0 ? fmt(tot) : ''}</td>
      </tr>`;
    })
    .join('');

  const hfield = (label: string, value: string) =>
    value.trim() ? `<tr><td style="font-weight:bold;padding:2px 8px;white-space:nowrap;color:#333">${label}</td><td style="padding:2px 8px">${esc(value)}</td></tr>` : '';

  const hasDiscount = parseFloat(opts.discountPercent) > 0;
  const subtotalNum = parseFloat(opts.subtotal) || 0;
  const afterDiscountNum = parseFloat(opts.afterDiscount) || 0;
  const cashTotalNum = parseFloat(opts.cashTotal) || 0;
  const vatAmt = cashTotalNum - afterDiscountNum;

  const html = `
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
  @page { size: A4; margin: 2cm 2.5cm; }
  body { direction: rtl; text-align: right; font-family: Arial, 'Noto Sans Hebrew', sans-serif; font-size: 11pt; color: #111; }
  h1 { font-size: 18pt; color: #1a4f8a; text-align: center; border: 2px solid #1a4f8a; padding: 6px; margin: 10px 0 16px; }
  .co-name { font-size: 20pt; font-weight: bold; color: #1a4f8a; margin-bottom: 2px; }
  .co-sub { font-size: 9pt; color: #666; margin-bottom: 12px; }
  table.header-tbl { border: 1px solid #ddd; border-radius: 4px; background: #f9f9f9; width: 100%; margin-bottom: 12px; }
  table.header-tbl td { font-size: 10pt; vertical-align: top; }
  table.items-tbl { width: 100%; border-collapse: collapse; font-size: 10pt; margin: 12px 0; }
  table.items-tbl th { background: #1a4f8a; color: #fff; padding: 5px 8px; border: 1px solid #1a4f8a; text-align: center; }
  table.items-tbl tr:nth-child(even) { background: #f3f7fd; }
  .totals-box { border: 1px solid #ccc; border-radius: 4px; display: inline-block; min-width: 280px; margin: 8px 0; }
  .totals-box .trow { padding: 4px 14px; border-bottom: 1px solid #e5e5e5; font-size: 10pt; }
  .totals-box .trow:last-child { border-bottom: none; }
  .totals-box .total-row { background: #1a4f8a; color: #fff; font-weight: bold; font-size: 12pt; }
  .section-box { border: 1px solid #ddd; border-radius: 4px; padding: 8px 12px; margin: 8px 0; background: #f9f9f9; font-size: 10pt; }
  .section-box h4 { font-size: 10.5pt; font-weight: bold; color: #1a4f8a; margin: 0 0 4px; border-bottom: 1px solid #ddd; padding-bottom: 3px; }
  .sig-line { border-top: 1px solid #888; padding-top: 4px; text-align: center; font-size: 9pt; color: #555; margin-top: 30px; }
  .footer-line { margin-top: 20px; padding-top: 6px; border-top: 2px solid #1a4f8a; font-size: 8pt; color: #777; text-align: center; }
  .merged-content { margin: 16px 0; padding: 10px; border: 1px solid #e0e0e0; background: #fafafa; }
</style>
</head>
<body dir="rtl">

<div class="co-name">גלית – יעוץ סביבתי</div>
<div class="co-sub">שירותי ייעוץ ובדיקות סביבתיות</div>
<h1>הצעת מחיר</h1>

<table class="header-tbl" cellpadding="0" cellspacing="0">
  ${hfield('מספר הצעה:', opts.quoteNo)}
  ${hfield('סימוכין:', opts.reference)}
  ${hfield('לקוח:', opts.customer)}
  ${hfield('איש קשר:', opts.contact)}
  ${hfield('תאריך:', opts.date)}
  ${hfield('נציג מכירה:', opts.salesRep)}
  ${hfield('מבצע:', opts.performerName)}
  ${hfield('טלפון:', opts.phone)}
  ${hfield('פקס:', opts.fax)}
  ${hfield('ח.פ / ע.מ:', opts.companyNo)}
  ${hfield('בתוקף עד:', opts.paymentValidityDate)}
</table>

<table class="items-tbl">
  <thead><tr>
    <th style="width:30px">#</th>
    <th>קוד</th>
    <th>מק"ט</th>
    <th>תיאור</th>
    <th style="width:50px">כמות</th>
    <th style="width:80px">מחיר</th>
    <th style="width:60px">הנחה%</th>
    <th style="width:80px">סה"כ</th>
  </tr></thead>
  <tbody>
    ${itemRows || '<tr><td colspan="8" style="text-align:center;color:#999;padding:10px;border:1px solid #bbb">אין פריטים</td></tr>'}
  </tbody>
</table>

<div class="totals-box">
  ${subtotalNum > 0 && hasDiscount ? `<div class="trow">סכום ביניים: ₪${fmt(subtotalNum)}</div>` : ''}
  ${hasDiscount && subtotalNum > afterDiscountNum ? `<div class="trow">הנחה ${esc(opts.discountPercent)}%: ₪${fmt(subtotalNum - afterDiscountNum)}</div>` : ''}
  ${hasDiscount && subtotalNum > afterDiscountNum ? `<div class="trow">לאחר הנחה: ₪${fmt(afterDiscountNum)}</div>` : ''}
  ${vatAmt > 0 ? `<div class="trow">מע"מ ${esc(opts.vatPercent)}%: ₪${fmt(vatAmt)}</div>` : ''}
  <div class="trow total-row">סה"כ לתשלום: ₪${fmt(cashTotalNum > 0 ? cashTotalNum : subtotalNum)}</div>
</div>

${opts.paymentTerms || (opts.paymentsCount && opts.paymentsCount !== '0') ? `
<div class="section-box">
  <h4>תנאי תשלום</h4>
  ${opts.paymentTerms ? `<div>${esc(opts.paymentTerms)}</div>` : ''}
  ${opts.paymentsCount && opts.paymentsCount !== '0' ? `<div>מספר תשלומים: ${esc(opts.paymentsCount)}</div>` : ''}
</div>` : ''}

${opts.mergedHtml ? `
<div class="merged-content">
  ${opts.mergedHtml}
</div>` : ''}

${opts.notes ? `
<div class="section-box">
  <h4>הערות</h4>
  <div style="white-space:pre-wrap">${esc(opts.notes)}</div>
</div>` : ''}

<table style="width:100%;margin-top:30px"><tr>
  <td style="width:50%"><div class="sig-line">חתימת הלקוח — אישור הצעה</div></td>
  <td style="width:50%"><div class="sig-line">חתימת נציג החברה</div></td>
</tr></table>

<div class="footer-line">
  הצעת מחיר זו בתוקף עד: ${esc(opts.paymentValidityDate)}
</div>

</body>
</html>`;

  return html;
}

/** Trigger download of Word-compatible HTML as .doc file (must be called from a real user click) */
function downloadWordDoc(html: string, customerName: string, quoteNo: string) {
  const blob = new Blob(['\ufeff' + html], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeName = (customerName || 'quote').replace(/[^\u0590-\u05FFa-zA-Z0-9 _-]/g, '').trim() || 'quote';
  a.href = url;
  a.download = `הצעת_מחיר_${safeName}_${quoteNo || 'חדש'}.doc`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/* ── Built-in catalog: 10 items for Galit Environmental Company ── */
const CATALOG_ITEMS: ReadonlyArray<{ code: string; sku: string; description: string; price: string }> = [
  { code: 'RAD-C01', sku: 'CEL-RAD',  description: 'בדיקת קרינה סלולרית בדירה',         price: '950'  },
  { code: 'RAD-C02', sku: 'ELF-RAD',  description: 'בדיקת קרינה בתדר נמוך (ELF)',        price: '1200' },
  { code: 'ACO-C01', sku: 'NOI-ENV',  description: 'בדיקת רעש סביבתי',                   price: '1600' },
  { code: 'ACO-C02', sku: 'SND-APT',  description: 'בדיקת מעבר קול בין דירות',           price: '1400' },
  { code: 'RDN-C01', sku: 'RDN-90D',  description: 'בדיקת ראדון 90 יום',                 price: '850'  },
  { code: 'RDN-C02', sku: 'RDN-48H',  description: 'בדיקת ראדון קצרה 48 שעות',           price: '550'  },
  { code: 'IAQ-C01', sku: 'AIR-IND',  description: 'בדיקת איכות אוויר פנים מבנה',        price: '1100' },
  { code: 'IAQ-C02', sku: 'MOL-SMP',  description: 'דיגום עובש באוויר',                  price: '850'  },
  { code: 'ASB-C01', sku: 'ASB-SRV',  description: 'סקר אסבסט',                          price: '2200' },
  { code: 'ACO-C03', sku: 'ACO-CNS',  description: 'ייעוץ אקוסטי לפרויקט',              price: '700'  },
] as const;

/** Generates a local draft reference synchronously so the field is never blank.
 *  Format: Q-YYYYMM-NNNN  where NNNN is derived from the current time-of-day
 *  (minutes * 60 + seconds, mod 10000) to stay unique within a session.
 *  The API call in useEffect will override this with the true sequential number
 *  if the server is reachable; otherwise this value stays. */
function genLocalRef(): string {
  const d = new Date();
  const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const seq = String((d.getMinutes() * 60 + d.getSeconds()) % 10000).padStart(4, '0');
  return `Q-${ym}-${seq}`;
}

/** תאריך תוקף מחושב: תאריך ההצעה (אם קיים) אחרת היום, + מספר ימים — YYYY-MM-DD */
function dueDateAfterDaysFromQuote(quoteDateYmd: string, days: number): string {
  let base: Date;
  if (quoteDateYmd && quoteDateYmd.trim().length > 0) {
    base = new Date(`${quoteDateYmd.trim()}T12:00:00`);
    if (Number.isNaN(base.getTime())) {
      base = new Date();
      base.setHours(12, 0, 0, 0);
    }
  } else {
    base = new Date();
    base.setHours(12, 0, 0, 0);
  }
  const out = new Date(base);
  out.setDate(out.getDate() + days);
  const y = out.getFullYear();
  const m = String(out.getMonth() + 1).padStart(2, '0');
  const d = String(out.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getSessionUser() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('galit-crm-session');
    if (!raw) return null;
    const s = JSON.parse(raw) as { id?: string; role?: string };
    if (!s?.id || !s?.role) return null;
    return { id: s.id, role: String(s.role).toUpperCase() };
  } catch { return null; }
}

/** API Date → YYYY-MM-DD for <input type="date"> */
function toInputDateYmd(d: unknown): string {
  if (d == null || d === '') return '';
  if (typeof d === 'string') {
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(d);
    if (m) return m[1];
  }
  try {
    const dt = new Date(d as string | number | Date);
    return Number.isNaN(dt.getTime()) ? '' : dt.toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

type QuoteContactRow = {
  id: string;
  fullName: string;
  isPrimary: boolean;
  phone: string;
  mobile: string;
  email: string;
};

function normalizeQuoteContacts(raw: unknown): QuoteContactRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null && 'id' in x)
    .map((x) => ({
      id: String(x.id),
      fullName: String(x.fullName ?? ''),
      isPrimary: Boolean(x.isPrimary),
      phone: String(x.phone ?? ''),
      mobile: String(x.mobile ?? ''),
      email: String(x.email ?? ''),
    }))
    .filter((x) => x.id);
}

type QuoteUserRow = { id: string; name: string; employeeNumber?: string | null };

function userOptionLabel(u: { name: string; employeeNumber?: string | null }) {
  const en = (u.employeeNumber && String(u.employeeNumber).trim()) || '';
  return en ? `${u.name} · מס׳ ${en}` : u.name;
}

function normalizeLineItemsFromApi(raw: unknown): LineItem[] {
  let arr: unknown = raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      arr = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .map((row, i) => {
      if (!row || typeof row !== 'object') return null;
      const o = row as Record<string, unknown>;
      return {
        id: String(o.id ?? `${Date.now()}-${i}`),
        code: String(o.code ?? ''),
        sku: String(o.sku ?? ''),
        description: String(o.description ?? ''),
        channel: String(o.channel ?? ''),
        qty: String(o.qty ?? '1'),
        price: String(o.price ?? ''),
        discountPct: String(o.discountPct ?? '0'),
      };
    })
    .filter((x): x is LineItem => x != null);
}

type PrefillCustomer = {
  id?: string;
  importLegacyId?: string | null;
  name: string;
  phone?: string;
  fax?: string | null;
  companyRegNumber?: string | null;
  contactName?: string;
  address?: string | null;
  city?: string | null;
  email?: string | null;
  customerType?: string | null;
};

/* ── Small inline helpers used in the form grid ── */
function Lbl({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: 11, color: '#4b4b4b', whiteSpace: 'nowrap' }}>{children}</span>;
}
function Field({ v, c }: { v: string; c: (val: string) => void }) {
  return <input className="h-[22px] border border-[#b8b8b8] bg-white px-1 text-[11px] w-full" value={v} onChange={(e) => c(e.target.value)} />;
}
function Search({ v, c }: { v: string; c: (val: string) => void }) {
  return <input className="h-[22px] border border-[#b8b8b8] bg-white px-1 text-[11px] w-full" value={v} onChange={(e) => c(e.target.value)} />;
}
function DateField({ v, c }: { v: string; c: (val: string) => void }) {
  return <input type="date" className="h-[22px] border border-[#b8b8b8] bg-white px-1 text-[11px] w-full" value={v} onChange={(e) => c(e.target.value)} />;
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', alignItems: 'center', height: 22 }}>
      <span style={{ fontSize: 11, color: '#4b4b4b', whiteSpace: 'nowrap' }}>{label}</span>
      {children}
    </div>
  );
}

export function QuoteNewScreen({
  embedded = true,
  prefillCustomer = null,
  prefillContactId = null,
  initialQuoteId = null,
  onExit,
  onQuoteSaved,
  onQuoteSent,
}: {
  embedded?: boolean;
  prefillCustomer?: PrefillCustomer | null;
  /** When set, pre-select this contact after customer contacts are loaded */
  prefillContactId?: string | null;
  /** When set (or `?quoteId=` in the URL), load quote and restore תנאי תשלום from the server */
  initialQuoteId?: string | null;
  onExit?: () => void;
  /** Called after a successful save (POST or PATCH) — does not replace `onExit` for navigation/back. */
  onQuoteSaved?: (quoteId: string) => void;
  /** Called after a quote is successfully sent via email */
  onQuoteSent?: (quoteId: string) => void;
}) {
  const [tab, setTab] = useState<'פרטי תשלום' | 'מלל' | 'הערות' | 'שונות' | 'תחזית' | 'מסמכים מקושרים'>('תחזית');
  const [quoteNo, setQuoteNo] = useState('חדש');
  const [customer, setCustomer] = useState('');
  const [date, setDate] = useState('');
  const [follow, setFollow] = useState('');
  const [status, setStatus] = useState('');
  const [salesRep, setSalesRep] = useState('');
  const [salesRepresentativeUserId, setSalesRepresentativeUserId] = useState('');
  const [contact, setContact] = useState('');
  const [performerUserId, setPerformerUserId] = useState('');
  const [performerName, setPerformerName] = useState('');
  const [linked, setLinked] = useState('');
  const [priceList, setPriceList] = useState('לקוח החברה');
  const [reference, setReference] = useState(genLocalRef);
  const [orderNo, setOrderNo] = useState('');
  const [copiedFrom, setCopiedFrom] = useState('');
  const [rate, setRate] = useState('1.0000');
  const [phone, setPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerCity, setCustomerCity] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [fax, setFax] = useState('');
  const [limitations, setLimitations] = useState('');
  const [accountingNo, setAccountingNo] = useState('');
  const [companyNo, setCompanyNo] = useState('');
  const [notes, setNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [paymentValidityDate, setPaymentValidityDate] = useState('2026-03-25');
  const [paymentDueDate, setPaymentDueDate] = useState('2026-03-25');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [paymentTermsCode, setPaymentTermsCode] = useState('0');
  const [paymentTermRows, setPaymentTermRows] = useState<Array<{ id: string; label: string }>>([]);
  const [addPaymentTermOpen, setAddPaymentTermOpen] = useState(false);
  const [newPaymentTermLabel, setNewPaymentTermLabel] = useState('');
  const ADD_PAYMENT_TERM = '__ADD__';
  const [paymentsCount, setPaymentsCount] = useState('0');

  const [validityDays, setValidityDays] = useState('30');
  const [discountPercent, setDiscountPercent] = useState('');
  const [vatPercent, setVatPercent] = useState('18.00');
  const [mergeTemplateOpen, setMergeTemplateOpen] = useState(false);
  const [mergeTemplateRows, setMergeTemplateRows] = useState<QuoteLookupRow[]>([]);
  const [mergeTemplateLoading, setMergeTemplateLoading] = useState(false);
  const [mergedHtml, setMergedHtml] = useState('');
  const [wordDocHtml, setWordDocHtml] = useState('');
  const [orderSource, setOrderSource] = useState('');
  const [employeeNumber, setEmployeeNumber] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [quoteLookupOpen, setQuoteLookupOpen] = useState(false);
  const [quoteLookupKind, setQuoteLookupKind] = useState<'contact' | 'salesRep' | 'performer'>('contact');
  const [quoteUserRows, setQuoteUserRows] = useState<QuoteUserRow[]>([]);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [selectedLineIdx, setSelectedLineIdx] = useState<number | null>(null);
  const salesRepDefaultAppliedRef = useRef(false);
  const rootRef = useRef<HTMLElement>(null);

  /* ── Scroll to top on mount ── */
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    let el: HTMLElement | null = rootRef.current?.parentElement ?? null;
    while (el) {
      const ov = window.getComputedStyle(el).overflowY;
      if (ov === 'auto' || ov === 'scroll') { el.scrollTop = 0; break; }
      el = el.parentElement;
    }
  }, []);

  /* ── Auto-calc: תאריך תוקף ההצעה = תאריך הצעה + ימי תוקף ── */
  useEffect(() => {
    const days = parseInt(validityDays) || 30;
    const baseDate = date ? new Date(date) : new Date();
    // Guard against invalid date
    if (isNaN(baseDate.getTime())) return;
    baseDate.setDate(baseDate.getDate() + days);
    const yyyy = baseDate.getFullYear();
    const mm = String(baseDate.getMonth() + 1).padStart(2, '0');
    const dd = String(baseDate.getDate()).padStart(2, '0');
    setPaymentValidityDate(`${yyyy}-${mm}-${dd}`);
  }, [date, validityDays]);

  /* ── Pre-fill from customer card context ── */
  useEffect(() => {
    if (!prefillCustomer) return;
    setCustomer(prefillCustomer.name);
    if (prefillCustomer.phone)           setPhone(prefillCustomer.phone);
    if (prefillCustomer.fax)             setFax(prefillCustomer.fax);
    if (prefillCustomer.companyRegNumber) setCompanyNo(prefillCustomer.companyRegNumber);
    if (prefillCustomer.address)         setCustomerAddress(prefillCustomer.address);
    if (prefillCustomer.city)            setCustomerCity(prefillCustomer.city);
    if (prefillCustomer.email)           setCustomerEmail(prefillCustomer.email);
    if (prefillCustomer.contactName)    setContact(prefillCustomer.contactName);
    // Auto-set payment terms based on customer type
    const cType = (prefillCustomer.customerType || '').toUpperCase();
    if (cType === 'PRIVATE') setPaymentTerms('מזומן');
    else if (cType === 'COMPANY') setPaymentTerms('שוטף +30');
  }, [prefillCustomer]);

  /* ── Default follow date: 3 days from today (only for new quotes) ── */
  useEffect(() => {
    if (initialQuoteId) return; // don't override when editing existing
    const d = new Date();
    d.setDate(d.getDate() + 3);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    setFollow(`${yyyy}-${mm}-${dd}`);
  }, [initialQuoteId]);

  /* ── רשימת משתמשים / עובדים לנציג מכירה ומבצע ── */
  useEffect(() => {
    const user = getSessionUser();
    if (!user) return;
    apiFetch(apiUrl('/users'), { authUser: user })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: unknown) => {
        if (!Array.isArray(rows)) return;
        const list: QuoteUserRow[] = rows
          .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null && 'id' in x)
          .map((x) => ({
            id: String((x as { id: unknown }).id),
            name: String((x as { name: unknown }).name ?? ''),
            employeeNumber: (x as { employeeNumber?: string | null }).employeeNumber ?? null,
          }))
          .filter((r) => r.id && r.name)
          .sort((a, b) => a.name.localeCompare(b.name, 'he'));
        setQuoteUserRows(list);
      })
      .catch(() => {});
  }, []);

  /* ── נציג מכירה: ברירת מחדל = המשתמש המחובר (הצעה חדשה בלבד) ── */
  useEffect(() => {
    const resumeId =
      (initialQuoteId?.trim() || '') ||
      (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('quoteId')?.trim() || '' : '');
    if (resumeId) {
      salesRepDefaultAppliedRef.current = true;
      return;
    }
    if (salesRepDefaultAppliedRef.current) return;
    const user = getSessionUser();
    if (!user?.id || quoteUserRows.length === 0) return;
    if (salesRepresentativeUserId) {
      salesRepDefaultAppliedRef.current = true;
      return;
    }
    const row = quoteUserRows.find((u) => u.id === user.id);
    if (!row) return;
    setSalesRepresentativeUserId(row.id);
    setSalesRep(row.name);
    salesRepDefaultAppliedRef.current = true;
  }, [initialQuoteId, quoteUserRows, salesRepresentativeUserId]);

  /* ── Auto-fill סימוכין + מספר עובד on mount (skip when reopening an existing quote) ── */
  useEffect(() => {
    const user = getSessionUser();
    const resumeId =
      (initialQuoteId?.trim() || '') ||
      (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('quoteId')?.trim() || '' : '');
    if (resumeId) return;

    // Override local draft ref with the server's true sequential number if available.
    // Non-200 responses must throw so the catch path is reached.
    apiFetch(apiUrl('/quotes/next-reference'), { authUser: user })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: { reference?: string }) => { if (d?.reference) setReference(d.reference); })
      .catch(() => { /* local ref from useState(genLocalRef) already shown — nothing to do */ });

    // Auto-fill מספר עובד from logged-in user
    if (user?.id) {
      apiFetch(apiUrl(`/users/${user.id}`), { authUser: user })
        .then((r) => r.json())
        .then((u: { employeeNumber?: string | null }) => {
          if (u?.employeeNumber) setEmployeeNumber(u.employeeNumber);
        })
        .catch(() => {/* leave blank */});
    }
  }, [initialQuoteId]);

  /* ── Load existing quote: id for PATCH + restore saved fields (payment tab, lines, customer, סימוכין) ── */
  useEffect(() => {
    const user = getSessionUser();
    if (!user) return;
    const fromUrl =
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('quoteId')?.trim() || ''
        : '';
    const id = (initialQuoteId?.trim() || fromUrl).trim();
    if (!id) return;
    let cancelled = false;
    apiFetch(apiUrl(`/quotes/${encodeURIComponent(id)}`), { authUser: user })
      .then((r) => (r.ok ? r.json() : null))
      .then((q: Record<string, unknown> | null) => {
        if (!q || cancelled) return;
        if (q.id) setQuoteId(String(q.id));
        if (q.quoteNumber != null) setQuoteNo(String(q.quoteNumber));
        if (q.customerId) setCustomerId(String(q.customerId));
        const cust = q.customer as { name?: string } | undefined;
        if (typeof q.customerName === 'string' && q.customerName) setCustomer(q.customerName);
        else if (cust?.name) setCustomer(String(cust.name));
        if (q.orderReferenceNumber != null) setReference(String(q.orderReferenceNumber));
        setLineItems(normalizeLineItemsFromApi(q.lineItemsJson));
        setPaymentTerms(q.paymentTerms != null ? String(q.paymentTerms) : '');
        if (q.validityDays != null && q.validityDays !== '') setValidityDays(String(q.validityDays));
        const vd = toInputDateYmd(q.validityDate);
        if (vd) setPaymentValidityDate(vd);
        const pd = toInputDateYmd(q.paymentDueDate);
        if (pd) setPaymentDueDate(pd);
        if (q.paymentsCount != null && q.paymentsCount !== '') setPaymentsCount(String(q.paymentsCount));
        if (q.vatPercent != null && q.vatPercent !== '') setVatPercent(String(q.vatPercent));
        if (q.discountType === 'PERCENT' && q.discountValue != null) setDiscountPercent(String(q.discountValue));
        else if (q.discountType === 'NONE' || q.discountType === 'CURRENCY') setDiscountPercent('');
        const qd = toInputDateYmd(q.quoteDate);
        if (qd) setDate(qd);
        const fd = toInputDateYmd(q.followupDate);
        if (fd) setFollow(fd);
        if (typeof q.status === 'string') setStatus(q.status);
        salesRepDefaultAppliedRef.current = true;
        const srRel = q.salesRepresentative as { id?: string; name?: string } | undefined;
        if (q.salesRepresentativeId != null && String(q.salesRepresentativeId).trim()) {
          setSalesRepresentativeUserId(String(q.salesRepresentativeId).trim());
        } else {
          setSalesRepresentativeUserId('');
        }
        if (typeof q.salesRepresentativeName === 'string' && q.salesRepresentativeName) {
          setSalesRep(q.salesRepresentativeName);
        } else if (srRel?.name) {
          setSalesRep(String(srRel.name));
        } else {
          setSalesRep('');
        }
        const puRel = q.performerUser as { id?: string; name?: string } | undefined;
        if (q.performerUserId != null && String(q.performerUserId).trim()) {
          setPerformerUserId(String(q.performerUserId).trim());
        } else {
          setPerformerUserId('');
        }
        if (typeof q.performerName === 'string' && q.performerName) {
          setPerformerName(q.performerName);
        } else if (puRel?.name) {
          setPerformerName(String(puRel.name));
        } else {
          setPerformerName('');
        }
        const savedCc = q.customerContactId != null && String(q.customerContactId).trim() ? String(q.customerContactId) : '';
        if (savedCc) setCustomerContactId(savedCc);
        else {
          setCustomerContactId('');
          if (typeof q.executorName === 'string') setContact(q.executorName);
        }
        if (typeof q.priceList === 'string') setPriceList(q.priceList);
        if (typeof q.orderSource === 'string') setOrderSource(q.orderSource);
        if (typeof q.phoneSummary === 'string') setPhone(q.phoneSummary);
        if (typeof q.addressSummary === 'string') setCustomerAddress(q.addressSummary);
        // Get city/email from customer relation if available
        const custRel = q.customer as Record<string, unknown> | undefined;
        if (custRel) {
          if (typeof custRel.city === 'string') setCustomerCity(custRel.city);
          if (typeof custRel.email === 'string') setCustomerEmail(custRel.email);
          if (!q.addressSummary && typeof custRel.address === 'string') setCustomerAddress(custRel.address);
        }
        if (typeof q.faxSummary === 'string') setFax(q.faxSummary);
        if (typeof q.accountingNumber === 'string') setAccountingNo(q.accountingNumber);
        if (typeof q.companyRegNumber === 'string') setCompanyNo(q.companyRegNumber);
        if (typeof q.notes === 'string') setNotes(q.notes);
        if (typeof q.internalNotes === 'string') setInternalNotes(q.internalNotes);
        if (typeof q.functionalLabel === 'string') setFFunctional(q.functionalLabel);
        if (q.forecastClosePercent != null) setFClosePercent(String(q.forecastClosePercent));
        const fu = toInputDateYmd(q.forecastUpdatedAt);
        if (fu) setFLastDate(fu);
        if (typeof q.forecastUpdatedBy === 'string') setFLastUser(q.forecastUpdatedBy);
        if (typeof q.forecastUpdatedTime === 'string') setFLastTime(q.forecastUpdatedTime);
        if (q.exchangeRate != null) setRate(String(q.exchangeRate));
        if (q.quoteTemplateId != null && String(q.quoteTemplateId).trim()) {
          setQuoteTemplateId(String(q.quoteTemplateId).trim());
        } else {
          setQuoteTemplateId(null);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [initialQuoteId]);

  useEffect(() => {
    const user = getSessionUser();
    if (!user) return;
    apiFetch(apiUrl('/payment-terms'), { authUser: user })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: unknown) => {
        if (!Array.isArray(rows)) return;
        setPaymentTermRows(
          rows
            .filter((x): x is { id: string; label: string } => typeof x === 'object' && x !== null && 'label' in x && typeof (x as { label: unknown }).label === 'string')
            .map((x) => ({ id: String((x as { id?: unknown }).id ?? ''), label: String((x as { label: string }).label) }))
            .filter((x) => x.label)
            .sort((a, b) => a.label.localeCompare(b.label, 'he')),
        );
      })
      .catch(() => {});
  }, []);

  async function submitNewPaymentTerm() {
    const label = newPaymentTermLabel.trim();
    if (!label) return;
    const user = getSessionUser();
    if (!user) {
      alert('אין משתמש מחובר');
      return;
    }
    const r = await apiFetch(apiUrl('/payment-terms'), {
      method: 'POST',
      body: JSON.stringify({ label }),
      authUser: user,
    });
    if (!r.ok) {
      alert('שגיאה בשמירת תנאי תשלום');
      return;
    }
    const created = (await r.json()) as { id?: string; label?: string };
    const id = String(created.id ?? '');
    const savedLabel = String(created.label ?? label);
    setPaymentTermRows((prev) => {
      const next = prev.filter((p) => p.label !== savedLabel);
      next.push({ id: id || `local-${savedLabel}`, label: savedLabel });
      return next.sort((a, b) => a.label.localeCompare(b.label, 'he'));
    });
    setPaymentTerms(savedLabel);
    setAddPaymentTermOpen(false);
    setNewPaymentTermLabel('');
  }

  // תחזית
  const [fFunctional, setFFunctional] = useState('');
  const [fClosePercent, setFClosePercent] = useState('0.00');
  const [fCloseColor, setFCloseColor] = useState('');
  const [fLastDate, setFLastDate] = useState('2026-03-25');
  const [fLastUser, setFLastUser] = useState('');
  const [fLastTime, setFLastTime] = useState('');
  /* ── Save / print state ── */
  const [quoteId, _setQuoteId] = useState<string | null>(null);
  const [quoteTemplateId, setQuoteTemplateId] = useState<string | null>(null);
  const quoteIdRef = useRef<string | null>(null);
  // Keep ref in sync so async closures always see the latest id
  function setQuoteId(id: string | null) { quoteIdRef.current = id; _setQuoteId(id); }
  const [customerId, setCustomerId] = useState<string>('');
  const [quoteContactRows, setQuoteContactRows] = useState<QuoteContactRow[]>([]);
  const [customerContactId, setCustomerContactId] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [savedIndicator, setSavedIndicator] = useState(false);

  /* ── אנשי קשר לפי לקוח נבחר: רענון מ-/customers/:id/contacts, בחירה מחדש אם צריך ── */
  useEffect(() => {
    if (!customerId.trim()) {
      setQuoteContactRows([]);
      setCustomerContactId('');
      setContact('');
      return;
    }
    const user = getSessionUser();
    if (!user) return;
    let cancelled = false;
    apiFetch(apiUrl(`/customers/${encodeURIComponent(customerId)}/contacts`), { authUser: user })
      .then((r) => (r.ok ? r.json() : []))
      .then((raw: unknown) => {
        if (cancelled) return;
        const list = normalizeQuoteContacts(raw);
        setQuoteContactRows(list);
        setCustomerContactId((prev) => {
          // If a prefill contact was passed (from customer card), prefer it
          if (prefillContactId && list.some((row) => row.id === prefillContactId)) return prefillContactId;
          if (prev && list.some((row) => row.id === prev)) return prev;
          const pick = list.find((row) => row.isPrimary) || list[0];
          return pick?.id ?? '';
        });
      })
      .catch(() => {
        if (!cancelled) {
          setQuoteContactRows([]);
          setCustomerContactId('');
          setContact('');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [customerId, prefillContactId]);

  useEffect(() => {
    if (quoteContactRows.length === 0) {
      if (!customerContactId) setContact('');
      return;
    }
    const row = quoteContactRows.find((r) => r.id === customerContactId);
    if (row) {
      setContact(row.fullName);
      if (row.email) setCustomerEmail(row.email);
      if (row.phone || row.mobile) setPhone(row.phone || row.mobile);
    } else if (!customerContactId) {
      setContact('');
    }
  }, [customerContactId, quoteContactRows]);

  /* ── Sync customerId from prefillCustomer ── */
  useEffect(() => {
    if (prefillCustomer?.id) setCustomerId(prefillCustomer.id);
  }, [prefillCustomer]);

  /* ── Computed totals (live) ── */
  const subtotalNum = lineItems.reduce((s, item) => s + (parseFloat(calcTotal(item)) || 0), 0);
  const afterDiscountNum = subtotalNum * (1 - (parseFloat(discountPercent) || 0) / 100);
  const cashTotalNum = afterDiscountNum * (1 + (parseFloat(vatPercent) || 0) / 100);
  const subtotal = subtotalNum > 0 ? subtotalNum.toFixed(2) : '';
  const afterDiscount = afterDiscountNum > 0 ? afterDiscountNum.toFixed(2) : '';
  const cashTotal = cashTotalNum > 0 ? cashTotalNum.toFixed(2) : '';

  /* ── תשלומים: סכום לתשלום = סה״כ במזומן (אחרי הנחה + מע״מ), מחושב לפי מספר תשלומים ── */
  const installmentsCountParsed = (() => {
    const t = String(paymentsCount).trim();
    if (t === '') return 0;
    const n = parseInt(t, 10);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return n;
  })();
  const installmentPayableTotal = roundMoney2(cashTotalNum);
  const installmentEach = installmentsCountParsed > 0 ? roundMoney2(cashTotalNum / installmentsCountParsed) : 0;
  const paymentEqDisplay =
    cashTotalNum > 0 || (installmentsCountParsed > 0 && cashTotalNum === 0)
      ? installmentPayableTotal.toFixed(2)
      : '';
  const paymentXDisplay = installmentsCountParsed > 0 ? installmentEach.toFixed(2) : '';

  /* ── Save (POST new / PATCH existing) — returns saved id or null on failure ── */
  async function doSave(): Promise<string | null> {
    if (!customerId) { alert('נא לבחור לקוח לפני השמירה'); return null; }
    if (customerContactId.trim() && !quoteContactRows.some((r) => r.id === customerContactId)) {
      alert('איש הקשר שנבחר אינו שייך ללקוח הנוכחי — נא לבחור איש קשר מחדש.');
      return null;
    }
    // Required fields validation (except paymentsCount and discountPercent)
    const missing: string[] = [];
    if (!customer.trim()) missing.push('לקוח / חברה');
    if (!phone.trim()) missing.push('טלפון');
    if (!paymentTerms.trim()) missing.push('תנאי תשלום');
    if (!validityDays.trim()) missing.push('תוקף (ימים)');
    if (lineItems.filter((li) => li.description.trim() || parseFloat(li.price) > 0).length === 0) missing.push('פריט אחד לפחות');
    if (missing.length > 0) {
      alert(`שדות חובה חסרים:\n${missing.join('\n')}`);
      return null;
    }
    const user = getSessionUser();
    if (!user) { alert('אין משתמש מחובר'); return null; }
    setIsBusy(true);
    setStatusMsg('שומר...');
    try {
      // Prisma DateTime fields reject date-only strings ("2026-03-27") — must be full ISO-8601
      const toISO = (s: string | null | undefined): string | null => {
        if (!s) return null;
        try { return new Date(s).toISOString(); } catch { return null; }
      };

      // Compute validTo: prefer the form's validity date, fallback to today + validityDays
      const validToDate = paymentValidityDate
        ? new Date(paymentValidityDate).toISOString()
        : (() => {
            const d = new Date();
            d.setDate(d.getDate() + (parseInt(validityDays) || 30));
            return d.toISOString();
          })();

      // ── Build full payload — all fields the backend schema accepts ──
      const safeValidTo = (() => {
        try { const d = new Date(validToDate); if (isNaN(d.getTime())) throw new Error(); return d.toISOString(); }
        catch { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString(); }
      })();

      // lineItemsJson — store full item objects so they round-trip correctly
      const lineItemsJsonVal = lineItems
        .filter((li) => li.description.trim() || parseFloat(li.price) > 0)
        .map((li) => ({
          id: li.id,
          code: li.code,
          sku: li.sku,
          description: li.description,
          channel: li.channel,
          qty: li.qty,
          price: li.price,
          discountPct: li.discountPct,
        }));

      // amountBeforeVat — sum of line totals (qty × price × (1 - disc/100))
      const amountBeforeVat = lineItemsJsonVal.reduce((sum, li) => {
        const q = parseFloat(li.qty) || 0;
        const p = parseFloat(li.price) || 0;
        const d = parseFloat(li.discountPct) || 0;
        return sum + q * p * (1 - d / 100);
      }, 0);

      const discPct = parseFloat(discountPercent) || 0;

      const payload: Record<string, unknown> = {
        customerId,
        customerName: customer || null,
        customerContactId: customerContactId.trim() || null,
        service: 'הצעת מחיר',
        quoteNumber: quoteNo !== 'חדש' ? quoteNo : undefined,
        quoteDate: toISO(date) || new Date().toISOString(),
        followupDate: toISO(follow) || null,
        status: status || 'DRAFT',
        orderReferenceNumber: reference || null,
        salesRepresentativeName: salesRep || null,
        executorName: contact || null,
        phoneSummary: phone || null,
        faxSummary: fax || null,
        addressSummary: customerAddress || null,
        accountingNumber: accountingNo || null,
        companyRegNumber: companyNo || null,
        priceList: priceList || null,
        exchangeRate: parseFloat(rate) || null,
        orderSource: orderSource || null,
        notes: notes || null,
        internalNotes: internalNotes || null,
        lineItemsJson: lineItemsJsonVal,
        amountBeforeVat: roundMoney2(amountBeforeVat),
        amount: roundMoney2(amountBeforeVat),
        vatPercent: parseFloat(vatPercent) || 0,
        discountType: discPct > 0 ? 'PERCENT' : 'NONE',
        discountValue: discPct > 0 ? discPct : 0,
        validTo: safeValidTo,
        validityDate: toISO(paymentValidityDate) || safeValidTo,
        validityDays: parseInt(validityDays) || 30,
        paymentTerms: paymentTerms || null,
        paymentsCount: parseInt(paymentsCount) || 0,
        paymentDueDate: toISO(paymentDueDate) || null,
        functionalLabel: fFunctional || null,
        forecastClosePercent: fClosePercent || null,
        forecastUpdatedAt: toISO(fLastDate) || null,
        forecastUpdatedBy: fLastUser || null,
        forecastUpdatedTime: fLastTime || null,
        quoteTemplateId: quoteTemplateId || null,
      };

      // Strip undefined values so the backend doesn't receive them
      for (const k of Object.keys(payload)) {
        if (payload[k] === undefined) delete payload[k];
      }
      console.log('FINAL PAYLOAD', payload);
      const currentId = quoteIdRef.current;
      const url = currentId ? apiUrl(`/quotes/${currentId}`) : apiUrl('/quotes');
      const method = currentId ? 'PATCH' : 'POST';
      const r = await apiFetch(url, { method, body: JSON.stringify(payload), authUser: user });
      if (!r.ok) {
        let errBody = '';
        try { errBody = await r.text(); } catch { /* ignore */ }
        console.error('SAVE ERROR', r.status, errBody);
        throw new Error(`HTTP ${r.status}`);
      }
      const saved = await r.json();
      const savedId = saved.id as string;
      if (!currentId) {
        setQuoteId(savedId);
        setQuoteNo(String(saved.quoteNumber ?? quoteNo));
      }
      const syncPaymentTabFromServer = (q: Record<string, unknown>) => {
        if ('paymentTerms' in q) {
          const v = q.paymentTerms;
          setPaymentTerms(v != null ? String(v) : '');
        }
        if (q.validityDays != null && q.validityDays !== '') setValidityDays(String(q.validityDays));
        const vd = toInputDateYmd(q.validityDate);
        if (vd) setPaymentValidityDate(vd);
        const pd = toInputDateYmd(q.paymentDueDate);
        if (pd) setPaymentDueDate(pd);
        if (q.paymentsCount != null && q.paymentsCount !== '') setPaymentsCount(String(q.paymentsCount));
      };
      if (saved && typeof saved === 'object') {
        syncPaymentTabFromServer(saved as Record<string, unknown>);
      } else if (savedId) {
        try {
          const vr = await apiFetch(apiUrl(`/quotes/${savedId}`), { authUser: user });
          if (vr.ok) {
            const full = await vr.json();
            if (full && typeof full === 'object') syncPaymentTabFromServer(full as Record<string, unknown>);
          }
        } catch {
          /* keep current input */
        }
      }
      setStatusMsg('');
      setSavedIndicator(true);
      setTimeout(() => setSavedIndicator(false), 1000);
      if (savedId && onQuoteSaved) onQuoteSaved(savedId);
      return savedId;
    } catch {
      setStatusMsg('שגיאה בשמירה');
      setSavedIndicator(false);
      setTimeout(() => setStatusMsg(''), 3000);
      return null;
    } finally {
      setIsBusy(false);
    }
  }

  /* ── Print: open a dedicated RTL Hebrew print window from current state ── */
  /* PDFKit (backend) has no RTL support — this browser-native approach renders */
  /* Hebrew correctly using CSS direction:rtl and the browser's bidi engine.   */
  function buildQuotePrintHtml(): string {
    const fmt = (n: number) =>
      isFinite(n) ? n.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';

    const hasDiscount = parseFloat(discountPercent) > 0;
    const hasVat = parseFloat(vatPercent) > 0;
    const vatAmt = cashTotalNum - afterDiscountNum;

    const itemRows = lineItems
      .map((item, i) => {
        const qty = parseFloat(item.qty) || 0;
        const price = parseFloat(item.price) || 0;
        const disc = parseFloat(item.discountPct) || 0;
        const tot = parseFloat(calcTotal(item));
        return `
          <tr>
            <td class="nc">${i + 1}</td>
            <td class="dc">${escHtml(item.description)}</td>
            <td class="nc">${qty > 0 ? qty : ''}</td>
            <td class="nc">${price > 0 ? fmt(price) : ''}</td>
            <td class="nc">${disc > 0 ? disc + '%' : '—'}</td>
            <td class="nc"><strong>${isFinite(tot) && tot > 0 ? fmt(tot) : ''}</strong></td>
          </tr>`;
      })
      .join('');

    const hfield = (label: string, value: string) =>
      value.trim()
        ? `<div class="hfield"><span class="lbl">${label}</span><span class="val">${escHtml(value)}</span></div>`
        : '';

    const trow = (label: string, amount: string, isTotal = false) =>
      `<div class="trow${isTotal ? ' total-row' : ''}"><span>${label}</span><span class="amt">₪ ${amount}</span></div>`;

    return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>הצעת מחיר ${escHtml(quoteNo)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      direction: rtl;
      text-align: right;
      font-family: Arial, "Noto Sans Hebrew", "Rubik", Helvetica, sans-serif;
      font-size: 11pt;
      color: #111;
      background: #fff;
    }

    .page { max-width: 210mm; margin: 0 auto; padding: 14mm 18mm; }

    /* ── Company header ── */
    .co-name  { font-size: 20pt; font-weight: bold; color: #1a4f8a; }
    .co-sub   { font-size: 9.5pt; color: #555; margin-bottom: 10px; }

    /* ── Document title ── */
    .doc-title {
      font-size: 15pt; font-weight: bold; text-align: center;
      border: 2px solid #1a4f8a; color: #1a4f8a;
      padding: 5px; margin: 8px 0 12px; letter-spacing: 1px;
    }

    /* ── Header grid ── */
    .hgrid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 5px 24px;
      border: 1px solid #ddd; padding: 9px 12px; border-radius: 4px;
      background: #f9f9f9; margin-bottom: 12px;
    }
    .hfield { display: flex; align-items: baseline; gap: 6px; font-size: 10pt; min-height: 19px; }
    .lbl    { font-weight: bold; color: #333; white-space: nowrap; flex-shrink: 0; }
    .val    { color: #000; }

    /* ── Line items table ── */
    table { width: 100%; border-collapse: collapse; direction: rtl; font-size: 10pt; margin: 10px 0; }
    thead th {
      background: #1a4f8a; color: #fff; font-weight: bold;
      padding: 6px 7px; text-align: center;
      border: 1px solid #1a4f8a;
    }
    tbody tr:nth-child(even) { background: #f3f7fd; }
    tbody tr:nth-child(odd)  { background: #fff; }
    td { border: 1px solid #ccc; padding: 4px 7px; vertical-align: middle; }
    .nc { text-align: center; white-space: nowrap; }
    .dc { text-align: right; }

    /* ── Totals ── */
    .totals-wrap { display: flex; justify-content: flex-start; margin: 6px 0 14px; }
    .totals-box  { border: 1px solid #ccc; border-radius: 4px; overflow: hidden; min-width: 270px; }
    .trow {
      display: flex; justify-content: space-between; align-items: center;
      padding: 5px 14px; border-bottom: 1px solid #e5e5e5;
      font-size: 10.5pt; gap: 20px;
    }
    .trow:last-child { border-bottom: none; }
    .trow.total-row  { background: #1a4f8a; color: #fff; font-weight: bold; font-size: 12pt; }
    .amt { white-space: nowrap; font-variant-numeric: tabular-nums; }

    /* ── Section boxes ── */
    .sbox { border: 1px solid #ddd; border-radius: 4px; padding: 7px 12px; margin: 8px 0; background: #f9f9f9; font-size: 10pt; }
    .sbox h4 { font-size: 10.5pt; font-weight: bold; color: #1a4f8a; margin-bottom: 4px; border-bottom: 1px solid #ddd; padding-bottom: 2px; }
    .sbox .srow { margin-top: 3px; }

    /* ── Signature lines ── */
    .sig-section { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 22px; }
    .sig-box { border-top: 1px solid #888; padding-top: 4px; text-align: center; font-size: 9.5pt; color: #555; }

    /* ── Footer ── */
    .doc-footer { margin-top: 18px; padding-top: 6px; border-top: 2px solid #1a4f8a; font-size: 8.5pt; color: #777; text-align: center; }

    /* ── Print rules ── */
    @media print {
      .no-print { display: none !important; }
      body { background: #fff !important; }
      @page { size: A4 portrait; margin: 12mm 16mm; }
    }
  </style>
</head>
<body>
<div class="page">

  <div class="co-name">גלית – יעוץ סביבתי</div>
  <div class="co-sub">שירותי ייעוץ ובדיקות סביבתיות</div>

  <div class="doc-title">הצעת מחיר</div>

  <div class="hgrid">
    ${hfield('מספר הצעה:', quoteNo)}
    ${hfield('סימוכין:', reference)}
    ${hfield('לקוח:', customer)}
    ${hfield('תאריך:', date)}
    ${hfield('איש קשר:', contact)}
    ${hfield('בתוקף עד:', paymentValidityDate)}
    ${hfield('נציג מכירה:', salesRep)}
    ${hfield('מבצע:', performerName)}
    ${hfield('טלפון:', phone)}
    ${hfield('פקס:', fax)}
    ${hfield('ח.פ / ע.מ:', companyNo)}
    ${hfield('מספר הזמנה:', orderNo)}
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:34px">#</th>
        <th>תיאור</th>
        <th style="width:56px">כמות</th>
        <th style="width:88px">מחיר ליח׳</th>
        <th style="width:66px">הנחה%</th>
        <th style="width:88px">סה״כ</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows || '<tr><td colspan="6" style="text-align:center;color:#999;padding:10px">אין פריטים</td></tr>'}
    </tbody>
  </table>

  <div class="totals-wrap">
    <div class="totals-box">
      ${subtotalNum > 0 && hasDiscount ? trow('סכום ביניים:', fmt(subtotalNum)) : ''}
      ${hasDiscount && subtotalNum > afterDiscountNum ? trow(`הנחה ${discountPercent}%:`, fmt(subtotalNum - afterDiscountNum)) : ''}
      ${hasDiscount && subtotalNum > afterDiscountNum ? trow('לאחר הנחה:', fmt(afterDiscountNum)) : ''}
      ${hasVat && vatAmt > 0 ? trow(`מע״מ ${vatPercent}%:`, fmt(vatAmt)) : ''}
      ${trow('סה״כ לתשלום:', fmt(cashTotalNum > 0 ? cashTotalNum : subtotalNum), true)}
    </div>
  </div>

  ${paymentTerms || (paymentsCount && paymentsCount !== '0') ? `
  <div class="sbox">
    <h4>תנאי תשלום</h4>
    ${paymentTerms ? `<div class="srow">${escHtml(paymentTerms)}</div>` : ''}
    ${paymentsCount && paymentsCount !== '0'
      ? `<div class="srow">מספר תשלומים: ${escHtml(paymentsCount)}${paymentXDisplay ? ` × ₪ ${escHtml(paymentXDisplay)}` : ''}${paymentEqDisplay ? ` (סה״כ: ₪ ${escHtml(paymentEqDisplay)})` : ''}</div>`
      : ''}
    ${paymentDueDate ? `<div class="srow">תאריך פירעון: ${escHtml(paymentDueDate)}</div>` : ''}
  </div>` : ''}

  ${notes ? `
  <div class="sbox">
    <h4>הערות</h4>
    <div style="white-space:pre-wrap">${escHtml(notes)}</div>
  </div>` : ''}

  <div class="sig-section">
    <div class="sig-box">חתימת הלקוח &nbsp;✦&nbsp; אישור הצעה</div>
    <div class="sig-box">חתימת נציג החברה</div>
  </div>

  <div class="doc-footer">
    הצעת מחיר זו בתוקף עד: ${escHtml(paymentValidityDate)}${validityDays ? ` (${escHtml(validityDays)} ימים)` : ''}
  </div>

</div>
<script>
  window.addEventListener('load', function () {
    setTimeout(function () { window.print(); }, 450);
  });
</script>
</body>
</html>`;
  }

  function handlePrint() {
    const html = buildQuotePrintHtml();
    const win = window.open('', '_blank', 'width=920,height=750,scrollbars=yes,resizable=yes');
    if (!win) {
      alert('לא ניתן לפתוח חלון הדפסה — ודא שחלונות קופצים מאופשרים בדפדפן.');
      return;
    }
    win.document.write(html);
    win.document.close();
  }

  async function handleMergeClick() {
    const user = getSessionUser();
    if (!user) {
      alert('אין משתמש מחובר');
      return;
    }
    const selectedTemplateId = (quoteTemplateId || '').trim();
    if (selectedTemplateId) {
      try {
        const res = await apiFetch(apiUrl(`/quote-templates/${selectedTemplateId}`), { authUser: user });
        if (res.ok) {
          const t = await res.json() as {
            id?: string; name?: string; serviceType?: string;
            docxTemplatePath?: string | null;
            introHtml?: string | null; bodyHtml?: string | null;
            closingHtml?: string | null; termsHtml?: string | null;
          };
          const hasContent =
            !!(t.docxTemplatePath && String(t.docxTemplatePath).trim()) ||
            [t.introHtml, t.bodyHtml, t.closingHtml, t.termsHtml].some(
              (x) => typeof x === 'string' && x.trim().length > 0,
            );
          if (hasContent) {
            await handleTemplateSelected({
              id: String(t.id ?? selectedTemplateId),
              label: t.name ?? selectedTemplateId,
              subLabel: t.serviceType || undefined,
            });
            return;
          }
          alert(
            `לתבנית המשויכת להצעה אין תוכן למיזוג (לא DOCX ולא HTML): ${t.name || selectedTemplateId}. בחר תבנית אחרת ושמור את ההצעה.`,
          );
        }
      } catch {
        /* fallback to picker below */
      }
    }
    setMergeTemplateLoading(true);
    setMergeTemplateRows([]);
    try {
      const res = await apiFetch(apiUrl('/quote-templates?activeOnly=true'), { authUser: user });
      const data = res.ok ? await res.json() : [];
      const rows: QuoteLookupRow[] = (Array.isArray(data) ? data : [])
        .filter(
          (t: {
            docxTemplatePath?: string | null;
            introHtml?: string | null; bodyHtml?: string | null;
            closingHtml?: string | null; termsHtml?: string | null;
          }) =>
            !!(t.docxTemplatePath && String(t.docxTemplatePath).trim()) ||
            [t.introHtml, t.bodyHtml, t.closingHtml, t.termsHtml].some(
              (x) => typeof x === 'string' && x.trim().length > 0,
            )
        )
        .map((t: { id: string; name?: string; serviceType?: string }) => ({
          id: String(t.id),
          label: t.name ?? String(t.id),
          subLabel: t.serviceType || undefined,
        }));
      setMergeTemplateRows(rows);
    } catch {
      setMergeTemplateRows([]);
    } finally {
      setMergeTemplateLoading(false);
    }
    setMergeTemplateOpen(true);
  }

  async function handleTemplateSelected(row: QuoteLookupRow) {
    const user = getSessionUser();
    if (!user) {
      alert('אין משתמש מחובר');
      return;
    }
    setQuoteTemplateId(row.id);
    let tpl: {
      introHtml?: string | null; bodyHtml?: string | null;
      closingHtml?: string | null; termsHtml?: string | null;
      docxTemplatePath?: string | null;
    } = {};
    try {
      const res = await apiFetch(apiUrl(`/quote-templates/${row.id}`), { authUser: user });
      if (res.ok) tpl = await res.json();
    } catch { /* keep empty */ }

    // ── DOCX merge ──
    if (tpl.docxTemplatePath) {
      await handleDocxMerge(row.id, user);
      return;
    }

    // ── HTML fallback merge (when template has content parts) ──
    const hasHtmlContent = [tpl.introHtml, tpl.bodyHtml, tpl.closingHtml, tpl.termsHtml]
      .some((x) => typeof x === 'string' && x.trim().length > 0);
    if (hasHtmlContent) {
      const fmtMoney = (n: number) =>
        n.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const mappedItems: QuoteTemplateLineItem[] = lineItems.map((li) => {
        const qty = parseFloat(li.qty) || 1;
        const price = parseFloat(li.price) || 0;
        const disc = parseFloat(li.discountPct) || 0;
        const lineTotal = Math.round(qty * price * (1 - disc / 100) * 100) / 100;
        return {
          name: li.description || li.code || li.sku || '',
          quantity: qty,
          unitPrice: price,
          lineTotal,
          code: li.code || '',
          sku: li.sku || '',
          discountPct: disc,
        };
      });
      const ctx = buildQuoteTemplateContext(
        {
          customer: {
            name: customer || '',
            contactName: contact || '',
            address: customerAddress || '',
            city: customerCity || '',
            email: customerEmail || '',
            phone: phone || '',
          },
          serviceName: row.subLabel || '',
          quoteNumber: reference || quoteNo || '',
          quoteDate: date ? new Date(`${date}T12:00:00`) : new Date(),
          notes: notes || '',
          lineItems: mappedItems,
          vatPercent: parseFloat(vatPercent) || 18,
          discountType: (parseFloat(discountPercent) || 0) > 0 ? 'PERCENT' : 'NONE',
          discountValue: parseFloat(discountPercent) || 0,
          paymentTerms: paymentTerms || '',
          validityDate: paymentValidityDate || '',
          approverName: contact || '',
        },
        fmtMoney,
      );
      const merged = mergeQuoteTemplateFull(tpl, ctx);
      setMergedHtml(merged);
      setWordDocHtml(buildQuoteWordHtml({
        mergedHtml: merged,
        quoteNo: quoteNo || '',
        reference: reference || '',
        customer: customer || '',
        contact: contact || '',
        phone: phone || '',
        fax: fax || '',
        companyNo: companyNo || '',
        date: date || '',
        salesRep: salesRep || '',
        performerName: performerName || '',
        lineItems,
        subtotal: subtotal || '',
        afterDiscount: afterDiscount || '',
        cashTotal: cashTotal || '',
        discountPercent: discountPercent || '',
        vatPercent: vatPercent || '',
        paymentTerms: paymentTerms || '',
        paymentsCount: paymentsCount || '',
        paymentValidityDate: paymentValidityDate || '',
        notes: notes || '',
      }));
      return;
    }

    // ── Truly empty template: no DOCX and no HTML ──
    alert('לתבנית "' + (row.label || '') + '" לא הוגדר תוכן (לא קובץ DOCX ולא תוכן HTML). יש לערוך את התבנית דרך הגדרות התבניות.');
  }

  /**
   * מסלול מיזוג DOCX אמיתי: שולח בקשה ל-API שמבצע מיזוג בצד השרת
   * ומחזיר קובץ Word (.docx) אמיתי להורדה ישירה.
   */
  async function handleDocxMerge(templateId: string, user: { id: string; role: string }) {
    const fmtMoney = (n: number) =>
      n.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const vp = parseFloat(vatPercent) || 18;
    const discPct = parseFloat(discountPercent) || 0;

    // Calculate totals from lineItems
    const mappedItems = lineItems.map((li, idx) => {
      const qty = parseFloat(li.qty) || 1;
      const price = parseFloat(li.price) || 0;
      const disc = parseFloat(li.discountPct) || 0;
      const lineTotal = Math.round(qty * price * (1 - disc / 100) * 100) / 100;
      return {
        rowNum: String(idx + 1),
        code: li.code || li.sku || '',
        name: li.description || li.code || li.sku || '',
        quantity: String(qty),
        unitPrice: fmtMoney(price) + ' ₪',
        discountPct: disc > 0 ? disc + '%' : '0%',
        lineTotal: fmtMoney(lineTotal) + ' ₪',
      };
    });

    const rawSubtotal = lineItems.reduce((sum, li) => {
      const qty = parseFloat(li.qty) || 1;
      const price = parseFloat(li.price) || 0;
      const disc = parseFloat(li.discountPct) || 0;
      return sum + qty * price * (1 - disc / 100);
    }, 0);
    const sub = Math.round(rawSubtotal * 100) / 100;
    const afterDiscountVal = discPct > 0 ? Math.round(sub * (1 - discPct / 100) * 100) / 100 : sub;
    const vatVal = Math.round(afterDiscountVal * (vp / 100) * 100) / 100;
    const totalVal = Math.round((afterDiscountVal + vatVal) * 100) / 100;

    const byId = customerContactId.trim()
      ? quoteContactRows.find((r) => r.id === customerContactId)
      : undefined;
    const fallbackContact = quoteContactRows.find((r) => r.isPrimary) ?? quoteContactRows[0];
    const selectedContact = byId ?? fallbackContact;
    const contactNameMerged =
      (contact || '').trim() ||
      (selectedContact?.fullName || '').trim() ||
      '';
    const contactPhoneMerged = selectedContact
      ? (selectedContact.mobile || '').trim() || (selectedContact.phone || '').trim()
      : '';
    const contactEmailMerged = selectedContact ? (selectedContact.email || '').trim() : '';

    const mergeData: Record<string, unknown> = {
      quoteId: quoteIdRef.current || undefined,
      quoteNumber: reference || quoteNo || '',
      contractSurveyNumber: (orderNo || reference || quoteNo || '').trim(),
      quoteDate: date
        ? new Date(date).toLocaleDateString('he-IL')
        : new Date().toLocaleDateString('he-IL'),
      validUntil: paymentValidityDate
        ? new Date(paymentValidityDate).toLocaleDateString('he-IL')
        : '',
      customerName: customer || '',
      contactName: contactNameMerged,
      contactTitle: '',
      customerAddress: customerAddress || '',
      customerCity: customerCity || '',
      customerPhone: phone || '',
      customerEmail: customerEmail || '',
      contactPhone: contactPhoneMerged,
      contactEmail: contactEmailMerged,
      salesRepName: salesRep || '',
      approverName: contactNameMerged,
      subtotal: fmtMoney(sub) + ' ₪',
      discountPercent: discPct > 0 ? String(discPct) : '0',
      subtotalAfterDiscount: fmtMoney(afterDiscountVal) + ' ₪',
      vatAmount: fmtMoney(vatVal) + ' ₪',
      totalAmount: fmtMoney(totalVal) + ' ₪',
      vat: fmtMoney(vatVal) + ' ₪',
      total: fmtMoney(totalVal) + ' ₪',
      paymentTerms: paymentTerms || '',
      validityDate: paymentValidityDate
        ? new Date(paymentValidityDate).toLocaleDateString('he-IL')
        : '',
      notes: notes || '',
      items: mappedItems,
    };

    try {
      const res = await apiFetch(apiUrl(`/quote-templates/${templateId}/merge-docx`), {
        authUser: user,
        method: 'POST',
        body: JSON.stringify(mergeData),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ message: 'Unknown error' }));
        alert(`שגיאה במיזוג DOCX: ${errBody.message || res.statusText}`);
        return;
      }

      // Download the DOCX blob
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safeName = (customer || 'quote').replace(/[^\u0590-\u05FFa-zA-Z0-9 _-]/g, '').trim() || 'quote';
      a.href = url;
      a.download = `הצעת_מחיר_${safeName}_${reference || quoteNo || 'חדש'}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) {
      console.error('DOCX merge error:', err);
      alert('שגיאה בהורדת קובץ Word');
    }
  }

  function openQuoteLookup(kind: 'contact' | 'salesRep' | 'performer') {
    setQuoteLookupKind(kind);
    setQuoteLookupOpen(true);
  }

  function quoteLookupTitle(): string {
    switch (quoteLookupKind) {
      case 'contact':
        return 'בחירת איש קשר';
      case 'salesRep':
        return 'בחירת נציג מכירה';
      case 'performer':
        return 'בחירת מבצע';
      default:
        return '';
    }
  }

  function quoteLookupRowsForModal(): QuoteLookupRow[] {
    switch (quoteLookupKind) {
      case 'contact':
        return quoteContactRows.map((c) => ({
          id: c.id,
          label: c.fullName || c.id,
          subLabel: c.isPrimary ? 'איש קשר ראשי' : undefined,
        }));
      case 'salesRep':
      case 'performer':
        return quoteUserRows.map((u) => ({
          id: u.id,
          label: u.name,
          subLabel: u.employeeNumber?.trim() ? `מס׳ עובד ${String(u.employeeNumber).trim()}` : undefined,
        }));
      default:
        return [];
    }
  }

  function quoteLookupEmptyMessage(): string {
    if (quoteLookupKind === 'contact' && !customerId.trim()) return 'יש לבחור לקוח תחילה';
    return 'אין רשומות להצגה';
  }

  function onQuoteLookupPick(row: QuoteLookupRow | null) {
    if (quoteLookupKind === 'contact') {
      if (!row) {
        setCustomerContactId('');
        setContact('');
        return;
      }
      setCustomerContactId(row.id);
      setContact(row.label);
      return;
    }
    if (quoteLookupKind === 'salesRep') {
      if (!row) {
        setSalesRepresentativeUserId('');
        setSalesRep('');
        return;
      }
      setSalesRepresentativeUserId(row.id);
      const u = quoteUserRows.find((x) => x.id === row.id);
      setSalesRep(u?.name ?? row.label);
      return;
    }
    if (quoteLookupKind === 'performer') {
      if (!row) {
        setPerformerUserId('');
        setPerformerName('');
        return;
      }
      setPerformerUserId(row.id);
      const u = quoteUserRows.find((x) => x.id === row.id);
      setPerformerName(u?.name ?? row.label);
    }
  }

  const salesRepDisplayText = salesRepresentativeUserId
    ? (() => {
        const u = quoteUserRows.find((x) => x.id === salesRepresentativeUserId);
        return u ? userOptionLabel(u) : salesRep.trim() || '';
      })()
    : salesRep.trim();

  const performerDisplayText = performerUserId
    ? (() => {
        const u = quoteUserRows.find((x) => x.id === performerUserId);
        return u ? userOptionLabel(u) : performerName.trim() || '';
      })()
    : performerName.trim();


  /* ── shared input classes ── */
  const inp = 'h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-base outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200 transition-colors';
  const lbl = 'text-sm font-medium text-gray-500 mb-0.5';

  return (
    <div ref={rootRef} className="flex flex-col min-h-screen bg-gray-50" dir="rtl">
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 bg-white border-b border-gray-100 px-6 py-2 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-full bg-emerald-500 flex items-center justify-center text-white font-bold text-sm shadow-md">G</div>
          <div>
            <h1 className="text-base font-bold text-gray-800 leading-tight">הצעת מחיר {initialQuoteId ? '' : 'חדשה'}</h1>
            <p className="text-[10px] text-gray-400 leading-tight">גלית CRM</p>
          </div>
          {quoteNo && <span className="mr-3 rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-500">{quoteNo}</span>}
          <div className="mr-2 flex items-center gap-1">
            <span className="text-xs text-gray-400">סימוכין:</span>
            <input className="h-8 w-28 rounded-lg border border-gray-200 bg-gray-50 px-2 text-sm outline-none focus:border-blue-400" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="מס׳ סימוכין" />
          </div>
          {statusMsg && (
            <span className={`mr-2 rounded-full px-3 py-1 text-sm font-semibold ${statusMsg.includes('שגיאה') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}`}>{statusMsg}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* שמור — rightmost (first in RTL) */}
          <div className="relative">
            <button type="button" className="flex flex-col items-center gap-0.5 transition-colors disabled:opacity-40" disabled={isBusy} onClick={() => doSave()}>
              <span className="h-10 w-10 rounded-full border border-emerald-300 bg-emerald-50 flex items-center justify-center text-emerald-600 hover:bg-emerald-100 hover:text-emerald-700"><Save size={18} /></span>
              <span className="text-[10px] text-emerald-600 font-medium">שמור</span>
            </button>
            {savedIndicator && <span className="absolute top-1/2 -translate-y-1/2 left-full ml-1 text-xs font-semibold text-emerald-600 whitespace-nowrap">נשמר</span>}
          </div>
          <button type="button" className="flex flex-col items-center gap-0.5 transition-colors" onClick={() => handleMergeClick()}>
            <span className="h-10 w-10 rounded-full border border-gray-200 bg-white flex items-center justify-center text-gray-400 hover:bg-gray-50 hover:text-gray-600"><FileText size={18} /></span>
            <span className="text-[10px] text-gray-500">מיזוג</span>
          </button>
          <button type="button" className="flex flex-col items-center gap-0.5 transition-colors disabled:opacity-40" disabled={isBusy} onClick={async () => {
            const id = await doSave();
            if (!id) return;
            if (!customerEmail?.trim()) { setStatusMsg('אין כתובת מייל לאיש הקשר'); return; }
            try {
              setStatusMsg('שולח מייל…');
              const user = getSessionUser();
              const r = await apiFetch(apiUrl(`/quotes/${id}/send-email`), {
                method: 'POST',
                body: JSON.stringify({ email: customerEmail.trim() }),
                authUser: user,
              });
              if (!r.ok) {
                const err = await r.json().catch(() => null);
                setStatusMsg(err?.message || 'שגיאה בשליחת מייל');
                return;
              }
              setStatusMsg(`מייל נשלח ל-${customerEmail.trim()}`);
              if (onQuoteSent && id) onQuoteSent(id);
              setTimeout(() => setStatusMsg(''), 3000);
            } catch (_e) {
              setStatusMsg('שגיאה בשליחת מייל');
            }
          }}>
            <span className="h-10 w-10 rounded-full border border-gray-200 bg-white flex items-center justify-center text-gray-400 hover:bg-gray-50 hover:text-gray-600"><Mail size={18} /></span>
            <span className="text-[10px] text-gray-500">שלח במייל</span>
          </button>
          <button type="button" className="flex flex-col items-center gap-0.5 transition-colors disabled:opacity-40" disabled={isBusy} onClick={() => { const phoneNum = (phone || '').replace(/\D/g, ''); const msg = encodeURIComponent(`הצעת מחיר ${quoteNo || ''} - ${customer || ''}`); window.open(`https://wa.me/${phoneNum}?text=${msg}`, '_blank'); }}>
            <span className="h-10 w-10 rounded-full border border-gray-200 bg-white flex items-center justify-center text-green-500 hover:bg-green-50 hover:text-green-600"><MessageCircle size={18} /></span>
            <span className="text-[10px] text-gray-500">וואטסאפ</span>
          </button>
          <button type="button" className="flex flex-col items-center gap-0.5 transition-colors" onClick={() => handlePrint()}>
            <span className="h-10 w-10 rounded-full border border-gray-200 bg-white flex items-center justify-center text-gray-400 hover:bg-gray-50 hover:text-gray-600"><Printer size={18} /></span>
            <span className="text-[10px] text-gray-500">הדפס</span>
          </button>
          {onExit && (
            <button type="button" className="flex flex-col items-center gap-0.5 transition-colors" onClick={onExit}>
              <span className="h-10 w-10 rounded-full border border-gray-200 bg-white flex items-center justify-center text-gray-400 hover:bg-gray-50 hover:text-gray-600"><X size={18} /></span>
              <span className="text-[10px] text-gray-500">סגור</span>
            </button>
          )}
        </div>
      </header>

      {/* ── Scrollable Content — 2-column landscape layout on desktop ── */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-3 pb-4">
        <div className="flex flex-col xl:flex-row gap-3 w-full">

          {/* ══════ RIGHT / MAIN COLUMN (desktop ~62%) ══════ */}
          <div className="flex-1 min-w-0 space-y-3">

            {/* ── Customer Details ── */}
            <section className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4">
              <h3 className="text-base font-bold text-gray-700 mb-2 flex items-center gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-blue-50 text-blue-500"><SearchIcon size={12} /></span>
                פרטי לקוח
              </h3>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <div>
                  <div className={lbl}>לקוח / חברה</div>
                  <div className="flex gap-2">
                    <input className={`${inp} flex-1 ${prefillCustomer ? 'bg-gray-50 text-gray-600' : ''}`} readOnly={!!prefillCustomer} value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="שם הלקוח" />
                    {!prefillCustomer && (
                      <button type="button" className="h-9 w-9 shrink-0 rounded-lg border border-gray-200 bg-white text-gray-400 hover:bg-gray-50 hover:text-gray-600 flex items-center justify-center transition-colors" onClick={() => setPickerOpen(true)}>
                        <SearchIcon size={16} />
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <div className={lbl}>איש קשר</div>
                  {quoteContactRows.length > 0 ? (
                    <select className={inp} value={customerContactId} onChange={(e) => setCustomerContactId(e.target.value)}>
                      <option value="">— בחר איש קשר —</option>
                      {quoteContactRows.map((c) => <option key={c.id} value={c.id}>{c.fullName}{c.isPrimary ? ' (ראשי)' : ''}</option>)}
                    </select>
                  ) : (
                    <input className={`${inp} bg-gray-50`} readOnly value={contact} placeholder="אין אנשי קשר" />
                  )}
                </div>
                <div>
                  <div className={lbl}>טלפון</div>
                  <input className={inp} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="טלפון" />
                </div>
                <div>
                  <div className={lbl}>אימייל איש קשר</div>
                  <input className={inp} value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="אימייל" />
                </div>
              </div>
            </section>

            {/* ── Line Items ── */}
            <section className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-base font-bold text-gray-700 flex items-center gap-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-50 text-emerald-500"><Plus size={12} /></span>
                  פירוט פריטים
                  <span className="text-xs font-normal text-gray-400 mr-1">({lineItems.length})</span>
                </h3>
                <button type="button" className="flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-2.5 text-base font-bold text-white hover:bg-emerald-600 shadow-md transition-colors" onClick={() => { const next = newLineItem(); setLineItems((prev) => [...prev, next]); setSelectedLineIdx(lineItems.length); }}>
                  <Plus size={20} />הוסף פריט
                </button>
              </div>
              {lineItems.length === 0 ? (
                <div className="py-6 text-center text-gray-400 text-base rounded-xl border-2 border-dashed border-gray-200">אין פריטים — לחץ &quot;הוסף פריט&quot; להתחלה</div>
              ) : (
                <div className="space-y-2">
                  {lineItems.map((item, idx) => {
                    const total = calcTotal(item);
                    const sel = idx === selectedLineIdx;
                    return (
                      <div key={item.id} className={`rounded-xl border-2 ${sel ? 'border-blue-200 bg-blue-50/40 shadow-sm' : 'border-gray-100 bg-gray-50/30'} p-3 transition-all cursor-pointer hover:border-blue-100`} onClick={() => setSelectedLineIdx(idx)}>
                        <div className="grid gap-2 items-end sm:grid-cols-2 lg:grid-cols-12">
                          <div className="lg:col-span-1">
                            <div className="text-sm font-medium text-gray-400 mb-0.5">קוד</div>
                            <input value={item.code} onChange={(e) => setLineItems((prev) => prev.map((r, i) => i === idx ? { ...r, code: e.target.value } : r))} className="h-11 w-full rounded-lg border border-gray-200 bg-white px-2 text-base outline-none focus:border-blue-400" />
                          </div>
                          <div className="lg:col-span-1">
                            <div className="text-sm font-medium text-gray-400 mb-0.5">מק&quot;ט</div>
                            <input value={item.sku} onChange={(e) => setLineItems((prev) => prev.map((r, i) => i === idx ? { ...r, sku: e.target.value } : r))} className="h-11 w-full rounded-lg border border-gray-200 bg-white px-2 text-base outline-none focus:border-blue-400" />
                          </div>
                          <div className="sm:col-span-2 lg:col-span-4">
                            <div className="text-sm font-medium text-gray-400 mb-0.5">תיאור השירות / מוצר</div>
                            <input value={item.description} list="quote-catalog-list" onChange={(e) => { const val = e.target.value; const match = CATALOG_ITEMS.find((c) => c.description === val); if (match) { setLineItems((prev) => prev.map((r, i) => i === idx ? { ...r, description: match.description, code: match.code, sku: match.sku, price: match.price } : r)); } else { setLineItems((prev) => prev.map((r, i) => i === idx ? { ...r, description: val } : r)); } }} className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-base outline-none focus:border-blue-400" placeholder="שם הפריט" />
                          </div>
                          <div className="lg:col-span-2">
                            <div className="text-sm font-medium text-gray-400 mb-0.5">מחיר ליחידה</div>
                            <div className="relative">
                              <input value={item.price} onChange={(e) => setLineItems((prev) => prev.map((r, i) => i === idx ? { ...r, price: e.target.value } : r))} className="h-11 w-full rounded-lg border border-gray-200 bg-white pl-7 pr-3 text-base outline-none focus:border-blue-400 text-left" placeholder="0" />
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₪</span>
                            </div>
                          </div>
                          <div className="lg:col-span-1">
                            <div className="text-sm font-medium text-gray-400 mb-0.5">כמות</div>
                            <input value={item.qty} onChange={(e) => setLineItems((prev) => prev.map((r, i) => i === idx ? { ...r, qty: e.target.value } : r))} className="h-11 w-full rounded-lg border border-gray-200 bg-white px-2 text-base outline-none focus:border-blue-400 text-center" placeholder="1" />
                          </div>
                          <div className="lg:col-span-1">
                            <div className="text-sm font-medium text-gray-400 mb-0.5">הנחה %</div>
                            <input value={item.discountPct} onChange={(e) => setLineItems((prev) => prev.map((r, i) => i === idx ? { ...r, discountPct: e.target.value } : r))} className="h-11 w-full rounded-lg border border-gray-200 bg-white px-2 text-base outline-none focus:border-blue-400 text-center" placeholder="0" />
                          </div>
                          <div className="lg:col-span-2 flex items-end gap-2">
                            <div className="flex-1">
                              <div className="text-sm font-medium text-gray-400 mb-0.5">סה&quot;כ</div>
                              <div className="h-11 flex items-center text-base font-bold text-gray-800 whitespace-nowrap">{total} ₪</div>
                            </div>
                            <button type="button" className="mb-0.5 h-8 w-8 shrink-0 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition-colors" onClick={(e) => { e.stopPropagation(); setLineItems((prev) => prev.filter((_, i) => i !== idx)); setSelectedLineIdx(null); }}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <datalist id="quote-catalog-list">
                {CATALOG_ITEMS.map((c) => <option key={c.code} value={c.description} />)}
              </datalist>
            </section>

            {/* ── Notes ── */}
            <section className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className={lbl}>הערות</div>
                  <textarea className="mt-1 h-16 w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-base outline-none focus:border-blue-400 transition-colors" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="הערות להצעה..." />
                </div>
                <div>
                  <div className={lbl}>הערה פנימית</div>
                  <textarea className="mt-1 h-16 w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-base outline-none focus:border-blue-400 transition-colors" value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} placeholder="הערה פנימית (לא תופיע במסמך)..." />
                </div>
              </div>
            </section>
          </div>

          {/* ══════ LEFT / SIDEBAR COLUMN (desktop ~38%) ══════ */}
          <div className="w-full xl:w-[340px] shrink-0 space-y-3">

            {/* ── Terms, Tracking & Sales Rep ── */}
            <section className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4">
              <h3 className="text-base font-bold text-gray-700 mb-2 flex items-center gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-purple-50 text-purple-500"><FileText size={12} /></span>
                תנאים ומעקב
              </h3>
              <div className="space-y-3">
                <div>
                  <div className={lbl}>תנאי תשלום</div>
                  <select className={inp} value={paymentTerms} onChange={(e) => { const v = e.target.value; if (v === ADD_PAYMENT_TERM) { setNewPaymentTermLabel(''); setAddPaymentTermOpen(true); return; } setPaymentTerms(v); }}>
                    <option value="">—</option>
                    {paymentTerms && !paymentTermRows.some((r) => r.label === paymentTerms) ? <option value={paymentTerms}>{paymentTerms}</option> : null}
                    {paymentTermRows.map((r) => <option key={r.id} value={r.label}>{r.label}</option>)}
                    <option value={ADD_PAYMENT_TERM}>+ הוסף תנאי תשלום</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className={lbl}>תוקף (ימים)</div>
                    <input className={inp} value={validityDays} onChange={(e) => { const v = e.target.value; setValidityDays(v); const n = parseInt(v, 10); if (v.trim() === '' || Number.isNaN(n) || n < 0) { setPaymentDueDate(''); return; } setPaymentDueDate(dueDateAfterDaysFromQuote(date, n)); }} placeholder="30" />
                  </div>
                  <div>
                    <div className={lbl}>תאריך תוקף</div>
                    <input type="date" className={inp} value={paymentDueDate} onChange={(e) => setPaymentDueDate(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className={lbl}>מספר תשלומים</div>
                    <input className={inp} value={paymentsCount} onChange={(e) => setPaymentsCount(e.target.value)} placeholder="1" />
                  </div>
                  <div>
                    <div className={lbl}>% הנחה כללית</div>
                    <input className={inp} value={discountPercent} onChange={(e) => setDiscountPercent(e.target.value)} placeholder="0" />
                  </div>
                </div>
                {(() => { const n = parseInt(paymentsCount) || 0; const total = parseFloat(cashTotal) || 0; if (n > 1 && total > 0) { return <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm font-semibold text-emerald-700 text-center">{n} תשלומים של {(total / n).toFixed(2)} ₪ לתשלום (כולל מע&quot;מ)</div>; } return null; })()}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className={lbl}>נציג מכירה</div>
                    <div className="flex gap-2">
                      <input className={`${inp} flex-1 bg-gray-50`} readOnly value={salesRepDisplayText} placeholder="לחץ לבחירה" />
                      <button type="button" className="h-9 w-9 shrink-0 rounded-lg border border-gray-200 bg-white text-gray-400 hover:bg-gray-50 hover:text-gray-600 flex items-center justify-center transition-colors" onClick={() => openQuoteLookup('salesRep')}>
                        <SearchIcon size={16} />
                      </button>
                    </div>
                  </div>
                  <div>
                    <div className={lbl}>למעקב</div>
                    <input type="date" className={inp} value={follow} onChange={(e) => setFollow(e.target.value)} />
                  </div>
                </div>
              </div>
            </section>

            {/* ── Dark Financial Summary ── */}
            <section className="rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 text-white p-4 shadow-lg">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">סה&quot;כ פריטים</span>
                  <span className="font-bold text-emerald-400 text-lg">{subtotal || '0.00'} ₪</span>
                </div>
                {parseFloat(discountPercent) > 0 && (
                  <>
                    <div className="flex items-center justify-between text-base">
                      <span className="text-slate-400">הנחה {discountPercent}%</span>
                      <span className="text-slate-300">-{((parseFloat(subtotal) || 0) - (parseFloat(afterDiscount) || parseFloat(subtotal) || 0)).toFixed(2)} ₪</span>
                    </div>
                    <div className="flex items-center justify-between text-base">
                      <span className="text-slate-400">לאחר הנחה</span>
                      <span className="text-slate-300">{afterDiscount || subtotal || '0.00'} ₪</span>
                    </div>
                  </>
                )}
                <div className="flex items-center justify-between text-base">
                  <span className="text-slate-300">מע&quot;מ ({vatPercent}%)</span>
                  <span className="text-slate-300">{((parseFloat(cashTotal) || 0) - (parseFloat(afterDiscount) || parseFloat(subtotal) || 0)).toFixed(2)} ₪</span>
                </div>
                <div className="border-t border-slate-600 pt-4">
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold">סה&quot;כ לתשלום</span>
                    <span className="text-2xl font-extrabold text-emerald-400">{cashTotal || '0.00'} ₪</span>
                  </div>
                </div>
              </div>
            </section>

            {/* ── Footer Note ── */}
            <p className="text-sm text-gray-400 text-right px-1">שים לב: וודא שכל פרטי הלקוח מעודכנים לפני הפקת ה-PDF.</p>
          </div>

        </div>
      </div>

      {/* ── Sticky Bottom Actions ── */}
      {/* Bottom action bar removed — actions moved to header icon row */}

      {/* ── Modals (logic unchanged) ── */}
      {pickerOpen && (
        <CustomerPickerModal
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onSelect={(c) => {
            setCustomer(c.name);
            setCustomerId(c.id);
            if (c.phone) setPhone(c.phone);
            if (c.address) setCustomerAddress(c.address);
            if (c.city) setCustomerCity(c.city);
            if (c.email) setCustomerEmail(c.email);
            if (c.contactName) setContact(c.contactName);
            setPickerOpen(false);
          }}
        />
      )}
      {quoteLookupOpen && (
        <QuoteLookupModal
          open={quoteLookupOpen}
          title={quoteLookupTitle()}
          rows={quoteLookupRowsForModal()}
          onClose={() => setQuoteLookupOpen(false)}
          onSelect={(row) => { onQuoteLookupPick(row); setQuoteLookupOpen(false); }}
          allowClear
          clearLabel="נקה בחירה"
          emptyMessage={quoteLookupEmptyMessage()}
        />
      )}
      {mergeTemplateOpen && (
        <QuoteLookupModal
          open={mergeTemplateOpen}
          title="בחירת תבנית להצעת מחיר"
          rows={mergeTemplateRows}
          onClose={() => setMergeTemplateOpen(false)}
          onSelect={(row) => {
            setMergeTemplateOpen(false);
            if (row) handleTemplateSelected(row);
          }}
          allowClear={false}
          emptyMessage={mergeTemplateLoading ? 'טוען תבניות...' : 'אין תבניות פעילות'}
        />
      )}
      {addPaymentTermOpen && (
        <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/40">
          <div className="w-96 rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl" dir="rtl">
            <div className="mb-4 text-base font-bold text-gray-800">הוסף תנאי תשלום</div>
            <input
              autoFocus
              className="mb-4 h-11 w-full rounded-xl border border-gray-200 px-4 text-base outline-none focus:border-blue-400"
              placeholder="תנאי תשלום חדש..."
              value={newPaymentTermLabel}
              onChange={(e) => setNewPaymentTermLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitNewPaymentTerm(); if (e.key === 'Escape') setAddPaymentTermOpen(false); }}
            />
            <div className="flex justify-end gap-3">
              <button type="button" className="rounded-xl border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors" onClick={() => setAddPaymentTermOpen(false)}>ביטול</button>
              <button type="button" className="rounded-xl bg-blue-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-600 transition-colors" onClick={submitNewPaymentTerm}>שמור</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
