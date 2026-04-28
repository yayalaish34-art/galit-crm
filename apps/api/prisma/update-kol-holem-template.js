/**
 * Update "בדיקת קול הולם אקוסטיקה" template with faithful original document content.
 * Run from apps/api:  node prisma/update-kol-holem-template.js
 */
require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  // Read HTML parts from files
  const tplDir = path.join(__dirname, '..', '..', 'tpl-kol-holem');
  const introHtml = fs.readFileSync(path.join(tplDir, 'intro.html'), 'utf-8');
  const bodyHtml = fs.readFileSync(path.join(tplDir, 'body.html'), 'utf-8');
  const closingHtml = fs.readFileSync(path.join(tplDir, 'closing.html'), 'utf-8');

  console.log('Loaded template parts:');
  console.log('  introHtml:', introHtml.length, 'chars');
  console.log('  bodyHtml:', bodyHtml.length, 'chars');
  console.log('  closingHtml:', closingHtml.length, 'chars');

  const existing = await prisma.quoteTemplate.findFirst({
    where: { name: 'בדיקת קול הולם אקוסטיקה' },
  });

  if (!existing) {
    console.error('ERROR: Template not found! Run insert-kol-holem-template.js first.');
    process.exit(1);
  }

  console.log('Updating template id=' + existing.id + '...');

  await prisma.quoteTemplate.update({
    where: { id: existing.id },
    data: {
      introHtml,
      bodyHtml,
      closingHtml,
      termsHtml: '',
    },
  });

  console.log('Updated successfully!');

  // Verify
  const verify = await prisma.quoteTemplate.findFirst({
    where: { id: existing.id },
    select: { id: true, name: true, serviceType: true, isActive: true, updatedAt: true },
  });
  console.log('\n=== VERIFICATION ===');
  console.log(JSON.stringify(verify, null, 2));
}

main()
  .catch((e) => { console.error('ERROR:', e.message); process.exit(1); })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
