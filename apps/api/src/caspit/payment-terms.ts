/**
 * תנאי תשלום → תאריך יעד (DueDate) לכספית.
 *
 * הקובץ טהור בכוונה — בלי DB ובלי רשת — כדי שכל כלל יהיה ניתן לבדיקה ישירה.
 *
 * למה זה קיים: עד היום כל מסמך שהונפק לכספית נשלח עם `DueDate: null` קשיח,
 * כלומר תנאי התשלום שסוכמו בהצעה ("שוטף + 30") נשארו בהצעה ולא הגיעו לספרים.
 * דרישת תשלום בלי תאריך יעד היא חצי מסמך, ודוחות הגיול בכספית לא יכולים
 * להראות מה באיחור.
 *
 * הערכים אינם מנוהלים: `Quote.paymentTerms` הוא שדה טקסט חופשי שנסחף מטבלת
 * `PaymentTerm`. מדגם אמיתי מה-DB (211 הצעות):
 *     72×  "שוטף +30"                       ← בלי רווח
 *     67×  "מזומן"
 *     40×  "תשלום מראש מלא"
 *      7×  "שוטף + 30"                      ← עם רווח
 *      2×  "50% מקדמה, 50% בסיום העבודה"
 *     23×  ריק
 * שתי הצורות של "שוטף 30" הן אותו דבר, ולכן התאמה מדויקת מול הטבלה הייתה
 * מפספסת דווקא את 72 ההצעות הנפוצות ביותר. מכאן הנרמול האגרסיבי למטה.
 */

/** אופן הספירה של "שוטף + N". */
export type NetCounting = 'endOfMonth' | 'documentDate';

/**
 * החלטת מוצר (המשתמש, 2026-08-05): "שוטף + 30" נספר **סוף החודש + 30**,
 * הפירוש המקובל בישראל. חשבונית מה-5/8 ומחשבונית מה-28/8 מקבלות שתיהן
 * 30/9 — וזו בדיוק הכוונה של "שוטף".
 */
export const DEFAULT_NET_COUNTING: NetCounting = 'endOfMonth';

/**
 * האפשרויות שמוצגות בדיאלוג הגבייה (החלטת המשתמש, 2026-08-06).
 * רשימה קבועה ולא נגזרת מטבלת PaymentTerm: בטבלה יש שני ערכים בלבד, ובהצעות
 * נכתבו עשרות וריאציות חופשיות — מה שהפך את הבורר ללא צפוי.
 * שלושת הראשונים הם אמצעי תשלום שנמסרים במעמד ⇒ תאריך יעד = תאריך המסמך.
 */
export const PAYMENT_TERM_OPTIONS = [
  'מזומן',
  'צ׳ק',
  'אשראי',
  'שוטף + 10',
  'שוטף + 30',
  'שוטף + 60',
  'שוטף + 90',
] as const;

export interface DueDateResult {
  /** תאריך היעד כ-YYYY-MM-DD, או null כשאי אפשר לגזור. */
  dueDate: string | null;
  /** מספר ימי ה"שוטף" שזוהה (0 = מיידי), או null. */
  netDays: number | null;
  /** הסבר קצר בעברית להצגה למשתמש לפני ההנפקה. */
  explanation: string;
  /** true כשהתנאי זוהה בוודאות; false = לא זוהה ולכן אין תאריך יעד. */
  recognized: boolean;
}

/**
 * נרמול לצורך זיהוי: הסרת רווחים (כולל רווחים "רחבים"), מקפים וגרשיים.
 * "שוטף +30" ו-"שוטף + 30" ו-"שוטף+30" מתלכדים כולם ל-"שוטף+30".
 */
function normalize(raw: string): string {
  return raw
    .replace(/[‎‏‪-‮]/g, '') // סימני כיווניות דו-כיווניים
    .replace(/[״"'׳`]/g, '')
    .replace(/\s+/g, '')
    .trim();
}

/** היום האחרון בחודש של התאריך הנתון (בשעון מקומי-נאיבי). */
function endOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d.getTime());
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

function toYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** מפרסר תאריך בסיס (ברירת מחדל: היום) לאובייקט Date נאיבי ב-UTC. */
function baseDate(documentDate?: string | Date | null): Date {
  if (documentDate instanceof Date && !Number.isNaN(documentDate.getTime())) {
    return new Date(Date.UTC(
      documentDate.getUTCFullYear(),
      documentDate.getUTCMonth(),
      documentDate.getUTCDate(),
    ));
  }
  if (typeof documentDate === 'string' && documentDate.trim()) {
    const d = new Date(documentDate);
    if (!Number.isNaN(d.getTime())) {
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    }
  }
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * גוזר תאריך יעד מתנאי תשלום בטקסט חופשי.
 *
 * כללים:
 *   • "שוטף + N" / "שוטף +N" / "נטו N" / "+N"  → N ימים, לפי אופן הספירה.
 *   • "מזומן" / "מראש" / "עם קבלת החשבונית"    → מיידי (תאריך המסמך).
 *   • תנאי מפוצל ("50% מקדמה…")                → לא ניתן לבטא בתאריך יעד יחיד → null.
 *   • ריק / לא מזוהה                            → null (בדיוק ההתנהגות של היום).
 *
 * החזרת null אינה כישלון — היא "אל תשלח DueDate", וכספית פשוט לא תציג תאריך יעד.
 */
export function computeDueDate(
  paymentTerms: string | null | undefined,
  documentDate?: string | Date | null,
  counting: NetCounting = DEFAULT_NET_COUNTING,
): DueDateResult {
  const raw = String(paymentTerms ?? '').trim();
  const base = baseDate(documentDate);

  if (!raw) {
    return { dueDate: null, netDays: null, recognized: false, explanation: 'לא הוגדרו תנאי תשלום — לא ייקבע תאריך יעד' };
  }

  const n = normalize(raw);

  // תנאי מפוצל — מקדמה + יתרה. אין לו תאריך יעד יחיד, וכל ניחוש כאן היה
  // רושם בספרים מועד שלא סוכם. עדיף בלי תאריך.
  if (/\d+%/.test(n) && /(מקדמה|בסיום|יתרה)/.test(n)) {
    return {
      dueDate: null,
      netDays: null,
      recognized: false,
      explanation: 'תנאי תשלום מפוצל (מקדמה + יתרה) — אין תאריך יעד יחיד, לא ייקבע תאריך',
    };
  }

  // מיידי. כולל צ'ק ואשראי: אלה אמצעי תשלום שנמסרים במעמד ההנפקה, ולכן תאריך
  // היעד הוא תאריך המסמך. (normalize מסיר גרשיים, ולכן "צ׳ק" ו-"צ'ק" → "צק".)
  if (/מזומן|מראש|עםקבלת|במעמד|צק|שיק|אשראי|כרטיס/.test(n)) {
    return {
      dueDate: toYmd(base),
      netDays: 0,
      recognized: true,
      explanation: 'תשלום מיידי — תאריך היעד הוא תאריך המסמך',
    };
  }

  // "שוטף + N" / "נטו N" / כל מספר שצמוד ל"שוטף".
  const m = n.match(/(?:שוטף|נטו|net)\+?(\d{1,3})/i) ?? n.match(/^\+?(\d{1,3})$/);
  if (m) {
    const days = parseInt(m[1], 10);
    if (Number.isFinite(days) && days >= 0 && days <= 365) {
      if (counting === 'endOfMonth') {
        const due = addDays(endOfMonth(base), days);
        return {
          dueDate: toYmd(due),
          netDays: days,
          recognized: true,
          explanation: `שוטף + ${days}: סוף חודש ${toYmd(endOfMonth(base))} ועוד ${days} ימים`,
        };
      }
      const due = addDays(base, days);
      return {
        dueDate: toYmd(due),
        netDays: days,
        recognized: true,
        explanation: `נטו ${days}: ${days} ימים מתאריך המסמך`,
      };
    }
  }

  // "שוטף" בלי מספר — לא ברור כמה. עדיף בלי תאריך מאשר להמציא 30.
  if (/שוטף/.test(n)) {
    return {
      dueDate: null,
      netDays: null,
      recognized: false,
      explanation: 'תנאי "שוטף" ללא מספר ימים — לא ניתן לגזור תאריך יעד',
    };
  }

  return {
    dueDate: null,
    netDays: null,
    recognized: false,
    explanation: `תנאי התשלום "${raw}" אינו מזוהה — לא ייקבע תאריך יעד`,
  };
}
