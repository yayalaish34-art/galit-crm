/**
 * כתובת ה-API הציבורית לבניית קישורים שנצרבים ב-PDF / במייל (כפתור "הפרופיל שלנו",
 * קובץ /public/company-profile.pdf וכד').
 *
 * סדר העדיפויות — הדומיין המותאם קודם, כדי שקישורים ייצרבו עם crm.galit.co.il:
 *   1. PUBLIC_API_URL — הדומיין המותאם אישית (למשל https://crm.galit.co.il).
 *      נצרב בקישורים המוצגים ללקוח. הגדר אותו ב-env של Railway.
 *   2. RAILWAY_PUBLIC_DOMAIN — Railway מזריק אוטומטית את הדומיין החי של הדפלוי
 *      (למשל api-production-54cc.up.railway.app). fallback אם PUBLIC_API_URL לא הוגדר.
 *   3. ה-host של הבקשה הנוכחית — fallback אחרון (למשל בפיתוח מקומי).
 *
 * הערה: PUBLIC_API_URL חייב להצביע על הדומיין הנכון — אם יישאר ערך ישן ב-env,
 * הוא ייצרב בקישורים. וודא שהוא מעודכן לדומיין הרצוי (crm.galit.co.il).
 */
export function resolvePublicApiBase(requestHost?: string | null): string {
  const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  const raw =
    process.env.PUBLIC_API_URL?.trim() ||
    (railwayDomain ? `https://${railwayDomain}` : '') ||
    (requestHost ? `https://${requestHost}` : '') ||
    '';
  return raw.replace(/\/+$/, '');
}
