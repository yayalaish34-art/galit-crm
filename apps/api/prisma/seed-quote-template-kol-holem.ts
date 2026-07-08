/**
 * Seed script: inserts the "בדיקת קול הולם אקוסטיקה" quote merge template.
 * Run: npx tsx apps/api/prisma/seed-quote-template-kol-holem.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TEMPLATE_NAME = 'בדיקת קול הולם אקוסטיקה';
const SERVICE_TYPE = 'אקוסטיקה / רעש';

/* ── introHtml ── Opening: header, customer details, subject line, company intro */
const introHtml = `
<div dir="rtl" style="font-family:'David','Arial',sans-serif;font-size:13px;line-height:1.7;">
  <h2 style="text-align:center;margin-bottom:4px;">סקר חוזה מס': {{quoteNumber}}</h2>

  <p><strong>לכבוד</strong><br/>{{customerName}}</p>
  <p>נייד: {{customerPhone}}<br/>מייל: {{customerEmail}}</p>

  <p><strong>הנדון:</strong> הצעת מחיר לבדיקת עמידה בתקן ישראלי ת&quot;י 1004 חלק 1 אקוסטיקת מבנים – מדד הקול ההולם לרבות מעברי איגוף L'n,w</p>

  <p>שלום רב,</p>

  <p>גלית – החברה לאיכות הסביבה בע״מ היא חברה ותיקה ומובילה בתחומה, בעלת ניסיון של כ-30 שנה בביצוע בדיקות סביבתיות, מדידות רעש וייעוץ אקוסטי.</p>

  <p>החברה מפעילה מעבדה מוסמכת לבדיקות רעש ואקוסטיקה לפי תקן ISO/IEC 17025, בהסמכת הרשות הלאומית להסמכת מעבדות, וכן מוכרת ע״י מכון התקנים הישראלי בתקן ISO 9001 לניהול איכות ובתקן ISO 14001 לניהול סביבתי.</p>

  <p>החברה משרתת מגוון רחב של לקוחות – מוסדות ציבור, רשויות, גופים ממשלתיים, חברות תשתית ולקוחות פרטיים – תוך שמירה על סטנדרטים מקצועיים מהגבוהים בענף, ציוד מדידה מתקדם, צוות בודקים מוסמכים ונהלי איכות מוקפדים.</p>
</div>
`.trim();

/* ── bodyHtml ── Technical description, methodology, general notes */
const bodyHtml = `
<div dir="rtl" style="font-family:'David','Arial',sans-serif;font-size:13px;line-height:1.7;">
  <p>בהמשך לפנייתך, אנו מתכבדים להציע מתווה לביצוע בדיקת עמידה בתקן ישראלי ת&quot;י 1004 חלק 1 אקוסטיקת מבנים – מדד הקול ההולם לרבות מעברי איגוף L'n,w ב{{customerAddress}}.</p>

  <h3>מטרה</h3>
  <p>בדיקת רמת הבידוד האקוסטי הנדרש לקול הולם עבור צמד תקרה רצפה בין דירות צמודות.</p>

  <h3>תיאור המקרה</h3>
  <p>בדירה תחתונה נשמעים נקישות, הליכה והזזת רהיטים של השכנים.</p>

  <h3>ביצוע בדיקות ע&quot;פ המפרט הבא:</h3>
  <p>הגעת בודק מוסמך ממעבדה לאתר הנבדק.</p>
  <ul>
    <li>ביצוע מדידות באופן הבא: פטישיה תקנית מוצבת בחדר מקור הרעש במספר נקודות בוחן. מפלסי לחץ הקול נמדדים בחדר בדירה סמוכה מעבר לקיר/צמד תקרה רצפה נבדק.</li>
    <li>מהלך המדידה מבוצע בהתאם לתקן ישראלי ת&quot;י 1034 חלק 7, אקוסטיקה: מדידת בידוד קול בבניינים ובאלמנטים בבניין – מדידות באתר של בידוד קול הולם ברצפות.</li>
    <li>חישוב זמן ההדהוד בחדר הקליטה מבוצע בהתאם ל ISO 3382-2. אפקט ההדהוד מושג כנדרש על ידי רמקול רב כיווני.</li>
    <li>המדידה מבוצעת בלפחות 3 מיקומים אקראיים בחדר הקליטה כאשר בכל נקודה מבוצעות 2 מדידות.</li>
    <li>תיקון לרעש הרקע מבוצע בהתאם לנדרש ב ת&quot;י 1034 חלק 7.</li>
    <li>הערכת שיעור הבידוד האקוסטי, מבוצע בהתאם לתקן ישראלי ת&quot;י 985, חלק 2: "אקוסטיקה – הערכת שיעור הבידוד האקוסטי בבניינים והבידוד האקוסטי של אלמנטים בבניין – בידוד מפני קול הולם". מ- מרץ 2014.</li>
    <li>הערכים הנמדדים ומחושבים נבחנים ביחס לתקן ישראלי ת&quot;י 1004-1: בידוד אקוסטי בבתי מגורים: קירות ותקרות (רצפות) בין דירות – דרישות ושיטות חישוב ובו הערכים הנדרשים לעמידה בתקן.</li>
    <li>כלל שיטות העבודה ואופן ביצועה מבוססים על נהלי שיטות הבדיקה הישימים של המעבדה המוסמכת.</li>
    <li>דו&quot;ח סיכום המדידה הינו מסמך מעבדתי המהווה ראיה משפטית.</li>
    <li>דו&quot;ח סיכום המדידה יועבר בדוא&quot;ל למזמין עד 14 ימי עבודה, כפוף לכוח עליון ובלתי צפוי מראש.</li>
    <li>תיאום המדידה יבוצע תוך 7 ימי עבודה מאישור ההזמנה.</li>
    <li>מזמין העבודה מתחייב לעמוד בתנאי התשלום המפורטים בסקר חוזה זה.</li>
  </ul>

  <h3>הערות כלליות</h3>
  <ul>
    <li>נדרש תיאום וזמינות לביצוע המדידה במבנה הנבדק ובחלל הגובל אליו מיוחסת המדידה (כגון דירה סמוכה, משרד צמוד או חדר אחר).</li>
    <li>יש להקצות משך זמן של עד 120 דקות לצורך ביצוע המדידה בחללים הנבדקים, בהתאם לאופי המבנה.</li>
    <li>יש לוודא היעדר שטיח/פרקט המכסה את פני רצפת צמד תקרה/רצפה הנבדק.</li>
    <li>במהלך המדידה מיוצר לחץ קול בעוצמה גבוהה בחדר קולט הרעש. רעש גבוה זה ישמע בכלל חלל הדירה למשך עד כ-2 דקות במצטבר.</li>
    <li>נדרש שקט יחסי באתר בעת המדידה – רעשי רקע חריגים (למשל: אתר בנייה, כלים חשמליים) עלולים להשפיע על תוצאות המדידה ולפגוע באמינותן.</li>
    <li>תוצאות התאמה למפרט אינה מתחשבת באי בערך אי וודאות של השיטה.</li>
    <li>במקרה של בדיקה תחת הסמכה, סמליל הרשות להסמכת מעבדות יופיע באופן אוטומטי על גבי הדוח. אם הלקוח מעוניין להסיר את הסמליל, עליו לפנות למעבדה טרם הפקת הדוח.</li>
  </ul>

  <h3>3. שכר טרחה</h3>
  <p>ראה נספח מס' 1.</p>

  <p>אשמח לענות על כל שאלה בנושא.</p>

  <p>בברכה,<br/>גלית – החברה לאיכות הסביבה בע״מ</p>
</div>
`.trim();

/* ── closingHtml ── Financial appendix with items table, totals, signature */
const closingHtml = `
<div dir="rtl" style="font-family:'David','Arial',sans-serif;font-size:13px;line-height:1.7;">
  <h3>מתן חוות דעת מומחה בנושא בדיקת רמת הבידוד האקוסטי הנדרש לקול הולם</h3>

  <h3>נספח מס 1: שכר טרחה והסדרי עבודה</h3>

  <p>מחיר ביצוע תכולת העבודה ע&quot;פ סעיף מס' 1 בהצעה הינו:</p>

  {{itemsTable}}

  <table dir="rtl" border="1" cellpadding="8" style="border-collapse:collapse;width:100%;max-width:720px;margin-top:8px;">
    <tr>
      <td style="border:1px solid #bbb;padding:4px 8px;font-weight:bold;">% הנחה</td>
      <td style="border:1px solid #bbb;padding:4px 8px;">{{discountPercent}}%</td>
    </tr>
    <tr>
      <td style="border:1px solid #bbb;padding:4px 8px;font-weight:bold;">סה&quot;כ לאחר הנחה</td>
      <td style="border:1px solid #bbb;padding:4px 8px;">{{subtotalAfterDiscount}}</td>
    </tr>
    <tr>
      <td style="border:1px solid #bbb;padding:4px 8px;font-weight:bold;">מע&quot;מ 18%</td>
      <td style="border:1px solid #bbb;padding:4px 8px;">{{vat}}</td>
    </tr>
    <tr>
      <td style="border:1px solid #bbb;padding:4px 8px;font-weight:bold;">סה&quot;כ לתשלום</td>
      <td style="border:1px solid #bbb;padding:4px 8px;font-weight:bold;">{{total}}</td>
    </tr>
  </table>

  <p style="margin-top:12px;">למען הסר ספק: במידה ונתבקש לבצע עבודות נוספות אשר אינן כלולות במסגרת הצעת עבודה זו נחייבכם בהתאם לשעות העבודה שנשקיע בפועל לאחר אישורכם לביצוען.</p>

  <p>תוצאות הבדיקות הינן אובייקטיביות, ומתבססות אך ורק על הנתונים שנמדדו בפועל ובהתאם לתקנים הרלוונטיים. אין באפשרות המזמין או הגורם המממן להשפיע על תוצאות אלו או לשנותן.</p>

  <p>לוחות זמנים: ייקבעו בהתאם לקבלת הזמנת העבודה.</p>

  <p>תנאי תשלום: {{paymentTerms}}</p>

  <p>תוקף ההצעה: {{validityDate}}</p>

  <p>תאריך הצעה: {{quoteDate}}</p>

  <p>הנני מאשר את ההצעה על כל סעיפיה.</p>

  <table dir="rtl" border="1" cellpadding="8" style="border-collapse:collapse;width:100%;max-width:720px;margin-top:12px;">
    <thead>
      <tr>
        <th style="border:1px solid #bbb;padding:4px 8px;background:#f5f5f5;">שם מלא של מאשר ההצעה</th>
        <th style="border:1px solid #bbb;padding:4px 8px;background:#f5f5f5;">חתימה</th>
        <th style="border:1px solid #bbb;padding:4px 8px;background:#f5f5f5;">חותמת</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style="border:1px solid #bbb;padding:8px;min-height:40px;">{{approverName}}</td>
        <td style="border:1px solid #bbb;padding:8px;min-height:40px;">&nbsp;</td>
        <td style="border:1px solid #bbb;padding:8px;min-height:40px;">&nbsp;</td>
      </tr>
    </tbody>
  </table>

  <p><strong>נספח א': תעודת הסמכה של הרשות להסמכת מעבדות</strong></p>
  <p><strong>נספח ב': תעודות ISO</strong></p>
</div>
`.trim();

/* ── termsHtml ── (Empty; terms are embedded in closingHtml for this template) */
const termsHtml = '';

const defaultLineItems = JSON.stringify([
  {
    name: 'בדיקת קול הולם – מדד L\'n,w',
    quantity: 1,
    unitPrice: 2000,
  },
]);

async function main() {
  // Check if template already exists
  const existing = await prisma.quoteTemplate.findFirst({
    where: { name: TEMPLATE_NAME },
  });

  if (existing) {
    console.log(`Template "${TEMPLATE_NAME}" already exists (id: ${existing.id}). Updating...`);
    await prisma.quoteTemplate.update({
      where: { id: existing.id },
      data: {
        serviceType: SERVICE_TYPE,
        isActive: true,
        introHtml,
        bodyHtml,
        closingHtml,
        termsHtml,
        variablesHelp: `{{quoteNumber}} — מספר סקר חוזה
{{customerName}} — שם לקוח
{{customerPhone}} — נייד
{{customerEmail}} — מייל
{{customerAddress}} — כתובת / מיקום הבדיקה
{{quoteDate}} — תאריך הצעה
{{itemsTable}} — טבלת פריטים (כולל מק"ט, תיאור, כמות, מחיר, הנחה, סה"כ)
{{discountPercent}} — אחוז הנחה כללי
{{subtotalAfterDiscount}} — סה"כ לאחר הנחה
{{vat}} — מע"מ 18%
{{total}} — סה"כ לתשלום
{{paymentTerms}} — תנאי תשלום
{{validityDate}} — תוקף ההצעה
{{approverName}} — שם מלא של מאשר ההצעה`,
        defaultLineItems: JSON.parse(defaultLineItems),
      },
    });
    console.log('Template updated successfully.');
  } else {
    const created = await prisma.quoteTemplate.create({
      data: {
        name: TEMPLATE_NAME,
        serviceType: SERVICE_TYPE,
        isActive: true,
        introHtml,
        bodyHtml,
        closingHtml,
        termsHtml,
        variablesHelp: `{{quoteNumber}} — מספר סקר חוזה
{{customerName}} — שם לקוח
{{customerPhone}} — נייד
{{customerEmail}} — מייל
{{customerAddress}} — כתובת / מיקום הבדיקה
{{quoteDate}} — תאריך הצעה
{{itemsTable}} — טבלת פריטים (כולל מק"ט, תיאור, כמות, מחיר, הנחה, סה"כ)
{{discountPercent}} — אחוז הנחה כללי
{{subtotalAfterDiscount}} — סה"כ לאחר הנחה
{{vat}} — מע"מ 18%
{{total}} — סה"כ לתשלום
{{paymentTerms}} — תנאי תשלום
{{validityDate}} — תוקף ההצעה
{{approverName}} — שם מלא של מאשר ההצעה`,
        defaultLineItems: JSON.parse(defaultLineItems),
      },
    });
    console.log(`Template "${TEMPLATE_NAME}" created successfully (id: ${created.id}).`);
  }
}

main()
  .catch((err) => {
    console.error('Error seeding template:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
