/**
 * כתובת ה-API הציבורית לבניית קישורים שנצרבים ב-PDF / במייל (כפתור "הפרופיל שלנו",
 * קובץ /public/company-profile.pdf וכד').
 *
 * סדר העדיפויות — הכי אמין קודם, כדי שקישור *ישן* לא ייצרב לעולם:
 *   1. RAILWAY_PUBLIC_DOMAIN — Railway מזריק אוטומטית לכל דפלוי את הדומיין הציבורי
 *      *הנוכחי* של השירות (למשל api-production-54cc.up.railway.app). תמיד עדכני.
 *   2. PUBLIC_API_URL — override ידני (דומיין מותאם אישית). נשאר לתאימות אחורה.
 *   3. ה-host של הבקשה הנוכחית — fallback אחרון (למשל בפיתוח מקומי).
 *
 * הערה: בעבר PUBLIC_API_URL היה ראשון — וערך ישן שנשאר ב-env גרם לקישור Railway ישן
 * להיצרב ב-PDF. RAILWAY_PUBLIC_DOMAIN עוקף את זה כי הוא תמיד הדומיין החי של הדפלוי.
 */
export function resolvePublicApiBase(requestHost?: string | null): string {
  const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  const raw =
    (railwayDomain ? `https://${railwayDomain}` : '') ||
    process.env.PUBLIC_API_URL?.trim() ||
    (requestHost ? `https://${requestHost}` : '') ||
    '';
  return raw.replace(/\/+$/, '');
}
