/**
 * שירות ראדון — הגדרות משותפות לצד הלקוח.
 *
 * הקובץ מכיל רק את מה שהממשק צריך כדי להחליט אם להציג את הזרימה ואיך לרנדר
 * את השאלון. טבלת ההחלטה עצמה חיה בשרת (apps/api/src/radon/radon-tracks.ts)
 * והיא מקור האמת — הממשק שולח תשובות ומקבל בחזרה את המסלול.
 */

/** קודי בדיקות הראדון שפותחים את הזרימה. חייב להישאר תואם ל-RADON_TEST_SKUS בשרת. */
export const RADON_TEST_SKUS: readonly string[] = ['10044', '10017', '61', '10000'];

/** האם קוד השירות פותח את זרימת הראדון. */
export function isRadonTestSku(sku: string | null | undefined): boolean {
  return RADON_TEST_SKUS.includes(String(sku ?? '').trim());
}

/**
 * קודי הערכות לבדיקה עצמית — הגלאים אצל הלקוח והוא זה שמחזיר אותם.
 * רק עליהם מוצג כפתור "תזכור לקוח". חייב להישאר תואם ל-RADON_KIT_SKUS בשרת.
 */
export const RADON_KIT_SKUS: readonly string[] = ['61', '10000'];

/** האם מדובר בערכה שהלקוח מחזיק ואמור להחזיר. */
export function isRadonKitSku(sku: string | null | undefined): boolean {
  return RADON_KIT_SKUS.includes(String(sku ?? '').trim());
}

export type RadonQuestionOption = { value: string; label: string };
export type RadonQuestion = {
  /** מפתח התשובה — תואם לשדות RadonAnswers בשרת */
  key: 'purpose' | 'testType' | 'method' | 'propertyType' | 'groundContact';
  title: string;
  options: RadonQuestionOption[];
};

/** 5 שאלות הבחירה מהאפיון (שאלות 6-8 הן שדות חופשיים ומרונדרות בנפרד). */
export const RADON_QUESTIONS: readonly RadonQuestion[] = [
  {
    key: 'purpose',
    title: 'מה מטרת הבדיקה?',
    options: [
      { value: 'form4', label: 'טופס 4' },
      { value: 'private', label: 'בדיקה פרטית / בירור' },
      { value: 'institution', label: 'מוסד / בית ספר / גן' },
      { value: 'other', label: 'אחר' },
    ],
  },
  {
    key: 'testType',
    title: 'איזה סוג בדיקה נדרש?',
    options: [
      { value: 'short', label: 'בדיקה קצרה' },
      { value: 'long', label: 'בדיקה ארוכה' },
      { value: 'unknown', label: 'לא יודע / צריך ייעוץ' },
    ],
  },
  {
    key: 'method',
    title: 'איך הבדיקה תבוצע?',
    options: [
      { value: 'inspector', label: 'בעל היתר/בודק מגיע להצבה ואיסוף' },
      { value: 'self', label: 'בדיקה עצמית במשלוח' },
      { value: 'undecided', label: 'טרם נקבע' },
    ],
  },
  {
    key: 'propertyType',
    title: 'סוג הנכס',
    options: [
      { value: 'house', label: 'בית פרטי' },
      { value: 'ground_apartment', label: 'דירת קרקע' },
      { value: 'upper_apartment', label: 'דירה בקומה רגילה' },
      { value: 'basement', label: 'מרתף' },
      { value: 'shelter', label: 'ממ״ד' },
      { value: 'institution', label: 'בית ספר / גן / מוסד' },
      { value: 'office', label: 'משרד / מסחרי' },
      { value: 'other', label: 'אחר' },
    ],
  },
  {
    key: 'groundContact',
    title: 'האם הנכס צמוד קרקע?',
    options: [
      { value: 'yes', label: 'כן' },
      { value: 'no', label: 'לא' },
      { value: 'partial', label: 'חלקית' },
      { value: 'unknown', label: 'לא ידוע' },
    ],
  },
];

export type RadonAnswers = {
  purpose?: string;
  testType?: string;
  method?: string;
  propertyType?: string;
  groundContact?: string;
  detectorCount?: number | null;
  siteAddress?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
};

export type RadonJob = {
  id: string;
  sku: string;
  taskId: string | null;
  track: string | null;
  trackName: string | null;
  trackSummary: string | null;
  trackWarnings: string[];
  stages: string[];
  stageIndex: number;
  currentStage: string | null;
  status: string;
  isSelfService: boolean;
  requiresLicensedInspector: boolean;
  answers: RadonAnswers;
  detectorCount: number | null;
  siteAddress: string | null;
  contactName: string | null;
  contactPhone: string | null;
  placedAt: string | null;
  expectedEndAt: string | null;
  collectedAt: string | null;
  clientReportedAt: string | null;
  shippingAddress: string | null;
  outboundTracking: string | null;
  returnTracking: string | null;
  detectors?: Array<{
    id: string;
    placementNote: string | null;
    placedAt: string | null;
    detector: { id: string; serialNumber: string; status: string; model: string | null };
  }>;
  alerts?: Array<{ id: string; kind: string; message: string; severity: string }>;
};

/** תוויות סטטוס גלאי — לתצוגה. תואם ל-DETECTOR_STATUS_LABELS בשרת. */
export const DETECTOR_STATUS_LABELS: Record<string, string> = {
  IN_STOCK: 'במלאי',
  RESERVED: 'שמור לעבודה',
  WITH_EMPLOYEE: 'אצל עובד',
  SHIPPED_TO_CLIENT: 'נשלח ללקוח',
  WITH_CLIENT: 'אצל לקוח',
  DEPLOYED: 'הוצב בשטח',
  COLLECTED: 'נאסף',
  RETURNED: 'חזר למשרד',
  SENT_TO_LAB: 'נשלח לאנליזה',
  RESULT_RECEIVED: 'תוצאה התקבלה',
  CLOSED: 'סגור',
  LOST: 'אבד',
  DISQUALIFIED: 'נפסל',
};

/** צבע התג לפי סטטוס — ירוק=זמין, כחול=בתהליך, ענבר=אצל לקוח, אדום=בעיה. */
export function detectorStatusTone(status: string): string {
  if (status === 'IN_STOCK') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'LOST' || status === 'DISQUALIFIED') return 'bg-rose-50 text-rose-700 border-rose-200';
  if (status === 'WITH_CLIENT' || status === 'SHIPPED_TO_CLIENT') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-sky-50 text-sky-700 border-sky-200';
}
