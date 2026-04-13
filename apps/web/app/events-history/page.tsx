'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch, apiUrl } from '../lib/api-base';
import { parseApiErrorResponse } from '../lib/api-error';

type SessionUser = { id: string; role: string };
type Row = {
  id: string;
  status?: string | null;
  date?: string | null;
  time?: string | null;
  customerName?: string | null;
  linkedCustomerName?: string | null;
  notes?: string | null;
  activityName?: string | null;
  productName?: string | null;
  salesRepresentativeName?: string | null;
  executorName?: string | null;
  sourceName?: string | null;
  activityTreePath?: string | null;
  productTreePath?: string | null;
  contactName?: string | null;
  phone?: string | null;
  mobilePhone?: string | null;
  customerPhone1?: string | null;
  customerPhone2?: string | null;
  customerPhone3?: string | null;
  communicationFlag?: boolean | null;
};

const SESSION_KEY = 'galit-crm-session';

function readSession(): SessionUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<SessionUser>;
    if (!s.id || !s.role) return null;
    return { id: s.id, role: s.role };
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

const columns: Array<{ key: keyof Row; label: string }> = [
  { key: 'status', label: 'מצב' },
  { key: 'date', label: 'תאריך' },
  { key: 'time', label: 'שעה' },
  { key: 'customerName', label: 'לקוח' },
  { key: 'linkedCustomerName', label: 'לקוח מקושר' },
  { key: 'notes', label: 'הערות' },
  { key: 'activityName', label: 'פעילות' },
  { key: 'productName', label: 'מוצר' },
  { key: 'salesRepresentativeName', label: 'נציג מכירה' },
  { key: 'executorName', label: 'מבצע' },
];

export default function EventsHistoryPage() {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [customer, setCustomer] = useState('');
  const [byFilter, setByFilter] = useState('');
  const [communicationFlag, setCommunicationFlag] = useState(false);
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [mobile, setMobile] = useState('');
  const [cust1, setCust1] = useState('');
  const [cust2, setCust2] = useState('');
  const [cust3, setCust3] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [activityTree, setActivityTree] = useState('');
  const [productTree, setProductTree] = useState('');
  const [memo1, setMemo1] = useState('');
  const [memo2, setMemo2] = useState('');

  useEffect(() => setSession(readSession()), []);
  const selected = useMemo(() => rows.find((r) => r.id === selectedId) ?? null, [rows, selectedId]);

  useEffect(() => {
    setMemo1(selected?.notes || '');
    setMemo2([selected?.sourceName, selected?.activityTreePath, selected?.productTreePath].filter(Boolean).join('\n'));
  }, [selected]);

  const load = async () => {
    if (!session) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (customer.trim()) params.set('customer', customer.trim());
      if (contactName.trim()) params.set('contact', contactName.trim());
      if (communicationFlag) params.set('communicationFlag', 'true');
      if (activityTree.trim()) params.set('activity', activityTree.trim());
      if (productTree.trim()) params.set('product', productTree.trim());
      if (byFilter.trim()) params.set('text', byFilter.trim());
      const textMerge = [phone, mobile, cust1, cust2, cust3, sourceName].map((x) => x.trim()).filter(Boolean).join(' ');
      if (textMerge) params.set('text', [params.get('text') || '', textMerge].join(' ').trim());
      const res = await apiFetch(apiUrl(`/events-history?${params.toString()}`), { authUser: session });
      if (!res.ok) throw new Error(await parseApiErrorResponse(res));
      const data = (await res.json()) as Row[];
      setRows(Array.isArray(data) ? data : []);
      setSelectedId((prev) => (prev && data.some((x) => x.id === prev) ? prev : data[0]?.id ?? null));
    } catch (e) {
      const m = e instanceof Error ? e.message : '';
      setError(m || 'טעינת היסטוריה / אירועים נכשלה');
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
    <main className="min-h-screen bg-[#ececec] p-2 text-slate-800" dir="rtl">
      <div className="mx-auto max-w-[1650px] rounded border border-slate-300 bg-[#f2f2f2]">
        <header className="border-b border-slate-300 bg-[#efefef] px-3 py-2 text-sm font-semibold">היסטוריה / אירועים</header>

        <section className="space-y-2 border-b border-slate-300 p-3">
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-[240px_180px_120px_1fr]">
            <Field label="לקוח" value={customer} onChange={setCustomer} />
            <SelectField label="לפי" value={byFilter} onChange={setByFilter} options={['', 'כללי']} />
            <label className="flex items-center gap-2 text-xs pt-5">
              <input type="checkbox" checked={communicationFlag} onChange={(e) => setCommunicationFlag(e.target.checked)} />
              תקשורים
            </label>
            <div />
          </div>

          <div className="rounded border border-slate-300 bg-white p-2">
            <div className="mb-2 text-xs font-semibold">פרטי איש קשר</div>
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-6">
              <Field label="שם" value={contactName} onChange={setContactName} />
              <Field label="טלפון" value={phone} onChange={setPhone} />
              <Field label="נייד" value={mobile} onChange={setMobile} />
              <Field label="טלפון לקוח 1" value={cust1} onChange={setCust1} />
              <Field label="טלפון לקוח 2" value={cust2} onChange={setCust2} />
              <Field label="טלפון לקוח 3" value={cust3} onChange={setCust3} />
            </div>
          </div>
        </section>

        <section className="p-2">
          <div className="max-h-[300px] overflow-auto border border-slate-300 bg-white">
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 bg-[#2d6ea3] text-white">
                <tr>
                  {columns.map((c) => (
                    <th key={c.label} className="border border-[#8db0cf] px-2 py-1 text-right font-semibold">{c.label}</th>
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
                {!loading && rows.length === 0 ? <tr><td colSpan={columns.length} className="py-3 text-center text-slate-500">אין נתונים להצגה</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-2 border-t border-slate-300 p-3 lg:grid-cols-3">
          <Field label="מקור" value={sourceName} onChange={setSourceName} />
          <Field label="עץ פעילויות" value={activityTree} onChange={setActivityTree} />
          <Field label="עץ מוצר" value={productTree} onChange={setProductTree} />
        </section>

        <section className="grid grid-cols-1 gap-2 border-t border-slate-300 p-2 lg:grid-cols-2">
          <textarea className="h-24 w-full resize-none rounded border border-slate-300 bg-white p-2 text-xs" value={memo1} onChange={(e) => setMemo1(e.target.value)} />
          <textarea className="h-24 w-full resize-none rounded border border-slate-300 bg-white p-2 text-xs" value={memo2} onChange={(e) => setMemo2(e.target.value)} />
        </section>

        <div className="flex items-center gap-3 px-3 pb-3 text-xs">
          <button type="button" className="rounded border border-blue-700 bg-blue-700 px-3 py-1 text-white" onClick={() => void load()} disabled={loading}>
            {loading ? 'טוען...' : 'סינון'}
          </button>
          {error ? <span className="text-red-700">{error}</span> : null}
        </div>
      </div>
    </main>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="text-xs">
      <div className="mb-1">{label}</div>
      <input className="w-full rounded border border-slate-300 px-2 py-1 text-xs" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <label className="text-xs">
      <div className="mb-1">{label}</div>
      <select className="w-full rounded border border-slate-300 px-2 py-1 text-xs" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o} value={o}>{o || '---'}</option>)}
      </select>
    </label>
  );
}
