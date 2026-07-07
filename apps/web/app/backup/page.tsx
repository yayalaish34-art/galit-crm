'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiUrl, getApiBaseUrl, getStoredToken } from '../lib/api-base';

/* ─────────────────────────────────────────────────────────────
   דשבורד בקרה / גיבוי — מנהלי מערכת בלבד (ADMIN).
   מציג: סימני חיים של המסד, ספירות כל טבלה, וטבלאות נתונים מלאות.
   נותן למנהל בקרה מיידית — לראות אם המסד נפל / התרוקן.
   ───────────────────────────────────────────────────────────── */

const SESSION_KEY = 'galit-crm-session';

type Health = {
  dbConnected: boolean;
  dbHealthy: boolean;
  latencyMs: number;
  counts?: Record<string, number>;
  totalRecords?: number;
  error?: string;
  checkedAt: string;
};

type Snapshot = {
  generatedAt: string;
  customers: Record<string, any>[];
  leads: Record<string, any>[];
  quotes: Record<string, any>[];
  tasks: Record<string, any>[];
  reports: Record<string, any>[];
};

function readSession(): { id: string; role: string } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s?.id || !s?.role) return null;
    return { id: String(s.id), role: String(s.role).toUpperCase() };
  } catch {
    return null;
  }
}

const COUNT_LABELS: Record<string, string> = {
  customers: 'לקוחות',
  leads: 'לידים',
  quotes: 'הצעות מחיר',
  tasks: 'משימות',
  reports: 'דוחות',
  projects: 'פרויקטים',
  opportunities: 'הזדמנויות',
  documents: 'מסמכים',
  users: 'עובדים',
  incomingLeads: 'לידים נכנסים',
};

const TABS: { key: keyof Snapshot; label: string }[] = [
  { key: 'customers', label: 'לקוחות' },
  { key: 'leads', label: 'לידים' },
  { key: 'quotes', label: 'הצעות מחיר' },
  { key: 'tasks', label: 'משימות' },
  { key: 'reports', label: 'דוחות' },
];

function fmt(v: any): string {
  if (v == null || v === '') return '—';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
  }
  return String(v);
}

export default function BackupPage() {
  const [session, setSession] = useState<{ id: string; role: string } | null | undefined>(undefined);
  const [health, setHealth] = useState<Health | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [activeTab, setActiveTab] = useState<keyof Snapshot>('customers');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setSession(readSession());
  }, []);

  const headers = useCallback((): Record<string, string> => {
    const token = getStoredToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const loadHealth = useCallback(async () => {
    if (!session) return;
    try {
      const r = await fetch(apiUrl('/backup/health'), { headers: headers() });
      if (r.ok) setHealth(await r.json());
      else setHealth({ dbConnected: false, dbHealthy: false, latencyMs: 0, error: `HTTP ${r.status}`, checkedAt: new Date().toISOString() });
    } catch (e: any) {
      setHealth({ dbConnected: false, dbHealthy: false, latencyMs: 0, error: e?.message || 'network', checkedAt: new Date().toISOString() });
    }
  }, [session, headers]);

  const loadSnapshot = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setErr('');
    try {
      const r = await fetch(apiUrl('/backup/snapshot'), { headers: headers() });
      if (r.ok) setSnapshot(await r.json());
      else setErr(`טעינת הנתונים נכשלה (HTTP ${r.status})`);
    } catch (e: any) {
      setErr(e?.message || 'שגיאת רשת');
    } finally {
      setLoading(false);
    }
  }, [session, headers]);

  // רענון סימני חיים כל 30 שניות, טעינת נתונים פעם אחת בכניסה
  useEffect(() => {
    if (!session || session.role !== 'ADMIN') return;
    void loadHealth();
    void loadSnapshot();
    const iv = setInterval(() => void loadHealth(), 30_000);
    return () => clearInterval(iv);
  }, [session, loadHealth, loadSnapshot]);

  if (session === undefined) {
    return <main className="min-h-screen bg-[#f5f6f8] p-8 text-slate-600" dir="rtl">טוען…</main>;
  }
  if (!session) {
    return (
      <main className="min-h-screen bg-[#f5f6f8] p-8 text-slate-700" dir="rtl">
        <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <div className="mb-2 text-lg font-bold">נדרשת התחברות</div>
          <div className="text-sm text-slate-500">התחבר למערכת ואז חזור לדף הבקרה.</div>
          <a href="/" className="mt-4 inline-block rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white">למסך ההתחברות</a>
        </div>
      </main>
    );
  }
  if (session.role !== 'ADMIN') {
    return (
      <main className="min-h-screen bg-[#f5f6f8] p-8 text-slate-700" dir="rtl">
        <div className="mx-auto max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
          <div className="mb-1 text-lg font-bold text-amber-800">אין הרשאה</div>
          <div className="text-sm text-amber-700">דף הבקרה זמין למנהלי מערכת בלבד.</div>
        </div>
      </main>
    );
  }

  const rows = snapshot ? snapshot[activeTab] as Record<string, any>[] : [];
  const columns = rows.length ? Object.keys(rows[0]) : [];

  return (
    <main className="min-h-screen bg-[#f5f6f8] p-4 text-slate-800 md:p-8" dir="rtl">
      <div className="mx-auto max-w-[1400px] space-y-5">
        {/* כותרת + סטטוס מסד */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-800">דשבורד בקרה וגיבוי</h1>
            <div className="text-sm text-slate-500">מבט-על על כל נתוני המערכת + מצב מסד הנתונים</div>
          </div>
          <div className="flex items-center gap-3">
            {health && (
              <div
                className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${
                  health.dbHealthy ? 'bg-emerald-50 text-emerald-700' : health.dbConnected ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'
                }`}
              >
                <span className={`h-2.5 w-2.5 rounded-full ${health.dbHealthy ? 'bg-emerald-500' : health.dbConnected ? 'bg-amber-500' : 'bg-red-500'}`} />
                {health.dbHealthy ? 'המסד תקין' : health.dbConnected ? 'מחובר — אך ריק/חלקי!' : 'המסד לא מגיב!'}
                {health.dbConnected && <span className="font-normal opacity-70">({health.latencyMs}ms)</span>}
              </div>
            )}
            <button
              onClick={() => { void loadHealth(); void loadSnapshot(); }}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              רענן עכשיו
            </button>
          </div>
        </div>

        {health?.error && (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            שגיאת מסד: {health.error}
          </div>
        )}

        {/* כרטיסי ספירה */}
        {health?.counts && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {Object.entries(health.counts).map(([key, n]) => {
              const danger = n === 0 && (key === 'users');
              return (
                <div key={key} className={`rounded-2xl border p-4 shadow-sm ${danger ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'}`}>
                  <div className="text-3xl font-extrabold text-slate-800">{n.toLocaleString('he-IL')}</div>
                  <div className="mt-0.5 text-xs font-semibold text-slate-500">{COUNT_LABELS[key] ?? key}</div>
                </div>
              );
            })}
          </div>
        )}

        {health && (
          <div className="text-xs text-slate-400">
            סה"כ {health.totalRecords?.toLocaleString('he-IL') ?? '—'} רשומות · נבדק לאחרונה {fmt(health.checkedAt)} · מתעדכן אוטומטית כל 30 שניות
          </div>
        )}

        {/* טבלאות נתונים */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap gap-1 border-b border-slate-200 p-2">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`rounded-lg px-4 py-2 text-sm font-bold transition-colors ${
                  activeTab === t.key ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {t.label}
                {snapshot && <span className="mr-1.5 opacity-70">({(snapshot[t.key] as any[]).length})</span>}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto p-2">
            {loading && !snapshot ? (
              <div className="p-8 text-center text-sm text-slate-400">טוען נתונים…</div>
            ) : err ? (
              <div className="p-8 text-center text-sm text-red-500">{err}</div>
            ) : rows.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-400">אין רשומות בטבלה זו.</div>
            ) : (
              <table className="w-full min-w-[700px] border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 text-right">
                    {columns.map((col) => (
                      <th key={col} className="whitespace-nowrap border-b border-slate-200 px-3 py-2 text-xs font-bold text-slate-500">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      {columns.map((col) => (
                        <td key={col} className="whitespace-nowrap border-b border-slate-100 px-3 py-2 text-slate-700">{fmt(row[col])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="text-center text-[11px] text-slate-400">
          מחובר ל-API: {getApiBaseUrl()}
          {snapshot && ` · נתונים נכון ל-${fmt(snapshot.generatedAt)}`}
        </div>
      </div>
    </main>
  );
}
