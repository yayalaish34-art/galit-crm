'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Info,
  Loader2,
  MessageSquareText,
  PackageCheck,
  Plus,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { apiFetch, apiUrl, type ApiAuthUser } from '../lib/api-base';

/**
 * טאב "גלאים" בכרטיס הלקוח — מעקב ערכות ראדון (61/10000) של הלקוח, לפי לקוח
 * ולא לפי משימה בודדת.
 *
 * למה טאב נפרד ולא רק <RadonKitTracker /> שכבר קיים: הוא יושב בסרגל הימני של
 * *משימה ספציפית*, כלומר גלוי רק למי שכבר פתח את אותה משימה בדיוק — ובתהליך
 * שרץ 90 יום שאף אחד לא נוגע במשימה בזמנו, זה בפועל בלתי-נראה. כאן זה נגיש
 * מכרטיס הלקוח עצמו, בלי לחפש איזו משימה.
 *
 * מציג רשימה (לקוח יכול לרכוש כמה ערכות לאורך זמן), עם שני שדות שלא היו
 * נגישים לעריכה בכלל עד עכשיו: תאריך מסירה ומספר גלאי. סוג הערכה (קצר/ארוך)
 * מוצג אבל לא ניתן לעריכה — הוא נגזר מה-sku שבו נמכר השירות (61=קצרה,
 * 10000=ארוכה), לא שדה עצמאי.
 */

type KitStage = 'not_sent' | 'awaiting_confirmation' | 'testing' | 'ended' | 'returned';

type KitJob = {
  id: string;
  kitType: 'SHORT' | 'LONG';
  detectorNumber: string | null;
  kitSentAt: string | null;
  kitSentVia: string | null;
  kitInstructionsSentAt: string | null;
  installConfirmedAt: string | null;
  installConfirmedVia: string | null;
  installConfirmedNote: string | null;
  installedOn: string | null;
  expectedEndAt: string | null;
  collectedAt: string | null;
};

type KitJobSummary = {
  taskId: string | null;
  sku: string;
  stage: KitStage;
  testDurationDays: number;
  daysLeft: number | null;
  daysElapsed: number | null;
  job: KitJob | null;
  messages: {
    instructions: { text: string; sentAt: string | null };
    return: { text: string; scheduledFor: string | null };
  };
};

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

/** ערך ל-input[type=date]. */
function toDateInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function todayLocalDate(): string {
  return toDateInput(new Date().toISOString());
}

/** גוף ריק מ-Nest (200 + null) מפיל את res.json(). */
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

export function RadonKitCustomerSection({
  customerId,
  currentUser,
}: {
  customerId?: string | null;
  currentUser?: ApiAuthUser | null;
}) {
  const [jobs, setJobs] = useState<KitJobSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [addOpen, setAddOpen] = useState(false);

  const authRef = useRef(currentUser);
  authRef.current = currentUser;

  const load = useCallback(async () => {
    if (!customerId) {
      setJobs([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch(apiUrl(`/radon/kit/customer/${customerId}`), {
        authUser: authRef.current,
      });
      if (!res.ok) throw new Error();
      const data = await readJson(res);
      setJobs(Array.isArray(data) ? data : []);
      setError('');
    } catch {
      setError('טעינת מעקב הגלאים נכשלה');
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const addButton = (
    <button
      type="button"
      disabled={!customerId}
      onClick={() => setAddOpen(true)}
      className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-slate-900 disabled:opacity-50"
    >
      <Plus className="h-3.5 w-3.5" />
      גלאי חדש
    </button>
  );

  return (
    <div dir="rtl">
      <div className="mb-3 flex justify-end">{addButton}</div>

      {loading ? (
        <div className="flex items-center gap-1.5 p-4 text-[12px] font-semibold text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          טוען מעקב גלאים…
        </div>
      ) : error ? (
        <div className="rounded-lg bg-rose-50 p-3 text-[12px] font-semibold text-rose-700">{error}</div>
      ) : !jobs.length ? (
        <div className="p-4 text-center text-[12px] text-slate-400">
          אין ערכות ראדון (61/10000) ללקוח זה. ערכה תופיע כאן ברגע שהיא נפתחת דרך משימה, או שאפשר
          להוסיף אחת ידנית למעלה.
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((j) => (
            <KitJobCard key={j.job?.id ?? j.taskId} summary={j} authUser={currentUser} onChange={load} />
          ))}
        </div>
      )}

      {addOpen && customerId && (
        <AddKitOverlay
          customerId={customerId}
          authUser={currentUser}
          onClose={() => setAddOpen(false)}
          onCreated={() => {
            setAddOpen(false);
            void load();
          }}
        />
      )}
    </div>
  );
}

function AddKitOverlay({
  customerId,
  authUser,
  onClose,
  onCreated,
}: {
  customerId: string;
  authUser?: ApiAuthUser | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [sku, setSku] = useState<'SHORT' | 'LONG'>('SHORT');
  const [detectorNumber, setDetectorNumber] = useState('');
  const [kitSentAt, setKitSentAt] = useState(todayLocalDate());
  const [installedOn, setInstalledOn] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(apiUrl('/radon/kit/customer'), {
        method: 'POST',
        authUser,
        body: JSON.stringify({
          customerId,
          sku: sku === 'SHORT' ? '61' : '10000',
          detectorNumber: detectorNumber.trim() || null,
          kitSentAt: kitSentAt || null,
          installedOn: installedOn || null,
        }),
      });
      const data = await readJson(res);
      if (!res.ok) {
        setError(data?.message ?? 'ההוספה נכשלה');
        return;
      }
      onCreated();
    } catch {
      setError('שגיאת רשת — נסו שוב');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Overlay title="גלאי חדש" onClose={onClose}>
      <div className="space-y-3">
        <label className="block text-[11px] font-bold text-slate-600">
          סוג הערכה
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              onClick={() => setSku('SHORT')}
              className={`flex-1 rounded-lg border px-3 py-1.5 text-[12px] font-bold transition ${
                sku === 'SHORT' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}
            >
              קצרת טווח
            </button>
            <button
              type="button"
              onClick={() => setSku('LONG')}
              className={`flex-1 rounded-lg border px-3 py-1.5 text-[12px] font-bold transition ${
                sku === 'LONG' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}
            >
              ארוכת טווח
            </button>
          </div>
        </label>

        <label className="block text-[11px] font-bold text-slate-600">
          מספר גלאי
          <input
            type="text"
            value={detectorNumber}
            onChange={(e) => setDetectorNumber(e.target.value)}
            placeholder="לא חובה"
            className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-[12px]"
          />
        </label>

        <label className="block text-[11px] font-bold text-slate-600">
          תאריך מסירה
          <input
            type="date"
            value={kitSentAt}
            max={todayLocalDate()}
            onChange={(e) => setKitSentAt(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-[12px]"
          />
        </label>

        <label className="block text-[11px] font-bold text-slate-600">
          תאריך התקנה (אם כבר ידוע — מתחיל מיד את ספירת 90 הימים)
          <input
            type="date"
            value={installedOn}
            max={todayLocalDate()}
            onChange={(e) => setInstalledOn(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-[12px]"
          />
        </label>

        {error && <p className="rounded bg-rose-50 p-1.5 text-[11px] font-semibold text-rose-700">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            disabled={busy}
            onClick={save}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-[12px] font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            שמור
          </button>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-2 text-[12px] font-bold text-slate-600 transition hover:bg-slate-50">
            ביטול
          </button>
        </div>
      </div>
    </Overlay>
  );
}

function KitJobCard({
  summary,
  authUser,
  onChange,
}: {
  summary: KitJobSummary;
  authUser?: ApiAuthUser | null;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMessage, setShowMessage] = useState<'instructions' | 'return' | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [manualDate, setManualDate] = useState(todayLocalDate());
  const [detectorNumber, setDetectorNumber] = useState(summary.job?.detectorNumber ?? '');
  const [deliveryDate, setDeliveryDate] = useState(toDateInput(summary.job?.kitSentAt ?? null));

  useEffect(() => {
    setDetectorNumber(summary.job?.detectorNumber ?? '');
    setDeliveryDate(toDateInput(summary.job?.kitSentAt ?? null));
  }, [summary.job?.id, summary.job?.detectorNumber, summary.job?.kitSentAt]);

  const post = async (path: string, body: any) => {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(apiUrl(path), {
        method: 'POST',
        authUser,
        body: JSON.stringify(body),
      });
      const data = await readJson(res);
      if (!res.ok) {
        setError(data?.message ?? 'הפעולה נכשלה');
        return false;
      }
      return true;
    } catch {
      setError('שגיאת רשת — נסו שוב');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const markSent = async () => {
    if (!summary.taskId) return;
    const ok = await post('/radon/kit/sent', { taskId: summary.taskId, sku: summary.sku });
    if (ok) {
      setSendOpen(false);
      onChange();
    }
  };

  const confirmManually = async () => {
    if (!summary.taskId) return;
    const ok = await post('/radon/kit/confirm', { taskId: summary.taskId, installedOn: manualDate });
    if (ok) {
      setConfirmOpen(false);
      onChange();
    }
  };

  const markReturned = async () => {
    if (!summary.taskId) return;
    if (await post('/radon/kit/returned', { taskId: summary.taskId, sku: summary.sku })) onChange();
  };

  /** מספר גלאי — נשמר ב-blur, לא בכל הקשה. */
  const saveDetectorNumber = async () => {
    if (!summary.job || detectorNumber === (summary.job.detectorNumber ?? '')) return;
    if (await post('/radon/kit/details', { radonJobId: summary.job.id, detectorNumber })) onChange();
  };

  /** תאריך מסירה — נשמר בשינוי, לא רק ב-blur (input[type=date] לא מפיק blur עקבי בכל דפדפן). */
  const saveDeliveryDate = async (value: string) => {
    setDeliveryDate(value);
    if (!summary.job) return;
    if (value === toDateInput(summary.job.kitSentAt)) return;
    if (await post('/radon/kit/details', { radonJobId: summary.job.id, kitSentAt: value || null })) onChange();
  };

  const deleteThisJob = async () => {
    if (!summary.job) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await apiFetch(apiUrl(`/radon/kit/${summary.job.id}`), { method: 'DELETE', authUser });
      if (!res.ok) {
        const data = await readJson(res);
        setError(data?.message ?? 'המחיקה נכשלה');
        return;
      }
      setDeleteOpen(false);
      onChange();
    } catch {
      setError('שגיאת רשת — נסו שוב');
    } finally {
      setDeleting(false);
    }
  };

  const stage = summary.stage;
  const currentIdx = STEP_INDEX[stage];
  const overdue = stage === 'ended';
  const totalDays = summary.testDurationDays;
  const daysLeft = summary.daysLeft;
  const kitTypeLabel = summary.job?.kitType === 'SHORT' ? 'קצרת טווח' : 'ארוכת טווח';

  return (
    <>
      <div
        className={`rounded-xl border p-3 ${
          overdue ? 'border-rose-300 bg-rose-50' : stage === 'testing' ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200 bg-white'
        }`}
      >
        {/* כותרת: סוג + שדות עריכה */}
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[12px] font-bold text-slate-700">
            <PackageCheck className={`h-4 w-4 ${overdue ? 'text-rose-600' : 'text-emerald-700'}`} />
            ערכת ראדון — {kitTypeLabel}
          </span>

          <button
            type="button"
            title="מחיקת רשומה"
            onClick={() => setDeleteOpen(true)}
            className="mr-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>

          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
            תאריך מסירה
            <input
              type="date"
              value={deliveryDate}
              max={todayLocalDate()}
              disabled={busy}
              onChange={(e) => void saveDeliveryDate(e.target.value)}
              className="rounded-lg border border-slate-300 px-2 py-1 text-[12px] font-normal text-slate-700"
            />
          </label>

          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
            מספר גלאי
            <input
              type="text"
              value={detectorNumber}
              disabled={busy}
              placeholder="—"
              onChange={(e) => setDetectorNumber(e.target.value)}
              onBlur={saveDetectorNumber}
              className="w-28 rounded-lg border border-slate-300 px-2 py-1 text-[12px] font-normal text-slate-700"
            />
          </label>
        </div>

        {/* ציר התקדמות */}
        <ol className="mb-3 flex flex-wrap gap-x-4 gap-y-1">
          {STEPS.map((step, idx) => {
            const done = idx < currentIdx || stage === 'returned';
            const active = idx === currentIdx;
            return (
              <li key={step.stage} className="flex items-center gap-1.5">
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] font-bold ${
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
                  className={`text-[11px] leading-tight ${
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

        {summary.job?.kitSentVia === 'auto' && (
          <div className="mb-2 flex items-start gap-1 rounded border border-sky-200 bg-sky-50 p-1.5 text-[10.5px] font-semibold leading-snug text-sky-800">
            <Info className="mt-px h-3 w-3 shrink-0" />
            <span>נשלחה אוטומטית — עברו 48 שעות בשלב ביצוע ואיש לא סימן שהערכה יצאה.</span>
          </div>
        )}

        {/* גוף לפי שלב */}
        {stage === 'not_sent' && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
            <p className="text-[11px] leading-snug text-slate-500">
              עדיין לא נשלחה הודעת הוראות ללקוח. שליחה תתבצע דרך משימה {summary.taskId ? '' : '(אין משימה מקושרת)'}.
            </p>
            <button
              type="button"
              disabled={busy || !summary.taskId}
              onClick={() => setSendOpen(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
              הערכה נשלחה ללקוח
            </button>
          </div>
        )}

        {stage === 'awaiting_confirmation' && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2">
            <div className="text-[11px] leading-snug text-amber-800">
              <div className="flex items-center gap-1.5 font-bold">
                <Clock className="h-3 w-3 shrink-0" />
                ממתינים לאישור הלקוח
              </div>
              <p className="mt-0.5 text-amber-700">
                ההודעה נשלחה ב-{formatDate(summary.job?.kitInstructionsSentAt ?? null)}.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              className="shrink-0 rounded-md border border-amber-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-amber-800 transition hover:bg-amber-100"
            >
              הלקוח מסר תאריך בטלפון — הזן ידנית
            </button>
          </div>
        )}

        {(stage === 'testing' || stage === 'ended') && (
          <div className={`flex flex-wrap items-center gap-4 rounded-lg border p-2 ${overdue ? 'border-rose-300 bg-white' : 'border-emerald-200 bg-white'}`}>
            <div className="text-center">
              <div className={`text-xl font-black leading-none ${overdue ? 'text-rose-600' : 'text-emerald-600'}`}>
                {daysLeft == null ? '—' : Math.abs(daysLeft)}
              </div>
              <div className={`mt-0.5 text-[10px] font-bold ${overdue ? 'text-rose-700' : 'text-emerald-700'}`}>
                {daysLeft == null ? 'ימים' : overdue ? 'ימים מאז הסיום' : `ימים נותרו מ-${totalDays}`}
              </div>
            </div>
            <dl className="flex-1 space-y-0.5 text-[11px] text-slate-600">
              <div className="flex gap-1.5">
                <dt className="font-semibold">הותקן:</dt>
                <dd>{formatDate(summary.job?.installedOn ?? null)}</dd>
                <dt className="mr-3 font-semibold">סיום:</dt>
                <dd>{formatDate(summary.job?.expectedEndAt ?? null)}</dd>
              </div>
              {summary.job?.installConfirmedVia && (
                <div className="flex gap-1.5">
                  <dt className="font-semibold">אושר:</dt>
                  <dd>{summary.job.installConfirmedVia === 'whatsapp' ? 'ע״י הלקוח בוואטסאפ' : 'ידנית'}</dd>
                </div>
              )}
            </dl>
            {overdue && (
              <button
                type="button"
                disabled={busy}
                onClick={markReturned}
                className="flex shrink-0 items-center gap-1 rounded-md bg-slate-700 px-2.5 py-1.5 text-[11px] font-bold text-white transition hover:bg-slate-800 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                הגלאים חזרו למשרד
              </button>
            )}
          </div>
        )}

        {stage === 'returned' && (
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white p-2 text-[11px] font-bold text-slate-700">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
            הגלאים חזרו למשרד ב-{formatDate(summary.job?.collectedAt ?? null)}
          </div>
        )}

        {/* הודעות */}
        <div className="mt-2 flex flex-wrap gap-2 border-t border-slate-200 pt-2">
          <MessageButton
            label="הודעת הוראות"
            hint={summary.messages.instructions.sentAt ? `נשלחה ${formatDate(summary.messages.instructions.sentAt)}` : 'טרם נשלחה'}
            onClick={() => setShowMessage('instructions')}
          />
          <MessageButton
            label="הודעת החזרה"
            hint={summary.messages.return.scheduledFor ? `תישלח ${formatDate(summary.messages.return.scheduledFor)}` : 'תיקבע לפי תאריך התקנה'}
            onClick={() => setShowMessage('return')}
          />
        </div>

        {error && <p className="mt-1.5 rounded bg-rose-50 p-1.5 text-[11px] font-semibold text-rose-700">{error}</p>}
      </div>

      {showMessage && (
        <Overlay
          title={showMessage === 'instructions' ? 'הודעת הוראות — נשלחת עם הערכה' : 'הודעת החזרה — נשלחת בתום הבדיקה'}
          onClose={() => setShowMessage(null)}
        >
          <pre
            dir="rtl"
            className="max-h-[55vh] overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 text-[12.5px] leading-relaxed text-slate-800"
            style={{ fontFamily: 'inherit' }}
          >
            {showMessage === 'instructions' ? summary.messages.instructions.text : summary.messages.return.text}
          </pre>
        </Overlay>
      )}

      {sendOpen && (
        <Overlay title="שליחת הערכה ללקוח" onClose={() => setSendOpen(false)}>
          <p className="mb-2 text-[12px] leading-relaxed text-slate-600">
            הודעת הוראות תישלח עכשיו בוואטסאפ ללקוח, ונמתין שהוא יאשר מתי הציב את הגלאים.
          </p>
          {error && <p className="mb-2 rounded bg-rose-50 p-1.5 text-[11px] font-semibold text-rose-700">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={markSent}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-[12px] font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              שלח ללקוח וסמן כנשלחה
            </button>
            <button type="button" onClick={() => setSendOpen(false)} className="rounded-lg border border-slate-300 px-3 py-2 text-[12px] font-bold text-slate-600 transition hover:bg-slate-50">
              ביטול
            </button>
          </div>
        </Overlay>
      )}

      {confirmOpen && (
        <Overlay title="רישום תאריך התקנה" onClose={() => setConfirmOpen(false)}>
          <p className="mb-2 text-[12px] leading-relaxed text-slate-600">
            השתמשו בזה רק אם הלקוח מסר את תאריך ההתקנה מחוץ לוואטסאפ.
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
          {error && <p className="mt-2 rounded bg-rose-50 p-1.5 text-[11px] font-semibold text-rose-700">{error}</p>}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={busy || !manualDate}
              onClick={confirmManually}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-[12px] font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarClock className="h-3.5 w-3.5" />}
              התחל ספירה
            </button>
            <button type="button" onClick={() => setConfirmOpen(false)} className="rounded-lg border border-slate-300 px-3 py-2 text-[12px] font-bold text-slate-600 transition hover:bg-slate-50">
              ביטול
            </button>
          </div>
        </Overlay>
      )}

      {deleteOpen && (
        <Overlay title="מחיקת רשומת מעקב" onClose={() => setDeleteOpen(false)}>
          <p className="mb-3 text-[12px] leading-relaxed text-slate-600">
            הרשומה, ההודעות שנוסחו, ותזכורת ההחזרה (אם נדרכה) יימחקו. לא ניתן לבטל. הפעולה הזו לא
            מוחקת את המשימה עצמה, רק את מעקב הגלאי שלה.
          </p>
          {error && <p className="mb-2 rounded bg-rose-50 p-1.5 text-[11px] font-semibold text-rose-700">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={deleting}
              onClick={deleteThisJob}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-[12px] font-bold text-white transition hover:bg-rose-700 disabled:opacity-50"
            >
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              מחק לצמיתות
            </button>
            <button type="button" onClick={() => setDeleteOpen(false)} className="rounded-lg border border-slate-300 px-3 py-2 text-[12px] font-bold text-slate-600 transition hover:bg-slate-50">
              ביטול
            </button>
          </div>
        </Overlay>
      )}
    </>
  );
}

function MessageButton({ label, hint, onClick }: { label: string; hint: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1 text-right transition hover:border-slate-300 hover:bg-slate-50"
    >
      <MessageSquareText className="h-3 w-3 shrink-0 text-slate-500" />
      <span className="min-w-0">
        <span className="block text-[10.5px] font-bold text-slate-700">{label}</span>
        <span className="block text-[9.5px] text-slate-400">{hint}</span>
      </span>
      <ChevronLeft className="h-3 w-3 shrink-0 text-slate-400" />
    </button>
  );
}

function Overlay({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[10050] isolate flex items-center justify-center p-4" style={{ direction: 'rtl' }}>
      <button
        type="button"
        aria-label="סגירת החלון"
        tabIndex={-1}
        className="absolute inset-0 border-0 bg-black/40"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-[13px] font-bold text-slate-800">{title}</h3>
          <button type="button" aria-label="סגירת החלון" onClick={onClose} className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
