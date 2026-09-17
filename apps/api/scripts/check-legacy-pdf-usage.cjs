/** האם מסלול generatePdf (PDFKit) יצר קבצים בחלון התקלה? pdfPath מתעדכן רק שם. */
const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    const r = await c.query(
      `SELECT COUNT(*)::int AS n, MAX("updatedAt") AS last FROM "Quote"
        WHERE "pdfPath" IS NOT NULL AND "updatedAt" >= '2026-08-16 13:50'::timestamp`,
    );
    console.log(`quotes with pdfPath touched during the broken window: ${r.rows[0].n} (last: ${r.rows[0].last})`);
  } finally { await c.end(); }
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
