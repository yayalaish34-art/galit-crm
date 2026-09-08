/**
 * זיהוי "אישור דיוור" מתוך גוף הליד שהגיע מהאתר galit.co.il.
 *
 * למה זה נדרש: כל 9 טפסי האלמנטור באתר כוללים שדה acceptance בשם `marketing_consent`
 * ("אני מאשר/ת קבלת עדכונים, מבצעים ותכנים שיווקיים מגלית בדוא"ל וב-SMS"). הטפסים
 * שולחים מייל התראה עם [all-fields], כלומר השדה מגיע ל-CRM כשורה בגוף המייל — אבל
 * *רק* כטקסט, אין שדה מובנה. טופס 4980 ("צור קשר צדדי") הוא היחיד עם תבנית מפורשת
 * ושם השורה מסומנת "אישור דיוור:".
 *
 * לכן ההסכמה נקראת מהטקסט. הפונקציה שמרנית בכוונה: כשלא ברור — מחזירה null
 * ("לא ידוע") ולא false, כדי שלקוח לא ייחשב כמסרב בגלל ניסוח שלא זוהה.
 */

/** התוויות שמופיעות בפועל בגוף המייל מהטפסים. */
const CONSENT_LABELS = [
  'אישור דיוור',
  'marketing_consent',
  'marketing consent',
  'הסכמה לדיוור',
  'אישור קבלת דיוור',
];

/** ערכים ש-Elementor שולח כשהתיבה סומנה / לא סומנה. */
const YES_VALUES = ['on', 'yes', 'true', '1', 'כן', 'מאושר', 'אישר', 'v', '✓', '✔'];
const NO_VALUES = ['off', 'no', 'false', '0', 'לא', 'לא אושר', '-', '—'];

/** נוסח התיבה עצמה — כשהיא מסומנת, [all-fields] מדפיס את הטקסט המלא. */
const CONSENT_SENTENCE = /אני\s+מאשר\/?ת?\s+קבלת\s+עדכונים/;

export interface MarketingConsentRead {
  /** true = אישר, false = סורב במפורש, null = לא ידוע (אין שדה בגוף). */
  consent: boolean | null;
  /** התווית/השורה שממנה הוסק — לתיעוד ב-marketingConsentSource. */
  evidence: string | null;
}

/**
 * קורא את הסכמת הדיוור מתוך גוף הליד. מחזיר null כשאין שום אזכור של השדה —
 * זה המצב של לידים ישנים שנקלטו לפני שהשדה נוסף לטפסים.
 */
export function readMarketingConsent(body?: string | null): MarketingConsentRead {
  const text = (body || '').trim();
  if (!text) return { consent: null, evidence: null };

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  // 1) "אישור דיוור: <ערך>" — הפורמט של טופס 4980 ושל [all-fields] עם תווית.
  for (const line of lines) {
    for (const label of CONSENT_LABELS) {
      const re = new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[:：]\\s*(.*)$`, 'i');
      const m = line.match(re);
      if (!m) continue;
      const value = (m[1] || '').trim().toLowerCase();
      // תווית בלי ערך = התיבה לא סומנה (Elementor משמיט את הערך).
      if (!value) return { consent: false, evidence: line };
      if (NO_VALUES.includes(value)) return { consent: false, evidence: line };
      if (YES_VALUES.includes(value) || CONSENT_SENTENCE.test(value)) {
        return { consent: true, evidence: line };
      }
      // ערך לא מוכר אבל קיים — נחשב אישור, כי Elementor מדפיס ערך רק כשסומן.
      return { consent: true, evidence: line };
    }
  }

  // 2) נוסח התיבה עצמה מופיע בגוף — [all-fields] מדפיס אותו רק כשהיא סומנה.
  const sentenceLine = lines.find((l) => CONSENT_SENTENCE.test(l));
  if (sentenceLine) return { consent: true, evidence: sentenceLine };

  return { consent: null, evidence: null };
}
