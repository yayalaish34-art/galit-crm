'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FileSignature, Upload, Trash2, Eye, Loader2, FileText } from 'lucide-react';
import { apiFetch, apiUrl } from './lib/api-base';

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
  const [err, setErr] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const valid = !!customerId && customerId !== '__new__';

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

  const onPick = async (file: File) => {
    if (!valid || !file) return;
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
          documentType: 'SIGNED_QUOTE',
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
          dataBase64: b64,
        }),
      });
      if (r.ok) await load();
      else setErr('העלאת הקובץ נכשלה');
    } catch {
      setErr('העלאת הקובץ נכשלה');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
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
            valid && !uploading ? 'cursor-pointer hover:brightness-110' : 'cursor-not-allowed opacity-50'
          }`}
          style={{ background: '#16a34a' }}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {uploading ? 'מעלה…' : 'צרף הצעה חתומה'}
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,image/*"
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
    </div>
  );
}
