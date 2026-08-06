import { Test, TestingModule } from '@nestjs/testing';
import { OutlookImportService } from './outlook-import.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AiMailService } from '../../ai-mail/ai-mail.service';

/**
 * בדיקות ל-OutlookImportService — הזרימות המרכזיות של הוספת מייל מהתוסף.
 * Prisma ו-AiMail ממוקים ידנית כדי לבודד את הלוגיקה (דדופ/שיוך/EML/סיווג).
 */
describe('OutlookImportService', () => {
  let service: OutlookImportService;
  let prisma: any;
  let aiMail: any;

  const baseMeta = () => ({
    source: 'OUTLOOK_ADDIN',
    subject: 'בקשה לבדיקת איכות אוויר',
    senderName: 'ישראל ישראלי',
    senderEmail: 'israel@example.com',
    to: [{ name: 'גלית', email: 'office@galit.co.il' }],
    cc: [],
    receivedAt: '2026-07-30T08:30:00+03:00',
    bodyHtml: '<p>תוכן <script>alert(1)</script>המייל</p>',
    bodyText: 'תוכן המייל',
    outlookItemId: 'AAItemId123',
    internetMessageId: '<msg-1@example.com>',
    conversationId: 'conv-1',
    mailboxEmail: 'employee@galit.co.il',
    hasAttachments: false,
    attachments: [],
    emlArchived: false,
  });

  beforeEach(async () => {
    prisma = {
      customer: { findFirst: jest.fn(), create: jest.fn() },
      customerContact: { findFirst: jest.fn() },
      document: { create: jest.fn().mockResolvedValue({ id: 'doc-1' }) },
      user: { findUnique: jest.fn() },
      customerEmailRequest: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      outlookImportAudit: { create: jest.fn().mockResolvedValue({}) },
    };
    aiMail = { extractLeadFields: jest.fn().mockResolvedValue({ serviceType: 'בדיקת איכות אוויר' }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutlookImportService,
        { provide: PrismaService, useValue: prisma },
        { provide: AiMailService, useValue: aiMail },
      ],
    }).compile();
    service = module.get(OutlookImportService);
  });

  it('creates a request linked to a matched customer (by sender email)', async () => {
    prisma.customer.findFirst.mockResolvedValue({ id: 'cust-99' }); // matched by email
    prisma.customerEmailRequest.findFirst.mockResolvedValue(null); // no dup
    prisma.customerEmailRequest.create.mockResolvedValue({ id: 'req-1', requestNumber: 100, customerId: 'cust-99' });

    const res = await service.importEmail('user-1', 'עובד', baseMeta(), null);

    expect(res.success).toBe(true);
    expect(res.duplicate).toBe(false);
    expect(res.requestNumber).toBe('REQ-100');
    expect(prisma.customerEmailRequest.create).toHaveBeenCalledTimes(1);
    // linked to the matched customer, not the catch-all
    expect(prisma.customerEmailRequest.create.mock.calls[0][0].data.customerId).toBe('cust-99');
    // HTML sanitized (script removed)
    expect(prisma.customerEmailRequest.create.mock.calls[0][0].data.bodyHtml).not.toContain('<script');
  });

  it('routes unknown sender to the catch-all customer (creating it once)', async () => {
    prisma.customer.findFirst.mockImplementation((args: any) => {
      // first call: lookup by email → none; second call: catch-all by name → none
      return Promise.resolve(null);
    });
    prisma.customerContact.findFirst.mockResolvedValue(null);
    prisma.customer.create.mockResolvedValue({ id: 'catch-all-1' });
    prisma.customerEmailRequest.findFirst.mockResolvedValue(null);
    prisma.customerEmailRequest.create.mockResolvedValue({ id: 'req-2', requestNumber: 101, customerId: 'catch-all-1' });

    const res = await service.importEmail('user-1', 'עובד', baseMeta(), null);

    expect(res.success).toBe(true);
    expect(prisma.customer.create).toHaveBeenCalledTimes(1); // catch-all created
    expect(prisma.customerEmailRequest.create.mock.calls[0][0].data.customerId).toBe('catch-all-1');
  });

  it('returns duplicate=true when the email was already imported', async () => {
    prisma.customerEmailRequest.findFirst.mockResolvedValue({ id: 'req-existing', requestNumber: 5, customerId: 'cust-1' });

    const res = await service.importEmail('user-1', 'עובד', baseMeta(), null);

    expect(res.success).toBe(true);
    expect(res.duplicate).toBe(true);
    expect(res.requestNumber).toBe('REQ-5');
    expect(prisma.customerEmailRequest.create).not.toHaveBeenCalled();
  });

  it('archives the EML file as a Document when provided', async () => {
    prisma.customer.findFirst.mockResolvedValue({ id: 'cust-1' });
    prisma.customerEmailRequest.findFirst.mockResolvedValue(null);
    prisma.customerEmailRequest.create.mockResolvedValue({ id: 'req-3', requestNumber: 102, customerId: 'cust-1' });

    const eml = { buffer: Buffer.from('From: a@b.com\r\nSubject: t\r\n\r\nhi'), originalname: 'message.eml', size: 30, mimetype: 'message/rfc822' };
    const res = await service.importEmail('user-1', 'עובד', baseMeta(), eml);

    expect(res.success).toBe(true);
    expect(prisma.document.create).toHaveBeenCalledTimes(1);
    expect(prisma.document.create.mock.calls[0][0].data.documentType).toBe('OTHER');
    // emlArchived flag updated
    expect(prisma.customerEmailRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ emlArchived: true, emlDocumentId: 'doc-1' }) }),
    );
  });

  it('still creates the request when classification fails', async () => {
    prisma.customer.findFirst.mockResolvedValue({ id: 'cust-1' });
    prisma.customerEmailRequest.findFirst.mockResolvedValue(null);
    prisma.customerEmailRequest.create.mockResolvedValue({ id: 'req-4', requestNumber: 103, customerId: 'cust-1' });
    aiMail.extractLeadFields.mockRejectedValue(new Error('OpenAI down'));

    const res = await service.importEmail('user-1', 'עובד', baseMeta(), null);

    expect(res.success).toBe(true); // classification failure does not break import
  });

  it('rejects an email with neither sender nor subject', async () => {
    const meta = { ...baseMeta(), senderEmail: '', subject: '' };
    await expect(service.importEmail('user-1', 'עובד', meta, null)).rejects.toThrow();
  });
});
