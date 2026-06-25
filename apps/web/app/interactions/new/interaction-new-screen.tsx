'use client';
import React, { useState, useEffect, useRef } from 'react';
import { QuoteLookupModal, QuoteLookupRow } from '../../quotes/new/quote-lookup-modal';
import { apiFetch, apiUrl } from '../../lib/api-base';

/* ─── helpers ─────────────────────────────────────────────────────── */
function todayDmy(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
function nowHms(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}
const DAY_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

/* ─── shared mini-styles ──────────────────────────────────────────── */
const inp: React.CSSProperties = {
  border: '1px solid #adadad',
  background: '#fff',
  padding: '1px 3px',
  fontSize: 12,
  height: 20,
  outline: 'none',
  boxSizing: 'border-box',
};
const lbl: React.CSSProperties = {
  fontSize: 12,
  color: '#000',
  whiteSpace: 'nowrap',
  marginRight: 2,
};
const row: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: 2,
  marginBottom: 3,
  direction: 'rtl',
};
const iconBtn: React.CSSProperties = {
  border: '1px solid #adadad',
  background: '#f0f0f0',
  padding: '1px 3px',
  cursor: 'pointer',
  fontSize: 11,
  height: 20,
  lineHeight: '16px',
  flexShrink: 0,
};
const sectionBox: React.CSSProperties = {
  border: '1px solid #a0a0a0',
  marginBottom: 4,
  padding: '4px 6px 4px 6px',
  background: '#f9f9f9',
};
const legendStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#006',
  fontWeight: 'bold',
  padding: '0 4px',
};
const tabBtnActive: React.CSSProperties = {
  border: '1px solid #a0a0a0',
  borderBottom: '1px solid #f9f9f9',
  background: '#f9f9f9',
  padding: '2px 10px',
  fontSize: 12,
  cursor: 'pointer',
  marginRight: 2,
  marginBottom: -1,
  zIndex: 1,
  position: 'relative',
};
const tabBtnInactive: React.CSSProperties = {
  border: '1px solid #a0a0a0',
  background: '#e0e0e0',
  padding: '2px 10px',
  fontSize: 12,
  cursor: 'pointer',
  marginRight: 2,
  marginBottom: -1,
  position: 'relative',
};

/* ─── product catalog (mirrors quote-new-screen catalog) ─────────── */
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

/* ─── sub-components ──────────────────────────────────────────────── */
function Srch({ onClick }: { onClick?: () => void }) {
  return <button type="button" style={iconBtn} onClick={onClick}>🔍</button>;
}
function Person({ onClick }: { onClick?: () => void }) {
  return <button type="button" style={iconBtn} onClick={onClick}>👤</button>;
}
function Arrow() {
  return <button type="button" style={iconBtn}>▼</button>;
}

/* ─── form state ──────────────────────────────────────────────────── */
type F = {
  code: string;
  reportDate: string;
  typeCode: string;
  // פרטי לקוח
  customerName: string; customerId: string;
  contactName: string;  contactId: string;
  budgetCustomer: string; budgetCustomerId: string;
  phone: string;
  executor: string;    executorId: string;
  salesRep: string;    salesRepId: string;
  source: string;      sourceId: string;
  priority: string;
  // פרטי פעילות
  activity: string;    activityId: string;
  product: string;     productId: string;
  dueDate: string;
  startTime: string;
  endTime: string;
  dayOfWeek: string;
  actualDate: string;
  changeDate: string;
  changeTime: string;
  done: boolean;
  deal: boolean;
  // פרטים נוספים
  reference: string;
  linkedNumber: string;
  // outlook
  location: string;
  showTime: string;
  reminderBefore: string;
  lastUser: string;
  hour: string;
};

function initForm(): F {
  return {
    code: '', reportDate: todayDmy(), typeCode: '',
    customerName: '', customerId: '',
    contactName: '', contactId: '',
    budgetCustomer: '', budgetCustomerId: '',
    phone: '',
    executor: '', executorId: '',
    salesRep: '', salesRepId: '',
    source: '', sourceId: '',
    priority: '',
    activity: '', activityId: '',
    product: '', productId: '',
    dueDate: todayDmy(),
    startTime: nowHms(),
    endTime: nowHms(),
    dayOfWeek: DAY_HE[new Date().getDay()],
    actualDate: '', changeDate: '', changeTime: '',
    done: false, deal: false,
    reference: '', linkedNumber: '',
    location: '', showTime: '', reminderBefore: '',
    lastUser: '', hour: '',
  };
}

/* ─── main component ──────────────────────────────────────────────── */
export function InteractionNewScreen({
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
  const [activeTab, setActiveTab] = useState<'extra' | 'notes' | 'forecast' | 'more'>('extra');
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    let el: HTMLElement | null = rootRef.current?.parentElement ?? null;
    while (el) {
      const ov = window.getComputedStyle(el).overflowY;
      if (ov === 'auto' || ov === 'scroll') { el.scrollTop = 0; break; }
      el = el.parentElement;
    }
  }, []);

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

  const set = (field: keyof F) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((p) => ({ ...p, [field]: e.target.value }));

  const setCheck = (field: keyof F) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((p) => ({ ...p, [field]: e.target.checked }));

  /* ─── contact picker ──────────────────────────────────────────── */
  const [contactPickerOpen, setContactPickerOpen] = useState(false);
  const [contactRows, setContactRows] = useState<QuoteLookupRow[]>([]);

  async function openContactPicker() {
    const customerId = form.customerId;
    if (!customerId) return;

    let authUser: { id: string; role: string } | undefined;
    try {
      const raw = localStorage.getItem('galit-crm-session');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.id && parsed?.role) authUser = { id: parsed.id, role: parsed.role };
      }
    } catch (_) { /* ignore */ }

    try {
      const res = await apiFetch(apiUrl(`/customers/${customerId}/contacts`), {
        method: 'GET',
        authUser: authUser ?? null,
      });
      if (res.ok) {
        const data = await res.json();
        const rows: QuoteLookupRow[] = (Array.isArray(data) ? data : data.contacts ?? []).map(
          (c: { id: string; fullName?: string; phone?: string; email?: string }) => ({
            id: c.id,
            label: c.fullName ?? c.id,
            subLabel: [c.phone, c.email].filter(Boolean).join(' | ') || undefined,
          })
        );
        setContactRows(rows);
      } else {
        setContactRows([]);
      }
    } catch (_) {
      setContactRows([]);
    }
    setContactPickerOpen(true);
  }

  /* ─── product picker ──────────────────────────────────────────── */
  const [productPickerOpen, setProductPickerOpen] = useState(false);

  function openProductPicker() {
    setProductPickerOpen(true);
  }

  /* ─── Tailwind class helpers ──────────────────────────────────── */
  const inputCls = 'w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200';
  const labelCls = 'block text-xs font-medium text-slate-600 mb-0.5';
  const sectionCls = 'rounded-lg border border-slate-200 bg-slate-50/90 p-3 mb-3';
  const sectionTitle = 'text-sm font-bold text-slate-800 mb-2 pb-1 border-b border-slate-200';

  return (
    <main ref={rootRef} dir="rtl" className="space-y-3 p-2">
      {/* ── compact toolbar ──────────────────────────────────── */}
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
        {onExit && (
          <button type="button" onClick={onExit} className="rounded bg-slate-600 px-3 py-1 text-xs font-medium text-white hover:bg-slate-700">
            חזרה
          </button>
        )}
        <button type="button" className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700">שמור</button>
        <div className="flex-1" />
        <span className="text-xs text-slate-500">פנייה / התקשרות</span>
        {form.code && <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">#{form.code}</span>}
      </div>

      {/* ═══ SECTION 1: פרטי לקוח ═══ */}
      <div className={sectionCls}>
        <div className={sectionTitle}>פרטי לקוח</div>
        <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          {/* לקוח */}
          <div>
            <label className={labelCls}>לקוח</label>
            <input className={inputCls} value={form.customerName} onChange={set('customerName')} placeholder="שם לקוח" />
          </div>
          {/* איש קשר */}
          <div>
            <label className={labelCls}>איש קשר</label>
            <div className="flex items-center gap-1">
              <input className={inputCls} value={form.contactName} onChange={set('contactName')} placeholder="איש קשר" />
              <button type="button" onClick={openContactPicker} className="shrink-0 rounded border border-slate-300 bg-white px-1.5 py-1.5 text-xs hover:bg-slate-50" title="בחר איש קשר">👤</button>
            </div>
          </div>
          {/* טלפון */}
          <div>
            <label className={labelCls}>טלפון</label>
            <select className={inputCls} value={form.phone} onChange={set('phone')}>
              <option value="">—</option>
            </select>
          </div>
        </div>
      </div>

      {/* ═══ SECTION 2: פרטי פנייה ═══ */}
      <div className={sectionCls}>
        <div className={sectionTitle}>פרטי פנייה</div>
        <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          {/* תאריך */}
          <div>
            <label className={labelCls}>תאריך</label>
            <input className={inputCls} value={form.dueDate} onChange={set('dueDate')} />
          </div>
          {/* סוג */}
          <div>
            <label className={labelCls}>סוג</label>
            <input type="number" className={inputCls} value={form.typeCode} onChange={set('typeCode')} placeholder="קוד סוג" />
          </div>
          {/* עדיפות */}
          <div>
            <label className={labelCls}>עדיפות</label>
            <select className={inputCls} value={form.priority} onChange={set('priority')}>
              <option value="">—</option>
              <option value="1">גבוהה</option>
              <option value="2">רגילה</option>
              <option value="3">נמוכה</option>
            </select>
          </div>
          {/* פעילות */}
          <div>
            <label className={labelCls}>פעילות</label>
            <input className={inputCls} value={form.activity} onChange={set('activity')} placeholder="סוג פעילות" />
          </div>
          {/* מוצר */}
          <div>
            <label className={labelCls}>מוצר</label>
            <div className="flex items-center gap-1">
              <input className={inputCls} value={form.product} onChange={set('product')} placeholder="בחר מוצר" />
              <button type="button" onClick={openProductPicker} className="shrink-0 rounded border border-slate-300 bg-white px-1.5 py-1.5 text-xs hover:bg-slate-50" title="בחר מוצר">🔍</button>
            </div>
          </div>
          {/* סטטוס (בוצע/עסקה) */}
          <div>
            <label className={labelCls}>סטטוס</label>
            <div className="flex items-center gap-4 pt-1.5">
              <label className="flex items-center gap-1.5 text-xs text-slate-700">
                <input type="checkbox" checked={form.done} onChange={setCheck('done')} className="rounded" />
                בוצע
              </label>
              <label className="flex items-center gap-1.5 text-xs text-slate-700">
                <input type="checkbox" checked={form.deal} onChange={setCheck('deal')} className="rounded" />
                עסקה
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ SECTION 3: תיאור / הערות ═══ */}
      <div className={sectionCls}>
        <div className={sectionTitle}>תיאור / הערות</div>
        <textarea
          className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200"
          rows={3}
          placeholder="הערות, תיאור הפנייה, פרטים נוספים..."
          value={form.reference}
          onChange={set('reference')}
        />
      </div>

      {/* ═══ HIDDEN fields — preserved for save/validation, not visible ═══ */}
      <div className="hidden">
        {/* פרטי לקוח hidden */}
        <input value={form.customerId} onChange={set('customerId')} />
        <input value={form.contactId} onChange={set('contactId')} />
        <input value={form.budgetCustomer} onChange={set('budgetCustomer')} />
        <input value={form.budgetCustomerId} onChange={set('budgetCustomerId')} />
        <input value={form.executor} onChange={set('executor')} />
        <input value={form.executorId} onChange={set('executorId')} />
        <input value={form.salesRep} onChange={set('salesRep')} />
        <input value={form.salesRepId} onChange={set('salesRepId')} />
        <input value={form.source} onChange={set('source')} />
        <input value={form.sourceId} onChange={set('sourceId')} />
        {/* פרטי פעילות hidden */}
        <input value={form.code} onChange={set('code')} />
        <input value={form.reportDate} onChange={set('reportDate')} />
        <input value={form.activityId} onChange={set('activityId')} />
        <input value={form.productId} onChange={set('productId')} />
        <input value={form.startTime} onChange={set('startTime')} />
        <input value={form.endTime} onChange={set('endTime')} />
        <input value={form.dayOfWeek} onChange={set('dayOfWeek')} />
        <input value={form.actualDate} onChange={set('actualDate')} />
        <input value={form.changeDate} onChange={set('changeDate')} />
        <input value={form.changeTime} onChange={set('changeTime')} />
        <input value={form.linkedNumber} onChange={set('linkedNumber')} />
        {/* Outlook hidden */}
        <input value={form.location} onChange={set('location')} />
        <input value={form.showTime} onChange={set('showTime')} />
        <input value={form.reminderBefore} onChange={set('reminderBefore')} />
        <input value={form.lastUser} onChange={set('lastUser')} />
        <input value={form.hour} onChange={set('hour')} />
      </div>

      {/* ── product picker modal ─────────────────────────────────── */}
      <QuoteLookupModal
        open={productPickerOpen}
        title="בחר מוצר"
        rows={PRODUCT_ROWS}
        allowClear={true}
        emptyMessage="אין מוצרים"
        onClose={() => setProductPickerOpen(false)}
        onSelect={(row) => {
          if (row) {
            setForm((p) => ({ ...p, product: row.label, productId: row.id }));
          } else {
            setForm((p) => ({ ...p, product: '', productId: '' }));
          }
        }}
      />

      {/* ── contact picker modal ─────────────────────────────────── */}
      <QuoteLookupModal
        open={contactPickerOpen}
        title="בחר איש קשר"
        rows={contactRows}
        allowClear={true}
        emptyMessage="אין אנשי קשר ללקוח זה"
        onClose={() => setContactPickerOpen(false)}
        onSelect={(row) => {
          if (row) {
            setForm((p) => ({ ...p, contactName: row.label, contactId: row.id }));
          } else {
            setForm((p) => ({ ...p, contactName: '', contactId: '' }));
          }
        }}
      />
    </main>
  );
}
