import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { encryptSecret, decryptSecret } from '../common/crypto.util';

const CASPIT_BASE = 'https://app.caspit.biz/api/v1';
const SETTINGS_KEY = 'caspit';
// TrxTypeId=1 → חשבונית (מס). ראה תיעוד Caspit "יצירת חשבונית".
const TRX_TYPE_INVOICE = 1;
// TrxTypeId=2 → קבלה. אומת מול ה-API: מסמך עם ReceiptLines בלבד, Total=0, Payment>0,
// וסדרת מספרים נפרדת (…/30000). כספית עצמה מכנה אותו "Receipt" בהודעות השגיאה.
const TRX_TYPE_RECEIPT = 2;
// סיווג תנועה: 3 = הכנסות/מכירות (לחשבונית). לקבלה כספית מחייבת 2 במפורש —
// "TrxCodeNumber 3 is not a Receipt TrxCode … Allowed values: 2".
const TRX_CODE_SALES = 3;
const TRX_CODE_RECEIPT = 2;

/**
 * ארבעת סוגי המסמכים שמונפקים משלב הגבייה. ה-TrxTypeId אומתו מול כספית ע"י חילוץ
 * כותרת ה-PDF של מסמכים קיימים (ולא ניחוש): 6="חשבונית עסקה", 1="חשבונית מס",
 * 7="חשבונית מס/קבלה", 2="קבלה".
 * חשבונית עסקה אינה מסמך מס — היא דרישת תשלום ואינה משפיעה על דוחות המע"מ.
 */
export type CaspitDocKind = 'proforma' | 'invoice' | 'invoiceReceipt' | 'receipt';

export const CASPIT_DOC_KINDS: Record<
  CaspitDocKind,
  { trxTypeId: number; trxCodeNumber: number; label: string; hasLines: boolean; hasPayment: boolean; idPrefix: string }
> = {
  proforma:       { trxTypeId: 6, trxCodeNumber: TRX_CODE_SALES,   label: 'חשבונית עסקה',    hasLines: true,  hasPayment: false, idPrefix: 'crm-prof-' },
  invoice:        { trxTypeId: 1, trxCodeNumber: TRX_CODE_SALES,   label: 'חשבונית מס',      hasLines: true,  hasPayment: false, idPrefix: 'crm-quote-' },
  invoiceReceipt: { trxTypeId: 7, trxCodeNumber: TRX_CODE_SALES,   label: 'חשבונית מס קבלה', hasLines: true,  hasPayment: true,  idPrefix: 'crm-invrcp-' },
  receipt:        { trxTypeId: 2, trxCodeNumber: TRX_CODE_RECEIPT, label: 'קבלה',            hasLines: false, hasPayment: true,  idPrefix: 'crm-receipt-' },
};

/** סוגי מסמכים שמייצגים כסף שהתקבל בפועל — הבסיס לדוח "הכנסות בפועל". */
const PAID_DOC_TYPES = [CASPIT_DOC_KINDS.receipt.trxTypeId, CASPIT_DOC_KINDS.invoiceReceipt.trxTypeId];

export interface CaspitCredentials {
  userName: string;
  password: string;   // מוצפן ב-DB (AES); כאן תמיד בטקסט גלוי אחרי decrypt
  osekMorshe: string;
}

/**
 * אמצעי תשלום בכספית (PaymentTypeId), מתוך GET /PaymentTypes. רק אלה שרלוונטיים
 * לגבייה אצלנו — הרשימה המלאה כוללת 17 ערכים, רובם מנפיקי אשראי ספציפיים.
 * ברירת המחדל היא "אחר": עדיף מדויק-אך-כללי מאשר לנחש מנפיק כרטיס שגוי.
 */
export const CASPIT_PAYMENT_TYPES = {
  CASH: 1,        // מזומן
  CHECK: 2,       // שיק
  TRANSFER: 9,    // העברה
  BIT: 16,        // ביט/פייבוקס
  OTHER: 12,      // אחר
} as const;

export interface CreateReceiptInput {
  documentId: string;
  customer: CreateInvoiceInput['customer'];
  amount: number;
  /** PaymentTypeId מתוך CASPIT_PAYMENT_TYPES. ברירת מחדל: "אחר". */
  paymentTypeId?: number;
  comments?: string;
}

export interface CaspitInvoiceLine {
  name: string;      // ProductName
  details?: string;  // תיאור
  unitPrice: number;
  qty: number;
  chargeVat?: boolean;
}

export interface CreateInvoiceInput {
  documentId: string; // מזהה ייחודי *שלנו* (Caspit מאחסן אותו כ-DocumentId)
  customer: {
    /** מזהה הלקוח אצלנו. ממנו נגזר ContactId בכספית — כך החשבונית מתקשרת לכרטיס לקוח. */
    id?: string | null;
    businessName: string;
    osekMorshe?: string | null;
    contactName?: string | null;
    address1?: string | null;
    city?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  lines: CaspitInvoiceLine[];
  comments?: string;
  /** נדרש ל"חשבונית מס קבלה" — התשלום שהתקבל בפועל יחד עם החשבונית. */
  payment?: { amount: number; paymentTypeId?: number };
  /**
   * תאריך יעד לתשלום (YYYY-MM-DD), נגזר מתנאי התשלום שנבחרו בזמן ההנפקה.
   * null/undefined → כספית לא תציג תאריך יעד (ההתנהגות שהייתה עד כה תמיד).
   * ראה payment-terms.ts.
   */
  dueDate?: string | null;
}

export interface CaspitInvoiceResult {
  documentId: string;
  number: string;      // מספר החשבונית שכספית הקצתה (למשל "98/10086")
  total: number;
  linkToPdf: string;   // קישור ל-PDF (עם token)
  viewUrl?: string | null;
  /** האם החשבונית קושרה לכרטיס לקוח בכספית. false = מסמך עם שם בלבד, היתרה לא תתעדכן. */
  customerLinked: boolean;
  /** האם המסמך נסגר (Status=2). false = נשאר טיוטה בכספית וצריך לסגור אותו ידנית. */
  finalized: boolean;
  /** נמען מוצע לשליחה במייל (איש הקשר בהצעה). הצעה בלבד — לא נשלח כלום עד אישור. */
  suggestedEmail?: string | null;
  /** שם הנמען המוצע, לפנייה בגוף המייל. */
  suggestedEmailName?: string | null;
  /** true = החשבונית כבר הונפקה קודם להצעה זו; לא נוצרה חדשה. */
  alreadyIssued?: boolean;
}

/**
 * אינטגרציה עם כספית (Caspit) — הנפקת חשבוniות.
 * אימות: POST /token (UserName/Password/OsekMorshe) → אסימון; נשלח ב-Header "Caspit-Token".
 * פרטי הגישה נשמרים ב-SystemSetting(key="caspit") עם הסיסמה מוצפנת (AES, כמו SMTP).
 */
@Injectable()
export class CaspitService {
  private readonly logger = new Logger(CaspitService.name);
  // קאש אסימון בזיכרון — האסימון של כספית תקף לזמן מה; לא מבקשים חדש בכל קריאה.
  private tokenCache: { token: string; ts: number } | null = null;
  private static readonly TOKEN_TTL_MS = 20 * 60_000; // 20 דקות (שמרני)
  // קאש רשימת אנשי הקשר — הסריקה יקרה (עמוד לכל 50 רשומות) ונדרשת רק כשלקוח
  // עדיין לא מקושר. אחרי הקישור הראשון הוא נשמר על כרטיס הלקוח ולא נסרק שוב.
  private contactsCache: { rows: any[]; ts: number } | null = null;
  private static readonly CONTACTS_TTL_MS = 5 * 60_000;
  private static readonly MAX_CONTACT_PAGES = 400; // בלם בטיחות (~20k אנשי קשר)

  constructor(private readonly prisma: PrismaService) {}

  // ── פרטי גישה (הגדרות) ─────────────────────────────────────────────────────

  /** מחזיר את פרטי הגישה השמורים (הסיסמה מפוענחת). null אם לא הוגדרו. */
  async getCredentials(): Promise<CaspitCredentials | null> {
    const row: any = await this.prisma.systemSetting.findUnique({ where: { key: SETTINGS_KEY } }).catch(() => null);
    const v = row?.value as any;
    if (!v?.userName || !v?.passwordEnc || !v?.osekMorshe) return null;
    let password = '';
    try { password = decryptSecret(v.passwordEnc); } catch { password = ''; }
    if (!password) return null;
    return { userName: String(v.userName), password, osekMorshe: String(v.osekMorshe) };
  }

  /** סטטוס להגדרות (בלי לחשוף סיסמה) — האם מוגדר + שם משתמש/עוסק. */
  async getStatus(): Promise<{ configured: boolean; userName: string; osekMorshe: string }> {
    const row: any = await this.prisma.systemSetting.findUnique({ where: { key: SETTINGS_KEY } }).catch(() => null);
    const v = row?.value as any;
    return {
      configured: !!(v?.userName && v?.passwordEnc && v?.osekMorshe),
      userName: v?.userName ? String(v.userName) : '',
      osekMorshe: v?.osekMorshe ? String(v.osekMorshe) : '',
    };
  }

  /** שמירת פרטי גישה (הסיסמה מוצפנת). אם password ריק — משמרים את הקיימת. */
  async saveCredentials(input: { userName: string; password?: string; osekMorshe: string }): Promise<{ ok: true }> {
    const userName = (input.userName || '').trim();
    const osekMorshe = (input.osekMorshe || '').trim();
    if (!userName || !osekMorshe) throw new BadRequestException('שם משתמש ומספר עוסק מורשה נדרשים');

    const existing: any = await this.prisma.systemSetting.findUnique({ where: { key: SETTINGS_KEY } }).catch(() => null);
    const prev = (existing?.value as any) || {};
    let passwordEnc = prev.passwordEnc;
    if (input.password && input.password.trim()) passwordEnc = encryptSecret(input.password.trim());
    if (!passwordEnc) throw new BadRequestException('סיסמה נדרשת');

    const value = { userName, osekMorshe, passwordEnc };
    await this.prisma.systemSetting.upsert({
      where: { key: SETTINGS_KEY },
      create: { key: SETTINGS_KEY, value },
      update: { value },
    });
    this.tokenCache = null; // פרטים השתנו — לבטל קאש אסימון
    return { ok: true };
  }

  /** בדיקת חיבור: מבקש אסימון ומבצע קריאת בדיקה קטנה. */
  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const token = await this.getToken(true);
      // קריאה קלה לאימות שהאסימון תקף — שליפת דף לקוחות ראשון.
      const r = await fetch(`${CASPIT_BASE}/contacts?page=0`, { headers: { 'Caspit-Token': token } });
      if (!r.ok) return { ok: false, message: `כספית החזירה שגיאה (${r.status})` };
      return { ok: true, message: 'החיבור לכספית תקין' };
    } catch (e: any) {
      return { ok: false, message: e?.message || 'החיבור לכספית נכשל' };
    }
  }

  // ── אסימון ──────────────────────────────────────────────────────────────────

  /** מחזיר אסימון תקף (מהקאש או חדש). force=true מכריח בקשה חדשה. */
  private async getToken(force = false): Promise<string> {
    if (!force && this.tokenCache && Date.now() - this.tokenCache.ts < CaspitService.TOKEN_TTL_MS) {
      return this.tokenCache.token;
    }
    const creds = await this.getCredentials();
    if (!creds) throw new BadRequestException('פרטי הגישה לכספית לא הוגדרו — הגדר אותם במסך ההגדרות');

    const body = new URLSearchParams({
      UserName: creds.userName,
      Password: creds.password,
      OsekMorshe: creds.osekMorshe,
    }).toString();
    const r = await fetch(`${CASPIT_BASE}/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      this.logger.error(`Caspit token failed: ${r.status} ${t.slice(0, 160)}`);
      throw new BadRequestException('קבלת אסימון מכספית נכשלה — בדוק את פרטי הגישה');
    }
    // התשובה היא מחרוזת JSON (אסימון בין מרכאות).
    const raw = (await r.text()).trim();
    const token = raw.replace(/^"+|"+$/g, '');
    if (!token) throw new BadRequestException('כספית לא החזירה אסימון');
    this.tokenCache = { token, ts: Date.now() };
    return token;
  }

  // ── כרטיס לקוח בכספית ────────────────────────────────────────────────────────

  /**
   * ממפה מזהה לקוח שלנו ל-ContactId בכספית. הקידומת מסמנת שהרשומה מגיעה מה-CRM
   * ומונעת התנגשות עם מזהים שכספית מייצרת בעצמה.
   */
  private static contactIdFor(customerId: string): string {
    return `crm-${customerId}`;
  }

  /**
   * כספית מגבילה את DocumentId ל-50 תווים ("The field DocumentId must be a string
   * with a maximum length of 50"). המזהים שלנו הם prefix + uuid(36), כלומר לקידומת
   * נותרו 14 תווים. נכשל כאן במפורש ולא מול ה-API, כדי שקידומת חדשה לא תשבור גבייה.
   */
  private static assertDocumentId(documentId: string): void {
    if (!documentId) throw new BadRequestException('חסר מזהה מסמך');
    if (documentId.length > 50) {
      throw new BadRequestException(
        `מזהה המסמך ארוך מדי (${documentId.length}/50 תווים) — קצר את הקידומת`,
      );
    }
  }

  /** ספרות בלבד — להשוואת טלפונים בלי תלות במקפים/רווחים/קידומת בינלאומית. */
  private static digits(v?: string | null): string {
    const d = String(v ?? '').replace(/[^0-9]/g, '');
    return d.startsWith('972') ? `0${d.slice(3)}` : d;
  }

  /** נרמול שם לצורך התאמה: רווחים כפולים, גרשיים וסימני פיסוק מאבדים משמעות. */
  private static normName(v?: string | null): string {
    return String(v ?? '')
      .replace(/["'`״׳]/g, '')
      .replace(/\(.*?\)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  /**
   * שולף את *כל* אנשי הקשר מכספית (מדפדף בעמודים) ושומר בקאש קצר.
   * ל-API של כספית אין חיפוש: פרמטרים כמו name=/search=/phone= פשוט מתעלמים
   * (נבדק — TotalCount נשאר זהה), ו-GET /contacts/{עוסק מורשה} מחזיר 404.
   * לכן ההתאמה ללקוח קיים מחייבת סריקה מלאה, והקאש מונע לסרוק שוב בכל הנפקה.
   */
  private async listAllContacts(token: string): Promise<any[]> {
    if (this.contactsCache && Date.now() - this.contactsCache.ts < CaspitService.CONTACTS_TTL_MS) {
      return this.contactsCache.rows;
    }
    const rows: any[] = [];
    for (let page = 0; page < CaspitService.MAX_CONTACT_PAGES; page++) {
      const r = await fetch(`${CASPIT_BASE}/contacts?page=${page}`, { headers: { 'Caspit-Token': token } });
      if (!r.ok) break;
      const d: any = await r.json();
      rows.push(...(d?.Results || []));
      if (page + 1 >= Number(d?.TotalPages || 0)) break;
    }
    this.contactsCache = { rows, ts: Date.now() };
    return rows;
  }

  /**
   * מאתר לקוח שכבר קיים בכספית — כזה שנוצר שם ידנית או יובא לפני החיבור, ולכן
   * ה-ContactId שלו אינו `crm-<id>`. בלי זה כל לקוח ותיק היה מקבל כרטיס כפול.
   * סדר ההתאמה מהחזק לחלש: עוסק מורשה → טלפון → שם מנורמל.
   */
  private async findExistingContact(
    token: string,
    customer: CreateInvoiceInput['customer'],
  ): Promise<string | null> {
    const osek = String(customer.osekMorshe ?? '').trim();
    const phone = CaspitService.digits(customer.phone);
    const name = CaspitService.normName(customer.businessName);
    if (!osek && !phone && !name) return null;

    const all = await this.listAllContacts(token);

    if (osek) {
      const hit = all.find((c) => String(c?.OsekMorshe ?? '').trim() === osek);
      if (hit) return String(hit.ContactId);
    }
    if (phone) {
      const hit = all.find((c) =>
        [c?.Phone, c?.Mobile].some((p) => p && CaspitService.digits(p) === phone),
      );
      if (hit) return String(hit.ContactId);
    }
    if (name) {
      // שם בלבד הוא האות החלשה ביותר — דורשים התאמה *יחידה* כדי לא לקשר בטעות
      // שני לקוחות שונים בעלי אותו שם (יש כאלה, ראה כפילויות ב-CRM).
      const hits = all.filter((c) => CaspitService.normName(c?.BusinessName) === name);
      if (hits.length === 1) return String(hits[0].ContactId);
      if (hits.length > 1) {
        this.logger.warn(`Caspit: ${hits.length} contacts named "${customer.businessName}" — not linking by name`);
      }
    }
    return null;
  }

  /**
   * יוצר/מעדכן כרטיס לקוח בכספית ומחזיר את ה-ContactId.
   * POST /contacts עם ContactId משלנו הוא **upsert**: קריאה חוזרת עם אותו מזהה
   * מעדכנת את הרשומה הקיימת (מאומת מול ה-API — נשאר Number זהה ו-TotalCount לא גדל),
   * ולכן אין צורך לחפש קודם אם הלקוח קיים.
   */
  private async upsertContact(
    token: string,
    customer: CreateInvoiceInput['customer'],
  ): Promise<string | null> {
    if (!customer.id) return null;

    // 1) כבר קושר בעבר → משתמשים במזהה השמור ולא נוגעים בכרטיס.
    const saved = await this.getSavedContactId(customer.id);
    if (saved) return saved;

    // 2) לקוח שכבר קיים בכספית מלפני החיבור (נוצר ידנית/יובא) — מקשרים אליו
    //    *בלי* לדרוס את הנתונים שנערכו שם, ושומרים את הקישור להמשך.
    const existing = await this.findExistingContact(token, customer);
    if (existing) {
      await this.saveContactId(customer.id, existing);
      this.logger.log(`Caspit: linked customer ${customer.id} to existing contact ${existing}`);
      return existing;
    }

    // 3) לא קיים → יוצרים כרטיס חדש עם מזהה משלנו.
    const contactId = CaspitService.contactIdFor(customer.id);
    const payload = {
      ContactId: contactId,
      BusinessName: (customer.businessName || 'לקוח').slice(0, 200),
      Name: customer.contactName || null,
      OsekMorshe: customer.osekMorshe || null,
      Address1: customer.address1 || null,
      City: customer.city || null,
      Email: customer.email || null,
      Phone: customer.phone || null,
    };
    const r = await fetch(`${CASPIT_BASE}/contacts/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Caspit-Token': token },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      // לא חוסם את החיוב: עדיף חשבונית לא-מקושרת מאשר גבייה תקועה. נרשם כאזהרה
      // כי המסמך ייווצר בלי כרטיס לקוח, והיתרה בכספית לא תתעדכן.
      this.logger.warn(`Caspit upsertContact failed (${r.status}): ${t.slice(0, 200)}`);
      return null;
    }
    const c: any = await r.json().catch(() => null);
    const created = String(c?.ContactId || contactId);
    await this.saveContactId(customer.id, created);
    return created;
  }

  /** ה-ContactId שנשמר על כרטיס הלקוח, אם כבר נפתר בעבר. */
  private async getSavedContactId(customerId: string): Promise<string | null> {
    try {
      // SQL גולמי — העמודה נוספה ישירות למסד, ולקוח Prisma עשוי להיות מיושן.
      const rows = await this.prisma.$queryRaw<Array<{ caspitContactId: string | null }>>`
        SELECT "caspitContactId" FROM "Customer" WHERE id = ${customerId} LIMIT 1`;
      const v = rows?.[0]?.caspitContactId;
      return v && String(v).trim() ? String(v) : null;
    } catch (e: any) {
      this.logger.warn(`getSavedContactId failed: ${e?.message || e}`);
      return null;
    }
  }

  /** שומר את הקישור לכספית על כרטיס הלקוח. best-effort — לא מפיל הנפקה. */
  private async saveContactId(customerId: string, contactId: string): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        UPDATE "Customer" SET "caspitContactId" = ${contactId} WHERE id = ${customerId}`;
    } catch (e: any) {
      this.logger.warn(`saveContactId failed: ${e?.message || e}`);
    }
  }

  /**
   * "הדפסת" המסמך בכספית — לא הדפסה לנייר אלא הרצת לוגיקת הסגירה: חישוב סופי,
   * נעילת המסמך והחלתו על יתרת הלקוח. **חובה**: מסמך שנוצר ב-POST /documents נשאר
   * טיוטה (Status=0) שאינה משפיעה על הספרים. מאומת מול ה-API: אחרי הקריאה
   * Status עובר 0 → 2 והיתרה בכרטיס הלקוח מתעדכנת.
   */
  private async finalizeDocument(token: string, documentId: string): Promise<boolean> {
    try {
      const url = `${CASPIT_BASE}/PrintDocument/?Token=${encodeURIComponent(token)}&id=${encodeURIComponent(documentId)}`;
      const r = await fetch(url, { method: 'POST' });
      if (!r.ok) {
        const t = await r.text().catch(() => '');
        this.logger.warn(`Caspit finalizeDocument failed (${r.status}): ${t.slice(0, 200)}`);
        return false;
      }
      return true;
    } catch (e: any) {
      this.logger.warn(`Caspit finalizeDocument error: ${e?.message || e}`);
      return false;
    }
  }

  /** שולף מסמך קיים לפי ה-DocumentId שלנו ומחזיר אותו בפורמט התוצאה. null אם אינו קיים. */
  private async fetchDocument(token: string, documentId: string): Promise<CaspitInvoiceResult | null> {
    try {
      const r = await fetch(`${CASPIT_BASE}/documents/${encodeURIComponent(documentId)}`, {
        headers: { 'Caspit-Token': token },
      });
      if (!r.ok) return null;
      const doc: any = await r.json();
      return {
        documentId: String(doc?.DocumentId || documentId),
        number: String(doc?.Number || ''),
        total: Number(doc?.Total || 0),
        linkToPdf: String(doc?.LinkToPdf || '').replace('_REPLACE_WITH_YOUR_TOKEN_', token),
        viewUrl: doc?.ViewUrl || null,
        customerLinked: !!doc?.CustomerId,
        finalized: Number(doc?.Status) === 2,
      };
    } catch {
      return null;
    }
  }

  /**
   * שולח מסמך שכבר קיים בכספית אל הלקוח במייל — כספית מצרפת את ה-PDF ושולחת
   * מהחשבון שלה (POST /EmailDocument/{id}). נשלח רק *אחרי* סגירת המסמך, אחרת
   * הלקוח מקבל טיוטה. best-effort: כשל בשליחה לא מבטל קבלה שכבר נרשמה בספרים.
   */
  private async emailDocument(
    token: string,
    documentId: string,
    opts: { to: string; subject: string; body: string },
  ): Promise<boolean> {
    try {
      const r = await fetch(
        `${CASPIT_BASE}/EmailDocument/${encodeURIComponent(documentId)}?token=${encodeURIComponent(token)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ Subject: opts.subject, To: opts.to, Body: opts.body }),
        },
      );
      if (!r.ok) {
        const t = await r.text().catch(() => '');
        this.logger.warn(`Caspit emailDocument failed (${r.status}) to ${opts.to}: ${t.slice(0, 200)}`);
        return false;
      }
      this.logger.log(`Caspit: document ${documentId} emailed to ${opts.to}`);
      return true;
    } catch (e: any) {
      this.logger.warn(`Caspit emailDocument error: ${e?.message || e}`);
      return false;
    }
  }

  // ── הנפקת חשבונית ────────────────────────────────────────────────────────────

  /**
   * יוצר חשבונית בכספית (TrxTypeId=1) עם שורות המסמך שלנו. מחזיר מספר + קישור PDF.
   * DocumentId = מזהה שלנו (ייחודי) — כספית מאחסנת אותו וממנו אפשר לשלוף שוב.
   */
  async createInvoice(
    input: CreateInvoiceInput,
    kind: 'proforma' | 'invoice' | 'invoiceReceipt' = 'invoice',
  ): Promise<CaspitInvoiceResult> {
    const spec = CASPIT_DOC_KINDS[kind];
    if (!input.lines?.length) throw new BadRequestException(`אין שורות ל${spec.label}`);
    if (spec.hasPayment && !(Number(input.payment?.amount) > 0)) {
      throw new BadRequestException(`${spec.label} מחייבת סכום תשלום שהתקבל`);
    }
    CaspitService.assertDocumentId(input.documentId);
    const token = await this.getToken();

    // כרטיס הלקוח נוצר/מתעדכן *לפני* המסמך, כדי שהחשבונית תתקשר אליו. בלי CustomerId
    // כספית יוצרת מסמך עם שם לקוח כטקסט חופשי בלבד — בלי כרטיס ובלי עדכון יתרה.
    const contactId = await this.upsertContact(token, input.customer);
    // תאריך אחד לכל המסמך — גם ל-Date וגם ל-DueDate של מסמך ששולם במעמד.
    const docDate = new Date().toISOString();

    const payload = {
      DocumentLines: input.lines.map((l, i) => ({
        Number: i + 1,
        ProductName: (l.name || 'שירות').slice(0, 200),
        Details: l.details || '',
        UnitPrice: Number(l.unitPrice) || 0,
        Qty: Number(l.qty) || 1,
        CurrencySymbol: '₪',
        Rate: 1.0,
        Rebate: 0.0,
        ChargeVAT: l.chargeVat !== false,
      })),
      DocumentId: input.documentId,
      TrxTypeId: spec.trxTypeId,
      Date: docDate,
      ...(contactId ? { CustomerId: contactId } : {}),
      CustomerBusinessName: input.customer.businessName || '',
      CustomerOsekMorshe: input.customer.osekMorshe || '',
      CustomerContactName: input.customer.contactName || '',
      CustomerAddress1: input.customer.address1 || '',
      CustomerCity: input.customer.city || '',
      CustomerEmail: input.customer.email || '',
      Details: '',
      Comments: input.comments || '',
      Rebate: 0.0,
      RountTotal: false,
      TaxDeduction: 0.0,
      ReceiptCurrencySymbol: '₪',
      ReceiptRate: 1.0,
      // "חשבונית מס קבלה" נושאת גם את שורת התשלום שהתקבל; שאר הסוגים — ריק.
      ...(spec.hasPayment
        ? {
            Payment: Number(input.payment!.amount),
            ReceiptLines: [
              {
                Number: 1,
                PaymentTypeId: input.payment!.paymentTypeId || CASPIT_PAYMENT_TYPES.OTHER,
                Payment: Number(input.payment!.amount),
                Rate: 1.0,
              },
            ],
          }
        : { ReceiptLines: [] }),
      TrxCodeNumber: spec.trxCodeNumber,
      // תאריך יעד לתשלום. נגזר מתנאי התשלום שנבחרו במסך הגבייה (payment-terms.ts).
      // עד 2026-08 זה היה null קשיח — כלומר כל מסמך יצא בלי מועד תשלום ודוחות
      // הגיול בכספית לא יכלו להראות מה באיחור. null עדיין תקף כשהתנאי לא זוהה,
      // כי מועד מומצא בספרים גרוע ממועד חסר.
      //
      // מסמך שנושא תקבול ("חשבונית מס קבלה") שולם במעמד ההנפקה ואין לו אשראי.
      // שליחת null *לא* מספיקה: כספית ממלאת אז את ברירת המחדל של החשבון
      // (נמדד: שוטף+30 → 30/09) ומציגה מועד תשלום עתידי על מסמך ששולם.
      // לכן מציבים במפורש את תאריך המסמך עצמו — "לתשלום היום".
      DueDate: spec.hasPayment
        ? `${docDate.slice(0, 10)}T00:00:00`
        : input.dueDate ? `${input.dueDate}T00:00:00` : null,
    };

    const r = await fetch(`${CASPIT_BASE}/documents/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Caspit-Token': token },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      // DocumentId נגזר מההצעה, ולכן לחיצה שנייה על "הפק חשבונית" שולחת את אותו מזהה.
      // כספית מסרבת (400) — טוב, כך לא נוצרת חשבונית כפולה — אבל זו אינה תקלה: המסמך
      // כבר קיים. שולפים אותו ומחזירים אותו כהצלחה עם alreadyIssued, במקום להבהיל
      // את המשתמש ב-"ההנפקה נכשלה" על חשבונית שהונפקה בהצלחה קודם.
      if (r.status === 400 && /exists in Caspit|הודפס/i.test(t)) {
        const existing = await this.fetchDocument(token, input.documentId);
        if (existing) {
          this.logger.log(`Caspit: ${spec.label} ${existing.number} already issued for ${input.documentId}`);
          return { ...existing, alreadyIssued: true };
        }
      }
      this.logger.error(`Caspit create ${kind} failed: ${r.status} ${t.slice(0, 300)}`);
      throw new BadRequestException(`הנפקת ${spec.label} בכספית נכשלה (${r.status})`);
    }
    const doc: any = await r.json();
    // סגירת המסמך — בלעדיה נשארת טיוטה שלא נכנסת לספרים ולא מעדכנת יתרה.
    const finalized = await this.finalizeDocument(token, String(doc?.DocumentId || input.documentId));
    const linkToPdf = String(doc?.LinkToPdf || '').replace('_REPLACE_WITH_YOUR_TOKEN_', token);
    return {
      documentId: String(doc?.DocumentId || input.documentId),
      number: String(doc?.Number || ''),
      total: Number(doc?.Total || 0),
      linkToPdf,
      viewUrl: doc?.ViewUrl || null,
      customerLinked: !!contactId,
      finalized,
    };
  }

  /**
   * מנפיק **קבלה** (TrxTypeId=2) על תשלום שהתקבל, וסוגר אותה.
   * בלי קבלה החשבונית נשארת פתוחה ביתרת הלקוח בכספית גם אחרי שהוא שילם.
   * אומת מול ה-API: יתרת לקוח 550- → 0 אחרי הנפקה + סגירה.
   */
  async createReceipt(input: CreateReceiptInput): Promise<CaspitInvoiceResult> {
    const amount = Number(input.amount) || 0;
    if (amount <= 0) throw new BadRequestException('סכום הקבלה חייב להיות גדול מאפס');
    CaspitService.assertDocumentId(input.documentId);
    const token = await this.getToken();
    const contactId = await this.upsertContact(token, input.customer);
    const docDate = new Date().toISOString();

    const payload = {
      DocumentId: input.documentId,
      TrxTypeId: TRX_TYPE_RECEIPT,
      Date: docDate,
      // קבלה מתעדת כסף שכבר התקבל — אין לה מועד תשלום עתידי. השמטת DueDate
      // *לא* מספיקה: כספית ממלאת אז את ברירת המחדל של החשבון (נמדד: כל
      // הקבלות יצאו עם 30/09). מציבים את תאריך הקבלה עצמו.
      DueDate: `${docDate.slice(0, 10)}T00:00:00`,
      ...(contactId ? { CustomerId: contactId } : {}),
      CustomerBusinessName: input.customer.businessName || '',
      CustomerOsekMorshe: input.customer.osekMorshe || '',
      CustomerEmail: input.customer.email || '',
      Payment: amount,
      ReceiptLines: [
        {
          Number: 1,
          PaymentTypeId: input.paymentTypeId || CASPIT_PAYMENT_TYPES.OTHER,
          Payment: amount,
          Rate: 1.0,
        },
      ],
      ReceiptCurrencySymbol: '₪',
      ReceiptRate: 1.0,
      TrxCodeNumber: TRX_CODE_RECEIPT,
      Details: '',
      Comments: input.comments || '',
    };

    const r = await fetch(`${CASPIT_BASE}/documents/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Caspit-Token': token },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      // אותה התנהגות כמו בחשבונית: DocumentId נגזר מההצעה, ולכן לחיצה שנייה
      // מוחזרת כ-400 ומשמעותה "כבר הונפקה", לא תקלה.
      if (r.status === 400 && /exists in Caspit|הודפס/i.test(t)) {
        const existing = await this.fetchDocument(token, input.documentId);
        if (existing) return { ...existing, alreadyIssued: true };
      }
      this.logger.error(`Caspit createReceipt failed: ${r.status} ${t.slice(0, 300)}`);
      throw new BadRequestException(`הנפקת הקבלה בכספית נכשלה (${r.status})`);
    }
    const doc: any = await r.json();
    const documentId = String(doc?.DocumentId || input.documentId);
    const finalized = await this.finalizeDocument(token, documentId);

    // המסמך *לא* נשלח כאן. שליחה ללקוח היא פעולה נפרדת ומאושרת (sendDocumentEmail),
    // כדי שלא ייצא מייל ללקוח בלי שהמשתמש אישר במפורש.
    return {
      documentId,
      number: String(doc?.Number || ''),
      total: Number(doc?.Payment || amount),
      linkToPdf: String(doc?.LinkToPdf || '').replace('_REPLACE_WITH_YOUR_TOKEN_', token),
      viewUrl: doc?.ViewUrl || null,
      customerLinked: !!contactId,
      finalized,
    };
  }

  // ── הכנסות בפועל ─────────────────────────────────────────────────────────────

  /** שיעור המע"מ הנוכחי לפי כספית (18% נכון ל-2025). ברירת מחדל 18 אם השליפה נכשלה. */
  private async getVatRate(token: string): Promise<number> {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const r = await fetch(`${CASPIT_BASE}/VatRate?token=${encodeURIComponent(token)}&date=${today}`, {
        headers: { Accept: 'application/json' },
      });
      if (!r.ok) return 18;
      const d: any = await r.json();
      const v = Number(d?.Results?.[0]?.VatRatePercent);
      return Number.isFinite(v) && v > 0 ? v : 18;
    } catch {
      return 18;
    }
  }

  /**
   * שולף מסמכים מסוג נתון שנוצרו מ-`since` ואילך.
   * ל-`/documents` יש סינון לפי `trxtypeid` אבל **לא לפי תאריך** (נבדק — פרמטרי
   * תאריך מתעלמים), והמסמכים מוחזרים מהישן לחדש. לכן מדפדפים מהעמוד האחרון אחורה
   * ועוצרים ברגע שעמוד שלם ישן מהתקופה — במקום לסרוק את כל ההיסטוריה.
   */
  private async fetchDocumentsSince(token: string, trxTypeId: number, sinceYmd: string): Promise<any[]> {
    const H = { 'Caspit-Token': token };
    const first = await fetch(`${CASPIT_BASE}/documents?trxtypeid=${trxTypeId}&page=0`, { headers: H });
    if (!first.ok) return [];
    const head: any = await first.json();
    const totalPages = Number(head?.TotalPages || 0);
    if (!totalPages) return [];

    const out: any[] = [];
    for (let page = totalPages - 1; page >= 0; page--) {
      const r =
        page === 0
          ? { ok: true, json: async () => head }
          : await fetch(`${CASPIT_BASE}/documents?trxtypeid=${trxTypeId}&page=${page}`, { headers: H });
      if (!r.ok) break;
      const d: any = await r.json();
      const rows: any[] = d?.Results || [];
      // כספית מחזירה תאריך נאיבי ("2026-08-05T00:00:00") בלי אזור זמן. השוואת
      // מחרוזת YYYY-MM-DD נמנעת מהסטה של גבול החודש בין UTC (השרת) לשעון ישראל.
      const inRange = rows.filter((x) => x?.Date && String(x.Date).slice(0, 10) >= sinceYmd);
      out.push(...inRange);
      // עמוד שכולו לפני תחילת התקופה → כל הקודמים ישנים עוד יותר.
      if (rows.length > 0 && inRange.length === 0) break;
    }
    return out;
  }

  /**
   * כל המסמכים שהונפקו בכספית עבור לקוח מסוים — הבסיס לטאב "חשבוניות/קבלות"
   * בכרטיס הלקוח.
   *
   * כספית לא מציעה סינון לפי לקוח ב-GET /documents (הפרמטרים הנתמכים הם
   * trxtypeid + page), ולכן הסינון נעשה כאן לפי ה-ContactId ששמור על כרטיס
   * הלקוח. מדפדפים מהעמוד האחרון אחורה — המסמכים מוחזרים מהישן לחדש, וללקוח
   * מסוים מעניינים בעיקר האחרונים — ועוצרים אחרי `maxPages` עמודים לכל סוג כדי
   * שטאב בכרטיס לקוח לא יגרור סריקה של כל ההיסטוריה.
   *
   * לקוח שאין לו ContactId שמור מעולם לא הונפק לו מסמך מה-CRM → רשימה ריקה,
   * בלי לפנות לכספית בכלל.
   */
  async listCustomerDocuments(
    customerId: string,
    opts: { maxPagesPerType?: number } = {},
  ): Promise<{
    configured: boolean;
    contactId: string | null;
    documents: Array<{
      documentId: string;
      number: string;
      kind: CaspitDocKind | null;
      kindLabel: string;
      trxTypeId: number;
      date: string | null;
      dueDate: string | null;
      total: number;
      payment: number;
      vat: number;
      finalized: boolean;
      linkToPdf: string | null;
      isPaidDoc: boolean;
    }>;
  }> {
    const contactId = await this.getSavedContactId(customerId);
    if (!contactId) {
      // לא שגיאה: פשוט מעולם לא הונפק לו מסמך דרכנו.
      return { configured: (await this.getStatus()).configured, contactId: null, documents: [] };
    }

    const token = await this.getToken();
    const H = { 'Caspit-Token': token };
    const maxPages = Math.max(1, opts.maxPagesPerType ?? 3);

    const byTrxType = new Map<number, CaspitDocKind>();
    for (const [kind, spec] of Object.entries(CASPIT_DOC_KINDS)) {
      byTrxType.set(spec.trxTypeId, kind as CaspitDocKind);
    }

    const rows: any[] = [];
    for (const [kind, spec] of Object.entries(CASPIT_DOC_KINDS)) {
      void kind;
      try {
        const first = await fetch(`${CASPIT_BASE}/documents?trxtypeid=${spec.trxTypeId}&page=0`, { headers: H });
        if (!first.ok) continue;
        const head: any = await first.json();
        const totalPages = Number(head?.TotalPages || 0);
        if (!totalPages) continue;

        let scanned = 0;
        for (let page = totalPages - 1; page >= 0 && scanned < maxPages; page--, scanned++) {
          const d: any =
            page === 0
              ? head
              : await (await fetch(`${CASPIT_BASE}/documents?trxtypeid=${spec.trxTypeId}&page=${page}`, { headers: H })).json();
          for (const r of (d?.Results as any[]) || []) {
            // כספית מחזירה את מזהה הלקוח על המסמך כ-CustomerId.
            if (String(r?.CustomerId ?? '') === contactId) rows.push(r);
          }
        }
      } catch (e: any) {
        this.logger.warn(`Caspit listCustomerDocuments (trxType ${spec.trxTypeId}) failed: ${e?.message || e}`);
      }
    }

    const documents = rows
      .map((r) => {
        const trxTypeId = Number(r?.TrxTypeId ?? 0);
        const kind = byTrxType.get(trxTypeId) ?? null;
        return {
          documentId: String(r?.DocumentId ?? ''),
          number: String(r?.Number ?? ''),
          kind,
          kindLabel: kind ? CASPIT_DOC_KINDS[kind].label : `סוג ${trxTypeId}`,
          trxTypeId,
          date: r?.Date ? String(r.Date).slice(0, 10) : null,
          dueDate: r?.DueDate ? String(r.DueDate).slice(0, 10) : null,
          total: Number(r?.Total ?? 0) || 0,
          payment: Number(r?.Payment ?? 0) || 0,
          vat: Number(r?.Vat ?? 0) || 0,
          finalized: Number(r?.Status) === 2,
          linkToPdf: r?.LinkToPdf
            ? String(r.LinkToPdf).replace('_REPLACE_WITH_YOUR_TOKEN_', token)
            : null,
          isPaidDoc: PAID_DOC_TYPES.includes(trxTypeId),
        };
      })
      // החדש למעלה — זה מה שמעניין בכרטיס לקוח.
      .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')));

    return { configured: true, contactId, documents };
  }

  /**
   * "הכנסות בפועל" — כסף שהתקבל, מתוך כספית עצמה (לא מהצעות המחיר אצלנו).
   * נספרים מסמכי קבלה (2) וחשבונית מס קבלה (7) לפי שדה ה-Payment.
   *
   * מע"מ: לחשבונית מס קבלה כספית מחזירה Vat מפורש. לקבלה עצמאית אין מע"מ על המסמך
   * (המע"מ נרשם על החשבונית שקדמה לה), ולכן הוא **נגזר** מהתקבול לפי השיעור הנוכחי
   * — ומסומן ככזה בתשובה, כדי שלא ייחשב לדיווח מע"מ רשמי.
   */
  async getRealIncome(period: 'month' | 'quarter' | 'year' = 'month'): Promise<{
    period: string;
    from: string;
    vatRate: number;
    totalReceived: number;
    vatDerived: number;
    netIncome: number;
    byType: Array<{ trxTypeId: number; label: string; count: number; amount: number }>;
    byMonth: Array<{ month: string; amount: number }>;
    documents: Array<{
      number: string; date: string; customer: string; amount: number; trxTypeId: number; label: string;
    }>;
  }> {
    const token = await this.getToken();
    // גבול התקופה נגזר מהתאריך הקלנדרי בישראל (השרת רץ ב-UTC), ומוחזק כמחרוזת
    // YYYY-MM-DD כדי להשוות מול התאריכים הנאיביים של כספית בלי הסטת אזור זמן.
    const ymdIsrael = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    const [y, m] = ymdIsrael.split('-').map(Number);
    const p2 = (n: number) => String(n).padStart(2, '0');
    const from =
      period === 'year' ? `${y}-01-01`
      : period === 'quarter' ? `${y}-${p2(Math.floor((m - 1) / 3) * 3 + 1)}-01`
      : `${y}-${p2(m)}-01`;

    const vatRate = await this.getVatRate(token);
    const labelOf = (t: number) =>
      Object.values(CASPIT_DOC_KINDS).find((k) => k.trxTypeId === t)?.label || `סוג ${t}`;

    const all: any[] = [];
    for (const t of PAID_DOC_TYPES) {
      all.push(...(await this.fetchDocumentsSince(token, t, from)));
    }

    const amountOf = (d: any) => Number(d?.Payment ?? 0) || 0;
    const totalReceived = all.reduce((a, d) => a + amountOf(d), 0);
    // מע"מ: מפורש כשקיים (חשבונית מס קבלה), אחרת נגזר מהתקבול כולל מע"מ.
    const vatDerived = all.reduce((a, d) => {
      const explicit = Number(d?.Vat ?? 0) || 0;
      if (explicit > 0) return a + explicit;
      const paid = amountOf(d);
      return a + paid * (vatRate / (100 + vatRate));
    }, 0);

    const byTypeMap = new Map<number, { count: number; amount: number }>();
    for (const d of all) {
      const t = Number(d.TrxTypeId);
      const e = byTypeMap.get(t) || { count: 0, amount: 0 };
      e.count++; e.amount += amountOf(d);
      byTypeMap.set(t, e);
    }

    const byMonthMap = new Map<string, number>();
    for (const d of all) {
      const m = String(d.Date).slice(0, 7); // YYYY-MM
      byMonthMap.set(m, (byMonthMap.get(m) || 0) + amountOf(d));
    }

    const round2 = (n: number) => Math.round(n * 100) / 100;
    return {
      period,
      from,
      vatRate,
      totalReceived: round2(totalReceived),
      vatDerived: round2(vatDerived),
      netIncome: round2(totalReceived - vatDerived),
      byType: [...byTypeMap.entries()]
        .map(([trxTypeId, e]) => ({ trxTypeId, label: labelOf(trxTypeId), count: e.count, amount: round2(e.amount) }))
        .sort((a, b) => b.amount - a.amount),
      byMonth: [...byMonthMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))
        .map(([month, amount]) => ({ month, amount: round2(amount) })),
      documents: all
        .sort((a, b) => String(b.Date).localeCompare(String(a.Date)))
        .slice(0, 100)
        .map((d) => ({
          number: String(d.Number || ''),
          date: String(d.Date || ''),
          customer: String(d.CustomerBusinessName || ''),
          amount: round2(amountOf(d)),
          trxTypeId: Number(d.TrxTypeId),
          label: labelOf(Number(d.TrxTypeId)),
        })),
    };
  }

  /**
   * שולח מסמך שכבר הונפק אל הלקוח במייל. נקרא **רק** אחרי אישור מפורש של המשתמש
   * במסך — אין שום מסלול ששולח אוטומטית.
   */
  async sendDocumentEmail(input: {
    documentId: string;
    to: string;
    /** שם המסמך בעברית לנושא/גוף המייל (למשל "חשבונית מס קבלה"). */
    label: string;
    number?: string | null;
    amount?: number | null;
    toName?: string | null;
  }): Promise<{ sent: boolean; to: string }> {
    const to = String(input.to || '').trim();
    if (!to.includes('@')) throw new BadRequestException('כתובת מייל לא תקינה');
    CaspitService.assertDocumentId(input.documentId);
    const token = await this.getToken();

    const label = input.label || 'מסמך';
    const number = String(input.number || '').trim();
    const greeting = input.toName ? `שלום ${input.toName},` : 'שלום,';
    const amountLine =
      input.amount && input.amount > 0
        ? ` על סך ${Number(input.amount).toLocaleString('he-IL')} ₪`
        : '';
    const sent = await this.emailDocument(token, input.documentId, {
      to,
      subject: `${label}${number ? ` ${number}` : ''} — גלית, החברה לאיכות הסביבה`,
      body:
        `${greeting}\n\n` +
        `מצורפת ${label}${number ? ` ${number}` : ''}${amountLine}.\n` +
        `תודה על שיתוף הפעולה.\n\n` +
        `גלית – החברה לאיכות הסביבה`,
    });
    if (!sent) throw new BadRequestException('שליחת המסמך במייל נכשלה');
    return { sent: true, to };
  }
}
