'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, FileText, Loader2, RefreshCw, Save, X } from 'lucide-react';
import { apiFetch, apiUrl } from './lib/api-base';

/**
 * עריכת דוח שהופק, מתוך כרטיס הלקוח.
 *
 * מה ניתן לערוך: שם הדוח, הערה, תאריך הדוח, והחלפת הקובץ עצמו בגרסה מתוקנת.
 *
 * למה החלפת קובץ ולא "למחוק ולהעלות מחדש": לדוח שהופק כבר יש היסטוריה — הוא
 * נשלח ללקוח במייל, הוא מופיע בכרטיס עם תאריך ההפקה, ויש לו מזהה שהמערכת
 * מכירה. כשמתקנים טעות בדוח רוצים שהגרסה המתוקנת תחליף את הישנה *באותה שורה*,
 * בלי לאבד את כל זה ובלי שהדוח יקפוץ לראש הרשימה כאילו הופק היום.
 */

export type EditableReportDoc = {
  id: string;
  name: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  description?: string | null;
  documentDate?: string | null;
  createdAt?: string;
};

function fmtSize(n?: number | null): string {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** ISO → yyyy-MM-dd עבור <input type="date">, או '' כשאין/לא תקין. */
function toDateInput(v?: string | null): string {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

/** קורא גוף תשובה כ-JSON בלי להתרסק על גוף ריק (Nest משדר null כגוף ריק). */
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

export function ReportEditModal({
  customerId,
  doc,
  currentUser,
  onClose,
  onSaved,
}: {
  customerId: string;
  doc: EditableReportDoc;
  currentUser: unknown;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [name, setName] = useState(doc.name ?? '');
  const [description, setDescription] = useState(doc.description ?? '');
  const [documentDate, setDocumentDate] = useState(toDateInput(doc.documentDate));
  const [replacement, setReplacement] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Esc סוגר — התנהגות מודל מצופה.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const dirty = useMemo(() => {
    return (
      name.trim() !== (doc.name ?? '').trim() ||
      description.trim() !== (doc.description ?? '').trim() ||
      documentDate !== toDateInput(doc.documentDate) ||
      replacement !== null
    );
  }, [name, description, documentDate, replacement, doc]);

  const save = async () => {
    if (!name.trim()) {
      setErr('שם הדוח לא יכול להיות ריק');
      return;
    }
    setSaving(true);
    setErr('');
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim() || null,
        documentDate: documentDate || null,
      };

      // קובץ חדש → קוראים אותו ל-base64 ושולחים יחד עם ה-mimeType והגודל
      // המעודכנים, אחרת הכרטיס יציג את הגודל של הקובץ הישן.
      if (replacement) {
        const b64 = await new Promise<string>((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => {
            const s = String(fr.result);
            resolve(s.includes(',') ? s.split(',')[1] : s);
          };
          fr.onerror = () => reject(new Error('read failed'));
          fr.readAsDataURL(replacement);
        });
        payload.dataBase64 = b64;
        payload.mimeType = replacement.type || 'application/octet-stream';
        payload.sizeBytes = replacement.size;
      }

      const res = await apiFetch(apiUrl(`/customers/${customerId}/documents/${doc.id}`), {
        method: 'PATCH',
        authUser: currentUser as never,
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await readJson(res);
        throw new Error(body?.message ?? 'שמירת השינויים נכשלה');
      }
      await onSaved();
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? 'שמירת השינויים נכשלה');
    } finally {
      setSaving(false);
    }
  };

  if (!mounted) return null;

  // Portal: הסקשן "דוחות שהופקו" יושב בתוך אב עם transform/position, שמקבע
  // fixed לאותו אב. רינדור ל-body מוציא את המודל מהמלכודת הזו.
  return createPortal(
    <div
      className="fixed inset-0 z-[10050] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm"
      dir="rtl"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div className="my-10 w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-100 text-indigo-700">
              <FileText className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-[15px] font-bold text-slate-800">עריכת דוח</h2>
              <p className="text-[11.5px] text-slate-500">עדכון פרטי הדוח או החלפתו בגרסה מתוקנת</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
            aria-label="סגור"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          {err && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-[12.5px] text-rose-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{err}</span>
            </div>
          )}

          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold text-slate-600">שם הדוח</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold text-slate-600">הערה (אופציונלי)</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="למשל: גרסה מתוקנת לאחר הערות הלקוח"
              className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold text-slate-600">תאריך הדוח (אופציונלי)</span>
            <input
              type="date"
              value={documentDate}
              onChange={(e) => setDocumentDate(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </label>

          {/* ── החלפת הקובץ ── */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
            <div className="mb-2 text-[12px] font-semibold text-slate-600">החלפת הקובץ</div>
            {replacement ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-[12.5px] font-semibold text-emerald-800">{replacement.name}</div>
                  <div className="text-[11px] text-emerald-600">{fmtSize(replacement.size)} · יחליף את הקובץ הקיים</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setReplacement(null);
                    if (fileRef.current) fileRef.current.value = '';
                  }}
                  className="shrink-0 rounded-lg px-2 py-1 text-[11.5px] font-medium text-slate-500 transition hover:bg-white hover:text-rose-600"
                >
                  בטל
                </button>
              </div>
            ) : (
              <>
                <div className="mb-2 text-[11.5px] text-slate-500">
                  הקובץ הנוכחי: {doc.name}
                  {doc.sizeBytes ? ` · ${fmtSize(doc.sizeBytes)}` : ''}
                </div>
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-600 transition hover:border-indigo-400 hover:text-indigo-600">
                  <RefreshCw className="h-3.5 w-3.5" />
                  בחר קובץ מתוקן
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) setReplacement(f);
                    }}
                  />
                </label>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-slate-200 px-5 py-4">
          <span className="text-[11.5px] text-slate-400">
            {dirty ? 'יש שינויים שלא נשמרו' : 'אין שינויים'}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-slate-200 px-3 py-2 text-[12.5px] font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
            >
              ביטול
            </button>
            <button
              onClick={save}
              disabled={saving || !dirty}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-[12.5px] font-bold text-white transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'שומר…' : 'שמור'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
