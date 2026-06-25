'use client';

import React, { useMemo, useState } from 'react';
import { ArrowRight, Database, FileSpreadsheet } from 'lucide-react';
import { CustomerImportSection, type ImportClassification, type ImportCustomerRow } from './customer-import-section';
import { LeadImportSection, type ImportLeadPoolRow } from './lead-import-section';
import { ProjectImportSection, QuoteImportSection, ReportImportSection } from './business-entity-import';

export type DataImportEntity =
  | 'customers'
  | 'contacts'
  | 'leads'
  | 'quotes'
  | 'projects'
  | 'reports'
  | 'files'
  | 'history';

const ENTITY_META: Record<
  DataImportEntity,
  { label: string; description: string; mode: 'full' | 'infra'; requiredAccess: string[] }
> = {
  customers: {
    label: 'לקוחות',
    description: 'ייבוא מלא: מיפוי, איכות, כפילויות, מדיניות, אישור, סיכום.',
    mode: 'full',
    requiredAccess: ['customers'],
  },
  contacts: {
    label: 'אנשי קשר',
    description:
      'תשתית + הנחיה: אין מודל נפרד — משלבים בייבוא לקוח (עמודת איש קשר) או ממתינים להרחבה.',
    mode: 'infra',
    requiredAccess: ['customers'],
  },
  leads: {
    label: 'לידים',
    description: 'ייבוא מלא כולל קישור ללקוח/פרויקט לפי legacyId.',
    mode: 'full',
    requiredAccess: ['leads'],
  },
  quotes: {
    label: 'הצעות מחיר',
    description: 'ייבוא לפי לקוח (legacy), סכום ותוקף — כפילויות לפי מספר הצעה / legacy.',
    mode: 'full',
    requiredAccess: ['quotes'],
  },
  projects: {
    label: 'פרויקטים',
    description: 'יצירה/עדכון פרויקטים (מנהלים) עם קישור ללקוח.',
    mode: 'full',
    requiredAccess: ['projects'],
  },
  reports: {
    label: 'דוחות',
    description: 'ייבוא מטא-דאטה של דוחות (מנהלים) — קישור ללקוח חובה.',
    mode: 'full',
    requiredAccess: ['reports'],
  },
  files: {
    label: 'קבצים / נספחים',
    description: 'תשתית: תבנית מטא-דאטה; העלאת ZIP והקצאת קבצים בפועל — בהמשך.',
    mode: 'infra',
    requiredAccess: ['documents', 'reports'],
  },
  history: {
    label: 'היסטוריית פעילות',
    description: 'תשתית: ייבוא פעילות (למשל לליד) לפי entityLegacyId — בפיתוח.',
    mode: 'infra',
    requiredAccess: ['leads'],
  },
};

function cn(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(' ');
}

function canRole(role: string, key: string) {
  const accessMap: Record<string, string[]> = {
    admin: ['dashboard', 'leads', 'customers', 'quotes', 'projects', 'reports', 'documents', 'settings'],
    manager: ['dashboard', 'leads', 'customers', 'quotes', 'projects', 'reports', 'documents', 'settings'],
    sales: ['leads', 'customers', 'quotes'],
    technician: ['projects', 'documents'],
    expert: ['leads', 'customers', 'quotes', 'projects'],
    billing: ['quotes'],
  };
  return (accessMap[role] || []).includes(key);
}

function InfraCard({
  title,
  body,
  csvName,
  csvContent,
}: {
  title: string;
  body: string;
  csvName: string;
  csvContent: string;
}) {
  const download = () => {
    const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = csvName;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="rounded-3xl border border-amber-100 bg-amber-50/40 p-6" dir="rtl">
      <div className="mb-2 flex items-center gap-2 text-lg font-bold text-amber-950">
        <Database className="h-5 w-5" />
        {title}
      </div>
      <p className="mb-4 text-sm text-amber-950/90">{body}</p>
      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-2xl border border-amber-200 bg-white px-4 py-2.5 text-sm font-semibold text-amber-950"
        onClick={download}
      >
        <FileSpreadsheet className="h-4 w-4" />
        הורד תבנית CSV לדוגמה
      </button>
    </div>
  );
}

const STEPS = [
  'בחירת סוג',
  'העלאה ומיפוי',
  'איכות וכפילויות',
  'תצוגה מקדימה ואישור',
  'סיכום',
] as const;

export function DataImportWizard({
  currentUserRole,
  getAuthHeaders,
  customers,
  leads,
  projects,
  quotes,
  users,
  currentUserId,
  customerClassifications,
  customerTypeLabelMap,
  onReloadCustomers,
  onReloadLeads,
  onReloadProjects,
  onReloadQuotes,
  onMessage,
}: {
  currentUserRole: string;
  getAuthHeaders: () => Record<string, string>;
  customers: ImportCustomerRow[];
  leads: ImportLeadPoolRow[];
  projects: Array<{ id: string; name: string; client: string; importLegacyId?: string | null }>;
  quotes: Array<{
    id: string;
    customerId?: string | null;
    quoteNumber?: string | null;
    importLegacyId?: string | null;
    validityDate?: string | null;
    validTo?: string | null;
  }>;
  users: Array<{ id: string; email: string; name: string }>;
  currentUserId: string;
  customerClassifications: ImportClassification[];
  customerTypeLabelMap: Record<string, string>;
  onReloadCustomers: () => Promise<void>;
  onReloadLeads: () => Promise<void>;
  onReloadProjects: () => Promise<void>;
  onReloadQuotes: () => Promise<void>;
  onMessage?: (msg: string) => void;
}) {
  const [entity, setEntity] = useState<DataImportEntity | null>(null);

  const role = (currentUserRole || '').toLowerCase();

  const enabledEntities = useMemo(() => {
    return (Object.keys(ENTITY_META) as DataImportEntity[]).filter((e) => {
      const req = ENTITY_META[e].requiredAccess;
      return req.some((k) => canRole(role, k));
    });
  }, [role]);

  return (
    <div className="space-y-8" dir="rtl">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">ייבוא נתונים</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          תהליך מדורג ממערכת CRM ישנה: אין מחיקה של נתונים קיימים, אין ייבוא בלי תצוגה מקדימה ואישור מפורש. נתמכים{' '}
          <strong>CSV</strong> ו-<strong>XLSX</strong>.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-100 bg-slate-50/80 p-3">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-slate-800 shadow-sm">
              {i + 1}
            </span>
            {label}
            {i < STEPS.length - 1 ? <ArrowRight className="hidden h-3 w-3 text-slate-400 sm:inline" /> : null}
          </div>
        ))}
      </div>

      {!entity && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {enabledEntities.map((key) => {
            const m = ENTITY_META[key];
            const disabled = false;
            return (
              <button
                key={key}
                type="button"
                disabled={disabled}
                onClick={() => setEntity(key)}
                className={cn(
                  'rounded-3xl border p-5 text-right shadow-sm transition hover:border-green-300 hover:bg-green-50/30',
                  'border-slate-200 bg-white',
                )}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-lg font-bold text-slate-900">{m.label}</span>
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-xs font-semibold',
                      m.mode === 'full' ? 'bg-green-100 text-green-900' : 'bg-amber-100 text-amber-900',
                    )}
                  >
                    {m.mode === 'full' ? 'פעיל' : 'תשתית'}
                  </span>
                </div>
                <p className="text-sm text-slate-600">{m.description}</p>
              </button>
            );
          })}
        </div>
      )}

      {entity && (
        <div className="space-y-4">
          <button
            type="button"
            className="text-sm font-semibold text-green-800 underline-offset-2 hover:underline"
            onClick={() => setEntity(null)}
          >
            ← חזרה לבחירת סוג ייבוא
          </button>

          {entity === 'customers' && (
            <CustomerImportSection
              getAuthHeaders={getAuthHeaders}
              customers={customers}
              onReloadCustomers={onReloadCustomers}
              classifications={customerClassifications}
              typeLabelMap={customerTypeLabelMap}
              onMessage={onMessage}
            />
          )}

          {entity === 'contacts' && (
            <InfraCard
              title="אנשי קשר — תשתית"
              body="במערכת הנוכחית אנשי קשר נשמרים כחלק מפרטי הלקוח (שם איש קשר, טלפון, אימייל). השתמשו בייבוא לקוחות או הרחיבו את המודל בעתיד."
              csvName="תבנית_אנשי_קשר_לדוגמה.csv"
              csvContent="לקוח_legacy,שם_איש_קשר,טלפון,אימייל,הערות\nCUST-1,דני כהן,050-0000000,d@x.com,הערה\n"
            />
          )}

          {entity === 'leads' && (
            <LeadImportSection
              getAuthHeaders={getAuthHeaders}
              leads={leads}
              customers={customers}
              projects={projects}
              users={users}
              onReloadLeads={onReloadLeads}
              onMessage={onMessage}
            />
          )}

          {entity === 'projects' && (
            <ProjectImportSection
              getAuthHeaders={getAuthHeaders}
              projects={projects}
              customers={customers}
              onReloadProjects={onReloadProjects}
              onMessage={onMessage}
            />
          )}

          {entity === 'quotes' && (
            <QuoteImportSection
              getAuthHeaders={getAuthHeaders}
              quotes={quotes}
              customers={customers}
              projects={projects}
              onReloadQuotes={onReloadQuotes}
              onMessage={onMessage}
            />
          )}

          {entity === 'reports' && (
            <ReportImportSection
              getAuthHeaders={getAuthHeaders}
              customers={customers}
              projects={projects}
              currentUserId={currentUserId}
              onMessage={onMessage}
            />
          )}

          {entity === 'files' && (
            <InfraCard
              title="קבצים — תשתית"
              body="ניתן להכין מיפוי מטא-דאטה (שם קובץ, נתיב, קשרים). העלאת ZIP והצמדה לדיסק/אחסון יתווספו בהמשך."
              csvName="תבנית_קבצים_לדוגמה.csv"
              csvContent="legacyId,שם_קובץ,נתיב,לקוח_legacy,פרויקט_legacy,דוח_legacy\nDOC-1,scan.pdf,/imports/scan.pdf,CUST-1,PRJ-1,RPT-1\n"
            />
          )}

          {entity === 'history' && (
            <InfraCard
              title="היסטוריית פעילות — תשתית"
              body="שדות מומלצים לייבוא עתידי: סוג ישות, מזהה ישן של הישות, תאריך, סוג פעילות, טקסט, משתמש (אימייל)."
              csvName="תבנית_היסטוריה_לדוגמה.csv"
              csvContent="entityType,entityLegacyId,activityDate,activityType,text,userEmail\nLEAD,LEAD-OLD-1,2025-01-10,NOTE,שיחת מעקב,sales@galit.local\n"
            />
          )}
        </div>
      )}
    </div>
  );
}
