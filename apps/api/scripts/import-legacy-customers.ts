/**
 * Legacy customer import — Excel (multi-sheet) or CSV (customers only).
 *
 * Sheets (Excel, names case-insensitive):
 *   Customer              — one row per customer (required)
 *   CustomerContact       — optional; link via customerImportLegacyId
 *   CustomerReferralSource
 *   CustomerQuestionnaire
 *   CustomerRelation
 *   CustomerAdditionalDataRow
 *   CustomerExternalDataRow
 *   Document              — optional; customerImportLegacyId + filePath + name
 *
 * Required on each Customer row: importLegacyId, name, type, contactName, phone, email, city
 *   (type must exist in CustomerClassification.code)
 *
 * Single-customer mode: --legacy-id <id>  (matches Customer.importLegacyId)
 * Batch mode: --batch                     (all rows in Customer sheet)
 *
 * CSV: only Customer-equivalent columns; no child sheets (use Excel for full import).
 *
 * Hebrew flat export (single sheet e.g. גיליון1):
 *   Columns match legacy Followup-style Hebrew headers; one row = one customer with inline
 *   contact + referral fields. No customerImportLegacyId column — children are synthesized.
 */

import 'dotenv/config';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import * as XLSX from 'xlsx';
import { PrismaClient, Prisma, DocumentType } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

type Row = Record<string, unknown>;

type Args = {
  dryRun: boolean;
  file: string;
  legacyId: string | null;
  customerId: string | null;
  batch: boolean;
};

function parseArgs(argv: string[]): Args | 'help' {
  let dryRun = false;
  let file = '';
  let legacyId: string | null = null;
  let customerId: string | null = null;
  let batch = false;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') return 'help';
    if (a === '--dry-run') dryRun = true;
    else if (a === '--batch') batch = true;
    else if (a === '--file' && argv[i + 1]) {
      file = argv[++i];
    } else if (a === '--legacy-id' && argv[i + 1]) {
      legacyId = String(argv[++i]).trim();
    } else if (a === '--customer-id' && argv[i + 1]) {
      customerId = String(argv[++i]).trim();
    }
  }
  return { dryRun, file, legacyId, customerId, batch };
}

function normHeader(h: string): string {
  return String(h ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/-/g, '_');
}

/** Read cell by canonical Hebrew column label (handles spacing / case on file headers). */
function getHebrewCell(raw: Row, label: string): unknown {
  const want = normHeader(label);
  for (const k of Object.keys(raw)) {
    if (normHeader(k) === want) return raw[k];
  }
  return null;
}

/**
 * Locate the header row (the row that actually contains "קוד לקוח") within the first
 * few rows of a sheet, then return the data rows keyed by that header. Handles exports
 * that carry a merged title banner in row 1 (real headers in row 2).
 * Returns null if no "קוד לקוח" header is found in the scanned window.
 */
function readHebrewFlatRows(sheet: XLSX.WorkSheet, scanRows = 5): Row[] | null {
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: false });
  if (!aoa.length) return null;
  let headerIdx = -1;
  for (let r = 0; r < Math.min(scanRows, aoa.length); r++) {
    const row = aoa[r] || [];
    if (row.some((c) => c != null && normHeader(String(c)) === normHeader('קוד לקוח'))) {
      headerIdx = r;
      break;
    }
  }
  if (headerIdx === -1) return null;
  const header = (aoa[headerIdx] || []).map((c) => String(c ?? '').trim());
  const out: Row[] = [];
  for (let r = headerIdx + 1; r < aoa.length; r++) {
    const raw = aoa[r] || [];
    if (raw.every((c) => c == null || c === '')) continue; // skip fully-empty rows
    const obj: Row = {};
    for (let c = 0; c < header.length; c++) {
      const key = header[c];
      if (!key) continue;
      obj[key] = raw[c] ?? null;
    }
    out.push(obj);
  }
  return out;
}

/** Workbook has no English Customer sheet but Hebrew "קוד לקוח" columns — flat export (banner-tolerant). */
function isHebrewFlatCustomerWorkbook(wb: XLSX.WorkBook, englishCustomerSheet: XLSX.WorkSheet | null): boolean {
  if (englishCustomerSheet) return false;
  const name = wb.SheetNames[0];
  if (!name) return false;
  return readHebrewFlatRows(wb.Sheets[name]) !== null;
}

/** Stable short hash for building deterministic per-contact legacy keys (idempotent re-runs). */
function shortHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return (h >>> 0).toString(36);
}

/** Map Hebrew flat row → canonical customer row + synthetic child rows (same file, no separate sheets). */
function expandHebrewFlatRow(raw: Row): {
  customerRow: Row;
  contactRows: Row[];
  referralRows: Row[];
} {
  const id = str(getHebrewCell(raw, 'קוד לקוח'));
  const name = str(getHebrewCell(raw, 'שם לקוח'));
  const typeLabel = str(getHebrewCell(raw, 'שם סוג לקוח'));
  const city = str(getHebrewCell(raw, 'שם עיר'));
  const mobile = str(getHebrewCell(raw, 'סלולארי'));
  const home = str(getHebrewCell(raw, 'בית'));
  const work = str(getHebrewCell(raw, 'עבודה'));
  const phones = [mobile, home, work].filter((p, i, a) => p && a.indexOf(p) === i);
  const phone = phones[0] || '-';
  const phone2 = phones[1];
  const phone3 = phones[2];
  const emailFromContact = str(getHebrewCell(raw, 'EMAIL איש קשר'));
  const email = emailFromContact || (id ? `import+${id}@legacy.import.local` : 'import@legacy.import.local');
  const contactPerson = str(getHebrewCell(raw, 'שם איש קשר'));
  const contactName = contactPerson || name || '-';

  const customerRow: Row = {
    importLegacyId: id,
    name,
    type: typeLabel,
    contactName,
    phone,
    email,
    city: city || '-',
    address: str(getHebrewCell(raw, 'כתובת לקוח')) ?? str(getHebrewCell(raw, 'כתובת')),
    zipLegacy: str(getHebrewCell(raw, 'מיקוד')),
    fax: str(getHebrewCell(raw, 'פקס')),
    companyRegNumber: str(getHebrewCell(raw, 'מספר ח.פ')),
    legacyAccountNumber: str(getHebrewCell(raw, 'מספר בהנהח')),
    salesRepresentative: str(getHebrewCell(raw, 'שם נציג מכירה')),
    legacySubClassificationCode: str(getHebrewCell(raw, 'שם סיווג')),
    managementProfile: str(getHebrewCell(raw, 'שם תת סיווג')),
    registrationDate: getHebrewCell(raw, 'תאריך הקמה'),
    birthdayLegacy: getHebrewCell(raw, 'תאריך לידה'),
    mailingAddress: str(getHebrewCell(raw, 'כתובת 1')),
    notes: str(getHebrewCell(raw, 'הערות כלליות')),
    internalNotes: str(getHebrewCell(raw, 'הערות משרדיות')),
    lastUpdateDate: getHebrewCell(raw, 'תאריך עדכון לקוח'),
    microwaveModel: str(getHebrewCell(raw, 'דגם מיקרוגל')),
    detectorModel: str(getHebrewCell(raw, 'דגם גלאי')),
    detectorLocation: str(getHebrewCell(raw, 'מיקום גלאי')),
    companyAmount: str(getHebrewCell(raw, 'מהות הדברה')),
    feature7: str(getHebrewCell(raw, 'חומר הדברה')),
    employeeCount: str(getHebrewCell(raw, 'מספר עובדים')),
    mailingPoBox: str(getHebrewCell(raw, 'תא דואר')),
    mailingZip: str(getHebrewCell(raw, 'מיקוד תא דואר')),
    mailingCity: str(getHebrewCell(raw, 'שם עיר תא דואר')),
    phone2,
    phone3,
  };

  const contactRows: Row[] = [];
  const cPhone = str(getHebrewCell(raw, 'טלפון איש קשר'));
  const cMobile = str(getHebrewCell(raw, 'פלאפון איש קשר'));
  const cFull = str(getHebrewCell(raw, 'שם איש קשר'));
  const cAddr = str(getHebrewCell(raw, 'כתובת איש קשר'));
  const cCity = str(getHebrewCell(raw, 'שם עיר איש קשר'));
  const cRole = str(getHebrewCell(raw, 'שם תפקיד')) ?? str(getHebrewCell(raw, 'תפקיד'));
  const cDept = str(getHebrewCell(raw, 'מחלקה'));
  const cTitle = str(getHebrewCell(raw, 'שם תואר'));
  const hasInlineContact =
    !!(cFull || cPhone || cMobile || emailFromContact || cAddr || cCity || cRole || cDept || cTitle);
  if (id && (hasInlineContact || name)) {
    const fullName = cFull || name || contactName;
    // Same קוד לקוח can span many rows (one contact each). Build a DETERMINISTIC per-contact
    // key from its identifying fields so every distinct contact survives and re-runs are idempotent
    // (upsert keyed on customerId+importLegacyId). Rows with identical contact data collapse to one.
    const sig = [fullName, cPhone || '', cMobile || '', emailFromContact || '', cRole || ''].join('|');
    const contactLegacyId = `${id}-c-${shortHash(sig)}`;
    contactRows.push({
      customerImportLegacyId: id,
      importLegacyId: contactLegacyId,
      fullName,
      phone: cPhone || '',
      mobile: cMobile || '',
      email: emailFromContact || '',
      address: cAddr || '',
      city: cCity || '',
      roleTitle: cRole || undefined,
      department: cDept || undefined,
      notes: cTitle || undefined,
    });
  }

  const referralRows: Row[] = [];
  const refDate = getHebrewCell(raw, 'תאריך מקור הגעה');
  const refName = str(getHebrewCell(raw, 'שם מקור הגעה'));
  if (id && (refName || (refDate != null && refDate !== ''))) {
    referralRows.push({
      customerImportLegacyId: id,
      importLegacyId: `${id}-ref-1`,
      date: refDate,
      sourceName: refName || undefined,
      rowOrder: 0,
    });
  }

  return { customerRow, contactRows, referralRows };
}

/** Map normalized header -> canonical Prisma / internal field name */
const HEADER_ALIASES: Record<string, string> = {
  importlegacyid: 'importLegacyId',
  legacy_id: 'importLegacyId',
  customerlegacyid: 'importLegacyId',
  customerimportlegacyid: 'customerImportLegacyId',
  customer_import_legacy_id: 'customerImportLegacyId',
  customerlegacyidref: 'customerImportLegacyId',
  legacyaccountnumber: 'legacyAccountNumber',
  legacysubclassificationcode: 'legacySubClassificationCode',
  salesrepresentative: 'salesRepresentative',
  functionallabel: 'functionalLabel',
  customersize: 'customerSize',
  managementprofile: 'managementProfile',
  countryorregion: 'countryOrRegion',
  mailingaddress: 'mailingAddress',
  mailingcity: 'mailingCity',
  mailingzip: 'mailingZip',
  mailingpobox: 'mailingPoBox',
  mailinginvalidfield: 'mailingInvalidField',
  allowmail: 'allowMail',
  allowfax: 'allowFax',
  allowemail: 'allowEmail',
  allowsms: 'allowSms',
  mailingnote: 'mailingNote',
  registrationdate: 'registrationDate',
  registrationnote: 'registrationNote',
  lastupdatedate: 'lastUpdateDate',
  lastupdatenote: 'lastUpdateNote',
  lastupdatedby: 'lastUpdatedBy',
  pricelist: 'priceList',
  roundedpricing: 'roundedPricing',
  employeecount: 'employeeCount',
  managementcustomerlabel: 'managementCustomerLabel',
  financialnumber1: 'financialNumber1',
  financialnumber2: 'financialNumber2',
  financialnumber2large: 'financialNumber2Large',
  financialnumber3: 'financialNumber3',
  financetoken: 'financeToken',
  financetokendate: 'financeTokenDate',
  financetokenactive: 'financeTokenActive',
  financeunnamed1: 'financeUnnamed1',
  financeunnamed2: 'financeUnnamed2',
  financeunnamed3: 'financeUnnamed3',
  financeunnamed4: 'financeUnnamed4',
  totalpurchases: 'totalPurchases',
  totalsales: 'totalSales',
  percentagevalue: 'percentageValue',
  paymentterms: 'paymentTerms',
  creditdays: 'creditDays',
  creditenabled: 'creditEnabled',
  creditnumber: 'creditNumber',
  creditexpiry: 'creditExpiry',
  microwavemodel: 'microwaveModel',
  detectorlocation: 'detectorLocation',
  companyamount: 'companyAmount',
  feature7: 'feature7',
  detaildate1: 'detailDate1',
  detaildate2: 'detailDate2',
  detaildate3: 'detailDate3',
  detaildate4: 'detailDate4',
  detectormodel: 'detectorModel',
  feature4: 'feature4',
  companywall: 'companyWall',
  feature8: 'feature8',
  companyregnumber: 'companyRegNumber',
  internalnotes: 'internalNotes',
  balancelegacy: 'balanceLegacy',
  birthdaylegacy: 'birthdayLegacy',
  citycodelegacy: 'cityCodeLegacy',
  ziplegacy: 'zipLegacy',
  legacyupdatedat: 'legacyUpdatedAt',
  contactname: 'contactName',
  phon2: 'phone2',
  fullname: 'fullName',
  roletitle: 'roleTitle',
  questionnairecode: 'questionnaireCode',
  questionnairename: 'questionnaireName',
  relatedcustomername: 'relatedCustomerName',
  relationtype: 'relationType',
  numbervalue: 'numberValue',
  dvalue: 'dValue',
  datevalue: 'dateValue',
  text1: 'text1',
  text2: 'text2',
  roworder: 'rowOrder',
  documenttype: 'documentType',
  documentdate: 'documentDate',
  filepath: 'filePath',
  sizebytes: 'sizeBytes',
};

function normalizeRow(row: Row): Row {
  const m: Row = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === undefined || k === '') continue;
    const nk = normHeader(String(k));
    const field = HEADER_ALIASES[nk] ?? nk.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    m[field] = v;
  }
  return m;
}

function str(v: unknown): string | null {
  if (v == null || v === '') return null;
  return String(v).trim();
}

function strReq(v: unknown, field: string): string {
  const s = str(v);
  if (!s) throw new Error(`missing ${field}`);
  return s;
}

function parseBool(v: unknown): boolean | null {
  if (v == null || v === '') return null;
  if (typeof v === 'boolean') return v;
  const s = String(v).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'כן', 'v'].includes(s)) return true;
  if (['0', 'false', 'no', 'n', 'לא'].includes(s)) return false;
  return null;
}

function parseDate(v: unknown): Date | null {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v;
  if (typeof v === 'number' && !isNaN(v)) {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return new Date(Date.UTC(d.y, d.m - 1, d.d));
  }
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}

function parseDecimal(v: unknown): Prisma.Decimal | null {
  const s = str(v);
  if (!s) return null;
  try {
    return new Prisma.Decimal(s);
  } catch {
    return null;
  }
}

function parseServices(v: unknown): string[] {
  if (v == null || v === '') return [];
  if (Array.isArray(v)) return v.map(String);
  const s = String(v).trim();
  if (s.startsWith('[')) {
    try {
      const j = JSON.parse(s) as unknown;
      return Array.isArray(j) ? j.map(String) : [];
    } catch {
      return [];
    }
  }
  return s.split(/[,;|]/).map((x) => x.trim()).filter(Boolean);
}

function parseDocumentType(v: unknown): DocumentType {
  const s = (str(v) || 'OTHER').toUpperCase();
  if (s in DocumentType) return DocumentType[s as keyof typeof DocumentType];
  return DocumentType.OTHER;
}

const SHEETS = {
  customer: ['customer', 'customers', 'לקוח'],
  contact: ['customercontact', 'contacts', 'אנשיקשר'],
  referral: ['customerreferralsource', 'referralsources', 'מקורהגעה'],
  questionnaire: ['customerquestionnaire', 'questionnaires', 'שאלונים'],
  relation: ['customerrelation', 'relations', 'קשרים'],
  additional: ['customeradditionaldatarow', 'additionaldata', 'נתוניםנוספים'],
  external: ['customerexternaldatarow', 'externaldata', 'נתוניםחיצוניים'],
  document: ['document', 'documents', 'מסמכים'],
} as const;

function findSheet(workbook: XLSX.WorkBook, keys: readonly string[]): XLSX.WorkSheet | null {
  const names = workbook.SheetNames;
  const lower = new Map(names.map((n) => [normHeader(n).replace(/_/g, ''), n]));
  for (const k of keys) {
    const nk = k.replace(/_/g, '');
    for (const [ln, orig] of lower) {
      if (ln.replace(/_/g, '') === nk || ln.includes(nk)) {
        return workbook.Sheets[orig];
      }
    }
  }
  for (const k of keys) {
    const exact = names.find((n) => normHeader(n) === normHeader(k));
    if (exact) return workbook.Sheets[exact];
  }
  return null;
}

function sheetToRows(sheet: XLSX.WorkSheet): Row[] {
  return XLSX.utils.sheet_to_json<Row>(sheet, { defval: null, raw: false });
}

function getCustomerLink(r: Row): string | null {
  const n = normalizeRow(r);
  return str(n.customerImportLegacyId);
}

type LogLevel = 'info' | 'warn' | 'error';

function log(level: LogLevel, msg: string) {
  const p = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  p(`[import-legacy-customers] ${msg}`);
}

type Summary = {
  customersProcessed: number;
  customersSkipped: number;
  customersCreated: number;
  customersUpdated: number;
  contactsUpserted: number;
  referralsUpserted: number;
  questionnairesUpserted: number;
  relationsUpserted: number;
  additionalUpserted: number;
  externalUpserted: number;
  documentsUpserted: number;
  errors: string[];
};

function emptySummary(): Summary {
  return {
    customersProcessed: 0,
    customersSkipped: 0,
    customersCreated: 0,
    customersUpdated: 0,
    contactsUpserted: 0,
    referralsUpserted: 0,
    questionnairesUpserted: 0,
    relationsUpserted: 0,
    additionalUpserted: 0,
    externalUpserted: 0,
    documentsUpserted: 0,
    errors: [],
  };
}

/** Build Prisma Customer create/update data from normalized row (only known scalar fields). */
function customerDataFromRow(r: Row): Prisma.CustomerCreateInput {
  const n = normalizeRow(r);
  const services = parseServices(n.services);

  const data: Prisma.CustomerCreateInput = {
    importLegacyId: strReq(n.importLegacyId, 'importLegacyId'),
    name: strReq(n.name, 'name'),
    type: strReq(n.type, 'type'),
    contactName: strReq(n.contactName, 'contactName'),
    phone: strReq(n.phone, 'phone'),
    email: strReq(n.email, 'email'),
    city: strReq(n.city, 'city'),
    services,
    address: str(n.address) ?? undefined,
    status: str(n.status) || 'ACTIVE',
    notes: str(n.notes) ?? undefined,
    phone2: str(n.phone2) ?? undefined,
    phone3: str(n.phone3) ?? undefined,
    fax: str(n.fax) ?? undefined,
    website: str(n.website) ?? undefined,
    companyRegNumber: str(n.companyRegNumber) ?? undefined,
    internalNotes: str(n.internalNotes) ?? undefined,
    balanceLegacy: parseDecimal(n.balanceLegacy) ?? undefined,
    birthdayLegacy: parseDate(n.birthdayLegacy) ?? undefined,
    cityCodeLegacy: str(n.cityCodeLegacy) ?? undefined,
    zipLegacy: str(n.zipLegacy) ?? undefined,
    legacyUpdatedAt: parseDate(n.legacyUpdatedAt) ?? undefined,
    legacyAccountNumber: str(n.legacyAccountNumber) ?? undefined,
    legacySubClassificationCode: str(n.legacySubClassificationCode) ?? undefined,
    salesRepresentative: str(n.salesRepresentative) ?? undefined,
    functionalLabel: str(n.functionalLabel) ?? undefined,
    customerSize: str(n.customerSize) ?? undefined,
    managementProfile: str(n.managementProfile) ?? undefined,
    countryOrRegion: str(n.countryOrRegion) ?? undefined,
    mailingAddress: str(n.mailingAddress) ?? undefined,
    mailingCity: str(n.mailingCity) ?? undefined,
    mailingZip: str(n.mailingZip) ?? undefined,
    mailingPoBox: str(n.mailingPoBox) ?? undefined,
    mailingInvalidField: str(n.mailingInvalidField) ?? undefined,
    allowMail: parseBool(n.allowMail) ?? undefined,
    allowFax: parseBool(n.allowFax) ?? undefined,
    allowEmail: parseBool(n.allowEmail) ?? undefined,
    allowSms: parseBool(n.allowSms) ?? undefined,
    mailingNote: str(n.mailingNote) ?? undefined,
    registrationDate: parseDate(n.registrationDate) ?? undefined,
    registrationNote: str(n.registrationNote) ?? undefined,
    lastUpdateDate: parseDate(n.lastUpdateDate) ?? undefined,
    lastUpdateNote: str(n.lastUpdateNote) ?? undefined,
    lastUpdatedBy: str(n.lastUpdatedBy) ?? undefined,
    priceList: str(n.priceList) ?? undefined,
    roundedPricing: str(n.roundedPricing) ?? undefined,
    employeeCount: str(n.employeeCount) ?? undefined,
    managementCustomerLabel: str(n.managementCustomerLabel) ?? undefined,
    financialNumber1: str(n.financialNumber1) ?? undefined,
    financialNumber2: str(n.financialNumber2) ?? undefined,
    financialNumber2Large: str(n.financialNumber2Large) ?? undefined,
    financialNumber3: str(n.financialNumber3) ?? undefined,
    financeToken: str(n.financeToken) ?? undefined,
    financeTokenDate: parseDate(n.financeTokenDate) ?? undefined,
    financeTokenActive: parseBool(n.financeTokenActive) ?? undefined,
    financeUnnamed1: str(n.financeUnnamed1) ?? undefined,
    financeUnnamed2: str(n.financeUnnamed2) ?? undefined,
    financeUnnamed3: str(n.financeUnnamed3) ?? undefined,
    financeUnnamed4: str(n.financeUnnamed4) ?? undefined,
    totalPurchases: parseDecimal(n.totalPurchases) ?? undefined,
    totalSales: parseDecimal(n.totalSales) ?? undefined,
    percentageValue: parseDecimal(n.percentageValue) ?? undefined,
    paymentTerms: str(n.paymentTerms) ?? undefined,
    creditDays: str(n.creditDays) ?? undefined,
    creditEnabled: parseBool(n.creditEnabled) ?? undefined,
    creditNumber: str(n.creditNumber) ?? undefined,
    creditExpiry: str(n.creditExpiry) ?? undefined,
    microwaveModel: str(n.microwaveModel) ?? undefined,
    detectorLocation: str(n.detectorLocation) ?? undefined,
    companyAmount: str(n.companyAmount) ?? undefined,
    feature7: str(n.feature7) ?? undefined,
    detailDate1: parseDate(n.detailDate1) ?? undefined,
    detailDate2: parseDate(n.detailDate2) ?? undefined,
    detailDate3: parseDate(n.detailDate3) ?? undefined,
    detailDate4: parseDate(n.detailDate4) ?? undefined,
    detectorModel: str(n.detectorModel) ?? undefined,
    feature4: str(n.feature4) ?? undefined,
    companyWall: str(n.companyWall) ?? undefined,
    feature8: str(n.feature8) ?? undefined,
  };

  return data;
}

/** Standard classifications this import guarantees exist (code → Hebrew label). */
const STANDARD_CLASSIFICATIONS: { code: string; labelHe: string; sortOrder: number }[] = [
  { code: 'COMPANY', labelHe: 'חברה / קבלן', sortOrder: 0 },
  { code: 'PUBLIC', labelHe: 'רשות / מוסד', sortOrder: 1 },
  { code: 'PRIVATE', labelHe: 'לקוח פרטי', sortOrder: 2 },
  { code: 'SUPPLIER', labelHe: 'ספק', sortOrder: 3 },
  { code: 'POTENTIAL', labelHe: 'פוטנציאלי', sortOrder: 100 },
];

/** In-memory label/synonym → code map, built once. Avoids a DB round-trip per row. */
const TYPE_CODE_MAP = new Map<string, string>();

/** Ensure the standard classifications exist and build the resolution map (call once before importing). */
async function ensureStandardClassifications(dryRun: boolean): Promise<void> {
  if (!dryRun) {
    for (const c of STANDARD_CLASSIFICATIONS) {
      await prisma.customerClassification.upsert({
        where: { code: c.code },
        create: { id: randomUUID(), code: c.code, labelHe: c.labelHe, sortOrder: c.sortOrder, isPreset: false },
        update: {},
      });
    }
  }
  TYPE_CODE_MAP.clear();
  const put = (k: string, code: string) => TYPE_CODE_MAP.set(k.trim(), code);
  // Standard codes + their canonical Hebrew labels
  for (const c of STANDARD_CLASSIFICATIONS) {
    put(c.code, c.code);
    put(c.labelHe, c.code);
  }
  // This file's exact type strings + common variants
  put('לקוח עסקי', 'COMPANY');
  put('עסקי', 'COMPANY');
  put('לקוח פרטי', 'PRIVATE');
  put('פרטי', 'PRIVATE');
  put('פוטנציאלי', 'POTENTIAL');
  put('ספק', 'SUPPLIER');
  put('ספקים', 'SUPPLIER'); // file uses plural
  // Any other classifications already in the DB (by code and by label)
  if (!dryRun) {
    const all = await prisma.customerClassification.findMany();
    for (const c of all) {
      if (!TYPE_CODE_MAP.has(c.code)) put(c.code, c.code);
      if (!TYPE_CODE_MAP.has(c.labelHe.trim())) put(c.labelHe.trim(), c.code);
    }
  }
}

function resolveCustomerTypeCode(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  return TYPE_CODE_MAP.get(t) ?? null;
}

async function importOneCustomer(
  customerRow: Row,
  ctx: {
    dryRun: boolean;
    contactRows: Row[];
    referralRows: Row[];
    questionnaireRows: Row[];
    relationRows: Row[];
    additionalRows: Row[];
    externalRows: Row[];
    documentRows: Row[];
    targetLegacyId: string | null;
    targetCustomerUuid: string | null;
  },
  summary: Summary,
) {
  const n = normalizeRow(customerRow);
  const importLegacyId = str(n.importLegacyId);

  if (ctx.targetCustomerUuid) {
    const idCol = str(n.id);
    if (!idCol || idCol !== ctx.targetCustomerUuid) {
      return;
    }
  }

  if (ctx.targetLegacyId && importLegacyId !== ctx.targetLegacyId) {
    return;
  }

  if (!importLegacyId) {
    summary.customersSkipped++;
    summary.errors.push('Customer row skipped: importLegacyId is required');
    return;
  }

  let createUpdate: Prisma.CustomerCreateInput;
  try {
    createUpdate = customerDataFromRow(customerRow);
  } catch (e) {
    summary.customersSkipped++;
    summary.errors.push(`Customer ${importLegacyId}: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }

  const typeRaw = String(createUpdate.type ?? '').trim();
  const resolvedType = resolveCustomerTypeCode(typeRaw);
  if (!resolvedType) {
    summary.customersSkipped++;
    summary.errors.push(
      `Customer ${importLegacyId}: unknown type "${typeRaw}" — add it to STANDARD_CLASSIFICATIONS / TYPE_CODE_MAP`,
    );
    return;
  }
  createUpdate = { ...createUpdate, type: resolvedType };

  summary.customersProcessed++;

  const existing = await prisma.customer.findFirst({ where: { importLegacyId } });
  let customerId: string;

  if (ctx.dryRun) {
    log('info', `[dry-run] would ${existing ? 'update' : 'create'} customer importLegacyId=${importLegacyId}`);
    customerId = existing?.id ?? '(new-uuid)';
    if (!existing) summary.customersCreated++;
    else summary.customersUpdated++;
  } else {
    if (existing) {
      const { importLegacyId: _il, ...scalarUpdate } = createUpdate as Record<string, unknown>;
      // A single customer code can span many rows (one contact per row). Don't let a later row's
      // synthesized placeholders clobber good data already imported from an earlier row.
      const rec = scalarUpdate as Record<string, unknown>;
      if (rec.phone === '-' || rec.phone === '') delete rec.phone;
      if (rec.city === '-' || rec.city === '') delete rec.city;
      if (typeof rec.email === 'string' && rec.email.endsWith('@legacy.import.local')) delete rec.email;
      await prisma.customer.update({
        where: { id: existing.id },
        data: rec as Prisma.CustomerUpdateInput,
      });
      customerId = existing.id;
      summary.customersUpdated++;
    } else {
      const created = await prisma.customer.create({ data: createUpdate });
      customerId = created.id;
      summary.customersCreated++;
    }
  }

  const cid = existing?.id ?? customerId;

  async function runChild<T>(
    rows: Row[],
    filter: (r: Row) => boolean,
    fn: (r: Row, customerId: string) => Promise<void>,
    counter: () => void,
  ) {
    for (const r of rows) {
      if (!filter(r)) continue;
      try {
        if (!cid) continue;
        if (ctx.dryRun) {
          counter();
          continue;
        }
        await fn(r, cid);
        counter();
      } catch (e) {
        summary.errors.push(`Child row: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  await runChild(
    ctx.contactRows,
    (r) => getCustomerLink(r) === importLegacyId,
    async (r, cId) => {
      const m = normalizeRow(r);
      const legacy = str(m.importLegacyId) || `contact-${randomUUID().slice(0, 8)}`;
      await prisma.customerContact.upsert({
        where: { customerId_importLegacyId: { customerId: cId, importLegacyId: legacy } },
        create: {
          customerId: cId,
          importLegacyId: legacy,
          fullName: strReq(m.fullName, 'fullName'),
          phone: str(m.phone) || '',
          mobile: str(m.mobile) || '',
          fax: str(m.fax) || '',
          email: str(m.email) || '',
          address: str(m.address) || '',
          city: str(m.city) || '',
          zip: str(m.zip) || '',
          roleTitle: str(m.roleTitle) ?? undefined,
          department: str(m.department) ?? undefined,
          isPrimary: parseBool(m.isPrimary) ?? false,
          isActive: parseBool(m.isActive) ?? true,
          notes: str(m.notes) ?? undefined,
        },
        update: {
          fullName: strReq(m.fullName, 'fullName'),
          phone: str(m.phone) || '',
          mobile: str(m.mobile) || '',
          fax: str(m.fax) || '',
          email: str(m.email) || '',
          address: str(m.address) || '',
          city: str(m.city) || '',
          zip: str(m.zip) || '',
          roleTitle: str(m.roleTitle) ?? undefined,
          department: str(m.department) ?? undefined,
          isPrimary: parseBool(m.isPrimary) ?? false,
          isActive: parseBool(m.isActive) ?? true,
          notes: str(m.notes) ?? undefined,
        },
      });
    },
    () => summary.contactsUpserted++,
  );

  await runChild(
    ctx.referralRows,
    (r) => getCustomerLink(r) === importLegacyId,
    async (r, cId) => {
      const m = normalizeRow(r);
      const rowLegacy = str(m.importLegacyId);
      const data = {
        date: parseDate(m.date) ?? undefined,
        sourceName: str(m.sourceName) ?? undefined,
        rowOrder: Number(m.rowOrder) || 0,
        importLegacyId: rowLegacy ?? undefined,
      };
      if (rowLegacy) {
        const ex = await prisma.customerReferralSource.findFirst({
          where: { customerId: cId, importLegacyId: rowLegacy },
        });
        if (ex) {
          await prisma.customerReferralSource.update({ where: { id: ex.id }, data });
        } else {
          await prisma.customerReferralSource.create({ data: { ...data, customerId: cId } });
        }
      } else {
        await prisma.customerReferralSource.create({ data: { ...data, customerId: cId } });
      }
    },
    () => summary.referralsUpserted++,
  );

  await runChild(
    ctx.questionnaireRows,
    (r) => getCustomerLink(r) === importLegacyId,
    async (r, cId) => {
      const m = normalizeRow(r);
      const rowLegacy = str(m.importLegacyId);
      const data = {
        questionnaireCode: str(m.questionnaireCode) ?? undefined,
        questionnaireName: str(m.questionnaireName) ?? undefined,
        rowOrder: Number(m.rowOrder) || 0,
        importLegacyId: rowLegacy ?? undefined,
      };
      if (rowLegacy) {
        const ex = await prisma.customerQuestionnaire.findFirst({
          where: { customerId: cId, importLegacyId: rowLegacy },
        });
        if (ex) await prisma.customerQuestionnaire.update({ where: { id: ex.id }, data });
        else await prisma.customerQuestionnaire.create({ data: { ...data, customerId: cId } });
      } else {
        await prisma.customerQuestionnaire.create({ data: { ...data, customerId: cId } });
      }
    },
    () => summary.questionnairesUpserted++,
  );

  await runChild(
    ctx.relationRows,
    (r) => getCustomerLink(r) === importLegacyId,
    async (r, cId) => {
      const m = normalizeRow(r);
      const rowLegacy = str(m.importLegacyId);
      const data = {
        relatedCustomerName: str(m.relatedCustomerName) ?? undefined,
        relationType: str(m.relationType) ?? undefined,
        rowOrder: Number(m.rowOrder) || 0,
        importLegacyId: rowLegacy ?? undefined,
      };
      if (rowLegacy) {
        const ex = await prisma.customerRelation.findFirst({
          where: { customerId: cId, importLegacyId: rowLegacy },
        });
        if (ex) await prisma.customerRelation.update({ where: { id: ex.id }, data });
        else await prisma.customerRelation.create({ data: { ...data, customerId: cId } });
      } else {
        await prisma.customerRelation.create({ data: { ...data, customerId: cId } });
      }
    },
    () => summary.relationsUpserted++,
  );

  await runChild(
    ctx.additionalRows,
    (r) => getCustomerLink(r) === importLegacyId,
    async (r, cId) => {
      const m = normalizeRow(r);
      const rowLegacy = str(m.importLegacyId);
      const data = {
        numberValue: str(m.numberValue) ?? undefined,
        dValue: str(m.dValue) ?? undefined,
        dateValue: parseDate(m.dateValue) ?? undefined,
        text1: str(m.text1) ?? undefined,
        text2: str(m.text2) ?? undefined,
        rowOrder: Number(m.rowOrder) || 0,
        importLegacyId: rowLegacy ?? undefined,
      };
      if (rowLegacy) {
        const ex = await prisma.customerAdditionalDataRow.findFirst({
          where: { customerId: cId, importLegacyId: rowLegacy },
        });
        if (ex) await prisma.customerAdditionalDataRow.update({ where: { id: ex.id }, data });
        else await prisma.customerAdditionalDataRow.create({ data: { ...data, customerId: cId } });
      } else {
        await prisma.customerAdditionalDataRow.create({ data: { ...data, customerId: cId } });
      }
    },
    () => summary.additionalUpserted++,
  );

  await runChild(
    ctx.externalRows,
    (r) => getCustomerLink(r) === importLegacyId,
    async (r, cId) => {
      const m = normalizeRow(r);
      const rowLegacy = str(m.importLegacyId);
      const data = {
        rowOrder: Number(m.rowOrder) || 0,
        colA: str(m.colA) ?? undefined,
        colB: str(m.colB) ?? undefined,
        colC: str(m.colC) ?? undefined,
        colD: str(m.colD) ?? undefined,
        colE: str(m.colE) ?? undefined,
        colF: str(m.colF) ?? undefined,
        colG: str(m.colG) ?? undefined,
        colH: str(m.colH) ?? undefined,
        colI: str(m.colI) ?? undefined,
        colJ: str(m.colJ) ?? undefined,
        importLegacyId: rowLegacy ?? undefined,
      };
      if (rowLegacy) {
        const ex = await prisma.customerExternalDataRow.findFirst({
          where: { customerId: cId, importLegacyId: rowLegacy },
        });
        if (ex) await prisma.customerExternalDataRow.update({ where: { id: ex.id }, data });
        else await prisma.customerExternalDataRow.create({ data: { ...data, customerId: cId } });
      } else {
        await prisma.customerExternalDataRow.create({ data: { ...data, customerId: cId } });
      }
    },
    () => summary.externalUpserted++,
  );

  await runChild(
    ctx.documentRows,
    (r) => getCustomerLink(r) === importLegacyId,
    async (r, cId) => {
      const m = normalizeRow(r);
      const name = strReq(m.name, 'Document.name');
      const filePath = str(m.filePath) || `legacy:import:${str(m.importLegacyId) || randomUUID()}`;
      const rowLegacy = str(m.importLegacyId);
      const data = {
        name,
        filePath,
        description: str(m.description) ?? undefined,
        documentType: parseDocumentType(m.documentType),
        documentDate: parseDate(m.documentDate) ?? undefined,
        mimeType: str(m.mimeType) ?? undefined,
        sizeBytes: m.sizeBytes != null && m.sizeBytes !== '' ? Number(m.sizeBytes) : undefined,
        importLegacyId: rowLegacy ?? undefined,
        customerId: cId,
      };
      if (rowLegacy) {
        const ex = await prisma.document.findFirst({
          where: { customerId: cId, importLegacyId: rowLegacy },
        });
        if (ex) {
          await prisma.document.update({
            where: { id: ex.id },
            data: {
              name: data.name,
              filePath: data.filePath,
              description: data.description,
              documentType: data.documentType,
              documentDate: data.documentDate,
              mimeType: data.mimeType,
              sizeBytes: data.sizeBytes,
            },
          });
        } else {
          await prisma.document.create({ data });
        }
      } else {
        await prisma.document.create({ data });
      }
    },
    () => summary.documentsUpserted++,
  );
}

function printUsage() {
  console.log(`Usage: npm run import:legacy-customers -- --file <path.xlsx|csv> [--dry-run] [--legacy-id <id> | --customer-id <uuid>] [--batch]

  --file          Excel (.xlsx) or CSV (first sheet = customers only)
  --dry-run       Validate and log actions; no writes
  --legacy-id     Import one row where Customer.importLegacyId matches
  --customer-id   Import one row where Customer id (UUID) matches
  --batch         All customer rows in the Customer sheet
`);
}

async function main() {
  const parsed = parseArgs(process.argv);
  if (parsed === 'help') {
    printUsage();
    process.exit(0);
  }
  const args = parsed;
  if (!args.file) {
    console.error('Missing --file');
    printUsage();
    process.exit(1);
  }

  if (!args.batch && !args.legacyId && !args.customerId) {
    console.error('Specify exactly one scope: --legacy-id <id> OR --customer-id <uuid> OR --batch (all customers in file)');
    process.exit(1);
  }

  if ([args.legacyId, args.customerId, args.batch ? 'batch' : null].filter(Boolean).length > 1) {
    console.error('Use only one of: --legacy-id, --customer-id, --batch');
    process.exit(1);
  }

  const path = resolve(process.cwd(), args.file);
  if (!existsSync(path)) {
    console.error(`File not found: ${path}`);
    process.exit(1);
  }

  const summary = emptySummary();
  const ext = path.toLowerCase().endsWith('.csv') ? 'csv' : 'xlsx';

  let customerRows: Row[] = [];
  let contactRows: Row[] = [];
  let referralRows: Row[] = [];
  let questionnaireRows: Row[] = [];
  let relationRows: Row[] = [];
  let additionalRows: Row[] = [];
  let externalRows: Row[] = [];
  let documentRows: Row[] = [];
  let hebrewFlat = false;

  if (ext === 'csv') {
    const buf = readFileSync(path);
    const wb = XLSX.read(buf, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    customerRows = sheetToRows(sheet);
    log('info', 'CSV mode: customer sheet only; child entities require Excel multi-sheet file.');
  } else {
    const buf = readFileSync(path);
    const wb = XLSX.read(buf, { type: 'buffer' });
    const custSheet = findSheet(wb, SHEETS.customer);
    hebrewFlat = isHebrewFlatCustomerWorkbook(wb, custSheet);
    if (hebrewFlat) {
      const sn = wb.SheetNames[0];
      customerRows = readHebrewFlatRows(wb.Sheets[sn]) ?? [];
      log(
        'info',
        `Hebrew flat sheet "${sn}": ${customerRows.length} data rows; contacts/referrals synthesized from inline columns.`,
      );
    } else {
      if (!custSheet) {
        console.error(
          'Excel must have a "Customer" sheet (or alias), or a Hebrew flat export with column "קוד לקוח".',
        );
        process.exit(1);
      }
      customerRows = sheetToRows(custSheet);
      const c1 = findSheet(wb, SHEETS.contact);
      const c2 = findSheet(wb, SHEETS.referral);
      const c3 = findSheet(wb, SHEETS.questionnaire);
      const c4 = findSheet(wb, SHEETS.relation);
      const c5 = findSheet(wb, SHEETS.additional);
      const c6 = findSheet(wb, SHEETS.external);
      const c7 = findSheet(wb, SHEETS.document);
      if (c1) contactRows = sheetToRows(c1);
      if (c2) referralRows = sheetToRows(c2);
      if (c3) questionnaireRows = sheetToRows(c3);
      if (c4) relationRows = sheetToRows(c4);
      if (c5) additionalRows = sheetToRows(c5);
      if (c6) externalRows = sheetToRows(c6);
      if (c7) documentRows = sheetToRows(c7);
    }
  }

  await ensureStandardClassifications(args.dryRun);

  const ctx = {
    dryRun: args.dryRun,
    contactRows,
    referralRows,
    questionnaireRows,
    relationRows,
    additionalRows,
    externalRows,
    documentRows,
    targetLegacyId: args.batch ? null : args.legacyId,
    targetCustomerUuid: args.batch ? null : args.customerId,
  };

  let processed = 0;
  for (const row of customerRows) {
    try {
      if (hebrewFlat) {
        const exp = expandHebrewFlatRow(row);
        await importOneCustomer(exp.customerRow, { ...ctx, contactRows: exp.contactRows, referralRows: exp.referralRows }, summary);
      } else {
        await importOneCustomer(row, ctx, summary);
      }
    } catch (e) {
      summary.errors.push(`Fatal row: ${e instanceof Error ? e.message : String(e)}`);
    }
    processed++;
    if (processed % 1000 === 0) {
      log('info', `progress: ${processed}/${customerRows.length} rows (created ${summary.customersCreated}, updated ${summary.customersUpdated}, skipped ${summary.customersSkipped}, errors ${summary.errors.length})`);
    }
  }

  log('info', '--- Summary ---');
  log('info', `customersProcessed: ${summary.customersProcessed}`);
  log('info', `customersCreated: ${summary.customersCreated}`);
  log('info', `customersUpdated: ${summary.customersUpdated}`);
  log('info', `customersSkipped: ${summary.customersSkipped}`);
  log('info', `contactsUpserted: ${summary.contactsUpserted}`);
  log('info', `referralsUpserted: ${summary.referralsUpserted}`);
  log('info', `questionnairesUpserted: ${summary.questionnairesUpserted}`);
  log('info', `relationsUpserted: ${summary.relationsUpserted}`);
  log('info', `additionalUpserted: ${summary.additionalUpserted}`);
  log('info', `externalUpserted: ${summary.externalUpserted}`);
  log('info', `documentsUpserted: ${summary.documentsUpserted}`);
  log('info', `errors (${summary.errors.length}):`);
  for (const e of summary.errors.slice(0, 50)) log('warn', `  - ${e}`);
  if (summary.errors.length > 50) log('warn', `  ... and ${summary.errors.length - 50} more`);

  await prisma.$disconnect();
  await pool.end();
  process.exit(summary.errors.length > 0 && summary.customersProcessed === 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  await pool.end();
  process.exit(1);
});
