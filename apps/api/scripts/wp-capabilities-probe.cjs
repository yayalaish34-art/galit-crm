/**
 * בדיקת יכולות מול האתר: מה ה-Application Password מרשה (רשימת פלאגינים =
 * הרשאת admin), האם meta של Elementor חשוף ב-REST, ומה יש ב-SystemSetting.
 * קריאה בלבד — לא כותב כלום.
 */
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
  console.log('SystemSetting[wordpress] keys:', Object.keys(v).join(', '));
  const site = String(v.siteUrl).replace(/\/$/, '');
  const auth = 'Basic ' + Buffer.from(`${v.username}:${decryptSecret(v.appPasswordEnc)}`).toString('base64');

  async function probe(label, path) {
    try {
      const res = await fetch(`${site}/wp-json${path}`, { headers: { Authorization: auth } });
      const text = await res.text();
      let data = null;
      try { data = JSON.parse(text); } catch { /* */ }
      return { label, status: res.status, data };
    } catch (e) {
      return { label, status: 'ERR', data: String(e.message) };
    }
  }

  // 1. מי אני ומה ההרשאות
  const me = await probe('me', '/wp/v2/users/me?context=edit');
  console.log('\n[me]', me.status, me.data && me.data.name, '| roles:', me.data && JSON.stringify(me.data.roles), '| caps:', me.data && me.data.capabilities ? Object.keys(me.data.capabilities).filter((c) => ['administrator', 'install_plugins', 'edit_theme_options', 'unfiltered_html', 'manage_options'].includes(c)).join(',') : '?');

  // 2. פלאגינים (דורש admin)
  const plugins = await probe('plugins', '/wp/v2/plugins');
  if (Array.isArray(plugins.data)) {
    console.log('\n[plugins]', plugins.status, plugins.data.length, 'installed:');
    for (const p of plugins.data) console.log(`  ${p.status === 'active' ? '●' : '○'} ${p.plugin} — ${String(p.name).slice(0, 60)}`);
  } else {
    console.log('\n[plugins]', plugins.status, JSON.stringify(plugins.data).slice(0, 200));
  }

  // 3. meta שחשוף ב-REST על עמוד
  const page = await probe('page-meta', '/wp/v2/pages/3727?context=edit');
  console.log('\n[page 3727 meta keys]', page.status, page.data && page.data.meta ? JSON.stringify(Object.keys(page.data.meta)) : 'no meta field');

  // 4. סוגי תוכן זמינים ב-REST (יש elementor_library?)
  const types = await probe('types', '/wp/v2/types');
  if (types.data && typeof types.data === 'object') {
    console.log('\n[types]', Object.keys(types.data).join(', '));
  }

  // 5. namespaces של ה-REST — פלאגינים עם API משלהם
  const root = await probe('root', '');
  if (root.data && root.data.namespaces) {
    console.log('\n[namespaces]', root.data.namespaces.join(', '));
  }
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
