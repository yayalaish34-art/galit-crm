'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, FileText, Loader2, Lock, Plus, Trash2 } from 'lucide-react';
import { apiFetch, apiUrl } from './lib/api-base';

/**
 * עריכה ידנית של מסמך כספית **לפני** ההנפקה.
 *
 * כספית מאפשרת לעדכן מסמך רק כל עוד הסטטוס שלו "חדש". מרגע הסגירה
 * (PrintDocument) היא מחזירה שגיאה על כל ניסיון עדכון — וזה נכון חשבונאית:
 * חשבונית מס שהונפקה אינה מתוקנת, אלא מבוטלת ומונפקת מחדש. לכן המסך הזה נפתח
 * על טיוטה, וההנפקה היא הכפתור האחרון בו.
 *
 * הסכומים כאן הם **תצוגה מקדימה בלבד**. המספרים המחייבים הם אלה שכספית מחזירה
 * אחרי שמירה, ולכן אחרי כל שמירה אנחנו מציגים את מה שהיא החזירה ולא את מה
 * שחישבנו.
 */

export type CaspitLine = {
  name: string;
  details?: string;
  unitPrice: number;
  qty: number;
  chargeVat?: boolean;
};

export type CaspitDocument = {
  documentId: string;
  number: string;
  kindLabel: string;
  status: number;
  statusLabel: string;
  editable: boolean;
  date: string | null;
  dueDate: string | null;
  comments: string;
  customerBusinessName: string;
  customerOsekMorshe: string;
  customerContactName: string;
  customerAddress1: string;
  customerCity: string;
  customerEmail: string;
  lines: CaspitLine[];
  total: number;
  vat: number;
  totalBeforeVat: number;
  linkToPdf: string;
  viewUrl: string | null;
};

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

function errText(body: any, fallback: string): string {
  const m = body?.message;
  if (Array.isArray(m)) return m.join(', ');
  return typeof m === 'string' && m ? m : fallback;
}

const money = (n: number) =>
  `₪${(Number(n) || 0).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const EMPTY_LINE: CaspitLine = { name: '', details: '', unitPrice: 0, qty: 1, chargeVat: true };

export function CaspitDocumentEditorModal({
  documentId,
  currentUser,
  onClose,
  onIssued,
}: {
  documentId: string;
  currentUser: unknown;
  /** נסגר בלי להנפיק. הטיוטה נשארת בכספית עד שמבטלים אותה במפורש. */
  onClose: () => void;
  /** הונפק בהצלחה — המסך שמעל מציג הודעה ומציע לשלוח ללקוח. */
  onIssued: (doc: CaspitDocument) => void;
}) {
  const [doc, setDoc] = useState<CaspitDocument | null>(null);
  const [lines, setLines] = useState<CaspitLine[]>([]);
  const [comments, setComments] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmIssue, setConfirmIssue] = useState(false);

  /** ממלא את הטופס ממסמך שהתקבל מהשרת — מקור האמת אחרי כל פעולה. */
  const apply = useCallback((d: CaspitDocument) => {
    setDoc(d);
    setLines(d.lines.length ? d.lines : [{ ...EMPTY_LINE }]);
    setComments(d.comments || '');
    setDueDate(d.dueDate || '');
    setBusinessName(d.customerBusinessName || '');
    setContactName(d.customerContactName || '');
    setEmail(d.customerEmail || '');
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErr('');
      try {
        const res = await apiFetch(apiUrl(`/caspit/document/${encodeURIComponent(documentId)}`), {
          authUser: currentUser as never,
        });
        const body = await readJson(res);
        if (!alive) return;
        if (!res.ok) setErr(errText(body, 'טעינת המסמך מכספית נכשלה'));
        else apply(body);
      } catch {
        if (alive) setErr('שגיאת רשת — נסו שוב');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [documentId, currentUser, apply]);

  const setLine = (i: number, patch: Partial<CaspitLine>) =>
    setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));

  // תצוגה מקדימה בלבד — כספית מחשבת את המע"מ הסופי בשמירה.
  const beforeVat = lines.reduce((s, l) => s + (Number(l.unitPrice) || 0) * (Number(l.qty) || 0), 0);

  const save = async (): Promise<CaspitDocument | null> => {
    if (!lines.some((l) => l.name.trim())) {
      setErr('למסמך חייבת להיות לפחות שורה אחת עם תיאור');
      return null;
    }
    setSaving(true);
    setErr('');
    setNotice('');
    try {
      const res = await apiFetch(apiUrl(`/caspit/document/${encodeURIComponent(documentId)}`), {
        method: 'PUT',
        authUser: currentUser as never,
        body: JSON.stringify({
          lines: lines
            .filter((l) => l.name.trim())
            .map((l) => ({
              name: l.name.trim(),
              details: l.details || '',
              unitPrice: Number(l.unitPrice) || 0,
              qty: Number(l.qty) || 0,
              chargeVat: l.chargeVat !== false,
            })),
          comments,
          dueDate: dueDate || null,
          customerBusinessName: businessName,
          customerContactName: contactName,
          customerEmail: email,
        }),
      });
      const body = await readJson(res);
      if (!res.ok) {
        setErr(errText(body, 'שמירת השינויים נכשלה'));
        return null;
      }
      apply(body);
      setNotice('השינויים נשמרו בטיוטה');
      return body as CaspitDocument;
    } catch {
      setErr('שגיאת רשת — נסו שוב');
      return null;
    } finally {
      setSaving(false);
    }
  };

  /** שמירה ואז סגירת המסמך. מרגע זה הוא בספרים ואינו ניתן לעריכה. */
  const issue = async () => {
    const saved = await save();
    if (!saved) return;
    setIssuing(true);
    setErr('');
    try {
      const res = await apiFetch(
        apiUrl(`/caspit/document/${encodeURIComponent(documentId)}/issue`),
        { method: 'POST', authUser: currentUser as never, body: JSON.stringify({}) },
      );
      const body = await readJson(res);
      if (!res.ok) {
        setErr(errText(body, 'ההנפקה נכשלה'));
        return;
      }
      onIssued(body as CaspitDocument);
    } catch {
      setErr('שגיאת רשת — נסו שוב');
    } finally {
      setIssuing(false);
      setConfirmIssue(false);
    }
  };

  const cancelDraft = async () => {
    setCancelling(true);
    setErr('');
    try {
      const res = await apiFetch(apiUrl(`/caspit/document/${encodeURIComponent(documentId)}`), {
        method: 'DELETE',
        authUser: currentUser as never,
      });
      const body = await readJson(res);
      if (!res.ok) {
        setErr(errText(body, 'ביטול הטיוטה נכשל'));
        return;
      }
      onClose();
    } catch {
      setErr('שגיאת רשת — נסו שוב');
    } finally {
      setCancelling(false);
    }
  };

  const busy = saving || issuing || cancelling;
  const locked = !!doc && !doc.editable;

  return createPortal(
    <div
      className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/40 p-4"
      style={{ direction: 'rtl' }}
      onClick={() => !busy && onClose()}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* כותרת */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <div className="flex items-center gap-2 text-base font-extrabold text-slate-800">
              <FileText className="h-5 w-5 text-blue-600" />
              עריכת {doc?.kindLabel || 'מסמך'} לפני הנפקה
            </div>
            <div className="mt-0.5 text-[12px] text-slate-500">
              {doc?.number ? `מסמך ${doc.number} · ` : ''}
              סטטוס: <b className={locked ? 'text-red-600' : 'text-amber-600'}>{doc?.statusLabel || '—'}</b>
              {!locked && ' — עדיין לא נכנס לספרים'}
            </div>
          </div>
          <button
            onClick={() => !busy && onClose()}
            className="rounded-lg px-2 py-1 text-sm text-slate-400 transition hover:bg-slate-100"
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 px-5 py-16 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> טוען מסמך מכספית…
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {locked && (
              <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[12.5px] text-red-800">
                <Lock className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>
                  המסמך כבר הונפק ולכן נעול לעריכה בכספית. תיקון של מסמך שהונפק מתבצע
                  בביטול והנפקה מחדש — בכספית עצמה.
                </span>
              </div>
            )}

            {/* פרטי הלקוח על המסמך */}
            <div className="mb-4 grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-[11.5px] font-semibold text-slate-600">שם הלקוח</span>
                <input
                  value={businessName}
                  disabled={locked}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-[13px] disabled:bg-slate-50"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11.5px] font-semibold text-slate-600">איש קשר</span>
                <input
                  value={contactName}
                  disabled={locked}
                  onChange={(e) => setContactName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-[13px] disabled:bg-slate-50"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11.5px] font-semibold text-slate-600">מייל</span>
                <input
                  value={email}
                  disabled={locked}
                  onChange={(e) => setEmail(e.target.value)}
                  dir="ltr"
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-[13px] disabled:bg-slate-50"
                />
              </label>
            </div>

            {/* שורות המסמך */}
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[12.5px] font-bold text-slate-700">שורות המסמך</span>
              {!locked && (
                <button
                  onClick={() => setLines((ls) => [...ls, { ...EMPTY_LINE }])}
                  className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[12px] font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  <Plus className="h-3.5 w-3.5" /> הוסף שורה
                </button>
              )}
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[560px] text-[12.5px]">
                <thead className="bg-slate-50 text-[11.5px] text-slate-500">
                  <tr>
                    <th className="px-2 py-2 text-right font-semibold">תיאור</th>
                    <th className="w-20 px-2 py-2 text-right font-semibold">כמות</th>
                    <th className="w-28 px-2 py-2 text-right font-semibold">מחיר יחידה</th>
                    <th className="w-16 px-2 py-2 text-center font-semibold">מע״מ</th>
                    <th className="w-28 px-2 py-2 text-right font-semibold">סה״כ</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-2 py-1.5">
                        <input
                          value={l.name}
                          disabled={locked}
                          onChange={(e) => setLine(i, { name: e.target.value })}
                          placeholder="תיאור השירות"
                          className="w-full rounded-md border border-slate-200 px-2 py-1 disabled:bg-slate-50"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          value={l.qty}
                          disabled={locked}
                          onChange={(e) => setLine(i, { qty: Number(e.target.value) })}
                          className="w-full rounded-md border border-slate-200 px-2 py-1 disabled:bg-slate-50"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          step="0.01"
                          value={l.unitPrice}
                          disabled={locked}
                          onChange={(e) => setLine(i, { unitPrice: Number(e.target.value) })}
                          className="w-full rounded-md border border-slate-200 px-2 py-1 disabled:bg-slate-50"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <input
                          type="checkbox"
                          checked={l.chargeVat !== false}
                          disabled={locked}
                          onChange={(e) => setLine(i, { chargeVat: e.target.checked })}
                          className="h-4 w-4 accent-blue-600"
                        />
                      </td>
                      <td className="px-2 py-1.5 font-semibold text-slate-700">
                        {money((Number(l.unitPrice) || 0) * (Number(l.qty) || 0))}
                      </td>
                      <td className="px-1 py-1.5 text-center">
                        {!locked && lines.length > 1 && (
                          <button
                            onClick={() => setLines((ls) => ls.filter((_, k) => k !== i))}
                            className="rounded p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                            title="מחק שורה"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* סיכום: תצוגה מקדימה מקומית מול מה שכספית באמת שמרה */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5 text-[12.5px]">
              <span className="text-slate-600">
                לפני מע״מ (תצוגה מקדימה): <b className="text-slate-800">{money(beforeVat)}</b>
              </span>
              {doc && (
                <span className="text-slate-600">
                  שמור בכספית: לפני מע״מ <b>{money(doc.totalBeforeVat)}</b> · מע״מ{' '}
                  <b>{money(doc.vat)}</b> · סה״כ{' '}
                  <b className="text-slate-900">{money(doc.total)}</b>
                </span>
              )}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-[11.5px] font-semibold text-slate-600">
                  תאריך לתשלום
                </span>
                <input
                  type="date"
                  value={dueDate}
                  disabled={locked}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-[13px] disabled:bg-slate-50"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11.5px] font-semibold text-slate-600">הערות למסמך</span>
                <input
                  value={comments}
                  disabled={locked}
                  onChange={(e) => setComments(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-[13px] disabled:bg-slate-50"
                />
              </label>
            </div>

            {err && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] font-semibold text-red-700">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                {err}
              </div>
            )}
            {notice && !err && (
              <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12.5px] font-semibold text-emerald-700">
                {notice}
              </div>
            )}
          </div>
        )}

        {/* פעולות */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-5 py-4">
          <button
            onClick={cancelDraft}
            disabled={busy || locked || loading}
            className="rounded-lg border border-red-200 px-3 py-2 text-[12.5px] font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-40"
          >
            {cancelling ? 'מבטל…' : 'בטל טיוטה'}
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={busy}
              className="rounded-lg border border-slate-200 px-3 py-2 text-[12.5px] font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
            >
              סגור
            </button>
            <button
              onClick={save}
              disabled={busy || locked || loading}
              className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-[12.5px] font-bold text-blue-700 transition hover:bg-blue-100 disabled:opacity-40"
            >
              {saving ? 'שומר…' : 'שמור טיוטה'}
            </button>
            {/* אישור נפרד: ההנפקה חד-כיוונית — אחריה כספית נועלת את המסמך. */}
            {confirmIssue ? (
              <button
                onClick={issue}
                disabled={busy || locked}
                className="rounded-lg bg-red-600 px-4 py-2 text-[12.5px] font-bold text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {issuing ? 'מנפיק…' : 'לאשר? אין דרך חזרה'}
              </button>
            ) : (
              <button
                onClick={() => setConfirmIssue(true)}
                disabled={busy || locked || loading}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-[12.5px] font-bold text-white transition hover:bg-blue-700 disabled:opacity-40"
              >
                <FileText className="h-4 w-4" />
                שמור והנפק
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
