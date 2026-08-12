import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BlogService } from './blog.service';

/**
 * ניסוח בלוג אוטומטי — כל יום ב-09:00 (שעון ישראל).
 *
 * הבלוג נוצר כ*טיוטה* בוורדפרס (לא מפורסם, לא נראה באתר) ונכנס לתור אישורים.
 * ה-CRM מקפיץ למנהל פופ-אפ "בלוג ממתין לאישורך", והוא נכנס, עורך ידנית או
 * מבקש ניסוח מחדש מה-AI, ורק אז מפרסם. אין פרסום אוטומטי לאתר בשום מסלול.
 *
 * למה טיק כל חצי שעה ולא cron ב-09:00 בדיוק: הטיק בודק "האם כבר עברה 09:00
 * בשעון ישראל והאם כבר נוצרה טיוטה היום". כך דיפלוי/ריסטארט של Railway בדיוק
 * ב-09:00 לא גורם ליום שלם בלי בלוג — הטיק הבא משלים אותו. גם אין תלות ב-TZ
 * של השרת, שהוא UTC.
 */
@Injectable()
export class BlogAutoDraftService {
  private readonly logger = new Logger(BlogAutoDraftService.name);

  /** השעה (שעון ישראל) שממנה ואילך מותר לייצר את הטיוטה היומית. */
  private static readonly RUN_HOUR = 9;

  /**
   * מאגר הנושאים לרוטציה — תחומי הפעילות של גלית. הרוטציה מבטיחה שלא נקבל
   * שבוע שלם על ראדון; הכותרות שכבר פורסמו נשלחות ל-AI כדי שלא יחזור עליהן.
   */
  private static readonly TOPICS: string[] = [
    'בדיקת ראדון בבית פרטי — מתי צריך, איך נמדד ומה עושים עם התוצאה',
    'אסבסט בגגות ובמבנים ישנים — איך מזהים ומה החוק מחייב',
    'איכות אוויר בתוך מבנים — מזהמים נפוצים ואיך בודקים אותם',
    'קרינה מרשת החשמל (ELF) בדירות — מה נחשב תקין ומה דורש מיגון',
    'קרינת רדיו (RF) מאנטנות סלולריות ליד בתי מגורים',
    'בדיקות רעש ואקוסטיקה — מטרדי רעש משכנים, מעליות ומיזוג',
    'מטרדי ריח מתעשייה ומעסקים — איך מודדים ומה אפשר לעשות',
    'בדיקות מי שתייה בבניין מגורים — מה בודקים ובאיזו תדירות',
    'זיהום קרקע במגרש לפני בנייה — סקר היסטורי ודיגום',
    'בנייה ירוקה ותקן 5281 — מה נדרש בפועל מיזמים',
    'בדיקות קרינה בגני ילדים ובבתי ספר',
    'מיגון קרינה בחדרי שנאים ובחדרי חשמל בבנייני מגורים',
    'איכות אוויר בחניונים תת-קרקעיים — ניטור פחמן חד-חמצני',
    'דיגום תעסוקתי — חשיפת עובדים לחומרים מסוכנים במקום העבודה',
    'בדיקות לפני רכישת דירה — אילו בדיקות סביבתיות כדאי לעשות',
    'ניטור רעש בזמן עבודות בנייה — חובות הקבלן מול השכנים',
    'הדברה ידידותית לסביבה במוסדות ציבור',
    'מה זה מעבדה מוסמכת ISO 17025 ולמה זה משנה ללקוח',
    'ראדון במרתפים ובממ"דים — למה דווקא שם הריכוז גבוה',
    'איכות אוויר במשרדים ותסמונת הבניין החולה',
    'בדיקות סביבתיות לעסקים לקראת רישוי עסק',
    'טיפול במטרד יונים וציפורים במבנים ציבוריים',
    'ניטור איכות אוויר סביב אתרי תעשייה',
    'בדיקת אסבסט לפני שיפוץ — מה אסור לעשות לבד',
  ];

  constructor(private readonly blog: BlogService) {}

  /** התאריך והשעה בשעון ישראל — לא תלוי ב-TZ של המכונה. */
  private israelNow(): { date: string; hour: number } {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jerusalem',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hour12: false,
    }).formatToParts(new Date());
    const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
    // hour '24' מופיע בחלק מהמימושים בחצות — מנרמלים ל-0.
    const hour = Number(get('hour')) % 24;
    return { date: `${get('year')}-${get('month')}-${get('day')}`, hour };
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  async tick(): Promise<void> {
    if (process.env.BLOG_AUTO_DRAFT_ENABLED === '0') return;
    try {
      const { date, hour } = this.israelNow();
      if (hour < BlogAutoDraftService.RUN_HOUR) return;
      const state = await this.blog.getAutoState();
      if (state.lastRunDate === date) return; // כבר נוצרה טיוטה היום
      await this.generate({ dailyRunDate: date });
    } catch (e: any) {
      this.logger.error(`daily blog draft failed: ${e?.message || e}`);
    }
  }

  /**
   * מייצר טיוטה ומכניס אותה לתור האישורים.
   *
   * `dailyRunDate` מגיע רק מהטיק היומי — הוא זה שמסמן "היום כבר רץ". הרצה ידנית
   * מהמסך ("נסח לי בלוג עכשיו") לא צורכת את המכסה היומית, כדי שבלוג נוסף שנוסח
   * ב-08:00 לא יבטל את הטיוטה האוטומטית של 09:00.
   */
  async generate(opts?: { dailyRunDate?: string }): Promise<{ ok: boolean; postId?: number; message: string }> {
    const dailyRunDate = opts?.dailyRunDate;

    const creds = await this.blog.getCredentials();
    if (!creds) {
      // אין חיבור לוורדפרס — לא מסמנים את היום כ"רץ", כדי שהניסוח יתחיל לבד
      // ברגע שהחיבור יוגדר, בלי להמתין ליום הבא.
      this.logger.warn('daily blog draft skipped — WordPress is not connected');
      return { ok: false, message: 'החיבור לוורדפרס לא מוגדר' };
    }

    const state = await this.blog.getAutoState();
    const topics = BlogAutoDraftService.TOPICS;
    const idx = ((Number(state.topicIndex) || 0) % topics.length + topics.length) % topics.length;
    const topic = topics[idx];

    // הכותרות שכבר קיימות באתר — כדי שה-AI לא יכתוב שוב את אותו בלוג.
    let existingTitles: string[] = [];
    try {
      const posts = await this.blog.listPosts({ status: 'all' });
      existingTitles = posts.map((p) => p.title).filter(Boolean).slice(0, 25);
    } catch {
      /* רשימה לא זמינה — ממשיכים בלעדיה, זה רק שיפור איכות */
    }

    // מקדמים את המצביע ומסמנים את היום *לפני* קריאת ה-AI: אם היא נכשלת אנחנו
    // לא רוצים שהטיק הבא (בעוד חצי שעה) ינסה שוב ושוב ויצבור עלות OpenAI.
    // ניסיון חוזר יתבצע מחר, או ידנית מהמסך.
    await this.blog.saveAutoState({
      ...state,
      lastRunDate: dailyRunDate || state.lastRunDate,
      topicIndex: idx + 1,
    });

    const drafted = await this.blog.aiDraft({
      topic,
      audience: 'בעלי דירות, ועדי בתים, קבלנים ומנהלי מבנים בישראל',
      tone: 'מקצועי, ענייני ונגיש',
      length: 'medium',
      notes: existingTitles.length
        ? `אל תחזור על בלוגים שכבר קיימים באתר: ${existingTitles.join(' | ')}`
        : '',
    });

    const created = await this.blog.createPost({
      title: drafted.title,
      body: drafted.body,
      excerpt: drafted.excerpt,
      status: 'draft', // לעולם לא 'publish' — הפרסום הוא החלטה של המנהל
    });

    const fresh = await this.blog.getAutoState();
    await this.blog.saveAutoState({
      ...fresh,
      pending: [
        ...fresh.pending,
        {
          postId: created.id,
          title: drafted.title,
          topic,
          createdAt: new Date().toISOString(),
          link: created.link,
        },
      ],
    });

    this.logger.log(`daily blog draft created: post ${created.id} — "${drafted.title}"`);
    return { ok: true, postId: created.id, message: `נוצרה טיוטה: ${drafted.title}` };
  }
}
