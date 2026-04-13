'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch, apiUrl } from '../../lib/api-base';
import { parseApiErrorResponse } from '../../lib/api-error';

type SessionUser = { id: string; role: string };
type JournalRow = {
  id: string;
  importLegacyId?: string | null;
  trackingDate?: string | null;
  receivedDate?: string | null;
  hour?: string | null;
  customerName?: string | null;
  contactName?: string | null;
  phone?: string | null;
  productName?: string | null;
  displayName?: string | null;
  salesRepresentativeName?: string | null;
  status?: string | null;
  inquiryDuration?: string | null;
  homePhone?: string | null;
  mobilePhone?: string | null;
  workPhone?: string | null;
  lastStatusNotes?: string | null;
  faultDescription?: string | null;
  description?: string | null;
  isOpen?: boolean | null;
  isClosed?: boolean | null;
  isUrgent?: boolean | null;
  campaignName?: string | null;
};

const SESSION_KEY = 'galit-crm-session';

function readSession(): SessionUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SessionUser>;
    if (!parsed.id || !parsed.role) return null;
    return { id: parsed.id, role: parsed.role };
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

const columns: Array<{ key: keyof JournalRow; label: string }> = [
  { key: 'importLegacyId', label: 'פניות' },
  { key: 'trackingDate', label: 'תאריך מעקב' },
  { key: 'receivedDate', label: 'תאריך קבלה' },
  { key: 'hour', label: 'שעה' },
  { key: 'customerName', label: 'שם לקוח' },
  { key: 'contactName', label: 'איש קשר' },
  { key: 'phone', label: 'טלפון' },
  { key: 'productName', label: 'שם מוצר' },
  { key: 'displayName', label: 'שם' },
  { key: 'salesRepresentativeName', label: 'שם נציג מכירה' },
  { key: 'status', label: 'סטטוס' },
  { key: 'inquiryDuration', label: 'זמן פנייה' },
  { key: 'homePhone', label: 'בית' },
  { key: 'mobilePhone', label: 'סלולארי' },
  { key: 'workPhone', label: 'עבודה' },
];

export default function InquiryJournalPage() {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [rows, setRows] = useState<JournalRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [statusRange, setStatusRange] = useState('');
  const [salesRepRange, setSalesRepRange] = useState('');
  const [campaignRange, setCampaignRange] = useState('');
  const [productRange, setProductRange] = useState('');
  const [extraFilter1, setExtraFilter1] = useState('');
  const [extraFilter2, setExtraFilter2] = useState('');
  const [dateRangeField, setDateRangeField] = useState('');
  const [datePreset, setDatePreset] = useState('הכל');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [isOpen, setIsOpen] = useState(true);
  const [isClosed, setIsClosed] = useState(false);
  const [isUrgent, setIsUrgent] = useState(false);
  const [textSearch, setTextSearch] = useState('');

  useEffect(() => setSession(readSession()), []);

  const selected = useMemo(() => rows.find((r) => r.id === selectedId) ?? null, [rows, selectedId]);

  const resolveDates = () => {
    if (datePreset === 'הכל') return { fromDate: '', toDate: '' };
    const now = new Date();
    const end = new Date(now);
    const start = new Date(now);
    if (datePreset === 'עד היום') return { fromDate: '', toDate: end.toISOString().slice(0, 10) };
    if (datePreset === 'השבוע') {
      const dow = start.getDay();
      const diff = dow === 0 ? -6 : 1 - dow;
      start.setDate(start.getDate() + diff);
      return { fromDate: start.toISOString().slice(0, 10), toDate: end.toISOString().slice(0, 10) };
    }
    if (datePreset === 'תחום') return { fromDate, toDate };
    return { fromDate: '', toDate: '' };
  };

  const load = async () => {
    if (!session) return;
    setLoading(true);
    setError('');
    try {
      const dates = resolveDates();
      const params = new URLSearchParams();
      if (dates.fromDate) params.set('fromDate', dates.fromDate);
      if (dates.toDate) params.set('toDate', dates.toDate);
      if (statusRange.trim()) params.set('status', statusRange.trim());
      if (salesRepRange.trim()) params.set('salesRep', salesRepRange.trim());
      if (campaignRange.trim()) params.set('campaign', campaignRange.trim());
      if (productRange.trim()) params.set('product', productRange.trim());
      if (isOpen) params.set('isOpen', 'true');
      if (isClosed) params.set('isClosed', 'true');
      if (isUrgent) params.set('isUrgent', 'true');
      const quick = [textSearch, extraFilter1, extraFilter2, dateRangeField].map((x) => x.trim()).filter(Boolean).join(' ');
      if (quick) params.set('text', quick);
      const res = await apiFetch(apiUrl(`/inquiries/journal?${params.toString()}`), { authUser: session });
      if (!res.ok) throw new Error(await parseApiErrorResponse(res));
      const data = (await res.json()) as JournalRow[];
      setRows(Array.isArray(data) ? data : []);
      setSelectedId((prev) => (prev && data.some((r) => r.id === prev) ? prev : data[0]?.id ?? null));
    } catch (e) {
      const m = e instanceof Error ? e.message : '';
      setError(m || 'טעינת יומן פניות נכשלה');
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
      <div className="mx-auto max-w-[1500px] rounded border border-slate-300 bg-[#f3f3f3]">
        <header className="border-b border-slate-300 bg-[#efefef] px-3 py-2 text-sm font-semibold">יומן פניות</header>

        <section className="grid grid-cols-1 gap-3 border-b border-slate-300 p-3 lg:grid-cols-3">
          <div className="space-y-2 rounded border border-slate-300 bg-white p-2">
            <Field label="תחום סטטוסים" value={statusRange} onChange={setStatusRange} />
            <Field label="תחום נציג מכירה" value={salesRepRange} onChange={setSalesRepRange} />
            <Field label="תחום מבצע" value={campaignRange} onChange={setCampaignRange} />
            <Field label="מוצרים" value={productRange} onChange={setProductRange} />
            <Field label="" value={extraFilter1} onChange={setExtraFilter1} />
          </div>
          <div className="space-y-2 rounded border border-slate-300 bg-white p-2">
            <Field label="" value={extraFilter2} onChange={setExtraFilter2} />
            <div className="h-[72px] rounded border border-slate-300 bg-[#fafafa]" />
            <div className="h-[72px] rounded border border-slate-300 bg-[#fafafa]" />
          </div>
          <div className="space-y-2 rounded border border-slate-300 bg-white p-2">
            <Field label="תחום תאריכים" value={dateRangeField} onChange={setDateRangeField} />
            <div className="grid grid-cols-2 gap-2 text-xs">
              {['עד היום', 'תחום', 'השבוע', 'הכל'].map((opt) => (
                <label key={opt} className="flex items-center gap-1">
                  <input type="radio" name="preset" checked={datePreset === opt} onChange={() => setDatePreset(opt)} />
                  {opt}
                </label>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs">
                <div className="mb-1">מ־</div>
                <input type="date" className="w-full rounded border border-slate-300 px-2 py-1" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              </label>
              <label className="text-xs">
                <div className="mb-1">עד</div>
                <input type="date" className="w-full rounded border border-slate-300 px-2 py-1" value={toDate} onChange={(e) => setToDate(e.target.value)} />
              </label>
            </div>
          </div>
        </section>

        <section className="flex flex-wrap items-center gap-4 border-b border-slate-300 p-3 text-xs">
          <div className="font-semibold">מצב פנייה</div>
          <label className="flex items-center gap-1"><input type="checkbox" checked={isOpen} onChange={(e) => setIsOpen(e.target.checked)} />פתוחה</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={isClosed} onChange={(e) => setIsClosed(e.target.checked)} />סגורה</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={isUrgent} onChange={(e) => setIsUrgent(e.target.checked)} />דחופות</label>
          <input
            className="min-w-[260px] flex-1 rounded border border-slate-300 px-2 py-1"
            placeholder=""
            value={textSearch}
            onChange={(e) => setTextSearch(e.target.value)}
          />
          <button type="button" className="h-8 rounded border border-blue-700 bg-blue-700 px-4 text-white" onClick={() => void load()} disabled={loading}>
            {loading ? 'טוען...' : 'סינון'}
          </button>
          {error ? <span className="text-red-700">{error}</span> : null}
        </section>

        <section className="p-2">
          <div className="max-h-[360px] overflow-auto border border-slate-300 bg-white">
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
                        {c.key === 'trackingDate' || c.key === 'receivedDate' ? fmtDate(r[c.key] as string | null | undefined) : String(r[c.key] ?? '')}
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

        <section className="grid grid-cols-1 gap-2 border-t border-slate-300 p-2 lg:grid-cols-2">
          <div>
            <div className="mb-1 text-xs font-semibold">הערות סטטוס אחרון</div>
            <textarea className="h-24 w-full resize-none rounded border border-slate-300 bg-white p-2 text-xs" value={selected?.lastStatusNotes ?? ''} readOnly />
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold">תיאור תקלה</div>
            <textarea className="h-24 w-full resize-none rounded border border-slate-300 bg-white p-2 text-xs" value={selected?.faultDescription ?? selected?.description ?? ''} readOnly />
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
