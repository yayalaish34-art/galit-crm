/**
 * Fill the empty fldCode bookmark in the five acoustic contract templates.
 * Dry run: node scripts/fix-acoustic-quote-number.cjs
 * Apply:   node scripts/fix-acoustic-quote-number.cjs --apply
 *
 * Validates actual DOCX merges before changing anything. Backs up originals and
 * active overrides, then saves through the existing QuoteTemplateDocx mechanism
 * so the repair takes effect immediately and survives deployment.
 */
require('dotenv').config({ quiet: true });
require('ts-node/register/transpile-only');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');
const Zip = require('pizzip');
const { DocxMergeService } = require('../src/quote-templates/docx-merge.service');

const FILES = [
  'רעש-הצעת-מחיר-לבדיקה-אקוסטית-קול-הולם.docx',
  'רעש-הצעת-מחיר-לבדיקה-אקוסטית-קול-נישא-באוויר.docx',
  'רעש-הצעת-מחיר-לבדיקה-אקוסטית-רעש-משרברבות.docx',
  'רעש-הצעת-מחיר-לבדיקת-רעש-ממעלית.docx',
  'רעש-הצעת-מחיר-לבדיקת-רעש-סביבתית.docx',
];
const apply = process.argv.includes('--apply');
const merge = new DocxMergeService();
const textOf = (xml) => [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
  .map((m) => m[1]).join('');

function numberBookmark(xml) {
  const start = /<w:bookmarkStart\b(?=[^>]*\bw:name="fldCode")[^>]*\/>/.exec(xml);
  assert.ok(start, 'Missing fldCode bookmark');
  const id = /\bw:id="(\d+)"/.exec(start[0])?.[1];
  assert.ok(id, 'Unexpected bookmark id');
  const from = start.index + start[0].length;
  const end = new RegExp(`<w:bookmarkEnd\\b(?=[^>]*\\bw:id="${id}")[^>]*\\/>`).exec(xml.slice(from));
  assert.ok(end, 'Missing matching bookmark end');
  return { start: start.index, from, to: from + end.index };
}

function repair(bytes) {
  const zip = new Zip(bytes);
  const xml = zip.file('word/document.xml').asText();
  const b = numberBookmark(xml);
  const current = textOf(xml.slice(b.from, b.to)).trim();
  if (current === '{quoteNumber}') return bytes;
  assert.equal(xml.slice(b.from, b.to).trim(), '', 'Refusing to replace a nonempty bookmark');
  const runStart = Math.max(xml.lastIndexOf('<w:r>', b.start), xml.lastIndexOf('<w:r ', b.start));
  assert.ok(runStart >= 0, 'Missing contract label run');
  const labelRun = xml.slice(runStart, b.start);
  assert.match(textOf(labelRun), /סקר חוזה מס/);
  const rPr = labelRun.match(/<w:rPr\b[^>]*>[\s\S]*?<\/w:rPr>/)?.[0];
  assert.ok(rPr, 'Missing label formatting');
  const run = `<w:r>${rPr}<w:t xml:space="preserve"> {quoteNumber}</w:t></w:r>`;
  zip.file('word/document.xml', xml.slice(0, b.from) + run + xml.slice(b.from));
  const fixed = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });

  // The repair changes only the number run, preserving all other package parts.
  const before = new Zip(bytes);
  const after = new Zip(fixed);
  assert.deepEqual(Object.keys(after.files), Object.keys(before.files));
  for (const name of Object.keys(before.files)) {
    if (name !== 'word/document.xml' && !before.files[name].dir) {
      assert.ok(before.file(name).asNodeBuffer().equals(after.file(name).asNodeBuffer()), name);
    }
  }
  return fixed;
}

function validate(bytes) {
  for (const quoteNumber of ['15234', '99991']) {
    const merged = merge.mergeTemplateBytes(bytes, {
      quoteNumber,
      contractSurveyNumber: 'OTHER-REFERENCE',
      customerName: 'לקוח בדיקה',
      items: [],
    });
    const xml = new Zip(merged).file('word/document.xml').asText();
    const b = numberBookmark(xml);
    assert.equal(textOf(xml.slice(b.from, b.to)).trim(), quoteNumber);
    assert.ok(!xml.includes('{quoteNumber}'));
  }
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000 });
  await client.connect();
  try {
    const { rows } = await client.query(
      `SELECT t.id, t.name, t."docxTemplatePath", d."dataBase64", d."updatedAt", d."onedriveItemId"
       FROM "QuoteTemplate" t LEFT JOIN "QuoteTemplateDocx" d ON d."templateId" = t.id
       WHERE t."isActive" = true AND t."docxTemplatePath" = ANY($1::text[]) ORDER BY t.name`,
      [FILES],
    );
    assert.equal(rows.length, FILES.length, 'Expected exactly the five active templates');
    const plans = rows.map((row) => {
      const file = path.resolve('templates', row.docxTemplatePath);
      const original = fs.readFileSync(file);
      const active = row.dataBase64 ? Buffer.from(row.dataBase64, 'base64') : original;
      const fixedOriginal = repair(original);
      const fixedActive = repair(active);
      validate(fixedOriginal);
      validate(fixedActive);
      const changed = !fixedActive.equals(active);
      if (changed) assert.ok(!row.onedriveItemId, 'Template has a linked Word edit; inspect it before updating');
      console.log(`${changed ? 'REPAIR' : 'OK'}: ${row.name} — {quoteNumber}`);
      return { row, file, original, active, fixedOriginal, fixedActive, changed };
    });
    console.log('Validated two different quote numbers in all five templates; other document parts are unchanged.');
    if (!apply) return console.log('Dry run only. Use --apply to save.');
    const changes = plans.filter((p) => p.changed || !p.original.equals(p.fixedOriginal));
    if (!changes.length) return console.log('Already repaired; no writes needed.');

    const backup = path.resolve('../../../_backups', `acoustic-quote-number-${new Date().toISOString().replace(/[:.]/g, '-')}`);
    fs.mkdirSync(backup, { recursive: true });
    for (const p of changes) {
      fs.writeFileSync(path.join(backup, `${p.row.id}-original.docx`), p.original);
      fs.writeFileSync(path.join(backup, `${p.row.id}-active.docx`), p.active);
    }
    fs.writeFileSync(path.join(backup, 'manifest.json'), JSON.stringify(changes.map(({ row }) => ({
      templateId: row.id, name: row.name, path: row.docxTemplatePath,
      hadOverride: !!row.dataBase64, previousUpdatedAt: row.updatedAt,
    })), null, 2));

    await client.query('BEGIN');
    try {
      for (const p of changes.filter((p) => p.changed)) {
        const saved = await client.query(
          `INSERT INTO "QuoteTemplateDocx"
             (id, "templateId", "dataBase64", "sizeBytes", "updatedByName", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, now(), now())
           ON CONFLICT ("templateId") DO UPDATE SET
             "dataBase64" = EXCLUDED."dataBase64", "sizeBytes" = EXCLUDED."sizeBytes",
             "updatedById" = NULL, "updatedByName" = EXCLUDED."updatedByName", "updatedAt" = now()
           WHERE "QuoteTemplateDocx"."dataBase64" = $6`,
          [randomUUID(), p.row.id, p.fixedActive.toString('base64'), p.fixedActive.length,
            'Codex — תיקון מספר הצעה', p.row.dataBase64 ?? null],
        );
        assert.equal(saved.rowCount, 1, 'Template changed during repair; transaction rolled back');
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
    for (const p of changes) fs.writeFileSync(p.file, p.fixedOriginal);
    console.log(`Saved ${changes.length} templates. Backup: ${backup}`);
  } finally {
    await client.end();
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
