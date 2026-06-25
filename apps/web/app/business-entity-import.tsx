'use client';

import { apiUrl, apiFetch } from './lib/api-base';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FileDown, FileSpreadsheet, Upload } from 'lucide-react';
import { getCell, parseSpreadsheetFile } from './lib/import-spreadsheet';

const GALIT_PRIMARY = '#4ba647';

export type DuplicateStrategy = 'skip' | 'update' | 'create_new' | 'flag_review';

type Step = 'upload' | 'map' | 'preview' | 'done';

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function resolveByLegacy<T extends { id: string; importLegacyId?: string | null }>(raw: string, list: T[]): string | null {
  const t = (raw || '').trim();
  if (!t) return null;
  const byL = list.find((x) => (x.importLegacyId || '').toString().trim() === t);
  if (byL) return byL.id;
  const byId = list.find((x) => x.id === t);
  return byId?.id ?? null;
}

const PROJECT_STATUSES = [
  'NEW',
  'WAITING_QUOTE',
  'WAITING_APPROVAL',
  'SCHEDULED',
  'ON_THE_WAY',
  'FIELD_WORK_DONE',
  'WAITING_DATA',
  'REPORT_WRITING',
  'SENT_TO_CLIENT',
  'CLOSED',
  'POSTPONED',
  'CANCELLED',
] as const;

const REPORT_TYPES = [
  'RADIATION_REPORT',
  'ACOUSTIC_REPORT',
  'AIR_QUALITY_REPORT',
  'ASBESTOS_REPORT',
  'RADON_REPORT',
  'ODOUR_REPORT',
  'SOIL_REPORT',
  'LAB_REPORT',
  'OTHER',
] as const;

const REPORT_STATUSES = ['WAITING_DATA', 'IN_WRITING', 'IN_REVIEW', 'SENT', 'CLOSED'] as const;

const QUOTE_STATUSES = ['DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'SIGNED', 'EXPIRED'] as const;

export function ProjectImportSection({
  getAuthHeaders,
  projects,
  customers,
  onReloadProjects,
  onMessage,
}: {
  getAuthHeaders: () => Record<string, string>;
  projects: Array<{ id: string; name: string; client: string; importLegacyId?: string | null }>;
  customers: Array<{ id: string; importLegacyId?: string | null }>;
  onReloadProjects: () => Promise<void>;
  onMessage?: (msg: string) => void;
}) {
  type K =
    | 'name'
    | 'client'
    | 'customerLegacyId'
    | 'projectNumber'
    | 'service'
    | 'city'
    | 'address'
    | 'status'
    | 'dueDate'
    | 'notes'
    | 'importLegacyId';
  const KEYS: K[] = [
    'name',
    'client',
    'customerLegacyId',
    'projectNumber',
    'service',
    'city',
    'address',
    'status',
    'dueDate',
    'notes',
    'importLegacyId',
  ];
  const LABELS: Record<K, string> = {
    name: 'שם פרויקט',
    client: 'שם לקוח (תצוגה)',
    customerLegacyId: 'מזהה לקוח ישן (קישור)',
    projectNumber: 'מספר פרויקט',
    service: 'שירות',
    city: 'עיר',
    address: 'כתובת',
    status: 'סטטוס (אנגלית)',
    dueDate: 'תאריך יעד',
    notes: 'הערות',
    importLegacyId: 'מזהה ישן',
  };

  const guess = (headers: string[]): Record<K, string> => {
    const h = headers.map((x) => x.trim());
    const pick = (pred: (col: string) => boolean) => h.find(pred) || '';
    return {
      name: pick((c) => /שם.*פרויקט|project.*name|^name$/i.test(c)) || h[0] || '',
      client: pick((c) => /לקוח|client(?!Id)/i.test(c)),
      customerLegacyId: pick((c) => /לקוח.*legacy|customer.*legacy/i.test(c)),
      projectNumber: pick((c) => /מספר|number/i.test(c)),
      service: pick((c) => /שירות|service/i.test(c)),
      city: pick((c) => /^עיר|city/i.test(c)),
      address: pick((c) => /כתובת|address/i.test(c)),
      status: pick((c) => /סטטוס|status/i.test(c)),
      dueDate: pick((c) => /תאריך|due|יעד/i.test(c)),
      notes: pick((c) => /הערות|notes/i.test(c)),
      importLegacyId: pick((c) => /legacy|external|מזהה ישן/i.test(c)),
    };
  };

  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<K, string>>(() =>
    KEYS.reduce((a, k) => ({ ...a, [k]: '' }), {} as Record<K, string>),
  );
  const [strategy, setStrategy] = useState<DuplicateStrategy>('skip');
  const [parseError, setParseError] = useState('');
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<{
    created: number;
    updated: number;
    skipped: number;
    errors: number;
    flagged?: number;
  } | null>(null);

  type Plan = {
    rowIndex: number;
    name: string;
    client: string;
    customerId: string | null;
    projectNumber: string;
    service: string;
    city: string;
    address: string;
    status: string;
    dueDate: string;
    notes: string;
    importLegacyId: string;
    dup: (typeof projects)[0] | null;
    action: 'create' | 'update' | 'skip' | 'create_new' | 'flag' | 'error';
    errors: string[];
  };

  const plans = useMemo((): Plan[] => {
    if (!headers.length || !rows.length) return [];
    return rows.map((row, idx) => {
      const name = getCell(row, headers, mapping.name);
      const client = getCell(row, headers, mapping.client);
      const custLeg = getCell(row, headers, mapping.customerLegacyId);
      const customerId = resolveByLegacy(custLeg, customers);
      const importLegacyId = getCell(row, headers, mapping.importLegacyId).trim();
      const errors: string[] = [];
      if (!name.trim()) errors.push('חסר שם פרויקט');
      if (!client.trim()) errors.push('חסר שדה client');
      if (custLeg.trim() && !customerId) errors.push('לקוח לפי legacy לא נמצא');
      const stRaw = getCell(row, headers, mapping.status).toUpperCase();
      const status = PROJECT_STATUSES.includes(stRaw as (typeof PROJECT_STATUSES)[number]) ? stRaw : 'NEW';
      const dup =
        errors.length > 0
          ? null
          : importLegacyId
            ? projects.find((p) => (p.importLegacyId || '').toString().trim() === importLegacyId) ||
              null
            : projects.find(
                (p) =>
                  p.name.trim().toLowerCase() === name.trim().toLowerCase() &&
                  p.client.trim().toLowerCase() === client.trim().toLowerCase(),
              ) || null;
      let action: Plan['action'] = 'create';
      if (errors.length) action = 'error';
      else if (dup) {
        if (strategy === 'skip') action = 'skip';
        else if (strategy === 'update') action = 'update';
        else if (strategy === 'create_new') action = 'create_new';
        else if (strategy === 'flag_review') action = 'flag';
        else action = 'skip';
      }
      return {
        rowIndex: idx + 2,
        name: name.trim(),
        client: client.trim(),
        customerId,
        projectNumber: getCell(row, headers, mapping.projectNumber),
        service: getCell(row, headers, mapping.service),
        city: getCell(row, headers, mapping.city),
        address: getCell(row, headers, mapping.address),
        status,
        dueDate: getCell(row, headers, mapping.dueDate),
        notes: getCell(row, headers, mapping.notes),
        importLegacyId,
        dup,
        action,
        errors,
      };
    });
  }, [rows, headers, mapping, customers, projects, strategy]);

  const runImport = useCallback(async () => {
    setBusy(true);
    setSummary(null);
    let created = 0,
      updated = 0,
      skipped = 0,
      errors = 0,
      flagged = 0;
    const auth = getAuthHeaders();
    try {
      for (const p of plans) {
        if (p.errors.length) {
          errors += 1;
          continue;
        }
        if (p.action === 'skip') {
          skipped += 1;
          continue;
        }
        const flagPrefix =
          p.action === 'flag' && p.dup
            ? `[ייבוא לבדיקה] כפילות אפשרית עם פרויקט ${p.dup.id} (${p.dup.name}).\n`
            : '';
        const body: Record<string, unknown> = {
          name: p.name,
          client: p.client,
          customerId: p.customerId,
          projectNumber: p.projectNumber || null,
          service: p.service || null,
          city: p.city || null,
          address: p.address || null,
          status: p.status,
          notes: `${flagPrefix}${p.notes || ''}`.trim() || null,
          dueDate: p.dueDate ? new Date(p.dueDate).toISOString() : null,
          importLegacyId: p.importLegacyId || null,
        };
        try {
          if (p.action === 'update' && p.dup) {
            const res = await apiFetch(apiUrl(`/projects/${p.dup.id}`), {
              method: 'PATCH',
              headers: auth,
              body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error();
            updated += 1;
          } else {
            const res = await apiFetch(apiUrl('/projects'), {
              method: 'POST',
              headers: auth,
              body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error();
            if (p.action === 'flag') flagged += 1;
            else created += 1;
          }
        } catch {
          errors += 1;
        }
      }
      await onReloadProjects();
      setSummary({ created, updated, skipped, errors, flagged });
      setStep('done');
      onMessage?.('ייבוא פרויקטים הושלם');
    } finally {
      setBusy(false);
    }
  }, [plans, getAuthHeaders, onReloadProjects, onMessage]);

  const reset = () => {
    setStep('upload');
    setFileName('');
    setHeaders([]);
    setRows([]);
    setMapping(KEYS.reduce((a, k) => ({ ...a, [k]: '' }), {} as Record<K, string>));
    setParseError('');
    setSummary(null);
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setParseError('');
    try {
      const { headers: h, rows: r } = await parseSpreadsheetFile(file);
      if (!h.length || !r.length) {
        setParseError('קובץ ריק');
        return;
      }
      setFileName(file.name);
      setHeaders(h);
      setRows(r);
      setMapping(guess(h));
      setStep('map');
    } catch {
      setParseError('קריאה נכשלה');
    }
  };

  const tmpl = () => {
    const csv = `\uFEFFשם פרויקט,שם לקוח תצוגה,לקוח_legacy,מספר,שירות,עיר,כתובת,סטטוס,dueDate,הערות,legacyId\nדוגמה,חברה א,EXT-1,,בדיקה,תל אביב,,NEW,,,PRJ-OLD-1\n`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'תבנית_ייבוא_פרויקטים.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <EntityShell title="ייבוא פרויקטים" description="יצירה ועדכון פרויקטים עם קישור ללקוח לפי מזהה ישן.">
      {parseError && <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800">{parseError}</div>}
      {step === 'upload' && (
        <UploadRow onFile={onFile} onTemplate={tmpl} />
      )}
      {(step === 'map' || step === 'preview' || step === 'done') && (
        <div className="text-sm text-slate-600">
          קובץ: <strong>{fileName}</strong> · {rows.length} שורות
        </div>
      )}
      {step === 'map' && (
        <MapGrid
          keys={KEYS}
          labels={LABELS}
          headers={headers}
          mapping={mapping}
          setMapping={setMapping}
          onNext={() => setStep('preview')}
          onCancel={reset}
          nextDisabled={!mapping.name || !mapping.client}
        />
      )}
      {step === 'preview' && (
        <PreviewTable
          plans={plans}
          busy={busy}
          strategy={strategy}
          setStrategy={setStrategy}
          onRun={() => void runImport()}
          onBack={() => setStep('map')}
          onCancel={reset}
          columns={['#', 'שם', 'client', 'פעולה', 'שגיאות']}
          renderRow={(p: Plan) => (
            <tr key={p.rowIndex} className={cn('border-t', p.errors.length ? 'bg-red-50/50' : '')}>
              <td className="px-2 py-1">{p.rowIndex}</td>
              <td className="px-2 py-1">{p.name}</td>
              <td className="px-2 py-1">{p.client}</td>
              <td className="px-2 py-1">{p.action}</td>
              <td className="px-2 py-1 text-xs">{p.errors.join(' · ')}</td>
            </tr>
          )}
        />
      )}
      {step === 'done' && summary && (
        <SummaryBlock summary={summary} onAgain={reset} labels={['נוצרו', 'עודכנו', 'דולגו', 'שגיאות']} />
      )}
    </EntityShell>
  );
}

export function QuoteImportSection({
  getAuthHeaders,
  quotes,
  customers,
  projects,
  onReloadQuotes,
  onMessage,
}: {
  getAuthHeaders: () => Record<string, string>;
  quotes: Array<{
    id: string;
    customerId?: string | null;
    quoteNumber?: string | null;
    importLegacyId?: string | null;
    validityDate?: string | null;
    validTo?: string | null;
  }>;
  customers: Array<{ id: string; importLegacyId?: string | null }>;
  projects: Array<{ id: string; importLegacyId?: string | null }>;
  onReloadQuotes: () => Promise<void>;
  onMessage?: (msg: string) => void;
}) {
  type K =
    | 'customerLegacyId'
    | 'service'
    | 'amount'
    | 'validTo'
    | 'quoteNumber'
    | 'status'
    | 'importLegacyId'
    | 'projectLegacyId'
    | 'notes';
  const KEYS: K[] = [
    'customerLegacyId',
    'service',
    'amount',
    'validTo',
    'quoteNumber',
    'status',
    'importLegacyId',
    'projectLegacyId',
    'notes',
  ];
  const LABELS: Record<K, string> = {
    customerLegacyId: 'מזהה לקוח (legacy / id)',
    service: 'שירות',
    amount: 'סכום',
    validTo: 'תוקף עד',
    quoteNumber: 'מספר הצעה',
    status: 'סטטוס',
    importLegacyId: 'מזהה ישן',
    projectLegacyId: 'פרויקט legacy',
    notes: 'הערות',
  };
  const guess = (headers: string[]): Record<K, string> => {
    const h = headers.map((x) => x.trim());
    const pick = (pred: (col: string) => boolean) => h.find(pred) || '';
    return {
      customerLegacyId: pick((c) => /לקוח|customer/i.test(c)),
      service: pick((c) => /שירות|service/i.test(c)),
      amount: pick((c) => /סכום|amount/i.test(c)),
      validTo: pick((c) => /תוקף|valid/i.test(c)),
      quoteNumber: pick((c) => /מספר.*הצע|quote/i.test(c)),
      status: pick((c) => /סטטוס|status/i.test(c)),
      importLegacyId: pick((c) => /legacy|external/i.test(c)),
      projectLegacyId: pick((c) => /פרויקט.*legacy|project/i.test(c)),
      notes: pick((c) => /הערות/i.test(c)),
    };
  };

  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<K, string>>(() =>
    KEYS.reduce((a, k) => ({ ...a, [k]: '' }), {} as Record<K, string>),
  );
  const [strategy, setStrategy] = useState<DuplicateStrategy>('skip');
  const [parseError, setParseError] = useState('');
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<{
    created: number;
    updated: number;
    skipped: number;
    errors: number;
    flagged?: number;
  } | null>(null);

  type Plan = {
    rowIndex: number;
    customerId: string | null;
    projectId: string | null;
    service: string;
    amount: number;
    validTo: string;
    quoteNumber: string;
    status: string;
    importLegacyId: string;
    notes: string;
    dup: (typeof quotes)[0] | null;
    action: 'create' | 'update' | 'skip' | 'create_new' | 'flag' | 'error';
    errors: string[];
  };

  const plans = useMemo((): Plan[] => {
    if (!headers.length || !rows.length) return [];
    return rows.map((row, idx) => {
      const cust = getCell(row, headers, mapping.customerLegacyId);
      const customerId = resolveByLegacy(cust, customers);
      const projectId = resolveByLegacy(getCell(row, headers, mapping.projectLegacyId), projects);
      const service = getCell(row, headers, mapping.service);
      const amount = Number(getCell(row, headers, mapping.amount).replace(/,/g, '')) || 0;
      let validTo = getCell(row, headers, mapping.validTo);
      if (!validTo.trim()) {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        validTo = d.toISOString().slice(0, 10);
      }
      const quoteNumber = getCell(row, headers, mapping.quoteNumber);
      const st = getCell(row, headers, mapping.status).toUpperCase();
      const status = QUOTE_STATUSES.includes(st as (typeof QUOTE_STATUSES)[number]) ? st : 'DRAFT';
      const importLegacyId = getCell(row, headers, mapping.importLegacyId).trim();
      const notes = getCell(row, headers, mapping.notes);
      const errors: string[] = [];
      if (!customerId) errors.push('חסר/לא נמצא לקוח');
      if (!service.trim()) errors.push('חסר שירות');
      if (!amount || amount < 0) errors.push('סכום לא תקין');
      let dup: (typeof quotes)[0] | null = null;
      if (!errors.length) {
        if (importLegacyId) dup = quotes.find((q) => (q.importLegacyId || '').toString().trim() === importLegacyId) || null;
        if (!dup && quoteNumber && customerId) {
          dup =
            quotes.find((q) => q.quoteNumber === quoteNumber && q.customerId === customerId) || null;
        }
      }
      let action: Plan['action'] = 'create';
      if (errors.length) action = 'error';
      else if (dup) {
        if (strategy === 'skip') action = 'skip';
        else if (strategy === 'update') action = 'update';
        else if (strategy === 'create_new') action = 'create_new';
        else if (strategy === 'flag_review') action = 'flag';
        else action = 'skip';
      }
      return {
        rowIndex: idx + 2,
        customerId,
        projectId,
        service: service.trim(),
        amount,
        validTo: validTo.trim(),
        quoteNumber: quoteNumber.trim(),
        status,
        importLegacyId,
        notes,
        dup,
        action,
        errors,
      };
    });
  }, [rows, headers, mapping, customers, projects, quotes, strategy]);

  const runImport = useCallback(async () => {
    setBusy(true);
    setSummary(null);
    let created = 0,
      updated = 0,
      skipped = 0,
      errors = 0,
      flagged = 0;
    const auth = getAuthHeaders();
    try {
      for (const p of plans) {
        if (p.errors.length) {
          errors += 1;
          continue;
        }
        if (p.action === 'skip') {
          skipped += 1;
          continue;
        }
        const flagPrefix =
          p.action === 'flag' && p.dup
            ? `[ייבוא לבדיקה] כפילות אפשרית עם הצעה ${p.dup.id}.\n`
            : '';
        const body: Record<string, unknown> = {
          customerId: p.customerId,
          projectId: p.projectId,
          service: p.service,
          amount: p.amount,
          amountBeforeVat: p.amount,
          validTo: new Date(p.validTo).toISOString(),
          validityDate: new Date(p.validTo).toISOString(),
          status: p.status,
          quoteNumber: p.quoteNumber || null,
          notes: `${flagPrefix}${p.notes || ''}`.trim() || null,
          importLegacyId: p.importLegacyId || null,
          vatPercent: 17,
          discountType: 'NONE',
          discountValue: 0,
        };
        try {
          if (p.action === 'update' && p.dup) {
            const res = await apiFetch(apiUrl(`/quotes/${p.dup.id}`), {
              method: 'PATCH',
              headers: auth,
              body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error();
            updated += 1;
          } else {
            const res = await apiFetch(apiUrl('/quotes'), {
              method: 'POST',
              headers: auth,
              body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error();
            if (p.action === 'flag') flagged += 1;
            else created += 1;
          }
        } catch {
          errors += 1;
        }
      }
      await onReloadQuotes();
      setSummary({ created, updated, skipped, errors, flagged });
      setStep('done');
      onMessage?.('ייבוא הצעות מחיר הושלם');
    } finally {
      setBusy(false);
    }
  }, [plans, getAuthHeaders, onReloadQuotes, onMessage]);

  const reset = () => {
    setStep('upload');
    setFileName('');
    setHeaders([]);
    setRows([]);
    setMapping(KEYS.reduce((a, k) => ({ ...a, [k]: '' }), {} as Record<K, string>));
    setParseError('');
    setSummary(null);
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setParseError('');
    try {
      const { headers: h, rows: r } = await parseSpreadsheetFile(file);
      if (!h.length || !r.length) {
        setParseError('קובץ ריק');
        return;
      }
      setFileName(file.name);
      setHeaders(h);
      setRows(r);
      setMapping(guess(h));
      setStep('map');
    } catch {
      setParseError('קריאה נכשלה');
    }
  };

  const tmpl = () => {
    const csv = `\uFEFFלקוח_legacy,שירות,סכום,תוקף,מספר_הצעה,סטטוס,legacyId,פרויקט_legacy,הערות\nEXT-1,בדיקה,1000,2026-12-31,Q-100,DRAFT,Q-OLD-1,,\n`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'תבנית_ייבוא_הצעות.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <EntityShell title="ייבוא הצעות מחיר" description="דורש לקוח קיים (או מזהה legacy מיובא).">
      {parseError && <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800">{parseError}</div>}
      {step === 'upload' && <UploadRow onFile={onFile} onTemplate={tmpl} />}
      {(step === 'map' || step === 'preview' || step === 'done') && (
        <div className="text-sm text-slate-600">
          קובץ: <strong>{fileName}</strong> · {rows.length} שורות
        </div>
      )}
      {step === 'map' && (
        <MapGrid
          keys={KEYS}
          labels={LABELS}
          headers={headers}
          mapping={mapping}
          setMapping={setMapping}
          onNext={() => setStep('preview')}
          onCancel={reset}
          nextDisabled={!mapping.customerLegacyId || !mapping.service || !mapping.amount}
        />
      )}
      {step === 'preview' && (
        <PreviewTable
          plans={plans}
          busy={busy}
          strategy={strategy}
          setStrategy={setStrategy}
          onRun={() => void runImport()}
          onBack={() => setStep('map')}
          onCancel={reset}
          columns={['#', 'לקוח', 'שירות', 'סכום', 'פעולה', 'שגיאות']}
          renderRow={(p: Plan) => (
            <tr key={p.rowIndex} className={cn('border-t', p.errors.length ? 'bg-red-50/50' : '')}>
              <td className="px-2 py-1">{p.rowIndex}</td>
              <td className="px-2 py-1">{p.customerId || '—'}</td>
              <td className="px-2 py-1">{p.service}</td>
              <td className="px-2 py-1">{p.amount}</td>
              <td className="px-2 py-1">{p.action}</td>
              <td className="px-2 py-1 text-xs">{p.errors.join(' · ')}</td>
            </tr>
          )}
        />
      )}
      {step === 'done' && summary && (
        <SummaryBlock summary={summary} onAgain={reset} labels={['נוצרו', 'עודכנו', 'דולגו', 'שגיאות']} />
      )}
    </EntityShell>
  );
}

export function ReportImportSection({
  getAuthHeaders,
  customers,
  projects,
  currentUserId,
  onMessage,
}: {
  getAuthHeaders: () => Record<string, string>;
  customers: Array<{ id: string; importLegacyId?: string | null }>;
  projects: Array<{ id: string; importLegacyId?: string | null }>;
  currentUserId: string;
  onMessage?: (msg: string) => void;
}) {
  type K =
    | 'title'
    | 'reportType'
    | 'customerLegacyId'
    | 'projectLegacyId'
    | 'reportDate'
    | 'status'
    | 'pdfPath'
    | 'importLegacyId'
    | 'internalNotes';
  const KEYS: K[] = [
    'title',
    'reportType',
    'customerLegacyId',
    'projectLegacyId',
    'reportDate',
    'status',
    'pdfPath',
    'importLegacyId',
    'internalNotes',
  ];
  const LABELS: Record<K, string> = {
    title: 'שם דוח',
    reportType: 'סוג דוח (אנגלית)',
    customerLegacyId: 'לקוח legacy',
    projectLegacyId: 'פרויקט legacy',
    reportDate: 'תאריך דוח',
    status: 'סטטוס',
    pdfPath: 'שם קובץ / נתיב',
    importLegacyId: 'מזהה ישן',
    internalNotes: 'הערות פנימיות',
  };

  const [reportPool, setReportPool] = useState<
    Array<{
      id: string;
      title: string;
      customerId?: string | null;
      reportType: string;
      reportDate?: string | null;
      importLegacyId?: string | null;
    }>
  >([]);

  useEffect(() => {
    let ok = true;
    apiFetch(apiUrl('/reports'), { headers: getAuthHeaders() })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (!ok || !Array.isArray(data)) return;
        setReportPool(
          data.map((x: any) => ({
            id: x.id,
            title: x.title,
            customerId: x.customerId,
            reportType: x.reportType,
            reportDate: x.reportDate,
            importLegacyId: x.importLegacyId,
          })),
        );
      })
      .catch(() => {});
    return () => {
      ok = false;
    };
  }, [getAuthHeaders]);

  const guess = (headers: string[]): Record<K, string> => {
    const h = headers.map((x) => x.trim());
    const pick = (pred: (col: string) => boolean) => h.find(pred) || '';
    return {
      title: pick((c) => /שם.*דוח|title/i.test(c)) || h[0] || '',
      reportType: pick((c) => /סוג|type/i.test(c)),
      customerLegacyId: pick((c) => /לקוח/i.test(c)),
      projectLegacyId: pick((c) => /פרויקט/i.test(c)),
      reportDate: pick((c) => /תאריך|date/i.test(c)),
      status: pick((c) => /סטטוס/i.test(c)),
      pdfPath: pick((c) => /קובץ|pdf|path/i.test(c)),
      importLegacyId: pick((c) => /legacy/i.test(c)),
      internalNotes: pick((c) => /הערות/i.test(c)),
    };
  };

  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<K, string>>(() =>
    KEYS.reduce((a, k) => ({ ...a, [k]: '' }), {} as Record<K, string>),
  );
  const [strategy, setStrategy] = useState<DuplicateStrategy>('skip');
  const [parseError, setParseError] = useState('');
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<{
    created: number;
    updated: number;
    skipped: number;
    errors: number;
    flagged?: number;
  } | null>(null);

  type Plan = {
    rowIndex: number;
    title: string;
    reportType: string;
    customerId: string | null;
    projectId: string | null;
    reportDate: string | null;
    status: string;
    pdfPath: string;
    importLegacyId: string;
    internalNotes: string;
    dup: (typeof reportPool)[0] | null;
    action: 'create' | 'update' | 'skip' | 'create_new' | 'flag' | 'error';
    errors: string[];
  };

  const plans = useMemo((): Plan[] => {
    if (!headers.length || !rows.length) return [];
    return rows.map((row, idx) => {
      const title = getCell(row, headers, mapping.title);
      const rtRaw = getCell(row, headers, mapping.reportType).toUpperCase();
      const reportType = REPORT_TYPES.includes(rtRaw as (typeof REPORT_TYPES)[number]) ? rtRaw : 'OTHER';
      const customerId = resolveByLegacy(getCell(row, headers, mapping.customerLegacyId), customers);
      const projectId = resolveByLegacy(getCell(row, headers, mapping.projectLegacyId), projects);
      const reportDateRaw = getCell(row, headers, mapping.reportDate);
      const reportDate = reportDateRaw ? new Date(reportDateRaw).toISOString() : null;
      const st = getCell(row, headers, mapping.status).toUpperCase();
      const status = REPORT_STATUSES.includes(st as (typeof REPORT_STATUSES)[number]) ? st : 'WAITING_DATA';
      const pdfPath = getCell(row, headers, mapping.pdfPath);
      const importLegacyId = getCell(row, headers, mapping.importLegacyId).trim();
      const internalNotes = getCell(row, headers, mapping.internalNotes);
      const errors: string[] = [];
      if (!title.trim()) errors.push('חסר שם דוח');
      if (!customerId) errors.push('לקוח לא נמצא');
      let dup: (typeof reportPool)[0] | null = null;
      if (!errors.length) {
        if (importLegacyId) dup = reportPool.find((r) => (r.importLegacyId || '').toString().trim() === importLegacyId) || null;
        if (!dup) {
          const dKey = (reportDate || '').slice(0, 10);
          dup =
            reportPool.find(
              (r) =>
                r.title.trim() === title.trim() &&
                r.customerId === customerId &&
                (r.reportDate ? new Date(r.reportDate).toISOString().slice(0, 10) : '') === dKey &&
                r.reportType === reportType,
            ) || null;
        }
      }
      let action: Plan['action'] = 'create';
      if (errors.length) action = 'error';
      else if (dup) {
        if (strategy === 'skip') action = 'skip';
        else if (strategy === 'update') action = 'update';
        else if (strategy === 'create_new') action = 'create_new';
        else action = 'skip';
      }
      return {
        rowIndex: idx + 2,
        title: title.trim(),
        reportType,
        customerId,
        projectId,
        reportDate,
        status,
        pdfPath: pdfPath.trim(),
        importLegacyId,
        internalNotes,
        dup,
        action: strategy === 'flag_review' && dup ? 'skip' : action,
        errors:
          strategy === 'flag_review' && dup ? [...errors, 'כפילות — בחרו מדיניות אחרת (דלג/עדכן/צור חדש)'] : errors,
      };
    });
  }, [rows, headers, mapping, customers, projects, reportPool, strategy]);

  const runImport = useCallback(async () => {
    setBusy(true);
    setSummary(null);
    let created = 0,
      updated = 0,
      skipped = 0,
      errors = 0;
    const auth = getAuthHeaders();
    try {
      for (const p of plans) {
        if (p.errors.length) {
          errors += 1;
          continue;
        }
        if (p.action === 'skip') {
          skipped += 1;
          continue;
        }
        const body: Record<string, unknown> = {
          title: p.title,
          reportType: p.reportType,
          customerId: p.customerId,
          projectId: p.projectId,
          reportDate: p.reportDate,
          status: p.status,
          pdfPath: p.pdfPath || null,
          importLegacyId: p.importLegacyId || null,
          internalNotes: p.internalNotes || null,
          createdById: currentUserId,
        };
        try {
          if (p.action === 'update' && p.dup) {
            const res = await apiFetch(apiUrl(`/reports/${p.dup.id}`), {
              method: 'PATCH',
              headers: auth,
              body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error();
            updated += 1;
          } else {
            const res = await apiFetch(apiUrl('/reports'), {
              method: 'POST',
              headers: auth,
              body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error();
            created += 1;
          }
        } catch {
          errors += 1;
        }
      }
      setSummary({ created, updated, skipped, errors });
      setStep('done');
      onMessage?.('ייבוא דוחות הושלם');
    } finally {
      setBusy(false);
    }
  }, [plans, getAuthHeaders, currentUserId, onMessage]);

  const reset = () => {
    setStep('upload');
    setFileName('');
    setHeaders([]);
    setRows([]);
    setMapping(KEYS.reduce((a, k) => ({ ...a, [k]: '' }), {} as Record<K, string>));
    setParseError('');
    setSummary(null);
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setParseError('');
    try {
      const { headers: h, rows: r } = await parseSpreadsheetFile(file);
      if (!h.length || !r.length) {
        setParseError('קובץ ריק');
        return;
      }
      setFileName(file.name);
      setHeaders(h);
      setRows(r);
      setMapping(guess(h));
      setStep('map');
    } catch {
      setParseError('קריאה נכשלה');
    }
  };

  const tmpl = () => {
    const csv = `\uFEFFשם דוח,סוג דוח,לקוח_legacy,פרויקט_legacy,תאריך,סטטוס,שם קובץ,legacyId,הערות\nדוח דוגמה,OTHER,EXT-1,,2025-01-15,WAITING_DATA,file.pdf,RPT-1,\n`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'תבנית_ייבוא_דוחות.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <EntityShell title="ייבוא דוחות" description="נדרשות הרשאות מנהל. קישור ללקוח לפי legacyId. רשימת כפילויות נטענת מהשרת.">
      {parseError && <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800">{parseError}</div>}
      {step === 'upload' && <UploadRow onFile={onFile} onTemplate={tmpl} />}
      {(step === 'map' || step === 'preview' || step === 'done') && (
        <div className="text-sm text-slate-600">
          קובץ: <strong>{fileName}</strong> · {rows.length} שורות · כפילויות מול {reportPool.length} דוחות במערכת
        </div>
      )}
      {step === 'map' && (
        <MapGrid
          keys={KEYS}
          labels={LABELS}
          headers={headers}
          mapping={mapping}
          setMapping={setMapping}
          onNext={() => setStep('preview')}
          onCancel={reset}
          nextDisabled={!mapping.title || !mapping.customerLegacyId}
        />
      )}
      {step === 'preview' && (
        <PreviewTable
          plans={plans}
          busy={busy}
          strategy={strategy}
          setStrategy={setStrategy}
          onRun={() => void runImport()}
          onBack={() => setStep('map')}
          onCancel={reset}
          columns={['#', 'כותרת', 'סוג', 'פעולה', 'שגיאות']}
          renderRow={(p: Plan) => (
            <tr key={p.rowIndex} className={cn('border-t', p.errors.length ? 'bg-red-50/50' : '')}>
              <td className="px-2 py-1">{p.rowIndex}</td>
              <td className="px-2 py-1">{p.title}</td>
              <td className="px-2 py-1">{p.reportType}</td>
              <td className="px-2 py-1">{p.action}</td>
              <td className="px-2 py-1 text-xs">{p.errors.join(' · ')}</td>
            </tr>
          )}
        />
      )}
      {step === 'done' && summary && (
        <SummaryBlock summary={summary} onAgain={reset} labels={['נוצרו', 'עודכנו', 'דולגו', 'שגיאות']} />
      )}
    </EntityShell>
  );
}

function EntityShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-5">
        <div className="flex flex-wrap items-center gap-2 text-xl font-bold text-slate-900">
          <FileSpreadsheet className="h-6 w-6 text-green-700" />
          {title}
        </div>
        <p className="mt-1 text-sm text-slate-600">{description}</p>
      </div>
      <div className="space-y-6 p-5" dir="rtl">
        {children}
      </div>
    </div>
  );
}

function UploadRow({
  onFile,
  onTemplate,
}: {
  onFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onTemplate: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border-2 border-dashed border-green-300 bg-green-50/50 px-5 py-4 transition hover:bg-green-50">
        <Upload className="h-5 w-5 text-green-700" />
        <span className="font-semibold text-slate-800">בחר קובץ</span>
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
        onClick={onTemplate}
      >
        <FileDown className="h-4 w-4" />
        תבנית CSV
      </button>
    </div>
  );
}

function MapGrid<K extends string>({
  keys,
  labels,
  headers,
  mapping,
  setMapping,
  onNext,
  onCancel,
  nextDisabled,
}: {
  keys: K[];
  labels: Record<K, string>;
  headers: string[];
  mapping: Record<K, string>;
  setMapping: React.Dispatch<React.SetStateAction<Record<K, string>>>;
  onNext: () => void;
  onCancel: () => void;
  nextDisabled: boolean;
}) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-slate-900">מיפוי עמודות</h3>
      <div className="grid gap-3 md:grid-cols-2">
        {keys.map((key) => (
          <div key={key} className="flex flex-col gap-1">
            <label className="text-sm font-semibold text-slate-800">{labels[key]}</label>
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
          className="rounded-2xl px-5 py-2.5 text-sm font-semibold text-white shadow disabled:opacity-50"
          style={{ background: GALIT_PRIMARY }}
          onClick={onNext}
          disabled={nextDisabled}
        >
          המשך לתצוגה מקדימה
        </button>
        <button type="button" className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm" onClick={onCancel}>
          ביטול
        </button>
      </div>
    </div>
  );
}

function PreviewTable<T>({
  plans,
  busy,
  strategy,
  setStrategy,
  onRun,
  onBack,
  onCancel,
  columns,
  renderRow,
}: {
  plans: T[];
  busy: boolean;
  strategy: DuplicateStrategy;
  setStrategy: (s: DuplicateStrategy) => void;
  onRun: () => void;
  onBack: () => void;
  onCancel: () => void;
  columns: string[];
  renderRow: (p: T) => React.ReactNode;
}) {
  const executable = plans.filter((p: any) => !p.errors?.length);
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-slate-900">תצוגה מקדימה</h3>
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-2 text-sm font-semibold">מדיניות כפילויות</div>
        <select
          className="w-full max-w-md rounded-2xl border border-slate-200 px-3 py-2.5 text-sm"
          value={strategy}
          onChange={(e) => setStrategy(e.target.value as DuplicateStrategy)}
        >
          <option value="skip">דלג</option>
          <option value="update">עדכן קיים</option>
          <option value="create_new">צור חדש</option>
          <option value="flag_review">סמן לבדיקה (כאן: דילוג עם הודעה)</option>
        </select>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full min-w-[640px] text-right text-sm">
          <thead className="bg-green-50/90">
            <tr>
              {columns.map((c) => (
                <th key={c} className="px-2 py-2">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{plans.slice(0, 60).map((p) => renderRow(p))}</tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-2xl px-5 py-2.5 text-sm font-semibold text-white shadow disabled:opacity-50"
          style={{ background: GALIT_PRIMARY }}
          disabled={
            busy || !executable.some((p: any) => ['create', 'update', 'create_new', 'flag'].includes(p.action))
          }
          onClick={onRun}
        >
          {busy ? 'מייבא...' : 'אשר וייבא'}
        </button>
        <button type="button" className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm" onClick={onBack}>
          חזרה
        </button>
        <button type="button" className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm" onClick={onCancel}>
          ביטול
        </button>
      </div>
    </div>
  );
}

function SummaryBlock({
  summary,
  onAgain,
  labels,
}: {
  summary: { created: number; updated: number; skipped: number; errors: number; flagged?: number };
  onAgain: () => void;
  labels: [string, string, string, string];
}) {
  return (
    <div className="space-y-3 rounded-2xl border border-green-200 bg-green-50/60 p-5">
      <h3 className="text-lg font-bold text-green-900">סיכום</h3>
      <ul className="list-inside list-disc space-y-1 text-sm text-green-950">
        <li>
          {labels[0]}: {summary.created}
        </li>
        {summary.flagged != null && summary.flagged > 0 ? (
          <li>סומנו לבדיקה (נוצרו עם הערת ייבוא): {summary.flagged}</li>
        ) : null}
        <li>
          {labels[1]}: {summary.updated}
        </li>
        <li>
          {labels[2]}: {summary.skipped}
        </li>
        <li>
          {labels[3]}: {summary.errors}
        </li>
      </ul>
      <button
        type="button"
        className="rounded-2xl border border-green-300 bg-white px-4 py-2 text-sm font-semibold text-green-900"
        onClick={onAgain}
      >
        ייבוא נוסף
      </button>
    </div>
  );
}
