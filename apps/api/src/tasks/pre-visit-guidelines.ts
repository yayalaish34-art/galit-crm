/**
 * הנחיות ללקוח לפני בדיקה — נשלחות אוטומטית יום לפני מועד התיאום.
 *
 * רלוונטי לשתי בדיקות איכות אוויר בלבד (לפי קוד השירות / productName):
 *   72 — בדיקת איכות אוויר תוך-מבנית
 *   69 — דיגום עובשים באוויר
 * לכל בדיקה נוסח הנחיות משלה. שירות שאינו אחד מהשניים → אין אוטומציה.
 *
 * הטקסטים לקוחים ממסמך "הנחיות לפני בדיקת איכות אוויר תוך.pdf".
 */

/** קוד השירות של בדיקת איכות אוויר תוך-מבנית. */
export const SKU_INDOOR_AIR = '72';
/** קוד השירות של דיגום עובשים באוויר. */
export const SKU_MOLD = '69';

/** קודי השירות שעבורם קיימות הנחיות לפני בדיקה. */
export const PRE_VISIT_SKUS: readonly string[] = [SKU_INDOOR_AIR, SKU_MOLD];

export type PreVisitGuideline = {
  /** קוד השירות */
  sku: string;
  /** שם הבדיקה — לכותרת המייל ולתצוגה בממשק */
  testName: string;
  /** כותרת מסמך ההנחיות */
  title: string;
  /** סעיפי ההנחיות. פריט עם `sub` מרנדר רשימת תת-סעיפים מתחתיו. */
  items: Array<{ text: string; sub?: string[] }>;
};

const INDOOR_AIR: PreVisitGuideline = {
  sku: SKU_INDOOR_AIR,
  testName: 'בדיקת איכות אוויר תוך-מבנית',
  title: 'הנחיות לפני בדיקת איכות אוויר תוך-מבנית',
  items: [
    {
      text: 'יש להשאיר את המבנה במצב השימוש הרגיל שלו לפני הבדיקה. אין לבצע אוורור חריג או להשאיר חלונות פתוחים במיוחד לקראת הגעת הבודק.',
    },
    {
      text: 'במהלך 12 השעות שלפני הבדיקה, יש להימנע ככל האפשר מפעולות העלולות להשפיע זמנית על איכות האוויר, כגון:',
      sub: [
        'עישון.',
        'בישול או טיגון ממושך.',
        'הדלקת נרות, קטורת או מבשמי אוויר.',
        'שימוש בתרסיסים, חומרי הדברה, חומרי ניקוי חזקים, בשמים או צבעים.',
        'שאיבת אבק או ניקוי יסודי בסמוך למועד הבדיקה.',
      ],
    },
    {
      text: 'אין להפעיל מטהרי אוויר, מכשירי אוזון, מפיצי ריח או מכשירים דומים לפני הבדיקה, אלא אם הם מופעלים באופן קבוע והבדיקה נועדה לבחון את מצב האוויר בזמן הפעלתם.',
    },
    {
      text: 'מערכות מיזוג, אוורור וחימום יופעלו באופן הרגיל שבו הן פועלות ביום־יום. אין לשנות את תנאי ההפעלה במיוחד לקראת הבדיקה.',
    },
    {
      text: 'אין לצבוע, לשפץ, לבצע קידוחים, הדברה או עבודות ניקיון חריגות לפני הבדיקה. אם בוצעה פעולה כזאת במהלך הימים האחרונים, יש לעדכן את הבודק מראש.',
    },
    {
      text: 'יש לאפשר לבודק גישה לכל החדרים, למערכות המיזוג, לפתחי האוורור ולמקומות שבהם קיימים ריח, רטיבות, עובש או תלונות אחרות.',
    },
    {
      text: 'מומלץ להכין מראש מידע בנוגע לתלונה:',
      sub: [
        'באילו חדרים מורגשת הבעיה.',
        'באילו שעות או תנאים היא מחמירה.',
        'מתי החלה התופעה.',
        'האם בוצעו שיפוצים, הדברה, החלפת ריהוט או טיפול ברטיבות.',
        'האם קיימים תסמינים שחוזרים בזמן השהייה במקום.',
      ],
    },
    {
      text: 'יש לעדכן את הבודק מראש לגבי בעלי חיים, אזורים נעולים, מגבלות כניסה או צורך בתיאום מול ועד הבית, חברת הניהול או גורם אחר.',
    },
  ],
};

const MOLD: PreVisitGuideline = {
  sku: SKU_MOLD,
  testName: 'בדיקת עובש באוויר',
  title: 'הנחיות לפני בדיקת עובש באוויר',
  items: [
    { text: 'יש לסגור חלונות ודלתות חיצוניות 24 שעות לפני הבדיקה, ככל האפשר.' },
    { text: 'לא לבצע ניקיון יסודי, שאיבה חזקה, ניגוב אבק משמעותי או שטיפה חריגה לפני הבדיקה.' },
    { text: 'לא לרסס, לחטא, לצבוע, לגרד כתמים או לבצע טיפול בעובש לפני הבדיקה.' },
    { text: 'לא להשתמש במטהרי אוויר, מפיצי ריח, נרות ריחניים, קטורת או חומרי ריח לפני הבדיקה.' },
    { text: 'אם קיימת מערכת מיזוג — להפעיל אותה כפי שהיא פועלת בדרך כלל, אלא אם ניתנה הנחיה אחרת.' },
    { text: 'לא להזיז רהיטים כבדים או לפתוח קירות/תקרות לפני הבדיקה.' },
    { text: 'לאפשר לבודק גישה לחדרים שבהם קיימים ריח טחב, סימני רטיבות, כתמים, קילופי צבע, התנפחות טיח או חשש לעובש.' },
    { text: 'לעדכן את הבודק אם הייתה בעבר נזילה, הצפה, חדירת מים, תיקוני צבע/טיח או טיפול קודם בעובש.' },
    { text: 'במידה ויש מוקד חשוד לעובש גלוי — לא לנקות אותו לפני הבדיקה.' },
  ],
};

const BY_SKU: Record<string, PreVisitGuideline> = {
  [SKU_INDOOR_AIR]: INDOOR_AIR,
  [SKU_MOLD]: MOLD,
};

/** מחזיר את ההנחיות המתאימות לקוד השירות, או null אם לבדיקה אין הנחיות. */
export function getPreVisitGuideline(sku: string | null | undefined): PreVisitGuideline | null {
  const key = String(sku ?? '').trim();
  return BY_SKU[key] ?? null;
}

/** האם לשירות הזה קיימות הנחיות לפני בדיקה (כלומר — ניתן להפעיל את האוטומציה). */
export function hasPreVisitGuideline(sku: string | null | undefined): boolean {
  return getPreVisitGuideline(sku) !== null;
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** פורמט תאריך+שעה בעברית לציון מועד הבדיקה בגוף המייל. */
function formatHe(when: Date): string {
  try {
    return new Intl.DateTimeFormat('he-IL', {
      weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem',
    }).format(when);
  } catch {
    return when.toISOString();
  }
}

/**
 * בונה את גוף המייל (HTML, RTL) עם ההנחיות לבדיקה.
 * הנוסח נשלח כטקסט בגוף המייל — לא כקובץ מצורף.
 */
export function buildPreVisitEmailHtml(opts: {
  guideline: PreVisitGuideline;
  customerName?: string | null;
  scheduledStartAt?: Date | null;
  siteAddress?: string | null;
}): string {
  const { guideline, customerName, scheduledStartAt, siteAddress } = opts;
  const greeting = customerName?.trim() ? `שלום ${esc(customerName.trim())},` : 'שלום,';
  const whenLine = scheduledStartAt
    ? `<p style="margin:0 0 6px">מועד הבדיקה: <strong>${esc(formatHe(scheduledStartAt))}</strong></p>`
    : '';
  const whereLine = siteAddress?.trim()
    ? `<p style="margin:0 0 6px">כתובת: <strong>${esc(siteAddress.trim())}</strong></p>`
    : '';

  const items = guideline.items
    .map((it) => {
      const sub = it.sub?.length
        ? `<ul style="margin:6px 0 0;padding-inline-start:20px;color:#334155">${it.sub
            .map((s) => `<li style="margin:0 0 4px">${esc(s)}</li>`)
            .join('')}</ul>`
        : '';
      return `<li style="margin:0 0 10px;line-height:1.7">${esc(it.text)}${sub}</li>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="he" dir="rtl"><body style="margin:0;padding:0;background:#f5faf6">
  <div style="max-width:640px;margin:0 auto;padding:24px 16px;font-family:Arial,'Segoe UI',sans-serif;color:#0f172a" dir="rtl">
    <div style="background:#ffffff;border-radius:16px;padding:24px;box-shadow:0 6px 20px rgba(15,23,42,0.08)">
      <h2 style="margin:0 0 4px;font-size:20px;color:#166534">${esc(guideline.title)}</h2>
      <p style="margin:0 0 16px;font-size:13px;color:#64748b">${esc(guideline.testName)}</p>

      <p style="margin:0 0 12px">${greeting}</p>
      <p style="margin:0 0 12px">
        לקראת הבדיקה שתתבצע אצלכם, ריכזנו כאן הנחיות חשובות. הקפדה עליהן נדרשת כדי
        שתוצאות הבדיקה ישקפו נכונה את מצב האוויר במקום.
      </p>
      ${whenLine}
      ${whereLine}

      <ol style="margin:16px 0 0;padding-inline-start:20px">${items}</ol>

      <p style="margin:20px 0 0;font-size:13px;color:#475569">
        לשאלות או עדכון פרטים לפני הבדיקה — נשמח שתשיבו למייל זה.
      </p>
      <p style="margin:12px 0 0;font-size:13px;color:#166534;font-weight:bold">גלית בקרת איכות הסביבה</p>
    </div>
  </div>
</body></html>`;
}
