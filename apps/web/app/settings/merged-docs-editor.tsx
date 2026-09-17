'use client';

/**
 * טאב מנהל: עריכת **התבניות** של הצעות המחיר.
 *
 * הפעולה המרכזית היא "ערוך ב-Word": קובץ ה-DOCX של התבנית עצמו נפתח ב-Word
 * (דרך OneDrive של העורך), נערך כמו כל מסמך רגיל, וכששומרים — מושכים את הגרסה
 * החדשה חזרה ל-CRM. עורכים מסמך קיים במקום, לא מרכיבים אותו מחדש.
 *
 * שינוי כאן משפיע על הצעות שייווצרו מכאן והלאה. הצעות שכבר נשלחו ללקוחות
 * נשארות כפי שהן.
 *
 * "החזר למקור" מבטל את העריכות ומחזיר את קובץ התבנית המקורי.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Download, FileText, Loader2, RefreshCw, Undo2, Upload } from 'lucide-react';
import { apiFetch, apiUrl } from '../lib/api-base';

type TemplateRow = {
  id: string;
  name: string;
  serviceType: string;
  isActive: boolean;
  fileName: string;
  edited: boolean;
  editedAt: string | null;
  editedByName: string | null;
  onedriveWebUrl: string | null;
};

export function MergedDocsEditor({ currentUser }: { currentUser: { id: string; role: string } }) {
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  /** תבניות שנפתחו ב-Word במהלך הביקור — עליהן מציעים משיכת שינויים. */
  const [openedInWord, setOpenedInWord] = useState<Record<string, boolean>>({});
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const uploadTargetRef = useRef<TemplateRow | null>(null);

  const flash = (text: string) => {
    setMsg(text);
    window.setTimeout(() => setMsg(''), 8000);
  };

  const loadList = useCallback(async (term: string) => {
    setListLoading(true);
    setError('');
    try {
      const qs = term.trim() ? `?q=${encodeURIComponent(term.trim())}` : '';
      const res = await apiFetch(apiUrl(`/quote-templates/docx-editor${qs}`), { authUser: currentUser as never });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setError('טעינת רשימת התבניות נכשלה.');
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

  /* ── פתיחת קובץ ה-Word של התבנית ─────────────────────────────────────── */

  /**
   * ms-word:ofe|u|<URL> = "Open For Edit" — מבקש מ-Word הדסקטופ לפתוח את הקובץ
   * ישירות מ-OneDrive, כך שכל שמירה חוזרת לשם. נתיב עם רווחים/עברית חייב קידוד.
   */
  const buildDesktopWordUrl = (fileUrl: string) => {
    const needsEncoding = / |[^\x00-\x7f]/.test(fileUrl);
    return `ms-word:ofe|u|${needsEncoding ? encodeURI(fileUrl) : fileUrl}`;
  };

  /**
   * ניווט ל-ms-word: מתוך iframe מוסתר. ניווט דרך <a> גורם לדפדפנים מבוססי
   * Chromium לקודד את ה-"|" ל-%7C, ואז Word לא מזהה את הפקודה.
   */
  const openInDesktopWord = (fileUrl: string) => {
    const url = buildDesktopWordUrl(fileUrl);
    try {
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      document.body.appendChild(iframe);
      if (iframe.contentWindow) iframe.contentWindow.location.href = url;
      else window.location.href = url;
      window.setTimeout(() => iframe.remove(), 2000);
    } catch {
      window.location.href = url;
    }
  };

  const editInWord = async (row: TemplateRow) => {
    setBusyId(row.id);
    setError('');
    try {
      const res = await apiFetch(apiUrl(`/quote-templates/docx-editor/${row.id}/onedrive-edit`), {
        method: 'POST',
        authUser: currentUser as never,
      });
      if (!res.ok) {
        let m = 'פתיחת התבנית ב-Word נכשלה — ודא שחשבון ה-Outlook מחובר.';
        try { const e = await res.json(); if (e?.message) m = Array.isArray(e.message) ? e.message.join(', ') : e.message; } catch { /* ignore */ }
        throw new Error(m);
      }
      const data = await res.json();
      const target = data?.webDavUrl || data?.webUrl;
      if (!target) throw new Error('לא התקבלה כתובת לפתיחת הקובץ.');
      openInDesktopWord(target);
      setOpenedInWord((p) => ({ ...p, [row.id]: true }));
      flash(
        `"${row.name}" נפתחת ב-Word. ערוך, שמור (Ctrl+S) וסגור — ואז לחץ "משוך שינויים מ-Word" כדי לעדכן את התבנית.`,
      );
      await loadList(search);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'פתיחת התבנית ב-Word נכשלה.');
    } finally {
      setBusyId(null);
    }
  };

  const syncFromWord = async (row: TemplateRow) => {
    setBusyId(row.id);
    setError('');
    try {
      const res = await apiFetch(apiUrl(`/quote-templates/docx-editor/${row.id}/onedrive-sync`), {
        method: 'POST',
        authUser: currentUser as never,
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (data?.synced) {
        flash(`השינויים מ-Word נשמרו בתבנית "${row.name}". הצעות חדשות ייווצרו מהנוסח הזה.`);
        await loadList(search);
      } else {
        setError(
          data?.reason === 'no-file'
            ? 'התבנית לא נפתחה ב-Word עדיין — יש ללחוץ קודם "ערוך ב-Word".'
            : 'לא נמצאה גרסה מעודכנת ב-Word. ודא ששמרת את הקובץ (Ctrl+S) ונסה שוב.',
        );
      }
    } catch {
      setError('משיכת השינויים מ-Word נכשלה.');
    } finally {
      setBusyId(null);
    }
  };

  const download = async (row: TemplateRow) => {
    setBusyId(row.id);
    try {
      const res = await apiFetch(apiUrl(`/quote-templates/docx-editor/${row.id}/download`), {
        authUser: currentUser as never,
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = row.fileName || 'template.docx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch {
      setError('הורדת התבנית נכשלה.');
    } finally {
      setBusyId(null);
    }
  };

  const pickUpload = (row: TemplateRow) => {
    uploadTargetRef.current = row;
    uploadRef.current?.click();
  };

  const onUploadPicked = async (file: File | undefined) => {
    const row = uploadTargetRef.current;
    if (!file || !row) return;
    setBusyId(row.id);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file, file.name);
      const res = await apiFetch(apiUrl(`/quote-templates/docx-editor/${row.id}/upload`), {
        method: 'POST',
        authUser: currentUser as never,
        body: form,
      });
      if (!res.ok) {
        let m = 'העלאת הקובץ נכשלה.';
        try { const e = await res.json(); if (e?.message) m = Array.isArray(e.message) ? e.message.join(', ') : e.message; } catch { /* ignore */ }
        throw new Error(m);
      }
      flash(`התבנית "${row.name}" עודכנה מהקובץ שהעלית.`);
      await loadList(search);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'העלאת הקובץ נכשלה.');
    } finally {
      setBusyId(null);
      uploadTargetRef.current = null;
      if (uploadRef.current) uploadRef.current.value = '';
    }
  };

  const revert = async (row: TemplateRow) => {
    if (!window.confirm(`להחזיר את "${row.name}" לתבנית המקורית? כל העריכות שבוצעו בה יימחקו.`)) return;
    setBusyId(row.id);
    setError('');
    try {
      const res = await apiFetch(apiUrl(`/quote-templates/docx-editor/${row.id}/revert`), {
        method: 'POST',
        authUser: currentUser as never,
      });
      if (!res.ok) throw new Error();
      setOpenedInWord((p) => ({ ...p, [row.id]: false }));
      flash(`"${row.name}" הוחזרה לתבנית המקורית.`);
      await loadList(search);
    } catch {
      setError('החזרה לתבנית המקורית נכשלה.');
    } finally {
      setBusyId(null);
    }
  };

  const fmtDate = (iso: string | null) => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return `${d.toLocaleDateString('he-IL')} ${d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
      return '';
    }
  };

  return (
    <div dir="rtl" className="space-y-4">
      <input
        ref={uploadRef}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(e) => void onUploadPicked(e.target.files?.[0])}
      />

      <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[13px] text-amber-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <div>
          <div className="font-bold">עריכת קובץ ה-Word של התבנית</div>
          <b>ערוך ב-Word</b> פותח את קובץ התבנית עצמו ב-Word. עורכים אותו כרגיל, שומרים
          (Ctrl+S), סוגרים — ואז לוחצים <b>משוך שינויים מ-Word</b> וזה מתעדכן בתבנית.
          השינוי משפיע על הצעות שייווצרו <b>מכאן והלאה</b>; הצעות שכבר נשלחו לא משתנות.
          שדות בסוגריים מסולסלים כמו <code className="rounded bg-white px-1">{'{customerName}'}</code> מתמלאים
          אוטומטית בזמן יצירת ההצעה — אין למחוק אותם.
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {msg && <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">{msg}</div>}

      <div className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
          <div className="text-base font-bold text-slate-800">
            תבניות הצעות מחיר <span className="text-sm font-normal text-slate-400">({rows.length})</span>
          </div>
          <input
            className="w-72 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:bg-white"
            placeholder="חיפוש תבנית לפי שם או שירות…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {listLoading ? (
          <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> טוען…
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">
            {search.trim() ? `לא נמצאו תבניות התואמות ל"${search}"` : 'אין תבניות עם קובץ DOCX'}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map((row) => {
              const busy = busyId === row.id;
              const canSync = !!row.onedriveWebUrl || openedInWord[row.id];
              return (
                <div key={row.id} className="flex flex-wrap items-center gap-2 p-3 hover:bg-slate-50">
                  <FileText className={`h-4 w-4 flex-shrink-0 ${row.isActive ? 'text-slate-400' : 'text-slate-300'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-800">
                      {row.name}
                      {!row.isActive && <span className="mr-2 text-[11px] font-normal text-slate-400">(לא פעילה)</span>}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                      <span className="truncate">{row.fileName}</span>
                      {row.edited && (
                        <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-700">
                          נערכה{row.editedByName ? ` · ${row.editedByName}` : ''}{row.editedAt ? ` · ${fmtDate(row.editedAt)}` : ''}
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void editInWord(row)}
                    className="flex items-center gap-1 rounded-xl border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-40"
                    title="פותח את קובץ ה-Word של התבנית לעריכה במקום"
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                    ערוך ב-Word
                  </button>
                  {canSync && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void syncFromWord(row)}
                      className="flex items-center gap-1 rounded-xl border border-green-300 bg-green-50 px-3 py-1.5 text-xs font-bold text-green-800 hover:bg-green-100 disabled:opacity-40"
                      title="מושך את הגרסה ששמרת ב-Word אל התבנית"
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> משוך שינויים מ-Word
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void download(row)}
                    className="flex items-center gap-1 rounded-xl border px-3 py-1.5 text-xs hover:bg-slate-50 disabled:opacity-40"
                    title="הורדת קובץ התבנית למחשב"
                  >
                    <Download className="h-3.5 w-3.5" /> הורדה
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => pickUpload(row)}
                    className="flex items-center gap-1 rounded-xl border px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-40"
                    title="גיבוי: העלאת קובץ Word מהמחשב (למי שאין לו Outlook מחובר)"
                  >
                    <Upload className="h-3.5 w-3.5" /> העלאה ידנית
                  </button>
                  {row.edited && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void revert(row)}
                      className="flex items-center gap-1 rounded-xl border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-40"
                      title="ביטול כל העריכות וחזרה לתבנית המקורית"
                    >
                      <Undo2 className="h-3.5 w-3.5" /> החזר למקור
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
