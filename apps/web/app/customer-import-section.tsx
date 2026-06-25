'use client';

import { apiUrl, apiFetch } from './lib/api-base';
import React, { useCallback, useMemo, useState } from 'react';
import { FileDown, FileSpreadsheet, Upload } from 'lucide-react';
import {
  formatIsraeliPhone,
  getCell,
  normalizeEmail,
  normalizeIsraeliPhoneDigits,
  parseSpreadsheetFile,
  validateEmail,
} from './lib/import-spreadsheet';

const GALIT_PRIMARY = '#4ba647';

export type ImportCustomerRow = {
  id: string;
  name: string;
  type: string;
  contactName: string;
  phone: string;
  email: string;
  city: string;
  address?: string | null;
  status: string;
  services: string[];
  notes?: string | null;
  importLegacyId?: string | null;
};

export type ImportClassification = {
  id: string;
  code: string;
  labelHe: string;
  sortOrder: number;
  isPreset: boolean;
};

export type ImportTargetKey =
  | 'name'
  | 'phone'
  | 'email'
  | 'address'
  | 'city'
  | 'type'
  | 'contactName'
  | 'notes'
  | 'importLegacyId';

const IMPORT_TARGET_KEYS: ImportTargetKey[] = [
  'name',
  'phone',
  'email',
  'address',
  'city',
  'type',
  'contactName',
  'notes',
  'importLegacyId',
];

const IMPORT_FIELD_LABELS: Record<ImportTargetKey, string> = {
  name: 'שם לקוח',
  phone: 'טלפון',
  email: 'אימייל',
  address: 'כתובת',
  city: 'עיר',
  type: 'סיווג',
  contactName: 'איש קשר',
  notes: 'הערות',
  importLegacyId: 'מזהה ישן (legacy / external)',
};

export type DuplicateStrategy = 'skip' | 'update' | 'create_new' | 'flag_review';

type Step = 'upload' | 'map' | 'preview' | 'done';

type RowPlan = {
  rowIndex: number;
  name: string;
  phone: string;
  email: string;
  city: string;
  address: string;
  typeCode: string;
  contactName: string;
  notes: string;
  importLegacyId: string;
  duplicate: ImportCustomerRow | null;
  fileDuplicate?: boolean;
  action: 'create' | 'update' | 'skip' | 'flag' | 'create_new' | 'error';
  errors: string[];
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function guessMapping(headers: string[]): Record<ImportTargetKey, string> {
  const h = headers.map((x) => x.trim());
  const pick = (pred: (col: string) => boolean) => h.find(pred) || '';
  return {
    name: pick((c) => /שם.*לקוח|^לקוח$|^name$/i.test(c) || c === 'שם') || h[0] || '',
    phone: pick((c) => /טלפון|phone|נייד|סלולר|mobile/i.test(c)),
    email: pick((c) => /אימייל|email|מייל/i.test(c)),
    address: pick((c) => /כתובת|address|רחוב/i.test(c)),
    city: pick((c) => /^עיר|city/i.test(c)),
    type: pick((c) => /סיווג|סוג|type|classification/i.test(c)),
    contactName: pick((c) => /איש קשר|contact|א\.ק/i.test(c)),
    notes: pick((c) => /הערות|notes|comment|תיאור/i.test(c)),
    importLegacyId: pick((c) => /legacy|external|מזהה.*ישן|מזהה חיצוני/i.test(c)),
  };
}

function resolveClassificationCode(raw: string, classifications: ImportClassification[]): string {
  const t = (raw || '').trim();
  if (!t) return 'COMPANY';
  const up = t.toUpperCase();
  const byCode = classifications.find((c) => c.code.toUpperCase() === up);
  if (byCode) return byCode.code;
  const byLabel = classifications.find((c) => c.labelHe.trim() === t);
  if (byLabel) return byLabel.code;
  const loose = classifications.find(
    (c) => c.labelHe.includes(t) || t.includes(c.labelHe) || c.labelHe.toLowerCase() === t.toLowerCase(),
  );
  if (loose) return loose.code;
  return 'COMPANY';
}

function findDuplicate(
  name: string,
  phoneDigits: string,
  emailNorm: string,
  legacy: string,
  pool: ImportCustomerRow[],
): ImportCustomerRow | null {
  const nn = name.trim().toLowerCase();
  const leg = (legacy || '').trim();
  for (const c of pool) {
    const cLeg = (c.importLegacyId || '').toString().trim();
    if (leg && cLeg && leg === cLeg) return c;
    const p = normalizeIsraeliPhoneDigits(c.phone || '');
    const e = normalizeEmail(c.email || '');
    const cn = (c.name || '').trim().toLowerCase();
    if (phoneDigits && p && phoneDigits === p) return c;
    if (emailNorm && e && emailNorm === e) return c;
    if (nn && cn && nn === cn) return c;
  }
  return null;
}

function buildRowPlans(
  rows: string[][],
  headers: string[],
  mapping: Record<ImportTargetKey, string>,
  customers: ImportCustomerRow[],
  classifications: ImportClassification[],
  strategy: DuplicateStrategy,
): RowPlan[] {
  const seenPhone = new Set<string>();
  const plans: RowPlan[] = [];

  rows.forEach((row, idx) => {
    const name = getCell(row, headers, mapping.name);
    const phoneRaw = getCell(row, headers, mapping.phone);
    const emailRaw = getCell(row, headers, mapping.email);
    const city = getCell(row, headers, mapping.city);
    const address = getCell(row, headers, mapping.address);
    const typeRaw = getCell(row, headers, mapping.type);
    const contactName = getCell(row, headers, mapping.contactName);
    const notes = getCell(row, headers, mapping.notes);
    const importLegacyId = getCell(row, headers, mapping.importLegacyId);

    const errors: string[] = [];
    if (!name.trim()) errors.push('חסר שם לקוח');
    if (!phoneRaw.trim()) errors.push('חסר טלפון');
    const phoneFormatted = formatIsraeliPhone(phoneRaw);
    if (phoneRaw.trim() && !phoneFormatted) errors.push('טלפון לא תקין');
    const emailNorm = emailRaw ? normalizeEmail(emailRaw) : '';
    if (emailRaw.trim() && !validateEmail(emailNorm)) errors.push('אימייל לא תקין');

    const typeCode = errors.length ? 'COMPANY' : resolveClassificationCode(typeRaw, classifications);

    const phoneDigits = phoneFormatted ? normalizeIsraeliPhoneDigits(phoneFormatted) : '';

    let fileDuplicate = false;
    if (phoneDigits) {
      if (seenPhone.has(phoneDigits)) fileDuplicate = true;
      seenPhone.add(phoneDigits);
    }

    const dup =
      errors.length > 0 ? null : findDuplicate(name, phoneDigits, emailNorm, importLegacyId, customers);

    let action: RowPlan['action'] = 'create';
    if (errors.length) action = 'error';
    else if (dup) {
      if (strategy === 'skip') action = 'skip';
      else if (strategy === 'update') action = 'update';
      else if (strategy === 'create_new') action = 'create_new';
      else action = 'flag';
    }

    plans.push({
      rowIndex: idx + 2,
      name: name.trim(),
      phone: phoneFormatted || phoneRaw,
      email: emailNorm,
      city: city.trim(),
      address: address.trim(),
      typeCode,
      contactName: contactName.trim(),
      notes: notes.trim(),
      importLegacyId: importLegacyId.trim(),
      duplicate: dup,
      fileDuplicate,
      action,
      errors,
    });
  });

  return plans;
}

function actionLabel(a: RowPlan['action']) {
  const map: Record<string, string> = {
    create: 'יצירה חדשה',
    update: 'עדכון לקוח קיים',
    skip: 'דילוג',
    flag: 'סימון לבדיקה',
    create_new: 'יצירה (מתעלם מכפילות)',
    error: 'שגיאה',
  };
  return map[a] || a;
}

export function CustomerImportSection({
  getAuthHeaders,
  customers,
  onReloadCustomers,
  classifications,
  typeLabelMap,
  onMessage,
}: {
  getAuthHeaders: () => Record<string, string>;
  customers: ImportCustomerRow[];
  onReloadCustomers: () => Promise<void>;
  classifications: ImportClassification[];
  typeLabelMap: Record<string, string>;
  onMessage?: (msg: string) => void;
}) {
  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<ImportTargetKey, string>>({
    name: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    type: '',
    contactName: '',
    notes: '',
    importLegacyId: '',
  });
  const [duplicateStrategy, setDuplicateStrategy] = useState<DuplicateStrategy>('skip');
  const [parseError, setParseError] = useState('');
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<{
    created: number;
    updated: number;
    skipped: number;
    flagged: number;
    errors: number;
  } | null>(null);

  const plans = useMemo(() => {
    if (!headers.length || !rows.length) return [];
    return buildRowPlans(rows, headers, mapping, customers, classifications, duplicateStrategy);
  }, [rows, headers, mapping, customers, classifications, duplicateStrategy]);

  const executablePlans = useMemo(() => plans.filter((p) => p.action !== 'error'), [plans]);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setParseError('');
    setSummary(null);
    setStep('upload');
    try {
      const { headers: h, rows: r } = await parseSpreadsheetFile(file);
      if (!h.length || !r.length) {
        setParseError('הקובץ ריק או לא נקרא — בדקו פורמט CSV / Excel.');
        return;
      }
      if (r.length > 5000) {
        setParseError('יותר מ-5000 שורות — יש לפצל את הקובץ.');
        return;
      }
      setFileName(file.name);
      setHeaders(h);
      setRows(r);
      setMapping(guessMapping(h));
      setStep('map');
      onMessage?.('הקובץ נטען — נא למפות עמודות');
    } catch {
      setParseError('קריאת הקובץ נכשלה.');
    }
  };

  const downloadTemplate = () => {
    const header =
      'שם לקוח,טלפון,אימייל,כתובת,עיר,סיווג,איש קשר,הערות,legacyId';
    const example =
      'דוגמה בע״מ,050-1234567,info@example.com,רחוב הרצל 10,תל אביב,COMPANY,ישראל ישראלי,הערה לדוגמה,CUST-OLD-001';
    const csv = `\uFEFF${header}\n${example}\n`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'תבנית_ייבוא_לקוחות.csv';
    a.click();
    URL.revokeObjectURL(a.href);
    onMessage?.('התבנית הורדה');
  };

  const runImport = useCallback(async () => {
    if (!plans.length) return;
    setBusy(true);
    setSummary(null);
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let flagged = 0;
    let errors = 0;
    const mutablePool: ImportCustomerRow[] = [...customers];

    const headersAuth = getAuthHeaders();

    try {
      for (const p of plans) {
        if (p.action === 'error') {
          errors += 1;
          continue;
        }
        if (p.action === 'skip') {
          skipped += 1;
          continue;
        }

        const dupLive = findDuplicate(
          p.name,
          normalizeIsraeliPhoneDigits(p.phone),
          p.email,
          p.importLegacyId,
          mutablePool,
        );
        const targetDup = dupLive || p.duplicate;

        try {
          if (p.action === 'update') {
            const id = targetDup?.id;
            if (!id) {
              errors += 1;
              continue;
            }
            const body: Record<string, unknown> = {
              name: p.name,
              contactName: p.contactName || p.name,
              phone: p.phone,
              email: p.email,
              city: p.city,
              address: p.address || null,
              type: p.typeCode,
              notes: p.notes || null,
              ...(p.importLegacyId ? { importLegacyId: p.importLegacyId } : {}),
            };
            const res = await apiFetch(apiUrl(`/customers/${id}`), {
              method: 'PATCH',
              headers: headersAuth,
              body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error();
            const updatedCust = await res.json();
            const i = mutablePool.findIndex((c) => c.id === id);
            if (i >= 0) mutablePool[i] = updatedCust;
            else mutablePool.push(updatedCust);
            updated += 1;
            continue;
          }

          if (p.action === 'create' || p.action === 'create_new') {
            const body = {
              name: p.name,
              type: p.typeCode,
              contactName: p.contactName || p.name,
              phone: p.phone,
              email: p.email || '',
              city: p.city,
              address: p.address || null,
              status: 'ACTIVE',
              services: [] as string[],
              notes: p.notes || '',
            };
            const res = await apiFetch(apiUrl('/customers'), {
              method: 'POST',
              headers: headersAuth,
              body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error();
            const createdCust = await res.json();
            mutablePool.push(createdCust);
            created += 1;
            continue;
          }

          if (p.action === 'flag') {
            const flagNotes =
              `[ייבוא לבדיקה] ${targetDup ? `כפילות אפשרית עם "${targetDup.name}" (${targetDup.id}).` : 'סימון ידני.'}\n${p.notes || ''}`.trim();
            const body = {
              name: p.name,
              type: p.typeCode,
              contactName: p.contactName || p.name,
              phone: p.phone,
              email: p.email || '',
              city: p.city,
              address: p.address || null,
              status: 'ACTIVE',
              services: [] as string[],
              notes: flagNotes,
              ...(p.importLegacyId ? { importLegacyId: p.importLegacyId } : {}),
            };
            const res = await apiFetch(apiUrl('/customers'), {
              method: 'POST',
              headers: headersAuth,
              body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error();
            const createdCust = await res.json();
            mutablePool.push(createdCust);
            flagged += 1;
          }
        } catch {
          errors += 1;
        }
      }

      await onReloadCustomers();
      setSummary({ created, updated, skipped, flagged, errors });
      setStep('done');
      onMessage?.('ייבוא הושלם — נא לבדוק סיכום');
    } finally {
      setBusy(false);
    }
  }, [plans, customers, getAuthHeaders, onReloadCustomers, onMessage]);

  const resetFlow = () => {
    setStep('upload');
    setFileName('');
    setHeaders([]);
    setRows([]);
    setMapping({
      name: '',
      phone: '',
      email: '',
      address: '',
      city: '',
      type: '',
      contactName: '',
      notes: '',
      importLegacyId: '',
    });
    setParseError('');
    setSummary(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-xl">
          <FileSpreadsheet className="h-6 w-6 text-green-700" />
          ייבוא לקוחות ממערכת אחרת
        </CardTitle>
        <p className="text-sm text-slate-600">
          העלאת CSV או Excel (.xlsx), מיפוי עמודות, תצוגה מקדימה ובדיקת כפילויות לפני שמירה במערכת.
        </p>
      </CardHeader>
      <CardContent className="space-y-6" dir="rtl">
        {parseError && (
          <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800">{parseError}</div>
        )}

        {step === 'upload' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border-2 border-dashed border-green-300 bg-green-50/50 px-5 py-4 transition hover:bg-green-50">
                <Upload className="h-5 w-5 text-green-700" />
                <span className="font-semibold text-slate-800">בחר קובץ CSV או Excel</span>
                <input
                  type="file"
                  accept=".csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                  className="hidden"
                  onChange={(e) => void onFile(e)}
                />
              </label>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                onClick={downloadTemplate}
              >
                <FileDown className="h-4 w-4" />
                הורד תבנית ייבוא (CSV)
              </button>
            </div>
            <p className="text-sm text-slate-500">
              נתמכים: קבצי <strong>.csv</strong> (UTF-8) ו-<strong>.xlsx</strong>. עד 5000 שורות נתונים.
            </p>
          </div>
        )}

        {(step === 'map' || step === 'preview' || step === 'done') && (
          <div className="rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3 text-sm text-slate-700">
            קובץ: <span className="font-semibold">{fileName || '—'}</span> · {rows.length} שורות נתונים
          </div>
        )}

        {step === 'map' && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-slate-900">מיפוי עמודות</h3>
            <p className="text-sm text-slate-600">בחרו לכל שדה במערכת מאיזו עמודה בקובץ לקרוא (שם לקוח וטלפון נדרשים לשורה תקינה).</p>
            <div className="grid gap-3 md:grid-cols-2">
              {IMPORT_TARGET_KEYS.map((key) => (
                <div key={key} className="flex flex-col gap-1">
                  <label className="text-sm font-semibold text-slate-800">{IMPORT_FIELD_LABELS[key]}</label>
                  <select
                    className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                    value={mapping[key]}
                    onChange={(e) => setMapping((m) => ({ ...m, [key]: e.target.value }))}
                  >
                    <option value="">— לא ממופה —</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-2xl px-5 py-2.5 text-sm font-semibold text-white shadow"
                style={{ background: GALIT_PRIMARY }}
                onClick={() => setStep('preview')}
                disabled={!mapping.name || !mapping.phone}
              >
                המשך לתצוגה מקדימה
              </button>
              <button type="button" className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm" onClick={resetFlow}>
                התחל מחדש
              </button>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-slate-900">תצוגה מקדימה ובדיקות</h3>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-2 text-sm font-semibold text-slate-800">טיפול בכפילויות (לפי טלפון, אימייל או שם לקוח)</div>
              <select
                className="w-full max-w-md rounded-2xl border border-slate-200 px-3 py-2.5 text-sm"
                value={duplicateStrategy}
                onChange={(e) => setDuplicateStrategy(e.target.value as DuplicateStrategy)}
              >
                <option value="skip">דלג על שורות עם כפילות</option>
                <option value="update">עדכן לקוח קיים (לפי התאמה ראשונה)</option>
                <option value="create_new">צור רשומה חדשה בכל מקרה</option>
                <option value="flag_review">סמן לבדיקה (יוצר לקוח עם הערת &quot;ייבוא לבדיקה&quot;)</option>
              </select>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full min-w-[720px] text-right text-sm">
                <thead className="bg-green-50/90">
                  <tr>
                    <th className="px-2 py-2">#</th>
                    <th className="px-2 py-2">שם</th>
                    <th className="px-2 py-2">טלפון</th>
                    <th className="px-2 py-2">אימייל</th>
                    <th className="px-2 py-2">סיווג</th>
                    <th className="px-2 py-2">פעולה</th>
                    <th className="px-2 py-2">הערות</th>
                  </tr>
                </thead>
                <tbody>
                  {plans.slice(0, 80).map((p) => (
                    <tr key={p.rowIndex} className={cn('border-t border-slate-100', p.errors.length ? 'bg-red-50/50' : '')}>
                      <td className="px-2 py-1.5 tabular-nums">{p.rowIndex}</td>
                      <td className="px-2 py-1.5">{p.name || '—'}</td>
                      <td className="px-2 py-1.5">{p.phone || '—'}</td>
                      <td className="px-2 py-1.5">{p.email || '—'}</td>
                      <td className="px-2 py-1.5">{typeLabelMap[p.typeCode] || p.typeCode}</td>
                      <td className="px-2 py-1.5 font-medium">
                        {actionLabel(p.action)}
                        {p.fileDuplicate ? <span className="mr-1 text-amber-700"> (כפילות בקובץ)</span> : null}
                      </td>
                      <td className="max-w-[200px] truncate px-2 py-1.5 text-xs text-slate-600">
                        {p.errors.length ? p.errors.join(' · ') : p.notes || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {plans.length > 80 && (
                <div className="border-t border-slate-100 px-3 py-2 text-center text-xs text-slate-500">
                  מוצגות 80 שורות ראשונות מתוך {plans.length}
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2 text-sm text-slate-700">
              <span>
                שורות לייבוא בפועל: <strong>{executablePlans.filter((x) => x.action !== 'skip').length}</strong>
              </span>
              ·<span>שגיאות וולידציה: <strong>{plans.filter((x) => x.errors.length).length}</strong></span>
              ·<span>דילוגים צפויים: <strong>{plans.filter((x) => x.action === 'skip').length}</strong></span>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-2xl px-5 py-2.5 text-sm font-semibold text-white shadow disabled:opacity-50"
                style={{ background: GALIT_PRIMARY }}
                disabled={busy || !executablePlans.some((x) => ['create', 'update', 'create_new', 'flag'].includes(x.action))}
                onClick={() => void runImport()}
              >
                {busy ? 'מייבא...' : 'אשר וייבא למערכת'}
              </button>
              <button type="button" className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm" onClick={() => setStep('map')}>
                חזרה למיפוי
              </button>
              <button type="button" className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm" onClick={resetFlow}>
                ביטול
              </button>
            </div>
          </div>
        )}

        {step === 'done' && summary && (
          <div className="space-y-3 rounded-2xl border border-green-200 bg-green-50/60 p-5">
            <h3 className="text-lg font-bold text-green-900">סיכום ייבוא</h3>
            <ul className="list-inside list-disc space-y-1 text-sm text-green-950">
              <li>נוצרו: {summary.created}</li>
              <li>עודכנו: {summary.updated}</li>
              <li>דולגו: {summary.skipped}</li>
              <li>סומנו לבדיקה: {summary.flagged}</li>
              <li>שגיאות בביצוע: {summary.errors}</li>
            </ul>
            <button
              type="button"
              className="rounded-2xl border border-green-300 bg-white px-4 py-2 text-sm font-semibold text-green-900"
              onClick={resetFlow}
            >
              ייבוא נוסף
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('rounded-3xl border border-slate-200 bg-white shadow-sm', className)}>{children}</div>;
}

function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('border-b border-slate-100 p-5', className)}>{children}</div>;
}

function CardTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('font-bold text-slate-900', className)}>{children}</div>;
}

function CardContent({ children, className, dir }: { children: React.ReactNode; className?: string; dir?: 'rtl' | 'ltr' }) {
  return (
    <div className={cn('p-5', className)} dir={dir}>
      {children}
    </div>
  );
}
