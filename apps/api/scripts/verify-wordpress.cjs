/**
 * אימות שרשרת החיבור לוורדפרס בדיוק כמו BlogService: קורא את SystemSetting,
 * מפענח את הסיסמה עם JWT_SECRET, ומבצע קריאת REST אמיתית עם Basic auth.
 *   cd apps/api && npx railway run node scripts/verify-wordpress.cjs
 */
const crypto = require('crypto');
const { Client } = require('pg');

function decryptSecret(encoded) {
  const [ivHex, encHex] = String(encoded).split(':');
  if (!ivHex || !encHex) return '';
  const key = crypto.createHash('sha256').update(process.env.JWT_SECRET || 'change-me-now').digest();
  const d = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(ivHex, 'hex'));
  return Buffer.concat([d.update(Buffer.from(encHex, 'hex')), d.final()]).toString('utf8');
}

(async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  const r = await client.query(`SELECT "value" FROM "SystemSetting" WHERE "key" = 'wordpress'`);
  await client.end();
  if (!r.rows.length) throw new Error('no wordpress row');

  const v = typeof r.rows[0].value === 'string' ? JSON.parse(r.rows[0].value) : r.rows[0].value;
  const pw = decryptSecret(v.appPasswordEnc);
  console.log('decrypt ok:', pw.length > 0, '| user:', v.username, '| site:', v.siteUrl, '| cat:', v.categoryId);

  const auth = Buffer.from(`${v.username}:${pw}`).toString('base64');
  const res = await fetch(`${v.siteUrl}/wp-json/wp/v2/users/me?context=edit`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  const me = await res.json();
  console.log('wp status:', res.status, '| roles:', JSON.stringify(me.roles), '| can publish:', !!me?.capabilities?.publish_posts);

  const cat = await fetch(`${v.siteUrl}/wp-json/wp/v2/posts?categories=${v.categoryId}&per_page=20&status=publish,draft&context=edit`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  const posts = await cat.json();
  console.log('list posts status:', cat.status, '| count:', posts.length);
  for (const p of posts) console.log('  -', p.id, p.status, '|', (p.title.raw || '').slice(0, 60));

  // SHOW_POST=<id> — הצצה לתוכן של פוסט מסוים (לבדוק שהמרת הבלוקים תקינה).
  if (process.env.SHOW_POST) {
    const one = await fetch(`${v.siteUrl}/wp-json/wp/v2/posts/${process.env.SHOW_POST}?context=edit`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    const p = await one.json();
    console.log('--- post', p.id, '---');
    console.log('title:', p.title.raw);
    console.log('excerpt:', p.excerpt.raw);
    console.log('content:\n' + String(p.content.raw || '').slice(0, 1800));
  }

  // מצב הניסוח האוטומטי היומי — מתי רץ לאחרונה ומה ממתין לאישור.
  const c2 = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c2.connect();
  const a = await c2.query(`SELECT "value" FROM "SystemSetting" WHERE "key" = 'blog_auto_draft'`);
  await c2.end();
  const st = a.rows.length ? (typeof a.rows[0].value === 'string' ? JSON.parse(a.rows[0].value) : a.rows[0].value) : null;
  console.log('auto-draft state:', st ? JSON.stringify({ lastRunDate: st.lastRunDate, topicIndex: st.topicIndex, pending: (st.pending || []).map((p) => p.postId) }) : '(none yet)');
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
