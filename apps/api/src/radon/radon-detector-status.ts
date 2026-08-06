/**
 * מכונת המצבים של גלאי ראדון (סעיף 7 במסמך האפיון).
 *
 * הסטטוסים מתארים "חיי הגלאי" — המחזור השני שהמערכת מנהלת במקביל לעבודה מול
 * הלקוח. הקובץ טהור (בלי DB) כדי שיהיה ניתן לבדיקה.
 */

export const RADON_DETECTOR_STATUSES = [
  'IN_STOCK', 'RESERVED', 'WITH_EMPLOYEE', 'SHIPPED_TO_CLIENT', 'WITH_CLIENT',
  'DEPLOYED', 'COLLECTED', 'RETURNED', 'SENT_TO_LAB', 'RESULT_RECEIVED',
  'CLOSED', 'LOST', 'DISQUALIFIED',
] as const;

export type RadonDetectorStatusId = (typeof RADON_DETECTOR_STATUSES)[number];

/** תוויות עבריות — לתצוגה בממשק ובהודעות הבוט. */
export const DETECTOR_STATUS_LABELS: Record<RadonDetectorStatusId, string> = {
  IN_STOCK: 'במלאי',
  RESERVED: 'שמור לעבודה',
  WITH_EMPLOYEE: 'אצל עובד',
  SHIPPED_TO_CLIENT: 'נשלח ללקוח',
  WITH_CLIENT: 'אצל לקוח',
  DEPLOYED: 'הוצב בשטח',
  COLLECTED: 'נאסף',
  RETURNED: 'חזר למשרד',
  SENT_TO_LAB: 'נשלח לאנליזה',
  RESULT_RECEIVED: 'תוצאה התקבלה',
  CLOSED: 'סגור',
  LOST: 'אבד',
  DISQUALIFIED: 'נפסל',
};

/**
 * מעברים מותרים בין סטטוסים.
 *
 * שני מסלולים מקבילים מ-RESERVED, לפי אופן הביצוע:
 *   בודק מגיע  : RESERVED → WITH_EMPLOYEE → DEPLOYED → COLLECTED → RETURNED
 *   עצמי במשלוח: RESERVED → SHIPPED_TO_CLIENT → WITH_CLIENT → DEPLOYED → RETURNED
 *
 * LOST ו-DISQUALIFIED נגישים כמעט מכל מצב — תקלה יכולה לקרות בכל שלב.
 */
const TRANSITIONS: Record<RadonDetectorStatusId, readonly RadonDetectorStatusId[]> = {
  IN_STOCK:          ['RESERVED', 'WITH_EMPLOYEE', 'SENT_TO_LAB', 'LOST', 'DISQUALIFIED'],
  RESERVED:          ['IN_STOCK', 'WITH_EMPLOYEE', 'SHIPPED_TO_CLIENT', 'LOST', 'DISQUALIFIED'],
  WITH_EMPLOYEE:     ['DEPLOYED', 'IN_STOCK', 'RESERVED', 'LOST', 'DISQUALIFIED'],
  SHIPPED_TO_CLIENT: ['WITH_CLIENT', 'LOST', 'DISQUALIFIED'],
  WITH_CLIENT:       ['DEPLOYED', 'RETURNED', 'LOST', 'DISQUALIFIED'],
  DEPLOYED:          ['COLLECTED', 'RETURNED', 'LOST', 'DISQUALIFIED'],
  COLLECTED:         ['RETURNED', 'SENT_TO_LAB', 'LOST', 'DISQUALIFIED'],
  RETURNED:          ['SENT_TO_LAB', 'IN_STOCK', 'DISQUALIFIED', 'LOST'],
  SENT_TO_LAB:       ['RESULT_RECEIVED', 'LOST', 'DISQUALIFIED'],
  RESULT_RECEIVED:   ['CLOSED', 'DISQUALIFIED'],
  CLOSED:            ['IN_STOCK'],           // גלאי רב-פעמי חוזר למלאי אחרי כיול
  LOST:              ['IN_STOCK'],           // נמצא
  DISQUALIFIED:      [],                     // סוף הדרך
};

/** האם המעבר בין הסטטוסים מותר. */
export function canTransition(
  from: RadonDetectorStatusId,
  to: RadonDetectorStatusId,
): boolean {
  if (from === to) return true;
  return (TRANSITIONS[from] ?? []).includes(to);
}

/** הסטטוסים שאליהם ניתן לעבור מהמצב הנוכחי — להצגה בממשק. */
export function allowedNextStatuses(
  from: RadonDetectorStatusId,
): readonly RadonDetectorStatusId[] {
  return TRANSITIONS[from] ?? [];
}

/**
 * סטטוסים שבהם הגלאי תפוס ולא ניתן לשייך אותו לעבודה חדשה.
 * משמש לבדיקת זמינות לפני שיוך (בנוסף לאינדקס הייחודי ב-DB).
 *
 * RETURNED נחשב תפוס בכוונה: הגלאי אמנם פיזית במשרד, אבל התוצאה שלו עדיין
 * שייכת לעבודה שממנה חזר וטרם עברה אנליזה. שיוך מחדש בשלב הזה היה מנתק את
 * העבודה מהתוצאה. הוא משתחרר רק אחרי RESULT_RECEIVED/CLOSED או חזרה ל-IN_STOCK.
 */
const BUSY: readonly RadonDetectorStatusId[] = [
  'RESERVED', 'WITH_EMPLOYEE', 'SHIPPED_TO_CLIENT', 'WITH_CLIENT',
  'DEPLOYED', 'COLLECTED', 'RETURNED', 'SENT_TO_LAB',
];

export function isBusyStatus(status: RadonDetectorStatusId): boolean {
  return BUSY.includes(status);
}

/** סטטוסים שבהם הגלאי אינו שמיש כלל. */
export function isUnusableStatus(status: RadonDetectorStatusId): boolean {
  return status === 'LOST' || status === 'DISQUALIFIED';
}

/** האם הגלאי זמין לשיוך לעבודה חדשה. */
export function isAvailableForAssignment(status: RadonDetectorStatusId): boolean {
  return !isBusyStatus(status) && !isUnusableStatus(status);
}
