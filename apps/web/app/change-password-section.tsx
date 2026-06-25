'use client';

import { useState } from 'react';
import { apiFetch, apiUrl, type ApiAuthUser } from './lib/api-base';

/**
 * שינוי סיסמה עצמי — מוצג בכרטיס "הפרופיל שלי" של המשתמש המחובר.
 * מנהל state עצמאי כדי לא להיכרך בטופס העובד הגדול.
 */
export function ChangePasswordSection({ currentUser }: { currentUser: ApiAuthUser }) {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async () => {
    setMsg(null);
    if (!cur || !next) { setMsg({ ok: false, text: 'יש למלא סיסמה נוכחית וחדשה' }); return; }
    if (next.length < 6) { setMsg({ ok: false, text: 'הסיסמה החדשה חייבת להכיל לפחות 6 תווים' }); return; }
    if (next !== confirm) { setMsg({ ok: false, text: 'אימות הסיסמה אינו תואם' }); return; }
    setBusy(true);
    try {
      const res = await apiFetch(apiUrl('/users/change-password'), {
        method: 'POST',
        authUser: currentUser,
        body: JSON.stringify({ currentPassword: cur, newPassword: next }),
      });
      if (!res.ok) {
        let t = 'שינוי הסיסמה נכשל';
        try {
          const j = await res.json();
          if (j?.message) t = Array.isArray(j.message) ? j.message.join(' — ') : String(j.message);
        } catch { /* ignore */ }
        setMsg({ ok: false, text: t });
      } else {
        setMsg({ ok: true, text: 'הסיסמה עודכנה בהצלחה' });
        setCur(''); setNext(''); setConfirm('');
      }
    } catch {
      setMsg({ ok: false, text: 'שגיאת רשת — נסה שוב' });
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    'w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-slate-400';

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4" dir="rtl">
      <div className="mb-2 text-sm font-semibold text-amber-900">שינוי סיסמה</div>
      <div className="space-y-2">
        <input
          type="password"
          className={inputCls}
          placeholder="סיסמה נוכחית"
          value={cur}
          onChange={(e) => setCur(e.target.value)}
          autoComplete="current-password"
        />
        <input
          type="password"
          className={inputCls}
          placeholder="סיסמה חדשה (לפחות 6 תווים)"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          autoComplete="new-password"
        />
        <input
          type="password"
          className={inputCls}
          placeholder="אימות סיסמה חדשה"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
        />
      </div>
      {msg && (
        <div className={`mt-2 text-xs font-semibold ${msg.ok ? 'text-emerald-600' : 'text-red-600'}`}>
          {msg.text}
        </div>
      )}
      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="mt-3 rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-amber-700 disabled:opacity-50"
      >
        {busy ? 'מעדכן...' : 'עדכן סיסמה'}
      </button>
    </div>
  );
}
