/**
 * בודק ומגדיר את CookieYes: בדיקה שהבאנר מופיע + יש Accept + Reject.
 * CookieYes שומר הגדרות ב-options (wp_options) דרך ה-API שלו.
 */
const { wp } = require('./_wp-lib.cjs');

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

  // 1. בדוק אילו namespaces יש (יש API של cookieyes?)
  const root = await call(site, auth, '');
  const ns = root.data?.namespaces || [];
  console.log('\nNamespaces:', ns.join(', '));

  // 2. נסה להגיע ל-API של cookieyes
  const cyNs = ns.find(n => n.toLowerCase().includes('cookie'));
  if (cyNs) {
    console.log('\nנמצא namespace:', cyNs);
    const routes = await call(site, auth, `/${cyNs}`);
    console.log('Routes:', JSON.stringify(Object.keys(routes.data?.routes || {})).slice(0, 400));
  }

  // 3. קרא את ה-options של CookieYes דרך WP options API
  const opts = await call(site, auth, '/wp/v2/settings');
  console.log('\nSettings keys:', opts.status, opts.data ? Object.keys(opts.data).filter(k => k.includes('cookie') || k.includes('cli')).join(', ') : 'none');

  // 4. נסה לקרוא ישר את ה-option מה-DB דרך endpoint כללי
  const probeUrls = [
    '/cookieyeas/v1/settings',
    '/cookie-law-info/v1/settings',
    '/cli/v1/settings',
  ];
  for (const u of probeUrls) {
    const r = await call(site, auth, u);
    if (r.status < 400) {
      console.log(`\n${u} →`, r.status, JSON.stringify(r.data).slice(0, 600));
    }
  }
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
