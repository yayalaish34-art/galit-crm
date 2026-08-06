/**
 * חוקי החסימה של שירות ראדון (סעיפים 5 ו-10 במסמך האפיון).
 *
 * הקובץ טהור — מקבל את מצב העבודה ומחזיר רשימת בעיות. אין כאן DB, כך שכל
 * חוק ניתן לבדיקה ישירה.
 *
 * החוקים המרכזיים:
 *   • טופס 4 → חובה בעל היתר, חובה תיעוד מספרי גלאים ומיקומים, חובה תאריכים.
 *   • אי-אפשר לעבור ל"גלאים בשטח" בלי שהוזנו מספרי גלאים.
 *   • אי-אפשר לסגור הצבה בלי תאריך איסוף.
 *   • בדיקה עצמית → חובה כתובת משלוח, מספר מעקב, ודיווח הצבה מהלקוח.
 */

import type { RadonTrack } from './radon-tracks';

/** צורת העבודה שהחוקים בודקים — תת-קבוצה של RadonJob + השיוכים הפעילים. */
export type RadonJobState = {
  track: string | null;
  stageIndex: number;
  detectorCount: number | null;
  placedAt: Date | null;
  expectedEndAt: Date | null;
  collectedAt: Date | null;
  shippingAddress: string | null;
  outboundTracking: string | null;
  returnTracking: string | null;
  clientReportedAt: Date | null;
  detectors: Array<{
    placementNote: string | null;
    placedAt: Date | null;
    detector: { serialNumber: string; status: string };
  }>;
};

/** שלבים שמחייבים שהגלאים כבר יהיו משויכים ומתועדים. */
const STAGE_REQUIRES_DETECTORS = /גלאים בשטח|תיעוד גלאים|בדיקה פעילה|תקופת בדיקה/;
/** שלבים שמסמנים סיום הצבה. */
const STAGE_PLACEMENT_DONE = /הצבת גלאים|דיווח הצבה/;
/** שלבים של שליחת ערכה ללקוח. */
const STAGE_SHIPPING = /שליחת ערכה|הלקוח קיבל ערכה/;
/** שלבים של החזרת הערכה. */
const STAGE_RETURN = /הלקוח שלח חזרה|גלאים התקבלו/;
/** שלבים של אנליזה ואילך. */
const STAGE_ANALYSIS = /אנליזה|העברה לאנליזה/;

/**
 * בודק אם מותר לקדם את העבודה לשלב היעד.
 * מחזיר רשימת בעיות; רשימה ריקה = מותר.
 */
export function validateStageAdvance(input: {
  job: RadonJobState;
  track: RadonTrack;
  toIndex: number;
}): string[] {
  const { job, track, toIndex } = input;
  const target = track.stages[toIndex] ?? '';
  const problems: string[] = [];

  const active = job.detectors ?? [];
  const documented = active.filter((a) => (a.placementNote ?? '').trim().length > 0);

  // ── חובה גלאים משויכים ומתועדים לפני שהעבודה "בשטח" ──
  if (STAGE_REQUIRES_DETECTORS.test(target)) {
    if (active.length === 0) {
      problems.push('לא ניתן לעבור לשלב זה ללא גלאים משויכים לעבודה.');
    } else {
      if (job.detectorCount != null && active.length < job.detectorCount) {
        problems.push(
          `שויכו ${active.length} גלאים מתוך ${job.detectorCount} שנדרשו. יש לשייך את כל הגלאים או לעדכן את הכמות.`,
        );
      }
      // חוק מעמ' 6: "אם לא הוזנו מספרי גלאים — אי אפשר לעבור לסטטוס גלאים בשטח".
      if (documented.length < active.length) {
        const missing = active.length - documented.length;
        problems.push(`חסר תיעוד מיקום ל-${missing} גלאים. חובה לרשום מיקום לכל גלאי.`);
      }
    }
  }

  // ── סיום הצבה מחייב תאריך איסוף מתוכנן ──
  // חוק מעמ' 6: "אם לא הוזן תאריך איסוף — אי אפשר לסגור הצבה".
  if (STAGE_PLACEMENT_DONE.test(target) && toIndex > 0) {
    if (!job.expectedEndAt && !job.collectedAt) {
      problems.push('חובה להזין תאריך איסוף/סיום מתוכנן לפני סגירת ההצבה.');
    }
  }

  // ── בדיקה ארוכה: חובה תאריך התחלה וסיום צפוי ──
  if (track.conditions === 'normal_living' && STAGE_REQUIRES_DETECTORS.test(target)) {
    if (!job.placedAt) problems.push('בבדיקה ארוכה חובה להזין תאריך התחלה.');
    if (!job.expectedEndAt) problems.push('בבדיקה ארוכה חובה להזין תאריך סיום צפוי.');
  }

  // ── בדיקה עצמית במשלוח (מסלול 4) ──
  if (track.isSelfService) {
    if (STAGE_SHIPPING.test(target)) {
      if (!job.shippingAddress?.trim()) problems.push('חובה להזין כתובת משלוח לפני שליחת הערכה.');
      if (!job.outboundTracking?.trim()) problems.push('חובה להזין מספר מעקב למשלוח היוצא.');
    }
    if (STAGE_REQUIRES_DETECTORS.test(target) && !job.clientReportedAt) {
      problems.push('חובה שהלקוח ידווח על תאריך ההצבה לפני שהבדיקה מסומנת כפעילה.');
    }
    if (STAGE_RETURN.test(target) && !job.returnTracking?.trim()) {
      problems.push('חובה להזין מספר מעקב למשלוח החוזר.');
    }
  }

  // ── טופס 4: המסלול הקשיח ──
  if (track.requiresLicensedInspector) {
    if (STAGE_ANALYSIS.test(target)) {
      const undocumented = active.filter((a) => !a.placedAt);
      if (undocumented.length) {
        problems.push('במסלול טופס 4 חובה לתעד תאריך הצבה לכל גלאי לפני העברה לאנליזה.');
      }
      if (!job.collectedAt) {
        problems.push('במסלול טופס 4 חובה לתעד את מועד האיסוף לפני העברה לאנליזה.');
      }
    }
  }

  return problems;
}

/**
 * שדות חובה בכרטיס בדיקת ראדון (סעיף 6 באפיון).
 * מחזיר את השדות החסרים — להצגה כרשימת "מה נשאר להשלים".
 */
export function missingRequiredFields(job: {
  track: string | null;
  detectorCount: number | null;
  siteAddress: string | null;
  contactName: string | null;
  contactPhone: string | null;
}): string[] {
  const missing: string[] = [];
  if (!job.track) missing.push('מסלול בדיקה (יש להשלים את השאלון)');
  if (job.detectorCount == null || job.detectorCount < 1) missing.push('מספר גלאים');
  if (!job.siteAddress?.trim()) missing.push('כתובת הבדיקה');
  if (!job.contactName?.trim()) missing.push('איש קשר לתיאום');
  if (!job.contactPhone?.trim()) missing.push('טלפון איש קשר');
  return missing;
}
