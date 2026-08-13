/**
 * מיפוי מדויק של סקשני "בלוג" והמילון ב-4 עמודי הקטגוריה:
 * ההגדרות המלאות של ווידג'ט posts (איך הוא שולף פוסטים) ושל ווידג'ט ה-HTML
 * (המילון). בנוסף: רשימת קטגוריות הפוסטים באתר והפוסטים האחרונים בכל אחת.
 * קריאה בלבד.
 */
const crypto = require('crypto');
const fs = require('fs');
const { Client } = require('pg');

const CATEGORY_PAGES = { 3731: 'ראדון', 3727: 'קרינה', 3737: 'מים', 3735: 'קרקע' };
const OUT = process.env.OUT_FILE || 'blog-widgets.json';

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
    categoryId: v.categoryId,
  };
}

async function wp(creds, path) {
  const res = await fetch(`${creds.siteUrl}/wp-json${path}`, { headers: { Authorization: creds.auth } });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { _raw: text.slice(0, 300), _status: res.status }; }
}

/** עובר על העץ ומחזיר כל ווידג'ט מסוג מבוקש, עם הנתיב אליו. */
function collect(tree, predicate, path = [], out = []) {
  tree.forEach((el, i) => {
    const p = [...path, i];
    if (predicate(el)) out.push({ path: p, el });
    if (Array.isArray(el.elements)) collect(el.elements, predicate, [...p, 'elements'], out);
  });
  return out;
}

(async () => {
  const creds = await wpCreds();
  const report = { categoryIdInSettings: creds.categoryId, wpCategories: [], pages: [], recentPosts: [] };

  // קטגוריות הפוסטים באתר
  const cats = await wp(creds, '/wp/v2/categories?per_page=100&orderby=count&order=desc');
  if (Array.isArray(cats)) {
    report.wpCategories = cats.map((c) => ({ id: c.id, name: c.name, slug: c.slug, count: c.count, parent: c.parent }));
  }

  // 15 הפוסטים האחרונים + הקטגוריות שלהם
  const posts = await wp(creds, '/wp/v2/posts?per_page=15&orderby=date&order=desc&status=publish');
  if (Array.isArray(posts)) {
    report.recentPosts = posts.map((p) => ({
      id: p.id, date: p.date, title: String(p.title.rendered || '').slice(0, 70),
      categories: p.categories, link: decodeURIComponent(p.link),
    }));
  }

  for (const [idStr, label] of Object.entries(CATEGORY_PAGES)) {
    const id = Number(idStr);
    const page = await wp(creds, `/wp/v2/pages/${id}?context=edit`);
    const tree = JSON.parse(page.meta._elementor_data);

    const postWidgets = collect(tree, (el) => el.widgetType === 'posts' || el.widgetType === 'archive-posts');
    const htmlWidgets = collect(tree, (el) => el.widgetType === 'html');
    const headings = collect(tree, (el) => el.widgetType === 'heading');

    report.pages.push({
      id,
      label,
      topLevelCount: tree.length,
      topLevelSections: tree.map((s, i) => ({
        index: i,
        id: s.id,
        anchor: (s.settings && s.settings._element_id) || null,
        // כותרת ראשונה בתוך הסקשן — לזיהוי מהיר
        firstHeading: (collect([s], (el) => el.widgetType === 'heading')[0]?.el.settings?.title) || null,
        hasPosts: collect([s], (el) => el.widgetType === 'posts').length,
        hasHtml: collect([s], (el) => el.widgetType === 'html').length,
      })),
      postWidgets: postWidgets.map((w) => ({
        path: w.path.join('.'),
        id: w.el.id,
        settings: w.el.settings,
      })),
      htmlWidgets: htmlWidgets.map((w) => ({
        path: w.path.join('.'),
        id: w.el.id,
        htmlLength: (w.el.settings && w.el.settings.html || '').length,
        htmlHead: (w.el.settings && w.el.settings.html || '').slice(0, 400),
        isGlossary: /galit-gloss/.test((w.el.settings && w.el.settings.html) || ''),
      })),
      headings: headings.map((h) => ({ id: h.el.id, title: h.el.settings && h.el.settings.title })),
    });
  }

  fs.writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8');
  console.log('wrote', OUT);
  for (const p of report.pages) {
    console.log(`\n=== ${p.id} ${p.label} ===`);
    for (const s of p.topLevelSections) {
      console.log(`  [${s.index}] ${s.id} anchor=${s.anchor || '-'} heading="${String(s.firstHeading || '').slice(0, 45)}" posts=${s.hasPosts} html=${s.hasHtml}`);
    }
  }
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
