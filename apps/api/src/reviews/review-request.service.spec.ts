import { ReviewRequestService } from './review-request.service';

/**
 * בקשת דירוג מתוזמנת ל-24 שעות בדיוק מרגע שהדוח נשלח ללקוח — לא ל-09:00 למחרת
 * ולא תלוית אזור-זמן. הבדיקה מוודאת שההפרש הוא תמיד בדיוק 24 שעות, מכל נקודת
 * זמן שממנה מתחילים לספור.
 */
describe('ReviewRequestService.twentyFourHoursFromNowIso', () => {
  it('returns exactly 24 hours after the given instant', () => {
    const from = new Date('2026-07-15T12:00:00Z');
    const iso = ReviewRequestService.twentyFourHoursFromNowIso(from);
    expect(new Date(iso).getTime() - from.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('is unaffected by a DST boundary (Israel summer/winter clock change)', () => {
    // 2026-10-24 22:00 UTC — סביב מעבר לשעון חורף בישראל (2026-10-25).
    const from = new Date('2026-10-24T22:00:00Z');
    const iso = ReviewRequestService.twentyFourHoursFromNowIso(from);
    expect(new Date(iso).getTime() - from.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('returns a valid ISO string in the future', () => {
    const from = new Date('2026-07-15T12:00:00Z');
    const iso = ReviewRequestService.twentyFourHoursFromNowIso(from);
    expect(new Date(iso).toISOString()).toBe(iso);
    expect(new Date(iso).getTime()).toBeGreaterThan(from.getTime());
  });

  it('defaults to now when no instant is given', () => {
    const before = Date.now();
    const iso = ReviewRequestService.twentyFourHoursFromNowIso();
    const after = Date.now();
    const delta = new Date(iso).getTime();
    expect(delta).toBeGreaterThanOrEqual(before + 24 * 60 * 60 * 1000);
    expect(delta).toBeLessThanOrEqual(after + 24 * 60 * 60 * 1000);
  });
});
