'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch, apiUrl } from '../lib/api-base';
import { parseApiErrorResponse } from '../lib/api-error';

type SessionUser = { id: string; role: string; name?: string; email?: string };

type InquiryRow = {
  id: string;
  importLegacyId?: string | null;
  customerId?: string | null;
  date?: string | null;
  time?: string | null;
  customerCode?: string | null;
  productCode?: string | null;
  contactName?: string | null;
  phone?: string | null;
  hValue?: string | null;
  productName?: string | null;
  faultCode?: string | null;
  eValue?: string | null;
  dValue?: string | null;
  treatmentCode?: string | null;
  handlerName?: string | null;
  followUp?: boolean | null;
  description?: string | null;
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

function toInputDate(v: string | null | undefined): string {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function formatCellDate(v: string | null | undefined): string {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('he-IL');
}

const columns: Array<{ key: keyof InquiryRow | 'followUpLabel'; label: string }> = [
  { key: 'importLegacyId', label: 'קוד פנייה' },
  { key: 'date', label: 'תאריך' },
  { key: 'time', label: 'שעה' },
  { key: 'customerCode', label: 'קוד לקוח' },
  { key: 'productCode', label: 'קוד מוצר' },
  { key: 'contactName', label: 'איש קשר' },
  { key: 'phone', label: 'טלפון' },
  { key: 'hValue', label: 'H' },
  { key: 'productName', label: 'מוצר' },
  { key: 'faultCode', label: 'קוד תקלה' },
  { key: 'eValue', label: 'E' },
  { key: 'dValue', label: 'D' },
  { key: 'treatmentCode', label: 'קוד טיפול' },
  { key: 'handlerName', label: 'שם מטפל' },
  { key: 'followUpLabel', label: 'למעקב' },
];

export default function InquiriesPage() {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rows, setRows] = useState<InquiryRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [useRange, setUseRange] = useState(true);
  const [customerSearch, setCustomerSearch] = useState('');
  const [textSearch, setTextSearch] = useState('');

  useEffect(() => {
    setSession(readSession());
  }, []);

  const selected = useMemo(
    () => rows.find((r) => r.id === selectedId) ?? null,
    [rows, selectedId],
  );

  const loadInquiries = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (useRange && dateFrom) params.set('fromDate', dateFrom);
      if (useRange && dateTo) params.set('toDate', dateTo);
      if (customerSearch.trim()) params.set('customer', customerSearch.trim());
      if (textSearch.trim()) params.set('text', textSearch.trim());
      const url = `/inquiries${params.toString() ? `?${params.toString()}` : ''}`;
      const res = await apiFetch(apiUrl(url), { authUser: session });
      if (!res.ok) throw new Error(await parseApiErrorResponse(res));
      const data = (await res.json()) as InquiryRow[];
      setRows(Array.isArray(data) ? data : []);
      setSelectedId((prev) => (prev && data.some((r) => r.id === prev) ? prev : data[0]?.id ?? null));
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      setError(msg || 'טעינת פניות נכשלה');
      setRows([]);
      setSelectedId(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!session) return;
    void loadInquiries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  return (
    <main className="min-h-screen bg-[#efefef] p-3 text-slate-800" dir="rtl">
      <div className="mx-auto max-w-[1400px] rounded border border-slate-300 bg-[#f5f5f5]">
        <header className="border-b border-slate-300 bg-[#f0f0f0] px-3 py-2 text-sm font-semibold">
          פניות
        </header>

        <section className="border-b border-slate-300 px-3 py-3">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-8 md:items-end">
            <label className="text-xs">
              <div className="mb-1">תאריך התחלה</div>
              <input
                type="date"
                className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </label>
            <label className="text-xs">
              <div className="mb-1">תאריך סיום</div>
              <input
                type="date"
                className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </label>
            <label className="flex items-center gap-2 text-xs md:pb-1">
              <input
                type="checkbox"
                checked={useRange}
                onChange={(e) => setUseRange(e.target.checked)}
              />
              תחום תאריכים
            </label>
            <label className="text-xs">
              <div className="mb-1">לקוח</div>
              <input
                type="text"
                className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
              />
            </label>
            <label className="text-xs md:col-span-3">
              <div className="mb-1">טקסט חופשי</div>
              <input
                type="text"
                className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                value={textSearch}
                onChange={(e) => setTextSearch(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="h-8 rounded border border-blue-700 bg-blue-700 px-3 text-xs font-semibold text-white"
              onClick={() => void loadInquiries()}
              disabled={loading || !session}
            >
              {loading ? 'טוען...' : 'חפש'}
            </button>
          </div>
          {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
        </section>

        <section className="px-2 py-2">
          <div className="max-h-[420px] overflow-auto border border-slate-300 bg-white">
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 bg-[#2d6ea3] text-white">
                <tr>
                  {columns.map((c) => (
                    <th key={c.label} className="border border-[#8db0cf] px-2 py-1 text-right font-semibold">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className={selectedId === row.id ? 'bg-blue-100' : 'hover:bg-slate-50'}
                    onClick={() => setSelectedId(row.id)}
                  >
                    {columns.map((c) => {
                      let value = '';
                      if (c.key === 'followUpLabel') value = row.followUp ? 'כן' : '';
                      else if (c.key === 'date') value = formatCellDate(row.date);
                      else value = String(row[c.key] ?? '');
                      return (
                        <td key={c.label} className="border border-slate-200 px-2 py-1">
                          {value}
                        </td>
                      );
                    })}
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

        <section className="border-t border-slate-300 px-3 py-2">
          <div className="mb-1 text-xs font-semibold">תיאור תקלה</div>
          <textarea
            className="h-28 w-full resize-none rounded border border-slate-300 bg-white p-2 text-xs"
            value={selected?.description ?? ''}
            readOnly
          />
          <div className="mt-2 text-[11px] text-slate-500">
            מצב ברירת מחדל: צפייה. מצב עריכה יתוסף בהמשך.
          </div>
          {selected ? (
            <div className="mt-2 text-[11px] text-slate-500">
              תאריך: {toInputDate(selected.date) || '-'} | שעה: {selected.time || '-'} | קוד פנייה:{' '}
              {selected.importLegacyId || '-'}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
