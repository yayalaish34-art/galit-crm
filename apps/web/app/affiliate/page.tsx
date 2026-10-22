'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiUrl } from '../lib/api-base';
import { formatIsraeliPhoneDisplay } from '../lib/phone-format';

/*
 * ─────────────────────────────────────────────────────────────────────────────
 *  פורטל שותפים — גלית
 *
 *  מערכת צד-שלישי עם זהות עצמאית (טוקן ב-localStorage, מקור JWT נפרד מהאפליקציה
 *  הראשית). מציגה לשותף מסע לקוחות בן 4 שלבים, עמלה שמגיעה, היסטוריה, וטופס
 *  הגשת ליד חדש. המיתוג (ירוק גלית + הלוגו המקורי) זהה לשירות הדירוגים —
 *  קבועים מקורו-אמת אחד.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const AFF_TOKEN_KEY = 'galit-affiliate-token';

/** פלטת צבעי המותג — ירוק עמוק (BRAND_GREEN) + עלה בהיר (BRAND_LEAF). */
const BRAND = {
  green: '#1d7a3d',
  leaf: '#8cc63f',
  deep: '#15532a',
  softBg: '#f3faef',
  softBgDarker: '#edf7e8',
  softBorder: '#d6ecc9',
};
const GALIT_LOGO = '/logo-clean.png';

/* ── Types ────────────────────────────────────────────────────────────────── */

type Journey = {
  step: number;
  totalSteps?: number;
  title: string;
  message: string;
  done: boolean;
  lost: boolean;
  reason: string | null;
};
type Referral = {
  id: string;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  serviceType: string | null;
  status: string;
  paidAmount: number | null;
  commissionAmount: number | null;
  commissionSettledAt: string | null;
  createdAt: string;
  paidAt: string | null;
  journey?: Journey;
};
type MeData = {
  affiliate: { name: string; username: string; commissionPct: number };
  stats: {
    totalReferrals: number;
    won: number;
    totalCommission: number;
    owedCommission: number;
    paidCommission: number;
  };
  referrals: Referral[];
};

/**
 * 8 שלבי מסע הלקוח — תואם לאינדקסים ש-resolveJourney בשרת מחזיר (1..8).
 * כותרת ראשית (`title`) + משנה (`sub`) מוצגות ב-timeline האנכי בכל כרטיס.
 * fallback לאחור: אם ה-API הישן מחזיר 1..6, המיפוי במסך מצייר נכון עד השלב שהוחזר.
 */
/**
 * מספר תצוגתי יציב להפניה (לא רץ ב-DB, רק נגזר מה-id ה-UUID).
 * שומר על עקביות — אותה הפניה תמיד תראה את אותו #XXXX, גם אחרי רענון.
 * ממפה את 6 הספרות ההקסה הראשונות של ה-UUID אל 4 ספרות עשרוניות.
 */
function refNumber(id: string): string {
  const hex = (id || '').replace(/-/g, '').slice(0, 6).toLowerCase();
  const n = parseInt(hex, 16);
  if (!Number.isFinite(n)) return '----';
  return String(1000 + (n % 9000)); // 1000..9999 תמיד
}

/** זמן יחסי בעברית — "עכשיו", "לפני 3 ימים", "ב-15/10". למעקב משלוח בסגנון Wolt. */
function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const diffMs = Date.now() - t;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diffMs < 2 * minute) return 'עכשיו';
  if (diffMs < hour) return `לפני ${Math.floor(diffMs / minute)} דק׳`;
  if (diffMs < day) return `לפני ${Math.floor(diffMs / hour)} שעות`;
  if (diffMs < 7 * day) {
    const d = Math.floor(diffMs / day);
    return `לפני ${d === 1 ? 'יום' : `${d} ימים`}`;
  }
  return `ב-${new Date(iso).toLocaleDateString('he-IL')}`;
}

/** המילסטון הבא (לידים או עמלה) — יעד הקרוב ביותר שעדיין לא עברנו. לגיימיפיקציה. */
function nextMilestone(totalRefs: number, totalCommission: number): {
  kind: 'refs' | 'money';
  target: number;
  current: number;
  pct: number;
  label: string;
} {
  const refTiers = [1, 3, 5, 10, 25, 50, 100];
  const moneyTiers = [1000, 5000, 10_000, 25_000, 50_000, 100_000];
  const nextRef = refTiers.find((n) => n > totalRefs);
  const nextMoney = moneyTiers.find((n) => n > totalCommission);
  // כשיש עמלות — מילסטון הכסף יותר מעניין. אין עמלות עדיין? דוחפים ליעד הפניות הבא.
  if (totalCommission > 0 && nextMoney) {
    const prev = moneyTiers[moneyTiers.indexOf(nextMoney) - 1] ?? 0;
    const span = Math.max(1, nextMoney - prev);
    return {
      kind: 'money',
      target: nextMoney,
      current: totalCommission,
      pct: Math.max(0, Math.min(100, Math.round(((totalCommission - prev) / span) * 100))),
      label: `יעד הבא: ₪${nextMoney.toLocaleString('he-IL')} בעמלות`,
    };
  }
  if (nextRef) {
    const prev = refTiers[refTiers.indexOf(nextRef) - 1] ?? 0;
    const span = Math.max(1, nextRef - prev);
    return {
      kind: 'refs',
      target: nextRef,
      current: totalRefs,
      pct: Math.max(0, Math.min(100, Math.round(((totalRefs - prev) / span) * 100))),
      label: `יעד הבא: ${nextRef} הפניות סה״כ`,
    };
  }
  // גיבור על של העולם — כולם עברו, חוגגים.
  return {
    kind: 'refs',
    target: totalRefs,
    current: totalRefs,
    pct: 100,
    label: 'חגגת את כל היעדים — אתה מהטופ!',
  };
}

/** הורדת CSV של הפניות — פיצ'ר "exports" לרשומות שלך. */
function downloadReferralsCsv(referrals: Referral[], affiliateName: string) {
  const header = ['מספר', 'שם לקוח', 'סוג שירות', 'טלפון', 'אימייל', 'סטטוס', 'סכום עמלה', 'שולם לך', 'תאריך הפניה', 'תאריך תשלום לקוח'];
  const esc = (s: unknown) => {
    const v = s == null ? '' : String(s);
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  const rows = referrals.map((r) => [
    `#${refNumber(r.id)}`,
    r.customerName,
    r.serviceType || '',
    r.customerPhone || '',
    r.customerEmail || '',
    r.status,
    r.commissionAmount != null ? r.commissionAmount : '',
    r.commissionSettledAt ? 'כן' : 'לא',
    r.createdAt ? new Date(r.createdAt).toLocaleDateString('he-IL') : '',
    r.paidAt ? new Date(r.paidAt).toLocaleDateString('he-IL') : '',
  ]);
  // UTF-8 BOM כדי שאקסל יזהה עברית נכון.
  const csv = '﻿' + [header, ...rows].map((row) => row.map(esc).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `galit-referrals-${affiliateName}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const JOURNEY_STEPS: Array<{ title: string; sub: string }> = [
  { title: 'הפנייה התקבלה', sub: 'פרטי הלקוח התקבלו בהצלחה במערכת גלית.' },
  { title: 'נציג גלית צפה בפנייה', sub: 'הפנייה נבדקה והועברה לטיפול.' },
  { title: 'התחלנו לטפל בפנייה', sub: 'נציג גלית החל ביצירת קשר עם הלקוח.' },
  { title: 'שוחחנו עם הלקוח', sub: 'ביררנו את הצורך והותאם השירות המבוקש.' },
  { title: 'הצעת מחיר נשלחה', sub: 'ההצעה הועברה ללקוח ואנו ממתינים לאישורו.' },
  { title: 'העסקה נסגרה בהצלחה!', sub: 'הלקוח אישר את הצעת המחיר.' },
  { title: 'תואם מועד לביצוע', sub: 'נקבע מועד להגעת צוות גלית.' },
  { title: 'השירות בוצע', sub: 'צוות גלית השלים את העבודה.' },
  { title: 'הטיפול בלקוח הושלם', sub: 'הדוח או תוצר השירות נמסר ללקוח.' },
  { title: 'העמלה אושרה', sub: 'התשלום מהלקוח התקבל והעמלה אושרה לתשלום.' },
  { title: 'העמלה שולמה', sub: 'התשלום הועבר אליך. תודה על שיתוף הפעולה!' },
];
const ils = (n: number | null | undefined) =>
  n == null ? '—' : `₪${Number(n).toLocaleString('he-IL', { maximumFractionDigits: 0 })}`;

/** פילטר צ'יפ: ממפה סטטוס הפניה לקטגוריה פילטרבילית. */
type FilterKey = 'all' | 'active' | 'won' | 'lost';
function categorize(r: Referral): Exclude<FilterKey, 'all'> {
  if (r.journey?.lost || r.status === 'LOST') return 'lost';
  if (r.status === 'WON' || r.paidAt) return 'won';
  return 'active';
}

/* ── Root ─────────────────────────────────────────────────────────────────── */

export default function AffiliatePortal() {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      setToken(localStorage.getItem(AFF_TOKEN_KEY));
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  const onLoggedIn = (t: string) => {
    try {
      localStorage.setItem(AFF_TOKEN_KEY, t);
    } catch {
      /* ignore */
    }
    setToken(t);
  };
  const onLogout = () => {
    try {
      localStorage.removeItem(AFF_TOKEN_KEY);
    } catch {
      /* ignore */
    }
    setToken(null);
  };

  if (!ready) return null;
  return (
    <div
      dir="rtl"
      style={{
        minHeight: '100dvh',
        background: `
          radial-gradient(1200px 600px at 100% -10%, rgba(140,198,63,.22), transparent 60%),
          radial-gradient(900px 500px at -10% 110%, rgba(29,122,61,.14), transparent 60%),
          linear-gradient(160deg,#f6fcf1 0%,#eef7e8 100%)
        `,
        fontFamily: 'system-ui,-apple-system,"Segoe UI",Arial,sans-serif',
        color: '#0f172a',
      }}
    >
      <style jsx global>{`
        @keyframes galit-fade-up    { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        @keyframes galit-shimmer    { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        @keyframes galit-pop        { 0% { transform: scale(.6); opacity:0; } 60% { transform: scale(1.06); opacity:1; } 100% { transform: scale(1); } }
        @keyframes galit-sparkle    { 0%,100% { transform: rotate(0deg) scale(1); opacity:.9; } 50% { transform: rotate(14deg) scale(1.15); opacity:1; } }
        @keyframes galit-slide-in   { from { opacity:0; transform: translate(-50%, 10px); } to { opacity:1; transform: translate(-50%, 0); } }
        @keyframes galit-pulse-ring { 0%   { box-shadow: 0 0 0 0   rgba(37,99,235,.55); }
                                      70%  { box-shadow: 0 0 0 10px rgba(37,99,235,0); }
                                      100% { box-shadow: 0 0 0 0   rgba(37,99,235,0); } }
        @keyframes galit-float      { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
        @keyframes galit-rise       { from { opacity:0; transform: translateY(8px); } to { opacity:1; transform:none; } }
        .fade-up    { animation: galit-fade-up .35s ease both; }
        .skeleton   { background: linear-gradient(90deg,#eef4e8 0%,#dbead0 50%,#eef4e8 100%); background-size: 200% 100%; animation: galit-shimmer 1.4s infinite linear; border-radius: 12px; }
        .celebrate  { animation: galit-pop .45s ease both; }
        .sparkle    { display: inline-block; animation: galit-sparkle 1.6s ease-in-out infinite; }
        .pulse-dot  { animation: galit-pulse-ring 2s infinite; }
        .float-icon { animation: galit-float 3s ease-in-out infinite; }
        .rise       { animation: galit-rise .4s ease both; }
      `}</style>
      {token ? (
        <Dashboard token={token} onLogout={onLogout} on401={onLogout} />
      ) : (
        <Login onLoggedIn={onLoggedIn} />
      )}
    </div>
  );
}

/* ── Login ────────────────────────────────────────────────────────────────── */

function Login({ onLoggedIn }: { onLoggedIn: (t: string) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const res = await fetch(apiUrl('/affiliate/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        const j = await res.json();
        onLoggedIn(j.accessToken);
        return;
      }
      const j = await res.json().catch(() => ({}));
      setErr(j?.message || 'שם משתמש או סיסמה שגויים');
    } catch {
      setErr('שגיאת רשת — נסו שוב');
    }
    setBusy(false);
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100dvh',
        padding: 20,
      }}
    >
      <form
        onSubmit={submit}
        className="fade-up"
        style={{
          width: '100%',
          maxWidth: 420,
          background: '#fff',
          borderRadius: 24,
          padding: '34px 28px 26px',
          boxShadow: '0 24px 60px rgba(29,122,61,.14)',
          border: `1px solid ${BRAND.leaf}2a`,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* פס עליון דקורטיבי */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 5,
            background: `linear-gradient(90deg,${BRAND.green},${BRAND.leaf})`,
          }}
        />

        {/* לוגו גלית */}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 6, marginBottom: 10 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={GALIT_LOGO}
            alt="גלית — החברה לאיכות הסביבה"
            style={{ height: 80, width: 'auto', objectFit: 'contain' }}
          />
        </div>

        <div
          style={{
            textAlign: 'center',
            fontSize: 11,
            fontWeight: 700,
            color: BRAND.green,
            letterSpacing: '.08em',
          }}
        >
          תוכנית שותפים
        </div>
        <h1
          style={{
            textAlign: 'center',
            fontSize: 24,
            margin: '4px 0 2px',
            color: BRAND.deep,
            fontWeight: 900,
          }}
        >
          כניסה לפורטל
        </h1>
        <p style={{ textAlign: 'center', color: '#6b7280', fontSize: 13, margin: '0 0 22px' }}>
          שם משתמש וסיסמה שקיבלת מהצוות
        </p>

        <label style={lbl}>שם משתמש</label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoCapitalize="none"
          required
          style={inp}
        />

        <label style={lbl}>סיסמה</label>
        <div style={{ position: 'relative' }}>
          <input
            type={showPwd ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ ...inp, paddingInlineStart: 44 }}
          />
          <button
            type="button"
            onClick={() => setShowPwd((v) => !v)}
            aria-label={showPwd ? 'הסתר סיסמה' : 'הצג סיסמה'}
            style={{
              position: 'absolute',
              insetInlineStart: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              border: 0,
              background: 'transparent',
              cursor: 'pointer',
              color: '#64748b',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {showPwd ? 'הסתר' : 'הצג'}
          </button>
        </div>

        <button
          type="submit"
          disabled={busy}
          style={{ ...btn, opacity: busy ? 0.6 : 1, marginTop: 16, width: '100%' }}
        >
          {busy ? 'מתחבר…' : 'כניסה למערכת'}
        </button>

        {err && (
          <div
            style={{
              marginTop: 14,
              padding: '10px 12px',
              borderRadius: 10,
              background: '#fef2f2',
              color: '#b91c1c',
              fontSize: 13,
              textAlign: 'center',
              fontWeight: 600,
            }}
          >
            {err}
          </div>
        )}

        {/* פס תחתון: מידע/אמון */}
        <div
          style={{
            marginTop: 22,
            paddingTop: 16,
            borderTop: '1px dashed #e4ebe0',
            display: 'grid',
            gridTemplateColumns: 'repeat(3,1fr)',
            gap: 8,
            fontSize: 11,
            color: '#64748b',
            textAlign: 'center',
          }}
        >
          <div>
            <div style={{ fontSize: 16 }}>🤝</div>
            <div style={{ marginTop: 2 }}>שיתוף פעולה אמין</div>
          </div>
          <div>
            <div style={{ fontSize: 16 }}>💸</div>
            <div style={{ marginTop: 2 }}>עמלות שקופות</div>
          </div>
          <div>
            <div style={{ fontSize: 16 }}>📊</div>
            <div style={{ marginTop: 2 }}>מעקב בזמן אמת</div>
          </div>
        </div>

        <div style={{ marginTop: 14, textAlign: 'center', fontSize: 11, color: '#94a3b8' }}>
          גלית — החברה לאיכות הסביבה
        </div>
      </form>
    </div>
  );
}

/* ── Dashboard ────────────────────────────────────────────────────────────── */

function Dashboard({
  token,
  onLogout,
  on401,
}: {
  token: string;
  onLogout: () => void;
  on401: () => void;
}) {
  const [data, setData] = useState<MeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  // "ברק" קטן על הכרטיס שהרגע עבר ל-WON — נזכר הסט ה-id-ים הקודם ואם נוסף אחד חדש מציגים חגיגה.
  const [celebrateIds, setCelebrateIds] = useState<Set<string>>(new Set());

  const load = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!opts.silent) setLoading(true);
      try {
        const res = await fetch(apiUrl('/affiliate/me'), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401) {
          on401();
          return;
        }
        if (res.ok) {
          const next = (await res.json()) as MeData;
          // זיהוי "חגיגה": הפניה שעברה ל-WON מאז הטעינה הקודמת → ברק קצר על הכרטיס.
          setData((prev) => {
            if (prev) {
              const prevWon = new Set(prev.referrals.filter((r) => categorize(r) === 'won').map((r) => r.id));
              const nowWon = next.referrals.filter((r) => categorize(r) === 'won' && !prevWon.has(r.id));
              if (nowWon.length) {
                setCelebrateIds((old) => {
                  const s = new Set(old);
                  nowWon.forEach((r) => s.add(r.id));
                  return s;
                });
                setToast(`${nowWon[0].customerName} סגר/ה עסקה — העמלה שלך עודכנה! 🎉`);
                // ניקוי הברק אחרי 10 שניות כדי שלא יישאר תמידי.
                setTimeout(() => {
                  setCelebrateIds((old) => {
                    const s = new Set(old);
                    nowWon.forEach((r) => s.delete(r.id));
                    return s;
                  });
                }, 10_000);
              }
            }
            return next;
          });
        }
      } catch {
        /* keep */
      } finally {
        if (!opts.silent) setLoading(false);
      }
    },
    [token, on401],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // ─── רענון שקט כל 90 שניות — הדשבורד תמיד מעודכן בלי "טוען..." מהבהב. ───
  useEffect(() => {
    const t = setInterval(() => void load({ silent: true }), 90_000);
    return () => clearInterval(t);
  }, [load]);

  // טוסט נעלם אוטומטית אחרי 3.6 שניות.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3600);
    return () => clearTimeout(t);
  }, [toast]);

  if (loading && !data) return <DashboardSkeleton onLogout={onLogout} />;
  if (!data)
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
        לא ניתן לטעון נתונים.
      </div>
    );

  const inRange = (iso: string | null | undefined): boolean => {
    if (!iso) return false;
    const d = iso.slice(0, 10);
    if (fromDate && d < fromDate) return false;
    if (toDate && d > toDate) return false;
    return true;
  };
  const owedInRange = data.referrals
    .filter(
      (r) =>
        r.commissionAmount != null && !r.commissionSettledAt && r.paidAt && inRange(r.paidAt),
    )
    .reduce((s, r) => s + (r.commissionAmount || 0), 0);
  const owedCount = data.referrals.filter(
    (r) =>
      r.commissionAmount != null && !r.commissionSettledAt && r.paidAt && inRange(r.paidAt),
  ).length;
  const dateActive = !!(fromDate || toDate);

  const total = data.referrals.length;
  const activeCount = data.referrals.filter((r) => categorize(r) === 'active').length;
  const wonCount = data.referrals.filter((r) => categorize(r) === 'won').length;
  const lostCount = data.referrals.filter((r) => categorize(r) === 'lost').length;
  const winRate = total ? Math.round((wonCount / total) * 100) : 0;

  // ברכה דינמית לפי שעה.
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'בוקר טוב' : hour < 18 ? 'צהריים טובים' : 'ערב טוב';
  const firstName = (data.affiliate.name || '').split(/\s+/)[0] || data.affiliate.name;

  // משפט מוטיבציה דינמי — בוחר אוטומטית לפי המצב.
  let motivation = '';
  if (total === 0) motivation = 'מוכן.ה לשלוח את הלקוח הראשון שלך? 🚀';
  else if (wonCount === 0) motivation = `${total} ${total === 1 ? 'ליד' : 'לידים'} בטיפול — נציגינו עובדים על זה 💪`;
  else if (data.stats.owedCommission > 0) motivation = `יש לך עמלה שמחכה — ${ils(data.stats.owedCommission)} בדרך אליך 💰`;
  else if (wonCount > 0) motivation = `${wonCount} עסקאות נסגרו דרכך — ממשיכים לייצר ביחד ✨`;
  else motivation = 'ממשיכים לעבוד — העמלה הבאה קרובה 🎯';

  // סינון + חיפוש משולבים.
  const matchesSearch = (r: Referral) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      r.customerName.toLowerCase().includes(q) ||
      (r.serviceType || '').toLowerCase().includes(q) ||
      (r.customerPhone || '').toLowerCase().includes(q) ||
      refNumber(r.id).includes(q)
    );
  };
  const milestone = nextMilestone(total, data.stats.totalCommission || 0);

  const filteredByCategory =
    filter === 'all' ? data.referrals : data.referrals.filter((r) => categorize(r) === filter);
  const filtered = filteredByCategory.filter(matchesSearch);

  return (
    <>
      {/* ─── Hero header ─── */}
      <header
        style={{
          background: `linear-gradient(135deg,${BRAND.deep} 0%,${BRAND.green} 55%,${BRAND.leaf} 120%)`,
          color: '#fff',
          padding: '20px 16px 110px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* דקורציה */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(500px 300px at 90% 20%, rgba(255,255,255,.18), transparent 60%)',
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            maxWidth: 720,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            position: 'relative',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <div
              style={{
                background: 'rgba(255,255,255,.95)',
                borderRadius: 14,
                padding: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 8px 20px rgba(0,0,0,.15)',
                flexShrink: 0,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={GALIT_LOGO}
                alt="גלית"
                style={{ height: 48, width: 48, objectFit: 'contain' }}
              />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, opacity: 0.85, fontWeight: 700, letterSpacing: '.06em' }}>
                פורטל שותפים · גלית
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 900,
                  lineHeight: 1.15,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {greeting}, {firstName} 👋
              </div>
              <div style={{ fontSize: 12.5, opacity: 0.85, marginTop: 2 }}>
                עמלה {Math.round(data.affiliate.commissionPct)}% · {total} הפניות עד כה
              </div>
              <div style={{ fontSize: 13, marginTop: 6, opacity: 0.95, fontWeight: 600 }}>
                {motivation}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button
              onClick={() => setShowHelp((v) => !v)}
              style={{
                background: 'rgba(255,255,255,.12)',
                border: '1px solid rgba(255,255,255,.3)',
                borderRadius: 10,
                padding: '8px 12px',
                color: '#fff',
                fontSize: 12.5,
                fontWeight: 700,
                cursor: 'pointer',
              }}
              aria-expanded={showHelp}
            >
              איך זה עובד?
            </button>
            <button
              onClick={onLogout}
              style={{
                background: 'rgba(255,255,255,.15)',
                border: '1px solid rgba(255,255,255,.35)',
                borderRadius: 10,
                padding: '8px 14px',
                color: '#fff',
                fontSize: 12.5,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              יציאה
            </button>
          </div>
        </div>
      </header>

      {/* ─── Content ─── */}
      <div
        style={{
          maxWidth: 720,
          margin: '-80px auto 60px',
          padding: '0 16px',
          position: 'relative',
        }}
      >
        {showHelp && <HelpCard onClose={() => setShowHelp(false)} />}

        {/* כרטיס עמלה שמגיעה — ראשי */}
        <div
          className="fade-up"
          style={{
            background: `linear-gradient(135deg,#ffffff 0%,#f6fcf1 100%)`,
            borderRadius: 20,
            padding: '20px 20px 18px',
            boxShadow: '0 20px 50px rgba(29,122,61,.18)',
            border: `1px solid ${BRAND.leaf}44`,
            marginBottom: 14,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            aria-hidden
            style={{
              position: 'absolute',
              top: -40,
              insetInlineEnd: -40,
              width: 160,
              height: 160,
              borderRadius: '50%',
              background: `radial-gradient(${BRAND.leaf}66, transparent 70%)`,
            }}
          />
          <div
            style={{
              fontSize: 11.5,
              fontWeight: 700,
              color: BRAND.green,
              letterSpacing: '.06em',
              textTransform: 'uppercase',
            }}
          >
            ארנק שותף
          </div>
          <div
            style={{
              fontSize: 44,
              fontWeight: 900,
              marginTop: 2,
              letterSpacing: '-.02em',
              color: BRAND.deep,
              position: 'relative',
            }}
          >
            {ils(Math.round(owedInRange * 100) / 100)}
          </div>
          <div style={{ fontSize: 12.5, color: '#4b5563', marginTop: 2 }}>
            {dateActive ? 'עמלה שמגיעה לך (בטווח שנבחר)' : 'עמלה שמגיעה לך'} ·{' '}
            {owedCount} לקוחות ששילמו וממתינים
          </div>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              alignItems: 'flex-end',
              marginTop: 16,
            }}
          >
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 11,
                  color: '#64748b',
                  marginBottom: 3,
                  fontWeight: 600,
                }}
              >
                מתאריך
              </label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                style={dateInp}
              />
            </div>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 11,
                  color: '#64748b',
                  marginBottom: 3,
                  fontWeight: 600,
                }}
              >
                עד תאריך
              </label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                style={dateInp}
              />
            </div>
            {dateActive && (
              <button
                onClick={() => {
                  setFromDate('');
                  setToDate('');
                }}
                style={{
                  background: '#fff',
                  border: `1px solid ${BRAND.softBorder}`,
                  color: BRAND.green,
                  borderRadius: 10,
                  padding: '8px 12px',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                נקה
              </button>
            )}
          </div>
        </div>

        {/* ─── Stats grid: 3 כרטיסים מישניים ─── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3,minmax(0,1fr))',
            gap: 10,
            marginBottom: 18,
          }}
        >
          <StatTile
            label="סה״כ שולם לך"
            value={ils(data.stats.paidCommission)}
            icon="✓"
            tone="paid"
          />
          <StatTile label="לקוחות שסגרו" value={`${wonCount}/${total}`} icon="⭐" tone="won" />
          <StatTile label="אחוז הצלחה" value={`${winRate}%`} icon="📈" tone="rate" />
        </div>

        {/* ─── Next-milestone card: גיימיפיקציה — יעד בעמלות או הפניות ─── */}
        {total > 0 && (
          <div
            className="rise"
            style={{
              background: '#fff',
              borderRadius: 16,
              padding: '14px 16px',
              marginBottom: 18,
              border: `1px solid ${BRAND.softBorder}`,
              boxShadow: '0 4px 14px rgba(29,122,61,.06)',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
            }}
          >
            <div
              className="float-icon"
              style={{
                fontSize: 28,
                flexShrink: 0,
              }}
              aria-hidden
            >
              {milestone.pct >= 100 ? '👑' : milestone.kind === 'money' ? '💎' : '🎯'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: BRAND.green,
                  letterSpacing: '.04em',
                  textTransform: 'uppercase',
                  marginBottom: 3,
                }}
              >
                היעד הבא שלך
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>
                {milestone.label}
              </div>
              <div
                style={{
                  background: '#eef4e8',
                  borderRadius: 999,
                  height: 7,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${milestone.pct}%`,
                    background: `linear-gradient(90deg,${BRAND.green},${BRAND.leaf})`,
                    borderRadius: 999,
                    transition: 'width .4s',
                  }}
                />
              </div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, fontWeight: 600 }}>
                {milestone.kind === 'money'
                  ? `${ils(milestone.current)} מתוך ${ils(milestone.target)}`
                  : `${milestone.current} מתוך ${milestone.target}`}
              </div>
            </div>
          </div>
        )}

        {/* ─── CTA + Section header ─── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 10,
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <h2 style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', margin: 0 }}>
              מעקב אחר פנייה
            </h2>
            {total > 0 && (
              <span
                style={{
                  background: BRAND.softBgDarker,
                  color: BRAND.green,
                  borderRadius: 999,
                  padding: '2px 10px',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {total}
              </span>
            )}
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            style={{ ...btn, padding: '10px 16px', fontSize: 13.5 }}
          >
            {showForm ? 'סגור' : '+ שלח לקוח חדש'}
          </button>
        </div>

        {/* ─── Submit form ─── */}
        {showForm && (
          <SubmitForm
            token={token}
            onDone={(name) => {
              setShowForm(false);
              setToast(name ? `${name} נקלט אצלנו — ניצור קשר בקרוב 🎉` : 'הלקוח נקלט אצלנו 🎉');
              void load();
            }}
          />
        )}

        {/* ─── Filter chips + search + CSV ─── */}
        {total > 0 && (
          <>
            <div
              style={{
                display: 'flex',
                gap: 6,
                marginBottom: 10,
                overflowX: 'auto',
                paddingBottom: 2,
              }}
            >
              <FilterChip
                label="הכל"
                count={total}
                active={filter === 'all'}
                onClick={() => setFilter('all')}
              />
              <FilterChip
                label="בטיפול"
                count={activeCount}
                active={filter === 'active'}
                onClick={() => setFilter('active')}
                tone="active"
              />
              <FilterChip
                label="הצליחו"
                count={wonCount}
                active={filter === 'won'}
                onClick={() => setFilter('won')}
                tone="won"
              />
              <FilterChip
                label="נדחו"
                count={lostCount}
                active={filter === 'lost'}
                onClick={() => setFilter('lost')}
                tone="lost"
              />
            </div>

            {/* חיפוש + הורדת CSV */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="חיפוש לפי שם, שירות, טלפון או #מספר"
                  style={{
                    ...inp,
                    paddingInlineEnd: 36,
                    background: '#fff',
                    fontSize: 13.5,
                  }}
                />
                <span
                  style={{
                    position: 'absolute',
                    insetInlineEnd: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#94a3b8',
                    fontSize: 15,
                    pointerEvents: 'none',
                  }}
                  aria-hidden
                >
                  🔍
                </span>
              </div>
              <button
                type="button"
                onClick={() => downloadReferralsCsv(data.referrals, data.affiliate.name)}
                title="הורדת כל ההפניות כקובץ CSV"
                style={{
                  background: '#fff',
                  border: `1px solid ${BRAND.softBorder}`,
                  color: BRAND.deep,
                  borderRadius: 12,
                  padding: '10px 14px',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  whiteSpace: 'nowrap',
                }}
              >
                ⬇ ייצוא CSV
              </button>
            </div>
          </>
        )}

        {/* ─── Referrals list ─── */}
        {total === 0 ? (
          <EmptyState onCta={() => setShowForm(true)} />
        ) : filtered.length === 0 ? (
          <div
            style={{
              background: '#fff',
              borderRadius: 16,
              padding: 28,
              textAlign: 'center',
              color: '#64748b',
              fontSize: 13.5,
              boxShadow: '0 4px 14px rgba(15,23,42,.05)',
              border: `1px dashed ${BRAND.softBorder}`,
            }}
          >
            <div style={{ fontSize: 36, marginBottom: 8 }} aria-hidden>
              {search.trim()
                ? '🔎'
                : filter === 'won'
                ? '🏆'
                : filter === 'lost'
                ? '🌱'
                : filter === 'active'
                ? '⏳'
                : '📭'}
            </div>
            <div style={{ fontWeight: 800, color: '#334155', fontSize: 15, marginBottom: 4 }}>
              {search.trim()
                ? 'לא נמצאו תוצאות'
                : filter === 'won'
                ? 'עוד לא נסגרו עסקאות — אבל אנחנו עובדים על זה 💪'
                : filter === 'lost'
                ? 'אין לידים שנדחו — יופי של עבודה!'
                : filter === 'active'
                ? 'אין לידים בטיפול כרגע'
                : 'אין לידים להצגה'}
            </div>
            <div style={{ fontSize: 12.5, lineHeight: 1.55 }}>
              {search.trim()
                ? 'נסה חיפוש אחר, או נקה את החיפוש כדי לראות את כולם.'
                : 'שליחת ליד חדש תקדם אותך בציר ההפניות — אנחנו מכאן ואילך!'}
            </div>
            {search.trim() && (
              <button
                onClick={() => setSearch('')}
                style={{
                  marginTop: 10,
                  background: 'transparent',
                  border: `1px solid ${BRAND.softBorder}`,
                  color: BRAND.green,
                  borderRadius: 10,
                  padding: '7px 14px',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                נקה חיפוש
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filtered.map((r) => (
              <ReferralCard key={r.id} r={r} celebrate={celebrateIds.has(r.id)} />
            ))}
          </div>
        )}

        {/* ─── Footer ─── */}
        <footer
          style={{
            marginTop: 40,
            paddingTop: 20,
            borderTop: `1px solid ${BRAND.softBorder}`,
            textAlign: 'center',
            color: '#64748b',
            fontSize: 12,
          }}
        >
          <div style={{ fontWeight: 700, color: BRAND.deep, marginBottom: 4 }}>
            גלית — החברה לאיכות הסביבה
          </div>
          <div>יש שאלה? דברו עם איש הקשר שלכם במחלקת שיווק.</div>
        </footer>
      </div>

      {/* ─── Floating action button (מובייל) ─── */}
      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          aria-label="שלח לקוח חדש"
          style={{
            position: 'fixed',
            insetInlineEnd: 20,
            bottom: 24,
            width: 58,
            height: 58,
            borderRadius: '50%',
            background: `linear-gradient(135deg,${BRAND.green},${BRAND.leaf})`,
            color: '#fff',
            border: 0,
            fontSize: 32,
            fontWeight: 300,
            lineHeight: 1,
            cursor: 'pointer',
            boxShadow: '0 12px 28px rgba(29,122,61,.4)',
            zIndex: 20,
          }}
        >
          +
        </button>
      )}

      {/* ─── Toast ─── */}
      {toast && (
        <div
          role="status"
          style={{
            position: 'fixed',
            bottom: 100,
            left: '50%',
            transform: 'translateX(-50%)',
            background: BRAND.deep,
            color: '#fff',
            padding: '12px 20px',
            borderRadius: 999,
            fontSize: 14,
            fontWeight: 700,
            boxShadow: '0 10px 30px rgba(21,83,42,.4)',
            animation: 'galit-slide-in .25s ease both',
            zIndex: 30,
            maxWidth: 'calc(100% - 32px)',
            textAlign: 'center',
          }}
        >
          {toast}
        </div>
      )}
    </>
  );
}

/* ── Dashboard skeleton (while loading) ───────────────────────────────────── */

function DashboardSkeleton({ onLogout }: { onLogout: () => void }) {
  return (
    <>
      <header
        style={{
          background: `linear-gradient(135deg,${BRAND.deep},${BRAND.green})`,
          padding: '20px 16px 110px',
          color: '#fff',
        }}
      >
        <div
          style={{
            maxWidth: 720,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              className="skeleton"
              style={{ width: 60, height: 60, background: 'rgba(255,255,255,.3)' }}
            />
            <div>
              <div
                className="skeleton"
                style={{ width: 140, height: 14, background: 'rgba(255,255,255,.3)' }}
              />
              <div
                className="skeleton"
                style={{
                  width: 180,
                  height: 22,
                  marginTop: 6,
                  background: 'rgba(255,255,255,.3)',
                }}
              />
            </div>
          </div>
          <button
            onClick={onLogout}
            style={{
              background: 'rgba(255,255,255,.15)',
              border: '1px solid rgba(255,255,255,.35)',
              borderRadius: 10,
              padding: '8px 14px',
              color: '#fff',
              fontSize: 12.5,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            יציאה
          </button>
        </div>
      </header>
      <div style={{ maxWidth: 720, margin: '-80px auto 60px', padding: '0 16px' }}>
        <div
          className="skeleton"
          style={{ height: 160, borderRadius: 20, marginBottom: 14 }}
        />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3,1fr)',
            gap: 10,
            marginBottom: 20,
          }}
        >
          <div className="skeleton" style={{ height: 86 }} />
          <div className="skeleton" style={{ height: 86 }} />
          <div className="skeleton" style={{ height: 86 }} />
        </div>
        <div className="skeleton" style={{ height: 140, marginBottom: 10 }} />
        <div className="skeleton" style={{ height: 140 }} />
      </div>
    </>
  );
}

/* ── Help card ────────────────────────────────────────────────────────────── */

function HelpCard({ onClose }: { onClose: () => void }) {
  const steps: Array<[string, string]> = [
    ['1', 'מפנים לנו לקוח — לחיצה על "שלח לקוח חדש" וממלאים פרטים.'],
    ['2', 'אנחנו יוצרים קשר, מבינים צרכים ומגישים הצעת מחיר.'],
    ['3', 'לקוח שחתם — יוצאים לדרך! המסע שלכם מתעדכן אוטומטית.'],
    ['4', 'הלקוח שילם → העמלה נצברת ומוצגת כאן. אנחנו משלמים לכם בפועל.'],
  ];
  return (
    <div
      className="fade-up"
      style={{
        background: '#fff',
        borderRadius: 16,
        padding: 16,
        marginBottom: 14,
        boxShadow: '0 8px 24px rgba(29,122,61,.1)',
        border: `1px solid ${BRAND.softBorder}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 800, color: BRAND.deep }}>
          איך תוכנית השותפים עובדת
        </h3>
        <button
          onClick={onClose}
          aria-label="סגור"
          style={{
            background: 'transparent',
            border: 0,
            fontSize: 20,
            cursor: 'pointer',
            color: '#64748b',
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {steps.map(([n, text]) => (
          <div key={n} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div
              style={{
                flexShrink: 0,
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: `linear-gradient(135deg,${BRAND.green},${BRAND.leaf})`,
                color: '#fff',
                fontWeight: 900,
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {n}
            </div>
            <div style={{ fontSize: 13.5, color: '#334155', lineHeight: 1.5 }}>{text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Stat tile ────────────────────────────────────────────────────────────── */

function StatTile({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: string;
  tone: 'paid' | 'won' | 'rate';
}) {
  const palette = {
    paid: { bar: '#059669', bg: '#ecfdf5' },
    won: { bar: BRAND.green, bg: BRAND.softBg },
    rate: { bar: '#0891b2', bg: '#ecfeff' },
  }[tone];
  return (
    <div
      className="fade-up"
      style={{
        background: '#fff',
        borderRadius: 14,
        padding: '12px 12px 12px',
        boxShadow: '0 4px 14px rgba(15,23,42,.05)',
        border: `1px solid ${palette.bg}`,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          insetInlineStart: 0,
          top: 0,
          bottom: 0,
          width: 3,
          background: palette.bar,
        }}
      />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          color: '#64748b',
          fontSize: 11.5,
          fontWeight: 700,
        }}
      >
        <span>{icon}</span>
        <span>{label}</span>
      </div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 900,
          color: '#0f172a',
          marginTop: 2,
          letterSpacing: '-.01em',
        }}
      >
        {value}
      </div>
    </div>
  );
}

/* ── Filter chip ──────────────────────────────────────────────────────────── */

function FilterChip({
  label,
  count,
  active,
  onClick,
  tone,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  tone?: 'active' | 'won' | 'lost';
}) {
  const toneColor =
    tone === 'won' ? '#059669' : tone === 'lost' ? '#e11d48' : tone === 'active' ? BRAND.green : BRAND.deep;
  return (
    <button
      onClick={onClick}
      style={{
        flexShrink: 0,
        padding: '7px 14px',
        borderRadius: 999,
        fontSize: 12.5,
        fontWeight: 700,
        cursor: 'pointer',
        border: `1.5px solid ${active ? toneColor : '#e2e8f0'}`,
        background: active ? toneColor : '#fff',
        color: active ? '#fff' : '#475569',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        transition: 'all .15s',
      }}
    >
      <span>{label}</span>
      <span
        style={{
          background: active ? 'rgba(255,255,255,.25)' : '#f1f5f9',
          color: active ? '#fff' : '#64748b',
          borderRadius: 999,
          padding: '0 7px',
          fontSize: 11,
          fontWeight: 800,
          minWidth: 18,
          textAlign: 'center',
        }}
      >
        {count}
      </span>
    </button>
  );
}

/* ── Empty state ──────────────────────────────────────────────────────────── */

function EmptyState({ onCta }: { onCta: () => void }) {
  return (
    <div
      className="fade-up"
      style={{
        background: `linear-gradient(180deg,#ffffff,${BRAND.softBg})`,
        borderRadius: 20,
        padding: '32px 20px 28px',
        textAlign: 'center',
        border: `1px dashed ${BRAND.leaf}66`,
        boxShadow: '0 4px 18px rgba(29,122,61,.07)',
      }}
    >
      <div
        style={{
          fontSize: 54,
          marginBottom: 6,
          display: 'inline-block',
          filter: 'drop-shadow(0 4px 8px rgba(29,122,61,.15))',
        }}
      >
        🌱
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, color: BRAND.deep, marginBottom: 4 }}>
        בואו נתחיל ביחד! 🚀
      </div>
      <div
        style={{
          fontSize: 13.5,
          color: '#475569',
          lineHeight: 1.6,
          maxWidth: 360,
          margin: '0 auto 16px',
        }}
      >
        שלחו את הלקוח הראשון שלכם —<br />
        אנחנו ניצור איתו קשר, נגיש הצעה ונשלים את העבודה.
        <br />
        אתם תראו בדיוק באיזה שלב הפנייה נמצאת ואת העמלה שמחכה לכם.
      </div>
      <button onClick={onCta} style={{ ...btn, padding: '13px 24px', fontSize: 15 }}>
        ✨ שליחת הלקוח הראשון
      </button>
    </div>
  );
}

/* ── Wolt-style vertical timeline ─────────────────────────────────────────── */

/**
 * ציר התקדמות אנכי בסגנון וולט: 8 שלבים ברצף אנכי עם ✓/מספר, קו מחבר,
 * וסרגל התקדמות ברקע עליון ("שלב X מתוך 8").
 *
 * props.step הוא השלב הנוכחי (1..8). שלבים לפניו = done (ירוק עמוק + ✓).
 * השלב הנוכחי = מודגש עם pulse. שלבים אחריו = מושתקים.
 * done=true (ההפניה שולמה) → גם השלב האחרון עם ✓ ירוק.
 *
 * מראה "פחות הוא יותר" לרשימת שלבים ארוכה: במקום להציג את כל 8 תמיד,
 * מראים את כל הקודמים (ללא sub), את הנוכחי מורחב (עם sub), וסיכום
 * מצומצם של השלבים הבאים. ניתן להרחיב ללחיצה כדי לראות הכל.
 */
function WoltTimeline({
  step,
  done,
  accent,
}: {
  step: number;
  done: boolean;
  accent: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const total = JOURNEY_STEPS.length;
  const safeStep = Math.max(1, Math.min(step, total));

  // תת-קבוצות: עד השלב הנוכחי (כולל), ושלבים עתידיים (אחרי).
  const previousAndCurrent = JOURNEY_STEPS.slice(0, safeStep);
  const upcoming = JOURNEY_STEPS.slice(safeStep);

  // צבעי השלבים לפי מפרט הלקוח: done=ירוק (accent), current=כחול, future=אפור.
  // כש-lost: ה-accent כבר אדום, הנוכחי נשאר באותו כיוון של ה-accent, אבל במצב LOST
  // הציר בכלל לא מרונדר (ראה ReferralCard) ולכן אין בעיה פה.
  const CURRENT_BLUE = '#2563eb';
  const Row = ({
    i,
    item,
    state,
    isLast,
  }: {
    i: number;
    item: { title: string; sub: string };
    state: 'done' | 'current' | 'future';
    isLast: boolean;
  }) => {
    const circleBg =
      state === 'done' ? accent : state === 'current' ? CURRENT_BLUE : '#e2e8f0';
    const textColor =
      state === 'current' ? CURRENT_BLUE : state === 'done' ? '#334155' : '#94a3b8';
    const titleWeight = state === 'current' ? 800 : state === 'done' ? 700 : 600;
    return (
      <div style={{ display: 'flex', gap: 10, position: 'relative', paddingBottom: isLast ? 0 : 8 }}>
        {/* ציר צדדי: עיגול + קו למטה */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
          <div
            className={state === 'current' ? 'pulse-dot' : undefined}
            style={{
              width: state === 'current' ? 24 : 20,
              height: state === 'current' ? 24 : 20,
              borderRadius: 999,
              background: circleBg,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: state === 'current' ? 12 : 11,
              fontWeight: 800,
              transition: 'all .2s',
              flexShrink: 0,
            }}
          >
            {state === 'done' ? '✓' : i + 1}
          </div>
          {!isLast && (
            <div
              style={{
                width: 2,
                flex: 1,
                background: state === 'done' ? accent : '#e2e8f0',
                marginTop: 2,
                minHeight: state === 'current' ? 24 : 14,
                borderRadius: 2,
                transition: 'background .2s',
              }}
            />
          )}
        </div>
        {/* תוכן: כותרת + משנה */}
        <div style={{ flex: 1, minWidth: 0, paddingTop: state === 'current' ? 2 : 0 }}>
          <div
            style={{
              fontSize: state === 'current' ? 14 : 13,
              fontWeight: titleWeight,
              color: textColor,
              lineHeight: 1.3,
            }}
          >
            {item.title}
          </div>
          {expanded && state === 'done' && item.sub && (
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 1, lineHeight: 1.4 }}>
              {item.sub}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div>
      {/* רשימה אנכית: previous + current */}
      <div>
        {previousAndCurrent.map((item, i) => (
          <Row
            key={i}
            i={i}
            item={item}
            // כש-done=true (שולם) — גם השלב האחרון מסומן ✓ ולא "current".
            state={
              i + 1 < safeStep
                ? 'done'
                : i + 1 === safeStep
                ? done
                  ? 'done'
                  : 'current'
                : 'future'
            }
            isLast={i === previousAndCurrent.length - 1 && upcoming.length === 0 && !expanded}
          />
        ))}

        {/* שלבים עתידיים: קופלים כברירת מחדל, פותחים ללחיצה */}
        {upcoming.length > 0 && !expanded && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            style={{
              marginTop: 4,
              marginInlineStart: 32,
              background: 'transparent',
              border: 0,
              color: '#64748b',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              padding: 0,
              textAlign: 'start',
            }}
          >
            ⌄ עוד {upcoming.length} שלבים צפויים
          </button>
        )}
        {upcoming.length > 0 &&
          expanded &&
          upcoming.map((item, i) => (
            <Row
              key={`u-${i}`}
              i={previousAndCurrent.length + i}
              item={item}
              state="future"
              isLast={i === upcoming.length - 1}
            />
          ))}
        {upcoming.length > 0 && expanded && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            style={{
              marginTop: 2,
              marginInlineStart: 32,
              background: 'transparent',
              border: 0,
              color: '#64748b',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              padding: 0,
              textAlign: 'start',
            }}
          >
            ⌃ כווץ
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Referral card ────────────────────────────────────────────────────────── */

function ReferralCard({ r, celebrate = false }: { r: Referral; celebrate?: boolean }) {
  const j = r.journey;
  const step = j?.step ?? 1;
  const lost = !!j?.lost;
  const done = !!j?.done;
  const accent = lost ? '#e11d48' : done ? '#059669' : BRAND.green;

  return (
    <div
      className="fade-up"
      style={{
        background: '#fff',
        borderRadius: 18,
        padding: '16px 16px 14px',
        boxShadow: lost ? '0 6px 20px rgba(225,29,72,.08)' : '0 6px 18px rgba(15,23,42,.06)',
        border: `1px solid ${lost ? '#fee2e2' : done ? '#d1fae5' : BRAND.softBorder}`,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* פס עליון צבעוני */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: accent,
        }}
      />

      {/* חגיגה ל-WON */}
      {done && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            insetInlineStart: 14,
            fontSize: 20,
            pointerEvents: 'none',
          }}
          aria-hidden
        >
          <span className="sparkle">✨</span>
        </div>
      )}

      {/* ברק חגיגה — נדלק רק להפניה שהרגע עברה ל-WON (10 שניות) */}
      {celebrate && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            overflow: 'hidden',
            borderRadius: 18,
          }}
        >
          {['🎉', '✨', '💰', '🎊', '⭐'].map((emoji, k) => (
            <span
              key={k}
              style={{
                position: 'absolute',
                top: `${10 + Math.random() * 60}%`,
                left: `${10 + k * 18}%`,
                fontSize: 20 + Math.random() * 12,
                animation: `galit-float ${2 + Math.random()}s ease-in-out infinite`,
                animationDelay: `${k * 0.15}s`,
                opacity: 0.9,
              }}
            >
              {emoji}
            </span>
          ))}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `radial-gradient(400px 200px at 50% 0%, ${BRAND.leaf}22, transparent 60%)`,
            }}
          />
        </div>
      )}

      {/* ─── שורה 1: "פנייה #XXXX · סוג שירות" (זהה למעקב משלוח — "פנייה מס' 1042 · בדיקת קרינה") ─── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 10,
          flexWrap: 'wrap',
          color: '#64748b',
          fontSize: 12.5,
          fontWeight: 700,
        }}
      >
        <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          פנייה #{refNumber(r.id)}
          {r.serviceType ? <> · <span style={{ color: '#0f172a' }}>{r.serviceType}</span></> : null}
        </div>
        <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>
          {relativeTime(r.createdAt) || new Date(r.createdAt).toLocaleDateString('he-IL')}
        </div>
      </div>

      {/* ─── שורה 2: שם הלקוח + טלפון/מייל (קטן) + עמלה (שמאל) ─── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 10,
          marginTop: 4,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 15 }}>{r.customerName}</div>
          <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 1 }}>
            {[formatIsraeliPhoneDisplay(r.customerPhone), r.customerEmail].filter(Boolean).join(' · ') || '—'}
          </div>
        </div>
        {r.commissionAmount != null && (
          <div
            className={done && !r.commissionSettledAt ? 'celebrate' : undefined}
            style={{ textAlign: 'left', flexShrink: 0 }}
          >
            <div style={{ fontWeight: 900, color: '#059669', fontSize: 17 }}>
              {ils(r.commissionAmount)}
            </div>
            <div
              style={{
                fontSize: 10.5,
                color: r.commissionSettledAt ? '#059669' : '#94a3b8',
                fontWeight: 700,
              }}
            >
              {r.commissionSettledAt ? 'שולם לך ✓' : 'עמלה ממתינה'}
            </div>
          </div>
        )}
      </div>

      {/* ─── קופסת הסטטוס הנוכחי: כותרת גדולה + משנה (ה-"הצעת מחיר נשלחה / ההצעה נשלחה ללקוח ואנחנו פועלים לקבלת אישור") ─── */}
      {!lost && j && (
        <div
          style={{
            marginTop: 12,
            padding: '14px 14px 12px',
            background: done ? '#ecfdf5' : BRAND.softBg,
            border: `1px solid ${done ? '#a7f3d0' : BRAND.softBorder}`,
            borderRadius: 14,
          }}
        >
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 800,
              color: accent,
              letterSpacing: '.06em',
              textTransform: 'uppercase',
              marginBottom: 4,
            }}
          >
            שלב {Math.max(1, Math.min(step, JOURNEY_STEPS.length))} מתוך {JOURNEY_STEPS.length}
          </div>
          <div
            style={{
              fontSize: 17,
              fontWeight: 900,
              color: done ? '#065f46' : BRAND.deep,
              lineHeight: 1.3,
            }}
          >
            {j.title}
          </div>
          {j.message && (
            <div
              style={{
                marginTop: 4,
                fontSize: 13,
                color: done ? '#065f46' : '#334155',
                lineHeight: 1.55,
              }}
            >
              {j.message}
            </div>
          )}
        </div>
      )}

      {/* ─── "ציר התקדמות" + timeline אנכי ─── */}
      {!lost ? (
        <div style={{ marginTop: 14 }}>
          <div
            style={{
              fontSize: 11.5,
              fontWeight: 800,
              color: '#64748b',
              letterSpacing: '.04em',
              marginBottom: 8,
            }}
          >
            ציר התקדמות
          </div>
          <WoltTimeline step={step} done={done} accent={accent} />
        </div>
      ) : (
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: '#fff1f2',
              color: '#9f1239',
              borderRadius: 999,
              padding: '5px 12px',
              fontSize: 12.5,
              fontWeight: 800,
            }}
          >
            ✕ הפנייה נסגרה
          </div>
          {j?.reason && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: '#fef3c7',
                color: '#92400e',
                borderRadius: 999,
                padding: '5px 12px',
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              סיבה: {j.reason}
            </div>
          )}
        </div>
      )}

      {/* הודעת סיום ל-LOST — ל-DONE הקופסה העליונה כבר מציגה את ההודעה בכותרת. */}
      {lost && j?.message && (
        <div
          style={{
            marginTop: 12,
            background: '#fff1f2',
            borderRadius: 12,
            padding: '12px 14px',
            fontSize: 13,
            lineHeight: 1.55,
            color: '#9f1239',
            border: '1px solid #fecdd3',
          }}
        >
          {j.title && <div style={{ fontWeight: 800, marginBottom: 3 }}>{j.title}</div>}
          {j.message}
        </div>
      )}

      {/* ─── פרטי עמלה — מופיע תמיד (למעט LOST), עם סטטוס תשלום ברור ─── */}
      {!lost && <CommissionBox r={r} />}
    </div>
  );
}

/**
 * קופסת "פרטי עמלה" בתחתית הכרטיס: סכום, סטטוס (טרם אושרה / ממתינה לתשלום / שולמה),
 * ותאריך תשלום אם קיים. הסטטוס נגזר מ-paidAt/commissionSettledAt של ההפניה —
 * שני טיימסטמפים נפרדים ב-DB: paidAt=הלקוח שילם לנו; commissionSettledAt=אנחנו העברנו לשותף.
 */
function CommissionBox({ r }: { r: Referral }) {
  const hasAmount = r.commissionAmount != null;
  const paid = !!r.commissionSettledAt;
  const approved = !!r.paidAt && !paid;

  const label = paid ? 'שולמה' : approved ? 'ממתינה לתשלום' : 'טרם אושרה';
  const labelColor = paid ? '#059669' : approved ? '#d97706' : '#64748b';
  const labelBg = paid ? '#ecfdf5' : approved ? '#fff7ed' : '#f1f5f9';
  const labelBorder = paid ? '#a7f3d0' : approved ? '#fed7aa' : '#e2e8f0';

  return (
    <div
      style={{
        marginTop: 14,
        padding: '12px 14px',
        background: '#fcfdfb',
        border: `1px solid ${BRAND.softBorder}`,
        borderRadius: 14,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              color: '#64748b',
              letterSpacing: '.04em',
              textTransform: 'uppercase',
            }}
          >
            פרטי עמלה
          </div>
          <div style={{ fontWeight: 900, color: '#059669', fontSize: 20, marginTop: 2 }}>
            {hasAmount ? ils(r.commissionAmount) : '—'}
          </div>
        </div>
        <div
          style={{
            fontSize: 12,
            fontWeight: 800,
            color: labelColor,
            background: labelBg,
            border: `1px solid ${labelBorder}`,
            borderRadius: 999,
            padding: '5px 12px',
          }}
        >
          {label}
        </div>
      </div>
      {paid && r.commissionSettledAt && (
        <div style={{ fontSize: 11.5, color: '#475569', marginTop: 6 }}>
          תאריך תשלום: {new Date(r.commissionSettledAt).toLocaleDateString('he-IL')}
        </div>
      )}
      {!hasAmount && (
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6, lineHeight: 1.5 }}>
          העמלה תחושב ברגע שהלקוח ישלם ואזכאות השותף תאומת לפי תנאי ההסכם.
        </div>
      )}
    </div>
  );
}

/* ── Submit form ──────────────────────────────────────────────────────────── */

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

function SubmitForm({ token, onDone }: { token: string; onDone: (name?: string) => void }) {
  const [mode, setMode] = useState<'manual' | 'paste'>('manual');
  const [pasted, setPasted] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parseErr, setParseErr] = useState('');
  const [parsedBanner, setParsedBanner] = useState<string | null>(null);

  const [f, setF] = useState({
    classification: 'PRIVATE' as 'PRIVATE' | 'COMPANY',
    customerName: '',
    companyName: '',
    customerPhone: '',
    customerEmail: '',
    serviceType: '',
    address: '',
    city: '',
    note: '',
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const isCompany = f.classification === 'COMPANY';

  const parseWithAi = async () => {
    const text = pasted.trim();
    if (!text) {
      setParseErr('הדביקו טקסט לפני הפענוח');
      return;
    }
    setParsing(true);
    setParseErr('');
    try {
      const res = await fetch(apiUrl('/affiliate/me/parse-text'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setParseErr(j?.message || 'פענוח ה-AI נכשל');
        return;
      }
      const data = (await res.json()) as Partial<typeof f>;
      setF((prev) => ({
        ...prev,
        classification: data.classification === 'COMPANY' ? 'COMPANY' : 'PRIVATE',
        customerName: data.customerName || prev.customerName,
        companyName: data.companyName || prev.companyName,
        customerPhone: data.customerPhone || prev.customerPhone,
        customerEmail: data.customerEmail || prev.customerEmail,
        serviceType: data.serviceType || prev.serviceType,
        address: data.address || prev.address,
        city: data.city || prev.city,
        note: data.note || prev.note,
      }));
      // רשימת שדות שנגעו — בודקים לפי מפתחות שהתקבלו עם ערך לא ריק.
      const filled = (
        [
          ['שם', data.customerName],
          ['טלפון', data.customerPhone],
          ['מייל', data.customerEmail],
          ['שירות', data.serviceType],
          ['עיר', data.city],
          ['כתובת', data.address],
          ['הערה', data.note],
        ] as Array<[string, string | undefined]>
      )
        .filter(([, v]) => (v || '').trim().length > 0)
        .map(([k]) => k);
      setParsedBanner(
        filled.length
          ? `AI מילא: ${filled.join(' · ')} — בדקו ועדכנו לפני השליחה.`
          : 'ה-AI לא הצליח לחלץ שדות — אפשר להשלים ידנית.',
      );
      setMode('manual');
    } catch {
      setParseErr('שגיאת רשת — נסו שוב');
    } finally {
      setParsing(false);
    }
  };

  // התקדמות (progress bar) — חישוב כמה שדות חובה מולאו.
  const required = useMemo(() => {
    const checks = [
      !!f.customerName.trim(),
      isCompany ? !!f.companyName.trim() : true,
      !!(f.customerPhone.trim() || f.customerEmail.trim()),
      !!f.serviceType.trim(),
      !!f.note.trim(),
    ];
    const total = checks.length;
    const done = checks.filter(Boolean).length;
    return { total, done, pct: Math.round((done / total) * 100) };
  }, [f, isCompany]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (!f.customerName.trim()) {
      setErr('שם הלקוח הוא שדה חובה');
      return;
    }
    if (isCompany && !f.companyName.trim()) {
      setErr('שם החברה הוא שדה חובה עבור לקוח חברה');
      return;
    }
    if (!f.customerPhone.trim() && !f.customerEmail.trim()) {
      setErr('יש למלא טלפון או אימייל של הלקוח');
      return;
    }
    if (!f.serviceType.trim()) {
      setErr('יש לבחור סוג שירות');
      return;
    }
    if (!f.note.trim()) {
      setErr('ההערה היא שדה חובה — פרטו בקצרה את צורך הלקוח');
      return;
    }

    setBusy(true);
    try {
      const details = [
        `סיווג: ${isCompany ? 'חברה' : 'פרטי'}`,
        isCompany && f.companyName.trim() ? `שם חברה: ${f.companyName.trim()}` : '',
        f.address.trim() ? `כתובת: ${f.address.trim()}` : '',
        f.city.trim() ? `עיר: ${f.city.trim()}` : '',
      ]
        .filter(Boolean)
        .join(' · ');
      const noteFull = details ? `${f.note.trim()}\n(${details})` : f.note.trim();

      const customerName =
        isCompany && f.companyName.trim() ? f.companyName.trim() : f.customerName.trim();

      const res = await fetch(apiUrl('/affiliate/me/referrals'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          customerName,
          customerPhone: f.customerPhone.trim(),
          customerEmail: f.customerEmail.trim(),
          serviceType: f.serviceType.trim(),
          note: noteFull,
        }),
      });
      if (res.ok) {
        onDone(customerName);
        return;
      }
      const j = await res.json().catch(() => ({}));
      setErr(j?.message || 'השליחה נכשלה');
    } catch {
      setErr('שגיאת רשת');
    }
    setBusy(false);
  };

  return (
    <form
      onSubmit={submit}
      className="fade-up"
      style={{
        background: '#fff',
        borderRadius: 18,
        padding: 18,
        marginBottom: 14,
        boxShadow: '0 10px 28px rgba(29,122,61,.1)',
        border: `1px solid ${BRAND.softBorder}`,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* progress bar של השלמת שדות */}
      <div
        aria-hidden
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: '#eef4e8' }}
      >
        <div
          style={{
            height: '100%',
            width: `${required.pct}%`,
            background: `linear-gradient(90deg,${BRAND.green},${BRAND.leaf})`,
            transition: 'width .25s',
          }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: BRAND.deep }}>פרטי הלקוח</div>
        {mode === 'manual' && (
          <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>
            {required.done}/{required.total} שדות חובה
          </div>
        )}
      </div>

      {/* ─── בחירת מצב: ידני / הדבק הודעה (AI) ─── */}
      <div
        role="tablist"
        style={{
          display: 'flex',
          gap: 6,
          background: BRAND.softBg,
          padding: 4,
          borderRadius: 12,
          marginBottom: 12,
          border: `1px solid ${BRAND.softBorder}`,
        }}
      >
        {(
          [
            ['manual', '✍️ מילוי ידני'],
            ['paste', '📋 הדבק הודעה + AI'],
          ] as const
        ).map(([val, label]) => (
          <button
            key={val}
            type="button"
            role="tab"
            aria-selected={mode === val}
            onClick={() => {
              setMode(val);
              setParseErr('');
            }}
            style={{
              flex: 1,
              padding: '9px 10px',
              border: 0,
              borderRadius: 9,
              fontSize: 13,
              fontWeight: 800,
              cursor: 'pointer',
              background: mode === val ? '#fff' : 'transparent',
              color: mode === val ? BRAND.deep : '#64748b',
              boxShadow: mode === val ? '0 2px 6px rgba(29,122,61,.12)' : 'none',
              transition: 'all .15s',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ─── מצב "הדבק הודעה" ─── */}
      {mode === 'paste' && (
        <div style={{ marginBottom: 12 }}>
          <div
            style={{
              background: BRAND.softBgDarker,
              borderRadius: 10,
              padding: '10px 12px',
              fontSize: 12.5,
              color: BRAND.deep,
              marginBottom: 10,
              lineHeight: 1.5,
              border: `1px solid ${BRAND.softBorder}`,
            }}
          >
            הדביקו כאן הודעה אחת של הלקוח (וואטסאפ / מייל / כל טקסט חופשי) — ה-AI יזהה את
            השם, הטלפון, סוג השירות והעיר, וימלא עבורכם את הטופס. אפשר תמיד לתקן לפני שליחה.
          </div>
          <textarea
            style={{
              ...inp,
              minHeight: 140,
              resize: 'vertical',
              lineHeight: 1.5,
              background: '#fcfffa',
            }}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder={
              'דוגמה:\nיוסי כהן 050-1234567\nרוצה בדיקת קרינה לדירה חדשה ברעננה\nיוסי@example.com'
            }
          />
          <button
            type="button"
            onClick={parseWithAi}
            disabled={parsing || !pasted.trim()}
            style={{
              ...btn,
              marginTop: 10,
              width: '100%',
              opacity: parsing || !pasted.trim() ? 0.6 : 1,
            }}
          >
            {parsing ? '🧠 ה-AI מפענח…' : '🧠 פענח ומלא את הטופס'}
          </button>
          {parseErr && (
            <div
              style={{
                marginTop: 10,
                background: '#fef2f2',
                color: '#b91c1c',
                padding: '8px 12px',
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {parseErr}
            </div>
          )}
        </div>
      )}

      {/* באנר הצלחת פענוח — מופיע ברגע שה-AI מילא (מצב manual) */}
      {mode === 'manual' && parsedBanner && (
        <div
          style={{
            marginBottom: 10,
            background: BRAND.softBg,
            border: `1px solid ${BRAND.softBorder}`,
            color: BRAND.deep,
            borderRadius: 10,
            padding: '9px 12px',
            fontSize: 12.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <span>✨ {parsedBanner}</span>
          <button
            type="button"
            onClick={() => setParsedBanner(null)}
            aria-label="סגור"
            style={{
              background: 'transparent',
              border: 0,
              cursor: 'pointer',
              color: BRAND.green,
              fontSize: 18,
              lineHeight: 1,
              fontWeight: 900,
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* סיווג — פרטי / חברה */}
      <label style={lbl}>סיווג הלקוח *</label>
      <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
        {(
          [
            ['PRIVATE', '🧑‍💼 לקוח פרטי'],
            ['COMPANY', '🏢 חברה / עסק'],
          ] as const
        ).map(([val, label]) => (
          <button
            key={val}
            type="button"
            onClick={() => set('classification', val)}
            style={{
              flex: 1,
              padding: '12px 12px',
              borderRadius: 12,
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              border: `1.5px solid ${f.classification === val ? BRAND.green : '#d1d5db'}`,
              background: f.classification === val ? BRAND.softBgDarker : '#fff',
              color: f.classification === val ? BRAND.deep : '#64748b',
              transition: 'all .15s',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))',
          gap: 10,
          marginTop: 8,
        }}
      >
        <div>
          <label style={lbl}>שם הלקוח *</label>
          <input
            style={inp}
            value={f.customerName}
            onChange={(e) => set('customerName', e.target.value)}
            required
          />
        </div>
        {isCompany && (
          <div>
            <label style={lbl}>שם החברה *</label>
            <input
              style={inp}
              value={f.companyName}
              onChange={(e) => set('companyName', e.target.value)}
              placeholder="שם החברה / העסק"
            />
          </div>
        )}
        <div>
          <label style={lbl}>טלפון</label>
          <input
            style={inp}
            value={f.customerPhone}
            onChange={(e) => set('customerPhone', e.target.value)}
            onBlur={() => set('customerPhone', formatIsraeliPhoneDisplay(f.customerPhone))}
            dir="ltr"
          />
        </div>
        <div>
          <label style={lbl}>אימייל</label>
          <input
            style={inp}
            value={f.customerEmail}
            onChange={(e) => set('customerEmail', e.target.value)}
            dir="ltr"
          />
        </div>
        <div>
          <label style={lbl}>סוג שירות *</label>
          <select
            style={{ ...inp, appearance: 'auto' }}
            value={f.serviceType}
            onChange={(e) => set('serviceType', e.target.value)}
            required
          >
            <option value="">— בחר סוג שירות —</option>
            {SERVICE_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={lbl}>כתובת</label>
          <input
            style={inp}
            value={f.address}
            onChange={(e) => set('address', e.target.value)}
            placeholder="אופציונלי"
          />
        </div>
        <div>
          <label style={lbl}>עיר</label>
          <input
            style={inp}
            value={f.city}
            onChange={(e) => set('city', e.target.value)}
            placeholder="אופציונלי"
          />
        </div>
      </div>

      <label style={lbl}>
        הערה *{' '}
        <span style={{ fontWeight: 400, color: '#94a3b8' }}>(פרטו בקצרה את צורך הלקוח)</span>
      </label>
      <textarea
        style={{ ...inp, minHeight: 76, resize: 'vertical' }}
        value={f.note}
        onChange={(e) => set('note', e.target.value)}
        placeholder="למשל: הלקוח מעוניין בבדיקת קרינה לדירה חדשה לפני כניסה…"
      />

      <button
        type="submit"
        disabled={busy}
        style={{ ...btn, marginTop: 14, opacity: busy ? 0.6 : 1, width: '100%' }}
      >
        {busy ? 'שולח…' : 'שלחו לנו את הלקוח'}
      </button>
      {err && (
        <div
          style={{
            marginTop: 10,
            background: '#fef2f2',
            color: '#b91c1c',
            padding: '8px 12px',
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {err}
        </div>
      )}
      <div style={{ marginTop: 8, fontSize: 11, color: '#94a3b8' }}>
        * טלפון או אימייל — לפחות אחד נדרש
      </div>
    </form>
  );
}

/* ── Shared styles ────────────────────────────────────────────────────────── */

const lbl: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  margin: '12px 0 6px',
  color: '#334155',
};
const inp: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  border: '1px solid #d1d5db',
  borderRadius: 12,
  fontSize: 15,
  outline: 'none',
  boxSizing: 'border-box',
  background: '#fff',
};
const btn: React.CSSProperties = {
  padding: '12px 18px',
  border: 0,
  borderRadius: 12,
  background: `linear-gradient(135deg,${BRAND.green},${BRAND.leaf})`,
  color: '#fff',
  fontSize: 14,
  fontWeight: 800,
  cursor: 'pointer',
  boxShadow: '0 8px 20px rgba(29,122,61,.28)',
  transition: 'transform .1s',
};
const dateInp: React.CSSProperties = {
  padding: '8px 10px',
  border: `1px solid ${BRAND.softBorder}`,
  borderRadius: 10,
  fontSize: 13,
  background: '#fff',
  color: '#0f172a',
  outline: 'none',
  fontFamily: 'inherit',
};
