/**
 * מיפוי מלא: לכל עמוד קטגוריה באתר — האם הוא בנוי ב-Elementor, איפה סקשן
 * הבלוג (ואיזו קטגוריית פוסטים הוא שולף), ואיפה ווידג'ט המילון. קריאה בלבד.
 */
const crypto = require('crypto');
const fs = require('fs');
const { Client } = require('pg');

// עמודי הקטגוריה (parent=0 שיש להם עמודי-בן, מתוך סריקת האתר)
const CATEGORY_PAGES = {
  3731: 'ראדון', 3727: 'קרינה', 3737: 'מים', 3735: 'קרקע',
  3733: 'רעש', 3725: 'ריח', 3729: 'הדברה', 3739: 'אויר',
  3741: 'אסבסט', 3723: 'בנייה ירוקה',
};
const OUT = process.env.OUT_FILE || 'all-categories.json';

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

async function wp(creds, path) {
  const res = await fetch(`${creds.siteUrl}/wp-json${path}`, { headers: { Authorization: creds.auth } });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { _status: res.status, _raw: text.slice(0, 200) }; }
}

function walk(els, fn, path = []) {
  els.forEach((el, i) => {
    fn(el, [...path, i]);
    if (Array.isArray(el.elements)) walk(el.elements, fn, [...path, i, 'elements']);
  });
}

(async () => {
  const creds = await wpCreds();
  const report = { categories: [], pages: [] };

  let page = 1;
  for (;;) {
    const batch = await wp(creds, `/wp/v2/categories?per_page=100&page=${page}`);
    if (!Array.isArray(batch) || !batch.length) break;
    report.categories.push(...batch.map((c) => ({ id: c.id, name: c.name, count: c.count, parent: c.parent })));
    if (batch.length < 100) break;
    page++;
  }

  for (const [idStr, label] of Object.entries(CATEGORY_PAGES)) {
    const id = Number(idStr);
    const p = await wp(creds, `/wp/v2/pages/${id}?context=edit`);
    const raw = p.meta && p.meta._elementor_data;
    const entry = { id, label, isElementor: !!raw, rawContentHasGloss: /galit-gloss/.test((p.content && p.content.raw) || '') };
    if (raw) {
      const tree = JSON.parse(raw);
      entry.sections = tree.map((s, i) => {
        let heading = null, postTerms = [], hasGloss = false, postWidgets = [];
        walk([s], (el) => {
          if (el.widgetType === 'heading' && !heading) heading = String(el.settings?.title || '').replace(/<[^>]+>/g, '').trim();
          if (el.widgetType === 'posts') {
            const t = el.settings?.posts_include_term_ids || el.settings?.posts_category_ids || [];
            postWidgets.push({ id: el.id, terms: [].concat(t).map(Number) });
            postTerms.push(...[].concat(t).map(Number));
          }
          if (el.widgetType === 'html' && /galit-gloss/.test(el.settings?.html || '')) hasGloss = true;
        });
        return { index: i, id: s.id, anchor: s.settings?._element_id || null, heading, postWidgets, hasGloss };
      });
      entry.glossIndex = entry.sections.findIndex((s) => s.hasGloss);
      // סקשן הבלוג = האחרון שהכותרת שלו מכילה "בלוג", אחרת עוגן #blog
      entry.blogIndex = entry.sections.reduce((acc, s, i) =>
        (s.anchor === 'blog' || /בלוג/.test(s.heading || '')) ? i : acc, -1);
    }
    report.pages.push(entry);
  }

  fs.writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8');
  const byId = new Map(report.categories.map((c) => [c.id, c.name]));
  for (const p of report.pages) {
    console.log(`\n=== ${p.id} ${p.label} elementor=${p.isElementor} glossInRawContent=${p.rawContentHasGloss} glossSection=${p.glossIndex} blogSection=${p.blogIndex}`);
    for (const s of p.sections || []) {
      const terms = s.postWidgets.flatMap((w) => w.terms).map((t) => `${t}:${byId.get(t) || '?'}`).join(', ');
      console.log(`   [${s.index}]${s.hasGloss ? ' GLOSS' : '      '} anchor=${s.anchor || '-'} "${String(s.heading || '').slice(0, 38)}" ${terms ? '→ ' + terms : ''}`);
    }
  }
  console.log('\nwrote', OUT);
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
