/**
 * סקריפט להוספת שדה docxTemplatePath לטבלת QuoteTemplate
 * ועדכון התבנית "בדיקת קול הולם אקוסטיקה" עם הנתיב לקובץ DOCX.
 *
 * הרצה: node prisma/add-docx-template-path.js
 */
require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  // Step 1: Add column if not exists
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE "QuoteTemplate"
      ADD COLUMN IF NOT EXISTS "docxTemplatePath" TEXT
    `);
    console.log('Column docxTemplatePath added (or already exists).');
  } finally {
    client.release();
  }

  // Step 2: Update the kol-holem template with the DOCX path
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    // Find the template by name
    const templates = await prisma.quoteTemplate.findMany({
      where: { name: { contains: 'קול הולם' } },
    });

    if (templates.length === 0) {
      console.log('WARNING: Template "בדיקת קול הולם אקוסטיקה" not found in DB.');
      console.log('Please insert it first with insert-kol-holem-template.js');
      return;
    }

    for (const t of templates) {
      await prisma.quoteTemplate.update({
        where: { id: t.id },
        data: { docxTemplatePath: 'kol-holem-acoustic.docx' },
      });
      console.log(`Updated template "${t.name}" (id=${t.id}) → docxTemplatePath = "kol-holem-acoustic.docx"`);
    }

    // Verify
    const updated = await prisma.quoteTemplate.findFirst({
      where: { name: { contains: 'קול הולם' } },
    });
    console.log('\nVerification:', JSON.stringify(updated, null, 2));
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
