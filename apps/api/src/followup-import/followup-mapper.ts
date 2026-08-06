import { FollowupSqlBuckets } from './followup-sql.parser';
import { SheetRow } from './followup-sheet.parser';
import {
  digitsPhone,
  normEmail,
  normStr,
  parseDateFlexible,
  pickField,
  rowKeyUpper,
  stableHash,
  toBool,
  toNumber,
} from './followup-normalize';
import { formatIsraeliPhone } from '../common/phone.util';

/** normStr + עיצוב ישראלי — כל מספר שנכנס בייבוא נשמר עם מקף. */
const normPhone = (v: unknown): string => formatIsraeliPhone(normStr(v));

export type ImportEntityKind = 'customers' | 'contacts' | 'quotes' | 'orders' | 'activities' | 'auto';

export type NormalizedCustomer = {
  legacyCode: string;
  name: string;
  contactName: string;
  phone: string;
  phone2: string;
  phone3: string;
  fax: string;
  email: string;
  city: string;
  addressLine1: string;
  zip: string;
  cityCodeLegacy: string;
  website: string;
  customerTypeLegacy: string;
  classificationLegacy: string;
  companyNumber: string;
  notes: string;
  internalNotes: string;
  balance: number | null;
  birthday: Date | null;
  legacyUpdatedAt: Date | null;
};

export type NormalizedContact = {
  customerLegacy: string;
  contactLegacy: string;
  fullName: string;
  phone: string;
  mobile: string;
  fax: string;
  email: string;
  address: string;
  city: string;
  zip: string;
  roleTitle: string;
  department: string;
  isPrimary: boolean;
  isActive: boolean;
  notes: string;
};

export type NormalizedQuote = {
  legacyCode: string;
  quoteNumber: string;
  customerLegacy: string;
  contactLegacy: string;
  quoteDate: Date | null;
  followUpDate: Date | null;
  statusLegacy: string;
  total: number;
  paymentTerms: string;
  notes: string;
  internalNotes: string;
  relatedOrderLegacy: string;
};

export type NormalizedOrder = {
  legacyCode: string;
  orderNumber: string;
  customerLegacy: string;
  contactLegacy: string;
  orderDate: Date | null;
  statusLegacy: string;
  total: number;
  notes: string;
  internalNotes: string;
  deliverySummary: string;
  paymentTerms: string;
  quoteLegacy: string;
};

export type NormalizedActivity = {
  legacyCode: string | null;
  customerLegacy: string;
  contactLegacy: string;
  activityType: string;
  status: string;
  subject: string;
  notes: string;
  dueDate: Date | null;
  completedDate: Date | null;
  activityDate: Date | null;
  legacyOwnerName: string;
  location: string;
  priority: string;
  dedupeHash: string;
};

export type MappedFollowupPayload = {
  customers: NormalizedCustomer[];
  contacts: NormalizedContact[];
  quotes: NormalizedQuote[];
  orders: NormalizedOrder[];
  activities: NormalizedActivity[];
  warnings: string[];
};

function mapCustomerRow(r: Record<string, unknown>): NormalizedCustomer | null {
  const row = rowKeyUpper(r);
  const legacyCode = normStr(
    pickField(row, 'CUSTOMER_CODE', 'Customer_Code', 'CODE', 'קוד_לקוח', 'קוד לקוח'),
  );
  const name = normStr(pickField(row, 'CUSTOMER_NAME', 'Customer_Name', 'שם', 'NAME'));
  if (!legacyCode && !name) return null;

  // ה-hash של legacyCode נשען על הערך הגולמי — עיצוב המקף לא ישנה מפתחות של ייבוא קודם.
  const phoneRaw = normStr(pickField(row, 'TELEPHONE_1', 'Telephone_1', 'PHONE', 'טלפון'));
  const email = normEmail(pickField(row, 'EMAIL', 'EMail', 'E_MAIL'));
  const notes = normStr(pickField(row, 'REM', 'Rem', 'NOTES'));
  const internalNotes = normStr(pickField(row, 'REM2', 'Rem2', 'INTERNAL_NOTES'));

  return {
    legacyCode: legacyCode || stableHash(['cust', name, phoneRaw, email]),
    name: name || `לקוח ${legacyCode || '—'}`,
    contactName: name || '—',
    phone: formatIsraeliPhone(phoneRaw),
    phone2: normPhone(pickField(row, 'TELEPHONE_2', 'Telephone_2')),
    phone3: normPhone(pickField(row, 'TELEPHONE_3', 'Telephone_3')),
    fax: normPhone(pickField(row, 'CUSTOMER_FAX', 'Customer_Fax', 'FAX')),
    email,
    city: normStr(pickField(row, 'CITY', 'Customer_City', 'עיר')),
    addressLine1: normStr(pickField(row, 'CUSTOMER_KTOVET', 'Customer_Ktovet', 'ADDRESS', 'כתובת')),
    zip: normStr(pickField(row, 'CUSTOMER_MIKUD', 'Customer_Mikud', 'ZIP', 'מיקוד')),
    cityCodeLegacy: normStr(pickField(row, 'CUSTOMER_CITY_CODE', 'Customer_City_Code')),
    website: normStr(pickField(row, 'INTERNET', 'InterNet', 'WEBSITE')),
    customerTypeLegacy: normStr(pickField(row, 'CODE_SUG', 'Code_Sug')),
    classificationLegacy: normStr(pickField(row, 'CODE_SIVUG', 'Code_Sivug')),
    companyNumber: normStr(pickField(row, 'COMPANYNUMBER', 'CompanyNumber')),
    notes,
    internalNotes,
    balance: (() => {
      const b = pickField(row, 'BALANCE', 'Balance');
      if (b == null || b === '') return null;
      const n = toNumber(b);
      return n;
    })(),
    birthday: parseDateFlexible(pickField(row, 'BIRTHDAY', 'Birthday')),
    legacyUpdatedAt: parseDateFlexible(pickField(row, 'DATEUPDATED', 'DateUpdated')),
  };
}

function mapContactRow(r: Record<string, unknown>): NormalizedContact | null {
  const row = rowKeyUpper(r);
  const customerLegacy = normStr(
    pickField(row, 'CUSTOMER_CODE', 'Customer_Code', 'קוד_לקוח', 'קוד לקוח'),
  );
  const contactLegacy = normStr(
    pickField(row, 'CODE_ISH_KESHER', 'Code_Ish_Kesher', 'קוד_איש_קשר'),
  );
  const fullName = normStr(pickField(row, 'SHEM_ISH_KESHER', 'Shem_Ish_Kesher', 'שם', 'NAME'));
  if (!customerLegacy) return null;
  if (!fullName && !contactLegacy) return null;

  const cl =
    contactLegacy ||
    stableHash(['c', customerLegacy, fullName, normStr(pickField(row, 'PHONE'))]);

  return {
    customerLegacy,
    contactLegacy: cl,
    fullName: fullName || `איש קשר ${cl}`,
    phone: normPhone(pickField(row, 'ISH_KESHER_TELEPHONE', 'Ish_Kesher_Telephone', 'PHONE', 'טלפון')),
    mobile: normPhone(pickField(row, 'ISHKESHERCELLPHONE', 'IshKesherCellPhone', 'MOBILE', 'נייד')),
    fax: normPhone(pickField(row, 'ISH_KESHER_FAX', 'Ish_Kesher_Fax')),
    email: normEmail(pickField(row, 'ISH_KESHEREMAIL', 'Ish_KesherEMail', 'EMAIL')),
    address: normStr(pickField(row, 'ISH_KESHER_KTOVET', 'Ish_Kesher_Ktovet')),
    city: normStr(pickField(row, 'ISH_KESHER_CITY', 'Ish_Kesher_City')),
    zip: normStr(pickField(row, 'ISH_KESHER_MIKUD', 'Ish_Kesher_Mikud')),
    roleTitle: normStr(pickField(row, 'CODE_TAFKID', 'Code_Tafkid')),
    department: normStr(pickField(row, 'MACHLAKA', 'Machlaka')),
    isPrimary: toBool(pickField(row, 'PRIMARY', 'Primary')),
    isActive: (() => {
      const a = pickField(row, 'ACTIVE', 'Active');
      if (a === undefined || a === null || normStr(a) === '') return true;
      const s = normStr(a).toUpperCase();
      if (s === '0' || s === 'N' || s === 'FALSE') return false;
      return toBool(a);
    })(),
    notes: normStr(pickField(row, 'ISHKESHERREM', 'IshKesherRem', 'REM')),
  };
}

function mapQuoteRow(r: Record<string, unknown>): NormalizedQuote | null {
  const row = rowKeyUpper(r);
  const legacyCode = normStr(pickField(row, 'CODE', 'Quote_Code', 'מספר_הצעה'));
  if (!legacyCode) return null;
  const customerLegacy = normStr(pickField(row, 'CUSTOMER', 'Customer', 'CUSTOMER_CODE', 'Customer_Code'));
  if (!customerLegacy) return null;

  return {
    legacyCode,
    quoteNumber: legacyCode,
    customerLegacy,
    contactLegacy: normStr(pickField(row, 'ISHKESHER', 'IshKesher', 'CODE_ISH_KESHER')),
    quoteDate: parseDateFlexible(pickField(row, 'DATE_R', 'Date_r')),
    followUpDate: parseDateFlexible(pickField(row, 'FOLLOWUPDATE', 'FollowUpDate')),
    statusLegacy: normStr(pickField(row, 'STATUS', 'Status')),
    total: toNumber(pickField(row, 'TOTAL', 'Total', 'fldApproxSum', 'AHUZSGIRA')),
    paymentTerms: normStr(pickField(row, 'PAYMENTCONDITION', 'PaymentCondition')),
    notes: normStr(pickField(row, 'NOTES', 'Notes')),
    internalNotes: normStr(pickField(row, 'INTERNALNOTES', 'InternalNotes')),
    relatedOrderLegacy: normStr(pickField(row, 'ORDERNO', 'OrderNo', 'RELATEDORDER', 'RelatedOrder')),
  };
}

function mapOrderRow(r: Record<string, unknown>): NormalizedOrder | null {
  const row = rowKeyUpper(r);
  const legacyCode = normStr(pickField(row, 'CODE', 'Order_Code', 'מספר_הזמנה'));
  if (!legacyCode) return null;
  const customerLegacy = normStr(pickField(row, 'CUSTOMER', 'Customer', 'CUSTOMER_CODE', 'Customer_Code'));
  if (!customerLegacy) return null;

  const deliver = [
    normStr(pickField(row, 'DELIVERLOCATION', 'DeliverLocation')),
    normStr(pickField(row, 'DELIVERCONTACT', 'DeliverContact')),
    normStr(pickField(row, 'DELIVERPHONE', 'DeliverPhone')),
    normStr(pickField(row, 'DELIVERDATE', 'DeliverDate')),
  ]
    .filter(Boolean)
    .join(' | ');

  return {
    legacyCode,
    orderNumber: legacyCode,
    customerLegacy,
    contactLegacy: normStr(pickField(row, 'ISHKESHER', 'IshKesher')),
    orderDate: parseDateFlexible(pickField(row, 'DATE_R', 'Date_r')),
    statusLegacy: normStr(pickField(row, 'STATUS', 'Status')),
    total: toNumber(pickField(row, 'TOTAL', 'Total')),
    notes: normStr(pickField(row, 'NOTES', 'Notes')),
    internalNotes: normStr(pickField(row, 'INTERNALNOTES', 'InternalNotes')),
    deliverySummary: deliver,
    paymentTerms: normStr(
      pickField(row, 'PAYMENTCONDITION', 'PaymentCondition', 'PAYMENTTYPE', 'PaymentType'),
    ),
    quoteLegacy: normStr(pickField(row, 'HATSA', 'Hatsa', 'QUOTE', 'Quote')),
  };
}

function mapActivityRow(r: Record<string, unknown>): NormalizedActivity | null {
  const row = rowKeyUpper(r);
  const customerLegacy = normStr(pickField(row, 'CUSTOMER_CODE', 'Customer_Code'));
  if (!customerLegacy) return null;

  const legacyCode = normStr(pickField(row, 'CODE_HITKASHRUT', 'Code_Hitkashrut'));
  const notes = [
    normStr(pickField(row, 'REM', 'REM')),
    normStr(pickField(row, 'FREETEXT1', 'FreeText1')),
    normStr(pickField(row, 'FREETEXT2', 'FreeText2')),
    normStr(pickField(row, 'FREETEXT3', 'FreeText3')),
  ]
    .filter(Boolean)
    .join('\n');

  const activityType = normStr(pickField(row, 'CODE_PEILUT', 'Code_Peilut'));
  const hitDate = parseDateFlexible(pickField(row, 'HITKASHRUT_TARICH', 'Hitkashrut_Tarich'));
  const dedupeHash = stableHash([
    customerLegacy,
    legacyCode,
    normStr(pickField(row, 'CODE_ISH_KESHER', 'Code_Ish_Kesher')),
    activityType,
    hitDate?.toISOString() || '',
    notes.slice(0, 400),
  ]);

  return {
    legacyCode: legacyCode || null,
    customerLegacy,
    contactLegacy: normStr(pickField(row, 'CODE_ISH_KESHER', 'Code_Ish_Kesher')),
    activityType,
    status: normStr(pickField(row, 'STATUS', 'Status')),
    subject: normStr(pickField(row, 'ASMACHTA', 'Asmachta')),
    notes,
    dueDate: parseDateFlexible(pickField(row, 'TARICH_LEBITSUA', 'Tarich_LeBitsua')),
    completedDate: parseDateFlexible(pickField(row, 'TARICH_BEPAOL', 'Tarich_BePoal')),
    activityDate: hitDate,
    legacyOwnerName: normStr(pickField(row, 'LASTUSERNAME', 'LastUserName')),
    location: normStr(pickField(row, 'MEETINGPLACE', 'MeetingPlace')),
    priority: normStr(pickField(row, 'PRIORITY', 'Priority')),
    dedupeHash,
  };
}

function buildWarnings(payload: MappedFollowupPayload): string[] {
  const w: string[] = [];
  const custSet = new Set(payload.customers.map((c) => c.legacyCode));
  for (const ct of payload.contacts) {
    if (!custSet.has(ct.customerLegacy)) {
      w.push(`איש קשר "${ct.fullName}": קוד לקוח ישן ${ct.customerLegacy} לא נמצא בבאקט הלקוחות (ייתכן סדר ייבוא או חסר בקובץ)`);
    }
  }
  for (const q of payload.quotes) {
    if (!custSet.has(q.customerLegacy)) {
      w.push(`הצעה ${q.legacyCode}: לקוח ישן ${q.customerLegacy} לא בבאקט`);
    }
  }
  for (const o of payload.orders) {
    if (!custSet.has(o.customerLegacy)) {
      w.push(`הזמנה ${o.legacyCode}: לקוח ישן ${o.customerLegacy} לא בבאקט`);
    }
  }
  for (const a of payload.activities) {
    if (!custSet.has(a.customerLegacy)) {
      w.push(`פעילות: לקוח ישן ${a.customerLegacy} לא בבאקט`);
    }
  }

  const dupCust = new Map<string, number>();
  for (const c of payload.customers) {
    dupCust.set(c.legacyCode, (dupCust.get(c.legacyCode) || 0) + 1);
  }
  for (const [k, n] of dupCust) {
    if (n > 1) w.push(`לקוחות: קוד ישן ${k} מופיע ${n} פעמים בקובץ — יבוצע upsert`);
  }

  return w;
}

export function mapFromSqlBuckets(buckets: FollowupSqlBuckets): MappedFollowupPayload {
  const customers = buckets.CUSTOMERS.map(mapCustomerRow).filter(Boolean) as NormalizedCustomer[];
  const contacts = buckets.ISH_KESHER.map(mapContactRow).filter(Boolean) as NormalizedContact[];
  const quotes = buckets.HATSAOTHEADER.map(mapQuoteRow).filter(Boolean) as NormalizedQuote[];
  const orders = buckets.ORDERS.map(mapOrderRow).filter(Boolean) as NormalizedOrder[];
  const activities = buckets.HITKASHRUT.map(mapActivityRow).filter(Boolean) as NormalizedActivity[];

  const warnings = buildWarnings({
    customers,
    contacts,
    quotes,
    orders,
    activities,
    warnings: [],
  });

  return { customers, contacts, quotes, orders, activities, warnings };
}

export function mapFromSheetRows(entity: ImportEntityKind, rows: SheetRow[]): MappedFollowupPayload {
  const empty: MappedFollowupPayload = {
    customers: [],
    contacts: [],
    quotes: [],
    orders: [],
    activities: [],
    warnings: [],
  };
  if (entity === 'auto') {
    empty.warnings.push('יש לבחור סוג ישות לייבוא גיליון (CSV/XLSX)');
    return empty;
  }
  const recs = rows.map((r) => rowKeyUpper(r as Record<string, unknown>));

  if (entity === 'customers') {
    const customers = recs.map(mapCustomerRow).filter(Boolean) as NormalizedCustomer[];
    return { ...empty, customers, warnings: buildWarnings({ ...empty, customers }) };
  }
  if (entity === 'contacts') {
    const contacts = recs.map(mapContactRow).filter(Boolean) as NormalizedContact[];
    return { ...empty, contacts, warnings: buildWarnings({ ...empty, contacts }) };
  }
  if (entity === 'quotes') {
    const quotes = recs.map(mapQuoteRow).filter(Boolean) as NormalizedQuote[];
    return { ...empty, quotes, warnings: buildWarnings({ ...empty, quotes }) };
  }
  if (entity === 'orders') {
    const orders = recs.map(mapOrderRow).filter(Boolean) as NormalizedOrder[];
    return { ...empty, orders, warnings: buildWarnings({ ...empty, orders }) };
  }
  const activities = recs.map(mapActivityRow).filter(Boolean) as NormalizedActivity[];
  return { ...empty, activities, warnings: buildWarnings({ ...empty, activities }) };
}

/** דוגמאות ל-preview (עד 20 לכל ישות) */
export function buildPreviewSamples(payload: MappedFollowupPayload) {
  const take = <T,>(arr: T[], n = 20) => arr.slice(0, n);
  return {
    customers: take(payload.customers),
    contacts: take(payload.contacts),
    quotes: take(payload.quotes),
    orders: take(payload.orders),
    activities: take(payload.activities),
  };
}

export function summarizeCounts(payload: MappedFollowupPayload) {
  return {
    customers: payload.customers.length,
    contacts: payload.contacts.length,
    quotes: payload.quotes.length,
    orders: payload.orders.length,
    activities: payload.activities.length,
  };
}
