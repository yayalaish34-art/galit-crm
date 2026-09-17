'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Info,
  Loader2,
  MessageSquareText,
  PackageCheck,
  Send,
  X,
} from 'lucide-react';
import { apiFetch, apiUrl, type ApiAuthUser } from '../lib/api-base';
import { isRadonKitSku } from '../lib/radon-tracks';

/**
 * מעקב ערכת ראדון — הקומפוננטה הקבועה בסרגל הימני של המשימה.
 *
 * למה כאן ולא בשלב "תיאום": בערכה עצמית אין תיאום. הגלאים יוצאים בדואר,
 * הלקוח מתקין לבד, ותקופת הבדיקה רצה 90 יום שבהם אף אחד לא נוגע במשימה.
 * כפתור שחי בתוך שלב אחד היה נעלם מהעין בדיוק בתקופה שבה צריך לראות מה קורה,
 * ולכן המעקב יושב בסרגל הקבוע — גלוי בכל שלב, בלי ללחוץ.
 *
 * ארבעת המצבים שהוא מצייר:
 *   not_sent              הערכה אצלנו → כפתור "הערכה נשלחה ללקוח"
 *   awaiting_confirmation ההודעה יצאה → ממתינים שהלקוח יאשר בוואטסאפ מתי התקין
 *   testing               הלקוח אישר → ספירה לאחור
 *   ended                 נגמרו הימים → התראה + הודעת החזרה נשלחה אוטומטית
 *
 * שתי ההודעות (ההוראות שלפני, ובקשת ההחזרה שאחרי) ניתנות לצפייה בכל שלב —
 * זו הדרישה ל"שקיפות מלאה": העובד רואה מה נשלח ומה עומד להישלח, מילה במילה.
 */

type KitStage = 'not_sent' | 'awaiting_confirmation' | 'testing' | 'ended' | 'returned';

type KitState = {
  stage: KitStage;
  testDurationDays: number;
  daysLeft: number | null;
  daysElapsed: number | null;
  configured: boolean;
  recipient: { phone: string | null; name: string | null } | null;
  job: {
    id: string;
    kitSentAt: string | null;
    /** 'manual' = עובד לחץ | 'auto' = חלון 48 השעות נסגר ואיש לא לחץ. */
    kitSentVia: string | null;
    kitInstructionsSentAt: string | null;
    installConfirmedAt: string | null;
    installConfirmedVia: string | null;
    installConfirmedNote: string | null;
    installedOn: string | null;
    expectedEndAt: string | null;
    collectedAt: string | null;
  } | null;
  messages: {
    instructions: { text: string; sentAt: string | null };
    return: { text: string; scheduledFor: string | null };
  };
};

/** שלבי הציר, לפי הסדר — גם התוויות וגם ההשוואה "האם כבר עברנו את זה". */
const STEPS: Array<{ stage: KitStage; label: string }> = [
  { stage: 'not_sent', label: 'הכנת הערכה' },
  { stage: 'awaiting_confirmation', label: 'נשלחה ללקוח' },
  { stage: 'testing', label: 'הלקוח אישר התקנה' },
  { stage: 'ended', label: 'הבדיקה הסתיימה' },
];

const STEP_INDEX: Record<KitStage, number> = {
  not_sent: 0,
  awaiting_confirmation: 1,
  testing: 2,
  ended: 3,
  returned: 4,
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('he-IL');
}

/** ערך ל-input[type=date]: היום, בשעון המקומי. */
function todayLocalDate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** גוף ריק מ-Nest (200 + null) מפיל את res.json() — אותה מלכודת של שאר המודול. */
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

export function RadonKitTracker({
  taskId,
  sku,
  customerId,
  authUser,
}: {
  taskId: string;
  sku: string;
  customerId?: string | null;
  authUser?: ApiAuthUser | null;
}) {
  const [state, setState] = useState<KitState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** איזו הודעה מוצגת ב-overlay: 'instructions' | 'return' | null */
  const [showMessage, setShowMessage] = useState<'instructions' | 'return' | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [manualDate, setManualDate] = useState(todayLocalDate());
  const [sendOpen, setSendOpen] = useState(false);

  const isKit = isRadonKitSku(sku);

  /* אותה בעיית יציבות של CustomerReminderCard: ההורה בונה authUser חדש בכל
     רינדור, והדשבורד מפעיל פולינג כל 20 שניות. תלות במפתח טקסטואלי + ref
     מונעת טעינה מחדש שמאפסת מצב שהמשתמש פתח. */
  const authRef = useRef(authUser);
  authRef.current = authUser;
  const authKey = `${authUser?.id ?? ''}|${authUser?.role ?? ''}`;
  const didInitRef = useRef(false);

  const load = useCallback(async () => {
    if (!isKit) {
      setLoading(false);
      return;
    }
    if (!didInitRef.current) setLoading(true);
    try {
      const res = await apiFetch(
        apiUrl(`/radon/kit/${taskId}?sku=${encodeURIComponent(sku)}`),
        { authUser: authRef.current },
      );
      if (res.ok) {
        const data = await readJson(res);
        if (data) setState(data);
        setError(null);
      } else {
        const data = await readJson(res);
        setError(data?.message ?? 'לא ניתן לטעון את מעקב הערכה');
      }
    } catch {
      setError('לא ניתן לטעון את מעקב הערכה');
    } finally {
      setLoading(false);
      didInitRef.current = true;
    }
  }, [taskId, sku, isKit, authKey]);

  useEffect(() => {
    void load();
  }, [load]);

  // לא ערכה — אין מה לעקוב. זהה להתנהגות CustomerReminderCard.
  if (!isKit) return null;

  const post = async (path: string, body: any, onDone?: () => void) => {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(apiUrl(path), {
        method: 'POST',
        authUser: authRef.current,
        body: JSON.stringify(body),
      });
      const data = await readJson(res);
      if (!res.ok) {
        setError(data?.message ?? 'הפעולה נכשלה');
        return;
      }
      if (data) setState(data);
      onDone?.();
    } catch {
      setError('שגיאת רשת — נסו שוב');
    } finally {
      setBusy(false);
    }
  };

  const markSent = () =>
    post('/radon/kit/sent', { taskId, sku, customerId: customerId ?? null }, () =>
      setSendOpen(false),
    );

  /**
   * שמירת משך הבדיקה בשרת ולא ב-state מקומי, כי המספר מופיע *בתוך* נוסח
   * ההודעה ("תקופת הבדיקה היא 90 ימים"). השרת מנסח מחדש ומחזיר את הטקסט
   * המעודכן, כך שהתצוגה המקדימה נשארת זהה למה שיישלח בפועל.
   */
  const saveDuration = (value: number) => {
    if (!Number.isFinite(value) || value <= 0 || value === state?.testDurationDays) return;
    void post('/radon/kit/duration', { taskId, sku, testDurationDays: value });
  };

  const confirmManually = () =>
    post('/radon/kit/confirm', { taskId, installedOn: manualDate }, () =>
      setConfirmOpen(false),
    );

  const markReturned = () => post('/radon/kit/returned', { taskId, sku });

  // ── מסגרת הכרטיס ──

  if (loading) {
    return (
      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
          <Loader2 className="h-3 w-3 animate-spin" />
          טוען מעקב ערכה…
        </div>
      </div>
    );
  }

  const stage: KitStage = state?.stage ?? 'not_sent';
  const currentIdx = STEP_INDEX[stage];
  const daysLeft = state?.daysLeft ?? null;
  const totalDays = state?.testDurationDays ?? 90;
  const overdue = stage === 'ended';

  return (
    <>
      <div
        className={`mb-3 rounded-lg border p-2.5 ${
          overdue
            ? 'border-rose-300 bg-rose-50'
            : stage === 'testing'
              ? 'border-emerald-200 bg-emerald-50/70'
              : 'border-slate-200 bg-white'
        }`}
      >
        {/* כותרת */}
        <div className="mb-2 flex items-center gap-1.5">
          <PackageCheck
            className={`h-3.5 w-3.5 shrink-0 ${overdue ? 'text-rose-600' : 'text-emerald-700'}`}
          />
          <span className="text-[11px] font-bold text-slate-700">מעקב ערכת ראדון</span>
        </div>

        {/* ── ציר ההתקדמות ── */}
        <ol className="mb-2.5 space-y-1">
          {STEPS.map((step, idx) => {
            const done = idx < currentIdx || stage === 'returned';
            const active = idx === currentIdx;
            return (
              <li key={step.stage} className="flex items-center gap-1.5">
                <span
                  className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border text-[8px] font-bold ${
                    done
                      ? 'border-emerald-500 bg-emerald-500 text-white'
                      : active
                        ? overdue
                          ? 'border-rose-500 bg-rose-500 text-white'
                          : 'border-emerald-500 bg-white text-emerald-600'
                        : 'border-slate-300 bg-white text-slate-300'
                  }`}
                >
                  {done ? '✓' : idx + 1}
                </span>
                <span
                  className={`text-[10.5px] leading-tight ${
                    active
                      ? overdue
                        ? 'font-bold text-rose-700'
                        : 'font-bold text-slate-800'
                      : done
                        ? 'font-semibold text-slate-500'
                        : 'text-slate-400'
                  }`}
                >
                  {step.label}
                </span>
              </li>
            );
          })}
        </ol>

        {/* ── נשלחה אוטומטית ──
            מוצג בכל שלב אחרי השליחה, ולא רק בזה שאחריה מיד: מי שפותח את הכרטיס
            בעוד חודשיים חייב לדעת שהתהליך התחיל בלי שאדם אישר שהערכה יצאה. */}
        {state?.job?.kitSentVia === 'auto' && (
          <div className="mb-2 flex items-start gap-1 rounded border border-sky-200 bg-sky-50 p-1.5 text-[9.5px] font-semibold leading-snug text-sky-800">
            <Info className="mt-px h-3 w-3 shrink-0" />
            <span>נשלחה אוטומטית — עברו 48 שעות בשלב ביצוע ואיש לא סימן שהערכה יצאה.</span>
          </div>
        )}

        {/* ── גוף משתנה לפי שלב ── */}

        {stage === 'not_sent' && (
          <>
            <p className="mb-2 text-[10.5px] leading-snug text-slate-500">
              בלחיצה תישלח ללקוח הודעת וואטסאפ עם הוראות ההצבה ובקשה לעדכן מתי התקין.
              אם לא ייסמן תוך 48 שעות בשלב ביצוע — ההודעה תישלח אוטומטית.
            </p>
            <button
              type="button"
              disabled={busy || state?.configured === false}
              onClick={() => setSendOpen(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-2 py-2 text-[11px] font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
              הערכה נשלחה ללקוח
            </button>
            {state?.configured === false && (
              <p className="mt-1.5 text-[10px] font-semibold text-amber-600">
                שירות הוואטסאפ אינו מוגדר בשרת — לא ניתן לשלוח.
              </p>
            )}
          </>
        )}

        {stage === 'awaiting_confirmation' && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-2">
            <div className="flex items-center gap-1.5 text-[10.5px] font-bold text-amber-800">
              <Clock className="h-3 w-3 shrink-0" />
              ממתינים לאישור הלקוח
            </div>
            <p className="mt-1 text-[10px] leading-snug text-amber-700">
              ההודעה נשלחה ב-{formatDate(state?.job?.kitInstructionsSentAt ?? null)}. הספירה תתחיל
              ברגע שהלקוח יענה בוואטסאפ מתי הציב את הגלאים.
            </p>
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              className="mt-1.5 w-full rounded-md border border-amber-300 bg-white px-2 py-1 text-[10px] font-bold text-amber-800 transition hover:bg-amber-100"
            >
              הלקוח מסר תאריך בטלפון — הזן ידנית
            </button>
          </div>
        )}

        {(stage === 'testing' || stage === 'ended') && (
          <div
            className={`rounded-md border p-2 ${
              overdue ? 'border-rose-300 bg-white' : 'border-emerald-200 bg-white'
            }`}
          >
            {/* ספירה לאחור */}
            <div className="text-center">
              <div
                className={`text-2xl font-black leading-none ${
                  overdue ? 'text-rose-600' : 'text-emerald-600'
                }`}
              >
                {daysLeft == null ? '—' : Math.abs(daysLeft)}
              </div>
              <div
                className={`mt-0.5 text-[10px] font-bold ${
                  overdue ? 'text-rose-700' : 'text-emerald-700'
                }`}
              >
                {daysLeft == null
                  ? 'ימים'
                  : overdue
                    ? daysLeft === 0
                      ? 'הבדיקה הסתיימה היום'
                      : 'ימים מאז סיום הבדיקה'
                    : `ימים נותרו מתוך ${totalDays}`}
              </div>
            </div>

            {/* פס התקדמות */}
            {daysLeft != null && (
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className={`h-full rounded-full ${overdue ? 'bg-rose-500' : 'bg-emerald-500'}`}
                  style={{
                    width: `${Math.min(100, Math.max(0, ((state?.daysElapsed ?? 0) / totalDays) * 100))}%`,
                  }}
                />
              </div>
            )}

            <dl className="mt-2 space-y-0.5 text-[10px] text-slate-600">
              <div className="flex justify-between gap-1">
                <dt className="font-semibold">הותקן:</dt>
                <dd>{formatDate(state?.job?.installedOn ?? null)}</dd>
              </div>
              <div className="flex justify-between gap-1">
                <dt className="font-semibold">סיום:</dt>
                <dd>{formatDate(state?.job?.expectedEndAt ?? null)}</dd>
              </div>
              {state?.job?.installConfirmedVia && (
                <div className="flex justify-between gap-1">
                  <dt className="font-semibold">אושר:</dt>
                  <dd>
                    {state.job.installConfirmedVia === 'whatsapp' ? 'ע״י הלקוח בוואטסאפ' : 'ידנית'}
                  </dd>
                </div>
              )}
            </dl>

            {state?.job?.installConfirmedNote && (
              <p className="mt-1 rounded bg-slate-50 p-1 text-[9.5px] italic leading-snug text-slate-500">
                “{state.job.installConfirmedNote}”
              </p>
            )}

            {overdue && (
              <>
                <div className="mt-2 flex items-start gap-1 rounded border border-rose-200 bg-rose-50 p-1.5 text-[10px] font-semibold leading-snug text-rose-700">
                  <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                  <span>ללקוח נשלחה בקשה להחזיר את הגלאים.</span>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={markReturned}
                  className="mt-1.5 flex w-full items-center justify-center gap-1 rounded-md bg-slate-700 px-2 py-1.5 text-[10px] font-bold text-white transition hover:bg-slate-800 disabled:opacity-50"
                >
                  {busy ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3 w-3" />
                  )}
                  הגלאים חזרו למשרד
                </button>
              </>
            )}
          </div>
        )}

        {stage === 'returned' && (
          <div className="rounded-md border border-slate-200 bg-white p-2">
            <div className="flex items-center gap-1.5 text-[10.5px] font-bold text-slate-700">
              <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-600" />
              הגלאים חזרו למשרד
            </div>
            <p className="mt-1 text-[10px] text-slate-500">
              התקבלו ב-{formatDate(state?.job?.collectedAt ?? null)}. אפשר להעביר לאנליזה.
            </p>
          </div>
        )}

        {/* ── שתי ההודעות — זמינות תמיד ── */}
        <div className="mt-2 space-y-1 border-t border-slate-200 pt-2">
          <MessageButton
            label="הודעת ההוראות (לפני)"
            hint={
              state?.messages.instructions.sentAt
                ? `נשלחה ${formatDate(state.messages.instructions.sentAt)}`
                : 'טרם נשלחה'
            }
            onClick={() => setShowMessage('instructions')}
          />
          <MessageButton
            label="הודעת ההחזרה (אחרי)"
            hint={
              state?.messages.return.scheduledFor
                ? `תישלח ${formatDate(state.messages.return.scheduledFor)}`
                : 'תיקבע לפי תאריך ההתקנה'
            }
            onClick={() => setShowMessage('return')}
          />
        </div>

        {error && (
          <p className="mt-1.5 rounded bg-rose-50 p-1 text-[10px] font-semibold text-rose-700">
            {error}
          </p>
        )}
      </div>

      {/* ── overlay: נוסח ההודעה ── */}
      {showMessage && state && (
        <Overlay
          title={
            showMessage === 'instructions'
              ? 'הודעת הוראות — נשלחת עם הערכה'
              : 'הודעת החזרה — נשלחת בתום הבדיקה'
          }
          onClose={() => setShowMessage(null)}
        >
          <p className="mb-2 text-[11px] font-semibold text-slate-500">
            {showMessage === 'instructions'
              ? state.messages.instructions.sentAt
                ? `נשלחה ללקוח ב-${formatDate(state.messages.instructions.sentAt)}. זה הנוסח המדויק שהתקבל אצלו.`
                : 'זה הנוסח המדויק שיישלח ללקוח ברגע שתסמנו שהערכה נשלחה.'
              : state.messages.return.scheduledFor
                ? `תישלח אוטומטית ב-${formatDate(state.messages.return.scheduledFor)}, בתום ${state.testDurationDays} ימי הבדיקה.`
                : 'תישלח אוטומטית בתום תקופת הבדיקה, אחרי שהלקוח יאשר את תאריך ההתקנה.'}
          </p>
          <pre
            dir="rtl"
            className="max-h-[55vh] overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 text-[12.5px] leading-relaxed text-slate-800"
            style={{ fontFamily: 'inherit' }}
          >
            {showMessage === 'instructions'
              ? state.messages.instructions.text
              : state.messages.return.text}
          </pre>
          {state.recipient?.phone && (
            <p className="mt-2 text-[11px] text-slate-500">
              נמען: {state.recipient.name ?? '—'} · {state.recipient.phone}
            </p>
          )}
        </Overlay>
      )}

      {/* ── overlay: אישור שליחת הערכה ── */}
      {sendOpen && state && (
        <Overlay title="שליחת הערכה ללקוח" onClose={() => setSendOpen(false)}>
          <p className="mb-2 text-[12px] leading-relaxed text-slate-600">
            ההודעה הבאה תישלח עכשיו בוואטסאפ אל{' '}
            <strong>{state.recipient?.name ?? 'הלקוח'}</strong>
            {state.recipient?.phone ? ` (${state.recipient.phone})` : ''}, ונמתין שהוא יאשר מתי
            הציב את הגלאים.
          </p>
          <label className="mb-2 flex items-center gap-2 text-[12px] font-bold text-slate-600">
            משך הבדיקה (ימים)
            <input
              type="number"
              min={1}
              max={400}
              defaultValue={state.testDurationDays}
              disabled={busy}
              onBlur={(e) => saveDuration(Number(e.target.value))}
              className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-[12px] font-normal"
            />
            <span className="text-[11px] font-normal text-slate-400">
              המספר מופיע בהודעה — שינוי מנסח אותה מחדש
            </span>
          </label>
          <pre
            dir="rtl"
            className="max-h-[40vh] overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 text-[12.5px] leading-relaxed text-slate-800"
            style={{ fontFamily: 'inherit' }}
          >
            {state.messages.instructions.text}
          </pre>
          {error && (
            <p className="mt-2 rounded bg-rose-50 p-1.5 text-[11px] font-semibold text-rose-700">
              {error}
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={markSent}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-[12px] font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              שלח ללקוח וסמן כנשלחה
            </button>
            <button
              type="button"
              onClick={() => setSendOpen(false)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-[12px] font-bold text-slate-600 transition hover:bg-slate-50"
            >
              ביטול
            </button>
          </div>
        </Overlay>
      )}

      {/* ── overlay: אישור התקנה ידני ── */}
      {confirmOpen && (
        <Overlay title="רישום תאריך התקנה" onClose={() => setConfirmOpen(false)}>
          <p className="mb-2 text-[12px] leading-relaxed text-slate-600">
            השתמשו בזה רק אם הלקוח מסר את תאריך ההתקנה מחוץ לוואטסאפ. מהתאריך הזה תתחיל הספירה,
            ובתום {state?.testDurationDays ?? 90} ימים תישלח לו אוטומטית בקשת ההחזרה.
          </p>
          <label className="block text-[11px] font-bold text-slate-600">
            תאריך ההתקנה
            <input
              type="date"
              value={manualDate}
              max={todayLocalDate()}
              onChange={(e) => setManualDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-[12px]"
            />
          </label>
          {error && (
            <p className="mt-2 rounded bg-rose-50 p-1.5 text-[11px] font-semibold text-rose-700">
              {error}
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={busy || !manualDate}
              onClick={confirmManually}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-[12px] font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CalendarClock className="h-3.5 w-3.5" />
              )}
              התחל ספירה
            </button>
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-[12px] font-bold text-slate-600 transition hover:bg-slate-50"
            >
              ביטול
            </button>
          </div>
        </Overlay>
      )}
    </>
  );
}

/** שורת "הצג הודעה מנוסחת" — קומפקטית מספיק לסרגל של 248px. */
function MessageButton({
  label,
  hint,
  onClick,
}: {
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-1.5 rounded-md border border-slate-200 bg-white px-1.5 py-1 text-right transition hover:border-slate-300 hover:bg-slate-50"
    >
      <MessageSquareText className="h-3 w-3 shrink-0 text-slate-500" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[10px] font-bold text-slate-700">{label}</span>
        <span className="block truncate text-[9.5px] text-slate-400">{hint}</span>
      </span>
      <ChevronLeft className="h-3 w-3 shrink-0 text-slate-400" />
    </button>
  );
}

/**
 * חלון צף. z-[10050] במכוון: פאנל המשימה המורחב הוא z-[9999], וכל מודאל
 * שנפתח מתוכו ברמה נמוכה יותר מרונדר מאחוריו ונראה כאילו לא נפתח כלום.
 */
function Overlay({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      style={{ direction: 'rtl' }}
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-[13px] font-bold text-slate-800">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
