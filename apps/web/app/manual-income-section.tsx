'use client';

import { useCallback, useEffect, useState } from 'react';
import { Wallet, Plus, Trash2, Loader2, X, CheckCircle2, StickyNote } from 'lucide-react';
import { apiFetch, apiUrl } from './lib/api-base';

/** פורמט מספר עם מפרידי אלפים לתצוגה. */
function fmtAmount(n: number): string {
  return n.toLocaleString('he-IL');
}

type ManualIncome = {
  id: string;
  amount: number;
  note: string;
  at: string | null;
  createdById?: string | null;
};

/** תאריך היום כ-YYYY-MM-DD (לשדה date). */
function todayInput(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10);
}

/**
 * סקשן "הכנסה ידנית" — מאפשר לרשום הכנסה שלא נכנסה דרך הצעת מחיר (למשל תשלום
 * שהתקבל מחוץ למערכת), עם הערה המסבירה מדוע נרשמה ידנית. ההכנסה נספרת אוטומטית
 * בכל חישובי ההכנסה של הדשבורד (נשמרת כ-Quote "זכייה" מסומן MANUAL_INCOME בשרת).
 */
export function ManualIncomeSection({
  customerId,
  currentUser,
}: {
  customerId: string | null | undefined;
  currentUser: unknown;
}) {
  const [rows, setRows] = useState<ManualIncome[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayInput());
  const valid = !!customerId && customerId !== '__new__';

  const load = useCallback(async () => {
    if (!valid) return;
    setLoading(true);
    setErr('');
    try {
      const r = await apiFetch(apiUrl(`/customers/${customerId}/manual-income`), {
        authUser: currentUser as never,
      });
      if (r.ok) setRows(await r.json());
      else setErr('טעינת ההכנסות הידניות נכשלה');
    } catch {
      setErr('טעינת ההכנסות הידניות נכשלה');
    } finally {
      setLoading(false);
    }
  }, [valid, customerId, currentUser]);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setAmount('');
    setNote('');
    setDate(todayInput());
  };

  const save = async () => {
    if (!valid) return;
    const amt = Number(String(amount).replace(/[,\s₪]/g, ''));
    if (!Number.isFinite(amt) || amt <= 0) {
      setErr('יש להזין סכום תקין');
      return;
    }
    if (!note.trim()) {
      setErr('חובה לרשום הערה המסבירה מדוע ההכנסה נרשמה ידנית');
      return;
    }
    setSaving(true);
    setErr('');
    try {
      const r = await apiFetch(apiUrl(`/customers/${customerId}/manual-income`), {
        method: 'POST',
        authUser: currentUser as never,
        body: JSON.stringify({
          amount: amt,
          note: note.trim(),
          date: date ? new Date(date + 'T12:00:00').toISOString() : undefined,
        }),
      });
      if (r.ok) {
        resetForm();
        setOpen(false);
        await load();
      } else {
        const j = await r.json().catch(() => null);
        setErr(j?.message || 'הוספת ההכנסה נכשלה');
      }
    } catch {
      setErr('הוספת ההכנסה נכשלה');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: ManualIncome) => {
    if (!valid) return;
    if (!window.confirm(`למחוק הכנסה ידנית על סך ${fmtAmount(row.amount)} ₪?`)) return;
    try {
      const r = await apiFetch(apiUrl(`/customers/${customerId}/manual-income/${row.id}`), {
        method: 'DELETE',
        authUser: currentUser as never,
      });
      if (r.ok) await load();
      else setErr('מחיקת ההכנסה נכשלה');
    } catch {
      setErr('מחיקת ההכנסה נכשלה');
    }
  };

  const total = rows.reduce((a, r) => a + (Number(r.amount) || 0), 0);

  return (
    <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-blue-50/40 p-4" dir="rtl">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100">
            <Wallet className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-800">הכנסה ידנית</div>
            <div className="text-[11px] text-slate-400">רשום הכנסה שלא נכנסה דרך הצעת מחיר — תיספר בהכנסות</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => { setErr(''); setOpen((o) => !o); }}
          disabled={!valid}
          className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-white transition ${
            valid ? 'cursor-pointer hover:brightness-110' : 'cursor-not-allowed opacity-50'
          }`}
          style={{ background: '#4f46e5' }}
        >
          <Plus className="h-4 w-4" />
          הוסף הכנסה
        </button>
      </div>

      {!valid && (
        <div className="rounded-xl bg-white/70 px-3 py-2 text-xs text-amber-600">
          יש לשמור את הלקוח לפני רישום הכנסה ידנית.
        </div>
      )}

      {valid && open && (
        <div className="mb-3 rounded-xl border border-indigo-100 bg-white p-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">סכום (₪)</label>
              <input
                type="text"
                inputMode="numeric"
                autoFocus
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="לדוגמה: 3500"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-indigo-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">תאריך</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-400"
              />
            </div>
          </div>
          <label className="mb-1 mt-2 flex items-center gap-1 text-xs font-bold text-slate-600">
            <StickyNote className="h-3.5 w-3.5" /> הערה — מדוע נרשם ידנית (חובה)
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="לדוגמה: תשלום במזומן שהתקבל ישירות / הכנסה מפרויקט ללא הצעת מחיר במערכת"
            className="w-full resize-y rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-400"
          />
          {err && <div className="mt-2 text-xs text-red-500">{err}</div>}
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => { setOpen(false); resetForm(); setErr(''); }}
              disabled={saving}
              className="rounded-xl px-3 py-2 text-xs font-bold text-slate-500 transition hover:bg-slate-100 disabled:opacity-50"
            >
              ביטול
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-white transition hover:brightness-110 disabled:opacity-50"
              style={{ background: '#4f46e5' }}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {saving ? 'שומר…' : 'שמור הכנסה'}
            </button>
          </div>
        </div>
      )}

      {valid && (
        loading ? (
          <div className="flex items-center gap-2 py-3 text-xs text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> טוען…
          </div>
        ) : rows.length === 0 ? (
          !open && (
            <div className="rounded-xl border border-dashed border-indigo-200 bg-white/60 px-3 py-4 text-center text-xs text-slate-400">
              עדיין לא נרשמו הכנסות ידניות
            </div>
          )
        ) : (
          <div className="space-y-2">
            {rows.map((row) => (
              <div
                key={row.id}
                className="flex items-start justify-between gap-2 rounded-xl border border-indigo-100 bg-white px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-indigo-700">{fmtAmount(row.amount)} ₪</span>
                    {row.at && (
                      <span className="text-[10px] text-slate-400">
                        {new Date(row.at).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </span>
                    )}
                  </div>
                  {row.note && <div className="mt-0.5 truncate text-xs text-slate-600" title={row.note}>{row.note}</div>}
                </div>
                <button
                  type="button"
                  onClick={() => void remove(row)}
                  className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-500"
                  title="מחק"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <div className="flex items-center justify-between rounded-xl bg-indigo-100/60 px-3 py-2">
              <span className="text-xs font-bold text-slate-600">סה״כ הכנסות ידניות</span>
              <span className="text-sm font-extrabold text-indigo-700">{fmtAmount(total)} ₪</span>
            </div>
          </div>
        )
      )}

      {err && !open && <div className="mt-2 text-xs text-red-500">{err}</div>}
    </div>
  );
}
