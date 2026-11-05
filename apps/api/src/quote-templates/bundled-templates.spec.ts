import * as fs from 'fs';
import * as path from 'path';
import { DocxMergeService } from './docx-merge.service';

jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { BUNDLED_TEMPLATES } = require('./quote-templates.service');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PizZip = require('pizzip');

const templatesDir = path.resolve(__dirname, '../../templates');
const ORIGINAL = 'קרינה-הצעת-מחיר-לבדיקת-קרינה-מרשת-החשמל.docx';

const data = {
  quoteNumber: '01041126', contractSurveyNumber: '01041126', quoteDate: '05/11/2026', validUntil: '04/12/2026',
  customerName: 'בית ספר זיו', contactName: 'דנה כהן', contactPhone: '053-7740988', contactEmail: 'dana@example.com',
  customerAddress: 'קלאוזנר 112', customerCity: 'רעננה', paymentTerms: 'שוטף + 30', customerType: 'PUBLIC',
  discountPercent: '10', subtotal: '1,200.00', subtotalAfterDiscount: '1,080.00', vatAmount: '194.40', totalAmount: '1,274.40',
  items: [{ lineNumber: '1', sku: '9', itemCode: '9', description: 'בדיקת קרינה', quantity: '1', unitPrice: '1,200.00', lineDiscountPercent: '0', lineTotal: '1,200.00' }],
};

const textOf = (docx: Buffer) =>
  (new PizZip(docx).file('word/document.xml').asText().match(/<w:t(?:\s[^>]*)?>[^<]*<\/w:t>/g) || [])
    .map((t: string) => t.replace(/<[^>]+>/g, ''))
    .join(' ');

describe('bundled quote templates', () => {
  const svc = new DocxMergeService();
  const original = svc.extractPlaceholdersFromBytes(fs.readFileSync(path.join(templatesDir, ORIGINAL)));

  it.each(BUNDLED_TEMPLATES.map((t: { docxTemplatePath: string }) => [t.docxTemplatePath]))('%s', (file: string) => {
    const bytes = fs.readFileSync(path.join(templatesDir, file));
    // Every field of the template it replaces is still there.
    expect(svc.extractPlaceholdersFromBytes(bytes)).toEqual(expect.arrayContaining(original));

    const text = textOf(svc.mergeTemplateBytes(bytes, data));
    expect(text).not.toMatch(/[{}]/);
    expect(text).not.toContain('SIGNATUREHERE');
    expect(text).toContain('שם מלא של מאשר ההצעה');
    expect(text).toContain('קלאוזנר 112, רעננה');
    expect(text).toContain('1,274.40');
    expect(text).not.toMatch(/ברנדיס|גבאי|זיו ברחוב/);
  });
});
