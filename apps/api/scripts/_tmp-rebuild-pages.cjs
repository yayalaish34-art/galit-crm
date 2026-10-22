/**
 * Rebuilds a WordPress service page in the asbestos-style design (see page 6785).
 *
 * Pipeline per page:
 *   1. Fetch the current page (so we can preserve existing media it references).
 *   2. Collect any images already attached (uploaded earlier) — these become the
 *      hero/deliverable images in the new layout, no new generation.
 *   3. Call OpenAI with a structured prompt → full JSON content for all 7
 *      sections tailored to this page's topic.
 *   4. Compose the 7 Elementor sections (sectionBuilders) → new _elementor_data.
 *   5. POST the updated page + clear Elementor cache.
 *
 * Usage:
 *   railway run node scripts/_tmp-rebuild-pages.cjs <plan-key>
 */
const fs = require('fs');
const { wp } = require('./_wp-lib.cjs');
const { composeElementorPage } = require('./_tmp-asbestos-design.cjs');

// Each plan ties a page id to its topic metadata and the images already
// uploaded for that page (ids from the earlier enrichment run). The design is
// shared; only content + colours change.
const PLANS = {
  'green-building': {
    palette: BRAND_GREEN(),
    pages: [
      {
        pageId: 7873,
        title: 'יועץ בנייה ירוקה מוסמך — תו תקן 5281',
        topic: 'ליווי וייעוץ בנייה ירוקה לפי תקן ישראלי 5281 — יועץ מוסמך שמלווה את הפרויקט משלב התכנון ועד קבלת התו, לקראת היתר בנייה.',
        topicSlug: 'green',
        imageIds: [16466, 16467, 16468],
      },
    ],
  },
  smell: {
    palette: BRAND_GREEN(),
    pages: [
      {
        pageId: 7819,
        title: 'בניית מודל לפיזור ריח',
        topic: 'בניית מודל אטמוספרי לפיזור ריח — דיגום מקור הפליטה, חישוב פיזור ברוח, מיפוי אזורי השפעה והגשת דוח רגולטורי למשרד להגנת הסביבה.',
        topicSlug: 'smellmodel',
        imageIds: [16470, 16471],
      },
      {
        pageId: 6458,
        title: 'חקירה ואיתור מטרדי ריח בבנייני משרדים ועסקים',
        topic: 'חקירה ואיתור מטרדי ריח בבניין משרדים/עסקים — מערכות מיזוג, שטחי שירות, חללים משותפים, זיהוי מקור הריח והמלצות טיפול.',
        topicSlug: 'smellbiz',
        imageIds: [16472, 16473],
      },
      {
        pageId: 6456,
        title: 'איתור מטרד ריח בבית פרטי',
        topic: 'איתור מטרד ריח בבית פרטי — ביוב, סיפונים, לחות סמויה, קירות, מערכת אוורור ומיזוג — אבחון שיטתי והמלצות תיקון.',
        topicSlug: 'smellhome',
        imageIds: [16475, 16476],
      },
      {
        pageId: 4575,
        title: 'מגוון פתרונות לריח רע',
        topic: 'מגוון טכנולוגיות טיפול בריח — פחם פעיל, ביופילטרים, סקרברים כימיים, אוזון, אוויריה — התאמת פתרון לפי אופי הזיהום ותקנות.',
        topicSlug: 'smellsol',
        imageIds: [16478, 16479],
      },
      {
        pageId: 4572,
        title: 'בדיקות ריח עבור עסקים',
        topic: 'בדיקות ריח לעסקים ולמפעלים — דיגום באתר, אנליזה אולפקטומטרית במעבדה, דוח רגולטורי מוכן להגשה למשרד להגנת הסביבה ולרשויות.',
        topicSlug: 'smellbizt',
        imageIds: [16480, 16481],
      },
      {
        pageId: 4569,
        title: 'בדיקה לקביעת מפגע ריח ע"י צוות מריחים',
        topic: 'צוות מריחים מוסמך מבצע סבב דגימות שדה סביב מקור הפליטה, מתעד עוצמה ואופי ריח בכל תחנה, ובונה מפת מפגע לדוח רגולטורי.',
        topicSlug: 'smellpanel',
        imageIds: [16482, 16483],
      },
      {
        pageId: 4566,
        title: 'מהו ריח? המדריך המקצועי',
        topic: 'הסבר מקצועי מהו ריח — מולקולות נדיפות באוויר, מנגנון הקליטה בקולטני האף, סף תפיסה, מקורות ריח נפוצים ודרכי המדידה המקובלות.',
        topicSlug: 'smellwhat',
        imageIds: [16485, 16486],
      },
    ],
  },

  radiation: {
    palette: BRAND_GREEN(),
    pages: [
      {
        pageId: 6120,
        title: 'בדיקת קרינה לגני ילדים',
        topic: 'בדיקת קרינה אלקטרומגנטית (ELF ו-RF) בגני ילדים — דגימת שדה מגנטי מרשת החשמל, לוחות ושנאים, וסקר קרינת רדיו מאנטנות סמוכות. התאמה להמלצות המשרד להגנת הסביבה לגני ילדים ודוח ממצאים מפורט להורים ולרשות.',
        topicSlug: 'radgan',
      },
      {
        pageId: 4475,
        title: 'בדיקת קרינת חשמל | בדיקת קרינה אלקטרומגנטית',
        topic: 'בדיקת קרינה אלקטרומגנטית (ELF) מרשת החשמל במבנים — לוחות ראשיים, שנאי קומה, כבלים, שעוני חשמל, חדרי מכונות. מדידה בעומס אופייני, השוואה לסף 4/10 מיליגאוס לפי אפיון, המלצות הפחתה.',
        topicSlug: 'radelf',
      },
      {
        pageId: 3794,
        title: 'בדיקת קרינה רציפה מרשת החשמל',
        topic: 'ניטור קרינה רציף של השדה המגנטי מרשת החשמל לאורך 24-72 שעות באמצעות מכשיר רישום רצוף — איתור שיאי עומס, התפלגות יומית, זיהוי נקודות חריגה שלא נתפסות במדידה חד-פעמית.',
        topicSlug: 'radcont',
      },
      {
        pageId: 4487,
        title: 'קרינה סלולרית',
        topic: 'בדיקת קרינה סלולרית וצפיפות הספק (RF) מאנטנות שידור, ראוטרים, טלפונים ונקודות wifi. מדידה לפי המלצות ICNIRP ותקנות המשרד להגנת הסביבה, השוואה לסף 40 μW/cm².',
        topicSlug: 'radcell',
      },
      {
        pageId: 6624,
        title: 'בדיקת קרינה בדק בית',
        topic: 'בדיקת קרינה אלקטרומגנטית ו-RF כחלק מבדק בית לפני שיפוץ, רכישה או שיפור מגורים — איתור מקורות קרינה סמויים, מיפוי אזורי שהייה ממושכת, המלצות מיגון וסידור חדרים.',
        topicSlug: 'radbdk',
      },
      {
        pageId: 8078,
        title: 'בדיקת קרינה לפני רכישת דירה',
        topic: 'בדיקת קרינה מקיפה לפני רכישת דירה — בדיקת שדה מגנטי מרשת החשמל, קרבה לקו מתח/שנאי, שידור סלולרי וקרבה לאנטנות. דוח מהיר להצגה בפני המוכר ולהחלטת רכישה.',
        topicSlug: 'radbuy',
      },
      {
        pageId: 4490,
        title: 'בדיקת קרינה סלולרית רציפה',
        topic: 'ניטור רציף של עצמת הקרינה הסלולרית בנקודה אחת לאורך זמן — מתאים כאשר הרמות משתנות על פני שעות היום, יש חשד להשפעת שינוי במערך האנטנות, או כשנדרש תיעוד להצגה בפני גורמים חיצוניים.',
        topicSlug: 'radcellcont',
      },
      {
        pageId: 6091,
        title: 'בדיקת קרינה לבתי ספר ומוסדות חינוך',
        topic: 'סקר קרינה אלקטרומגנטית ו-RF בבתי ספר, גנים ומוסדות חינוך — כיתות, חצרות, חדרי צוות, חדרי מחשבים. התאמה להמלצות המשרד להגנת הסביבה למוסדות חינוך ודוח להגשה למשרד החינוך ולהורים.',
        topicSlug: 'radschool',
      },
      {
        pageId: 4484,
        title: 'קרינה אלקטרומגנטית',
        topic: 'מדריך מקצועי לקרינה אלקטרומגנטית — ההבדל בין ELF ל-RF, סוגי מקורות (קווי מתח, לוחות, שנאים, אנטנות, wifi), השפעות, ההמלצות של המשרד להגנת הסביבה ו-ICNIRP, ואופן ביצוע סקר.',
        topicSlug: 'radguide',
      },
      {
        pageId: 4500,
        title: 'מיגון מפני קרינה סלולארית',
        topic: 'פתרונות מיגון קרינה סלולרית (RF) למגורים, משרדים ומוסדות ציבור — חומרי מיגון, יריעות מתכתיות, זכוכית מוליכה, סגירת פתחים. בחירת פתרון בהתאם לממצאי סקר קרינה.',
        topicSlug: 'radshieldrf',
      },
      {
        pageId: 4478,
        title: 'בדיקת קרינה מחימום תת רצפתי',
        topic: 'בדיקת קרינת שדה מגנטי (ELF) ממערכות חימום תת-רצפתי חשמלי — מדידה על פני הרצפה, בגובה ישיבה ושינה, השוואה לסף הרלוונטי, המלצות מיקום רהיטים ושעות הפעלה.',
        topicSlug: 'radfloor',
      },
      {
        pageId: 4481,
        title: 'בדיקת קרינה מרכב חשמלי והיברידי',
        topic: 'בדיקת קרינה אלקטרומגנטית מרכב חשמלי/היברידי — מדידה בתא הנהג, במושבים האחוריים, בעמדת העמסה ובמהלך נסיעה. הערכת חשיפה לנוסע ולנהג לאורך זמן.',
        topicSlug: 'radcar',
      },
      {
        pageId: 4495,
        title: 'יועץ קרינה | ייעוץ וחיזוי קרינה למבנה בבניה',
        topic: 'ייעוץ וחיזוי קרינה אלקטרומגנטית לפרויקטים חדשים בשלב התכנון — מיקום לוחות וחדרי שנאים, מסלול כבלי מתח, מרחק מאזורי שהייה ממושכת, חישוב רמות שדה צפויות ותכנון מיגון מראש.',
        topicSlug: 'radplan',
      },
      {
        pageId: 5835,
        title: 'סקר בטיחות קרינה בעבודה',
        topic: 'סקר בטיחות קרינה בלתי מייננת במקום עבודה — מיפוי מקורות קרינה (מכונות ריתוך, אינדוקציה, מערכות רדיו, חדרי שרתים), חישוב חשיפה לעובדים, התאמה לחוק ולהמלצות משרד העבודה.',
        topicSlug: 'radwork',
      },
      {
        pageId: 4497,
        title: 'מיגון קרינה מרשת החשמל ELF',
        topic: 'פתרונות מיגון שדה מגנטי (ELF) מרשת החשמל — יריעות מו-מטאל, לוחות אלומיניום, הסטת כבלים, מיגון שנאים ולוחות. בחירת פתרון לפי ממצאי מדידה והיתכנות הנדסית.',
        topicSlug: 'radshieldelf',
      },
      {
        pageId: 5660,
        title: 'בדיקת קרינה לבית',
        topic: 'סקר קרינה מקיף לבית — שדה מגנטי מרשת החשמל (ELF), קרינת רדיו (RF), אנטנות סמוכות, קווי מתח, שנאים, מכשירי חשמל. מיפוי אזורי שהייה ממושכת והמלצות הפחתה.',
        topicSlug: 'radhome',
      },
    ],
  },

  pest: {
    palette: BRAND_GREEN(),
    pages: [
      {
        pageId: 4629,
        title: 'הדברה לבית',
        topic: 'שירותי הדברה לבתי מגורים — טיפול בתיקנים, נמלים, יתושים, פשפשי מיטה, ברחשים, מכרסמים, ג׳וקים ופרוקי רגליים. ריסוס מקצועי בחומרים מאושרי משרד הבריאות, הדברה ממוקדת וידידותית לילדים ולחיות מחמד.',
        topicSlug: 'pestshome',
      },
      {
        pageId: 4626,
        title: 'שירותי הדברה לעסקים',
        topic: 'הדברה לעסקים ולמוסדות — מסעדות, בתי מלון, מחסנים, מפעלים, משרדים, מוסדות חינוך ובריאות. תוכנית ניטור ובקרה (IPM) שוטפת, תחזוקה חודשית, דוחות למחלקת הפיקוח ולאוכלוסיית התברואה.',
        topicSlug: 'pestsbiz',
      },
      {
        pageId: 4621,
        title: 'הדברת מזיקים — היתרון שלנו',
        topic: 'היתרון של שירות ההדברה של גלית — מדבירים מוסמכים משרד הבריאות, חומרים ידידותיים לסביבה, אבחון מדויק של סוג המזיק לפני ריסוס, ליווי ואחריות על עבודה חוזרת, התאמה למגורים, עסקים ומוסדות.',
        topicSlug: 'pestsadv',
      },
    ],
  },

  radon: {
    palette: BRAND_GREEN(),
    pages: [
      {
        pageId: 8110,
        title: 'בדיקת ראדון קצרת טווח באמצעות בודק מוסמך',
        topic: 'בדיקת ראדון קצרת טווח (48-96 שעות) בביצוע בודק מוסמך בשטח — התקנת מוניטור אלקטרוני, רישום רציף של ריכוזי גז הראדון באוויר, הפקת דוח רשמי מהיר להצגה לרוכשי דירות, קבלנים ומוסדות.',
        topicSlug: 'radonshort',
      },
      {
        pageId: 3997,
        title: 'פתרונות להרחקת ראדון',
        topic: 'פתרונות הנדסיים להורדת ריכוזי גז ראדון במבנה — מערכת שאיבה תת-רצפתית (sub-slab depressurization), אוורור מכני, איטום סדקים ומעברי צנרת, התאמה לפי ממצאי בדיקה.',
        topicSlug: 'radonsol',
      },
      {
        pageId: 3995,
        title: 'ערכה לבדיקת ראדון ארוכת טווח — עשה זאת בעצמך',
        topic: 'ערכה אלפא-טראק לבדיקת גז ראדון ארוכת טווח (3-12 חודשים) שהלקוח מתקין בעצמו בבית — דוזימטר פסיבי, הוראות התקנה ברורות, שליחה חזרה לאנליזה במעבדה מוסמכת וקבלת דוח ממוצע שנתי מהימן.',
        topicSlug: 'radonkitlong',
      },
      {
        pageId: 3991,
        title: 'בדיקת ראדון לטופס 4 עבור קבלנים',
        topic: 'בדיקת ראדון לקבלת טופס 4 (אישור אכלוס) — מדידה בבודק מוסמך בבנייה חדשה לפני אכלוס, בהתאם לדרישת רשות הרישוי, הפקת דוח רשמי להגשה לעירייה ולהנדסה.',
        topicSlug: 'radonform4',
      },
      {
        pageId: 3989,
        title: 'בדיקת ראדון ארוכת טווח באמצעות בודק מוסמך',
        topic: 'בדיקת ראדון ארוכת טווח (3-6 חודשים) בביצוע בודק מוסמך — התקנה והחלפת דוזימטרים בבית הלקוח, איסוף ושליחה למעבדה, קבלת דוח ממוצע עונתי מדויק המשקף את החשיפה האמיתית.',
        topicSlug: 'radonlong',
      },
      {
        pageId: 3987,
        title: 'ערכה לבדיקת ראדון קצרת טווח — עשה זאת בעצמך',
        topic: 'ערכה לבדיקת גז ראדון קצרת טווח (48-96 שעות) להתקנה עצמית — דוזימטר פסיבי לפחם פעיל, הוראות התקנה פשוטות, שליחה למעבדה והחזרת דוח תוך ימים.',
        topicSlug: 'radonkitshort',
      },
      {
        pageId: 3985,
        title: 'כדאי שתדע ותבדוק — מידע על גז ראדון',
        topic: 'מדריך מקצועי על גז ראדון — מהו הגז, מקור הופעתו, חדירה למבנה דרך מרתפים וקירות תחתונים, השפעות בריאותיות ארוכות טווח, סף פעולה של 200 Bq/m³, מתי כדאי לבדוק.',
        topicSlug: 'radonguide',
      },
    ],
  },

  noise: {
    palette: BRAND_GREEN(),
    pages: [
      {
        pageId: 12263,
        title: 'בדיקה אקוסטית לקול נישא באוויר בין דירות, משרדים ומבנים',
        topic: 'בדיקה אקוסטית למעבר רעש באוויר בין קירות דירות, משרדים ומבנים — מדידת שיפור קול נישא (airborne sound insulation) לפי ת״י 1004, הערכת מחיצות, קירות משותפים ותקרות ביניים, דוח לגישור על ליקויים אקוסטיים.',
        topicSlug: 'noisewall',
      },
      {
        pageId: 6592,
        title: 'בדיקת רעש ממתקני אספקת מים ושרברבות',
        topic: 'בדיקת רעש ממערכות אספקת מים, משאבות הגברת לחץ, מערכות סולאר ושרברבות ביתית — איתור מקור הרעש, מדידה בלילה ובצהריים, השוואה לסף תקנות למניעת מפגעים ברעש בלתי סביר, המלצות מיגון.',
        topicSlug: 'noisewater',
      },
      {
        pageId: 6441,
        title: 'חיזוי ובדיקת רעש מאתרי בנייה לקבלנים',
        topic: 'שירות חיזוי ובדיקת רעש לקבלנים ויזמים בשלב התכנון של אתר בנייה — חישוב מודל רעש של ציוד בנייה, הערכת השפעה על שכנות, הכנת תוכנית מיגון וליווי ברישוי מול המשרד להגנת הסביבה.',
        topicSlug: 'noisecontr',
      },
      {
        pageId: 6434,
        title: 'בדיקת רעש מציוד בנייה ליזמים וקבלנים',
        topic: 'מדידת רעש מציוד בנייה פעיל באתר — מערבלי בטון, גנרטורים, פטישים, משאבות, מנופים — ואימות עמידה בתקנות למניעת רעש בלתי סביר של המשרד להגנת הסביבה בזמן אמת.',
        topicSlug: 'noisebuild',
      },
      {
        pageId: 3967,
        title: 'מגוון פתרונות לרעש',
        topic: 'מגוון פתרונות הנדסיים לטיפול ברעש — יריעות אקוסטיות, קופסאות מיגון, בולמי רעידות, לוחות ספיגה, מחיצות גבס אקוסטיות, החלפת ציוד למודלים שקטים. בחירת פתרון לפי ממצאי מדידה.',
        topicSlug: 'noisesol',
      },
      {
        pageId: 3965,
        title: 'אקוסטיקה — מיגון אקוסטי',
        topic: 'שירותי מיגון אקוסטי לחללים, חדרי מכונות, אולפני הקלטה ומרכזי כנסים — תכנון אקוסטי, סימולציה, בחירת חומרים (ספיגה, בלימה, בידוד), ליווי ביצוע ובדיקה סופית.',
        topicSlug: 'noiseshield',
      },
      {
        pageId: 3963,
        title: 'בדיקת רעש ממכונות',
        topic: 'בדיקת רעש ממכונות תעשייתיות — מנועים, מדחסים, משאבות, מכונות ייצור — מדידה בעמדת העובד ובסביבה, הערכת חשיפה לפי תקנות משרד העבודה (85 dB(A) 8 שעות), המלצות מיגון וציוד מגן.',
        topicSlug: 'noisemach',
      },
      {
        pageId: 3961,
        title: 'בדיקת רעש ממעליות',
        topic: 'בדיקת רעש ממעליות בבנייני מגורים ומשרדים — מדידה בדירות ובחדרי העבודה הסמוכים, בלילה ובבוקר, השוואה לסף רעש בלתי סביר, איתור מקור (מנוע, גלגלת, פיר) והמלצות טיפול.',
        topicSlug: 'noiseelev',
      },
      {
        pageId: 3959,
        title: 'בדיקת רעש ממזגנים',
        topic: 'בדיקת רעש ממזגני פיצול ו-VRF, מעבים חיצוניים ומערכות מרכזיות — מדידה בחצר השכן, בחדר השינה, בשעות הלילה, השוואה לסף התקנות של המשרד להגנת הסביבה, המלצות מיגון קולי.',
        topicSlug: 'noiseac',
      },
      {
        pageId: 3957,
        title: 'בדיקת רעש מאתרי בנייה',
        topic: 'מדידת רעש מאתרי בנייה פעילים — חישוף, אדמה, יציקות, ציוד כבד — ואימות עמידה בתקנות למניעת מפגעי רעש וחילופי מידע עם הפיקוח העירוני והמשרד להגנת הסביבה.',
        topicSlug: 'noisesite',
      },
      {
        pageId: 3955,
        title: 'בדיקות רעש מתחבורה — חוות דעת אקוסטית',
        topic: 'חוות דעת אקוסטית על רעש מתחבורה — כבישים ראשיים, מסילות רכבת, שדות תעופה. מדידה לפי מתודולוגיית המשרד להגנת הסביבה, חישוב Lden/Lnight, חוות דעת מומחה להצגה בבית משפט או ועדות תכנון.',
        topicSlug: 'noisetransp',
      },
      {
        pageId: 3953,
        title: 'פתרונות לרעש בעבודה',
        topic: 'פתרונות להפחתת רעש במקום עבודה — מיגון מכונה, מחיצות אקוסטיות סביב מקור הרעש, ציוד מגן אישי לעובדים, רוטציות עובדים, התאמה לתקנות משרד העבודה לבריאות השמיעה.',
        topicSlug: 'noisework',
      },
      {
        pageId: 3951,
        title: 'מדידת רעש | בדיקת רעש סביבתית',
        topic: 'מדידת רעש סביבתי מסוגים שונים — מפעלים, מערכות מיזוג, אזורי מסחר, אוויר שאוב — לפי התקנות למניעת מפגעי רעש של המשרד להגנת הסביבה, דוח רשמי להגשה לרשויות ולצדדים נוגעים.',
        topicSlug: 'noisegen',
      },
    ],
  },

  soil: {
    palette: BRAND_GREEN(),
    pages: [
      {
        pageId: 8137,
        title: 'סקר זיהום קרקע מזוהמת',
        topic: 'סקר קרקע מזוהמת בעקבות שימוש היסטורי בחומרים מסוכנים — דלקים, שמנים, מתכות כבדות, ממסים. דיגום לפי מתודולוגיית המשרד להגנת הסביבה, אנליזה במעבדה מוסמכת, דוח להגשה והמלצות שיקום.',
        topicSlug: 'soilcontam',
      },
      {
        pageId: 5937,
        title: 'איתור וחישוף תשתיות',
        topic: 'שירותי איתור וחישוף תשתיות תת-קרקעיות — צנרת מים, ביוב, גז, כבלי חשמל ותקשורת. בוקרת GPR וגלאי אלקטרומגנטיים, מניעת פגיעה בתשתיות קיימות לפני עבודות חפירה או בנייה.',
        topicSlug: 'soilinfra',
      },
      {
        pageId: 4802,
        title: 'פתרונות לזיהום קרקע',
        topic: 'פתרונות שיקום לקרקע מזוהמת — חפירה והחלפה, ניקוי ביולוגי (bioremediation), שאיבה וטיפול (pump & treat), אוורור בזמן אמת (SVE). בחירת שיטה לפי סוג המזהם, עומק וממצאי הסקר.',
        topicSlug: 'soilsol',
      },
      {
        pageId: 4799,
        title: 'סקר דיגום קרקע (phase 2)',
        topic: 'סקר שלב 2 — דיגום פיזי של הקרקע באתר שבו נמצאו חשדות בשלב 1. ביצוע קידוחי הערכה, איסוף דגימות קרקע ומי תהום, אנליזה מעבדתית מוסמכת, חוות דעת סביבתית מפורטת להגשה.',
        topicSlug: 'soilphase2',
      },
      {
        pageId: 4796,
        title: 'סקר גז קרקע',
        topic: 'סקר גזי קרקע (soil vapor survey) — התקנת סקרנים לדגימת גזים נדיפים (VOC) בעומק הקרקע, אנליזה במעבדה ואומדן סיכון חדירת גזים לתוך מבנים סמוכים (vapor intrusion).',
        topicSlug: 'soilgas',
      },
      {
        pageId: 4794,
        title: 'סקר קרקע לקבלנים',
        topic: 'סקר קרקע לקבלנים ויזמים לפני רכישת מגרש או תחילת בנייה — מיפוי שימושי עבר, בדיקת פוטנציאל זיהום, המלצות לדיגום מקדים, חישוב עלויות שיקום צפויות לקראת החלטת רכישה.',
        topicSlug: 'soilcontr',
      },
      {
        pageId: 4790,
        title: 'סקר קרקע היסטורי (phase 1)',
        topic: 'סקר שלב 1 — איסוף מידע היסטורי על הנכס והאזור, שימושי קרקע קודמים, חומרים שאוחסנו בשטח, אירועי זיהום מתועדים, סיורי שטח ראשוניים. מהווה בסיס להחלטה האם לבצע שלב 2.',
        topicSlug: 'soilphase1',
      },
    ],
  },

  water: {
    palette: BRAND_GREEN(),
    pages: [
      {
        pageId: 8132,
        title: 'פתרונות למים מזוהמים',
        topic: 'פתרונות טיפול למים מזוהמים — פילטרציה מתקדמת, התקני סינון מתכות, חיטוי UV, אוסמוזה הפוכה, סינון ביולוגי. בחירת מערכת לפי ממצאי בדיקת מי שתייה והיקף השימוש.',
        topicSlug: 'watersol',
      },
      {
        pageId: 7785,
        title: 'בדיקה מלאה לגילוי מתכות במי שתייה',
        topic: 'בדיקה מלאה למתכות כבדות ולמינרלים במי שתייה — עופרת, כספית, ארסן, קדמיום, נחושת, כרום ועוד — דיגום בברז, אנליזה במעבדה מוסמכת ISO/IEC 17025, דוח רשמי לפי תקן מי שתייה 2013.',
        topicSlug: 'watermetalsall',
      },
      {
        pageId: 7749,
        title: 'בדיקה חלקית לגילוי מתכות במי שתייה',
        topic: 'בדיקה חלקית למתכות הכבדות הנפוצות במי שתייה — עופרת, נחושת, אבץ, ברזל. דיגום בברזי המטבח, אנליזה במעבדה מוסמכת, דוח מהיר ואמין להצגה לדיירים או לרשות המים.',
        topicSlug: 'watermetalspart',
      },
      {
        pageId: 7156,
        title: 'בדיקת מים בבריכות, ג׳קוזי, ספא ומי נופש',
        topic: 'בדיקת איכות מים בבריכות שחייה, ג׳קוזים, ספא ומי נופש — חיידקים, pH, כלור חופשי וקשור, חומצת ציאנו. דיגום לפי תקן והנחיות משרד הבריאות, דוח להגשה למפקח ולחברת הניהול.',
        topicSlug: 'waterpool',
      },
      {
        pageId: 7154,
        title: 'בדיקת חיידקים במי שתייה',
        topic: 'בדיקה מיקרוביולוגית למי שתייה — קולי, קוליפורמים, אנטרוקוקים, פסאודומונס. דיגום בבקבוקים סטריליים, אנליזה במעבדה מוסמכת, דוח מהיר להצגה למשרד הבריאות ולדיירים.',
        topicSlug: 'waterbio',
      },
      {
        pageId: 4828,
        title: 'דיגום מים',
        topic: 'שירותי דיגום מים — מי שתייה, מי בריכה, מים תעשייתיים, מי נגר, מי קולחין. דיגום מקצועי לפי מתודולוגיה, בקבוקים ייעודיים, הובלה בקירור למעבדה מוסמכת ישירות.',
        topicSlug: 'watersampl',
      },
      {
        pageId: 4825,
        title: 'בדיקה מקיפה לגילוי מתכות וחיידקים במי שתייה',
        topic: 'בדיקה משולבת מקיפה למי שתייה — מתכות כבדות ובדיקה מיקרוביולוגית בחבילה אחת. דגימה בברז הצרכן, אנליזה במעבדה מוסמכת, דוח רשמי מלא לפי תקן מי שתייה.',
        topicSlug: 'waterfull',
      },
      {
        pageId: 4822,
        title: 'בדיקת איכות מים',
        topic: 'בדיקת איכות מים כללית — מים מהברז, בארות פרטיות, מי השקיה, מי נופש. מגוון פרמטרים לפי צורך, אנליזה במעבדה מוסמכת, דוח מקצועי להצגה לדיירים, מוסדות או רשויות.',
        topicSlug: 'watergen',
      },
    ],
  },

  air: {
    palette: BRAND_GREEN(),
    pages: [
      {
        pageId: 8135,
        title: 'בדיקת איכות אוויר במשרדים',
        topic: 'בדיקת איכות אוויר תוך-מבנית במשרדים — פחמן דו-חמצני (CO2), VOC, פורמלדהיד, חלקיקים (PM2.5), טמפרטורה, לחות ואוורור. איתור בעיות אוורור ומערכות מיזוג, המלצות לשיפור ובדיקת תסמונת הבית החולה.',
        topicSlug: 'airoffice',
      },
      {
        pageId: 6760,
        title: 'בדיקת איכות אוויר — תסמונת הבית החולה',
        topic: 'אבחון תסמונת הבית החולה (Sick Building Syndrome) — מדידת CO2, VOC, פורמלדהיד, עובש, אוורור וחומרי בנייה. בדיקה שמסבירה למה אנשים חוזרים הביתה עם כאבי ראש, גירוי בעיניים ועייפות.',
        topicSlug: 'airsbs1',
      },
      {
        pageId: 6761,
        title: 'איכות אוויר ותסמונת הבית החולה — מידע מורחב',
        topic: 'מידע מקיף על תסמונת הבית החולה — תסמינים נפוצים, גורמים (אוורור, חומרי בנייה, עובש), אוכלוסיות בסיכון, אמצעי אבחון ואפשרויות טיפול. המלצות על בדיקה מקצועית ומתודולוגיית הסקר.',
        topicSlug: 'airsbs2',
      },
      {
        pageId: 6741,
        title: 'בדיקת פורמלדהיד באוויר',
        topic: 'בדיקת ריכוזי פורמלדהיד באוויר תוך-מבנה — דיגום פעיל/פסיבי, אנליזה במעבדה מוסמכת, השוואה להמלצות WHO ולסף פעולה. איתור מקור (רהיטי לבוד, פרקטים, חומרי בנייה) והמלצות הפחתה.',
        topicSlug: 'airform',
      },
      {
        pageId: 6492,
        title: 'בדיקת עובש מקצועית | איתור עובש סמוי',
        topic: 'בדיקת עובש מקצועית — דגימת אוויר לנבגי עובש, איתור עובש סמוי מאחורי קירות ותחת ריצוף, מיפוי לחות, בדיקת משטחים, בדיקות אחרי נזקי מים. דוח למבוטחים, שמאים ודיירים.',
        topicSlug: 'airmold',
      },
      {
        pageId: 6481,
        title: 'בדיקת איכות אוויר תוך-מבנית לעסקים ולמבנים ציבוריים',
        topic: 'סקר איכות אוויר במבנים ציבוריים, מרפאות, בתי אבות, מרכזי כנסים — פרמטרים מורחבים כולל VOC, חלקיקים, גזים, עובש. התאמה לדרישות משרד הבריאות ומשרד העבודה למבנים ציבוריים.',
        topicSlug: 'airpublic',
      },
      {
        pageId: 6479,
        title: 'בדיקת איכות אוויר תוך-מבנית לבית',
        topic: 'בדיקת איכות אוויר לבית מגורים — CO2, VOC, פורמלדהיד, חלקיקים, עובש, לחות. איתור מקורות זיהום סמויים (ריהוט חדש, שטיחים, מערכות אוורור), דוח למשפחות עם ילדים או סובלים מרגישויות.',
        topicSlug: 'airhome',
      },
      {
        pageId: 4857,
        title: 'שירותי הייעוץ שלנו באיכות אוויר',
        topic: 'שירותי ייעוץ מקצועיים באיכות אוויר תוך-מבנית — ליווי ועדות דיירים, יועצים לקבלנים, אבחון בעיות אוורור, תכנון תוכניות מניעה, חוות דעת לשופטים ושמאים.',
        topicSlug: 'airadv',
      },
      {
        pageId: 4854,
        title: 'ציוד הבדיקה המתקדם שלנו',
        topic: 'ציוד מתקדם לבדיקת איכות אוויר — דוגמי אוויר אקטיביים, סורקי VOC, מדי פורמלדהיד, מוני חלקיקים, מצלמות תרמיות, מוני לחות וטמפרטורה, ציוד דיגום לעובש. כל הציוד מכויל ומאושר.',
        topicSlug: 'airequip',
      },
      {
        pageId: 4848,
        title: 'בדיקת איכות אוויר',
        topic: 'שירות בדיקת איכות אוויר כללי — מגוון בדיקות ממדידת CO2 פשוטה ועד סקר מקיף של פרמטרים כימיים ומיקרוביולוגיים. התאמה לפי צורך הלקוח, מגורים, משרדים או מוסדות.',
        topicSlug: 'airgen',
      },
      {
        pageId: 4845,
        title: 'בדיקות איכות אוויר סביבתיות',
        topic: 'בדיקות איכות אוויר חיצוני/סביבתי — מדידת ריכוזי חלקיקים, גזים (NO2, SO2, O3), ריח ומזהמים אחרים בשטח פתוח או ליד מקור פליטה תעשייתי. דוח רגולטורי להגשה למשרד להגנת הסביבה.',
        topicSlug: 'airenv',
      },
    ],
  },

  asbestos: {
    palette: BRAND_GREEN(),
    pages: [
      {
        pageId: 6781,
        title: 'בדיקת נוכחות אסבסט במבנים',
        topic: 'בדיקה ויזואלית לאיתור חומרים חשודים כאסבסט במבנה — גגות, קירות, ריצוף PVC ישן, בידוד תרמי, לוחות חשמל, איטום. דיגום חומר ושליחה למעבדה מוסמכת ISO/IEC 17025 לאימות הסוג.',
        topicSlug: 'asbdetect',
      },
      {
        pageId: 4885,
        title: 'פינוי אסבסט',
        topic: 'ליווי מקצועי של פינוי אסבסט — תיאום עם קבלן אסבסט מורשה מטעם המשרד להגנת הסביבה, פיקוח על ביצוע, תיעוד מצב לפני ואחרי, ליווי לאתר מורשה לסילוק פסולת, מניפסט פסולת מסוכנת.',
        topicSlug: 'asbremove',
      },
      {
        pageId: 4881,
        title: 'בדיקת אסבסט סביבתית',
        topic: 'בדיקת אסבסט באוויר סביב מבנה או אתר עבודה — דגימת אוויר במוני חלקיקים ייעודיים, אנליזה למספר סיבים ל-cm³, הערכת סיכון חשיפה, דוח להגשה למשרד להגנת הסביבה ולדיירים.',
        topicSlug: 'asbenv',
      },
      {
        pageId: 4878,
        title: 'בדיקת אסבסט',
        topic: 'בדיקת אסבסט מקצועית — איתור חומרים חשודים, דגימה, אנליזה במעבדה מוסמכת, דו"ח רשמי המתאר סוג האסבסט (צמנט/פריך), מצב החומר, רמת הסיכון והמלצות לפעולה לפי החוק.',
        topicSlug: 'asbgen',
      },
    ],
  },
};

// Galit's brand green — the shade the user shipped as the master colour for
// every service page. All categories now share this palette so the site reads
// as one brand regardless of department.
function BRAND_GREEN() {
  return {
    accent: '#7cb342',
    accentDark: '#558b2f',
    accentLight: '#f1f8e9',
    accentHighlight: '#dcedc8',
    chipColor: '#33691e',
    heroFrom: '#f1f8e9',
    heroVia: '#dcedc8',
    heroTo: '#c5e1a5',
    heroShadow: 'rgba(124,179,66,.12)',
    accentShadow: 'rgba(124,179,66,.3)',
    accentShadowDeep: 'rgba(124,179,66,.28)',
    cardTint: '#f1f8e9',
    borderLegal: '#aed581',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AI content generation — one gpt-5 call per page, structured JSON output.
// ─────────────────────────────────────────────────────────────────────────────

async function generateContent(topicLine, apiKey) {
  const system = `אתה כותב דפי שירות של "גלית – החברה לאיכות הסביבה בע"מ", חברה סביבתית מקצועית הפועלת משנת 1998. כל דף שירות באתר מופיע באותו מבנה אחיד: Hero עם תעודת זהות וחברה, סקשן "למה לבחור בגלית" עם 6 כרטיסי שירות, 5 שלבי ביצוע, תאימות לחוק + ISO, שאלות נפוצות, סעיף תוצר הבדיקה, וסקשן CTA סוגר. אתה מקבל נושא ומחזיר את כל התכנים ל-7 הסקשנים ב-JSON מובנה.

חשוב — טון וסגנון:
- מקצועי, יבש-מעשי, אמין. בלי מילים משווקות ("המובילים בישראל", "הטובים ביותר"), בלי הצהרות שאי אפשר להוכיח.
- כתיבה בעברית תקנית, בלי ניקוד.
- ציטוט חוקים/תקנות רק כשרלוונטי (למשל אסבסט → "חוק למניעת מפגעי אסבסט ואבק מזיק, התשע"א–2011").
- ללא לוגואים, ללא ציון מחירים, ללא הצעה אוטומטית לקבלת הצעת מחיר ללא פנייה.
- קהל: בעלי נכסים/עסקים, קבלנים, יזמים, מוסדות ציבור.
- המספר ליצירת קשר שמוזכר בטקסט הוא 1-700-50-50-54.
- בכל שאלה בשאלות הנפוצות — ענה בפסקה אחת עד שתיים ממוקדות, בלי לפתח רשימות ארוכות אלא אם זה באמת מוסיף.

החזר JSON תקין בלבד — בלי טקסט מסביב, בלי code fence.

מבנה ה-JSON:
{
  "hero": {
    "chip": "גלית · איכות הסביבה · משנת 1998",
    "h2": "כותרת ראשית — שם השירות + תת-כותרת מהותית אחת",
    "h3": "תת-כותרת שמוסיפה הקשר (למשל: למי מיועד או במה כולל)",
    "h4": "משפט אחד ממצה שמסכם מה הלקוח יקבל בפועל (לא תיאור כללי)",
    "paragraphs": ["3-4 פסקאות של 2-4 משפטים כל אחת — תיאור השירות, המקור של הבעיה, ההיקף של הפתרון. פסקה אחת לפחות עם <strong> מודגשות של מונחי מפתח."],
    "ctaQuestion": "שאלה פתוחה שמזמינה פנייה (למשל: לא בטוחים אם צריך סקר?)",
    "ctaLead": "משפט אחד שמסביר למה כדאי להתקשר — למשל שסוקר מוסמך יחזור אליכם"
  },
  "why": {
    "heading": "למה לבחור בגלית ל<שם השירות>?",
    "paragraphs": ["2-3 פסקאות שמציגות את החברה (משנת 1998, מקצועיות, סמכות), את הסוקר/בודק/מהנדס שמבצע את העבודה, ואת האישור/הסמכה הרגולטורית הרלוונטית לנושא. פסקה 1 מתחילה ב 'חברת <strong>גלית – החברה לאיכות הסביבה בע\"מ</strong>...'. פסקה 2 אומרת מי מבצע ואיזו הסמכה (סוקר/יועץ/בודק מוסמך מטעם המשרד להגנת הסביבה / גוף מוסמך רלוונטי)."],
    "intro": "משפט שמוביל לרשימת שאלות (למשל: הניסיון שלנו מאפשר לנו לא להסתפק בשאלה הראשונה שעולה —)",
    "questions": ["5-6 שאלות קצרות — שאלות שהלקוח רוצה תשובה עליהן ואנחנו עונים עליהן בפועל. כל שאלה היא משפט אחד בלי סימן שאלה (למשל 'איפה בדיוק מקור הבעיה?')."]
  },
  "serviceTypes": {
    "heading": "אילו סוגי <שם השירות> אנחנו מבצעים?",
    "cards": [
      {"icon": "🏠", "color": "#7cb342", "tint": "#f1f8e9", "title": "סוג 1 של השירות", "paragraphs": ["תיאור 1-2 שורות"], "bullets": ["רשימה של 3-5 פריטים ממוקדים"], "closing": "משפט סגירה שמסביר את הערך של הסוג הזה"},
      "...עוד 5 כרטיסים — סה\"כ 6 כרטיסים. כל כרטיס עם icon אמוג'י רלוונטי. **הצבע המנחה של האתר הוא ירוק #7cb342** — דאג שלפחות 3 כרטיסים ישאו צבע ירוק (#7cb342 עם tint #f1f8e9, או #558b2f עם tint #dcedc8, או #15803d עם tint #ecfdf5), והשאר יהיו גוונים משלימים ולא עזים (#0d9488 עם tint #f0fdfa, או #0891b2 עם tint #ecfeff, או #2563eb עם tint #eff6ff). אל תשתמש בכתום/אדום/סגול. כל סוג שירות הוא תת-תחום אמיתי בנושא."
    ]
  },
  "how": {
    "heading": "כיצד מתבצע <שם השירות>?",
    "steps": [
      {"title": "שיחה מקדימה", "paragraphs": ["תיאור של מה שואלים את הלקוח בטלפון — איזה נתונים חשובים לדעת מראש"], "bullets": []},
      {"title": "ביקור בשטח", "paragraphs": ["מה קורה בביקור הראשון באתר"]},
      {"title": "דיגום / מדידה", "paragraphs": ["איך בוצעה הדגימה או המדידה בפועל"]},
      {"title": "אנליזה / עיבוד נתונים", "paragraphs": ["מה קורה אחרי הביקור — מעבדה, חישוב, עיבוד"]},
      {"title": "דו\"ח ממצאים והמלצות", "paragraphs": ["מה כולל הדו\"ח המועבר ללקוח"]}
    ]
  },
  "compliance": {
    "legal": {"icon": "📜", "h2": "בהתאם ל<חוק/תקנה הרלוונטית>", "paragraphs": ["תיאור ההקשר הרגולטורי"], "bullets": ["רשימה של 4-6 גופים שהדו\"ח מתאים להגשה אליהם"], "closing": "משפט אחד שמסכם למה חשוב שהדו\"ח יהיה תקין"},
    "iso": {"icon": "🏅", "paragraphs": ["פסקה אחת — ש-המעבדה (אם רלוונטי) או המעבדה שהחברה שולחת אליה מאושרת לפי ISO/IEC 17025, או שהחברה פועלת לפי מערך בקרת איכות ISO."]}
  },
  "faq": {
    "heading": "שאלות נפוצות על <שם השירות>",
    "items": [
      {"question": "מתי צריך לבצע את השירות הזה?", "paragraphs": ["תשובה של פסקה או שתיים"], "bullets": []},
      "...סה\"כ 6 שאלות שבאמת מעניינות את הקהל (לא שאלות סתמיות). כל שאלה עם תשובה מהותית של פסקה-שתיים."
    ]
  },
  "deliverable": {
    "kicker": "תוצר הבדיקה",
    "h2": "דו\"ח <שם השירות> מפורט",
    "paragraphs": ["תיאור של הדו\"ח המועבר ללקוח — מה הוא כולל, מה הוא לא כולל"],
    "bullets": ["4-6 גופים שהדו\"ח יכול לשמש מולם"]
  },
  "cta": {
    "icon": "⚠️",
    "h2": "חושדים ב<נושא>? אל תחכו עד שתהיה בעיה",
    "paragraphs": ["2-3 פסקאות — למה חשוב לפעול לפני שהבעיה מחמירה, מה עלול לקרות אם לא. פסקה אחת לפחות עם <strong> של מונחי מפתח."],
    "h3": "גלית – החברה לאיכות הסביבה",
    "subtitle": "משפט שמסכם את מגוון השירותים שהחברה נותנת בתחום הזה (עם מילים מודגשות)",
    "disclaimer": "משפט על ההסמכה/המעבדה/האקרדיטציה",
    "phoneLead": "לתיאום <שם השירות> וייעוץ מקצועי",
    "ctaButton": "לתיאום בדיקה"
  },
  "imagePrompts": [
    {
      "scene": "A detailed English prompt (90-130 words) for an OpenAI gpt-image-1 image generation call — ACTION photograph of a Galit technician/consultant doing field work for this exact service: equipment, instrument, posture, surroundings. End the prompt with: 'Soft natural daylight, realistic documentary photography, 16:9 landscape, no text, no logos.' This image is used as the hero/intro image.",
      "caption": "כיתוב קצר בעברית (אלט + caption)",
      "slug": "english-filename-slug-under-40-chars",
      "kind": "action"
    },
    {
      "scene": "A detailed English prompt (90-130 words) for an OpenAI gpt-image-1 image generation call — ILLUSTRATION in isometric/flat-vector style showing the concept behind this service (how the measurement/survey works, or the sources/mechanisms involved). Palette: soft greens, teals and whites consistent with the brand green #7cb342 — avoid orange/red/purple. End the prompt with: 'Flat vector or isometric style, soft green and white palette, white background, no text labels, no logos, 16:9 landscape.' This image is used as the deliverable image.",
      "caption": "כיתוב קצר בעברית",
      "slug": "english-filename-slug-under-40-chars",
      "kind": "illustration"
    }
  ]
}

כללים חשובים:
1. כל טקסט הוא עברית תקנית, בלי שגיאות כתיב, בלי ניקוד.
2. כל פסקה אמיתית — לא "פה יהיה טקסט" אלא תוכן אמיתי של 2-4 משפטים.
3. אל תחזור על אותה המילה פעמיים ברצף.
4. אל תכתוב מידע שגוי או שאינו אמיתי (למשל תקן שלא קיים).
5. כל כרטיס מ-6 הכרטיסים הוא תת-תחום אמיתי של השירות. לא לחזור על אותו תת-תחום בשניים.
6. בחר אימוג'י רלוונטי לכל כרטיס, שלב, תאימות ו-CTA — אל תחזור על אותו אימוג'י.
7. אל תזכיר מחירים או מספרים ספציפיים שלא נתתי לך. אם אתה חייב מספר (למשל כמה זמן לוקח) — תן טווח מעשי סביר.
8. במקרה של בחירת שם למקצוע ("יועץ בנייה ירוקה", "סוקר מטרדי ריח", "בודק מוסמך") — השתמש בשם המקצועי התקני בעברית.`;

  const user = `נושא הדף: ${topicLine}

החזר JSON לפי המבנה שסיפקתי. דאג שכל 6 הכרטיסים ב-serviceTypes יהיו תת-תחומים אמיתיים ושונים זה מזה, ושכל 6 השאלות ב-FAQ יהיו שאלות שהלקוח באמת שואל.`;

  const body = {
    model: process.env.CONTENT_MODEL || 'gpt-5',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    response_format: { type: 'json_object' },
    // gpt-5 only accepts default temperature; omit it (see blog service).
  };

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${JSON.stringify(data).slice(0, 400)}`);
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('no content from OpenAI');
  return JSON.parse(text);
}

// ─────────────────────────────────────────────────────────────────────────────
// Pull image URL/alt from WP media id.
// ─────────────────────────────────────────────────────────────────────────────

async function fetchMedia(wpCtx, id) {
  const { site, auth } = wpCtx;
  const r = await fetch(`${site}/wp-json/wp/v2/media/${id}`, { headers: { Authorization: auth } });
  const d = await r.json();
  if (!r.ok) throw new Error(`media ${id}: ${JSON.stringify(d).slice(0, 300)}`);
  return { url: d.source_url, alt: d.alt_text || d.title?.rendered || '' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Image generation + upload (for pages that don't have pre-existing images)
// ─────────────────────────────────────────────────────────────────────────────

async function generateImage(scene, apiKey) {
  const body = {
    model: 'gpt-image-1-mini',
    prompt: scene,
    size: '1536x1024',
    quality: 'medium',
    n: 1,
  };
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`image gen failed ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error('image gen returned no b64');
  return Buffer.from(b64, 'base64');
}

async function uploadImage(wpCtx, { bytes, slug, altText, caption }) {
  const { site, auth } = wpCtx;
  const filename = `${slug}.png`;
  const r = await fetch(`${site}/wp-json/wp/v2/media`, {
    method: 'POST',
    headers: {
      Authorization: auth,
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
    body: bytes,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`WP upload ${r.status}: ${JSON.stringify(data).slice(0, 300)}`);
  const id = data.id;
  const url = data.source_url;
  await fetch(`${site}/wp-json/wp/v2/media/${id}`, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ alt_text: altText, title: altText, caption }),
  });
  return { id, url, alt: altText };
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-page processor
// ─────────────────────────────────────────────────────────────────────────────

async function rebuildPage(wpCtx, apiKey, plan, palette) {
  const { site, auth } = wpCtx;
  console.log(`\n────── page ${plan.pageId} · ${plan.title} ──────`);

  // Idempotency guard — the design uses a `galit-expert-flex` wrapper that no
  // human-authored page would carry; if it is already present the page has been
  // rebuilt in a prior run and we skip it, so an interrupted batch can be resumed
  // without regenerating content + images (and burning tokens) for pages that are
  // already done.
  if (process.env.SKIP_IF_REBUILT !== '0') {
    const probe = await fetch(`${site}/wp-json/wp/v2/pages/${plan.pageId}?context=edit`, {
      headers: { Authorization: auth },
    });
    const probePage = await probe.json();
    if (probe.ok && (probePage.meta?._elementor_data || '').includes('galit-expert-flex')) {
      console.log('  SKIP: already rebuilt (galit-expert-flex marker present)');
      return;
    }
  }

  // Load pre-existing images (ids known in the plan).
  const images = [];
  for (const id of plan.imageIds || []) {
    try {
      images.push({ ...(await fetchMedia(wpCtx, id)), id });
    } catch (e) {
      console.warn(`  image ${id} fetch failed: ${e.message}`);
    }
  }
  console.log(`  loaded ${images.length} existing images`);

  // Generate content via OpenAI (includes imagePrompts for fresh images).
  console.log(`  → generating content…`);
  const content = await generateContent(plan.topic, apiKey);
  content.topicSlug = plan.topicSlug;

  // Generate fresh images when the plan carried none — the AI already handed us
  // two scene prompts tailored to this page's topic (one action, one illustration).
  if (images.length === 0 && Array.isArray(content.imagePrompts)) {
    for (const spec of content.imagePrompts.slice(0, 2)) {
      try {
        console.log(`  → generating image "${spec.slug}" (${spec.kind})`);
        const bytes = await generateImage(spec.scene, apiKey);
        const safeSlug = (spec.slug || `galit-${plan.pageId}-${images.length}`)
          .toLowerCase()
          .replace(/[^a-z0-9-]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 60);
        const up = await uploadImage(wpCtx, {
          bytes,
          slug: `${safeSlug || `galit-${plan.pageId}`}-${images.length}`,
          altText: spec.caption || plan.title,
          caption: spec.caption || plan.title,
        });
        console.log(`    uploaded id=${up.id}`);
        images.push(up);
      } catch (e) {
        console.warn(`    image gen/upload failed: ${e.message}`);
      }
    }
  }

  // Attach images: first one to the "why/hero image" slot, second to deliverable.
  if (images[0]) content.heroImage = { url: images[0].url, alt: images[0].alt };
  if (images[1]) content.deliverable.image = { url: images[1].url, alt: images[1].alt };
  if (images[2] && !content.deliverable.image) {
    content.deliverable.image = { url: images[2].url, alt: images[2].alt };
  }

  // Compose Elementor sections.
  const elementorData = composeElementorPage(content, palette);

  // Save a local backup of the composed data for debugging.
  const outDir = 'C:/Users/yonat/AppData/Local/Temp/claude/c--Users-yonat-Desktop-galit-crm/6b763680-7e94-48f0-bfb9-00d89c2a3233/scratchpad';
  fs.writeFileSync(`${outDir}/rebuilt-${plan.pageId}.json`, JSON.stringify(elementorData, null, 2), 'utf8');

  // Push to WP.
  const r = await fetch(`${site}/wp-json/wp/v2/pages/${plan.pageId}`, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      meta: {
        _elementor_data: JSON.stringify(elementorData),
        _elementor_edit_mode: 'builder',
      },
      template: 'elementor_header_footer',
    }),
  });
  const uJson = await r.json();
  if (!r.ok) {
    console.error(`  UPDATE failed ${r.status}: ${JSON.stringify(uJson).slice(0, 400)}`);
    return;
  }
  console.log(`  update ok, modified_gmt=${uJson.modified_gmt}`);

  // Clear Elementor cache so the live page re-renders.
  const c = await fetch(`${site}/wp-json/elementor/v1/cache`, {
    method: 'DELETE',
    headers: { Authorization: auth },
  });
  console.log(`  elementor cache clear=${c.status}`);
}

(async () => {
  const planKey = process.argv[2];
  const plan = PLANS[planKey];
  if (!plan) {
    console.error(`unknown plan "${planKey}". available: ${Object.keys(PLANS).join(', ')}`);
    process.exit(1);
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) { console.error('OPENAI_API_KEY missing'); process.exit(1); }
  const wpCtx = await wp();

  for (const page of plan.pages) {
    try {
      await rebuildPage(wpCtx, apiKey, page, plan.palette);
    } catch (e) {
      console.error(`page ${page.pageId} FAILED:`, e.message);
    }
  }
  console.log('\nDONE');
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });
