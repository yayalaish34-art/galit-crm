/**
 * מבנה ה-metadata שהתוסף שולח (כ-JSON בתוך multipart). כל השדות אופציונליים
 * להגנה — השרת מנרמל ומחיל ברירות מחדל. הזהות של העובד *לא* נלקחת מכאן אלא מה-JWT.
 */
export interface OutlookRecipient {
  name?: string;
  email?: string;
}

export interface OutlookImportMetadata {
  source?: string;
  /**
   * כיוון המייל. INCOMING (ברירת מחדל) — הלקוח הוא השולח.
   * OUTGOING — מייל שנכתב/נשלח על ידינו, ולכן הלקוח נמצא בצד הנמענים.
   * הכיוון קובע לפי מי משויכת הבקשה לכרטיס לקוח.
   */
  direction?: 'INCOMING' | 'OUTGOING';
  /**
   * תיוק ידני: מזהה לקוח שהעובד בחר בחלון הצד (חיפוש לפי שם/טלפון/מייל).
   * כשקיים — עוקף את השיוך האוטומטי; אם המייל כבר תויק לכרטיס אחר, הבקשה
   * (והמסמכים שלה) מועברת לכרטיס הנבחר במקום להחזיר כפילות.
   */
  customerId?: string | null;
  subject?: string;
  senderName?: string | null;
  senderEmail?: string | null;
  to?: OutlookRecipient[];
  cc?: OutlookRecipient[];
  receivedAt?: string | null;
  sentAt?: string | null;
  bodyHtml?: string;
  bodyText?: string;
  outlookItemId?: string | null;
  internetMessageId?: string | null;
  conversationId?: string | null;
  mailboxEmail?: string | null;
  hasAttachments?: boolean;
  attachments?: Array<{ id: string; name: string; size: number; contentType: string | null; isInline: boolean }>;
  emlArchived?: boolean;
}

export interface OutlookImportResult {
  success: boolean;
  duplicate?: boolean;
  /** true כשבקשה קיימת הועברה לכרטיס אחר בעקבות תיוק ידני. */
  moved?: boolean;
  requestId?: string;
  requestNumber?: string;
  requestUrl?: string;
  customerId?: string;
  /** שם הלקוח שאליו תויקה הבקשה (נשלח רק בתיוק ידני — לתצוגה בתוסף). */
  customerName?: string;
  message?: string;
  errorCode?: string;
}
