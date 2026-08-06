'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { FileBarChart, Upload, Download, Trash2, Eye, Loader2, FileText, Mail, Pencil } from 'lucide-react';
import { apiFetch, apiUrl } from './lib/api-base';
import { CustomerReportEmailModal } from './customer-report-email-modal';
import { ReportEditModal } from './report-edit-modal';

type ReportDoc = {
  id: string;
  name: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  dataBase64?: string | null;
  description?: string | null;
  documentDate?: string | null;
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

function fmtDate(v?: string): string {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('he-IL');
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
  const [editFor, setEditFor] = useState<ReportDoc | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
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
                  {!!d.sizeBytes && <span className="shrink-0 text-[10px] text-slate-400">{fmtSize(d.sizeBytes)}</span>}
                  {!!(d.documentDate || d.createdAt) && (
                    <span className="shrink-0 text-[10px] text-slate-300">
                      {fmtDate(d.documentDate ?? d.createdAt)}
                    </span>
                  )}
                </button>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setEditFor(d)}
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-amber-50 hover:text-amber-600"
                    title="ערוך"
                  >
                    <Pencil className="h-4 w-4" />
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
              </div>
            ))}
          </div>
        )
      )}

      {err && <div className="mt-2 text-xs text-red-500">{err}</div>}

      <CustomerReportEmailModal
        open={!!emailFor && valid}
        onClose={() => setEmailFor(null)}
        customerId={customerId as string}
        customerName={customerName}
        defaultEmail={defaultEmail}
        report={emailFor ? { id: emailFor.id, name: emailFor.name } : null}
        currentUser={currentUser as { id?: string; name?: string } & Record<string, unknown>}
      />

      {editFor && valid && (
        <ReportEditModal
          customerId={customerId as string}
          doc={editFor}
          currentUser={currentUser}
          onClose={() => setEditFor(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
