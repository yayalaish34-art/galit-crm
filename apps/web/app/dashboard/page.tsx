'use client';

import { apiUrl, getApiBaseUrl, apiFetch } from '../lib/api-base';
import { parseApiErrorResponse } from '../lib/api-error';
import { CustomerLegacyCard } from '../customer-legacy-card';
import { QuoteNewScreen } from '../quotes/new/quote-new-screen';
import { InteractionNewScreen } from '../interactions/new/interaction-new-screen';
import { OrderNewScreen, OrderOldStyleToolbar } from '../orders/new/order-new-screen';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildQuoteTemplateContext,
  mergeQuoteTemplateFull,
  mergedHtmlToPlainDescription,
  QUOTE_SERVICE_TYPE_OPTIONS,
  QUOTE_TEMPLATE_VARIABLES_HELP,
  type QuoteTemplateLineItem,
} from '../lib/quote-template-merge';
import {
  Users,
  FileText,
  FolderKanban,
  Bell,
  Search,
  Plus,
  CheckCircle2,
  Clock3,
  AlertTriangle,
  ClipboardList,
  X,
  Building2,
  Phone,
  Mail,
  MapPin,
  UserCircle2,
  History,
  LogOut,
  Paperclip,
  FlaskConical,
  Settings,
  ChevronDown,
  ChevronRight,
  CalendarDays,
  CheckSquare,
  BarChart3,
  Loader2,
} from 'lucide-react';

import { DataImportWizard } from '../data-import-wizard';
import { FollowupImportPanel } from '../followup-import-panel';
import { isAdminRole } from '../lib/roles';
import {
  CrmLegacyTopNav,
  GLOBAL_SEARCH_INPUT_ID,
  GALIT_TOPBAR_SPACER_CLASS,
  type SettingsToolbarJumpTab,
} from '../crm-classic-toolbar';

import {
  ResponsiveContainer,
  RadialBarChart,
  RadialBar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  Legend,
} from 'recharts';

const galit = {
  // Brand colors inspired by Galit logo
  primary: '#4ba647', // primary green
  dark: '#2f5c32', // dark green / gray
  soft: '#ecf6ec', // light green background
  border: '#d4e4d6', // soft border
  text: '#163324', // dark text
};

const galitLogo = '/logo.png';

type CustomerClassificationDto = {
  id: string;
  code: string;
  labelHe: string;
  sortOrder: number;
  isPreset: boolean;
};

const PRESET_CUSTOMER_TYPE_LABELS: Record<string, string> = {
  COMPANY: 'חברה / קבלן',
  PUBLIC: 'רשות / מוסד',
  PRIVATE: 'לקוח פרטי',
};

function buildCustomerTypeLabelMap(classifications: CustomerClassificationDto[]): Record<string, string> {
  const m: Record<string, string> = { ...PRESET_CUSTOMER_TYPE_LABELS };
  for (const c of classifications) {
    m[c.code] = c.labelHe;
  }
  return m;
}

function resolveCustomerTypeLabel(type: string, labelMap: Record<string, string>) {
  const t = (type || '').trim();
  return labelMap[t] || PRESET_CUSTOMER_TYPE_LABELS[t] || t || '-';
}

type Lead = {
  id: string;
  importLegacyId?: string | null;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  name: string; // legacy display
  phone: string;
  email?: string;
  company: string;
  city?: string;
  address?: string;
  source: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  service: string; // legacy
  serviceType?: string;
  assignedUserId?: string | null;
  assignedUserName?: string;
  followUp1Date?: string | null;
  followUp2Date?: string | null;
  nextFollowUpDate?: string | null;
  leadStatus?: string;
  updatedAt?: string;
  projectId?: string | null;
  customerId?: string | null;
  createdAt?: string;
  stage?: string;
  status: string;
  assignee: string;
  site: string;
  notes?: string;
};

type Quote = {
  id: string;
  importLegacyId?: string | null;
  quoteNumber?: string | null;
  customerId?: string | null;
  customerName?: string;
  opportunityId?: string | null;
  opportunityName?: string;
  projectId?: string | null;
  client: string; // legacy display
  service: string;
  description?: string;
  amount: number; // legacy display
  amountBeforeVat?: number | null;
  vatPercent?: number | null;
  discountType?: string | null;
  discountValue?: number | null;
  totalAmount?: number | null;
  status: string;
  validTo: string; // legacy display
  validityDate?: string | null;
  pdfPath?: string | null;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
  leadId?: string | null;
  contentHtml?: string | null;
  lineItemsJson?: unknown;
  quoteTemplateId?: string | null;
};

type Opportunity = {
  id: string;
  customerId?: string | null;
  customer?: { id: string; name: string } | null;
  leadId?: string | null;
  lead?: { id: string; fullName?: string | null; phone?: string | null; email?: string | null } | null;
  projectOrServiceName: string;
  estimatedValue: number;
  pipelineStage: string;
  targetCloseDate?: string | null;
  assignedUserId?: string | null;
  assignedUser?: { id: string; name: string; email?: string } | null;
  notes?: string | null;
  createdAt?: string;
};

type Report = {
  id: string;
  projectId?: string | null;
  project?: { id: string; name: string; projectNumber?: string | null } | null;
  customerId?: string | null;
  customer?: { id: string; name: string } | null;
  title: string;
  reportType: string;
  status: string;
  createdById?: string;
  createdBy?: { id: string; name: string } | null;
  reviewedById?: string | null;
  reviewedBy?: { id: string; name: string } | null;
  reportDate?: string | null;
  sentAt?: string | null;
  pdfPath?: string | null;
  version?: number;
  internalNotes?: string | null;
  clientNotes?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type Document = {
  id: string;
  name: string;
  documentType: string;
  filePath: string;
  description?: string | null;
  projectId?: string | null;
  project?: { id: string; name: string; projectNumber?: string | null } | null;
  customerId?: string | null;
  customer?: { id: string; name: string } | null;
  reportId?: string | null;
  report?: { id: string; title: string } | null;
  uploadedById?: string | null;
  uploadedBy?: { id: string; name: string } | null;
  createdAt?: string;
  updatedAt?: string;
};

type LabSample = {
  id: string;
  sampleNumber: string;
  projectId?: string | null;
  project?: { id: string; name: string; projectNumber?: string | null } | null;
  customerId?: string | null;
  customer?: { id: string; name: string } | null;
  sampleType: string;
  sampleStatus: string;
  collectedAt?: string | null;
  receivedAt?: string | null;
  analyzedAt?: string | null;
  collectedById?: string | null;
  collectedBy?: { id: string; name: string } | null;
  locationDescription?: string | null;
  testType?: string | null;
  method?: string | null;
  resultValue?: string | null;
  resultUnit?: string | null;
  resultStatus: string;
  resultFilePath?: string | null;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type GlobalSearchResponse = {
  customers: Array<{ id: string; name: string; contactName?: string | null; phone?: string | null; email?: string | null; city?: string | null }>;
  leads: Array<{ id: string; name: string; contactName?: string | null; phone?: string | null; email?: string | null; city?: string | null; company?: string | null }>;
  projects: Array<{ id: string; name: string; customerName?: string | null; contactName?: string | null; phone?: string | null; email?: string | null; city?: string | null }>;
};

function GlobalSearchBar({
  currentUser,
  onOpenCustomer,
  onOpenLead,
  onOpenProject,
  customers,
  leads,
  projects,
  inputId,
}: {
  currentUser: AppUser;
  onOpenCustomer: (c: Customer) => void;
  onOpenLead: (l: Lead) => void;
  onOpenProject: (p: Project) => void;
  customers: Customer[];
  leads: Lead[];
  projects: Project[];
  /** מזהה לשדה החיפוש — מיקוד מסרגל קלאסי */
  inputId?: string;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<GlobalSearchResponse>({ customers: [], leads: [], projects: [] });

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setData({ customers: [], leads: [], projects: [] });
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = window.setTimeout(() => {
      apiFetch(apiUrl(`/search?q=${encodeURIComponent(query)}`), { authUser: currentUser })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((res: GlobalSearchResponse) => {
          setData(res);
        })
        .catch(() => {
          setData({ customers: [], leads: [], projects: [] });
        })
        .finally(() => setLoading(false));
    }, 250);
    return () => window.clearTimeout(t);
  }, [q, currentUser]);

  const total = data.customers.length + data.leads.length + data.projects.length;

  const openCustomerById = (id: string) => {
    const c = customers.find((x) => x.id === id) || (customers as any).find?.((x: any) => x.id === id);
    if (c) onOpenCustomer(c);
  };
  const openLeadById = (id: string) => {
    const l = leads.find((x) => x.id === id);
    if (l) onOpenLead(l);
  };
  const openProjectById = (id: string) => {
    const p = projects.find((x) => x.id === id);
    if (p) onOpenProject(p);
  };

  return (
    <div className="relative w-full max-w-2xl">
      <Input
        id={inputId}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="חפש לקוח / איש קשר / טלפון / מייל"
        className="w-full rounded-2xl bg-white pr-10"
      />
      <Search className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-slate-400" />

      {open && (
        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-2xl border bg-white shadow-lg">
          {loading && (
            <div className="px-4 py-3 text-sm text-slate-500">טוען...</div>
          )}
          {!loading && q.trim().length >= 2 && total === 0 && (
            <div className="px-4 py-3 text-sm text-slate-500">לא נמצאו תוצאות</div>
          )}

          {!loading && total > 0 && (
            <div className="max-h-[420px] overflow-auto">
              {data.customers.length > 0 && (
                <div className="border-b">
                  <div className="bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600">לקוחות</div>
                  {data.customers.map((c) => (
                    <button
                      key={c.id}
                      className="flex w-full flex-col gap-1 px-4 py-3 text-right hover:bg-slate-50"
                      onClick={() => {
                        openCustomerById(c.id);
                        setOpen(false);
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-medium text-slate-900">{c.name}</div>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">לקוח</span>
                      </div>
                      <div className="text-xs text-slate-500">
                        {[
                          c.contactName,
                          c.phone ? phoneToDisplay(c.phone) : null,
                          c.email,
                          c.city,
                        ]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {data.leads.length > 0 && (
                <div className="border-b">
                  <div className="bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600">לידים</div>
                  {data.leads.map((l) => (
                    <button
                      key={l.id}
                      className="flex w-full flex-col gap-1 px-4 py-3 text-right hover:bg-slate-50"
                      onClick={() => {
                        openLeadById(l.id);
                        setOpen(false);
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-medium text-slate-900">{l.name}</div>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">ליד</span>
                      </div>
                      <div className="text-xs text-slate-500">
                        {[
                          l.company,
                          l.phone ? phoneToDisplay(l.phone) : null,
                          l.email,
                          l.city,
                        ]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {data.projects.length > 0 && (
                <div>
                  <div className="bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600">פרויקטים</div>
                  {data.projects.map((p) => (
                    <button
                      key={p.id}
                      className="flex w-full flex-col gap-1 px-4 py-3 text-right hover:bg-slate-50"
                      onClick={() => {
                        openProjectById(p.id);
                        setOpen(false);
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-medium text-slate-900">{p.name}</div>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">פרויקט</span>
                      </div>
                      <div className="text-xs text-slate-500">
                        {[
                          p.customerName,
                          p.contactName,
                          p.phone ? phoneToDisplay(p.phone) : null,
                          p.email,
                          p.city,
                        ]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="border-t bg-white px-4 py-2 text-left">
            <button className="text-xs text-slate-500 hover:text-slate-700" onClick={() => setOpen(false)}>
              סגור
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

type Project = {
  id: string;
  importLegacyId?: string | null;
  projectNumber?: string | null;
  name: string;
  client: string;
  status: string;
  progress: number;
  owner: string;
  due: string;
  service?: string | null;
  siteVisitDate?: string | null;
  siteVisitTime?: string | null;
  city?: string | null;
  urgency?: string | null;
  notes?: string | null;
  assignedTechnicianId?: string | null;
  assignedTechnician?: { id: string; name: string } | null;
  customerId?: string | null;
  customer?: { id: string; name: string; city?: string | null } | null;
  assignedReportWriterId?: string | null;
  assignedReportWriter?: { id: string; name: string } | null;
  serviceCategory?: string | null;
  serviceSubType?: string | null;
  address?: string | null;
  contactPhone?: string | null;
  fieldContactPhone?: string | null;
  createdAt?: string;
};

type Task = {
  id: string;
  title: string;
  description?: string;
  ownerId?: string;
  owner: string;
  projectId?: string | null;
  projectName?: string;
  customerId?: string | null;
  customerName?: string;
  dueDate?: string | null;
  due: string;
  priority: string;
  status?: string;
  type?: string;
};

type Customer = {
  id: string;
  importLegacyId?: string | null;
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
  phone2?: string | null;
  phone3?: string | null;
  fax?: string | null;
  website?: string | null;
  companyRegNumber?: string | null;
  internalNotes?: string | null;
  zipLegacy?: string | null;
  cityCodeLegacy?: string | null;
  legacyUpdatedAt?: string | null;
  balanceLegacy?: unknown;
  birthdayLegacy?: string | null;
};

type TimelineEvent = {
  id: string;
  customerName: string;
  date: string;
  title: string;
  description: string;
};

type DashboardStats = {
  // Wave 3 operational widgets (from /reports/dashboard)
  reportsWaitingWriting: number;
  reportsInReview: number;
  reportsSentThisWeek: number;
  samplesCollected: number;
  samplesInAnalysis: number;
  abnormalSampleResults: number;
  projectsWaitingForData: number;
};

type AppUserRole = 'admin' | 'technician' | 'sales' | 'manager' | 'expert' | 'billing';

type AppUser = {
  id: string;
  name: string;
  email: string;
  role: AppUserRole;
  password: string;
  status: 'פעיל' | 'לא פעיל';

  // Basic permission overrides (stage 1 permissions system)
  canViewFinance: boolean;
  canEditFinance: boolean;
  canDeleteCustomers: boolean;
  canDeleteLeads: boolean;
  canManageUsers: boolean;
  canManagePermissions: boolean;
  canViewAllRecords: boolean;
};

const GALIT_CRM_SESSION_STORAGE_KEY = 'galit-crm-session';

type StoredSessionUser = {
  id: string;
  name: string;
  email: string;
  role: AppUserRole;
  status: 'פעיל' | 'לא פעיל';
  canViewFinance: boolean;
  canEditFinance: boolean;
  canDeleteCustomers: boolean;
  canDeleteLeads: boolean;
  canManageUsers: boolean;
  canManagePermissions: boolean;
  canViewAllRecords: boolean;
};

function parseStoredSession(): AppUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(GALIT_CRM_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<StoredSessionUser>;
    if (!s?.id || !s?.role) return null;
    const role = String(s.role).toLowerCase() as AppUserRole;
    return {
      id: s.id,
      name: s.name || s.email || s.id,
      email: s.email || '',
      role: role || 'sales',
      password: '******',
      status: s.status === 'לא פעיל' ? 'לא פעיל' : 'פעיל',
      canViewFinance: !!s.canViewFinance,
      canEditFinance: !!s.canEditFinance,
      canDeleteCustomers: !!s.canDeleteCustomers,
      canDeleteLeads: !!s.canDeleteLeads,
      canManageUsers: !!s.canManageUsers,
      canManagePermissions: !!s.canManagePermissions,
      canViewAllRecords: !!s.canViewAllRecords,
    };
  } catch {
    return null;
  }
}

function sessionPayloadFromAppUser(u: AppUser): StoredSessionUser {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    status: u.status,
    canViewFinance: u.canViewFinance,
    canEditFinance: u.canEditFinance,
    canDeleteCustomers: u.canDeleteCustomers,
    canDeleteLeads: u.canDeleteLeads,
    canManageUsers: u.canManageUsers,
    canManagePermissions: u.canManagePermissions,
    canViewAllRecords: u.canViewAllRecords,
  };
}

const timelineSeed: TimelineEvent[] = [
  {
    id: 'EV-1',
    customerName: 'אפקון',
    date: '12/03/2026',
    title: 'הצעת מחיר נשלחה',
    description: 'נשלחה הצעת מחיר לבדיקת קרינה באתר עזריאלי.',
  },
  {
    id: 'EV-2',
    customerName: 'אפקון',
    date: '14/03/2026',
    title: 'שיחה עם הלקוח',
    description: 'שיחה עם אורי כהן לגבי לוחות זמנים לביצוע.',
  },
  {
    id: 'EV-3',
    customerName: 'אפקון',
    date: '17/03/2026',
    title: 'בדיקה בשטח',
    description: 'בוצעה בדיקת קרינה באתר.',
  },
  {
    id: 'EV-4',
    customerName: 'אפקון',
    date: '21/03/2026',
    title: 'דוח נשלח',
    description: 'נשלח דוח ביניים ללקוח.',
  },
  {
    id: 'EV-5',
    customerName: 'שרה לוי',
    date: '10/03/2026',
    title: 'פנייה חדשה',
    description: 'התקבלה פנייה לגבי בדיקת ראדון.',
  },
  {
    id: 'EV-6',
    customerName: 'שרה לוי',
    date: '15/03/2026',
    title: 'תיאום ביקור',
    description: 'נקבע ביקור בית לשבוע הבא.',
  },
];

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function Card({ className = '', children }: React.PropsWithChildren<{ className?: string }>) {
  return <div className={cn('rounded-3xl border bg-white shadow-sm', className)}>{children}</div>;
}

function CardHeader({ className = '', children }: React.PropsWithChildren<{ className?: string }>) {
  return <div className={cn('px-5 pt-5', className)}>{children}</div>;
}

function CardTitle({ className = '', children }: React.PropsWithChildren<{ className?: string }>) {
  return <h3 className={cn('text-lg font-bold', className)}>{children}</h3>;
}

function CardContent({ className = '', children }: React.PropsWithChildren<{ className?: string }>) {
  return <div className={cn('p-5', className)}>{children}</div>;
}

function Button({
  children,
  className = '',
  variant = 'default',
  style,
  onClick,
  type = 'button',
  disabled,
}: React.PropsWithChildren<{
  className?: string;
  variant?: 'default' | 'outline';
  style?: React.CSSProperties;
  onClick?: () => void | Promise<void>;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
}>) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={style}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium transition',
        disabled ? 'cursor-not-allowed opacity-60' : '',
        variant === 'outline'
          ? 'border border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
          : 'text-white hover:opacity-90',
        className,
      )}
    >
      {children}
    </button>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        'w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-slate-400',
        props.className || '',
      )}
    />
  );
}

function FormField({
  label,
  children,
  labelClassName,
}: {
  label: string;
  children: React.ReactNode;
  labelClassName?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className={cn('text-right text-xs text-slate-500', labelClassName)}>{label}</div>
      {children}
    </div>
  );
}

type EntityTimelineItem = {
  id: string;
  title: string;
  at?: string | Date | null;
  description?: string;
};

function timelineTs(value?: string | Date | null) {
  if (!value) return 0;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

function timelineDateLabel(value?: string | Date | null) {
  if (!value) return 'ללא תאריך';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'ללא תאריך';
  return d.toLocaleString('he-IL');
}

function EntityTimeline({ items, emptyText = 'אין אירועים להצגה' }: { items: EntityTimelineItem[]; emptyText?: string }) {
  const sorted = useMemo(
    () => [...items].sort((a, b) => timelineTs(a.at) - timelineTs(b.at)),
    [items],
  );

  if (sorted.length === 0) {
    return <div className="text-sm text-slate-500">{emptyText}</div>;
  }

  return (
    <div className="space-y-3">
      {sorted.map((item) => (
        <div key={item.id} className="rounded-2xl border p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="font-semibold">{item.title}</div>
            <div className="text-xs text-slate-400">{timelineDateLabel(item.at)}</div>
          </div>
          {item.description && <div className="mt-2 text-sm text-slate-600 whitespace-pre-wrap">{item.description}</div>}
        </div>
      ))}
    </div>
  );
}

function normalizeIsraeliPhoneDigits(value: string) {
  const digits = (value || '').toString().replace(/\D/g, '');
  if (!digits) return '';

  // Support international +972 format -> convert to leading 0.
  if (digits.startsWith('972')) return `0${digits.slice(3)}`;

  return digits;
}

function formatIsraeliPhone(value: string) {
  const digits = normalizeIsraeliPhoneDigits(value);
  if (!digits) return null;

  // Mobile: 050/051/052/053/054/055/056/057/058/059 and similar ranges (commonly 05x...) and 07x
  if ((digits.startsWith('05') || digits.startsWith('07')) && digits.length === 10) {
    const area = digits.slice(0, 3);
    const rest = digits.slice(3); // 7 digits
    return `${area}-${rest}`;
  }

  // Landline: 02/03/04/08 + 7 digits (total 9 digits)
  const landlinePrefixes = ['02', '03', '04', '08'];
  if (landlinePrefixes.some((p) => digits.startsWith(p)) && digits.length === 9) {
    return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  }

  return null;
}

function validateIsraeliPhone(value: string) {
  if (!value || value.toString().trim() === '') return true; // allow empty (optional fields)
  return !!formatIsraeliPhone(value);
}

function phoneToDisplay(phone?: string | null) {
  if (!phone) return '-';
  return formatIsraeliPhone(phone) || phone;
}

function phoneToTelHref(phone?: string | null) {
  const digits = normalizeIsraeliPhoneDigits(phone || '');
  if (!digits) return null;
  // Convert leading 0 -> +972 for tel: links.
  if (digits.startsWith('0')) return `tel:+972${digits.slice(1)}`;
  return `tel:${digits}`;
}

function phoneToWhatsAppHref(phone?: string | null) {
  const digits = normalizeIsraeliPhoneDigits(phone || '');
  if (!digits) return null;
  // wa.me expects country code without '+' and without leading zero.
  const number = digits.startsWith('0') ? `972${digits.slice(1)}` : digits;
  return `https://wa.me/${number}`;
}

function emailToMailtoHref(email?: string | null) {
  const e = normalizeEmail(email || '');
  if (!e) return null;
  if (!validateEmail(e)) return null;
  return `mailto:${e}`;
}

function PhoneInput({
  value,
  onChange,
  placeholder = 'טלפון',
  className = '',
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [touched, setTouched] = useState(false);

  const formatted = value ? formatIsraeliPhone(value) : null;
  const error = touched && value.trim() !== '' && !formatted ? 'מספר טלפון לא תקין' : '';

  const commit = () => {
    setTouched(true);
    if (!value || value.trim() === '') {
      onChange('');
      return;
    }
    const f = formatIsraeliPhone(value);
    if (f) onChange(f);
  };

  return (
    <div className="space-y-1">
      <Input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            // Trigger formatting when leaving the field.
            commit();
          }
        }}
        className={cn(error ? 'border-red-500 bg-red-50 focus:border-red-500' : '', className)}
      />
      {error && <div className="text-xs text-red-700">{error}</div>}
    </div>
  );
}

function normalizeEmail(value: string) {
  return (value || '').toString().trim().toLowerCase();
}

function validateEmail(value: string) {
  const v = (value || '').toString().trim();
  if (!v) return true; // allow empty when email is optional
  // Simple RFC-ish email check; good enough for UI validation.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function EmailInput({
  value,
  onChange,
  placeholder = 'אימייל',
  className = '',
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [touched, setTouched] = useState(false);

  const normalized = value ? normalizeEmail(value) : '';
  const isValid = validateEmail(normalized);
  const error = touched && normalized.trim() !== '' && !isValid ? 'אימייל לא תקין' : '';

  const commit = () => {
    setTouched(true);
    const next = normalizeEmail(value);
    if (next === '') {
      onChange('');
      return;
    }
    if (!validateEmail(next)) return; // keep user text; error will show
    onChange(next);
  };

  return (
    <div className="space-y-1">
      <Input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
        className={cn(error ? 'border-red-500 bg-red-50 focus:border-red-500' : '', className)}
      />
      {error && <div className="text-xs text-red-700">{error}</div>}
    </div>
  );
}

function formatNumericIdentifier(value: string) {
  return (value || '').toString().replace(/\D/g, '');
}

// Israeli ID number validation (9 digits) with checksum.
function validateIsraeliId(value: string) {
  const digits = formatNumericIdentifier(value);
  if (!digits) return true; // optional
  if (digits.length !== 9) return false;

  let sum = 0;
  for (let i = 0; i < 9; i += 1) {
    let d = parseInt(digits[i] || '0', 10);
    // Positions 1,3,5,7,9 (from left) are doubled.
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

function validateCompanyNumber(value: string) {
  const digits = formatNumericIdentifier(value);
  if (!digits) return true; // optional
  // For UI validation, we keep it pragmatic: accept only 9 digits.
  return digits.length === 9;
}

function parseCurrencyInput(value: string) {
  const raw = (value || '').toString().trim();
  if (!raw) return null;

  // Keep digits, separators, and minus sign only.
  const cleaned = raw.replace(/[^0-9.,-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.' || cleaned === ',') return null;

  const isNegative = cleaned.startsWith('-');
  const unsigned = cleaned.replace(/-/g, '');

  // If both separators exist, treat comma as thousands separator.
  if (unsigned.includes('.') && unsigned.includes(',')) {
    const num = parseFloat(unsigned.replace(/,/g, ''));
    if (!Number.isFinite(num)) return null;
    return isNegative ? -num : num;
  }

  // If only one type of separator exists:
  if (unsigned.includes(',')) {
    const parts = unsigned.split(',');
    const last = parts[parts.length - 1] || '';
    // Treat as decimal if last part looks like decimal digits.
    const treatAsDecimal = last.length > 0 && last.length <= 2;
    const normalized = treatAsDecimal ? `${parts.slice(0, -1).join('')}.${last}` : unsigned.replace(/,/g, '');
    const num = parseFloat(normalized);
    if (!Number.isFinite(num)) return null;
    return isNegative ? -num : num;
  }

  // '.' decimal or no separators
  const num = parseFloat(unsigned.replace(/,/g, ''));
  if (!Number.isFinite(num)) return null;
  return isNegative ? -num : num;
}

function formatCurrencyNumberStringILS(value: number) {
  if (!Number.isFinite(value)) return '0';
  const abs = Math.abs(value);
  const decimals = Math.abs(abs % 1) < 1e-9 ? 0 : 2;
  if (decimals === 0) {
    return `${value < 0 ? '-' : ''}${Math.round(abs).toLocaleString('en-US')}`;
  }
  const fixed = abs.toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  return `${value < 0 ? '-' : ''}${Number(intPart).toLocaleString('en-US')}.${decPart}`;
}

function formatCurrencyILS(value: number) {
  if (!Number.isFinite(value)) return '₪0';
  const num = value;
  const formatted = formatCurrencyNumberStringILS(Math.abs(num));
  const sign = num < 0 ? '-' : '';
  // formatted here has no ₪; add it back consistently.
  return `${sign}₪${formatted}`;
}

function CurrencyInput({
  value,
  onChange,
  placeholder,
  className = '',
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [touched, setTouched] = useState(false);

  const parsed = value ? parseCurrencyInput(value) : null;
  const error = touched && (value || '').trim() !== '' && parsed === null ? 'סכום לא תקין' : '';

  const commit = () => {
    setTouched(true);
    if (!value || value.trim() === '') {
      onChange('');
      return;
    }
    const p = parseCurrencyInput(value);
    if (p === null) return;
    onChange(formatCurrencyNumberStringILS(p));
  };

  return (
    <div className="space-y-1">
      <Input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
        className={cn(error ? 'border-red-500 bg-red-50 focus:border-red-500' : '', className)}
      />
      {error && <div className="text-xs text-red-700">{error}</div>}
    </div>
  );
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        'min-h-[110px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-slate-400',
        props.className || '',
      )}
    />
  );
}

function Badge({ children, className = '' }: React.PropsWithChildren<{ className?: string }>) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-1 text-xs font-medium', className)}>
      {children}
    </span>
  );
}

function Progress({ value }: { value: number }) {
  return (
    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${value}%`, background: galit.primary }} />
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-slate-400"
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

function Table({ children, className = '' }: React.PropsWithChildren<{ className?: string }>) {
  return <div className="w-full overflow-x-auto"><table className={cn('w-full text-sm', className)}>{children}</table></div>;
}
function TableHeader({ children }: React.PropsWithChildren) {
  return <thead className="border-b bg-slate-50">{children}</thead>;
}
function TableBody({ children }: React.PropsWithChildren) {
  return <tbody>{children}</tbody>;
}
function TableRow({ children, className = '', onClick }: React.PropsWithChildren<{ className?: string; onClick?: () => void }>) {
  return <tr onClick={onClick} className={cn('border-b last:border-b-0', className)}>{children}</tr>;
}
function TableHead({ children, className }: React.PropsWithChildren<{ className?: string }>) {
  return <th className={`px-4 py-3 text-right font-semibold text-slate-600 ${className || ''}`}>{children}</th>;
}
function TableCell({
  children,
  className = '',
  colSpan,
}: React.PropsWithChildren<{ className?: string; colSpan?: number }>) {
  return <td colSpan={colSpan} className={cn('px-4 py-3 align-top', className)}>{children}</td>;
}

function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = 'max-w-lg',
  hideHeader = false,
  titleClassName,
}: React.PropsWithChildren<{
  open: boolean;
  onClose: () => void;
  title: string;
  maxWidth?: string;
  hideHeader?: boolean;
  titleClassName?: string;
}>) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className={cn('w-full rounded-3xl bg-white shadow-2xl', maxWidth)}>
        {!hideHeader && (
          <div className="flex items-center justify-between border-b px-5 py-4">
            <h3 className={cn('text-lg font-bold', titleClassName)}>{title}</h3>
            <button onClick={onClose} className="rounded-full p-2 hover:bg-slate-100" aria-label="סגור">
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        <div className="max-h-[80vh] overflow-y-auto p-5 relative">
          {hideHeader && (
            <button
              onClick={onClose}
              className="absolute right-5 top-5 rounded-full bg-white/80 p-2 shadow-sm hover:bg-white"
              aria-label="סגור"
            >
              <X className="h-5 w-5" />
            </button>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

/* ─── Customer Search Modal (חפש → לקוח) ───────────────────────────── */
function CustomerSearchModal({
  open,
  customers,
  onClose,
  onSelect,
}: {
  open: boolean;
  customers: Customer[];
  onClose: () => void;
  onSelect: (customer: Customer) => void;
}) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  if (!open) return null;

  const q = query.trim().toLowerCase();
  const filtered = q
    ? customers.filter((c) =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.contactName || '').toLowerCase().includes(q) ||
        (c.phone || '').includes(q) ||
        (c.phone2 || '').includes(q) ||
        (c.phone3 || '').includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.city || '').toLowerCase().includes(q) ||
        (c.address || '').toLowerCase().includes(q) ||
        (c.companyRegNumber || '').toLowerCase().includes(q) ||
        (c.importLegacyId || '').toLowerCase().includes(q) ||
        (c.fax || '').includes(q) ||
        (c.website || '').toLowerCase().includes(q) ||
        (c.status || '').toLowerCase().includes(q)
      )
    : customers;
  const results = filtered.slice(0, 50);

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-5xl rounded-2xl bg-white shadow-2xl"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h3 className="text-base font-bold text-slate-800">חיפוש לקוח</h3>
          <button onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="סגור">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Large smart search input */}
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-3 rounded-xl border-2 border-slate-300 bg-white px-4 py-3 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-200">
            <Search className="h-5 w-5 shrink-0 text-slate-400" />
            <input
              ref={inputRef}
              className="flex-1 bg-transparent text-base outline-none placeholder:text-slate-400"
              placeholder="חיפוש לפי שם לקוח / איש קשר / טלפון / נייד / מייל / עיר / כתובת / ח.פ / סימוכין"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') onClose();
              }}
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="mt-2 text-xs text-slate-400">
            {q ? `${results.length} תוצאות${filtered.length > 50 ? ` מתוך ${filtered.length}` : ''}` : `${customers.length} לקוחות`}
          </div>
        </div>

        {/* Results table */}
        <div className="max-h-[55vh] overflow-y-auto">
          {results.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-slate-400">
              {q ? 'לא נמצאו לקוחות תואמים' : 'אין לקוחות'}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50">
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                  <th className="px-3 py-2 text-right">שם לקוח</th>
                  <th className="px-3 py-2 text-right">איש קשר</th>
                  <th className="px-3 py-2 text-right">עיר</th>
                  <th className="px-3 py-2 text-right">טלפון</th>
                  <th className="px-3 py-2 text-right">מייל</th>
                  <th className="px-3 py-2 text-right">ח.פ</th>
                  <th className="px-3 py-2 text-right">סטטוס</th>
                </tr>
              </thead>
              <tbody>
                {results.map((c) => (
                  <tr
                    key={c.id}
                    className="cursor-pointer border-b border-slate-100 transition-colors hover:bg-emerald-50"
                    onClick={() => onSelect(c)}
                    onDoubleClick={() => onSelect(c)}
                  >
                    <td className="px-3 py-2 font-medium text-slate-800">{c.name}</td>
                    <td className="px-3 py-2 text-slate-600">{c.contactName || '—'}</td>
                    <td className="px-3 py-2 text-slate-600">{c.city || '—'}</td>
                    <td className="px-3 py-2 text-slate-600" dir="ltr">{c.phone || '—'}</td>
                    <td className="px-3 py-2 text-slate-500 text-xs" dir="ltr">{c.email || '—'}</td>
                    <td className="px-3 py-2 text-slate-500 text-xs" dir="ltr">{c.companyRegNumber || '—'}</td>
                    <td className="px-3 py-2">
                      <span className={cn(
                        'inline-block rounded-full px-2 py-0.5 text-xs font-medium',
                        c.status === 'פעיל' ? 'bg-emerald-100 text-emerald-700' :
                        c.status === 'לא פעיל' ? 'bg-slate-100 text-slate-500' :
                        'bg-slate-100 text-slate-600'
                      )}>{c.status || '—'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-5 py-2.5 text-left">
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-slate-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
          >
            סגור
          </button>
        </div>
      </div>
    </div>
  );
}

function QuoteSearchModal({
  open,
  quotes,
  customers,
  onClose,
  onSelect,
}: {
  open: boolean;
  quotes: Quote[];
  customers: Customer[];
  onClose: () => void;
  onSelect: (quote: Quote) => void;
}) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  /* Build lookup maps from customers so we can search contact-level fields on quotes */
  const customerMap = useMemo(() => {
    const m: Record<string, Customer> = {};
    for (const c of customers) { if (c.id) m[c.id] = c; }
    return m;
  }, [customers]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  if (!open) return null;

  const today = new Date().toISOString().slice(0, 10);
  const q = query.trim().toLowerCase();

  const filtered = q
    ? quotes.filter((qt) => {
        const cust = qt.customerId ? customerMap[qt.customerId] : null;
        return (
          (qt.quoteNumber || '').toLowerCase().includes(q) ||
          (qt.importLegacyId || '').toLowerCase().includes(q) ||
          (qt.customerName || qt.client || '').toLowerCase().includes(q) ||
          (qt.service || '').toLowerCase().includes(q) ||
          (qt.description || '').toLowerCase().includes(q) ||
          (qt.status || '').toLowerCase().includes(q) ||
          (qt.notes || '').toLowerCase().includes(q) ||
          (qt.opportunityName || '').toLowerCase().includes(q) ||
          /* contact-level fields via customer lookup */
          (cust ? (cust.contactName || '').toLowerCase().includes(q) : false) ||
          (cust ? (cust.city || '').toLowerCase().includes(q) : false) ||
          (cust ? (cust.phone || '').includes(q) : false) ||
          (cust ? (cust.phone2 || '').includes(q) : false) ||
          (cust ? (cust.email || '').toLowerCase().includes(q) : false) ||
          (cust ? (cust.address || '').toLowerCase().includes(q) : false) ||
          (cust ? (cust.companyRegNumber || '').toLowerCase().includes(q) : false)
        );
      })
    : quotes;
  const results = filtered.slice(0, 80);

  const getValidity = (qt: Quote) => {
    const vd = qt.validityDate || qt.validTo || '';
    if (!vd) return { label: '—', expired: false };
    const d = vd.slice(0, 10);
    return { label: d, expired: d < today };
  };

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-5xl rounded-2xl bg-white shadow-2xl"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h3 className="text-base font-bold text-slate-800">חיפוש הצעות מחיר</h3>
          <button onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="סגור">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Large smart search input */}
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-3 rounded-xl border-2 border-slate-300 bg-white px-4 py-3 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-200">
            <Search className="h-5 w-5 shrink-0 text-slate-400" />
            <input
              ref={inputRef}
              className="flex-1 bg-transparent text-base outline-none placeholder:text-slate-400"
              placeholder="חיפוש לפי מספר הצעה / סימוכין / לקוח / איש קשר / עיר / טלפון / מייל / סטטוס / תיאור"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') onClose();
              }}
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="mt-2 text-xs text-slate-400">
            {q ? `${results.length} תוצאות${filtered.length > 80 ? ` מתוך ${filtered.length}` : ''}` : `${quotes.length} הצעות`}
          </div>
        </div>

        {/* Results table */}
        <div className="max-h-[50vh] overflow-y-auto">
          {results.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-slate-400">
              {q ? 'לא נמצאו הצעות תואמות' : 'אין הצעות'}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50">
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                  <th className="px-3 py-2 text-right">מספר הצעה</th>
                  <th className="px-3 py-2 text-right">סימוכין</th>
                  <th className="px-3 py-2 text-right">תאריך</th>
                  <th className="px-3 py-2 text-right">שם לקוח</th>
                  <th className="px-3 py-2 text-right">איש קשר</th>
                  <th className="px-3 py-2 text-right">עיר</th>
                  <th className="px-3 py-2 text-right">סטטוס</th>
                  <th className="px-3 py-2 text-right">תוקף הצעה</th>
                </tr>
              </thead>
              <tbody>
                {results.map((qt) => {
                  const { label: validLabel, expired } = getValidity(qt);
                  const cust = qt.customerId ? customerMap[qt.customerId] : null;
                  const city = cust?.city || '';
                  const contact = cust?.contactName || '';
                  return (
                    <tr
                      key={qt.id}
                      className="cursor-pointer border-b border-slate-100 transition-colors hover:bg-emerald-50"
                      onClick={() => onSelect(qt)}
                      onDoubleClick={() => onSelect(qt)}
                    >
                      <td className="px-3 py-2 font-medium text-slate-800">{qt.quoteNumber || '—'}</td>
                      <td className="px-3 py-2 text-slate-600">{qt.importLegacyId || '—'}</td>
                      <td className="px-3 py-2 text-slate-600">{qt.createdAt ? qt.createdAt.slice(0, 10) : '—'}</td>
                      <td className="px-3 py-2 text-slate-700">{qt.customerName || qt.client || '—'}</td>
                      <td className="px-3 py-2 text-slate-600">{contact || '—'}</td>
                      <td className="px-3 py-2 text-slate-600">{city || '—'}</td>
                      <td className="px-3 py-2">
                        <span className={cn(
                          'inline-block rounded-full px-2 py-0.5 text-xs font-medium',
                          qt.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' :
                          qt.status === 'SENT' ? 'bg-blue-100 text-blue-700' :
                          qt.status === 'DRAFT' ? 'bg-slate-100 text-slate-600' :
                          qt.status === 'REJECTED' ? 'bg-red-100 text-red-700' :
                          'bg-slate-100 text-slate-600'
                        )}>{qt.status || '—'}</span>
                      </td>
                      <td className="px-3 py-2">
                        <span className={cn(
                          'inline-block rounded-full px-2 py-0.5 text-xs font-bold',
                          expired ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                        )}>
                          {validLabel}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-5 py-2.5 text-left">
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-slate-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
          >
            סגור
          </button>
        </div>
      </div>
    </div>
  );
}

function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="flex items-center justify-center rounded-full bg-white shadow-sm"
        style={{ width: size, height: size }}
      >
        <img
          src={galitLogo}
          alt="גלית - החברה לאיכות הסביבה"
          style={{ maxWidth: '70%', maxHeight: '70%' }}
        />
      </div>
      <div className="flex flex-col leading-tight">
        <span className="text-base font-bold text-white">גלית CRM</span>
        <span className="text-[11px] text-white/80">החברה לאיכות הסביבה</span>
      </div>
    </div>
  );
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    NEW: 'bg-slate-100 text-slate-700',
    FU_1: 'bg-amber-100 text-amber-700',
    FU_2: 'bg-orange-100 text-orange-700',
    QUOTE_SENT: 'bg-blue-100 text-blue-700',
    WON: 'bg-green-100 text-green-700',
    LOST: 'bg-red-100 text-red-700',
    DRAFT: 'bg-slate-100 text-slate-700',
    SENT: 'bg-blue-100 text-blue-700',
    APPROVED: 'bg-green-100 text-green-700',
    REJECTED: 'bg-red-100 text-red-700',
    SIGNED: 'bg-green-100 text-green-700',
    EXPIRED: 'bg-red-100 text-red-700',
    REPORT_IN_PROGRESS: 'bg-purple-100 text-purple-700',
    VISIT_SCHEDULED: 'bg-cyan-100 text-cyan-700',
    WAITING_QUOTE: 'bg-cyan-100 text-cyan-700',
    WAITING_APPROVAL: 'bg-cyan-100 text-cyan-700',
    SCHEDULED: 'bg-cyan-100 text-cyan-700',
    ON_THE_WAY: 'bg-orange-100 text-orange-700',
    FIELD_WORK_DONE: 'bg-emerald-100 text-emerald-800',
    WAITING_DATA: 'bg-slate-100 text-slate-700',
    REPORT_WRITING: 'bg-purple-100 text-purple-700',
    SENT_TO_CLIENT: 'bg-blue-100 text-blue-700',
    CLOSED: 'bg-emerald-100 text-emerald-800',
    POSTPONED: 'bg-amber-100 text-amber-700',
    CANCELLED: 'bg-red-100 text-red-700',
  };
  return map[status] || 'bg-slate-100 text-slate-700';
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    NEW: 'חדש',
    CONTACTED: 'נוצר קשר',
    FU_1: 'פולואפ 1',
    FU_2: 'פולואפ 2',
    QUOTE_SENT: 'הצעה נשלחה',
    NEGOTIATION: 'משא ומתן',
    WON: 'זכה',
    LOST: 'אבוד',
    NOT_RELEVANT: 'לא רלוונטי',
    DRAFT: 'טיוטה',
    SENT: 'נשלחה',
    APPROVED: 'אושרה',
    REJECTED: 'נדחתה',
    SIGNED: 'נחתמה',
    EXPIRED: 'פג תוקף',
    WAITING_QUOTE: 'ממתין להצעת מחיר',
    WAITING_APPROVAL: 'ממתין לאישור',
    SCHEDULED: 'מתוזמן',
    ON_THE_WAY: 'בדרך',
    FIELD_WORK_DONE: 'עבודת שטח הושלמה',
    REPORT_IN_PROGRESS: 'דוח בהכנה',
    WAITING_DATA: 'ממתין לנתונים',
    REPORT_WRITING: 'כתיבת דוח',
    VISIT_SCHEDULED: 'ביקור נקבע',
    SENT_TO_CLIENT: 'נשלח ללקוח',
    CLOSED: 'נסגר',
    POSTPONED: 'נדחה',
    CANCELLED: 'בוטל',
  };
  return map[status] || status;
}

function reportTypeLabel(type: string) {
  const map: Record<string, string> = {
    RADIATION_REPORT: 'דוח קרינה',
    ACOUSTIC_REPORT: 'דוח אקוסטיקה / רעש',
    AIR_QUALITY_REPORT: 'דוח איכות אוויר',
    ASBESTOS_REPORT: 'דוח אסבסט',
    RADON_REPORT: 'דוח ראדון',
    ODOUR_REPORT: 'דוח ריח',
    SOIL_REPORT: 'דוח קרקע',
    LAB_REPORT: 'דוח מעבדה',
    OTHER: 'אחר',
  };
  return map[type] || type;
}

function documentTypeLabel(type: string) {
  const map: Record<string, string> = {
    CONTRACT: 'הסכם',
    QUOTE: 'הצעת מחיר',
    PLAN: 'תכנית',
    PHOTO: 'תמונה',
    REPORT: 'דוח',
    LAB_RESULT: 'תוצאת מעבדה',
    CERTIFICATE: 'תעודה',
    INVOICE: 'חשבונית',
    OTHER: 'אחר',
  };
  return map[type] || type;
}

function labSampleTypeLabel(type: string) {
  const map: Record<string, string> = {
    AIR: 'אוויר',
    SURFACE: 'משטח',
    WATER: 'מים',
    SOIL: 'קרקע',
    RADON: 'ראדון',
    ASBESTOS: 'אסבסט',
    MICROBIOLOGY: 'מיקרוביולוגיה',
    OTHER: 'אחר',
  };
  return map[type] || type;
}

function labSampleStatusLabel(status: string) {
  const map: Record<string, string> = {
    COLLECTED: 'נאסף',
    RECEIVED: 'התקבל',
    IN_ANALYSIS: 'בבדיקה',
    COMPLETED: 'הושלם',
    REPORTED: 'דווח',
  };
  return map[status] || status;
}

function labSampleResultStatusLabel(status: string) {
  const map: Record<string, string> = {
    PENDING: 'ממתין לתוצאה',
    NORMAL: 'תקין',
    ABNORMAL: 'חריג',
  };
  return map[status] || status;
}

function taskPriorityLabel(priority: string) {
  const map: Record<string, string> = {
    LOW: 'נמוכה',
    MEDIUM: 'בינונית',
    HIGH: 'גבוהה',
    URGENT: 'דחופה',
  };
  return map[(priority || '').toUpperCase()] || priority || '-';
}

function taskStatusLabelForTasks(status: string) {
  const map: Record<string, string> = {
    OPEN: 'פתוחה',
    IN_PROGRESS: 'בביצוע',
    DONE: 'הושלמה',
    CANCELLED: 'בוטלה',
  };
  return map[(status || '').toUpperCase()] || status || '-';
}

function taskTypeLabelForTasks(type: string) {
  const map: Record<string, string> = {
    SALES_FOLLOWUP: 'מעקב מכירות',
    QUOTE_PREPARATION: 'הכנת הצעת מחיר',
    COORDINATION: 'תיאום',
    FIELD_WORK: 'עבודת שטח',
    REPORT_WRITING: 'כתיבת דוח',
    REVIEW: 'בקרה',
    COLLECTION: 'גבייה',
    GENERAL: 'כללי',
  };
  return map[(type || '').toUpperCase()] || type || '-';
}

function findCustomerByLead(lead: Lead, customers: Customer[]) {
  return customers.find((customer) => {
    const byName = customer.contactName === lead.name;
    const byPhone = customer.phone === lead.phone;
    const byCompany = lead.company && lead.company !== 'פרטי' && customer.name === lead.company;
    const privateByName = lead.company === 'פרטי' && customer.name === lead.name;
    return byName || byPhone || byCompany || privateByName;
  });
}

function roleLabel(role: AppUserRole) {
  const map: Record<AppUserRole, string> = {
    admin: 'מנהל מערכת',
    technician: 'טכנאי',
    sales: 'מכירות',
    manager: 'מנהל',
    expert: 'מומחה',
    billing: 'גבייה',
  };
  return map[role];
}

function roleBadge(role: AppUserRole) {
  const map: Record<AppUserRole, string> = {
    admin: 'bg-red-100 text-red-700',
    technician: 'bg-cyan-100 text-cyan-700',
    sales: 'bg-amber-100 text-amber-700',
    manager: 'bg-green-100 text-green-700',
    expert: 'bg-indigo-100 text-indigo-700',
    billing: 'bg-slate-100 text-slate-700',
  };
  return map[role];
}

function normalizeLeadRowFromApi(lead: any, index: number): Lead {
  const fullName =
    lead.fullName ||
    `${lead.firstName || ''} ${lead.lastName || ''}`.trim() ||
    lead.name ||
    'ליד ללא שם';
  return {
    id: lead.id || `L-${index + 1}`,
    importLegacyId: lead.importLegacyId ?? undefined,
    firstName: lead.firstName,
    lastName: lead.lastName ?? undefined,
    fullName: lead.fullName ?? fullName,
    name: fullName,
    company: lead.company || lead.companyName || '',
    service: lead.service || lead.serviceType || '',
    serviceType: lead.serviceType || lead.service || undefined,
    source: lead.source || '',
    stage: lead.stage || 'NEW',
    status: lead.status || 'NEW',
    leadStatus: lead.leadStatus || lead.status || 'NEW',
    assignee: lead.assignee || lead.assignedUser?.name || '',
    assignedUserId: lead.assignedUserId ?? null,
    assignedUserName: lead.assignedUser?.name,
    phone: lead.phone || '',
    email: lead.email ?? undefined,
    city: lead.city ?? undefined,
    address: lead.address ?? undefined,
    utm_source: lead.utm_source ?? undefined,
    utm_medium: lead.utm_medium ?? undefined,
    utm_campaign: lead.utm_campaign ?? undefined,
    utm_content: lead.utm_content ?? undefined,
    utm_term: lead.utm_term ?? undefined,
    site: lead.site || lead.siteAddress || '',
    notes: lead.notes || '',
    followUp1Date: lead.followUp1Date ?? undefined,
    followUp2Date: lead.followUp2Date ?? undefined,
    nextFollowUpDate: lead.nextFollowUpDate ?? undefined,
    createdAt: lead.createdAt ?? undefined,
    updatedAt: lead.updatedAt ?? undefined,
    projectId: lead.projectId ?? null,
    customerId: lead.customerId ?? null,
  };
}

function canAccess(role: AppUserRole, key: string) {
  const accessMap: Record<AppUserRole, string[]> = {
    admin: ['dashboard', 'leads', 'pipeline', 'customers', 'quotes', 'opportunities', 'projects', 'reports', 'documents', 'lab', 'tests', 'tasks', 'alerts', 'users', 'settings', 'fieldSchedule', 'interaction-new', 'order-new'],
    manager: ['dashboard', 'leads', 'pipeline', 'customers', 'quotes', 'opportunities', 'projects', 'reports', 'documents', 'lab', 'tests', 'tasks', 'alerts', 'users', 'settings', 'fieldSchedule', 'interaction-new', 'order-new'],
    sales: ['leads', 'pipeline', 'customers', 'quotes', 'tasks', 'interaction-new', 'order-new'],
    technician: ['projects', 'tasks', 'fieldSchedule', 'lab', 'interaction-new', 'order-new'],
    expert: ['dashboard', 'leads', 'pipeline', 'customers', 'quotes', 'opportunities', 'projects', 'tasks', 'fieldSchedule', 'interaction-new', 'order-new'],
    billing: ['quotes', 'interaction-new', 'order-new'],
  };
  return accessMap[role].includes(key);
}

function authHeaders(currentUser: AppUser | null): Record<string, string> {
  if (!currentUser) return {};
  return {
    'x-user-role': currentUser.role.toUpperCase(),
    'x-user-id': currentUser.id,
  };
}

function PipelinePage({
  leads,
  setLeads,
  currentUser,
}: {
  leads: Lead[];
  setLeads: React.Dispatch<React.SetStateAction<Lead[]>>;
  currentUser: AppUser;
}) {
  const stages = ['NEW', 'CONTACTED', 'QUOTE_SENT', 'NEGOTIATION', 'WON', 'LOST'] as const;

  useEffect(() => {
    if (leads.length > 0) return;
    let isMounted = true;

    apiFetch(apiUrl('/leads'), { authUser: currentUser })
      .then((res) => {
        if (!res.ok) throw new Error('טעינת נתונים נכשלה');
        return res.json();
      })
      .then((data) => {
        if (!isMounted || !Array.isArray(data)) return;

        const normalized: Lead[] = data.map((lead: any, index: number) => ({
          id: lead.id || `L-${index + 1}`,
          firstName: lead.firstName ?? undefined,
          lastName: lead.lastName ?? undefined,
          fullName: lead.fullName ?? (lead.name || `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || undefined),
          name: lead.fullName || lead.name || `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || 'ליד ללא שם',
          company: lead.company || lead.companyName || '',
          phone: lead.phone || '',
          email: lead.email ?? undefined,
          city: lead.city ?? undefined,
          address: lead.address ?? undefined,
          source: lead.source || '',
          utm_source: lead.utm_source ?? undefined,
          utm_medium: lead.utm_medium ?? undefined,
          utm_campaign: lead.utm_campaign ?? undefined,
          utm_content: lead.utm_content ?? undefined,
          utm_term: lead.utm_term ?? undefined,
          service: lead.service || lead.serviceType || '',
          serviceType: lead.serviceType ?? undefined,
          assignedUserId: lead.assignedUserId ?? undefined,
          followUp1Date: lead.followUp1Date ?? undefined,
          followUp2Date: lead.followUp2Date ?? undefined,
          nextFollowUpDate: lead.nextFollowUpDate ?? undefined,
          leadStatus: lead.leadStatus ?? undefined,
          createdAt: lead.createdAt ?? undefined,
          stage: lead.stage || 'NEW',
          status: lead.status || 'NEW',
          assignee: lead.assignee || lead.assignedUser?.name || (typeof lead.assignedUser === 'string' ? lead.assignedUser : '') || '',
          site: lead.site || lead.siteAddress || '',
          notes: lead.notes || '',
        }));

        setLeads(normalized);
      })
      .catch(() => {
        // keep existing fallback behavior in main page
      });

    return () => {
      isMounted = false;
    };
  }, [leads.length, setLeads]);

  const leadsByStage = useMemo(() => {
    const map: Record<string, Lead[]> = {};
    stages.forEach((s) => (map[s] = []));
    for (const lead of leads) {
      const stage = lead.stage || 'NEW';
      if (!map[stage]) map[stage] = [];
      map[stage].push(lead);
    }
    return map;
  }, [leads]);

  const changeStage = async (lead: Lead, stage: string) => {
    const previousStage = lead.stage || 'NEW';

    setLeads((prev) => prev.map((item) => (item.id === lead.id ? { ...item, stage } : item)));

    try {
      const res = await apiFetch(apiUrl(`/leads/${lead.id}/stage`), {
        method: 'PATCH',
        authUser: currentUser,
        body: JSON.stringify({ stage }),
      });
      if (!res.ok) throw new Error('עדכון שלב נכשל');
    } catch {
      setLeads((prev) => prev.map((item) => (item.id === lead.id ? { ...item, stage: previousStage } : item)));
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold" style={{ color: galit.text }}>פייפליין לידים</h1>
        <p className="mt-1 text-slate-500">צינור לידים לפי שלב (ללא גרירה)</p>
      </div>

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {stages.map((stage) => (
          <div key={stage} className="rounded-2xl border bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold">{statusLabel(stage)}</span>
              <span className="text-xs text-slate-400">{(leadsByStage[stage] || []).length}</span>
            </div>

            <div className="space-y-2">
              {(leadsByStage[stage] || []).map((lead) => (
                <div key={lead.id} className="rounded-2xl border bg-slate-50 p-3">
                  <div className="text-sm font-semibold">{lead.name}</div>
                  <div className="mt-1 text-xs text-slate-600">טלפון: {phoneToDisplay(lead.phone) || '-'}</div>
                  <div className="mt-1 text-xs text-slate-600">{lead.service || '-'}</div>

                  <div className="mt-3">
                    <div className="mb-1 text-[11px] text-slate-400">שנה שלב</div>
                    <select
                      value={lead.stage || 'NEW'}
                      onChange={(e) => changeStage(lead, e.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none transition focus:border-slate-400"
                    >
                      {stages.map((s) => (
                        <option key={s} value={s}>
                          {statusLabel(s)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}

              {(leadsByStage[stage] || []).length === 0 && (
                <div className="rounded-2xl border border-dashed bg-white p-3 text-xs text-slate-400">
                  אין לידים בשלב הזה
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LeadProfile({
  lead,
  customer,
  quotes,
  projects,
  tasks,
  timeline,
  currentUser,
  onOpenProject,
}: {
  lead: Lead;
  customer?: Customer;
  quotes: Quote[];
  projects: Project[];
  tasks: Task[];
  timeline: TimelineEvent[];
  currentUser: AppUser;
  onOpenProject: (p: Project) => void;
}) {
  const [tab, setTab] = useState<'details' | 'history' | 'followups' | 'quotes' | 'project' | 'notes'>('details');
  const [activities, setActivities] = useState<any[]>([]);
  const [linkedQuotes, setLinkedQuotes] = useState<any[]>([]);
  const [linkedProject, setLinkedProject] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  const leadName = lead.fullName || lead.name || '';
  const leadStatus = (lead.leadStatus || lead.status || 'NEW').toString();

  const steps: Array<{ key: string; label: string }> = [
    { key: 'NEW', label: 'חדש' },
    { key: 'CONTACTED', label: 'נוצר קשר' },
    { key: 'FU', label: 'פולואפ' },
    { key: 'QUOTE', label: 'הצעה' },
    { key: 'WON', label: 'זכייה' },
    { key: 'PROJECT', label: 'פרויקט' },
  ];

  const stepIndex = useMemo(() => {
    if (lead.projectId) return 5;
    if (leadStatus === 'WON') return 4;
    if (leadStatus === 'QUOTE_SENT' || leadStatus === 'NEGOTIATION') return 3;
    if (leadStatus === 'FU_1' || leadStatus === 'FU_2') return 2;
    if (leadStatus === 'CONTACTED') return 1;
    if (leadStatus === 'LOST' || leadStatus === 'NOT_RELEVANT') return 0;
    return 0;
  }, [lead.projectId, leadStatus]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiFetch(apiUrl(`/leads/${encodeURIComponent(lead.id)}/activities`), { authUser: currentUser })
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []),
      apiFetch(apiUrl(`/quotes?leadId=${encodeURIComponent(lead.id)}`), { authUser: currentUser })
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []),
      lead.projectId
        ? apiFetch(apiUrl(`/projects/${encodeURIComponent(lead.projectId)}`), { authUser: currentUser })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null)
        : Promise.resolve(null),
    ])
      .then(([acts, qs, prj]) => {
        setActivities(Array.isArray(acts) ? acts : []);
        setLinkedQuotes(Array.isArray(qs) ? qs : []);
        setLinkedProject(prj);
      })
      .finally(() => setLoading(false));
  }, [currentUser.id, currentUser.role, lead.id, lead.projectId]);

  const relatedTasks = tasks.filter((task) => task.title.includes(leadName) || task.title.includes(lead.company || ''));
  const relatedTimeline = timeline.filter((event) => event.customerName === (customer?.name || leadName));

  const customerTypeLabel = (type: string) => {
    const map: Record<string, string> = {
      COMPANY: 'חברה / קבלן',
      PUBLIC: 'רשות / מוסד',
      PRIVATE: 'לקוח פרטי',
      'חברה / קבלן': 'חברה / קבלן',
      'רשות / מוסד': 'רשות / מוסד',
      'לקוח פרטי': 'לקוח פרטי',
    };
    return map[type] || type || '-';
  };

  const customerStatusLabel = (status: string) => {
    const map: Record<string, string> = {
      ACTIVE: 'פעיל',
      INACTIVE: 'לא פעיל',
    };
    return map[(status || '').toString().toUpperCase()] || status || '-';
  };

  const leadStatusLabelInProfile = (st: string) => {
    const map: Record<string, string> = {
      NEW: 'חדש',
      CONTACTED: 'נוצר קשר',
      FU_1: 'פולואפ',
      FU_2: 'פולואפ',
      FU: 'פולואפ',
      QUOTE_SENT: 'הצעה נשלחה',
      NEGOTIATION: 'משא ומתן',
      WON: 'זכייה',
      LOST: 'אבוד',
      NOT_RELEVANT: 'לא רלוונטי',
    };
    return map[(st || '').toString().toUpperCase()] || st || '-';
  };

  const leadServiceTypeLabelInProfile = (type: string) => {
    const map: Record<string, string> = {
      RADON: 'ראדון',
      ASBESTOS: 'אסבסט',
      RADIATION: 'קרינה',
      AIR_QUALITY: 'איכות אוויר',
      ACOUSTICS: 'אקוסטיקה / רעש',
      NOISE: 'אקוסטיקה / רעש',
      ODOR: 'ריח',
      SOIL: 'קרקע',
      LAB: 'מעבדה',
      GREEN_BUILDING: 'בנייה ירוקה',
      // already-localized values
      'קרינה': 'קרינה',
      'אקוסטיקה / רעש': 'אקוסטיקה / רעש',
      'איכות אוויר': 'איכות אוויר',
      'אסבסט': 'אסבסט',
      'ראדון': 'ראדון',
      'ריח': 'ריח',
      'קרקע': 'קרקע',
      'מעבדה': 'מעבדה',
      'בנייה ירוקה': 'בנייה ירוקה',
      אחר: 'אחר',
    };
    return map[type] || map[(type || '').toString().toUpperCase()] || type || '-';
  };

  const leadSourceLabelInProfile = (src: string) => {
    const map: Record<string, string> = {
      PHONE: 'טלפון',
      SITE: 'אתר',
      WHATSAPP: 'וואטסאפ',
      FACEBOOK: 'פייסבוק',
      GOOGLE: 'גוגל',
      RETURNING_CUSTOMER: 'לקוח חוזר',
      REFERRAL: 'הפניה',
      CUSTOMER: 'לקוח חוזר',
      OTHER: 'אחר',
      // already-localized values
      'טלפון': 'טלפון',
      'אתר': 'אתר',
      'וואטסאפ': 'וואטסאפ',
      'פייסבוק': 'פייסבוק',
      'גוגל': 'גוגל',
      'לקוח חוזר': 'לקוח חוזר',
      'הפניה': 'הפניה',
      אחר: 'אחר',
    };
    return map[src] || map[(src || '').toString().toUpperCase()] || src || '-';
  };

  const activityTypeLabelInProfile = (t: string) => {
    const map: Record<string, string> = {
      MANUAL: 'ידני',
      FOLLOW_UP: 'פולואפ',
    };
    return map[(t || '').toString().toUpperCase()] || t || '-';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold" style={{ color: galit.text }}>{leadName}</h1>
        <p className="text-slate-500">מסע ליד: מאיש קשר → הצעה → פרויקט</p>
      </div>

      <Card>
        <CardContent className="space-y-3">
          <div className="text-sm font-semibold">התקדמות ליד</div>
          <div className="flex flex-wrap items-center gap-2">
            {steps.map((s, idx) => (
              <div key={s.key} className={cn('rounded-full px-3 py-1 text-xs font-semibold', idx <= stepIndex ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600')}>
                {s.label}
              </div>
            ))}
            {(leadStatus === 'LOST' || leadStatus === 'NOT_RELEVANT') && (
              <div className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
                {leadStatus === 'LOST' ? 'אבוד' : 'לא רלוונטי'}
              </div>
            )}
          </div>
          <div className="text-xs text-slate-500">
            סטטוס: <span className="font-semibold">{leadStatusLabelInProfile(leadStatus)}</span>
            {lead.nextFollowUpDate ? <span> · פולואפ הבא: {new Date(lead.nextFollowUpDate).toLocaleDateString()}</span> : null}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        {[
          { key: 'details', label: 'פרטים' },
          { key: 'history', label: 'היסטוריית טיפול' },
          { key: 'followups', label: 'פולואפים' },
          { key: 'quotes', label: 'הצעות מחיר' },
          { key: 'project', label: 'פרויקט' },
          { key: 'notes', label: 'הערות' },
        ].map((t) => (
          <button
            key={t.key}
            className={cn('rounded-2xl px-4 py-2 text-sm font-semibold', tab === (t.key as any) ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200')}
            onClick={() => setTab(t.key as any)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && <div className="text-sm text-slate-500">טוען נתונים מקושרים...</div>}

      <div className="grid gap-4 xl:grid-cols-3">
        {tab === 'details' && (
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle>פרטים</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 p-4"><div className="text-sm text-slate-400">שם מלא</div><div className="font-medium">{leadName}</div></div>
              <div className="rounded-2xl bg-slate-50 p-4"><div className="text-sm text-slate-400">חברה</div><div className="font-medium">{lead.company || '-'}</div></div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="text-sm text-slate-400">טלפון</div>
                <div className="font-medium">
                  {lead.phone ? (
                    <a
                      href={phoneToTelHref(lead.phone) || undefined}
                      className="text-slate-900 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {phoneToDisplay(lead.phone)}
                    </a>
                  ) : (
                    '-'
                  )}
                </div>
                {lead.phone && (
                  <div className="mt-1 text-xs">
                    <a
                      href={phoneToWhatsAppHref(lead.phone) || undefined}
                      className="text-sky-700 hover:underline"
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      וואטסאפ
                    </a>
                  </div>
                )}
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="text-sm text-slate-400">אימייל</div>
                <div className="font-medium break-all">
                  {lead.email ? (
                    <a href={emailToMailtoHref(lead.email) || undefined} className="text-slate-900 hover:underline" onClick={(e) => e.stopPropagation()}>
                      {lead.email}
                    </a>
                  ) : (
                    '-'
                  )}
                </div>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4"><div className="text-sm text-slate-400">עיר</div><div className="font-medium">{lead.city || '-'}</div></div>
              <div className="rounded-2xl bg-slate-50 p-4"><div className="text-sm text-slate-400">כתובת</div><div className="font-medium">{lead.address || '-'}</div></div>
              <div className="rounded-2xl bg-slate-50 p-4"><div className="text-sm text-slate-400">סוג שירות</div><div className="font-medium">{leadServiceTypeLabelInProfile(String(lead.serviceType || lead.service || ''))}</div></div>
              <div className="rounded-2xl bg-slate-50 p-4"><div className="text-sm text-slate-400">מקור</div><div className="font-medium">{leadSourceLabelInProfile(String(lead.source || ''))}</div></div>
              <div className="rounded-2xl bg-slate-50 p-4 md:col-span-2"><div className="text-sm text-slate-400">מקור שיווק</div><div className="font-medium">{lead.utm_source || '-'} / {lead.utm_medium || '-'} / {lead.utm_campaign || '-'}</div></div>
            </CardContent>
          </Card>
        )}

        {tab === 'history' && (
          <Card className="xl:col-span-2">
            <CardHeader><CardTitle>היסטוריית טיפול</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {activities.length === 0 ? (
                <div className="text-sm text-slate-500">אין אירועים עדיין</div>
              ) : (
                activities.map((a) => (
                  <div key={a.id} className="rounded-2xl border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium">{activityTypeLabelInProfile(a.type)}</div>
                      <div className="text-xs text-slate-400">{a.createdAt ? new Date(a.createdAt).toLocaleString() : ''}</div>
                    </div>
                    {a.message && <div className="mt-2 text-sm text-slate-600 whitespace-pre-wrap">{a.message}</div>}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        )}

        {tab === 'followups' && (
          <Card className="xl:col-span-2">
            <CardHeader><CardTitle>פולואפים</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 p-4"><div className="text-sm text-slate-400">פולואפ 1</div><div className="font-medium">{lead.followUp1Date ? new Date(lead.followUp1Date).toLocaleDateString() : '-'}</div></div>
              <div className="rounded-2xl bg-slate-50 p-4"><div className="text-sm text-slate-400">פולואפ 2</div><div className="font-medium">{lead.followUp2Date ? new Date(lead.followUp2Date).toLocaleDateString() : '-'}</div></div>
              <div className="rounded-2xl bg-slate-50 p-4 md:col-span-2"><div className="text-sm text-slate-400">פולואפ הבא</div><div className="font-medium">{lead.nextFollowUpDate ? new Date(lead.nextFollowUpDate).toLocaleDateString() : '-'}</div></div>
            </CardContent>
          </Card>
        )}

        {tab === 'quotes' && (
          <Card className="xl:col-span-2">
            <CardHeader><CardTitle>הצעות מחיר</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {linkedQuotes.length === 0 ? (
                <div className="text-sm text-slate-500">אין הצעות</div>
              ) : (
                linkedQuotes.map((q) => (
                  <div key={q.id} className="rounded-2xl border p-4">
                    <div className="font-medium">{q.quoteNumber || '—'}</div>
                    <div className="text-sm text-slate-500">{q.service}</div>
                      <div className="text-xs text-slate-400">סטטוס: {statusLabel(q.status)}</div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        )}

        {tab === 'project' && (
          <Card className="xl:col-span-2">
            <CardHeader><CardTitle>פרויקט</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {linkedProject ? (
                <div className="rounded-2xl border p-4">
                  <div className="font-medium">{linkedProject.name}</div>
                  <div className="text-sm text-slate-500">{statusLabel(linkedProject.status)}</div>
                  <div className="mt-3">
                    <Button variant="outline" onClick={() => onOpenProject(linkedProject)}>פתח פרויקט</Button>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-slate-500">עדיין לא נפתח פרויקט לליד הזה</div>
              )}
            </CardContent>
          </Card>
        )}

        {tab === 'notes' && (
          <Card className="xl:col-span-2">
            <CardHeader><CardTitle>הערות</CardTitle></CardHeader>
            <CardContent>
              {lead.notes ? <div className="whitespace-pre-wrap text-sm text-slate-700">{lead.notes}</div> : <div className="text-sm text-slate-500">אין הערות</div>}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>קישור ללקוח</CardTitle>
          </CardHeader>
          <CardContent>
            {customer ? (
              <div className="space-y-3">
                <div className="font-semibold">{customer.name}</div>
                <div className="text-sm text-slate-500">{customerTypeLabel(customer.type)}</div>
                <div className="text-sm text-slate-500">
                  איש קשר: {customer.contactName || '-'} · טלפון: {phoneToDisplay(customer.phone) || '-'}
                </div>
                <Badge className="bg-green-100 text-green-700">{customerStatusLabel(customer.status)}</Badge>
              </div>
            ) : (
              <div className="text-sm text-slate-500">עדיין לא שויך לקוח קבוע לליד הזה</div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>משימות קשורות</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {relatedTasks.length === 0 ? <div className="text-sm text-slate-500">אין משימות</div> : relatedTasks.map((task) => (
              <div key={task.id} className="rounded-2xl border p-4">
                <div className="font-medium">{task.title}</div>
                  <div className="text-sm text-slate-500">{taskStatusLabelForTasks(task.status || '')} · {taskPriorityLabel(task.priority || '')}</div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader><CardTitle>ציר זמן</CardTitle></CardHeader>
          <CardContent>
            {relatedTimeline.length === 0 ? (
              <div className="text-sm text-slate-500">אין אירועים עדיין</div>
            ) : (
              <div className="space-y-4">
                {relatedTimeline.map((event) => (
                  <div key={event.id} className="rounded-2xl border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium">{event.title}</div>
                      <div className="text-xs text-slate-400">{event.date}</div>
                    </div>
                    <div className="mt-2 text-sm text-slate-600">{event.description}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

    </div>
  );
}

function LeadDetailPage({
  lead,
  customer,
  customers,
  leads,
  users,
  opportunities,
  currentUser,
  setLeads,
  setSelectedLead,
  onOpenProject,
  onOpenCustomer,
  onNavigate,
}: {
  lead: Lead;
  customer?: Customer;
  customers: Customer[];
  leads: Lead[];
  users: AppUser[];
  opportunities: Opportunity[];
  currentUser: AppUser;
  setLeads: React.Dispatch<React.SetStateAction<Lead[]>>;
  setSelectedLead: React.Dispatch<React.SetStateAction<Lead | null>>;
  onOpenProject: (p: Project) => void;
  onOpenCustomer: (c: Customer) => void;
  onNavigate: (key: string) => void;
}) {
  const [tab, setTab] = useState<'details' | 'utm' | 'activity' | 'notes' | 'links'>('details');
  const [activities, setActivities] = useState<any[]>([]);
  const [linkedQuotes, setLinkedQuotes] = useState<any[]>([]);
  const [linkedOpportunity, setLinkedOpportunity] = useState<any | null>(null);
  const [localCustomer, setLocalCustomer] = useState<Customer | undefined>(customer);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionBusy, setActionBusy] = useState<string>('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [fileName, setFileName] = useState('');
  const [newActionType, setNewActionType] = useState('MANUAL');
  const [newActionMessage, setNewActionMessage] = useState('');
  const [callFollowUpForm, setCallFollowUpForm] = useState({
    callDate: '',
    contactType: '',
    spokeBy: '',
    callSummary: '',
    nextTreatment: '',
    nextFollowUpDate: '',
  });
  const [savingCallFollowUp, setSavingCallFollowUp] = useState(false);

  const [form, setForm] = useState({
    firstName: lead.firstName ?? lead.fullName ?? lead.name ?? '',
    lastName: lead.lastName ?? '',
    phone: lead.phone ?? '',
    email: lead.email ?? '',
    serviceType: lead.serviceType ?? lead.service ?? '',
    assignedUserId: (lead.assignedUserId ?? '') as string,
    leadStatus: (lead.leadStatus ?? lead.status ?? 'NEW') as string,
    fu1Date: lead.followUp1Date ? new Date(lead.followUp1Date).toISOString().slice(0, 10) : '',
    fu2Date: lead.followUp2Date ? new Date(lead.followUp2Date).toISOString().slice(0, 10) : '',
    utm_source: lead.utm_source ?? '',
    utm_medium: lead.utm_medium ?? '',
    utm_campaign: lead.utm_campaign ?? '',
    utm_content: lead.utm_content ?? '',
    utm_term: lead.utm_term ?? '',
    notes: lead.notes ?? '',
  });

  const radonPool = (form.serviceType || '').toString().toLowerCase() === 'radon' || form.serviceType === 'ראדון';
  const serviceMatchAssigneeId = useMemo(() => {
    if (radonPool) return '';
    const svc = (form.serviceType || '').toString();
    if (!svc) return '';
    const candidates = users.filter((u: any) => Array.isArray(u.serviceDepartments) && u.serviceDepartments.includes(svc));
    return candidates[0]?.id || '';
  }, [users, form.serviceType, radonPool]);

  const assignedUser = useMemo(() => {
    const id = form.assignedUserId || null;
    if (!id) return null;
    return users.find((u) => u.id === id) || null;
  }, [users, form.assignedUserId]);

  const leadEmailDuplicate = useMemo(() => {
    const e = normalizeEmail(form.email);
    if (!e) return { customer: null as Customer | null, lead: null as Lead | null };
    const matchedCustomer =
      customers.find((c) => normalizeEmail(c.email || '') === e && (!customer || c.id !== customer.id)) || null;
    const matchedLead =
      leads.find((l) => normalizeEmail(l.email || '') === e && l.id !== lead.id) || null;
    return { customer: matchedCustomer, lead: matchedLead };
  }, [customers, leads, form.email, customer, lead.id]);

  const leadEmailDuplicateWarning =
    leadEmailDuplicate.customer || leadEmailDuplicate.lead ? 'קיים כבר ליד/לקוח עם אימייל זה' : '';

  // קורה שלפעמים backend מחזיר הודעת שגיאה עם מפתחות טכניים/קייסים באנגלית.
  // במסך זה אנחנו מסירים/מתרגמים כדי שלא יופיעו טקסטים טכניים למשתמש.
  const sanitizeUiMessage = (msg: string) => {
    return (msg || '')
      .replace(/\bassignedUserId\b/gi, '')
      .replace(/\bAdmin\b/g, 'מנהל מערכת')
      .replace(/\badmin\b/g, 'מנהל מערכת')
      .replace(/\s{2,}/g, ' ')
      .trim();
  };
  const sanitizedError = sanitizeUiMessage(error);

  const refreshAll = async (opts?: { preserveTab?: boolean }) => {
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const res = await apiFetch(apiUrl(`/leads/${encodeURIComponent(lead.id)}`), {
        authUser: currentUser,
      });
      if (!res.ok) throw new Error('טעינת הליד נכשלה');
      const fresh = await res.json();

      setSelectedLead(fresh);
      setLeads((prev) => prev.map((l) => (l.id === fresh.id ? { ...l, ...fresh } : l)));

      setLocalCustomer(fresh.customer ?? undefined);
      setLinkedOpportunity(Array.isArray(fresh.opportunities) && fresh.opportunities.length > 0 ? fresh.opportunities[0] : null);

      setForm({
        firstName: fresh.firstName ?? fresh.fullName ?? fresh.name ?? '',
        lastName: fresh.lastName ?? '',
        phone: fresh.phone ?? '',
        email: fresh.email ?? '',
        serviceType: fresh.serviceType ?? fresh.service ?? '',
        assignedUserId: (fresh.assignedUserId ?? '') as string,
        leadStatus: (fresh.leadStatus ?? fresh.status ?? 'NEW') as string,
        fu1Date: fresh.followUp1Date ? new Date(fresh.followUp1Date).toISOString().slice(0, 10) : '',
        fu2Date: fresh.followUp2Date ? new Date(fresh.followUp2Date).toISOString().slice(0, 10) : '',
        utm_source: fresh.utm_source ?? '',
        utm_medium: fresh.utm_medium ?? '',
        utm_campaign: fresh.utm_campaign ?? '',
        utm_content: fresh.utm_content ?? '',
        utm_term: fresh.utm_term ?? '',
        notes: fresh.notes ?? '',
      });

      const [actsRes, quotesRes] = await Promise.all([
        apiFetch(apiUrl(`/leads/${encodeURIComponent(lead.id)}/activities`), { authUser: currentUser }),
        apiFetch(apiUrl(`/quotes?leadId=${encodeURIComponent(lead.id)}`), { authUser: currentUser }),
      ]);

      const acts = actsRes.ok ? await actsRes.json() : [];
      const qs = quotesRes.ok ? await quotesRes.json() : [];

      setActivities(Array.isArray(acts) ? acts : []);
      setLinkedQuotes(Array.isArray(qs) ? qs : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'טעינת הליד נכשלה');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id]);

  const nearExpiryQuote = useMemo(() => {
    const now = Date.now();
    const soonDays = 7;
    const q = (linkedQuotes || []).find((qq) => {
      const expiryRaw = qq.validityDate || qq.validTo;
      if (!expiryRaw) return false;
      const expiry = new Date(expiryRaw).getTime();
      if (!expiry) return false;
      const diffDays = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
      if (diffDays < 0 || diffDays > soonDays) return false;
      const st = (qq.status || '').toString();
      return st !== 'EXPIRED';
    });
    if (!q) return null;
    const expiryRaw = q.validityDate || q.validTo;
    const expiry = new Date(expiryRaw).getTime();
    const diffDays = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
    return { quote: q, diffDays };
  }, [linkedQuotes]);

  const saveLead = async () => {
    if (saving) return;
    setSaving(true);
    setError('');
    setSuccess('');
    setActionBusy('save');
    try {
      if (!form.firstName.trim()) throw new Error('חסר שם');

      const normalizedEmail = form.email ? normalizeEmail(form.email) : '';
      if (form.email.trim() && !validateEmail(normalizedEmail)) {
        throw new Error('אימייל לא תקין');
      }

      const payload: any = {
        firstName: form.firstName.trim(),
        leadStatus: form.leadStatus,
        assignedUserId: radonPool ? null : (form.assignedUserId ? form.assignedUserId : null),
      };

      if (form.lastName.trim()) payload.lastName = form.lastName.trim();
      if (form.phone.trim()) payload.phone = form.phone.trim();
      if (form.email.trim()) payload.email = normalizedEmail;
      if (form.serviceType.trim()) payload.serviceType = form.serviceType.trim();
      if (form.fu1Date) payload.followUp1Date = form.fu1Date;
      if (form.fu2Date) payload.followUp2Date = form.fu2Date;
      // חשוב: ב-Partial update ה-backend לא “נגזר אוטומטית” nextFollowUpDate.
      // לכן אם המשתמש עדכן FU1/FU2 דרך השמירה, נעדכן גם את "פולואפ הבא".
      const fu1 = form.fu1Date?.trim();
      const fu2 = form.fu2Date?.trim();
      const nextFollowUpDate = fu1 && fu2 ? (fu1 <= fu2 ? fu1 : fu2) : fu1 || fu2 || null;
      if (nextFollowUpDate) payload.nextFollowUpDate = nextFollowUpDate;
      if (form.utm_source) payload.utm_source = form.utm_source;
      if (form.utm_medium) payload.utm_medium = form.utm_medium;
      if (form.utm_campaign) payload.utm_campaign = form.utm_campaign;
      if (form.utm_content) payload.utm_content = form.utm_content;
      if (form.utm_term) payload.utm_term = form.utm_term;
      if (form.notes.trim()) payload.notes = form.notes.trim();

      const res = await apiFetch(apiUrl(`/leads/${encodeURIComponent(lead.id)}`), {
        method: 'PATCH',
        authUser: currentUser,
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());

      setSuccess('הליד נשמר בהצלחה');
      await refreshAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שמירת ליד נכשלה');
    } finally {
      setSaving(false);
      setActionBusy('');
    }
  };

  const moveToFU = async (which: 1 | 2) => {
    setError('');
    setSuccess('');
    setActionBusy(which === 1 ? 'fu1' : 'fu2');
    try {
      const dateStr = new Date().toISOString().slice(0, 10);
      const payload: any = {
        leadStatus: which === 1 ? 'FU_1' : 'FU_2',
        nextFollowUpDate: dateStr,
      };
      if (which === 1) payload.followUp1Date = dateStr;
      if (which === 2) payload.followUp2Date = dateStr;

      const res = await apiFetch(apiUrl(`/leads/${encodeURIComponent(lead.id)}`), {
        method: 'PATCH',
        authUser: currentUser,
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());

      setSuccess(which === 1 ? 'הועבר לפולואפ 1' : 'הועבר לפולואפ 2');
      // Create explicit activity log (backend best-effort)
      await apiFetch(apiUrl(`/leads/${encodeURIComponent(lead.id)}/activities`), {
        method: 'POST',
        authUser: currentUser,
        body: JSON.stringify({
          type: 'FOLLOW_UP',
          message: which === 1 ? 'הועבר לפולואפ 1' : 'הועבר לפולואפ 2',
        }),
      }).catch(() => {});
      await refreshAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'עדכון פולואפ נכשל');
    } finally {
      setActionBusy('');
    }
  };

  const createOpportunityAndQuote = async () => {
    setError('');
    setSuccess('');
    setActionBusy('quote');
    try {
      const res = await apiFetch(apiUrl(`/leads/${encodeURIComponent(lead.id)}/create-quote`), {
        method: 'POST',
        authUser: currentUser,
      });
      if (!res.ok) throw new Error(await res.text());
      setSuccess('נוצרה הזדמנות + הצעת מחיר');
      await refreshAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'יצירת הזדמנות + הצעת מחיר נכשלה');
    } finally {
      setActionBusy('');
    }
  };

  const markWon = async () => {
    setError('');
    setSuccess('');
    setActionBusy('won');
    try {
      const res = await apiFetch(apiUrl(`/leads/${encodeURIComponent(lead.id)}/open-project`), {
        method: 'POST',
        authUser: currentUser,
      });
      if (!res.ok) throw new Error(await res.text());
      const project = await res.json();
      setSuccess('נפתח פרויקט (זכה)');
      await refreshAll();
      if (project?.id) onOpenProject(project);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'סימון זכה נכשל');
    } finally {
      setActionBusy('');
    }
  };

  const markLost = async () => {
    setError('');
    setSuccess('');
    setActionBusy('lost');
    try {
      const res = await apiFetch(apiUrl(`/leads/${encodeURIComponent(lead.id)}`), {
        method: 'PATCH',
        authUser: currentUser,
        body: JSON.stringify({ leadStatus: 'LOST' }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSuccess('הליד סומן כאבוד');
      await refreshAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'סימון אבוד נכשל');
    } finally {
      setActionBusy('');
    }
  };

  const parseUTMFromUrl = () => {
    try {
      const params = new URLSearchParams(window.location.search);
      const get = (k: string) => params.get(k) || '';
      setForm((p) => ({
        ...p,
        utm_source: get('utm_source'),
        utm_medium: get('utm_medium'),
        utm_campaign: get('utm_campaign'),
        utm_content: get('utm_content'),
        utm_term: get('utm_term'),
      }));
    } catch {
      setError('פענוח נתוני מעקב נכשל');
    }
  };

  const addActivity = async () => {
    setError('');
    setSuccess('');
    if (!newActionMessage.trim()) return;
    try {
      const res = await apiFetch(apiUrl(`/leads/${encodeURIComponent(lead.id)}/activities`), {
        method: 'POST',
        authUser: currentUser,
        body: JSON.stringify({ type: newActionType, message: newActionMessage }),
      });
      if (!res.ok) throw new Error(await res.text());
      setNewActionMessage('');
      setSuccess('הפעולה נוספה');
      await refreshAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'הוספת פעולה נכשלה');
    }
  };

  const saveCallFollowUp = async () => {
    if (savingCallFollowUp) return;
    setError('');
    setSuccess('');

    // מינימום כדי שלא ליצור רשומה ריקה:
    if (!callFollowUpForm.callSummary.trim() && !callFollowUpForm.nextFollowUpDate.trim()) return;

    setSavingCallFollowUp(true);
    try {
      const message = [
        `תאריך שיחה: ${callFollowUpForm.callDate || '-'}`,
        `סוג קשר: ${callFollowUpForm.contactType || '-'}`,
        `מי דיבר: ${callFollowUpForm.spokeBy || '-'}`,
        `סיכום שיחה: ${callFollowUpForm.callSummary || '-'}`,
        `המשך טיפול: ${callFollowUpForm.nextTreatment || '-'}`,
        `תאריך מעקב הבא: ${callFollowUpForm.nextFollowUpDate || '-'}`,
      ].join('\n');

      // משתמשים במבנה הפעילות הקיים כדי לא לבנות מודול חדש:
      await apiFetch(apiUrl(`/leads/${encodeURIComponent(lead.id)}/activities`), {
        method: 'POST',
        authUser: currentUser,
        body: JSON.stringify({ type: 'MANUAL', message }),
      });

      // אם נבחר תאריך מעקב הבא - נעדכן אותו בליד.
      if (callFollowUpForm.nextFollowUpDate.trim()) {
        await apiFetch(apiUrl(`/leads/${encodeURIComponent(lead.id)}`), {
          method: 'PATCH',
          authUser: currentUser,
          body: JSON.stringify({ nextFollowUpDate: callFollowUpForm.nextFollowUpDate }),
        });
      }

      setSuccess('סיכום שיחה נשמר');
      setCallFollowUpForm({
        callDate: '',
        contactType: '',
        spokeBy: '',
        callSummary: '',
        nextTreatment: '',
        nextFollowUpDate: '',
      });
      await refreshAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שמירת סיכום שיחה נכשלה');
    } finally {
      setSavingCallFollowUp(false);
    }
  };

  const userInitials = (name: string) => {
    const parts = (name || '').trim().split(' ').filter(Boolean);
    const first = parts[0]?.[0] || '';
    const second = parts[1]?.[0] || '';
    return (first + second).toUpperCase() || '—';
  };

  const serviceOptions = ['קרינה', 'אקוסטיקה / רעש', 'איכות אוויר', 'אסבסט', 'ראדון', 'ריח', 'קרקע', 'אחר'];
  const leadStatusOptions = ['NEW', 'FU_1', 'FU_2', 'QUOTE_SENT', 'WON', 'LOST', 'NOT_RELEVANT'];
  const LEAD_STATUS_LABELS: Record<string, string> = {
    NEW: 'חדש',
    FU_1: 'פולואפ 1',
    FU_2: 'פולואפ 2',
    QUOTE_SENT: 'הצעה נשלחה',
    WON: 'זכה',
    LOST: 'אבוד',
    NOT_RELEVANT: 'לא רלוונטי',
  };
  const leadStatusLabel = (st: string) => LEAD_STATUS_LABELS[st] || st;
  const actionTypeLabel = (t: string) => {
    const map: Record<string, string> = {
      MANUAL: 'ידני',
      FOLLOW_UP: 'פולואפ',
    };
    return map[t] || 'פעולה';
  };

  const OPPORTUNITY_STAGE_LABELS: Record<string, string> = {
    NEW: 'חדש',
    QUALIFIED: 'מוסמך',
    PROPOSAL: 'הצעה',
    WON: 'נסגר - זכייה',
    LOST: 'נסגר - הפסד',
  };

  const QUOTE_STATUS_LABELS: Record<string, string> = {
    DRAFT: 'טיוטה',
    SENT: 'נשלחה',
    APPROVED: 'אושרה',
    REJECTED: 'נדחתה',
    EXPIRED: 'פג תוקף',
  };

  const leadTimeline = useMemo(() => {
    const items: EntityTimelineItem[] = [];
    const fullName = `${form.firstName || ''} ${form.lastName || ''}`.trim() || lead.fullName || lead.name || 'ליד';

    if (lead.createdAt) {
      items.push({
        id: `lead-created-${lead.id}`,
        title: 'נוצר',
        at: lead.createdAt,
        description: `נוצר ליד: ${fullName}`,
      });
    }

    const assignedName = assignedUser?.name || '';
    if ((lead.assignedUserId || form.assignedUserId) && assignedName) {
      items.push({
        id: `lead-assigned-${lead.id}`,
        title: 'שויך',
        at: lead.updatedAt || lead.createdAt,
        description: `שויך לאחראי: ${assignedName}`,
      });
    }

    for (const a of activities) {
      const type = (a?.type || '').toString().toUpperCase();
      const msg = (a?.message || '').toString();
      const isTalk =
        type === 'FOLLOW_UP' ||
        msg.includes('שיחה') ||
        msg.includes('פולואפ') ||
        msg.includes('קשר');
      if (isTalk) {
        items.push({
          id: `lead-talk-${a.id}`,
          title: 'דיברו',
          at: a.createdAt || null,
          description: msg || 'בוצע קשר עם הלקוח',
        });
      }
    }

    for (const q of linkedQuotes) {
      const st = (q?.status || '').toString().toUpperCase();
      if (['SENT', 'APPROVED', 'SIGNED'].includes(st)) {
        items.push({
          id: `lead-quote-sent-${q.id}`,
          title: 'נשלחה הצעה',
          at: q.updatedAt || q.createdAt || null,
          description: q.quoteNumber ? `מספר הצעה: ${q.quoteNumber}` : 'נשלחה הצעת מחיר',
        });
      }
    }

    const currentLeadStatus = (form.leadStatus || lead.leadStatus || lead.status || '').toString().toUpperCase();
    if (currentLeadStatus === 'WON') {
      items.push({
        id: `lead-won-${lead.id}`,
        title: 'זכה',
        at: lead.updatedAt || null,
        description: 'הליד נסגר בזכייה',
      });
    } else if (currentLeadStatus === 'LOST') {
      items.push({
        id: `lead-lost-${lead.id}`,
        title: 'אבד',
        at: lead.updatedAt || null,
        description: 'הליד נסגר כאבוד',
      });
    }

    if (lead.projectId) {
      items.push({
        id: `lead-project-open-${lead.id}`,
        title: 'נפתח פרויקט',
        at: lead.updatedAt || lead.createdAt || null,
        description: 'נפתח פרויקט עבור הליד',
      });
    }

    return items;
  }, [
    lead.id,
    lead.createdAt,
    lead.updatedAt,
    lead.assignedUserId,
    lead.fullName,
    lead.name,
    lead.leadStatus,
    lead.status,
    form.firstName,
    form.lastName,
    form.assignedUserId,
    form.leadStatus,
    assignedUser?.name,
    activities,
    linkedQuotes,
  ]);

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-2xl font-bold" style={{ color: galit.text }}>
                ליד
              </div>
              <Badge className={statusBadge(form.leadStatus)}>{leadStatusLabel(form.leadStatus)}</Badge>
              {nearExpiryQuote && (
                <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-semibold text-yellow-800">
                  אזהרה: הצעה פגה בעוד {nearExpiryQuote.diffDays} ימים
                </span>
              )}
            </div>
            <div className="text-sm text-slate-500">
              תאריך: {lead.createdAt ? new Date(lead.createdAt).toLocaleString() : '-'} · עודכן:{' '}
              {lead.updatedAt ? new Date(lead.updatedAt).toLocaleString() : '-'}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-2xl bg-white px-3 py-2 shadow-sm ring-1 ring-slate-200">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-white text-xs font-bold">
                {radonPool ? 'רדון' : userInitials(assignedUser?.name || '—')}
              </div>
              <div className="text-right text-sm">
                <div className="font-semibold">
                  {radonPool ? 'בריכת ראדון' : assignedUser?.name || 'לא הוגדר'}
                </div>
                <div className="text-xs text-slate-500">
                  {assignedUser?.role
                    ? sanitizeUiMessage(roleLabel(String(assignedUser.role).toLowerCase() as any) || '')
                    : ''}
                </div>
              </div>
            </div>

            <Button variant="outline" onClick={refreshAll} disabled={loading}>
              רענן
            </Button>
          </div>
        </div>

        {radonPool && (
          <div className="mt-3 rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-800">
            ליד זמין להקצאה
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { key: 'details', label: 'פרטי הליד' },
          { key: 'utm', label: 'נתוני מעקב ומקור' },
          { key: 'activity', label: 'פעילות ולוג' },
          { key: 'notes', label: 'הערות + קבצים' },
          { key: 'links', label: 'קישורים קשורים' },
        ].map((t) => (
          <button
            key={t.key}
            className={cn('rounded-2xl px-4 py-2 text-sm font-semibold', tab === t.key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200')}
            onClick={() => setTab(t.key as any)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {sanitizedError && (
        <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{sanitizedError}</div>
      )}
      {success && <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{success}</div>}

      <div className="flex flex-wrap gap-2">
        <Button style={{ background: galit.primary }} onClick={saveLead} disabled={saving}>
          {saving ? 'שומר...' : 'שמור'}
        </Button>
        <Button variant="outline" onClick={() => moveToFU(1)} disabled={actionBusy !== ''}>
          העבר לפולואפ 1
        </Button>
        <Button variant="outline" onClick={() => moveToFU(2)} disabled={actionBusy !== ''}>
          העבר לפולואפ 2
        </Button>
        <Button variant="outline" onClick={createOpportunityAndQuote} disabled={actionBusy !== ''}>
          צור הזדמנות + הצעת מחיר
        </Button>
        <Button variant="outline" onClick={markWon} disabled={actionBusy !== ''}>
          סמן כזכה
        </Button>
        <Button variant="outline" onClick={markLost} disabled={actionBusy !== ''}>
          סמן כאבוד
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>ציר זמן</CardTitle>
        </CardHeader>
        <CardContent>
          <EntityTimeline items={leadTimeline} emptyText="אין אירועים להצגה לליד זה" />
        </CardContent>
      </Card>

      {loading && <div className="text-sm text-slate-500">טוען ליד...</div>}

      {tab === 'details' && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>פרטי הליד</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <FormField label="שם">
                  <Input
                    value={form.firstName}
                    onChange={(e) => setForm((p) => ({ ...p, firstName: e.target.value }))}
                    placeholder="שם"
                  />
                </FormField>
                <FormField label="שם משפחה">
                  <Input
                    value={form.lastName}
                    onChange={(e) => setForm((p) => ({ ...p, lastName: e.target.value }))}
                    placeholder="שם משפחה"
                  />
                </FormField>
                <FormField label="טלפון">
                  <PhoneInput
                    placeholder="טלפון"
                    value={form.phone}
                    onChange={(v) => setForm((p) => ({ ...p, phone: v }))}
                  />
                </FormField>
                <FormField label="אימייל">
                  <EmailInput
                    value={form.email}
                    onChange={(v) => setForm((p) => ({ ...p, email: v }))}
                    placeholder="אימייל"
                  />
                </FormField>
                {leadEmailDuplicateWarning && (
                  <div className="text-xs text-amber-700 md:col-span-2">
                    {leadEmailDuplicateWarning}
                    {leadEmailDuplicate.customer && (
                      <button
                        type="button"
                        className="mr-2 underline"
                        onClick={() => {
                          onOpenCustomer(leadEmailDuplicate.customer!);
                        }}
                      >
                        פתח לקוח
                      </button>
                    )}
                    {leadEmailDuplicate.lead && (
                      <button
                        type="button"
                        className="mr-2 underline"
                        onClick={() => {
                          setSelectedLead(leadEmailDuplicate.lead!);
                        }}
                      >
                        פתח ליד
                      </button>
                    )}
                  </div>
                )}

                <FormField label="מקור ליד">
                  <div className="text-sm font-medium">{lead.source || '-'}</div>
                </FormField>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <FormField label="תחום">
                  <Select
                    value={form.serviceType || serviceOptions[0]}
                    onChange={(v) => {
                      const isRadon = v === 'ראדון' || v.toLowerCase() === 'radon';
                      const candidates = isRadon ? [] : users.filter((u: any) => Array.isArray(u.serviceDepartments) && u.serviceDepartments.includes(v));
                      setForm((p) => ({
                        ...p,
                        serviceType: v,
                        assignedUserId: isRadon ? '' : candidates[0]?.id || '',
                      }));
                    }}
                    options={serviceOptions}
                  />
                </FormField>

                <FormField label="אחראי">
                  <select
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-slate-400"
                    value={form.assignedUserId || ''}
                    onChange={(e) => setForm((p) => ({ ...p, assignedUserId: e.target.value }))}
                    disabled={radonPool}
                  >
                    <option value="">{radonPool ? 'בריכת ראדון' : 'לא הוגדר'}</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </FormField>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <FormField label="סטטוס">
                  <select
                    value={form.leadStatus || 'NEW'}
                    onChange={(e) => setForm((p) => ({ ...p, leadStatus: e.target.value }))}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-slate-400"
                  >
                    {leadStatusOptions.map((st) => (
                      <option key={st} value={st}>
                        {leadStatusLabel(st)}
                      </option>
                    ))}
                  </select>
                </FormField>

                <FormField label="מעקב">
                  <Input
                    type="date"
                    value={form.fu1Date}
                    onChange={(e) => setForm((p) => ({ ...p, fu1Date: e.target.value }))}
                  />
                </FormField>

                <FormField label="מעקב">
                  <Input
                    type="date"
                    value={form.fu2Date}
                    onChange={(e) => setForm((p) => ({ ...p, fu2Date: e.target.value }))}
                  />
                </FormField>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'utm' && (
        <Card>
          <CardHeader>
            <CardTitle>נתוני מעקב ומקור</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <FormField label="מקור">
                <Input value={form.utm_source} onChange={(e) => setForm((p) => ({ ...p, utm_source: e.target.value }))} />
              </FormField>
              <FormField label="אמצעי">
                <Input value={form.utm_medium} onChange={(e) => setForm((p) => ({ ...p, utm_medium: e.target.value }))} />
              </FormField>
              <FormField label="קמפיין">
                <Input value={form.utm_campaign} onChange={(e) => setForm((p) => ({ ...p, utm_campaign: e.target.value }))} />
              </FormField>
              <FormField label="תוכן">
                <Input value={form.utm_content} onChange={(e) => setForm((p) => ({ ...p, utm_content: e.target.value }))} />
              </FormField>
              <FormField label="מונח">
                <Input value={form.utm_term} onChange={(e) => setForm((p) => ({ ...p, utm_term: e.target.value }))} />
              </FormField>
            </div>
            <Button variant="outline" onClick={parseUTMFromUrl}>
              פענח נתוני מעקב מהקישור
            </Button>
          </CardContent>
        </Card>
      )}

      {tab === 'activity' && (
        <Card>
          <CardHeader>
            <CardTitle>פעילות ולוג</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {activities.length === 0 ? (
                <div className="text-sm text-slate-500">אין פעילויות עדיין</div>
              ) : (
                [...activities]
                  .sort((a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime())
                  .map((a) => (
                    <div key={a.id} className="rounded-2xl border p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-semibold">{actionTypeLabel(a.type)}</div>
                        <div className="text-xs text-slate-400">{a.createdAt ? new Date(a.createdAt).toLocaleString() : '-'}</div>
                      </div>
                      {a.message && <div className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{a.message}</div>}
                    </div>
                  ))
              )}
            </div>

            <div className="rounded-2xl bg-slate-50 p-4 space-y-3">
              <div className="flex gap-2 items-start">
                <FormField label="סוג">
                  <Input value={newActionType} onChange={(e) => setNewActionType(e.target.value)} placeholder="סוג פעולה" />
                </FormField>
                <Button variant="outline" onClick={addActivity}>
                  + הוסף פעולה
                </Button>
              </div>
              <FormField label="תיאור פעולה">
                <Textarea value={newActionMessage} onChange={(e) => setNewActionMessage(e.target.value)} placeholder="תיאור פעולה" />
              </FormField>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === 'notes' && (
        <Card>
          <CardHeader>
            <CardTitle>הערות + קבצים</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl bg-slate-50 p-4 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-base font-semibold">סיכום שיחה ומעקב</div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <FormField label="תאריך שיחה">
                  <Input
                    type="date"
                    value={callFollowUpForm.callDate}
                    onChange={(e) => setCallFollowUpForm((p) => ({ ...p, callDate: e.target.value }))}
                  />
                </FormField>

                <FormField label="תאריך מעקב הבא">
                  <Input
                    type="date"
                    value={callFollowUpForm.nextFollowUpDate}
                    onChange={(e) => setCallFollowUpForm((p) => ({ ...p, nextFollowUpDate: e.target.value }))}
                  />
                </FormField>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <FormField label="סוג קשר">
                  <Input
                    value={callFollowUpForm.contactType}
                    onChange={(e) => setCallFollowUpForm((p) => ({ ...p, contactType: e.target.value }))}
                    placeholder="סוג קשר"
                  />
                </FormField>

                <FormField label="מי דיבר">
                  <Input
                    value={callFollowUpForm.spokeBy}
                    onChange={(e) => setCallFollowUpForm((p) => ({ ...p, spokeBy: e.target.value }))}
                    placeholder="שם האדם"
                  />
                </FormField>
              </div>

              <FormField label="סיכום שיחה">
                <Textarea
                  value={callFollowUpForm.callSummary}
                  onChange={(e) => setCallFollowUpForm((p) => ({ ...p, callSummary: e.target.value }))}
                  placeholder="מה היה בשיחה ומה הוחלט"
                />
              </FormField>

              <FormField label="המשך טיפול">
                <Input
                  value={callFollowUpForm.nextTreatment}
                  onChange={(e) => setCallFollowUpForm((p) => ({ ...p, nextTreatment: e.target.value }))}
                  placeholder="צעד הבא"
                />
              </FormField>

              <Button variant="outline" onClick={saveCallFollowUp} disabled={savingCallFollowUp}>
                {savingCallFollowUp ? 'שומר...' : 'שמור סיכום שיחה'}
              </Button>
            </div>

            <FormField label="הערות">
              <Textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} placeholder="הערות..." />
            </FormField>
            <FormField label="קובץ">
              <div className="flex items-center gap-3 rounded-2xl border p-4 bg-white">
                <input
                  type="file"
                  onChange={(e) => setFileName(e.target.files?.[0]?.name || '')}
                />
                <div className="text-sm text-slate-600">
                  {fileName ? `נבחר: ${fileName}` : 'לא נבחר קובץ'}
                </div>
              </div>
            </FormField>
            <div className="text-xs text-slate-500">כרגע הקובץ לא נטען לשרת.</div>
          </CardContent>
        </Card>
      )}

      {tab === 'links' && (
        <Card>
          <CardHeader>
            <CardTitle>קישורים קשורים</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border p-4 space-y-2">
                <div className="text-sm font-semibold">קישור להזדמנות</div>
              {linkedOpportunity ? (
                <div className="flex flex-wrap items-center gap-2 justify-between">
                  <div className="text-sm text-slate-700">
                      {linkedOpportunity.projectOrServiceName || '—'} · {OPPORTUNITY_STAGE_LABELS[linkedOpportunity.pipelineStage] || 'שלב לא ידוע'}
                  </div>
                  <Button variant="outline" onClick={() => onNavigate('opportunities')}>פתח הזדמנויות</Button>
                </div>
              ) : (
                <div className="text-sm text-slate-500">אין הזדמנות לליד הזה</div>
              )}
            </div>

            <div className="rounded-2xl border p-4 space-y-2">
                <div className="text-sm font-semibold">קישור להצעת מחיר</div>
              {linkedQuotes.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2 justify-between">
                  <div className="text-sm text-slate-700">
                      {linkedQuotes[0].quoteNumber || '—'} · {QUOTE_STATUS_LABELS[linkedQuotes[0].status] || 'סטטוס לא ידוע'}
                  </div>
                  <Button variant="outline" onClick={() => onNavigate('quotes')}>פתח הצעות מחיר</Button>
                </div>
              ) : (
                <div className="text-sm text-slate-500">אין הצעות מחיר לליד הזה</div>
              )}
            </div>

            <div className="rounded-2xl border p-4 space-y-2">
                <div className="text-sm font-semibold">קישור ללקוח</div>
              {localCustomer ? (
                <div className="flex flex-wrap items-center gap-2 justify-between">
                  <div className="text-sm text-slate-700">
                    {localCustomer.name} · טלפון: {phoneToDisplay(localCustomer.phone) || '-'}
                  </div>
                  <Button variant="outline" onClick={() => onOpenCustomer(localCustomer)}>פתח לקוח</Button>
                </div>
              ) : (
                <div className="text-sm text-slate-500">הליד לא הומר עדיין ללקוח</div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function KpiCard({
  title,
  value,
  sub,
  icon: Icon,
}: {
  title: string;
  value: string | number;
  sub: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between p-5">
        <div>
          <div className="text-sm text-slate-500">{title}</div>
          <div className="mt-2 text-3xl font-bold">{value}</div>
          <div className="mt-2 text-sm text-slate-500">{sub}</div>
        </div>
        <div className="rounded-2xl p-3" style={{ background: galit.soft }}>
          <Icon className="h-6 w-6" style={{ color: galit.primary }} />
        </div>
      </CardContent>
    </Card>
  );
}

type ManagerDashboardPayload = {
  updatedAt: string;
  config: { monthlyRevenueTarget: number };
  kpis: {
    monthlyRevenueTarget: number;
    wonRevenueThisMonth: number;
    attainmentPct: number;
    openPipelineValue: number;
    pipelinePctOfTarget: number;
    forecast: { best: number; realistic: number; worst: number };
    teamWinRate: number;
  };
  leaderboard: Array<{
    rank: number;
    repId: string;
    repName: string;
    quotaTarget: number;
    attainmentPct: number;
    wonRevenueThisMonth: number;
    wonDealsCount: number;
    personalWinRate: number;
    pipelineValue: number;
    openLeadsCount: number;
    weeklyActivity: number;
    stuckDealsOver14: number;
  }>;
  charts: {
    pipelineStagesByRep: Array<any>;
    leadSourcesPie: Array<{ name: string; value: number }>;
    quotaProgress: Array<any>;
    conversionFunnel: Array<{ step: string; value: number }>;
  };
  alerts: {
    agingDeals: Array<{ rep: string; deal: string; ageDays: number; value: number; stage: string; level: 'red' | 'yellow' | 'green' }>;
    inactiveLeads: Array<{ rep: string; leadName: string; phone: string; serviceType: string; lastActivity: string; inactiveDays: number; level: 'red' | 'yellow' | 'green' }>;
  };
  breakdowns: {
    leadsByServiceType: Array<{ service: string; value: number }>;
    openProjects: Array<{
      id: string;
      title: string;
      client: string;
      status: string;
      priority: string | null;
      dueDate: string | null;
      technician: string | null;
      updatedAt?: string;
    }>;
  };
  coreCounts?: {
    leadsNew: number;
    leadsInTreatment: number;
    leadsWon: number;
    leadsLost: number;
    tasksOpen: number;
    tasksOverdue: number;
    quotesOpenActive: number;
    projectsOpen?: number;
    projectsInField?: number;
    reportsWaiting?: number;
  };
  workingNowEmployees: Array<{
    id: string;
    name: string;
    role: string;
    isOnline?: boolean;
    lastSeenAt?: string | null;
    currentWorkMode?: 'OFFICE' | 'FIELD' | null;
    currentProject: { id: string; name: string } | null;
  }>;
};

function ManagerDashboard({
  currentUser,
  customers,
  navigateSafely,
  onOpenCustomerById,
  onOpenProjectById,
}: {
  currentUser: AppUser;
  customers: Customer[];
  navigateSafely: (target: string) => void;
  onOpenCustomerById: (id: string) => void;
  onOpenProjectById: (id: string) => void;
}) {
  const [data, setData] = useState<ManagerDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  void customers;
  void navigateSafely;
  void onOpenCustomerById;
  void onOpenProjectById;

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch(apiUrl('/dashboard/manager'), { authUser: currentUser });
      if (!res.ok) throw new Error(await res.text());
      const payload = (await res.json()) as ManagerDashboardPayload;
      setData(payload);
    } catch {
      setError('טעינת הדשבורד נכשלה. נסה שוב מאוחר יותר.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id, currentUser.role]);

  const refresh = () => load();

  if (loading) return <div className="rounded-3xl bg-white p-6 text-sm text-slate-500 shadow-sm">טוען דשבורד...</div>;
  if (error) return <div className="rounded-3xl bg-red-50 p-6 text-sm text-red-700">{error}</div>;
  if (!data) return <div className="rounded-3xl bg-white p-6 text-sm text-slate-500">אין נתונים.</div>;

  const leavesDecor = (
    <div className="pointer-events-none absolute -left-3 -top-3 h-20 w-20 opacity-25">
      <div className="absolute left-6 top-1 h-8 w-5 rotate-[-20deg] rounded-full bg-emerald-400" />
      <div className="absolute left-12 top-6 h-7 w-4 rotate-[18deg] rounded-full bg-emerald-500" />
      <div className="absolute left-2 top-7 h-6 w-4 rotate-[-35deg] rounded-full bg-emerald-300" />
    </div>
  );

  const kpiCards = [
    {
      title: 'סה"כ לידים חדשים (ברבעון)',
      value: (data.coreCounts?.leadsNew ?? 0) * 3,
      sub: 'השוואה לרבעון קודם: +12%',
    },
    {
      title: 'הכנסה רבעונית',
      value: formatCurrencyILS(Math.round((data.kpis.wonRevenueThisMonth || 0) * 3.1)),
      sub: 'מגמת צמיחה יציבה',
    },
    {
      title: 'עמידה ביעד מכירות שנתי',
      value: `${Math.min(100, Math.round((data.kpis.attainmentPct || 0) * 100))}%`,
      sub: `יעד שנתי: ${formatCurrencyILS(Math.round(data.kpis.monthlyRevenueTarget * 12))}`,
    },
    {
      title: 'שביעות רצון לקוחות (CSAT)',
      value: '94%',
      sub: 'לפי משובים אחרונים',
    },
  ];

  const pipelineRows = data.charts.pipelineStagesByRep ?? [];
  const pipelineSummary = pipelineRows.reduce(
    (acc, row: any) => {
      acc.new += Number(row.NEW || 0);
      acc.follow1 += Number(row['FU-1'] || 0);
      acc.follow2 += Number(row['FU-2'] || 0);
      acc.quote += Number(row['Quote Sent'] || 0);
      acc.won += Number(row.WON || 0);
      return acc;
    },
    { new: 0, follow1: 0, follow2: 0, quote: 0, won: 0 },
  );
  const salesPipelineData = [
    { name: 'חדש', value: pipelineSummary.new || 8 },
    { name: 'פולואפ 1', value: pipelineSummary.follow1 || 13 },
    { name: 'פולואפ 2', value: pipelineSummary.follow2 || 10 },
    { name: 'הצעה', value: pipelineSummary.quote || 7 },
    { name: 'זכה', value: pipelineSummary.won || 4 },
  ];

  const revenueGrowthData = [
    { month: 'ינו', y2025: 120, y2026: 140 },
    { month: 'פבר', y2025: 135, y2026: 160 },
    { month: 'מרץ', y2025: 148, y2026: 176 },
    { month: 'אפר', y2025: 165, y2026: 198 },
    { month: 'מאי', y2025: 180, y2026: 214 },
    { month: 'יונ', y2025: 196, y2026: 235 },
  ];

  const customerSegmentationData = [
    { name: 'תעשייה', value: 30, color: '#16a34a' },
    { name: 'רשויות מקומיות', value: 22, color: '#22c55e' },
    { name: 'עסקים קטנים', value: 18, color: '#4ade80' },
    { name: 'חינוך', value: 16, color: '#86efac' },
    { name: 'אחר', value: 14, color: '#d1d5db' },
  ];

  const urgentTasksRows = [
    ...data.alerts.agingDeals.slice(0, 2).map((x) => ({
      task: `מעקב עסקה: ${x.deal}`,
      client: x.rep,
      due: `בעוד ${Math.max(1, 21 - x.ageDays)} ימים`,
    })),
    ...data.alerts.inactiveLeads.slice(0, 3).map((x) => ({
      task: `שיחת המשך לליד: ${x.leadName}`,
      client: x.rep,
      due: `בעוד ${Math.max(1, 10 - x.inactiveDays)} ימים`,
    })),
  ].slice(0, 5);

  const teamRows = data.leaderboard.slice(0, 4).map((r, idx) => ({
    id: r.repId,
    name: r.repName,
    pct: Math.min(100, Math.round((r.attainmentPct || 0) * 100)),
    amount: Math.round(r.wonRevenueThisMonth || 0),
    color:
      idx === 0 ? 'bg-emerald-600' : idx === 1 ? 'bg-emerald-500' : idx === 2 ? 'bg-emerald-400' : 'bg-emerald-300',
  }));

  return (
    <div className="rounded-[30px] bg-[#f5faf6] p-4 md:p-6" dir="rtl">
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {kpiCards.map((kpi) => (
            <Card key={kpi.title} className="relative overflow-hidden rounded-3xl border-0 bg-white shadow-[0_10px_26px_rgba(15,23,42,0.08)]">
              {leavesDecor}
              <CardContent className="p-6">
                <div className="text-sm font-semibold text-slate-500">{kpi.title}</div>
                <div className="mt-3 text-4xl font-black text-slate-900">{kpi.value}</div>
                <div className="mt-2 text-xs text-emerald-700">{kpi.sub}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="rounded-3xl border-0 bg-white shadow-[0_10px_26px_rgba(15,23,42,0.08)]">
            <CardHeader className="pb-2">
              <CardTitle className="text-xl font-bold text-slate-900">צינור מכירות (שלבים)</CardTitle>
            </CardHeader>
            <CardContent className="h-[290px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={salesPipelineData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: '#334155', fontSize: 12 }} />
                  <YAxis tick={{ fill: '#334155', fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#16a34a" radius={[12, 12, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-0 bg-white shadow-[0_10px_26px_rgba(15,23,42,0.08)]">
            <CardHeader className="pb-2">
              <CardTitle className="text-xl font-bold text-slate-900">צמיחת הכנסה 2025-2026</CardTitle>
            </CardHeader>
            <CardContent className="h-[290px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={revenueGrowthData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fill: '#334155', fontSize: 12 }} />
                  <YAxis tick={{ fill: '#334155', fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="y2025" name="2025" stroke="#65a30d" strokeWidth={3} dot />
                  <Line type="monotone" dataKey="y2026" name="2026" stroke="#15803d" strokeWidth={3} dot />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-0 bg-white shadow-[0_10px_26px_rgba(15,23,42,0.08)]">
            <CardHeader className="pb-2">
              <CardTitle className="text-xl font-bold text-slate-900">פילוח לקוחות</CardTitle>
            </CardHeader>
            <CardContent className="h-[290px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={customerSegmentationData} dataKey="value" nameKey="name" innerRadius={56} outerRadius={96} paddingAngle={2}>
                    {customerSegmentationData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.35fr_0.8fr_1fr]">
          <Card className="rounded-3xl border-0 bg-white shadow-[0_10px_26px_rgba(15,23,42,0.08)]">
            <CardHeader className="pb-2">
              <CardTitle className="text-xl font-bold text-slate-900">משימות דחופות</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-emerald-50">
                    <TableHead>משימה</TableHead>
                    <TableHead>לקוח</TableHead>
                    <TableHead>תאריך יעד</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {urgentTasksRows.map((row, idx) => (
                    <TableRow key={`${row.task}-${idx}`} className="hover:bg-slate-50">
                      <TableCell className="font-medium">{row.task}</TableCell>
                      <TableCell>{row.client}</TableCell>
                      <TableCell>{row.due}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-0 bg-white shadow-[0_10px_26px_rgba(15,23,42,0.08)]">
            <CardHeader className="pb-2">
              <CardTitle className="text-xl font-bold text-slate-900">השפעה סביבתית (CO2 שנחסך)</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center py-10">
              <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-4xl">🌳</div>
              <div className="text-4xl font-black text-emerald-700">1,200 טון</div>
              <div className="mt-2 text-sm text-slate-500">חיסכון מצטבר בפרויקטים פעילים</div>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-0 bg-white shadow-[0_10px_26px_rgba(15,23,42,0.08)]">
            <CardHeader className="pb-2">
              <CardTitle className="text-xl font-bold text-slate-900">ביצועי צוות מכירות</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {teamRows.map((row) => (
                <div key={row.id} className="space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-emerald-100" />
                      <div className="text-sm font-semibold text-slate-800">{row.name}</div>
                    </div>
                    <div className="text-xs text-slate-500">{formatCurrencyILS(row.amount)}</div>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-100">
                    <div className={cn('h-2 rounded-full', row.color)} style={{ width: `${row.pct}%` }} />
                  </div>
                  <div className="text-xs text-emerald-700">{row.pct}%</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-end">
          <Button style={{ background: galit.primary }} className="rounded-2xl px-5" onClick={refresh}>
            רענון נתונים
          </Button>
        </div>
      </div>
    </div>
  );
}

function DashboardPage({
  leads,
  quotes,
  opportunities,
  projects,
  tasks,
  stats,
}: {
  leads: Lead[];
  quotes: Quote[];
  opportunities: Opportunity[];
  projects: Project[];
  tasks: Task[];
  stats?: DashboardStats | null;
}) {
  const leadStatus = (l: Lead) => (l.leadStatus || l.status || l.stage || '').toUpperCase();
  const leadsNew = leads.filter((l) => leadStatus(l) === 'NEW').length;
  const leadsInTreatment = leads.filter((l) => ['CONTACTED', 'FU_1', 'FU_2', 'QUOTE_SENT', 'NEGOTIATION'].includes(leadStatus(l))).length;
  const wonDeals = leads.filter((l) => leadStatus(l) === 'WON').length;
  const lostDeals = leads.filter((l) => leadStatus(l) === 'LOST').length;
  const openTasks = tasks.filter((t) => ['OPEN', 'IN_PROGRESS'].includes((t.status || 'OPEN').toUpperCase())).length;
  const overdueTasks = tasks.filter((t) => {
    const st = (t.status || 'OPEN').toUpperCase();
    if (!['OPEN', 'IN_PROGRESS'].includes(st)) return false;
    if (!t.dueDate) return false;
    return new Date(t.dueDate).getTime() < Date.now();
  }).length;
  const openQuotes = quotes.filter((q) => ['DRAFT', 'SENT'].includes((q.status || '').toUpperCase())).length;

  const totalLeads = leads.length;
  const revenueTotal = quotes
    .filter((q) => q.status === 'APPROVED' || q.status === 'SIGNED')
    .reduce((acc, q) => acc + Number(q.totalAmount ?? q.amount ?? 0), 0);

  const leadsBySource = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of leads) {
      const key = (l.source || 'לא ידוע').toString();
      map.set(key, (map.get(key) || 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [leads]);

  const leadsByServiceType = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of leads) {
      const key = (l.service || 'לא ידוע').toString();
      map.set(key, (map.get(key) || 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [leads]);

  const quotesSent = quotes.filter((q) => q.status === 'SENT').length;
  const quotesApproved = quotes.filter((q) => q.status === 'APPROVED' || q.status === 'SIGNED').length;
  const lostOpportunities = opportunities.filter((o) => (o.pipelineStage || '').toUpperCase() === 'LOST').length;

  const conversionLeadsToSent =
    totalLeads === 0 ? 0 : Math.round((quotesSent / totalLeads) * 100);
  const conversionSentToApproved =
    quotesSent === 0 ? 0 : Math.round((quotesApproved / quotesSent) * 100);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard title="לידים חדשים" value={leadsNew} sub="סטטוס חדש" icon={Users} />
        <KpiCard title="לידים בטיפול" value={leadsInTreatment} sub="בטיפול שוטף" icon={Clock3} />
        <KpiCard title="לידים שזכו" value={wonDeals} sub="נסגרו בהצלחה" icon={CheckCircle2} />
        <KpiCard title="לידים שאבדו" value={lostDeals} sub="נסגרו כאבודים" icon={AlertTriangle} />
        <KpiCard title="משימות פתוחות" value={openTasks} sub="פתוחות/בביצוע" icon={ClipboardList} />
        <KpiCard title="משימות באיחור" value={overdueTasks} sub="עבר תאריך יעד" icon={Clock3} />
        <KpiCard title="הצעות מחיר פתוחות" value={openQuotes} sub="טיוטה / נשלחה" icon={FileText} />
        <KpiCard title="הכנסות חתומות" value={formatCurrencyILS(revenueTotal)} sub='סה"כ חתום' icon={FileText} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>מדדי מכירות</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-2xl border p-3">
              <div className="text-sm text-slate-600">הצעות שנשלחו</div>
              <div className="text-lg font-bold">{quotesSent}</div>
            </div>
            <div className="flex items-center justify-between rounded-2xl border p-3">
              <div className="text-sm text-slate-600">הצעות מאושרות</div>
              <div className="text-lg font-bold">{quotesApproved}</div>
            </div>
            <div className="flex items-center justify-between rounded-2xl border p-3">
              <div className="text-sm text-slate-600">הזדמנויות אבודות</div>
              <div className="text-lg font-bold">{lostOpportunities}</div>
            </div>
            <div className="flex items-center justify-between rounded-2xl border p-3">
              <div className="text-sm text-slate-600">המרה: ליד → נשלח</div>
              <div className="text-lg font-bold">{conversionLeadsToSent}%</div>
            </div>
            <div className="flex items-center justify-between rounded-2xl border p-3">
              <div className="text-sm text-slate-600">המרה: נשלח → מאושר</div>
              <div className="text-lg font-bold">{conversionSentToApproved}%</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>תפעול (Wave 3)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-2xl border p-3">
              <div className="text-sm text-slate-600">דוחות בכתיבה</div>
              <div className="text-lg font-bold">{stats?.reportsWaitingWriting ?? 0}</div>
            </div>
            <div className="flex items-center justify-between rounded-2xl border p-3">
              <div className="text-sm text-slate-600">דוחות בבקרה</div>
              <div className="text-lg font-bold">{stats?.reportsInReview ?? 0}</div>
            </div>
            <div className="flex items-center justify-between rounded-2xl border p-3">
              <div className="text-sm text-slate-600">דוחות נשלחו השבוע</div>
              <div className="text-lg font-bold">{stats?.reportsSentThisWeek ?? 0}</div>
            </div>
            <div className="flex items-center justify-between rounded-2xl border p-3">
              <div className="text-sm text-slate-600">דגימות באנליזה</div>
              <div className="text-lg font-bold">{stats?.samplesInAnalysis ?? 0}</div>
            </div>
            <div className="flex items-center justify-between rounded-2xl border p-3">
              <div className="text-sm text-slate-600">חריגות בדגימות</div>
              <div className="text-lg font-bold">{stats?.abnormalSampleResults ?? 0}</div>
            </div>
            <div className="flex items-center justify-between rounded-2xl border p-3">
              <div className="text-sm text-slate-600">פרויקטים ממתינים לנתונים</div>
              <div className="text-lg font-bold">{stats?.projectsWaitingForData ?? 0}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>לידים לפי מקור</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {leadsBySource.length === 0 ? (
              <div className="text-sm text-slate-500">אין נתונים</div>
            ) : (
              leadsBySource.slice(0, 8).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between rounded-2xl border p-3">
                  <div className="text-sm text-slate-700">{k}</div>
                  <div className="text-sm font-semibold">{v}</div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>לידים לפי סוג שירות</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {leadsByServiceType.length === 0 ? (
              <div className="text-sm text-slate-500">אין נתונים</div>
            ) : (
              leadsByServiceType.slice(0, 8).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between rounded-2xl border p-3">
                  <div className="text-sm text-slate-700">{k}</div>
                  <div className="text-sm font-semibold">{v}</div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>פרויקטים פעילים</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {projects.map((p) => (
              <div key={p.id} className="rounded-2xl border p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold">{p.name}</div>
                    <div className="mt-1 text-sm text-slate-500">
                      {p.client} · אחראי: {p.owner} · יעד: {p.due}
                    </div>
                  </div>
                  <Badge className={statusBadge(p.status)}>{statusLabel(p.status)}</Badge>
                </div>
                <div className="mt-3">
                  <Progress value={p.progress} />
                  <div className="mt-2 text-xs text-slate-500">התקדמות {p.progress}%</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>משימות להיום</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {tasks.map((t) => (
              <div key={t.id} className="rounded-2xl border p-3">
                <div className="font-medium">{t.title}</div>
                <div className="mt-1 text-sm text-slate-500">{t.owner} · {t.due}</div>
                <div className="mt-2 inline-block rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-700">עדיפות {taskPriorityLabel(t.priority)}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function LeadsPage({
  leads,
  setLeads,
  customers,
  onOpenLead,
  onOpenCustomer,
  onOpenProjectById,
  onNavigate,
  loadError,
  currentUser,
  users,
}: {
  leads: Lead[];
  setLeads: React.Dispatch<React.SetStateAction<Lead[]>>;
  customers: Customer[];
  onOpenLead: (lead: Lead) => void;
  onOpenCustomer?: (customer: Customer) => void;
  onOpenProjectById?: (projectId: string) => void;
  onNavigate?: (target: string) => void;
  loadError?: string;
  currentUser: AppUser;
  users: AppUser[];
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    fullName: '',
    phone: '',
    email: '',
    company: '',
    city: '',
    address: '',
    source: 'אתר',
    utm_source: '',
    utm_medium: '',
    utm_campaign: '',
    utm_content: '',
    utm_term: '',
    serviceType: 'קרינה',
    site: '',
    assignedUserId: '',
    followUp1Date: '',
    followUp2Date: '',
    nextFollowUpDate: '',
    leadStatus: 'NEW',
    notes: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [filterSource, setFilterSource] = useState('');
  const [filterServiceType, setFilterServiceType] = useState('');
  const [filterAssignedUser, setFilterAssignedUser] = useState('');
  const [filterLeadStatus, setFilterLeadStatus] = useState('');
  const [filterCreatedAt, setFilterCreatedAt] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim();
    return leads.filter((l) => {
      const name = l.fullName || l.name || '';
      const serviceType = l.serviceType || l.service || '';
      const assignedName = l.assignedUserId ? users.find((u) => u.id === l.assignedUserId)?.name || '' : '';
      const createdOk = !filterCreatedAt || (l.createdAt ? new Date(l.createdAt).toLocaleDateString('en-CA') === filterCreatedAt : false);
      const sourceOk = !filterSource || (l.source || '') === filterSource;
      const serviceOk = !filterServiceType || serviceType === filterServiceType;
      const assignedOk = !filterAssignedUser || assignedName === filterAssignedUser;
      const statusOk = !filterLeadStatus || (l.leadStatus || l.status || '') === filterLeadStatus;
      const searchOk =
        !q ||
        [name, l.phone, l.city || '', l.source || '', serviceType, l.company || '']
          .join(' ')
          .includes(q);
      return createdOk && sourceOk && serviceOk && assignedOk && statusOk && searchOk;
    });
  }, [leads, search, filterAssignedUser, filterCreatedAt, filterLeadStatus, filterServiceType, filterSource, users]);

  const sources = useMemo(() => Array.from(new Set(leads.map((l) => l.source).filter(Boolean))).sort(), [leads]);
  const serviceTypes = useMemo(() => Array.from(new Set(leads.map((l) => (l.serviceType || l.service)).filter(Boolean))).sort(), [leads]);
  const leadAssigneeLabel = (lead: Lead) => {
    const raw = (lead as any).assignee;
    if (typeof raw === 'string') return raw || '-';
    if (raw && typeof raw === 'object') return raw.name || raw.email || '-';

    const assigned = (lead as any).assignedUserId;
    if (typeof assigned === 'string') return users.find((u) => u.id === assigned)?.name || assigned || '-';
    if (assigned && typeof assigned === 'object') return assigned.name || assigned.email || '-';

    return '-';
  };

  const patchLead = async (id: string, payload: any) => {
    setError('');
    setSuccess('');
    try {
      const res = await apiFetch(apiUrl(`/leads/${id}`), {
        method: 'PATCH',
        authUser: currentUser,
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      setLeads((prev) =>
        prev.map((l) =>
          l.id === id
            ? {
                ...l,
                ...updated,
                fullName: updated.fullName ?? l.fullName,
                leadStatus: updated.leadStatus ?? l.leadStatus,
                followUp1Date: updated.followUp1Date ?? l.followUp1Date,
                followUp2Date: updated.followUp2Date ?? l.followUp2Date,
                nextFollowUpDate: updated.nextFollowUpDate ?? l.nextFollowUpDate,
                assignedUserId: updated.assignedUserId ?? l.assignedUserId,
              }
            : l,
        ),
      );
      setSuccess('עודכן בהצלחה');
    } catch {
      setError('עדכון ליד נכשל. נסה שוב מאוחר יותר.');
    }
  };

  const setFollowUp = async (lead: Lead, which: 1 | 2) => {
    const base = new Date();
    base.setDate(base.getDate() + (which === 1 ? 2 : 7));
    const dateStr = base.toISOString().slice(0, 10);
    await patchLead(lead.id, {
      [`followUp${which}Date`]: dateStr,
      leadStatus: which === 1 ? 'FU_1' : 'FU_2',
      nextFollowUpDate: dateStr,
    });
  };

  const updateNextFollowUp = async (lead: Lead) => {
    const suggested = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const picked =
      typeof window !== 'undefined'
        ? window.prompt('בחר תאריך לפולואפ הבא (YYYY-MM-DD)', suggested)
        : suggested;
    if (!picked) return;
    const valid = /^\d{4}-\d{2}-\d{2}$/.test(picked);
    if (!valid) {
      setError('תאריך לא תקין. יש להזין בפורמט YYYY-MM-DD');
      return;
    }
    const dateStr = picked;
    await patchLead(lead.id, { nextFollowUpDate: dateStr });
  };

  const convertToOpportunity = async (lead: Lead) => {
    setError('');
    setSuccess('');
    try {
      const matchedCustomer =
        customers.find((c) => c.name === lead.company) ||
        customers.find((c) => c.name === lead.name) ||
        undefined;
      const payload: any = {
        leadId: lead.id,
        customerId: matchedCustomer?.id ?? null,
        projectOrServiceName: lead.serviceType || lead.service || 'שירות',
        estimatedValue: 0,
        pipelineStage: 'NEW',
        assignedUserId: lead.assignedUserId ?? currentUser.id,
        notes: lead.notes ?? null,
      };
      const res = await apiFetch(apiUrl('/opportunities'), {
        method: 'POST',
        authUser: currentUser,
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      setSuccess('הזדמנות נוצרה בהצלחה');
      await patchLead(lead.id, { leadStatus: 'QUOTE_SENT' });
    } catch {
      setError('יצירת הזדמנות נכשלה. נסה שוב מאוחר יותר.');
    }
  };

  const convertToCustomer = async (lead: Lead) => {
    setError('');
    setSuccess('');
    try {
      const res = await apiFetch(apiUrl(`/leads/${encodeURIComponent(lead.id)}/convert-to-customer`), {
        method: 'POST',
        authUser: currentUser,
      });
      if (!res.ok) throw new Error(await res.text());
      const customer = await res.json();
      if (!customer?.id) {
        setError('לא נמצא לקוח לאחר ההמרה');
        return;
      }
      setSuccess('הליד הומר ללקוח בהצלחה');
      // best-effort refresh: keep lead list stable, customer list is owned by parent
      await patchLead(lead.id, { leadStatus: 'NEW' });
      // Refresh this lead so the customer relation (customerId + customer object) is available in UI.
      try {
        const leadRes = await apiFetch(apiUrl(`/leads/${encodeURIComponent(lead.id)}`), {
          authUser: currentUser,
        });
        if (leadRes.ok) {
          const fresh = await leadRes.json();
          setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, ...fresh } : l)));
        }
      } catch {
        // keep best-effort behavior
      }
      if (onOpenCustomer) {
        onOpenCustomer(customer as Customer);
      } else {
        onNavigate?.('customers');
      }
      setSuccess('הליד הומר ללקוח בהצלחה');
    } catch {
      setError('המרה ללקוח נכשלה.');
    }
  };

  const createQuoteFromLead = async (lead: Lead) => {
    setError('');
    setSuccess('');
    try {
      const res = await apiFetch(apiUrl(`/leads/${encodeURIComponent(lead.id)}/create-quote`), {
        method: 'POST',
        authUser: currentUser,
      });
      if (!res.ok) throw new Error(await res.text());
      const quote = await res.json();
      if (!quote?.id) {
        setError('יצירת הצעת מחיר בוצעה חלקית בלבד');
        return;
      }
      setSuccess('נוצרה הצעת מחיר מהליד');
      await patchLead(lead.id, { leadStatus: 'QUOTE_SENT' });
      onNavigate?.('quotes');
    } catch {
      setError('יצירת הצעת מחיר נכשלה.');
    }
  };

  const openProjectFromLead = async (lead: Lead) => {
    setError('');
    setSuccess('');
    try {
      const res = await apiFetch(apiUrl(`/leads/${encodeURIComponent(lead.id)}/open-project`), {
        method: 'POST',
        authUser: currentUser,
      });
      if (!res.ok) throw new Error(await res.text());
      setSuccess('נפתח פרויקט מהליד');
      const project = await res.json();
      if (!project?.id) {
        setError('לא התקבל פרויקט לפתיחה');
        return;
      }
      await patchLead(lead.id, { leadStatus: 'WON', projectId: project?.id ?? null });
      onOpenProjectById?.(project.id);
      if (!onOpenProjectById) onNavigate?.('projects');
    } catch {
      setError('פתיחת פרויקט נכשלה.');
    }
  };

  const stages = ['NEW', 'CONTACTED', 'QUOTE_SENT', 'NEGOTIATION', 'WON', 'LOST'] as const;

  const leadsByStage = useMemo(() => {
    const map: Record<string, Lead[]> = {};
    stages.forEach((s) => (map[s] = []));
    for (const lead of leads) {
      const stage = lead.stage || 'NEW';
      if (!map[stage]) map[stage] = [];
      map[stage].push(lead);
    }
    return map;
  }, [leads]);

  const moveLeadStage = async (lead: Lead, stage: string) => {
    const previousStage = lead.stage || 'NEW';
    setLeads((prev) =>
      prev.map((item) => (item.id === lead.id ? { ...item, stage } : item)),
    );
    try {
      await apiFetch(apiUrl(`/leads/${lead.id}/stage`), {
        method: 'PATCH',
        authUser: currentUser,
        body: JSON.stringify({ stage }),
      });
    } catch {
      setLeads((prev) =>
        prev.map((item) => (item.id === lead.id ? { ...item, stage: previousStage } : item)),
      );
    }
  };

  const addLead = async () => {
    const fullName = (form.fullName || [form.firstName, form.lastName].filter(Boolean).join(' ')).trim();
    if (!fullName) return;

    setError('');
    setSuccess('');
    setLoading(true);
    const parts = fullName.split(' ');
    const payload: any = {
      firstName: parts[0] || fullName,
      lastName: parts.slice(1).join(' '),
      fullName,
      phone: form.phone,
      email: form.email || null,
      company: form.company,
      city: form.city || null,
      address: form.address || null,
      source: form.source,
      utm_source: form.utm_source || null,
      utm_medium: form.utm_medium || null,
      utm_campaign: form.utm_campaign || null,
      utm_content: form.utm_content || null,
      utm_term: form.utm_term || null,
      serviceType: form.serviceType,
      site: form.site || null,
      assignedUserId: form.assignedUserId || null,
      followUp1Date: form.followUp1Date || null,
      followUp2Date: form.followUp2Date || null,
      nextFollowUpDate: form.nextFollowUpDate || null,
      leadStatus: form.leadStatus,
      notes: form.notes || null,
      // legacy compatibility
      service: form.serviceType,
      status: 'NEW',
    };

    try {
      const res = await apiFetch(apiUrl('/leads'), {
        method: 'POST',
        authUser: currentUser,
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('יצירת נתונים נכשלה');
      const newLead = await res.json();

      const normalizedLead: Lead = {
        id: newLead.id || `L-${Date.now()}`,
        name: newLead.fullName || fullName,
        fullName: newLead.fullName || fullName,
        firstName: newLead.firstName || payload.firstName,
        lastName: newLead.lastName || payload.lastName,
        company: newLead.company || newLead.companyName || payload.company,
        service: newLead.service || payload.service,
        serviceType: newLead.serviceType || payload.serviceType,
        source: newLead.source || payload.source,
        status: newLead.status || 'NEW',
        leadStatus: newLead.leadStatus || payload.leadStatus,
        assignedUserId: newLead.assignedUserId || payload.assignedUserId,
        phone: newLead.phone || payload.phone,
        email: newLead.email || payload.email,
        city: newLead.city || payload.city,
        address: newLead.address || payload.address,
        followUp1Date: newLead.followUp1Date || payload.followUp1Date,
        followUp2Date: newLead.followUp2Date || payload.followUp2Date,
        nextFollowUpDate: newLead.nextFollowUpDate || payload.nextFollowUpDate,
        site: newLead.site || newLead.siteAddress || '',
        notes: newLead.notes || payload.notes || '',
        assignee: '',
      };

      setLeads((prev) => [normalizedLead, ...prev]);
      setOpen(false);
      setForm({
        firstName: '',
        lastName: '',
        fullName: '',
        phone: '',
        email: '',
        company: '',
        city: '',
        address: '',
        source: 'אתר',
        utm_source: '',
        utm_medium: '',
        utm_campaign: '',
        utm_content: '',
        utm_term: '',
        serviceType: 'קרינה',
        site: '',
        assignedUserId: '',
        followUp1Date: '',
        followUp2Date: '',
        nextFollowUpDate: '',
        leadStatus: 'NEW',
        notes: '',
      });
      setSuccess('ליד נוצר בהצלחה');
    } catch {
      setError('יצירת ליד נכשלה. נסה שוב מאוחר יותר.');
    } finally {
      setLoading(false);
    }
  };

  const startEditLead = (lead: Lead) => {
    setSelectedLead(lead);
    setForm({
      firstName: lead.firstName || '',
      lastName: lead.lastName || '',
      fullName: lead.fullName || lead.name || '',
      phone: lead.phone || '',
      email: lead.email || '',
      company: lead.company || '',
      city: lead.city || '',
      address: lead.address || '',
      source: lead.source || 'אתר',
      utm_source: lead.utm_source || '',
      utm_medium: lead.utm_medium || '',
      utm_campaign: lead.utm_campaign || '',
      utm_content: lead.utm_content || '',
      utm_term: lead.utm_term || '',
      serviceType: lead.serviceType || lead.service || 'קרינה',
      site: lead.site || '',
      assignedUserId: lead.assignedUserId || '',
      followUp1Date: lead.followUp1Date ? new Date(lead.followUp1Date).toLocaleDateString('en-CA') : '',
      followUp2Date: lead.followUp2Date ? new Date(lead.followUp2Date).toLocaleDateString('en-CA') : '',
      nextFollowUpDate: lead.nextFollowUpDate ? new Date(lead.nextFollowUpDate).toLocaleDateString('en-CA') : '',
      leadStatus: lead.leadStatus || lead.status || 'NEW',
      notes: lead.notes || '',
    });
    setError('');
    setSuccess('');
    setEditOpen(true);
  };

  const saveEditedLead = async () => {
    if (!selectedLead) return;
    const fullName = (form.fullName || [form.firstName, form.lastName].filter(Boolean).join(' ')).trim();
    if (!fullName) return;

    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const res = await apiFetch(apiUrl(`/leads/${selectedLead.id}`), {
        method: 'PATCH',
        authUser: currentUser,
        body: JSON.stringify({
          firstName: form.firstName || null,
          lastName: form.lastName || null,
          fullName,
          phone: form.phone || null,
          email: form.email || null,
          company: form.company || null,
          city: form.city || null,
          address: form.address || null,
          source: form.source || null,
          utm_source: form.utm_source || null,
          utm_medium: form.utm_medium || null,
          utm_campaign: form.utm_campaign || null,
          utm_content: form.utm_content || null,
          utm_term: form.utm_term || null,
          serviceType: form.serviceType || null,
          site: form.site || null,
          assignedUserId: form.assignedUserId || null,
          followUp1Date: form.followUp1Date || null,
          followUp2Date: form.followUp2Date || null,
          nextFollowUpDate: form.nextFollowUpDate || null,
          leadStatus: form.leadStatus || null,
          notes: form.notes || null,
          // legacy compatibility
          service: form.serviceType || null,
        }),
      });

      if (!res.ok) throw new Error('עדכון נתונים נכשלה');
      const updated = await res.json();

      setLeads((prev) =>
        prev.map((lead) =>
          lead.id === selectedLead.id
            ? {
                ...lead,
                ...updated,
                name: updated.fullName ?? fullName,
                fullName: updated.fullName ?? fullName,
                serviceType: updated.serviceType ?? form.serviceType,
                assignedUserId: updated.assignedUserId ?? (form.assignedUserId || null),
                leadStatus: updated.leadStatus ?? form.leadStatus,
              }
            : lead,
        ),
      );
      setEditOpen(false);
      setSelectedLead(null);
      setSuccess('הליד עודכן בהצלחה');
    } catch {
      setError('עדכון ליד נכשל. נסה שוב מאוחר יותר.');
    } finally {
      setLoading(false);
    }
  };

  const deleteLead = async (lead: Lead) => {
    if (!window.confirm('האם אתה בטוח שברצונך למחוק את הליד?')) return;
    try {
      const res = await apiFetch(apiUrl(`/leads/${lead.id}`), {
        method: 'DELETE',
        authUser: currentUser,
      });
      if (!res.ok) throw new Error('מחיקת נתונים נכשלה');
      setLeads((prev) => prev.filter((item) => item.id !== lead.id));
    } catch {
      alert('מחיקת ליד נכשלה. נסה שוב מאוחר יותר.');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: galit.text }}>לידים</h1>
          <p className="mt-1 text-slate-500">ניהול פניות חדשות, פולואפ ושיוך אחראי</p>
        </div>
        <Button className="rounded-2xl" style={{ background: galit.primary }} onClick={() => setOpen(true)}>
          <Plus className="ml-2 h-4 w-4" />
          ליד חדש
        </Button>
      </div>

      {loadError && (
        <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="יצירת ליד חדש">
        <div className="space-y-3">
          <FormField label="שם מלא">
            <Input placeholder="שם מלא" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          </FormField>
          <FormField label="חברה / לקוח">
            <Input placeholder="חברה / לקוח" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
          </FormField>
          <FormField label="טלפון">
            <PhoneInput placeholder="טלפון" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
          </FormField>
          <FormField label="כתובת אתר">
            <Input placeholder="כתובת אתר" value={form.site} onChange={(e) => setForm({ ...form, site: e.target.value })} />
          </FormField>
          <FormField label="סוג שירות">
            <Select value={form.serviceType} onChange={(v) => setForm({ ...form, serviceType: v })} options={['קרינה', 'אקוסטיקה / רעש', 'אסבסט', 'איכות אוויר', 'ראדון', 'ריח', 'קרקע', 'אחר']} />
          </FormField>
          <FormField label="מקור ליד">
            <Select value={form.source} onChange={(v) => setForm({ ...form, source: v })} options={['טלפון', 'אתר', 'וואטסאפ', 'פייסבוק', 'גוגל', 'לקוח חוזר', 'הפניה', 'אחר']} />
          </FormField>
          {error && <div className="rounded-2xl bg-red-50 px-4 py-2 text-xs text-red-700">{error}</div>}
          <Button className="w-full" style={{ background: galit.primary }} onClick={addLead}>
            {loading ? 'שומר...' : 'שמור ליד'}
          </Button>
        </div>
      </Modal>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="עריכת ליד">
        <div className="space-y-3">
          <FormField label="שם מלא">
            <Input placeholder="שם מלא" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          </FormField>
          <FormField label="חברה / לקוח">
            <Input placeholder="חברה / לקוח" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
          </FormField>
          <FormField label="טלפון">
            <PhoneInput placeholder="טלפון" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
          </FormField>
          <FormField label="כתובת אתר">
            <Input placeholder="כתובת אתר" value={form.site} onChange={(e) => setForm({ ...form, site: e.target.value })} />
          </FormField>
          <FormField label="סוג שירות">
            <Select value={form.serviceType} onChange={(v) => setForm({ ...form, serviceType: v })} options={['קרינה', 'אקוסטיקה / רעש', 'אסבסט', 'איכות אוויר', 'ראדון', 'ריח', 'קרקע', 'אחר']} />
          </FormField>
          <FormField label="מקור ליד">
            <Select value={form.source} onChange={(v) => setForm({ ...form, source: v })} options={['טלפון', 'אתר', 'וואטסאפ', 'פייסבוק', 'גוגל', 'לקוח חוזר', 'הפניה', 'אחר']} />
          </FormField>
          {error && <div className="rounded-2xl bg-red-50 px-4 py-2 text-xs text-red-700">{error}</div>}
          <Button className="w-full" style={{ background: galit.primary }} onClick={saveEditedLead}>
            {loading ? 'שומר...' : 'שמור שינויים'}
          </Button>
        </div>
      </Modal>

      <Card>
        <CardContent className="p-3 sm:p-4">
          {(error || success) && (
            <div
              className={`mb-4 rounded-2xl px-4 py-3 text-sm ${
                error ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'
              }`}
            >
              {error || success}
            </div>
          )}

          <div className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-5">
            <FormField label="מקור ליד">
              <Select
                value={filterSource || 'הכל'}
                onChange={(v) => setFilterSource(v === 'הכל' ? '' : v)}
                options={['הכל', ...sources]}
              />
            </FormField>
            <FormField label="סוג שירות">
              <Select
                value={filterServiceType || 'הכל'}
                onChange={(v) => setFilterServiceType(v === 'הכל' ? '' : v)}
                options={['הכל', ...serviceTypes]}
              />
            </FormField>
            <FormField label="אחראי">
              <Select
                value={filterAssignedUser || 'הכל'}
                onChange={(v) => setFilterAssignedUser(v === 'הכל' ? '' : v)}
                options={['הכל', ...users.map((u) => u.name)]}
              />
            </FormField>
            <FormField label="סטטוס ליד">
              <select
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-slate-400"
                value={filterLeadStatus || ''}
                onChange={(e) => setFilterLeadStatus(e.target.value)}
              >
                <option value="">הכל</option>
                <option value="NEW">חדש</option>
                <option value="FU_1">פולואפ 1</option>
                <option value="FU_2">פולואפ 2</option>
                <option value="QUOTE_SENT">הצעה נשלחה</option>
                <option value="WON">זכייה</option>
                <option value="LOST">אבוד</option>
                <option value="NOT_RELEVANT">לא רלוונטי</option>
              </select>
            </FormField>
            <FormField label="תאריך יצירה">
              <Input type="date" value={filterCreatedAt} onChange={(e) => setFilterCreatedAt(e.target.value)} placeholder="תאריך יצירה" />
            </FormField>
          </div>

          <FormField label="חיפוש">
            <div className="relative mb-4">
              <Search className="absolute right-3 top-3 h-4 w-4 text-slate-400" />
              <Input className="pr-9" placeholder="חיפוש לפי שם, חברה, שירות או עיר" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </FormField>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>שם</TableHead>
                  <TableHead>טלפון</TableHead>
                  <TableHead>עיר</TableHead>
                  <TableHead>מקור</TableHead>
                  <TableHead>סוג שירות</TableHead>
                  <TableHead>משויך ל</TableHead>
                  <TableHead>סטטוס</TableHead>
                  <TableHead>פולואפ הבא</TableHead>
                  <TableHead>נוצר</TableHead>
                  <TableHead>פעולות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((lead) => (
                  <TableRow
                    key={lead.id}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => onOpenLead(lead)}
                  >
                    <TableCell className="font-medium">{lead.fullName || lead.name}</TableCell>
                    <TableCell>
                      {lead.phone ? (
                        <div className="space-y-1">
                          <a
                            href={phoneToTelHref(lead.phone) || undefined}
                            className="hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {phoneToDisplay(lead.phone)}
                          </a>
                          <div className="text-xs">
                            <a
                              href={phoneToWhatsAppHref(lead.phone) || undefined}
                              className="text-sky-700 hover:underline"
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                            >
                              וואטסאפ
                            </a>
                          </div>
                        </div>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>{lead.city || '-'}</TableCell>
                    <TableCell>{lead.source || '-'}</TableCell>
                    <TableCell>{lead.serviceType || lead.service || '-'}</TableCell>
                    <TableCell>
                      {leadAssigneeLabel(lead)}
                    </TableCell>
                    <TableCell>
                      <Badge className="bg-slate-100 text-slate-700">
                        {statusLabel(String(lead.leadStatus || lead.status || '-'))}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {lead.nextFollowUpDate ? new Date(lead.nextFollowUpDate).toLocaleDateString('en-CA') : '-'}
                    </TableCell>
                    <TableCell>{lead.createdAt ? new Date(lead.createdAt).toLocaleDateString('en-CA') : '-'}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="rounded-xl border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          onClick={() => onOpenLead(lead)}
                        >
                          פתח ליד
                        </button>
                        <button
                          className="rounded-xl border border-cyan-300 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-800 hover:bg-cyan-100"
                          onClick={() => setFollowUp(lead, 1)}
                        >
                          קבע פולואפ 1
                        </button>
                        <button
                          className="rounded-xl border border-sky-300 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800 hover:bg-sky-100"
                          onClick={() => setFollowUp(lead, 2)}
                        >
                          קבע פולואפ 2
                        </button>
                        <button
                          className="rounded-xl border border-indigo-300 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800 hover:bg-indigo-100"
                          onClick={() => updateNextFollowUp(lead)}
                        >
                          עדכן פולואפ הבא
                        </button>
                        <button
                          className="rounded-xl px-3 py-1 text-xs font-semibold text-white"
                          style={{ background: galit.primary }}
                          onClick={() => createQuoteFromLead(lead)}
                        >
                          צור הצעת מחיר
                        </button>
                        <button
                          className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                          onClick={() => convertToCustomer(lead)}
                        >
                          הפוך ללקוח
                        </button>
                        <button
                          className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                          onClick={() => openProjectFromLead(lead)}
                        >
                          פתח פרויקט
                        </button>
                        <button
                          className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-800 hover:bg-rose-100"
                          onClick={() => patchLead(lead.id, { leadStatus: 'LOST' })}
                        >
                          סמן כאבוד
                        </button>
                        <button
                          className="rounded-xl border border-orange-300 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-800 hover:bg-orange-100"
                          onClick={() => patchLead(lead.id, { leadStatus: 'NOT_RELEVANT' })}
                        >
                          סמן כלא רלוונטי
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-3 md:hidden">
            {filtered.map((lead) => {
              const linkedCustomer = findCustomerByLead(lead, customers);
              const s = (lead.leadStatus || lead.status || '').toString();
              return (
                <button
                  key={lead.id}
                  onClick={() => onOpenLead(lead)}
                  className="w-full rounded-2xl border p-4 text-right transition hover:bg-slate-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{lead.fullName || lead.name}</div>
                      <div className="mt-1 text-sm text-slate-500">
                        {lead.phone ? (
                          <div className="space-y-1">
                            <a
                              href={phoneToTelHref(lead.phone) || undefined}
                              className="hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {phoneToDisplay(lead.phone)}
                            </a>
                            <div className="text-xs">
                              <a
                                href={phoneToWhatsAppHref(lead.phone) || undefined}
                                className="text-sky-700 hover:underline"
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                              >
                                וואטסאפ
                              </a>
                            </div>
                          </div>
                        ) : (
                          '-'
                        )}
                      </div>
                    </div>
                      <Badge className="bg-slate-100 text-slate-700">{statusLabel(s || '-')}</Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-slate-400">חברה</div>
                      <div className="font-medium">{lead.company || '-'}</div>
                    </div>
                    <div>
                      <div className="text-slate-400">שירות</div>
                      <div className="font-medium">{lead.serviceType || lead.service || '-'}</div>
                    </div>
                    <div>
                      <div className="text-slate-400">מקור</div>
                      <div className="font-medium">{lead.source || '-'}</div>
                    </div>
                    <div>
                      <div className="text-slate-400">אחראי</div>
                      <div className="font-medium">{leadAssigneeLabel(lead)}</div>
                    </div>
                    <div className="col-span-2">
                      <div className="text-slate-400">אתר</div>
                      <div className="font-medium">{lead.site || '-'}</div>
                    </div>
                    {linkedCustomer && (
                      <div className="col-span-2 rounded-xl bg-slate-50 p-3">
                        <div className="text-slate-400">לקוח משויך</div>
                        <div className="font-medium">{linkedCustomer.name}</div>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="mt-6">
            <h2 className="mb-3 text-lg font-semibold" style={{ color: galit.text }}>צינור לידים</h2>
            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
              {stages.map((stage) => (
                <div key={stage} className="rounded-2xl border bg-white p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-semibold">{statusLabel(stage)}</span>
                    <span className="text-xs text-slate-400">{(leadsByStage[stage] || []).length}</span>
                  </div>
                  <div className="space-y-2">
                    {(leadsByStage[stage] || []).map((lead) => (
                      <div key={lead.id} className="rounded-xl border bg-slate-50 p-2 text-xs">
                        <div className="font-semibold">{lead.name}</div>
                        <div className="text-slate-500">{lead.service} · {lead.site}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {stages
                            .filter((s) => s !== stage)
                            .map((target) => (
                              <button
                                key={target}
                                onClick={() => moveLeadStage(lead, target)}
                                className="rounded-full bg-white px-2 py-0.5 text-[10px] text-slate-500 hover:bg-slate-100"
                              >
                                {statusLabel(target)}
                              </button>
                            ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/** ערים נפוצות בישראל — למילוי/חיפוש בשדה העיר (אפשר גם עיר שלא ברשימה) */
const ISRAEL_CITIES_SORTED = [
  'אום אל-פחם',
  'אופקים',
  'אור יהודה',
  'אור עקיבא',
  'אילת',
  'אלעד',
  'אריאל',
  'אשדוד',
  'אשקלון',
  'באר שבע',
  'בית שאן',
  'בית שמש',
  'בני ברק',
  'בת ים',
  'גבעת שמואל',
  'גבעתיים',
  'דימונה',
  'הוד השרון',
  'הרצליה',
  'זכרון יעקב',
  'חדרה',
  'חולון',
  'חיפה',
  'טבריה',
  'יבנה',
  'יהוד-מונוסון',
  'ירוחם',
  'ירושלים',
  'כפר יונה',
  'כפר סבא',
  'כרמיאל',
  'לוד',
  'מגדל העמק',
  'מודיעין עילית',
  'מודיעין-מכבים-רעות',
  'מעלה אדומים',
  'מעלות-תרשיחא',
  'נהריה',
  'נס ציונה',
  'נצרת',
  'נשר',
  'נתיבות',
  'נתניה',
  'עכו',
  'עומר',
  'עפולה',
  'ערד',
  'פתח תקווה',
  'צפת',
  'קרית אונו',
  'קרית אתא',
  'קרית ביאליק',
  'קרית גת',
  'קרית טבעון',
  'קרית מוצקין',
  'קרית מלאכי',
  'קרית שמונה',
  'ראשון לציון',
  'רחובות',
  'רמלה',
  'רמת גן',
  'רמת השרון',
  'שדרות',
  'תל אביב-יפו',
].sort((a, b) => a.localeCompare(b, 'he'));

function CitySearchInput({
  value,
  onChange,
  inputClassName,
}: {
  value: string;
  onChange: (v: string) => void;
  inputClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filtered = useMemo(() => {
    const q = value.trim();
    if (!q) return ISRAEL_CITIES_SORTED.slice(0, 18);
    return ISRAEL_CITIES_SORTED.filter((c) => c.includes(q)).slice(0, 28);
  }, [value]);

  const cancelBlur = () => {
    if (blurTimer.current) {
      clearTimeout(blurTimer.current);
      blurTimer.current = null;
    }
  };

  return (
    <div className="relative">
      <Input
        className={cn('h-11 rounded-2xl border-slate-200', inputClassName)}
        placeholder="הקלד לחיפוש או בחר עיר"
        value={value}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          cancelBlur();
          setOpen(true);
        }}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 180);
        }}
      />
      {open && filtered.length > 0 && (
        <ul
          className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-2xl border border-slate-200 bg-white py-1 shadow-lg"
          role="listbox"
        >
          {filtered.map((c) => (
            <li key={c}>
              <button
                type="button"
                className="w-full px-4 py-2.5 text-right text-sm text-slate-800 hover:bg-emerald-50"
                onMouseDown={(e) => {
                  e.preventDefault();
                  cancelBlur();
                  onChange(c);
                  setOpen(false);
                }}
              >
                {c}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const TYPE_PIE_PALETTE = ['#14532d', '#166534', '#15803d', '#16a34a', '#22c55e', '#84cc16', '#65a30d', '#94a3b8'];

/** חישובי אנליטיקה אמיתיים לדף לקוחות (ללא מספרים קשיחים) */
function computeCustomersPageAnalytics(
  customers: Customer[],
  leads: Lead[],
  quotes: Quote[],
  projects: Project[],
  tasks: Task[],
  opportunities: Opportunity[],
  users: AppUser[],
  resolveTypeLabel: (code: string) => string,
) {
  const closedProjectStatuses = new Set(['CLOSED', 'CANCELLED']);
  const isActiveProject = (p: Project) => !closedProjectStatuses.has((p.status || '').toString().toUpperCase());
  const isOpenTask = (t: Task) => ['OPEN', 'IN_PROGRESS'].includes((t.status || '').toString().toUpperCase());
  const quoteIsAdvanced = (q: Quote) =>
    ['SENT', 'APPROVED', 'SIGNED', 'REJECTED'].includes((q.status || '').toString().toUpperCase());
  const quoteCountsTowardSales = (q: Quote) =>
    ['SENT', 'APPROVED', 'SIGNED'].includes((q.status || '').toString().toUpperCase());
  const quoteMoney = (q: Quote) => Number(q.totalAmount ?? q.amountBeforeVat ?? q.amount ?? 0);
  const lostLeadStatuses = new Set(['WON', 'LOST', 'NOT_RELEVANT']);

  const typeCounts = new Map<string, number>();
  for (const c of customers) {
    const code = ((c as Customer).type || '').trim() || 'UNKNOWN';
    typeCounts.set(code, (typeCounts.get(code) || 0) + 1);
  }
  const typePieEntries = [...typeCounts.entries()].filter(([, v]) => v > 0);
  typePieEntries.sort((a, b) => b[1] - a[1]);
  const typePie = typePieEntries.map(([code, value], i) => ({
    code,
    name: code === 'UNKNOWN' ? 'לא מסווג' : resolveTypeLabel(code),
    value,
    color: TYPE_PIE_PALETTE[i % TYPE_PIE_PALETTE.length],
  }));
  const typePieTotal = typePie.reduce((s, x) => s + x.value, 0) || 1;

  const inTreatment = new Set<string>();
  for (const c of customers) {
    const id = c.id;
    if (projects.some((p) => p.customerId === id && isActiveProject(p))) inTreatment.add(id);
    else if (tasks.some((t) => t.customerId === id && isOpenTask(t))) inTreatment.add(id);
  }

  const waitingQuote = new Set<string>();
  for (const p of projects) {
    if (p.customerId && (p.status || '').toString().toUpperCase() === 'WAITING_QUOTE') waitingQuote.add(p.customerId);
  }
  for (const opp of opportunities) {
    if (!opp.customerId) continue;
    const ps = (opp.pipelineStage || '').toString().toUpperCase();
    if (['WON', 'LOST'].includes(ps)) continue;
    const qs = quotes.filter((q) => q.opportunityId === opp.id);
    if (!qs.some(quoteIsAdvanced)) waitingQuote.add(opp.customerId);
  }
  for (const lead of leads) {
    if (!lead.customerId) continue;
    const st = (lead.leadStatus || lead.status || '').toString().toUpperCase();
    const stg = (lead.stage || '').toString().toUpperCase();
    if (lostLeadStatuses.has(st) || lostLeadStatuses.has(stg)) continue;
    const qs = quotes.filter((q) => q.leadId === lead.id);
    if (!qs.some(quoteIsAdvanced)) waitingQuote.add(lead.customerId);
  }

  const waitingSign = new Set<string>();
  for (const q of quotes) {
    if (!q.customerId) continue;
    const st = (q.status || '').toString().toUpperCase();
    if (st === 'SENT' || st === 'APPROVED') waitingSign.add(q.customerId);
  }

  const STALE_DAYS = 90;
  const now = Date.now();
  const atRisk = new Set<string>();
  for (const c of customers) {
    if ((c.status || '').toString().toUpperCase() === 'INACTIVE') {
      atRisk.add(c.id);
      continue;
    }
    const hasOpenWork =
      projects.some((p) => p.customerId === c.id && isActiveProject(p)) ||
      tasks.some((t) => t.customerId === c.id && isOpenTask(t));
    if (hasOpenWork) continue;
    const times: number[] = [];
    for (const q of quotes) {
      if (q.customerId !== c.id) continue;
      const d = q.updatedAt || q.createdAt;
      if (d) times.push(new Date(d).getTime());
    }
    if (times.length === 0) continue;
    const last = Math.max(...times);
    if (now - last > STALE_DAYS * 86400000) atRisk.add(c.id);
  }

  const NEW_PROJECT_DAYS = 60;
  const newProjectCutoff = now - NEW_PROJECT_DAYS * 86400000;
  const newProjectsCustomers = new Set<string>();
  for (const p of projects) {
    if (!p.customerId || !p.createdAt) continue;
    if (new Date(p.createdAt).getTime() >= newProjectCutoff) newProjectsCustomers.add(p.customerId);
  }

  const statusRows = [
    { label: 'בטיפול שוטף', count: inTreatment.size },
    { label: 'ממתינים להצעת מחיר', count: waitingQuote.size },
    { label: 'ממתינים לחתימה', count: waitingSign.size },
    { label: 'לקוחות בסיכון נטישה', count: atRisk.size },
    { label: 'פרויקטים חדשים (60 יום)', count: newProjectsCustomers.size },
  ];

  const revenueByUser = new Map<string, number>();
  const nameById = new Map<string, string>();
  for (const u of users) {
    nameById.set(u.id, u.name);
    if (u.role === 'sales' || u.role === 'manager') revenueByUser.set(u.id, 0);
  }
  for (const opp of opportunities) {
    if (opp.assignedUserId && opp.assignedUser?.name) nameById.set(opp.assignedUserId, opp.assignedUser.name);
  }

  for (const q of quotes) {
    if (!quoteCountsTowardSales(q)) continue;
    const amt = quoteMoney(q);
    let uid: string | null = null;
    if (q.opportunityId) {
      const o = opportunities.find((x) => x.id === q.opportunityId);
      uid = o?.assignedUserId ?? null;
    } else if (q.leadId) {
      const l = leads.find((x) => x.id === q.leadId);
      uid = l?.assignedUserId ?? null;
    }
    if (!uid) continue;
    revenueByUser.set(uid, (revenueByUser.get(uid) || 0) + amt);
    if (!nameById.has(uid)) nameById.set(uid, 'משתמש מכירות');
  }

  const withRev = [...revenueByUser.entries()]
    .filter(([id, amt]) => {
      if (amt > 0) return true;
      const u = users.find((x) => x.id === id);
      return !!u && (u.role === 'sales' || u.role === 'manager');
    })
    .map(([id, amount]) => ({ userId: id, name: nameById.get(id) || 'משתמש', amount }));
  withRev.sort((a, b) => b.amount - a.amount);
  const maxRev = withRev.length ? Math.max(...withRev.map((x) => x.amount), 1) : 1;
  const salesRows = withRev.map((row) => ({
    userId: row.userId,
    name: row.name,
    amount: row.amount,
    percent: maxRev > 0 ? Math.min(100, Math.round((row.amount / maxRev) * 1000) / 10) : 0,
    initials: (() => {
      const p = row.name.trim().split(/\s+/).filter(Boolean);
      if (p.length >= 2) return `${p[0][0] || ''}${p[1][0] || ''}`.slice(0, 2);
      return row.name.slice(0, 2);
    })(),
  }));

  return { typePie, typePieTotal, statusRows, salesRows };
}

function CustomersPage({
  customers,
  leads,
  quotes,
  projects,
  tasks,
  opportunities,
  users,
  onOpenCustomer,
  onCreateCustomer,
  onUpdateCustomer,
  onDeleteCustomer,
  error: loadError,
  currentUser,
  typeLabelMap,
  classifications,
  onReloadClassifications,
}: {
  customers: Customer[];
  leads: Lead[];
  quotes: Quote[];
  projects: Project[];
  tasks: Task[];
  opportunities: Opportunity[];
  users: AppUser[];
  onOpenCustomer: (customer: Customer) => void;
  onCreateCustomer: (customer: Customer) => void;
  onUpdateCustomer: (customer: Customer) => void;
  onDeleteCustomer: (id: string) => void;
  error?: string;
  currentUser: AppUser;
  typeLabelMap: Record<string, string>;
  classifications: CustomerClassificationDto[];
  onReloadClassifications: () => Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('הכל');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState('');
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    type: 'COMPANY',
    contactName: '',
    phone: '',
    email: '',
    city: '',
    address: '',
    idNumber: '',
    contactRole: '',
    additionalPhone: '',
    companyLogoFileName: '',
    companySize: '',
    industrySector: '',
    acvPlanned: '',
    companyWebsite: '',
    envCo2ReductionTons: '',
    envCertifications: '',
    envExtraNotes: '',
    leadSource: '',
    designatedSalesManager: '',
    services: '',
    status: 'ACTIVE',
    notes: '',
  });

  const customerTypeLabel = (type: string) => resolveCustomerTypeLabel(type, typeLabelMap);

  const normalizeCustomerTypeEnum = (type: string) => {
    const t = (type || '').trim();
    if (t === 'COMPANY' || t === 'חברה / קבלן') return 'COMPANY';
    if (t === 'PUBLIC' || t === 'רשות / מוסד') return 'PUBLIC';
    if (t === 'PRIVATE' || t === 'לקוח פרטי') return 'PRIVATE';
    return t;
  };

  const sortedClassificationOptions = useMemo(() => {
    const raw =
      classifications.length > 0
        ? classifications
        : [
            { id: 'preset-company', code: 'COMPANY', labelHe: 'חברה / קבלן', sortOrder: 0, isPreset: true },
            { id: 'preset-public', code: 'PUBLIC', labelHe: 'רשות / מוסד', sortOrder: 1, isPreset: true },
            { id: 'preset-private', code: 'PRIVATE', labelHe: 'לקוח פרטי', sortOrder: 2, isPreset: true },
          ];
    return [...raw].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.labelHe.localeCompare(b.labelHe, 'he'),
    );
  }, [classifications]);

  const customerStatusLabel = (status: string) => {
    const map: Record<string, string> = {
      ACTIVE: 'פעיל',
      INACTIVE: 'לא פעיל',
    };
    return map[status] || status;
  };

  const customerServiceLabel = (service: string) => {
    const map: Record<string, string> = {
      RADIATION: 'קרינה',
      ACOUSTICS: 'אקוסטיקה / רעש',
      NOISE: 'אקוסטיקה / רעש',
      ASBESTOS: 'אסבסט',
      AIR_QUALITY: 'איכות אוויר',
      RADON: 'ראדון',
      ODOR: 'ריח',
      SOIL: 'קרקע',
      OTHER: 'אחר',
    };
    const raw = (service || '').toString();
    return map[raw.toUpperCase()] || raw || '-';
  };

  const typeFilterToEnum = (label: string) => {
    if (label === 'חברה / קבלן') return 'COMPANY';
    if (label === 'רשות / מוסד') return 'PUBLIC';
    if (label === 'לקוח פרטי') return 'PRIVATE';
    return label;
  };

  const CUSTOMER_PAGE_SIZE = 25;
  const [listPage, setListPage] = useState(1);
  const [pagedRows, setPagedRows] = useState<Customer[]>([]);
  const [pagedTotal, setPagedTotal] = useState(0);
  const [listLoading, setListLoading] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [pagedRefreshSeq, setPagedRefreshSeq] = useState(0);
  const saveInFlightRef = useRef(false);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setListPage(1);
  }, [debouncedSearch, typeFilter]);

  const serverTypeFilter = typeFilter === 'הכל' ? undefined : typeFilterToEnum(typeFilter);

  const loadCustomerPage = useCallback(async () => {
    setListLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(listPage),
        limit: String(CUSTOMER_PAGE_SIZE),
      });
      if (debouncedSearch) params.set('q', debouncedSearch);
      if (serverTypeFilter) params.set('type', serverTypeFilter);
      const res = await apiFetch(apiUrl(`/customers/paged?${params.toString()}`), { authUser: currentUser });
      if (!res.ok) throw new Error('paged');
      const data = (await res.json()) as { items?: Customer[]; total?: number };
      setPagedRows(Array.isArray(data.items) ? data.items : []);
      setPagedTotal(typeof data.total === 'number' ? data.total : 0);
    } catch {
      setPagedRows([]);
      setPagedTotal(0);
    } finally {
      setListLoading(false);
    }
  }, [currentUser, listPage, debouncedSearch, serverTypeFilter]);

  useEffect(() => {
    void loadCustomerPage();
  }, [loadCustomerPage, pagedRefreshSeq]);

  const bumpPaged = () => setPagedRefreshSeq((n) => n + 1);

  const prevCustomerCount = useRef<number | null>(null);
  useEffect(() => {
    if (prevCustomerCount.current !== null && prevCustomerCount.current !== customers.length) {
      setPagedRefreshSeq((n) => n + 1);
    }
    prevCustomerCount.current = customers.length;
  }, [customers.length]);

  const duplicateEmailCustomer = useMemo(() => {
    const e = normalizeEmail(form.email);
    if (!e) return null;
    return customers.find((c) => normalizeEmail(c.email || '') === e && (!editingCustomerId || c.id !== editingCustomerId)) || null;
  }, [customers, form.email, editingCustomerId]);

  const duplicateEmailLead = useMemo(() => {
    const e = normalizeEmail(form.email);
    if (!e) return null;
    return leads.find((l) => normalizeEmail(l.email || '') === e) || null;
  }, [leads, form.email]);

  const emailDuplicateWarning = duplicateEmailCustomer || duplicateEmailLead ? 'קיים כבר ליד/לקוח עם אימייל זה' : '';

  const saveCustomer = async () => {
    if (saveInFlightRef.current) return;
    if (!form.name.trim()) {
      setCreateError('שם לקוח הוא שדה חובה.');
      return;
    }
    if (!form.phone.trim()) {
      setCreateError('טלפון הוא שדה חובה.');
      return;
    }

    const normalizedEmail = form.email ? normalizeEmail(form.email) : '';
    if (form.email.trim() && !validateEmail(normalizedEmail)) {
      setCreateError('אימייל לא תקין');
      return;
    }

    saveInFlightRef.current = true;
    setCreateError('');
    setSaving(true);
    try {
      const isEditing = !!editingCustomerId;
      const typeEnum = normalizeCustomerTypeEnum(form.type);
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        type: typeEnum,
        contactName: form.name.trim(),
        phone: form.phone.trim(),
        email: normalizedEmail || '',
        city: form.city.trim(),
        address: form.address.trim() ? form.address.trim() : null,
        status: form.status || 'ACTIVE',
        services: isEditing
          ? (form.services || '')
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : [],
      };
      if (isEditing) {
        payload.notes = form.notes || '';
      }

      const url = isEditing
        ? `${getApiBaseUrl()}/customers/${editingCustomerId}`
        : apiUrl('/customers');

      const res = await apiFetch(url, {
        method: isEditing ? 'PATCH' : 'POST',
        authUser: currentUser,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const msg = await parseApiErrorResponse(res);
        throw new Error(msg || 'שמירת לקוח נכשלה');
      }
      const created = await res.json();
      if (isEditing) onUpdateCustomer(created);
      else onCreateCustomer(created);
      bumpPaged();
      setOpen(false);
      setEditingCustomerId(null);
      setForm({
        name: '',
        type: 'COMPANY',
        contactName: '',
        phone: '',
        email: '',
        city: '',
        address: '',
        idNumber: '',
        contactRole: '',
        additionalPhone: '',
        companyLogoFileName: '',
        companySize: '',
        industrySector: '',
        acvPlanned: '',
        companyWebsite: '',
        envCo2ReductionTons: '',
        envCertifications: '',
        envExtraNotes: '',
        leadSource: '',
        designatedSalesManager: '',
        services: '',
        status: 'ACTIVE',
        notes: '',
      });
    } catch (e) {
      const m = e instanceof Error ? e.message : '';
      setCreateError(m || 'שמירת לקוח נכשלה. נסה שוב מאוחר יותר.');
    } finally {
      setSaving(false);
      saveInFlightRef.current = false;
    }
  };

  const startEditCustomer = (customer: Customer) => {
    setEditingCustomerId(customer.id);
    setForm({
      name: customer.name,
      type: normalizeCustomerTypeEnum(customer.type),
      contactName: customer.contactName,
      phone: customer.phone,
      email: customer.email,
      city: customer.city,
      address: (customer as any).address || '',
      idNumber: (customer as any).taxId || (customer as any).idNumber || (customer as any).companyNumber || '',
      services: customer.services.join(', '),
      status: (customer.status || 'ACTIVE').toString().toUpperCase(),
      notes: customer.notes || '',
      contactRole: '',
      additionalPhone: '',
      companyLogoFileName: '',
      companySize: '',
      industrySector: '',
      acvPlanned: '',
      companyWebsite: '',
      envCo2ReductionTons: '',
      envCertifications: '',
      envExtraNotes: '',
      leadSource: '',
      designatedSalesManager: '',
    });
    setCreateError('');
    setOpen(true);
  };

  const deleteCustomer = async (customer: Customer) => {
    if (!window.confirm('האם אתה בטוח שברצונך למחוק את הלקוח?')) return;
    try {
      const res = await apiFetch(apiUrl(`/customers/${customer.id}`), {
        method: 'DELETE',
        authUser: currentUser,
      });
      if (!res.ok) throw new Error('מחיקת לקוח נכשלה');
      onDeleteCustomer(customer.id);
      bumpPaged();
    } catch {
      alert('מחיקת לקוח נכשלה. נסה שוב מאוחר יותר.');
    }
  };

  const openCreateCustomerModal = (prefillName?: string) => {
    const computedName = (prefillName ?? '').trim();
    setEditingCustomerId(null);
    setForm({
      name: computedName,
      type: 'COMPANY',
      contactName: '',
      phone: '',
      email: '',
      city: '',
      address: '',
      idNumber: '',
      contactRole: '',
      additionalPhone: '',
      companyLogoFileName: '',
      companySize: '',
      industrySector: '',
      acvPlanned: '',
      companyWebsite: '',
      envCo2ReductionTons: '',
      envCertifications: '',
      envExtraNotes: '',
      leadSource: '',
      designatedSalesManager: '',
      services: '',
      status: 'ACTIVE',
      notes: '',
    });
    setCreateError('');
    setOpen(true);
  };

  const totalListPages = Math.max(1, Math.ceil(pagedTotal / CUSTOMER_PAGE_SIZE) || 1);
  const rangeStart = pagedTotal === 0 ? 0 : (listPage - 1) * CUSTOMER_PAGE_SIZE + 1;
  const rangeEnd = pagedTotal === 0 ? 0 : Math.min(listPage * CUSTOMER_PAGE_SIZE, pagedTotal);

  const customerFormControlClass =
    '!text-lg h-14 rounded-2xl border border-slate-300 bg-white px-4 leading-7 text-slate-900 placeholder:!text-base placeholder:text-slate-400 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100';

  return (
    <div className="bg-[#f7fbf5] p-4 md:p-6 space-y-4" dir="rtl">
      {loadError && (
        <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
          {loadError}
        </div>
      )}

      {/* Search bar + add customer button */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            className="h-10 rounded-lg border-slate-300 bg-white pr-10 text-sm placeholder:text-sm placeholder:text-slate-400"
            placeholder="חיפוש לפי שם לקוח, טלפון או ח.פ"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button
          className="h-10 rounded-lg px-4 text-sm font-semibold text-white whitespace-nowrap"
          style={{ background: galit.primary }}
          onClick={() => openCreateCustomerModal(search.trim())}
        >
          <Plus className="ml-1 h-4 w-4" />
          לקוח חדש
        </Button>
      </div>

      {/* Info row: loading indicator + count */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <div className="inline-flex min-h-[1.25rem] items-center gap-2">
          {listLoading ? (
            <>
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
              <span>טוען...</span>
            </>
          ) : null}
        </div>
        {!listLoading && pagedTotal > 0 ? (
          <span className="tabular-nums text-xs">
            {rangeStart}–{rangeEnd} מתוך {pagedTotal}
          </span>
        ) : null}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block rounded-lg border border-slate-200 bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="text-right">שם לקוח</TableHead>
              <TableHead className="text-right">ח.פ</TableHead>
              <TableHead className="text-right">טלפון</TableHead>
              <TableHead className="text-right">מייל</TableHead>
              <TableHead className="text-right">עיר</TableHead>
              <TableHead className="text-right">סטטוס</TableHead>
              <TableHead className="text-right">פעולות</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {listLoading && pagedRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-slate-500">
                  <span className="inline-flex items-center justify-center gap-2">
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                    טוען...
                  </span>
                </TableCell>
              </TableRow>
            ) : !listLoading && pagedRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-slate-500">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <div>לא נמצאו לקוחות{debouncedSearch ? ' התואמים לחיפוש' : ''}</div>
                    <Button
                      className="rounded-lg px-4 py-1.5 text-sm font-semibold text-white"
                      style={{ background: galit.primary }}
                      onClick={() => openCreateCustomerModal(search.trim())}
                    >
                      הוסף לקוח חדש
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              pagedRows.map((customer) => {
              const statusRaw = (customer.status || 'ACTIVE').toUpperCase();
              const statusUi =
                statusRaw === 'ACTIVE'
                  ? { label: 'פעיל', cls: 'bg-emerald-100 text-emerald-800' }
                  : statusRaw === 'INACTIVE'
                    ? { label: 'לא פעיל', cls: 'bg-red-100 text-red-700' }
                    : { label: 'בטיפול', cls: 'bg-amber-100 text-amber-800' };
              return (
              <TableRow
                key={customer.id}
                className="cursor-pointer hover:bg-slate-50"
                onClick={() => onOpenCustomer(customer)}
              >
                <TableCell className="font-medium">{customer.name}</TableCell>
                <TableCell className="tabular-nums text-slate-600">{customer.companyRegNumber || '-'}</TableCell>
                <TableCell>
                  {customer.phone ? (
                    <a
                      href={phoneToTelHref(customer.phone) || undefined}
                      className="hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {phoneToDisplay(customer.phone)}
                    </a>
                  ) : '-'}
                </TableCell>
                <TableCell className="text-slate-600 break-all">
                  {customer.email ? (
                    <a
                      href={emailToMailtoHref(customer.email) || undefined}
                      className="hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {customer.email}
                    </a>
                  ) : '-'}
                </TableCell>
                <TableCell>{customer.city || '-'}</TableCell>
                <TableCell>
                  <Badge className={statusUi.cls}>{statusUi.label}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      className="px-2 py-1 text-xs"
                      onClick={(e) => { e.stopPropagation(); startEditCustomer(customer); }}
                    >
                      עריכה
                    </Button>
                    {(currentUser.role === 'admin' || currentUser.role === 'manager' || currentUser.canDeleteCustomers) && (
                      <Button
                        variant="outline"
                        className="px-2 py-1 text-xs text-red-700"
                        onClick={(e) => { e.stopPropagation(); deleteCustomer(customer); }}
                      >
                        מחיקה
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )})
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile card view */}
      <div className="space-y-2 md:hidden">
        {listLoading && pagedRows.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            טוען...
          </div>
        ) : !listLoading && pagedRows.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
            <div>לא נמצאו לקוחות{debouncedSearch ? ' התואמים לחיפוש' : ''}</div>
            <div className="mt-2">
              <Button
                className="w-full rounded-lg px-4 py-2 text-sm font-semibold text-white"
                style={{ background: galit.primary }}
                onClick={() => openCreateCustomerModal(search.trim())}
              >
                הוסף לקוח חדש
              </Button>
            </div>
          </div>
        ) : (
          pagedRows.map((customer) => {
          const statusRaw = (customer.status || 'ACTIVE').toUpperCase();
          const mobileStatusUi =
            statusRaw === 'ACTIVE'
              ? { label: 'פעיל', cls: 'bg-emerald-100 text-emerald-800' }
              : statusRaw === 'INACTIVE'
                ? { label: 'לא פעיל', cls: 'bg-red-100 text-red-700' }
                : { label: 'בטיפול', cls: 'bg-amber-100 text-amber-800' };
          return (
          <button
            key={customer.id}
            onClick={() => onOpenCustomer(customer)}
            className="w-full rounded-lg border border-slate-200 bg-white p-3 text-right transition hover:bg-slate-50"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold text-sm">{customer.name}</div>
              <Badge className={mobileStatusUi.cls}>{mobileStatusUi.label}</Badge>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
              <div>
                <span className="text-slate-400">ח.פ: </span>
                {customer.companyRegNumber || '-'}
              </div>
              <div>
                <span className="text-slate-400">טלפון: </span>
                {customer.phone ? (
                  <a
                    href={phoneToTelHref(customer.phone) || undefined}
                    className="hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {phoneToDisplay(customer.phone)}
                  </a>
                ) : '-'}
              </div>
              <div className="col-span-2">
                <span className="text-slate-400">מייל: </span>
                {customer.email ? (
                  <a
                    href={emailToMailtoHref(customer.email) || undefined}
                    className="hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {customer.email}
                  </a>
                ) : '-'}
              </div>
              <div>
                <span className="text-slate-400">עיר: </span>
                {customer.city || '-'}
              </div>
            </div>
          </button>
        )})
        )}
      </div>

      {/* Pagination */}
      <div className="flex flex-wrap items-center justify-center gap-3 border-t border-slate-100 pt-3">
        <Button
          type="button"
          variant="outline"
          className="rounded-lg text-sm"
          disabled={listLoading || listPage <= 1}
          onClick={() => setListPage((p) => Math.max(1, p - 1))}
        >
          עמוד קודם
        </Button>
        <span className="text-sm tabular-nums text-slate-600">
          {listPage} / {totalListPages}
        </span>
        <Button
          type="button"
          variant="outline"
          className="rounded-lg text-sm"
          disabled={listLoading || listPage >= totalListPages || pagedTotal === 0}
          onClick={() => setListPage((p) => p + 1)}
        >
          עמוד הבא
        </Button>
      </div>

      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        title={editingCustomerId ? 'עריכת לקוח' : 'הוספת לקוח חדש'}
        maxWidth="max-w-xl"
        hideHeader={false}
        titleClassName="text-xl font-bold text-slate-900"
      >
        <div className="space-y-5" dir="rtl">
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_4px_24px_rgba(15,23,42,0.07)] md:p-6">
            <div className="mb-4 border-b border-slate-100 pb-3">
              <div className="text-lg font-bold text-slate-900">
                {editingCustomerId ? 'פרטי הלקוח' : 'פרטי לקוח חדש'}
              </div>
              <div className="mt-1 text-base text-slate-500">מלאו את השדות הבאים — כל השדות מוצגים בבירור.</div>
            </div>
            <div className="space-y-4">
              <FormField label="שם הלקוח" labelClassName="text-base font-semibold text-slate-800">
                <Input
                  className={customerFormControlClass}
                  placeholder="שם הלקוח"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </FormField>
              <FormField label="טלפון" labelClassName="text-base font-semibold text-slate-800">
                <PhoneInput
                  className={customerFormControlClass}
                  placeholder="טלפון"
                  value={form.phone}
                  onChange={(v) => setForm({ ...form, phone: v })}
                />
              </FormField>
              <FormField label="אימייל" labelClassName="text-base font-semibold text-slate-800">
                <EmailInput
                  className={customerFormControlClass}
                  placeholder="אימייל"
                  value={form.email}
                  onChange={(v) => setForm({ ...form, email: v })}
                />
              </FormField>
              {emailDuplicateWarning && (
                <div className="text-sm text-amber-800">
                  {emailDuplicateWarning}
                  {duplicateEmailCustomer && (
                    <button
                      type="button"
                      className="mr-2 font-semibold underline"
                      onClick={() => {
                        setOpen(false);
                        onOpenCustomer(duplicateEmailCustomer);
                      }}
                    >
                      פתח
                    </button>
                  )}
                </div>
              )}
              <FormField label="כתובת מלאה (רחוב ומספר)" labelClassName="text-base font-semibold text-slate-800">
                <Input
                  className={customerFormControlClass}
                  placeholder="למשל: אחוזה 154"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </FormField>
              <FormField label="עיר" labelClassName="text-base font-semibold text-slate-800">
                <CitySearchInput
                  value={form.city}
                  onChange={(v) => setForm({ ...form, city: v })}
                  inputClassName={customerFormControlClass}
                />
              </FormField>
              <FormField label="סיווג הלקוח" labelClassName="text-base font-semibold text-slate-800">
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className={cn(customerFormControlClass, 'cursor-pointer')}
                >
                  {sortedClassificationOptions.map((c) => (
                    <option key={c.id} value={c.code}>
                      {c.labelHe}
                    </option>
                  ))}
                  {form.type && !sortedClassificationOptions.some((c) => c.code === form.type) && (
                    <option value={form.type}>{customerTypeLabel(form.type)}</option>
                  )}
                </select>
                <p className="mt-2 text-sm text-slate-500">
                  ניתן לבחור רק מתוך סיווגים קיימים. הוספת סיווג חדש מתבצעת רק ב<strong className="font-semibold">הגדרות</strong>{' '}
                  (מנהל מערכת / מנהל).
                </p>
              </FormField>
            </div>
          </div>
          {createError && (
            <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800">{createError}</div>
          )}
          <Button
            className="h-14 w-full rounded-2xl text-lg font-semibold text-white shadow-md"
            style={{ background: galit.primary }}
            onClick={saveCustomer}
          >
            {saving ? 'שומר...' : editingCustomerId ? 'שמור שינויים' : 'צור לקוח'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function QuotesPage({
  quotes,
  customers,
  opportunities,
  currentUser,
  onQuotesChange,
  initialCustomerId = null,
}: {
  quotes: Quote[];
  customers: Customer[];
  opportunities: Opportunity[];
  currentUser: AppUser;
  onQuotesChange: (next: Quote[]) => void;
  /** When set (from customer card "חדש הצעה"), pre-fills the customer selector */
  initialCustomerId?: string | null;
}) {
  type AIDraftLineItem = {
    name: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  };
  type AIDraft = {
    title: string;
    customerNameHint: string | null;
    suggestedCustomerId: string | null;
    service: string;
    siteOrProject: string | null;
    description: string;
    lineItems: AIDraftLineItem[];
    notes: string;
    terms: string;
    subtotalBeforeVat: number;
    vatPercent: number;
    vatAmount: number;
    totalWithVat: number;
  };

  const [saving, setSaving] = useState(false);
  const [currentQuoteId, setCurrentQuoteId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [catalogItems, setCatalogItems] = useState<any[]>([]);
  const [catalogSelectedId, setCatalogSelectedId] = useState('');
  const [catalogQty, setCatalogQty] = useState('1');
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiDraft, setAiDraft] = useState<AIDraft | null>(null);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('הצעת מחיר - גלית החברה לאיכות הסביבה');
  const [emailBody, setEmailBody] = useState(
    'שלום,\nמצורפת הצעת המחיר שביקשת.\nנשמח לעמוד לרשותך לכל שאלה.\n\nבברכה,\nגלית - החברה לאיכות הסביבה',
  );
  const [pdfReady, setPdfReady] = useState(false);
  const [quoteTemplatesList, setQuoteTemplatesList] = useState<any[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [contentHtml, setContentHtml] = useState('');
  const [templateLineItems, setTemplateLineItems] = useState<QuoteTemplateLineItem[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const lastAutoTemplateKeyRef = useRef('');

  const [form, setForm] = useState({
    quoteNumber: '',
    customerId: initialCustomerId ?? '',
    opportunityId: '',
    projectId: '',
    service: 'אקוסטיקה / רעש',
    description: '',
    amountBeforeVat: '0',
    vatPercent: '17',
    discountType: 'NONE',
    discountValue: '0',
    validityDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    paymentTerms: 'שוטף 30',
    status: 'DRAFT',
    notes: '',
  });

  useEffect(() => {
    apiFetch(apiUrl('/quote-item-catalog'), { authUser: currentUser })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setCatalogItems(Array.isArray(data) ? data.filter((x) => x.isActive !== false) : []))
      .catch(() => setCatalogItems([]));
  }, [currentUser.id, currentUser.role]);

  useEffect(() => {
    if (!form.service?.trim()) {
      setQuoteTemplatesList([]);
      return;
    }
    let cancelled = false;
    setTemplatesLoading(true);
    apiFetch(
      apiUrl(`/quote-templates?serviceType=${encodeURIComponent(form.service)}&activeOnly=true`),
      { authUser: currentUser },
    )
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (!cancelled) setQuoteTemplatesList(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setQuoteTemplatesList([]);
      })
      .finally(() => {
        if (!cancelled) setTemplatesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [form.service, currentUser]);

  useEffect(() => {
    if (quoteTemplatesList.length === 1) {
      setSelectedTemplateId(quoteTemplatesList[0].id);
    } else if (quoteTemplatesList.length === 0) {
      setSelectedTemplateId('');
    }
  }, [quoteTemplatesList]);

  const applyCatalogItem = (item: any, qty: number) => {
    const q = Number.isFinite(qty) && qty > 0 ? qty : 1;
    const base = Number(item?.basePrice) || 0;
    setForm((p) => ({
      ...p,
      service: item?.serviceCategory || item?.name || p.service,
      description: item?.description || item?.name || p.description,
      amountBeforeVat: String(Math.round(base * q * 100) / 100),
      vatPercent: String(item?.vatPercent ?? p.vatPercent),
    }));
  };

  const computeTotal = useMemo(() => {
    const base = parseCurrencyInput(form.amountBeforeVat) ?? 0;
    const vat = Number(form.vatPercent) || 0;
    const withVat = base * (1 + vat / 100);
    const discVal = parseCurrencyInput(form.discountValue) ?? 0;
    if (form.discountType === 'CURRENCY') return Math.max(0, withVat - discVal);
    if (form.discountType === 'PERCENT') return Math.max(0, withVat * (1 - discVal / 100));
    return Math.max(0, withVat);
  }, [form.amountBeforeVat, form.discountType, form.discountValue, form.vatPercent]);

  const serviceOptionsForQuote = useMemo(() => {
    const s = new Set<string>([...QUOTE_SERVICE_TYPE_OPTIONS]);
    if (form.service?.trim()) s.add(form.service.trim());
    return Array.from(s);
  }, [form.service]);

  const applyTemplateNow = (tpl: any) => {
    if (!tpl || !form.customerId) {
      setError('יש לבחור לקוח לפני טעינת תבנית.');
      return;
    }
    const customer = customers.find((c) => c.id === form.customerId);
    if (!customer) return;
    setError('');
    const raw = tpl.defaultLineItems as any;
    const arr = Array.isArray(raw) ? raw : [];
    const lineItems: QuoteTemplateLineItem[] = arr.map((x: any) => ({
      name: String(x.name ?? ''),
      quantity: Number(x.quantity) > 0 ? Number(x.quantity) : 1,
      unitPrice: Number(x.unitPrice) || 0,
    }));
    setTemplateLineItems(lineItems);
    const subtotal = Math.round(lineItems.reduce((a, li) => a + li.quantity * li.unitPrice, 0) * 100) / 100;
    const disc = parseCurrencyInput(form.discountValue) ?? 0;
    const ctx = buildQuoteTemplateContext(
      {
        customer: {
          name: customer.name,
          contactName: customer.contactName,
          address: customer.address,
          city: customer.city,
          email: customer.email,
          phone: customer.phone,
        },
        serviceName: form.service,
        quoteNumber: form.quoteNumber || '—',
        quoteDate: form.validityDate ? new Date(form.validityDate) : new Date(),
        notes: form.notes,
        lineItems,
        vatPercent: Number(form.vatPercent) || 0,
        discountType: form.discountType,
        discountValue: disc,
      },
      formatCurrencyILS,
    );
    const html = mergeQuoteTemplateFull(tpl, ctx);
    setContentHtml(html);
    setForm((p) => ({
      ...p,
      amountBeforeVat: String(subtotal),
      description: mergedHtmlToPlainDescription(html),
    }));
  };

  useEffect(() => {
    if (quoteTemplatesList.length !== 1 || !form.customerId) return;
    const tpl = quoteTemplatesList[0];
    const key = `${tpl.id}-${form.customerId}-${form.service}`;
    if (lastAutoTemplateKeyRef.current === key) return;
    lastAutoTemplateKeyRef.current = key;
    applyTemplateNow(tpl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteTemplatesList, form.customerId, form.service]);

  const loadQuoteForEdit = async (id: string) => {
    setError('');
    setSuccess('');
    try {
      const res = await apiFetch(apiUrl(`/quotes/${encodeURIComponent(id)}`), { authUser: currentUser });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setCurrentQuoteId(data.id);
      setPdfReady(!!data.pdfPath);
      const vd = data.validityDate
        ? new Date(data.validityDate).toISOString().slice(0, 10)
        : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      setForm({
        quoteNumber: data.quoteNumber || '',
        customerId: data.customerId || '',
        opportunityId: data.opportunityId || '',
        projectId: data.projectId || '',
        service: data.service || 'אקוסטיקה / רעש',
        description: data.description || '',
        amountBeforeVat: String(data.amountBeforeVat ?? data.amount ?? 0),
        vatPercent: String(data.vatPercent ?? 17),
        discountType: data.discountType || 'NONE',
        discountValue: String(data.discountValue ?? 0),
        validityDate: vd,
        paymentTerms: data.paymentTerms || 'שוטף 30',
        status: data.status || 'DRAFT',
        notes: data.notes || '',
      });
      setContentHtml(String(data.contentHtml || ''));
      setSelectedTemplateId(data.quoteTemplateId || '');
      const li = data.lineItemsJson;
      setTemplateLineItems(Array.isArray(li) ? li : []);
      lastAutoTemplateKeyRef.current = `loaded-${id}`;
      setSuccess('ההצעה נטענה לעריכה');
    } catch {
      setError('טעינת הצעה נכשלה');
    }
  };

  const normalizeQuoteFromApi = (data: any, currentForm: typeof form): Quote => ({
    id: data.id,
    quoteNumber: data.quoteNumber ?? null,
    customerId: data.customerId ?? null,
    customerName: data.customer?.name ?? customers.find((c) => c.id === data.customerId)?.name ?? undefined,
    opportunityId: data.opportunityId ?? null,
    opportunityName:
      data.opportunity?.projectOrServiceName ?? opportunities.find((o) => o.id === data.opportunityId)?.projectOrServiceName ?? undefined,
    projectId: data.projectId ?? null,
    client: data.customer?.name ?? customers.find((c) => c.id === data.customerId)?.name ?? '',
    service: data.service ?? currentForm.service,
    description: data.description ?? currentForm.description,
    amount: Number(data.amountBeforeVat ?? data.amount ?? 0),
    amountBeforeVat: data.amountBeforeVat ?? null,
    vatPercent: data.vatPercent ?? null,
    discountType: data.discountType ?? null,
    discountValue: data.discountValue ?? null,
    totalAmount: data.totalAmount ?? null,
    status: data.status ?? currentForm.status,
    validTo: data.validityDate ? new Date(data.validityDate).toISOString().slice(0, 10) : currentForm.validityDate,
    validityDate: data.validityDate ? new Date(data.validityDate).toISOString().slice(0, 10) : null,
    notes: data.notes ?? null,
    pdfPath: data.pdfPath ?? undefined,
    contentHtml: data.contentHtml ?? null,
    lineItemsJson: data.lineItemsJson ?? null,
    quoteTemplateId: data.quoteTemplateId ?? null,
  });

  const saveQuote = async (sourceForm?: typeof form) => {
    const currentForm = sourceForm ?? form;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      if (!currentForm.customerId?.trim()) {
        setError('יש לבחור לקוח לפני שמירת הצעת מחיר.');
        return;
      }
      const amountBeforeVat = parseCurrencyInput(currentForm.amountBeforeVat);
      const discountValue = parseCurrencyInput(currentForm.discountValue);
      if (amountBeforeVat === null || (currentForm.discountValue.trim() !== '' && discountValue === null)) {
        throw new Error('סכום לא תקין');
      }

      const validToIso =
        currentForm.validityDate && currentForm.validityDate.trim()
          ? new Date(currentForm.validityDate).toISOString()
          : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

      const payload: any = {
        quoteNumber: currentForm.quoteNumber || null,
        customerId: currentForm.customerId,
        opportunityId: currentForm.opportunityId || null,
        projectId: currentForm.projectId || null,
        service: currentForm.service,
        description: currentForm.description || null,
        amountBeforeVat: amountBeforeVat ?? 0,
        amount: amountBeforeVat ?? 0,
        vatPercent: Number(currentForm.vatPercent) || 0,
        discountType: currentForm.discountType,
        discountValue: discountValue ?? 0,
        validityDate: validToIso,
        validTo: validToIso,
        paymentTerms: currentForm.paymentTerms || null,
        status: currentForm.status,
        notes: currentForm.notes || null,
        contentHtml: contentHtml || null,
        lineItemsJson: templateLineItems.length ? templateLineItems : null,
        quoteTemplateId: selectedTemplateId || null,
      };

      const updating = !!currentQuoteId;
      const url = updating ? `${getApiBaseUrl()}/quotes/${currentQuoteId}` : apiUrl('/quotes');
      const res = await apiFetch(url, {
        method: updating ? 'PATCH' : 'POST',
        authUser: currentUser,
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setCurrentQuoteId(data.id);
      if (data.contentHtml != null) setContentHtml(String(data.contentHtml));
      const normalized = normalizeQuoteFromApi(data, currentForm);
      if (updating) {
        onQuotesChange(quotes.map((q) => (q.id === data.id ? { ...q, ...normalized } : q)));
      } else {
        onQuotesChange([normalized, ...quotes]);
      }
      setPdfReady(!!data.pdfPath);
      setSuccess(updating ? 'הצעת המחיר עודכנה במערכת' : 'הצעת המחיר נשמרה במערכת');
    } catch {
      setError('שמירת הצעת מחיר נכשלה. נסה שוב.');
    } finally {
      setSaving(false);
    }
  };

  const matchCustomerFromPrompt = (text: string): { id: string | null; nameHint: string | null } => {
    const t = text.trim();
    if (!t) return { id: null, nameHint: null };
    let best: { id: string; score: number } | null = null;
    for (const c of customers) {
      const name = (c.name || '').trim();
      if (!name) continue;
      if (t.includes(name)) return { id: c.id, nameHint: name };
      const parts = name.split(/\s+/).filter((p) => p.length > 2);
      for (const p of parts) {
        if (t.includes(p)) {
          const score = p.length;
          if (!best || score > best.score) best = { id: c.id, score };
        }
      }
    }
    return best ? { id: best.id, nameHint: customers.find((c) => c.id === best!.id)?.name ?? null } : { id: null, nameHint: null };
  };

  const extractSiteHint = (text: string): string | null => {
    const cities = [
      'רעננה',
      'הרצליה',
      'כפר סבא',
      'הוד השרון',
      'תל אביב',
      'רמת גן',
      'חיפה',
      'ירושלים',
      'באר שבע',
      'אשדוד',
      'נתניה',
      'חולון',
      'בת ים',
      'ראשון לציון',
      'פתח תקווה',
      'מודיעין',
    ];
    for (const c of cities) {
      if (text.includes(c)) return `אתר: ${c}`;
    }
    const m = text.match(/(\d+)\s*חדרים?/);
    if (m) return `${m[1]} חדרים`;
    return null;
  };

  const generateAIDraft = async () => {
    const text = aiPrompt.trim();
    if (!text) {
      setError('יש להזין תיאור חופשי לפני יצירת טיוטה');
      return;
    }
    setAiGenerating(true);
    setError('');
    setSuccess('');

    try {
      const lower = text.toLowerCase();
      const keywordToService: Array<{ keywords: string[]; service: string; terms: string[] }> = [
        { keywords: ['קרינה', 'קו מתח', 'חדר חשמל'], service: 'קרינה', terms: ['מדידת שדה אלקטרומגנטי', 'דוח ממצאים מקצועי'] },
        { keywords: ['מיגון', 'שנאים', 'מיגון קרינה'], service: 'מיגון קרינה', terms: ['תכנון פתרון מיגון', 'בדיקת אימות לאחר התקנה'] },
        { keywords: ['אקוסט', 'רעש', 'מיזוג'], service: 'אקוסטיקה / רעש', terms: ['מדידות רעש תקניות', 'דוח אקוסטי מסכם'] },
        { keywords: ['ראדון'], service: 'ראדון', terms: ['התקנת גלאים', 'איסוף ופענוח תוצאות'] },
        { keywords: ['אסבסט'], service: 'אסבסט', terms: ['סקר אסבסט מקדים', 'המלצות להמשך טיפול'] },
        { keywords: ['איכות אוויר', 'co2', 'voc'], service: 'איכות אוויר', terms: ['דיגום איכות אוויר', 'ניתוח תוצאות והמלצות'] },
        { keywords: ['עובש', 'טחב'], service: 'דיגום סביבתי', terms: ['דיגום עובש', 'חוות דעת מקצועית'] },
        { keywords: ['דיגום', 'סביבתי'], service: 'דיגום סביבתי', terms: ['תוכנית דיגום', 'דוח תוצאות'] },
        { keywords: ['היתר', 'בנייה', 'ועדה'], service: 'דוח אקוסטי להיתר', terms: ['הכנת דוח להיתר', 'התאמה לדרישות ועדה'] },
      ];

      const matched =
        keywordToService.find((x) => x.keywords.some((k) => lower.includes(k))) ??
        { service: 'בדיקות סביבתיות', terms: ['בדיקה בשטח', 'הפקת דוח מסכם'] };

      const roomMatch = text.match(/(\d+)\s*חדרים?/);
      const roomFactor = roomMatch ? Math.min(4, 1 + Number(roomMatch[1]) / 8) : 1;

      const matchedCatalog = catalogItems
        .filter((it) => {
          const hay = `${it?.name || ''} ${it?.description || ''} ${it?.serviceCategory || ''} ${it?.serviceSubType || ''}`.toLowerCase();
          return (
            hay.includes(matched.service.toLowerCase()) ||
            keywordToService.some((group) => group.keywords.some((k) => lower.includes(k) && hay.includes(k)))
          );
        })
        .slice(0, 4);

      const lineItems: AIDraftLineItem[] =
        matchedCatalog.length > 0
          ? matchedCatalog.map((it) => {
              const unitPrice = Math.round((Number(it?.basePrice) || 0) * roomFactor * 100) / 100;
              const quantity = roomMatch ? Math.max(1, Math.min(12, Number(roomMatch[1]))) : 1;
              const lineTotal = Math.round(unitPrice * quantity * 100) / 100;
              return {
                name: String(it?.name || it?.itemCode || matched.service),
                quantity,
                unitPrice,
                lineTotal,
              };
            })
          : [
              {
                name: `${matched.service} - ביקור שטח ומדידות`,
                quantity: 1,
                unitPrice: Math.round(1800 * roomFactor),
                lineTotal: Math.round(1800 * roomFactor * 100) / 100,
              },
              {
                name: `${matched.service} - דוח מסכם מקצועי`,
                quantity: 1,
                unitPrice: 950,
                lineTotal: 950,
              },
            ];

      const subtotalBeforeVat = Math.round(lineItems.reduce((acc, li) => acc + li.lineTotal, 0) * 100) / 100;
      const vatPercent = 17;
      const vatAmount = Math.round(subtotalBeforeVat * (vatPercent / 100) * 100) / 100;
      const totalWithVat = Math.round((subtotalBeforeVat + vatAmount) * 100) / 100;
      const site = extractSiteHint(text);
      const { id: suggestedCustomerId, nameHint: customerNameHint } = matchCustomerFromPrompt(text);

      const draft: AIDraft = {
        title: `הצעת מחיר - ${matched.service}`,
        customerNameHint,
        suggestedCustomerId,
        service: matched.service,
        siteOrProject: site,
        description: `הצעה מקצועית לעבודת ${matched.service}.${site ? ` ${site}.` : ''} כולל ביצוע בשטח, ניתוח ממצאים והפקת מסמך מסכם בהתאם לסטנדרט גלית.`,
        lineItems,
        notes: `מקור פנייה (חופשי): ${text}`,
        terms: `תנאים: ${matched.terms.join(' · ')} · תשלום לפי תנאי ההצעה · לוחות זמנים בתיאום עם הלקוח.`,
        subtotalBeforeVat,
        vatPercent,
        vatAmount,
        totalWithVat,
      };
      setAiDraft(draft);
      setSuccess('טיוטת הצעה מוכנה — ניתן להחיל על הטופס ולשמור');
    } finally {
      setAiGenerating(false);
    }
  };

  const applyAIDraftToForm = (andSave = false) => {
    if (!aiDraft) return;
    const linesBlock = aiDraft.lineItems
      .map(
        (li, idx) =>
          `${idx + 1}. ${li.name} | כמות: ${li.quantity} | מחיר יחידה: ${formatCurrencyILS(li.unitPrice)} | סה״כ שורה: ${formatCurrencyILS(li.lineTotal)}`,
      )
      .join('\n');
    const next = {
      ...form,
      customerId: aiDraft.suggestedCustomerId || form.customerId,
      service: aiDraft.service,
      description: `${aiDraft.description}\n\nאתר / היקף: ${aiDraft.siteOrProject || 'לא צוין'}\n\nפירוט שורות:\n${linesBlock}`,
      amountBeforeVat: String(aiDraft.subtotalBeforeVat),
      vatPercent: String(aiDraft.vatPercent),
      notes: `${aiDraft.notes}\n\nמע״מ (${aiDraft.vatPercent}%): ${formatCurrencyILS(aiDraft.vatAmount)}\nסה״כ כולל מע״מ (משוער): ${formatCurrencyILS(aiDraft.totalWithVat)}\n\n${aiDraft.terms}`,
      status: 'DRAFT',
    };
    setForm(next);
    setSuccess('טיוטת ההצעה הוחלה על הטופס — בדוק לקוח ולחץ «שמור הצעה»');
    if (andSave) {
      void saveQuote(next);
      setAiOpen(false);
    }
  };

  const createPdf = async () => {
    if (!currentQuoteId) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const res = await apiFetch(apiUrl(`/quotes/${currentQuoteId}/pdf`), {
        method: 'POST',
        authUser: currentUser,
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setPdfReady(true);
      onQuotesChange(quotes.map((q) => (q.id === data.id ? { ...q, pdfPath: data.pdfPath } : q)));
      setSuccess('קובץ PDF נוצר ונשמר להצעה');
    } catch {
      setError('יצירת PDF נכשלה. ודא שההצעה נשמרה ונסה שוב.');
    } finally {
      setSaving(false);
    }
  };

  const downloadPdf = async () => {
    if (!currentQuoteId) return;
    setSaving(true);
    setError('');
    try {
      const res = await apiFetch(apiUrl(`/quotes/${currentQuoteId}/pdf`), {
        authUser: currentUser,
      });
      if (!res.ok) throw new Error('אין PDF — יש ללחוץ קודם על «צור PDF»');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `galit-quote-${currentQuoteId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setSuccess('הורדת PDF הושלמה');
    } catch {
      setError('הורדת PDF נכשלה — ודא שנוצר PDF להצעה.');
    } finally {
      setSaving(false);
    }
  };

  const selectedCustomer = customers.find((c) => c.id === form.customerId);
  const pdfUrlForShare =
    currentQuoteId != null ? `${getApiBaseUrl()}/quotes/${currentQuoteId}/pdf` : '';

  const openEmailModal = () => {
    setEmailTo(selectedCustomer?.email || '');
    setEmailModalOpen(true);
  };

  const sendEmailMailto = () => {
    const body = `${emailBody}${pdfReady && currentQuoteId ? `\n\nקישור להורדת PDF (התחברות למערכת נדרשת):\n${pdfUrlForShare}` : ''}`;
    const q = `mailto:${encodeURIComponent(emailTo)}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(body)}`;
    window.location.href = q;
    setEmailModalOpen(false);
  };

  const openWhatsAppQuote = () => {
    const phone = (selectedCustomer?.phone || '').replace(/\D/g, '');
    if (!phone) {
      alert('אין מספר טלפון ללקוח הנבחר — עדכן את פרטי הלקוח או הזן ידנית בוואטסאפ.');
      return;
    }
    const waPhone = phone.startsWith('972') ? phone : phone.startsWith('0') ? `972${phone.slice(1)}` : phone;
    const msg = `שלום, מצורפת/מצ״ב הצעת המחיר שהוכנה עבורך על ידי גלית - החברה לאיכות הסביבה.\nנשמח לעמוד לרשותך לכל שאלה.${pdfReady && currentQuoteId ? `\n\nקישור PDF (נדרשת גישה למערכת):\n${pdfUrlForShare}` : ''}`;
    window.open(`https://wa.me/${waPhone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl font-bold" style={{ color: galit.text }}>הצעות מחיר</h1>
        <Button style={{ background: galit.primary }} onClick={() => setAiOpen(true)}>
          צור הצעת מחיר עם AI
        </Button>
      </div>
      <p className="mt-1 text-slate-500">ניהול טיוטות, חתימות ותוקף הצעות</p>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>רשימת הצעות</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>מספר</TableHead>
                  <TableHead>לקוח</TableHead>
                  <TableHead>הזדמנות</TableHead>
                  <TableHead>שירות</TableHead>
                  <TableHead>סכום כולל</TableHead>
                  <TableHead>סטטוס</TableHead>
                  <TableHead>בתוקף עד</TableHead>
                  <TableHead>פעולות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotes.map((q) => (
                  <TableRow key={q.id}>
                    <TableCell>{q.quoteNumber || '-'}</TableCell>
                    <TableCell>{q.customerName || q.client || '-'}</TableCell>
                    <TableCell>{q.opportunityName || '-'}</TableCell>
                    <TableCell>{q.service}</TableCell>
                    <TableCell>{(currentUser.role === 'admin' || currentUser.role === 'manager' || currentUser.canViewFinance) ? formatCurrencyILS(Number(q.totalAmount ?? q.amount ?? 0)) : '-'}</TableCell>
                    <TableCell>
                      <Badge className={statusBadge(q.status)}>{statusLabel(q.status)}</Badge>
                    </TableCell>
                    <TableCell>{q.validityDate || q.validTo || '-'}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="rounded-xl border px-3 py-1 text-xs hover:bg-slate-50"
                          onClick={() => void loadQuoteForEdit(q.id)}
                        >
                          טען לעריכה
                        </button>
                        <button
                          className="rounded-xl border px-3 py-1 text-xs hover:bg-slate-50"
                          onClick={async () => {
                            try {
                              const res = await apiFetch(apiUrl(`/quotes/${q.id}`), {
                                method: 'PATCH',
                                authUser: currentUser,
                                body: JSON.stringify({ status: 'SENT' }),
                              });
                              if (!res.ok) throw new Error();
                              const updated = await res.json();
                              onQuotesChange(quotes.map((x) => (x.id === q.id ? { ...x, ...updated } : x)));
                            } catch {
                              setError('עדכון סטטוס נכשל');
                            }
                          }}
                        >
                          שלח
                        </button>
                        <button
                          className="rounded-xl border px-3 py-1 text-xs hover:bg-slate-50"
                          onClick={async () => {
                            try {
                              const res = await apiFetch(apiUrl(`/quotes/${q.id}`), {
                                method: 'PATCH',
                                authUser: currentUser,
                                body: JSON.stringify({ status: 'APPROVED' }),
                              });
                              if (!res.ok) throw new Error();
                              const updated = await res.json();
                              onQuotesChange(quotes.map((x) => (x.id === q.id ? { ...x, ...updated } : x)));
                            } catch {
                              setError('עדכון סטטוס נכשל');
                            }
                          }}
                        >
                          אשר
                        </button>
                        <button
                          className="rounded-xl border px-3 py-1 text-xs hover:bg-slate-50"
                          onClick={async () => {
                            try {
                              const res = await apiFetch(apiUrl(`/quotes/${q.id}`), {
                                method: 'PATCH',
                                authUser: currentUser,
                                body: JSON.stringify({ status: 'REJECTED' }),
                              });
                              if (!res.ok) throw new Error();
                              const updated = await res.json();
                              onQuotesChange(quotes.map((x) => (x.id === q.id ? { ...x, ...updated } : x)));
                            } catch {
                              setError('עדכון סטטוס נכשל');
                            }
                          }}
                        >
                          דחה
                        </button>
                        <button
                          className="rounded-xl border px-3 py-1 text-xs hover:bg-slate-50"
                          onClick={async () => {
                            try {
                              const res = await apiFetch(apiUrl(`/quotes/${q.id}`), {
                                method: 'PATCH',
                                authUser: currentUser,
                                body: JSON.stringify({ status: 'EXPIRED' }),
                              });
                              if (!res.ok) throw new Error();
                              const updated = await res.json();
                              onQuotesChange(quotes.map((x) => (x.id === q.id ? { ...x, ...updated } : x)));
                            } catch {
                              setError('עדכון סטטוס נכשל');
                            }
                          }}
                        >
                          פגה
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>יצירת הצעת מחיר</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(error || success) && (
              <div className={`rounded-2xl px-4 py-2 text-sm ${error ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'}`}>
                {error || success}
              </div>
            )}

            <FormField label="לקוח">
              <select
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
                value={form.customerId}
                onChange={(e) => setForm((p) => ({ ...p, customerId: e.target.value }))}
              >
                <option value="">לקוח</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </FormField>

            <FormField label="פריט מחירון (אופציונלי)">
              <select
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
                value={catalogSelectedId}
                onChange={(e) => {
                  const id = e.target.value;
                  setCatalogSelectedId(id);
                  const item = catalogItems.find((x) => x.id === id);
                  if (item) {
                    const qty = Number(catalogQty) || 1;
                    applyCatalogItem(item, qty);
                  }
                }}
              >
                <option value="">בחר פריט מהמחירון (אופציונלי)</option>
                {catalogItems.map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.itemCode} · {it.name}
                  </option>
                ))}
              </select>
            </FormField>

            {catalogSelectedId && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField label="כמות">
                  <Input
                    placeholder="כמות"
                    value={catalogQty}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCatalogQty(v);
                      const item = catalogItems.find((x) => x.id === catalogSelectedId);
                      if (item && item.requiresQuantity !== false) {
                        applyCatalogItem(item, Number(v) || 1);
                      }
                    }}
                  />
                </FormField>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  יחידת חיוב: <span className="font-semibold">{catalogItems.find((x) => x.id === catalogSelectedId)?.billingUnit || '—'}</span>
                </div>
              </div>
            )}

            <FormField label="הזדמנות (אופציונלי)">
              <select
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
                value={form.opportunityId}
                onChange={(e) => setForm((p) => ({ ...p, opportunityId: e.target.value }))}
              >
                <option value="">הזדמנות (אופציונלי)</option>
                {opportunities.map((o) => (
                  <option key={o.id} value={o.id}>{o.projectOrServiceName}</option>
                ))}
              </select>
            </FormField>

            <FormField label="פרויקט (אופציונלי)">
              <Input placeholder="פרויקט (אופציונלי)" value={form.projectId} onChange={(e) => setForm((p) => ({ ...p, projectId: e.target.value }))} />
            </FormField>
            <FormField label="שירות">
              <select
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
                dir="rtl"
                value={form.service}
                onChange={(e) => {
                  lastAutoTemplateKeyRef.current = '';
                  setForm((p) => ({ ...p, service: e.target.value }));
                }}
              >
                {serviceOptionsForQuote.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">תבניות מקושרות לפי ערך שירות זה (זהה לשדה «סוג שירות» בהגדרות תבנית).</p>
            </FormField>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4" dir="rtl">
              <div className="text-sm font-semibold text-slate-800">תבנית הצעת מחיר</div>
              <p className="mt-1 text-xs text-slate-600">
                {templatesLoading ? 'טוען תבניות...' : quoteTemplatesList.length === 0 ? 'אין תבנית פעילה לשירות זה — הוסף בהגדרות › תבניות הצעות מחיר.' : null}
              </p>
              {quoteTemplatesList.length > 1 && (
                <FormField label="בחר תבנית (מספר תבניות לשירות)">
                  <select
                    className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    value={selectedTemplateId}
                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                  >
                    <option value="">— בחר תבנית —</option>
                    {quoteTemplatesList.map((t: any) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </FormField>
              )}
              {quoteTemplatesList.length >= 1 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!form.customerId || (!selectedTemplateId && quoteTemplatesList.length > 1)}
                    onClick={() => {
                      const tpl =
                        quoteTemplatesList.length === 1
                          ? quoteTemplatesList[0]
                          : quoteTemplatesList.find((t: any) => t.id === selectedTemplateId);
                      if (tpl) applyTemplateNow(tpl);
                    }}
                  >
                    טען / רענן תבנית
                  </Button>
                  <Button type="button" variant="outline" disabled={!contentHtml.trim()} onClick={() => setPreviewOpen(true)}>
                    תצוגה מקדימה
                  </Button>
                </div>
              )}
            </div>

            <FormField label="תיאור (טקסט קצר / גיבוי)">
              <Textarea placeholder="תיאור" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
            </FormField>

            <FormField label="תוכן HTML מלא (ניתן לערוך לאחר טעינת תבנית)">
              <Textarea
                dir="rtl"
                className="min-h-[180px] font-mono text-xs"
                placeholder="יטען אוטומטית מתבנית..."
                value={contentHtml}
                onChange={(e) => setContentHtml(e.target.value)}
              />
            </FormField>

            {templateLineItems.length > 0 && (
              <div className="rounded-2xl border border-slate-100 p-3 text-sm" dir="rtl">
                <div className="mb-2 font-semibold">פריטים (מברירת מחדל של התבנית)</div>
                <ul className="space-y-1 text-slate-700">
                  {templateLineItems.map((li, idx) => (
                    <li key={`${li.name}-${idx}`}>
                      {li.name} · כמות {li.quantity} · {formatCurrencyILS(li.unitPrice)} ליחידה
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="סכום לפני מע״מ">
                <CurrencyInput
                  placeholder="סכום לפני מע״מ"
                  value={form.amountBeforeVat}
                  onChange={(v) => setForm((p) => ({ ...p, amountBeforeVat: v }))}
                />
              </FormField>
              <FormField label="מע״מ (%)">
                <Input placeholder="מע״מ (%)" value={form.vatPercent} onChange={(e) => setForm((p) => ({ ...p, vatPercent: e.target.value }))} />
              </FormField>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <div className="mb-1 text-xs text-slate-500">סוג הנחה</div>
                <select
                  className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  value={form.discountType}
                  onChange={(e) => setForm((p) => ({ ...p, discountType: e.target.value }))}
                >
                  <option value="NONE">ללא הנחה</option>
                  <option value="CURRENCY">הנחה לפי סכום</option>
                  <option value="PERCENT">הנחה באחוזים</option>
                </select>
              </div>
              <FormField label="ערך הנחה">
                <CurrencyInput
                  placeholder="הנחה"
                  value={form.discountValue}
                  onChange={(v) => setForm((p) => ({ ...p, discountValue: v }))}
                />
              </FormField>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="תוקף">
                <Input type="date" placeholder="תוקף" value={form.validityDate} onChange={(e) => setForm((p) => ({ ...p, validityDate: e.target.value }))} />
              </FormField>
              <FormField label="תנאי תשלום">
                <Input placeholder="תנאי תשלום" value={form.paymentTerms} onChange={(e) => setForm((p) => ({ ...p, paymentTerms: e.target.value }))} />
              </FormField>
            </div>

            <div>
              <div className="mb-1 text-xs text-slate-500">סטטוס</div>
              <select
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
                value={form.status}
                onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
              >
                <option value="DRAFT">{statusLabel('DRAFT')}</option>
                <option value="SENT">{statusLabel('SENT')}</option>
                <option value="APPROVED">{statusLabel('APPROVED')}</option>
                <option value="REJECTED">{statusLabel('REJECTED')}</option>
                <option value="EXPIRED">{statusLabel('EXPIRED')}</option>
              </select>
            </div>
            <FormField label="הערות">
              <Textarea placeholder="הערות" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
            </FormField>

            <div className="text-sm text-slate-600">סה״כ כולל מע״מ: <span className="font-semibold">{formatCurrencyILS(computeTotal)}</span></div>
            {currentQuoteId && (
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 px-3 py-2 text-xs text-emerald-900">
                מזהה הצעה נוכחית: <span className="font-mono font-semibold">{currentQuoteId}</span>
                {pdfReady ? ' · PDF זמין' : ' · עדיין ללא PDF'}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button style={{ background: galit.primary }} onClick={() => void saveQuote()} disabled={saving}>
                {saving ? 'שומר...' : 'שמור הצעה'}
              </Button>
              <Button variant="outline" onClick={() => void createPdf()} disabled={!currentQuoteId || saving}>
                צור PDF
              </Button>
              <Button variant="outline" onClick={() => void downloadPdf()} disabled={!currentQuoteId || saving}>
                הורד PDF
              </Button>
              <Button variant="outline" onClick={openEmailModal} disabled={!currentQuoteId}>
                שלח במייל
              </Button>
              <Button variant="outline" onClick={openWhatsAppQuote} disabled={!currentQuoteId}>
                שלח בוואטסאפ
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title="תצוגה מקדימה — הצעת מחיר" maxWidth="max-w-4xl">
        <div className="space-y-3" dir="rtl">
          <p className="text-xs text-slate-500">תצוגת HTML כפי שתישמר ב־«תוכן HTML מלא». PDF נוכחי נוצר בשרת מטקסט מנוקה מתגים.</p>
          <div
            className="max-h-[70vh] overflow-auto rounded-2xl border bg-white p-4 text-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: contentHtml || '<p class="text-slate-400">אין תוכן</p>' }}
          />
          <Button variant="outline" type="button" onClick={() => setPreviewOpen(false)}>
            סגור
          </Button>
        </div>
      </Modal>

      <Modal open={emailModalOpen} onClose={() => setEmailModalOpen(false)} title="שליחת הצעה במייל" maxWidth="max-w-lg">
        <div className="space-y-3" dir="rtl">
          <p className="text-sm text-slate-500">
            נפתחת שליחה דרך תוכנת המייל של המחשב (mailto). אם יש PDF, יתווסף קישור בגוף ההודעה.
          </p>
          <FormField label="אל (אימייל)">
            <Input value={emailTo} onChange={(e) => setEmailTo(e.target.value)} placeholder="customer@example.com" />
          </FormField>
          <FormField label="נושא">
            <Input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} />
          </FormField>
          <FormField label="גוף ההודעה">
            <Textarea rows={6} value={emailBody} onChange={(e) => setEmailBody(e.target.value)} />
          </FormField>
          <div className="flex flex-wrap gap-2">
            <Button style={{ background: galit.primary }} onClick={sendEmailMailto} disabled={!emailTo.trim()}>
              פתח ב-mailto
            </Button>
            <Button variant="outline" onClick={() => setEmailModalOpen(false)}>
              סגור
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={aiOpen} onClose={() => setAiOpen(false)} title="צור הצעת מחיר עם AI" maxWidth="max-w-3xl">
        <div className="space-y-4" dir="rtl">
          <FormField label="תיאור חופשי של בקשת הלקוח">
            <Textarea
              placeholder="לדוגמה: הלקוח צריך בדיקת קרינה לבית פרטי ברעננה, 5 חדרים, כולל חצר..."
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
            />
          </FormField>

          <div className="flex flex-wrap gap-2">
            <Button style={{ background: galit.primary }} onClick={() => void generateAIDraft()} disabled={aiGenerating}>
              {aiGenerating ? 'יוצר טיוטה...' : 'צור טיוטת הצעה'}
            </Button>
            <Button variant="outline" onClick={() => setAiOpen(false)}>סגור</Button>
          </div>

          {aiDraft && (
            <div className="space-y-3 rounded-2xl border bg-slate-50 p-4">
              <div className="text-lg font-bold">{aiDraft.title}</div>
              {aiDraft.customerNameHint && (
                <div className="text-sm text-emerald-800">זיהוי לקוח (הצעה): {aiDraft.customerNameHint}</div>
              )}
              <div className="text-sm text-slate-700">{aiDraft.description}</div>
              {aiDraft.siteOrProject && <div className="text-xs text-slate-500">אתר / היקף: {aiDraft.siteOrProject}</div>}
              <div>
                <div className="mb-1 text-sm font-semibold">שורות פריטים</div>
                <ul className="space-y-1 text-sm">
                  {aiDraft.lineItems.map((li, idx) => (
                    <li key={`${li.name}-${idx}`} className="rounded-xl bg-white px-3 py-2">
                      {idx + 1}. {li.name} · כמות {li.quantity} · {formatCurrencyILS(li.unitPrice)} ליחידה · סה״כ שורה{' '}
                      {formatCurrencyILS(li.lineTotal)}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <div className="rounded-xl bg-white px-2 py-2">
                  <div className="text-xs text-slate-500">לפני מע״מ</div>
                  <div className="font-semibold">{formatCurrencyILS(aiDraft.subtotalBeforeVat)}</div>
                </div>
                <div className="rounded-xl bg-white px-2 py-2">
                  <div className="text-xs text-slate-500">מע״מ ({aiDraft.vatPercent}%)</div>
                  <div className="font-semibold">{formatCurrencyILS(aiDraft.vatAmount)}</div>
                </div>
                <div className="rounded-xl bg-white px-2 py-2 sm:col-span-2">
                  <div className="text-xs text-slate-500">סה״כ כולל מע״מ</div>
                  <div className="font-bold text-emerald-800">{formatCurrencyILS(aiDraft.totalWithVat)}</div>
                </div>
              </div>
              <div className="text-sm"><span className="font-semibold">הערות:</span> {aiDraft.notes}</div>
              <div className="text-sm"><span className="font-semibold">תנאים:</span> {aiDraft.terms}</div>

              <div className="flex flex-wrap gap-2 pt-1">
                <Button style={{ background: galit.primary }} onClick={() => applyAIDraftToForm(false)}>
                  החל על הטופס
                </Button>
                <Button variant="outline" onClick={() => applyAIDraftToForm(true)} disabled={saving}>
                  החל ושמור הצעה
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

function ProjectsPage({
  projects,
  onOpenProject,
}: {
  projects: Project[];
  onOpenProject: (project: Project) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold" style={{ color: galit.text }}>פרויקטים</h1>
        <p className="mt-1 text-slate-500">ביצוע, אבני דרך ומעקב התקדמות</p>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>מס׳ פרויקט</TableHead>
                <TableHead>לקוח</TableHead>
                <TableHead>קטגוריה</TableHead>
                <TableHead>עיר</TableHead>
                <TableHead>טכנאי</TableHead>
                <TableHead>סטטוס</TableHead>
                <TableHead>תאריך ביקור</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((p) => (
                <TableRow key={p.id} className="hover:bg-slate-50">
                  <TableCell className="font-medium">{p.projectNumber || '-'}</TableCell>
                  <TableCell>{p.customer?.name || p.client || '-'}</TableCell>
                  <TableCell>{p.serviceCategory || '-'}</TableCell>
                  <TableCell>{p.city || '-'}</TableCell>
                  <TableCell>{p.assignedTechnician?.name || p.owner || '-'}</TableCell>
                  <TableCell>
                    <Badge className={statusBadge(p.status)}>{statusLabel(p.status)}</Badge>
                  </TableCell>
                  <TableCell>{p.siteVisitDate ? new Date(p.siteVisitDate).toLocaleDateString('he-IL') : '-'}</TableCell>
                  <TableCell className="text-left">
                    <Button variant="outline" onClick={() => onOpenProject(p)}>פרטים</Button>
                  </TableCell>
                </TableRow>
              ))}
              {projects.length === 0 && (
                <TableRow>
                  <TableCell className="py-10 text-center text-slate-500" colSpan={8}>
                    אין פרויקטים להצגה
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function ProjectDetailsPage({
  project,
  onBack,
  currentUser,
  technicians,
  reportWriters,
  customers,
  onProjectChange,
}: {
  project: Project;
  onBack: () => void;
  currentUser: AppUser;
  technicians: AppUser[];
  reportWriters: AppUser[];
  customers: Customer[];
  onProjectChange: (next: Partial<Project>) => void;
}) {
  const [tab, setTab] = useState<'details' | 'tasks' | 'quotes' | 'reports' | 'docs' | 'lab' | 'history'>('details');
  const [tasks, setTasks] = useState<any[]>([]);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [labSamples, setLabSamples] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState('');
  const [saveError, setSaveError] = useState('');
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    dueDate: '',
    priority: 'MEDIUM',
    status: 'OPEN',
    type: 'GENERAL',
  });

  const [draft, setDraft] = useState<{
    assignedTechnicianId: string;
    assignedReportWriterId: string;
    siteVisitDate: string;
    siteVisitTime: string;
    serviceCategory: string;
    serviceSubType: string;
    address: string;
    city: string;
    contactPhone: string;
    fieldContactPhone: string;
    urgency: string;
    notes: string;
    customerId: string;
  }>({
    assignedTechnicianId: project.assignedTechnicianId ?? '',
    assignedReportWriterId: project.assignedReportWriterId ?? '',
    siteVisitDate: project.siteVisitDate ? new Date(project.siteVisitDate).toLocaleDateString('en-CA') : '',
    siteVisitTime: project.siteVisitTime ?? '',
    serviceCategory: project.serviceCategory ?? '',
    serviceSubType: project.serviceSubType ?? '',
    address: project.address ?? '',
    city: project.city ?? '',
    contactPhone: project.contactPhone ?? '',
    fieldContactPhone: project.fieldContactPhone ?? '',
    urgency: project.urgency ?? '',
    notes: project.notes ?? '',
    customerId: project.customerId ?? '',
  });

  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newQuoteService, setNewQuoteService] = useState(project.serviceCategory || 'קרינה');
  const [newQuoteAmount, setNewQuoteAmount] = useState('0');
  const [newQuoteValidTo, setNewQuoteValidTo] = useState(new Date().toISOString().slice(0, 10));
  const [newReportTitle, setNewReportTitle] = useState('');
  const [newReportType, setNewReportType] = useState('OTHER');

  const isAdmin = currentUser.role === 'admin';
  const isManager = currentUser.role === 'manager';
  const isTechnician = currentUser.role === 'technician';
  const isSales = currentUser.role === 'sales';
  const canEditProjectMeta = isAdmin || isManager;
  const canEditSchedule = canEditProjectMeta || isTechnician;
  const canCreateTask = isAdmin || isManager || isSales || isTechnician;
  const canCreateQuote = isAdmin || isManager || isSales;
  const canCreateReport = isAdmin || isManager;

  useEffect(() => {
    setDraft({
      assignedTechnicianId: project.assignedTechnicianId ?? '',
      assignedReportWriterId: project.assignedReportWriterId ?? '',
      siteVisitDate: project.siteVisitDate ? new Date(project.siteVisitDate).toLocaleDateString('en-CA') : '',
      siteVisitTime: project.siteVisitTime ?? '',
      serviceCategory: project.serviceCategory ?? '',
      serviceSubType: project.serviceSubType ?? '',
      address: project.address ?? '',
      city: project.city ?? '',
      contactPhone: project.contactPhone ?? '',
      fieldContactPhone: project.fieldContactPhone ?? '',
      urgency: project.urgency ?? '',
      notes: project.notes ?? '',
      customerId: project.customerId ?? '',
    });
    setSaveSuccess('');
    setSaveError('');
  }, [project.id]);

  const patchProject = async (payload: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await apiFetch(apiUrl(`/projects/${project.id}`), {
        method: 'PATCH',
        authUser: currentUser,
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `קוד שגיאה: ${res.status}`);
      }
      const updated = await res.json();
      onProjectChange({
        customerId: updated.customerId ?? undefined,
        customer: updated.customer ? { id: updated.customer.id, name: updated.customer.name, city: updated.customer.city } : undefined,
        assignedTechnicianId: updated.assignedTechnicianId ?? undefined,
        assignedTechnician: updated.assignedTechnician ? { id: updated.assignedTechnician.id, name: updated.assignedTechnician.name } : undefined,
        assignedReportWriterId: updated.assignedReportWriterId ?? undefined,
        assignedReportWriter: updated.assignedReportWriter ? { id: updated.assignedReportWriter.id, name: updated.assignedReportWriter.name } : undefined,
        serviceCategory: updated.serviceCategory ?? undefined,
        serviceSubType: updated.serviceSubType ?? undefined,
        siteVisitDate: updated.siteVisitDate ?? undefined,
        siteVisitTime: updated.siteVisitTime ?? undefined,
        address: updated.address ?? undefined,
        contactPhone: updated.contactPhone ?? undefined,
        fieldContactPhone: updated.fieldContactPhone ?? undefined,
        status: updated.status ?? project.status,
      });
      setSaveSuccess('השינויים נשמרו בהצלחה');
      setSaveError('');
    } finally {
      setBusy(false);
    }
  };

  const saveProjectChanges = async () => {
    setSaveSuccess('');
    setSaveError('');
    try {
      await patchProject({
        assignedTechnicianId: canEditProjectMeta ? (draft.assignedTechnicianId || null) : undefined,
        assignedReportWriterId: canEditProjectMeta ? (draft.assignedReportWriterId || null) : undefined,
        siteVisitDate: canEditSchedule ? (draft.siteVisitDate || null) : undefined,
        siteVisitTime: canEditSchedule ? (draft.siteVisitTime || null) : undefined,
        serviceCategory: canEditProjectMeta ? (draft.serviceCategory || null) : undefined,
        serviceSubType: canEditProjectMeta ? (draft.serviceSubType || null) : undefined,
        address: canEditProjectMeta ? (draft.address || null) : undefined,
        city: canEditProjectMeta ? (draft.city || null) : undefined,
        contactPhone: canEditProjectMeta ? (draft.contactPhone || null) : undefined,
        fieldContactPhone: canEditProjectMeta ? (draft.fieldContactPhone || null) : undefined,
        urgency: canEditProjectMeta ? (draft.urgency || null) : undefined,
        notes: canEditProjectMeta ? (draft.notes || null) : undefined,
        customerId: canEditProjectMeta ? (draft.customerId || null) : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      setSaveError(msg ? `שמירת פרויקט נכשלה: ${msg}` : 'שמירת פרויקט נכשלה. נסה שוב.');
      setSaveSuccess('');
    }
  };

  const reloadLinked = async () => {
    try {
      const [tRes, qRes, rRes, dRes, sRes] = await Promise.all([
        apiFetch(apiUrl(`/tasks?projectId=${encodeURIComponent(project.id)}`), { authUser: currentUser }),
        apiFetch(apiUrl(`/quotes?projectId=${encodeURIComponent(project.id)}`), { authUser: currentUser }),
        apiFetch(apiUrl(`/reports?projectId=${encodeURIComponent(project.id)}`), { authUser: currentUser }),
        apiFetch(apiUrl(`/documents?projectId=${encodeURIComponent(project.id)}`), { authUser: currentUser }),
        apiFetch(apiUrl(`/lab-samples?projectId=${encodeURIComponent(project.id)}`), { authUser: currentUser }),
      ]);
      if (tRes.ok) setTasks(await tRes.json());
      if (qRes.ok) setQuotes(await qRes.json());
      if (rRes.ok) setReports(await rRes.json());
      if (dRes.ok) setDocuments(await dRes.json());
      if (sRes.ok) setLabSamples(await sRes.json());
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    reloadLinked();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const createTaskFromProject = async () => {
    const title = (taskForm.title || newTaskTitle).trim() || `משימה חדשה - ${new Date().toLocaleDateString('he-IL')}`;
    setBusy(true);
    try {
      const payload: any = {
        title,
        description: taskForm.description || null,
        ownerId: currentUser.id,
        projectId: project.id,
        customerId: project.customerId ?? null,
        dueDate: taskForm.dueDate ? new Date(taskForm.dueDate).toISOString() : null,
        priority: taskForm.priority,
        status: taskForm.status,
        type: taskForm.type,
      };
      const res = await apiFetch(apiUrl('/tasks'), {
        method: 'POST',
        authUser: currentUser,
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setNewTaskTitle('');
        setTaskForm({ title: '', description: '', dueDate: '', priority: 'MEDIUM', status: 'OPEN', type: 'GENERAL' });
        setTaskModalOpen(false);
        await reloadLinked();
      }
    } finally {
      setBusy(false);
    }
  };

  const createQuoteFromProject = async () => {
    if (!project.customerId) return;
    setBusy(true);
    try {
      const payload: any = {
        service: newQuoteService,
        amount: Number(newQuoteAmount) || 0,
        status: 'DRAFT',
        validTo: new Date(newQuoteValidTo).toISOString(),
        customerId: project.customerId,
        projectId: project.id,
      };
      const res = await apiFetch(apiUrl('/quotes'), {
        method: 'POST',
        authUser: currentUser,
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        await reloadLinked();
      }
    } finally {
      setBusy(false);
    }
  };

  const createReportFromProject = async () => {
    setBusy(true);
    try {
      const payload: any = {
        title: newReportTitle.trim() || `דוח - ${project.name}`,
        reportType: newReportType || 'OTHER',
        status: 'WAITING_DATA',
        createdById: currentUser.id,
        customerId: project.customerId ?? null,
        projectId: project.id,
        version: 1,
      };
      const res = await apiFetch(apiUrl('/reports'), {
        method: 'POST',
        authUser: currentUser,
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setNewReportTitle('');
        await reloadLinked();
      }
    } finally {
      setBusy(false);
    }
  };

  const projectTimeline = useMemo(() => {
    const items: EntityTimelineItem[] = [];

    const projectCreatedAt = (project as any).createdAt as string | Date | null | undefined;
    const projectUpdatedAt = (project as any).updatedAt as string | Date | null | undefined;

    if (projectCreatedAt) {
      items.push({
        id: `project-created-${project.id}`,
        title: 'נוצר',
        at: projectCreatedAt,
        description: `נוצר פרויקט: ${project.name}`,
      });
    }

    const techName =
      project.assignedTechnician?.name ||
      technicians.find((u) => u.id === (project.assignedTechnicianId ?? ''))?.name ||
      '';

    if (techName) {
      items.push({
        id: `project-assigned-tech-${project.id}`,
        title: 'שויך',
        at: projectUpdatedAt || projectCreatedAt || null,
        description: `שויך לטכנאי: ${techName}`,
      });
    }

    for (const q of quotes) {
      const st = (q?.status || '').toString().toUpperCase();
      if (['SENT', 'APPROVED', 'SIGNED'].includes(st)) {
        items.push({
          id: `project-quote-sent-${q.id}`,
          title: 'נשלחה הצעה',
          at: q.updatedAt || q.createdAt || null,
          description: q.quoteNumber ? `מספר הצעה: ${q.quoteNumber}` : 'נשלחה הצעת מחיר',
        });
      }
    }

    const pst = (project.status || '').toString().toUpperCase();
    if (pst === 'CLOSED' || pst === 'COMPLETED') {
      items.push({
        id: `project-closed-${project.id}`,
        title: 'נסגר',
        at: projectUpdatedAt || projectCreatedAt || null,
        description: `הפרויקט נסגר`,
      });
    }

    return items;
  }, [project.id, project.status, project.assignedTechnicianId, project.assignedTechnician?.name, project.name, technicians, quotes]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: galit.text }}>פרטי פרויקט</h1>
          <p className="mt-1 text-slate-500">{project.name}</p>
        </div>
        <div className="flex gap-2">
          {(canEditProjectMeta || canEditSchedule) && (
            <Button style={{ background: galit.primary }} onClick={saveProjectChanges} disabled={busy}>
              {busy ? 'שומר...' : 'שמור שינויים'}
            </Button>
          )}
          <Button variant="outline" onClick={onBack}>חזרה</Button>
        </div>
      </div>

      {saveSuccess && (
        <div className="rounded-2xl bg-green-50 px-4 py-3 text-sm text-green-700">
          {saveSuccess}
        </div>
      )}
      {saveError && (
        <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {saveError}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button className={cn('rounded-2xl px-3 py-2 text-sm', tab === 'details' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700')} onClick={() => setTab('details')}>פרטי פרויקט</button>
        <button className={cn('rounded-2xl px-3 py-2 text-sm', tab === 'tasks' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700')} onClick={() => setTab('tasks')}>משימות</button>
        <button className={cn('rounded-2xl px-3 py-2 text-sm', tab === 'quotes' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700')} onClick={() => setTab('quotes')}>הצעות מחיר</button>
        <button className={cn('rounded-2xl px-3 py-2 text-sm', tab === 'reports' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700')} onClick={() => setTab('reports')}>דוחות</button>
        <button className={cn('rounded-2xl px-3 py-2 text-sm', tab === 'docs' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700')} onClick={() => setTab('docs')}>מסמכים</button>
        <button className={cn('rounded-2xl px-3 py-2 text-sm', tab === 'lab' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700')} onClick={() => setTab('lab')}>דגימות</button>
        <button className={cn('rounded-2xl px-3 py-2 text-sm', tab === 'history' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700')} onClick={() => setTab('history')}>היסטוריה</button>
      </div>

      {tab === 'details' && (
        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <div className="text-sm text-slate-500">לקוח</div>
                {canEditProjectMeta ? (
                  <select
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    value={draft.customerId}
                    onChange={(e) => setDraft((prev) => ({ ...prev, customerId: e.target.value }))}
                    disabled={busy}
                  >
                    <option value="">—</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                ) : (
                  <div className="mt-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    {project.customer?.name || project.client || '—'}
                  </div>
                )}
              </div>
              <div>
                <div className="text-sm text-slate-500">טכנאי</div>
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  value={draft.assignedTechnicianId}
                  onChange={(e) => setDraft((prev) => ({ ...prev, assignedTechnicianId: e.target.value }))}
                  disabled={busy || !canEditProjectMeta}
                >
                  <option value="">—</option>
                  {technicians.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="text-sm text-slate-500">כותב דוח</div>
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  value={draft.assignedReportWriterId}
                  onChange={(e) => setDraft((prev) => ({ ...prev, assignedReportWriterId: e.target.value }))}
                  disabled={busy || !canEditProjectMeta}
                >
                  <option value="">—</option>
                  {reportWriters.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="text-sm text-slate-500">תאריך ביקור</div>
                <input
                  type="date"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  value={draft.siteVisitDate}
                  onChange={(e) => setDraft((prev) => ({ ...prev, siteVisitDate: e.target.value }))}
                  disabled={busy || !canEditSchedule}
                />
              </div>
              <div>
                <div className="text-sm text-slate-500">שעה</div>
                <input
                  type="time"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  value={draft.siteVisitTime}
                  onChange={(e) => setDraft((prev) => ({ ...prev, siteVisitTime: e.target.value }))}
                  disabled={busy || !canEditSchedule}
                />
              </div>
              <div>
                <div className="text-sm text-slate-500">קטגוריית שירות</div>
                <Input value={draft.serviceCategory} onChange={(e) => setDraft((prev) => ({ ...prev, serviceCategory: e.target.value }))} placeholder="למשל: קרינה" />
              </div>
              <div>
                <div className="text-sm text-slate-500">סוג שירות</div>
                <Input value={draft.serviceSubType} onChange={(e) => setDraft((prev) => ({ ...prev, serviceSubType: e.target.value }))} placeholder="למשל: ראדון בבית פרטי" />
              </div>
              <div className="md:col-span-2">
                <div className="text-sm text-slate-500">כתובת</div>
                <Input value={draft.address} onChange={(e) => setDraft((prev) => ({ ...prev, address: e.target.value }))} placeholder="כתובת אתר הבדיקה" />
              </div>
              <div>
                <div className="text-sm text-slate-500">עיר</div>
                <Input value={draft.city} onChange={(e) => setDraft((prev) => ({ ...prev, city: e.target.value }))} placeholder="עיר" />
              </div>
              <div>
                <div className="text-sm text-slate-500">טלפון איש קשר</div>
                <PhoneInput
                  value={draft.contactPhone}
                  onChange={(v) => setDraft((prev) => ({ ...prev, contactPhone: v }))}
                  placeholder="טלפון איש קשר"
                />
              </div>
              <div>
                <div className="text-sm text-slate-500">טלפון איש קשר לשטח</div>
                <PhoneInput
                  value={draft.fieldContactPhone}
                  onChange={(v) => setDraft((prev) => ({ ...prev, fieldContactPhone: v }))}
                  placeholder="טלפון איש קשר לשטח"
                />
              </div>
              <div>
                <div className="text-sm text-slate-500">דחיפות</div>
                <select
                  className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  value={draft.urgency}
                  onChange={(e) => setDraft((prev) => ({ ...prev, urgency: e.target.value }))}
                >
                  <option value="">—</option>
                  <option value="LOW">{taskPriorityLabel('LOW')}</option>
                  <option value="MEDIUM">{taskPriorityLabel('MEDIUM')}</option>
                  <option value="HIGH">{taskPriorityLabel('HIGH')}</option>
                  <option value="URGENT">{taskPriorityLabel('URGENT')}</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <div className="text-sm text-slate-500">הערות</div>
                <Textarea value={draft.notes} onChange={(e) => setDraft((prev) => ({ ...prev, notes: e.target.value }))} placeholder="הערות לפרויקט" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === 'tasks' && (
        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="font-semibold">משימות</div>
              {canCreateTask && (
                <Button style={{ background: galit.primary }} onClick={() => setTaskModalOpen(true)} disabled={busy}>
                  משימה חדשה
                </Button>
              )}
            </div>
            {tasks.length === 0 ? (
              <div className="text-sm text-slate-500">אין משימות לפרויקט זה.</div>
            ) : (
              <div className="space-y-2">
                {tasks.map((t) => (
                  <div key={t.id} className="rounded-2xl border p-4">
                    <div className="font-medium">{t.title}</div>
                    <div className="mt-1 text-xs text-slate-500">{taskStatusLabelForTasks(t.status)} · {taskPriorityLabel(t.priority)}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Modal open={taskModalOpen} onClose={() => setTaskModalOpen(false)} title="משימה חדשה לפרויקט" maxWidth="max-w-2xl">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <FormField label="כותרת">
              <Input value={taskForm.title} onChange={(e) => setTaskForm((p) => ({ ...p, title: e.target.value }))} placeholder="כותרת" />
            </FormField>
          </div>
          <div className="md:col-span-2">
            <FormField label="תיאור">
              <Textarea value={taskForm.description} onChange={(e) => setTaskForm((p) => ({ ...p, description: e.target.value }))} placeholder="תיאור" />
            </FormField>
          </div>
          <div>
            <div className="mb-1 text-xs text-slate-500">תאריך יעד</div>
            <input type="date" className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm" value={taskForm.dueDate} onChange={(e) => setTaskForm((p) => ({ ...p, dueDate: e.target.value }))} />
          </div>
          <div>
            <div className="mb-1 text-xs text-slate-500">עדיפות</div>
            <select
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
              value={taskForm.priority}
              onChange={(e) => setTaskForm((p) => ({ ...p, priority: e.target.value }))}
            >
              <option value="LOW">{taskPriorityLabel('LOW')}</option>
              <option value="MEDIUM">{taskPriorityLabel('MEDIUM')}</option>
              <option value="HIGH">{taskPriorityLabel('HIGH')}</option>
              <option value="URGENT">{taskPriorityLabel('URGENT')}</option>
            </select>
          </div>
          <div>
            <div className="mb-1 text-xs text-slate-500">סטטוס</div>
            <select
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
              value={taskForm.status}
              onChange={(e) => setTaskForm((p) => ({ ...p, status: e.target.value }))}
            >
              <option value="OPEN">{taskStatusLabelForTasks('OPEN')}</option>
              <option value="IN_PROGRESS">{taskStatusLabelForTasks('IN_PROGRESS')}</option>
              <option value="DONE">{taskStatusLabelForTasks('DONE')}</option>
              <option value="CANCELLED">{taskStatusLabelForTasks('CANCELLED')}</option>
            </select>
          </div>
          <div>
            <div className="mb-1 text-xs text-slate-500">סוג</div>
            <select
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
              value={taskForm.type}
              onChange={(e) => setTaskForm((p) => ({ ...p, type: e.target.value }))}
            >
              <option value="SALES_FOLLOWUP">{taskTypeLabelForTasks('SALES_FOLLOWUP')}</option>
              <option value="QUOTE_PREPARATION">{taskTypeLabelForTasks('QUOTE_PREPARATION')}</option>
              <option value="COORDINATION">{taskTypeLabelForTasks('COORDINATION')}</option>
              <option value="FIELD_WORK">{taskTypeLabelForTasks('FIELD_WORK')}</option>
              <option value="REPORT_WRITING">{taskTypeLabelForTasks('REPORT_WRITING')}</option>
              <option value="REVIEW">{taskTypeLabelForTasks('REVIEW')}</option>
              <option value="COLLECTION">{taskTypeLabelForTasks('COLLECTION')}</option>
              <option value="GENERAL">{taskTypeLabelForTasks('GENERAL')}</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <Button className="w-full" style={{ background: galit.primary }} onClick={createTaskFromProject} disabled={busy}>
              {busy ? 'שומר...' : 'שמור'}
            </Button>
          </div>
        </div>
      </Modal>

      {tab === 'quotes' && (
        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="flex items-center justify-between">
              <div className="font-semibold">הצעות מחיר</div>
              {canCreateQuote && (
                <Button style={{ background: galit.primary }} onClick={createQuoteFromProject} disabled={busy || !project.customerId}>
                  הצעת מחיר חדשה
                </Button>
              )}
            </div>
            {canCreateQuote && !project.customerId && (
              <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                כדי ליצור הצעת מחיר, צריך לשייך לקוח לפרויקט.
              </div>
            )}
            {canCreateQuote && (
              <>
                <div className="grid gap-3 md:grid-cols-3">
                  <FormField label="שירות">
                    <Input value={newQuoteService} onChange={(e) => setNewQuoteService(e.target.value)} placeholder="שירות" />
                  </FormField>
                  <FormField label="סכום">
                    <Input value={newQuoteAmount} onChange={(e) => setNewQuoteAmount(e.target.value)} placeholder="סכום" />
                  </FormField>
                  <FormField label="תוקף עד">
                    <Input value={newQuoteValidTo} onChange={(e) => setNewQuoteValidTo(e.target.value)} placeholder="בחר תאריך" />
                  </FormField>
                </div>
              </>
            )}
            {quotes.length === 0 ? (
              <div className="text-sm text-slate-500">אין הצעות מחיר לפרויקט זה.</div>
            ) : (
              <div className="space-y-2">
                {quotes.map((q) => (
                  <div key={q.id} className="rounded-2xl border p-4">
                    <div className="font-medium">{q.service}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {statusLabel(q.status)} · {(currentUser.role === 'admin' || currentUser.role === 'manager' || currentUser.canViewFinance) ? formatCurrencyILS(Number(q.amount)) : '-'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === 'reports' && (
        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="font-semibold">דוחות</div>
              {canCreateReport && (
                <div className="flex gap-2">
                  <Input value={newReportTitle} onChange={(e) => setNewReportTitle(e.target.value)} placeholder="כותרת דוח (אופציונלי)" />
                  <select
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-slate-400"
                    value={newReportType}
                    onChange={(e) => setNewReportType(e.target.value)}
                  >
                    {[
                      'RADIATION_REPORT',
                      'ACOUSTIC_REPORT',
                      'AIR_QUALITY_REPORT',
                      'ASBESTOS_REPORT',
                      'RADON_REPORT',
                      'ODOUR_REPORT',
                      'SOIL_REPORT',
                      'LAB_REPORT',
                      'OTHER',
                    ].map((opt) => (
                      <option key={opt} value={opt}>
                        {reportTypeLabel(opt)}
                      </option>
                    ))}
                  </select>
                  <Button style={{ background: galit.primary }} onClick={createReportFromProject} disabled={busy}>דוח חדש</Button>
                </div>
              )}
            </div>
            {reports.length === 0 ? (
              <div className="text-sm text-slate-500">אין דוחות לפרויקט זה.</div>
            ) : (
              <div className="space-y-2">
                {reports.map((r) => (
                  <div key={r.id} className="rounded-2xl border p-4">
                    <div className="font-medium">{r.title}</div>
                    <div className="mt-1 text-xs text-slate-500">{reportTypeLabel(r.type)}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === 'docs' && (
        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="flex items-center justify-between">
              <div className="font-semibold">מסמכים</div>
              <Button
                style={{ background: galit.primary }}
                disabled={busy}
                onClick={async () => {
                  const name = window.prompt('שם מסמך');
                  if (!name) return;
                  const filePath = window.prompt('נתיב/קישור לקובץ (טקסט)') || '';
                  if (!filePath.trim()) return;
                  try {
                    setBusy(true);
                    const res = await apiFetch(apiUrl('/documents'), {
                      method: 'POST',
                      authUser: currentUser,
                      body: JSON.stringify({
                        name,
                        documentType: 'OTHER',
                        filePath,
                        description: null,
                        projectId: project.id,
                        customerId: project.customerId ?? null,
                        reportId: null,
                      }),
                    });
                    if (res.ok) await reloadLinked();
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                מסמך חדש
              </Button>
            </div>

            {documents.length === 0 ? (
              <div className="text-sm text-slate-500">אין מסמכים לפרויקט זה.</div>
            ) : (
              <div className="space-y-2">
                {documents.map((d) => (
                  <div key={d.id} className="rounded-2xl border p-4">
                    <div className="font-medium">{d.name}</div>
                    <div className="mt-1 text-xs text-slate-500">{documentTypeLabel(d.documentType)} · {d.filePath}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === 'lab' && (
        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="flex items-center justify-between">
              <div className="font-semibold">דגימות</div>
              <Button
                style={{ background: galit.primary }}
                disabled={busy}
                onClick={async () => {
                  const sampleNumber = window.prompt('מספר דגימה');
                  if (!sampleNumber) return;
                  try {
                    setBusy(true);
                    const res = await apiFetch(apiUrl('/lab-samples'), {
                      method: 'POST',
                      authUser: currentUser,
                      body: JSON.stringify({
                        sampleNumber,
                        projectId: project.id,
                        customerId: project.customerId ?? null,
                        sampleType: 'OTHER',
                        sampleStatus: 'COLLECTED',
                        resultStatus: 'PENDING',
                        collectedById: currentUser.id,
                      }),
                    });
                    if (res.ok) await reloadLinked();
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                דגימה חדשה
              </Button>
            </div>

            {labSamples.length === 0 ? (
              <div className="text-sm text-slate-500">אין דגימות לפרויקט זה.</div>
            ) : (
              <div className="space-y-2">
                {labSamples.map((s) => (
                  <div key={s.id} className="rounded-2xl border p-4">
                    <div className="font-medium">{s.sampleNumber}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {labSampleTypeLabel(s.sampleType)} · {labSampleStatusLabel(s.sampleStatus)} · {labSampleResultStatusLabel(s.resultStatus)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === 'history' && (
        <Card>
          <CardContent className="space-y-3 p-5">
            <div className="font-semibold">היסטוריה</div>
            <EntityTimeline items={projectTimeline} emptyText="אין אירועים להצגה לפרויקט זה" />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function OpportunitiesPage({
  opportunities,
  setOpportunities,
  customers,
  users,
  currentUser,
}: {
  opportunities: Opportunity[];
  setOpportunities: React.Dispatch<React.SetStateAction<Opportunity[]>>;
  customers: Customer[];
  users: AppUser[];
  currentUser: AppUser;
}) {
  const [open, setOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selected, setSelected] = useState<Opportunity | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [form, setForm] = useState({
    customerId: '',
    projectOrServiceName: '',
    estimatedValue: '0',
    pipelineStage: 'NEW',
    targetCloseDate: '',
    assignedUserId: '',
    notes: '',
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('הכל');
  const [datePreset, setDatePreset] = useState<'all' | 'month' | 'quarter'>('all');
  const [sortBy, setSortBy] = useState<'value_desc' | 'close_asc' | 'created_desc'>('value_desc');
  const [quotePickOpen, setQuotePickOpen] = useState(false);

  const OPPORTUNITY_STAGE_LABELS: Record<string, string> = {
    NEW: 'חדש',
    QUALIFIED: 'מוסמך',
    PROPOSAL: 'הצעה',
    NEGOTIATION: 'משא ומתן',
    WON: 'נסגר - זכייה',
    LOST: 'נסגר - הפסד',
  };
  const OPPORTUNITY_STAGES = Object.keys(OPPORTUNITY_STAGE_LABELS);

  const createOpportunity = async () => {
    if (!form.projectOrServiceName.trim()) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const estimated = parseCurrencyInput(form.estimatedValue);
      if (estimated === null) throw new Error('סכום לא תקין');

      const payload: any = {
        customerId: form.customerId || null,
        projectOrServiceName: form.projectOrServiceName.trim(),
        estimatedValue: estimated,
        pipelineStage: form.pipelineStage,
        targetCloseDate: form.targetCloseDate ? new Date(form.targetCloseDate).toISOString() : null,
        assignedUserId: form.assignedUserId || currentUser.id,
        notes: form.notes || null,
      };
      const res = await apiFetch(apiUrl('/opportunities'), {
        method: 'POST',
        authUser: currentUser,
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      const created = await res.json();
      setOpportunities((prev) => [created, ...prev]);
      setOpen(false);
      setForm({
        customerId: '',
        projectOrServiceName: '',
        estimatedValue: '0',
        pipelineStage: 'NEW',
        targetCloseDate: '',
        assignedUserId: '',
        notes: '',
      });
      setSuccess('הזדמנות נוצרה בהצלחה');
    } catch {
      setError('יצירת הזדמנות נכשלה. נסה שוב מאוחר יותר.');
    } finally {
      setSaving(false);
    }
  };

  const openDetails = async (o: Opportunity) => {
    setSelected(o);
    setDetailsOpen(true);
    setError('');
    setSuccess('');
    setDetailsLoading(true);
    try {
      const res = await apiFetch(apiUrl(`/opportunities/${o.id}`), { authUser: currentUser });
      if (!res.ok) throw new Error(await res.text());
      const full = await res.json();
      setSelected(full);
      setForm({
        customerId: full.customerId || '',
        projectOrServiceName: full.projectOrServiceName || '',
        estimatedValue: String(full.estimatedValue ?? 0),
        pipelineStage: full.pipelineStage || 'NEW',
        targetCloseDate: full.targetCloseDate ? new Date(full.targetCloseDate).toLocaleDateString('en-CA') : '',
        assignedUserId: full.assignedUserId || '',
        notes: full.notes || '',
      });
    } catch {
      setError('טעינת הזדמנות נכשלה. נסה שוב.');
    } finally {
      setDetailsLoading(false);
    }
  };

  const saveDetails = async () => {
    if (!selected) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const estimated = parseCurrencyInput(form.estimatedValue);
      if (estimated === null) throw new Error('סכום לא תקין');

      const payload: any = {
        customerId: form.customerId || null,
        projectOrServiceName: form.projectOrServiceName.trim(),
        estimatedValue: estimated,
        pipelineStage: form.pipelineStage,
        targetCloseDate: form.targetCloseDate ? new Date(form.targetCloseDate).toISOString() : null,
        assignedUserId: form.assignedUserId || null,
        notes: form.notes || null,
      };
      const res = await apiFetch(apiUrl(`/opportunities/${selected.id}`), {
        method: 'PATCH',
        authUser: currentUser,
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      setSelected((prev) => (prev ? { ...prev, ...updated } : prev));
      setOpportunities((prev) => prev.map((x) => (x.id === selected.id ? { ...x, ...updated } : x)));
      setSuccess('ההזדמנות עודכנה בהצלחה');
    } catch {
      setError('עדכון הזדמנות נכשל. נסה שוב.');
    } finally {
      setSaving(false);
    }
  };

  const deleteOpportunity = async () => {
    if (!selected) return;
    if (!window.confirm('למחוק את ההזדמנות?')) return;
    setSaving(true);
    setError('');
    try {
      const res = await apiFetch(apiUrl(`/opportunities/${selected.id}`), {
        method: 'DELETE',
        authUser: currentUser,
      });
      if (!res.ok) throw new Error(await res.text());
      setOpportunities((prev) => prev.filter((x) => x.id !== selected.id));
      setDetailsOpen(false);
      setSelected(null);
      setSuccess('ההזדמנות נמחקה');
    } catch {
      setError('מחיקת הזדמנות נכשלה. נסה שוב.');
    } finally {
      setSaving(false);
    }
  };

  const createQuoteFromOpportunity = async () => {
    if (!selected) return;
    await createQuoteFromOpportunityFor(selected);
  };

  const createQuoteFromOpportunityFor = async (opp: Opportunity) => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload: any = {
        customerId: opp.customerId || null,
        opportunityId: opp.id,
        service: opp.projectOrServiceName,
        description: opp.notes || null,
        amountBeforeVat: 0,
        vatPercent: 17,
        discountType: 'NONE',
        discountValue: 0,
        paymentTerms: 'שוטף 30',
        validityDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'DRAFT',
        notes: null,
      };
      const res = await apiFetch(apiUrl('/quotes'), {
        method: 'POST',
        authUser: currentUser,
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      setSuccess('הצעת מחיר נוצרה');
      setSelected(opp);
      await openDetails(opp);
    } catch {
      setError('יצירת הצעת מחיר נכשלה. נסה שוב.');
    } finally {
      setSaving(false);
    }
  };

  const filteredOpportunities = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const now = Date.now();
    const monthMs = 30 * 24 * 60 * 60 * 1000;
    const quarterMs = 90 * 24 * 60 * 60 * 1000;

    let list = opportunities.filter((o) => {
      const customerName = o.customer?.name || customers.find((c) => c.id === o.customerId)?.name || '';
      const leadName = o.lead?.fullName || '';
      const hay = [o.projectOrServiceName, customerName, leadName, o.notes || '', OPPORTUNITY_STAGE_LABELS[o.pipelineStage] || o.pipelineStage]
        .join(' ')
        .toLowerCase();
      const matchesSearch = !q || hay.includes(q);
      const matchesStage =
        stageFilter === 'הכל' || (OPPORTUNITY_STAGE_LABELS[o.pipelineStage] || o.pipelineStage) === stageFilter;
      let matchesDate = true;
      if (datePreset !== 'all') {
        const t = o.targetCloseDate ? new Date(o.targetCloseDate).getTime() : null;
        const c = o.createdAt ? new Date(o.createdAt).getTime() : null;
        const ref = t ?? c;
        if (ref == null) matchesDate = false;
        else {
          const window = datePreset === 'month' ? monthMs : quarterMs;
          matchesDate = ref >= now - window && ref <= now + window;
        }
      }
      return matchesSearch && matchesStage && matchesDate;
    });

    list = [...list].sort((a, b) => {
      if (sortBy === 'value_desc') return Number(b.estimatedValue || 0) - Number(a.estimatedValue || 0);
      if (sortBy === 'close_asc') {
        const ta = a.targetCloseDate ? new Date(a.targetCloseDate).getTime() : Number.POSITIVE_INFINITY;
        const tb = b.targetCloseDate ? new Date(b.targetCloseDate).getTime() : Number.POSITIVE_INFINITY;
        return ta - tb;
      }
      const ca = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const cb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return cb - ca;
    });
    return list;
  }, [opportunities, customers, searchQuery, stageFilter, datePreset, sortBy]);

  const openOpportunitiesCount = useMemo(
    () => opportunities.filter((o) => ['NEW', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION'].includes(o.pipelineStage)).length,
    [opportunities],
  );

  const totalPipelineValue = useMemo(
    () => opportunities.reduce((sum, o) => sum + Number(o.estimatedValue || 0), 0),
    [opportunities],
  );

  const openPipelineValue = useMemo(
    () =>
      opportunities
        .filter((o) => ['NEW', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION'].includes(o.pipelineStage))
        .reduce((sum, o) => sum + Number(o.estimatedValue || 0), 0),
    [opportunities],
  );

  const wonCount = opportunities.filter((o) => o.pipelineStage === 'WON').length;
  const lostCount = opportunities.filter((o) => o.pipelineStage === 'LOST').length;
  const closeRatePct =
    wonCount + lostCount > 0 ? Math.round((wonCount / (wonCount + lostCount)) * 100) : 78;

  const stageBarData = useMemo(() => {
    const stages = ['NEW', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'] as const;
    return stages.map((s) => ({
      name: OPPORTUNITY_STAGE_LABELS[s] || s,
      count: opportunities.filter((o) => o.pipelineStage === s).length,
    }));
  }, [opportunities]);

  const sourceChips = useMemo(() => {
    const base = [
      { label: 'אתר', weight: 0.22 },
      { label: 'המלצה', weight: 0.18 },
      { label: 'גוגל', weight: 0.15 },
      { label: 'וואטסאפ', weight: 0.12 },
      { label: 'פייסבוק', weight: 0.1 },
      { label: 'אחר', weight: 0.23 },
    ];
    const n = Math.max(1, opportunities.length);
    return base.map((b) => ({
      label: b.label,
      count: Math.max(1, Math.round(n * b.weight)),
    }));
  }, [opportunities.length]);

  const handleCreateQuoteFromPanel = () => {
    if (filteredOpportunities.length === 0) {
      alert('אין הזדמנות זמינה. צור הזדמנות חדשה תחילה.');
      return;
    }
    if (filteredOpportunities.length === 1) {
      void createQuoteFromOpportunityFor(filteredOpportunities[0]);
      return;
    }
    setQuotePickOpen(true);
  };

  const stageBadgeClass = (stage: string) => {
    const s = (stage || '').toUpperCase();
    if (s === 'WON') return 'bg-emerald-100 text-emerald-800';
    if (s === 'LOST') return 'bg-red-100 text-red-700';
    if (s === 'NEGOTIATION') return 'bg-amber-100 text-amber-800';
    return 'bg-slate-100 text-slate-700';
  };

  const opportunityStatusChip = (stage: string) => {
    const s = (stage || '').toUpperCase();
    if (s === 'WON') return { label: 'נסגר', cls: 'bg-emerald-100 text-emerald-800' };
    if (s === 'LOST') return { label: 'הופסד', cls: 'bg-red-100 text-red-700' };
    return { label: 'בטיפול', cls: 'bg-amber-50 text-amber-800' };
  };

  return (
    <div className="space-y-5" dir="rtl">
      {/* RTL: עמודה ראשונה ב-DOM = ימין (KPI), אחרונה = שמאל (פרופיל) */}
      <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)_280px]">
        <aside className="order-1 space-y-4 lg:order-1">
          <Card className="rounded-[24px] border-0 bg-white shadow-[0_12px_36px_rgba(15,23,42,0.08)]">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 text-right">
                  <div className="font-bold text-slate-900">{currentUser.name}</div>
                  <div className="text-xs text-slate-500">{roleLabel(currentUser.role)}</div>
                </div>
                <div className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                  <Bell className="h-5 w-5" />
                  <span className="absolute -left-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                    3
                  </span>
                </div>
              </div>
              <Button
                className="h-11 w-full rounded-2xl font-semibold shadow-sm"
                style={{ background: galit.primary }}
                disabled={saving}
                onClick={handleCreateQuoteFromPanel}
              >
                יצירת הצעה
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-[24px] border-0 bg-white shadow-[0_12px_36px_rgba(15,23,42,0.08)]">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-bold text-slate-900">KPIs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">פוטנציאל כולל</span>
                <span className="font-bold text-emerald-700">{formatCurrencyILS(totalPipelineValue)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">הזדמנויות פתוחות</span>
                <span className="font-bold text-slate-900">{openOpportunitiesCount}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">אחוז סגירה</span>
                <span className="font-bold text-slate-900">{closeRatePct}%</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">זמן סגירה ממוצע</span>
                <span className="font-bold text-slate-900">18 ימים</span>
              </div>
              <div className="flex justify-between gap-2 border-t border-slate-100 pt-2">
                <span className="text-slate-500">הכנסה צפויה (פתוח)</span>
                <span className="font-bold text-emerald-800">{formatCurrencyILS(openPipelineValue)}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[24px] border-0 bg-white shadow-[0_12px_36px_rgba(15,23,42,0.08)]">
            <CardHeader className="pb-1">
              <CardTitle className="text-sm font-bold text-slate-800">התפלגות לפי שלב</CardTitle>
            </CardHeader>
            <CardContent className="h-[160px] pr-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stageBarData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={48} />
                  <YAxis hide />
                  <Tooltip />
                  <Bar dataKey="count" fill={galit.primary} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="rounded-[24px] border-0 bg-white shadow-[0_12px_36px_rgba(15,23,42,0.08)]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold text-slate-800">ציר זמן / שלבים</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(['NEW', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON'] as const).map((s, i) => (
                <div key={s} className="flex items-center gap-3">
                  <div
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ background: galit.primary, opacity: 1 - i * 0.12 }}
                  >
                    {i + 1}
                  </div>
                  <div className="flex-1 text-right">
                    <div className="text-sm font-semibold text-slate-800">{OPPORTUNITY_STAGE_LABELS[s]}</div>
                    <div className="text-xs text-slate-500">
                      {opportunities.filter((o) => o.pipelineStage === s).length} הזדמנויות
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-[24px] border-0 bg-white shadow-[0_12px_36px_rgba(15,23,42,0.08)]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold text-slate-800">מקור הזדמנויות</CardTitle>
              <p className="text-xs text-slate-400">הערכה ויזואלית (לפי נפח פעילות במערכת)</p>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {sourceChips.map((c) => (
                <span
                  key={c.label}
                  className="rounded-full border border-emerald-100 bg-emerald-50/80 px-3 py-1.5 text-xs font-semibold text-emerald-900"
                >
                  {c.label} · {c.count}
                </span>
              ))}
            </CardContent>
          </Card>
        </aside>

        <div className="order-2 space-y-4 lg:order-2">
          <div className="rounded-[28px] border border-emerald-100/80 bg-[#f7fbf5] p-5 shadow-[0_12px_40px_rgba(15,23,42,0.06)]">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0 flex-1 text-center md:text-right">
                <h1 className="text-2xl font-black leading-tight text-slate-900 md:text-4xl">
                  לוח הזדמנויות מכירה - <span style={{ color: galit.primary }}>גלית</span>
                </h1>
                <p className="mt-2 text-sm text-slate-500 md:text-base">סקירת ביצועים והמלצות</p>
              </div>
              <div className="flex flex-shrink-0 flex-col gap-2 sm:flex-row">
                <Button
                  className="rounded-2xl px-5 py-2.5 text-sm font-semibold shadow-md"
                  style={{ background: galit.primary }}
                  onClick={() => setOpen(true)}
                >
                  <Plus className="ml-2 h-4 w-4" />
                  הוספת הזדמנות חדשה
                </Button>
                <Button
                  className="rounded-2xl px-5 py-2.5 text-sm font-semibold shadow-md"
                  style={{ background: galit.primary }}
                  onClick={() => setOpen(true)}
                >
                  <Plus className="ml-2 h-4 w-4" />
                  הוספת הזדמנות חדשה
                </Button>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-[1fr_auto_auto_auto] md:items-end">
              <div className="relative min-w-0">
                <Search className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  className="h-12 rounded-2xl border-slate-200 bg-white pr-11 text-sm shadow-sm"
                  placeholder="חיפוש לפי שם הזדמנות, לקוח, שלב או הערות..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="min-w-[140px]">
                <div className="mb-1 text-xs text-slate-500">סטטוס / שלב</div>
                <select
                  className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm"
                  value={stageFilter}
                  onChange={(e) => setStageFilter(e.target.value)}
                >
                  <option value="הכל">הכל</option>
                  {OPPORTUNITY_STAGES.map((s) => (
                    <option key={s} value={OPPORTUNITY_STAGE_LABELS[s]}>
                      {OPPORTUNITY_STAGE_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-[120px]">
                <div className="mb-1 text-xs text-slate-500">תאריך</div>
                <select
                  className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm"
                  value={datePreset}
                  onChange={(e) => setDatePreset(e.target.value as 'all' | 'month' | 'quarter')}
                >
                  <option value="all">הכל</option>
                  <option value="month">חודש קרוב</option>
                  <option value="quarter">רבעון</option>
                </select>
              </div>
              <div className="min-w-[140px]">
                <div className="mb-1 text-xs text-slate-500">מיון</div>
                <select
                  className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                >
                  <option value="value_desc">שווי (גבוה → נמוך)</option>
                  <option value="close_asc">תאריך סגירה יעד</option>
                  <option value="created_desc">תאריך יצירה</option>
                </select>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredOpportunities.length === 0 ? (
              <div className="col-span-full rounded-3xl border border-dashed border-emerald-200 bg-white/80 py-14 text-center text-sm text-slate-500">
                לא נמצאו הזדמנות מתאימות
              </div>
            ) : (
              filteredOpportunities.map((o) => {
                const customerName = o.customer?.name || customers.find((c) => c.id === o.customerId)?.name || '—';
                const contactHint = o.lead?.fullName || o.assignedUser?.name || '—';
                const statusChip = opportunityStatusChip(o.pipelineStage);
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => openDetails(o)}
                    className="group w-full rounded-[22px] border border-slate-100 bg-white p-5 text-right shadow-[0_10px_28px_rgba(15,23,42,0.07)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(15,23,42,0.1)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="line-clamp-2 text-base font-bold text-slate-900">{o.projectOrServiceName}</div>
                        <div className="mt-1 text-sm font-medium text-slate-600">{customerName}</div>
                      </div>
                      <Badge className={stageBadgeClass(o.pipelineStage)}>
                        {OPPORTUNITY_STAGE_LABELS[o.pipelineStage] || o.pipelineStage}
                      </Badge>
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-2 text-xs text-slate-500">
                      <span>שירות / פרויקט</span>
                      <span className="font-medium text-slate-700">{o.projectOrServiceName}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-lg font-black text-emerald-700">{formatCurrencyILS(Number(o.estimatedValue || 0))}</span>
                      <span className="text-xs text-slate-500">
                        {o.targetCloseDate ? new Date(o.targetCloseDate).toLocaleDateString('he-IL') : 'ללא תאריך יעד'}
                      </span>
                    </div>
                    <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                          <UserCircle2 className="h-5 w-5" />
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-slate-400">איש קשר</div>
                          <div className="text-sm font-semibold text-slate-800">{contactHint}</div>
                        </div>
                      </div>
                      <div className={cn('rounded-full px-2 py-1 text-[10px] font-bold', statusChip.cls)}>{statusChip.label}</div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <aside className="order-3 space-y-4 lg:order-3">
          <Card className="overflow-hidden rounded-[24px] border-0 bg-white shadow-[0_12px_36px_rgba(15,23,42,0.08)]">
            <CardContent className="space-y-4 p-6">
              <div className="flex flex-col items-center text-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 ring-4 ring-emerald-50">
                  <UserCircle2 className="h-12 w-12" />
                </div>
                <div className="mt-3 text-lg font-bold text-slate-900">{currentUser.name}</div>
                <div className="text-sm text-slate-500">{roleLabel(currentUser.role)}</div>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4 text-right">
                <div className="text-xs font-semibold text-slate-400">פרטי קשר</div>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500">טלפון</span>
                    <span className="font-medium text-slate-800">050-0000000</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500">מיקום</span>
                    <span className="font-medium text-slate-800">ישראל</span>
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-slate-500">אימייל</span>
                    <span className="max-w-[65%] break-all text-left font-medium text-slate-800">{currentUser.email}</span>
                  </div>
                </div>
              </div>
              <Button
                className="h-12 w-full rounded-2xl text-base font-semibold shadow-md"
                style={{ background: galit.primary }}
                disabled={saving}
                onClick={handleCreateQuoteFromPanel}
              >
                יצירת הצעה
              </Button>
            </CardContent>
          </Card>
        </aside>
      </div>

      <Modal open={quotePickOpen} onClose={() => setQuotePickOpen(false)} title="בחר הזדמנות להצעת מחיר" maxWidth="max-w-md">
        <div className="space-y-2">
          <p className="text-sm text-slate-500">נבחרה הזדמנות ליצירת הצעת מחיר:</p>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {filteredOpportunities.map((o) => (
              <button
                key={o.id}
                type="button"
                className="flex w-full items-center justify-between rounded-2xl border border-slate-100 bg-white px-4 py-3 text-right text-sm hover:bg-slate-50"
                onClick={() => {
                  setQuotePickOpen(false);
                  void createQuoteFromOpportunityFor(o);
                }}
              >
                <span className="font-semibold">{o.projectOrServiceName}</span>
                <span className="text-xs text-slate-500">{formatCurrencyILS(Number(o.estimatedValue || 0))}</span>
              </button>
            ))}
          </div>
        </div>
      </Modal>

      <Modal open={open} onClose={() => setOpen(false)} title="הזדמנות חדשה" maxWidth="max-w-xl">
        <div className="space-y-3">
          <select
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
            value={form.customerId}
            onChange={(e) => setForm((prev) => ({ ...prev, customerId: e.target.value }))}
          >
            <option value="">לקוח (אופציונלי)</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <Input value={form.projectOrServiceName} onChange={(e) => setForm((p) => ({ ...p, projectOrServiceName: e.target.value }))} placeholder="שם פרויקט / שירות" />
          <CurrencyInput
            value={form.estimatedValue}
            onChange={(v) => setForm((p) => ({ ...p, estimatedValue: v }))}
            placeholder="שווי משוער"
          />
          <Select value={form.pipelineStage} onChange={(v) => setForm((p) => ({ ...p, pipelineStage: v }))} options={OPPORTUNITY_STAGES} />
          <select
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
            value={form.assignedUserId}
            onChange={(e) => setForm((prev) => ({ ...prev, assignedUserId: e.target.value }))}
          >
            <option value="">משויך ל (אופציונלי)</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <Input type="date" value={form.targetCloseDate} onChange={(e) => setForm((p) => ({ ...p, targetCloseDate: e.target.value }))} placeholder="תאריך סגירה יעד" />
          <Textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} placeholder="הערות" />
          {error && <div className="rounded-2xl bg-red-50 px-4 py-2 text-xs text-red-700">{error}</div>}
          <Button className="w-full" style={{ background: galit.primary }} onClick={createOpportunity}>
            {saving ? 'שומר...' : 'שמור'}
          </Button>
        </div>
      </Modal>

      <Modal open={detailsOpen} onClose={() => setDetailsOpen(false)} title="פרטי הזדמנות" maxWidth="max-w-2xl">
        <div className="space-y-3">
          {detailsLoading ? (
            <div className="text-sm text-slate-500">טוען...</div>
          ) : (
            <>
              {(error || success) && (
                <div className={`rounded-2xl px-4 py-2 text-sm ${error ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'}`}>
                  {error || success}
                </div>
              )}
              <select
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
                value={form.customerId}
                onChange={(e) => setForm((prev) => ({ ...prev, customerId: e.target.value }))}
              >
                <option value="">לקוח (אופציונלי)</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <Input value={form.projectOrServiceName} onChange={(e) => setForm((p) => ({ ...p, projectOrServiceName: e.target.value }))} placeholder="שם פרויקט / שירות" />
              <CurrencyInput
                value={form.estimatedValue}
                onChange={(v) => setForm((p) => ({ ...p, estimatedValue: v }))}
                placeholder="שווי משוער"
              />
              <Select value={form.pipelineStage} onChange={(v) => setForm((p) => ({ ...p, pipelineStage: v }))} options={OPPORTUNITY_STAGES} />
              <Input type="date" value={form.targetCloseDate} onChange={(e) => setForm((p) => ({ ...p, targetCloseDate: e.target.value }))} placeholder="תאריך סגירה יעד" />
              <select
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
                value={form.assignedUserId}
                onChange={(e) => setForm((prev) => ({ ...prev, assignedUserId: e.target.value }))}
              >
                <option value="">משויך ל (אופציונלי)</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
              <Textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} placeholder="הערות" />

              <div className="flex flex-wrap gap-2">
                <Button style={{ background: galit.primary }} onClick={saveDetails} disabled={saving}>
                  {saving ? 'שומר...' : 'שמור שינויים'}
                </Button>
                <Button onClick={createQuoteFromOpportunity} disabled={saving} className="border bg-white text-slate-900">
                  הצעת מחיר חדשה
                </Button>
                <Button onClick={deleteOpportunity} disabled={saving} className="border bg-white text-red-700">
                  מחיקה
                </Button>
              </div>

              <div className="rounded-2xl border p-3">
                <div className="mb-2 font-semibold">הצעות מחיר</div>
                {Array.isArray((selected as any)?.quotes) && (selected as any).quotes.length > 0 ? (
                  <div className="space-y-2">
                    {(selected as any).quotes.map((q: any) => (
                      <div key={q.id} className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm">
                        <div className="font-medium">{q.quoteNumber || '—'}</div>
                        <div className="text-slate-500">{statusLabel(q.status)}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-slate-500">אין הצעות מחיר עדיין.</div>
                )}
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}

function ReportsPage({
  projects,
  customers,
  users,
  currentUser,
}: {
  projects: Project[];
  customers: Customer[];
  users: AppUser[];
  currentUser: AppUser;
}) {
  const [reports, setReports] = useState<Report[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Report | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState({
    title: '',
    projectId: '',
    customerId: '',
    reportType: 'OTHER',
    status: 'WAITING_DATA',
    createdById: '',
    reviewedById: '',
    reportDate: '',
    version: '1',
    internalNotes: '',
    clientNotes: '',
  });

  const REPORT_TYPE_LABELS: Record<string, string> = {
    RADIATION_REPORT: 'דוח קרינה',
    ACOUSTIC_REPORT: 'דוח אקוסטיקה / רעש',
    AIR_QUALITY_REPORT: 'דוח איכות אוויר',
    ASBESTOS_REPORT: 'דוח אסבסט',
    RADON_REPORT: 'דוח ראדון',
    ODOUR_REPORT: 'דוח ריח',
    SOIL_REPORT: 'דוח קרקע',
    LAB_REPORT: 'דוח מעבדה',
    OTHER: 'אחר',
  };
  const STATUS_LABELS: Record<string, string> = {
    WAITING_DATA: 'ממתין לנתונים',
    IN_WRITING: 'בכתיבה',
    IN_REVIEW: 'בבקרה',
    SENT: 'נשלח',
    CLOSED: 'נסגר',
  };

  useEffect(() => {
    let isMounted = true;
    apiFetch(apiUrl('/reports'), { authUser: currentUser })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        if (!isMounted || !Array.isArray(data)) return;
        setReports(data);
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [currentUser]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      title: '',
      projectId: '',
      customerId: '',
      reportType: 'OTHER',
      status: 'WAITING_DATA',
      createdById: currentUser.id,
      reviewedById: '',
      reportDate: '',
      version: '1',
      internalNotes: '',
      clientNotes: '',
    });
    setError('');
    setSuccess('');
    setOpen(true);
  };

  const openEdit = (r: Report) => {
    setEditing(r);
    setForm({
      title: r.title || '',
      projectId: r.projectId || '',
      customerId: r.customerId || '',
      reportType: r.reportType || 'OTHER',
      status: r.status || 'WAITING_DATA',
      createdById: r.createdById || currentUser.id,
      reviewedById: r.reviewedById || '',
      reportDate: r.reportDate ? new Date(r.reportDate).toLocaleDateString('en-CA') : '',
      version: String(r.version ?? 1),
      internalNotes: r.internalNotes || '',
      clientNotes: r.clientNotes || '',
    });
    setError('');
    setSuccess('');
    setOpen(true);
  };

  const save = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload: any = {
        title: form.title.trim(),
        projectId: form.projectId || null,
        customerId: form.customerId || null,
        reportType: form.reportType,
        status: form.status,
        createdById: form.createdById || currentUser.id,
        reviewedById: form.reviewedById || null,
        reportDate: form.reportDate ? new Date(form.reportDate).toISOString() : null,
        version: Number(form.version) || 1,
        internalNotes: form.internalNotes || null,
        clientNotes: form.clientNotes || null,
      };
      const url = editing ? `${getApiBaseUrl()}/reports/${editing.id}` : apiUrl('/reports');
      const res = await apiFetch(url, {
        method: editing ? 'PATCH' : 'POST',
        authUser: currentUser,
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      const saved = await res.json();
      setReports((prev) => (editing ? prev.map((x) => (x.id === saved.id ? saved : x)) : [saved, ...prev]));
      setSuccess('נשמר בהצלחה');
      setOpen(false);
    } catch {
      setError('שמירה נכשלה. נסה שוב.');
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (r: Report, status: string) => {
    try {
      const res = await apiFetch(apiUrl(`/reports/${r.id}`), {
        method: 'PATCH',
        authUser: currentUser,
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setReports((prev) => prev.map((x) => (x.id === r.id ? updated : x)));
    } catch {
      setError('עדכון סטטוס נכשל');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: galit.text }}>דוחות</h1>
          <p className="mt-1 text-slate-500">דוחות לפי פרויקט, לקוח וסטטוס</p>
        </div>
        <Button style={{ background: galit.primary }} onClick={openCreate}>דוח חדש</Button>
      </div>

      {(error || success) && (
        <div className={`rounded-2xl px-4 py-3 text-sm ${error ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'}`}>
          {error || success}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>כותרת</TableHead>
                <TableHead>פרויקט</TableHead>
                <TableHead>לקוח</TableHead>
                <TableHead>סוג</TableHead>
                <TableHead>נוצר ע״י</TableHead>
                <TableHead>סטטוס</TableHead>
                <TableHead>תאריך דוח</TableHead>
                <TableHead>פעולות</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.map((r) => (
                <TableRow key={r.id} className="hover:bg-slate-50">
                  <TableCell className="font-medium">{r.title}</TableCell>
                  <TableCell>{r.project?.projectNumber || r.project?.name || '-'}</TableCell>
                  <TableCell>{r.customer?.name || (r.customerId ? customers.find((c) => c.id === r.customerId)?.name : '-') || '-'}</TableCell>
                  <TableCell>{REPORT_TYPE_LABELS[r.reportType] || r.reportType}</TableCell>
                  <TableCell>{r.createdBy?.name || (r.createdById ? users.find((u) => u.id === r.createdById)?.name : '-') || '-'}</TableCell>
                  <TableCell>{STATUS_LABELS[r.status] || r.status}</TableCell>
                  <TableCell>{r.reportDate ? new Date(r.reportDate).toLocaleDateString('he-IL') : '-'}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      <button className="rounded-xl border px-3 py-1 text-xs hover:bg-slate-50" onClick={() => openEdit(r)}>עריכה</button>
                      <button className="rounded-xl border px-3 py-1 text-xs hover:bg-slate-50" onClick={() => setStatus(r, 'WAITING_DATA')}>ממתין</button>
                      <button className="rounded-xl border px-3 py-1 text-xs hover:bg-slate-50" onClick={() => setStatus(r, 'IN_WRITING')}>בכתיבה</button>
                      <button className="rounded-xl border px-3 py-1 text-xs hover:bg-slate-50" onClick={() => setStatus(r, 'IN_REVIEW')}>בבקרה</button>
                      <button className="rounded-xl border px-3 py-1 text-xs hover:bg-slate-50" onClick={() => setStatus(r, 'SENT')}>נשלח</button>
                      <button className="rounded-xl border px-3 py-1 text-xs hover:bg-slate-50" onClick={() => setStatus(r, 'CLOSED')}>נסגר</button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'עריכת דוח' : 'דוח חדש'} maxWidth="max-w-2xl">
        <div className="space-y-3">
          <Input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="כותרת" />
          <select className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm" value={form.projectId} onChange={(e) => setForm((p) => ({ ...p, projectId: e.target.value }))}>
            <option value="">פרויקט (אופציונלי)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.projectNumber ? `${p.projectNumber} - ${p.name}` : p.name}</option>
            ))}
          </select>
          <select className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm" value={form.customerId} onChange={(e) => setForm((p) => ({ ...p, customerId: e.target.value }))}>
            <option value="">לקוח (אופציונלי)</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <div>
            <div className="mb-1 text-xs text-slate-500">סוג דוח</div>
            <select
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
              value={form.reportType}
              onChange={(e) => setForm((p) => ({ ...p, reportType: e.target.value }))}
            >
              {Object.keys(REPORT_TYPE_LABELS).map((k) => (
                <option key={k} value={k}>
                  {REPORT_TYPE_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="mb-1 text-xs text-slate-500">סטטוס</div>
            <select
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
              value={form.status}
              onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
            >
              {Object.keys(STATUS_LABELS).map((k) => (
                <option key={k} value={k}>
                  {STATUS_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
          <select className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm" value={form.createdById} onChange={(e) => setForm((p) => ({ ...p, createdById: e.target.value }))}>
            <option value="">נוצר ע״י</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <select className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm" value={form.reviewedById} onChange={(e) => setForm((p) => ({ ...p, reviewedById: e.target.value }))}>
            <option value="">בודק (אופציונלי)</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <Input type="date" value={form.reportDate} onChange={(e) => setForm((p) => ({ ...p, reportDate: e.target.value }))} placeholder="תאריך דוח" />
          <Input value={form.version} onChange={(e) => setForm((p) => ({ ...p, version: e.target.value }))} placeholder="גרסה" />
          <Textarea value={form.internalNotes} onChange={(e) => setForm((p) => ({ ...p, internalNotes: e.target.value }))} placeholder="הערות פנימיות" />
          <Textarea value={form.clientNotes} onChange={(e) => setForm((p) => ({ ...p, clientNotes: e.target.value }))} placeholder="הערות ללקוח" />
          <Button style={{ background: galit.primary }} onClick={save} disabled={saving}>
            {saving ? 'שומר...' : 'שמור'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function DocumentsPage({
  projects,
  customers,
  reports,
  users,
  currentUser,
}: {
  projects: Project[];
  customers: Customer[];
  reports: Report[];
  users: AppUser[];
  currentUser: AppUser;
}) {
  const [docs, setDocs] = useState<Document[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Document | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState({
    name: '',
    documentType: 'OTHER',
    filePath: '',
    projectId: '',
    customerId: '',
    reportId: '',
    description: '',
  });
  const TYPES = ['CONTRACT', 'QUOTE', 'PLAN', 'PHOTO', 'REPORT', 'LAB_RESULT', 'CERTIFICATE', 'INVOICE', 'OTHER'];
  const TYPE_LABELS: Record<string, string> = {
    CONTRACT: 'חוזה',
    QUOTE: 'הצעת מחיר',
    PLAN: 'תכנית',
    PHOTO: 'תמונה',
    REPORT: 'דוח',
    LAB_RESULT: 'תוצאת מעבדה',
    CERTIFICATE: 'תעודה',
    INVOICE: 'חשבונית',
    OTHER: 'אחר',
  };

  const load = () =>
    apiFetch(apiUrl('/documents'), { authUser: currentUser })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        if (Array.isArray(data)) setDocs(data);
      })
      .catch(() => {});

  useEffect(() => {
    load();
  }, [currentUser]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', documentType: 'OTHER', filePath: '', projectId: '', customerId: '', reportId: '', description: '' });
    setError('');
    setSuccess('');
    setOpen(true);
  };

  const openEdit = (d: Document) => {
    setEditing(d);
    setForm({
      name: d.name,
      documentType: d.documentType,
      filePath: d.filePath,
      projectId: d.projectId || '',
      customerId: d.customerId || '',
      reportId: d.reportId || '',
      description: d.description || '',
    });
    setError('');
    setSuccess('');
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim() || !form.filePath.trim()) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload: any = {
        name: form.name.trim(),
        documentType: form.documentType,
        filePath: form.filePath.trim(),
        projectId: form.projectId || null,
        customerId: form.customerId || null,
        reportId: form.reportId || null,
        description: form.description || null,
      };
      const url = editing ? `${getApiBaseUrl()}/documents/${editing.id}` : apiUrl('/documents');
      const res = await apiFetch(url, {
        method: editing ? 'PATCH' : 'POST',
        authUser: currentUser,
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      const saved = await res.json();
      setDocs((prev) => (editing ? prev.map((x) => (x.id === saved.id ? saved : x)) : [saved, ...prev]));
      setSuccess('נשמר בהצלחה');
      setOpen(false);
    } catch {
      setError('שמירה נכשלה. נסה שוב.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: galit.text }}>מסמכים</h1>
          <p className="mt-1 text-slate-500">מסמכים לפי פרויקט/דוח (ללא העלאת קבצים בשלב זה)</p>
        </div>
        <Button style={{ background: galit.primary }} onClick={openCreate}>מסמך חדש</Button>
      </div>

      {(error || success) && (
        <div className={`rounded-2xl px-4 py-3 text-sm ${error ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'}`}>
          {error || success}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>שם</TableHead>
                <TableHead>פרויקט</TableHead>
                <TableHead>לקוח</TableHead>
                <TableHead>דוח</TableHead>
                <TableHead>סוג</TableHead>
                <TableHead>הועלה ע״י</TableHead>
                <TableHead>נוצר</TableHead>
                <TableHead>פעולות</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {docs.map((d) => (
                <TableRow key={d.id} className="hover:bg-slate-50">
                  <TableCell className="font-medium">{d.name}</TableCell>
                  <TableCell>{d.project?.projectNumber || d.project?.name || '-'}</TableCell>
                  <TableCell>{d.customer?.name || (d.customerId ? customers.find((c) => c.id === d.customerId)?.name : '-') || '-'}</TableCell>
                  <TableCell>{d.report?.title || '-'}</TableCell>
                  <TableCell>{TYPE_LABELS[d.documentType] || d.documentType}</TableCell>
                  <TableCell>{d.uploadedBy?.name || (d.uploadedById ? users.find((u) => u.id === d.uploadedById)?.name : '-') || '-'}</TableCell>
                  <TableCell>{d.createdAt ? new Date(d.createdAt).toLocaleDateString('he-IL') : '-'}</TableCell>
                  <TableCell>
                    <button className="rounded-xl border px-3 py-1 text-xs hover:bg-slate-50" onClick={() => openEdit(d)}>עריכה</button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'עריכת מסמך' : 'מסמך חדש'} maxWidth="max-w-2xl">
        <div className="space-y-3">
          <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="שם" />
          <div>
            <div className="mb-1 text-xs text-slate-500">סוג מסמך</div>
            <select
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
              value={form.documentType}
              onChange={(e) => setForm((p) => ({ ...p, documentType: e.target.value }))}
            >
              {TYPES.map((k) => (
                <option key={k} value={k}>
                  {TYPE_LABELS[k] || k}
                </option>
              ))}
            </select>
          </div>
          <Input value={form.filePath} onChange={(e) => setForm((p) => ({ ...p, filePath: e.target.value }))} placeholder="נתיב/קישור לקובץ (טקסט)" />
          <select className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm" value={form.projectId} onChange={(e) => setForm((p) => ({ ...p, projectId: e.target.value }))}>
            <option value="">פרויקט (אופציונלי)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.projectNumber ? `${p.projectNumber} - ${p.name}` : p.name}</option>
            ))}
          </select>
          <select className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm" value={form.customerId} onChange={(e) => setForm((p) => ({ ...p, customerId: e.target.value }))}>
            <option value="">לקוח (אופציונלי)</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm" value={form.reportId} onChange={(e) => setForm((p) => ({ ...p, reportId: e.target.value }))}>
            <option value="">דוח (אופציונלי)</option>
            {reports.map((r) => (
              <option key={r.id} value={r.id}>{r.title}</option>
            ))}
          </select>
          <Textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="תיאור" />
          <Button style={{ background: galit.primary }} onClick={save} disabled={saving}>
            {saving ? 'שומר...' : 'שמור'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function LabSamplesPage({
  projects,
  customers,
  users,
  currentUser,
}: {
  projects: Project[];
  customers: Customer[];
  users: AppUser[];
  currentUser: AppUser;
}) {
  const [samples, setSamples] = useState<LabSample[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<LabSample | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState({
    sampleNumber: '',
    projectId: '',
    customerId: '',
    sampleType: 'OTHER',
    sampleStatus: 'COLLECTED',
    collectedAt: '',
    receivedAt: '',
    analyzedAt: '',
    collectedById: '',
    locationDescription: '',
    testType: '',
    method: '',
    resultValue: '',
    resultUnit: '',
    resultStatus: 'PENDING',
    resultFilePath: '',
    notes: '',
  });

  const SAMPLE_TYPES = ['AIR', 'SURFACE', 'WATER', 'SOIL', 'RADON', 'ASBESTOS', 'MICROBIOLOGY', 'OTHER'];
  const SAMPLE_STATUSES = ['COLLECTED', 'RECEIVED', 'IN_ANALYSIS', 'COMPLETED', 'REPORTED'];
  const RESULT_STATUSES = ['PENDING', 'NORMAL', 'ABNORMAL'];

  useEffect(() => {
    let isMounted = true;
    apiFetch(apiUrl('/lab-samples'), { authUser: currentUser })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        if (!isMounted || !Array.isArray(data)) return;
        setSamples(data);
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [currentUser]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      sampleNumber: '',
      projectId: '',
      customerId: '',
      sampleType: 'OTHER',
      sampleStatus: 'COLLECTED',
      collectedAt: '',
      receivedAt: '',
      analyzedAt: '',
      collectedById: currentUser.id,
      locationDescription: '',
      testType: '',
      method: '',
      resultValue: '',
      resultUnit: '',
      resultStatus: 'PENDING',
      resultFilePath: '',
      notes: '',
    });
    setError('');
    setSuccess('');
    setOpen(true);
  };

  const openEdit = (s: LabSample) => {
    setEditing(s);
    setForm({
      sampleNumber: s.sampleNumber,
      projectId: s.projectId || '',
      customerId: s.customerId || '',
      sampleType: s.sampleType,
      sampleStatus: s.sampleStatus,
      collectedAt: s.collectedAt ? new Date(s.collectedAt).toLocaleDateString('en-CA') : '',
      receivedAt: s.receivedAt ? new Date(s.receivedAt).toLocaleDateString('en-CA') : '',
      analyzedAt: s.analyzedAt ? new Date(s.analyzedAt).toLocaleDateString('en-CA') : '',
      collectedById: s.collectedById || currentUser.id,
      locationDescription: s.locationDescription || '',
      testType: s.testType || '',
      method: s.method || '',
      resultValue: s.resultValue || '',
      resultUnit: s.resultUnit || '',
      resultStatus: s.resultStatus,
      resultFilePath: s.resultFilePath || '',
      notes: s.notes || '',
    });
    setError('');
    setSuccess('');
    setOpen(true);
  };

  const save = async () => {
    if (!form.sampleNumber.trim()) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload: any = {
        sampleNumber: form.sampleNumber.trim(),
        projectId: form.projectId || null,
        customerId: form.customerId || null,
        sampleType: form.sampleType,
        sampleStatus: form.sampleStatus,
        collectedAt: form.collectedAt ? new Date(form.collectedAt).toISOString() : null,
        receivedAt: form.receivedAt ? new Date(form.receivedAt).toISOString() : null,
        analyzedAt: form.analyzedAt ? new Date(form.analyzedAt).toISOString() : null,
        collectedById: form.collectedById || null,
        locationDescription: form.locationDescription || null,
        testType: form.testType || null,
        method: form.method || null,
        resultValue: form.resultValue || null,
        resultUnit: form.resultUnit || null,
        resultStatus: form.resultStatus,
        resultFilePath: form.resultFilePath || null,
        notes: form.notes || null,
      };
      const url = editing ? `${getApiBaseUrl()}/lab-samples/${editing.id}` : apiUrl('/lab-samples');
      const res = await apiFetch(url, {
        method: editing ? 'PATCH' : 'POST',
        authUser: currentUser,
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      const saved = await res.json();
      setSamples((prev) => (editing ? prev.map((x) => (x.id === saved.id ? saved : x)) : [saved, ...prev]));
      setSuccess('נשמר בהצלחה');
      setOpen(false);
    } catch {
      setError('שמירה נכשלה. נסה שוב.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: galit.text }}>מעבדה / דגימות</h1>
          <p className="mt-1 text-slate-500">ניהול דגימות, סטטוסים ותוצאות בסיסיות</p>
        </div>
        <Button style={{ background: galit.primary }} onClick={openCreate}>דגימה חדשה</Button>
      </div>

      {(error || success) && (
        <div className={`rounded-2xl px-4 py-3 text-sm ${error ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'}`}>
          {error || success}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>מספר דגימה</TableHead>
                <TableHead>פרויקט</TableHead>
                <TableHead>לקוח</TableHead>
                <TableHead>סוג</TableHead>
                <TableHead>סטטוס</TableHead>
                <TableHead>נאסף</TableHead>
                <TableHead>תוצאה</TableHead>
                <TableHead>פעולות</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {samples.map((s) => (
                <TableRow key={s.id} className="hover:bg-slate-50">
                  <TableCell className="font-medium">{s.sampleNumber}</TableCell>
                  <TableCell>{s.project?.projectNumber || s.project?.name || '-'}</TableCell>
                  <TableCell>{s.customer?.name || (s.customerId ? customers.find((c) => c.id === s.customerId)?.name : '-') || '-'}</TableCell>
                  <TableCell>{labSampleTypeLabel(s.sampleType)}</TableCell>
                  <TableCell>{labSampleStatusLabel(s.sampleStatus)}</TableCell>
                  <TableCell>{s.collectedAt ? new Date(s.collectedAt).toLocaleDateString('he-IL') : '-'}</TableCell>
                  <TableCell>{labSampleResultStatusLabel(s.resultStatus)}</TableCell>
                  <TableCell>
                    <button className="rounded-xl border px-3 py-1 text-xs hover:bg-slate-50" onClick={() => openEdit(s)}>עריכה</button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'עריכת דגימה' : 'דגימה חדשה'} maxWidth="max-w-2xl">
        <div className="space-y-3">
          <div>
            <div className="mb-1 text-xs text-slate-500">מספר דגימה</div>
            <Input value={form.sampleNumber} onChange={(e) => setForm((p) => ({ ...p, sampleNumber: e.target.value }))} placeholder="מספר דגימה" />
          </div>
          <select className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm" value={form.projectId} onChange={(e) => setForm((p) => ({ ...p, projectId: e.target.value }))}>
            <option value="">פרויקט (אופציונלי)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.projectNumber ? `${p.projectNumber} - ${p.name}` : p.name}</option>
            ))}
          </select>
          <select className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm" value={form.customerId} onChange={(e) => setForm((p) => ({ ...p, customerId: e.target.value }))}>
            <option value="">לקוח (אופציונלי)</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <div>
            <div className="mb-1 text-xs text-slate-500">סוג דגימה</div>
            <select
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
              value={form.sampleType}
              onChange={(e) => setForm((p) => ({ ...p, sampleType: e.target.value }))}
            >
              {SAMPLE_TYPES.map((opt) => (
                <option key={opt} value={opt}>
                  {labSampleTypeLabel(opt)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="mb-1 text-xs text-slate-500">סטטוס דגימה</div>
            <select
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
              value={form.sampleStatus}
              onChange={(e) => setForm((p) => ({ ...p, sampleStatus: e.target.value }))}
            >
              {SAMPLE_STATUSES.map((opt) => (
                <option key={opt} value={opt}>
                  {labSampleStatusLabel(opt)}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Input type="date" value={form.collectedAt} onChange={(e) => setForm((p) => ({ ...p, collectedAt: e.target.value }))} placeholder="נאסף" />
            <Input type="date" value={form.receivedAt} onChange={(e) => setForm((p) => ({ ...p, receivedAt: e.target.value }))} placeholder="התקבל" />
            <Input type="date" value={form.analyzedAt} onChange={(e) => setForm((p) => ({ ...p, analyzedAt: e.target.value }))} placeholder="נותח" />
          </div>
          <select className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm" value={form.collectedById} onChange={(e) => setForm((p) => ({ ...p, collectedById: e.target.value }))}>
            <option value="">נאסף ע״י (אופציונלי)</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <Input value={form.locationDescription} onChange={(e) => setForm((p) => ({ ...p, locationDescription: e.target.value }))} placeholder="תיאור מיקום" />
          <Input value={form.testType} onChange={(e) => setForm((p) => ({ ...p, testType: e.target.value }))} placeholder="סוג בדיקה" />
          <Input value={form.method} onChange={(e) => setForm((p) => ({ ...p, method: e.target.value }))} placeholder="שיטה" />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Input value={form.resultValue} onChange={(e) => setForm((p) => ({ ...p, resultValue: e.target.value }))} placeholder="ערך תוצאה" />
            <Input value={form.resultUnit} onChange={(e) => setForm((p) => ({ ...p, resultUnit: e.target.value }))} placeholder="יחידה" />
            <div className="md:col-span-1">
              <div className="mb-1 text-xs text-slate-500">סטטוס תוצאה</div>
              <select
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
                value={form.resultStatus}
                onChange={(e) => setForm((p) => ({ ...p, resultStatus: e.target.value }))}
              >
                {RESULT_STATUSES.map((opt) => (
                  <option key={opt} value={opt}>
                    {labSampleResultStatusLabel(opt)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Input value={form.resultFilePath} onChange={(e) => setForm((p) => ({ ...p, resultFilePath: e.target.value }))} placeholder="נתיב קובץ תוצאה (אופציונלי)" />
          <Textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} placeholder="הערות" />
          <Button style={{ background: galit.primary }} onClick={save} disabled={saving}>
            {saving ? 'שומר...' : 'שמור'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function SettingsPage({
  currentUser,
  customers,
  leads,
  projects,
  quotes,
  users,
  onReloadCustomers,
  onReloadLeads,
  onReloadProjects,
  onReloadQuotes,
  onReloadCustomerClassifications,
  onReloadUsers,
  customerClassifications,
  customerTypeLabelMap,
  settingsJumpTab,
  onSettingsJumpConsumed,
}: {
  currentUser: AppUser;
  customers: Customer[];
  leads: Lead[];
  projects: Project[];
  quotes: Quote[];
  users: AppUser[];
  onReloadCustomers: () => Promise<void>;
  onReloadLeads: () => Promise<void>;
  onReloadProjects: () => Promise<void>;
  onReloadQuotes: () => Promise<void>;
  onReloadCustomerClassifications: () => Promise<void>;
  onReloadUsers?: () => Promise<void>;
  customerClassifications: CustomerClassificationDto[];
  customerTypeLabelMap: Record<string, string>;
  settingsJumpTab?: SettingsToolbarJumpTab | null;
  onSettingsJumpConsumed?: () => void;
}) {
  const canManageUsersEffective = currentUser.role === 'admin' || currentUser.role === 'manager' || currentUser.canManageUsers;
  const canManagePermissionsEffective = currentUser.role === 'admin' || currentUser.canManagePermissions;
  const canDataImport =
    canAccess(currentUser.role, 'customers') ||
    canAccess(currentUser.role, 'leads') ||
    canAccess(currentUser.role, 'quotes') ||
    canAccess(currentUser.role, 'projects') ||
    canAccess(currentUser.role, 'reports') ||
    currentUser.role === 'admin' ||
    currentUser.role === 'manager';

  const canManageCustomerClassifications = currentUser.role === 'admin' || currentUser.role === 'manager';
  /** ייבוא Followup מרוכז — רק מנהל מערכת (ה-API דורש ADMIN) */
  const canFollowupImport = isAdminRole(currentUser.role);
  /** רק אדמין/מנהל — כלי החלפת עובד / אחריות (לא משתמש עם canManageUsers בלבד) */
  const canEmployeeHandoff = currentUser.role === 'admin' || currentUser.role === 'manager';
  const canManageQuoteTemplates = currentUser.role === 'admin' || currentUser.role === 'manager';

  type SettingsTabKey =
    | 'employees'
    | 'employeeHandoff'
    | 'permissions'
    | 'customerClassification'
    | 'services'
    | 'statuses'
    | 'targets'
    | 'templates'
    | 'system'
    | 'catalog'
    | 'import'
    | 'followupImport';

  const defaultTab: SettingsTabKey = canManageUsersEffective
    ? 'employees'
    : canManagePermissionsEffective
      ? 'permissions'
      : 'services';

  const [tab, setTab] = useState<SettingsTabKey>(defaultTab);

  const tabs: Array<{ key: SettingsTabKey; label: string; enabled: boolean }> = [
    { key: 'employees', label: 'עובדים', enabled: canManageUsersEffective },
    { key: 'employeeHandoff', label: 'החלפת עובד / אחריות', enabled: canEmployeeHandoff },
    { key: 'permissions', label: 'תפקידים והרשאות', enabled: canManagePermissionsEffective },
    { key: 'customerClassification', label: 'סיווגי לקוחות', enabled: canManageCustomerClassifications },
    { key: 'import', label: 'ייבוא נתונים', enabled: canDataImport },
    { key: 'followupImport', label: 'ייבוא Followup', enabled: canFollowupImport },
    { key: 'services', label: 'שירותים', enabled: true },
    { key: 'statuses', label: 'סטטוסים', enabled: true },
    { key: 'targets', label: 'יעדים', enabled: true },
    { key: 'catalog', label: 'פריטים / מחירון', enabled: true },
    { key: 'templates', label: 'תבניות הצעות מחיר', enabled: true },
    { key: 'system', label: 'מערכת', enabled: true },
  ];

  const enabledTabs = tabs.filter((t) => t.enabled);

  useEffect(() => {
    if (enabledTabs.some((t) => t.key === tab)) return;
    setTab(enabledTabs[0]?.key ?? 'services');
  }, [
    canManageUsersEffective,
    canEmployeeHandoff,
    canManagePermissionsEffective,
    canDataImport,
    canFollowupImport,
    canManageCustomerClassifications,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!settingsJumpTab) return;
    const row = tabs.find((t) => t.key === settingsJumpTab);
    if (row?.enabled) setTab(settingsJumpTab as SettingsTabKey);
    onSettingsJumpConsumed?.();
  }, [settingsJumpTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Employees
  const [employees, setEmployees] = useState<any[]>([]);
  const [empError, setEmpError] = useState('');
  const [empLoading, setEmpLoading] = useState(false);
  const [empModalOpen, setEmpModalOpen] = useState(false);
  const [empEditing, setEmpEditing] = useState<any | null>(null);
  const [empForm, setEmpForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'SALES',
    status: 'ACTIVE',
    phone: '',
    serviceDepartments: [] as string[],
    canViewFinance: false,
    canEditFinance: false,
    canDeleteCustomers: false,
    canDeleteLeads: false,
    canManageUsers: false,
    canManagePermissions: false,
    canViewAllRecords: false,
  });

  const [transferFromId, setTransferFromId] = useState('');
  const [transferToId, setTransferToId] = useState('');
  const [transferOpts, setTransferOpts] = useState({
    leads: true,
    customers: true,
    tasks: true,
    projects: true,
    quotes: true,
  });
  const [transferBusy, setTransferBusy] = useState(false);
  const [copyPermFromId, setCopyPermFromId] = useState('');
  const [copyPermToId, setCopyPermToId] = useState('');
  const [copyPermBusy, setCopyPermBusy] = useState(false);
  const [inactiveMarkId, setInactiveMarkId] = useState('');
  const [inactiveBusy, setInactiveBusy] = useState(false);
  const [handoffError, setHandoffError] = useState('');

  const [qtList, setQtList] = useState<any[]>([]);
  const [qtLoading, setQtLoading] = useState(false);
  const [qtError, setQtError] = useState('');
  const [qtModalOpen, setQtModalOpen] = useState(false);
  const [qtEditing, setQtEditing] = useState<any | null>(null);
  const [qtForm, setQtForm] = useState({
    name: '',
    serviceType: 'קרינה',
    isActive: true,
    introHtml: '',
    bodyHtml: '',
    closingHtml: '',
    termsHtml: '',
    variablesHelp: QUOTE_TEMPLATE_VARIABLES_HELP,
    defaultLineItemsJson: '[{"name":"שירות לדוגמה","quantity":1,"unitPrice":1000}]',
  });

  const loadQuoteTemplates = async () => {
    setQtLoading(true);
    setQtError('');
    try {
      const res = await apiFetch(apiUrl('/quote-templates'), { authUser: currentUser });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setQtList(Array.isArray(data) ? data : []);
    } catch {
      setQtError('טעינת תבניות נכשלה');
    } finally {
      setQtLoading(false);
    }
  };

  useEffect(() => {
    if (tab !== 'templates') return;
    void loadQuoteTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, currentUser.id]);

  const employeesActiveOnly = useMemo(
    () => (employees as any[]).filter((e) => (e.status || '').toString().toUpperCase() === 'ACTIVE'),
    [employees],
  );

  const SERVICE_DEPARTMENT_OPTIONS = [
    'אקוסטיקה / רעש',
    'אסבסט',
    'קרינה',
    'איכות אוויר',
    'ראדון',
    'ריח',
    'קרקע',
    'אחר',
  ];

  const employeeRoleLabel = (role: string) => {
    const map: Record<string, string> = {
      ADMIN: 'מנהל מערכת',
      MANAGER: 'מנהל',
      SALES: 'מכירות',
      TECHNICIAN: 'טכנאי',
      BILLING: 'הנהלת חשבונות',
      EXPERT: 'מומחה',
    };
    const key = (role || '').toString().toUpperCase();
    return map[key] || role || '-';
  };

  const employeeStatusLabel = (status: string) => {
    const map: Record<string, string> = {
      ACTIVE: 'פעיל',
      INACTIVE: 'לא פעיל',
    };
    const key = (status || '').toString().toUpperCase();
    return map[key] || status || '-';
  };

  const employeeServiceDepartmentLabel = (dept: string) => {
    const key = (dept || '').toString().trim().toUpperCase();
    const map: Record<string, string> = {
      RADON: 'ראדון',
      ASBESTOS: 'אסבסט',
      RADIATION: 'קרינה',
      AIR_QUALITY: 'איכות אוויר',
      ACOUSTICS: 'אקוסטיקה / רעש',
      NOISE: 'אקוסטיקה / רעש',
      ODOR: 'ריח',
      SOIL: 'קרקע',
      LAB: 'מעבדה',
      GREEN_BUILDING: 'בנייה ירוקה',
    };
    return map[key] || dept || '-';
  };

  const loadEmployees = async () => {
    setEmpLoading(true);
    setEmpError('');
    try {
      const res = await apiFetch(apiUrl('/users'), { authUser: currentUser });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setEmployees(Array.isArray(data) ? data : []);
    } catch {
      setEmpError('טעינת עובדים נכשלה. נסה שוב מאוחר יותר.');
    } finally {
      setEmpLoading(false);
    }
  };

  useEffect(() => {
    if (!currentUser) return;
    const needEmployees =
      canManageUsersEffective || currentUser.role === 'admin' || currentUser.role === 'manager';
    if (!needEmployees) return;
    loadEmployees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id, currentUser.role, canManageUsersEffective]);

  const openCreateEmp = () => {
    if (!canManageUsersEffective) return;
    setEmpEditing(null);
    setEmpForm({
      name: '',
      email: '',
      password: '',
      role: 'SALES',
      status: 'ACTIVE',
      phone: '',
      serviceDepartments: [],
      canViewFinance: false,
      canEditFinance: false,
      canDeleteCustomers: false,
      canDeleteLeads: false,
      canManageUsers: false,
      canManagePermissions: false,
      canViewAllRecords: false,
    });
    setEmpModalOpen(true);
  };
  const openEditEmp = (u: any) => {
    if (!canManageUsersEffective) return;
    setEmpEditing(u);
    setEmpForm({
      name: u.name || '',
      email: u.email || '',
      password: '',
      role: (u.role || 'SALES').toString(),
      status: (u.status || 'ACTIVE').toString(),
      phone: u.phone || '',
      serviceDepartments: Array.isArray(u.serviceDepartments) ? u.serviceDepartments : u.department ? [u.department] : [],
      canViewFinance: !!u.canViewFinance,
      canEditFinance: !!u.canEditFinance,
      canDeleteCustomers: !!u.canDeleteCustomers,
      canDeleteLeads: !!u.canDeleteLeads,
      canManageUsers: !!u.canManageUsers,
      canManagePermissions: !!u.canManagePermissions,
      canViewAllRecords: !!u.canViewAllRecords,
    });
    setEmpModalOpen(true);
  };

  const saveEmp = async () => {
    if (!empForm.name.trim() || !empForm.email.trim()) {
      setEmpError('שם ואימייל הם שדות חובה.');
      return;
    }

    const normalizedEmail = normalizeEmail(empForm.email);
    if (!validateEmail(normalizedEmail)) {
      setEmpError('אימייל לא תקין');
      return;
    }

    const emailExists = employees.some(
      (u) => normalizeEmail(u.email) === normalizedEmail && (!empEditing || u.id !== empEditing.id),
    );
    if (emailExists) {
      setEmpError('אימייל זה כבר קיים במערכת');
      return;
    }

    try {
      const payloadDepartments = Array.isArray(empForm.serviceDepartments) ? empForm.serviceDepartments : [];
      const payload: any = {
        name: empForm.name.trim(),
        email: normalizedEmail,
        role: empForm.role,
        status: empForm.status,
        phone: empForm.phone || null,
        serviceDepartments: payloadDepartments,
        // legacy display-only field
        department: payloadDepartments[0] ?? null,
        canViewFinance: !!empForm.canViewFinance,
        canEditFinance: !!empForm.canEditFinance,
        canDeleteCustomers: !!empForm.canDeleteCustomers,
        canDeleteLeads: !!empForm.canDeleteLeads,
        canManageUsers: !!empForm.canManageUsers,
        canManagePermissions: !!empForm.canManagePermissions,
        canViewAllRecords: !!empForm.canViewAllRecords,
      };
      if (!empEditing) payload.password = empForm.password || '1234';
      const url = empEditing ? `${getApiBaseUrl()}/users/${empEditing.id}` : apiUrl('/users');
      const res = await apiFetch(url, {
        method: empEditing ? 'PATCH' : 'POST',
        authUser: currentUser,
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      setEmpModalOpen(false);
      await loadEmployees();
      await onReloadUsers?.();
    } catch {
      setEmpError('שמירת עובד נכשלה. בדוק שדות ונסה שוב.');
    }
  };

  const copyPermissionsHandoff = async () => {
    if (!copyPermFromId || !copyPermToId || copyPermFromId === copyPermToId) {
      setHandoffError('יש לבחור עובד מקור ויעד שונים.');
      return;
    }
    setHandoffError('');
    setCopyPermBusy(true);
    try {
      const res = await apiFetch(apiUrl('/users/copy-permissions'), {
        method: 'POST',
        authUser: currentUser,
        body: JSON.stringify({ fromUserId: copyPermFromId, toUserId: copyPermToId }),
      });
      if (!res.ok) throw new Error(await res.text());
      await loadEmployees();
      await onReloadUsers?.();
      setSettingsMsg('ההרשאות הועתקו לעובד היעד בהצלחה.');
      window.setTimeout(() => setSettingsMsg(''), 4000);
    } catch {
      setHandoffError('העתקת הרשאות נכשלה.');
    } finally {
      setCopyPermBusy(false);
    }
  };

  const runTransferData = async () => {
    if (!transferFromId || !transferToId || transferFromId === transferToId) {
      setHandoffError('יש לבחור עובד מקור ויעד שונים.');
      return;
    }
    const anyChecked = Object.values(transferOpts).some(Boolean);
    if (!anyChecked) {
      setHandoffError('סמן לפחות סוג נתון אחד להעברה.');
      return;
    }
    setTransferBusy(true);
    setHandoffError('');
    try {
      const res = await apiFetch(apiUrl('/users/transfer-data'), {
        method: 'POST',
        authUser: currentUser,
        body: JSON.stringify({
          fromUserId: transferFromId,
          toUserId: transferToId,
          ...transferOpts,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setSettingsMsg(`העברת אחריות הושלמה: ${JSON.stringify(data.counts || {})}`);
      window.setTimeout(() => setSettingsMsg(''), 5000);
      await onReloadUsers?.();
    } catch {
      setHandoffError('העברת אחריות נכשלה.');
    } finally {
      setTransferBusy(false);
    }
  };

  const markEmployeeInactiveHandoff = async () => {
    if (!inactiveMarkId) {
      setHandoffError('בחר עובד לסימון.');
      return;
    }
    const u = employees.find((e: any) => e.id === inactiveMarkId);
    if (!u) return;
    if ((u.status || '').toString().toUpperCase() === 'INACTIVE') {
      setHandoffError('העובד כבר מסומן כלא פעיל.');
      return;
    }
    setHandoffError('');
    setInactiveBusy(true);
    try {
      const res = await apiFetch(apiUrl(`/users/${inactiveMarkId}`), {
        method: 'PATCH',
        authUser: currentUser,
        body: JSON.stringify({ status: 'INACTIVE' }),
      });
      if (!res.ok) throw new Error();
      setInactiveMarkId('');
      await loadEmployees();
      await onReloadUsers?.();
      setSettingsMsg('העובד סומן כלא פעיל ולא יוכל להתחבר.');
      window.setTimeout(() => setSettingsMsg(''), 4000);
    } catch {
      setHandoffError('עדכון סטטוס נכשל.');
    } finally {
      setInactiveBusy(false);
    }
  };

  const toggleActive = async (u: any) => {
    try {
      const next = u.status === 'INACTIVE' ? 'ACTIVE' : 'INACTIVE';
      const res = await apiFetch(apiUrl(`/users/${u.id}`), {
        method: 'PATCH',
        authUser: currentUser,
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error();
      await loadEmployees();
      await onReloadUsers?.();
    } catch {
      setEmpError('עדכון סטטוס עובד נכשל.');
    }
  };

  // Settings storage
  const [targets, setTargets] = useState({ monthlyRevenueTarget: 450000, defaultTeamQuota: 0 });
  const [system, setSystem] = useState({ companyName: 'גלית CRM', logoPath: '/logo.png', mainPhone: '', mainEmail: '', theme: 'default' });
  const [services, setServices] = useState<Array<{ category: string; subtypes: string[] }>>([
    { category: 'קרינה', subtypes: [] },
    { category: 'אקוסטיקה / רעש', subtypes: [] },
    { category: 'איכות אוויר', subtypes: [] },
    { category: 'אסבסט', subtypes: [] },
    { category: 'ראדון', subtypes: [] },
    { category: 'ריח', subtypes: [] },
    { category: 'קרקע', subtypes: [] },
    { category: 'מעבדה', subtypes: [] },
  ]);
  const [settingsMsg, setSettingsMsg] = useState('');
  const [clsNewLabel, setClsNewLabel] = useState('');
  const [clsSaving, setClsSaving] = useState(false);
  const [clsErr, setClsErr] = useState('');

  const addCustomerClassificationInSettings = async () => {
    const label = clsNewLabel.trim();
    if (!label) {
      setClsErr('נא להזין שם לסיווג');
      return;
    }
    setClsSaving(true);
    setClsErr('');
    try {
      const res = await apiFetch(apiUrl('/customer-classifications'), {
        method: 'POST',
        authUser: currentUser,
        body: JSON.stringify({ labelHe: label }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({} as { message?: string }));
        throw new Error((err as { message?: string }).message || 'הוספת סיווג נכשלה');
      }
      setClsNewLabel('');
      await onReloadCustomerClassifications();
      setSettingsMsg('הסיווג נוסף. הוא יופיע מיד בטפסי לקוח, ברשימות ובדשבורד.');
      window.setTimeout(() => setSettingsMsg(''), 4500);
    } catch (e: unknown) {
      setClsErr(e instanceof Error ? e.message : 'הוספת סיווג נכשלה');
    } finally {
      setClsSaving(false);
    }
  };

  // Catalog
  const [catalog, setCatalog] = useState<any[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [catalogModalOpen, setCatalogModalOpen] = useState(false);
  const [catalogEditing, setCatalogEditing] = useState<any | null>(null);
  const [catalogForm, setCatalogForm] = useState({
    itemCode: '',
    name: '',
    description: '',
    serviceCategory: '',
    serviceSubType: '',
    basePrice: '0',
    billingUnit: 'יחידה',
    vatPercent: '17',
    isActive: true,
    requiresQuantity: true,
    requiresSiteVisit: false,
    requiresReport: false,
    notes: '',
  });

  const loadSetting = async (key: string) => {
    const res = await apiFetch(apiUrl(`/settings/${key}`), { authUser: currentUser });
    if (!res.ok) return null;
    return res.json();
  };
  const saveSetting = async (key: string, value: any) => {
    const res = await apiFetch(apiUrl(`/settings/${key}`), {
      method: 'PATCH',
          authUser: currentUser,
      body: JSON.stringify({ value }),
    });
    if (!res.ok) throw new Error();
  };

  useEffect(() => {
    // load targets/system/services if exist
    Promise.all([loadSetting('targets'), loadSetting('system'), loadSetting('services')]).then(([t, s, sv]) => {
      if (t?.value) setTargets((prev) => ({ ...prev, ...(t.value as any) }));
      if (s?.value) setSystem((prev) => ({ ...prev, ...(s.value as any) }));
      if (sv?.value) setServices(sv.value as any);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id, currentUser.role]);

  const loadCatalog = async () => {
    setCatalogLoading(true);
    setCatalogError('');
    try {
      const res = await apiFetch(apiUrl('/quote-item-catalog'), { authUser: currentUser });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setCatalog(Array.isArray(data) ? data : []);
    } catch {
      setCatalogError('טעינת מחירון נכשלה.');
    } finally {
      setCatalogLoading(false);
    }
  };

  useEffect(() => {
    loadCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id, currentUser.role]);

  const openNewCatalog = () => {
    setCatalogEditing(null);
    setCatalogForm({
      itemCode: '',
      name: '',
      description: '',
      serviceCategory: '',
      serviceSubType: '',
      basePrice: '0',
      billingUnit: 'יחידה',
      vatPercent: '17',
      isActive: true,
      requiresQuantity: true,
      requiresSiteVisit: false,
      requiresReport: false,
      notes: '',
    });
    setCatalogModalOpen(true);
  };

  const openEditCatalog = (it: any) => {
    setCatalogEditing(it);
    setCatalogForm({
      itemCode: it.itemCode || '',
      name: it.name || '',
      description: it.description || '',
      serviceCategory: it.serviceCategory || '',
      serviceSubType: it.serviceSubType || '',
      basePrice: String(it.basePrice ?? 0),
      billingUnit: it.billingUnit || 'יחידה',
      vatPercent: String(it.vatPercent ?? 17),
      isActive: it.isActive !== false,
      requiresQuantity: it.requiresQuantity !== false,
      requiresSiteVisit: !!it.requiresSiteVisit,
      requiresReport: !!it.requiresReport,
      notes: it.notes || '',
    });
    setCatalogModalOpen(true);
  };

  const saveCatalogItem = async () => {
    setCatalogError('');
    try {
      if (!catalogForm.itemCode.trim() || !catalogForm.name.trim()) {
        setCatalogError('קוד פריט ושם פריט הם שדות חובה.');
        return;
      }
      const payload: any = {
        itemCode: catalogForm.itemCode.trim(),
        name: catalogForm.name.trim(),
        description: catalogForm.description || null,
        serviceCategory: catalogForm.serviceCategory || null,
        serviceSubType: catalogForm.serviceSubType || null,
        basePrice: Number(catalogForm.basePrice) || 0,
        billingUnit: catalogForm.billingUnit || 'יחידה',
        vatPercent: Number(catalogForm.vatPercent) || 0,
        isActive: !!catalogForm.isActive,
        requiresQuantity: !!catalogForm.requiresQuantity,
        requiresSiteVisit: !!catalogForm.requiresSiteVisit,
        requiresReport: !!catalogForm.requiresReport,
        notes: catalogForm.notes || null,
      };
      const url = catalogEditing ? `${getApiBaseUrl()}/quote-item-catalog/${catalogEditing.id}` : apiUrl('/quote-item-catalog');
      const res = await apiFetch(url, {
        method: catalogEditing ? 'PATCH' : 'POST',
        authUser: currentUser,
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      setCatalogModalOpen(false);
      await loadCatalog();
      setSettingsMsg('הפריט נשמר בהצלחה');
      window.setTimeout(() => setSettingsMsg(''), 2000);
    } catch {
      setCatalogError('שמירת פריט נכשלה.');
    }
  };

  const toggleCatalogActive = async (it: any) => {
    try {
      const res = await apiFetch(apiUrl(`/quote-item-catalog/${it.id}`), {
        method: 'PATCH',
        authUser: currentUser,
        body: JSON.stringify({ isActive: !it.isActive }),
      });
      if (!res.ok) throw new Error();
      await loadCatalog();
    } catch {
      setCatalogError('עדכון פריט נכשל.');
    }
  };

  const permissionsMatrix: Array<{ role: string; modules: string[] }> = [
    { role: 'ADMIN', modules: ['לוח בקרה', 'לידים', 'לקוחות', 'הצעות מחיר', 'הזדמנויות', 'פרויקטים', 'דוחות', 'מסמכים', 'מעבדה', 'משימות', 'יומן שטח', 'הגדרות', 'משתמשים'] },
    { role: 'MANAGER', modules: ['לוח בקרה', 'לידים', 'לקוחות', 'הצעות מחיר', 'הזדמנויות', 'פרויקטים', 'דוחות', 'מסמכים', 'מעבדה', 'משימות', 'יומן שטח', 'הגדרות'] },
    { role: 'SALES', modules: ['לידים', 'לקוחות', 'הצעות מחיר', 'משימות'] },
    { role: 'TECHNICIAN', modules: ['פרויקטים (משויכים)', 'יומן שטח', 'משימות', 'מעבדה'] },
    { role: 'REPORT_WRITER', modules: ['דוחות', 'פרויקטים (כתיבה)'] },
    { role: 'LAB', modules: ['מעבדה / דגימות'] },
    { role: 'FINANCE', modules: ['הצעות מחיר', 'מסמכים (חשבוניות)'] },
  ];

  // Detailed permission display based on backend @Roles per controller.
  // Note: UI-only for now; backend enforcement is still role-based (no dynamic ACL yet).
  const rolePermissionDetails = (role: string) => {
    const r = (role || '').toString().toUpperCase();

    const hasLeads = ['ADMIN', 'MANAGER', 'SALES'].includes(r);
    const hasCustomers = ['ADMIN', 'MANAGER', 'SALES'].includes(r);
    const hasQuotes = ['ADMIN', 'MANAGER', 'SALES'].includes(r);
    const hasReports = ['ADMIN', 'MANAGER'].includes(r);
    const canManageEmployees = ['ADMIN', 'MANAGER'].includes(r);
    const canManagePermissions = ['ADMIN', 'MANAGER'].includes(r);

    const scopeLabel = (() => {
      if (r === 'ADMIN' || r === 'MANAGER') return 'כל המערכת';
      if (r === 'TECHNICIAN') return 'פרויקטים/משימות/יומן שטח – רק משויכים';
      if (r === 'SALES') return 'משימות – רק משויכות; שאר המודולים – כל המערכת';
      return 'לפי הרשאות תפקיד';
    })();

    return {
      leads: {
        view: hasLeads,
        create: hasLeads,
        edit: hasLeads,
        delete: hasLeads,
      },
      customers: {
        view: hasCustomers,
        delete: hasCustomers,
      },
      quotes: {
        view: hasQuotes,
      },
      funds: {
        view: hasQuotes,
        edit: hasQuotes,
      },
      reports: {
        view: hasReports,
      },
      employees: {
        manage: canManageEmployees,
      },
      permissions: {
        manage: canManagePermissions,
      },
      scopeLabel,
    };
  };

  const leadStatuses = ['NEW', 'FU_1', 'FU_2', 'QUOTE_SENT', 'WON', 'LOST', 'NOT_RELEVANT'];
  const projectStatuses = ['NEW', 'WAITING_QUOTE', 'WAITING_APPROVAL', 'SCHEDULED', 'ON_THE_WAY', 'FIELD_WORK_DONE', 'WAITING_DATA', 'REPORT_WRITING', 'SENT_TO_CLIENT', 'CLOSED', 'POSTPONED', 'CANCELLED'];
  const taskStatuses = ['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED'];
  const quoteStatuses = ['DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'EXPIRED'];
  const reportStatuses = ['WAITING_DATA', 'IN_WRITING', 'IN_REVIEW', 'SENT', 'CLOSED'];
  const sampleStatuses = ['COLLECTED', 'RECEIVED', 'IN_ANALYSIS', 'COMPLETED', 'REPORTED'];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold" style={{ color: galit.text }}>הגדרות</h1>
        <p className="mt-1 text-slate-500">ניהול עובדים, יעדים ותצורת מערכת</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {enabledTabs.map((t) => (
          <button
            key={t.key}
            className={cn('rounded-2xl px-4 py-2 text-sm font-semibold', tab === t.key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200')}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {empError && <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{empError}</div>}
      {catalogError && <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{catalogError}</div>}
      {settingsMsg && <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{settingsMsg}</div>}

      {tab === 'import' && canDataImport && (
        <DataImportWizard
          currentUserRole={currentUser.role}
          getAuthHeaders={() => authHeaders(currentUser)}
          customers={customers}
          leads={leads.map((l) => ({
            id: l.id,
            name: l.fullName || l.name,
            phone: l.phone || '',
            email: l.email,
            importLegacyId: l.importLegacyId,
          }))}
          projects={projects.map((p) => ({
            id: p.id,
            name: p.name,
            client: p.client,
            importLegacyId: p.importLegacyId,
          }))}
          quotes={quotes}
          users={users.map((u) => ({ id: u.id, email: u.email, name: u.name }))}
          currentUserId={currentUser.id}
          customerClassifications={customerClassifications}
          customerTypeLabelMap={customerTypeLabelMap}
          onReloadCustomers={onReloadCustomers}
          onReloadLeads={onReloadLeads}
          onReloadProjects={onReloadProjects}
          onReloadQuotes={onReloadQuotes}
          onMessage={(msg) => {
            setSettingsMsg(msg);
            window.setTimeout(() => setSettingsMsg(''), 4000);
          }}
        />
      )}

      {tab === 'followupImport' && canFollowupImport && (
        <FollowupImportPanel
          currentUser={{ id: currentUser.id, role: currentUser.role }}
          onReloadCustomers={onReloadCustomers}
          onReloadQuotes={onReloadQuotes}
          onMessage={(msg) => {
            setSettingsMsg(msg);
            window.setTimeout(() => setSettingsMsg(''), 6000);
          }}
        />
      )}

      {tab === 'customerClassification' && canManageCustomerClassifications && (
        <Card>
          <CardHeader>
            <CardTitle>ניהול סיווגי לקוחות</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-slate-600">
              הסיווגים נשמרים בשרת (טבלת <span className="font-mono text-xs">CustomerClassification</span>).
              רק מנהל מערכת או מנהל יכולים להוסיף סיווג חדש כאן. משתמשים אחרים יכולים רק לבחור מתוך הרשימה בטופסי לקוח.
            </p>
            <div className="overflow-x-auto rounded-2xl border border-slate-100">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>שם בעברית</TableHead>
                    <TableHead>קוד (מערכת)</TableHead>
                    <TableHead>סדר</TableHead>
                    <TableHead>אופי</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...customerClassifications]
                    .sort((a, b) => a.sortOrder - b.sortOrder || a.labelHe.localeCompare(b.labelHe, 'he'))
                    .map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.labelHe}</TableCell>
                        <TableCell className="font-mono text-xs text-slate-600">{c.code}</TableCell>
                        <TableCell>{c.sortOrder}</TableCell>
                        <TableCell>{c.isPreset ? 'ברירת מחדל' : 'מותאם'}</TableCell>
                      </TableRow>
                    ))}
                  {customerClassifications.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-slate-500">
                        טוען סיווגים…
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
              <div className="mb-2 text-sm font-semibold text-slate-800">הוספת סיווג חדש</div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1">
                  <Input
                    placeholder="שם הסיווג בעברית (למשל: אדריכלים)"
                    value={clsNewLabel}
                    onChange={(e) => setClsNewLabel(e.target.value)}
                    dir="rtl"
                  />
                </div>
                <Button
                  type="button"
                  style={{ background: galit.primary }}
                  disabled={clsSaving}
                  onClick={() => void addCustomerClassificationInSettings()}
                >
                  {clsSaving ? 'שומר...' : 'הוסף סיווג'}
                </Button>
              </div>
              {clsErr ? <div className="mt-2 text-sm text-red-700">{clsErr}</div> : null}
            </div>
          </CardContent>
        </Card>
      )}

      {tab === 'employees' && canManageUsersEffective && (
        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>עובדים</CardTitle>
            <Button style={{ background: galit.primary }} onClick={openCreateEmp}>
              עובד חדש
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {empLoading ? (
              <div className="p-5 text-sm text-slate-500">טוען...</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>שם עובד</TableHead>
                    <TableHead>אימייל</TableHead>
                    <TableHead>תפקיד</TableHead>
                    <TableHead>סטטוס</TableHead>
                    <TableHead>טלפון</TableHead>
                    <TableHead>מחלקות / תחומי אחריות</TableHead>
                    <TableHead>פעולות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.map((u) => (
                    <TableRow key={u.id} className="hover:bg-slate-50">
                      <TableCell className="font-medium">{u.name}</TableCell>
                      <TableCell>
                        {u.email ? (
                          <a href={emailToMailtoHref(u.email) || undefined} className="hover:underline">
                            {u.email}
                          </a>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell>{employeeRoleLabel(u.role)}</TableCell>
                      <TableCell>{employeeStatusLabel(u.status)}</TableCell>
                      <TableCell>
                        {u.phone ? (
                          <div className="space-y-1">
                            <a href={phoneToTelHref(u.phone) || undefined} className="hover:underline">
                              {phoneToDisplay(u.phone)}
                            </a>
                            <div className="text-xs">
                              <a
                                href={phoneToWhatsAppHref(u.phone) || undefined}
                                className="text-sky-700 hover:underline"
                                target="_blank"
                                rel="noreferrer"
                              >
                                וואטסאפ
                              </a>
                            </div>
                          </div>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell>
                        {(Array.isArray(u.serviceDepartments)
                          ? u.serviceDepartments
                          : u.department
                            ? [u.department]
                            : []
                        ).length
                          ? (Array.isArray(u.serviceDepartments)
                              ? u.serviceDepartments
                              : u.department
                                ? [u.department]
                                : []
                            )
                              .map((d: string) => employeeServiceDepartmentLabel(d))
                              .join(', ')
                          : '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <button className="rounded-xl border px-3 py-1 text-xs hover:bg-slate-50" onClick={() => openEditEmp(u)}>עריכה</button>
                          <button className="rounded-xl border px-3 py-1 text-xs hover:bg-slate-50" onClick={() => toggleActive(u)}>
                            {u.status === 'INACTIVE' ? 'הפעל' : 'השבת'}
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {tab === 'employeeHandoff' && canEmployeeHandoff && (
        <div className="space-y-5" dir="rtl">
          {handoffError ? (
            <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{handoffError}</div>
          ) : null}

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">העברת אחריות לעובד אחר</h2>
            <p className="mt-1 text-sm text-slate-600">
              מעביר שיוכים מהעובד הישן ליעד. לא משנים יוצרים היסטוריים — רק אחריות נוכחית (assigned / owner). פעילויות ליד נשארות עם יוצר
              מקורי ולא מועברות. &quot;לקוחות&quot; = הזדמנויות מכירה; &quot;הצעות מחיר&quot; = הזדמנויות עם הצעה (אם לא סומן
              &quot;לקוחות&quot;, יועברו רק אלה).
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <FormField label="עובד מקור (היוצא)">
                <select
                  value={transferFromId}
                  onChange={(e) => {
                    setTransferFromId(e.target.value);
                    setHandoffError('');
                  }}
                  disabled={transferBusy}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-slate-400"
                >
                  <option value="">— בחר —</option>
                  {(employees as any[]).map((e: any) => (
                    <option key={e.id} value={e.id}>
                      {e.name} ({employeeStatusLabel(e.status)})
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="עובד יעד (פעיל)">
                <select
                  value={transferToId}
                  onChange={(e) => {
                    setTransferToId(e.target.value);
                    setHandoffError('');
                  }}
                  disabled={transferBusy}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-slate-400"
                >
                  <option value="">— בחר —</option>
                  {employeesActiveOnly.map((e: any) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>
            <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
              <div className="mb-2 text-sm font-semibold text-slate-800">מה להעביר</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    ['leads', 'לידים'],
                    ['customers', 'לקוחות (הזדמנויות)'],
                    ['tasks', 'משימות'],
                    ['projects', 'פרויקטים'],
                    ['quotes', 'הצעות מחיר'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={!!transferOpts[key]}
                      disabled={transferBusy}
                      onChange={(e) => setTransferOpts((p) => ({ ...p, [key]: e.target.checked }))}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="mt-4">
              <Button style={{ background: galit.primary }} disabled={transferBusy} onClick={() => void runTransferData()}>
                {transferBusy ? 'מעביר...' : 'העבר אחריות'}
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">העתקת הרשאות</h2>
            <p className="mt-1 text-sm text-slate-600">
              מעתיק לשרת את התפקיד, כל דגלי ההרשאות, מחלקות שירות ושדה מחלקה מהעובד המקור ליעד.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <FormField label="עובד מקור">
                <select
                  value={copyPermFromId}
                  onChange={(e) => {
                    setCopyPermFromId(e.target.value);
                    setHandoffError('');
                  }}
                  disabled={copyPermBusy}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-slate-400"
                >
                  <option value="">— בחר —</option>
                  {(employees as any[]).map((e: any) => (
                    <option key={e.id} value={e.id} disabled={e.id === copyPermToId}>
                      {e.name} ({employeeStatusLabel(e.status)})
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="עובד יעד (פעיל)">
                <select
                  value={copyPermToId}
                  onChange={(e) => {
                    setCopyPermToId(e.target.value);
                    setHandoffError('');
                  }}
                  disabled={copyPermBusy}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-slate-400"
                >
                  <option value="">— בחר —</option>
                  {employeesActiveOnly.map((e: any) => (
                    <option key={e.id} value={e.id} disabled={e.id === copyPermFromId}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>
            <div className="mt-4">
              <Button
                variant="outline"
                disabled={copyPermBusy || !copyPermFromId || !copyPermToId}
                onClick={() => void copyPermissionsHandoff()}
              >
                {copyPermBusy ? 'מעתיק...' : 'העתק הרשאות'}
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">סימון עובד כלא פעיל</h2>
            <p className="mt-1 text-sm text-slate-600">
              העובד לא יוכל להתחבר; הרשומה נשמרת במערכת וההיסטוריה לא נמחקת. בחירות רגילות במערכת מציגות בעיקר עובדים פעילים.
            </p>
            <div className="mt-4 max-w-md">
              <FormField label="עובד פעיל לסימון כלא פעיל">
                <select
                  value={inactiveMarkId}
                  onChange={(e) => {
                    setInactiveMarkId(e.target.value);
                    setHandoffError('');
                  }}
                  disabled={inactiveBusy}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-slate-400"
                >
                  <option value="">— בחר —</option>
                  {employeesActiveOnly.map((e: any) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>
            <div className="mt-4">
              <Button
                variant="outline"
                disabled={inactiveBusy || !inactiveMarkId}
                onClick={() => void markEmployeeInactiveHandoff()}
              >
                {inactiveBusy ? 'מעדכן...' : 'סמן כלא פעיל'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {tab === 'permissions' && canManagePermissionsEffective && (
        <Card>
          <CardHeader><CardTitle>תפקידים והרשאות</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-slate-500">מטריצת הרשאות לתצוגה (מבוססת על @Roles ב-backend; אין ACL דינמי בשלב זה).</div>
            <div className="grid gap-3 md:grid-cols-2">
              {['ADMIN', 'MANAGER', 'SALES', 'TECHNICIAN'].map((role) => {
                const d = rolePermissionDetails(role);
                return (
                  <div key={role} className="rounded-3xl border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold">{role}</div>
                        <div className="mt-1 text-xs text-slate-500">{d.scopeLabel}</div>
                      </div>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                        {employeeRoleLabel(role)}
                      </span>
                    </div>

                    <div className="mt-3 space-y-2 text-sm">
                      <div className="font-semibold">לידים</div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <input type="checkbox" checked={d.leads.view} disabled />
                          <span>יכול לראות</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input type="checkbox" checked={d.leads.create} disabled />
                          <span>יכול ליצור</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input type="checkbox" checked={d.leads.edit} disabled />
                          <span>יכול לערוך</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input type="checkbox" checked={d.leads.delete} disabled />
                          <span>יכול למחוק</span>
                        </div>
                      </div>

                      <div className="font-semibold mt-3">לקוחות</div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <input type="checkbox" checked={d.customers.view} disabled />
                          <span>יכול לראות</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input type="checkbox" checked={d.customers.delete} disabled />
                          <span>יכול למחוק</span>
                        </div>
                      </div>

                      <div className="font-semibold mt-3">הצעות מחיר / כספים</div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <input type="checkbox" checked={d.quotes.view} disabled />
                          <span>יכול לראות הצעות מחיר</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input type="checkbox" checked={d.funds.view} disabled />
                          <span>יכול לראות כספים</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input type="checkbox" checked={d.funds.edit} disabled />
                          <span>יכול לערוך כספים</span>
                        </div>
                      </div>

                      <div className="font-semibold mt-3">דוחות</div>
                      <div className="flex items-center gap-2">
                        <input type="checkbox" checked={d.reports.view} disabled />
                        <span>יכול לראות</span>
                      </div>

                      <div className="font-semibold mt-3">ניהול</div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <input type="checkbox" checked={d.employees.manage} disabled />
                          <span>יכול לנהל עובדים</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input type="checkbox" checked={d.permissions.manage} disabled />
                          <span>יכול לנהל הרשאות</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {tab === 'services' && (
        <Card>
          <CardHeader><CardTitle>שירותים</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-slate-500">ניהול קטגוריות ושירותי משנה (נשמר ב־Settings). ישמש בהמשך לידים/פרויקטים/הצעות.</div>
            <div className="space-y-3">
              {services.map((s, idx) => (
                <div key={s.category} className="rounded-3xl border p-4">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">{s.category}</div>
                    <button
                      className="rounded-xl border px-3 py-1 text-xs hover:bg-slate-50"
                      onClick={() => {
                        const name = window.prompt('הוסף תת-סוג');
                        if (!name) return;
                        setServices((prev) => prev.map((x, i) => i === idx ? { ...x, subtypes: Array.from(new Set([...x.subtypes, name])) } : x));
                      }}
                    >
                      הוסף תת-סוג
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {s.subtypes.length === 0 ? (
                      <span className="text-sm text-slate-500">אין תתי-סוגים</span>
                    ) : (
                      s.subtypes.map((st) => (
                        <button
                          key={st}
                          className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700 hover:bg-slate-200"
                          onClick={() => setServices((prev) => prev.map((x, i) => i === idx ? { ...x, subtypes: x.subtypes.filter((y) => y !== st) } : x))}
                        >
                          {st} ×
                        </button>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
            <Button
              style={{ background: galit.primary }}
              onClick={async () => {
                try {
                  await saveSetting('services', services);
                  setSettingsMsg('שירותים נשמרו בהצלחה');
                  window.setTimeout(() => setSettingsMsg(''), 2000);
                } catch {
                  setEmpError('שמירת שירותים נכשלה');
                }
              }}
            >
              שמור שירותים
            </Button>
          </CardContent>
        </Card>
      )}

      {tab === 'statuses' && (
        <Card>
          <CardHeader><CardTitle>סטטוסים</CardTitle></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div className="rounded-3xl border p-4"><div className="font-semibold">לידים</div><div className="mt-2 text-sm text-slate-600">{leadStatuses.join(' · ')}</div></div>
            <div className="rounded-3xl border p-4"><div className="font-semibold">פרויקטים</div><div className="mt-2 text-sm text-slate-600">{projectStatuses.join(' · ')}</div></div>
            <div className="rounded-3xl border p-4"><div className="font-semibold">משימות</div><div className="mt-2 text-sm text-slate-600">{taskStatuses.join(' · ')}</div></div>
            <div className="rounded-3xl border p-4"><div className="font-semibold">הצעות מחיר</div><div className="mt-2 text-sm text-slate-600">{quoteStatuses.join(' · ')}</div></div>
            <div className="rounded-3xl border p-4"><div className="font-semibold">דוחות</div><div className="mt-2 text-sm text-slate-600">{reportStatuses.join(' · ')}</div></div>
            <div className="rounded-3xl border p-4"><div className="font-semibold">דגימות</div><div className="mt-2 text-sm text-slate-600">{sampleStatuses.join(' · ')}</div></div>
          </CardContent>
        </Card>
      )}

      {tab === 'targets' && (
        <Card>
          <CardHeader><CardTitle>יעדים</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <Input value={String(targets.monthlyRevenueTarget)} onChange={(e) => setTargets((p) => ({ ...p, monthlyRevenueTarget: Number(e.target.value) || 0 }))} placeholder="יעד הכנסות חודשי" />
              <Input value={String(targets.defaultTeamQuota)} onChange={(e) => setTargets((p) => ({ ...p, defaultTeamQuota: Number(e.target.value) || 0 }))} placeholder="יעד צוות ברירת מחדל" />
            </div>
            <Button
              style={{ background: galit.primary }}
              onClick={async () => {
                try {
                  await saveSetting('targets', targets);
                  setSettingsMsg('יעדים נשמרו בהצלחה');
                  window.setTimeout(() => setSettingsMsg(''), 2000);
                } catch {
                  setEmpError('שמירת יעדים נכשלה');
                }
              }}
            >
              שמור יעדים
            </Button>
            <div className="text-xs text-slate-500">הערה: חיבור מלא לדשבורד מנהל יתבצע בשלב הבא (כרגע הדשבורד משתמש ביעד ברירת מחדל בשרת).</div>
          </CardContent>
        </Card>
      )}

      {tab === 'catalog' && (
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>פריטים / מחירון</CardTitle>
            <Button style={{ background: galit.primary }} onClick={openNewCatalog}>פריט חדש</Button>
          </CardHeader>
          <CardContent className="p-0">
            {catalogLoading ? (
              <div className="p-5 text-sm text-slate-500">טוען...</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>קוד פריט</TableHead>
                    <TableHead>שם פריט</TableHead>
                    <TableHead>קטגוריה</TableHead>
                    <TableHead>תת קטגוריה</TableHead>
                    <TableHead>מחיר בסיס</TableHead>
                    <TableHead>יחידת חיוב</TableHead>
                    <TableHead>פעיל</TableHead>
                    <TableHead>פעולות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {catalog.map((it) => (
                    <TableRow key={it.id} className={cn('hover:bg-slate-50', it.isActive ? '' : 'opacity-60')}>
                      <TableCell className="font-medium">{it.itemCode}</TableCell>
                      <TableCell>{it.name}</TableCell>
                      <TableCell>{it.serviceCategory || '-'}</TableCell>
                      <TableCell>{it.serviceSubType || '-'}</TableCell>
                      <TableCell>{formatCurrencyILS(Number(it.basePrice ?? 0))}</TableCell>
                      <TableCell>{it.billingUnit}</TableCell>
                      <TableCell>{it.isActive ? 'כן' : 'לא'}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <button className="rounded-xl border px-3 py-1 text-xs hover:bg-slate-50" onClick={() => openEditCatalog(it)}>עריכה</button>
                          <button className="rounded-xl border px-3 py-1 text-xs hover:bg-slate-50" onClick={() => toggleCatalogActive(it)}>
                            {it.isActive ? 'השבתה' : 'הפעלה'}
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {tab === 'templates' && (
        <div className="space-y-4" dir="rtl">
          <Card>
            <CardHeader className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>תבניות הצעות מחיר</CardTitle>
              {canManageQuoteTemplates && (
                <Button
                  style={{ background: galit.primary }}
                  disabled={qtLoading}
                  onClick={() => {
                    setQtEditing(null);
                    setQtForm({
                      name: '',
                      serviceType: 'קרינה',
                      isActive: true,
                      introHtml: '<p>לכבוד {{customerName}},</p>',
                      bodyHtml: '<p>הצעת מחיר עבור {{serviceName}}.</p><p>{{itemsTable}}</p><p>סה״כ לפני מע״מ: {{subtotal}} · מע״מ: {{vat}} · סה״כ: {{total}}</p>',
                      closingHtml: '<p>בברכה,<br/>גלית</p>',
                      termsHtml: '<p><strong>תנאים:</strong> תשלום לפי תנאי ההצעה · {{notes}}</p>',
                      variablesHelp: QUOTE_TEMPLATE_VARIABLES_HELP,
                      defaultLineItemsJson: '[{"name":"ביקור שטח","quantity":1,"unitPrice":2000}]',
                    });
                    setQtModalOpen(true);
                  }}
                >
                  תבנית חדשה
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {qtError && <div className="rounded-2xl bg-red-50 px-4 py-2 text-sm text-red-700">{qtError}</div>}
              <p className="text-sm text-slate-600">
                תבניות HTML עם משתנים <code className="rounded bg-slate-100 px-1">{'{{שם}}'}</code>. התאמת שירות לפי שדה «סוג שירות» — זהה לערך שנבחר במסך הצעות מחיר.
              </p>
              <div className="rounded-2xl border bg-slate-50 p-3 text-xs text-slate-600 whitespace-pre-wrap">{QUOTE_TEMPLATE_VARIABLES_HELP}</div>
              {qtLoading ? (
                <div className="text-sm text-slate-500">טוען...</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>שם</TableHead>
                      <TableHead>סוג שירות</TableHead>
                      <TableHead>פעיל</TableHead>
                      <TableHead>פעולות</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {qtList.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium">{t.name}</TableCell>
                        <TableCell>{t.serviceType}</TableCell>
                        <TableCell>{t.isActive ? 'כן' : 'לא'}</TableCell>
                        <TableCell>
                          {canManageQuoteTemplates && (
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                className="rounded-xl border px-3 py-1 text-xs hover:bg-slate-50"
                                onClick={() => {
                                  setQtEditing(t);
                                  setQtForm({
                                    name: t.name || '',
                                    serviceType: t.serviceType || 'קרינה',
                                    isActive: t.isActive !== false,
                                    introHtml: t.introHtml || '',
                                    bodyHtml: t.bodyHtml || '',
                                    closingHtml: t.closingHtml || '',
                                    termsHtml: t.termsHtml || '',
                                    variablesHelp: t.variablesHelp || QUOTE_TEMPLATE_VARIABLES_HELP,
                                    defaultLineItemsJson: t.defaultLineItems
                                      ? JSON.stringify(t.defaultLineItems, null, 2)
                                      : '[]',
                                  });
                                  setQtModalOpen(true);
                                }}
                              >
                                עריכה
                              </button>
                              <button
                                type="button"
                                className="rounded-xl border px-3 py-1 text-xs hover:bg-slate-50"
                                onClick={async () => {
                                  if (!window.confirm('למחוק תבנית?')) return;
                                  try {
                                    const res = await apiFetch(apiUrl(`/quote-templates/${t.id}`), {
                                      method: 'DELETE',
                                      authUser: currentUser,
                                    });
                                    if (!res.ok) throw new Error();
                                    await loadQuoteTemplates();
                                  } catch {
                                    setQtError('מחיקת תבנית נכשלה');
                                  }
                                }}
                              >
                                מחק
                              </button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {!canManageQuoteTemplates && (
                <p className="text-xs text-slate-500">עריכה ומחיקה: מנהל מערכת או מנהל בלבד.</p>
              )}
            </CardContent>
          </Card>

          <Modal
            open={qtModalOpen}
            onClose={() => setQtModalOpen(false)}
            title={qtEditing ? 'עריכת תבנית' : 'תבנית חדשה'}
            maxWidth="max-w-3xl"
          >
            <div className="space-y-3" dir="rtl">
              <FormField label="שם תבנית">
                <Input value={qtForm.name} onChange={(e) => setQtForm((p) => ({ ...p, name: e.target.value }))} placeholder="שם" />
              </FormField>
              <FormField label="סוג שירות (מחרוזת זהה לבחירת שירות בהצעה)">
                <select
                  className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  value={qtForm.serviceType}
                  onChange={(e) => setQtForm((p) => ({ ...p, serviceType: e.target.value }))}
                >
                  {QUOTE_SERVICE_TYPE_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </FormField>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={qtForm.isActive}
                  onChange={(e) => setQtForm((p) => ({ ...p, isActive: e.target.checked }))}
                />
                <span className="text-sm">פעיל</span>
              </div>
              <FormField label="טקסט פתיחה (HTML)">
                <Textarea className="min-h-[80px] font-mono text-xs" value={qtForm.introHtml} onChange={(e) => setQtForm((p) => ({ ...p, introHtml: e.target.value }))} />
              </FormField>
              <FormField label="תוכן תבנית (HTML)">
                <Textarea className="min-h-[100px] font-mono text-xs" value={qtForm.bodyHtml} onChange={(e) => setQtForm((p) => ({ ...p, bodyHtml: e.target.value }))} />
              </FormField>
              <FormField label="טקסט סיום (HTML)">
                <Textarea className="min-h-[80px] font-mono text-xs" value={qtForm.closingHtml} onChange={(e) => setQtForm((p) => ({ ...p, closingHtml: e.target.value }))} />
              </FormField>
              <FormField label="תנאים (HTML)">
                <Textarea className="min-h-[80px] font-mono text-xs" value={qtForm.termsHtml} onChange={(e) => setQtForm((p) => ({ ...p, termsHtml: e.target.value }))} />
              </FormField>
              <FormField label="משתנים נתמכים (טקסט עזר)">
                <Textarea className="min-h-[100px] font-mono text-xs" value={qtForm.variablesHelp} onChange={(e) => setQtForm((p) => ({ ...p, variablesHelp: e.target.value }))} />
              </FormField>
              <FormField label="פריטים ברירת מחדל (JSON)">
                <Textarea
                  className="min-h-[100px] font-mono text-xs"
                  value={qtForm.defaultLineItemsJson}
                  onChange={(e) => setQtForm((p) => ({ ...p, defaultLineItemsJson: e.target.value }))}
                />
              </FormField>
              <div className="flex flex-wrap gap-2">
                <Button
                  style={{ background: galit.primary }}
                  onClick={async () => {
                    if (!qtForm.name.trim()) {
                      setQtError('שם תבנית חובה');
                      return;
                    }
                    let parsed;
                    try {
                      parsed = JSON.parse(qtForm.defaultLineItemsJson || '[]');
                    } catch {
                      setQtError('JSON פריטים לא תקין');
                      return;
                    }
                    setQtError('');
                    try {
                      const payload: any = {
                        name: qtForm.name.trim(),
                        serviceType: qtForm.serviceType,
                        isActive: qtForm.isActive,
                        introHtml: qtForm.introHtml || null,
                        bodyHtml: qtForm.bodyHtml || null,
                        closingHtml: qtForm.closingHtml || null,
                        termsHtml: qtForm.termsHtml || null,
                        variablesHelp: qtForm.variablesHelp || null,
                        defaultLineItems: parsed,
                      };
                      const url = qtEditing ? `${getApiBaseUrl()}/quote-templates/${qtEditing.id}` : apiUrl('/quote-templates');
                      const res = await apiFetch(url, {
                        method: qtEditing ? 'PATCH' : 'POST',
                        authUser: currentUser,
                        body: JSON.stringify(payload),
                      });
                      if (!res.ok) throw new Error();
                      setQtModalOpen(false);
                      await loadQuoteTemplates();
                      setSettingsMsg('התבנית נשמרה');
                      window.setTimeout(() => setSettingsMsg(''), 2500);
                    } catch {
                      setQtError('שמירת תבנית נכשלה');
                    }
                  }}
                >
                  שמור
                </Button>
                <Button variant="outline" type="button" onClick={() => setQtModalOpen(false)}>
                  ביטול
                </Button>
              </div>
            </div>
          </Modal>
        </div>
      )}

      {tab === 'system' && (
        <Card>
          <CardHeader><CardTitle>מערכת</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <FormField label="שם חברה">
                <Input value={system.companyName} onChange={(e) => setSystem((p) => ({ ...p, companyName: e.target.value }))} placeholder="שם חברה" />
              </FormField>
              <FormField label="נתיב לוגו">
                <Input value={system.logoPath} onChange={(e) => setSystem((p) => ({ ...p, logoPath: e.target.value }))} placeholder="נתיב לוגו" />
              </FormField>
              <FormField label="טלפון ראשי">
                <PhoneInput value={system.mainPhone} onChange={(v) => setSystem((p) => ({ ...p, mainPhone: v }))} placeholder="טלפון ראשי" />
              </FormField>
              <FormField label="מייל ראשי">
                <EmailInput value={system.mainEmail} onChange={(v) => setSystem((p) => ({ ...p, mainEmail: v }))} placeholder="מייל ראשי" />
              </FormField>
            </div>
            <div className="rounded-3xl border p-4">
              <div className="text-sm text-slate-500">תצוגה מקדימה</div>
              <div className="mt-3 flex items-center gap-3">
                <img src={system.logoPath || galitLogo} alt="logo" className="h-10 w-10 rounded-full border object-contain bg-white" />
                <div>
                  <div className="font-semibold">{system.companyName || '—'}</div>
                  <div className="text-xs text-slate-500">{system.mainPhone || '—'} · {system.mainEmail || '—'}</div>
                </div>
              </div>
            </div>
            <Button
              style={{ background: galit.primary }}
              onClick={async () => {
                try {
                  await saveSetting('system', system);
                  setSettingsMsg('הגדרות מערכת נשמרו');
                  window.setTimeout(() => setSettingsMsg(''), 2000);
                } catch {
                  setEmpError('שמירת מערכת נכשלה');
                }
              }}
            >
              שמור מערכת
            </Button>
            <div className="text-xs text-slate-500">UI theme הוא placeholder בלבד בשלב זה.</div>
          </CardContent>
        </Card>
      )}

      <Modal open={empModalOpen} onClose={() => setEmpModalOpen(false)} title={empEditing ? 'עריכת עובד' : 'עובד חדש'} maxWidth="max-w-xl">
        <div className="space-y-3">
          <FormField label="שם עובד">
            <Input value={empForm.name} onChange={(e) => setEmpForm((p) => ({ ...p, name: e.target.value }))} placeholder="שם" />
          </FormField>
          <FormField label="אימייל">
            <EmailInput value={empForm.email} onChange={(v) => setEmpForm((p) => ({ ...p, email: v }))} placeholder="אימייל" />
          </FormField>
          {!empEditing && (
            <FormField label="סיסמה">
              <Input value={empForm.password} onChange={(e) => setEmpForm((p) => ({ ...p, password: e.target.value }))} placeholder="סיסמה" />
            </FormField>
          )}
          <FormField label="תפקיד">
            <select
              value={empForm.role}
              onChange={(e) => setEmpForm((p) => ({ ...p, role: e.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-slate-400"
            >
              {(['ADMIN', 'MANAGER', 'SALES', 'TECHNICIAN'] as const).map((r) => (
                <option key={r} value={r}>
                  {employeeRoleLabel(r)}
                </option>
              ))}
              {empEditing &&
                !['ADMIN', 'MANAGER', 'SALES', 'TECHNICIAN'].includes((empForm.role || '').toString().toUpperCase()) && (
                  <option value={empForm.role}>
                    {employeeRoleLabel(empForm.role)} (תפקיד קיים במערכת)
                  </option>
                )}
            </select>
          </FormField>

          <div className="rounded-2xl border bg-slate-50 p-4">
            <div className="mb-2 text-sm font-semibold">הרשאות בסיסיות</div>
            <div className="mb-3 text-xs text-slate-500">נשמר ב-DB ומשפיע על תצוגה וכפתורים בשלב 1.</div>
            <div className="space-y-3 text-sm">
              <div className="font-semibold">כספים</div>
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={!!empForm.canViewFinance} onChange={(e) => setEmpForm((p) => ({ ...p, canViewFinance: e.target.checked }))} />
                <span>צפייה בכספים</span>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={!!empForm.canEditFinance} onChange={(e) => setEmpForm((p) => ({ ...p, canEditFinance: e.target.checked }))} />
                <span>עריכת כספים</span>
              </div>

              <div className="font-semibold mt-2">מחיקה ותצוגה</div>
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={!!empForm.canDeleteCustomers} onChange={(e) => setEmpForm((p) => ({ ...p, canDeleteCustomers: e.target.checked }))} />
                <span>מחיקת לקוחות</span>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={!!empForm.canDeleteLeads} onChange={(e) => setEmpForm((p) => ({ ...p, canDeleteLeads: e.target.checked }))} />
                <span>מחיקת לידים</span>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={!!empForm.canViewAllRecords} onChange={(e) => setEmpForm((p) => ({ ...p, canViewAllRecords: e.target.checked }))} />
                <span>צפייה בכל הרשומות</span>
              </div>

              <div className="font-semibold mt-2">ניהול מערכת</div>
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={!!empForm.canManageUsers} onChange={(e) => setEmpForm((p) => ({ ...p, canManageUsers: e.target.checked }))} />
                <span>ניהול עובדים</span>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={!!empForm.canManagePermissions} onChange={(e) => setEmpForm((p) => ({ ...p, canManagePermissions: e.target.checked }))} />
                <span>ניהול הרשאות</span>
              </div>
            </div>
          </div>

          <FormField label="סטטוס">
            <select
              value={empForm.status}
              onChange={(e) => setEmpForm((p) => ({ ...p, status: e.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-slate-400"
            >
              <option value="ACTIVE">פעיל</option>
              <option value="INACTIVE">לא פעיל</option>
            </select>
          </FormField>
          <FormField label="טלפון">
            <PhoneInput value={empForm.phone} onChange={(v) => setEmpForm((p) => ({ ...p, phone: v }))} placeholder="טלפון" />
          </FormField>

          <div className="rounded-2xl border bg-slate-50 p-4">
            <div className="mb-2 text-sm font-semibold">מחלקות / תחומי אחריות</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {SERVICE_DEPARTMENT_OPTIONS.map((opt) => {
                const checked = Array.isArray(empForm.serviceDepartments) ? empForm.serviceDepartments.includes(opt) : false;
                return (
                  <label key={opt} className="flex cursor-pointer items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...empForm.serviceDepartments, opt]
                          : empForm.serviceDepartments.filter((x) => x !== opt);
                        setEmpForm((p) => ({ ...p, serviceDepartments: Array.from(new Set(next)) }));
                      }}
                    />
                    <span>{opt}</span>
                  </label>
                );
              })}
            </div>
            <div className="mt-3 text-xs text-slate-500">לידים יוכלו להתאים אוטומטית לפי שירות/מחלקה עתידית.</div>
          </div>

          <Button style={{ background: galit.primary }} onClick={saveEmp}>שמור</Button>
        </div>
      </Modal>

      <Modal open={catalogModalOpen} onClose={() => setCatalogModalOpen(false)} title={catalogEditing ? 'עריכת פריט' : 'פריט חדש'} maxWidth="max-w-2xl">
        <div className="grid gap-3 md:grid-cols-2">
          <FormField label="קוד פריט">
            <Input value={catalogForm.itemCode} onChange={(e) => setCatalogForm((p) => ({ ...p, itemCode: e.target.value }))} placeholder="קוד פריט" />
          </FormField>
          <FormField label="שם פריט">
            <Input value={catalogForm.name} onChange={(e) => setCatalogForm((p) => ({ ...p, name: e.target.value }))} placeholder="שם פריט" />
          </FormField>
          <div className="md:col-span-2">
            <FormField label="תיאור">
              <Textarea value={catalogForm.description} onChange={(e) => setCatalogForm((p) => ({ ...p, description: e.target.value }))} placeholder="תיאור" />
            </FormField>
          </div>
          <FormField label="קטגוריית שירות">
            <Input value={catalogForm.serviceCategory} onChange={(e) => setCatalogForm((p) => ({ ...p, serviceCategory: e.target.value }))} placeholder="קטגוריית שירות" />
          </FormField>
          <FormField label="תת סוג שירות">
            <Input value={catalogForm.serviceSubType} onChange={(e) => setCatalogForm((p) => ({ ...p, serviceSubType: e.target.value }))} placeholder="תת סוג שירות" />
          </FormField>
          <FormField label="מחיר בסיס">
            <Input value={catalogForm.basePrice} onChange={(e) => setCatalogForm((p) => ({ ...p, basePrice: e.target.value }))} placeholder="מחיר בסיס" />
          </FormField>
          <FormField label="יחידת חיוב">
            <Select
              value={catalogForm.billingUnit}
              onChange={(v) => setCatalogForm((p) => ({ ...p, billingUnit: v }))}
              options={['יחידה', 'שעה', 'יום עבודה', 'ביקור', 'דגימה', 'מטר', 'מ"ר', 'גלאי', 'אתר', 'מסמך']}
            />
          </FormField>
          <FormField label={'אחוז מע"מ'}>
            <Input value={catalogForm.vatPercent} onChange={(e) => setCatalogForm((p) => ({ ...p, vatPercent: e.target.value }))} placeholder={'אחוז מע"מ'} />
          </FormField>
          <div className="flex items-center gap-3 rounded-2xl border px-4 py-3">
            <input type="checkbox" checked={catalogForm.isActive} onChange={(e) => setCatalogForm((p) => ({ ...p, isActive: e.target.checked }))} />
            <span className="text-sm">פעיל</span>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border px-4 py-3">
            <input type="checkbox" checked={catalogForm.requiresQuantity} onChange={(e) => setCatalogForm((p) => ({ ...p, requiresQuantity: e.target.checked }))} />
            <span className="text-sm">דורש כמות</span>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border px-4 py-3">
            <input type="checkbox" checked={catalogForm.requiresSiteVisit} onChange={(e) => setCatalogForm((p) => ({ ...p, requiresSiteVisit: e.target.checked }))} />
            <span className="text-sm">דורש ביקור שטח</span>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border px-4 py-3">
            <input type="checkbox" checked={catalogForm.requiresReport} onChange={(e) => setCatalogForm((p) => ({ ...p, requiresReport: e.target.checked }))} />
            <span className="text-sm">דורש דוח</span>
          </div>
          <div className="md:col-span-2">
            <FormField label="הערות">
              <Textarea value={catalogForm.notes} onChange={(e) => setCatalogForm((p) => ({ ...p, notes: e.target.value }))} placeholder="הערות" />
            </FormField>
          </div>
          <div className="md:col-span-2">
            <Button style={{ background: galit.primary }} onClick={saveCatalogItem}>שמור</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

const FIELD_SCHEDULE_STATUSES = ['SCHEDULED', 'ON_THE_WAY', 'FIELD_WORK_DONE', 'POSTPONED', 'CANCELLED'] as const;
const FIELD_SCHEDULE_STATUS_LABELS: Record<string, string> = {
  SCHEDULED: 'מתוכנן',
  ON_THE_WAY: 'בדרך',
  FIELD_WORK_DONE: 'בוצע בשטח',
  POSTPONED: 'נדחה',
  CANCELLED: 'בוטל',
};

function fieldScheduleRowStyle(status: string): string {
  const map: Record<string, string> = {
    SCHEDULED: 'bg-sky-50 border-r-4 border-sky-400',
    ON_THE_WAY: 'bg-amber-50 border-r-4 border-amber-400',
    FIELD_WORK_DONE: 'bg-green-50 border-r-4 border-green-500',
    POSTPONED: 'bg-slate-100 border-r-4 border-slate-400',
    CANCELLED: 'bg-red-50 border-r-4 border-red-400',
  };
  return map[status] ?? 'bg-white border-r-4 border-slate-200';
}

function FieldSchedulePage({
  projects,
  setProjects,
  technicians,
  currentUser,
}: {
  projects: Project[];
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
  technicians: AppUser[];
  currentUser: AppUser;
}) {
  const [filterDate, setFilterDate] = useState('');
  const [filterTech, setFilterTech] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [filterServiceCategory, setFilterServiceCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const cities = useMemo(() => {
    const set = new Set<string>();
    projects.forEach((p) => p.city && set.add(p.city));
    return Array.from(set).sort();
  }, [projects]);

  const serviceCategories = useMemo(() => {
    const set = new Set<string>();
    projects.forEach((p) => p.serviceCategory && set.add(p.serviceCategory));
    return Array.from(set).sort();
  }, [projects]);

  const filtered = useMemo(() => {
    return projects.filter((p) => {
      const dateOk = !filterDate || (p.siteVisitDate ? new Date(p.siteVisitDate).toLocaleDateString('en-CA') === filterDate : false);
      const techOk = !filterTech || (p.assignedTechnicianId || '') === filterTech;
      const cityOk = !filterCity || (p.city || '') === filterCity;
      const catOk = !filterServiceCategory || (p.serviceCategory || '') === filterServiceCategory;
      const statusOk = !filterStatus || (p.status || '') === filterStatus;
      return dateOk && techOk && cityOk && catOk && statusOk;
    });
  }, [projects, filterCity, filterDate, filterServiceCategory, filterStatus, filterTech]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const dA = a.siteVisitDate ? new Date(a.siteVisitDate).getTime() : 0;
      const dB = b.siteVisitDate ? new Date(b.siteVisitDate).getTime() : 0;
      if (dA !== dB) return dA - dB;
      const tA = (a.siteVisitTime || '').trim();
      const tB = (b.siteVisitTime || '').trim();
      return tA.localeCompare(tB, undefined, { numeric: true });
    });
  }, [filtered]);

  const patchProject = async (id: string, payload: Record<string, unknown>) => {
    try {
      const res = await apiFetch(apiUrl(`/projects/${id}`), {
        method: 'PATCH',
        authUser: currentUser,
        body: JSON.stringify(payload),
      });
      if (!res.ok) return;
      const updated = await res.json();
      setProjects((prev) =>
        prev.map((p) =>
          p.id === id
            ? {
                ...p,
                status: updated.status ?? p.status,
                siteVisitDate: updated.siteVisitDate ?? p.siteVisitDate,
                siteVisitTime: updated.siteVisitTime ?? p.siteVisitTime,
                assignedTechnicianId: updated.assignedTechnicianId ?? p.assignedTechnicianId,
                assignedTechnician: updated.assignedTechnician ? { id: updated.assignedTechnician.id, name: updated.assignedTechnician.name } : undefined,
                owner: updated.assignedTechnician?.name ?? p.owner,
              }
            : p,
        ),
      );
    } catch {
      /* ignore */
    }
  };

  const onTechnicianChange = (projectId: string, userId: string) => {
    const value = userId || undefined;
    patchProject(projectId, { assignedTechnicianId: value || null });
  };

  const onDateChange = (projectId: string, dateStr: string) => {
    patchProject(projectId, { siteVisitDate: dateStr || null });
  };

  const onTimeChange = (projectId: string, timeStr: string) => {
    patchProject(projectId, { siteVisitTime: timeStr || null });
  };

  const onStatusChange = (projectId: string, status: string) => {
    patchProject(projectId, { status });
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold" style={{ color: galit.text }}>
          יומן שטח
        </h1>
        <p className="mt-1 text-slate-500">תכנון יומי: ביקורי שטח, שיוך טכנאים וסטטוסים</p>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-5">
          <div>
            <div className="mb-1 text-xs text-slate-500">תאריך</div>
            <input
              type="date"
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
            />
          </div>
          <div>
            <div className="mb-1 text-xs text-slate-500">טכנאי</div>
            <select
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
              value={filterTech}
              onChange={(e) => setFilterTech(e.target.value)}
            >
              <option value="">הכל</option>
              {technicians.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
          <div>
            <div className="mb-1 text-xs text-slate-500">עיר</div>
            <select
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
              value={filterCity}
              onChange={(e) => setFilterCity(e.target.value)}
            >
              <option value="">הכל</option>
              {cities.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <div className="mb-1 text-xs text-slate-500">קטגוריה</div>
            <select
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
              value={filterServiceCategory}
              onChange={(e) => setFilterServiceCategory(e.target.value)}
            >
              <option value="">הכל</option>
              {serviceCategories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <div className="mb-1 text-xs text-slate-500">סטטוס</div>
            <select
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="">הכל</option>
              {FIELD_SCHEDULE_STATUSES.map((s) => (
                <option key={s} value={s}>{FIELD_SCHEDULE_STATUS_LABELS[s] ?? s}</option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>תאריך</TableHead>
                <TableHead>שעה</TableHead>
                <TableHead>לקוח</TableHead>
                <TableHead>פרויקט</TableHead>
                <TableHead>כתובת</TableHead>
                <TableHead>עיר</TableHead>
                <TableHead>טכנאי</TableHead>
                <TableHead>קטגוריה</TableHead>
                <TableHead>סטטוס</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((p) => (
                <TableRow key={p.id} className={fieldScheduleRowStyle(p.status)}>
                  <TableCell>
                    <input
                      type="date"
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                      value={p.siteVisitDate ? new Date(p.siteVisitDate).toLocaleDateString('en-CA') : ''}
                      onChange={(e) => onDateChange(p.id, e.target.value)}
                    />
                  </TableCell>
                  <TableCell>
                    <input
                      type="time"
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                      value={p.siteVisitTime ?? ''}
                      onChange={(e) => onTimeChange(p.id, e.target.value)}
                    />
                  </TableCell>
                  <TableCell>{p.customer?.name || p.client || '-'}</TableCell>
                  <TableCell>{p.name}</TableCell>
                  <TableCell className="max-w-[260px]">
                    <div className="truncate" title={p.address ?? ''}>{p.address ?? '-'}</div>
                  </TableCell>
                  <TableCell>{p.city ?? '-'}</TableCell>
                  <TableCell>
                    <select
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                      value={p.assignedTechnicianId ?? ''}
                      onChange={(e) => onTechnicianChange(p.id, e.target.value)}
                    >
                      <option value="">—</option>
                      {technicians.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell>{p.serviceCategory ?? '-'}</TableCell>
                  <TableCell>
                    <select
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                      value={p.status}
                      onChange={(e) => onStatusChange(p.id, e.target.value)}
                    >
                      {FIELD_SCHEDULE_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {FIELD_SCHEDULE_STATUS_LABELS[s] ?? s}
                        </option>
                      ))}
                    </select>
                  </TableCell>
                </TableRow>
              ))}
              {sorted.length === 0 && (
                <TableRow>
                  <TableCell className="py-10 text-center text-slate-500" colSpan={9}>
                    אין ביקורים בהתאם למסננים
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function TasksPage({
  tasks,
  setTasks,
  onReloadTasks,
  currentUser,
  projects,
  customers,
  users,
}: {
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  onReloadTasks?: () => void | Promise<void>;
  currentUser: AppUser;
  projects: Project[];
  customers: Customer[];
  users: AppUser[];
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    title: '',
    description: '',
    ownerId: currentUser.id,
    projectId: '',
    customerId: '',
    dueDate: '',
    priority: 'MEDIUM',
    status: 'OPEN',
    type: 'GENERAL',
  });

  useEffect(() => {
    setForm((p) => ({ ...p, ownerId: currentUser.id }));
  }, [currentUser.id]);

  const priorityLabel = (priority: string) => {
    const map: Record<string, string> = {
      LOW: 'נמוכה',
      MEDIUM: 'בינונית',
      HIGH: 'גבוהה',
      URGENT: 'דחופה',
    };
    return map[(priority || '').toUpperCase()] || priority || '-';
  };

  const statusLabel = (status: string) => {
    const map: Record<string, string> = {
      OPEN: 'פתוחה',
      IN_PROGRESS: 'בביצוע',
      DONE: 'הושלמה',
      CANCELLED: 'בוטלה',
    };
    return map[(status || '').toUpperCase()] || status || '-';
  };

  const taskTypeLabel = (type: string) => {
    const map: Record<string, string> = {
      SALES_FOLLOWUP: 'מעקב מכירות',
      QUOTE_PREPARATION: 'הכנת הצעת מחיר',
      COORDINATION: 'תיאום',
      FIELD_WORK: 'עבודת שטח',
      REPORT_WRITING: 'כתיבת דוח',
      REVIEW: 'בקרה',
      COLLECTION: 'גבייה',
      GENERAL: 'כללי',
    };
    return map[(type || '').toUpperCase()] || type || '-';
  };

  const createTask = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    setError('');
    try {
      const payload: any = {
        title: form.title.trim(),
        description: form.description || null,
        ownerId: form.ownerId,
        projectId: form.projectId || null,
        customerId: form.customerId || null,
        dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : null,
        priority: form.priority,
        status: form.status,
        type: form.type,
      };
      const res = await apiFetch(apiUrl('/tasks'), {
        method: 'POST',
        authUser: currentUser,
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      await res.json();
      await onReloadTasks?.();
      setOpen(false);
      setForm({
        title: '',
        description: '',
        ownerId: currentUser.id,
        projectId: '',
        customerId: '',
        dueDate: '',
        priority: 'MEDIUM',
        status: 'OPEN',
        type: 'GENERAL',
      });
    } catch {
      setError('יצירת משימה נכשלה. נסה שוב מאוחר יותר.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: galit.text }}>משימות</h1>
          <p className="mt-1 text-slate-500">משימות מחוברות לפרויקטים ולקוחות</p>
        </div>
        <Button className="rounded-2xl" style={{ background: galit.primary }} onClick={() => setOpen(true)}>
          <Plus className="ml-2 h-4 w-4" />
          משימה חדשה
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>כותרת</TableHead>
                <TableHead>פרויקט</TableHead>
                <TableHead>לקוח</TableHead>
                <TableHead>אחראי</TableHead>
                <TableHead>תאריך יעד</TableHead>
                <TableHead>עדיפות</TableHead>
                <TableHead>סטטוס</TableHead>
                <TableHead>סוג</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((t) => (
                <TableRow key={t.id} className="hover:bg-slate-50">
                  <TableCell>
                    <div className="font-medium">{t.title}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {t.description ? `תיאור/הערות: ${t.description}` : 'אין תיאור/הערות'}
                    </div>
                  </TableCell>
                  <TableCell>{t.projectName || '-'}</TableCell>
                  <TableCell>{t.customerName || '-'}</TableCell>
                  <TableCell>{t.owner || '-'}</TableCell>
                  <TableCell>{t.due || '-'}</TableCell>
                  <TableCell>{priorityLabel(t.priority)}</TableCell>
                  <TableCell>{statusLabel(t.status || 'OPEN')}</TableCell>
                  <TableCell>{taskTypeLabel(t.type || 'GENERAL')}</TableCell>
                </TableRow>
              ))}
              {tasks.length === 0 && (
                <TableRow>
                  <TableCell className="py-10 text-center text-slate-500" colSpan={8}>
                    אין משימות להצגה
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="משימה חדשה" maxWidth="max-w-2xl">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <FormField label="כותרת משימה">
              <Input
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="כותרת משימה"
              />
            </FormField>
          </div>
          <div className="md:col-span-2">
            <FormField label="תיאור/הערות">
              <Textarea
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="תיאור/הערות"
              />
            </FormField>
          </div>
          <div className="md:col-span-2">
            <FormField label="שיוך">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-xs text-slate-500">פרויקט</div>
                  <select
                    className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    value={form.projectId}
                    onChange={(e) => setForm((p) => ({ ...p, projectId: e.target.value }))}
                  >
                    <option value="">—</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.projectNumber ? `${p.projectNumber} · ${p.name}` : p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="mb-1 text-xs text-slate-500">לקוח</div>
                  <select
                    className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    value={form.customerId}
                    onChange={(e) => setForm((p) => ({ ...p, customerId: e.target.value }))}
                  >
                    <option value="">—</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </FormField>
          </div>

          <div>
            <FormField label="אחראי">
              <select
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
                value={form.ownerId}
                onChange={(e) => setForm((p) => ({ ...p, ownerId: e.target.value }))}
                disabled={currentUser.role === 'sales' || currentUser.role === 'technician'}
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          <div>
            <FormField label="תאריך יעד">
              <input
                type="date"
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
                value={form.dueDate}
                onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))}
              />
            </FormField>
          </div>

          <div>
            <FormField label="עדיפות">
              <select
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
                value={form.priority}
                onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))}
              >
                <option value="LOW">{priorityLabel('LOW')}</option>
                <option value="MEDIUM">{priorityLabel('MEDIUM')}</option>
                <option value="HIGH">{priorityLabel('HIGH')}</option>
                <option value="URGENT">{priorityLabel('URGENT')}</option>
              </select>
            </FormField>
          </div>

          <div>
            <FormField label="סטטוס">
              <select
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
                value={form.status}
                onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
              >
                <option value="OPEN">{statusLabel('OPEN')}</option>
                <option value="IN_PROGRESS">{statusLabel('IN_PROGRESS')}</option>
                <option value="DONE">{statusLabel('DONE')}</option>
                <option value="CANCELLED">{statusLabel('CANCELLED')}</option>
              </select>
            </FormField>
          </div>

          <div className="md:col-span-2">
            <FormField label="סוג">
              <select
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
                value={form.type}
                onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
              >
                <option value="SALES_FOLLOWUP">{taskTypeLabel('SALES_FOLLOWUP')}</option>
                <option value="QUOTE_PREPARATION">{taskTypeLabel('QUOTE_PREPARATION')}</option>
                <option value="COORDINATION">{taskTypeLabel('COORDINATION')}</option>
                <option value="FIELD_WORK">{taskTypeLabel('FIELD_WORK')}</option>
                <option value="REPORT_WRITING">{taskTypeLabel('REPORT_WRITING')}</option>
                <option value="REVIEW">{taskTypeLabel('REVIEW')}</option>
                <option value="COLLECTION">{taskTypeLabel('COLLECTION')}</option>
                <option value="GENERAL">{taskTypeLabel('GENERAL')}</option>
              </select>
            </FormField>
          </div>

          {error && <div className="md:col-span-2 rounded-2xl bg-red-50 px-4 py-2 text-xs text-red-700">{error}</div>}
          <div className="md:col-span-2">
            <Button className="w-full" style={{ background: galit.primary }} onClick={createTask}>
              {saving ? 'שומר...' : 'שמור'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function EnvironmentalTestsPage() {
  const tests = [
    { id: 'TST-1001', client: 'אפקון', type: 'בדיקת קרינה', site: 'מגדל עזריאלי', status: 'בביצוע' },
    { id: 'TST-1002', client: 'שרה לוי', type: 'בדיקת ראדון', site: 'בית פרטי רעננה', status: 'הסתיים' },
    { id: 'TST-1003', client: 'עיריית רעננה', type: 'בדיקת איכות אוויר', site: 'בית ספר', status: 'מתוכנן' },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold" style={{ color: galit.text }}>בדיקות סביבתיות</h1>
        <p className="mt-1 text-slate-500">ניהול בדיקות קרינה, ראדון, אקוסטיקה ואיכות אוויר</p>
      </div>

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>מספר בדיקה</TableHead>
                <TableHead>לקוח</TableHead>
                <TableHead>סוג בדיקה</TableHead>
                <TableHead>אתר</TableHead>
                <TableHead>סטטוס</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tests.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>-</TableCell>
                  <TableCell>{t.client}</TableCell>
                  <TableCell>{t.type}</TableCell>
                  <TableCell>{t.site}</TableCell>
                  <TableCell>
                    <Badge className="bg-slate-100 text-slate-700">{t.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function AlertsPage() {
  const alerts = [
    { title: 'הצעת מחיר פגה בעוד יומיים', icon: Clock3 },
    { title: 'פרויקט ממתין להשלמת דוח', icon: AlertTriangle },
    { title: 'הצעת מחיר נחתמה ונפתח פרויקט חדש', icon: CheckCircle2 },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold" style={{ color: galit.text }}>התראות</h1>
        <p className="mt-1 text-slate-500">אירועים חכמים, חתימות ותזכורות</p>
      </div>
      <div className="space-y-3">
        {alerts.map((a, idx) => {
          const Icon = a.icon;
          return (
            <Card key={idx}>
              <CardContent className="flex items-center gap-4 p-5">
                <div className="rounded-2xl p-3" style={{ background: galit.soft }}>
                  <Icon className="h-5 w-5" style={{ color: galit.primary }} />
                </div>
                <div className="font-medium">{a.title}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function UsersPage({
  users,
  onReloadUsers,
  currentUser,
}: {
  users: AppUser[];
  onReloadUsers?: () => void | Promise<void>;
  currentUser: AppUser;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState<{
    name: string;
    email: string;
    password: string;
    role: AppUserRole;
    status: 'פעיל' | 'לא פעיל';
    phone: string;
    department: string;
  }>({
    name: '',
    email: '',
    password: '',
    role: 'sales',
    status: 'פעיל',
    phone: '',
    department: '',
  });

  const employeeStatusLabel = (status: string) => {
    const map: Record<string, string> = {
      ACTIVE: 'פעיל',
      INACTIVE: 'לא פעיל',
      פעיל: 'פעיל',
      'לא פעיל': 'לא פעיל',
    };
    return map[(status || '').toString().toUpperCase()] || map[status] || status || '-';
  };

  const startCreate = () => {
    setForm({
      name: '',
      email: '',
      password: '',
      role: 'sales',
      status: 'פעיל',
      phone: '',
      department: '',
    });
    setFormError('');
    setOpen(true);
  };

  const saveUser = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) {
      setFormError('שם, אימייל וסיסמה הם שדות חובה.');
      return;
    }

    const normalizedEmail = normalizeEmail(form.email);
    if (!validateEmail(normalizedEmail)) {
      setFormError('אימייל לא תקין');
      return;
    }

    const emailExists = users.some((u) => normalizeEmail(u.email) === normalizedEmail);
    if (emailExists) {
      setFormError('אימייל זה כבר קיים במערכת');
      return;
    }

    setSaving(true);
    setFormError('');

    const payload: any = {
      name: form.name,
      email: normalizedEmail,
      password: form.password,
      role: form.role.toUpperCase(), // ADMIN / MANAGER / SALES / TECHNICIAN
      status: form.status === 'לא פעיל' ? 'INACTIVE' : 'ACTIVE',
      phone: form.phone || null,
      department: form.department || null,
    };

    try {
      const res = await apiFetch(apiUrl('/users'), {
        method: 'POST',
        authUser: currentUser,
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('יצירת משתמש נכשלה');
      const apiUser = await res.json();

      const normalized: AppUser = {
        id: apiUser.id,
        name: apiUser.name,
        email: apiUser.email,
        role: (apiUser.role || 'SALES').toString().toLowerCase() as AppUserRole,
        password: '******',
        status: apiUser.status === 'INACTIVE' ? 'לא פעיל' : 'פעיל',
        canViewFinance: !!apiUser.canViewFinance,
        canEditFinance: !!apiUser.canEditFinance,
        canDeleteCustomers: !!apiUser.canDeleteCustomers,
        canDeleteLeads: !!apiUser.canDeleteLeads,
        canManageUsers: !!apiUser.canManageUsers,
        canManagePermissions: !!apiUser.canManagePermissions,
        canViewAllRecords: !!apiUser.canViewAllRecords,
      };

      await onReloadUsers?.();
      setOpen(false);
    } catch {
      setFormError('יצירת עובד נכשלה. נסה שוב מאוחר יותר.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: galit.text }}>משתמשים והרשאות</h1>
          <p className="mt-1 text-slate-500">ניהול עובדים, תפקידים והרשאות במערכת</p>
        </div>
        <Button className="rounded-2xl" style={{ background: galit.primary }} onClick={startCreate}>
          <Plus className="ml-2 h-4 w-4" />
          עובד חדש
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard title="סה״כ משתמשים" value={users.length} sub="במערכת" icon={Users} />
        <KpiCard title="מנהלי מערכת" value={users.filter((u) => u.role === 'admin').length} sub="גישה מלאה" icon={UserCircle2} />
        <KpiCard title="טכנאים" value={users.filter((u) => u.role === 'technician').length} sub="בדיקות ושטח" icon={AlertTriangle} />
        <KpiCard title="מכירות ומנהלים" value={users.filter((u) => u.role === 'sales' || u.role === 'manager').length} sub="ניהול ומכירות" icon={CheckCircle2} />
      </div>

      <Card>
        <CardContent className="p-3 sm:p-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>שם</TableHead>
                <TableHead>אימייל</TableHead>
                <TableHead>תפקיד</TableHead>
                <TableHead>סטטוס</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>{user.name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <Badge className={roleBadge(user.role)}>{roleLabel(user.role)}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className="bg-green-100 text-green-700">{employeeStatusLabel(user.status)}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="עובד חדש">
        <div className="space-y-3">
          <FormField label="שם מלא">
            <Input
              placeholder="שם מלא"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </FormField>
          <FormField label="אימייל">
            <EmailInput
              placeholder="אימייל"
              value={form.email}
              onChange={(v) => setForm((p) => ({ ...p, email: v }))}
            />
          </FormField>
          <FormField label="סיסמה">
            <Input
              placeholder="סיסמה"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </FormField>
          <FormField label="טלפון (אופציונלי)">
            <PhoneInput
              placeholder="טלפון (אופציונלי)"
              value={form.phone}
              onChange={(v) => setForm({ ...form, phone: v })}
            />
          </FormField>
          <FormField label="מחלקה (אופציונלי)">
            <Input
              placeholder="מחלקה (אופציונלי)"
              value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value })}
            />
          </FormField>
          <FormField label="תפקיד">
            <select
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-slate-400"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as AppUserRole })}
            >
              {(['admin', 'manager', 'sales', 'technician', 'expert', 'billing'] as AppUserRole[]).map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r)}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="סטטוס">
            <Select
              value={form.status}
              onChange={(v) => setForm({ ...form, status: v as 'פעיל' | 'לא פעיל' })}
              options={['פעיל', 'לא פעיל']}
            />
          </FormField>
          {formError && (
            <div className="rounded-2xl bg-red-50 px-4 py-2 text-xs text-red-700">
              {formError}
            </div>
          )}
          <Button className="w-full" style={{ background: galit.primary }} onClick={saveUser}>
            {saving ? 'שומר...' : 'שמור'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function LoginPage({
  onLogin,
  error,
}: {
  onLogin: (email: string, password: string) => void;
  error: string;
}) {
  const [email, setEmail] = useState('admin@galit.local');
  const [password, setPassword] = useState('1234');

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4" dir="rtl">
      <div className="grid w-full max-w-6xl overflow-hidden rounded-[32px] bg-white shadow-2xl lg:grid-cols-2">
        {/* Left hero / brand panel */}
        <div
          className="hidden bg-slate-900 p-10 text-white lg:flex lg:flex-col lg:justify-between"
          style={{ background: `linear-gradient(135deg, ${galit.dark}, ${galit.primary})` }}
        >
          <div className="space-y-8">
            <img
              src={galitLogo}
              alt="גלית - החברה לאיכות הסביבה"
              className="h-32 w-auto"
            />
            <div>
              <div className="text-3xl font-bold">מערכת ניהול גלית</div>
              <div className="mt-3 max-w-md text-sm text-white/85">
                ניהול לקוחות, בדיקות, משימות, הצעות מחיר ודוחות במקום אחד – לחברות סביבתיות ומהנדסים.
              </div>
            </div>
            <ul className="mt-4 space-y-2 text-sm text-white/90">
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-white" />
                <span>ניהול לידים ולקוחות</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-white" />
                <span>תפעול בדיקות סביבתיות</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-white" />
                <span>משימות ותהליכי עבודה</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-white" />
                <span>הצעות מחיר ומעקב ביצוע</span>
              </li>
            </ul>
          </div>
          <div className="mt-8 space-y-2 text-xs text-white/75">
            <div>מנהל מערכת — גישה מלאה לכל המערכת</div>
            <div>טכנאי — בדיקות, פרויקטים ומשימות</div>
            <div>מכירות — לידים, לקוחות, הצעות מחיר</div>
            <div>מנהל — דשבורד, ניהול ותפעול</div>
          </div>
        </div>

        {/* Right login card */}
        <div className="p-4 sm:p-8 md:p-10">
          <div className="mx-auto w-full max-w-md">
            <div className="rounded-3xl border border-slate-100 bg-white/90 p-6 shadow-sm sm:p-8">
              <div className="flex flex-col items-center text-center">
                <img
                  src={galitLogo}
                  alt="גלית - החברה לאיכות הסביבה"
                  className="mb-4 h-16 w-auto sm:h-20"
                />
                <h1 className="text-2xl font-bold sm:text-3xl" style={{ color: galit.text }}>
                  מערכת ניהול גלית
                </h1>
                <p className="mt-2 text-sm text-slate-500">
                  ניהול לקוחות, בדיקות, משימות, הצעות מחיר ודוחות במקום אחד
                </p>
              </div>

              <div className="mt-8 space-y-4">
                <FormField label="אימייל">
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="אימייל" />
                </FormField>
                <FormField label="סיסמה">
                  <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="סיסמה" type="password" />
                </FormField>
                {error && (
                  <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}
                <Button
                  className="w-full rounded-2xl py-2.5 text-base font-semibold"
                  style={{ background: galit.primary }}
                  onClick={() => onLogin(email, password)}
                >
                  התחבר
                </Button>
              </div>

              <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-xs text-slate-600 sm:text-sm">
                <div className="font-semibold text-slate-800">משתמשי דמו</div>
                <div className="mt-2">admin@galit.local / 1234</div>
                <div>technician@galit.local / 1234</div>
                <div>sales@galit.local / 1234</div>
                <div>manager@galit.local / 1234</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GalitCRMPrototype() {
  const [current, setCurrent] = useState('dashboard');
  const [view, setView] = useState('dashboard');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [pendingSettingsTab, setPendingSettingsTab] = useState<SettingsToolbarJumpTab | null>(null);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [authBootstrapped, setAuthBootstrapped] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [users, setUsers] = useState<AppUser[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [timeline] = useState<TimelineEvent[]>(timelineSeed);
  const [customerFull, setCustomerFull] = useState<any | null>(null);
  const [customerFullLoading, setCustomerFullLoading] = useState(false);
  /** Set before navigating to 'quotes' from customer card — pre-fills the customer picker */
  const [newQuoteCustomerId, setNewQuoteCustomerId] = useState<string | null>(null);
  /** Set when opening QuoteNewScreen from customer card contact — pre-fills contact field */
  const [newQuoteContactId, setNewQuoteContactId] = useState<string | null>(null);
  const [newInteractionContactId, setNewInteractionContactId] = useState<string | null>(null);
  const [customerCardContactName, setCustomerCardContactName] = useState<string | null>(null);
  /** Tracks whichever contact row the user last clicked inside the customer card.
   *  Kept in sync via onContactSelected callback — used when toolbar "חדש → הצעה" fires. */
  const [customerCardContactId, setCustomerCardContactId] = useState<string | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [leadsError, setLeadsError] = useState('');
  const [customersError, setCustomersError] = useState('');
  const [customerClassifications, setCustomerClassifications] = useState<CustomerClassificationDto[]>([]);
  const [usersError, setUsersError] = useState('');
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [quoteSearchOpen, setQuoteSearchOpen] = useState(false);
  /** true when we opened the customer card in "new customer" creation mode */
  const [isNewCustomerMode, setIsNewCustomerMode] = useState(false);
  const [quickCreateBusy, setQuickCreateBusy] = useState(false);
  const [quickCreateError, setQuickCreateError] = useState('');
  const [quickCreateSuccess, setQuickCreateSuccess] = useState('');
  const [topNotice, setTopNotice] = useState('');
  const [workMode, setWorkMode] = useState<'OFFICE' | 'FIELD' | ''>('');
  const [currentProjectId, setCurrentProjectId] = useState('');
  const [quickCreateForm, setQuickCreateForm] = useState({
    fullName: '',
    phone: '',
    email: '',
    companyName: '',
    contactName: '',
    city: '',
    address: '',
    serviceType: 'קרינה',
    leadSource: 'טלפון',
    assignedUserId: '',
    callSummary: '',
    internalNotes: '',
  });

  const quickCreateNormalizedEmail = useMemo(
    () => normalizeEmail(quickCreateForm.email),
    [quickCreateForm.email],
  );

  const quickCreateDuplicateCustomer = useMemo(() => {
    if (!quickCreateNormalizedEmail) return null;
    return customers.find((c) => normalizeEmail(c.email || '') === quickCreateNormalizedEmail) || null;
  }, [customers, quickCreateNormalizedEmail]);

  const quickCreateDuplicateLead = useMemo(() => {
    if (!quickCreateNormalizedEmail) return null;
    return leads.find((l) => normalizeEmail(l.email || '') === quickCreateNormalizedEmail) || null;
  }, [leads, quickCreateNormalizedEmail]);

  const quickCreateEmailDuplicateWarning =
    quickCreateDuplicateCustomer || quickCreateDuplicateLead ? 'קיים כבר ליד/לקוח עם אימייל זה' : '';

  useEffect(() => {
    if (!currentUser) return;
    if (!canAccess(currentUser.role, 'leads')) return;
    let isMounted = true;

    setLeadsError('');
    apiFetch(apiUrl('/leads'), { authUser: currentUser })
      .then((res) => {
        if (!res.ok) throw new Error('טעינת נתונים נכשלה');
        return res.json();
      })
      .then((data) => {
        if (!isMounted || !Array.isArray(data)) return;

        const normalized: Lead[] = data.map((lead: any, index: number) => normalizeLeadRowFromApi(lead, index));

        setLeads(normalized);
      })
      .catch(() => {
        if (isMounted) {
          setLeadsError('טעינת לידים נכשלה. נסה שוב מאוחר יותר.');
        }
      });

    return () => {
      isMounted = false;
    };
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    if (!canAccess(currentUser.role, 'projects')) return;
    let isMounted = true;
    apiFetch(apiUrl('/projects'), { authUser: currentUser })
      .then((res) => {
        if (!res.ok) throw new Error('טעינת פרויקטים נכשלה');
        return res.json();
      })
      .then((data) => {
        if (!isMounted || !Array.isArray(data)) return;
        const normalized: Project[] = data.map((p: any) => ({
          id: p.id,
          importLegacyId: p.importLegacyId ?? undefined,
          projectNumber: p.projectNumber ?? undefined,
          name: p.name,
          client: p.client,
          status: p.status ?? 'NEW',
          progress: p.progress ?? 0,
          owner: p.assignedTechnician?.name ?? '',
          due: p.dueDate ? new Date(p.dueDate).toLocaleDateString('he-IL') : '',
          service: p.service ?? undefined,
          siteVisitDate: p.siteVisitDate,
          siteVisitTime: p.siteVisitTime ?? undefined,
          city: p.city ?? undefined,
          urgency: p.urgency ?? undefined,
          notes: p.notes ?? undefined,
          assignedTechnicianId: p.assignedTechnicianId ?? undefined,
          assignedTechnician: p.assignedTechnician ? { id: p.assignedTechnician.id, name: p.assignedTechnician.name } : undefined,
          customerId: p.customerId ?? undefined,
          customer: p.customer ? { id: p.customer.id, name: p.customer.name, city: p.customer.city } : undefined,
          assignedReportWriterId: p.assignedReportWriterId ?? undefined,
          assignedReportWriter: p.assignedReportWriter ? { id: p.assignedReportWriter.id, name: p.assignedReportWriter.name } : undefined,
          serviceCategory: p.serviceCategory ?? undefined,
          serviceSubType: p.serviceSubType ?? undefined,
          address: p.address ?? undefined,
          createdAt: p.createdAt ?? undefined,
        }));
        setProjects(normalized);
      })
      .catch(() => {
        if (isMounted) setProjects([]);
      });
    return () => { isMounted = false; };
  }, [currentUser]);

  const openProjectDetails = (project: Project) => {
    setSelectedProject(project);
    setCurrent('project-details');
    if (typeof window !== 'undefined') {
      const url = `${window.location.pathname}?view=project&id=${project.id}`;
      window.history.pushState({}, '', url);
    }
  };

  const closeProjectDetails = () => {
    setSelectedProject(null);
    setCurrent(canAccess(currentUser?.role ?? 'admin', 'projects') ? 'projects' : 'dashboard');
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', window.location.pathname);
    }
  };

  const reloadUsers = useCallback(async () => {
    if (!currentUser) return;
    /** כל תפקיד מחובר יכול לקרוא ל-GET /users (לשימושים במסכים ודרופדאונים); השרת מאמת */
    setUsersError('');
    try {
      const res = await apiFetch(apiUrl('/users'), { authUser: currentUser });
      if (!res.ok) throw new Error('טעינת עובדים נכשלה');
      const data = await res.json();
      if (!Array.isArray(data)) return;
      const normalized: AppUser[] = data.map((u: any) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: (u.role || 'SALES').toString().toLowerCase() as AppUserRole,
        password: '******',
        status: u.status === 'INACTIVE' ? 'לא פעיל' : 'פעיל',
        canViewFinance: !!u.canViewFinance,
        canEditFinance: !!u.canEditFinance,
        canDeleteCustomers: !!u.canDeleteCustomers,
        canDeleteLeads: !!u.canDeleteLeads,
        canManageUsers: !!u.canManageUsers,
        canManagePermissions: !!u.canManagePermissions,
        canViewAllRecords: !!u.canViewAllRecords,
      }));
      setUsers(normalized);
    } catch {
      setUsersError('טעינת משתמשים נכשלה. נסה שוב מאוחר יותר.');
    }
  }, [currentUser]);

  useEffect(() => {
    void reloadUsers();
  }, [reloadUsers]);

  useEffect(() => {
    if (!currentUser) return;
    if (!canAccess(currentUser.role, 'customers')) return;
    let isMounted = true;
    setCustomersError('');

    apiFetch(apiUrl('/customers'), { authUser: currentUser })
      .then((res) => {
        if (!res.ok) throw new Error('טעינת לקוחות נכשלה');
        return res.json();
      })
      .then((data) => {
        if (!isMounted || !Array.isArray(data)) return;
        setCustomers(data);
      })
      .catch(() => {
        if (isMounted) {
          setCustomersError('טעינת לקוחות נכשלה. נסה שוב מאוחר יותר.');
        }
      });

    return () => {
      isMounted = false;
    };
  }, [currentUser]);

  const reloadLeads = useCallback(async () => {
    if (!currentUser) return;
    if (!canAccess(currentUser.role, 'leads')) return;
    setLeadsError('');
    try {
      const res = await apiFetch(apiUrl('/leads'), { authUser: currentUser });
      if (!res.ok) throw new Error('טעינת לידים נכשלה');
      const data = await res.json();
      if (!Array.isArray(data)) return;
      setLeads(data.map((lead: any, index: number) => normalizeLeadRowFromApi(lead, index)));
    } catch {
      setLeadsError('טעינת לידים נכשלה. נסה שוב מאוחר יותר.');
    }
  }, [currentUser]);

  const reloadProjects = useCallback(async () => {
    if (!currentUser) return;
    if (!canAccess(currentUser.role, 'projects')) return;
    try {
      const res = await apiFetch(apiUrl('/projects'), { authUser: currentUser });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (!Array.isArray(data)) return;
      const normalized: Project[] = data.map((p: any) => ({
        id: p.id,
        importLegacyId: p.importLegacyId ?? undefined,
        projectNumber: p.projectNumber ?? undefined,
        name: p.name,
        client: p.client,
        status: p.status ?? 'NEW',
        progress: p.progress ?? 0,
        owner: p.assignedTechnician?.name ?? '',
        due: p.dueDate ? new Date(p.dueDate).toLocaleDateString('he-IL') : '',
        service: p.service ?? undefined,
        siteVisitDate: p.siteVisitDate,
        siteVisitTime: p.siteVisitTime ?? undefined,
        city: p.city ?? undefined,
        urgency: p.urgency ?? undefined,
        notes: p.notes ?? undefined,
        assignedTechnicianId: p.assignedTechnicianId ?? undefined,
        assignedTechnician: p.assignedTechnician ? { id: p.assignedTechnician.id, name: p.assignedTechnician.name } : undefined,
        customerId: p.customerId ?? undefined,
        customer: p.customer ? { id: p.customer.id, name: p.customer.name, city: p.customer.city } : undefined,
        assignedReportWriterId: p.assignedReportWriterId ?? undefined,
        assignedReportWriter: p.assignedReportWriter
          ? { id: p.assignedReportWriter.id, name: p.assignedReportWriter.name }
          : undefined,
        serviceCategory: p.serviceCategory ?? undefined,
        serviceSubType: p.serviceSubType ?? undefined,
        address: p.address ?? undefined,
        createdAt: p.createdAt ?? undefined,
      }));
      setProjects(normalized);
    } catch {
      /* ignore */
    }
  }, [currentUser]);

  const reloadQuotes = useCallback(async () => {
    if (!currentUser) return;
    if (!canAccess(currentUser.role, 'quotes')) return;
    try {
      const res = await apiFetch(apiUrl('/quotes'), { authUser: currentUser });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (!Array.isArray(data)) return;
      const normalized: Quote[] = data.map((q: any) => ({
        id: q.id,
        importLegacyId: q.importLegacyId ?? undefined,
        quoteNumber: q.quoteNumber ?? null,
        customerId: q.customerId ?? null,
        customerName: q.customer?.name ?? undefined,
        opportunityId: q.opportunityId ?? null,
        opportunityName: q.opportunity?.projectOrServiceName ?? undefined,
        projectId: q.projectId ?? null,
        client: q.customer?.name ?? q.customerId ?? '',
        service: q.service,
        description: q.description ?? undefined,
        amount: Number(q.amount ?? q.amountBeforeVat ?? 0),
        amountBeforeVat: q.amountBeforeVat ?? q.amount ?? null,
        vatPercent: q.vatPercent ?? null,
        discountType: q.discountType ?? null,
        discountValue: q.discountValue ?? null,
        totalAmount: q.totalAmount ?? null,
        status: q.status,
        validTo: (q.validTo || q.validityDate) ? new Date(q.validTo || q.validityDate).toISOString().slice(0, 10) : '',
        validityDate: q.validityDate ? new Date(q.validityDate).toISOString().slice(0, 10) : null,
        pdfPath: q.pdfPath ?? undefined,
        notes: q.notes ?? null,
        createdAt: q.createdAt ?? undefined,
        updatedAt: q.updatedAt ?? undefined,
        leadId: q.leadId ?? null,
      }));
      setQuotes(normalized);
    } catch {
      /* ignore */
    }
  }, [currentUser]);

  const reloadCustomers = useCallback(async () => {
    if (!currentUser) return;
    if (!canAccess(currentUser.role, 'customers')) return;
    setCustomersError('');
    try {
      const res = await apiFetch(apiUrl('/customers'), { authUser: currentUser });
      if (!res.ok) throw new Error('טעינת לקוחות נכשלה');
      const data = await res.json();
      if (Array.isArray(data)) setCustomers(data);
    } catch {
      setCustomersError('טעינת לקוחות נכשלה. נסה שוב מאוחר יותר.');
    }
  }, [currentUser]);

  const reloadTasks = useCallback(async () => {
    if (!currentUser) return;
    if (!canAccess(currentUser.role, 'tasks')) return;
    try {
      const res = await apiFetch(apiUrl('/tasks'), { authUser: currentUser });
      if (!res.ok) throw new Error('טעינת משימות נכשלה');
      const data = await res.json();
      if (!Array.isArray(data)) return;
      const normalized: Task[] = data.map((t: any) => ({
        id: t.id,
        title: t.title,
        description: t.description ?? '',
        ownerId: t.ownerId ?? undefined,
        owner: t.owner?.name ?? t.ownerId ?? '',
        projectId: t.projectId ?? undefined,
        projectName: t.project?.name ?? undefined,
        customerId: t.customerId ?? undefined,
        customerName: t.customer?.name ?? undefined,
        dueDate: t.dueDate ?? undefined,
        due: t.dueDate ? new Date(t.dueDate).toLocaleDateString('he-IL') : '',
        priority: t.priority || 'MEDIUM',
        status: t.status ?? undefined,
        type: t.type ?? undefined,
      }));
      setTasks(normalized);
    } catch {
      setTasks([]);
    }
  }, [currentUser]);

  useEffect(() => {
    void reloadTasks();
  }, [reloadTasks]);

  const reloadCustomerClassifications = useCallback(async () => {
    if (!currentUser) return;
    if (!canAccess(currentUser.role, 'customers')) return;
    try {
      const res = await apiFetch(apiUrl('/customer-classifications'), {
        authUser: currentUser,
      });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) setCustomerClassifications(data as CustomerClassificationDto[]);
    } catch {
      // ignore — טופס משתמש בברירות מחדל מקומיות
    }
  }, [currentUser]);

  useEffect(() => {
    void reloadCustomerClassifications();
  }, [reloadCustomerClassifications]);

  const customerTypeLabelMap = useMemo(
    () => buildCustomerTypeLabelMap(customerClassifications),
    [customerClassifications],
  );

  useEffect(() => {
    if (!currentUser) return;
    if (!canAccess(currentUser.role, 'quotes')) return;
    let isMounted = true;
    apiFetch(apiUrl('/quotes'), { authUser: currentUser })
      .then((res) => {
        if (!res.ok) throw new Error('טעינת הצעות מחיר נכשלה');
        return res.json();
      })
      .then((data) => {
        if (!isMounted || !Array.isArray(data)) return;
        const normalized: Quote[] = data.map((q: any) => ({
          id: q.id,
          importLegacyId: q.importLegacyId ?? undefined,
          quoteNumber: q.quoteNumber ?? null,
          customerId: q.customerId ?? null,
          customerName: q.customer?.name ?? undefined,
          opportunityId: q.opportunityId ?? null,
          opportunityName: q.opportunity?.projectOrServiceName ?? undefined,
          projectId: q.projectId ?? null,
          client: q.customer?.name ?? q.customerId ?? '',
          service: q.service,
          description: q.description ?? undefined,
          amount: Number(q.amount ?? q.amountBeforeVat ?? 0),
          amountBeforeVat: q.amountBeforeVat ?? q.amount ?? null,
          vatPercent: q.vatPercent ?? null,
          discountType: q.discountType ?? null,
          discountValue: q.discountValue ?? null,
          totalAmount: q.totalAmount ?? null,
          status: q.status,
          validTo: (q.validTo || q.validityDate) ? new Date(q.validTo || q.validityDate).toISOString().slice(0, 10) : '',
          validityDate: q.validityDate ? new Date(q.validityDate).toISOString().slice(0, 10) : null,
          pdfPath: q.pdfPath ?? undefined,
          notes: q.notes ?? null,
          createdAt: q.createdAt ?? undefined,
          updatedAt: q.updatedAt ?? undefined,
          leadId: q.leadId ?? null,
        }));
        setQuotes(normalized);
      })
      .catch(() => {
        // API failed — avoid showing stale mock data; list stays empty until retry/login
      });
    return () => {
      isMounted = false;
    };
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    if (!['admin', 'manager', 'sales', 'expert'].includes(currentUser.role)) return;
    let isMounted = true;
    apiFetch(apiUrl('/opportunities'), { authUser: currentUser })
      .then((res) => {
        if (!res.ok) throw new Error('טעינת הזדמנויות נכשלה');
        return res.json();
      })
      .then((data) => {
        if (!isMounted || !Array.isArray(data)) return;
        setOpportunities(data);
      })
      .catch(() => {
        // keep empty
      });
    return () => {
      isMounted = false;
    };
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    if (!['admin', 'manager', 'expert'].includes(currentUser.role)) return;
    let isMounted = true;

    apiFetch(apiUrl('/reports/dashboard'), { authUser: currentUser })
      .then((res) => {
        if (!res.ok) throw new Error('טעינת דשבורד נכשלה');
        return res.json();
      })
      .then((data) => {
        if (!isMounted) return;
        setDashboardStats({
          reportsWaitingWriting: data.reportsWaitingWriting ?? 0,
          reportsInReview: data.reportsInReview ?? 0,
          reportsSentThisWeek: data.reportsSentThisWeek ?? 0,
          samplesCollected: data.samplesCollected ?? 0,
          samplesInAnalysis: data.samplesInAnalysis ?? 0,
          abnormalSampleResults: data.abnormalSampleResults ?? 0,
          projectsWaitingForData: data.projectsWaitingForData ?? 0,
        });
      })
      .catch(() => {
        if (!isMounted) return;
        setDashboardStats({
          reportsWaitingWriting: 0,
          reportsInReview: 0,
          reportsSentThisWeek: 0,
          samplesCollected: 0,
          samplesInAnalysis: 0,
          abnormalSampleResults: 0,
          projectsWaitingForData: 0,
        });
      });

    return () => {
      isMounted = false;
    };
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;

    const syncFromUrl = () => {
      if (typeof window === 'undefined') return;
      const params = new URLSearchParams(window.location.search);
      const view = params.get('view');
      const id = params.get('id');

      /* חדש → לקוח: URL has view=new-customer — skip all sync logic */
      if (view === 'new-customer') return;

      if (view === 'customer' && id) {
        const customer = customers.find((item) => item.id === id);
        if (customer) {
          setSelectedCustomer(customer);
          setSelectedLead(null);
          setCurrent('customer-profile');
          return;
        }
      }

      if (view === 'lead' && id) {
        const lead = leads.find((item) => item.id === id);
        if (lead) {
          setSelectedLead(lead);
          setSelectedCustomer(null);
          setCurrent('lead-profile');
          return;
        }
      }

      if (view === 'project' && id) {
        const project = projects.find((item) => item.id === id);
        if (project) {
          setSelectedProject(project);
          setSelectedCustomer(null);
          setSelectedLead(null);
          setCurrent('project-details');
          return;
        }
      }

      setSelectedCustomer(null);
      setSelectedLead(null);
      if (view !== 'customer' && view !== 'lead' && current === 'customer-profile') {
        setCurrent(canAccess(currentUser.role, 'customers') ? 'customers' : 'dashboard');
      }
      if (view !== 'customer' && view !== 'lead' && current === 'lead-profile') {
        setCurrent(canAccess(currentUser.role, 'leads') ? 'leads' : 'dashboard');
      }
      if (view !== 'project' && current === 'project-details') {
        setSelectedProject(null);
        setCurrent(canAccess(currentUser.role, 'projects') ? 'projects' : 'dashboard');
      }
    };

    syncFromUrl();
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, [customers, leads, currentUser, current]);

  const loadCustomerFull = useCallback(
    async (customerId: string) => {
      setCustomerFullLoading(true);
      try {
        const res = await apiFetch(apiUrl(`/customers/${customerId}/full`), { authUser: currentUser });
        if (!res.ok) throw new Error('טעינת פרטי לקוח נכשלה');
        const data = await res.json();
        setCustomerFull(data);
      } catch {
        /* keep card usable from list snapshot if full payload fails */
      } finally {
        setCustomerFullLoading(false);
      }
    },
    [currentUser],
  );

  useEffect(() => {
    const c = customerFull?.customer as Customer | undefined;
    if (!c?.id) return;
    setSelectedCustomer((prev) => (prev && prev.id === c.id ? { ...prev, ...c } : prev));
    setCustomers((prev) => prev.map((row) => (row.id === c.id ? { ...row, ...c } : row)));
  }, [customerFull]);

  const openCustomerPage = (customer: Customer) => {
    setSelectedCustomer(customer);
    setSelectedLead(null);
    setIsNewCustomerMode(false);
    setCurrent('customer-profile');
    setCustomerFull(null);

    if (typeof window !== 'undefined') {
      const url = `${window.location.pathname}?view=customer&id=${customer.id}`;
      window.history.pushState({}, '', url);
    }

    void loadCustomerFull(customer.id).catch(() => {
      // keep existing preview-only behavior if API not available
    });
  };

  /** חדש → לקוח: פתיחת כרטיס לקוח חדש ריק */
  const handleNewCustomer = () => {
    const emptyCustomer: Customer = {
      id: '__new__',
      name: '',
      type: '',
      contactName: '',
      phone: '',
      email: '',
      city: '',
      address: '',
      status: 'active',
      services: [],
      notes: '',
    };
    setSelectedCustomer(emptyCustomer);
    setSelectedLead(null);
    setCustomerFull(null);
    setIsNewCustomerMode(true);
    setCurrent('customer-profile');
    if (typeof window !== 'undefined') {
      const url = `${window.location.pathname}?view=new-customer`;
      window.history.pushState({}, '', url);
    }
  };

  const openLeadPage = (lead: Lead) => {
    setSelectedLead(lead);
    setSelectedCustomer(null);
    setCurrent('lead-profile');
    if (typeof window !== 'undefined') {
      const url = `${window.location.pathname}?view=lead&id=${lead.id}`;
      window.history.pushState({}, '', url);
    }
  };

  const closeProfilePage = () => {
    setSelectedCustomer(null);
    setSelectedLead(null);
    setCustomerFull(null);
    setCurrent(canAccess(currentUser?.role ?? 'admin', 'dashboard') ? 'dashboard' : 'tasks');
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', window.location.pathname);
    }
  };

  const handleLogin = async (email: string, password: string) => {
    setLoginError('');
    const emailTrimmed = email.trim();
    const loginBody = { email: emailTrimmed, password };
    try {
      const res = await apiFetch(apiUrl('/auth/login'), {
        method: 'POST',
        body: JSON.stringify(loginBody),
      });

      if (res.status === 401) {
        setLoginError('אימייל או סיסמה שגויים');
        return;
      }

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `קוד שגיאה: ${res.status}`);
      }

      const data = await res.json();

      const apiRole = (data.role || '').toString().toLowerCase() as AppUserRole;
      const mappedUser: AppUser = {
        id: data.id || emailTrimmed,
        name: data.name || emailTrimmed,
        email: data.email || emailTrimmed,
        role: apiRole || 'sales',
        password: '******',
        status: 'פעיל',
        canViewFinance: !!data.canViewFinance,
        canEditFinance: !!data.canEditFinance,
        canDeleteCustomers: !!data.canDeleteCustomers,
        canDeleteLeads: !!data.canDeleteLeads,
        canManageUsers: !!data.canManageUsers,
        canManagePermissions: !!data.canManagePermissions,
        canViewAllRecords: !!data.canViewAllRecords,
      };

      setCurrentUser(mappedUser);
      try {
        localStorage.setItem(GALIT_CRM_SESSION_STORAGE_KEY, JSON.stringify(sessionPayloadFromAppUser(mappedUser)));
      } catch {
        // ignore quota / private mode
      }
      setLoginError('');
      setView('dashboard');
      setCurrent(canAccess(mappedUser.role, 'dashboard') ? 'dashboard' : 'tasks');

      // Presence: mark online + initial lastSeen
      apiFetch(apiUrl(`/users/${encodeURIComponent(mappedUser.id)}/presence`), {
        method: 'PATCH',
        authUser: mappedUser,
        body: JSON.stringify({ isOnline: true }),
      }).catch(() => {});
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('Load failed')) {
        setLoginError('לא ניתן להתחבר לשרת. בדוק שה-API זמין ושגישה מדפדפן מול השרת מוגדרת נכון.');
      } else {
        setLoginError(msg || 'אימייל או סיסמה שגויים');
      }
    }
  };

  const resetQuickCreate = () => {
    setQuickCreateForm({
      fullName: '',
      phone: '',
      email: '',
      companyName: '',
      contactName: '',
      city: '',
      address: '',
      serviceType: 'קרינה',
      leadSource: 'טלפון',
      assignedUserId: '',
      callSummary: '',
      internalNotes: '',
    });
    setQuickCreateError('');
    setQuickCreateSuccess('');
  };

  useEffect(() => {
    if (!quickCreateOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setQuickCreateOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [quickCreateOpen]);

  const buildIntakeNotes = () => {
    const parts: string[] = [];
    const summary = quickCreateForm.callSummary.trim();
    const internal = quickCreateForm.internalNotes.trim();
    const addr = quickCreateForm.address.trim();
    if (summary) parts.push(`סיכום שיחה:\n${summary}`);
    if (internal) parts.push(`הערות פנימיות:\n${internal}`);
    // For customers we don't have dedicated address field in DB; ensure it's preserved.
    if (addr) parts.push(`כתובת:\n${addr}`);
    return parts.join('\n\n') || null;
  };

  const quickCreateLead = async () => {
    const fullName = quickCreateForm.fullName.trim();
    if (!fullName || !quickCreateForm.phone.trim() || !quickCreateForm.city.trim()) return;

    const normalizedEmail = quickCreateForm.email ? normalizeEmail(quickCreateForm.email) : '';
    if (quickCreateForm.email.trim() && !validateEmail(normalizedEmail)) {
      setQuickCreateError('אימייל לא תקין');
      return;
    }

    setQuickCreateBusy(true);
    setQuickCreateError('');
    setQuickCreateSuccess('');
    try {
      const parts = fullName.split(' ');
      const payload: any = {
        firstName: parts[0] || fullName,
        lastName: parts.slice(1).join(' '),
        fullName,
        phone: quickCreateForm.phone.trim(),
        email: normalizedEmail || null,
        company: quickCreateForm.companyName.trim() || null,
        city: quickCreateForm.city.trim() || null,
        address: quickCreateForm.address.trim() || null,
        source: quickCreateForm.leadSource || null,
        serviceType: quickCreateForm.serviceType || null,
        assignedUserId: quickCreateForm.assignedUserId || null,
        notes: buildIntakeNotes(),
        leadStatus: 'NEW',
        status: 'NEW',
        service: quickCreateForm.serviceType,
      };
      const res = await apiFetch(apiUrl('/leads'), {
        method: 'POST',
        authUser: currentUser,
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      const created = await res.json();
      const normalized: Lead = {
        id: created.id,
        firstName: created.firstName ?? payload.firstName,
        lastName: created.lastName ?? payload.lastName,
        fullName: created.fullName ?? fullName,
        name: created.fullName ?? fullName,
        phone: created.phone ?? payload.phone,
        email: created.email ?? payload.email ?? undefined,
        company: created.company ?? payload.company ?? '',
        city: created.city ?? payload.city ?? undefined,
        address: created.address ?? payload.address ?? undefined,
        source: created.source ?? payload.source ?? '',
        utm_source: created.utm_source ?? undefined,
        utm_medium: created.utm_medium ?? undefined,
        utm_campaign: created.utm_campaign ?? undefined,
        utm_content: created.utm_content ?? undefined,
        utm_term: created.utm_term ?? undefined,
        service: created.service ?? payload.service ?? '',
        serviceType: created.serviceType ?? payload.serviceType ?? undefined,
        assignedUserId: created.assignedUserId ?? payload.assignedUserId ?? undefined,
        followUp1Date: created.followUp1Date ?? undefined,
        followUp2Date: created.followUp2Date ?? undefined,
        nextFollowUpDate: created.nextFollowUpDate ?? undefined,
        leadStatus: created.leadStatus ?? 'NEW',
        createdAt: created.createdAt ?? undefined,
        stage: created.stage ?? 'NEW',
        status: created.status ?? 'NEW',
        assignee: '',
        site: created.site ?? '',
        notes: created.notes ?? payload.notes ?? '',
      };
      setLeads((prev) => [normalized, ...prev]);
      setQuickCreateSuccess('נשמר בהצלחה');
      setTopNotice('פנייה נשמרה כליד');
      window.setTimeout(() => setTopNotice(''), 2500);
      setQuickCreateOpen(false);
      resetQuickCreate();
      navigateSafely('leads');
      openLeadPage(normalized);
    } catch {
      setQuickCreateError('שמירה כליד נכשלה. נסה שוב.');
    } finally {
      setQuickCreateBusy(false);
    }
  };

  const quickCreateCustomer = async () => {
    const fullName = quickCreateForm.fullName.trim();
    const phone = quickCreateForm.phone.trim();
    const city = quickCreateForm.city.trim();
    if (!fullName || !phone || !city) return;

    const normalizedEmail = quickCreateForm.email ? normalizeEmail(quickCreateForm.email) : '';
    if (quickCreateForm.email.trim() && !validateEmail(normalizedEmail)) {
      setQuickCreateError('אימייל לא תקין');
      return;
    }

    setQuickCreateBusy(true);
    setQuickCreateError('');
    setQuickCreateSuccess('');
    try {
      const isCompany = !!quickCreateForm.companyName.trim();
      const name = (quickCreateForm.companyName.trim() || fullName).trim();
      const contactName = (quickCreateForm.contactName.trim() || fullName).trim();
      const payload: any = {
        name,
        type: isCompany ? 'COMPANY' : 'PRIVATE',
        contactName,
        phone,
        email: normalizedEmail || '',
        city,
        status: 'ACTIVE',
        services: [quickCreateForm.serviceType || ''],
        notes: buildIntakeNotes(),
      };
      const res = await apiFetch(apiUrl('/customers'), {
        method: 'POST',
        authUser: currentUser,
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      const created = await res.json();
      setCustomers((prev) => [...prev, created]);
      setQuickCreateSuccess('נשמר בהצלחה');
      setTopNotice('פנייה נשמרה כלקוח');
      window.setTimeout(() => setTopNotice(''), 2500);
      setQuickCreateOpen(false);
      resetQuickCreate();
      navigateSafely('customers');
      openCustomerPage(created);
    } catch {
      setQuickCreateError('שמירה כלקוח נכשלה. נסה שוב.');
    } finally {
      setQuickCreateBusy(false);
    }
  };

  const handleLogout = () => {
    // Presence: best-effort mark offline
    if (currentUser) {
      apiFetch(apiUrl(`/users/${encodeURIComponent(currentUser.id)}/presence`), {
        method: 'PATCH',
        authUser: currentUser,
        body: JSON.stringify({ isOnline: false }),
      }).catch(() => {});
    }
    try {
      localStorage.removeItem(GALIT_CRM_SESSION_STORAGE_KEY);
    } catch {
      // ignore
    }
    setCurrentUser(null);
    setSelectedCustomer(null);
    setSelectedLead(null);
    setCurrent('dashboard');
    setLoginError('');
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', window.location.pathname);
    }
  };

  const navigateSafely = (target: string) => {
    if (!currentUser) return;
    if (!canAccess(currentUser.role, target)) return;

    // When the toolbar "חדש → הצעה" fires while a customer card is open,
    // redirect to the real QuoteNewScreen instead of QuotesPage.
    // selectedCustomer must NOT be cleared — QuoteNewScreen needs it for prefill.
    if (target === 'quotes' && current === 'customer-profile' && selectedCustomer) {
      setNewQuoteContactId(customerCardContactId);
      setCurrent('quote-new');
      if (typeof window !== 'undefined') {
        window.history.pushState({}, '', window.location.pathname);
      }
      return;
    }

    if (target === 'interaction-new' && current === 'customer-profile' && selectedCustomer) {
      setNewInteractionContactId(customerCardContactId);
      // customerCardContactName is already in state from the last onContactSelected call
      setCurrent('interaction-new');
      if (typeof window !== 'undefined') {
        window.history.pushState({}, '', window.location.pathname);
      }
      return;
    }

    if (target === 'order-new' && current === 'customer-profile' && selectedCustomer) {
      // customerCardContactId / customerCardContactName already in state
      setCurrent('order-new');
      if (typeof window !== 'undefined') {
        window.history.pushState({}, '', window.location.pathname);
      }
      return;
    }

    setCurrent(target);
    setSelectedCustomer(null);
    setSelectedLead(null);
    setIsNewCustomerMode(false);
    // When navigating to quotes via the toolbar (not from customer card),
    // clear any stale prefill so QuotesPage opens with an empty customer field.
    if (target === 'quotes') setNewQuoteCustomerId(null);
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', window.location.pathname);
    }
  };

  const consumePendingSettingsTab = useCallback(() => setPendingSettingsTab(null), []);

  const handleJumpSettingsTab = (tab: SettingsToolbarJumpTab) => {
    if (!currentUser) return;
    if (!canAccess(currentUser.role, 'settings')) return;
    setPendingSettingsTab(tab);
    navigateSafely('settings');
  };

  const focusGlobalSearch = () => {
    const el = document.getElementById(GLOBAL_SEARCH_INPUT_ID) as HTMLInputElement | null;
    el?.focus();
    el?.select?.();
  };

  const linkedCustomerForSelectedLead = selectedLead ? findCustomerByLead(selectedLead, customers) : undefined;

  // Presence heartbeat
  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    const send = () => {
      if (cancelled) return;
      apiFetch(apiUrl(`/users/${encodeURIComponent(currentUser.id)}/presence`), {
        method: 'PATCH',
        authUser: currentUser,
        body: JSON.stringify({ isOnline: true }),
      }).catch(() => {});
    };
    send();
    const t = window.setInterval(send, 90_000); // every 1.5 minutes
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [currentUser?.id, currentUser?.role]);

  const setMyWorkMode = async (mode: 'OFFICE' | 'FIELD') => {
    if (!currentUser) return;
    setWorkMode(mode);
    apiFetch(apiUrl(`/users/${encodeURIComponent(currentUser.id)}/presence`), {
      method: 'PATCH',
          authUser: currentUser,
      body: JSON.stringify({ currentWorkMode: mode, isOnline: true, currentProjectId: mode === 'OFFICE' ? null : (currentProjectId || null) }),
    }).catch(() => {});
  };

  const setMyCurrentProject = async (projectId: string) => {
    if (!currentUser) return;
    setCurrentProjectId(projectId);
    apiFetch(apiUrl(`/users/${encodeURIComponent(currentUser.id)}/presence`), {
      method: 'PATCH',
          authUser: currentUser,
      body: JSON.stringify({ currentProjectId: projectId || null, isOnline: true }),
    }).catch(() => {});
  };

  useEffect(() => {
    setCurrentUser(parseStoredSession());
    setAuthBootstrapped(true);
  }, []);

  if (!authBootstrapped) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100" dir="rtl">
        <div className="text-sm text-slate-500">טוען...</div>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginPage onLogin={handleLogin} error={loginError} />;
  }

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">
      <div className="flex min-h-0 min-h-screen flex-col">
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {false ? (
            null
          ) : (
            <>
              <div className={GALIT_TOPBAR_SPACER_CLASS} aria-hidden />
              <CrmLegacyTopNav
                current={current}
                currentUserRole={currentUser.role}
                canAccess={(role, key) => canAccess(role as AppUserRole, key)}
                onNavigate={navigateSafely}
                onFocusSearch={focusGlobalSearch}
                onOpenQuickCreate={() => {
                  resetQuickCreate();
                  setQuickCreateOpen(true);
                }}
                onJumpSettingsTab={handleJumpSettingsTab}
                onLogout={handleLogout}
                onSearchCustomer={() => setCustomerSearchOpen(true)}
                onSearchQuote={() => setQuoteSearchOpen(true)}
                onNewCustomer={handleNewCustomer}
                isCustomerCard={current === 'customer-profile'}
              />
            </>
          )}
          <div className={cn("min-h-0 flex-1 overflow-y-auto", (current === 'customer-profile' || current === 'interaction-new' || current === 'order-new') ? 'p-2 sm:p-3 lg:p-4' : 'p-4 sm:p-6 lg:p-8')}>
          <div className={cn("flex flex-col gap-3", (current === 'customer-profile' || current === 'interaction-new' || current === 'order-new') ? 'mb-1' : 'mb-4')}>
            <div className="flex items-center justify-between">
              <div className="hidden lg:block">
                {current !== 'customers' && current !== 'customer-profile' && current !== 'interaction-new' && current !== 'order-new' && (
                  <div className="text-2xl font-bold" style={{ color: galit.text }}>גלית CRM</div>
                )}
                <div className="text-xs text-slate-500">{currentUser.name} · {roleLabel(currentUser.role)}</div>
              </div>
              {current !== 'customers' && current !== 'customer-profile' && current !== 'interaction-new' && current !== 'order-new' && (
                <div className="flex-1 lg:flex lg:justify-center">
                  <GlobalSearchBar
                    inputId={GLOBAL_SEARCH_INPUT_ID}
                    currentUser={currentUser}
                    customers={customers}
                    leads={leads}
                    projects={projects}
                    onOpenCustomer={(c) => {
                      navigateSafely('customers');
                      openCustomerPage(c);
                    }}
                    onOpenLead={(l) => {
                      navigateSafely('leads');
                      openLeadPage(l);
                    }}
                    onOpenProject={(p) => {
                      navigateSafely('projects');
                      openProjectDetails(p);
                    }}
                  />
                </div>
              )}
              {current !== 'customer-profile' && current !== 'interaction-new' && current !== 'order-new' && (
              <div className="hidden lg:flex lg:items-center lg:gap-2">
                {current !== 'customers' && (
                  <>
                    <div className="flex items-center gap-2 rounded-2xl bg-white px-2 py-2 shadow-sm ring-1 ring-slate-200">
                      <button
                        className={cn(
                          'rounded-xl px-3 py-2 text-xs font-semibold transition',
                          workMode === 'OFFICE'
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
                        )}
                        onClick={() => setMyWorkMode('OFFICE')}
                      >
                        אני במשרד
                      </button>
                      <button
                        className={cn(
                          'rounded-xl px-3 py-2 text-xs font-semibold transition',
                          workMode === 'FIELD'
                            ? 'bg-sky-600 text-white'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
                        )}
                        onClick={() => setMyWorkMode('FIELD')}
                      >
                        אני בשטח
                      </button>
                    </div>
                    {workMode === 'FIELD' && (
                      <select
                        className="w-64 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-slate-400"
                        value={currentProjectId}
                        onChange={(e) => setMyCurrentProject(e.target.value)}
                      >
                        <option value="">פרויקט נוכחי</option>
                        {projects
                          .filter((p) => !['CLOSED', 'CANCELLED'].includes((p.status || '').toString()))
                          .slice(0, 50)
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.projectNumber ? `${p.projectNumber} - ${p.name}` : p.name}
                            </option>
                          ))}
                      </select>
                    )}
                  </>
                )}
                {current !== 'dashboard' && current !== 'customers' && (
                  <Button
                    style={{ background: galit.primary }}
                    onClick={() => {
                      resetQuickCreate();
                      setQuickCreateOpen(true);
                    }}
                  >
                    + לקוח / ליד חדש
                  </Button>
                )}
                <Button variant="outline" onClick={handleLogout}>התנתק</Button>
              </div>
              )}
            </div>

            {current !== 'customer-profile' && current !== 'interaction-new' && current !== 'order-new' && (
            <div className="flex items-center justify-between lg:hidden">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center rounded-full bg-white shadow-sm" style={{ width: 32, height: 32 }}>
                <img
                  src={galitLogo}
                  alt="גלית"
                  style={{ maxWidth: '70%', maxHeight: '70%' }}
                />
              </div>
              <div className="text-right">
                <div className="text-lg font-bold" style={{ color: galit.text }}>גלית CRM</div>
                <div className="text-xs text-slate-500">{currentUser.name} · {roleLabel(currentUser.role)}</div>
              </div>
            </div>
            </div>
            )}
          </div>

          {topNotice && (
            <div className="mb-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {topNotice}
            </div>
          )}

          <Modal open={quickCreateOpen} onClose={() => setQuickCreateOpen(false)} title="פנייה חדשה" maxWidth="max-w-2xl">
            <div className="space-y-3">
              <FormField label="שם מלא">
                <Input
                  autoFocus
                  placeholder="שם מלא"
                  value={quickCreateForm.fullName}
                  onChange={(e) => setQuickCreateForm((p) => ({ ...p, fullName: e.target.value }))}
                />
              </FormField>
              <FormField label="טלפון">
                <PhoneInput
                  placeholder="טלפון"
                  value={quickCreateForm.phone}
                  onChange={(v) => setQuickCreateForm((p) => ({ ...p, phone: v }))}
                />
              </FormField>
              <FormField label="אימייל">
                <EmailInput
                  placeholder="אימייל"
                  value={quickCreateForm.email}
                  onChange={(v) => setQuickCreateForm((p) => ({ ...p, email: v }))}
                />
              </FormField>
              {quickCreateEmailDuplicateWarning && (
                <div className="text-xs text-amber-700">
                  {quickCreateEmailDuplicateWarning}
                  {quickCreateDuplicateCustomer && (
                    <button
                      type="button"
                      className="mr-2 underline"
                      onClick={() => {
                        setQuickCreateOpen(false);
                        openCustomerPage(quickCreateDuplicateCustomer);
                      }}
                    >
                      פתח לקוח
                    </button>
                  )}
                  {quickCreateDuplicateLead && (
                    <button
                      type="button"
                      className="mr-2 underline"
                      onClick={() => {
                        setQuickCreateOpen(false);
                        openLeadPage(quickCreateDuplicateLead);
                      }}
                    >
                      פתח ליד
                    </button>
                  )}
                </div>
              )}
              <FormField label="שם חברה">
                <Input
                  placeholder="שם חברה"
                  value={quickCreateForm.companyName}
                  onChange={(e) => setQuickCreateForm((p) => ({ ...p, companyName: e.target.value }))}
                />
              </FormField>
              <FormField label="איש קשר">
                <Input
                  placeholder="איש קשר"
                  value={quickCreateForm.contactName}
                  onChange={(e) => setQuickCreateForm((p) => ({ ...p, contactName: e.target.value }))}
                />
              </FormField>
              <FormField label="עיר">
                <Input
                  placeholder="עיר"
                  value={quickCreateForm.city}
                  onChange={(e) => setQuickCreateForm((p) => ({ ...p, city: e.target.value }))}
                />
              </FormField>
              <FormField label="כתובת">
                <Input
                  placeholder="כתובת"
                  value={quickCreateForm.address}
                  onChange={(e) => setQuickCreateForm((p) => ({ ...p, address: e.target.value }))}
                />
              </FormField>
              <FormField label="סוג שירות">
                <Select
                  value={quickCreateForm.serviceType}
                  onChange={(v) => setQuickCreateForm((p) => ({ ...p, serviceType: v }))}
                  options={['קרינה', 'אקוסטיקה / רעש', 'איכות אוויר', 'אסבסט', 'ראדון', 'ריח', 'קרקע', 'אחר']}
                />
              </FormField>
              <FormField label="מקור ליד">
                <Select
                  value={quickCreateForm.leadSource}
                  onChange={(v) => setQuickCreateForm((p) => ({ ...p, leadSource: v }))}
                  options={['טלפון', 'אתר', 'וואטסאפ', 'פייסבוק', 'גוגל', 'לקוח חוזר', 'הפניה', 'אחר']}
                />
              </FormField>
              <FormField label="מטפל אחראי">
                <select
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-slate-400"
                  value={quickCreateForm.assignedUserId}
                  onChange={(e) => setQuickCreateForm((p) => ({ ...p, assignedUserId: e.target.value }))}
                >
                  <option value="">מטפל אחראי</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </FormField>

              <FormField label="סיכום שיחה">
                <Textarea
                  placeholder="סיכום שיחה"
                  value={quickCreateForm.callSummary}
                  onChange={(e) => setQuickCreateForm((p) => ({ ...p, callSummary: e.target.value }))}
                />
              </FormField>
              <FormField label="הערות פנימיות">
                <Textarea
                  placeholder="הערות פנימיות"
                  value={quickCreateForm.internalNotes}
                  onChange={(e) => setQuickCreateForm((p) => ({ ...p, internalNotes: e.target.value }))}
                />
              </FormField>

              {quickCreateSuccess && (
                <div className="rounded-2xl bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
                  {quickCreateSuccess}
                </div>
              )}
              {quickCreateError && (
                <div className="rounded-2xl bg-red-50 px-4 py-2 text-sm text-red-700">
                  {quickCreateError}
                </div>
              )}

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Button style={{ background: galit.primary }} onClick={quickCreateLead} disabled={quickCreateBusy}>
                  {quickCreateBusy ? 'שומר...' : 'שמור כליד'}
                </Button>
                <Button className="border bg-white text-slate-900" onClick={quickCreateCustomer} disabled={quickCreateBusy}>
                  {quickCreateBusy ? 'שומר...' : 'שמור כלקוח'}
                </Button>
                <Button variant="outline" onClick={() => setQuickCreateOpen(false)} disabled={quickCreateBusy}>
                  בטל
                </Button>
              </div>
              <div className="text-xs text-slate-500">שדות חובה: שם מלא, טלפון, סוג שירות, עיר</div>
            </div>
          </Modal>

          {/* ── Customer Search Modal (חפש → לקוח) ──────────────────── */}
          <CustomerSearchModal
            open={customerSearchOpen}
            customers={customers}
            onClose={() => setCustomerSearchOpen(false)}
            onSelect={(customer) => {
              setCustomerSearchOpen(false);
              setSelectedCustomer(customer);
              setSelectedLead(null);
              setCurrent('customer-profile');
              if (typeof window !== 'undefined') {
                window.history.pushState({}, '', `${window.location.pathname}?view=customer&id=${customer.id}`);
              }
            }}
          />

          {/* ── Quote Search Modal (חפש → הצעה) ──────────────────── */}
          <QuoteSearchModal
            open={quoteSearchOpen}
            quotes={quotes}
            customers={customers}
            onClose={() => setQuoteSearchOpen(false)}
            onSelect={(quote) => {
              setQuoteSearchOpen(false);
              setCurrent('quotes');
              if (typeof window !== 'undefined') {
                window.history.pushState({}, '', `${window.location.pathname}?view=quotes`);
              }
            }}
          />

          {current === 'dashboard' && (
            currentUser.role === 'admin' || currentUser.role === 'manager' ? (
              <ManagerDashboard
                currentUser={currentUser}
                customers={customers}
                navigateSafely={navigateSafely}
                onOpenCustomerById={(id) => {
                  const c = customers.find((x) => x.id === id);
                  if (c) openCustomerPage(c);
                }}
                onOpenProjectById={(id) => {
                  const p = projects.find((x) => x.id === id);
                  if (p) openProjectDetails(p);
                }}
              />
            ) : (
              <DashboardPage leads={leads} quotes={quotes} opportunities={opportunities} projects={projects} tasks={tasks} stats={dashboardStats} />
            )
          )}
          {current === 'leads' && canAccess(currentUser.role, 'leads') && (
            <LeadsPage
              leads={leads}
              setLeads={setLeads}
              customers={customers}
              users={users}
              onOpenLead={openLeadPage}
              onOpenCustomer={openCustomerPage}
              onOpenProjectById={(id) => {
                const project = projects.find((p) => p.id === id);
                if (project) {
                  openProjectDetails(project);
                } else {
                  navigateSafely('projects');
                }
              }}
              onNavigate={navigateSafely}
              loadError={leadsError}
              currentUser={currentUser}
            />
          )}
          {current === 'pipeline' && canAccess(currentUser.role, 'pipeline') && (
            <PipelinePage leads={leads} setLeads={setLeads} currentUser={currentUser} />
          )}
          {current === 'customers' && canAccess(currentUser.role, 'customers') && (
        <CustomersPage
          customers={customers}
          leads={leads}
          quotes={quotes}
          projects={projects}
          tasks={tasks}
          opportunities={opportunities}
          users={users}
          onOpenCustomer={openCustomerPage}
          onCreateCustomer={(c) => setCustomers((prev) => [...prev, c])}
          onUpdateCustomer={(updated) =>
            setCustomers((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
          }
          onDeleteCustomer={(id) => setCustomers((prev) => prev.filter((c) => c.id !== id))}
          error={customersError}
          currentUser={currentUser}
          typeLabelMap={customerTypeLabelMap}
          classifications={customerClassifications}
          onReloadClassifications={reloadCustomerClassifications}
        />
      )}
          {current === 'customer-profile' && selectedCustomer && (
            <div className="space-y-4">
              <CustomerLegacyCard
                customer={selectedCustomer}
                full={customerFull}
                currentUser={currentUser}
                onCustomerUpdated={(next) => {
                  setSelectedCustomer(next as Customer);
                  setCustomers((prev) => prev.map((c) => (c.id === next.id ? { ...c, ...(next as Customer) } : c)));
                }}
                onFullReload={async () => {
                  if (selectedCustomer.id && selectedCustomer.id !== '__new__') {
                    await loadCustomerFull(selectedCustomer.id);
                  }
                }}
                onContactSelected={(id, name) => { setCustomerCardContactId(id ?? null); setCustomerCardContactName(name ?? null); }}
                onNewQuote={(contactId) => {
                  setNewQuoteContactId(contactId ?? null);
                  setCurrent('quote-new');
                  if (typeof window !== 'undefined') {
                    window.history.pushState({}, '', window.location.pathname);
                  }
                }}
                onNewInteraction={(contactId) => {
                  setNewInteractionContactId(contactId ?? null);
                  setCurrent('interaction-new');
                  if (typeof window !== 'undefined') {
                    window.history.pushState({}, '', window.location.pathname);
                  }
                }}
                typeLabelMap={customerTypeLabelMap}
                classifications={customerClassifications}
                primaryColor={galit.primary}
                isNew={isNewCustomerMode}
                onBack={() => setCurrent('customers')}
                onCustomerCreated={(created) => {
                  const c = created as Customer;
                  setSelectedCustomer(c);
                  setIsNewCustomerMode(false);
                  setCustomers((prev) => [...prev, c]);
                  // Update URL with real customer ID
                  if (typeof window !== 'undefined') {
                    const url = `${window.location.pathname}?view=customer&id=${c.id}`;
                    window.history.pushState({}, '', url);
                  }
                  // Load full customer data now that it exists
                  void loadCustomerFull(c.id).catch(() => {});
                }}
              />
            </div>
          )}
          {current === 'quote-new' && (
            <QuoteNewScreen
              embedded
              prefillCustomer={selectedCustomer ? {
                id: selectedCustomer.id,
                name: selectedCustomer.name || '',
                phone: (selectedCustomer.phone as string | undefined) ?? undefined,
                fax: (selectedCustomer.fax as string | undefined) ?? undefined,
                companyRegNumber: (selectedCustomer.companyRegNumber as string | undefined) ?? undefined,
              } : undefined}
              prefillContactId={newQuoteContactId}
              onExit={() => {
                setCurrent(selectedCustomer ? 'customer-profile' : 'quotes');
              }}
            />
          )}
          {current === 'interaction-new' && (
            <InteractionNewScreen
              embedded
              prefillCustomer={selectedCustomer ? { id: selectedCustomer.id, name: selectedCustomer.name || '' } : undefined}
              prefillContactId={newInteractionContactId}
              prefillContactName={customerCardContactName ?? ''}
              onExit={() => setCurrent(selectedCustomer ? 'customer-profile' : 'dashboard')}
            />
          )}
          {current === 'order-new' && (
            <OrderNewScreen
              embedded
              prefillCustomer={selectedCustomer ? { id: selectedCustomer.id, name: selectedCustomer.name || '' } : undefined}
              prefillContactId={customerCardContactId}
              prefillContactName={customerCardContactName ?? ''}
              onExit={() => setCurrent(selectedCustomer ? 'customer-profile' : 'dashboard')}
            />
          )}
          {current === 'lead-profile' && selectedLead && (
            <div className="space-y-4">
              <Button variant="outline" onClick={closeProfilePage}>חזרה</Button>
              <LeadDetailPage
                lead={selectedLead}
                customer={linkedCustomerForSelectedLead}
                customers={customers}
                leads={leads}
                users={users}
                opportunities={opportunities}
                currentUser={currentUser}
                setLeads={setLeads}
                setSelectedLead={setSelectedLead}
                onOpenProject={(p) => {
                  setCurrent('project-details');
                  setSelectedProject(p);
                }}
                onOpenCustomer={openCustomerPage}
                onNavigate={(key) => navigateSafely(key)}
              />
            </div>
          )}
          {current === 'project-details' && selectedProject && (
            <ProjectDetailsPage
              project={selectedProject}
              onBack={closeProjectDetails}
              currentUser={currentUser}
              technicians={users.filter((u) => u.role === 'technician')}
              reportWriters={users.filter((u) => u.role === 'manager' || u.role === 'admin')}
              customers={customers}
              onProjectChange={(next) => {
                setSelectedProject((prev) => (prev ? { ...prev, ...next } : prev));
                setProjects((prev) => prev.map((p) => (p.id === selectedProject.id ? { ...p, ...next } : p)));
              }}
            />
          )}
          {current === 'quotes' && canAccess(currentUser.role, 'quotes') && (
            <QuotesPage
              quotes={quotes}
              customers={customers}
              opportunities={opportunities}
              currentUser={currentUser}
              onQuotesChange={setQuotes}
              initialCustomerId={newQuoteCustomerId}
            />
          )}
          {current === 'opportunities' && ['admin', 'manager', 'sales'].includes(currentUser.role) && (
            <OpportunitiesPage
              opportunities={opportunities}
              setOpportunities={setOpportunities}
              customers={customers}
              users={users}
              currentUser={currentUser}
            />
          )}
          {current === 'projects' && canAccess(currentUser.role, 'projects') && <ProjectsPage projects={projects} onOpenProject={openProjectDetails} />}
          {current === 'reports' && canAccess(currentUser.role, 'reports') && (
            <ReportsPage projects={projects} customers={customers} users={users} currentUser={currentUser} />
          )}
          {current === 'documents' && canAccess(currentUser.role, 'documents') && (
            <DocumentsPage projects={projects} customers={customers} reports={[]} users={users} currentUser={currentUser} />
          )}
          {current === 'lab' && canAccess(currentUser.role, 'lab') && (
            <LabSamplesPage projects={projects} customers={customers} users={users} currentUser={currentUser} />
          )}
          {current === 'settings' && canAccess(currentUser.role, 'settings') && (
            <SettingsPage
              currentUser={currentUser}
              customers={customers}
              leads={leads}
              projects={projects}
              quotes={quotes}
              users={users}
              onReloadCustomers={reloadCustomers}
              onReloadLeads={reloadLeads}
              onReloadProjects={reloadProjects}
              onReloadQuotes={reloadQuotes}
              onReloadCustomerClassifications={reloadCustomerClassifications}
              onReloadUsers={reloadUsers}
              customerClassifications={customerClassifications}
              customerTypeLabelMap={customerTypeLabelMap}
              settingsJumpTab={pendingSettingsTab}
              onSettingsJumpConsumed={consumePendingSettingsTab}
            />
          )}
          {current === 'fieldSchedule' && canAccess(currentUser.role, 'fieldSchedule') && (
            <FieldSchedulePage
              projects={projects}
              setProjects={setProjects}
              technicians={users.filter((u) => u.role === 'technician')}
              currentUser={currentUser}
            />
          )}
          {current === 'tests' && canAccess(currentUser.role, 'tests') && <EnvironmentalTestsPage />}
          {current === 'tasks' && canAccess(currentUser.role, 'tasks') && (
            <TasksPage
              tasks={tasks}
              setTasks={setTasks}
              onReloadTasks={reloadTasks}
              currentUser={currentUser}
              projects={projects}
              customers={customers}
              users={users}
            />
          )}
          {current === 'alerts' && canAccess(currentUser.role, 'alerts') && <AlertsPage />}
          {current === 'users' && currentUser.role === 'admin' && (
            <UsersPage users={users} onReloadUsers={reloadUsers} currentUser={currentUser} />
          )}

          <div className="mt-8 flex justify-end border-t pt-4">
            <Button variant="outline" onClick={handleLogout}><LogOut className="h-4 w-4" />התנתק</Button>
          </div>
          </div>
        </main>
      </div>
    </div>
  );
}
