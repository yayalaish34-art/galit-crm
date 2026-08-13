/** סריקה בלבד: מיפוי כל העמודים — מילון קיים / Elementor / סקשן בלוג. */
const crypto = require('crypto');
const { Client } = require('pg');

function decryptSecret(encoded) {
  const [ivHex, encHex] = String(encoded).split(':');
  const key = crypto.createHash('sha256').update(process.env.JWT_SECRET || '').digest();
  const d = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(ivHex, 'hex'));
  return Buffer.concat([d.update(Buffer.from(encHex, 'hex')), d.final()]).toString('utf8');
}

async function wpCreds() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const r = await client.query(`SELECT "value" FROM "SystemSetting" WHERE "key" = 'wordpress'`);
  await client.end();
  const v = typeof r.rows[0].value === 'string' ? JSON.parse(r.rows[0].value) : r.rows[0].value;
  return {
    siteUrl: String(v.siteUrl).replace(/\/$/, ''),
    auth: 'Basic ' + Buffer.from(`${v.username}:${decryptSecret(v.appPasswordEnc)}`).toString('base64'),
  };
}

(async () => {
  const creds = await wpCreds();
  let page = 1;
  const rows = [];
  for (;;) {
    const res = await fetch(
      `${creds.siteUrl}/wp-json/wp/v2/pages?context=edit&per_page=100&page=${page}&status=publish,draft,private`,
      { headers: { Authorization: creds.auth } },
    );
    if (!res.ok) throw new Error(`WP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const batch = await res.json();
    if (!batch.length) break;
    for (const p of batch) {
      const raw = (p.content && p.content.raw) || '';
      const rendered = (p.content && p.content.rendered) || '';
      rows.push({
        id: p.id,
        parent: p.parent,
        status: p.status,
        title: String(p.title.raw || p.title.rendered || '').trim(),
        link: decodeURIComponent(p.link || ''),
        gloss: raw.includes('galit-gloss'),
        elementor: rendered.includes('elementor-') || raw.includes('elementor-'),
        blogSection: /בלוג/.test(raw) || /בלוג/.test(rendered),
        rawLen: raw.length,
      });
    }
    if (batch.length < 100) break;
    page++;
  }
  rows.sort((a, b) => a.parent - b.parent || a.id - b.id);
  console.log(`total pages: ${rows.length}`);
  console.log('id\tparent\tstatus\tgloss\telementor\tblog\trawLen\ttitle\tlink');
  for (const r of rows) {
    console.log(
      `${r.id}\t${r.parent}\t${r.status}\t${r.gloss ? 'GLOSS' : '-'}\t${r.elementor ? 'ELEM' : '-'}\t${r.blogSection ? 'BLOG' : '-'}\t${r.rawLen}\t${r.title}\t${r.link}`,
    );
  }
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
