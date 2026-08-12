'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Bell, BellOff, CheckCircle2, Loader2, MessageCircle } from 'lucide-react';
import { apiFetch, apiUrl, type ApiAuthUser } from '../lib/api-base';
import { isRadonKitSku } from '../lib/radon-tracks';

/**
 * "תזכור לקוח" — תזכורת וואטסאפ אוטומטית להחזרת ערכת הראדון.
 *
 * מוצג רק לשירותי ערכה (61 / 10000). ההיגיון: בערכה עצמית הגלאים יוצאים
 * פיזית לידי הלקוח, והוא זה שאמור להוריד אותם בתום התקופה ולשלוח אלינו
 * בחזרה. בבדיקה עם בודק (10044 / 10017) אנחנו אוספים — אין למי להזכיר.
 *
 * הכרטיס לא שולח וואטסאפ בעצמו: הוא מתזמן בבוט, והבוט שולח בעוד 90 יום.
 * לכן כל המצבים מגיעים מהשרת ולא מהדפדפן — רענון או מחשב אחר מציגים אותו דבר.
 */

type Reminder = {
  id: string;
  status: 'SCHEDULED' | 'SENT' | 'FAILED' | 'CANCELLED';
  dueAt: string;
  sentAt: string | null;
  customerPhone: string;
  customerName: string | null;
  messageText: string;
  errorMessage: string | null;
};

const STATUS_LABEL: Record<Reminder['status'], string> = {
  SCHEDULED: 'מתוזמנת',
  SENT: 'נשלחה',
  FAILED: 'נכשלה',
  CANCELLED: 'בוטלה',
};

const STATUS_TONE: Record<Reminder['status'], string> = {
  SCHEDULED: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  SENT: 'border-slate-200 bg-slate-50 text-slate-600',
  FAILED: 'border-rose-200 bg-rose-50 text-rose-700',
  CANCELLED: 'border-slate-200 bg-slate-50 text-slate-500',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('he-IL');
}

/** תאריך ושעה מלאים — למועד שנבחר ידנית, שבו גם השעה משמעותית. */
function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString('he-IL')} ${d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`;
}

/** ערך התחלתי ל-datetime-local: עוד N ימים, בשעה 10:00, בשעון המקומי. */
function defaultLocalDateTime(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + (daysAhead > 0 ? daysAhead : 1));
  d.setHours(10, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * קורא גוף תשובה כ-JSON בלי להתרסק על גוף ריק — אותה מלכודת שהפילה את
 * טעינת זרימת הראדון: Nest משדר null כגוף ריק עם 200, ו-`res.json()` על גוף
 * ריק זורק "Unexpected end of JSON input".
 */
async function readJson(res: Response): Promise<any> {
  let text: string;
  try {
    text = await res.text();
  } catch {
    return null;
  }
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function CustomerReminderCard({
  taskId,
  sku,
  radonJobId,
  authUser,
}: {
  taskId: string;
  sku: string;
  radonJobId?: string | null;
  authUser?: ApiAuthUser | null;
}) {
  const [live, setLive] = useState<Reminder | null>(null);
  const [history, setHistory] = useState<Reminder[]>([]);
  const [defaultDays, setDefaultDays] = useState(90);
  const [days, setDays] = useState(90);
  /** 'days' = בעוד X ימים (ברירת מחדל) | 'exact' = תאריך ושעה שנבחרו ידנית */
  const [mode, setMode] = useState<'days' | 'exact'>('days');
  const [exactAt, setExactAt] = useState<string>('');
  const [preview, setPreview] = useState<string>('');
  const [recipient, setRecipient] = useState<{ phone: string | null; name: string | null } | null>(null);
  const [phoneOverride, setPhoneOverride] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const isKit = isRadonKitSku(sku);

  const load = useCallback(async () => {
    if (!isKit) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const [stateRes, previewRes] = await Promise.all([
        apiFetch(apiUrl(`/radon/reminder/task/${taskId}`), { authUser }),
        apiFetch(apiUrl(`/radon/reminder/preview/${taskId}`), { authUser }),
      ]);

      if (stateRes.ok) {
        const data = await readJson(stateRes);
        setLive(data?.live ?? null);
        setHistory(Array.isArray(data?.history) ? data.history : []);
        if (typeof data?.defaultDelayDays === 'number') {
          setDefaultDays(data.defaultDelayDays);
          setDays(data.defaultDelayDays);
        }
      }
      if (previewRes.ok) {
        const data = await readJson(previewRes);
        setPreview(data?.messageText ?? '');
        setRecipient(data?.recipient ?? null);
        // הטלפון של הלקוח נכנס לשדה עצמו (ולא רק כ-placeholder) כדי שיהיה גלוי
        // וניתן לעריכה — המשתמש ביקש שהמספר "ייכנס אוטומטית".
        const phone = String(data?.recipient?.phone ?? '').trim();
        if (phone) setPhoneOverride((prev) => (prev.trim() ? prev : phone));
      }
    } catch {
      setError('לא ניתן לטעון את מצב התזכורת');
    } finally {
      setLoading(false);
    }
  }, [taskId, isKit, authUser]);

  useEffect(() => { void load(); }, [load]);

  // הכרטיס כולו לא קיים לשירות שאינו ערכה — זו הדרישה המרכזית של הפיצ'ר.
  if (!isKit) return null;

  const schedule = async () => {
    // במצב "תאריך ושעה" שולחים ISO מוחלט; ה-datetime-local הוא זמן מקומי, ו-new Date
    // עליו מפרש אותו כמקומי — בדיוק מה שהמשתמש רואה על המסך.
    let dueAtIso: string | null = null;
    if (mode === 'exact') {
      const d = new Date(exactAt);
      if (Number.isNaN(d.getTime())) { setError('תאריך/שעה לא תקינים'); return; }
      if (d.getTime() <= Date.now()) { setError('יש לבחור מועד עתידי'); return; }
      dueAtIso = d.toISOString();
    }
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(apiUrl('/radon/reminder'), {
        method: 'POST',
        authUser,
        body: JSON.stringify({
          taskId,
          sku,
          radonJobId: radonJobId ?? null,
          delayDays: mode === 'days' ? days : undefined,
          dueAt: dueAtIso,
          phoneOverride: phoneOverride.trim() || null,
        }),
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error(data?.message ?? data?.error ?? 'שגיאה בתזמון התזכורת');
      await load();
      setExpanded(false);
      setPhoneOverride('');
    } catch (e: any) {
      setError(e?.message ?? 'שגיאה בתזמון התזכורת');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!live) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(apiUrl(`/radon/reminder/${live.id}/cancel`), {
        method: 'POST',
        authUser,
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error(data?.message ?? data?.error ?? 'שגיאה בביטול התזכורת');
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'שגיאה בביטול התזכורת');
    } finally {
      setBusy(false);
    }
  };

  const effectivePhone = phoneOverride.trim() || recipient?.phone || '';

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-100 text-emerald-700">
            <MessageCircle className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-[13px] font-bold text-emerald-900">תזכורת ללקוח בוואטסאפ</h3>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-emerald-700">
              הערכה אצל הלקוח. התזכורת נשלחת אוטומטית בתום התקופה ומבקשת ממנו
              להוריד את הגלאים ולשלוח אלינו בחזרה.
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="mt-3 flex items-center gap-2 text-[12px] text-emerald-700">
          <Loader2 className="h-4 w-4 animate-spin" />
          טוען…
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-[12px] text-rose-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* ── תזכורת פעילה ── */}
          {live ? (
            <div className="rounded-lg border border-emerald-300 bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-emerald-800">
                  <CheckCircle2 className="h-4 w-4" />
                  תזכורת מתוזמנת ל-{formatDateTime(live.dueAt)}
                </div>
                <button
                  onClick={cancel}
                  disabled={busy}
                  className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11.5px] font-medium text-slate-600 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <BellOff className="h-3 w-3" />}
                  ביטול
                </button>
              </div>
              <div className="mt-1 text-[11.5px] text-slate-500">
                תישלח אל {live.customerName ? `${live.customerName} · ` : ''}{live.customerPhone}
              </div>
            </div>
          ) : (
            /* ── תזמון חדש ── */
            <div className="space-y-2">
              {!recipient?.phone && !phoneOverride.trim() && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[12px] text-amber-800">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>אין ללקוח מספר טלפון במערכת — הזינו מספר לתזכורת.</span>
                </div>
              )}

              {/* בחירת מועד: ספירת ימים (ברירת המחדל, 90 לערכה) או תאריך ושעה מדויקים. */}
              <div className="flex flex-wrap items-center gap-1.5">
                {([
                  { key: 'days' as const, label: 'בעוד כמה ימים' },
                  { key: 'exact' as const, label: 'תאריך ושעה מדויקים' },
                ]).map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => {
                      setMode(opt.key);
                      if (opt.key === 'exact' && !exactAt) setExactAt(defaultLocalDateTime(days || defaultDays));
                    }}
                    className={`rounded-full px-3 py-1 text-[11.5px] font-bold transition ${
                      mode === opt.key
                        ? 'bg-emerald-600 text-white'
                        : 'border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-100'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-end gap-2">
                {mode === 'days' ? (
                  <label className="block">
                    <span className="mb-1 block text-[11.5px] font-semibold text-emerald-800">בעוד (ימים)</span>
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={days}
                      onChange={(e) => setDays(Number(e.target.value) || defaultDays)}
                      className="w-24 rounded-lg border border-emerald-200 px-2.5 py-1.5 text-[12.5px] text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                    />
                  </label>
                ) : (
                  <label className="block">
                    <span className="mb-1 block text-[11.5px] font-semibold text-emerald-800">מועד השליחה</span>
                    <input
                      type="datetime-local"
                      value={exactAt}
                      onChange={(e) => setExactAt(e.target.value)}
                      className="rounded-lg border border-emerald-200 px-2.5 py-1.5 text-[12.5px] text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                    />
                  </label>
                )}

                <label className="block flex-1 min-w-[10rem]">
                  <span className="mb-1 block text-[11.5px] font-semibold text-emerald-800">
                    טלפון הלקוח
                  </span>
                  <input
                    value={phoneOverride}
                    onChange={(e) => setPhoneOverride(e.target.value)}
                    placeholder={recipient?.phone ?? 'הזינו מספר'}
                    className="w-full rounded-lg border border-emerald-200 px-2.5 py-1.5 text-[12.5px] text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                  />
                </label>

                <button
                  onClick={schedule}
                  disabled={busy || !effectivePhone}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bell className="h-3.5 w-3.5" />}
                  תזכור לקוח
                </button>
              </div>

              {/* השולח רץ בראש כל שעה (דקה 07), ולכן מועד מדויק נשלח בהרצה הקרובה אחריו. */}
              <div className="text-[11px] text-emerald-700/80">
                {mode === 'exact'
                  ? 'ההודעה תישלח בהרצה הקרובה אחרי המועד שנבחר (בדיקה בראש כל שעה).'
                  : `ברירת המחדל לערכה היא ${defaultDays} ימים — אפשר לשנות.`}
              </div>
            </div>
          )}

          {/* ── נוסח ההודעה ── */}
          {preview && (
            <div>
              <button
                onClick={() => setExpanded((v) => !v)}
                className="text-[11.5px] font-semibold text-emerald-700 underline-offset-2 hover:underline"
              >
                {expanded ? 'הסתר את נוסח ההודעה' : 'הצג את נוסח ההודעה שתישלח'}
              </button>
              {expanded && (
                <pre className="mt-1.5 whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-2.5 text-[11.5px] leading-relaxed text-slate-600">
                  {live?.messageText ?? preview}
                </pre>
              )}
            </div>
          )}

          {/* ── היסטוריה ── */}
          {history.filter((h) => h.status !== 'SCHEDULED').length > 0 && (
            <div className="space-y-1">
              <div className="text-[11.5px] font-semibold text-slate-500">תזכורות קודמות</div>
              {history
                .filter((h) => h.status !== 'SCHEDULED')
                .slice(0, 5)
                .map((h) => (
                  <div key={h.id} className="flex items-center justify-between gap-2 text-[11.5px]">
                    <span className="text-slate-500">
                      {formatDate(h.sentAt ?? h.dueAt)}
                      {h.errorMessage && <span className="mr-1.5 text-rose-600">· {h.errorMessage}</span>}
                    </span>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${STATUS_TONE[h.status]}`}>
                      {STATUS_LABEL[h.status]}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
