/** בדיקה: אילו QuoteTemplate מצביעים על קובץ DOCX, וכמה מהם קיימים בפועל. */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const r = await c.query(
    `SELECT id, name, "serviceType", "isActive", "docxTemplatePath"
       FROM "QuoteTemplate" ORDER BY "isActive" DESC, name`,
  );
  await c.end();

  const dir = path.resolve(process.cwd(), 'templates');
  const withDocx = r.rows.filter((x) => x.docxTemplatePath);
  const missing = withDocx.filter((x) => !fs.existsSync(path.resolve(dir, x.docxTemplatePath)));
  const uniquePaths = new Set(withDocx.map((x) => x.docxTemplatePath));

  console.log(`QuoteTemplate rows      : ${r.rows.length}`);
  console.log(`  active                : ${r.rows.filter((x) => x.isActive).length}`);
  console.log(`  with docxTemplatePath : ${withDocx.length}`);
  console.log(`  unique docx paths     : ${uniquePaths.size}  (shared paths = ${withDocx.length - uniquePaths.size})`);
  console.log(`  file missing on disk  : ${missing.length}`);
  if (missing.length) for (const m of missing.slice(0, 10)) console.log(`      ! ${m.name} → ${m.docxTemplatePath}`);
  console.log('\nfirst 10 with docx:');
  for (const x of withDocx.slice(0, 10)) console.log(`  ${x.isActive ? '●' : '○'} ${x.name}  →  ${x.docxTemplatePath}`);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
