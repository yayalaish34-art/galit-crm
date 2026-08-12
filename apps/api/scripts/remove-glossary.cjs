/**
 * מסיר בלוק "מילון מונחים" שנוסף לסוף התוכן של עמוד (הפעולה ההפוכה ל-add-glossary).
 *   cd apps/api && PAGE_ID=4822 npx railway run node scripts/remove-glossary.cjs
 */
const crypto = require('crypto');
const { Client } = require('pg');

function decryptSecret(encoded) {
  const [ivHex, encHex] = String(encoded).split(':');
  const key = crypto.createHash('sha256').update(process.env.JWT_SECRET || '').digest();
  const d = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(ivHex, 'hex'));
  return Buffer.concat([d.update(Buffer.from(encHex, 'hex')), d.final()]).toString('utf8');
}

(async () => {
  const pageId = Number(process.env.PAGE_ID);
  if (!pageId) throw new Error('PAGE_ID is required');

  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const r = await client.query(`SELECT "value" FROM "SystemSetting" WHERE "key" = 'wordpress'`);
  await client.end();
  const v = typeof r.rows[0].value === 'string' ? JSON.parse(r.rows[0].value) : r.rows[0].value;
  const site = String(v.siteUrl).replace(/\/$/, '');
  const auth = 'Basic ' + Buffer.from(`${v.username}:${decryptSecret(v.appPasswordEnc)}`).toString('base64');

  const get = await fetch(`${site}/wp-json/wp/v2/pages/${pageId}?context=edit`, { headers: { Authorization: auth } });
  const page = await get.json();
  const raw = page.content.raw || '';
  const i = raw.indexOf('<section class="galit-gloss"');
  if (i < 0) {
    console.log(`nothing to remove on page ${pageId}`);
    return;
  }
  const cleaned = raw.slice(0, i).replace(/\s+$/, '');
  const put = await fetch(`${site}/wp-json/wp/v2/pages/${pageId}`, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ content: cleaned }),
  });
  if (!put.ok) throw new Error(`WP ${put.status}: ${(await put.text()).slice(0, 200)}`);
  console.log(`removed from page ${pageId}: ${raw.length} -> ${cleaned.length} chars`);
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
