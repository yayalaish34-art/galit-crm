import { computeDueDate } from './payment-terms';

/**
 * הבדיקות נשענות על הערכים שקיימים באמת ב-DB (211 הצעות), לא על ערכים מומצאים:
 * "שוטף +30" (72), "מזומן" (67), "תשלום מראש מלא" (40), "שוטף + 30" (7),
 * "50% מקדמה, 50% בסיום העבודה" (2), וריק (23).
 */
describe('computeDueDate', () => {
  const AUG_05 = '2026-08-05'; // אמצע חודש
  const AUG_28 = '2026-08-28'; // סוף חודש — כאן ההבדל בין שיטות הספירה בולט

  describe('שוטף + N (ברירת מחדל: סוף חודש + N)', () => {
    it('גוזר סוף-חודש + 30 מהצורה הנפוצה בלי רווח', () => {
      const r = computeDueDate('שוטף +30', AUG_05);
      expect(r.recognized).toBe(true);
      expect(r.netDays).toBe(30);
      expect(r.dueDate).toBe('2026-09-30'); // 31/08 + 30
    });

    it('הצורה עם רווח נותנת בדיוק אותה תוצאה', () => {
      expect(computeDueDate('שוטף + 30', AUG_05).dueDate)
        .toBe(computeDueDate('שוטף +30', AUG_05).dueDate);
    });

    it('גם "שוטף+30" ללא רווחים כלל', () => {
      expect(computeDueDate('שוטף+30', AUG_05).dueDate).toBe('2026-09-30');
    });

    it('שתי חשבוניות מאותו חודש מקבלות אותו תאריך יעד — זו כל המשמעות של "שוטף"', () => {
      expect(computeDueDate('שוטף +30', AUG_05).dueDate)
        .toBe(computeDueDate('שוטף +30', AUG_28).dueDate);
    });

    it('מכבד ספירה מתאריך המסמך כשמבקשים זאת במפורש', () => {
      const r = computeDueDate('שוטף +30', AUG_05, 'documentDate');
      expect(r.dueDate).toBe('2026-09-04'); // 05/08 + 30
    });

    it('חוצה גבול שנה נכון', () => {
      const r = computeDueDate('שוטף +30', '2026-12-10');
      expect(r.dueDate).toBe('2027-01-30'); // 31/12 + 30
    });

    it('מטפל בפברואר (חודש קצר)', () => {
      const r = computeDueDate('שוטף +30', '2026-02-10');
      expect(r.dueDate).toBe('2026-03-30'); // 28/02 + 30
    });

    it('תומך גם ב"נטו 45"', () => {
      expect(computeDueDate('נטו 45', AUG_05).netDays).toBe(45);
    });

    it('דוחה מספר ימים לא סביר', () => {
      expect(computeDueDate('שוטף +9999', AUG_05).recognized).toBe(false);
    });
  });

  describe('תשלום מיידי', () => {
    it('"מזומן" → תאריך המסמך', () => {
      const r = computeDueDate('מזומן', AUG_05);
      expect(r.recognized).toBe(true);
      expect(r.netDays).toBe(0);
      expect(r.dueDate).toBe(AUG_05);
    });

    it('"תשלום מראש מלא" → תאריך המסמך', () => {
      const r = computeDueDate('תשלום מראש מלא', AUG_05);
      expect(r.recognized).toBe(true);
      expect(r.dueDate).toBe(AUG_05);
    });
  });

  describe('מקרים שבהם מוטב לא לקבוע תאריך', () => {
    it('תנאי מפוצל אינו מקבל תאריך מומצא', () => {
      const r = computeDueDate('50% מקדמה, 50% בסיום העבודה', AUG_05);
      expect(r.recognized).toBe(false);
      expect(r.dueDate).toBeNull();
      expect(r.explanation).toContain('מפוצל');
    });

    it('ריק → null, בדיוק ההתנהגות שהייתה קודם', () => {
      for (const v of ['', '   ', null, undefined]) {
        const r = computeDueDate(v as string, AUG_05);
        expect(r.dueDate).toBeNull();
        expect(r.recognized).toBe(false);
      }
    });

    it('"שוטף" בלי מספר לא מניח 30', () => {
      const r = computeDueDate('שוטף', AUG_05);
      expect(r.recognized).toBe(false);
      expect(r.dueDate).toBeNull();
    });

    it('טקסט לא מזוהה → null, והנוסח מצטט את מה שנכתב', () => {
      const r = computeDueDate('לפי סיכום טלפוני', AUG_05);
      expect(r.dueDate).toBeNull();
      expect(r.explanation).toContain('לפי סיכום טלפוני');
    });
  });

  it('בלי תאריך מסמך — נופל להיום, ולא מתרסק', () => {
    const r = computeDueDate('מזומן');
    expect(r.recognized).toBe(true);
    expect(r.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
