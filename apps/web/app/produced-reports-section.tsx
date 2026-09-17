'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { FileBarChart, Upload, Download, Trash2, Eye, Loader2, FileText, Mail, Check, X } from 'lucide-react';
import { apiFetch, apiUrl } from './lib/api-base';
import { CustomerReportEmailModal } from './customer-report-email-modal';

type ReportDoc = {
  id: string;
  name: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  dataBase64?: string | null;
  description?: string | null;
  documentDate?: string | null;
  createdAt?: string;
  /** קיים כשהדוח נפתח לעריכה ב-Word — ואז הגרסה החיה יושבת ב-OneDrive. */
  onedriveItemId?: string | null;
  /** מי שהדוח מוען אליו, כפי שהוזן במערכת הפקת הדוחות. */
  recipientName?: string | null;
  recipientEmail?: string | null;
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

/** "01/09/2026, 09:55" — תאריך ושעה של הפקת הדוח. */
function fmtDateTime(v?: string): string {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const date = d.toLocaleDateString('he-IL');
  const time = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  return `${date}, ${time}`;
}

/**
 * סקשן "דוחות שהופקו" — צירוף/צפייה/מחיקה של דוחות שהופקו עבור הלקוח.
 * הקבצים נשמרים כ-base64 ב-DB (אין object storage) תחת documentType=REPORT,
 * וניתנים לשליפה בכל עת מכרטיס הלקוח. נטענים לפי דרישה בלבד.
 */
export function ProducedReportsSection({
  customerId,
  customerName,
  defaultEmail,
  currentUser,
}: {
  customerId: string | null | undefined;
  customerName?: string;
  defaultEmail?: string;
  currentUser: unknown;
}) {
  const [docs, setDocs] = useState<ReportDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [err, setErr] = useState('');
  const [emailFor, setEmailFor] = useState<ReportDoc | null>(null);
  const [wordBusyId, setWordBusyId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameBusy, setRenameBusy] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  /** דוחות שנפתחו ב-Word בעמוד הזה — חזרה ללשונית מסנכרנת אותם. */
  const editingRef = useRef<Set<string>>(new Set());
  const valid = !!customerId && customerId !== '__new__';

  const load = useCallback(async () => {
    if (!valid) return;
    setLoading(true);
    setErr('');
    try {
      const r = await apiFetch(apiUrl(`/customers/${customerId}/documents?type=REPORT`), {
        authUser: currentUser as never,
      });
      if (r.ok) setDocs(await r.json());
      else setErr('טעינת הדוחות נכשלה');
    } catch {
      setErr('טעינת הדוחות נכשלה');
    } finally {
      setLoading(false);
    }
  }, [valid, customerId, currentUser]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * פתיחת טופס המייל ישירות מקישור: ‎?sendReport=<documentId>‎.
   *
   * מערכת הפקת הדוחות מתייקת את קובץ ה-Word בכרטיס הלקוח ברגע שהוא מופק, ואז
   * שולחת את הבודק לכאן. השליחה עצמה נשארת ב-CRM כי כאן יש זהות — המייל יוצא
   * מה-Outlook של מי שמחובר — ולכן הקישור רק פותח את הטופס הקיים על הדוח הנכון.
   *
   * הפרמטר מוסר מה-URL אחרי הפתיחה, כדי שרענון של הדף לא יפתח את הטופס שוב.
   */
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (autoOpenedRef.current || !valid || docs.length === 0) return;
    if (typeof window === 'undefined') return;

    const url = new URL(window.location.href);
    const wanted = url.searchParams.get('sendReport');
    if (!wanted) return;

    const doc = docs.find((d) => d.id === wanted);
    autoOpenedRef.current = true;
    url.searchParams.delete('sendReport');
    window.history.replaceState(null, '', url.toString());

    if (doc) setEmailFor(doc);
    else setErr('הדוח שהקישור מפנה אליו לא נמצא בכרטיס הלקוח.');
  }, [docs, valid]);

  const onPick = async (file: File): Promise<ReportDoc | null> => {
    if (!valid || !file) return null;
    setUploading(true);
    setErr('');
    try {
      const b64 = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => {
          const s = String(fr.result);
          resolve(s.includes(',') ? s.split(',')[1] : s);
        };
        fr.onerror = () => reject(new Error('read failed'));
        fr.readAsDataURL(file);
      });
      const r = await apiFetch(apiUrl(`/customers/${customerId}/documents`), {
        method: 'POST',
        authUser: currentUser as never,
        body: JSON.stringify({
          name: file.name,
          documentType: 'REPORT',
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
          dataBase64: b64,
        }),
      });
      if (r.ok) {
        const created = (await r.json().catch(() => null)) as ReportDoc | null;
        await load();
        return created;
      }
      setErr('העלאת הדוח נכשלה');
      return null;
    } catch {
      setErr('העלאת הדוח נכשלה');
      return null;
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const onPickMany = async (files: File[]) => {
    for (const f of files) {
      // sequential — onPick reloads the list after each upload
      // eslint-disable-next-line no-await-in-loop
      await onPick(f);
    }
  };

  const resetDrag = () => {
    dragDepth.current = 0;
    setDragOver(false);
  };

  const onDragEnter = (e: DragEvent) => {
    if (!valid || uploading) return;
    if (!Array.from(e.dataTransfer.types || []).includes('Files')) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragOver(true);
  };

  const onDragOver = (e: DragEvent) => {
    if (!valid || uploading) return;
    if (!Array.from(e.dataTransfer.types || []).includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const onDragLeave = (e: DragEvent) => {
    if (!valid || uploading) return;
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragOver(false);
  };

  const onDrop = (e: DragEvent) => {
    if (!valid || uploading) return;
    e.preventDefault();
    resetDrag();
    const files = Array.from(e.dataTransfer.files || []);
    if (!files.length) return;
    // גרירת דוח בודד → מצרפים אותו ומיד פותחים את מודל שליחת המייל עבורו.
    // גרירת כמה קבצים ביחד → רק מצרפים (בלי לפתוח ערימת מודלים).
    if (files.length === 1) {
      void onPick(files[0]).then((created) => {
        if (created) setEmailFor(created);
      });
    } else {
      void onPickMany(files);
    }
  };

  /* ── עריכת הדוח ב-Word דרך OneDrive ──
   * אותו דפוס שכבר עובד בהצעות מחיר: מעלים פעם אחת ל-OneDrive ופותחים ב-Word *של המחשב*
   * (לא Word Online — הוא לא שומר נאמנות לתמונות צפות ודוחף אותן לראש העמוד). Word שומר
   * לענן, וכשחוזרים ללשונית ה-CRM הגרסה הערוכה נמשכת אוטומטית חזרה לדוח. */
  function buildDesktopWordUrl(fileUrl: string): string {
    // הקישור הפנימי חייב להיות מקודד (רווחים/עברית) אחרת Word לא מזהה את הפקודה,
    // אבל לא מקודדים שוב כתובת שכבר מקודדת — זה היה שובר %20 קיימים.
    const needsEncoding = / |[^\x00-\x7f]/.test(fileUrl);
    return `ms-word:ofe|u|${needsEncoding ? encodeURI(fileUrl) : fileUrl}`;
  }

  function openInDesktopWord(fileUrl: string) {
    const url = buildDesktopWordUrl(fileUrl);
    // לא <a href>: דפדפני Chromium עדכניים מקודדים את ה-"|" של ms-word:ofe|u| ל-%7C
    // ואז Word לא מזהה את הפקודה. iframe נסתר משאיר את ה-"|" כפי שהוא ולא מנווט מהדף.
    try {
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      document.body.appendChild(iframe);
      const win = iframe.contentWindow;
      if (win) win.location.href = url;
      else window.location.href = url;
      setTimeout(() => iframe.remove(), 2000);
    } catch {
      window.location.href = url;
    }
  }

  const editInWord = async (d: ReportDoc) => {
    if (!customerId) return;
    setWordBusyId(d.id);
    setErr('');
    try {
      const r = await apiFetch(
        apiUrl(`/customers/${customerId}/documents/${d.id}/onedrive-open`),
        { authUser: currentUser as never, method: 'POST' },
      );
      if (!r.ok) {
        let msg = 'פתיחה ב-Word נכשלה — ודא שחשבון ה-Outlook מחובר';
        try { const e = await r.json(); msg = e?.message || msg; } catch { /* ignore */ }
        setErr(msg);
        return;
      }
      const data = await r.json();
      const target = data?.webDavUrl || data?.webUrl;
      if (!target) { setErr('לא התקבלה כתובת פתיחה'); return; }
      // מסמנים שהדוח הזה נערך — כדי שחזרה ללשונית תסנכרן אותו.
      editingRef.current.add(d.id);
      openInDesktopWord(target);
    } catch {
      setErr('פתיחה ב-Word נכשלה');
    } finally {
      setWordBusyId(null);
    }
  };

  /** מושך את הגרסה הערוכה מ-OneDrive אל הדוח. שקט by default — רץ אוטומטית בחזרה מ-Word. */
  const syncFromWord = useCallback(async (documentId: string, opts?: { loud?: boolean }): Promise<boolean> => {
    if (!customerId) return false;
    try {
      const r = await apiFetch(
        apiUrl(`/customers/${customerId}/documents/${documentId}/onedrive-sync`),
        { authUser: currentUser as never, method: 'POST' },
      );
      if (!r.ok) return false;
      const d = await r.json().catch(() => null);
      if (d?.synced) {
        if (opts?.loud) {
          setSyncMsg('הגרסה מ-Word נשמרה במערכת ✓');
          setTimeout(() => setSyncMsg(''), 5000);
        }
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [customerId, currentUser]);

  /* חזרה מ-Word אל לשונית ה-CRM — מסנכרנים אוטומטית כל דוח שנפתח לעריכה.
   * זה מה שהופך את הזרימה ל"ערוך, שמור, וזהו": בלי הסנכרון הזה המשתמש היה צריך
   * לזכור ללחוץ כפתור, ושליחה מיד אחרי עריכה הייתה שולחת את הגרסה שלפניה. */
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const ids = Array.from(editingRef.current);
      if (ids.length === 0) return;
      void (async () => {
        const results = await Promise.all(ids.map((id) => syncFromWord(id, { loud: true })));
        if (results.some(Boolean)) void load();
      })();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [syncFromWord, load]);

  /**
   * שינוי שם הדוח.
   *
   * השרת מריץ את אותו שינוי גם על הקובץ שב-OneDrive, כך שהשם שנשלח ללקוח במייל
   * זהה למה שרואים כאן — השליחה מעדיפה את השם שב-OneDrive כשיש קישור.
   */
  const saveRename = async (d: ReportDoc) => {
    const next = renameValue.trim();
    if (!next || next === d.name) { setRenamingId(null); return; }
    if (!customerId) return;
    setRenameBusy(true);
    setErr('');
    try {
      const r = await apiFetch(apiUrl(`/customers/${customerId}/documents/${d.id}`), {
        authUser: currentUser as never,
        method: 'PATCH',
        body: JSON.stringify({ name: next }),
      });
      if (!r.ok) { setErr('שינוי שם הדוח נכשל'); return; }
      setRenamingId(null);
      await load();
    } catch {
      setErr('שינוי שם הדוח נכשל');
    } finally {
      setRenameBusy(false);
    }
  };

  const view = (d: ReportDoc) => {
    if (!d.dataBase64) return;
    try {
      const url = URL.createObjectURL(base64ToBlob(d.dataBase64, d.mimeType || 'application/octet-stream'));
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setErr('פתיחת הדוח נכשלה');
    }
  };

  const download = (d: ReportDoc) => {
    if (!d.dataBase64) return;
    try {
      const url = URL.createObjectURL(base64ToBlob(d.dataBase64, d.mimeType || 'application/octet-stream'));
      const a = document.createElement('a');
      a.href = url;
      a.download = d.name || 'report';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setErr('הורדת הדוח נכשלה');
    }
  };

  const remove = async (d: ReportDoc) => {
    if (!valid) return;
    if (!window.confirm(`למחוק את "${d.name}"?`)) return;
    try {
      const r = await apiFetch(apiUrl(`/customers/${customerId}/documents/${d.id}`), {
        method: 'DELETE',
        authUser: currentUser as never,
      });
      if (r.ok) await load();
    } catch {
      setErr('מחיקת הדוח נכשלה');
    }
  };

  return (
    <div
      className={`relative rounded-2xl border p-4 transition ${
        dragOver
          ? 'border-indigo-500 border-dashed bg-indigo-100/70 ring-2 ring-indigo-300'
          : 'border-indigo-200 bg-gradient-to-br from-indigo-50 to-blue-50/40'
      }`}
      dir="rtl"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {dragOver && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-indigo-50/80">
          <div className="flex items-center gap-2 rounded-xl border-2 border-dashed border-indigo-400 bg-white/90 px-4 py-3 text-sm font-bold text-indigo-700 shadow-sm">
            <Upload className="h-5 w-5" />
            שחרר כאן כדי לצרף ולשלוח את הדוח במייל
          </div>
        </div>
      )}
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100">
            <FileBarChart className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-800">דוחות שהופקו</div>
            <div className="text-[11px] text-slate-400">גרור דוח בודד כדי לצרף ולפתוח מיד שליחה במייל · או צרף ידנית (PDF / Word / Excel / תמונה)</div>
          </div>
        </div>
        <label
          className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-white transition ${
            valid && !uploading ? 'cursor-pointer hover:brightness-110' : 'cursor-not-allowed opacity-50'
          }`}
          style={{ background: '#4f46e5' }}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {uploading ? 'מעלה…' : 'צרף דוח'}
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,image/*"
            className="hidden"
            disabled={!valid || uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onPick(f);
            }}
          />
        </label>
      </div>

      {!valid && (
        <div className="rounded-xl bg-white/70 px-3 py-2 text-xs text-amber-600">
          יש לשמור את הלקוח לפני צירוף דוחות.
        </div>
      )}

      {valid && (
        loading ? (
          <div className="flex items-center gap-2 py-3 text-xs text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> טוען…
          </div>
        ) : docs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-indigo-200 bg-white/60 px-3 py-6 text-center text-xs text-slate-400">
            עדיין לא צורפו דוחות שהופקו
            <div className="mt-1 text-[11px] text-slate-300">גרור לכאן קובץ כדי לצרף</div>
          </div>
        ) : (
          <div className="space-y-2">
            {docs.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-indigo-100 bg-white px-3 py-2"
              >
                {renamingId === d.id ? (
                  <>
                    {/* עריכה במקום ולא בחלון נפרד: שינוי שם הוא שדה אחד, והשורה עצמה
                        מראה את ההקשר. Enter שומר, Escape מבטל. */}
                    <FileText className="h-4 w-4 shrink-0 text-indigo-600" />
                    <input
                      autoFocus
                      value={renameValue}
                      disabled={renameBusy}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); void saveRename(d); }
                        if (e.key === 'Escape') { e.preventDefault(); setRenamingId(null); }
                      }}
                      className="min-w-0 flex-1 rounded-lg border border-indigo-200 px-2 py-1 text-xs text-slate-700 outline-none focus:border-indigo-400"
                    />
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void saveRename(d)}
                        disabled={renameBusy}
                        className="rounded-lg p-1.5 text-emerald-600 transition hover:bg-emerald-50 disabled:opacity-50"
                        title="שמור"
                      >
                        {renameBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => setRenamingId(null)}
                        disabled={renameBusy}
                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 disabled:opacity-50"
                        title="ביטול"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </>
                ) : (
                <>
                <button
                  type="button"
                  onClick={() => view(d)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-right"
                >
                  <FileText className="h-4 w-4 shrink-0 text-indigo-600" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-slate-700 hover:text-indigo-700">
                      {d.name}
                    </span>
                    {!!d.description && (
                      <span className="block truncate text-[10px] text-slate-400">{d.description}</span>
                    )}
                  </span>
                  {/* תאריך ושעת הפקת הדוח. נלקח מ-createdAt ולא מ-documentDate: השני הוא
                      תאריך שניתן לעריכה ידנית ואין לו שעה, ולכן אינו מעיד על רגע ההפקה בפועל. */}
                  {!!d.createdAt && (
                    <span className="shrink-0 text-[10px] font-bold text-slate-600">
                      {fmtDateTime(d.createdAt)}
                    </span>
                  )}
                  {!!d.sizeBytes && <span className="shrink-0 text-[10px] text-slate-400">{fmtSize(d.sizeBytes)}</span>}
                </button>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => { setRenamingId(d.id); setRenameValue(d.name); }}
                    className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50"
                    title="משנה גם את שם הקובץ ב-OneDrive ואת השם שנשלח ללקוח"
                  >
                    ערוך שם
                  </button>
                  <button
                    type="button"
                    onClick={() => void editInWord(d)}
                    disabled={wordBusyId === d.id}
                    className="flex shrink-0 items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-medium text-sky-700 transition hover:bg-sky-100 disabled:opacity-50"
                    title="העריכה נשמרת ומסתנכרנת אוטומטית"
                  >
                    {wordBusyId === d.id && <Loader2 className="h-3 w-3 animate-spin" />}
                    ערוך בוורד
                  </button>
                  <button
                    type="button"
                    onClick={() => setEmailFor(d)}
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-blue-50 hover:text-blue-600"
                    title="שלח במייל"
                  >
                    <Mail className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => view(d)}
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-indigo-50 hover:text-indigo-600"
                    title="צפה"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => download(d)}
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-indigo-50 hover:text-indigo-600"
                    title="הורד"
                  >
                    <Download className="h-4 w-4" />
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
                </>
                )}
              </div>
            ))}
          </div>
        )
      )}

      {err && <div className="mt-2 text-xs text-red-500">{err}</div>}
      {syncMsg && <div className="mt-2 text-xs text-emerald-600">{syncMsg}</div>}

      <CustomerReportEmailModal
        open={!!emailFor && valid}
        onClose={() => setEmailFor(null)}
        customerId={customerId as string}
        customerName={customerName}
        /* הכתובת שהדוח מוען אליה מנצחת את כתובת הלקוח הכללית: אצל חברה הכתובת
           הכללית היא המרכזייה או מי שיובא ראשון, ולא האדם שהדוח נכתב עבורו.
           דוחות שהופקו לפני שהשדה הזה נוסף נופלים לכתובת הלקוח כמקודם. */
        defaultEmail={emailFor?.recipientEmail || defaultEmail}
        report={emailFor ? { id: emailFor.id, name: emailFor.name } : null}
        currentUser={currentUser as { id?: string; name?: string } & Record<string, unknown>}
      />

    </div>
  );
}
