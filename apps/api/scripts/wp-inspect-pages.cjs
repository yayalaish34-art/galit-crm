/** בדיקת עמודים ספציפיים לפני הסרה: מה יישאר בהם. PAGE_IDS=6540,6544 */
const crypto = require('crypto');
const { Client } = require('pg');

function decryptSecret(encoded) {
  const [ivHex, encHex] = String(encoded).split(':');
  const key = crypto.createHash('sha256').update(process.env.JWT_SECRET || '').digest();
  const d = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(ivHex, 'hex'));
  return Buffer.concat([d.update(Buffer.from(encHex, 'hex')), d.final()]).toString('utf8');
}

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const r = await client.query(`SELECT "value" FROM "SystemSetting" WHERE "key" = 'wordpress'`);
  await client.end();
  const v = typeof r.rows[0].value === 'string' ? JSON.parse(r.rows[0].value) : r.rows[0].value;
  const site = String(v.siteUrl).replace(/\/$/, '');
  const auth = 'Basic ' + Buffer.from(`${v.username}:${decryptSecret(v.appPasswordEnc)}`).toString('base64');

  for (const id of (process.env.PAGE_IDS || '').split(',').map((s) => Number(s.trim())).filter(Boolean)) {
    const p = await fetch(`${site}/wp-json/wp/v2/pages/${id}?context=edit`, { headers: { Authorization: auth } }).then((x) => x.json());
    const raw = (p.content && p.content.raw) || '';
    const elem = (p.meta && p.meta._elementor_data) || '';
    const start = raw.indexOf('<section class="galit-gloss"');
    console.log(`\n===== [${id}] ${String(p.title.raw || '').trim()} =====`);
    console.log(`link: ${decodeURIComponent(p.link)}`);
    console.log(`status=${p.status} template=${p.template || '-'} rawLen=${raw.length} elementorLen=${elem.length} editMode=${p.meta && p.meta._elementor_edit_mode}`);
    console.log(`glossary starts at char ${start} of ${raw.length}`);
    console.log(`--- content BEFORE the glossary (${start < 0 ? 0 : start} chars) ---`);
    console.log(start < 0 ? raw.slice(0, 500) : raw.slice(0, start));
  }
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
