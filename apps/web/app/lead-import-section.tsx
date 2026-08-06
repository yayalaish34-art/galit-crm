'use client';

import { apiUrl, apiFetch } from './lib/api-base';
import { formatIsraeliPhoneDisplay } from './lib/phone-format';
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

const VALID_LEAD_STATUS = [
  'NEW',
  'CONTACTED',
  'FU_1',
  'FU_2',
  'QUOTE_SENT',
  'NEGOTIATION',
  'WON',
  'LOST',
  'NOT_RELEVANT',
] as const;

export type ImportLeadPoolRow = {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  importLegacyId?: string | null;
};

export type DuplicateStrategy = 'skip' | 'update' | 'create_new' | 'flag_review';

type LeadTargetKey =
  | 'fullName'
  | 'phone'
  | 'email'
  | 'source'
  | 'leadStatus'
  | 'serviceType'
  | 'assignedUserEmail'
  | 'nextFollowUpDate'
  | 'importLegacyId'
  | 'customerLegacyId'
  | 'projectLegacyId'
  | 'notes';

const LEAD_TARGET_KEYS: LeadTargetKey[] = [
  'fullName',
  'phone',
  'email',
  'source',
  'leadStatus',
  'serviceType',
  'assignedUserEmail',
  'nextFollowUpDate',
  'importLegacyId',
  'customerLegacyId',
  'projectLegacyId',
  'notes',
];

const LEAD_FIELD_LABELS: Record<LeadTargetKey, string> = {
  fullName: 'שם',
  phone: 'טלפון',
  email: 'אימייל',
  source: 'מקור',
  leadStatus: 'סטטוס (leadStatus)',
  serviceType: 'שירות מבוקש',
  assignedUserEmail: 'מטפל (אימייל משתמש)',
  nextFollowUpDate: 'תאריך פולואפ',
  importLegacyId: 'מזהה ישן (legacy)',
  customerLegacyId: 'מזהה לקוח ישן (לקישור)',
  projectLegacyId: 'מזהה פרויקט ישן (לקישור)',
  notes: 'הערות',
};

type Step = 'upload' | 'map' | 'preview' | 'done';

type RowPlan = {
  rowIndex: number;
  fullName: string;
  phone: string;
  email: string;
  source: string;
  leadStatus: string;
  serviceType: string;
  assignedUserEmail: string;
  assignedUserId: string | null;
  nextFollowUpDate: string;
  importLegacyId: string;
  customerLegacyId: string;
  projectLegacyId: string;
  customerId: string | null;
  projectId: string | null;
  notes: string;
  duplicate: ImportLeadPoolRow | null;
  fileDuplicate?: boolean;
  action: 'create' | 'update' | 'skip' | 'flag' | 'create_new' | 'error';
  errors: string[];
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function guessLeadMapping(headers: string[]): Record<LeadTargetKey, string> {
  const h = headers.map((x) => x.trim());
  const pick = (pred: (col: string) => boolean) => h.find(pred) || '';
  return {
    fullName: pick((c) => /שם|fullName|^name$/i.test(c)) || h[0] || '',
    phone: pick((c) => /טלפון|phone|נייד/i.test(c)),
    email: pick((c) => /אימייל|email|מייל/i.test(c)),
    source: pick((c) => /מקור|source|utm/i.test(c)),
    leadStatus: pick((c) => /סטטוס|status|leadStatus/i.test(c)),
    serviceType: pick((c) => /שירות|service|serviceType/i.test(c)),
    assignedUserEmail: pick((c) => /מטפל|assigned|אחראי|user.*mail/i.test(c)),
    nextFollowUpDate: pick((c) => /פולואפ|follow|nextFollow/i.test(c)),
    importLegacyId: pick((c) => /legacy|external|מזהה.*ישן/i.test(c)),
    customerLegacyId: pick((c) => /לקוח.*ישן|customer.*legacy|customerId.*old/i.test(c)),
    projectLegacyId: pick((c) => /פרויקט.*ישן|project.*legacy|projectId.*old/i.test(c)),
    notes: pick((c) => /הערות|notes/i.test(c)),
  };
}

function findDupLead(
  nameNorm: string,
  phoneDigits: string,
  emailNorm: string,
  legacy: string,
  pool: ImportLeadPoolRow[],
): ImportLeadPoolRow | null {
  const leg = (legacy || '').trim();
  for (const l of pool) {
    const lLeg = (l.importLegacyId || '').toString().trim();
    if (leg && lLeg && leg === lLeg) return l;
    const p = normalizeIsraeliPhoneDigits(l.phone || '');
    const e = normalizeEmail(l.email || '');
    const n = (l.name || '').trim().toLowerCase();
    if (phoneDigits && p && phoneDigits === p) return l;
    if (emailNorm && e && emailNorm === e) return l;
    if (nameNorm && n && nameNorm === n) return l;
  }
  return null;
}

function resolveCustomerId(
  raw: string,
  customers: Array<{ id: string; importLegacyId?: string | null }>,
): string | null {
  const t = (raw || '').trim();
  if (!t) return null;
  const byLeg = customers.find((c) => (c.importLegacyId || '').toString().trim() === t);
  if (byLeg) return byLeg.id;
  const byId = customers.find((c) => c.id === t);
  return byId?.id ?? null;
}

function resolveProjectId(
  raw: string,
  projects: Array<{ id: string; importLegacyId?: string | null }>,
): string | null {
  const t = (raw || '').trim();
  if (!t) return null;
  const byLeg = projects.find((p) => (p.importLegacyId || '').toString().trim() === t);
  if (byLeg) return byLeg.id;
  const byId = projects.find((p) => p.id === t);
  return byId?.id ?? null;
}

function resolveUserIdByEmail(
  email: string,
  users: Array<{ id: string; email: string }>,
): string | null {
  const n = normalizeEmail(email);
  if (!n) return null;
  const u = users.find((x) => normalizeEmail(x.email) === n);
  return u?.id ?? null;
}

function buildLeadPlans(
  rows: string[][],
  headers: string[],
  mapping: Record<LeadTargetKey, string>,
  pool: ImportLeadPoolRow[],
  customers: Array<{ id: string; importLegacyId?: string | null }>,
  projects: Array<{ id: string; importLegacyId?: string | null }>,
  users: Array<{ id: string; email: string }>,
  strategy: DuplicateStrategy,
): RowPlan[] {
  const seenPhone = new Set<string>();
  const plans: RowPlan[] = [];

  rows.forEach((row, idx) => {
    const fullName = getCell(row, headers, mapping.fullName);
    const phoneRaw = getCell(row, headers, mapping.phone);
    const emailRaw = getCell(row, headers, mapping.email);
    const source = getCell(row, headers, mapping.source);
    const leadStatus = getCell(row, headers, mapping.leadStatus);
    const serviceType = getCell(row, headers, mapping.serviceType);
    const assignedUserEmail = getCell(row, headers, mapping.assignedUserEmail);
    const nextFollowUpDate = getCell(row, headers, mapping.nextFollowUpDate);
    const importLegacyId = getCell(row, headers, mapping.importLegacyId);
    const customerLegacyId = getCell(row, headers, mapping.customerLegacyId);
    const projectLegacyId = getCell(row, headers, mapping.projectLegacyId);
    const notes = getCell(row, headers, mapping.notes);

    const errors: string[] = [];
    if (!fullName.trim()) errors.push('חסר שם');
    const phoneFormatted = formatIsraeliPhone(phoneRaw);
    if (phoneRaw.trim() && !phoneFormatted) errors.push('טלפון לא תקין');
    const emailNorm = emailRaw ? normalizeEmail(emailRaw) : '';
    if (emailRaw.trim() && !validateEmail(emailNorm)) errors.push('אימייל לא תקין');

    const phoneDigits = phoneFormatted ? normalizeIsraeliPhoneDigits(phoneFormatted) : '';
    let fileDuplicate = false;
    if (phoneDigits) {
      if (seenPhone.has(phoneDigits)) fileDuplicate = true;
      seenPhone.add(phoneDigits);
    }

    const customerId = resolveCustomerId(customerLegacyId, customers);
    const projectId = resolveProjectId(projectLegacyId, projects);
    const assignedUserId = resolveUserIdByEmail(assignedUserEmail, users);

    if (customerLegacyId.trim() && !customerId) errors.push('לקוח לפי מזהה ישן לא נמצא');
    if (projectLegacyId.trim() && !projectId) errors.push('פרויקט לפי מזהה ישן לא נמצא');
    if (assignedUserEmail.trim() && !assignedUserId) errors.push('משתמש (אימייל) לא נמצא');

    const nameNorm = fullName.trim().toLowerCase();
    const dup =
      errors.length > 0 ? null : findDupLead(nameNorm, phoneDigits, emailNorm, importLegacyId, pool);

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
      fullName: fullName.trim(),
      phone: phoneFormatted || phoneRaw,
      email: emailNorm,
      source: source.trim(),
      leadStatus,
      serviceType: serviceType.trim(),
      assignedUserEmail: assignedUserEmail.trim(),
      assignedUserId,
      nextFollowUpDate: nextFollowUpDate.trim(),
      importLegacyId: importLegacyId.trim(),
      customerLegacyId: customerLegacyId.trim(),
      projectLegacyId: projectLegacyId.trim(),
      customerId,
      projectId,
      notes: notes.trim(),
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
    update: 'עדכון ליד קיים',
    skip: 'דילוג',
    flag: 'סימון לבדיקה',
    create_new: 'יצירה (מתעלם מכפילות)',
    error: 'שגיאה',
  };
  return map[a] || a;
}

export function LeadImportSection({
  getAuthHeaders,
  leads,
  customers,
  projects,
  users,
  onReloadLeads,
  onMessage,
}: {
  getAuthHeaders: () => Record<string, string>;
  leads: ImportLeadPoolRow[];
  customers: Array<{ id: string; importLegacyId?: string | null }>;
  projects: Array<{ id: string; importLegacyId?: string | null }>;
  users: Array<{ id: string; email: string }>;
  onReloadLeads: () => Promise<void>;
  onMessage?: (msg: string) => void;
}) {
  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<LeadTargetKey, string>>({
    fullName: '',
    phone: '',
    email: '',
    source: '',
    leadStatus: '',
    serviceType: '',
    assignedUserEmail: '',
    nextFollowUpDate: '',
    importLegacyId: '',
    customerLegacyId: '',
    projectLegacyId: '',
    notes: '',
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
    return buildLeadPlans(rows, headers, mapping, leads, customers, projects, users, duplicateStrategy);
  }, [rows, headers, mapping, leads, customers, projects, users, duplicateStrategy]);

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
      setMapping(guessLeadMapping(h));
      setStep('map');
      onMessage?.('הקובץ נטען — נא למפות עמודות');
    } catch {
      setParseError('קריאת הקובץ נכשלה.');
    }
  };

  const downloadTemplate = () => {
    const header =
      'שם,טלפון,אימייל,מקור,סטטוס,שירות,מטפל_אימייל,פולואפ,legacyId,לקוח_legacy,פרויקט_legacy,הערות';
    const example =
      'ישראל ישראלי,050-1112233,a@b.co.il,טלפון,NEW,קרינה,manager@galit.local,2025-04-01,LEAD-1,CUST-OLD-1,,הערה';
    const csv = `\uFEFF${header}\n${example}\n`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'תבנית_ייבוא_לידים.csv';
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
    const mutablePool: ImportLeadPoolRow[] = [...leads];
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

        const dupLive = findDupLead(
          p.fullName.trim().toLowerCase(),
          normalizeIsraeliPhoneDigits(p.phone),
          p.email,
          p.importLegacyId,
          mutablePool,
        );
        const targetDup = dupLive || p.duplicate;

        let nextFollowIso: string | null = null;
        if (p.nextFollowUpDate.trim()) {
          const d = new Date(p.nextFollowUpDate);
          if (!Number.isNaN(d.getTime())) nextFollowIso = d.toISOString();
        }
        const baseBody: Record<string, unknown> = {
          fullName: p.fullName,
          phone: p.phone || null,
          email: p.email || null,
          source: p.source || null,
          leadStatus: p.leadStatus || 'NEW',
          serviceType: p.serviceType || null,
          nextFollowUpDate: nextFollowIso,
          notes: p.notes || null,
          customerId: p.customerId,
          projectId: p.projectId,
          assignedUserId: p.assignedUserId,
        };
        if (p.importLegacyId) baseBody.importLegacyId = p.importLegacyId;

        try {
          if (p.action === 'update') {
            const id = targetDup?.id;
            if (!id) {
              errors += 1;
              continue;
            }
            const res = await apiFetch(apiUrl(`/leads/${id}`), {
              method: 'PATCH',
              headers: headersAuth,
              body: JSON.stringify(baseBody),
            });
            if (!res.ok) throw new Error();
            const updatedLead = await res.json();
            const dispName =
              updatedLead.fullName ||
              `${updatedLead.firstName || ''} ${updatedLead.lastName || ''}`.trim() ||
              'ליד';
            const i = mutablePool.findIndex((x) => x.id === id);
            const row: ImportLeadPoolRow = {
              id,
              name: dispName,
              phone: updatedLead.phone || '',
              email: updatedLead.email,
              importLegacyId: updatedLead.importLegacyId,
            };
            if (i >= 0) mutablePool[i] = row;
            else mutablePool.push(row);
            updated += 1;
            continue;
          }

          if (p.action === 'create' || p.action === 'create_new') {
            const res = await apiFetch(apiUrl('/leads'), {
              method: 'POST',
              headers: headersAuth,
              body: JSON.stringify(baseBody),
            });
            if (!res.ok) throw new Error();
            const createdLead = await res.json();
            const dispName =
              createdLead.fullName ||
              `${createdLead.firstName || ''} ${createdLead.lastName || ''}`.trim() ||
              'ליד';
            mutablePool.push({
              id: createdLead.id,
              name: dispName,
              phone: createdLead.phone || '',
              email: createdLead.email,
              importLegacyId: createdLead.importLegacyId,
            });
            created += 1;
            continue;
          }

          if (p.action === 'flag') {
            const flagNotes =
              `[ייבוא לבדיקה] ${targetDup ? `כפילות אפשרית עם ליד "${targetDup.name}".` : 'סימון ידני.'}\n${p.notes || ''}`.trim();
            const res = await apiFetch(apiUrl('/leads'), {
              method: 'POST',
              headers: headersAuth,
              body: JSON.stringify({ ...baseBody, notes: flagNotes }),
            });
            if (!res.ok) throw new Error();
            const createdLead = await res.json();
            const dispName =
              createdLead.fullName ||
              `${createdLead.firstName || ''} ${createdLead.lastName || ''}`.trim() ||
              'ליד';
            mutablePool.push({
              id: createdLead.id,
              name: dispName,
              phone: createdLead.phone || '',
              email: createdLead.email,
              importLegacyId: createdLead.importLegacyId,
            });
            flagged += 1;
          }
        } catch {
          errors += 1;
        }
      }

      await onReloadLeads();
      setSummary({ created, updated, skipped, flagged, errors });
      setStep('done');
      onMessage?.('ייבוא לידים הושלם');
    } finally {
      setBusy(false);
    }
  }, [plans, leads, getAuthHeaders, onReloadLeads, onMessage]);

  const resetFlow = () => {
    setStep('upload');
    setFileName('');
    setHeaders([]);
    setRows([]);
    setMapping({
      fullName: '',
      phone: '',
      email: '',
      source: '',
      leadStatus: '',
      serviceType: '',
      assignedUserEmail: '',
      nextFollowUpDate: '',
      importLegacyId: '',
      customerLegacyId: '',
      projectLegacyId: '',
      notes: '',
    });
    setParseError('');
    setSummary(null);
  };

  return (
    <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-5">
        <div className="flex flex-wrap items-center gap-2 text-xl font-bold text-slate-900">
          <FileSpreadsheet className="h-6 w-6 text-green-700" />
          ייבוא לידים
        </div>
        <p className="mt-1 text-sm text-slate-600">
          מיפוי לשדות המערכת, קישור ללקוח/פרויקט לפי מזהה ישן, וטיפול בכפילויות לפני שמירה.
        </p>
      </div>
      <div className="space-y-6 p-5" dir="rtl">
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
                הורד תבנית (CSV)
              </button>
            </div>
          </div>
        )}

        {(step === 'map' || step === 'preview' || step === 'done') && fileName && (
          <div className="rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3 text-sm text-slate-700">
            קובץ: <span className="font-semibold">{fileName}</span> · {rows.length} שורות
          </div>
        )}

        {step === 'map' && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-slate-900">מיפוי עמודות</h3>
            <div className="grid gap-3 md:grid-cols-2">
              {LEAD_TARGET_KEYS.map((key) => (
                <div key={key} className="flex flex-col gap-1">
                  <label className="text-sm font-semibold text-slate-800">{LEAD_FIELD_LABELS[key]}</label>
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
                disabled={!mapping.fullName}
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
            <h3 className="text-lg font-bold text-slate-900">איכות נתונים, כפילויות ותצוגה מקדימה</h3>
            <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm sm:grid-cols-2">
              <div>
                שורות בקובץ: <strong>{rows.length}</strong>
              </div>
              <div>
                שורות עם שגיאות: <strong>{plans.filter((x) => x.errors.length).length}</strong>
              </div>
              <div>
                כפילויות פנימיות בקובץ (טלפון): <strong>{plans.filter((x) => x.fileDuplicate).length}</strong>
              </div>
              <div>
                לא ניתן לקשר לקוח/פרויקט:{' '}
                <strong>{plans.filter((x) => x.errors.some((e) => e.includes('לא נמצא'))).length}</strong>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-2 text-sm font-semibold text-slate-800">מדיניות כפילויות</div>
              <select
                className="w-full max-w-md rounded-2xl border border-slate-200 px-3 py-2.5 text-sm"
                value={duplicateStrategy}
                onChange={(e) => setDuplicateStrategy(e.target.value as DuplicateStrategy)}
              >
                <option value="skip">דלג</option>
                <option value="update">עדכן קיים</option>
                <option value="create_new">צור חדש</option>
                <option value="flag_review">סמן לבדיקה ידנית</option>
              </select>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full min-w-[760px] text-right text-sm">
                <thead className="bg-green-50/90">
                  <tr>
                    <th className="px-2 py-2">#</th>
                    <th className="px-2 py-2">שם</th>
                    <th className="px-2 py-2">טלפון</th>
                    <th className="px-2 py-2">סטטוס</th>
                    <th className="px-2 py-2">פעולה</th>
                    <th className="px-2 py-2">הערות / שגיאות</th>
                  </tr>
                </thead>
                <tbody>
                  {plans.slice(0, 80).map((p) => (
                    <tr key={p.rowIndex} className={cn('border-t border-slate-100', p.errors.length ? 'bg-red-50/50' : '')}>
                      <td className="px-2 py-1.5 tabular-nums">{p.rowIndex}</td>
                      <td className="px-2 py-1.5">{p.fullName || '—'}</td>
                      <td className="px-2 py-1.5">{formatIsraeliPhoneDisplay(p.phone) || '—'}</td>
                      <td className="px-2 py-1.5">{p.leadStatus}</td>
                      <td className="px-2 py-1.5 font-medium">
                        {actionLabel(p.action)}
                        {p.fileDuplicate ? <span className="mr-1 text-amber-700"> (בקובץ)</span> : null}
                      </td>
                      <td className="max-w-[240px] truncate px-2 py-1.5 text-xs text-slate-600">
                        {p.errors.length ? p.errors.join(' · ') : p.notes || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-2xl px-5 py-2.5 text-sm font-semibold text-white shadow disabled:opacity-50"
                style={{ background: GALIT_PRIMARY }}
                disabled={busy || !executablePlans.some((x) => ['create', 'update', 'create_new', 'flag'].includes(x.action))}
                onClick={() => void runImport()}
              >
                {busy ? 'מייבא...' : 'אשר וייבא'}
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
            <h3 className="text-lg font-bold text-green-900">סיכום ייבוא לידים</h3>
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
      </div>
    </div>
  );
}
