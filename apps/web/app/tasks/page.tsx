'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch, apiUrl } from '../lib/api-base';
import { parseApiErrorResponse } from '../lib/api-error';
import { isAdminRole } from '../lib/roles';

type SessionUser = { id: string; role: string };

type TaskRow = {
  id: string;
  status?: string;
  dueDate?: string | null;
  customerName?: string | null;
  contactName?: string | null;
  productName?: string | null;
  activityName?: string | null;
  cityName?: string | null;
  campaignName?: string | null;
  contactRepresentative?: string | null;
  customerDocumentType?: string | null;
  homePhone?: string | null;
  mobilePhone?: string | null;
  workPhone?: string | null;
  address?: string | null;
  description?: string | null;
  title?: string | null;
  importLegacyId?: string | null;
  priority?: string | null;
  timeSlot?: string | null;
  dialCount?: number | null;
  floatingWindowEnabled?: boolean | null;
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

const columns: Array<{ key: keyof TaskRow; label: string }> = [
  { key: 'status', label: 'מצב' },
  { key: 'dueDate', label: 'תאריך לביצוע' },
  { key: 'customerName', label: 'שם לקוח' },
  { key: 'contactName', label: 'איש קשר' },
  { key: 'productName', label: 'שם מוצר' },
  { key: 'activityName', label: 'שם פעילות' },
  { key: 'cityName', label: 'שם עיר' },
  { key: 'campaignName', label: 'שם מבצע' },
  { key: 'contactRepresentative', label: 'נציג איש קשר' },
  { key: 'customerDocumentType', label: 'סוג מסמך ללקוח' },
  { key: 'homePhone', label: 'בית' },
  { key: 'mobilePhone', label: 'סלולארי' },
  { key: 'workPhone', label: 'עבודה' },
  { key: 'address', label: 'כתובת' },
];

export default function TasksLegacyPage() {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [rows, setRows] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [productRange, setProductRange] = useState('');
  const [activityRange, setActivityRange] = useState('');
  const [campaignRange, setCampaignRange] = useState('');
  const [salesRepRange, setSalesRepRange] = useState('');
  const [timeSlot, setTimeSlot] = useState('');
  const [priority, setPriority] = useState('');
  const [productSpread, setProductSpread] = useState('');
  const [dialCounter, setDialCounter] = useState('');
  const [floatingWindow, setFloatingWindow] = useState(false);
  const [dateRangeField, setDateRangeField] = useState('');
  const [sliceBy, setSliceBy] = useState('');
  const [datePreset, setDatePreset] = useState('הכל');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [citySearch, setCitySearch] = useState('');
  const [textSearch, setTextSearch] = useState('');
  // 'mine' = רק המשימות של העובד המחובר (ברירת מחדל), 'all' = כל המשימות
  const [taskScope, setTaskScope] = useState<'mine' | 'all'>('mine');

  const isAdmin = useMemo(() => isAdminRole(session?.role), [session]);

  useEffect(() => {
    setSession(readSession());
  }, []);

  const selected = useMemo(
    () => rows.find((x) => x.id === selectedId) ?? null,
    [rows, selectedId],
  );

  const applyDatePreset = () => {
    if (datePreset === 'הכל') return { fromDate: '', toDate: '' };
    const now = new Date();
    const end = new Date(now);
    const start = new Date(now);
    if (datePreset === 'עד היום') {
      return { fromDate: '', toDate: end.toISOString().slice(0, 10) };
    }
    if (datePreset === 'מחר') {
      start.setDate(start.getDate() + 1);
      return { fromDate: start.toISOString().slice(0, 10), toDate: start.toISOString().slice(0, 10) };
    }
    if (datePreset === 'השבוע') {
      const dow = start.getDay();
      const diff = dow === 0 ? -6 : 1 - dow;
      start.setDate(start.getDate() + diff);
      return { fromDate: start.toISOString().slice(0, 10), toDate: end.toISOString().slice(0, 10) };
    }
    if (datePreset === 'החודש') {
      start.setDate(1);
      return { fromDate: start.toISOString().slice(0, 10), toDate: end.toISOString().slice(0, 10) };
    }
    if (datePreset === 'תחום') {
      return { fromDate, toDate };
    }
    return { fromDate: '', toDate: '' };
  };

  const loadTasks = async ({ background = false }: { background?: boolean } = {}) => {
    if (!session) return;
    // ברענון-רקע (polling) לא מדליקים spinner ולא מנקים את הרשימה — כדי שהמסך לא יהבהב
    // ולא ייעלם תוכן קיים אם קריאת רקע נכשלת. ה-spinner נשמר רק לטעינה הראשונה/שינוי פילטר.
    if (!background) {
      setLoading(true);
      setError('');
    }
    try {
      const dates = applyDatePreset();
      const params = new URLSearchParams();
      if (dates.fromDate) params.set('fromDate', dates.fromDate);
      if (dates.toDate) params.set('toDate', dates.toDate);
      if (priority.trim()) params.set('priority', priority.trim());
      if (customerSearch.trim()) params.set('customer', customerSearch.trim());
      if (citySearch.trim()) params.set('city', citySearch.trim());
      if (campaignRange.trim()) params.set('campaign', campaignRange.trim());
      if (salesRepRange.trim()) params.set('salesRep', salesRepRange.trim());
      if (productRange.trim()) params.set('product', productRange.trim());
      if (activityRange.trim()) params.set('activity', activityRange.trim());
      const quickText = [
        textSearch.trim(),
        productSpread.trim(),
        timeSlot.trim(),
        dialCounter.trim(),
        dateRangeField.trim(),
        sliceBy.trim(),
      ]
        .filter(Boolean)
        .join(' ');
      if (quickText) params.set('text', quickText);
      if (taskScope === 'all') params.set('scope', 'all');
      const res = await apiFetch(apiUrl(`/tasks?${params.toString()}`), { authUser: session });
      if (!res.ok) throw new Error(await parseApiErrorResponse(res));
      const data = (await res.json()) as TaskRow[];
      setRows(Array.isArray(data) ? data : []);
      setSelectedId((prev) => (prev && data.some((r) => r.id === prev) ? prev : data[0]?.id ?? null));
    } catch (e) {
      // כישלון בקריאת רקע — משאירים את התוכן הקיים ולא מציגים שגיאה מהבהבת; ננסה שוב בסבב הבא.
      if (background) return;
      const msg = e instanceof Error ? e.message : '';
      setError(msg || 'טעינת מטלות נכשלה');
      setRows([]);
      setSelectedId(null);
    } finally {
      if (!background) setLoading(false);
    }
  };

  useEffect(() => {
    if (!session) return;
    void loadTasks();
    // Polling קצר כדי שמשימות שנוצרו במקור אחר (מערכת חיצונית שכותבת ל-Task ישירות, בוט)
    // יופיעו ברשימה בלי רענון ידני — אותו קצב כמו הפופ-אפ של הלידים הנכנסים (dashboard).
    const t = window.setInterval(() => void loadTasks({ background: true }), 20_000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, taskScope]);

  return (
    <main className="min-h-screen bg-[#ececec] p-3 text-slate-800" dir="rtl">
      <div className="mx-auto max-w-[1500px] rounded border border-slate-300 bg-[#f3f3f3]">
        <header className="flex items-center justify-between border-b border-slate-300 bg-[#efefef] px-3 py-2 text-sm font-semibold">
          <span>מטלות</span>
          {session && !isAdmin ? (
            <div className="flex items-center gap-1 text-xs font-normal">
              <button
                type="button"
                className={`rounded border px-3 py-1 ${
                  taskScope === 'mine'
                    ? 'border-blue-700 bg-blue-700 text-white'
                    : 'border-slate-300 bg-white text-slate-700'
                }`}
                onClick={() => setTaskScope('mine')}
              >
                המשימות שלי
              </button>
              <button
                type="button"
                className={`rounded border px-3 py-1 ${
                  taskScope === 'all'
                    ? 'border-blue-700 bg-blue-700 text-white'
                    : 'border-slate-300 bg-white text-slate-700'
                }`}
                onClick={() => setTaskScope('all')}
              >
                כל המשימות
              </button>
            </div>
          ) : null}
        </header>

        <section className="grid grid-cols-1 gap-3 border-b border-slate-300 p-3 lg:grid-cols-3">
          <div className="space-y-2 rounded border border-slate-300 bg-white p-2">
            <Field label="תחום מוצרים" value={productRange} onChange={setProductRange} />
            <Field label="תחום פעילות" value={activityRange} onChange={setActivityRange} />
            <Field label="תחום מבצע" value={campaignRange} onChange={setCampaignRange} />
            <Field label="תחום נציג מכירה" value={salesRepRange} onChange={setSalesRepRange} />
          </div>

          <div className="space-y-2 rounded border border-slate-300 bg-white p-2">
            <Field label="צור זמן" value={timeSlot} onChange={setTimeSlot} />
            <Field label="עדיפות" value={priority} onChange={setPriority} />
            <Field label="פריס מוצרים" value={productSpread} onChange={setProductSpread} />
            <Field label="מונה חיוג" value={dialCounter} onChange={setDialCounter} />
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={floatingWindow}
                onChange={(e) => setFloatingWindow(e.target.checked)}
              />
              הצג חלון צף
            </label>
          </div>

          <div className="space-y-2 rounded border border-slate-300 bg-white p-2">
            <Field label="תחום תאריכים" value={dateRangeField} onChange={setDateRangeField} />
            <Field label='חתך ע"פ' value={sliceBy} onChange={setSliceBy} />
            <div className="grid grid-cols-2 gap-2 text-xs">
              {['עד היום', 'תחום', 'מחר', 'השבוע', 'החודש', 'הכל'].map((opt) => (
                <label key={opt} className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="datePreset"
                    checked={datePreset === opt}
                    onChange={() => setDatePreset(opt)}
                  />
                  {opt}
                </label>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs">
                <div className="mb-1">מ־</div>
                <input
                  type="date"
                  className="w-full rounded border border-slate-300 px-2 py-1"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                />
              </label>
              <label className="text-xs">
                <div className="mb-1">עד</div>
                <input
                  type="date"
                  className="w-full rounded border border-slate-300 px-2 py-1"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                />
              </label>
            </div>
          </div>
        </section>

        <section className="flex flex-wrap items-end gap-2 border-b border-slate-300 p-3">
          <Field label="לקוח" value={customerSearch} onChange={setCustomerSearch} />
          <Field label="עיר" value={citySearch} onChange={setCitySearch} />
          <div className="min-w-[240px] flex-1">
            <label className="text-xs">
              <div className="mb-1">טקסט חופשי</div>
              <input
                className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                value={textSearch}
                onChange={(e) => setTextSearch(e.target.value)}
              />
            </label>
          </div>
          <button
            type="button"
            className="h-8 rounded border border-blue-700 bg-blue-700 px-4 text-xs font-semibold text-white"
            onClick={() => void loadTasks()}
            disabled={loading}
          >
            {loading ? 'טוען...' : 'סינון'}
          </button>
          {error ? <span className="text-xs text-red-700">{error}</span> : null}
        </section>

        <section className="p-2">
          <div className="max-h-[400px] overflow-auto border border-slate-300 bg-white">
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 bg-[#2563eb] text-white">
                <tr>
                  {columns.map((c) => (
                    <th key={c.label} className="border border-[#93c5fd] px-2 py-1 text-right font-semibold">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className={selectedId === r.id ? 'bg-blue-100' : 'hover:bg-slate-50'}
                    onClick={() => setSelectedId(r.id)}
                  >
                    {columns.map((c) => (
                      <td key={c.label} className="border border-slate-200 px-2 py-1">
                        {c.key === 'dueDate' ? fmtDate(r.dueDate) : String(r[c.key] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
                {!loading && rows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} className="px-2 py-3 text-center text-slate-500">
                      אין נתונים להצגה
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="border-t border-slate-300 p-3">
          <div className="mb-1 text-xs font-semibold">פרטים</div>
          <textarea
            className="h-28 w-full resize-none rounded border border-slate-300 bg-white p-2 text-xs"
            value={selected?.description || selected?.title || ''}
            readOnly
          />
        </section>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="min-w-[170px] text-xs">
      <div className="mb-1">{label}</div>
      <input
        className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
