/**
 * מוסיף:
 *   1. פריט ל-QuoteItemCatalog: "חישוף קרקעות" @ 10,000₪
 *   2. תבנית הצעה חדשה: "חישוף קרקעות / איתור תשתיות תת-קרקעיות"
 *      — DOCX מקובץ templates/hisuf-karkaot.docx + שורת ברירת מחדל של הפריט.
 *   3. QuoteTemplateDocx עם תוכן ה-DOCX כ-base64 (כך העורך הגרפי של "תבניות הצעות"
 *      ישרת את הגרסה הנכונה גם אחרי שהעובד יערוך אותה דרך OneDrive).
 *
 * אידמפוטנטי: לא יוצר כפילות אם כבר רץ.
 *
 * הפעלה:
 *   railway run --service api -- npx tsx scripts/add-chisuf-karkaot.ts
 *   (או מקומית עם DATABASE_URL מכוון לפרודקשן — ראה [[railway-migrations-session-pooler]])
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: (process.env.DATABASE_URL || '').replace(':6543', ':5432') });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const ITEM_CODE = 'CHISUF-10001';
const ITEM_NAME = 'חישוף קרקעות';
const ITEM_PRICE = 10_000; // ₪
const ITEM_SERVICE_CATEGORY = 'קרקע';

const TEMPLATE_NAME = 'חישוף קרקעות / איתור תשתיות תת-קרקעיות';
const TEMPLATE_SERVICE_TYPE = 'קרקע / גז קרקע';
const DOCX_FILENAME = 'hisuf-karkaot.docx';

async function upsertCatalogItem() {
  const existing = await prisma.quoteItemCatalog.findFirst({ where: { itemCode: ITEM_CODE } });
  if (existing) {
    console.log(`QuoteItemCatalog קיים (${existing.itemCode}) — מעדכן מחיר ל-₪${ITEM_PRICE.toLocaleString('he-IL')}`);
    return prisma.quoteItemCatalog.update({
      where: { id: existing.id },
      data: {
        name: ITEM_NAME,
        basePrice: ITEM_PRICE,
        serviceCategory: ITEM_SERVICE_CATEGORY,
        isActive: true,
      },
    });
  }
  console.log(`יוצר QuoteItemCatalog חדש: ${ITEM_NAME} @ ₪${ITEM_PRICE.toLocaleString('he-IL')}`);
  return prisma.quoteItemCatalog.create({
    data: {
      itemCode: ITEM_CODE,
      name: ITEM_NAME,
      basePrice: ITEM_PRICE,
      costPrice: 0,
      serviceCategory: ITEM_SERVICE_CATEGORY,
      billingUnit: 'יחידה',
      vatPercent: 17,
      requiresQuantity: true,
      isActive: true,
    },
  });
}

async function upsertTemplate() {
  const defaultLineItems = [
    { name: ITEM_NAME, quantity: 1, unitPrice: ITEM_PRICE, code: ITEM_CODE },
  ];

  const existing = await prisma.quoteTemplate.findFirst({
    where: { name: TEMPLATE_NAME, serviceType: TEMPLATE_SERVICE_TYPE },
  });
  if (existing) {
    console.log(`QuoteTemplate קיים (${existing.id}) — מעדכן.`);
    return prisma.quoteTemplate.update({
      where: { id: existing.id },
      data: {
        isActive: true,
        docxTemplatePath: DOCX_FILENAME,
        defaultLineItems,
      },
    });
  }
  console.log(`יוצר QuoteTemplate חדש: ${TEMPLATE_NAME}`);
  return prisma.quoteTemplate.create({
    data: {
      name: TEMPLATE_NAME,
      serviceType: TEMPLATE_SERVICE_TYPE,
      isActive: true,
      docxTemplatePath: DOCX_FILENAME,
      defaultLineItems,
    },
  });
}

async function upsertDocxOverride(templateId: string) {
  // הנתיב רלטיבי ל-apps/api — כפי שהסקריפט נקרא משם (railway run מריץ מתוך workdir).
  const docxPath = path.resolve('templates', DOCX_FILENAME);
  if (!fs.existsSync(docxPath)) {
    console.log(`אזהרה: הקובץ ${docxPath} לא קיים; מדלג על QuoteTemplateDocx.`);
    return;
  }
  const bytes = fs.readFileSync(docxPath);
  const base64 = bytes.toString('base64');

  const existing = await prisma.quoteTemplateDocx.findUnique({ where: { templateId } });
  if (existing) {
    console.log(`QuoteTemplateDocx קיים — מעדכן.`);
    return prisma.quoteTemplateDocx.update({
      where: { templateId },
      data: { dataBase64: base64, sizeBytes: bytes.length, updatedByName: 'seed-script' },
    });
  }
  console.log(`יוצר QuoteTemplateDocx (${bytes.length} בייטים).`);
  return prisma.quoteTemplateDocx.create({
    data: {
      templateId,
      dataBase64: base64,
      sizeBytes: bytes.length,
      updatedByName: 'seed-script',
    },
  });
}

(async () => {
  await upsertCatalogItem();
  const template = await upsertTemplate();
  await upsertDocxOverride(template.id);
  console.log('✓ בוצע.');
})()
  .catch((e) => {
    console.error('FAILED:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
