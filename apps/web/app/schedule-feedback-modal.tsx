'use client';

import React, { useState } from 'react';
import { MessageCircle, Clock, Loader2, X, CheckCircle2 } from 'lucide-react';
import { apiFetch, apiUrl } from './lib/api-base';
import { whatsAppLink, toWhatsAppPhone } from './lib/whatsapp';

/**
 * פופ-אפ "שליחת משוב" שנפתח בסוף הזרימה — אחרי ששולחים את הדוח ללקוח.
 * מאפשר לתזמן שליחה אוטומטית של בקשת משוב בעוד 5 דק' / 30 דק' / שעה / 4 שעות,
 * או לבחור "ידני" (אשלח בעצמי מאוחר יותר מסקשן "משוב").
 */
const DELAY_OPTIONS: { label: string; minutes: number }[] = [
  { label: 'בעוד 5 דקות', minutes: 5 },
  { label: 'בעוד 30 דקות', minutes: 30 },
  { label: 'בעוד שעה', minutes: 60 },
  { label: 'בעוד 4 שעות', minutes: 240 },
];

export function ScheduleFeedbackModal({
  open,
  onClose,
  customerId,
  customerName,
  customerEmail,
  customerPhone,
  currentUser,
}: {
  open: boolean;
  onClose: () => void;
  customerId: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  currentUser: { id?: string; name?: string } & Record<string, unknown>;
}) {
  const [busy, setBusy] = useState<number | 'manual' | null>(null);
  const [err, setErr] = useState('');
  const [doneMsg, setDoneMsg] = useState('');

  if (!open) return null;

  const hasEmail = !!(customerEmail && customerEmail.includes('@'));
  const whatsappPhone = toWhatsAppPhone(customerPhone || '');

  const sendWhatsApp = async () => {
    let reviewUrl = 'https://www.google.com/search?hl=he-IL&gl=il&q=%D7%92%D7%9C%D7%99%D7%AA+-+%D7%94%D7%97%D7%91%D7%A8%D7%94+%D7%9C%D7%90%D7%99%D7%9B%D7%95%D7%AA+%D7%94%D7%A1%D7%91%D7%99%D7%91%D7%94,+%D7%90%D7%95%D7%A1%D7%98%D7%A8%D7%95%D7%91%D7%A1%D7%A7%D7%99+11,+%D7%A8%D7%A2%D7%A0%D7%A0%D7%94&ludocid=6353540875700534600&lsig=AB86z5XBBuvKEizwumoxn7pKhEyY#lrd=0x151d381236a2b835:0x582c4fc3920dfd48,3';
    try {
      const r = await apiFetch(apiUrl(`/feedback/draft?name=${encodeURIComponent(customerName || '')}`), {
        authUser: currentUser as never,
      });
      if (r.ok) {
        const data = await r.json();
        if (data?.reviewUrl) reviewUrl = data.reviewUrl;
      }
    } catch {
      /* נופל לקישור ברירת המחדל */
    }
    const first = (customerName || '').trim().split(/\s+/)[0] || 'לקוח/ה יקר/ה';
    const text = `שלום ${first},\nתודה שבחרת ב"גלית – החברה לאיכות הסביבה". נשמח מאוד אם תוכל/י להקדיש רגע ולדרג אותנו בגוגל — זה עוזר לנו מאוד:\n${reviewUrl}`;
    window.open(whatsAppLink(whatsappPhone, text), '_blank');
    onClose();
  };

  const schedule = async (minutes: number) => {
    if (!customerId) {
      setErr('לא ניתן לתזמן — אין לקוח משויך לפנייה');
      return;
    }
    if (!hasEmail) {
      setErr('ללקוח אין כתובת מייל תקינה — עדכן את פרטי הלקוח ושלח ידנית');
      return;
    }
    setBusy(minutes);
    setErr('');
    try {
      const r = await apiFetch(apiUrl('/feedback/schedule'), {
        method: 'POST',
        authUser: currentUser as never,
        body: JSON.stringify({ customerId, delayMinutes: minutes, channel: 'email' }),
      });
      if (r.ok) {
        const opt = DELAY_OPTIONS.find((o) => o.minutes === minutes);
        setDoneMsg(`בקשת המשוב תישלח אוטומטית ${opt?.label || `בעוד ${minutes} דקות`} ✓`);
        setTimeout(() => onClose(), 1400);
      } else {
        let msg = 'תזמון המשוב נכשל';
        try {
          const e = await r.json();
          if (e?.message) msg = Array.isArray(e.message) ? e.message.join(', ') : e.message;
        } catch {
          /* ignore */
        }
        setErr(msg);
      }
    } catch {
      setErr('תזמון המשוב נכשל');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[9100] flex items-center justify-center bg-black/50 p-4" onClick={() => busy === null && onClose()}>
      <div
        className="w-full max-w-md rounded-3xl border border-gray-200 bg-white p-7 shadow-2xl"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center gap-3 text-xl font-bold text-gray-800">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50">
            <MessageCircle className="h-5 w-5 text-emerald-600" />
          </span>
          שליחת בקשת משוב
        </div>
        <div className="mb-5 text-sm text-slate-500">
          הדוח נשלח{customerName ? ` ל${customerName}` : ''}. מתי לשלוח בקשת משוב (דירוג בגוגל)?
        </div>

        {doneMsg ? (
          <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-4 text-sm font-bold text-emerald-700">
            <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
            {doneMsg}
          </div>
        ) : (
          <>
            {!hasEmail && (
              <div className="mb-3 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 text-[13px] font-medium text-amber-800">
                ללקוח אין כתובת מייל — לתזמון אוטומטי עדכן את המייל. אפשר לבחור "ידני".
              </div>
            )}
            <div className="grid grid-cols-2 gap-2.5">
              {DELAY_OPTIONS.map((opt) => (
                <button
                  key={opt.minutes}
                  type="button"
                  disabled={busy !== null || !hasEmail}
                  onClick={() => void schedule(opt.minutes)}
                  className="flex items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-white px-3 py-3.5 text-sm font-bold text-emerald-800 transition-all hover:bg-emerald-50 hover:border-emerald-400 disabled:opacity-40"
                >
                  {busy === opt.minutes ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4 text-emerald-500" />}
                  {opt.label}
                </button>
              ))}
            </div>

            {err && <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{err}</div>}

            <div className="mt-5 flex items-center justify-between gap-3 border-t border-gray-100 pt-4">
              <button
                type="button"
                disabled={busy !== null}
                onClick={onClose}
                className="flex items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-gray-50 disabled:opacity-50"
              >
                <X className="h-4 w-4" /> ללא משוב
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void sendWhatsApp()}
                className="flex items-center gap-1.5 rounded-xl bg-[#25D366] px-5 py-2.5 text-sm font-bold text-white hover:brightness-95 disabled:opacity-50"
              >
                <MessageCircle className="h-4 w-4" /> שלח בוואטסאפ
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
