'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FileSignature, Upload, Trash2, Eye, Loader2, FileText, X, CheckCircle2 } from 'lucide-react';
import { apiFetch, apiUrl } from './lib/api-base';

/** קורא קובץ ל-base64 (ללא תחילית data:). */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const s = String(fr.result);
      resolve(s.includes(',') ? s.split(',')[1] : s);
    };
    fr.onerror = () => reject(new Error('read failed'));
    fr.readAsDataURL(file);
  });
}

/** פורמט מספר עם מפרידי אלפים לתצוגה. */
function fmtAmount(n: number): string {
  return n.toLocaleString('he-IL');
}

type SignedDoc = {
  id: string;
  name: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  dataBase64?: string | null;
  createdAt?: string;
};

function base64ToBlob(b64: string, mime: string): Blob {
  const clean = b64.includes(',') ? b64.split(',')[1] : b64;
  const chars = atob(clean);
  const bytes = new Uint8Array(chars.length);
  for (let i = 0; i < chars.length; i++) bytes[i] = chars.charCodeAt(i);
  return new Blob([bytes], { type: mime || 'application/octet-stream' });
}

function fmtSize(n?: number | null): string {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * סקשן "הצעת מחיר חתומה" — צירוף/צפייה/מחיקה של הצעות מחיר חתומות של הלקוח.
 * הקבצים נשמרים כ-base64 ב-DB (אין object storage). נטען לפי דרישה בלבד.
 */
export function SignedQuotesSection({
  customerId,
  currentUser,
}: {
  customerId: string | null | undefined;
  currentUser: unknown;
}) {
  const [docs, setDocs] = useState<SignedDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [err, setErr] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const valid = !!customerId && customerId !== '__new__';

  // מודל אישור סכום — נפתח אחרי בחירת קובץ, לפני השמירה.
  const [pending, setPending] = useState<{
    file: File;
    b64: string;
    amount: string; // כטקסט לעריכה
    quoteNumber: string;
    detected: boolean; // האם הסכום זוהה אוטומטית מה-PDF
    /** מקור מספר ההצעה שמולא אוטומטית — לתצוגה בלבד; 'manual' = המשתמש ערך. */
    numberSource: 'pdf' | 'customer' | 'next' | 'manual';
  } | null>(null);

  const load = useCallback(async () => {
    if (!valid) return;
    setLoading(true);
    setErr('');
    try {
      const r = await apiFetch(apiUrl(`/customers/${customerId}/documents?type=SIGNED_QUOTE`), {
        authUser: currentUser as never,
      });
      if (r.ok) setDocs(await r.json());
      else setErr('טעינת הקבצים נכשלה');
    } catch {
      setErr('טעינת הקבצים נכשלה');
    } finally {
      setLoading(false);
    }
  }, [valid, customerId, currentUser]);

  useEffect(() => {
    void load();
  }, [load]);

  // בחירת קובץ → חילוץ סכום + מספר הצעה → פתיחת מודל אישור.
  const onPick = async (file: File) => {
    if (!valid || !file) return;
    setParsing(true);
    setErr('');
    try {
      const b64 = await fileToBase64(file);
      let detectedAmount: number | null = null;
      let detectedNumber = '';
      let numberSource: 'pdf' | 'customer' | 'next' | 'manual' = 'manual';
      try {
        const r = await apiFetch(apiUrl(`/customers/${customerId}/signed-quote/parse`), {
          method: 'POST',
          authUser: currentUser as never,
          body: JSON.stringify({ dataBase64: b64, mimeType: file.type || '' }),
        });
        if (r.ok) {
          const j = await r.json();
          if (typeof j?.total === 'number') detectedAmount = j.total;
          if (j?.quoteNumber) {
            detectedNumber = String(j.quoteNumber);
            numberSource = j.quoteNumberSource === 'pdf' ? 'pdf' : 'customer';
          }
        }
      } catch {
        /* חילוץ נכשל — נמשיך עם קלט ידני */
      }
      // אין מספר במסמך ואין הצעה קודמת ללקוח — מקצים את המספר הרץ הבא, כדי שההצעה
      // החתומה לא תישמר בלי מספר (הצעה בלי מספר מופיעה כ"—" ברשימות ובמסמכים).
      if (!detectedNumber) {
        try {
          const r = await apiFetch(apiUrl('/quotes/next-reference'), { authUser: currentUser as never });
          if (r.ok) {
            const j = await r.json();
            if (j?.reference) {
              detectedNumber = String(j.reference);
              numberSource = 'next';
            }
          }
        } catch {
          /* אין מספר רץ — המשתמש ימלא ידנית */
        }
      }
      setPending({
        file,
        b64,
        amount: detectedAmount != null ? String(detectedAmount) : '',
        quoteNumber: detectedNumber,
        detected: detectedAmount != null,
        numberSource: detectedNumber ? numberSource : 'manual',
      });
    } catch {
      setErr('קריאת הקובץ נכשלה');
    } finally {
      setParsing(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  // אישור המודל → יצירת מסמך SIGNED_QUOTE + Quote SIGNED + קידום משימה.
  const confirmUpload = async () => {
    if (!valid || !pending) return;
    const amount = Number(String(pending.amount).replace(/[,\s₪]/g, ''));
    if (!Number.isFinite(amount) || amount <= 0) {
      setErr('יש להזין סכום סופי תקין');
      return;
    }
    setUploading(true);
    setErr('');
    try {
      const r = await apiFetch(apiUrl(`/customers/${customerId}/signed-quote`), {
        method: 'POST',
        authUser: currentUser as never,
        body: JSON.stringify({
          name: pending.file.name,
          dataBase64: pending.b64,
          mimeType: pending.file.type || 'application/octet-stream',
          sizeBytes: pending.file.size,
          finalAmount: amount,
          quoteNumber: pending.quoteNumber.trim() || undefined,
        }),
      });
      if (r.ok) {
        setPending(null);
        await load();
      } else {
        // מציגים את הסיבה האמיתית מהשרת — הודעה גנרית הסתירה כאן שגיאת P2028
        // (timeout של טרנזקציה) שקרתה רק בקבצים גדולים, ואי אפשר היה לאבחן אותה מהמסך.
        let detail = '';
        try {
          const body = await r.text();
          const parsed = body ? JSON.parse(body) : null;
          detail = parsed?.message
            ? (Array.isArray(parsed.message) ? parsed.message.join(', ') : String(parsed.message))
            : body.slice(0, 200);
        } catch { /* גוף לא-JSON — נסתפק בקוד הסטטוס */ }
        setErr(`צירוף ההצעה נכשל (${r.status})${detail ? ` — ${detail}` : ''}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      setErr(`צירוף ההצעה נכשל${msg ? ` — ${msg}` : ' — החיבור נותק'}`);
    } finally {
      setUploading(false);
    }
  };

  const view = (d: SignedDoc) => {
    if (!d.dataBase64) return;
    try {
      const url = URL.createObjectURL(base64ToBlob(d.dataBase64, d.mimeType || 'application/octet-stream'));
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setErr('פתיחת הקובץ נכשלה');
    }
  };

  const remove = async (d: SignedDoc) => {
    if (!valid) return;
    if (!window.confirm(`למחוק את "${d.name}"?`)) return;
    try {
      const r = await apiFetch(apiUrl(`/customers/${customerId}/documents/${d.id}`), {
        method: 'DELETE',
        authUser: currentUser as never,
      });
      if (r.ok) await load();
    } catch {
      setErr('מחיקת הקובץ נכשלה');
    }
  };

  return (
    <div
      className="rounded-2xl border border-green-200 bg-gradient-to-br from-green-50 to-emerald-50/40 p-4"
      dir="rtl"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-green-100">
            <FileSignature className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-800">הצעת מחיר חתומה</div>
            <div className="text-[11px] text-slate-400">צרף את ההצעה החתומה של הלקוח (PDF / תמונה)</div>
          </div>
        </div>
        <label
          className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-white transition ${
            valid && !uploading && !parsing ? 'cursor-pointer hover:brightness-110' : 'cursor-not-allowed opacity-50'
          }`}
          style={{ background: '#16a34a' }}
        >
          {parsing || uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {parsing ? 'קורא…' : uploading ? 'מעלה…' : 'צרף הצעה חתומה'}
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,image/*"
            className="hidden"
            disabled={!valid || uploading || parsing}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onPick(f);
            }}
          />
        </label>
      </div>

      {!valid && (
        <div className="rounded-xl bg-white/70 px-3 py-2 text-xs text-amber-600">
          יש לשמור את הלקוח לפני צירוף הצעה חתומה.
        </div>
      )}

      {valid && (
        loading ? (
          <div className="flex items-center gap-2 py-3 text-xs text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> טוען…
          </div>
        ) : docs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-green-200 bg-white/60 px-3 py-4 text-center text-xs text-slate-400">
            עדיין לא צורפו הצעות מחיר חתומות
          </div>
        ) : (
          <div className="space-y-2">
            {docs.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-green-100 bg-white px-3 py-2"
              >
                <button
                  type="button"
                  onClick={() => view(d)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-right"
                >
                  <FileText className="h-4 w-4 shrink-0 text-green-600" />
                  <span className="truncate text-xs font-medium text-slate-700 hover:text-green-700">{d.name}</span>
                  {!!d.sizeBytes && <span className="shrink-0 text-[10px] text-slate-400">{fmtSize(d.sizeBytes)}</span>}
                </button>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => view(d)}
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-green-50 hover:text-green-600"
                    title="צפה"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(d)}
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-500"
                    title="מחק"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {err && <div className="mt-2 text-xs text-red-500">{err}</div>}

      {pending && (
        <div
          className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/40 p-4"
          dir="rtl"
          onClick={() => !uploading && setPending(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-100">
                  <FileSignature className="h-4.5 w-4.5 text-green-600" />
                </div>
                <div className="text-sm font-bold text-slate-800">צירוף הצעה חתומה</div>
              </div>
              <button
                type="button"
                onClick={() => !uploading && setPending(null)}
                className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-3 flex items-center gap-2 rounded-xl border border-green-100 bg-green-50/60 px-3 py-2">
              <FileText className="h-4 w-4 shrink-0 text-green-600" />
              <span className="truncate text-xs font-medium text-slate-700">{pending.file.name}</span>
            </div>

            <label className="mb-1 block text-xs font-bold text-slate-600">סכום סופי (₪)</label>
            <input
              type="text"
              inputMode="numeric"
              autoFocus
              value={pending.amount}
              onChange={(e) => setPending((p) => (p ? { ...p, amount: e.target.value, detected: false } : p))}
              placeholder="לדוגמה: 45000"
              className="mb-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-green-400"
            />
            {pending.detected && Number(String(pending.amount).replace(/[,\s₪]/g, '')) > 0 ? (
              <div className="mb-3 flex items-center gap-1 text-[11px] text-green-600">
                <CheckCircle2 className="h-3 w-3" />
                זוהה אוטומטית מההצעה — {fmtAmount(Number(String(pending.amount).replace(/[,\s₪]/g, '')))} ₪. ניתן לתקן.
              </div>
            ) : (
              <div className="mb-3 text-[11px] text-slate-400">הזן את הסכום הכולל שנחתם.</div>
            )}

            <label className="mb-1 block text-xs font-bold text-slate-600">מס׳ הצעה / הזמנה</label>
            <input
              type="text"
              value={pending.quoteNumber}
              onChange={(e) =>
                setPending((p) => (p ? { ...p, quoteNumber: e.target.value, numberSource: 'manual' } : p))
              }
              placeholder="—"
              className="mb-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-green-400"
            />
            {pending.numberSource !== 'manual' && !!pending.quoteNumber.trim() ? (
              <div className="mb-4 flex items-center gap-1 text-[11px] text-green-600">
                <CheckCircle2 className="h-3 w-3" />
                {pending.numberSource === 'pdf'
                  ? 'מולא אוטומטית — המספר שמופיע במסמך. ניתן לתקן.'
                  : pending.numberSource === 'customer'
                    ? 'מולא אוטומטית — מספר ההצעה האחרונה של הלקוח. ניתן לתקן.'
                    : 'מולא אוטומטית — המספר הרץ הבא. ניתן לתקן.'}
              </div>
            ) : (
              <div className="mb-4 text-[11px] text-slate-400">מספר ההצעה כפי שמופיע במסמך.</div>
            )}

            {err && <div className="mb-2 text-xs text-red-500">{err}</div>}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => !uploading && setPending(null)}
                disabled={uploading}
                className="rounded-xl px-3 py-2 text-xs font-bold text-slate-500 transition hover:bg-slate-100 disabled:opacity-50"
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={() => void confirmUpload()}
                disabled={uploading}
                className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-white transition hover:brightness-110 disabled:opacity-50"
                style={{ background: '#16a34a' }}
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {uploading ? 'מצרף…' : 'אישור וצירוף'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
