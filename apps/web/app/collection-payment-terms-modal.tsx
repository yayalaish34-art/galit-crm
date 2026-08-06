'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CalendarClock, FileText, Loader2, User } from 'lucide-react';
import { apiFetch, apiUrl } from './lib/api-base';

/**
 * דיאלוג ההנפקה — נפתח בלחיצה על כל אחד מארבעת סוגי המסמכים במסך הגבייה.
 *
 * שני דברים נבחרים כאן, ולכן אין יותר בוררים במסך הגבייה עצמו:
 *   1. **איש קשר** — למי המסמך מופנה (שם + מייל על המסמך בכספית, וברירת המחדל
 *      לשליחה במייל אחר כך).
 *   2. **תנאי תשלום** — מהם נגזר תאריך היעד. מוצג **בדיוק** התאריך שייכתב,
 *      כדי שאיש לא יאשר תאריך שלא ראה.
 *
 * מסמך ששולם במעמד ("חשבונית מס קבלה" / "קבלה") לא מציג תנאי תשלום — אין לו
 * אשראי ותאריך היעד שלו הוא תאריך המסמך. במקומם נבחר **אמצעי התשלום** שנרשם
 * על שורת הקבלה.
 */

type TermOption = { label: string; dueDate: string | null; explanation: string; recognized: boolean };
type Preview = { dueDate: string | null; explanation: string; recognized: boolean; netDays: number | null };
type Contact = {
  id: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  roleTitle?: string | null;
  isPrimary?: boolean;
};

/** אמצעי תשלום לשורת הקבלה — הערכים הם PaymentTypeId של כספית. */
const PAYMENT_METHODS: { id: number; label: string }[] = [
  { id: 1, label: 'מזומן' },
  { id: 2, label: 'צ׳ק' },
  { id: 3, label: 'אשראי' },
  { id: 9, label: 'העברה' },
  { id: 16, label: 'ביט/פייבוקס' },
  { id: 12, label: 'אחר' },
];

async function readJson(res: Response): Promise<any> {
  let text: string;
  try { text = await res.text(); } catch { return null; }
  if (!text.trim()) return null;
  try { return JSON.parse(text); } catch { return null; }
}

function fmtDate(ymd: string | null): string {
  if (!ymd) return '—';
  const [y, m, d] = ymd.split('-');
  return y && m && d ? `${d}/${m}/${y}` : ymd;
}

export function CollectionPaymentTermsModal({
  taskId,
  kindLabel,
  paid,
  currentUser,
  onCancel,
  onConfirm,
}: {
  taskId: string;
  kindLabel: string;
  /** מסמך ששולם במעמד — בלי תנאי תשלום, עם בחירת אמצעי תשלום במקום. */
  paid: boolean;
  currentUser: unknown;
  onCancel: () => void;
  onConfirm: (v: { paymentTerms: string | null; contactId: string | null; paymentTypeId?: number }) => void;
}) {
  const [options, setOptions] = useState<TermOption[]>([]);
  const [terms, setTerms] = useState<string>('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [quoteNumber, setQuoteNumber] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactId, setContactId] = useState<string | null>(null);
  const [paymentTypeId, setPaymentTypeId] = useState<number>(1); // מזומן
  const [loading, setLoading] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [err, setErr] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  // טעינה ראשונית: התנאים שעל ההצעה + האפשרויות + תצוגה מקדימה.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await apiFetch(apiUrl(`/caspit/task/${taskId}/payment-terms`), {
          authUser: currentUser as never,
        });
        const data = await readJson(res);
        if (!alive) return;
        if (!res.ok || !data) {
          setErr('לא ניתן לטעון את תנאי התשלום');
        } else {
          setOptions(Array.isArray(data.options) ? data.options : []);
          setTerms(data.quoteTerms ?? '');
          setPreview(data.preview ?? null);
          setQuoteNumber(data.quoteNumber ?? null);
          setContacts(Array.isArray(data.contacts) ? data.contacts : []);
          setContactId(data.selectedContactId ?? null);
        }
      } catch {
        if (alive) setErr('לא ניתן לטעון את תנאי התשלום');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [taskId, currentUser]);

  // תצוגה מקדימה מתעדכנת בשרת — אותו קוד שיחשב בפועל בהנפקה, בלי לשכפל
  // את הפרסור בדפדפן (שם הוא היה נסחף מהשרת בשקט).
  const refreshPreview = useCallback(async (value: string) => {
    setPreviewing(true);
    try {
      const res = await apiFetch(
        apiUrl(`/caspit/due-date?terms=${encodeURIComponent(value)}`),
        { authUser: currentUser as never },
      );
      const data = await readJson(res);
      if (res.ok && data) setPreview(data);
    } catch {
      /* התצוגה המקדימה היא נוחות בלבד — כישלון בה לא חוסם הנפקה */
    } finally {
      setPreviewing(false);
    }
  }, [currentUser]);

  useEffect(() => {
    // למסמך ששולם אין תאריך יעד נגזר — אין מה להציג בתצוגה מקדימה.
    if (loading || paid) return;
    const id = setTimeout(() => void refreshPreview(terms), 250);
    return () => clearTimeout(id);
  }, [terms, loading, paid, refreshPreview]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10060] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm"
      dir="rtl"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="my-12 w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-100 text-blue-700">
              <FileText className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-[15px] font-bold text-slate-800">הנפקת {kindLabel}</h2>
              <p className="text-[11.5px] text-slate-500">
                {quoteNumber ? `מתוך הצעה ${quoteNumber}` : 'המסמך ייווצר בכספית'}
              </p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">טוען…</span>
          </div>
        ) : (
          <div className="space-y-4 px-5 py-5">
            {err && (
              <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-[12.5px] text-rose-700">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{err}</span>
              </div>
            )}

            {/* ── איש קשר — למי המסמך מופנה ── */}
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-slate-600">
                <User className="h-3.5 w-3.5" /> איש קשר
              </div>
              {contacts.length === 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] text-amber-700">
                  ללקוח אין אנשי קשר — המסמך יופנה לשם הלקוח בלבד.
                </div>
              ) : (
                <select
                  value={contactId ?? ''}
                  onChange={(e) => setContactId(e.target.value || null)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                >
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName}
                      {c.roleTitle ? ` · ${c.roleTitle}` : ''}
                      {c.email ? ` · ${c.email}` : ' · ללא מייל'}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {paid ? (
              /* מסמך ששולם במעמד: אין אשראי ואין תאריך יעד — רק איך שולם. */
              <div>
                <div className="mb-1.5 text-[12px] font-semibold text-slate-600">אמצעי תשלום</div>
                <div className="flex flex-wrap gap-1.5">
                  {PAYMENT_METHODS.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setPaymentTypeId(m.id)}
                      className={`rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition ${
                        paymentTypeId === m.id
                          ? 'border-emerald-500 bg-emerald-600 text-white'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:bg-emerald-50'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[11.5px] leading-relaxed text-slate-600">
                  המסמך מתעד כסף שכבר התקבל — אין לו תנאי תשלום, ותאריך היעד שלו הוא תאריך ההנפקה.
                </div>
              </div>
            ) : (
              <>
                <div>
                  <div className="mb-1.5 text-[12px] font-semibold text-slate-600">תנאי התשלום</div>
                  <div className="flex flex-wrap gap-1.5">
                    {options.map((o) => (
                      <button
                        key={o.label}
                        type="button"
                        onClick={() => setTerms(o.label)}
                        className={`rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition ${
                          terms.replace(/\s/g, '') === o.label.replace(/\s/g, '')
                            ? 'border-blue-500 bg-blue-600 text-white'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:bg-blue-50'
                        }`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                  <input
                    value={terms}
                    onChange={(e) => setTerms(e.target.value)}
                    placeholder="או הקלד תנאי אחר, למשל: שוטף + 45"
                    className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                {/* ── תאריך היעד שייכתב בפועל ── */}
                <div
                  className={`rounded-xl border p-3 ${
                    preview?.recognized
                      ? 'border-emerald-200 bg-emerald-50'
                      : 'border-amber-200 bg-amber-50'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-[12.5px] font-bold text-slate-700">
                    <CalendarClock className="h-4 w-4" />
                    תאריך יעד לתשלום:{' '}
                    {previewing ? '…' : preview?.dueDate ? fmtDate(preview.dueDate) : 'לא ייקבע'}
                  </div>
                  <div className="mt-1 text-[11.5px] leading-relaxed text-slate-600">
                    {preview?.explanation ?? ''}
                  </div>
                  {!preview?.recognized && (
                    <div className="mt-1.5 text-[11px] text-amber-700">
                      אפשר להנפיק גם ככה — המסמך פשוט ייצא בלי תאריך יעד.
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button
            onClick={onCancel}
            className="rounded-lg border border-slate-200 px-3 py-2 text-[12.5px] font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            ביטול
          </button>
          <button
            onClick={() =>
              onConfirm({
                // מסמך ששולם: אין תנאי תשלום — רק אמצעי התשלום לשורת הקבלה.
                paymentTerms: paid ? null : (terms.trim() || null),
                contactId,
                ...(paid ? { paymentTypeId } : {}),
              })
            }
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-[12.5px] font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            <FileText className="h-4 w-4" />
            הנפק {kindLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
