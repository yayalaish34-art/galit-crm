'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiUrl } from '../lib/api-base';
import { formatIsraeliPhoneDisplay } from '../lib/phone-format';

// פורטל השותפים (צד שלישי) — עצמאי, זהות נפרדת מהאפליקציה הראשית (טוקן משלו).
const AFF_TOKEN_KEY = 'galit-affiliate-token';

type Journey = {
  step: number; title: string; message: string; done: boolean; lost: boolean; reason: string | null;
};
type Referral = {
  id: string; customerName: string; customerPhone: string | null; customerEmail: string | null;
  serviceType: string | null; status: string; paidAmount: number | null;
  commissionAmount: number | null; commissionSettledAt: string | null; createdAt: string; paidAt: string | null;
  /** מסע הלקוח בן 4 השלבים (מה-CRM). */
  journey?: Journey;
};
type MeData = {
  affiliate: { name: string; username: string; commissionPct: number };
  stats: { totalReferrals: number; won: number; totalCommission: number; owedCommission: number; paidCommission: number };
  referrals: Referral[];
};

// שלבי מסע הלקוח (סגנון וולט) — 4 עמדות.
const JOURNEY_STEPS = ['התקבל', 'בטיפול', 'הצעה חתומה', 'שולם'];
const ils = (n: number | null | undefined) => (n == null ? '—' : `₪${Number(n).toLocaleString('he-IL')}`);

export default function AffiliatePortal() {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try { setToken(localStorage.getItem(AFF_TOKEN_KEY)); } catch { /* ignore */ }
    setReady(true);
  }, []);

  const onLoggedIn = (t: string) => { try { localStorage.setItem(AFF_TOKEN_KEY, t); } catch { /* ignore */ } setToken(t); };
  const onLogout = () => { try { localStorage.removeItem(AFF_TOKEN_KEY); } catch { /* ignore */ } setToken(null); };

  if (!ready) return null;
  return (
    <div dir="rtl" style={{ minHeight: '100dvh', background: 'linear-gradient(160deg,#f4faf3,#eef4fb)', fontFamily: 'system-ui,-apple-system,Segoe UI,Arial,sans-serif' }}>
      {token ? <Dashboard token={token} onLogout={onLogout} on401={onLogout} /> : <Login onLoggedIn={onLoggedIn} />}
    </div>
  );
}

function Login({ onLoggedIn }: { onLoggedIn: (t: string) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const res = await fetch(apiUrl('/affiliate/login'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) { const j = await res.json(); onLoggedIn(j.accessToken); return; }
      const j = await res.json().catch(() => ({}));
      setErr(j?.message || 'שם משתמש או סיסמה שגויים');
    } catch { setErr('שגיאת רשת — נסו שוב'); }
    setBusy(false);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', padding: 20 }}>
      <form onSubmit={submit} style={{ width: '100%', maxWidth: 380, background: '#fff', borderRadius: 20, padding: '28px 24px', boxShadow: '0 12px 40px rgba(37,99,235,.12)' }}>
        <div style={{ textAlign: 'center', fontSize: 40 }}>🤝</div>
        <h1 style={{ textAlign: 'center', fontSize: 20, margin: '4px 0' }}>פורטל שותפים</h1>
        <p style={{ textAlign: 'center', color: '#6b7280', fontSize: 13, margin: '0 0 20px' }}>כניסה עם שם משתמש וסיסמה</p>
        <label style={lbl}>שם משתמש</label>
        <input value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" required style={inp} />
        <label style={lbl}>סיסמה</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={inp} />
        <button type="submit" disabled={busy} style={{ ...btn, opacity: busy ? 0.6 : 1 }}>{busy ? 'מתחבר…' : 'התחבר'}</button>
        {err && <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 10, background: '#fef2f2', color: '#b91c1c', fontSize: 13, textAlign: 'center' }}>{err}</div>}
      </form>
    </div>
  );
}

function Dashboard({ token, onLogout, on401 }: { token: string; onLogout: () => void; on401: () => void }) {
  const [data, setData] = useState<MeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  // פילטר עמלות לפי תאריך (לוח שנה) — לפי מועד התשלום (paidAt).
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl('/affiliate/me'), { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401) { on401(); return; }
      if (res.ok) setData(await res.json());
    } catch { /* keep */ } finally { setLoading(false); }
  }, [token, on401]);

  useEffect(() => { void load(); }, [load]);

  if (loading && !data) return <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>טוען…</div>;
  if (!data) return <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>לא ניתן לטעון נתונים.</div>;

  // ── עמלה שמגיעה בטווח התאריכים שנבחר (לפי paidAt) ──
  const inRange = (iso: string | null | undefined): boolean => {
    if (!iso) return false;
    const d = iso.slice(0, 10);
    if (fromDate && d < fromDate) return false;
    if (toDate && d > toDate) return false;
    return true;
  };
  // "עמלה שמגיעה" = עמלה שנצברה (הלקוח שילם) אך טרם שולמה לשותף. מסונן לפי טווח התאריכים.
  const owedInRange = data.referrals
    .filter((r) => r.commissionAmount != null && !r.commissionSettledAt && r.paidAt && inRange(r.paidAt))
    .reduce((s, r) => s + (r.commissionAmount || 0), 0);
  const owedCount = data.referrals.filter((r) => r.commissionAmount != null && !r.commissionSettledAt && r.paidAt && inRange(r.paidAt)).length;
  const dateActive = !!(fromDate || toDate);

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a' }}>{data.affiliate.name}</div>
        </div>
        <button onClick={onLogout} style={{ ...btnGhost }}>יציאה</button>
      </div>

      {/* ── כרטיס עמלה שמגיעה (בלבד) + פילטר תאריכים ── */}
      <div style={{ background: 'linear-gradient(135deg,#059669,#0d9488)', borderRadius: 20, padding: '22px 20px', color: '#fff', boxShadow: '0 10px 30px rgba(5,150,105,.25)', marginBottom: 18 }}>
        <div style={{ fontSize: 13, opacity: .9, fontWeight: 600 }}>{dateActive ? 'עמלה שמגיעה (בטווח שנבחר)' : 'סה״כ עמלה שמגיעה לך'}</div>
        <div style={{ fontSize: 40, fontWeight: 900, marginTop: 4, letterSpacing: '-.02em' }}>{ils(Math.round(owedInRange * 100) / 100)}</div>
        <div style={{ fontSize: 12.5, opacity: .9, marginTop: 2 }}>{owedCount} לקוחות ששילמו וממתינים לתשלום עמלה</div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end', marginTop: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, opacity: .9, marginBottom: 3 }}>מתאריך</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} style={dateInp} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, opacity: .9, marginBottom: 3 }}>עד תאריך</label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} style={dateInp} />
          </div>
          {dateActive && (
            <button onClick={() => { setFromDate(''); setToDate(''); }} style={{ background: 'rgba(255,255,255,.2)', border: 0, color: '#fff', borderRadius: 10, padding: '8px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>נקה</button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>הלקוחות שהפניתי</div>
        <button onClick={() => setShowForm((v) => !v)} style={btn}>{showForm ? 'סגור' : '+ שלח לקוח חדש'}</button>
      </div>

      {showForm && <SubmitForm token={token} onDone={() => { setShowForm(false); void load(); }} />}

      {data.referrals.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 16, padding: 28, textAlign: 'center', color: '#94a3b8', fontSize: 14, boxShadow: '0 6px 18px rgba(15,23,42,.06)' }}>עדיין לא שלחת לקוחות. לחץ "שלח לקוח חדש".</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {data.referrals.map((r) => <ReferralCard key={r.id} r={r} />)}
        </div>
      )}
    </div>
  );
}

/** כרטיס לקוח בסגנון וולט — מסע 4 שלבים + הודעה נעימה שמתעדכנת מה-CRM. */
function ReferralCard({ r }: { r: Referral }) {
  const j = r.journey;
  const step = j?.step ?? 1;
  const lost = !!j?.lost;
  const done = !!j?.done;
  // צבע הקו/העמדות: אדום אם נסגר-לא-רלוונטי, ירוק אם שולם, כחול בתהליך.
  const accent = lost ? '#e11d48' : done ? '#059669' : '#2563eb';

  return (
    <div style={{ background: '#fff', borderRadius: 18, padding: '16px 16px 14px', boxShadow: '0 6px 18px rgba(15,23,42,.06)', border: `1px solid ${lost ? '#fee2e2' : done ? '#d1fae5' : '#eef2ff'}` }}>
      {/* כותרת */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 15.5 }}>{r.customerName}</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 1 }}>
            {[r.serviceType, formatIsraeliPhoneDisplay(r.customerPhone), r.customerEmail].filter(Boolean).join(' · ') || '—'}
          </div>
        </div>
        {r.commissionAmount != null && (
          <div style={{ textAlign: 'left', flexShrink: 0 }}>
            <div style={{ fontWeight: 900, color: '#059669', fontSize: 16 }}>{ils(r.commissionAmount)}</div>
            <div style={{ fontSize: 10.5, color: r.commissionSettledAt ? '#059669' : '#94a3b8', fontWeight: 700 }}>
              {r.commissionSettledAt ? 'שולם לך ✓' : 'עמלה ממתינה'}
            </div>
          </div>
        )}
      </div>

      {/* מסלול 4 שלבים (וולט) */}
      {!lost ? (
        <div style={{ display: 'flex', alignItems: 'center', margin: '16px 4px 6px' }}>
          {JOURNEY_STEPS.map((label, i) => {
            const idx = i + 1;
            const reached = idx <= step;
            const isCurrent = idx === step;
            return (
              <div key={label} style={{ display: 'flex', alignItems: 'center', flex: i < JOURNEY_STEPS.length - 1 ? 1 : '0 0 auto' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                  <div style={{
                    width: isCurrent ? 26 : 20, height: isCurrent ? 26 : 20, borderRadius: 999,
                    background: reached ? accent : '#e2e8f0', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 800, transition: 'all .2s',
                    boxShadow: isCurrent ? `0 0 0 4px ${accent}22` : 'none',
                  }}>{reached ? (idx === 4 && done ? '✓' : idx) : idx}</div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: reached ? accent : '#94a3b8', whiteSpace: 'nowrap' }}>{label}</span>
                </div>
                {i < JOURNEY_STEPS.length - 1 && (
                  <div style={{ flex: 1, height: 3, borderRadius: 2, margin: '0 4px', marginBottom: 18, background: idx < step ? accent : '#e2e8f0' }} />
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff1f2', color: '#e11d48', borderRadius: 999, padding: '5px 12px', fontSize: 12.5, fontWeight: 800 }}>
          ✕ הפנייה נסגרה
        </div>
      )}

      {/* הודעה נעימה שמתעדכנת מה-CRM */}
      {j?.message && (
        <div style={{
          marginTop: 12, background: lost ? '#fff1f2' : done ? '#ecfdf5' : '#f8fafc',
          borderRadius: 12, padding: '11px 13px', fontSize: 13, lineHeight: 1.55,
          color: lost ? '#9f1239' : done ? '#065f46' : '#334155',
          border: `1px solid ${lost ? '#fecdd3' : done ? '#a7f3d0' : '#eef2f7'}`,
        }}>
          {j.title && <div style={{ fontWeight: 800, marginBottom: 3 }}>{j.title}</div>}
          {j.message}
        </div>
      )}
    </div>
  );
}

// סוגי השירות שלנו — dropdown לבחירת השותף (רמת קטגוריה).
const SERVICE_OPTIONS = [
  'בדיקת קרינה',
  'מיגון קרינה',
  'בדיקת ראדון',
  'בדיקת אסבסט / סקר אסבסט',
  'בדיקת רעש / אקוסטיקה',
  'איכות אוויר / עובש',
  'בדיקת מים',
  'בדיקת ריח',
  'בדיקה תרמית / דוח אנרגטי',
  'קרקע / גז קרקע',
  'גהות ורעש תעסוקתי',
  'בנייה ירוקה',
  'חוות דעת סביבתית',
  'אחר',
];

function SubmitForm({ token, onDone }: { token: string; onDone: () => void }) {
  const [f, setF] = useState({
    classification: 'PRIVATE', // PRIVATE | COMPANY
    customerName: '', companyName: '', customerPhone: '', customerEmail: '',
    serviceType: '', address: '', city: '', note: '',
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const isCompany = f.classification === 'COMPANY';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('');
    // ── ולידציה ──
    if (!f.customerName.trim()) { setErr('שם הלקוח הוא שדה חובה'); return; }
    if (isCompany && !f.companyName.trim()) { setErr('שם החברה הוא שדה חובה עבור לקוח חברה'); return; }
    if (!f.customerPhone.trim() && !f.customerEmail.trim()) { setErr('יש למלא טלפון או אימייל של הלקוח'); return; }
    if (!f.serviceType.trim()) { setErr('יש לבחור סוג שירות'); return; }
    if (!f.note.trim()) { setErr('ההערה היא שדה חובה — פרטו בקצרה את צורך הלקוח'); return; }

    setBusy(true);
    try {
      // מוסיפים את הסיווג/חברה/כתובת לתוך ההערה כדי שהצוות יראה הכל (השרת מקבל note חופשי).
      const details = [
        `סיווג: ${isCompany ? 'חברה' : 'פרטי'}`,
        isCompany && f.companyName.trim() ? `שם חברה: ${f.companyName.trim()}` : '',
        f.address.trim() ? `כתובת: ${f.address.trim()}` : '',
        f.city.trim() ? `עיר: ${f.city.trim()}` : '',
      ].filter(Boolean).join(' · ');
      const noteFull = details ? `${f.note.trim()}\n(${details})` : f.note.trim();

      const res = await fetch(apiUrl('/affiliate/me/referrals'), {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          customerName: isCompany && f.companyName.trim() ? f.companyName.trim() : f.customerName.trim(),
          customerPhone: f.customerPhone.trim(),
          customerEmail: f.customerEmail.trim(),
          serviceType: f.serviceType.trim(),
          note: noteFull,
        }),
      });
      if (res.ok) { onDone(); return; }
      const j = await res.json().catch(() => ({}));
      setErr(j?.message || 'השליחה נכשלה');
    } catch { setErr('שגיאת רשת'); }
    setBusy(false);
  };

  return (
    <form onSubmit={submit} style={{ background: '#fff', borderRadius: 16, padding: 16, marginBottom: 14, boxShadow: '0 6px 18px rgba(15,23,42,.06)' }}>
      {/* סיווג — פרטי / חברה */}
      <label style={lbl}>סיווג הלקוח *</label>
      <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
        {([['PRIVATE', 'לקוח פרטי'], ['COMPANY', 'חברה / עסק']] as const).map(([val, label]) => (
          <button
            key={val} type="button" onClick={() => set('classification', val)}
            style={{
              flex: 1, padding: '10px 12px', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer',
              border: `1.5px solid ${f.classification === val ? '#2563eb' : '#d1d5db'}`,
              background: f.classification === val ? '#eff6ff' : '#fff',
              color: f.classification === val ? '#1d4ed8' : '#64748b',
            }}
          >{label}</button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
        <div><label style={lbl}>שם הלקוח *</label><input style={inp} value={f.customerName} onChange={(e) => set('customerName', e.target.value)} required /></div>
        {isCompany && (
          <div><label style={lbl}>שם החברה *</label><input style={inp} value={f.companyName} onChange={(e) => set('companyName', e.target.value)} placeholder="שם החברה / העסק" /></div>
        )}
        <div><label style={lbl}>טלפון</label><input style={inp} value={f.customerPhone} onChange={(e) => set('customerPhone', e.target.value)} onBlur={() => set('customerPhone', formatIsraeliPhoneDisplay(f.customerPhone))} dir="ltr" /></div>
        <div><label style={lbl}>אימייל</label><input style={inp} value={f.customerEmail} onChange={(e) => set('customerEmail', e.target.value)} dir="ltr" /></div>
        <div>
          <label style={lbl}>סוג שירות *</label>
          <select style={{ ...inp, appearance: 'auto' }} value={f.serviceType} onChange={(e) => set('serviceType', e.target.value)} required>
            <option value="">— בחר סוג שירות —</option>
            {SERVICE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div><label style={lbl}>כתובת</label><input style={inp} value={f.address} onChange={(e) => set('address', e.target.value)} placeholder="אופציונלי" /></div>
        <div><label style={lbl}>עיר</label><input style={inp} value={f.city} onChange={(e) => set('city', e.target.value)} placeholder="אופציונלי" /></div>
      </div>

      <label style={lbl}>הערה * <span style={{ fontWeight: 400, color: '#94a3b8' }}>(פרטו בקצרה את צורך הלקוח)</span></label>
      <textarea style={{ ...inp, minHeight: 72, resize: 'vertical' }} value={f.note} onChange={(e) => set('note', e.target.value)} placeholder="למשל: הלקוח מעוניין בבדיקת קרינה לדירה חדשה לפני כניסה…" />

      <button type="submit" disabled={busy} style={{ ...btn, marginTop: 12, opacity: busy ? 0.6 : 1 }}>{busy ? 'שולח…' : 'שלח לנו את הלקוח'}</button>
      {err && <div style={{ marginTop: 10, color: '#b91c1c', fontSize: 13 }}>{err}</div>}
      <div style={{ marginTop: 8, fontSize: 11, color: '#94a3b8' }}>* טלפון או אימייל — לפחות אחד נדרש</div>
    </form>
  );
}

const lbl: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, margin: '12px 0 6px', color: '#334155' };
const inp: React.CSSProperties = { width: '100%', padding: '12px 14px', border: '1px solid #d1d5db', borderRadius: 12, fontSize: 15, outline: 'none', boxSizing: 'border-box' };
const btn: React.CSSProperties = { padding: '11px 18px', border: 0, borderRadius: 12, background: '#2563eb', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' };
const btnGhost: React.CSSProperties = { padding: '9px 16px', border: '1px solid #cbd5e1', borderRadius: 12, background: '#fff', color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const dateInp: React.CSSProperties = { padding: '8px 10px', border: 0, borderRadius: 10, fontSize: 13, background: 'rgba(255,255,255,.95)', color: '#0f172a', outline: 'none', fontFamily: 'inherit' };
