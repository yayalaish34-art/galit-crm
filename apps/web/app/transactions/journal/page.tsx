'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch, apiUrl } from '../../lib/api-base';
import { parseApiErrorResponse } from '../../lib/api-error';

type SessionUser = { id: string; role: string };
type TxRow = {
  id: string;
  number?: string | null;
  status?: string | null;
  workStatus?: string | null;
  weekday?: string | null;
  date?: string | null;
  customerName?: string | null;
  contactName?: string | null;
  linkedCustomerName?: string | null;
  transactionType?: string | null;
  productName?: string | null;
  quantity?: string | number | null;
  price?: string | number | null;
  deliveryLocation?: string | null;
  coordinateDay?: string | null;
  phone?: string | null;
  basketOrRefNumber?: string | null; // TODO: label partially unclear in source ("מספר סל/לש")
  stage?: string | null;
  supplierName?: string | null;
  deliveryDate?: string | null;
};

const SESSION_KEY = 'galit-crm-session';

function readSession(): SessionUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const x = JSON.parse(raw) as Partial<SessionUser>;
    if (!x.id || !x.role) return null;
    return { id: x.id, role: x.role };
  } catch {
    return null;
  }
}

function fmtDate(v?: string | null): string {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('he-IL');
}

const columns: Array<{ key: keyof TxRow; label: string }> = [
  { key: 'number', label: 'מספר' },
  { key: 'status', label: 'מצב' },
  { key: 'workStatus', label: 'סטטוס עבודה' },
  { key: 'weekday', label: 'יום' },
  { key: 'date', label: 'תאריך' },
  { key: 'customerName', label: 'לקוח' },
  { key: 'contactName', label: 'איש קשר' },
  { key: 'linkedCustomerName', label: 'לקוח המקושר' },
  { key: 'transactionType', label: 'סוג עסקה' },
  { key: 'productName', label: 'מוצר' },
  { key: 'quantity', label: 'כמות' },
  { key: 'price', label: 'מחיר' },
  { key: 'deliveryLocation', label: 'מקום אספקה' },
  { key: 'coordinateDay', label: 'לתאם יום' },
  { key: 'phone', label: 'טלפון' },
  { key: 'basketOrRefNumber', label: 'מספר סל/לש' }, // TODO: screenshot label is partially unclear
];

export default function TransactionsJournalPage() {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [rows, setRows] = useState<TxRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [stage, setStage] = useState('');
  const [status, setStatus] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [searchA, setSearchA] = useState('');
  const [searchB, setSearchB] = useState('');
  const [dropA, setDropA] = useState('');
  const [dropB, setDropB] = useState('');
  const [txDateFrom, setTxDateFrom] = useState('');
  const [txDateTo, setTxDateTo] = useState('');
  const [deliveryFrom, setDeliveryFrom] = useState('');
  const [deliveryTo, setDeliveryTo] = useState('');
  const [dateMode, setDateMode] = useState('תאריך עסקה');
  const [customer, setCustomer] = useState('');
  const [product, setProduct] = useState('');
  const [supplier, setSupplier] = useState('');
  const [weekday, setWeekday] = useState('');
  const [textSearch, setTextSearch] = useState('');

  useEffect(() => setSession(readSession()), []);
  const selected = useMemo(() => rows.find((r) => r.id === selectedId) ?? null, [rows, selectedId]);
  void selected;

  const load = async () => {
    if (!session) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (dateMode === 'תאריך עסקה') {
        if (txDateFrom) params.set('fromDate', txDateFrom);
        if (txDateTo) params.set('toDate', txDateTo);
      } else {
        if (deliveryFrom) params.set('fromDeliveryDate', deliveryFrom);
        if (deliveryTo) params.set('toDeliveryDate', deliveryTo);
      }
      if (customer.trim()) params.set('customer', customer.trim());
      if (product.trim()) params.set('product', product.trim());
      if (supplier.trim()) params.set('supplier', supplier.trim());
      if (stage.trim()) params.set('stage', stage.trim());
      if (status.trim()) params.set('status', status.trim());
      const text = [textSearch, dateFilter, searchA, searchB, dropA, dropB, weekday].map((x) => x.trim()).filter(Boolean).join(' ');
      if (text) params.set('text', text);

      const res = await apiFetch(apiUrl(`/transactions/journal?${params.toString()}`), { authUser: session });
      if (!res.ok) throw new Error(await parseApiErrorResponse(res));
      const data = (await res.json()) as TxRow[];
      setRows(Array.isArray(data) ? data : []);
      setSelectedId((prev) => (prev && data.some((r) => r.id === prev) ? prev : data[0]?.id ?? null));
    } catch (e) {
      const m = e instanceof Error ? e.message : '';
      setError(m || 'טעינת יומן עסקאות נכשלה');
      setRows([]);
      setSelectedId(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!session) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  return (
    <main className="min-h-screen bg-[#ececec] p-3 text-slate-800" dir="rtl">
      <div className="mx-auto max-w-[1550px] rounded border border-slate-300 bg-[#f3f3f3]">
        <header className="border-b border-slate-300 bg-[#efefef] px-3 py-2 text-sm font-semibold">יומן עסקאות</header>

        <section className="grid grid-cols-1 gap-3 border-b border-slate-300 p-3 lg:grid-cols-3">
          <div className="space-y-2 rounded border border-slate-300 bg-white p-2">
            <SelectField label="שלבים" value={stage} onChange={setStage} options={['', 'ראשוני', 'המשך']} />
            <SelectField label="מצב" value={status} onChange={setStatus} options={['', 'פתוחה', 'סגורה', 'מעובדת', 'מעובדת ידני']} />
          </div>

          <div className="space-y-2 rounded border border-slate-300 bg-white p-2">
            <Field label="תאריך" value={dateFilter} onChange={setDateFilter} />
            <SearchField value={searchA} onChange={setSearchA} />
            <SearchField value={searchB} onChange={setSearchB} />
            <SelectField label="" value={dropA} onChange={setDropA} options={['', 'כללי']} />
            <SelectField label="" value={dropB} onChange={setDropB} options={['', 'כללי']} />
          </div>

          <div className="space-y-2 rounded border border-slate-300 bg-white p-2">
            <div className="flex items-center gap-2 text-xs">
              <label className="flex items-center gap-1">
                <input type="radio" name="dateMode" checked={dateMode === 'תאריך עסקה'} onChange={() => setDateMode('תאריך עסקה')} />
                תאריך עסקה
              </label>
              <label className="flex items-center gap-1">
                <input type="radio" name="dateMode" checked={dateMode === 'ת. אספקה'} onChange={() => setDateMode('ת. אספקה')} />
                ת. אספקה
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <DateField label="מ־" value={txDateFrom} onChange={setTxDateFrom} />
              <DateField label="עד" value={txDateTo} onChange={setTxDateTo} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <DateField label="מ־" value={deliveryFrom} onChange={setDeliveryFrom} />
              <DateField label="עד" value={deliveryTo} onChange={setDeliveryTo} />
            </div>
            <Field label="לקוח" value={customer} onChange={setCustomer} />
            <Field label="מוצר" value={product} onChange={setProduct} />
            <Field label="ספק" value={supplier} onChange={setSupplier} />
            <Field label="יום בשבוע" value={weekday} onChange={setWeekday} />
          </div>
        </section>

        <section className="flex flex-wrap items-end gap-2 border-b border-slate-300 p-3">
          <div className="min-w-[260px] flex-1">
            <Field label="" value={textSearch} onChange={setTextSearch} />
          </div>
          <button type="button" className="h-8 rounded border border-blue-700 bg-blue-700 px-4 text-xs font-semibold text-white" onClick={() => void load()} disabled={loading}>
            {loading ? 'טוען...' : 'סינון'}
          </button>
          {error ? <span className="text-xs text-red-700">{error}</span> : null}
        </section>

        <section className="p-2">
          <div className="max-h-[430px] overflow-auto border border-slate-300 bg-white">
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 bg-[#2563eb] text-white">
                <tr>
                  {columns.map((c) => (
                    <th key={c.label} className="border border-[#93c5fd] px-2 py-1 text-right font-semibold">{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={selectedId === r.id ? 'bg-blue-100' : 'hover:bg-slate-50'} onClick={() => setSelectedId(r.id)}>
                    {columns.map((c) => (
                      <td key={c.label} className="border border-slate-200 px-2 py-1">
                        {c.key === 'date' ? fmtDate(r.date) : String(r[c.key] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
                {!loading && rows.length === 0 ? (
                  <tr><td colSpan={columns.length} className="px-2 py-3 text-center text-slate-500">אין נתונים להצגה</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-xs">
      <div className="mb-1 min-h-[1rem]">{label || '\u00A0'}</div>
      <input className="w-full rounded border border-slate-300 px-2 py-1 text-xs" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function SearchField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1">
      <input className="w-full rounded border border-slate-300 px-2 py-1 text-xs" value={value} onChange={(e) => onChange(e.target.value)} />
      <span className="rounded border border-slate-300 px-2 py-1 text-[10px] text-slate-500">🔍</span>
    </div>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="text-xs">
      <div className="mb-1">{label}</div>
      <input type="date" className="w-full rounded border border-slate-300 px-2 py-1" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <label className="block text-xs">
      <div className="mb-1 min-h-[1rem]">{label || '\u00A0'}</div>
      <select className="w-full rounded border border-slate-300 px-2 py-1 text-xs" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o} value={o}>{o || '---'}</option>)}
      </select>
    </label>
  );
}
