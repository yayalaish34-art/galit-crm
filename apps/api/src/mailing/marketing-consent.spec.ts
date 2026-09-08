import { readMarketingConsent } from './marketing-consent.util';

/**
 * הפרשנות של "אישור דיוור" מגוף הליד. הכלל החשוב: כשלא ברור — null ("לא ידוע")
 * ולא false, כדי שלקוח לא ייחשב כמסרב רק בגלל ניסוח שלא זוהה.
 */
describe('readMarketingConsent', () => {
  it('מזהה אישור מהתבנית המפורשת של טופס 4980 ("אישור דיוור: <ערך>")', () => {
    const body = ['שם: דנה לוי', 'טלפון: 050-1234567', 'אישור דיוור: on'].join('\n');
    expect(readMarketingConsent(body).consent).toBe(true);
  });

  it('מזהה סירוב כשהתווית קיימת אבל בלי ערך (התיבה לא סומנה)', () => {
    const body = ['שם: דנה לוי', 'אישור דיוור:', 'הערות: -'].join('\n');
    expect(readMarketingConsent(body).consent).toBe(false);
  });

  it('מזהה סירוב מערך שלילי מפורש', () => {
    expect(readMarketingConsent('אישור דיוור: לא').consent).toBe(false);
    expect(readMarketingConsent('marketing_consent: off').consent).toBe(false);
  });

  it('מזהה אישור מנוסח התיבה עצמה, כפי ש-[all-fields] מדפיס אותו', () => {
    const body = [
      'שם: יוסי כהן',
      'אימייל: yossi@example.com',
      'אני מאשר/ת קבלת עדכונים, מבצעים ותכנים שיווקיים מגלית בדוא"ל וב-SMS. ניתן להסיר בכל עת.',
    ].join('\n');
    expect(readMarketingConsent(body).consent).toBe(true);
  });

  it('מחזיר null לליד ישן שאין בו את השדה בכלל', () => {
    const body = ['שם: רביד לוינר', 'טלפון: +972545490828', 'הודעה: שלום רב, נדרש יועץ.'].join('\n');
    expect(readMarketingConsent(body).consent).toBeNull();
  });

  it('מחזיר null לגוף ריק', () => {
    expect(readMarketingConsent('').consent).toBeNull();
    expect(readMarketingConsent(null).consent).toBeNull();
  });

  it('שומר את השורה שממנה הוסק, לתיעוד מקור האישור', () => {
    const r = readMarketingConsent('אישור דיוור: כן');
    expect(r.consent).toBe(true);
    expect(r.evidence).toContain('אישור דיוור');
  });
});
