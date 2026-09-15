import { apiFetch, apiUrl } from './api-base';

/**
 * חיוג ללקוח — דרך המרכזייה אם אפשר, אחרת דרך הטלפון.
 *
 * ההעדפה למרכזייה היא כל העניין: שיחה שעוברת דרכה מוקלטת ומתומללת אוטומטית
 * ונכנסת לכרטיס הלקוח, בעוד שכפתור tel: מוציא שיחה מהסים הפרטי ולא מגיע למערכת
 * כלל. אבל המרכזייה עלולה לא להיות מוגדרת, או שלמשתמש אין שלוחה — ואז נופלים
 * חזרה ל-tel:, כדי שהכפתור לעולם לא "לא יעשה כלום".
 *
 * מחזיר הודעה קצרה להצגה (המרכזייה מצלצלת קודם לשלוחת המשתמש), או null כשנפלנו
 * ל-tel: (אין מה להודיע — הטלפון כבר פתח את החייגן).
 *
 * `error` מוחזר כשהשרת דחה את החיוג ואמר למה. הנפילה ל-tel: עדיין קורית — הכפתור
 * חייב להמשיך לעבוד — אבל הסיבה לא נבלעת: בלעדיה "נפתח החייגן" נראה זהה בין חיוג
 * שעבר דרך המרכזייה (מוקלט) לבין כזה שנכשל ויצא מהסים הפרטי (לא מוקלט, לא בתיק).
 */
export async function dialCustomer(
  phone: string,
  currentUser: unknown,
): Promise<{ via: 'pbx' | 'tel'; message: string | null; error?: string }> {
  const clean = (phone || '').replace(/[^\d+]/g, '');
  if (!clean) return { via: 'tel', message: null };

  let error: string | undefined;
  try {
    const res = await apiFetch(apiUrl('/call-recordings/dial'), {
      method: 'POST',
      authUser: currentUser as any,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: clean }),
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return { via: 'pbx', message: data?.message || 'המרכזייה מצלצלת — הרם כדי להתחבר ללקוח.' };
    }
    // 400 = מרכזייה לא מוגדרת / אין שלוחה / חיוג נכשל. השרת מסביר במדויק מה קרה.
    const data = await res.json().catch(() => null as any);
    error = data?.message || `השרת החזיר ${res.status}`;
  } catch (e: any) {
    error = `לא הצלחנו לפנות לשרת: ${e?.message || e}`;
  }

  telFallback(clean);
  return { via: 'tel', message: null, error };
}

/** פתיחת חייגן הטלפון, כמו הכפתור הישן. */
export function telFallback(phone: string): void {
  const clean = (phone || '').replace(/[^\d+]/g, '');
  if (!clean) return;
  const tel = clean.startsWith('0') ? `+972${clean.slice(1)}` : clean;
  if (typeof window !== 'undefined') window.location.href = `tel:${tel}`;
}
