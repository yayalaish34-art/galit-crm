/**
 * בדיקה לקראת העברת המילון לעמודי הקטגוריה: לכל אחד מ-4 העמודים הכלליים —
 * האם ה-raw content מרונדר בעמוד החי (עמוד Elementor מרנדר _elementor_data
 * ולא post_content, ואז כתיבה ל-REST לא תעזור), ואיפה מופיע סקשן הבלוג.
 * וגם: רשימה מלאה של כל העמודים שיש בהם מילון (galit-gloss).
 */
const crypto = require('crypto');
const fs = require('fs');
const { Client } = require('pg');

const OUT = process.env.OUT_FILE || 'glossary-inspect.json';
const CATEGORY_PAGES = [3731, 3727, 3737, 3735]; // ראדון, קרינה, מים, קרקע

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
  if (!res.ok) throw new Error(`WP ${res.status} on ${path}`);
  return res.json();
}

/** קטע ייחודי מה-raw (ללא תגיות/רווחים מרובים) לבדיקה מול העמוד החי. */
function distinctiveSnippets(raw, n) {
  const text = String(raw).replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
  const words = text.split(' ').filter((w) => w.length > 2);
  const out = [];
  for (let i = 10; i < words.length - 6 && out.length < n; i += Math.ceil(words.length / (n + 1))) {
    out.push(words.slice(i, i + 5).join(' '));
  }
  return out;
}

(async () => {
  const creds = await wpCreds();
  const report = { categories: [], glossaryPages: [] };

  for (const id of CATEGORY_PAGES) {
    const p = await wp(creds, `/wp/v2/pages/${id}?context=edit`);
    const raw = p.content.raw || '';
    const live = await (await fetch(p.link)).text();
    const liveText = live.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ');

    const snippets = distinctiveSnippets(raw, 4);
    const foundInLive = snippets.map((s) => liveText.includes(s));

    // ההקשר סביב "בלוג" ב-raw — כדי לדעת אחרי מה מוסיפים.
    const blogContexts = [];
    let idx = -1;
    while ((idx = raw.indexOf('בלוג', idx + 1)) >= 0 && blogContexts.length < 5) {
      blogContexts.push(raw.slice(Math.max(0, idx - 200), idx + 300));
    }

    report.categories.push({
      id,
      title: String(p.title.raw || '').trim(),
      link: decodeURIComponent(p.link),
      rawLen: raw.length,
      rawTail: raw.slice(-600),
      snippets,
      foundInLive,
      liveHasElementorBody: /elementor-page|elementor-kit/.test(live),
      blogInRaw: blogContexts,
      blogInLive: liveText.includes('בלוג'),
    });
  }

  // כל העמודים עם מילון.
  let page = 1;
  for (;;) {
    const batch = await wp(creds, `/wp/v2/pages?context=edit&per_page=100&page=${page}&status=publish,draft,private`);
    if (!batch.length) break;
    for (const p of batch) {
      const raw = (p.content && p.content.raw) || '';
      if (raw.includes('galit-gloss')) {
        report.glossaryPages.push({ id: p.id, parent: p.parent, status: p.status, title: String(p.title.raw || '').trim(), link: decodeURIComponent(p.link) });
      }
    }
    if (batch.length < 100) break;
    page++;
  }

  fs.writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8');
  console.log(`wrote ${OUT}: ${report.categories.length} categories, ${report.glossaryPages.length} glossary pages`);
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
