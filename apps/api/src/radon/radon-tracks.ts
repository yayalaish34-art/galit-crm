/**
 * שירות ראדון — קודי שירות, שאלון הפתיחה, וטבלת ההחלטה שקובעת את המסלול.
 *
 * המודול עצמאי: הוא לא משנה את ה-pipeline הקיים ולא נוגע ב-Task/Customer.
 * הכל נפתח כשנבחר אחד מקודי בדיקות הראדון (RADON_TEST_SKUS).
 *
 * הטקסטים והלוגיקה לקוחים ממסמך "החלוקה הראשית בשירות ראדון".
 */

// ─────────────────────────────────────────────────────────────
// קודי שירות
// ─────────────────────────────────────────────────────────────

/** בדיקת ראדון קצרת טווח ע״י בודק מוסמך. */
export const SKU_SHORT_INSPECTOR = '10044';
/** בדיקת ראדון ארוכת טווח ע״י בודק מוסמך. */
export const SKU_LONG_INSPECTOR = '10017';
/** ערכה לבדיקת ראדון קצרת טווח (בדיקה עצמית במשלוח). */
export const SKU_SHORT_KIT = '61';
/** ערכה לבדיקת ראדון ארוכת טווח (בדיקה עצמית במשלוח). */
export const SKU_LONG_KIT = '10000';

/**
 * קודי השירות שפותחים את זרימת הראדון.
 *
 * מה שבמכוון *לא* ברשימה:
 *   87                        — "פרט ראדון": שירות תכנון, אין גלאים ואין מסלול במסמך.
 *   10022/10095/10160/10161/10162 — מכירת גלאים (חומרה), לא בדיקה.
 *   70/10069                  — כיול גלאי, שירות נפרד.
 */
export const RADON_TEST_SKUS: readonly string[] = [
  SKU_SHORT_INSPECTOR,
  SKU_LONG_INSPECTOR,
  SKU_SHORT_KIT,
  SKU_LONG_KIT,
];

/** האם קוד השירות פותח את זרימת הראדון. */
export function isRadonTestSku(sku: string | null | undefined): boolean {
  return RADON_TEST_SKUS.includes(String(sku ?? '').trim());
}

/**
 * קודי הערכות לבדיקה עצמית — הגלאים יוצאים פיזית לידי הלקוח, והוא זה שאחראי
 * להוריד אותם בתום התקופה ולשלוח אלינו בחזרה.
 *
 * זה בדיוק ההבדל מ-10044/10017: שם הבודק שלנו מציב ואוסף, ולכן אין ללקוח מה
 * לעשות ואין למי לשלוח תזכורת. רק שני הקודים האלה מציגים את כפתור "תזכור לקוח".
 */
export const RADON_KIT_SKUS: readonly string[] = [SKU_SHORT_KIT, SKU_LONG_KIT];

/** האם מדובר בערכה שהלקוח מחזיק ואמור להחזיר — הבדיקה שמאחורי כפתור התזכורת. */
export function isRadonKitSku(sku: string | null | undefined): boolean {
  return RADON_KIT_SKUS.includes(String(sku ?? '').trim());
}

// ─────────────────────────────────────────────────────────────
// תשובות השאלון (סעיף 2 במסמך)
// ─────────────────────────────────────────────────────────────

/** 1. מה מטרת הבדיקה? */
export type RadonPurpose = 'form4' | 'private' | 'institution' | 'other';
/** 2. איזה סוג בדיקה נדרש? */
export type RadonTestType = 'short' | 'long' | 'unknown';
/** 3. איך הבדיקה תבוצע? */
export type RadonMethod = 'inspector' | 'self' | 'undecided';
/** 4. סוג הנכס. */
export type RadonPropertyType =
  | 'house' | 'ground_apartment' | 'upper_apartment' | 'basement'
  | 'shelter' | 'institution' | 'office' | 'other';
/** 5. האם הנכס צמוד קרקע? */
export type RadonGroundContact = 'yes' | 'no' | 'partial' | 'unknown';

/** תשובות השאלון. שדות אופציונליים = טרם נענו. */
export type RadonAnswers = {
  purpose?: RadonPurpose;
  testType?: RadonTestType;
  method?: RadonMethod;
  propertyType?: RadonPropertyType;
  groundContact?: RadonGroundContact;
  /** 6. כמה חללים / כמה גלאים נדרשים */
  detectorCount?: number | null;
  /** 7. כתובת הבדיקה */
  siteAddress?: string | null;
  /** 8. איש קשר לתיאום */
  contactName?: string | null;
  contactPhone?: string | null;
};

// ─────────────────────────────────────────────────────────────
// המסלולים (סעיף 4 במסמך)
// ─────────────────────────────────────────────────────────────

export type RadonTrackId = 'track1' | 'track2' | 'track3' | 'track4';

export type RadonTrack = {
  id: RadonTrackId;
  name: string;
  /** תיאור קצר להצגה בממשק */
  summary: string;
  /** האם נדרש בעל היתר (ולא רק בודק) להצבה ולאיסוף */
  requiresLicensedInspector: boolean;
  /** האם הגלאים נשלחים ללקוח והוא מציב בעצמו */
  isSelfService: boolean;
  /** תנאי הבדיקה */
  conditions: 'closed' | 'normal_living';
  /** שלבי המסלול, לפי הסדר. מוצגים כציר התקדמות בתוך המודול. */
  stages: readonly string[];
};

/** מסלול 1 — בדיקת ראדון קצרה לטופס 4. המסלול הרשמי ביותר. */
const TRACK_1: RadonTrack = {
  id: 'track1',
  name: 'בדיקת ראדון קצרה לטופס 4',
  summary: 'בעל היתר מציב ואוסף. תנאים סגורים, צמוד קרקע בלבד. אין אפשרות לבדיקה עצמית.',
  requiresLicensedInspector: true,
  isSelfService: false,
  conditions: 'closed',
  stages: [
    'איסוף פרטים',
    'בדיקת התאמה',
    'הצעת מחיר',
    'אישור הצעה',
    'תשלום / פתיחת עבודה',
    'תיאום הצבה',
    'שיבוץ בעל היתר',
    'הצבת גלאים',
    'תיעוד גלאים',
    'תקופת בדיקה',
    'תיאום איסוף',
    'איסוף גלאים',
    'העברה לאנליזה',
    'קבלת תוצאות',
    'הפקת דוח',
    'שליחת דוח',
    'סגירת עבודה',
  ],
};

/** מסלול 2 — בדיקת ראדון קצרה רגילה. לא טופס 4, אבל אנחנו מגיעים. */
const TRACK_2: RadonTrack = {
  id: 'track2',
  name: 'בדיקת ראדון קצרה רגילה',
  summary: 'בודק מציב ואוסף. תנאים סגורים, ללא דרישות טופס 4.',
  requiresLicensedInspector: false,
  isSelfService: false,
  conditions: 'closed',
  stages: [
    'איסוף פרטים',
    'הצעת מחיר',
    'אישור + תשלום',
    'תיאום הצבה',
    'הצבת גלאים',
    'גלאים בשטח',
    'תזכורת איסוף',
    'איסוף גלאים',
    'אנליזה',
    'דוח',
    'סגירה',
  ],
};

/** מסלול 3 — בדיקת ראדון ארוכה עם בודק. תנאי מחיה רגילים, אנחנו מציבים. */
const TRACK_3: RadonTrack = {
  id: 'track3',
  name: 'בדיקת ראדון ארוכה עם בודק',
  summary: 'בודק מציב ואוסף, תנאי מחיה רגילים. נדרש ניהול תאריך התחלה וסיום צפוי.',
  requiresLicensedInspector: false,
  isSelfService: false,
  conditions: 'normal_living',
  stages: [
    'איסוף פרטים',
    'הצעת מחיר',
    'אישור + תשלום',
    'תיאום הצבה',
    'הצבת גלאים',
    'שליחת הנחיות ללקוח',
    'גלאים בשטח',
    'תזכורת סוף תקופה',
    'תיאום איסוף',
    'גלאים חזרו למשרד',
    'אנליזה',
    'דוח',
    'סגירה',
  ],
};

/** מסלול 4 — בדיקת ראדון ארוכה עצמית במשלוח. המסלול שהכי דורש בוט. */
const TRACK_4: RadonTrack = {
  id: 'track4',
  name: 'בדיקת ראדון ארוכה עצמית במשלוח',
  summary: 'הערכה נשלחת ללקוח, הוא מציב ומדווח, ומחזיר אלינו במשלוח.',
  requiresLicensedInspector: false,
  isSelfService: true,
  conditions: 'normal_living',
  stages: [
    'איסוף פרטים',
    'הצעת מחיר',
    'אישור + תשלום',
    'הכנת ערכה',
    'שיוך גלאים',
    'שליחת ערכה',
    'הלקוח קיבל ערכה',
    'דיווח הצבה מהלקוח',
    'בדיקה פעילה',
    'תזכורת סיום',
    'הלקוח שלח חזרה',
    'גלאים התקבלו',
    'אנליזה',
    'דוח',
    'סגירה',
  ],
};

const TRACKS: Record<RadonTrackId, RadonTrack> = {
  track1: TRACK_1,
  track2: TRACK_2,
  track3: TRACK_3,
  track4: TRACK_4,
};

export function getTrack(id: RadonTrackId): RadonTrack {
  return TRACKS[id];
}

export const ALL_TRACKS: readonly RadonTrack[] = [TRACK_1, TRACK_2, TRACK_3, TRACK_4];

// ─────────────────────────────────────────────────────────────
// טבלת ההחלטה (סעיף 3 במסמך)
// ─────────────────────────────────────────────────────────────

export type RadonResolution =
  | { status: 'resolved'; track: RadonTrack; warnings: string[] }
  /** חסרות תשובות כדי להכריע — `missing` מפרט אילו. */
  | { status: 'incomplete'; missing: Array<keyof RadonAnswers>; warnings: string[] }
  /** התשובות סותרות זו את זו — חייב הכרעת אדם. */
  | { status: 'conflict'; reason: string; warnings: string[] };

/**
 * קובע את המסלול לפי תשובות השאלון.
 *
 * הציר הראשי (לפי תרשים ההחלטה במסמך):
 *   טופס 4?  → כן  → מסלול 1 (תמיד קצרה, תמיד בעל היתר)
 *            → לא  → קצרה?  → מסלול 2
 *                  → ארוכה? → בודק מגיע → מסלול 3
 *                            → עצמי      → מסלול 4
 *
 * הפונקציה טהורה — אין לה תלות ב-DB, וזה מה שהופך אותה לניתנת לבדיקה.
 */
export function resolveTrack(answers: RadonAnswers): RadonResolution {
  const warnings = collectWarnings(answers);

  if (!answers.purpose) {
    return { status: 'incomplete', missing: ['purpose'], warnings };
  }

  // ── טופס 4 → מסלול 1, ללא תלות בשאר התשובות ──
  // המסמך: "מחייבת בעל היתר גם בהצבה וגם באיסוף. זה מסלול קשיח יותר."
  if (answers.purpose === 'form4') {
    // חוק מעמ' 15: אם מטרת הבדיקה = טופס 4 → חסום בדיקה עצמית.
    if (answers.method === 'self') {
      return {
        status: 'conflict',
        reason: 'בדיקה לטופס 4 לא יכולה להתבצע כבדיקה עצמית — נדרש בעל היתר להצבה ולאיסוף.',
        warnings,
      };
    }
    // טופס 4 הוא תמיד בדיקה קצרה בתנאים סגורים.
    if (answers.testType === 'long') {
      return {
        status: 'conflict',
        reason: 'בדיקה לטופס 4 היא בדיקה קצרה בתנאים סגורים — לא ניתן לבחור בדיקה ארוכה.',
        warnings,
      };
    }
    return { status: 'resolved', track: TRACK_1, warnings };
  }

  // ── לא טופס 4 → מכריעים לפי סוג הבדיקה ──
  if (!answers.testType || answers.testType === 'unknown') {
    // "לא יודע / צריך ייעוץ" — לא שגיאה, פשוט עוד אין החלטה.
    return { status: 'incomplete', missing: ['testType'], warnings };
  }

  if (answers.testType === 'short') {
    // בדיקה קצרה שאינה טופס 4 — המסמך מכיר רק במסלול "אנחנו מגיעים".
    if (answers.method === 'self') {
      return {
        status: 'conflict',
        reason: 'בדיקה קצרה מחייבת תנאים סגורים ומקום צמוד קרקע — היא מבוצעת ע״י בודק, לא כבדיקה עצמית.',
        warnings,
      };
    }
    return { status: 'resolved', track: TRACK_2, warnings };
  }

  // בדיקה ארוכה — ההכרעה היא לפי אופן הביצוע.
  if (!answers.method || answers.method === 'undecided') {
    return { status: 'incomplete', missing: ['method'], warnings };
  }
  return {
    status: 'resolved',
    track: answers.method === 'self' ? TRACK_4 : TRACK_3,
    warnings,
  };
}

/**
 * אזהרות התאמה — לא חוסמות את הניתוב, אבל חייבות להיות מוצגות למשתמש.
 * המסמך: בדיקה קצרה "רלוונטית למקומות צמודי קרקע בלבד".
 */
function collectWarnings(answers: RadonAnswers): string[] {
  const out: string[] = [];

  const wantsShort = answers.testType === 'short' || answers.purpose === 'form4';
  if (wantsShort) {
    if (answers.groundContact === 'no') {
      out.push('בדיקה קצרה רלוונטית למקומות צמודי קרקע בלבד — הנכס סומן כלא צמוד קרקע.');
    } else if (answers.groundContact === 'partial') {
      out.push('הנכס צמוד קרקע חלקית — יש לוודא שמיקום ההצבה עצמו צמוד קרקע.');
    } else if (answers.groundContact === 'unknown') {
      out.push('לא ידוע אם הנכס צמוד קרקע — נדרש בירור לפני אישור בדיקה קצרה.');
    }

    // סוגי נכס שמעצם טבעם אינם צמודי קרקע.
    if (answers.propertyType === 'upper_apartment') {
      out.push('דירה בקומה רגילה אינה צמודת קרקע — בדיקה קצרה עשויה לא להתאים.');
    }
  }

  if (answers.detectorCount != null && answers.detectorCount < 1) {
    out.push('מספר הגלאים חייב להיות לפחות 1.');
  }

  return out;
}

/** תווית עברית לתשובה — לתצוגה בממשק ובהודעות. */
export const RADON_LABELS = {
  purpose: {
    form4: 'טופס 4',
    private: 'בדיקה פרטית / בירור',
    institution: 'מוסד / בית ספר / גן',
    other: 'אחר',
  } as Record<RadonPurpose, string>,
  testType: {
    short: 'בדיקה קצרה',
    long: 'בדיקה ארוכה',
    unknown: 'לא יודע / צריך ייעוץ',
  } as Record<RadonTestType, string>,
  method: {
    inspector: 'בעל היתר/בודק מגיע להצבה ואיסוף',
    self: 'בדיקה עצמית במשלוח',
    undecided: 'טרם נקבע',
  } as Record<RadonMethod, string>,
  propertyType: {
    house: 'בית פרטי',
    ground_apartment: 'דירת קרקע',
    upper_apartment: 'דירה בקומה רגילה',
    basement: 'מרתף',
    shelter: 'ממ״ד',
    institution: 'בית ספר / גן / מוסד',
    office: 'משרד / מסחרי',
    other: 'אחר',
  } as Record<RadonPropertyType, string>,
  groundContact: {
    yes: 'כן',
    no: 'לא',
    partial: 'חלקית',
    unknown: 'לא ידוע',
  } as Record<RadonGroundContact, string>,
} as const;
