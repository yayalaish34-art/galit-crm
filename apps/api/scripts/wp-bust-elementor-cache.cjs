/**
 * מנקה את מטמון ה-HTML של Elementor בעמודים שנערכו דרך REST.
 *
 *   cd apps/api && PAGE_IDS=3731 npx railway run node scripts/wp-bust-elementor-cache.cjs
 *   cd apps/api && npx railway run node scripts/wp-bust-elementor-cache.cjs   # כל עמודי הקטגוריה
 *
 * למה זה נדרש: בעדכון REST שמכיל רק `meta`, וורדפרס קורא ל-wp_update_post
 * (ומפעיל את save_post, שבו Elementor מנקה מטמון) *לפני* שהוא כותב את המטא.
 * התוצאה: המטמון נוקה מול הנתונים הישנים ואז נכתבו החדשים — והעמוד החי נשאר
 * מרונדר בסדר הישן. שמירה שנייה, שמעדכנת שדה פוסט רגיל בערכו הקיים, מפעילה
 * את ה-hook שוב — הפעם כשהנתונים כבר מעודכנים.
 */
const crypto = require('crypto');
const { Client } = require('pg');

const DEFAULT_IDS = [3723, 3725, 3727, 3729, 3731, 3733, 3735, 3737, 3739, 3741];

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

(async () => {
  const ids = (process.env.PAGE_IDS || '').trim()
    ? process.env.PAGE_IDS.split(',').map((s) => Number(s.trim())).filter(Boolean)
    : DEFAULT_IDS;
  const creds = await wpCreds();

  for (const id of ids) {
    const page = await wp(creds, `/wp/v2/pages/${id}?context=edit`);
    // menu_order בערכו הקיים: מפעיל wp_update_post בלי לשנות שום תוכן.
    await wp(creds, `/wp/v2/pages/${id}`, {
      method: 'POST',
      body: JSON.stringify({ menu_order: Number(page.menu_order) || 0 }),
    });
    console.log(`touched [${id}] ${String(page.title.raw || '').trim()} (menu_order=${Number(page.menu_order) || 0})`);
  }
  console.log(`\ndone — ${ids.length} page(s)`);
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
