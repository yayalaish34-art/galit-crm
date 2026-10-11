'use client';

/**
 * דשבורד "המכירות שלי" — איש המכירות הפנימי שלנו רואה ומנהל את החברות
 * (affiliates) שהוא גייס לתוכנית השותפים. חברות אלו משתמשות ב-/affiliate
 * כדי לשלוח לידים דרך "שלח לקוח חדש". כאן הוא: מוסיף חברה חדשה (עם יוזר/סיסמה),
 * מגדיר אחוז עמלה, רואה כמה לידים הגיעו וכמה עמלה הוא ייצר, שומר הערות
 * ותזכורת פולו-אפ, ומאפס סיסמה כשצריך.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Handshake, Plus, RefreshCw, KeyRound, Pencil, X, Check, Phone, Mail,
  CalendarClock, PowerOff, Power,
} from 'lucide-react';
import { apiFetch, apiUrl, type ApiAuthUser } from './lib/api-base';
import { formatIsraeliPhoneDisplay } from './lib/phone-format';

type AppUser = ApiAuthUser & { name?: string };

type Row = {
  id: string;
  name: string;
  username: string;
  commissionPct: number;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
  salesNotes: string | null;
  nextFollowupAt: string | null;
  recruitedByUserId: string | null;
  stats: {
    totalReferrals: number;
    won: number;
    totalCommission: number;
    owedCommission: number;
    paidCommission: number;
    lastReferralAt: string | null;
  };
};

const ils = (n: number | null | undefined) => (n == null ? '—' : `₪${Number(n).toLocaleString('he-IL')}`);
const fmtDate = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
};
const toInputDate = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
};

export function MyB2BSalesPage({ currentUser }: { currentUser: AppUser }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [passwordForId, setPasswordForId] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // mine=1 — רק החברות שהיוזר הנוכחי גייס. ADMIN רואה את שלו ברירת מחדל; יש פילטר להצגת הכל.
      const res = await apiFetch(apiUrl('/affiliate-admin/affiliates?mine=1'), { authUser: currentUser });
      if (res.ok) setRows(await res.json());
    } catch { /* keep */ } finally { setLoading(false); }
  }, [currentUser]);

  useEffect(() => { void load(); }, [load]);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 4000); };

  const totals = useMemo(() => {
    const activeCount = rows.filter((r) => r.isActive).length;
    const totalReferrals = rows.reduce((s, r) => s + r.stats.totalReferrals, 0);
    const totalCommission = rows.reduce((s, r) => s + r.stats.totalCommission, 0);
    const owedCommission = rows.reduce((s, r) => s + r.stats.owedCommission, 0);
    return { activeCount, totalReferrals, totalCommission, owedCommission };
  }, [rows]);

  const patchRow = async (id: string, patch: Record<string, unknown>) => {
    const res = await apiFetch(apiUrl(`/affiliate-admin/affiliates/${id}`), {
      method: 'PATCH', authUser: currentUser, body: JSON.stringify(patch),
    });
    if (res.ok) {
      const upd = await res.json();
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...upd } : r)));
      flash('עודכן');
    } else {
      const j = await res.json().catch(() => ({}));
      flash(j?.message || 'העדכון נכשל');
    }
  };

  const resetPassword = async (id: string, newPassword: string) => {
    const res = await apiFetch(apiUrl(`/affiliate-admin/affiliates/${id}/password`), {
      method: 'POST', authUser: currentUser, body: JSON.stringify({ password: newPassword }),
    });
    if (res.ok) {
      setPasswordForId(null);
      flash('הסיסמה שונתה');
    } else {
      const j = await res.json().catch(() => ({}));
      flash(j?.message || 'איפוס הסיסמה נכשל');
    }
  };

  return (
    <div dir="rtl" className="mx-auto max-w-6xl px-4 py-6">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
          <Handshake className="h-6 w-6 text-emerald-600" />
          המכירות שלי — חברות שגייסתי
        </h1>
        <button
          onClick={() => void load()}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
        >
          <RefreshCw className="h-4 w-4" /> רענן
        </button>
      </div>

      {/* KPI tiles */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile title="חברות פעילות" value={String(totals.activeCount)} tint="bg-emerald-50 text-emerald-700 ring-emerald-200" />
        <Tile title='סה"כ לידים מהחברות' value={String(totals.totalReferrals)} tint="bg-blue-50 text-blue-700 ring-blue-200" />
        <Tile title="עמלה שהחברות הרוויחו" value={ils(totals.totalCommission)} tint="bg-amber-50 text-amber-700 ring-amber-200" />
        <Tile title="עמלה שעוד לא שולמה" value={ils(totals.owedCommission)} tint="bg-rose-50 text-rose-700 ring-rose-200" />
      </div>

      {msg && <div className="mb-3 rounded-lg bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">{msg}</div>}

      {/* Add new */}
      <div className="mb-3">
        <button
          onClick={() => setShowNew((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700"
        >
          <Plus className="h-4 w-4" /> {showNew ? 'סגור' : 'חברה חדשה שסגרתי'}
        </button>
      </div>

      {showNew && (
        <NewCompanyForm
          currentUser={currentUser}
          onDone={() => { setShowNew(false); void load(); flash('החברה נוספה — אפשר להעביר לה את פרטי ההתחברות'); }}
          onCancel={() => setShowNew(false)}
        />
      )}

      {/* Table */}
      {loading ? (
        <div className="py-10 text-center text-sm text-slate-400">טוען…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white py-12 text-center">
          <Handshake className="mx-auto mb-2 h-10 w-10 text-slate-300" />
          <div className="text-sm font-semibold text-slate-600">עוד לא גייסת חברות</div>
          <div className="mt-1 text-xs text-slate-400">סגרת עסקה עם חברה שתזרים לידים? לחצ/י "חברה חדשה שסגרתי".</div>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <CompanyCard
              key={r.id}
              row={r}
              editing={editingId === r.id}
              onEdit={() => setEditingId(r.id)}
              onCancelEdit={() => setEditingId(null)}
              onSave={async (patch) => { await patchRow(r.id, patch); setEditingId(null); }}
              onToggleActive={() => void patchRow(r.id, { isActive: !r.isActive })}
              onFollowupChange={(d) => void patchRow(r.id, { nextFollowupAt: d || null })}
              onNotesChange={(n) => void patchRow(r.id, { salesNotes: n || null })}
              onResetPassword={() => setPasswordForId(r.id)}
            />
          ))}
        </div>
      )}

      {passwordForId && (
        <PasswordModal
          onCancel={() => setPasswordForId(null)}
          onSubmit={(pw) => void resetPassword(passwordForId, pw)}
        />
      )}
    </div>
  );
}

/* ─────────────────────────  Tile  ───────────────────────── */

function Tile({ title, value, tint }: { title: string; value: string; tint: string }) {
  return (
    <div className={`rounded-xl p-3 ring-1 ${tint}`}>
      <div className="text-[11px] font-semibold opacity-80">{title}</div>
      <div className="mt-1 text-xl font-bold">{value}</div>
    </div>
  );
}

/* ─────────────────────────  Company card  ───────────────────────── */

function CompanyCard({
  row, editing, onEdit, onCancelEdit, onSave, onToggleActive,
  onFollowupChange, onNotesChange, onResetPassword,
}: {
  row: Row;
  editing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (patch: Record<string, unknown>) => void | Promise<void>;
  onToggleActive: () => void;
  onFollowupChange: (iso: string) => void;
  onNotesChange: (notes: string) => void;
  onResetPassword: () => void;
}) {
  const [notesDraft, setNotesDraft] = useState(row.salesNotes || '');
  const [notesDirty, setNotesDirty] = useState(false);
  useEffect(() => { setNotesDraft(row.salesNotes || ''); setNotesDirty(false); }, [row.salesNotes]);

  return (
    <div className={`rounded-xl border bg-white p-4 ${row.isActive ? 'border-slate-200' : 'border-slate-200 opacity-70'}`}>
      {/* Row 1: header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-lg font-bold text-slate-900">{row.name}</div>
            {!row.isActive && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">מושבת</span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            שם משתמש בפורטל: <span className="font-mono font-semibold text-slate-700">{row.username}</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
            {row.contactName && <span>👤 {row.contactName}</span>}
            {row.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {formatIsraeliPhoneDisplay(row.phone)}</span>}
            {row.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {row.email}</span>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={onResetPassword}
            className="flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-700 hover:bg-amber-100"
            title="אפס סיסמה לחברה"
          >
            <KeyRound className="h-3 w-3" /> אפס סיסמה
          </button>
          {!editing ? (
            <button onClick={onEdit} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50">
              <Pencil className="h-3 w-3" /> ערוך
            </button>
          ) : (
            <button onClick={onCancelEdit} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50">
              <X className="h-3 w-3" /> בטל
            </button>
          )}
          <button
            onClick={onToggleActive}
            className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-bold ${row.isActive ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100' : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
            title={row.isActive ? 'השבת גישה לחברה' : 'הפעל גישה מחדש'}
          >
            {row.isActive ? <PowerOff className="h-3 w-3" /> : <Power className="h-3 w-3" />}
            {row.isActive ? 'השבת' : 'הפעל'}
          </button>
        </div>
      </div>

      {/* Row 2: stats */}
      <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-2 text-center text-xs sm:grid-cols-5">
        <Stat label="לידים" value={row.stats.totalReferrals} />
        <Stat label="נסגרו" value={row.stats.won} />
        <Stat label="עמלה %" value={`${row.commissionPct}%`} />
        <Stat label="עמלה כוללת" value={ils(row.stats.totalCommission)} />
        <Stat label='עמלה שלא שולמה' value={ils(row.stats.owedCommission)} />
      </div>

      {/* Row 3: edit form OR follow-up+notes */}
      {editing ? (
        <EditForm row={row} onCancel={onCancelEdit} onSave={onSave} />
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-slate-500">
              <CalendarClock className="h-3 w-3" /> תזכורת למעקב הבא
            </label>
            <input
              type="date"
              defaultValue={toInputDate(row.nextFollowupAt)}
              onBlur={(e) => { if (e.target.value !== toInputDate(row.nextFollowupAt)) onFollowupChange(e.target.value); }}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            {row.nextFollowupAt && <div className="mt-1 text-[11px] text-slate-400">מתוזמן ל-{fmtDate(row.nextFollowupAt)}</div>}
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-slate-500">הערות מעקב (פנימי)</label>
            <textarea
              value={notesDraft}
              onChange={(e) => { setNotesDraft(e.target.value); setNotesDirty(true); }}
              onBlur={() => { if (notesDirty) { onNotesChange(notesDraft); setNotesDirty(false); } }}
              rows={2}
              placeholder="שיחה אחרונה, סיכומים, דברים לתזכר..."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
        </div>
      )}

      {/* Row 4: footer meta */}
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">
        <span>נוסף: {fmtDate(row.createdAt)}</span>
        {row.stats.lastReferralAt && <span>· ליד אחרון: {fmtDate(row.stats.lastReferralAt)}</span>}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md bg-white px-2 py-1.5 ring-1 ring-slate-200">
      <div className="text-[10px] text-slate-500">{label}</div>
      <div className="mt-0.5 text-sm font-bold text-slate-800">{value}</div>
    </div>
  );
}

/* ─────────────────────────  Edit form (inline)  ───────────────────────── */

function EditForm({
  row, onCancel, onSave,
}: {
  row: Row;
  onCancel: () => void;
  onSave: (patch: Record<string, unknown>) => void | Promise<void>;
}) {
  const [f, setF] = useState({
    name: row.name,
    commissionPct: String(row.commissionPct ?? ''),
    contactName: row.contactName || '',
    email: row.email || '',
    phone: row.phone || '',
  });
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    await onSave({
      name: f.name,
      commissionPct: parseFloat(f.commissionPct) || row.commissionPct,
      contactName: f.contactName || null,
      email: f.email || null,
      phone: f.phone || null,
    });
    setBusy(false);
  };

  const inp = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400';
  const lbl = 'mb-1 block text-[11px] font-semibold text-slate-600';
  return (
    <form onSubmit={submit} className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div><label className={lbl}>שם החברה</label><input className={inp} value={f.name} onChange={(e) => set('name', e.target.value)} required /></div>
        <div><label className={lbl}>עמלה (%)</label><input className={inp} value={f.commissionPct} onChange={(e) => set('commissionPct', e.target.value)} /></div>
        <div><label className={lbl}>איש קשר</label><input className={inp} value={f.contactName} onChange={(e) => set('contactName', e.target.value)} /></div>
        <div><label className={lbl}>טלפון</label><input className={inp} value={f.phone} onChange={(e) => set('phone', e.target.value)} /></div>
        <div><label className={lbl}>אימייל</label><input className={inp} value={f.email} onChange={(e) => set('email', e.target.value)} /></div>
      </div>
      <div className="mt-3 flex gap-2">
        <button type="submit" disabled={busy} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
          <Check className="h-4 w-4" /> שמור שינויים
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">בטל</button>
      </div>
    </form>
  );
}

/* ─────────────────────────  New company form  ───────────────────────── */

function NewCompanyForm({
  currentUser, onDone, onCancel,
}: {
  currentUser: AppUser;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [f, setF] = useState({ name: '', username: '', password: '', commissionPct: '10', contactName: '', email: '', phone: '', salesNotes: '', nextFollowupAt: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const res = await apiFetch(apiUrl('/affiliate-admin/affiliates'), {
        method: 'POST', authUser: currentUser,
        body: JSON.stringify({ ...f, commissionPct: parseFloat(f.commissionPct) || 10 }),
      });
      if (res.ok) { onDone(); return; }
      const j = await res.json().catch(() => ({})); setErr(j?.message || 'היצירה נכשלה');
    } catch { setErr('שגיאת רשת'); }
    setBusy(false);
  };

  const inp = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400';
  const lbl = 'mb-1 block text-[11px] font-semibold text-slate-600';
  return (
    <form onSubmit={submit} className="mb-3 rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50/50 p-4">
      <div className="mb-2 text-sm font-bold text-emerald-800">סגרת עסקה עם חברה שתזרים לידים? מלא/י פרטים — הם ייכנסו עם זה ל-/affiliate.</div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div><label className={lbl}>שם החברה *</label><input className={inp} value={f.name} onChange={(e) => set('name', e.target.value)} required /></div>
        <div><label className={lbl}>שם משתמש *</label><input className={inp} value={f.username} onChange={(e) => set('username', e.target.value)} autoCapitalize="none" required /></div>
        <div><label className={lbl}>סיסמה * (6+ תווים)</label><input className={inp} value={f.password} onChange={(e) => set('password', e.target.value)} required /></div>
        <div><label className={lbl}>עמלה (%)</label><input className={inp} value={f.commissionPct} onChange={(e) => set('commissionPct', e.target.value)} /></div>
        <div><label className={lbl}>איש קשר</label><input className={inp} value={f.contactName} onChange={(e) => set('contactName', e.target.value)} /></div>
        <div><label className={lbl}>טלפון</label><input className={inp} value={f.phone} onChange={(e) => set('phone', e.target.value)} /></div>
        <div><label className={lbl}>אימייל</label><input className={inp} value={f.email} onChange={(e) => set('email', e.target.value)} /></div>
        <div>
          <label className={lbl}>תזכורת לפולו-אפ הבא</label>
          <input type="date" className={inp} value={f.nextFollowupAt} onChange={(e) => set('nextFollowupAt', e.target.value)} />
        </div>
        <div className="sm:col-span-3">
          <label className={lbl}>הערות מעקב (פנימי)</label>
          <textarea className={inp} rows={2} value={f.salesNotes} onChange={(e) => set('salesNotes', e.target.value)} />
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button type="submit" disabled={busy} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
          {busy ? 'יוצר…' : 'צור חברה'}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">בטל</button>
      </div>
      {err && <div className="mt-2 text-sm text-red-600">{err}</div>}
    </form>
  );
}

/* ─────────────────────────  Password reset modal  ───────────────────────── */

function PasswordModal({ onCancel, onSubmit }: { onCancel: () => void; onSubmit: (pw: string) => void }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 6) { setErr('סיסמה חייבת לפחות 6 תווים'); return; }
    onSubmit(pw);
  };
  return (
    <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} dir="rtl" className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800"><KeyRound className="h-5 w-5 text-amber-600" /> איפוס סיסמה</h3>
          <button type="button" onClick={onCancel} className="rounded-full p-1 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <p className="mb-3 text-xs text-slate-500">הסיסמה החדשה תחליף מיד את הקיימת. העבר/י אותה לחברה.</p>
        <input
          autoFocus
          type="text"
          value={pw}
          onChange={(e) => { setPw(e.target.value); setErr(''); }}
          placeholder="סיסמה חדשה (6+ תווים)"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400"
        />
        {err && <div className="mt-2 text-xs text-red-600">{err}</div>}
        <div className="mt-4 flex gap-2">
          <button type="submit" className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700">אפס עכשיו</button>
          <button type="button" onClick={onCancel} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">בטל</button>
        </div>
      </form>
    </div>
  );
}
