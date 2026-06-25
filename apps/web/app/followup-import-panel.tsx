'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { apiUrl, apiFetch, type ApiAuthUser } from './lib/api-base';
import { isAdminRole, normalizeRole } from './lib/roles';

type SheetEntity =
  | 'auto'
  | 'customers'
  | 'contacts'
  | 'quotes'
  | 'orders'
  | 'activities';

type PreviewJson = {
  counts: Record<string, number>;
  samples: Record<string, unknown[]>;
  warnings: string[];
  sheetEntity?: string;
  fileName?: string;
  fileType?: string;
};

type ImportJobRow = {
  id: string;
  fileName: string;
  fileType: string;
  status: string;
  createdAt: string;
  resultJson?: unknown;
  errorMessage?: string | null;
  _count?: { errors: number };
};

function cn(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(' ');
}

function inferFileType(name: string | null | undefined): 'SQL' | 'CSV' | 'XLSX' | 'UNKNOWN' {
  const n = String(name || '').trim().toLowerCase();
  if (n.endsWith('.sql')) return 'SQL';
  if (n.endsWith('.csv')) return 'CSV';
  if (n.endsWith('.xlsx') || n.endsWith('.xls')) return 'XLSX';
  return 'UNKNOWN';
}

export function FollowupImportPanel({
  currentUser,
  onReloadCustomers,
  onReloadQuotes,
  onMessage,
}: {
  currentUser: ApiAuthUser;
  onReloadCustomers: () => Promise<void>;
  onReloadQuotes: () => Promise<void>;
  onMessage: (msg: string) => void;
}) {
  const normalizedRole = normalizeRole(currentUser.role);
  const isAdmin = isAdminRole(currentUser.role);
  const [file, setFile] = useState<File | null>(null);
  const [sheetEntity, setSheetEntity] = useState<SheetEntity>('auto');
  const [jobId, setJobId] = useState<string | null>(null);
  const [uploadedJobId, setUploadedJobId] = useState<string | null>(null);
  const [jobFileType, setJobFileType] = useState<'SQL' | 'CSV' | 'XLSX' | 'UNKNOWN'>('UNKNOWN');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<PreviewJson | null>(null);
  const [jobs, setJobs] = useState<ImportJobRow[]>([]);
  const [lastRun, setLastRun] = useState<Record<string, unknown> | null>(null);

  const selectedFileType = inferFileType(file?.name);
  const effectiveFileType = jobFileType !== 'UNKNOWN' ? jobFileType : selectedFileType;
  const isSheetImport = effectiveFileType === 'CSV' || effectiveFileType === 'XLSX';
  const requiresEntityType = isSheetImport && sheetEntity === 'auto';
  const selectedEntityType = sheetEntity === 'auto' ? null : sheetEntity;

  const uploadDisabledReason = !isAdmin
    ? 'no_admin_permission'
    : busy
      ? 'busy'
      : !file
        ? 'missing_file'
        : isSheetImport && !selectedEntityType
          ? 'missing_entity_type_for_sheet'
      : 'ready';
  const previewDisabledReason = !isAdmin
    ? 'no_admin_permission'
    : busy
      ? 'busy'
      : !(uploadedJobId || jobId)
        ? 'missing_uploaded_job'
        : isSheetImport && !selectedEntityType
          ? 'missing_entity_type_for_sheet'
        : 'ready';
  const runDisabledReason = !isAdmin
    ? 'no_admin_permission'
    : busy
      ? 'busy'
      : !jobId
        ? 'missing_job'
        : isSheetImport && !selectedEntityType
          ? 'missing_entity_type_for_sheet'
          : !preview
            ? 'missing_preview'
          : 'ready';

  const loadJobs = useCallback(async () => {
    try {
      const res = await apiFetch(apiUrl('/followup-import/jobs'), { authUser: currentUser });
      if (!res.ok) return;
      const data = await res.json();
      setJobs(Array.isArray(data) ? data : []);
    } catch {
      /* ignore */
    }
  }, [currentUser]);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  const upload = async (): Promise<string | null> => {
    if (!isAdmin) {
      onMessage('מסך זה זמין רק למנהל מערכת');
      return null;
    }
    if (!file) {
      onMessage('בחר קובץ');
      return null;
    }
    if (isSheetImport && !selectedEntityType) {
      onMessage('יש לבחור סוג ישות בגיליון לפני העלאה');
      return null;
    }
    setBusy(true);
    setPreview(null);
    setLastRun(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiFetch(apiUrl('/followup-import/upload'), {
        method: 'POST',
        authUser: currentUser,
        body: fd,
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || res.statusText);
      }
      const job = await res.json();
      if (!job?.id) {
        throw new Error('תגובת העלאה חסרה מזהה עבודה (job id)');
      }
      setJobId(job.id as string);
      setUploadedJobId(job.id as string);
      setJobFileType(inferFileType(job.fileName) === 'UNKNOWN' ? (job.fileType || 'UNKNOWN') : inferFileType(job.fileName));
      onMessage(`הקובץ הועלה. מזהה עבודה: ${job.id.slice(0, 8)}…`);
      void loadJobs();
      return job.id as string;
    } catch (e: unknown) {
      onMessage(`העלאה נכשלה: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const runPreview = async () => {
    if (!isAdmin) {
      onMessage('מסך זה זמין רק למנהל מערכת');
      return;
    }
    if (isSheetImport && !selectedEntityType) {
      onMessage('יש לבחור סוג ישות בגיליון לפני preview/run');
      return;
    }
    let effectiveJobId = uploadedJobId || jobId;
    if (!effectiveJobId) {
      if (!file) {
        onMessage('יש לבחור קובץ');
        return;
      }
      effectiveJobId = await upload();
      if (!effectiveJobId) return;
    }
    setBusy(true);
    try {
      const res = await apiFetch(apiUrl(`/followup-import/${effectiveJobId}/preview`), {
        method: 'POST',
        authUser: currentUser,
        body: JSON.stringify({ sheetEntity }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setPreview(data as PreviewJson);
      onMessage('תצוגה מקדימה מוכנה');
      void loadJobs();
    } catch (e: unknown) {
      onMessage(`Preview נכשל: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const runImport = async () => {
    if (!isAdmin) {
      onMessage('מסך זה זמין רק למנהל מערכת');
      return;
    }
    const effectiveJobId = uploadedJobId || jobId;
    if (!effectiveJobId) {
      onMessage('יש לבצע העלאה לפני יבוא');
      return;
    }
    if (requiresEntityType) {
      onMessage('יש לבחור סוג ישות בגיליון לפני preview/run');
      return;
    }
    if (!window.confirm('לבצע ייבוא אמיתי ל-DB? פעולה זו אינה הפיכה באופן אוטומטי.')) return;
    setBusy(true);
    try {
      const res = await apiFetch(apiUrl(`/followup-import/${effectiveJobId}/run`), {
        method: 'POST',
        authUser: currentUser,
        body: JSON.stringify({ sheetEntity }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as Record<string, unknown>;
      setLastRun(data);
      onMessage('ייבוא הושלם (ראה סיכום ולוג)');
      await onReloadCustomers();
      await onReloadQuotes();
      void loadJobs();
    } catch (e: unknown) {
      onMessage(`ייבוא נכשל: ${e instanceof Error ? e.message : String(e)}`);
      void loadJobs();
    } finally {
      setBusy(false);
    }
  };

  const downloadErrors = async (jid: string) => {
    try {
      const res = await apiFetch(apiUrl(`/followup-import/jobs/${jid}/errors`), {
        authUser: currentUser,
      });
      if (!res.ok) return;
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `import-errors-${jid}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      onMessage('הורדת שגיאות נכשלה');
    }
  };

  const entityLabels: Record<string, string> = {
    customers: 'לקוחות',
    contacts: 'אנשי קשר',
    quotes: 'הצעות מחיר',
    orders: 'הזמנות',
    activities: 'פעילויות',
  };

  const btn =
    'rounded-2xl px-4 py-2 text-sm font-semibold transition disabled:opacity-50 disabled:pointer-events-none';
  const btnPrimary = `${btn} bg-slate-900 text-white hover:bg-slate-800`;
  const btnSecondary = `${btn} bg-slate-100 text-slate-800 hover:bg-slate-200`;
  const btnGhost = `${btn} bg-transparent text-slate-700 hover:bg-slate-100`;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="rounded-2xl border border-green-200 bg-green-50/40 p-5 shadow-sm">
        <h3 className="text-lg font-bold text-slate-900">ייבוא Followup (SQL / CSV / XLSX)</h3>
        {isAdmin ? (
          <p className="mt-1 text-sm text-slate-600">
            הקובץ נשמר בשרת; התצוגה המקדימה והייבוא נקראים מה-DB בפועל. לקובצי גיליון יש לבחור סוג ישות לפני
            preview/run.
          </p>
        ) : (
          <p className="mt-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            מסך זה זמין רק למנהל מערכת.
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            קובץ
            <input
              type="file"
              accept=".sql,.csv,.xlsx,.xls"
              className="max-w-xs text-xs"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                setPreview(null);
                setLastRun(null);
                setJobId(null);
                setUploadedJobId(null);
                setJobFileType(inferFileType(f?.name));
              }}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            סוג ישות (CSV / Excel)
            <select
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={sheetEntity}
              onChange={(e) => setSheetEntity(e.target.value as SheetEntity)}
            >
              <option value="auto">אוטומטי (רק SQL מלא)</option>
              <option value="customers">לקוחות</option>
              <option value="contacts">אנשי קשר</option>
              <option value="quotes">הצעות מחיר</option>
              <option value="orders">הזמנות</option>
              <option value="activities">פעילויות</option>
            </select>
          </label>
          <button
            type="button"
            className={btnPrimary}
            disabled={uploadDisabledReason !== 'ready'}
            onClick={() => void upload()}
          >
            העלאה
          </button>
          <button
            type="button"
            className={btnSecondary}
            disabled={previewDisabledReason !== 'ready'}
            onClick={() => void runPreview()}
          >
            תצוגה מקדימה
          </button>
          <button
            type="button"
            className={btnPrimary}
            disabled={runDisabledReason !== 'ready'}
            onClick={() => void runImport()}
          >
            בצע ייבוא
          </button>
        </div>
        {jobId && (
          <p className="mt-3 font-mono text-xs text-slate-500">
            jobId: <span className="select-all">{jobId}</span>
          </p>
        )}
        {requiresEntityType && (
          <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            יש לבחור סוג ישות בגיליון לפני preview/run.
          </p>
        )}
      </div>

      {preview && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h4 className="text-base font-bold text-slate-900">תוצאות preview</h4>
          <p className="text-xs text-slate-500">
            {preview.fileName} · {preview.fileType}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.entries(preview.counts || {}).map(([k, v]) => (
              <span
                key={k}
                className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700"
              >
                {entityLabels[k] || k}: {v}
              </span>
            ))}
          </div>
          {preview.warnings?.length ? (
            <div className="mt-4 max-h-48 overflow-auto rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-sm text-amber-900">
              <div className="mb-1 font-semibold">אזהרות</div>
              <ul className="list-disc space-y-1 pr-5">
                {preview.warnings.slice(0, 80).map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
              {preview.warnings.length > 80 && (
                <p className="mt-2 text-xs">…ועוד {preview.warnings.length - 80}</p>
              )}
            </div>
          ) : null}

          {(['customers', 'contacts', 'quotes', 'orders', 'activities'] as const).map((key) => {
            const rows = (preview.samples?.[key] as Record<string, unknown>[]) || [];
            if (!rows.length) return null;
            const keys = Object.keys(rows[0] || {}).slice(0, 8);
            return (
              <div key={key} className="mt-5 space-y-2">
                <div className="text-sm font-semibold text-slate-800">
                  דוגמאות — {entityLabels[key] || key} (עד 20)
                </div>
                <div className="overflow-x-auto rounded-xl border border-slate-100">
                  <table className="w-full min-w-[28rem] text-xs">
                    <thead className="bg-slate-50 text-right">
                      <tr>
                        {keys.map((h) => (
                          <th key={h} className="whitespace-nowrap px-2 py-2 font-semibold text-slate-700">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, ri) => (
                        <tr key={ri} className="border-t border-slate-100">
                          {keys.map((h) => (
                            <td key={h} className="max-w-[10rem] truncate px-2 py-1.5 text-slate-600">
                              {String(r[h] ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {lastRun != null && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h4 className="text-base font-bold text-slate-900">סיכום ייבוא אחרון</h4>
          <pre className="mt-2 overflow-x-auto rounded-xl bg-slate-900 p-3 text-xs text-green-100">
            {JSON.stringify(lastRun, null, 2)}
          </pre>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-row items-center justify-between gap-2">
          <h4 className="text-base font-bold text-slate-900">לוג ייבוא (שרת)</h4>
          <button type="button" className={btnSecondary} onClick={() => void loadJobs()}>
            רענן
          </button>
        </div>
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full min-w-[36rem] text-xs">
            <thead className="bg-slate-50 text-right">
              <tr>
                <th className="px-2 py-2 font-semibold">תאריך</th>
                <th className="px-2 py-2 font-semibold">קובץ</th>
                <th className="px-2 py-2 font-semibold">סוג</th>
                <th className="px-2 py-2 font-semibold">סטטוס</th>
                <th className="px-2 py-2 font-semibold">שגיאות</th>
                <th className="px-2 py-2 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} className="border-t border-slate-100">
                  <td className="whitespace-nowrap px-2 py-2">{new Date(j.createdAt).toLocaleString('he-IL')}</td>
                  <td className="max-w-[12rem] truncate px-2 py-2">{j.fileName}</td>
                  <td className="px-2 py-2">{j.fileType}</td>
                  <td
                    className={cn(
                      'px-2 py-2 font-medium',
                      j.status === 'FAILED' && 'text-red-600',
                      j.status === 'COMPLETED' && 'text-green-700',
                    )}
                  >
                    {j.status}
                  </td>
                  <td className="px-2 py-2">{j._count?.errors ?? 0}</td>
                  <td className="px-2 py-2 text-left">
                    {(j._count?.errors ?? 0) > 0 && (
                      <button type="button" className={btnGhost} onClick={() => void downloadErrors(j.id)}>
                        הורד JSON
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {jobs.length === 0 && <p className="mt-2 text-sm text-slate-500">אין עדיין עבודות ייבוא.</p>}
      </div>
    </div>
  );
}
