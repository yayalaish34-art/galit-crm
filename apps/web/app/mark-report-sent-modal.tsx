'use client';

import React, { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';

/**
 * מודל קל ל"שלחתי כבר דוח" — לשלב הביצוע, כשהדוח כבר נשלח ללקוח בעבר (מחוץ למערכת).
 * לא שולח מייל: רק שואל את סטטוס התשלום (אופציונלי — לבקרה בלבד) ואז "סיים" →
 * המשימה מסומנת DONE ונפתח פופ-אפ "שליחת משוב" (דרך onDone).
 */
export function MarkReportSentModal({
  open,
  onClose,
  customerName,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  customerName?: string | null;
  onDone: (info: {
    paymentStatus: 'paid' | 'unpaid' | null;
    /** תזכורת לשליחת דוח חוזר: מספר ימים קדימה, או null אם לא נבחרה תזכורת. */
    reportReminderDays: number | null;
  }) => void;
}) {
  // שאלת תשלום — לא חובה, רק בקרה. אפשר לסיים גם בלי שנבחר.
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'unpaid' | null>(null);
  const [saving, setSaving] = useState(false);

  // תזכורת לשליחת דוח חוזר (זהה לטופס "שליחת דוח") — יוצרת משימת שליחת דוח עתידית שמוסתרת עד המועד.
  const [reminderChoice, setReminderChoice] = useState<7 | 30 | 60 | 90 | 'manual' | null>(null);
  const [reminderManualDate, setReminderManualDate] = useState('');

  useEffect(() => {
    if (open) {
      setPaymentStatus(null);
      setReminderChoice(null);
      setReminderManualDate('');
      setSaving(false);
    }
  }, [open]);

  if (!open) return null;

  const computeReminderDays = (): number | null => {
    if (reminderChoice === null) return null;
    if (reminderChoice !== 'manual') return reminderChoice;
    if (!reminderManualDate) return null;
    const target = new Date(`${reminderManualDate}T09:00:00`);
    if (isNaN(target.getTime())) return null;
    const days = Math.ceil((target.getTime() - Date.now()) / 86_400_000);
    return days >= 1 ? days : null;
  };

  const finish = () => {
    setSaving(true);
    onDone({ paymentStatus, reportReminderDays: computeReminderDays() });
  };

  return (
    <div
      className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/50 p-4"
      onClick={() => !saving && onClose()}
    >
      <div
        className="w-full max-w-md rounded-3xl border border-gray-200 bg-white p-7 shadow-2xl"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center gap-3 border-b border-gray-100 pb-4 text-2xl font-bold text-gray-800">
          <CheckCircle2 size={24} className="text-emerald-500" /> הדוח כבר נשלח
        </div>

        <p className="mb-4 text-sm text-slate-500">
          סימון שהדוח כבר נשלח ל{customerName ? <strong className="text-slate-700">{customerName}</strong> : 'לקוח'} — המשימה תיסגר,
          ובסיום תוכל להחליט אם לשלוח בקשת משוב.
        </p>

        {/* ── בדיקת תשלום (לא חובה — רק בקרה) ── */}
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3">
          <label className="mb-2 block text-sm font-semibold text-amber-900">
            האם התקבל תשלום מהלקוח? <span className="font-normal text-amber-600">(לא חובה — רק לבקרה)</span>
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPaymentStatus((p) => (p === 'paid' ? null : 'paid'))}
              className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-bold transition-colors ${
                paymentStatus === 'paid'
                  ? 'border-emerald-500 bg-emerald-500 text-white'
                  : 'border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50'
              }`}
            >
              ✅ שולם
            </button>
            <button
              type="button"
              onClick={() => setPaymentStatus((p) => (p === 'unpaid' ? null : 'unpaid'))}
              className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-bold transition-colors ${
                paymentStatus === 'unpaid'
                  ? 'border-red-500 bg-red-500 text-white'
                  : 'border-red-200 bg-white text-red-700 hover:bg-red-50'
              }`}
            >
              ⏳ טרם שולם
            </button>
          </div>
          {paymentStatus === 'unpaid' && (
            <div className="mt-2 text-[12px] font-medium text-red-700">
              שים לב: הלקוח עדיין לא שילם — ניתן לסיים בכל זאת (יישמר למעקב גבייה).
            </div>
          )}
        </div>

        {/* ── תזכורת לשליחת דוח חוזר ── */}
        <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50/50 px-4 py-3">
          <label className="mb-1 block text-sm font-semibold text-indigo-900">
            🔁 לקבוע תזכורת לשליחת דוח חוזר?{' '}
            <span className="font-normal text-indigo-500">(לא חובה)</span>
          </label>
          <div className="mb-2 text-[12px] leading-relaxed text-indigo-700/80">
            המשימה תיסגר עכשיו, ותקפוץ שוב אוטומטית במועד שתבחר — עד אז היא מוסתרת מהרשימה.
          </div>
          <div className="flex flex-wrap gap-2">
            {([
              { v: 7, label: 'שבוע' },
              { v: 30, label: '30 יום' },
              { v: 60, label: '60 יום' },
              { v: 90, label: '90 יום' },
              { v: 'manual', label: 'ידני' },
            ] as { v: 7 | 30 | 60 | 90 | 'manual'; label: string }[]).map((o) => (
              <button
                key={String(o.v)}
                type="button"
                onClick={() => setReminderChoice((p) => (p === o.v ? null : o.v))}
                className={`rounded-xl border px-4 py-2 text-sm font-bold transition-colors ${
                  reminderChoice === o.v
                    ? 'border-indigo-600 bg-indigo-600 text-white'
                    : 'border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-100'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          {reminderChoice === 'manual' && (
            <div className="mt-2.5 flex items-center gap-2">
              <label className="shrink-0 text-sm font-medium text-indigo-900">תאריך התזכורת:</label>
              <input
                type="date"
                value={reminderManualDate}
                onChange={(e) => setReminderManualDate(e.target.value)}
                className="rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />
            </div>
          )}
          {reminderChoice !== null && computeReminderDays() !== null && (
            <div className="mt-2 text-[12px] font-medium text-indigo-700">
              ✓ תיווצר משימת שליחת דוח חדשה בעוד {computeReminderDays()} ימים.
            </div>
          )}
          {reminderChoice === 'manual' && reminderManualDate && computeReminderDays() === null && (
            <div className="mt-2 text-[12px] font-medium text-red-600">
              יש לבחור תאריך עתידי לתזכורת.
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center justify-end gap-3 border-t border-gray-100 pt-5">
          <button
            type="button"
            disabled={saving}
            className="rounded-xl border border-gray-300 bg-white px-6 py-3 text-base font-medium hover:bg-gray-50 disabled:opacity-50"
            onClick={onClose}
          >
            ביטול
          </button>
          <button
            type="button"
            disabled={saving}
            className="rounded-xl bg-emerald-500 px-10 py-3 text-base font-bold text-white hover:bg-emerald-600 disabled:opacity-50"
            onClick={finish}
          >
            {saving ? 'מסיים…' : '✔ סיים'}
          </button>
        </div>
      </div>
    </div>
  );
}
