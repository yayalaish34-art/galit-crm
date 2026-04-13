'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch, apiUrl } from '../lib/api-base';
import { parseApiErrorResponse } from '../lib/api-error';

type SessionUser = { id: string; role: string };
type ViewMode = 'יומי' | 'שבועי' | 'חודשי' | 'שנתי';
type Entry = {
  id: string;
  date?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  title?: string | null;
  customerName?: string | null;
  notes?: string | null;
  status?: string | null;
  salesRepresentativeName?: string | null;
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

function sameDate(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function monthGrid(base: Date): Date[] {
  const first = new Date(base.getFullYear(), base.getMonth(), 1);
  const start = new Date(first);
  const shift = (first.getDay() + 6) % 7; // Monday start
  start.setDate(first.getDate() - shift);
  const out: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    out.push(d);
  }
  return out;
}

const HOURS = Array.from({ length: 17 }, (_, i) => i + 6); // 6..22

export default function SalesCalendarPage() {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [mode, setMode] = useState<ViewMode>('יומי');
  const [viewDays, setViewDays] = useState('1');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [monthCursor, setMonthCursor] = useState<Date>(new Date());
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => setSession(readSession()), []);

  const selectedEntry = useMemo(() => entries.find((e) => e.id === selectedEntryId) ?? null, [entries, selectedEntryId]);
  const gridDates = useMemo(() => monthGrid(monthCursor), [monthCursor]);

  const loadEntries = async () => {
    if (!session) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('date', toIso(selectedDate));
      params.set('viewMode', mode);
      const res = await apiFetch(apiUrl(`/sales-calendar?${params.toString()}`), { authUser: session });
      if (!res.ok) throw new Error(await parseApiErrorResponse(res));
      const data = (await res.json()) as Entry[];
      setEntries(Array.isArray(data) ? data : []);
      setSelectedEntryId((prev) => (prev && data.some((x) => x.id === prev) ? prev : data[0]?.id ?? null));
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      setError(msg || 'טעינת יומן נציג מכירה נכשלה');
      setEntries([]);
      setSelectedEntryId(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!session) return;
    void loadEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, selectedDate, mode]);

  const entriesByHour = useMemo(() => {
    const map = new Map<number, Entry[]>();
    for (const h of HOURS) map.set(h, []);
    for (const e of entries) {
      const st = (e.startTime || '').trim();
      const hour = Number(st.split(':')[0]);
      if (Number.isFinite(hour) && map.has(hour)) map.get(hour)!.push(e);
    }
    return map;
  }, [entries]);

  return (
    <main className="min-h-screen bg-[#ececec] p-3 text-slate-800" dir="rtl">
      <div className="mx-auto max-w-[1600px] rounded border border-slate-300 bg-[#f2f2f2]">
        <header className="border-b border-slate-300 bg-[#efefef] px-3 py-2 text-sm font-semibold">יומן נציג מכירה</header>

        <section className="grid grid-cols-1 gap-2 p-2 lg:grid-cols-[280px_1fr_72px]">
          <aside className="space-y-2 rounded border border-slate-300 bg-white p-2">
            <div className="rounded border border-slate-300 bg-[#f8f8f8] p-2">
              <div className="mb-2 flex items-center justify-between text-xs font-semibold">
                <button type="button" className="rounded border px-2" onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))}>◀</button>
                <span>{monthCursor.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })}</span>
                <button type="button" className="rounded border px-2" onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))}>▶</button>
              </div>
              <div className="grid grid-cols-7 gap-1 text-[10px]">
                {['ב', 'ג', 'ד', 'ה', 'ו', 'ש', 'א'].map((d) => (
                  <div key={d} className="text-center text-slate-500">{d}</div>
                ))}
                {gridDates.map((d) => {
                  const inMonth = d.getMonth() === monthCursor.getMonth();
                  const isSel = sameDate(d, selectedDate);
                  const isToday = sameDate(d, new Date());
                  return (
                    <button
                      key={d.toISOString()}
                      type="button"
                      onClick={() => setSelectedDate(new Date(d))}
                      className={[
                        'h-6 rounded text-center text-[10px] border',
                        inMonth ? 'border-slate-300 text-slate-700' : 'border-slate-200 text-slate-400',
                        isSel ? 'bg-blue-700 text-white border-blue-700' : 'bg-white',
                        isToday && !isSel ? 'ring-1 ring-red-400' : '',
                      ].join(' ')}
                    >
                      {d.getDate()}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 text-xs text-slate-700">{selectedDate.toLocaleDateString('he-IL')}</div>
            </div>

            <textarea
              className="h-[235px] w-full resize-none rounded border border-slate-300 bg-white p-2 text-xs"
              value={selectedEntry?.notes || ''}
              readOnly
            />
          </aside>

          <section className="rounded border-2 border-blue-700 bg-white p-2">
            <div className="mb-2 flex items-center gap-2 text-xs">
              <label>ימי תצוגה</label>
              <select className="rounded border border-slate-300 px-2 py-1" value={viewDays} onChange={(e) => setViewDays(e.target.value)}>
                <option value="1">1</option>
                <option value="3">3</option>
                <option value="7">7</option>
              </select>
              {error ? <span className="text-red-700">{error}</span> : null}
              {loading ? <span className="text-slate-500">טוען...</span> : null}
            </div>

            <div className="overflow-auto border border-slate-400">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-[#1f4fa3] text-white">
                    <th className="w-14 border border-slate-300 px-1 py-1 text-right" />
                    <th className="border border-slate-300 px-1 py-1 text-center">{selectedDate.toLocaleDateString('he-IL')}</th>
                  </tr>
                </thead>
                <tbody>
                  {HOURS.map((h) => {
                    const atHour = entriesByHour.get(h) ?? [];
                    return (
                      <tr key={h}>
                        <td className="border border-slate-300 bg-[#1f4fa3] px-1 py-1 text-white">{`${h}:00`}</td>
                        <td className="h-8 border border-slate-300 align-top">
                          <div className="flex flex-wrap gap-1 p-1">
                            {atHour.map((e) => (
                              <button
                                type="button"
                                key={e.id}
                                onClick={() => setSelectedEntryId(e.id)}
                                className={[
                                  'rounded border px-2 py-0.5 text-[11px]',
                                  selectedEntryId === e.id ? 'border-blue-700 bg-blue-100' : 'border-slate-300 bg-white',
                                ].join(' ')}
                              >
                                {(e.startTime || '') + ' ' + (e.title || e.customerName || 'פגישה')}
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <aside className="flex flex-col gap-1">
            {(['יומי', 'שבועי', 'חודשי', 'שנתי'] as ViewMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={[
                  'rounded border px-2 py-2 text-xs',
                  mode === m ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-300 bg-white',
                ].join(' ')}
              >
                {m}
              </button>
            ))}
          </aside>
        </section>
      </div>
    </main>
  );
}
