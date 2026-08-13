'use client';

/**
 * טאב מנהל: עריכת טקסט בקבצים ממוזגים של הצעות מחיר.
 *
 * מה שהמסך הזה *לא* עושה, בכוונה: הוא לא בונה מסמך מחדש ולא נוגע בעיצוב. השרת פותח
 * את קובץ ה-DOCX, מחליף רק את הטקסט בתוך הפסקאות שהמנהל שינה, וסוגר אותו חזרה —
 * לוגו, כותרות, טבלאות, תמונות וטבלת החתימה נשארים בדיוק כפי שהיו. לכן העריכה כאן
 * היא "שינוי מילים" ולא עורך Word: אי אפשר להוסיף פסקה, לשנות גופן או להזיז טבלה.
 *
 * כל שמירה יוצרת **גרסה חדשה** ומשאירה את הקודמת ברשימה — אפשר תמיד לחזור אחורה.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Download, FileText, Loader2, RotateCcw, Save, Search } from 'lucide-react';
import { apiFetch, apiUrl } from '../lib/api-base';

type MergedDocRow = {
  id: string;
  quoteId: string;
  fileName: string;
  description: string | null;
  createdAt: string;
  quoteNumber: string | null;
  customerName: string | null;
};

type Paragraph = { id: number; text: string };

export function MergedDocsEditor({ currentUser }: { currentUser: { id: string; role: string } }) {
  const [rows, setRows] = useState<MergedDocRow[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const [openDoc, setOpenDoc] = useState<MergedDocRow | null>(null);
  const [docLoading, setDocLoading] = useState(false);
  const [original, setOriginal] = useState<Paragraph[]>([]);
  const [draft, setDraft] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);

  const loadList = useCallback(async (term: string) => {
    setListLoading(true);
    setError('');
    try {
      const qs = term.trim() ? `?q=${encodeURIComponent(term.trim())}` : '';
      const res = await apiFetch(apiUrl(`/quotes/merged-docs${qs}`), { authUser: currentUser as never });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setError('טעינת רשימת הקבצים נכשלה.');
      setRows([]);
    } finally {
      setListLoading(false);
    }
  }, [currentUser]);

  useEffect(() => { void loadList(''); }, [loadList]);

  // חיפוש עם השהיה קצרה — כדי לא לירות בקשה על כל תו.
  useEffect(() => {
    const t = window.setTimeout(() => { void loadList(search); }, 350);
    return () => window.clearTimeout(t);
  }, [search, loadList]);

  const openEditor = async (row: MergedDocRow) => {
    setOpenDoc(row);
    setDocLoading(true);
    setError('');
    setDraft({});
    setOriginal([]);
    try {
      const res = await apiFetch(apiUrl(`/quotes/merged-docs/${row.id}/text`), { authUser: currentUser as never });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const paras: Paragraph[] = Array.isArray(data?.paragraphs) ? data.paragraphs : [];
      setOriginal(paras);
      setDraft(Object.fromEntries(paras.map((p) => [p.id, p.text])));
    } catch {
      setError('טעינת תוכן הקובץ נכשלה — ייתכן שהקובץ אינו DOCX תקין.');
      setOpenDoc(null);
    } finally {
      setDocLoading(false);
    }
  };

  /** רק הפסקאות שהשתנו נשלחות — כל השאר לא נגעו בהן ולא ייגעו בהן בקובץ. */
  const changedParagraphs = useMemo(
    () => original.filter((p) => (draft[p.id] ?? p.text) !== p.text),
    [original, draft],
  );

  const save = async () => {
    if (!openDoc || changedParagraphs.length === 0) return;
    setSaving(true);
    setError('');
    try {
      const res = await apiFetch(apiUrl(`/quotes/merged-docs/${openDoc.id}/text`), {
        method: 'POST',
        authUser: currentUser as never,
        body: JSON.stringify({
          paragraphs: changedParagraphs.map((p) => ({ id: p.id, text: draft[p.id] ?? p.text })),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setMsg(`נשמרה גרסה חדשה (${data?.changed ?? 0} פסקאות עודכנו). הגרסה הקודמת נשמרה ברשימה.`);
      window.setTimeout(() => setMsg(''), 6000);
      setOpenDoc(null);
      setOriginal([]);
      setDraft({});
      await loadList(search);
    } catch {
      setError('שמירת הקובץ נכשלה.');
    } finally {
      setSaving(false);
    }
  };

  const download = async (row: MergedDocRow) => {
    try {
      const res = await apiFetch(apiUrl(`/quotes/merged-docs/${row.id}/download`), { authUser: currentUser as never });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = row.fileName || 'quote.docx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch {
      setError('הורדת הקובץ נכשלה.');
    }
  };

  const fmtDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return `${d.toLocaleDateString('he-IL')} ${d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
      return '';
    }
  };

  return (
    <div dir="rtl" className="space-y-4">
      <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[13px] text-amber-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <div>
          <div className="font-bold">עריכת מילים בלבד — התבנית לא נפגעת</div>
          כאן משנים את <b>הטקסט</b> שבתוך הקובץ הממוזג. הלוגו, הכותרת, הטבלאות, התמונות וטבלת
          החתימה נשארים בדיוק כפי שהם. אי אפשר להוסיף פסקה חדשה, לשנות גופן או להזיז טבלה —
          לשם כך יש לפתוח את הקובץ ב-Word. כל שמירה יוצרת גרסה חדשה, והקודמת נשארת ברשימה.
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {msg && <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">{msg}</div>}

      {!openDoc ? (
        <div className="rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
            <div className="text-base font-bold text-slate-800">קבצים ממוזגים</div>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="w-72 rounded-xl border border-slate-200 bg-slate-50 py-2 pr-9 pl-3 text-sm outline-none focus:border-blue-400 focus:bg-white"
                placeholder="חיפוש לפי לקוח או מספר הצעה…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {listLoading ? (
            <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> טוען…
            </div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">
              {search.trim() ? `לא נמצאו קבצים התואמים ל"${search}"` : 'אין עדיין קבצים ממוזגים'}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {rows.map((row) => (
                <div key={row.id} className="flex flex-wrap items-center gap-3 p-3 hover:bg-slate-50">
                  <FileText className="h-4 w-4 flex-shrink-0 text-slate-400" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-800">{row.fileName}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                      {row.customerName && <span className="font-medium">{row.customerName}</span>}
                      {row.quoteNumber && <span>· הצעה {row.quoteNumber}</span>}
                      <span>· {fmtDate(row.createdAt)}</span>
                      {row.description === 'מסמך ממוזג (נערך ידנית)' && (
                        <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-700">נערך</span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void download(row)}
                    className="flex items-center gap-1 rounded-xl border px-3 py-1.5 text-xs hover:bg-slate-50"
                  >
                    <Download className="h-3.5 w-3.5" /> הורדה
                  </button>
                  <button
                    type="button"
                    onClick={() => void openEditor(row)}
                    className="rounded-xl border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100"
                  >
                    עריכת טקסט
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
            <div className="min-w-0">
              <div className="truncate text-base font-bold text-slate-800">{openDoc.fileName}</div>
              <div className="text-[11px] text-slate-500">
                {openDoc.customerName}
                {openDoc.quoteNumber ? ` · הצעה ${openDoc.quoteNumber}` : ''}
                {changedParagraphs.length > 0 ? ` · ${changedParagraphs.length} פסקאות שונו` : ''}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => { setOpenDoc(null); setOriginal([]); setDraft({}); }}
                className="rounded-xl border px-3 py-2 text-sm hover:bg-slate-50"
              >
                חזרה לרשימה
              </button>
              <button
                type="button"
                disabled={changedParagraphs.length === 0}
                onClick={() => setDraft(Object.fromEntries(original.map((p) => [p.id, p.text])))}
                className="flex items-center gap-1 rounded-xl border px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-40"
              >
                <RotateCcw className="h-3.5 w-3.5" /> בטל שינויים
              </button>
              <button
                type="button"
                disabled={saving || changedParagraphs.length === 0}
                onClick={() => void save()}
                className="flex items-center gap-1 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-40"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? 'שומר…' : 'שמור גרסה חדשה'}
              </button>
            </div>
          </div>

          {docLoading ? (
            <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> טוען את תוכן הקובץ…
            </div>
          ) : original.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">לא נמצא טקסט הניתן לעריכה בקובץ זה</div>
          ) : (
            <div className="max-h-[65vh] space-y-2 overflow-y-auto p-4">
              {original.map((p) => {
                const value = draft[p.id] ?? p.text;
                const dirty = value !== p.text;
                return (
                  <div key={p.id} className="flex items-start gap-2">
                    <span className="mt-2 w-8 flex-shrink-0 text-left text-[10px] text-slate-300">{p.id}</span>
                    <textarea
                      value={value}
                      onChange={(e) => setDraft((prev) => ({ ...prev, [p.id]: e.target.value }))}
                      rows={Math.min(6, Math.max(1, Math.ceil(value.length / 90)))}
                      className={
                        'w-full resize-y rounded-lg border px-3 py-2 text-sm outline-none transition-colors ' +
                        (dirty
                          ? 'border-amber-300 bg-amber-50 focus:border-amber-400'
                          : 'border-slate-200 bg-white focus:border-blue-400')
                      }
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
