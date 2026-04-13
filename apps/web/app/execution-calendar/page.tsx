'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch, apiUrl } from '../lib/api-base';
import { parseApiErrorResponse } from '../lib/api-error';

type SessionUser = { id: string; role: string };
type Entry = {
  id: string;
  date?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  title?: string | null;
  assignedUserName?: string | null;
  customerName?: string | null;
  notes?: string | null;
};

const SESSION_KEY = 'galit-crm-session';
const HOURS = Array.from({ length: 17 }, (_, i) => i + 6);

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

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function ExecutionCalendarPage() {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [titleName, setTitleName] = useState('משה גליקין');

  useEffect(() => setSession(readSession()), []);

  const selectedEntry = useMemo(() => entries.find((e) => e.id === selectedId) ?? null, [entries, selectedId]);
  const entriesByHour = useMemo(() => {
    const m = new Map<number, Entry[]>();
    for (const h of HOURS) m.set(h, []);
    for (const e of entries) {
      const hour = Number((e.startTime || '').split(':')[0]);
      if (Number.isFinite(hour) && m.has(hour)) m.get(hour)!.push(e);
    }
    return m;
  }, [entries]);

  const load = async (date = selectedDate) => {
    if (!session) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ date: toIso(date), viewMode: 'יומי' });
      const res = await apiFetch(apiUrl(`/execution-calendar?${params.toString()}`), { authUser: session });
      if (!res.ok) throw new Error(await parseApiErrorResponse(res));
      const data = (await res.json()) as Entry[];
      setEntries(Array.isArray(data) ? data : []);
      setSelectedId((prev) => (prev && data.some((x) => x.id === prev) ? prev : data[0]?.id ?? null));
      const firstName = data.find((x) => (x.assignedUserName || '').trim())?.assignedUserName;
      if (firstName) setTitleName(firstName);
    } catch (e) {
      const m = e instanceof Error ? e.message : '';
      setError(m || 'טעינת יומן מבצע נכשלה');
      setEntries([]);
      setSelectedId(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!session) return;
    void load(selectedDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, selectedDate]);

  const shiftDay = (n: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + n);
    setSelectedDate(d);
  };

  return (
    <main className="min-h-screen bg-[#ececec] p-2 text-slate-800" dir="rtl">
      <div className="mx-auto max-w-[1700px] rounded border border-slate-300 bg-[#f2f2f2]">
        <header className="border-b border-slate-300 bg-[#efefef] px-2 py-2 text-sm font-semibold">יומן מבצע</header>

        <section className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-300 px-2 py-2">
          <div className="flex items-center gap-2">
            <input
              type="date"
              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
              value={toIso(selectedDate)}
              onChange={(e) => setSelectedDate(new Date(`${e.target.value}T12:00:00`))}
            />
          </div>

          <div className="flex flex-wrap items-center gap-1 text-xs">
            {['צא', 'מתוזמנת', 'סננים', 'ראשון'].map((txt) => (
              <button key={txt} type="button" className="rounded border border-slate-300 bg-white px-2 py-1">{txt}</button>
            ))}
            <button type="button" className="rounded border border-slate-300 bg-white px-2 py-1" onClick={() => shiftDay(-1)}>הקודם</button>
            <button type="button" className="rounded border border-slate-300 bg-white px-2 py-1" onClick={() => setSelectedDate(new Date())}>היום</button>
            <button type="button" className="rounded border border-slate-300 bg-white px-2 py-1" onClick={() => shiftDay(1)}>הבא</button>
            {['אחרון'].map((txt) => (
              <button key={txt} type="button" className="rounded border border-slate-300 bg-white px-2 py-1">{txt}</button>
            ))}
            <button type="button" className="rounded border border-slate-300 bg-white px-2 py-1" onClick={() => void load()}>רענן</button>
          </div>
        </section>

        <section className="p-1">
          <div className="overflow-auto border border-slate-400">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-[#1f4fa3] text-white">
                  <th className="w-12 border border-slate-300 px-1 py-1 text-right" />
                  <th className="border border-slate-300 px-1 py-1 text-center">{titleName}</th>
                </tr>
              </thead>
              <tbody>
                {HOURS.map((h) => (
                  <tr key={h}>
                    <td className="border border-slate-300 bg-[#1f4fa3] px-1 py-1 text-white">{`${h}:00`}</td>
                    <td className="h-9 border border-slate-300 align-top">
                      <div className="flex flex-wrap gap-1 p-1">
                        {(entriesByHour.get(h) ?? []).map((e) => (
                          <button
                            key={e.id}
                            type="button"
                            onClick={() => setSelectedId(e.id)}
                            className={[
                              'rounded border px-2 py-0.5 text-[11px]',
                              selectedId === e.id ? 'border-blue-700 bg-blue-100' : 'border-slate-300 bg-white',
                            ].join(' ')}
                          >
                            {(e.startTime || '') + ' ' + (e.title || e.customerName || '')}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-slate-600">
            <span>{selectedDate.toLocaleDateString('he-IL')}</span>
            {loading ? <span>טוען...</span> : null}
            {error ? <span className="text-red-700">{error}</span> : null}
            <span>{selectedEntry?.notes || ''}</span>
          </div>
        </section>
      </div>
    </main>
  );
}
