'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, apiUrl, type ApiAuthUser } from './lib/api-base';
import { formatIsraeliPhoneDisplay } from './lib/phone-format';
import { Handshake, Plus, RefreshCw, CheckCircle2, ArrowLeftRight } from 'lucide-react';

type AppUser = ApiAuthUser & { name?: string };

type ReferralRow = {
  id: string; customerName: string; customerPhone: string | null; customerEmail: string | null;
  serviceType: string | null; note: string | null; status: string;
  leadId: string | null; taskId: string | null;
  paidAmount: number | null; commissionPct: number | null; commissionAmount: number | null;
  paidAt: string | null; commissionSettledAt: string | null; createdAt: string;
  affiliateName: string; affiliateId: string;
};
type AffiliateRow = {
  id: string; name: string; username: string; commissionPct: number;
  contactName: string | null; email: string | null; phone: string | null; isActive: boolean;
  _count?: { referrals: number };
};

const STATUS: { value: string; label: string }[] = [
  { value: 'NEW', label: 'התקבל' },
  { value: 'IN_PROGRESS', label: 'בטיפול' },
  { value: 'WON', label: 'נסגר (שילם)' },
  { value: 'LOST', label: 'לא רלוונטי' },
];
const statusLabel = (s: string) => STATUS.find((x) => x.value === s)?.label || s;
const ils = (n: number | null | undefined) => (n == null ? '—' : `₪${Number(n).toLocaleString('he-IL')}`);

export function AffiliatesAdminPage({ currentUser }: { currentUser: AppUser }) {
  const [tab, setTab] = useState<'referrals' | 'affiliates'>('referrals');
  const [referrals, setReferrals] = useState<ReferralRow[]>([]);
  const [affiliates, setAffiliates] = useState<AffiliateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [showNew, setShowNew] = useState(false);
  const isManager = currentUser.role === 'admin' || currentUser.role === 'manager';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r1, r2] = await Promise.all([
        apiFetch(apiUrl('/affiliate-admin/referrals'), { authUser: currentUser }),
        apiFetch(apiUrl('/affiliate-admin/affiliates'), { authUser: currentUser }),
      ]);
      if (r1.ok) setReferrals(await r1.json());
      if (r2.ok) setAffiliates(await r2.json());
    } catch { /* keep */ } finally { setLoading(false); }
  }, [currentUser]);

  useEffect(() => { void load(); }, [load]);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 4000); };

  const updateReferral = async (id: string, patch: Record<string, unknown>) => {
    const res = await apiFetch(apiUrl(`/affiliate-admin/referrals/${id}`), {
      method: 'PATCH', authUser: currentUser, body: JSON.stringify(patch),
    });
    if (res.ok) { const upd = await res.json(); setReferrals((p) => p.map((r) => r.id === id ? { ...r, ...upd } : r)); }
    else flash('העדכון נכשל');
  };

  const settle = async (id: string) => {
    if (!window.confirm('לסמן שהעמלה שולמה לשותף?')) return;
    const res = await apiFetch(apiUrl(`/affiliate-admin/referrals/${id}/settle`), { method: 'POST', authUser: currentUser });
    if (res.ok) { const upd = await res.json(); setReferrals((p) => p.map((r) => r.id === id ? { ...r, ...upd } : r)); flash('סומן כשולם לשותף'); }
    else flash('לא ניתן לסמן — נדרשת הרשאת ADMIN/MANAGER/BILLING');
  };

  // הפיכת הפניה לליד (מהזרימה הקיימת) — יוצר Lead ומקשר את ההפניה אליו.
  const convertToLead = async (r: ReferralRow) => {
    if (r.leadId) { flash('כבר מקושר לליד'); return; }
    const res = await apiFetch(apiUrl('/leads'), {
      method: 'POST', authUser: currentUser,
      body: JSON.stringify({
        fullName: r.customerName, firstName: r.customerName, phone: r.customerPhone || '',
        email: r.customerEmail || '', serviceType: r.serviceType || '', service: r.serviceType || '',
        source: 'אחר', referralCompany: r.affiliateName, notes: r.note || `הפניה משותף: ${r.affiliateName}`,
      }),
    });
    if (res.ok) {
      const lead = await res.json();
      await updateReferral(r.id, { leadId: lead.id, status: 'IN_PROGRESS' });
      flash('נוצר ליד וקושר להפניה — אפשר לטפל בו במסך הלידים');
    } else { flash('יצירת הליד נכשלה'); }
  };

  const owedTotal = referrals.filter((r) => r.commissionAmount && !r.commissionSettledAt).reduce((s, r) => s + (r.commissionAmount || 0), 0);

  return (
    <div dir="rtl" className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
          <Handshake className="h-6 w-6 text-blue-600" /> שותפים — הפניות ועמלות
        </h1>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-bold text-blue-700">עמלות שאנחנו חייבים: {ils(owedTotal)}</span>
          <button onClick={() => void load()} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"><RefreshCw className="h-4 w-4" /> רענן</button>
        </div>
      </div>

      <div className="mb-4 flex gap-2">
        <button onClick={() => setTab('referrals')} className={tabCls(tab === 'referrals')}>הפניות ({referrals.length})</button>
        <button onClick={() => setTab('affiliates')} className={tabCls(tab === 'affiliates')}>שותפים ({affiliates.length})</button>
      </div>

      {msg && <div className="mb-3 rounded-lg bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">{msg}</div>}
      {loading && <div className="py-8 text-center text-sm text-slate-400">טוען…</div>}

      {!loading && tab === 'referrals' && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {referrals.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">אין הפניות עדיין. שותפים ישלחו לקוחות דרך פורטל /affiliate.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-right">לקוח</th>
                  <th className="px-3 py-2 text-right">שותף</th>
                  <th className="px-3 py-2 text-right">שירות</th>
                  <th className="px-3 py-2 text-right">סטטוס</th>
                  <th className="px-3 py-2 text-right">עמלה</th>
                  <th className="px-3 py-2 text-right">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {referrals.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">
                      <div className="font-semibold text-slate-800">{r.customerName}</div>
                      <div className="text-xs text-slate-500">{[formatIsraeliPhoneDisplay(r.customerPhone), r.customerEmail].filter(Boolean).join(' · ') || '—'}</div>
                    </td>
                    <td className="px-3 py-2 text-slate-600">{r.affiliateName}</td>
                    <td className="px-3 py-2 text-slate-600">{r.serviceType || '—'}</td>
                    <td className="px-3 py-2">
                      <select value={r.status} onChange={(e) => void updateReferral(r.id, { status: e.target.value })}
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs">
                        {STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      {r.commissionAmount != null ? (
                        <div>
                          <div className="font-bold text-emerald-700">{ils(r.commissionAmount)}</div>
                          <div className="text-[11px] text-slate-400">{r.commissionPct}% · {r.commissionSettledAt ? 'שולם לשותף' : 'ממתין'}</div>
                        </div>
                      ) : <span className="text-xs text-slate-400">טרם שולם</span>}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1.5">
                        {!r.leadId && (
                          <button onClick={() => void convertToLead(r)} className="flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-700 hover:bg-blue-100">
                            <ArrowLeftRight className="h-3 w-3" /> הפוך לליד
                          </button>
                        )}
                        {r.leadId && <span className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-500">מקושר לליד</span>}
                        {r.commissionAmount != null && !r.commissionSettledAt && (
                          <button onClick={() => void settle(r.id)} className="flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100">
                            <CheckCircle2 className="h-3 w-3" /> שולם לשותף
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {!loading && tab === 'affiliates' && (
        <div>
          {isManager && (
            <div className="mb-3">
              <button onClick={() => setShowNew((v) => !v)} className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">
                <Plus className="h-4 w-4" /> {showNew ? 'סגור' : 'שותף חדש'}
              </button>
            </div>
          )}
          {showNew && isManager && <NewAffiliateForm currentUser={currentUser} onDone={() => { setShowNew(false); void load(); flash('השותף נוצר'); }} />}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            {affiliates.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-400">אין שותפים. {isManager ? 'לחץ "שותף חדש".' : ''}</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr><th className="px-3 py-2 text-right">שם</th><th className="px-3 py-2 text-right">שם משתמש</th><th className="px-3 py-2 text-right">עמלה</th><th className="px-3 py-2 text-right">הפניות</th><th className="px-3 py-2 text-right">קשר</th></tr>
                </thead>
                <tbody>
                  {affiliates.map((a) => (
                    <tr key={a.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-semibold text-slate-800">{a.name}</td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-500">{a.username}</td>
                      <td className="px-3 py-2 text-slate-600">{a.commissionPct}%</td>
                      <td className="px-3 py-2 text-slate-600">{a._count?.referrals ?? 0}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">{[a.contactName, a.email, formatIsraeliPhoneDisplay(a.phone)].filter(Boolean).join(' · ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NewAffiliateForm({ currentUser, onDone }: { currentUser: AppUser; onDone: () => void }) {
  const [f, setF] = useState({ name: '', username: '', password: '', commissionPct: '10', contactName: '', email: '', phone: '' });
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

  const inp = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400';
  const lbl = 'mb-1 block text-xs font-semibold text-slate-600';
  return (
    <form onSubmit={submit} className="mb-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div><label className={lbl}>שם החברה *</label><input className={inp} value={f.name} onChange={(e) => set('name', e.target.value)} required /></div>
        <div><label className={lbl}>שם משתמש *</label><input className={inp} value={f.username} onChange={(e) => set('username', e.target.value)} autoCapitalize="none" required /></div>
        <div><label className={lbl}>סיסמה *</label><input className={inp} value={f.password} onChange={(e) => set('password', e.target.value)} required /></div>
        <div><label className={lbl}>עמלה (%)</label><input className={inp} value={f.commissionPct} onChange={(e) => set('commissionPct', e.target.value)} /></div>
        <div><label className={lbl}>איש קשר</label><input className={inp} value={f.contactName} onChange={(e) => set('contactName', e.target.value)} /></div>
        <div><label className={lbl}>אימייל</label><input className={inp} value={f.email} onChange={(e) => set('email', e.target.value)} /></div>
      </div>
      <button type="submit" disabled={busy} className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">{busy ? 'יוצר…' : 'צור שותף'}</button>
      {err && <div className="mt-2 text-sm text-red-600">{err}</div>}
    </form>
  );
}

function tabCls(active: boolean) {
  return `rounded-lg px-4 py-2 text-sm font-bold transition ${active ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`;
}
