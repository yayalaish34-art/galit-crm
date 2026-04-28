/**
 * מעתיק תגיות docxtemplater מתוך תבנית "מתויגת" לתוך DOCX שהומר מקובץ .doc (אותן סימניות ב-Word).
 *
 * אחרי עדכון הקובץ ב־`עבודה/...doc`:
 * 1) המרה ל־DOCX (Word: שמירה כ־, או PowerShell עם Word COM).
 * 2) הרצה:
 *    node scripts/inject-docx-bookmarks-from-tagged.js templates/kol-holem-acoustic-tagged-before-user-merge.docx templates/kol-holem-acoustic-source.docx templates/kol-holem-acoustic.docx
 *
 * שימוש כללי:
 *   node scripts/inject-docx-bookmarks-from-tagged.js <tagged.docx> <source.docx> <out.docx>
 */

const fs = require('fs');
const PizZip = require('pizzip');

function extractBookmarkInner(xml, name) {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const startRe = new RegExp(`<w:bookmarkStart[^>]*w:name="${esc}"[^>]*/>`);
  const sm = xml.match(startRe);
  if (!sm) return null;
  const startIdx = sm.index + sm[0].length;
  const idM = sm[0].match(/w:id="(\d+)"/);
  if (!idM) return null;
  const id = idM[1];
  const endTag = `<w:bookmarkEnd w:id="${id}"/>`;
  const endIdx = xml.indexOf(endTag, startIdx);
  if (endIdx === -1) return null;
  return { inner: xml.slice(startIdx, endIdx), startIdx, endIdx: endIdx + endTag.length, id };
}

function replaceBookmarkInner(xml, name, newInner) {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const startRe = new RegExp(`<w:bookmarkStart[^>]*w:name="${esc}"[^>]*/>`);
  const sm = xml.match(startRe);
  if (!sm) return { ok: false, xml };
  const startIdx = sm.index + sm[0].length;
  const idM = sm[0].match(/w:id="(\d+)"/);
  if (!idM) return { ok: false, xml };
  const id = idM[1];
  const endTag = `<w:bookmarkEnd w:id="${id}"/>`;
  const endIdx = xml.indexOf(endTag, startIdx);
  if (endIdx === -1) return { ok: false, xml };
  const out = xml.slice(0, startIdx) + newInner + xml.slice(endIdx);
  return { ok: true, xml: out };
}

const BOOKMARKS = [
  'fldCode',
  'fldKidomet',
  'fldCustName',
  'fldKtovet',
  'fldCity',
  'fldCellular',
  'fldEmail',
  'fldSochenName',
  'fldLine',
  'fldMakat',
  'fldProduct',
  'fldAmmount',
  'fldPrice',
  'fldLineDiscount',
  'fldLineTotal',
  'fldDiscount',
  'fldTotalAfterDiscount',
  'fldMAAM',
  'fldTotalAfterMaaM',
  'fldPaymentDesc',
  'fldTokef',
];

const [, , taggedPath, sourcePath, outPath] = process.argv;
if (!taggedPath || !sourcePath || !outPath) {
  console.error('Usage: node inject-docx-bookmarks-from-tagged.js <tagged.docx> <source.docx> <out.docx>');
  process.exit(1);
}

const taggedZip = new PizZip(fs.readFileSync(taggedPath));
const sourceZip = new PizZip(fs.readFileSync(sourcePath));
let docXml = sourceZip.file('word/document.xml').asText();
const taggedXml = taggedZip.file('word/document.xml').asText();

let n = 0;
for (const name of BOOKMARKS) {
  const ext = extractBookmarkInner(taggedXml, name);
  if (!ext) continue;
  const rep = replaceBookmarkInner(docXml, name, ext.inner);
  if (rep.ok) {
    docXml = rep.xml;
    n++;
  }
}

/** לולאת docxtemplater לשורות טבלה — לא בתוך bookmark */
const OPEN =
  '<w:r><w:rPr><w:rtl w:val="true"/></w:rPr><w:t xml:space="preserve">{#items}</w:t></w:r>';
const CLOSE =
  '<w:r><w:rPr><w:rtl w:val="true"/></w:rPr><w:t xml:space="preserve">{/items}</w:t></w:r>';

if (!docXml.includes('{#items}')) {
  docXml = docXml.replace(
    /<w:bookmarkStart w:id="17" w:name="fldLine"\/>/,
    `${OPEN}<w:bookmarkStart w:id="17" w:name="fldLine"/>`,
  );
}
if (!docXml.includes('{/items}')) {
  docXml = docXml.replace(
    /<w:bookmarkEnd w:id="23"\/><\/w:p><\/w:tc><\/w:tr><\/w:tbl><w:p w14:paraId="1168D9BE"/,
    `<w:bookmarkEnd w:id="23"/>${CLOSE}</w:p></w:tc></w:tr></w:tbl><w:p w14:paraId="1168D9BE"`,
  );
}

sourceZip.file('word/document.xml', docXml);
const buf = sourceZip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
fs.writeFileSync(outPath, buf);
console.log(`Wrote ${outPath}, replaced ${n} bookmarks, items loop: ${docXml.includes('{#items}')}.`);
