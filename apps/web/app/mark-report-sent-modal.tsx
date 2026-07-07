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
  onDone: (info: { paymentStatus: 'paid' | 'unpaid' | null }) => void;
}) {
  // שאלת תשלום — לא חובה, רק בקרה. אפשר לסיים גם בלי שנבחר.
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'unpaid' | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setPaymentStatus(null);
      setSaving(false);
    }
  }, [open]);

  if (!open) return null;

  const finish = () => {
    setSaving(true);
    onDone({ paymentStatus });
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
