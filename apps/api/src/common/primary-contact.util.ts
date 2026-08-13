import { formatIsraeliPhone } from './phone.util';

/**
 * יצירת איש הקשר הראשי של לקוח, אוטומטית, ברגע שהלקוח נפתח.
 *
 * **הבאג שזה מתקן:** פרטי איש הקשר נשמרו רק כשדות שטוחים על `Customer`
 * (`contactName` / `phone` / `email`), ואף מסלול יצירה לא כתב שורה ל-
 * `CustomerContact`. התוצאה: לקוח שנפתח מהמסך "לקוח חדש" — פרטי או חברה —
 * הגיע לכרטיס עם טאב "אנשי קשר" ריק, וכל מסך שנשען על אנשי הקשר (הצעת מחיר,
 * הזמנה, בחירת נמען למייל) לא הציג אף אחד לבחירה. בפנייה של חברה זה בלט
 * במיוחד: איש הקשר שנמסר בשיחה פשוט לא היה קיים כישות.
 *
 * לכן זו פונקציה משותפת ולא מתודה בשירות אחד — היא נקראת מכל מסלול שיוצר
 * לקוח (CustomersService.create, שדרכו עוברים גם resolve/הצינור/הבוט, וגם
 * LeadsService.convertToCustomer שכותב ישירות דרך Prisma).
 */

/**
 * מזהה קבוע לאיש הקשר שנוצר אוטומטית. הוא קבוע (ולא אקראי כמו ב-createContact)
 * כדי שהאילוץ ‎@@unique([customerId, importLegacyId])‎ ייתן אידמפוטנטיות בחינם:
 * קריאה שנייה על אותו לקוח תיפול על P2002 במקום ליצור כפילות.
 */
export const AUTO_PRIMARY_CONTACT_KEY = 'auto-primary';

/** שמות שאינם זהות אמיתית — אין טעם לפתוח עבורם איש קשר. */
const GENERIC_NAMES = new Set(['לקוח חדש', 'לקוח', 'ללא שם', 'טסט', 'test', 'איש קשר']);

export type PrimaryContactSource = {
  /** שם איש הקשר כפי שהוזן. בלקוח פרטי זה בדרך כלל שם הלקוח עצמו. */
  contactName?: string | null;
  /** שם הלקוח — משמש כנפילה-חזרה כשלא נמסר שם איש קשר. */
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  address?: string | null;
};

const clean = (v: unknown) => (v ?? '').toString().trim();
const normalize = (v: unknown) => clean(v).toLowerCase().replace(/[\s-]/g, '');

/**
 * יוצר איש קשר ראשי ללקוח, אם יש ממה. מחזיר את השורה שנוצרה, או null אם
 * לא היה מידע מספיק / כבר קיים איש קשר תואם.
 *
 * לעולם לא זורק: פתיחת לקוח לא תיכשל בגלל איש קשר. הקורא מחליט אם לתעד.
 */
export async function ensurePrimaryContact(
  prisma: any,
  customerId: string,
  src: PrimaryContactSource,
): Promise<{ id: string } | null> {
  try {
    if (!customerId) return null;

    const rawName = clean(src.contactName) || clean(src.name);
    const fullName = GENERIC_NAMES.has(rawName.toLowerCase()) ? '' : rawName;
    const phone = formatIsraeliPhone(src.phone);
    const email = clean(src.email).toLowerCase();

    // בלי שם, בלי טלפון ובלי מייל אין כאן איש קשר — רק רשומה ריקה שתפריע.
    if (!fullName && !phone && !email) return null;

    // דדופ מול מה שכבר קיים: הצינור שומר אנשי קשר בעצמו
    // (persistTaskContactsToCustomer), ולקוח שנפתר ל-resolve עשוי כבר להחזיק
    // אותו אדם. השוואה מנורמלת על שם+טלפון, בדיוק כמו בצד הלקוח.
    const existing = await prisma.customerContact.findMany({
      where: { customerId },
      select: { id: true, fullName: true, phone: true, mobile: true },
    });
    const wanted = `${normalize(fullName)}|${normalize(phone)}`;
    const already = existing.some(
      (c: any) => `${normalize(c.fullName)}|${normalize(c.phone || c.mobile)}` === wanted,
    );
    if (already) return null;

    return await prisma.customerContact.create({
      data: {
        customerId,
        importLegacyId: AUTO_PRIMARY_CONTACT_KEY,
        fullName: fullName || 'איש קשר',
        phone,
        mobile: '',
        fax: '',
        email,
        address: clean(src.address),
        city: clean(src.city),
        zip: '',
        roleTitle: null,
        department: null,
        // ראשי רק כשזה איש הקשר הראשון של הלקוח.
        isPrimary: existing.length === 0,
        isActive: true,
        notes: null,
      },
      select: { id: true },
    });
  } catch {
    // כולל P2002 (כבר נוצר איש קשר אוטומטי ללקוח הזה) — שקט בכוונה.
    return null;
  }
}
