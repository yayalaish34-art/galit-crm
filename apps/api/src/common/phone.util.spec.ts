import { formatIsraeliPhone, formatPhoneFields } from './phone.util';

describe('formatIsraeliPhone', () => {
  it('מוסיף מקף לנייד ולקווי', () => {
    expect(formatIsraeliPhone('0501234567')).toBe('050-1234567');
    expect(formatIsraeliPhone('039876543')).toBe('03-9876543');
    expect(formatIsraeliPhone('0779876543')).toBe('077-9876543');
    expect(formatIsraeliPhone('1700123456')).toBe('1-700-123456');
  });

  it('ממיר קידומת בינלאומית ל-0 (הדבקה מווטסאפ)', () => {
    expect(formatIsraeliPhone('+972501234567')).toBe('050-1234567');
    expect(formatIsraeliPhone('972501234567')).toBe('050-1234567');
    expect(formatIsraeliPhone('00972501234567')).toBe('050-1234567');
  });

  it('אידמפוטנטי — מספר שכבר מעוצב לא משתנה', () => {
    expect(formatIsraeliPhone('050-1234567')).toBe('050-1234567');
    expect(formatIsraeliPhone(formatIsraeliPhone('0501234567'))).toBe('050-1234567');
  });

  it('לא מאבד קלט שלא זוהה', () => {
    expect(formatIsraeliPhone('12345')).toBe('12345');
    expect(formatIsraeliPhone('לשאול את רונית')).toBe('לשאול את רונית');
    expect(formatIsraeliPhone('  0501234567  ')).toBe('050-1234567');
  });

  it('ריק/null מחזירים מחרוזת ריקה', () => {
    expect(formatIsraeliPhone('')).toBe('');
    expect(formatIsraeliPhone(null)).toBe('');
    expect(formatIsraeliPhone(undefined)).toBe('');
  });
});

describe('formatPhoneFields', () => {
  it('מעצב רק שדות שקיימים באובייקט, ומשמר null/undefined', () => {
    const out = formatPhoneFields({ name: 'א', phone: '0501234567', fax: null, phone2: undefined } as any);
    expect(out).toEqual({ name: 'א', phone: '050-1234567', fax: null, phone2: undefined });
  });

  it('לא נוגע בשדות שאינם טלפון', () => {
    const out = formatPhoneFields({ email: '0501234567@x.com', phone: '039876543' } as any);
    expect(out.email).toBe('0501234567@x.com');
    expect(out.phone).toBe('03-9876543');
  });
});
