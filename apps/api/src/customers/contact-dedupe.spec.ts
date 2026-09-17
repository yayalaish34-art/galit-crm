import { CustomersService } from './customers.service';

/**
 * אותו לקוח מקבל אנשי קשר משני מקורות שלא מכירים זה את זה:
 *   • השרת — ensurePrimaryContact ביצירת הלקוח, מתוך contactName.
 *   • הממשק — POST /customers/:id/contacts על מה שהוקלד בכרטיס.
 *
 * כשמדובר באותו אדם נוצרו שתי שורות זהות. זה קרה בפועל ל-12 לקוחות בסיווג
 * "חברה" ול-3 ב"מוסד". הבדיקות כאן נועלות את הדדופ שמונע את זה, ובאותה מידה
 * מוודאות שהוא לא בולע אנשי קשר שהם באמת אנשים שונים.
 */
describe('CustomersService.createContact — דדופ אנשי קשר', () => {
  const CUSTOMER_ID = 'cust-1';

  function makeService(existing: any[]) {
    const created: any[] = [];
    const prisma: any = {
      customer: { findUnique: jest.fn().mockResolvedValue({ id: CUSTOMER_ID }) },
      customerContact: {
        findMany: jest.fn().mockResolvedValue(existing),
        findUnique: jest.fn().mockImplementation(({ where }: any) =>
          Promise.resolve(existing.find((c) => c.id === where.id) ?? null),
        ),
        create: jest.fn().mockImplementation(({ data }: any) => {
          created.push(data);
          return Promise.resolve({ id: 'new-1', ...data });
        }),
      },
    };
    const svc = new CustomersService(prisma as any, {} as any, {} as any);
    return { svc, prisma, created };
  }

  it('לא יוצר כפילות כשאותו אדם כבר קיים — התרחיש שיצר 15 כפילויות', async () => {
    const { svc, created } = makeService([
      { id: 'c-1', fullName: 'משה לוי', phone: '050-1234567', mobile: '' },
    ]);

    const res: any = await svc.createContact(CUSTOMER_ID, {
      fullName: 'משה לוי',
      phone: '050-1234567',
    });

    expect(created).toHaveLength(0);
    expect(res.id).toBe('c-1');
  });

  it('מתעלם מהבדלי רווחים, מקפים ואותיות גדולות', async () => {
    const { svc, created } = makeService([
      { id: 'c-1', fullName: 'משה לוי', phone: '050-1234567', mobile: '' },
    ]);

    await svc.createContact(CUSTOMER_ID, { fullName: '  משה לוי  ', phone: '0501234567' });
    expect(created).toHaveLength(0);
  });

  it('משווה גם מול mobile, לא רק phone', async () => {
    const { svc, created } = makeService([
      { id: 'c-1', fullName: 'דנה כהן', phone: '', mobile: '052-7654321' },
    ]);

    await svc.createContact(CUSTOMER_ID, { fullName: 'דנה כהן', mobile: '052-7654321' });
    expect(created).toHaveLength(0);
  });

  it('יוצר איש קשר חדש כשהשם שונה — שני אנשים באותה חברה', async () => {
    const { svc, created } = makeService([
      { id: 'c-1', fullName: 'משה לוי', phone: '050-1234567', mobile: '' },
    ]);

    await svc.createContact(CUSTOMER_ID, { fullName: 'רונית ברק', phone: '050-1234567' });
    expect(created).toHaveLength(1);
    expect(created[0].fullName).toBe('רונית ברק');
  });

  it('יוצר איש קשר חדש כשהטלפון שונה — אותו שם, אדם אחר', async () => {
    const { svc, created } = makeService([
      { id: 'c-1', fullName: 'משה לוי', phone: '050-1234567', mobile: '' },
    ]);

    await svc.createContact(CUSTOMER_ID, { fullName: 'משה לוי', phone: '03-9998888' });
    expect(created).toHaveLength(1);
  });

  it('יוצר כרגיל כשאין עדיין אנשי קשר', async () => {
    const { svc, created } = makeService([]);
    await svc.createContact(CUSTOMER_ID, { fullName: 'משה לוי', phone: '050-1234567' });
    expect(created).toHaveLength(1);
  });

  it('לא מדלג על יצירה כשאין שם ואין טלפון — אין על מה להשוות', async () => {
    const { svc, created } = makeService([
      { id: 'c-1', fullName: 'משה לוי', phone: '050-1234567', mobile: '' },
    ]);
    await svc.createContact(CUSTOMER_ID, { email: 'x@y.com' });
    expect(created).toHaveLength(1);
  });
});
