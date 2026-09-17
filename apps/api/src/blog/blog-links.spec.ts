import { BlogService } from './blog.service';
import { BlogResearchService } from './blog-research.service';

/**
 * שומר הקישורים של הבלוג.
 *
 * הבלוג עולה לאתר הציבורי של גלית, וקישור לאתר של חברת בדיקות מתחרה הוא נזק
 * ישיר — גם מפנה לקוח למתחרה וגם נותן לו קישור נכנס. `sanitizeLinks` מנקה רק
 * את מה שה-AI מחזיר; הבדיקות כאן נועלות את השכבה שחלה על *כל* שמירה, כולל
 * טקסט שהודבק ידנית ובלוגים ישנים שנפתחו לעריכה.
 */
describe('BlogService — חסימת קישורים שאינם גופי מחקר', () => {
  const CREDS: any = { siteUrl: 'https://galit.co.il', username: 'u', appPassword: 'p', categoryId: 226 };

  /** הבדיקה עצמה נטו-לוגית: אין צורך ב-DB, ורשימת ההיתר היא השירות האמיתי. */
  function guard(body: string): () => void {
    const svc = new BlogService({} as any, new BlogResearchService(), {} as any);
    return () => (svc as any).assertAllowedLinks(body, CREDS);
  }

  const link = (url: string) => `טקסט עם [עוגן](${url}) בתוך משפט.`;

  it('חוסם קישור לאתר של חברת בדיקות מתחרה', () => {
    expect(guard(link('https://www.some-radon-testing.co.il/services'))).toThrow(
      /some-radon-testing\.co\.il/,
    );
  });

  it('מזכיר בשגיאה את כל הדומיינים החסומים, כדי שיהיה ברור מה להסיר', () => {
    const body = `${link('https://competitor-a.co.il/x')}\n${link('https://competitor-b.com/y')}`;
    expect(guard(body)).toThrow(/competitor-a\.co\.il.*competitor-b\.com/s);
  });

  it('מאפשר רשות ישראלית, גוף בריאות בינלאומי ותקינה', () => {
    expect(guard(link('https://www.gov.il/he/departments/ministry_of_environmental_protection'))).not.toThrow();
    expect(guard(link('https://www.who.int/news-room/fact-sheets/detail/radon-and-health'))).not.toThrow();
    expect(guard(link('https://www.epa.gov/radon'))).not.toThrow();
    expect(guard(link('https://www.sii.org.il/he/standard'))).not.toThrow();
  });

  it('מאפשר קישור פנימי לאתר שלנו — המחקר חוסם אותו רק כמקור, לא כיעד', () => {
    // isAllowed() מחזיר false ל-galit.co.il בכוונה (אסור לצטט את עצמנו כמקור),
    // ולכן בלי החריגה הזו כל קישור פנימי בבלוג היה נחסם.
    expect(new BlogResearchService().isAllowed('https://galit.co.il/radon')).toBe(false);
    expect(guard(link('https://galit.co.il/radon'))).not.toThrow();
    expect(guard(link('https://www.galit.co.il/contact'))).not.toThrow();
  });

  it('לא נופל על בלוג בלי קישורים בכלל', () => {
    expect(guard('פסקה רגילה\n\n## כותרת\n\n- פריט')).not.toThrow();
    expect(guard('')).not.toThrow();
  });

  it('חוסם כתובת שמתחזה לגוף מוכר דרך userinfo', () => {
    // ‎https://who.int@competitor.co.il/x‎ נראה כמו קישור ל-WHO, אבל הדפדפן
    // הולך ל-competitor.co.il. הבדיקה על hostname ולא על תחילת המחרוזת.
    expect(guard(link('https://who.int@competitor.co.il/x'))).toThrow(/competitor\.co\.il/);
  });

  it('חוסם כתובת פגומה במקום להתעלם ממנה', () => {
    expect(guard(link('http://%zz/page'))).toThrow();
  });
});
