'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch, apiUrl } from './lib/api-base';
import { parseApiErrorResponse } from './lib/api-error';
import { whatsAppLink } from './lib/whatsapp';
import { SignedQuotesSection } from './signed-quotes-section';
import { ProducedReportsSection } from './produced-reports-section';
import { ServiceCategorySelector } from './components/ServiceCategorySelector';

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

/** לקוח כפי שמגיע מה־API (שדות נוספים אופציונליים לייבוא) */
export type CustomerCardCustomer = {
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
  importLegacyId?: string | null;
  birthdayLegacy?: string | null;
  /** API / Prisma — כרטיס ישן */
  legacyAccountNumber?: string | null;
  legacySubClassificationCode?: string | null;
  salesRepresentative?: string | null;
  functionalLabel?: string | null;
  customerSize?: string | null;
  managementProfile?: string | null;
  countryOrRegion?: string | null;
  mailingInvalidField?: string | null;
  mailingPoBox?: string | null;
  allowMail?: boolean | null;
  allowFax?: boolean | null;
  allowEmail?: boolean | null;
  allowSms?: boolean | null;
  mailingNote?: string | null;
  registrationDate?: string | null;
  lastUpdateDate?: string | null;
  lastUpdatedBy?: string | null;
  priceList?: string | null;
  roundedPricing?: string | null;
  employeeCount?: string | null;
  managementCustomerLabel?: string | null;
  financialNumber1?: string | null;
  financialNumber2?: string | null;
  financialNumber2Large?: string | null;
  financialNumber3?: string | null;
  financeToken?: string | null;
  financeTokenDate?: string | null;
  financeTokenActive?: boolean | null;
  financeUnnamed1?: string | null;
  financeUnnamed2?: string | null;
  financeUnnamed3?: string | null;
  financeUnnamed4?: string | null;
  totalPurchases?: unknown;
  totalSales?: unknown;
  percentageValue?: unknown;
  paymentTerms?: string | null;
  creditDays?: string | null;
  creditEnabled?: boolean | null;
  creditNumber?: string | null;
  creditExpiry?: string | null;
  microwaveModel?: string | null;
  detectorLocation?: string | null;
  companyAmount?: string | null;
  feature7?: string | null;
  detailDate1?: string | null;
  detailDate2?: string | null;
  detailDate3?: string | null;
  detailDate4?: string | null;
  detectorModel?: string | null;
  feature4?: string | null;
  companyWall?: string | null;
  feature8?: string | null;
};

export type CustomerClassificationOption = {
  id: string;
  code: string;
  labelHe: string;
  sortOrder: number;
  isPreset: boolean;
};

type AppUser = {
  id: string;
  role: string;
  name: string;
  email: string;
};

type CustomerFull = {
  leads: unknown[];
  quotes: unknown[];
  tasks: unknown[];
  reports: unknown[];
  contacts?: CustomerLegacyContact[];
  /** מסמכי לקוח — כשיוחזר מ־GET /customers/:id/full */
  documents?: unknown[];
  /** שורות נתונים נוספים (מיגרציה / שדות דינמיים) */
  additionalData?: unknown[];
  /** טבלת נתונים חיצוניים A–J */
  externalData?: unknown[];
  referralSources?: unknown[];
  questionnaires?: unknown[];
  relations?: unknown[];
  additionalDataRows?: unknown[];
  externalDataRows?: unknown[];
};

type CustomerLegacyContact = {
  id: string;
  fullName: string;
  department?: string | null;
  roleTitle?: string | null;
  mobile?: string | null;
  phone?: string | null;
  fax?: string | null;
  email?: string | null;
  isPrimary?: boolean;
  isActive?: boolean;
  notes?: string | null;
};

/** טאב נתונים כספיים — תואם מסך ישן; נשמר ב־PATCH יחד עם שאר כרטיס הלקוח */
export type CustomerFinanceTabForm = {
  totalPurchases: string;
  totalSales: string;
  percent: string;
  paymentTerms: string;
  creditDays: string;
  creditOn: boolean;
  creditNumber: string;
  validity: string;
  priceList: string;
  rounded: string;
  employeeCount: string;
  customerInManagement: string;
  number1: string;
  number2Small: string;
  number2Large: string;
  number3: string;
  tokenOn: boolean;
  tokenText: string;
  tokenDate: string;
  unnamedAux1: string;
  unnamedAux2: string;
  unnamedAux3: string;
  unnamedAux4: string;
};

function str(v: unknown): string {
  return v != null ? String(v) : '';
}

function customerEmailLooksValid(email: string): boolean {
  const t = email.trim();
  if (!t) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

/** Israeli phone validation — accepts landlines (0X-XXXXXXX) and mobiles (05X-XXXXXXX) */
function israeliPhoneLooksValid(phone: string): boolean {
  const t = phone.trim().replace(/[\s\-()]+/g, '');
  if (!t) return true; // empty is OK — separate required check
  // landline: 02-9 followed by 7 digits; mobile: 05X followed by 7 digits
  return /^0[2-9]\d{7,8}$/.test(t);
}

/**
 * Auto-format an Israeli phone number by inserting a dash on blur.
 * Mobile (05X): 0501234567 → 050-1234567
 * Landline (02-9): 039876543 → 03-9876543
 * If the value already contains a dash, or is partial/invalid, return as-is.
 */
function autoFormatIsraeliPhone(raw: string): string {
  const trimmed = raw.trim();
  // Already has a dash — don't touch
  if (trimmed.includes('-')) return trimmed;
  // Strip everything except digits
  const digits = trimmed.replace(/\D/g, '');
  // Mobile: 05X + 7 digits = 10 digits total
  if (/^05\d{8}$/.test(digits)) {
    return digits.slice(0, 3) + '-' + digits.slice(3);
  }
  // Landline: 0[2-4,8-9] + 7 digits = 9 digits total
  if (/^0[2-489]\d{7}$/.test(digits)) {
    return digits.slice(0, 2) + '-' + digits.slice(2);
  }
  // Landline: 07[1-9] + 7 digits = 10 digits (special landline/voip)
  if (/^07[1-9]\d{7}$/.test(digits)) {
    return digits.slice(0, 3) + '-' + digits.slice(3);
  }
  // Doesn't match known patterns — return as-is, don't break input
  return trimmed;
}

/** סיווג לקוח — classification dropdown options */
const CUSTOMER_CLASSIFICATION_OPTIONS: string[] = [
  'אדריכלים',
  'חשמלאים',
  'קבלנים',
  'יזמים',
  'מהנדסים',
  'אינסטלטורים',
  'שמאים',
  'עורכי דין',
  'רואי חשבון',
  'יועצים',
  'קבלני שלד',
  'קבלני גמר',
  'מפקחי בנייה',
  'אחר',
];

const LEAD_SOURCE_OPTIONS: string[] = [
  'פייסבוק',
  'טיק טוק',
  'גוגל אדס',
  'אינסטגרם',
  'אתר',
  'המלצה',
  'לקוח חוזר',
  'אחר',
];

/** Israeli cities list for autocomplete */
const ISRAEL_CITIES: string[] = [
  'אום אל-פחם','אופקים','אור יהודה','אור עקיבא','אילת','אלעד','אריאל','אשדוד','אשקלון',
  'באר שבע','בית שאן','בית שמש','בני ברק','בת ים',
  'גבעת שמואל','גבעתיים','גדרה','גני תקווה',
  'דימונה',
  'הוד השרון','הרצליה','זכרון יעקב',
  'חדרה','חולון','חיפה',
  'טבריה','טירה','טירת כרמל',
  'יבנה','יהוד-מונוסון','יקנעם','ירושלים',
  'כוכב יאיר','כפר יונה','כפר סבא','כפר קרע','כרמיאל',
  'להבים','לוד',
  'מגדל העמק','מודיעין עילית','מודיעין-מכבים-רעות','מזכרת בתיה','מיתר','מעלה אדומים','מעלות-תרשיחא',
  'נהריה','נוף הגליל','נס ציונה','נצרת','נשר','נתיבות','נתניה',
  'עכו','עומר','עפולה','ערד',
  'פרדס חנה-כרכור','פתח תקווה',
  'צפת',
  'קלנסוה','קריית אונו','קריית אתא','קריית ביאליק','קריית גת','קריית ים','קריית מוצקין','קריית מלאכי','קריית שמונה','קצרין',
  'ראש העין','ראשון לציון','רחובות','רמלה','רמת גן','רמת השרון','רעננה',
  'שגב-שלום','שדרות','שהם','שפרעם',
  'תל אביב-יפו',
].sort((a, b) => a.localeCompare(b, 'he'));

/*
 * Module-level Field component — avoids re-creating component identity
 * on every render (which would unmount/remount inputs and lose focus).
 */
const FIELD_BOX = 'space-y-1.5';
const FIELD_BOX_CONNECTED = 'space-y-1.5';
const FIELD_LABEL = 'block text-[12px] font-semibold text-black';

function CardField({ label, children }: { label: string; children: React.ReactNode; connected?: boolean }) {
  return (
    <div className={FIELD_BOX}>
      <div className={FIELD_LABEL}><span className="block">{label}</span></div>
      {children}
    </div>
  );
}

function toIsoDateInputValue(v: unknown): string {
  if (v == null || v === '') return '';
  const d = new Date(typeof v === 'string' ? v : String(v));
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function emptyFinanceTabForm(): CustomerFinanceTabForm {
  return {
    totalPurchases: '',
    totalSales: '',
    percent: '',
    paymentTerms: '',
    creditDays: '',
    creditOn: false,
    creditNumber: '',
    validity: '',
    priceList: '',
    rounded: '',
    employeeCount: '',
    customerInManagement: '',
    number1: '',
    number2Small: '',
    number2Large: '',
    number3: '',
    tokenOn: false,
    tokenText: '',
    tokenDate: '',
    unnamedAux1: '',
    unnamedAux2: '',
    unnamedAux3: '',
    unnamedAux4: '',
  };
}

function buildFinanceFormFromCustomer(c: CustomerCardCustomer): CustomerFinanceTabForm {
  const x = c as Record<string, unknown>;
  const fromDb: CustomerFinanceTabForm = {
    ...emptyFinanceTabForm(),
    totalPurchases: x.totalPurchases != null ? String(x.totalPurchases) : '',
    totalSales: x.totalSales != null ? String(x.totalSales) : '',
    percent: x.percentageValue != null ? String(x.percentageValue) : '',
    paymentTerms: str(x.paymentTerms),
    creditDays: str(x.creditDays),
    creditOn: Boolean(x.creditEnabled),
    creditNumber: str(x.creditNumber),
    validity: str(x.creditExpiry),
    priceList: str(x.priceList),
    rounded: str(x.roundedPricing),
    employeeCount: str(x.employeeCount),
    customerInManagement: str(x.managementCustomerLabel),
    number1: str(x.financialNumber1),
    number2Small: str(x.financialNumber2),
    number2Large: str(x.financialNumber2Large),
    number3: str(x.financialNumber3),
    tokenOn: Boolean(x.financeTokenActive),
    tokenText: str(x.financeToken),
    tokenDate: x.financeTokenDate != null ? toIsoDateInputValue(x.financeTokenDate) : '',
    unnamedAux1: str(x.financeUnnamed1),
    unnamedAux2: str(x.financeUnnamed2),
    unnamedAux3: str(x.financeUnnamed3),
    unnamedAux4: str(x.financeUnnamed4),
  };
  const raw = x.financeTab;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return { ...fromDb, ...(raw as Partial<CustomerFinanceTabForm>) };
  }
  return fromDb;
}

/** טאב מקור הגעה — תאריך ושם מקור; נשמר ב־PUT /customers/:id/referral-sources */
export type CustomerLeadSourceRow = {
  id: string;
  date: string;
  sourceName: string;
};

function newLeadSourceRow(): CustomerLeadSourceRow {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `ls-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    date: '',
    sourceName: '',
  };
}

/** טוען מ־GET /customers/:id/full (referralSources) או מ־customer.leadSources (גיבוי) */
function buildLeadSourceRowsFromFull(full: CustomerFull | null, c: CustomerCardCustomer): CustomerLeadSourceRow[] {
  const raw =
    (full?.referralSources as unknown[] | undefined) ??
    ((c as Record<string, unknown>).leadSources as unknown[] | undefined);
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, i) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const o = item as Record<string, unknown>;
      return {
        id: typeof o.id === 'string' ? o.id : `ls-${i}-${c.id}`,
        date: o.date != null ? toIsoDateInputValue(o.date) || String(o.date).slice(0, 10) : '',
        sourceName: o.sourceName != null ? String(o.sourceName) : '',
      };
    })
    .filter((r): r is CustomerLeadSourceRow => r != null);
}

export type CustomerQuestionnaireRow = {
  id: string;
  code: string;
  name: string;
};

function newQuestionnaireRow(): CustomerQuestionnaireRow {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `qn-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    code: '',
    name: '',
  };
}

function buildQuestionnaireRowsFromFull(full: CustomerFull | null, c: CustomerCardCustomer): CustomerQuestionnaireRow[] {
  const raw =
    (full?.questionnaires as unknown[] | undefined) ??
    ((c as Record<string, unknown>).questionnaires as unknown[] | undefined);
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, i) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const o = item as Record<string, unknown>;
      return {
        id: typeof o.id === 'string' ? o.id : `qn-${i}-${c.id}`,
        code: o.questionnaireCode != null ? String(o.questionnaireCode) : '',
        name: o.questionnaireName != null ? String(o.questionnaireName) : '',
      };
    })
    .filter((r): r is CustomerQuestionnaireRow => r != null);
}

/** שדות דיוור שלא ב־PATCH היום; כתובת/עיר/מיקוד נלקחים מ־customerForm (address, city, zipLegacy) */
export type CustomerMailingTabExtras = {
  wrongField: string;
  poBox: string;
  prefMailing: boolean;
  prefFax: boolean;
  prefEmail: boolean;
  prefSms: boolean;
  mailingNote: string;
};

function emptyMailingExtras(): CustomerMailingTabExtras {
  return {
    wrongField: '',
    poBox: '',
    prefMailing: false,
    prefFax: false,
    prefEmail: false,
    prefSms: false,
    mailingNote: '',
  };
}

/** טוען מ־customer.mailingTab או משדות עתידיים על אובייקט הלקוח */
function buildMailingExtrasFromCustomer(c: CustomerCardCustomer): CustomerMailingTabExtras {
  const x = c as Record<string, unknown>;
  const raw = x.mailingTab;
  const base = emptyMailingExtras();
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const m = raw as Record<string, unknown>;
    return {
      wrongField: m.wrongField != null ? String(m.wrongField) : base.wrongField,
      poBox: m.poBox != null ? String(m.poBox) : base.poBox,
      prefMailing: Boolean(m.prefMailing),
      prefFax: Boolean(m.prefFax),
      prefEmail: Boolean(m.prefEmail),
      prefSms: Boolean(m.prefSms),
      mailingNote: m.mailingNote != null ? String(m.mailingNote) : base.mailingNote,
    };
  }
  return {
    ...base,
    wrongField:
      x.mailingInvalidField != null
        ? String(x.mailingInvalidField)
        : x.wrongField != null
          ? String(x.wrongField)
          : '',
    poBox: x.mailingPoBox != null ? String(x.mailingPoBox) : x.poBox != null ? String(x.poBox) : '',
    prefMailing: x.allowMail != null ? Boolean(x.allowMail) : Boolean(x.prefMailing),
    prefFax: x.allowFax != null ? Boolean(x.allowFax) : Boolean(x.prefFax),
    prefEmail: x.allowEmail != null ? Boolean(x.allowEmail) : Boolean(x.prefEmail),
    prefSms: x.allowSms != null ? Boolean(x.allowSms) : Boolean(x.prefSms),
    mailingNote: x.mailingNote != null ? String(x.mailingNote) : '',
  };
}

/** טאב הערות — תאריכים, משתמש אחרון, והערות (notes / internalNotes) דרך PATCH */
export type CustomerNotesTabExtras = {
  registrationDate: string;
  lastUpdateDate: string;
  lastUser: string;
};

function buildNotesTabExtrasFromCustomer(c: CustomerCardCustomer): CustomerNotesTabExtras {
  const x = c as Record<string, unknown>;
  const raw = x.notesTab;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const n = raw as Record<string, unknown>;
    return {
      registrationDate: n.registrationDate != null ? toIsoDateInputValue(n.registrationDate) : '',
      lastUpdateDate: n.lastUpdateDate != null ? toIsoDateInputValue(n.lastUpdateDate) : '',
      lastUser: n.lastUser != null ? String(n.lastUser) : '',
    };
  }
  return {
    registrationDate:
      x.registrationDate != null
        ? toIsoDateInputValue(x.registrationDate)
        : toIsoDateInputValue(x.createdAt),
    lastUpdateDate:
      x.lastUpdateDate != null
        ? toIsoDateInputValue(x.lastUpdateDate)
        : toIsoDateInputValue(c.legacyUpdatedAt ?? x.updatedAt),
    lastUser: x.lastUpdatedBy != null ? String(x.lastUpdatedBy) : x.lastUser != null ? String(x.lastUser) : '',
  };
}

/** טאב קשרים — שם לקוח מקושר וסוג קשר; נשמר ב־PUT /customers/:id/relations */
export type CustomerRelationRow = {
  id: string;
  customerName: string;
  relationType: string;
};

function newRelationRow(): CustomerRelationRow {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `rel-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    customerName: '',
    relationType: '',
  };
}

function buildRelationRowsFromFull(full: CustomerFull | null, c: CustomerCardCustomer): CustomerRelationRow[] {
  const raw =
    (full?.relations as unknown[] | undefined) ?? ((c as Record<string, unknown>).relations as unknown[] | undefined);
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, i) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const o = item as Record<string, unknown>;
      const name =
        o.relatedCustomerName != null
          ? String(o.relatedCustomerName)
          : o.customerName != null
            ? String(o.customerName)
            : '';
      return {
        id: typeof o.id === 'string' ? o.id : `rel-${i}-${c.id}`,
        customerName: name,
        relationType: o.relationType != null ? String(o.relationType) : '',
      };
    })
    .filter((r): r is CustomerRelationRow => r != null);
}

/** טאב מסמכים — עמודות כמסך ישן; מיפוי עתידי ל־Prisma Document */
export type CustomerDocumentTabRow = {
  id: string;
  fileName: string;
  userName: string;
  dateStr: string;
  docType: string;
  description: string;
  /** נתיב/URL לקובץ אחרי חיבור אחסון */
  filePath: string;
};

function newDocumentTabRow(): CustomerDocumentTabRow {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `doc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    fileName: '',
    userName: '',
    dateStr: '',
    docType: '',
    description: '',
    filePath: '',
  };
}

function mapUnknownToDocumentRow(item: unknown, fallbackId: string): CustomerDocumentTabRow | null {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const o = item as Record<string, unknown>;
  const ub = o.uploadedBy as Record<string, unknown> | null | undefined;
  const userName =
    ub && typeof ub === 'object' && ub.name != null
      ? String(ub.name)
      : o.userName != null
        ? String(o.userName)
        : '';
  const dateRaw = o.documentDate ?? o.createdAt;
  return {
    id: typeof o.id === 'string' ? o.id : fallbackId,
    fileName: o.name != null ? String(o.name) : o.fileName != null ? String(o.fileName) : '',
    userName,
    dateStr: dateRaw != null ? toIsoDateInputValue(dateRaw) || String(dateRaw).slice(0, 10) : '',
    docType: o.documentType != null ? String(o.documentType) : '',
    description: o.description != null ? String(o.description) : '',
    filePath: o.filePath != null ? String(o.filePath) : '',
  };
}

function buildDocumentRowsFromFull(full: CustomerFull | null): CustomerDocumentTabRow[] {
  const raw = full?.documents;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, i) => mapUnknownToDocumentRow(item, `doc-${i}`))
    .filter((r): r is CustomerDocumentTabRow => r != null);
}

/** טאב נתונים נוספים — עמודות כמסך ישן (שדות גנריים) */
export type CustomerAdditionalDataRow = {
  id: string;
  number: string;
  d: string;
  dateStr: string;
  text2: string;
  text1: string;
};

function newAdditionalDataRow(): CustomerAdditionalDataRow {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `ad-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    number: '',
    d: '',
    dateStr: '',
    text2: '',
    text1: '',
  };
}

function mapUnknownToAdditionalDataRow(item: unknown, fallbackId: string): CustomerAdditionalDataRow | null {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const o = item as Record<string, unknown>;
  const dateRaw = o.dateValue ?? o.dateStr ?? o.date ?? o.taarich;
  return {
    id: typeof o.id === 'string' ? o.id : fallbackId,
    number:
      o.numberValue != null
        ? String(o.numberValue)
        : o.number != null
          ? String(o.number)
          : o.mispar != null
            ? String(o.mispar)
            : '',
    d:
      o.dValue != null ? String(o.dValue) : o.d != null ? String(o.d) : o.D != null ? String(o.D) : '',
    dateStr: dateRaw != null ? toIsoDateInputValue(dateRaw) || String(dateRaw).slice(0, 10) : '',
    text2: o.text2 != null ? String(o.text2) : o.tekst2 != null ? String(o.tekst2) : '',
    text1: o.text1 != null ? String(o.text1) : o.tekst1 != null ? String(o.tekst1) : '',
  };
}

function buildAdditionalDataRows(c: CustomerCardCustomer, full: CustomerFull | null): CustomerAdditionalDataRow[] {
  const x = c as Record<string, unknown>;
  const raw = full?.additionalDataRows ?? full?.additionalData ?? x.additionalData;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, i) => mapUnknownToAdditionalDataRow(item, `ad-${i}-${c.id}`))
    .filter((r): r is CustomerAdditionalDataRow => r != null);
}

/** טאב פרטים נוספים — שדות מובנים מהמערכת הישנה; תאריך לידה ↔ birthdayLegacy ב־Prisma */
export type CustomerMoreDetailsForm = {
  microgelModel: string;
  detectorLocation: string;
  companyQuantity: string;
  feature7: string;
  date1: string;
  date3: string;
  birthDate: string;
  detectorModel: string;
  feature4: string;
  wallCompany: string;
  feature8: string;
  date2: string;
  date4: string;
};

function emptyMoreDetailsForm(): CustomerMoreDetailsForm {
  return {
    microgelModel: '',
    detectorLocation: '',
    companyQuantity: '',
    feature7: '',
    date1: '',
    date3: '',
    birthDate: '',
    detectorModel: '',
    feature4: '',
    wallCompany: '',
    feature8: '',
    date2: '',
    date4: '',
  };
}

function buildMoreDetailsFromCustomer(c: CustomerCardCustomer): CustomerMoreDetailsForm {
  const x = c as Record<string, unknown>;
  const base = emptyMoreDetailsForm();
  const fromApi: Partial<CustomerMoreDetailsForm> = {
    microgelModel: str(x.microwaveModel ?? x.microgelModel),
    detectorLocation: str(x.detectorLocation),
    companyQuantity: str(x.companyAmount ?? x.companyQuantity),
    feature7: str(x.feature7),
    date1: x.detailDate1 != null ? toIsoDateInputValue(x.detailDate1) : '',
    date3: x.detailDate3 != null ? toIsoDateInputValue(x.detailDate3) : '',
    detectorModel: str(x.detectorModel),
    feature4: str(x.feature4),
    wallCompany: str(x.companyWall ?? x.wallCompany),
    feature8: str(x.feature8),
    date2: x.detailDate2 != null ? toIsoDateInputValue(x.detailDate2) : '',
    date4: x.detailDate4 != null ? toIsoDateInputValue(x.detailDate4) : '',
  };
  const raw = x.moreDetailsTab;
  let fromTab: Partial<CustomerMoreDetailsForm> = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const m = raw as Record<string, unknown>;
    fromTab = {
      microgelModel: str(m.microgelModel),
      detectorLocation: str(m.detectorLocation),
      companyQuantity: str(m.companyQuantity),
      feature7: str(m.feature7),
      date1: m.date1 != null ? toIsoDateInputValue(m.date1) || str(m.date1).slice(0, 10) : '',
      date3: m.date3 != null ? toIsoDateInputValue(m.date3) || str(m.date3).slice(0, 10) : '',
      birthDate: m.birthDate != null ? toIsoDateInputValue(m.birthDate) || str(m.birthDate).slice(0, 10) : '',
      detectorModel: str(m.detectorModel),
      feature4: str(m.feature4),
      wallCompany: str(m.wallCompany),
      feature8: str(m.feature8),
      date2: m.date2 != null ? toIsoDateInputValue(m.date2) || str(m.date2).slice(0, 10) : '',
      date4: m.date4 != null ? toIsoDateInputValue(m.date4) || str(m.date4).slice(0, 10) : '',
    };
  }
  const merged = { ...base, ...fromApi, ...fromTab };
  const birthDate =
    merged.birthDate && merged.birthDate.length > 0
      ? merged.birthDate
      : toIsoDateInputValue(c.birthdayLegacy ?? x.birthdayLegacy) || '';
  return { ...merged, birthDate };
}

const MORE_DETAILS_RIGHT_FIELDS: Array<{
  key: keyof CustomerMoreDetailsForm;
  label: string;
  kind: 'text' | 'date';
}> = [
  { key: 'microgelModel', label: 'דגם מקרוגל', kind: 'text' },
  { key: 'detectorLocation', label: 'מיקום גלאי', kind: 'text' },
  { key: 'companyQuantity', label: 'כמות חברה', kind: 'text' },
  { key: 'feature7', label: 'מאפיין 7', kind: 'text' },
  { key: 'date1', label: 'תאריך 1', kind: 'date' },
  { key: 'date3', label: 'תאריך 3', kind: 'date' },
  { key: 'birthDate', label: 'תאריך לידה', kind: 'date' },
];

const MORE_DETAILS_LEFT_FIELDS: Array<{
  key: keyof CustomerMoreDetailsForm;
  label: string;
  kind: 'text' | 'date';
}> = [
  { key: 'detectorModel', label: 'דגם גלאי', kind: 'text' },
  { key: 'feature4', label: 'מאפיין 4', kind: 'text' },
  { key: 'wallCompany', label: 'חומה חברה', kind: 'text' },
  { key: 'feature8', label: 'מאפיין 8', kind: 'text' },
  { key: 'date2', label: 'תאריך 2', kind: 'date' },
  { key: 'date4', label: 'תאריך 4', kind: 'date' },
];

export const EXTERNAL_DATA_COLUMN_KEYS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'] as const;
export type ExternalDataColumnKey = (typeof EXTERNAL_DATA_COLUMN_KEYS)[number];

/** שורה בטאב נתונים חיצוניים — עמודות A–J בלבד */
export type CustomerExternalDataRow = { id: string } & Record<ExternalDataColumnKey, string>;

function newExternalDataRow(): CustomerExternalDataRow {
  const id = globalThis.crypto?.randomUUID?.() ?? `ext-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return {
    id,
    A: '',
    B: '',
    C: '',
    D: '',
    E: '',
    F: '',
    G: '',
    H: '',
    I: '',
    J: '',
  };
}

function mapUnknownToExternalRow(item: unknown, fallbackId: string): CustomerExternalDataRow | null {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const o = item as Record<string, unknown>;
  const row = newExternalDataRow();
  row.id = typeof o.id === 'string' ? o.id : fallbackId;
  const colMap: Record<ExternalDataColumnKey, string> = {
    A: 'colA',
    B: 'colB',
    C: 'colC',
    D: 'colD',
    E: 'colE',
    F: 'colF',
    G: 'colG',
    H: 'colH',
    I: 'colI',
    J: 'colJ',
  };
  for (const k of EXTERNAL_DATA_COLUMN_KEYS) {
    const colKey = colMap[k];
    const v = o[k] ?? o[colKey];
    row[k] = v != null ? String(v) : '';
  }
  return row;
}

function buildExternalDataRows(c: CustomerCardCustomer, full: CustomerFull | null): CustomerExternalDataRow[] {
  const x = c as Record<string, unknown>;
  const raw = full?.externalDataRows ?? full?.externalData ?? x.externalData;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, i) => mapUnknownToExternalRow(item, `ext-${i}-${c.id}`))
    .filter((r): r is CustomerExternalDataRow => r != null);
}

const PRESET_CUSTOMER_TYPE_LABELS: Record<string, string> = {
  COMPANY: 'חברה / קבלן',
  PUBLIC: 'רשות / מוסד',
  PRIVATE: 'לקוח פרטי',
  SUPPLIER: 'ספק',
};

function resolveCustomerTypeLabel(type: string, labelMap: Record<string, string>) {
  const t = (type || '').trim();
  return labelMap[t] || PRESET_CUSTOMER_TYPE_LABELS[t] || t || '-';
}

type LowerTabKey =
  | 'contacts'
  | 'finance'
  | 'source'
  | 'questionnaires'
  | 'copy'
  | 'mailing'
  | 'notes'
  | 'relations'
  | 'documents'
  | 'quotes'
  | 'signedQuotes'
  | 'producedReports'
  | 'additionalData'
  | 'moreDetails'
  | 'externalData';

const LOWER_TABS: Array<{ key: LowerTabKey; label: string }> = [
  { key: 'contacts', label: 'אנשי קשר' },
  { key: 'finance', label: 'נתונים כספיים' },
  { key: 'notes', label: 'הערות' },
  { key: 'relations', label: 'קשרים' },
  { key: 'documents', label: 'מסמכים' },
  { key: 'producedReports', label: 'דוחות שהופקו' },
  { key: 'quotes', label: 'הצעות מחיר' },
  { key: 'signedQuotes', label: 'הצעות מחיר חתומות' },
];

function formatLegacyDate(v: unknown): string {
  if (v == null || v === '') return '';
  if (typeof v === 'string') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString('he-IL');
  }
  return String(v);
}

type CustomerQuoteListRow = {
  id: string;
  quoteNumber?: string | null;
  quoteDate?: string | null;
  createdAt?: string | null;
  status?: string | null;
  totalAmount?: number | null;
  amount?: number | null;
  validityDate?: string | null;
  validTo?: string | null;
  lastMergedDocPath?: string | null;
  customerName?: string | null;
  phoneSummary?: string | null;
  contactEmail?: string | null;
  latestDocFileName?: string | null;
  latestDocAt?: string | null;
};

export function CustomerLegacyCard({
  customer,
  full,
  currentUser,
  onCustomerUpdated,
  onFullReload,
  onNewQuote,
  onOpenQuote,
  onNewInteraction,
  onContactSelected,
  typeLabelMap = PRESET_CUSTOMER_TYPE_LABELS,
  classifications = [],
  primaryColor,
  isNew = false,
  onCustomerCreated,
  onBack,
  showCustomerQuotesTab = false,
  customerQuotesRefreshKey = 0,
  initialLowerTab,
}: {
  customer: CustomerCardCustomer;
  full: CustomerFull | null;
  currentUser: AppUser;
  onCustomerUpdated: (next: CustomerCardCustomer) => void;
  onFullReload: () => Promise<void>;
  /** Called when the user clicks "חדש הצעה" from the contacts panel.
   *  contactId is the ID of the currently selected contact (null if none selected). */
  onNewQuote?: (contactId?: string | null) => void;
  /** Open the quote editor for an existing quote (dashboard navigates to quote-new). */
  onOpenQuote?: (quoteId: string) => void;
  /** Called when the user clicks "פנייה חדשה" from the contacts panel. */
  onNewInteraction?: (contactId?: string | null) => void;
  /** Called whenever a contact row is selected (or deselected — null).
   *  Allows the parent to know which contact is active for toolbar actions. */
  onContactSelected?: (contactId: string | null, contactName?: string | null) => void;
  typeLabelMap?: Record<string, string>;
  classifications?: CustomerClassificationOption[];
  primaryColor: string;
  /** כרטיס במצב יצירת לקוח חדש — שמירה ראשונה תעשה POST במקום PATCH */
  isNew?: boolean;
  /** נקרא אחרי POST מוצלח — מאפשר ל-dashboard לעדכן את ה-state עם הלקוח שנוצר */
  onCustomerCreated?: (created: CustomerCardCustomer) => void;
  /** Navigate back to the previous page (e.g. customers list) */
  onBack?: () => void;
  /** When true, show the lower tab "הצעות מחיר" (requires quotes API access). */
  showCustomerQuotesTab?: boolean;
  /** Incremented by the parent after a quote is saved — forces refetch of GET /quotes?customerId=… */
  customerQuotesRefreshKey?: number;
  /** Initial lower tab to show (defaults to 'contacts'). Resets when customer.id changes. */
  initialLowerTab?: LowerTabKey;
}) {
  console.log('CUSTOMER LEGACY CARD RUNTIME MARKER', customer?.id);
  /** true while we're creating a brand-new customer (POST). Flips to false after first save. */
  const [isNewMode, setIsNewMode] = useState(isNew);
  /** Parent `isNew` must win when the same card instance goes from existing customer → new (no remount). */
  useEffect(() => {
    setIsNewMode(isNew);
  }, [isNew]);
  const [mode, setMode] = useState<'view' | 'edit'>('edit');
  const [activeLowerTab, setActiveLowerTab] = useState<LowerTabKey>(initialLowerTab ?? 'contacts');
  const prevCustomerIdForTabRef = useRef(customer?.id);
  useEffect(() => {
    if (customer?.id !== prevCustomerIdForTabRef.current) {
      prevCustomerIdForTabRef.current = customer?.id;
      setActiveLowerTab(initialLowerTab ?? 'contacts');
    }
  }, [customer?.id, initialLowerTab]);
  const [customerQuotes, setCustomerQuotes] = useState<CustomerQuoteListRow[]>([]);
  const [customerQuotesLoading, setCustomerQuotesLoading] = useState(false);
  const [customerQuotesError, setCustomerQuotesError] = useState('');
  const lowerTabsVisible = useMemo(() => {
    if (showCustomerQuotesTab) return LOWER_TABS;
    return LOWER_TABS.filter((t) => t.key !== 'quotes' && t.key !== 'signedQuotes');
  }, [showCustomerQuotesTab]);
  useEffect(() => {
    if (!showCustomerQuotesTab && (activeLowerTab === 'quotes' || activeLowerTab === 'signedQuotes')) {
      setActiveLowerTab('contacts');
    }
  }, [showCustomerQuotesTab, activeLowerTab]);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const saveMainInFlightRef = useRef(false);
  const [contactBusy, setContactBusy] = useState(false);
  const [contactEdit, setContactEdit] = useState<CustomerLegacyContact | null>(null);
  const [contacts, setContacts] = useState<CustomerLegacyContact[]>(Array.isArray(full?.contacts) ? full!.contacts! : []);
  const [contactsKey, setContactsKey] = useState(0);
  /** Pending contacts for new (unsaved) customers — stored locally until customer is created */
  const [pendingContacts, setPendingContacts] = useState<CustomerLegacyContact[]>([]);
  const pendingIdCounter = useRef(0);
  const [legacyMsg, setLegacyMsg] = useState('');


  const buildFormFromCustomer = useCallback((c: CustomerCardCustomer) => {
    const x = c as Record<string, unknown>;
    return {
      type: c.type || '',
      name: c.name || '',
      classificationCode: c.type || '',
      classificationNumber:
        (c.legacySubClassificationCode as string) ||
        (x.subClassification as string) ||
        (x.classificationNumber as string) ||
        '',
      salesRep: (c.salesRepresentative as string) || (x.salesRep as string) || '',
      functional: (c.functionalLabel as string) || (x.functional as string) || '',
      contactName: c.contactName || '',
      accountNumber:
        (c.legacyAccountNumber as string) || (x.hnum as string) || (x.accountNumber as string) || '',
      companyRegNumber: (c.companyRegNumber as string) || (x.companyNumber as string) || '',
      customerSize: (c.customerSize ?? (x.customerSize as string)) || '',
      managementProfile: (c.managementProfile as string) || '',
      phone: c.phone || '',
      phone2: (c.phone2 as string) || '',
      phone3: (c.phone3 as string) || '',
      fax: (c.fax as string) || '',
      address: (c.address as string) || '',
      city: c.city || '',
      email: c.email || '',
      website: (c.website as string) || '',
      zipLegacy: (c.zipLegacy as string) || '',
      cityCodeLegacy: (c.cityCodeLegacy as string) || '',
      countryRegion: (c.countryOrRegion as string) || (x.country as string) || (x.region as string) || '',
      topDate: formatLegacyDate(c.legacyUpdatedAt),
      notes: (c.notes as string) || '',
      internalNotes: (c.internalNotes as string) || '',
      leadSource: (x.leadSource as string) || '',
      services: Array.isArray(c.services) ? c.services : [],
    };
  }, []);

  const [customerForm, setCustomerForm] = useState(() => buildFormFromCustomer(customer));

  const AUTO_CONTACT_ID = '__auto_private__';

  // Auto-add/update a pending contact when type is PRIVATE in new customer mode
  useEffect(() => {
    if (!isNewMode) return;
    const isPrivateType = customerForm.type === 'PRIVATE';
    const hasOtherContacts = pendingContacts.some(c => c.id !== AUTO_CONTACT_ID);
    if (isPrivateType && !hasOtherContacts) {
      setPendingContacts(prev => {
        const existing = prev.find(c => c.id === AUTO_CONTACT_ID);
        // Merge — prefer the customer-form value, but never wipe a value the user
        // typed directly into the auto contact card when the form field is empty.
        const autoContact: CustomerLegacyContact = {
          ...(existing ?? {}),
          id: AUTO_CONTACT_ID,
          fullName: (customerForm.name || '').trim() || existing?.fullName || '',
          phone: (customerForm.phone || '').trim() || existing?.phone || undefined,
          mobile: (customerForm.phone2 || '').trim() || existing?.mobile || undefined,
          email: (customerForm.email || '').trim() || existing?.email || undefined,
          isPrimary: true,
          isActive: true,
          notes: existing?.notes ?? null,
        };
        return [...prev.filter(c => c.id !== AUTO_CONTACT_ID), autoContact];
      });
    } else if (!isPrivateType && pendingContacts.some(c => c.id === AUTO_CONTACT_ID)) {
      setPendingContacts(prev => prev.filter(c => c.id !== AUTO_CONTACT_ID));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerForm.type, customerForm.name, customerForm.phone, customerForm.phone2, customerForm.email, isNewMode]);

  const prevCustomerIdRef = useRef(customer?.id);
  const prevCustomerNameRef = useRef(customer?.name);
  useEffect(() => {
    const idChanged = prevCustomerIdRef.current !== customer?.id;
    const nameChanged = prevCustomerNameRef.current !== customer?.name;
    prevCustomerIdRef.current = customer?.id;
    prevCustomerNameRef.current = customer?.name;

    // New mode: only rebuild form if a prefill name arrived (search → new customer).
    // This avoids wiping the form while user is typing.
    if (isNewMode || customer?.id === '__new__') {
      if ((idChanged || nameChanged) && customer?.name) {
        setCustomerForm(buildFormFromCustomer(customer));
      }
      return;
    }

    // Existing customer: reset form when customer ID changes.
    if (!idChanged) return;
    setCustomerForm(buildFormFromCustomer(customer));
  }, [customer, buildFormFromCustomer, isNewMode]);

  const [financeForm, setFinanceForm] = useState<CustomerFinanceTabForm>(() => buildFinanceFormFromCustomer(customer));

  useEffect(() => {
    setFinanceForm(buildFinanceFormFromCustomer(customer));
  }, [customer]);

  // Direct contacts fetch — fires whenever the customer changes.
  // This is the sole source of truth for contacts; full?.contacts is NOT used
  // because /full may return contacts:[] which would wipe the fetched data.
  useEffect(() => {
    console.log('contacts effect running', customer?.id, currentUser);
    if (!customer?.id) {
      console.log('contacts effect: early return — no customer.id');
      return;
    }
    if (isNewMode || customer.id === '__new__') {
      setContacts([]);
      console.log('contacts effect: new customer — clear stale list');
      return;
    }
    if (!currentUser) {
      console.log('contacts effect: early return — no currentUser');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        console.log('fetching contacts', `/customers/${customer.id}/contacts`);
        const res = await apiFetch(apiUrl(`/customers/${customer.id}/contacts`), {
          method: 'GET',
          authUser: currentUser,
        });
        console.log('contacts response status', res.status);
        const data = await res.json();
        console.log('contacts response data', data);
        if (!cancelled && Array.isArray(data)) {
          setContacts(data as CustomerLegacyContact[]);
        }
      } catch (e) {
        console.error('contacts fetch failed', e);
      }
    })();
    return () => { cancelled = true; };
  }, [customer?.id, currentUser, contactsKey, isNewMode]);

  const loadCustomerQuotes = useCallback(async () => {
    if (!customer?.id || isNewMode || customer.id === '__new__') {
      setCustomerQuotes([]);
      return;
    }
    setCustomerQuotesError('');
    const cid = String(customer.id).trim();
    if (!cid) {
      setCustomerQuotes([]);
      return;
    }
    setCustomerQuotesLoading(true);
    try {
      const quotesListUrl = new URL(apiUrl('/quotes'));
      quotesListUrl.searchParams.set('customerId', cid);
      const res = await apiFetch(quotesListUrl.toString(), {
        method: 'GET',
        authUser: currentUser,
      });
      if (!res.ok) {
        const errText = await parseApiErrorResponse(res);
        throw new Error(errText || `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (!Array.isArray(data)) {
        setCustomerQuotes([]);
        return;
      }
      /* השרת מסנן לפי ?customerId= — לא מסננים שוב ב-UI (סינון כפול הסיר הצעות תקינות) */
      setCustomerQuotes(
        data.map((q: Record<string, unknown>) => ({
          id: String(q.id ?? ''),
          quoteNumber: (q.quoteNumber as string | null | undefined) ?? null,
          quoteDate: (q.quoteDate as string | null | undefined) ?? null,
          createdAt: (q.createdAt as string | null | undefined) ?? null,
          status: (q.status as string | null | undefined) ?? null,
          totalAmount: q.totalAmount != null ? Number(q.totalAmount) : null,
          amount: q.amount != null ? Number(q.amount) : null,
          validityDate: (q.validityDate as string | null | undefined) ?? null,
          validTo: (q.validTo as string | null | undefined) ?? null,
          lastMergedDocPath: (q.lastMergedDocPath as string | null | undefined) ?? null,
          customerName: (q.customerName as string | null | undefined) ?? null,
          phoneSummary: (q.phoneSummary as string | null | undefined) ?? null,
          contactEmail: ((q.customer as Record<string, unknown> | undefined)?.email as string | null | undefined) ?? null,
          latestDocFileName: (() => {
            const docs = q.quoteDocuments as Array<Record<string, unknown>> | undefined;
            if (docs && docs.length > 0) return (docs[0].fileName as string | null) ?? null;
            return null;
          })(),
          latestDocAt: (() => {
            const docs = q.quoteDocuments as Array<Record<string, unknown>> | undefined;
            if (docs && docs.length > 0) return ((docs[0].updatedAt as string | null) ?? (docs[0].createdAt as string | null)) ?? null;
            return null;
          })(),
        })),
      );
    } catch {
      setCustomerQuotesError('טעינת הצעות מחיר נכשלה');
      setCustomerQuotes([]);
    } finally {
      setCustomerQuotesLoading(false);
    }
  }, [customer?.id, isNewMode, currentUser]);

  useEffect(() => {
    if (!showCustomerQuotesTab || isNewMode || !customer?.id || customer.id === '__new__') return;
    /* טאב quotes: טעינה. אחרי שמירת הצעה (refresh key>0): רענון גם כשעדיין בטאב אחר */
    if (activeLowerTab !== 'quotes' && customerQuotesRefreshKey === 0) return;
    void loadCustomerQuotes();
  }, [
    activeLowerTab,
    showCustomerQuotesTab,
    loadCustomerQuotes,
    customerQuotesRefreshKey,
    customer?.id,
    isNewMode,
  ]);

  const deleteCustomerQuote = useCallback(
    async (quoteId: string) => {
      if (!confirm('למחוק את הצעת המחיר?')) return;
      try {
        const res = await apiFetch(apiUrl(`/quotes/${encodeURIComponent(quoteId)}`), {
          method: 'DELETE',
          authUser: currentUser,
        });
        if (!res.ok) {
          const errText = await parseApiErrorResponse(res);
          alert(errText || 'מחיקה נכשלה');
          return;
        }
        await loadCustomerQuotes();
      } catch {
        alert('מחיקה נכשלה');
      }
    },
    [currentUser, loadCustomerQuotes],
  );

  const [leadSourceRows, setLeadSourceRows] = useState<CustomerLeadSourceRow[]>(() =>
    buildLeadSourceRowsFromFull(full, customer),
  );

  useEffect(() => {
    setLeadSourceRows(buildLeadSourceRowsFromFull(full, customer));
  }, [full, customer]);

  const [mailingExtras, setMailingExtras] = useState<CustomerMailingTabExtras>(() => buildMailingExtrasFromCustomer(customer));

  useEffect(() => {
    setMailingExtras(buildMailingExtrasFromCustomer(customer));
  }, [customer]);

  const [notesTabExtras, setNotesTabExtras] = useState<CustomerNotesTabExtras>(() => buildNotesTabExtrasFromCustomer(customer));

  useEffect(() => {
    setNotesTabExtras(buildNotesTabExtrasFromCustomer(customer));
  }, [customer]);

  const [relationRows, setRelationRows] = useState<CustomerRelationRow[]>(() =>
    buildRelationRowsFromFull(full, customer),
  );

  useEffect(() => {
    setRelationRows(buildRelationRowsFromFull(full, customer));
  }, [full, customer]);

  const [questionnaireRows, setQuestionnaireRows] = useState<CustomerQuestionnaireRow[]>(() =>
    buildQuestionnaireRowsFromFull(full, customer),
  );

  useEffect(() => {
    setQuestionnaireRows(buildQuestionnaireRowsFromFull(full, customer));
  }, [full, customer]);

  const [documentRows, setDocumentRows] = useState<CustomerDocumentTabRow[]>(() => buildDocumentRowsFromFull(full));
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);

  useEffect(() => {
    setDocumentRows(buildDocumentRowsFromFull(full));
    setSelectedDocumentId(null);
  }, [full]);

  const [additionalDataRows, setAdditionalDataRows] = useState<CustomerAdditionalDataRow[]>(() =>
    buildAdditionalDataRows(customer, full),
  );

  useEffect(() => {
    setAdditionalDataRows(buildAdditionalDataRows(customer, full));
  }, [customer, full]);

  const [moreDetailsForm, setMoreDetailsForm] = useState<CustomerMoreDetailsForm>(() =>
    buildMoreDetailsFromCustomer(customer),
  );

  useEffect(() => {
    setMoreDetailsForm(buildMoreDetailsFromCustomer(customer));
  }, [customer]);

  const [externalDataRows, setExternalDataRows] = useState<CustomerExternalDataRow[]>(() =>
    buildExternalDataRows(customer, full),
  );

  useEffect(() => {
    setExternalDataRows(buildExternalDataRows(customer, full));
  }, [customer, full]);

  const sortedClassifications = useMemo(() => {
    const source = classifications.length > 0
      ? classifications
      : [
          { id: 'preset-company', code: 'COMPANY', labelHe: 'חברה / קבלן', sortOrder: 0, isPreset: true },
          { id: 'preset-public',  code: 'PUBLIC',  labelHe: 'רשות / מוסד',  sortOrder: 1, isPreset: true },
          { id: 'preset-private', code: 'PRIVATE', labelHe: 'לקוח פרטי',    sortOrder: 2, isPreset: true },
        ];
    // ודא שסיווג "ספק" תמיד זמין — מתנהג כמו חברה / מוסד (דורש איש קשר), לא כמו לקוח פרטי.
    const withSupplier = source.some((c: any) => c.code === 'SUPPLIER')
      ? source
      : [...source, { id: 'preset-supplier', code: 'SUPPLIER', labelHe: 'ספק', sortOrder: 3, isPreset: true }];
    return [...withSupplier].sort((a, b) => a.sortOrder - b.sortOrder || a.labelHe.localeCompare(b.labelHe, 'he'));
  }, [classifications]);

  const sectionShell = 'rounded-3xl border border-white/65 overflow-hidden';
  const sectionHeader = 'px-6 py-3 text-base font-bold text-black';
  const briefBoxClass = 'space-y-1.5';
  const briefBoxConnected = 'space-y-1.5';
  const labelClass = 'block text-[12px] font-semibold text-black';
  const inputClass =
    'h-[44px] w-full rounded-[14px] border border-[#D9E4EF] bg-white px-3 py-2 text-sm text-right text-black placeholder-[#999] outline-none transition-all focus:border-[#8FBF8F] focus:ring-[3px] focus:ring-[rgba(143,191,143,0.18)]';
  const inputConnected =
    'h-[44px] w-full rounded-[14px] border border-[#D9E4EF] bg-white px-3 py-2 text-sm text-right text-black placeholder-[#999] outline-none transition-all focus:border-[#8FBF8F] focus:ring-[3px] focus:ring-[rgba(143,191,143,0.18)]';
  const viewClass =
    'h-[44px] rounded-[14px] border border-[#D9E4EF] bg-white px-3 py-2 text-sm text-right text-black flex items-center';

  const isEdit = mode === 'edit';

  /** Combined contacts: real (from DB) + pending (local, for new customers) */
  const allContacts = useMemo(() => [...contacts, ...pendingContacts], [contacts, pendingContacts]);

  const onSaveCustomerMain = async () => {
    if (saveMainInFlightRef.current) return;
    saveMainInFlightRef.current = true;
    setSavingCustomer(true);
    setLegacyMsg('');
    const isoNoon = (d: string) => (d ? `${d}T12:00:00.000Z` : null);
    const looksLikeUuid = (id: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);

    const typeVal = (customerForm.type || customer.type || '').trim();
    const nameVal = (customerForm.name || customer.name || '').trim();
    // contactName: auto-derive from name for private customers, or from first contact
    const isPrivate = typeVal === 'PRIVATE';
    const contactNameVal = isPrivate
      ? nameVal
      : (allContacts.length > 0 ? allContacts[0].fullName || '' : (customerForm.contactName || customer.contactName || '')).trim();
    const phoneVal = (customerForm.phone || '').trim();
    const phone2Val = (customerForm.phone2 || '').trim();
    const emailVal = (customerForm.email || '').trim();
    const cityVal = (customerForm.city || '').trim();

    try {
      if (!typeVal) {
        setLegacyMsg('נא לבחור סוג לקוח.');
        return;
      }
      if (!nameVal) {
        setLegacyMsg('שם לקוח הוא שדה חובה.');
        return;
      }
      /* At least one phone required: סלולארי OR קווי */
      if (!phoneVal && !phone2Val) {
        setLegacyMsg('חובה למלא לפחות טלפון סלולארי או טלפון קווי.');
        return;
      }
      if (phoneVal && !israeliPhoneLooksValid(phoneVal)) {
        setLegacyMsg('פורמט טלפון סלולארי לא תקין (דוגמה: 050-1234567).');
        setPhoneWarn('פורמט טלפון לא תקין');
        return;
      }
      if (phone2Val && !israeliPhoneLooksValid(phone2Val)) {
        setLegacyMsg('פורמט טלפון קווי לא תקין (דוגמה: 09-9621006).');
        setPhone2Warn('פורמט טלפון לא תקין');
        return;
      }
      if (emailVal && !customerEmailLooksValid(emailVal)) {
        setLegacyMsg('כתובת הדוא״ל אינה תקינה.');
        setEmailWarn('כתובת דוא״ל אינה תקינה');
        return;
      }
      /* For new customers: at least one contact required */
      if (isNewMode && allContacts.length === 0) {
        setLegacyMsg('חובה להוסיף לפחות איש קשר אחד לפני שמירה.');
        setActiveLowerTab('contacts');
        return;
      }
      /* לקוח שאינו פרטי — חובה איש קשר (גם בעריכת לקוח קיים, לא רק ביצירה) */
      if (!isPrivate && !contactNameVal) {
        setLegacyMsg('לא ניתן להמשיך בלי להוסיף איש קשר.');
        setActiveLowerTab('contacts');
        return;
      }
      if (!cityVal) {
        setLegacyMsg('עיר היא שדה חובה.');
        return;
      }

      /** Body keys align with API UpdateCustomerDto + customers.service patch whitelist */
      const primaryPhone = phoneVal || phone2Val; // at least one guaranteed by validation above
      const body: Record<string, unknown> = {
        type: typeVal,
        name: nameVal,
        contactName: contactNameVal,
        phone: primaryPhone,
        phone2: phone2Val || null,
        phone3: (customerForm.phone3 || '').trim() || null,
        fax: (customerForm.fax || '').trim() || null,
        address: (customerForm.address || '').trim() || null,
        city: cityVal,
        email: emailVal,
        website: (customerForm.website || '').trim() || null,
        zipLegacy: (customerForm.zipLegacy || '').trim() || null,
        cityCodeLegacy: (customerForm.cityCodeLegacy || '').trim() || null,
        notes: (customerForm.notes || '').trim() || null,
        services: customerForm.services ?? [],
        companyRegNumber: (customerForm.companyRegNumber || '').trim() || null,
        internalNotes: (customerForm.internalNotes || '').trim() || null,
        birthdayLegacy: moreDetailsForm.birthDate ? isoNoon(moreDetailsForm.birthDate) : null,
        legacyAccountNumber: (customerForm.accountNumber || '').trim() || null,
        legacySubClassificationCode: (customerForm.classificationNumber || '').trim() || null,
        salesRepresentative: (customerForm.salesRep || '').trim() || null,
        functionalLabel: (customerForm.functional || '').trim() || null,
        customerSize: (customerForm.customerSize || '').trim() || null,
        managementProfile: (customerForm.managementProfile || '').trim() || null,
        countryOrRegion: (customerForm.countryRegion || '').trim() || null,
        mailingAddress: (customerForm.address || '').trim() || null,
        mailingCity: cityVal,
        mailingZip: (customerForm.zipLegacy || '').trim() || null,
        mailingInvalidField: (mailingExtras.wrongField || '').trim() || null,
        mailingPoBox: (mailingExtras.poBox || '').trim() || null,
        allowMail: mailingExtras.prefMailing,
        allowFax: mailingExtras.prefFax,
        allowEmail: mailingExtras.prefEmail,
        allowSms: mailingExtras.prefSms,
        mailingNote: (mailingExtras.mailingNote || '').trim() || null,
        registrationDate: isoNoon(notesTabExtras.registrationDate),
        lastUpdateDate: isoNoon(notesTabExtras.lastUpdateDate),
        lastUpdatedBy: (notesTabExtras.lastUser || '').trim() || null,
        priceList: (financeForm.priceList || '').trim() || null,
        roundedPricing: (financeForm.rounded || '').trim() || null,
        employeeCount: (financeForm.employeeCount || '').trim() || null,
        managementCustomerLabel: (financeForm.customerInManagement || '').trim() || null,
        financialNumber1: (financeForm.number1 || '').trim() || null,
        financialNumber2: (financeForm.number2Small || '').trim() || null,
        financialNumber2Large: (financeForm.number2Large || '').trim() || null,
        financialNumber3: (financeForm.number3 || '').trim() || null,
        financeToken: (financeForm.tokenText || '').trim() || null,
        financeTokenDate: isoNoon(financeForm.tokenDate),
        financeTokenActive: financeForm.tokenOn,
        financeUnnamed1: (financeForm.unnamedAux1 || '').trim() || null,
        financeUnnamed2: (financeForm.unnamedAux2 || '').trim() || null,
        financeUnnamed3: (financeForm.unnamedAux3 || '').trim() || null,
        financeUnnamed4: (financeForm.unnamedAux4 || '').trim() || null,
        totalPurchases: (financeForm.totalPurchases || '').trim() || null,
        totalSales: (financeForm.totalSales || '').trim() || null,
        percentageValue: (financeForm.percent || '').trim() || null,
        paymentTerms: (financeForm.paymentTerms || '').trim() || null,
        creditDays: (financeForm.creditDays || '').trim() || null,
        creditEnabled: financeForm.creditOn,
        creditNumber: (financeForm.creditNumber || '').trim() || null,
        creditExpiry: (financeForm.validity || '').trim() || null,
        microwaveModel: (moreDetailsForm.microgelModel || '').trim() || null,
        detectorLocation: (moreDetailsForm.detectorLocation || '').trim() || null,
        companyAmount: (moreDetailsForm.companyQuantity || '').trim() || null,
        feature7: (moreDetailsForm.feature7 || '').trim() || null,
        detailDate1: isoNoon(moreDetailsForm.date1),
        detailDate2: isoNoon(moreDetailsForm.date2),
        detailDate3: isoNoon(moreDetailsForm.date3),
        detailDate4: isoNoon(moreDetailsForm.date4),
        detectorModel: (moreDetailsForm.detectorModel || '').trim() || null,
        feature4: (moreDetailsForm.feature4 || '').trim() || null,
        companyWall: (moreDetailsForm.wallCompany || '').trim() || null,
        feature8: (moreDetailsForm.feature8 || '').trim() || null,
      };

      const putTab = async (path: string, payload: unknown, stepLabel: string) => {
        const r = await apiFetch(apiUrl(path), {
          method: 'PUT',
          authUser: currentUser,
          body: JSON.stringify(payload),
        });
        if (!r.ok) throw new Error(`${stepLabel}: ${await parseApiErrorResponse(r)}`);
      };

      /* ─── NEW customer: POST to create ─── */
      if (isNewMode) {
        const res = await apiFetch(apiUrl('/customers'), {
          method: 'POST',
          authUser: currentUser,
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(await parseApiErrorResponse(res));
        const created = (await res.json()) as CustomerCardCustomer;

        /* Save pending contacts (added locally before customer existed) */
        if (pendingContacts.length > 0) {
          for (const pc of pendingContacts) {
            try {
              await apiFetch(apiUrl(`/customers/${created.id}/contacts`), {
                method: 'POST',
                authUser: currentUser,
                body: JSON.stringify({
                  fullName: pc.fullName,
                  department: pc.department,
                  roleTitle: pc.roleTitle,
                  mobile: pc.mobile,
                  phone: pc.phone,
                  fax: pc.fax,
                  email: pc.email,
                  isPrimary: Boolean(pc.isPrimary),
                  isActive: pc.isActive !== false,
                  notes: pc.notes,
                }),
              });
            } catch { /* non-critical — customer was already created */ }
          }
          setPendingContacts([]);
        } else if (isPrivate) {
          /* Fix 5: auto-create first contact for private customer when no pending contacts */
          try {
            await apiFetch(apiUrl(`/customers/${created.id}/contacts`), {
              method: 'POST',
              authUser: currentUser,
              body: JSON.stringify({
                fullName: nameVal,
                phone: phoneVal,
                email: emailVal,
                mobile: (customerForm.phone2 || '').trim() || null,
                isPrimary: true,
                isActive: true,
              }),
            });
          } catch { /* non-critical — customer was already created */ }
        }

        /* Save lead source selected in the new-customer modal */
        if (customerForm.leadSource) {
          try {
            await putTab(
              `/customers/${created.id}/referral-sources`,
              { items: [{ date: null, sourceName: customerForm.leadSource }] },
              'מקורות הגעה',
            );
          } catch { /* non-critical — customer was already created */ }
        }

        setIsNewMode(false);
        if (onCustomerCreated) onCustomerCreated(created);
        onCustomerUpdated(created);
        setLegacyMsg('הלקוח נוצר בהצלחה');
      } else {
        /* ─── EXISTING customer: PATCH to update ─── */
        const res = await apiFetch(apiUrl(`/customers/${customer.id}`), {
          method: 'PATCH',
          authUser: currentUser,
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(await parseApiErrorResponse(res));
        const updated = (await res.json()) as CustomerCardCustomer;
        onCustomerUpdated(updated);

        await putTab(
          `/customers/${customer.id}/referral-sources`,
          {
            items: leadSourceRows.map((r) => ({
              date: r.date ? isoNoon(r.date) : null,
              sourceName: r.sourceName || null,
            })),
          },
          'מקורות הגעה',
        );
        await putTab(
          `/customers/${customer.id}/questionnaires`,
          {
            items: questionnaireRows.map((r) => ({
              questionnaireCode: r.code || null,
              questionnaireName: r.name || null,
            })),
          },
          'שאלונים',
        );
        await putTab(
          `/customers/${customer.id}/relations`,
          {
            items: relationRows.map((r) => ({
              relatedCustomerName: r.customerName || null,
              relationType: r.relationType || null,
            })),
          },
          'קשרים',
        );
        await putTab(
          `/customers/${customer.id}/additional-data-rows`,
          {
            items: additionalDataRows.map((r) => ({
              numberValue: r.number || null,
              dValue: r.d || null,
              dateValue: r.dateStr ? isoNoon(r.dateStr) : null,
              text1: r.text1 || null,
              text2: r.text2 || null,
            })),
          },
          'נתונים נוספים',
        );
        await putTab(
          `/customers/${customer.id}/external-data-rows`,
          {
            items: externalDataRows.map((r) => ({
              colA: r.A || null,
              colB: r.B || null,
              colC: r.C || null,
              colD: r.D || null,
              colE: r.E || null,
              colF: r.F || null,
              colG: r.G || null,
              colH: r.H || null,
              colI: r.I || null,
              colJ: r.J || null,
            })),
          },
          'נתונים חיצוניים',
        );

        for (const row of documentRows) {
          if (!looksLikeUuid(row.id)) continue;
          const patchBody: Record<string, unknown> = {
            description: (row.description || '').trim() || null,
            documentType: row.docType || 'OTHER',
            documentDate: row.dateStr ? isoNoon(row.dateStr) : null,
          };
          const fn = row.fileName?.trim();
          if (fn) patchBody.name = fn;
          const dr = await apiFetch(apiUrl(`/customers/${customer.id}/documents/${row.id}`), {
            method: 'PATCH',
            authUser: currentUser,
            body: JSON.stringify(patchBody),
          });
          if (!dr.ok) throw new Error(`מסמכים: ${await parseApiErrorResponse(dr)}`);
        }

        await onFullReload();
        setLegacyMsg('הלקוח נשמר בהצלחה');
      }
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      setLegacyMsg(detail ? `לא ניתן היה לשמור: ${detail}` : 'לא ניתן היה לשמור. נסה שוב.');
    } finally {
      saveMainInFlightRef.current = false;
      setSavingCustomer(false);
    }
  };

  const resetContactEdit = () =>
    setContactEdit({
      id: '',
      fullName: '',
      department: '',
      roleTitle: '',
      mobile: '',
      phone: '',
      fax: '',
      email: '',
      isPrimary: false,
      isActive: true,
      notes: '',
    });

  const onSaveContact = async () => {
    if (!contactEdit) return;
    if (!isEdit && contactEdit.id) return;

    /* ── New-customer mode: store contact locally in pendingContacts ── */
    if (isNewMode) {
      const isPendingEdit = contactEdit.id.startsWith('pending-');
      if (isPendingEdit) {
        // editing an existing pending contact
        setPendingContacts((prev) => prev.map((pc) => (pc.id === contactEdit.id ? { ...contactEdit } : pc)));
      } else {
        // adding a new pending contact
        pendingIdCounter.current += 1;
        setPendingContacts((prev) => [
          ...prev,
          { ...contactEdit, id: `pending-${pendingIdCounter.current}`, isPrimary: prev.length === 0 },
        ]);
      }
      setContactEdit(null);
      setLegacyMsg('איש קשר נוסף (ישמר עם יצירת הלקוח)');
      return;
    }

    /* ── Existing customer: save via API ── */
    setContactBusy(true);
    setLegacyMsg('');
    try {
      const isNew = !contactEdit.id;
      const url = isNew
        ? apiUrl(`/customers/${customer.id}/contacts`)
        : apiUrl(`/customers/${customer.id}/contacts/${contactEdit.id}`);
      const method = isNew ? 'POST' : 'PATCH';
      const res = await apiFetch(url, {
        method,
        authUser: currentUser,
        body: JSON.stringify({
          fullName: contactEdit.fullName,
          department: contactEdit.department,
          roleTitle: contactEdit.roleTitle,
          mobile: contactEdit.mobile,
          phone: contactEdit.phone,
          fax: contactEdit.fax,
          email: contactEdit.email,
          isPrimary: Boolean(contactEdit.isPrimary),
          isActive: contactEdit.isActive !== false,
          notes: contactEdit.notes,
        }),
      });
      if (!res.ok) throw new Error(await parseApiErrorResponse(res));
      await onFullReload();
      setContactsKey((k) => k + 1);
      setContactEdit(null);
      setLegacyMsg('איש קשר נשמר בהצלחה');
    } catch (e) {
      const d = e instanceof Error ? e.message : String(e);
      setLegacyMsg(d ? `שמירת איש קשר נכשלה: ${d}` : 'שמירת איש קשר נכשלה. נסה שוב.');
    } finally {
      setContactBusy(false);
    }
  };

  const onDeleteContact = async (contactId: string) => {
    if (!isEdit) return;
    if (!window.confirm('למחוק איש קשר?')) return;

    /* Pending contact (new-customer mode) — remove from local state */
    if (contactId.startsWith('pending-')) {
      setPendingContacts((prev) => prev.filter((pc) => pc.id !== contactId));
      setContactEdit(null);
      setLegacyMsg('איש קשר הוסר');
      return;
    }

    setContactBusy(true);
    setLegacyMsg('');
    try {
      const res = await apiFetch(apiUrl(`/customers/${customer.id}/contacts/${contactId}`), {
        method: 'DELETE',
        authUser: currentUser,
      });
      if (!res.ok) throw new Error(await parseApiErrorResponse(res));
      await onFullReload();
      setLegacyMsg('איש קשר נמחק');
    } catch (e) {
      const d = e instanceof Error ? e.message : String(e);
      setLegacyMsg(d ? `מחיקה נכשלה: ${d}` : 'מחיקה נכשלה. נסה שוב.');
    } finally {
      setContactBusy(false);
    }
  };

  // Field component moved to module scope as CardField to prevent focus-loss bug
  const Field = CardField;

  /* ── Inline validation warnings ── */
  const [phoneWarn, setPhoneWarn] = useState('');
  const [phone2Warn, setPhone2Warn] = useState('');
  const [emailWarn, setEmailWarn] = useState('');
  /* ── City autocomplete ── */
  const [cityOpen, setCityOpen] = useState(false);
  const [cityFilter, setCityFilter] = useState('');
  const cityRef = useRef<HTMLDivElement>(null);
  const filteredCities = useMemo(() => {
    const q = (cityFilter || customerForm.city || '').trim();
    if (!q) return ISRAEL_CITIES;
    return ISRAEL_CITIES.filter((c) => c.includes(q));
  }, [cityFilter, customerForm.city]);

  // close city dropdown on outside click
  useEffect(() => {
    if (!cityOpen) return;
    const handler = (e: MouseEvent) => {
      if (cityRef.current && !cityRef.current.contains(e.target as Node)) setCityOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [cityOpen]);

  /* When the customer type is/becomes PRIVATE and has no contacts yet, auto-populate
     a first contact from the top fields — covers both an existing PRIVATE customer
     with no saved contacts (on load) and switching an existing customer to PRIVATE.
     New-customer mode is handled separately by the AUTO_CONTACT_ID effect above. */
  const prevTypeRef = useRef<string | null>(null);
  useEffect(() => {
    if (isNewMode) return;
    const wasPrivate = prevTypeRef.current === 'PRIVATE';
    if (customerForm.type === 'PRIVATE' && !wasPrivate && allContacts.length === 0) {
      setContactEdit({
        id: '',
        fullName: customerForm.name || '',
        department: '',
        roleTitle: '',
        mobile: (customerForm.phone2 || '').trim() || '',
        phone: customerForm.phone || '',
        fax: '',
        email: customerForm.email || '',
        isPrimary: true,
        isActive: true,
        notes: '',
      });
      setActiveLowerTab('contacts');
    }
    prevTypeRef.current = customerForm.type;
  }, [isNewMode, customerForm.type, customerForm.name, customerForm.phone, customerForm.phone2, customerForm.email, allContacts.length]);

  /* ══════════════════════════════════════════════════
     NEW-CUSTOMER MODAL — pixel-perfect match to screenshots
     ══════════════════════════════════════════════════ */
  if (isNewMode) {
    const mInput =
      'h-[50px] w-full rounded-2xl border border-[#E2E8F0] bg-white px-5 text-[15px] text-right text-black placeholder-[#999] outline-none transition-all focus:border-green-400 focus:ring-[3px] focus:ring-green-100';
    const mLabel = 'block text-[13px] font-semibold text-black mb-1.5';
    const locationIcon = (
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
        <circle cx="12" cy="10" r="3"/>
      </svg>
    );

    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center" dir="rtl">
        {/* Dark overlay */}
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onBack} />

        {/* Modal container */}
        <div
          className="relative z-10 flex flex-col w-full max-w-[680px] mx-4 rounded-3xl overflow-hidden bg-white"
          style={{
            maxHeight: 'calc(100vh - 40px)',
            boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
          }}
        >
          {/* ── DARK HEADER ── */}
          <div
            className="shrink-0 flex items-center justify-between px-7 py-4"
            style={{ background: '#1E293B' }}
          >
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center"
                style={{ background: '#334155' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <line x1="19" y1="8" x2="19" y2="14"/>
                  <line x1="22" y1="11" x2="16" y2="11"/>
                </svg>
              </div>
              <div>
                <h2 className="text-[17px] font-bold text-white leading-tight">הוספת לקוח חדש</h2>
                <p className="text-[12px] text-slate-400 mt-0.5">כרטיס לקוח מהיר</p>
              </div>
            </div>
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-all"
                title="סגור"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            )}
          </div>

          {/* ── FORM BODY ── */}
          <div className="flex-1 overflow-y-auto px-7 py-5" style={{ background: '#F8FAFC' }}>
            {/* Error / success message */}
            {legacyMsg && (
              <div className={cn(
                'mb-4 rounded-2xl px-4 py-3 text-[14px] font-medium',
                legacyMsg.includes('בהצלחה') ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'
              )}>
                {legacyMsg}
              </div>
            )}

            {/* Row 1: שם מלא + ח.פ / ת.ז */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className={mLabel}>שם מלא *</label>
                <input
                  className={mInput}
                  value={customerForm.name}
                  onChange={(e) => setCustomerForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="לדוגמה: ענבל כהן"
                />
              </div>
              <div>
                <label className={mLabel}>ח.פ / ת.ז</label>
                <input
                  className={mInput}
                  value={customerForm.companyRegNumber}
                  onChange={(e) => setCustomerForm((p) => ({ ...p, companyRegNumber: e.target.value }))}
                  placeholder="מספר מזהה"
                />
              </div>
            </div>

            {/* Row 2: נייד ליצירת קשר + כתובת אימייל */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className={mLabel}>נייד ליצירת קשר *</label>
                <div className="relative">
                  <input
                    className={cn(mInput, 'pr-12', phoneWarn && 'border-red-400 bg-red-50/50')}
                    value={customerForm.phone}
                    onChange={(e) => { setCustomerForm((p) => ({ ...p, phone: e.target.value })); if (phoneWarn) setPhoneWarn(''); }}
                    onBlur={() => { const f = autoFormatIsraeliPhone(customerForm.phone); if (f !== customerForm.phone) setCustomerForm((p) => ({ ...p, phone: f })); if (f.trim() && !israeliPhoneLooksValid(f)) setPhoneWarn('פורמט לא תקין'); else setPhoneWarn(''); }}
                    placeholder="050-0000000"
                  />
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#A0AEC0]">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                    </svg>
                  </div>
                  {phoneWarn && <div className="mt-1 text-[11px] font-medium text-red-600">{phoneWarn}</div>}
                </div>
              </div>
              <div>
                <label className={mLabel}>כתובת אימייל</label>
                <div className="relative">
                  <input
                    className={cn(mInput, 'pr-5 pl-12', emailWarn && 'border-red-400 bg-red-50/50')}
                    type="email"
                    dir="ltr"
                    style={{ textAlign: 'left' }}
                    value={customerForm.email}
                    onChange={(e) => { setCustomerForm((p) => ({ ...p, email: e.target.value })); if (emailWarn) setEmailWarn(''); }}
                    onBlur={() => { if (customerForm.email.trim() && !customerEmailLooksValid(customerForm.email)) setEmailWarn('כתובת דוא״ל אינה תקינה'); else setEmailWarn(''); }}
                    placeholder="name@example.com"
                  />
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#A0AEC0]">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="4" width="20" height="16" rx="2"/>
                      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                    </svg>
                  </div>
                  {emailWarn && <div className="mt-1 text-[11px] font-medium text-red-600">{emailWarn}</div>}
                </div>
              </div>
            </div>

            {/* Row 3: סיווג לקוח + מקור הגעה */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className={mLabel}>סיווג לקוח</label>
                <select
                  className={cn(mInput, 'appearance-none cursor-pointer')}
                  value={customerForm.type}
                  onChange={(e) => setCustomerForm((p) => ({ ...p, type: e.target.value, classificationCode: e.target.value }))}
                >
                  <option value="">בחר סיווג...</option>
                  {sortedClassifications.map((cl) => <option key={cl.id} value={cl.code}>{cl.labelHe}</option>)}
                </select>
              </div>
              <div>
                <label className={mLabel}>מקור הגעה</label>
                <select
                  className={cn(mInput, 'appearance-none cursor-pointer')}
                  value={customerForm.leadSource}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCustomerForm((p) => ({ ...p, leadSource: val }));
                    setLeadSourceRows((rows) =>
                      rows.length === 0
                        ? (val ? [{ id: `ls-sync-${Date.now()}`, date: '', sourceName: val }] : rows)
                        : rows.map((r, i) => i === 0 ? { ...r, sourceName: val } : r)
                    );
                  }}
                >
                  <option value="">בחר מקור...</option>
                  {LEAD_SOURCE_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
            </div>

            {/* Row 4: עיר + כתובת מלאה */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className={mLabel}>עיר</label>
                <div className="relative" ref={cityRef}>
                  <input
                    className={cn(mInput, 'pr-12')}
                    value={customerForm.city}
                    onChange={(e) => { setCustomerForm((p) => ({ ...p, city: e.target.value })); setCityFilter(e.target.value); setCityOpen(true); }}
                    onFocus={() => setCityOpen(true)}
                    placeholder="הקלד עיר..."
                  />
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#A0AEC0]">
                    {locationIcon}
                  </div>
                  {cityOpen && (
                    <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-xl border border-[#D9E4EF] bg-white" style={{ boxShadow: '0 8px 24px rgba(135,160,190,0.18)' }}>
                      {filteredCities.length === 0 && customerForm.city.trim() ? (
                        <button
                          type="button"
                          className="w-full px-3 py-2 text-right text-sm text-[#2E7D32] hover:bg-[#F0F7EF] rounded-lg transition-colors"
                          onClick={() => { setCityOpen(false); }}
                        >
                          + הוסף &quot;{customerForm.city.trim()}&quot; כעיר חדשה
                        </button>
                      ) : (
                        filteredCities.slice(0, 50).map((c) => (
                          <button
                            key={c}
                            type="button"
                            className={cn('w-full px-3 py-1.5 text-right text-sm hover:bg-[#F0F7EF] rounded-lg transition-colors', c === customerForm.city && 'bg-[#E8F5E9] font-medium')}
                            onClick={() => { setCustomerForm((p) => ({ ...p, city: c })); setCityOpen(false); setCityFilter(''); }}
                          >
                            {c}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className={mLabel}>כתובת מלאה</label>
                <div className="relative">
                  <input
                    className={cn(mInput, 'pr-12')}
                    value={customerForm.address}
                    onChange={(e) => setCustomerForm((p) => ({ ...p, address: e.target.value }))}
                    placeholder="רחוב, מספר בית..."
                  />
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#A0AEC0]">
                    {locationIcon}
                  </div>
                </div>
              </div>
            </div>

            {/* Row 5: הערות לטיפול — full width */}
            <div>
              <label className={mLabel}>הערות לטיפול</label>
              <textarea
                className={cn(mInput, 'min-h-[90px] resize-none !h-auto pt-4')}
                value={customerForm.notes}
                onChange={(e) => setCustomerForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder="פרטים נוספים שחשוב לדעת על הלקוח החדש..."
              />
            </div>

            {/* ── אנשי קשר ── */}
            <div className="mt-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[14px] font-bold text-black">אנשי קשר</span>
                <button
                  type="button"
                  onClick={() => {
                    pendingIdCounter.current += 1;
                    setPendingContacts((prev) => [
                      ...prev,
                      {
                        id: `pending-${pendingIdCounter.current}`,
                        fullName: '',
                        phone: '',
                        email: '',
                        roleTitle: '',
                        isPrimary: prev.length === 0,
                        isActive: true,
                      },
                    ]);
                  }}
                  className="h-[36px] rounded-xl flex items-center gap-1.5 px-4 text-[13px] font-semibold text-green-700 bg-green-50 border border-green-200 hover:bg-green-100 transition-all"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  הוסף איש קשר
                </button>
              </div>

              {pendingContacts.length === 0 && (
                <div className="rounded-2xl border border-dashed border-[#D9E4EF] bg-white/60 px-5 py-4 text-center text-[13px] text-[#8A9BB0]">
                  לא נוספו אנשי קשר עדיין
                </div>
              )}

              {pendingContacts.map((pc, idx) => (
                <div
                  key={pc.id}
                  className="rounded-2xl border border-[#E2E8F0] bg-white p-4 mb-3"
                  style={{ boxShadow: '0 1px 4px rgba(135,160,190,0.08)' }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[13px] font-semibold text-black">
                      איש קשר {idx + 1}
                      {pc.isPrimary && <span className="mr-2 text-[11px] font-medium text-green-600">(ראשי)</span>}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPendingContacts((prev) => prev.filter((c) => c.id !== pc.id))}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 transition-all"
                      title="הסר"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[12px] font-semibold text-black mb-1">שם איש קשר</label>
                      <input
                        className={cn(mInput, '!h-[42px] text-[14px]')}
                        value={pc.fullName}
                        onChange={(e) => {
                          const v = e.target.value;
                          setPendingContacts((prev) => prev.map((c) => c.id === pc.id ? { ...c, fullName: v } : c));
                        }}
                        placeholder="שם מלא"
                      />
                    </div>
                    <div>
                      <label className="block text-[12px] font-semibold text-black mb-1">טלפון</label>
                      <input
                        className={cn(mInput, '!h-[42px] text-[14px]')}
                        value={pc.phone || ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          setPendingContacts((prev) => prev.map((c) => c.id === pc.id ? { ...c, phone: v } : c));
                        }}
                        placeholder="050-0000000"
                      />
                    </div>
                    <div>
                      <label className="block text-[12px] font-semibold text-black mb-1">אימייל</label>
                      <input
                        className={cn(mInput, '!h-[42px] text-[14px]')}
                        type="email"
                        dir="ltr"
                        style={{ textAlign: 'left' }}
                        value={pc.email || ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          setPendingContacts((prev) => prev.map((c) => c.id === pc.id ? { ...c, email: v } : c));
                        }}
                        placeholder="name@example.com"
                      />
                    </div>
                    <div>
                      <label className="block text-[12px] font-semibold text-black mb-1">תפקיד</label>
                      <input
                        className={cn(mInput, '!h-[42px] text-[14px]')}
                        value={pc.roleTitle || ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          setPendingContacts((prev) => prev.map((c) => c.id === pc.id ? { ...c, roleTitle: v } : c));
                        }}
                        placeholder="תפקיד בחברה"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Hidden fields — keep form state for API (contactName, etc.) */}
            <div className="hidden">
              <input value={customerForm.contactName} onChange={(e) => setCustomerForm((p) => ({ ...p, contactName: e.target.value }))} />
            </div>
          </div>

          {/* ── MODAL FOOTER ── */}
          <div
            className="shrink-0 flex items-center gap-3 px-7 py-4 bg-white"
            style={{ borderTop: '1px solid #E8EFF6' }}
          >
            <button
              type="button"
              disabled={savingCustomer}
              onClick={onSaveCustomerMain}
              className="flex-1 h-[50px] rounded-2xl flex items-center justify-center gap-2 text-[15px] font-bold text-white disabled:opacity-50 transition-all hover:brightness-105"
              style={{
                background: '#22C55E',
                boxShadow: '0 4px 16px rgba(34,197,94,0.3)',
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              {savingCustomer ? 'שומר...' : 'שמור לקוח חדש'}
            </button>
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="h-[50px] rounded-2xl border border-[#D9E4EF] bg-white px-7 text-[15px] font-medium text-black hover:bg-white transition-all shrink-0"
              >
                סגור
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════
     EXISTING CUSTOMER CARD — original layout
     ══════════════════════════════════════════════════ */
  return (
    <div className="space-y-0" dir="rtl" style={{ minHeight: '100vh', background: '#F2F6FA' }}>

      {/* ══════ PAGE HEADER ══════ */}
      <div
        style={{
          background: 'linear-gradient(180deg, #EEF3F8 0%, #F7FAFC 100%)',
          borderBottom: '1px solid rgba(200,215,230,0.40)',
          padding: '18px 28px 14px 28px',
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#24364B', lineHeight: 1.2, margin: 0 }}>
              כרטיס לקוח
            </h1>
            <div style={{ fontSize: 13, color: '#8A9BB0', marginTop: 3 }}>
              {customer.name ? <span style={{ color: '#5E7186' }}>{customer.name}</span> : null}
              {customer.name && <span style={{ margin: '0 6px', opacity: 0.5 }}>·</span>}
              <span style={{ fontFamily: 'monospace', fontSize: 12, opacity: 0.7 }}>#{customer.id.slice(0, 8)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setMode(mode === 'edit' ? 'view' : 'edit')}
              className="h-[38px] rounded-[14px] border border-[#DCE7F2] bg-white/70 px-4 text-[13px] font-medium text-black hover:bg-[#E5ECF3] transition-all"
            >
              {mode === 'edit' ? 'ביטול' : 'עריכה'}
            </button>
            {isEdit && (
              <button
                type="button"
                disabled={savingCustomer}
                onClick={onSaveCustomerMain}
                className="h-[38px] rounded-[16px] px-6 text-[13px] font-bold text-[#2E4A2D] disabled:opacity-50 transition-all hover:brightness-105"
                style={{
                  background: 'linear-gradient(180deg, #BFE3B8 0%, #9FCF96 100%)',
                  boxShadow: '0 4px 14px rgba(143,191,143,0.28)',
                }}
              >
                {savingCustomer ? 'שומר...' : 'שמור'}
              </button>
            )}
          </div>
        </div>
      </div>
      {/* ══════ END PAGE HEADER ══════ */}

      {/* ── Card body with spacing ── */}
      <div style={{ padding: '20px 24px' }}>
      <div className={cn(sectionShell)} style={{ background: 'rgba(255,255,255,0.78)', boxShadow: '0 10px 30px rgba(135,160,190,0.18)', backdropFilter: 'blur(12px)', padding: '24px 28px' }}>

        {/* ── TOP SECTION: Main area + Left side column ── */}
        <div className="flex gap-6">
          {/* ── Right side: main rows ── */}
          <div className="flex-1 space-y-4">
            {/* ── Row 1: סיווג לקוח + מקור הגעה — same row, 2 columns ── */}
            <div className="grid grid-cols-2 gap-4">
              <Field label="סיווג לקוח *">
                {isEdit ? (
                  <select className={inputClass} value={customerForm.type} onChange={(e) => setCustomerForm((p) => ({ ...p, type: e.target.value, classificationCode: e.target.value }))}>
                    <option value="">— בחר סיווג —</option>
                    {sortedClassifications.map((cl) => <option key={cl.id} value={cl.code}>{cl.labelHe}</option>)}
                  </select>
                ) : (
                  <div className={viewClass}>{typeLabelMap[customerForm.type] || customerForm.type || '—'}</div>
                )}
              </Field>

              <Field label="מקור הגעה">
                {isEdit ? (
                  <select className={inputClass} value={customerForm.leadSource} onChange={(e) => {
                    const val = e.target.value;
                    setCustomerForm((p) => ({ ...p, leadSource: val }));
                    setLeadSourceRows((rows) =>
                      rows.length === 0
                        ? (val ? [{ id: `ls-sync-${Date.now()}`, date: '', sourceName: val }] : rows)
                        : rows.map((r, i) => i === 0 ? { ...r, sourceName: val } : r)
                    );
                  }}>
                    <option value="">— בחר מקור —</option>
                    {LEAD_SOURCE_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                ) : (
                  <div className={viewClass}>{customerForm.leadSource || '—'}</div>
                )}
              </Field>
            </div>

            {/* ── Row 2: שם הלקוח + טלפון סלולארי + טלפון קווי + פקס + מייל — same row, 5 columns ── */}
            <div className="grid grid-cols-5 gap-4">
              <Field label="שם לקוח *" connected>
                {isEdit ? (
                  <input className={inputConnected} value={customerForm.name} onChange={(e) => setCustomerForm((p) => ({ ...p, name: e.target.value }))} />
                ) : (
                  <div className={viewClass}>{customerForm.name || '—'}</div>
                )}
              </Field>

              <Field label="טלפון סלולארי" connected>
                {isEdit ? (
                  <div>
                    <input
                      className={cn(inputConnected, phoneWarn && 'border-red-400 bg-red-50/50')}
                      value={customerForm.phone}
                      onChange={(e) => { setCustomerForm((p) => ({ ...p, phone: e.target.value })); if (phoneWarn) setPhoneWarn(''); }}
                      onBlur={() => { const f = autoFormatIsraeliPhone(customerForm.phone); if (f !== customerForm.phone) setCustomerForm((p) => ({ ...p, phone: f })); if (f.trim() && !israeliPhoneLooksValid(f)) setPhoneWarn('פורמט לא תקין'); else setPhoneWarn(''); }}
                      placeholder="050-1234567"
                    />
                    {phoneWarn && <div className="mt-0.5 text-[10px] font-medium text-red-600">{phoneWarn}</div>}
                  </div>
                ) : (
                  <div className={viewClass}>{customerForm.phone || '—'}</div>
                )}
              </Field>

              <Field label="טלפון קווי" connected>
                {isEdit ? (
                  <div>
                    <input
                      className={cn(inputConnected, phone2Warn && 'border-red-400 bg-red-50/50')}
                      value={customerForm.phone2}
                      onChange={(e) => { setCustomerForm((p) => ({ ...p, phone2: e.target.value })); if (phone2Warn) setPhone2Warn(''); }}
                      onBlur={() => { const f = autoFormatIsraeliPhone(customerForm.phone2); if (f !== customerForm.phone2) setCustomerForm((p) => ({ ...p, phone2: f })); if (f.trim() && !israeliPhoneLooksValid(f)) setPhone2Warn('פורמט לא תקין'); else setPhone2Warn(''); }}
                      placeholder="09-9621006"
                    />
                    {phone2Warn && <div className="mt-0.5 text-[10px] font-medium text-red-600">{phone2Warn}</div>}
                  </div>
                ) : (
                  <div className={viewClass}>{customerForm.phone2 || '—'}</div>
                )}
              </Field>

              <Field label="פקס" connected>
                {isEdit ? (
                  <input
                    className={inputConnected}
                    value={customerForm.fax}
                    onChange={(e) => setCustomerForm((p) => ({ ...p, fax: e.target.value }))}
                    placeholder="09-9621007"
                  />
                ) : (
                  <div className={viewClass}>{customerForm.fax || '—'}</div>
                )}
              </Field>

              <Field label="מייל" connected>
                {isEdit ? (
                  <div>
                    <input
                      className={cn(inputConnected, emailWarn && 'border-red-400 bg-red-50/50')}
                      type="email"
                      value={customerForm.email}
                      onChange={(e) => { setCustomerForm((p) => ({ ...p, email: e.target.value })); if (emailWarn) setEmailWarn(''); }}
                      onBlur={() => { if (customerForm.email.trim() && !customerEmailLooksValid(customerForm.email)) setEmailWarn('כתובת דוא״ל אינה תקינה'); else setEmailWarn(''); }}
                      placeholder="name@example.com"
                    />
                    {emailWarn && <div className="mt-0.5 text-[10px] font-medium text-red-600">{emailWarn}</div>}
                  </div>
                ) : (
                  <div className={viewClass}>{customerForm.email || '—'}</div>
                )}
              </Field>
            </div>

            {/* ── Row 3: כתובת + עיר — same row, 2 columns ── */}
            <div className="grid grid-cols-2 gap-4">
              <Field label="כתובת" connected>
                {isEdit ? (
                  <input className={inputConnected} value={customerForm.address} onChange={(e) => setCustomerForm((p) => ({ ...p, address: e.target.value }))} />
                ) : (
                  <div className={viewClass}>{customerForm.address || '—'}</div>
                )}
              </Field>

              <Field label="עיר" connected>
                {isEdit ? (
                  <div className="relative" ref={cityRef}>
                    <input
                      className={inputConnected}
                      value={customerForm.city}
                      onChange={(e) => { setCustomerForm((p) => ({ ...p, city: e.target.value })); setCityFilter(e.target.value); setCityOpen(true); }}
                      onFocus={() => setCityOpen(true)}
                      placeholder="הקלד שם עיר..."
                    />
                    {cityOpen && (
                      <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-xl border border-[#D9E4EF] bg-white" style={{ boxShadow: '0 8px 24px rgba(135,160,190,0.18)' }}>
                        {filteredCities.length === 0 && customerForm.city.trim() ? (
                          <button
                            type="button"
                            className="w-full px-3 py-2 text-right text-sm text-[#2E7D32] hover:bg-[#F0F7EF] rounded-lg transition-colors"
                            onClick={() => { setCityOpen(false); }}
                          >
                            + הוסף &quot;{customerForm.city.trim()}&quot; כעיר חדשה
                          </button>
                        ) : (
                          filteredCities.slice(0, 50).map((c) => (
                            <button
                              key={c}
                              type="button"
                              className={cn('w-full px-3 py-1.5 text-right text-sm hover:bg-[#F0F7EF] rounded-lg transition-colors', c === customerForm.city && 'bg-[#E8F5E9] font-medium')}
                              onClick={() => { setCustomerForm((p) => ({ ...p, city: c })); setCityOpen(false); setCityFilter(''); }}
                            >
                              {c}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className={viewClass}>{customerForm.city || '—'}</div>
                )}
              </Field>
            </div>
          </div>

          {/* ── Left side column: ח.פ, איש מכירות, הערות ── */}
          <div className="w-[280px] shrink-0 space-y-4">
            <Field label="ח.פ / עוסק מורשה" connected>
              {isEdit ? (
                <input className={inputConnected} value={customerForm.companyRegNumber} onChange={(e) => setCustomerForm((p) => ({ ...p, companyRegNumber: e.target.value }))} />
              ) : (
                <div className={viewClass}>{customerForm.companyRegNumber || '—'}</div>
              )}
            </Field>

            <Field label="איש מכירות" connected>
              {isEdit ? (
                <input className={inputConnected} value={customerForm.salesRep} onChange={(e) => setCustomerForm((p) => ({ ...p, salesRep: e.target.value }))} />
              ) : (
                <div className={viewClass}>{customerForm.salesRep || '—'}</div>
              )}
            </Field>

            <Field label="הערות" connected>
              {isEdit ? (
                <textarea className={cn(inputConnected, 'min-h-[96px] resize-y !rounded-[16px] !h-auto')} value={customerForm.notes} onChange={(e) => setCustomerForm((p) => ({ ...p, notes: e.target.value }))} />
              ) : (
                <div className={cn(viewClass, 'min-h-[96px] whitespace-pre-wrap !h-auto !rounded-[16px]')}>{customerForm.notes || '—'}</div>
              )}
            </Field>

          </div>
        </div>

        {/* ── Hidden fields preserved in form for save — required by API validation ── */}
        {isEdit && (
          <div className="hidden">
            <select value={customerForm.type} onChange={(e) => setCustomerForm((p) => ({ ...p, type: e.target.value, classificationCode: e.target.value }))}>
              <option value="">—</option>
              {sortedClassifications.map((cl) => <option key={cl.id} value={cl.code}>{cl.labelHe}</option>)}
            </select>
            <input value={customerForm.contactName} onChange={(e) => setCustomerForm((p) => ({ ...p, contactName: e.target.value }))} />
          </div>
        )}

      </div>

      {/* טאבים תחתונים */}
      <div className={cn(sectionShell)} style={{ background: 'rgba(255,255,255,0.78)', boxShadow: '0 10px 30px rgba(135,160,190,0.18)', backdropFilter: 'blur(12px)' }}>
        <div className="flex flex-wrap justify-start gap-2 px-6 pt-5 pb-3">
          {lowerTabsVisible.map((t) => (
            <button
              key={t.key}
              type="button"
              className={cn(
                'h-[42px] rounded-[16px] px-[18px] text-[13px] font-medium transition-all',
                activeLowerTab === t.key
                  ? 'bg-white text-black border border-[#DCE7F2]'
                  : 'bg-[#EDF3F8] text-[#5E7186] border border-transparent hover:bg-[#E5ECF3]',
              )}
              style={activeLowerTab === t.key ? { boxShadow: '0 2px 8px rgba(135,160,190,0.15)' } : undefined}
              onClick={() => setActiveLowerTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="px-6 pb-5">

        {activeLowerTab === 'contacts' && (
          <div className="space-y-2">
            {/* Header row: title + action buttons */}
            <div className="flex items-center justify-between gap-3">
              <div className="text-lg font-bold text-black">
                אנשי קשר ({allContacts.length})
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="h-[40px] w-[40px] flex items-center justify-center rounded-full text-white text-xl font-bold transition-all hover:scale-105"
                  style={{ background: 'linear-gradient(180deg, #BFE3B8 0%, #7CC06E 100%)', boxShadow: '0 4px 12px rgba(124,192,110,0.35)' }}
                  onClick={resetContactEdit}
                  title="הוסף איש קשר"
                >
                  +
                </button>
              </div>
            </div>

            {/* Inline form — shown when adding or editing a contact */}
            {contactEdit && (isEdit || contactEdit.id === '') && (
              <div className="rounded-2xl border border-[#D9E4EF] bg-[#F8FBFF] p-5" style={{ boxShadow: '0 4px 16px rgba(135,160,190,0.10)' }}>
                <div className="mb-3 flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-[#EDF3F8] flex items-center justify-center text-xl">
                    👤
                  </div>
                  <div>
                    <div className="text-sm font-bold text-black">
                      {contactEdit.id ? 'עריכת איש קשר' : 'איש קשר חדש'}
                    </div>
                    <div className="text-xs text-[#7A8CA3]">איש קשר חיישן</div>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
                  <div className="space-y-1.5">
                    <label className="block text-[12px] font-semibold text-black">Full Name</label>
                    <input
                      className={inputClass}
                      placeholder="שם מלא"
                      value={contactEdit.fullName || ''}
                      onChange={(e) => setContactEdit((p) => (p ? { ...p, fullName: e.target.value } : p))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[12px] font-semibold text-black">Role</label>
                    <input
                      className={inputClass}
                      placeholder="תפקיד"
                      value={contactEdit.roleTitle || ''}
                      onChange={(e) => setContactEdit((p) => (p ? { ...p, roleTitle: e.target.value } : p))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[12px] font-semibold text-black">Phone</label>
                    <input
                      className={inputClass}
                      placeholder="טלפון"
                      value={contactEdit.phone || ''}
                      onChange={(e) => setContactEdit((p) => (p ? { ...p, phone: e.target.value } : p))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[12px] font-semibold text-black">Mobile</label>
                    <input
                      className={inputClass}
                      placeholder="סלולארי"
                      value={contactEdit.mobile || ''}
                      onChange={(e) => setContactEdit((p) => (p ? { ...p, mobile: e.target.value } : p))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[12px] font-semibold text-black">Email</label>
                    <input
                      className={inputClass}
                      placeholder="Email"
                      value={contactEdit.email || ''}
                      onChange={(e) => setContactEdit((p) => (p ? { ...p, email: e.target.value } : p))}
                    />
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2 justify-end">
                  <button
                    type="button"
                    className="h-[36px] rounded-[14px] border border-[#D9E4EF] bg-[#EEF4F8] px-4 text-xs font-medium text-black hover:bg-[#E5ECF3] transition-all"
                    onClick={() => setContactEdit(null)}
                  >
                    ביטול
                  </button>
                  <button
                    type="button"
                    className="h-[36px] rounded-[14px] px-5 text-xs font-bold text-[#2E4A2D] disabled:opacity-40 transition-all"
                    style={{ background: 'linear-gradient(180deg, #BFE3B8 0%, #9FCF96 100%)', boxShadow: '0 4px 12px rgba(143,191,143,0.25)' }}
                    disabled={(!isEdit && !!contactEdit.id) || contactBusy || !contactEdit.fullName?.trim()}
                    onClick={onSaveContact}
                  >
                    {contactBusy ? 'שומר...' : contactEdit.id ? 'עדכן איש קשר' : 'הוסף איש קשר'}
                  </button>
                </div>
              </div>
            )}

            {/* Contacts table */}
            <div className="overflow-x-auto rounded-2xl border border-[#E4ECF4] bg-white" style={{ boxShadow: '0 2px 8px rgba(135,160,190,0.08)' }}>
              <table className="w-full min-w-[36rem] border-collapse text-sm" dir="rtl">
                <thead>
                  <tr className="text-right text-xs font-semibold text-[#5E7186]" style={{ background: '#F5F9FC' }}>
                    <th className="px-4 py-3">פעולות</th>
                    <th className="px-4 py-3">חותמה</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">שם סלא</th>
                    <th className="px-4 py-3">טלפון</th>
                    <th className="px-4 py-3">נייד</th>
                    <th className="px-4 py-3">אימייל</th>
                  </tr>
                </thead>
                <tbody>
                  {allContacts.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-sm text-[#8A9BB0]">
                        אין אנשי קשר — לחץ &quot;+&quot; להוספה
                      </td>
                    </tr>
                  ) : (
                    allContacts.map((c) => (
                      <tr
                        key={c.id}
                        className={cn(
                          'text-right transition-colors cursor-pointer',
                          contactEdit?.id === c.id
                            ? 'bg-[#F0F7EF]'
                            : 'hover:bg-[#F8FBFF]',
                        )}
                        style={{ borderBottom: '1px solid #EDF2F8' }}
                        onClick={() => { setContactEdit(c); onContactSelected?.(c.id, c.fullName); }}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className="w-7 h-7 rounded-lg bg-[#EDF3F8] flex items-center justify-center text-[#5E7186] hover:bg-[#DCE7F2] transition-all text-xs"
                              onClick={(e) => { e.stopPropagation(); setContactEdit(c); }}
                              title="ערוך"
                            >
                              ✎
                            </button>
                            {isEdit && (
                              <button
                                type="button"
                                className="w-7 h-7 rounded-lg bg-[#FDF2F2] flex items-center justify-center text-red-500 hover:bg-red-100 transition-all text-xs disabled:opacity-40"
                                disabled={contactBusy}
                                onClick={(e) => { e.stopPropagation(); onDeleteContact(c.id); }}
                                title="מחק"
                              >
                                🗑
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="w-8 h-8 rounded-full bg-[#EDF3F8] flex items-center justify-center text-sm">👤</div>
                        </td>
                        <td className="px-4 py-3 text-[#66768B]">{c.roleTitle || '—'}</td>
                        <td className="px-4 py-3 font-semibold text-black">{c.fullName || '—'}</td>
                        <td className="px-4 py-3 text-black">{c.phone || '—'}</td>
                        <td className="px-4 py-3 text-black">{c.mobile || '—'}</td>
                        <td className="px-4 py-3 text-black" dir="ltr">{c.email || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeLowerTab === 'finance' && (
          <div className="space-y-2" dir="rtl">
            <div className="rounded-lg border-2 border-blue-700 bg-white p-3 shadow-sm">
              <p className="mb-3 rounded border border-amber-300 bg-amber-50 px-2 py-2 text-right text-[11px] font-semibold leading-snug text-amber-950">
                שדות נתונים כספיים: אין כרגע מיפוי ל־Prisma על מודל הלקוח (מלבד אפשרות עתידית לטעון אובייקט{' '}
                <span dir="ltr" className="font-mono text-[10px]">
                  financeTab
                </span>
                ). הערכים נשמרים רק במצב מקומי בדפדפן עד שיוגדר API — לא נשלחים ב־PATCH.
              </p>

              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:gap-6">
                {/* עמודה ימנית (כמו במסך הישן): סיכומים ואשראי */}
                <div className="w-full shrink-0 space-y-2 border-b border-slate-200 pb-4 xl:w-[min(100%,20rem)] xl:border-b-0 xl:border-l xl:border-slate-200 xl:pb-0 xl:pl-5">
                  {(
                    [
                      ['סה"כ קניות', 'totalPurchases'],
                      ['סה"כ מכירות', 'totalSales'],
                      ['אחוז', 'percent'],
                      ['תנאי תשלום', 'paymentTerms'],
                      ['ימי אשראי', 'creditDays'],
                    ] as const
                  ).map(([heLabel, key]) => (
                    <div key={key} className="flex items-center gap-2">
                      <label className="w-[7.25rem] shrink-0 text-right text-xs font-semibold text-slate-800">{heLabel}</label>
                      <input
                        type="text"
                        className={cn(isEdit ? inputClass : viewClass, 'flex-1')}
                        disabled={!isEdit}
                        value={financeForm[key]}
                        onChange={(e) => setFinanceForm((p) => ({ ...p, [key]: e.target.value }))}
                      />
                    </div>
                  ))}
                  <div className="flex items-center gap-2 pt-1">
                    <label className="flex w-[7.25rem] shrink-0 items-center justify-end gap-2 text-xs font-semibold text-slate-800">
                      <span>אשראי</span>
                    </label>
                    <div className="flex flex-1 items-center gap-2">
                      <input
                        type="checkbox"
                        title="במסך הישן: רדיו — כאן תיבת סימון לאותו מצב פעיל/לא פעיל"
                        className="h-4 w-4 shrink-0 rounded-full border-2 border-slate-500 accent-blue-700"
                        disabled={!isEdit}
                        checked={financeForm.creditOn}
                        onChange={(e) => setFinanceForm((p) => ({ ...p, creditOn: e.target.checked }))}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="w-[7.25rem] shrink-0 text-right text-xs font-semibold text-slate-800">מספר אשראי</label>
                    <input
                      type="text"
                      className={cn(isEdit ? inputClass : viewClass, 'flex-1')}
                      disabled={!isEdit}
                      value={financeForm.creditNumber}
                      onChange={(e) => setFinanceForm((p) => ({ ...p, creditNumber: e.target.value }))}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="w-[7.25rem] shrink-0 text-right text-xs font-semibold text-slate-800">תוקף</label>
                    <input
                      type="text"
                      className={cn(isEdit ? inputClass : viewClass, 'flex-1')}
                      disabled={!isEdit}
                      value={financeForm.validity}
                      onChange={(e) => setFinanceForm((p) => ({ ...p, validity: e.target.value }))}
                    />
                  </div>
                </div>

                {/* מרכז + שמאל: מחירון… TOKEN + עמודת שדות ללא תווית */}
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <label className="w-[7.5rem] shrink-0 text-right text-xs font-semibold text-slate-800">מחירון</label>
                      <input
                        type="text"
                        className={cn(isEdit ? inputClass : viewClass, 'flex-1')}
                        disabled={!isEdit}
                        value={financeForm.priceList}
                        onChange={(e) => setFinanceForm((p) => ({ ...p, priceList: e.target.value }))}
                      />
                    </div>
                    <div className="w-full shrink-0 sm:w-[4.85rem]" />
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <label className="w-[7.5rem] shrink-0 text-right text-xs font-semibold text-slate-800">מעוגל</label>
                      <input
                        type="text"
                        className={cn(isEdit ? inputClass : viewClass, 'flex-1')}
                        disabled={!isEdit}
                        value={financeForm.rounded}
                        onChange={(e) => setFinanceForm((p) => ({ ...p, rounded: e.target.value }))}
                      />
                    </div>
                    <div className="w-full shrink-0 sm:w-[4.85rem]" />
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <label className="w-[7.5rem] shrink-0 text-right text-xs font-semibold text-slate-800">מספר עובדים</label>
                      <select
                        className={cn(isEdit ? inputClass : viewClass, 'flex-1')}
                        disabled={!isEdit}
                        value={financeForm.employeeCount}
                        onChange={(e) => setFinanceForm((p) => ({ ...p, employeeCount: e.target.value }))}
                      >
                        <option value=""> </option>
                      </select>
                    </div>
                    <div className="w-full shrink-0 sm:w-[4.85rem] sm:pt-0">
                      <input
                        type="text"
                        title="שדה ללא תווית (מסך ישן)"
                        className={cn(isEdit ? inputClass : viewClass, 'w-full')}
                        disabled={!isEdit}
                        value={financeForm.unnamedAux1}
                        onChange={(e) => setFinanceForm((p) => ({ ...p, unnamedAux1: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <label className="w-[7.5rem] shrink-0 text-right text-xs font-semibold text-slate-800">לקוח בהנהלה</label>
                      <input
                        type="text"
                        className={cn(isEdit ? inputClass : viewClass, 'flex-1')}
                        disabled={!isEdit}
                        value={financeForm.customerInManagement}
                        onChange={(e) => setFinanceForm((p) => ({ ...p, customerInManagement: e.target.value }))}
                      />
                    </div>
                    <div className="w-full shrink-0 sm:w-[4.85rem]">
                      <input
                        type="text"
                        title="שדה ללא תווית (מסך ישן)"
                        className={cn(isEdit ? inputClass : viewClass, 'w-full')}
                        disabled={!isEdit}
                        value={financeForm.unnamedAux2}
                        onChange={(e) => setFinanceForm((p) => ({ ...p, unnamedAux2: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <label className="w-[7.5rem] shrink-0 text-right text-xs font-semibold text-slate-800">מספר 1</label>
                      <div className="flex min-w-0 flex-1 items-center gap-1">
                        <button
                          type="button"
                          title="חיפוש (לא מחובר)"
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-slate-300 bg-slate-100 text-sm disabled:opacity-50"
                          disabled={!isEdit}
                          tabIndex={-1}
                        >
                          🔍
                        </button>
                        <input
                          type="text"
                          className={cn(isEdit ? inputClass : viewClass, 'min-w-0 flex-1')}
                          disabled={!isEdit}
                          value={financeForm.number1}
                          onChange={(e) => setFinanceForm((p) => ({ ...p, number1: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="w-full shrink-0 sm:w-[4.85rem]">
                      <input
                        type="text"
                        title="שדה ללא תווית (מסך ישן)"
                        className={cn(isEdit ? inputClass : viewClass, 'w-full')}
                        disabled={!isEdit}
                        value={financeForm.unnamedAux3}
                        onChange={(e) => setFinanceForm((p) => ({ ...p, unnamedAux3: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
                    <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                      <label className="w-[7.5rem] shrink-0 text-right text-xs font-semibold text-slate-800 sm:pt-1">מספר 2</label>
                      <div className="flex min-w-0 flex-1 items-center gap-1">
                        <button
                          type="button"
                          title="חיפוש (לא מחובר)"
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-slate-300 bg-slate-100 text-sm disabled:opacity-50"
                          disabled={!isEdit}
                          tabIndex={-1}
                        >
                          🔍
                        </button>
                        <input
                          type="text"
                          className={cn(isEdit ? inputClass : viewClass, 'w-14 shrink-0 sm:w-16')}
                          disabled={!isEdit}
                          value={financeForm.number2Small}
                          onChange={(e) => setFinanceForm((p) => ({ ...p, number2Small: e.target.value }))}
                        />
                        <input
                          type="text"
                          className={cn(isEdit ? inputClass : viewClass, 'min-w-0 flex-1')}
                          disabled={!isEdit}
                          value={financeForm.number2Large}
                          onChange={(e) => setFinanceForm((p) => ({ ...p, number2Large: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="w-full shrink-0 sm:w-[4.85rem]">
                      <input
                        type="text"
                        title="שדה ללא תווית (מסך ישן)"
                        className={cn(isEdit ? inputClass : viewClass, 'w-full')}
                        disabled={!isEdit}
                        value={financeForm.unnamedAux4}
                        onChange={(e) => setFinanceForm((p) => ({ ...p, unnamedAux4: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <label className="w-[7.5rem] shrink-0 text-right text-xs font-semibold text-slate-800">מספר 3</label>
                      <input
                        type="text"
                        className={cn(isEdit ? inputClass : viewClass, 'flex-1')}
                        disabled={!isEdit}
                        value={financeForm.number3}
                        onChange={(e) => setFinanceForm((p) => ({ ...p, number3: e.target.value }))}
                      />
                    </div>
                    <div className="hidden w-[4.85rem] shrink-0 sm:block" aria-hidden />
                  </div>

                  <div className="border-t border-slate-200 pt-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="w-[7.5rem] shrink-0 text-right text-xs font-semibold text-slate-800">TOKEN</span>
                      <input
                        type="checkbox"
                        title="במסך הישן: רדיו — כאן תיבת סימון לאותו מצב פעיל/לא פעיל"
                        className="h-4 w-4 shrink-0 rounded-full border-2 border-slate-500 accent-blue-700"
                        disabled={!isEdit}
                        checked={financeForm.tokenOn}
                        onChange={(e) => setFinanceForm((p) => ({ ...p, tokenOn: e.target.checked }))}
                      />
                    </div>
                    <div className="mt-2 flex flex-col gap-2 sm:mr-[7.5rem]">
                      <input
                        type="text"
                        className={cn(isEdit ? inputClass : viewClass, 'w-full max-w-md')}
                        disabled={!isEdit}
                        value={financeForm.tokenText}
                        onChange={(e) => setFinanceForm((p) => ({ ...p, tokenText: e.target.value }))}
                      />
                      <input
                        type="date"
                        className={cn(isEdit ? inputClass : viewClass, 'w-full max-w-[11rem]', 'text-right')}
                        dir="ltr"
                        disabled={!isEdit}
                        value={financeForm.tokenDate}
                        onChange={(e) => setFinanceForm((p) => ({ ...p, tokenDate: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeLowerTab === 'source' && (
          <div className="space-y-2" dir="rtl">
            <div className="rounded-lg border-2 border-blue-700 bg-white shadow-sm">
              <div
                className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-600 bg-blue-50/90 px-2 py-1.5"
                dir="rtl"
              >
                <button
                  type="button"
                  title="הוספת שורה"
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded border border-green-700 bg-green-600 text-lg font-bold leading-none text-white shadow-sm transition hover:bg-green-700',
                    !isEdit && 'cursor-not-allowed opacity-40',
                  )}
                  disabled={!isEdit}
                  onClick={() => isEdit && setLeadSourceRows((rows) => [...rows, newLeadSourceRow()])}
                >
                  +
                </button>
                <p className="min-w-0 flex-1 text-right text-[11px] font-semibold leading-snug text-slate-700">
                  נטען מ־GET /customers/:id/full (referralSources). נשמר עם &quot;שמור כרטיס לקוח&quot; (PUT
                  /customers/:id/referral-sources).
                </p>
              </div>
              <div className="max-h-[min(22rem,55vh)] overflow-y-auto">
                <table className="w-full min-w-[16rem] border-collapse text-sm" dir="rtl">
                  <thead className="sticky top-0 z-[1] bg-blue-800 text-white">
                    <tr className="text-right text-xs font-semibold">
                      <th className="border-b border-blue-900 px-2 py-2.5 whitespace-nowrap">תאריך</th>
                      <th className="border-b border-blue-900 px-2 py-2.5">שם מקור הגעה</th>
                      {isEdit && (
                        <th className="w-10 border-b border-blue-900 px-1 py-2.5 text-center" aria-label="פעולות" />
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {leadSourceRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={isEdit ? 3 : 2}
                          className="px-2 py-8 text-center text-sm text-slate-500"
                        >
                          אין רשומות
                        </td>
                      </tr>
                    ) : (
                      leadSourceRows.map((row) => (
                        <tr key={row.id} className="border-b border-slate-200 text-right hover:bg-slate-50/80">
                          <td className="w-[7.5rem] min-w-[6.5rem] align-top px-2 py-1.5">
                            {isEdit ? (
                              <input
                                type="text"
                                className={inputClass}
                                value={row.date}
                                placeholder=""
                                onChange={(e) =>
                                  setLeadSourceRows((rows) =>
                                    rows.map((r) => (r.id === row.id ? { ...r, date: e.target.value } : r)),
                                  )
                                }
                              />
                            ) : (
                              <div className={viewClass}>{row.date || '—'}</div>
                            )}
                          </td>
                          <td className="min-w-0 align-top px-2 py-1.5">
                            {isEdit ? (
                              <input
                                type="text"
                                className={inputClass}
                                value={row.sourceName}
                                onChange={(e) =>
                                  setLeadSourceRows((rows) =>
                                    rows.map((r) => (r.id === row.id ? { ...r, sourceName: e.target.value } : r)),
                                  )
                                }
                              />
                            ) : (
                              <div className={viewClass}>{row.sourceName || '—'}</div>
                            )}
                          </td>
                          {isEdit && (
                            <td className="w-10 align-top px-1 py-1.5 text-center">
                              <button
                                type="button"
                                className="rounded border border-red-300 bg-red-50 px-1.5 py-0.5 text-xs font-semibold text-red-800 hover:bg-red-100"
                                title="הסר שורה"
                                onClick={() =>
                                  setLeadSourceRows((rows) => rows.filter((r) => r.id !== row.id))
                                }
                              >
                                ×
                              </button>
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeLowerTab === 'questionnaires' && (
          <div className="space-y-2" dir="rtl">
            <div className="rounded-lg border-2 border-blue-700 bg-white shadow-sm">
              <div
                className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-600 bg-blue-50/90 px-2 py-1.5"
                dir="rtl"
              >
                <button
                  type="button"
                  title="הוספת שורה"
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded border border-green-700 bg-green-600 text-lg font-bold leading-none text-white shadow-sm transition hover:bg-green-700',
                    !isEdit && 'cursor-not-allowed opacity-40',
                  )}
                  disabled={!isEdit}
                  onClick={() => isEdit && setQuestionnaireRows((rows) => [...rows, newQuestionnaireRow()])}
                >
                  +
                </button>
                <p className="min-w-0 flex-1 text-right text-[11px] font-semibold leading-snug text-slate-700">
                  נטען מ־GET /customers/:id/full (questionnaires). נשמר עם &quot;שמור כרטיס לקוח&quot; (PUT
                  /customers/:id/questionnaires).
                </p>
              </div>
              <div className="max-h-[min(22rem,55vh)] overflow-y-auto">
                <table className="w-full min-w-[16rem] border-collapse text-sm" dir="rtl">
                  <thead className="sticky top-0 z-[1] bg-blue-800 text-white">
                    <tr className="text-right text-xs font-semibold">
                      <th className="border-b border-blue-900 px-2 py-2.5 whitespace-nowrap">קוד שאלון</th>
                      <th className="border-b border-blue-900 px-2 py-2.5">שם שאלון</th>
                      {isEdit && (
                        <th className="w-10 border-b border-blue-900 px-1 py-2.5 text-center" aria-label="פעולות" />
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {questionnaireRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={isEdit ? 3 : 2}
                          className="px-2 py-8 text-center text-sm text-slate-500"
                        >
                          אין רשומות
                        </td>
                      </tr>
                    ) : (
                      questionnaireRows.map((row) => (
                        <tr key={row.id} className="border-b border-slate-200 text-right hover:bg-slate-50/80">
                          <td className="min-w-[6rem] align-top px-2 py-1.5">
                            {isEdit ? (
                              <input
                                type="text"
                                className={inputClass}
                                value={row.code}
                                onChange={(e) =>
                                  setQuestionnaireRows((rows) =>
                                    rows.map((r) => (r.id === row.id ? { ...r, code: e.target.value } : r)),
                                  )
                                }
                              />
                            ) : (
                              <div className={viewClass}>{row.code || '—'}</div>
                            )}
                          </td>
                          <td className="min-w-0 align-top px-2 py-1.5">
                            {isEdit ? (
                              <input
                                type="text"
                                className={inputClass}
                                value={row.name}
                                onChange={(e) =>
                                  setQuestionnaireRows((rows) =>
                                    rows.map((r) => (r.id === row.id ? { ...r, name: e.target.value } : r)),
                                  )
                                }
                              />
                            ) : (
                              <div className={viewClass}>{row.name || '—'}</div>
                            )}
                          </td>
                          {isEdit && (
                            <td className="w-10 align-top px-1 py-1.5 text-center">
                              <button
                                type="button"
                                className="rounded border border-red-300 bg-red-50 px-1.5 py-0.5 text-xs font-semibold text-red-800 hover:bg-red-100"
                                title="הסר שורה"
                                onClick={() =>
                                  setQuestionnaireRows((rows) => rows.filter((r) => r.id !== row.id))
                                }
                              >
                                ×
                              </button>
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeLowerTab === 'copy' && (
          <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            אין פעולות העתקה זמינות במסך זה.
          </div>
        )}

        {activeLowerTab === 'mailing' && (
          <div className="space-y-3" dir="rtl">
            <div className="rounded-lg border-2 border-blue-700 bg-white p-3 shadow-sm">
              <div className={sectionHeader}>פרטי דיוור</div>

              <p className="mb-3 mt-2 rounded border border-blue-200 bg-blue-50/80 px-2 py-2 text-right text-[11px] text-slate-800">
                הנתונים נשמרים עם &quot;שמור כרטיס לקוח&quot;.
              </p>

              <div className="space-y-3 border-t border-blue-100 pt-3">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                  <label className="w-full shrink-0 text-right text-xs font-semibold text-slate-800 sm:w-[9rem]">שדה שגוי</label>
                  <div className="min-w-0 flex-1 space-y-1">
                    <input
                      type="text"
                      className={cn(isEdit ? inputClass : viewClass, 'w-full')}
                      disabled={!isEdit}
                      value={mailingExtras.wrongField}
                      onChange={(e) => setMailingExtras((p) => ({ ...p, wrongField: e.target.value }))}
                      placeholder=""
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
                  <label className="w-full shrink-0 pt-1.5 text-right text-xs font-semibold text-slate-800 sm:w-[9rem]">כתובת</label>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    {isEdit ? (
                      <textarea
                        className={cn(inputConnected, 'min-h-[4.5rem] w-full resize-y')}
                        value={customerForm.address}
                        onChange={(e) => setCustomerForm((p) => ({ ...p, address: e.target.value }))}
                      />
                    ) : (
                      <div className={cn(viewClass, 'min-h-[4.5rem] whitespace-pre-wrap')}>{customerForm.address || '—'}</div>
                    )}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                    <label className="w-full shrink-0 text-right text-xs font-semibold text-slate-800 sm:w-[9rem]">עיר</label>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      {isEdit ? (
                        <input
                          type="text"
                          className={inputConnected}
                          value={customerForm.city}
                          onChange={(e) => setCustomerForm((p) => ({ ...p, city: e.target.value }))}
                        />
                      ) : (
                        <div className={viewClass}>{customerForm.city || '—'}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                    <label className="w-full shrink-0 text-right text-xs font-semibold text-slate-800 sm:w-[9rem]">מיקוד</label>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      {isEdit ? (
                        <input
                          type="text"
                          className={inputConnected}
                          value={customerForm.zipLegacy}
                          onChange={(e) => setCustomerForm((p) => ({ ...p, zipLegacy: e.target.value }))}
                        />
                      ) : (
                        <div className={viewClass}>{customerForm.zipLegacy || '—'}</div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                  <label className="w-full shrink-0 text-right text-xs font-semibold text-slate-800 sm:w-[9rem]">תא דואר</label>
                  <div className="min-w-0 flex-1 space-y-1">
                    {isEdit ? (
                      <input
                        type="text"
                        className={inputClass}
                        value={mailingExtras.poBox}
                        onChange={(e) => setMailingExtras((p) => ({ ...p, poBox: e.target.value }))}
                      />
                    ) : (
                      <div className={viewClass}>{mailingExtras.poBox || '—'}</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-2 border-t border-blue-100 pt-4">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                  {(
                    [
                      ['דיוור', 'prefMailing'],
                      ['פקסים', 'prefFax'],
                      ['דוא"ל', 'prefEmail'],
                      ['SMS', 'prefSms'],
                    ] as const
                  ).map(([label, key]) => (
                    <label
                      key={key}
                      className="flex cursor-pointer items-center gap-2 text-right text-sm font-medium text-slate-800"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 rounded border-slate-400 accent-blue-700"
                        disabled={!isEdit}
                        checked={mailingExtras[key]}
                        onChange={(e) => setMailingExtras((p) => ({ ...p, [key]: e.target.checked }))}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="mt-4 space-y-2 border-t border-blue-100 pt-4">
                <label className="mb-1 block text-right text-xs font-semibold text-slate-800">
                  הערה / טקסט חופשי
                </label>
                {isEdit ? (
                  <textarea
                    className={cn(inputClass, 'min-h-[6rem] w-full resize-y')}
                    value={mailingExtras.mailingNote}
                    onChange={(e) => setMailingExtras((p) => ({ ...p, mailingNote: e.target.value }))}
                  />
                ) : (
                  <div className={cn(viewClass, 'min-h-[6rem] whitespace-pre-wrap')}>{mailingExtras.mailingNote || '—'}</div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeLowerTab === 'notes' && (
          <div className="space-y-3" dir="rtl">
            <div className="rounded-lg border-2 border-blue-700 bg-white p-3 shadow-sm">
              <div className={sectionHeader}>הערות</div>

              <p className="mb-3 mt-2 rounded border border-blue-200 bg-blue-50/80 px-2 py-2 text-right text-[11px] text-slate-800">
                התוכן נשמר עם &quot;שמור כרטיס לקוח&quot;.
              </p>

              <div className="space-y-4 border-t border-blue-100 pt-3">
                <div>
                  <label className="mb-1 block text-right text-xs font-semibold text-slate-800">תאריך רישום</label>
                  {isEdit ? (
                    <input
                      type="date"
                      className={cn(inputClass, 'max-w-[11rem]')}
                      dir="ltr"
                      value={notesTabExtras.registrationDate}
                      onChange={(e) => setNotesTabExtras((p) => ({ ...p, registrationDate: e.target.value }))}
                    />
                  ) : (
                    <div className={cn(viewClass, 'max-w-[11rem]')} dir="ltr">
                      {notesTabExtras.registrationDate || '—'}
                    </div>
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-right text-xs font-semibold text-slate-800">
                    הערה ראשית / טקסט חופשי גדול
                  </label>
                  {isEdit ? (
                    <textarea
                      className={cn(inputConnected, 'min-h-[8rem] w-full resize-y')}
                      value={customerForm.notes}
                      onChange={(e) => setCustomerForm((p) => ({ ...p, notes: e.target.value }))}
                    />
                  ) : (
                    <div className={cn(viewClass, 'min-h-[8rem] whitespace-pre-wrap')}>{customerForm.notes || '—'}</div>
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-right text-xs font-semibold text-slate-800">עדכון אחרון</label>
                  {isEdit ? (
                    <input
                      type="date"
                      className={cn(inputClass, 'max-w-[11rem]')}
                      dir="ltr"
                      value={notesTabExtras.lastUpdateDate}
                      onChange={(e) => setNotesTabExtras((p) => ({ ...p, lastUpdateDate: e.target.value }))}
                    />
                  ) : (
                    <div className={cn(viewClass, 'max-w-[11rem]')} dir="ltr">
                      {notesTabExtras.lastUpdateDate || '—'}
                    </div>
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-right text-xs font-semibold text-slate-800">
                    הערת עדכון אחרון / טקסט חופשי גדול
                  </label>
                  {isEdit ? (
                    <textarea
                      className={cn(inputConnected, 'min-h-[8rem] w-full resize-y')}
                      value={customerForm.internalNotes}
                      onChange={(e) => setCustomerForm((p) => ({ ...p, internalNotes: e.target.value }))}
                    />
                  ) : (
                    <div className={cn(viewClass, 'min-h-[8rem] whitespace-pre-wrap')}>
                      {customerForm.internalNotes || '—'}
                    </div>
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-right text-xs font-semibold text-slate-800">משתמש אחרון</label>
                  {isEdit ? (
                    <input
                      type="text"
                      className={inputClass}
                      value={notesTabExtras.lastUser}
                      onChange={(e) => setNotesTabExtras((p) => ({ ...p, lastUser: e.target.value }))}
                    />
                  ) : (
                    <div className={viewClass}>{notesTabExtras.lastUser || '—'}</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeLowerTab === 'relations' && (
          <div className="space-y-2" dir="rtl">
            <div className="rounded-lg border-2 border-blue-700 bg-white p-2 shadow-sm">
              <p className="mb-2 rounded border border-blue-200 bg-blue-50/80 px-2 py-2 text-right text-[11px] text-slate-800">
                נשמר עם &quot;שמור כרטיס לקוח&quot;. ניתן להזין שם לקוח וסוג קשר ידנית.
              </p>

              <div className="grid gap-2 lg:grid-cols-[1fr_auto]">
                <div className="overflow-x-auto rounded border-2 border-slate-200 bg-white">
                  <table className="w-full min-w-[20rem] border-collapse text-sm" dir="rtl">
                    <thead className="border-b-2 border-blue-800 bg-blue-800 text-white">
                      <tr className="text-right text-xs font-semibold">
                        <th className="border-b border-blue-900 px-2 py-2.5">שם לקוח</th>
                        <th className="border-b border-blue-900 px-2 py-2.5">סוג קשר</th>
                        {isEdit && (
                          <th className="w-10 border-b border-blue-900 px-1 py-2.5 text-center" aria-label="הסר שורה" />
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {relationRows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={isEdit ? 3 : 2}
                            className="px-2 py-8 text-center text-sm text-slate-500"
                          >
                            אין רשומות
                          </td>
                        </tr>
                      ) : (
                        relationRows.map((row) => (
                          <tr key={row.id} className="border-b border-slate-100 text-right hover:bg-slate-50/90">
                            <td className="min-w-[10rem] px-2 py-1.5">
                              {isEdit ? (
                                <input
                                  type="text"
                                  className={inputClass}
                                  value={row.customerName}
                                  onChange={(e) =>
                                    setRelationRows((rows) =>
                                      rows.map((r) => (r.id === row.id ? { ...r, customerName: e.target.value } : r)),
                                    )
                                  }
                                />
                              ) : (
                                <div className={viewClass}>{row.customerName || '—'}</div>
                              )}
                            </td>
                            <td className="min-w-[8rem] px-2 py-1.5">
                              {isEdit ? (
                                <input
                                  type="text"
                                  className={inputClass}
                                  value={row.relationType}
                                  onChange={(e) =>
                                    setRelationRows((rows) =>
                                      rows.map((r) => (r.id === row.id ? { ...r, relationType: e.target.value } : r)),
                                    )
                                  }
                                />
                              ) : (
                                <div className={viewClass}>{row.relationType || '—'}</div>
                              )}
                            </td>
                            {isEdit && (
                              <td className="w-10 px-1 py-1.5 text-center align-middle">
                                <button
                                  type="button"
                                  className="rounded border border-red-300 bg-red-50 px-1.5 py-0.5 text-xs font-semibold text-red-800 hover:bg-red-100"
                                  title="הסר שורה"
                                  onClick={() => setRelationRows((rows) => rows.filter((r) => r.id !== row.id))}
                                >
                                  ×
                                </button>
                              </td>
                            )}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex min-w-[3.25rem] flex-col gap-2 rounded border border-slate-300 bg-slate-50 p-2 lg:min-w-[3.5rem]">
                  <button
                    type="button"
                    title="הוספת שורה"
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center self-center rounded border border-green-700 bg-green-600 text-lg font-bold leading-none text-white shadow-sm transition hover:bg-green-700',
                      !isEdit && 'cursor-not-allowed opacity-40',
                    )}
                    disabled={!isEdit}
                    onClick={() => isEdit && setRelationRows((rows) => [...rows, newRelationRow()])}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeLowerTab === 'documents' && (
          <div className="space-y-2" dir="rtl">
            <div className="rounded-lg border-2 border-blue-700 bg-white p-2 shadow-sm">
              <p className="mb-2 rounded border border-blue-200 bg-blue-50/80 px-2 py-2 text-right text-[11px] text-slate-800">
                מסמכים קיימים (מזהה UUID) מתעדכנים בשמירת הכרטיס. להעלאת קובץ חדש יש להשתמש בזרימת העלאה בשרת.
              </p>

              <div className="grid gap-2 lg:grid-cols-[1fr_auto]">
                <div className="overflow-x-auto rounded border-2 border-slate-200 bg-white">
                  <table className="w-full min-w-[48rem] border-collapse text-sm" dir="rtl">
                    <thead className="border-b-2 border-blue-800 bg-blue-800 text-white">
                      <tr className="text-right text-xs font-semibold">
                        <th className="border-b border-blue-900 px-2 py-2.5">שם קובץ</th>
                        <th className="border-b border-blue-900 px-2 py-2.5 whitespace-nowrap">משתמש</th>
                        <th className="border-b border-blue-900 px-2 py-2.5 whitespace-nowrap">תאריך</th>
                        <th className="border-b border-blue-900 px-2 py-2.5">סוג מסמך</th>
                        <th className="min-w-[12rem] border-b border-blue-900 px-2 py-2.5">תיאור המסמך</th>
                        {isEdit && (
                          <th className="w-10 border-b border-blue-900 px-1 py-2.5 text-center" aria-label="הסר" />
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {documentRows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={isEdit ? 6 : 5}
                            className="px-2 py-8 text-center text-sm text-slate-500"
                          >
                            אין מסמכים
                          </td>
                        </tr>
                      ) : (
                        documentRows.map((row) => (
                          <tr
                            key={row.id}
                            className={cn(
                              'border-b border-slate-100 text-right hover:bg-slate-50/90',
                              isEdit && 'cursor-pointer',
                              selectedDocumentId === row.id && isEdit && 'bg-blue-50/60',
                            )}
                            onClick={() => isEdit && setSelectedDocumentId(row.id)}
                          >
                            <td className="max-w-[14rem] px-2 py-1.5 align-top">
                              <div className="space-y-1">
                                {isEdit ? (
                                  <input
                                    type="text"
                                    className={inputClass}
                                    value={row.fileName}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) =>
                                      setDocumentRows((rows) =>
                                        rows.map((r) => (r.id === row.id ? { ...r, fileName: e.target.value } : r)),
                                      )
                                    }
                                  />
                                ) : (
                                  <div className={viewClass}>{row.fileName || '—'}</div>
                                )}
                                {isEdit && (
                                  <>
                                    <label className="block text-[10px] text-slate-600">
                                      בחירת קובץ מקומית מעדכנת את שם הקובץ לשמירה (מטא־דאטה בלבד).
                                    </label>
                                    <input
                                      type="file"
                                      className="w-full max-w-full text-xs file:mr-2 file:rounded file:border file:border-slate-300 file:bg-slate-50 file:px-2 file:py-1"
                                      onClick={(e) => e.stopPropagation()}
                                      onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        if (!f) return;
                                        setDocumentRows((rows) =>
                                          rows.map((r) =>
                                            r.id === row.id ? { ...r, fileName: f.name || r.fileName } : r,
                                          ),
                                        );
                                      }}
                                    />
                                  </>
                                )}
                              </div>
                            </td>
                            <td className="w-[7rem] px-2 py-1.5 align-top">
                              <div className={viewClass}>{row.userName || '—'}</div>
                            </td>
                            <td className="w-[7.5rem] px-2 py-1.5 align-top">
                              {isEdit ? (
                                <input
                                  type="date"
                                  className={cn(inputClass, 'text-right')}
                                  dir="ltr"
                                  value={row.dateStr}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) =>
                                    setDocumentRows((rows) =>
                                      rows.map((r) => (r.id === row.id ? { ...r, dateStr: e.target.value } : r)),
                                    )
                                  }
                                />
                              ) : (
                                <div className={cn(viewClass, 'whitespace-nowrap')} dir="ltr">
                                  {row.dateStr
                                    ? formatLegacyDate(
                                        row.dateStr.includes('T') ? row.dateStr : `${row.dateStr}T12:00:00`,
                                      )
                                    : '—'}
                                </div>
                              )}
                            </td>
                            <td className="w-[8rem] px-2 py-1.5 align-top">
                              {isEdit ? (
                                <input
                                  type="text"
                                  className={inputClass}
                                  value={row.docType}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) =>
                                    setDocumentRows((rows) =>
                                      rows.map((r) => (r.id === row.id ? { ...r, docType: e.target.value } : r)),
                                    )
                                  }
                                />
                              ) : (
                                <div className={viewClass}>{row.docType || '—'}</div>
                              )}
                            </td>
                            <td className="min-w-[10rem] px-2 py-1.5 align-top">
                              {isEdit ? (
                                <textarea
                                  className={cn(inputClass, 'min-h-[3.5rem] resize-y')}
                                  value={row.description}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) =>
                                    setDocumentRows((rows) =>
                                      rows.map((r) => (r.id === row.id ? { ...r, description: e.target.value } : r)),
                                    )
                                  }
                                />
                              ) : (
                                <div className={cn(viewClass, 'min-h-[3rem] whitespace-pre-wrap')}>
                                  {row.description || '—'}
                                </div>
                              )}
                            </td>
                            {isEdit && (
                              <td className="w-10 px-1 py-1.5 text-center align-top">
                                <button
                                  type="button"
                                  className="rounded border border-red-300 bg-red-50 px-1.5 py-0.5 text-xs font-semibold text-red-800 hover:bg-red-100"
                                  title="הסר שורה"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDocumentRows((rows) => rows.filter((r) => r.id !== row.id));
                                    setSelectedDocumentId((id) => (id === row.id ? null : id));
                                  }}
                                >
                                  ×
                                </button>
                              </td>
                            )}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex min-w-[11rem] flex-col gap-2 rounded border border-slate-300 bg-slate-50 p-2">
                  <button
                    type="button"
                    title="הוספת מסמך"
                    className={cn(
                      'mx-auto flex h-9 w-9 items-center justify-center rounded border border-green-700 bg-green-600 text-lg font-bold leading-none text-white shadow-sm transition hover:bg-green-700',
                      !isEdit && 'cursor-not-allowed opacity-40',
                    )}
                    disabled={!isEdit}
                    onClick={() => {
                      const n = newDocumentTabRow();
                      setDocumentRows((rows) => [...rows, n]);
                      setSelectedDocumentId(n.id);
                    }}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    className="rounded border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-100 disabled:opacity-40"
                    disabled={
                      !isEdit ||
                      !selectedDocumentId ||
                      !documentRows.find((r) => r.id === selectedDocumentId)?.filePath
                    }
                    onClick={() => {
                      const row = documentRows.find((r) => r.id === selectedDocumentId);
                      const p = row?.filePath?.trim();
                      if (!p) return;
                      if (p.startsWith('http://') || p.startsWith('https://') || p.startsWith('/')) {
                        window.open(p, '_blank', 'noopener,noreferrer');
                      }
                    }}
                  >
                    פתיחה
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeLowerTab === 'producedReports' && (
          <div className="space-y-3" dir="rtl">
            <div className="text-lg font-bold text-black">דוחות שהופקו</div>
            <ProducedReportsSection customerId={customer?.id ?? null} currentUser={currentUser} />
          </div>
        )}

        {activeLowerTab === 'signedQuotes' && (
          <div className="space-y-3" dir="rtl">
            <div className="text-lg font-bold text-black">הצעות מחיר חתומות</div>
            <SignedQuotesSection customerId={customer?.id ?? null} currentUser={currentUser} />
          </div>
        )}

        {activeLowerTab === 'quotes' && (
          <div className="space-y-3" dir="rtl">
            <div className="text-lg font-bold text-black">הצעות מחיר</div>
            {isNewMode || customer.id === '__new__' ? (
              <p className="text-sm text-[#5E7186]">שמירת הלקוח נדרשת לפני שיוך הצעות מחיר.</p>
            ) : customerQuotesLoading ? (
              <p className="text-sm text-[#5E7186]">טוען…</p>
            ) : customerQuotesError ? (
              <p className="text-sm text-red-600">{customerQuotesError}</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-[#D9E4EF] bg-white shadow-sm">
                <table className="w-full min-w-[44rem] border-collapse text-sm">
                  <thead className="border-b border-[#DCE7F2] bg-[#F0F6FB] text-right text-xs font-semibold text-black">
                    <tr>
                      <th className="px-3 py-2.5 whitespace-nowrap">מספר הצעה</th>
                      <th className="px-3 py-2.5 whitespace-nowrap">תאריך הצעה</th>
                      <th className="px-3 py-2.5 whitespace-nowrap">סטטוס</th>
                      <th className="px-3 py-2.5 whitespace-nowrap">סכום כולל</th>
                      <th className="px-3 py-2.5 whitespace-nowrap">תוקף הצעה</th>
                      <th className="px-3 py-2.5 whitespace-nowrap">מסמך</th>
                      <th className="px-3 py-2.5 whitespace-nowrap">פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerQuotes.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                          אין הצעות מחיר ללקוח זה
                        </td>
                      </tr>
                    ) : (
                      customerQuotes.map((row) => {
                        const quoteWhen = row.quoteDate || row.createdAt;
                        const quoteWhenDisp = quoteWhen
                          ? (Number.isNaN(new Date(quoteWhen).getTime())
                              ? String(quoteWhen)
                              : new Date(quoteWhen).toLocaleDateString('he-IL'))
                          : '—';
                        const validWhen = row.validityDate || row.validTo;
                        const validDisp = validWhen
                          ? (Number.isNaN(new Date(validWhen).getTime())
                              ? String(validWhen)
                              : new Date(validWhen).toLocaleDateString('he-IL'))
                          : '—';
                        const totalNum = row.totalAmount ?? row.amount ?? 0;
                        const totalDisp =
                          totalNum != null && Number.isFinite(Number(totalNum))
                            ? `${Number(totalNum).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₪`
                            : '—';
                        return (
                          <tr key={row.id} className="border-b border-slate-100 text-right hover:bg-slate-50/80">
                            <td className="px-3 py-2 whitespace-nowrap">{row.quoteNumber || row.id.slice(0, 8)}</td>
                            <td className="px-3 py-2 whitespace-nowrap">{quoteWhenDisp}</td>
                            <td className="px-3 py-2 whitespace-nowrap">{row.status || '—'}</td>
                            <td className="px-3 py-2 whitespace-nowrap">{totalDisp}</td>
                            <td className="px-3 py-2 whitespace-nowrap">{validDisp}</td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {(row.latestDocFileName || row.lastMergedDocPath) ? (
                                <div className="flex flex-col items-end gap-0.5">
                                  <button
                                    type="button"
                                    className="rounded-md border border-green-200 bg-green-50 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-100"
                                    onClick={async () => {
                                      try {
                                        const r = await apiFetch(apiUrl(`/quotes/${row.id}/merged-doc`), { authUser: currentUser });
                                        if (!r.ok) { alert('המסמך לא נמצא'); return; }
                                        const blob = await r.blob();
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement('a');
                                        a.href = url;
                                        a.download = row.latestDocFileName || `הצעה_${row.quoteNumber || row.id.slice(0,8)}.docx`;
                                        document.body.appendChild(a);
                                        a.click();
                                        document.body.removeChild(a);
                                        setTimeout(() => URL.revokeObjectURL(url), 5000);
                                      } catch { alert('שגיאה בהורדת המסמך'); }
                                    }}
                                  >
                                    פתח מסמך
                                  </button>
                                  {row.latestDocAt && !Number.isNaN(new Date(row.latestDocAt).getTime()) && (
                                    <span className="text-[10px] text-slate-400" title="עודכן לאחרונה">
                                      עודכן {new Date(row.latestDocAt).toLocaleDateString('he-IL')} {new Date(row.latestDocAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-slate-400">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              <div className="flex flex-wrap justify-end gap-1.5">
                                {onOpenQuote && (
                                  <button
                                    type="button"
                                    className="rounded-md border border-[#C5D7EA] bg-white px-2 py-1 text-xs font-medium text-black hover:bg-[#F0F6FB]"
                                    onClick={() => onOpenQuote(row.id)}
                                  >
                                    צפייה
                                  </button>
                                )}
                                {onOpenQuote && (
                                  <button
                                    type="button"
                                    className="rounded-md border border-[#C5D7EA] bg-white px-2 py-1 text-xs font-medium text-black hover:bg-[#F0F6FB]"
                                    onClick={() => onOpenQuote(row.id)}
                                  >
                                    עריכה
                                  </button>
                                )}
                                {row.contactEmail && (
                                  <button
                                    type="button"
                                    className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
                                    onClick={async () => {
                                      try {
                                        const r = await apiFetch(apiUrl(`/quotes/${row.id}/send-email`), {
                                          method: 'POST',
                                          body: JSON.stringify({ email: row.contactEmail }),
                                          authUser: currentUser,
                                        });
                                        if (!r.ok) {
                                          const err = await r.json().catch(() => null);
                                          alert(err?.message || 'שגיאה בשליחת מייל');
                                          return;
                                        }
                                        alert(`מייל נשלח ל-${row.contactEmail}`);
                                      } catch (_e) {
                                        alert('שגיאה בשליחת מייל');
                                      }
                                    }}
                                  >
                                    מייל
                                  </button>
                                )}
                                {row.phoneSummary && (
                                  <button
                                    type="button"
                                    className="rounded-md border border-green-200 bg-green-50 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-100"
                                    onClick={() => {
                                      const ph = (row.phoneSummary || '').replace(/\D/g, '');
                                      const firstName = (row.customerName || '').trim().split(/\s+/)[0] || '';
                                      const quoteRef = row.quoteNumber || row.id.slice(0, 8);
                                      const msg =
                                        `${firstName ? `שלום ${firstName},` : 'שלום רב,'}\n` +
                                        `מצורפת הצעת המחיר (מס' ${quoteRef}) שהכנו עבורך ב"גלית – החברה לאיכות הסביבה".\n` +
                                        `ההצעה מרכזת את כל פרטי העבודה בצורה ברורה ושקופה.\n` +
                                        `נשמח שתעיין בה בנוחות, ואנחנו זמינים לכל שאלה או הבהרה.\n` +
                                        `אשמח לעמוד לרשותך לכל שאלה.`;
                                      window.open(whatsAppLink(ph, msg), '_blank');
                                    }}
                                  >
                                    וואטסאפ
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                                  onClick={() => void deleteCustomerQuote(row.id)}
                                >
                                  מחיקה
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeLowerTab === 'additionalData' && (
          <div className="space-y-2" dir="rtl">
            <div className="rounded-lg border-2 border-blue-700 bg-white p-2 shadow-sm">
              <p className="mb-2 rounded border border-blue-200 bg-blue-50/80 px-2 py-2 text-right text-[11px] font-semibold leading-snug text-slate-800">
                נטען מ־<span dir="ltr" className="font-mono text-[10px]">full.additionalDataRows</span> (או גיבוי
                additionalData). נשמר עם &quot;שמור כרטיס לקוח&quot; (PUT /customers/:id/additional-data-rows).
              </p>

              <div className="grid gap-2 lg:grid-cols-[1fr_auto]">
                <div className="overflow-x-auto rounded border-2 border-slate-200 bg-white">
                  <table className="w-full min-w-[40rem] border-collapse text-sm" dir="rtl">
                    <thead className="border-b-2 border-blue-800 bg-blue-800 text-white">
                      <tr className="text-right text-xs font-semibold">
                        <th className="border-b border-blue-900 px-2 py-2.5 whitespace-nowrap">מספר</th>
                        <th className="w-[4rem] border-b border-blue-900 px-2 py-2.5 text-center" dir="ltr">
                          D
                        </th>
                        <th className="border-b border-blue-900 px-2 py-2.5 whitespace-nowrap">תאריך</th>
                        <th className="min-w-[8rem] border-b border-blue-900 px-2 py-2.5">טקסט 2</th>
                        <th className="min-w-[8rem] border-b border-blue-900 px-2 py-2.5">טקסט 1</th>
                        {isEdit && (
                          <th className="w-10 border-b border-blue-900 px-1 py-2.5 text-center" aria-label="הסר" />
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {additionalDataRows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={isEdit ? 6 : 5}
                            className="px-2 py-8 text-center text-sm text-slate-500"
                          >
                            אין רשומות
                          </td>
                        </tr>
                      ) : (
                        additionalDataRows.map((row) => (
                          <tr key={row.id} className="border-b border-slate-100 text-right hover:bg-slate-50/90">
                            <td className="w-[6rem] px-2 py-1.5 align-top">
                              {isEdit ? (
                                <input
                                  type="text"
                                  className={inputClass}
                                  value={row.number}
                                  onChange={(e) =>
                                    setAdditionalDataRows((rows) =>
                                      rows.map((r) => (r.id === row.id ? { ...r, number: e.target.value } : r)),
                                    )
                                  }
                                />
                              ) : (
                                <div className={viewClass}>{row.number || '—'}</div>
                              )}
                            </td>
                            <td className="px-2 py-1.5 align-top" dir="ltr">
                              {isEdit ? (
                                <input
                                  type="text"
                                  className={cn(inputClass, 'text-center')}
                                  value={row.d}
                                  onChange={(e) =>
                                    setAdditionalDataRows((rows) =>
                                      rows.map((r) => (r.id === row.id ? { ...r, d: e.target.value } : r)),
                                    )
                                  }
                                />
                              ) : (
                                <div className={cn(viewClass, 'text-center')}>{row.d || '—'}</div>
                              )}
                            </td>
                            <td className="w-[7.5rem] px-2 py-1.5 align-top">
                              {isEdit ? (
                                <input
                                  type="date"
                                  className={cn(inputClass, 'text-right')}
                                  dir="ltr"
                                  value={row.dateStr}
                                  onChange={(e) =>
                                    setAdditionalDataRows((rows) =>
                                      rows.map((r) => (r.id === row.id ? { ...r, dateStr: e.target.value } : r)),
                                    )
                                  }
                                />
                              ) : (
                                <div className={cn(viewClass, 'whitespace-nowrap')} dir="ltr">
                                  {row.dateStr
                                    ? formatLegacyDate(
                                        row.dateStr.includes('T') ? row.dateStr : `${row.dateStr}T12:00:00`,
                                      )
                                    : '—'}
                                </div>
                              )}
                            </td>
                            <td className="min-w-[8rem] px-2 py-1.5 align-top">
                              {isEdit ? (
                                <input
                                  type="text"
                                  className={inputClass}
                                  value={row.text2}
                                  onChange={(e) =>
                                    setAdditionalDataRows((rows) =>
                                      rows.map((r) => (r.id === row.id ? { ...r, text2: e.target.value } : r)),
                                    )
                                  }
                                />
                              ) : (
                                <div className={viewClass}>{row.text2 || '—'}</div>
                              )}
                            </td>
                            <td className="min-w-[8rem] px-2 py-1.5 align-top">
                              {isEdit ? (
                                <input
                                  type="text"
                                  className={inputClass}
                                  value={row.text1}
                                  onChange={(e) =>
                                    setAdditionalDataRows((rows) =>
                                      rows.map((r) => (r.id === row.id ? { ...r, text1: e.target.value } : r)),
                                    )
                                  }
                                />
                              ) : (
                                <div className={viewClass}>{row.text1 || '—'}</div>
                              )}
                            </td>
                            {isEdit && (
                              <td className="w-10 px-1 py-1.5 text-center align-top">
                                <button
                                  type="button"
                                  className="rounded border border-red-300 bg-red-50 px-1.5 py-0.5 text-xs font-semibold text-red-800 hover:bg-red-100"
                                  title="הסר שורה"
                                  onClick={() =>
                                    setAdditionalDataRows((rows) => rows.filter((r) => r.id !== row.id))
                                  }
                                >
                                  ×
                                </button>
                              </td>
                            )}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex min-w-[3.25rem] flex-col gap-2 rounded border border-slate-300 bg-slate-50 p-2 lg:min-w-[3.5rem]">
                  <button
                    type="button"
                    title="הוספת שורה"
                    className={cn(
                      'mx-auto flex h-9 w-9 items-center justify-center rounded border border-green-700 bg-green-600 text-lg font-bold leading-none text-white shadow-sm transition hover:bg-green-700',
                      !isEdit && 'cursor-not-allowed opacity-40',
                    )}
                    disabled={!isEdit}
                    onClick={() => isEdit && setAdditionalDataRows((rows) => [...rows, newAdditionalDataRow()])}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeLowerTab === 'moreDetails' && (
          <div className="space-y-2" dir="rtl">
            <div className="rounded-lg border-2 border-blue-700 bg-white p-3 shadow-sm">
              <div className={sectionHeader}>פרטים נוספים</div>
              <p className="mb-3 mt-2 rounded border border-blue-200 bg-blue-50/80 px-2 py-2 text-right text-[11px] text-slate-800">
                השדות נשמרים עם כפתור &quot;שמור כרטיס לקוח&quot;.
              </p>

              <div className="grid grid-cols-1 gap-x-10 gap-y-3 lg:grid-cols-2">
                <div className="space-y-3 border-b border-slate-200 pb-4 lg:border-b-0 lg:border-l lg:border-slate-200 lg:pb-0 lg:pl-6">
                  {MORE_DETAILS_RIGHT_FIELDS.map((f) => (
                    <div key={f.key} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                      <label className="w-full shrink-0 text-right text-xs font-semibold text-slate-800 sm:w-[8.5rem]">
                        {f.label}
                      </label>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        {isEdit ? (
                            f.kind === 'date' ? (
                            <input
                              type="date"
                              className={cn(inputConnected, 'text-right')}
                              dir="ltr"
                              value={moreDetailsForm[f.key]}
                              onChange={(e) =>
                                setMoreDetailsForm((p) => ({ ...p, [f.key]: e.target.value }))
                              }
                            />
                          ) : (
                            <input
                              type="text"
                              className={inputConnected}
                              value={moreDetailsForm[f.key]}
                              onChange={(e) =>
                                setMoreDetailsForm((p) => ({ ...p, [f.key]: e.target.value }))
                              }
                            />
                          )
                        ) : f.kind === 'date' ? (
                          <div className={cn(viewClass, 'whitespace-nowrap')} dir="ltr">
                            {moreDetailsForm[f.key]
                              ? formatLegacyDate(
                                  moreDetailsForm[f.key].includes('T')
                                    ? moreDetailsForm[f.key]
                                    : `${moreDetailsForm[f.key]}T12:00:00`,
                                )
                              : '—'}
                          </div>
                        ) : (
                          <div className={viewClass}>{moreDetailsForm[f.key] || '—'}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-3">
                  {MORE_DETAILS_LEFT_FIELDS.map((f) => (
                    <div key={f.key} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                      <label className="w-full shrink-0 text-right text-xs font-semibold text-slate-800 sm:w-[8.5rem]">
                        {f.label}
                      </label>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        {isEdit ? (
                          f.kind === 'date' ? (
                            <input
                              type="date"
                              className={cn(inputConnected, 'text-right')}
                              dir="ltr"
                              value={moreDetailsForm[f.key]}
                              onChange={(e) =>
                                setMoreDetailsForm((p) => ({ ...p, [f.key]: e.target.value }))
                              }
                            />
                          ) : (
                            <input
                              type="text"
                              className={inputConnected}
                              value={moreDetailsForm[f.key]}
                              onChange={(e) =>
                                setMoreDetailsForm((p) => ({ ...p, [f.key]: e.target.value }))
                              }
                            />
                          )
                        ) : f.kind === 'date' ? (
                          <div className={cn(viewClass, 'whitespace-nowrap')} dir="ltr">
                            {moreDetailsForm[f.key]
                              ? formatLegacyDate(
                                  moreDetailsForm[f.key].includes('T')
                                    ? moreDetailsForm[f.key]
                                    : `${moreDetailsForm[f.key]}T12:00:00`,
                                )
                              : '—'}
                          </div>
                        ) : (
                          <div className={viewClass}>{moreDetailsForm[f.key] || '—'}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeLowerTab === 'externalData' && (
          <div className="space-y-2" dir="rtl">
            <div className="rounded-lg border-2 border-blue-700 bg-white p-2 shadow-sm">
              <div className={sectionHeader}>נתונים חיצוניים</div>
              <p className="mb-2 mt-2 rounded border border-blue-200 bg-blue-50/80 px-2 py-2 text-right text-[11px] font-semibold leading-snug text-slate-800">
                נטען מ׳<span dir="ltr" className="font-mono text-[10px]">full.externalDataRows</span> (או גיבוי
                externalData). נשמר עם &quot;שמור כרטיס לקוח&quot; (PUT /customers/:id/external-data-rows).
              </p>
              {customer.importLegacyId ? (
                <p className="mb-2 text-right text-[10px] text-slate-600" dir="ltr">
                  importLegacyId: {customer.importLegacyId}
                </p>
              ) : null}

              <div className="grid gap-2 lg:grid-cols-[1fr_auto]">
                <div className="w-full min-w-0 overflow-x-auto rounded border-2 border-slate-200 bg-white">
                  <table className="w-full min-w-[56rem] table-fixed border-collapse text-sm" dir="rtl">
                    <thead className="border-b-2 border-blue-800 bg-blue-800 text-white">
                      <tr className="text-xs font-semibold">
                        {EXTERNAL_DATA_COLUMN_KEYS.map((col) => (
                          <th
                            key={col}
                            className="w-[9%] border-b border-blue-900 px-1 py-2 text-center"
                            dir="ltr"
                          >
                            {col}
                          </th>
                        ))}
                        {isEdit && (
                          <th className="w-10 border-b border-blue-900 px-1 py-2 text-center" aria-label="הסר" />
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {externalDataRows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={isEdit ? 11 : 10}
                            className="px-2 py-8 text-center text-sm text-slate-500"
                          >
                            אין שורות — לחץ + להוספה (מצב עריכה)
                          </td>
                        </tr>
                      ) : (
                        externalDataRows.map((row) => (
                          <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50/80">
                            {EXTERNAL_DATA_COLUMN_KEYS.map((col) => (
                              <td key={col} className="px-1 py-1 align-top">
                                {isEdit ? (
                                  <input
                                    type="text"
                                    className={cn(inputClass, 'w-full min-w-0 px-1.5 py-1 text-xs')}
                                    value={row[col]}
                                    onChange={(e) =>
                                      setExternalDataRows((rows) =>
                                        rows.map((r) =>
                                          r.id === row.id ? { ...r, [col]: e.target.value } : r,
                                        ),
                                      )
                                    }
                                  />
                                ) : (
                                  <div className={cn(viewClass, 'min-h-[1.85rem] truncate px-1.5 py-1 text-xs')}>
                                    {row[col] || ' '}
                                  </div>
                                )}
                              </td>
                            ))}
                            {isEdit && (
                              <td className="w-10 px-1 py-1 text-center align-top">
                                <button
                                  type="button"
                                  className="rounded border border-red-300 bg-red-50 px-1.5 py-0.5 text-xs font-semibold text-red-800 hover:bg-red-100"
                                  title="הסר שורה"
                                  onClick={() =>
                                    setExternalDataRows((rows) => rows.filter((r) => r.id !== row.id))
                                  }
                                >
                                  ×
                                </button>
                              </td>
                            )}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex min-w-[3.25rem] flex-col gap-2 rounded border border-slate-300 bg-slate-50 p-2 lg:min-w-[3.5rem]">
                  <button
                    type="button"
                    title="הוספת שורה"
                    className={cn(
                      'mx-auto flex h-9 w-9 items-center justify-center rounded border border-green-700 bg-green-600 text-lg font-bold leading-none text-white shadow-sm transition hover:bg-green-700',
                      !isEdit && 'cursor-not-allowed opacity-40',
                    )}
                    disabled={!isEdit}
                    onClick={() => isEdit && setExternalDataRows((rows) => [...rows, newExternalDataRow()])}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
      </div>{/* end padding wrapper */}
    </div>
  );
}
