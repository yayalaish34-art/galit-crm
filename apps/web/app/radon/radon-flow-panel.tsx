'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardList, Loader2, Package, X } from 'lucide-react';
import { apiFetch, apiUrl, type ApiAuthUser } from '../lib/api-base';
import {
  DETECTOR_STATUS_LABELS,
  RADON_QUESTIONS,
  type RadonAnswers,
  type RadonJob,
  detectorStatusTone,
} from '../lib/radon-tracks';

/**
 * זרימת הראדון — נפתחת כשנבחר אחד מקודי בדיקות הראדון.
 *
 * הפאנל עצמאי: הוא לא נוגע בצינור המשימות ולא מניח דבר על מצב הדשבורד.
 * המסלול נקבע בשרת — הממשק רק שולח תשובות ומציג את התוצאה.
 */

/**
 * קורא גוף תשובה כ-JSON בלי להתרסק על גוף ריק.
 *
 * למה זה נחוץ: כשמתודה ב-Nest מחזירה null (למשל getByTask למשימה שאין לה עדיין
 * עבודת ראדון), התשובה היא 200 עם גוף *ריק לחלוטין*. `res.json()` על גוף ריק
 * זורק "Unexpected end of JSON input", ולכן הפתיחה הראשונה של הזרימה בכל משימה
 * נכשלה עוד לפני שהספיקה ליצור את העבודה. גם תשובת שגיאה שמגיעה כ-HTML או ריקה
 * (502/504 מה-proxy) נופלת לאותה מלכודת.
 *
 * מחזיר null כשאין גוף או כשהוא אינו JSON תקין — הקורא מחליט מה זה אומר.
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
export function RadonFlowPanel({
  taskId,
  sku,
  customerId,
  authUser,
  onClose,
}: {
  taskId: string;
  sku: string;
  customerId?: string | null;
  authUser?: ApiAuthUser | null;
  onClose: () => void;
}) {
  const [job, setJob] = useState<RadonJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** טוען עבודה קיימת למשימה, ואם אין — פותח חדשה. */
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(apiUrl(`/radon/jobs/by-task/${taskId}`), { authUser });
      // `getByTask` מחזיר null כשאין עדיין עבודה למשימה, ו-Nest משדר null כגוף
      // תשובה *ריק* עם 200. קריאת res.json() על גוף ריק זורקת
      // "Unexpected end of JSON input" — כלומר הפתיחה הראשונה של הזרימה לכל
      // משימה נכשלה עוד לפני שהספיקה ליצור את העבודה. readJson מטפל בזה.
      let data = res.ok ? await readJson(res) : null;

      if (!data) {
        const created = await apiFetch(apiUrl('/radon/jobs'), {
          method: 'POST',
          authUser,
          body: JSON.stringify({ sku, taskId, customerId: customerId ?? null }),
        });
        const createdBody = await readJson(created);
        if (!created.ok) throw new Error(createdBody?.message ?? 'שגיאה בפתיחת עבודת ראדון');
        data = createdBody;
      }
      setJob(data);
    } catch (e: any) {
      setError(e?.message ?? 'שגיאה בטעינת זרימת הראדון');
    } finally {
      setLoading(false);
    }
  }, [taskId, sku, customerId, authUser]);

  useEffect(() => { void load(); }, [load]);

  /** שולח תשובה בודדת; המסלול מחושב מחדש בשרת ומוחזר. */
  const answer = async (patch: RadonAnswers) => {
    if (!job) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(apiUrl(`/radon/jobs/${job.id}/answers`), {
        method: 'PATCH',
        authUser,
        body: JSON.stringify({ answers: patch }),
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error(data?.message ?? 'שגיאה בשמירת התשובה');
      if (data) setJob(data);
    } catch (e: any) {
      setError(e?.message ?? 'שגיאה בשמירת התשובה');
    } finally {
      setSaving(false);
    }
  };

  const answers = job?.answers ?? {};

  return (
    <div className="fixed inset-0 z-[10050] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm" dir="rtl">
      <div className="my-8 w-full max-w-3xl rounded-2xl bg-white shadow-2xl">
        {/* ── כותרת ── */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-violet-100 text-violet-700">
              <ClipboardList className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-[15px] font-bold text-slate-800">זרימת בדיקת ראדון</h2>
              <p className="text-[11.5px] text-slate-500">
                {job?.trackName ?? 'השלימו את השאלון כדי לקבוע את המסלול'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="סגור"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">טוען…</span>
          </div>
        ) : (
          <div className="space-y-5 px-5 py-5">
            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-[12.5px] text-rose-700">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* ── המסלול שנקבע ── */}
            {job?.track && (
              <div className="rounded-xl border border-violet-200 bg-violet-50/70 p-4">
                <div className="flex items-center gap-1.5 text-[13px] font-bold text-violet-800">
                  <CheckCircle2 className="h-4 w-4" />
                  {job.trackName}
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-violet-700">{job.trackSummary}</p>

                {/* ציר השלבים של המסלול */}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {job.stages.map((stage, i) => (
                    <span
                      key={stage}
                      className={`rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${
                        i < job.stageIndex
                          ? 'border-violet-300 bg-violet-200/70 text-violet-800'
                          : i === job.stageIndex
                            ? 'border-violet-500 bg-violet-600 text-white'
                            : 'border-slate-200 bg-white text-slate-400'
                      }`}
                    >
                      {stage}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* ── אזהרות התאמה ── */}
            {!!job?.trackWarnings?.length && (
              <div className="space-y-1.5 rounded-xl border border-amber-200 bg-amber-50 p-3">
                {job.trackWarnings.map((w) => (
                  <div key={w} className="flex items-start gap-2 text-[12px] text-amber-800">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}

            {/* ── שאלון הפתיחה ── */}
            <div className="space-y-4">
              <h3 className="text-[13px] font-bold text-slate-700">שאלון פתיחה</h3>
              {RADON_QUESTIONS.map((q, idx) => (
                <div key={q.key}>
                  <div className="mb-1.5 text-[12.5px] font-semibold text-slate-600">
                    {idx + 1}. {q.title}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {q.options.map((opt) => {
                      const active = (answers as any)[q.key] === opt.value;
                      return (
                        <button
                          key={opt.value}
                          disabled={saving}
                          onClick={() => answer({ [q.key]: opt.value } as RadonAnswers)}
                          className={`rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition disabled:opacity-50 ${
                            active
                              ? 'border-violet-500 bg-violet-600 text-white'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:bg-violet-50'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* שאלות 6-8: שדות חופשיים */}
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="6. כמה גלאים נדרשים?"
                  type="number"
                  value={answers.detectorCount ?? ''}
                  onCommit={(v) => answer({ detectorCount: v ? Number(v) : null })}
                />
                <Field
                  label="7. כתובת הבדיקה"
                  value={answers.siteAddress ?? ''}
                  onCommit={(v) => answer({ siteAddress: v || null })}
                />
                <Field
                  label="8. איש קשר לתיאום"
                  value={answers.contactName ?? ''}
                  onCommit={(v) => answer({ contactName: v || null })}
                />
                <Field
                  label="טלפון איש קשר"
                  value={answers.contactPhone ?? ''}
                  onCommit={(v) => answer({ contactPhone: v || null })}
                />
              </div>
            </div>

            {/* תזכורת הלקוח הועברה לכפתור ייעודי בשלב הביצוע (ערכות בלבד).
                הפאנל הזה נפתח היום רק לבדיקות ראדון שאינן ערכה, ולכן אין לו
                מה להציג כאן. */}

            {/* ── גלאים משויכים ── */}
            {!!job?.detectors?.length && (
              <div>
                <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-bold text-slate-700">
                  <Package className="h-4 w-4" />
                  גלאים משויכים ({job.detectors.length})
                </h3>
                <div className="space-y-1.5">
                  {job.detectors.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="text-[12.5px] font-semibold text-slate-700">
                          {a.detector.serialNumber}
                          {a.detector.model && (
                            <span className="mr-1.5 text-[11px] font-normal text-slate-400">{a.detector.model}</span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {a.placementNote || <span className="text-amber-600">חסר תיעוד מיקום</span>}
                        </div>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${detectorStatusTone(a.detector.status)}`}>
                        {DETECTOR_STATUS_LABELS[a.detector.status] ?? a.detector.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── התראות פתוחות ── */}
            {!!job?.alerts?.length && (
              <div className="space-y-1.5">
                {job.alerts.map((a) => (
                  <div
                    key={a.id}
                    className={`flex items-start gap-2 rounded-lg border p-2.5 text-[12px] ${
                      a.severity === 'danger'
                        ? 'border-rose-200 bg-rose-50 text-rose-700'
                        : 'border-amber-200 bg-amber-50 text-amber-800'
                    }`}
                  >
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{a.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** שדה חופשי שנשמר ב-blur — כדי לא לשלוח בקשה על כל הקשה. */
function Field({
  label, value, type = 'text', onCommit,
}: {
  label: string;
  value: string | number;
  type?: string;
  onCommit: (v: string) => void;
}) {
  const [local, setLocal] = useState(String(value ?? ''));
  useEffect(() => { setLocal(String(value ?? '')); }, [value]);

  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-semibold text-slate-600">{label}</span>
      <input
        type={type}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => { if (local !== String(value ?? '')) onCommit(local); }}
        className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12.5px] text-slate-700 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
      />
    </label>
  );
}
