/**
 * דומיינים של ה-frontend (Next.js/Vercel) — אסור לבנות עליהם קישורי API כמו
 * /public/company-profile.pdf, כי שם אין route כזה (Next.js מחזיר 404).
 * אם PUBLIC_API_URL הוגדר בטעות לאחד מהם — מתעלמים ממנו ונופלים לדומיין ה-API.
 */
const FRONTEND_HOST_PATTERNS: RegExp[] = [
  /(^|\.)crm\.galit\.co\.il$/i, // הדומיין המותאם של האתר (Vercel)
  /\.vercel\.app$/i,            // דומייני Vercel
];

/** מחלץ את ה-host מתוך כתובת (עם או בלי סכימה). ריק אם לא ניתן לפרסר. */
function hostOf(value: string): string {
  const v = value.trim();
  if (!v) return '';
  try {
    return new URL(v.includes('://') ? v : `https://${v}`).host.toLowerCase();
  } catch {
    return v.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase();
  }
}

/** האם ה-host הזה שייך ל-frontend (ולכן לא מתאים לקישורי API)? */
function isFrontendHost(host: string): boolean {
  return !!host && FRONTEND_HOST_PATTERNS.some((re) => re.test(host));
}

/**
 * כתובת ה-API הציבורית לבניית קישורים שנצרבים ב-PDF / במייל (כפתור "הפרופיל שלנו",
 * קובץ /public/company-profile.pdf וכד'). חייבת להצביע על שרת ה-API (Railway) — לא על
 * האתר (Vercel), אחרת הקישור מחזיר 404 מ-Next.js.
 *
 * סדר העדיפויות:
 *   1. PUBLIC_API_URL — אם הוגדר *ולא* מצביע על דומיין ה-frontend. מאפשר דומיין API
 *      מותאם אישית. אם הוגדר בטעות לדומיין האתר (crm.galit.co.il / *.vercel.app) —
 *      הוא נפסל ומדלגים הלאה, כדי שהקישור לא יישבר.
 *   2. RAILWAY_PUBLIC_DOMAIN — Railway מזריק אוטומטית את הדומיין החי של שרת ה-API
 *      (למשל galit.up.railway.app). זה תמיד הדומיין הנכון של ה-API.
 *   3. ה-host של הבקשה הנוכחית — fallback אחרון (בעיקר לפיתוח מקומי), אם אינו frontend.
 */
export function resolvePublicApiBase(requestHost?: string | null): string {
  const candidates: string[] = [];

  const explicit = process.env.PUBLIC_API_URL?.trim();
  if (explicit && !isFrontendHost(hostOf(explicit))) {
    candidates.push(explicit);
  }

  const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  if (railwayDomain) candidates.push(`https://${railwayDomain}`);

  if (requestHost && !isFrontendHost(hostOf(requestHost))) {
    candidates.push(`https://${requestHost}`);
  }

  const chosen = candidates.find(Boolean) || '';
  return chosen.replace(/\/+$/, '');
}
