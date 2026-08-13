/**
 * מנקה את מטמון Elementor באתר (DELETE /elementor/v1/cache) ומאמת שסדר
 * הסקשנים ב-DB תואם למה שמרונדר בעמוד החי.
 *
 *   cd apps/api && npx railway run node scripts/wp-clear-elementor-cache.cjs
 *
 * נדרש אחרי כל עריכה של `_elementor_data` דרך ה-REST: וורדפרס מפעיל את
 * save_post (שבו Elementor מנקה מטמון) *לפני* שהוא כותב את המטא, ולכן העמוד
 * החי ממשיך להיות מרונדר מ-HTML ישן עד שמנקים במפורש.
 */
const crypto = require('crypto');
const { Client } = require('pg');

const VERIFY_PAGES = [3723, 3725, 3727, 3729, 3731, 3733, 3735, 3737, 3739, 3741];

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

function sectionInfo(tree) {
  return tree.map((s, i) => {
    let heading = null, gloss = false, blog = false;
    (function walk(els) {
      for (const el of els || []) {
        if (el.widgetType === 'heading' && !heading) heading = String((el.settings && el.settings.title) || '').replace(/<[^>]+>/g, '').trim();
        if (el.widgetType === 'html' && /galit-gloss/.test((el.settings && el.settings.html) || '')) gloss = true;
        if (Array.isArray(el.elements)) walk(el.elements);
      }
    })([s]);
    if ((s.settings && s.settings._element_id) === 'blog' || /בלוג/.test(heading || '')) blog = true;
    return { i, id: s.id, heading, gloss, blog };
  });
}

(async () => {
  const creds = await wpCreds();

  const res = await fetch(`${creds.siteUrl}/wp-json/elementor/v1/cache`, {
    method: 'DELETE',
    headers: { Authorization: creds.auth, 'Content-Type': 'application/json' },
  });
  console.log(`DELETE /elementor/v1/cache → ${res.status} ${(await res.text()).slice(0, 120)}`);

  for (const id of VERIFY_PAGES) {
    const page = await fetch(`${creds.siteUrl}/wp-json/wp/v2/pages/${id}?context=edit`, {
      headers: { Authorization: creds.auth },
    }).then((r) => r.json());
    const info = sectionInfo(JSON.parse(page.meta._elementor_data));
    const g = info.find((s) => s.gloss);
    const b = info.filter((s) => s.blog).pop();

    // סדר ההופעה בעמוד החי, לפי מיקום מזהי הסקשנים ב-HTML
    const html = await fetch(decodeURI(page.link)).then((r) => r.text());
    const gPos = html.indexOf(`elementor-element-${g ? g.id : '@'}`);
    const bPos = html.indexOf(`elementor-element-${b ? b.id : '@'}`);
    const ok = gPos > bPos && bPos >= 0;
    console.log(
      `[${id}] ${String(page.title.raw || '').trim().padEnd(12)} DB: gloss=${g ? g.i : '-'} blog=${b ? b.i : '-'} | live: gloss@${gPos} blog@${bPos} ${ok ? '✓ below' : '✗ NOT below'}`,
    );
  }
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
