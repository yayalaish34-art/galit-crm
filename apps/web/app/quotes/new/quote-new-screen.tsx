'use client';
import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Copy, RefreshCw, Printer, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, FileText, LogOut, X, Search as SearchIcon, Pencil, Send, Mail, MessageCircle, Save } from 'lucide-react';
import { CustomerPickerModal, CustomerRow } from './customer-picker-modal';
import { QuoteLookupModal, type QuoteLookupRow } from './quote-lookup-modal';
import { apiUrl, apiFetch, type ApiAuthUser } from '../../lib/api-base';
import {
  buildQuoteTemplateContext,
  mergeQuoteTemplateFull,
  type QuoteTemplateLineItem,
} from '../../lib/quote-template-merge';
import { SERVICE_CATEGORIES, flattenAllServices } from '../../lib/service-categories';

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
  h1 { font-size: 18pt; color: #1e40af; text-align: center; border: 2px solid #1e40af; padding: 6px; margin: 10px 0 16px; }
  .co-name { font-size: 20pt; font-weight: bold; color: #1e40af; margin-bottom: 2px; }
  .co-sub { font-size: 9pt; color: #666; margin-bottom: 12px; }
  table.header-tbl { border: 1px solid #ddd; border-radius: 4px; background: #f9f9f9; width: 100%; margin-bottom: 12px; }
  table.header-tbl td { font-size: 10pt; vertical-align: top; }
  table.items-tbl { width: 100%; border-collapse: collapse; font-size: 10pt; margin: 12px 0; }
  table.items-tbl th { background: #1e40af; color: #fff; padding: 5px 8px; border: 1px solid #1e40af; text-align: center; }
  table.items-tbl tr:nth-child(even) { background: #f3f7fd; }
  .totals-box { border: 1px solid #ccc; border-radius: 4px; display: inline-block; min-width: 280px; margin: 8px 0; }
  .totals-box .trow { padding: 4px 14px; border-bottom: 1px solid #e5e5e5; font-size: 10pt; }
  .totals-box .trow:last-child { border-bottom: none; }
  .totals-box .total-row { background: #1e40af; color: #fff; font-weight: bold; font-size: 12pt; }
  .section-box { border: 1px solid #ddd; border-radius: 4px; padding: 8px 12px; margin: 8px 0; background: #f9f9f9; font-size: 10pt; }
  .section-box h4 { font-size: 10.5pt; font-weight: bold; color: #1e40af; margin: 0 0 4px; border-bottom: 1px solid #ddd; padding-bottom: 3px; }
  .sig-line { border-top: 1px solid #888; padding-top: 4px; text-align: center; font-size: 9pt; color: #555; margin-top: 30px; }
  .footer-line { margin-top: 20px; padding-top: 6px; border-top: 2px solid #1e40af; font-size: 8pt; color: #777; text-align: center; }
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


/** Generates a local draft reference synchronously so the field is never blank.
 *  Format: Q-YYYYMM-NNNN  where NNNN is derived from the current time-of-day
 *  (minutes * 60 + seconds, mod 10000) to stay unique within a session.
 *  The API call in useEffect will override this with the true sequential number
 *  if the server is reachable; otherwise this value stays. */
function genLocalRef(): string {
  // Fallback only — the real number comes from /quotes/next-reference.
  // Show a placeholder until the server responds.
  return '…';
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

/** Convert a Blob to a base64 string (chunked to avoid call-stack limits on large files) */
async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/* ── Quote template → service category mapping (for filtered merge picker) ──
 * Matched by keyword instead of exact template name, since the exact wording
 * (dashes, phrasing) of templates stored in the DB can drift from any hardcoded
 * name list. Order matters: more specific keywords should come first. */
const TEMPLATE_CATEGORY_KEYWORDS: { keyword: string; category: string }[] = [
  { keyword: 'אסבסט', category: 'asbestos' },
  { keyword: 'ראדון', category: 'radon' },
  { keyword: 'קרינה', category: 'radiation' },
  { keyword: 'קרקע', category: 'soil' },
  { keyword: 'ריח', category: 'odor' },
  { keyword: 'אקוסטי', category: 'noise' },
  { keyword: 'קול הולם', category: 'noise' },
  { keyword: 'קול נישא', category: 'noise' },
  { keyword: 'רעש', category: 'noise' },
  { keyword: 'תרמי', category: 'thermal' },
  { keyword: 'אנרגטי', category: 'thermal' },
  { keyword: 'איכות אוויר', category: 'air' },
  { keyword: 'עובש', category: 'air' },
  { keyword: 'אוויר', category: 'air' },
  { keyword: 'מים', category: 'water' },
  { keyword: 'מי שתייה', category: 'water' },
  { keyword: 'בנייה ירוקה', category: 'green-building' },
  { keyword: 'גהות', category: 'occupational-health' },
  { keyword: 'תעסוקתי', category: 'occupational-health' },
  { keyword: 'חוות דעת סביבתית', category: 'environmental-opinion' },
  { keyword: 'הידרולוג', category: 'soil' },
  // תבניות גנריות/כלליות → קטגוריית 'general' (יוצגו רק כשיש פריט מקטגוריה כללית)
  { keyword: 'ייעוץ סביבתי', category: 'general' },
  { keyword: 'בדיקות סביבתיות', category: 'general' },
];

/** Find the service category id matching a quote template's name, by keyword */
function getTemplateCategory(name: string): string | null {
  for (const { keyword, category } of TEMPLATE_CATEGORY_KEYWORDS) {
    if (name.includes(keyword)) return category;
  }
  return null;
}

/* ── Default options for the תנאי תשלום dropdown ── */
const DEFAULT_PAYMENT_TERMS = [
  'מזומן בעת ביצוע ההזמנה',
  'תשלום מראש מלא',
  '50% מקדמה, 50% בסיום העבודה',
  'תשלום עם קבלת החשבונית',
  'שוטף + 30',
  'שוטף + 60',
  'שוטף + 90',
];

/** Find the SERVICE_CATEGORIES category id for a given SKU/id */
function getSkuCategory(sku: string): string | null {
  for (const cat of SERVICE_CATEGORIES) {
    for (const svc of cat.services) {
      if (svc.sku === sku || svc.id === sku) return cat.id;
      if (svc.subServices?.some((sub) => sub.sku === sku || sub.id === sku)) return cat.id;
    }
  }
  return null;
}

/* ── Category color map for tree picker ── */
const CAT_COLOR: Record<string, string> = {
  water: '#2563eb', odor: '#3b82f6', soil: '#16a34a', asbestos: '#f59e0b',
  air: '#2563eb', radon: '#ef4444', noise: '#f97316', radiation: '#2563eb',
  'green-building': '#15803d', thermal: '#dc2626', 'environmental-opinion': '#1d4ed8',
  general: '#64748b', 'occupational-health': '#2563eb',
};

/* ── ServiceTreePicker — hierarchical service selector for quote line items ── */
function ServiceTreePicker({
  value,
  onSelect,
}: {
  value: string;
  onSelect: (item: { description: string; sku: string; price: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [catId, setCatId] = useState<string | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);
  const closePanel = () => { setOpen(false); setCatId(null); setGroupId(null); };

  const activeCat = catId ? SERVICE_CATEGORIES.find((c) => c.id === catId) : null;
  const activeGroup = groupId && activeCat
    ? activeCat.services.find((s) => s.id === groupId && !!s.subServices)
    : null;

  const pickService = (description: string, sku: string, price: number | undefined) => {
    onSelect({ description, sku: sku ?? '', price: price != null ? String(price) : '' });
    closePanel();
  };

  return (
    <div className="relative w-full" dir="rtl">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-11 w-full flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 text-base outline-none focus:border-blue-400 transition-colors hover:border-blue-300"
      >
        <span className={value ? 'text-gray-800 truncate text-right text-sm' : 'text-gray-400 text-sm'}>
          {value || 'בחר שירות מהקטלוג...'}
        </span>
        <ChevronLeft
          size={14}
          className="flex-shrink-0 text-gray-400 transition-transform duration-200"
          style={{ transform: open ? 'rotate(90deg)' : 'rotate(-90deg)' }}
        />
      </button>

      {/* Side panel */}
      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-[9998] bg-black/20" onClick={closePanel} />
          <div
            className="fixed top-0 right-0 bottom-0 z-[9999] bg-white shadow-2xl border-l border-gray-200 overflow-hidden flex flex-col"
            style={{ width: 'clamp(280px, 28vw, 380px)', direction: 'rtl' }}
          >
            {/* Panel header */}
            <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2.5 border-b border-gray-100 bg-gray-50/80">
              {(catId || groupId) ? (
                <button
                  type="button"
                  onClick={() => groupId ? setGroupId(null) : setCatId(null)}
                  className="flex items-center gap-1 text-xs font-semibold rounded-lg px-2 py-1 transition-colors hover:bg-gray-200"
                  style={{ color: catId ? (CAT_COLOR[catId] ?? '#64748b') : '#64748b' }}
                >
                  <ChevronRight size={12} />
                  {groupId ? (activeGroup?.name ?? 'חזרה') : 'קטגוריות'}
                </button>
              ) : (
                <span className="text-xs font-bold text-gray-700">בחר שירות מהקטלוג</span>
              )}
              {catId && !groupId && (
                <span className="text-xs font-bold flex-1" style={{ color: CAT_COLOR[catId] ?? '#64748b' }}>
                  {activeCat?.name}
                </span>
              )}
              {groupId && (
                <span className="text-xs font-bold flex-1" style={{ color: catId ? (CAT_COLOR[catId] ?? '#64748b') : '#64748b' }}>
                  {activeCat?.name} › {activeGroup?.name}
                </span>
              )}
              {!catId && !groupId && <span className="flex-1" />}
              <button
                type="button"
                onClick={closePanel}
                className="flex items-center justify-center rounded-full hover:bg-gray-200 transition flex-shrink-0"
                style={{ width: 28, height: 28 }}
              >
                <X size={14} className="text-gray-500" />
              </button>
            </div>

          {/* Content */}
          <div className="overflow-y-auto flex-1 p-2">
            {!catId ? (
              /* Level 1: category grid */
              <div className="grid grid-cols-3 gap-1.5">
                {SERVICE_CATEGORIES.map((cat) => {
                  const color = CAT_COLOR[cat.id] ?? '#64748b';
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => { setCatId(cat.id); setGroupId(null); }}
                      className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl transition-all hover:scale-[1.03] hover:shadow-md active:scale-95 border border-transparent hover:border-opacity-30 text-center"
                      style={{ background: `${color}12`, borderColor: `${color}30` }}
                    >
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${color} 0%, ${color}bb 100%)` }}>
                        <span className="text-white text-[11px] font-black">{cat.name.slice(0, 2)}</span>
                      </div>
                      <span className="text-[11px] font-bold leading-tight" style={{ color }}>{cat.name}</span>
                    </button>
                  );
                })}
              </div>
            ) : !groupId ? (
              /* Level 2: services in category */
              <div className="flex flex-col gap-1">
                {activeCat!.services.map((svc) => {
                  const color = CAT_COLOR[catId] ?? '#64748b';
                  if (svc.subServices) {
                    return (
                      <button
                        key={svc.id}
                        type="button"
                        onClick={() => setGroupId(svc.id)}
                        className="w-full text-right px-3 py-2 rounded-xl flex items-center gap-2 transition-all hover:scale-[1.01] hover:shadow-sm font-semibold text-[13px]"
                        style={{ background: `${color}10`, color: '#1e293b', border: `1px solid ${color}25` }}
                      >
                        <span className="flex-shrink-0 w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-black text-white" style={{ background: color }}>
                          {svc.subServices.length}
                        </span>
                        <span className="flex-1">{svc.name}</span>
                        <ChevronLeft size={13} style={{ color, flexShrink: 0 }} />
                      </button>
                    );
                  }
                  return (
                    <button
                      key={svc.id}
                      type="button"
                      onClick={() => pickService(svc.name, svc.sku ?? svc.id, svc.price)}
                      className="w-full text-right px-3 py-2 rounded-xl flex items-center gap-2 transition-all hover:scale-[1.01] hover:shadow-sm text-[13px] font-medium"
                      style={{ background: `${color}08`, color: '#334155', border: `1px solid ${color}18` }}
                    >
                      <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                      <span className="flex-1">{svc.name}</span>
                      {svc.price != null && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: `${color}15`, color }}>
                          {svc.price === 0 ? 'כלול' : `₪${svc.price.toLocaleString('he-IL')}`}
                          {svc.unit ? ` ${svc.unit}` : ''}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              /* Level 3: sub-services */
              <div className="flex flex-col gap-1">
                {activeGroup!.subServices!.map((sub) => {
                  const color = CAT_COLOR[catId] ?? '#64748b';
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => pickService(sub.name, sub.sku ?? sub.id, sub.price)}
                      className="w-full text-right px-3 py-2 rounded-xl flex items-center gap-2 transition-all hover:scale-[1.01] hover:shadow-sm text-[12px] font-medium"
                      style={{ background: `${color}08`, color: '#334155', border: `1px solid ${color}18` }}
                    >
                      <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                      <span className="flex-1">{sub.name}</span>
                      {sub.price != null && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: `${color}15`, color }}>
                          {sub.price === 0 ? 'כלול' : `₪${sub.price.toLocaleString('he-IL')}`}
                          {sub.unit ? ` ${sub.unit}` : ''}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          </div>
        </>
      )}
    </div>
  );
}

export function QuoteNewScreen({
  embedded = true,
  prefillCustomer = null,
  prefillContactId = null,
  prefillServiceName = null,
  initialQuoteId = null,
  taskId = null,
  onExit,
  onQuoteSaved,
  onQuoteSent,
  onAttachmentSaved,
  existingAttachments,
  onDownloadAttachment,
}: {
  embedded?: boolean;
  prefillCustomer?: PrefillCustomer | null;
  /** When set, pre-select this contact after customer contacts are loaded */
  prefillContactId?: string | null;
  /** When set, automatically adds the selected service (from the פנייה stage) as the first line item */
  prefillServiceName?: string | null;
  /** When set (or `?quoteId=` in the URL), load quote and restore תנאי תשלום from the server */
  initialQuoteId?: string | null;
  /** When set, the merged quote DOCX is also stored as a permanent attachment on this task */
  taskId?: string | null;
  /** info.advanceToFollowUp=true → המשימה צריכה לעבור לשלב "פולואפ" (נקבע מעקב) */
  onExit?: (info?: { advanceToFollowUp?: boolean }) => void;
  /** Called after a successful save (POST or PATCH) — does not replace `onExit` for navigation/back. */
  onQuoteSaved?: (quoteId: string) => void;
  /** Called after a quote is successfully sent via email */
  onQuoteSent?: (quoteId: string) => void;
  /** Called after a merged DOCX is successfully saved as a task attachment */
  onAttachmentSaved?: () => void;
  /** DB-persisted task attachments to show in the files section (loaded from server) */
  existingAttachments?: Array<{ id: string; fileName: string; mimeType: string; createdAt: string }>;
  /** Called when user wants to download a persisted attachment */
  onDownloadAttachment?: (att: { id: string; fileName: string }) => void;
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
  // serverBacked=true → הקובץ הממוזג שנשמר בהצעה; הורדתו מושכת את הגרסה העדכנית מהשרת
  // (שמסנכרן מ-OneDrive) ולא את ה-blob שנוצר בזמן המיזוג לפני העריכה ב-Word.
  const [mergedFiles, setMergedFiles] = useState<{ name: string; url: string; serverBacked?: boolean }[]>([]);
  const [lastMergedPublicUrl, setLastMergedPublicUrl] = useState('');
  const [lastMergedAttachmentId, setLastMergedAttachmentId] = useState('');
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

  /* ── Pre-fill from customer card context ──
   * חשוב: המילוי המקדים רץ *פעם אחת לכל לקוח* בלבד — לא בכל re-render של ההורה.
   * ההורה (לוח המשימות) מעביר אובייקט prefillCustomer חדש בכל שמירה (onQuoteSaved),
   * ובלי השמירה הזו כל לחיצה על "שמור" הייתה דורסת טלפון/מייל/כתובת שהמשתמש ערך
   * ומחזירה אותם לערכים הישנים מכרטיס הלקוח. */
  const prefilledCustomerIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!prefillCustomer) return;
    const pid = prefillCustomer.id ?? '';
    if (prefilledCustomerIdRef.current === pid) return; // כבר מולא עבור לקוח זה — לא דורסים עריכות
    prefilledCustomerIdRef.current = pid;
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

  // מוכרז כאן (לפני אפקט המילוי-המקדים של הפריט) כי האפקט תלוי בו כדי לרוץ רק אחרי טעינת ההצעה.
  const [draftReady, setDraftReady] = useState<boolean>(false);

  /* ── Auto-add the service selected back in שלב הפנייה as the first line item ──
   * חשוב: רצים רק אחרי ש-draftReady=true (סיום טעינת ההצעה הקיימת). אחרת אפקט
   * הטעינה האסינכרוני היה דורס את הפריט שהוזרק (setLineItems מ-lineItemsJson) ומציג
   * "אין פריטים" למרות שנבחר שירות. */
  // עוקב אחרי שם השירות שכבר הוזרק, כדי שכשמשנים שירות בשלב "התאמת הפתרון" נחליף רק את
  // שורת השירות ולא נדרוס שורות שהמשתמש הוסיף/ערך ידנית.
  const prefilledServiceNameRef = useRef<string | null>(null);
  useEffect(() => {
    if (!prefillServiceName || !draftReady) return;
    if (prefilledServiceNameRef.current === prefillServiceName) return; // כבר הוזרק בדיוק השירות הזה
    const prevPrefill = prefilledServiceNameRef.current;
    prefilledServiceNameRef.current = prefillServiceName;
    const allSvcs = flattenAllServices();
    const svcMatch = allSvcs.find((s) => s.name === prefillServiceName);
    const svcSku = svcMatch?.sku ?? '';
    const svcPrice = svcMatch?.price != null ? String(svcMatch.price) : '';
    setLineItems((prev) => {
      // הצעה ריקה → מזריקים את השירות כפריט ראשון (התנהגות מקורית).
      if (prev.length === 0) return [{ ...newLineItem(), description: prefillServiceName, sku: svcSku, price: svcPrice }];
      // השירות שונה תוך כדי עבודה (היה prefill קודם): מחליפים רק את השורה של השירות הישן, שומרים כמות/מזהה.
      if (prevPrefill && prevPrefill !== prefillServiceName) {
        const idx = prev.findIndex((li) => li.description === prevPrefill);
        return idx !== -1 ? prev.map((li, i) => (i === idx ? { ...li, description: prefillServiceName, sku: svcSku, price: svcPrice } : li)) : prev;
      }
      // ריצה ראשונה במאונט אך כבר יש שורות (שוחזרו מהטיוטה): מחליפים רק אם זו שורה בודדת של
      // שירות מוכר *אחר* (auto-line ישן) — לא נוגעים בהצעה רב-שורתית או בתיאור ידני מותאם.
      if (prev.length === 1 && allSvcs.some((s) => s.name === prev[0].description) && prev[0].description !== prefillServiceName) {
        return [{ ...prev[0], description: prefillServiceName, sku: svcSku, price: svcPrice }];
      }
      return prev;
    });
  }, [prefillServiceName, draftReady]);

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

  /* ── When embedded in a task workspace (no explicit quote id given), look up any draft quote already linked to this task ── */
  const [taskLinkedQuoteId, setTaskLinkedQuoteId] = useState<string | null>(null);
  const [taskLookupChecked, setTaskLookupChecked] = useState<boolean>(!taskId);
  const [lastMergedDocPath, setLastMergedDocPath] = useState<string | null>(null);
  // OneDrive — עריכה ב-Word עם שמירה-חזרה אוטומטית: webUrl לפתיחה + דגל "פעיל".
  const [onedriveWebUrl, setOnedriveWebUrl] = useState<string | null>(null);
  const [onedriveActive, setOnedriveActive] = useState(false);
  const [onedriveBusy, setOnedriveBusy] = useState(false);
  // כתובת המייל של חשבון ה-Microsoft המחובר — מוצגת בהנחיה כשWord מבקש כניסה
  const [msAccountEmail, setMsAccountEmail] = useState<string | null>(null);
  useEffect(() => {
    const u = getSessionUser();
    if (!u) return;
    apiFetch(apiUrl(`/users/${u.id}`), { authUser: u })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.msEmail) setMsAccountEmail(data.msEmail); })
      .catch(() => undefined);
  }, []);
  // פאנל אבחון/גיבוי שנפתח אחרי "ערוך בוורד" — מציג את הקישורים בפועל ופתיחה בדפדפן.
  useEffect(() => {
    if (!taskId) return;
    const fromUrl =
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('quoteId')?.trim() || ''
        : '';
    if (initialQuoteId?.trim() || fromUrl) {
      setTaskLookupChecked(true);
      return;
    }
    const user = getSessionUser();
    if (!user) {
      setTaskLookupChecked(true);
      return;
    }
    let cancelled = false;
    apiFetch(apiUrl(`/quotes?linkedEntityId=${encodeURIComponent(taskId)}`), { authUser: user })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: unknown) => {
        if (cancelled) return;
        const list = Array.isArray(rows) ? rows : [];
        const first = list[0] as { id?: string } | undefined;
        if (first?.id) setTaskLinkedQuoteId(String(first.id));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setTaskLookupChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [taskId, initialQuoteId]);

  /* ── Load existing quote: id for PATCH + restore saved fields (payment tab, lines, customer, סימוכין) ── */
  useEffect(() => {
    if (taskId && !taskLookupChecked) return;
    const user = getSessionUser();
    if (!user) {
      setDraftReady(true);
      return;
    }
    const fromUrl =
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('quoteId')?.trim() || ''
        : '';
    const id = (initialQuoteId?.trim() || fromUrl || taskLinkedQuoteId || '').trim();
    if (!id) {
      setDraftReady(true);
      return;
    }
    let cancelled = false;
    apiFetch(apiUrl(`/quotes/${encodeURIComponent(id)}`), { authUser: user })
      .then((r) => (r.ok ? r.json() : null))
      .then((q: Record<string, unknown> | null) => {
        if (!q || cancelled) return;
        if (q.id) { setQuoteId(String(q.id)); setSavedOnce(true); }
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
        const custRel = q.customer as Record<string, unknown> | undefined;
        if (custRel) {
          if (typeof custRel.email === 'string') setCustomerEmail(custRel.email);
          // עדיפות לרשומת הלקוח החיה (מקור האמת) על פני ה-summary השמור בהצעה — שהוא
          // רק snapshot ישן. כך עריכת עיר/כתובת של הלקוח בשלב "פתיחת פנייה" מופיעה בהצעה.
          // (טלפון נשאר מ-phoneSummary — יש לו עריכה ידנית פר-הצעה + אפקט סנכרון איש קשר.)
          const relAddr = typeof custRel.address === 'string' ? custRel.address : '';
          const relCity = typeof custRel.city === 'string' ? custRel.city : '';
          setCustomerAddress(relAddr || (typeof q.addressSummary === 'string' ? q.addressSummary : ''));
          setCustomerCity(relCity || (typeof (q as any).citySummary === 'string' ? (q as any).citySummary : ''));
        } else {
          if (typeof q.addressSummary === 'string') setCustomerAddress(q.addressSummary);
          if (typeof (q as any).citySummary === 'string') setCustomerCity((q as any).citySummary);
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
        if (typeof q.lastMergedDocPath === 'string' && q.lastMergedDocPath) {
          setLastMergedDocPath(q.lastMergedDocPath);
        }
        // שחזור מצב OneDrive — אם להצעה כבר יש קובץ ניתן-לעריכה ב-Word.
        if (typeof q.onedriveWebUrl === 'string' && q.onedriveWebUrl) {
          setOnedriveWebUrl(q.onedriveWebUrl);
          setOnedriveActive(true);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setDraftReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [initialQuoteId, taskId, taskLookupChecked, taskLinkedQuoteId]);

  useEffect(() => {
    const mergeWithDefaults = (apiRows: Array<{ id: string; label: string }>) => {
      const merged = [...apiRows];
      for (const label of DEFAULT_PAYMENT_TERMS) {
        if (!merged.some((r) => r.label === label)) merged.push({ id: `default-${label}`, label });
      }
      return merged.sort((a, b) => a.label.localeCompare(b.label, 'he'));
    };
    const user = getSessionUser();
    if (!user) {
      setPaymentTermRows(mergeWithDefaults([]));
      return;
    }
    apiFetch(apiUrl('/payment-terms'), { authUser: user })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: unknown) => {
        const apiRows = Array.isArray(rows)
          ? rows
              .filter((x): x is { id: string; label: string } => typeof x === 'object' && x !== null && 'label' in x && typeof (x as { label: unknown }).label === 'string')
              .map((x) => ({ id: String((x as { id?: unknown }).id ?? ''), label: String((x as { label: string }).label) }))
              .filter((x) => x.label)
          : [];
        setPaymentTermRows(mergeWithDefaults(apiRows));
      })
      .catch(() => setPaymentTermRows(mergeWithDefaults([])));
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

  // ניסוח נושא+גוף המייל עם AI (OpenAI דרך השרת) — נקרא אוטומטית בשמירה.
  // לא נשלח קובץ: השרת מחלץ את תוכן ההצעה (פריטי שורה + טקסט המסמך הממוזג) ומנסח ממנו.
  // התוצאה נשמרת ב-aiDraft לפי quoteId, כך שחלון השליחה מציג אותה מוכנה (מתעדכן אוטומטית).
  async function generateEmailDraft(quoteId?: string | null, opts?: { force?: boolean; instruction?: string }) {
    const qid = quoteId || quoteIdRef.current;
    if (!qid) return;
    const instruction = opts?.instruction?.trim();
    const force = opts?.force || !!instruction; // רענון/בקשת-שינוי מפורשת גוברת על "עריכה ידנית"
    if (!force && emailDraftEditedRef.current) return; // מכבד עריכה ידנית קיימת
    if (draftInFlightRef.current) return; // ניסוח כבר רץ
    draftInFlightRef.current = true;
    setAiBusy(true);
    setStatusMsg(instruction ? '✨ מעדכן…' : '✨ מנסח מייל…');
    try {
      const r = await apiFetch(apiUrl('/ai-mail/quote-draft'), {
        method: 'POST',
        authUser: getSessionUser(),
        body: JSON.stringify({
          quoteId: qid, // השרת שולף סכום/תנאי תשלום/מספר + פריטים + טקסט המסמך
          customerName: customer || '',
          contactName: contact || '',
          serviceName: (reference || quoteNo || '').trim(),
          quoteNumber: (reference || quoteNo || '').trim(),
          // בקשת שינוי איטרטיבית: שולחים את הגרסה הנוכחית + ההנחיה
          instruction: instruction || undefined,
          previousSubject: instruction ? (emailForm.subject || '').trim() || undefined : undefined,
          previousBody: instruction ? (emailForm.body || '').trim() || undefined : undefined,
        }),
      });
      if (r.ok) {
        const d = await r.json();
        const subject = d.subject || '';
        const body = d.body || '';
        emailDraftEditedRef.current = false; // התוכן הטרי מה-AI הוא הבסיס
        setAiDraft({ quoteId: qid, subject, body });
        // עדכון חי של חלון השליחה אם הוא פתוח על אותה הצעה
        setEmailForm((p) => (p.quoteId === qid ? { ...p, subject: subject || p.subject, body: body || p.body } : p));
        if (d.facts) {
          const f = d.facts;
          const noteParts = [
            f.quoteNumber ? `מס' ${f.quoteNumber}` : '',
            f.total ? `סה"כ ${f.total}` : '',
            f.paymentTerms ? `תשלום: ${f.paymentTerms}` : '',
            f.validTo ? `תוקף עד ${f.validTo}` : '',
          ].filter(Boolean);
          setAiFactsNote(noteParts.length ? '✓ שובץ אוטומטית: ' + noteParts.join(' · ') : '');
        }
        setStatusMsg('✓ נוסח המייל מוכן');
        setTimeout(() => setStatusMsg(''), 4000);
      } else {
        const e = await r.json().catch(() => null);
        setStatusMsg(e?.message || 'יצירת ניסוח נכשלה');
        setTimeout(() => setStatusMsg(''), 4000);
      }
    } catch {
      setStatusMsg('שגיאה בפנייה ל-AI');
      setTimeout(() => setStatusMsg(''), 4000);
    } finally {
      draftInFlightRef.current = false;
      setAiBusy(false);
    }
  }

  // ניסוח הודעת וואטסאפ קצרה (channel: 'whatsapp') — בלי נושא, רק תוכן
  async function generateWaDraft(prevBody?: string) {
    setWaBusy(true);
    try {
      const r = await apiFetch(apiUrl('/ai-mail/quote-draft'), {
        method: 'POST',
        authUser: getSessionUser(),
        body: JSON.stringify({
          channel: 'whatsapp',
          quoteId: emailForm.quoteId || undefined,
          customerName: customer || '',
          contactName: contact || '',
          serviceName: emailForm.serviceName || reference || '',
          quoteNumber: (reference || quoteNo || '').trim(),
          location: aiForm.location.trim() || undefined,
          inspectionType: aiForm.inspectionType.trim() || undefined,
          instruction: waInstruction.trim() || undefined,
          previousBody: (prevBody || '').trim() || undefined,
        }),
      });
      if (r.ok) {
        const d = await r.json();
        setWaMsg(d.body || '');
        setWaInstruction('');
      } else {
        const e = await r.json().catch(() => null);
        setStatusMsg(e?.message || 'יצירת ניסוח נכשלה');
        setTimeout(() => setStatusMsg(''), 4000);
      }
    } catch {
      setStatusMsg('שגיאה בפנייה ל-AI');
      setTimeout(() => setStatusMsg(''), 4000);
    } finally {
      setWaBusy(false);
    }
  }

  // שליחת המייל מתוך חלון העריכה — Outlook/Graph עם נמענים, חתימה וקובץ מצורף
  async function sendQuoteEmail() {
    const f = emailForm;
    // אם נשאר טקסט בשדה ההקלדה שלא הומר ל-chip — נכלול אותו
    const allTo = [...f.toList, ...(f.toInput.includes('@') ? [f.toInput.trim()] : [])];
    const allCc = [...f.ccList, ...(f.ccInput.includes('@') ? [f.ccInput.trim()] : [])];
    const to = allTo[0]?.trim() || '';
    if (!to) { setStatusMsg('חסר נמען'); return; }
    setEmailSending(true);
    // במקום לצרף קובץ — מצרפים כפתור "צפייה בהצעת מחיר" שמפנה לעמוד /sign.
    // יוצרים את הקישור (או משתמשים בקיים אם כבר נוצר ב"שלח לחתימה").
    setStatusMsg('מכין קישור לצפייה…');
    let viewUrl = signLink;
    if (!viewUrl) {
      const res = await createSignLink();
      viewUrl = res.url;
      if (!viewUrl) { setEmailSending(false); setStatusMsg(res.error || 'יצירת קישור הצפייה נכשלה'); return; }
    }
    setStatusMsg('שולח…');
    // נמען ראשי = הראשון; שאר הנמענים ב-toList + ccList הופכים ל-CC
    const ccList = Array.from(new Set([...allTo.slice(1), ...allCc])).filter((e) => e && e !== to);
    let serverSent = false;
    let serverErr = '';
    try {
      const r = await apiFetch(apiUrl(`/quotes/${f.quoteId}/send-email`), {
        method: 'POST',
        authUser: getSessionUser(),
        body: JSON.stringify({
          email: to,
          cc: ccList,
          subject: f.subject,
          messageBody: f.body,
          includeSignature: f.includeSignature,
          signatureId: f.signatureId || undefined,
          // קישור הצפייה/חתימה במקום קובץ מצורף.
          viewUrl,
          customerName: customer || '',
        }),
      });
      if (r.ok) serverSent = true;
      else { try { const e = await r.json(); serverErr = e?.message || ''; } catch { /* ignore */ } }
    } catch { /* fall through */ }
    setEmailSending(false);
    if (serverSent) {
      setEmailModalOpen(false);
      setStatusMsg(`מייל נשלח ל-${to}`);
      setTimeout(() => setStatusMsg(''), 5000);
    } else {
      // נפילה-חזרה: פתיחת חלון כתיבה ב-Outlook Web (כשהשרת לא הצליח)
      const subject = f.subject;
      const body = `${f.body}${viewUrl ? '\n\nצפייה בהצעת מחיר:\n' + viewUrl : ''}`;
      const ccParam = ccList.length ? `&cc=${encodeURIComponent(ccList.join(','))}` : '';
      const owaUrl = `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(to)}${ccParam}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      window.open(owaUrl, '_blank');
      setEmailModalOpen(false);
      setStatusMsg(serverErr ? `נפתח חלון מייל — ${serverErr}` : `נפתח חלון מייל ל-${to}`);
      setTimeout(() => setStatusMsg(''), 7000);
    }
  }

  // "שלח במייל" הפשוט — מצרף את ההצעה כ-PDF + את הפרופיל+רישיונות כ-PDF, בלי כפתורים ובלי חתימה.
  async function sendQuoteEmailPlain() {
    const f = emailForm;
    const allTo = [...f.toList, ...(f.toInput.includes('@') ? [f.toInput.trim()] : [])];
    const allCc = [...f.ccList, ...(f.ccInput.includes('@') ? [f.ccInput.trim()] : [])];
    const to = allTo[0]?.trim() || '';
    if (!to) { setStatusMsg('חסר נמען'); return; }
    setEmailSending(true);
    setStatusMsg('שולח…');
    const ccList = Array.from(new Set([...allTo.slice(1), ...allCc])).filter((e) => e && e !== to);
    const attIds = [f.attId, ...emailExtraAttIds].filter(Boolean);
    let serverSent = false; let serverErr = '';
    try {
      const r = await apiFetch(apiUrl(`/quotes/${f.quoteId}/send-email`), {
        method: 'POST',
        authUser: getSessionUser(),
        body: JSON.stringify({
          email: to,
          cc: ccList,
          subject: f.subject,
          messageBody: f.body,
          includeSignature: f.includeSignature,
          signatureId: f.signatureId || undefined,
          // בלי viewUrl → ההצעה מצורפת כקובץ (PDF). attachProfilePdf → הפרופיל+רישיונות מצורף אף הוא.
          attachmentIds: attIds.length ? attIds : undefined,
          attachProfilePdf: true,
          preferOnedrive: onedriveActive,
          customerName: customer || '',
        }),
      });
      if (r.ok) serverSent = true;
      else { try { const e = await r.json(); serverErr = e?.message || ''; } catch { /* ignore */ } }
    } catch { /* network */ }
    setEmailSending(false);
    if (serverSent) {
      setEmailModalOpen(false);
      setStatusMsg(`מייל נשלח ל-${to} (הצעה + פרופיל מצורפים)`);
      setTimeout(() => setStatusMsg(''), 5000);
    } else {
      setStatusMsg(serverErr ? `שליחת המייל נכשלה: ${serverErr}` : 'שליחת המייל נכשלה');
      setTimeout(() => setStatusMsg(''), 7000);
    }
  }

  // "שלח בווצאפ" הפשוט — פותח וואטסאפ עם קישור להורדת ה-PDF של ההצעה (בלי לשנות סטטוס חתימה).
  async function sendQuoteWhatsAppPlain() {
    if (!emailForm.quoteId) { setStatusMsg('יש לשמור את ההצעה לפני שליחה'); return; }
    setEmailSending(true);
    setStatusMsg('מכין קובץ PDF…');
    const { token, error } = await createSignLink({ markRequested: false });
    setEmailSending(false);
    if (!token) { setStatusMsg(error || 'הכנת קובץ ה-PDF נכשלה'); return; }
    const pdfUrl = apiUrl(`/public/sign/${encodeURIComponent(token)}/pdf`);
    const ref = (reference || quoteNo || '').trim();
    const msg = `שלום${contact ? ' ' + contact : ''}, מצורפת הצעת המחיר${ref ? ' ' + ref : ''} מ"גלית – החברה לאיכות הסביבה".\nלצפייה והורדה:\n${pdfUrl}`;
    const wa = signPhone ? (signPhone.startsWith('0') ? `972${signPhone.slice(1)}` : signPhone) : '';
    window.open(`https://wa.me/${wa}?text=${encodeURIComponent(msg)}`, '_blank');
    setEmailModalOpen(false);
    setStatusMsg('נפתח וואטסאפ עם קישור להורדת ההצעה');
    setTimeout(() => setStatusMsg(''), 5000);
  }

  // "שלח בווצאפ עם חתימה" — פותח וואטסאפ עם קישור לעמוד החתימה (/sign) שבו הלקוח חותם באצבע.
  async function sendQuoteWhatsAppSign() {
    if (!emailForm.quoteId) { setStatusMsg('יש לשמור את ההצעה לפני שליחה'); return; }
    setSignBusy(true);
    setStatusMsg('מכין קישור לחתימה…');
    const { url, error } = await createSignLink();
    setSignBusy(false);
    if (!url) { setStatusMsg(error || 'יצירת קישור החתימה נכשלה'); return; }
    const ref = (reference || quoteNo || '').trim();
    const msg = `שלום${contact ? ' ' + contact : ''}, הצעת המחיר${ref ? ' ' + ref : ''} מ"גלית – החברה לאיכות הסביבה" מוכנה לחתימה.\nלצפייה וחתימה מהנייד:\n${url}`;
    const wa = signPhone ? (signPhone.startsWith('0') ? `972${signPhone.slice(1)}` : signPhone) : '';
    window.open(`https://wa.me/${wa}?text=${encodeURIComponent(msg)}`, '_blank');
    setStatusMsg('נפתח וואטסאפ עם קישור לחתימה');
    setTimeout(() => setStatusMsg(''), 5000);
  }

  // ליבה: יוצר בקשת חתימה ומחזיר את קישור ה-/sign (גם מעדכן state). מחזיר '' בכישלון.
  // מחזיר { url, error } כדי שהקורא יציג את הסיבה האמיתית לכשל (PDF/לקוח/מיזוג) ולא הודעה כללית.
  async function createSignLink(opts?: { markRequested?: boolean }): Promise<{ url: string; token: string; error: string }> {
    if (!emailForm.quoteId) return { url: '', token: '', error: 'יש לשמור את ההצעה לפני יצירת קישור הצפייה' };
    try {
      const r = await apiFetch(apiUrl(`/quotes/${emailForm.quoteId}/request-signature`), {
        method: 'POST',
        authUser: getSessionUser(),
        // markRequested=false → הכנת PDF להורדה בלי לשנות את סטטוס החתימה (למשל "שלח בווצאפ" הפשוט)
        body: JSON.stringify({ markRequested: opts?.markRequested ?? true }),
      });
      if (!r.ok) {
        let msg = 'יצירת קישור החתימה נכשלה';
        try { const e = await r.json(); if (e?.message) msg = Array.isArray(e.message) ? e.message[0] : e.message; } catch { /* ignore */ }
        return { url: '', token: '', error: msg };
      }
      const d = await r.json();
      const url = `${window.location.origin}/sign/${d.token}`;
      // מציגים את תיבת "קישור לחתימה" רק במצב חתימה אמיתי (לא בהכנת PDF להורדה).
      if (opts?.markRequested !== false) setSignLink(url);
      setSignPhone(String(d.customerPhone || '').replace(/\D/g, ''));
      return { url, token: String(d.token || ''), error: '' };
    } catch {
      return { url: '', token: '', error: 'יצירת קישור החתימה נכשלה — בעיית תקשורת עם השרת' };
    }
  }

  // מייצר קישור חתימה ציבורי להצעה — הלקוח פותח אותו, רואה את ההצעה וחותם באצבע
  async function requestSignatureLink() {
    if (!emailForm.quoteId) { setStatusMsg('יש לשמור את ההצעה לפני שליחה לחתימה'); return; }
    setSignBusy(true); setSignLink(''); setSignCopied(false); setStatusMsg('מכין קישור לחתימה…');
    try {
      const { url, error } = await createSignLink();
      setStatusMsg(url ? '' : (error || 'יצירת קישור החתימה נכשלה'));
    } finally {
      setSignBusy(false);
    }
  }

  // פותח את הקישור בוואטסאפ של הלקוח (אם יש מספר), אחרת בורר נמען
  function shareSignViaWhatsApp() {
    const msg = `שלום, הצעת המחיר מ"גלית – החברה לאיכות הסביבה" מוכנה לחתימה.\nלצפייה וחתימה מהנייד:\n${signLink}`;
    const wa = signPhone ? (signPhone.startsWith('0') ? `972${signPhone.slice(1)}` : signPhone) : '';
    window.open(`https://wa.me/${wa}?text=${encodeURIComponent(msg)}`, '_blank');
  }

  async function copySignLink() {
    try { await navigator.clipboard.writeText(signLink); setSignCopied(true); setTimeout(() => setSignCopied(false), 2000); } catch { /* ignore */ }
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
  const [contactSaveState, setContactSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [isBusy, setIsBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  // True once the quote has been saved (or loaded as an existing saved quote) —
  // enables (and greens) the "מיזוג" and "שלח במייל" buttons; before the first
  // save they stay disabled, so a quote can't be merged/emailed until it's saved.
  const [savedOnce, setSavedOnce] = useState(false);

  // ── חלון עריכת מייל לפני שליחה ──
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [emailForm, setEmailForm] = useState({
    toList: [] as string[],
    toInput: '',
    ccList: [] as string[],
    ccInput: '',
    subject: '',
    body: '',
    includeSignature: true,
    signatureId: '',
    quoteId: '',
    attId: '',
    docLink: '',
    serviceName: '',
  });
  const [emailHasSignature, setEmailHasSignature] = useState(false);
  const [emailSigImage, setEmailSigImage] = useState<string | null>(null); // data-URL לתצוגת חתימה ב-preview
  // רשימת חתימות העובד (תמונה + כותרת) — לבחירה בעת השליחה
  const [emailSignatures, setEmailSignatures] = useState<{ id: string; title: string; dataBase64: string; imageType?: string }[]>([]);
  // רשימת קבצי ההצעה (DOCX) הזמינים לצירוף — לבחירה/החלפה בחלון השליחה
  const [emailAttachments, setEmailAttachments] = useState<{ id: string; fileName: string; createdAt?: string }[]>([]);
  // קבצים *נוספים* לצירוף למייל (מעבר לקובץ הראשי) — כל DOCX יומר ל-PDF בצד השרת בזמן השליחה
  const [emailExtraAttIds, setEmailExtraAttIds] = useState<string[]>([]);
  const [emailAttBusy, setEmailAttBusy] = useState(false);
  const [emailHasDraft, setEmailHasDraft] = useState(false); // האם כבר נוצר/קיים ניסוח להצגה ב-preview
  const [editingField, setEditingField] = useState<null | 'subject' | 'body'>(null); // עריכה inline
  // ── שליחה לחתימה דיגיטלית: קישור ציבורי שהלקוח פותח כדי לחתום על ההצעה ──
  const [signBusy, setSignBusy] = useState(false);
  const [signLink, setSignLink] = useState('');
  const [signPhone, setSignPhone] = useState('');
  const [signCopied, setSignCopied] = useState(false);
  // AI ניסוח
  const [aiBusy, setAiBusy] = useState(false);
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  // שאלון פרטי המקרה ל-AI (נשאר עבור ניסוח וואטסאפ; שאלון המייל הוסר — הניסוח אוטומטי בשמירה)
  const [aiForm, setAiForm] = useState({ location: '', inspectionType: '', duration: '', extraDetails: '' });
  const [aiFactsNote, setAiFactsNote] = useState(''); // הצגת הנתונים שהשרת שיבץ
  // ניסוח המייל נוצר אוטומטית בשמירה ונשמר כאן (לפי quoteId), כך שחלון השליחה מציג אותו מוכן.
  const [aiDraft, setAiDraft] = useState<{ quoteId: string; subject: string; body: string } | null>(null);
  // האם המשתמש ערך ידנית את נושא/גוף המייל — אם כן, שמירה חוזרת לא תדרוס את העריכה.
  const emailDraftEditedRef = useRef(false);
  // מונע קריאות AI מקבילות (closure של aiBusy מתיישן).
  const draftInFlightRef = useRef(false);

  // ── וואטסאפ: ניסוח AI קצר (בלי נושא) → שליחה ב-wa.me למספר הלקוח ──
  const [waOpen, setWaOpen] = useState(false);
  const [waMsg, setWaMsg] = useState('');
  const [waBusy, setWaBusy] = useState(false);
  const [waInstruction, setWaInstruction] = useState('');

  // הוספת נמען לרשימה (chip) — מ-Enter/פסיק. מפצל גם הדבקה מרובה.
  const addRecipients = (raw: string, field: 'toList' | 'ccList') => {
    const parts = raw.split(/[,;\s]+/).map((s) => s.trim()).filter((s) => s.includes('@'));
    if (!parts.length) return;
    setEmailForm((p) => {
      const existing = new Set(p[field]);
      parts.forEach((e) => existing.add(e));
      return { ...p, [field]: Array.from(existing), [field === 'toList' ? 'toInput' : 'ccInput']: '' };
    });
  };
  const removeRecipient = (email: string, field: 'toList' | 'ccList') => {
    setEmailForm((p) => ({ ...p, [field]: p[field].filter((e) => e !== email) }));
  };

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

  /* מזהה איש-הקשר שכבר שוקף לשדות (טלפון/אימייל/שם). משמש כדי למלא את הפרטים
   * *רק* כשמחליפים איש קשר בפועל — ולא בכל פעם ש-quoteContactRows מתרענן ברקע
   * (למשל אחרי סנכרון/PATCH), מה שהיה דורס טלפון שהמשתמש בדיוק ערך ו"מחזיר" אותו
   * למספר השמור. */
  const appliedContactIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (quoteContactRows.length === 0) {
      // אין רשומות אנשי קשר — למשל לקוח פרטי, שבו האדם עצמו הוא איש הקשר.
      // במקום להשאיר ריק ("אין אנשי קשר"), ממלאים אוטומטית את שם הלקוח (אם השדה ריק).
      if (!customerContactId) setContact((prev) => (prev.trim() ? prev : (customer || '').trim()));
      appliedContactIdRef.current = null;
      return;
    }
    // אין שינוי באיש הקשר הנבחר — לא דורסים את מה שהמשתמש ערך ידנית.
    if (customerContactId === appliedContactIdRef.current) return;
    const row = quoteContactRows.find((r) => r.id === customerContactId);
    if (row) {
      appliedContactIdRef.current = customerContactId;
      setContact(row.fullName);
      if (row.email) setCustomerEmail(row.email);
      if (row.phone || row.mobile) setPhone(row.phone || row.mobile);
    } else if (!customerContactId) {
      appliedContactIdRef.current = null;
      setContact('');
    }
  }, [customerContactId, quoteContactRows, customer]);

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

  /* ── Build the full quote payload from current form state — shared by doSave() and the silent autosave ── */
  function buildQuotePayload(): Record<string, unknown> {
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
      citySummary: customerCity || null,
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

    if (taskId) payload.linkedEntityId = taskId;

    // Strip undefined values so the backend doesn't receive them
    for (const k of Object.keys(payload)) {
      if (payload[k] === undefined) delete payload[k];
    }
    return payload;
  }

  /* ── Silent autosave: persists the current draft (line items, generated docs link, etc.) without alerts/validation ── */
  const autosaveBusyRef = useRef(false);
  async function silentSaveDraft(): Promise<string | null> {
    if (!customerId || autosaveBusyRef.current) return null;
    const user = getSessionUser();
    if (!user) return null;
    autosaveBusyRef.current = true;
    try {
      const payload = buildQuotePayload();
      const currentId = quoteIdRef.current;
      const url = currentId ? apiUrl(`/quotes/${currentId}`) : apiUrl('/quotes');
      const method = currentId ? 'PATCH' : 'POST';
      const r = await apiFetch(url, { method, body: JSON.stringify(payload), authUser: user });
      if (!r.ok) return null;
      const saved = await r.json();
      const savedId = saved?.id ? String(saved.id) : null;
      if (!currentId && savedId) {
        setQuoteId(savedId);
        if (saved.quoteNumber != null) setQuoteNo(String(saved.quoteNumber));
        // Standalone mode: reflect the new id in the URL so a refresh restores this draft
        if (!taskId && typeof window !== 'undefined') {
          const params = new URLSearchParams(window.location.search);
          if (!params.get('quoteId')) {
            params.set('quoteId', savedId);
            window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
          }
        }
      }
      return savedId || currentId;
    } catch {
      return null;
    } finally {
      autosaveBusyRef.current = false;
    }
  }

  /* ── Standalone mode: download the last generated DOCX stored on the quote record ── */
  async function handleDownloadMergedDoc(preferredName?: string) {
    if (!quoteId) return;
    const user = getSessionUser();
    if (!user) return;
    try {
      const r = await apiFetch(apiUrl(`/quotes/${quoteId}/merged-doc`), { authUser: user });
      if (!r.ok) return;
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const fallbackName = preferredName || (lastMergedDocPath ? lastMergedDocPath.split(/[\\/]/).pop() || 'quote.docx' : 'quote.docx');
      a.href = url;
      a.download = fallbackName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      /* silent */
    }
  }

  /* ── עריכה ב-Word דרך OneDrive (שמירה-חזרה אוטומטית) ──
   * מעלה את המסמך הממוזג ל-OneDrive (פעם אחת) ופותח אותו ב-Word *של המחשב* (לא Word Online).
   * חשוב: Word Online לא שומר נאמנות לתמונות צפות/מעוגנות (לוגו, חתימה) ודוחף אותן לראש העמוד —
   * לכן פותחים ב-Word דסקטופ דרך פרוטוקול ms-word, ששומר על הפריסה במדויק ועדיין שומר לענן. */
  function buildDesktopWordUrl(fileUrl: string): string {
    // ms-word:ofe|u|<URL> = "Open For Edit". חייבים את הנתיב הישיר לקובץ (webDavUrl),
    // לא את דף התצוגה של SharePoint (_layouts/15/Doc.aspx?sourcedoc=...) — שם זהות הקובץ
    // נמצאת ב-query, וחיתוך ה-query שובר אותה ("Office אינו מזהה את הפקודה"). לכן לא חותכים כאן.
    // הקישור הפנימי חייב להיות מקודד (רווחים/עברית) אחרת Word לא מזהה את הפקודה.
    // אם כבר מקודד (אין רווחים/תווים לא-ASCII) — לא מקודדים שוב כדי לא לשבור %20 קיימים.
    const needsEncoding = / |[^\x00-\x7f]/.test(fileUrl);
    const inner = needsEncoding ? encodeURI(fileUrl) : fileUrl;
    return `ms-word:ofe|u|${inner}`;
  }
  function openInDesktopWord(webUrl: string) {
    const url = buildDesktopWordUrl(webUrl);
    // חשוב: לא משתמשים ב-<a href>/anchor — דפדפנים מודרניים (Chromium עדכני) מקודדים את
    // תווי ה-"|" של הפקודה (ms-word:ofe|u|) ל-%7C, ואז Word לא מזהה את הפקודה.
    // הפעלה דרך iframe נסתר שומרת את ה-"|" כפי שהוא, ולא מנווטת/סוגרת את הדף הנוכחי.
    try {
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      document.body.appendChild(iframe);
      const win = iframe.contentWindow;
      if (win) win.location.href = url;
      else window.location.href = url;
      setTimeout(() => iframe.remove(), 2000);
    } catch {
      // נפילה אחרונה — הפעלה ישירה (עדיין שומרת את ה-| בלי קידוד anchor).
      window.location.href = url;
    }
  }
  async function handleEditInWord() {
    const id = quoteIdRef.current;
    if (!id) { setStatusMsg('שגיאה: יש לשמור ולמזג את ההצעה לפני עריכה ב-Word'); return; }
    const user = getSessionUser();
    if (!user) return;
    setOnedriveBusy(true);
    setStatusMsg('פותח ב-Word…');
    try {
      const r = await apiFetch(apiUrl(`/quotes/${id}/onedrive-edit`), { authUser: user, method: 'POST' });
      if (!r.ok) {
        let msg = 'פתיחה ב-Word נכשלה — ודא שחשבון ה-Outlook מחובר';
        try { const e = await r.json(); msg = e?.message || msg; } catch { /* ignore */ }
        setStatusMsg(`שגיאה: ${msg}`);
        return;
      }
      const data = await r.json();
      if (data?.webUrl || data?.webDavUrl) {
        // webUrl = קישור תצוגה בדפדפן (fallback בחלון השליחה). webDavUrl = נתיב ישיר לפתיחה ב-Word דסקטופ.
        setOnedriveWebUrl(data.webUrl || data.webDavUrl);
        setOnedriveActive(true);
        const desktopTarget = data.webDavUrl || data.webUrl;
        const cmd = buildDesktopWordUrl(desktopTarget);
        // ── אבחון: מה בדיוק נשלח ל-Word (לראות אם webDavUrl חסר / זו כתובת Doc.aspx / יש תווים בעייתיים) ──
        // eslint-disable-next-line no-console
        console.log('[ערוך בוורד] webDavUrl=', data.webDavUrl, ' | webUrl=', data.webUrl, ' | ms-word=', cmd);
        // פתיחה ב-Word דסקטופ (נאמנות מלאה לתמונות/פריסה) — העריכה נשמרת ומסתנכרנת אוטומטית.
        openInDesktopWord(desktopTarget);
        setStatusMsg(msAccountEmail
          ? `נפתח ב-Word — אם מוצגת בקשת כניסה למיקרוסופט, הזן: ${msAccountEmail}`
          : 'נפתח ב-Word — העריכה נשמרת ומסתנכרנת אוטומטית');
        setTimeout(() => setStatusMsg(''), 12000);
      } else {
        setStatusMsg('שגיאה: לא התקבלה כתובת פתיחה');
      }
    } catch {
      setStatusMsg('שגיאה: פתיחה ב-Word נכשלה');
    } finally {
      setOnedriveBusy(false);
    }
  }

  /* ── סנכרון הגרסה הערוכה מ-Word (OneDrive) חזרה ל-DB ──
   * Word שומר אוטומטית ל-OneDrive; כאן מושכים את הגרסה העדכנית ושומרים אותה ב-DB,
   * כך שהמערכת לא תחזיק רק את המסמך הממוזג הראשוני. רץ אוטומטית כשחוזרים מ-Word ל-CRM. */
  const syncingRef = useRef(false);
  async function syncFromWord(opts?: { silent?: boolean }): Promise<boolean> {
    const id = quoteIdRef.current;
    if (!id || !onedriveActive || syncingRef.current) return false;
    const user = getSessionUser();
    if (!user) return false;
    syncingRef.current = true;
    if (!opts?.silent) setStatusMsg('מסנכרן את הגרסה מ-Word…');
    try {
      const r = await apiFetch(apiUrl(`/quotes/${id}/onedrive-sync`), { authUser: user, method: 'POST' });
      if (r.ok) {
        const d = await r.json().catch(() => null);
        if (d?.synced) {
          setStatusMsg('הגרסה מ-Word נשמרה במערכת ✓');
          setTimeout(() => setStatusMsg(''), 5000);
          return true;
        }
      }
      if (!opts?.silent) setStatusMsg('');
      return false;
    } catch {
      if (!opts?.silent) setStatusMsg('');
      return false;
    } finally {
      syncingRef.current = false;
    }
  }

  /* כשחוזרים מ-Word אל לשונית ה-CRM (הלשונית הופכת לגלויה) — מסנכרנים אוטומטית את הגרסה הערוכה ל-DB. */
  useEffect(() => {
    if (!onedriveActive) return;
    const onVisible = () => { if (document.visibilityState === 'visible') void syncFromWord({ silent: true }); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onedriveActive]);

  /* ── Debounced autosave of the draft quote — keeps line items / DOCX link alive across page refreshes ── */
  useEffect(() => {
    if (!draftReady || !customerId) return;
    const t = setTimeout(() => { void silentSaveDraft(); }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    draftReady, customerId, lineItems, customer, phone, paymentTerms, validityDays,
    paymentValidityDate, paymentDueDate, notes, internalNotes, discountPercent, vatPercent,
    paymentsCount, follow, customerContactId, salesRep, contact, customerAddress, customerCity,
    customerEmail, fax, accountingNo, companyNo, priceList, orderSource, rate, fFunctional,
    fClosePercent, status, quoteTemplateId, date,
  ]);

  /* ── Save (POST new / PATCH existing) — returns saved id or null on failure ── */
  /* ── Push edited טלפון/אימייל from "פרטי לקוח" back to the DB ──
     Without this, edits made here only live on the quote's phoneSummary and never
     reach the customer's contact record — so the customer's phone/email stayed stale. */
  async function syncContactInfoToDb(user: ApiAuthUser): Promise<void> {
    if (!customerId) return;
    const phoneVal = phone.trim();
    const emailVal = customerEmail.trim();
    const row = customerContactId.trim()
      ? quoteContactRows.find((r) => r.id === customerContactId)
      : undefined;
    if (row) {
      // A contact is selected — update that CustomerContact record.
      const patch: Record<string, string> = {};
      const shownPhone = (row.phone || row.mobile).trim();
      if (phoneVal !== shownPhone) {
        // Write back into whichever field the shown value originated from.
        if (row.phone.trim() || !row.mobile.trim()) patch.phone = phoneVal;
        else patch.mobile = phoneVal;
      }
      if (emailVal.toLowerCase() !== row.email.trim().toLowerCase()) patch.email = emailVal;
      if (Object.keys(patch).length === 0) return;
      const res = await apiFetch(
        apiUrl(`/customers/${encodeURIComponent(customerId)}/contacts/${encodeURIComponent(customerContactId)}`),
        { method: 'PATCH', body: JSON.stringify(patch), authUser: user },
      );
      if (!res.ok) throw new Error(`contact PATCH failed (${res.status})`);
      // Keep local rows in sync so the next save doesn't re-PATCH the same values.
      setQuoteContactRows((prev) =>
        prev.map((r) => (r.id === customerContactId ? { ...r, ...patch } : r)),
      );
    } else if (quoteContactRows.length === 0) {
      // No contacts on this customer — update the customer record itself.
      const patch: Record<string, string> = {};
      if (phoneVal) patch.phone = phoneVal;
      if (emailVal) patch.email = emailVal;
      if (Object.keys(patch).length === 0) return;
      const res = await apiFetch(apiUrl(`/customers/${encodeURIComponent(customerId)}`), {
        method: 'PATCH',
        body: JSON.stringify(patch),
        authUser: user,
      });
      if (!res.ok) throw new Error(`customer PATCH failed (${res.status})`);
    }
  }

  /* ── Explicit "שמור" button in the פרטי לקוח section ──
     Pushes edited טלפון/אימייל straight to the customer's contact record in the DB,
     with visible success/error feedback (unlike the silent sync during a full save). */
  async function handleSaveContactInfo(): Promise<void> {
    if (!customerId) { alert('נא לבחור לקוח לפני שמירת פרטי איש הקשר'); return; }
    const user = getSessionUser();
    if (!user) { alert('אין משתמש מחובר'); return; }
    setContactSaveState('saving');
    try {
      await syncContactInfoToDb(user);
      setContactSaveState('saved');
      setTimeout(() => setContactSaveState('idle'), 2500);
    } catch {
      setContactSaveState('error');
      setTimeout(() => setContactSaveState('idle'), 3500);
    }
  }

  async function doSave(opts?: { advanceStage?: boolean }): Promise<string | null> {
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
      const payload = buildQuotePayload();
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
      // Propagate edited טלפון/אימייל back to the customer's contact/record.
      // Non-fatal — the quote itself is already saved.
      try { await syncContactInfoToDb(user); } catch { /* ignore */ }
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
      if (savedId) setSavedOnce(true);
      if (savedId && (opts?.advanceStage ?? true) && onQuoteSaved) onQuoteSaved(savedId);
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
    .co-name  { font-size: 20pt; font-weight: bold; color: #1e40af; }
    .co-sub   { font-size: 9.5pt; color: #555; margin-bottom: 10px; }

    /* ── Document title ── */
    .doc-title {
      font-size: 15pt; font-weight: bold; text-align: center;
      border: 2px solid #1e40af; color: #1e40af;
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
      background: #1e40af; color: #fff; font-weight: bold;
      padding: 6px 7px; text-align: center;
      border: 1px solid #1e40af;
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
    .trow.total-row  { background: #1e40af; color: #fff; font-weight: bold; font-size: 12pt; }
    .amt { white-space: nowrap; font-variant-numeric: tabular-nums; }

    /* ── Section boxes ── */
    .sbox { border: 1px solid #ddd; border-radius: 4px; padding: 7px 12px; margin: 8px 0; background: #f9f9f9; font-size: 10pt; }
    .sbox h4 { font-size: 10.5pt; font-weight: bold; color: #1e40af; margin-bottom: 4px; border-bottom: 1px solid #ddd; padding-bottom: 2px; }
    .sbox .srow { margin-top: 3px; }

    /* ── Signature lines ── */
    .sig-section { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 22px; }
    .sig-box { border-top: 1px solid #888; padding-top: 4px; text-align: center; font-size: 9.5pt; color: #555; }

    /* ── Footer ── */
    .doc-footer { margin-top: 18px; padding-top: 6px; border-top: 2px solid #1e40af; font-size: 8.5pt; color: #777; text-align: center; }

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
    if (lineItems.length === 0 || !paymentTerms.trim()) {
      alert('יש להוסיף לפחות פריט אחד בהצעת המחיר ולמלא תנאי תשלום לפני המיזוג');
      return;
    }
    const user = getSessionUser();
    if (!user) {
      alert('אין משתמש מחובר');
      return;
    }
    // תמיד פותחים את בורר התבניות — לא ממזגים אוטומטית את התבנית האחרונה שנבחרה
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

      // הצגת תבניות רק לפי התאמת קטגוריה לפריטי ההצעה.
      // אין הצגה של תבניות "כלליות"/ללא קטגוריה כברירת מחדל — כל תבנית חייבת
      // קטגוריה מזוהה, וההצעה הגנרית (general) מוצגת רק כשיש פריט מקטגוריה כללית.
      const lineItemCats = new Set(
        lineItems.map((li) => getSkuCategory(li.sku)).filter((c): c is string => c !== null)
      );
      // אין פריט מקוטלג → לא להציג אף תבנית (אי אפשר לדעת קטגוריה)
      const filteredRows = lineItemCats.size === 0
        ? []
        : rows.filter((r) => {
            const tplCat = getTemplateCategory(r.label);
            // רק התאמה מדויקת לקטגוריה; תבניות 'general'/כללי לא מוצגות אוטומטית
            // (פריטי תוספת נפוצים כמו הוצאות הגעה/משלוח שייכים ל-general והיו גוררים תבניות כלליות בכל מיזוג)
            return tplCat !== null && tplCat !== 'general' && lineItemCats.has(tplCat);
          });
      setMergeTemplateRows(filteredRows);
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
    // Ensure the draft is saved first so the generated DOCX can be linked to a quote record
    if (!quoteIdRef.current && customerId) {
      await silentSaveDraft();
    }

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
        unitPrice: fmtMoney(price),
        discountPct: disc > 0 ? disc + '%' : '0%',
        lineTotal: fmtMoney(lineTotal),
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
      subtotal: fmtMoney(sub),
      discountPercent: discPct > 0 ? String(discPct) : '0',
      subtotalAfterDiscount: fmtMoney(afterDiscountVal),
      vatAmount: fmtMoney(vatVal),
      totalAmount: fmtMoney(totalVal),
      vat: fmtMoney(vatVal),
      total: fmtMoney(totalVal),
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
      void safeName;
      const fileName = `הצעת מחיר${customer ? ' - ' + customer.trim() : ''}.docx`;
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setMergedFiles((prev) => [...prev, { name: fileName, url, serverBacked: !!quoteIdRef.current }]);
      // מיזוג חדש מחליף את הגרסה הקנונית — מבטלים את מצב OneDrive הישן.
      setOnedriveActive(false); setOnedriveWebUrl(null);
      setTimeout(() => URL.revokeObjectURL(url), 300000); // keep alive 5 min for re-download

      // ── Persist the merged file to task attachment and/or quote record ──
      const currentQuoteId = quoteIdRef.current;
      if (taskId || currentQuoteId) {
        try {
          const dataBase64 = await blobToBase64(blob);
          if (taskId) {
            const attRes = await apiFetch(apiUrl(`/tasks/${taskId}/attachments`), {
              authUser: user,
              method: 'POST',
              body: JSON.stringify({
                fileName,
                mimeType: blob.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                dataBase64,
              }),
            });
            // קישור ציבורי להורדת הקובץ — לשימוש בגוף המייל (mailto)
            try {
              const created = attRes.ok ? await attRes.json() : null;
              if (created?.id) { setLastMergedAttachmentId(created.id); setLastMergedPublicUrl(apiUrl(`/public/attachments/${created.id}/price-quote.docx`)); }
            } catch { /* ignore */ }
            onAttachmentSaved?.();
          }
          if (currentQuoteId) {
            await apiFetch(apiUrl(`/quotes/${currentQuoteId}/save-merged-doc`), {
              authUser: user,
              method: 'POST',
              body: JSON.stringify({ base64Data: dataBase64, fileName }),
            });
          }
        } catch (e) {
          console.error('Failed to attach merged DOCX:', e);
        }
      }

      // ── ניסוח מייל רק אחרי המיזוג ── עכשיו שהמסמך המלא נשמר להצעה, ל-AI יש את כל
      // ההקשר (סכום/תנאי תשלום/פריטים + טקסט המסמך). לפני המיזוג לא מנסחים כדי לא
      // לשלוח ל-AI בקשה חסרת הקשר.
      if (currentQuoteId) void generateEmailDraft(currentQuoteId);

      // ההמרה ל-PDF אינה מתבצעת כאן יותר — הקובץ נשמר כ-DOCX, וההמרה ל-PDF מתבצעת בצד השרת
      // בזמן השליחה בלבד ("שלח"). כך עורכים DOCX בקלות, וכל מה שנשלח ללקוח הוא PDF.
      setStatusMsg('המסמך נוצר ונשמר — פותח ב-Word…');
      // ── פתיחה אוטומטית ב-Word לעריכה מיד אחרי המיזוג (אין צורך בכפתור "ערוך בוורד" נפרד) ──
      if (quoteIdRef.current) {
        await handleEditInWord();
      } else {
        setTimeout(() => setStatusMsg(''), 4000);
      }
    } catch (err) {
      console.error('DOCX merge error:', err);
      alert('שגיאה בהורדת קובץ Word');
    }
  }

  // הוספת קובץ ידנית לרשימת "קבצים שנוצרו" (למשל גרסה שנערכה ידנית של הצעת המחיר)
  async function handleAddGeneratedFile(file: File) {
    if (!file) return;
    const user = getSessionUser();
    const url = URL.createObjectURL(file);
    const fileName = file.name;
    setMergedFiles((prev) => [...prev, { name: fileName, url }]);
    // מיזוג חדש מחליף את הגרסה הקנונית — מבטלים את מצב OneDrive הישן.
    setOnedriveActive(false); setOnedriveWebUrl(null);
    setTimeout(() => URL.revokeObjectURL(url), 300000);
    const currentQuoteId = quoteIdRef.current;
    if (user && (taskId || currentQuoteId)) {
      try {
        const dataBase64 = await blobToBase64(file);
        if (taskId) {
          const attRes = await apiFetch(apiUrl(`/tasks/${taskId}/attachments`), {
            authUser: user,
            method: 'POST',
            body: JSON.stringify({
              fileName,
              mimeType: file.type || 'application/octet-stream',
              dataBase64,
            }),
          });
          try {
            const created = attRes.ok ? await attRes.json() : null;
            if (created?.id) { setLastMergedAttachmentId(created.id); setLastMergedPublicUrl(apiUrl(`/public/attachments/${created.id}/price-quote.docx`)); }
          } catch { /* ignore */ }
          onAttachmentSaved?.();
        }
        if (currentQuoteId) {
          await apiFetch(apiUrl(`/quotes/${currentQuoteId}/save-merged-doc`), {
            authUser: user,
            method: 'POST',
            body: JSON.stringify({ base64Data: dataBase64, fileName }),
          });
        }
      } catch (e) {
        console.error('Failed to attach uploaded file:', e);
      }
    }
  }

  // העלאת "גרסה ערוכה" ישירות מחלון השליחה — מצרפת אותה ומסמנת כקובץ שיישלח
  async function uploadEditedQuoteFile(file: File) {
    if (!file) return;
    const user = getSessionUser();
    setEmailAttBusy(true);
    try {
      const dataBase64 = await blobToBase64(file);
      const fileName = file.name;
      let newId = '';
      if (taskId) {
        const attRes = await apiFetch(apiUrl(`/tasks/${taskId}/attachments`), {
          authUser: user,
          method: 'POST',
          body: JSON.stringify({
            fileName,
            mimeType: file.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            dataBase64,
          }),
        });
        const created = attRes.ok ? await attRes.json() : null;
        if (created?.id) newId = created.id;
        onAttachmentSaved?.();
      }
      const isPdf = /pdf/i.test(file.type) || /\.pdf$/i.test(fileName);
      const currentQuoteId = quoteIdRef.current || emailForm.quoteId;
      if (currentQuoteId) {
        await apiFetch(apiUrl(`/quotes/${currentQuoteId}/save-merged-doc`), {
          authUser: user,
          method: 'POST',
          body: JSON.stringify({ base64Data: dataBase64, fileName, mimeType: file.type || undefined }),
        });
      }
      // קובץ ידני (DOCX ערוך או PDF סופי מ-Word) גובר על OneDrive — מבטלים את מצב OneDrive.
      setOnedriveActive(false); setOnedriveWebUrl(null);
      if (newId) {
        // יש משימה → נשלח דרך ה-TaskAttachment (עם ה-mime הנכון; PDF נשלח כמות-שהוא).
        setLastMergedAttachmentId(newId);
        setEmailAttachments((prev) => [{ id: newId, fileName, createdAt: new Date().toISOString() }, ...prev.filter((a) => a.id !== newId)]);
        setEmailForm((p) => ({ ...p, attId: newId }));
        setStatusMsg(isPdf ? 'ה-PDF צורף — הוא יישלח בדיוק כפי שהוא (נאמנות מלאה)' : 'הגרסה הערוכה צורפה — היא זו שתישלח');
        setTimeout(() => setStatusMsg(''), 4000);
      } else if (currentQuoteId) {
        // אין משימה → נשלח דרך ה-QuoteDocument האחרון שנשמר; מנקים בחירת קובץ ספציפי.
        setEmailForm((p) => ({ ...p, attId: '' }));
        setStatusMsg(isPdf ? 'ה-PDF צורף — הוא יישלח בדיוק כפי שהוא (נאמנות מלאה)' : 'הגרסה צורפה — היא זו שתישלח');
        setTimeout(() => setStatusMsg(''), 4000);
      } else {
        setStatusMsg('צירוף הקובץ נכשל');
      }
    } catch (e) {
      console.error('Failed to upload edited quote file:', e);
      setStatusMsg('שגיאה בצירוף הקובץ');
    } finally {
      setEmailAttBusy(false);
    }
  }

  // הוספת קובץ *נוסף* לצירוף למייל (לא מחליף את הקובץ הראשי). כל DOCX יומר ל-PDF בצד השרת בזמן השליחה.
  async function addEmailAttachmentFile(file: File) {
    if (!file) return;
    const user = getSessionUser();
    if (!taskId) { setStatusMsg('לא ניתן לצרף קובץ נוסף ללא משימה משויכת'); return; }
    setEmailAttBusy(true);
    try {
      const dataBase64 = await blobToBase64(file);
      const fileName = file.name;
      const attRes = await apiFetch(apiUrl(`/tasks/${taskId}/attachments`), {
        authUser: user,
        method: 'POST',
        body: JSON.stringify({
          fileName,
          mimeType: file.type || 'application/octet-stream',
          dataBase64,
        }),
      });
      const created = attRes.ok ? await attRes.json() : null;
      if (created?.id) {
        onAttachmentSaved?.();
        setEmailAttachments((prev) => [...prev, { id: created.id, fileName, createdAt: new Date().toISOString() }]);
        setEmailExtraAttIds((prev) => [...prev, created.id]);
        setStatusMsg(`הקובץ "${fileName}" צורף — יישלח כ-PDF`);
        setTimeout(() => setStatusMsg(''), 4000);
      } else {
        setStatusMsg('צירוף הקובץ נכשל');
      }
    } catch (e) {
      console.error('Failed to add email attachment:', e);
      setStatusMsg('שגיאה בצירוף הקובץ');
    } finally {
      setEmailAttBusy(false);
    }
  }

  // הסרת קובץ נוסף מרשימת הצירופים (לא מוחק את ה-attachment עצמו — רק מוציא מהשליחה)
  function removeExtraEmailAttachment(idToRemove: string) {
    setEmailExtraAttIds((prev) => prev.filter((x) => x !== idToRemove));
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
  const canMerge = lineItems.length > 0 && paymentTerms.trim() !== '';

  return (
    <div ref={rootRef} className="flex flex-col min-h-screen bg-gray-50" dir="rtl">
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 bg-white border-b border-gray-100 px-6 py-2 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-full bg-green-500 flex items-center justify-center text-white font-bold text-sm shadow-md">G</div>
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
          {/* גיבוי כש-Word דסקטופ לא מצליח לפתוח (בעיית זהות/הרשאות במחשב) — פתיחה ב-Word Online בדפדפן */}
          {onedriveActive && onedriveWebUrl && (
            <a href={onedriveWebUrl} target="_blank" rel="noopener noreferrer" className="mr-1 whitespace-nowrap text-xs font-semibold text-blue-600 underline hover:text-blue-700">לא נפתח ב-Word? פתח בדפדפן</a>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button type="button" className="flex flex-col items-center gap-0.5 transition-colors disabled:opacity-40" disabled={isBusy} onClick={async () => { await doSave({ advanceStage: false }); }}>
            <span className="h-10 w-10 rounded-full border border-gray-200 bg-white flex items-center justify-center text-green-500 hover:bg-green-50 hover:text-green-600"><Save size={18} /></span>
            <span className="text-[10px] text-gray-500">שמור</span>
          </button>
          <button type="button" className="flex flex-col items-center gap-0.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed" disabled={!savedOnce || !canMerge} title={!savedOnce ? 'יש לשמור את ההצעה לפני המיזוג' : (!canMerge ? 'יש להוסיף לפחות פריט אחד ולמלא תנאי תשלום לפני המיזוג' : undefined)} onClick={() => handleMergeClick()}>
            <span className={`h-10 w-10 rounded-full border border-gray-200 bg-white flex items-center justify-center ${savedOnce ? 'text-green-500 hover:bg-green-50 hover:text-green-600' : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'}`}><FileText size={18} /></span>
            <span className="text-[10px] text-gray-500">מיזוג</span>
          </button>
          {/* כפתור "ערוך בוורד" הוסר — המיזוג פותח את המסמך אוטומטית ב-Word. */}
          {/* אם המסמך כבר נפתח פעם (onedriveActive), נשאיר קיצור קטן לפתיחה חוזרת בלי מיזוג מחדש. */}
          {onedriveActive && (
            <button
              type="button"
              className="flex flex-col items-center gap-0.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              disabled={onedriveBusy}
              title="פתח שוב ב-Word — השינויים יישמרו אוטומטית"
              onClick={() => handleEditInWord()}
            >
              <span className="h-10 w-10 rounded-full border border-blue-300 bg-blue-50 text-blue-600 flex items-center justify-center">
                {onedriveBusy ? <RefreshCw size={18} className="animate-spin" /> : <Pencil size={18} />}
              </span>
              <span className="text-[10px] text-gray-500">פתח שוב ב-Word</span>
            </button>
          )}
          <button type="button" className="flex flex-col items-center gap-0.5 transition-colors disabled:opacity-40" disabled={!savedOnce || isBusy} title={!savedOnce ? 'יש לשמור את ההצעה לפני שליחה במייל' : undefined} onClick={async () => {
            const id = await doSave({ advanceStage: false }); // שמירה בלי קידום שלב
            if (!id) { setStatusMsg('שמירת ההצעה נכשלה'); return; }
            if (!customerEmail?.trim()) { setStatusMsg('אין כתובת מייל לאיש הקשר'); return; }
            const to = customerEmail.trim();
            const ref = (reference || quoteNo || '').trim();
            // רשימת קבצי ההצעה של המשימה (לבחירה/החלפה בחלון השליחה) — חדש→ישן
            let attId = lastMergedAttachmentId;
            let attList: { id: string; fileName: string; createdAt?: string }[] = [];
            if (taskId) {
              try {
                const r = await apiFetch(apiUrl(`/tasks/${taskId}/attachments`), { authUser: getSessionUser() });
                if (r.ok) {
                  const list = await r.json();
                  if (Array.isArray(list)) {
                    attList = list
                      .map((a: any) => ({ id: a.id, fileName: a.fileName, createdAt: a.createdAt }))
                      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
                  }
                }
              } catch { /* ignore */ }
            }
            // ברירת מחדל: הקובץ מהמיזוג/העלאה האחרונים; אחרת החדש ביותר ברשימה
            if (!attId || !attList.some((a) => a.id === attId)) attId = attList[0]?.id || attId;
            setEmailAttachments(attList);
            const docLink = attId ? apiUrl(`/public/attachments/${attId}/price-quote.docx`) : '';
            // בדיקה אם למשתמש יש חתימה (טקסט + תמונות) — להצגה ב-preview ובחירה
            let hasSig = false;
            let sigImg: string | null = null;
            let sigList: { id: string; title: string; dataBase64: string; imageType?: string }[] = [];
            let firstSigId = '';
            const su = getSessionUser();
            try {
              const r = await apiFetch(apiUrl(`/users/${su?.id}`), { authUser: su });
              if (r.ok) { const u = await r.json(); hasSig = !!(u?.mailSignature && String(u.mailSignature).trim()); }
            } catch { /* ignore */ }
            try {
              const rs = await apiFetch(apiUrl(`/users/${su?.id}/signatures`), { authUser: su });
              if (rs.ok) { const list = await rs.json(); if (Array.isArray(list)) sigList = list; }
            } catch { /* ignore */ }
            if (sigList.length) {
              hasSig = true;
              firstSigId = sigList[0].id;
              sigImg = `data:${sigList[0].imageType || 'image/png'};base64,${sigList[0].dataBase64}`;
            }
            setEmailSignatures(sigList);
            // אם כבר קיים ניסוח AI שנוצר בשמירה עבור ההצעה הזו — מציגים אותו; אחרת נוסח ברירת מחדל,
            // ומפעילים ניסוח אוטומטי שיעדכן את החלון חי כשיחזור.
            const draftReady = !!aiDraft && aiDraft.quoteId === id;
            const defSubject = draftReady ? aiDraft!.subject : `הצעת מחיר${ref ? ' ' + ref : ''}${customer ? ' - ' + customer : ''}`;
            const defBody = draftReady ? aiDraft!.body : `שלום ${contact || customer || ''},\n\nמצורפת הצעת המחיר${ref ? ' ' + ref : ''}.\nנשמח לעמוד לרשותך לכל שאלה.`;
            setEmailHasSignature(hasSig);
            setEmailSigImage(sigImg);
            setEmailHasDraft(true); // השאלון הוסר — תמיד מציגים את ה-preview
            setEditingField(null);
            setAiInstruction('');
            setAiPanelOpen(false);
            emailDraftEditedRef.current = false; // טקסט טרי שנטען לחלון
            if (!draftReady) setAiFactsNote('');
            setEmailForm({
              toList: to ? [to] : [],
              toInput: '',
              ccList: [],
              ccInput: '',
              subject: defSubject,
              body: defBody,
              includeSignature: hasSig,
              signatureId: firstSigId,
              quoteId: id,
              attId: attId || '',
              docLink,
              serviceName: (reference || '').trim(),
            });
            setEmailExtraAttIds([]); // איפוס קבצים נוספים בכל פתיחה של חלון השליחה
            setEmailModalOpen(true);
            if (!draftReady) void generateEmailDraft(id); // אין ניסוח עדיין — מנסחים עכשיו (יתעדכן חי)
          }}>
            <span className={`h-10 w-10 rounded-full border border-gray-200 bg-white flex items-center justify-center ${savedOnce ? 'text-green-500 hover:bg-green-50 hover:text-green-600' : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'}`}><Mail size={18} /></span>
            <span className="text-[10px] text-gray-500">שלח במייל</span>
          </button>
          <button type="button" className="flex flex-col items-center gap-0.5 transition-colors disabled:opacity-40" disabled={isBusy} onClick={() => { setWaOpen(true); setWaMsg(''); setWaInstruction(''); void generateWaDraft(); }}>
            <span className="h-10 w-10 rounded-full border border-gray-200 bg-white flex items-center justify-center text-green-500 hover:bg-green-50 hover:text-green-600"><MessageCircle size={18} /></span>
            <span className="text-[10px] text-gray-500">וואטסאפ</span>
          </button>
          <button type="button" className="flex flex-col items-center gap-0.5 transition-colors" onClick={() => handlePrint()}>
            <span className="h-10 w-10 rounded-full border border-gray-200 bg-white flex items-center justify-center text-gray-400 hover:bg-gray-50 hover:text-gray-600"><Printer size={18} /></span>
            <span className="text-[10px] text-gray-500">הדפס</span>
          </button>
          {onExit && (
            <button type="button" className="flex flex-col items-center gap-0.5 transition-colors" onClick={() => onExit({ advanceToFollowUp: !!follow.trim() })}>
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
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-base font-bold text-gray-700 flex items-center gap-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-blue-50 text-blue-500"><SearchIcon size={12} /></span>
                  פרטי לקוח
                </h3>
                <button
                  type="button"
                  onClick={handleSaveContactInfo}
                  disabled={!customerId || contactSaveState === 'saving'}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    contactSaveState === 'saved'
                      ? 'bg-green-500 text-white'
                      : contactSaveState === 'error'
                        ? 'bg-red-500 text-white'
                        : 'bg-blue-500 text-white hover:bg-blue-600'
                  }`}
                  title="עדכון טלפון/אימייל איש הקשר במאגר הלקוחות"
                >
                  {contactSaveState === 'saving' ? 'שומר…'
                    : contactSaveState === 'saved' ? '✓ נשמר'
                    : contactSaveState === 'error' ? 'שגיאה — נסה שוב'
                    : 'שמור'}
                </button>
              </div>
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
                    <input className={inp} value={contact} onChange={(e) => setContact(e.target.value)} placeholder="שם איש הקשר" />
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
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-green-50 text-green-500"><Plus size={12} /></span>
                  פירוט פריטים
                  <span className="text-xs font-normal text-gray-400 mr-1">({lineItems.length})</span>
                </h3>
                <button type="button" className="flex items-center gap-2 rounded-xl bg-green-500 px-6 py-2.5 text-base font-bold text-white hover:bg-green-600 shadow-md transition-colors" onClick={() => { const next = newLineItem(); setLineItems((prev) => [...prev, next]); setSelectedLineIdx(lineItems.length); }}>
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
                            <div className="text-sm font-medium text-gray-400 mb-0.5">מק&quot;ט</div>
                            <input value={item.sku} onChange={(e) => setLineItems((prev) => prev.map((r, i) => i === idx ? { ...r, sku: e.target.value } : r))} className="h-11 w-full rounded-lg border border-gray-200 bg-white px-2 text-base outline-none focus:border-blue-400" />
                          </div>
                          <div className="sm:col-span-2 lg:col-span-5">
                            <div className="text-sm font-medium text-gray-400 mb-0.5">תיאור השירות / מוצר</div>
                            <ServiceTreePicker
                              value={item.description}
                              onSelect={({ description, sku, price }) => {
                                setLineItems((prev) => prev.map((r, i) =>
                                  i === idx ? { ...r, description, sku, price } : r
                                ));
                              }}
                            />
                            {/* Free-text override — shown below the picker */}
                            <input
                              value={item.description}
                              onChange={(e) => setLineItems((prev) => prev.map((r, i) => i === idx ? { ...r, description: e.target.value } : r))}
                              className="mt-1 h-8 w-full rounded-lg border border-gray-100 bg-gray-50 px-3 text-xs outline-none focus:border-blue-300 text-gray-600"
                              placeholder="או הקלד שם חופשי..."
                            />
                          </div>
                          <div className="lg:col-span-2">
                            {(() => {
                              const catalogSvc = flattenAllServices().find((s) => s.sku === item.sku || s.id === item.sku);
                              // "מחיר ברירת מחדל" מהקטלוג — לתצוגה והתרעה בלבד; אפשר לקבוע מחיר נמוך יותר.
                              const recommendedPrice = catalogSvc?.price && catalogSvc.price > 0 ? catalogSvc.price : null;
                              const enteredPrice = parseFloat(item.price) || 0;
                              const isBelowRecommended = recommendedPrice != null && enteredPrice > 0 && enteredPrice < recommendedPrice;
                              return (
                                <>
                                  <div className="text-sm font-medium text-gray-400 mb-0.5 flex items-center gap-1">
                                    מחיר ליחידה
                                    {recommendedPrice != null && <span className="text-[10px] text-gray-300">ברירת מחדל ₪{recommendedPrice.toLocaleString('he-IL')}</span>}
                                  </div>
                                  <div className="relative">
                                    <input
                                      value={item.price}
                                      onChange={(e) => setLineItems((prev) => prev.map((r, i) => i === idx ? { ...r, price: e.target.value } : r))}
                                      className={`h-11 w-full rounded-lg border bg-white pl-7 pr-3 text-base outline-none text-left transition-colors ${isBelowRecommended ? 'border-amber-400 focus:border-amber-500 bg-amber-50' : 'border-gray-200 focus:border-blue-400'}`}
                                      placeholder="0"
                                    />
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₪</span>
                                    {/* התרעה לא-חוסמת: המחיר נמוך מברירת המחדל — מותר, רק לתשומת לב */}
                                    {isBelowRecommended && (
                                      <div className="absolute right-0 top-full z-20 mt-1 w-max max-w-[220px] rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-800 shadow-md">
                                        ⚠️ מתחת למחיר ברירת המחדל (₪{recommendedPrice!.toLocaleString('he-IL')}) — אפשר להמשיך
                                      </div>
                                    )}
                                  </div>
                                </>
                              );
                            })()}
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
            </section>

            {/* ── קבצים שנוצרו ── */}
            {(mergedFiles.length > 0 || (existingAttachments && existingAttachments.length > 0) || (!!quoteId && !!lastMergedDocPath) || !!quoteId || !!taskId) && (
              <section className="rounded-2xl bg-white border border-green-100 shadow-sm p-4" dir="rtl">
                <h3 className="text-base font-bold text-gray-700 mb-3 flex items-center gap-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-green-50 text-green-500">
                    <FileText size={12} />
                  </span>
                  קבצים שנוצרו
                  <span className="text-xs font-normal text-gray-400 mr-1">({mergedFiles.length + (existingAttachments?.filter((att) => !mergedFiles.some((f) => f.name === att.fileName)).length ?? 0) + (quoteId && lastMergedDocPath ? 1 : 0)})</span>
                </h3>
                <div className="space-y-2">
                  {mergedFiles.map((f, i) => (
                    (f.serverBacked && quoteId) ? (
                      /* קובץ ממוזג שנשמר בהצעה — מושכים את הגרסה העדכנית מהשרת (מסנכרן מ-OneDrive),
                         כדי שאחרי עריכה ב-Word ההורדה תיתן את הגרסה המעודכנת ולא את ה-blob המקורי. */
                      <button key={`s-${i}`} type="button" onClick={() => handleDownloadMergedDoc(f.name)} className="w-full flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-2.5 hover:bg-green-100 transition-colors text-right" title={f.name}>
                        <FileText size={15} className="text-green-600 flex-shrink-0" />
                        <span className="flex-1 text-sm font-semibold text-green-800 truncate">{f.name}</span>
                        <span className="text-[11px] font-bold text-green-600 flex-shrink-0 border border-green-300 rounded-lg px-2 py-0.5">הורד</span>
                      </button>
                    ) : (
                      <a key={`s-${i}`} href={f.url} download={f.name} className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-2.5 hover:bg-green-100 transition-colors" title={f.name}>
                        <FileText size={15} className="text-green-600 flex-shrink-0" />
                        <span className="flex-1 text-sm font-semibold text-green-800 truncate">{f.name}</span>
                        <span className="text-[11px] font-bold text-green-600 flex-shrink-0 border border-green-300 rounded-lg px-2 py-0.5">הורד</span>
                      </a>
                    )
                  ))}
                  {existingAttachments?.filter((att) => !mergedFiles.some((f) => f.name === att.fileName)).map((att) => (
                    <button key={att.id} type="button" onClick={() => onDownloadAttachment?.(att)} className="w-full flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 hover:bg-slate-100 transition-colors text-right">
                      <FileText size={15} className="text-slate-500 flex-shrink-0" />
                      <span className="flex-1 text-sm font-semibold text-slate-700 truncate">{att.fileName}</span>
                      <span className="text-[11px] text-slate-400 flex-shrink-0">{new Date(att.createdAt).toLocaleDateString('he-IL')}</span>
                    </button>
                  ))}
                  {mergedFiles.length === 0 && quoteId && lastMergedDocPath && (
                    <button type="button" onClick={() => handleDownloadMergedDoc()} className="w-full flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 hover:bg-slate-100 transition-colors text-right">
                      <FileText size={15} className="text-slate-500 flex-shrink-0" />
                      <span className="flex-1 text-sm font-semibold text-slate-700 truncate">{lastMergedDocPath.split(/[\\/]/).pop()}</span>
                      <span className="text-[11px] font-bold text-slate-500 flex-shrink-0 border border-slate-300 rounded-lg px-2 py-0.5">הורד</span>
                    </button>
                  )}
                  {/* הוספת קובץ ידנית (גרסה שנערכה) לרשימת הקבצים שנוצרו */}
                  <label className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-green-300 bg-white px-4 py-2.5 hover:bg-green-50 transition-colors cursor-pointer text-sm font-bold text-green-700">
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleAddGeneratedFile(f); e.currentTarget.value = ''; }}
                    />
                    <Plus size={15} className="flex-shrink-0" />
                    הוסף קובץ (גרסה שנערכה)
                  </label>
                </div>
              </section>
            )}
          </div>

          {/* ══════ LEFT / SIDEBAR COLUMN (desktop ~38%) ══════ */}
          <div className="w-full xl:w-[340px] shrink-0 space-y-3">

            {/* ── Terms, Tracking & Sales Rep ── */}
            <section className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4">
              <h3 className="text-base font-bold text-gray-700 mb-2 flex items-center gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-blue-50 text-blue-500"><FileText size={12} /></span>
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
                {(() => { const n = parseInt(paymentsCount) || 0; const total = parseFloat(cashTotal) || 0; if (n > 1 && total > 0) { return <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm font-semibold text-green-700 text-center">{n} תשלומים של {(total / n).toFixed(2)} ₪ לתשלום (כולל מע&quot;מ)</div>; } return null; })()}
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
                  <span className="font-bold text-green-400 text-lg">{subtotal || '0.00'} ₪</span>
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
                    <span className="text-2xl font-extrabold text-green-400">{cashTotal || '0.00'} ₪</span>
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

      {waOpen && (
        <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/50 p-4" onClick={() => !waBusy && setWaOpen(false)}>
          <div className="w-full max-w-lg rounded-3xl border border-gray-200 bg-white p-6 shadow-2xl max-h-[92vh] overflow-y-auto" dir="rtl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-2 border-b border-gray-100 pb-3 text-xl font-bold text-gray-800">
              <MessageCircle size={22} className="text-green-500" /> שליחת הצעת מחיר בוואטסאפ
            </div>
            <div className="mb-3 text-sm text-gray-500">
              הודעה שנוסחה אוטומטית{contact ? ` עבור ${contact}` : ''}. אפשר לערוך לפני השליחה.
            </div>
            {waBusy && !waMsg ? (
              <div className="flex items-center justify-center gap-2 py-12 text-gray-400">
                <RefreshCw size={18} className="animate-spin" /> מנסח הודעה…
              </div>
            ) : (
              <>
                <textarea
                  value={waMsg}
                  onChange={(e) => setWaMsg(e.target.value)}
                  rows={7}
                  dir="rtl"
                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-green-400"
                  placeholder="תוכן ההודעה…"
                />
                <div className="mt-3 flex gap-2">
                  <input
                    value={waInstruction}
                    onChange={(e) => setWaInstruction(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !waBusy) generateWaDraft(waMsg); }}
                    className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-green-400"
                    placeholder="רוצה לשנות? כתוב הנחיה ולחץ ׳נסח מחדש׳"
                  />
                  <button type="button" disabled={waBusy} onClick={() => generateWaDraft(waMsg)} className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50">
                    {waBusy ? '…' : 'נסח מחדש'}
                  </button>
                </div>
              </>
            )}
            <div className="mt-5 flex items-center justify-between gap-2 border-t border-gray-100 pt-4">
              <button type="button" onClick={() => setWaOpen(false)} className="rounded-xl border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium hover:bg-gray-50">ביטול</button>
              <button
                type="button"
                disabled={waBusy || !waMsg.trim()}
                onClick={() => { let n = (phone || '').replace(/\D/g, ''); if (n.startsWith('0')) n = '972' + n.slice(1); window.open(`https://wa.me/${n}?text=${encodeURIComponent(waMsg)}`, '_blank'); setWaOpen(false); }}
                className="flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50"
                style={{ background: '#16a34a' }}
              >
                <MessageCircle size={16} /> שלח בוואטסאפ
              </button>
            </div>
            {!(phone || '').trim() && <div className="mt-2 text-xs text-amber-600">⚠ אין מספר טלפון ללקוח — הוואטסאפ ייפתח ללא נמען.</div>}
          </div>
        </div>
      )}

      {emailModalOpen && (
        <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/50 p-4" onClick={() => !emailSending && setEmailModalOpen(false)}>
          <div className="w-full max-w-3xl rounded-3xl border border-gray-200 bg-white p-8 shadow-2xl max-h-[92vh] overflow-y-auto" dir="rtl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-6 flex items-center gap-3 border-b border-gray-100 pb-4 text-2xl font-bold text-gray-800">
              <Mail size={26} className="text-blue-500" /> שליחת הצעת מחיר במייל
            </div>

            <div className="space-y-5">
              {/* נמען ראשי + נמענים נוספים כ-chips */}
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-gray-700">אל <span className="font-normal text-gray-400">(Enter כדי להוסיף עוד נמען)</span></label>
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-300 px-3 py-2.5 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
                  {emailForm.toList.map((em) => (
                    <span key={em} className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1.5 text-sm text-blue-800" dir="ltr">
                      {em}
                      <button type="button" className="text-base text-blue-500 hover:text-blue-700" onClick={() => removeRecipient(em, 'toList')}>×</button>
                    </span>
                  ))}
                  <input dir="ltr" className="min-w-[160px] flex-1 bg-transparent px-1 py-1 text-base outline-none text-right"
                    value={emailForm.toInput}
                    onChange={(e) => setEmailForm((p) => ({ ...p, toInput: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addRecipients(emailForm.toInput, 'toList'); }
                      else if (e.key === 'Backspace' && !emailForm.toInput && emailForm.toList.length) { removeRecipient(emailForm.toList[emailForm.toList.length - 1], 'toList'); }
                    }}
                    onBlur={() => emailForm.toInput.includes('@') && addRecipients(emailForm.toInput, 'toList')}
                    placeholder={emailForm.toList.length ? 'נמען נוסף…' : 'customer@example.com'} />
                </div>
              </div>
              {/* CC כ-chips */}
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-gray-700">עותק (CC)</label>
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-300 px-3 py-2.5 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
                  {emailForm.ccList.map((em) => (
                    <span key={em} className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1.5 text-sm text-gray-700" dir="ltr">
                      {em}
                      <button type="button" className="text-base text-gray-400 hover:text-gray-600" onClick={() => removeRecipient(em, 'ccList')}>×</button>
                    </span>
                  ))}
                  <input dir="ltr" className="min-w-[160px] flex-1 bg-transparent px-1 py-1 text-base outline-none text-right"
                    value={emailForm.ccInput}
                    onChange={(e) => setEmailForm((p) => ({ ...p, ccInput: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addRecipients(emailForm.ccInput, 'ccList'); }
                      else if (e.key === 'Backspace' && !emailForm.ccInput && emailForm.ccList.length) { removeRecipient(emailForm.ccList[emailForm.ccList.length - 1], 'ccList'); }
                    }}
                    onBlur={() => emailForm.ccInput.includes('@') && addRecipients(emailForm.ccInput, 'ccList')}
                    placeholder="הוסף עותק…" />
                </div>
              </div>

              {/* ── PREVIEW מושקע של המייל — הניסוח נוצר אוטומטית בשמירה (שאלון ה-AI הוסר) ── */}
              {emailHasDraft && (
                <div className="overflow-hidden rounded-2xl border border-gray-200 shadow-sm">
                  {/* כותרת ה-preview */}
                  <div className="flex items-center justify-between gap-2 border-b border-gray-100 bg-gradient-to-l from-blue-50 to-white px-5 py-3">
                    <span className="text-sm font-bold text-gray-700">👁️ תצוגה מקדימה של המייל</span>
                    {aiBusy ? (
                      <span className="text-sm text-blue-600">✨ מנסח…</span>
                    ) : (
                      <button type="button" className="text-sm font-medium text-blue-600 underline hover:text-blue-800"
                        onClick={() => void generateEmailDraft(emailForm.quoteId, { force: true })}>
                        ✨ נסח מחדש
                      </button>
                    )}
                  </div>

                  {/* גוף ה-preview — נראה כמו מייל אמיתי */}
                  <div className="bg-white px-6 py-5" dir="rtl">
                    {/* נושא — לחיצה לעריכה */}
                    {editingField === 'subject' ? (
                      <input autoFocus className="mb-4 w-full rounded-lg border-2 border-blue-300 px-3 py-2 text-lg font-bold outline-none"
                        value={emailForm.subject} onChange={(e) => { emailDraftEditedRef.current = true; setEmailForm((p) => ({ ...p, subject: e.target.value })); }}
                        onBlur={() => setEditingField(null)}
                        onKeyDown={(e) => { if (e.key === 'Enter') setEditingField(null); }} />
                    ) : (
                      <div className="group mb-4 cursor-text rounded-lg px-2 py-1 -mx-2 hover:bg-blue-50" onClick={() => setEditingField('subject')} title="לחץ לעריכה">
                        <div className="text-[11px] font-semibold uppercase text-gray-400">נושא</div>
                        <div className="text-xl font-extrabold text-gray-900">{emailForm.subject || <span className="text-gray-300">— ללא נושא —</span>}
                          <span className="ms-2 align-middle text-xs text-blue-400 opacity-0 group-hover:opacity-100">✎ ערוך</span>
                        </div>
                      </div>
                    )}

                    <div className="my-3 border-t border-dashed border-gray-200" />

                    {/* תוכן — לחיצה לעריכה */}
                    {editingField === 'body' ? (
                      <textarea autoFocus rows={12} className="w-full rounded-lg border-2 border-blue-300 px-3 py-2 text-base leading-relaxed outline-none resize-y"
                        value={emailForm.body} onChange={(e) => { emailDraftEditedRef.current = true; setEmailForm((p) => ({ ...p, body: e.target.value })); }}
                        onBlur={() => setEditingField(null)} />
                    ) : (
                      <div className="group cursor-text rounded-lg px-2 py-1 -mx-2 hover:bg-blue-50" onClick={() => setEditingField('body')} title="לחץ לעריכה">
                        <div className="mb-1 text-[11px] font-semibold uppercase text-gray-400">תוכן ההודעה <span className="text-blue-400 opacity-0 group-hover:opacity-100">✎ ערוך</span></div>
                        <div className="text-base leading-relaxed text-gray-800">
                          {emailForm.body
                            ? emailForm.body.split('\n').map((line, i) => {
                                const t = line.trimStart();
                                const isKey = ['סה"כ', 'סה״כ', 'תנאי תשלום', 'תוקף ההצעה', 'משך ביצוע', 'מספר הצעה'].some((k) => t.startsWith(k));
                                return (
                                  <div key={i} className={isKey ? 'font-bold text-gray-900' : ''}>
                                    {line || ' '}
                                  </div>
                                );
                              })
                            : <span className="text-gray-300">— ריק —</span>}
                        </div>
                      </div>
                    )}

                    {/* חתימת תמונה (תצוגה גדולה) */}
                    {emailForm.includeSignature && emailSigImage && (
                      <div className="mt-4 border-t border-gray-100 pt-4">
                        <img src={emailSigImage} alt="חתימה" className="max-h-44 max-w-[440px]" />
                      </div>
                    )}

                    {/* כפתור "צפייה בהצעת מחיר" — נשלח במקום קובץ מצורף, מפנה לעמוד הצפייה/חתימה */}
                    <div className="mt-5 border-t border-gray-100 pt-4">
                      <span className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-white" style={{ background: '#2563eb' }}>
                        📄 צפייה בהצעת מחיר
                      </span>
                      <div className="mt-2 text-[11px] text-gray-400">הלקוח יקבל כפתור שמוביל לעמוד צפייה וחתימה בהצעה (במקום קובץ מצורף).</div>
                      {emailForm.includeSignature && emailSigImage && (
                        <span className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                          🖼️ חתימה (תמונה)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* סרגל פעולות תחת ה-preview */}
                  <div className="space-y-3 border-t border-gray-100 bg-gray-50 px-5 py-4">
                    {aiFactsNote && <div className="rounded-lg bg-green-50 px-3 py-2 text-sm font-medium text-green-700">{aiFactsNote}</div>}
                    {emailHasSignature && (
                      <label className="flex items-center gap-2.5 text-sm text-gray-700 cursor-pointer">
                        <input type="checkbox" className="h-5 w-5 accent-blue-500" checked={emailForm.includeSignature} onChange={(e) => setEmailForm((p) => ({ ...p, includeSignature: e.target.checked }))} />
                        כלול חתימה אישית {emailSigImage ? '(טקסט + תמונה)' : ''}
                      </label>
                    )}
                    {/* בחירת תמונת החתימה (כאשר יש יותר מאחת) */}
                    {emailForm.includeSignature && emailSignatures.length > 1 && (
                      <div className="flex items-center gap-2.5">
                        <label className="text-sm font-medium text-gray-700 shrink-0">תמונת חתימה:</label>
                        <select
                          className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-400"
                          value={emailForm.signatureId}
                          onChange={(e) => {
                            const sel = emailSignatures.find((s) => s.id === e.target.value);
                            setEmailForm((p) => ({ ...p, signatureId: e.target.value }));
                            setEmailSigImage(sel ? `data:${sel.imageType || 'image/png'};base64,${sel.dataBase64}` : null);
                          }}
                        >
                          {emailSignatures.map((s) => (
                            <option key={s.id} value={s.id}>{s.title}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    {/* קובץ ההצעה הוסר — נשלח כפתור "צפייה בהצעת מחיר" במקום קובץ מצורף (אין צורך בקובץ) */}
                    {false && (
                    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5">
                      {onedriveActive && (
                        <div className="mb-2.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] text-blue-800">
                          <div className="flex items-center gap-2">
                            <span className="text-base leading-none">📝</span>
                            <span className="flex-1">הקובץ נערך ב-<strong>Word</strong>. <strong className="text-emerald-700">לכותרת מושלמת:</strong> ב-Word עשה <strong>Save as PDF</strong> והעלה למטה — אחרת השרת ימיר ועלול להזיז את הכותרת.</span>
                            {onedriveWebUrl && (
                              <button type="button" onClick={() => openInDesktopWord(onedriveWebUrl!)} className="shrink-0 rounded-md bg-blue-600 px-2.5 py-1 font-semibold text-white hover:bg-blue-700">פתח ב-Word (מחשב)</button>
                            )}
                          </div>
                          {onedriveWebUrl && (
                            <div className="mt-1 pr-6 text-[11px] text-blue-500">
                              לא נפתח? <a href={onedriveWebUrl!} target="_blank" rel="noopener noreferrer" className="underline">פתח בדפדפן</a> — שים לב: עריכה בדפדפן עלולה להזיז תמונות לראש העמוד.
                            </div>
                          )}
                        </div>
                      )}
                      <div className="flex items-center gap-2.5">
                        <label className="text-sm font-medium text-gray-700 shrink-0">📎 קובץ שיישלח:</label>
                        {emailAttachments.length > 1 ? (
                          <select
                            className="flex-1 min-w-0 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-400"
                            value={emailForm.attId}
                            onChange={(e) => setEmailForm((p) => ({ ...p, attId: e.target.value, docLink: e.target.value ? apiUrl(`/public/attachments/${e.target.value}/price-quote.docx`) : p.docLink }))}
                          >
                            {emailAttachments.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.fileName}{a.createdAt ? ` · ${new Date(a.createdAt).toLocaleDateString('he-IL')} ${new Date(a.createdAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}` : ''}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="flex-1 min-w-0 truncate text-sm font-semibold text-gray-800">{emailAttachments.find((a) => a.id === emailForm.attId)?.fileName || 'הצעת מחיר.docx'}</span>
                        )}
                      </div>
                      <label className={`mt-2 flex items-center justify-center gap-2 rounded-lg border border-dashed border-blue-300 bg-white px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 cursor-pointer ${emailAttBusy ? 'opacity-50 pointer-events-none' : ''}`}>
                        <input
                          type="file"
                          accept=".pdf,application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                          className="hidden"
                          disabled={emailAttBusy}
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadEditedQuoteFile(f); e.currentTarget.value = ''; }}
                        />
                        {emailAttBusy ? 'מצרף…' : '⬆️ העלה גרסה ערוכה (DOCX או PDF)'}
                      </label>
                      <div className="mt-1 text-[11px] text-gray-500">
                        <strong className="text-emerald-700">לנאמנות מלאה של הכותרת:</strong> ב-Word עשה <strong>File → Save as PDF</strong> והעלה את ה-PDF כאן — הוא יישלח בדיוק כפי שהוא, בלי המרת שרת שמזיזה תמונות. (DOCX שמועלה כאן עדיין יומר ל-PDF בשרת.)
                      </div>

                      {/* ── קבצים נוספים: יישלחו בנוסף לקובץ הראשי, וכל DOCX יומר ל-PDF ── */}
                      {emailExtraAttIds.length > 0 && (
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          {emailExtraAttIds.map((eid) => {
                            const nm = emailAttachments.find((a) => a.id === eid)?.fileName || 'קובץ';
                            return (
                              <span key={eid} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[12px] text-emerald-800" title={nm}>
                                📎 <span className="max-w-[160px] truncate">{nm}</span>
                                <button type="button" onClick={() => removeExtraEmailAttachment(eid)} className="text-emerald-500 hover:text-emerald-700" aria-label="הסר קובץ">✕</button>
                              </span>
                            );
                          })}
                        </div>
                      )}
                      <label className={`mt-2 flex items-center justify-center gap-2 rounded-lg border border-dashed border-emerald-300 bg-white px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 cursor-pointer ${emailAttBusy ? 'opacity-50 pointer-events-none' : ''}`}>
                        <input
                          type="file"
                          className="hidden"
                          disabled={emailAttBusy}
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) void addEmailAttachmentFile(f); e.currentTarget.value = ''; }}
                        />
                        {emailAttBusy ? 'מצרף…' : '➕ הוסף קובץ (יישלח בנוסף — יומר ל-PDF)'}
                      </label>
                    </div>
                    )}
                    {/* בקשת שינוי מ-AI */}
                    <div>
                      <label className="mb-1 block text-sm font-semibold text-blue-700">✨ בקש מ-AI לשנות</label>
                      <div className="flex gap-2">
                        <input className="h-11 flex-1 rounded-xl border border-blue-200 bg-white px-3 text-base outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                          value={aiInstruction} onChange={(e) => setAiInstruction(e.target.value)}
                          placeholder="'יותר קצר', 'תוסיף שזמינים השבוע'…"
                          onKeyDown={(e) => { if (e.key === 'Enter' && aiInstruction.trim() && !aiBusy) { const ins = aiInstruction; setAiInstruction(''); void generateEmailDraft(emailForm.quoteId, { instruction: ins }); } }} />
                        <button type="button" disabled={aiBusy || !aiInstruction.trim()} className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                          onClick={() => { const ins = aiInstruction; setAiInstruction(''); void generateEmailDraft(emailForm.quoteId, { instruction: ins }); }}>
                          {aiBusy ? 'מעדכן…' : 'עדכן'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {statusMsg && <div className="mt-4 text-base font-medium text-gray-600">{statusMsg}</div>}

            {/* ── קישור חתימה דיגיטלית: נוצר בלחיצה על "שלח לחתימה" ── */}
            {signLink && (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                <div className="mb-1.5 text-sm font-bold text-emerald-800">🖊️ קישור לחתימת הלקוח מוכן</div>
                <div className="mb-2.5 text-[12px] text-emerald-700">שלח את הקישור ללקוח — הוא יפתח את ההצעה בנייד, יחתום באצבע, וההצעה החתומה תישמר אוטומטית אצל הלקוח.</div>
                <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-white px-3 py-2">
                  <input readOnly dir="ltr" value={signLink} className="flex-1 min-w-0 truncate bg-transparent text-xs text-slate-600 outline-none" onFocus={(e) => e.currentTarget.select()} />
                  <button type="button" onClick={copySignLink} className="shrink-0 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600 hover:bg-slate-200">
                    {signCopied ? 'הועתק ✓' : 'העתק'}
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" onClick={shareSignViaWhatsApp} className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-xs font-bold text-white hover:brightness-110">
                    💬 שלח ב-WhatsApp
                  </button>
                  <a href={signLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100">
                    👁️ תצוגה מקדימה
                  </a>
                </div>
              </div>
            )}

            <div className="mt-6 border-t border-gray-100 pt-5">
              {!emailHasDraft && <div className="mb-3 text-sm text-gray-400">נסח או דלג לכתיבה ידנית כדי לשלוח</div>}
              {(() => {
                const noRecipient = !emailForm.toList.length && !emailForm.toInput.includes('@');
                const busy = emailSending || signBusy;
                const emailDisabled = busy || !emailHasDraft || noRecipient || !emailForm.quoteId;
                const waDisabled = busy || !emailForm.quoteId;
                return (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {/* שורה 1: שליחה רגילה (הצעה + פרופיל כקבצים מצורפים, בלי כפתורים ובלי חתימה) */}
                    <button type="button" disabled={emailDisabled} className="flex items-center justify-center gap-2 rounded-xl bg-blue-500 px-6 py-3 text-base font-bold text-white hover:bg-blue-600 transition-colors disabled:opacity-50" onClick={sendQuoteEmailPlain} title="שולח מייל עם ההצעה + הפרופיל והרישיונות כקבצים מצורפים (PDF)">
                      <Mail size={18} /> שלח במייל
                    </button>
                    <button type="button" disabled={waDisabled} className="flex items-center justify-center gap-2 rounded-xl bg-green-500 px-6 py-3 text-base font-bold text-white hover:bg-green-600 transition-colors disabled:opacity-50" onClick={sendQuoteWhatsAppPlain} title="פותח וואטסאפ עם קישור להורדת ה-PDF של ההצעה">
                      <MessageCircle size={18} /> שלח בוואטסאפ
                    </button>
                    {/* שורה 2: שליחה לחתימה (קישור לעמוד /sign שבו הלקוח חותם באצבע) */}
                    <button type="button" disabled={emailDisabled} className="flex items-center justify-center gap-2 rounded-xl border-2 border-blue-300 bg-blue-50 px-6 py-3 text-base font-bold text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-50" onClick={sendQuoteEmail} title="שולח מייל עם כפתור צפייה וחתימה בהצעה">
                      <Mail size={18} /> 🖊️ שלח במייל עם חתימה
                    </button>
                    <button type="button" disabled={waDisabled} className="flex items-center justify-center gap-2 rounded-xl border-2 border-green-300 bg-green-50 px-6 py-3 text-base font-bold text-green-700 hover:bg-green-100 transition-colors disabled:opacity-50" onClick={sendQuoteWhatsAppSign} title="פותח וואטסאפ עם קישור לחתימת הלקוח מהנייד">
                      <MessageCircle size={18} /> 🖊️ שלח בוואטסאפ עם חתימה
                    </button>
                  </div>
                );
              })()}
              <div className="mt-3 flex justify-end">
                <button type="button" disabled={emailSending} className="rounded-xl border border-gray-300 bg-white px-6 py-2.5 text-base font-medium hover:bg-gray-50 transition-colors disabled:opacity-50" onClick={() => { setSignLink(''); setEmailModalOpen(false); }}>ביטול</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
