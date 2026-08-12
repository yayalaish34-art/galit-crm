/**
 * משייך בלוגים קיימים לקטגוריית הנושא שלהם, כדי שיופיעו בסקשן "בלוג" של עמוד
 * השירות הכללי ולא רק בעמוד /blog.
 *
 *   cd apps/api
 *   DRY_RUN=1 npx railway run node scripts/backfill-blog-topics.cjs   # תצוגה מקדימה
 *   npx railway run node scripts/backfill-blog-topics.cjs             # כתיבה
 *
 * רץ רק על פוסטים שנמצאים בקטגוריה "בלוגים" (226) ואין להם עדיין אף קטגוריית
 * נושא. הנושא נבחר לפי מילות מפתח בכותרת/בתקציר; פוסט שלא מזוהה בוודאות מדווח
 * ולא נגוע — עדיף להשאיר אותו למנהל מאשר לתייג אותו לעמוד הלא נכון.
 */
const crypto = require('crypto');
const { Client } = require('pg');

const DRY_RUN = process.env.DRY_RUN === '1';
const BLOGS_CATEGORY = 226;

/** אותו מיפוי כמו BLOG_TOPICS ב-blog.service.ts, עם מילות זיהוי. */
const TOPICS = [
  { categoryId: 99, label: 'ראדון', page: 'ראדון', patterns: [/ראדון/] },
  { categoryId: 85, label: 'קרינה', page: 'קרינה', patterns: [/קרינה/, /אלקטרומגנט/, /\bELF\b/i, /אנטנ/, /סלולר/] },
  { categoryId: 102, label: 'איכות מים', page: 'מים', patterns: [/מי שתי/, /איכות מים/, /בדיקת מים/, /מי תהום/, /שפכים/] },
  { categoryId: 101, label: 'קרקעות מזוהמות', page: 'קרקע', patterns: [/קרקע/, /זיהום קרקע/, /גז קרקע/] },
  { categoryId: 100, label: 'רעש ואקוסטיקה', page: 'רעש', patterns: [/רעש/, /אקוסט/, /דציבל/] },
  { categoryId: 103, label: 'איכות אוויר', page: 'אויר', patterns: [/איכות אוויר/, /איכות אויר/, /פורמלדהיד/, /עובש/, /מזהמים באוויר/] },
  { categoryId: 97, label: 'ריח', page: 'ריח', patterns: [/ריח/, /מפגע ריח/] },
  { categoryId: 104, label: 'אסבסט', page: 'אסבסט', patterns: [/אסבסט/] },
  { categoryId: 98, label: 'הדברה', page: 'הדברה', patterns: [/הדבר/, /מזיקים/, /יונים/, /מכרסמים/] },
  { categoryId: 170, label: 'בנייה ירוקה', page: 'בנייה ירוקה', patterns: [/בנייה ירוקה/, /בניה ירוקה/, /5281/, /דירוג אנרגט/] },
];
const TOPIC_IDS = new Set(TOPICS.map((t) => t.categoryId));

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
    categoryId: Number(v.categoryId) || BLOGS_CATEGORY,
  };
}

async function wp(creds, path, init) {
  const res = await fetch(`${creds.siteUrl}/wp-json${path}`, {
    ...init,
    headers: { Authorization: creds.auth, 'Content-Type': 'application/json; charset=utf-8', ...(init?.headers || {}) },
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* */ }
  if (!res.ok) throw new Error(`WP ${res.status} on ${path}: ${(data && data.message) || text.slice(0, 200)}`);
  return data;
}

const strip = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ');

const countMatches = (re, s) => (s.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')) || []).length;

/**
 * מנקד כל נושא לפי מספר ההופעות, כשהכותרת שוקלת פי 5.
 *
 * ספירת *הופעות* ולא "האם הפועה" היא מה שמפריד בין הנושא האמיתי לאזכור אגב:
 * מאמר על ראדון מזכיר "קרינה" פעם אחת, ובספירה בינארית זה היה תיקו.
 * מחזיר נושא רק כשהוא מוביל בפער ברור — אחרת עדיף שהמנהל יתייג ידנית מאשר
 * שהבלוג יופיע בעמוד השירות הלא נכון.
 */
function detectTopic(title, body) {
  const scored = TOPICS.map((t) => ({
    t,
    score: t.patterns.reduce((n, re) => n + countMatches(re, title) * 5 + countMatches(re, body), 0),
  }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  if (!scored.length) return null;
  const [first, second] = scored;
  if (second && first.score < second.score * 1.5) return null; // אין מוביל ברור
  return first.t;
}

(async () => {
  const creds = await wpCreds();
  const posts = await wp(creds, `/wp/v2/posts?categories=${creds.categoryId}&per_page=100&context=edit&status=publish,draft,pending,future`);

  let matched = 0, skipped = 0, already = 0;
  for (const p of posts) {
    const title = strip(p.title.raw || p.title.rendered);
    const existing = (p.categories || []).map(Number);
    if (existing.some((c) => TOPIC_IDS.has(c))) {
      already++;
      console.log(`HAVE  [${p.id}] ${title.slice(0, 55)}`);
      continue;
    }
    const body = `${strip(p.excerpt && p.excerpt.raw)} ${strip(p.content && p.content.raw).slice(0, 4000)}`;
    const topic = detectTopic(title, body);
    if (!topic) {
      skipped++;
      console.log(`?     [${p.id}] ${title.slice(0, 55)} — no clear topic, left for manual tagging`);
      continue;
    }
    matched++;
    console.log(`TAG   [${p.id}] ${title.slice(0, 55)} → ${topic.label} (עמוד ${topic.page})`);
    if (!DRY_RUN) {
      await wp(creds, `/wp/v2/posts/${p.id}`, {
        method: 'POST',
        body: JSON.stringify({ categories: [...new Set([...existing, topic.categoryId])] }),
      });
    }
  }

  console.log(`\n${posts.length} posts in "בלוגים" · ${already} already tagged · ${matched} ${DRY_RUN ? 'would be' : ''} tagged · ${skipped} need manual tagging`);
  if (DRY_RUN) console.log('DRY_RUN — nothing written.');
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
