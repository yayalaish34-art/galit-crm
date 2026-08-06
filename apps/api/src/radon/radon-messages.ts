/**
 * תבניות ההודעות של שירות ראדון (סעיף 8 במסמך האפיון).
 *
 * הטקסטים נשלחים ללקוח (בדיקה עצמית) ולעובד (הצבה/איסוף). התבניות מוחזרות
 * כטקסט מוכן, כדי שהבוט/המייל רק ישלחו אותן.
 */

export type RadonMessageContext = {
  customerName?: string | null;
  address?: string | null;
  testTypeLabel?: string | null;
  purposeLabel?: string | null;
  detectorCount?: number | null;
  serialNumbers?: string[];
};

const greet = (name?: string | null) => `שלום ${name?.trim() || ''},`.replace(/\s+,/, ',');

/** הודעות ללקוח — מסלול בדיקה עצמית. */
export const clientMessages = {
  /** אחרי תשלום */
  afterPayment: (c: RadonMessageContext) => [
    greet(c.customerName),
    'התשלום התקבל ואנו מכינים עבורך ערכת בדיקת ראדון.',
    '',
    'לאחר הצבת הגלאים, נא לעדכן:',
    '1. תאריך הצבה',
    '2. מיקום כל גלאי',
    '3. תמונה של כל גלאי במקום ההצבה',
  ].join('\n'),

  /** אם הלקוח לא דיווח הצבה */
  placementNotReported: (c: RadonMessageContext) => [
    greet(c.customerName),
    'רצינו לוודא האם ערכת בדיקת הראדון התקבלה והאם הגלאים הוצבו.',
    '',
    'כדי שנוכל לעקוב אחר תקופת הבדיקה, נא לעדכן אותנו בתאריך ההצבה ובמיקום כל גלאי.',
  ].join('\n'),

  /** לקראת סיום תקופת הבדיקה */
  nearingEnd: (c: RadonMessageContext) => [
    greet(c.customerName),
    'תקופת בדיקת הראדון מתקרבת לסיום.',
    '',
    'נא להכין את הגלאים להחזרה בהתאם להנחיות.',
    'לאחר שליחת הגלאים חזרה אלינו, נא לשלוח מספר מעקב.',
  ].join('\n'),

  /** אחרי קבלת גלאים */
  detectorsReceived: (c: RadonMessageContext) => [
    greet(c.customerName),
    'הגלאים התקבלו אצלנו והועברו לאנליזה.',
    '',
    'לאחר קבלת התוצאות נעדכן ונשלח את הדוח.',
  ].join('\n'),
};

/** הודעות לעובד — הצבה ואיסוף. */
export const employeeMessages = {
  /** לפני הצבה */
  beforePlacement: (c: RadonMessageContext) => [
    'תזכורת: מחר יש הצבת גלאי ראדון.',
    '',
    `לקוח: ${c.customerName ?? '—'}`,
    `כתובת: ${c.address ?? '—'}`,
    `סוג בדיקה: ${c.testTypeLabel ?? '—'}`,
    `מטרת בדיקה: ${c.purposeLabel ?? '—'}`,
    `מספר גלאים: ${c.detectorCount ?? '—'}`,
    '',
    'נא לוודא:',
    '- לקיחת הגלאים הנכונים',
    '- תיעוד מספרי גלאים',
    '- רישום מיקום לכל גלאי',
    '- צילום הגלאים במקום ההצבה',
    '- עדכון סטטוס בסיום',
  ].join('\n'),

  /** לפני איסוף */
  beforeCollection: (c: RadonMessageContext) => [
    `תזכורת: יש לאסוף גלאי ראדון אצל ${c.customerName ?? '—'}.`,
    '',
    `כתובת: ${c.address ?? '—'}`,
    `מספר גלאים לאיסוף: ${c.detectorCount ?? c.serialNumbers?.length ?? '—'}`,
    `מספרי גלאים: ${c.serialNumbers?.length ? c.serialNumbers.join(', ') : '—'}`,
    '',
    'נא לוודא שכל הגלאים נאספו ולעדכן חריגות אם היו.',
  ].join('\n'),
};

/** השאלות שהבוט שואל את העובד בסיום הצבה. */
export const PLACEMENT_DEBRIEF_QUESTIONS: readonly string[] = [
  'האם כל הגלאים הוצבו?',
  'כמה גלאים הוצבו בפועל?',
  'נא להזין מספר גלאי לכל מיקום.',
  'האם היו חריגות?',
  'מה תאריך האיסוף המתוכנן?',
];
