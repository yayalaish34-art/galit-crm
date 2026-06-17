/**
 * רישום תבנית הדוגמה (example.docx) כ-QuoteTemplate עם מסלול מיזוג DOCX.
 *
 * התבנית מכילה שני זוגות טבלאות מחיר:
 *   - זוג עם הנחה  ({#hasDiscount} ... {/hasDiscount})  — טבלת פריטים עם עמודת "% הנחה לשורה" + טבלת סיכום עם שורת הנחה
 *   - זוג ללא הנחה ({^hasDiscount} ... {/hasDiscount}) — טבלת פריטים ללא עמודת הנחה + טבלת סיכום ללא שורת הנחה
 * docxtemplater מציג בכל מיזוג רק את הזוג המתאים לפי הדגל hasDiscount.
 *
 * serviceType ברירת-מחדל: 'כללי' (ניתן לשנות). הרצה: node prisma/register-example-template.js
 */
require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const DOCX = 'example.docx';
const NAME = 'תבנית דוגמה — טבלאות מחיר';
const SERVICE_TYPE = 'כללי'; // ניתן לשנות בהמשך

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  try {
    const existing = await prisma.quoteTemplate.findFirst({
      where: { docxTemplatePath: DOCX },
    });
    if (existing) {
      const updated = await prisma.quoteTemplate.update({
        where: { id: existing.id },
        data: { name: NAME, serviceType: SERVICE_TYPE, isActive: true, docxTemplatePath: DOCX },
      });
      console.log(`Updated existing template (id=${updated.id}) → ${DOCX}`);
      console.log(JSON.stringify(updated, null, 2));
      return;
    }
    const created = await prisma.quoteTemplate.create({
      data: {
        name: NAME,
        serviceType: SERVICE_TYPE,
        isActive: true,
        docxTemplatePath: DOCX,
      },
    });
    console.log(`Registered new template (id=${created.id}) → ${DOCX}`);
    console.log(JSON.stringify(created, null, 2));
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
