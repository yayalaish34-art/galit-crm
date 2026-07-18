/**
 * READ-ONLY אבחון: סורק את כל ה-QuoteDocument (DOCX עם bytes) ובודק אילו מהם
 * מכילים טבלת חתימה *הפוכה* (הגרסה הישנה עם <w:bidiVisual/> וסדר עמודות חותמת→שם).
 * לא משנה כלום — רק סופר ומדווח. הרצה: railway run npx tsx scripts/check-sig-table-orientation.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const SIGNATURE_TABLE_MARKER = 'GALITSIGTABLE';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  const docs = await prisma.quoteDocument.findMany({
    where: { data: { not: null } },
    select: { id: true, quoteId: true, fileName: true, mimeType: true, data: true },
  });

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const PizZip = require('pizzip');

  let total = 0;
  let docx = 0;
  let withSigTable = 0;
  let reversed = 0;
  let correct = 0;
  const reversedIds: string[] = [];

  for (const d of docs) {
    total++;
    if (!d.data) continue;
    const buf = Buffer.from(d.data as any);
    // DOCX = ZIP (PK\x03\x04). דלג על PDF/אחר.
    if (!(buf[0] === 0x50 && buf[1] === 0x4b)) continue;
    let xml = '';
    try {
      const zip = new PizZip(buf);
      const f = zip.file('word/document.xml');
      if (!f) continue;
      xml = f.asText();
    } catch {
      continue;
    }
    docx++;
    if (!xml.includes(SIGNATURE_TABLE_MARKER)) continue;
    withSigTable++;

    // מצמצמים לטבלה עצמה (בין הסמנים, רק ה-<w:tbl>) — אחרת "חותמת" בפסקת האישור
    // ו-bidiVisual של טבלאות אחרות מזהמים את הזיהוי. הפוך = bidiVisual בטבלה, או
    // "חותמת" לפני "שם מלא" ב-OOXML של הטבלה.
    const first = xml.indexOf(SIGNATURE_TABLE_MARKER);
    const second = xml.indexOf(SIGNATURE_TABLE_MARKER, first + SIGNATURE_TABLE_MARKER.length);
    const outer = second !== -1 ? xml.slice(first, second + 200) : xml.slice(first);
    const tblStart = outer.indexOf('<w:tbl>');
    const tblEnd = outer.indexOf('</w:tbl>');
    const block = tblStart !== -1 && tblEnd !== -1 ? outer.slice(tblStart, tblEnd + 8) : outer;
    const hasBidiVisual = block.includes('<w:bidiVisual/>');
    const idxStamp = block.indexOf('חותמת');
    const idxName = block.indexOf('שם מלא');
    const stampBeforeName = idxStamp !== -1 && idxName !== -1 && idxStamp < idxName;

    if (hasBidiVisual || stampBeforeName) {
      reversed++;
      reversedIds.push(`${d.id} (quote ${d.quoteId}, ${d.fileName || '—'})`);
    } else {
      correct++;
    }
  }

  console.log('─────────────────────────────────────────────');
  console.log(`סה"כ QuoteDocument עם bytes:      ${total}`);
  console.log(`מתוכם DOCX תקינים:               ${docx}`);
  console.log(`עם טבלת חתימה (GALITSIGTABLE):   ${withSigTable}`);
  console.log(`  ✓ תקינים (שם→...):            ${correct}`);
  console.log(`  ✗ הפוכים (חותמת→שם / bidiVisual): ${reversed}`);
  console.log('─────────────────────────────────────────────');
  if (reversedIds.length) {
    console.log('מסמכים הפוכים:');
    reversedIds.forEach((s) => console.log('  - ' + s));
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
