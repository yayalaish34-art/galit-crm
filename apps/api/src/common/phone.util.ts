/**
 * עיצוב מספר טלפון ישראלי בצד השרת — תאום מלא ל-apps/web/app/lib/phone-format.ts.
 *
 * למה גם בשרת: לא כל מספר עובר דרך שדה בטופס. מספרים נכנסים גם מפענוח מיילי לידים,
 * מבוט הוואטסאפ, מייבוא קבצים ומטפסים חיצוניים (פורטל השותפים). כדי ש"כל מספר
 * שנשמר אוטומטית יישמר עם מקף" צריך לנרמל בנקודת הכתיבה, לא רק בשדה קלט.
 *
 * העיקרון זהה לצד הלקוח: לעולם לא מאבדים את מה שהוזן. קלט חלקי, פורמט לא מוכר
 * או טקסט חופשי — חוזרים בדיוק כמו שהם.
 */
export function formatIsraeliPhone(raw: string | null | undefined): string {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return '';
  // כבר מכיל מקף — לא נוגעים (כולל 1-700-XXXXXX שהוזן ידנית)
  if (trimmed.includes('-')) return trimmed;

  let digits = trimmed.replace(/\D/g, '');
  if (!digits) return trimmed;

  // קידומת בינלאומית ישראלית (הדבקה מווטסאפ / אנשי קשר): +972 / 972 / 00972 → 0
  const intl = digits.replace(/^00/, '');
  if (intl.startsWith('972') && intl.length >= 11) digits = '0' + intl.slice(3);

  // נייד: 05X + 7 ספרות
  if (/^05\d{8}$/.test(digits)) return digits.slice(0, 3) + '-' + digits.slice(3);
  // קווי: 02/03/04/08/09 + 7 ספרות
  if (/^0[2-489]\d{7}$/.test(digits)) return digits.slice(0, 2) + '-' + digits.slice(2);
  // VoIP / קווי מיוחד: 07X + 7 ספרות
  if (/^07[1-9]\d{7}$/.test(digits)) return digits.slice(0, 3) + '-' + digits.slice(3);
  // מספרי שירות: 1-700 / 1-800 / 1-599
  if (/^1[578]\d{8}$/.test(digits)) return digits.slice(0, 1) + '-' + digits.slice(1, 4) + '-' + digits.slice(4);

  // לא זוהה — מחזירים בדיוק את מה שהתקבל
  return trimmed;
}

/**
 * גרסה שמשמרת null/undefined כמו שהם — לשדות אופציונליים ב-Prisma, שבהם
 * `undefined` פירושו "אל תעדכן" ו-`null` פירושו "נקה".
 */
export function formatIsraeliPhoneNullable<T extends string | null | undefined>(raw: T): T {
  if (raw === null || raw === undefined) return raw;
  return formatIsraeliPhone(raw) as T;
}

/**
 * מנרמל בבת אחת את שדות הטלפון של אובייקט (במקום, ומחזיר אותו).
 * שדות שאינם קיימים באובייקט לא נוגעים בהם — כך אפשר להעביר גם payload חלקי.
 */
export function formatPhoneFields<T extends Record<string, any>>(
  obj: T,
  fields: readonly string[] = DEFAULT_PHONE_FIELDS,
): T {
  if (!obj || typeof obj !== 'object') return obj;
  for (const f of fields) {
    if (obj[f] === undefined) continue;
    (obj as any)[f] = formatIsraeliPhoneNullable(obj[f]);
  }
  return obj;
}

/** שמות השדות שנחשבים "טלפון" לאורך הסכימה (Customer / CustomerContact / Lead / IncomingLead). */
export const DEFAULT_PHONE_FIELDS = [
  'phone',
  'phone2',
  'phone3',
  'mobile',
  'fax',
  'contactPhone',
  'customerPhone',
  'leadPhone',
  'phoneNumber',
] as const;
