'use client';
import React, { useState, useEffect, useRef } from 'react';
import { QuoteLookupModal, QuoteLookupRow } from '../../quotes/new/quote-lookup-modal';
import { apiFetch, apiUrl } from '../../lib/api-base';

/* ─── helpers ──────────────────────────────────────────────────────── */
function todayDmy(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

/* ─── product catalog ──────────────────────────────────────────────── */
const PRODUCT_ROWS: QuoteLookupRow[] = [
  { id: 'RAD-C01', label: 'בדיקת קרינה סלולרית בדירה',        subLabel: 'CEL-RAD | ₪950'  },
  { id: 'RAD-C02', label: 'בדיקת קרינה בתדר נמוך (ELF)',       subLabel: 'ELF-RAD | ₪1200' },
  { id: 'ACO-C01', label: 'בדיקת רעש סביבתי',                  subLabel: 'NOI-ENV | ₪1600' },
  { id: 'ACO-C02', label: 'בדיקת מעבר קול בין דירות',          subLabel: 'SND-APT | ₪1400' },
  { id: 'RDN-C01', label: 'בדיקת ראדון 90 יום',                subLabel: 'RDN-90D | ₪850'  },
  { id: 'RDN-C02', label: 'בדיקת ראדון קצרה 48 שעות',          subLabel: 'RDN-48H | ₪550'  },
  { id: 'IAQ-C01', label: 'בדיקת איכות אוויר פנים מבנה',       subLabel: 'AIR-IND | ₪1100' },
  { id: 'IAQ-C02', label: 'דיגום עובש באוויר',                 subLabel: 'MOL-SMP | ₪850'  },
  { id: 'ASB-C01', label: 'סקר אסבסט',                         subLabel: 'ASB-SRV | ₪2200' },
  { id: 'ACO-C03', label: 'ייעוץ אקוסטי לפרויקט',             subLabel: 'ACO-CNS | ₪700'  },
];

/* ─── Tailwind helper classes (matching interaction-new-screen style) ─ */
const sectionCls = 'rounded-lg border border-slate-200 bg-slate-50/90 p-3';
const sectionTitle = 'text-sm font-bold text-slate-800 mb-2 pb-1 border-b border-slate-200';
const fieldLabel = 'block text-xs font-medium text-slate-600 mb-0.5';
const fieldInput = 'w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-300';

/* ─── line item type ─────────────────────────────────────────────────── */
type LineItem = {
  id: string;
  code: string;
  sku: string;
  description: string;
  channel: string;
  qty: string;
  price: string;
  discount: string;
};

function emptyLine(): LineItem {
  return { id: uid(), code: '', sku: '', description: '', channel: '', qty: '1', price: '0', discount: '0' };
}

function lineTotal(li: LineItem): number {
  const q = parseFloat(li.qty) || 0;
  const p = parseFloat(li.price) || 0;
  const d = parseFloat(li.discount) || 0;
  return q * p * (1 - d / 100);
}

/* ─── header form type ───────────────────────────────────────────────── */
type F = {
  orderCode: string;
  orderDate: string;
  trackDate: string;
  status: string;
  customerId: string;
  customerName: string;
  customerType: string;
  contactId: string;
  contactName: string;
  salesRepId: string;
  salesRepName: string;
  executorId: string;
  executorName: string;
  linkedId: string;
  parentOrderId: string;
  priceListId: string;
  priceListName: string;
  reference: string;
  rate: string;
  quoteId: string;
  address: string;
  // delivery
  deliveryLocation: string;
  coordinateWith: string;
  promisedByDate: string;
  deliveryDate: string;
  deliveryPhone: string;
  approvalDate: string;
  // discount / vat
  discountPct: string;
  vatPct: string;
};

function initForm(): F {
  return {
    orderCode: '', orderDate: todayDmy(), trackDate: todayDmy(), status: 'פתוחה',
    customerId: '', customerName: '', customerType: 'לקוחות בחברה',
    contactId: '', contactName: '',
    salesRepId: '', salesRepName: '',
    executorId: '', executorName: '',
    linkedId: '', parentOrderId: '',
    priceListId: '', priceListName: '',
    reference: '', rate: '1.0000', quoteId: '',
    address: '',
    deliveryLocation: '', coordinateWith: '',
    promisedByDate: todayDmy(), deliveryDate: todayDmy(),
    deliveryPhone: '', approvalDate: todayDmy(),
    discountPct: '0', vatPct: '18',
  };
}

/* ─── old-style toolbar (kept as no-op export for backward compat) ─── */
export function OrderOldStyleToolbar(_props: { onExit?: () => void }) {
  return null;
}

/* ─── main component ─────────────────────────────────────────────────── */
export function OrderNewScreen({
  embedded,
  onExit,
  prefillCustomer,
  prefillContactId,
  prefillContactName,
}: {
  embedded?: boolean;
  onExit?: () => void;
  prefillCustomer?: { id: string; name: string };
  prefillContactId?: string | null;
  prefillContactName?: string;
}) {
  const [form, setForm] = useState<F>(initForm);
  const [lines, setLines] = useState<LineItem[]>([emptyLine()]);
  const [selectedLineIdx, setSelectedLineIdx] = useState<number | null>(0);
  const [bottomTab, setBottomTab] = useState<'delivery' | 'misc' | 'notes' | 'billing' | 'linked' | 'accounts'>('delivery');
  const rootRef = useRef<HTMLElement>(null);

  /* prefill */
  useEffect(() => {
    if (!prefillCustomer) return;
    setForm((p) => ({
      ...p,
      customerName: prefillCustomer.name,
      customerId: prefillCustomer.id,
      contactName: prefillContactName ?? '',
      contactId: prefillContactId ?? '',
    }));
  }, [prefillCustomer?.id, prefillContactId, prefillContactName]);

  /* scroll to top on mount */
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    let el: HTMLElement | null = rootRef.current?.parentElement ?? null;
    while (el) {
      const ov = window.getComputedStyle(el).overflowY;
      if (ov === 'auto' || ov === 'scroll') { el.scrollTop = 0; break; }
      el = el.parentElement;
    }
  }, []);

  const set = (field: keyof F) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((p) => ({ ...p, [field]: e.target.value }));

  const setLine = (idx: number, field: keyof LineItem) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setLines((prev) => prev.map((l, i) => i === idx ? { ...l, [field]: e.target.value } : l));
    };

  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (idx: number) =>
    setLines((prev) => prev.length === 1 ? prev : prev.filter((_, i) => i !== idx));

  /* ─── totals ──────────────────────────────────────────────────────── */
  const subtotal = lines.reduce((s, l) => s + lineTotal(l), 0);
  const discAmt = subtotal * (parseFloat(form.discountPct) || 0) / 100;
  const afterDisc = subtotal - discAmt;
  const vatAmt = afterDisc * (parseFloat(form.vatPct) || 0) / 100;
  const total = afterDisc + vatAmt;

  /* ─── contact picker ─────────────────────────────────────────────── */
  const [contactPickerOpen, setContactPickerOpen] = useState(false);
  const [contactRows, setContactRows] = useState<QuoteLookupRow[]>([]);

  async function openContactPicker() {
    const customerId = form.customerId;
    if (!customerId) return;
    let authUser: { id: string; role: string } | undefined;
    try {
      const raw = localStorage.getItem('galit-crm-session');
      if (raw) { const p = JSON.parse(raw); if (p?.id && p?.role) authUser = { id: p.id, role: p.role }; }
    } catch (_) { /* ignore */ }
    try {
      const res = await apiFetch(apiUrl(`/customers/${customerId}/contacts`), { method: 'GET', authUser: authUser ?? null });
      if (res.ok) {
        const data = await res.json();
        setContactRows((Array.isArray(data) ? data : data.contacts ?? []).map(
          (c: { id: string; fullName?: string; phone?: string }) => ({
            id: c.id, label: c.fullName ?? c.id,
            subLabel: c.phone || undefined,
          })
        ));
      } else { setContactRows([]); }
    } catch (_) { setContactRows([]); }
    setContactPickerOpen(true);
  }

  /* ─── product picker ─────────────────────────────────────────────── */
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [productPickerLineIdx, setProductPickerLineIdx] = useState<number | null>(null);

  function openProductPicker(idx: number) {
    setProductPickerLineIdx(idx);
    setProductPickerOpen(true);
  }

  /* ─── render ─────────────────────────────────────────────────────── */
  return (
    <main ref={rootRef} dir="rtl" className="space-y-3 p-2">

      {/* ── compact toolbar (matches interaction screen) ────────── */}
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
        {onExit && (
          <button type="button" onClick={onExit} className="rounded bg-slate-600 px-3 py-1 text-xs font-medium text-white hover:bg-slate-700">
            חזרה
          </button>
        )}
        <button type="button" className="rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700">שמור</button>
        <div className="flex-1" />
        <span className="text-xs text-slate-500">הזמנה</span>
        {form.orderCode && <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">#{form.orderCode}</span>}
      </div>

      {/* ═══ SECTION 1: פרטי הזמנה ═══ */}
      <div className={sectionCls}>
        <div className={sectionTitle}>פרטי הזמנה</div>
        <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className={fieldLabel}>תאריך</label>
            <input className={fieldInput} value={form.orderDate} onChange={set('orderDate')} />
          </div>
          <div>
            <label className={fieldLabel}>תאריך מעקב</label>
            <input className={fieldInput} value={form.trackDate} onChange={set('trackDate')} />
          </div>
          <div>
            <label className={fieldLabel}>סטטוס</label>
            <select className={fieldInput} value={form.status} onChange={set('status')}>
              <option>פתוחה</option>
              <option>סגורה</option>
              <option>מבוטלת</option>
              <option>בביצוע</option>
            </select>
          </div>
          <div>
            <label className={fieldLabel}>סוג לקוח</label>
            <select className={fieldInput} value={form.customerType} onChange={set('customerType')}>
              <option>לקוחות בחברה</option>
              <option>פרטי</option>
              <option>ממשלתי</option>
            </select>
          </div>
        </div>
      </div>

      {/* ═══ SECTION 2: לקוח ואיש קשר ═══ */}
      <div className={sectionCls}>
        <div className={sectionTitle}>לקוח ואיש קשר</div>
        <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className={fieldLabel}>לקוח</label>
            <input className={fieldInput} value={form.customerName} onChange={set('customerName')} />
          </div>
          <div>
            <label className={fieldLabel}>איש קשר</label>
            <div className="flex items-center gap-1">
              <input className={fieldInput + ' flex-1'} value={form.contactName} onChange={set('contactName')} />
              <button type="button" onClick={openContactPicker} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-indigo-600 hover:bg-slate-50" title="בחר איש קשר">👤</button>
            </div>
          </div>
          <div>
            <label className={fieldLabel}>כתובת</label>
            <input className={fieldInput} value={form.address} onChange={set('address')} />
          </div>
          <div>
            <label className={fieldLabel}>נציג מכירה</label>
            <input className={fieldInput} value={form.salesRepName} onChange={set('salesRepName')} />
          </div>
          <div>
            <label className={fieldLabel}>מבצע</label>
            <input className={fieldInput} value={form.executorName} onChange={set('executorName')} />
          </div>
          <div>
            <label className={fieldLabel}>הצעה</label>
            <input className={fieldInput} value={form.quoteId} onChange={set('quoteId')} />
          </div>
        </div>
        {/* hidden fields preserved */}
        <div className="hidden">
          <input value={form.customerId} onChange={set('customerId')} />
          <input value={form.contactId} onChange={set('contactId')} />
          <input value={form.salesRepId} onChange={set('salesRepId')} />
          <input value={form.executorId} onChange={set('executorId')} />
          <input value={form.linkedId} onChange={set('linkedId')} />
          <input value={form.parentOrderId} onChange={set('parentOrderId')} />
          <input value={form.priceListId} onChange={set('priceListId')} />
          <input value={form.priceListName} onChange={set('priceListName')} />
          <input value={form.reference} onChange={set('reference')} />
          <input value={form.rate} onChange={set('rate')} />
        </div>
      </div>

      {/* ═══ SECTION 3: פריטים ═══ */}
      <div className={sectionCls}>
        <div className="flex items-center justify-between mb-2 pb-1 border-b border-slate-200">
          <span className="text-sm font-bold text-slate-800">פריטים</span>
          <div className="flex items-center gap-1">
            <button type="button" onClick={addLine} className="rounded bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-emerald-700">+ שורה</button>
            <button type="button" onClick={() => selectedLineIdx !== null && removeLine(selectedLineIdx)} className="rounded bg-red-500 px-2 py-0.5 text-xs font-medium text-white hover:bg-red-600">× מחק</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs" dir="rtl">
            <thead>
              <tr className="bg-emerald-700 text-white">
                {['קוד', 'מק"ט', 'תאור המוצר', 'ערוץ', 'כמות', 'מחיר', 'הנחה%', 'סה"כ'].map((h) => (
                  <th key={h} className="border border-emerald-600 px-2 py-1 text-right font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((li, idx) => {
                const tot = lineTotal(li);
                const sel = selectedLineIdx === idx;
                return (
                  <tr key={li.id} className={sel ? 'bg-emerald-50' : idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} onClick={() => setSelectedLineIdx(idx)}>
                    <td className="border border-slate-200 px-0 py-0">
                      <input className="w-14 border-none bg-transparent px-1 py-0.5 text-xs outline-none" value={li.code} onChange={setLine(idx, 'code')} />
                    </td>
                    <td className="border border-slate-200 px-0 py-0">
                      <input className="w-16 border-none bg-transparent px-1 py-0.5 text-xs outline-none" value={li.sku} onChange={setLine(idx, 'sku')} />
                    </td>
                    <td className="border border-slate-200 px-0 py-0">
                      <div className="flex items-center">
                        <input className="min-w-[120px] flex-1 border-none bg-transparent px-1 py-0.5 text-xs outline-none" value={li.description} onChange={setLine(idx, 'description')} list={`order-catalog-list-${idx}`} />
                        <datalist id={`order-catalog-list-${idx}`}>
                          {PRODUCT_ROWS.map((p) => <option key={p.id} value={p.label} />)}
                        </datalist>
                        <button type="button" className="px-1 text-xs text-indigo-500 hover:text-indigo-700" onClick={() => openProductPicker(idx)}>🔍</button>
                      </div>
                    </td>
                    <td className="border border-slate-200 px-0 py-0">
                      <input className="w-16 border-none bg-transparent px-1 py-0.5 text-xs outline-none" value={li.channel} onChange={setLine(idx, 'channel')} />
                    </td>
                    <td className="border border-slate-200 px-0 py-0">
                      <input className="w-12 border-none bg-transparent px-1 py-0.5 text-center text-xs outline-none" value={li.qty} onChange={setLine(idx, 'qty')} />
                    </td>
                    <td className="border border-slate-200 px-0 py-0">
                      <input className="w-16 border-none bg-transparent px-1 py-0.5 text-left text-xs outline-none" value={li.price} onChange={setLine(idx, 'price')} />
                    </td>
                    <td className="border border-slate-200 px-0 py-0">
                      <input className="w-12 border-none bg-transparent px-1 py-0.5 text-center text-xs outline-none" value={li.discount} onChange={setLine(idx, 'discount')} />
                    </td>
                    <td className="border border-slate-200 px-2 py-0.5 text-left whitespace-nowrap font-medium">
                      ₪{tot.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══ SECTION 4: סיכום ואספקה ═══ */}
      <div className="grid gap-3 lg:grid-cols-3">

        {/* סיכום כספי */}
        <div className={sectionCls}>
          <div className={sectionTitle}>סיכום כספי</div>
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-600">סה"כ ללא מע"מ</span>
              <span className="font-medium">₪{subtotal.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-600">הנחה %</span>
              <div className="flex items-center gap-1">
                <input className="w-12 rounded border border-slate-300 px-1 py-0.5 text-center text-xs outline-none focus:border-emerald-400" value={form.discountPct} onChange={set('discountPct')} />
                <span className="text-slate-400">₪{discAmt.toFixed(2)}</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">סה"כ לאחר הנחה</span>
              <span className="font-medium">₪{afterDisc.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-600">מע"מ %</span>
              <input className="w-12 rounded border border-slate-300 px-1 py-0.5 text-center text-xs outline-none focus:border-emerald-400" value={form.vatPct} onChange={set('vatPct')} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">מע"מ</span>
              <span>₪{vatAmt.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 pt-1">
              <span className="font-bold text-slate-800">סה"כ לתשלום</span>
              <span className="font-bold text-emerald-700">₪{total.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* נתוני אספקה */}
        <div className={sectionCls + ' lg:col-span-2'}>
          <div className={sectionTitle}>נתוני אספקה</div>
          <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
            <div>
              <label className={fieldLabel}>מקום אספקה</label>
              <input className={fieldInput} value={form.deliveryLocation} onChange={set('deliveryLocation')} />
            </div>
            <div>
              <label className={fieldLabel}>הובטח עד</label>
              <input className={fieldInput} value={form.promisedByDate} onChange={set('promisedByDate')} />
            </div>
            <div>
              <label className={fieldLabel}>לתאום עם</label>
              <input className={fieldInput} value={form.coordinateWith} onChange={set('coordinateWith')} />
            </div>
            <div>
              <label className={fieldLabel}>תאריך אספקה</label>
              <input className={fieldInput} value={form.deliveryDate} onChange={set('deliveryDate')} />
            </div>
            <div>
              <label className={fieldLabel}>טלפון</label>
              <input className={fieldInput} value={form.deliveryPhone} onChange={set('deliveryPhone')} />
            </div>
            <div>
              <label className={fieldLabel}>תאריך אישור</label>
              <input className={fieldInput} value={form.approvalDate} onChange={set('approvalDate')} />
            </div>
          </div>
        </div>
      </div>

      {/* ═══ SECTION 5: הערות ═══ */}
      <div className={sectionCls}>
        <div className={sectionTitle}>הערות</div>
        <textarea
          className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-300"
          rows={3}
          placeholder="הערות, פרטים נוספים..."
          dir="rtl"
        />
      </div>

      {/* ── contact picker modal ─────────────────────────────────── */}
      <QuoteLookupModal
        open={contactPickerOpen}
        title="בחר איש קשר"
        rows={contactRows}
        allowClear
        emptyMessage="אין אנשי קשר ללקוח זה"
        onClose={() => setContactPickerOpen(false)}
        onSelect={(r) => {
          if (r) setForm((p) => ({ ...p, contactName: r.label, contactId: r.id }));
          else setForm((p) => ({ ...p, contactName: '', contactId: '' }));
        }}
      />

      {/* ── product picker modal ─────────────────────────────────── */}
      <QuoteLookupModal
        open={productPickerOpen}
        title="בחר מוצר"
        rows={PRODUCT_ROWS}
        allowClear
        emptyMessage="אין מוצרים"
        onClose={() => setProductPickerOpen(false)}
        onSelect={(r) => {
          if (productPickerLineIdx !== null && r) {
            setLines((prev) => prev.map((l, i) =>
              i === productPickerLineIdx
                ? { ...l, description: r.label, code: r.id, sku: r.subLabel?.split(' | ')[0] ?? '' }
                : l
            ));
          }
        }}
      />
    </main>
  );
}
