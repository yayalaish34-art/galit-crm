import { ReviewRequestService } from './review-request.service';

/**
 * הבדיקה מתמקדת בלוגיקת התזמון (nextMorning9IsraelIso) — החלק הרגיש: החישוב חייב
 * להחזיר את הרגע המדויק של 09:00 בשעון ישראל למחרת, גם בקיץ (UTC+3) וגם בחורף
 * (UTC+2), בלי תלות באזור-הזמן של השרת.
 */
describe('ReviewRequestService.nextMorning9IsraelIso', () => {
  /** ה-timestamp שהוחזר, כשמתורגם חזרה לשעון ישראל, חייב להיות 09:00:00 למחרת. */
  function assertIsNextDay9Israel(fromIso: string) {
    const iso = ReviewRequestService.nextMorning9IsraelIso(new Date(fromIso));
    const at = new Date(iso);
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jerusalem',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).formatToParts(at);
    const get = (t: string) => parts.find((p) => p.type === t)?.value;
    return { hour: get('hour'), minute: get('minute'), second: get('second'), date: `${get('year')}-${get('month')}-${get('day')}` };
  }

  it('summer (UTC+3): report sent 2026-07-15 → next day 09:00 Israel', () => {
    const r = assertIsNextDay9Israel('2026-07-15T12:00:00Z');
    expect(r.hour).toBe('09');
    expect(r.minute).toBe('00');
    expect(r.date).toBe('2026-07-16');
  });

  it('winter (UTC+2): report sent 2026-01-15 → next day 09:00 Israel', () => {
    const r = assertIsNextDay9Israel('2026-01-15T12:00:00Z');
    expect(r.hour).toBe('09');
    expect(r.minute).toBe('00');
    expect(r.date).toBe('2026-01-16');
  });

  it('late-night in Israel still rolls to the NEXT calendar day 09:00', () => {
    // 2026-07-15 22:30 UTC = 2026-07-16 01:30 Israel (קיץ) → מחר = 2026-07-17.
    const r = assertIsNextDay9Israel('2026-07-15T22:30:00Z');
    expect(r.hour).toBe('09');
    expect(r.date).toBe('2026-07-17');
  });

  it('returns a valid ISO string in the future', () => {
    const iso = ReviewRequestService.nextMorning9IsraelIso(new Date('2026-07-15T12:00:00Z'));
    expect(new Date(iso).toISOString()).toBe(iso);
    expect(new Date(iso).getTime()).toBeGreaterThan(new Date('2026-07-15T12:00:00Z').getTime());
  });
});
