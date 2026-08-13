import { ensurePrimaryContact, AUTO_PRIMARY_CONTACT_KEY } from './primary-contact.util';

/**
 * איש קשר ראשי אוטומטי — הכלל שנשען עליו כל מסלול פתיחת לקוח.
 * ה-Prisma ממוקה ידנית כדי לבודד את ההחלטה (מתי יוצרים, מתי מדלגים).
 */
describe('ensurePrimaryContact', () => {
  let prisma: any;

  beforeEach(() => {
    prisma = {
      customerContact: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'contact-1' }),
      },
    };
  });

  const dataOf = () => prisma.customerContact.create.mock.calls[0][0].data;

  it('creates a primary contact for a private customer from the customer name', async () => {
    const res = await ensurePrimaryContact(prisma, 'cust-1', {
      contactName: 'ישראל ישראלי',
      name: 'ישראל ישראלי',
      phone: '0501234567',
      email: 'Israel@Example.com',
      city: 'חיפה',
    });

    expect(res).toEqual({ id: 'contact-1' });
    const data = dataOf();
    expect(data.customerId).toBe('cust-1');
    expect(data.fullName).toBe('ישראל ישראלי');
    expect(data.phone).toBe('050-1234567'); // מעוצב עם מקף
    expect(data.email).toBe('israel@example.com'); // מנורמל
    expect(data.isPrimary).toBe(true);
    expect(data.importLegacyId).toBe(AUTO_PRIMARY_CONTACT_KEY);
  });

  it('uses contactName (the person) and not the company name, for a company', async () => {
    await ensurePrimaryContact(prisma, 'cust-2', {
      contactName: 'דנה כהן',
      name: 'אורים הנדסת חשמל בע״מ',
      phone: '03-1234567',
    });
    expect(dataOf().fullName).toBe('דנה כהן');
  });

  it('falls back to the customer name when no contact name was given', async () => {
    await ensurePrimaryContact(prisma, 'cust-3', { name: 'משה לוי', phone: '052-7654321' });
    expect(dataOf().fullName).toBe('משה לוי');
  });

  it('skips when there is no name, phone or email', async () => {
    const res = await ensurePrimaryContact(prisma, 'cust-4', { name: '', phone: '', email: '' });
    expect(res).toBeNull();
    expect(prisma.customerContact.create).not.toHaveBeenCalled();
  });

  it('skips a generic placeholder name with no phone/email', async () => {
    const res = await ensurePrimaryContact(prisma, 'cust-5', { name: 'לקוח חדש' });
    expect(res).toBeNull();
    expect(prisma.customerContact.create).not.toHaveBeenCalled();
  });

  it('still creates a contact for a generic name when a phone was given', async () => {
    await ensurePrimaryContact(prisma, 'cust-6', { name: 'לקוח חדש', phone: '050-1111111' });
    expect(dataOf().fullName).toBe('איש קשר');
    expect(dataOf().phone).toBe('050-1111111');
  });

  it('does not duplicate a contact that already exists (separator-insensitive)', async () => {
    prisma.customerContact.findMany.mockResolvedValue([
      { id: 'c-old', fullName: 'ישראל ישראלי', phone: '0501234567', mobile: '' },
    ]);
    const res = await ensurePrimaryContact(prisma, 'cust-7', {
      contactName: 'ישראל ישראלי',
      phone: '050-1234567', // אותו מספר, מופרד אחרת
    });
    expect(res).toBeNull();
    expect(prisma.customerContact.create).not.toHaveBeenCalled();
  });

  it('adds a second, non-primary contact when a different person already exists', async () => {
    prisma.customerContact.findMany.mockResolvedValue([
      { id: 'c-old', fullName: 'דנה כהן', phone: '03-1111111', mobile: '' },
    ]);
    await ensurePrimaryContact(prisma, 'cust-8', { contactName: 'משה לוי', phone: '050-2222222' });
    expect(dataOf().fullName).toBe('משה לוי');
    expect(dataOf().isPrimary).toBe(false); // הראשי כבר תפוס
  });

  it('never throws — a contact failure must not fail opening the customer', async () => {
    prisma.customerContact.create.mockRejectedValue(new Error('unique constraint'));
    await expect(
      ensurePrimaryContact(prisma, 'cust-9', { contactName: 'ישראל', phone: '050-1234567' }),
    ).resolves.toBeNull();
  });
});
