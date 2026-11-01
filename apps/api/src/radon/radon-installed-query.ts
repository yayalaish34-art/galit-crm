/**
 * השאילתה של הגלאים שהותקנו ללקוח — קובץ נפרד וללא תלויות, כדי שאפשר יהיה להריץ
 * אותה מול Postgres אמיתי בבדיקה.
 *
 * הטבלאות נוצרות ע"י מערכת הפקת הדוחות (reporttt), שהיא האורחת בסכמה הזו, ולכן
 * הן לא ב-schema.prisma: "RadonInstalledDetector" הוא העתק של רשימת הגלאים שלה,
 * ו-"RadonLabReading" הן קריאות המעבדה לפי מספר גלאי.
 */
export function installedDetectorsSql(hasReadings: boolean): string {
  const reading = hasReadings
    ? `r."concentration" AS "concentration", r."uncertainty" AS "uncertainty"`
    : `NULL::text AS "concentration", NULL::text AS "uncertainty"`;
  const join = hasReadings ? `LEFT JOIN "RadonLabReading" r ON r."detectorNumber" = d."detectorNumber"` : '';

  return `SELECT d."detectorNumber", d."roomName", d."floor", d."testLength",
                 d."placedAt", d."collectedAt", d."startsAt", d."endsAt", d."reportId",
                 ${reading}
            FROM "RadonInstalledDetector" d
            ${join}
           WHERE d."customerId" = $1
           ORDER BY d."startsAt" DESC NULLS LAST, d."detectorNumber" ASC`;
}

/** האם טבלה קיימת. ::text כי Prisma לא יודע לקרוא את הטיפוס regclass, ולפרמטר כדי שלא ינחש טיפוס. */
export const TABLE_EXISTS_SQL = `SELECT to_regclass($1::text)::text AS "name"`;
