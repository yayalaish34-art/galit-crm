import { CustomersService } from './customers.service';

/**
 * `resolve` היא הדבר היחיד שעומד בין "כפילות לקוחות" ל"איחוד לקוחות שונים
 * בטעות". השני חמור בהרבה ואינו הפיך, ולכן הבדיקות כאן מקפידות במיוחד על מה
 * שאסור להתאים.
 */
describe('CustomersService.resolve', () => {
  let prisma: any;
  let svc: CustomersService;

  const makeCustomer = (over: Record<string, unknown> = {}) => ({
    id: 'cust-1',
    name: 'אורים הנדסת חשמל בע"מ',
    phone: '053-3018505',
    email: 'a@b.co.il',
    companyRegNumber: null,
    createdAt: new Date('2026-08-02T11:08:48Z'),
    ...over,
  });

  beforeEach(() => {
    prisma = {
      customer: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'new-1', ...data })),
      },
      customerClassification: { findFirst: jest.fn().mockResolvedValue({ code: 'COMPANY' }) },
      // שלב 3 (טלפון + דמיון שם) עובר ב-raw SQL — ברירת המחדל: אין מועמדים.
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    };
    // GraphMailService אינו בשימוש ב-resolve; מספיק stub.
    svc = new CustomersService(prisma as never, {} as never);
    // assertClassificationCode פונה ל-DB; לא מה שנבדק כאן.
    jest.spyOn(svc as never as { assertClassificationCode: () => Promise<void> },
      'assertClassificationCode').mockResolvedValue(undefined as never);
  });

  it('מחזיר לקוח קיים לפי שם זהה — במקום ליצור כפילות', async () => {
    prisma.customer.findMany.mockResolvedValue([makeCustomer()]);
    const r = await svc.resolve({ name: 'אורים הנדסת חשמל בע"מ', type: 'COMPANY' });
    expect(r.created).toBe(false);
    expect(r.matchedBy).toBe('name');
    expect(r.customer.id).toBe('cust-1');
    expect(prisma.customer.create).not.toHaveBeenCalled();
  });

  it('מנרמל רווחים כפולים ורווחי קצה לפני ההשוואה', async () => {
    prisma.customer.findMany.mockResolvedValue([makeCustomer()]);
    await svc.resolve({ name: '  אורים   הנדסת  חשמל בע"מ  ' });
    expect(prisma.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { name: { equals: 'אורים הנדסת חשמל בע"מ', mode: 'insensitive' } },
      }),
    );
  });

  it('ח.פ גובר — מתאים גם כששם הלקוח נכתב אחרת', async () => {
    prisma.customer.findFirst.mockResolvedValue(makeCustomer({ id: 'by-reg' }));
    const r = await svc.resolve({ name: 'שם אחר לגמרי', companyRegNumber: '513777888' });
    expect(r.matchedBy).toBe('companyRegNumber');
    expect(r.customer.id).toBe('by-reg');
    // לא ממשיכים לחיפוש לפי שם אחרי התאמת ח.פ.
    expect(prisma.customer.findMany).not.toHaveBeenCalled();
  });

  it('כשיש כמה התאמות שם — בוחר את המלאה ביותר', async () => {
    prisma.customer.findMany.mockResolvedValue([
      makeCustomer({ id: 'bare', phone: null, email: null }),
      makeCustomer({ id: 'full', phone: '053-3018505', email: 'a@b.co.il' }),
    ]);
    const r = await svc.resolve({ name: 'אורים הנדסת חשמל בע"מ' });
    expect(r.customer.id).toBe('full');
  });

  // ── מה שאסור להתאים ──────────────────────────────────────────────────────

  it('טלפון זהה אך שם שונה — לא מתאים; טלפון אחד משותף לכמה לקוחות אמיתיים', async () => {
    // בנתונים האמיתיים ...522357357 מופיע אצל 7 חברות שונות (מספר יועץ משותף).
    // התאמה לפי טלפון לבדו הייתה מאחדת אותן — נזק חמור מכפילות.
    prisma.$queryRawUnsafe.mockResolvedValue([
      makeCustomer({ id: 'other-1', name: 'חברת סולוטו', phone: '052-2357357' }),
      makeCustomer({ id: 'other-2', name: 'גלאור פיתוח מערכות תוכנה בע"מ', phone: '052-2357357' }),
    ]);
    const r = await svc.resolve({ name: 'חברה חדשה לגמרי', phone: '052-2357357' });
    expect(r.created).toBe(true);
    expect(prisma.customer.create).toHaveBeenCalled();
    // שלב השם עצמו עדיין אינו מחפש לפי טלפון.
    const nameQuery = prisma.customer.findMany.mock.calls[0]?.[0];
    expect(JSON.stringify(nameQuery)).not.toContain('phone');
  });

  it('טלפון זהה + שגיאת כתיב בשם — מתאים ללקוח הקיים (תומר גולפדר/גולדפדר)', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([
      makeCustomer({ id: 'tomer', name: 'תומר גולדפדר', phone: '054-4541736' }),
    ]);
    const r = await svc.resolve({ name: 'תומר גולפדר', phone: '0544541736' });
    expect(r.created).toBe(false);
    expect(r.matchedBy).toBe('phone+name');
    expect(r.customer.id).toBe('tomer');
    expect(prisma.customer.create).not.toHaveBeenCalled();
  });

  it('שם קצר מוגן — "משה" מול "מזה" באותו טלפון אינו מתאים', async () => {
    // יחס העריכה 1/3 חורג מ-20%; בלי זה כל שם קצר היה מתמזג עם שכנו.
    prisma.$queryRawUnsafe.mockResolvedValue([
      makeCustomer({ id: 'moshe', name: 'מזה', phone: '058-3217336' }),
    ]);
    const r = await svc.resolve({ name: 'משה', phone: '0583217336' });
    expect(r.created).toBe(true);
  });

  it('הרחבת שם אינה שגיאת כתיב — "אורי" מול "אורי יעקב" אינו מתאים', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([
      makeCustomer({ id: 'uri', name: 'אורי יעקב', phone: '050-2066948' }),
    ]);
    const r = await svc.resolve({ name: 'אורי', phone: '0502066948' });
    expect(r.created).toBe(true);
  });

  it('מספר סניף אינו שגיאת כתיב — "פיצה פיאצה" מול "פיצה פיאצה 2" אינו מתאים', async () => {
    // מקרה אמיתי במסד: שני סניפים באותו טלפון. מרחק העריכה 2 היה ממזג אותם.
    prisma.$queryRawUnsafe.mockResolvedValue([
      makeCustomer({ id: 'branch2', name: 'פיצה פיאצה 2', phone: '054-4431303' }),
    ]);
    const r = await svc.resolve({ name: 'פיצה פיאצה', phone: '0544431303' });
    expect(r.created).toBe(true);
  });

  it('טלפון חלקי (פחות מ-9 ספרות) אינו מפעיל התאמה כלל', async () => {
    const r = await svc.resolve({ name: 'תומר גולפדר', phone: '054-454' });
    expect(r.created).toBe(true);
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('שם גנרי אינו מתאים — אחרת כל הפניות בלי שם היו מתמזגות', async () => {
    for (const generic of ['לקוח חדש', 'לקוח', 'ללא שם', 'טסט']) {
      prisma.customer.findMany.mockClear();
      prisma.customer.create.mockClear();
      const r = await svc.resolve({ name: generic });
      expect(r.created).toBe(true);
      expect(prisma.customer.findMany).not.toHaveBeenCalled();
    }
  });

  it('שם ריק אינו מתאים', async () => {
    const r = await svc.resolve({ name: '   ' });
    expect(r.created).toBe(true);
    expect(prisma.customer.findMany).not.toHaveBeenCalled();
  });

  it('אין התאמה → נוצר לקוח חדש עם הנתונים שהתקבלו', async () => {
    const r = await svc.resolve({ name: 'לקוח חדש לגמרי', type: 'COMPANY', phone: '050-1111111' });
    expect(r.created).toBe(true);
    expect(r.matchedBy).toBeNull();
    expect(prisma.customer.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: 'לקוח חדש לגמרי' }) }),
    );
  });

  it('ח.פ ריק אינו מפעיל התאמה לפי ח.פ', async () => {
    prisma.customer.findMany.mockResolvedValue([]);
    await svc.resolve({ name: 'חברה', companyRegNumber: '   ' });
    expect(prisma.customer.findFirst).not.toHaveBeenCalled();
  });
});
