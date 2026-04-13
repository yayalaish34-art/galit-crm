import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const items = [
  /* ── קרינה ── */
  { itemCode: 'RAD-001', name: 'בדיקת קרינה בלתי מייננת – שדות חשמליים', description: 'מדידת שדות חשמליים (ELF) בסביבת קווי מתח גבוה ותחנות כוח', billingUnit: 'יחידה', basePrice: 1200, serviceCategory: 'קרינה' },
  { itemCode: 'RAD-002', name: 'בדיקת קרינה בלתי מייננת – שדות מגנטיים', description: 'מדידת שדות מגנטיים סביב מתקני חשמל ומשדרים', billingUnit: 'יחידה', basePrice: 1200, serviceCategory: 'קרינה' },
  { itemCode: 'RAD-003', name: 'בדיקת קרינה – אנטנות סלולר', description: 'מדידה ואפיון קרינה בלתי מייננת ממגדלי סלולר ואנטנות', billingUnit: 'יחידה', basePrice: 1800, serviceCategory: 'קרינה' },
  { itemCode: 'RAD-004', name: 'בדיקת קרינה – ציוד רפואי ותעשייתי', description: 'מדידת קרינה מייננת ובלתי מייננת ממכשור רפואי', billingUnit: 'יחידה', basePrice: 2200, serviceCategory: 'קרינה' },
  { itemCode: 'RAD-005', name: 'סקר קרינה – משרדים ומבני מגורים', description: 'סקר מקיף של מקורות קרינה בסביבת מגורים ועבודה', billingUnit: 'יחידה', basePrice: 950, serviceCategory: 'קרינה' },
  { itemCode: 'RAD-006', name: 'דוח קרינה ורישוי – חוות רוח', description: 'הכנת דוח קרינה לצורך רישוי מתקני אנרגיה מתחדשת', billingUnit: 'דוח', basePrice: 4500, serviceCategory: 'קרינה' },

  /* ── אקוסטיקה ── */
  { itemCode: 'ACO-001', name: 'בדיקת רעש – תעסוקתי', description: 'מדידת רמות רעש תעסוקתי לפי תקן IS 1001', billingUnit: 'יחידה', basePrice: 1400, serviceCategory: 'אקוסטיקה' },
  { itemCode: 'ACO-002', name: 'מדידת רעש סביבתי – שכונתי', description: 'מדידת רמות רעש לפי תקן IS 1257 בסביבה עירונית', billingUnit: 'יחידה', basePrice: 1600, serviceCategory: 'אקוסטיקה' },
  { itemCode: 'ACO-003', name: 'ניתוח ספקטרלי – רעש תעשייתי', description: 'ניתוח ספקטרום תדרים של מקורות רעש תעשייתיים', billingUnit: 'שעה', basePrice: 600, serviceCategory: 'אקוסטיקה' },
  { itemCode: 'ACO-004', name: 'בדיקת רעש – מתקן מיזוג אוויר', description: 'מדידת רעש ורטט ממערכות מיזוג ואוורור', billingUnit: 'יחידה', basePrice: 900, serviceCategory: 'אקוסטיקה' },
  { itemCode: 'ACO-005', name: 'דוח אקוסטי לצורך היתר בנייה', description: 'הכנת תסקיר אקוסטי לרשות מקומית', billingUnit: 'דוח', basePrice: 5500, serviceCategory: 'אקוסטיקה' },
  { itemCode: 'ACO-006', name: 'מדידת רעש – מפעל / מחסן', description: 'מדידה מקיפה של רמות רעש בסביבת עבודה תעשייתית', billingUnit: 'יחידה', basePrice: 2000, serviceCategory: 'אקוסטיקה' },
  { itemCode: 'ACO-007', name: 'ייעוץ אקוסטי ופתרונות בידוד', description: 'ייעוץ מקצועי לצמצום רעש ומתן המלצות טכניות', billingUnit: 'שעה', basePrice: 700, serviceCategory: 'אקוסטיקה' },
  { itemCode: 'ACO-008', name: 'מדידת רטט – מפעל / ציוד', description: 'מדידת רטט ממכונות ויסודות מבנה', billingUnit: 'יחידה', basePrice: 1100, serviceCategory: 'אקוסטיקה' },

  /* ── ראדון ── */
  { itemCode: 'RDN-001', name: 'מדידת ראדון – מגורים', description: 'מדידת ריכוז גז ראדון בדירות מגורים בשיטת מצלמות אלפא', billingUnit: 'יחידה', basePrice: 750, serviceCategory: 'ראדון' },
  { itemCode: 'RDN-002', name: 'מדידת ראדון – מקום עבודה', description: 'מדידת ראדון בסביבת עבודה תת-קרקעית', billingUnit: 'יחידה', basePrice: 900, serviceCategory: 'ראדון' },
  { itemCode: 'RDN-003', name: 'סקר ראדון – מוסד חינוכי', description: 'סקר ראדון מקיף בבתי ספר, גנים ומוסדות ציבור', billingUnit: 'יחידה', basePrice: 1800, serviceCategory: 'ראדון' },
  { itemCode: 'RDN-004', name: 'מדידת ראדון ארוכת טווח – 90 יום', description: 'מדידה פאסיבית של ראדון לתקופה של 90 יום', billingUnit: 'יחידה', basePrice: 850, serviceCategory: 'ראדון' },
  { itemCode: 'RDN-005', name: 'ייעוץ והמלצות להפחתת ראדון', description: 'ייעוץ מקצועי ופתרונות הנדסיים להפחתת ריכוז ראדון', billingUnit: 'שעה', basePrice: 600, serviceCategory: 'ראדון' },

  /* ── איכות אוויר פנים ── */
  { itemCode: 'IAQ-001', name: 'בדיקת איכות אוויר – CO₂ ולחות', description: 'מדידת ריכוז CO₂, טמפרטורה ולחות יחסית במשרדים', billingUnit: 'יחידה', basePrice: 1100, serviceCategory: 'איכות אוויר פנים' },
  { itemCode: 'IAQ-002', name: 'בדיקת VOC – תרכובות אורגניות נדיפות', description: 'מדידת VOC ומזהמים אורגניים נדיפים בסביבת עבודה', billingUnit: 'יחידה', basePrice: 1600, serviceCategory: 'איכות אוויר פנים' },
  { itemCode: 'IAQ-003', name: 'ניתוח עובש ופטריות אוויריות', description: 'דגימת אוויר וניתוח ספירת פטריות ועובש', billingUnit: 'דגימה', basePrice: 850, serviceCategory: 'איכות אוויר פנים' },
  { itemCode: 'IAQ-004', name: 'בדיקת פורמלדהיד – מבנה חדש', description: 'מדידת ריכוז פורמלדהיד ופגשי ריצוף חדשים', billingUnit: 'יחידה', basePrice: 1200, serviceCategory: 'איכות אוויר פנים' },
  { itemCode: 'IAQ-005', name: 'סקר מקיף – Sick Building Syndrome', description: 'חקירה מקיפה של בניין חולה: איכות אוויר, לחות, עובש', billingUnit: 'יחידה', basePrice: 4200, serviceCategory: 'איכות אוויר פנים' },
  { itemCode: 'IAQ-006', name: 'בדיקת חלקיקים – PM2.5 ו-PM10', description: 'מדידת חלקיקים מרחפים בסביבת עבודה ואורבנית', billingUnit: 'יחידה', basePrice: 1300, serviceCategory: 'איכות אוויר פנים' },
  { itemCode: 'IAQ-007', name: 'מדידת CO – פחמן חד חמצני', description: 'מדידת ריכוז פחמן חד חמצני – מחסנים, מוסכים, חניונים', billingUnit: 'יחידה', basePrice: 800, serviceCategory: 'איכות אוויר פנים' },

  /* ── אסבסט ── */
  { itemCode: 'ASB-001', name: 'סקר אסבסט – מבנה מגורים', description: 'זיהוי ומיפוי אסבסט בבתי מגורים טרום הריסה/שיפוץ', billingUnit: 'יחידה', basePrice: 2200, serviceCategory: 'אסבסט' },
  { itemCode: 'ASB-002', name: 'סקר אסבסט – מבנה תעשייתי', description: 'סקר אסבסט מקיף במפעלים ומבני תעשייה', billingUnit: 'יחידה', basePrice: 3800, serviceCategory: 'אסבסט' },
  { itemCode: 'ASB-003', name: 'ניתוח דגימת אסבסט – מעבדה', description: 'ניתוח דגימת חומר חשוד במיקרוסקופיה PCOM/TEM', billingUnit: 'דגימה', basePrice: 420, serviceCategory: 'אסבסט' },
  { itemCode: 'ASB-004', name: 'ניטור אוויר – עבודות אסבסט', description: 'מדידת סיבי אסבסט באוויר במהלך עבודות פירוק', billingUnit: 'שעה', basePrice: 550, serviceCategory: 'אסבסט' },
  { itemCode: 'ASB-005', name: 'דוח אסבסט – היתר הריסה', description: 'הכנת דוח אסבסט לרשות המקומית לצורך היתר הריסה', billingUnit: 'דוח', basePrice: 3500, serviceCategory: 'אסבסט' },
  { itemCode: 'ASB-006', name: 'ליווי פירוק אסבסט – מפקח מורשה', description: 'נוכחות מפקח מורשה עבור עבודות פירוק אסבסט', billingUnit: 'יום', basePrice: 2800, serviceCategory: 'אסבסט' },

  /* ── ייעוץ סביבתי ── */
  { itemCode: 'ENV-001', name: 'תסקיר השפעה על הסביבה (תש"ס)', description: 'הכנת תסקיר השפעה סביבתי לפרויקטים גדולים', billingUnit: 'פרויקט', basePrice: 35000, serviceCategory: 'ייעוץ סביבתי' },
  { itemCode: 'ENV-002', name: 'בדיקת קרקע ומי תהום – סקר שלב א׳', description: 'סקר היסטורי ואיתור מוקדי זיהום פוטנציאליים', billingUnit: 'פרויקט', basePrice: 8500, serviceCategory: 'ייעוץ סביבתי' },
  { itemCode: 'ENV-003', name: 'בדיקת קרקע ומי תהום – סקר שלב ב׳', description: 'דיגום ובדיקות מעבדה לאפיון זיהום קרקע', billingUnit: 'פרויקט', basePrice: 18000, serviceCategory: 'ייעוץ סביבתי' },
  { itemCode: 'ENV-004', name: 'ייעוץ סביבתי שוטף', description: 'ייעוץ שוטף לעמידה בדרישות הסביבה ורגולציה', billingUnit: 'שעה', basePrice: 750, serviceCategory: 'ייעוץ סביבתי' },
  { itemCode: 'ENV-005', name: 'הכנת תוכנית ניטור סביבתי', description: 'תכנון מערך ניטור סביבתי לאתרים תעשייתיים', billingUnit: 'פרויקט', basePrice: 12000, serviceCategory: 'ייעוץ סביבתי' },
  { itemCode: 'ENV-006', name: 'ביקורת סביבתית – מפעל / מחסן', description: 'ביקורת עמידה בחוק הגנת הסביבה ודרישות רישוי', billingUnit: 'יחידה', basePrice: 4500, serviceCategory: 'ייעוץ סביבתי' },
  { itemCode: 'ENV-007', name: 'ניהול פסולת מסוכנת – ייעוץ', description: 'ייעוץ לגריסת ופינוי פסולת מסוכנת כחוק', billingUnit: 'שעה', basePrice: 700, serviceCategory: 'ייעוץ סביבתי' },
  { itemCode: 'ENV-008', name: 'בדיקת רעש – פס ייצור / אתר בנייה', description: 'מדידת רמות רעש ורטט מאתרי בנייה', billingUnit: 'יחידה', basePrice: 1700, serviceCategory: 'ייעוץ סביבתי' },

  /* ── בטיחות תעסוקתית ── */
  { itemCode: 'OHS-001', name: 'מדידת תאורה – סביבת עבודה', description: 'מדידת עוצמת תאורה לפי תקן IS 1844', billingUnit: 'יחידה', basePrice: 850, serviceCategory: 'בטיחות תעסוקתית' },
  { itemCode: 'OHS-002', name: 'בדיקת חשיפה כימית – אוויר עבודה', description: 'דגימה ואנליזה של חשיפה לחומרים כימיים בעבודה', billingUnit: 'דגימה', basePrice: 620, serviceCategory: 'בטיחות תעסוקתית' },
  { itemCode: 'OHS-003', name: 'מדידת חום ותנאי מיקרוקלימה', description: 'מדידת WBGT ותנאי מיקרוקלימה בסביבת עבודה', billingUnit: 'יחידה', basePrice: 1000, serviceCategory: 'בטיחות תעסוקתית' },
  { itemCode: 'OHS-004', name: 'הדרכת בטיחות – חשיפות פיזיקליות', description: 'הדרכת עובדים בנושאי קרינה, רעש ואיכות אוויר', billingUnit: 'שעה', basePrice: 500, serviceCategory: 'בטיחות תעסוקתית' },
  { itemCode: 'OHS-005', name: 'סקר ארגונומי – תחנות עבודה', description: 'סקר ארגונומי ובדיקת תנאי עבודה למניעת פגיעות', billingUnit: 'יחידה', basePrice: 1500, serviceCategory: 'בטיחות תעסוקתית' },
  { itemCode: 'OHS-006', name: 'ניטור גזים ואדים – סביבת עבודה', description: 'ניטור רציף של גזים מסוכנים בסביבת עבודה', billingUnit: 'יחידה', basePrice: 1300, serviceCategory: 'בטיחות תעסוקתית' },

  /* ── מים ── */
  { itemCode: 'WTR-001', name: 'בדיקת מים – כימי ובקטריולוגי', description: 'ניתוח מים שתייה לפי ת"י 1461', billingUnit: 'דגימה', basePrice: 480, serviceCategory: 'מים' },
  { itemCode: 'WTR-002', name: 'ניתוח מי שפכים תעשייתיים', description: 'דגימה ובדיקת שפכים לפני פריקה לביוב עירוני', billingUnit: 'דגימה', basePrice: 950, serviceCategory: 'מים' },
  { itemCode: 'WTR-003', name: 'בדיקת מי קידוח ומי תהום', description: 'ניתוח כימי ומיקרוביולוגי של מי תהום', billingUnit: 'דגימה', basePrice: 1100, serviceCategory: 'מים' },

  /* ── שירותים כלליים ── */
  { itemCode: 'GEN-001', name: 'ביקור ייעוץ ראשוני – אבחון שטח', description: 'ביקור ראשוני לאיתור צרכים ותכנון בדיקות', billingUnit: 'ביקור', basePrice: 400, serviceCategory: 'שירותים כלליים' },
  { itemCode: 'GEN-002', name: 'הכנת דוח מסכם רב-תחומי', description: 'הכנת דוח מסכם המאגד ממצאים ממגוון בדיקות', billingUnit: 'דוח', basePrice: 2800, serviceCategory: 'שירותים כלליים' },
  { itemCode: 'GEN-003', name: 'עדות מומחה / חוות דעת משפטית', description: 'הכנת חוות דעת מקצועית להליכים משפטיים', billingUnit: 'שעה', basePrice: 1200, serviceCategory: 'שירותים כלליים' },
];

async function main() {
  console.log(`Seeding ${items.length} catalog items...`);
  let created = 0;
  let skipped = 0;

  for (const item of items) {
    const existing = await prisma.quoteItemCatalog.findUnique({ where: { itemCode: item.itemCode } });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.quoteItemCatalog.create({
      data: {
        itemCode: item.itemCode,
        name: item.name,
        description: item.description,
        billingUnit: item.billingUnit,
        basePrice: item.basePrice,
        serviceCategory: item.serviceCategory,
        vatPercent: 18,
        isActive: true,
        requiresQuantity: true,
        requiresSiteVisit: false,
        requiresReport: false,
      },
    });
    created++;
  }

  console.log(`Done. Created: ${created}, Skipped (already exist): ${skipped}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
