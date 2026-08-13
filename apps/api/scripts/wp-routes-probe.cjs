/** מיפוי ה-routes של elementor ושל namespaces רלוונטיים, לאיתור נתיב לניקוי מטמון. */
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

  for (const ns of ['elementor/v1', 'elementor/v1/documents', 'elementor-pro/v1', 'oceanwp/v1', 'hfe/v1']) {
    const res = await fetch(`${site}/wp-json/${ns}`, { headers: { Authorization: auth } });
    const data = await res.json().catch(() => null);
    console.log(`\n### ${ns} (${res.status})`);
    if (data && data.routes) {
      for (const [route, def] of Object.entries(data.routes)) {
        const methods = (def.methods || []).join(',');
        console.log(`   ${methods.padEnd(22)} ${route}`);
      }
    } else {
      console.log('   ', JSON.stringify(data).slice(0, 200));
    }
  }

  // האם מטמון האלמנטים של Elementor קיים כמטא חשוף?
  const page = await fetch(`${site}/wp-json/wp/v2/pages/3731?context=edit`, { headers: { Authorization: auth } }).then((x) => x.json());
  const metaKeys = Object.keys(page.meta || {});
  console.log('\n### page 3731 meta keys with "elementor":', metaKeys.filter((k) => /elementor/i.test(k)).join(', '));
  console.log('### modified:', page.modified, '| modified_gmt:', page.modified_gmt);

  // סדר הסקשנים כפי שהוא כרגע ב-DB
  const tree = JSON.parse(page.meta._elementor_data);
  console.log('### current section order in DB:');
  tree.forEach((s, i) => {
    let heading = null, gloss = false;
    (function walk(els) {
      for (const el of els || []) {
        if (el.widgetType === 'heading' && !heading) heading = String((el.settings && el.settings.title) || '').replace(/<[^>]+>/g, '').trim();
        if (el.widgetType === 'html' && /galit-gloss/.test((el.settings && el.settings.html) || '')) gloss = true;
        if (Array.isArray(el.elements)) walk(el.elements);
      }
    })([s]);
    console.log(`   [${i}] ${s.id}${gloss ? ' GLOSS' : '      '} "${String(heading || '').slice(0, 40)}"`);
  });
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
