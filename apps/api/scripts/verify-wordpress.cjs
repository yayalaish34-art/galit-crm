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

  const cat = await fetch(`${v.siteUrl}/wp-json/wp/v2/posts?categories=${v.categoryId}&per_page=1&status=publish,draft&context=edit`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  console.log('list posts status:', cat.status, '| count:', (await cat.json()).length);
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
