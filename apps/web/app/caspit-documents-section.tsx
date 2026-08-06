'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, CalendarClock, ExternalLink, FileText, Loader2, ReceiptText, RefreshCw,
} from 'lucide-react';
import { apiFetch, apiUrl } from './lib/api-base';

/**
 * טאב "חשבוניות/קבלות" בכרטיס הלקוח — כל המסמכים שהונפקו ללקוח, **ישירות
 * מכספית** ולא מהעתק מקומי.
 *
 * למה מכספית ולא מה-DB שלנו: אצלנו נשמר רק מספר החשבונית על ההצעה. מסמך שבוטל
 * בכספית, מסמך שהונפק שם ידנית, או תשלום שנרשם אחרי ההנפקה — כל אלה לא היו
 * מופיעים. הטאב אמור לענות על "מה מצב החשבוניות של הלקוח הזה", ולשאלה הזו רק
 * כספית יודעת את התשובה המלאה.
 */

type CaspitDoc = {
  documentId: string;
  number: string;
  kind: string | null;
  kindLabel: string;
  trxTypeId: number;
  date: string | null;
  dueDate: string | null;
  total: number;
  payment: number;
  vat: number;
  finalized: boolean;
  linkToPdf: string | null;
  isPaidDoc: boolean;
};

function fmtDate(ymd: string | null): string {
  if (!ymd) return '—';
  const [y, m, d] = ymd.split('-');
  return y && m && d ? `${d}/${m}/${y}` : ymd;
}

function fmtMoney(n: number): string {
  if (!n) return '—';
  return `${n.toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₪`;
}

async function readJson(res: Response): Promise<any> {
  let text: string;
  try { text = await res.text(); } catch { return null; }
  if (!text.trim()) return null;
  try { return JSON.parse(text); } catch { return null; }
}

/** מסמך שעבר את תאריך היעד ולא שולם — הדבר שמנהל גבייה מחפש בטאב הזה. */
function isOverdue(d: CaspitDoc): boolean {
  if (d.isPaidDoc || !d.dueDate) return false;
  return d.dueDate < new Date().toISOString().slice(0, 10);
}

export function CaspitDocumentsSection({
  customerId,
  currentUser,
}: {
  customerId: string | null | undefined;
  currentUser: unknown;
}) {
  const [docs, setDocs] = useState<CaspitDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [configured, setConfigured] = useState(true);
  const [contactId, setContactId] = useState<string | null>(null);
  const valid = !!customerId && customerId !== '__new__';

  const load = useCallback(async () => {
    if (!valid) return;
    setLoading(true);
    setErr('');
    try {
      const res = await apiFetch(apiUrl(`/caspit/customer/${customerId}/documents`), {
        authUser: currentUser as never,
      });
      const data = await readJson(res);
      if (!res.ok || !data) {
        setErr(data?.message ?? 'טעינת המסמכים מכספית נכשלה');
        return;
      }
      setDocs(Array.isArray(data.documents) ? data.documents : []);
      setConfigured(data.configured !== false);
      setContactId(data.contactId ?? null);
    } catch {
      setErr('טעינת המסמכים מכספית נכשלה');
    } finally {
      setLoading(false);
    }
  }, [valid, customerId, currentUser]);

  useEffect(() => { void load(); }, [load]);

  const totalBilled = docs.filter((d) => !d.isPaidDoc).reduce((a, d) => a + d.total, 0);
  const totalPaid = docs.filter((d) => d.isPaidDoc).reduce((a, d) => a + (d.payment || d.total), 0);
  const overdueCount = docs.filter(isOverdue).length;

  if (!valid) {
    return (
      <div className="rounded-xl bg-white/70 px-3 py-2 text-xs text-amber-600">
        יש לשמור את הלקוח לפני צפייה בחשבוניות.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50/40 p-4" dir="rtl">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100">
            <ReceiptText className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-800">חשבוניות / קבלות</div>
            <div className="text-[11px] text-slate-400">נטען ישירות מכספית</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="flex shrink-0 items-center gap-1.5 rounded-xl border border-emerald-300 bg-white px-3 py-2 text-xs font-bold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          רענן
        </button>
      </div>

      {!configured && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>החיבור לכספית אינו מוגדר. יש להזין את פרטי הגישה בהגדרות → מערכת.</span>
        </div>
      )}

      {err && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{err}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-xs text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> טוען מכספית…
        </div>
      ) : docs.length === 0 && !err ? (
        <div className="rounded-xl border border-dashed border-emerald-200 bg-white/60 px-3 py-6 text-center text-xs text-slate-400">
          {contactId
            ? 'לא נמצאו חשבוניות או קבלות ללקוח זה בכספית'
            : 'לא הונפקו ללקוח זה מסמכים דרך המערכת'}
        </div>
      ) : (
        <>
          {/* ── סיכום ── */}
          <div className="mb-3 grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-blue-100 bg-white px-3 py-2">
              <div className="text-[10.5px] text-slate-400">סה״כ חויב</div>
              <div className="text-sm font-bold text-blue-700">{fmtMoney(totalBilled)}</div>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-white px-3 py-2">
              <div className="text-[10.5px] text-slate-400">סה״כ שולם</div>
              <div className="text-sm font-bold text-emerald-700">{fmtMoney(totalPaid)}</div>
            </div>
            <div className={`rounded-xl border bg-white px-3 py-2 ${overdueCount ? 'border-rose-200' : 'border-slate-100'}`}>
              <div className="text-[10.5px] text-slate-400">באיחור</div>
              <div className={`text-sm font-bold ${overdueCount ? 'text-rose-600' : 'text-slate-400'}`}>
                {overdueCount || '—'}
              </div>
            </div>
          </div>

          {/* ── רשימת המסמכים ── */}
          <div className="space-y-2">
            {docs.map((d) => (
              <div
                key={d.documentId || `${d.trxTypeId}-${d.number}`}
                className={`rounded-xl border bg-white px-3 py-2.5 ${
                  isOverdue(d) ? 'border-rose-200' : 'border-emerald-100'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${
                          d.isPaidDoc
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-blue-200 bg-blue-50 text-blue-700'
                        }`}
                      >
                        {d.kindLabel}
                      </span>
                      {d.number && (
                        <span className="text-xs font-bold text-slate-700">{d.number}</span>
                      )}
                      {!d.finalized && (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10.5px] font-semibold text-amber-700">
                          טיוטה
                        </span>
                      )}
                      {isOverdue(d) && (
                        <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10.5px] font-semibold text-rose-700">
                          באיחור
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                      <span>{fmtDate(d.date)}</span>
                      {d.dueDate && (
                        <span className="inline-flex items-center gap-1">
                          <CalendarClock className="h-3 w-3" />
                          לתשלום עד {fmtDate(d.dueDate)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <div className={`text-sm font-bold ${d.isPaidDoc ? 'text-emerald-700' : 'text-slate-700'}`}>
                      {fmtMoney(d.isPaidDoc ? d.payment || d.total : d.total)}
                    </div>
                    {d.linkToPdf && (
                      <a
                        href={d.linkToPdf}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[11px] font-semibold text-slate-400 transition hover:bg-emerald-50 hover:text-emerald-700"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        PDF
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
