/**
 * Install + activate CookieYes (GDPR/CCPA cookie consent banner) on galit.co.il.
 * Idempotent: if the plugin is already installed, just makes sure it's active.
 * Slug on wordpress.org: cookie-law-info
 */
const { wp } = require('./_wp-lib.cjs');

const PLUGIN_SLUG = 'cookie-law-info'; // CookieYes

async function call(site, auth, path, init = {}) {
  const res = await fetch(`${site}/wp-json${path}`, {
    ...init,
    headers: { Authorization: auth, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* */ }
  return { status: res.status, data, raw: text };
}

(async () => {
  const { site, auth } = await wp();
  console.log(`\nSite: ${site}`);

  // 1. אימות הרשאות
  const me = await call(site, auth, '/wp/v2/users/me?context=edit');
  if (me.status !== 200) {
    console.error('לא מצליח להתחבר ל-WP:', me.status, JSON.stringify(me.data).slice(0, 200));
    process.exit(1);
  }
  console.log(`מחובר כ: ${me.data.name} | roles: ${JSON.stringify(me.data.roles)}`);

  // 2. בדיקה אם הפלאגין כבר מותקן
  const list = await call(site, auth, '/wp/v2/plugins');
  if (!Array.isArray(list.data)) {
    console.error('אין הרשאת ניהול פלאגינים (install_plugins) — צריך משתמש Administrator.');
    console.error('תשובה:', list.status, JSON.stringify(list.data).slice(0, 200));
    process.exit(1);
  }
  const existing = list.data.find((p) => p.plugin && p.plugin.startsWith(`${PLUGIN_SLUG}/`));
  if (existing) {
    console.log(`\nכבר מותקן: ${existing.plugin} (status=${existing.status})`);
    if (existing.status !== 'active') {
      const upd = await call(site, auth, `/wp/v2/plugins/${encodeURIComponent(existing.plugin)}`, {
        method: 'POST',
        body: JSON.stringify({ status: 'active' }),
      });
      console.log('הופעל:', upd.status);
    } else {
      console.log('הפלאגין כבר פעיל — אין מה לעשות.');
    }
  } else {
    console.log(`\nמתקין ${PLUGIN_SLUG} מ-wordpress.org…`);
    const inst = await call(site, auth, '/wp/v2/plugins', {
      method: 'POST',
      body: JSON.stringify({ slug: PLUGIN_SLUG, status: 'active' }),
    });
    console.log('תשובת שרת:', inst.status);
    console.log('raw:', inst.raw.slice(0, 600));
    if (inst.status >= 300 || !inst.data) {
      console.error('ההתקנה נכשלה.');
      process.exit(1);
    }
    console.log('הותקן והופעל:', inst.data.plugin);
  }

  // 3. סיכום
  console.log('\n=== הבא בתור ===');
  console.log('היכנסי ל-wp-admin → CookieYes:');
  console.log('  • לבחור "Banner Appearance" ולוודא כפתורי Accept/Reject מופעלים');
  console.log('  • לבחור שפה עברית בהגדרות');
  console.log(`  • ${site}/wp-admin/admin.php?page=cookie-law-info`);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
