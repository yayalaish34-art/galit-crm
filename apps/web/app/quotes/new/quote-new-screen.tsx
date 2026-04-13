'use client';
import React, { useState, useEffect, useRef } from 'react';
import { Save, Plus, Trash2, Copy, RefreshCw, Printer, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, FileText, LogOut, X, Search as SearchIcon, Pencil } from 'lucide-react';
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

type QuoteContactRow = { id: string; fullName: string; isPrimary: boolean };

function normalizeQuoteContacts(raw: unknown): QuoteContactRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null && 'id' in x)
    .map((x) => ({
      id: String(x.id),
      fullName: String(x.fullName ?? ''),
      isPrimary: Boolean(x.isPrimary),
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
}: {
  embedded?: boolean;
  prefillCustomer?: PrefillCustomer | null;
  /** When set, pre-select this contact after customer contacts are loaded */
  prefillContactId?: string | null;
  /** When set (or `?quoteId=` in the URL), load quote and restore תנאי תשלום from the server */
  initialQuoteId?: string | null;
  onExit?: () => void;
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

  /* ── Pre-fill from customer card context ── */
  useEffect(() => {
    if (!prefillCustomer) return;
    setCustomer(prefillCustomer.name);
    if (prefillCustomer.phone)           setPhone(prefillCustomer.phone);
    if (prefillCustomer.fax)             setFax(prefillCustomer.fax);
    if (prefillCustomer.companyRegNumber) setCompanyNo(prefillCustomer.companyRegNumber);
  }, [prefillCustomer]);

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
  const quoteIdRef = useRef<string | null>(null);
  // Keep ref in sync so async closures always see the latest id
  function setQuoteId(id: string | null) { quoteIdRef.current = id; _setQuoteId(id); }
  const [customerId, setCustomerId] = useState<string>('');
  const [quoteContactRows, setQuoteContactRows] = useState<QuoteContactRow[]>([]);
  const [customerContactId, setCustomerContactId] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

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
    if (row) setContact(row.fullName);
    else if (!customerContactId) setContact('');
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

      // ── Build minimal safe payload — only fields the backend schema accepts ──
      const safeValidTo = (() => {
        try { const d = new Date(validToDate); if (isNaN(d.getTime())) throw new Error(); return d.toISOString(); }
        catch { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString(); }
      })();
      const safeItems = lineItems.map((item) => ({
        description: item.description,
        price: parseFloat(item.price) || 0,
        quantity: parseFloat(item.qty) || 0,
      }));
      // amount calculated ONLY from items — no external total field
      const safeAmount = safeItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

      const payload = {
        customerId,
        service: 'הצעת מחיר',
        amount: safeAmount,
        validTo: safeValidTo,
        items: safeItems,
      };
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
      setStatusMsg('נשמר ✓');
      setTimeout(() => setStatusMsg(''), 2500);
      return savedId;
    } catch {
      setStatusMsg('שגיאה בשמירה');
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
    setMergeTemplateLoading(true);
    setMergeTemplateRows([]);
    try {
      const res = await apiFetch(apiUrl('/quote-templates?activeOnly=true'), { authUser: user });
      const data = res.ok ? await res.json() : [];
      const rows: QuoteLookupRow[] = (Array.isArray(data) ? data : []).map(
        (t: { id: string; name?: string; serviceType?: string }) => ({
          id: String(t.id),
          label: t.name ?? String(t.id),
          subLabel: t.serviceType || undefined,
        })
      );
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
    let tpl: { introHtml?: string | null; bodyHtml?: string | null; closingHtml?: string | null; termsHtml?: string | null } = {};
    try {
      const res = await apiFetch(apiUrl(`/quote-templates/${row.id}`), { authUser: user });
      if (res.ok) tpl = await res.json();
    } catch { /* keep empty */ }

    const lineItemsMapped: QuoteTemplateLineItem[] = lineItems.map((li) => ({
      name: li.description || li.code || li.sku || '',
      quantity: parseFloat(li.qty) || 1,
      unitPrice: parseFloat(li.price) || 0,
    }));

    const ctx = buildQuoteTemplateContext(
      {
        customer: customer
          ? { name: customer, contactName: contact || null, phone: phone || null, address: null, city: null, email: null }
          : null,
        serviceName: 'הצעת מחיר',
        quoteNumber: reference,
        quoteDate: date ? new Date(date) : new Date(),
        notes: notes,
        lineItems: lineItemsMapped,
        vatPercent: parseFloat(vatPercent) || 18,
        discountType: discountPercent && parseFloat(discountPercent) > 0 ? 'PERCENT' : 'NONE',
        discountValue: parseFloat(discountPercent) || 0,
      },
      (n) => `₪${n.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    );

    const html = mergeQuoteTemplateFull(tpl, ctx);
    setMergedHtml(html);
    setTab('מלל');

    // Build Word-compatible HTML and store in state — download triggered by user click on button
    const wordHtml = buildQuoteWordHtml({
      mergedHtml: html,
      quoteNo,
      reference,
      customer,
      contact,
      phone,
      fax,
      companyNo,
      date,
      salesRep,
      performerName,
      lineItems,
      subtotal,
      afterDiscount,
      cashTotal,
      discountPercent,
      vatPercent,
      paymentTerms,
      paymentsCount,
      paymentValidityDate,
      notes,
    });
    setWordDocHtml(wordHtml);
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
  const inp = 'h-8 w-full rounded border border-gray-300 bg-white px-2 text-sm focus:border-blue-400 focus:outline-none';
  const lbl = 'text-xs font-medium text-gray-600 whitespace-nowrap';

  return (
    <main ref={rootRef} className={embedded ? '' : 'min-h-screen bg-gray-100 p-2'} dir="rtl">
      <div className="flex flex-col bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden" style={{ minHeight: 700 }}>

        {/* ═══ TOP BAR ═══ */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-2 gap-3 flex-shrink-0">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-bold text-gray-800">הצעת מחיר</h1>
            <span className="text-sm text-gray-500">#{quoteNo}</span>
            {statusMsg && (
              <span className={`text-xs font-semibold ${statusMsg.includes('שגיאה') ? 'text-red-600' : 'text-green-600'}`}>{statusMsg}</span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button type="button" disabled={isBusy} onClick={() => doSave()} className="flex items-center gap-1 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              <Save size={14} /> שמור
            </button>
            <button type="button" disabled={isBusy} onClick={async () => { const id = await doSave(); if (id) onExit?.(); }} className="flex items-center gap-1 rounded bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50">
              <LogOut size={14} /> שמור וצא
            </button>
            <button type="button" disabled={isBusy} onClick={() => handleMergeClick()} className="flex items-center gap-1 rounded border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              <FileText size={14} /> מיזוג
            </button>
            {wordDocHtml && (
              <button type="button" onClick={() => downloadWordDoc(wordDocHtml, customer, quoteNo)} className="flex items-center gap-1 rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700">
                <FileText size={14} /> הורד Word
              </button>
            )}
            <button type="button" disabled={isBusy} onClick={() => handlePrint()} className="flex items-center gap-1 rounded border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              <Printer size={14} /> הדפסה
            </button>
            {onExit && (
              <button type="button" onClick={onExit} className="flex items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-50" title="סגור">
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* ═══ FORM HEADER ═══ */}
        <div className="border-b border-gray-200 bg-gray-50/50 px-4 py-3 space-y-3 flex-shrink-0">
          {/* Row 1: customer + contact + date + status */}
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className={lbl}>לקוח</label>
              <div className="flex">
                <button type="button" onClick={() => setPickerOpen(true)} className="flex items-center justify-center h-8 w-8 rounded-r border border-l-0 border-gray-300 bg-gray-100 hover:bg-gray-200 flex-shrink-0">
                  <SearchIcon size={14} className="text-gray-500" />
                </button>
                <input className={inp + ' rounded-r-none'} value={customer} onChange={(e) => setCustomer(e.target.value)} readOnly={!!prefillCustomer} />
              </div>
            </div>
            <div>
              <label className={lbl}>איש קשר</label>
              <div className="flex">
                <button type="button" onClick={() => openQuoteLookup('contact')} className="flex items-center justify-center h-8 w-8 rounded-r border border-l-0 border-gray-300 bg-gray-100 hover:bg-gray-200 flex-shrink-0">
                  <SearchIcon size={14} className="text-gray-500" />
                </button>
                <input readOnly className={inp + ' rounded-r-none cursor-default'} value={contact} placeholder="בחר איש קשר" />
              </div>
            </div>
            <div>
              <label className={lbl}>תאריך</label>
              <input type="date" className={inp} value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className={lbl}>סטטוס</label>
              <input className={inp} value={status} onChange={(e) => setStatus(e.target.value)} />
            </div>
          </div>

          {/* Row 2: reference, sales rep, performer, phone, companyNo, follow */}
          <div className="grid grid-cols-6 gap-3">
            <div>
              <label className={lbl}>סימוכין</label>
              <input className={inp} value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
            <div>
              <label className={lbl}>נציג מכירה</label>
              <div className="flex">
                <button type="button" onClick={() => openQuoteLookup('salesRep')} className="flex items-center justify-center h-8 w-8 rounded-r border border-l-0 border-gray-300 bg-gray-100 hover:bg-gray-200 flex-shrink-0">
                  <SearchIcon size={14} className="text-gray-500" />
                </button>
                <input readOnly className={inp + ' rounded-r-none cursor-default'} value={salesRepDisplayText} placeholder="בחר נציג" />
              </div>
            </div>
            <div>
              <label className={lbl}>מבצע</label>
              <div className="flex">
                <button type="button" onClick={() => openQuoteLookup('performer')} className="flex items-center justify-center h-8 w-8 rounded-r border border-l-0 border-gray-300 bg-gray-100 hover:bg-gray-200 flex-shrink-0">
                  <SearchIcon size={14} className="text-gray-500" />
                </button>
                <input readOnly className={inp + ' rounded-r-none cursor-default'} value={performerDisplayText} placeholder="בחר מבצע" />
              </div>
            </div>
            <div>
              <label className={lbl}>טלפון</label>
              <input className={inp} value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <label className={lbl}>ח.פ / ע.מ</label>
              <input className={inp} value={companyNo} onChange={(e) => setCompanyNo(e.target.value)} />
            </div>
            <div>
              <label className={lbl}>למעקב</label>
              <input type="date" className={inp} value={follow} onChange={(e) => setFollow(e.target.value)} />
            </div>
          </div>
        </div>

        {/* ═══ LINE ITEMS TABLE ═══ */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-white flex-shrink-0">
            <span className="text-sm font-semibold text-gray-700">פריטים ({lineItems.length})</span>
            <button
              type="button"
              onClick={() => {
                const next = newLineItem();
                setLineItems((prev) => [...prev, next]);
                setSelectedLineIdx(lineItems.length);
              }}
              className="flex items-center gap-1 rounded bg-blue-50 border border-blue-200 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
            >
              <Plus size={13} /> הוסף פריט
            </button>
          </div>
          <div className="overflow-auto flex-1" style={{ maxHeight: 260 }}>
            <table className="w-full border-collapse text-sm" dir="rtl" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: 60 }} />
                <col style={{ width: 72 }} />
                <col />
                <col style={{ width: 80 }} />
                <col style={{ width: 56 }} />
                <col style={{ width: 80 }} />
                <col style={{ width: 64 }} />
                <col style={{ width: 80 }} />
                <col style={{ width: 40 }} />
              </colgroup>
              <thead>
                <tr className="bg-blue-700 text-white text-xs">
                  {['קוד', 'מק"ט', 'תיאור', 'ערוץ הפצה', 'כמות', 'מחיר', '% הנחה', 'סה"כ', ''].map((h) => (
                    <th key={h} className="px-2 py-1.5 text-right font-medium border-l border-blue-600 last:border-l-0">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lineItems.length === 0 ? (
                  <tr><td colSpan={9} className="text-center text-gray-400 py-6 text-xs">לחץ "הוסף פריט" להוספת שורה</td></tr>
                ) : lineItems.map((item, idx) => {
                  const total = calcTotal(item);
                  const sel = idx === selectedLineIdx;
                  const rowBg = sel ? 'bg-blue-50' : idx % 2 === 1 ? 'bg-gray-50' : 'bg-white';
                  const cellCls = 'border border-gray-200 p-0';
                  const rowInp = (field: keyof LineItem, align: 'left' | 'right' = 'right') => (
                    <input
                      value={item[field]}
                      list={field === 'description' ? 'quote-catalog-list' : undefined}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (field === 'description') {
                          const match = CATALOG_ITEMS.find((c) => c.description === val);
                          if (match) {
                            setLineItems((prev) => prev.map((r, i) =>
                              i === idx ? { ...r, description: match.description, code: match.code, sku: match.sku, price: match.price } : r
                            ));
                          } else {
                            setLineItems((prev) => prev.map((r, i) => i === idx ? { ...r, description: val } : r));
                          }
                        } else {
                          setLineItems((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: val } : r));
                        }
                      }}
                      onClick={() => setSelectedLineIdx(idx)}
                      className="w-full h-7 border-none bg-transparent text-sm px-1.5 focus:outline-none"
                      style={{ textAlign: align }}
                    />
                  );
                  return (
                    <tr key={item.id} className={rowBg} onClick={() => setSelectedLineIdx(idx)}>
                      <td className={cellCls}>{rowInp('code')}</td>
                      <td className={cellCls}>{rowInp('sku')}</td>
                      <td className={cellCls}>{rowInp('description', 'right')}</td>
                      <td className={cellCls}>{rowInp('channel')}</td>
                      <td className={cellCls}>{rowInp('qty', 'left')}</td>
                      <td className={cellCls}>{rowInp('price', 'left')}</td>
                      <td className={cellCls}>{rowInp('discountPct', 'left')}</td>
                      <td className={cellCls + ' text-right px-1.5 text-sm font-medium'}>{total}</td>
                      <td className={cellCls + ' text-center'}>
                        <button type="button" onClick={(e) => { e.stopPropagation(); setLineItems((prev) => prev.filter((_, i) => i !== idx)); setSelectedLineIdx(null); }} className="text-red-400 hover:text-red-600 p-0.5">
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <datalist id="quote-catalog-list">
              {CATALOG_ITEMS.map((c) => <option key={c.code} value={c.description} />)}
            </datalist>
          </div>

          {/* ═══ TOTALS ROW ═══ */}
          <div className="flex items-start justify-between border-t border-gray-200 bg-gray-50 px-4 py-3 gap-6 flex-shrink-0">
            {/* Left: discount + VAT + totals */}
            <div className="grid grid-cols-3 gap-3 items-center text-sm" style={{ minWidth: 420 }}>
              <div className="flex items-center gap-2">
                <label className={lbl}>% הנחה</label>
                <input className={inp + ' w-20'} value={discountPercent} onChange={(e) => setDiscountPercent(e.target.value)} style={{ textAlign: 'left' }} />
              </div>
              <div className="flex items-center gap-2">
                <label className={lbl}>% מע"מ</label>
                <input className={inp + ' w-20'} value={vatPercent} onChange={(e) => setVatPercent(e.target.value)} style={{ textAlign: 'left' }} />
              </div>
              <div />
              <div className="flex items-center gap-2">
                <label className={lbl}>סכום ביניים</label>
                <span className="text-sm font-medium text-gray-800">{subtotal ? `₪ ${subtotal}` : '—'}</span>
              </div>
              <div className="flex items-center gap-2">
                <label className={lbl}>לאחר הנחה</label>
                <span className="text-sm font-medium text-gray-800">{afterDiscount ? `₪ ${afterDiscount}` : '—'}</span>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-blue-700 whitespace-nowrap">סה"כ לתשלום</label>
                <span className="text-sm font-bold text-blue-700">{cashTotal ? `₪ ${cashTotal}` : '—'}</span>
              </div>
            </div>

            {/* Right: payment terms compact */}
            <div className="flex items-center gap-3 flex-wrap text-sm">
              <div className="flex items-center gap-1.5">
                <label className={lbl}>תוקף</label>
                <input className={inp + ' w-14'} value={validityDays} onChange={(e) => {
                  const v = e.target.value;
                  setValidityDays(v);
                  const n = parseInt(v, 10);
                  if (v.trim() === '' || Number.isNaN(n) || n < 0) { setPaymentDueDate(''); return; }
                  setPaymentDueDate(dueDateAfterDaysFromQuote(date, n));
                }} style={{ textAlign: 'left' }} />
                <span className="text-xs text-gray-500">ימים</span>
              </div>
              <div className="flex items-center gap-1.5">
                <label className={lbl}>תנאי תשלום</label>
                <select
                  value={paymentTerms}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === ADD_PAYMENT_TERM) { setNewPaymentTermLabel(''); setAddPaymentTermOpen(true); return; }
                    setPaymentTerms(v);
                  }}
                  className={inp + ' w-36'}
                >
                  <option value="">—</option>
                  {paymentTerms && !paymentTermRows.some((r) => r.label === paymentTerms) ? (
                    <option value={paymentTerms}>{paymentTerms}</option>
                  ) : null}
                  {paymentTermRows.map((r) => (
                    <option key={r.id} value={r.label}>{r.label}</option>
                  ))}
                  <option value={ADD_PAYMENT_TERM}>הוסף תנאי תשלום…</option>
                </select>
              </div>
              <div className="flex items-center gap-1.5">
                <label className={lbl}>תשלומים</label>
                <input className={inp + ' w-14'} value={paymentsCount} onChange={(e) => setPaymentsCount(e.target.value)} style={{ textAlign: 'left' }} />
              </div>
              {installmentsCountParsed > 0 && (
                <span className="text-xs text-gray-500">
                  {paymentEqDisplay && `₪${paymentEqDisplay}`} = {paymentXDisplay && `₪${paymentXDisplay}`} × {paymentsCount}
                </span>
              )}
            </div>
          </div>

          {/* ═══ TABS SECTION ═══ */}
          <div className="border-t border-gray-200 flex-shrink-0">
            <div className="flex border-b border-gray-200 bg-gray-50 px-2">
              {(['הערות', 'מלל', 'פרטי תשלום', 'תחזית', 'שונות'] as const).map((x) => (
                <button
                  key={x}
                  onClick={() => setTab(x as typeof tab)}
                  className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
                    tab === x ? 'border-blue-600 text-blue-700 bg-white' : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >{x}</button>
              ))}
            </div>
            <div className="p-4" style={{ minHeight: 120 }}>

              {tab === 'הערות' ? (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={lbl + ' mb-1 block'}>הערות</label>
                    <textarea className="w-full h-20 rounded border border-gray-300 bg-white px-2 py-1.5 text-sm resize-none focus:border-blue-400 focus:outline-none" value={notes} onChange={(e) => setNotes(e.target.value)} />
                  </div>
                  <div>
                    <label className={lbl + ' mb-1 block'}>הערה פנימית</label>
                    <textarea className="w-full h-20 rounded border border-gray-300 bg-white px-2 py-1.5 text-sm resize-none focus:border-blue-400 focus:outline-none" value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} />
                  </div>
                </div>

              ) : tab === 'מלל' ? (
                <div className="rounded border border-gray-200 bg-white p-3 min-h-[80px] max-h-48 overflow-y-auto" dir="rtl">
                  {mergedHtml
                    ? <div dangerouslySetInnerHTML={{ __html: mergedHtml }} />
                    : <div className="text-gray-400 text-sm text-center py-6">לחץ "מיזוג" לבחירת תבנית ויצירת מסמך</div>
                  }
                </div>

              ) : tab === 'פרטי תשלום' ? (
                <div className="grid grid-cols-4 gap-3 text-sm">
                  <div>
                    <label className={lbl}>תוקף ההצעה (ימים)</label>
                    <input className={inp} value={validityDays} onChange={(e) => {
                      const v = e.target.value;
                      setValidityDays(v);
                      const n = parseInt(v, 10);
                      if (v.trim() === '' || Number.isNaN(n) || n < 0) { setPaymentDueDate(''); return; }
                      setPaymentDueDate(dueDateAfterDaysFromQuote(date, n));
                    }} style={{ textAlign: 'left' }} />
                  </div>
                  <div>
                    <label className={lbl}>תאריך תוקף</label>
                    <input type="date" className={inp} value={paymentValidityDate} onChange={(e) => setPaymentValidityDate(e.target.value)} />
                  </div>
                  <div>
                    <label className={lbl}>תאריך פירעון</label>
                    <input type="date" className={inp} value={paymentDueDate} onChange={(e) => setPaymentDueDate(e.target.value)} />
                  </div>
                  <div>
                    <label className={lbl}>מספר תשלומים</label>
                    <input className={inp} value={paymentsCount} onChange={(e) => setPaymentsCount(e.target.value)} style={{ textAlign: 'left' }} />
                  </div>
                  <div className="col-span-2">
                    <label className={lbl}>תנאי תשלום</label>
                    <div className="flex gap-1">
                      <input className={inp + ' w-16'} value={paymentTermsCode} onChange={(e) => setPaymentTermsCode(e.target.value)} style={{ textAlign: 'left' }} />
                      <select
                        value={paymentTerms}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === ADD_PAYMENT_TERM) { setNewPaymentTermLabel(''); setAddPaymentTermOpen(true); return; }
                          setPaymentTerms(v);
                        }}
                        className={inp}
                      >
                        <option value="">—</option>
                        {paymentTerms && !paymentTermRows.some((r) => r.label === paymentTerms) ? (
                          <option value={paymentTerms}>{paymentTerms}</option>
                        ) : null}
                        {paymentTermRows.map((r) => (
                          <option key={r.id} value={r.label}>{r.label}</option>
                        ))}
                        <option value={ADD_PAYMENT_TERM}>הוסף תנאי תשלום…</option>
                      </select>
                      <button type="button" onClick={() => { setNewPaymentTermLabel(''); setAddPaymentTermOpen(true); }} className="flex items-center justify-center h-8 w-8 rounded border border-gray-300 bg-gray-100 hover:bg-gray-200 flex-shrink-0" title="הוסף תנאי תשלום">
                        <Plus size={14} className="text-gray-500" />
                      </button>
                    </div>
                  </div>
                  {installmentsCountParsed > 0 && (
                    <div className="col-span-2 flex items-center gap-3 text-sm text-gray-600 pt-1">
                      <span>סה"כ: ₪{paymentEqDisplay}</span>
                      <span>=</span>
                      <span>₪{paymentXDisplay} × {paymentsCount} תשלומים</span>
                    </div>
                  )}
                </div>

              ) : tab === 'תחזית' ? (
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <label className={lbl}>אחוז סגירה</label>
                    <input type="number" step="0.01" className={inp} value={fClosePercent} onChange={(e) => setFClosePercent(e.target.value)} style={{ textAlign: 'left' }} />
                  </div>
                  <div>
                    <label className={lbl}>פונקציונאלי</label>
                    <input className={inp} value={fFunctional} onChange={(e) => setFFunctional(e.target.value)} />
                  </div>
                  <div>
                    <label className={lbl}>צבע סגירה</label>
                    <input type="date" className={inp} value={fCloseColor} onChange={(e) => setFCloseColor(e.target.value)} />
                  </div>
                  <div>
                    <label className={lbl}>ת. עדכון אחרון</label>
                    <input type="date" className={inp} value={fLastDate} onChange={(e) => setFLastDate(e.target.value)} />
                  </div>
                  <div>
                    <label className={lbl}>משתמש אחרון</label>
                    <input className={inp} value={fLastUser} onChange={(e) => setFLastUser(e.target.value)} />
                  </div>
                  <div>
                    <label className={lbl}>שעה</label>
                    <input className={inp} value={fLastTime} onChange={(e) => setFLastTime(e.target.value)} />
                  </div>
                </div>

              ) : tab === 'שונות' ? (
                <div className="flex items-center gap-3 text-sm">
                  <div>
                    <label className={lbl}>מקור הזמנה</label>
                    <input className={inp + ' w-40'} value={orderSource} onChange={(e) => setOrderSource(e.target.value)} />
                  </div>
                  <div>
                    <label className={lbl}>פקס</label>
                    <input className={inp + ' w-32'} value={fax} onChange={(e) => setFax(e.target.value)} />
                  </div>
                  <div>
                    <label className={lbl}>מגבלות</label>
                    <input className={inp + ' w-40'} value={limitations} onChange={(e) => setLimitations(e.target.value)} />
                  </div>
                  <div>
                    <label className={lbl}>מספר בהנה"ח</label>
                    <input className={inp + ' w-28'} value={accountingNo} onChange={(e) => setAccountingNo(e.target.value)} />
                  </div>
                </div>

              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ MODALS ═══ */}
      {pickerOpen && (
        <CustomerPickerModal
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onSelect={(c) => {
            setCustomer(c.name);
            setCustomerId(c.id);
            if (c.phone) setPhone(c.phone);
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
        <div className="fixed inset-0 bg-black/40 z-[9000] flex items-center justify-center">
          <div className="bg-white w-80 rounded-lg border border-gray-300 shadow-xl p-4" dir="rtl">
            <div className="font-semibold text-sm mb-3">הוסף תנאי תשלום</div>
            <input
              autoFocus
              className={inp + ' mb-3'}
              placeholder="תנאי תשלום חדש..."
              value={newPaymentTermLabel}
              onChange={(e) => setNewPaymentTermLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitNewPaymentTerm(); if (e.key === 'Escape') setAddPaymentTermOpen(false); }}
            />
            <div className="flex gap-2 justify-end">
              <button type="button" className="px-3 py-1.5 text-xs rounded border border-gray-300 bg-gray-100 hover:bg-gray-200" onClick={() => setAddPaymentTermOpen(false)}>ביטול</button>
              <button type="button" className="px-3 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700" onClick={submitNewPaymentTerm}>שמור</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
