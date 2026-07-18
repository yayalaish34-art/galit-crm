/**
 * תיקון חד-פעמי: הופך את טבלת החתימה ההפוכה (גרסה ישנה עם <w:bidiVisual/> וסדר
 * חותמת→שם) לסדר הנכון (שם מלא→ת.ז→חתימה→חותמת) בכל ה-QuoteDocument הקיימים.
 *
 * שיטה: לכל DOCX עם טבלת חתימה הפוכה — פותחים את word/document.xml, מסירים את בלוק
 * החתימה הישן ב-stripSignatureTable(), ומזריקים מחדש את הבלוק המתוקן ב-appendSignatureTable()
 * (בדיוק אותו קוד שרץ בהפקה חדשה). כותבים חזרה את ה-bytes ל-DB.
 *
 * ריצה יבשה (ברירת מחדל):   railway run npx tsx scripts/fix-sig-table-orientation.ts
 * ריצה בפועל (כתיבה ל-DB):  railway run npx tsx scripts/fix-sig-table-orientation.ts --apply
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { stripSignatureTable, appendSignatureTable } from '../src/quote-templates/signature-table';

const SIGNATURE_TABLE_MARKER = 'GALITSIGTABLE';
const APPLY = process.argv.includes('--apply');
// תיקיית גיבוי — ה-bytes המקוריים נשמרים לפני כל כתיבה, כך שאפשר לשחזר.
const BACKUP_DIR = path.join(__dirname, '..', 'sig-table-backup');

function isDocx(buf: Buffer): boolean {
  return buf.length > 3 && buf[0] === 0x50 && buf[1] === 0x4b; // PK zip magic
}

/**
 * מחלץ את ה-<w:tbl> של בלוק החתימה בלבד (הטבלה שבין שני הסמנים). מחזיר null אם אין.
 * חשוב: מצמצמים לטבלה עצמה — אחרת מילת "חותמת" בפסקת האישור ("חותמת החברה") ו-bidiVisual
 * של טבלאות אחרות במסמך מזהמים את הזיהוי.
 */
function sigTableXml(xml: string): string | null {
  const first = xml.indexOf(SIGNATURE_TABLE_MARKER);
  if (first === -1) return null;
  const second = xml.indexOf(SIGNATURE_TABLE_MARKER, first + SIGNATURE_TABLE_MARKER.length);
  const block = second !== -1 ? xml.slice(first, second + 200) : xml.slice(first);
  const tblStart = block.indexOf('<w:tbl>');
  const tblEnd = block.indexOf('</w:tbl>');
  if (tblStart === -1 || tblEnd === -1) return null;
  return block.slice(tblStart, tblEnd + '</w:tbl>'.length);
}

/**
 * האם טבלת החתימה הפוכה. הזיהוי מצומצם לטבלה עצמה:
 *   - <w:bidiVisual/> בתוך הטבלה → הגרסה הישנה שמתהפכת ב-render (הבעיה).
 *   - או "חותמת" מופיע לפני "שם מלא" בתוך ה-OOXML של הטבלה (סדר עמודות הפוך).
 */
function isReversed(xml: string): boolean {
  const tbl = sigTableXml(xml);
  if (!tbl) return false;
  if (tbl.includes('<w:bidiVisual/>')) return true;
  const idxStamp = tbl.indexOf('חותמת');
  const idxName = tbl.indexOf('שם מלא');
  return idxStamp !== -1 && idxName !== -1 && idxStamp < idxName;
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const PizZip = require('pizzip');

  const docs = await prisma.quoteDocument.findMany({
    where: { data: { not: null } },
    select: { id: true, quoteId: true, fileName: true, data: true },
  });

  let scanned = 0;
  let fixed = 0;
  let skipped = 0;
  let failed = 0;
  const failures: string[] = [];

  for (const d of docs) {
    if (!d.data) continue;
    const buf = Buffer.from(d.data as any);
    if (!isDocx(buf)) continue;
    scanned++;

    try {
      const zip = new PizZip(buf);
      const f = zip.file('word/document.xml');
      if (!f) { skipped++; continue; }
      const xml: string = f.asText();

      if (!xml.includes(SIGNATURE_TABLE_MARKER)) { skipped++; continue; }
      if (!isReversed(xml)) { skipped++; continue; }

      // מסירים את הבלוק הישן ואז מזריקים מחדש את המתוקן (אותו קוד כמו בהפקה).
      const stripped = stripSignatureTable(xml);
      if (stripped.includes(SIGNATURE_TABLE_MARKER)) {
        // ההסרה נכשלה (מבנה לא צפוי) — לא נוגעים כדי לא להשחית.
        failed++;
        failures.push(`${d.id} (${d.fileName || '—'}): strip left marker`);
        continue;
      }
      const rebuilt = appendSignatureTable(stripped);
      if (!rebuilt.includes(SIGNATURE_TABLE_MARKER) || isReversed(rebuilt)) {
        failed++;
        failures.push(`${d.id} (${d.fileName || '—'}): rebuild verify failed`);
        continue;
      }

      if (APPLY) {
        // גיבוי ה-bytes המקוריים לפני הכתיבה (לשחזור במקרה הצורך).
        if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
        fs.writeFileSync(path.join(BACKUP_DIR, `${d.id}.docx`), buf);

        zip.file('word/document.xml', rebuilt);
        const out: Buffer = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
        await prisma.quoteDocument.update({ where: { id: d.id }, data: { data: out } });
      }
      fixed++;
    } catch (e: any) {
      failed++;
      failures.push(`${d.id} (${d.fileName || '—'}): ${e?.message || e}`);
    }
  }

  console.log('─────────────────────────────────────────────');
  console.log(APPLY ? 'מצב: כתיבה בפועל (--apply)' : 'מצב: ריצה יבשה (ללא שינוי)');
  console.log(`DOCX שנסרקו:        ${scanned}`);
  console.log(`תוקנו${APPLY ? '' : ' (יתוקנו)'}:          ${fixed}`);
  console.log(`דולגו (תקינים/ללא): ${skipped}`);
  console.log(`נכשלו (לא נגעו):    ${failed}`);
  console.log('─────────────────────────────────────────────');
  if (failures.length) {
    console.log('כשלים:');
    failures.forEach((s) => console.log('  - ' + s));
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
