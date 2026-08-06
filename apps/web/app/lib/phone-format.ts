/**
 * עיצוב מספר טלפון ישראלי — מקור אמת יחיד לכל המסכים.
 *
 * משמש בשני מצבים:
 *  1. הזנה ידנית (onBlur בשדה) — המשתמש מקליד 0501234567 ומקבל 050-1234567.
 *  2. תצוגה — מספרים שהגיעו ממקורות אחרים (פענוח מיילי לידים, ייבוא, בוט הוואטסאפ)
 *     נשמרים לרוב בלי מקף. מעצבים אותם בזמן הרינדור, כדי שכל המסכים ייראו אחיד
 *     בלי לגעת בנתונים שב-DB.
 *
 * העיקרון: לעולם לא מאבדים את מה שהוזן. קלט חלקי, מספר בפורמט לא מוכר או טקסט
 * חופשי — מוחזרים בדיוק כמו שהם.
 */
export function formatIsraeliPhoneDisplay(raw: string | null | undefined): string {
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

/** כינוי לשימוש בשדות קלט (onBlur) — אותה לוגיקה, שם שמסביר את ההקשר. */
export const autoFormatIsraeliPhone = formatIsraeliPhoneDisplay;

/** onBlur מוכן לשדה טלפון: מעצב את הערך ומחזיר אותו דרך setter רק אם השתנה. */
export function blurFormatPhone(
  value: string | null | undefined,
  apply: (formatted: string) => void,
): void {
  const cur = value || '';
  const f = formatIsraeliPhoneDisplay(cur);
  if (f !== cur) apply(f);
}
